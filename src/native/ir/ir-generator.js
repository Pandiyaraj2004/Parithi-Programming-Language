/**
 * IRGenerator — AST → three-address-code IR (`ir-nodes.js`). Structurally
 * this mirrors `src/bytecode/bytecode-generator.js`'s own generator
 * exactly (one method per node type, a `CompileScope` chain for
 * mangled-slot shadowing, a `loopStack` for break/continue, predeclare-
 * then-compile for tasks) — that generator already solves "AST → a
 * linear, label/jump-based instruction sequence" correctly for the whole
 * language; this file re-derives the same proven answers for a
 * three-address-code shape instead of a stack-machine one, rather than
 * inventing a second, independently-verified approach.
 *
 * SUPPORTED SUBSET (matches the brief's own "initially support" list —
 * intentionally not the *entire* language, same "small subset first"
 * discipline the native x86-64 backend itself already follows):
 * variable declaration/assignment, constants, arithmetic, comparison,
 * boolean (`and`/`or`/`not`), unary (`-`), variable references, function
 * calls, `return`, `if`/`else`, `while`, `repeat`, `break`/`continue`,
 * `say`, `task` definitions. NOT YET LOWERED: `choose`, `stop`, Arrays
 * (`box`) — each raises a clear `Error` naming the construct, never a
 * silently-wrong IR (extend `compileStatement`/`compileExpression` to add
 * one, following any existing case as a template).
 *
 * Design notes worth stating explicitly:
 *   - A bare variable reference compiles to a `var` OPERAND directly, with
 *     no `LOAD` instruction — matching the brief's own worked example
 *     (`t5 = MUL x, t4`, `x` used bare, not loaded into a temp first).
 *   - A literal DOES get its own `CONST` instruction into a fresh temp —
 *     also matching the brief's own example — which is what gives
 *     Constant Folding/Propagation real instructions to operate on.
 *   - `and`/`or` are short-circuiting (§13.7) and are lowered to real
 *     branches across multiple basic blocks (never an eager "AND"
 *     instruction) — evaluating the right-hand side eagerly would be an
 *     actual behavior change (a skipped side effect, or an avoided
 *     runtime error) matching exactly how `bytecode-generator.js`'s own
 *     `compileShortCircuit` already has to handle this.
 *   - No SSA/phi nodes: branches that need to converge on one value (the
 *     short-circuit result, a function's various `return` points) use a
 *     hidden, uniquely-mangled variable instead — deliberately simpler,
 *     per this phase's own "avoid SSA in the first version" instruction.
 */

import { NodeType } from '../../ast/ast-nodes.js';
import {
  IrOp, IRInstruction, BasicBlock, IRFunction, IRProgram,
  temp, variable, constant,
} from './ir-nodes.js';

/** One compile-time lexical scope — name → mangled-slot map only, no runtime existence. Identical shape/purpose to bytecode-generator.js's own CompileScope. */
class IRCompileScope {
  constructor(parent = null) {
    this.parent = parent;
    this.names = new Map();
  }

  declare(name, mangled) {
    this.names.set(name, mangled);
  }

  resolve(name) {
    if (this.names.has(name)) return this.names.get(name);
    if (this.parent) return this.parent.resolve(name);
    return undefined;
  }
}

const BINARY_OPS = Object.freeze({
  '+': IrOp.ADD, '-': IrOp.SUB, '*': IrOp.MUL, '/': IrOp.DIV, '%': IrOp.MOD, '**': IrOp.POW,
  '==': IrOp.EQ, '!=': IrOp.NE, '>': IrOp.GT, '<': IrOp.LT, '>=': IrOp.GE, '<=': IrOp.LE,
});

// §36 (Unified Loop Model) adds NodeType.LOOP_EXPRESSION here — a bare
// "loop" is entirely new to the IR generator, and is deliberately left
// unsupported for now, exactly like choose/stop/box already are: this is
// unreachable from the real --native CLI path anyway (native-codegen.js's
// own AST-level gate already rejects every loop construct — old or new —
// before generateIR() is ever called), so this only matters to direct
// unit tests exercising the IR generator in isolation, which is exactly
// what the existing choose/stop/box precedent is for.
const UNSUPPORTED = new Set([NodeType.CHOOSE_STATEMENT, NodeType.STOP_STATEMENT, NodeType.ARRAY_LITERAL, NodeType.ARRAY_ACCESS, NodeType.ARRAY_ASSIGNMENT, NodeType.INPUT_EXPRESSION, NodeType.LOOP_EXPRESSION]);

export class IRGenerator {
  constructor() {
    this.program = new IRProgram();
    this.scope = new IRCompileScope(); // global scope, never popped
    this.nextSlotId = 0;
    this.nextLabelId = 0;
    this.loopStack = []; // [{ breakBlock, continueBlock }] — innermost last
    this.functionStack = []; // [{ irFunction, nextTempId, currentBlock }] — innermost (currently-compiling) last
  }

  /** @param {object} program - the parsed + semantically-analyzed Program AST node */
  generate(program) {
    const main = this.beginFunction('$main', [], program);
    this.compileBlockStatements(program.body);
    this.terminateWithImplicitReturn(program);
    this.endFunction();
    // $main is always functions[0] — everything else (task definitions) gets appended as it's predeclared/compiled.
    this.program.functions.unshift(main.irFunction);
    return this.program;
  }

  // ---------------------------------------------------------------------
  // Scope / slot mangling (identical convention to BytecodeGenerator)
  // ---------------------------------------------------------------------

  mangle(name) {
    return `${name}$${this.nextSlotId++}`;
  }

  declareSlot(name) {
    const mangled = this.mangle(name);
    this.scope.declare(name, mangled);
    return mangled;
  }

  resolveSlot(name) {
    const mangled = this.scope.resolve(name);
    if (mangled === undefined) {
      throw new Error(`IRGenerator: "${name}" was not declared in any visible scope (unreachable for a program that passed Semantic Analysis).`);
    }
    return mangled;
  }

  pushScope() {
    this.scope = new IRCompileScope(this.scope);
  }

  popScope() {
    this.scope = this.scope.parent;
  }

  // ---------------------------------------------------------------------
  // Function / block / temp management
  // ---------------------------------------------------------------------

  get current() {
    return this.functionStack.at(-1);
  }

  beginFunction(name, params, node) {
    const ctx = { irFunction: new IRFunction(name, params, node), nextTempId: 0, currentBlock: null };
    this.functionStack.push(ctx);
    ctx.currentBlock = this.newBlock('entry_');
    if (name !== '$main') this.program.functions.push(ctx.irFunction); // $main is unshifted to the front by generate() once it's fully compiled
    return ctx;
  }

  endFunction() {
    return this.functionStack.pop();
  }

  newTemp() {
    return temp(this.current.nextTempId++);
  }

  newLabel(hint) {
    return `${hint}${this.nextLabelId++}`;
  }

  newBlock(hint) {
    const block = new BasicBlock(this.newLabel(hint));
    this.current.irFunction.blocks.push(block);
    return block;
  }

  /** Starts a fresh, currently-unreachable block if the current one already has a terminator (e.g. code textually following `return`/`break`) — lets generation continue safely; Unreachable Code Elimination (§6E) removes blocks with no predecessor later. */
  ensureOpenBlock() {
    if (this.current.currentBlock.terminator.kind !== 'NONE') {
      this.current.currentBlock = this.newBlock('unreachable_');
    }
  }

  emit(op, dest, args, node) {
    this.ensureOpenBlock();
    this.current.currentBlock.instructions.push(new IRInstruction(op, dest, args, node));
    return dest;
  }

  setTerminator(terminator) {
    this.ensureOpenBlock();
    this.current.currentBlock.terminator = terminator;
  }

  switchToBlock(block) {
    this.current.currentBlock = block;
  }

  terminateWithImplicitReturn(node) {
    // A block that falls off the end of a function (no explicit `return`) implicitly returns `empty` — matches Interpreter's own fallthrough (§16.2) and BytecodeGenerator.compileTaskDeclaration's identical convention.
    if (this.current.currentBlock.terminator.kind === 'NONE') {
      this.setTerminator({ kind: 'RETURN', value: constant(null, 'Empty') });
    }
  }

  // ---------------------------------------------------------------------
  // Blocks (source-level `Block` nodes) — hoist sibling tasks first
  // ---------------------------------------------------------------------

  compileBlockStatements(statements) {
    for (const stmt of statements) {
      if (stmt.type === NodeType.TASK_DECLARATION) this.predeclareTask(stmt);
    }
    for (const stmt of statements) {
      this.compileStatement(stmt);
    }
  }

  predeclareTask(node) {
    const mangledName = this.declareSlot(node.name);
    node.$mangledName = mangledName; // stashed for compileTaskDeclaration/compileFunctionCall — avoids re-resolving through a scope that may have moved on
  }

  // ---------------------------------------------------------------------
  // Statements
  // ---------------------------------------------------------------------

  compileStatement(node) {
    switch (node.type) {
      case NodeType.VARIABLE_DECLARATION:
      case NodeType.CONSTANT_DECLARATION:
        return this.compileVariableDeclaration(node);
      case NodeType.ASSIGNMENT:
        return this.compileAssignment(node);
      case NodeType.PRINT_STATEMENT:
        return this.compilePrintStatement(node);
      case NodeType.IF_STATEMENT:
        return this.compileIfStatement(node);
      case NodeType.WHILE_STATEMENT:
        return this.compileWhileStatement(node);
      case NodeType.REPEAT_STATEMENT:
        return this.compileRepeatStatement(node);
      case NodeType.BREAK_STATEMENT:
        return this.compileBreakStatement(node);
      case NodeType.CONTINUE_STATEMENT:
        return this.compileContinueStatement(node);
      case NodeType.TASK_DECLARATION:
        return this.compileTaskDeclaration(node);
      case NodeType.RETURN_STATEMENT:
        return this.compileReturnStatement(node);
      case NodeType.EXPRESSION_STATEMENT:
        this.compileExpression(node.expression); // result intentionally discarded — the instruction that produced it (e.g. CALL) is never removed for that reason alone (§6)
        return;
      default:
        if (UNSUPPORTED.has(node.type)) {
          throw new Error(`IRGenerator: "${node.type}" is not yet lowered to IR (native backend subset — see this file's own class doc).`);
        }
        throw new Error(`IRGenerator: no statement compiler for node type "${node.type}".`);
    }
  }

  compileVariableDeclaration(node) {
    const value = this.compileExpression(node.value);
    const mangled = this.declareSlot(node.name); // declared AFTER compiling the initializer — no self-reference (§14.1)
    this.emit(IrOp.STORE, null, [variable(mangled), value], node);
  }

  compileAssignment(node) {
    const value = this.compileExpression(node.value);
    const mangled = this.resolveSlot(node.name);
    this.emit(IrOp.STORE, null, [variable(mangled), value], node);
  }

  /** "say a, b, c" — every argument evaluated left-to-right (matches Interpreter's own Array#map evaluation order) before the single PRINT effect. */
  compilePrintStatement(node) {
    const args = node.arguments.map((arg) => this.compileExpression(arg));
    this.emit(IrOp.PRINT, null, args, node);
  }

  compileIfStatement(node) {
    const condition = this.compileExpression(node.condition);
    const thenBlock = this.newBlock('if_then_');
    const elseBlock = node.elseBranch ? this.newBlock('if_else_') : null;
    const endBlock = this.newBlock('if_end_');

    this.setTerminator({ kind: 'BRANCH', condition, trueTarget: thenBlock.label, falseTarget: (elseBlock ?? endBlock).label });

    this.switchToBlock(thenBlock);
    this.pushScope();
    this.compileBlockStatements(node.thenBranch.body);
    this.popScope();
    this.setTerminator({ kind: 'JUMP', target: endBlock.label });

    if (elseBlock) {
      this.switchToBlock(elseBlock);
      this.pushScope();
      this.compileBlockStatements(node.elseBranch.body);
      this.popScope();
      this.setTerminator({ kind: 'JUMP', target: endBlock.label });
    }

    this.switchToBlock(endBlock);
  }

  compileWhileStatement(node) {
    const condBlock = this.newBlock('while_cond_');
    const bodyBlock = this.newBlock('while_body_');
    const endBlock = this.newBlock('while_end_');

    this.setTerminator({ kind: 'JUMP', target: condBlock.label });
    this.switchToBlock(condBlock);
    const condition = this.compileExpression(node.condition);
    this.setTerminator({ kind: 'BRANCH', condition, trueTarget: bodyBlock.label, falseTarget: endBlock.label });

    this.switchToBlock(bodyBlock);
    this.pushScope();
    this.loopStack.push({ breakBlock: endBlock, continueBlock: condBlock });
    this.compileBlockStatements(node.body.body);
    this.loopStack.pop();
    this.popScope();
    this.setTerminator({ kind: 'JUMP', target: condBlock.label });

    this.switchToBlock(endBlock);
  }

  /** "repeat N as i" — the limit is evaluated exactly once (matches Interpreter/BytecodeGenerator), stashed in a hidden variable alongside the 1-based counter. `continue` jumps to the increment step, not straight to the condition (a bare `continue` must still advance the counter). */
  compileRepeatStatement(node) {
    const limitVar = variable(this.mangle('$repeat_limit'));
    const limit = this.compileExpression(node.count);
    this.emit(IrOp.STORE, null, [limitVar, limit], node);

    this.pushScope();
    const counterVar = variable(node.counterName ? this.declareSlot(node.counterName) : this.mangle('$repeat_i'));
    this.emit(IrOp.STORE, null, [counterVar, constant(1, 'Number')], node);

    const condBlock = this.newBlock('repeat_cond_');
    const bodyBlock = this.newBlock('repeat_body_');
    const continueBlock = this.newBlock('repeat_continue_');
    const endBlock = this.newBlock('repeat_end_');

    this.setTerminator({ kind: 'JUMP', target: condBlock.label });
    this.switchToBlock(condBlock);
    const cmp = this.newTemp();
    this.emit(IrOp.LE, cmp, [counterVar, limitVar], node);
    this.setTerminator({ kind: 'BRANCH', condition: cmp, trueTarget: bodyBlock.label, falseTarget: endBlock.label });

    this.switchToBlock(bodyBlock);
    this.loopStack.push({ breakBlock: endBlock, continueBlock });
    this.compileBlockStatements(node.body.body);
    this.loopStack.pop();
    this.setTerminator({ kind: 'JUMP', target: continueBlock.label });

    this.switchToBlock(continueBlock);
    const incremented = this.newTemp();
    this.emit(IrOp.ADD, incremented, [counterVar, constant(1, 'Number')], node);
    this.emit(IrOp.STORE, null, [counterVar, incremented], node);
    this.setTerminator({ kind: 'JUMP', target: condBlock.label });

    this.switchToBlock(endBlock);
    this.popScope();
  }

  compileBreakStatement(node) {
    // §36 — a bare "break" (unchanged from before) jumps to the loop's
    // break block exactly as it always has; "break <expr>" is new and
    // deliberately not yet modeled (the IR has no loop-result-value
    // concept yet) — rejected explicitly rather than silently discarding
    // the expression, which would be a genuinely wrong (not just
    // incomplete) translation.
    if (node.value) {
      throw new Error('IRGenerator: "break <expression>" is not yet lowered to IR (native backend subset — see this file\'s own class doc).');
    }
    const loop = this.loopStack.at(-1); // Semantic Analysis (P018) already guarantees this exists
    this.setTerminator({ kind: 'JUMP', target: loop.breakBlock.label });
  }

  compileContinueStatement(node) {
    const loop = this.loopStack.at(-1); // Semantic Analysis (P019) already guarantees this exists
    this.setTerminator({ kind: 'JUMP', target: loop.continueBlock.label });
  }

  /** Second pass for a task hoisted by predeclareTask — compiled as its own IRFunction, appended to the program. `functionStack` is a real stack: `beginFunction` pushes the task's frame on top of the caller's (`this.current` inside the task body), and `endFunction` pops exactly that frame back off, automatically restoring the caller's frame as current — no manual save/restore needed. */
  compileTaskDeclaration(node) {
    this.beginFunction(node.$mangledName, [], node);
    this.pushScope();
    const outerLoopStack = this.loopStack;
    this.loopStack = []; // break/continue in a nested task refers only to ITS OWN loops (mirrors ExecutionContext.loopDepth reset)

    this.current.irFunction.params = node.params.map((param) => this.declareSlot(param));
    this.compileBlockStatements(node.body.body);
    this.terminateWithImplicitReturn(node);

    this.loopStack = outerLoopStack;
    this.popScope();
    this.endFunction();
  }

  compileReturnStatement(node) {
    const value = node.value ? this.compileExpression(node.value) : constant(null, 'Empty');
    this.setTerminator({ kind: 'RETURN', value });
  }

  // ---------------------------------------------------------------------
  // Expressions — every compileExpression call returns exactly one Operand
  // ---------------------------------------------------------------------

  compileExpression(node) {
    switch (node.type) {
      case NodeType.LITERAL:
        return this.compileLiteral(node);
      case NodeType.IDENTIFIER:
        return variable(this.resolveSlot(node.name)); // bare reference — no LOAD instruction (see class doc)
      case NodeType.BINARY_EXPRESSION:
        return this.compileBinaryExpression(node);
      case NodeType.UNARY_EXPRESSION:
        return this.compileUnaryExpression(node);
      case NodeType.FUNCTION_CALL:
        return this.compileFunctionCall(node);
      case NodeType.WHILE_STATEMENT:
      case NodeType.REPEAT_STATEMENT:
        // §36 — "while"/"repeat" may now appear in expression position at
        // the AST level, but the IR generator only ever compiled them as
        // statements (no result value) — treated as unsupported here
        // until that's genuinely modeled, same reasoning as LOOP_EXPRESSION.
        throw new Error(`IRGenerator: "${node.type}" used as an expression is not yet lowered to IR (native backend subset — see this file's own class doc).`);
      default:
        if (UNSUPPORTED.has(node.type)) {
          throw new Error(`IRGenerator: "${node.type}" is not yet lowered to IR (native backend subset — see this file's own class doc).`);
        }
        throw new Error(`IRGenerator: no expression compiler for node type "${node.type}".`);
    }
  }

  compileLiteral(node) {
    const dest = this.newTemp();
    this.emit(IrOp.CONST, dest, [constant(node.value, node.valueType)], node);
    return dest;
  }

  compileBinaryExpression(node) {
    if (node.operator === 'and') return this.compileShortCircuit(node, /* shortCircuitWhenLeftIs */ false);
    if (node.operator === 'or') return this.compileShortCircuit(node, /* shortCircuitWhenLeftIs */ true);

    const left = this.compileExpression(node.left);
    const right = this.compileExpression(node.right);
    const dest = this.newTemp();
    this.emit(BINARY_OPS[node.operator], dest, [left, right], node);
    return dest;
  }

  /**
   * `and`/`or` (§13.7) — short-circuiting, lowered to real branches across
   * blocks rather than an eager instruction (see class doc). The result is
   * carried through a hidden variable (no SSA/phi — §12 of the brief) that
   * both branches assign before joining at `endBlock`.
   */
  compileShortCircuit(node, shortCircuitWhenLeftIs) {
    const left = this.compileExpression(node.left);
    const resultVar = variable(this.mangle(shortCircuitWhenLeftIs ? '$or_result' : '$and_result'));
    this.emit(IrOp.STORE, null, [resultVar, left], node); // correct even in the short-circuit case: the stored value IS the short-circuit result (§ — verified against Interpreter.visitBinaryExpression, which returns `left` itself)

    const shortBlock = this.newBlock(shortCircuitWhenLeftIs ? 'or_short_' : 'and_short_');
    const evalRightBlock = this.newBlock(shortCircuitWhenLeftIs ? 'or_eval_right_' : 'and_eval_right_');
    const endBlock = this.newBlock(shortCircuitWhenLeftIs ? 'or_end_' : 'and_end_');

    // "or": left === true -> short-circuit. "and": left === false -> short-circuit (i.e. branch to eval-right when left !== shortCircuitWhenLeftIs).
    this.setTerminator(
      shortCircuitWhenLeftIs
        ? { kind: 'BRANCH', condition: left, trueTarget: shortBlock.label, falseTarget: evalRightBlock.label }
        : { kind: 'BRANCH', condition: left, trueTarget: evalRightBlock.label, falseTarget: shortBlock.label },
    );

    this.switchToBlock(shortBlock);
    this.setTerminator({ kind: 'JUMP', target: endBlock.label });

    this.switchToBlock(evalRightBlock);
    const right = this.compileExpression(node.right);
    this.emit(IrOp.STORE, null, [resultVar, right], node);
    this.setTerminator({ kind: 'JUMP', target: endBlock.label });

    this.switchToBlock(endBlock);
    return resultVar;
  }

  compileUnaryExpression(node) {
    const operand = this.compileExpression(node.operand);
    const dest = this.newTemp();
    this.emit(node.operator === 'not' ? IrOp.NOT : IrOp.NEG, dest, [operand], node);
    return dest;
  }

  /**
   * Function calls always keep their instruction, whether or not `dest` is
   * later read — a call may have side effects (§6: "do NOT remove foo()
   * just because its return value is unused. The function may have side
   * effects.") — enforced structurally: CALL is simply not in `PURE_OPS`
   * (ir-nodes.js), so Dead Code Elimination never considers it for removal.
   */
  compileFunctionCall(node) {
    const args = node.arguments.map((arg) => this.compileExpression(arg));
    const dest = this.newTemp();
    this.emit(IrOp.CALL, dest, [constant(node.callee.name, 'String'), ...args], node);
    return dest;
  }
}

export function generateIR(program) {
  return new IRGenerator().generate(program);
}

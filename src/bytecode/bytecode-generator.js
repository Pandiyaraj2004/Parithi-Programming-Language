/**
 * BytecodeGenerator — Phase 10 (MASTER_DOCUMENT.md §29).
 * Walks a semantically-valid Program AST (Lexer → Parser → Semantic
 * Analyzer output, completely unmodified by this phase — see the module
 * doc in commands.js) and emits Parithi Bytecode instructions via a
 * BytecodeBuilder. Structurally this mirrors Interpreter's visitor
 * (one method per node type, dispatched through `compileStatement`/
 * `compileExpression`) but *emits instructions instead of evaluating* —
 * the Generator never touches an actual Parithi value.
 *
 * Two compile-time-only mechanisms exist here that have no equivalent
 * opcode, because §29's instruction set has no scope-push/pop primitive:
 *
 * 1. **Slot mangling.** Every `hold`/`const`/parameter/`repeat` counter
 *    declaration gets a globally-unique slot name (`name$<n>`, `$` is
 *    illegal in a Parithi identifier — §11.2 — so collision with a real
 *    program identifier is impossible). This is what makes shadowing
 *    (§14.3) correct without any runtime scope object: two `hold x`
 *    declarations in different (possibly nested) scopes become two
 *    different LOAD/STORE targets, resolved once, at compile time, via a
 *    CompileScope chain that mirrors SymbolTable/Environment's own
 *    parent-walk (`resolveSlot`, below) — not reinventing scope rules,
 *    just re-deriving the same answer the Semantic Analyzer already
 *    proved correct, for a different consumer.
 * 2. **Function-name mangling.** Task names go through the exact same
 *    mangling and the exact same scope chain as variables (Parithi's own
 *    rules put them in one shared namespace — §16.3, §12.1's audit note)
 *    — a `CALL` instruction's name operand is always a task's *mangled*
 *    name, so a nested task can share a name with an outer one without
 *    the two colliding in the function table. Built-in names never go
 *    through this: they're reserved (unshadowable — §16.5) and always
 *    referenced by their raw name.
 *
 * See §29.2 for why control flow needs no scope opcode either: `if`/
 * `while`/`repeat`/`choose` bodies share their enclosing function's single
 * frame (only a `CALL` ever creates a new one) — slot mangling alone is
 * enough to keep a block's locals from colliding with an outer block's.
 */

import { NodeType } from '../ast/ast-nodes.js';
import { Opcode } from './opcode.js';
import { ConstantType } from './constant-pool.js';
import { BytecodeBuilder } from './bytecode-builder.js';
import { isBuiltinName } from '../semantic/types.js';

/** One compile-time lexical scope — purely a name→mangledSlot map, no runtime existence. */
class CompileScope {
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

export class BytecodeGenerator {
  constructor() {
    this.builder = new BytecodeBuilder();
    this.scope = new CompileScope(); // global scope, pushed once, never popped
    this.nextSlotId = 0;
    this.loopStack = []; // [{ breakLabel, continueLabel }] — innermost last
    this.functionDepth = 0; // >0 while compiling INSIDE some task's body — see predeclareTask
  }

  generate(program) {
    this.compileBlockStatements(program.body);
    // Normal, top-level fall-through termination — every HALT pops an exit
    // code, so a non-"stop"-ed program supplies the default success code.
    this.emit(Opcode.PUSH, [this.constNumber(0)], program);
    this.emit(Opcode.HALT, [], program);
    return this.builder.resolve();
  }

  // ---------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------

  constNumber(value) {
    return this.builder.constants.add(ConstantType.NUMBER, value);
  }

  constDecimal(value) {
    return this.builder.constants.add(ConstantType.DECIMAL, value);
  }

  constString(value) {
    return this.builder.constants.add(ConstantType.STRING, value);
  }

  constBoolean(value) {
    return this.builder.constants.add(ConstantType.BOOLEAN, value);
  }

  constEmpty() {
    return this.builder.constants.add(ConstantType.EMPTY, null);
  }

  constName(name) {
    return this.builder.constants.addName(name);
  }

  // ---------------------------------------------------------------------
  // Scope / slot mangling (see class doc)
  // ---------------------------------------------------------------------

  mangle(name) {
    return `${name}$${this.nextSlotId++}`;
  }

  /** Declares a NEW slot for `name` in the current scope and returns its mangled form. */
  declareSlot(name) {
    const mangled = this.mangle(name);
    this.scope.declare(name, mangled);
    return mangled;
  }

  /** Resolves an existing declaration (variable or task) to its mangled name. */
  resolveSlot(name) {
    const mangled = this.scope.resolve(name);
    if (mangled === undefined) {
      // Unreachable for a program that passed Semantic Analysis — see class doc.
      throw new Error(`BytecodeGenerator: "${name}" was not declared in any visible scope.`);
    }
    return mangled;
  }

  pushScope() {
    this.scope = new CompileScope(this.scope);
  }

  popScope() {
    this.scope = this.scope.parent;
  }

  // ---------------------------------------------------------------------
  // Emission helpers
  // ---------------------------------------------------------------------

  emit(opcode, operands = [], node = null) {
    return this.builder.emit(opcode, operands, node);
  }

  newLabel(hint) {
    return this.builder.newLabel(hint);
  }

  placeLabel(label) {
    this.builder.placeLabel(label);
  }

  // ---------------------------------------------------------------------
  // Blocks — hoist sibling tasks, then compile statements in order
  // (mirrors SemanticAnalyzer.visitBlockStatements / Interpreter.executeBlock)
  // ---------------------------------------------------------------------

  compileBlockStatements(statements) {
    for (const stmt of statements) {
      if (stmt.type === NodeType.TASK_DECLARATION) this.predeclareTask(stmt);
    }
    for (const stmt of statements) {
      this.compileStatement(stmt);
    }
  }

  /** Pass 1: reserve a mangled name, entry/after labels, and a function-table slot — body compiled later, in pass 2. */
  predeclareTask(node) {
    const mangledName = this.declareSlot(node.name);
    const entryLabel = this.newLabel(`task_${node.name}_`);

    this.builder.registerFunction({
      name: mangledName,
      paramSlots: null, // filled in once pass 2 compiles the body and knows each param's mangled slot
      entryLabel,
      // "Nested" means lexically inside another TASK's body specifically —
      // not merely inside an if/while/repeat/choose block, since those
      // share their enclosing function's single frame (class doc). A task
      // declared inside a top-level `if` is still top-level for this
      // purpose: its free variables resolve against the global frame.
      isNested: this.functionDepth > 0,
      node,
    });
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
      case NodeType.ARRAY_ASSIGNMENT:
        return this.compileArrayAssignment(node);
      case NodeType.PRINT_STATEMENT:
        return this.compilePrintStatement(node);
      case NodeType.IF_STATEMENT:
        return this.compileIfStatement(node);
      case NodeType.CHOOSE_STATEMENT:
        return this.compileChooseStatement(node);
      case NodeType.REPEAT_STATEMENT:
        return this.compileRepeatStatement(node);
      case NodeType.WHILE_STATEMENT:
        return this.compileWhileStatement(node);
      case NodeType.BREAK_STATEMENT:
        return this.compileBreakStatement(node);
      case NodeType.CONTINUE_STATEMENT:
        return this.compileContinueStatement(node);
      case NodeType.TASK_DECLARATION:
        return this.compileTaskDeclaration(node);
      case NodeType.RETURN_STATEMENT:
        return this.compileReturnStatement(node);
      case NodeType.STOP_STATEMENT:
        return this.compileStopStatement(node);
      case NodeType.EXPRESSION_STATEMENT:
        this.compileExpression(node.expression);
        this.emit(Opcode.POP, [], node); // statement's value is always discarded
        return;
      default:
        throw new Error(`BytecodeGenerator: no statement compiler for node type "${node.type}".`);
    }
  }

  compileVariableDeclaration(node) {
    this.compileExpression(node.value);
    const mangled = this.declareSlot(node.name); // declared AFTER compiling the initializer — matches "no self-reference" (§14.1)
    this.emit(Opcode.STORE, [this.constName(mangled)], node);
  }

  compileAssignment(node) {
    this.compileExpression(node.value);
    const mangled = this.resolveSlot(node.name);
    this.emit(Opcode.STORE, [this.constName(mangled)], node);
  }

  /** "arr[index] = value" — order matches Interpreter.visitArrayAssignment exactly: array, then value, then index. */
  compileArrayAssignment(node) {
    this.compileExpression(node.array);
    this.compileExpression(node.value);
    this.compileExpression(node.index);
    this.emit(Opcode.ARRAY_SET, [], node);
  }

  /** "say a, b, c" — args pushed in source order; PRINT pops+un-reverses (§29.3's N-ary convention). */
  compilePrintStatement(node) {
    for (const arg of node.arguments) this.compileExpression(arg);
    this.emit(Opcode.PRINT, [node.arguments.length], node);
  }

  compileIfStatement(node) {
    const elseLabel = this.newLabel('else_');
    const endLabel = this.newLabel('endif_');

    this.compileExpression(node.condition);
    this.emit(Opcode.JMP_IF_FALSE, [elseLabel], node);

    this.pushScope();
    this.compileBlockStatements(node.thenBranch.body);
    this.popScope();

    if (node.elseBranch) {
      this.emit(Opcode.JMP, [endLabel], node);
      this.placeLabel(elseLabel);
      this.pushScope();
      this.compileBlockStatements(node.elseBranch.body);
      this.popScope();
      this.placeLabel(endLabel);
    } else {
      this.placeLabel(elseLabel);
    }
  }

  /**
   * "choose"/"option"/"other" — the discriminant is evaluated once and
   * stashed in a hidden slot so each option's comparison can re-LOAD it
   * (the instruction set has no DUP — §29.3) without re-evaluating it.
   */
  compileChooseStatement(node) {
    this.compileExpression(node.discriminant);
    const stash = this.mangle('$choose');
    this.emit(Opcode.STORE, [this.constName(stash)], node);

    const endLabel = this.newLabel('endchoose_');
    const optionLabels = node.options.map(() => this.newLabel('option_'));
    const otherLabel = node.otherClause ? this.newLabel('other_') : endLabel;

    node.options.forEach((option, i) => {
      this.emit(Opcode.LOAD, [this.constName(stash)], option);
      this.compileExpression(option.test);
      this.emit(Opcode.EQ, [], option);
      this.emit(Opcode.JMP_IF_TRUE, [optionLabels[i]], option);
    });
    this.emit(Opcode.JMP, [otherLabel], node);

    node.options.forEach((option, i) => {
      this.placeLabel(optionLabels[i]);
      this.pushScope();
      this.compileBlockStatements(option.body.body);
      this.popScope();
      this.emit(Opcode.JMP, [endLabel], option);
    });

    if (node.otherClause) {
      this.placeLabel(otherLabel);
      this.pushScope();
      this.compileBlockStatements(node.otherClause.body.body);
      this.popScope();
    }

    this.placeLabel(endLabel);
  }

  /**
   * "repeat N as i" — the limit is evaluated exactly once (matching
   * Interpreter.visitRepeatStatement, which reads `count` before the loop
   * starts, not on every iteration) and stashed in a hidden slot alongside
   * the counter. `continue` jumps to the increment step, not straight back
   * to the condition — a bare `continue` must still advance the counter,
   * exactly like the JS `for`-loop the Interpreter itself compiles down to.
   */
  compileRepeatStatement(node) {
    this.compileExpression(node.count);
    const limitSlot = this.mangle('$repeat_limit');
    this.emit(Opcode.STORE, [this.constName(limitSlot)], node);

    this.pushScope();
    const counterSlot = node.counterName ? this.declareSlot(node.counterName) : this.mangle('$repeat_i');
    this.emit(Opcode.PUSH, [this.constNumber(1)], node);
    this.emit(Opcode.STORE, [this.constName(counterSlot)], node);

    const condLabel = this.newLabel('repeat_cond_');
    const continueLabel = this.newLabel('repeat_continue_');
    const endLabel = this.newLabel('repeat_end_');

    this.placeLabel(condLabel);
    this.emit(Opcode.LOAD, [this.constName(counterSlot)], node);
    this.emit(Opcode.LOAD, [this.constName(limitSlot)], node);
    this.emit(Opcode.LE, [], node);
    this.emit(Opcode.JMP_IF_FALSE, [endLabel], node);

    this.loopStack.push({ breakLabel: endLabel, continueLabel });
    this.compileBlockStatements(node.body.body);
    this.loopStack.pop();

    this.placeLabel(continueLabel);
    this.emit(Opcode.LOAD, [this.constName(counterSlot)], node);
    this.emit(Opcode.PUSH, [this.constNumber(1)], node);
    this.emit(Opcode.ADD, [], node);
    this.emit(Opcode.STORE, [this.constName(counterSlot)], node);
    this.emit(Opcode.JMP, [condLabel], node);

    this.placeLabel(endLabel);
    this.popScope();
  }

  compileWhileStatement(node) {
    const condLabel = this.newLabel('while_cond_');
    const endLabel = this.newLabel('while_end_');

    this.placeLabel(condLabel);
    this.compileExpression(node.condition);
    this.emit(Opcode.JMP_IF_FALSE, [endLabel], node);

    this.pushScope();
    this.loopStack.push({ breakLabel: endLabel, continueLabel: condLabel });
    this.compileBlockStatements(node.body.body);
    this.loopStack.pop();
    this.popScope();

    this.emit(Opcode.JMP, [condLabel], node);
    this.placeLabel(endLabel);
  }

  compileBreakStatement(node) {
    const loop = this.loopStack.at(-1); // Semantic Analysis (P018) already guarantees this exists
    this.emit(Opcode.JMP, [loop.breakLabel], node);
  }

  compileContinueStatement(node) {
    const loop = this.loopStack.at(-1); // Semantic Analysis (P019) already guarantees this exists
    this.emit(Opcode.JMP, [loop.continueLabel], node);
  }

  /** Pass 2 for a task hoisted in pass 1 (predeclareTask): emit its body, guarded by a JMP so normal flow skips over it. */
  compileTaskDeclaration(node) {
    const entry = this.builder.functions.find((fn) => fn.node === node);
    const afterLabel = this.newLabel(`after_task_${node.name}_`);

    this.emit(Opcode.JMP, [afterLabel], node);
    this.placeLabel(entry.entryLabel);

    this.pushScope();
    const outerLoopStack = this.loopStack;
    this.loopStack = []; // break/continue in a nested task refers only to ITS OWN loops — mirrors ExecutionContext.loopDepth reset
    this.functionDepth++;

    entry.paramSlots = node.params.map((param) => this.declareSlot(param));
    this.compileBlockStatements(node.body.body);
    // Implicit "falls off the end => empty" (§16.2), exactly like Interpreter.callFunction's fallthrough.
    this.emit(Opcode.PUSH, [this.constEmpty()], node);
    this.emit(Opcode.RETURN, [], node);

    this.functionDepth--;
    this.loopStack = outerLoopStack;
    this.popScope();

    this.placeLabel(afterLabel);
  }

  compileReturnStatement(node) {
    if (node.value) {
      this.compileExpression(node.value);
    } else {
      this.emit(Opcode.PUSH, [this.constEmpty()], node);
    }
    this.emit(Opcode.RETURN, [], node);
  }

  /** "stop [code]" — HALT always pops an exit code, so a bare "stop" supplies the default 0 (§15.7). */
  compileStopStatement(node) {
    if (node.value) {
      this.compileExpression(node.value);
    } else {
      this.emit(Opcode.PUSH, [this.constNumber(0)], node);
    }
    this.emit(Opcode.HALT, [], node);
  }

  // ---------------------------------------------------------------------
  // Expressions — every compileExpression call pushes EXACTLY one value
  // ---------------------------------------------------------------------

  compileExpression(node) {
    switch (node.type) {
      case NodeType.LITERAL:
        return this.compileLiteral(node);
      case NodeType.IDENTIFIER:
        return this.compileIdentifier(node);
      case NodeType.BINARY_EXPRESSION:
        return this.compileBinaryExpression(node);
      case NodeType.UNARY_EXPRESSION:
        return this.compileUnaryExpression(node);
      case NodeType.FUNCTION_CALL:
        return this.compileFunctionCall(node);
      case NodeType.INPUT_EXPRESSION:
        return this.compileInputExpression(node);
      case NodeType.ARRAY_LITERAL:
        return this.compileArrayLiteral(node);
      case NodeType.ARRAY_ACCESS:
        return this.compileArrayAccess(node);
      default:
        throw new Error(`BytecodeGenerator: no expression compiler for node type "${node.type}".`);
    }
  }

  compileLiteral(node) {
    let constIndex;
    switch (node.valueType) {
      case 'Number': constIndex = this.constNumber(node.value); break;
      case 'Decimal': constIndex = this.constDecimal(node.value); break;
      case 'String': constIndex = this.constString(node.value); break;
      case 'Boolean': constIndex = this.constBoolean(node.value); break;
      case 'Empty': constIndex = this.constEmpty(); break;
      default:
        throw new Error(`BytecodeGenerator: unknown literal valueType "${node.valueType}".`);
    }
    this.emit(Opcode.PUSH, [constIndex], node);
  }

  compileIdentifier(node) {
    const mangled = this.resolveSlot(node.name);
    this.emit(Opcode.LOAD, [this.constName(mangled)], node);
  }

  /**
   * "and"/"or" are short-circuiting (§13.7) — compiled with jumps, not the
   * AND/OR opcodes, so behavior stays identical to Interpreter.visitBinaryExpression
   * even when the unevaluated side would have thrown (e.g. division by
   * zero) or had a side effect. See the AND/OR doc in opcode.js.
   */
  compileBinaryExpression(node) {
    if (node.operator === 'and') return this.compileShortCircuit(node, Opcode.JMP_IF_FALSE, false);
    if (node.operator === 'or') return this.compileShortCircuit(node, Opcode.JMP_IF_TRUE, true);

    this.compileExpression(node.left);
    this.compileExpression(node.right);
    this.emit(BINARY_OPCODES[node.operator], [], node);
  }

  compileShortCircuit(node, jumpOpcode, shortCircuitValue) {
    const shortLabel = this.newLabel('shortcircuit_');
    const endLabel = this.newLabel('endshortcircuit_');

    this.compileExpression(node.left);
    this.emit(jumpOpcode, [shortLabel], node);
    this.compileExpression(node.right);
    this.emit(Opcode.JMP, [endLabel], node);
    this.placeLabel(shortLabel);
    this.emit(Opcode.PUSH, [this.constBoolean(shortCircuitValue)], node);
    this.placeLabel(endLabel);
  }

  compileUnaryExpression(node) {
    this.compileExpression(node.operand);
    this.emit(node.operator === 'not' ? Opcode.NOT : Opcode.NEG, [], node);
  }

  /** Args pushed in source order; CALL pops+un-reverses (§29.3). Builtins use their raw name; tasks use their mangled name. */
  compileFunctionCall(node) {
    const { name } = node.callee;
    for (const arg of node.arguments) this.compileExpression(arg);
    const nameConst = isBuiltinName(name) ? this.constName(name) : this.constName(this.resolveSlot(name));
    this.emit(Opcode.CALL, [nameConst, node.arguments.length], node);
  }

  compileInputExpression(node) {
    this.compileExpression(node.prompt);
    this.emit(Opcode.INPUT, [], node);
  }

  /** "box(...)" — elements pushed in source order; ARRAY_NEW pops+un-reverses (§29.3). */
  compileArrayLiteral(node) {
    for (const element of node.elements) this.compileExpression(element);
    this.emit(Opcode.ARRAY_NEW, [node.elements.length], node);
  }

  compileArrayAccess(node) {
    this.compileExpression(node.array);
    this.compileExpression(node.index);
    this.emit(Opcode.ARRAY_GET, [], node);
  }
}

const BINARY_OPCODES = Object.freeze({
  '+': Opcode.ADD,
  '-': Opcode.SUB,
  '*': Opcode.MUL,
  '/': Opcode.DIV,
  '%': Opcode.MOD,
  '**': Opcode.POW,
  '==': Opcode.EQ,
  '!=': Opcode.NE,
  '>': Opcode.GT,
  '<': Opcode.LT,
  '>=': Opcode.GE,
  '<=': Opcode.LE,
});

export function generateBytecode(program) {
  return new BytecodeGenerator().generate(program);
}

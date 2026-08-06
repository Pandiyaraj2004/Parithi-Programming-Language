/**
 * Interpreter — Phases 4 and 6.
 * Tree-walking evaluator that executes a Program AST directly against the
 * Runtime Environment (MASTER_DOCUMENT.md §9.5). One dedicated `visit*`
 * method per node type, dispatched through `visit()`.
 *
 * Phase 6 delegates execution state to a Runtime (global environment,
 * environment stack, call stack) and an ExecutionContext (loop depth,
 * current function, current node) instead of holding those as separate
 * ad-hoc instance fields — see runtime/runtime.js and
 * runtime/execution-context.js. Variable resolution itself (env.get/
 * env.assign) still uses the `env` parameter threaded through every visit
 * call, not a re-derived "current environment" lookup — the two are
 * provably the same reference at every point in execution by construction
 * (every scope entry both pushes onto the stack AND becomes the new `env`
 * parameter), so routing the hottest path through an extra layer of
 * indirection would add risk for no behavioral difference.
 *
 * Design points worth knowing (full reasoning in the chat explanation):
 *  - Function hoisting mirrors Phase 3's: each block pre-binds its
 *    direct-child `task` declarations (as closures over that block's own
 *    environment) before executing statements in order, so forward calls
 *    and mutual recursion that passed semantic analysis also run correctly.
 *  - Call-stack frames and environment-stack frames are only popped/
 *    truncated on {normal completion, break, continue, return} — never on
 *    a genuine error, which leaves both stacks pinned all the way down for
 *    diagnostics. This is why loops/functions use `truncateTo(baseDepth)`
 *    rather than a blanket `finally`: break/continue/return are routine,
 *    frequent signals that must not leak scopes, while a real error
 *    terminates the program anyway, so a "dirty" pinned stack is harmless
 *    and actually useful for the crash report.
 */

import { NodeType } from '../ast/ast-nodes.js';
import { Runtime } from '../runtime/runtime.js';
import { ExecutionContext } from '../runtime/execution-context.js';
import { wrap, deepEquals } from '../runtime/runtime-value.js';
import { BreakSignal, ContinueSignal, ReturnSignal, StopSignal } from './signals.js';
import { stringify } from './stringify.js';
import { readLineSync } from './stdin.js';
import { callBuiltin, isBuiltinName } from './builtins/index.js';
import { assertIndexable, resolveIndex, checkElementType, validateHomogeneousElements } from './builtins/array.js';
import { ParithiRuntimeError, SourceLocation } from '../errors/index.js';

// A statements array is a stable AST reference reused on every execution of
// that block (every loop iteration, every call to the same function) — so
// whether it contains a `task` declaration is safe to compute once and
// cache, rather than re-scanning the block on every single execution just
// to find that, in the overwhelmingly common case, there's nothing to hoist.
const taskPresenceCache = new WeakMap();

function blockHasTaskDeclarations(statements) {
  let hasTasks = taskPresenceCache.get(statements);
  if (hasTasks === undefined) {
    hasTasks = statements.some((stmt) => stmt.type === NodeType.TASK_DECLARATION);
    taskPresenceCache.set(statements, hasTasks);
  }
  return hasTasks;
}

export class Interpreter {
  constructor(filePath = '<source>', io = {}) {
    this.filePath = filePath;
    this.io = {
      write: io.write ?? ((text) => process.stdout.write(text)),
      writeLine: io.writeLine ?? ((text) => console.log(text)),
      readLine: io.readLine ?? readLineSync,
    };
    this.runtime = new Runtime();
    this.context = new ExecutionContext(this.runtime);
    this.exitCode = null; // set only if the program executes "stop" (§15.7) — null means "use the CLI's default"
  }

  run(program) {
    this.context.state = 'running';
    try {
      this.visitProgram(program, this.runtime.globalEnvironment);
      this.context.state = 'idle';
    } catch (error) {
      if (error instanceof StopSignal) {
        // A deliberate, clean termination — not an error. Both stacks are
        // left as-is (the process is ending anyway; there's nothing left
        // to leak into), and run() returns normally rather than throwing.
        this.context.state = 'idle';
        this.exitCode = error.exitCode;
        return;
      }
      this.context.state = 'error';
      if (error instanceof ParithiRuntimeError) {
        error.callStack = this.runtime.callStack.describe();
        throw error;
      }
      // Never let a raw JS error (an interpreter bug, or a stray control
      // signal that escaped without being caught anywhere) reach the user
      // as an unformatted stack trace — see MASTER_DOCUMENT.md §18, P023.
      throw new ParithiRuntimeError(
        'P023',
        `Unexpected runtime failure: ${error?.message ?? error?.constructor?.name ?? 'unknown error'}.`,
        null,
        this.runtime.callStack.describe(),
        'this may indicate a bug in the interpreter itself — please report it with the program that triggered it.',
      );
    }
  }

  locationOf(node) {
    return new SourceLocation(this.filePath, node.line, node.column);
  }

  // ---------------------------------------------------------------------
  // Dispatch
  // ---------------------------------------------------------------------

  visit(node, env) {
    switch (node.type) {
      case NodeType.PROGRAM: return this.visitProgram(node, env);
      case NodeType.BLOCK: return this.visitBlock(node, env);
      case NodeType.VARIABLE_DECLARATION: return this.visitVariableDeclaration(node, env);
      case NodeType.CONSTANT_DECLARATION: return this.visitConstantDeclaration(node, env);
      case NodeType.ASSIGNMENT: return this.visitAssignment(node, env);
      case NodeType.PRINT_STATEMENT: return this.visitPrintStatement(node, env);
      case NodeType.IF_STATEMENT: return this.visitIfStatement(node, env);
      case NodeType.CHOOSE_STATEMENT: return this.visitChooseStatement(node, env);
      case NodeType.REPEAT_STATEMENT: return this.visitRepeatStatement(node, env);
      case NodeType.WHILE_STATEMENT: return this.visitWhileStatement(node, env);
      case NodeType.BREAK_STATEMENT: return this.visitBreakStatement(node);
      case NodeType.CONTINUE_STATEMENT: return this.visitContinueStatement(node);
      case NodeType.TASK_DECLARATION: return this.visitTaskDeclaration(node, env);
      case NodeType.RETURN_STATEMENT: return this.visitReturnStatement(node, env);
      case NodeType.STOP_STATEMENT: return this.visitStopStatement(node, env);
      case NodeType.EXPRESSION_STATEMENT: this.evaluate(node.expression, env); return undefined;
      case NodeType.BINARY_EXPRESSION: return this.visitBinaryExpression(node, env);
      case NodeType.UNARY_EXPRESSION: return this.visitUnaryExpression(node, env);
      case NodeType.FUNCTION_CALL: return this.visitFunctionCall(node, env);
      case NodeType.INPUT_EXPRESSION: return this.visitInputExpression(node, env);
      case NodeType.LITERAL: return this.visitLiteral(node);
      case NodeType.IDENTIFIER: return this.visitIdentifier(node, env);
      case NodeType.ARRAY_LITERAL: return this.visitArrayLiteral(node, env);
      case NodeType.ARRAY_ACCESS: return this.visitArrayAccess(node, env);
      case NodeType.ARRAY_ASSIGNMENT: return this.visitArrayAssignment(node, env);
      default:
        throw new Error(`Interpreter: no visitor for node type "${node.type}".`);
    }
  }

  evaluate(node, env) {
    return this.visit(node, env);
  }

  execute(node, env) {
    this.context.currentNode = node; // cheap reference write — statement-level only, for --runtime; see class doc
    this.visit(node, env);
  }

  // ---------------------------------------------------------------------
  // Program / blocks / function hoisting
  // ---------------------------------------------------------------------

  visitProgram(node, env) {
    this.executeBlock(node.body, env);
  }

  visitBlock(node, env) {
    this.executeBlock(node.body, env);
  }

  executeBlock(statements, env) {
    if (blockHasTaskDeclarations(statements)) {
      for (const stmt of statements) {
        if (stmt.type === NodeType.TASK_DECLARATION) this.hoistTask(stmt, env);
      }
    }
    for (const stmt of statements) {
      this.execute(stmt, env);
    }
  }

  hoistTask(node, env) {
    env.define(
      node.name,
      { kind: 'function', name: node.name, params: node.params, body: node.body, closureEnv: env },
      false,
    );
  }

  visitTaskDeclaration() {
    // No-op at execution time — already bound by executeBlock's hoisting pass.
  }

  // ---------------------------------------------------------------------
  // Declarations / assignment
  // ---------------------------------------------------------------------

  visitVariableDeclaration(node, env) {
    env.define(node.name, this.evaluate(node.value, env), true);
  }

  visitConstantDeclaration(node, env) {
    env.define(node.name, this.evaluate(node.value, env), false);
  }

  visitAssignment(node, env) {
    env.assign(node.name, this.evaluate(node.value, env), this.locationOf(node));
  }

  /** "arr[index] = value" (§Arrays) — mutates the array in place (reference semantics). */
  visitArrayAssignment(node, env) {
    const array = this.evaluate(node.array, env);
    const location = this.locationOf(node);
    assertIndexable(array, location);

    const value = this.evaluate(node.value, env);
    const index = resolveIndex(array, this.evaluate(node.index, env), 'array assignment ("[...]")', location);
    checkElementType(array, value, location);
    array[index] = value;
  }

  // ---------------------------------------------------------------------
  // Output / input
  // ---------------------------------------------------------------------

  visitPrintStatement(node, env) {
    const text = node.arguments.map((arg) => stringify(this.evaluate(arg, env))).join(' ');
    this.io.writeLine(text);
  }

  visitInputExpression(node, env) {
    const prompt = this.evaluate(node.prompt, env);
    this.io.write(stringify(prompt));
    return this.io.readLine();
  }

  // ---------------------------------------------------------------------
  // Control flow
  // ---------------------------------------------------------------------

  visitIfStatement(node, env) {
    if (this.evaluate(node.condition, env)) {
      const scope = this.runtime.environments.pushEnvironment(env);
      this.executeBlock(node.thenBranch.body, scope);
      this.runtime.environments.popEnvironment();
    } else if (node.elseBranch) {
      const scope = this.runtime.environments.pushEnvironment(env);
      this.executeBlock(node.elseBranch.body, scope);
      this.runtime.environments.popEnvironment();
    }
    // If executeBlock throws (a control signal or a genuine error), the pop
    // above is simply never reached — see the class doc: a control signal
    // is cleaned up via truncateTo() by whichever loop/function catches it;
    // a genuine error leaves the frame pinned for diagnostics either way.
  }

  visitChooseStatement(node, env) {
    const discriminant = this.evaluate(node.discriminant, env);

    for (const option of node.options) {
      if (discriminant === this.evaluate(option.test, env)) {
        const scope = this.runtime.environments.pushEnvironment(env);
        this.executeBlock(option.body.body, scope);
        this.runtime.environments.popEnvironment();
        return; // exactly one clause runs — no fall-through (§15.2)
      }
    }

    if (node.otherClause) {
      const scope = this.runtime.environments.pushEnvironment(env);
      this.executeBlock(node.otherClause.body.body, scope);
      this.runtime.environments.popEnvironment();
    }
  }

  visitRepeatStatement(node, env) {
    const count = this.evaluate(node.count, env);
    this.context.enterLoop();

    try {
      for (let i = 1; i <= count; i++) {
        const baseDepth = this.runtime.environments.depth;
        const iterationEnv = this.runtime.environments.pushEnvironment(env);
        if (node.counterName) iterationEnv.define(node.counterName, i, true);

        try {
          this.executeBlock(node.body.body, iterationEnv);
          this.runtime.environments.truncateTo(baseDepth);
        } catch (signal) {
          if (signal instanceof BreakSignal) {
            this.runtime.environments.truncateTo(baseDepth);
            break;
          }
          if (signal instanceof ContinueSignal) {
            this.runtime.environments.truncateTo(baseDepth);
            continue;
          }
          if (signal instanceof ReturnSignal) this.runtime.environments.truncateTo(baseDepth);
          throw signal; // ReturnSignal (propagates to the enclosing function) or a genuine error (stays pinned)
        }
      }
    } finally {
      this.context.exitLoop();
    }
  }

  visitWhileStatement(node, env) {
    this.context.enterLoop();

    try {
      while (this.evaluate(node.condition, env)) {
        const baseDepth = this.runtime.environments.depth;
        const iterationEnv = this.runtime.environments.pushEnvironment(env);

        try {
          this.executeBlock(node.body.body, iterationEnv);
          this.runtime.environments.truncateTo(baseDepth);
        } catch (signal) {
          if (signal instanceof BreakSignal) {
            this.runtime.environments.truncateTo(baseDepth);
            break;
          }
          if (signal instanceof ContinueSignal) {
            this.runtime.environments.truncateTo(baseDepth);
            continue;
          }
          if (signal instanceof ReturnSignal) this.runtime.environments.truncateTo(baseDepth);
          throw signal;
        }
      }
    } finally {
      this.context.exitLoop();
    }
  }

  visitBreakStatement(node) {
    if (this.context.loopDepth === 0) {
      // Defensive — Semantic Analysis (P018) already rejects this; this
      // path only matters if the interpreter is ever driven without it.
      throw new ParithiRuntimeError(
        'P018',
        '"break" can only be used inside a "repeat" or "while" loop.',
        this.locationOf(node),
        [],
        'remove this "break", or move it inside a "repeat"/"while" block.',
      );
    }
    throw new BreakSignal();
  }

  visitContinueStatement(node) {
    if (this.context.loopDepth === 0) {
      throw new ParithiRuntimeError(
        'P019',
        '"continue" can only be used inside a "repeat" or "while" loop.',
        this.locationOf(node),
        [],
        'remove this "continue", or move it inside a "repeat"/"while" block.',
      );
    }
    throw new ContinueSignal();
  }

  // ---------------------------------------------------------------------
  // Functions
  // ---------------------------------------------------------------------

  visitReturnStatement(node, env) {
    if (!this.context.currentFunction) {
      // Defensive — Semantic Analysis (P017) already rejects this.
      throw new ParithiRuntimeError(
        'P017',
        '"return" can only be used inside a "task".',
        this.locationOf(node),
        [],
        'remove this "return", or move it inside a "task ... end task" block.',
      );
    }
    throw new ReturnSignal(node.value ? this.evaluate(node.value, env) : null);
  }

  visitStopStatement(node, env) {
    const rawCode = node.value ? this.evaluate(node.value, env) : 0;
    // Semantic analysis already restricts this to Number/Decimal (§15.7);
    // truncate defensively in case a Decimal reaches here (e.g. semantic
    // analysis was bypassed) — process exit codes are always integers.
    throw new StopSignal(Math.trunc(rawCode));
  }

  visitFunctionCall(node, env) {
    const name = node.callee.name;
    const args = node.arguments.map((arg) => this.evaluate(arg, env));
    const location = this.locationOf(node);

    if (isBuiltinName(name)) {
      return callBuiltin(name, args, location);
    }

    const fn = env.get(name, location);
    if (!fn || typeof fn !== 'object' || fn.kind !== 'function') {
      // Defensive — Semantic Analysis (P015) already rejects calling a
      // non-function; this only matters if that check was bypassed.
      throw new ParithiRuntimeError(
        'P022',
        `"${name}" is not a function and cannot be called.`,
        location,
        [],
        `"${name}" is a ${wrap(fn).type ?? 'value'}, not a task.`,
      );
    }
    return this.callFunction(fn, args, location);
  }

  callFunction(fn, args, callLocation) {
    const baseDepth = this.runtime.environments.depth;
    this.runtime.callStack.push({ name: fn.name, params: fn.params, args, closureEnv: fn.closureEnv, location: callLocation });

    const fnEnv = this.runtime.environments.pushEnvironment(fn.closureEnv);
    fn.params.forEach((param, i) => fnEnv.define(param, args[i], true));

    const previousFunction = this.context.enterFunction({ name: fn.name, params: fn.params });
    const outerLoopDepth = this.context.loopDepth;
    this.context.loopDepth = 0; // break/continue in a nested task refers only to ITS OWN loops

    try {
      let result = null;
      try {
        this.executeBlock(fn.body.body, fnEnv);
      } catch (signal) {
        if (!(signal instanceof ReturnSignal)) throw signal; // genuine error — leave both stacks pinned for diagnostics
        result = signal.value;
        this.runtime.environments.truncateTo(baseDepth);
        this.runtime.callStack.pop();
        return result;
      }
      this.runtime.environments.truncateTo(baseDepth);
      this.runtime.callStack.pop();
      return result; // fell through with no return => implicit empty (§16.2)
    } finally {
      this.context.exitFunction(previousFunction);
      this.context.loopDepth = outerLoopDepth;
    }
  }

  // ---------------------------------------------------------------------
  // Expressions
  // ---------------------------------------------------------------------

  visitLiteral(node) {
    return node.value;
  }

  visitIdentifier(node, env) {
    return env.get(node.name, this.locationOf(node));
  }

  /** "box(...)" (§Arrays) — a plain JS array of already-evaluated elements is the raw runtime representation. */
  visitArrayLiteral(node, env) {
    const elements = node.elements.map((element) => this.evaluate(element, env));
    validateHomogeneousElements(elements, this.locationOf(node));
    return elements;
  }

  /** "arr[index]" (§Arrays). */
  visitArrayAccess(node, env) {
    const array = this.evaluate(node.array, env);
    const location = this.locationOf(node);
    assertIndexable(array, location);
    const index = resolveIndex(array, this.evaluate(node.index, env), 'array indexing ("[...]")', location);
    return array[index];
  }

  visitBinaryExpression(node, env) {
    const { operator } = node;

    if (operator === 'and') {
      const left = this.evaluate(node.left, env);
      return left === false ? false : this.evaluate(node.right, env);
    }
    if (operator === 'or') {
      const left = this.evaluate(node.left, env);
      return left === true ? true : this.evaluate(node.right, env);
    }

    const left = this.evaluate(node.left, env);
    const right = this.evaluate(node.right, env);

    // SourceLocation is only constructed inside the throw branches below —
    // arithmetic runs far more often than it fails, so building it
    // unconditionally on every binary expression would waste an allocation
    // on the hottest path in the interpreter for no benefit in the common case.
    switch (operator) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/':
        if (right === 0) {
          throw new ParithiRuntimeError('P020', 'Division by zero.', this.locationOf(node), [], 'check the divisor before dividing, e.g. "if b is not 0".');
        }
        return left / right;
      case '%':
        if (right === 0) {
          throw new ParithiRuntimeError('P020', 'Division by zero (modulo).', this.locationOf(node), [], 'check the divisor before using "%", e.g. "if b is not 0".');
        }
        return left % right;
      case '**': return left ** right;
      // "==="/"!==" would compare two arrays by reference, which is never
      // what §Arrays' "deep equality" requirement means by "equal" — every
      // other type is a scalar, where "===" and structural equality already
      // coincide, so deepEquals() only actually differs from "===" here.
      case '==': return deepEquals(left, right);
      case '!=': return !deepEquals(left, right);
      case '>': return left > right;
      case '<': return left < right;
      case '>=': return left >= right;
      case '<=': return left <= right;
      default:
        throw new Error(`Interpreter: unknown binary operator "${operator}".`);
    }
  }

  visitUnaryExpression(node, env) {
    const operand = this.evaluate(node.operand, env);
    return node.operator === 'not' ? !operand : -operand;
  }
}

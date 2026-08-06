/**
 * ExecutionContext — Phase 6. Aggregates the pieces of "where are we right
 * now" that used to live as scattered instance fields directly on
 * Interpreter (`this.loopDepth`, etc.). Interpreter components read/write
 * this instead of holding their own copies.
 *
 * Purely observational for `currentNode`/`state` — updated cheaply (a
 * reference assignment, not an allocation) at statement boundaries only,
 * not on every expression sub-node, since that would add overhead to the
 * hottest path in the interpreter for a debugging convenience most
 * executions never look at. Control flow itself continues to work exactly
 * as before (signals/exceptions) — this object never drives it, only
 * reports on it.
 */

export class ExecutionContext {
  constructor(runtime) {
    this.runtime = runtime;
    this.loopDepth = 0;
    this.currentFunction = null; // { name, params } while inside a task body, else null
    this.currentNode = null; // the statement currently executing, for --runtime / diagnostics
    this.state = 'idle'; // 'idle' | 'running' | 'returning' | 'error'
  }

  get currentScope() {
    return this.runtime.environments.currentEnvironment();
  }

  get currentCallFrame() {
    return this.runtime.callStack.currentFrame();
  }

  enterFunction(functionDescriptor) {
    const previous = this.currentFunction;
    this.currentFunction = functionDescriptor;
    return previous;
  }

  exitFunction(previousFunction) {
    this.currentFunction = previousFunction;
  }

  enterLoop() {
    this.loopDepth++;
  }

  exitLoop() {
    this.loopDepth--;
  }
}

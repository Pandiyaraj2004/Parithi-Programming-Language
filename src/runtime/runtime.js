/**
 * Runtime — Phase 6. The single object the Interpreter now delegates
 * execution state to, rather than owning an Environment, a CallStack, and
 * a loop-depth counter directly as separate instance fields. Bundles:
 *
 *   - the global Environment (created once, for the program's lifetime)
 *   - the EnvironmentStack (all active scopes)
 *   - the CallStack (all active function invocations)
 *
 * ExecutionContext (a peer, not a child, of this class) holds the
 * remaining "current state" fields (loop depth, current function, etc.)
 * and reads scope/call info back through this object's public properties.
 */

import { Environment } from './environment.js';
import { EnvironmentStack } from './environment-stack.js';
import { CallStack } from './call-stack.js';

export class Runtime {
  constructor({ maxCallDepth = 500 } = {}) {
    this.globalEnvironment = new Environment(null);
    this.environments = new EnvironmentStack(this.globalEnvironment);
    this.callStack = new CallStack(maxCallDepth);
  }
}

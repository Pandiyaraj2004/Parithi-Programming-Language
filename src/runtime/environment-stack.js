/**
 * EnvironmentStack — Phase 6. The explicit stack of active scopes, replacing
 * the interpreter's previous pattern of calling `new Environment(env)`
 * directly wherever a new block/function scope was needed.
 *
 * Two APIs live here, serving different purposes:
 *
 *  1. The named methods the Phase 6 brief asks for — pushEnvironment(),
 *     popEnvironment(), currentEnvironment(), parentEnvironment(),
 *     resolveVariable(), declareVariable(), assignVariable(). These always
 *     operate on whatever is currently on top of the stack.
 *
 *  2. depth/truncateTo() — NOT named in the brief, but required to satisfy
 *     its own "no environment leaks" requirement. break/continue/return are
 *     routine, frequent signals (not rare errors) that can propagate through
 *     an arbitrary number of nested if/choose scopes before a loop or
 *     function catches them. If each intermediate scope had to pop itself
 *     on the way out, a single missed case would leak forever in any
 *     long-running program with a loop containing a conditional break.
 *     Instead, a loop/function records the depth it started at and calls
 *     truncateTo(that depth) once it has handled ANY of {normal
 *     completion, break, continue, return} — one operation, correct
 *     regardless of how many levels were pushed in between. Genuine errors
 *     deliberately skip truncation, leaving the stack pinned for
 *     diagnostics — mirroring how CallStack already behaves (see
 *     call-stack.js).
 */

import { Environment } from './environment.js';

export class EnvironmentStack {
  constructor(globalEnvironment) {
    this.frames = [globalEnvironment];
  }

  /** Creates a new child Environment of `parentEnvironment`, pushes it, and returns it. */
  pushEnvironment(parentEnvironment) {
    const environment = new Environment(parentEnvironment);
    this.frames.push(environment);
    return environment;
  }

  popEnvironment() {
    if (this.frames.length <= 1) {
      throw new Error('EnvironmentStack: cannot pop the global environment.');
    }
    return this.frames.pop();
  }

  currentEnvironment() {
    return this.frames[this.frames.length - 1];
  }

  parentEnvironment() {
    return this.currentEnvironment().parent;
  }

  resolveVariable(name, location) {
    return this.currentEnvironment().get(name, location);
  }

  declareVariable(name, value, mutable = true) {
    return this.currentEnvironment().define(name, value, mutable);
  }

  assignVariable(name, value, location) {
    return this.currentEnvironment().assign(name, value, location);
  }

  get depth() {
    return this.frames.length;
  }

  /** Pops down to exactly `depth` frames — see the class doc for why this exists. */
  truncateTo(depth) {
    while (this.frames.length > depth) this.frames.pop();
  }
}

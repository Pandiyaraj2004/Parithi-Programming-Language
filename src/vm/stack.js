/**
 * OperandStack — the PVM's single shared operand stack (Phase 11, §30.2).
 * One JS array serves every frame: a CALL pops its arguments off the same
 * stack the caller was using, and the callee pushes/pops "on top of"
 * whatever remained — which works correctly with zero per-call isolation
 * because Bytecode Generator output is proven stack-neutral per statement
 * (validated at compile time, §29.6), so a callee's net effect composes
 * correctly regardless of what depth the caller happened to be at.
 *
 * `maxDepth` is a robustness backstop, independent of the call-depth limit
 * (`vm-errors.js`'s `callDepthOverflow`) — it exists for the case the
 * Phase 10 Validator can't reach: hand-crafted or corrupted bytecode with
 * a tight `JMP` cycle that pushes without a matching pop, which would
 * otherwise grow this array forever.
 */

import { stackUnderflow, operandStackOverflow } from './vm-errors.js';

const DEFAULT_MAX_DEPTH = 100_000;

export class OperandStack {
  constructor(maxDepth = DEFAULT_MAX_DEPTH) {
    this.values = [];
    this.maxDepth = maxDepth;
  }

  push(value, location, callStack) {
    if (this.values.length >= this.maxDepth) {
      throw operandStackOverflow(location, callStack, this.maxDepth);
    }
    this.values.push(value);
  }

  pop(location, callStack) {
    if (this.values.length === 0) {
      throw stackUnderflow(location, callStack);
    }
    return this.values.pop();
  }

  /** Pops `count` values and returns them in their original push (left-to-right source) order — §29.3/§29.5's N-ary convention. */
  popN(count, location, callStack) {
    const popped = [];
    for (let i = 0; i < count; i++) popped.push(this.pop(location, callStack));
    return popped.reverse();
  }

  get depth() {
    return this.values.length;
  }
}

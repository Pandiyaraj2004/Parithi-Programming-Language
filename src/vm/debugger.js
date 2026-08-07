/**
 * Debugger — read-only VM introspection (Phase 11, §30.9). "Future-ready"
 * per the Phase 11 brief: this is deliberately the *only* place that
 * reaches into a `VirtualMachine`'s internals for display purposes,
 * mirroring how `pari --runtime` (§19) is a thin, separate reporting
 * layer on top of `Interpreter`/`Runtime` rather than logic baked into
 * the Interpreter itself. A future step-debugger or profiler extends
 * this class; it does not need to change `VirtualMachine` or
 * `instruction-dispatcher.js` to do so.
 */

import { displayFunctionName } from './frame.js';

export class Debugger {
  constructor(vm) {
    this.vm = vm;
  }

  /** The currently-executing instruction, or null if `ip` is out of range (e.g. before the first step, or after HALT). */
  currentInstruction() {
    return this.vm.instructions[this.vm.ip] ?? null;
  }

  /** Operand stack contents, bottom to top — a snapshot, not a live view. */
  describeStack() {
    return [...this.vm.stack.values];
  }

  /** Active call frames, innermost first — mirrors describeCallStack() but with each frame's own locals included. */
  describeFrames() {
    const frames = [];
    let frame = this.vm.currentFrame;
    while (frame && frame !== this.vm.memory.globalFrame) {
      frames.push({
        name: displayFunctionName(frame.functionName),
        location: frame.callLocation?.toString() ?? null,
        locals: [...frame.locals.entries()].map(([name, value]) => `${name} = ${value}`),
      });
      frame = frame.callerFrame;
    }
    return frames;
  }

  describeGlobals() {
    return [...this.vm.memory.globalFrame.locals.entries()].map(([name, value]) => `${name} = ${value}`);
  }

  /** A single-string snapshot, the VM analogue of `pari --runtime`'s report — useful for a future `--vm-runtime` flag or a step debugger's prompt. */
  snapshot() {
    const instruction = this.currentInstruction();
    return [
      `ip=${this.vm.ip} ${instruction ? instruction.toString() : '(halted)'}`,
      `state=${this.vm.state} callDepth=${this.vm.callDepth} operandStackDepth=${this.vm.stack.depth}`,
      `stack: [${this.describeStack().join(', ')}]`,
    ].join('\n');
  }
}

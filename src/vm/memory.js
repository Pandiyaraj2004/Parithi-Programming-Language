/**
 * Memory — the PVM's memory-model facade (Phase 11, §30.4), bundling the
 * global frame and the heap the way `src/runtime/runtime.js` (Interpreter,
 * unmodified) bundles `globalEnvironment` + `EnvironmentStack` +
 * `CallStack` — one owner object `VirtualMachine` delegates to, rather
 * than holding each piece as a separate ad-hoc field. Kept as its own
 * class specifically so a future change to how memory is managed (a real
 * allocator, a GC pass) has one clear seam to land in, without touching
 * `VirtualMachine`'s own control-flow code.
 */

import { Frame } from './frame.js';
import { Heap } from './heap.js';

export class Memory {
  constructor() {
    this.globalFrame = new Frame('<global>', null, null, -1);
    this.heap = new Heap();
  }
}

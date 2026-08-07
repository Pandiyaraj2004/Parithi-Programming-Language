/**
 * Heap — allocation bookkeeping for reference-shaped values (Phase 11,
 * §30.4). Deliberately minimal today: Parithi's only reference type is
 * Array (§28.3), and a Parithi array's actual runtime representation is
 * still a plain JS array — exactly the Interpreter's own representation
 * (§17.4, `wrap()`), reused here rather than reinvented, so JS's own GC
 * already manages the underlying memory correctly with zero extra code.
 *
 * What this class adds on top of "just use a JS array" is purely
 * observational — an allocation counter and an id assigned per array,
 * useful for a future debugger/profiler (`debugger.js`) or garbage
 * collector without requiring any change to how arrays are actually
 * represented or accessed elsewhere in the VM. This is the seam the
 * Phase 11 brief's "future-ready... without requiring major architectural
 * changes" asks for: a real collector would replace this class's
 * internals, not the call sites that use it.
 */

export class Heap {
  constructor() {
    this.nextId = 0;
    this.allocatedCount = 0;
    this.ids = new WeakMap(); // array -> id, for debugger/profiler display only
  }

  /** Allocates a new Parithi array from already-evaluated elements (in source/left-to-right order). */
  allocateArray(elements) {
    const array = elements; // the elements list itself becomes the array's storage — no extra copy
    this.ids.set(array, this.nextId++);
    this.allocatedCount++;
    return array;
  }

  idOf(array) {
    return this.ids.get(array);
  }
}

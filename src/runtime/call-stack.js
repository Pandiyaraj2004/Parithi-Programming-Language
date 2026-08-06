/**
 * CallStack — tracks active task invocations (MASTER_DOCUMENT.md §17.3).
 * Three jobs: (1) detect runaway recursion with a controlled error rather
 * than letting Node's own native stack overflow (which would crash with
 * an unhelpful RangeError before any clean message could be built),
 * (2) supply the "call stack" every runtime error is required to report,
 * and (3) hold enough per-call detail for `pari --runtime` to show a real
 * execution frame, not just a bare name.
 *
 * Each frame (Phase 6, enriched from Phase 4's {name, location}):
 *   name          — the function's name
 *   params        — its declared parameter names
 *   args          — the actual argument values passed at this call
 *   environment   — this call's own Environment (its "local variables")
 *   closureEnv    — the environment the function closed over when declared
 *                   (MASTER_DOCUMENT.md §17.3's "parent environment")
 *   location      — the call site ("return address", in tree-walking terms)
 *
 * maxDepth is a Parithi-level call-depth cap, not a JS-level one — each
 * Parithi call costs several real JS stack frames (visit → evaluate →
 * visitFunctionCall → callFunction → executeBlock → visit ...), so this is
 * set well below where Node's actual limit would ever be reached.
 */

import { ParithiRuntimeError } from '../errors/index.js';

export class CallStack {
  constructor(maxDepth = 500) {
    this.frames = [];
    this.maxDepth = maxDepth;
  }

  push(frame) {
    if (this.frames.length >= this.maxDepth) {
      throw new ParithiRuntimeError(
        'P021',
        `Maximum call depth (${this.maxDepth}) exceeded — likely infinite recursion.`,
        frame.location,
        this.describe(),
        'check that every recursive call moves toward a base case that actually returns without calling itself again.',
      );
    }
    this.frames.push(frame);
  }

  pop() {
    return this.frames.pop();
  }

  currentFrame() {
    return this.frames.at(-1) ?? null;
  }

  /** Innermost call first, matching how a conventional stack trace reads. */
  describe() {
    return [...this.frames].reverse().map((frame) => `${frame.name}(...) — called at ${frame.location.toString()}`);
  }

  /** Verbose per-frame detail for `pari --runtime` — params bound to their actual argument values. */
  describeFrames() {
    return [...this.frames].reverse().map((frame) => ({
      name: frame.name,
      location: frame.location.toString(),
      bindings: frame.params.map((param, i) => `${param} = ${frame.args[i]}`),
    }));
  }
}

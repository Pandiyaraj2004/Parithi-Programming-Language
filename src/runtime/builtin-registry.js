/**
 * BuiltinRegistry — Phase 6. A reusable registration mechanism for
 * built-in functions, so adding a new one at the runtime layer is exactly
 * one `register({...})` call (interpreter/builtins/index.js is where
 * Parithi's actual six get registered).
 *
 * This intentionally does NOT merge with semantic/types.js's
 * BUILTIN_SIGNATURES. The two serve different phases with different needs
 * — static pre-execution validation (Phase 3, already fully tested) versus
 * actual invocation with runtime values (Phase 6) — and merging them would
 * mean touching Phase 3's verified logic for a phase whose brief is
 * explicitly the runtime, not semantic analysis. Each entry here does
 * still carry the same shape of metadata (name, arity, validation,
 * implementation, return type) the brief asks for, independently.
 *
 * `call()` itself defensively re-checks argument count against the entry's
 * own minArgs/maxArgs/validCounts before ever running validate()/
 * implementation() — mirroring §17.7's "the interpreter does not assume the
 * Semantic Analyzer has already run." Without this, a built-in driven
 * directly (semantic analysis skipped) could receive fewer arguments than
 * its implementation assumes and fail with a raw JS TypeError instead of a
 * clean P016.
 */

import { ParithiRuntimeError } from '../errors/index.js';

function isValidArgCount(entry, count) {
  if (entry.validCounts) return entry.validCounts.includes(count);
  if (entry.minArgs === undefined && entry.maxArgs === undefined) return true;
  return count >= (entry.minArgs ?? 0) && count <= (entry.maxArgs ?? Infinity);
}

function describeArgCount(entry) {
  if (entry.validCounts) return entry.validCounts.join(' or ');
  return entry.minArgs === entry.maxArgs ? `${entry.minArgs}` : `${entry.minArgs}-${entry.maxArgs}`;
}

export class BuiltinRegistry {
  constructor() {
    this.entries = new Map();
  }

  /**
   * descriptor: { name, minArgs, maxArgs, validCounts?, validate(args, location),
   *               implementation(args, location), returnType(argCount) }
   */
  register(descriptor) {
    this.entries.set(descriptor.name, descriptor);
  }

  has(name) {
    return this.entries.has(name);
  }

  get(name) {
    return this.entries.get(name);
  }

  names() {
    return [...this.entries.keys()];
  }

  call(name, args, location) {
    const entry = this.entries.get(name);
    if (!isValidArgCount(entry, args.length)) {
      throw new ParithiRuntimeError(
        'P016',
        `"${name}()" expects ${describeArgCount(entry)} argument(s) but got ${args.length}.`,
        location,
        [],
        `see MASTER_DOCUMENT.md §16.3 for "${name}()"'s documented call forms.`,
      );
    }
    entry.validate?.(args, location);
    return entry.implementation(args, location);
  }
}

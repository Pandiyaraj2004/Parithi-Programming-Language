/**
 * Environment — the runtime scope chain the Interpreter reads and writes
 * while executing (MASTER_DOCUMENT.md §17.1). The runtime counterpart of
 * Phase 3's SymbolTable, but holding actual values instead of just types.
 *
 * Deliberately independent of the Semantic Analyzer having run: get()/
 * assign() re-check undeclared-variable (P001) and constant-reassignment
 * (P005) defensively, since the interpreter must guard against these on
 * its own, not merely assume Phase 3 already caught them.
 *
 * Phase 6: stored bindings hold a RuntimeValue (wrapped on define()/
 * assign(), unwrapped back to a raw JS value on get()) rather than the
 * bare JS value directly — see runtime-value.js for why this is done here
 * specifically (rare, at declaration/reassignment) and not on every
 * arithmetic operand (frequent, would cost real performance for no gain).
 * The public API is unchanged: callers still pass/receive raw values.
 */

import { ParithiRuntimeError } from '../errors/index.js';
import { wrap, unwrap } from './runtime-value.js';

export class Environment {
  constructor(parent = null) {
    this.parent = parent;
    this.bindings = new Map();
  }

  /** Declares `name` in THIS environment only — this is what makes shadowing work. */
  define(name, value, mutable = true) {
    this.bindings.set(name, { runtimeValue: wrap(value), mutable });
  }

  /** Walks up the parent chain. Throws P001 if `name` isn't declared anywhere visible. */
  get(name, location) {
    const binding = this.bindings.get(name);
    if (binding !== undefined) return unwrap(binding.runtimeValue);
    if (this.parent) return this.parent.get(name, location);
    throw new ParithiRuntimeError(
      'P001',
      `Variable "${name}" is not declared.`,
      location,
      [],
      `declare it first with "hold ${name} = ...".`,
    );
  }

  /** Finds the scope that owns `name` and updates it there. Throws P005 for constants, P001 if undeclared. */
  assign(name, value, location) {
    const binding = this.bindings.get(name);
    if (binding !== undefined) {
      if (!binding.mutable) {
        throw new ParithiRuntimeError(
          'P005',
          `Cannot reassign constant "${name}".`,
          location,
          [],
          `constants declared with "const" can never be reassigned — use "hold" instead if this needs to change.`,
        );
      }
      binding.runtimeValue = wrap(value);
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value, location);
      return;
    }
    throw new ParithiRuntimeError(
      'P001',
      `Variable "${name}" is not declared.`,
      location,
      [],
      `declare it first with "hold ${name} = ...".`,
    );
  }

  /** All bindings declared directly in this scope, as {name, runtimeValue, mutable} — for --runtime / --analyze display. */
  ownBindings() {
    return [...this.bindings.entries()].map(([name, binding]) => ({
      name,
      runtimeValue: binding.runtimeValue,
      mutable: binding.mutable,
    }));
  }
}

/**
 * RuntimeValue — dedicated classes for Parithi's five data types
 * (MASTER_DOCUMENT.md §12.2), used at the Environment storage boundary
 * (Phase 6). Each exposes: type, value, toString()/stringify(), equals(),
 * isTruthy(), and copy() — the last mostly for future extensibility, since
 * v1.0 has no mutable/reference types and every value is already copied
 * by-value in JS.
 *
 * Deliberately NOT used for every arithmetic intermediate — only at
 * Environment.define()/get() (see environment.js). Boxing every operand of
 * every expression would be invasive and slow for no behavioral benefit;
 * boxing at the point variables are stored/read is where "represent
 * runtime values as dedicated classes" actually earns its keep (accurate
 * type names in diagnostics, a real place to hang equals()/isTruthy() on)
 * without touching the interpreter's hot arithmetic path.
 */

class RuntimeValue {
  constructor(type, value) {
    this.type = type;
    this.value = value;
  }

  toString() {
    return String(this.value);
  }

  equals(other) {
    const otherValue = other instanceof RuntimeValue ? other.value : other;
    return this.value === otherValue;
  }

  isTruthy() {
    return Boolean(this.value);
  }

  copy() {
    return new this.constructor(this.value);
  }

  /** Unwraps back to the raw JS value the rest of the interpreter operates on. */
  unwrap() {
    return this.value;
  }
}

export class NumberValue extends RuntimeValue {
  constructor(value) {
    super('Number', value);
  }
}

export class DecimalValue extends RuntimeValue {
  constructor(value) {
    super('Decimal', value);
  }
}

export class StringValue extends RuntimeValue {
  constructor(value) {
    super('String', value);
  }

  toString() {
    return this.value;
  }
}

export class BooleanValue extends RuntimeValue {
  constructor(value) {
    super('Boolean', value);
  }

  toString() {
    return this.value ? 'true' : 'false';
  }
}

export class EmptyValue extends RuntimeValue {
  constructor() {
    super('Empty', null);
  }

  toString() {
    return 'empty';
  }

  isTruthy() {
    return false;
  }

  copy() {
    return new EmptyValue();
  }
}

/**
 * ListValue — the box(...) array type (Phase 9, §Arrays). `value` is the
 * raw JS array of already-evaluated, still-unwrapped Parithi element
 * values — the same "raw runtime representation" every other type uses
 * (see wrap()/unwrap() below); ListValue only ever exists transiently, at
 * the Environment storage boundary, exactly like every other RuntimeValue.
 *
 * copy() deliberately returns `this`, not a clone: arrays are Parithi's
 * first reference-shaped type (§Arrays' explicit "reference semantics"
 * decision) — "hold b = a" must make b and a the same underlying array, so
 * mutating one through push()/an index assignment is visible through the
 * other. Every other RuntimeValue's copy() clones because every other v1.0
 * type is a scalar; this is the one deliberate exception, not an oversight.
 *
 * equals() overrides the inherited reference-style comparison with a deep,
 * structural one (§Arrays' explicit "deep equality" requirement) — this is
 * intentionally a *different* operation from copy()'s reference semantics:
 * "==" asks "do these look the same," not "are these the same array."
 */
export class ListValue extends RuntimeValue {
  constructor(elements = []) {
    super('Array', elements);
  }

  get elements() {
    return this.value;
  }

  toString() {
    return stringifyArray(this.value);
  }

  equals(other) {
    const otherValue = other instanceof RuntimeValue ? other.value : other;
    return deepEquals(this.value, otherValue);
  }

  isTruthy() {
    return true; // arrays never reach a Boolean-only position (§14.4) — kept only for interface completeness
  }

  copy() {
    return this; // reference semantics — see class doc
  }
}

/** Deep, structural equality — used by ListValue.equals() and the "=="/"!=" operators (§Arrays). */
export function deepEquals(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((element, i) => deepEquals(element, b[i]));
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  return a === b;
}

/** String elements are quoted so an array of text reads unambiguously, e.g. ["a", "b"] not [a, b]. */
function stringifyArrayElement(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return stringifyArray(value);
  if (value === null) return 'empty';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function stringifyArray(elements) {
  return `[${elements.map(stringifyArrayElement).join(', ')}]`;
}

/**
 * Wraps a raw JS value (as produced by the Lexer/Interpreter — number,
 * string, boolean, or null) in its matching RuntimeValue. Number-vs-Decimal
 * is resolved the same way type() already does (Number.isInteger) — this
 * is the ONE place that decision is made now; type.js's typeBuiltin
 * delegates here instead of duplicating the check.
 *
 * Environment.define() also stores non-Parithi-value objects — function
 * descriptors ({kind: 'function', ...}) created by Interpreter.hoistTask,
 * an internal implementation detail, not one of the five §12.2 types.
 * Those pass through unwrapped rather than being rejected: only the five
 * primitive JS shapes below get boxed.
 */
export function wrap(rawValue) {
  if (rawValue instanceof RuntimeValue) return rawValue;
  if (rawValue === null) return new EmptyValue();
  if (typeof rawValue === 'string') return new StringValue(rawValue);
  if (typeof rawValue === 'boolean') return new BooleanValue(rawValue);
  if (typeof rawValue === 'number') {
    return Number.isInteger(rawValue) ? new NumberValue(rawValue) : new DecimalValue(rawValue);
  }
  if (Array.isArray(rawValue)) return new ListValue(rawValue);
  return rawValue; // non-Parithi-value object (e.g. a function descriptor) — pass through
}

/** Unwraps a RuntimeValue back to its raw JS value; passes through anything else unchanged. */
export function unwrap(value) {
  return value instanceof RuntimeValue ? value.value : value;
}

export { RuntimeValue };

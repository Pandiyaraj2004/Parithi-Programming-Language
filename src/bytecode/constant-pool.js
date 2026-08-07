/**
 * ConstantPool — deduplicated table of literal values (Phase 10, §29.4).
 * Every PUSH/LOAD/STORE/CALL operand that needs a value or a name refers to
 * one of these by index, rather than embedding the value inline — the same
 * reason every real bytecode format (JVM class files, Python .pyc, etc.)
 * has one: identical literals and identical variable/function names appear
 * repeatedly in real programs, and de-duplicating them keeps the format
 * compact and gives `--bytecode`'s listing one place to look up a value.
 *
 * Keyed by (type, value) rather than value alone: a Number `5` and a
 * Decimal `5` (from a literal written as `5.0`) are different Parithi
 * values (§12.2) even though they're the same JS number — deduping them
 * together would be a silent, incorrect merge. Variable/function/parameter
 * *names* are pooled as plain Strings — identical to how a String literal
 * is pooled, since by the time bytecode exists there's no remaining reason
 * to treat "the text used as a slot name" as a different kind of thing
 * from "the text used as a String value."
 */

export const ConstantType = Object.freeze({
  NUMBER: 'Number',
  DECIMAL: 'Decimal',
  STRING: 'String',
  BOOLEAN: 'Boolean',
  EMPTY: 'Empty',
});

/** Fixed type-tag byte values for the binary `.pbc` format (§29.7) — see opcode.js's OPCODE_LIST for why this is a pinned literal list, not object-key order. */
export const CONSTANT_TYPE_LIST = Object.freeze([
  ConstantType.NUMBER,
  ConstantType.DECIMAL,
  ConstantType.STRING,
  ConstantType.BOOLEAN,
  ConstantType.EMPTY,
]);

export const CONSTANT_TYPE_ID = Object.freeze(
  Object.fromEntries(CONSTANT_TYPE_LIST.map((type, id) => [type, id])),
);

function keyOf(type, value) {
  return `${type}:${type === ConstantType.EMPTY ? '' : JSON.stringify(value)}`;
}

export class ConstantPool {
  constructor() {
    this.entries = [];
    this.index = new Map(); // key (see keyOf) -> pool index
  }

  /** Adds `{type, value}` if not already present; returns its index either way. */
  add(type, value) {
    const key = keyOf(type, value);
    const existing = this.index.get(key);
    if (existing !== undefined) return existing;

    const idx = this.entries.length;
    this.entries.push({ type, value });
    this.index.set(key, idx);
    return idx;
  }

  /** Convenience: pool a slot/function name as a String constant. */
  addName(name) {
    return this.add(ConstantType.STRING, name);
  }

  get(index) {
    if (index < 0 || index >= this.entries.length) {
      throw new RangeError(`ConstantPool: index ${index} out of range (0..${this.entries.length - 1}).`);
    }
    return this.entries[index];
  }

  get size() {
    return this.entries.length;
  }

  [Symbol.iterator]() {
    return this.entries[Symbol.iterator]();
  }
}

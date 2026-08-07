/**
 * Label — a symbolic jump target used only during generation (Phase 10, §29.5).
 * The Generator doesn't know an instruction's final absolute index while
 * it's still being emitted (a forward jump like `if`'s JMP_IF_FALSE needs a
 * target that doesn't exist yet), so it emits a Label placeholder instead
 * and calls `placeLabel()` once the target position is reached.
 * `BytecodeBuilder.resolve()` then does one pass replacing every Label
 * operand with its concrete instruction index — after which Labels no
 * longer appear anywhere in the finished bytecode.
 */

export class Label {
  constructor(id, hint = null) {
    this.id = id;
    this.hint = hint;
    this.resolvedIndex = null;
  }

  toString() {
    return `${this.hint ?? 'L'}${this.id}`;
  }
}

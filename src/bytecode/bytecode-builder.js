/**
 * BytecodeBuilder — the Generator's write surface (Phase 10, §29.5).
 * Owns the growing instruction list, the constant pool, label allocation,
 * and the function table, and performs the one deferred step generation
 * itself can't do inline: turning symbolic Labels into concrete
 * instruction indices once every instruction has been emitted.
 */

import { Instruction } from './instruction.js';
import { Label } from './label.js';
import { ConstantPool } from './constant-pool.js';

export class BytecodeBuilder {
  constructor() {
    this.instructions = [];
    this.constants = new ConstantPool();
    this.functions = []; // {name, paramSlots, entryLabel, isNested} — see BytecodeGenerator
    this.nextLabelId = 0;
  }

  newLabel(hint = null) {
    return new Label(this.nextLabelId++, hint);
  }

  /** Marks `label` as pointing to the NEXT instruction about to be emitted. */
  placeLabel(label) {
    if (label.resolvedIndex !== null) {
      throw new Error(`BytecodeBuilder: label "${label}" placed more than once.`);
    }
    label.resolvedIndex = this.instructions.length;
  }

  /** `operands` may contain resolved integers and/or Label objects (resolved later, in resolve()). */
  emit(opcode, operands = [], node = null) {
    const instruction = new Instruction(opcode, operands, node?.line ?? null, node?.column ?? null);
    this.instructions.push(instruction);
    return instruction;
  }

  registerFunction(descriptor) {
    this.functions.push(descriptor);
  }

  /**
   * Finalizes the program: replaces every Label operand with its resolved
   * instruction index (throwing if a label was referenced but never
   * placed — an unresolved jump target, §29's "no invalid jumps") and
   * resolves each function table entry's entry label the same way.
   */
  resolve() {
    for (const instruction of this.instructions) {
      instruction.operands = instruction.operands.map((operand) => this.resolveOperand(operand));
    }

    const functions = this.functions.map((fn) => ({
      name: fn.name,
      paramSlots: fn.paramSlots,
      isNested: fn.isNested,
      entryIndex: this.resolveOperand(fn.entryLabel),
    }));

    return {
      instructions: this.instructions,
      constants: this.constants,
      functions,
    };
  }

  resolveOperand(operand) {
    if (!(operand instanceof Label)) return operand;
    if (operand.resolvedIndex === null) {
      throw new Error(`BytecodeBuilder: label "${operand}" was referenced but never placed (unresolved jump target).`);
    }
    return operand.resolvedIndex;
  }
}

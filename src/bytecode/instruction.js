/**
 * Instruction — one bytecode instruction (Phase 10, §29).
 * `operands` are resolved, concrete integers by the time an Instruction is
 * final (constant-pool indices, absolute instruction indices, or plain
 * counts) — see BytecodeBuilder.resolve(), which is what turns the
 * Generator's symbolic labels into the `target` operands here.
 *
 * `line`/`column` carry the source position of the AST node that produced
 * this instruction, purely for `--bytecode`'s listing and for pointing at
 * a specific instruction in future error messages — mirroring how Token
 * and every AST node already carry a position.
 */

import { OPCODE_INFO } from './opcode.js';

export class Instruction {
  constructor(opcode, operands = [], line = null, column = null) {
    this.opcode = opcode;
    this.operands = operands;
    this.line = line;
    this.column = column;
  }

  get stackEffect() {
    return OPCODE_INFO[this.opcode].stackEffect(this.operands);
  }

  toString() {
    const { operands } = this;
    return operands.length === 0 ? this.opcode : `${this.opcode} ${operands.join(' ')}`;
  }
}

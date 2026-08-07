/**
 * DeadCodeElimination (Phase 12, §31, Pass 3). Removes instructions that
 * can never execute: everything strictly after a `RETURN`, `HALT`, or
 * unconditional `JMP`, up to (but not including) the next instruction that
 * something else can actually jump to.
 *
 *   RETURN
 *   PUSH 5      <- unreachable: nothing jumps here, and control never
 *   PRINT 1        falls through past the RETURN above it
 *
 * "Something else can jump to it" is computed once per pass, from the
 * union of every jump target and every function's `entryIndex`
 * (`collectReferencedIndices`) — any such index is a legitimate re-entry
 * point and resets reachability, even immediately after a terminal
 * instruction (a loop's condition label, for instance, often sits right
 * after the body's own final `JMP` back to it).
 *
 * This is unreachable-*code* elimination, not unused-*variable*
 * elimination — it never removes a `STORE` just because its slot is never
 * loaded again; that is `ConstantPropagation`'s job for the one specific,
 * provably-safe case it handles (§ its own class doc).
 */

import { Opcode } from '../../bytecode/opcode.js';
import { collectReferencedIndices, remapProgram } from '../program-utils.js';

export const name = 'DeadCodeElimination';

const TERMINAL_OPCODES = new Set([Opcode.RETURN, Opcode.HALT, Opcode.JMP]);

export function run(program) {
  const { instructions } = program;
  const referenced = collectReferencedIndices(program);

  const keep = new Array(instructions.length).fill(true);
  let unreachable = false;

  for (let i = 0; i < instructions.length; i++) {
    if (referenced.has(i)) unreachable = false;
    if (unreachable) {
      keep[i] = false;
      continue;
    }
    if (TERMINAL_OPCODES.has(instructions[i].opcode)) unreachable = true;
  }

  if (keep.every(Boolean)) return program;
  return remapProgram(program, keep);
}

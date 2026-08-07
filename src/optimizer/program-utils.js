/**
 * Shared helpers for optimizer passes (Phase 12, §31). Every pass operates
 * on the same resolved program shape `generateBytecode()`/`BytecodeBuilder
 * .resolve()` already produce — `{ instructions, constants, functions }`,
 * with every jump `target` operand and every function's `entryIndex`
 * already a concrete instruction index (§29.5 — Labels are fully resolved
 * during generation, long before the optimizer ever runs). That means any
 * pass that deletes instructions must renumber every surviving jump target
 * and entry point itself; this module is the one place that renumbering
 * logic lives, so every pass gets it identically right instead of five
 * slightly-different hand-rolled copies.
 *
 * The renumbering rule (`buildIndexMap`): a jump that targeted a deleted
 * instruction should now land on whatever instruction *now occupies that
 * position* — i.e., the next surviving instruction at or after the
 * deleted one. This is always correct for the transformations every pass
 * in this module performs (removing unreachable code, removing a provably
 * no-op instruction pair, collapsing a jump chain): in each case, the
 * deleted instruction's own role was either "never reached" or "do
 * nothing observable," so whoever used to jump there now correctly falls
 * through to whatever comes next.
 */

import { OPCODE_INFO } from '../bytecode/opcode.js';
import { Instruction } from '../bytecode/instruction.js';

/**
 * `keepFlags[i]` is `true` if instructions[i] survives. Returns the new
 * length and a `mapIndex(oldIndex)` function usable on any old index —
 * surviving or not — that returns its new position (see class doc for the
 * "falls through to what's next" rule for deleted indices). `mapIndex` also
 * accepts `oldIndex === keepFlags.length` (one-past-the-end), returning the
 * new length, so callers never need a special case for "target is exactly
 * off the end" (which the Bytecode Validator would reject anyway).
 */
export function buildIndexMap(keepFlags) {
  const n = keepFlags.length;
  const newIndexOf = new Array(n);
  let next = 0;
  for (let i = 0; i < n; i++) {
    if (keepFlags[i]) newIndexOf[i] = next++;
  }

  const forward = new Array(n + 1);
  forward[n] = next;
  for (let i = n - 1; i >= 0; i--) {
    forward[i] = keepFlags[i] ? newIndexOf[i] : forward[i + 1];
  }

  return {
    newLength: next,
    mapIndex: (oldIndex) => (oldIndex >= n ? next : forward[oldIndex]),
  };
}

/** Every jump target and function entry point currently referenced, as a Set of instruction indices. */
export function collectReferencedIndices(program) {
  const referenced = new Set();
  program.instructions.forEach((instruction) => {
    const { operands: kinds } = OPCODE_INFO[instruction.opcode];
    kinds.forEach((kind, i) => {
      if (kind === 'target') referenced.add(instruction.operands[i]);
    });
  });
  program.functions.forEach((fn) => referenced.add(fn.entryIndex));
  return referenced;
}

function remapInstructionTargets(instruction, mapIndex) {
  const { operands: kinds } = OPCODE_INFO[instruction.opcode];
  if (!kinds.includes('target')) return instruction;
  const operands = instruction.operands.map((value, i) => (kinds[i] === 'target' ? mapIndex(value) : value));
  return new Instruction(instruction.opcode, operands, instruction.line, instruction.column);
}

/**
 * Drops every instruction where `keepFlags[i]` is false, renumbering every
 * surviving jump target and function `entryIndex` accordingly. `constants`
 * is passed through unchanged — dropping instructions never invalidates a
 * constant-pool reference (Pass 7, ConstantPoolOptimization, is the one
 * pass that touches constant indices, and it never removes instructions).
 */
export function remapProgram(program, keepFlags) {
  const { mapIndex } = buildIndexMap(keepFlags);

  const instructions = [];
  program.instructions.forEach((instruction, i) => {
    if (!keepFlags[i]) return;
    instructions.push(remapInstructionTargets(instruction, mapIndex));
  });

  const functions = program.functions.map((fn) => ({ ...fn, entryIndex: mapIndex(fn.entryIndex) }));

  return { instructions, constants: program.constants, functions };
}

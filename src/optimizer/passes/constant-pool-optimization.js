/**
 * ConstantPoolOptimization (Phase 12, §31, Pass 7). By the time this pass
 * runs, six earlier passes have folded, propagated, and deleted
 * instructions — so the constant pool the Bytecode Generator originally
 * built almost always has entries nothing still references (a propagated
 * `const`'s literal is now inlined at every use site directly as a `PUSH`
 * operand pointing at the *same* pool entry it always did, but the
 * now-dead original declaration that used to be its only OTHER reference
 * is gone — the entry itself is still used, just once instead of twice;
 * genuinely orphaned entries come from values that were only ever
 * reachable through code `DeadCodeElimination`/`JumpOptimization` already
 * removed). This pass rebuilds the pool with only the entries still
 * referenced by a surviving instruction, in their original relative
 * order, and rewrites every `const`-kind operand to its new index.
 *
 * "Merge duplicate constants" is, in the normal case, already guaranteed
 * by `ConstantPool.add()`'s own dedup-on-insert behavior (§29.4) — every
 * pass in this pipeline that introduces a *new* constant (`ConstantFolding`
 * /`PeepholeOptimization`) does so through that same `add()` call, so a
 * literal duplicate of an existing entry is never created in the first
 * place. Rebuilding through a fresh `ConstantPool` here anyway makes that
 * guarantee unconditional rather than reliant on every future pass author
 * remembering to route through `add()` — any duplicate that *did* slip in
 * some other way is merged for free, since the fresh pool dedupes exactly
 * the way the original one did.
 */

import { OPCODE_INFO } from '../../bytecode/opcode.js';
import { ConstantPool } from '../../bytecode/constant-pool.js';
import { Instruction } from '../../bytecode/instruction.js';

export const name = 'ConstantPoolOptimization';

export function run(program) {
  const { instructions, constants, functions } = program;

  const usedOldIndices = new Set();
  instructions.forEach((instruction) => {
    const { operands: kinds } = OPCODE_INFO[instruction.opcode];
    kinds.forEach((kind, i) => {
      if (kind === 'const') usedOldIndices.add(instruction.operands[i]);
    });
  });

  const newPool = new ConstantPool();
  const oldToNew = new Map();
  for (let oldIndex = 0; oldIndex < constants.size; oldIndex++) {
    if (!usedOldIndices.has(oldIndex)) continue;
    const { type, value } = constants.get(oldIndex);
    oldToNew.set(oldIndex, newPool.add(type, value));
  }

  const alreadyMinimal = newPool.size === constants.size && [...oldToNew.entries()].every(([oldIndex, newIndex]) => oldIndex === newIndex);
  if (alreadyMinimal) return program;

  const rewritten = instructions.map((instruction) => {
    const { operands: kinds } = OPCODE_INFO[instruction.opcode];
    if (!kinds.includes('const')) return instruction;
    const operands = instruction.operands.map((value, i) => (kinds[i] === 'const' ? oldToNew.get(value) : value));
    return new Instruction(instruction.opcode, operands, instruction.line, instruction.column);
  });

  return { instructions: rewritten, constants: newPool, functions };
}

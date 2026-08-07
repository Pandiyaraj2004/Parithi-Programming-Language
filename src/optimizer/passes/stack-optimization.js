/**
 * StackOptimization (Phase 12, §31, Pass 6). Removes an immediately
 * adjacent push-then-discard pair — `PUSH x; POP` or `LOAD x; POP` — since
 * pushing a value only to discard it unread has no observable effect at
 * all: both halves vanish, net stack effect zero either way.
 *
 * Only `PUSH` and `LOAD` are eligible on the left side. `INPUT` and `CALL`
 * (and `ARRAY_NEW`) are also net-positive-ish operand-stack effects, but
 * each has a real side effect beyond producing a value — `INPUT` reads a
 * line from stdin, `CALL` runs a whole function body (or a built-in) that
 * may print, mutate an array, recurse, or throw, `ARRAY_NEW` allocates.
 * None of those side effects may be skipped just because the *result* goes
 * unused (`say f()` where `f` has no meaningful return value must still
 * call `f`) — so this pass deliberately matches only the two
 * side-effect-free "pure push" opcodes.
 *
 * This pass's own contribution to the brief's "track stack depth, ensure
 * the stack never goes negative" requirement is structural: every pair it
 * removes has a combined stack effect of exactly `+1 - 1 = 0`, so deleting
 * both can never change any surviving instruction's stack depth. The
 * authoritative check remains what `PassManager` already does after every
 * pass — re-running the Bytecode Validator's own `checkStackBalance` walk
 * (§29.6) — rather than a second, parallel bookkeeping system here.
 */

import { Opcode } from '../../bytecode/opcode.js';
import { collectReferencedIndices, remapProgram } from '../program-utils.js';

export const name = 'StackOptimization';

const CANCELABLE_PUSH_OPCODES = new Set([Opcode.PUSH, Opcode.LOAD]);

export function run(program) {
  const { instructions } = program;
  const referenced = collectReferencedIndices(program);
  const keep = new Array(instructions.length).fill(true);

  let i = 0;
  while (i < instructions.length) {
    const a = instructions[i];
    const b = instructions[i + 1];
    if (b && CANCELABLE_PUSH_OPCODES.has(a.opcode) && b.opcode === Opcode.POP && !referenced.has(i) && !referenced.has(i + 1)) {
      keep[i] = false;
      keep[i + 1] = false;
      i += 2;
      continue;
    }
    i += 1;
  }

  if (keep.every(Boolean)) return program;
  return remapProgram(program, keep);
}

/**
 * PeepholeOptimization (Phase 12, §31, Pass 5). Two local, adjacent-
 * instruction rewrites:
 *
 * 1. **`LOAD x; STORE x` removal.** Loading a slot's value and immediately
 *    storing it straight back is a no-op — matches by comparing the two
 *    instructions' resolved slot *name* (not raw constant-pool index),
 *    since a later pass's pool compaction could in principle put the same
 *    name at a different index than the one this exact `LOAD`/`STORE` pair
 *    was originally emitted with.
 *
 * 2. **Re-running `ConstantFolding`'s exact rule.** This is not a
 *    duplicate of Pass 1 by oversight — it's necessary. `ConstantFolding`
 *    runs *before* `ConstantPropagation` (Pass 2) in this pipeline, so it
 *    can only fold a `PUSH, PUSH, <OP>` triple that already exists
 *    verbatim in the Generator's own output. Constant Propagation turning
 *    a `LOAD` into a `PUSH` can expose a *brand new* foldable adjacency
 *    Pass 1 never had a chance to see:
 *
 *      const PI = 3.14                 PUSH 3.14; STORE PI$n
 *      hold area = PI * 10             LOAD PI$n; PUSH 10; MUL
 *
 *    Pass 1 sees `LOAD, PUSH, MUL` — not foldable (a `LOAD` isn't a
 *    literal). Pass 2 rewrites `LOAD PI$n` to `PUSH 3.14` and removes the
 *    now-dead declaration, leaving `PUSH 3.14; PUSH 10; MUL` — *now* a
 *    foldable triple, but Pass 1 has already run and won't revisit it.
 *    This pass, running after both, reuses `constant-folding.js`'s exact
 *    `foldBinaryPair`/`foldUnaryPair` helpers (same computation, same
 *    div/mod-by-zero and jump-target safeguards — see that module's class
 *    doc) to finish the job, collapsing the example above to a single
 *    `PUSH 31.4`.
 *
 * (The instruction set has no `NOP` opcode — §29.3's 26 opcodes don't
 * include one — so the classic peephole rule "remove NOP" has nothing to
 * match against in Parithi Bytecode; it is not implemented as a distinct
 * rule here for exactly that reason, not by oversight.)
 */

import { Opcode } from '../../bytecode/opcode.js';
import { Instruction } from '../../bytecode/instruction.js';
import { collectReferencedIndices, remapProgram } from '../program-utils.js';
import { foldBinaryPair, foldUnaryPair } from './constant-folding.js';

export const name = 'PeepholeOptimization';

export function run(program) {
  let current = program;
  while (true) {
    const next = passOnce(current);
    if (next === current) return current;
    current = next;
  }
}

function passOnce(program) {
  const { instructions, constants } = program;
  const referenced = collectReferencedIndices(program);
  const keep = new Array(instructions.length).fill(true);
  const replace = new Map(); // surviving index -> new constant-pool index (folded PUSH)

  let i = 0;
  while (i < instructions.length) {
    const a = instructions[i];
    const b = instructions[i + 1];

    if (b && a.opcode === Opcode.LOAD && b.opcode === Opcode.STORE && !referenced.has(i) && !referenced.has(i + 1)) {
      const loadedName = constants.get(a.operands[0]).value;
      const storedName = constants.get(b.operands[0]).value;
      if (loadedName === storedName) {
        keep[i] = false;
        keep[i + 1] = false;
        i += 2;
        continue;
      }
    }

    const triple = i + 2 < instructions.length ? foldBinaryPair(instructions, constants, i, referenced) : null;
    if (triple) {
      replace.set(i, constants.add(triple.type, triple.value));
      keep[i + 1] = false;
      keep[i + 2] = false;
      i += 3;
      continue;
    }

    const pair = i + 1 < instructions.length ? foldUnaryPair(instructions, constants, i, referenced) : null;
    if (pair) {
      replace.set(i, constants.add(pair.type, pair.value));
      keep[i + 1] = false;
      i += 2;
      continue;
    }

    i += 1;
  }

  if (replace.size === 0 && keep.every(Boolean)) return program;

  const rewritten = instructions.map((instruction, idx) => {
    if (!replace.has(idx)) return instruction;
    return new Instruction(Opcode.PUSH, [replace.get(idx)], instruction.line, instruction.column);
  });

  return remapProgram({ instructions: rewritten, constants, functions: program.functions }, keep);
}

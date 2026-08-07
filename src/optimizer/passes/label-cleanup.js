/**
 * LabelCleanup (Phase 12, §31, Pass 8). Parithi Bytecode's `Label`
 * placeholders (§29.5) only ever exist *during* Bytecode Generation —
 * `BytecodeBuilder.resolve()` replaces every one with a concrete
 * instruction index before generation finishes (§29.5, §29.7's binary
 * format has no label table at all, only resolved `target` operands). By
 * the time the optimizer ever sees a program, there is no separate
 * symbolic-label structure left to "remove unreferenced labels from" or
 * "renumber" the way an assembler with still-symbolic labels would have —
 * every jump target already *is* the address it points to.
 *
 * What this pass does instead, in that spirit: repeats
 * `JumpOptimization`'s exact jump-chain collapse (Pass 4) one more time,
 * now that `PeepholeOptimization`, `StackOptimization`, and
 * `ConstantPoolOptimization` (Passes 5–7) have all had a chance to shift
 * instructions and expose new jump-to-jump or jump-to-next-instruction
 * indirection that Pass 4 — running *before* any of them — could not yet
 * have seen. This is the practical equivalent of "repair jump targets"
 * for a bytecode format whose targets are already addresses, not names,
 * and it is genuinely useful rather than a no-op restatement of Pass 4:
 * it catches whatever those later passes newly created, not whatever
 * Pass 4 already caught.
 */

import { run as collapseJumps } from './jump-optimization.js';

export const name = 'LabelCleanup';

export function run(program) {
  return collapseJumps(program);
}

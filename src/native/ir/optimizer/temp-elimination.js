/**
 * Pass F — Redundant Temporary Elimination (§4F of the IR-optimizer
 * brief) — copy propagation for `COPY` instructions specifically. `COPY`
 * is never emitted by the AST→IR generator directly; it only ever
 * appears as Algebraic Simplification's output (`x + 0` → `COPY x`), so
 * this pass is what turns that into a genuinely simplified result rather
 * than leaving an extra `t5 = COPY x` + later `... t5 ...` indirection
 * behind: `t1 = x` followed by `y = t1` becomes `y = x`, exactly the
 * brief's own example.
 *
 * SAFETY: a `COPY`'s source is substituted into every later use within
 * the SAME block (temps never cross blocks — see ir-generator.js's own
 * class doc, restated in constant-folding.js) — never into a `STORE`'s
 * own target position (a write, not a read).
 */

import { IrOp } from '../ir-nodes.js';

function eliminateInBlock(block, stats) {
  const replacements = new Map(); // tempId -> Operand it copies

  const resolve = (operand) => {
    if (operand.kind === 'temp' && replacements.has(operand.id)) return replacements.get(operand.id);
    return operand;
  };

  const kept = [];
  for (const instr of block.instructions) {
    const startIndex = instr.op === IrOp.STORE ? 1 : 0;
    for (let i = startIndex; i < instr.args.length; i++) instr.args[i] = resolve(instr.args[i]);

    if (instr.op === IrOp.COPY && instr.dest?.kind === 'temp') {
      replacements.set(instr.dest.id, instr.args[0]);
      stats.redundantTemporaryElimination++;
      continue; // the COPY itself is now redundant — drop it
    }
    kept.push(instr);
  }
  block.instructions = kept;

  if (block.terminator.kind === 'BRANCH') block.terminator.condition = resolve(block.terminator.condition);
  else if (block.terminator.kind === 'RETURN' && block.terminator.value) block.terminator.value = resolve(block.terminator.value);
}

/** @returns {{ redundantTemporaryElimination: number }} count of COPY instructions eliminated */
export function temporaryElimination(program) {
  const stats = { redundantTemporaryElimination: 0 };
  for (const fn of program.functions) {
    for (const block of fn.blocks) eliminateInBlock(block, stats);
  }
  return stats;
}

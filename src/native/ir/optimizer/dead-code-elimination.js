/**
 * Pass D — Dead Code Elimination (§4D of the IR-optimizer brief).
 * Removes two distinct kinds of dead instruction, each checked whole-
 * program (not just locally) before anything is deleted:
 *
 *   1. A PURE, value-producing instruction (`PURE_OPS` — CONST/arithmetic/
 *      comparison/NEG/NOT/LOAD/COPY) whose `temp` result is never read
 *      anywhere. Safe because these ops have no effect beyond producing
 *      that value — by definition of `PURE_OPS` (ir-nodes.js).
 *   2. A `STORE` to a variable that is never READ anywhere in the whole
 *      program. Safe because a Parithi scalar variable has no aliasing —
 *      nothing outside a read of that exact name can observe the store.
 *
 * SAFETY — what this pass NEVER removes, no matter how "unused" its
 * result looks (§6 of the brief: "do NOT remove foo() just because its
 * return value is unused — it may have side effects"):
 *   - `CALL` — not in `PURE_OPS`; a function (built-in or user `task`) may
 *     print, mutate something, or otherwise have an externally-observable
 *     effect the IR has no way to prove absent.
 *   - `PRINT` — always externally observable by definition.
 *   - Every block terminator (`JUMP`/`BRANCH`/`RETURN`) — control flow is
 *     never touched by this pass (see unreachable-code-elimination.js for
 *     the pass that removes whole unreachable BLOCKS instead).
 *
 * Iterates to a fixed point (matching the Bytecode Optimizer's own
 * convergence loop, `src/optimizer/optimizer.js`): removing one dead
 * instruction can orphan another (e.g. the `CONST` that fed a now-removed
 * `ADD`), so this keeps sweeping until a full pass removes nothing.
 */

import { PURE_OPS } from '../ir-nodes.js';

/**
 * `usedTemps` is scoped PER FUNCTION — a virtual register's id is only
 * unique *within* the function that defines it (each function's temp
 * counter restarts at 0 — see ir-generator.js's `beginFunction`), so a
 * single program-wide `Set<tempId>` would treat function A's `t0` being
 * used as proof that function B's completely unrelated `t0` is used too.
 * (This exact bug was caught by manually tracing a case where it produced
 * a wrong "0 removed" result, not by inspection — see the regression test
 * this bug is named after in dead-code-elimination.test.js.)
 * `usedVars`, by contrast, is safe to keep whole-program: every variable
 * name is already globally unique (ir-generator.js's slot mangling).
 */
function collectUsed(program) {
  const usedTempsByFunction = new Map(); // fn.name -> Set<tempId>
  const usedVars = new Set();

  for (const fn of program.functions) {
    const usedTemps = new Set();
    usedTempsByFunction.set(fn.name, usedTemps);

    const noteOperand = (operand) => {
      if (!operand) return;
      if (operand.kind === 'temp') usedTemps.add(operand.id);
      if (operand.kind === 'var') usedVars.add(operand.name);
    };

    for (const block of fn.blocks) {
      for (const instr of block.instructions) {
        const startIndex = instr.op === 'STORE' ? 1 : 0; // STORE's own target (args[0]) is a write, not a read
        for (let i = startIndex; i < instr.args.length; i++) noteOperand(instr.args[i]);
      }
      if (block.terminator.kind === 'BRANCH') noteOperand(block.terminator.condition);
      if (block.terminator.kind === 'RETURN') noteOperand(block.terminator.value);
    }
  }
  return { usedTempsByFunction, usedVars };
}

function sweepOnce(program) {
  const { usedTempsByFunction, usedVars } = collectUsed(program);
  let removed = 0;

  for (const fn of program.functions) {
    const usedTemps = usedTempsByFunction.get(fn.name);
    for (const block of fn.blocks) {
      const kept = [];
      for (const instr of block.instructions) {
        const isDeadStore = instr.op === 'STORE' && !usedVars.has(instr.args[0].name);
        const isDeadPureValue = PURE_OPS.has(instr.op) && instr.dest?.kind === 'temp' && !usedTemps.has(instr.dest.id);
        if (isDeadStore || isDeadPureValue) {
          removed++;
          continue;
        }
        kept.push(instr);
      }
      block.instructions = kept;
    }
  }
  return removed;
}

/** @returns {{ deadCodeElimination: number }} count of instructions removed */
export function deadCodeElimination(program, { maxIterations = 10 } = {}) {
  let total = 0;
  for (let i = 0; i < maxIterations; i++) {
    const removed = sweepOnce(program);
    total += removed;
    if (removed === 0) break;
  }
  return { deadCodeElimination: total };
}

/**
 * IR Optimization Pipeline (§5 of the IR-optimizer brief) — runs the six
 * passes in the specified order, each independently enable/disable-able:
 *
 *   IR → Constant Folding → Constant Propagation → Algebraic Simplification
 *      → Dead Code Elimination → Unreachable Code Elimination
 *      → Redundant Temporary Elimination → Optimized IR
 *
 * Mutates the given IRProgram in place and returns it alongside
 * statistics — a deliberate difference from the Bytecode Optimizer's own
 * "return a new, untouched-input program" convention
 * (`src/optimizer/pass-manager.js`): that convention exists there to make
 * before/after statistics diffing trivial across an immutable snapshot;
 * here, nothing else holds a reference to an intermediate IR state that
 * needs preserving (this pipeline is the sole consumer between
 * generation and codegen), so in-place mutation is simpler with no loss
 * of safety — noted explicitly so the difference reads as a deliberate
 * choice, not an inconsistency.
 *
 * CONVERGENCE: like the Bytecode Optimizer, one sweep through all enabled
 * passes doesn't always reach a global fixed point in one pass (e.g.
 * Algebraic Simplification's `COPY` output only becomes eliminable by a
 * LATER sweep's Redundant Temporary Elimination once Dead Code
 * Elimination has cleared out whatever depended on the old value) — so
 * the whole enabled sequence re-runs until a full sweep changes nothing,
 * capped at `maxSweeps` as a defensive backstop.
 */

import { constantFolding } from './constant-folding.js';
import { constantPropagation } from './constant-propagation.js';
import { algebraicSimplification } from './algebraic-simplification.js';
import { deadCodeElimination } from './dead-code-elimination.js';
import { unreachableCodeElimination } from './unreachable-code-elimination.js';
import { temporaryElimination } from './temp-elimination.js';

export const DEFAULT_OPTIMIZER_CONFIG = Object.freeze({
  constantFolding: true,
  constantPropagation: true,
  algebraicSimplification: true,
  deadCodeElimination: true,
  unreachableCodeElimination: true,
  redundantTemporaryElimination: true,
});

const PASSES = [
  { key: 'constantFolding', run: constantFolding },
  { key: 'constantPropagation', run: constantPropagation },
  { key: 'algebraicSimplification', run: algebraicSimplification },
  { key: 'deadCodeElimination', run: deadCodeElimination },
  { key: 'unreachableCodeElimination', run: unreachableCodeElimination },
  { key: 'redundantTemporaryElimination', run: temporaryElimination },
];

function emptyStatistics() {
  return Object.fromEntries(PASSES.map((p) => [p.key, 0]));
}

/**
 * @param {import('../ir-nodes.js').IRProgram} program
 * @param {object} [config] - e.g. `{ constantFolding: true, deadCodeElimination: false }`; any key omitted defaults to enabled (`DEFAULT_OPTIMIZER_CONFIG`)
 * @param {number} [maxSweeps]
 * @returns {{ program: import('../ir-nodes.js').IRProgram, statistics: Record<string, number> }}
 */
export function optimize(program, config = {}, maxSweeps = 4) {
  const options = { ...DEFAULT_OPTIMIZER_CONFIG, ...config };
  const statistics = emptyStatistics();

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let changedThisSweep = 0;
    for (const pass of PASSES) {
      if (!options[pass.key]) continue;
      const result = pass.run(program);
      const count = Object.values(result)[0];
      statistics[pass.key] += count;
      changedThisSweep += count;
    }
    if (changedThisSweep === 0) break;
  }

  return { program, statistics };
}

const STAT_LABELS = Object.freeze({
  constantFolding: 'Constant folding',
  constantPropagation: 'Constant propagation',
  algebraicSimplification: 'Algebraic simplifications',
  deadCodeElimination: 'Dead instructions removed',
  unreachableCodeElimination: 'Unreachable blocks removed',
  redundantTemporaryElimination: 'Redundant temporaries eliminated',
});

/** `pari --native --optimizer-stats` (§9 of the brief) — human-readable, matching the brief's own example format. */
export function formatOptimizerStatistics(statistics) {
  const lines = ['Optimization Results'];
  for (const [key, label] of Object.entries(STAT_LABELS)) {
    lines.push(`${label}: ${statistics[key] ?? 0}`);
  }
  const total = Object.values(statistics).reduce((sum, n) => sum + n, 0);
  lines.push(`Total changes: ${total}`);
  return lines.join('\n');
}

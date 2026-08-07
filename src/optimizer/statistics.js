/**
 * computeStatistics — before/after/removed counts for a completed
 * optimization run (Phase 12, §31, Pass 9), plus the per-pass breakdown
 * `PassManager.run()` already collected while executing Passes 1–8. Pure
 * arithmetic over already-known counts — no bytecode inspection of its
 * own — kept as a separate module from `optimizer-report.js` so the raw
 * numbers (useful to a test or a future tool) are available independent
 * of any particular text formatting of them.
 */

export function computeStatistics(before, after, passReports) {
  const instructionsBefore = before.instructions.length;
  const instructionsAfter = after.instructions.length;
  const constantsBefore = before.constants.size;
  const constantsAfter = after.constants.size;

  const removedInstructions = instructionsBefore - instructionsAfter;
  const removedConstants = constantsBefore - constantsAfter;
  const optimizationRatio = instructionsBefore === 0 ? 0 : (removedInstructions / instructionsBefore) * 100;

  return {
    instructionsBefore,
    instructionsAfter,
    removedInstructions,
    constantsBefore,
    constantsAfter,
    removedConstants,
    optimizationRatio,
    executionEstimate: removedInstructions > 0 ? 'Faster' : 'No Change',
    passReports,
  };
}

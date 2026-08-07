/**
 * formatOptimizerReport — the human-readable text `pari <file.pr> --stats`
 * prints (Phase 12, §31, Pass 9), mirroring the plain, labeled-columns
 * style `formatBytecodeText()` (§29.7) already established for
 * `--bytecode`'s listing, rather than inventing a different report format
 * for this one command.
 */

/** Signed delta, e.g. `-2`, `+1`, `0` — a pass's constant count can legitimately grow (ConstantFolding/Peephole pool a brand-new folded value) before ConstantPoolOptimization later shrinks it, so a plain "-N" would misrender as "--1" for a positive delta. */
function signedDelta(removedCount) {
  if (removedCount > 0) return `-${removedCount}`;
  if (removedCount < 0) return `+${-removedCount}`;
  return '0';
}

export function formatOptimizerReport(statistics, { title = 'Optimization Report' } = {}) {
  const lines = [title, '-'.repeat(72), ''];

  lines.push(`Instructions Before   : ${statistics.instructionsBefore}`);
  lines.push(`Instructions After    : ${statistics.instructionsAfter}`);
  lines.push(`Removed Instructions  : ${statistics.removedInstructions}`);
  lines.push('');
  lines.push(`Constants Before      : ${statistics.constantsBefore}`);
  lines.push(`Constants After       : ${statistics.constantsAfter}`);
  lines.push(`Removed Constants     : ${statistics.removedConstants}`);
  lines.push('');
  lines.push(`Optimization Ratio    : ${statistics.optimizationRatio.toFixed(2)}%`);
  lines.push(`Execution Estimate    : ${statistics.executionEstimate}`);

  lines.push('');
  lines.push('Per-Pass Breakdown:');
  if (statistics.passReports.length === 0) {
    lines.push('  (no passes ran)');
  } else {
    for (const pass of statistics.passReports) {
      const status = pass.changed ? 'changed' : 'no change';
      lines.push(
        `  ${pass.name.padEnd(28)} ${pass.instructionsBefore} -> ${pass.instructionsAfter} instr. ` +
          `(${signedDelta(pass.instructionsRemoved)}), ${pass.constantsBefore} -> ${pass.constantsAfter} const. (${signedDelta(pass.constantsRemoved)}) [${status}]`,
      );
    }
  }

  return lines.join('\n');
}

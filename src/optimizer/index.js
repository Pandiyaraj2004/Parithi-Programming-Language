/**
 * Barrel export for the optimizer module (Phase 12, §31) — matching the
 * bytecode/ and vm/ modules' own convention (commands.js imports from
 * "optimizer/index.js" rather than reaching into individual files).
 */

export { optimizeBytecode, DEFAULT_PASSES } from './optimizer.js';
export { PassManager } from './pass-manager.js';
export { OptimizerError } from './optimizer-error.js';
export { computeStatistics } from './statistics.js';
export { formatOptimizerReport } from './optimizer-report.js';

/**
 * OptimizerError — thrown when a pass produces bytecode that fails the
 * Phase 10 Validator (§29.6), which `PassManager` re-runs after every
 * single pass (Phase 12 brief: "If optimization creates invalid bytecode,
 * reject it immediately. Never emit invalid bytecode."). Every correctly
 * implemented pass should make this unreachable in practice — the same
 * "should never happen, but if it somehow does, fail loudly and clearly
 * rather than silently corrupt the program" spirit as `reportBytecodeBug`
 * (`src/cli/commands.js`) and `P023` (§18): an optimizer bug is a Parithi
 * implementation bug, never a defect in the user's source program.
 */

export class OptimizerError extends Error {
  constructor(passName, errors) {
    super(
      `Bytecode Optimizer: pass "${passName}" produced invalid bytecode — this is a bug in the optimizer itself, not in your program:\n${errors
        .map((message) => `  - ${message}`)
        .join('\n')}`,
    );
    this.name = 'OptimizerError';
    this.passName = passName;
    this.errors = errors;
  }
}

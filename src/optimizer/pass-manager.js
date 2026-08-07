/**
 * PassManager — runs a fixed, ordered list of optimizer passes over a
 * bytecode program (Phase 12, §31). Each pass is `{ name, run(program) }`,
 * pure (returns a new program rather than mutating its input — a pass with
 * nothing to do is allowed to return the exact same object it was given,
 * which every pass in this codebase does, purely as a cheap "did anything
 * change" signal for the pipeline's own statistics).
 *
 * After every pass, the result is re-validated with the same
 * `validateBytecode()` the Bytecode Generator itself already runs (§29.6)
 * — never only once at the very end. This is the brief's own explicit
 * requirement ("Run Bytecode Validator again [...] Never emit invalid
 * bytecode") and it is also what makes every individual pass's own
 * correctness argument mechanically checked rather than merely asserted in
 * a comment, exactly like `tests/vm-parity.test.js` did for Phase 11.
 */

import { validateBytecode } from '../bytecode/validator.js';
import { OptimizerError } from './optimizer-error.js';

export class PassManager {
  constructor(passes) {
    this.passes = passes;
  }

  run(program) {
    let current = program;
    const passReports = [];

    for (const pass of this.passes) {
      const instructionsBefore = current.instructions.length;
      const constantsBefore = current.constants.size;

      const result = pass.run(current);

      const { valid, errors } = validateBytecode(result);
      if (!valid) {
        throw new OptimizerError(pass.name, errors);
      }

      passReports.push({
        name: pass.name,
        instructionsBefore,
        instructionsAfter: result.instructions.length,
        instructionsRemoved: instructionsBefore - result.instructions.length,
        constantsBefore,
        constantsAfter: result.constants.size,
        constantsRemoved: constantsBefore - result.constants.size,
        changed: result !== current,
      });

      current = result;
    }

    return { program: current, passReports };
  }
}

/**
 * optimizeBytecode — the Phase 12 (§31) entry point. Takes the exact same
 * resolved program shape `generateBytecode()` produces (already validated
 * by the caller, per the existing `--bytecode`/`--compile` convention —
 * §29.6, `src/cli/commands.js`'s `analyzeForBytecode`/`printBytecode`),
 * runs the fixed, ordered pipeline of Passes 1–8 through `PassManager`
 * (which re-validates after every single pass — never emits invalid
 * bytecode, per the brief), and returns the optimized program together
 * with the Pass 9 statistics report.
 *
 * Deliberately positioned as a pure, additive post-processing stage
 * between the (protected, unmodified) Bytecode Generator and the
 * (protected, unmodified) Validator/PVM: nothing here changes what any
 * instruction *means* (§30's execution semantics are untouched — this
 * module only ever deletes, reorders-by-deletion, or replaces a sequence
 * with a shorter one computing the identical result), so every optimized
 * program remains executable by the exact same, unmodified PVM that
 * executes an unoptimized one, and produces the exact same observable
 * output (`tests/optimizer.test.js`'s regression suite proves this
 * mechanically, the same way `tests/vm-parity.test.js` proved Interpreter/
 * PVM parity in Phase 11).
 *
 * **Why the whole 8-pass sequence runs more than once.** Passes 1–8 have a
 * fixed order for a reason (each is written assuming the shape the
 * previous ones leave behind — Peephole re-folding what Propagation just
 * exposed, §31's peephole-optimization.js class doc) — but that order
 * doesn't always reach a *global* fixed point in one sweep. A concrete
 * case: `const PI = 3.14 / hold area = PI * 10` — Constant Propagation
 * inlines `PI`, which Peephole then folds into a single `PUSH 31.4`, but
 * that folded value is stored into `area` *after* Propagation already ran
 * for this sweep, so `area` itself (now also single-assignment-from-a-
 * literal) isn't inlined until Propagation runs *again*. Rather than
 * reordering the pipeline (which would contradict the brief's own fixed
 * numbered sequence) or hand-writing a second, narrower pass just for this
 * one interaction, `optimizeBytecode` re-runs the entire ordered sequence
 * until a full sweep reports zero changes across all eight passes, capped
 * at `maxIterations` as a defensive backstop against a hypothetical
 * pass-interaction cycle (none exists today — every individual pass only
 * ever removes instructions/constants or replaces a run with a strictly
 * shorter one, so the instruction count is a strictly decreasing, bounded-
 * below sequence across sweeps, and convergence is guaranteed well under
 * the cap for any real program). Every sweep still validates after every
 * single pass exactly as before — repeating the sequence changes nothing
 * about the per-pass safety guarantee, only how many times the already-
 * safe sequence runs.
 */

import { validateBytecode } from '../bytecode/validator.js';
import { PassManager } from './pass-manager.js';
import { OptimizerError } from './optimizer-error.js';
import { computeStatistics } from './statistics.js';
import * as ConstantFolding from './passes/constant-folding.js';
import * as ConstantPropagation from './passes/constant-propagation.js';
import * as DeadCodeElimination from './passes/dead-code-elimination.js';
import * as JumpOptimization from './passes/jump-optimization.js';
import * as PeepholeOptimization from './passes/peephole-optimization.js';
import * as StackOptimization from './passes/stack-optimization.js';
import * as ConstantPoolOptimization from './passes/constant-pool-optimization.js';
import * as LabelCleanup from './passes/label-cleanup.js';

/** Fixed pipeline order, exactly as specified (Phase 12 brief, "Pipeline"). */
export const DEFAULT_PASSES = [
  ConstantFolding,
  ConstantPropagation,
  DeadCodeElimination,
  JumpOptimization,
  PeepholeOptimization,
  StackOptimization,
  ConstantPoolOptimization,
  LabelCleanup,
];

export function optimizeBytecode(program, { passes = DEFAULT_PASSES, maxIterations = 4 } = {}) {
  const inputCheck = validateBytecode(program);
  if (!inputCheck.valid) {
    // The optimizer only ever runs on Generator output that has already
    // passed this same check once (§29.6) — reaching here with an invalid
    // input program indicates a caller bug, not a pass bug, but it's
    // reported the same defensive way either way (never guess at what an
    // already-broken program "should" optimize to).
    throw new OptimizerError('(pre-optimization input)', inputCheck.errors);
  }

  const manager = new PassManager(passes);
  let current = program;
  const passReports = [];

  for (let sweep = 0; sweep < maxIterations; sweep++) {
    const result = manager.run(current);
    passReports.push(...result.passReports.map((report) => ({ ...report, sweep })));
    current = result.program;
    if (!result.passReports.some((report) => report.changed)) break;
  }

  const statistics = computeStatistics(program, current, passReports);
  return { program: current, statistics };
}

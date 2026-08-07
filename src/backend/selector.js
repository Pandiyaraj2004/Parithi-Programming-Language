/**
 * BackendSelector (Phase 14 — Adaptive Execution Engine).
 *
 * Chooses, for a given validated (post-Semantic-Analysis) AST, which of
 * the three coexisting backends should run it — Native x86-64, Bytecode +
 * PVM, or the Tree-Walking Interpreter, in that priority order — using
 * only the static capability checks in capability.js. No backend is ever
 * invoked speculatively: the winning backend is decided first, and only
 * that one backend ever touches the program.
 */

import { BACKENDS } from './capability.js';

/**
 * @param {object} program - a parsed + semantically-analyzed `Program` AST node
 * @param {string} filePath
 * @returns {{
 *   selected: 'native'|'bytecode'|'interpreter',
 *   selectedLabel: string,
 *   evaluations: Array<{id: string, label: string, supported: boolean, feature?: string, reason?: string, error?: Error}>,
 * }}
 *   `evaluations` always covers every backend, in priority order — not just
 *   the winner — so `--explain-backend` can report every backend's status
 *   in one pass without re-running any check.
 */
export function selectBackend(program, filePath) {
  const evaluations = BACKENDS.map(({ id, label, check }) => ({ id, label, ...check(program, filePath) }));
  const { selected, selectedLabel } = selectFromEvaluations(evaluations);
  return { selected, selectedLabel, evaluations };
}

/**
 * The actual "priority order, first supported wins" decision, factored out
 * from `selectBackend()` so it can be unit-tested against synthetic
 * evaluation lists covering every outcome (native-selected,
 * bytecode-selected, interpreter-selected) — including outcomes today's
 * real capability checks can never produce (Bytecode currently reports
 * `supported: true` for every program that reaches here, so no real
 * Parithi program can exercise the interpreter-selected branch through
 * automatic selection yet; see capability.js's own class doc).
 */
export function selectFromEvaluations(evaluations) {
  // Interpreter's real check always reports `supported: true`
  // (capability.js), so this list always contains at least one match when
  // built from BACKENDS — never falls through in practice.
  const winner = evaluations.find((evaluation) => evaluation.supported);
  return { selected: winner.id, selectedLabel: winner.label };
}

/** Evaluates a single named backend — used by `--backend <name>` forced selection, which never consults the other two. */
export function evaluateBackend(id, program, filePath) {
  const backend = BACKENDS.find((candidate) => candidate.id === id);
  return { id: backend.id, label: backend.label, ...backend.check(program, filePath) };
}

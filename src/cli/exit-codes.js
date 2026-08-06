/**
 * Process exit codes (Phase 7 — MASTER_DOCUMENT.md §19).
 * One stable table so every CLI code path exits with the same meaning
 * instead of ad-hoc `process.exitCode = 1` sprinkled across commands.js.
 *
 *   0  Success             — the requested command completed normally.
 *   1  Compiler Error      — the Lexer, Parser, or Semantic Analyzer
 *                            rejected the program before it ever ran.
 *   2  Runtime Error       — the program parsed and type-checked but
 *                            failed while executing (P006, P020-P023, ...).
 *   3  CLI Usage Error     — the command line itself was invalid: a bad
 *                            flag, a missing/unreadable/wrong-extension
 *                            file, or a missing required argument. The
 *                            program's own source was never inspected.
 */

export const ExitCode = Object.freeze({
  SUCCESS: 0,
  COMPILER_ERROR: 1,
  RUNTIME_ERROR: 2,
  USAGE_ERROR: 3,
});

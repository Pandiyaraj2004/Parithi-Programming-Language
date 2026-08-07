/**
 * Program arguments (Phase 13, §32.9) — the extra CLI words trailing the
 * source file (`pari script.pr foo bar` → arguments() returns ["foo",
 * "bar"]), captured once by src/cli/commands.js before the program starts
 * and read back by the `arguments()` built-in. A small shared module,
 * not a constructor parameter threaded through the Interpreter/VM, because
 * both backends reach `arguments()` through the exact same
 * interpreter/builtins/index.js dispatch (§30.2's reuse principle) with no
 * shared "program context" object between them to carry it on instead.
 */

let currentArguments = [];

export function setProgramArguments(args) {
  currentArguments = Array.isArray(args) ? [...args] : [];
}

export function getProgramArguments() {
  return [...currentArguments];
}

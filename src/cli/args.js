/**
 * Parses raw CLI arguments into a structured options object.
 * Kept separate from commands.js so argument-parsing rules can change
 * without touching command dispatch logic (MASTER_DOCUMENT.md §19).
 *
 * Phase 7: parsing failures throw a CliUsageError (message + hint) instead
 * of a bare Error, and unrecognized flags get a "did you mean" suggestion
 * via Levenshtein distance against the known flag list — the same DX
 * convention as git/cargo/rustc, rather than a flat "unknown flag" dead end.
 *
 * Phase 12 (§31) adds three optimizer-related flags with two different
 * calling conventions, both intentional:
 *   - `--optimize` is a **modifier**, exactly like `--verbose` already is —
 *     it may appear anywhere in argv (`pari hello.pr --optimize` or
 *     `pari --optimize hello.pr`) and composes with whatever primary mode
 *     was selected (`run`, `bytecode`, `compile`, `run-bytecode`); each of
 *     those modes' own handler in commands.js decides what "optimize" means
 *     for itself.
 *   - `--stats` / `--disassemble` are **dedicated modes** (like
 *     `--bytecode`), but — unlike every other dedicated mode — the Phase 12
 *     brief's own CLI examples show them trailing the filename
 *     (`pari hello.pr --stats`), not leading it. Both forms are accepted:
 *     leading works automatically (they're in FLAG_MODES like any other
 *     mode flag), and `TRAILING_MODE_FLAGS` below additionally recognizes
 *     the trailing form without requiring two different spellings.
 */

import { CliUsageError } from './cli-error.js';
import { findClosestMatch } from './suggestions.js';

const FLAG_MODES = Object.freeze({
  '--tokens': 'tokens',
  '--ast': 'ast',
  '--analyze': 'analyze',
  '--runtime': 'runtime',
  '--bytecode': 'bytecode',
  '--compile': 'compile',
  '--run-bytecode': 'run-bytecode',
  '--stats': 'stats',
  '--disassemble': 'disassemble',
  '--native': 'native',
  '--version': 'version',
  '--help': 'help',
  '-h': 'help',
});

// Flags that stand alone — they never take a following file argument.
const STANDALONE_MODES = new Set(['help', 'version']);

// Dedicated-mode flags that the Phase 12 brief itself demonstrates trailing
// the filename (`pari hello.pr --stats`) rather than leading it — accepted
// in either position; see the class doc above.
const TRAILING_MODE_FLAGS = new Set(['--stats', '--disassemble']);

// Phase 13 native-compiler modifiers — exactly like --verbose/--optimize,
// may appear anywhere in argv and only affect what `--native` does with
// its output (§14 of the native-compiler brief: "do not expose unstable
// internal details as the default user experience" — --asm/--ir are
// opt-in inspection, never the default).
const BOOLEAN_MODIFIER_FLAGS = ['--verbose', '--optimize', '--asm', '--ir'];

const KNOWN_FLAGS = [...Object.keys(FLAG_MODES), ...BOOLEAN_MODIFIER_FLAGS, '-o'];

export function parseArgs(argv) {
  const verbose = argv.includes('--verbose');
  const optimize = argv.includes('--optimize');
  const asm = argv.includes('--asm');
  const ir = argv.includes('--ir');
  let rest = argv.filter((arg) => !BOOLEAN_MODIFIER_FLAGS.includes(arg));

  // `-o <path>` (Phase 13, §13: native output path) — the one value-taking
  // flag in this parser; extracted before every other flag/positional rule
  // below so it can appear anywhere, same spirit as the boolean modifiers.
  let outputPath = null;
  const outputFlagIndex = rest.indexOf('-o');
  if (outputFlagIndex !== -1) {
    if (!rest[outputFlagIndex + 1]) {
      throw new CliUsageError('Missing output path after "-o".', 'Usage: pari --native <file.pr> -o <output.exe>');
    }
    outputPath = rest[outputFlagIndex + 1];
    rest = [...rest.slice(0, outputFlagIndex), ...rest.slice(outputFlagIndex + 2)];
  }

  const modifiers = { verbose, optimize, asm, ir, outputPath };

  if (rest.length === 0) {
    throw new CliUsageError(
      'No input file specified.',
      'Usage: pari <file.pr> [options]. Run "pari --help" for more information.',
    );
  }

  // Trailing-form support for --stats/--disassemble (see class doc) — only
  // consulted when the flag isn't already in leading position, so the
  // existing leading-flag path below remains the single source of truth
  // whenever both forms could apply.
  if (!Object.prototype.hasOwnProperty.call(FLAG_MODES, rest[0])) {
    const trailingFlag = rest.find((arg) => TRAILING_MODE_FLAGS.has(arg));
    if (trailingFlag) {
      const withoutFlag = rest.filter((arg) => arg !== trailingFlag);
      if (withoutFlag.length === 1 && !withoutFlag[0].startsWith('-')) {
        return { mode: FLAG_MODES[trailingFlag], file: withoutFlag[0], ...modifiers };
      }
    }
  }

  const [first, second] = rest;

  if (Object.prototype.hasOwnProperty.call(FLAG_MODES, first)) {
    const mode = FLAG_MODES[first];
    if (STANDALONE_MODES.has(mode)) {
      return { mode, file: null, ...modifiers };
    }
    if (!second) {
      throw new CliUsageError(
        `Missing source file after "${first}".`,
        `Usage: pari ${first} <file.pr>`,
      );
    }
    // Phase 13 (§32.9): any words after the file are the program's own
    // arguments() — e.g. `pari --run-bytecode script.pr foo bar` runs
    // script.pr with arguments() === ["foo", "bar"]. Harmless to include
    // for modes that never execute the program (--tokens/--ast/etc. simply
    // never read it back).
    return { mode, file: second, ...modifiers, programArgs: rest.slice(2) };
  }

  if (first.startsWith('-')) {
    const suggestion = findClosestMatch(first, KNOWN_FLAGS);
    throw new CliUsageError(
      `Unknown flag "${first}".`,
      suggestion ? `Did you mean "${suggestion}"?` : 'Run "pari --help" for a list of valid flags.',
    );
  }

  // Phase 13 (§32.9): `pari script.pr foo bar` → arguments() === ["foo", "bar"].
  return { mode: 'run', file: first, ...modifiers, programArgs: rest.slice(1) };
}

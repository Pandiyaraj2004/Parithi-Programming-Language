/**
 * Parses raw CLI arguments into a structured options object.
 * Kept separate from commands.js so argument-parsing rules can change
 * without touching command dispatch logic (MASTER_DOCUMENT.md §19).
 *
 * Phase 7: parsing failures throw a CliUsageError (message + hint) instead
 * of a bare Error, and unrecognized flags get a "did you mean" suggestion
 * via Levenshtein distance against the known flag list — the same DX
 * convention as git/cargo/rustc, rather than a flat "unknown flag" dead end.
 */

import { CliUsageError } from './cli-error.js';
import { findClosestMatch } from './suggestions.js';

const FLAG_MODES = Object.freeze({
  '--tokens': 'tokens',
  '--ast': 'ast',
  '--analyze': 'analyze',
  '--runtime': 'runtime',
  '--version': 'version',
  '--help': 'help',
  '-h': 'help',
});

// Flags that stand alone — they never take a following file argument.
const STANDALONE_MODES = new Set(['help', 'version']);

const KNOWN_FLAGS = [...Object.keys(FLAG_MODES), '--verbose'];

export function parseArgs(argv) {
  const verbose = argv.includes('--verbose');
  const rest = argv.filter((arg) => arg !== '--verbose');

  if (rest.length === 0) {
    throw new CliUsageError(
      'No input file specified.',
      'Usage: pari <file.pr> [options]. Run "pari --help" for more information.',
    );
  }

  const [first, second] = rest;

  if (Object.prototype.hasOwnProperty.call(FLAG_MODES, first)) {
    const mode = FLAG_MODES[first];
    if (STANDALONE_MODES.has(mode)) {
      return { mode, file: null, verbose };
    }
    if (!second) {
      throw new CliUsageError(
        `Missing source file after "${first}".`,
        `Usage: pari ${first} <file.pr>`,
      );
    }
    return { mode, file: second, verbose };
  }

  if (first.startsWith('-')) {
    const suggestion = findClosestMatch(first, KNOWN_FLAGS);
    throw new CliUsageError(
      `Unknown flag "${first}".`,
      suggestion ? `Did you mean "${suggestion}"?` : 'Run "pari --help" for a list of valid flags.',
    );
  }

  return { mode: 'run', file: first, verbose };
}

/**
 * CliUsageError — a problem with the command line itself (bad flag, missing
 * or unreadable file, wrong extension, missing required argument), as
 * distinct from a CompilerError (the program's source was rejected) or a
 * ParithiRuntimeError (the program failed while running). Kept as its own
 * small class rather than reusing CompilerError so `runCli` can tell "the
 * CLI invocation was wrong" apart from "the .pr program was wrong" and map
 * each to its own exit code (see exit-codes.js).
 */

export class CliUsageError extends Error {
  constructor(message, hint = null) {
    super(message);
    this.name = 'CliUsageError';
    this.hint = hint;
  }

  format() {
    const lines = [`Error: ${this.message}`];
    if (this.hint) lines.push(`Hint: ${this.hint}`);
    return lines.join('\n');
  }
}

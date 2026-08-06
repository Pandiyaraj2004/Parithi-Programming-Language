/**
 * ParseError — a syntax error raised during parsing (P003, P011, P012, P013).
 * Extends the shared CompilerError so it formats identically to lexer/future
 * semantic errors, but adds structured `expected`/`actual` fields, matching
 * the Phase 2 brief's explicit requirement for those as separate fields
 * (not just prose baked into the message).
 */

import { CompilerError } from '../errors/index.js';

export class ParseError extends CompilerError {
  constructor(code, message, location, { expected = null, actual = null, hint = null } = {}) {
    super(code, message, location, hint);
    this.name = 'ParseError';
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * MultiParseError — a container for every ParseError collected during a
 * single parse when panic-mode recovery is used (see Parser.synchronize()).
 * This is what makes "error recovery" meaningfully testable: a program with
 * two independent syntax errors reports both, not just the first.
 */
export class MultiParseError extends Error {
  constructor(errors) {
    super(`${errors.length} syntax error(s) found.`);
    this.name = 'MultiParseError';
    this.errors = errors;
  }

  format() {
    return this.errors.map((error) => error.format()).join('\n\n');
  }
}

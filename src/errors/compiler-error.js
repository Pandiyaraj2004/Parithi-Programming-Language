/**
 * CompilerError — base class for all compile-time errors (P001-P005, P007).
 * Raised by the Lexer, Parser, and Semantic Analyzer in later phases.
 */

import { describeErrorCode } from './error-codes.js';

export class CompilerError extends Error {
  constructor(code, message, location = null, hint = null) {
    const { name } = describeErrorCode(code);
    super(message);
    this.name = 'CompilerError';
    this.code = code;
    this.errorName = name;
    this.location = location;
    this.hint = hint;
  }

  format() {
    const lines = [`Error ${this.code}:`, this.message];
    if (this.location) {
      lines.push(`  → ${this.location.toString()}`);
    }
    if (this.hint) {
      lines.push(`Hint: ${this.hint}`);
    }
    return lines.join('\n');
  }
}

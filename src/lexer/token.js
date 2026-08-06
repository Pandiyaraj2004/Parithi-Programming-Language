/**
 * Token type vocabulary, per MASTER_DOCUMENT.md §9.1.
 * Extends the Phase 0 placeholder with BOOLEAN and EMPTY as their own types
 * (rather than folding true/false/empty into generic KEYWORD) so the
 * Interpreter can read a token's `value` directly as a real JS boolean/null
 * without re-parsing the lexeme later.
 */

export const TokenType = Object.freeze({
  KEYWORD: 'KEYWORD',
  IDENTIFIER: 'IDENTIFIER',
  NUMBER: 'NUMBER',
  DECIMAL: 'DECIMAL',
  STRING: 'STRING',
  BOOLEAN: 'BOOLEAN',
  EMPTY: 'EMPTY',
  OPERATOR: 'OPERATOR',
  PUNCTUATION: 'PUNCTUATION',
  NEWLINE: 'NEWLINE',
  EOF: 'EOF',
});

/**
 * `lexeme` is the raw source text that produced this token (e.g. "25.50").
 * `value` is the interpreted value (e.g. the Number 25.5). Keeping both lets
 * error messages quote exactly what the programmer wrote while the
 * Interpreter still gets a ready-to-use value.
 */
export class Token {
  constructor(type, lexeme, value, line, column) {
    this.type = type;
    this.lexeme = lexeme;
    this.value = value;
    this.line = line;
    this.column = column;
  }

  toString() {
    return `Token(${this.type}, ${JSON.stringify(this.lexeme)}, ${JSON.stringify(this.value)}, ${this.line}:${this.column})`;
  }
}

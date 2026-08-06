/**
 * SourceLocation — shared by lexer tokens, AST nodes, and error reporting.
 * A single, reusable "where in the source" value so every later phase
 * (lexer, parser, semantic analyzer, interpreter) reports positions consistently.
 */

export class SourceLocation {
  constructor(file, line, column) {
    this.file = file;
    this.line = line;
    this.column = column;
  }

  toString() {
    return `${this.file}:${this.line}:${this.column}`;
  }
}

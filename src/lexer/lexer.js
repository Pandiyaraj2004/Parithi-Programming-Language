/**
 * Lexer — Phase 1.
 * Converts Parithi source text into a flat token stream (MASTER_DOCUMENT.md §9.1).
 *
 * This is a single-pass, character-at-a-time scanner with one character of
 * lookahead (peek/peekNext). It has no knowledge of grammar — it only knows
 * what a legal token looks like — so it stays fully independent of the
 * Parser (Phase 2), which hasn't been written yet.
 *
 * Design decisions worth knowing (see the chat explanation for full context):
 *   - "-" is always its own OPERATOR token, never folded into a number
 *     literal, so "-5" lexes as OPERATOR("-") + NUMBER(5). This matches the
 *     unary-minus precedence tier already defined in §13.5.
 *   - Only "is" is a keyword among the readable-comparison words; "more",
 *     "than", "less", "at", "least", "most" always lex as plain
 *     IDENTIFIER tokens (§13.4) — the Parser assembles "is more than" etc.
 *   - Strings do not support escape sequences and cannot span a line break;
 *     hitting "\n" or EOF before a closing quote is an unterminated string.
 *   - A decimal point not immediately followed by a digit is NOT consumed
 *     into a number (e.g. "10." tokenizes as NUMBER(10) then PUNCTUATION(".")).
 */

import { Token, TokenType } from './token.js';
import { isKeyword } from './keywords.js';
import { CompilerError, SourceLocation } from '../errors/index.js';

export class Lexer {
  constructor(source, filePath = '<source>') {
    this.source = source;
    this.filePath = filePath;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.startLine = 1;
    this.startColumn = 1;
    this.tokens = [];
  }

  /**
   * Scans the entire source and returns the full token list, always ending
   * with a single EOF token. Throws a CompilerError on the first lexical
   * error encountered (fail-fast — see chat explanation for rationale).
   */
  tokenize() {
    this.tokens = [];
    this.pos = 0;
    this.line = 1;
    this.column = 1;

    while (!this.isAtEnd()) {
      this.scanToken();
    }

    this.startLine = this.line;
    this.startColumn = this.column;
    this.addToken(TokenType.EOF, '', null);

    return this.tokens;
  }

  // ---------------------------------------------------------------------
  // Core dispatch
  // ---------------------------------------------------------------------

  scanToken() {
    this.startLine = this.line;
    this.startColumn = this.column;
    const c = this.advance();

    switch (c) {
      case ' ':
      case '\t':
        return;

      case '\r':
        // CRLF ("\r\n"): this "\r" is silently absorbed — the "\n" case
        // just below emits the one NEWLINE, exactly as it always has.
        // A bare "\r" with no following "\n" (classic pre-OS X Mac line
        // endings) previously fell through the same silent-skip path as
        // this case's " "/"\t" siblings, so a file using only "\r" never
        // produced a single NEWLINE token — every statement collapsed
        // onto one logical line. Treat it as its own line break instead,
        // matching how every OTHER line-ending convention already works.
        if (this.peek() === '\n') return;
        this.addToken(TokenType.NEWLINE, '\\r', '\n');
        this.line++;
        this.column = 1;
        return;

      case '\n':
        this.addToken(TokenType.NEWLINE, '\\n', '\n');
        this.line++;
        this.column = 1;
        return;

      case '#':
        while (this.peek() !== '\n' && !this.isAtEnd()) this.advance();
        return;

      case '"':
        this.scanString();
        return;

      case '(':
      case ')':
      case '[':
      case ']':
      case ',':
      case ':':
      case '.':
        this.addToken(TokenType.PUNCTUATION, c, c);
        return;

      case '+':
      case '-':
      case '%':
        this.addToken(TokenType.OPERATOR, c, c);
        return;

      case '*': {
        const lexeme = this.match('*') ? '**' : '*';
        this.addToken(TokenType.OPERATOR, lexeme, lexeme);
        return;
      }

      case '/':
        this.addToken(TokenType.OPERATOR, '/', '/');
        return;

      case '=': {
        const lexeme = this.match('=') ? '==' : '=';
        this.addToken(TokenType.OPERATOR, lexeme, lexeme);
        return;
      }

      case '!':
        if (this.match('=')) {
          this.addToken(TokenType.OPERATOR, '!=', '!=');
          return;
        }
        this.error('P008', 'Unexpected character "!". Did you mean "not"?', 'Parithi has no "!" operator — logical negation is spelled "not".');
        return;

      case '>': {
        const lexeme = this.match('=') ? '>=' : '>';
        this.addToken(TokenType.OPERATOR, lexeme, lexeme);
        return;
      }

      case '<': {
        const lexeme = this.match('=') ? '<=' : '<';
        this.addToken(TokenType.OPERATOR, lexeme, lexeme);
        return;
      }

      default:
        if (this.isDigit(c)) {
          this.scanNumber(c);
          return;
        }
        if (this.isAlpha(c)) {
          this.scanIdentifier(c);
          return;
        }
        this.error('P008', `Unexpected character "${c}".`, 'remove or replace this character — it is not part of any Parithi token.');
    }
  }

  // ---------------------------------------------------------------------
  // Multi-character scanners
  // ---------------------------------------------------------------------

  scanNumber(firstDigit) {
    let lexeme = firstDigit;
    while (this.isDigit(this.peek())) lexeme += this.advance();

    let isDecimal = false;
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      isDecimal = true;
      lexeme += this.advance(); // consume "."
      while (this.isDigit(this.peek())) lexeme += this.advance();
    }

    // A letter directly touching a number (e.g. "123abc") is not a valid
    // identifier (identifiers can't start with a digit) and not a valid
    // number (numbers can't contain letters) — it's a malformed literal.
    if (this.isAlpha(this.peek())) {
      let invalid = lexeme;
      while (this.isAlphaNumeric(this.peek())) invalid += this.advance();
      this.error(
        'P010',
        `Invalid number literal "${invalid}" — identifiers cannot start with a digit, and numbers cannot contain letters.`,
        'add a space between the number and the following word, or rename the identifier to not start with a digit.',
      );
      return;
    }

    const type = isDecimal ? TokenType.DECIMAL : TokenType.NUMBER;
    this.addToken(type, lexeme, Number(lexeme));
  }

  scanIdentifier(firstChar) {
    let lexeme = firstChar;
    while (this.isAlphaNumeric(this.peek())) lexeme += this.advance();

    if (lexeme === 'true' || lexeme === 'false') {
      this.addToken(TokenType.BOOLEAN, lexeme, lexeme === 'true');
    } else if (lexeme === 'empty') {
      this.addToken(TokenType.EMPTY, lexeme, null);
    } else if (isKeyword(lexeme)) {
      this.addToken(TokenType.KEYWORD, lexeme, lexeme);
    } else {
      this.addToken(TokenType.IDENTIFIER, lexeme, lexeme);
    }
  }

  scanString() {
    let value = '';
    while (this.peek() !== '"' && this.peek() !== '\n' && !this.isAtEnd()) {
      value += this.advance();
    }

    if (this.isAtEnd() || this.peek() === '\n') {
      this.error('P009', 'Unterminated string — no closing " found before end of line.', 'add a closing " before the end of the line.');
      return;
    }

    this.advance(); // consume closing quote
    this.addToken(TokenType.STRING, `"${value}"`, value);
  }

  // ---------------------------------------------------------------------
  // Token/error emission
  // ---------------------------------------------------------------------

  addToken(type, lexeme, value) {
    this.tokens.push(new Token(type, lexeme, value, this.startLine, this.startColumn));
  }

  error(code, message, hint = null) {
    throw new CompilerError(code, message, new SourceLocation(this.filePath, this.startLine, this.startColumn), hint);
  }

  // ---------------------------------------------------------------------
  // Character-stream primitives
  // ---------------------------------------------------------------------

  isAtEnd() {
    return this.pos >= this.source.length;
  }

  advance() {
    const char = this.source[this.pos];
    this.pos++;
    this.column++;
    return char;
  }

  peek() {
    return this.isAtEnd() ? '\0' : this.source[this.pos];
  }

  peekNext() {
    return this.pos + 1 >= this.source.length ? '\0' : this.source[this.pos + 1];
  }

  match(expected) {
    if (this.isAtEnd() || this.source[this.pos] !== expected) return false;
    this.pos++;
    this.column++;
    return true;
  }

  isDigit(char) {
    return char >= '0' && char <= '9';
  }

  isAlpha(char) {
    return /[A-Za-z_]/.test(char);
  }

  isAlphaNumeric(char) {
    return this.isAlpha(char) || this.isDigit(char);
  }
}

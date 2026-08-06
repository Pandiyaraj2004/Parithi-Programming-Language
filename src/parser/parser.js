/**
 * Parser — Phase 2.
 * Recursive-descent parser turning a token stream into an AST
 * (MASTER_DOCUMENT.md §9.2). Builds structure only — it never evaluates
 * anything, never checks types or declarations, and never touches the
 * Semantic Analyzer or Interpreter (both still unimplemented).
 *
 * Expression precedence, loosest to tightest binding (§13.5, corrected):
 *   parseOr → parseAnd → parseNot → parseComparison → parseAdditive →
 *   parseMultiplicative → parseUnaryMinus → parseExponent → parsePrimary
 *
 * Error recovery: parseProgram() runs each top-level statement in a
 * try/catch. A ParseError is recorded and the parser calls synchronize()
 * to skip to the next likely statement boundary (a NEWLINE or a
 * statement-starting keyword) before continuing — so a program with
 * multiple independent syntax errors reports all of them, not just the
 * first. If any errors were collected, parseProgram() throws (a single
 * ParseError, or a MultiParseError if more than one was found) instead of
 * returning a partial AST.
 */

import { TokenType } from '../lexer/token.js';
import { TokenStream } from './token-stream.js';
import { ParseContext } from './parse-context.js';
import { ParseError, MultiParseError } from './parse-error.js';
import { ASTBuilder } from '../ast/ast-builder.js';
import { NodeType } from '../ast/ast-nodes.js';

const STATEMENT_STARTERS = new Set([
  'hold', 'const', 'if', 'choose', 'repeat', 'while',
  'break', 'continue', 'task', 'return', 'say',
]);

const LITERAL_TYPES = new Set([
  TokenType.NUMBER,
  TokenType.DECIMAL,
  TokenType.STRING,
  TokenType.BOOLEAN,
  TokenType.EMPTY,
]);

export class Parser {
  constructor(tokens, filePath = '<source>') {
    this.tokens = new TokenStream(tokens);
    this.context = new ParseContext(filePath);
    this.filePath = filePath;
  }

  // ---------------------------------------------------------------------
  // Entry point
  // ---------------------------------------------------------------------

  parseProgram() {
    this.skipNewlines();
    const startToken = this.tokens.peek();
    const body = [];
    const errors = [];

    while (!this.tokens.isAtEnd()) {
      try {
        body.push(this.parseStatement());
        this.skipNewlines();
      } catch (err) {
        if (!(err instanceof ParseError)) throw err;
        errors.push(err);
        this.synchronize();
      }
    }

    if (errors.length > 0) {
      throw errors.length === 1 ? errors[0] : new MultiParseError(errors);
    }

    return ASTBuilder.program(body, startToken.line, startToken.column);
  }

  /** Panic-mode recovery: skip ahead to the next NEWLINE or statement-starting keyword. */
  synchronize() {
    while (!this.tokens.isAtEnd()) {
      const token = this.tokens.peek();
      if (token.type === TokenType.NEWLINE) {
        this.tokens.advance();
        return;
      }
      if (token.type === TokenType.KEYWORD && STATEMENT_STARTERS.has(token.value)) {
        return;
      }
      this.tokens.advance();
    }
  }

  // ---------------------------------------------------------------------
  // Statement dispatch
  // ---------------------------------------------------------------------

  parseStatement() {
    const token = this.tokens.peek();

    if (token.type === TokenType.KEYWORD) {
      switch (token.value) {
        case 'hold': return this.parseVariableDeclaration();
        case 'const': return this.parseConstantDeclaration();
        case 'say': return this.parsePrintStatement();
        case 'if': return this.parseIfStatement();
        case 'choose': return this.parseChooseStatement();
        case 'repeat': return this.parseRepeatStatement();
        case 'while': return this.parseWhileStatement();
        case 'break': return this.parseBreakStatement();
        case 'continue': return this.parseContinueStatement();
        case 'task': return this.parseTaskDeclaration();
        case 'return': return this.parseReturnStatement();
        case 'stop': return this.parseStopStatement();
        default:
          // 'ask' falls here (parses as an expression statement, e.g. a
          // bare prompt with no captured value), as does any stray
          // block-closing keyword ('end'/'else'/'option'/'other') or
          // infix-only keyword ('and'/'or'/'is'/'as') reaching statement
          // position — parseExpression()'s own primary parser rejects
          // those with a clear "expected an expression" error.
          return this.parseExpressionStatement();
      }
    }

    return this.parseExpressionStatement();
  }

  // ---------------------------------------------------------------------
  // Statements
  // ---------------------------------------------------------------------

  parseVariableDeclaration() {
    const holdToken = this.tokens.advance();
    const nameToken = this.expect(TokenType.IDENTIFIER, undefined, 'an identifier after "hold"');
    this.expect(TokenType.OPERATOR, '=', '"=" after the variable name');
    const value = this.parseExpression();
    this.expectStatementEnd();
    return ASTBuilder.variableDeclaration(nameToken.value, value, holdToken.line, holdToken.column);
  }

  parseConstantDeclaration() {
    const constToken = this.tokens.advance();
    const nameToken = this.expect(TokenType.IDENTIFIER, undefined, 'an identifier after "const"');
    this.expect(TokenType.OPERATOR, '=', '"=" after the constant name');
    const value = this.parseExpression();
    this.expectStatementEnd();
    return ASTBuilder.constantDeclaration(nameToken.value, value, constToken.line, constToken.column);
  }

  /**
   * Builds an Assignment (plain variable) or ArrayAssignment (indexed
   * element) node from an already-parsed left-hand side, once the parser
   * has confirmed the next token is "=". Parsing the full expression first
   * and branching on its resulting node type — rather than a fixed-shape
   * lookahead — is what lets an arbitrarily complex index expression
   * (e.g. "numbers[i + 1] = 100") work without any bracket-matching
   * lookahead logic.
   */
  parseAssignmentFrom(target) {
    const equalsToken = this.tokens.advance(); // consume "="
    const value = this.parseExpression();
    this.expectStatementEnd();

    if (target.type === NodeType.IDENTIFIER) {
      return ASTBuilder.assignment(target.name, value, target.line, target.column);
    }
    if (target.type === NodeType.ARRAY_ACCESS) {
      return ASTBuilder.arrayAssignment(target.array, target.index, value, target.line, target.column);
    }

    throw new ParseError(
      'P011',
      `Invalid assignment target — "=" can only follow a variable name or an indexed array element, not a ${target.type}.`,
      this.context.locationOf(equalsToken),
      {
        expected: 'an assignable target (a variable name or "arr[index]")',
        actual: target.type,
        hint: 'assignment can only target a plain variable name (e.g. "x = 5") or an array element (e.g. "arr[0] = 5").',
      },
    );
  }

  parsePrintStatement() {
    const sayToken = this.tokens.advance();
    const args = [this.parseExpression()];
    while (this.match(TokenType.PUNCTUATION, ',')) {
      args.push(this.parseExpression());
    }
    this.expectStatementEnd();
    return ASTBuilder.printStatement(args, sayToken.line, sayToken.column);
  }

  parseIfStatement() {
    const ifToken = this.tokens.advance();
    const condition = this.parseExpression();
    this.expectStatementEnd();
    const thenBranch = this.parseBlock(['else', 'end']);

    let elseBranch = null;
    if (this.match(TokenType.KEYWORD, 'else')) {
      this.expectStatementEnd();
      elseBranch = this.parseBlock(['end']);
    }

    this.expectEnd('if');
    this.expectStatementEnd();
    return ASTBuilder.ifStatement(condition, thenBranch, elseBranch, ifToken.line, ifToken.column);
  }

  parseChooseStatement() {
    const chooseToken = this.tokens.advance();
    const discriminant = this.parseExpression();
    this.expectStatementEnd();

    const options = [];
    while (this.check(TokenType.KEYWORD, 'option')) {
      options.push(this.parseOptionClause());
    }

    let otherClause = null;
    if (this.check(TokenType.KEYWORD, 'other')) {
      const otherToken = this.tokens.advance();
      this.expectStatementEnd();
      const body = this.parseBlock(['end']);
      otherClause = ASTBuilder.otherClause(body, otherToken.line, otherToken.column);
    }

    this.expectEnd('choose');
    this.expectStatementEnd();
    return ASTBuilder.chooseStatement(discriminant, options, otherClause, chooseToken.line, chooseToken.column);
  }

  parseOptionClause() {
    const optionToken = this.tokens.advance();
    const literalToken = this.tokens.peek();

    if (!LITERAL_TYPES.has(literalToken.type)) {
      throw new ParseError(
        'P013',
        `Invalid choose block: expected a literal value after "option" but found ${this.describeToken(literalToken)}.`,
        this.context.locationOf(literalToken),
        {
          expected: 'a literal (number, decimal, string, boolean, or empty)',
          actual: this.describeToken(literalToken),
          hint: 'each "option" needs a fixed literal value, e.g. "option 1" or "option \\"A\\"" — not a variable or expression.',
        },
      );
    }

    const test = this.parsePrimary();
    this.expectStatementEnd();
    const body = this.parseBlock(['option', 'other', 'end']);
    return ASTBuilder.optionClause(test, body, optionToken.line, optionToken.column);
  }

  parseRepeatStatement() {
    const repeatToken = this.tokens.advance();
    const count = this.parseExpression();

    let counterName = null;
    if (this.match(TokenType.KEYWORD, 'as')) {
      const nameToken = this.expect(TokenType.IDENTIFIER, undefined, 'an identifier after "as"');
      counterName = nameToken.value;
    }

    this.expectStatementEnd();
    const body = this.parseBlock(['end']);
    this.expectEnd('repeat');
    this.expectStatementEnd();
    return ASTBuilder.repeatStatement(count, counterName, body, repeatToken.line, repeatToken.column);
  }

  parseWhileStatement() {
    const whileToken = this.tokens.advance();
    const condition = this.parseExpression();
    this.expectStatementEnd();
    const body = this.parseBlock(['end']);
    this.expectEnd('while');
    this.expectStatementEnd();
    return ASTBuilder.whileStatement(condition, body, whileToken.line, whileToken.column);
  }

  parseBreakStatement() {
    const token = this.tokens.advance();
    this.expectStatementEnd();
    return ASTBuilder.breakStatement(token.line, token.column);
  }

  parseContinueStatement() {
    const token = this.tokens.advance();
    this.expectStatementEnd();
    return ASTBuilder.continueStatement(token.line, token.column);
  }

  parseTaskDeclaration() {
    const taskToken = this.tokens.advance();
    const nameToken = this.expect(TokenType.IDENTIFIER, undefined, 'a function name after "task"');
    this.expect(TokenType.PUNCTUATION, '(', '"(" after the function name');

    const params = [];
    if (!this.check(TokenType.PUNCTUATION, ')')) {
      params.push(this.expect(TokenType.IDENTIFIER, undefined, 'a parameter name').value);
      while (this.match(TokenType.PUNCTUATION, ',')) {
        params.push(this.expect(TokenType.IDENTIFIER, undefined, 'a parameter name').value);
      }
    }

    this.expect(TokenType.PUNCTUATION, ')', '")" to close the parameter list');
    this.expectStatementEnd();
    const body = this.parseBlock(['end']);
    this.expectEnd('task');
    this.expectStatementEnd();
    return ASTBuilder.taskDeclaration(nameToken.value, params, body, taskToken.line, taskToken.column);
  }

  parseReturnStatement() {
    const token = this.tokens.advance();
    let value = null;
    if (!this.check(TokenType.NEWLINE) && !this.tokens.isAtEnd()) {
      value = this.parseExpression();
    }
    this.expectStatementEnd();
    return ASTBuilder.returnStatement(value, token.line, token.column);
  }

  parseStopStatement() {
    // "stop" [expression] — a statement, not a block opener, so no "end
    // stop" (§11.4 is unaffected). Optional argument mirrors "return"'s
    // parsing exactly; semantic analysis enforces it must be Numeric (§15.7).
    const token = this.tokens.advance();
    let value = null;
    if (!this.check(TokenType.NEWLINE) && !this.tokens.isAtEnd()) {
      value = this.parseExpression();
    }
    this.expectStatementEnd();
    return ASTBuilder.stopStatement(value, token.line, token.column);
  }

  parseExpressionStatement() {
    const expr = this.parseExpression();

    if (this.check(TokenType.OPERATOR, '=')) {
      return this.parseAssignmentFrom(expr);
    }

    this.expectStatementEnd();
    return ASTBuilder.expressionStatement(expr, expr.line, expr.column);
  }

  // ---------------------------------------------------------------------
  // Blocks
  // ---------------------------------------------------------------------

  parseBlock(stopKeywords) {
    this.skipNewlines();
    const startToken = this.tokens.peek();
    const body = [];

    while (!this.tokens.isAtEnd() && !this.isBlockStop(stopKeywords)) {
      body.push(this.parseStatement());
      this.skipNewlines();
    }

    return ASTBuilder.block(body, startToken.line, startToken.column);
  }

  isBlockStop(stopKeywords) {
    const token = this.tokens.peek();
    return token.type === TokenType.KEYWORD && stopKeywords.includes(token.value);
  }

  /** Consumes "end <expectedKeyword>", raising P003 on a mismatch or P012 on EOF. */
  expectEnd(expectedKeyword) {
    const endToken = this.expect(TokenType.KEYWORD, 'end', `"end ${expectedKeyword}"`);
    const keywordToken = this.tokens.peek();

    if (keywordToken.type === TokenType.EOF) {
      throw new ParseError(
        'P012',
        `Unexpected end of file — expected "end ${expectedKeyword}".`,
        this.context.locationOf(keywordToken),
        {
          expected: `end ${expectedKeyword}`,
          actual: 'EOF',
          hint: `add "end ${expectedKeyword}" to close the "${expectedKeyword}" block opened earlier in this file.`,
        },
      );
    }

    if (keywordToken.type !== TokenType.KEYWORD || keywordToken.value !== expectedKeyword) {
      const actualDescription = keywordToken.type === TokenType.KEYWORD
        ? `"end ${keywordToken.value}"`
        : `"end" followed by ${this.describeToken(keywordToken)}`;
      throw new ParseError(
        'P003',
        `Invalid block ending. Expected "end ${expectedKeyword}" but found ${actualDescription}.`,
        this.context.locationOf(endToken),
        {
          expected: `end ${expectedKeyword}`,
          actual: actualDescription,
          hint: `every block must be closed with the SAME keyword it opened with — change this to "end ${expectedKeyword}".`,
        },
      );
    }

    this.tokens.advance();
    return endToken;
  }

  // ---------------------------------------------------------------------
  // Expressions — precedence climbing, loosest to tightest
  // ---------------------------------------------------------------------

  parseExpression() {
    return this.parseOr();
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.check(TokenType.KEYWORD, 'or')) {
      this.tokens.advance();
      const right = this.parseAnd();
      left = ASTBuilder.binaryExpression('or', left, right, left.line, left.column);
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.check(TokenType.KEYWORD, 'and')) {
      this.tokens.advance();
      const right = this.parseNot();
      left = ASTBuilder.binaryExpression('and', left, right, left.line, left.column);
    }
    return left;
  }

  /** Logical negation — deliberately looser than Comparison (§13.5, corrected). */
  parseNot() {
    if (this.check(TokenType.KEYWORD, 'not')) {
      const token = this.tokens.advance();
      const operand = this.parseNot();
      return ASTBuilder.unaryExpression('not', operand, token.line, token.column);
    }
    return this.parseComparison();
  }

  /** Non-chaining: consumes at most one comparison operator (§13.5). */
  parseComparison() {
    const left = this.parseAdditive();
    const operator = this.matchComparisonOperator();
    if (!operator) return left;
    const right = this.parseAdditive();
    return ASTBuilder.binaryExpression(operator, left, right, left.line, left.column);
  }

  matchComparisonOperator() {
    const token = this.tokens.peek();

    if (token.type === TokenType.OPERATOR && ['==', '!=', '>', '<', '>=', '<='].includes(token.value)) {
      this.tokens.advance();
      return token.value;
    }

    if (token.type === TokenType.KEYWORD && token.value === 'is') {
      return this.matchReadableComparison();
    }

    return null;
  }

  /** Resolves "is" / "is not" / "is more than" / "is less than" / "is at least" / "is at most" (§13.4). */
  matchReadableComparison() {
    this.tokens.advance(); // consume "is"

    if (this.check(TokenType.KEYWORD, 'not')) {
      this.tokens.advance();
      return '!=';
    }

    const word1 = this.tokens.peek();
    const word2 = this.tokens.peek(1);
    const isWord = (token, value) => token.type === TokenType.IDENTIFIER && token.value === value;

    if (isWord(word1, 'more') && isWord(word2, 'than')) {
      this.tokens.advance();
      this.tokens.advance();
      return '>';
    }
    if (isWord(word1, 'less') && isWord(word2, 'than')) {
      this.tokens.advance();
      this.tokens.advance();
      return '<';
    }
    if (isWord(word1, 'at') && isWord(word2, 'least')) {
      this.tokens.advance();
      this.tokens.advance();
      return '>=';
    }
    if (isWord(word1, 'at') && isWord(word2, 'most')) {
      this.tokens.advance();
      this.tokens.advance();
      return '<=';
    }

    return '==';
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.check(TokenType.OPERATOR, '+') || this.check(TokenType.OPERATOR, '-')) {
      const opToken = this.tokens.advance();
      const right = this.parseMultiplicative();
      left = ASTBuilder.binaryExpression(opToken.value, left, right, left.line, left.column);
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnaryMinus();
    while (
      this.check(TokenType.OPERATOR, '*') ||
      this.check(TokenType.OPERATOR, '/') ||
      this.check(TokenType.OPERATOR, '%')
    ) {
      const opToken = this.tokens.advance();
      const right = this.parseUnaryMinus();
      left = ASTBuilder.binaryExpression(opToken.value, left, right, left.line, left.column);
    }
    return left;
  }

  /** Arithmetic negation — binds looser than "**" (§13.5: -2 ** 2 = -(2 ** 2)). */
  parseUnaryMinus() {
    if (this.check(TokenType.OPERATOR, '-')) {
      const token = this.tokens.advance();
      const operand = this.parseUnaryMinus();
      return ASTBuilder.unaryExpression('-', operand, token.line, token.column);
    }
    return this.parseExponent();
  }

  /** Right-associative: 2 ** 3 ** 2 = 2 ** (3 ** 2). */
  parseExponent() {
    const left = this.parsePostfix();
    if (this.check(TokenType.OPERATOR, '**')) {
      this.tokens.advance();
      const right = this.parseExponent();
      return ASTBuilder.binaryExpression('**', left, right, left.line, left.column);
    }
    return left;
  }

  /**
   * Array indexing — "[expr]" — applied after any primary expression,
   * chaining for nested access ("matrix[1][0]"). This sits at the same
   * "postfix" precedence tier as a function call's "(...)" (already
   * handled inside parsePrimary/parseIdentifierOrCall), so "numbers[0]",
   * "box(1,2,3)[0]", and "greet()[0]" all bind exactly as tightly.
   */
  parsePostfix() {
    let expr = this.parsePrimary();
    while (this.check(TokenType.PUNCTUATION, '[')) {
      this.tokens.advance();
      const index = this.parseExpression();
      this.expect(TokenType.PUNCTUATION, ']', '"]" to close the index expression');
      expr = ASTBuilder.arrayAccess(expr, index, expr.line, expr.column);
    }
    return expr;
  }

  parsePrimary() {
    const token = this.tokens.peek();

    if (token.type === TokenType.NUMBER) {
      this.tokens.advance();
      return ASTBuilder.literal(token.value, 'Number', token.line, token.column);
    }
    if (token.type === TokenType.DECIMAL) {
      this.tokens.advance();
      return ASTBuilder.literal(token.value, 'Decimal', token.line, token.column);
    }
    if (token.type === TokenType.STRING) {
      this.tokens.advance();
      return ASTBuilder.literal(token.value, 'String', token.line, token.column);
    }
    if (token.type === TokenType.BOOLEAN) {
      this.tokens.advance();
      return ASTBuilder.literal(token.value, 'Boolean', token.line, token.column);
    }
    if (token.type === TokenType.EMPTY) {
      this.tokens.advance();
      return ASTBuilder.literal(token.value, 'Empty', token.line, token.column);
    }
    if (token.type === TokenType.IDENTIFIER) {
      return this.parseIdentifierOrCall();
    }
    if (token.type === TokenType.KEYWORD && token.value === 'ask') {
      return this.parseInputExpression();
    }
    if (token.type === TokenType.KEYWORD && token.value === 'box') {
      return this.parseArrayLiteral();
    }
    if (token.type === TokenType.PUNCTUATION && token.value === '(') {
      return this.parseGroupedExpression();
    }

    return this.throwExpected('an expression', token);
  }

  /** "box(...)" — an array literal, e.g. "box(1, 2, 3)" or the empty array "box()". */
  parseArrayLiteral() {
    const boxToken = this.tokens.advance();
    this.expect(TokenType.PUNCTUATION, '(', '"(" after "box"');
    const elements = [];

    if (!this.check(TokenType.PUNCTUATION, ')')) {
      elements.push(this.parseExpression());
      while (this.match(TokenType.PUNCTUATION, ',')) {
        elements.push(this.parseExpression());
      }
    }

    this.expect(TokenType.PUNCTUATION, ')', '")" to close "box("');
    return ASTBuilder.arrayLiteral(elements, boxToken.line, boxToken.column);
  }

  parseIdentifierOrCall() {
    const token = this.tokens.advance();
    const identifier = ASTBuilder.identifier(token.value, token.line, token.column);

    if (this.check(TokenType.PUNCTUATION, '(')) {
      return this.parseCallArguments(identifier);
    }

    return identifier;
  }

  parseCallArguments(calleeIdentifier) {
    this.expect(TokenType.PUNCTUATION, '(', '"("');
    const args = [];

    if (!this.check(TokenType.PUNCTUATION, ')')) {
      args.push(this.parseExpression());
      while (this.match(TokenType.PUNCTUATION, ',')) {
        args.push(this.parseExpression());
      }
    }

    this.expect(TokenType.PUNCTUATION, ')', '")" to close the argument list');
    return ASTBuilder.functionCall(calleeIdentifier, args, calleeIdentifier.line, calleeIdentifier.column);
  }

  parseInputExpression() {
    const askToken = this.tokens.advance();
    this.expect(TokenType.PUNCTUATION, '(', '"(" after "ask"');
    const prompt = this.parseExpression();
    this.expect(TokenType.PUNCTUATION, ')', '")" to close "ask("');
    return ASTBuilder.inputExpression(prompt, askToken.line, askToken.column);
  }

  parseGroupedExpression() {
    this.tokens.advance(); // consume "("
    const expr = this.parseExpression();
    this.expect(TokenType.PUNCTUATION, ')', '")" to close "("');
    return expr;
  }

  // ---------------------------------------------------------------------
  // Token-matching helpers
  // ---------------------------------------------------------------------

  check(type, value) {
    const token = this.tokens.peek();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  match(type, value) {
    if (this.check(type, value)) {
      this.tokens.advance();
      return true;
    }
    return false;
  }

  expect(type, value, description) {
    if (this.check(type, value)) {
      return this.tokens.advance();
    }
    return this.throwExpected(description, this.tokens.peek());
  }

  expectStatementEnd() {
    if (this.tokens.isAtEnd()) return;
    if (this.check(TokenType.NEWLINE)) {
      this.skipNewlines();
      return;
    }
    return this.throwExpected('end of line', this.tokens.peek());
  }

  skipNewlines() {
    while (this.check(TokenType.NEWLINE)) this.tokens.advance();
  }

  throwExpected(description, token) {
    if (token.type === TokenType.EOF) {
      throw new ParseError(
        'P012',
        `Unexpected end of file — expected ${description}.`,
        this.context.locationOf(token),
        { expected: description, actual: 'EOF', hint: `the file ended before ${description} was found — add it, or check for an earlier unclosed block.` },
      );
    }
    throw new ParseError(
      'P011',
      `Expected ${description} but found ${this.describeToken(token)}.`,
      this.context.locationOf(token),
      { expected: description, actual: this.describeToken(token), hint: `insert ${description} at this position.` },
    );
  }

  describeToken(token) {
    if (token.type === TokenType.EOF) return 'end of file';
    if (token.type === TokenType.NEWLINE) return 'end of line';
    if (token.type === TokenType.STRING) return `a string ("${token.value}")`;
    if (token.type === TokenType.NUMBER || token.type === TokenType.DECIMAL) return `a number (${token.lexeme})`;
    if (token.type === TokenType.BOOLEAN) return `"${token.lexeme}"`;
    if (token.type === TokenType.EMPTY) return '"empty"';
    return `"${token.lexeme}"`;
  }
}

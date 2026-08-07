/**
 * ASTBuilder — factory functions for every AST node type.
 * Centralizing node construction here (rather than building object literals
 * inline throughout the Parser) keeps node shape consistent and gives every
 * node a uniform {type, ...fields, line, column} contract in one place.
 */

import { NodeType } from './ast-nodes.js';

export const ASTBuilder = {
  program(body, line, column) {
    return { type: NodeType.PROGRAM, body, line, column };
  },

  block(body, line, column) {
    return { type: NodeType.BLOCK, body, line, column };
  },

  variableDeclaration(name, value, line, column) {
    return { type: NodeType.VARIABLE_DECLARATION, name, value, line, column };
  },

  constantDeclaration(name, value, line, column) {
    return { type: NodeType.CONSTANT_DECLARATION, name, value, line, column };
  },

  assignment(name, value, line, column) {
    return { type: NodeType.ASSIGNMENT, name, value, line, column };
  },

  printStatement(args, line, column) {
    return { type: NodeType.PRINT_STATEMENT, arguments: args, line, column };
  },

  inputExpression(prompt, line, column) {
    return { type: NodeType.INPUT_EXPRESSION, prompt, line, column };
  },

  ifStatement(condition, thenBranch, elseBranch, line, column) {
    return { type: NodeType.IF_STATEMENT, condition, thenBranch, elseBranch, line, column };
  },

  chooseStatement(discriminant, options, otherClause, line, column) {
    return { type: NodeType.CHOOSE_STATEMENT, discriminant, options, otherClause, line, column };
  },

  optionClause(test, body, line, column) {
    return { type: NodeType.OPTION_CLAUSE, test, body, line, column };
  },

  otherClause(body, line, column) {
    return { type: NodeType.OTHER_CLAUSE, body, line, column };
  },

  repeatStatement(count, counterName, body, line, column) {
    return { type: NodeType.REPEAT_STATEMENT, count, counterName, body, line, column };
  },

  whileStatement(condition, body, line, column) {
    return { type: NodeType.WHILE_STATEMENT, condition, body, line, column };
  },

  /** `loop ... end loop` (§36) — unconditional, exited only via `break`/`return`/`stop`; usable as a statement or, via `break <expression>`, as an expression. */
  loopExpression(body, line, column) {
    return { type: NodeType.LOOP_EXPRESSION, body, line, column };
  },

  /** `value` is null for a bare "break" — mirrors `returnStatement`'s own optional-value shape exactly (§36). */
  breakStatement(value, line, column) {
    return { type: NodeType.BREAK_STATEMENT, value, line, column };
  },

  continueStatement(line, column) {
    return { type: NodeType.CONTINUE_STATEMENT, line, column };
  },

  taskDeclaration(name, params, body, line, column) {
    return { type: NodeType.TASK_DECLARATION, name, params, body, line, column };
  },

  returnStatement(value, line, column) {
    return { type: NodeType.RETURN_STATEMENT, value, line, column };
  },

  stopStatement(value, line, column) {
    return { type: NodeType.STOP_STATEMENT, value, line, column };
  },

  functionCall(callee, args, line, column) {
    return { type: NodeType.FUNCTION_CALL, callee, arguments: args, line, column };
  },

  binaryExpression(operator, left, right, line, column) {
    return { type: NodeType.BINARY_EXPRESSION, operator, left, right, line, column };
  },

  unaryExpression(operator, operand, line, column) {
    return { type: NodeType.UNARY_EXPRESSION, operator, operand, line, column };
  },

  literal(value, valueType, line, column) {
    return { type: NodeType.LITERAL, value, valueType, line, column };
  },

  identifier(name, line, column) {
    return { type: NodeType.IDENTIFIER, name, line, column };
  },

  expressionStatement(expression, line, column) {
    return { type: NodeType.EXPRESSION_STATEMENT, expression, line, column };
  },

  arrayLiteral(elements, line, column) {
    return { type: NodeType.ARRAY_LITERAL, elements, line, column };
  },

  arrayAccess(array, index, line, column) {
    return { type: NodeType.ARRAY_ACCESS, array, index, line, column };
  },

  arrayAssignment(array, index, value, line, column) {
    return { type: NodeType.ARRAY_ASSIGNMENT, array, index, value, line, column };
  },
};

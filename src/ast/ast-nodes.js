/**
 * AST node type vocabulary — Phase 2.
 * Names every node the Parser produces (MASTER_DOCUMENT.md §9.2/§9.3).
 *
 * Revised from the Phase 0 draft: that draft guessed five separate literal
 * node types (NumberLiteral, DecimalLiteral, StringLiteral, BooleanLiteral,
 * EmptyLiteral) before the AST shape was concretely specified. Phase 2's
 * brief explicitly asks for one unified `Literal` node instead — its kind
 * is carried in a `valueType` field ('Number' | 'Decimal' | 'String' |
 * 'Boolean' | 'Empty') rather than encoded in the node type itself.
 */

export const NodeType = Object.freeze({
  PROGRAM: 'Program',
  BLOCK: 'Block',
  VARIABLE_DECLARATION: 'VariableDeclaration',
  CONSTANT_DECLARATION: 'ConstantDeclaration',
  ASSIGNMENT: 'Assignment',
  PRINT_STATEMENT: 'PrintStatement',
  INPUT_EXPRESSION: 'InputExpression',
  IF_STATEMENT: 'IfStatement',
  CHOOSE_STATEMENT: 'ChooseStatement',
  OPTION_CLAUSE: 'OptionClause',
  OTHER_CLAUSE: 'OtherClause',
  REPEAT_STATEMENT: 'RepeatStatement',
  WHILE_STATEMENT: 'WhileStatement',
  BREAK_STATEMENT: 'BreakStatement',
  CONTINUE_STATEMENT: 'ContinueStatement',
  TASK_DECLARATION: 'TaskDeclaration',
  RETURN_STATEMENT: 'ReturnStatement',
  STOP_STATEMENT: 'StopStatement',
  FUNCTION_CALL: 'FunctionCall',
  BINARY_EXPRESSION: 'BinaryExpression',
  UNARY_EXPRESSION: 'UnaryExpression',
  LITERAL: 'Literal',
  IDENTIFIER: 'Identifier',
  EXPRESSION_STATEMENT: 'ExpressionStatement',
  ARRAY_LITERAL: 'ArrayLiteral',
  ARRAY_ACCESS: 'ArrayAccess',
  ARRAY_ASSIGNMENT: 'ArrayAssignment',
});

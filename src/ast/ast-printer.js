/**
 * Renders an AST as a readable indented tree (used by `pari --ast`).
 *
 * Rather than storing a redundant `children` array on every node (which
 * would duplicate the semantically-named fields — `condition`, `left`,
 * `body`, etc. — and could drift out of sync with them), this module
 * derives each node's children on demand, per node type, purely for display.
 */

import { NodeType } from './ast-nodes.js';

function collectChildren(node) {
  const children = [];
  const add = (role, value) => {
    if (Array.isArray(value)) {
      value.forEach((item) => children.push({ role: null, node: item }));
    } else if (value) {
      children.push({ role, node: value });
    }
  };

  switch (node.type) {
    case NodeType.PROGRAM:
    case NodeType.BLOCK:
      add(null, node.body);
      break;
    case NodeType.VARIABLE_DECLARATION:
    case NodeType.CONSTANT_DECLARATION:
    case NodeType.ASSIGNMENT:
      add('value', node.value);
      break;
    case NodeType.PRINT_STATEMENT:
      add(null, node.arguments);
      break;
    case NodeType.INPUT_EXPRESSION:
      add('prompt', node.prompt);
      break;
    case NodeType.IF_STATEMENT:
      add('condition', node.condition);
      add('then', node.thenBranch);
      if (node.elseBranch) add('else', node.elseBranch);
      break;
    case NodeType.CHOOSE_STATEMENT:
      add('discriminant', node.discriminant);
      add(null, node.options);
      if (node.otherClause) add('other', node.otherClause);
      break;
    case NodeType.OPTION_CLAUSE:
      add('test', node.test);
      add('body', node.body);
      break;
    case NodeType.OTHER_CLAUSE:
      add('body', node.body);
      break;
    case NodeType.REPEAT_STATEMENT:
      add('count', node.count);
      add('body', node.body);
      break;
    case NodeType.WHILE_STATEMENT:
      add('condition', node.condition);
      add('body', node.body);
      break;
    case NodeType.TASK_DECLARATION:
      add('body', node.body);
      break;
    case NodeType.RETURN_STATEMENT:
      if (node.value) add('value', node.value);
      break;
    case NodeType.STOP_STATEMENT:
      if (node.value) add('value', node.value);
      break;
    case NodeType.FUNCTION_CALL:
      add('callee', node.callee);
      add(null, node.arguments);
      break;
    case NodeType.BINARY_EXPRESSION:
      add('left', node.left);
      add('right', node.right);
      break;
    case NodeType.UNARY_EXPRESSION:
      add('operand', node.operand);
      break;
    case NodeType.EXPRESSION_STATEMENT:
      add('expression', node.expression);
      break;
    case NodeType.ARRAY_LITERAL:
      add(null, node.elements);
      break;
    case NodeType.ARRAY_ACCESS:
      add('array', node.array);
      add('index', node.index);
      break;
    case NodeType.ARRAY_ASSIGNMENT:
      add('array', node.array);
      add('index', node.index);
      add('value', node.value);
      break;
    default:
      break;
  }

  return children;
}

function labelFor(node) {
  switch (node.type) {
    case NodeType.VARIABLE_DECLARATION:
    case NodeType.CONSTANT_DECLARATION:
    case NodeType.ASSIGNMENT:
      return `${node.type} (${node.name})`;
    case NodeType.IDENTIFIER:
      return `Identifier (${node.name})`;
    case NodeType.LITERAL:
      return `Literal (${node.valueType}: ${JSON.stringify(node.value)})`;
    case NodeType.BINARY_EXPRESSION:
      return `BinaryExpression (${node.operator})`;
    case NodeType.UNARY_EXPRESSION:
      return `UnaryExpression (${node.operator})`;
    case NodeType.FUNCTION_CALL:
      return `FunctionCall (${node.callee.name})`;
    case NodeType.TASK_DECLARATION:
      return `TaskDeclaration (${node.name}(${node.params.join(', ')}))`;
    case NodeType.REPEAT_STATEMENT:
      return node.counterName ? `RepeatStatement (as ${node.counterName})` : 'RepeatStatement';
    default:
      return node.type;
  }
}

function renderChildren(node, prefix, lines) {
  const children = collectChildren(node);
  children.forEach(({ role, node: child }, index) => {
    const isLast = index === children.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const nextPrefix = prefix + (isLast ? '    ' : '│   ');
    const roleTag = role ? `${role}: ` : '';
    lines.push(`${prefix}${connector}${roleTag}${labelFor(child)} [${child.line}:${child.column}]`);
    renderChildren(child, nextPrefix, lines);
  });
}

export function formatAST(root) {
  const lines = [`${labelFor(root)} [${root.line}:${root.column}]`];
  renderChildren(root, '', lines);
  return lines.join('\n');
}

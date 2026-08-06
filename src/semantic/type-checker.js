/**
 * TypeChecker — static type inference over expression nodes (MASTER_DOCUMENT.md §14.4).
 *
 * Stateless with respect to scope: every method takes the scope to resolve
 * identifiers against as a parameter rather than storing it, so a single
 * TypeChecker instance can be reused across every scope in the program and
 * `infer()` can be exercised in isolation in tests.
 */

import { NodeType } from '../ast/ast-nodes.js';
import { DataType, typesCompatible, isNumeric, BUILTIN_SIGNATURES, isValidArgCount, describeArgCount } from './types.js';
import { SemanticError } from './semantic-error.js';
import { SourceLocation } from '../errors/index.js';

export class TypeChecker {
  constructor(filePath, reportError) {
    this.filePath = filePath;
    this.reportError = reportError; // (SemanticError) => void
  }

  locationOf(node) {
    return new SourceLocation(this.filePath, node.line, node.column);
  }

  report(code, message, node, suggestion = null) {
    this.reportError(new SemanticError(code, message, this.locationOf(node), suggestion));
  }

  /** Infers the static type of `node`, evaluated in `scope`. Reports diagnostics as it goes. */
  infer(node, scope) {
    switch (node.type) {
      case NodeType.LITERAL:
        return node.valueType;
      case NodeType.IDENTIFIER:
        return this.inferIdentifier(node, scope);
      case NodeType.BINARY_EXPRESSION:
        return this.inferBinary(node, scope);
      case NodeType.UNARY_EXPRESSION:
        return this.inferUnary(node, scope);
      case NodeType.FUNCTION_CALL:
        return this.inferCall(node, scope);
      case NodeType.INPUT_EXPRESSION:
        this.infer(node.prompt, scope); // validate the prompt expression itself
        return DataType.STRING; // ask() always returns String — §16.1
      case NodeType.ARRAY_LITERAL:
        return this.inferArrayLiteral(node, scope);
      case NodeType.ARRAY_ACCESS:
        return this.inferArrayAccess(node, scope);
      default:
        return DataType.UNKNOWN;
    }
  }

  /**
   * "box(...)" — every element must be the same type, except "empty"
   * (§Arrays' v1.0 rule). Only catches mismatches statically knowable from
   * the literal's own element expressions; an element whose type is
   * Unknown (e.g. a function parameter) is skipped here and re-checked
   * defensively at Interpretation time instead (Interpreter.visitArrayLiteral),
   * exactly like every other statically-unknowable case in this codebase.
   */
  inferArrayLiteral(node, scope) {
    const elementTypes = node.elements.map((element) => this.infer(element, scope));
    let established = null;

    for (let i = 0; i < elementTypes.length; i++) {
      const type = elementTypes[i];
      if (type === DataType.EMPTY || type === DataType.UNKNOWN) continue;
      if (established === null) {
        established = type;
        continue;
      }
      if (!typesCompatible(established, type)) {
        this.report(
          'P026',
          `Array elements must share the same type — found ${established} and ${type} in the same "box(...)".`,
          node.elements[i],
          'every element in an array must be the same type (Number/Decimal count as the same type) — use number(...)/text(...) to convert a mismatched value first, or use separate arrays.',
        );
      }
    }

    return DataType.ARRAY;
  }

  /**
   * "arr[index]" — the target must statically be an Array (else P025), and
   * the index must be numeric (else P002, matching how every other
   * numeric-expected position in the grammar is checked). The element's
   * own type is deliberately Unknown: Array is a flat, non-parameterized
   * type in v1.0's type system (§Arrays), so nothing about what's stored at
   * a given index is knowable from the array's static type alone.
   */
  inferArrayAccess(node, scope) {
    const targetType = this.infer(node.array, scope);
    const indexType = this.infer(node.index, scope);

    if (indexType !== DataType.UNKNOWN && !isNumeric(indexType)) {
      this.report(
        'P002',
        `Array index must be numeric, got ${indexType}.`,
        node.index,
        'use a Number/Decimal expression for the index, e.g. "numbers[0]".',
      );
    }

    if (targetType !== DataType.UNKNOWN && targetType !== DataType.ARRAY) {
      this.report(
        'P025',
        `Cannot index into ${targetType} — only an array (created with "box(...)") can be indexed with "[...]".`,
        node.array,
        'only a value created with "box(...)" can be indexed — check that this expression is really an array.',
      );
    }

    return DataType.UNKNOWN;
  }

  inferIdentifier(node, scope) {
    const symbol = scope.resolve(node.name);
    if (!symbol) {
      this.report('P001', `Variable "${node.name}" is not declared.`, node, `declare it first with "hold ${node.name} = ...".`);
      return DataType.UNKNOWN;
    }
    return symbol.dataType;
  }

  inferBinary(node, scope) {
    const leftType = this.infer(node.left, scope);
    const rightType = this.infer(node.right, scope);
    const op = node.operator;

    if (['==', '!=', '>', '<', '>=', '<='].includes(op)) {
      if (leftType !== DataType.UNKNOWN && rightType !== DataType.UNKNOWN && !typesCompatible(leftType, rightType)) {
        this.report(
          'P002',
          `Cannot compare ${leftType} to ${rightType}.`,
          node,
          'comparisons require both sides to be the same kind of value (both numeric, or both the same type).',
        );
      }
      return DataType.BOOLEAN;
    }

    if (op === 'and' || op === 'or') {
      this.checkOperandType(leftType, DataType.BOOLEAN, node.left, `"${op}"`);
      this.checkOperandType(rightType, DataType.BOOLEAN, node.right, `"${op}"`);
      return DataType.BOOLEAN;
    }

    if (op === '+') {
      if (leftType === DataType.STRING && rightType === DataType.STRING) return DataType.STRING;
      if (isNumeric(leftType) && isNumeric(rightType)) {
        return leftType === DataType.DECIMAL || rightType === DataType.DECIMAL ? DataType.DECIMAL : DataType.NUMBER;
      }
      if (leftType === DataType.UNKNOWN || rightType === DataType.UNKNOWN) return DataType.UNKNOWN;
      this.report(
        'P002',
        `Cannot apply "+" between ${leftType} and ${rightType}.`,
        node,
        leftType === DataType.STRING || rightType === DataType.STRING
          ? 'convert the numeric side with text(...), or the string side with number(...).'
          : 'only String+String (concatenation) and Number/Decimal (addition) are valid for "+".',
      );
      return DataType.UNKNOWN;
    }

    // -, *, /, %, ** — numeric-only (§13.1)
    if (leftType === DataType.UNKNOWN || rightType === DataType.UNKNOWN) return DataType.UNKNOWN;
    if (!isNumeric(leftType) || !isNumeric(rightType)) {
      this.report(
        'P002',
        `Cannot apply "${op}" between ${leftType} and ${rightType} — both sides must be numeric.`,
        node,
        'convert non-numeric operands with number(...) first, if they hold numeric text.',
      );
      return DataType.UNKNOWN;
    }
    return leftType === DataType.DECIMAL || rightType === DataType.DECIMAL ? DataType.DECIMAL : DataType.NUMBER;
  }

  checkOperandType(actualType, expectedType, node, context) {
    if (actualType === DataType.UNKNOWN) return;
    if (!typesCompatible(actualType, expectedType)) {
      this.report(
        'P002',
        `${context} requires ${expectedType}, but found ${actualType}.`,
        node,
        `use a ${expectedType.toLowerCase()} expression here, such as a comparison (e.g. "x >= 0") if you need one.`,
      );
    }
  }

  inferUnary(node, scope) {
    const operandType = this.infer(node.operand, scope);
    if (operandType === DataType.UNKNOWN) return DataType.UNKNOWN;

    if (node.operator === 'not') {
      this.checkOperandType(operandType, DataType.BOOLEAN, node.operand, '"not"');
      return DataType.BOOLEAN;
    }

    if (!isNumeric(operandType)) {
      this.report(
        'P002',
        `Cannot apply unary "-" to ${operandType} — it must be numeric.`,
        node.operand,
        'unary "-" only negates Number/Decimal values.',
      );
      return DataType.UNKNOWN;
    }
    return operandType;
  }

  inferCall(node, scope) {
    const name = node.callee.name;
    const argTypes = node.arguments.map((arg) => this.infer(arg, scope));

    if (Object.prototype.hasOwnProperty.call(BUILTIN_SIGNATURES, name)) {
      return this.checkBuiltinCall(name, node, argTypes);
    }

    const symbol = scope.resolve(name);
    if (!symbol || symbol.kind !== 'function') {
      this.report(
        'P015',
        `Unknown function "${name}".`,
        node.callee,
        `check the spelling, or declare it first with "task ${name}(...) ... end task".`,
      );
      return DataType.UNKNOWN;
    }

    if (node.arguments.length !== symbol.params.length) {
      this.report(
        'P016',
        `"${name}" expects ${symbol.params.length} argument(s) but got ${node.arguments.length}.`,
        node,
        `"${name}" is declared as "task ${name}(${symbol.params.join(', ')})" — pass exactly ${symbol.params.length} argument(s).`,
      );
    }

    return symbol.returnType ?? DataType.UNKNOWN;
  }

  checkBuiltinCall(name, node, argTypes) {
    const signature = BUILTIN_SIGNATURES[name];
    const count = argTypes.length;

    if (!isValidArgCount(signature, count)) {
      this.report(
        'P016',
        `"${name}()" expects ${describeArgCount(signature)} argument(s) but got ${count}.`,
        node,
        `see MASTER_DOCUMENT.md §16.3 for "${name}()"'s documented call forms.`,
      );
      return signature.returnType(count);
    }

    switch (name) {
      case 'round':
      case 'random':
        argTypes.forEach((type, i) => {
          if (type !== DataType.UNKNOWN && !isNumeric(type)) {
            this.report(
              'P002',
              `"${name}()" argument ${i + 1} must be numeric, got ${type}.`,
              node.arguments[i],
              `"${name}()" only accepts Number/Decimal arguments.`,
            );
          }
        });
        break;
      case 'number':
        if (argTypes[0] !== DataType.UNKNOWN && argTypes[0] !== DataType.STRING) {
          this.report(
            'P002',
            `"number()" expects a String argument, got ${argTypes[0]}.`,
            node.arguments[0],
            'wrap the value in quotes, or convert it first with text(...).',
          );
        }
        break;
      case 'len':
        if (argTypes[0] !== DataType.UNKNOWN && argTypes[0] !== DataType.STRING && argTypes[0] !== DataType.ARRAY) {
          this.report(
            'P002',
            `"len()" expects a String or Array argument, got ${argTypes[0]}.`,
            node.arguments[0],
            '"len()" only accepts a String or an Array (created with "box(...)").',
          );
        }
        break;
      case 'push':
      case 'pop':
      case 'insert':
      case 'remove':
      case 'sort':
      case 'reverse':
      case 'contains':
        this.checkArrayArgument(name, argTypes[0], node.arguments[0]);
        if ((name === 'insert' || name === 'remove') && argTypes[1] !== DataType.UNKNOWN && !isNumeric(argTypes[1])) {
          this.report(
            'P002',
            `"${name}()"'s index argument must be numeric, got ${argTypes[1]}.`,
            node.arguments[1],
            `"${name}()" expects a Number/Decimal index as its second argument.`,
          );
        }
        break;
      default:
        break; // text(), type() accept any value type — no check
    }

    return signature.returnType(count);
  }

  /** Shared by every array built-in's first argument (§Arrays). */
  checkArrayArgument(name, argType, node) {
    if (argType !== DataType.UNKNOWN && argType !== DataType.ARRAY) {
      this.report(
        'P002',
        `"${name}()" expects an Array argument, got ${argType}.`,
        node,
        `"${name}()" only accepts an Array (created with "box(...)").`,
      );
    }
  }
}

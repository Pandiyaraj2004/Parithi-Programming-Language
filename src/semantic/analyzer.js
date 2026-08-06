/**
 * SemanticAnalyzer — Phase 3.
 * Walks the validated AST from the Parser and checks meaning: declarations,
 * scope, types, function calls, and control-flow context. Never evaluates
 * anything and never executes the program — see MASTER_DOCUMENT.md §9.4.
 *
 * Unlike the Lexer/Parser, analyze() never throws for semantic problems.
 * The AST is already structurally valid by the time it reaches here, so
 * there's no reason to stop early — every diagnostic found is collected
 * into a list and returned alongside the (unmodified) AST and the scopes
 * built along the way. The caller (CLI, tests) decides what to do with
 * `diagnostics` and `success`.
 *
 * Declaration order: within each block, `task` declarations are lightly
 * pre-registered (name + params only) before that block's statements are
 * walked in order, so mutual recursion and forward calls between functions
 * in the same scope work. Variables remain strict declare-before-use.
 */

import { NodeType } from '../ast/ast-nodes.js';
import { DataType, typesCompatible, isNumeric, isBuiltinName, BUILTIN_SIGNATURES } from './types.js';
import { TypeChecker } from './type-checker.js';
import { ScopeManager } from './scope-manager.js';
import { createSymbol } from './symbol-table.js';
import { SemanticError } from './semantic-error.js';
import { SourceLocation } from '../errors/index.js';
import { KEYWORDS } from '../lexer/keywords.js';

const RESERVED_NAMES = new Set([...KEYWORDS, ...Object.keys(BUILTIN_SIGNATURES)]);

export class SemanticAnalyzer {
  constructor(program, filePath = '<source>') {
    this.program = program;
    this.filePath = filePath;
    this.diagnostics = [];
    this.scopes = new ScopeManager();
    this.typeChecker = new TypeChecker(filePath, (error) => this.diagnostics.push(error));
    this.loopDepth = 0;
    this.functionReturnStack = [];
  }

  analyze() {
    this.visitBlockStatements(this.program.body, this.scopes.current);
    return {
      ast: this.program,
      globalScope: this.scopes.global,
      allScopes: this.scopes.allScopes,
      diagnostics: this.diagnostics,
      success: this.diagnostics.length === 0,
    };
  }

  report(code, message, node, suggestion = null) {
    this.diagnostics.push(new SemanticError(code, message, this.locationOf(node), suggestion));
  }

  locationOf(node) {
    return new SourceLocation(this.filePath, node.line, node.column);
  }

  // -----------------------------------------------------------------
  // Blocks — light task pre-registration, then sequential processing
  // -----------------------------------------------------------------

  visitBlockStatements(statements, scope) {
    for (const stmt of statements) {
      if (stmt.type === NodeType.TASK_DECLARATION) {
        this.preDeclareTask(stmt, scope);
      }
    }
    for (const stmt of statements) {
      this.visitStatement(stmt, scope);
    }
  }

  preDeclareTask(node, scope) {
    const uniqueParams = new Set();
    for (const paramName of node.params) {
      if (uniqueParams.has(paramName)) {
        this.report(
          'P014',
          `Duplicate parameter name "${paramName}" in "${node.name}".`,
          node,
          'each parameter name must be unique — rename one of them.',
        );
      }
      uniqueParams.add(paramName);
    }

    if (!this.checkNameAvailable(node.name, node, scope)) return;

    scope.declare(createSymbol({
      name: node.name,
      kind: 'function',
      dataType: DataType.UNKNOWN,
      scopeLevel: scope.level,
      location: this.locationOf(node),
      mutable: false,
      params: node.params,
      returnType: DataType.UNKNOWN, // refined once the body is analyzed, below
    }));
  }

  checkNameAvailable(name, node, scope) {
    if (RESERVED_NAMES.has(name)) {
      this.report(
        'P004',
        `"${name}" is reserved and cannot be used as an identifier.`,
        node,
        isBuiltinName(name)
          ? `"${name}" is a built-in function name — choose a different name.`
          : `"${name}" is a reserved keyword — choose a different name.`,
      );
      return false;
    }
    if (scope.hasOwn(name)) {
      this.report('P014', `"${name}" is already declared in this scope.`, node, 'choose a different name, or remove the earlier declaration.');
      return false;
    }
    return true;
  }

  // -----------------------------------------------------------------
  // Statement dispatch
  // -----------------------------------------------------------------

  visitStatement(node, scope) {
    switch (node.type) {
      case NodeType.VARIABLE_DECLARATION:
        return this.visitVariableDeclaration(node, scope, true);
      case NodeType.CONSTANT_DECLARATION:
        return this.visitVariableDeclaration(node, scope, false);
      case NodeType.ASSIGNMENT:
        return this.visitAssignment(node, scope);
      case NodeType.ARRAY_ASSIGNMENT:
        return this.visitArrayAssignment(node, scope);
      case NodeType.PRINT_STATEMENT:
        node.arguments.forEach((arg) => this.typeChecker.infer(arg, scope));
        return;
      case NodeType.IF_STATEMENT:
        return this.visitIfStatement(node, scope);
      case NodeType.CHOOSE_STATEMENT:
        return this.visitChooseStatement(node, scope);
      case NodeType.REPEAT_STATEMENT:
        return this.visitRepeatStatement(node, scope);
      case NodeType.WHILE_STATEMENT:
        return this.visitWhileStatement(node, scope);
      case NodeType.BREAK_STATEMENT:
        return this.visitBreak(node);
      case NodeType.CONTINUE_STATEMENT:
        return this.visitContinue(node);
      case NodeType.TASK_DECLARATION:
        return this.visitTaskDeclaration(node, scope);
      case NodeType.RETURN_STATEMENT:
        return this.visitReturnStatement(node, scope);
      case NodeType.STOP_STATEMENT:
        return this.visitStopStatement(node, scope);
      case NodeType.EXPRESSION_STATEMENT:
        this.typeChecker.infer(node.expression, scope);
        return;
      default:
        return;
    }
  }

  visitVariableDeclaration(node, scope, mutable) {
    const valueType = this.typeChecker.infer(node.value, scope);
    if (!this.checkNameAvailable(node.name, node, scope)) return;

    scope.declare(createSymbol({
      name: node.name,
      kind: mutable ? 'variable' : 'constant',
      dataType: valueType,
      scopeLevel: scope.level,
      location: this.locationOf(node),
      mutable,
    }));
  }

  visitAssignment(node, scope) {
    const valueType = this.typeChecker.infer(node.value, scope);
    const symbol = scope.resolve(node.name);

    if (!symbol) {
      this.report('P001', `Variable "${node.name}" is not declared.`, node, `declare it first with "hold ${node.name} = ...".`);
      return;
    }

    if (!symbol.mutable) {
      this.report(
        'P005',
        `Cannot reassign constant "${node.name}".`,
        node,
        'constants declared with "const" can never be reassigned — use "hold" instead if this needs to change.',
      );
      return;
    }

    if (symbol.dataType === DataType.EMPTY) {
      symbol.dataType = valueType; // first non-empty assignment locks the type — §14.4
      return;
    }

    if (valueType !== DataType.UNKNOWN && !typesCompatible(symbol.dataType, valueType)) {
      this.report(
        'P002',
        `Cannot assign ${valueType} to ${symbol.dataType}.`,
        node,
        `"${node.name}" was inferred as ${symbol.dataType} from its declaration.`,
      );
    }
  }

  /**
   * "arr[index] = value" (§Arrays). Unlike box(...) literal construction
   * (TypeChecker.inferArrayLiteral), there's no statically-tracked "this
   * array's locked element type" to compare `value` against here — Array
   * is a flat, non-parameterized type in v1.0's type system, so the only
   * per-element type information available anywhere is whatever a literal
   * lists inline. The element-type-mismatch check (P026) for an assignment
   * into an EXISTING array therefore happens defensively at Interpretation
   * time instead (Interpreter.visitArrayAssignment), against the array's
   * actual current contents — the only place that information exists.
   */
  visitArrayAssignment(node, scope) {
    const targetType = this.typeChecker.infer(node.array, scope);
    const indexType = this.typeChecker.infer(node.index, scope);
    this.typeChecker.infer(node.value, scope);

    if (indexType !== DataType.UNKNOWN && !isNumeric(indexType)) {
      this.report('P002', `Array index must be numeric, got ${indexType}.`, node.index, 'use a Number/Decimal expression for the index, e.g. "numbers[0] = ...".');
    }

    if (targetType !== DataType.UNKNOWN && targetType !== DataType.ARRAY) {
      this.report(
        'P025',
        `Cannot index into ${targetType} — only an array (created with "box(...)") can be indexed with "[...]".`,
        node.array,
        'only a value created with "box(...)" can be assigned into by index.',
      );
    }
  }

  visitIfStatement(node, scope) {
    const conditionType = this.typeChecker.infer(node.condition, scope);
    if (conditionType !== DataType.UNKNOWN && conditionType !== DataType.BOOLEAN) {
      this.report(
        'P002',
        `An "if" condition must be Boolean, got ${conditionType}.`,
        node.condition,
        'use a comparison or logical expression here, e.g. "age >= 18".',
      );
    }

    const thenScope = this.scopes.enter('if');
    this.visitBlockStatements(node.thenBranch.body, thenScope);
    this.scopes.exit();

    if (node.elseBranch) {
      const elseScope = this.scopes.enter('else');
      this.visitBlockStatements(node.elseBranch.body, elseScope);
      this.scopes.exit();
    }
  }

  visitChooseStatement(node, scope) {
    const discriminantType = this.typeChecker.infer(node.discriminant, scope);
    const seenValues = new Map();
    this.scopes.enter('choose'); // no declarations happen directly here — see design notes

    for (const option of node.options) {
      if (discriminantType !== DataType.UNKNOWN && !typesCompatible(discriminantType, option.test.valueType)) {
        this.report(
          'P002',
          `Cannot compare ${discriminantType} to ${option.test.valueType} in "option ${JSON.stringify(option.test.value)}".`,
          option.test,
          `every "option" value must match the type of "choose"'s expression (${discriminantType}).`,
        );
      }

      if (seenValues.has(option.test.value)) {
        this.report(
          'P007',
          `Duplicate "option ${JSON.stringify(option.test.value)}" in choose block — this branch can never run.`,
          option,
          `the earlier "option" for this value is at line ${seenValues.get(option.test.value)}.`,
        );
      } else {
        seenValues.set(option.test.value, option.line);
      }

      const optionScope = this.scopes.enter('option');
      this.visitBlockStatements(option.body.body, optionScope);
      this.scopes.exit();
    }

    if (node.otherClause) {
      const otherScope = this.scopes.enter('option');
      this.visitBlockStatements(node.otherClause.body.body, otherScope);
      this.scopes.exit();
    }

    this.scopes.exit(); // exit 'choose'
  }

  visitRepeatStatement(node, scope) {
    const countType = this.typeChecker.infer(node.count, scope);
    if (countType !== DataType.UNKNOWN && !isNumeric(countType)) {
      this.report(
        'P002',
        `"repeat" count must be numeric, got ${countType}.`,
        node.count,
        'use a Number or Decimal expression here, e.g. "repeat 5" or "repeat total".',
      );
    }

    const repeatScope = this.scopes.enter('repeat');

    if (node.counterName && this.checkNameAvailable(node.counterName, node, repeatScope)) {
      repeatScope.declare(createSymbol({
        name: node.counterName,
        kind: 'variable',
        dataType: DataType.NUMBER,
        scopeLevel: repeatScope.level,
        location: this.locationOf(node),
        mutable: true,
      }));
    }

    this.loopDepth++;
    this.visitBlockStatements(node.body.body, repeatScope);
    this.loopDepth--;
    this.scopes.exit();
  }

  visitWhileStatement(node, scope) {
    const conditionType = this.typeChecker.infer(node.condition, scope);
    if (conditionType !== DataType.UNKNOWN && conditionType !== DataType.BOOLEAN) {
      this.report(
        'P002',
        `A "while" condition must be Boolean, got ${conditionType}.`,
        node.condition,
        'use a comparison or logical expression here, e.g. "count <= 5".',
      );
    }

    const whileScope = this.scopes.enter('while');
    this.loopDepth++;
    this.visitBlockStatements(node.body.body, whileScope);
    this.loopDepth--;
    this.scopes.exit();
  }

  visitBreak(node) {
    if (this.loopDepth === 0) {
      this.report(
        'P018',
        '"break" can only be used inside a "repeat" or "while" loop.',
        node,
        'remove this "break", or move it inside a "repeat"/"while" block.',
      );
    }
  }

  visitContinue(node) {
    if (this.loopDepth === 0) {
      this.report(
        'P019',
        '"continue" can only be used inside a "repeat" or "while" loop.',
        node,
        'remove this "continue", or move it inside a "repeat"/"while" block.',
      );
    }
  }

  visitTaskDeclaration(node, scope) {
    const symbol = scope.resolve(node.name); // pre-registered by preDeclareTask
    const taskScope = this.scopes.enter('task');

    for (const paramName of node.params) {
      if (!taskScope.hasOwn(paramName)) {
        taskScope.declare(createSymbol({
          name: paramName,
          kind: 'parameter',
          dataType: DataType.UNKNOWN,
          scopeLevel: taskScope.level,
          location: this.locationOf(node),
          mutable: true,
        }));
      }
    }

    const outerLoopDepth = this.loopDepth;
    this.loopDepth = 0; // break/continue in a nested task refers only to ITS OWN loops

    const returnInfo = { types: [], sawUnknown: false };
    this.functionReturnStack.push(returnInfo);

    this.visitBlockStatements(node.body.body, taskScope);

    this.functionReturnStack.pop();
    this.loopDepth = outerLoopDepth;
    this.scopes.exit();

    if (symbol) {
      symbol.returnType = this.resolveReturnType(returnInfo, node);
    }
  }

  resolveReturnType(returnInfo, node) {
    if (returnInfo.sawUnknown) return DataType.UNKNOWN;
    if (returnInfo.types.length === 0) return DataType.EMPTY; // no return executed => implicit empty — §16.2

    const [first, ...rest] = returnInfo.types;
    for (const { type, location } of rest) {
      if (!typesCompatible(first.type, type)) {
        this.report(
          'P002',
          `"${node.name}" returns inconsistent types: ${first.type} and ${type}.`,
          location,
          'every "return" in a task should produce the same type of value.',
        );
      }
    }
    return first.type;
  }

  visitReturnStatement(node, scope) {
    if (this.functionReturnStack.length === 0) {
      this.report(
        'P017',
        '"return" can only be used inside a "task".',
        node,
        'remove this "return", or move it inside a "task ... end task" block.',
      );
      return;
    }

    const returnType = node.value ? this.typeChecker.infer(node.value, scope) : DataType.EMPTY;
    const current = this.functionReturnStack.at(-1);
    if (returnType === DataType.UNKNOWN) {
      current.sawUnknown = true;
    } else {
      current.types.push({ type: returnType, location: node });
    }
  }

  // §15.7 — "stop" has no context restriction (unlike break/continue/return,
  // it's valid at the top level, inside any loop, or inside any task), so
  // there is no P0xx "used outside valid context" check here — only its
  // optional argument's type is checked, since an exit code must be Numeric.
  visitStopStatement(node, scope) {
    if (!node.value) return;

    const valueType = this.typeChecker.infer(node.value, scope);
    if (valueType === DataType.UNKNOWN || isNumeric(valueType)) return;

    this.report(
      'P002',
      `"stop" expects a numeric exit code, got ${valueType}.`,
      node.value,
      'call "stop" with no argument (exit code 0), or a Number/Decimal expression, e.g. "stop 1".',
    );
  }
}

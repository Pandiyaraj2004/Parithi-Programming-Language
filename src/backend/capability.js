/**
 * Backend capability analysis (Phase 14 — Adaptive Execution Engine).
 *
 * Each backend answers "can you run this program?" via pure, static
 * inspection of the already-validated (post-Semantic-Analysis) AST —
 * never by attempting to execute, or even fully compile, the program.
 * This is what lets `selectBackend()` (selector.js) choose a backend
 * BEFORE any execution begins: a program's side effects (say output,
 * file writes, future network calls) must only ever happen once, on
 * whichever single backend actually ends up running it. Trying one
 * backend, catching a failure, and retrying on another is exactly the
 * "trial-and-error execution" this phase forbids.
 */

import { NodeType } from '../ast/ast-nodes.js';
import { NativeCompileError } from '../native/errors.js';
import { SourceLocation } from '../errors/index.js';

function locationOf(filePath, node) {
  return new SourceLocation(filePath, node.line, node.column);
}

/**
 * Mirrors native-codegen.js's own `extractSayText` gate exactly — same
 * supported subset, same feature/reason wording — but stops at the plain
 * AST walk: no IR generation, no x86-64 emission, no PE assembly. This is
 * the cheap check the brief requires ("must NOT compile the whole program
 * to native just to discover native can't support it"); only once Native
 * is actually SELECTED does anything proceed to real code generation.
 */
export function checkNativeCapability(program, filePath) {
  for (const node of program.body) {
    if (node.type !== NodeType.PRINT_STATEMENT) {
      const feature = node.type;
      const reason = 'the native backend currently only compiles "say" statements with String literal arguments.';
      return {
        supported: false,
        feature,
        reason,
        error: new NativeCompileError({
          feature,
          reason,
          location: locationOf(filePath, node),
          suggestion: 'use "pari --backend bytecode" or "pari --backend interpreter" for full-language support, or simplify this program for --backend native.',
        }),
      };
    }
    for (const arg of node.arguments) {
      if (arg.type !== NodeType.LITERAL || arg.valueType !== 'String') {
        const feature = `say with a ${arg.type === NodeType.LITERAL ? arg.valueType : arg.type} argument`;
        const reason = 'the native backend can currently only print String literals, not variables, expressions, or other value types.';
        return {
          supported: false,
          feature,
          reason,
          error: new NativeCompileError({
            feature,
            reason,
            location: locationOf(filePath, arg),
            suggestion: 'use only double-quoted string literals in "say" for --backend native, e.g. say "Hello, Parithi!".',
          }),
        };
      }
    }
  }
  return { supported: true };
}

/**
 * The Bytecode Generator (Phase 10) has a statement/expression compiler
 * for every AST node type the Parser can produce — see
 * bytecode-generator.js's own compileStatement()/compileExpression()
 * switches, which cover the complete NodeType enum with no "unsupported
 * construct" branch. There is currently no program that passes Semantic
 * Analysis but that Bytecode/PVM cannot run. This function still exists
 * as a real, callable check (rather than a hardcoded `true` at every call
 * site) so a future, deliberately-scoped bytecode limitation has one
 * obvious place to add a real analysis, exactly like Native's above.
 */
export function checkBytecodeCapability(_program, _filePath) {
  return { supported: true };
}

/**
 * The Tree-Walking Interpreter is the reference implementation every
 * other backend is validated against — every program that passes
 * Semantic Analysis runs on it. It is always the final fallback.
 */
export function checkInterpreterCapability(_program, _filePath) {
  return { supported: true };
}

// Priority order for automatic selection (§ Phase 14): fastest/most-native
// first, broadest-coverage last. selector.js walks this list in order and
// stops at the first backend that reports `supported: true`.
export const BACKENDS = Object.freeze([
  Object.freeze({ id: 'native', label: 'Native x86-64', check: checkNativeCapability }),
  Object.freeze({ id: 'bytecode', label: 'Bytecode + PVM', check: checkBytecodeCapability }),
  Object.freeze({ id: 'interpreter', label: 'Tree-Walking Interpreter', check: checkInterpreterCapability }),
]);

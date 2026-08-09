/**
 * Backend capability + selection unit tests (Phase 14 — Adaptive Execution
 * Engine). Covers capability.js's three checks directly against real
 * parsed/analyzed programs, and selector.js's priority-order decision
 * logic — including, via synthetic evaluation lists, outcomes no real
 * Parithi program can trigger today (see the "interpreter-selected" tests
 * below and capability.js's own class doc: Bytecode currently reports
 * `supported: true` for every semantically-valid program, so automatic
 * selection can only ever pick Native or Bytecode in practice right now).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../../src/lexer/lexer.js';
import { Parser } from '../../src/parser/parser.js';
import { SemanticAnalyzer } from '../../src/semantic/analyzer.js';
import {
  checkNativeCapability, checkBytecodeCapability, checkInterpreterCapability, BACKENDS,
} from '../../src/backend/capability.js';
import { selectBackend, selectFromEvaluations, evaluateBackend } from '../../src/backend/selector.js';

function parse(source) {
  const filePath = 'capability-test.pr';
  const tokens = new Lexer(source, filePath).tokenize();
  const program = new Parser(tokens, filePath).parseProgram();
  const analysis = new SemanticAnalyzer(program, filePath).analyze();
  if (!analysis.success) throw new Error(`Semantic analysis unexpectedly failed: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  return { program, filePath };
}

describe('checkNativeCapability', () => {
  test('a single "say" with a String literal is supported', () => {
    const { program, filePath } = parse('say "Hello, Parithi!"\n');
    assert.deepEqual(checkNativeCapability(program, filePath), { supported: true });
  });

  test('multiple "say" statements, each with String literals, are all supported', () => {
    const { program, filePath } = parse('say "one"\nsay "two", "three"\n');
    assert.equal(checkNativeCapability(program, filePath).supported, true);
  });

  test('any non-"say"/declaration/assignment top-level statement is unsupported, naming its exact node type', () => {
    const { program, filePath } = parse('stop 1\n');
    const result = checkNativeCapability(program, filePath);
    assert.equal(result.supported, false);
    assert.equal(result.feature, 'StopStatement');
    assert.match(result.reason, /only compiles "hold"\/"const" declarations, assignment, and "say" statements/);
  });

  test('"say" with a disallowed binary operator ("and"/"or") is unsupported, naming the exact operator', () => {
    const { program, filePath } = parse('say true and false\n');
    const result = checkNativeCapability(program, filePath);
    assert.equal(result.supported, false);
    assert.equal(result.feature, '"and"');
    assert.match(result.reason, /short-circuit branching/);
  });

  test('"say" with a non-literal, non-identifier, non-arithmetic argument names the argument\'s own node type', () => {
    // There is no real, Semantic-Analysis-valid top-level Parithi program
    // where a "say" argument is a bare FunctionCall with no enclosing
    // arithmetic (calls always need real runtime control flow, which
    // Semantic Analysis permits but the native subset does not). This
    // hand-builds the AST shape directly to exercise the `default` branch
    // of checkNativeExpression's node-type switch in isolation.
    const filePath = 'capability-test.pr';
    const program = {
      body: [{
        type: 'PrintStatement',
        line: 1,
        column: 1,
        arguments: [{ type: 'FunctionCall', name: 'f', args: [], line: 1, column: 5 }],
      }],
    };
    const result = checkNativeCapability(program, filePath);
    assert.equal(result.supported, false);
    assert.equal(result.feature, 'FunctionCall');
  });

  test('the unsupported result carries a real, formattable NativeCompileError (P030)', () => {
    const { program, filePath } = parse('if true\n    say "x"\nend if\n');
    const result = checkNativeCapability(program, filePath);
    assert.equal(result.supported, false);
    assert.equal(typeof result.error.format, 'function');
    assert.match(result.error.format(), /Error P030/);
  });

  test('is a cheap AST-only check — never invokes IR generation or x86-64 emission (no throw, no crash, on constructs the IR generator itself cannot lower)', () => {
    // choose/stop/box are explicitly "not yet lowered to IR" (ir-generator.js)
    // — if checkNativeCapability ever accidentally ran real codegen instead
    // of the plain AST gate, this would throw instead of returning cleanly.
    const { program, filePath } = parse('choose 1\n    option 1\n        say "one"\nend choose\n');
    const result = checkNativeCapability(program, filePath);
    assert.equal(result.supported, false);
    assert.equal(result.feature, 'ChooseStatement');
  });

  test('a self-referencing reassignment ("x = x + 1") is unsupported — the IR Optimizer cannot fold it, so Stage 1 must catch it, not just Stage 2', () => {
    const { program, filePath } = parse('hold x = 1\nx = x + 1\nsay x\n');
    const result = checkNativeCapability(program, filePath);
    assert.equal(result.supported, false);
    assert.equal(result.feature, 'self-referencing reassignment of "x"');
  });
});

describe('checkBytecodeCapability', () => {
  test('reports supported for a trivial program', () => {
    const { program, filePath } = parse('say "hi"\n');
    assert.deepEqual(checkBytecodeCapability(program, filePath), { supported: true });
  });

  test('reports supported for every construct the native backend rejects (variables, control flow, functions, arrays)', () => {
    const sources = [
      'hold x = 1\nsay x\n',
      'if true\n    say "a"\nelse\n    say "b"\nend if\n',
      'choose 1\n    option 1\n        say "one"\nend choose\n',
      'repeat 3 as i\n    say i\nend repeat\n',
      'while false\n    say "never"\nend while\n',
      'task f()\n    return 1\nend task\nsay f()\n',
      'hold nums = box(1, 2, 3)\nsay nums[0]\n',
      'stop 1\n',
    ];
    for (const source of sources) {
      const { program, filePath } = parse(source);
      assert.equal(checkBytecodeCapability(program, filePath).supported, true, `expected bytecode to support: ${source}`);
    }
  });
});

describe('checkInterpreterCapability', () => {
  test('always reports supported — the reference implementation, final fallback', () => {
    const { program, filePath } = parse('hold x = 1\nsay x\n');
    assert.deepEqual(checkInterpreterCapability(program, filePath), { supported: true });
  });
});

describe('BACKENDS priority list', () => {
  test('is exactly Native -> Bytecode -> Interpreter, in that order', () => {
    assert.deepEqual(BACKENDS.map((b) => b.id), ['native', 'bytecode', 'interpreter']);
    assert.deepEqual(BACKENDS.map((b) => b.label), ['Native x86-64', 'Bytecode + PVM', 'Tree-Walking Interpreter']);
  });
});

describe('selectBackend — real programs', () => {
  test('a native-eligible program selects Native, even though Bytecode and Interpreter also support it', () => {
    const { program, filePath } = parse('say "Hello, Parithi!"\n');
    const selection = selectBackend(program, filePath);
    assert.equal(selection.selected, 'native');
    assert.equal(selection.selectedLabel, 'Native x86-64');
    assert.equal(selection.evaluations.length, 3);
    assert.ok(selection.evaluations.every((e) => e.supported));
  });

  test('a program outside the native subset selects Bytecode (next in priority), not Interpreter', () => {
    const { program, filePath } = parse('if true\n    say "x"\nend if\n');
    const selection = selectBackend(program, filePath);
    assert.equal(selection.selected, 'bytecode');
    const native = selection.evaluations.find((e) => e.id === 'native');
    assert.equal(native.supported, false);
    const bytecode = selection.evaluations.find((e) => e.id === 'bytecode');
    assert.equal(bytecode.supported, true);
  });

  test('evaluations always cover all three backends, in priority order, regardless of which one is selected', () => {
    const { program, filePath } = parse('say "hi"\n');
    const selection = selectBackend(program, filePath);
    assert.deepEqual(selection.evaluations.map((e) => e.id), ['native', 'bytecode', 'interpreter']);
  });
});

describe('evaluateBackend — single forced backend', () => {
  test('evaluating "native" on a native-eligible program reports supported', () => {
    const { program, filePath } = parse('say "hi"\n');
    assert.equal(evaluateBackend('native', program, filePath).supported, true);
  });

  test('evaluating "native" on a non-eligible program reports unsupported with a real error', () => {
    const { program, filePath } = parse('if true\n    say "x"\nend if\n');
    const evaluation = evaluateBackend('native', program, filePath);
    assert.equal(evaluation.supported, false);
    assert.equal(typeof evaluation.error.format, 'function');
  });

  test('evaluating "bytecode" or "interpreter" always reports supported (today\'s real capability facts)', () => {
    const { program, filePath } = parse('hold x = 1\n');
    assert.equal(evaluateBackend('bytecode', program, filePath).supported, true);
    assert.equal(evaluateBackend('interpreter', program, filePath).supported, true);
  });
});

describe('selectFromEvaluations — the priority-order decision in isolation', () => {
  test('native-selected case: Native supported wins even when Bytecode/Interpreter also are', () => {
    const result = selectFromEvaluations([
      { id: 'native', label: 'Native x86-64', supported: true },
      { id: 'bytecode', label: 'Bytecode + PVM', supported: true },
      { id: 'interpreter', label: 'Tree-Walking Interpreter', supported: true },
    ]);
    assert.deepEqual(result, { selected: 'native', selectedLabel: 'Native x86-64' });
  });

  test('bytecode-fallback case: Native unsupported, Bytecode supported', () => {
    const result = selectFromEvaluations([
      { id: 'native', label: 'Native x86-64', supported: false },
      { id: 'bytecode', label: 'Bytecode + PVM', supported: true },
      { id: 'interpreter', label: 'Tree-Walking Interpreter', supported: true },
    ]);
    assert.deepEqual(result, { selected: 'bytecode', selectedLabel: 'Bytecode + PVM' });
  });

  test('interpreter-fallback case: both Native and Bytecode unsupported, Interpreter is the final fallback', () => {
    // Synthetic — no real Parithi program can put Bytecode in an
    // unsupported state today (capability.js's checkBytecodeCapability
    // always returns true), so this exercises the selection ALGORITHM's
    // fallback branch directly rather than claiming a real program
    // reaches it. See the class doc at the top of this file.
    const result = selectFromEvaluations([
      { id: 'native', label: 'Native x86-64', supported: false },
      { id: 'bytecode', label: 'Bytecode + PVM', supported: false },
      { id: 'interpreter', label: 'Tree-Walking Interpreter', supported: true },
    ]);
    assert.deepEqual(result, { selected: 'interpreter', selectedLabel: 'Tree-Walking Interpreter' });
  });
});

/**
 * Standard Library — cross-cutting test suite (Phase 13, §32).
 * Covers the Type library additions (boolean()/isNumber()/isText()/
 * isBoolean()) and the System library (sleep()/version()/platform()/
 * workingDirectory()/arguments()), plus an Interpreter <-> PVM parity
 * sweep across every new built-in from every stdlib category — the actual
 * "works identically in both backends" proof the Phase 13 brief asks for,
 * the same method tests/vm-parity.test.js and tests/optimizer.test.js
 * already use for Phases 11/12.
 *
 * Math/String/Array-specific normal/error cases live in their own
 * dedicated files (tests/math.test.js, tests/string.test.js,
 * tests/array.test.js) — not duplicated here.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { SemanticAnalyzer } from '../src/semantic/analyzer.js';
import { Interpreter } from '../src/interpreter/interpreter.js';
import { VirtualMachine } from '../src/vm/virtual-machine.js';
import { compileFromSource } from '../src/vm/loader.js';
import { setProgramArguments, getProgramArguments } from '../src/stdlib/system/program-args.js';

function run(source) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  const analysis = new SemanticAnalyzer(program, 'test.pr').analyze();
  if (!analysis.success) {
    throw new Error(`Semantic analysis unexpectedly failed: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  }
  const output = [];
  new Interpreter('test.pr', { write: () => {}, writeLine: (t) => output.push(t), readLine: () => '' }).run(program);
  return output;
}

function runExpectingError(source) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  const analysis = new SemanticAnalyzer(program, 'test.pr').analyze();
  if (!analysis.success) return { code: analysis.diagnostics[0].code };
  const output = [];
  try {
    new Interpreter('test.pr', { write: () => {}, writeLine: (t) => output.push(t), readLine: () => '' }).run(program);
  } catch (err) {
    return { code: err.code };
  }
  throw new Error(`Expected an error, but "${source}" ran to completion with output: ${JSON.stringify(output)}`);
}

describe('boolean()', () => {
  test('normal cases', () => {
    assert.deepEqual(run('say boolean("true")'), ['true']);
    assert.deepEqual(run('say boolean("FALSE")'), ['false']);
    assert.deepEqual(run('say boolean(0)'), ['false']);
    assert.deepEqual(run('say boolean(5)'), ['true']);
    assert.deepEqual(run('say boolean(empty)'), ['false']);
    assert.deepEqual(run('say boolean(true)'), ['true']);
  });
  test('an unrecognized String raises P006 (runtime conversion error)', () => {
    assert.equal(runExpectingError('say boolean("yes")').code, 'P006');
  });
});

describe('isNumber()/isText()/isBoolean()', () => {
  test('normal cases', () => {
    assert.deepEqual(run('say isNumber(5)'), ['true']);
    assert.deepEqual(run('say isNumber("5")'), ['false']);
    assert.deepEqual(run('say isText("hi")'), ['true']);
    assert.deepEqual(run('say isText(5)'), ['false']);
    assert.deepEqual(run('say isBoolean(true)'), ['true']);
    assert.deepEqual(run('say isBoolean(0)'), ['false']);
  });
});

describe('System library', () => {
  test('version() returns a non-empty String mentioning "Parithi"', () => {
    const [value] = run('say version()');
    assert.match(value, /Parithi/);
  });
  test('platform() returns a non-empty String', () => {
    const [value] = run('say platform()');
    assert.ok(value.length > 0);
  });
  test('workingDirectory() matches process.cwd()', () => {
    assert.deepEqual(run('say workingDirectory()'), [process.cwd()]);
  });
  test('sleep() actually blocks for roughly the requested duration', () => {
    const start = performance.now();
    run('sleep(30)\nsay "done"');
    const elapsed = performance.now() - start;
    assert.ok(elapsed >= 25, `expected sleep(30) to block at least ~25ms, took ${elapsed}ms`);
  });
  test('sleep() rejects a negative duration with P002', () => {
    assert.equal(runExpectingError('sleep(-1)').code, 'P002');
  });
  test('arguments() reflects setProgramArguments() (wired by the CLI in commands.js)', () => {
    setProgramArguments(['foo', 'bar']);
    try {
      assert.deepEqual(run('say arguments()'), ['["foo", "bar"]']);
    } finally {
      setProgramArguments([]); // don't leak state into later tests in this process
    }
  });
  test('arguments() defaults to an empty Array', () => {
    setProgramArguments([]);
    assert.deepEqual(run('say arguments()'), ['[]']);
  });
  test('getProgramArguments() returns a defensive copy, not the live array', () => {
    setProgramArguments(['x']);
    const copy = getProgramArguments();
    copy.push('y');
    assert.deepEqual(getProgramArguments(), ['x']);
    setProgramArguments([]);
  });
});

describe('Parity — every new stdlib built-in (Interpreter vs. PVM)', () => {
  function runInterpreter(source) {
    const tokens = new Lexer(source, 'test.pr').tokenize();
    const program = new Parser(tokens, 'test.pr').parseProgram();
    const analysis = new SemanticAnalyzer(program, 'test.pr').analyze();
    if (!analysis.success) throw new Error('Interpreter path: semantic analysis unexpectedly failed');
    const output = [];
    const interpreter = new Interpreter('test.pr', { write: () => {}, writeLine: (t) => output.push(t), readLine: () => '' });
    try {
      interpreter.run(program);
      return { output, exitCode: interpreter.exitCode ?? 0 };
    } catch (err) {
      return { output, error: { code: err.code } };
    }
  }

  function runVM(source) {
    const compiled = compileFromSource(source, 'test.pr');
    if (!compiled.success) throw new Error('VM path: compile unexpectedly failed');
    const output = [];
    const vm = new VirtualMachine(compiled.bytecode, 'test.pr', { write: () => {}, writeLine: (t) => output.push(t), readLine: () => '' });
    try {
      const exitCode = vm.run();
      return { output, exitCode };
    } catch (err) {
      return { output, error: { code: err.code } };
    }
  }

  function assertParity(source) {
    const i = runInterpreter(source);
    const v = runVM(source);
    assert.deepEqual(v.output, i.output, `console output mismatch for:\n${source}`);
    if (i.error) {
      assert.ok(v.error, `Interpreter errored (${i.error.code}) but VM did not, for:\n${source}`);
      assert.equal(v.error.code, i.error.code, `error code mismatch for:\n${source}`);
    } else {
      assert.ok(!v.error, `VM errored (${v.error?.code}) but Interpreter did not, for:\n${source}`);
      assert.equal(v.exitCode, i.exitCode, `exit code mismatch for:\n${source}`);
    }
  }

  test('Math', () => {
    assertParity('say sqrt(25)');
    assertParity('say pow(2, 10)');
    assertParity('say abs(-7)');
    assertParity('say floor(3.7)');
    assertParity('say ceil(3.2)');
    assertParity('say min(5, 2, 9, 1)');
    assertParity('say max(5, 2, 9, 1)');
    assertParity('say sin(0)');
    assertParity('say cos(0)');
    assertParity('say tan(0)');
    assertParity('say log(1)');
    assertParity('say exp(0)');
    assertParity('say sqrt(-4)'); // both must raise the same P028
    assertParity('say log(0)');
  });

  test('String', () => {
    assertParity('say upper("Parithi")');
    assertParity('say lower("Parithi")');
    assertParity('say trim("  hi  ")');
    assertParity('say split("a,b,c", ",")');
    assertParity('say join(box("a", "b", "c"), "-")');
    assertParity('say replace("aaa", "a", "b")');
    assertParity('say startsWith("Parithi", "Par")');
    assertParity('say endsWith("Parithi", "thi")');
    assertParity('say substring("Parithi", 1, 4)');
    assertParity('say indexOf("Parithi", "rit")');
    assertParity('say lastIndexOf("Parithi", "i")');
    assertParity('say repeatText("ab", 3)');
    assertParity('say reverseText("Parithi")');
    assertParity('say contains("Parithi", "rit")');
    assertParity('say substring("hi", 5, 10)'); // both must raise the same P029
  });

  test('Array', () => {
    assertParity('hold arr = box(1, 2, 3)\nclear(arr)\nsay arr');
    assertParity('say length(box(1, 2, 3))');
    assertParity('say isEmpty(box())');
    assertParity('say contains(box(1, 2, 3), 2)');
    assertParity('say indexOf(box(10, 20, 30), 20)');
  });

  test('Type', () => {
    assertParity('say boolean("true")');
    assertParity('say isNumber(5)');
    assertParity('say isText("x")');
    assertParity('say isBoolean(true)');
    assertParity('say isEmpty(empty)');
  });

  test('System (excluding sleep(), whose timing isn\'t a correctness signal)', () => {
    assertParity('say version()');
    assertParity('say platform()');
    assertParity('say workingDirectory()');
    assertParity('say arguments()');
  });

  test('a larger program mixing several stdlib categories together, including a loop', () => {
    assertParity(`
      hold total = 0
      repeat 200 as i
        total = total + floor(sqrt(i))
      end repeat
      say total

      hold words = split("the quick brown fox", " ")
      hold shout = box()
      repeat length(words) as i
        push(shout, upper(words[i - 1]))
      end repeat
      say join(shout, " ")
    `);
  });
});

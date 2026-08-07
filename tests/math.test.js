/**
 * Standard Library — Math test suite (Phase 13, §32.1).
 * Covers every new Math built-in independently: normal cases, invalid
 * argument types/counts, and domain errors (P028). round()/random() are
 * Phase 6 built-ins already covered by interpreter.test.js — untouched
 * and not re-tested here.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { SemanticAnalyzer } from '../src/semantic/analyzer.js';
import { Interpreter } from '../src/interpreter/interpreter.js';

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

/** Runs `source` and returns the ParithiRuntimeError/SemanticError it throws, asserting it actually throws. */
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

describe('sqrt()', () => {
  test('normal cases', () => {
    assert.deepEqual(run('say sqrt(25)'), ['5']);
    assert.deepEqual(run('say sqrt(2)'), [String(Math.sqrt(2))]);
    assert.deepEqual(run('say sqrt(0)'), ['0']);
  });
  test('negative argument raises P028 (math domain error)', () => {
    assert.equal(runExpectingError('say sqrt(-4)').code, 'P028');
  });
  test('non-numeric argument raises P002 (semantic) / P002 (runtime)', () => {
    assert.equal(runExpectingError('say sqrt("x")').code, 'P002');
    assert.equal(runExpectingError('task f(p)\n  return sqrt(p)\nend task\nsay f("x")').code, 'P002');
  });
  test('wrong argument count raises P016', () => {
    assert.equal(runExpectingError('say sqrt(1, 2)').code, 'P016');
    assert.equal(runExpectingError('say sqrt()').code, 'P016');
  });
});

describe('pow()', () => {
  test('normal cases', () => {
    assert.deepEqual(run('say pow(2, 10)'), ['1024']);
    assert.deepEqual(run('say pow(2, 0)'), ['1']);
    assert.deepEqual(run('say pow(2, -1)'), ['0.5']);
  });
  test('wrong argument count raises P016', () => {
    assert.equal(runExpectingError('say pow(2)').code, 'P016');
  });
});

describe('abs()/floor()/ceil()', () => {
  test('normal cases', () => {
    assert.deepEqual(run('say abs(-7)'), ['7']);
    assert.deepEqual(run('say abs(7)'), ['7']);
    assert.deepEqual(run('say floor(3.7)'), ['3']);
    assert.deepEqual(run('say floor(-3.2)'), ['-4']);
    assert.deepEqual(run('say ceil(3.2)'), ['4']);
    assert.deepEqual(run('say ceil(-3.7)'), ['-3']);
  });
});

describe('min()/max()', () => {
  test('variadic normal cases', () => {
    assert.deepEqual(run('say min(5, 2, 9, 1)'), ['1']);
    assert.deepEqual(run('say max(5, 2, 9, 1)'), ['9']);
    assert.deepEqual(run('say min(4, 9)'), ['4']);
  });
  test('fewer than 2 arguments raises P016', () => {
    assert.equal(runExpectingError('say min(5)').code, 'P016');
    assert.equal(runExpectingError('say max()').code, 'P016');
  });
});

describe('randomInt()', () => {
  test('result is always within the inclusive range', () => {
    for (let i = 0; i < 50; i++) {
      const [value] = run('say randomInt(3, 7)');
      const n = Number(value);
      assert.ok(n >= 3 && n <= 7, `randomInt(3,7) produced ${n}`);
      assert.ok(Number.isInteger(n));
    }
  });
  test('a single-value range always returns that value', () => {
    assert.deepEqual(run('say randomInt(5, 5)'), ['5']);
  });
  test('upper bound below lower bound raises P028', () => {
    assert.equal(runExpectingError('say randomInt(9, 1)').code, 'P028');
  });
});

describe('sin()/cos()/tan()/exp()', () => {
  test('normal cases', () => {
    assert.deepEqual(run('say sin(0)'), ['0']);
    assert.deepEqual(run('say cos(0)'), ['1']);
    assert.deepEqual(run('say tan(0)'), ['0']);
    assert.deepEqual(run('say exp(0)'), ['1']);
  });
});

describe('log()', () => {
  test('normal cases', () => {
    assert.deepEqual(run('say log(1)'), ['0']);
  });
  test('zero or negative argument raises P028 (math domain error)', () => {
    assert.equal(runExpectingError('say log(0)').code, 'P028');
    assert.equal(runExpectingError('say log(-1)').code, 'P028');
  });
});

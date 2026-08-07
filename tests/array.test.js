/**
 * Standard Library — Array test suite (Phase 13, §32.3).
 * Covers the NEW Array built-ins only: clear(), length(), isEmpty().
 * push()/pop()/insert()/remove()/sort()/reverse()/contains() are Phase 9
 * built-ins, already covered in interpreter.test.js/e2e.test.js — untouched
 * and not re-tested here. contains()/indexOf()'s String-vs-Array
 * polymorphism is covered in tests/string.test.js, alongside their String
 * behavior, rather than split across two files.
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

describe('clear()', () => {
  test('empties an array in place and returns it', () => {
    assert.deepEqual(
      run('hold arr = box(1, 2, 3)\nclear(arr)\nsay arr\nsay len(arr)'),
      ['[]', '0'],
    );
  });
  test('clearing an already-empty array is a no-op, not an error', () => {
    assert.deepEqual(run('hold arr = box()\nclear(arr)\nsay len(arr)'), ['0']);
  });
  test('a non-Array argument raises P002', () => {
    assert.equal(runExpectingError('say clear(5)').code, 'P002');
  });
  test('large array (10,000 elements) clears correctly', () => {
    const source = `
      hold arr = box()
      repeat 10000 as i
        push(arr, i)
      end repeat
      clear(arr)
      say len(arr)
    `;
    assert.deepEqual(run(source), ['0']);
  });
});

describe('length()', () => {
  test('is a second name for len() — works on both Array and String', () => {
    assert.deepEqual(run('say length(box(10, 20, 30))'), ['3']);
    assert.deepEqual(run('say length("Parithi")'), ['7']);
    assert.deepEqual(run('say length(box())'), ['0']);
  });
  test('a Number argument raises P002', () => {
    assert.equal(runExpectingError('say length(5)').code, 'P002');
  });
});

describe('isEmpty()', () => {
  test('Array — true only when it has zero elements', () => {
    assert.deepEqual(run('say isEmpty(box())'), ['true']);
    assert.deepEqual(run('say isEmpty(box(1))'), ['false']);
  });
  test('non-Array — true only when the value\'s type is actually Empty', () => {
    assert.deepEqual(run('say isEmpty(empty)'), ['true']);
    assert.deepEqual(run('say isEmpty(0)'), ['false']);
    assert.deepEqual(run('say isEmpty("")'), ['false']);
    assert.deepEqual(run('say isEmpty(false)'), ['false']);
  });
});

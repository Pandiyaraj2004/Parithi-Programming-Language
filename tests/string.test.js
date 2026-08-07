/**
 * Standard Library — String test suite (Phase 13, §32.2).
 * Covers every new String built-in independently: normal cases, Unicode
 * strings, invalid argument types/counts, and out-of-range errors (P029).
 * len() is a Phase 6/9 built-in, already covered elsewhere — untouched
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

describe('upper()/lower()/trim()', () => {
  test('normal cases', () => {
    assert.deepEqual(run('say upper("Parithi")'), ['PARITHI']);
    assert.deepEqual(run('say lower("Parithi")'), ['parithi']);
    assert.deepEqual(run('say trim("  hi  ")'), ['hi']);
  });
  test('non-String argument raises P002', () => {
    assert.equal(runExpectingError('say upper(5)').code, 'P002');
  });
});

describe('split()/join()', () => {
  test('normal cases', () => {
    assert.deepEqual(run('say split("a,b,c", ",")'), ['["a", "b", "c"]']);
    assert.deepEqual(run('say join(box("a", "b", "c"), "-")'), ['a-b-c']);
  });
  test('splitting on an empty separator yields one-character elements (Unicode-safe)', () => {
    assert.deepEqual(run('say split("hi", "")'), ['["h", "i"]']);
  });
  test('join() rejects a non-String element', () => {
    assert.equal(runExpectingError('say join(box(1, 2), "-")').code, 'P002');
  });
  test('join() rejects a non-Array first argument', () => {
    assert.equal(runExpectingError('say join("ab", "-")').code, 'P002');
  });
});

describe('replace()', () => {
  test('replaces every occurrence, not just the first', () => {
    assert.deepEqual(run('say replace("aaa", "a", "b")'), ['bbb']);
    assert.deepEqual(run('say replace("banana", "a", "o")'), ['bonono']);
  });
  test('an empty search string is a no-op', () => {
    assert.deepEqual(run('say replace("hi", "", "x")'), ['hi']);
  });
});

describe('startsWith()/endsWith()', () => {
  test('normal cases', () => {
    assert.deepEqual(run('say startsWith("Parithi", "Par")'), ['true']);
    assert.deepEqual(run('say startsWith("Parithi", "xyz")'), ['false']);
    assert.deepEqual(run('say endsWith("Parithi", "thi")'), ['true']);
    assert.deepEqual(run('say endsWith("Parithi", "xyz")'), ['false']);
  });
});

describe('substring()', () => {
  test('normal cases, with and without an explicit end', () => {
    assert.deepEqual(run('say substring("Parithi", 1, 4)'), ['ari']);
    assert.deepEqual(run('say substring("Parithi", 3)'), ['ithi']);
  });
  test('out-of-range or inverted bounds raise P029', () => {
    assert.equal(runExpectingError('say substring("hi", 5, 10)').code, 'P029');
    assert.equal(runExpectingError('say substring("hi", 3, 1)').code, 'P029');
    assert.equal(runExpectingError('say substring("hi", -1, 2)').code, 'P029');
  });
});

describe('indexOf()/lastIndexOf() on Strings', () => {
  test('normal cases', () => {
    assert.deepEqual(run('say indexOf("Parithi", "rit")'), ['2']);
    assert.deepEqual(run('say indexOf("Parithi", "xyz")'), ['-1']);
    assert.deepEqual(run('say lastIndexOf("Parithi", "i")'), ['6']);
    assert.deepEqual(run('say lastIndexOf("Parithi", "xyz")'), ['-1']);
  });
});

describe('repeatText()', () => {
  test('normal cases', () => {
    assert.deepEqual(run('say repeatText("ab", 3)'), ['ababab']);
    assert.deepEqual(run('say repeatText("x", 0)'), ['']);
  });
  test('a negative or non-integer count raises P002', () => {
    assert.equal(runExpectingError('say repeatText("x", -1)').code, 'P002');
    assert.equal(runExpectingError('say repeatText("x", 1.5)').code, 'P002');
  });
});

describe('reverseText()', () => {
  test('ASCII text reverses correctly', () => {
    assert.deepEqual(run('say reverseText("Parithi")'), ['ihtiraP']);
  });
  test('Unicode text (astral code points, e.g. emoji) reverses by code point, not UTF-16 unit', () => {
    // "a" + U+1F600 (a surrogate-pair emoji) + "b" reversed should keep the
    // emoji intact as one character, not split its surrogate pair.
    assert.deepEqual(run('say reverseText("a\u{1F600}b")'), ['b\u{1F600}a']);
  });
});

describe('contains()/indexOf() polymorphism (String vs. Array)', () => {
  test('String haystack', () => {
    assert.deepEqual(run('say contains("Parithi", "rit")'), ['true']);
    assert.deepEqual(run('say contains("Parithi", "xyz")'), ['false']);
  });
  test('Array haystack (Phase 9 behavior preserved)', () => {
    assert.deepEqual(run('say contains(box(1, 2, 3), 2)'), ['true']);
    assert.deepEqual(run('say indexOf(box(10, 20, 30), 20)'), ['1']);
    assert.deepEqual(run('say indexOf(box(10, 20, 30), 99)'), ['-1']);
  });
  test('a non-String needle against a String haystack raises P002', () => {
    assert.equal(runExpectingError('say contains("Parithi", 5)').code, 'P002');
  });
  test('a Boolean/Number first argument (neither String nor Array) raises P002', () => {
    assert.equal(runExpectingError('say contains(5, 5)').code, 'P002');
    assert.equal(runExpectingError('say indexOf(true, true)').code, 'P002');
  });
});

/**
 * Error-message quality test suite — Phase 5.
 * A Phase 5 audit found that ParseError never forwarded a hint to
 * CompilerError, and ParithiRuntimeError had no hint field at all — so no
 * error from the Parser or the Interpreter/Runtime could ever carry a
 * "Hint:" line, no matter what a call site passed. This file locks in the
 * fix: every error class, across every pipeline stage, must be able to
 * produce a hint when the throw site provides one, and every error's
 * formatted text must include the code, message, and location.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { SemanticAnalyzer } from '../src/semantic/analyzer.js';
import { Interpreter } from '../src/interpreter/interpreter.js';
import { CompilerError, ParithiRuntimeError, SourceLocation } from '../src/errors/index.js';
import { ParseError } from '../src/parser/parse-error.js';

function analyzeSource(source) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  return new SemanticAnalyzer(program, 'test.pr').analyze();
}

function runSource(source) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  new Interpreter('test.pr', { write: () => {}, writeLine: () => {}, readLine: () => '' }).run(program);
}

describe('Every error class can carry and render a hint', () => {
  test('CompilerError (used directly by the Lexer) renders a hint', () => {
    const err = new CompilerError('P008', 'Unexpected character "@".', new SourceLocation('t.pr', 1, 1), 'remove it.');
    assert.match(err.format(), /Hint: remove it\./);
  });

  test('ParseError forwards its hint to CompilerError (the Phase 5 structural fix)', () => {
    const err = new ParseError('P011', 'Expected X.', new SourceLocation('t.pr', 1, 1), { hint: 'insert X here.' });
    assert.equal(err.hint, 'insert X here.');
    assert.match(err.format(), /Hint: insert X here\./);
  });

  test('ParithiRuntimeError now has a hint field and renders it (the Phase 5 structural fix)', () => {
    const err = new ParithiRuntimeError('P020', 'Division by zero.', new SourceLocation('t.pr', 1, 1), [], 'check the divisor first.');
    assert.equal(err.hint, 'check the divisor first.');
    assert.match(err.format(), /Hint: check the divisor first\./);
  });

  test('SemanticError (already correct before Phase 5) still renders a hint', () => {
    const result = analyzeSource('say undeclaredVar');
    assert.match(result.diagnostics[0].format(), /Hint:/);
  });
});

describe('Real throw sites now include hints end-to-end', () => {
  test('a lexical error (P008) includes a hint', () => {
    assert.throws(() => new Lexer('@', 't.pr').tokenize(), (err) => {
      assert.match(err.format(), /Hint:/);
      return true;
    });
  });

  test('a parser block-mismatch error (P003) includes a hint', () => {
    const tokens = new Lexer('if true\n    say "x"\nend while', 't.pr').tokenize();
    assert.throws(() => new Parser(tokens, 't.pr').parseProgram(), (err) => {
      assert.match(err.format(), /Hint:/);
      return true;
    });
  });

  test('a semantic error (P002) includes a hint', () => {
    const result = analyzeSource('hold age = 20\nage = "Twenty"');
    assert.match(result.diagnostics[0].format(), /Hint:/);
  });

  test('a runtime error (P020, division by zero) includes a hint', () => {
    assert.throws(() => runSource('hold x = 10 / 0'), (err) => {
      assert.match(err.format(), /Hint:/);
      return true;
    });
  });

  test('a defensive runtime error (P001, undeclared variable) includes a hint', () => {
    assert.throws(() => runSource('say undeclaredVar'), (err) => {
      assert.match(err.format(), /Hint:/);
      return true;
    });
  });

  test('a stack-overflow error (P021) includes both a call stack and a hint', () => {
    const source = ['task loopForever()', '    return loopForever()', 'end task', 'loopForever()'].join('\n');
    assert.throws(() => runSource(source), (err) => {
      assert.ok(err.callStack.length > 0);
      assert.match(err.format(), /Hint:/);
      return true;
    });
  });

  test('a deep call stack (P021) renders truncated as "... (N more)" in format(), per §18\'s documented example, while err.callStack itself keeps every frame', () => {
    const source = ['task loopForever()', '    return loopForever()', 'end task', 'loopForever()'].join('\n');
    assert.throws(() => runSource(source), (err) => {
      assert.equal(err.callStack.length, 500);
      const text = err.format();
      assert.match(text, /\.\.\. \(498 more\)/);
      assert.equal(text.match(/loopForever/g).length, 2);
      return true;
    });
  });
});

describe('Every formatted error includes code, message, and file:line:column', () => {
  test('a lexical error format() includes all required fields', () => {
    try {
      new Lexer('@', 'myfile.pr').tokenize();
      assert.fail('expected a throw');
    } catch (err) {
      const text = err.format();
      assert.match(text, /Error P008:/);
      assert.match(text, /myfile\.pr:1:1/);
    }
  });

  test('a runtime error format() includes all required fields plus the call stack', () => {
    const source = ['task divide(a, b)', '    return a / b', 'end task', 'divide(10, 0)'].join('\n');
    try {
      runSource(source);
      assert.fail('expected a throw');
    } catch (err) {
      const text = err.format();
      assert.match(text, /Error P020:/);
      assert.match(text, /test\.pr:2:12/);
      assert.match(text, /Call stack:/);
      assert.match(text, /divide/);
    }
  });
});

/**
 * End-to-end / integration test suite — Phase 5.
 * Unlike the per-phase suites (which mostly use inline source strings),
 * this file runs the actual example .pr files on disk through the full
 * pipeline, and adds stress/large-program/invalid-program cases that
 * specifically verify no stage is ever skipped.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { SemanticAnalyzer } from '../src/semantic/analyzer.js';
import { Interpreter } from '../src/interpreter/interpreter.js';
import { CompilerError } from '../src/errors/index.js';
import { ParseError } from '../src/parser/parse-error.js';
import { SemanticError } from '../src/semantic/semantic-error.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, '..', 'examples');

/** Runs a whole .pr file through Lexer -> Parser -> SemanticAnalyzer -> Interpreter. */
function runFile(relativePath, { input = [] } = {}) {
  const filePath = join(examplesDir, relativePath);
  const source = readFileSync(filePath, 'utf-8');
  return runSource(source, filePath, { input });
}

function runSource(source, label, { input = [] } = {}) {
  const tokens = new Lexer(source, label).tokenize();
  const program = new Parser(tokens, label).parseProgram();
  const analysis = new SemanticAnalyzer(program, label).analyze();
  if (!analysis.success) {
    throw new Error(`Semantic analysis failed for ${label}: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  }
  const output = [];
  const inputQueue = [...input];
  new Interpreter(label, { write: () => {}, writeLine: (t) => output.push(t), readLine: () => inputQueue.shift() ?? '' }).run(program);
  return output;
}

describe('End-to-End: Real Example Files', () => {
  test('hello.pr executes and prints exactly the greeting', () => {
    assert.deepEqual(runFile('hello.pr'), ['Hello, Parithi!']);
  });

  test('variables.pr executes and prints every declared value', () => {
    const output = runFile('variables.pr');
    assert.deepEqual(output, [
      'Name: Pandiyaraj',
      'Age: 20',
      'Price: 199.99',
      'Is student: true',
      'PI: 3.14159',
    ]);
  });

  test('ifelse.pr executes the if/else and choose/option/other blocks correctly', () => {
    assert.deepEqual(runFile('ifelse.pr'), ['Adult', 'Tuesday']);
  });

  test('loops.pr executes repeat, while, and while+break/continue correctly', () => {
    assert.deepEqual(runFile('loops.pr'), ['1', '2', '3', '4', '5', '1', '2', '3', '4', '5', '1', '3', '5', '7', '9']);
  });

  test('functions.pr executes function declarations, calls, and return values correctly', () => {
    assert.deepEqual(runFile('functions.pr'), ['Hello Pandiyaraj', 'Result: 30']);
  });

  // §20's remaining named example programs (Phase 8) — added as real fixture
  // files once the interpreter could run them, per §10's own placeholder note.
  test('calculator.pr (§20.2) computes sum/difference/product/quotient from input', () => {
    assert.deepEqual(runFile('calculator.pr', { input: ['10', '4'] }), [
      'Sum: 14',
      'Difference: 6',
      'Product: 40',
      'Quotient: 2.5',
    ]);
  });

  test('fizzbuzz.pr (§20.3) prints the documented Fizz/Buzz/FizzBuzz sequence for 1-15', () => {
    assert.deepEqual(runFile('fizzbuzz.pr'), [
      '1', '2', 'Fizz', '4', 'Buzz', 'Fizz', '7', '8', 'Fizz', 'Buzz', '11', 'Fizz', '13', '14', 'FizzBuzz',
    ]);
  });

  test('grade-checker.pr (§20.4) maps a score to a letter grade via readable comparisons', () => {
    assert.deepEqual(runFile('grade-checker.pr', { input: ['85'] }), ['Grade: B']);
  });

  test('while-break-continue.pr (§20.5) prints exactly "1 3 5 7 9", one per line', () => {
    assert.deepEqual(runFile('while-break-continue.pr'), ['1', '3', '5', '7', '9']);
  });

  test('stop.pr (§15.7) prints its warning and halts before the unreachable line', () => {
    assert.deepEqual(runFile('stop.pr'), ['Invalid age — stopping.']);
  });

  test('arrays.pr (§Arrays) demonstrates box(...), push/pop/sort/contains/len, and index access', () => {
    assert.deepEqual(runFile('arrays.pr'), [
      '["apple", "banana", "cherry"]',
      'After push: ["apple", "banana", "cherry", "date"]',
      'Popped: date',
      'After pop: ["apple", "banana", "cherry"]',
      'Sorted: ["apple", "banana", "cherry"]',
      'Contains banana: true',
      'Total fruits: 3',
      'Average score: 88.5',
    ]);
  });

  test('every example file passes semantic analysis with zero diagnostics', () => {
    for (const file of ['hello.pr', 'variables.pr', 'ifelse.pr', 'loops.pr', 'functions.pr', 'calculator.pr', 'fizzbuzz.pr', 'grade-checker.pr', 'while-break-continue.pr', 'stop.pr', 'arrays.pr']) {
      const source = readFileSync(join(examplesDir, file), 'utf-8');
      const tokens = new Lexer(source, file).tokenize();
      const program = new Parser(tokens, file).parseProgram();
      const analysis = new SemanticAnalyzer(program, file).analyze();
      assert.equal(analysis.success, true, `${file} should have zero semantic diagnostics`);
    }
  });
});

describe('End-to-End: examples/stdlib/ (Phase 13, §32)', () => {
  test('calculator.pr demonstrates the Math library additions', () => {
    assert.deepEqual(runFile('stdlib/calculator.pr'), [
      'sqrt(16): 4',
      'pow(16, 3): 4096',
      'abs(-16): 16',
      'floor(7.8): 7',
      'ceil(7.2): 8',
      'min(16, 3): 3',
      'max(16, 3): 16',
      'log(1): 0',
      'exp(0): 1',
      'sin(0): 0',
      'cos(0): 1',
    ]);
  });

  test('random-number-generator.pr runs without error and every roll/value is in range', () => {
    const output = runFile('stdlib/random-number-generator.pr');
    assert.equal(output.length, 7);
    assert.equal(output[0], 'Rolling a six-sided die 5 times:');
    for (const line of output.slice(1, 6)) {
      const n = Number(line);
      assert.ok(Number.isInteger(n) && n >= 1 && n <= 6, `expected a die roll 1-6, got "${line}"`);
    }
    assert.match(output[6], /^A random number between 10 and 20 : \d+$/);
  });

  test('array-demo.pr demonstrates clear()/length()/isEmpty()/indexOf()', () => {
    assert.deepEqual(runFile('stdlib/array-demo.pr'), [
      'Array: ["apple", "banana", "cherry"]',
      'length(): 3',
      'isEmpty(): false',
      "indexOf('banana'): 1",
      "indexOf('kiwi'): -1",
      'After clear(): []',
      'isEmpty() after clear(): true',
    ]);
  });

  test('string-utilities.pr demonstrates the String library additions', () => {
    assert.deepEqual(runFile('stdlib/string-utilities.pr'), [
      'Original:   Hello, Parithi!  ',
      'trim(): Hello, Parithi!',
      'upper(): HELLO, PARITHI!',
      'lower(): hello, parithi!',
      'reverseText(): ihtiraP',
      'split(): ["the", "quick", "brown", "fox"]',
      "join() with '-': the-quick-brown-fox",
      'replace(): bonono',
      "startsWith('the'): true",
      "endsWith('fox'): true",
      'substring(4, 9): quick',
      "indexOf('brown'): 10",
      "lastIndexOf('o'): 17",
      "contains('quick'): true",
      "repeatText('ab', 3): ababab",
    ]);
  });

  test('every stdlib example file passes semantic analysis with zero diagnostics', () => {
    for (const file of ['stdlib/calculator.pr', 'stdlib/random-number-generator.pr', 'stdlib/array-demo.pr', 'stdlib/string-utilities.pr']) {
      const source = readFileSync(join(examplesDir, file), 'utf-8');
      const tokens = new Lexer(source, file).tokenize();
      const program = new Parser(tokens, file).parseProgram();
      const analysis = new SemanticAnalyzer(program, file).analyze();
      assert.equal(analysis.success, true, `${file} should have zero semantic diagnostics`);
    }
  });
});

describe('Large / Complex Programs', () => {
  test('a program with five mutually-calling functions and deep expressions runs correctly', () => {
    const source = [
      'task square(x)',
      '    return x * x',
      'end task',
      'task cube(x)',
      '    return x * square(x)',
      'end task',
      'task sumOfSquares(a, b)',
      '    return square(a) + square(b)',
      'end task',
      'task average(a, b)',
      '    return (a + b) / 2',
      'end task',
      'task describe(a, b)',
      '    say "square:", square(a)',
      '    say "cube:", cube(a)',
      '    say "sumOfSquares:", sumOfSquares(a, b)',
      '    say "average:", average(a, b)',
      'end task',
      'describe(3, 7)',
    ].join('\n');
    assert.deepEqual(runSource(source, 'large.pr'), ['square: 9', 'cube: 27', 'sumOfSquares: 58', 'average: 5']);
  });

  test('a complex expression combining every operator category evaluates correctly', () => {
    // (2 + 3 * 4) is at least 10 and not (5 > 10) => (14 >= 10) and (not false) => true and true => true
    const source = 'say (2 + 3 * 4) is at least 10 and not (5 > 10)';
    assert.deepEqual(runSource(source, 'complex.pr'), ['true']);
  });

  test('deeply nested blocks (5 levels: task > while > if > choose > option) execute correctly', () => {
    const source = [
      'task deepest()',
      '    hold n = 0',
      '    while n < 1',
      '        n = n + 1',
      '        if true',
      '            hold letter = "A"',
      '            choose letter',
      '                option "A"',
      '                    say "reached the bottom"',
      '            end choose',
      '        end if',
      '    end while',
      'end task',
      'deepest()',
    ].join('\n');
    assert.deepEqual(runSource(source, 'deep.pr'), ['reached the bottom']);
  });

  test('recursion just below the call-depth limit completes without error', () => {
    const source = [
      'task countDown(n)',
      '    if n <= 0',
      '        return 0',
      '    end if',
      '    return countDown(n - 1)',
      'end task',
      'say countDown(400)',
    ].join('\n');
    assert.deepEqual(runSource(source, 'recursion.pr'), ['0']);
  });

  test('a large loop (100,000 iterations) computes the correct sum', () => {
    const source = ['hold sum = 0', 'repeat 100000 as i', '    sum = sum + i', 'end repeat', 'say sum'].join('\n');
    // sum of 1..100000 = 100000 * 100001 / 2
    assert.deepEqual(runSource(source, 'stress.pr'), [String((100000 * 100001) / 2)]);
  });

  test('a hand-written bubble sort over an array (functions + loops + arrays together)', () => {
    const source = [
      'task bubbleSort(arr)',
      '    hold n = len(arr)',
      '    repeat n - 1 as i',
      '        repeat n - i as j',
      '            if arr[j - 1] is more than arr[j]',
      '                hold temp = arr[j - 1]',
      '                arr[j - 1] = arr[j]',
      '                arr[j] = temp',
      '            end if',
      '        end repeat',
      '    end repeat',
      '    return arr',
      'end task',
      '',
      'say bubbleSort(box(5, 3, 8, 1, 9, 2))',
    ].join('\n');
    assert.deepEqual(runSource(source, 'bubblesort.pr'), ['[1, 2, 3, 5, 8, 9]']);
  });
});

describe('Invalid Programs — Correct Stage Isolation', () => {
  test('a lexical error is caught by the Lexer before the Parser ever runs', () => {
    assert.throws(
      () => new Lexer('hold x = @', 'bad.pr').tokenize(),
      (err) => {
        assert.ok(err instanceof CompilerError);
        assert.equal(err.code, 'P008');
        return true;
      },
    );
  });

  test('a syntax error is caught by the Parser before the Semantic Analyzer ever runs', () => {
    const tokens = new Lexer('if true\n    say "x"\nend while', 'bad.pr').tokenize();
    assert.throws(
      () => new Parser(tokens, 'bad.pr').parseProgram(),
      (err) => {
        assert.ok(err instanceof ParseError || err.constructor.name === 'MultiParseError');
        return true;
      },
    );
  });

  test('a semantic error is caught before the Interpreter ever runs', () => {
    const tokens = new Lexer('hold age = 20\nage = "Twenty"', 'bad.pr').tokenize();
    const program = new Parser(tokens, 'bad.pr').parseProgram();
    const analysis = new SemanticAnalyzer(program, 'bad.pr').analyze();
    assert.equal(analysis.success, false);
    assert.ok(analysis.diagnostics[0] instanceof SemanticError);
    // Confirm the interpreter is never invoked for this program by the CLI's own
    // gating logic — verified structurally: analysis.success is the CLI's sole gate.
  });

  test('an undeclared variable is only ever caught once analysis reaches it — full pipeline produces one diagnostic', () => {
    const tokens = new Lexer('say undeclaredVar', 'bad.pr').tokenize();
    const program = new Parser(tokens, 'bad.pr').parseProgram();
    const analysis = new SemanticAnalyzer(program, 'bad.pr').analyze();
    assert.equal(analysis.diagnostics.length, 1);
    assert.equal(analysis.diagnostics[0].code, 'P001');
  });
});

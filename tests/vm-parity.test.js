/**
 * Interpreter ↔ PVM parity suite — Phase 11 (MASTER_DOCUMENT.md §30.11).
 * The Phase 11 brief's own "Validation" section, as a permanent test:
 * every program here runs through BOTH backends — the unmodified
 * Tree-Walking Interpreter, and Bytecode Generator + PVM — and asserts
 * identical console output, exit code, and (for programs that error)
 * error code. Two independent execution engines computing the same
 * answer for the same source is the actual proof this phase's brief
 * asks for ("The Interpreter and the PVM must both execute the same
 * language independently"), stronger than either backend's own tests
 * alone.
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
import { VirtualMachine } from '../src/vm/virtual-machine.js';
import { compileFromSource } from '../src/vm/loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, '..', 'examples');

function runInterpreter(source, filePath, input) {
  const tokens = new Lexer(source, filePath).tokenize();
  const program = new Parser(tokens, filePath).parseProgram();
  const analysis = new SemanticAnalyzer(program, filePath).analyze();
  if (!analysis.success) {
    throw new Error(`Interpreter path: semantic analysis unexpectedly failed: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  }
  const output = [];
  const queue = [...input];
  const interpreter = new Interpreter(filePath, { write: () => {}, writeLine: (t) => output.push(t), readLine: () => queue.shift() ?? '' });
  try {
    interpreter.run(program);
    return { output, exitCode: interpreter.exitCode ?? 0 };
  } catch (err) {
    return { output, error: { code: err.code, message: err.message } };
  }
}

function runVM(source, filePath, input) {
  const compiled = compileFromSource(source, filePath);
  if (!compiled.success) {
    throw new Error(`VM path: compile unexpectedly failed: ${JSON.stringify(compiled.diagnostics ?? compiled.errors)}`);
  }
  const output = [];
  const queue = [...input];
  const vm = new VirtualMachine(compiled.bytecode, filePath, { write: () => {}, writeLine: (t) => output.push(t), readLine: () => queue.shift() ?? '' });
  try {
    const exitCode = vm.run();
    return { output, exitCode };
  } catch (err) {
    return { output, error: { code: err.code, message: err.message } };
  }
}

/** Runs `source` through both backends and asserts identical output, and either identical exit code or identical error code. */
function assertParity(source, { input = [], label = 'test.pr' } = {}) {
  const i = runInterpreter(source, label, input);
  const v = runVM(source, label, input);

  assert.deepEqual(v.output, i.output, `console output mismatch for:\n${source}`);

  if (i.error) {
    assert.ok(v.error, `Interpreter errored (${i.error.code}) but VM did not, for:\n${source}`);
    assert.equal(v.error.code, i.error.code, `error code mismatch for:\n${source}`);
  } else {
    assert.ok(!v.error, `VM errored (${v.error?.code}) but Interpreter did not, for:\n${source}`);
    assert.equal(v.exitCode, i.exitCode, `exit code mismatch for:\n${source}`);
  }
}

describe('Parity — variables, constants, scope, shadowing', () => {
  test('declarations, reassignment, and block shadowing', () => {
    assertParity('hold x = 1\nx = 2\nsay x');
    assertParity('const PI = 3.14\nsay PI');
    assertParity('hold x = 1\nif true\n    hold x = 2\n    say x\nend if\nsay x');
    assertParity('hold data = empty\ndata = 5\nsay data');
  });
});

describe('Parity — every operator', () => {
  test('arithmetic', () => {
    for (const op of ['+', '-', '*', '/', '%', '**']) assertParity(`say 17 ${op} 4`);
  });
  test('comparison, symbolic and readable', () => {
    for (const op of ['==', '!=', '>', '<', '>=', '<=']) assertParity(`say 3 ${op} 5`);
    for (const phrase of ['is', 'is not', 'is more than', 'is less than', 'is at least', 'is at most']) assertParity(`say 3 ${phrase} 5`);
  });
  test('logical, including short-circuit with a would-throw right side', () => {
    assertParity('say true and false');
    assertParity('say true or false');
    assertParity('say not true');
    assertParity('say false and (1 / 0 > 0)');
    assertParity('say true or (1 / 0 > 0)');
  });
  test('unary minus and operator precedence', () => {
    assertParity('say -2 ** 2');
    assertParity('say 2 + 3 * 4');
    assertParity('say (2 + 3) * 4');
  });
});

describe('Parity — control flow', () => {
  test('if/else, including nested else-if', () => {
    assertParity('if 1 > 0\n    say "a"\nelse\n    say "b"\nend if');
    const source = ['hold grade = 72', 'if grade >= 90', '    say "A"', 'else', '    if grade >= 80', '        say "B"', '    else', '        say "C"', '    end if', 'end if'].join('\n');
    assertParity(source);
  });

  test('choose/option/other', () => {
    assertParity('choose 2\n    option 1\n        say "one"\n    option 2\n        say "two"\n    other\n        say "?"\nend choose');
    assertParity('choose 9\n    option 1\n        say "one"\nend choose'); // no "other", no match — no-op
  });

  test('repeat (with and without a counter), while, break, continue', () => {
    assertParity('repeat 5 as i\n    say i\nend repeat');
    assertParity('hold n = 0\nrepeat 3\n    n = n + 1\nend repeat\nsay n');
    assertParity('hold i = 0\nwhile i < 5\n    say i\n    i = i + 1\nend while');
    assertParity('hold i = 0\nwhile i < 10\n    i = i + 1\n    if i % 2 == 0\n        continue\n    end if\n    if i > 7\n        break\n    end if\n    say i\nend while');
  });

  test('nested loops', () => {
    assertParity('repeat 3 as i\n    repeat 3 as j\n        say i * j\n    end repeat\nend repeat');
  });

  test('stop, with and without a code, from inside nested control flow', () => {
    assertParity('say "before"\nstop\nsay "after"');
    assertParity('say "before"\nstop 5\nsay "after"');
    const source = ['task validate(age)', '    if age < 0', '        stop 1', '    end if', '    return true', 'end task', 'validate(-5)'].join('\n');
    assertParity(source);
  });
});

describe('Parity — functions', () => {
  test('parameters, return values, and implicit empty', () => {
    assertParity('task add(a, b)\n    return a + b\nend task\nsay add(2, 3)');
    assertParity('task noop()\n    hold x = 1\nend task\nsay noop()');
  });

  test('recursion and mutual recursion', () => {
    assertParity('task fact(n)\n    if n <= 1\n        return 1\n    end if\n    return n * fact(n - 1)\nend task\nsay fact(6)');
    const source = [
      'task isEven(n)', '    if n == 0', '        return true', '    end if', '    return isOdd(n - 1)', 'end task',
      'task isOdd(n)', '    if n == 0', '        return false', '    end if', '    return isEven(n - 1)', 'end task',
      'say isEven(11)',
    ].join('\n');
    assertParity(source);
  });

  test('nested tasks resolving an enclosing parameter, including through recursion', () => {
    const source = ['task outer(n)', '    task inner()', '        return n * 2', '    end task', '    return inner()', 'end task', 'say outer(21)'].join('\n');
    assertParity(source);

    const recursive = [
      'task outer(n)', '    task inner()', '        return n', '    end task',
      '    if n <= 1', '        return inner()', '    end if',
      '    return outer(n - 1)', 'end task', 'say outer(5)',
    ].join('\n');
    assertParity(recursive);
  });
});

describe('Parity — arrays', () => {
  test('literals, indexing, assignment, nesting', () => {
    assertParity('hold a = box(1, 2, 3)\nsay a\nsay a[0]\na[1] = 99\nsay a');
    assertParity('hold m = box(box(1, 2), box(3, 4))\nsay m[1][0]\nm[0][1] = 9\nsay m');
    assertParity('say box()');
  });

  test('reference semantics (aliasing and passing into a task)', () => {
    assertParity('hold a = box(1)\nhold b = a\npush(b, 2)\nsay a');
    assertParity('task addOne(arr)\n    push(arr, 1)\nend task\nhold nums = box()\naddOne(nums)\nsay nums');
  });

  test('deep equality', () => {
    assertParity('say box(1, 2) == box(1, 2)');
    assertParity('say box(1, 2) == box(2, 1)');
  });

  test('every array built-in', () => {
    assertParity('hold a = box(3, 1, 2)\npush(a, 4)\nsay a');
    assertParity('hold a = box(1, 2, 3)\nsay pop(a)\nsay a');
    assertParity('hold a = box(1, 3)\ninsert(a, 1, 2)\nsay a');
    assertParity('hold a = box(1, 2, 3)\nsay remove(a, 1)\nsay a');
    assertParity('hold a = box(3, 1, 2)\nsort(a)\nsay a');
    assertParity('hold a = box(1, 2, 3)\nreverse(a)\nsay a');
    assertParity('hold a = box(1, 2, 3)\nsay contains(a, 2)');
    assertParity('say len(box(1, 2, 3))');
  });
});

describe('Parity — built-ins', () => {
  test('number, text, type, round, random, len', () => {
    assertParity('say number("42")');
    assertParity('say text(42)');
    assertParity('say type(42)\nsay type("x")\nsay type(true)\nsay type(empty)\nsay type(box())');
    assertParity('say round(3.456, 2)');
    assertParity('say len("hello")');
    assertParity('hold r = random(5, 5)\nsay r'); // fixed range — deterministic
  });
});

describe('Parity — error paths (same error code from both backends)', () => {
  test('division/modulo by zero', () => {
    assertParity('say 1 / 0');
    assertParity('say 1 % 0');
  });

  test('array bounds and type errors', () => {
    assertParity('hold a = box(1, 2)\nsay a[5]');
    assertParity('hold a = box(1, 2)\nsay a[-1]');
    assertParity('hold a = box(1, 2)\na[0] = "x"');
    assertParity('hold a = box()\npop(a)');
  });

  test('indexing a non-array reached only through an Unknown-typed parameter', () => {
    assertParity(['task first(x)', '    return x[0]', 'end task', 'first(5)'].join('\n'));
  });

  test('unbounded recursion (call-depth overflow)', () => {
    assertParity('task loopForever()\n    return loopForever()\nend task\nloopForever()');
  });

  test('invalid number() conversion', () => {
    assertParity('say number("not a number")');
  });
});

describe('Parity — I/O', () => {
  test('ask() reads the piped input identically on both backends', () => {
    assertParity('hold name = ask("Name? ")\nsay "Hi,", name', { input: ['Ada'] });
  });

  test('multi-value say', () => {
    assertParity('say "a", 1, true, empty');
  });
});

describe('Parity — every real example program', () => {
  const inputs = { 'calculator.pr': ['12', '5'], 'grade-checker.pr': ['85'] };
  for (const file of ['hello.pr', 'variables.pr', 'ifelse.pr', 'loops.pr', 'functions.pr', 'calculator.pr', 'fizzbuzz.pr', 'grade-checker.pr', 'while-break-continue.pr', 'stop.pr', 'arrays.pr']) {
    test(`${file} produces identical output and exit code on both backends`, () => {
      const source = readFileSync(join(examplesDir, file), 'utf-8');
      assertParity(source, { input: inputs[file] ?? [], label: file });
    });
  }
});

describe('Parity — larger programs', () => {
  test('a hand-written bubble sort', () => {
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
      'say bubbleSort(box(9, 4, 7, 1, 3, 8, 2, 6, 5))',
    ].join('\n');
    assertParity(source);
  });

  test('a large loop (50,000 iterations)', () => {
    assertParity(['hold sum = 0', 'repeat 50000 as i', '    sum = sum + i', 'end repeat', 'say sum'].join('\n'));
  });

  test('5-level nested control flow (task > while > if > choose > option)', () => {
    const source = [
      'task deepest()', '    hold n = 0', '    while n < 1', '        n = n + 1', '        if true',
      '            hold letter = "A"', '            choose letter', '                option "A"',
      '                    say "reached the bottom"', '            end choose', '        end if',
      '    end while', 'end task', 'deepest()',
    ].join('\n');
    assertParity(source);
  });
});

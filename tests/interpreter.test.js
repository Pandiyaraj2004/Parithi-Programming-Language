/**
 * Interpreter test suite — Phase 4.
 * Exercises expression evaluation, all statement types, control flow,
 * functions/recursion, built-ins, input, and runtime errors — including
 * the interpreter's own defensive checks, tested independently of the
 * Semantic Analyzer via `runRaw()`.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { SemanticAnalyzer } from '../src/semantic/analyzer.js';
import { Interpreter } from '../src/interpreter/interpreter.js';
import { ParithiRuntimeError } from '../src/errors/index.js';

/** Full pipeline: lex -> parse -> analyze -> interpret. Fails loudly if analysis rejects the program. */
function run(source, { input = [] } = {}) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  const analysis = new SemanticAnalyzer(program, 'test.pr').analyze();
  if (!analysis.success) {
    throw new Error(`Semantic analysis unexpectedly failed: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  }
  return execute(program, input);
}

/** Skips semantic analysis — for testing the interpreter's OWN defensive checks in isolation. */
function runRaw(source, { input = [] } = {}) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  return execute(program, input);
}

function execute(program, input) {
  const output = [];
  const inputQueue = [...input];
  const interpreter = new Interpreter('test.pr', {
    write: () => {},
    writeLine: (text) => output.push(text),
    readLine: () => inputQueue.shift() ?? '',
  });
  interpreter.run(program);
  return output;
}

/** Like run(), but also exposes the interpreter's exitCode — for "stop" tests (§15.7). */
function runWithExitCode(source) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  const analysis = new SemanticAnalyzer(program, 'test.pr').analyze();
  if (!analysis.success) {
    throw new Error(`Semantic analysis unexpectedly failed: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  }
  const output = [];
  const interpreter = new Interpreter('test.pr', { write: () => {}, writeLine: (t) => output.push(t), readLine: () => '' });
  interpreter.run(program);
  return { output, exitCode: interpreter.exitCode };
}

describe('Hello World', () => {
  test('say "Hello, Parithi!" prints exactly that', () => {
    assert.deepEqual(run('say "Hello, Parithi!"'), ['Hello, Parithi!']);
  });
});

describe('Variables, Constants, and Assignments', () => {
  test('a variable prints its declared value', () => {
    assert.deepEqual(run('hold age = 20\nsay age'), ['20']);
  });

  test('a constant prints its declared value', () => {
    assert.deepEqual(run('const PI = 3.14\nsay PI'), ['3.14']);
  });

  test('reassignment updates the value', () => {
    assert.deepEqual(run('hold age = 20\nage = 25\nsay age'), ['25']);
  });

  test('multiple say arguments are space-joined on one line', () => {
    assert.deepEqual(run('hold age = 20\nsay "Age:", age'), ['Age: 20']);
  });
});

describe('Arithmetic', () => {
  test('all six arithmetic operators evaluate correctly', () => {
    const source = ['say 2 + 3', 'say 5 - 2', 'say 4 * 3', 'say 10 / 2', 'say 10 % 3', 'say 2 ** 3'].join('\n');
    assert.deepEqual(run(source), ['5', '3', '12', '5', '1', '8']);
  });

  test('parentheses override default precedence', () => {
    assert.deepEqual(run('say (2 + 3) * 4'), ['20']);
  });

  // §13.5's own worked examples, evaluated end-to-end rather than checked
  // only at the AST-shape level (parser.test.js verifies tree shape; this
  // verifies the numeric result that shape is supposed to produce).
  test('"**" is right-associative: 2 ** 3 ** 2 evaluates to 512, not 64', () => {
    assert.deepEqual(run('say 2 ** 3 ** 2'), ['512']);
  });

  test('unary "-" binds looser than "**": -2 ** 2 evaluates to -4, not 4', () => {
    assert.deepEqual(run('say -2 ** 2'), ['-4']);
  });

  test('"-" is left-associative: 10 - 3 - 2 evaluates to 5, not 9', () => {
    assert.deepEqual(run('say 10 - 3 - 2'), ['5']);
  });

  test('string concatenation with "+"', () => {
    assert.deepEqual(run('hold name = "Parithi"\nsay "Hello, " + name'), ['Hello, Parithi']);
  });
});

describe('Comparison Operators', () => {
  test('all six comparison operators evaluate correctly', () => {
    const source = ['say 5 == 5', 'say 5 != 3', 'say 5 > 3', 'say 3 < 5', 'say 5 >= 5', 'say 3 <= 5'].join('\n');
    assert.deepEqual(run(source), ['true', 'true', 'true', 'true', 'true', 'true']);
  });

  test('readable comparison forms evaluate the same as their symbolic equivalents', () => {
    assert.deepEqual(run('say 20 is at least 18'), ['true']);
    assert.deepEqual(run('say 5 is more than 10'), ['false']);
  });
});

describe('Logical Operators', () => {
  test('"and"/"or"/"not" evaluate correctly', () => {
    assert.deepEqual(run('say true and false'), ['false']);
    assert.deepEqual(run('say true or false'), ['true']);
    assert.deepEqual(run('say not true'), ['false']);
  });

  test('"or" short-circuits — the right side is never evaluated once the left is true', () => {
    const source = ['task sideEffect()', '    say "called"', '    return true', 'end task', 'hold x = true or sideEffect()'].join('\n');
    assert.deepEqual(run(source), []);
  });

  test('"and" short-circuits — the right side is never evaluated once the left is false', () => {
    const source = ['task sideEffect()', '    say "called"', '    return true', 'end task', 'hold x = false and sideEffect()'].join('\n');
    assert.deepEqual(run(source), []);
  });
});

describe('Unary Operators', () => {
  test('unary "-" and "not" evaluate correctly', () => {
    assert.deepEqual(run('say -5'), ['-5']);
    assert.deepEqual(run('say not true'), ['false']);
  });
});

describe('If / Else', () => {
  test('only the "then" branch runs when the condition is true', () => {
    assert.deepEqual(run('if 20 >= 18\n    say "Adult"\nelse\n    say "Minor"\nend if'), ['Adult']);
  });

  test('only the "else" branch runs when the condition is false', () => {
    assert.deepEqual(run('if 10 >= 18\n    say "Adult"\nelse\n    say "Minor"\nend if'), ['Minor']);
  });
});

describe('Choose', () => {
  test('the documented day-of-week example (§20.6) prints exactly "Tuesday"', () => {
    const source = [
      'hold day = 2',
      'choose day',
      '    option 1',
      '        say "Monday"',
      '    option 2',
      '        say "Tuesday"',
      '    option 3',
      '        say "Wednesday"',
      '    other',
      '        say "Unknown"',
      'end choose',
    ].join('\n');
    assert.deepEqual(run(source), ['Tuesday']);
  });

  test('falls through to "other" when nothing matches', () => {
    const source = ['hold day = 9', 'choose day', '    option 1', '        say "Monday"', '    other', '        say "Unknown"', 'end choose'].join('\n');
    assert.deepEqual(run(source), ['Unknown']);
  });

  test('exactly one clause runs — no fall-through even without "other"', () => {
    const source = ['hold day = 5', 'choose day', '    option 5', '        say "Friday"', '    option 6', '        say "Saturday"', 'end choose'].join('\n');
    assert.deepEqual(run(source), ['Friday']);
  });

  test('a negative option value ("option -1") correctly matches a negative discriminant (production-readiness audit fix)', () => {
    const source = ['hold x = -1', 'choose x', '    option -1', '        say "negative one"', '    option 0', '        say "zero"', '    other', '        say "other"', 'end choose'].join('\n');
    assert.deepEqual(run(source), ['negative one']);
  });
});

describe('Repeat', () => {
  test('repeats the body the given number of times with no counter', () => {
    assert.deepEqual(run('repeat 3\n    say "Hello"\nend repeat'), ['Hello', 'Hello', 'Hello']);
  });

  test('the counter starts at 1 and is inclusive (§15.2)', () => {
    assert.deepEqual(run('repeat 5 as i\n    say i\nend repeat'), ['1', '2', '3', '4', '5']);
  });
});

describe('While', () => {
  test('the condition is re-evaluated every iteration', () => {
    assert.deepEqual(
      run('hold age = 16\nwhile age < 18\n    age = age + 1\nend while\nsay age'),
      ['18'],
    );
  });
});

describe('Stop Statement (§15.7)', () => {
  test('a bare "stop" at the top level halts execution immediately with exit code 0', () => {
    const { output, exitCode } = runWithExitCode('say "before"\nstop\nsay "after"');
    assert.deepEqual(output, ['before']);
    assert.equal(exitCode, 0);
  });

  test('"stop <n>" halts with exit code n, truncating a Decimal toward zero', () => {
    assert.equal(runWithExitCode('stop 5').exitCode, 5);
    assert.equal(runWithExitCode('stop 3.9').exitCode, 3);
  });

  test('"stop" inside a loop halts the ENTIRE program, not just the loop', () => {
    const { output, exitCode } = runWithExitCode(
      ['hold i = 0', 'while true', '    i = i + 1', '    if i == 3', '        stop 7', '    end if', '    say i', 'end while', 'say "unreachable"'].join('\n'),
    );
    assert.deepEqual(output, ['1', '2']);
    assert.equal(exitCode, 7);
  });

  test('"stop" inside a nested function call halts the entire program, unwinding past every call frame', () => {
    const source = [
      'task inner()',
      '    say "in inner"',
      '    stop 9',
      '    say "unreachable in inner"',
      'end task',
      'task outer()',
      '    say "in outer"',
      '    inner()',
      '    say "unreachable in outer"',
      'end task',
      'outer()',
      'say "unreachable at top level"',
    ].join('\n');
    const { output, exitCode } = runWithExitCode(source);
    assert.deepEqual(output, ['in outer', 'in inner']);
    assert.equal(exitCode, 9);

    // The call stack and environment stack are left as-is on "stop" (the
    // process is ending, so nothing is left to leak into) — re-run directly
    // to confirm this doesn't throw or corrupt subsequent state.
    const tokens = new Lexer(source, 'test.pr').tokenize();
    const program = new Parser(tokens, 'test.pr').parseProgram();
    const interpreter = new Interpreter('test.pr', { write: () => {}, writeLine: () => {}, readLine: () => '' });
    assert.doesNotThrow(() => interpreter.run(program));
  });

  test('"stop" is not treated as an error — pari --runtime reports it as a clean halt, not a failure', () => {
    const { exitCode } = runWithExitCode('stop 2');
    assert.equal(exitCode, 2); // not thrown as a ParithiRuntimeError — see interpreter.js's run()
  });
});

describe('Break / Continue', () => {
  test('"break" exits the loop immediately', () => {
    const source = ['hold n = 0', 'while true', '    n = n + 1', '    if n == 5', '        break', '    end if', 'end while', 'say n'].join('\n');
    assert.deepEqual(run(source), ['5']);
  });

  test('"continue" skips the rest of that iteration only', () => {
    const source = ['hold sum = 0', 'repeat 5 as i', '    if i == 3', '        continue', '    end if', '    sum = sum + i', 'end repeat', 'say sum'].join('\n');
    assert.deepEqual(run(source), ['12']); // 1+2+4+5, skipping 3
  });

  // §15.2's explicit rule: break/continue inside a choose act on the
  // ENCLOSING loop, not the choose block itself (choose has no loop-control
  // semantics of its own — there's no fall-through to guard against).
  test('"break" inside a "choose" nested in a "while" exits the enclosing loop, not just the choose block', () => {
    const source = [
      'hold i = 0',
      'while true',
      '    i = i + 1',
      '    choose i',
      '        option 3',
      '            break',
      '        other',
      '            say i',
      '    end choose',
      'end while',
      'say "done"',
    ].join('\n');
    assert.deepEqual(run(source), ['1', '2', 'done']);
  });

  test('"continue" inside a "choose" nested in a "repeat" skips to the next iteration of the enclosing loop', () => {
    const source = [
      'hold sum = 0',
      'repeat 5 as i',
      '    choose i',
      '        option 3',
      '            continue',
      '        other',
      '            sum = sum + i',
      '    end choose',
      'end repeat',
      'say sum',
    ].join('\n');
    assert.deepEqual(run(source), ['12']); // 1+2+4+5, skipping 3 via choose->continue
  });
});

describe('Functions', () => {
  test('a function with parameters and a return value', () => {
    assert.deepEqual(run('task add(a, b)\n    return a + b\nend task\nsay add(10, 20)'), ['30']);
  });

  test('recursion: factorial(5) = 120 (the documented example)', () => {
    const source = [
      'task factorial(n)',
      '    if n <= 1',
      '        return 1',
      '    end if',
      '    return n * factorial(n - 1)',
      'end task',
      'say factorial(5)',
    ].join('\n');
    assert.deepEqual(run(source), ['120']);
  });

  test('nested function declarations work', () => {
    const source = ['task outer()', '    task inner()', '        return 42', '    end task', '    return inner()', 'end task', 'say outer()'].join('\n');
    assert.deepEqual(run(source), ['42']);
  });

  test('a function may call another declared later in the same scope (hoisting)', () => {
    const source = ['task callFirst()', '    return callSecond()', 'end task', 'task callSecond()', '    return 42', 'end task', 'say callFirst()'].join('\n');
    assert.deepEqual(run(source), ['42']);
  });

  test('a function with no return statement implicitly returns empty (§16.2)', () => {
    assert.deepEqual(run('task f()\n    say "hi"\nend task\nsay f()'), ['hi', 'empty']);
  });
});

describe('Variable Shadowing & Block Scope', () => {
  test('the documented shadowing example (§14.3) prints 10 then 20', () => {
    const source = ['hold age = 20', 'task demo()', '    hold age = 10', '    say age', 'end task', 'demo()', 'say age'].join('\n');
    assert.deepEqual(run(source), ['10', '20']);
  });

  test('the interpreter enforces block scope independently of semantic analysis', () => {
    assert.throws(
      () => runRaw('if true\n    hold x = 5\nend if\nsay x'),
      (err) => {
        assert.ok(err instanceof ParithiRuntimeError);
        assert.equal(err.code, 'P001');
        return true;
      },
    );
  });
});

describe('Built-in Functions', () => {
  test('len(), number(), text(), type() all behave per §16.3', () => {
    const source = ['say len("hello")', 'say number("42")', 'say text(42)', 'say type(42)', 'say type(3.5)', 'say type("x")', 'say type(true)'].join('\n');
    assert.deepEqual(run(source), ['5', '42', '42', 'Number', 'Decimal', 'String', 'Boolean']);
  });

  test('round() rounds to the nearest integer, half away from zero', () => {
    assert.deepEqual(run('say round(3.5)\nsay round(-3.5)'), ['4', '-4']);
  });

  test('round(x, digits) rounds to a fixed number of decimal places', () => {
    assert.deepEqual(run('say round(3.14159, 2)'), ['3.14']);
  });

  test('random() returns a Decimal in [0, 1)', () => {
    const [value] = run('say random()').map(Number);
    assert.ok(value >= 0 && value < 1);
  });

  test('random(min, max) returns an integer within the inclusive range', () => {
    for (let i = 0; i < 20; i++) {
      const [value] = run('say random(1, 10)').map(Number);
      assert.ok(Number.isInteger(value) && value >= 1 && value <= 10);
    }
  });
});

describe('Input', () => {
  test('ask() returns the supplied input line as a String', () => {
    const output = run('hold name = ask("Enter your name")\nsay "Hello,", name', { input: ['Pandiyaraj'] });
    assert.deepEqual(output, ['Hello, Pandiyaraj']);
  });
});

describe('Runtime Errors', () => {
  test('division by zero raises P020', () => {
    assert.throws(
      () => run('hold x = 10 / 0'),
      (err) => {
        assert.ok(err instanceof ParithiRuntimeError);
        assert.equal(err.code, 'P020');
        return true;
      },
    );
  });

  test('modulo by zero also raises P020', () => {
    assert.throws(() => run('hold x = 10 % 0'), (err) => err.code === 'P020');
  });

  test('an invalid conversion (number("abc")) raises P006', () => {
    assert.throws(
      () => run('hold x = number("abc")'),
      (err) => {
        assert.equal(err.code, 'P006');
        return true;
      },
    );
  });

  test('unbounded recursion raises P021 (stack overflow), not a raw JS crash', () => {
    const source = ['task loopForever()', '    return loopForever()', 'end task', 'loopForever()'].join('\n');
    assert.throws(
      () => run(source),
      (err) => {
        assert.ok(err instanceof ParithiRuntimeError);
        assert.equal(err.code, 'P021');
        return true;
      },
    );
  });

  test('every runtime error carries a location and a non-empty call stack when raised inside a function', () => {
    const source = ['task divide(a, b)', '    return a / b', 'end task', 'divide(10, 0)'].join('\n');
    try {
      run(source);
      assert.fail('expected run() to throw');
    } catch (err) {
      assert.equal(err.code, 'P020');
      assert.ok(err.location);
      assert.ok(err.callStack.length > 0);
      assert.match(err.callStack[0], /divide/);
    }
  });

  test('the interpreter defensively rejects constant reassignment even without semantic analysis', () => {
    assert.throws(
      () => runRaw('const PI = 3.14\nPI = 5'),
      (err) => {
        assert.ok(err instanceof ParithiRuntimeError);
        assert.equal(err.code, 'P005');
        return true;
      },
    );
  });

  test('the interpreter defensively rejects an undeclared variable even without semantic analysis', () => {
    assert.throws(() => runRaw('say undeclaredVar'), (err) => err.code === 'P001');
  });
});

describe('Complex Programs', () => {
  test('a multi-feature program (const, task, repeat, choose) produces the expected output', () => {
    const source = [
      'const PASSING_GRADE = 60',
      '',
      'task gradeFor(score)',
      '    if score >= PASSING_GRADE',
      '        return "Pass"',
      '    end if',
      '    return "Fail"',
      'end task',
      '',
      'hold total = 0',
      'repeat 3 as i',
      '    total = total + i',
      'end repeat',
      '',
      'hold result = gradeFor(total * 10)',
      '',
      'choose result',
      '    option "Pass"',
      '        say "Well done"',
      '    option "Fail"',
      '        say "Try again"',
      'end choose',
    ].join('\n');
    // total = 1+2+3 = 6; gradeFor(60) -> "Pass" (score >= 60)
    assert.deepEqual(run(source), ['Well done']);
  });
});

describe('Arrays (§Arrays)', () => {
  test('an empty "box()" prints as "[]" and has length 0', () => {
    assert.deepEqual(run('hold a = box()\nsay a\nsay len(a)'), ['[]', '0']);
  });

  test('a single-element array', () => {
    assert.deepEqual(run('hold a = box(42)\nsay a\nsay len(a)'), ['[42]', '1']);
  });

  test('a multi-element array prints all its elements', () => {
    assert.deepEqual(run('hold a = box(1, 2, 3)\nsay a'), ['[1, 2, 3]']);
  });

  test('string elements are quoted when the array itself is printed', () => {
    assert.deepEqual(run('hold a = box("x", "y")\nsay a'), ['["x", "y"]']);
  });

  test('indexing reads the correct element (0-based)', () => {
    assert.deepEqual(run('hold a = box(10, 20, 30)\nsay a[0]\nsay a[2]'), ['10', '30']);
  });

  test('index assignment mutates the array in place', () => {
    assert.deepEqual(run('hold a = box(1, 2, 3)\na[1] = 99\nsay a'), ['[1, 99, 3]']);
  });

  test('nested arrays: construction, printing, and chained indexing', () => {
    const source = 'hold m = box(box(1, 2), box(3, 4))\nsay m\nsay m[1][0]';
    assert.deepEqual(run(source), ['[[1, 2], [3, 4]]', '3']);
  });

  test('chained index assignment mutates the inner array', () => {
    assert.deepEqual(run('hold m = box(box(1, 2), box(3, 4))\nm[0][1] = 99\nsay m'), ['[[1, 99], [3, 4]]']);
  });

  test('push() appends and returns the (mutated) array', () => {
    assert.deepEqual(run('hold a = box(1, 2)\npush(a, 3)\nsay a'), ['[1, 2, 3]']);
  });

  test('pop() removes and returns the last element', () => {
    assert.deepEqual(run('hold a = box(1, 2, 3)\nhold last = pop(a)\nsay last\nsay a'), ['3', '[1, 2]']);
  });

  test('insert() places an element at the given index, shifting the rest right', () => {
    assert.deepEqual(run('hold a = box(1, 2, 3)\ninsert(a, 1, 99)\nsay a'), ['[1, 99, 2, 3]']);
  });

  test('insert() at index == length behaves like push()', () => {
    assert.deepEqual(run('hold a = box(1, 2)\ninsert(a, 2, 3)\nsay a'), ['[1, 2, 3]']);
  });

  test('remove() removes and returns the element at the given index', () => {
    assert.deepEqual(run('hold a = box(1, 2, 3)\nhold removed = remove(a, 1)\nsay removed\nsay a'), ['2', '[1, 3]']);
  });

  test('sort() sorts numbers ascending in place', () => {
    assert.deepEqual(run('hold a = box(3, 1, 2)\nsort(a)\nsay a'), ['[1, 2, 3]']);
  });

  test('sort() sorts strings lexicographically', () => {
    assert.deepEqual(run('hold a = box("banana", "apple", "cherry")\nsort(a)\nsay a'), ['["apple", "banana", "cherry"]']);
  });

  test('reverse() reverses the array in place', () => {
    assert.deepEqual(run('hold a = box(1, 2, 3)\nreverse(a)\nsay a'), ['[3, 2, 1]']);
  });

  test('contains() finds a matching element by deep equality', () => {
    assert.deepEqual(run('hold a = box(1, 2, 3)\nsay contains(a, 2)\nsay contains(a, 9)'), ['true', 'false']);
  });

  test('contains() uses deep equality for nested arrays too', () => {
    assert.deepEqual(run('hold a = box(box(1, 2), box(3, 4))\nsay contains(a, box(3, 4))'), ['true']);
  });

  test('"==" and "!=" compare arrays structurally, not by reference', () => {
    const source = [
      'hold a = box(1, 2, 3)',
      'hold b = box(1, 2, 3)',
      'hold c = box(1, 2, 4)',
      'say a == b',
      'say a == c',
      'say a != c',
    ].join('\n');
    assert.deepEqual(run(source), ['true', 'false', 'true']);
  });

  test('assigning one array to another shares the same underlying array (reference semantics)', () => {
    const source = ['hold a = box(1, 2, 3)', 'hold b = a', 'push(b, 4)', 'say a'].join('\n');
    assert.deepEqual(run(source), ['[1, 2, 3, 4]']);
  });

  test('an array passed into a task is the same reference — mutations are visible to the caller', () => {
    const source = [
      'task addOne(arr)',
      '    push(arr, 1)',
      'end task',
      '',
      'hold nums = box()',
      'addOne(nums)',
      'say nums',
    ].join('\n');
    assert.deepEqual(run(source), ['[1]']);
  });

  test('indexing into a task parameter works (element type is Unknown to the static type system)', () => {
    const source = ['task first(arr)', '    return arr[0]', 'end task', '', 'say first(box(7, 8, 9))'].join('\n');
    assert.deepEqual(run(source), ['7']);
  });

  test('a task can return an array', () => {
    const source = ['task makeArr()', '    return box(1, 2, 3)', 'end task', '', 'say makeArr()'].join('\n');
    assert.deepEqual(run(source), ['[1, 2, 3]']);
  });

  describe('Invalid indexes / assignments (runtime errors)', () => {
    test('reading past the end raises P024', () => {
      assert.throws(() => run('hold a = box(1, 2, 3)\nsay a[3]'), (err) => err.code === 'P024');
    });

    test('a negative index raises P027', () => {
      assert.throws(() => run('hold a = box(1, 2, 3)\nsay a[-1]'), (err) => err.code === 'P027');
    });

    test('indexing into an empty array always raises P024', () => {
      assert.throws(() => run('hold a = box()\nsay a[0]'), (err) => err.code === 'P024');
    });

    test('a Decimal index is truncated toward zero rather than rejected', () => {
      assert.deepEqual(run('hold a = box(10, 20, 30)\nsay a[1.9]'), ['20']);
    });

    test('assigning past the end raises P024 (index assignment never grows the array)', () => {
      assert.throws(() => run('hold a = box(1, 2, 3)\na[5] = 1'), (err) => err.code === 'P024');
    });

    test('indexing a non-array value raises P025, defensively, when the target type is Unknown', () => {
      const source = ['task first(x)', '    return x[0]', 'end task', '', 'say first(5)'].join('\n');
      assert.throws(() => run(source), (err) => err.code === 'P025');
    });

    test('assigning a mismatched-type element via index assignment raises P026', () => {
      assert.throws(() => run('hold a = box(1, 2, 3)\na[0] = "oops"'), (err) => err.code === 'P026');
    });

    test('push()ing a mismatched-type element raises P026', () => {
      assert.throws(() => run('hold a = box(1, 2, 3)\npush(a, "oops")'), (err) => err.code === 'P026');
    });

    test('push()ing "empty" never conflicts with an established element type', () => {
      assert.deepEqual(run('hold a = box(1, 2)\npush(a, empty)\nsay a'), ['[1, 2, empty]']);
    });

    test('a box(...) literal built from Unknown-typed parameters is still checked defensively at runtime', () => {
      const source = ['task make(x, y)', '    return box(x, y)', 'end task', '', 'say make(1, "two")'].join('\n');
      assert.throws(() => run(source), (err) => err.code === 'P026');
    });

    test('pop() from an empty array raises P024', () => {
      assert.throws(() => run('hold a = box()\npop(a)'), (err) => err.code === 'P024');
    });

    test('insert() at an out-of-range index raises P024', () => {
      assert.throws(() => run('hold a = box(1, 2, 3)\ninsert(a, 10, 1)'), (err) => err.code === 'P024');
    });

    test('remove() at an out-of-range index raises P024', () => {
      assert.throws(() => run('hold a = box(1, 2, 3)\nremove(a, 10)'), (err) => err.code === 'P024');
    });

    test('a non-numeric index raises P002, defensively, when statically Unknown', () => {
      const source = ['task get(arr, i)', '    return arr[i]', 'end task', '', 'say get(box(1, 2), "x")'].join('\n');
      assert.throws(() => run(source), (err) => err.code === 'P002');
    });

    test('a built-in array function called on a non-array raises P002, defensively, when statically Unknown', () => {
      const source = ['task doPush(x)', '    push(x, 1)', 'end task', '', 'doPush(5)'].join('\n');
      assert.throws(() => run(source), (err) => err.code === 'P002');
    });
  });
});

describe('Unified Loop Model (§36)', () => {
  test('a bare "loop" with a counted "break" produces the documented output', () => {
    const source = 'hold i = 1\nloop\n    say i\n    if i == 5\n        break\n    end if\n    i = i + 1\nend loop';
    assert.deepEqual(run(source), ['1', '2', '3', '4', '5']);
  });

  test('"continue" inside a "loop" skips the rest of that iteration only', () => {
    const source = [
      'hold i = 0',
      'loop',
      '    i = i + 1',
      '    if i == 3',
      '        continue',
      '    end if',
      '    say i',
      '    if i == 5',
      '        break',
      '    end if',
      'end loop',
    ].join('\n');
    assert.deepEqual(run(source), ['1', '2', '4', '5']);
  });

  test('"break <expression>" is evaluated exactly once and becomes the loop\'s value', () => {
    const source = [
      'hold items = box(3, 7, 10, 15)',
      'hold i = 0',
      'hold result = loop',
      '    hold item = items[i]',
      '    if item == 10',
      '        break item',
      '    end if',
      '    i = i + 1',
      'end loop',
      'say result',
    ].join('\n');
    assert.deepEqual(run(source), ['10']);
  });

  test('a bare "break" (no value) makes the loop expression evaluate to Empty', () => {
    assert.deepEqual(run('hold r = loop\n    break\nend loop\nsay type(r)'), ['Empty']);
  });

  test('nested loops: the inner "break" only terminates the inner loop, and its value never reaches the outer result', () => {
    const source = 'hold result = loop\n    loop\n        break 10\n    end loop\n    break 20\nend loop\nsay result';
    assert.deepEqual(run(source), ['20']);
  });

  test('deeply nested loops: each "break" terminates only its own nearest loop', () => {
    const source = [
      'hold count = 0',
      'loop',
      '    loop',
      '        loop',
      '            count = count + 1',
      '            break',
      '        end loop',
      '        break',
      '    end loop',
      '    break',
      'end loop',
      'say count',
    ].join('\n');
    assert.deepEqual(run(source), ['1']);
  });

  test('"break" inside a loop that is itself inside a function does not return from the function', () => {
    const source = 'task find()\n    loop\n        if true\n            break 42\n        end if\n    end loop\n    return 1\nend task\nsay find()';
    assert.deepEqual(run(source), ['1']);
  });

  test('"return" inside a loop is distinct from "break" — it exits the enclosing function, not just the loop', () => {
    const source = 'task find()\n    loop\n        return 42\n    end loop\n    return 1\nend task\nsay find()';
    assert.deepEqual(run(source), ['42']);
  });

  test('a recursive function whose body contains a loop works correctly across recursive calls', () => {
    const source = [
      'task countDown(n)',
      '    loop',
      '        if n == 0',
      '            return 0',
      '        end if',
      '        break',
      '    end loop',
      '    return n',
      'end task',
      'say countDown(3)',
      'say countDown(0)',
    ].join('\n');
    assert.deepEqual(run(source), ['3', '0']);
  });

  test('"while" used as an expression evaluates to its "break <expression>" value', () => {
    const source = [
      'hold x = 0',
      'hold r = while x < 10',
      '    x = x + 1',
      '    if x == 5',
      '        break x',
      '    end if',
      'end while',
      'say r',
    ].join('\n');
    assert.deepEqual(run(source), ['5']);
  });

  test('"repeat" used as an expression evaluates to its "break <expression>" value', () => {
    const source = 'hold r = repeat 10 as i\n    if i == 4\n        break i\n    end if\nend repeat\nsay r';
    assert.deepEqual(run(source), ['4']);
  });

  test('"while"/"repeat" with no "break" at all still run exactly as before (a bare statement, natural exit)', () => {
    assert.deepEqual(run('hold i = 0\nwhile i < 3\n    say i\n    i = i + 1\nend while'), ['0', '1', '2']);
    assert.deepEqual(run('repeat 3 as i\n    say i\nend repeat'), ['1', '2', '3']);
  });

  test('"while" used as an expression that exits naturally (no "break") evaluates to Empty', () => {
    assert.deepEqual(run('hold x = 10\nhold r = while x < 5\n    x = x + 1\nend while\nsay type(r)'), ['Empty']);
  });

  test('a loop combined with array indexing and a Standard Library call', () => {
    const source = [
      'hold items = box("a", "b", "c")',
      'hold i = 0',
      'loop',
      '    if i >= len(items)',
      '        break',
      '    end if',
      '    say upper(items[i])',
      '    i = i + 1',
      'end loop',
    ].join('\n');
    assert.deepEqual(run(source), ['A', 'B', 'C']);
  });
});

/**
 * Semantic Analyzer test suite — Phase 3.
 * Exercises declarations, scope/shadowing, type inference, function
 * validation, control-flow context rules, choose validation, reserved
 * names, nested scopes, and multi-diagnostic recovery.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { SemanticAnalyzer } from '../src/semantic/analyzer.js';

function analyze(source) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  return new SemanticAnalyzer(program, 'test.pr').analyze();
}

function codesOf(result) {
  return result.diagnostics.map((d) => d.code);
}

describe('Variable Declarations', () => {
  test('"hold age = 20" declares a Number variable in the global scope', () => {
    const result = analyze('hold age = 20');
    assert.equal(result.success, true);
    const symbol = result.globalScope.resolve('age');
    assert.equal(symbol.kind, 'variable');
    assert.equal(symbol.dataType, 'Number');
    assert.equal(symbol.mutable, true);
  });

  test('"const PI = 3.14" declares an immutable Decimal constant', () => {
    const result = analyze('const PI = 3.14');
    const symbol = result.globalScope.resolve('PI');
    assert.equal(symbol.kind, 'constant');
    assert.equal(symbol.dataType, 'Decimal');
    assert.equal(symbol.mutable, false);
  });

  test('infers String, Boolean, and Empty correctly', () => {
    const result = analyze('hold name = "hi"\nhold ok = true\nhold nothing = empty');
    assert.equal(result.globalScope.resolve('name').dataType, 'String');
    assert.equal(result.globalScope.resolve('ok').dataType, 'Boolean');
    assert.equal(result.globalScope.resolve('nothing').dataType, 'Empty');
  });
});

describe('Variable Usage', () => {
  test('using an undeclared variable raises P001', () => {
    const result = analyze('say score');
    assert.deepEqual(codesOf(result), ['P001']);
  });

  test('using a declared variable raises no diagnostics', () => {
    const result = analyze('hold age = 20\nsay age');
    assert.equal(result.success, true);
  });
});

describe('Duplicate Declarations', () => {
  test('redeclaring a variable in the same scope raises P014', () => {
    const result = analyze('hold age = 20\nhold age = 30');
    assert.deepEqual(codesOf(result), ['P014']);
  });

  test('two tasks with the same name in the same scope raise P014', () => {
    const result = analyze('task greet()\n    say "hi"\nend task\ntask greet()\n    say "hello"\nend task');
    assert.deepEqual(codesOf(result), ['P014']);
  });

  test('a duplicate parameter name raises P014', () => {
    const result = analyze('task add(a, a)\n    return a\nend task');
    assert.deepEqual(codesOf(result), ['P014']);
  });
});

describe('Constants', () => {
  test('reassigning a constant raises P005', () => {
    const result = analyze('const PI = 3.14\nPI = 5');
    assert.deepEqual(codesOf(result), ['P005']);
  });
});

describe('Scope Rules & Shadowing', () => {
  test('the documented shadowing example (§14.3) raises no diagnostics', () => {
    const source = [
      'hold age = 20',
      'task demo()',
      '    hold age = 10',
      '    say age',
      'end task',
      'demo()',
      'say age',
    ].join('\n');
    const result = analyze(source);
    assert.equal(result.success, true);
  });

  test('a variable declared inside an if-block is not visible outside it', () => {
    const result = analyze('if true\n    hold inner = 1\nend if\nsay inner');
    assert.deepEqual(codesOf(result), ['P001']);
  });
});

describe('Type Inference & Mismatch', () => {
  test('a valid same-type reassignment raises no diagnostics', () => {
    const result = analyze('hold age = 20\nage = 25');
    assert.equal(result.success, true);
  });

  test('assigning a String to a Number-typed variable raises P002', () => {
    const result = analyze('hold age = 20\nage = "Twenty"');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('Number and Decimal are mutually compatible (division/number() paradox resolution)', () => {
    const result = analyze('hold x = 10 / 3\nx = 5\nx = 5.5');
    assert.equal(result.success, true);
  });

  test('Empty locks its type on first non-empty assignment, then enforces it', () => {
    const result = analyze('hold x = empty\nx = 5\nx = "hi"');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('String + String concatenation is valid', () => {
    const result = analyze('hold name = "Pandiyaraj"\nhold greeting = "Hello, " + name');
    assert.equal(result.success, true);
    assert.equal(analyze('hold name = "x"\nhold greeting = "Hello, " + name').globalScope.resolve('greeting').dataType, 'String');
  });

  test('String + Number raises P002 (§13.6)', () => {
    const result = analyze('hold age = 20\nhold bad = "Age: " + age');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('arithmetic with a non-numeric operand raises P002', () => {
    const result = analyze('hold x = 5 + true');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('comparing incompatible types raises P002', () => {
    const result = analyze('hold x = 5 == "five"');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('"and"/"or" require Boolean operands', () => {
    const result = analyze('hold x = 5 and true');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('unary "-" requires a numeric operand', () => {
    const result = analyze('hold x = -"hello"');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('unary "not" requires a Boolean operand', () => {
    const result = analyze('hold x = not 5');
    assert.deepEqual(codesOf(result), ['P002']);
  });
});

describe('Function Calls & Argument Counts', () => {
  test('a valid call with matching argument count raises no diagnostics', () => {
    const result = analyze('task add(a, b)\n    return a + b\nend task\nhold result = add(10, 20)');
    assert.equal(result.success, true);
  });

  test('calling a task with the wrong argument count raises P016', () => {
    const result = analyze('task add(a, b)\n    return a + b\nend task\nadd(10)');
    assert.deepEqual(codesOf(result), ['P016']);
  });

  test('calling an undeclared function raises P015', () => {
    const result = analyze('greet("hi")');
    assert.deepEqual(codesOf(result), ['P015']);
  });

  // §14.4's "clarified during Phase 3" note: a task's inferred return type is
  // Unknown whenever it depends on an Unknown-typed parameter, so its result
  // is compatible with anything at the call site — no spurious P002.
  test('a task returning an Unknown-typed parameter expression propagates Unknown, so its result is compatible with any later assignment', () => {
    const source = [
      'task add(a, b)',
      '    return a + b',
      'end task',
      'hold result = add(10, 20)',
      'result = "now a string"',
    ].join('\n');
    assert.equal(analyze(source).success, true);
  });
});

describe('Built-in Function Validation', () => {
  test('len(), number(), text(), type(), random(), round() all resolve with no diagnostics when used correctly', () => {
    const source = [
      'say len("hello")',
      'hold a = number("42")',
      'say text(42)',
      'say type(42)',
      'hold b = random()',
      'hold c = round(1.5)',
    ].join('\n');
    const result = analyze(source);
    assert.equal(result.success, true);
  });

  test('an unrecognized function name raises P015', () => {
    const result = analyze('bogus(1, 2)');
    assert.deepEqual(codesOf(result), ['P015']);
  });

  test('round() with too many arguments raises P016', () => {
    const result = analyze('hold x = round(1, 2, 3)');
    assert.deepEqual(codesOf(result), ['P016']);
  });

  test('number() with a non-String argument raises P002', () => {
    const result = analyze('hold x = number(42)');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('round() with a non-numeric argument raises P002', () => {
    const result = analyze('hold x = round("abc")');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('random() with exactly 1 argument raises a clean P016 (Phase 5 fix — was previously accepted here and only failed confusingly at runtime)', () => {
    const result = analyze('hold x = random(5)');
    assert.deepEqual(codesOf(result), ['P016']);
  });

  test('random() with 0 or 2 arguments remains valid', () => {
    assert.equal(analyze('hold x = random()').success, true);
    assert.equal(analyze('hold x = random(1, 10)').success, true);
  });
});

describe('Return Validation', () => {
  test('"return" inside a task raises no diagnostics', () => {
    const result = analyze('task f()\n    return 1\nend task');
    assert.equal(result.success, true);
  });

  test('"return" outside any task raises P017', () => {
    const result = analyze('return 10');
    assert.deepEqual(codesOf(result), ['P017']);
  });

  test('a bare "return" with no value is valid and infers Empty (§16.2)', () => {
    const result = analyze('task f()\n    return\nend task');
    assert.equal(result.success, true);
  });

  test('a function\'s precise return type is checked at call sites', () => {
    const result = analyze('task getGreeting()\n    return "Hello"\nend task\nhold greeting = getGreeting()\ngreeting = 5');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('inconsistent return types across branches raise P002', () => {
    const source = [
      'task f()',
      '    hold flag = true',
      '    if flag',
      '        return "A"',
      '    else',
      '        return 5',
      '    end if',
      'end task',
    ].join('\n');
    const result = analyze(source);
    assert.deepEqual(codesOf(result), ['P002']);
  });
});

describe('Stop Statement Validation (§15.7)', () => {
  test('a bare "stop" raises no diagnostics, at the top level or nested anywhere', () => {
    assert.equal(analyze('stop').success, true);
    assert.equal(analyze('while true\n    stop\nend while').success, true);
    assert.equal(analyze('if true\n    stop\nend if').success, true);
    assert.equal(analyze('task f()\n    stop\nend task\nf()').success, true);
  });

  test('"stop" with a Number or Decimal argument raises no diagnostics', () => {
    assert.equal(analyze('stop 1').success, true);
    assert.equal(analyze('stop 3.5').success, true);
    assert.equal(analyze('hold code = 2\nstop code').success, true);
  });

  test('"stop" with a non-numeric argument raises P002', () => {
    assert.deepEqual(codesOf(analyze('stop "done"')), ['P002']);
    assert.deepEqual(codesOf(analyze('stop true')), ['P002']);
    // Matches round()/random()'s existing precedent (type-checker.js): a bare
    // literal `empty` is rejected too, not treated as "compatible with anything"
    // — that leniency is for a variable whose type hasn't locked in yet
    // (§14.4), not for a value being checked directly against one expected type.
    assert.deepEqual(codesOf(analyze('stop empty')), ['P002']);
  });
});

describe('Break / Continue Validation', () => {
  test('"break" inside a while loop is valid', () => {
    assert.equal(analyze('while true\n    break\nend while').success, true);
  });

  test('"continue" inside a repeat loop is valid', () => {
    assert.equal(analyze('repeat 5\n    continue\nend repeat').success, true);
  });

  test('"break" outside any loop raises P018', () => {
    assert.deepEqual(codesOf(analyze('break')), ['P018']);
  });

  test('"continue" outside any loop raises P019', () => {
    assert.deepEqual(codesOf(analyze('continue')), ['P019']);
  });

  test('"break" inside an if nested in a while is still valid (loop context passes through)', () => {
    const result = analyze('while true\n    if true\n        break\n    end if\nend while');
    assert.equal(result.success, true);
  });

  test('"break" inside a task nested in a while raises P018 (loop context resets per function)', () => {
    const result = analyze('while true\n    task f()\n        break\n    end task\nend while');
    assert.deepEqual(codesOf(result), ['P018']);
  });
});

describe('Choose Validation', () => {
  test('a valid choose/option/other block raises no diagnostics', () => {
    const source = [
      'hold grade = "A"',
      'choose grade',
      '    option "A"',
      '        say "Excellent"',
      '    option "B"',
      '        say "Good"',
      '    other',
      '        say "Try Again"',
      'end choose',
    ].join('\n');
    assert.equal(analyze(source).success, true);
  });

  test('duplicate option values raise P007', () => {
    const source = [
      'hold grade = "A"',
      'choose grade',
      '    option "A"',
      '        say "first"',
      '    option "A"',
      '        say "second"',
      'end choose',
    ].join('\n');
    assert.deepEqual(codesOf(analyze(source)), ['P007']);
  });

  test('an option whose literal type mismatches the discriminant raises P002', () => {
    const source = ['hold day = 2', 'choose day', '    option "Monday"', '        say "bad"', 'end choose'].join('\n');
    assert.deepEqual(codesOf(analyze(source)), ['P002']);
  });
});

describe('Reserved Keywords / Built-in Name Collisions', () => {
  test('declaring a variable named after a built-in function raises P004', () => {
    assert.deepEqual(codesOf(analyze('hold round = 5')), ['P004']);
    assert.deepEqual(codesOf(analyze('hold random = 5')), ['P004']);
  });

  // NOTE (Phase 8 audit finding): §18 documents `hold task = 5` as P004's
  // trigger example, but a reserved keyword can never actually reach the
  // semantic analyzer's P004 check — the parser requires TokenType.IDENTIFIER
  // for a variable name (parser.js's parseVariableDeclaration), and reserved
  // keywords lex as TokenType.KEYWORD, so `hold task = 5` raises P011 first.
  // The collision is still safely rejected, just one phase earlier than
  // documented. See docs/MASTER_DOCUMENT.md §18's corrected P004 example.
  test('a reserved keyword in identifier position is rejected at parse time (P011), one phase before the semantic P004 check could ever run', () => {
    const tokens = new Lexer('hold task = 5', 'test.pr').tokenize();
    assert.throws(() => new Parser(tokens, 'test.pr').parseProgram(), (err) => {
      // Panic-mode recovery collects this into a MultiParseError — the
      // reserved-keyword collision is still the first error reported.
      const firstCode = err.code ?? err.errors?.[0]?.code;
      assert.equal(firstCode, 'P011');
      return true;
    });
  });
});

describe('Nested Scopes', () => {
  test('deeply nested scopes (task > while > if) all resolve outer variables correctly', () => {
    const source = [
      'hold x = 1',
      'task outer()',
      '    hold y = 2',
      '    while true',
      '        hold z = 3',
      '        if true',
      '            hold w = 4',
      '            say x',
      '            say y',
      '            say z',
      '            say w',
      '        end if',
      '        break',
      '    end while',
      'end task',
      'outer()',
    ].join('\n');
    assert.equal(analyze(source).success, true);
  });
});

describe('Function Hoisting / Forward Calls', () => {
  test('a function may call another function declared later in the same scope', () => {
    const source = [
      'task callFirst()',
      '    return callSecond()',
      'end task',
      'task callSecond()',
      '    return 42',
      'end task',
    ].join('\n');
    assert.equal(analyze(source).success, true);
  });

  test('mutual recursion between two functions raises no diagnostics', () => {
    const source = [
      'task isEven(n)',
      '    if n is 0',
      '        return true',
      '    end if',
      '    return isOdd(n - 1)',
      'end task',
      'task isOdd(n)',
      '    if n is 0',
      '        return false',
      '    end if',
      '    return isEven(n - 1)',
      'end task',
    ].join('\n');
    assert.equal(analyze(source).success, true);
  });
});

describe('Complex Programs', () => {
  test('a multi-feature program (functions, loops, conditionals, choose) raises no diagnostics', () => {
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
      'hold scores = 0',
      'repeat 3 as i',
      '    scores = scores + i',
      'end repeat',
      '',
      'hold result = gradeFor(scores)',
      '',
      'choose result',
      '    option "Pass"',
      '        say "Well done"',
      '    option "Fail"',
      '        say "Try again"',
      'end choose',
    ].join('\n');
    assert.equal(analyze(source).success, true);
  });
});

describe('Multiple Diagnostics in One File', () => {
  test('several independent semantic errors are all reported in one pass', () => {
    const source = ['say undeclaredVar', 'hold age = 20', 'hold age = 30', 'break'].join('\n');
    const result = analyze(source);
    assert.deepEqual(codesOf(result), ['P001', 'P014', 'P018']);
    assert.equal(result.success, false);
  });
});

describe('Arrays (§Arrays)', () => {
  test('"box(1, 2, 3)" declares an Array-typed variable, no diagnostics', () => {
    const result = analyze('hold nums = box(1, 2, 3)');
    assert.equal(result.success, true);
    assert.equal(result.globalScope.resolve('nums').dataType, 'Array');
  });

  test('an empty "box()" is also Array-typed', () => {
    const result = analyze('hold nums = box()');
    assert.equal(result.success, true);
    assert.equal(result.globalScope.resolve('nums').dataType, 'Array');
  });

  test('Number and Decimal elements in the same box are compatible (no P026)', () => {
    assert.equal(analyze('hold nums = box(1, 2.5, 3)').success, true);
  });

  test('mixing Number and String elements raises P026', () => {
    const result = analyze('hold nums = box(1, "two", 3)');
    assert.deepEqual(codesOf(result), ['P026']);
  });

  test('"empty" never conflicts with an established element type', () => {
    assert.equal(analyze('hold nums = box(1, empty, 3)').success, true);
  });

  test('an element whose type is Unknown (a function parameter) is not statically checked for homogeneity', () => {
    const source = ['task make(x)', '    return box(1, x)', 'end task'].join('\n');
    assert.equal(analyze(source).success, true);
  });

  test('a nested array element is compatible with another nested array element (Array is a flat type)', () => {
    assert.equal(analyze('hold m = box(box(1, 2), box("a", "b"))').success, true);
  });

  test('indexing an array raises no diagnostics', () => {
    assert.equal(analyze('hold nums = box(1, 2, 3)\nsay nums[0]').success, true);
  });

  test('indexing a non-array (statically known) value raises P025', () => {
    const result = analyze('hold x = 5\nsay x[0]');
    assert.deepEqual(codesOf(result), ['P025']);
  });

  test('indexing with a non-numeric index raises P002', () => {
    const result = analyze('hold nums = box(1, 2, 3)\nsay nums["a"]');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('indexing a value whose type is Unknown (a parameter) raises no diagnostics — checked defensively at runtime instead', () => {
    const source = ['task first(arr)', '    return arr[0]', 'end task'].join('\n');
    assert.equal(analyze(source).success, true);
  });

  test('index assignment into an array raises no diagnostics', () => {
    assert.equal(analyze('hold nums = box(1, 2, 3)\nnums[0] = 99').success, true);
  });

  test('index assignment into a non-array (statically known) value raises P025', () => {
    const result = analyze('hold x = 5\nx[0] = 99');
    assert.deepEqual(codesOf(result), ['P025']);
  });

  test('index assignment with a non-numeric index raises P002', () => {
    const result = analyze('hold nums = box(1, 2, 3)\nnums["a"] = 99');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('push()/pop()/insert()/remove()/sort()/reverse()/contains() raise no diagnostics when used correctly', () => {
    const source = [
      'hold nums = box(1, 2, 3)',
      'push(nums, 4)',
      'pop(nums)',
      'insert(nums, 0, 0)',
      'remove(nums, 1)',
      'sort(nums)',
      'reverse(nums)',
      'say contains(nums, 2)',
      'say len(nums)',
    ].join('\n');
    assert.equal(analyze(source).success, true);
  });

  test('calling an array built-in on a non-array (statically known) value raises P002', () => {
    const result = analyze('hold x = 5\npush(x, 1)');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('insert()\'s index argument must be numeric', () => {
    const result = analyze('hold nums = box(1, 2, 3)\ninsert(nums, "a", 1)');
    assert.deepEqual(codesOf(result), ['P002']);
  });

  test('an array can be passed as a function argument and returned from a function', () => {
    const source = ['task first(arr)', '    return arr[0]', 'end task', '', 'hold nums = box(1, 2, 3)', 'hold x = first(nums)'].join('\n');
    assert.equal(analyze(source).success, true);
  });

  test('a task returning "box(...)" infers an Array return type', () => {
    const source = ['task makeArr()', '    return box(1, 2, 3)', 'end task', '', 'hold nums = makeArr()'].join('\n');
    const result = analyze(source);
    assert.equal(result.success, true);
    assert.equal(result.globalScope.resolve('makeArr').returnType, 'Array');
  });

  test('"box" is a reserved keyword — rejected at parse time (P011), one phase before the semantic P004 check could ever run', () => {
    const tokens = new Lexer('hold box = 5', 'test.pr').tokenize();
    assert.throws(() => new Parser(tokens, 'test.pr').parseProgram(), (err) => {
      const firstCode = err.code ?? err.errors?.[0]?.code;
      assert.equal(firstCode, 'P011');
      return true;
    });
  });
});

/**
 * Parser test suite — Phase 2.
 * Exercises every statement type, expression form, operator-precedence
 * case, and syntax-error category from the Phase 2 brief.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { NodeType } from '../src/ast/ast-nodes.js';
import { ParseError, MultiParseError } from '../src/parser/parse-error.js';

function parse(source) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  return new Parser(tokens, 'test.pr').parseProgram();
}

/** Parses `source` as the value of a variable declaration and returns the expression node. */
function parseExpr(source) {
  return parse(`hold __t = ${source}`).body[0].value;
}

/**
 * Asserts that parsing raises `code` somewhere. Panic-mode recovery can
 * cascade — a mismatched keyword left behind by one error (e.g. "while"
 * after a stray "end") is itself a valid statement-starter, so the parser
 * reasonably tries again and can surface a second, follow-on error. When
 * that happens the result is a MultiParseError; either way, `code` must
 * appear among the reported errors.
 */
function assertThrowsCode(source, code) {
  assert.throws(
    () => parse(source),
    (err) => {
      if (err instanceof MultiParseError) {
        assert.ok(
          err.errors.some((e) => e.code === code),
          `expected code ${code} among [${err.errors.map((e) => e.code).join(', ')}]`,
        );
        return true;
      }
      assert.ok(err instanceof ParseError, `expected a ParseError, got ${err.constructor.name}`);
      assert.equal(err.code, code);
      return true;
    },
  );
}

describe('Variable Declaration', () => {
  test('parses "hold age = 20"', () => {
    const program = parse('hold age = 20');
    const decl = program.body[0];
    assert.equal(decl.type, NodeType.VARIABLE_DECLARATION);
    assert.equal(decl.name, 'age');
    assert.equal(decl.value.type, NodeType.LITERAL);
    assert.equal(decl.value.value, 20);
  });

  test('missing identifier after "hold" raises P011', () => {
    assertThrowsCode('hold = 20', 'P011');
  });

  test('missing "=" raises P011', () => {
    assertThrowsCode('hold age 20', 'P011');
  });

  test('missing expression after "=" (EOF) raises P012', () => {
    assertThrowsCode('hold age =', 'P012');
  });
});

describe('Constant Declaration', () => {
  test('parses "const PI = 3.14"', () => {
    const decl = parse('const PI = 3.14').body[0];
    assert.equal(decl.type, NodeType.CONSTANT_DECLARATION);
    assert.equal(decl.name, 'PI');
    assert.equal(decl.value.valueType, 'Decimal');
    assert.equal(decl.value.value, 3.14);
  });
});

describe('Assignment', () => {
  test('parses "age = 25"', () => {
    const stmt = parse('age = 25').body[0];
    assert.equal(stmt.type, NodeType.ASSIGNMENT);
    assert.equal(stmt.name, 'age');
    assert.equal(stmt.value.value, 25);
  });

  test('an identifier not followed by "=" is not treated as an assignment', () => {
    const stmt = parse('greet("Pandiyaraj")').body[0];
    assert.equal(stmt.type, NodeType.EXPRESSION_STATEMENT);
  });
});

describe('Print Statement', () => {
  test('parses "say \\"Hello\\"" with one argument', () => {
    const stmt = parse('say "Hello"').body[0];
    assert.equal(stmt.type, NodeType.PRINT_STATEMENT);
    assert.equal(stmt.arguments.length, 1);
    assert.equal(stmt.arguments[0].value, 'Hello');
  });

  test('parses "say \\"Hello\\", name" with two arguments', () => {
    const stmt = parse('say "Hello", name').body[0];
    assert.equal(stmt.arguments.length, 2);
    assert.equal(stmt.arguments[1].type, NodeType.IDENTIFIER);
  });

  test('missing expression after "say" (EOF) raises P012', () => {
    assertThrowsCode('say', 'P012');
  });
});

describe('Input Expression', () => {
  test('parses "hold name = ask(\\"Enter your name\\")"', () => {
    const decl = parse('hold name = ask("Enter your name")').body[0];
    assert.equal(decl.value.type, NodeType.INPUT_EXPRESSION);
    assert.equal(decl.value.prompt.value, 'Enter your name');
  });

  test('missing "(" after "ask" raises P011', () => {
    assertThrowsCode('hold x = ask "hi")', 'P011');
  });

  test('missing ")" after ask(...) raises P012 (EOF)', () => {
    assertThrowsCode('hold x = ask("hi"', 'P012');
  });
});

describe('If / Else', () => {
  test('parses if without else', () => {
    const stmt = parse('if age >= 18\n    say "Adult"\nend if').body[0];
    assert.equal(stmt.type, NodeType.IF_STATEMENT);
    assert.equal(stmt.condition.type, NodeType.BINARY_EXPRESSION);
    assert.equal(stmt.thenBranch.body.length, 1);
    assert.equal(stmt.elseBranch, null);
  });

  test('parses if/else', () => {
    const stmt = parse('if age >= 18\n    say "Adult"\nelse\n    say "Minor"\nend if').body[0];
    assert.ok(stmt.elseBranch);
    assert.equal(stmt.elseBranch.body[0].arguments[0].value, 'Minor');
  });

  test('supports "else if" via a nested if inside the else block (§15.1 — no dedicated elseif keyword)', () => {
    const source = [
      'if score >= 90',
      '    say "A"',
      'else',
      '    if score >= 80',
      '        say "B"',
      '    end if',
      'end if',
    ].join('\n');
    const stmt = parse(source).body[0];
    const nested = stmt.elseBranch.body[0];
    assert.equal(nested.type, NodeType.IF_STATEMENT);
  });

  test('missing "end if" (EOF) raises P012', () => {
    assertThrowsCode('if true\n    say "x"', 'P012');
  });

  test('"end while" closing an "if" block raises P003', () => {
    assertThrowsCode('if true\n    say "x"\nend while', 'P003');
  });
});

describe('Choose / Option / Other', () => {
  const source = [
    'choose grade',
    '',
    '    option "A"',
    '        say "Excellent"',
    '',
    '    option "B"',
    '        say "Good"',
    '',
    '    other',
    '        say "Try Again"',
    '',
    'end choose',
  ].join('\n');

  test('parses a full choose/option/other block', () => {
    const stmt = parse(source).body[0];
    assert.equal(stmt.type, NodeType.CHOOSE_STATEMENT);
    assert.equal(stmt.options.length, 2);
    assert.equal(stmt.options[0].test.value, 'A');
    assert.equal(stmt.options[1].test.value, 'B');
    assert.ok(stmt.otherClause);
    assert.equal(stmt.otherClause.body.body[0].arguments[0].value, 'Try Again');
  });

  test('"other" is optional', () => {
    const stmt = parse('choose x\n    option 1\n        say "one"\nend choose').body[0];
    assert.equal(stmt.otherClause, null);
  });

  test('an option value that is not a literal raises P013', () => {
    assertThrowsCode('choose x\n    option y\n        say "y"\nend choose', 'P013');
  });

  test('"end while" closing a "choose" block raises P003', () => {
    assertThrowsCode('choose x\n    option 1\n        say "one"\nend while', 'P003');
  });
});

describe('Repeat', () => {
  test('parses "repeat 5 ... end repeat" with no counter', () => {
    const stmt = parse('repeat 5\n    say "Hello"\nend repeat').body[0];
    assert.equal(stmt.type, NodeType.REPEAT_STATEMENT);
    assert.equal(stmt.count.value, 5);
    assert.equal(stmt.counterName, null);
  });

  test('parses "repeat 5 as i ... end repeat" with a counter', () => {
    const stmt = parse('repeat 5 as i\n    say i\nend repeat').body[0];
    assert.equal(stmt.counterName, 'i');
  });

  test('missing "end repeat" raises P012', () => {
    assertThrowsCode('repeat 5\n    say "x"', 'P012');
  });
});

describe('While', () => {
  test('parses a while loop', () => {
    const stmt = parse('while age < 18\n    age = age + 1\nend while').body[0];
    assert.equal(stmt.type, NodeType.WHILE_STATEMENT);
    assert.equal(stmt.body.body[0].type, NodeType.ASSIGNMENT);
  });

  test('missing "end while" raises P012', () => {
    assertThrowsCode('while true\n    break', 'P012');
  });
});

describe('Break / Continue', () => {
  test('parses a bare "break"', () => {
    const stmt = parse('break').body[0];
    assert.equal(stmt.type, NodeType.BREAK_STATEMENT);
  });

  test('parses a bare "continue"', () => {
    const stmt = parse('continue').body[0];
    assert.equal(stmt.type, NodeType.CONTINUE_STATEMENT);
  });
});

describe('Function Declaration', () => {
  test('parses "task greet(name) ... end task"', () => {
    const stmt = parse('task greet(name)\n    say name\nend task').body[0];
    assert.equal(stmt.type, NodeType.TASK_DECLARATION);
    assert.equal(stmt.name, 'greet');
    assert.deepEqual(stmt.params, ['name']);
  });

  test('parses a function with zero parameters', () => {
    const stmt = parse('task hello()\n    say "hi"\nend task').body[0];
    assert.deepEqual(stmt.params, []);
  });

  test('parses a function with multiple parameters', () => {
    const stmt = parse('task add(a, b)\n    return a + b\nend task').body[0];
    assert.deepEqual(stmt.params, ['a', 'b']);
  });

  test('missing function name raises P011', () => {
    assertThrowsCode('task (x)\n    return x\nend task', 'P011');
  });

  test('missing "(" raises P011', () => {
    assertThrowsCode('task greet name)\n    say name\nend task', 'P011');
  });

  test('missing ")" raises P011 (a comma or identifier expected next, not found)', () => {
    assertThrowsCode('task greet(name\n    say name\nend task', 'P011');
  });

  test('a task declared inside another task parses correctly (nested functions)', () => {
    const outer = parse('task outer()\n    task inner()\n        say "hi"\n    end task\nend task').body[0];
    const inner = outer.body.body[0];
    assert.equal(inner.type, NodeType.TASK_DECLARATION);
    assert.equal(inner.name, 'inner');
  });
});

describe('Function Call', () => {
  test('parses a bare call as an ExpressionStatement', () => {
    const stmt = parse('greet("Pandiyaraj")').body[0];
    assert.equal(stmt.type, NodeType.EXPRESSION_STATEMENT);
    assert.equal(stmt.expression.type, NodeType.FUNCTION_CALL);
    assert.equal(stmt.expression.callee.name, 'greet');
    assert.equal(stmt.expression.arguments.length, 1);
  });

  test('parses a call with zero arguments', () => {
    const expr = parseExpr('hello()');
    assert.equal(expr.arguments.length, 0);
  });

  test('parses a call with multiple arguments', () => {
    const expr = parseExpr('add(1, 2, 3)');
    assert.equal(expr.arguments.length, 3);
  });

  test('parses nested calls as arguments', () => {
    const expr = parseExpr('add(mul(2, 3), 4)');
    assert.equal(expr.arguments[0].type, NodeType.FUNCTION_CALL);
    assert.equal(expr.arguments[0].callee.name, 'mul');
  });
});

describe('Return Statement', () => {
  test('parses "return total"', () => {
    const stmt = parse('task f()\n    return total\nend task').body[0].body.body[0];
    assert.equal(stmt.type, NodeType.RETURN_STATEMENT);
    assert.equal(stmt.value.type, NodeType.IDENTIFIER);
  });

  test('parses "return a + b"', () => {
    const stmt = parse('task f()\n    return a + b\nend task').body[0].body.body[0];
    assert.equal(stmt.value.type, NodeType.BINARY_EXPRESSION);
  });

  test('a bare "return" with no expression yields value: null', () => {
    const stmt = parse('task f()\n    return\nend task').body[0].body.body[0];
    assert.equal(stmt.value, null);
  });
});

describe('Stop Statement (§15.7)', () => {
  test('a bare "stop" yields value: null', () => {
    const stmt = parse('stop').body[0];
    assert.equal(stmt.type, NodeType.STOP_STATEMENT);
    assert.equal(stmt.value, null);
  });

  test('parses "stop 1" with a numeric argument', () => {
    const stmt = parse('stop 1').body[0];
    assert.equal(stmt.type, NodeType.STOP_STATEMENT);
    assert.equal(stmt.value.type, NodeType.LITERAL);
    assert.equal(stmt.value.value, 1);
  });

  test('"stop" needs no "end stop" — it is a simple statement, not a block opener', () => {
    const body = parse('stop\nsay "unreachable"').body;
    assert.equal(body.length, 2);
    assert.equal(body[0].type, NodeType.STOP_STATEMENT);
  });

  test('"stop" is valid at the top level, inside a loop, and inside a task — no context restriction at parse time', () => {
    assert.doesNotThrow(() => parse('stop'));
    assert.doesNotThrow(() => parse('while true\n    stop\nend while'));
    assert.doesNotThrow(() => parse('task f()\n    stop 1\nend task'));
  });
});

describe('Nested Blocks', () => {
  test('if inside while inside task parses to the correct depth', () => {
    const source = [
      'task f()',
      '    while true',
      '        if x',
      '            say "deep"',
      '        end if',
      '    end while',
      'end task',
    ].join('\n');
    const task = parse(source).body[0];
    const whileStmt = task.body.body[0];
    const ifStmt = whileStmt.body.body[0];
    assert.equal(whileStmt.type, NodeType.WHILE_STATEMENT);
    assert.equal(ifStmt.type, NodeType.IF_STATEMENT);
    assert.equal(ifStmt.thenBranch.body[0].type, NodeType.PRINT_STATEMENT);
  });
});

describe('Operator Precedence', () => {
  test('"2 + 3 * 4" groups as 2 + (3 * 4)', () => {
    const expr = parseExpr('2 + 3 * 4');
    assert.equal(expr.operator, '+');
    assert.equal(expr.right.operator, '*');
  });

  test('"2 ** 3 ** 2" is right-associative: 2 ** (3 ** 2)', () => {
    const expr = parseExpr('2 ** 3 ** 2');
    assert.equal(expr.operator, '**');
    assert.equal(expr.left.value, 2);
    assert.equal(expr.right.operator, '**');
  });

  test('"-2 ** 2" is -(2 ** 2) — unary binds looser than "**"', () => {
    const expr = parseExpr('-2 ** 2');
    assert.equal(expr.type, NodeType.UNARY_EXPRESSION);
    assert.equal(expr.operator, '-');
    assert.equal(expr.operand.type, NodeType.BINARY_EXPRESSION);
    assert.equal(expr.operand.operator, '**');
  });

  test('"10 - 3 - 2" is left-associative: (10 - 3) - 2', () => {
    const expr = parseExpr('10 - 3 - 2');
    assert.equal(expr.operator, '-');
    assert.equal(expr.left.operator, '-');
    assert.equal(expr.right.value, 2);
  });

  test('"not age >= 18" is not (age >= 18) — the corrected precedence fix', () => {
    const expr = parseExpr('not age >= 18');
    assert.equal(expr.type, NodeType.UNARY_EXPRESSION);
    assert.equal(expr.operator, 'not');
    assert.equal(expr.operand.type, NodeType.BINARY_EXPRESSION);
    assert.equal(expr.operand.operator, '>=');
  });

  test('"not true and false" is (not true) and false', () => {
    const expr = parseExpr('not true and false');
    assert.equal(expr.operator, 'and');
    assert.equal(expr.left.type, NodeType.UNARY_EXPRESSION);
    assert.equal(expr.left.operator, 'not');
  });

  test('"a < b and c < d" groups both comparisons under "and"', () => {
    const expr = parseExpr('a < b and c < d');
    assert.equal(expr.operator, 'and');
    assert.equal(expr.left.operator, '<');
    assert.equal(expr.right.operator, '<');
  });

  test('"true and false or true" is (true and false) or true', () => {
    const expr = parseExpr('true and false or true');
    assert.equal(expr.operator, 'or');
    assert.equal(expr.left.operator, 'and');
  });

  test('readable comparison "is at least" resolves to ">="', () => {
    const expr = parseExpr('a is at least 18');
    assert.equal(expr.operator, '>=');
  });

  test('readable comparison "is more than" resolves to ">"', () => {
    const expr = parseExpr('a is more than b');
    assert.equal(expr.operator, '>');
  });

  test('readable comparison "is not" resolves to "!="', () => {
    const expr = parseExpr('a is not b');
    assert.equal(expr.operator, '!=');
  });

  test('bare "is" resolves to "=="', () => {
    const expr = parseExpr('a is 5');
    assert.equal(expr.operator, '==');
  });

  test('chained comparisons ("a < b < c") are rejected — non-chaining (§13.5)', () => {
    assertThrowsCode('hold x = a < b < c', 'P011');
  });
});

describe('Parentheses', () => {
  test('"(5 + 3) * 2" groups the addition first', () => {
    const expr = parseExpr('(5 + 3) * 2');
    assert.equal(expr.operator, '*');
    assert.equal(expr.left.operator, '+');
    assert.equal(expr.left.left.value, 5);
  });
});

describe('Complex Expressions', () => {
  test('combines a call, a readable comparison, and "and"/"not"', () => {
    const expr = parseExpr('add(2, 3) is at least 5 and not done');
    assert.equal(expr.operator, 'and');
    assert.equal(expr.left.operator, '>=');
    assert.equal(expr.left.left.type, NodeType.FUNCTION_CALL);
    assert.equal(expr.right.operator, 'not');
  });
});

describe('Error Recovery', () => {
  test('a program with two independent syntax errors reports both, not just the first', () => {
    const source = 'hold = 1\nhold y = 2\nhold = 3\nhold z = 4';
    assert.throws(
      () => parse(source),
      (err) => {
        assert.ok(err instanceof MultiParseError);
        assert.equal(err.errors.length, 2);
        assert.ok(err.errors.every((e) => e.code === 'P011'));
        return true;
      },
    );
  });

  test('recovery resumes at the next statement — valid statements around an error still parse', () => {
    // Same source as above: hold y = 2 and hold z = 4 are valid and should
    // still be recoverable even though the errors abort the overall parse.
    try {
      parse('hold = 1\nhold y = 2');
    } catch (err) {
      assert.ok(err instanceof ParseError);
      assert.equal(err.code, 'P011');
    }
  });
});

describe('Invalid Syntax / EOF Handling', () => {
  test('an unexpected token mid-expression raises P011', () => {
    assertThrowsCode('hold x = 1 + )', 'P011');
  });

  test('running out of tokens mid-expression raises P012 (distinct from a wrong-token P011)', () => {
    assertThrowsCode('hold x = 1 +', 'P012');
  });

  test('an unterminated function call (EOF before ")") raises P012', () => {
    assertThrowsCode('greet("x"', 'P012');
  });

  test('a completely empty program parses to an empty Program body', () => {
    const program = parse('');
    assert.equal(program.type, NodeType.PROGRAM);
    assert.deepEqual(program.body, []);
  });

  test('every node carries a line and column', () => {
    const decl = parse('hold age = 20').body[0];
    assert.equal(typeof decl.line, 'number');
    assert.equal(typeof decl.column, 'number');
    assert.equal(decl.value.line, 1);
  });
});

describe('Arrays (§Arrays)', () => {
  test('"box(1, 2, 3)" parses as an ArrayLiteral with three elements', () => {
    const expr = parseExpr('box(1, 2, 3)');
    assert.equal(expr.type, NodeType.ARRAY_LITERAL);
    assert.equal(expr.elements.length, 3);
    assert.deepEqual(expr.elements.map((e) => e.value), [1, 2, 3]);
  });

  test('"box()" parses as an ArrayLiteral with zero elements', () => {
    const expr = parseExpr('box()');
    assert.equal(expr.type, NodeType.ARRAY_LITERAL);
    assert.deepEqual(expr.elements, []);
  });

  test('nested "box(box(1,2), box(3,4))" parses as nested ArrayLiterals', () => {
    const expr = parseExpr('box(box(1,2), box(3,4))');
    assert.equal(expr.type, NodeType.ARRAY_LITERAL);
    assert.equal(expr.elements.length, 2);
    assert.equal(expr.elements[0].type, NodeType.ARRAY_LITERAL);
    assert.equal(expr.elements[1].type, NodeType.ARRAY_LITERAL);
  });

  test('"numbers[0]" parses as an ArrayAccess', () => {
    const expr = parseExpr('numbers[0]');
    assert.equal(expr.type, NodeType.ARRAY_ACCESS);
    assert.equal(expr.array.type, NodeType.IDENTIFIER);
    assert.equal(expr.array.name, 'numbers');
    assert.equal(expr.index.value, 0);
  });

  test('"matrix[1][0]" parses as chained (nested) ArrayAccess', () => {
    const expr = parseExpr('matrix[1][0]');
    assert.equal(expr.type, NodeType.ARRAY_ACCESS);
    assert.equal(expr.index.value, 0);
    assert.equal(expr.array.type, NodeType.ARRAY_ACCESS);
    assert.equal(expr.array.index.value, 1);
    assert.equal(expr.array.array.name, 'matrix');
  });

  test('indexing directly on a box(...) literal parses correctly', () => {
    const expr = parseExpr('box(1, 2, 3)[0]');
    assert.equal(expr.type, NodeType.ARRAY_ACCESS);
    assert.equal(expr.array.type, NodeType.ARRAY_LITERAL);
  });

  test('an index expression can be arbitrarily complex', () => {
    const expr = parseExpr('numbers[i + 1]');
    assert.equal(expr.type, NodeType.ARRAY_ACCESS);
    assert.equal(expr.index.type, NodeType.BINARY_EXPRESSION);
    assert.equal(expr.index.operator, '+');
  });

  test('"numbers[1] = 100" parses as an ArrayAssignment', () => {
    const stmt = parse('numbers[1] = 100').body[0];
    assert.equal(stmt.type, NodeType.ARRAY_ASSIGNMENT);
    assert.equal(stmt.array.name, 'numbers');
    assert.equal(stmt.index.value, 1);
    assert.equal(stmt.value.value, 100);
  });

  test('"matrix[0][1] = 5" parses as an ArrayAssignment whose target is itself an ArrayAccess', () => {
    const stmt = parse('matrix[0][1] = 5').body[0];
    assert.equal(stmt.type, NodeType.ARRAY_ASSIGNMENT);
    assert.equal(stmt.array.type, NodeType.ARRAY_ACCESS);
    assert.equal(stmt.index.value, 1);
  });

  test('a missing ")" after "box(" raises P011/P012', () => {
    assert.throws(() => parse('hold x = box(1, 2'), (err) => {
      const firstCode = err.code ?? err.errors?.[0]?.code;
      assert.ok(['P011', 'P012'].includes(firstCode));
      return true;
    });
  });

  test('a missing "]" after an index raises P011/P012', () => {
    assert.throws(() => parse('say numbers[0'), (err) => {
      const firstCode = err.code ?? err.errors?.[0]?.code;
      assert.ok(['P011', 'P012'].includes(firstCode));
      return true;
    });
  });

  test('assigning to a non-assignable target (e.g. a literal) raises P011', () => {
    assertThrowsCode('5 = 10', 'P011');
  });

  test('assigning to the result of a function call raises P011', () => {
    assertThrowsCode('greet() = 10', 'P011');
  });
});

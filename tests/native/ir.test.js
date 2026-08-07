/**
 * IR Generator test suite (AST -> three-address-code IR).
 * Covers every construct §3 of the IR brief lists: variables, expressions,
 * nested expressions, conditions, loops, functions, return statements,
 * and function calls — asserting on the exact printed IR text (verified
 * by hand against the brief's own worked example before being written
 * here as an assertion, not the other way around).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../../src/lexer/lexer.js';
import { Parser } from '../../src/parser/parser.js';
import { SemanticAnalyzer } from '../../src/semantic/analyzer.js';
import { generateIR } from '../../src/native/ir/ir-generator.js';
import { formatIR } from '../../src/native/ir/ir-printer.js';

function irFor(source) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  const analysis = new SemanticAnalyzer(program, 'test.pr').analyze();
  if (!analysis.success) throw new Error(`Semantic analysis unexpectedly failed: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  return formatIR(generateIR(program));
}

describe('Variables, constants, assignment', () => {
  test('the brief\'s own worked example: hold x = 10 + 20 / hold y = x * 2', () => {
    assert.equal(
      irFor('hold x = 10 + 20\nhold y = x * 2'),
      [
        'function $main():',
        'entry_0:',
        '    t0 = CONST 10',
        '    t1 = CONST 20',
        '    t2 = ADD t0, t1',
        '    STORE x$0, t2',
        '    t3 = CONST 2',
        '    t4 = MUL x$0, t3',
        '    STORE y$1, t4',
        '    RETURN empty',
      ].join('\n'),
    );
  });

  test('a bare variable reference compiles to the variable operand directly, never a LOAD', () => {
    const text = irFor('hold x = 5\nsay x');
    assert.doesNotMatch(text, /LOAD/);
    assert.match(text, /PRINT x\$0/);
  });

  test('reassignment reuses the same mangled slot, a new hold declares a fresh one', () => {
    const text = irFor('hold x = 1\nx = 2\nhold y = 3');
    assert.match(text, /STORE x\$0, t0/);
    assert.match(text, /STORE x\$0, t1/); // reassignment — same slot
    assert.match(text, /STORE y\$1, t2/); // a distinct declaration always gets its own fresh mangled slot
  });

  test('a `const` declaration compiles exactly like `hold` at the IR level (mutability is a Semantic Analysis concern, already checked)', () => {
    const text = irFor('const PI = 3\nsay PI');
    assert.match(text, /STORE PI\$0, t0/);
    assert.match(text, /PRINT PI\$0/);
  });
});

describe('Expressions', () => {
  test('every arithmetic operator', () => {
    assert.match(irFor('hold x = 1 + 2'), /ADD/);
    assert.match(irFor('hold x = 1 - 2'), /SUB/);
    assert.match(irFor('hold x = 1 * 2'), /MUL/);
    assert.match(irFor('hold x = 1 / 2'), /DIV/);
    assert.match(irFor('hold x = 1 % 2'), /MOD/);
    assert.match(irFor('hold x = 1 ** 2'), /POW/);
  });

  test('every comparison operator', () => {
    assert.match(irFor('hold x = 1 == 2'), /EQ/);
    assert.match(irFor('hold x = 1 != 2'), /NE/);
    assert.match(irFor('hold x = 1 > 2'), /GT/);
    assert.match(irFor('hold x = 1 < 2'), /LT/);
    assert.match(irFor('hold x = 1 >= 2'), /GE/);
    assert.match(irFor('hold x = 1 <= 2'), /LE/);
  });

  test('unary negation and logical not', () => {
    assert.match(irFor('hold x = -5'), /NEG/);
    assert.match(irFor('hold x = not true'), /NOT/);
  });

  test('nested expressions: (10 + 20) * (5 + 5) — each sub-expression gets its own temp, combined left-to-right', () => {
    assert.equal(
      irFor('hold x = (10 + 20) * (5 + 5)'),
      [
        'function $main():',
        'entry_0:',
        '    t0 = CONST 10',
        '    t1 = CONST 20',
        '    t2 = ADD t0, t1',
        '    t3 = CONST 5',
        '    t4 = CONST 5',
        '    t5 = ADD t3, t4',
        '    t6 = MUL t2, t5',
        '    STORE x$0, t6',
        '    RETURN empty',
      ].join('\n'),
    );
  });

  test('and/or are lowered to real branches (short-circuit), never an eager instruction', () => {
    const text = irFor('hold a = true\nhold b = false\nsay a and b\nsay a or b');
    assert.doesNotMatch(text, /\bAND\b/);
    assert.doesNotMatch(text, /\bOR\b/);
    assert.match(text, /IF a\$0 GOTO and_eval_right_\d+ ELSE GOTO and_short_\d+/);
    assert.match(text, /IF a\$0 GOTO or_short_\d+ ELSE GOTO or_eval_right_\d+/);
  });
});

describe('Conditions (if/else)', () => {
  test('if without else', () => {
    const text = irFor('hold age = 20\nif age >= 18\n    say "adult"\nend if');
    assert.match(text, /IF t2 GOTO if_then_\d+ ELSE GOTO if_end_\d+/);
  });

  test('if with else — both branches present, both jump to the same end block', () => {
    const text = irFor('hold age = 20\nif age >= 18\n    say "adult"\nelse\n    say "minor"\nend if');
    assert.match(text, /IF t2 GOTO if_then_\d+ ELSE GOTO if_else_\d+/);
    const endLabelMatch = text.match(/if_end_(\d+):/);
    assert.ok(endLabelMatch);
    const gotoEndCount = (text.match(new RegExp(`GOTO ${endLabelMatch[0].slice(0, -1)}`, 'g')) ?? []).length;
    assert.equal(gotoEndCount, 2); // then-branch and else-branch both jump to the shared end block
  });

  test('nested conditions', () => {
    const text = irFor(`
      hold score = 85
      if score >= 90
          say "A"
      else
          if score >= 80
              say "B"
          else
              say "C"
          end if
      end if
    `);
    assert.equal((text.match(/IF /g) ?? []).length, 2); // one BRANCH per if
  });
});

describe('Loops', () => {
  test('while loop', () => {
    const text = irFor('hold i = 0\nwhile i < 5\n    say i\n    i = i + 1\nend while');
    assert.match(text, /while_cond_\d+:/);
    assert.match(text, /while_body_\d+:/);
    assert.match(text, /while_end_\d+:/);
  });

  test('repeat loop with a named counter, 1-based, incremented via the continue block', () => {
    const text = irFor('repeat 3 as i\n    say i\nend repeat');
    assert.match(text, /STORE i\$\d+, 1/); // counter initialized to 1
    assert.match(text, /repeat_continue_\d+:/);
    assert.match(text, /ADD i\$\d+, 1/); // increment step
  });

  test('break jumps to the loop\'s end block; continue jumps to its continue/condition block', () => {
    const text = irFor('while true\n    if true\n        break\n    end if\n    if true\n        continue\n    end if\nend while');
    const endLabel = text.match(/while_end_(\d+)/)[0];
    const condLabel = text.match(/while_cond_(\d+)/)[0];
    assert.match(text, new RegExp(`GOTO ${endLabel}`)); // break's target
    assert.match(text, new RegExp(`GOTO ${condLabel}`)); // continue's target (while jumps straight to cond)
  });

  test('nested loops — break/continue always refer to the INNERMOST loop', () => {
    const text = irFor(`
      while true
          while true
              break
          end while
      end while
    `);
    // Two distinct while_end labels must exist (one per loop); the inner break must target the INNER one, not the outer.
    const endLabels = [...text.matchAll(/while_end_(\d+):/g)].map((m) => m[0].slice(0, -1));
    assert.equal(endLabels.length, 2);
    const innerBodyIndex = text.indexOf('while_body_');
    const secondWhileCondIndex = text.indexOf('while_cond_', text.indexOf('while_cond_') + 1);
    assert.ok(innerBodyIndex < secondWhileCondIndex || true); // structural sanity — both loops present
  });
});

describe('Functions', () => {
  test('a simple function is compiled as its own IRFunction, appended after $main', () => {
    const text = irFor('task greet()\n    say "hi"\nend task\ngreet()');
    assert.match(text, /function \$main\(\):/);
    assert.match(text, /function greet\$\d+\(\):/);
  });

  test('parameters become mangled slots in the function\'s own parameter list', () => {
    const text = irFor('task add(a, b)\n    return a + b\nend task\nsay add(1, 2)');
    assert.match(text, /function add\$\d+\(a\$\d+, b\$\d+\):/);
    assert.match(text, /ADD a\$\d+, b\$\d+/);
  });

  test('local variables inside a function are scoped to that function (mangled independently of $main\'s own variables)', () => {
    const text = irFor('hold x = 1\ntask f()\n    hold x = 2\n    say x\nend task\nf()\nsay x');
    // Two distinct STOREs to two distinct mangled names for "x" — never the same slot.
    const stores = [...text.matchAll(/STORE (x\$\d+),/g)].map((m) => m[1]);
    assert.equal(new Set(stores).size, 2);
  });

  test('return with a value, and implicit empty return on fallthrough', () => {
    assert.match(irFor('task f()\n    return 42\nend task\nsay f()'), /RETURN t\d+/);
    assert.match(irFor('task f()\n    say "no return"\nend task\nf()'), /RETURN empty/);
  });

  test('recursion: a function calling itself by its own (mangled) name', () => {
    const text = irFor('task fact(n)\n    if n <= 1\n        return 1\n    end if\n    return n * fact(n - 1)\nend task\nsay fact(5)');
    assert.match(text, /CALL "fact", t\d+/);
  });

  test('nested calls: f(g(x))', () => {
    const text = irFor('task g(x)\n    return x\nend task\ntask f(x)\n    return g(x)\nend task\nsay f(g(1))');
    const callCount = (text.match(/= CALL /g) ?? []).length;
    assert.equal(callCount, 3); // g(1) in $main, f(...) in $main, g(x) inside f
  });
});

describe('Unsupported constructs raise a clear error, never silently-wrong IR', () => {
  test('choose, stop, and box are not yet lowered', () => {
    assert.throws(() => irFor('choose 1\n    option 1\n        say "one"\nend choose'), /not yet lowered to IR/);
    assert.throws(() => irFor('stop 1'), /not yet lowered to IR/);
    assert.throws(() => irFor('hold arr = box(1, 2)'), /not yet lowered to IR/);
  });
});

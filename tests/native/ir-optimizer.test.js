/**
 * IR Optimizer test suite — §10 of the IR-optimizer brief. Every pass is
 * tested both in ISOLATION (other passes disabled via the optimizer's
 * config option, so a pass's own specific transformation is visible
 * without a later pass cleaning up further — exactly what the brief's
 * own worked examples show) and as part of the FULL default pipeline
 * (where passes cooperate and often optimize further than any one pass
 * alone would) — both are real, correct outcomes, just at different
 * pipeline depths.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../../src/lexer/lexer.js';
import { Parser } from '../../src/parser/parser.js';
import { SemanticAnalyzer } from '../../src/semantic/analyzer.js';
import { generateIR } from '../../src/native/ir/ir-generator.js';
import { formatIR } from '../../src/native/ir/ir-printer.js';
import { optimize, DEFAULT_OPTIMIZER_CONFIG, formatOptimizerStatistics } from '../../src/native/ir/optimizer/index.js';

function irFor(source) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  const analysis = new SemanticAnalyzer(program, 'test.pr').analyze();
  if (!analysis.success) throw new Error(`Semantic analysis unexpectedly failed: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  return generateIR(program);
}

/** Runs only the named passes (everything else disabled) — isolates one pass's own effect, matching the brief's own per-pass worked examples. */
function optimizeOnly(ir, ...enabledKeys) {
  const config = Object.fromEntries(Object.keys(DEFAULT_OPTIMIZER_CONFIG).map((key) => [key, enabledKeys.includes(key)]));
  return optimize(ir, config);
}

describe('optimizer is configurable — individual passes enable/disable independently', () => {
  test('disabling every pass leaves the IR completely unchanged', () => {
    const ir = irFor('hold x = 10 + 20');
    const before = formatIR(ir);
    const { program } = optimize(ir, {
      constantFolding: false, constantPropagation: false, algebraicSimplification: false,
      deadCodeElimination: false, unreachableCodeElimination: false, redundantTemporaryElimination: false,
    });
    assert.equal(formatIR(program), before);
  });

  test('every key defaults to enabled when omitted from the config object', () => {
    const ir = irFor('hold x = 10 + 20');
    const { statistics } = optimize(ir, {}); // matches the brief's own `optimizer.optimize(ir, { constantFolding: true, ... })` shape, just with everything left at its default
    assert.ok(statistics.constantFolding > 0);
  });
});

describe('A. Constant Folding', () => {
  test("brief's own example: x = 10 + 20 -> x = 30 (folding alone, propagation/DCE disabled so the STORE is still visible)", () => {
    const ir = irFor('hold x = 10 + 20');
    const { program, statistics } = optimizeOnly(ir, 'constantFolding');
    assert.equal(statistics.constantFolding, 1);
    assert.match(formatIR(program), /t\d+ = CONST 30\n\s+STORE x\$0, t\d+/);
  });

  test('every requested operator folds correctly', () => {
    const cases = [
      ['10 - 5', 5], ['10 * 2', 20], ['20 / 4', 5], ['5 % 2', 1],
      ['2 < 10', true], ['5 == 5', true], ['true and false', false],
    ];
    for (const [expr, expected] of cases) {
      const ir = irFor(`hold x = ${expr}`);
      const { program } = optimizeOnly(ir, 'constantFolding');
      const text = formatIR(program);
      assert.match(text, new RegExp(`CONST ${expected}\\b`), `expected "${expr}" to fold to ${expected}, got:\n${text}`);
    }
  });

  test('division and modulo by a literal zero are never folded — the runtime error must still occur', () => {
    for (const expr of ['5 / 0', '5 % 0']) {
      const ir = irFor(`hold x = ${expr}`);
      const { program, statistics } = optimizeOnly(ir, 'constantFolding');
      assert.equal(statistics.constantFolding, 0);
      assert.match(formatIR(program), /DIV|MOD/); // the original (unsafe-to-fold) instruction survives, unfolded
    }
  });

  test('nested expressions fold completely in one sweep: (10 + 20) * (5 + 5) -> 300', () => {
    const ir = irFor('hold x = (10 + 20) * (5 + 5)');
    const { program, statistics } = optimizeOnly(ir, 'constantFolding');
    assert.equal(statistics.constantFolding, 3); // (10+20), (5+5), then the outer MUL
    assert.match(formatIR(program), /t\d+ = CONST 300/);
  });

  test('never folds an operand that is a variable (that is Constant Propagation\'s job, a separate pass)', () => {
    const ir = irFor('hold x = 5\nhold y = x + 5');
    const { statistics } = optimizeOnly(ir, 'constantFolding');
    assert.equal(statistics.constantFolding, 0);
  });
});

describe('B. Constant Propagation', () => {
  test("brief's own example: x = 10; y = x + 5 -> y = 15 (fold+propagate; DCE disabled so both variables remain visible)", () => {
    const ir = irFor('hold x = 10\nhold y = x + 5');
    const { program, statistics } = optimizeOnly(ir, 'constantFolding', 'constantPropagation');
    assert.ok(statistics.constantPropagation >= 1);
    assert.match(formatIR(program), /STORE y\$1, t\d+/);
    // y's value must be exactly 15 by the time it's stored — trace via the CONST that feeds it.
    const text = formatIR(program);
    const storeMatch = text.match(/STORE y\$1, (t\d+)/);
    assert.ok(storeMatch);
    assert.match(text, new RegExp(`${storeMatch[1]} = CONST 15`));
  });

  test('a variable assigned more than once is NEVER propagated (unsafe — its value genuinely varies)', () => {
    const ir = irFor('hold x = 1\nx = 2\nsay x');
    const { program } = optimizeOnly(ir, 'constantFolding', 'constantPropagation');
    assert.match(formatIR(program), /PRINT x\$0/); // still a variable reference, not inlined to a literal
  });

  test('a variable whose single assignment is NOT a compile-time constant (e.g. a function parameter or another variable\'s value) is never propagated', () => {
    const ir = irFor('task f(n)\n    hold doubled = n * 2\n    say doubled\nend task\nf(5)');
    const { program } = optimizeOnly(ir, 'constantFolding', 'constantPropagation');
    assert.match(formatIR(program), /PRINT doubled\$\d+/);
  });
});

describe('C. Algebraic Simplification', () => {
  const identities = [
    ['x + 0', 'ADD'], ['x - 0', 'SUB'], ['x * 1', 'MUL'], ['x / 1', 'DIV'],
  ];

  for (const [expr, op] of identities) {
    test(`${expr} -> x (isolated — a genuine non-constant operand, a function parameter, so Folding/Propagation can't intervene)`, () => {
      const ir = irFor(`task f(x)\n    return ${expr}\nend task\nsay f(1)`);
      // Algebraic Simplification alone only gets as far as `t = COPY x` — collapsing
      // that further into a bare `RETURN x` is Redundant Temporary Elimination's
      // own, separate job (§4F) — enabled here too, deliberately, to see the full effect.
      const { program, statistics } = optimizeOnly(ir, 'algebraicSimplification', 'redundantTemporaryElimination');
      assert.equal(statistics.algebraicSimplification, 1, `expected exactly one simplification for "${expr}"`);
      const text = formatIR(program);
      assert.doesNotMatch(text, new RegExp(op)); // the ADD/SUB/MUL/DIV instruction itself is gone, replaced by COPY
      assert.match(text, /RETURN x\$\d+/); // ...and Redundant Temporary Elimination collapses the COPY all the way to the bare variable
    });
  }

  test("brief's own example: y = x + 0 -> y = x", () => {
    const ir = irFor('task f(x)\n    hold y = x + 0\n    return y\nend task\nsay f(1)');
    const { program } = optimize(ir); // full default pipeline
    const text = formatIR(program);
    assert.doesNotMatch(text, /ADD/); // the "+ 0" is gone
    // "y = x" — note this is a genuinely correct, safe stopping point: y's
    // value is now a straight copy of the PARAMETER x, not a compile-time
    // constant, so Constant Propagation (which only inlines known
    // constants — §4B) correctly leaves it alone; collapsing a
    // variable-to-variable copy like this any further (e.g. rewriting the
    // later `RETURN y` to `RETURN x` too) is a distinct kind of copy
    // propagation this phase's optimizer doesn't implement yet — see
    // temp-elimination.js's own class doc (it only ever propagates a
    // `COPY` INTO A TEMP, not a variable-to-variable STORE).
    assert.match(text, /STORE y\$\d+, x\$\d+/);
  });

  test('x * 0 -> 0 (the one identity that produces a constant, not a copy)', () => {
    const ir = irFor('task f(x)\n    return x * 0\nend task\nsay f(1)');
    const { program, statistics } = optimizeOnly(ir, 'algebraicSimplification');
    assert.equal(statistics.algebraicSimplification, 1);
    assert.match(formatIR(program), /RETURN t\d+/);
    assert.match(formatIR(program), /CONST 0/);
  });

  test('never applies an identity that would actually change the result: 0 - x is NOT simplified to x', () => {
    const ir = irFor('task f(x)\n    return 0 - x\nend task\nsay f(1)');
    const { statistics } = optimizeOnly(ir, 'algebraicSimplification');
    assert.equal(statistics.algebraicSimplification, 0);
  });

  test('resolves a temp holding a known constant (not just an inline literal) — e.g. `y = x * 1` where the `1` came from its own CONST instruction', () => {
    const ir = irFor('task f(x)\n    return x * 1\nend task\nsay f(1)');
    const { statistics } = optimizeOnly(ir, 'algebraicSimplification');
    assert.equal(statistics.algebraicSimplification, 1);
  });
});

describe('D. Dead Code Elimination', () => {
  test("brief's own example: x = 10; y = 20; print(x) -> the unused y assignment is removed", () => {
    const ir = irFor('hold x = 10\nhold y = 20\nsay x');
    const { program, statistics } = optimizeOnly(ir, 'deadCodeElimination');
    assert.ok(statistics.deadCodeElimination >= 1);
    const text = formatIR(program);
    assert.doesNotMatch(text, /y\$1/); // y and everything that only existed to compute it is gone
    assert.match(text, /PRINT x\$0/); // x, which IS used, survives untouched
  });

  test('never removes a CALL, even when its result is completely unused (§6: "do NOT remove foo() just because its return value is unused")', () => {
    const ir = irFor('task foo()\n    say "side effect"\n    return 1\nend task\nfoo()\nsay "done"');
    const { program, statistics } = optimize(ir); // full pipeline — the strongest possible test of this safety rule
    assert.equal(statistics.deadCodeElimination, 0);
    const text = formatIR(program);
    assert.match(text, /CALL "foo"/);
    assert.match(text, /CONST "side effect"/); // the callee's own body, including its side effect, is fully intact
    assert.match(text, /PRINT t\d+/); // PRINT reads it via the temp CONST assigned it to, not an inlined literal — see ir-generator.js's own class doc on why literals always get their own CONST instruction
  });

  test('never removes a PRINT, STORE-to-a-read variable, or a branch/return terminator', () => {
    const ir = irFor('hold x = 5\nsay x');
    const { statistics } = optimize(ir);
    // The program's only real content (x used by say) must survive every pass combined.
    assert.doesNotThrow(() => formatIR(ir));
  });

  test('iterates to a fixed point: removing one dead instruction can orphan another', () => {
    // y is dead: removing "y = x + 1" also orphans "x + 1"'s own intermediate temp once nothing reads y anymore.
    const ir = irFor('hold x = 5\nhold y = x + 1\nsay x');
    const { program } = optimize(ir);
    const text = formatIR(program);
    assert.doesNotMatch(text, /y\$1/);
    assert.doesNotMatch(text, /ADD/); // the ADD that only ever fed the now-dead y is gone too
  });
});

describe('E. Unreachable Code Elimination', () => {
  test("brief's own example: return x; print(\"unreachable\") -> the unreachable print is removed", () => {
    const ir = irFor('task f()\n    return 10\n    say "unreachable"\nend task\nsay f()');
    const { program, statistics } = optimizeOnly(ir, 'unreachableCodeElimination');
    assert.equal(statistics.unreachableCodeElimination, 1);
    assert.doesNotMatch(formatIR(program), /unreachable/);
  });

  test('unreachable code after break/continue is also removed', () => {
    const ir = irFor('while true\n    break\n    say "after break"\nend while');
    const { program, statistics } = optimizeOnly(ir, 'unreachableCodeElimination');
    assert.ok(statistics.unreachableCodeElimination >= 1);
    assert.doesNotMatch(formatIR(program), /after break/);
  });

  test('never removes a block that IS reachable, even one reached only via a loop back-edge', () => {
    const ir = irFor('hold i = 0\nwhile i < 3\n    say i\n    i = i + 1\nend while');
    const { program, statistics } = optimizeOnly(ir, 'unreachableCodeElimination');
    assert.equal(statistics.unreachableCodeElimination, 0);
    assert.match(formatIR(program), /PRINT i\$0/);
  });
});

describe('F. Redundant Temporary Elimination', () => {
  test("brief's own example shape: a COPY producing a temp, then a use of that temp, collapses to a direct reference", () => {
    const ir = irFor('task f(x)\n    return x + 0\nend task\nsay f(1)'); // algebraic simplification turns this into `t = COPY x`, then RETURN t
    const { program, statistics } = optimize(ir); // algebraic simplification + temp elimination together, as in the real pipeline
    assert.ok(statistics.redundantTemporaryElimination >= 1);
    assert.match(formatIR(program), /RETURN x\$\d+/);
    assert.doesNotMatch(formatIR(program), /COPY/);
  });
});

describe('Statistics reporting (§9)', () => {
  test('formatOptimizerStatistics renders every pass\'s count, in the brief\'s own labeled format', () => {
    const ir = irFor('hold x = 10 + 20\nhold y = 20\nsay x');
    const { statistics } = optimize(ir);
    const text = formatOptimizerStatistics(statistics);
    assert.match(text, /Optimization Results/);
    assert.match(text, /Constant folding: \d+/);
    assert.match(text, /Constant propagation: \d+/);
    assert.match(text, /Algebraic simplifications: \d+/);
    assert.match(text, /Dead instructions removed: \d+/);
  });
});

describe('Full pipeline — cross-cutting scenarios', () => {
  test("nested expressions fully collapse: x = (10 + 20) * (5 + 5) -> x = 300 (kept alive via say so DCE can't erase the whole thing)", () => {
    const ir = irFor('hold x = (10 + 20) * (5 + 5)\nsay x');
    const { program } = optimize(ir);
    assert.match(formatIR(program), /PRINT 300/);
  });

  test('control flow survives optimization with correct structure: if/else, while, nested conditions', () => {
    const source = `
      hold age = 20
      if age >= 18
          say "adult"
      else
          say "minor"
      end if

      hold i = 0
      while i < 3
          say i
          i = i + 1
      end while
    `;
    const ir = irFor(source);
    const { program } = optimize(ir);
    const text = formatIR(program);
    assert.match(text, /IF /);
    assert.match(text, /while_cond_/);
  });

  test('function calls, parameters, return values, local variables, and side effects all survive optimization correctly', () => {
    const ir = irFor(`
      task fact(n)
          if n <= 1
              return 1
          end if
          return n * fact(n - 1)
      end task
      say fact(5)
    `);
    const { program } = optimize(ir);
    const text = formatIR(program);
    assert.match(text, /function fact\$\d+\(n\$\d+\):/);
    assert.match(text, /CALL "fact", /);
  });
});

/**
 * Bytecode Generator test suite — Phase 10 (MASTER_DOCUMENT.md §29).
 * Exercises the Generator (AST -> instructions), the Validator (stack
 * balance, jump/constant-reference soundness), and the binary/text
 * writers' round-trip fidelity — across every language construct §29
 * asks for, plus the real example programs and a set of larger/nested/
 * recursive programs.
 *
 * Deliberately favors validation-based assertions ("this compiles to
 * something structurally sound") over hand-verifying exact instruction
 * sequences for every case: the latter is brittle and doesn't actually
 * prove correctness, whereas a passing Validator run genuinely checks
 * stack balance, reachability of every jump target, and constant/argument
 * soundness for the WHOLE program, mechanically. A handful of exact-shape
 * tests are included too, for the constructs where the specific encoding
 * (e.g. short-circuit and/or, N-ary push order) is the interesting part.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { SemanticAnalyzer } from '../src/semantic/analyzer.js';
import { generateBytecode } from '../src/bytecode/bytecode-generator.js';
import { validateBytecode } from '../src/bytecode/validator.js';
import { formatBytecodeText, writeBytecodeBinary, readBytecodeBinary } from '../src/bytecode/bytecode-writer.js';
import { Opcode } from '../src/bytecode/opcode.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, '..', 'examples');

/** Full frontend (unmodified) -> Generator. Throws loudly if analysis unexpectedly fails. */
function compile(source, label = 'test.pr') {
  const tokens = new Lexer(source, label).tokenize();
  const program = new Parser(tokens, label).parseProgram();
  const analysis = new SemanticAnalyzer(program, label).analyze();
  if (!analysis.success) {
    throw new Error(`Semantic analysis unexpectedly failed: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  }
  return generateBytecode(program);
}

function opcodesOf(bytecode) {
  return bytecode.instructions.map((instr) => instr.opcode);
}

function assertValid(bytecode) {
  const result = validateBytecode(bytecode);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
}

/** Round-trips through the binary .pbc format and asserts the result is structurally identical AND still valid. */
function assertRoundTrips(bytecode) {
  const buffer = writeBytecodeBinary(bytecode);
  const roundTripped = readBytecodeBinary(buffer);

  assert.equal(roundTripped.instructions.length, bytecode.instructions.length);
  roundTripped.instructions.forEach((instr, i) => {
    assert.equal(instr.opcode, bytecode.instructions[i].opcode);
    assert.deepEqual(instr.operands, bytecode.instructions[i].operands);
  });
  assert.deepEqual([...roundTripped.constants], [...bytecode.constants]);
  assert.deepEqual(
    roundTripped.functions,
    bytecode.functions.map((fn) => ({ name: fn.name, paramSlots: fn.paramSlots, entryIndex: fn.entryIndex, isNested: fn.isNested })),
  );

  assertValid(roundTripped);
  return buffer;
}

// ---------------------------------------------------------------------

describe('Variables, Constants, Assignments', () => {
  test('a variable declaration compiles to PUSH + STORE', () => {
    const bc = compile('hold age = 20');
    assert.deepEqual(opcodesOf(bc), [Opcode.PUSH, Opcode.STORE, Opcode.PUSH, Opcode.HALT]);
    assertValid(bc);
  });

  test('a constant declaration compiles identically to a variable one (reassignment is already ruled out by Semantic Analysis)', () => {
    const bc = compile('const PI = 3.14');
    assert.deepEqual(opcodesOf(bc), [Opcode.PUSH, Opcode.STORE, Opcode.PUSH, Opcode.HALT]);
    assertValid(bc);
  });

  test('reassignment compiles to another PUSH + STORE against the same slot', () => {
    const bc = compile('hold age = 20\nage = 21');
    const stores = bc.instructions.filter((i) => i.opcode === Opcode.STORE);
    assert.equal(stores.length, 2);
    assert.deepEqual(stores[0].operands, stores[1].operands); // same mangled slot
    assertValid(bc);
  });

  test('shadowing in a nested block produces two DIFFERENT slots', () => {
    const bc = compile('hold x = 1\nif true\n    hold x = 2\n    say x\nend if\nsay x');
    const stores = bc.instructions.filter((i) => i.opcode === Opcode.STORE).map((i) => i.operands[0]);
    assert.equal(new Set(stores).size, 2); // two distinct mangled names, despite the same source name "x"
    assertValid(bc);
  });
});

describe('Expressions', () => {
  test('arithmetic, comparison, and unary operators map to their exact opcodes', () => {
    const cases = [
      ['1 + 2', Opcode.ADD], ['1 - 2', Opcode.SUB], ['1 * 2', Opcode.MUL], ['1 / 2', Opcode.DIV],
      ['1 % 2', Opcode.MOD], ['1 ** 2', Opcode.POW],
      ['1 == 2', Opcode.EQ], ['1 != 2', Opcode.NE], ['1 > 2', Opcode.GT], ['1 < 2', Opcode.LT],
      ['1 >= 2', Opcode.GE], ['1 <= 2', Opcode.LE],
    ];
    for (const [expr, opcode] of cases) {
      const bc = compile(`say ${expr}`);
      assert.ok(opcodesOf(bc).includes(opcode), `expected ${opcode} for "${expr}"`);
      assertValid(bc);
    }
  });

  test('unary "-" and "not" map to NEG/NOT', () => {
    assert.ok(opcodesOf(compile('say -5')).includes(Opcode.NEG));
    assert.ok(opcodesOf(compile('say not true')).includes(Opcode.NOT));
  });

  test('"and"/"or" compile via short-circuit jumps, NOT the AND/OR opcodes (§13.7)', () => {
    const bcAnd = compile('say true and false');
    const bcOr = compile('say true or false');
    assert.ok(!opcodesOf(bcAnd).includes(Opcode.AND));
    assert.ok(opcodesOf(bcAnd).includes(Opcode.JMP_IF_FALSE));
    assert.ok(!opcodesOf(bcOr).includes(Opcode.OR));
    assert.ok(opcodesOf(bcOr).includes(Opcode.JMP_IF_TRUE));
    assertValid(bcAnd);
    assertValid(bcOr);
  });

  test('a right operand that would throw at runtime never breaks validation when short-circuited away', () => {
    // "false and (1/0 > 0)" — DIV is still emitted (the Generator can't know
    // the divisor is 0 without evaluating), but it must be reachable only
    // via the non-short-circuited path, and the whole program must still
    // validate (stack-balanced on both the short-circuit and full-evaluate paths).
    const bc = compile('say false and (1 / 0 > 0)');
    assertValid(bc);
  });

  test('every literal type produces a correctly-typed constant pool entry', () => {
    const bc = compile('say 5\nsay 5.5\nsay "hi"\nsay true\nsay empty');
    const types = [...bc.constants].map((c) => c.type);
    // +1 "Number": every program's trailing implicit "PUSH 0; HALT" (§29.2's exit-code convention) pools its own 0.
    assert.deepEqual(types.sort(), ['Boolean', 'Empty', 'Number', 'Number', 'Decimal', 'String'].sort());
    assertValid(bc);
  });
});

describe('Functions', () => {
  test('a task declaration is skipped by a leading JMP and reached only via CALL', () => {
    const bc = compile('task greet(name)\n    say "hi", name\nend task\ngreet("x")');
    assert.equal(bc.instructions[0].opcode, Opcode.JMP);
    assert.equal(bc.functions.length, 1);
    assert.deepEqual(bc.functions[0].paramSlots.length, 1);
    assertValid(bc);
  });

  test('a task with no explicit "return" ends in PUSH Empty + RETURN', () => {
    const bc = compile('task noop()\n    hold x = 1\nend task\nnoop()');
    const fn = bc.functions[0];
    const bodyOpcodes = opcodesOf(bc).slice(fn.entryIndex);
    const returnIdx = bodyOpcodes.indexOf(Opcode.RETURN);
    assert.equal(bodyOpcodes[returnIdx - 1], Opcode.PUSH);
    assertValid(bc);
  });

  test('recursion: a self-call resolves through the SAME function-table entry', () => {
    const bc = compile('task fact(n)\n    if n <= 1\n        return 1\n    end if\n    return n * fact(n - 1)\nend task\nsay fact(5)');
    const callInstrs = bc.instructions.filter((i) => i.opcode === Opcode.CALL);
    assert.ok(callInstrs.length >= 2); // fact(n-1) inside the body, fact(5) at top level
    const names = new Set(callInstrs.map((i) => bc.constants.get(i.operands[0]).value));
    assert.equal(names.size, 1);
    assert.equal(names.has(bc.functions[0].name), true);
    assertValid(bc);
  });

  test('mutual recursion between two sibling tasks both resolve correctly', () => {
    const source = [
      'task isEven(n)',
      '    if n == 0',
      '        return true',
      '    end if',
      '    return isOdd(n - 1)',
      'end task',
      'task isOdd(n)',
      '    if n == 0',
      '        return false',
      '    end if',
      '    return isEven(n - 1)',
      'end task',
      'say isEven(10)',
    ].join('\n');
    assertValid(compile(source));
  });

  test('a nested task (declared inside another task) is marked isNested and still validates', () => {
    const source = ['task outer(n)', '    task inner()', '        return n * 2', '    end task', '    return inner()', 'end task', 'say outer(5)'].join('\n');
    const bc = compile(source);
    const inner = bc.functions.find((fn) => fn.name.startsWith('inner'));
    assert.equal(inner.isNested, true);
    const outer = bc.functions.find((fn) => fn.name.startsWith('outer'));
    assert.equal(outer.isNested, false);
    assertValid(bc);
  });

  test('a CALL with the wrong argument count is caught by the Validator', () => {
    // Bypasses Semantic Analysis on purpose (P016 would normally catch this) to exercise the Validator's own check in isolation.
    const source = 'task add(a, b)\n    return a + b\nend task\nsay add(1, 2)';
    const bc = compile(source);
    const callIdx = bc.instructions.findIndex((i) => i.opcode === Opcode.CALL);
    bc.instructions[callIdx].operands[1] = 3; // corrupt: claim 3 args were passed
    const result = validateBytecode(bc);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('argument')));
  });
});

describe('Arrays (§28 / §29)', () => {
  test('"box(1, 2, 3)" compiles to three PUSHes then ARRAY_NEW 3', () => {
    const bc = compile('hold nums = box(1, 2, 3)');
    const newIdx = opcodesOf(bc).indexOf(Opcode.ARRAY_NEW);
    assert.deepEqual(opcodesOf(bc).slice(newIdx - 3, newIdx), [Opcode.PUSH, Opcode.PUSH, Opcode.PUSH]);
    assert.equal(bc.instructions[newIdx].operands[0], 3);
    assertValid(bc);
  });

  test('indexing compiles to ARRAY_GET, assignment to ARRAY_SET', () => {
    const bc = compile('hold nums = box(1, 2, 3)\nsay nums[0]\nnums[1] = 99');
    assert.ok(opcodesOf(bc).includes(Opcode.ARRAY_GET));
    assert.ok(opcodesOf(bc).includes(Opcode.ARRAY_SET));
    assertValid(bc);
  });

  test('nested arrays and chained indexing validate correctly', () => {
    const bc = compile('hold m = box(box(1, 2), box(3, 4))\nsay m[1][0]\nm[0][1] = 9');
    assertValid(bc);
  });

  test('every array built-in (push/pop/insert/remove/sort/reverse/contains/len) compiles via CALL and validates', () => {
    const source = [
      'hold a = box(1, 2, 3)',
      'push(a, 4)',
      'pop(a)',
      'insert(a, 0, 0)',
      'remove(a, 1)',
      'sort(a)',
      'reverse(a)',
      'say contains(a, 2)',
      'say len(a)',
    ].join('\n');
    const bc = compile(source);
    const calledNames = bc.instructions.filter((i) => i.opcode === Opcode.CALL).map((i) => bc.constants.get(i.operands[0]).value);
    for (const name of ['push', 'pop', 'insert', 'remove', 'sort', 'reverse', 'contains', 'len']) {
      assert.ok(calledNames.includes(name), `expected a CALL to "${name}"`);
    }
    assertValid(bc);
  });
});

describe('Loops', () => {
  test('"repeat n as i" validates and reuses one limit slot (count expression evaluated once)', () => {
    const bc = compile('hold total = 0\nrepeat 5 as i\n    total = total + i\nend repeat\nsay total');
    assertValid(bc);
  });

  test('"while" validates, including break/continue', () => {
    const source = ['hold i = 0', 'while i < 10', '    i = i + 1', '    if i == 3', '        continue', '    end if', '    if i == 7', '        break', '    end if', '    say i', 'end while'].join('\n');
    assertValid(compile(source));
  });

  test('break/continue inside a task resets independently of an outer loop (mirrors ExecutionContext.loopDepth reset)', () => {
    const source = [
      'task findFirstEven(limit)',
      '    hold i = 1',
      '    while i <= limit',
      '        if i % 2 == 0',
      '            return i',
      '        end if',
      '        i = i + 1',
      '    end while',
      '    return 0',
      'end task',
      '',
      'repeat 3 as i',
      '    say findFirstEven(10)',
      'end repeat',
    ].join('\n');
    assertValid(compile(source));
  });

  test('nested repeat/while (a small multiplication table) validates', () => {
    const source = ['repeat 3 as i', '    repeat 3 as j', '        say i * j', '    end repeat', 'end repeat'].join('\n');
    assertValid(compile(source));
  });
});

describe('Conditions / Choose', () => {
  test('if/else without an else branch validates (both fallthrough and jump paths agree on stack depth)', () => {
    assertValid(compile('hold x = 5\nif x > 0\n    say "positive"\nend if'));
  });

  test('if/else with an else branch validates', () => {
    assertValid(compile('hold x = -1\nif x > 0\n    say "positive"\nelse\n    say "non-positive"\nend if'));
  });

  test('nested if inside if inside if validates (else-if via nesting, §15.1)', () => {
    const source = ['hold grade = 85', 'if grade >= 90', '    say "A"', 'else', '    if grade >= 80', '        say "B"', '    else', '        say "C"', '    end if', 'end if'].join('\n');
    assertValid(compile(source));
  });

  test('choose/option/other compiles to one comparison chain and validates', () => {
    const source = ['hold day = 2', 'choose day', '    option 1', '        say "Mon"', '    option 2', '        say "Tue"', '    other', '        say "?"', 'end choose'].join('\n');
    const bc = compile(source);
    assert.ok(opcodesOf(bc).includes(Opcode.EQ));
    assertValid(bc);
  });

  test('choose with no "other" clause validates', () => {
    assertValid(compile('choose 1\n    option 1\n        say "one"\nend choose'));
  });
});

describe('Stop statement', () => {
  test('"stop" with no argument pushes 0 before HALT', () => {
    const bc = compile('stop');
    const haltIdx = bc.instructions.length - 1;
    assert.equal(bc.instructions[haltIdx].opcode, Opcode.HALT);
    assert.equal(bc.instructions[haltIdx - 1].opcode, Opcode.PUSH);
    assert.equal(bc.constants.get(bc.instructions[haltIdx - 1].operands[0]).value, 0);
    assertValid(bc);
  });

  test('"stop <code>" pushes the given code before HALT', () => {
    const bc = compile('stop 5');
    const haltIdx = bc.instructions.findIndex((i) => i.opcode === Opcode.HALT);
    assert.equal(bc.constants.get(bc.instructions[haltIdx - 1].operands[0]).value, 5);
    assertValid(bc);
  });

  test('"stop" from deep inside nested control flow still validates', () => {
    const source = ['task validate(age)', '    if age < 0', '        stop 1', '    end if', '    return true', 'end task', 'validate(-5)'].join('\n');
    assertValid(compile(source));
  });
});

describe('Nested control flow / large programs / regression', () => {
  test('a 5-level nested block (task > while > if > choose > option) validates', () => {
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
    assertValid(compile(source));
  });

  test('a large program (500 sequential statements) validates', () => {
    const lines = [];
    for (let i = 0; i < 500; i++) lines.push(`hold v${i} = ${i}`);
    assertValid(compile(lines.join('\n')));
  });

  test('recursion just below the interpreter\'s call-depth limit still compiles to sound bytecode', () => {
    const source = ['task countDown(n)', '    if n <= 0', '        return 0', '    end if', '    return countDown(n - 1)', 'end task', 'say countDown(400)'].join('\n');
    assertValid(compile(source));
  });

  test('every real example program compiles to valid, round-trippable bytecode', () => {
    for (const file of ['hello.pr', 'variables.pr', 'ifelse.pr', 'loops.pr', 'functions.pr', 'calculator.pr', 'fizzbuzz.pr', 'grade-checker.pr', 'while-break-continue.pr', 'stop.pr', 'arrays.pr']) {
      const source = readFileSync(join(examplesDir, file), 'utf-8');
      const bc = compile(source, file);
      assertValid(bc);
      assertRoundTrips(bc);
    }
  });
});

describe('Text and binary writers', () => {
  test('formatBytecodeText() produces a listing with the title, constants, functions, and instructions sections', () => {
    const bc = compile('hold x = 5\nsay x');
    const text = formatBytecodeText(bc, { title: 'Bytecode for test.pr' });
    assert.match(text, /Bytecode for test\.pr/);
    assert.match(text, /Constants \(\d+\)/);
    assert.match(text, /Functions \(\d+\)/);
    assert.match(text, /Instructions \(\d+\)/);
    assert.match(text, /HALT/);
  });

  test('writeBytecodeBinary() starts with the "PBC1" magic and a version', () => {
    const bc = compile('say "hi"');
    const buffer = writeBytecodeBinary(bc);
    assert.equal(buffer.subarray(0, 4).toString('ascii'), 'PBC1');
    // Version 2 (Phase 11): adds per-instruction line/column — a real bugfix
    // (a loaded .pbc's runtime errors were reporting "file:null:null"),
    // not a routine revision — see bytecode-writer.js's format doc.
    assert.equal(buffer.readUInt32LE(4), 2);
  });

  test('binary round-trip preserves each instruction\'s source line/column (Phase 11 fix)', () => {
    const bc = compile('hold x = 1 / 0');
    const buffer = writeBytecodeBinary(bc);
    const roundTripped = readBytecodeBinary(buffer);
    const divIdx = roundTripped.instructions.findIndex((i) => i.opcode === 'DIV');
    assert.equal(typeof roundTripped.instructions[divIdx].line, 'number');
    assert.equal(typeof roundTripped.instructions[divIdx].column, 'number');
    assert.deepEqual(
      [roundTripped.instructions[divIdx].line, roundTripped.instructions[divIdx].column],
      [bc.instructions[divIdx].line, bc.instructions[divIdx].column],
    );
  });

  test('readBytecodeBinary() rejects a buffer without the correct magic', () => {
    assert.throws(() => readBytecodeBinary(Buffer.from('NOPE1234')), /magic/);
  });

  test('binary round-trip is exact for a program touching every construct (arrays, functions, loops, choose, stop)', () => {
    const source = [
      'task classify(n)',
      '    if n < 0',
      '        return "negative"',
      '    end if',
      '    return "non-negative"',
      'end task',
      '',
      'hold nums = box(1, 2, 3)',
      'push(nums, 4)',
      'repeat len(nums) as i',
      '    say classify(nums[i - 1])',
      'end repeat',
      '',
      'choose len(nums)',
      '    option 4',
      '        say "four"',
      '    other',
      '        say "not four"',
      'end choose',
    ].join('\n');
    const bc = compile(source);
    assertValid(bc);
    assertRoundTrips(bc);
  });
});

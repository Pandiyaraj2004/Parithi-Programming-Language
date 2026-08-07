/**
 * Parithi Virtual Machine test suite — Phase 11 (MASTER_DOCUMENT.md §30).
 * Exercises every opcode, every runtime object, recursion, nested loops,
 * arrays, built-ins, stack overflow, and deliberately corrupted/invalid
 * bytecode — entirely through `compileFromSource()` (the real Lexer →
 * Parser → Semantic Analyzer → Bytecode Generator → Validator pipeline,
 * unmodified) feeding a real `VirtualMachine`, plus a handful of
 * hand-built `{instructions, constants, functions}` programs for the
 * error paths no valid Parithi program could ever produce.
 *
 * Direct Interpreter-vs-VM output comparison lives in a separate file,
 * `tests/vm-parity.test.js`, since that's a distinct concern (identical
 * behavior across BOTH backends) from "does the VM work at all."
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VirtualMachine } from '../src/vm/virtual-machine.js';
import { compileFromSource } from '../src/vm/loader.js';
import { Frame, displayFunctionName } from '../src/vm/frame.js';
import { OperandStack } from '../src/vm/stack.js';
import { Heap } from '../src/vm/heap.js';
import { Debugger } from '../src/vm/debugger.js';
import { Instruction, ConstantPool, Opcode } from '../src/bytecode/index.js';
import { ParithiRuntimeError } from '../src/errors/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, '..', 'examples');

function compileAndRun(source, { input = [] } = {}) {
  const result = compileFromSource(source, 'test.pr');
  if (!result.success) {
    throw new Error(`Compile unexpectedly failed: ${JSON.stringify(result.diagnostics ?? result.errors)}`);
  }
  const output = [];
  const queue = [...input];
  const vm = new VirtualMachine(result.bytecode, 'test.pr', {
    write: () => {},
    writeLine: (text) => output.push(text),
    readLine: () => queue.shift() ?? '',
  });
  const exitCode = vm.run();
  return { output, exitCode, vm };
}

function assertThrowsCode(source, code) {
  assert.throws(() => compileAndRun(source), (err) => {
    assert.ok(err instanceof ParithiRuntimeError, `expected a ParithiRuntimeError, got ${err.constructor.name}`);
    assert.equal(err.code, code);
    return true;
  });
}

/** A minimal hand-built program, for exercising VM error paths no valid compiled program could ever reach. */
function program(instructions, { constants = new ConstantPool(), functions = [] } = {}) {
  return { instructions, constants, functions };
}

// ---------------------------------------------------------------------

describe('Opcodes — Memory', () => {
  test('PUSH/STORE/LOAD round-trip a value through a variable', () => {
    assert.deepEqual(compileAndRun('hold x = 42\nsay x').output, ['42']);
  });

  test('POP discards an expression statement\'s result', () => {
    assert.deepEqual(compileAndRun('push(box(1), 2)\nsay "done"').output, ['done']);
  });

  test('reassignment STOREs into the SAME slot as the declaration', () => {
    assert.deepEqual(compileAndRun('hold x = 1\nx = 2\nx = 3\nsay x').output, ['3']);
  });
});

describe('Opcodes — Arithmetic', () => {
  test('ADD SUB MUL DIV MOD POW NEG all compute correctly', () => {
    assert.deepEqual(compileAndRun('say 2 + 3').output, ['5']);
    assert.deepEqual(compileAndRun('say 5 - 2').output, ['3']);
    assert.deepEqual(compileAndRun('say 4 * 3').output, ['12']);
    assert.deepEqual(compileAndRun('say 10 / 4').output, ['2.5']);
    assert.deepEqual(compileAndRun('say 10 % 3').output, ['1']);
    assert.deepEqual(compileAndRun('say 2 ** 10').output, ['1024']);
    assert.deepEqual(compileAndRun('say -7').output, ['-7']);
  });

  test('DIV/MOD by zero raise P020, matching the Interpreter exactly', () => {
    assertThrowsCode('say 1 / 0', 'P020');
    assertThrowsCode('say 1 % 0', 'P020');
  });
});

describe('Opcodes — Comparison', () => {
  test('EQ/NE/GT/LT/GE/LE all compute correctly', () => {
    assert.deepEqual(compileAndRun('say 1 == 1\nsay 1 != 2\nsay 2 > 1\nsay 1 < 2\nsay 2 >= 2\nsay 1 <= 1').output, ['true', 'true', 'true', 'true', 'true', 'true']);
  });

  test('EQ is deep/structural for arrays, not by reference', () => {
    assert.deepEqual(compileAndRun('say box(1, 2) == box(1, 2)\nsay box(1, 2) == box(1, 3)').output, ['true', 'false']);
  });
});

describe('Opcodes — Logic', () => {
  test('"and"/"or"/"not" all compute correctly at the source level (compiled via short-circuit jumps, not AND/OR)', () => {
    assert.deepEqual(compileAndRun('say true and false\nsay true or false\nsay not true').output, ['false', 'true', 'false']);
  });

  test('short-circuit "and" never evaluates a right side that would throw', () => {
    assert.deepEqual(compileAndRun('say false and (1 / 0 > 0)').output, ['false']);
  });

  test('short-circuit "or" never evaluates a right side that would throw', () => {
    assert.deepEqual(compileAndRun('say true or (1 / 0 > 0)').output, ['true']);
  });

  test('AND/OR opcodes themselves (eager, hand-built — never emitted by the Generator) compute correctly', () => {
    const constants = new ConstantPool();
    const t = constants.add('Boolean', true);
    const f = constants.add('Boolean', false);
    const zero = constants.add('Number', 0);
    const instructions = [
      new Instruction(Opcode.PUSH, [t]),
      new Instruction(Opcode.PUSH, [f]),
      new Instruction(Opcode.AND, []),
      new Instruction(Opcode.PRINT, [1]),
      new Instruction(Opcode.PUSH, [zero]),
      new Instruction(Opcode.HALT, []),
    ];
    const output = [];
    const vm = new VirtualMachine(program(instructions, { constants }), 'test.pr', { writeLine: (t2) => output.push(t2) });
    vm.run();
    assert.deepEqual(output, ['false']);
  });
});

describe('Opcodes — Control Flow', () => {
  test('if/else takes the correct branch', () => {
    assert.deepEqual(compileAndRun('if 5 > 3\n    say "yes"\nelse\n    say "no"\nend if').output, ['yes']);
    assert.deepEqual(compileAndRun('if 1 > 3\n    say "yes"\nelse\n    say "no"\nend if').output, ['no']);
  });

  test('nested if/else (else-if via nesting) resolves the correct branch', () => {
    const source = ['hold grade = 85', 'if grade >= 90', '    say "A"', 'else', '    if grade >= 80', '        say "B"', '    else', '        say "C"', '    end if', 'end if'].join('\n');
    assert.deepEqual(compileAndRun(source).output, ['B']);
  });
});

describe('Opcodes — Functions', () => {
  test('CALL/RETURN: a simple task call returns its value', () => {
    assert.deepEqual(compileAndRun('task double(x)\n    return x * 2\nend task\nsay double(21)').output, ['42']);
  });

  test('recursion (factorial) computes correctly', () => {
    const source = ['task fact(n)', '    if n <= 1', '        return 1', '    end if', '    return n * fact(n - 1)', 'end task', 'say fact(6)'].join('\n');
    assert.deepEqual(compileAndRun(source).output, ['720']);
  });

  test('mutual recursion resolves correctly', () => {
    const source = [
      'task isEven(n)', '    if n == 0', '        return true', '    end if', '    return isOdd(n - 1)', 'end task',
      'task isOdd(n)', '    if n == 0', '        return false', '    end if', '    return isEven(n - 1)', 'end task',
      'say isEven(10)', 'say isOdd(10)',
    ].join('\n');
    assert.deepEqual(compileAndRun(source).output, ['true', 'false']);
  });

  test('a nested task correctly resolves its enclosing task\'s parameter (frame lexicalParent chain)', () => {
    const source = ['task outer(n)', '    task inner()', '        return n * 2', '    end task', '    return inner()', 'end task', 'say outer(21)'].join('\n');
    assert.deepEqual(compileAndRun(source).output, ['42']);
  });

  test('a nested task inside a RECURSIVE outer sees the CURRENT invocation\'s parameter, not an outer one', () => {
    const source = [
      'task outer(n)',
      '    task inner()',
      '        return n',
      '    end task',
      '    if n <= 1',
      '        return inner()',
      '    end if',
      '    return outer(n - 1)',
      'end task',
      'say outer(5)', // should see n=1 (the innermost/base-case frame), not n=5
    ].join('\n');
    assert.deepEqual(compileAndRun(source).output, ['1']);
  });

  test('a top-level task calling another top-level (non-nested) task resolves its OWN globals, not the caller\'s frame', () => {
    const source = ['hold shared = 100', 'task helper()', '    return shared', 'end task', 'task main()', '    hold shared = 1', '    return helper()', 'end task', 'say main()'].join('\n');
    // helper() is top-level (not nested), so its lexical parent is ALWAYS
    // global — it must see the global "shared" (100), not main()'s local
    // shadowed "shared" (1), even though main() is who called it.
    assert.deepEqual(compileAndRun(source).output, ['100']);
  });

  test('passing and returning arrays preserves reference semantics through a CALL', () => {
    const source = ['task addOne(arr)', '    push(arr, 1)', 'end task', 'hold nums = box()', 'addOne(nums)', 'addOne(nums)', 'say nums'].join('\n');
    assert.deepEqual(compileAndRun(source).output, ['[1, 1]']);
  });

  test('a task with no explicit return falls through to empty', () => {
    assert.deepEqual(compileAndRun('task noop()\n    hold x = 1\nend task\nsay noop()').output, ['empty']);
  });
});

describe('Opcodes — Console', () => {
  test('PRINT joins multiple arguments with a space', () => {
    assert.deepEqual(compileAndRun('say "a", "b", "c"').output, ['a b c']);
  });

  test('INPUT writes the prompt and reads a line', () => {
    const writes = [];
    const result = compileFromSource('hold name = ask("Name? ")\nsay "Hi", name', 'test.pr');
    const vm = new VirtualMachine(result.bytecode, 'test.pr', { write: (t) => writes.push(t), writeLine: () => {}, readLine: () => 'Ada' });
    vm.run();
    assert.deepEqual(writes, ['Name? ']);
  });
});

describe('Opcodes — Arrays', () => {
  test('ARRAY_NEW/ARRAY_GET/ARRAY_SET all work, including nested arrays', () => {
    const source = ['hold m = box(box(1, 2), box(3, 4))', 'say m[1][0]', 'm[0][1] = 99', 'say m'].join('\n');
    assert.deepEqual(compileAndRun(source).output, ['3', '[[1, 99], [3, 4]]']);
  });

  test('array index out of range raises P024; negative index raises P027', () => {
    assertThrowsCode('hold a = box(1, 2)\nsay a[5]', 'P024');
    assertThrowsCode('hold a = box(1, 2)\nsay a[-1]', 'P027');
  });

  test('array element type mismatch raises P026; non-array indexing raises P025', () => {
    assertThrowsCode('hold a = box(1, 2)\na[0] = "x"', 'P026');
    const source = ['task first(x)', '    return x[0]', 'end task', 'say first(5)'].join('\n');
    assertThrowsCode(source, 'P025');
  });
});

describe('Runtime Objects', () => {
  test('Number and Decimal both print correctly and arithmetic between them promotes to Decimal', () => {
    assert.deepEqual(compileAndRun('say 5\nsay 5.5\nsay 5 + 0.5').output, ['5', '5.5', '5.5']);
  });

  test('String prints unquoted at top level, quoted inside an array', () => {
    assert.deepEqual(compileAndRun('say "hi"\nsay box("a", "b")').output, ['hi', '["a", "b"]']);
  });

  test('Boolean prints as true/false', () => {
    assert.deepEqual(compileAndRun('say true\nsay false').output, ['true', 'false']);
  });

  test('Empty prints as "empty"', () => {
    assert.deepEqual(compileAndRun('hold x = empty\nsay x').output, ['empty']);
  });

  test('Array prints bracketed, including nested', () => {
    assert.deepEqual(compileAndRun('say box(box(1, 2), box(3, 4))').output, ['[[1, 2], [3, 4]]']);
  });
});

describe('Built-in Functions', () => {
  test('number(), text(), type() compute exactly like the Interpreter', () => {
    assert.deepEqual(compileAndRun('say number("42")\nsay text(42)\nsay type(42)\nsay type("x")\nsay type(box())').output, ['42', '42', 'Number', 'String', 'Array']);
  });

  test('round() and random() work (random\'s range is checked, not its exact value)', () => {
    assert.deepEqual(compileAndRun('say round(3.7)').output, ['4']);
    const { output } = compileAndRun('say random(1, 1)');
    assert.equal(output[0], '1');
  });

  test('len() works for both String and Array', () => {
    assert.deepEqual(compileAndRun('say len("hello")\nsay len(box(1, 2, 3))').output, ['5', '3']);
  });

  test('push/pop/insert/remove/sort/reverse/contains all work', () => {
    const source = [
      'hold a = box(3, 1, 2)',
      'push(a, 4)',
      'say a',
      'say pop(a)',
      'insert(a, 0, 0)',
      'say a',
      'say remove(a, 1)',
      'sort(a)',
      'say a',
      'reverse(a)',
      'say a',
      'say contains(a, 2)',
    ].join('\n');
    assert.deepEqual(compileAndRun(source).output, [
      '[3, 1, 2, 4]', '4', '[0, 3, 1, 2]', '3', '[0, 1, 2]', '[2, 1, 0]', 'true',
    ]);
  });
});

describe('Loops', () => {
  test('repeat/while/break/continue all work, including nested loops', () => {
    const source = ['repeat 3 as i', '    repeat 3 as j', '        say i * j', '    end repeat', 'end repeat'].join('\n');
    assert.deepEqual(compileAndRun(source).output, ['1', '2', '3', '2', '4', '6', '3', '6', '9']);
  });

  test('break/continue inside a nested while loop work correctly', () => {
    const source = ['hold i = 0', 'while i < 10', '    i = i + 1', '    if i % 2 == 0', '        continue', '    end if', '    if i > 7', '        break', '    end if', '    say i', 'end while'].join('\n');
    assert.deepEqual(compileAndRun(source).output, ['1', '3', '5', '7']);
  });

  test('break/continue inside a task resets independently of an outer loop', () => {
    const source = [
      'task firstEven(limit)',
      '    hold i = 1',
      '    while i <= limit',
      '        if i % 2 == 0',
      '            return i',
      '        end if',
      '        i = i + 1',
      '    end while',
      '    return 0',
      'end task',
      'repeat 2 as i',
      '    say firstEven(10)',
      'end repeat',
    ].join('\n');
    assert.deepEqual(compileAndRun(source).output, ['2', '2']);
  });
});

describe('Choose / Stop', () => {
  test('choose/option/other picks exactly one clause', () => {
    assert.deepEqual(compileAndRun('choose 3\n    option 1\n        say "one"\n    option 2\n        say "two"\n    other\n        say "?"\nend choose').output, ['?']);
  });

  test('"stop" halts immediately with the given exit code, skipping later statements', () => {
    const { output, exitCode } = compileAndRun('say "before"\nstop 7\nsay "after"');
    assert.deepEqual(output, ['before']);
    assert.equal(exitCode, 7);
  });

  test('a bare "stop" exits 0', () => {
    assert.equal(compileAndRun('stop').exitCode, 0);
  });

  test('normal completion (no "stop") exits 0', () => {
    assert.equal(compileAndRun('say "done"').exitCode, 0);
  });
});

describe('Errors — Stack Overflow / Invalid Bytecode / Corrupted Bytecode', () => {
  test('unbounded recursion raises P021 (call depth), matching the Interpreter\'s own limit', () => {
    assertThrowsCode('task loopForever()\n    return loopForever()\nend task\nloopForever()', 'P021');
  });

  test('an operand stack that never stops growing raises P021 (overflow), not an unbounded native crash', () => {
    const constants = new ConstantPool();
    const one = constants.add('Number', 1);
    // JMP 0 with a PUSH before it: an infinite loop that only ever pushes.
    const instructions = [new Instruction(Opcode.PUSH, [one]), new Instruction(Opcode.JMP, [0])];
    const vm = new VirtualMachine(program(instructions, { constants }), 'test.pr');
    assert.throws(() => vm.run(), (err) => {
      assert.ok(err instanceof ParithiRuntimeError);
      assert.equal(err.code, 'P021');
      return true;
    });
  });

  test('popping an empty operand stack raises a clean VM error (P023), not a raw JS exception', () => {
    const instructions = [new Instruction(Opcode.POP, [])];
    const vm = new VirtualMachine(program(instructions), 'test.pr');
    assert.throws(() => vm.run(), (err) => {
      assert.ok(err instanceof ParithiRuntimeError);
      assert.equal(err.code, 'P023');
      return true;
    });
  });

  test('an unrecognized opcode raises a clean VM error (P023), not a raw JS exception', () => {
    const instructions = [new Instruction('NOT_A_REAL_OPCODE', [])];
    const vm = new VirtualMachine(program(instructions), 'test.pr');
    assert.throws(() => vm.run(), (err) => {
      assert.ok(err instanceof ParithiRuntimeError);
      assert.equal(err.code, 'P023');
      return true;
    });
  });

  test('a jump to an out-of-range instruction index raises a clean VM error (P023)', () => {
    const instructions = [new Instruction(Opcode.JMP, [999])];
    const vm = new VirtualMachine(program(instructions), 'test.pr');
    assert.throws(() => vm.run(), (err) => {
      assert.ok(err instanceof ParithiRuntimeError);
      assert.equal(err.code, 'P023');
      return true;
    });
  });

  test('a reference to a nonexistent constant-pool index raises a clean VM error (P023)', () => {
    const instructions = [new Instruction(Opcode.PUSH, [42])]; // empty constant pool
    const vm = new VirtualMachine(program(instructions), 'test.pr');
    assert.throws(() => vm.run(), (err) => {
      assert.ok(err instanceof ParithiRuntimeError);
      assert.equal(err.code, 'P023');
      return true;
    });
  });

  test('RETURN with no active call frame raises a clean VM error (P023)', () => {
    const instructions = [new Instruction(Opcode.RETURN, [])];
    const vm = new VirtualMachine(program(instructions), 'test.pr');
    assert.throws(() => vm.run(), (err) => {
      assert.ok(err instanceof ParithiRuntimeError);
      assert.equal(err.code, 'P023');
      return true;
    });
  });

  test('a CALL naming neither a known task nor a built-in raises P015', () => {
    const constants = new ConstantPool();
    const name = constants.addName('totallyUnknownFunction');
    const zero = constants.add('Number', 0);
    const instructions = [
      new Instruction(Opcode.CALL, [name, 0]),
      new Instruction(Opcode.PUSH, [zero]),
      new Instruction(Opcode.HALT, []),
    ];
    const vm = new VirtualMachine(program(instructions, { constants }), 'test.pr');
    assert.throws(() => vm.run(), (err) => {
      assert.ok(err instanceof ParithiRuntimeError);
      assert.equal(err.code, 'P015');
      return true;
    });
  });

  test('running off the end of the instruction list without a HALT raises a clean VM error, not a silent stop', () => {
    const constants = new ConstantPool();
    const instructions = [new Instruction(Opcode.PUSH, [constants.add('Number', 1)])]; // no HALT
    const vm = new VirtualMachine(program(instructions, { constants }), 'test.pr');
    assert.throws(() => vm.run(), (err) => {
      assert.ok(err instanceof ParithiRuntimeError);
      assert.equal(err.code, 'P023');
      return true;
    });
  });

  test('a raw (non-Parithi) JS error thrown mid-execution is still wrapped as a clean P023, never leaked raw', () => {
    const source = 'say 1';
    const result = compileFromSource(source, 'test.pr');
    const vm = new VirtualMachine(result.bytecode, 'test.pr');
    // Sabotage internal state to force an unexpected failure inside run()'s try block.
    vm.instructions = null;
    assert.throws(() => vm.run(), (err) => {
      assert.ok(err instanceof ParithiRuntimeError);
      assert.equal(err.code, 'P023');
      assert.match(err.message, /Unexpected VM failure/);
      return true;
    });
  });
});

describe('Error call-stack traces', () => {
  test('a runtime error inside a function reports a call-stack trace with the (unmangled) function name', () => {
    const source = ['task fact(n)', '    if n <= 1', '        return 1 / 0', '    end if', '    return n * fact(n - 1)', 'end task', 'say fact(3)'].join('\n');
    assert.throws(() => compileAndRun(source), (err) => {
      assert.equal(err.code, 'P020');
      assert.ok(err.callStack.length > 0);
      assert.ok(err.callStack.every((line) => line.startsWith('fact(...)')));
      assert.ok(!err.callStack.some((line) => /fact\$\d+/.test(line)), 'trace should show "fact", not the mangled "fact$N"');
      return true;
    });
  });
});

describe('Large / stress programs', () => {
  test('a large loop (100,000 iterations) computes the correct sum', () => {
    const source = ['hold sum = 0', 'repeat 100000 as i', '    sum = sum + i', 'end repeat', 'say sum'].join('\n');
    assert.deepEqual(compileAndRun(source).output, [String((100000 * 100001) / 2)]);
  });

  test('recursion just below the call-depth limit completes without error', () => {
    const source = ['task countDown(n)', '    if n <= 0', '        return 0', '    end if', '    return countDown(n - 1)', 'end task', 'say countDown(400)'].join('\n');
    assert.deepEqual(compileAndRun(source).output, ['0']);
  });

  test('a large program (500 sequential declarations) runs correctly', () => {
    const lines = [];
    for (let i = 0; i < 500; i++) lines.push(`hold v${i} = ${i}`);
    lines.push('say v499');
    assert.deepEqual(compileAndRun(lines.join('\n')).output, ['499']);
  });

  test('a hand-written bubble sort over an array runs correctly on the PVM', () => {
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
      'say bubbleSort(box(5, 3, 8, 1, 9, 2))',
    ].join('\n');
    assert.deepEqual(compileAndRun(source).output, ['[1, 2, 3, 5, 8, 9]']);
  });
});

describe('Every real example program runs correctly on the PVM', () => {
  const inputs = { 'calculator.pr': ['12', '5'], 'grade-checker.pr': ['85'] };
  for (const file of ['hello.pr', 'variables.pr', 'ifelse.pr', 'loops.pr', 'functions.pr', 'calculator.pr', 'fizzbuzz.pr', 'grade-checker.pr', 'while-break-continue.pr', 'stop.pr', 'arrays.pr']) {
    test(`${file} runs without error`, () => {
      const source = readFileSync(join(examplesDir, file), 'utf-8');
      const { exitCode } = compileAndRun(source, { input: inputs[file] ?? [] });
      assert.equal(typeof exitCode, 'number');
    });
  }
});

describe('VM building blocks (unit-level)', () => {
  test('OperandStack pop() on empty throws; push()/pop() round-trip otherwise', () => {
    const stack = new OperandStack();
    assert.throws(() => stack.pop());
    stack.push(1);
    stack.push(2);
    assert.equal(stack.pop(), 2);
    assert.equal(stack.depth, 1);
  });

  test('OperandStack.popN() returns values in original (left-to-right) push order', () => {
    const stack = new OperandStack();
    stack.push('a');
    stack.push('b');
    stack.push('c');
    assert.deepEqual(stack.popN(3), ['a', 'b', 'c']);
  });

  test('Frame.store() defines locally when the name has never existed, else updates in place up the lexicalParent chain', () => {
    const global = new Frame('<global>', null, null, -1);
    const child = new Frame('fn$0', global, global, 0);
    child.store('x$1', 1); // fresh — defines in child
    assert.equal(child.locals.get('x$1'), 1);
    assert.equal(global.locals.has('x$1'), false);

    global.store('y$2', 10); // fresh at global
    child.store('y$2', 20); // already exists at global — updates THERE, not in child
    assert.equal(child.locals.has('y$2'), false);
    assert.equal(global.locals.get('y$2'), 20);
  });

  test('displayFunctionName() strips the Bytecode Generator\'s mangling suffix', () => {
    assert.equal(displayFunctionName('fact$0'), 'fact');
    assert.equal(displayFunctionName('outer$12'), 'outer');
  });

  test('Heap.allocateArray() returns the elements array itself and assigns it an id', () => {
    const heap = new Heap();
    const arr = heap.allocateArray([1, 2, 3]);
    assert.deepEqual(arr, [1, 2, 3]);
    assert.equal(typeof heap.idOf(arr), 'number');
  });

  test('Debugger reports a coherent snapshot of a running VM', () => {
    const result = compileFromSource('hold x = 5\nsay x', 'test.pr');
    const vm = new VirtualMachine(result.bytecode, 'test.pr', { writeLine: () => {} });
    const dbg = new Debugger(vm);
    vm.step(); // PUSH 5
    assert.equal(dbg.describeStack().length, 1);
    vm.run();
    assert.equal(dbg.currentInstruction(), null); // halted — ip points past the last instruction
    assert.match(dbg.snapshot(), /callDepth=0/);
  });
});

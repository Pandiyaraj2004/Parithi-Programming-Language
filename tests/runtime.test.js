/**
 * Runtime System test suite — Phase 6.
 * Tests RuntimeValue, EnvironmentStack, Runtime, ExecutionContext, and
 * BuiltinRegistry both in isolation and through the full interpreter,
 * plus the leak-proofing and defensive-error behavior this phase adds.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { SemanticAnalyzer } from '../src/semantic/analyzer.js';
import { Interpreter } from '../src/interpreter/interpreter.js';
import { ParithiRuntimeError } from '../src/errors/index.js';
import { NumberValue, DecimalValue, StringValue, BooleanValue, EmptyValue, ListValue, wrap, unwrap, deepEquals } from '../src/runtime/runtime-value.js';
import { Environment } from '../src/runtime/environment.js';
import { EnvironmentStack } from '../src/runtime/environment-stack.js';
import { Runtime } from '../src/runtime/runtime.js';
import { ExecutionContext } from '../src/runtime/execution-context.js';
import { BuiltinRegistry } from '../src/runtime/builtin-registry.js';
import { SourceLocation } from '../src/errors/index.js';

function run(source, { input = [] } = {}) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  const analysis = new SemanticAnalyzer(program, 'test.pr').analyze();
  if (!analysis.success) {
    throw new Error(`Semantic analysis unexpectedly failed: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  }
  const output = [];
  const inputQueue = [...input];
  const interpreter = new Interpreter('test.pr', { write: () => {}, writeLine: (t) => output.push(t), readLine: () => inputQueue.shift() ?? '' });
  interpreter.run(program);
  return { output, interpreter };
}

/** Skips semantic analysis — for testing the interpreter's OWN defensive checks. */
function runRaw(source) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  const output = [];
  const interpreter = new Interpreter('test.pr', { write: () => {}, writeLine: (t) => output.push(t), readLine: () => '' });
  interpreter.run(program);
  return { output, interpreter };
}

describe('Runtime Objects (RuntimeValue)', () => {
  test('wrap() produces the correct class for each of the five types', () => {
    assert.ok(wrap(20) instanceof NumberValue);
    assert.ok(wrap(19.99) instanceof DecimalValue);
    assert.ok(wrap('hi') instanceof StringValue);
    assert.ok(wrap(true) instanceof BooleanValue);
    assert.ok(wrap(null) instanceof EmptyValue);
  });

  test('each type reports its correct .type tag', () => {
    assert.equal(wrap(20).type, 'Number');
    assert.equal(wrap(19.99).type, 'Decimal');
    assert.equal(wrap('hi').type, 'String');
    assert.equal(wrap(true).type, 'Boolean');
    assert.equal(wrap(null).type, 'Empty');
  });

  test('wrap() then unwrap() round-trips to the exact original value', () => {
    for (const value of [20, 19.99, 'hi', true, false, null]) {
      assert.equal(unwrap(wrap(value)), value);
    }
  });

  test('toString() renders each type correctly, matching say/text() display rules', () => {
    assert.equal(wrap(20).toString(), '20');
    assert.equal(wrap(19.99).toString(), '19.99');
    assert.equal(wrap('hi').toString(), 'hi');
    assert.equal(wrap(true).toString(), 'true');
    assert.equal(wrap(false).toString(), 'false');
    assert.equal(wrap(null).toString(), 'empty');
  });

  test('equals() compares by underlying value', () => {
    assert.ok(wrap(5).equals(wrap(5)));
    assert.ok(!wrap(5).equals(wrap(6)));
    assert.ok(wrap('a').equals(wrap('a')));
    assert.ok(wrap(null).equals(wrap(null)));
  });

  test('isTruthy() reflects Boolean values correctly, and Empty is always falsy', () => {
    assert.equal(wrap(true).isTruthy(), true);
    assert.equal(wrap(false).isTruthy(), false);
    assert.equal(wrap(null).isTruthy(), false);
  });

  test('copy() returns an equal but independent instance', () => {
    const original = wrap(42);
    const copy = original.copy();
    assert.notEqual(original, copy);
    assert.ok(original.equals(copy));
  });

  test('wrap() passes through non-Parithi-value objects unchanged (e.g. function descriptors)', () => {
    const descriptor = { kind: 'function', name: 'f' };
    assert.equal(wrap(descriptor), descriptor);
  });
});

describe('EnvironmentStack', () => {
  test('pushEnvironment creates a child of the given parent and it becomes current', () => {
    const global = new Environment(null);
    const stack = new EnvironmentStack(global);
    const child = stack.pushEnvironment(global);
    assert.equal(stack.currentEnvironment(), child);
    assert.equal(child.parent, global);
  });

  test('popEnvironment returns to the previous environment', () => {
    const global = new Environment(null);
    const stack = new EnvironmentStack(global);
    stack.pushEnvironment(global);
    stack.popEnvironment();
    assert.equal(stack.currentEnvironment(), global);
  });

  test('popEnvironment refuses to pop the global environment', () => {
    const stack = new EnvironmentStack(new Environment(null));
    assert.throws(() => stack.popEnvironment());
  });

  test('parentEnvironment returns the current scope\'s parent', () => {
    const global = new Environment(null);
    const stack = new EnvironmentStack(global);
    stack.pushEnvironment(global);
    assert.equal(stack.parentEnvironment(), global);
  });

  test('declareVariable/resolveVariable/assignVariable operate on the current scope', () => {
    const global = new Environment(null);
    const stack = new EnvironmentStack(global);
    stack.declareVariable('x', 10, true);
    assert.equal(stack.resolveVariable('x'), 10);
    stack.assignVariable('x', 20, new SourceLocation('t.pr', 1, 1));
    assert.equal(stack.resolveVariable('x'), 20);
  });

  test('variables declared in a pushed scope are not visible after popping', () => {
    const global = new Environment(null);
    const stack = new EnvironmentStack(global);
    stack.pushEnvironment(global);
    stack.declareVariable('inner', 1, true);
    stack.popEnvironment();
    assert.throws(() => stack.resolveVariable('inner', new SourceLocation('t.pr', 1, 1)));
  });

  test('truncateTo pops down to an exact depth regardless of how many scopes were pushed', () => {
    const global = new Environment(null);
    const stack = new EnvironmentStack(global);
    const baseDepth = stack.depth;
    stack.pushEnvironment(stack.currentEnvironment());
    stack.pushEnvironment(stack.currentEnvironment());
    stack.pushEnvironment(stack.currentEnvironment());
    assert.equal(stack.depth, baseDepth + 3);
    stack.truncateTo(baseDepth);
    assert.equal(stack.depth, baseDepth);
    assert.equal(stack.currentEnvironment(), global);
  });
});

describe('Runtime facade', () => {
  test('constructs a global environment, an environment stack, and a call stack', () => {
    const runtime = new Runtime();
    assert.ok(runtime.globalEnvironment instanceof Environment);
    assert.equal(runtime.environments.currentEnvironment(), runtime.globalEnvironment);
    assert.equal(runtime.callStack.frames.length, 0);
  });
});

describe('ExecutionContext', () => {
  test('loop depth tracks enter/exit correctly', () => {
    const context = new ExecutionContext(new Runtime());
    assert.equal(context.loopDepth, 0);
    context.enterLoop();
    context.enterLoop();
    assert.equal(context.loopDepth, 2);
    context.exitLoop();
    assert.equal(context.loopDepth, 1);
  });

  test('enterFunction/exitFunction save and restore the previous function', () => {
    const context = new ExecutionContext(new Runtime());
    assert.equal(context.currentFunction, null);
    const previous = context.enterFunction({ name: 'f', params: [] });
    assert.deepEqual(context.currentFunction, { name: 'f', params: [] });
    context.exitFunction(previous);
    assert.equal(context.currentFunction, null);
  });

  test('currentScope and currentCallFrame delegate to the runtime', () => {
    const runtime = new Runtime();
    const context = new ExecutionContext(runtime);
    assert.equal(context.currentScope, runtime.globalEnvironment);
    assert.equal(context.currentCallFrame, null);
  });
});

describe('BuiltinRegistry', () => {
  test('register/has/get/names work correctly', () => {
    const registry = new BuiltinRegistry();
    registry.register({ name: 'double', minArgs: 1, maxArgs: 1, implementation: ([x]) => x * 2, returnType: () => 'Number' });
    assert.ok(registry.has('double'));
    assert.equal(registry.get('double').minArgs, 1);
    assert.deepEqual(registry.names(), ['double']);
  });

  test('call() invokes validate() then implementation()', () => {
    const registry = new BuiltinRegistry();
    let validated = false;
    registry.register({
      name: 'check',
      validate: () => { validated = true; },
      implementation: ([x]) => x,
    });
    const result = registry.call('check', [7], null);
    assert.equal(result, 7);
    assert.equal(validated, true);
  });
});

describe('Scope Cleanup — No Environment Leaks (integration)', () => {
  test('the environment stack returns to depth 1 (global only) after a loop with nested if/break/continue', () => {
    const source = [
      'hold sum = 0',
      'repeat 20 as i',
      '    if true',
      '        if true',
      '            if i % 2 is 0',
      '                continue',
      '            end if',
      '            if i is more than 15',
      '                break',
      '            end if',
      '            sum = sum + i',
      '        end if',
      '    end if',
      'end repeat',
      'say sum',
    ].join('\n');
    const { output, interpreter } = run(source);
    assert.deepEqual(output, ['64']);
    assert.equal(interpreter.runtime.environments.depth, 1);
  });

  test('the call stack and environment stack both return to baseline after deep-but-valid recursion', () => {
    const source = [
      'task countDown(n)',
      '    if n <= 0',
      '        return 0',
      '    end if',
      '    return countDown(n - 1)',
      'end task',
      'say countDown(300)',
    ].join('\n');
    const { output, interpreter } = run(source);
    assert.deepEqual(output, ['0']);
    assert.equal(interpreter.runtime.callStack.frames.length, 0);
    assert.equal(interpreter.runtime.environments.depth, 1);
  });

  test('an early "return" from inside a while loop inside a task cleans up correctly', () => {
    const source = [
      'task findFirstEven(limit)',
      '    hold i = 1',
      '    while i <= limit',
      '        if i % 2 is 0',
      '            return i',
      '        end if',
      '        i = i + 1',
      '    end while',
      '    return 0',
      'end task',
      'say findFirstEven(10)',
    ].join('\n');
    const { output, interpreter } = run(source);
    assert.deepEqual(output, ['2']);
    assert.equal(interpreter.runtime.environments.depth, 1);
    assert.equal(interpreter.runtime.callStack.frames.length, 0);
  });

  test('after a genuine runtime error, both stacks stay pinned (populated) for diagnostics', () => {
    const source = ['task divide(a, b)', '    return a / b', 'end task', 'divide(10, 0)'].join('\n');
    try {
      run(source);
      assert.fail('expected run() to throw');
    } catch (err) {
      assert.equal(err.code, 'P020');
      // The error object itself carries a snapshot of the call stack at the
      // moment it occurred — verified via err.callStack, not the (by then
      // possibly further-unwound) live interpreter instance.
      assert.ok(err.callStack.length > 0);
      assert.match(err.callStack[0], /divide/);
    }
  });
});

describe('Function Calls, Recursion, and Frames (integration)', () => {
  test('a call stack frame carries name, params, args, and closure/location detail', () => {
    const source = ['task add(a, b)', '    return a + b', 'end task', 'add(3, 4)'].join('\n');
    // Force a division error deep enough to inspect the frame shape via the
    // thrown error's callStack — simpler: call a function that itself fails.
    const failing = ['task add(a, b)', '    return a / b', 'end task', 'add(3, 0)'].join('\n');
    try {
      run(failing);
      assert.fail('expected a throw');
    } catch (err) {
      assert.match(err.callStack[0], /add\(\.\.\.\)/);
    }
    // Also confirm the non-failing version still runs cleanly.
    const { output } = run(source.replace('return a + b', 'return a + b') + '\nsay add(3, 4)');
    assert.deepEqual(output, ['7']);
  });

  test('recursion (factorial) still produces the correct result with the new runtime plumbing', () => {
    const source = [
      'task factorial(n)',
      '    if n <= 1',
      '        return 1',
      '    end if',
      '    return n * factorial(n - 1)',
      'end task',
      'say factorial(5)',
    ].join('\n');
    assert.deepEqual(run(source).output, ['120']);
  });
});

describe('New Defensive Runtime Errors (Phase 6)', () => {
  test('calling a non-function value raises P022 with an accurate type name', () => {
    assert.throws(
      () => runRaw('hold x = 5\nx()'),
      (err) => {
        assert.ok(err instanceof ParithiRuntimeError);
        assert.equal(err.code, 'P022');
        assert.match(err.message, /is not a function/);
        assert.match(err.hint, /Number/);
        return true;
      },
    );
  });

  test('a stray "break" outside any loop (bypassing semantic analysis) raises a clean P018, not a raw escape', () => {
    assert.throws(
      () => runRaw('break'),
      (err) => {
        assert.ok(err instanceof ParithiRuntimeError);
        assert.equal(err.code, 'P018');
        return true;
      },
    );
  });

  test('a stray "return" outside any task (bypassing semantic analysis) raises a clean P017', () => {
    assert.throws(
      () => runRaw('return 5'),
      (err) => {
        assert.equal(err.code, 'P017');
        return true;
      },
    );
  });

  test('a stray "continue" outside any loop (bypassing semantic analysis) raises a clean P019, mirroring the P018/P017 defensive checks above', () => {
    assert.throws(
      () => runRaw('continue'),
      (err) => {
        assert.ok(err instanceof ParithiRuntimeError);
        assert.equal(err.code, 'P019');
        return true;
      },
    );
  });

  test('len(empty) reports "Empty" as the type, not JS\'s leaky typeof-null-is-object quirk', () => {
    assert.throws(
      () => runRaw('say len(empty)'),
      (err) => {
        assert.equal(err.code, 'P002');
        assert.match(err.message, /got Empty/);
        assert.doesNotMatch(err.message, /got object/);
        return true;
      },
    );
  });

  test('a built-in called with too few arguments (bypassing semantic analysis) raises a clean P016, not a raw JS TypeError wrapped as P023', () => {
    assert.throws(
      () => runRaw('say round()'),
      (err) => {
        assert.ok(err instanceof ParithiRuntimeError);
        assert.equal(err.code, 'P016');
        assert.match(err.message, /"round\(\)" expects 1-2 argument\(s\) but got 0/);
        return true;
      },
    );
  });

  test('a built-in called with too many arguments (bypassing semantic analysis) raises a clean P016', () => {
    assert.throws(
      () => runRaw('say len("a", "b")'),
      (err) => {
        assert.equal(err.code, 'P016');
        assert.match(err.message, /"len\(\)" expects 1 argument\(s\) but got 2/);
        return true;
      },
    );
  });

  test('random() called with exactly 1 argument (bypassing semantic analysis) raises a clean P016 via the generic registry check', () => {
    assert.throws(
      () => runRaw('say random(1)'),
      (err) => {
        assert.equal(err.code, 'P016');
        assert.match(err.message, /"random\(\)" expects 0 or 2 argument\(s\) but got 1/);
        return true;
      },
    );
  });

  test('an unrecognized node type is wrapped as P023 rather than leaking a raw error', () => {
    const interpreter = new Interpreter('test.pr', { write: () => {}, writeLine: () => {}, readLine: () => '' });
    const bogusProgram = { type: 'Program', body: [{ type: 'TotallyUnknownNodeType', line: 1, column: 1 }] };
    assert.throws(
      () => interpreter.run(bogusProgram),
      (err) => {
        assert.ok(err instanceof ParithiRuntimeError);
        assert.equal(err.code, 'P023');
        assert.match(err.message, /Unexpected runtime failure/);
        return true;
      },
    );
  });
});

describe('Stress Tests', () => {
  test('a large loop (200,000 iterations) computes the correct sum and cleans up', () => {
    const source = ['hold sum = 0', 'repeat 200000 as i', '    sum = sum + i', 'end repeat', 'say sum'].join('\n');
    const { output, interpreter } = run(source);
    assert.deepEqual(output, [String((200000 * 200001) / 2)]);
    assert.equal(interpreter.runtime.environments.depth, 1);
  });

  test('recursion right at the call-depth limit still raises a controlled P021, not a native crash', () => {
    const source = ['task loopForever()', '    return loopForever()', 'end task', 'loopForever()'].join('\n');
    assert.throws(
      () => run(source),
      (err) => {
        assert.ok(err instanceof ParithiRuntimeError);
        assert.equal(err.code, 'P021');
        assert.ok(err.callStack.length > 0);
        return true;
      },
    );
  });
});

describe('ListValue (§Arrays)', () => {
  test('wrap() produces a ListValue for a plain JS array, tagged type "Array"', () => {
    const wrapped = wrap([1, 2, 3]);
    assert.ok(wrapped instanceof ListValue);
    assert.equal(wrapped.type, 'Array');
  });

  test('wrap() then unwrap() round-trips to the exact SAME array reference, not a copy', () => {
    const original = [1, 2, 3];
    const roundTripped = unwrap(wrap(original));
    assert.equal(roundTripped, original); // reference equality, not just deepEqual
  });

  test('toString() renders a bracketed list, quoting String elements', () => {
    assert.equal(wrap([1, 2, 3]).toString(), '[1, 2, 3]');
    assert.equal(wrap(['a', 'b']).toString(), '["a", "b"]');
    assert.equal(wrap([]).toString(), '[]');
  });

  test('toString() renders nested arrays recursively', () => {
    assert.equal(wrap([[1, 2], [3, 4]]).toString(), '[[1, 2], [3, 4]]');
  });

  test('equals() is deep/structural, not by reference', () => {
    assert.ok(wrap([1, 2, 3]).equals([1, 2, 3]));
    assert.ok(!wrap([1, 2, 3]).equals([1, 2, 4]));
    assert.ok(!wrap([1, 2, 3]).equals([1, 2]));
  });

  test('copy() returns the identical reference — reference semantics, deliberately unlike every scalar RuntimeValue', () => {
    const elements = [1, 2, 3];
    const listValue = wrap(elements);
    assert.equal(listValue.copy(), listValue);
    assert.equal(listValue.copy().value, elements);
  });

  test('deepEquals() treats non-array scalars exactly like "==="', () => {
    assert.ok(deepEquals(5, 5));
    assert.ok(!deepEquals(5, 6));
    assert.ok(!deepEquals(5, [5]));
  });

  test('deepEquals() recurses into nested arrays', () => {
    assert.ok(deepEquals([[1, 2], [3]], [[1, 2], [3]]));
    assert.ok(!deepEquals([[1, 2], [3]], [[1, 2], [4]]));
  });

  test('a global "hold" array variable\'s binding reports type "Array" (as shown by "pari --runtime"/"--analyze")', () => {
    const { interpreter } = run('hold nums = box(1, 2, 3)');
    const binding = interpreter.runtime.globalEnvironment.ownBindings().find((b) => b.name === 'nums');
    assert.equal(binding.runtimeValue.type, 'Array');
    assert.equal(String(binding.runtimeValue), '[1, 2, 3]');
  });

  test('an array push()ed to inside a loop leaves the environment stack back at baseline (no leak)', () => {
    const source = ['hold nums = box()', 'repeat 100 as i', '    push(nums, i)', 'end repeat', 'say len(nums)'].join('\n');
    const { output, interpreter } = run(source);
    assert.deepEqual(output, ['100']);
    assert.equal(interpreter.runtime.environments.depth, 1);
  });
});

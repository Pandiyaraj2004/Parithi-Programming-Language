/**
 * Bytecode Optimizer suite — Phase 12 (MASTER_DOCUMENT.md §31).
 * Three kinds of coverage, matching the Phase 12 brief's own testing
 * section:
 *
 *   1. Each pass tested independently (constructed programs, asserting the
 *      exact transformation a pass claims to make — and, just as
 *      importantly, what it deliberately does NOT touch: div-by-zero,
 *      array declarations, side-effecting opcodes before POP).
 *   2. `PassManager`'s own safety net — a deliberately corrupting fake pass
 *      must be rejected with an `OptimizerError`, never silently emitted.
 *   3. A parity regression suite — the same "run both backends, assert
 *      identical output/exit/error code" method `tests/vm-parity.test.js`
 *      already established for Phase 11, except the PVM side now runs
 *      *optimized* bytecode. Proves the optimizer's own stated goal
 *      ("never change program behavior") the same mechanical way, for
 *      every construct the brief names: nested loops, recursion,
 *      choose/option/other, arrays, `stop`, built-ins, functions returning
 *      values, runtime errors, every real example program, and a
 *      10,000+ instruction program.
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
import { Opcode } from '../src/bytecode/opcode.js';
import { ConstantType, ConstantPool } from '../src/bytecode/constant-pool.js';
import { Instruction } from '../src/bytecode/instruction.js';
import { generateBytecode, validateBytecode } from '../src/bytecode/index.js';

import { optimizeBytecode, DEFAULT_PASSES } from '../src/optimizer/optimizer.js';
import { PassManager } from '../src/optimizer/pass-manager.js';
import { OptimizerError } from '../src/optimizer/optimizer-error.js';
import { computeStatistics } from '../src/optimizer/statistics.js';
import { formatOptimizerReport } from '../src/optimizer/optimizer-report.js';
import * as ConstantFolding from '../src/optimizer/passes/constant-folding.js';
import * as ConstantPropagation from '../src/optimizer/passes/constant-propagation.js';
import * as DeadCodeElimination from '../src/optimizer/passes/dead-code-elimination.js';
import * as JumpOptimization from '../src/optimizer/passes/jump-optimization.js';
import * as PeepholeOptimization from '../src/optimizer/passes/peephole-optimization.js';
import * as StackOptimization from '../src/optimizer/passes/stack-optimization.js';
import * as ConstantPoolOptimization from '../src/optimizer/passes/constant-pool-optimization.js';
import * as LabelCleanup from '../src/optimizer/passes/label-cleanup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, '..', 'examples');

function compile(source, filePath = '<test>') {
  const tokens = new Lexer(source, filePath).tokenize();
  const astProgram = new Parser(tokens, filePath).parseProgram();
  const analysis = new SemanticAnalyzer(astProgram, filePath).analyze();
  if (!analysis.success) {
    throw new Error(`semantic analysis unexpectedly failed: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  }
  return generateBytecode(astProgram);
}

function opcodesOf(program) {
  return program.instructions.map((instruction) => instruction.opcode);
}

// -----------------------------------------------------------------------
// Pass 1 — ConstantFolding
// -----------------------------------------------------------------------

describe('ConstantFolding (Pass 1)', () => {
  test('folds arithmetic, comparison, and unary logical/negation pairs', () => {
    const cases = [
      ['say 10 + 20', 30],
      ['say 10 - 3', 7],
      ['say 4 * 5', 20],
      ['say 10 / 2', 5],
      ['say 10 % 3', 1],
      ['say 2 ** 3', 8],
      ['say 3 > 2', true],
      ['say 3 < 2', false],
      ['say 3 == 3', true],
      ['say 3 != 3', false],
      ['say not true', false],
      ['say -5', -5],
    ];
    for (const [source, expected] of cases) {
      const bytecode = compile(source);
      const folded = ConstantFolding.run(bytecode);
      const printIndex = folded.instructions.findIndex((i) => i.opcode === Opcode.PRINT);
      const pushed = folded.instructions[printIndex - 1];
      assert.equal(pushed.opcode, Opcode.PUSH, `expected a single folded PUSH before PRINT for "${source}"`);
      assert.equal(folded.constants.get(pushed.operands[0]).value, expected, `wrong folded value for "${source}"`);
    }
  });

  test('folds String + String concatenation', () => {
    const bytecode = compile('say "a" + "b"');
    const folded = ConstantFolding.run(bytecode);
    const push = folded.instructions.find((i) => i.opcode === Opcode.PUSH && folded.constants.get(i.operands[0]).type === ConstantType.STRING);
    assert.equal(folded.constants.get(push.operands[0]).value, 'ab');
  });

  test('promotes the folded type to Decimal only when an operand was Decimal', () => {
    const bothNumber = ConstantFolding.run(compile('say 2 + 3'));
    const oneDecimal = ConstantFolding.run(compile('say 2 + 3.0'));
    const pushOf = (program) => program.instructions.find((i) => i.opcode === Opcode.PUSH && program.constants.get(i.operands[0]).value === 5);
    assert.equal(bothNumber.constants.get(pushOf(bothNumber).operands[0]).type, ConstantType.NUMBER);
    assert.equal(oneDecimal.constants.get(pushOf(oneDecimal).operands[0]).type, ConstantType.DECIMAL);
  });

  test('never folds division or modulo by a constant zero — preserves the runtime P020 error site', () => {
    const divByZero = compile('say 1 / 0');
    assert.equal(ConstantFolding.run(divByZero), divByZero);
    const modByZero = compile('say 1 % 0');
    assert.equal(ConstantFolding.run(modByZero), modByZero);
  });

  test('fully folds a chain (2 + 3 + 4) within this pass alone, independent of any other pass', () => {
    const bytecode = compile('say 2 + 3 + 4');
    const folded = ConstantFolding.run(bytecode);
    const pushes = folded.instructions.filter((i) => i.opcode === Opcode.PUSH);
    // Exactly two PUSHes survive: the one folded value feeding PRINT, and
    // the trailing "PUSH 0" every program ends with for a normal HALT.
    assert.equal(pushes.length, 2);
    assert.equal(folded.constants.get(pushes[0].operands[0]).value, 9);
  });

  test('leaves a program with nothing to fold completely unchanged (same reference)', () => {
    const bytecode = compile('hold x = 1\nx = x + 1\nsay x');
    assert.equal(ConstantFolding.run(bytecode), bytecode);
  });
});

// -----------------------------------------------------------------------
// Pass 2 — ConstantPropagation
// -----------------------------------------------------------------------

describe('ConstantPropagation (Pass 2)', () => {
  test('propagates a const with a literal initializer and removes the now-dead declaration', () => {
    const bytecode = compile('const PI = 3.14\nsay PI');
    const optimized = ConstantPropagation.run(bytecode);
    assert.equal(optimized.instructions.some((i) => i.opcode === Opcode.STORE), false);
    assert.equal(optimized.instructions.some((i) => i.opcode === Opcode.LOAD), false);
    const push = optimized.instructions.find((i) => i.opcode === Opcode.PUSH && optimized.constants.get(i.operands[0]).type === ConstantType.DECIMAL);
    assert.equal(optimized.constants.get(push.operands[0]).value, 3.14);
  });

  test('also propagates a "hold" that happens to never be reassigned (safe generalization of const-only)', () => {
    const bytecode = compile('hold x = 42\nsay x');
    const optimized = ConstantPropagation.run(bytecode);
    assert.equal(optimized.instructions.some((i) => i.opcode === Opcode.STORE), false);
    assert.equal(optimized.instructions.some((i) => i.opcode === Opcode.LOAD), false);
  });

  test('does NOT propagate a "hold" that is reassigned', () => {
    const bytecode = compile('hold x = 1\nx = 2\nsay x');
    assert.equal(ConstantPropagation.run(bytecode), bytecode);
  });

  test('does NOT propagate an array-valued declaration (ARRAY_NEW, not a literal PUSH, precedes STORE)', () => {
    const bytecode = compile('hold arr = box(1, 2, 3)\nsay arr[0]');
    assert.equal(ConstantPropagation.run(bytecode), bytecode);
  });

  test('does NOT touch a function parameter (bound by CALL, never STOREd)', () => {
    const bytecode = compile('task identity(n)\n    return n\nend task\nsay identity(5)');
    const optimized = ConstantPropagation.run(bytecode);
    // The parameter's LOAD inside the function body must survive verbatim —
    // there is no STORE for it anywhere to make it "eligible."
    const functionEntry = optimized.functions[0].entryIndex;
    assert.equal(optimized.instructions[functionEntry].opcode, Opcode.LOAD);
  });
});

// -----------------------------------------------------------------------
// Pass 3 — DeadCodeElimination
// -----------------------------------------------------------------------

describe('DeadCodeElimination (Pass 3)', () => {
  test('removes instructions after RETURN when nothing jumps back into them', () => {
    const pool = new ConstantPool();
    const c5 = pool.add(ConstantType.NUMBER, 5);
    const program = {
      instructions: [new Instruction(Opcode.RETURN), new Instruction(Opcode.PUSH, [c5]), new Instruction(Opcode.PRINT, [1])],
      constants: pool,
      functions: [],
    };
    const optimized = DeadCodeElimination.run(program);
    assert.deepEqual(opcodesOf(optimized), [Opcode.RETURN]);
  });

  test('keeps code that is the target of a jump, even though it directly follows an unconditional JMP', () => {
    const pool = new ConstantPool();
    const c1 = pool.add(ConstantType.NUMBER, 1);
    const c2 = pool.add(ConstantType.NUMBER, 2);
    const c3 = pool.add(ConstantType.NUMBER, 3);
    const program = {
      instructions: [
        new Instruction(Opcode.JMP, [3]), // 0
        new Instruction(Opcode.PUSH, [c1]), // 1 - unreachable
        new Instruction(Opcode.PUSH, [c2]), // 2 - unreachable
        new Instruction(Opcode.PUSH, [c3]), // 3 - JMP target, must survive
        new Instruction(Opcode.HALT), // 4
      ],
      constants: pool,
      functions: [],
    };
    const optimized = DeadCodeElimination.run(program);
    assert.equal(optimized.instructions.length, 3);
    assert.deepEqual(opcodesOf(optimized), [Opcode.JMP, Opcode.PUSH, Opcode.HALT]);
    assert.equal(optimized.instructions[0].operands[0], 1); // remapped to PUSH's new position
    assert.equal(optimized.constants.get(optimized.instructions[1].operands[0]).value, 3);
  });

  test('leaves a program with no unreachable code unchanged (same reference)', () => {
    const bytecode = compile('say 1\nsay 2');
    assert.equal(DeadCodeElimination.run(bytecode), bytecode);
  });
});

// -----------------------------------------------------------------------
// Pass 4 — JumpOptimization
// -----------------------------------------------------------------------

describe('JumpOptimization (Pass 4)', () => {
  test('collapses a JMP-to-JMP chain to point directly at the final target', () => {
    const program = {
      instructions: [
        new Instruction(Opcode.JMP, [1]), // 0: JMP L1
        new Instruction(Opcode.JMP, [2]), // 1: L1: JMP L2 (also becomes jump-to-next once index0 skips it)
        new Instruction(Opcode.HALT), // 2: L2
      ],
      constants: new ConstantPool(),
      functions: [],
    };
    const optimized = JumpOptimization.run(program);
    assert.deepEqual(opcodesOf(optimized), [Opcode.JMP, Opcode.HALT]);
    assert.equal(optimized.instructions[0].operands[0], 1); // points straight at HALT's new position
  });

  test('removes an unconditional JMP whose target is exactly the next instruction', () => {
    const pool = new ConstantPool();
    const c1 = pool.add(ConstantType.NUMBER, 1);
    const program = {
      instructions: [
        new Instruction(Opcode.PUSH, [c1]), // 0
        new Instruction(Opcode.JMP, [2]), // 1: jumps to the very next instruction — a no-op
        new Instruction(Opcode.HALT), // 2
      ],
      constants: pool,
      functions: [],
    };
    const optimized = JumpOptimization.run(program);
    assert.deepEqual(opcodesOf(optimized), [Opcode.PUSH, Opcode.HALT]);
  });

  test('does NOT remove a conditional jump whose target is the next instruction (it must still pop the tested value)', () => {
    const program = {
      instructions: [
        new Instruction(Opcode.JMP_IF_FALSE, [1]), // 0: still must pop, even though target === index+1
        new Instruction(Opcode.HALT), // 1
      ],
      constants: new ConstantPool(),
      functions: [],
    };
    assert.equal(JumpOptimization.run(program), program);
  });

  test('leaves a program with no jump-chain or jump-to-next opportunity unchanged (same reference)', () => {
    const bytecode = compile('if true\n    say "a"\nend if');
    // Note: real Generator output already avoids these patterns by
    // construction, so this exercises the pass's own no-op fast path.
    const optimized = JumpOptimization.run(bytecode);
    assert.deepEqual(opcodesOf(optimized), opcodesOf(bytecode));
  });
});

// -----------------------------------------------------------------------
// Pass 5 — PeepholeOptimization
// -----------------------------------------------------------------------

describe('PeepholeOptimization (Pass 5)', () => {
  test('removes a LOAD x; STORE x no-op pair', () => {
    const pool = new ConstantPool();
    const slot = pool.addName('x$0');
    const program = {
      instructions: [new Instruction(Opcode.LOAD, [slot]), new Instruction(Opcode.STORE, [slot]), new Instruction(Opcode.HALT)],
      constants: pool,
      functions: [],
    };
    const optimized = PeepholeOptimization.run(program);
    assert.deepEqual(opcodesOf(optimized), [Opcode.HALT]);
  });

  test('does not remove LOAD x; STORE y (different slots)', () => {
    const pool = new ConstantPool();
    const x = pool.addName('x$0');
    const y = pool.addName('y$1');
    const program = {
      instructions: [new Instruction(Opcode.LOAD, [x]), new Instruction(Opcode.STORE, [y]), new Instruction(Opcode.HALT)],
      constants: pool,
      functions: [],
    };
    assert.equal(PeepholeOptimization.run(program), program);
  });

  test('folds a PUSH, PUSH, <OP> triple exposed directly (same rule as ConstantFolding)', () => {
    const pool = new ConstantPool();
    const c3 = pool.add(ConstantType.NUMBER, 3);
    const c4 = pool.add(ConstantType.NUMBER, 4);
    const program = {
      instructions: [new Instruction(Opcode.PUSH, [c3]), new Instruction(Opcode.PUSH, [c4]), new Instruction(Opcode.MUL), new Instruction(Opcode.HALT)],
      constants: pool,
      functions: [],
    };
    const optimized = PeepholeOptimization.run(program);
    assert.deepEqual(opcodesOf(optimized), [Opcode.PUSH, Opcode.HALT]);
    assert.equal(optimized.constants.get(optimized.instructions[0].operands[0]).value, 12);
  });

  test('finishes folding an adjacency that ConstantPropagation exposed but ConstantFolding (Pass 1) ran too early to see', () => {
    // Simulates exactly what happens mid-pipeline: "const PI = 3.14; area = PI * 10"
    // after Propagation has already turned "LOAD PI" into "PUSH 3.14".
    const pool = new ConstantPool();
    const c314 = pool.add(ConstantType.DECIMAL, 3.14);
    const c10 = pool.add(ConstantType.NUMBER, 10);
    const program = {
      instructions: [new Instruction(Opcode.PUSH, [c314]), new Instruction(Opcode.PUSH, [c10]), new Instruction(Opcode.MUL), new Instruction(Opcode.HALT)],
      constants: pool,
      functions: [],
    };
    const optimized = PeepholeOptimization.run(program);
    assert.deepEqual(opcodesOf(optimized), [Opcode.PUSH, Opcode.HALT]);
    assert.ok(Math.abs(optimized.constants.get(optimized.instructions[0].operands[0]).value - 31.4) < 1e-9);
  });
});

// -----------------------------------------------------------------------
// Pass 6 — StackOptimization
// -----------------------------------------------------------------------

describe('StackOptimization (Pass 6)', () => {
  test('removes PUSH;POP and LOAD;POP but never INPUT;POP or CALL;POP (side effects must still happen)', () => {
    const pool = new ConstantPool();
    const c1 = pool.add(ConstantType.NUMBER, 1);
    const prompt = pool.add(ConstantType.STRING, '?');
    const fnName = pool.addName('f$0');
    const program = {
      instructions: [
        new Instruction(Opcode.PUSH, [c1]), // 0
        new Instruction(Opcode.POP), // 1 -> (0,1) cancel
        new Instruction(Opcode.PUSH, [prompt]), // 2
        new Instruction(Opcode.INPUT), // 3
        new Instruction(Opcode.POP), // 4 -> INPUT;POP must NOT cancel
        new Instruction(Opcode.PUSH, [c1]), // 5
        new Instruction(Opcode.CALL, [fnName, 1]), // 6
        new Instruction(Opcode.POP), // 7 -> CALL;POP must NOT cancel
        new Instruction(Opcode.HALT), // 8
      ],
      constants: pool,
      functions: [{ name: 'f$0', paramSlots: ['p$1'], entryIndex: 8, isNested: false }],
    };
    const optimized = StackOptimization.run(program);
    assert.deepEqual(opcodesOf(optimized), [Opcode.PUSH, Opcode.INPUT, Opcode.POP, Opcode.PUSH, Opcode.CALL, Opcode.POP, Opcode.HALT]);
  });

  test('leaves a program with no cancelable pair unchanged (same reference)', () => {
    const bytecode = compile('say 1 + 2');
    assert.equal(StackOptimization.run(bytecode), bytecode);
  });
});

// -----------------------------------------------------------------------
// Pass 7 — ConstantPoolOptimization
// -----------------------------------------------------------------------

describe('ConstantPoolOptimization (Pass 7)', () => {
  test('drops unused pool entries and rewrites every surviving const-kind operand', () => {
    const pool = new ConstantPool();
    const used = pool.add(ConstantType.NUMBER, 42);
    pool.add(ConstantType.STRING, 'never referenced'); // orphaned on purpose
    const program = {
      instructions: [new Instruction(Opcode.PUSH, [used]), new Instruction(Opcode.HALT)],
      constants: pool,
      functions: [],
    };
    const optimized = ConstantPoolOptimization.run(program);
    assert.equal(optimized.constants.size, 1);
    assert.equal(optimized.constants.get(optimized.instructions[0].operands[0]).value, 42);
  });

  test('leaves an already-minimal pool unchanged (same reference)', () => {
    const bytecode = compile('say 1');
    assert.equal(ConstantPoolOptimization.run(bytecode), bytecode);
  });
});

// -----------------------------------------------------------------------
// Pass 8 — LabelCleanup
// -----------------------------------------------------------------------

describe('LabelCleanup (Pass 8)', () => {
  test('re-collapses a jump chain the same way JumpOptimization (Pass 4) would', () => {
    const program = {
      instructions: [new Instruction(Opcode.JMP, [1]), new Instruction(Opcode.JMP, [2]), new Instruction(Opcode.HALT)],
      constants: new ConstantPool(),
      functions: [],
    };
    const viaLabelCleanup = LabelCleanup.run(program);
    const viaJumpOptimization = JumpOptimization.run(program);
    assert.deepEqual(opcodesOf(viaLabelCleanup), opcodesOf(viaJumpOptimization));
    assert.deepEqual(viaLabelCleanup.instructions[0].operands, viaJumpOptimization.instructions[0].operands);
  });
});

// -----------------------------------------------------------------------
// PassManager — never emits invalid bytecode
// -----------------------------------------------------------------------

describe('PassManager validation', () => {
  test('rejects a pass that corrupts bytecode with a clear OptimizerError, never silently emitting it', () => {
    const pool = new ConstantPool();
    const c1 = pool.add(ConstantType.NUMBER, 1);
    const zero = pool.add(ConstantType.NUMBER, 0);
    const validProgram = {
      instructions: [new Instruction(Opcode.PUSH, [c1]), new Instruction(Opcode.PRINT, [1]), new Instruction(Opcode.PUSH, [zero]), new Instruction(Opcode.HALT)],
      constants: pool,
      functions: [],
    };
    assert.equal(validateBytecode(validProgram).valid, true);

    const brokenPass = {
      name: 'BrokenPass',
      run: (program) => ({
        ...program,
        instructions: program.instructions.map((instr, i) => (i === 0 ? new Instruction(instr.opcode, [9999], instr.line, instr.column) : instr)),
      }),
    };

    assert.throws(
      () => new PassManager([brokenPass]).run(validProgram),
      (err) => {
        assert.ok(err instanceof OptimizerError);
        assert.equal(err.passName, 'BrokenPass');
        assert.ok(err.errors.length > 0);
        return true;
      },
    );
  });

  test('optimizeBytecode() rejects an already-invalid input program up front', () => {
    const brokenInput = {
      instructions: [new Instruction(Opcode.PUSH, [9999]), new Instruction(Opcode.HALT)],
      constants: new ConstantPool(),
      functions: [],
    };
    assert.throws(() => optimizeBytecode(brokenInput), (err) => err instanceof OptimizerError);
  });
});

// -----------------------------------------------------------------------
// optimizeBytecode() end-to-end: convergence, statistics, report
// -----------------------------------------------------------------------

describe('optimizeBytecode()', () => {
  test('runs every default pass and reports non-negative before/after counts', () => {
    const bytecode = compile('const PI = 3.14\nhold area = PI * 10\nsay area');
    const { program, statistics } = optimizeBytecode(bytecode);
    assert.equal(validateBytecode(program).valid, true);
    assert.ok(statistics.instructionsAfter <= statistics.instructionsBefore);
    assert.ok(statistics.constantsAfter <= statistics.constantsBefore);
    assert.equal(statistics.removedInstructions, statistics.instructionsBefore - statistics.instructionsAfter);
    assert.equal(DEFAULT_PASSES.length, 8);
  });

  test('fully converges a multi-hop chain (const inlined, then folded, then the result itself propagated)', () => {
    const bytecode = compile('const PI = 3.14\nhold area = PI * 10\nsay area');
    const { program } = optimizeBytecode(bytecode);
    // Minimal possible form: PUSH 31.4; PRINT 1; PUSH 0; HALT.
    assert.deepEqual(opcodesOf(program), [Opcode.PUSH, Opcode.PRINT, Opcode.PUSH, Opcode.HALT]);
    assert.ok(Math.abs(program.constants.get(program.instructions[0].operands[0]).value - 31.4) < 1e-9);
  });

  test('formatOptimizerReport() renders every documented section without throwing', () => {
    const bytecode = compile('hold x = 1 + 2\nsay x');
    const { statistics } = optimizeBytecode(bytecode);
    const text = formatOptimizerReport(statistics, { title: 'Test Report' });
    assert.match(text, /Test Report/);
    assert.match(text, /Instructions Before/);
    assert.match(text, /Instructions After/);
    assert.match(text, /Removed Instructions/);
    assert.match(text, /Constants Before/);
    assert.match(text, /Optimization Ratio/);
    assert.match(text, /Execution Estimate/);
    assert.match(text, /Per-Pass Breakdown/);
    assert.doesNotMatch(text, /\(--/); // the signed-delta formatting bug this suite guards against
  });

  test('computeStatistics() matches optimizeBytecode()\'s own reported counts', () => {
    const bytecode = compile('say 1 + 2');
    const { program, statistics } = optimizeBytecode(bytecode);
    const recomputed = computeStatistics(bytecode, program, statistics.passReports);
    assert.deepEqual(recomputed.instructionsBefore, statistics.instructionsBefore);
    assert.deepEqual(recomputed.instructionsAfter, statistics.instructionsAfter);
  });
});

// -----------------------------------------------------------------------
// Regression parity — optimized VM output must equal Interpreter output
// -----------------------------------------------------------------------

function runInterpreter(source, filePath, input) {
  const tokens = new Lexer(source, filePath).tokenize();
  const astProgram = new Parser(tokens, filePath).parseProgram();
  const analysis = new SemanticAnalyzer(astProgram, filePath).analyze();
  if (!analysis.success) {
    throw new Error(`Interpreter path: semantic analysis unexpectedly failed: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  }
  const output = [];
  const queue = [...input];
  const interpreter = new Interpreter(filePath, { write: () => {}, writeLine: (t) => output.push(t), readLine: () => queue.shift() ?? '' });
  try {
    interpreter.run(astProgram);
    return { output, exitCode: interpreter.exitCode ?? 0 };
  } catch (err) {
    return { output, error: { code: err.code, message: err.message } };
  }
}

function runOptimizedVM(source, filePath, input) {
  const bytecode = compile(source, filePath);
  const preCheck = validateBytecode(bytecode);
  if (!preCheck.valid) throw new Error(`Generator produced invalid bytecode: ${preCheck.errors.join('; ')}`);
  const { program: optimized } = optimizeBytecode(bytecode);

  const output = [];
  const queue = [...input];
  const vm = new VirtualMachine(optimized, filePath, { write: () => {}, writeLine: (t) => output.push(t), readLine: () => queue.shift() ?? '' });
  try {
    const exitCode = vm.run();
    return { output, exitCode };
  } catch (err) {
    return { output, error: { code: err.code, message: err.message } };
  }
}

function assertOptimizedParity(source, { input = [], label = 'test.pr' } = {}) {
  const i = runInterpreter(source, label, input);
  const v = runOptimizedVM(source, label, input);

  assert.deepEqual(v.output, i.output, `console output mismatch (optimized VM) for:\n${source}`);

  if (i.error) {
    assert.ok(v.error, `Interpreter errored (${i.error.code}) but optimized VM did not, for:\n${source}`);
    assert.equal(v.error.code, i.error.code, `error code mismatch (optimized VM) for:\n${source}`);
  } else {
    assert.ok(!v.error, `optimized VM errored (${v.error?.code}) but Interpreter did not, for:\n${source}`);
    assert.equal(v.exitCode, i.exitCode, `exit code mismatch (optimized VM) for:\n${source}`);
  }
}

describe('Regression parity — nested loops', () => {
  test('nested repeat and nested while produce identical output when optimized', () => {
    assertOptimizedParity('repeat 3 as i\n    repeat 3 as j\n        say i * j\n    end repeat\nend repeat');
    assertOptimizedParity('hold i = 0\nwhile i < 3\n    hold j = 0\n    while j < 3\n        say i + j\n        j = j + 1\n    end while\n    i = i + 1\nend while');
  });
});

describe('Regression parity — recursive functions', () => {
  test('factorial and mutual recursion (isEven/isOdd)', () => {
    assertOptimizedParity('task fact(n)\n    if n <= 1\n        return 1\n    end if\n    return n * fact(n - 1)\nend task\nsay fact(7)');
    const source = [
      'task isEven(n)', '    if n == 0', '        return true', '    end if', '    return isOdd(n - 1)', 'end task',
      'task isOdd(n)', '    if n == 0', '        return false', '    end if', '    return isEven(n - 1)', 'end task',
      'say isEven(13)',
    ].join('\n');
    assertOptimizedParity(source);
  });
});

describe('Regression parity — choose/option/other', () => {
  test('a matching option, a fallthrough to other, and no match with no other', () => {
    assertOptimizedParity('choose 2\n    option 1\n        say "one"\n    option 2\n        say "two"\n    other\n        say "?"\nend choose');
    assertOptimizedParity('choose 9\n    option 1\n        say "one"\n    other\n        say "other"\nend choose');
    assertOptimizedParity('choose 9\n    option 1\n        say "one"\nend choose');
  });
});

describe('Regression parity — arrays', () => {
  test('literals, indexing, assignment, nesting, reference semantics, every built-in', () => {
    assertOptimizedParity('hold a = box(1, 2, 3)\nsay a\nsay a[0]\na[1] = 99\nsay a');
    assertOptimizedParity('hold m = box(box(1, 2), box(3, 4))\nsay m[1][0]\nm[0][1] = 9\nsay m');
    assertOptimizedParity('hold a = box(1)\nhold b = a\npush(b, 2)\nsay a');
    assertOptimizedParity('hold a = box(3, 1, 2)\npush(a, 4)\nsay a\nsay pop(a)\nsort(a)\nsay a\nreverse(a)\nsay a\nsay contains(a, 3)\nsay len(a)');
    assertOptimizedParity('say box(1, 2) == box(1, 2)');
  });
});

describe('Regression parity — stop statement', () => {
  test('bare stop, stop with a code, and stop from inside nested control flow', () => {
    assertOptimizedParity('say "before"\nstop\nsay "after"');
    assertOptimizedParity('say "before"\nstop 5\nsay "after"');
    const source = ['task validate(age)', '    if age < 0', '        stop 1', '    end if', '    return true', 'end task', 'validate(-5)'].join('\n');
    assertOptimizedParity(source);
  });
});

describe('Regression parity — built-in functions', () => {
  test('math, type, and text built-ins', () => {
    assertOptimizedParity('say number("42")\nsay text(42)\nsay type(42)\nsay type("x")\nsay round(3.456, 2)\nsay len("hello")');
  });
});

describe('Regression parity — functions returning values', () => {
  test('parameters, explicit returns, and implicit empty', () => {
    assertOptimizedParity('task add(a, b)\n    return a + b\nend task\nsay add(2, 3)');
    assertOptimizedParity('task noop()\n    hold x = 1\nend task\nsay noop()');
    assertOptimizedParity('task outer(n)\n    task inner()\n        return n * 2\n    end task\n    return inner()\nend task\nsay outer(21)');
  });
});

describe('Regression parity — runtime errors (same error code from the optimized VM)', () => {
  test('division/modulo by zero, array bounds/type errors, call-depth overflow', () => {
    assertOptimizedParity('say 1 / 0');
    assertOptimizedParity('say 1 % 0');
    assertOptimizedParity('hold a = box(1, 2)\nsay a[5]');
    assertOptimizedParity('hold a = box(1, 2)\nsay a[-1]');
    assertOptimizedParity('hold a = box(1, 2)\na[0] = "x"');
    assertOptimizedParity('task loopForever()\n    return loopForever()\nend task\nloopForever()');
  });
});

describe('Regression parity — every real example program', () => {
  const inputs = { 'calculator.pr': ['12', '5'], 'grade-checker.pr': ['85'] };
  for (const file of ['hello.pr', 'variables.pr', 'ifelse.pr', 'loops.pr', 'functions.pr', 'calculator.pr', 'fizzbuzz.pr', 'grade-checker.pr', 'while-break-continue.pr', 'stop.pr', 'arrays.pr']) {
    test(`${file} produces identical output and exit code, optimized`, () => {
      const source = readFileSync(join(examplesDir, file), 'utf-8');
      assertOptimizedParity(source, { input: inputs[file] ?? [], label: file });
    });
  }
});

describe('Regression parity — large programs (10,000+ instructions)', () => {
  test('a generated 3,000-variable program compiles to over 10,000 instructions and still optimizes correctly', () => {
    const lines = [];
    for (let i = 0; i < 3000; i++) {
      lines.push(`hold v${i} = ${i} + 1`);
      lines.push(`say v${i}`);
    }
    const source = lines.join('\n');

    const bytecode = compile(source);
    assert.ok(bytecode.instructions.length > 10000, `expected over 10,000 instructions, got ${bytecode.instructions.length}`);

    const { program, statistics } = optimizeBytecode(bytecode);
    assert.equal(validateBytecode(program).valid, true);
    // Every "v_i = i + 1" is a single-assignment literal-foldable declaration
    // immediately printed once — ConstantFolding + ConstantPropagation
    // should collapse each to one PUSH + PRINT pair, a substantial reduction.
    assert.ok(statistics.removedInstructions > 0);
    assert.ok(program.instructions.length < bytecode.instructions.length);

    assertOptimizedParity(source);
  });

  test('a 50,000-iteration loop optimizes and still matches the Interpreter', () => {
    assertOptimizedParity(['hold sum = 0', 'repeat 50000 as i', '    sum = sum + i', 'end repeat', 'say sum'].join('\n'));
  });
});

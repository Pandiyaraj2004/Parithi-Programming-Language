/**
 * Phase 12 (§31) performance benchmark harness. Not part of the shipped
 * package (no src/ import references this file) — a standalone dev tool,
 * matching how a real compiler project keeps its benchmark suite separate
 * from the compiler itself. Run with:
 *
 *   node benchmarks/optimizer-benchmark.mjs
 *
 * For each named program: compiles bytecode, records its instruction/
 * constant-pool counts, runs it through the optimizer and records the
 * same counts again, then executes BOTH the unoptimized and optimized
 * bytecode on the PVM several times each (discarding a warmup run) and
 * reports the median wall-clock time and the JS heap delta observed
 * around each run. Heap-delta is a rough signal, not a precise
 * measurement — Node's GC runs on its own schedule, so it is reported
 * alongside, not instead of, the much more reliable instruction-count and
 * wall-clock numbers.
 */

import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { SemanticAnalyzer } from '../src/semantic/analyzer.js';
import { generateBytecode, validateBytecode } from '../src/bytecode/index.js';
import { VirtualMachine } from '../src/vm/virtual-machine.js';
import { optimizeBytecode } from '../src/optimizer/index.js';

const RUNS_PER_PROGRAM = 5;

function compile(source, filePath = '<benchmark>') {
  const tokens = new Lexer(source, filePath).tokenize();
  const program = new Parser(tokens, filePath).parseProgram();
  const analysis = new SemanticAnalyzer(program, filePath).analyze();
  if (!analysis.success) {
    throw new Error(`semantic analysis failed: ${analysis.diagnostics.map((d) => d.format()).join('; ')}`);
  }
  const bytecode = generateBytecode(program);
  const { valid, errors } = validateBytecode(bytecode);
  if (!valid) throw new Error(`invalid bytecode: ${errors.join('; ')}`);
  return bytecode;
}

function runOnce(bytecode, filePath) {
  const vm = new VirtualMachine(bytecode, filePath, { write: () => {}, writeLine: () => {}, readLine: () => '' });
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  vm.run();
  const elapsedMs = performance.now() - startedAt;
  const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
  return { elapsedMs, heapDeltaBytes };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function benchmark(name, source) {
  const before = compile(source);
  const { program: after, statistics } = optimizeBytecode(before);

  const beforeRuns = [];
  const afterRuns = [];
  for (let i = 0; i < RUNS_PER_PROGRAM; i++) {
    beforeRuns.push(runOnce(before, name));
    afterRuns.push(runOnce(after, name));
  }
  // Discard the first (warmup — JIT/inline-cache effects) from each set.
  const beforeTimes = beforeRuns.slice(1).map((r) => r.elapsedMs);
  const afterTimes = afterRuns.slice(1).map((r) => r.elapsedMs);
  const beforeHeap = beforeRuns.slice(1).map((r) => r.heapDeltaBytes);
  const afterHeap = afterRuns.slice(1).map((r) => r.heapDeltaBytes);

  return {
    name,
    instructionsBefore: before.instructions.length,
    instructionsAfter: after.instructions.length,
    constantsBefore: before.constants.size,
    constantsAfter: after.constants.size,
    optimizationRatio: statistics.optimizationRatio,
    medianMsBefore: median(beforeTimes),
    medianMsAfter: median(afterTimes),
    medianHeapKBBefore: median(beforeHeap) / 1024,
    medianHeapKBAfter: median(afterHeap) / 1024,
  };
}

function repeatLines(n, template) {
  return Array.from({ length: n }, (_, i) => template(i)).join('\n');
}

const PROGRAMS = {
  'Hello World': 'say "Hello, World!"',

  Calculator: ['hold a = 12', 'hold b = 5', 'say a + b', 'say a - b', 'say a * b', 'say a / b', 'say a % b', 'say a ** 2'].join('\n'),

  'Recursive Fibonacci (fib(22))': [
    'task fib(n)',
    '    if n <= 1',
    '        return n',
    '    end if',
    '    return fib(n - 1) + fib(n - 2)',
    'end task',
    'say fib(22)',
  ].join('\n'),

  'Factorial (fact(10), x20,000)': [
    'task fact(n)',
    '    if n <= 1',
    '        return 1',
    '    end if',
    '    return n * fact(n - 1)',
    'end task',
    'hold total = 0',
    'repeat 20000 as i',
    '    total = total + fact(10)',
    'end repeat',
    'say total',
  ].join('\n'),

  '100,000-iteration loop': ['hold sum = 0', 'repeat 100000 as i', '    sum = sum + i', 'end repeat', 'say sum'].join('\n'),

  'Large Array (box, 5,000 elements)': [
    'hold arr = box()',
    'repeat 5000 as i',
    '    push(arr, i)',
    'end repeat',
    'sort(arr)',
    'reverse(arr)',
    'say len(arr)',
    'say arr[0]',
  ].join('\n'),

  'Nested loops (100 x 100)': ['hold sum = 0', 'repeat 100 as i', '    repeat 100 as j', '        sum = sum + i * j', '    end repeat', 'end repeat', 'say sum'].join('\n'),

  'Deep recursion (depth 400)': ['task countdown(n)', '    if n <= 0', '        return 0', '    end if', '    return countdown(n - 1)', 'end task', 'say countdown(400)'].join('\n'),

  // Bonus: exercises ConstantFolding/ConstantPropagation heavily (many
  // single-assignment declarations with literal arithmetic initializers,
  // §31's own "why re-run the fold sweep" example, at scale).
  'Constant-heavy program (3,000 declarations)': repeatLines(3000, (i) => `hold v${i} = ${i} + 1\nsay v${i}`),
};

console.log('Phase 12 — Bytecode Optimizer Performance Benchmark');
console.log('='.repeat(100));
console.log(`(median of ${RUNS_PER_PROGRAM - 1} runs, 1 warmup run discarded per program per bytecode variant)\n`);

const results = [];
for (const [name, source] of Object.entries(PROGRAMS)) {
  const result = benchmark(name, source);
  results.push(result);

  console.log(name);
  console.log('-'.repeat(name.length));
  console.log(`  Instructions   : ${result.instructionsBefore} -> ${result.instructionsAfter}  (${result.optimizationRatio.toFixed(2)}% fewer)`);
  console.log(`  Constants      : ${result.constantsBefore} -> ${result.constantsAfter}`);
  console.log(`  VM time (ms)   : ${result.medianMsBefore.toFixed(3)} -> ${result.medianMsAfter.toFixed(3)}`);
  console.log(`  Heap delta(KB) : ${result.medianHeapKBBefore.toFixed(1)} -> ${result.medianHeapKBAfter.toFixed(1)}`);
  console.log('');
}

console.log('Summary table (Markdown)');
console.log('-'.repeat(100));
console.log('| Program | Instr. Before | Instr. After | Ratio | Const. Before | Const. After | VM ms Before | VM ms After |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of results) {
  console.log(
    `| ${r.name} | ${r.instructionsBefore} | ${r.instructionsAfter} | ${r.optimizationRatio.toFixed(1)}% | ${r.constantsBefore} | ${r.constantsAfter} | ${r.medianMsBefore.toFixed(3)} | ${r.medianMsAfter.toFixed(3)} |`,
  );
}

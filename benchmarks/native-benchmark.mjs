#!/usr/bin/env node
/**
 * Native backend benchmark (Phase 13) — honest and narrow: the native
 * backend currently compiles only `say` statements with String literals
 * (native-codegen.js's own class doc), so "Hello World" is the ONLY
 * workload genuinely comparable across all three backends today.
 * Arithmetic-loop/recursion/etc. benchmarks (matching Phase 12's
 * optimizer-benchmark.mjs shape) are NOT included here — adding them
 * would require features the native backend doesn't support yet; a
 * benchmark against unsupported functionality would be meaningless.
 *
 * Methodology: each backend runs as its own real OS process (`node
 * bin/pari.js hello.pr`, `node bin/pari.js --run-bytecode hello.pr`,
 * `.\hello.exe` directly) N times; the first run is discarded as warmup,
 * the remaining runs' wall-clock time is measured via `performance.now()`
 * around `spawnSync`, and the median is reported — this measures real
 * process-level cost (including Node's own startup for the first two),
 * not an isolated micro-benchmark inside a single already-warm process.
 *
 * Reproduce: node benchmarks/native-benchmark.mjs
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { compileNative } from '../src/native/native-compiler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const pariBin = join(repoRoot, 'bin', 'pari.js');

const RUNS = 11; // 1 warmup + 10 measured

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function timeRuns(fn) {
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.shift(); // discard warmup
  return median(times);
}

function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'parithi-native-bench-'));
  const prPath = join(workDir, 'hello.pr');
  writeFileSync(prPath, 'say "Hello, Parithi!"\n');

  const nativeResult = compileNative('say "Hello, Parithi!"\n', 'hello.pr');
  if (!nativeResult.success) throw new Error('Native compile unexpectedly failed for the benchmark program.');
  const exePath = join(workDir, 'hello.exe');
  writeFileSync(exePath, nativeResult.exe);

  console.log(`Hello World — median of ${RUNS - 1} runs (1 warmup discarded), each as a real OS process:\n`);

  const interpreterMs = timeRuns(() => spawnSync(process.execPath, [pariBin, prPath], { encoding: 'utf8' }));
  console.log(`  Tree-Walking Interpreter (node bin/pari.js hello.pr):        ${interpreterMs.toFixed(2)} ms`);

  const pvmMs = timeRuns(() => spawnSync(process.execPath, [pariBin, '--run-bytecode', prPath], { encoding: 'utf8' }));
  console.log(`  PVM (node bin/pari.js --run-bytecode hello.pr):              ${pvmMs.toFixed(2)} ms`);

  const nativeMs = timeRuns(() => spawnSync(exePath, [], { encoding: 'utf8' }));
  console.log(`  Native .exe (hello.exe directly, no Node.js involved):       ${nativeMs.toFixed(2)} ms`);

  console.log(`\nNative is ~${(interpreterMs / nativeMs).toFixed(0)}x faster than the Interpreter and ~${(pvmMs / nativeMs).toFixed(0)}x faster than the PVM for this workload —`);
  console.log('almost entirely because the Interpreter/PVM numbers include a full Node.js process startup');
  console.log('(module loading, V8 init) on every run, which the native .exe has no equivalent of. This is');
  console.log('not yet evidence that native-compiled CODE runs faster than interpreted/bytecode execution —');
  console.log('proving that requires a CPU-bound workload (a large loop, recursion), which isn\'t supported');
  console.log('by the native backend yet. Recorded honestly, not oversold.');

  rmSync(workDir, { recursive: true, force: true });
}

main();

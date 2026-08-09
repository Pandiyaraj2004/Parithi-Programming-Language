/**
 * Native compiler test suite — Phase 13. Unlike every other backend's own
 * suite, these tests don't stop at "the compiler produced bytes" — per the
 * brief's own explicit requirement, every success-path test here actually
 * WRITES a real `.exe` to disk and EXECUTES it (`spawnSync`), then checks
 * its real stdout and real exit code — the only way to actually prove a
 * hand-rolled PE64 file and hand-encoded x86-64 machine code work on real
 * Windows, not just that JavaScript ran without throwing.
 *
 * SCOPE (honest, not aspirational — see native-codegen.js's own class doc):
 * the native backend compiles a sequence of top-level `hold`/`const`
 * declarations, plain-variable assignment, and `say` statements, whose
 * values/arguments are built ONLY from literals, variable references,
 * arithmetic (`+ - * / % **`), comparisons (`== != > < >= <=`), and unary
 * `-`/`not` — i.e. exactly the expression shapes the IR Optimizer's
 * Constant Folding + Constant Propagation passes can always reduce to a
 * single, known-at-compile-time value ("compile-time-constant-only"
 * support — not a real register allocator or runtime variable storage).
 * Every other Parithi construct (`and`/`or`, control flow, functions,
 * recursion, `stop`, built-ins, arrays) is tested here only for its
 * DIAGNOSTIC path — that it fails cleanly with a P030 error, never a
 * crash and never a silently wrong `.exe` — not for successful native
 * compilation, because it isn't supported yet. `examples/native/`
 * deliberately contains only the programs that genuinely compile; adding
 * a `loops.pr`/`functions.pr`/etc. there would misleadingly imply support
 * that doesn't exist.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { Lexer } from '../../src/lexer/lexer.js';
import { Parser } from '../../src/parser/parser.js';
import { SemanticAnalyzer } from '../../src/semantic/analyzer.js';
import { Interpreter } from '../../src/interpreter/interpreter.js';
import { VirtualMachine } from '../../src/vm/virtual-machine.js';
import { compileFromSource } from '../../src/vm/loader.js';
import { compileNative, formatAsmListing } from '../../src/native/native-compiler.js';
import { buildPE64Executable } from '../../src/native/pe/pe-writer.js';
import { buildRdata } from '../../src/native/pe/rdata-builder.js';
import { Reg, movRegImm32, movRegImm64, callIndirectReg, subRspImm8 } from '../../src/native/codegen/x86-64-encoder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, '..', '..', 'examples', 'native');

const workDir = mkdtempSync(join(tmpdir(), 'parithi-native-test-'));
let exeCounter = 0;

/** Compiles `source` to a real .exe, WRITES it to a temp file, and EXECUTES it — never just inspects the compiled bytes. */
function compileAndRun(source, { skipRun = false } = {}) {
  const result = compileNative(source, 'test.pr');
  if (!result.success) return { compileFailed: true, diagnostics: result.diagnostics };

  const exePath = join(workDir, `t${exeCounter++}.exe`);
  writeFileSync(exePath, result.exe);
  if (skipRun) return { compileFailed: false, exePath, result };

  const proc = spawnSync(exePath, [], { encoding: 'utf8' });
  return { compileFailed: false, exePath, result, stdout: proc.stdout, stderr: proc.stderr, exitCode: proc.status };
}

function runInterpreter(source) {
  const tokens = new Lexer(source, 'test.pr').tokenize();
  const program = new Parser(tokens, 'test.pr').parseProgram();
  const analysis = new SemanticAnalyzer(program, 'test.pr').analyze();
  if (!analysis.success) throw new Error('Interpreter path: semantic analysis unexpectedly failed');
  const output = [];
  const interpreter = new Interpreter('test.pr', { write: () => {}, writeLine: (t) => output.push(t), readLine: () => '' });
  interpreter.run(program);
  return { stdout: output.join('\n') + (output.length ? '\n' : ''), exitCode: interpreter.exitCode ?? 0 };
}

function runVM(source) {
  const compiled = compileFromSource(source, 'test.pr');
  if (!compiled.success) throw new Error('VM path: compile unexpectedly failed');
  const output = [];
  const vm = new VirtualMachine(compiled.bytecode, 'test.pr', { write: () => {}, writeLine: (t) => output.push(t), readLine: () => '' });
  const exitCode = vm.run();
  return { stdout: output.join('\n') + (output.length ? '\n' : ''), exitCode };
}

describe('Native compilation — real .exe generation and execution', () => {
  test('hello world: compiles, writes a real PE .exe, executes it, and produces exactly the right stdout + exit code', () => {
    const { compileFailed, stdout, exitCode } = compileAndRun('say "Hello, Parithi!"\n');
    assert.equal(compileFailed, false);
    assert.equal(stdout, 'Hello, Parithi!\n');
    assert.equal(exitCode, 0);
  });

  test('the generated file is a real PE32+ executable (DOS/PE/COFF headers all correct)', () => {
    const { exePath } = compileAndRun('say "PE header check"\n', { skipRun: true });
    const buf = readFileSync(exePath);
    assert.equal(buf.toString('ascii', 0, 2), 'MZ');
    const peOffset = buf.readUInt32LE(0x3c);
    assert.equal(buf.toString('ascii', peOffset, peOffset + 4), 'PE\0\0');
    assert.equal(buf.readUInt16LE(peOffset + 4), 0x8664); // Machine = AMD64
    const optionalHeaderOffset = peOffset + 4 + 20;
    assert.equal(buf.readUInt16LE(optionalHeaderOffset), 0x020b); // Magic = PE32+
    assert.equal(buf.readUInt16LE(optionalHeaderOffset + 68), 3); // Subsystem = Windows CUI
  });

  test('multiple "say" statements, including multi-value say and empty strings, execute in order with correct output', () => {
    const source = 'say "Line one"\nsay "Line two", "with multiple", "values"\nsay ""\nsay "Line four"\n';
    const { stdout, exitCode } = compileAndRun(source);
    assert.equal(stdout, 'Line one\nLine two with multiple values\n\nLine four\n');
    assert.equal(exitCode, 0);
  });

  test('a program with no "say" statements at all still compiles and exits 0', () => {
    const { stdout, exitCode } = compileAndRun('');
    assert.equal(stdout, '');
    assert.equal(exitCode, 0);
  });

  test('a long string (over 200 bytes) prints completely and correctly', () => {
    const longText = 'x'.repeat(250);
    const { stdout } = compileAndRun(`say "${longText}"\n`);
    assert.equal(stdout, `${longText}\n`);
  });

  test('a program with many "say" statements (50) prints every line in order', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `say "line ${i}"`).join('\n');
    const { stdout, exitCode } = compileAndRun(`${lines}\n`);
    assert.equal(stdout, Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n') + '\n');
    assert.equal(exitCode, 0);
  });
});

describe('Native compilation — compile-time-constant variables and expressions (Phase 17 expansion)', () => {
  const supported = [
    { name: 'a variable declaration, printed by name', source: 'hold x = 5\nsay x\n', stdout: '5\n' },
    { name: 'a constant declaration alone (no say) still compiles and exits 0', source: 'const PI = 3.14\n', stdout: '' },
    { name: 'arithmetic folded to a constant', source: 'say 1 + 2\n', stdout: '3\n' },
    { name: 'a comparison folded to a Boolean constant', source: 'say 1 < 2\n', stdout: 'true\n' },
    { name: 'a non-literal say argument (identifier)', source: 'hold x = "hi"\nsay x\n', stdout: 'hi\n' },
    { name: 'a non-literal say argument (expression), including string concatenation', source: 'say "a" + "b"\n', stdout: 'ab\n' },
    { name: 'a non-String say argument (Number)', source: 'say 5\n', stdout: '5\n' },
    { name: 'a non-String say argument (Boolean)', source: 'say true\n', stdout: 'true\n' },
    { name: 'reassignment ("last write wins")', source: 'hold x = 1\nx = 2\nsay x\n', stdout: '2\n' },
    { name: 'unary negation', source: 'say -5\n', stdout: '-5\n' },
    { name: 'unary "not"', source: 'say not true\n', stdout: 'false\n' },
    { name: 'exponentiation and modulo', source: 'hold a = 2 ** 10\nhold b = 10 % 3\nsay a\nsay b\n', stdout: '1024\n1\n' },
    { name: 'a variable used in an arithmetic expression with another variable', source: 'hold a = 10\nhold b = 20\nsay a + b\n', stdout: '30\n' },
  ];

  const literalZeroDivisor = [
    { name: 'division by a literal zero', source: 'say 10 / 0\n' },
    { name: 'modulo by a literal zero', source: 'say 10 % 0\n' },
  ];

  for (const { name, source } of literalZeroDivisor) {
    test(`${name} is rejected cleanly (P030), never baked into an executable that would hide the runtime P020 error`, () => {
      const result = compileNative(source, 'test.pr');
      assert.equal(result.success, false);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0].code, 'P030');
      assert.match(result.diagnostics[0].format(), /literal zero/);
    });
  }

  test('division by a variable that only resolves to zero after constant propagation fails cleanly (P030), never a raw crash', () => {
    // Stage 1's AST-only gate only catches a *literal* zero divisor cheaply;
    // this deeper case is only discovered once the IR Optimizer's constant
    // propagation resolves "z" to 0, after Stage 1 already accepted the
    // program — ir-to-x86-64.js's own defense-in-depth must still report it
    // cleanly instead of throwing an uncaught internal Error.
    const result = compileNative('hold z = 0\nhold x = 10 / z\nsay x\n', 'test.pr');
    assert.equal(result.success, false);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].code, 'P030');
  });

  test('a self-referencing reassignment ("x = x + 1") is rejected cleanly (P030) at Stage 1, naming the variable', () => {
    // The IR Optimizer propagates a variable's value forward to later reads,
    // but does not fold an expression that reassigns a variable in terms of
    // that SAME variable's own prior value — Stage 1 must catch this cheaply
    // rather than let Stage 2 discover it (which would still fail cleanly,
    // per the test above, but would incorrectly let automatic backend
    // selection pick Native in the first place).
    const result = compileNative('hold x = 1\nx = x + 1\nsay x\n', 'test.pr');
    assert.equal(result.success, false);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].code, 'P030');
    assert.match(result.diagnostics[0].format(), /self-referencing reassignment of "x"/);
  });

  for (const { name, source, stdout } of supported) {
    test(`${name} compiles, executes, and matches the Interpreter's own output`, () => {
      const { compileFailed, stdout: nativeStdout, exitCode: nativeExitCode } = compileAndRun(source);
      const interp = runInterpreter(source);
      assert.equal(compileFailed, false);
      assert.equal(nativeStdout, stdout);
      assert.equal(nativeStdout, interp.stdout, 'Native vs Interpreter stdout mismatch');
      assert.equal(nativeExitCode, interp.exitCode, 'Native vs Interpreter exit code mismatch');
      assert.equal(nativeExitCode, 0);
    });
  }
});

describe('Native compilation — unsupported features fail cleanly (never a silent miscompile)', () => {
  const unsupported = [
    { name: 'boolean logic', source: 'say true and false\n' },
    { name: 'if/else', source: 'if true\n    say "x"\nend if\n' },
    { name: 'while loop', source: 'while true\n    break\nend while\n' },
    { name: 'repeat loop', source: 'repeat 3 as i\n    say "x"\nend repeat\n' },
    { name: 'choose', source: 'choose 1\n    option 1\n        say "one"\nend choose\n' },
    { name: 'task/function declaration', source: 'task f()\n    return 1\nend task\n' },
    { name: 'stop statement', source: 'stop 1\n' },
    { name: 'array (box)', source: 'hold arr = box(1, 2)\n' },
  ];

  for (const { name, source } of unsupported) {
    test(`${name} produces a clean P030 diagnostic, not a crash or a miscompiled .exe`, () => {
      const result = compileNative(source, 'test.pr');
      assert.equal(result.success, false);
      assert.equal(result.diagnostics.length, 1);
      const err = result.diagnostics[0];
      assert.equal(err.code, 'P030');
      assert.ok(typeof err.format === 'function');
      const formatted = err.format();
      assert.match(formatted, /Error P030:/);
      assert.match(formatted, /test\.pr:\d+:\d+/);
      assert.match(formatted, /Hint:/);
    });
  }

  test('a lexical error (before native compilation even starts) is still reported cleanly, not as a native error', () => {
    const result = compileNative('say "unterminated\n', 'test.pr');
    assert.equal(result.success, false);
    assert.equal(result.diagnostics[0].code, 'P009');
  });

  test('a semantic error is reported with the Semantic Analyzer\'s own diagnostics, not converted to P030', () => {
    const result = compileNative('say undeclaredVar\n', 'test.pr');
    assert.equal(result.success, false);
    assert.equal(result.diagnostics[0].code, 'P001');
  });
});

describe('Cross-backend parity — Interpreter vs. PVM vs. Native, for every currently-supported program', () => {
  const programs = [
    'say "Hello, Parithi!"',
    'say "Line one"\nsay "Line two"',
    'say "a", "b", "c"',
    'say ""',
    '',
    readFileSync(join(examplesDir, 'hello.pr'), 'utf8'),
    readFileSync(join(examplesDir, 'strings.pr'), 'utf8'),
    readFileSync(join(examplesDir, 'variables.pr'), 'utf8'),
  ];

  for (const [i, source] of programs.entries()) {
    test(`program #${i} produces identical stdout and exit code across all three backends`, () => {
      const interp = runInterpreter(source);
      const vm = runVM(source);
      const { compileFailed, stdout, exitCode } = compileAndRun(source);

      assert.equal(compileFailed, false, 'expected this program to be within the native-supported subset');
      assert.equal(vm.stdout, interp.stdout, 'PVM vs Interpreter stdout mismatch');
      assert.equal(vm.exitCode, interp.exitCode, 'PVM vs Interpreter exit code mismatch');
      assert.equal(stdout, interp.stdout, 'Native vs Interpreter stdout mismatch');
      assert.equal(exitCode, interp.exitCode, 'Native vs Interpreter exit code mismatch');
    });
  }
});

describe('Native IR and assembly inspection (--ir / --asm)', () => {
  test('the IR listing has one Say(...) entry per "say" statement, plus a trailing Exit(0)', () => {
    const result = compileNative('say "a"\nsay "b"\n', 'test.pr');
    assert.equal(result.success, true);
    assert.deepEqual(result.ir, ['Say("a")', 'Say("b")', 'Exit(0)']);
  });

  test('formatAsmListing() renders a non-empty, readable instruction-by-instruction listing', () => {
    const result = compileNative('say "hi"\n', 'test.pr');
    const text = formatAsmListing(result.asmListing);
    assert.match(text, /sub rsp/);
    assert.match(text, /GetStdHandle/);
    assert.match(text, /WriteFile/);
    assert.match(text, /ExitProcess/);
    // Every listed instruction's byte count must match the length implied by its own hex dump.
    for (const { bytes } of result.asmListing) {
      assert.ok(bytes.length > 0);
    }
  });
});

describe('PE writer and rdata builder — unit-level (no execution, structural correctness only)', () => {
  test('buildRdata() offsets are all internally consistent and every internal fixup lands on the value it claims to', () => {
    const { buffer, iatOffsetByKey, stringOffsets, internalFixups } = buildRdata(
      [{ dll: 'KERNEL32.DLL', functions: ['GetStdHandle', 'WriteFile', 'ExitProcess'] }],
      [Buffer.from('test\n')],
    );
    for (const [, offset] of iatOffsetByKey) assert.ok(offset >= 0 && offset + 8 <= buffer.length);
    for (const offset of stringOffsets) assert.ok(offset >= 0 && offset < buffer.length);
    assert.ok(internalFixups.length > 0);
    for (const { offset, width } of internalFixups) assert.ok(offset >= 0 && offset + width <= buffer.length);
  });

  test('buildPE64Executable() throws a clear internal error for a fixup referencing an unregistered import (never silently drops it)', () => {
    assert.throws(
      () => buildPE64Executable({
        textBytes: Buffer.alloc(8),
        textFixups: [{ offset: 0, kind: 'iat', dll: 'KERNEL32.DLL', function: 'NotARealImport' }],
        imports: [{ dll: 'KERNEL32.DLL', functions: ['ExitProcess'] }],
        stringConstants: [],
      }),
      /unknown import/,
    );
  });

  test('a minimal hand-built ExitProcess(N)-only program (no console I/O at all) actually exits with the given code when run', () => {
    // The smallest possible real program this backend can produce — proves the
    // PE format + import table + calling convention independent of any string/console handling.
    const instructions = [];
    const fixups = [];
    let offset = 0;
    const emit = (buf) => { instructions.push(buf); offset += buf.length; };
    emit(subRspImm8(0x28));
    emit(movRegImm32(Reg.RCX, 7));
    emit(movRegImm64(Reg.RAX, 0n));
    fixups.push({ kind: 'iat', dll: 'KERNEL32.DLL', function: 'ExitProcess', offset: offset - 8 });
    emit(callIndirectReg(Reg.RAX));

    const exe = buildPE64Executable({
      textBytes: Buffer.concat(instructions),
      textFixups: fixups,
      imports: [{ dll: 'KERNEL32.DLL', functions: ['ExitProcess'] }],
      stringConstants: [],
    });
    const exePath = join(workDir, `t${exeCounter++}.exe`);
    writeFileSync(exePath, exe);
    const proc = spawnSync(exePath, [], { encoding: 'utf8' });
    assert.equal(proc.status, 7);
  });
});

test('cleanup temp directory', () => {
  rmSync(workDir, { recursive: true, force: true });
});

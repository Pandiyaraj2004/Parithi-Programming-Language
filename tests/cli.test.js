/**
 * CLI regression suite — Phase 7 (MASTER_DOCUMENT.md §19).
 * Spawns the real `bin/pari.js` as a subprocess for every case, so these
 * tests exercise exactly what a user typing `pari ...` in a terminal would
 * see: real exit codes, real stdout/stderr text, real file-system errors —
 * nothing mocked. Unit-level parseArgs behavior is covered separately in
 * foundation.test.js; this file is about the process boundary.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { ExitCode } from '../src/cli/exit-codes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PARI_BIN = join(__dirname, '..', 'bin', 'pari.js');
const EXAMPLES = join(__dirname, '..', 'examples');
const FIXTURES = join(__dirname, 'fixtures');

function pari(args, options = {}) {
  const result = spawnSync(process.execPath, [PARI_BIN, ...args], { encoding: 'utf-8', ...options });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

/** No raw JS engine internals (a leaked, unformatted stack trace) anywhere in the text. */
function assertNoRawStackTrace(text) {
  assert.doesNotMatch(text, /at Object\.<anonymous>/);
  assert.doesNotMatch(text, /node:internal\//);
  assert.doesNotMatch(text, /\s+at .+\.js:\d+:\d+/);
}

describe('CLI — successful commands (exit 0)', () => {
  for (const name of ['hello', 'variables', 'functions', 'loops', 'ifelse', 'fizzbuzz', 'while-break-continue', 'arrays']) {
    test(`pari ${name}.pr runs and exits 0`, () => {
      const { status, stderr } = pari([join(EXAMPLES, `${name}.pr`)]);
      assert.equal(status, ExitCode.SUCCESS);
      assert.equal(stderr, '');
    });
  }

  test('pari stop.pr runs and exits 1 (its documented "stop 1")', () => {
    const { status, stderr } = pari([join(EXAMPLES, 'stop.pr')]);
    assert.equal(status, 1);
    assert.equal(stderr, '');
  });

  test('pari --tokens hello.pr exits 0 and prints a token table', () => {
    const { status, stdout } = pari(['--tokens', join(EXAMPLES, 'hello.pr')]);
    assert.equal(status, ExitCode.SUCCESS);
    assert.match(stdout, /TYPE\s+LEXEME\s+VALUE\s+LINE:COL/);
    assert.match(stdout, /tokens$/m);
  });

  test('pari --ast hello.pr exits 0 and prints a tree', () => {
    const { status, stdout } = pari(['--ast', join(EXAMPLES, 'hello.pr')]);
    assert.equal(status, ExitCode.SUCCESS);
    assert.match(stdout, /Program/);
    assert.match(stdout, /PrintStatement/);
  });

  test('pari --analyze hello.pr exits 0 and reports no errors', () => {
    const { status, stdout } = pari(['--analyze', join(EXAMPLES, 'hello.pr')]);
    assert.equal(status, ExitCode.SUCCESS);
    assert.match(stdout, /No semantic errors found\./);
  });

  test('pari --runtime hello.pr exits 0 and reports clean stack depths', () => {
    const { status, stdout } = pari(['--runtime', join(EXAMPLES, 'hello.pr')]);
    assert.equal(status, ExitCode.SUCCESS);
    assert.match(stdout, /Environment stack depth: 1/);
    assert.match(stdout, /Call stack depth:        0/);
    assert.match(stdout, /Execution time:/);
  });

  test('pari --help exits 0 and shows usage, commands, and all four exit codes', () => {
    const { status, stdout } = pari(['--help']);
    assert.equal(status, ExitCode.SUCCESS);
    assert.match(stdout, /Parithi Programming Language/);
    assert.match(stdout, /Usage/);
    assert.match(stdout, /--tokens/);
    assert.match(stdout, /--verbose/);
    assert.match(stdout, /0 {2}Success/);
    assert.match(stdout, /1 {2}Compiler Error/);
    assert.match(stdout, /2 {2}Runtime Error/);
    assert.match(stdout, /3 {2}CLI Usage Error/);
  });

  test('pari -h behaves identically to --help', () => {
    const short = pari(['-h']);
    const long = pari(['--help']);
    assert.equal(short.status, ExitCode.SUCCESS);
    assert.equal(short.stdout, long.stdout);
  });

  test('pari --version exits 0 and shows language, compiler, and Node versions', () => {
    const { status, stdout } = pari(['--version']);
    assert.equal(status, ExitCode.SUCCESS);
    assert.match(stdout, /Parithi Programming Language v1\.0/);
    assert.match(stdout, /Compiler\s+\d+\.\d+\.\d+/);
    assert.match(stdout, /Node\s+v\d+/);
    assert.match(stdout, /Build Date/);
    assert.match(stdout, /Platform/);
  });
});

describe('CLI — invalid arguments (exit 3, CLI usage error)', () => {
  test('pari with no arguments exits 3 with a helpful message', () => {
    const { status, stderr } = pari([]);
    assert.equal(status, ExitCode.USAGE_ERROR);
    assert.match(stderr, /No input file specified/);
    assert.match(stderr, /pari --help/);
  });

  test('pari unknown (no extension, no such file) exits 3', () => {
    const { status, stderr } = pari(['unknown']);
    assert.equal(status, ExitCode.USAGE_ERROR);
    assert.match(stderr, /Source file not found/);
  });

  test('pari --tokens with no file exits 3', () => {
    const { status, stderr } = pari(['--tokens']);
    assert.equal(status, ExitCode.USAGE_ERROR);
    assert.match(stderr, /Missing source file after "--tokens"/);
  });

  test('pari file.txt (wrong extension) exits 3 with a suggestion to rename', () => {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-cli-'));
    const txtFile = join(dir, 'file.txt');
    writeFileSync(txtFile, 'hold x = 1\n');
    try {
      const { status, stderr } = pari([txtFile]);
      assert.equal(status, ExitCode.USAGE_ERROR);
      assert.match(stderr, /Expected a "\.pr" source file/);
      assert.match(stderr, /file\.pr/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('pari missing.pr (file does not exist) exits 3', () => {
    const { status, stderr } = pari([join(EXAMPLES, 'missing.pr')]);
    assert.equal(status, ExitCode.USAGE_ERROR);
    assert.match(stderr, /Source file not found/);
  });

  test('pari on a directory exits 3, not a crash', () => {
    const { status, stderr } = pari([EXAMPLES]);
    assert.equal(status, ExitCode.USAGE_ERROR);
    assert.match(stderr, /is a directory/);
  });

  test('pari --toekns hello.pr (typo) exits 3 and suggests --tokens', () => {
    const { status, stderr } = pari(['--toekns', join(EXAMPLES, 'hello.pr')]);
    assert.equal(status, ExitCode.USAGE_ERROR);
    assert.match(stderr, /Unknown flag "--toekns"/);
    assert.match(stderr, /Did you mean "--tokens"\?/);
  });

  test('a missing file with a similarly-named real file nearby gets a "did you mean" suggestion', () => {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-cli-'));
    writeFileSync(join(dir, 'greeting.pr'), 'say "hi"\n');
    try {
      const { status, stderr } = pari([join(dir, 'greetng.pr')]);
      assert.equal(status, ExitCode.USAGE_ERROR);
      assert.match(stderr, /Did you mean "greeting\.pr"\?/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  for (const badArgs of [[], ['unknown'], ['--tokens'], ['missing.pr']]) {
    test(`no CLI usage error leaks a raw JS stack trace (args: ${JSON.stringify(badArgs)})`, () => {
      const { stderr } = pari(badArgs);
      assertNoRawStackTrace(stderr);
    });
  }
});

describe('CLI — compiler vs. runtime error exit codes', () => {
  test('a semantic error (P002) exits 1, Compiler Error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-cli-'));
    const file = join(dir, 'sem.pr');
    writeFileSync(file, 'hold age = 20\nage = "Twenty"\n');
    try {
      const { status, stderr } = pari([file]);
      assert.equal(status, ExitCode.COMPILER_ERROR);
      assert.match(stderr, /Error P002/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a runtime error (P020, division by zero) exits 2, Runtime Error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-cli-'));
    const file = join(dir, 'rt.pr');
    writeFileSync(file, 'hold x = 10 / 0\n');
    try {
      const { status, stderr } = pari([file]);
      assert.equal(status, ExitCode.RUNTIME_ERROR);
      assert.match(stderr, /Error P020/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--runtime on a runtime error still exits 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-cli-'));
    const file = join(dir, 'rt.pr');
    writeFileSync(file, 'hold x = 10 / 0\n');
    try {
      const { status } = pari(['--runtime', file]);
      assert.equal(status, ExitCode.RUNTIME_ERROR);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unbounded recursion (P021) exits 2 with a truncated call-stack display, not 500 raw frames', () => {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-cli-'));
    const file = join(dir, 'inf.pr');
    writeFileSync(file, 'task loopForever()\n    return loopForever()\nend task\nloopForever()\n');
    try {
      const { status, stderr } = pari([file]);
      assert.equal(status, ExitCode.RUNTIME_ERROR);
      assert.match(stderr, /Error P021/);
      assert.match(stderr, /\.\.\. \(498 more\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('CLI — file handling', () => {
  test('a relative path resolves against the current working directory', () => {
    const { status, stdout } = pari(['examples/hello.pr'], { cwd: join(__dirname, '..') });
    assert.equal(status, ExitCode.SUCCESS);
    assert.match(stdout, /Hello, Parithi!/);
  });

  test('an absolute path works', () => {
    const { status, stdout } = pari([join(EXAMPLES, 'hello.pr')]);
    assert.equal(status, ExitCode.SUCCESS);
    assert.match(stdout, /Hello, Parithi!/);
  });

  test('a path containing spaces works when passed as a single argument', () => {
    const { status, stdout } = pari([join(FIXTURES, 'hello world.pr')]);
    assert.equal(status, ExitCode.SUCCESS);
    assert.match(stdout, /Hello, Parithi!/);
  });

  test('an empty source file runs cleanly with no output and exit 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-cli-'));
    const file = join(dir, 'empty.pr');
    writeFileSync(file, '');
    try {
      const { status, stdout, stderr } = pari([file]);
      assert.equal(status, ExitCode.SUCCESS);
      assert.equal(stdout, '');
      assert.equal(stderr, '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a Unicode source file (CJK + emoji inside a string literal) runs correctly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-cli-'));
    const file = join(dir, 'unicode.pr');
    writeFileSync(file, 'say "Héllo, 世界! 🎉"\n', 'utf-8');
    try {
      const { status, stdout } = pari([file]);
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /Héllo, 世界! 🎉/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a large source file (20,000 statements) runs correctly and reasonably fast', () => {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-cli-'));
    const file = join(dir, 'large.pr');
    const lines = Array.from({ length: 20000 }, (_, i) => `say ${i}`);
    writeFileSync(file, lines.join('\n'));
    try {
      const startedAt = Date.now();
      const { status, stdout } = pari([file]);
      const elapsedMs = Date.now() - startedAt;
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /^19999$/m);
      assert.ok(elapsedMs < 5000, `expected under 5s, took ${elapsedMs}ms`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a corrupted (invalid-UTF-8) source file fails cleanly with a Parithi error, not a crash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-cli-'));
    const file = join(dir, 'corrupt.pr');
    writeFileSync(file, Buffer.from([0x68, 0x6f, 0x6c, 0x64, 0x20, 0xc3, 0x28, 0x20, 0x3d, 0x20, 0x31]));
    try {
      const { status, stderr } = pari([file]);
      assert.equal(status, ExitCode.COMPILER_ERROR);
      assert.match(stderr, /Error P0/);
      assertNoRawStackTrace(stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('CLI — developer experience', () => {
  test('--verbose prints an execution-time summary after a successful run', () => {
    const { status, stdout } = pari([join(EXAMPLES, 'hello.pr'), '--verbose']);
    assert.equal(status, ExitCode.SUCCESS);
    assert.match(stdout, /Completed in [\d.]+ms\./);
  });

  test('--verbose works before or after the filename', () => {
    const before = pari(['--verbose', join(EXAMPLES, 'hello.pr')]);
    const after = pari([join(EXAMPLES, 'hello.pr'), '--verbose']);
    assert.equal(before.status, ExitCode.SUCCESS);
    assert.equal(after.status, ExitCode.SUCCESS);
    assert.match(before.stdout, /Completed in/);
    assert.match(after.stdout, /Completed in/);
  });

  test('without --verbose, a successful run prints only the program\'s own output', () => {
    const { stdout } = pari([join(EXAMPLES, 'hello.pr')]);
    assert.equal(stdout, 'Hello, Parithi!\n');
  });
});

describe('CLI — "stop" statement exit codes (§15.7)', () => {
  function withStopFile(source, run) {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-cli-'));
    const file = join(dir, 'stop.pr');
    writeFileSync(file, source);
    try {
      run(file);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test('a bare "stop" exits 0 and halts before later output', () => {
    withStopFile('say "before"\nstop\nsay "after"\n', (file) => {
      const { status, stdout } = pari([file]);
      assert.equal(status, 0);
      assert.equal(stdout, 'before\n');
    });
  });

  test('"stop <n>" exits with exactly code n, overriding the normal 0/1/2/3 scheme', () => {
    withStopFile('stop 5\n', (file) => {
      const { status } = pari([file]);
      assert.equal(status, 5);
    });
  });

  test('"stop" is reported as a clean halt under --runtime, not an error', () => {
    withStopFile('stop 5\n', (file) => {
      const { status, stdout } = pari(['--runtime', file]);
      assert.equal(status, 5);
      assert.match(stdout, /stopped \(exit code 5\)/);
      assert.doesNotMatch(stdout, /Execution state:\s+error/);
    });
  });
});

describe('CLI — Arrays (§Arrays)', () => {
  function withTempFile(source, run) {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-cli-arrays-'));
    const file = join(dir, 'array-test.pr');
    writeFileSync(file, source);
    try {
      run(file);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test('pari examples/arrays.pr runs and exits 0 with the documented output', () => {
    const { status, stdout, stderr } = pari([join(EXAMPLES, 'arrays.pr')]);
    assert.equal(status, ExitCode.SUCCESS);
    assert.equal(stderr, '');
    assert.match(stdout, /Average score: 88\.5/);
  });

  test('--tokens reports "box" as a KEYWORD and "[" / "]" as PUNCTUATION', () => {
    withTempFile('hold nums = box(1, 2)\nsay nums[0]\n', (file) => {
      const { status, stdout } = pari(['--tokens', file]);
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /KEYWORD\s+box/);
      assert.match(stdout, /PUNCTUATION\s+\[/);
      assert.match(stdout, /PUNCTUATION\s+\]/);
    });
  });

  test('--ast renders ArrayLiteral, ArrayAccess, and ArrayAssignment nodes', () => {
    withTempFile('hold nums = box(1, 2, 3)\nsay nums[0]\nnums[1] = 99\n', (file) => {
      const { status, stdout } = pari(['--ast', file]);
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /ArrayLiteral/);
      assert.match(stdout, /ArrayAccess/);
      assert.match(stdout, /ArrayAssignment/);
    });
  });

  test('--analyze reports the "nums" symbol as Array-typed, with no errors', () => {
    withTempFile('hold nums = box(1, 2, 3)\n', (file) => {
      const { status, stdout } = pari(['--analyze', file]);
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /nums/);
      assert.match(stdout, /Array/);
      assert.match(stdout, /No semantic errors found\./);
    });
  });

  test('--analyze reports P025 for indexing a statically non-array value', () => {
    withTempFile('hold x = 5\nsay x[0]\n', (file) => {
      const { status, stderr } = pari(['--analyze', file]);
      assert.equal(status, ExitCode.COMPILER_ERROR);
      assert.match(stderr, /P025/);
    });
  });

  test('--runtime shows the global array variable\'s type as Array', () => {
    withTempFile('hold nums = box(1, 2, 3)\n', (file) => {
      const { status, stdout } = pari(['--runtime', file]);
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /nums = \[1, 2, 3\] \(Array\)/);
    });
  });

  test('an out-of-range index exits 2 with a clean P024 message, no raw stack trace', () => {
    withTempFile('hold nums = box(1, 2, 3)\nsay nums[10]\n', (file) => {
      const { status, stdout, stderr } = pari([file]);
      assert.equal(status, ExitCode.RUNTIME_ERROR);
      assert.match(stderr, /P024/);
      assertNoRawStackTrace(stdout + stderr);
    });
  });

  test('a negative index exits 2 with a clean P027 message', () => {
    withTempFile('hold nums = box(1, 2, 3)\nsay nums[-1]\n', (file) => {
      const { status, stderr } = pari([file]);
      assert.equal(status, ExitCode.RUNTIME_ERROR);
      assert.match(stderr, /P027/);
    });
  });

  test('an array element type mismatch exits 1 with a clean P026 message', () => {
    withTempFile('hold nums = box(1, "two", 3)\n', (file) => {
      const { status, stderr } = pari(['--analyze', file]);
      assert.equal(status, ExitCode.COMPILER_ERROR);
      assert.match(stderr, /P026/);
    });
  });
});

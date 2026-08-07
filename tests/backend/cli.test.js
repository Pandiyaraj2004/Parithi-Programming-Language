/**
 * Adaptive Execution Engine — CLI integration tests (Phase 14). Spawns the
 * real `bin/pari.js` as a subprocess, exactly like tests/cli.test.js, so
 * these exercise real automatic backend selection, real forced `--backend`
 * dispatch (including the real native x86-64 -> temp .exe -> subprocess
 * path), and the real `--explain-backend` report — nothing mocked.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { ExitCode } from '../../src/cli/exit-codes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PARI_BIN = join(__dirname, '..', '..', 'bin', 'pari.js');
const EXAMPLES = join(__dirname, '..', '..', 'examples');

function pari(args, options = {}) {
  const result = spawnSync(process.execPath, [PARI_BIN, ...args], { encoding: 'utf-8', ...options });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

function withTempFile(source, run) {
  const dir = mkdtempSync(join(tmpdir(), 'parithi-backend-cli-'));
  const file = join(dir, 'program.pr');
  writeFileSync(file, source);
  try {
    run(file, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Automatic backend selection (no --backend flag)', () => {
  test('a say-only String-literal program automatically selects Native x86-64', () => {
    withTempFile('say "Hello from auto-native"\n', (file) => {
      const { status, stdout } = pari([file, '--verbose']);
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /Backend: Native x86-64/);
      assert.match(stdout, /Hello from auto-native/);
    });
  });

  test('a program using variables automatically selects Bytecode + PVM (native is unsupported, bytecode is next in priority)', () => {
    withTempFile('hold x = 5\nhold y = 10\nsay x + y\n', (file) => {
      const { status, stdout } = pari([file, '--verbose']);
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /Backend: Bytecode \+ PVM/);
      assert.match(stdout, /^15$/m);
    });
  });

  test('without --verbose, automatic selection prints only the program\'s own output — no backend banner', () => {
    withTempFile('say "quiet"\n', (file) => {
      const { stdout } = pari([file]);
      assert.equal(stdout, 'quiet\n');
    });
  });

  test('the backend banner always appears before the program\'s own output', () => {
    withTempFile('say "after the banner"\n', (file) => {
      const { stdout } = pari([file, '--verbose']);
      const bannerIndex = stdout.indexOf('Backend:');
      const outputIndex = stdout.indexOf('after the banner');
      assert.ok(bannerIndex >= 0 && outputIndex > bannerIndex);
    });
  });

  test('exit codes from automatic selection still follow "stop <n>" semantics', () => {
    withTempFile('hold x = 1\nsay "before"\nstop 7\nsay "after"\n', (file) => {
      const { status, stdout } = pari([file]);
      assert.equal(status, 7);
      assert.equal(stdout, 'before\n');
    });
  });

  test('a runtime error under automatic selection (bytecode path) still exits 2 with a clean diagnostic', () => {
    withTempFile('hold x = 10 / 0\n', (file) => {
      const { status, stderr } = pari([file]);
      assert.equal(status, ExitCode.RUNTIME_ERROR);
      assert.match(stderr, /Error P020/);
    });
  });

  test('a semantic error is reported before any backend is even selected', () => {
    withTempFile('age = "Twenty"\n', (file) => {
      const { status, stderr } = pari([file]);
      assert.equal(status, ExitCode.COMPILER_ERROR);
      assert.doesNotMatch(stderr, /Backend:/);
    });
  });
});

describe('Backend parity — Native, Bytecode, and Interpreter agree on the same program', () => {
  test('a native-eligible program produces identical stdout and exit code on all three backends', () => {
    withTempFile('say "parity check"\nsay "second line"\n', (file) => {
      const viaNative = pari([file, '--backend', 'native']);
      const viaBytecode = pari([file, '--backend', 'bytecode']);
      const viaInterpreter = pari([file, '--backend', 'interpreter']);
      assert.equal(viaNative.status, ExitCode.SUCCESS);
      assert.equal(viaBytecode.status, ExitCode.SUCCESS);
      assert.equal(viaInterpreter.status, ExitCode.SUCCESS);
      assert.equal(viaNative.stdout, viaBytecode.stdout);
      assert.equal(viaBytecode.stdout, viaInterpreter.stdout);
    });
  });

  test('a non-native-eligible program produces identical stdout and exit code on Bytecode and Interpreter', () => {
    withTempFile('task add(a, b)\n    return a + b\nend task\nhold total = add(3, 4)\nsay total\n', (file) => {
      const viaBytecode = pari([file, '--backend', 'bytecode']);
      const viaInterpreter = pari([file, '--backend', 'interpreter']);
      assert.equal(viaBytecode.status, viaInterpreter.status);
      assert.equal(viaBytecode.stdout, viaInterpreter.stdout);
    });
  });

  test('"stop <n>" produces the same exit code on Bytecode and Interpreter when forced', () => {
    withTempFile('say "before"\nstop 5\nsay "after"\n', (file) => {
      const viaBytecode = pari([file, '--backend', 'bytecode']);
      const viaInterpreter = pari([file, '--backend', 'interpreter']);
      assert.equal(viaBytecode.status, 5);
      assert.equal(viaInterpreter.status, 5);
      assert.equal(viaBytecode.stdout, 'before\n');
      assert.equal(viaInterpreter.stdout, 'before\n');
    });
  });
});

describe('Forced --backend selection never silently falls back', () => {
  test('--backend native on a native-eligible program runs it via native', () => {
    withTempFile('say "forced native"\n', (file) => {
      const { status, stdout } = pari([file, '--backend', 'native', '--verbose']);
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /Backend: Native x86-64/);
      assert.match(stdout, /forced native/);
    });
  });

  test('--backend native on a program it cannot run exits with a clean diagnostic and produces NO program output at all', () => {
    withTempFile('hold x = 1\nsay "should never print"\n', (file) => {
      const { status, stdout, stderr } = pari([file, '--backend', 'native']);
      assert.equal(status, ExitCode.COMPILER_ERROR);
      assert.doesNotMatch(stdout, /should never print/);
      assert.match(stderr, /Error P030/);
      assert.match(stderr, /cannot run/);
    });
  });

  test('--backend bytecode always succeeds (bytecode supports the whole language today)', () => {
    withTempFile('hold nums = box(1, 2, 3)\nsay nums[1]\n', (file) => {
      const { status, stdout } = pari([file, '--backend', 'bytecode']);
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /^2$/m);
    });
  });

  test('--backend interpreter always succeeds (the reference implementation)', () => {
    withTempFile('hold nums = box(1, 2, 3)\nsay nums[1]\n', (file) => {
      const { status, stdout } = pari([file, '--backend', 'interpreter']);
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /^2$/m);
    });
  });

  test('an unknown --backend value is a clean CLI usage error (exit 3), never silently ignored', () => {
    withTempFile('say "irrelevant"\n', (file) => {
      const { status, stderr } = pari([file, '--backend', 'quantum']);
      assert.equal(status, ExitCode.USAGE_ERROR);
      assert.match(stderr, /Unknown backend "quantum"/);
    });
  });

  test('--backend with no value after it is a clean CLI usage error', () => {
    withTempFile('say "irrelevant"\n', (file) => {
      const { status, stderr } = pari([file, '--backend']);
      assert.equal(status, ExitCode.USAGE_ERROR);
      assert.match(stderr, /Missing backend name/);
    });
  });

  test('--backend works whether it appears before or after the filename', () => {
    withTempFile('say "either order"\n', (file) => {
      const before = pari(['--backend', 'interpreter', file]);
      const after = pari([file, '--backend', 'interpreter']);
      assert.equal(before.status, ExitCode.SUCCESS);
      assert.equal(after.status, ExitCode.SUCCESS);
      assert.equal(before.stdout, after.stdout);
    });
  });
});

describe('--explain-backend (analysis only, never executes)', () => {
  test('reports SUPPORTED for all three backends on a native-eligible program, selecting Native', () => {
    withTempFile('say "explain me"\n', (file) => {
      const { status, stdout } = pari(['--explain-backend', file]);
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /Native x86-64\s+SUPPORTED/);
      assert.match(stdout, /Bytecode \+ PVM\s+SUPPORTED/);
      assert.match(stdout, /Tree-Walking Interpreter\s+SUPPORTED/);
      assert.match(stdout, /Selected: Native x86-64/);
    });
  });

  test('reports UNSUPPORTED for Native with a specific reason, and selects Bytecode, for a variable-using program', () => {
    withTempFile('hold x = 1\nsay x\n', (file) => {
      const { status, stdout } = pari(['--explain-backend', file]);
      assert.equal(status, ExitCode.SUCCESS);
      assert.match(stdout, /Native x86-64\s+UNSUPPORTED/);
      assert.match(stdout, /Reason: Feature "VariableDeclaration" is not supported/);
      assert.match(stdout, /Selected: Bytecode \+ PVM/);
    });
  });

  test('never executes the program — its own output never appears in stdout', () => {
    withTempFile('say "should not execute"\n', (file) => {
      const { stdout } = pari(['--explain-backend', file]);
      assert.doesNotMatch(stdout, /^should not execute$/m);
    });
  });

  test('a semantic error is reported instead of a backend analysis', () => {
    withTempFile('age = "Twenty"\n', (file) => {
      const { status, stderr } = pari(['--explain-backend', file]);
      assert.equal(status, ExitCode.COMPILER_ERROR);
      assert.match(stderr, /semantic error/);
    });
  });

  test('rejects a non-.pr file the same way every other dedicated mode does', () => {
    const dir = mkdtempSync(join(tmpdir(), 'parithi-backend-cli-'));
    const txtFile = join(dir, 'file.txt');
    writeFileSync(txtFile, 'say "x"\n');
    try {
      const { status, stderr } = pari(['--explain-backend', txtFile]);
      assert.equal(status, ExitCode.USAGE_ERROR);
      assert.match(stderr, /Expected a "\.pr" source file/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Every existing example program still runs correctly under automatic selection', () => {
  // calculator.pr/grade-checker.pr need stdin input (see tests/cli.test.js's
  // own exclusion of them from its no-input loops) — not this suite's concern.
  for (const name of ['hello', 'variables', 'functions', 'loops', 'ifelse', 'fizzbuzz', 'while-break-continue', 'stop', 'arrays']) {
    test(`pari ${name}.pr (automatic) exits the same as --backend interpreter`, () => {
      const automatic = pari([join(EXAMPLES, `${name}.pr`)]);
      const forced = pari([join(EXAMPLES, `${name}.pr`), '--backend', 'interpreter']);
      assert.equal(automatic.status, forced.status, `${name}.pr: exit code mismatch`);
      assert.equal(automatic.stdout, forced.stdout, `${name}.pr: stdout mismatch`);
    });
  }
});

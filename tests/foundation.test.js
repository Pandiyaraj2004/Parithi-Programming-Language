/**
 * Phase 0 smoke tests — verifies the foundation pieces that actually have
 * behavior in this phase: the error framework, the keyword table, and CLI
 * argument parsing. Lexer/Parser/Semantic/Interpreter get their own suites
 * once each phase lands.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CompilerError, ParithiRuntimeError, SourceLocation, ERROR_CODES } from '../src/errors/index.js';
import { parseArgs } from '../src/cli/args.js';
import { CliUsageError } from '../src/cli/cli-error.js';
import { isKeyword, KEYWORDS } from '../src/lexer/keywords.js';

test('ERROR_CODES contains all thirty documented codes (P001-P030)', () => {
  assert.equal(Object.keys(ERROR_CODES).length, 30);
});

test('CompilerError formats with code, message, location, and hint', () => {
  const location = new SourceLocation('hello.pr', 4, 1);
  const error = new CompilerError(
    'P001',
    'Variable "score" is not declared.',
    location,
    'declare it first with "hold score = ...".',
  );
  const formatted = error.format();
  assert.match(formatted, /Error P001:/);
  assert.match(formatted, /hello\.pr:4:1/);
  assert.match(formatted, /Hint:/);
});

test('ParithiRuntimeError carries its error code', () => {
  const error = new ParithiRuntimeError('P006', 'Cannot convert "abc" to Number.');
  assert.equal(error.code, 'P006');
});

test('KEYWORDS contains exactly 26 reserved words, including choose/option/other/is/stop/box', () => {
  assert.equal(KEYWORDS.length, 26);
  assert.ok(isKeyword('choose'));
  assert.ok(isKeyword('option'));
  assert.ok(isKeyword('other'));
  assert.ok(isKeyword('is'));
  assert.ok(isKeyword('stop'));
  assert.ok(isKeyword('box'));
  assert.ok(!isKeyword('score'));
});

test('parseArgs treats a plain filename as run mode', () => {
  assert.deepEqual(parseArgs(['hello.pr']), {
    mode: 'run', file: 'hello.pr', verbose: false, optimize: false, asm: false, ir: false, outputPath: null, programArgs: [],
  });
});

test('parseArgs captures trailing words as the program\'s own arguments() (Phase 13, §32.9)', () => {
  assert.deepEqual(parseArgs(['hello.pr', 'foo', 'bar']).programArgs, ['foo', 'bar']);
  assert.deepEqual(parseArgs(['--run-bytecode', 'hello.pr', 'foo']).programArgs, ['foo']);
});

test('parseArgs recognizes --version and --help', () => {
  assert.equal(parseArgs(['--version']).mode, 'version');
  assert.equal(parseArgs(['--help']).mode, 'help');
  assert.equal(parseArgs(['-h']).mode, 'help');
});

// Phase 7: a bare "pari" with no arguments is a CLI usage error (exit 3),
// not a silent fallback to --help — matching compilers like rustc/tsc,
// which demand an input file rather than defaulting to a help screen.
test('parseArgs treats no arguments as a usage error, not a silent --help fallback', () => {
  assert.throws(() => parseArgs([]), (err) => {
    assert.ok(err instanceof CliUsageError);
    assert.match(err.message, /No input file specified/);
    return true;
  });
});

test('parseArgs rejects an unknown flag with a CliUsageError', () => {
  assert.throws(() => parseArgs(['--bogus']), (err) => {
    assert.ok(err instanceof CliUsageError);
    return true;
  });
});

test('parseArgs suggests the closest known flag for a typo', () => {
  assert.throws(() => parseArgs(['--toekns', 'hello.pr']), (err) => {
    assert.match(err.hint, /Did you mean "--tokens"\?/);
    return true;
  });
});

test('parseArgs reports a missing file after a flag with a usage hint', () => {
  assert.throws(() => parseArgs(['--tokens']), (err) => {
    assert.ok(err instanceof CliUsageError);
    assert.match(err.message, /Missing source file after "--tokens"/);
    return true;
  });
});

test('parseArgs extracts --verbose regardless of position', () => {
  assert.equal(parseArgs(['hello.pr', '--verbose']).verbose, true);
  assert.equal(parseArgs(['--verbose', 'hello.pr']).verbose, true);
  assert.equal(parseArgs(['hello.pr']).verbose, false);
});

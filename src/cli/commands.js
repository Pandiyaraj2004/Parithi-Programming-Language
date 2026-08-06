/**
 * CLI command dispatch (MASTER_DOCUMENT.md §19).
 * Validates arguments, reads the source file, and runs the full pipeline —
 * Lexer → Parser → Semantic Analyzer → Interpreter — against it. Execution
 * only proceeds past semantic analysis if it found zero diagnostics.
 *
 * Phase 7: every exit path now sets one of the four documented exit codes
 * (ExitCode.SUCCESS/COMPILER_ERROR/RUNTIME_ERROR/USAGE_ERROR — see
 * exit-codes.js) instead of a flat `1`, so a calling script (or a human)
 * can tell "your program has a bug" (1/2) apart from "you typed the
 * command wrong" (3). File-handling failures (missing file, wrong
 * extension, unreadable file, a directory where a file was expected) are
 * all CLI usage errors, reported the same way a bad flag is.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, resolve, basename } from 'node:path';
import { parseArgs } from './args.js';
import { logger } from '../utils/logger.js';
import { colors } from '../utils/colors.js';
import { Lexer } from '../lexer/lexer.js';
import { TokenType } from '../lexer/token.js';
import { Parser } from '../parser/parser.js';
import { formatAST } from '../ast/ast-printer.js';
import { SemanticAnalyzer } from '../semantic/analyzer.js';
import { Interpreter } from '../interpreter/interpreter.js';
import { printError } from '../utils/messages.js';
import { ExitCode } from './exit-codes.js';
import { CliUsageError } from './cli-error.js';
import { suggestSimilarFile } from './suggestions.js';
import { buildHelpText, buildVersionText } from './screens.js';

export function runCli(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    reportUsageError(err);
    return;
  }

  const { mode, file, verbose } = options;

  switch (mode) {
    case 'help':
      console.log(buildHelpText());
      return;
    case 'version':
      console.log(buildVersionText());
      return;
    case 'tokens':
      withSourceFile(file, printTokens);
      return;
    case 'ast':
      withSourceFile(file, printASTCommand);
      return;
    case 'analyze':
      withSourceFile(file, printAnalysis);
      return;
    case 'runtime':
      withSourceFile(file, (source, filePath) => printRuntimeDiagnostics(source, filePath, { verbose }));
      return;
    case 'run':
      withSourceFile(file, (source, filePath) => runProgram(source, filePath, { verbose }));
      return;
    default:
      // Unreachable: parseArgs only ever returns one of the modes above —
      // kept as a defensive guard rather than an assumption.
      reportUsageError(new CliUsageError(`Unknown command mode "${mode}".`));
  }
}

/** Prints a CliUsageError (or any error with .format()) and exits 3 — never a raw stack trace. */
function reportUsageError(err) {
  printError(err);
  process.exitCode = ExitCode.USAGE_ERROR;
}

/**
 * Resolves and validates `file` before handing its contents to `action`.
 * Every failure here is a CLI usage error (exit 3) — the program's own
 * source is never even reached, so it can't be a compiler/runtime error.
 */
function withSourceFile(file, action) {
  const filePath = resolve(process.cwd(), file);

  if (!existsSync(filePath)) {
    const suggestion = suggestSimilarFile(filePath);
    reportUsageError(new CliUsageError(
      `Source file not found: "${file}"`,
      suggestion ? `Did you mean "${suggestion}"?` : 'Check the path and try again.',
    ));
    return;
  }

  const stats = statSync(filePath);
  if (stats.isDirectory()) {
    reportUsageError(new CliUsageError(
      `"${file}" is a directory, not a Parithi source file.`,
      'Point pari at a ".pr" file inside it instead.',
    ));
    return;
  }

  if (extname(filePath) !== '.pr') {
    reportUsageError(new CliUsageError(
      `Expected a ".pr" source file, got "${file}".`,
      `Parithi source files must end in ".pr" — try "${basename(filePath, extname(filePath))}.pr".`,
    ));
    return;
  }

  let source;
  try {
    source = readFileSync(filePath, 'utf-8');
  } catch (err) {
    reportUsageError(new CliUsageError(`Could not read "${file}": ${err.message}`));
    return;
  }

  action(source, filePath);
}

/** True for CompilerError/ParseError/MultiParseError/SemanticError — anything with a printable .format(). */
function isReportable(err) {
  return err != null && typeof err.format === 'function';
}

/** Lexes and parses `source`, returning the Program node or null (after printing) on failure. */
function lexAndParse(source, filePath) {
  try {
    const tokens = new Lexer(source, filePath).tokenize();
    return { program: new Parser(tokens, filePath).parseProgram(), tokenCount: tokens.length };
  } catch (err) {
    if (!isReportable(err)) throw err;
    printError(err);
    process.exitCode = ExitCode.COMPILER_ERROR;
    return null;
  }
}

/** Prints every diagnostic in the list, each on its own paragraph. */
function printDiagnosticList(diagnostics) {
  diagnostics.forEach((diagnostic, index) => {
    printError(diagnostic);
    if (index < diagnostics.length - 1) console.log('');
  });
}

function runProgram(source, filePath, { verbose = false } = {}) {
  const startedAt = verbose ? performance.now() : 0;

  const parsed = lexAndParse(source, filePath);
  if (!parsed) return;

  const analysis = new SemanticAnalyzer(parsed.program, filePath).analyze();
  if (!analysis.success) {
    logger.error(`${analysis.diagnostics.length} semantic error(s) found — run "pari --analyze" for details.`);
    console.log('');
    printDiagnosticList(analysis.diagnostics);
    process.exitCode = ExitCode.COMPILER_ERROR;
    return;
  }

  const interpreter = new Interpreter(filePath);
  try {
    interpreter.run(parsed.program);
  } catch (err) {
    if (!isReportable(err)) throw err;
    printError(err);
    process.exitCode = ExitCode.RUNTIME_ERROR;
    return;
  }

  // A "stop <code>" statement (§15.7) sets its own exit code deliberately —
  // it overrides the normal 0/1/2/3 scheme entirely, since the program
  // itself chose this code, not the CLI inferring compiler/runtime/usage
  // success or failure.
  if (interpreter.exitCode !== null) {
    process.exitCode = interpreter.exitCode;
  }

  if (verbose) {
    const elapsedMs = performance.now() - startedAt;
    console.log(colors.dim(`\n✓ Completed in ${elapsedMs.toFixed(2)}ms.`));
  }
}

/**
 * `pari --runtime` — debugging only; normal `pari <file>` execution is
 * completely unaffected by this command's existence. Runs the program for
 * real (same pipeline as `runProgram`), then reports the runtime's final
 * state: the environment/call stack depth (both should read back to
 * baseline after a successful run — see EnvironmentStack's leak-proofing),
 * the global scope's variables, and — only if execution failed — the
 * pinned call stack and environment depth at the moment of failure, since
 * neither is popped on a genuine error (see interpreter.js's class doc).
 */
function printRuntimeDiagnostics(source, filePath, { verbose = false } = {}) {
  const parsed = lexAndParse(source, filePath);
  if (!parsed) return;

  const analysis = new SemanticAnalyzer(parsed.program, filePath).analyze();
  if (!analysis.success) {
    logger.error(`${analysis.diagnostics.length} semantic error(s) found — run "pari --analyze" for details.`);
    process.exitCode = ExitCode.COMPILER_ERROR;
    return;
  }

  const interpreter = new Interpreter(filePath);
  const startedAt = performance.now();
  let error = null;
  try {
    interpreter.run(parsed.program);
  } catch (err) {
    if (!isReportable(err)) throw err;
    error = err;
  }
  const elapsedMs = performance.now() - startedAt;
  const stopped = !error && interpreter.exitCode !== null; // halted early via "stop" (§15.7), not an error

  const stateLabel = error
    ? colors.red('error')
    : stopped
      ? colors.yellow(`stopped (exit code ${interpreter.exitCode})`)
      : colors.green('idle (completed)');
  const depthNote = error
    ? '(pinned at point of failure)'
    : stopped
      ? '(stopped mid-execution — not necessarily at baseline)'
      : '(back to global — no leaks)';
  const callDepthNote = error
    ? '(pinned at point of failure)'
    : stopped
      ? '(stopped mid-execution — not necessarily unwound)'
      : '(empty — fully unwound)';

  console.log(colors.bold(`Runtime Diagnostics for ${filePath}`));
  console.log(colors.dim('-'.repeat(72)));
  console.log(`Execution state:        ${stateLabel}`);
  console.log(`Environment stack depth: ${interpreter.runtime.environments.depth} ${depthNote}`);
  console.log(`Call stack depth:        ${interpreter.runtime.callStack.frames.length} ${callDepthNote}`);
  console.log(`Execution time:          ${elapsedMs.toFixed(2)}ms`);
  console.log('');

  console.log(colors.bold('Global Scope Variables:'));
  const bindings = interpreter.runtime.globalEnvironment.ownBindings();
  if (bindings.length === 0) {
    console.log(colors.dim('  (none declared)'));
  } else {
    for (const binding of bindings) {
      if (binding.runtimeValue?.kind === 'function') {
        console.log(`  ${binding.name}(${binding.runtimeValue.params.join(', ')}) — Function`);
      } else {
        console.log(`  ${binding.name} = ${binding.runtimeValue} (${binding.runtimeValue.type}${binding.mutable ? '' : ', constant'})`);
      }
    }
  }

  if (error) {
    console.log('');
    console.log(colors.bold('Execution Frames at time of failure (innermost first):'));
    const frames = interpreter.runtime.callStack.describeFrames();
    if (frames.length === 0) {
      console.log(colors.dim('  (failure occurred at the top level, outside any function call)'));
    } else {
      for (const frame of frames) {
        console.log(`  ${frame.name}(...) called at ${frame.location}`);
        for (const binding of frame.bindings) console.log(`    ${binding}`);
      }
    }
    console.log('');
    printError(error);
    process.exitCode = ExitCode.RUNTIME_ERROR;
    return;
  }

  if (stopped) {
    process.exitCode = interpreter.exitCode; // "stop <code>" overrides the normal exit-code scheme (§15.7)
  }

  if (verbose) {
    console.log(colors.dim(`\n✓ Completed in ${elapsedMs.toFixed(2)}ms.`));
  }
}

function printTokens(source, filePath) {
  let tokens;
  try {
    tokens = new Lexer(source, filePath).tokenize();
  } catch (err) {
    if (!isReportable(err)) throw err;
    printError(err);
    process.exitCode = ExitCode.COMPILER_ERROR;
    return;
  }

  console.log(colors.bold(`Tokens for ${filePath}`));
  console.log(colors.dim('-'.repeat(72)));
  console.log(padColumn('TYPE', 12) + padColumn('LEXEME', 18) + padColumn('VALUE', 16) + 'LINE:COL');
  console.log(colors.dim('-'.repeat(72)));

  for (const token of tokens) {
    const lexemeDisplay = token.type === TokenType.EOF ? '<eof>' : token.lexeme;
    console.log(
      padColumn(token.type, 12) +
        padColumn(lexemeDisplay, 18) +
        padColumn(JSON.stringify(token.value), 16) +
        `${token.line}:${token.column}`,
    );
  }

  console.log(colors.dim('-'.repeat(72)));
  console.log(`${tokens.length} tokens`);
}

function printASTCommand(source, filePath) {
  const result = lexAndParse(source, filePath);
  if (!result) return;

  console.log(colors.bold(`AST for ${filePath}`));
  console.log(colors.dim('-'.repeat(72)));
  console.log(formatAST(result.program));
}

function printAnalysis(source, filePath) {
  const parsed = lexAndParse(source, filePath);
  if (!parsed) return;

  const result = new SemanticAnalyzer(parsed.program, filePath).analyze();

  console.log(colors.bold(`Semantic Analysis for ${filePath}`));
  console.log(colors.dim('-'.repeat(72)));
  console.log(formatSymbolTables(result.allScopes));

  if (result.success) {
    console.log(colors.green('No semantic errors found.'));
    return;
  }

  console.log(colors.bold(`${result.diagnostics.length} semantic error(s):`));
  console.log('');
  printDiagnosticList(result.diagnostics);
  process.exitCode = ExitCode.COMPILER_ERROR;
}

function formatSymbolTables(scopes) {
  const lines = [];

  for (const scope of scopes) {
    const label = scope.kind === 'global' ? 'Global Scope' : `${capitalize(scope.kind)} Scope (level ${scope.level})`;
    lines.push(colors.bold(label));

    const symbols = scope.ownSymbols();
    if (symbols.length === 0) {
      lines.push(colors.dim('  (no declarations)'));
    } else {
      for (const symbol of symbols) {
        lines.push(`  ${symbol.name}`);
        if (symbol.kind === 'function') {
          lines.push(`    (${symbol.params.join(', ')}) -> ${symbol.returnType}`);
          lines.push('    Function');
        } else {
          lines.push(`    ${symbol.dataType}`);
          lines.push(`    ${capitalize(symbol.kind)}`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function padColumn(text, width) {
  const str = String(text);
  return str.length >= width ? `${str} ` : str + ' '.repeat(width - str.length);
}

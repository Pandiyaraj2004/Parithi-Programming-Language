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

import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { extname, resolve, relative, basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { parseArgs } from './args.js';
import { logger } from '../utils/logger.js';
import { colors } from '../utils/colors.js';
import { Lexer } from '../lexer/lexer.js';
import { TokenType } from '../lexer/token.js';
import { Parser } from '../parser/parser.js';
import { formatAST } from '../ast/ast-printer.js';
import { SemanticAnalyzer } from '../semantic/analyzer.js';
import { Interpreter } from '../interpreter/interpreter.js';
import { generateBytecode, validateBytecode, formatBytecodeText, writeBytecodeBinary, readBytecodeBinary } from '../bytecode/index.js';
import { VirtualMachine, compileFromSource } from '../vm/index.js';
import { optimizeBytecode, formatOptimizerReport } from '../optimizer/index.js';
import { compileNative, formatAsmListing } from '../native/native-compiler.js';
import { compileProgramToNative } from '../native/codegen/native-codegen.js';
import { buildPE64Executable } from '../native/pe/pe-writer.js';
import { formatIR } from '../native/ir/ir-printer.js';
import { formatOptimizerStatistics } from '../native/ir/optimizer/index.js';
import { selectBackend, evaluateBackend } from '../backend/selector.js';
import { setProgramArguments } from '../stdlib/system/program-args.js';
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

  const { mode, file, verbose, optimize, asm, ir, emitIr, emitOptimizedIr, optimizerStats, outputPath, backend, programArgs } = options;
  // Phase 13 (§32.9): available to the running program via arguments() —
  // set once per process, before any mode below can execute Parithi code.
  setProgramArguments(programArgs ?? []);

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
    case 'bytecode':
      withSourceFile(file, (source, filePath) => printBytecode(source, filePath, { optimize }));
      return;
    case 'compile':
      withSourceFile(file, (source, filePath) => compileToFile(source, filePath, { optimize }));
      return;
    case 'stats':
      // Phase 12 (§31): "pari <file.pr> --stats" — always runs the
      // optimizer (that's the whole point of this command) regardless of
      // whether --optimize was also passed.
      withSourceFile(file, printOptimizerStats);
      return;
    case 'disassemble':
      // Phase 12 (§31): "pari <file.pr> --disassemble" and
      // "pari <file.pr> --optimize" (with no other mode flag, see the
      // 'run' case below) are intentionally the same display — see
      // printOptimizedBytecode's class doc.
      withSourceFile(file, printOptimizedBytecode);
      return;
    case 'native':
      // Phase 13 native backend — a genuine additional backend alongside
      // the Interpreter and Bytecode/PVM, not a replacement for either
      // (§1/§23 of the native-compiler brief). Only a small subset of the
      // language compiles today — see native-codegen.js's own class doc.
      withSourceFile(file, (source, filePath) => compileNativeToFile(source, filePath, { asm, ir, emitIr, emitOptimizedIr, optimizerStats, outputPath }));
      return;
    case 'explain-backend':
      // Phase 14 (Adaptive Execution Engine) — analysis only, exactly like
      // --ast/--bytecode/etc.: never executes the program, just reports
      // each backend's capability verdict and which one automatic
      // selection would pick and why.
      withSourceFile(file, printExplainBackend);
      return;
    case 'run-bytecode':
      // Phase 11: accepts either a compiled .pbc file (loaded directly) or
      // a .pr source file (compiled to bytecode in memory, no file
      // written) — auto-detected by extension, same spirit as plain
      // `pari <file>` auto-detecting .pr vs .pbc just below. Phase 12 adds
      // --optimize here: runs the loaded/compiled bytecode through the
      // optimizer before executing it on the PVM.
      if (extname(file) === '.pbc') {
        withBytecodeFile(file, (buffer, filePath) => runBytecodeFile(buffer, filePath, { verbose, optimize }));
      } else {
        withSourceFile(file, (source, filePath) => runBytecodeFromSource(source, filePath, { verbose, optimize }));
      }
      return;
    case 'run':
      // Phase 11: a bare `pari <file>` now auto-detects .pbc (run on the
      // PVM) vs. everything else (the existing .pr / Tree-Walking
      // Interpreter path, completely unchanged below).
      if (extname(file) === '.pbc') {
        // Phase 12: unlike the .pr branch below, `pari hello.pbc` has
        // always been execute-only (there's no pre-existing "just show me
        // hello.pbc" behavior to preserve) — so --optimize here means
        // "execute it, but optimized first," not "display instead."
        withBytecodeFile(file, (buffer, filePath) => runBytecodeFile(buffer, filePath, { verbose, optimize }));
        return;
      }
      if (optimize) {
        // Phase 12 (§31 CLI examples): "pari hello.pr --optimize" is a
        // display command, matching --bytecode/--ast/--tokens' own
        // "introspect, don't execute" convention for a .pr file — to
        // actually EXECUTE optimized bytecode end-to-end on the PVM,
        // combine --optimize with --run-bytecode, or run a `--compile
        // --optimize`-produced .pbc file directly.
        withSourceFile(file, printOptimizedBytecode);
        return;
      }
      // Phase 14 (Adaptive Execution Engine): with no explicit --backend,
      // BackendSelector statically evaluates Native -> Bytecode ->
      // Interpreter capability (never by partially executing one backend
      // and retrying on another) and runs the first that supports this
      // program. `--backend <name>` forces one specific backend instead
      // and never silently falls back to a different one.
      withSourceFile(file, (source, filePath) => runWithBackend(source, filePath, { verbose, backend }));
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

/**
 * Phase 14 (Adaptive Execution Engine) — the bare `pari <file.pr>` entry
 * point (automatic selection) and `pari <file.pr> --backend <name>` (forced
 * selection) share this one function: both lex/parse/analyze exactly
 * once, decide on exactly one backend BEFORE anything executes, then hand
 * off to that backend's own execute-helper below. No backend is ever
 * partially run and then abandoned for another — the capability checks in
 * src/backend/capability.js are pure static AST inspection, never a trial
 * execution.
 */
function runWithBackend(source, filePath, { verbose = false, backend = null } = {}) {
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

  const program = parsed.program;
  let selectedId;
  let selectedLabel;

  if (backend) {
    const evaluation = evaluateBackend(backend, program, filePath);
    if (!evaluation.supported) {
      // Forced backends never silently fall back to a different one —
      // a clean diagnostic instead, reusing the exact same error the
      // automatic path's capability check would have reported.
      logger.error(`The "${evaluation.label}" backend cannot run "${basename(filePath)}".`);
      console.log('');
      printError(evaluation.error);
      process.exitCode = ExitCode.COMPILER_ERROR;
      return;
    }
    selectedId = evaluation.id;
    selectedLabel = evaluation.label;
  } else {
    const selection = selectBackend(program, filePath);
    selectedId = selection.selected;
    selectedLabel = selection.selectedLabel;
  }

  if (verbose) {
    console.log(colors.dim(`Backend: ${selectedLabel}`));
    console.log('');
  }

  switch (selectedId) {
    case 'native':
      executeNative(program, filePath, { verbose });
      return;
    case 'bytecode':
      executeBytecodeProgram(program, filePath, { verbose });
      return;
    case 'interpreter':
      executeInterpreterProgram(program, filePath, { verbose });
      return;
  }
}

/** Runs an already-validated `program` on the Tree-Walking Interpreter — the exact behavior `pari <file.pr>` always had before Phase 14. */
function executeInterpreterProgram(program, filePath, { verbose = false } = {}) {
  const startedAt = verbose ? performance.now() : 0;

  const interpreter = new Interpreter(filePath);
  try {
    interpreter.run(program);
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

/** Runs an already-validated `program` on the Bytecode Generator + PVM — generates bytecode in memory (no .pbc file written), exactly like `--run-bytecode <file.pr>` already does. */
function executeBytecodeProgram(program, filePath, { verbose = false } = {}) {
  const bytecode = generateBytecode(program);
  const { valid, errors } = validateBytecode(bytecode);
  if (!valid) {
    reportBytecodeBug(filePath, errors);
    return;
  }

  executeBytecode(bytecode, filePath, { verbose });
}

/**
 * Runs an already-validated `program` via the native x86-64 backend: real
 * code generation (native-codegen.js -> pe-writer.js — the exact same
 * pipeline `compileNative()` uses), written to a throwaway temp `.exe`,
 * executed as a real child process, then cleaned up. This is what makes
 * "Native x86-64" a genuine, fourth way to run a program end-to-end rather
 * than a display-only label — its stdout/stderr/exit code become this
 * `pari` process's own, exactly like the interpreter/bytecode paths.
 */
function executeNative(program, filePath, { verbose = false } = {}) {
  const startedAt = verbose ? performance.now() : 0;

  let compiled;
  try {
    compiled = compileProgramToNative(program, filePath);
  } catch (err) {
    if (!isReportable(err)) throw err;
    printError(err);
    process.exitCode = ExitCode.COMPILER_ERROR;
    return;
  }
  const exe = buildPE64Executable({
    textBytes: compiled.textBytes,
    textFixups: compiled.textFixups,
    imports: compiled.imports,
    stringConstants: compiled.stringConstants,
  });

  const tempDir = mkdtempSync(join(tmpdir(), 'parithi-native-'));
  try {
    const tempExePath = join(tempDir, `${basename(filePath, extname(filePath))}.exe`);
    writeFileSync(tempExePath, exe);
    const result = spawnSync(tempExePath, [], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? ExitCode.SUCCESS;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  if (verbose) {
    const elapsedMs = performance.now() - startedAt;
    console.log(colors.dim(`\n✓ Completed in ${elapsedMs.toFixed(2)}ms.`));
  }
}

const BACKEND_ORDER_NOTE = {
  native: 'it is first in priority (Native x86-64 -> Bytecode + PVM -> Tree-Walking Interpreter) and supports this program.',
  bytecode: 'Native x86-64 cannot run this program (see above), and Bytecode + PVM is next in priority.',
  interpreter: 'neither Native x86-64 nor Bytecode + PVM can run this program (see above) — the Tree-Walking Interpreter is the final, always-available fallback.',
};

/** `pari --explain-backend <file.pr>` (Phase 14) — analysis only, never executes the program. Reports every backend's capability verdict and which one automatic selection would pick, and why. */
function printExplainBackend(source, filePath) {
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

  const selection = selectBackend(parsed.program, filePath);

  console.log(colors.bold(`Backend Selection for ${filePath}`));
  console.log(colors.dim('-'.repeat(72)));
  console.log('');

  for (const evaluation of selection.evaluations) {
    const status = evaluation.supported ? colors.green('SUPPORTED') : colors.red('UNSUPPORTED');
    console.log(`${padColumn(evaluation.label, 26)}${status}`);
    if (!evaluation.supported) {
      console.log(colors.dim(`  Reason: Feature "${evaluation.feature}" is not supported — ${evaluation.reason}`));
    } else if (evaluation.id === selection.selected) {
      console.log(colors.dim('  Selected backend.'));
    }
    console.log('');
  }

  console.log(colors.bold(`Selected: ${selection.selectedLabel}`));
  console.log(colors.dim(`  Because ${BACKEND_ORDER_NOTE[selection.selected]}`));
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

/**
 * Shared by `--bytecode` and `--compile` (Phase 10, §29): lexes, parses,
 * and semantically analyzes `source`, reporting and returning null on any
 * failure exactly like `runProgram`/`printRuntimeDiagnostics` already do —
 * bytecode is only ever generated from a program that has already passed
 * every check the Interpreter itself would have relied on.
 */
function analyzeForBytecode(source, filePath) {
  const parsed = lexAndParse(source, filePath);
  if (!parsed) return null;

  const analysis = new SemanticAnalyzer(parsed.program, filePath).analyze();
  if (!analysis.success) {
    logger.error(`${analysis.diagnostics.length} semantic error(s) found — run "pari --analyze" for details.`);
    console.log('');
    printDiagnosticList(analysis.diagnostics);
    process.exitCode = ExitCode.COMPILER_ERROR;
    return null;
  }

  return parsed.program;
}

/**
 * A validation failure here is a Generator bug, not a source-program
 * error (Semantic Analysis already guaranteed the program itself is
 * valid) — reported distinctly, the same "never let this reach the user
 * unformatted, and never blame their program for it" spirit as P023.
 */
function reportBytecodeBug(filePath, errors) {
  logger.error(`Internal bytecode generator error while compiling "${filePath}" — this is a bug in Parithi itself, not your program. Please report it with the source file that triggered it.`);
  console.log('');
  errors.forEach((message) => console.log(colors.red(`  - ${message}`)));
  process.exitCode = ExitCode.COMPILER_ERROR;
}

function printBytecode(source, filePath, { optimize = false } = {}) {
  const program = analyzeForBytecode(source, filePath);
  if (!program) return;

  if (optimize) {
    const result = generateOptimizedBytecode(program, filePath);
    if (!result) return;
    console.log(formatBytecodeText(result.program, { title: `Optimized Bytecode for ${filePath}` }));
    return;
  }

  const bytecode = generateBytecode(program);
  const { valid, errors } = validateBytecode(bytecode);
  if (!valid) {
    reportBytecodeBug(filePath, errors);
    return;
  }

  console.log(formatBytecodeText(bytecode, { title: `Bytecode for ${filePath}` }));
}

/**
 * Generates and validates bytecode for `program` (exactly like
 * `printBytecode`/`compileToFile` already did before Phase 12), then runs
 * it through the optimizer pipeline (§31). An `OptimizerError` — a pass
 * producing invalid bytecode — is reported the same way as a Generator bug
 * (`reportBytecodeBug`): the un-optimized bytecode already passed this
 * exact Validator once by this point (§29.6), so a failure here is
 * necessarily an optimizer defect, never the user's program's fault.
 * Returns `null` after reporting on any failure, matching every other
 * `analyzeForBytecode`-style helper's "null means already handled" contract.
 */
function generateOptimizedBytecode(program, filePath) {
  const bytecode = generateBytecode(program);
  const { valid, errors } = validateBytecode(bytecode);
  if (!valid) {
    reportBytecodeBug(filePath, errors);
    return null;
  }

  try {
    return optimizeBytecode(bytecode);
  } catch (err) {
    if (err.name !== 'OptimizerError') throw err;
    reportBytecodeBug(filePath, err.errors);
    return null;
  }
}

/** "pari <file.pr> --optimize" / "pari <file.pr> --disassemble" (§31) — display only, never executes. */
function printOptimizedBytecode(source, filePath) {
  const program = analyzeForBytecode(source, filePath);
  if (!program) return;

  const result = generateOptimizedBytecode(program, filePath);
  if (!result) return;

  console.log(formatBytecodeText(result.program, { title: `Optimized Bytecode for ${filePath}` }));
}

/** "pari <file.pr> --stats" (§31) — the Pass 9 optimization report. */
function printOptimizerStats(source, filePath) {
  const program = analyzeForBytecode(source, filePath);
  if (!program) return;

  const result = generateOptimizedBytecode(program, filePath);
  if (!result) return;

  console.log(formatOptimizerReport(result.statistics, { title: `Optimization Report for ${filePath}` }));
}

function compileToFile(source, filePath, { optimize = false } = {}) {
  const program = analyzeForBytecode(source, filePath);
  if (!program) return;

  let bytecode;
  let optimizationNote = '';

  if (optimize) {
    const result = generateOptimizedBytecode(program, filePath);
    if (!result) return;
    bytecode = result.program;
    optimizationNote = ` (optimized: ${result.statistics.removedInstructions} instruction(s) removed, ${result.statistics.optimizationRatio.toFixed(1)}% smaller)`;
  } else {
    bytecode = generateBytecode(program);
    const { valid, errors } = validateBytecode(bytecode);
    if (!valid) {
      reportBytecodeBug(filePath, errors);
      return;
    }
  }

  const outputPath = `${filePath.slice(0, filePath.length - extname(filePath).length)}.pbc`;
  writeFileSync(outputPath, writeBytecodeBinary(bytecode));
  console.log(colors.green(`Compiled "${basename(filePath)}" -> "${basename(outputPath)}"${optimizationNote}`));
  console.log(colors.dim(`  ${bytecode.instructions.length} instructions, ${bytecode.constants.size} constants, ${bytecode.functions.length} function(s).`));
}

/**
 * `pari --native <file.pr>` (Phase 13 native backend) — compiles the
 * supported subset (native-codegen.js's own class doc) straight to a
 * Windows PE32+ executable, next to the source by default (mirroring
 * `compileToFile()`'s own `.pbc` convention above), or at `-o <path>` if
 * given. `--ir`/`--asm` are opt-in inspection only (native-compiler
 * brief §14) — printed before the executable is written, never instead of it.
 */
function compileNativeToFile(source, filePath, { asm = false, ir = false, emitIr = false, emitOptimizedIr = false, optimizerStats = false, outputPath = null } = {}) {
  const result = compileNative(source, filePath);
  if (!result.success) {
    if (result.diagnostics.length > 1) {
      logger.error(`${result.diagnostics.length} error(s) found while compiling to native code.`);
      console.log('');
    }
    printDiagnosticList(result.diagnostics);
    process.exitCode = ExitCode.COMPILER_ERROR;
    return;
  }

  if (ir) {
    console.log(colors.bold(`Native IR for ${filePath}`));
    console.log(colors.dim('-'.repeat(72)));
    console.log(result.ir.join('\n'));
    console.log('');
  }
  if (asm) {
    console.log(colors.bold(`Generated x86-64 for ${filePath}`));
    console.log(colors.dim('-'.repeat(72)));
    console.log(formatAsmListing(result.asmListing));
    console.log('');
  }
  // The IR-optimizer brief's own requested format (§8): a plain "=== IR ==="
  // header, not this file's usual colors.bold()+dim()-underline style —
  // matched literally since these three flags are its own CLI surface.
  if (emitIr) {
    console.log('=== IR ===');
    console.log(formatIR(result.threeAddressIR));
    console.log('');
  }
  if (emitOptimizedIr) {
    console.log('=== OPTIMIZED IR ===');
    console.log(formatIR(result.optimizedIR));
    console.log('');
  }
  if (optimizerStats) {
    console.log(formatOptimizerStatistics(result.optimizerStatistics));
    console.log('');
  }

  const resolvedOutputPath = outputPath ?? `${filePath.slice(0, filePath.length - extname(filePath).length)}.exe`;
  writeFileSync(resolvedOutputPath, result.exe);
  console.log(colors.green('Native executable generated:'));
  console.log(relative(process.cwd(), resolvedOutputPath) || resolvedOutputPath);
}

/**
 * Resolves and validates a `.pbc` file (Phase 11, §30.10) — the same
 * existence/directory checks `withSourceFile` already performs for `.pr`
 * files, just against a Buffer instead of UTF-8 text (a `.pbc` file is
 * binary — §29.7), and checking for `.pbc` instead of `.pr`.
 */
function withBytecodeFile(file, action) {
  const filePath = resolve(process.cwd(), file);

  if (!existsSync(filePath)) {
    reportUsageError(new CliUsageError(`Bytecode file not found: "${file}"`, 'Check the path and try again.'));
    return;
  }

  const stats = statSync(filePath);
  if (stats.isDirectory()) {
    reportUsageError(new CliUsageError(`"${file}" is a directory, not a Parithi Bytecode file.`, 'Point pari at a ".pbc" file inside it instead.'));
    return;
  }

  if (extname(filePath) !== '.pbc') {
    reportUsageError(new CliUsageError(
      `Expected a ".pbc" bytecode file, got "${file}".`,
      'Compile one first with "pari --compile <file.pr>".',
    ));
    return;
  }

  let buffer;
  try {
    buffer = readFileSync(filePath);
  } catch (err) {
    reportUsageError(new CliUsageError(`Could not read "${file}": ${err.message}`));
    return;
  }

  action(buffer, filePath);
}

/** Runs an already-resolved bytecode program on the PVM — shared by the `.pbc`-file and compiled-from-`.pr` paths below. */
function executeBytecode(bytecode, filePath, { verbose = false } = {}) {
  const startedAt = verbose ? performance.now() : 0;
  const vm = new VirtualMachine(bytecode, filePath);

  try {
    process.exitCode = vm.run();
  } catch (err) {
    if (!isReportable(err)) throw err;
    printError(err);
    process.exitCode = ExitCode.RUNTIME_ERROR;
    return;
  }

  if (verbose) {
    const elapsedMs = performance.now() - startedAt;
    console.log(colors.dim(`\n✓ Completed in ${elapsedMs.toFixed(2)}ms.`));
  }
}

function runBytecodeFile(buffer, filePath, { verbose = false, optimize = false } = {}) {
  let bytecode;
  try {
    bytecode = readBytecodeBinary(buffer);
  } catch (err) {
    reportUsageError(new CliUsageError(
      `"${basename(filePath)}" is not a valid Parithi Bytecode file: ${err.message}`,
      'Recompile it with "pari --compile <file.pr>".',
    ));
    return;
  }

  // Defensive — re-validates a loaded .pbc exactly like a freshly-generated
  // one (§29.6/§30.8): a file that parses but is internally inconsistent
  // (hand-edited, corrupted in transit) is still a bad FILE, not a runtime
  // failure of a program that hasn't started executing yet.
  const { valid, errors } = validateBytecode(bytecode);
  if (!valid) {
    reportUsageError(new CliUsageError(
      `"${basename(filePath)}" is not valid Parithi Bytecode: ${errors[0]}`,
      'Recompile it with "pari --compile <file.pr>".',
    ));
    return;
  }

  if (optimize) {
    try {
      bytecode = optimizeBytecode(bytecode).program;
    } catch (err) {
      if (err.name !== 'OptimizerError') throw err;
      reportBytecodeBug(filePath, err.errors);
      return;
    }
  }

  executeBytecode(bytecode, filePath, { verbose });
}

function runBytecodeFromSource(source, filePath, { verbose = false, optimize = false } = {}) {
  let compiled;
  try {
    compiled = compileFromSource(source, filePath);
  } catch (err) {
    if (!isReportable(err)) throw err;
    printError(err);
    process.exitCode = ExitCode.COMPILER_ERROR;
    return;
  }

  if (!compiled.success) {
    if (compiled.stage === 'semantic') {
      logger.error(`${compiled.diagnostics.length} semantic error(s) found — run "pari --analyze" for details.`);
      console.log('');
      printDiagnosticList(compiled.diagnostics);
    } else {
      reportBytecodeBug(filePath, compiled.errors);
    }
    process.exitCode = ExitCode.COMPILER_ERROR;
    return;
  }

  let bytecode = compiled.bytecode;
  if (optimize) {
    try {
      bytecode = optimizeBytecode(bytecode).program;
    } catch (err) {
      if (err.name !== 'OptimizerError') throw err;
      reportBytecodeBug(filePath, err.errors);
      return;
    }
  }

  executeBytecode(bytecode, filePath, { verbose });
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

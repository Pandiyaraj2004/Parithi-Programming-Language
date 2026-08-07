/**
 * Loader — gets a runnable bytecode program into the PVM's hands, from
 * either a compiled `.pbc` file or a `.pr` source file compiled on the
 * fly (Phase 11, §30.5). Two independent paths:
 *
 *   - `loadFromFile()` — reads a `.pbc` file and deserializes it via
 *     Phase 10's own `readBytecodeBinary()` (imported, unmodified). A
 *     malformed file (bad magic, unsupported version, truncated) throws
 *     a plain `Error` — deliberately NOT a `ParithiRuntimeError`, since a
 *     bad *file* is a CLI usage problem (the same category as "wrong
 *     extension" or "unreadable file" — §19), not a Parithi program
 *     defect. `commands.js`'s new PVM command wraps it as a
 *     `CliUsageError` accordingly, exactly like every other file-handling
 *     failure already is.
 *   - `compileFromSource()` — runs the complete, unmodified frontend
 *     (Lexer → Parser → Semantic Analyzer) and Phase 10's own Generator +
 *     Validator, entirely in memory, with no `.pbc` file ever touching
 *     disk. This is what `pari --run-bytecode file.pr` and this phase's
 *     own validate-against-the-Interpreter tests use — it is a second,
 *     independent CALLER of Phase 10, not a modification of it.
 */

import { readFileSync } from 'node:fs';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { SemanticAnalyzer } from '../semantic/analyzer.js';
import { generateBytecode, validateBytecode, readBytecodeBinary } from '../bytecode/index.js';

export function loadFromFile(filePath) {
  const buffer = readFileSync(filePath);
  return readBytecodeBinary(buffer);
}

/**
 * Returns `{ success: true, bytecode }` or `{ success: false, ... }` for a
 * semantic or bytecode-validation failure. Lexer/Parser errors are NOT
 * caught here — they propagate as the same `CompilerError`/`ParseError`/
 * `MultiParseError` every other frontend consumer already lets through
 * (§18), for the caller to report identically.
 */
export function compileFromSource(source, filePath) {
  const tokens = new Lexer(source, filePath).tokenize();
  const program = new Parser(tokens, filePath).parseProgram();

  const analysis = new SemanticAnalyzer(program, filePath).analyze();
  if (!analysis.success) {
    return { success: false, stage: 'semantic', diagnostics: analysis.diagnostics };
  }

  const bytecode = generateBytecode(program);
  const validation = validateBytecode(bytecode);
  if (!validation.valid) {
    return { success: false, stage: 'bytecode', errors: validation.errors };
  }

  return { success: true, bytecode };
}

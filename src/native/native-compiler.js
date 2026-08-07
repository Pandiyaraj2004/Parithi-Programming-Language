/**
 * Native compiler entry point — Phase 13. Reuses the exact same, unmodified
 * frontend every other backend uses (Lexer → Parser → Semantic Analyzer —
 * none of which this phase touches), then hands the validated AST to the
 * native codegen and PE writer instead of the Interpreter or Bytecode
 * Generator. This mirrors `compileFromSource()` (src/vm/loader.js, Phase
 * 11) and `generateBytecode()` (src/bytecode/bytecode-generator.js, Phase
 * 10)'s own "reuse the frontend, add a new backend" shape exactly.
 */

import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { SemanticAnalyzer } from '../semantic/analyzer.js';
import { compileProgramToNative } from './codegen/native-codegen.js';
import { buildPE64Executable } from './pe/pe-writer.js';

/** True for CompilerError/ParseError/MultiParseError/SemanticError/NativeCompileError — anything with a printable .format(), mirroring commands.js's own isReportable(). */
function isReportable(err) {
  return err != null && typeof err.format === 'function';
}

/**
 * @param {string} source
 * @param {string} filePath
 * @returns {{ success: true, exe: Buffer } | { success: false, diagnostics: Array }}
 *   `diagnostics` entries are anything with `.format()` (CompilerError/ParseError/
 *   SemanticError/NativeCompileError), always as an array — even a single
 *   Lexer/Parser/native-codegen failure — so the CLI layer has exactly one
 *   shape to print, regardless of which stage rejected the program. This
 *   function itself never prints anything (matching generateBytecode()/
 *   validateBytecode()'s own print-free contract) — only src/cli/commands.js does.
 */
export function compileNative(source, filePath) {
  try {
    const tokens = new Lexer(source, filePath).tokenize();
    const program = new Parser(tokens, filePath).parseProgram();

    const analysis = new SemanticAnalyzer(program, filePath).analyze();
    if (!analysis.success) {
      return { success: false, diagnostics: analysis.diagnostics };
    }

    const { textBytes, textFixups, imports, stringConstants, ir, asmListing } = compileProgramToNative(program, filePath);
    const exe = buildPE64Executable({ textBytes, textFixups, imports, stringConstants });

    return { success: true, exe, ir, asmListing };
  } catch (err) {
    if (!isReportable(err)) throw err; // a genuine internal bug — never swallow it as a clean diagnostic
    return { success: false, diagnostics: [err] };
  }
}

/** `pari --native --asm` — a readable "offset: hex bytes    mnemonic" listing of exactly what codegen emitted (not a general-purpose disassembler; see native-codegen.js's own `emit()` calls for how each mnemonic comment is attached to the bytes it describes). */
export function formatAsmListing(asmListing) {
  return asmListing
    .map(({ offset, bytes, text }) => `${offset.toString(16).padStart(4, '0')}: ${bytes.toString('hex').padEnd(24, ' ')} ${text}`)
    .join('\n');
}

/**
 * Native codegen — Phase 13, now fronted by a real IR pipeline. Translates
 * a validated Parithi `Program` AST node into x86-64 machine code + PE
 * import/fixup metadata, ready for `src/native/pe/pe-writer.js`.
 *
 * TWO-STAGE VALIDATION, DELIBERATELY (not redundant): this file's own
 * `extractSayText` AST-level gate runs FIRST and is UNCHANGED from
 * before the IR pipeline existed — it's what still produces the exact,
 * already-tested `NativeCompileError` messages naming the precise
 * unsupported AST construct (`"Feature \"VariableDeclaration\" is
 * not..."` etc.). Only once a program passes that gate does this module
 * additionally run it through the real three-address-code IR
 * (`src/native/ir/ir-generator.js`) and IR Optimizer
 * (`src/native/ir/optimizer/`) — and the actual x86-64 bytes are emitted
 * FROM that optimized IR (`ir-to-x86-64.js`), not by re-walking the AST a
 * second time. This satisfies "the code generator consumes the optimized
 * IR instead of the AST" for real, while keeping every existing
 * diagnostic's wording (and the tests that check it) exactly as it was —
 * removing the AST gate and re-deriving the same diagnostics from IR
 * shapes instead would only produce a second, less-precise error path
 * for problems the AST gate already reports precisely.
 *
 * SUPPORTED SUBSET (intentionally small — §7 of the Phase 13 brief: "do
 * NOT attempt to compile every feature immediately"): a sequence of
 * top-level `say` statements, each with one or more String literal
 * arguments (space-joined, matching `Interpreter.visitPrintStatement`
 * exactly — see interpreter.js:222-224). Nothing else yet. Any other
 * top-level statement, or a `say` argument that isn't a plain String
 * literal, raises `NativeCompileError` (P030) — never a silently wrong
 * `.exe`. This will grow (variables, arithmetic, control flow, functions)
 * as dedicated tests are added for each, per the brief's own rule:
 * "only mark a feature as native-supported after it has dedicated tests"
 * — and when it does, `ir-to-x86-64.js` is the file that grows to emit
 * real x86-64 for the IR shapes the generator/optimizer already model
 * today (arithmetic, branches, calls — see ir-nodes.js).
 */

import { NodeType } from '../../ast/ast-nodes.js';
import { NativeCompileError } from '../errors.js';
import { SourceLocation } from '../../errors/index.js';
import { generateIR } from '../ir/ir-generator.js';
import { optimize } from '../ir/optimizer/index.js';
import { emitX86FromIR } from './ir-to-x86-64.js';

function locationOf(filePath, node) {
  return new SourceLocation(filePath, node.line, node.column);
}

/** Validates one top-level statement is within the supported subset, returning its printable text — or throws NativeCompileError. */
function extractSayText(node, filePath) {
  if (node.type !== NodeType.PRINT_STATEMENT) {
    throw new NativeCompileError({
      feature: node.type,
      reason: 'the native backend currently only compiles "say" statements with String literal arguments.',
      location: locationOf(filePath, node),
      suggestion: 'use "pari --run-bytecode"/"pari <file.pr>" (Interpreter/PVM) for full-language support, or simplify this program for --native.',
    });
  }
  return node.arguments
    .map((arg) => {
      if (arg.type !== NodeType.LITERAL || arg.valueType !== 'String') {
        throw new NativeCompileError({
          feature: `say with a ${arg.type === NodeType.LITERAL ? arg.valueType : arg.type} argument`,
          reason: 'the native backend can currently only print String literals, not variables, expressions, or other value types.',
          location: locationOf(filePath, arg),
          suggestion: 'use only double-quoted string literals in "say" for --native, e.g. say "Hello, Parithi!".',
        });
      }
      return arg.value;
    })
    .join(' ');
}

/**
 * @param {object} program - the parsed + semantically-analyzed `Program` AST node
 * @param {string} filePath - for diagnostic locations
 * @returns {{
 *   textBytes: Buffer, textFixups: Array, imports: Array, stringConstants: Buffer[],
 *   ir: string[],           // `pari --native --ir` — a short "what did the compiler understand" summary (unchanged format, predates the real IR pipeline)
 *   asmListing: Array<{offset: number, bytes: Buffer, text: string}>,  // `pari --native --asm` — one entry per emitted instruction
 *   threeAddressIR: import('../ir/ir-nodes.js').IRProgram,      // `pari --native --emit-ir` — the real, unoptimized three-address-code IR
 *   optimizedIR: import('../ir/ir-nodes.js').IRProgram,         // `pari --native --emit-optimized-ir` — after the IR Optimizer pipeline
 *   optimizerStatistics: Record<string, number>,                // `pari --native --optimizer-stats`
 * }}
 */
export function compileProgramToNative(program, filePath) {
  // Stage 1 — the AST-level "is this within the native-compilable subset"
  // gate (unchanged since before the IR pipeline existed — see class doc).
  const lines = program.body.map((node) => extractSayText(node, filePath));
  const ir = [...lines.map((line) => `Say(${JSON.stringify(line)})`), 'Exit(0)']; // legacy summary format, kept as-is — see the return type doc above

  // Stage 2 — the real pipeline: AST -> IR -> Optimized IR -> x86-64. Every
  // program that reaches here already passed Stage 1, so `generateIR` can
  // only ever produce the simple, single-block "$main" shape ir-to-x86-64.js
  // expects (CONST/PRINT only) — see ir-generator.js's own supported-subset
  // list, which is currently a superset of what `extractSayText` allows
  // through; nothing here silently accepts more than Stage 1 already validated.
  const threeAddressIR = generateIR(program);
  const { program: optimizedIR, statistics: optimizerStatistics } = optimize(threeAddressIR);
  const { textBytes, textFixups, imports, stringConstants, asmListing } = emitX86FromIR(optimizedIR);

  return {
    textBytes,
    textFixups,
    imports,
    stringConstants,
    ir,
    asmListing,
    threeAddressIR,
    optimizedIR,
    optimizerStatistics,
  };
}

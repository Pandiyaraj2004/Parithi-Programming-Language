/**
 * Native codegen — Phase 13/17, now fronted by a real IR pipeline. Translates
 * a validated Parithi `Program` AST node into x86-64 machine code + PE
 * import/fixup metadata, ready for `src/native/pe/pe-writer.js`.
 *
 * TWO-STAGE VALIDATION, DELIBERATELY (not redundant): this file's own
 * `checkNativeStatement`/`checkNativeExpression` AST-level gate runs FIRST
 * — it's what produces a precise `NativeCompileError` naming the exact
 * unsupported AST construct. Only once a program passes that gate does
 * this module additionally run it through the real three-address-code IR
 * (`src/native/ir/ir-generator.js`) and IR Optimizer
 * (`src/native/ir/optimizer/`) — and the actual x86-64 bytes are emitted
 * FROM that optimized IR (`ir-to-x86-64.js`), not by re-walking the AST a
 * second time.
 *
 * SUPPORTED SUBSET (Phase 17 — "Native Backend Recovery" audit): a
 * sequence of top-level `hold`/`const` declarations, plain-variable
 * `assignment`, and `say` statements, whose values/arguments are built
 * ONLY from literals, variable references, arithmetic (`+ - * / % **`),
 * and comparisons (`== != > < >= <=`) — i.e. exactly the expression
 * shapes the IR Optimizer's Constant Folding + Constant Propagation
 * passes (already built for Phase 13's IR work — see `optimizer/`) can
 * always reduce to a single, compile-time-known value. `ir-to-x86-64.js`
 * only ever has to emit a `say` of an already-known constant — this is
 * why the subset is scoped exactly this way, not because these are the
 * only IR shapes that exist: `if`/`while`/`repeat`/`loop`/`task`/`choose`,
 * `and`/`or` (real short-circuit branches), arrays, and calls all
 * genuinely need runtime control flow or memory this emitter does not
 * generate yet (see MASTER_DOCUMENT.md §37 for the honest boundary).
 * Anything outside this raises `NativeCompileError` (P030) — never a
 * silently wrong `.exe`.
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

// "and"/"or" are deliberately excluded — ir-generator.js lowers them to a
// real short-circuit BRANCH (two basic blocks), not a single instruction,
// and ir-to-x86-64.js only ever emits code for one straight-line block.
// Every operator here instead lowers to exactly one IR instruction with no
// control flow, which is what keeps the whole program foldable to known
// constants by the existing IR Optimizer.
const ALLOWED_BINARY_OPERATORS = new Set(['+', '-', '*', '/', '%', '**', '==', '!=', '>', '<', '>=', '<=']);

/**
 * Recursively validates that `node` is built only from the allowed
 * expression shapes (Literal, Identifier, arithmetic/comparison
 * BinaryExpression, UnaryExpression) — never checking whether an
 * Identifier is actually *declared*, since Semantic Analysis already
 * guarantees that before native codegen ever runs.
 */
function checkNativeExpression(node, filePath) {
  switch (node.type) {
    case NodeType.LITERAL:
    case NodeType.IDENTIFIER:
      return;
    case NodeType.BINARY_EXPRESSION:
      if (!ALLOWED_BINARY_OPERATORS.has(node.operator)) {
        throw new NativeCompileError({
          feature: `"${node.operator}"`,
          reason: '"and"/"or" require real short-circuit branching, which the native backend does not generate yet.',
          location: locationOf(filePath, node),
          suggestion: 'use "pari --run-bytecode"/"pari <file.pr>" (Interpreter/PVM) for full-language support.',
        });
      }
      if ((node.operator === '/' || node.operator === '%') && node.right.type === NodeType.LITERAL && node.right.value === 0) {
        throw new NativeCompileError({
          feature: `"${node.operator}" by a literal zero`,
          reason: 'division/modulo by zero is a runtime error (P020), not a compile-time constant — the native backend never bakes a runtime error into an executable.',
          location: locationOf(filePath, node),
          suggestion: 'use "pari --run-bytecode"/"pari <file.pr>" (Interpreter/PVM) to see the normal P020 runtime diagnostic.',
        });
      }
      checkNativeExpression(node.left, filePath);
      checkNativeExpression(node.right, filePath);
      return;
    case NodeType.UNARY_EXPRESSION:
      checkNativeExpression(node.operand, filePath);
      return;
    default:
      throw new NativeCompileError({
        feature: node.type,
        reason: 'the native backend currently only supports literals, variables, arithmetic, and comparisons in an expression.',
        location: locationOf(filePath, node),
        suggestion: 'use "pari --run-bytecode"/"pari <file.pr>" (Interpreter/PVM) for full-language support, or simplify this expression for --native.',
      });
  }
}

/**
 * True if `node` reads the variable `name` anywhere within it. Used only to
 * catch a self-referencing reassignment (`x = x + 1`) at Stage 1 — the IR
 * Optimizer's constant propagation resolves a variable's value forward from
 * its declaration to later reads, but does not fold an expression that
 * reassigns a variable in terms of that SAME variable's own prior value, so
 * without this check Stage 1 would wrongly accept a program Stage 2 can
 * never actually constant-fold.
 */
function expressionReferencesIdentifier(node, name) {
  switch (node.type) {
    case NodeType.IDENTIFIER:
      return node.name === name;
    case NodeType.BINARY_EXPRESSION:
      return expressionReferencesIdentifier(node.left, name) || expressionReferencesIdentifier(node.right, name);
    case NodeType.UNARY_EXPRESSION:
      return expressionReferencesIdentifier(node.operand, name);
    default:
      return false;
  }
}

/**
 * Validates one top-level statement is within the supported subset.
 * Returns the statement's printable text (space-joined `say` arguments)
 * if it is a `say`, or `null` for a declaration/assignment (which prints
 * nothing) — mirroring `extractSayText`'s old return contract for the
 * legacy `--native --ir` summary below. Throws `NativeCompileError`
 * (P030) for anything outside the supported subset.
 *
 * Exported (not just used internally) so `src/backend/capability.js`'s
 * `checkNativeCapability()` can reuse this EXACT gate for its own cheap,
 * non-executing "can native run this?" check (§34.3's own requirement:
 * capability analysis must reuse the real gate, never a second,
 * independently-maintained copy of it that could silently drift out of
 * sync).
 */
export function checkNativeStatement(node, filePath) {
  switch (node.type) {
    case NodeType.VARIABLE_DECLARATION:
    case NodeType.CONSTANT_DECLARATION:
      checkNativeExpression(node.value, filePath);
      return null;
    case NodeType.ASSIGNMENT:
      if (expressionReferencesIdentifier(node.value, node.name)) {
        throw new NativeCompileError({
          feature: `self-referencing reassignment of "${node.name}"`,
          reason: 'a reassignment built from that same variable\'s own prior value (e.g. "x = x + 1") cannot be constant-folded — that would require reading a real runtime value, not a compile-time constant.',
          location: locationOf(filePath, node),
          suggestion: 'use "pari --run-bytecode"/"pari <file.pr>" (Interpreter/PVM) for full-language support.',
        });
      }
      checkNativeExpression(node.value, filePath);
      return null;
    case NodeType.PRINT_STATEMENT:
      node.arguments.forEach((arg) => checkNativeExpression(arg, filePath));
      return node;
    default:
      throw new NativeCompileError({
        feature: node.type,
        reason: 'the native backend currently only compiles "hold"/"const" declarations, assignment, and "say" statements built from literals, variables, arithmetic, and comparisons.',
        location: locationOf(filePath, node),
        suggestion: 'use "pari --run-bytecode"/"pari <file.pr>" (Interpreter/PVM) for full-language support, or simplify this program for --native.',
      });
  }
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
  // gate (see class doc). Every statement is checked regardless of shape;
  // only `say` statements contribute anything to the legacy `--native --ir`
  // summary built below (declarations/assignment print nothing).
  program.body.forEach((node) => checkNativeStatement(node, filePath));

  // Stage 2 — the real pipeline: AST -> IR -> Optimized IR -> x86-64. Every
  // program that reaches here already passed Stage 1, so the IR Optimizer's
  // existing Constant Folding/Propagation passes are guaranteed to resolve
  // every value ir-to-x86-64.js needs down to a known constant — nothing
  // here silently accepts more than Stage 1 already validated.
  const threeAddressIR = generateIR(program);
  const { program: optimizedIR, statistics: optimizerStatistics } = optimize(threeAddressIR);
  const { textBytes, textFixups, imports, stringConstants, asmListing } = emitX86FromIR(optimizedIR, filePath);

  // Legacy "--native --ir" summary format, kept as-is (see the return type
  // doc below) — now derived from the ACTUAL resolved output text
  // (`stringConstants`, one Buffer per `say`, already computed by Stage 2)
  // rather than re-deriving it from raw AST text at Stage 1, since a
  // `say` argument may now be a variable or an arithmetic expression whose
  // printed value isn't known until after optimization.
  const ir = [
    ...stringConstants.map((buf) => `Say(${JSON.stringify(buf.toString('utf8').replace(/\n$/, ''))})`),
    'Exit(0)',
  ];

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

/**
 * Pass A — Constant Folding (§4A of the IR-optimizer brief).
 * Replaces an arithmetic/comparison/unary instruction with a single
 * `CONST` when every operand is already known at compile time.
 *
 * SAFETY: only ever folds when every operand actually resolves to a
 * literal value — never guesses, never folds a `var` operand (a
 * variable's value is Constant Propagation's job — a separate pass, run
 * after this one in the default pipeline, per the brief's own ordering).
 * Division/modulo by a literal zero is deliberately left UNFOLDED so the
 * program still raises its documented runtime error — the exact same
 * safety rule `src/optimizer/passes/constant-folding.js` (the Bytecode
 * Optimizer, Phase 12) already established for the same reason.
 *
 * WHY A SIMPLE PER-BLOCK FORWARD SCAN IS SOUND (not a gap): every virtual
 * register (`temp`) is defined exactly once and consumed only within the
 * same basic block it's defined in — no temp ever crosses a block
 * boundary in this IR (only named variables do, via STORE — see
 * ir-generator.js's own class doc). So a single left-to-right pass over
 * one block's instructions, tracking "which temps hold a known constant
 * so far," can never miss a fold or use a stale value — there is no
 * cross-block dataflow to get wrong.
 */

import { IrOp, PURE_OPS } from '../ir-nodes.js';

const BINARY_FOLDERS = Object.freeze({
  [IrOp.ADD]: (a, b) => a + b,
  [IrOp.SUB]: (a, b) => a - b,
  [IrOp.MUL]: (a, b) => a * b,
  [IrOp.DIV]: (a, b) => a / b,
  [IrOp.MOD]: (a, b) => a % b,
  [IrOp.POW]: (a, b) => a ** b,
  [IrOp.EQ]: (a, b) => a === b,
  [IrOp.NE]: (a, b) => a !== b,
  [IrOp.GT]: (a, b) => a > b,
  [IrOp.LT]: (a, b) => a < b,
  [IrOp.GE]: (a, b) => a >= b,
  [IrOp.LE]: (a, b) => a <= b,
});

const UNARY_FOLDERS = Object.freeze({
  [IrOp.NEG]: (a) => -a,
  [IrOp.NOT]: (a) => !a,
});

const COMPARISON_OPS = new Set([IrOp.EQ, IrOp.NE, IrOp.GT, IrOp.LT, IrOp.GE, IrOp.LE]);
const ARITHMETIC_OPS = new Set([IrOp.ADD, IrOp.SUB, IrOp.MUL, IrOp.DIV, IrOp.MOD, IrOp.POW]);

/** True when folding a comparison would concatenate/compare Strings via `+` — Parithi allows `+` on Strings (§13.6), which we still fold (JS `+` does the same thing for strings), but arithmetic other than `+`/comparison is never valid on Strings per Semantic Analysis, so this only guards the one real ambiguity: `+` on two Strings is safe to fold with plain JS `+`, exactly like Number. */
function resultValueType(op, aType, bType) {
  if (COMPARISON_OPS.has(op)) return 'Boolean';
  if (aType === 'String' || bType === 'String') return 'String'; // only `+` reaches here for Strings — Semantic Analysis already rejected every other combination
  return aType === 'Decimal' || bType === 'Decimal' ? 'Decimal' : 'Number';
}

function foldBlock(block, stats) {
  const knownConstants = new Map(); // tempId -> { value, valueType }

  const resolve = (operand) => {
    if (operand.kind === 'const') return operand;
    if (operand.kind === 'temp' && knownConstants.has(operand.id)) return knownConstants.get(operand.id);
    return null;
  };

  for (const instr of block.instructions) {
    if (instr.op === IrOp.CONST) {
      if (instr.dest?.kind === 'temp') knownConstants.set(instr.dest.id, instr.args[0]);
      continue;
    }

    if (!PURE_OPS.has(instr.op) || instr.dest?.kind !== 'temp') continue;

    if (UNARY_FOLDERS[instr.op]) {
      const a = resolve(instr.args[0]);
      if (!a) continue;
      const value = UNARY_FOLDERS[instr.op](a.value);
      const valueType = instr.op === IrOp.NOT ? 'Boolean' : a.valueType;
      instr.op = IrOp.CONST;
      instr.args = [{ kind: 'const', value, valueType }];
      knownConstants.set(instr.dest.id, instr.args[0]);
      stats.constantFolding++;
      continue;
    }

    if (BINARY_FOLDERS[instr.op]) {
      const a = resolve(instr.args[0]);
      const b = resolve(instr.args[1]);
      if (!a || !b) continue;
      if (ARITHMETIC_OPS.has(instr.op) && (instr.op === IrOp.DIV || instr.op === IrOp.MOD) && b.value === 0) {
        continue; // preserve the runtime division/modulo-by-zero error — never fold this away
      }
      const value = BINARY_FOLDERS[instr.op](a.value, b.value);
      const valueType = resultValueType(instr.op, a.valueType, b.valueType);
      instr.op = IrOp.CONST;
      instr.args = [{ kind: 'const', value, valueType }];
      knownConstants.set(instr.dest.id, instr.args[0]);
      stats.constantFolding++;
    }
  }
}

/** @returns {{ constantFolding: number }} count of instructions folded */
export function constantFolding(program) {
  const stats = { constantFolding: 0 };
  for (const fn of program.functions) {
    for (const block of fn.blocks) foldBlock(block, stats);
  }
  return stats;
}

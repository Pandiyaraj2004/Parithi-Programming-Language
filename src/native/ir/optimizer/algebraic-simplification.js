/**
 * Pass C — Algebraic Simplification (§4C of the IR-optimizer brief).
 * Rewrites an arithmetic instruction with an identity/absorbing operand
 * into a plain `COPY` (or a `CONST 0`), without ever touching the OTHER
 * operand's value — unlike Constant Folding, this never needs to know
 * what the other operand actually is.
 *
 * SAFETY: only the exact identities the brief lists are applied, each
 * only in the operand position where it's actually valid (`x - 0 -> x`
 * is safe; `0 - x -> x` is NOT — that's `-x`, a different value — so it's
 * deliberately not simplified here). Never applied unless the identity
 * operand actually resolves to `0`/`1` — a literal `const` operand
 * directly, OR a temp whose (single, block-local) defining instruction is
 * a `CONST 0`/`CONST 1` (the common case: `y = x * 1` compiles to
 * `t1 = CONST 1; t2 = MUL x, t1` — the literal `1` is one instruction
 * away, not inline on the MUL itself; resolving through it is exactly the
 * same safe, sound reasoning constant-folding.js already uses, restated
 * here because this pass runs independently of it). This never inspects
 * or assumes anything about the OTHER (non-identity) operand — it could
 * be a variable, a temp, anything — so it can never "simplify away" a
 * value it hasn't actually proven doesn't matter.
 */

import { IrOp } from '../ir-nodes.js';

/** Resolves `operand` to its literal value if known — either it's already a `const`, or it's a `temp` whose single defining `CONST` earlier in this block is in `knownConstants` (temps never cross blocks — see ir-generator.js/constant-folding.js's own class docs for why this is sound). */
function resolveValue(operand, knownConstants) {
  if (operand.kind === 'const') return operand.value;
  if (operand.kind === 'temp' && knownConstants.has(operand.id)) return knownConstants.get(operand.id).value;
  return undefined;
}

const BINARY_ARITHMETIC_OPS = new Set([IrOp.ADD, IrOp.SUB, IrOp.MUL, IrOp.DIV]);

/** Returns the simplified instruction shape ({ op, args }) or null if no identity applies. Only ever consulted for the exact 2-argument arithmetic ops above — every other op (CONST, NEG/NOT, LOAD, CALL, comparisons, ...) has no algebraic identity here and is skipped before either argument is touched, since some of them (NEG/NOT/LOAD) only have ONE argument at all. */
function simplify(instr, knownConstants) {
  if (!BINARY_ARITHMETIC_OPS.has(instr.op)) return null;
  const [a, b] = instr.args;
  const aValue = resolveValue(a, knownConstants);
  const bValue = resolveValue(b, knownConstants);
  switch (instr.op) {
    case IrOp.ADD:
      if (bValue === 0) return { op: IrOp.COPY, args: [a] }; // x + 0 -> x
      if (aValue === 0) return { op: IrOp.COPY, args: [b] }; // 0 + x -> x
      return null;
    case IrOp.SUB:
      if (bValue === 0) return { op: IrOp.COPY, args: [a] }; // x - 0 -> x (0 - x is NOT x, so not simplified)
      return null;
    case IrOp.MUL:
      if (bValue === 1) return { op: IrOp.COPY, args: [a] }; // x * 1 -> x
      if (aValue === 1) return { op: IrOp.COPY, args: [b] }; // 1 * x -> x
      if (bValue === 0 || aValue === 0) return { op: IrOp.CONST, args: [{ kind: 'const', value: 0, valueType: 'Number' }] }; // x * 0 -> 0
      return null;
    case IrOp.DIV:
      if (bValue === 1) return { op: IrOp.COPY, args: [a] }; // x / 1 -> x (never touches x / 0 — that's Constant Folding's/the runtime's job, not this pass's)
      return null;
    default:
      return null;
  }
}

/** @returns {{ algebraicSimplification: number }} count of instructions simplified */
export function algebraicSimplification(program) {
  const stats = { algebraicSimplification: 0 };
  for (const fn of program.functions) {
    for (const block of fn.blocks) {
      const knownConstants = new Map(); // tempId -> const operand, block-local (same reasoning as constant-folding.js)
      for (const instr of block.instructions) {
        if (instr.op === IrOp.CONST && instr.dest?.kind === 'temp') {
          knownConstants.set(instr.dest.id, instr.args[0]);
        }
        if (!instr.dest) continue; // an identity rewrite only makes sense for a value-producing instruction
        const result = simplify(instr, knownConstants);
        if (result) {
          instr.op = result.op;
          instr.args = result.args;
          stats.algebraicSimplification++;
        }
      }
    }
  }
  return stats;
}

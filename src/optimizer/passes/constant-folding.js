/**
 * ConstantFolding (Phase 12, §31, Pass 1). Replaces a `PUSH c1; PUSH c2;
 * <BINOP>` or `PUSH c; <UNARY>` sequence — both operands already known at
 * compile time — with a single `PUSH` of the pre-computed result, for
 * arithmetic (`+ - * / % **`), comparison (`== != < > <= >=`), and logical
 * (`and or not`) operators, including String `+` concatenation.
 *
 * Every `compute()` below is the exact same JS operation
 * `src/vm/instruction-dispatcher.js`'s corresponding opcode handler
 * performs (hand-mirrored from `Interpreter.visitBinaryExpression`, §30.2)
 * — folding never invents new semantics, it only performs the identical
 * computation earlier, at compile time instead of at run time. Two
 * deliberate exclusions keep this "never changes program behavior":
 *
 *  - `DIV`/`MOD` by a constant `0` are never folded. The VM's `DIV`/`MOD`
 *    handlers raise `P020` at that exact instruction (§30.5); folding the
 *    triple away would either silently swallow that runtime error or move
 *    it to the wrong line/column. Leaving the original three instructions
 *    in place preserves the error exactly as-is.
 *  - A fold is skipped if the operator instruction, or the second operand's
 *    PUSH, is itself a jump target (`referenced`) — meaning some other
 *    instruction jumps directly into the *middle* of what would become one
 *    instruction. This can't happen from real Bytecode Generator output
 *    (§29.2's "every `compileExpression()` call is self-contained" —
 *    nothing ever jumps into the middle of an expression), but the check
 *    costs nothing and keeps this pass correct even given a hand-built or
 *    differently-generated program.
 *
 * The folded constant's type tag (Number vs. Decimal) mirrors
 * `src/semantic/type-checker.js`'s own arithmetic promotion rule exactly
 * (`DECIMAL` if either operand is `DECIMAL`, else `NUMBER`, §13.1) — purely
 * cosmetic (it only affects how `--bytecode`/`--optimize`'s listing labels
 * the constant; the VM never inspects a pool entry's type tag when
 * executing, only its `.value`, §30.5), but keeping it consistent with what
 * the Semantic Analyzer would have inferred for the original expression
 * avoids a disassembly listing that looks like it silently changed a
 * value's static type.
 *
 * `foldBinaryPair`/`foldUnaryPair` are exported so `PeepholeOptimization`
 * (Pass 5) can re-run the identical rule later in the pipeline, where
 * Constant Propagation/Jump Optimization may have exposed brand-new
 * `PUSH, PUSH, <OP>` adjacencies this pass — running earlier — could not
 * yet see (see peephole-optimization.js's class doc for a worked example).
 */

import { Opcode } from '../../bytecode/opcode.js';
import { ConstantType } from '../../bytecode/constant-pool.js';
import { Instruction } from '../../bytecode/instruction.js';
import { collectReferencedIndices, remapProgram } from '../program-utils.js';

export const name = 'ConstantFolding';

const NUMERIC = new Set([ConstantType.NUMBER, ConstantType.DECIMAL]);

function promote(leftType, rightType) {
  return leftType === ConstantType.DECIMAL || rightType === ConstantType.DECIMAL ? ConstantType.DECIMAL : ConstantType.NUMBER;
}

function arithmetic(compute, guard = () => true) {
  return {
    eligible: (lt, rt, l, r) => NUMERIC.has(lt) && NUMERIC.has(rt) && guard(l, r),
    compute,
    resultType: promote,
  };
}

function numericComparison(compute) {
  return { eligible: (lt, rt) => NUMERIC.has(lt) && NUMERIC.has(rt), compute, resultType: () => ConstantType.BOOLEAN };
}

function booleanCombine(compute) {
  return {
    eligible: (lt, rt) => lt === ConstantType.BOOLEAN && rt === ConstantType.BOOLEAN,
    compute,
    resultType: () => ConstantType.BOOLEAN,
  };
}

const BINARY_FOLDERS = {
  [Opcode.ADD]: {
    eligible: (lt, rt) => (NUMERIC.has(lt) && NUMERIC.has(rt)) || (lt === ConstantType.STRING && rt === ConstantType.STRING),
    compute: (l, r) => l + r,
    resultType: (lt, rt) => (lt === ConstantType.STRING ? ConstantType.STRING : promote(lt, rt)),
  },
  [Opcode.SUB]: arithmetic((l, r) => l - r),
  [Opcode.MUL]: arithmetic((l, r) => l * r),
  [Opcode.DIV]: arithmetic((l, r) => l / r, (_l, r) => r !== 0),
  [Opcode.MOD]: arithmetic((l, r) => l % r, (_l, r) => r !== 0),
  [Opcode.POW]: arithmetic((l, r) => l ** r),
  [Opcode.GT]: numericComparison((l, r) => l > r),
  [Opcode.LT]: numericComparison((l, r) => l < r),
  [Opcode.GE]: numericComparison((l, r) => l >= r),
  [Opcode.LE]: numericComparison((l, r) => l <= r),
  // EQ/NE fold for ANY two constant-pool entries, regardless of type — the
  // constant pool never holds arrays (§28.1's box(...) always compiles to
  // ARRAY_NEW, never a pooled literal), so deep/structural equality (§28.3,
  // §30.5's reused deepEquals()) reduces to plain "===" for every value a
  // constant can ever hold, exactly like the interpreter's own deepEquals
  // does for non-array operands.
  [Opcode.EQ]: { eligible: () => true, compute: (l, r) => l === r, resultType: () => ConstantType.BOOLEAN },
  [Opcode.NE]: { eligible: () => true, compute: (l, r) => l !== r, resultType: () => ConstantType.BOOLEAN },
  // Never actually emitted by the Bytecode Generator for and/or (§29.3 —
  // those are short-circuiting and compiled with jumps instead), kept for
  // completeness and for any other bytecode producer that might emit them.
  [Opcode.AND]: booleanCombine((l, r) => l && r),
  [Opcode.OR]: booleanCombine((l, r) => l || r),
};

const UNARY_FOLDERS = {
  [Opcode.NEG]: { eligible: (t) => NUMERIC.has(t), compute: (v) => -v, resultType: (t) => t },
  [Opcode.NOT]: { eligible: (t) => t === ConstantType.BOOLEAN, compute: (v) => !v, resultType: () => ConstantType.BOOLEAN },
};

/** Returns `{ type, value }` for the fold at `i, i+1, i+2`, or `null` if not eligible. */
export function foldBinaryPair(instructions, constants, i, referenced) {
  const a = instructions[i];
  const b = instructions[i + 1];
  const op = instructions[i + 2];
  if (!a || !b || !op) return null;
  if (a.opcode !== Opcode.PUSH || b.opcode !== Opcode.PUSH) return null;

  const folder = BINARY_FOLDERS[op.opcode];
  if (!folder) return null;
  if (referenced.has(i + 1) || referenced.has(i + 2)) return null;

  const left = constants.get(a.operands[0]);
  const right = constants.get(b.operands[0]);
  if (!folder.eligible(left.type, right.type, left.value, right.value)) return null;

  return { type: folder.resultType(left.type, right.type, left.value, right.value), value: folder.compute(left.value, right.value) };
}

/** Returns `{ type, value }` for the fold at `i, i+1`, or `null` if not eligible. */
export function foldUnaryPair(instructions, constants, i, referenced) {
  const a = instructions[i];
  const op = instructions[i + 1];
  if (!a || !op) return null;
  if (a.opcode !== Opcode.PUSH) return null;

  const folder = UNARY_FOLDERS[op.opcode];
  if (!folder) return null;
  if (referenced.has(i + 1)) return null;

  const operand = constants.get(a.operands[0]);
  if (!folder.eligible(operand.type)) return null;

  return { type: folder.resultType(operand.type), value: folder.compute(operand.value) };
}

export function run(program) {
  // Iterates to a fixed point so a chain like "2 + 3 + 4" (which compiles
  // to PUSH 2; PUSH 3; ADD; PUSH 4; ADD — two triples, only the first of
  // which is adjacent on the very first scan) fully collapses to one
  // PUSH 9 from this pass alone, independent of any later pass — matters
  // for this pass's own standalone unit tests (Phase 12 brief: "Test every
  // optimization independently").
  let current = program;
  while (true) {
    const next = foldOnce(current);
    if (next === current) return current;
    current = next;
  }
}

function foldOnce(program) {
  const { instructions, constants } = program;
  const referenced = collectReferencedIndices(program);
  const keep = new Array(instructions.length).fill(true);
  const replace = new Map(); // surviving PUSH index -> new constant-pool index

  let i = 0;
  while (i < instructions.length) {
    const triple = i + 2 < instructions.length ? foldBinaryPair(instructions, constants, i, referenced) : null;
    if (triple) {
      replace.set(i, constants.add(triple.type, triple.value));
      keep[i + 1] = false;
      keep[i + 2] = false;
      i += 3;
      continue;
    }

    const pair = i + 1 < instructions.length ? foldUnaryPair(instructions, constants, i, referenced) : null;
    if (pair) {
      replace.set(i, constants.add(pair.type, pair.value));
      keep[i + 1] = false;
      i += 2;
      continue;
    }

    i += 1;
  }

  if (replace.size === 0) return program;

  const rewritten = instructions.map((instruction, idx) => {
    if (!replace.has(idx)) return instruction;
    return new Instruction(Opcode.PUSH, [replace.get(idx)], instruction.line, instruction.column);
  });

  return remapProgram({ instructions: rewritten, constants, functions: program.functions }, keep);
}

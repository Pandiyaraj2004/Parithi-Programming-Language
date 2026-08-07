/**
 * Three-address-code IR data structures — the intermediate representation
 * between the AST and the native x86-64 backend. Deliberately independent
 * of both: nothing here imports from `src/ast/` or `src/native/codegen/`,
 * so this module (and everything built on it — the generator, the
 * optimizer) could in principle feed a different CPU backend later
 * without changing a single line here.
 *
 * SHAPE (mirrors a conventional basic-block IR, simplified — no SSA/phi
 * nodes, per this phase's own "don't over-engineer" brief):
 *
 *   IRProgram
 *     .functions: IRFunction[]        — functions[0] is always the implicit
 *                                        top-level "$main" (the program's
 *                                        own top-level statements)
 *   IRFunction
 *     .name: string                   — mangled (see ir-generator.js)
 *     .params: string[]               — mangled parameter names
 *     .blocks: BasicBlock[]           — in program order; block 0 is the entry
 *   BasicBlock
 *     .label: string
 *     .instructions: IRInstruction[]  — never a control-transfer; see terminator
 *     .terminator: Terminator         — exactly one way this block's control leaves it
 *   IRInstruction
 *     .op: one of IrOp
 *     .dest: Operand | null           — a `temp` operand, or null for effect-only ops (STORE/PRINT/CALL-with-discarded-result)
 *     .args: Operand[]
 *     .node: the source AST node (diagnostics only — never consulted for codegen decisions)
 *
 * Operands are plain, deliberately-not-classed objects (`{kind, ...}`) —
 * matching this project's existing AST-node convention
 * (`src/ast/ast-nodes.js`'s own class doc) rather than introducing a new
 * one. Three kinds:
 *   temp     { kind: 'temp', id }            — a virtual register, e.g. `t3`
 *   var      { kind: 'var', name }           — a (mangled) named variable slot
 *   const    { kind: 'const', value, valueType } — a compile-time constant
 */

export const IrOp = Object.freeze({
  CONST: 'CONST',
  ADD: 'ADD', SUB: 'SUB', MUL: 'MUL', DIV: 'DIV', MOD: 'MOD', POW: 'POW',
  EQ: 'EQ', NE: 'NE', GT: 'GT', LT: 'LT', GE: 'GE', LE: 'LE',
  NEG: 'NEG', NOT: 'NOT',
  LOAD: 'LOAD', STORE: 'STORE',
  CALL: 'CALL', PRINT: 'PRINT',
  COPY: 'COPY', // t_dest = t_src or t_dest = <const> — introduced by constant propagation/short-circuit lowering; removable by temp-elimination (§6F)
});

/** Every op that can be safely deleted when its `dest` is provably never read — i.e. it has NO effect beyond producing a value. STORE/CALL/PRINT/RETURN are never in this set (§6, "never remove code that may have side effects"). */
export const PURE_OPS = new Set([
  IrOp.CONST, IrOp.ADD, IrOp.SUB, IrOp.MUL, IrOp.DIV, IrOp.MOD, IrOp.POW,
  IrOp.EQ, IrOp.NE, IrOp.GT, IrOp.LT, IrOp.GE, IrOp.LE,
  IrOp.NEG, IrOp.NOT, IrOp.LOAD, IrOp.COPY,
]);

export const TerminatorKind = Object.freeze({
  NONE: 'NONE', // falls through to the next block in program order (only valid mid-function; the last block of a function gets an implicit RETURN — see ir-generator.js)
  JUMP: 'JUMP',
  BRANCH: 'BRANCH',
  RETURN: 'RETURN',
});

// --- Operand constructors -------------------------------------------------

export function temp(id) {
  return { kind: 'temp', id };
}

export function variable(name) {
  return { kind: 'var', name };
}

export function constant(value, valueType) {
  return { kind: 'const', value, valueType };
}

export function isTemp(operand) {
  return operand?.kind === 'temp';
}

export function isVar(operand) {
  return operand?.kind === 'var';
}

export function isConst(operand) {
  return operand?.kind === 'const';
}

/** Two operands referring to the exact same storage (used by optimizer passes to detect e.g. `x = x`). */
export function sameOperand(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'temp') return a.id === b.id;
  if (a.kind === 'var') return a.name === b.name;
  return a.value === b.value && a.valueType === b.valueType;
}

// --- Core IR structures ----------------------------------------------------

export class IRInstruction {
  constructor(op, dest, args, node = null) {
    this.op = op;
    this.dest = dest;
    this.args = args;
    this.node = node;
  }
}

export class BasicBlock {
  constructor(label) {
    this.label = label;
    this.instructions = [];
    /** One of: {kind:'NONE'} | {kind:'JUMP', target} | {kind:'BRANCH', condition, trueTarget, falseTarget} | {kind:'RETURN', value: Operand|null} */
    this.terminator = { kind: TerminatorKind.NONE };
  }
}

export class IRFunction {
  constructor(name, params, node = null) {
    this.name = name;
    this.params = params;
    this.blocks = [];
    this.node = node;
  }
}

export class IRProgram {
  constructor() {
    this.functions = [];
  }
}

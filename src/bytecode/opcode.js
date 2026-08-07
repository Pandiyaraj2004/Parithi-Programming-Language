/**
 * Opcode vocabulary for Parithi Bytecode (Phase 10 — MASTER_DOCUMENT.md §29).
 * Every opcode's operand list and net operand-stack effect (pushes minus
 * pops) is declared once, here, so the Generator (which emits instructions),
 * the Validator (which checks stack balance), and the Writer (which prints
 * or serializes them) all agree with a single source of truth instead of
 * three independent hand-maintained copies.
 *
 * Two opcodes — AND, OR — are defined but never emitted by the Generator
 * for Parithi's actual `and`/`or` operators, which are short-circuiting
 * (§13.7) and are instead compiled with JMP_IF_TRUE/JMP_IF_FALSE to stay
 * observably identical to the Interpreter. They're kept in the instruction
 * set (as eager/non-short-circuit boolean combinators) because they were
 * explicitly requested as part of a "clean instruction set," and because a
 * future optimizer pass could legitimately lower a *provably* side-effect-free
 * `and`/`or` back down to one of these — see §29.3.
 *
 * `argCount`-style operands (CALL/PRINT/ARRAY_NEW) have a variable net
 * stack effect, so `stackEffect` is a function of the resolved operands
 * rather than a constant for those three.
 */

export const Opcode = Object.freeze({
  PUSH: 'PUSH',
  POP: 'POP',
  LOAD: 'LOAD',
  STORE: 'STORE',

  ADD: 'ADD',
  SUB: 'SUB',
  MUL: 'MUL',
  DIV: 'DIV',
  MOD: 'MOD',
  POW: 'POW',
  NEG: 'NEG',

  EQ: 'EQ',
  NE: 'NE',
  GT: 'GT',
  LT: 'LT',
  GE: 'GE',
  LE: 'LE',

  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',

  JMP: 'JMP',
  JMP_IF_TRUE: 'JMP_IF_TRUE',
  JMP_IF_FALSE: 'JMP_IF_FALSE',

  CALL: 'CALL',
  RETURN: 'RETURN',

  PRINT: 'PRINT',
  INPUT: 'INPUT',

  ARRAY_NEW: 'ARRAY_NEW',
  ARRAY_GET: 'ARRAY_GET',
  ARRAY_SET: 'ARRAY_SET',

  HALT: 'HALT',
});

/**
 * `operands`: names of this opcode's operands, in encoding order — purely
 * descriptive (used by the text writer's disassembly and by validation
 * error messages), not a type system.
 *   - "const"  → an index into the constant pool
 *   - "target" → an absolute instruction index (a resolved label)
 *   - "count"  → a plain non-negative integer (element/argument count)
 *
 * `stackEffect(operands)`: net operand-stack delta (pushes − pops) this
 * instruction causes, as a *count of values*, not bytes. A function (not a
 * constant) for the three variable-arity opcodes.
 */
export const OPCODE_INFO = Object.freeze({
  [Opcode.PUSH]: { operands: ['const'], stackEffect: () => 1 },
  [Opcode.POP]: { operands: [], stackEffect: () => -1 },
  [Opcode.LOAD]: { operands: ['const'], stackEffect: () => 1 },
  [Opcode.STORE]: { operands: ['const'], stackEffect: () => -1 },

  [Opcode.ADD]: { operands: [], stackEffect: () => -1 },
  [Opcode.SUB]: { operands: [], stackEffect: () => -1 },
  [Opcode.MUL]: { operands: [], stackEffect: () => -1 },
  [Opcode.DIV]: { operands: [], stackEffect: () => -1 },
  [Opcode.MOD]: { operands: [], stackEffect: () => -1 },
  [Opcode.POW]: { operands: [], stackEffect: () => -1 },
  [Opcode.NEG]: { operands: [], stackEffect: () => 0 },

  [Opcode.EQ]: { operands: [], stackEffect: () => -1 },
  [Opcode.NE]: { operands: [], stackEffect: () => -1 },
  [Opcode.GT]: { operands: [], stackEffect: () => -1 },
  [Opcode.LT]: { operands: [], stackEffect: () => -1 },
  [Opcode.GE]: { operands: [], stackEffect: () => -1 },
  [Opcode.LE]: { operands: [], stackEffect: () => -1 },

  [Opcode.AND]: { operands: [], stackEffect: () => -1 },
  [Opcode.OR]: { operands: [], stackEffect: () => -1 },
  [Opcode.NOT]: { operands: [], stackEffect: () => 0 },

  [Opcode.JMP]: { operands: ['target'], stackEffect: () => 0 },
  [Opcode.JMP_IF_TRUE]: { operands: ['target'], stackEffect: () => -1 },
  [Opcode.JMP_IF_FALSE]: { operands: ['target'], stackEffect: () => -1 },

  [Opcode.CALL]: { operands: ['const', 'count'], stackEffect: (operands) => 1 - operands[1] },
  [Opcode.RETURN]: { operands: [], stackEffect: () => 0 },

  [Opcode.PRINT]: { operands: ['count'], stackEffect: (operands) => -operands[0] },
  [Opcode.INPUT]: { operands: [], stackEffect: () => 0 },

  [Opcode.ARRAY_NEW]: { operands: ['count'], stackEffect: (operands) => 1 - operands[0] },
  [Opcode.ARRAY_GET]: { operands: [], stackEffect: () => -1 },
  [Opcode.ARRAY_SET]: { operands: [], stackEffect: () => -3 },

  [Opcode.HALT]: { operands: [], stackEffect: () => -1 },
});

export function stackEffectOf(opcode, operands) {
  return OPCODE_INFO[opcode].stackEffect(operands);
}

/**
 * Fixed opcode → numeric-ID mapping for the binary `.pbc` format (§29.7).
 * A literal array, not `Object.keys(Opcode)` — key order in a JS object is
 * an implementation detail that happens to be insertion order today, but
 * pinning the numbering explicitly here means it can never silently shift
 * if `Opcode` is ever reordered or extended in the middle.
 */
export const OPCODE_LIST = Object.freeze([
  Opcode.PUSH, Opcode.POP, Opcode.LOAD, Opcode.STORE,
  Opcode.ADD, Opcode.SUB, Opcode.MUL, Opcode.DIV, Opcode.MOD, Opcode.POW, Opcode.NEG,
  Opcode.EQ, Opcode.NE, Opcode.GT, Opcode.LT, Opcode.GE, Opcode.LE,
  Opcode.AND, Opcode.OR, Opcode.NOT,
  Opcode.JMP, Opcode.JMP_IF_TRUE, Opcode.JMP_IF_FALSE,
  Opcode.CALL, Opcode.RETURN,
  Opcode.PRINT, Opcode.INPUT,
  Opcode.ARRAY_NEW, Opcode.ARRAY_GET, Opcode.ARRAY_SET,
  Opcode.HALT,
]);

export const OPCODE_ID = Object.freeze(
  Object.fromEntries(OPCODE_LIST.map((opcode, id) => [opcode, id])),
);

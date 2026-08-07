/**
 * ConstantPropagation (Phase 12, §31, Pass 2). Replaces every `LOAD` of a
 * slot whose value is *provably* one single, compile-time-known literal
 * for the slot's entire lifetime with a direct `PUSH` of that literal —
 * e.g. `const PI = 3.14 / hold area = PI * 10` compiles to
 * `PUSH 3.14; STORE PI$n / LOAD PI$n; PUSH 10; MUL`, and this pass turns
 * the `LOAD PI$n` into `PUSH 3.14` directly, then removes the now-dead
 * original `PUSH 3.14; STORE PI$n` declaration once nothing references
 * the slot by name anymore.
 *
 * **Why this is "single-assignment" analysis, not a `const`-vs-`hold`
 * check:** by the time bytecode exists, the Bytecode Generator has already
 * erased that distinction on purpose (§29.2) — `compileVariableDeclaration`
 * emits the identical `PUSH; STORE` shape for both `hold` and `const`, and
 * nothing in the Instruction/ConstantPool format records which keyword
 * declared a slot. Re-deriving "is this a const" from source-level
 * information the optimizer isn't supposed to look at (Semantic
 * Analyzer / AST) would also mean re-running whatever the AST said,
 * against the brief's "no scope-push/pop opcode exists, don't reinvent one"
 * philosophy — so instead this pass asks a strictly *more general* and
 * still exactly-as-safe question directly of the bytecode itself: **is
 * this slot written to by `STORE` exactly once, anywhere in the whole
 * program, by a literal value?** A slot assigned exactly once has only one
 * possible value for its entire lifetime regardless of whether it was
 * declared `hold` or `const` — this provably includes every `const`
 * (`P005` forbids ever reassigning one) and additionally captures a
 * `hold` that simply never happens to be reassigned, which is strictly
 * *more* optimization than a syntactic "const-only" rule while remaining
 * exactly as behavior-preserving.
 *
 * **Why array values can never be (mis-)propagated:** the pattern this
 * pass matches is "the instruction immediately before the sole `STORE` is
 * a `PUSH` of a scalar constant-pool entry." `box(...)` always compiles to
 * `..., ARRAY_NEW n, STORE` (§29.3) — `ARRAY_NEW` is a different opcode
 * from `PUSH`, so an array-valued declaration can never match this
 * pattern. Array reference semantics (§28.3) are therefore untouched by
 * construction, not by a special-case type check.
 *
 * **Why a function parameter's slot is never touched:** parameters are
 * bound directly by the PVM's `CALL` handler (`frame.bind()`, §30.5) —
 * there is no `STORE` instruction anywhere in the bytecode for a parameter
 * slot at all, so it never appears in this pass's "slots written by
 * `STORE`" analysis in the first place.
 */

import { Opcode } from '../../bytecode/opcode.js';
import { ConstantType } from '../../bytecode/constant-pool.js';
import { Instruction } from '../../bytecode/instruction.js';
import { collectReferencedIndices, remapProgram } from '../program-utils.js';

export const name = 'ConstantPropagation';

const SCALAR_TYPES = new Set([
  ConstantType.NUMBER,
  ConstantType.DECIMAL,
  ConstantType.STRING,
  ConstantType.BOOLEAN,
  ConstantType.EMPTY,
]);

export function run(program) {
  const { instructions, constants } = program;
  const referenced = collectReferencedIndices(program);

  const storeCount = new Map(); // slot name -> number of STORE instructions seen
  const firstStore = new Map(); // slot name -> { pushIndex, storeIndex, constIndex } (only meaningful when storeCount === 1)

  instructions.forEach((instruction, index) => {
    if (instruction.opcode !== Opcode.STORE) return;
    const slotName = constants.get(instruction.operands[0]).value;
    storeCount.set(slotName, (storeCount.get(slotName) ?? 0) + 1);

    if (storeCount.get(slotName) !== 1) return; // only the first STORE's shape matters below
    const previous = index > 0 ? instructions[index - 1] : null;
    const isLiteralInitializer =
      previous?.opcode === Opcode.PUSH &&
      SCALAR_TYPES.has(constants.get(previous.operands[0]).type) &&
      !referenced.has(index) &&
      !referenced.has(index - 1);
    if (isLiteralInitializer) {
      firstStore.set(slotName, { pushIndex: index - 1, storeIndex: index, constIndex: previous.operands[0] });
    }
  });

  // Eligible: exactly one STORE for the slot in the whole program, and that
  // STORE's value came directly from a literal PUSH (see class doc).
  const eligible = new Map(); // slot name -> literal constant-pool index
  for (const [slotName, info] of firstStore) {
    if (storeCount.get(slotName) === 1) eligible.set(slotName, info.constIndex);
  }

  if (eligible.size === 0) return program;

  const rewritten = instructions.map((instruction) => {
    if (instruction.opcode !== Opcode.LOAD) return instruction;
    const slotName = constants.get(instruction.operands[0]).value;
    if (!eligible.has(slotName)) return instruction;
    return new Instruction(Opcode.PUSH, [eligible.get(slotName)], instruction.line, instruction.column);
  });

  // Every LOAD of an eligible slot was just replaced above, and it had
  // exactly one STORE (its own declaration) — so nothing in the program
  // still references the slot by name; the declaration itself is now dead.
  const keep = new Array(instructions.length).fill(true);
  for (const [slotName, info] of firstStore) {
    if (eligible.has(slotName)) {
      keep[info.pushIndex] = false;
      keep[info.storeIndex] = false;
    }
  }

  return remapProgram({ instructions: rewritten, constants, functions: program.functions }, keep);
}

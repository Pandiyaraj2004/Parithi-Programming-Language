/**
 * Bytecode Validator (Phase 10, §29.6). Runs immediately after generation
 * (both `pari --bytecode` and `pari --compile` call it, and it can't be
 * skipped — see commands.js) and checks the four soundness properties
 * §29 asks for, none of which the Generator's own control flow already
 * guarantees structurally:
 *
 *   1. Constant references — every PUSH/LOAD/STORE/CALL "const" operand
 *      indexes an entry that actually exists in the constant pool.
 *   2. Jump targets — every JMP/JMP_IF_TRUE/JMP_IF_FALSE "target" operand
 *      (and every function table entry point) is a real instruction index.
 *      (BytecodeBuilder.resolve() already guarantees every *label* was
 *      placed somewhere — this additionally guarantees "somewhere" is
 *      actually inside the program.)
 *   3. Stack balance — a symbolic walk of the operand-stack depth through
 *      every reachable instruction, seeded fresh (depth 0) at instruction
 *      0 and at every function's entry point (a CALL starts a callee with
 *      a clean stack — §29.2), confirming every branch into the same
 *      instruction agrees on depth, and that every RETURN/HALT is reached
 *      with exactly one value pending (the return value / exit code).
 *   4. Argument counts — a CALL naming a known task (not a built-in, whose
 *      arity isn't tracked in the bytecode format — the built-in registry
 *      owns that, per §17.5) must pass exactly that task's parameter count.
 *
 * Returns `{ valid: true }` or `{ valid: false, errors: [string, ...] }` —
 * collects every problem found rather than throwing on the first one,
 * matching this codebase's existing "report everything, once" preference
 * (Parser.synchronize(), SemanticAnalyzer.diagnostics).
 */

import { Opcode, OPCODE_INFO } from './opcode.js';

const JUMP_OPCODES = new Set([Opcode.JMP, Opcode.JMP_IF_TRUE, Opcode.JMP_IF_FALSE]);
const CONDITIONAL_JUMP_OPCODES = new Set([Opcode.JMP_IF_TRUE, Opcode.JMP_IF_FALSE]);

export function validateBytecode(program) {
  const errors = [];
  checkConstantReferences(program, errors);
  checkJumpTargets(program, errors);
  checkFunctionTable(program, errors);
  if (errors.length === 0) {
    // These two need every prior check to have passed first — they index
    // into the constant pool / function table themselves.
    checkArgumentCounts(program, errors);
    checkStackBalance(program, errors);
  }
  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}

function describe(instruction, index) {
  return `#${index} (${instruction.toString()}${instruction.line ? ` @ ${instruction.line}:${instruction.column}` : ''})`;
}

function checkConstantReferences(program, errors) {
  const { instructions, constants } = program;
  instructions.forEach((instruction, index) => {
    const { operands } = OPCODE_INFO[instruction.opcode];
    operands.forEach((kind, operandIndex) => {
      if (kind !== 'const') return;
      const value = instruction.operands[operandIndex];
      if (!Number.isInteger(value) || value < 0 || value >= constants.size) {
        errors.push(`${describe(instruction, index)}: constant-pool reference ${value} is out of range (0..${constants.size - 1}).`);
      }
    });
  });
}

function checkJumpTargets(program, errors) {
  const { instructions } = program;
  instructions.forEach((instruction, index) => {
    if (!JUMP_OPCODES.has(instruction.opcode)) return;
    const [target] = instruction.operands;
    if (!Number.isInteger(target) || target < 0 || target >= instructions.length) {
      errors.push(`${describe(instruction, index)}: jump target ${target} is out of range (0..${instructions.length - 1}).`);
    }
  });
}

function checkFunctionTable(program, errors) {
  const { instructions, functions } = program;
  const seenNames = new Set();
  for (const fn of functions) {
    if (seenNames.has(fn.name)) {
      errors.push(`Function table: duplicate mangled name "${fn.name}" — this indicates a Generator bug, not a source-program error.`);
    }
    seenNames.add(fn.name);

    if (!Array.isArray(fn.paramSlots)) {
      errors.push(`Function table: "${fn.name}" has no resolved parameter slots (its body was hoisted but never compiled).`);
    }
    if (!Number.isInteger(fn.entryIndex) || fn.entryIndex < 0 || fn.entryIndex >= instructions.length) {
      errors.push(`Function table: "${fn.name}"'s entry point ${fn.entryIndex} is out of range (0..${instructions.length - 1}).`);
    }
  }
}

/** A CALL naming a known task must pass exactly that task's declared parameter count; a call to a built-in is skipped (§17.5 owns builtin arity, not the bytecode format). */
function checkArgumentCounts(program, errors) {
  const { instructions, constants, functions } = program;
  const byName = new Map(functions.map((fn) => [fn.name, fn]));

  instructions.forEach((instruction, index) => {
    if (instruction.opcode !== Opcode.CALL) return;
    const [nameConst, argCount] = instruction.operands;
    const name = constants.get(nameConst).value;
    const fn = byName.get(name);
    if (fn && Array.isArray(fn.paramSlots) && fn.paramSlots.length !== argCount) {
      errors.push(`${describe(instruction, index)}: calls "${name}" with ${argCount} argument(s), but it takes ${fn.paramSlots.length}.`);
    }
  });
}

/**
 * Symbolic stack-depth walk. Regions (the top-level program, and each
 * function body) are validated together in one worklist, since a CALL
 * never transfers the walk's "current depth" into the callee — each
 * region is independently seeded at depth 0 (see class doc, point 3).
 */
function checkStackBalance(program, errors) {
  const { instructions, functions } = program;
  const visitedDepth = new Map(); // instruction index -> depth confirmed on entry
  const worklist = [{ index: 0, depth: 0 }];
  for (const fn of functions) worklist.push({ index: fn.entryIndex, depth: 0 });

  while (worklist.length > 0) {
    const { index, depth } = worklist.pop();
    if (index >= instructions.length) continue; // guarded elsewhere by checkJumpTargets/checkFunctionTable

    const existing = visitedDepth.get(index);
    if (existing !== undefined) {
      if (existing !== depth) {
        errors.push(
          `${describe(instructions[index], index)}: reached with inconsistent stack depth (${depth} here, ${existing} from another path) — this indicates a Generator bug, not a source-program error.`,
        );
      }
      continue; // already explored from here — no need to re-walk
    }
    visitedDepth.set(index, depth);

    const instruction = instructions[index];
    if (depth < 0) {
      errors.push(`${describe(instruction, index)}: stack underflow (depth went negative).`);
      continue;
    }

    if (instruction.opcode === Opcode.RETURN || instruction.opcode === Opcode.HALT) {
      // Both expect exactly one pending value: the return value, or the exit code (§29.2/§29's HALT convention).
      if (depth !== 1) {
        errors.push(`${describe(instruction, index)}: expected exactly 1 value on the stack, found ${depth}.`);
      }
      continue; // terminal — no successor
    }

    const nextDepth = depth + instruction.stackEffect;

    if (instruction.opcode === Opcode.JMP) {
      worklist.push({ index: instruction.operands[0], depth: nextDepth });
      continue;
    }
    if (CONDITIONAL_JUMP_OPCODES.has(instruction.opcode)) {
      worklist.push({ index: instruction.operands[0], depth: nextDepth }); // taken
      worklist.push({ index: index + 1, depth: nextDepth }); // fallthrough
      continue;
    }

    worklist.push({ index: index + 1, depth: nextDepth });
  }
}

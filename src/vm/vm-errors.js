/**
 * VM error helpers (Phase 11 — MASTER_DOCUMENT.md §30).
 * Every error the VM raises is a `ParithiRuntimeError` (imported, never
 * redefined — "MUST NOT be modified" per the Phase 11 brief) so VM output
 * is formatted through the exact same `printError()`/`.format()` path
 * every other Parithi error already uses (§18) — never a raw JS error.
 *
 * Two families of error, deliberately kept distinct:
 *
 * 1. **Language-runtime errors** — conditions the Interpreter can also
 *    hit, reusing its EXACT documented code (P015/P020/P021/P024–P027):
 *    division by zero, array bounds, call-depth overflow, unknown
 *    function, array-type errors. These are the ones "VM output matches
 *    interpreter output" is actually about — same code, same message
 *    text, same hint, for the same source-level mistake.
 * 2. **Bytecode-integrity errors** — conditions that can NEVER happen from
 *    Generator-produced, Validator-passed bytecode (an out-of-range jump,
 *    an unrecognized opcode byte, a stack that underflows, a RETURN with
 *    no frame to return to). These reuse **P023** ("Unexpected runtime
 *    failure"), exactly the existing catch-all's own stated purpose
 *    (§18: "a catch-all... so a raw stack trace can never reach the
 *    user") — extended here to a second source of "this should be
 *    impossible": hand-crafted or corrupted `.pbc` input, not just an
 *    unrecognized AST node. No new error code was added for these —
 *    P023 already exists for precisely this shape of problem.
 */

import { ParithiRuntimeError } from '../errors/index.js';

export function stackUnderflow(location, callStack) {
  return new ParithiRuntimeError(
    'P023',
    'VM operand stack underflow — an instruction tried to pop a value that was never pushed.',
    location,
    callStack,
    'this indicates corrupted or hand-crafted bytecode, not a problem with your Parithi program — please report it with the .pbc (or source) file that triggered it.',
  );
}

export function operandStackOverflow(location, callStack, limit) {
  return new ParithiRuntimeError(
    'P021',
    `Operand stack overflow (limit ${limit}) — the program pushed far more values than it ever popped.`,
    location,
    callStack,
    'this usually means a loop or recursive call never reaches a base case — check that every branch eventually stops pushing.',
  );
}

export function callDepthOverflow(location, callStack, maxDepth) {
  return new ParithiRuntimeError(
    'P021',
    `Maximum call depth (${maxDepth}) exceeded — likely infinite recursion.`,
    location,
    callStack,
    'check that every recursive call moves toward a base case that actually returns without calling itself again.',
  );
}

export function invalidOpcode(location, callStack, opcodeId) {
  return new ParithiRuntimeError(
    'P023',
    `Invalid opcode byte (${opcodeId}) encountered — this is not a recognized Parithi Bytecode instruction.`,
    location,
    callStack,
    'this indicates corrupted or hand-crafted bytecode — please report it with the .pbc file that triggered it.',
  );
}

export function invalidJump(location, callStack, target) {
  return new ParithiRuntimeError(
    'P023',
    `Invalid jump target (${target}) — outside the program's instruction range.`,
    location,
    callStack,
    'this indicates corrupted or hand-crafted bytecode — please report it with the .pbc file that triggered it.',
  );
}

export function invalidConstant(location, callStack, index) {
  return new ParithiRuntimeError(
    'P023',
    `Invalid constant-pool reference (${index}) — outside the program's constant pool range.`,
    location,
    callStack,
    'this indicates corrupted or hand-crafted bytecode — please report it with the .pbc file that triggered it.',
  );
}

export function invalidFrame(location, callStack, reason) {
  return new ParithiRuntimeError(
    'P023',
    `Invalid call frame: ${reason}.`,
    location,
    callStack,
    'this indicates corrupted or hand-crafted bytecode — please report it with the .pbc file that triggered it.',
  );
}

export function slotNotFound(location, callStack, name) {
  return new ParithiRuntimeError(
    'P023',
    `Variable slot "${name}" was read/written but never exists in any active frame.`,
    location,
    callStack,
    'this indicates corrupted or hand-crafted bytecode — please report it with the .pbc file that triggered it.',
  );
}

export function unknownFunction(location, callStack, name) {
  return new ParithiRuntimeError(
    'P015',
    `Unknown function "${name}".`,
    location,
    callStack,
    'check the spelling — this name is neither a compiled task nor a recognized built-in.',
  );
}

export function divisionByZero(location, callStack, isModulo) {
  return new ParithiRuntimeError(
    'P020',
    isModulo ? 'Division by zero (modulo).' : 'Division by zero.',
    location,
    callStack,
    isModulo
      ? 'check the divisor before using "%", e.g. "if b is not 0".'
      : 'check the divisor before dividing, e.g. "if b is not 0".',
  );
}

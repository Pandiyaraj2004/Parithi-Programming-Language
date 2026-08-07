/**
 * Instruction Dispatcher (Phase 11, §30.7) — one handler per opcode,
 * every one taking `(vm, instruction)` and returning either a new
 * instruction pointer (a jump/call/return) or `undefined` (fall through
 * to the next instruction — `VirtualMachine.step()` supplies `ip + 1`
 * when a handler returns `undefined`).
 *
 * Every handler that performs an actual Parithi *operation* — arithmetic,
 * comparison, array access, a built-in call — either mirrors
 * `Interpreter`'s own logic exactly (arithmetic/comparison have no
 * standalone helper function to import, so they're hand-mirrored, kept
 * to the same one-line-per-operator shape `visitBinaryExpression` uses)
 * or, wherever a reusable helper already exists, calls straight through
 * to it: `deepEquals()`/`stringify()` (Runtime System), `callBuiltin()`
 * (Interpreter's built-ins), `assertIndexable()`/`resolveIndex()`/
 * `checkElementType()`/`validateHomogeneousElements()` (the array
 * built-ins module, which the Interpreter's own array opcodes-equivalent
 * visitors already call). This is deliberate: it is what guarantees the
 * PVM computes the identical result AND raises the identical error for
 * every one of these, since there is only ever one implementation.
 */

import { Opcode } from '../bytecode/index.js';
import { Frame, displayFunctionName } from './frame.js';
import { deepEquals, stringify } from './runtime-values.js';
import { callBuiltin, isBuiltinName } from './builtins.js';
import {
  assertIndexable,
  resolveIndex,
  checkElementType,
  validateHomogeneousElements,
} from '../interpreter/builtins/array.js';
import {
  divisionByZero,
  callDepthOverflow,
  invalidFrame,
  unknownFunction,
  slotNotFound,
} from './vm-errors.js';

// Mirrors src/runtime/call-stack.js's own default exactly (that file is
// "MUST NOT be modified" per the Phase 11 brief, so it isn't imported
// from — a single, well-commented, manually-synchronized constant here
// is the lower-risk choice over adding an export to a protected file).
export const MAX_CALL_DEPTH = 500;

function popTwo(vm) {
  const location = vm.currentLocation();
  const callStack = vm.describeCallStack();
  const right = vm.stack.pop(location, callStack);
  const left = vm.stack.pop(location, callStack);
  return { left, right, location, callStack };
}

// ---------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------

function handlePush(vm, instruction) {
  const value = vm.constantAt(instruction.operands[0]);
  vm.stack.push(value, vm.currentLocation(), vm.describeCallStack());
}

function handlePop(vm) {
  vm.stack.pop(vm.currentLocation(), vm.describeCallStack());
}

function handleLoad(vm, instruction) {
  const name = vm.constantAt(instruction.operands[0]);
  const location = vm.currentLocation();
  const callStack = vm.describeCallStack();
  if (!vm.currentFrame.has(name)) {
    throw slotNotFound(location, callStack, name);
  }
  vm.stack.push(vm.currentFrame.load(name), location, callStack);
}

function handleStore(vm, instruction) {
  const name = vm.constantAt(instruction.operands[0]);
  const value = vm.stack.pop(vm.currentLocation(), vm.describeCallStack());
  vm.currentFrame.store(name, value);
}

// ---------------------------------------------------------------------
// Arithmetic — mirrors Interpreter.visitBinaryExpression's numeric cases exactly
// ---------------------------------------------------------------------

function handleAdd(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  vm.stack.push(left + right, location, callStack);
}

function handleSub(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  vm.stack.push(left - right, location, callStack);
}

function handleMul(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  vm.stack.push(left * right, location, callStack);
}

function handleDiv(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  if (right === 0) throw divisionByZero(location, callStack, false);
  vm.stack.push(left / right, location, callStack);
}

function handleMod(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  if (right === 0) throw divisionByZero(location, callStack, true);
  vm.stack.push(left % right, location, callStack);
}

function handlePow(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  vm.stack.push(left ** right, location, callStack);
}

function handleNeg(vm) {
  const location = vm.currentLocation();
  const callStack = vm.describeCallStack();
  const operand = vm.stack.pop(location, callStack);
  vm.stack.push(-operand, location, callStack);
}

// ---------------------------------------------------------------------
// Comparison — EQ/NE are deep/structural (§28.3), matching Interpreter exactly
// ---------------------------------------------------------------------

function handleEq(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  vm.stack.push(deepEquals(left, right), location, callStack);
}

function handleNe(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  vm.stack.push(!deepEquals(left, right), location, callStack);
}

function handleGt(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  vm.stack.push(left > right, location, callStack);
}

function handleLt(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  vm.stack.push(left < right, location, callStack);
}

function handleGe(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  vm.stack.push(left >= right, location, callStack);
}

function handleLe(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  vm.stack.push(left <= right, location, callStack);
}

// ---------------------------------------------------------------------
// Logic — eager AND/OR, defined but never emitted for Parithi's actual
// short-circuiting "and"/"or" (§13.7/§29.2) — the Generator compiles
// those with JMP_IF_TRUE/JMP_IF_FALSE instead. Implemented here anyway
// for a complete, correct instruction set (hand-written or future-
// optimizer-emitted bytecode may still use them).
// ---------------------------------------------------------------------

function handleAnd(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  vm.stack.push(Boolean(left) && Boolean(right), location, callStack);
}

function handleOr(vm) {
  const { left, right, location, callStack } = popTwo(vm);
  vm.stack.push(Boolean(left) || Boolean(right), location, callStack);
}

function handleNot(vm) {
  const location = vm.currentLocation();
  const callStack = vm.describeCallStack();
  const operand = vm.stack.pop(location, callStack);
  vm.stack.push(!operand, location, callStack);
}

// ---------------------------------------------------------------------
// Control flow
// ---------------------------------------------------------------------

function handleJmp(vm, instruction) {
  return instruction.operands[0];
}

function handleJmpIfTrue(vm, instruction) {
  const condition = vm.stack.pop(vm.currentLocation(), vm.describeCallStack());
  return condition === true ? instruction.operands[0] : undefined;
}

function handleJmpIfFalse(vm, instruction) {
  const condition = vm.stack.pop(vm.currentLocation(), vm.describeCallStack());
  return condition === false ? instruction.operands[0] : undefined;
}

// ---------------------------------------------------------------------
// Functions — see frame.js's class doc for the lexicalParent/callerFrame split
// ---------------------------------------------------------------------

function handleCall(vm, instruction) {
  const [nameIndex, argCount] = instruction.operands;
  const name = vm.constantAt(nameIndex);
  const location = vm.currentLocation();
  const callStack = vm.describeCallStack();
  const args = vm.stack.popN(argCount, location, callStack);

  const fn = vm.functionsByName.get(name);
  if (fn) {
    if (vm.callDepth >= MAX_CALL_DEPTH) {
      throw callDepthOverflow(location, callStack, MAX_CALL_DEPTH);
    }
    const lexicalParent = fn.isNested ? vm.currentFrame : vm.memory.globalFrame;
    const newFrame = new Frame(fn.name, lexicalParent, vm.currentFrame, vm.ip + 1, location);
    fn.paramSlots.forEach((slot, i) => newFrame.bind(slot, args[i]));
    vm.currentFrame = newFrame;
    vm.callDepth++;
    return fn.entryIndex;
  }

  if (isBuiltinName(name)) {
    const result = callBuiltin(name, args, location);
    vm.stack.push(result, location, callStack);
    return undefined;
  }

  throw unknownFunction(location, callStack, name); // unreachable for valid Generator output — §30.8
}

function handleReturn(vm) {
  const frame = vm.currentFrame;
  if (frame === vm.memory.globalFrame) {
    throw invalidFrame(vm.currentLocation(), vm.describeCallStack(), 'RETURN executed with no active call frame');
  }
  vm.currentFrame = frame.callerFrame;
  vm.callDepth--;
  return frame.returnIP;
}

// ---------------------------------------------------------------------
// Console
// ---------------------------------------------------------------------

function handlePrint(vm, instruction) {
  const [count] = instruction.operands;
  const location = vm.currentLocation();
  const callStack = vm.describeCallStack();
  const values = vm.stack.popN(count, location, callStack);
  vm.io.writeLine(values.map(stringify).join(' '));
}

function handleInput(vm) {
  const location = vm.currentLocation();
  const callStack = vm.describeCallStack();
  const prompt = vm.stack.pop(location, callStack);
  vm.io.write(stringify(prompt));
  vm.stack.push(vm.io.readLine(), location, callStack);
}

// ---------------------------------------------------------------------
// Arrays — delegates the actual semantics to the array built-ins module,
// exactly what Interpreter.visitArrayLiteral/visitArrayAccess/
// visitArrayAssignment already call (§28.3, §29.2)
// ---------------------------------------------------------------------

function handleArrayNew(vm, instruction) {
  const [count] = instruction.operands;
  const location = vm.currentLocation();
  const callStack = vm.describeCallStack();
  const elements = vm.stack.popN(count, location, callStack);
  validateHomogeneousElements(elements, location);
  const array = vm.memory.heap.allocateArray(elements);
  vm.stack.push(array, location, callStack);
}

function handleArrayGet(vm) {
  const location = vm.currentLocation();
  const callStack = vm.describeCallStack();
  const index = vm.stack.pop(location, callStack);
  const array = vm.stack.pop(location, callStack);
  assertIndexable(array, location);
  const resolvedIndex = resolveIndex(array, index, 'array indexing ("[...]")', location);
  vm.stack.push(array[resolvedIndex], location, callStack);
}

function handleArraySet(vm) {
  const location = vm.currentLocation();
  const callStack = vm.describeCallStack();
  const index = vm.stack.pop(location, callStack);
  const value = vm.stack.pop(location, callStack);
  const array = vm.stack.pop(location, callStack);
  assertIndexable(array, location);
  const resolvedIndex = resolveIndex(array, index, 'array assignment ("[...]")', location);
  checkElementType(array, value, location);
  array[resolvedIndex] = value;
}

// ---------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------

// HALT covers BOTH normal termination (the Generator's own trailing
// "PUSH 0; HALT") and a deliberate "stop [code]" statement (compiled to
// "PUSH code; HALT" — §15.7, §29.5) — the two are bytecode-identical by
// design, so there is no separate STOP opcode (Phase 10's opcode set,
// which this phase must not modify, doesn't have one).
function handleHalt(vm) {
  const location = vm.currentLocation();
  const callStack = vm.describeCallStack();
  const code = vm.stack.pop(location, callStack);
  vm.exitCode = Math.trunc(code); // matches StopSignal's own defensive truncation (§15.7)
  vm.halted = true;
}

export const OPCODE_HANDLERS = Object.freeze({
  [Opcode.PUSH]: handlePush,
  [Opcode.POP]: handlePop,
  [Opcode.LOAD]: handleLoad,
  [Opcode.STORE]: handleStore,

  [Opcode.ADD]: handleAdd,
  [Opcode.SUB]: handleSub,
  [Opcode.MUL]: handleMul,
  [Opcode.DIV]: handleDiv,
  [Opcode.MOD]: handleMod,
  [Opcode.POW]: handlePow,
  [Opcode.NEG]: handleNeg,

  [Opcode.EQ]: handleEq,
  [Opcode.NE]: handleNe,
  [Opcode.GT]: handleGt,
  [Opcode.LT]: handleLt,
  [Opcode.GE]: handleGe,
  [Opcode.LE]: handleLe,

  [Opcode.AND]: handleAnd,
  [Opcode.OR]: handleOr,
  [Opcode.NOT]: handleNot,

  [Opcode.JMP]: handleJmp,
  [Opcode.JMP_IF_TRUE]: handleJmpIfTrue,
  [Opcode.JMP_IF_FALSE]: handleJmpIfFalse,

  [Opcode.CALL]: handleCall,
  [Opcode.RETURN]: handleReturn,

  [Opcode.PRINT]: handlePrint,
  [Opcode.INPUT]: handleInput,

  [Opcode.ARRAY_NEW]: handleArrayNew,
  [Opcode.ARRAY_GET]: handleArrayGet,
  [Opcode.ARRAY_SET]: handleArraySet,

  [Opcode.HALT]: handleHalt,
});

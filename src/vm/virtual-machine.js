/**
 * VirtualMachine — the PVM's execution loop and state (Phase 11, §30.1).
 * Loads a resolved bytecode program (Phase 10's `{instructions,
 * constants, functions}` — the exact shape `BytecodeGenerator`/
 * `readBytecodeBinary` already produce, unmodified) and executes it
 * purely by walking instructions: no AST, no recursive tree evaluation
 * anywhere in this class or in `instruction-dispatcher.js` — `step()` is
 * the entire "interpreter loop," and it only ever looks at
 * `this.instructions[this.ip]`.
 *
 * Mirrors `Interpreter`'s own top-level shape deliberately (constructor
 * signature `(filePath, io)`, a `run()` that catches `ParithiRuntimeError`
 * and re-throws it with a call-stack trace attached, a catch-all that
 * never lets a raw JS error escape unformatted — §18's `P023`) so the two
 * backends present identically to the CLI layer, even though their
 * internals (AST visitor vs. instruction dispatch) are completely
 * different.
 */

import { ParithiRuntimeError, SourceLocation } from '../errors/index.js';
import { readLineSync } from '../interpreter/stdin.js';
import { OperandStack } from './stack.js';
import { Memory } from './memory.js';
import { displayFunctionName } from './frame.js';
import { OPCODE_HANDLERS } from './instruction-dispatcher.js';
import { invalidOpcode, invalidJump, invalidConstant } from './vm-errors.js';

export class VirtualMachine {
  constructor(program, filePath = '<bytecode>', io = {}) {
    this.instructions = program.instructions;
    this.constants = program.constants;
    this.functions = program.functions;
    this.functionsByName = new Map(program.functions.map((fn) => [fn.name, fn]));
    this.filePath = filePath;
    this.io = {
      write: io.write ?? ((text) => process.stdout.write(text)),
      writeLine: io.writeLine ?? ((text) => console.log(text)),
      readLine: io.readLine ?? readLineSync,
    };

    this.memory = new Memory();
    this.stack = new OperandStack();
    this.currentFrame = this.memory.globalFrame;
    this.callDepth = 0; // O(1) overflow check — see instruction-dispatcher.js's MAX_CALL_DEPTH

    this.ip = 0;
    this.halted = false;
    this.exitCode = null;
    this.state = 'idle'; // 'idle' | 'running' | 'error' — mirrors ExecutionContext.state, for a future --vm-runtime (debugger.js)
  }

  /** Runs to completion (HALT) or throws a ParithiRuntimeError. Returns the program's exit code. */
  run() {
    this.state = 'running';
    try {
      while (!this.halted) {
        this.step();
      }
      this.state = 'idle';
      return this.exitCode;
    } catch (error) {
      this.state = 'error';
      if (error instanceof ParithiRuntimeError) {
        throw error; // already fully formed by vm-errors.js/instruction-dispatcher.js, callStack included
      }
      // Never let a raw JS error (a VM bug) reach the user unformatted — same
      // P023 catch-all Interpreter.run() uses (§18), including that
      // fallback's own choice to pass `null` for location rather than
      // trust introspection during failure: whatever corrupted state
      // caused a raw error in the first place (most plausibly
      // `this.instructions`/`this.ip`) is exactly what currentLocation()
      // itself would need to read, and could throw a second time. The
      // call-stack trace is safe to still compute — it only walks
      // `currentFrame.callerFrame`, untouched by that same corruption.
      let callStack = [];
      try {
        callStack = this.describeCallStack();
      } catch {
        // Even the frame chain was unreadable — fall back to an empty trace rather than a second raw throw.
      }
      throw new ParithiRuntimeError(
        'P023',
        `Unexpected VM failure: ${error?.message ?? error?.constructor?.name ?? 'unknown error'}.`,
        null,
        callStack,
        'this may indicate a bug in the virtual machine itself — please report it with the program that triggered it.',
      );
    }
  }

  /** Executes exactly one instruction, advancing `ip` (a jump/call/return handler may set it to something other than ip+1). */
  step() {
    if (this.ip < 0 || this.ip >= this.instructions.length) {
      throw invalidJump(this.currentLocation(), this.describeCallStack(), this.ip);
    }

    const instruction = this.instructions[this.ip];
    const handler = OPCODE_HANDLERS[instruction.opcode];
    if (!handler) {
      throw invalidOpcode(this.currentLocation(), this.describeCallStack(), instruction.opcode);
    }

    const nextIp = handler(this, instruction);
    this.ip = nextIp === undefined ? this.ip + 1 : nextIp;
  }

  /** The constant pool value at `index` — bounds-checked defensively (§30.8: never trust bytecode was Validator-checked). */
  constantAt(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.constants.size) {
      throw invalidConstant(this.currentLocation(), this.describeCallStack(), index);
    }
    return this.constants.get(index).value;
  }

  /** The source position of the currently-executing instruction, for error reporting — mirrors Interpreter.locationOf(). */
  currentLocation() {
    const instruction = this.instructions[this.ip];
    return new SourceLocation(this.filePath, instruction?.line ?? null, instruction?.column ?? null);
  }

  /**
   * Innermost-first call-stack trace, derived by walking `currentFrame`'s
   * `callerFrame` chain — mirrors `CallStack.describe()`'s exact output
   * shape (§17.3), with the Bytecode Generator's mangling suffix
   * stripped so a trace reads "fact(...)" rather than "fact$0(...)".
   */
  describeCallStack() {
    const lines = [];
    let frame = this.currentFrame;
    while (frame && frame !== this.memory.globalFrame) {
      lines.push(`${displayFunctionName(frame.functionName)}(...) — called at ${frame.callLocation.toString()}`);
      frame = frame.callerFrame;
    }
    return lines;
  }
}

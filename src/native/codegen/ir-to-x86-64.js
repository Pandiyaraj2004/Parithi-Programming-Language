/**
 * IR → x86-64 — the code generator itself, consuming the (optimized) IR
 * (`src/native/ir/`) instead of walking the AST directly (per the
 * IR-optimizer brief's §7: "Modify the existing code generator so it
 * consumes the optimized IR instead of directly consuming the AST").
 *
 * Only ever called on IR generated from a program that has ALREADY
 * passed `native-codegen.js`'s own AST-level "is this within the
 * currently-native-compilable subset" gate — literals, variables,
 * arithmetic, and comparisons only, never `and`/`or`/`if`/`while`/
 * `task`/arrays/calls (see that file's own class doc). Every value this
 * emitter ever needs is therefore GUARANTEED to be reducible to a single
 * compile-time constant by the IR Optimizer's existing Constant Folding
 * + Constant Propagation passes (built for Phase 13's IR work — nothing
 * new was added to the optimizer itself for this) — so `$main` is always
 * exactly one basic block, and every `PRINT`'s operand always resolves
 * to a known value by the time it's walked here. This function does not
 * re-derive the Stage-1 guarantee itself; if a value is ever found to
 * NOT resolve (which should be structurally impossible), that is treated
 * as an internal Parithi bug (a plain `Error`, not `NativeCompileError`)
 * rather than silently emitting wrong machine code — see the two
 * `throw new Error(...)` calls below.
 *
 * As the native backend grows further (branches, loops, calls, arrays —
 * all of which the IR already models, per ir-nodes.js, but which need
 * REAL runtime control flow/memory, not just constant folding), this is
 * the file that grows to emit real x86-64 for them.
 */

import { IrOp } from '../ir/ir-nodes.js';
import { NativeCompileError } from '../errors.js';
import {
  Reg, movRegImm64, movRegImm32, movRegReg, leaRegRspDisp8,
  movRspDisp8Imm32, callIndirectReg, subRspImm8,
} from './x86-64-encoder.js';

/**
 * A value that reaches here still unresolved almost always means a
 * division/modulo whose divisor only turns out to be zero after constant
 * PROPAGATION through a variable (e.g. `hold z = 0` then `10 / z`) — the
 * Stage-1 AST gate (native-codegen.js) only catches a *literal* zero
 * divisor cheaply; it does not re-implement the IR Optimizer's own
 * propagation to catch every such case ahead of time. Reported as a clean
 * P030, exactly like any other native-unsupported construct — never a raw
 * crash — since this is a real, reachable native limitation, not (only) an
 * internal bug.
 */
function unresolvedConstant(detail) {
  return new NativeCompileError({
    feature: 'an expression that could not be constant-folded',
    reason: `${detail} — this is usually a division/modulo whose divisor only resolves to zero after tracing through a variable, which the native backend cannot safely bake into an executable.`,
    location: null,
    suggestion: 'use "pari --run-bytecode"/"pari <file.pr>" (Interpreter/PVM) for full-language support.',
  });
}

const STACK_FRAME_SIZE = 0x38; // 56 bytes — see native-codegen.js's own class doc for the full stack-frame layout rationale
const STD_OUTPUT_HANDLE = 0xfffffff5; // -11 as an unsigned 32-bit value (Win32's STD_OUTPUT_HANDLE)
const KERNEL32 = 'KERNEL32.DLL';

/** Matches Interpreter's own `stringify()` (src/interpreter/stringify.js) exactly, for the value kinds native can produce (String/Number/Decimal/Boolean/Empty — never Array, which Stage 1 already rejects). */
function stringifyConstant({ value, valueType }) {
  if (valueType === 'Empty') return 'empty';
  if (valueType === 'Boolean') return value ? 'true' : 'false';
  return String(value);
}

/** Resolves any operand (`const`, `temp`, or `var`) to its known `{value, valueType}`, or `undefined` if not (yet) known — the one lookup every case below shares. */
function resolveConstantOperand(operand, knownTemps, knownVars) {
  if (operand.kind === 'const') return { value: operand.value, valueType: operand.valueType };
  if (operand.kind === 'temp') return knownTemps.get(operand.id);
  if (operand.kind === 'var') return knownVars.get(operand.name);
  return undefined;
}

/**
 * Walks `$main`'s one block, tracking every `CONST`/`COPY` temp and every
 * `STORE`d variable's resolved compile-time value as it goes (in program
 * order — a later `STORE` to the same variable correctly overwrites the
 * tracked value, exactly matching real "last assignment wins" semantics),
 * and extracting the exact printed text for each `PRINT`, space-joining
 * multi-argument `say`s (matching Interpreter.visitPrintStatement — see
 * ir-generator.js's compilePrintStatement). Arithmetic/comparison
 * instructions (ADD/SUB/EQ/...) are deliberately NOT handled here — by
 * the time this runs, the IR Optimizer has already folded every one of
 * them (built from only literals/variables per Stage 1) into a `CONST`,
 * so there is nothing left for this function to compute itself.
 */
function extractPrintedLines(irProgram, filePath) {
  const mainFn = irProgram.functions[0];
  const knownTemps = new Map();
  const knownVars = new Map();
  const lines = [];

  for (const block of mainFn.blocks) {
    for (const instr of block.instructions) {
      if (instr.op === IrOp.CONST && instr.dest?.kind === 'temp') {
        knownTemps.set(instr.dest.id, { value: instr.args[0].value, valueType: instr.args[0].valueType });
        continue;
      }
      if (instr.op === IrOp.COPY && instr.dest?.kind === 'temp') {
        const resolved = resolveConstantOperand(instr.args[0], knownTemps, knownVars);
        if (resolved) knownTemps.set(instr.dest.id, resolved);
        continue;
      }
      if (instr.op === IrOp.STORE) {
        const [targetVar, valueOperand] = instr.args;
        const resolved = resolveConstantOperand(valueOperand, knownTemps, knownVars);
        if (!resolved) {
          throw unresolvedConstant(`"${targetVar.name}" was assigned a value that never resolved to a compile-time constant, in ${filePath}`);
        }
        knownVars.set(targetVar.name, resolved);
        continue;
      }
      if (instr.op === IrOp.PRINT) {
        const parts = instr.args.map((arg) => {
          const resolved = resolveConstantOperand(arg, knownTemps, knownVars);
          if (!resolved) {
            throw unresolvedConstant(`a "say" argument never resolved to a compile-time constant, in ${filePath}`);
          }
          return stringifyConstant(resolved);
        });
        lines.push(parts.join(' '));
      }
    }
  }
  return lines;
}

/**
 * @param {import('../ir/ir-nodes.js').IRProgram} irProgram - already-optimized IR, guaranteed by the caller to be within the emittable subset (see class doc)
 * @param {string} [filePath] - for the internal-bug error messages above only
 * @returns {{ textBytes: Buffer, textFixups: Array, imports: Array, stringConstants: Buffer[], asmListing: Array<{offset: number, bytes: Buffer, text: string}> }}
 */
export function emitX86FromIR(irProgram, filePath = '<source>') {
  const lines = extractPrintedLines(irProgram, filePath);
  const stringConstants = lines.map((line) => Buffer.from(`${line}\n`, 'utf8'));
  const imports = [{ dll: KERNEL32, functions: ['GetStdHandle', 'WriteFile', 'ExitProcess'] }];

  const instructions = [];
  const fixups = [];
  const asmListing = [];
  let offset = 0;
  /** `text` is a human-readable mnemonic for `--asm` output only — it documents what `buf` encodes, it does not drive codegen (the encoder functions already fully determined `buf`). */
  function emit(buf, text) {
    asmListing.push({ offset, bytes: buf, text });
    instructions.push(buf);
    offset += buf.length;
  }
  /** Emits `mov reg, imm64` with a placeholder 0, recording a fixup for the immediate's 8 bytes (which start 2 bytes into the instruction — REX + opcode). */
  function emitAbsoluteAddressLoad(reg, fixupWithoutOffset, regName) {
    const target = fixupWithoutOffset.kind === 'iat' ? `&IAT[${fixupWithoutOffset.function}]` : `&string[${fixupWithoutOffset.stringIndex}]`;
    emit(movRegImm64(reg, 0n), `mov ${regName}, ${target}`);
    fixups.push({ ...fixupWithoutOffset, offset: offset - 8 });
  }

  emit(subRspImm8(STACK_FRAME_SIZE), `sub rsp, 0x${STACK_FRAME_SIZE.toString(16)}`);

  // hConsole = GetStdHandle(STD_OUTPUT_HANDLE)
  emit(movRegImm32(Reg.RCX, STD_OUTPUT_HANDLE), 'mov ecx, STD_OUTPUT_HANDLE');
  emitAbsoluteAddressLoad(Reg.RAX, { kind: 'iat', dll: KERNEL32, function: 'GetStdHandle' }, 'rax');
  emit(callIndirectReg(Reg.RAX), 'call [rax]                  ; GetStdHandle');
  emit(movRegReg(Reg.RSI, Reg.RAX), 'mov rsi, rax                 ; save console handle (callee-saved)');

  lines.forEach((line, i) => {
    const byteLength = stringConstants[i].length;

    emit(movRegReg(Reg.RCX, Reg.RSI), 'mov rcx, rsi                 ; arg1 hFile');
    emitAbsoluteAddressLoad(Reg.RDX, { kind: 'string', stringIndex: i }, 'rdx');
    emit(movRegImm32(Reg.R8, byteLength), `mov r8d, ${byteLength}                 ; arg3 nNumberOfBytesToWrite`);
    emit(leaRegRspDisp8(Reg.R9, 40), 'lea r9, [rsp+40]             ; arg4 &lpNumberOfBytesWritten');
    emit(movRspDisp8Imm32(32, 0), 'mov qword [rsp+32], 0        ; arg5 lpOverlapped = NULL');
    emitAbsoluteAddressLoad(Reg.RAX, { kind: 'iat', dll: KERNEL32, function: 'WriteFile' }, 'rax');
    emit(callIndirectReg(Reg.RAX), `call [rax]                  ; WriteFile("${line}")`);
  });

  // ExitProcess(0) — a Parithi program that runs to completion without an
  // explicit "stop" always exits 0 (matching Interpreter/PVM — §15.7).
  // This call never returns, so no epilogue (add rsp; ret) is reachable —
  // deliberately omitted rather than dead code after a call that cannot fall through.
  emit(movRegImm32(Reg.RCX, 0), 'mov ecx, 0                   ; arg1 exit code');
  emitAbsoluteAddressLoad(Reg.RAX, { kind: 'iat', dll: KERNEL32, function: 'ExitProcess' }, 'rax');
  emit(callIndirectReg(Reg.RAX), 'call [rax]                  ; ExitProcess');

  return {
    textBytes: Buffer.concat(instructions),
    textFixups: fixups,
    imports,
    stringConstants,
    asmListing,
  };
}

/**
 * IR → x86-64 — the code generator itself, now consuming the (optimized)
 * IR (`src/native/ir/`) instead of walking the AST directly (per the
 * IR-optimizer brief's §7: "Modify the existing code generator so it
 * consumes the optimized IR instead of directly consuming the AST").
 *
 * Only ever called on IR generated from a program that has ALREADY
 * passed `native-codegen.js`'s own AST-level "is this within the
 * currently-native-compilable subset" gate (`say` with String literal
 * arguments only — see that file's own class doc) — so by construction,
 * every IR this function ever receives is exactly one function (`$main`)
 * with exactly one basic block, containing only `CONST` (String) and
 * `PRINT` instructions, ending in `RETURN empty`. This function does not
 * re-derive that guarantee itself (it's cheap to check, and `native-
 * codegen.js` already produces a precise, tested diagnostic naming the
 * exact unsupported AST construct — duplicating that here in terms of IR
 * shapes would only produce a second, less specific error for the same
 * problem). As the native backend grows to cover more of the IR's own
 * feature set (variables, arithmetic, branches, calls — all of which the
 * IR already models, per ir-nodes.js), this is the file that grows to
 * emit real x86-64 for them.
 */

import { IrOp } from '../ir/ir-nodes.js';
import {
  Reg, movRegImm64, movRegImm32, movRegReg, leaRegRspDisp8,
  movRspDisp8Imm32, callIndirectReg, subRspImm8,
} from './x86-64-encoder.js';

const STACK_FRAME_SIZE = 0x38; // 56 bytes — see native-codegen.js's own class doc for the full stack-frame layout rationale
const STD_OUTPUT_HANDLE = 0xfffffff5; // -11 as an unsigned 32-bit value (Win32's STD_OUTPUT_HANDLE)
const KERNEL32 = 'KERNEL32.DLL';

/** Resolves a PRINT argument operand to its literal string value — a `const` directly, or a `temp` whose single defining `CONST` is earlier in this same block (temps never cross blocks — see ir-generator.js's own class doc; the exact same resolution shape every IR optimizer pass already uses). */
function resolveStringOperand(operand, knownConstants) {
  if (operand.kind === 'const') return String(operand.value);
  if (operand.kind === 'temp' && knownConstants.has(operand.id)) return String(knownConstants.get(operand.id).value);
  return undefined;
}

/** Walks `$main`'s one block, extracting the exact printed text for each PRINT instruction, space-joining multi-argument `say`s (matching Interpreter.visitPrintStatement — see ir-generator.js's compilePrintStatement). */
function extractPrintedLines(irProgram) {
  const mainFn = irProgram.functions[0];
  const knownConstants = new Map();
  const lines = [];

  for (const block of mainFn.blocks) {
    for (const instr of block.instructions) {
      if (instr.op === IrOp.CONST && instr.dest?.kind === 'temp') {
        knownConstants.set(instr.dest.id, instr.args[0]);
        continue;
      }
      if (instr.op === IrOp.PRINT) {
        lines.push(instr.args.map((arg) => resolveStringOperand(arg, knownConstants)).join(' '));
      }
    }
  }
  return lines;
}

/**
 * @param {import('../ir/ir-nodes.js').IRProgram} irProgram - already-optimized IR, guaranteed by the caller to be within the emittable subset (see class doc)
 * @returns {{ textBytes: Buffer, textFixups: Array, imports: Array, stringConstants: Buffer[], asmListing: Array<{offset: number, bytes: Buffer, text: string}> }}
 */
export function emitX86FromIR(irProgram) {
  const lines = extractPrintedLines(irProgram);
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

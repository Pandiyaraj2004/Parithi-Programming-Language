/**
 * Native codegen — Phase 13. Translates a validated Parithi `Program` AST
 * node into x86-64 machine code + PE import/fixup metadata, ready for
 * `src/native/pe/pe-writer.js`.
 *
 * SUPPORTED SUBSET (intentionally small — §7 of the Phase 13 brief: "do
 * NOT attempt to compile every feature immediately"): a sequence of
 * top-level `say` statements, each with one or more String literal
 * arguments (space-joined, matching `Interpreter.visitPrintStatement`
 * exactly — see interpreter.js:222-224). Nothing else yet. Any other
 * top-level statement, or a `say` argument that isn't a plain String
 * literal, raises `NativeCompileError` (P030) — never a silently wrong
 * `.exe`. This will grow (variables, arithmetic, control flow, functions)
 * as dedicated tests are added for each, per the brief's own rule:
 * "only mark a feature as native-supported after it has dedicated tests."
 *
 * WINDOWS X64 CALLING CONVENTION (used throughout, not invented — Microsoft's
 * documented "x64 calling convention"):
 *   - Integer/pointer arguments 1-4 in RCX, RDX, R8, R9; arguments 5+ on the
 *     stack at [rsp+32], [rsp+40], ...
 *   - Caller reserves 32 bytes of "shadow space" at [rsp+0..31] before
 *     every call, regardless of actual argument count (the callee may use
 *     it to spill register arguments — required by convention even when
 *     unused).
 *   - RSP must be 16-byte aligned immediately before every `call`.
 *   - RAX holds the return value.
 *   - RBX, RBP, RDI, RSI, R12-R15 are callee-saved (non-volatile) — a
 *     called function must leave them unchanged; used here to carry the
 *     console handle across the WriteFile call setup, which otherwise
 *     clobbers RCX/RDX/R8/R9/RAX.
 *
 * STACK FRAME for the program's single entry-point "function": the OS
 * transfers control here exactly as if via a `call` (so RSP ≡ 8 (mod 16)
 * at entry, the standard convention for any x64 entry point — see
 * `sub rsp, 0x38` below: 0x38 = 56 ≡ 8 (mod 16), so RSP ≡ 8-56 ≡ 0 (mod 16)
 * afterward, exactly satisfying the "aligned before `call`" rule for
 * every call this function makes). Layout of that 56-byte frame:
 *   [rsp+0..31]  shadow space (unused by us directly, reserved per convention)
 *   [rsp+32..39] the 5th argument slot, when calling a 5-argument function (WriteFile's lpOverlapped)
 *   [rsp+40..47] scratch qword for WriteFile's lpNumberOfBytesWritten out-parameter
 *   [rsp+48..55] padding (unused; keeps the frame size ≡ 8 mod 16, see above)
 */

import { NodeType } from '../../ast/ast-nodes.js';
import { NativeCompileError } from '../errors.js';
import { SourceLocation } from '../../errors/index.js';
import {
  Reg, movRegImm64, movRegImm32, movRegReg, leaRegRspDisp8,
  movRspDisp8Imm32, callIndirectReg, subRspImm8,
} from './x86-64-encoder.js';

const STACK_FRAME_SIZE = 0x38; // 56 bytes — see class doc
const STD_OUTPUT_HANDLE = 0xfffffff5; // -11 as an unsigned 32-bit value (Win32's STD_OUTPUT_HANDLE)
const KERNEL32 = 'KERNEL32.DLL';

function locationOf(filePath, node) {
  return new SourceLocation(filePath, node.line, node.column);
}

/** Validates one top-level statement is within the supported subset, returning its printable text — or throws NativeCompileError. */
function extractSayText(node, filePath) {
  if (node.type !== NodeType.PRINT_STATEMENT) {
    throw new NativeCompileError({
      feature: node.type,
      reason: 'the native backend currently only compiles "say" statements with String literal arguments.',
      location: locationOf(filePath, node),
      suggestion: 'use "pari --run-bytecode"/"pari <file.pr>" (Interpreter/PVM) for full-language support, or simplify this program for --native.',
    });
  }
  return node.arguments
    .map((arg) => {
      if (arg.type !== NodeType.LITERAL || arg.valueType !== 'String') {
        throw new NativeCompileError({
          feature: `say with a ${arg.type === NodeType.LITERAL ? arg.valueType : arg.type} argument`,
          reason: 'the native backend can currently only print String literals, not variables, expressions, or other value types.',
          location: locationOf(filePath, arg),
          suggestion: 'use only double-quoted string literals in "say" for --native, e.g. say "Hello, Parithi!".',
        });
      }
      return arg.value;
    })
    .join(' ');
}

/**
 * @param {object} program - the parsed + semantically-analyzed `Program` AST node
 * @param {string} filePath - for diagnostic locations
 * @returns {{
 *   textBytes: Buffer, textFixups: Array, imports: Array, stringConstants: Buffer[],
 *   ir: string[],           // `pari --native --ir` — one line per native IR "operation" this program compiled to
 *   asmListing: Array<{offset: number, bytes: Buffer, text: string}>,  // `pari --native --asm` — one entry per emitted instruction
 * }}
 */
export function compileProgramToNative(program, filePath) {
  const lines = program.body.map((node) => extractSayText(node, filePath));
  const ir = [...lines.map((line) => `Say(${JSON.stringify(line)})`), 'Exit(0)'];

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
    ir,
    asmListing,
  };
}

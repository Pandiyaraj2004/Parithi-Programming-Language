/**
 * x86-64 instruction encoder — Phase 13 native backend (§?? native-ir /
 * x86-64 backend). Hand-encodes the small, fixed set of instructions the
 * native codegen actually needs, as documented byte-for-byte against the
 * Intel 64 and IA-32 Architectures Software Developer's Manual's
 * instruction encoding tables. No assembler or external tool is available
 * on this machine (verified: no gcc/clang/nasm/MSVC/MinGW/LLVM) — every
 * byte emitted here is produced by this file, not by a real assembler.
 *
 * Deliberately NOT a general-purpose x86-64 assembler: only the specific
 * register/addressing-mode combinations the codegen actually emits are
 * implemented, each documented with its exact encoding. Extend this file
 * (adding a new documented encoder function) rather than generalizing an
 * existing one speculatively — every function here must stay easy to
 * verify by hand against the manual.
 *
 * REGISTER ENCODING (Table 3-1 / one-byte opcode register field):
 *   RAX=0 RCX=1 RDX=2 RBX=3 RSP=4 RBP=5 RSI=6 RDI=7
 *   R8=8  R9=9  R10=10 R11=11 R12=12 R13=13 R14=14 R15=15
 * Registers 8-15 require a REX prefix with the appropriate extension bit
 * set (REX.B for an opcode-embedded or ModRM.rm register, REX.R for a
 * ModRM.reg register) — the low 3 bits go in the instruction as normal;
 * the 4th bit comes from REX.
 */

export const Reg = Object.freeze({
  RAX: 0, RCX: 1, RDX: 2, RBX: 3, RSP: 4, RBP: 5, RSI: 6, RDI: 7,
  R8: 8, R9: 9, R10: 10, R11: 11, R12: 12, R13: 13, R14: 14, R15: 15,
});

/** REX prefix byte: 0100WRXB. W=64-bit operand size, R/X/B extend ModRM.reg/SIB.index/ModRM.rm (or an opcode-embedded register) to 4 bits. */
function rex({ w = false, r = false, x = false, b = false }) {
  return 0x40 | (w ? 0x08 : 0) | (r ? 0x04 : 0) | (x ? 0x02 : 0) | (b ? 0x01 : 0);
}

function isExtended(reg) {
  return reg >= 8;
}

/**
 * `mov r64, imm64` — REX.W + (B8+rd) + imm64 (little-endian).
 * Manual: MOV r64, imm64 — opcode B8+rd io, REX.W required for the 64-bit
 * immediate form. Used for every absolute address we embed (IAT slot
 * addresses, string data addresses) since the image loads at a fixed,
 * non-relocated base (§ PE writer: no IMAGE_DLLCHARACTERISTICS_DYNAMIC_BASE),
 * making every such address a link-time constant.
 */
export function movRegImm64(reg, value /* BigInt */) {
  const buf = Buffer.alloc(2 + 8);
  buf[0] = rex({ w: true, b: isExtended(reg) });
  buf[1] = 0xb8 | (reg & 7);
  buf.writeBigUInt64LE(BigInt.asUintN(64, value), 2);
  return buf;
}

/** `mov r32, imm32` — (REX.B if needed) + (B8+rd) + imm32. Zero-extends into the full 64-bit register (documented x86-64 behavior for 32-bit operand-size writes). */
export function movRegImm32(reg, value) {
  const needsRex = isExtended(reg);
  const buf = Buffer.alloc((needsRex ? 1 : 0) + 1 + 4);
  let i = 0;
  if (needsRex) buf[i++] = rex({ b: true });
  buf[i++] = 0xb8 | (reg & 7);
  buf.writeUInt32LE(value >>> 0, i);
  return buf;
}

/** `mov r64, r64` (register-to-register) — REX.W + 0x89 /r. ModRM.reg = src, ModRM.rm = dst (opcode 0x89 is MOV r/m, r). */
export function movRegReg(dst, src) {
  const modrm = 0xc0 | ((src & 7) << 3) | (dst & 7);
  return Buffer.from([rex({ w: true, r: isExtended(src), b: isExtended(dst) }), 0x89, modrm]);
}

/**
 * `lea r64, [rsp+disp8]` — REX.W + 0x8D /r, ModRM mod=01 reg=dst rm=100(SIB
 * required for RSP-as-base), SIB=0x24 (scale=00, index=100=none, base=100=RSP), disp8.
 * Used to compute the address of a stack-local scratch slot (e.g. WriteFile's
 * `lpNumberOfBytesWritten` out-parameter) to pass in a register.
 */
export function leaRegRspDisp8(dst, disp8) {
  const modrm = 0x44 | ((dst & 7) << 3); // mod=01, reg=dst, rm=100
  return Buffer.from([rex({ w: true, r: isExtended(dst) }), 0x8d, modrm, 0x24, disp8 & 0xff]);
}

/**
 * `mov qword [rsp+disp8], imm32` — REX.W + 0xC7 /0, ModRM mod=01 reg=000
 * rm=100(SIB), SIB=0x24, disp8, imm32 (sign-extended to 64 bits by the CPU).
 * Used to zero a stack argument slot (e.g. WriteFile's unused `lpOverlapped`).
 */
export function movRspDisp8Imm32(disp8, imm32) {
  const buf = Buffer.alloc(1 + 1 + 1 + 1 + 1 + 4); // REX, opcode, ModRM, SIB, disp8, imm32
  buf[0] = rex({ w: true });
  buf[1] = 0xc7;
  buf[2] = 0x44; // mod=01, reg=000(/0), rm=100
  buf[3] = 0x24; // SIB: base=RSP
  buf[4] = disp8 & 0xff;
  buf.writeInt32LE(imm32 | 0, 5);
  return buf;
}

/**
 * `call [reg]` (near indirect call through a register holding a memory
 * address, no displacement) — opcode 0xFF /2, ModRM mod=00 reg=010 rm=reg.
 * This is how every imported Windows API function is invoked: `reg` holds
 * the absolute address of that function's IAT slot, and the CPU reads the
 * *actual* function pointer (patched in by the Windows loader at process
 * start) from that memory location before transferring control — i.e. this
 * is "call through a pointer to a pointer," matching how every real PE
 * import call works (this is exactly what `FF 15 disp32` — call [rip+disp]
 * — also does; this is the same idea via an absolute address in a register
 * instead of a RIP-relative displacement, chosen because it needs no
 * relocation entries at all).
 */
export function callIndirectReg(reg) {
  const modrm = 0x10 | (reg & 7); // mod=00, reg=010(call opcode ext), rm=reg
  const needsRex = isExtended(reg);
  const buf = Buffer.alloc((needsRex ? 1 : 0) + 2);
  let i = 0;
  if (needsRex) buf[i++] = rex({ b: true });
  buf[i++] = 0xff;
  buf[i] = modrm;
  return buf;
}

/** `sub rsp, imm8` — REX.W + 0x83 /5, ModRM=0xEC (mod=11 reg=101(/5=SUB) rm=100=RSP), imm8. */
export function subRspImm8(imm8) {
  return Buffer.from([rex({ w: true }), 0x83, 0xec, imm8 & 0xff]);
}

/** `add rsp, imm8` — REX.W + 0x83 /0, ModRM=0xC4 (mod=11 reg=000(/0=ADD) rm=100=RSP), imm8. */
export function addRspImm8(imm8) {
  return Buffer.from([rex({ w: true }), 0x83, 0xc4, imm8 & 0xff]);
}

/** `ret` (near return, no operand) — single-byte opcode 0xC3. */
export function ret() {
  return Buffer.from([0xc3]);
}

export function concatInstructions(instructions) {
  return Buffer.concat(instructions);
}

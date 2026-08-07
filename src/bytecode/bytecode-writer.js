/**
 * Bytecode writers (Phase 10, §29.7) — two independent serializations of
 * the same resolved program (`{ instructions, constants, functions }`,
 * BytecodeGenerator's output):
 *
 *   - `formatBytecodeText()` — the human-readable listing `pari --bytecode`
 *     prints. Operands are shown resolved (a constant's actual value, a
 *     jump's actual target index) rather than as raw indices, since the
 *     entire point of this format is to be read by a person.
 *   - `writeBytecodeBinary()` / `readBytecodeBinary()` — the actual `.pbc`
 *     file format `pari --compile` produces. `readBytecodeBinary()` exists
 *     so this phase can verify the format round-trips exactly (tested in
 *     tests/bytecode.test.js) — it is NOT the Parithi Virtual Machine
 *     (§23 item 2, explicitly future work): reading the structure back is
 *     not executing it.
 *
 * ## `.pbc` binary layout
 *
 * All integers are unsigned 32-bit little-endian unless stated otherwise.
 *
 * ```
 * magic            4 bytes, ASCII "PBC1"
 * version          uint32              (format version — currently 1)
 * constantCount    uint32
 * constants[]      constantCount ×:
 *                     typeTag   uint8   (index into CONSTANT_TYPE_LIST)
 *                     payload           (by type — see below)
 * functionCount    uint32
 * functions[]      functionCount ×:
 *                     nameLen   uint32; name        nameLen bytes (UTF-8)
 *                     paramCount uint32
 *                     params[]  paramCount ×: (paramLen uint32; param paramLen bytes UTF-8)
 *                     entryIndex uint32
 *                     isNested  uint8   (0 or 1)
 * instructionCount uint32
 * instructions[]   instructionCount ×:
 *                     opcodeId  uint8   (index into OPCODE_LIST)
 *                     line      uint32  (source line; 0 means "none" — see below)
 *                     column    uint32  (source column; 0 means "none")
 *                     operands[] — count is OPCODE_INFO[opcode].operands.length,
 *                                  each operand a uint32
 * ```
 *
 * Constant payloads by type tag:
 *   Number/Decimal → 8-byte float64 LE (Parithi's Number/Decimal are both
 *     backed by a JS double — §12.2 — so one payload shape covers both;
 *     the preceding type tag is what keeps them distinct values)
 *   String → uint32 byte length, then that many UTF-8 bytes
 *   Boolean → 1 byte, 0 or 1
 *   Empty → no payload (the type tag alone is the whole value)
 *
 * `line`/`column` (format version 2 — a genuine bugfix over version 1,
 * not a routine revision: version 1 dropped every instruction's source
 * position entirely, so a runtime error raised from a loaded `.pbc` file
 * reported `file:null:null` instead of a real position, even though the
 * identical program run via `--run-bytecode <file.pr>`, Phase 11's
 * in-memory path, reported the correct one — the exact "Runtime Errors
 * match" discrepancy Phase 11's own Validation section exists to catch,
 * caught by that section's own parity tests). 0 encodes "no position"
 * (real Parithi source positions are always 1-based, so 0 is an
 * unambiguous sentinel — `Instruction`'s own default is `null`, exactly
 * what a 0 decodes back to).
 */

import { Opcode, OPCODE_LIST, OPCODE_ID, OPCODE_INFO } from './opcode.js';
import { ConstantType, CONSTANT_TYPE_LIST, CONSTANT_TYPE_ID, ConstantPool } from './constant-pool.js';
import { Instruction } from './instruction.js';

// ---------------------------------------------------------------------
// Text format
// ---------------------------------------------------------------------

function formatConstant(entry) {
  if (entry.type === ConstantType.STRING) return `${entry.type} ${JSON.stringify(entry.value)}`;
  if (entry.type === ConstantType.EMPTY) return `${entry.type}`;
  return `${entry.type} ${entry.value}`;
}

// LOAD/STORE's only operand, and CALL's first operand, are always a name
// (never a literal value the reader would need PUSH's Number/Decimal/etc.
// disambiguation for) — shown as a bare quoted string rather than the
// fuller "String ..." form PUSH's operand gets, since the opcode alone
// already says "this is a name."
const NAME_OPERAND_OPCODES = new Set([Opcode.LOAD, Opcode.STORE, Opcode.CALL]);

function formatOperand(kind, value, constants, { isName = false } = {}) {
  if (kind === 'const') {
    const entry = constants.get(value);
    return isName ? JSON.stringify(entry.value) : formatConstant(entry);
  }
  return String(value); // 'target' (instruction index) and 'count' render as plain integers
}

function formatInstruction(instruction, index, constants) {
  const { operands: kinds } = OPCODE_INFO[instruction.opcode];
  const isNameOpcode = NAME_OPERAND_OPCODES.has(instruction.opcode);
  const rendered = instruction.operands.map((value, i) =>
    formatOperand(kinds[i], value, constants, { isName: isNameOpcode && i === 0 }),
  );
  const position = String(index).padStart(4, '0');
  const line = rendered.length > 0 ? `${instruction.opcode} ${rendered.join(', ')}` : instruction.opcode;
  return `${position}  ${line}`;
}

export function formatBytecodeText(program, { title = 'Bytecode' } = {}) {
  const { instructions, constants, functions } = program;
  const lines = [title, '-'.repeat(72)];

  lines.push(`Constants (${constants.size}):`);
  if (constants.size === 0) {
    lines.push('  (none)');
  } else {
    [...constants].forEach((entry, i) => lines.push(`  [${i}] ${formatConstant(entry)}`));
  }
  lines.push('');

  lines.push(`Functions (${functions.length}):`);
  if (functions.length === 0) {
    lines.push('  (none)');
  } else {
    for (const fn of functions) {
      lines.push(`  ${fn.name}(${fn.paramSlots.join(', ')}) -> entry #${fn.entryIndex}${fn.isNested ? ' [nested]' : ''}`);
    }
  }
  lines.push('');

  lines.push(`Instructions (${instructions.length}):`);
  instructions.forEach((instruction, i) => lines.push(formatInstruction(instruction, i, constants)));

  return lines.join('\n');
}

// ---------------------------------------------------------------------
// Binary format
// ---------------------------------------------------------------------

const MAGIC = 'PBC1';
const FORMAT_VERSION = 2; // v2 adds per-instruction line/column — see the class doc's format-version-2 note

class ByteWriter {
  constructor() {
    this.chunks = [];
  }

  bytes(buffer) {
    this.chunks.push(buffer);
    return this;
  }

  uint8(value) {
    return this.bytes(Buffer.from([value]));
  }

  uint32(value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value, 0);
    return this.bytes(buf);
  }

  float64(value) {
    const buf = Buffer.alloc(8);
    buf.writeDoubleLE(value, 0);
    return this.bytes(buf);
  }

  utf8String(value) {
    const encoded = Buffer.from(value, 'utf-8');
    return this.uint32(encoded.length).bytes(encoded);
  }

  toBuffer() {
    return Buffer.concat(this.chunks);
  }
}

class ByteReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.pos = 0;
  }

  bytes(length) {
    const slice = this.buffer.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  uint8() {
    return this.bytes(1).readUInt8(0);
  }

  uint32() {
    return this.bytes(4).readUInt32LE(0);
  }

  float64() {
    return this.bytes(8).readDoubleLE(0);
  }

  utf8String() {
    const length = this.uint32();
    return this.bytes(length).toString('utf-8');
  }
}

function writeConstant(writer, entry) {
  writer.uint8(CONSTANT_TYPE_ID[entry.type]);
  switch (entry.type) {
    case ConstantType.NUMBER:
    case ConstantType.DECIMAL:
      writer.float64(entry.value);
      return;
    case ConstantType.STRING:
      writer.utf8String(entry.value);
      return;
    case ConstantType.BOOLEAN:
      writer.uint8(entry.value ? 1 : 0);
      return;
    case ConstantType.EMPTY:
      return; // no payload
    default:
      throw new Error(`writeBytecodeBinary: unknown constant type "${entry.type}".`);
  }
}

function readConstant(reader) {
  const type = CONSTANT_TYPE_LIST[reader.uint8()];
  switch (type) {
    case ConstantType.NUMBER:
    case ConstantType.DECIMAL:
      return { type, value: reader.float64() };
    case ConstantType.STRING:
      return { type, value: reader.utf8String() };
    case ConstantType.BOOLEAN:
      return { type, value: reader.uint8() !== 0 };
    case ConstantType.EMPTY:
      return { type, value: null };
    default:
      throw new Error(`readBytecodeBinary: unknown constant type tag.`);
  }
}

export function writeBytecodeBinary(program) {
  const { instructions, constants, functions } = program;
  const writer = new ByteWriter();

  writer.bytes(Buffer.from(MAGIC, 'ascii'));
  writer.uint32(FORMAT_VERSION);

  writer.uint32(constants.size);
  for (const entry of constants) writeConstant(writer, entry);

  writer.uint32(functions.length);
  for (const fn of functions) {
    writer.utf8String(fn.name);
    writer.uint32(fn.paramSlots.length);
    for (const param of fn.paramSlots) writer.utf8String(param);
    writer.uint32(fn.entryIndex);
    writer.uint8(fn.isNested ? 1 : 0);
  }

  writer.uint32(instructions.length);
  for (const instruction of instructions) {
    writer.uint8(OPCODE_ID[instruction.opcode]);
    writer.uint32(instruction.line ?? 0); // 0 = "none" — see the class doc's format-version-2 note
    writer.uint32(instruction.column ?? 0);
    for (const operand of instruction.operands) writer.uint32(operand);
  }

  return writer.toBuffer();
}

export function readBytecodeBinary(buffer) {
  const reader = new ByteReader(buffer);

  const magic = reader.bytes(4).toString('ascii');
  if (magic !== MAGIC) {
    throw new Error(`readBytecodeBinary: not a Parithi Bytecode file (expected magic "${MAGIC}", got "${magic}").`);
  }
  const version = reader.uint32();
  if (version !== FORMAT_VERSION) {
    throw new Error(`readBytecodeBinary: unsupported .pbc format version ${version} (expected ${FORMAT_VERSION}).`);
  }

  const constants = new ConstantPool();
  const constantCount = reader.uint32();
  for (let i = 0; i < constantCount; i++) {
    const { type, value } = readConstant(reader);
    constants.add(type, value);
  }

  const functionCount = reader.uint32();
  const functions = [];
  for (let i = 0; i < functionCount; i++) {
    const name = reader.utf8String();
    const paramCount = reader.uint32();
    const paramSlots = Array.from({ length: paramCount }, () => reader.utf8String());
    const entryIndex = reader.uint32();
    const isNested = reader.uint8() !== 0;
    functions.push({ name, paramSlots, entryIndex, isNested });
  }

  const instructionCount = reader.uint32();
  const instructions = [];
  for (let i = 0; i < instructionCount; i++) {
    const opcode = OPCODE_LIST[reader.uint8()];
    const line = reader.uint32() || null; // 0 decodes back to "none" — see the class doc's format-version-2 note
    const column = reader.uint32() || null;
    const operandCount = OPCODE_INFO[opcode].operands.length;
    const operands = Array.from({ length: operandCount }, () => reader.uint32());
    instructions.push(new Instruction(opcode, operands, line, column));
  }

  return { instructions, constants, functions };
}

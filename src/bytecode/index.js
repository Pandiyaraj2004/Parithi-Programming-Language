/**
 * Barrel export for the bytecode module (Phase 10, §29) — the rest of the
 * codebase (commands.js) imports from "bytecode/index.js" rather than
 * reaching into individual files, matching the errors/ module's convention.
 */

export { Opcode, OPCODE_INFO, OPCODE_LIST, OPCODE_ID, stackEffectOf } from './opcode.js';
export { ConstantType, CONSTANT_TYPE_LIST, CONSTANT_TYPE_ID, ConstantPool } from './constant-pool.js';
export { Instruction } from './instruction.js';
export { Label } from './label.js';
export { BytecodeBuilder } from './bytecode-builder.js';
export { BytecodeGenerator, generateBytecode } from './bytecode-generator.js';
export { validateBytecode } from './validator.js';
export { formatBytecodeText, writeBytecodeBinary, readBytecodeBinary } from './bytecode-writer.js';

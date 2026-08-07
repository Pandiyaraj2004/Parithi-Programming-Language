/**
 * Barrel export for the PVM module (Phase 11, §30) — the rest of the
 * codebase (commands.js) imports from "vm/index.js" rather than reaching
 * into individual files, matching the errors/ and bytecode/ modules'
 * convention.
 */

export { VirtualMachine } from './virtual-machine.js';
export { Frame, displayFunctionName } from './frame.js';
export { OperandStack } from './stack.js';
export { Heap } from './heap.js';
export { Memory } from './memory.js';
export { loadFromFile, compileFromSource } from './loader.js';
export { Debugger } from './debugger.js';
export { MAX_CALL_DEPTH } from './instruction-dispatcher.js';

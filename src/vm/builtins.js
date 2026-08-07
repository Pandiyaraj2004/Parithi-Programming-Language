/**
 * VM built-in access point (Phase 11, §30.6).
 * Deliberately a thin re-export, not a reimplementation: `callBuiltin()`
 * and `isBuiltinName()` are the Interpreter's own built-in dispatch
 * (`src/interpreter/builtins/index.js`, unmodified — the Bytecode
 * Generator already reuses the exact same names as its `CALL` targets,
 * §29.2), so calling straight through to them is what guarantees the PVM
 * computes byte-for-byte the same result, and raises the exact same
 * error code/message/hint, as the Interpreter for every built-in call —
 * there is no second implementation anywhere to drift out of sync.
 */

export { callBuiltin, isBuiltinName } from '../interpreter/builtins/index.js';

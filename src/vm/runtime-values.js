/**
 * VM runtime-value access point (Phase 11, §30.6) — the same "thin
 * re-export, not a reimplementation" pattern as `builtins.js`.
 *
 * `wrap()`/`deepEquals()` are the Runtime System's own (unmodified —
 * `src/runtime/runtime-value.js`); reusing them directly is what
 * guarantees `EQ`/`NE` perform the exact same deep/structural comparison
 * as `Interpreter.visitBinaryExpression` (§28.3), and that a value's
 * reported type name (for error messages) matches `type()`/every
 * defensive built-in check exactly (§17.4). `stringify()` is the
 * Interpreter's own canonical value-to-text renderer
 * (`src/interpreter/stringify.js`), reused so `PRINT` renders arrays,
 * booleans, and `empty` identically to `say` (§16.2).
 */

export { wrap, deepEquals } from '../runtime/runtime-value.js';
export { stringify } from '../interpreter/stringify.js';

import { wrap } from '../runtime/runtime-value.js';

/** The value's Parithi type name ("Number", "Array", ...) — for VM error messages, exactly like every defensive builtin already reports it. */
export function typeNameOf(value) {
  return wrap(value).type;
}

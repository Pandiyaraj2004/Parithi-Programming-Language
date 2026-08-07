/**
 * NativeCompileError — Phase 13 (native backend). A thin, purpose-specific
 * wrapper over the existing `CompilerError` (errors/compiler-error.js) —
 * not a parallel error framework — so a native-compilation failure prints
 * with the exact same "Error P0xx: ... → file:line:col ... Hint: ..."
 * shape every other Parithi diagnostic already uses (§18), and so it's
 * automatically covered by `printError()`'s existing "anything with a
 * .format() method" handling in src/utils/messages.js.
 *
 * Every unsupported-feature diagnostic must go through this class — never
 * a bare JS Error/throw — so "produce a clear diagnostic, never silently
 * miscompile" (the native backend's most important safety rule) is
 * structurally enforced, not just a convention someone could forget.
 */

import { CompilerError } from '../errors/index.js';

export class NativeCompileError extends CompilerError {
  /**
   * @param {object} options
   * @param {string} options.feature - human-readable name of the unsupported construct, e.g. "while loop", "task with more than 4 parameters"
   * @param {string} options.reason - why the x86-64 backend can't (yet) compile it
   * @param {import('../errors/index.js').SourceLocation|null} [options.location]
   * @param {string|null} [options.suggestion] - an alternative, if one exists (e.g. "use --compile/--run-bytecode instead")
   * @param {string} [options.code] - defaults to P030; only ever overridden for a future, more specific native error code
   */
  constructor({ feature, reason, location = null, suggestion = null, code = 'P030' }) {
    super(code, `Feature "${feature}" is not currently supported by the native (x86-64) backend: ${reason}`, location, suggestion);
    this.name = 'NativeCompileError';
    this.feature = feature;
    this.reason = reason;
  }
}

/**
 * Internal control-flow signals — not user-facing errors. break/continue/
 * return unwind through nested block execution the same way a JS exception
 * would, which is the standard, well-established technique for this in a
 * tree-walking interpreter (a goto-free host language has no other way to
 * jump out of arbitrarily nested statement execution). Deliberately plain
 * classes, not Error subclasses — there's no message or stack trace to
 * carry, just a control signal and (for return) a value.
 */

/** `value` is null for a bare "break" — §36 (Unified Loop Model): the value a "loop"/"while"/"repeat" evaluates to when used as an expression. */
export class BreakSignal {
  constructor(value = null) {
    this.value = value;
  }
}

export class ContinueSignal {}

export class ReturnSignal {
  constructor(value) {
    this.value = value;
  }
}

/**
 * StopSignal (§15.7) — unlike Break/Continue/Return, this is never caught by
 * any loop or function; it unwinds all the way to Interpreter.run(), which
 * treats it as a clean, deliberate program termination (not an error) and
 * exposes its exit code for the CLI to use as the process's exit code.
 */
export class StopSignal {
  constructor(exitCode) {
    this.exitCode = exitCode;
  }
}

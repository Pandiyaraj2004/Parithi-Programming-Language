/**
 * Frame — one call's local-variable storage (Phase 11, §30.3).
 *
 * Two DIFFERENT "parent" relationships exist here, deliberately tracked
 * separately, because they answer two different questions:
 *
 *   - `lexicalParent` — "where do I look up a name I don't have locally?"
 *     Fixed to the global frame for a top-level task; for a task NESTED
 *     inside another task's body, it's whichever frame was current at
 *     the moment THIS call was made (§29.2/§30.3) — since Parithi has no
 *     first-class function values (a task can only ever be called from
 *     within its own lexical visibility), "whoever is calling a nested
 *     task" is always necessarily an active invocation of its immediately
 *     enclosing task, so this dynamic rule reproduces exactly the same
 *     answer real lexical closures would give, with no closure object
 *     needed.
 *   - `callerFrame` (+ `returnIP`) — "who do I hand control back to, and
 *     where, once RETURN runs?" Always simply whoever was current when
 *     CALL was issued — ordinary call-stack semantics, independent of
 *     whether the callee happens to be nested or top-level. A top-level
 *     helper task called from inside another top-level task's body is
 *     the case where these two differ: its `lexicalParent` is the global
 *     frame (fixed), but its `callerFrame` is that other task's frame
 *     (whoever actually called it).
 *
 * `load`/`store` walk `lexicalParent` only — never `callerFrame`, which
 * `VirtualMachine`'s own call/return handling uses directly instead.
 *
 * `store`'s "walk up, and only if not found anywhere, define locally"
 * rule is what makes ONE opcode (`STORE`) correctly serve both a fresh
 * `hold`/`const` declaration and a later reassignment, without the
 * bytecode needing to distinguish them: Bytecode Generator slot-mangles
 * every declaration to a name that is globally unique (§29.2), so a
 * fresh declaration's name can never already exist in any frame — the
 * walk always (and only) falls through to local definition for those —
 * while a reassignment's `STORE` targets the exact same mangled name the
 * original declaration's `STORE` used, so the walk finds and updates it
 * in place, in whichever frame actually declared it (which may be an
 * ancestor frame, e.g. a nested task reassigning its enclosing task's
 * variable).
 */

export class Frame {
  constructor(functionName, lexicalParent, callerFrame, returnIP, callLocation = null) {
    this.functionName = functionName; // mangled name ("fact$0"), or "<global>" — display-stripped by displayFunctionName()
    this.lexicalParent = lexicalParent;
    this.callerFrame = callerFrame;
    this.returnIP = returnIP;
    this.callLocation = callLocation; // where the CALL that created this frame was issued — null for the global frame
    this.locals = new Map();
  }

  has(name) {
    let frame = this;
    while (frame) {
      if (frame.locals.has(name)) return true;
      frame = frame.lexicalParent;
    }
    return false;
  }

  load(name) {
    let frame = this;
    while (frame) {
      if (frame.locals.has(name)) return frame.locals.get(name);
      frame = frame.lexicalParent;
    }
    return undefined; // caller (the LOAD handler) turns this into a VM error — see vm-errors.js's slotNotFound
  }

  store(name, value) {
    let frame = this;
    while (frame) {
      if (frame.locals.has(name)) {
        frame.locals.set(name, value);
        return;
      }
      frame = frame.lexicalParent;
    }
    this.locals.set(name, value); // never found anywhere => a fresh declaration — define in THIS (innermost) frame
  }

  /** Directly defines in THIS frame — used only for binding a task's own parameters at CALL time (never ambiguous with reassignment). */
  bind(name, value) {
    this.locals.set(name, value);
  }
}

/** Strips a Bytecode Generator slot-mangling suffix ("fact$0" -> "fact") for user-facing display — see BytecodeGenerator.mangle(), §29.2. */
export function displayFunctionName(mangledName) {
  return mangledName.replace(/\$\d+$/, '');
}

/**
 * Static type system — Phase 3 (MASTER_DOCUMENT.md §14.4).
 *
 * Number and Decimal are mutually compatible ("Numeric"); String, Boolean,
 * and Empty must match exactly. This resolves a real tension in the spec:
 * "/" and number() can't have a single statically-knowable Number-vs-Decimal
 * result without evaluating runtime values, so the two are interchangeable
 * for compatibility purposes while still reported distinctly for display.
 *
 * UNKNOWN is a pseudo-type for function parameters, which have no type
 * annotation syntax in Parithi's grammar (§14.4 addendum) — it is
 * compatible with everything so using a parameter never produces a
 * spurious type error.
 */

export const DataType = Object.freeze({
  NUMBER: 'Number',
  DECIMAL: 'Decimal',
  STRING: 'String',
  BOOLEAN: 'Boolean',
  EMPTY: 'Empty',
  UNKNOWN: 'Unknown',
  ARRAY: 'Array',
});

const NUMERIC = new Set([DataType.NUMBER, DataType.DECIMAL]);

export function isNumeric(type) {
  return NUMERIC.has(type);
}

/**
 * True if `a` and `b` may appear together in an assignment, comparison, or
 * argument-passing context without a type error. EMPTY (a variable whose
 * type hasn't locked in yet) and UNKNOWN (a parameter) are always
 * compatible with anything — there's nothing concrete yet to conflict with.
 */
export function typesCompatible(a, b) {
  if (a === DataType.UNKNOWN || b === DataType.UNKNOWN) return true;
  if (a === DataType.EMPTY || b === DataType.EMPTY) return true;
  if (isNumeric(a) && isNumeric(b)) return true;
  return a === b;
}

/**
 * Built-in function signatures (MASTER_DOCUMENT.md §16.3). Argument-type
 * validation per built-in lives in TypeChecker.checkBuiltinCall — kept as
 * a plain switch there rather than generalized here, since there are only
 * six built-ins and each has a distinct, simple rule.
 *
 * `validCounts`, when present, restricts arg counts to that exact set
 * instead of the continuous [minArgs, maxArgs] range — needed for
 * `random()`, whose two documented forms are 0 args or 2 args (§16.3), with
 * no 1-arg form. Without this, `random(5)` would pass count-checking (it
 * falls inside 0..2) and only fail confusingly at runtime when the missing
 * second argument turned out to be undefined.
 */
export const BUILTIN_SIGNATURES = Object.freeze({
  round: { minArgs: 1, maxArgs: 2, returnType: (argCount) => (argCount === 2 ? DataType.DECIMAL : DataType.NUMBER) },
  random: {
    minArgs: 0,
    maxArgs: 2,
    validCounts: [0, 2],
    returnType: (argCount) => (argCount === 2 ? DataType.NUMBER : DataType.DECIMAL),
  },
  number: { minArgs: 1, maxArgs: 1, returnType: () => DataType.NUMBER },
  text: { minArgs: 1, maxArgs: 1, returnType: () => DataType.STRING },
  type: { minArgs: 1, maxArgs: 1, returnType: () => DataType.STRING },
  // len() accepts either a String or an Array (§Arrays) — checked specially
  // in TypeChecker.checkBuiltinCall rather than the generic single-type rule.
  len: { minArgs: 1, maxArgs: 1, returnType: () => DataType.NUMBER },
  // Array built-ins (Phase 9, §Arrays). pop()/remove() return the removed
  // element, whose type isn't tracked per-array by the static type system
  // (Array is a flat, non-parameterized type — see §Arrays) — Unknown,
  // exactly like a function parameter, so it never produces a spurious
  // downstream type error.
  push: { minArgs: 2, maxArgs: 2, returnType: () => DataType.ARRAY },
  pop: { minArgs: 1, maxArgs: 1, returnType: () => DataType.UNKNOWN },
  insert: { minArgs: 3, maxArgs: 3, returnType: () => DataType.ARRAY },
  remove: { minArgs: 2, maxArgs: 2, returnType: () => DataType.UNKNOWN },
  sort: { minArgs: 1, maxArgs: 1, returnType: () => DataType.ARRAY },
  reverse: { minArgs: 1, maxArgs: 1, returnType: () => DataType.ARRAY },
  contains: { minArgs: 2, maxArgs: 2, returnType: () => DataType.BOOLEAN },
});

export function isBuiltinName(name) {
  return Object.prototype.hasOwnProperty.call(BUILTIN_SIGNATURES, name);
}

/** True if `count` is an acceptable argument count for `signature`. */
export function isValidArgCount(signature, count) {
  if (signature.validCounts) return signature.validCounts.includes(count);
  return count >= signature.minArgs && count <= signature.maxArgs;
}

/** Human-readable description of the accepted argument counts, for error messages. */
export function describeArgCount(signature) {
  if (signature.validCounts) return signature.validCounts.join(' or ');
  return signature.minArgs === signature.maxArgs ? `${signature.minArgs}` : `${signature.minArgs}-${signature.maxArgs}`;
}

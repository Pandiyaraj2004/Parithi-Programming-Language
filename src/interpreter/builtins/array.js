/**
 * Array built-ins — push(), pop(), insert(), remove(), sort(), reverse(),
 * contains() (Phase 9, §Arrays). Also exports the shared validation
 * helpers Interpreter.js uses directly for array-literal construction and
 * index read/write (visitArrayLiteral/visitArrayAccess/visitArrayAssignment),
 * so every array-mutating path — a built-in call or a bare "arr[i] = x" —
 * enforces the exact same rules through one place.
 *
 * Every check here is defensive, exactly like round()/number()/len() in
 * math.js/type.js/text.js: Semantic Analysis catches what it statically
 * can (TypeChecker.inferArrayLiteral/inferArrayAccess), but an Unknown-typed
 * value (a function parameter, most commonly) can only ever be validated
 * once its actual runtime value exists — which is here.
 */

import { ParithiRuntimeError } from '../../errors/index.js';
import { wrap, deepEquals } from '../../runtime/runtime-value.js';
import { DataType, typesCompatible } from '../../semantic/types.js';

export function assertArray(value, context, location) {
  if (!Array.isArray(value)) {
    throw new ParithiRuntimeError(
      'P002',
      `"${context}" expects an Array argument, got ${wrap(value).type}.`,
      location,
      [],
      `"${context}" only accepts an Array (created with "box(...)").`,
    );
  }
}

/**
 * Used by Interpreter.visitArrayAccess/visitArrayAssignment — a defensive
 * counterpart of TypeChecker.inferArrayAccess's P025 check, needed because
 * an Unknown-typed target (almost always a function parameter) can't be
 * validated until its actual runtime value exists. Deliberately a
 * different code/message from assertArray() above: that one is for a
 * *built-in call's* argument ("push() expects an Array"), this one is for
 * "[...]" indexing itself ("cannot index a non-array") — the same
 * distinction the Semantic Analyzer already draws between P002 and P025.
 */
export function assertIndexable(value, location) {
  if (!Array.isArray(value)) {
    throw new ParithiRuntimeError(
      'P025',
      `Cannot index into ${wrap(value).type} — only an array (created with "box(...)") can be indexed with "[...]".`,
      location,
      [],
      'only a value created with "box(...)" can be indexed — check that this expression is really an array.',
    );
  }
}

/**
 * Resolves and validates an index for reading/writing/inserting into
 * `array`. Numeric-but-non-integer indices are truncated toward zero,
 * mirroring "stop <expr>"'s own documented Decimal-truncation rule
 * (§15.7) rather than inventing a second convention for the same idea.
 *
 * `allowLength` widens the valid range to include `array.length` itself
 * (an "insert at the very end" position, equivalent to push) — used only
 * by insert(); every other caller (read, write, remove) requires a
 * genuinely existing element, so the top end is `array.length - 1`.
 */
export function resolveIndex(array, rawIndex, context, location, { allowLength = false } = {}) {
  if (typeof rawIndex !== 'number') {
    throw new ParithiRuntimeError(
      'P002',
      `"${context}" index must be numeric, got ${wrap(rawIndex).type}.`,
      location,
      [],
      'use a Number/Decimal expression for the index.',
    );
  }

  const index = Math.trunc(rawIndex);

  if (index < 0) {
    throw new ParithiRuntimeError(
      'P027',
      `Array index cannot be negative (got ${index}).`,
      location,
      [],
      'array indices start at 0 — use a non-negative index.',
    );
  }

  const limit = allowLength ? array.length : array.length - 1;
  if (index > limit) {
    throw new ParithiRuntimeError(
      'P024',
      `Index ${index} is out of range for an array of length ${array.length}.`,
      location,
      [],
      limit < 0 ? 'this array is empty — there is no valid index yet.' : `valid indices for this array are 0 to ${limit}.`,
    );
  }

  return index;
}

/** First non-"empty" element's type, or null if every element so far is empty (or the array is empty). */
function establishedElementType(elements) {
  for (const element of elements) {
    const type = wrap(element).type;
    if (type !== DataType.EMPTY) return type;
  }
  return null;
}

/**
 * Enforces §Arrays' "every element must share the same type, except empty"
 * rule when adding ONE new value to an array that may already have
 * elements (push/insert/index-assignment). "empty" never conflicts with
 * anything, in either direction — matching how a `hold`-declared variable's
 * type stays open until its first non-empty assignment (§14.4).
 */
export function checkElementType(array, newValue, location) {
  const newType = wrap(newValue).type;
  if (newType === DataType.EMPTY) return;

  const established = establishedElementType(array);
  if (established && !typesCompatible(established, newType)) {
    throw new ParithiRuntimeError(
      'P026',
      `Cannot add ${newType} to an array of ${established} — array elements must share the same type.`,
      location,
      [],
      'every element in an array must be the same type (Number/Decimal count as the same type) — use a separate array for different types.',
    );
  }
}

/**
 * Same rule, applied to a freshly-built list of elements all at once
 * (box(...) literal construction) rather than one value against an
 * existing array — used by Interpreter.visitArrayLiteral as the defensive
 * runtime counterpart of TypeChecker.inferArrayLiteral's static check.
 */
export function validateHomogeneousElements(elements, location) {
  let established = null;
  for (const element of elements) {
    const type = wrap(element).type;
    if (type === DataType.EMPTY) continue;
    if (established === null) {
      established = type;
      continue;
    }
    if (!typesCompatible(established, type)) {
      throw new ParithiRuntimeError(
        'P026',
        `Array elements must share the same type — found ${established} and ${type} in the same "box(...)".`,
        location,
        [],
        'every element in an array must be the same type (Number/Decimal count as the same type) — use number(...)/text(...) to convert a mismatched value first, or use separate arrays.',
      );
    }
  }
}

export function push(args, location) {
  const [array, item] = args;
  assertArray(array, 'push()', location);
  checkElementType(array, item, location);
  array.push(item);
  return array;
}

export function pop(args, location) {
  const [array] = args;
  assertArray(array, 'pop()', location);
  if (array.length === 0) {
    throw new ParithiRuntimeError(
      'P024',
      'Cannot pop from an empty array.',
      location,
      [],
      'check "len(arr)" is greater than 0 before calling "pop()".',
    );
  }
  return array.pop();
}

export function insert(args, location) {
  const [array, rawIndex, item] = args;
  assertArray(array, 'insert()', location);
  const index = resolveIndex(array, rawIndex, 'insert()', location, { allowLength: true });
  checkElementType(array, item, location);
  array.splice(index, 0, item);
  return array;
}

export function remove(args, location) {
  const [array, rawIndex] = args;
  assertArray(array, 'remove()', location);
  const index = resolveIndex(array, rawIndex, 'remove()', location);
  return array.splice(index, 1)[0];
}

function compareElements(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return a - b; // Number/Decimal — plain numeric comparison
}

export function sort(args, location) {
  const [array] = args;
  assertArray(array, 'sort()', location);
  array.sort(compareElements);
  return array;
}

export function reverse(args, location) {
  const [array] = args;
  assertArray(array, 'reverse()', location);
  array.reverse();
  return array;
}

export function contains(args, location) {
  const [array, item] = args;
  assertArray(array, 'contains()', location);
  return array.some((element) => deepEquals(element, item));
}

/**
 * Standard Library — String (Phase 13, §32). Additive to the Phase 6/9
 * len() built-in (interpreter/builtins/text.js), which is left completely
 * untouched.
 *
 * `contains()`/`indexOf()` are deliberately NOT defined here — the spec
 * asks for both a String and an Array meaning under the same name (like
 * len() already does for String/Array), so the one polymorphic
 * implementation of each lives in stdlib/array/index.js (which already
 * owned the Array-only `contains()` since Phase 9) and dispatches to the
 * String helpers exported below for a String first argument. Registering
 * two functions under one name is not possible (the registry is a flat
 * name → implementation map), so there must be exactly one owner per name.
 */

import { ParithiRuntimeError } from '../../errors/index.js';
import { wrap } from '../../runtime/runtime-value.js';

function assertString(value, context, location) {
  if (typeof value !== 'string') {
    throw new ParithiRuntimeError(
      'P002',
      `"${context}" expects a String argument, got ${wrap(value).type}.`,
      location,
      [],
      `"${context}" only accepts a String argument.`,
    );
  }
}

/** Unicode-safe character array — splits on code points, not UTF-16 code units, so surrogate pairs stay intact. */
function chars(text) {
  return Array.from(text);
}

export function upper(args, location) {
  const [text] = args;
  assertString(text, 'upper()', location);
  return text.toUpperCase();
}

export function lower(args, location) {
  const [text] = args;
  assertString(text, 'lower()', location);
  return text.toLowerCase();
}

export function trim(args, location) {
  const [text] = args;
  assertString(text, 'trim()', location);
  return text.trim();
}

export function split(args, location) {
  const [text, separator] = args;
  assertString(text, 'split()', location);
  assertString(separator, 'split()', location);
  return separator === '' ? chars(text) : text.split(separator);
}

/** Joins an Array of Strings with `separator` — every element must already be a String (§32.2). */
export function join(args, location) {
  const [array, separator] = args;
  if (!Array.isArray(array)) {
    throw new ParithiRuntimeError(
      'P002',
      `"join()" expects an Array argument, got ${wrap(array).type}.`,
      location,
      [],
      '"join()" only accepts an Array (created with "box(...)").',
    );
  }
  assertString(separator, 'join()', location);
  array.forEach((element, i) => {
    if (typeof element !== 'string') {
      throw new ParithiRuntimeError(
        'P002',
        `"join()" expects every element to be a String, but element ${i} is ${wrap(element).type}.`,
        location,
        [],
        'convert every element to text first with "text(...)", or build the array from Strings only.',
      );
    }
  });
  return array.join(separator);
}

/** Replaces every occurrence of `search` with `replacement` (§32.2 — "replace" means replace-all, matching Python's str.replace). */
export function replace(args, location) {
  const [text, search, replacement] = args;
  assertString(text, 'replace()', location);
  assertString(search, 'replace()', location);
  assertString(replacement, 'replace()', location);
  if (search === '') return text;
  return text.split(search).join(replacement);
}

export function startsWith(args, location) {
  const [text, prefix] = args;
  assertString(text, 'startsWith()', location);
  assertString(prefix, 'startsWith()', location);
  return text.startsWith(prefix);
}

export function endsWith(args, location) {
  const [text, suffix] = args;
  assertString(text, 'endsWith()', location);
  assertString(suffix, 'endsWith()', location);
  return text.endsWith(suffix);
}

/** `substring(text, start)` or `substring(text, start, end)` — end exclusive, JS-slice style. */
export function substring(args, location) {
  const [text, rawStart, rawEnd] = args;
  assertString(text, 'substring()', location);
  if (typeof rawStart !== 'number') {
    throw new ParithiRuntimeError(
      'P002',
      `"substring()" expects a numeric start index, got ${wrap(rawStart).type}.`,
      location,
      [],
      '"substring()" only accepts Number/Decimal indices.',
    );
  }
  const length = chars(text).length;
  const end = rawEnd === undefined ? length : rawEnd;
  if (typeof end !== 'number') {
    throw new ParithiRuntimeError(
      'P002',
      `"substring()" expects a numeric end index, got ${wrap(end).type}.`,
      location,
      [],
      '"substring()" only accepts Number/Decimal indices.',
    );
  }
  const start = Math.trunc(rawStart);
  const stop = Math.trunc(end);
  if (start < 0 || stop > length || start > stop) {
    throw new ParithiRuntimeError(
      'P029',
      `"substring()" range [${start}, ${stop}) is out of range for a String of length ${length}.`,
      location,
      [],
      `valid range is 0 to ${length}, with start <= end.`,
    );
  }
  return chars(text).slice(start, stop).join('');
}

/** String-only lastIndexOf — Array has no documented "search from the end" built-in (§32.2). */
export function lastIndexOf(args, location) {
  const [text, target] = args;
  assertString(text, 'lastIndexOf()', location);
  assertString(target, 'lastIndexOf()', location);
  return text.lastIndexOf(target);
}

export function repeatText(args, location) {
  const [text, count] = args;
  assertString(text, 'repeatText()', location);
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new ParithiRuntimeError(
      'P002',
      `"repeatText()" expects a non-negative whole-number count, got ${wrap(count).type === 'Number' || wrap(count).type === 'Decimal' ? count : wrap(count).type}.`,
      location,
      [],
      '"repeatText()" only accepts a non-negative integer count.',
    );
  }
  return text.repeat(count);
}

export function reverseText(args, location) {
  const [text] = args;
  assertString(text, 'reverseText()', location);
  return chars(text).reverse().join('');
}

/** Used by stdlib/array's polymorphic contains()/indexOf() for a String first argument. */
export function stringContains(text, target) {
  return text.includes(target);
}

export function stringIndexOf(text, target) {
  return text.indexOf(target);
}

/**
 * Converts a runtime Parithi value to its display text. One canonical
 * "how do we render a value" function, shared by `say`, the `ask()` prompt
 * display, and the text() built-in — so all three always agree. Array
 * rendering itself (bracketed, with quoted string elements) is defined
 * once in runtime-value.js, next to the ListValue class it also serves —
 * imported here rather than duplicated.
 */

import { stringifyArray } from '../runtime/runtime-value.js';

export function stringify(value) {
  if (value === null) return 'empty';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return stringifyArray(value);
  return String(value);
}

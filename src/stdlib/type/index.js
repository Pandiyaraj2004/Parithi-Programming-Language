/**
 * Standard Library — Type (Phase 13, §32). Additive to the Phase 6
 * number()/text()/type() built-ins in interpreter/builtins/type.js, which
 * are left completely untouched.
 */

import { ParithiRuntimeError } from '../../errors/index.js';
import { wrap } from '../../runtime/runtime-value.js';

const TRUE_STRINGS = new Set(['true']);
const FALSE_STRINGS = new Set(['false']);

/** Converts a value to Boolean: Boolean unchanged; "true"/"false" (any case) for String; nonzero/zero for Number/Decimal; empty is always false. */
export function booleanBuiltin(args, location) {
  const [value] = args;
  const type = wrap(value).type;

  if (type === 'Boolean') return value;
  if (type === 'Empty') return false;
  if (type === 'Number' || type === 'Decimal') return value !== 0;
  if (type === 'String') {
    const normalized = value.trim().toLowerCase();
    if (TRUE_STRINGS.has(normalized)) return true;
    if (FALSE_STRINGS.has(normalized)) return false;
    throw new ParithiRuntimeError(
      'P006',
      `Cannot convert "${value}" to a boolean.`,
      location,
      [],
      'only the text "true" or "false" (any letter case) can convert to a boolean.',
    );
  }

  throw new ParithiRuntimeError(
    'P002',
    `"boolean()" cannot convert ${type} to a boolean.`,
    location,
    [],
    '"boolean()" only accepts a Boolean, String ("true"/"false"), Number/Decimal, or empty.',
  );
}

export function isNumber(args) {
  const [value] = args;
  const type = wrap(value).type;
  return type === 'Number' || type === 'Decimal';
}

export function isText(args) {
  const [value] = args;
  return wrap(value).type === 'String';
}

export function isBoolean(args) {
  const [value] = args;
  return wrap(value).type === 'Boolean';
}

/** Polymorphic (§32.4/§32.3): an Array is "empty" when it has no elements; anything else is "empty" only if its type actually is Empty. */
export function isEmpty(args) {
  const [value] = args;
  if (Array.isArray(value)) return value.length === 0;
  return wrap(value).type === 'Empty';
}

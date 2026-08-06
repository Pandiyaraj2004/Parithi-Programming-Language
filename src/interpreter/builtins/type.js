/**
 * Type built-ins — number(), text(), type() (MASTER_DOCUMENT.md §16.3).
 * type()'s Number-vs-Decimal split now delegates to RuntimeValue.wrap()
 * (Phase 6) instead of repeating the Number.isInteger check locally — one
 * place decides that, matching how Environment's storage layer decides it.
 */

import { ParithiRuntimeError } from '../../errors/index.js';
import { stringify } from '../stringify.js';
import { wrap } from '../../runtime/runtime-value.js';

export function numberBuiltin(args, location) {
  const [text] = args;
  if (typeof text !== 'string') {
    throw new ParithiRuntimeError(
      'P002',
      `"number()" expects a String argument, got ${wrap(text).type}.`,
      location,
      [],
      '"number()" only accepts a String argument.',
    );
  }

  const trimmed = text.trim();
  const parsed = Number(trimmed);
  if (trimmed === '' || Number.isNaN(parsed)) {
    throw new ParithiRuntimeError(
      'P006',
      `Cannot convert "${text}" to a number.`,
      location,
      [],
      'make sure the text contains only digits (and optionally one decimal point and a leading "-").',
    );
  }
  return parsed;
}

export function textBuiltin(args) {
  const [value] = args;
  return stringify(value);
}

export function typeBuiltin(args) {
  const [value] = args;
  return wrap(value).type;
}

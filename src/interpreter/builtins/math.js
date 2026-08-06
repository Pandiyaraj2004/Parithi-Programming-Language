/**
 * Math built-ins — round(), random() (MASTER_DOCUMENT.md §16.3).
 * round()'s "half rounds away from zero" is spelled out explicitly here
 * because it's NOT what JS's native Math.round does for negative numbers
 * (Math.round(-2.5) is -2, rounding toward +Infinity, not -3).
 */

import { ParithiRuntimeError } from '../../errors/index.js';
import { wrap } from '../../runtime/runtime-value.js';

function assertNumeric(value, context, location) {
  if (typeof value !== 'number') {
    // wrap(value).type reports "Empty"/"String"/"Boolean" accurately — plain
    // `typeof` would say "object" for `empty` (null), which is a leaky,
    // confusing message (see the Phase 6 audit finding on this).
    throw new ParithiRuntimeError(
      'P002',
      `"${context}" expects a numeric argument, got ${wrap(value).type}.`,
      location,
      [],
      `"${context}" only accepts Number/Decimal arguments.`,
    );
  }
}

export function round(args, location) {
  const [value, digits] = args;
  assertNumeric(value, 'round()', location);

  if (digits === undefined) {
    return Math.sign(value) * Math.round(Math.abs(value));
  }

  assertNumeric(digits, 'round()', location);
  const factor = 10 ** digits;
  return (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
}

export function random(args, location) {
  const [min, max] = args;
  if (min === undefined) return Math.random();

  // A 1-argument call never reaches here — BuiltinRegistry.call() rejects
  // it against `validCounts: [0, 2]` (see interpreter/builtins/index.js)
  // with a clean P016 before this implementation ever runs.
  assertNumeric(min, 'random()', location);
  assertNumeric(max, 'random()', location);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

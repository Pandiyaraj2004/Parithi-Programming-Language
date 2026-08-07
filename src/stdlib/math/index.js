/**
 * Standard Library — Math (Phase 13, §32). Additive to the Phase 6
 * round()/random() built-ins in interpreter/builtins/math.js, which are
 * left completely untouched — these are new names only.
 *
 * Every function here follows the exact defensive-validation convention
 * established in interpreter/builtins/math.js: a plain `typeof` guard
 * would report `Empty` (JS `null`) as "object", so every type error goes
 * through `wrap(value).type` for an accurate, user-facing type name.
 */

import { ParithiRuntimeError } from '../../errors/index.js';
import { wrap } from '../../runtime/runtime-value.js';

function assertNumeric(value, context, location) {
  if (typeof value !== 'number') {
    throw new ParithiRuntimeError(
      'P002',
      `"${context}" expects a numeric argument, got ${wrap(value).type}.`,
      location,
      [],
      `"${context}" only accepts Number/Decimal arguments.`,
    );
  }
}

function domainError(context, detail, location) {
  throw new ParithiRuntimeError(
    'P028',
    `"${context}" is undefined for ${detail}.`,
    location,
    [],
    `check the argument's value before calling "${context}".`,
  );
}

export function sqrt(args, location) {
  const [value] = args;
  assertNumeric(value, 'sqrt()', location);
  if (value < 0) domainError('sqrt()', `negative numbers (got ${value})`, location);
  return Math.sqrt(value);
}

export function pow(args, location) {
  const [base, exponent] = args;
  assertNumeric(base, 'pow()', location);
  assertNumeric(exponent, 'pow()', location);
  return Math.pow(base, exponent);
}

export function abs(args, location) {
  const [value] = args;
  assertNumeric(value, 'abs()', location);
  return Math.abs(value);
}

export function floor(args, location) {
  const [value] = args;
  assertNumeric(value, 'floor()', location);
  return Math.floor(value);
}

export function ceil(args, location) {
  const [value] = args;
  assertNumeric(value, 'ceil()', location);
  return Math.ceil(value);
}

/** Variadic — `min(a, b, ...)`, at least two arguments (§32.1). */
export function min(args, location) {
  args.forEach((value) => assertNumeric(value, 'min()', location));
  return Math.min(...args);
}

/** Variadic — `max(a, b, ...)`, at least two arguments (§32.1). */
export function max(args, location) {
  args.forEach((value) => assertNumeric(value, 'max()', location));
  return Math.max(...args);
}

export function randomInt(args, location) {
  const [lower, upper] = args;
  assertNumeric(lower, 'randomInt()', location);
  assertNumeric(upper, 'randomInt()', location);
  if (upper < lower) {
    throw new ParithiRuntimeError(
      'P028',
      `"randomInt()" expects its second argument to be >= its first, got randomInt(${lower}, ${upper}).`,
      location,
      [],
      'swap the arguments so the first is the lower bound and the second the upper bound.',
    );
  }
  const lo = Math.ceil(lower);
  const hi = Math.floor(upper);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function sin(args, location) {
  const [value] = args;
  assertNumeric(value, 'sin()', location);
  return Math.sin(value);
}

export function cos(args, location) {
  const [value] = args;
  assertNumeric(value, 'cos()', location);
  return Math.cos(value);
}

export function tan(args, location) {
  const [value] = args;
  assertNumeric(value, 'tan()', location);
  return Math.tan(value);
}

/** Natural logarithm, matching every other mainstream language's bare `log()` (§32.1). */
export function log(args, location) {
  const [value] = args;
  assertNumeric(value, 'log()', location);
  if (value <= 0) domainError('log()', `zero or negative numbers (got ${value})`, location);
  return Math.log(value);
}

export function exp(args, location) {
  const [value] = args;
  assertNumeric(value, 'exp()', location);
  return Math.exp(value);
}

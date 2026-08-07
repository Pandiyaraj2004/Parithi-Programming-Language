/**
 * Standard Library — Array (Phase 13, §32). Additive to the Phase 9
 * push()/pop()/insert()/remove()/sort()/reverse()/contains() built-ins in
 * interpreter/builtins/array.js, which are left completely untouched.
 *
 * `contains()` and `indexOf()` are polymorphic — Array (this module's own
 * concern) or String (stdlib/string's concern) — registered under one
 * name each in interpreter/builtins/index.js, since the registry is a flat
 * name → implementation map and can only have one owner per name. The
 * dispatch lives here (rather than in stdlib/string) simply because
 * `contains()` already existed as an Array-only built-in since Phase 9;
 * `length()` doesn't need its own implementation here at all — it's
 * registered in interpreter/builtins/index.js as a second name for the
 * existing len() (String or Array), exactly like Phase 9's len() itself
 * reused one implementation for two concepts ("how long is this text" /
 * "how many elements").
 */

import { ParithiRuntimeError } from '../../errors/index.js';
import { wrap, deepEquals } from '../../runtime/runtime-value.js';
import { assertArray } from '../../interpreter/builtins/array.js';
import { stringContains, stringIndexOf } from '../string/index.js';

export function clear(args, location) {
  const [array] = args;
  assertArray(array, 'clear()', location);
  array.length = 0;
  return array;
}

export function contains(args, location) {
  const [collection, item] = args;
  if (Array.isArray(collection)) {
    return collection.some((element) => deepEquals(element, item));
  }
  if (typeof collection === 'string') {
    if (typeof item !== 'string') {
      throw new ParithiRuntimeError(
        'P002',
        `"contains()" on a String expects a String argument to search for, got ${wrap(item).type}.`,
        location,
        [],
        '"contains(text, target)" looks for one String inside another.',
      );
    }
    return stringContains(collection, item);
  }
  throw new ParithiRuntimeError(
    'P002',
    `"contains()" expects a String or Array argument, got ${wrap(collection).type}.`,
    location,
    [],
    '"contains()" only accepts a String or an Array (created with "box(...)").',
  );
}

export function indexOf(args, location) {
  const [collection, item] = args;
  if (Array.isArray(collection)) {
    return collection.findIndex((element) => deepEquals(element, item));
  }
  if (typeof collection === 'string') {
    if (typeof item !== 'string') {
      throw new ParithiRuntimeError(
        'P002',
        `"indexOf()" on a String expects a String argument to search for, got ${wrap(item).type}.`,
        location,
        [],
        '"indexOf(text, target)" looks for one String inside another.',
      );
    }
    return stringIndexOf(collection, item);
  }
  throw new ParithiRuntimeError(
    'P002',
    `"indexOf()" expects a String or Array argument, got ${wrap(collection).type}.`,
    location,
    [],
    '"indexOf()" only accepts a String or an Array (created with "box(...)").',
  );
}

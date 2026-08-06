/**
 * Text built-ins — len() (MASTER_DOCUMENT.md §16.3). Extended in Phase 9
 * (§Arrays) to also accept an Array — "the number of characters" and "the
 * number of elements" are the same concept ("how long is this collection"),
 * so one built-in serving both reuses an existing name rather than adding
 * a second ("length"/"count") for the same idea.
 */

import { ParithiRuntimeError } from '../../errors/index.js';
import { wrap } from '../../runtime/runtime-value.js';

export function len(args, location) {
  const [value] = args;
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length;
  }
  throw new ParithiRuntimeError(
    'P002',
    `"len()" expects a String or Array argument, got ${wrap(value).type}.`,
    location,
    [],
    '"len()" only accepts a String or an Array (created with "box(...)").',
  );
}

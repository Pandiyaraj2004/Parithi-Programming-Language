/**
 * Built-in function dispatch — Phase 6: now backed by a BuiltinRegistry
 * instance instead of a bare object literal, so a future built-in needs
 * exactly one `registry.register({...})` call here. `callBuiltin`/
 * `isBuiltinName` keep their exact Phase 4/5 signatures, so nothing at any
 * call site (interpreter.js) needed to change.
 *
 * `isBuiltinName` is deliberately re-exported from semantic/types.js
 * rather than re-derived here — that module is already the canonical list
 * Phase 3 validates calls against, and duplicating it would risk the two
 * drifting apart.
 */

import { round, random } from './math.js';
import { numberBuiltin, textBuiltin, typeBuiltin } from './type.js';
import { len } from './text.js';
import { push, pop, insert, remove, sort, reverse, contains } from './array.js';
import { ParithiRuntimeError } from '../../errors/index.js';
import { isBuiltinName } from '../../semantic/types.js';
import { BuiltinRegistry } from '../../runtime/builtin-registry.js';

const registry = new BuiltinRegistry();

registry.register({
  name: 'round',
  minArgs: 1,
  maxArgs: 2,
  implementation: round,
  returnType: (argCount) => (argCount === 2 ? 'Decimal' : 'Number'),
});
registry.register({
  name: 'random',
  minArgs: 0,
  maxArgs: 2,
  validCounts: [0, 2],
  implementation: random,
  returnType: (argCount) => (argCount === 2 ? 'Number' : 'Decimal'),
});
registry.register({
  name: 'number',
  minArgs: 1,
  maxArgs: 1,
  implementation: numberBuiltin,
  returnType: () => 'Number',
});
registry.register({
  name: 'text',
  minArgs: 1,
  maxArgs: 1,
  implementation: textBuiltin,
  returnType: () => 'String',
});
registry.register({
  name: 'type',
  minArgs: 1,
  maxArgs: 1,
  implementation: typeBuiltin,
  returnType: () => 'String',
});
registry.register({
  name: 'len',
  minArgs: 1,
  maxArgs: 1,
  implementation: len,
  returnType: () => 'Number',
});
registry.register({
  name: 'push',
  minArgs: 2,
  maxArgs: 2,
  implementation: push,
  returnType: () => 'Array',
});
registry.register({
  name: 'pop',
  minArgs: 1,
  maxArgs: 1,
  implementation: pop,
  returnType: () => 'Unknown',
});
registry.register({
  name: 'insert',
  minArgs: 3,
  maxArgs: 3,
  implementation: insert,
  returnType: () => 'Array',
});
registry.register({
  name: 'remove',
  minArgs: 2,
  maxArgs: 2,
  implementation: remove,
  returnType: () => 'Unknown',
});
registry.register({
  name: 'sort',
  minArgs: 1,
  maxArgs: 1,
  implementation: sort,
  returnType: () => 'Array',
});
registry.register({
  name: 'reverse',
  minArgs: 1,
  maxArgs: 1,
  implementation: reverse,
  returnType: () => 'Array',
});
registry.register({
  name: 'contains',
  minArgs: 2,
  maxArgs: 2,
  implementation: contains,
  returnType: () => 'Boolean',
});

export function callBuiltin(name, args, location) {
  if (!registry.has(name)) {
    // Defensive only — unreachable once Semantic Analysis (P015) has run.
    throw new ParithiRuntimeError(
      'P015',
      `Unknown function "${name}".`,
      location,
      [],
      'check the spelling — the built-ins are round, random, number, text, type, len, push, pop, insert, remove, sort, reverse, and contains.',
    );
  }
  return registry.call(name, args, location);
}

export { isBuiltinName };

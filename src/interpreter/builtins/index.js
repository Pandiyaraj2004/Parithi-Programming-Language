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
import { push, pop, insert, remove, sort, reverse } from './array.js';
import { ParithiRuntimeError } from '../../errors/index.js';
import { isBuiltinName } from '../../semantic/types.js';
import { BuiltinRegistry } from '../../runtime/builtin-registry.js';

// Phase 13 (§32) — Standard Library. Every import below is additive to the
// six Phase 6 + seven Phase 9 built-ins above, which are otherwise
// untouched.
import { sqrt, pow, abs, floor, ceil, min, max, randomInt, sin, cos, tan, log, exp } from '../../stdlib/math/index.js';
import {
  upper, lower, trim, split, join, replace, startsWith, endsWith,
  substring, lastIndexOf, repeatText, reverseText,
} from '../../stdlib/string/index.js';
import { clear, contains, indexOf } from '../../stdlib/array/index.js';
import { booleanBuiltin, isNumber, isText, isBoolean, isEmpty } from '../../stdlib/type/index.js';
import { sleep, version, platform, workingDirectory, programArgumentsBuiltin } from '../../stdlib/system/index.js';

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

// --- Standard Library (Phase 13, §32) — additive only. ---

// Math (§32.1)
registry.register({ name: 'sqrt', minArgs: 1, maxArgs: 1, implementation: sqrt, returnType: () => 'Decimal' });
registry.register({ name: 'pow', minArgs: 2, maxArgs: 2, implementation: pow, returnType: () => 'Decimal' });
registry.register({ name: 'abs', minArgs: 1, maxArgs: 1, implementation: abs, returnType: () => 'Number' });
registry.register({ name: 'floor', minArgs: 1, maxArgs: 1, implementation: floor, returnType: () => 'Number' });
registry.register({ name: 'ceil', minArgs: 1, maxArgs: 1, implementation: ceil, returnType: () => 'Number' });
registry.register({ name: 'min', minArgs: 2, maxArgs: Infinity, implementation: min, returnType: () => 'Number' });
registry.register({ name: 'max', minArgs: 2, maxArgs: Infinity, implementation: max, returnType: () => 'Number' });
registry.register({ name: 'randomInt', minArgs: 2, maxArgs: 2, implementation: randomInt, returnType: () => 'Number' });
registry.register({ name: 'sin', minArgs: 1, maxArgs: 1, implementation: sin, returnType: () => 'Decimal' });
registry.register({ name: 'cos', minArgs: 1, maxArgs: 1, implementation: cos, returnType: () => 'Decimal' });
registry.register({ name: 'tan', minArgs: 1, maxArgs: 1, implementation: tan, returnType: () => 'Decimal' });
registry.register({ name: 'log', minArgs: 1, maxArgs: 1, implementation: log, returnType: () => 'Decimal' });
registry.register({ name: 'exp', minArgs: 1, maxArgs: 1, implementation: exp, returnType: () => 'Decimal' });

// String (§32.2)
registry.register({ name: 'upper', minArgs: 1, maxArgs: 1, implementation: upper, returnType: () => 'String' });
registry.register({ name: 'lower', minArgs: 1, maxArgs: 1, implementation: lower, returnType: () => 'String' });
registry.register({ name: 'trim', minArgs: 1, maxArgs: 1, implementation: trim, returnType: () => 'String' });
registry.register({ name: 'split', minArgs: 2, maxArgs: 2, implementation: split, returnType: () => 'Array' });
registry.register({ name: 'join', minArgs: 2, maxArgs: 2, implementation: join, returnType: () => 'String' });
registry.register({ name: 'replace', minArgs: 3, maxArgs: 3, implementation: replace, returnType: () => 'String' });
registry.register({ name: 'startsWith', minArgs: 2, maxArgs: 2, implementation: startsWith, returnType: () => 'Boolean' });
registry.register({ name: 'endsWith', minArgs: 2, maxArgs: 2, implementation: endsWith, returnType: () => 'Boolean' });
registry.register({ name: 'substring', minArgs: 2, maxArgs: 3, implementation: substring, returnType: () => 'String' });
registry.register({ name: 'indexOf', minArgs: 2, maxArgs: 2, implementation: indexOf, returnType: () => 'Number' });
registry.register({ name: 'lastIndexOf', minArgs: 2, maxArgs: 2, implementation: lastIndexOf, returnType: () => 'Number' });
registry.register({ name: 'repeatText', minArgs: 2, maxArgs: 2, implementation: repeatText, returnType: () => 'String' });
registry.register({ name: 'reverseText', minArgs: 1, maxArgs: 1, implementation: reverseText, returnType: () => 'String' });

// Array (§32.3)
registry.register({ name: 'clear', minArgs: 1, maxArgs: 1, implementation: clear, returnType: () => 'Array' });
registry.register({ name: 'length', minArgs: 1, maxArgs: 1, implementation: len, returnType: () => 'Number' });

// Type (§32.4)
registry.register({ name: 'boolean', minArgs: 1, maxArgs: 1, implementation: booleanBuiltin, returnType: () => 'Boolean' });
registry.register({ name: 'isNumber', minArgs: 1, maxArgs: 1, implementation: isNumber, returnType: () => 'Boolean' });
registry.register({ name: 'isText', minArgs: 1, maxArgs: 1, implementation: isText, returnType: () => 'Boolean' });
registry.register({ name: 'isBoolean', minArgs: 1, maxArgs: 1, implementation: isBoolean, returnType: () => 'Boolean' });
registry.register({ name: 'isEmpty', minArgs: 1, maxArgs: 1, implementation: isEmpty, returnType: () => 'Boolean' });

// System (§32.9) — stop() intentionally omitted (see stdlib/system/index.js's class doc)
registry.register({ name: 'sleep', minArgs: 1, maxArgs: 1, implementation: sleep, returnType: () => 'Empty' });
registry.register({ name: 'version', minArgs: 0, maxArgs: 0, implementation: version, returnType: () => 'String' });
registry.register({ name: 'platform', minArgs: 0, maxArgs: 0, implementation: platform, returnType: () => 'String' });
registry.register({ name: 'workingDirectory', minArgs: 0, maxArgs: 0, implementation: workingDirectory, returnType: () => 'String' });
registry.register({ name: 'arguments', minArgs: 0, maxArgs: 0, implementation: programArgumentsBuiltin, returnType: () => 'Array' });

const BUILTIN_NAMES_HINT = [
  'round', 'random', 'number', 'text', 'type', 'len', 'push', 'pop', 'insert', 'remove', 'sort', 'reverse', 'contains',
  'sqrt', 'pow', 'abs', 'floor', 'ceil', 'min', 'max', 'randomInt', 'sin', 'cos', 'tan', 'log', 'exp',
  'upper', 'lower', 'trim', 'split', 'join', 'replace', 'startsWith', 'endsWith', 'substring', 'indexOf', 'lastIndexOf', 'repeatText', 'reverseText',
  'clear', 'length', 'boolean', 'isNumber', 'isText', 'isBoolean', 'isEmpty',
  'sleep', 'version', 'platform', 'workingDirectory', 'arguments',
].join(', ');

export function callBuiltin(name, args, location) {
  if (!registry.has(name)) {
    // Defensive only — unreachable once Semantic Analysis (P015) has run.
    throw new ParithiRuntimeError(
      'P015',
      `Unknown function "${name}".`,
      location,
      [],
      `check the spelling — the built-ins are ${BUILTIN_NAMES_HINT}.`,
    );
  }
  return registry.call(name, args, location);
}

export { isBuiltinName };

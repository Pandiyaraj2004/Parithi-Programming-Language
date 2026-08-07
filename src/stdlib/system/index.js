/**
 * Standard Library — System (Phase 13, §32.9).
 *
 * `stop()` from the original brief is deliberately NOT implemented: `stop`
 * is already a reserved keyword with its own statement grammar
 * (`stop [code]`, Phase 8, §15.7) that terminates the program immediately
 * from anywhere — adding a same-named callable function is not reachable
 * without a parser/grammar change, which this phase does not make. The
 * existing statement already covers this System Library entry; see
 * MASTER_DOCUMENT.md §32.9.
 *
 * `sleep()` blocks the calling thread for real, synchronous milliseconds
 * via `Atomics.wait` on a throwaway `SharedArrayBuffer` — unlike browser
 * main threads, Node.js does not forbid blocking `Atomics.wait` on its
 * main thread, so this needs no worker, no dependency, and no changes to
 * the (fully synchronous) Interpreter/VM execution model.
 */

import { ParithiRuntimeError } from '../../errors/index.js';
import { wrap } from '../../runtime/runtime-value.js';
import { LANGUAGE_VERSION, COMPILER_VERSION, platformInfo } from '../../cli/version-info.js';
import { getProgramArguments } from './program-args.js';

export function sleep(args, location) {
  const [milliseconds] = args;
  if (typeof milliseconds !== 'number' || milliseconds < 0) {
    throw new ParithiRuntimeError(
      'P002',
      `"sleep()" expects a non-negative numeric argument, got ${wrap(milliseconds).type}.`,
      location,
      [],
      '"sleep()" only accepts a non-negative Number/Decimal of milliseconds.',
    );
  }
  const sharedBuffer = new SharedArrayBuffer(4);
  const signal = new Int32Array(sharedBuffer);
  Atomics.wait(signal, 0, 0, milliseconds);
  return null;
}

export function version() {
  return `Parithi ${LANGUAGE_VERSION} (compiler ${COMPILER_VERSION})`;
}

export function platform() {
  return platformInfo();
}

export function workingDirectory() {
  return process.cwd();
}

/** Named `programArgumentsBuiltin`, not `arguments` — `arguments` cannot be a function-declaration name in strict-mode JS (every ES module). Registered under the String "arguments" in the registry, which is unrelated to JS binding rules. */
export function programArgumentsBuiltin() {
  return getProgramArguments();
}

/**
 * Version metadata for `pari --version` (Phase 7 — MASTER_DOCUMENT.md §19).
 * Compiler version is read from package.json rather than duplicated as a
 * separate literal, so the two can never drift apart. Language version is
 * the Master Document's own spec version (§0 header), tracked separately
 * from the compiler package version — they happen to both read 1.0 as of
 * this release, but are free to diverge again later (e.g. compiler 1.1.0
 * still implementing language spec 1.0).
 *
 * BUILD_DATE has no build step to stamp it automatically (§21 — "no build
 * step needed for v1.0"), so it's a plain literal kept in step with
 * MASTER_DOCUMENT.md's own "Last Updated" field by convention.
 *
 * Architecture-detection functions below (bytecodeSupport/pvmSupport/
 * optimizerSupport) exist so `pari --version` reports what's *actually*
 * loaded and callable rather than a frozen string that could silently go
 * stale the next time this module's shape changes — each checks that the
 * exports its feature actually depends on are present with the expected
 * type, the same defensive spirit as every runtime built-in's own
 * argument validation, applied to the CLI's own self-description instead.
 * passCount() in particular reads the Optimizer's own `DEFAULT_PASSES`
 * list length rather than a hand-maintained "8," so adding or removing a
 * pass can never leave this display quietly wrong.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as bytecodeModule from '../bytecode/index.js';
import * as vmModule from '../vm/index.js';
import * as optimizerModule from '../optimizer/index.js';
import * as nativeModule from '../native/native-compiler.js';
import * as backendModule from '../backend/selector.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));

export const LANGUAGE_VERSION = '1.0';
export const COMPILER_VERSION = packageJson.version;
export const BUILD_DATE = '2026-08-06';

export function nodeVersion() {
  return process.version;
}

export function platformInfo() {
  return `${process.platform} (${process.arch})`;
}

/** True if the Bytecode Generator (Phase 10, §29) is actually present and callable. */
export function bytecodeSupport() {
  return (
    typeof bytecodeModule.generateBytecode === 'function' &&
    typeof bytecodeModule.validateBytecode === 'function' &&
    typeof bytecodeModule.writeBytecodeBinary === 'function' &&
    typeof bytecodeModule.readBytecodeBinary === 'function'
  );
}

/** True if the Parithi Virtual Machine (Phase 11, §30) is actually present and callable. */
export function pvmSupport() {
  return typeof vmModule.VirtualMachine === 'function' && typeof vmModule.compileFromSource === 'function';
}

/** True if the Bytecode Optimizer (Phase 12, §31) is actually present and callable. */
export function optimizerSupport() {
  return typeof optimizerModule.optimizeBytecode === 'function' && Array.isArray(optimizerModule.DEFAULT_PASSES);
}

/** Number of ordered optimizer passes (§31.3) — read from the Optimizer's own pass list, never hand-maintained. */
export function passCount() {
  return optimizerSupport() ? optimizerModule.DEFAULT_PASSES.length : 0;
}

/** True if the Native x86-64 compiler (Phase 13, §33) is actually present and callable. */
export function nativeSupport() {
  return typeof nativeModule.compileNative === 'function';
}

/** True if the Adaptive Execution Engine's BackendSelector (Phase 14, §34) is actually present and callable. */
export function adaptiveEngineSupport() {
  return typeof backendModule.selectBackend === 'function' && typeof backendModule.evaluateBackend === 'function';
}

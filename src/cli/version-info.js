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
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));

export const LANGUAGE_VERSION = '1.0';
export const COMPILER_VERSION = packageJson.version;
export const RUNTIME_KIND = 'Tree-Walking Interpreter';
export const BUILD_DATE = '2026-08-06';

export function nodeVersion() {
  return process.version;
}

export function platformInfo() {
  return `${process.platform} (${process.arch})`;
}

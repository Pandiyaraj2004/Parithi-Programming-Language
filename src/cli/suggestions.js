/**
 * "Did you mean...?" helpers (Phase 7 — Developer Experience).
 * A minimal Levenshtein edit-distance so unknown flags and mistyped
 * filenames can suggest the closest real one, instead of just rejecting
 * the input outright — matching the DX of tools like git/cargo/rustc.
 */

import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, extname } from 'node:path';

/** Classic dynamic-programming edit distance between two short strings. */
export function levenshteinDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j++) distances[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      if (a[i - 1] === b[j - 1]) {
        distances[i][j] = distances[i - 1][j - 1];
      } else {
        distances[i][j] = 1 + Math.min(distances[i - 1][j], distances[i][j - 1], distances[i - 1][j - 1]);
      }
    }
  }
  return distances[rows - 1][cols - 1];
}

/** Closest candidate to `input`, or null if nothing is within `maxDistance`. */
export function findClosestMatch(input, candidates, maxDistance = 2) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshteinDistance(input, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= maxDistance ? best : null;
}

/**
 * Looks for a similarly-named ".pr" file in `filePath`'s own directory —
 * used when a requested source file doesn't exist, to catch typos like
 * "hallo.pr" instead of "hello.pr" without guessing across the whole disk.
 */
export function suggestSimilarFile(filePath) {
  const dir = dirname(filePath);
  const target = basename(filePath);
  if (!existsSync(dir)) return null;

  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }

  const prFiles = entries.filter((entry) => extname(entry) === '.pr');
  return findClosestMatch(target, prFiles, 3);
}

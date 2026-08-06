/**
 * Synchronous line-at-a-time stdin reader — the standard, dependency-free
 * way to get blocking console input in Node.js (matches §21's "no external
 * CLI library" decision). Parithi's execution model is a straight-line
 * tree walk, so `ask()` genuinely needs to block until a line is typed
 * rather than returning a Promise the rest of the interpreter would have
 * to thread through as async.
 */

import { readSync } from 'node:fs';

export function readLineSync() {
  const buffer = Buffer.alloc(1);
  let line = '';

  while (true) {
    let bytesRead;
    try {
      bytesRead = readSync(0, buffer, 0, 1);
    } catch (err) {
      if (err.code === 'EAGAIN') continue;
      if (err.code === 'EOF') break;
      throw err;
    }

    if (bytesRead === 0) break;
    const char = buffer.toString('utf8', 0, 1);
    if (char === '\n') break;
    line += char;
  }

  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

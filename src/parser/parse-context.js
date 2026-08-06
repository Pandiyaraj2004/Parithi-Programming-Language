/**
 * ParseContext — the parser's ambient bookkeeping, separate from grammar
 * logic. Today this is just "what file are we parsing" (for building
 * SourceLocations); kept as its own class rather than folded into Parser
 * so a later phase can extend it (e.g. macro/import context) without
 * touching grammar methods.
 */

import { SourceLocation } from '../errors/index.js';

export class ParseContext {
  constructor(filePath) {
    this.filePath = filePath;
  }

  locationOf(token) {
    return new SourceLocation(this.filePath, token.line, token.column);
  }
}

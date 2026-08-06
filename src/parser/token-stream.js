/**
 * TokenStream — a minimal cursor over the Lexer's token array.
 * Deliberately "dumb": it knows nothing about grammar or errors, only how
 * to look at and move through the tokens it was given. Keeping this
 * separate from Parser is what lets Parser stay focused purely on grammar.
 */

import { TokenType } from '../lexer/token.js';

export class TokenStream {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  /** Look `offset` tokens ahead without consuming. Clamped to the final (EOF) token. */
  peek(offset = 0) {
    const index = Math.min(this.pos + offset, this.tokens.length - 1);
    return this.tokens[index];
  }

  previous() {
    return this.tokens[this.pos - 1];
  }

  advance() {
    const token = this.peek();
    if (!this.isAtEnd()) this.pos++;
    return token;
  }

  isAtEnd() {
    return this.peek().type === TokenType.EOF;
  }
}

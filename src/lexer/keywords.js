/**
 * Reserved keyword table, per MASTER_DOCUMENT.md §12.1 (26 words total —
 * `stop` added Phase 8 (§15.7), `box` added Phase 9 (§Arrays)). None of
 * these may be used as an identifier — the Semantic Analyzer (Phase 3)
 * raises P004 for that. Built-in function names (round, random, number,
 * text, type, len, push, pop, insert, remove, sort, reverse, contains) are
 * NOT lexer keywords — they are ordinary identifiers reserved at the
 * semantic layer instead (§16.3).
 */

export const KEYWORDS = Object.freeze([
  'hold', 'const',
  'if', 'else', 'choose', 'option', 'other', 'end',
  'repeat', 'while', 'break', 'continue',
  'task', 'return', 'stop',
  'say', 'ask',
  'true', 'false', 'empty',
  'is',
  'and', 'or', 'not',
  'as',
  'box',
]);

export const KEYWORD_SET = new Set(KEYWORDS);

export function isKeyword(word) {
  return KEYWORD_SET.has(word);
}

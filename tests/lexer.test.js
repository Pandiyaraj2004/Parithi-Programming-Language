/**
 * Lexer test suite — Phase 1.
 * Exercises every token category from MASTER_DOCUMENT.md: keywords, literals,
 * identifiers, operators, symbols, comments, lexical errors, and position
 * tracking. Each `describe` block maps to one category from the Phase 1 brief.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType } from '../src/lexer/token.js';
import { CompilerError } from '../src/errors/index.js';
import { KEYWORDS } from '../src/lexer/keywords.js';

function tokenize(source) {
  return new Lexer(source, 'test.pr').tokenize();
}

function typesOf(tokens) {
  return tokens.map((t) => t.type);
}

function withoutTrivia(tokens) {
  return tokens.filter((t) => t.type !== TokenType.EOF && t.type !== TokenType.NEWLINE);
}

describe('Keywords', () => {
  test('every reserved keyword (excluding true/false/empty) tokenizes as KEYWORD', () => {
    const literalWords = new Set(['true', 'false', 'empty']);
    for (const word of KEYWORDS) {
      if (literalWords.has(word)) continue;
      const [token] = tokenize(word);
      assert.equal(token.type, TokenType.KEYWORD, `expected "${word}" to be KEYWORD`);
      assert.equal(token.lexeme, word);
      assert.equal(token.value, word);
    }
  });

  test('true/false tokenize as BOOLEAN with real boolean values', () => {
    const [trueToken] = tokenize('true');
    const [falseToken] = tokenize('false');
    assert.equal(trueToken.type, TokenType.BOOLEAN);
    assert.equal(trueToken.value, true);
    assert.equal(falseToken.type, TokenType.BOOLEAN);
    assert.equal(falseToken.value, false);
  });

  test('empty tokenizes as EMPTY with a null value', () => {
    const [token] = tokenize('empty');
    assert.equal(token.type, TokenType.EMPTY);
    assert.equal(token.value, null);
  });

  test('"is" is a keyword, but "more"/"than"/"less"/"at"/"least"/"most" stay plain identifiers (§13.4)', () => {
    const tokens = tokenize('is more than less at least most');
    assert.equal(tokens[0].type, TokenType.KEYWORD);
    for (const t of tokens.slice(1, -1)) {
      assert.equal(t.type, TokenType.IDENTIFIER);
    }
  });
});

describe('Identifiers', () => {
  test('normal identifiers: letters, digits, underscore, not digit-first', () => {
    for (const name of ['studentName', 'total', 'calculate', 'myVariable', '_hidden', 'a1b2']) {
      const [token] = tokenize(name);
      assert.equal(token.type, TokenType.IDENTIFIER);
      assert.equal(token.value, name);
    }
  });

  test('an identifier that matches a keyword tokenizes as KEYWORD, not IDENTIFIER', () => {
    const [token] = tokenize('task');
    assert.equal(token.type, TokenType.KEYWORD);
  });

  test('a digit immediately followed by letters is an invalid number literal (P010)', () => {
    assert.throws(
      () => tokenize('123abc'),
      (err) => {
        assert.ok(err instanceof CompilerError);
        assert.equal(err.code, 'P010');
        return true;
      },
    );
  });
});

describe('Numbers', () => {
  test('integer literals produce NUMBER tokens', () => {
    const [token] = tokenize('25');
    assert.equal(token.type, TokenType.NUMBER);
    assert.equal(token.value, 25);
    assert.equal(token.lexeme, '25');
  });

  test('decimal literals produce DECIMAL tokens', () => {
    const [token] = tokenize('25.50');
    assert.equal(token.type, TokenType.DECIMAL);
    assert.equal(token.value, 25.5);
    assert.equal(token.lexeme, '25.50');
  });

  test('negative numbers are not folded into the literal — "-" is always its own OPERATOR', () => {
    const tokens = withoutTrivia(tokenize('-5'));
    assert.equal(tokens[0].type, TokenType.OPERATOR);
    assert.equal(tokens[0].lexeme, '-');
    assert.equal(tokens[1].type, TokenType.NUMBER);
    assert.equal(tokens[1].value, 5);
  });

  test('"10 - 3" tokenizes as NUMBER OPERATOR NUMBER, never NUMBER NUMBER(-3)', () => {
    const tokens = withoutTrivia(tokenize('10 - 3'));
    assert.deepEqual(typesOf(tokens), [TokenType.NUMBER, TokenType.OPERATOR, TokenType.NUMBER]);
  });

  test('a trailing dot with no following digit is not consumed into the number', () => {
    const tokens = withoutTrivia(tokenize('10.'));
    assert.equal(tokens.length, 2);
    assert.equal(tokens[0].type, TokenType.NUMBER);
    assert.equal(tokens[0].value, 10);
    assert.equal(tokens[1].type, TokenType.PUNCTUATION);
    assert.equal(tokens[1].lexeme, '.');
  });

  test('an invalid number literal raises P010', () => {
    assert.throws(
      () => tokenize('99xyz'),
      (err) => {
        assert.equal(err.code, 'P010');
        return true;
      },
    );
  });
});

describe('Strings', () => {
  test('simple strings', () => {
    const [token] = tokenize('"Parithi"');
    assert.equal(token.type, TokenType.STRING);
    assert.equal(token.value, 'Parithi');
  });

  test('strings with spaces and punctuation', () => {
    const [token] = tokenize('"Hello, Parithi!"');
    assert.equal(token.value, 'Hello, Parithi!');
  });

  test('empty strings', () => {
    const [token] = tokenize('""');
    assert.equal(token.type, TokenType.STRING);
    assert.equal(token.value, '');
  });

  test('an unterminated string raises P009', () => {
    assert.throws(
      () => tokenize('say "Hello'),
      (err) => {
        assert.ok(err instanceof CompilerError);
        assert.equal(err.code, 'P009');
        return true;
      },
    );
  });

  test('a string cannot span a newline — the newline ends it as unterminated', () => {
    assert.throws(
      () => tokenize('"Hello\nWorld"'),
      (err) => {
        assert.equal(err.code, 'P009');
        return true;
      },
    );
  });
});

describe('Operators', () => {
  const cases = ['+', '-', '*', '/', '%', '**', '=', '==', '!=', '>', '<', '>=', '<='];

  for (const lexeme of cases) {
    test(`"${lexeme}" tokenizes as OPERATOR`, () => {
      const [token] = tokenize(lexeme);
      assert.equal(token.type, TokenType.OPERATOR);
      assert.equal(token.lexeme, lexeme);
    });
  }

  test('maximal munch: "**" is one token, not two "*" tokens', () => {
    const tokens = withoutTrivia(tokenize('**'));
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].lexeme, '**');
  });

  test('"=" and "==" are distinguished', () => {
    const [assign] = tokenize('=');
    const [equals] = tokenize('==');
    assert.equal(assign.lexeme, '=');
    assert.equal(equals.lexeme, '==');
  });
});

describe('Comments', () => {
  test('a single-line comment produces no tokens', () => {
    const tokens = withoutTrivia(tokenize('# just a comment'));
    assert.equal(tokens.length, 0);
  });

  test('a comment after code does not affect the preceding tokens', () => {
    const tokens = withoutTrivia(tokenize('hold age = 20 # inline comment'));
    assert.equal(tokens.length, 4);
    assert.equal(tokens[0].lexeme, 'hold');
  });

  test('multiple comment-only lines are all skipped', () => {
    const source = '# first\n# second\nhold x = 1';
    const tokens = withoutTrivia(tokenize(source));
    assert.equal(tokens.length, 4);
  });
});

describe('Symbols', () => {
  const symbols = ['(', ')', '[', ']', ',', '.', ':'];
  for (const symbol of symbols) {
    test(`"${symbol}" tokenizes as PUNCTUATION`, () => {
      const [token] = tokenize(symbol);
      assert.equal(token.type, TokenType.PUNCTUATION);
      assert.equal(token.lexeme, symbol);
    });
  }
});

describe('Errors', () => {
  test('an unknown character raises P008', () => {
    assert.throws(
      () => tokenize('@'),
      (err) => {
        assert.ok(err instanceof CompilerError);
        assert.equal(err.code, 'P008');
        return true;
      },
    );
  });

  test('a bare "!" not followed by "=" raises P008', () => {
    assert.throws(
      () => tokenize('!'),
      (err) => {
        assert.equal(err.code, 'P008');
        return true;
      },
    );
  });

  test('an unterminated string raises P009', () => {
    assert.throws(
      () => tokenize('"unterminated'),
      (err) => {
        assert.equal(err.code, 'P009');
        return true;
      },
    );
  });

  test('an invalid number literal raises P010', () => {
    assert.throws(
      () => tokenize('12abc'),
      (err) => {
        assert.equal(err.code, 'P010');
        return true;
      },
    );
  });

  test('errors carry a SourceLocation with the correct line and column', () => {
    try {
      tokenize('hold x = @');
      assert.fail('expected tokenize() to throw');
    } catch (err) {
      assert.equal(err.location.line, 1);
      assert.equal(err.location.column, 10);
    }
  });

  test('CompilerError.format() includes the code, message, and location', () => {
    try {
      tokenize('@');
    } catch (err) {
      const formatted = err.format();
      assert.match(formatted, /Error P008:/);
      assert.match(formatted, /test\.pr:1:1/);
    }
  });
});

describe('Position Tracking', () => {
  test('line numbers increment after a NEWLINE', () => {
    const tokens = tokenize('hold a = 1\nhold b = 2');
    const secondLineToken = tokens.find((t) => t.lexeme === 'b');
    assert.equal(secondLineToken.line, 2);
  });

  test('column numbers track position within a line', () => {
    const tokens = tokenize('hold age = 20');
    const ageToken = tokens.find((t) => t.lexeme === 'age');
    assert.equal(ageToken.column, 6);
  });

  test('EOF token is always emitted last', () => {
    const tokens = tokenize('hold x = 1');
    assert.equal(tokens.at(-1).type, TokenType.EOF);
  });

  test('EOF token is emitted even for an empty source file', () => {
    const tokens = tokenize('');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].type, TokenType.EOF);
  });
});

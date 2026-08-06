/**
 * SymbolTable — one lexical scope's declared names (MASTER_DOCUMENT.md §17.1).
 * Each scope owns its own table and a link to its parent. `declare()` only
 * ever writes into THIS table (which is what makes shadowing — §14.3 —
 * work: an inner "hold age" never touches the outer scope's entry), while
 * `resolve()` walks up the parent chain so outer-scope names stay visible
 * inside nested blocks.
 */

export function createSymbol({ name, kind, dataType, scopeLevel, location, mutable, params = null, returnType = null }) {
  return { name, kind, dataType, scopeLevel, location, mutable, params, returnType };
}

export class SymbolTable {
  constructor(kind, parent = null) {
    this.kind = kind;
    this.parent = parent;
    this.level = parent ? parent.level + 1 : 0;
    this.symbols = new Map();
  }

  /** Declares `symbol` in THIS scope only. Returns false if the name is already declared here. */
  declare(symbol) {
    if (this.symbols.has(symbol.name)) return false;
    this.symbols.set(symbol.name, symbol);
    return true;
  }

  /** True if `name` exists in THIS scope specifically — used for duplicate-declaration checks. */
  hasOwn(name) {
    return this.symbols.has(name);
  }

  /** Walks up the parent chain. Returns the Symbol, or undefined if not declared anywhere visible. */
  resolve(name) {
    if (this.symbols.has(name)) return this.symbols.get(name);
    if (this.parent) return this.parent.resolve(name);
    return undefined;
  }

  /** Symbols declared directly in this scope (not inherited) — used for `pari --analyze` display. */
  ownSymbols() {
    return [...this.symbols.values()];
  }
}

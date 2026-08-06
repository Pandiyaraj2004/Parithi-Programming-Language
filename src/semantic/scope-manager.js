/**
 * ScopeManager — tracks the current scope during analysis and creates new
 * child scopes on entry to any block (task/if/else/repeat/while/choose/
 * option — MASTER_DOCUMENT.md §11.4's block set). Kept separate from
 * SemanticAnalyzer (SRP) and separate from SymbolTable itself, since
 * "which scope is current right now" is a distinct concern from "what does
 * one scope contain."
 */

import { SymbolTable } from './symbol-table.js';

export class ScopeManager {
  constructor() {
    this.global = new SymbolTable('global', null);
    this.current = this.global;
    this.allScopes = [this.global]; // creation order, for `pari --analyze` display
  }

  enter(kind) {
    this.current = new SymbolTable(kind, this.current);
    this.allScopes.push(this.current);
    return this.current;
  }

  exit() {
    const finished = this.current;
    this.current = this.current.parent;
    return finished;
  }
}

/**
 * SemanticError — a diagnostic raised during semantic analysis.
 * Extends the shared CompilerError so it formats identically to lexer and
 * parser errors, reusing the `hint` field as the "helpful suggestion"
 * the Phase 3 brief asks every diagnostic to carry where possible.
 */

import { CompilerError } from '../errors/index.js';

export class SemanticError extends CompilerError {
  constructor(code, message, location, suggestion = null) {
    super(code, message, location, suggestion);
    this.name = 'SemanticError';
  }
}

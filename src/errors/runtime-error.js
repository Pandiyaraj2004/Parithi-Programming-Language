/**
 * ParithiRuntimeError — base class for runtime errors (P001, P005, P006,
 * P015, P016 defensively; P020, P021 exclusively — see MASTER_DOCUMENT.md §18).
 * Carries a call-stack snapshot (every runtime error must report where the
 * call chain was at the moment it occurred) and an optional hint, matching
 * the same "helpful suggestion" convention CompilerError/SemanticError use.
 */

import { describeErrorCode } from './error-codes.js';

export class ParithiRuntimeError extends Error {
  constructor(code, message, location = null, callStack = [], hint = null) {
    const { name } = describeErrorCode(code);
    super(message);
    this.name = 'ParithiRuntimeError';
    this.code = code;
    this.errorName = name;
    this.location = location;
    this.callStack = callStack;
    this.hint = hint;
  }

  format() {
    const lines = [`Error ${this.code}:`, this.message];
    if (this.location) {
      lines.push(`  → ${this.location.toString()}`);
    }
    if (this.callStack.length > 0) {
      lines.push('Call stack:');
      const visible = this.callStack.slice(0, 2);
      for (const frame of visible) {
        lines.push(`  at ${frame}`);
      }
      if (this.callStack.length > visible.length) {
        lines.push(`  ... (${this.callStack.length - visible.length} more)`);
      }
    }
    if (this.hint) {
      lines.push(`Hint: ${this.hint}`);
    }
    return lines.join('\n');
  }
}

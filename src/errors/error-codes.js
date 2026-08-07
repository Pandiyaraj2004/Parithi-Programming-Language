/**
 * Error code registry, per MASTER_DOCUMENT.md §18.
 * A single, stable table other modules look up by code so error text never
 * has to be duplicated across the lexer/parser/semantic analyzer/interpreter.
 */

export const ErrorPhase = Object.freeze({
  LEXING: 'Lexing',
  PARSING: 'Parsing',
  SEMANTIC_ANALYSIS: 'Semantic Analysis',
  INTERPRETATION: 'Interpretation',
  NATIVE_COMPILATION: 'Native Compilation',
});

export const ERROR_CODES = Object.freeze({
  P001: { name: 'Variable not declared', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P002: { name: 'Type mismatch', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P003: { name: 'Invalid block ending', phase: ErrorPhase.PARSING },
  P004: { name: 'Reserved keyword used', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P005: { name: 'Constant reassignment', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P006: { name: 'Runtime conversion error', phase: ErrorPhase.INTERPRETATION },
  P007: { name: 'Duplicate option value', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P008: { name: 'Unknown character', phase: ErrorPhase.LEXING },
  P009: { name: 'Unterminated string', phase: ErrorPhase.LEXING },
  P010: { name: 'Invalid number literal', phase: ErrorPhase.LEXING },
  P011: { name: 'Unexpected token', phase: ErrorPhase.PARSING },
  P012: { name: 'Unexpected end of file', phase: ErrorPhase.PARSING },
  P013: { name: 'Invalid choose block', phase: ErrorPhase.PARSING },
  P014: { name: 'Duplicate declaration', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P015: { name: 'Unknown function', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P016: { name: 'Invalid argument count', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P017: { name: 'Return outside task', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P018: { name: 'Break outside loop', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P019: { name: 'Continue outside loop', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P020: { name: 'Division by zero', phase: ErrorPhase.INTERPRETATION },
  P021: { name: 'Stack overflow', phase: ErrorPhase.INTERPRETATION },
  P022: { name: 'Invalid function call', phase: ErrorPhase.INTERPRETATION },
  P023: { name: 'Unexpected runtime failure', phase: ErrorPhase.INTERPRETATION },
  P024: { name: 'Array index out of range', phase: ErrorPhase.INTERPRETATION },
  P025: { name: 'Cannot index non-array value', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P026: { name: 'Array element type mismatch', phase: ErrorPhase.SEMANTIC_ANALYSIS },
  P027: { name: 'Negative array index', phase: ErrorPhase.INTERPRETATION },
  P028: { name: 'Math domain error', phase: ErrorPhase.INTERPRETATION },
  P029: { name: 'String index out of range', phase: ErrorPhase.INTERPRETATION },
  P030: { name: 'Unsupported native compilation feature', phase: ErrorPhase.NATIVE_COMPILATION },
  P031: { name: 'Maximum nesting depth exceeded', phase: ErrorPhase.PARSING },
});

export function describeErrorCode(code) {
  const entry = ERROR_CODES[code];
  if (!entry) {
    throw new Error(`Unknown Parithi error code "${code}".`);
  }
  return entry;
}

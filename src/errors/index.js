/**
 * Barrel export for the error framework — the rest of the codebase should
 * import from "errors/index.js" rather than reaching into individual files.
 */

export { ERROR_CODES, ErrorPhase, describeErrorCode } from './error-codes.js';
export { CompilerError } from './compiler-error.js';
export { ParithiRuntimeError } from './runtime-error.js';
export { SourceLocation } from './source-location.js';

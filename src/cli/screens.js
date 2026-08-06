/**
 * Static text screens for `pari --help` and `pari --version` (Phase 7).
 * Kept as pure functions (no console.log inside) so they're independently
 * testable and so commands.js stays a thin dispatcher rather than owning
 * both the routing logic and the copy.
 */

import { LANGUAGE_VERSION, COMPILER_VERSION, RUNTIME_KIND, BUILD_DATE, nodeVersion, platformInfo } from './version-info.js';

export function buildHelpText() {
  return `
Parithi Programming Language v${LANGUAGE_VERSION}

Usage
  pari <file.pr>              Execute a Parithi program

Commands
  --tokens <file.pr>   Display lexer output (token stream)
  --ast <file.pr>      Display the parsed Abstract Syntax Tree
  --analyze <file.pr>  Run the semantic analyzer (symbol tables + diagnostics)
  --runtime <file.pr>  Execute and display runtime state (environment/call stack)
  --version            Show version information
  --help               Show this help

Flags
  --verbose            Print execution time after a run

Examples
  pari hello.pr
  pari examples/hello.pr
  pari --tokens hello.pr
  pari --ast hello.pr
  pari --analyze hello.pr
  pari --runtime hello.pr
  pari hello.pr --verbose

Exit Codes
  0  Success
  1  Compiler Error      (lexer, parser, or semantic analyzer rejected the program)
  2  Runtime Error        (the program failed while executing)
  3  CLI Usage Error      (bad flag, missing/unreadable file, wrong extension)
`;
}

export function buildVersionText() {
  return `
Parithi Programming Language v${LANGUAGE_VERSION}

  Compiler        ${COMPILER_VERSION}
  Runtime         ${RUNTIME_KIND}
  Node            ${nodeVersion()}
  Build Date      ${BUILD_DATE}
  Platform        ${platformInfo()}
`;
}

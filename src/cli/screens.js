/**
 * Static text screens for `pari --help` and `pari --version` (Phase 7).
 * Kept as pure functions (no console.log inside) so they're independently
 * testable and so commands.js stays a thin dispatcher rather than owning
 * both the routing logic and the copy.
 */

import {
  LANGUAGE_VERSION, COMPILER_VERSION, BUILD_DATE, nodeVersion, platformInfo,
  bytecodeSupport, pvmSupport, optimizerSupport, passCount,
} from './version-info.js';

export function buildHelpText() {
  return `
Parithi Programming Language v${LANGUAGE_VERSION}

Usage
  pari <file.pr>              Execute a Parithi program (Tree-Walking Interpreter)
  pari <file.pbc>              Execute compiled Parithi Bytecode (PVM)

Commands
  --tokens <file.pr>       Display lexer output (token stream)
  --ast <file.pr>          Display the parsed Abstract Syntax Tree
  --analyze <file.pr>      Run the semantic analyzer (symbol tables + diagnostics)
  --runtime <file.pr>      Execute and display runtime state (environment/call stack)
  --bytecode <file.pr>     Display the generated Parithi Bytecode listing
  --compile <file.pr>      Compile to a .pbc bytecode file, next to the source
  --run-bytecode <file>    Execute on the PVM — accepts a .pbc file, or a .pr file (compiled in memory first)
  --stats <file.pr>        Display the Bytecode Optimizer's before/after statistics report
  --disassemble <file.pr>  Display the optimized, human-readable Bytecode listing
  --native <file.pr>       Compile to a real Windows (x86-64) .exe, next to the source — runs
                            standalone, with no Node.js/pari/PVM involved (only a small language
                            subset compiles today; unsupported features fail with a clear diagnostic)
  --version                Show version information
  --help                   Show this help

Flags
  --verbose            Print execution time after a run
  --optimize           Run the Bytecode Optimizer (§31) — alone with a .pr file, displays the
                        optimized listing instead of executing; combine with --compile, --run-bytecode,
                        or --bytecode to optimize a written .pbc file, a PVM run, or that listing
  -o <path>            With --native: write the executable to <path> instead of next to the source
  --ir                 With --native: also print the native IR the program compiled to
  --asm                With --native: also print the generated x86-64 instructions (offset, hex bytes, mnemonic)

Examples
  pari hello.pr
  pari examples/hello.pr
  pari --tokens hello.pr
  pari --ast hello.pr
  pari --analyze hello.pr
  pari --runtime hello.pr
  pari --bytecode hello.pr
  pari --compile hello.pr
  pari hello.pbc
  pari --run-bytecode hello.pbc
  pari hello.pr --verbose
  pari hello.pr --optimize
  pari hello.pr --stats
  pari hello.pr --disassemble
  pari --compile hello.pr --optimize
  pari --run-bytecode hello.pr --optimize
  pari --native hello.pr
  pari --native hello.pr -o build\hello.exe
  pari --native hello.pr --asm --ir

Exit Codes
  0  Success
  1  Compiler Error      (lexer, parser, or semantic analyzer rejected the program)
  2  Runtime Error        (the program failed while executing)
  3  CLI Usage Error      (bad flag, missing/unreadable file, wrong extension)
`;
}

export function buildVersionText() {
  const backends = ['Tree-Walking Interpreter', bytecodeSupport() ? 'Bytecode Generator' : null].filter(Boolean).join(' | ');
  const runtime = pvmSupport() ? 'Parithi Virtual Machine (PVM)' : 'Parithi Virtual Machine (PVM) — unavailable';
  const optimizer = optimizerSupport() ? `Bytecode Optimizer (${passCount()} Passes)` : 'Bytecode Optimizer — unavailable';
  const bytecode = bytecodeSupport() ? 'Supported (.pbc)' : 'Unsupported';

  return `
Parithi Programming Language v${LANGUAGE_VERSION}

  Language        Parithi v${LANGUAGE_VERSION}
  Compiler        ${COMPILER_VERSION}
  Frontend        Lexer → Parser → AST → Semantic Analyzer
  Backends        ${backends}
  Runtime         ${runtime}
  Optimizer       ${optimizer}
  Bytecode        ${bytecode}
  CLI             pari
  Node.js         ${nodeVersion()}
  Build Date      ${BUILD_DATE}
  Platform        ${platformInfo()}
`;
}

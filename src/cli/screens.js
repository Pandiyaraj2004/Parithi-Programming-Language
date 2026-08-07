/**
 * Static text screens for `pari --help` and `pari --version` (Phase 7).
 * Kept as pure functions (no console.log inside) so they're independently
 * testable and so commands.js stays a thin dispatcher rather than owning
 * both the routing logic and the copy.
 */

import {
  LANGUAGE_VERSION, COMPILER_VERSION, BUILD_DATE, nodeVersion, platformInfo,
  bytecodeSupport, pvmSupport, optimizerSupport, passCount, nativeSupport, adaptiveEngineSupport,
} from './version-info.js';

export function buildHelpText() {
  return `
Parithi Programming Language v${LANGUAGE_VERSION}

Usage
  pari <file.pr>              Execute a Parithi program — automatically picks the best backend
                                (Native x86-64 -> Bytecode + PVM -> Tree-Walking Interpreter)
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
  --explain-backend <file.pr>  Analysis only, never executes — reports every backend's SUPPORTED/
                            UNSUPPORTED verdict (with the specific reason) and which one automatic
                            selection would run and why
  --version                Show version information
  --help                   Show this help

Flags
  --verbose            Print the selected backend and execution time (bare "pari <file.pr>" and
                        --backend only) or just the execution time (--bytecode/--run-bytecode PVM runs)
  --backend <name>     Force a specific backend for "pari <file.pr>" instead of automatic selection —
                        native, bytecode, or interpreter. Never silently falls back: if the forced
                        backend can't run the program, this reports a clean diagnostic and exits
  --optimize           Run the Bytecode Optimizer (§31) — alone with a .pr file, displays the
                        optimized listing instead of executing; combine with --compile, --run-bytecode,
                        or --bytecode to optimize a written .pbc file, a PVM run, or that listing
  -o <path>            With --native: write the executable to <path> instead of next to the source
  --ir                 With --native: also print a short "what did the compiler understand" summary
  --asm                With --native: also print the generated x86-64 instructions (offset, hex bytes, mnemonic)
  --emit-ir            With --native: also print the real three-address-code IR (before optimization)
  --emit-optimized-ir  With --native: also print the IR after the Constant Folding/Propagation/
                        Algebraic Simplification/Dead-Code/Unreachable-Code/Redundant-Temporary
                        Elimination pipeline runs
  --optimizer-stats    With --native: also print how many changes each IR optimizer pass made

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
  pari --native hello.pr --emit-ir --emit-optimized-ir --optimizer-stats
  pari hello.pr --verbose
  pari hello.pr --backend bytecode
  pari hello.pr --backend interpreter
  pari --explain-backend hello.pr

Exit Codes
  0  Success
  1  Compiler Error      (lexer, parser, or semantic analyzer rejected the program)
  2  Runtime Error        (the program failed while executing)
  3  CLI Usage Error      (bad flag, missing/unreadable file, wrong extension)
`;
}

export function buildVersionText() {
  const backends = [
    'Tree-Walking Interpreter',
    bytecodeSupport() ? 'Bytecode Generator' : null,
    nativeSupport() ? 'Native x86-64' : null,
  ].filter(Boolean).join(' | ');
  const runtime = pvmSupport() ? 'Parithi Virtual Machine (PVM)' : 'Parithi Virtual Machine (PVM) — unavailable';
  const optimizer = optimizerSupport() ? `Bytecode Optimizer (${passCount()} Passes)` : 'Bytecode Optimizer — unavailable';
  const bytecode = bytecodeSupport() ? 'Supported (.pbc)' : 'Unsupported';
  const execution = adaptiveEngineSupport()
    ? 'Automatic backend selection (Native -> Bytecode+PVM -> Interpreter; --backend to force one)'
    : 'Manual backend selection only — Adaptive Execution Engine unavailable';

  return `
Parithi Programming Language v${LANGUAGE_VERSION}

  Language        Parithi v${LANGUAGE_VERSION}
  Compiler        ${COMPILER_VERSION}
  Frontend        Lexer → Parser → AST → Semantic Analyzer
  Backends        ${backends}
  Runtime         ${runtime}
  Optimizer       ${optimizer}
  Bytecode        ${bytecode}
  Execution       ${execution}
  CLI             pari
  Node.js         ${nodeVersion()}
  Build Date      ${BUILD_DATE}
  Platform        ${platformInfo()}
`;
}

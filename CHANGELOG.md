# Changelog

All notable changes to Parithi are documented in this file. Format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), using the project's
own phase numbering (Phase 0–13) where that's more informative than a plain
diff would be. See [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md) for the
full narrative write-up and [docs/PHASE8_AUDIT_REPORT.md](docs/PHASE8_AUDIT_REPORT.md)
for the detailed audit trail.

## [Unreleased]

All entries below are grouped under one "Unreleased" heading (rather
than each getting its own, which Keep a Changelog treats as one section
per version) since none bumped `package.json`'s version — that's a
release-cut decision no phase's brief has asked for yet.

### Phase 13 (native): a genuine, minimal Windows x86-64 native compiler foundation

**Scope, stated honestly up front:** this is a real, tested, actually-executed
foundation for native compilation — not full native compilation of the
language. Today it compiles exactly one thing: a sequence of `say`
statements with String literal arguments. Every other construct fails
with a clean `P030` diagnostic, never a crash and never a silently-wrong
`.exe`. `npm test` was 765/765 passing immediately before this work; **802/802
passing after** (765 + 37 new native tests), zero regressions — nothing
in the Lexer, Parser, AST, Semantic Analyzer, Interpreter, Bytecode
Generator, PVM, Optimizer, or Standard Library was touched. Full
specification: [MASTER_DOCUMENT.md §33](docs/MASTER_DOCUMENT.md#33-native-compiler-phase-13-x86-64-backend).

- **A real, hand-written third execution backend** —
  `AST → Native IR → x86-64 machine code → a real Windows PE32+ .exe`,
  alongside (not replacing) the Tree-Walking Interpreter and the
  Bytecode Generator/PVM. Reached via `pari --native <file.pr>`
  (writes `<file>.exe` next to the source), `-o <path>` (custom output),
  and `--ir`/`--asm` (opt-in inspection of the native IR / generated
  x86-64 instructions — never the default output).
- **No assembler, linker, or C compiler exists on the reference build
  machine** (checked directly: no gcc/clang/nasm/MSVC/MinGW/LLVM).
  Every byte of every PE header, section, import table, and x86-64
  instruction is therefore produced directly by hand-written JavaScript
  in the new `src/native/` module, following the Microsoft PE/COFF
  Specification and the Intel 64 and IA-32 Architectures Software
  Developer's Manual directly.
- **Added:** `src/native/codegen/x86-64-encoder.js` — hand-encoded,
  individually-documented x86-64 instructions (`mov r64,imm64`,
  `mov r32,imm32`, register-to-register `mov`, `lea [rsp+disp8]`,
  `mov qword [rsp+disp8],imm32`, `call [reg]`, `sub`/`add rsp,imm8`),
  each verified byte-for-byte against known encodings before being used
  in a real program.
- **Added:** `src/native/pe/pe-writer.js` + `rdata-builder.js` — a
  complete, standalone PE32+ (x86-64) executable writer: DOS/PE/COFF/
  Optional headers, `.text`/`.rdata` sections, and a full Import
  Directory Table/IAT/Hint-Name table for calling `KERNEL32.DLL`
  (`GetStdHandle`, `WriteFile`, `ExitProcess`) — no separate Import
  Lookup Table (a documented, valid PE simplification: `FirstThunk`
  serves both binding and runtime lookup). Uses a fixed image base with
  no ASLR/relocations, since every address a compiled program needs is
  therefore a link-time constant.
- **Added:** `src/native/codegen/native-codegen.js` — walks the exact
  same, unmodified AST every other backend uses, compiling `say`
  statements to `GetStdHandle`/`WriteFile` calls (space-joined
  multi-value output, matching `Interpreter.visitPrintStatement` exactly)
  and the program's implicit fallthrough to an `ExitProcess(0)` call
  (matching Interpreter/PVM's own exit-code convention, §15.7). Any
  other AST node, or a `say` argument that isn't a String literal, raises
  `NativeCompileError` (new **P030**) — feature name, source location,
  reason, and a suggested alternative, formatted identically to every
  other Parithi diagnostic.
- **A real bug, caught by actually executing a generated `.exe`, not by
  code review:** the Import Directory Table's `Name`/`FirstThunk` fields
  (and every IAT entry) initially held small local offsets instead of
  real image RVAs — the file loaded fine (proving the PE format itself
  was correct) but crashed with `STATUS_ACCESS_VIOLATION` resolving a
  garbage address. Fixed by adding a second, internal fixup pass to
  `rdata-builder.js`'s output, applied once `.rdata`'s own RVA is known —
  exactly the same two-pass technique `.text`'s own address fixups
  already used, just applied to `.rdata`'s self-references too. This is
  the canonical example of why every success-path native test actually
  executes the resulting binary (§ below) rather than only inspecting
  the compiled bytes.
- **Added:** `tests/native/native-compiler.test.js` (37 tests) — every
  success-path test **writes a real `.exe` and executes it** via
  `spawnSync`, asserting on genuine stdout/exit code (Hello World,
  multi-`say`, multi-value `say`, empty strings, a 250-byte string, 50
  sequential `say` statements, a program with no output at all); PE
  header fields read back and checked directly; 16 unsupported-feature
  cases (variables, constants, arithmetic, comparison, boolean logic,
  every control-flow construct, functions, `stop`, non-literal/non-String
  `say` arguments, arrays) each asserted to fail with exactly P030;
  lexical/semantic errors reaching the native compiler keep their own
  codes rather than being relabeled; a 3-way Interpreter/PVM/native
  parity sweep for every currently-supported program; `--ir`/`--asm`
  output sanity checks; and unit-level PE/rdata offset-consistency checks
  including a hand-built minimal `ExitProcess(N)`-only program.
- **Added:** `examples/native/hello.pr` and `strings.pr` — the two
  programs that genuinely compile natively today. Deliberately not a
  full `variables.pr`/`loops.pr`/`functions.pr`/etc. set, since creating
  example files for constructs the backend can't actually compile would
  misleadingly imply support that doesn't exist.
- **Added:** `benchmarks/native-benchmark.mjs` — measures the one
  workload genuinely comparable across all three backends today (Hello
  World; nothing CPU-bound is supported yet). Native is ~16x faster than
  the Interpreter/PVM for this workload, reported honestly as **mostly
  Node.js process-startup overhead the native `.exe` doesn't have** — not
  yet evidence that native-compiled code executes faster than
  interpreted/bytecode execution, which would need a CPU-bound benchmark
  (a loop, recursion) the backend doesn't support yet.
- **Changed:** `src/errors/error-codes.js` — new `ErrorPhase.NATIVE_COMPILATION`
  and error code **P030** (Unsupported native compilation feature).
  `src/cli/args.js`/`commands.js`/`screens.js` — the additive `--native`/
  `-o`/`--ir`/`--asm` CLI surface above; every existing command and flag
  is completely unaffected. `MASTER_DOCUMENT.md` — new §33 (full spec),
  plus touch-ups to the Status line, §23 (roadmap item 7), §25 (folder
  structure), §26 (future-enhancements wording); `README.md`; this
  changelog.

### CLI: `pari --version` reflects the full architecture

`pari --version` still described Parithi as it looked after Phase 7 — a
single Tree-Walking Interpreter — even though Phase 10 (Bytecode
Generator), Phase 11 (PVM), and Phase 12 (Bytecode Optimizer) had all
since shipped. Documentation/CLI-presentation only: no language, compiler
pipeline, VM behavior, or optimizer logic changed.

- **Changed:** `buildVersionText()` (`src/cli/screens.js`) now reports
  `Language`, `Compiler`, `Frontend` (`Lexer → Parser → AST → Semantic
  Analyzer`), `Backends` (`Tree-Walking Interpreter | Bytecode
  Generator`), `Runtime` (`Parithi Virtual Machine (PVM)`), `Optimizer`
  (`Bytecode Optimizer (N Passes)`), `Bytecode` (`Supported (.pbc)`),
  `CLI`, `Node.js`, `Build Date`, and `Platform` — every value either
  already-dynamic (package.json version, `process.version`,
  `process.platform`/`arch`) or newly detected rather than hand-typed.
- **Added:** `bytecodeSupport()`/`pvmSupport()`/`optimizerSupport()`/
  `passCount()` (`src/cli/version-info.js`) — each checks that the
  feature's actual exports (`generateBytecode`, `VirtualMachine`,
  `optimizeBytecode`, etc.) are present and callable, rather than a
  frozen "yes" string; `passCount()` specifically reads the length of the
  Optimizer's own `DEFAULT_PASSES` list, so it can never drift from the
  real pass count the way a hand-maintained "8" could.
- **Removed:** `RUNTIME_KIND` (`src/cli/version-info.js`) — the single
  hardcoded "Tree-Walking Interpreter" string it held is superseded by
  the `Backends`/`Runtime` lines above; nothing else referenced it.
- **Added:** three new `tests/cli.test.js` cases verifying the new
  architecture lines are present, the printed pass count matches
  `DEFAULT_PASSES.length` exactly, and the compiler/Node.js/platform
  lines match `package.json`/`process.version`/`process.platform`+`arch`
  exactly (never a stale literal); the existing `--version` test updated
  for the `Node` → `Node.js` label.
- **Changed:** `MASTER_DOCUMENT.md` §19 (CLI); this changelog.

### Phase 13a: Standard Library — Math, String, Array, Type, System

The first sub-phase of Phase 13's Standard Library — ~45 new built-ins
across five categories, none of them touching the Lexer, Parser, AST,
Semantic Analyzer *logic*, Bytecode, VM, or Optimizer (every addition is
a new entry in the exact extension points Phase 9's array built-ins
already used: `BUILTIN_SIGNATURES`, `TypeChecker.checkBuiltinCall`, and
the `BuiltinRegistry`). `npm test` was 761/761 passing after this
sub-phase (695 pre-existing + 66 new; zero regressions). Full
specification: [MASTER_DOCUMENT.md §32](docs/MASTER_DOCUMENT.md#32-standard-library-phase-13).

Given the full Phase 13 brief's size (9 categories, including file/
network I/O), it is being built in sub-phases rather than one pass —
13a (this entry) is synchronous and adds no dependency; 13b (File), 13c
(JSON), 13d (Date & Time), and 13e (HTTP, deliberately last) remain.

- **Added:** a new `src/stdlib/` module — `math/`, `string/`, `array/`,
  `type/index.js`, and `system/{index.js, program-args.js}` — registered
  into the existing `interpreter/builtins/index.js` `BuiltinRegistry`
  alongside the untouched Phase 6/9 built-ins, so the PVM (which calls
  the exact same `callBuiltin()` via `src/vm/builtins.js`'s existing thin
  re-export) executes every new function identically to the Interpreter
  with no second implementation.
- **Added — Math (§32.1):** `sqrt`, `pow`, `abs`, `floor`, `ceil`,
  `randomInt`, `sin`, `cos`, `tan`, `log`, `exp`, and the first two
  **variadic** built-ins in the language, `min`/`max` (2-or-more
  arguments — `BUILTIN_SIGNATURES`'s `maxArgs: Infinity`, rendered as
  "2 or more" in a P016 message rather than the literal `2-Infinity`).
  `sqrt()` of a negative number and `log()` of zero or a negative number
  raise the new **P028 (Math domain error)**.
- **Added — String (§32.2):** `upper`, `lower`, `trim`, `split`, `join`,
  `replace` (replaces every occurrence, Python-`str.replace`-style, not
  JavaScript's single-match `String.prototype.replace`), `startsWith`,
  `endsWith`, `substring` (out-of-range/inverted bounds raise the new
  **P029, String index out of range**), `lastIndexOf`, `repeatText`,
  `reverseText`. `split()`/`reverseText()`/`substring()` operate on
  Unicode code points, not raw UTF-16 units, so an astral character
  (e.g. certain emoji, stored as a surrogate pair) is never split in half.
- **Added — polymorphic `contains()`/`indexOf()` (§32.2/§32.3):**
  extended, not replaced — `contains(array, item)` keeps its exact Phase
  9 behavior; a String first argument is the new capability
  (`contains("Parithi", "rit")` → `true`). The same "one name, dispatch
  on the runtime value's actual type" pattern `len()` already established
  in Phase 9.
- **Added — Array (§32.3):** `clear()` (empties in place, matching
  `push`/`pop`/`sort`/`reverse`'s existing mutate-in-place convention),
  `length()` (a second registered name for `len()`'s exact existing
  implementation — not a reimplementation), `isEmpty()` (Array: zero
  elements; anything else: actually typed Empty).
- **Added — Type (§32.4):** `boolean()` (String must be exactly
  `"true"`/`"false"`, any case, or it raises the existing **P006**,
  reusing `number()`'s own "unconvertible text" code rather than a new
  one), `isNumber()`, `isText()`, `isBoolean()`.
- **Added — System (§32.9):** `sleep()` (real, synchronous blocking via
  `Atomics.wait` on a throwaway `SharedArrayBuffer` — Node's main thread,
  unlike a browser's, permits this, so no worker thread or dependency was
  needed), `version()`/`platform()` (reusing `src/cli/version-info.js`'s
  existing values, the same ones `pari --version` already prints — no
  second source of truth), `workingDirectory()`, and `arguments()` (the
  extra words after the source file on the command line, e.g.
  `pari script.pr foo bar` → `arguments()` is `box("foo", "bar")` —
  previously parsed by `src/cli/args.js` and silently discarded; now
  captured as `programArgs` and stored once per process before any mode
  executes Parithi code, via the new `src/stdlib/system/program-args.js`).
- **Deliberately not implemented — `stop()`:** the brief's System Library
  lists a `stop()` function, but `stop` is already a reserved keyword
  with its own statement grammar (`stop [code]`, Phase 8, §15.7) — a
  same-named callable expression isn't reachable without a parser change,
  which this sub-phase does not make (the Parser is a protected module).
  The existing statement already covers program termination.
- **Deliberately deferred — HTTP (§32.10):** the brief asks for
  `get()`/`post()`/`put()`/`delete()`/`download()` to block like an
  ordinary function call, but Parithi has no async/await/Promises
  anywhere, and this project has kept zero runtime dependencies since
  v1.0 — Node has no *built-in* synchronous network client. Making this
  work needs a real architecture decision (a `worker_threads`/
  `Atomics.wait` bridge, shelling out to `curl`, or an actual dependency),
  deliberately isolated to its own sub-phase (13e) rather than risking
  this one on its hardest, riskiest part.
- **Added:** `tests/math.test.js` (16 tests), `tests/string.test.js` (18
  tests), `tests/array.test.js` (9 tests), `tests/stdlib.test.js` (17
  tests — Type/System plus an Interpreter-vs-PVM parity sweep across
  every new built-in in every category, the same method
  `tests/vm-parity.test.js`/`tests/optimizer.test.js` already use), 5 new
  `tests/e2e.test.js` cases for the new `examples/stdlib/` programs, and
  2 new `tests/foundation.test.js` cases (error-code count, `arguments()`
  CLI parsing).
- **Added:** `examples/stdlib/calculator.pr`, `random-number-generator.pr`,
  `array-demo.pr`, `string-utilities.pr` — one per library shipped so far.
- **Changed:** `src/errors/error-codes.js` — two new codes, **P028**
  (Math domain error) and **P029** (String index out of range),
  continuing the existing sequence. `src/cli/args.js`/`commands.js` — the
  additive `arguments()` plumbing above (CLI is not a protected module
  this phase). `MASTER_DOCUMENT.md` — new §32 (full spec), plus touch-ups
  to the Status line, §23 (roadmap item 9), §24 (testing strategy table),
  §25 (folder structure), §26 (future-enhancements wording); `README.md`;
  this changelog.

### Phase 12: Bytecode Optimizer

A post-processing stage inserted between the Bytecode Generator and the
Validator/PVM: 8 ordered, independently-testable passes that shrink a
program's compiled bytecode without changing what it does — nothing in
`src/lexer/`, `src/parser/`, `src/ast/`, `src/semantic/`,
`src/interpreter/`, `src/runtime/`, `src/bytecode/`, or `src/vm/` changed
for this phase. `npm test` was 695/695 passing after this phase (632
pre-existing + 63 new; zero regressions). Full specification:
[MASTER_DOCUMENT.md §31](docs/MASTER_DOCUMENT.md#31-bytecode-optimizer-phase-12).

- **Added:** a new `src/optimizer/` module — `PassManager` (runs the 8
  passes below in a fixed order, to convergence), `Optimizer`/`index.js`
  (the public `optimizeBytecode()` entry point), `program-utils.js`
  (shared instruction-list helpers), `optimizer-error.js`
  (`OptimizerError`, thrown if a pass's output ever fails re-validation),
  `statistics.js`/`optimizer-report.js` (the `--stats` report), and
  `src/optimizer/passes/`: `constant-folding.js`, `constant-propagation.js`,
  `dead-code-elimination.js`, `jump-optimization.js`,
  `peephole-optimization.js`, `stack-optimization.js`,
  `constant-pool-optimization.js`, `label-cleanup.js` — each pass is a
  pure, independent function over an instruction list.
- **Added:** the Bytecode Validator (Phase 10) is re-run after **every
  individual pass**, not just once at the end of the pipeline — a pass
  whose output fails validation is rejected immediately via
  `OptimizerError`, so an invalid bytecode program can never reach the
  PVM. See §31.2.
- **Added — Pass 1, Constant Folding:** folds compile-time-constant
  arithmetic (`+ - * / % **`), comparison (`== != < > <= >=`), logical
  (`and`/`or`/`not`), and string concatenation, using a single
  operator-to-folder lookup table; division/modulo by a literal zero is
  deliberately left unfolded so the program still raises its documented
  `P020` at runtime, exactly as the Interpreter would.
- **Added — Pass 2, Constant Propagation:** implemented as single-assignment
  analysis over the compiled bytecode (a local slot written from a literal
  exactly once, anywhere in the program, is safe to inline) rather than a
  source-level `const`-vs-`hold` check — that distinction no longer exists
  once bytecode is generated, and single-assignment is a strictly safe
  superset of "every `const`, plus any `hold` that happens to never be
  reassigned." See §31.4 for the full reasoning.
- **Added — Pass 3, Dead Code Elimination:** removes instructions after an
  unconditional `RETURN`/`HALT`/`JMP` up to the next instruction actually
  reachable by a jump target or fall-through entry point.
- **Added — Pass 4, Jump Optimization:** collapses jump-to-jump chains to
  their final target and removes a jump whose target is the very next
  instruction.
- **Added — Pass 5, Peephole Optimization:** removes a `LOAD x` immediately
  followed by `STORE x` into the same slot (a no-op round-trip), and
  re-runs Pass 1's constant-fold rule to catch new adjacent-literal
  sequences exposed by earlier passes (§31.5's worked example). No `NOP`
  opcode exists in this instruction set, so "remove `NOP`" has nothing to
  do here.
- **Added — Pass 6, Stack Optimization:** removes adjacent `PUSH`/`POP` and
  `LOAD`/`POP` pairs whose value is never used. Stack-balance safety itself
  is guaranteed by the Validator re-run after this (and every) pass, rather
  than a separate depth tracker inside the pass.
- **Added — Pass 7, Constant Pool Optimization:** rebuilds the constant pool
  containing only entries still referenced after the prior passes, merges
  duplicate values (reusing the existing `ConstantPool` dedup from Phase
  10), and rewrites every instruction's constant-index operand to match.
- **Added — Pass 8, Label Cleanup:** by the time the optimizer runs, labels
  are already resolved to absolute instruction indices (Phase 10's own
  two-pass resolution) — there is no separate label table left to prune or
  renumber, so this pass is a second jump-collapse run that repairs any
  jump targets shifted by the DCE/pool passes before it. See §31.7.
- **Added:** `pari <file.pr> --optimize` (prints the optimized bytecode
  listing), `pari <file.pr> --stats` (prints the before/after Optimization
  Report — instruction count, constant-pool size, removed-instruction
  count, optimization ratio), and `pari <file.pr> --disassemble` (a
  human-readable optimized listing); `--optimize` also composes with
  `--compile`/`--bytecode`/`--run-bytecode` and plain `pari <file.pr>`.
- **Added:** `tests/optimizer.test.js` (54 tests) — each of the 8 passes
  tested independently for exactly what it transforms and what it
  deliberately leaves alone, plus nested loops, recursive and mutually
  recursive functions, `choose`/`option`/`other`, arrays (`box`), `stop`,
  every built-in, functions returning values, runtime errors, a 10,000+
  instruction program, and a regression-parity harness that runs every
  test program through **both** the unmodified Interpreter and
  Generator→Optimizer→PVM and asserts identical output/exit/error codes.
- **Added:** `benchmarks/optimizer-benchmark.mjs` and
  [docs/OPTIMIZER_BENCHMARKS.md](docs/OPTIMIZER_BENCHMARKS.md) — 9 named
  programs (Hello World, Calculator, Recursive Fibonacci, Factorial,
  100,000-iteration loop, Large Array, Nested loops, Deep recursion, and a
  constant-heavy stress case) measured before/after for instruction count,
  constant-pool size, and PVM wall-clock time. Reported honestly: the
  largest wins are in constant-heavy/straight-line code (up to 66.7% fewer
  instructions; Calculator runs roughly 3× faster), while loop- and
  recursion-heavy programs see a smaller but real reduction (5.9%–10.5%
  fewer instructions) since their wall-clock cost tracks iteration count,
  not static program size — a genuinely faster loop would need
  loop-invariant code motion or strength reduction, which this phase's
  brief did not ask for (tracked as future work, §23 item 8).
- **Changed:** `MASTER_DOCUMENT.md` — new §31 (full spec), plus touch-ups
  to the Status line, §23 (roadmap item 3 marked done, new item 8 for
  loop-aware optimizations), §24 (testing strategy table), §25 (folder
  structure), §26 (future-enhancements wording); `README.md`; this
  changelog; `docs/RELEASE_NOTES.md`.

### Phase 11: Parithi Virtual Machine

The second independent execution engine: `pari <file.pbc>` / `--run-bytecode`
now actually *execute* the bytecode Phase 10 could only ever generate.
`npm test` was 631/631 passing immediately after this phase's initial
implementation (508 pre-existing + 123 new; zero regressions), and
632/632 after the binary-format fix below added one more test — and, as
with Phase 10, **zero lines changed** in
`src/lexer/`, `src/parser/`, `src/ast/`, `src/semantic/`, `src/interpreter/`,
`src/runtime/`, or anywhere under `src/bytecode/` (Generator, Validator,
constant pool, binary format — all exactly as Phase 10 left them). Full
specification: [MASTER_DOCUMENT.md §30](docs/MASTER_DOCUMENT.md#30-parithi-virtual-machine-phase-11).

- **Added:** a new `src/vm/` module — `VirtualMachine` (the dispatch loop
  and top-level state), `instruction-dispatcher.js` (one handler per
  opcode), `Frame`/`Memory`/`Heap`/`OperandStack` (the memory model,
  §30.3–§30.4), `loader.js` (`loadFromFile()` for `.pbc`,
  `compileFromSource()` for `.pr` compiled in memory), `vm-errors.js`
  (every VM error as a `ParithiRuntimeError`), and `debugger.js` (future-ready
  read-only introspection).
- **Design principle, applied throughout:** reuse the one existing correct
  implementation rather than writing a second one, wherever possible —
  array semantics (`assertIndexable`/`resolveIndex`/`checkElementType`/
  `validateHomogeneousElements`, straight from `interpreter/builtins/array.js`),
  every built-in (`callBuiltin()`, straight from `interpreter/builtins/index.js`),
  deep equality and value rendering (`deepEquals()`/`stringify()`, straight
  from the Runtime System and Interpreter). Only arithmetic/comparison
  opcodes were hand-mirrored (the Interpreter implements those inline,
  with nothing importable) — see §30.2.
- **Added:** a two-parent frame model (`lexicalParent` for free-variable
  resolution, `callerFrame` for control-flow return) that reproduces
  Parithi's lexical-closure behavior for nested tasks with no closure
  object needed, proven correct by dedicated tests for both a nested task
  reading its enclosing task's parameter *through recursion*, and a
  *non-nested* helper resolving free variables against global rather than
  its caller's locals — see §30.3.
- **Added:** every VM error reuses an existing, documented Parithi error
  code — `P015`/`P020`/`P021`/`P024`–`P027` for language-runtime
  conditions the Interpreter can also hit (exact message/hint parity), and
  `P023` (the existing catch-all) for bytecode-integrity conditions that
  can never happen from Generator-produced, Validator-passed bytecode
  (invalid opcode, invalid jump, stack underflow, `RETURN` with no frame,
  an out-of-range constant reference). No new error code was added. A
  loaded `.pbc` is re-validated with the Phase 10 Validator before
  execution — a corrupted-but-parseable file is a CLI usage error (exit
  `3`), not a runtime failure of a program that never started.
- **Added:** `pari <file.pbc>` (bare, auto-detected by extension — the
  existing `pari <file.pr>` path is otherwise completely unaffected) and
  `pari --run-bytecode <file>` (accepts either a `.pbc` file or a `.pr`
  file, compiled to bytecode in memory with no file written).
- **Added:** `tests/vm.test.js` (74 tests) and `tests/vm-parity.test.js`
  (39 tests — the Phase 11 brief's own "Validation" section, made
  permanent: every program runs through **both** backends and asserts
  identical output/exit/error codes), plus `tests/cli.test.js` additions
  (10 tests) for the new CLI surface.
- **Fixed** (found by the parity test suite's own construction, not a
  pre-existing bug): the VM's top-level catch-all originally tried to
  compute a source location from the very state that had just proven
  unreadable, which could itself throw a second, raw error. Now mirrors
  `Interpreter.run()`'s own choice exactly — pass `null` for location, and
  only attempt (defensively) the call-stack trace, which doesn't touch the
  same state.
- **Fixed** (a genuine bug in Phase 10's binary `.pbc` format, caught by
  this phase's own required Interpreter-vs-PVM Validation): the format
  never serialized each instruction's `line`/`column`, so a runtime error
  raised from a bytecode file *loaded from disk* reported `file:null:null`
  instead of a real position — a real "Runtime Errors match" discrepancy
  against the identical program run via `--run-bytecode <file.pr>` (which
  compiles in memory, bypassing the binary format entirely). Fixed in
  `src/bytecode/bytecode-writer.js` by adding `line`/`column` as two
  `uint32` fields per instruction and bumping `FORMAT_VERSION` 1 → 2 (a
  `.pbc` written under version 1 is now rejected rather than silently
  misread); see `MASTER_DOCUMENT.md` §29.7. One new round-trip test added
  to `tests/bytecode.test.js`. `npm test`: 632/632 passing (631 + this 1
  new test), zero regressions.
- **Changed:** `MASTER_DOCUMENT.md` — new §30 (full spec), plus touch-ups
  to §1, §7, §8/§9 (pipeline diagram now shows the PVM), §10/§25 (folder
  structure), §22 (phase history), §23 (roadmap item 2 marked done), §26
  (future-enhancements wording), and §29.2's "future PVM" language
  updated to reference the now-real implementation; `README.md`; this
  changelog.

### Phase 10: Bytecode Generator

The first alternative *execution backend*: `pari --bytecode`/`--compile`
translate the same Semantic-Analyzer-validated AST into Parithi Bytecode
(`.pbc`), entirely independent of the Tree-Walking Interpreter. `npm test`
was 508/508 passing after this phase (454 pre-existing + 54 new; zero
regressions) — and, more specifically, **zero lines changed** in
`src/lexer/`, `src/parser/`, `src/ast/`, `src/semantic/`, or
`src/interpreter/` for this entire phase. Full specification:
[MASTER_DOCUMENT.md §29](docs/MASTER_DOCUMENT.md#29-bytecode-phase-10).

- **Added:** a new `src/bytecode/` module — `Opcode`/`OPCODE_INFO` (26
  opcodes: `PUSH`/`POP`/`LOAD`/`STORE`, `ADD`/`SUB`/`MUL`/`DIV`/`MOD`/`POW`/
  `NEG`, `EQ`/`NE`/`GT`/`LT`/`GE`/`LE`, `AND`/`OR`/`NOT`, `JMP`/
  `JMP_IF_TRUE`/`JMP_IF_FALSE`, `CALL`/`RETURN`, `PRINT`/`INPUT`,
  `ARRAY_NEW`/`ARRAY_GET`/`ARRAY_SET`, `HALT`), a deduplicated
  `ConstantPool`, a `Label`/`BytecodeBuilder` pair for two-pass jump
  resolution, `BytecodeGenerator` (the AST → instructions compiler),
  `validateBytecode()`, and `formatBytecodeText()`/`writeBytecodeBinary()`/
  `readBytecodeBinary()`.
- **Added:** compile-time slot mangling (`name$<n>`) in the Generator,
  reimplementing (not reusing — nothing in `src/semantic/` was touched)
  the same scope/shadowing rules the Semantic Analyzer already validates,
  since the instruction set has no runtime scope-push/pop primitive.
  Function names go through the identical mangling, so a nested task can
  share a name with an outer one without colliding in the function table.
- **Added:** `AND`/`OR` opcodes, defined as eager/non-short-circuit
  boolean combinators but never emitted for Parithi's actual `and`/`or`
  (§13.7, short-circuiting) — those compile via `JMP_IF_TRUE`/
  `JMP_IF_FALSE` instead, to stay behaviorally identical to
  `Interpreter.visitBinaryExpression` even when the unevaluated side would
  have thrown.
- **Added:** a Validator checking constant-pool references, jump targets,
  `CALL` argument counts against the function table, and full symbolic
  stack-balance (a worklist walk seeded at depth 0 at the program's start
  and at every function's entry point) — a failure is reported as an
  internal Generator bug, never blamed on the user's program, since
  Semantic Analysis already guaranteed the program itself is valid.
- **Added:** the `.pbc` binary format (magic `"PBC1"`, a constant pool, a
  function table, then instructions — full byte layout in §29.7) with a
  real reader (`readBytecodeBinary()`), included specifically so this
  phase's tests could verify exact round-trip fidelity — reading the
  structure back is not executing it; no opcode's *behavior* is
  implemented anywhere in this phase (the PVM is explicitly future work,
  §23 item 2, not part of Phase 10).
- **Added:** `pari --bytecode <file>` (prints the listing) and
  `pari --compile <file>` (writes `<file>.pbc`) — both run the full,
  unmodified compiler frontend first and report a compiler/semantic error
  exactly like every other command if the program doesn't pass; neither
  executes the program. `pari <file.pr>` with no flag is unaffected.
- **Added:** `tests/bytecode.test.js` (54 tests) plus `tests/cli.test.js`
  additions for the two new flags.
- **Changed:** `MASTER_DOCUMENT.md` — new §29 (full spec), plus touch-ups
  to §7, §9 (the pipeline diagram now shows both backends), §10/§25
  (folder structure), §22 (phase history), §23 (roadmap item 1 marked
  done), §26 (future-enhancements wording); `README.md`; this changelog.

### Phase 9: Arrays

The first language-surface addition since the Phase 8 audit: a new keyword,
new syntax, and seven new built-ins, implemented end-to-end — Lexer through
CLI, tests, and documentation. `npm test` was 454/454 passing after this
phase (up from 361/361 before it — 93 new tests, zero removed, zero
regressions). Full specification: [MASTER_DOCUMENT.md §28](docs/MASTER_DOCUMENT.md#28-arrays-phase-9).
Left as "Unreleased" rather than bumping `package.json`'s version, since
that's a release-cut decision this phase's brief didn't ask for.

- **Added:** the `box` keyword — array construction (`box(1, 2, 3)`, empty
  `box()`, nested `box(box(1,2), box(3,4))`).
- **Added:** `[...]` indexing and index assignment (`nums[0]`,
  `nums[1] = 100`), 0-based, chainable for nested arrays (`matrix[1][0]`).
  `[`/`]` were already lexed as `PUNCTUATION` (unused by any grammar rule
  before now) — no lexer change was needed, only a parser one.
- **Added:** seven built-ins — `push`, `pop`, `insert`, `remove`, `sort`,
  `reverse`, `contains` — plus an extension to the existing `len()` to also
  accept an Array.
- **Added:** a new static type, `Array` (`DataType.ARRAY`) — flat and
  non-parameterized (no "Array of Number" distinction; see §28.1 for why),
  and a new runtime value class, `ListValue` (`src/runtime/runtime-value.js`).
- **Added:** four new error codes, continuing the existing sequence —
  `P024` (index out of range), `P025` (indexing a non-array value), `P026`
  (array element type mismatch), `P027` (negative index). `P025`/`P026` are
  checked at Semantic Analysis time wherever statically possible and
  defensively at Interpretation time otherwise, mirroring every other
  dual-checked rule already in the codebase; `P024`/`P027` are runtime-only
  by nature (bounds are a runtime fact). A non-numeric index or a
  non-Array built-in argument reuses the existing `P002` rather than a new
  code.
- **Added:** `examples/arrays.pr`, exercised by `tests/e2e.test.js` and
  `tests/cli.test.js`.
- **Design decisions** (`docs/ARRAYS_DESIGN.md`'s five open questions,
  answered — see §28.1 for the full table): keyword `box`; **reference**
  semantics (not value semantics, `ARRAYS_DESIGN.md`'s recommendation);
  **0-based** indexing (not 1-based, that document's recommendation);
  keyword-call construction **plus** bracket indexing (that document
  suggested picking only one style); homogeneous elements, type-locked
  except `empty` (that document's recommendation, taken as-is). The two
  overrides of the document's own recommendations (reference semantics,
  0-based indexing) were both explicit instructions, not inferred.
- **Changed:** `docs/ARRAYS_DESIGN.md` marked superseded (historical design
  record only) with a pointer to §28 for current behavior — its own content
  left unedited.
- **Changed:** `MASTER_DOCUMENT.md`, `README.md`, `docs/RELEASE_NOTES.md`
  updated throughout (keyword count 25→26, error code count 23→27,
  built-in count 6→13, example count 10→11, test count 361→454, the
  §12.2 data-type table, §16.5 built-in reference, §18 error table, §22
  phase history, §23 roadmap, §26 future-enhancements list, §7 key
  features) plus a new §28 (this feature's full specification), appended
  after §27 rather than inserted earlier, so no existing `§N` cross-reference
  anywhere else needed to change.

## [1.0.0] — 2026-08-06

The first public release. Everything below Phase 8.5 was previously shipped
as compiler package `0.1.0` (a pre-release implementation) under a Release
Candidate label; this release promotes it to `1.0.0` with no language or
behavior changes since the Phase 8 audit, only release-readiness polishing.

### Phase 8.5 — Release Readiness (this release)

Packaging and documentation only — no language, compiler, or interpreter
behavior changed. `npm test` was 361/361 passing before this phase and
remains 361/361 after.

- **Added:** `LICENSE` (MIT), `CONTRIBUTING.md`, this `CHANGELOG.md`.
- **Changed:** `package.json` version `0.1.0` → `1.0.0`; added `author`,
  expanded `keywords`, expanded `files` to include the license and top-level
  docs; regenerated `package-lock.json` to match.
- **Changed:** Corrected a factual error repeated in `README.md` and
  `docs/RELEASE_NOTES.md` claiming the future collections keyword was
  "confirmed as `box`" — `docs/ARRAYS_DESIGN.md` (the actual design doc)
  and `src/lexer/keywords.js` (the actual keyword table) both agree no
  keyword has been chosen yet; the claim was never accurate and has been
  removed everywhere it appeared.
- **Changed:** Fixed stale/inconsistent references in `docs/MASTER_DOCUMENT.md`
  to a `tests/golden/` directory that was never actually created (the
  real golden-style coverage lives in `tests/e2e.test.js`); corrected an
  internal keyword count ("24" → "25", stale since `stop` was added);
  corrected a `§26` "Future Enhancements" bullet that claimed v1.0 shows
  only the immediate error location, when it has in fact always shown a
  truncated multi-frame call stack (`... (N more)`) — the bullet described
  an earlier implementation state that the code had already moved past.
- **Changed:** `README.md` rewritten for the final release (installation,
  quick start, CLI reference, examples, architecture, and feature list),
  including an accurate accounting of which example programs correspond to
  a named example in `docs/MASTER_DOCUMENT.md` §20 and which don't
  (the previous README overstated this as a full 1:1 correspondence).
- **Removed:** `bad1.pr`, a stray scratch file at the repository root with
  no test, doc, or example reference.
- **Removed:** `registry` re-export from `src/interpreter/builtins/index.js`
  (dead — nothing imported it; the module's `isBuiltinName` re-export, which
  *is* used, was kept).
- **Removed:** `logger.info`/`logger.warn`/`logger.debug` from
  `src/utils/logger.js` — none had a single call site anywhere in `src/`,
  `bin/`, or `tests/`; `logger.error` (the only method actually used) is
  unchanged.
- **Changed:** `reportUsageError()` in `src/cli/commands.js` now delegates
  to the existing `printError()` helper instead of re-implementing the same
  error-formatting branch inline — output is byte-for-byte identical,
  verified against `tests/cli.test.js`.
- **Added:** `docs/RELEASE_VERIFICATION_REPORT.md` — the itemized
  verification (tests, CLI, examples, doc consistency, cleanup) backing
  this release.

### Phase 8 — Full-Specification Audit

- Every keyword, grammar rule, built-in function, and documented error code
  (P001–P023) individually verified against `docs/MASTER_DOCUMENT.md`.
- Added the four `docs/MASTER_DOCUMENT.md` §20 example programs that
  previously existed only as inline doc text: `examples/calculator.pr`,
  `examples/fizzbuzz.pr`, `examples/grade-checker.pr`,
  `examples/while-break-continue.pr` — wired into `tests/e2e.test.js` and
  `tests/cli.test.js`.
- Added the `stop [code]` statement (§15.7) — approved post-audit by the
  language designer as the one addition beyond the original spec — with
  `examples/stop.pr` and full lexer/parser/semantic/interpreter/CLI coverage.
- Full results: `docs/PHASE8_AUDIT_REPORT.md`.

### Phase 7 — Professional CLI

- `pari` CLI with `--tokens`, `--ast`, `--analyze`, `--runtime`, `--version`,
  `--help`/`-h`, `--verbose`.
- Four distinct exit codes (0 success / 1 compiler error / 2 runtime error /
  3 CLI usage error).
- "Did you mean...?" suggestions (Levenshtein distance) for mistyped flags
  and filenames.
- Installable globally via `npm link`; verified from Bash, PowerShell, and
  Command Prompt.

### Phase 6 — Production Runtime

- Explicit `EnvironmentStack`/`CallStack` with leak-proof cleanup on
  break/continue/return, pinned (not truncated) on a genuine runtime error
  so `pari --runtime` can show exactly what was active at the moment of
  failure.
- Boxed `RuntimeValue` objects (`NumberValue`/`DecimalValue`/`StringValue`/
  `BooleanValue`/`EmptyValue`) and a reusable `BuiltinRegistry`.
- Defensive runtime re-checks alongside the existing compile-time checks.

### Phase 5 — Integration & Hardening

- Full pipeline integration pass; closed gaps found while cross-checking
  every stage against `docs/MASTER_DOCUMENT.md` (§13–§18).
- Every error class/stage verified to carry a code, message, source
  location, and a corrective hint — no raw JavaScript stack trace ever
  reaches the terminal.

### Phase 4 — Interpreter Core, Control Flow, Functions, Built-ins

- Tree-walking interpreter: variable/constant evaluation, arithmetic,
  comparisons, `say`/`ask` I/O.
- Control flow: `if`/`else`, `choose`/`option`/`other`, `repeat` (with
  optional 1-based counter), `while`, `break`, `continue`.
- Functions: `task` declaration/call, parameters, `return`, recursion
  (mutual and self-), lexical closures, a 500-frame call-depth guard.
- Built-ins: `round`, `random`, `number`, `text`, `type`, `len`.

### Phase 3 — Semantic Analyzer

- Symbol tables, scope tracking, static type inference and checking.
- Error codes P001–P005, P007, P014–P019.

### Phase 2 — Parser & AST

- Hand-written recursive-descent parser (no external parsing library, by
  design) producing a full AST node set with precedence-climbing
  expression parsing.
- `pari --ast` debug output.

### Phase 1 — Lexer

- Full tokenization: literals, all 25 reserved keywords, symbolic and
  readable-word operators (incl. multi-word comparisons like
  `is at least`), comments.
- `pari --tokens` debug output.

### Phase 0 — Foundation

- Repository scaffold, `package.json`, folder structure, error-handling
  framework, reserved keyword table.

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

### Phase 18: Adaptive Execution Engine & Loop Model Validation

Began from a brief asserting the Adaptive Execution Engine (§34) wasn't
selecting/executing Native correctly, and asking for a full validation
of the `repeat`/`while`/`loop` + `break`/`continue` loop model across all
three backends. Both claims were checked against fresh, real execution
rather than assumed. **Adaptive Execution Engine:** `pari hello.pr`,
`--verbose`, `--explain-backend`, and all three `--backend` values were
re-run live and confirmed to work exactly as designed — Native is
selected first whenever it genuinely supports the program (confirmed via
`examples/hello.pr`), Bytecode + PVM is the correct real fallback
(confirmed via `examples/arrays.pr` and `examples/loops.pr`, both
genuinely native-unsupported), forced `--backend` never silently falls
back, and automatic selection never executes more than one backend (two
new permanent regression tests assert the program's own output appears
exactly once — never a partial-execution double-run). No bug was found;
none was invented to justify a fix. **Loop model:** the brief's premise
that Parithi has only one loop keyword (`repeat`) was checked against the
actual keyword table and found incomplete — `while` and `loop` already
exist as full, tested, backward-compatible loop constructs alongside
`repeat` (added Phases 0 and 16 respectively) and were preserved
unchanged, per this phase's own explicit "do not redesign the language"
and "preserve constructs that already exist" rules. A 24-case live sweep
(basic/nested/deeply-nested loops, break/continue at every nesting
level, functions calling loops and loops calling functions, `return`/
`stop` inside a loop, array iteration, boolean conditions) matched
Interpreter and Bytecode + PVM exactly, and confirmed Native cleanly
rejects every one of them (no loop construct has real x86-64 codegen —
see §37.5's Native Feature Matrix). One genuine test-coverage gap was
found and closed: the zero-iteration case (`repeat 0`) had no permanent
regression test despite being a real, distinct edge case from "single
iteration." `npm test` was 989/989 immediately before this phase;
**992/992 passing after** (3 new regression tests: zero-iteration
`repeat`, and two no-duplicate-execution checks), zero regressions.

- **Confirmed, not changed:** `src/backend/capability.js`, `src/backend/selector.js`,
  `src/cli/commands.js`'s `runWithBackend` — capability analysis already
  happens fully before any backend executes; only ever one backend runs.
- **Confirmed, not changed:** `repeat`/`while`/`loop`/`break`/`continue` —
  no keyword removed, no syntax changed, no `for` construct exists or was
  added anywhere in the implementation.
- **Added:** `tests/backend/cli.test.js` — 2 new "exactly one backend
  executes, output never duplicates" regression tests.
- **Added:** `tests/vm-parity.test.js` — 1 new test covering the
  zero-iteration `repeat` edge case (both the counted and bare forms).

### Phase 17: Native Backend Recovery & Feature Expansion

Began from a brief asserting the native x86-64 backend was "not working
correctly." A fresh baseline (978/978 tests, plus a hands-on script that
actually compiled and *executed* real `.exe` files) found **no
reproducible defect** in what the native backend already claimed to
support — the premise did not match reality. Rather than force a fix
onto a working system, this phase pivoted to real **feature expansion**:
using the IR Optimizer's already-existing Constant Folding and Constant
Propagation passes (no new optimizer logic), native x86-64 codegen was
genuinely widened from "`say` with String literals only" to
`say`/`hold`/`const`/assignment built from literals, variables,
arithmetic (`+ - * / % **`), comparisons (`== != > < >= <=`), and unary
`-`/`not` — wherever every value resolves to a compile-time constant.

Two genuine edge cases were found and fixed along the way by actually
executing generated executables (never just assuming correctness):
division/modulo by a divisor that folds to zero (previously crashed with
a raw uncaught error; now cleanly rejected, restoring automatic
selection's correct fallback to Bytecode + PVM), and self-referencing
reassignment like `x = x + 1` (the IR Optimizer cannot fold a variable's
reassignment in terms of its own prior value; now cleanly rejected at the
cheap AST-only capability check, instead of only being caught later).
`and`/`or`/`if`/`while`/`repeat`/`loop`/functions/recursion/Arrays/every
Standard Library built-in remain correctly, cleanly unsupported — nothing
was silently forced through. `npm test` was 978/978 passing immediately
before this phase; **989/989 passing after**, zero regressions. See
[docs/MASTER_DOCUMENT.md §37](docs/MASTER_DOCUMENT.md#37-native-backend-recovery--feature-expansion-phase-17)
for the full audit trail, the two edge-case root-causes, and the
IR-Feature/Codegen/Executable-Tested matrix.

- **Changed:** `src/native/codegen/native-codegen.js` — `checkNativeStatement`/
  `checkNativeExpression` widened to accept `hold`/`const` declarations,
  assignment, and arithmetic/comparison/unary expressions; a new static
  check rejects a literal-zero divisor and a self-referencing reassignment
  upfront, each with its own specific `P030` reason.
- **Changed:** `src/native/codegen/ir-to-x86-64.js` — `resolveConstantOperand`/
  `extractPrintedLines` now also track `STORE`d variables (not just
  `say`-bound temps) and stringify Number/Decimal/Boolean/Empty values
  (not just String, matching `stringify.js` exactly); the two internal
  "value never resolved" cases now throw a clean `NativeCompileError`
  (`P030`) instead of a bare, uncaught `Error`.
- **Changed:** `src/backend/capability.js` — unchanged in shape; continues
  to reuse `checkNativeStatement` directly, so the wider Stage-1 gate
  above is automatically reflected in automatic/forced backend selection
  with no separate capability-analysis code to keep in sync.
- **Added:** `examples/native/variables.pr` — the newly-supported subset
  in a working example (declarations, arithmetic, comparisons, unary
  operators, reassignment), proven identical across all three backends.
- **Added:** 13 new "supported, really executed" tests plus 4 new
  regression tests (2 division-by-zero variants, 1 variable-derived-zero
  variant, 1 self-referencing-reassignment variant) in
  `tests/native/native-compiler.test.js`; 1 new
  `checkNativeCapability`-level self-reference test in
  `tests/backend/capability.test.js`; several existing tests' example
  programs updated where the original example was no longer a valid
  "native can't run this" case (e.g. a plain variable declaration), never
  by weakening what the test itself checks.
- **Not changed:** the Tree-Walking Interpreter, Bytecode Generator, PVM,
  Bytecode Optimizer, and every Standard Library built-in — this phase
  touched only `src/native/` and `src/backend/capability.js`.

### Phase 16: Unified Loop Model — `loop`, and `break <expression>`

Adds one new, unconditional loop construct, `loop ... end loop`, and
extends `break` to optionally carry a value (`break <expression>`)
everywhere `break` already works — letting `loop`/`while`/`repeat` alike
optionally *produce a value* (whatever `break <expression>` supplies, or
`Empty` if none does) when used in expression position, e.g. `hold
result = loop ... end loop`. `npm test` was 929/929 passing immediately
before this phase; **978/978 passing after** (929 + 49 new tests across
the parser, semantic analyzer, interpreter, and bytecode/PVM parity
suites), zero regressions — every pre-existing `while`/`repeat`/`break`/
`continue` program behaves identically to before.

**Design note**: `while`/`repeat` are unchanged as the recommended,
idiomatic way to write a conditional/counted loop — `loop` is not a
replacement for them, it is the one construct that has no built-in exit
condition of its own and is the primary vehicle for the new
expression-producing capability. All three loop kinds share one
underlying model (a per-loop-instance break-value accumulator, tracked
independently for nested loops) rather than three separate ones.

- **Added:** the `loop` keyword (27 reserved words total, up from 26).
- **Added:** `BreakStatement.value` (optional, mirroring `ReturnStatement`'s
  pre-existing optional-value shape exactly) and a new `LoopExpression`
  AST node.
- **Changed:** `Parser` — `parsePrimary()` now also accepts `loop`/
  `while`/`repeat` (reusing the exact same parse functions their existing
  statement-position dispatch already calls), so each may appear in
  expression position; fixed a genuine double-consumption bug this
  surfaced during testing (both the inner parse function and the
  enclosing statement were each trying to consume the same trailing
  newline) via a `consumeTrailingEnd` parameter, defaulting to the
  pre-existing statement-position behavior.
- **Changed:** `TypeChecker`/`SemanticAnalyzer` — `TypeChecker` gained an
  injected `inferLoopExpression` callback (bound to a new
  `SemanticAnalyzer.inferLoopExpression()`) for `LOOP_EXPRESSION`/
  `WHILE_STATEMENT`/`REPEAT_STATEMENT` in expression position, since a
  loop's *body* is a statement block only the Analyzer knows how to walk.
  A new per-loop-instance `breakValueStack` (mirroring the existing
  `loopDepth` counter's per-function reset) reconciles every
  `break <expression>` within the same loop to one static `DataType`,
  reporting `P002` on a genuine mismatch — `Empty` (a bare `break`) never
  conflicts with a concrete type, matching how `hold x = empty` already
  defers type-locking elsewhere.
- **Changed:** `Interpreter` — `BreakSignal` now carries an optional
  value (mirroring `ReturnSignal`'s shape); `visitWhileStatement`/
  `visitRepeatStatement` now return that value (`null`/Empty on a natural
  exit); new `visitLoopExpression()` follows the identical catch
  structure, with no condition check and therefore no natural-exit path.
- **Changed:** `BytecodeGenerator` — no new opcodes. Every loop kind now
  always leaves exactly one result value on the stack, reusing the same
  convergent-jump shape `and`/`or` short-circuiting already established:
  a natural exit (condition false / count exhausted) pushes `Empty` at a
  new intermediate label before falling into the loop's end label; a
  `break` pushes its value (or `Empty`, if bare) and jumps straight to
  the end label, skipping that push. The statement-position dispatch for
  `while`/`repeat` gained one `POP` each (discarding the now-always-
  present result, exactly like `ExpressionStatement` already does for
  every other expression); a new `compileLoopExpression()` follows the
  same shape with no natural-exit path at all. The existing Bytecode
  Validator accepted every generated program with no changes.
- **Unchanged, deliberately:** the Native backend. Its existing
  capability gate already rejects every loop construct (old or new)
  before reaching code generation, so no change was needed there; the
  Native IR generator explicitly rejects the *new* capability (`loop`,
  `break <expression>`, `while`/`repeat` in expression position) with a
  clean "not yet lowered to IR" error, leaving its pre-existing, tested
  bare-`break`/`while`/`repeat` IR modeling completely untouched.
- **Added:** `examples/loops/` — `basic.pr`, `break-value.pr`,
  `nested.pr`, `continue.pr`, `functions.pr`, `recursion.pr`, each
  individually run and verified against its documented output.
- **Added tests:** 8 in `tests/parser.test.js`, 12 in
  `tests/semantic.test.js`, 13 in `tests/interpreter.test.js`, and 12 in
  `tests/vm-parity.test.js` (Interpreter/PVM cross-backend parity for
  every case above) — 45 total (plus a handful of adjacent assertions),
  covering basic/nested/break-value/continue/functions/recursion/
  while-and-repeat-as-expressions/natural-exit-to-Empty/multiple-break-
  paths/runtime-errors-inside-a-loop.
- **Changed:** `tests/foundation.test.js`'s `KEYWORDS.length` assertion
  (26 → 27).
- **Changed:** `MASTER_DOCUMENT.md` (new §36 "Unified Loop Model," the
  Status line, §12.1's keyword table); `README.md` (Status, Feature
  List, test counts); this changelog.

### Phase 15: Production Readiness Audit — six real bugs found and fixed

A full end-to-end audit of the Phase 0–14 implementation: every keyword,
both existing backends and the Native compiler, every Standard Library
built-in, and every CLI command — each verified by actually running it
(real `.pr` programs, real generated `.exe` files actually executed, a
real `npm pack` extracted into a clean directory with zero access to
this repository), not by reading source and assuming correctness. `npm
test` was 906/906 passing immediately before this phase; **929/929
passing after** (906 + 23 new regression tests), zero regressions.

Several things that looked like bugs during testing turned out, on
verification against source and the existing test suite, to be correct,
documented behavior — `isEmpty("")` → `false` (§32.3: checks for the
`empty` type or a zero-length Array, never string length — matches
`tests/array.test.js`'s own pre-existing assertion), `remove()` returning
the removed element rather than the array (matches `pop()`'s
convention), and `contains()`'s Array-or-String polymorphism (Phase
13a). These are recorded as confirmations in
`docs/MASTER_DOCUMENT.md` §35.4, not defects.

- **Fixed (High):** deeply nested source (1000+ parenthesized groups, or
  thousands of nested `if`/`box(...)`) crashed with a raw, unformatted JS
  `RangeError` — directly violating this project's own "every failure is
  a clean P0xx diagnostic, never a stack trace" invariant (§18). Added a
  depth guard (`MAX_NESTING_DEPTH = 200`) at the two recursive choke
  points every deeply-nested expression or block funnels through
  (`Parser.parseExpression()`/`parseBlock()`), raising a new error code,
  **`P031`** ("Maximum nesting depth exceeded"). Capping depth at the
  parser transitively protects every downstream stage (Semantic
  Analyzer, Interpreter, Bytecode Generator, Native codegen) for free —
  none of them need their own guard. A second issue surfaced while
  fixing the first: panic-mode error recovery re-hit the identical depth
  wall over and over, producing **9,672** near-duplicate diagnostics for
  one 5,000-deep test file before this was caught; `P031` now bypasses
  panic-mode recovery entirely and fails fast with the single, real
  diagnostic.
- **Fixed (Medium):** `>`/`<`/`>=`/`<=` only checked mutual
  type-*compatibility*, not whether the type is actually orderable —
  `box(1,2) > box(3,4)` and `true > false` both passed Semantic Analysis
  silently and fell through to a meaningless raw JS `<`/`>` at runtime
  (Array-to-string coercion; Boolean-to-number coercion). Added
  `isOrderable()` (`semantic/types.js`): only Number, Decimal, and String
  may be ordered; Array and Boolean now raise `P002` with a specific
  message. `==`/`!=` (deep equality, which legitimately applies to any
  type) are completely unaffected.
- **Fixed (Medium):** `option -1` in a `choose` block always failed
  `P013` — the lexer always emits `-` as its own `OPERATOR` token (by
  design), so there was no way to write a negative `option` value at
  all. `parseOptionClause()` now recognizes `-` immediately followed by
  a `NUMBER`/`DECIMAL` token and folds it into a single negated
  `Literal` node (not a `UnaryExpression` — `option.test` is read
  directly as a Literal elsewhere, by `analyzer.js` and
  `bytecode-generator.js`, so this keeps that exact shape everywhere).
- **Fixed (Low):** a name colliding with a reserved/built-in name (`P004`)
  left nothing declared in scope, so every later reference to that same
  name independently raised its own spurious `P001` — one mistake
  reported as a cascade of unrelated-looking diagnostics.
  `checkNameAvailable()` now declares an `Unknown`-typed placeholder
  after reporting `P004`, matching how `P014` (a genuine duplicate)
  already avoids cascading.
- **Fixed (Low):** a bare `\r` line ending (no following `\n` — classic
  pre-OS X Mac text files) fell through the same silent-skip path as
  plain whitespace, so it never produced a `NEWLINE` token — an entire
  file collapsed onto one logical line. The lexer's `\r` case now checks
  for a following `\n` (CRLF — absorbed exactly as before, zero behavior
  change) and otherwise emits its own `NEWLINE`.
- **Fixed (Low, documentation):** `pari --version`'s "Backends" line
  still only listed the Interpreter and Bytecode Generator, never
  mentioning the Native x86-64 backend (Phase 13) or the Adaptive
  Execution Engine (Phase 14). Added `nativeSupport()`/
  `adaptiveEngineSupport()` (the same live-detection pattern as the
  existing `bytecodeSupport()`/`pvmSupport()`) and a new "Execution" line.
- **Removed (cleanup):** `src/interpreter/builtins/array.js`'s own
  `contains()` — dead code, shadowed since Phase 13a by the polymorphic
  version in `stdlib/array/index.js` (the one actually registered) — and
  its now-unused `deepEquals` import.
- **Added:** `ERROR_CODES.P031` (`src/errors/error-codes.js`, `ErrorPhase.PARSING`).
- **Added tests:** 4 in `tests/parser.test.js` (nesting-depth guard: 1000
  nested parens, 5000 nested `if`, 5000 nested `box(...)`, moderate
  50-level nesting still works) + 4 more (negative `option` literals:
  Number, Decimal, still-rejects-non-numeric, distinct-from-positive); 9
  in `tests/semantic.test.js` (5 ordering-restriction cases, 2
  negative-`option` semantic cases, 2 P004-cascade cases); 1 in
  `tests/interpreter.test.js` (negative `option` actually executes
  correctly); 4 in `tests/lexer.test.js` (CRLF/bare-CR/mixed line
  endings); 1 in `tests/cli.test.js` (`--version` architecture
  completeness) — 23 total.
- **Changed:** `tests/foundation.test.js`'s `ERROR_CODES` count assertion
  (30 → 31).
- **Changed:** `MASTER_DOCUMENT.md` (new §35 "Production Readiness
  Audit," the Status line, the §18 error-code table extended to
  P028–P031 — which had drifted out of sync since Phase 13a/13/14 each
  added codes without updating this specific table); `README.md`
  (Status, error-code count, folder structure, test counts); this
  changelog.

### Phase 14: Adaptive Execution Engine — automatic backend selection

Adds `src/backend/` — a small capability-analysis layer in front of the
three already-coexisting, independently-complete backends (Interpreter,
Bytecode + PVM, Native x86-64), so a bare `pari <file.pr>` picks the best
one automatically instead of always hardcoding the Interpreter. `npm test`
was 855/855 passing immediately before this work; **906/906 passing
after** (855 + 51 new: 20 capability/selector unit tests + 31 real
subprocess CLI tests), zero regressions.

**The core rule, enforced structurally, not just by convention**: backend
selection happens via pure, static AST inspection BEFORE any execution
begins — never by partially running one backend, catching a failure, and
retrying on another. For a language with side-effecting statements
(`say`), a "try native, fall back to bytecode on failure" design would
risk duplicating output if native printed some lines before hitting an
unsupported construct. `src/backend/capability.js`'s three checks
(`checkNativeCapability`/`checkBytecodeCapability`/
`checkInterpreterCapability`) never execute, compile to bytecode, generate
IR, emit x86-64, or write a PE file — `checkNativeCapability` specifically
reuses the exact same AST-level gate `native-codegen.js`'s pre-existing
`extractSayText()` already ran (same feature/reason wording, same
`NativeCompileError`/P030 shape) and stops there, which is what keeps the
check cheap per this phase's own performance requirement.

**Honest scope note**: the Bytecode Generator (Phase 10) has a compiler
for every AST node type the Parser can produce, so
`checkBytecodeCapability` reports `supported: true` for every program that
reaches it today — meaning automatic selection can currently only ever
resolve to Native or Bytecode in practice. The Interpreter fallback branch
of the priority list is real, implemented, and unit-tested (via synthetic
evaluation lists in `tests/backend/capability.test.js`, since no real
program can trigger it under today's actual capability facts), and remains
directly reachable via `--backend interpreter` — this is a forward-looking,
correctly-ordered design, not a decoration.

- **Added:** `src/backend/capability.js` — `checkNativeCapability`,
  `checkBytecodeCapability`, `checkInterpreterCapability`, and the
  `BACKENDS` priority list (`native` → `bytecode` → `interpreter`).
- **Added:** `src/backend/selector.js` — `selectBackend(program, filePath)`
  (evaluates all three, returns the winner plus every evaluation, for
  `--explain-backend`'s report), `evaluateBackend(id, program, filePath)`
  (single forced-backend lookup), and `selectFromEvaluations(evaluations)`
  (the pure "first supported wins" decision, factored out so it's
  unit-testable against synthetic outcomes independent of today's real
  capability facts).
- **Changed:** `src/cli/commands.js` — the bare `pari <file.pr>` path
  (previously always `runProgram()` → the Interpreter, unconditionally) is
  now `runWithBackend()`: lexes/parses/analyzes exactly once, decides on
  exactly one backend (automatically via `selectBackend()`, or forced via
  `--backend`), then dispatches to one of three execute-helpers —
  `executeInterpreterProgram()` (unchanged Interpreter behavior),
  `executeBytecodeProgram()` (bytecode generated in memory, run on the
  PVM, reusing the existing `executeBytecode()` helper `--run-bytecode`
  already used), or `executeNative()` (genuinely new: runs the real
  `compileProgramToNative()` + `buildPE64Executable()` pipeline, writes the
  `.exe` to a throwaway `os.tmpdir()` directory — never the project
  folder — spawns it as a real child process with `stdio: 'inherit'`,
  forwards its exit code, and deletes the temp directory afterward).
  `stop <n>` exit-code semantics and every backend's own exit-code scheme
  are preserved exactly per-backend.
- **Added:** `pari <file.pr> --backend native|bytecode|interpreter` — forces
  one specific backend for the `run` mode. Never silently falls back: an
  unsupported forced backend prints the real capability-check diagnostic
  (e.g. the actual `NativeCompileError`/P030 for a forced-but-unsupported
  Native run) and exits `ExitCode.COMPILER_ERROR`, without trying a
  different backend.
- **Added:** `pari --explain-backend <file.pr>` — a new dedicated CLI mode
  (like `--native`/`--bytecode`), analysis-only: lexes/parses/analyzes,
  runs `selectBackend()`, and prints every backend's SUPPORTED/UNSUPPORTED
  verdict (with the specific unsupported construct/reason for Native) plus
  which one was selected and why — never executes the program.
- **Changed:** `pari <file.pr> --verbose` (automatic and forced selection
  only) now also prints `Backend: <name>` before the program's own output,
  in addition to its pre-existing `✓ Completed in Nms.` trailer (unchanged,
  now also printed after the native execution path).
- **Changed:** `src/cli/args.js` — `--explain-backend` added to
  `FLAG_MODES` (leading-form dedicated mode, like `--native`); `--backend
  <name>` added as a value-taking modifier (same calling convention as
  `-o <path>` — extracted before mode dispatch, valid anywhere in argv,
  validated against `native`/`bytecode`/`interpreter` with a clean
  `CliUsageError` for anything else or a missing value).
- **Added:** `tests/backend/capability.test.js` (20 tests) — every
  capability check against real parsed/analyzed programs (including the
  exact `NativeCompileError` feature/reason wording for each rejection
  category), the `BACKENDS` list shape, `selectBackend()`/
  `evaluateBackend()` against real programs, and `selectFromEvaluations()`
  against synthetic evaluation lists covering all three selection outcomes
  (native-selected, bytecode-fallback, interpreter-fallback).
- **Added:** `tests/backend/cli.test.js` (31 tests) — real `spawnSync`
  subprocess tests: automatic selection (native-selected and
  bytecode-selected cases, banner position, no banner without
  `--verbose`), cross-backend parity (Native/Bytecode/Interpreter agree on
  stdout and exit code for the same program, including `stop <n>`),
  forced `--backend` success and no-fallback-on-failure (confirming zero
  program output on a forced-and-rejected run), `--explain-backend`'s
  report content and never-executes guarantee, CLI-usage-error handling
  for a bad/missing `--backend` value, and every pre-existing example
  program still producing identical output under automatic selection as
  under `--backend interpreter`.
- **Changed:** `tests/foundation.test.js` — `parseArgs`'s exact-shape
  assertion updated to include the new `backend: null` default field.
- **Changed:** `src/cli/screens.js` (`--help` text), `MASTER_DOCUMENT.md`
  (new §34 "Adaptive Execution Engine," plus the Status line), `README.md`
  (Status, Feature List, CLI Reference, Project Architecture diagram and
  folder structure, test counts, and a corrected Known Limitations entry —
  the old "the PVM is not the default" bullet was no longer accurate once
  automatic selection existed).
- **Explicitly not done**, per this phase's own scope: no new language
  keywords, modules, OOP, exception handling, async/await,
  garbage-collector redesign, new type system, or new syntax — the
  Interpreter, Bytecode Generator, PVM, Optimizer, and Native compiler are
  exactly as capable as they were at the end of Phase 13.

### Phase 13 (native): a real three-address-code IR + 6-pass IR Optimizer for the native backend

Adds `src/native/ir/` — a proper intermediate representation and
optimizer between the AST and the native x86-64 backend, closing the gap
this phase's own earlier entry (below) explicitly called out as the
recommended next step. `npm test` was 802/802 passing immediately before
this work; **855/855 passing after** (802 + 53 new: 23 IR-generation
tests + 30 IR-optimizer tests), zero regressions — every existing
Lexer/Parser/AST/Semantic Analyzer/Interpreter/Bytecode/PVM/Optimizer/
Standard-Library/native test still passes unchanged.

**Scope, stated honestly**: the IR and optimizer now genuinely model and
correctly optimize variables, arithmetic, comparisons, booleans, unary
negation, control flow (`if`/`else`/`while`/`repeat`/`break`/`continue`),
and functions (parameters, `return`, recursion, nested calls) — but only
`say` with String literal arguments is actually lowered to x86-64 machine
code today, exactly as before this change. The remaining gap is
specifically in `ir-to-x86-64.js`'s own coverage of the IR shapes the
generator/optimizer already fully support, not in the IR/optimizer
design itself — see MASTER_DOCUMENT.md §33.14 for the recommended order
to close it.

- **Added:** `src/native/ir/ir-nodes.js` — the IR data structures
  (`IRProgram`/`IRFunction`/`BasicBlock`/`IRInstruction`, `temp`/`var`/
  `const` operands) — three-address code with explicit basic blocks and
  terminators (`JUMP`/`BRANCH`/`RETURN`), no SSA/phi nodes (deliberately,
  per this phase's own "don't over-engineer the first version" rule).
- **Added:** `src/native/ir/ir-generator.js` — `IRGenerator`, structurally
  mirroring `src/bytecode/bytecode-generator.js`'s own proven approach
  (one method per AST node type, a `CompileScope` chain for
  shadowing-safe slot mangling, a `loopStack` for `break`/`continue`,
  predeclare-then-compile for `task`s) re-derived for a three-address-code
  shape instead of a stack machine, rather than inventing a second,
  independently-verified translation. `and`/`or` are lowered to real
  short-circuit branches across basic blocks (never an eager instruction)
  — evaluating the right-hand side eagerly would be an actual behavior
  change (a skipped side effect or avoided runtime error).
- **Added:** `src/native/ir/ir-printer.js` — human-readable IR text
  (`pari --native --emit-ir`/`--emit-optimized-ir`).
- **Added:** `src/native/ir/optimizer/` — six independently-testable,
  independently enable/disable-able passes, run in a fixed order to a
  convergence fixed point (matching `src/optimizer/optimizer.js`'s own
  convergence-loop shape): Constant Folding, Constant Propagation,
  Algebraic Simplification, Dead Code Elimination, Unreachable Code
  Elimination, Redundant Temporary Elimination. Every pass's own class
  doc leads with its safety rule — most importantly, Dead Code
  Elimination never removes a `CALL` or `PRINT` regardless of whether its
  result is used, since a function may have side effects the IR can't
  prove absent.
- **A real bug, caught by tracing an actual optimizer run, not by code
  review:** Dead Code Elimination originally tracked "which temps are
  used" in ONE set for the whole program — but a virtual register's id is
  only unique WITHIN the function that defines it (each function's own
  temp counter restarts at 0), so a `t0` used in `$main` incorrectly
  protected an unrelated, genuinely-dead `t0` in a different function
  from removal. This was a safe-direction bug (under-optimization, never
  a correctness break — a left-in dead instruction can't change program
  behavior), but still a real, silent defect; fixed by scoping the "used
  temps" tracking per function. A regression test for exactly this shape
  is in `tests/native/ir-optimizer.test.js`.
- **Changed:** `src/native/codegen/native-codegen.js` — now a two-stage
  pipeline: its own pre-existing AST-level "is this within the
  native-compilable subset" gate runs first, UNCHANGED (same exact
  `NativeCompileError` messages the existing 16 unsupported-feature tests
  already check), and only once a program passes it does the module
  additionally run it through `IRGenerator` → `optimize()` → the new
  `src/native/codegen/ir-to-x86-64.js` (extracted from the old inline
  x86-64-building logic, now reading from optimized IR instead of
  re-walking the AST — the actual "code generator consumes the optimized
  IR" requirement, satisfied for real for the currently-emittable subset).
- **Added:** `--emit-ir`, `--emit-optimized-ir`, `--optimizer-stats` CLI
  flags (`src/cli/args.js`/`commands.js`/`screens.js`) — additive to the
  existing `--native`/`-o`/`--ir`/`--asm` surface, composing freely with
  all of them; every pre-existing native CLI command is unaffected.
- **Added:** `tests/native/ir.test.js` (23 tests) — AST→IR generation for
  every construct the brief's §3 lists (variables, every arithmetic/
  comparison/boolean/unary operator, nested expressions, `if`/`else`,
  `while`, `repeat`, break/continue in nested loops, functions,
  parameters, local variable scoping, return values, recursion, nested
  calls) plus confirmation that `choose`/`stop`/`box` raise a clear error
  rather than silently-wrong IR. `tests/native/ir-optimizer.test.js` (30
  tests) — every one of the 6 passes tested both in isolation (via the
  optimizer's config option) and as part of the full default pipeline,
  matching every one of the brief's own worked examples exactly
  (`x = 10 + 20` → `30`; `y = x + 0` → `y = x`; the side-effecting-call
  safety rule; nested-expression full folding; control flow and
  recursion surviving optimization correctly).
- **Changed:** `MASTER_DOCUMENT.md` — §33.4 marked superseded (original
  text preserved for history) and eight new subsections added (§33.15
  "What Is IR and Why," §33.16 "AST vs. IR," §33.17 "IR Instruction
  Format," §33.18 "AST → IR Conversion," §33.19 "The IR Optimizer,"
  §33.20 "IR → Target Code," §33.21 "How to Debug IR," §33.22 "How to Add
  a New Optimization Pass"), plus updates to the Status line and §33.14's
  "Recommended Next Phase" (items 1-3's own IR groundwork marked done);
  `README.md`; this changelog.

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

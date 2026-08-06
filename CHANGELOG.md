# Changelog

All notable changes to Parithi are documented in this file. Format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), using the project's
own phase numbering (Phase 0–9) where that's more informative than a plain
diff would be. See [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md) for the
full narrative write-up and [docs/PHASE8_AUDIT_REPORT.md](docs/PHASE8_AUDIT_REPORT.md)
for the detailed audit trail.

## [Unreleased] — Phase 9: Arrays

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

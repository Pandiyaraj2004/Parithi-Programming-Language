# Parithi v1.0 — Final Release

**Release date:** 2026-08-06
**Compiler package version:** 1.0.0
**Language specification version:** 1.0 (MASTER_DOCUMENT.md)

---

## Summary

Parithi v1.0 is a complete, verified implementation of the language specified in MASTER_DOCUMENT.md: a human-friendly, statically-typed, block-scoped scripting language, delivered behind a professional CLI, executable by either of two independent backends. Every keyword, language rule, control-flow construct, built-in function, and documented error code has been individually verified against the specification (see `PHASE8_AUDIT_REPORT.md` for the full Phase 8 audit). Post-audit, the language designer approved one further addition — a `stop [code]` statement (§15.7) — and explicitly declined modules, exception handling, and OOP for this release. A subsequent Phase 8.5 pass prepared the project for public release (packaging, documentation, and repository cleanup only — see `CHANGELOG.md` for the itemized list; no language or behavior changes). **Phase 9** added Arrays — the `box` keyword, `[...]` indexing/assignment, and seven new built-ins — end-to-end across every layer (MASTER_DOCUMENT.md §28). **Phase 10** added a **Bytecode Generator** — `--compile` translates the validated AST into Parithi Bytecode (`.pbc`) (MASTER_DOCUMENT.md §29). **Phase 11** added the **Parithi Virtual Machine** — `pari <file.pbc>` executes that bytecode directly, a second, independent execution engine (MASTER_DOCUMENT.md §30). **Phase 12** added a **Bytecode Optimizer** — `--optimize` runs 8 ordered passes between the Generator and the Validator/PVM, re-validating after every pass, and shrinking a program's bytecode without changing what it does (MASTER_DOCUMENT.md §31). All four phases changed zero lines in the Lexer, Parser, AST, Semantic Analyzer, Interpreter, or Runtime — see `CHANGELOG.md` for all four. All 695 automated tests pass, including a dedicated 39-test suite proving the Interpreter and the PVM produce byte-for-byte identical output for the same programs, a Phase 11 test verifying a genuine Phase 10 binary-format bugfix, and a further 54-test suite proving the same output-identical parity holds for optimized bytecode (see `CHANGELOG.md`); no known outstanding implementation bugs.

This document was originally written for the v1.0 Release Candidate 1 milestone and has been updated in place for the final v1.0 release; see `CHANGELOG.md` at the repository root for a concise, dated summary of every release.

## Feature List

- **Data types:** Number, Decimal, String, Boolean, Empty, Array — with static type inference locked from first assignment, and Number/Decimal treated as mutually compatible. Array added Phase 9.
- **Arrays (`box`):** `box(1, 2, 3)` / `box()`, 0-based `arr[i]` indexing and assignment, nested arrays, reference semantics, deep (structural) equality for `==`/`!=`, and a homogeneity rule (every element shares one type, except `empty`) — see MASTER_DOCUMENT.md §28.
- **Variables & constants:** `hold` (mutable), `const` (immutable, reassignment rejected at compile time).
- **Block scope** with proper shadowing across `if`/`task`/`repeat`/`while`/`choose` bodies.
- **Operators:** full arithmetic (`+ - * / % **`), symbolic and readable-word comparisons (`==`/`is`, `>=`/`is at least`, etc.), word-only logical operators (`and`/`or`/`not`), fully specified precedence/associativity including the corrected `not`-vs-comparison and unary-minus-vs-`**` rules.
- **Control flow:** `if`/`else` (nested for else-if), `choose`/`option`/`other` (no fall-through, duplicate-value detection), `repeat` (fixed-count, optional 1-based counter), `while`, `break`/`continue`, `stop [code]` (terminates the entire program immediately, from anywhere, with an optional numeric exit code — §15.7).
- **Functions:** `task` with parameters, `return`, recursion (mutual and self-), lexical closures, a 500-frame call-depth guard.
- **Built-ins:** `round`, `random` (math); `number`, `text`, `type` (conversion/inspection); `len` (text or array); `push`, `pop`, `insert`, `remove`, `sort`, `reverse`, `contains` (arrays, Phase 9) — all argument-validated at both compile time and defensively at runtime.
- **I/O:** `say` (multi-value, space-joined output), `ask` (always returns String).
- **Error reporting:** 27 stable error codes (P001–P027) across Lexing/Parsing/Semantic Analysis/Interpretation, each carrying a code, message, source location, and a corrective hint. No raw JavaScript stack trace ever reaches the user.
- **Bytecode Generator (Phase 10):** `--bytecode`/`--compile` translate a validated program into Parithi Bytecode (`.pbc`) — 26 opcodes, a deduplicated constant pool, a function table, and both a human-readable text listing and a binary file format. See MASTER_DOCUMENT.md §29.
- **Parithi Virtual Machine (Phase 11):** `pari <file.pbc>` / `--run-bytecode` execute compiled bytecode directly — a second, independent execution engine, proven output-identical to the Tree-Walking Interpreter for every construct in the language (a dedicated 39-test parity suite). See MASTER_DOCUMENT.md §30.
- **Bytecode Optimizer (Phase 12):** `--optimize` runs 8 ordered, independently-tested passes (constant folding, constant propagation, dead-code elimination, jump optimization, peephole optimization, stack optimization, constant pool optimization, label/jump-target cleanup) between the Generator and the Validator/PVM, re-validating after every single pass and rejecting anything invalid. `--stats` prints an instruction/constant-pool before-vs-after report; `--disassemble` prints the optimized listing. Proven output-identical to the unoptimized Interpreter/PVM for every construct (a further 54-test parity suite). See MASTER_DOCUMENT.md §31.
- **CLI (`pari`):** `<file.pr>` execution, `--tokens`, `--ast`, `--analyze`, `--runtime`, `--bytecode`, `--compile`, `--run-bytecode`, `--optimize`, `--stats`, `--disassemble` (debug/compile/execute/optimize introspection at every pipeline stage), `<file.pbc>` auto-detected execution, `--version`, `--help`/`-h`, `--verbose` (execution timing). Four distinct exit codes (0 success / 1 compiler error / 2 runtime error / 3 CLI usage error), overridable by the program's own `stop <code>`. "Did you mean...?" suggestions for mistyped flags and filenames.

## Known Limitations (by design, not oversight — see MASTER_DOCUMENT.md §26)

- No Maps/dictionaries — Arrays (Lists) shipped in Phase 9; a key-value collection type remains future work — see `ARRAYS_DESIGN.md` (historical) and MASTER_DOCUMENT.md §28 (current).
- No dedicated list-iteration syntax (`repeat item as x in list`) — arrays are iterated via `repeat n as i` combined with indexing (§28.4).
- No object-oriented programming — no classes, structs, or methods. Explicitly declined for v1.0 by the language designer.
- No modules — every program is a single `.pr` file. Explicitly declined for v1.0 by the language designer.
- No exception handling — any runtime error (P006, P020–P027) terminates the program; there is no `try`/`catch` recovery mechanism. Explicitly declined for v1.0 by the language designer. (A program can still terminate itself deliberately and cleanly via `stop <code>`, which is not exception handling — there is no recovery, just a controlled exit.)
- No string indexing or slicing — `[...]` indexing works only on Arrays; `len()` is String's only introspection.
- No dedicated `else if` keyword — nested `if`/`end if` inside `else` is the documented, supported way to chain conditions.
- No file or system built-ins — Parithi programs interact with the world only through `say`/`ask`.
- Multi-frame call-stack display truncates to the first 2 frames + a count for very deep stacks (matches the documented example format, on both backends identically); full N-frame traces remain future work.
- The PVM is not the default — `pari <file.pr>` always runs on the Tree-Walking Interpreter; switching the default (and gating the Interpreter behind `--interpret`) is a deliberate future decision, not automatic.
- No loop-aware optimization — the Phase 12 optimizer (§31) reduces static instruction count and constant-pool size (largest wins in constant-heavy/straight-line code); it does not perform loop-invariant code motion or strength reduction, so a tight loop's wall-clock time still tracks iteration count, not program size.

## Future Roadmap (unchanged from MASTER_DOCUMENT.md §23 except items 1, 2, 3, and 4, which Phases 10, 11, 12, and 9 respectively fulfilled/partially fulfilled)

1. Bytecode Generator — **shipped in Phase 10** (compiles the validated AST to `.pbc`, via `--bytecode`/`--compile`)
2. Parithi Virtual Machine (PVM) — **shipped in Phase 11** (executes the `.pbc` Phase 10 produces, via `pari <file.pbc>`/`--run-bytecode`). Tree-walking interpreter retained as the default; a future `--interpret` flag once/if the PVM becomes the default is not yet needed.
3. Optimizer pass (constant folding, dead-code elimination, peephole optimization) — **shipped in Phase 12** (8 ordered passes between the Generator and the Validator/PVM, via `--optimize`/`--stats`/`--disassemble`); loop-aware optimization (loop-invariant code motion, strength reduction) remains future work, tracked as a new roadmap item below.
4. Collections — **Lists shipped in Phase 9 as Arrays (`box`); a Map (key-value) type remains future work, along with dedicated list-iteration syntax**
5. Object-oriented programming (a `type`-block construct, name TBD) — declined for v1.0
6. Module system (`import`/multi-file programs) — declined for v1.0
7. Native compilation (LLVM or transpile-to-C backend)
8. Loop-aware optimizations (loop-invariant code motion, strength reduction) — not started; Phase 12's passes shrink static program size but do not speed up a loop's per-iteration cost (see `docs/OPTIMIZER_BENCHMARKS.md`)

Exception handling and a `switch` alternative (surfaced during this audit's language-completion review, `PHASE8_AUDIT_REPORT.md` §11) were also declined for v1.0. The one approved addition from that review, originally proposed as `exit`, shipped as `stop` (§15.7).

## Statistics

| Metric | Value |
|---|---|
| Source files (`src/` + `bin/`) | 69 + `src/optimizer/`'s 15 files (Phase 12) |
| Test files | 13 |
| Automated tests | 695 (0 failing) |
| Test suites | 150 |
| Documented error codes | 27 (P001–P027) |
| Reserved keywords | 26 (incl. `stop` §15.7, `box` §28) |
| Built-in functions | 13 (6 pre-Phase-9 + 7 array built-ins) |
| Bytecode opcodes | 26 (§29.3), all executable by the PVM (§30.5) |
| Optimizer passes | 8 (§31.3), run to convergence, re-validated after each |
| Example programs | 11 (all verified against documented output, on both backends) |

## Architecture Summary

```
                                                    ┌─→ Tree-Walking Interpreter ────────────────────────────────────────┐
Source (.pr) → Lexer → Parser → AST → Semantic Analyzer ─┤                                                                      ├─→ Output
                                                    └─→ Bytecode Generator → [Optimizer, optional] → Validator → PVM ─┘
```

Through Phase 9, this release executed the validated AST directly, with no bytecode anywhere in the pipeline. **Phase 10** added the Bytecode Generator as a second path branching off the same Semantic Analyzer output, generating `.pbc` but not executing it. **Phase 11** completed that path: the **Parithi Virtual Machine** now executes the generated bytecode directly. **Phase 12** inserted the **Bytecode Optimizer** as an optional stage on that same right-hand path, between the Generator and the Validator/PVM — off by default, engaged only by `--optimize`/`--stats`/`--disassemble` — the Tree-Walking Interpreter (left branch) is unchanged throughout, still the default for plain `pari <file.pr>`. The runtime layer (`src/runtime/`) is a deliberately separable module (explicit `EnvironmentStack`, `CallStack`, boxed `RuntimeValue`s including the Phase 9 `ListValue`, a `BuiltinRegistry`) — this separability is exactly what let Phase 10, Phase 11, and Phase 12 all add their functionality with zero changes to the Lexer, Parser, AST, Semantic Analyzer, or Interpreter, fulfilling the architecture's central bet from MASTER_DOCUMENT.md §27. All backends/stages are proven, not just asserted, to produce identical output — see §30.11 and §31.10.

## Language Summary

Parithi optimizes for a first-time reader's ability to understand code out loud: readable-word operators alongside symbolic ones, a single consistent block-closing rule (`end <keyword>`), no semicolons or mandatory parentheses, and compile-time type/scope checking so mistakes surface before a program ever runs. 26 reserved keywords cover the entire v1.0 surface — every addition beyond the original 24 (`stop`, then `box`) was made only after the language designer explicitly approved both the capability and the exact keyword.

---

*This is the final v1.0 release, now including Arrays, a Bytecode Generator, a Parithi Virtual Machine, and a Bytecode Optimizer: it is feature-complete and fully verified against the specification. The language designer has explicitly declined modules, exception handling, and OOP for v1.0. Arrays (Lists) shipped in Phase 9 (`box`, MASTER_DOCUMENT.md §28); a Map (key-value) type remains future work. Bytecode generation and execution shipped in Phase 10 and Phase 11 respectively (MASTER_DOCUMENT.md §29, §30) — proven output-identical to the Interpreter. The optimizer pass between them shipped in Phase 12 (MASTER_DOCUMENT.md §31) — proven output-identical to the unoptimized path; loop-aware optimization (loop-invariant code motion, strength reduction) remains future roadmap, per §23.*

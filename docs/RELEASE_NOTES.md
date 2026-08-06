# Parithi v1.0 — Final Release

**Release date:** 2026-08-06
**Compiler package version:** 1.0.0
**Language specification version:** 1.0 (MASTER_DOCUMENT.md)

---

## Summary

Parithi v1.0 is a complete, verified implementation of the language specified in MASTER_DOCUMENT.md: a human-friendly, statically-typed, block-scoped scripting language, delivered as a tree-walking interpreter with a professional CLI. Every keyword, language rule, control-flow construct, built-in function, and documented error code has been individually verified against the specification (see `PHASE8_AUDIT_REPORT.md` for the full Phase 8 audit). Post-audit, the language designer approved one further addition — a `stop [code]` statement (§15.7) — and explicitly declined modules, exception handling, and OOP for this release. A subsequent Phase 8.5 pass prepared the project for public release (packaging, documentation, and repository cleanup only — see `CHANGELOG.md` for the itemized list; no language or behavior changes). **Phase 9** then added Arrays — the `box` keyword, `[...]` indexing/assignment, and seven new built-ins — end-to-end across every layer (see MASTER_DOCUMENT.md §28 and `CHANGELOG.md`). All 454 automated tests pass; no known implementation bugs.

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
- **CLI (`pari`):** `<file.pr>` execution, `--tokens`, `--ast`, `--analyze`, `--runtime` (debug introspection at every pipeline stage), `--version`, `--help`/`-h`, `--verbose` (execution timing). Four distinct exit codes (0 success / 1 compiler error / 2 runtime error / 3 CLI usage error), overridable by the program's own `stop <code>`. "Did you mean...?" suggestions for mistyped flags and filenames.

## Known Limitations (by design, not oversight — see MASTER_DOCUMENT.md §26)

- No Maps/dictionaries — Arrays (Lists) shipped in Phase 9; a key-value collection type remains future work — see `ARRAYS_DESIGN.md` (historical) and MASTER_DOCUMENT.md §28 (current).
- No dedicated list-iteration syntax (`repeat item as x in list`) — arrays are iterated via `repeat n as i` combined with indexing (§28.4).
- No object-oriented programming — no classes, structs, or methods. Explicitly declined for v1.0 by the language designer.
- No modules — every program is a single `.pr` file. Explicitly declined for v1.0 by the language designer.
- No exception handling — any runtime error (P006, P020–P027) terminates the program; there is no `try`/`catch` recovery mechanism. Explicitly declined for v1.0 by the language designer. (A program can still terminate itself deliberately and cleanly via `stop <code>`, which is not exception handling — there is no recovery, just a controlled exit.)
- No string indexing or slicing — `[...]` indexing works only on Arrays; `len()` is String's only introspection.
- No dedicated `else if` keyword — nested `if`/`end if` inside `else` is the documented, supported way to chain conditions.
- No file or system built-ins — Parithi programs interact with the world only through `say`/`ask`.
- Multi-frame call-stack display truncates to the first 2 frames + a count for very deep stacks (matches the documented example format); full N-frame traces are deferred to the future PVM work (§26).

## Future Roadmap (unchanged from MASTER_DOCUMENT.md §23 except item 4, which Phase 9 partially fulfilled)

1. Bytecode Generator (compile the validated AST to `.pbc`)
2. Parithi Virtual Machine (PVM) — a stack-based execution backend, tree-walking interpreter retained via `--interpret`
3. Optimizer pass (constant folding, dead-code elimination, peephole optimization)
4. Collections — **Lists shipped in Phase 9 as Arrays (`box`); a Map (key-value) type remains future work, along with dedicated list-iteration syntax**
5. Object-oriented programming (a `type`-block construct, name TBD) — declined for v1.0
6. Module system (`import`/multi-file programs) — declined for v1.0
7. Native compilation (LLVM or transpile-to-C backend)

Exception handling and a `switch` alternative (surfaced during this audit's language-completion review, `PHASE8_AUDIT_REPORT.md` §11) were also declined for v1.0. The one approved addition from that review, originally proposed as `exit`, shipped as `stop` (§15.7).

## Statistics

| Metric | Value |
|---|---|
| Source files (`src/` + `bin/`) | 48 |
| Source lines of code | 4,949 |
| Test files | 9 |
| Test lines of code | 3,695 |
| Automated tests | 454 (0 failing) |
| Test suites | 91 |
| Documented error codes | 27 (P001–P027) |
| Reserved keywords | 26 (incl. `stop` §15.7, `box` §28) |
| Built-in functions | 13 (6 pre-Phase-9 + 7 array built-ins) |
| Example programs | 11 (all verified against documented output) |

## Architecture Summary

```
Source (.pr) → Lexer → Parser → AST → Semantic Analyzer → Tree-Walking Interpreter → Runtime → Output
```

No bytecode or VM exists in v1.0 — this release executes the validated AST directly. The runtime layer (`src/runtime/`) is a deliberately separable module (explicit `EnvironmentStack`, `CallStack`, boxed `RuntimeValue`s including the Phase 9 `ListValue`, a `BuiltinRegistry`) so a future bytecode compiler/VM can be added without touching the Lexer, Parser, or AST node definitions — the architecture's central bet, per MASTER_DOCUMENT.md §27. Phase 9's array support was built entirely within this existing architecture (new AST nodes, a new static type, a new runtime value class, new built-ins) — it required no changes to that central bet.

## Language Summary

Parithi optimizes for a first-time reader's ability to understand code out loud: readable-word operators alongside symbolic ones, a single consistent block-closing rule (`end <keyword>`), no semicolons or mandatory parentheses, and compile-time type/scope checking so mistakes surface before a program ever runs. 26 reserved keywords cover the entire v1.0 surface — every addition beyond the original 24 (`stop`, then `box`) was made only after the language designer explicitly approved both the capability and the exact keyword.

---

*This is the final v1.0 release, now including Arrays: it is feature-complete and fully verified against the specification. The language designer has explicitly declined modules, exception handling, and OOP for v1.0. Arrays (Lists) shipped in Phase 9 (`box`, MASTER_DOCUMENT.md §28); a Map (key-value) type remains future work. Bytecode/VM work remains future roadmap, per §23.*

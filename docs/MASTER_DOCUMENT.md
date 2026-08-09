# Parithi Programming Language
## Master Document — Version 1.0

**Document Type:** Language & Implementation Specification
**Project Name:** Parithi
**Tagline:** A Human-Friendly Programming Language Designed for Readability and Simplicity
**Target Runtime:** Node.js (JavaScript)
**Status:** v1.0 — stable release, now including Arrays, a Bytecode Generator, a Parithi Virtual Machine, a Bytecode Optimizer, (partially) a Standard Library, and (as a genuine but minimal foundation) a Native Compiler. Implementation complete and fully verified against this specification (see `docs/PHASE8_AUDIT_REPORT.md`), followed by a Phase 8.5 release-readiness pass (packaging/documentation only — see `CHANGELOG.md`), a Phase 9 language addition (`box` arrays, [§28](#28-arrays-phase-9) — the first language-surface change since the Phase 8 audit), a Phase 10 new backend ([§29](#29-bytecode-phase-10) — AST → Parithi Bytecode `.pbc`), a Phase 11 second execution engine ([§30](#30-parithi-virtual-machine-phase-11) — the PVM executes that bytecode directly; the Tree-Walking Interpreter is untouched and remains the default), a Phase 12 optimization pipeline ([§31](#31-bytecode-optimizer-phase-12) — an additive post-processing stage between the Generator and the Validator/PVM that shrinks a program's bytecode without changing what it does), a Phase 13 Standard Library ([§32](#32-standard-library-phase-13) — in progress; sub-phase 13a shipped: Math/String/Array/Type/System, ~45 new built-ins, all additive; File/JSON/DateTime/HTTP remain in later sub-phases), and a Phase 13 Native Compiler ([§33](#33-native-compiler-phase-13-x86-64-backend) — a **third** execution backend, AST → a real three-address-code IR + 6-pass IR Optimizer ([§33.15](#3315-what-is-ir-and-why-parithi-uses-one) onward) → hand-written x86-64 machine code → a real, standalone Windows PE `.exe`; compiles `say`/`hold`/`const`/assignment built from compile-time-constant-foldable literals, variables, arithmetic, comparisons, and unary operators (expanded in Phase 17, [§37](#37-native-backend-recovery--feature-expansion-phase-17)), proven by actually executing generated `.exe` files — see §33.9 for the honest supported/unsupported boundary), and a Phase 14 Adaptive Execution Engine ([§34](#34-adaptive-execution-engine-phase-14) — a bare `pari <file.pr>` now automatically selects the best of the three coexisting backends via static capability analysis, never trial execution; `--backend <name>` forces one explicitly with no silent fallback, and `--explain-backend` reports the analysis without running the program), and a Phase 15 Production Readiness Audit ([§35](#35-production-readiness-audit-phase-15) — every keyword, backend, Standard Library built-in, and CLI command verified by actually running it; six real bugs found and fixed, including a new `P031` parser recursion guard, all with regression tests; a real `npm pack` extracted and run in a clean directory with zero access to this repository), and a Phase 16 Unified Loop Model ([§36](#36-unified-loop-model-phase-16) — a new, unconditional `loop` construct plus `break <expression>`, extending `while`/`repeat`/`loop` alike to optionally produce a value, usable in expression position; purely additive — every pre-existing `while`/`repeat`/`break`/`continue` program is unaffected, and the native backend's capability boundary does not move), and a Phase 17 Native Backend Recovery & Feature Expansion ([§37](#37-native-backend-recovery--feature-expansion-phase-17) — a fresh, evidence-based audit found no reproducible defect in the native backend's existing scope, then genuinely expanded real x86-64 codegen to compile-time-constant variables, arithmetic, comparisons, and unary operators using the IR Optimizer's existing folding/propagation passes, catching and cleanly fixing two real edge cases — division/modulo by a divisor that folds to zero, and self-referencing reassignment — along the way). All backends are proven — not just asserted — to produce identical output for identical programs (§30.11, §31.10, §32.12, §33.8, §34.7, §35.4, §36.6, §37.4).
**Document Owner:** Language Architecture Team
**Last Updated:** 2026-08-07

---

## How to Read This Document

This is the single source of truth for Parithi v1.0. It covers the language design, the compiler/interpreter architecture, the exact syntax rules, and the engineering plan for building it. It is written so that a developer with no prior context can pick this document up and build Parithi end-to-end, or extend it later without breaking existing programs.

Sections are ordered roughly the way you'd build the project: philosophy and rules first, then architecture, then language reference, then engineering plan (phases, roadmap, testing).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Design Corrections Applied to the Original Plan](#2-design-corrections-applied-to-the-original-plan)
3. [Vision and Goals](#3-vision-and-goals)
4. [Problem Statement](#4-problem-statement)
5. [Objectives](#5-objectives)
6. [Language Philosophy](#6-language-philosophy)
7. [Key Features](#7-key-features)
8. [Architecture Diagram](#8-architecture-diagram)
9. [Compiler Pipeline](#9-compiler-pipeline)
10. [Project Folder Structure](#10-project-folder-structure)
11. [Language Rules and Syntax](#11-language-rules-and-syntax)
12. [Keywords and Data Types](#12-keywords-and-data-types)
13. [Operators](#13-operators)
14. [Variables, Constants, Scope, and Type System](#14-variables-constants-scope-and-type-system)
15. [Control Flow](#15-control-flow)
16. [Functions and Built-in Functions](#16-functions-and-built-in-functions)
17. [Runtime Architecture](#17-runtime-architecture)
18. [Error Handling and Error Codes](#18-error-handling-and-error-codes)
19. [CLI Commands](#19-cli-commands)
20. [Example Programs](#20-example-programs)
21. [Technology Stack](#21-technology-stack)
22. [Development Phases (Phase 0–10)](#22-development-phases-phase-010)
23. [Future Roadmap](#23-future-roadmap)
24. [Testing Strategy](#24-testing-strategy)
25. [Project Directory Structure Reference](#25-project-directory-structure-reference)
26. [Future Enhancements](#26-future-enhancements)
27. [Conclusion](#27-conclusion)
28. [Arrays (Phase 9)](#28-arrays-phase-9)
29. [Bytecode (Phase 10)](#29-bytecode-phase-10)
30. [Parithi Virtual Machine (Phase 11)](#30-parithi-virtual-machine-phase-11)
31. [Bytecode Optimizer (Phase 12)](#31-bytecode-optimizer-phase-12)

---

## 1. Project Overview

Parithi is a beginner-friendly, general-purpose programming language whose design goal is **readability first**. Where most languages optimize for terseness or power, Parithi optimizes for the experience of a first-time learner reading code out loud and understanding it without training. It borrows the "say what you mean" spirit of languages like Python and AppleScript, but keeps a small, fixed grammar so that tooling (parser, error messages, IDE support) can stay simple and predictable.

Parithi v1.0 is a **tree-walking interpreter** implemented in JavaScript/Node.js. The pipeline is:

```
Source (.pr) → Lexer → Parser → AST → Semantic Analyzer → Interpreter → Runtime → Output
```

The Tree-Walking Interpreter still parses a program into an AST and *executes* it directly by walking that tree — it never involves bytecode, and it remains the default (`pari <file.pr>`). This kept the v1.0 implementation small, debuggable, and fast to build, while the architecture was deliberately modular so a bytecode compiler and VM could be added later without changing the language surface — a bet that has since fully paid off: a **Bytecode Generator** (Phase 10) compiles the same validated AST to Parithi Bytecode (`.pbc`, via `--bytecode`/`--compile`), and a **Parithi Virtual Machine** (Phase 11, "PVM") executes it directly (`pari <file.pbc>`/`--run-bytecode`) — both wholly separate, additive backends that changed zero lines in the Lexer, Parser, AST, Semantic Analyzer, or Interpreter (§29, §30). The two backends are proven, not just asserted, to produce identical output for identical programs (§30.11); `pari <file.pr>` is still the Interpreter, unconditionally, until a future decision (§23 item 2) changes the default.

Parithi ships as a Node.js CLI (`pari`) that runs `.pr` source files directly, with debug flags to inspect the token stream, AST, and (as of Phase 10) the generated bytecode.

---

## 2. Design Corrections Applied to the Original Plan

You asked for a review of the original plan for mistakes before turning it into a master document. Here is exactly what was found and how it was resolved. Everything below is reflected in the rest of this document — this section exists so you can see the diff against your original notes.

| # | Issue Found in Original Plan | Problem | Correction Applied |
|---|---|---|---|
| 1 | Scope example defines `task demo()` but never calls it, yet shows output `10` then `20` | The function body would never execute, so the real output would only be `20`. As written, the example is not runnable and would confuse a learner. | Rewrote the example to call `demo()` explicitly before the outer `say age`, so the printed output genuinely matches what the interpreter produces. See [§14.3](#143-scope-rules). |
| 2 | Comparison words `is`, `is not`, `is more than`, `is less than`, `is at least`, `is at most` are used as operators but **not included** in the 20 reserved keywords | A lexer cannot special-case a word as an operator unless it's reserved (or handled via explicit multi-word contextual lexing). As written, `is` would be lexed as a plain, undeclared identifier. | Reserved `is` as keyword #21, and specified that `not`, `more`, `than`, `less`, `at`, `least`, `most` are recognized **only in operator position** immediately following a comparable expression, via a dedicated lexer lookahead rule (see [§13.4](#134-readable-comparison-operators-multi-word-lexing)). This keeps the keyword list small while making the multi-word operators lexer-legal. |
| 3 | Operator precedence table lists `**`, `*`, `/`, `%`, `+`, `-` as a flat descending list with no associativity notes, and never places unary minus (`-x`) or logical `not` in the numeric precedence chain | Without associativity, `2 ** 3 ** 2` and `10 - 3 - 2` are ambiguous to implement consistently. Unary minus was entirely unaddressed — is `-5 + 3` valid? | Fully specified precedence table with associativity per level, and added an explicit **Unary** tier for `-x` (numeric negation) and `not x` (logical negation). See [§13.5](#135-full-operator-precedence-table). |
| 4 | `repeat 5 as i` introduces a counter but never states the starting value or whether it's inclusive | A learner (and an implementer) can't know if `i` starts at `0` or `1`, or whether the loop runs 5 or 6 times. | Specified: counter starts at **1** and is inclusive of the repeat count (`repeat 5 as i` yields `i = 1, 2, 3, 4, 5`). See [§15.3](#153-repeat-loop). |
| 5 | `random()` and `round()` built-ins are named with no signature | Can't implement or document a function whose arguments and return range are undefined. | Specified `random()` → decimal in `[0, 1)`, `random(min, max)` → integer in `[min, max]` inclusive; `round(x)` → nearest integer, `round(x, digits)` → decimal rounded to `digits` places. See [§16.5](#165-built-in-function-reference). |
| 6 | `+` operator behavior on strings is unstated | `say "Hello", name` uses comma-joining, but it's unclear if `"Hello " + name` is legal, and if so, whether mixing Number and String silently coerces (which would contradict the strict static-typing philosophy). | Specified `+` performs **string concatenation only when both operands are String**; mixing String and Number under `+` is a compile-time `P002` type error, forcing explicit `text()`/`number()` conversion. This keeps behavior consistent with "strong compile-time error checking." See [§13.6](#136-the--operator-on-strings). |
| 7 | `ask()` return type unstated | If `ask()` could return Number when the input looks numeric, type inference at the call site becomes non-deterministic (same code, different perceived type depending on user input). | Specified `ask()` **always returns String**, full stop. Numeric input must be converted explicitly with `number()`. This preserves static type inference (the type is knowable from the source alone, not user input). See [§16.1](#161-input). |
| 8 | No data structures (arrays/lists/objects) are mentioned anywhere, but nothing says they're intentionally excluded | Ambiguous whether this is an oversight or a deliberate v1.0 scope boundary — matters a lot for anyone estimating the build. | Explicitly documented as **out of scope for v1.0**, deferred to v2 alongside collections and OOP. See [§26](#26-future-enhancements) and [§23](#23-future-roadmap). |
| 9 | Function return value when a `task` has no `return` statement is unstated | `hold result = doSomething()` needs a defined value if `doSomething` never returns. | Specified: a `task` with no executed `return` statement implicitly returns `empty`. See [§16.4](#164-return-values). |
| 10 | Keyword count check | Original list claimed "20 keywords" — verified: `hold, const, if, else, end, repeat, while, as, break, continue, task, return, say, ask, true, false, empty, and, or, not` = 20 exactly. Confirmed correct, no change. Adding `is` (see #2) brings v1.0's true reserved-word count to **21**; the "20 core keywords" framing is kept for the original list, with `is` documented as an added operator keyword. | No structural change; documented precisely in [§12.1](#121-reserved-keywords). |
| 11 | `end` blocks are written as `end if`, `end task`, `end repeat`, `end while` but the grammar for this wasn't stated | Implementers need to know `end` is a single keyword token, and `if`/`task`/`repeat`/`while` immediately following it are ordinary keyword tokens reused as a "block tag," not a new compound token. | Documented explicitly as a parser rule: `end <block-keyword>` where `<block-keyword>` must match the keyword that opened the current block, else `P003 Invalid block ending`. See [§11.4](#114-block-termination-rule). |

### 2.1 Addendum — `choose` / `option` / `other` (Switch Statement)

Added after the initial draft, at your request, as a v1.0 feature rather than a future-roadmap item — it's a genuinely cheap addition (one new AST node, no new runtime concepts) compared to OOP or modules, which correctly stay deferred (see [§26](#26-future-enhancements)). Integrating it required settling a few points the request didn't specify; these follow the same "decide it now, in writing" approach as the corrections above:

| # | Decision | Why |
|---|---|---|
| 1 | No fall-through — exactly one clause runs per `choose` | Matches "no unnecessary symbols / minimal keywords": avoids needing a per-case `break` convention entirely, unlike C-style `switch` |
| 2 | `other` is optional | If omitted and nothing matches, the block does nothing — consistent with `if` having no mandatory `else` |
| 3 | Each `option` literal's type must match the statically-inferred type of the `choose` expression | Keeps this consistent with the rest of the static type system ([§14.4](#144-static-type-system)); a mismatch raises the existing `P002` |
| 4 | Duplicate `option` values in the same `choose` are a compile-time error | An unreachable duplicate branch is almost always a bug, and "strong compile-time error checking" is a stated design pillar — new code `P007` (see [§18](#18-error-handling-and-error-codes)) |
| 5 | `break` / `continue` inside a `choose` act on the nearest enclosing loop, not the `choose` itself | `choose` has no fall-through to guard against, so it never needed loop-control semantics of its own; without this rule, `break` inside a `choose` nested in a `while` would be ambiguous |
| 6 | Exactly one literal per `option` in v1.0 (no `option 1, 2`) | Keeps the v1.0 grammar minimal; grouped values are a natural, non-breaking future addition (see [§26](#26-future-enhancements)) |

Full syntax and semantics are specified in [§15.2](#152-choose-switch-statement).

---

## 3. Vision and Goals

**Vision:** Make writing your first working program feel like writing a sentence, without sacrificing the discipline (static typing, clear errors, block scope) that keeps programs correct as they grow.

**Primary goals for v1.0:**

- Deliver a **complete, working language**: a learner can write real programs (calculators, guessing games, grade calculators, text utilities) using only v1.0 features.
- Prove the **architecture is future-proof**: the same `.pr` syntax should run unmodified on a future bytecode VM.
- Keep the **implementation small enough to teach**: the reference implementation should be readable by the same audience the language targets, once they grow into compiler-curious developers.
- Produce **error messages that teach**, not just report — every compiler error names the problem, the location, and (where possible) the fix.

---

## 4. Problem Statement

Most "beginner" languages are beginner-friendly right up until the moment a learner hits real programming concepts — scope, types, functions — at which point they either:

1. Fall back on a fully dynamic, untyped model that defers all mistakes to runtime (harder to debug, no compile-time safety), or
2. Import the full syntax weight of a systems language (curly braces, semicolons, explicit type annotations, symbolic operators) that a first-time reader can't parse visually.

Parithi's problem statement: **there is no small, block-scoped, statically-inferred language whose surface syntax reads like structured English**, suitable both as a first teaching language and as a testbed for learning how compilers/interpreters are actually built. Parithi v1.0 exists to fill that gap, and to do so with genuine engineering rigor (a real lexer/parser/AST/semantic pass), not a toy pattern-matcher over lines of text.

---

## 5. Objectives

| # | Objective | Measure of Success |
|---|---|---|
| 1 | Full lexer supporting all token types, including multi-word operators | 100% of tokens in [§12](#12-keywords-and-data-types)/[§13](#13-operators) tokenize correctly, verified by `pari --tokens` |
| 2 | Recursive-descent parser producing a complete AST | `pari --ast` renders a correct tree for every construct in this document |
| 3 | Semantic analyzer enforcing static type inference and scope rules | All error codes P001–P006 are triggered by their documented example and no others |
| 4 | Tree-walking interpreter executing the full feature set | All example programs in [§20](#20-example-programs) run and produce the documented output |
| 5 | CLI with debug tooling | `pari file.pr`, `--tokens`, `--ast`, `--version`, `--help` all function |
| 6 | Modular architecture | Interpreter can be swapped for a future bytecode compiler/VM without touching Lexer, Parser, or AST node definitions |
| 7 | Test coverage | ≥90% line coverage on Lexer/Parser/Semantic Analyzer; golden-file tests for every example program |

---

## 6. Language Philosophy

- **Human-friendly syntax** — code should be readable by someone who has never programmed before.
- **Minimal keywords** — 25 reserved words total (see [§12.1](#121-reserved-keywords) for the full list and how it grew from the original count); no more added without strong justification.
- **Easy to read** — statements read left-to-right like English clauses.
- **Easy to learn** — no symbol soup; every symbolic operator has a readable-word equivalent where it matters most (comparisons).
- **Strong compile-time error checking** — type errors, undeclared variables, and malformed blocks are caught before execution, not mid-run.
- **Static type inference** — types are derived once, from the first assignment, and never silently change.
- **Block scope** — every `task`, `if`, `repeat`, and `while` body is its own scope.
- **No unnecessary symbols** — no semicolons, no mandatory parentheses around conditions, no braces.
- **Clear compiler error messages** — every error has a stable code, a plain-English description, and (from v1.0 onward) a source location.
- **Consistent syntax** — one way to close a block (`end <keyword>`), one way to declare a variable (`hold`), one way to declare a constant (`const`).

---

## 7. Key Features

- Variables (`hold`) and constants (`const`)
- Six built-in data types: Number, Decimal, String, Boolean, Empty, Array
- Arrays (`box`), with indexing, mutation, and a small standard set of operations — see [§28](#28-arrays-phase-9)
- A Bytecode Generator (AST → Parithi Bytecode `.pbc`), alongside the Tree-Walking Interpreter — see [§29](#29-bytecode-phase-10)
- A Parithi Virtual Machine (PVM) that executes that bytecode directly, as a second, independent execution engine — see [§30](#30-parithi-virtual-machine-phase-11)
- A Bytecode Optimizer — 8 passes (constant folding/propagation, dead-code/jump/peephole/stack/constant-pool optimization, and a final jump-target repair) running between the Generator and the Validator/PVM, reached via `--optimize`/`--stats`/`--disassemble` or combined with `--compile`/`--run-bytecode` — see [§31](#31-bytecode-optimizer-phase-12)
- Arithmetic operators, including exponentiation (`**`)
- Symbolic **and** readable-word comparison operators
- Logical operators as words only (`and`, `or`, `not`)
- User input (`ask`) and output (`say`, including multi-value output)
- `if` / `else` conditionals
- Multi-way `choose` / `option` / `other` switch statement, with no fall-through
- Counted `repeat` loops, with or without an index variable
- Condition-based `while` loops
- `break` / `continue` loop control
- Functions (`task`) with parameters and `return` values, including recursion
- Built-in function library: math, type conversion/inspection, text, arrays
- Static type inference with compile-time type-mismatch detection
- Block scoping with proper shadowing
- Single-line comments (`#`)
- A CLI (`pari`) with token/AST introspection for debugging and teaching

---

## 8. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                              pari CLI                                │
│   pari file.pr   pari --tokens file.pr   pari --ast file.pr          │
└───────────────────────────────┬────────────────────────────────────--┘
                                 │ reads source text
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LEXER  (src/lexer)                                                   │
│  Source text ──▶ Token stream                                        │
│  Handles: keywords, identifiers, numbers, decimals, strings,          │
│  operators (symbolic + multi-word), comments (stripped), whitespace   │
└───────────────────────────────┬────────────────────────────────────--┘
                                 │ Token[]
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PARSER  (src/parser)                                                 │
│  Recursive-descent, precedence-climbing expression parser             │
│  Token stream ──▶ Abstract Syntax Tree (AST)                          │
└───────────────────────────────┬────────────────────────────────────--┘
                                 │ AST (Program node)
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  SEMANTIC ANALYZER  (src/semantic)                                    │
│  Walks AST before execution:                                          │
│   • builds symbol tables per scope                                    │
│   • checks variable declaration (P001)                                │
│   • infers & checks static types (P002)                               │
│   • validates block termination (P003)                                │
│   • rejects reserved-keyword identifiers (P004)                       │
│   • rejects constant reassignment (P005)                              │
│  Produces: a validated, annotated AST — or a list of compile errors   │
└───────────────────────────────┬────────────────────────────────────--┘
                                 │ annotated AST (only if error-free)
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  TREE-WALKING INTERPRETER  (src/interpreter)                          │
│  Recursively evaluates AST nodes against the Runtime Environment       │
│  Handles: control flow, function calls/returns, built-ins,            │
│  runtime conversion errors (P006)                                     │
└───────────────────────────────┬────────────────────────────────────--┘
                                 │ reads/writes
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  RUNTIME ENVIRONMENT  (src/runtime)                                   │
│  • Global scope        • Local scopes (linked to parent)              │
│  • Call stack          • Built-in function registry                   │
└───────────────────────────────┬────────────────────────────────────--┘
                                 │
                                 ▼
                          Program Output (stdout)
```

---

## 9. Compiler Pipeline

```
Source (.pr)
   │
   ▼
Lexer                → tokenizes raw text into a flat list of typed tokens
   │
   ▼
Parser               → consumes tokens, builds a tree of statement/expression nodes
   │
   ▼
Abstract Syntax Tree → in-memory structural representation of the whole program
   │
   ▼
Semantic Analyzer    → static checks: scope, types, keyword misuse, block integrity
   │
   ├──────────────────────────────────┐
   ▼                                  ▼
Tree-Walking Interpreter          Bytecode Generator (Phase 10, §29)
   │  executes the validated AST      │  translates the SAME validated AST
   │  directly, node by node          │  into Parithi Bytecode (.pbc)
   ▼                                  ▼
Runtime                           Bytecode Optimizer (Phase 12, §31, optional)
   │  holds live state (variables,       │  8 passes, only when --optimize is
   │  call stack) while executing         │  requested; shrinks the SAME
   ▼                                       │  program without changing behavior
   │                                       ▼
   │                                  Parithi Bytecode (.pbc)
   │                                       │
   │                                       ▼
   │                                  Parithi Virtual Machine (PVM, Phase 11, §30)
   └───────────────┬───────────────────────┘
                    ▼
Output → say/ask interact with stdout/stdin
```

Both backends consume the identical output of the Semantic Analyzer —
neither one changes what "a valid Parithi program" means. `pari <file.pr>`
(no flag) always takes the left (Interpreter) path; `pari <file.pbc>` /
`--run-bytecode` takes the right one — Bytecode Generator, optionally the
Optimizer (Phase 12, only with `--optimize`), then the PVM actually
executing it (Phase 11; `--bytecode`/`--compile` still just generate a
listing/file without executing, exactly as Phase 10 left them). All three
paths (Interpreter, unoptimized PVM, optimized PVM) are proven to produce
identical output — see §30.11, §31.10.

### 9.1 Lexer

Converts the raw `.pr` source into a sequence of tokens: `KEYWORD`, `IDENTIFIER`, `NUMBER`, `DECIMAL`, `STRING`, `OPERATOR`, `PUNCTUATION`, `NEWLINE`, `EOF`. Comments (`# ...`) are discarded at this stage. The lexer is also responsible for the multi-word operator lookahead described in [§13.4](#134-readable-comparison-operators-multi-word-lexing), since word-boundary decisions belong here, not in the parser.

### 9.2 Parser

A recursive-descent parser with a precedence-climbing (Pratt-style) expression parser for arithmetic/comparison/logical expressions. Produces AST nodes such as `VariableDeclaration`, `ConstantDeclaration`, `Assignment`, `IfStatement`, `ChooseStatement`, `OptionClause`, `OtherClause`, `RepeatStatement`, `WhileStatement`, `TaskDeclaration`, `ReturnStatement`, `SayStatement`, `BinaryExpression`, `UnaryExpression`, `CallExpression`, `Identifier`, `Literal`.

### 9.3 Abstract Syntax Tree (AST)

A plain JSON-serializable tree (this is what `pari --ast` prints). Every node carries a `type`, a `line`, and `type`-specific fields. Example for `hold age = 20`:

```json
{
  "type": "VariableDeclaration",
  "name": "age",
  "value": { "type": "NumberLiteral", "value": 20, "line": 1 },
  "line": 1
}
```

### 9.4 Semantic Analyzer

Walks the AST once, before any execution, maintaining a stack of symbol tables (one per scope). For each node it: confirms variables are declared before use (P001), infers and checks types on assignment (P002), confirms every block-opening keyword has a matching, correctly-named `end` (P003), rejects use of reserved words as identifiers (P004), and rejects reassignment to `const` bindings (P005). Only P006 (runtime conversion error) cannot be caught here, since it depends on runtime values (e.g., `number(ask(...))` where the user typed non-numeric text).

### 9.5 Tree-Walking Interpreter

Executes the annotated AST directly via a `evaluate(node, environment)` dispatch over node type — no bytecode is involved in this path, and none ever has been; this remains the default, primary way every Parithi program actually runs (`pari <file.pr>`, no flag). This is the defining trait of a tree-walking interpreter, and precisely why the Phase 10 Bytecode Generator (§9.7) could be added as a wholly separate, additive backend rather than a modification of this one — it consumes the same AST but was built without touching a single line here.

### 9.6 Runtime Environment

See [§17](#17-runtime-architecture) for full detail on scope chaining, the call stack, and the built-in registry.

### 9.7 Bytecode Generator (Phase 10)

An alternative backend, reached only via `--bytecode`/`--compile`, that translates the same validated AST into Parithi Bytecode instead of executing it. Full detail — instruction set, calling convention, file formats — is in [§29](#29-bytecode-phase-10).

### 9.8 Parithi Virtual Machine (Phase 11)

Executes the bytecode §9.7 generates — reached via `pari <file.pbc>` or `--run-bytecode` — as a second, independent execution engine alongside §9.5's Interpreter. Never walks the AST; operates purely on the flat instruction list. Full detail — memory model, opcode execution reference, error handling — is in [§30](#30-parithi-virtual-machine-phase-11).

### 9.9 Bytecode Optimizer (Phase 12)

An optional post-processing stage between §9.7's Generator and §9.8's PVM, reached via `--optimize`/`--stats`/`--disassemble`, or combined with `--compile`/`--run-bytecode`/`--bytecode`. Takes the exact same program shape the Generator produces and returns a smaller (or identical, if nothing was foldable) one computing the identical result — never invoked unless explicitly requested, so plain `pari <file.pr>`/`pari <file.pbc>` are completely unaffected by this phase's existence. Full detail — the 8 passes, the validation guarantee, CLI integration — is in [§31](#31-bytecode-optimizer-phase-12).

---

## 10. Project Folder Structure

```
parithi/
├── bin/
│   └── pari.js                  # CLI entry point (shebang, arg parsing)
├── src/
│   ├── lexer/
│   │   ├── lexer.js             # Phase 1 — implemented
│   │   ├── token.js             # Token class + TokenType vocabulary
│   │   └── keywords.js          # reserved keyword table (26 words)
│   ├── ast/
│   │   ├── ast-nodes.js         # NodeType vocabulary
│   │   ├── ast-builder.js       # factory functions for every AST node
│   │   └── ast-printer.js       # formatAST() — readable tree for `pari --ast`
│   ├── parser/
│   │   ├── parser.js            # Phase 2 — implemented (recursive descent)
│   │   ├── token-stream.js      # cursor over the token array
│   │   ├── parse-context.js     # file path + SourceLocation helper
│   │   └── parse-error.js       # ParseError, MultiParseError
│   ├── semantic/
│   │   ├── analyzer.js          # Phase 3 — implemented (statement/scope visitor)
│   │   ├── symbol-table.js      # one scope's declared names (declare/resolve/hasOwn)
│   │   ├── scope-manager.js     # tracks current scope, enter()/exit()
│   │   ├── type-checker.js      # static type inference over expressions
│   │   ├── types.js             # DataType enum, typesCompatible(), builtin signatures
│   │   └── semantic-error.js    # SemanticError (P001/P002/P004/P005/P007/P014-P019)
│   ├── interpreter/
│   │   ├── interpreter.js       # Phases 4 & 6 — delegates to Runtime/ExecutionContext
│   │   ├── signals.js           # BreakSignal, ContinueSignal, ReturnSignal, StopSignal (§15.7)
│   │   ├── stringify.js         # canonical value-to-text rendering (say/text()/ask prompt)
│   │   ├── stdin.js             # synchronous readLineSync() for ask()
│   │   └── builtins/
│   │       ├── index.js         # callBuiltin() — backed by runtime/builtin-registry.js
│   │       ├── math.js          # round, random
│   │       ├── type.js          # number, text, type
│   │       ├── text.js          # len (String or Array, since Phase 9)
│   │       └── array.js         # push/pop/insert/remove/sort/reverse/contains + shared index/homogeneity validation (Phase 9, §28)
│   ├── runtime/                 # Phase 6
│   │   ├── environment.js       # scope chain, now storing RuntimeValue-wrapped bindings
│   │   ├── environment-stack.js # EnvironmentStack — push/pop/current/parent/resolve/declare/assign + leak-proof truncateTo()
│   │   ├── call-stack.js        # CallStack — enriched frames {name, params, args, environment, closureEnv, location}
│   │   ├── runtime.js           # Runtime facade — owns globalEnvironment + EnvironmentStack + CallStack
│   │   ├── execution-context.js # ExecutionContext — loopDepth, currentFunction, currentNode
│   │   ├── runtime-value.js     # NumberValue/DecimalValue/StringValue/BooleanValue/EmptyValue/ListValue + wrap()/unwrap()/deepEquals() (ListValue added Phase 9)
│   │   └── builtin-registry.js  # BuiltinRegistry class (reusable registration mechanism)
│   ├── errors/
│   │   ├── error-codes.js       # P001–P027 registry
│   │   ├── source-location.js   # shared file/line/column value
│   │   ├── compiler-error.js    # base class for P001-P005, P007, P025, P026
│   │   ├── runtime-error.js     # base class for P006, P020-P027 (+ defensive reuse of P001/P002/P005/P017-P019/P025/P026)
│   │   └── index.js             # barrel export
│   ├── utils/
│   │   ├── logger.js            # error output (the only method any call site actually uses — trimmed Phase 8.5)
│   │   ├── colors.js            # zero-dependency ANSI colors
│   │   └── messages.js          # formats CompilerError/ParithiRuntimeError for terminal
│   ├── cli/                     # Phase 7 — professional CLI
│   │   ├── args.js              # argv → { mode, file, verbose } — throws CliUsageError on bad input
│   │   ├── commands.js          # dispatch: run / --tokens / --ast / --analyze / --runtime / --bytecode / --compile / --version / --help
│   │   ├── cli-error.js         # CliUsageError — bad flag/file, distinct from CompilerError/ParithiRuntimeError
│   │   ├── exit-codes.js        # ExitCode — the 0/1/2/3 table (§19.1)
│   │   ├── version-info.js      # language/compiler/Node/build-date/platform, read from package.json
│   │   ├── suggestions.js       # Levenshtein "did you mean" for flags and filenames (§19.2)
│   │   └── screens.js           # buildHelpText()/buildVersionText() — pure, testable display strings
│   ├── bytecode/                # Phase 10 — AST → Parithi Bytecode (.pbc), §29
│   │   ├── opcode.js            # Opcode enum, OPCODE_INFO (arity + stack effect), OPCODE_LIST/OPCODE_ID (binary format)
│   │   ├── instruction.js       # Instruction — {opcode, operands, line, column}
│   │   ├── constant-pool.js     # ConstantPool — deduplicated (type, value) table
│   │   ├── label.js             # Label — symbolic jump target, resolved to a concrete index once
│   │   ├── bytecode-builder.js  # BytecodeBuilder — instruction list + constant pool + labels + function table + resolve()
│   │   ├── bytecode-generator.js # BytecodeGenerator — AST walk -> instructions; compile-time slot mangling (§29.2)
│   │   ├── validator.js         # validateBytecode() — constant/jump/argCount/stack-balance checks (§29.6)
│   │   ├── bytecode-writer.js   # formatBytecodeText(), writeBytecodeBinary()/readBytecodeBinary() — .pbc format (§29.7)
│   │   └── index.js             # barrel export
│   ├── vm/                      # Phase 11 — executes Parithi Bytecode, §30
│   │   ├── virtual-machine.js   # VirtualMachine — the dispatch loop + top-level state (§30.1)
│   │   ├── instruction-dispatcher.js # one handler per opcode (§30.5)
│   │   ├── frame.js             # Frame — locals + lexicalParent/callerFrame split (§30.3)
│   │   ├── stack.js             # OperandStack — the shared operand stack (§30.4)
│   │   ├── heap.js              # Heap — allocation bookkeeping for arrays (§30.4)
│   │   ├── memory.js            # Memory — owns the global Frame + Heap (§30.4)
│   │   ├── loader.js            # loadFromFile() (.pbc) / compileFromSource() (.pr, in memory) (§30.7)
│   │   ├── builtins.js          # thin re-export of interpreter/builtins/index.js (§30.2)
│   │   ├── runtime-values.js    # thin re-export of runtime/runtime-value.js + stringify.js (§30.2)
│   │   ├── vm-errors.js         # every VM error, as a ParithiRuntimeError (§30.6)
│   │   ├── debugger.js          # read-only introspection — future-ready (§30.10)
│   │   └── index.js             # barrel export
│   └── optimizer/                # Phase 12 — optional bytecode post-processing, §31
│       ├── optimizer.js         # optimizeBytecode() — the entry point; sweeps Passes 1-8 to convergence (§31.9)
│       ├── pass-manager.js      # PassManager — runs one ordered sweep, re-validating after every pass (§31.9)
│       ├── optimizer-error.js   # OptimizerError — thrown, never silently swallowed, on invalid pass output
│       ├── program-utils.js     # shared index-remapping helpers every deleting pass uses (§31.2)
│       ├── statistics.js        # computeStatistics() — before/after/removed counts (§31.8, Pass 9)
│       ├── optimizer-report.js  # formatOptimizerReport() — the `--stats` text (§31.8, Pass 9)
│       ├── passes/
│       │   ├── constant-folding.js            # Pass 1 (§31.3)
│       │   ├── constant-propagation.js        # Pass 2 (§31.3)
│       │   ├── dead-code-elimination.js       # Pass 3 (§31.3)
│       │   ├── jump-optimization.js           # Pass 4 (§31.3)
│       │   ├── peephole-optimization.js       # Pass 5 (§31.3)
│       │   ├── stack-optimization.js          # Pass 6 (§31.3)
│       │   ├── constant-pool-optimization.js  # Pass 7 (§31.3)
│       │   └── label-cleanup.js               # Pass 8 (§31.3)
│       └── index.js             # barrel export
├── examples/
│   ├── hello.pr
│   ├── variables.pr
│   ├── ifelse.pr                # if/else + choose/option/other
│   ├── loops.pr                 # repeat/while/break/continue
│   ├── functions.pr
│   ├── calculator.pr            # §20.2 — added Phase 8, verified against documented output
│   ├── fizzbuzz.pr              # §20.3 — added Phase 8, verified against documented output
│   ├── grade-checker.pr         # §20.4 — added Phase 8, verified against documented output
│   ├── while-break-continue.pr  # §20.5 — added Phase 8, verified against documented output
│   ├── stop.pr                  # §15.7 — the "stop" statement, added Phase 8
│   └── arrays.pr                 # §28 — box(...), indexing, and every array built-in, added Phase 9
├── tests/
│   ├── foundation.test.js       # Phase 0: error framework, keywords, CLI args
│   ├── lexer.test.js            # Phase 1: full token coverage
│   ├── parser.test.js           # Phase 2: every statement/expression rule + error recovery
│   ├── semantic.test.js         # Phase 3: declarations, scope, types, functions, control flow
│   ├── interpreter.test.js      # Phase 4: execution, control flow, functions/recursion, runtime errors
│   ├── e2e.test.js              # Phase 5: runs the real examples/*.pr files through the full pipeline
│   ├── error-messages.test.js   # Phase 5: every error class/stage carries code+message+location+hint
│   ├── runtime.test.js          # Phase 6: RuntimeValue, EnvironmentStack, Runtime, ExecutionContext, BuiltinRegistry, leak-proofing, stress tests
│   ├── cli.test.js              # Phase 7: spawns the real `pari` binary — exit codes, file handling, suggestions (+ Phase 10: --bytecode/--compile; + Phase 11: .pbc/--run-bytecode)
│   ├── bytecode.test.js         # Phase 10: Generator, Validator, and text/binary writer round-trip fidelity
│   ├── vm.test.js               # Phase 11: every opcode, runtime object, recursion, arrays, stack overflow, invalid/corrupted bytecode
│   ├── vm-parity.test.js        # Phase 11: Interpreter vs. PVM — identical output/exit/error codes, every construct + all real examples
│   └── fixtures/                # Phase 7: CLI test fixtures (e.g. a filename containing spaces)
├── docs/
│   ├── MASTER_DOCUMENT.md          # this file
│   ├── ARRAYS_DESIGN.md            # collections design proposal (not yet implemented)
│   ├── PHASE8_AUDIT_REPORT.md      # full-specification audit record (historical, package 0.1.0)
│   ├── RELEASE_NOTES.md            # detailed narrative release notes
│   └── RELEASE_VERIFICATION_REPORT.md  # Phase 8.5 release-readiness verification
├── package.json
├── .gitignore
├── LICENSE
├── CHANGELOG.md
├── CONTRIBUTING.md
└── README.md
```

---

## 11. Language Rules and Syntax

### 11.1 Statements and Line Structure

Parithi is **newline-sensitive**: one statement per line. There is no statement terminator symbol (no semicolons). Indentation is stylistic only (not significant to the parser) but strongly conventional for readability — block contents should be indented for humans, even though the parser locates block boundaries via `end <keyword>`, not indentation.

### 11.2 Identifiers

- Must start with a letter or underscore, followed by letters, digits, or underscores.
- Case-sensitive (`age` and `Age` are different identifiers).
- Cannot match any reserved keyword (§12.1) — violating this raises `P004`.

### 11.3 Comments

Single-line only, starting with `#` and running to end of line. There is no block-comment syntax in v1.0.

```
# This computes the area of a circle
hold area = PI * radius ** 2   # inline comments are also allowed
```

### 11.4 Block Termination Rule

Every block-opening keyword (`if`, `task`, `repeat`, `while`, `choose`) must be closed with `end <same-keyword>`:

| Opens with | Must close with |
|---|---|
| `if ... [else ...]` | `end if` |
| `task name(...)` | `end task` |
| `repeat N [as i]` | `end repeat` |
| `while condition` | `end while` |
| `choose expression ... [option ...] [other]` | `end choose` |

`option` and `other` clauses inside a `choose` block are **not** separately closed — only the enclosing `choose` needs `end choose` (see [§15.2](#152-choose-switch-statement)).

`end` alone is a keyword token; the word following it is validated by the parser against the currently open block. A mismatch (e.g., closing an `if` block with `end while`) raises:

```
Error P003:
Invalid block ending. Expected "end if" but found "end while".
```

### 11.5 Whitespace and Formatting

Blank lines and indentation are ignored by the lexer/parser beyond their role as visual structure. Multiple spaces between tokens are equivalent to one.

---

## 12. Keywords and Data Types

### 12.1 Reserved Keywords

The original plan's core list (20 words), plus the `is` operator keyword identified in [§2](#2-design-corrections-applied-to-the-original-plan), plus `choose` / `option` / `other` added for the switch statement ([§15.2](#152-choose-switch-statement)), plus `stop` added in Phase 8 ([§15.7](#157-stop-statement)), plus `box` added in Phase 9 ([§28](#28-arrays-phase-9)), plus `loop` added in Phase 16 ([§36](#36-unified-loop-model-phase-16)) — 27 total:

```
hold      const
if        else      choose    option    other     end
repeat    while     loop      break     continue
task      return    stop
say       ask
true      false     empty
is
and       or        not
as
box
```

None of these may be used as a variable, constant, function, or parameter name.

**Phase 8 audit note — which phase actually catches this:** every name-binding position in the grammar (`hold`/`const`'s name, a `task`'s name and parameters, `repeat N as i`'s counter) requires an `IDENTIFIER` token, and all 26 keywords above lex as `KEYWORD`/`BOOLEAN`/`EMPTY` tokens instead — so attempting `hold task = 5` is rejected by the **Parser** as `P011` ("expected an identifier") before the Semantic Analyzer's reserved-name check ever runs. `P004` ("Reserved name used") is still real and still semantic-analysis-phase, but in practice it's reached only via the *other* half of the reserved-name set: the built-in function names (`round`, `random`, `number`, `text`, `type`, `len`, `push`, `pop`, `insert`, `remove`, `sort`, `reverse`, `contains`), which lex as ordinary identifiers and so pass the parser fine — `hold round = 5` is the actually-reachable trigger (see the corrected example in [§18](#18-error-handling-and-error-codes)). Both collisions are rejected either way; only the responsible phase and error code differ from what an earlier draft of this document implied.

### 12.2 Data Types

| Type | Description | Example | Notes |
|---|---|---|---|
| **Number** | Integer values | `hold age = 25` | No implicit width limit in v1.0 (backed by JS number where it fits, BigInt fallback reserved for future) |
| **Decimal** | Floating-point values | `hold price = 199.99` | Distinct static type from Number, even though both are numeric — `10` is Number, `10.0` is Decimal |
| **String** | Text in double quotes | `hold name = "Parithi"` | No single-quote strings in v1.0, for lexical simplicity |
| **Boolean** | Truth value | `hold isLoggedIn = true` | Only `true` / `false` literals |
| **Empty** | Absence of value | `hold data = empty` | Also the implicit return value of a `task` with no `return` |
| **Array** | Ordered, resizable collection, created with `box(...)` | `hold nums = box(1, 2, 3)` | Added Phase 9 — see [§28](#28-arrays-phase-9). A flat (non-parameterized) static type: every array is just "Array," regardless of its elements' type |

Maps/dictionaries and general Objects are **not** part of v1.0 — see [§26](#26-future-enhancements). Arrays **are** part of v1.0 as of Phase 9 — see [§28](#28-arrays-phase-9).

---

## 13. Operators

### 13.1 Arithmetic

```
+     addition (Number+Number, Decimal+Decimal, or String+String — see §13.6)
-     subtraction
*     multiplication
/     division
%     modulo
**    exponentiation
```

Dividing two Numbers with a non-integer result promotes to Decimal (e.g., `7 / 2` is `3.5`, typed Decimal). Modulo (`%`) is defined for Number and Decimal operands only.

**Number and Decimal are mutually compatible ("Numeric") for static type-checking purposes (clarified during Phase 3 implementation).** Whether `a / b` ends up whole or fractional depends on the actual runtime values of `a` and `b`, which a *static* type checker cannot know from source text alone — the same is true of `number(someString)` (§16.5), whose result is documented as `Number|Decimal` precisely because it depends on what the user typed. Making Number and Decimal strictly distinct, incompatible types (as an early draft implied) would make these two extremely common operations unusable without spurious type errors. The resolution: Number and Decimal remain distinct **labels** — `type(x)` still reports them separately, and `10` vs `10.0` are still shown as different types in diagnostics — but they are always **compatible** with each other for assignment, comparison, and function-argument checks. String, Boolean, and Empty remain strictly separate from Numeric and from each other; this loosening applies only within the numeric family.

### 13.2 Comparison — Symbolic

```
==    is not not is       equal to
!=    not equal to
>     greater than
<     less than
>=    greater than or equal to
<=    less than or equal to
```

### 13.3 Comparison — Readable Word Forms

| Symbolic | Readable form |
|---|---|
| `==` | `is` |
| `!=` | `is not` |
| `>` | `is more than` |
| `<` | `is less than` |
| `>=` | `is at least` |
| `<=` | `is at most` |

Both forms are always interchangeable; a program may freely mix them:

```
if age is at least 18 and score >= 50
    say "Qualified"
end if
```

### 13.4 Readable Comparison Operators — Multi-Word Lexing

As identified in [§2](#2-design-corrections-applied-to-the-original-plan), `is`, `more`, `than`, `less`, `at`, `least`, `most` are only meaningful as operator fragments when they appear **immediately after a complete expression**, in one of these fixed sequences:

```
is
is not
is more than
is less than
is at least
is at most
```

The lexer recognizes `is` as a keyword token unconditionally. The parser, upon seeing `is`, performs bounded lookahead (at most 3 tokens) to match one of the six sequences above and emits a single `ComparisonOperator` token/node accordingly. `more`, `than`, `less`, `at`, `least`, `most` are **not** independently reserved — they remain valid identifiers everywhere else in a program, since they only carry meaning directly after `is`. This keeps the reserved-word surface minimal while making the multi-word grammar unambiguous.

### 13.5 Full Operator Precedence Table

From highest to lowest binding. Operators on the same row share precedence and associativity as noted.

| Precedence | Operator(s) | Associativity |
|---|---|---|
| 1 (highest) | `( )` grouping | n/a |
| 2 | `**` | Right-to-left |
| 3 | Unary `-` (arithmetic negation) | Right-to-left |
| 4 | `*`, `/`, `%` | Left-to-right |
| 5 | `+`, `-` (binary) | Left-to-right |
| 6 | `==` / `is`, `!=` / `is not`, `>` / `is more than`, `<` / `is less than`, `>=` / `is at least`, `<=` / `is at most` | Left-to-right (non-chaining — see below) |
| 7 | `not` (logical negation) | Right-to-left |
| 8 | `and` | Left-to-right |
| 9 (lowest) | `or` | Left-to-right |

**Why `not` sits below Comparison, not above it (corrected during Phase 2 implementation):** an earlier draft of this table grouped logical `not` with unary `-` at tier 3. That would make `not age >= 18` parse as `(not age) >= 18` — applying `not` to a bare Number before the comparison happens at all, which can't type-check. Putting `not` between Comparison and `and` instead (tier 7) makes `not age >= 18` correctly parse as `not (age >= 18)`, matching how every other word-based-logical-operator language (e.g. Python's `not`/`and`/`or`) behaves, and matching the intuitive reading "if NOT (age is at least 18)". Unary `-` is unaffected by this fix and stays at tier 3 — `-2 ** 2 = -(2 ** 2) = -4` still holds exactly as before.

**Non-chaining comparisons:** `a < b < c` is **not** valid Parithi and is a parse error — comparisons do not chain (unlike some languages that treat this as `a < b and b < c`). Write `a < b and b < c` explicitly.

**Examples:**
```
2 ** 3 ** 2        # = 2 ** (3 ** 2) = 512   (right-assoc)
-2 ** 2            # = -(2 ** 2) = -4        (unary binds looser than **)
10 - 3 - 2         # = (10 - 3) - 2 = 5      (left-assoc)
not true and false # = (not true) and false = false
not age >= 18      # = not (age >= 18)          (not binds looser than comparison)
```

### 13.6 The `+` Operator on Strings

`+` concatenates when **both** operands are String:

```
hold greeting = "Hello, " + name     # valid if name is String
```

`+` between a String and a Number/Decimal is a compile-time type error (consistent with static type inference — see [§2](#2-design-corrections-applied-to-the-original-plan) item 6):

```
hold msg = "Age: " + age
```
```
Error P002:
Cannot apply "+" between String and Number. Convert first: "Age: " + text(age)
```

### 13.7 Logical Operators

```
and
or
not
```

There are no symbolic forms (`&&`, `||`, `!`) in Parithi — logical intent must always be spelled out, matching the "no unnecessary symbols" philosophy.

### 13.8 Assignment Operator

```
=
```

`=` is the assignment operator, used both in `hold`/`const` declarations and in later reassignments:

```
hold age = 20
age = 21
```

It is a distinct token from the equality comparison operator `==` (§13.2) — the Lexer distinguishes them by maximal munch (an `=` followed immediately by a second `=` is `==`; otherwise it's plain `=`). `=` never appears in an expression's value — it only introduces a declaration ([§14.1](#141-variable-declaration)) or an assignment statement, never a sub-expression, so it has no entry in the operator precedence table (§13.5).

---

## 14. Variables, Constants, Scope, and Type System

### 14.1 Variable Declaration

All variables are declared with `hold`:

```
hold age = 20
hold name = "Pandiyaraj"
hold isStudent = true
```

Reassignment (no `hold`, no re-declaration):

```
age = 21
```

Using an identifier that was never declared with `hold`/`const` is a compile-time error:

```
score = 10
```
```
Error P001:
Variable "score" is not declared.
```

### 14.2 Constants

```
const PI = 3.14159
```

Constants must be initialized at declaration and can never be reassigned. Attempting to do so:

```
const PI = 3.14159
PI = 3.14
```
```
Error P005:
Cannot reassign constant "PI".
```

### 14.3 Scope Rules

Parithi uses **block scope**: every `task`, `if`, `repeat`, and `while` body introduces a new scope whose declarations are invisible outside it, and which can **shadow** an outer variable of the same name.

Corrected example (see [§2](#2-design-corrections-applied-to-the-original-plan) item 1 — the original never called `demo()`):

```
hold age = 20

task demo()
    hold age = 10
    say age
end task

demo()
say age
```

Output:
```
10
20
```

`demo()`'s inner `hold age = 10` shadows the outer `age` for the duration of the function body only; once `demo()` returns, the outer `say age` sees the untouched outer binding.

### 14.4 Static Type System

Types are inferred once, from the expression on the right-hand side of the **first** assignment, and are fixed for that variable's lifetime:

```
hold age = 20        # inferred: Number
```

Any later assignment must match the inferred type:

```
age = "Twenty"
```
```
Error P002:
Cannot assign String to Number.
```

Type inference rules by literal/expression form:

| Expression | Inferred Type |
|---|---|
| Integer literal (`20`) | Number |
| Literal with a decimal point (`19.99`) | Decimal |
| Double-quoted text (`"hi"`) | String |
| `true` / `false` | Boolean |
| `empty` | Empty (a variable holding `empty` may later be assigned any type — see below) |
| Arithmetic expression | Number or Decimal per operand promotion rules (§13.1) |
| Comparison expression | Boolean |
| Function call | The declared/inferred return type of the called `task` |

**Empty as a type placeholder:** a variable first assigned `empty` has no fixed type yet; its type is fixed on the **first non-empty assignment** instead, and locked from then on. This lets `hold result = empty` precede a conditional assignment without a premature type lock.

**Function parameters have no static type (clarified during Phase 3 implementation).** Parithi's grammar has no type-annotation syntax for `task` parameters — `task add(a, b)` gives `a` and `b` names only, never types. Statically inferring a parameter's type would require either a type-annotation syntax (a language change, out of scope for v1.0) or full call-site flow analysis across every call to that function (far beyond a single semantic-analysis pass). Parameters are therefore given a special **Unknown** type, compatible with everything, so using them inside the function body never produces a spurious type error. A task's own inferred return type becomes Unknown too whenever it depends on an Unknown-typed parameter (e.g. `return a + b` where `a`/`b` are parameters) — but stays precise when it doesn't (e.g. `task getGreeting()\n    return "Hello"\nend task` is still correctly inferred to return String, so callers assigning its result get full type-checking). This is a deliberate, disclosed scope boundary for v1.0's static type system, not an oversight.

---

## 15. Control Flow

### 15.1 Conditionals

```
if age >= 18
    say "Adult"
else
    say "Minor"
end if
```

`else if` chains are written as nested `if`/`end if` inside the `else` branch (v1.0 has no dedicated `else if` keyword, to keep the keyword count minimal):

```
if score >= 90
    say "A"
else
    if score >= 80
        say "B"
    else
        say "C"
    end if
end if
```

### 15.2 Choose (Switch) Statement

`choose` provides a multi-way alternative to a long `if`/`else` chain when a single expression is being compared against several fixed values — for example, mapping a day number to a day name. It was added after the initial v1.0 draft specifically because it reads better and is far cheaper to implement than the more advanced constructs (OOP, modules) that remain deferred to later versions (see [§26](#26-future-enhancements)).

**Syntax:**

```
hold day = 2

choose day

    option 1
        say "Monday"

    option 2
        say "Tuesday"

    option 3
        say "Wednesday"

    other
        say "Unknown"

end choose
```

**Grammar and semantics:**

- `choose <expression>` opens the block. `<expression>` is evaluated exactly once, before any `option` is checked.
- Each `option <literal>` compares the `choose` expression against `<literal>` using `==` equality. The literal's static type must match the statically-inferred type of the `choose` expression ([§14.4](#144-static-type-system)), or the semantic analyzer raises `P002` — for example, `choose day` where `day` is Number cannot have `option "Monday"`.
- `option` and `other` clauses are **not** individually closed with their own `end` — each runs until the next `option`, the next `other`, or the enclosing `end choose` (see [§11.4](#114-block-termination-rule)).
- **No fall-through.** Exactly one clause executes per `choose` — whichever `option` matches first, or `other` if none match. Execution never continues into the next `option` after a match, unlike C-style `switch`. This removes an entire class of "forgot to `break`" bugs without needing a `break`-per-case convention.
- `other` is **optional**. If no `option` matches and there is no `other` clause, the `choose` block does nothing and execution continues after `end choose`.
- Each `option`/`other` body is its own block scope, consistent with `if`, `repeat`, `while`, and `task` bodies ([§14.3](#143-scope-rules)) — a `hold` inside one `option` is not visible in another.
- `break` and `continue` are not needed between `option` clauses (there is no fall-through to prevent). If `break`/`continue` appear inside a `choose` block that itself sits inside a `repeat`/`while` loop, they act on that **enclosing loop**, not the `choose` block — `choose` does not introduce loop-control semantics of its own.
- **Duplicate option values are a compile-time error.** Two `option` clauses in the same `choose` sharing the same literal value means the second can never run, so the semantic analyzer rejects it as `P007` (see [§18](#18-error-handling-and-error-codes)).
- v1.0 requires exactly one literal per `option` (`option 1`, `option "Monday"`, `option true`). Matching a single `option` against a group of values (`option 1, 2`) is deferred — see [§26](#26-future-enhancements).

**Error example — type mismatch:**

```
hold day = 2
choose day
    option "Monday"
        say "Monday"
end choose
```
```
Error P002:
Cannot compare Number to String in "option "Monday"".
```

**Error example — duplicate option:**

```
choose day
    option 1
        say "Monday"
    option 1
        say "Also Monday?"
end choose
```
```
Error P007:
Duplicate "option 1" in choose block — this branch can never run.
  → schedule.pr, line 4
```

### 15.3 Repeat Loop

Fixed-count loop. Per the correction in [§2](#2-design-corrections-applied-to-the-original-plan) item 4, the optional counter **starts at 1** and is inclusive:

```
repeat 5
    say "Hello"
end repeat
```

With an explicit counter:

```
repeat 5 as i
    say i
end repeat
```

Output:
```
1
2
3
4
5
```

### 15.4 While Loop

```
hold count = 1
while count <= 5
    say count
    count = count + 1
end while
```

### 15.5 Break

`break` immediately exits the nearest enclosing `repeat` or `while` loop.

### 15.6 Continue

`continue` skips the remainder of the current iteration and proceeds to the loop's next condition check/counter increment.

### 15.7 Stop Statement

Added in Phase 8, at the language designer's request, as the sole approved addition ahead of v1.0 (the alternative proposals in the Phase 8 audit report — modules, exception handling, OOP — were explicitly deferred).

```
stop
stop <expression>
```

`stop` immediately terminates the entire program — not just the current loop or function, like `break`/`continue`/`return` — from anywhere in a program: the top level, inside any `repeat`/`while`, inside any `task` at any call depth, or inside any `if`/`choose` branch. Unlike `break`/`continue` (loop-only) and `return` (task-only), `stop` has **no context restriction**; it is always valid.

- `stop` with no argument terminates with exit code `0`.
- `stop <expression>` terminates with `<expression>`'s value as the exit code. `<expression>` must be Number or Decimal (a Decimal value is truncated toward zero) — any other type raises `P002` at compile time, e.g. `stop "done"` is rejected before the program ever runs.
- `stop` is a simple statement, not a block opener — it needs no `end stop` ([§11.4](#114-block-termination-rule) is unaffected).
- The exit code from `stop` is the CLI's actual process exit code, overriding the four codes documented in [§19.1](#191-exit-codes-phase-7) — the program itself chose this code, so it is not reinterpreted as a compiler/runtime/usage-error result.

**Example:**

```
task validate(age)
    if age < 0
        say "Invalid age — stopping."
        stop 1
    end if
    return true
end task

validate(-5)
say "This line never runs."
```

Output: `Invalid age — stopping.`, then the process exits with code `1` — the final `say` never executes.

---

## 16. Functions and Built-in Functions

### 16.1 Input

```
hold name = ask("Enter your name")
```

Per [§2](#2-design-corrections-applied-to-the-original-plan) item 7, `ask()` **always returns String**, regardless of what the user types. Convert explicitly for numeric input:

```
hold ageText = ask("Enter your age")
hold age = number(ageText)
```

### 16.2 Output

```
say "Hello"
```

Multiple comma-separated values are printed space-joined on one line:

```
say "Hello", name
```

### 16.3 Function Declaration and Calling

```
task greet(name)
    say "Hello", name
end task

greet("Pandiyaraj")
```

### 16.4 Return Values

```
task add(a, b)
    return a + b
end task

hold result = add(10, 20)
```

Per [§2](#2-design-corrections-applied-to-the-original-plan) item 9: if a `task` runs to completion without executing a `return`, its call expression evaluates to `empty`. Recursion is supported — a `task` may call itself; the call stack (§17.3) tracks each active invocation's own local scope.

### 16.5 Built-in Function Reference

| Function | Category | Signature | Behavior |
|---|---|---|---|
| `round(x)` | Math | `Decimal → Number` | Rounds to nearest integer (half rounds away from zero) |
| `round(x, digits)` | Math | `(Decimal, Number) → Decimal` | Rounds to `digits` decimal places |
| `random()` | Math | `() → Decimal` | Returns a Decimal in `[0, 1)` |
| `random(min, max)` | Math | `(Number, Number) → Number` | Returns a Number in `[min, max]`, inclusive of both ends |
| `number(x)` | Type | `String → Number\|Decimal` | Parses text to a numeric value; raises `P006` at runtime if unparsable |
| `text(x)` | Type | `Any → String` | Converts any value to its String representation |
| `type(x)` | Type | `Any → String` | Returns one of `"Number"`, `"Decimal"`, `"String"`, `"Boolean"`, `"Empty"`, `"Array"` |
| `len(x)` | Text / Array | `String\|Array → Number` | Returns the character count of a String, or the element count of an Array (added Phase 9, [§28](#28-arrays-phase-9)) |
| `push(arr, item)` | Array | `(Array, Any) → Array` | Appends `item` to the end of `arr`, in place; returns `arr` (Phase 9) |
| `pop(arr)` | Array | `Array → Any` | Removes and returns `arr`'s last element, in place; raises `P024` on an empty array (Phase 9) |
| `insert(arr, index, item)` | Array | `(Array, Number, Any) → Array` | Inserts `item` at `index`, shifting later elements right; `index` may equal `arr`'s current length (append); returns `arr` (Phase 9) |
| `remove(arr, index)` | Array | `(Array, Number) → Any` | Removes and returns the element at `index`, shifting later elements left (Phase 9) |
| `sort(arr)` | Array | `Array → Array` | Sorts `arr` in place — ascending numerically for Number/Decimal, lexicographically for String; returns `arr` (Phase 9) |
| `reverse(arr)` | Array | `Array → Array` | Reverses `arr` in place; returns `arr` (Phase 9) |
| `contains(arr, item)` | Array | `(Array, Any) → Boolean` | True if any element of `arr` is deep-equal to `item` (Phase 9) |

All built-ins are global, always available, and — unlike user `task`s — cannot be shadowed (redeclaring `round` as a variable name raises `P004`, since built-in names are treated as reserved at the semantic-analysis level). The seven Array built-ins are documented in full, with the reference-semantics/homogeneity rules they enforce, in [§28.5](#285-array-built-in-functions).

**Argument types accept the whole Numeric family, not literally just `Decimal` (clarified during Phase 5 audit).** The `Decimal`/`Number` distinctions in the signature column above describe the *typical* documented shape, but per §13.1's Number/Decimal-compatibility rule, `round()`/`random()` accept either — `round(5)` (a plain Number) is valid, not just `round(5.0)`. `random()` has exactly two valid call forms — 0 arguments or 2 — calling it with exactly 1 argument is rejected at semantic-analysis time (`P016`), not silently accepted and left to fail confusingly at runtime.

---

## 17. Runtime Architecture

The Interpreter delegates all execution state to a `Runtime` object (§17.1) and an `ExecutionContext` (§17.6), rather than holding scope/call-stack/loop-depth as separate ad-hoc fields itself:

```
Runtime
├── globalEnvironment      (top-level `hold`/`const`/`task` bindings — lives for the program's lifetime)
├── EnvironmentStack       (§17.2 — every currently active scope, innermost on top)
└── CallStack              (§17.3 — every currently active task invocation)

ExecutionContext (§17.6)
├── loopDepth              (how many repeat/while loops we're lexically inside)
├── currentFunction        (the task descriptor we're executing inside, or null)
└── currentNode            (the statement currently executing — for `--runtime`)

Runtime Objects (§17.4) — NumberValue/DecimalValue/StringValue/BooleanValue/EmptyValue/ListValue
Built-in Registry (§17.5) — round, random, number, text, type, len, push, pop, insert, remove, sort, reverse, contains
```

### 17.1 Scope Chain

Each scope (an `Environment`) holds a `Map` of `name → { runtimeValue, mutable }` and a reference to its parent scope (or `null` for global). Variable lookup walks up the chain; declaration (`hold`/`const`) always writes into the **current** scope, which is what makes shadowing (§14.3) possible. Every `if`/`else` branch, `choose` option/other body, and loop iteration gets its **own** fresh child `Environment` — this is what makes a loop body's `hold` declarations reset cleanly each iteration rather than accumulating stale state.

Function bodies are the one case where the parent is **not** the caller's environment: a function's body executes in a new `Environment` whose parent is the environment captured at the point the function was *declared* (lexical scoping), not wherever it happens to be *called* from.

### 17.2 Environment Stack (and why "no leaks" needs more than "always pop")

`EnvironmentStack` is the explicit stack of active scopes — `pushEnvironment(parent)`, `popEnvironment()`, `currentEnvironment()`, `parentEnvironment()`, and `resolveVariable()`/`declareVariable()`/`assignVariable()` as convenience delegates to whatever is currently on top.

The subtlety: `break`/`continue`/`return` are **routine, frequent** signals — not rare errors — and can propagate through an arbitrary number of nested `if`/`choose` scopes before a loop or function catches them (e.g. `while true { if x { if y { break } } }`). If every intermediate scope had to remember to pop itself on the way out, a single missed case would leak an environment on *every* iteration of any loop with a conditional `break` — unbounded growth in any long-running program. Instead, `EnvironmentStack` tracks a `depth`, and a loop or function records the depth it started at, then calls `truncateTo(that depth)` once it has handled *any* of {normal completion, break, continue, return} — one operation, mathematically correct regardless of how many levels were pushed in between, with zero extra `try/catch` needed in `if`/`choose` themselves (they just push, execute, and pop on their own non-throwing path — if a signal passes through instead, the pop is simply skipped, and the enclosing loop/function's `truncateTo` cleans it up).

A **genuine runtime error** deliberately skips truncation — both the environment stack and the call stack are left pinned all the way down, so `pari --runtime` (§19) can show exactly what scopes and calls were active at the moment of failure. This is the same "pin on error, clean up on control flow" split the Call Stack already used before this stack existed (§17.3).

### 17.3 Call Stack

Every `task` invocation pushes a frame — `{ name, params, args, environment, closureEnv, location }` (the callee's name, its parameters, the actual argument values, its own execution environment, the environment it closed over when declared, and the call site) — before executing its body, and pops it on the **successful** path — an explicit `return` or falling off the end of the body. On an error path, the frame is deliberately **not** popped, for the same reason as §17.2: the error, once it reaches the top of the program, reports the full chain of calls that were active when it occurred. `CallStack` also enforces a maximum depth (500 Parithi-level calls) — a call past that depth raises `P021` rather than letting unbounded recursion crash the host process with a raw stack overflow.

### 17.4 Runtime Objects

Parithi's six data types (§12.2) each have a dedicated class — `NumberValue`, `DecimalValue`, `StringValue`, `BooleanValue`, `EmptyValue`, and (added Phase 9) `ListValue` — exposing `type`, `value`, `toString()`, `equals()`, `isTruthy()`, and `copy()`. These are used at the `Environment` storage boundary specifically: `define()`/`assign()` wrap a raw value on the way in, `get()` unwraps it on the way out. This is deliberate, not universal — boxing every arithmetic intermediate (every operand of every `+`/`-`/comparison) would be invasive and slow for no behavioral benefit; wrapping only at declaration/reassignment (rare) while unwrapping at read time (frequent, but a property read, not an allocation) is where "represent runtime values as dedicated classes" earns its keep — accurate type names in diagnostics (e.g., `len(empty)` now correctly reports "got Empty," not JS's leaky `typeof null === 'object'`), and a real place to hang `equals()`/`isTruthy()` on — without touching the interpreter's hot arithmetic path, which still operates on raw JS values exactly as before.

`copy()` exists mostly for forward compatibility: v1.0 had no mutable or reference types through Phase 8, so every scalar value was already copied by-value automatically in JS, making `copy()` behaviorally a no-op for all five of them. `ListValue.copy()` (Phase 9) is the first real exception: it deliberately returns `this` rather than cloning, since arrays are the first reference-shaped type (§28.3) — the hook §17.4 always intended for "a future version" turned out to be needed by the very next phase.

### 17.5 Built-in Registry

A `BuiltinRegistry` class (register/has/get/names/call) backs all thirteen built-ins — `interpreter/builtins/index.js` registers `round`, `random`, `number`, `text`, `type`, `len`, `push`, `pop`, `insert`, `remove`, `sort`, `reverse`, and `contains` against it, so adding one more is exactly one `registry.register({...})` call (as the seven array built-ins themselves demonstrated in Phase 9). This is intentionally separate from the Semantic Analyzer's own built-in signature table (§16.5's `BUILTIN_SIGNATURES`) — the two serve different phases (static pre-execution validation vs. actual invocation with runtime values) and merging them would mean touching Phase 3's already-verified logic for a phase whose scope is the runtime, not semantic analysis. User code is never allowed to redefine a built-in name (§16.5) — enforced at the semantic-analysis level, not here.

### 17.6 Execution Context

`ExecutionContext` aggregates "where are we right now" — `loopDepth`, `currentFunction` (a `{name, params}` descriptor, or `null` outside any task), and `currentNode` (the statement presently executing). `currentNode` is updated once per **statement**, not per expression sub-node — updating it inside `evaluate()` as well would add a reference write to the hottest path in the interpreter for a debugging convenience most executions never inspect. Interpreter components read `this.context.loopDepth`/`this.context.currentFunction` rather than holding their own copies, which is what makes the two new defensive checks below possible: `break`/`continue` outside any loop, and `return` outside any task, are now checked defensively at the interpreter level (reusing `P018`/`P019`/`P017`) exactly like `Environment` already defensively re-checks undeclared-variable/constant-reassignment — see §17.7.

### 17.7 Defensive Runtime Checks

The Interpreter does not assume the Semantic Analyzer has already run:

- `Environment.get()`/`assign()` re-check undeclared-variable use and constant reassignment on every access (`P001`/`P005`).
- `break`/`continue` outside any loop, and `return` outside any task, are re-checked via `ExecutionContext` (`P018`/`P019`/`P017`).
- Calling a value that isn't actually a function (e.g. `hold x = 5` then `x()`) is checked before the call is attempted (`P022`) — previously an un-caught case that would have crashed with a raw JS `TypeError` if semantic analysis were ever bypassed.
- (Phase 9) Indexing/assigning into a non-array value (`P025`), an out-of-range or negative index (`P024`/`P027`), and an array element-type mismatch (`P026`) are all re-checked at Interpretation time — see §28.6. `P025`/`P026` are the two array checks that are *only* defensive when the relevant type happens to be statically knowable; when it isn't (an `Unknown`-typed function parameter, overwhelmingly the common case for array-accepting code), this is the *only* place either check ever runs.

This is deliberate duplication, not an oversight: it means the interpreter enforces these invariants correctly even when driven directly (e.g. in isolated tests that skip semantic analysis), rather than silently trusting an earlier pass that might not have run.

Three failure modes exist **only** at runtime, since no static check could ever predict them from source text alone: `P020` (division or modulo by a value that turns out to be zero), `P021` (call depth exceeding the configured maximum), and `P023` (a genuinely unexpected internal failure — a catch-all at the top of `run()` that wraps anything that isn't already a recognized Parithi error, so a raw stack trace can never reach the user). All three carry the call stack captured at the moment they were raised.

---

## 18. Error Handling and Error Codes

All errors are surfaced with a stable code, a one-line description, and the source line where possible. Errors are grouped by the phase that raises them: **Lexing** (P008–P010), **Parsing** (P003, P011–P013, P031), **Semantic Analysis** (P001, P002, P004, P005, P007, P014–P019, P025, P026), **Interpretation** (P006, P020–P024, P026–P029), and **Native Compilation** (P030). The Interpreter also defensively re-raises P001, P002, P005, P017, P018, P019, P025, P026 at runtime — see [§17.7](#177-defensive-runtime-checks). P025/P026 are listed under both phases deliberately: each is caught statically whenever the relevant type is knowable from source text alone, and defensively at runtime whenever it isn't (most commonly, an Unknown-typed function parameter) — see [§28.6](#286-array-error-codes) for the full breakdown.

| Code | Name | Phase | Trigger Example |
|---|---|---|---|
| **P001** | Variable not declared | Semantic Analysis | `score = 10` without a prior `hold score` |
| **P002** | Type mismatch | Semantic Analysis | `age = "Twenty"` after `hold age = 20`; also raised when a `choose`'s `option` literal type doesn't match the switched expression, or when `stop`'s argument isn't Number/Decimal (§15.7) |
| **P003** | Invalid block ending | Parsing | `end while` closing an `if` block |
| **P004** | Reserved name used | Semantic Analysis | `hold round = 5` (redeclaring a built-in function name — see [§12.1 audit note](#121-reserved-keywords) below) |
| **P005** | Constant reassignment | Semantic Analysis | `PI = 3.14` after `const PI = 3.14159` |
| **P006** | Runtime conversion error | Interpretation | `number(ask("..."))` when the user types `"abc"` |
| **P007** | Duplicate option value | Semantic Analysis | Two `option` clauses in the same `choose` block share the same literal value |
| **P008** | Unknown character | Lexing | An unrecognized character such as `@` appears in the source |
| **P009** | Unterminated string | Lexing | `say "Hello` — no closing `"` before end of line or end of file |
| **P010** | Invalid number literal | Lexing | `123abc` — letters directly touching a digit-led token |
| **P011** | Unexpected token | Parsing | A specific token was required and a different one was present, e.g. `hold age 20` (missing `=`) |
| **P012** | Unexpected end of file | Parsing | The file ends before a required token appears, e.g. `if true` with no `end if` |
| **P013** | Invalid choose block | Parsing | `option` followed by something other than a literal, e.g. `option someVariable` |
| **P014** | Duplicate declaration | Semantic Analysis | A variable, constant, function, or parameter name is declared twice in the same scope |
| **P015** | Unknown function | Semantic Analysis | Calling a name that is neither a declared `task` nor a built-in (`round`, `random`, `number`, `text`, `type`, `len`) |
| **P016** | Invalid argument count | Semantic Analysis | `add(10)` calling a `task add(a, b)`; also raised for built-ins called with too few/many arguments |
| **P017** | Return outside task | Semantic Analysis | `return 10` at the top level, not inside any `task` |
| **P018** | Break outside loop | Semantic Analysis | `break` not inside a `repeat` or `while` |
| **P019** | Continue outside loop | Semantic Analysis | `continue` not inside a `repeat` or `while` |
| **P020** | Division by zero | Interpretation | `10 / 0` or `10 % 0` at runtime |
| **P021** | Stack overflow | Interpretation | Call depth exceeds the maximum (unbounded recursion) |
| **P022** | Invalid function call | Interpretation | Calling a value that isn't actually a function, e.g. `hold x = 5` then `x()` |
| **P023** | Unexpected runtime failure | Interpretation | A catch-all for any error reaching `run()` that isn't already a recognized Parithi error — never leaks a raw JS stack trace |
| **P024** | Array index out of range | Interpretation | `nums[10]` on a 3-element array; also raised by `pop()`/`remove()`/`insert()` on an invalid position — see [§28.6](#286-array-error-codes) |
| **P025** | Cannot index non-array value | Semantic Analysis (statically), Interpretation (defensively) | `hold x = 5` then `x[0]` — see [§28.6](#286-array-error-codes) |
| **P026** | Array element type mismatch | Semantic Analysis (statically), Interpretation (defensively) | `box(1, "two", 3)`, or `push(nums, "oops")` on a `box` of Numbers — see [§28.6](#286-array-error-codes) |
| **P027** | Negative array index | Interpretation | `nums[-1]` — see [§28.6](#286-array-error-codes) |
| **P028** | Math domain error | Interpretation | `sqrt(-4)`, `log(0)` — see [§32.1](#321-math-library) |
| **P029** | String index out of range | Interpretation | `substring("hi", 2, 10)` — see [§32.2](#322-string-library) |
| **P030** | Unsupported native compilation feature | Native Compilation | Any AST node or `say` argument the x86-64 backend doesn't compile yet — see [§33.11](#3311-error-codes) |
| **P031** | Maximum nesting depth exceeded | Parsing | Source nested far more deeply than any realistic program needs (e.g. 1000+ parenthesized groups, or thousands of nested `if`/`box(...)`) — added by the production-readiness audit after this was found to crash with a raw JS `RangeError` instead of a clean diagnostic; see [§35.3](#353-parser-recursion-guard-p031) |

### Example Error Output

```
Error P001:
Variable "score" is not declared.
  → hello.pr, line 4
      score = 10
      ^^^^^
Hint: declare it first with "hold score = ...".
```

### Lexical Error Examples (P008–P010)

```
hold x = @
```
```
Error P008:
Unexpected character "@".
  → hello.pr:1:10
```

```
say "Hello
```
```
Error P009:
Unterminated string — no closing " found before end of line.
  → hello.pr:1:5
```

```
hold n = 123abc
```
```
Error P010:
Invalid number literal "123abc" — identifiers cannot start with a digit, and numbers cannot contain letters.
  → hello.pr:1:10
```

### Parsing Error Examples (P011–P013)

```
hold age 20
```
```
Error P011:
Expected "=" after the variable name but found a number (20).
  → hello.pr:1:10
```

```
if true
    say "x"
```
```
Error P012:
Unexpected end of file — expected "end if".
  → hello.pr:2:12
```

```
choose day
    option someVariable
        say "x"
end choose
```
```
Error P013:
Invalid choose block: expected a literal value after "option" but found "someVariable".
  → hello.pr:2:12
```

### Semantic Analysis Error Examples (P014–P019)

```
hold age = 20
hold age = 30
```
```
Error P014:
"age" is already declared in this scope.
  → hello.pr:2:1
Hint: choose a different name, or remove the earlier declaration.
```

```
greet("Pandiyaraj")
```
```
Error P015:
Unknown function "greet".
  → hello.pr:1:1
Hint: check the spelling, or declare it first with "task greet(...) ... end task".
```

```
task add(a, b)
    return a + b
end task
add(10)
```
```
Error P016:
"add" expects 2 argument(s) but got 1.
  → hello.pr:4:1
```

```
return 10
```
```
Error P017:
"return" can only be used inside a "task".
  → hello.pr:1:1
```

```
break
```
```
Error P018:
"break" can only be used inside a "repeat" or "while" loop.
  → hello.pr:1:1
```

```
continue
```
```
Error P019:
"continue" can only be used inside a "repeat" or "while" loop.
  → hello.pr:1:1
```

### Runtime Error Examples (P020–P023)

```
task divide(a, b)
    return a / b
end task
divide(10, 0)
```
```
Error P020:
Division by zero.
  → hello.pr:2:12
Call stack:
  at divide(...) — called at hello.pr:4:1
Hint: check the divisor before dividing, e.g. "if b is not 0".
```

```
task loopForever()
    return loopForever()
end task
loopForever()
```
```
Error P021:
Maximum call depth (500) exceeded — likely infinite recursion.
  → hello.pr:2:12
Call stack:
  at loopForever(...) — called at hello.pr:2:12
  at loopForever(...) — called at hello.pr:2:12
  ... (498 more)
Hint: check that every recursive call moves toward a base case that actually returns without calling itself again.
```

```
hold x = 5
x()
```
```
Error P022:
"x" is not a function and cannot be called.
  → hello.pr:2:1
Hint: "x" is a Number, not a task.
```

---

## 19. CLI Commands

```
pari hello.pr              # execute a Parithi program (full pipeline)
pari --tokens hello.pr     # print the lexer's token stream, then exit
pari --ast hello.pr        # print the parsed AST as a tree, then exit
pari --analyze hello.pr    # run semantic analysis: symbol tables + diagnostics, then exit
pari --runtime hello.pr    # execute, then print runtime diagnostics (environment/call stack, debugging only)
pari --version             # print version information (language, compiler, Node, platform)
pari --help / -h           # print usage and flag reference
pari hello.pr --verbose    # execute, then print total execution time
```

`--tokens` and `--ast` run only the Lexer (and Lexer+Parser, respectively) — they do not run the semantic analyzer or interpreter, which makes them safe to use even on a program that doesn't type-check yet, purely for debugging. `--analyze` runs through semantic analysis and stops there — no execution happens. `--runtime` runs the *entire* pipeline exactly like plain `pari hello.pr` (identical output, identical behavior) and then additionally reports the runtime's final state — environment/call stack depth (both should read back to a clean baseline after a successful run; see §17.2's leak-proofing), execution time, and the global scope's variables, or, if execution failed, the pinned stacks and bound parameter values at the point of failure. This is a debugging aid only; it changes nothing about how the program itself executes. `--verbose` may be combined with a plain run (or `--runtime`) at any argument position — `pari hello.pr --verbose` and `pari --verbose hello.pr` are equivalent — and prints a one-line "Completed in Nms." summary after a successful run; without it, a successful run prints only the program's own output, matching how `node`/`python` behave on success.

`<file.pr>` accepts relative paths, absolute paths, and paths containing spaces, provided the shell is told to treat the whole path as one argument (quote it: `pari "./my programs/hello world.pr"`) — the CLI itself never splits a path on whitespace.

### 19.1 Exit Codes (Phase 7)

| Code | Meaning | When it happens |
|---|---|---|
| `0` | Success | The requested command completed normally. |
| `1` | Compiler Error | The Lexer, Parser, or Semantic Analyzer rejected the program before it ever ran. |
| `2` | Runtime Error | The program parsed and type-checked but failed while executing (P006, P020–P024, P027, or a defensively re-raised P001/P002/P005/P017–P019/P025/P026 per §17.7). |
| `3` | CLI Usage Error | The command line itself was invalid — an unknown flag, a missing/unreadable/wrong-extension file, or a missing required argument. The program's own source is never inspected in this case, so it can never be a compiler or runtime error. |

The CLI never exits silently: every code path — success, every error phase, and every usage mistake — ends by explicitly setting one of the four codes above.

**Exception — `stop <code>` (§15.7, Phase 8):** when a program executes a `stop` statement with an explicit code, that code becomes the process's actual exit code, overriding this table entirely — the program terminated deliberately, on its own terms, not because the CLI classified it as a compiler/runtime/usage outcome. A bare `stop` (no argument) still exits `0`.

### 19.2 Command-Line Diagnostics (Phase 7)

Two categories of mistake are distinguished from an ordinary Parithi program error, and are handled entirely inside the CLI layer (`src/cli/`) before the Lexer ever sees the file:

- **Unknown flags** (`pari --toekns hello.pr`) are checked against the known flag list by edit distance; a close match produces `Hint: Did you mean "--tokens"?` instead of a bare rejection.
- **Missing or mistyped filenames** (`pari hallo.pr`) trigger a directory scan for similarly-named `.pr` files in the same folder; a close match produces `Hint: Did you mean "hello.pr"?`.

Both are CLI Usage Errors (exit `3`) — see [§19.1](#191-exit-codes-phase-7). A directory passed where a file was expected, and a file that exists but does not end in `.pr`, are reported the same way, with a suggestion to point at a real `.pr` file inside the directory or rename the file respectively. Every one of these paths is caught and formatted before it could ever reach a raw Node.js file-system exception.

### 19.3 `pari --version` Output

Reports the full architecture, not just the frontend/Interpreter: `Language`, `Compiler` (from `package.json`), `Frontend` (`Lexer → Parser → AST → Semantic Analyzer`), `Backends` (`Tree-Walking Interpreter | Bytecode Generator`, §29), `Runtime` (the PVM, §30), `Optimizer` (`Bytecode Optimizer (N Passes)` — `N` read live from the Optimizer's own `DEFAULT_PASSES` list, §31.3, never hand-typed), `Bytecode` (`.pbc` support, §29.7), `CLI`, `Node.js` (`process.version`), `Build Date`, and `Platform` (`process.platform`/`process.arch`). `bytecodeSupport()`/`pvmSupport()`/`optimizerSupport()` (`src/cli/version-info.js`) each check that the relevant module's actual exports are present and callable, so this screen would honestly report a feature as unavailable rather than silently claim support for something not actually loaded.

---

## 20. Example Programs

### 20.1 Hello World

```
say "Hello, Parithi!"
```

### 20.2 Simple Calculator

```
hold a = number(ask("Enter first number"))
hold b = number(ask("Enter second number"))

say "Sum:", a + b
say "Difference:", a - b
say "Product:", a * b
say "Quotient:", a / b
```

### 20.3 FizzBuzz

```
repeat 15 as i
    if i % 15 is 0
        say "FizzBuzz"
    else
        if i % 3 is 0
            say "Fizz"
        else
            if i % 5 is 0
                say "Buzz"
            else
                say i
            end if
        end if
    end if
end repeat
```

### 20.4 Grade Checker (function + readable comparisons)

```
task gradeFor(score)
    if score is at least 90
        return "A"
    end if
    if score is at least 80
        return "B"
    end if
    if score is at least 70
        return "C"
    end if
    return "F"
end task

hold studentScore = number(ask("Enter score"))
say "Grade:", gradeFor(studentScore)
```

### 20.5 While Loop with Break/Continue

```
hold n = 0
while true
    n = n + 1
    if n % 2 is 0
        continue
    end if
    if n is more than 9
        break
    end if
    say n
end while
```

Output: `1 3 5 7 9` (one per line).

### 20.6 Day of the Week (`choose` / `option` / `other`)

```
hold day = 2

choose day

    option 1
        say "Monday"

    option 2
        say "Tuesday"

    option 3
        say "Wednesday"

    other
        say "Unknown"

end choose
```

Output: `Tuesday`

---

## 21. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language runtime | Node.js (LTS, ≥ v18) | Ubiquitous, fast startup for a CLI tool, no build step needed for v1.0 |
| Implementation language | JavaScript (ES modules) | Matches target runtime directly; TypeScript considered for v1.1+ once the API surface stabilizes |
| CLI framework | Minimal hand-rolled arg parser (no dependency) | Keeps the dependency tree at zero for the core interpreter |
| Testing | Node's built-in `node:test` + `assert` | Zero extra dependency; golden-file tests for example programs |
| Package distribution | npm (`npm install -g parithi`) | Standard Node distribution path for a `pari` binary |
| Version control | Git | Standard |

Deliberately **no external parsing library** (no PEG.js/Nearley/ANTLR) is used for v1.0 — a hand-written recursive-descent parser is chosen so the whole pipeline stays inspectable and teachable, matching the language's own philosophy.

---

## 22. Development Phases (Phase 0–12)

| Phase | Name | Scope | Exit Criteria |
|---|---|---|---|
| **0** | Project Setup | Repo scaffold, `package.json`, folder structure (§10), CI skeleton | `npm test` runs (even with zero tests) |
| **1** | Lexer | Tokenize all literals, keywords, operators (incl. multi-word comparisons), comments | `pari --tokens` correct on all §20 examples |
| **2** | Parser & AST | Recursive-descent parser, full AST node set, precedence-climbing expressions | `pari --ast` correct on all §20 examples |
| **3** | Semantic Analyzer | Symbol tables, type inference, P001–P005 checks | Every error-code example in §18 triggers exactly its documented code |
| **4** | Interpreter Core | Variable/const eval, arithmetic, comparisons, `say`/`ask` | Hello World + Calculator examples run correctly |
| **5** | Control Flow | `if`/`else`, `choose`/`option`/`other` (incl. `P002`/`P007` checks), `repeat` (+ counter), `while`, `break`, `continue` | FizzBuzz + Break/Continue + Day-of-Week (`choose`) examples run correctly |
| **6** | Functions | `task` declaration/call, parameters, `return`, recursion, call stack | Grade Checker example runs correctly; a recursive factorial example runs correctly |
| **7** | Built-ins & Runtime Polish | `round`, `random`, `number`, `text`, `type`, `len`; P006 runtime errors | All built-ins covered by unit tests; malformed `number()` input raises P006 cleanly |
| **8** | CLI & Release Hardening | `--tokens`, `--ast`, `--analyze`, `--version`, `--help`, error formatting (code/message/location/call-stack/hint on every stage), `npm link` install, README | All CLI flags function from Bash, PowerShell, and Command Prompt; every error class carries a helpful suggestion; all example programs run correctly end-to-end |

**Note on phase numbering:** the granular Phase 0–8 breakdown above was the original plan. In practice, delivery was tracked as five larger milestones — Foundation (0), Lexer (1), Parser (2), Semantic Analyzer (3), and a single Interpreter milestone (4) that covered this table's Phases 4–7 together (interpreter core, control flow, functions, and built-ins were implemented as one coherent pass rather than four separate ones) — followed by an integration/hardening milestone (5) that fulfilled this table's Phase 8 and additionally audited every stage against this document, closing gaps found in the process (see the Phase 5 audit findings referenced throughout §13–§18).

Two further milestones followed the same "audit, then finish" pattern rather than adding new language features: a **Phase 6** dedicated to hardening the runtime layer itself (§17 — explicit `EnvironmentStack`/`CallStack`, boxed `RuntimeValue`s, a `BuiltinRegistry`, and defensive re-checks per §17.7), and a **Phase 7** dedicated to the CLI as a standalone developer tool (§19.1–§19.2 — exit codes, "did you mean" diagnostics, and robust file handling), independent of this table's original Phase 8 framing of CLI work as a one-time release-hardening step.

A final **Phase 8** milestone re-audited the entire specification end-to-end — every keyword, rule, built-in, and error code individually re-verified, not just the CLI/runtime layers the two prior milestones focused on — producing the v1.0 Release Candidate 1 referenced in earlier drafts of this document's Status field. Full results are in `docs/PHASE8_AUDIT_REPORT.md` and `docs/RELEASE_NOTES.md`; a design proposal for a future collections feature (explicitly out of v1.0 scope per §26) is in `docs/ARRAYS_DESIGN.md`, pending a keyword decision before any implementation begins.

**Phase 8.5 — Release Readiness** promoted that Release Candidate to the v1.0 stable release referenced in this document's current Status field. Scope was strictly packaging and documentation, not implementation: a repository-wide consistency review (reconciling stale doc references — e.g. a `tests/golden/` folder that had never actually been created — against the real file tree), removal of a leftover scratch file and two small dead-code paths (an unused registry re-export, unused logger methods) with zero behavioral change (`npm test` re-verified at 361/361 both before and after), a package version bump (`0.1.0` → `1.0.0`, retiring the "pre-release implementation" framing now that the language and compiler versions have converged), and the addition of standard open-source packaging files (`LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`). No keyword, grammar rule, built-in, error code, or CLI flag changed. Full verification results: `docs/RELEASE_VERIFICATION_REPORT.md`.

**Phase 9 — Arrays** is the first genuine language-surface addition since the Phase 8 audit: the `box` keyword, `[...]` indexing/assignment, and seven new built-ins (`push`/`pop`/`insert`/`remove`/`sort`/`reverse`/`contains`), fully specified in [§28](#28-arrays-phase-9). This resolves the one open item `docs/ARRAYS_DESIGN.md` had been left waiting on since Phase 8 (§9's "what keyword should represent arrays?") and implements it end-to-end — Lexer through CLI/docs/tests — exactly as that design document's §8 "changes by layer" table anticipated, with three deliberate departures from its own recommendations (all made by explicit instruction, not inferred): 0-based indexing rather than 1-based, reference semantics rather than value semantics, and bracket indexing layered on top of keyword-call construction rather than picking only one literal style. Bytecode/PVM work remained untouched in this phase specifically, per its own explicit scope boundary — it followed immediately after, as Phase 10.

**Phase 10 — Bytecode Generator** added the first alternative execution backend: AST → Parithi Bytecode (`.pbc`), fully specified in [§29](#29-bytecode-phase-10). Explicitly scoped to *generation only* — the Parithi Virtual Machine that would execute a `.pbc` file (§23 item 2) is not part of this phase, and remains future work. Zero lines changed in `src/lexer/`, `src/parser/`, `src/ast/`, `src/semantic/`, or `src/interpreter/` — the Tree-Walking Interpreter is byte-for-byte the same code that shipped in Phase 9, verified by the full pre-existing test suite passing unchanged (454/454, both before and after this phase) alongside 54 new bytecode-specific tests (508/508 total). The two new CLI flags (`--bytecode`, `--compile`) are purely additive; `pari <file.pr>` with no flag is unaffected.

**Phase 11 — Parithi Virtual Machine** closed the gap Phase 10 deliberately left open: a real execution engine for the bytecode it generates, fully specified in [§30](#30-parithi-virtual-machine-phase-11). Zero lines changed in `src/lexer/`, `src/parser/`, `src/ast/`, `src/semantic/`, `src/interpreter/`, `src/runtime/`, or anywhere under `src/bytecode/` — every one of those, and Phase 10's Generator/Validator/constant-pool/binary-format specifically, are exactly as they were left. Reused rather than reimplemented wherever a single correct implementation already existed (array semantics, built-ins, deep equality, value rendering — §30.2), which is what turned "the PVM must behave exactly like the Interpreter" into a mechanically-checked fact rather than a hope: `tests/vm-parity.test.js` runs 39 programs through both backends and asserts identical output, exit codes, and error codes (§30.11). 632/632 tests pass (508 pre-Phase-11 + 123 new + 1 from a Phase 10 binary-format bugfix found by this phase's own validation — §29.7). `pari <file.pbc>` (auto-detected) and `pari --run-bytecode <file>` are purely additive; `pari <file.pr>` with no flag is unaffected.

**Phase 12 — Bytecode Optimizer** added the final piece of the roadmap's original three-stage bytecode plan (§23 items 1–3): an optional post-processing stage between the Generator and the Validator/PVM, fully specified in [§31](#31-bytecode-optimizer-phase-12). Zero lines changed in `src/lexer/`, `src/parser/`, `src/ast/`, `src/semantic/`, `src/interpreter/`, `src/runtime/`, anywhere under `src/bytecode/`, or anywhere under `src/vm/` — every protected module from Phases 9–11 is exactly as it was left; only a new, additive `src/optimizer/` module and a handful of `src/cli/` lines (three new flags, composing with existing ones — §31.9) were added. 8 ordered passes (constant folding, constant propagation, dead-code/jump/peephole/stack/constant-pool optimization, and a final jump-target repair), re-validated by the unmodified Phase 10 Validator after every single pass, swept to convergence rather than run once (§31.9's worked example — one pass exposing an opportunity for an earlier one, resolved by re-sweeping the whole ordered sequence rather than reordering it). `tests/optimizer.test.js`'s 54 tests prove every pass's own claim independently, and its regression suite proves optimized-PVM output matches the unmodified Interpreter's — the identical parity method §30.11 established, now covering a third execution path. 695/695 tests pass (632 pre-Phase-12 + 54 new optimizer tests + 9 new CLI tests). `--optimize`/`--stats`/`--disassemble` are purely additive; `pari <file.pr>`/`pari <file.pbc>` with no such flag are unaffected.

---

## 23. Future Roadmap

Ordered by planned sequence, each stage additive and non-breaking to existing `.pr` source:

1. **Bytecode Generator** — ✅ **shipped in Phase 10** ([§29](#29-bytecode-phase-10)). Compiles the validated AST into Parithi Bytecode (`.pbc`), a flat, stack-oriented instruction set, reached via `--bytecode`/`--compile`. The semantic analyzer's output (the same validated AST the Interpreter uses) is the compiler's input, unmodified — no front-end work was repeated, exactly as planned here.
2. **Parithi Virtual Machine (PVM)** — ✅ **shipped in Phase 11** ([§30](#30-parithi-virtual-machine-phase-11)). A stack-based VM executing the `.pbc` Phase 10 produces, reached via `pari <file.pbc>`/`--run-bytecode`. Still **not** the default for a bare `pari <file.pr>` — that remains the Tree-Walking Interpreter, per this item's own original framing of the PVM as an eventual, not immediate, default; switching the default (and correspondingly gating the Interpreter behind a `--interpret` flag) remains a future, separate decision, not automatically implied by the PVM existing.
3. **Optimizer Pass** — ✅ **shipped in Phase 12** ([§31](#31-bytecode-optimizer-phase-12)). 8 ordered passes (constant folding/propagation, dead-code/jump/peephole/stack/constant-pool optimization, plus a final jump-target repair) operating on the bytecode between the Generator and the Validator/PVM, reached via `--optimize`/`--stats`/`--disassemble` or combined with `--compile`/`--run-bytecode`/`--bytecode`. Not the default — a plain `pari <file.pr>`/`pari <file.pbc>` is unaffected unless one of these flags is given.
4. **Collections — Maps** — Lists shipped in Phase 9 as Arrays (`box`, [§28](#28-arrays-phase-9)); a key-value Map type remains future work, along with dedicated list-iteration support (`repeat item as x in list`) — arrays are iterated today via `repeat n as i` + indexing, per [§28.4](#284-iteration).
5. **Object-Oriented Programming** — a minimal `type`-block construct (name TBD, to avoid clashing with the existing `type()` built-in) for user-defined structured records with methods.
6. **Module System** — `import`/multi-file program support, once single-file programs stop being sufficient for the target audience's projects.
7. **Native Compilation** — 🔶 **a genuine but minimal foundation shipped, Phase 13** ([§33](#33-native-compiler-phase-13-x86-64-backend)). Not via LLVM or a transpile-to-C step (neither was available on the build machine — no C compiler/assembler/linker of any kind was found) — instead, a hand-written x86-64 encoder and PE32+ writer, built directly from the AST (a Native IR sits between them, §33.4), producing a real, standalone `.exe` reached via `--native`. Today compiles only `say` with String literal arguments (§33.9); variables, arithmetic, control flow, and functions remain future work (§33.14), each gated behind the same "no feature without dedicated execution tests" discipline this item was shipped under.
8. **Loop-aware optimizations** — loop-invariant code motion, strength reduction: the class of optimization that would meaningfully speed up a *loop body* rather than shrink a program's static instruction count (§31.11's own honest finding — Phase 12's passes reduce instruction count reliably, but a tight loop's wall-clock time tracks iteration count far more than static size). Not started.
9. **Standard Library** — 🔶 **in progress, Phase 13** ([§32](#32-standard-library-phase-13)). Sub-phase 13a shipped: Math/String/Array/Type/System, ~45 new built-ins. Sub-phases 13b (File), 13c (JSON), 13d (Date & Time), and 13e (HTTP, deliberately last — §32.10) remain.

---

## 24. Testing Strategy

| Test Layer | What It Covers | Tooling |
|---|---|---|
| **Unit — Lexer** | Every token type, multi-word comparison lexing, comment stripping, edge cases (empty file, unterminated string) | `node:test`, table-driven cases |
| **Unit — Parser** | Every AST node shape, operator precedence/associativity (§13.5 examples), block-termination mismatches | `node:test`, snapshot comparison against expected AST JSON |
| **Unit — Semantic Analyzer** | Every error code P001–P005 triggers on its documented example and *only* that code; valid programs produce zero errors | `node:test` |
| **Unit — Interpreter** | Arithmetic/comparison/logical evaluation, scope shadowing (§14.3 example), recursion, built-ins (§16.5) | `node:test` |
| **Integration — Golden Files** | Each file in `examples/` has its expected stdout asserted against a full lex→parse→analyze→interpret run | `tests/e2e.test.js` (in-process) and `tests/cli.test.js` (spawns the real `pari` binary) |
| **Error-Path Tests** | Every error code has a fixture `.pr` file that must fail with exactly that code | `node:test` |
| **Unit — Bytecode Generator** (Phase 10) | Every construct's compiled shape, Validator soundness (stack balance, jump/constant/argCount checks) on every real example plus large/nested/recursive programs, binary/text writer round-trip fidelity | `tests/bytecode.test.js`, `tests/cli.test.js` |
| **Unit — PVM** (Phase 11) | Every opcode, every runtime object, recursion/nested-task frame resolution, arrays, built-ins, stack overflow, every category of invalid/corrupted hand-built bytecode | `tests/vm.test.js` |
| **Parity — Interpreter vs. PVM** (Phase 11) | Identical console output, exit code, and error code from BOTH backends, for every construct plus all real examples | `tests/vm-parity.test.js` |
| **Unit — Bytecode Optimizer** (Phase 12) | Each of the 8 passes tested independently — the exact transformation it claims, and what it deliberately leaves alone (div-by-zero, arrays, parameters, side-effecting opcodes before `POP`); `PassManager`'s rejection of invalid pass output | `tests/optimizer.test.js` |
| **Parity — Interpreter vs. optimized PVM** (Phase 12) | Identical console output, exit/error code between the unmodified Interpreter and Generator→Optimizer→PVM, for every construct plus all real examples plus a 10,000+ instruction program | `tests/optimizer.test.js` |
| **Unit — Standard Library** (Phase 13) | Every new built-in's normal cases, invalid arguments/counts, domain/range errors (P028/P029), and Unicode strings, by category | `tests/math.test.js`, `tests/string.test.js`, `tests/array.test.js`, `tests/stdlib.test.js` |
| **Parity — Interpreter vs. PVM, Standard Library** (Phase 13) | Identical console output/exit/error code from both backends for every new built-in in every stdlib category | `tests/stdlib.test.js` |
| **Regression** | Any bug fix gets a permanent minimal-repro test added to the relevant suite | Manual discipline, enforced at PR review |

**Coverage target:** ≥90% line coverage on `lexer/`, `parser/`, and `semantic/`; the interpreter and built-ins are covered primarily through the golden-file integration suite, since their correctness is best judged by end-to-end program output rather than line coverage alone.

---

## 25. Project Directory Structure Reference

(Full detail already given in [§10](#10-project-folder-structure); repeated here as the canonical reference for onboarding.)

```
parithi/
├── bin/pari.js
├── src/
│   ├── lexer/{lexer.js, token.js, keywords.js}
│   ├── ast/{ast-nodes.js, ast-builder.js, ast-printer.js}
│   ├── parser/{parser.js, token-stream.js, parse-context.js, parse-error.js}
│   ├── semantic/{analyzer.js, symbol-table.js, scope-manager.js, type-checker.js, types.js, semantic-error.js}
│   ├── interpreter/{interpreter.js, signals.js, stringify.js, stdin.js, builtins/{index.js, math.js, type.js, text.js, array.js}}
│   ├── runtime/{environment.js, environment-stack.js, call-stack.js, runtime.js, execution-context.js, runtime-value.js, builtin-registry.js}
│   ├── errors/{error-codes.js, source-location.js, compiler-error.js, runtime-error.js, index.js}
│   ├── utils/{logger.js, colors.js, messages.js}
│   ├── cli/{args.js, commands.js, cli-error.js, exit-codes.js, version-info.js, suggestions.js, screens.js}
│   ├── bytecode/{opcode.js, instruction.js, constant-pool.js, label.js, bytecode-builder.js, bytecode-generator.js, validator.js, bytecode-writer.js, index.js} — Phase 10
│   ├── vm/{virtual-machine.js, instruction-dispatcher.js, frame.js, stack.js, heap.js, memory.js, loader.js, builtins.js, runtime-values.js, vm-errors.js, debugger.js, index.js} — Phase 11
│   ├── optimizer/{optimizer.js, pass-manager.js, optimizer-error.js, program-utils.js, statistics.js, optimizer-report.js, passes/{constant-folding,constant-propagation,dead-code-elimination,jump-optimization,peephole-optimization,stack-optimization,constant-pool-optimization,label-cleanup}.js, index.js} — Phase 12
│   ├── stdlib/{math,string,array,type}/index.js, system/{index.js, program-args.js} — Phase 13a (§32); file/, json/, datetime/, http/ pending (13b-13e)
│   └── native/{native-compiler.js, errors.js, codegen/{native-codegen.js, x86-64-encoder.js}, pe/{pe-writer.js, rdata-builder.js}} — Phase 13 native backend (§33), expanded Phase 17 (§37); compile-time-constant-foldable `say`/`hold`/`const`/assignment
├── examples/*.pr, stdlib/{calculator,random-number-generator,array-demo,string-utilities}.pr (Phase 13a), native/{hello,strings,variables}.pr (Phase 13/17 native — the only programs that genuinely compile natively today)
├── tests/foundation.test.js + {lexer,parser,semantic,interpreter}.test.js (added per phase) + e2e.test.js + error-messages.test.js (Phase 5) + runtime.test.js (Phase 6) + cli.test.js + bytecode.test.js (Phase 10) + vm.test.js + vm-parity.test.js (Phase 11) + optimizer.test.js (Phase 12) + math.test.js + string.test.js + array.test.js + stdlib.test.js (Phase 13) + native/native-compiler.test.js (Phase 13 native — actually executes generated .exe files) + fixtures/ (Phase 7)
├── benchmarks/optimizer-benchmark.mjs (Phase 12), native-benchmark.mjs (Phase 13 native — Hello World only, see §33.12) — dev tools, not part of the shipped package
├── docs/{MASTER_DOCUMENT.md, ARRAYS_DESIGN.md, PHASE8_AUDIT_REPORT.md, RELEASE_NOTES.md, RELEASE_VERIFICATION_REPORT.md, OPTIMIZER_BENCHMARKS.md}
├── package.json
├── .gitignore
├── LICENSE
├── CHANGELOG.md
├── CONTRIBUTING.md
└── README.md
```

---

## 26. Future Enhancements

Deliberately excluded from v1.0, tracked here so scope stays explicit rather than accidental:

- **Maps / dictionaries** — Arrays (`box`, [§28](#28-arrays-phase-9)) shipped in Phase 9; a key-value collection type remains future work (§23.4).
- **Dedicated list-iteration syntax** (`repeat item as x in list`) — arrays are iterated today via `repeat n as i` combined with indexing ([§28.4](#284-iteration)); a first-class form is still on the roadmap (§23.4).
- **Object-Oriented Programming** — no classes/structs/methods in v1.0 (§23.5).
- **Modules / multi-file programs** — v1.0 is strictly single-file (§23.6).
- **String indexing/slicing** — only `len()` is provided for String in v1.0; character access is future work.
- **`else if` keyword** — v1.0 requires nested `if`/`end if` (§15.1); a dedicated keyword may be added later without breaking existing programs (nested form would remain valid).
- **Grouped `option` values** (e.g., `option 1, 2` matching either) — v1.0's `choose` ([§15.2](#152-choose-switch-statement)) requires exactly one literal per `option`; grouping is a natural, non-breaking future addition once there's real demand for it.
- **Full, untruncated call-stack traces** — v1.0 reports the innermost 2 call-stack frames plus a count of how many more are pinned beneath them (e.g. `... (498 more)`, see the P021 example in §18); complete N-frame traces are planned alongside the PVM work.
- **Optimizer + Native compilation** — Bytecode generation (Phase 10, [§29](#29-bytecode-phase-10)) and execution (Phase 11's PVM, [§30](#30-parithi-virtual-machine-phase-11)) both shipped; optimizing the bytecode between them, and compiling it further to native code, remain future work — see the full roadmap in [§23](#23-future-roadmap).
- **PVM as the default backend** — the PVM (§30) exists and is proven output-identical to the Interpreter (§30.11), but `pari <file.pr>` still runs on the Tree-Walking Interpreter by default; switching the default (and gating the Interpreter behind `--interpret`) is a deliberate future decision, not implied by the PVM's existence (§23 item 2).
- **A step-debugger, profiler, or GC** for the PVM — `src/vm/debugger.js`'s `Heap`/`Memory`/`Debugger` classes (§30.4, §30.10) are the seams these would extend, deliberately left minimal until one is actually needed.
- **File / JSON / Date & Time / HTTP standard library** — Phase 13 (§32) sub-phases 13b–13e; Math/String/Array/Type/System (13a) shipped. HTTP is deliberately last (§32.10) — it is the one library needing an actual concurrency-bridging decision (`worker_threads`/`Atomics.wait`, shelling out, or a real dependency) in an otherwise fully synchronous, zero-dependency codebase.
- **Native compilation of the rest of the language** — Phase 13's native backend (§33), expanded in Phase 17 (§37), compiles `say`/`hold`/`const`/assignment built from compile-time-constant-foldable literals, variables, arithmetic, comparisons, and unary operators; real control flow (`if`/`while`/`loop`), functions/recursion, and every Standard Library built-in remain future work, in the order recommended at §33.14. Only Windows x86-64 is targeted — Linux/macOS/ARM64 native targets are explicitly out of scope until the current target's language coverage is much broader.

---

## 27. Conclusion

Parithi v1.0 is scoped to be small enough to build with confidence and complete enough to be genuinely useful for learning: real variables with real static typing, real control flow, real functions with recursion, and a real (if compact) built-in library — all delivered through an honest lexer → parser → AST → semantic analyzer → interpreter pipeline rather than a shortcut string-matching engine. The corrections applied in [§2](#2-design-corrections-applied-to-the-original-plan) close the gaps that would otherwise have surfaced mid-implementation (an unrunnable scope example, an unlexable operator, undefined precedence for unary/exponent operators, and several unspecified built-in behaviors), so the remaining work is now a matter of execution against Phases 0–8 (§22), not further design discovery.

The architecture's central bet — that swapping the tree-walking interpreter for a bytecode compiler and VM later should require zero changes to the Lexer, Parser, or AST — is what makes the roadmap in §23 credible. Every future item (bytecode, PVM, optimizer, collections, OOP, modules, native compilation) is additive to this document, not a rewrite of it.

---

## 28. Arrays (Phase 9)

Added after this document's original v1.0 Conclusion (§27) — numbered 28 rather than inserted earlier and renumbering everything after it, so every existing `§N` cross-reference elsewhere in this document, and in `README.md`/`CHANGELOG.md`/`docs/RELEASE_NOTES.md`/`docs/PHASE8_AUDIT_REPORT.md`, stays valid. This is Parithi's first language-surface addition since the Phase 8 audit, and it resolves the single open question `docs/ARRAYS_DESIGN.md` was deliberately left waiting on: *what keyword should represent arrays?* — answered: **`box`**.

### 28.1 Design Decisions

`docs/ARRAYS_DESIGN.md` (written during Phase 8.5) laid out five open questions and, for four of them, a recommendation. Phase 9 answers all five — three by taking the recommendation, two by deliberately overriding it (both by explicit instruction, not inferred):

| # | Question | `ARRAYS_DESIGN.md` recommended | Phase 9 shipped | Followed recommendation? |
|---|---|---|---|---|
| 1 | Keyword | *(none — this was the blocking question)* | `box` | — |
| 2 | Value vs. reference semantics | Value (copy-on-assign) | **Reference** — `hold b = a` aliases the same array; mutating one mutates both | **No**, by explicit instruction |
| 3 | 0- vs. 1-based indexing | 1-based, for consistency with `repeat`'s counter | **0-based** — `nums[0]` is the first element | **No**, by explicit instruction |
| 4 | Literal/access syntax | Keyword-call literal + `get`/`set` built-ins (avoids new grammar entirely) | Keyword-call literal (`box(...)`) **for construction**, but **bracket indexing** (`nums[0]`) for access | Partially — construction followed the recommendation, access took the alternative (readability at the call site, at the cost of one new symbol category: `[` `]`) |
| 5 | Homogeneous vs. mixed element types | Homogeneous, type-locked on first element | **Homogeneous**, with one refinement: `empty` never conflicts with the locked type, in either direction (mirroring `hold`'s own "empty stays open" rule, §14.4) | Yes, with the stated refinement |

Two consequences worth stating explicitly, since they follow from the above but aren't obvious on their own:

- **Reference semantics + deep equality are not in tension.** They govern different operations. Assignment/parameter-passing (`hold b = a`, `first(nums)`) shares the underlying array — that's what "reference semantics" means. The `==`/`!=` operators and `contains()` compare *structurally* (element-by-element, recursively) — two separately-constructed arrays with the same elements are `==`, even though they are not the same reference. Every other Parithi type already has "reference identity" and "structural equality" coincide (a scalar *is* its own value), so this is the first place the two ideas visibly diverge — see §28.3.
- **Array is a flat, non-parameterized static type.** There is no "Array of Number" vs. "Array of String" distinction in the type system — every array's static type is simply `Array` (§12.2). This is why `nums[0]`'s inferred type is `Unknown` rather than, say, `Number` (§28.2), and why two arrays holding different element types are still the *same static type* for the purposes of assignment compatibility (only §28.3's homogeneity rule — checked separately, per-array, at construction/mutation time — constrains what a single array may itself contain).

### 28.2 Syntax

**Construction** — a keyword-call literal, reusing the exact grammar Parithi already has for function calls:

```
hold numbers = box(10, 20, 30)
hold empty1 = box()
hold matrix = box(box(1, 2), box(3, 4))
```

**Indexing** — bracket syntax, 0-based, the one new symbol category `[` `]` introduces (previously lexed as `PUNCTUATION` but unused by any grammar rule):

```
say numbers[0]        # 10
say matrix[1][0]      # 3 — chained indexing, same "postfix" tier as a function call's "(...)"
```

**Assignment** — indexing on the left of `=`:

```
numbers[1] = 100
matrix[0][1] = 99
```

Grammar-wise, `[<expr>]` is a postfix operator applied after any primary expression — an identifier, a function call, a `box(...)` literal, or another `[<expr>]` — at the same precedence tier a function call's `(...)` already occupies (§13.5 is otherwise unaffected). The parser determines whether a line is a plain assignment or an array assignment by parsing the full left-hand expression first and inspecting its resulting node type (`Identifier` → `Assignment`; `ArrayAccess` → `ArrayAssignment`; anything else → `P011`, invalid assignment target) — not by a fixed-shape lookahead, so an arbitrarily complex index expression (`numbers[i + 1] = 100`) needs no special-casing.

### 28.3 Semantics

- **Reference semantics.** An array value is never copied on assignment, parameter-passing, or return — `hold b = a` makes `b` and `a` the same underlying array. `ListValue.copy()` (`src/runtime/runtime-value.js`) deliberately returns `this` rather than cloning, the one deliberate exception among the six `RuntimeValue` subclasses (every scalar type's `copy()` clones, harmlessly, since scalars have no shared state to protect).
- **Deep equality.** `==`/`!=` between two arrays (and `contains()`'s membership test) compare structurally and recursively — `box(1, 2) == box(1, 2)` is `true` even though they're different objects. See §28.1's note on why this doesn't conflict with reference semantics.
- **Element-type homogeneity.** Every element of a given array must be the same static type, with one exception: `empty` never conflicts with the array's established type, in either direction (an array can hold a mix of, say, Numbers and `empty`, but not Numbers and Strings). "Established type" is derived from the array's first non-`empty` element — construction (`box(1, "x")`) checks all elements at once; mutation (`push`/`insert`/index-assignment) checks the new value against whatever's already there. Violating this raises `P026` (§28.6).
- **Flat element type.** Indexing an array (`nums[0]`) always infers as `Unknown` in the static type system — there is no per-array memory of "this holds Numbers," only the runtime homogeneity check above. This is a deliberate simplification (§28.1): it means `hold first = nums[0]` behaves exactly like assigning from a function parameter (open, unlocked type, per §14.4), rather than requiring a parameterized type system Parithi's grammar has no other use for.
- **Index normalization.** A non-integer (Decimal) index is truncated toward zero before use — the same rule `stop <expr>` already applies to its own Decimal exit-code argument (§15.7) — rather than being rejected outright or inventing a second truncation convention.
- **Bounds are runtime-only.** Whether an index is in range depends on the array's actual length at the moment of access, which is a runtime fact even when the index itself is a compile-time-constant literal (the array could have grown or shrunk since construction) — so out-of-range access is *always* a `P024`/`P027` runtime error, never a compile-time one, mirroring how `P020` (division by zero) works today.
- **Non-array indexing target.** Whether `expr[i]` is even valid depends on `expr`'s type. When that's statically knowable (`hold x = 5` then `x[0]`), it's rejected at Semantic Analysis (`P025`). When it isn't (an `Unknown`-typed function parameter), the same check runs defensively at Interpretation time instead — see §28.6's phase table.

### 28.4 Iteration

There is no dedicated "for each" form in v1.0 (that remains future work — §23.4/§26). An array is iterated today by combining the existing `repeat ... as` counter with indexing, accounting for `repeat`'s 1-based counter against arrays' 0-based indices:

```
hold scores = box(88, 92, 79, 95)
hold total = 0
repeat len(scores) as i
    total = total + scores[i - 1]
end repeat
say total / len(scores)
```

### 28.5 Array Built-in Functions

All seven follow the same built-in-function calling convention as every other built-in (§16.3) — no new grammar, no dot/method syntax. Each is argument-checked at Semantic Analysis time where statically possible, and always defensively re-checked at Interpretation time (§17.7) — the same double-layered pattern `round()`/`number()`/`len()` already established.

| Function | Mutates in place? | Returns | Notes |
|---|---|---|---|
| `push(arr, item)` | Yes | `arr` itself | Appends to the end |
| `pop(arr)` | Yes | The removed element | `P024` if `arr` is empty |
| `insert(arr, index, item)` | Yes | `arr` itself | `index` may equal `arr`'s current length (equivalent to `push`) |
| `remove(arr, index)` | Yes | The removed element | Shifts later elements left |
| `sort(arr)` | Yes | `arr` itself | Ascending: numeric for Number/Decimal, lexicographic for String |
| `reverse(arr)` | Yes | `arr` itself | |
| `contains(arr, item)` | No | Boolean | Deep equality (§28.3), not reference equality |

`len(arr)` (§16.5) is the eighth array-aware built-in — extended, not new, since "how many characters" (String) and "how many elements" (Array) are the same underlying concept.

### 28.6 Array Error Codes

Continuing the existing P0xx sequence (§18):

| Code | Name | Phase | Trigger |
|---|---|---|---|
| **P024** | Array index out of range | Interpretation (always) | `nums[10]` on a 3-element array; `pop()` on an empty array; `insert()`/`remove()` at an invalid position. Never a compile-time check — see §28.3 |
| **P025** | Cannot index non-array value | Semantic Analysis, when statically knowable; Interpretation, defensively otherwise | `hold x = 5` then `x[0]`; or the same shape reached through an `Unknown`-typed function parameter |
| **P026** | Array element type mismatch | Semantic Analysis, when statically knowable (a `box(...)` literal's own elements); Interpretation, defensively otherwise (`push`/`insert`/index-assignment against an existing array's actual contents, or a literal built from `Unknown`-typed values) | `box(1, "two")`; `push(nums, "oops")` on a `box` of Numbers |
| **P027** | Negative array index | Interpretation (always) | `nums[-1]` |

A non-numeric index, and a non-Array argument to one of §28.5's built-ins, both reuse the existing **P002** (Type mismatch) rather than a new code — they're the same kind of problem (`round()` already raises P002 for a non-numeric argument; this is that same rule applied to a new type), not a new category.

### 28.7 Worked Example

See [`examples/arrays.pr`](../examples/arrays.pr), exercised end-to-end by `tests/e2e.test.js`:

```
hold fruits = box("apple", "banana", "cherry")
say fruits

push(fruits, "date")
say "After push:", fruits

hold removed = pop(fruits)
say "Popped:", removed
say "After pop:", fruits

sort(fruits)
say "Sorted:", fruits

say "Contains banana:", contains(fruits, "banana")
say "Total fruits:", len(fruits)
```

Output:

```
["apple", "banana", "cherry"]
After push: ["apple", "banana", "cherry", "date"]
Popped: date
After pop: ["apple", "banana", "cherry"]
Sorted: ["apple", "banana", "cherry"]
Contains banana: true
Total fruits: 3
```

(`say` renders an array bracketed, with String elements quoted — `["a", "b"]`, not `[a, b]` — so an array's printed form is unambiguous; see `stringifyArray()` in `src/runtime/runtime-value.js`.)

---

## 29. Bytecode (Phase 10)

Numbered 29, continuing straight on from §28 rather than being inserted
earlier and renumbering anything — the same reason §28 itself was appended
after the original §27 Conclusion (§28's own opening note explains it).

### 29.1 Overview and Scope

Phase 10 adds a **Bytecode Generator**: a new backend that translates a
semantically-valid AST into **Parithi Bytecode** (`.pbc`), completely
independent of the Tree-Walking Interpreter, which is untouched and remains
the default execution path for plain `pari <file.pr>`. The pipeline gains
one new, optional final stage:

```
Source (.pr) → Lexer → Parser → AST → Semantic Analyzer → Bytecode Generator → Parithi Bytecode (.pbc)
                                                    ↘ (existing, unchanged) Tree-Walking Interpreter → Output
```

The Generator consumes exactly the same AST the Interpreter does, and
**nothing upstream of it changed** — not one line in `src/lexer/`,
`src/parser/`, `src/ast/`, `src/semantic/`, or `src/interpreter/` was
modified for this phase (verified — `git diff`/file-by-file review shows
zero changes to those directories; only `src/bytecode/` is new, plus a
handful of `src/cli/` lines wiring up two new flags). This is the same
"additive, not a rewrite" discipline §27's closing paragraph committed to:
swapping in a new backend costs zero changes to the front end.

**What this phase deliberately does NOT include** (§23 item 2 — explicitly
out of scope, per the Phase 10 brief): the **Parithi Virtual Machine
(PVM)** that would actually *execute* a `.pbc` file. `readBytecodeBinary()`
(`src/bytecode/bytecode-writer.js`) exists only to verify the binary format
round-trips correctly — deserializing a `.pbc` file back into its
instruction/constant/function-table structure is not the same thing as
running it, and no opcode's runtime *behavior* (what `ADD` actually does to
two numbers, what happens on divide-by-zero) is implemented anywhere in
this phase. §29.2 documents the execution model the Generator's output
commits to, precisely enough to be unambiguous to whatever executes it —
Phase 11's PVM ([§30](#30-parithi-virtual-machine-phase-11)) now does,
implementing this exact model with no changes needed here.

### 29.2 Execution Model (implemented by the PVM — §30, Phase 11)

A stack-based machine with two independent stacks:

- **Operand stack** — where every instruction's inputs/outputs live.
  `compileExpression()` (`src/bytecode/bytecode-generator.js`) is the
  Generator's own invariant: compiling any expression node pushes **exactly
  one** value, regardless of the expression's internal complexity — the
  same "leave the stack as you found it, net zero, per statement" discipline
  extends to every `compileStatement()` call. This invariant is what
  `validateBytecode()`'s stack-balance check (§29.6) mechanically verifies.
- **Call stack** (§30.3's `Frame`) — one frame per active `CALL`, each frame a
  fresh, empty name→value map. This mirrors `Environment`/`EnvironmentStack`
  (§17.1–§17.2) directly: a `CALL` starts its callee with a *clean* operand
  stack (§29.6 seeds validation at depth 0 at every function entry point)
  and a clean local-variable frame, and `RETURN` pops that frame, leaving
  exactly the return value behind on the *caller's* operand stack.

**No scope-push/pop opcode exists** (the instruction set given for this
phase has none), because it isn't needed: `if`/`while`/`repeat`/`choose`
blocks share their enclosing function's single frame — only a `CALL` ever
creates a new one. What makes shadowing (§14.3) safe without one is
**compile-time slot mangling**: every `hold`/`const`/parameter/`repeat`
counter declaration gets a globally-unique name, `<name>$<n>` (`$` cannot
appear in a real Parithi identifier — §11.2 — so collision is impossible),
resolved once, at compile time, by a scope-stack chain in the Generator
that mirrors `SymbolTable`/`Environment`'s own parent-walk. Two `hold x`
declarations at different nesting depths become two different `LOAD`/
`STORE` targets; the PVM's `Frame` (§30.3) is just a flat map keyed by
these mangled names — never a source-level name directly.

**Task names are mangled exactly the same way**, through the *same* scope
chain as variables (Parithi puts both in one namespace — §16.3, §12.1's
audit note) — this is what lets a nested task share a name with an outer
one (`predeclareTask`/`compileTaskDeclaration` distinguish them; see the
worked example in §29.9) without the two colliding in the **function
table** (§29.4). Built-in names (`round`, `push`, etc.) are never mangled —
they're reserved and unshadowable (§16.5) — and `CALL` dispatches on
whichever the name resolves to: a mangled entry in the function table, or,
failing that, a raw built-in name, exactly mirroring
`Interpreter.visitFunctionCall`'s own `isBuiltinName(name) ? callBuiltin(...) : ...` check.

**Calling convention.** A `CALL <name>, <argCount>` instruction's `argCount`
values are already on the operand stack (pushed by compiling each argument
expression, left to right — §29.5's N-ary convention). The PVM's `CALL`
handler (§30.5): pops `argCount` values (un-reversing them back to
source order); creates a new frame; binds them, in order, to the callee's
`paramSlots` (from the function table); pushes that frame; and jumps to the
callee's `entryIndex`. `RETURN` pops the current frame and leaves the one
value already on the operand stack (pushed by `compileReturnStatement`,
which always compiles a value — even a bare `return`, or falling off the
end of a function body, pushes `empty` first — §16.2/§16.4) for the caller.

**Arrays keep their reference semantics with zero extra machinery**
(§28.3): `LOAD` pushes whatever the frame's map holds for that slot — for
an array, that's the same underlying collection reference `ARRAY_NEW`
built, never a copy — so a builtin like `push()` that mutates its first
argument in place is correctly visible to every alias, exactly like the
Interpreter, with no bytecode-level distinction needed between "scalar"
and "reference" values.

**Deep equality.** `EQ`/`NE` must implement *structural*, not reference,
equality (matching `Interpreter.visitBinaryExpression`'s `deepEquals()` —
§28.3) — this is a property of what a correct PVM's `EQ` does, not
something the Generator needs to encode differently; it always emits plain
`EQ` for `==`, regardless of operand type.

### 29.3 Instruction Set Reference

26 opcodes (`src/bytecode/opcode.js`), fewer than the number of AST node
types they replace — many statement/expression *shapes* (an `if`, a
`while`, a short-circuit `and`) compile down to a handful of these,
composed with jumps, rather than each getting a dedicated opcode.

| Opcode | Operands | Stack effect | Meaning |
|---|---|---|---|
| `PUSH` | const | +1 | Push a constant-pool value |
| `POP` | — | -1 | Discard the top value (every `ExpressionStatement`'s result) |
| `LOAD` | const (name) | +1 | Push the current frame's value for this slot |
| `STORE` | const (name) | -1 | Pop and store into this slot |
| `ADD` `SUB` `MUL` `DIV` `MOD` `POW` | — | -1 | Pop right, pop left, push `left OP right` |
| `NEG` | — | 0 | Pop, push its arithmetic negation |
| `EQ` `NE` `GT` `LT` `GE` `LE` | — | -1 | Pop right, pop left, push a Boolean (`EQ`/`NE` are deep/structural — §29.2) |
| `AND` `OR` | — | -1 | Eager (non-short-circuit) boolean combine — **defined but never emitted** for `and`/`or`, which are short-circuiting; see §29.5 |
| `NOT` | — | 0 | Pop, push its logical negation |
| `JMP` | target | 0 | Unconditional jump |
| `JMP_IF_TRUE` / `JMP_IF_FALSE` | target | -1 | Pop; jump if the popped value matches, else fall through |
| `CALL` | const (name), count | `1 − count` | Pop `count` args (un-reversed), invoke, push the result — §29.2 |
| `RETURN` | — | 0* | End the current function; the value already on the stack becomes the call's result (*0 at the operand-stack level; the frame stack pops one — §29.2) |
| `PRINT` | count | `−count` | Pop `count` values (un-reversed), write them space-joined + a newline (`say`) |
| `INPUT` | — | 0 | Pop a prompt, write it, push the line read (`ask(...)`) |
| `ARRAY_NEW` | count | `1 − count` | Pop `count` values (un-reversed), push a new array (`box(...)`) |
| `ARRAY_GET` | — | -1 | Pop index, pop array, push the element |
| `ARRAY_SET` | — | -3 | Pop index, pop value, pop array; write; push nothing |
| `HALT` | — | -1 | Pop an exit code; stop. Always reached with exactly one pending value — see §29.5 |

Every opcode's arity and stack effect is declared exactly once
(`OPCODE_INFO` in `opcode.js`) and consumed identically by the Generator,
the Validator, and both writers — one source of truth rather than three
hand-synchronized copies.

### 29.4 Constant Pool and Function Table

**Constant pool** (`src/bytecode/constant-pool.js`) — every literal value
and every mangled name `PUSH`/`LOAD`/`STORE`/`CALL` reference, deduplicated
by *(type, value)* so `PUSH 5` appearing twice in a program is one pool
entry, not two. Keyed by type, not raw JS value — a Number `5` and a
Decimal `5` (from a literal written `5.0`) are different Parithi values
(§12.2) even though `5 === 5.0` in JS, so they get separate entries.
Variable/function names are pooled as plain Strings — a name is, at this
layer, just a piece of text like any other.

**Function table** — one entry per `task` declaration:
`{ name (mangled), paramSlots (mangled, in order), entryIndex, isNested }`.
`isNested` is `true` only when the task is declared lexically *inside
another task's body* (not merely inside an `if`/`while`/`repeat`/`choose`
block at the top level, which shares its enclosing scope's frame — §29.2)
— read by the PVM's `CALL` handler to pick the new frame's `lexicalParent`
(§30.3); not consulted by anything else in this phase.

### 29.5 Labels and Control-Flow Patterns

`src/bytecode/label.js` — a `Label` is a placeholder used only during
generation (a forward jump like `if`'s `JMP_IF_FALSE` needs a target that
doesn't exist yet); `BytecodeBuilder.resolve()` replaces every `Label`
operand with its concrete instruction index in one pass once generation is
done, throwing if a label was ever referenced but never placed.

**N-ary convention** (`say a, b, c`; `box(1, 2, 3)`; a call's arguments):
sub-expressions are pushed in left-to-right source order — so the *last*
one ends up on top of the stack — and the consuming opcode (`PRINT`/
`ARRAY_NEW`/`CALL`) pops that many values and **reverses** them to recover
source order before using them. This generalizes the same rule every
binary operator already follows for exactly two operands (`ADD` pops the
*right* operand first, since it was pushed second/is on top).

**`if`/`else`:** condition, `JMP_IF_FALSE` to the else-branch-or-end label,
then-branch, (`JMP` to end + else-branch, if present), end label.

**Short-circuit `and`/`or`** (§13.7, §29.2's note on `AND`/`OR`): compile
`left`; `JMP_IF_FALSE`/`JMP_IF_TRUE` to a "short" label; compile `right`;
`JMP` to end; at the short label, `PUSH` the short-circuit result
(`false`/`true`); end label. This keeps bytecode behaviorally identical to
`Interpreter.visitBinaryExpression` even when the unevaluated side would
have thrown (e.g. `false and (1 / 0 > 0)` never reaches the division).

**`while`:** condition label; condition; `JMP_IF_FALSE` to end; body;
unconditional `JMP` back to the condition label; end label. `break`/
`continue` are `JMP`s to the end/condition labels respectively.

**`repeat n as i`:** the count expression is evaluated once (matching
`Interpreter.visitRepeatStatement`, which reads `count` before the loop
starts) and stashed in a hidden slot alongside the counter; `continue`
jumps to the *increment* step (not straight back to the condition), so a
bare `continue` still advances the counter — exactly like the JS `for`
loop the Interpreter itself compiles down to.

**`choose`/`option`/`other`:** the discriminant is evaluated once and
stashed in a hidden slot (there is no `DUP` in this instruction set), then
re-`LOAD`ed before each option's `EQ` comparison; each match is a
`JMP_IF_TRUE` to that option's body; no match falls through to `other` (or
straight to the end, if there's no `other` clause) — preserving "exactly
one clause runs, no fall-through" (§15.2).

**`task` declarations:** an unconditional `JMP` skips over the compiled
body during normal top-to-bottom flow (a function's code is only ever
*reached* via `CALL`, never fallen into); the body always ends with an
implicit `PUSH empty; RETURN` after its last statement, even when every
reachable path already returned explicitly — matching
`Interpreter.callFunction`'s "fell through with no return ⇒ implicit
empty" (§16.2), and harmless dead code on the paths that don't need it.

**Program/function termination.** Every `HALT` and `RETURN` is reached
with exactly one pending value by construction: a `stop [code]` statement
compiles `code` (or `0`, if bare) then `HALT`; the top-level program always
ends with an appended `PUSH 0; HALT` for normal (non-`stop`) termination;
every function body ends in `PUSH empty; RETURN` at minimum. `HALT`
popping a value, always, is why a plain, successful program still needs
that trailing `PUSH 0` — there's no bare "stop with no value" form at the
bytecode level, unlike `stop` in the language itself.

### 29.6 Validation

`validateBytecode()` (`src/bytecode/validator.js`) runs immediately after
generation, both for `--bytecode` and `--compile` (there is no way to skip
it) and checks four properties none of the Generator's control flow
structurally guarantees on its own:

1. **Constant references** — every `const`-kind operand indexes a real
   pool entry.
2. **Jump targets** — every `JMP`/`JMP_IF_TRUE`/`JMP_IF_FALSE` target, and
   every function table `entryIndex`, is a real instruction index.
3. **Argument counts** — a `CALL` naming a known task must pass exactly
   that task's declared parameter count (a call to a built-in is skipped —
   the built-in registry, §17.5, owns that arity, not the bytecode format).
4. **Stack balance** — a symbolic depth walk over every reachable
   instruction (a worklist algorithm, seeded fresh at depth 0 at
   instruction 0 *and* at every function's entry point, since a `CALL`
   never carries the caller's depth into the callee — §29.2), confirming
   every instruction reached by more than one path agrees on depth, that
   depth never goes negative, and that every `RETURN`/`HALT` is reached
   with exactly one pending value.

A validation failure is reported as an internal Generator bug (`Please
report it with the source file that triggered it`, `src/cli/commands.js`'s
`reportBytecodeBug`) — never as a defect in the *user's* program, since
Semantic Analysis already guaranteed the program itself is valid before
the Generator ever ran. In practice this should never fire; it exists as
the same defensive backstop philosophy as `P023` (§18) — catching an
internal inconsistency cleanly rather than however it would otherwise fail.

### 29.7 File Formats

**Text** (`formatBytecodeText()`) — what `pari --bytecode` prints: a
title, the constant pool, the function table, then every instruction with
its operands resolved to their actual values (a constant's value, not its
raw pool index) — the whole point of this format is to be read by a
person, so raw indices are only ever shown for `target` (jump) and `count`
operands, which are already meaningful as plain integers.

**Binary `.pbc`** (`writeBytecodeBinary()`/`readBytecodeBinary()`) — what
`pari --compile` writes to disk. All integers are unsigned 32-bit
little-endian unless stated otherwise:

```
magic            4 bytes, ASCII "PBC1"
version          uint32              (currently 2 — see the version-2 note below)
constantCount    uint32
constants[]      constantCount ×:  typeTag (uint8) + payload (by type, below)
functionCount    uint32
functions[]      functionCount ×:  name (uint32 len + UTF-8), paramCount (uint32),
                                    params[] (each: uint32 len + UTF-8),
                                    entryIndex (uint32), isNested (uint8)
instructionCount uint32
instructions[]   instructionCount ×: opcodeId (uint8), line (uint32), column (uint32),
                                    then that opcode's fixed operand count × uint32
```

Constant payloads by type tag: **Number**/**Decimal** → 8-byte float64 LE
(both are JS doubles — §12.2 — so one payload shape serves both; the
preceding tag is what keeps them distinct values); **String** → uint32
length + UTF-8 bytes; **Boolean** → 1 byte; **Empty** → no payload (the
tag alone is the whole value). An instruction's operand *count* isn't
stored — it's derived from the opcode via the same `OPCODE_INFO` table the
Generator/Validator use, keeping the format one byte per instruction
tighter and impossible to desynchronize from the opcode list.

**Version 2 (a Phase 11 bugfix, not a Phase 10 revision):** format version
1, as originally shipped in Phase 10, did not serialize each
instruction's `line`/`column` at all — only its opcode and operands. This
was invisible to every Phase 10 test (the Validator and text listing never
need source position), but it meant a runtime error raised from a `.pbc`
file *loaded from disk* reported `file:null:null` instead of a real
position, even though the identical program run via `--run-bytecode
<file.pr>` (compiled to bytecode in memory, never round-tripped through
the binary format) reported the correct one. Phase 11's own Validation
requirement — the Interpreter and the PVM must match on "Runtime Errors,"
not just successful output — is exactly what caught this discrepancy
during final verification, which is why fixing it fell inside Phase 10's
otherwise-frozen scope: it is a genuine defect in previously-shipped code,
not a new feature. The fix adds `line`/`column` as two `uint32` fields
per instruction (0 encodes "no position," since real Parithi source
positions are always 1-based) and bumps `FORMAT_VERSION` to 2; a `.pbc`
file written under version 1 is rejected (unsupported version) rather
than silently misread, since no external consumer of the format existed
yet to preserve compatibility for.

`readBytecodeBinary()` is a full reader (not a stub) specifically so this
phase's own test suite could verify the format round-trips exactly
(instruction-for-instruction, constant-for-constant, including the
version-2 `line`/`column` fields) — see `tests/bytecode.test.js`. Reading
the structure back is not executing it; no opcode's *behavior* is
implemented by this reader or anywhere else in Phase 10 (§29.1).

### 29.8 CLI Usage

Two new flags, added the same way every prior debug flag was (§19):

```
pari --bytecode hello.pr    # print the bytecode listing, then exit (does not execute the program)
pari --compile hello.pr     # write hello.pbc next to the source, then exit (does not execute the program)
```

Both run the full Lexer → Parser → Semantic Analyzer pipeline first,
unchanged, and report a compiler error exactly like every other command
(§18) if the program doesn't pass — bytecode is only ever generated from a
program that would also have run correctly under the Interpreter. Neither
flag executes the program; `pari hello.pr` (no flag) is completely
unaffected and remains the default, primary way to run a Parithi program.

### 29.9 Worked Example

```
task fact(n)
    if n <= 1
        return 1
    end if
    return n * fact(n - 1)
end task

say fact(5)
```

`pari --bytecode` on the program above (abridged — constant pool omitted;
`fact`'s mangled name and parameter are shown as `fact$0`/`n$1` for
concreteness, though the exact numbers depend on how many other slots were
mangled earlier in the same program):

```
0000  JMP 16
0001  LOAD "n$1"
0002  PUSH Number 1
0003  LE
0004  JMP_IF_FALSE 7
0005  PUSH Number 1
0006  RETURN
0007  LOAD "n$1"
0008  LOAD "n$1"
0009  PUSH Number 1
0010  SUB
0011  CALL "fact$0", 1
0012  MUL
0013  RETURN
0014  PUSH Empty
0015  RETURN
0016  PUSH Number 5
0017  CALL "fact$0", 1
0018  PRINT 1
0019  PUSH Number 0
0020  HALT
```

Instruction 0 skips the function body during normal top-to-bottom flow;
`fact` is reached only via `CALL` (instructions 0011 and 0017, both naming
the same mangled function). Instructions 0014–0015 are unreachable dead
code (every real path through `fact`'s body already returns explicitly at
0006 or 0013) — harmless, and exactly what §29.5 documents as the always-
appended implicit fallthrough return.

### 29.10 Testing

`tests/bytecode.test.js` (54 tests) covers every category in the Phase 10
brief — variables/constants/assignments (incl. shadowing producing distinct
slots), every expression/operator (incl. proving `and`/`or` never emit the
`AND`/`OR` opcodes), functions (recursion, mutual recursion, nested tasks,
an injected wrong-argument-count case caught by the Validator), arrays
(literals, indexing, every built-in), loops (`repeat`, `while`, `break`/
`continue`, break/continue resetting inside a nested task), conditions and
`choose`, the `stop` statement, 5-level nested control flow, a 500-statement
program, near-call-depth-limit recursion, every real `examples/*.pr` file,
and full text/binary-format round-trip fidelity. `tests/cli.test.js` adds
the process-boundary layer: `--bytecode`/`--compile` on every example,
compiler/semantic-error handling, confirming neither flag executes the
program, and confirming the plain `pari <file>` path is byte-for-byte
unaffected. All 508 tests (454 pre-Phase-10 + 54 new) pass; zero changes
anywhere in `src/lexer/`, `src/parser/`, `src/ast/`, `src/semantic/`, or
`src/interpreter/`.

---

## 30. Parithi Virtual Machine (Phase 11)

Numbered 30, continuing straight on from §29, for the same reason §28 and
§29 were appended rather than inserted earlier (§28's opening note).

### 30.1 Overview and Scope

Phase 11 adds the **Parithi Virtual Machine (PVM)**: a second, independent
backend that *executes* the bytecode Phase 10 only ever *generated*.
Before this phase, `--bytecode`/`--compile` produced a `.pbc` file or
listing that nothing could run — §29.1 was explicit that "no opcode's
runtime behavior is implemented anywhere in Phase 10." The PVM is exactly
that missing piece, and nothing else: every opcode from §29.3 now has a
real execution handler, a real operand stack, real call frames, and real
built-in/array/arithmetic behavior — with **zero changes** to `src/lexer/`,
`src/parser/`, `src/ast/`, `src/semantic/`, `src/interpreter/`,
`src/runtime/`, the existing `src/cli/` command handlers, or any file
under `src/bytecode/` (Generator, Validator, constant pool, binary format
— all exactly as Phase 10 left them). The pipeline now has two complete,
independent ways to execute a Parithi program:

```
                                                    ┌─→ Tree-Walking Interpreter ──────────────────────┐
Source (.pr) → Lexer → Parser → AST → Semantic Analyzer ─┤                                                    ├─→ Output
                                                    └─→ Bytecode Generator → Parithi Bytecode (.pbc) → PVM ─┘
```

`pari <file.pr>` still takes the left path, completely unaffected.
`pari <file.pbc>` (bare, auto-detected by extension) and
`pari --run-bytecode <file>` (either a `.pbc` file or a `.pr` file,
compiled to bytecode in memory first) take the right path. Both paths are
proven — not just asserted — to produce identical output, exit codes, and
error codes for the same program: see §30.11.

### 30.2 Design Principle: Reuse, Don't Reimplement

The single most important architectural decision in this phase, applied
everywhere it was possible to apply it: **wherever a piece of Parithi's
actual *semantics* already has exactly one correct implementation, the PVM
calls it directly rather than writing a second one.** This is what turns
"the PVM must behave exactly like the Interpreter" from an aspiration into
a structural guarantee — there is only ever one place that logic lives.

| Concern | Reused from | Not reimplemented |
|---|---|---|
| Array indexing/assignment semantics, homogeneity checks | `src/interpreter/builtins/array.js`'s `assertIndexable`/`resolveIndex`/`checkElementType`/`validateHomogeneousElements` (the exact functions `Interpreter.visitArrayAccess`/`visitArrayAssignment`/`visitArrayLiteral` already call) | `ARRAY_GET`/`ARRAY_SET`/`ARRAY_NEW`'s bounds/type logic |
| All built-in functions (`round`, `random`, `number`, `text`, `type`, `len`, `push`, `pop`, `insert`, `remove`, `sort`, `reverse`, `contains`) | `src/interpreter/builtins/index.js`'s `callBuiltin()`/`isBuiltinName()` | Every built-in's computation and argument-validation logic |
| Deep/structural equality (`EQ`/`NE`), value-to-text rendering (`PRINT`) | `src/runtime/runtime-value.js`'s `deepEquals()`, `src/interpreter/stringify.js`'s `stringify()` | Array/nested-array comparison and display formatting |
| Line reading for `ask()`/`INPUT` | `src/interpreter/stdin.js`'s `readLineSync()` | — |
| Lexing, parsing, semantic analysis, bytecode generation/validation | The entire existing frontend and Phase 10, unmodified | Everything upstream of execution |

What's genuinely **new** in this phase, because nothing existing could
serve the purpose, is narrower than it might look: the operand stack, the
call-frame chain and its two-parent-relationship model (§30.3), the
instruction dispatch loop, and hand-mirrored arithmetic/comparison opcodes
(§30.5 — the Interpreter implements these inline in
`visitBinaryExpression` rather than as standalone functions, so there was
nothing importable; they're kept to the same one-line-per-operator shape
and verified against the Interpreter by the parity suite, §30.11, rather
than by import).

### 30.3 Memory Model — Frames, Locals, and the Two Kinds of "Parent"

A `Frame` (`src/vm/frame.js`) is one call's local-variable storage: a
`Map` from a Bytecode Generator slot-mangled name (`x$3` — §29.2) to its
current value, plus two *different* parent links that answer two
different questions:

- **`lexicalParent`** — "where do I look up a name I don't have locally?"
  Fixed to the **global frame** for a top-level task; for a task *nested*
  inside another task's body, it's whichever frame was current at the
  moment *this specific call* was made. Because Parithi has no first-class
  function values (§28.1, §30.2) — a task is only ever callable from
  within its own lexical visibility — "whoever is calling a nested task"
  is always necessarily an active invocation of its immediately enclosing
  task, so this one dynamic rule reproduces exactly what a real closure
  object would give, without needing one. Proven by two dedicated parity
  cases: a nested task reading its enclosing task's parameter through
  *recursion* (seeing the innermost invocation's value, not an outer
  one), and a *non-nested* helper task called from inside another
  top-level task still resolving its free variables against **global**,
  not its caller's locals (§30.11).
- **`callerFrame`** (+ `returnIP`) — "who do I hand control back to, and
  where, once `RETURN` runs?" Always simply whoever was current when
  `CALL` was issued, ordinary call-stack semantics, independent of
  nesting. `LOAD`/`STORE` never walk `callerFrame` — only
  `lexicalParent`; `RETURN` uses `callerFrame` exclusively, never
  `lexicalParent`.

`STORE`'s "walk `lexicalParent`, and only if the name is found *nowhere*,
define it in the current (innermost) frame" rule is what lets **one**
opcode correctly serve both a fresh `hold`/`const` declaration and a later
reassignment (including a nested task reassigning its enclosing task's
variable) without the bytecode needing to distinguish them — guaranteed
correct because the Generator's slot mangling makes every fresh
declaration's name globally unique (§29.2), so it can never already exist
anywhere the walk would find it.

There is deliberately **no scope-push/pop opcode** (§29.3's instruction
set has none) because `if`/`while`/`repeat`/`choose` blocks share their
enclosing function's single frame — only a `CALL` ever creates a new one.
Slot mangling alone (already proven correct by the Bytecode Generator's
own tests, §29.10) is sufficient to keep a block's locals from colliding
with an outer block's, at both compile time and now, proven, at run time.

### 30.4 Memory Model — the Operand Stack and the Heap

**Operand stack** (`src/vm/stack.js`) — one plain JS array, shared by every
frame. A `CALL` pops its arguments off the *same* stack the caller was
using; the callee pushes/pops "on top of" whatever remained. This works
correctly with **zero per-call isolation** because every Bytecode
Generator statement is proven stack-neutral (§29.6's Validator), so a
callee's net effect (always +1, its return value) composes correctly
regardless of what depth the caller happened to be at — there is no need
to snapshot or restore stack depth around a `CALL`. A configurable maximum
depth (100,000, independent of the call-depth limit below) guards against
a hand-crafted or corrupted bytecode's tight `JMP` cycle that pushes
without ever popping — never reachable from Generator output, but a real
robustness backstop for anything else that produces `.pbc` files.

**Heap** (`src/vm/heap.js`) — deliberately minimal: Parithi's only
reference type is Array (§28.3), and its actual runtime representation in
the PVM is a plain JS array, exactly the Interpreter's own representation
(§17.4's `wrap()`) — reused, not reinvented, so JS's own garbage collector
already manages the underlying memory with zero extra code. `Heap` adds
only observational bookkeeping (an id per allocated array) on top,
useful for a future debugger/profiler/collector without requiring any
change to how arrays are represented or accessed anywhere else — the
"future-ready... without requiring major architectural changes" seam the
Phase 11 brief asked for. `Memory` (`src/vm/memory.js`) bundles the global
frame and the heap into one owned object, mirroring how
`src/runtime/runtime.js` (Interpreter, unmodified) bundles its own
equivalent pieces.

### 30.5 Instruction Execution Reference

Every opcode from §29.3 has exactly one handler in
`src/vm/instruction-dispatcher.js`, each `(vm, instruction) => nextIP |
undefined` — `undefined` means "fall through to the next instruction,"
matching how only `JMP`/`JMP_IF_TRUE`/`JMP_IF_FALSE`/`CALL`/`RETURN` ever
need to redirect control flow explicitly.

| Opcode | VM behavior |
|---|---|
| `PUSH` | Push the constant-pool value at the given index |
| `POP` | Discard the top value |
| `LOAD` | Push the current frame's value for this slot (walks `lexicalParent`; `P023` if truly nowhere — unreachable from valid bytecode) |
| `STORE` | Pop; write into the slot per §30.3's walk-then-define rule |
| `ADD`/`SUB`/`MUL`/`DIV`/`MOD`/`POW` | Pop right, pop left, push `left OP right` — hand-mirrored from `Interpreter.visitBinaryExpression` (§30.2); `DIV`/`MOD` by zero raise `P020`, exact message/hint parity |
| `NEG` | Pop, push `-operand` |
| `EQ`/`NE` | Pop right, pop left, push `deepEquals(left, right)` (or its negation) — **reused**, so structural/array equality matches the Interpreter exactly (§28.3) |
| `GT`/`LT`/`GE`/`LE` | Pop right, pop left, push the JS comparison — Parithi values are always raw JS numbers/strings by this point, so no wrapping is needed |
| `AND`/`OR` | Eager, non-short-circuit boolean combine — defined for completeness; never emitted by the Generator (§29.5) |
| `NOT` | Pop, push `!operand` |
| `JMP` | Unconditional jump to the (already-resolved, absolute) target |
| `JMP_IF_TRUE`/`JMP_IF_FALSE` | Pop; jump if the popped value is strictly `true`/`false`, else fall through |
| `CALL` | Pop `argCount` args (un-reversed to source order); if the name resolves in the function table, push a new `Frame` (§30.3) and jump to its entry point (checking the call-depth limit first — `P021` if exceeded, exact message parity with `CallStack`); else if it's a recognized built-in, call `callBuiltin()` (§30.2) and push its result; else `P015` |
| `RETURN` | Pop the current frame (restoring `callerFrame` as current), resume at its `returnIP` — the value already on the operand stack becomes the call's result. `P023` if there is no active frame (unreachable from valid bytecode) |
| `PRINT` | Pop `count` values (un-reversed), `stringify()` each, write them space-joined + a newline |
| `INPUT` | Pop a prompt, write it, push the line read |
| `ARRAY_NEW` | Pop `count` values (un-reversed), `validateHomogeneousElements()` (§28.3), allocate via `Heap`, push the array |
| `ARRAY_GET` | Pop index, pop array, `assertIndexable()` + `resolveIndex()`, push the element |
| `ARRAY_SET` | Pop index, pop value, pop array, `assertIndexable()` + `resolveIndex()` + `checkElementType()`, write |
| `HALT` | Pop the exit code (truncated toward zero, matching `stop`'s own defensive truncation — §15.7), stop. Covers both a deliberate `stop [code]` and normal termination — there is no separate `STOP` opcode; §29.5 already established they compile identically |

### 30.6 Error Handling

Every VM error is a real `ParithiRuntimeError` (`src/vm/vm-errors.js`),
formatted through the exact same `printError()`/`.format()` path as every
other Parithi error (§18) — never a raw JS exception. Two families:

- **Language-runtime errors**, reusing the Interpreter's exact documented
  code, message shape, and hint for the same source-level mistake:
  `P015` (unknown function), `P020` (division/modulo by zero), `P021`
  (call-depth *or* operand-stack overflow — see §30.4), `P024`–`P027`
  (array bounds/type errors, via the reused `array.js` helpers — §30.2).
- **Bytecode-integrity errors** — conditions that can *never* happen from
  Generator-produced, Validator-passed bytecode (an out-of-range jump, an
  unrecognized opcode byte, an operand-stack underflow, a `RETURN` with no
  frame, an out-of-range constant reference): all reuse **`P023`**, the
  existing catch-all whose documented purpose already covers exactly this
  ("a catch-all... so a raw stack trace can never reach the user," §18) —
  extended here to a second source of "should be impossible": hand-crafted
  or corrupted `.pbc` input, not just an unrecognized AST node. No new
  error code was added anywhere in this phase.

`VirtualMachine.run()`'s own outer catch-all deliberately does **not**
call `currentLocation()` when wrapping an unexpected raw JS error as
`P023` (passing `null` instead) — mirroring `Interpreter.run()`'s own
choice, and for the same reason: whatever corrupted state caused the raw
error in the first place could just as easily make a location lookup
throw a second time. The call-stack trace is still attempted (wrapped in
its own try/catch, falling back to an empty trace) since it only walks
`currentFrame.callerFrame`, unaffected by that same class of corruption.

Call-stack traces (`VirtualMachine.describeCallStack()`) strip the
Bytecode Generator's slot-mangling suffix before display
(`displayFunctionName()`, `frame.js`) — a trace reads `fact(...)`, not the
internal `fact$0(...)`, purely a cosmetic derivation from the mangling
convention itself (§29.2), needing no format change to recover.

### 30.7 CLI Integration

```
pari hello.pbc                      # bare — auto-detected by extension, executes on the PVM
pari --run-bytecode hello.pbc       # explicit — same effect
pari --run-bytecode hello.pr        # compiles to bytecode IN MEMORY, then executes on the PVM (no .pbc file written)
```

`pari hello.pr` (no flag) is completely unaffected — extension detection
happens once, at the top of the existing `run` dispatch case, and only a
`.pbc` file is ever routed to the new path; everything else falls through
to the unchanged Interpreter path exactly as before Phase 11. A loaded
`.pbc` is re-validated with the Phase 10 Validator before execution (§29.6)
— defensive, since a file that parses but is internally inconsistent
(hand-edited, corrupted in transit) is a bad *file*, reported as a CLI
usage error (exit `3`), not a runtime failure of a program that hasn't
started executing. A genuinely malformed file (bad magic, wrong version,
truncated) is likewise a usage error, matching how a missing or
wrong-extension `.pr` file has always been handled (§19).

### 30.8 What Was Deliberately Not Touched

Verified, not merely asserted: no line changed in `src/lexer/`,
`src/parser/`, `src/ast/`, `src/semantic/`, `src/interpreter/`,
`src/runtime/`, or any file under `src/bytecode/`. The only pre-existing
files touched at all were `src/cli/args.js` (one new flag entry),
`src/cli/commands.js` (new dispatch cases and new functions — no existing
function's body changed), and `src/cli/screens.js` (help text additions)
— exactly the same "additive only" pattern Phase 10 already established
for its own two new flags.

### 30.9 Performance

The dispatch loop (`VirtualMachine.step()`) never touches the AST — it
only ever reads `this.instructions[this.ip]` and looks up one handler
function in a flat object (`OPCODE_HANDLERS`), an O(1) dispatch per
instruction. Function lookup for `CALL` (task vs. built-in) is an O(1)
`Map` lookup (`functionsByName`) rather than a linear scan. Call-depth
overflow checking is an O(1) integer comparison (`vm.callDepth`), not a
walk of the frame chain — that walk (`describeCallStack()`) is reserved
for the error-reporting path, which only ever runs once, when something
has already gone wrong.

### 30.10 Debugger (Future-Ready)

`src/vm/debugger.js`'s `Debugger` class is a read-only introspection
layer over a running `VirtualMachine` — current instruction, operand-stack
contents, active frames (with their locals), and global variables —
mirroring how `pari --runtime` (§19) is a thin reporting layer *on top of*
`Interpreter`/`Runtime` rather than logic baked into the Interpreter
itself. A future step-debugger, profiler, or a `--vm-runtime` CLI flag
extends this class; none of it requires changing `VirtualMachine` or
`instruction-dispatcher.js`.

### 30.11 Validation — PVM vs. Interpreter Parity

`tests/vm-parity.test.js` is the Phase 11 brief's own "Validation" section
made permanent: every one of its 39 tests runs a program through **both**
backends — the unmodified Tree-Walking Interpreter, and Bytecode Generator
+ PVM — and asserts identical console output, exit code, and (for programs
that error) error code. Coverage: every operator, every control-flow
construct (including nested and short-circuit-with-a-would-throw-branch
cases), functions (recursion, mutual recursion, nested tasks resolving
free variables through recursion), every array operation and built-in,
every documented runtime error, `ask()`/`say`, all eleven real
`examples/*.pr` files, and several larger hand-written programs (a bubble
sort, a 50,000-iteration loop, 5-level-deep nested control flow). All 39
pass. This is a stronger correctness claim than either backend's own test
suite alone: it's not "the PVM behaves as I intended," it's "the PVM and
the Interpreter — two structurally unrelated execution strategies —
compute the identical answer for the identical program," checked
mechanically, for every construct in the language.

### 30.12 Testing Summary

`tests/vm.test.js` (74 tests): every opcode individually, every runtime
object (via `say`/equality), recursion and nested tasks (including the two
`lexicalParent` cases described in §30.3), every array operation and
built-in, stack overflow (both call-depth and raw operand-stack), every
category of invalid/corrupted hand-built bytecode (unrecognized opcode,
out-of-range jump, out-of-range constant, stack underflow, `RETURN` with
no frame, an unknown `CALL` target, running off the end without `HALT`,
and a raw JS error mid-execution correctly wrapped as `P023` without
itself throwing a second raw error — §30.6), unmangled call-stack traces,
large/stress programs, and every real example program. `tests/vm-parity.test.js`
(39 tests, §30.11). `tests/cli.test.js` gained 10 more (§30.7's CLI
surface, including corrupted/missing/wrong-type `.pbc` handling). Total:
**632 tests** (508 pre-Phase-11 + 123 new + 1 more added by the binary-format
line/column bugfix — §29.7), all passing, zero regressions.

---

## 31. Bytecode Optimizer (Phase 12)

Numbered 31, continuing straight on from §30, for the same reason §28–§30
were appended rather than inserted earlier (§28's opening note).

### 31.1 Overview and Scope

Phase 12 adds the **Bytecode Optimizer**: an optional post-processing stage
that sits between the (unmodified) Bytecode Generator (§29) and the
(unmodified) Validator/PVM (§30). It takes the exact program shape the
Generator produces — `{ instructions, constants, functions }` — and
returns a program that is smaller-or-equal in instruction count and
constant-pool size, computing the *identical* result, for the *identical*
input, with the *identical* observable behavior (console output, exit
code, and — for a program that errors — the same error code). Nothing
here changes what any opcode *means*; every pass only ever deletes
instructions, deletes constants, or replaces a short run of instructions
with an even shorter one computing the same value. The pipeline gains one
new, entirely optional stage:

```
Source (.pr) → Lexer → Parser → AST → Semantic Analyzer → Bytecode Generator
                                            → Bytecode Optimizer (optional, §31)
                                            → Validator → PVM
```

**Zero lines changed** in `src/lexer/`, `src/parser/`, `src/ast/`,
`src/semantic/`, `src/interpreter/`, `src/runtime/`, anywhere under
`src/bytecode/` (Generator, Validator, constant pool, binary format — all
exactly as Phase 10/11 left them), or anywhere under `src/vm/` (every
opcode's execution semantics are exactly as Phase 11 left them) — the same
"protected, complete, do not modify unless a real bug is discovered"
discipline this brief itself was given, honored the same way Phase 11
honored it for Phase 10's work. The Optimizer is invoked **only** when
explicitly requested (`--optimize`/`--stats`/`--disassemble`, or combined
with `--compile`/`--run-bytecode`/`--bytecode`, §31.9) — a plain
`pari <file.pr>` or `pari <file.pbc>` is completely unaffected by this
phase's existence, exactly the same "additive, never a silent behavior
change" pattern Phase 10 and 11 both established for their own new flags.

### 31.2 Architecture

`src/optimizer/`:

- **`optimizer.js`** — `optimizeBytecode(program)`, the entry point. Runs
  the fixed, ordered 8-pass sequence (§31.3) through `PassManager`,
  re-sweeping the whole sequence (capped at `maxIterations`, default 4)
  until a full sweep reports no change from any pass — see §31.9 for why
  one sweep alone doesn't always reach a global fixed point.
- **`pass-manager.js`** — `PassManager.run(program)` executes one ordered
  sweep of passes, re-validating with the Phase 10 Validator
  (`validateBytecode()`, §29.6) after **every single pass**, not only at
  the end — the brief's own explicit requirement ("run Bytecode Validator
  again. If optimization creates invalid bytecode, reject it immediately.
  Never emit invalid bytecode").
- **`optimizer-error.js`** — `OptimizerError`, thrown (never silently
  swallowed) when a pass's output fails that re-validation — the same
  "this is an implementation bug, not the user's program's fault" spirit
  as `P023` (§18) and `reportBytecodeBug` (§29.6).
- **`program-utils.js`** — the one shared piece of bookkeeping every
  instruction-deleting pass needs: `buildIndexMap()`/`remapProgram()`
  renumber every surviving jump target and function `entryIndex` after
  instructions are dropped, and `collectReferencedIndices()` finds every
  position something still jumps to. Written once, here, so five different
  passes don't each hand-roll a slightly different (and slightly
  differently buggy) version of the same renumbering logic.
- **`statistics.js`** / **`optimizer-report.js`** — Pass 9: before/after/
  removed counts and the `--stats` report text (§31.8).
- **`passes/`** — one file per pass, each exporting `name` (a string) and
  `run(program) => program`, pure (a pass with nothing to do returns the
  exact same object reference it was given, both as a cheap "did anything
  change" signal and to let `optimizeBytecode`'s convergence loop detect a
  fixed point cheaply).

**Why the program shape needs no new "label" concept.** A jump `target`
operand in this program shape is always already a concrete instruction
index — `BytecodeBuilder.resolve()` (§29.5) replaced every symbolic
`Label` with one before generation ever finished. This means every pass
that deletes instructions must renumber surviving jump targets itself
(`program-utils.js`'s job); it also means Pass 8 ("Label Cleanup" in the
brief's own naming) has no separate label table left to clean — see its
own class doc, §31.3.

### 31.3 The 8 Passes (fixed order)

| # | Pass | What it does | What it deliberately leaves alone |
|---|---|---|---|
| 1 | **ConstantFolding** | `PUSH c1; PUSH c2; <BINOP>` or `PUSH c; <UNARY>` → one `PUSH` of the precomputed result, for `+ - * / % **`, `== != < > <= >=`, `and or not`, and String `+` concatenation. Folds a chain (`2 + 3 + 4`) to a fixed point within this pass alone. | `DIV`/`MOD` by a constant `0` (would swallow or mislocate the runtime `P020`); any fold whose middle instruction is itself a jump target |
| 2 | **ConstantPropagation** | Replaces every `LOAD` of a slot written by `STORE` **exactly once, anywhere in the program**, from a literal `PUSH`, with that literal directly, then removes the now-dead declaration. A single-assignment analysis, not a `const`-vs-`hold` check (bytecode has already erased that distinction — §29.2) — see §31.4 | Any slot assigned more than once; any array declaration (`ARRAY_NEW`, not `PUSH`, always precedes its `STORE`); function parameters (bound by `CALL`, never `STORE`d at all) |
| 3 | **DeadCodeElimination** | Removes instructions unreachable after `RETURN`/`HALT`/an unconditional `JMP`, up to the next instruction something still jumps to | Any code reached by a jump target, even directly after a terminal instruction (a loop's own condition label, for instance) |
| 4 | **JumpOptimization** | Collapses a `JMP`-to-`JMP` chain to point at the final target; deletes an unconditional `JMP` whose target is the very next instruction | A conditional jump (`JMP_IF_TRUE`/`FALSE`) whose target is the next instruction — it must still pop the tested value |
| 5 | **PeepholeOptimization** | Removes a `LOAD x; STORE x` no-op pair; re-runs Pass 1's exact fold rule (imported, not duplicated) on adjacencies Propagation/earlier passes newly exposed — see §31.5's worked example | The instruction set has no `NOP` opcode (§29.3), so that classic peephole rule has nothing to match |
| 6 | **StackOptimization** | Removes an immediately adjacent `PUSH x; POP` or `LOAD x; POP` pair (push a value, discard it unread — a true no-op) | `INPUT;POP`/`CALL;POP`/any other side-effecting push-like opcode before `POP` — the side effect must still happen even though the *result* goes unused |
| 7 | **ConstantPoolOptimization** | Rebuilds the constant pool with only entries a surviving instruction still references, in original relative order, rewriting every `const`-kind operand | Nothing to leave alone here — but see §31.6 for why "merge duplicates" is mostly already guaranteed before this pass even runs |
| 8 | **LabelCleanup** | Re-runs Pass 4's jump-chain collapse one more time, now that Passes 5–7 have had a chance to create new indirection Pass 4 (running earlier) couldn't see yet — see §31.7 for why this is genuinely useful, not a restatement of Pass 4 | — |
| 9 | **Statistics** | Not a bytecode-transforming pass — computes before/after/removed instruction and constant counts, an optimization ratio, and a qualitative execution estimate; backs `--stats` (§31.8) | — |

Every pass lives in its own file under `src/optimizer/passes/`, is
independently unit-tested (`tests/optimizer.test.js`), and is re-validated
by `PassManager` immediately after it runs (§31.2) — the brief's own
"test every optimization independently" and "never emit invalid bytecode"
requirements, both satisfied structurally rather than by convention alone.

### 31.4 Why Constant Propagation Is Single-Assignment Analysis, Not a `const` Check

By the time bytecode exists, the Bytecode Generator has already erased the
`hold`/`const` distinction on purpose (§29.2) — `compileVariableDeclaration`
emits the identical `PUSH; STORE` shape for both, and nothing in the
`Instruction`/`ConstantPool` format records which keyword declared a slot.
Re-deriving "is this a `const`" from the AST or Semantic Analyzer would
mean the optimizer reaching back past the exact boundary the rest of this
phase (and Phase 10 before it) was built to respect. Instead, Pass 2 asks a
strictly more general, and still exactly as safe, question directly of the
bytecode: **is this slot written by `STORE` exactly once, anywhere in the
whole program, from a literal value?**

A slot assigned exactly once has only one possible value for its entire
lifetime, regardless of whether it was declared `hold` or `const` — this
provably includes every `const` (`P005` forbids ever reassigning one,
§14.2) and additionally captures a `hold` that simply never happens to be
reassigned, which is strictly *more* optimization than a syntactic
"const-only" rule while remaining exactly as behavior-preserving. Two
correctness properties fall out of this design for free, by construction
rather than by a special-case check:

- **Arrays are never mis-propagated.** The pattern requires the
  instruction *immediately before* the sole `STORE` to be a `PUSH` of a
  scalar constant-pool entry. `box(...)` always compiles to
  `..., ARRAY_NEW n, STORE` (§29.3) — a different opcode from `PUSH` — so
  an array-valued declaration can never match. Reference semantics
  (§28.3) are untouched by this pass, not by a type-check carve-out.
- **Parameters are never touched.** A parameter's slot is bound directly
  by the PVM's `CALL` handler (`frame.bind()`, §30.5) — there is no
  `STORE` instruction anywhere in the bytecode for it, so it never even
  appears in this pass's "slots written by `STORE`" analysis.

### 31.5 Worked Example — Why Peephole Re-Runs Constant Folding

```
const PI = 3.14
hold area = PI * 10
say area
```

compiles to `PUSH 3.14; STORE PI$n; LOAD PI$n; PUSH 10; MUL; STORE area$m;
LOAD area$m; PRINT 1; PUSH 0; HALT`. Walking the fixed pass order once:

1. **ConstantFolding** sees `LOAD, PUSH, MUL` before the `STORE area$m` —
   not foldable (a `LOAD` isn't a literal). No change.
2. **ConstantPropagation** finds `PI$n` single-assignment-from-a-literal:
   replaces `LOAD PI$n` with `PUSH 3.14` and deletes the dead
   `PUSH 3.14; STORE PI$n` declaration. Now: `PUSH 3.14; PUSH 10; MUL;
   STORE area$m; LOAD area$m; PRINT 1; PUSH 0; HALT`.
3. **DeadCodeElimination**, **JumpOptimization** — nothing to do.
4. **PeepholeOptimization** now sees `PUSH 3.14; PUSH 10; MUL` — a triple
   Pass 1 never had a chance to see, since it ran *before* Propagation
   exposed it. Folds it: `PUSH 31.4; STORE area$m; LOAD area$m; PRINT 1;
   PUSH 0; HALT`.
5. **StackOptimization**, **ConstantPoolOptimization**, **LabelCleanup** —
   nothing left to do *this sweep*.

One sweep of all 8 passes is done, but `area$m` is now *itself*
single-assignment-from-a-literal — a fact only true *after* step 4 folded
its initializer, too late for step 2 (Propagation) to have caught in this
same sweep. `optimizeBytecode()` re-sweeps the whole ordered sequence
(§31.9) precisely to catch this: sweep 2's ConstantPropagation inlines
`area$m` too, and the final result is the theoretical minimum:
`PUSH 31.4; PRINT 1; PUSH 0; HALT` — 4 instructions from an original 10,
with the constant pool correspondingly shrunk by Pass 7.

### 31.6 Constant Pool Optimization and Duplicate Merging

`ConstantPool.add()` (§29.4) already deduplicates on insert — every pass
in this pipeline that introduces a *new* constant (Folding, Peephole)
routes through that same `add()` call, so a literal duplicate of an
existing entry is never created in the first place during optimization.
Pass 7 rebuilds the pool through a fresh `ConstantPool` anyway, which
makes that guarantee unconditional rather than reliant on every pass
author remembering to route through `add()` — any duplicate that slipped
in some other way would be merged for free by the same mechanism. Pass 7's
actual, distinctive contribution is the other half of its name: dropping
entries nothing still references, which is common by the time it runs —
Propagation's inlining leaves a literal referenced from one *new* place
while the old declaration that used to reference it is gone; anything only
ever reachable through code Passes 3–4 already deleted is now a true
orphan.

### 31.7 Why "Label Cleanup" Is a Second Jump-Collapse Pass, Not a No-Op

The brief's Pass 8 is named for what an assembler with still-symbolic
labels would do at this point in a pipeline — remove unreferenced labels,
renumber the rest, repair jump targets. Parithi Bytecode has no such
structure to act on by the time the Optimizer ever runs: `Label` objects
(§29.5) exist only *during* generation, and `BytecodeBuilder.resolve()`
replaces every one with a concrete instruction index before generation
finishes — every jump target already *is* an address, not a name. Rather
than implement a pass with nothing left to clean, `LabelCleanup` re-runs
`JumpOptimization`'s exact jump-chain-collapse logic (imported, not
duplicated) one more time — the practical equivalent of "repair jump
targets" for an address-based format, and genuinely useful precisely
because Passes 5–7, all running *after* Pass 4, can shift instructions
around and expose new jump-to-jump or jump-to-next indirection Pass 4 had
no way to see yet.

### 31.8 Statistics and the `--stats` Report

Pass 9 (`statistics.js`) is arithmetic over already-known counts, not a
bytecode inspection of its own: instructions/constants before and after,
how many of each were removed, an optimization ratio
(`removed / before × 100`), and a qualitative execution estimate ("Faster"
if any instruction was removed, "No Change" otherwise). `optimizer-
report.js` renders this, plus a per-pass breakdown (each pass's own
before/after counts and whether it changed anything this sweep), as the
text `pari <file.pr> --stats` prints:

```
Optimization Report for area.pr
------------------------------------------------------------------------

Instructions Before   : 10
Instructions After    : 4
Removed Instructions  : 6

Constants Before      : 6
Constants After       : 2
Removed Constants     : 4

Optimization Ratio    : 60.00%
Execution Estimate    : Faster

Per-Pass Breakdown:
  ConstantFolding              10 -> 10 instr. (0), 6 -> 6 const. (0) [no change]
  ConstantPropagation          10 -> 8  instr. (-2), 6 -> 6 const. (0) [changed]
  ...
```

A pass's own constant count can legitimately *increase* mid-sweep (Folding
pools a brand-new folded value before Pool Optimization later shrinks the
pool again) — the per-pass delta is rendered signed (`+1`/`-2`/`0`) rather
than always prefixed with a bare `-`, specifically to avoid a
double-negative-looking `(--1)` for that case.

### 31.9 CLI Integration

```
pari hello.pr --optimize             # display the optimized bytecode listing (does NOT execute)
pari --optimize hello.pr             # same, leading-flag form
pari hello.pr --stats                # display the Pass 9 optimization report
pari hello.pr --disassemble          # same display as --optimize (see below)
pari --compile hello.pr --optimize   # write an OPTIMIZED .pbc file
pari --run-bytecode hello.pr --optimize   # execute optimized bytecode on the PVM directly
pari --bytecode hello.pr --optimize  # display the optimized listing via the existing --bytecode flag
```

Three flags, two different calling conventions, both deliberate:

- **`--optimize`** is a **modifier**, exactly like `--verbose` already is —
  it may appear anywhere in argv and composes with whichever primary mode
  was selected. Combined with plain `run` mode (`pari hello.pr --optimize`,
  matching the brief's own literal CLI examples), it is a **display**
  command — it does not execute the program, matching how `--bytecode`/
  `--ast`/`--tokens` already behave for a `.pr` file. To actually
  *execute* optimized bytecode end-to-end on the PVM, combine `--optimize`
  with `--run-bytecode`, or run a `--compile --optimize`-produced `.pbc`
  file directly (bare `pari hello.pbc` has always been execute-only, with
  no pre-existing "just display" behavior to preserve — so `--optimize`
  there means "execute it, but optimized first," the one place its
  meaning differs from the `.pr` case, for a principled reason).
- **`--stats`** / **`--disassemble`** are **dedicated modes** (like
  `--bytecode`) — but, unlike every other dedicated mode, the brief's own
  CLI examples show them trailing the filename
  (`pari hello.pr --stats`), not leading it. Both positions are accepted.
  `--optimize` and `--disassemble` are intentionally the same display —
  both print the optimized program via the exact `formatBytecodeText()`
  listing `--bytecode` already uses (§29.7); there is no meaningful
  behavioral difference to invent between "the optimized bytecode" and
  "readable optimized bytecode," so none was fabricated.

An `OptimizerError` reaching the CLI layer (a pass producing invalid
bytecode — should be unreachable given every pass's own correctness
argument, §31.3) is reported exactly like a Generator bug
(`reportBytecodeBug`, §29.6): never the user's program's fault, since the
un-optimized bytecode already passed the exact same Validator once before
the Optimizer ever ran.

### 31.10 Validation — Optimized-PVM vs. Interpreter Parity

`tests/optimizer.test.js`'s regression suite is this phase's own
"Validation" section made permanent, following the exact method Phase 11
established for Interpreter/PVM parity (§30.11): every program runs
through the unmodified Tree-Walking Interpreter and through Bytecode
Generator → Optimizer → PVM, and both must produce identical console
output, and either identical exit code or identical error code. Coverage:
nested loops, recursive and mutually-recursive functions, every
`choose`/`option`/`other` shape, every array operation and built-in, `stop`
(bare, coded, from nested control flow), every documented runtime error
(division/modulo by zero, array bounds/type errors, call-depth overflow),
every real `examples/*.pr` file, a generated 18,000+ instruction program
(3,000 single-assignment declarations, exercising Folding/Propagation at
scale), and a 50,000-iteration loop. All pass. `tests/cli.test.js` gained
9 more tests for §31.9's CLI surface, including proving a
`--compile --optimize`-produced `.pbc` is measurably smaller than its
unoptimized counterpart and still runs to the identical output.

### 31.11 Performance

Full before/after measurements — instruction count, constant-pool size,
and PVM wall-clock time, for Hello World, Calculator, recursive Fibonacci,
Factorial, a 100,000-iteration loop, a 5,000-element array, nested loops,
deep recursion, and a constant-heavy generated program — are in
[`docs/OPTIMIZER_BENCHMARKS.md`](OPTIMIZER_BENCHMARKS.md), produced by
[`benchmarks/optimizer-benchmark.mjs`](../benchmarks/optimizer-benchmark.mjs).
The honest summary: constant-heavy and straight-line arithmetic programs
see the largest wins (53–67% fewer instructions, a measurable wall-clock
improvement); loop- and recursion-dominated programs see a smaller but
real instruction-count reduction (6–10%), with wall-clock time tracking
*instruction count*, not *iteration count* — shaving a few instructions
off a loop body that runs 100,000 times barely moves a benchmark whose
cost is dominated by how many times the PVM's dispatch loop runs, not by
how large the static program is. This is the expected, correct behavior
for the class of optimizations this phase implements (constant folding/
propagation, dead-code/jump/peephole/stack/pool cleanup) — a genuinely
faster *loop* would require a different class of optimization
(loop-invariant code motion, strength reduction) outside this phase's
brief, and the benchmark doc says so plainly rather than implying a
speedup this design doesn't produce for loop-dominated workloads.

### 31.12 Testing Summary

`tests/optimizer.test.js` (54 tests): each of the 8 passes tested
independently — the exact transformation it makes, and just as
importantly, what it deliberately leaves alone (div-by-zero, arrays,
parameters, side-effecting opcodes before `POP`, conditional jumps);
`PassManager`'s rejection of a deliberately corrupting fake pass;
`optimizeBytecode()`'s convergence and statistics/report rendering; and
the full parity regression suite described in §31.10. `tests/cli.test.js`
gained 9 more (§31.9's CLI surface). Total: **695 tests** (632 pre-Phase-12
+ 54 new optimizer tests + 9 new CLI tests), all passing, zero
regressions, with every protected module (§31.1) verified unchanged.

---

## 32. Standard Library (Phase 13)

Phase 13 expands Parithi's built-in function library — no language syntax,
keyword, grammar, AST, Semantic Analyzer *logic*, Bytecode, VM, or
Optimizer change. Every function below is a new entry in the exact same
extension points Phase 9's array built-ins already used: `BUILTIN_SIGNATURES`
(`src/semantic/types.js`, static arity/type checking),
`TypeChecker.checkBuiltinCall` (`src/semantic/type-checker.js`, per-argument
static validation), and the `BuiltinRegistry` (`src/interpreter/builtins/index.js`,
runtime dispatch) — the same reuse this document has praised since §30.2:
the PVM calls `callBuiltin()` directly (`src/vm/builtins.js` is a thin
re-export), so every function documented here works identically on both
backends with **one** implementation, not two.

Given the phase's size (~9 categories, dozens of functions, network/file
I/O), it shipped in sub-phases rather than one pass, each fully tested and
documented before the next began:

| Sub-phase | Scope | Status |
|---|---|---|
| 13a | Math, String, Array, Type, System (synchronous, no new dependency) | ✅ shipped (this section) |
| 13b | File I/O | not started |
| 13c | JSON | not started |
| 13d | Date & Time | not started |
| 13e | HTTP | not started — see §32.10 for why this is deliberately last |

### 32.1 Math Library

New: `sqrt()`, `pow()`, `abs()`, `floor()`, `ceil()`, `min()`, `max()`,
`randomInt()`, `sin()`, `cos()`, `tan()`, `log()`, `exp()`. `round()`/
`random()` are Phase 6 and unchanged.

- `min()`/`max()` are **variadic** (2 or more arguments) — the only
  built-ins in the language with an open-ended argument count;
  `BUILTIN_SIGNATURES`'s `maxArgs: Infinity` and `describeArgCount()`
  render this as "2 or more" in a P016 message rather than the confusing
  literal `2-Infinity`.
- `sqrt()` of a negative number and `log()` of zero or a negative number
  raise the new **P028 (Math domain error)** — not P002 (that code means
  "wrong type," not "right type, undefined value").
- Every other function is a thin, defensively-validated wrapper over the
  matching `Math.*` — `pow`/`sin`/`cos`/`tan`/`log`/`exp` documented as
  returning Decimal (fraction-prone), `abs`/`floor`/`ceil`/`min`/`max`/
  `randomInt` as Number, exactly like `round()`'s own existing
  Number-vs-Decimal convention (§16.3) — this is a *static* hint for the
  type checker only; the actual runtime value's Number-vs-Decimal boxing
  is decided the same way it always has been, by
  `RuntimeValue.wrap()`'s `Number.isInteger()` check (§12.2), so which one
  is declared here never causes an incorrect result.

### 32.2 String Library

New: `upper()`, `lower()`, `trim()`, `split()`, `join()`, `replace()`,
`startsWith()`, `endsWith()`, `substring()`, `lastIndexOf()`,
`repeatText()`, `reverseText()`. `len()` is Phase 6/9 and unchanged.

- `contains()` and `indexOf()` are **polymorphic** — String or Array — the
  same "one name, dispatch on the runtime value's actual type" pattern
  `len()` already established in Phase 9 for "how long is this." A
  String first argument requires a String second argument (P002
  otherwise); an Array first argument keeps Phase 9's exact deep-equality
  behavior. Only one implementation can be registered per name, so the
  dispatch lives in `src/stdlib/array/index.js` (which already owned
  `contains()`), calling back into `src/stdlib/string/index.js`'s
  string-only helpers for a String first argument.
- `replace()` replaces **every** occurrence (`replace("banana", "a", "o")`
  → `"bonono"`), matching Python's `str.replace` rather than JavaScript's
  single-match `String.prototype.replace`.
- `substring(text, start[, end])` is JS-`slice`-style (end exclusive,
  optional); an out-of-range or inverted `[start, end)` raises the new
  **P029 (String index out of range)**.
- `split()`/`reverseText()`/`substring()` all operate on Unicode code
  points (`Array.from(text)`), not raw UTF-16 code units — an astral
  character (e.g. an emoji outside the Basic Multilingual Plane, stored
  as a UTF-16 surrogate pair) reverses or slices as one character, not
  two broken halves.

### 32.3 Array Library

New: `clear()`, `length()`, `isEmpty()`. `push()`/`pop()`/`insert()`/
`remove()`/`sort()`/`reverse()`/`contains()` are Phase 9 and unchanged;
`indexOf()` is documented in §32.2 (its String half) alongside its Array
half.

- `length()` is a **second registered name** for the exact same
  implementation as `len()` (String or Array) — not a reimplementation —
  continuing Phase 9's own precedent of one function serving two names
  for the same concept.
- `isEmpty()` is polymorphic (§32.4): an Array is empty when it has zero
  elements; any other value is "empty" only when its *type* is actually
  Empty (`empty`) — a Number `0`, an empty String `""`, and `false` are
  all real, non-Empty values, so none of them are "empty."
- `clear()` empties an array in place (mutates, matching `push()`/
  `pop()`/`sort()`/`reverse()`'s existing mutate-in-place convention) and
  returns it.

### 32.4 Type Library

New: `boolean()`, `isNumber()`, `isText()`, `isBoolean()`, `isEmpty()`
(documented once, in §32.3, rather than twice). `number()`/`text()`/
`type()` are Phase 6 and unchanged.

`boolean(value)` converts: a Boolean passes through; `empty` is always
`false`; a Number/Decimal is `false` only for exactly `0`; a String must
be exactly `"true"`/`"false"` (any letter case, surrounding whitespace
trimmed) or it raises **P006 (Runtime conversion error)** — the same code
`number()` already uses for "this text isn't a valid number," extended to
"this text isn't a valid boolean" rather than inventing a new code for
the same *kind* of failure.

### 32.5 File Library — not yet implemented

Deferred to sub-phase 13b (§32 table above). Not started.

### 32.6 JSON Library — not yet implemented

Deferred to sub-phase 13c. Not started.

### 32.7 HTTP Library — not yet implemented

Deferred to sub-phase 13e, deliberately last — see §32.10.

### 32.8 Date & Time Library — not yet implemented

Deferred to sub-phase 13d. Not started. Whatever representation it lands
on cannot be a new static type (`DataType` — §14.4 — is one of the
modules this phase must not modify): a Number (epoch milliseconds) or a
formatted String are the two representations compatible with the
existing type system without extending it.

### 32.9 System Library

New: `sleep()`, `version()`, `platform()`, `workingDirectory()`,
`arguments()`.

- **`stop()` from the original brief is deliberately not implemented.**
  `stop` is already a reserved keyword with its own statement grammar
  (`stop [code]`, Phase 8, §15.7) that terminates the program immediately
  from anywhere — a same-named callable expression is not reachable
  without a parser/grammar change, which this phase does not make (the
  Parser is one of the modules Phase 13 must not modify). The existing
  statement already covers this System Library entry.
- `sleep(milliseconds)` blocks the calling thread for real, synchronous
  time via `Atomics.wait` on a throwaway `SharedArrayBuffer(4)`. Unlike a
  browser main thread, Node.js does not forbid a blocking `Atomics.wait`
  call on its own main thread — this needed no worker thread, no new
  dependency, and no change to the Interpreter/VM's fully synchronous
  execution model, which is exactly why it was safe to add in 13a rather
  than waiting for the concurrency work HTTP will eventually need (§32.10).
- `version()`/`platform()` reuse `src/cli/version-info.js`'s existing
  `LANGUAGE_VERSION`/`COMPILER_VERSION`/`platformInfo()` — the same values
  `pari --version` already prints (§19) — rather than a second source of
  truth.
- `arguments()` returns the extra words after the source file on the
  command line (`pari script.pr foo bar` → `arguments()` is
  `box("foo", "bar")`) — previously silently discarded by `parseArgs()`.
  `src/cli/args.js` now captures them as `programArgs`, and
  `runCli()` stores them once per process (`src/stdlib/system/program-args.js`)
  before any mode can execute Parithi code — a small, additive CLI change
  (CLI is not one of Phase 13's protected modules), not a VM/Interpreter
  change, and harmless for every other flag.

### 32.10 Why HTTP Ships Last

The original brief asks for `get()`/`post()`/`put()`/`delete()`/
`download()` to behave like ordinary, blocking function calls — call it,
get a response back, keep executing. Parithi has no `async`/`await`,
Promises, or any concurrency primitive anywhere in its language, AST,
Interpreter, or VM (by design — §12–§17 describe a fully synchronous
language), and this phase is not permitted to add one. Node.js itself has
no *built-in* synchronous network client — `fetch()` is Promise-based —
and this project has maintained **zero runtime dependencies** since v1.0
(README, `package.json`). Making `get()` truly block therefore needs one
of: a `worker_threads` + `Atomics.wait` bridge (dependency-free, but a
real, first-of-its-kind piece of machinery for this codebase), shelling
out to `curl` via `child_process` (simple, but fragile — depends on
`curl` being installed, weaker control over headers/timeout/JSON body),
or a real dependency (breaks the zero-dependency claim). None of these
is a small addition, which is exactly why HTTP is sequenced last (13e) —
every synchronous, dependency-free library ships and is fully verified
first, and the one library requiring a genuine architecture decision is
tackled in isolation rather than risking the whole phase on its hardest
part.

### 32.11 Error Codes

Two new codes, continuing the existing sequence:

| Code | Name | Raised by |
|---|---|---|
| P028 | Math domain error | `sqrt()` of a negative number; `log()` of zero or a negative number; `randomInt()` with its upper bound below its lower bound |
| P029 | String index out of range | `substring()` with an out-of-range or inverted `[start, end)` |

`boolean()`'s unconvertible-String case reuses **P006** (Runtime
conversion error, the same code `number()` already uses); every
wrong-type argument across every new built-in reuses **P002** (Type
mismatch), exactly like every Phase 6/9 built-in before it.

### 32.12 Testing Summary

`tests/math.test.js` (16 tests), `tests/string.test.js` (18 tests),
`tests/array.test.js` (9 tests), `tests/stdlib.test.js` (17 tests —
Type/System libraries plus an Interpreter-vs-PVM parity sweep across
every new built-in in every category, the same method §30.11/§31.10
already use), plus 5 new `tests/e2e.test.js` cases for the new
`examples/stdlib/` programs and 2 new `tests/foundation.test.js` cases
for the error-code count and `arguments()` CLI parsing. Total: **761
tests** (695 pre-Phase-13 + 66 new), all passing, zero regressions, with
every protected module (Lexer, Parser, AST, Semantic Analyzer *logic*,
Bytecode, VM, Optimizer) verified unchanged.

### 32.13 CLI

No new flags this sub-phase — every new built-in is called the same way
any existing one is (`sqrt(25)`, `upper(text)`, etc.), through the exact
same `pari <file.pr>` / `pari --run-bytecode <file>` paths documented in
§19/§30.7/§31.9. The only CLI-visible change is `arguments()`'s
extra-word capture (§32.9), which is backward compatible: those words
were previously parsed and silently ignored, never rejected, so no
existing invocation's behavior changes.

### 32.14 Examples

`examples/stdlib/calculator.pr`, `random-number-generator.pr`,
`array-demo.pr`, `string-utilities.pr` — one per library covered so far,
following the existing `examples/` convention (§10) of a short,
runnable demonstration per feature area.

---

## 33. Native Compiler (Phase 13, x86-64 Backend)

**Status: a genuine, real, working foundation — not full-language native
compilation.** This section documents exactly what exists, proven by
actually executing generated `.exe` files on real Windows, not what the
architecture is eventually meant to support. See §33.9 for the honest
supported/unsupported boundary.

### 33.1 Overview and Scope

Phase 13 adds a **third execution backend** alongside the Tree-Walking
Interpreter (default) and the Bytecode Generator/PVM (§29/§30/§31) —
none of which this phase modifies. Where the bytecode path is
`AST → Bytecode → PVM` (a portable, Parithi-defined instruction set
interpreted by `src/vm/`), the native path is `AST → Native IR → x86-64
machine code → a real Windows PE32+ .exe`, executed directly by the CPU
with no Parithi runtime, no Node.js, and no `pari` process involved at
all once compiled:

```
                                                    ┌─→ Tree-Walking Interpreter ─────────────────────────┐
Source (.pr) → Lexer → Parser → AST → Semantic Analyzer ─┤                                                        ├─→ Output
                                                    ├─→ Bytecode Generator → [Optimizer] → PVM ─────────────┤
                                                    └─→ Native IR → x86-64 Backend → PE .exe → Windows CPU ─┘
```

Reached via `pari --native <file.pr>` (§33.10). Every stage before "Native
IR" — Lexer, Parser, AST, Semantic Analyzer — is the exact same,
unmodified frontend every other backend already uses (§30.2's "reuse, not
reimplement" principle, continued): `src/native/native-compiler.js`
calls the identical `Lexer`/`Parser`/`SemanticAnalyzer` classes
`src/cli/commands.js` already uses for every other mode.

### 33.2 Why No Assembler or Linker Is Used

This machine has no C compiler, assembler, or linker available at all
(checked directly: no gcc, clang, nasm, MSVC `cl`/`ml64`/`link`, MinGW, or
LLVM). Every real compiler (GCC, Clang, Rust, Go) normally emits assembly
or an object file and hands the actual executable-format bytes to a
battle-tested external assembler/linker — that option does not exist
here. Every byte of every PE header, section, import table, and x86-64
instruction in this backend is therefore produced directly by
hand-written JavaScript in `src/native/`, following the Microsoft
PE/COFF Specification and the Intel 64 and IA-32 Architectures Software
Developer's Manual directly — not approximated, and verified by actually
executing the result on this real Windows machine at every step (§33.8).

### 33.3 Architecture

```
src/native/
├── native-compiler.js          orchestrator: Lexer/Parser/SemanticAnalyzer (unmodified) → codegen → PE writer
├── errors.js                   NativeCompileError (P030) — same CompilerError.format() shape as every other diagnostic
├── codegen/
│   ├── native-codegen.js       AST (supported subset only) → Native IR → x86-64 instructions + PE fixup metadata
│   └── x86-64-encoder.js       hand-encoded x86-64 instructions (documented byte-for-byte against the Intel manual)
└── pe/
    ├── pe-writer.js            assembles the complete PE32+ file: headers, sections, two-pass fixup patching
    └── rdata-builder.js        builds the import table (Import Directory/IAT/Hint-Name) + string constant data
```

Deliberately leaner than a suggested `src/native/native-ir/`,
`codegen/registers.js`, `codegen/calling-convention.js`,
`linker/linker.js`, `runtime/native-runtime.js` split: the "Native IR" for
the currently-supported subset is small enough (`Say(text)` /
`Exit(code)` — §33.4) that a separate IR module/class hierarchy would be
pure ceremony over two node shapes; register constants and the calling
convention are documented as comments directly in the encoder/codegen
files that embody them (§33.5/§33.6), where they're actually load-bearing;
there is no separate object-file-then-link step (the PE writer produces
the final executable directly), so no `linker/` module exists yet. This
will be revisited if/when control flow and functions genuinely need a
richer IR (§33.11's recommended next steps) — not before, per the
project's "no premature abstraction" convention.

### 33.4 Native IR

**Superseded by a real three-address-code IR + optimizer — see §33.15
onward.** (This subsection's original text described a two-operation
placeholder, `Say`/`Exit`, kept below only as history; `compileNative()`'s
`ir` field / `pari --native --ir` still expose that original short
summary unchanged, but the actual code generator now consumes a genuine
IR — `pari --native --emit-ir`/`--emit-optimized-ir`, §33.19.)

<details><summary>Original text (pre-IR-pipeline), preserved for history</summary>

The intermediate representation between the AST and the x86-64 backend,
today, is exactly two operation kinds (see `compileProgramToNative()`'s
own `ir` output, inspectable via `pari --native --ir`, §33.10):

| IR operation | Meaning | Compiles to |
|---|---|---|
| `Say(text)` | Print `text` followed by a newline | `GetStdHandle` (once, cached in RSI) + one `WriteFile` call per `Say` |
| `Exit(code)` | Terminate the process with `code` | One `ExitProcess` call |

Every Parithi program that compiles natively today is exactly a sequence
of `Say` operations followed by one implicit trailing `Exit(0)` (a
program that runs to completion without an explicit `stop` always exits
0, matching the Interpreter/PVM — §15.7). This is intentionally the
smallest possible real IR, not a placeholder: it already has the
property the brief asks for ("design the IR so another CPU backend could
theoretically be added later") — an ARM64 backend would consume the
exact same `{ir: ['Say(...)', 'Exit(0)']}` shape and only need its own
codegen module, none of `native-codegen.js`'s AST-walking/validation
logic.

**Growing the IR (recommended for the next phase, not started now):**
adding variables/arithmetic/control flow will need genuine IR node types
for `Const`, `Load`/`Store`, `BinaryOp`, `Label`, `Jump`/`JumpIfFalse`,
`Call`/`Return` (the brief's own §4 list) — at that point, factoring a
real `native-ir/` module (separate from `native-codegen.js`'s AST walk)
becomes justified, since there will be enough IR node variety for a
walker to meaningfully operate over instead of two hardcoded cases.

</details>

### 33.5 x86-64 Code Generation

`src/native/codegen/x86-64-encoder.js` hand-encodes exactly the
instructions the current subset needs — documented, not a general-purpose
assembler (extend it with new, individually-documented functions as more
IR operations are added, per its own class doc):

| Instruction | Encoding | Used for |
|---|---|---|
| `mov r64, imm64` | REX.W + (B8+r) + imm64 | Loading an absolute address (IAT slot, string data) — safe because the image has a fixed base and no relocations (§33.7) |
| `mov r32, imm32` | (REX.B?) + (B8+r) + imm32 | Small integer constants (exit codes, string lengths, `STD_OUTPUT_HANDLE`) |
| `mov r64, r64` | REX.W + 0x89 /r | Register-to-register moves (e.g. saving a return value) |
| `lea r64, [rsp+disp8]` | REX.W + 0x8D /r + SIB + disp8 | Computing the address of a stack-local scratch slot |
| `mov qword [rsp+disp8], imm32` | REX.W + 0xC7 /0 + SIB + disp8 + imm32 | Zeroing a stack-passed argument (e.g. `WriteFile`'s unused `lpOverlapped`) |
| `call [reg]` | 0xFF /2 (+REX.B) | Calling an imported Windows API function through its IAT slot |
| `sub`/`add rsp, imm8` | REX.W + 0x83 /5 or /0 | Stack frame allocation/deallocation |

**General-purpose registers used:** RCX/RDX/R8/R9 (argument passing,
per convention below), RAX (return values, scratch), RSI (callee-saved —
holds the console handle across calls that would otherwise clobber it).

**Calling convention: the standard Microsoft x64 calling convention** (not
invented) — RCX/RDX/R8/R9 for the first four integer/pointer arguments,
arguments 5+ on the stack at `[rsp+32]`/`[rsp+40]`/..., 32 bytes of
caller-reserved "shadow space" before every call, RSP 16-byte aligned
immediately before every `call`, RAX for return values, RBX/RBP/RDI/RSI/
R12-R15 callee-saved.

**Stack layout for the program's entry-point "function"** (documented in
full in `native-codegen.js`'s own class doc): the OS transfers control to
the entry point exactly as if via a `call`, so RSP ≡ 8 (mod 16) there —
the standard x64 entry convention. `sub rsp, 0x38` (56 ≡ 8 mod 16)
restores 16-byte alignment for every subsequent call. That 56-byte frame:
`[rsp+0..31]` shadow space, `[rsp+32..39]` a 5th-argument slot (used by
`WriteFile`'s `lpOverlapped=NULL`), `[rsp+40..47]` scratch for
`WriteFile`'s `lpNumberOfBytesWritten` out-parameter, `[rsp+48..55]`
padding. **Function prologue/epilogue** (for user-defined `task`s) and a
**local-variable stack layout** don't exist yet — there are no
user-defined functions or local variables in the compiled subset (§33.9);
this is explicitly future work, not an oversight.

**External/runtime calls** go through the PE Import Address Table (§33.7)
— `KERNEL32.DLL`'s `GetStdHandle`, `WriteFile`, `ExitProcess` today; no
other native runtime dependency exists.

### 33.6 Data Representation

Only two Parithi runtime concepts are represented natively today:

- **String literals** — raw UTF-8 bytes (Parithi source is already
  read as UTF-8 — §1) placed in `.rdata`, with an explicit byte length
  passed to `WriteFile` (no null terminator, no length-prefix — matching
  how `WriteFile`'s own signature works, not a Parithi convention).
- **A process exit code** — a 32-bit integer, passed directly to
  `ExitProcess` in ECX; no boxing, no runtime type tag.

**Not yet represented (future work, §33.11):** Number, Decimal, Boolean,
Empty, Array. Deciding their native representation (integer width,
tagged-union vs. separate typed storage, memory ownership/allocation for
Arrays) is real design work deliberately deferred rather than guessed at
now — see §33.11's recommended next steps for where that decision belongs.
**Runtime type information** doesn't exist natively at all yet (there is
no equivalent of `RuntimeValue`/`type()` in compiled code) since every
value the current subset handles (a string literal, a hardcoded exit
code) has a statically-known, single representation with nothing to tag.
**No dynamic memory allocation happens** in a compiled program today (no
heap, no `VirtualAlloc`/`HeapAlloc` calls) — every value is either a
compile-time constant embedded in `.rdata` or a fixed stack slot.

### 33.7 Executable Generation (PE32+ Writer)

`src/native/pe/pe-writer.js` builds a complete, standalone Windows
executable — no template, no stub linked from elsewhere. Key decisions,
each chosen for correctness first (verified against this machine's real
loader, §33.8), not convenience:

- **Fixed image base (`0x140000000`), no ASLR.**
  `IMAGE_DLLCHARACTERISTICS_DYNAMIC_BASE` is deliberately NOT set, so
  Windows always loads the image at the same address. This means every
  absolute address the compiled code needs (an IAT slot, a string's
  location) is a **link-time constant** — the codegen bakes them in as
  plain 64-bit immediates, with no base-relocation table (`.reloc`)
  needed. A correct simplification for a first backend, not a shortcut
  that produces wrong results.
- **Two sections**: `.text` (code; executable+readable) and `.rdata`
  (import table + string constants; readable **and** writable — writable
  because the Windows loader patches the IAT's slots with real function
  addresses at process start).
- **Two-pass fixup patching**, because of a genuine chicken-and-egg
  problem: the machine code needs the absolute address of the import
  table/strings, but `.rdata`'s address depends on `.text`'s final size,
  which isn't known until codegen finishes. Pass 1 generates `.text` with
  placeholder zero immediates, recording each one's byte offset. Once
  `.rdata`'s size (and therefore its RVA) is known, pass 2 patches every
  recorded offset with the real absolute address. `.rdata` has an
  analogous **second**, internal fixup pass of its own: the Import
  Directory Table's `Name`/`FirstThunk` fields and every IAT entry point
  at *other locations inside `.rdata` itself*, which also aren't real
  RVAs until `.rdata`'s own address is known — `rdata-builder.js` records
  these as `internalFixups`, patched by `pe-writer.js` right alongside
  `.text`'s own fixups. **This exact bug (forgetting the second pass) was
  caught by actually executing a generated `.exe`**: the file loaded
  (proving the PE format itself was fine) but crashed with
  `STATUS_ACCESS_VIOLATION (0xC0000005)`, because the Import Directory's
  `Name`/`FirstThunk` fields held small local offsets instead of real
  RVAs — a concrete demonstration of why §33.8's "actually run it" rule
  matters more than "the bytes look plausible."
- **Import table without a separate ILT**: each `IMAGE_IMPORT_DESCRIPTOR`'s
  `OriginalFirstThunk` is 0 — a documented, valid PE simplification where
  the loader uses `FirstThunk` (the IAT) for both name-based binding and,
  after binding, as the actual runtime address table.

### 33.8 Testing — Real Execution, Not Just "It Compiled"

`tests/native/native-compiler.test.js` (37 tests) never stops at "the
compiler produced bytes." Every success-path test **writes a real `.exe`
to disk and executes it** (`spawnSync`), asserting on genuinely-observed
stdout and exit code — the only way to actually prove hand-rolled PE and
x86-64 bytes work on real Windows:

- Hello World, multi-`say`, multi-value `say`, empty strings, a 250-byte
  string, 50 sequential `say` statements, and a program with no `say`
  statements at all — each compiled, written, executed, and checked.
- **PE structural correctness** — DOS/PE/COFF/Optional header fields
  read back and checked directly against expected values.
- **16 unsupported-feature cases** (variables, constants, arithmetic,
  comparison, boolean logic, `if`/`while`/`repeat`/`choose`, functions,
  `stop`, non-literal/non-String `say` arguments, arrays) — each asserted
  to fail with exactly `P030`, never a crash, never a silently-wrong `.exe`.
  Lexical/semantic errors reaching `compileNative()` are asserted to keep
  their *own* codes (P009/P001/etc.), not get relabeled P030.
- **Cross-backend parity** — every currently-native-supported program run
  through the Interpreter, the PVM, and a real executed native `.exe`,
  asserting identical stdout and exit code across all three (§33.1's own
  requirement, satisfied for the current subset).
- **`--ir`/`--asm` output** — asserted non-empty and structurally sane.
- **Unit-level PE/rdata correctness** — offset bookkeeping, a hand-built
  minimal `ExitProcess(7)`-only program (proving the import
  table/calling-convention mechanism independent of any string handling —
  this was literally how the access-violation bug above was isolated;
  see §33.7's own account), and a defensive check that a fixup referencing
  an unregistered import throws a clear internal error rather than
  silently producing a broken `.exe`.

`examples/native/hello.pr` and `strings.pr` are the two golden programs
that genuinely compile — deliberately not a full `variables.pr`/
`loops.pr`/`functions.pr`/etc. set (as an earlier draft of this brief
requested), since creating example files for constructs the backend can't
actually compile would misleadingly imply support that doesn't exist; the
16 unsupported-feature tests above cover those constructs' *diagnostic*
path instead, with inline source strings. (Phase 17 — §37 — later added
`examples/native/variables.pr` once variables/arithmetic/comparisons
genuinely compiled; the same "only add an example for what really
works" principle applied then, too.)

**Regression baseline:** 765 tests passing immediately before this phase;
**802 tests passing after** (765 + 37 new native tests), zero regressions
— every existing Lexer/Parser/AST/Semantic Analyzer/Interpreter/Bytecode/
PVM/Optimizer/Standard-Library test still passes unchanged, confirming
none of those modules were touched.

### 33.9 Supported vs. Unsupported Features (Native-Support Matrix)

**Historical note:** this section originally described the Phase 13
boundary (`say` with String literals only). Phase 17 (§37) expanded real
x86-64 codegen using the IR Optimizer's existing constant-folding and
constant-propagation passes — the matrix below reflects the current,
post-Phase-17 boundary; §37 has the full rationale and audit trail.

**Supported today**, each proven by a passing execution test (§33.8/§37.4):

| Feature | Native support |
|---|---|
| `say` with one or more String/Number/Decimal/Boolean/Empty literal arguments (multi-value, space-joined) | ✅ Yes |
| `hold`/`const` declarations, and reassignment (`x = ...`), whenever the value is compile-time-constant-foldable | ✅ Yes |
| Arithmetic (`+ - * / % **`) and comparisons (`== != > < >= <=`) on literals/variables | ✅ Yes |
| Unary `-` and `not` | ✅ Yes |
| A variable read, anywhere the read does not appear inside that same variable's own reassignment | ✅ Yes |
| Empty-string / empty-program edge cases | ✅ Yes |
| Implicit exit code 0 on normal completion | ✅ Yes |

**Not yet supported** — every one of these raises a clean `P030`
diagnostic (feature name, source location, reason, a suggested
alternative), never a crash or a silently-wrong `.exe` (§33.8/§37.4's
test cases): `and`/`or` (real short-circuit branching); `if`/`else`,
`choose`, `while`, `repeat`, `loop`, `break`, `continue`; `task`
declarations, calls, `return`, recursion; `stop`; Arrays (`box`); every
Standard Library built-in (§32); a self-referencing reassignment
(`x = x + 1`) and division/modulo by a divisor that folds to zero (both
would require reading/computing a real runtime value, not a compile-time
constant — see §37.3). This is the honest, current boundary — not a
roadmap promise stated as if already true.

**Built-in function native-support matrix** — every built-in currently
raises `P030` (none are natively supported yet, since native codegen has
no runtime call convention for them defined — that's real design work,
not a gap that can be "just" implemented per-function):

| Built-in | Native support | Built-in | Native support |
|---|---|---|---|
| `len()` | ❌ No | `round()` | ❌ No |
| `number()` | ❌ No | `sqrt()` | ❌ No |
| `text()` | ❌ No | `abs()` | ❌ No |
| `type()` | ❌ No | *(every other §16.5/§28.5/§32 built-in)* | ❌ No |

### 33.10 CLI

```
pari --native <file.pr>              Compile to a .exe next to the source
pari --native <file.pr> -o <path>    Compile to <path> instead
pari --native <file.pr> --ir         Also print the Native IR (Say(...)/Exit(...) list)
pari --native <file.pr> --asm        Also print the generated x86-64 (offset, hex bytes, mnemonic)
```

`-o`/`--ir`/`--asm` compose freely with each other and with `--native`,
following the exact modifier-flag convention `--verbose`/`--optimize`
already established (§31.9) — `--ir`/`--asm` are opt-in inspection only,
never the default output (per the brief's own §14: "do not expose
unstable internal details as the default user experience"). Every
existing command (`pari <file.pr>`, `--tokens`, `--ast`, `--analyze`,
`--runtime`, `--bytecode`, `--compile`, `--run-bytecode`, `--stats`,
`--disassemble`, `--version`, `--help`) is completely unaffected — `pari
--help` lists `--native` alongside them.

### 33.11 Error Codes

One new code, continuing the existing sequence:

| Code | Name | Phase | Raised by |
|---|---|---|---|
| P030 | Unsupported native compilation feature | Native Compilation (new `ErrorPhase`) | Any AST node or `say` argument the x86-64 backend doesn't compile yet (§33.9) |

Formatted identically to every other Parithi diagnostic (`NativeCompileError`
extends the same `CompilerError` used by the Lexer/Parser — §18): code,
message, `file:line:column`, and a hint (here, always a suggested
alternative — e.g. "use `pari --run-bytecode`/`pari <file.pr>` for
full-language support").

### 33.12 Performance

`benchmarks/native-benchmark.mjs` measures the **one** workload
genuinely comparable across all three backends today — Hello World (see
§33.9: nothing CPU-bound like a loop or recursion is supported yet, so
benchmarking those would be meaningless). Measured on the machine this
phase was built on, median of 10 runs each as a real OS process:

| Backend | Median wall-clock time |
|---|---|
| Tree-Walking Interpreter (`node bin/pari.js hello.pr`) | ~323 ms |
| PVM (`node bin/pari.js --run-bytecode hello.pr`) | ~320 ms |
| Native `.exe` (directly, no Node.js) | ~20 ms |

**Honest interpretation, not an oversold headline:** native is ~16x
faster here almost entirely because the Interpreter/PVM numbers include a
full Node.js process startup (module loading, V8 initialization) on every
run, which a native `.exe` has no equivalent of — this is **not yet**
evidence that native-compiled *code* executes faster than interpreted/
bytecode execution for the same workload. Proving that requires a
CPU-bound benchmark (a large loop, recursion) that isn't supported by the
native backend yet (§33.9) — recorded honestly rather than claimed
prematurely, per the brief's own explicit instruction ("Do NOT claim
native is faster until measured").

### 33.13 Known Limitations

- **Windows x86-64 only.** No Linux/macOS/ARM64 target exists or was
  attempted — explicitly out of scope for this phase, per the brief.
- **Only compile-time-constant-foldable `say`/`hold`/`const`/assignment
  compile natively** (expanded in Phase 17 — §37) — see §33.9's full
  matrix. This is the single most important limitation to state plainly:
  this is a real, working *foundation*, not full native compilation of
  the language.
- **No native RUNTIME for anything beyond console output and process
  exit** — every value a native program ever prints or stores was already
  resolved to a known constant at *compile* time by the IR Optimizer;
  there is no register allocator, no runtime variable storage, no memory
  allocator, and no error-handling runtime (a native program cannot yet
  raise a Parithi runtime error like P020/P024 at *its own* runtime —
  every condition that would cause one, such as division by a divisor
  that only resolves to zero, is instead caught earlier, at
  native-*compile* time, as a clean unsupported-feature diagnostic,
  since real control flow — the only way a value could stay unknown
  until actual runtime — isn't compilable yet either).
- **No native optimizer.** The Phase 12 Bytecode Optimizer (§31) operates
  on Bytecode, not native machine code; `--optimize` has no defined
  meaning combined with `--native` yet and is currently a silent no-op
  there, consistent with how every CLI mode silently ignores flags
  irrelevant to it.

### 33.14 Recommended Next Phase

**Updated — items 1-3's own IR groundwork is now done (§33.15 onward);
what remains for each is specifically the x86-64 CODEGEN, not IR design:**

1. **Variables and arithmetic** — the IR already fully models this
   (`STORE`/variable operands/`ADD`/`SUB`/.../`EQ`/etc. — §33.16) and the
   IR Optimizer already optimizes it (§33.18). What's missing is
   `ir-to-x86-64.js` actually emitting real instructions for these IR
   shapes: a decided Number/Decimal representation (§33.6) and
   local-variable stack slots (extending §33.5's stack-frame design,
   which currently has none, since there are no local variables to store
   yet in the native-emittable subset).
2. **Control flow** (`if`/`while`/`repeat`/`break`/`continue`) — the IR
   already fully models this as real basic blocks with `JUMP`/`BRANCH`
   terminators (§33.16); what's missing is conditional-jump encodings
   (`Jcc`) in `x86-64-encoder.js` and a codegen pass that walks multiple
   IR blocks (today's `ir-to-x86-64.js` only ever sees `$main`'s single
   block, since Stage 1's AST gate never lets a branching program reach
   the IR generator with a "compile this" intent — see §33.3/native-codegen.js's own class doc).
3. **Functions and recursion** — the IR already compiles every `task`
   into its own `IRFunction` with real parameters and `RETURN` (§33.16);
   what's missing is a real x86-64 call stack discipline (prologue/
   epilogue, parameter passing beyond the four fixed native-runtime calls
   that exist today, a return-value convention) — the brief's own worked
   example (`fact(5)` → `120`) is a good acceptance test for this step
   specifically, and is already a passing IR-level test (§33.17) waiting
   on x86-64 codegen to make it a passing *native execution* test too.
4. **String operations, Arrays, and the Standard Library** — each needs
   its own native-runtime design (§33.6/§33.9's built-in matrix) once a
   real memory model (allocation/ownership) exists, which items 1-3 don't
   yet require.

Not recommended before the above: broadening OS/CPU target support
(§33.13) — every additional target multiplies the PE-writer-equivalent
and encoder-equivalent work for a language subset that still can't do
arithmetic natively.

### 33.15 What Is IR, and Why Parithi Uses One

An **Intermediate Representation** is a program form that sits between
the AST (what the parser produced — still shaped like Parithi's own
grammar: `IfStatement`, `WhileStatement`, nested expression trees) and
the target machine code (x86-64 instructions — flat, register-and-memory-
oriented, nothing resembling `if`/`while` at all). Compiling straight
from the AST to machine code (which `native-codegen.js` did before this
IR pipeline existed, and still effectively does for the currently-
emittable subset — §33.16's "why a real IR, even for a tiny subset" note)
works for something as simple as "print a string," but breaks down the
moment the compiler needs to **optimize** — constant folding, dead-code
elimination, and every other pass in §33.18 all need to see a program in
a shape where "compute this value" and "use it here" are separate,
individually-inspectable steps, not baked directly into nested AST
subtrees. Three-address code (§33.16) gives exactly that: every
operation names its inputs and output explicitly (`t2 = ADD t0, t1`), so
an optimizer pass can reason about, rewrite, or delete one instruction at
a time without having to understand Parithi's grammar at all.

### 33.16 AST vs. IR

| | AST | IR |
|---|---|---|
| Shape | A tree, mirroring source syntax (`BinaryExpression{left, operator, right}`) | A flat list of instructions per basic block, three-address-code style |
| Produced by | The Parser | `src/native/ir/ir-generator.js`, from a semantically-valid AST |
| Knows about | Parithi's grammar (`if`/`while`/`say`/...) | Nothing about grammar — only `CONST`/`ADD`/`STORE`/`CALL`/`JUMP`/`BRANCH`/`RETURN`/... (`IrOp`, `src/native/ir/ir-nodes.js`) |
| Control flow | Nested statement lists (`Block.body`) | Explicit basic blocks (`BasicBlock`) linked by `JUMP`/`BRANCH` terminators — no nesting, just a graph |
| Values | Expression subtrees, re-evaluated wherever they appear | Named virtual registers (`temp`s, e.g. `t3`) or variables (`var`, mangled — same slot-mangling scheme `src/bytecode/bytecode-generator.js` already uses for shadowing), each computed once |
| Consumed by | The Semantic Analyzer, the Bytecode Generator, the Interpreter, `ir-generator.js` itself | `src/native/ir/optimizer/` (optimization) and `ir-to-x86-64.js` (code generation) |

**Optimization safety is the reason for every design choice here** — every
virtual register (`temp`) is defined exactly once and consumed only
within the SAME basic block it's defined in (never across a `JUMP`/
`BRANCH`); only named variables (`var` operands, via `STORE`) carry a
value across blocks. This single invariant is what makes every optimizer
pass in §33.18 simple and provably safe: a pass never has to do
whole-program dataflow analysis to know a temp's value — it's always
either not-yet-computed or fixed-for-the-rest-of-this-block.

### 33.17 IR Instruction Format

Three-address code: `dest = OP arg1, arg2` (or `OP arg1, arg2` for an
effect-only instruction with no `dest`, like `STORE`/`PRINT`/`CALL`-with-
a-discarded-result). Every instruction is an `IRInstruction { op, dest,
args, node }` (`node` is the originating AST node, kept for diagnostics
only — never consulted by codegen). Every `IRFunction` is a list of
`BasicBlock`s; every block is a list of instructions plus exactly one
**terminator** (`JUMP`/`BRANCH`/`RETURN`) — control never just "falls off
the end" of a block into the next one in memory; every transfer of
control is an explicit, labeled jump.

Operand kinds (`ir-nodes.js`):

| Kind | Example | Meaning |
|---|---|---|
| `temp` | `t3` | A virtual register — defined once, used only within its own block |
| `var` | `x$0` | A named (mangled) variable slot — may be written more than once, read from any block |
| `const` | `10`, `"hi"`, `true` | A compile-time literal |

Worked example — `hold x = 10 + 20` / `hold y = x * 2` (this exact
program is a permanent regression test, `tests/native/ir.test.js`):

```
function $main():
entry_0:
    t0 = CONST 10
    t1 = CONST 20
    t2 = ADD t0, t1
    STORE x$0, t2
    t3 = CONST 2
    t4 = MUL x$0, t3
    STORE y$1, t4
    RETURN empty
```

Note `x$0` is used BARE as an operand to `MUL` (no `LOAD` instruction) —
a deliberate choice (`ir-generator.js`'s own class doc): a variable read
never needs its own instruction at this IR level, only a literal does
(materialized via `CONST` so there's something for Constant Folding/
Propagation to actually operate on).

### 33.18 AST → IR Conversion

`src/native/ir/ir-generator.js`'s `IRGenerator` walks the AST exactly the
way `src/bytecode/bytecode-generator.js` already does (one method per
node type, a `CompileScope` chain for shadowing-safe slot mangling, a
`loopStack` for `break`/`continue`, predeclare-then-compile for `task`s)
— re-deriving the same already-proven answers for a three-address-code
shape instead of a stack-machine one, rather than inventing a second,
independently-verified approach. Currently supported (§4 of this phase's
own brief, verified by `tests/native/ir.test.js`'s 23 tests): variable
declaration/assignment, constants, arithmetic, comparison, boolean
(`and`/`or`/`not`, lowered to real short-circuit branches — never an
eager instruction, since eagerly evaluating the right-hand side would be
an actual behavior change, e.g. a skipped side effect), unary negation,
variable references, function calls, `return`, `if`/`else`, `while`,
`repeat`, `break`/`continue`, `say`, `task` definitions (including
recursion and nested calls). **Not yet lowered**: `choose`, `stop`,
Arrays (`box`) — each raises a plain `Error` naming the construct (not a
user-facing `NativeCompileError` — the AST-level gate in
`native-codegen.js`, §33.3, already rejects these with a proper
diagnostic before the IR generator would ever see them for a `--native`
compile; this generator's own error is a defensive backstop for direct
callers, e.g. future tooling that skips that gate deliberately).

### 33.19 The IR Optimizer (6 Passes)

`src/native/ir/optimizer/` — one file per pass, orchestrated by
`optimizer/index.js`'s `optimize(program, config, maxSweeps)`. Runs in
this fixed order, matching the brief's own pipeline diagram, re-running
the whole enabled sequence until a full sweep changes nothing (capped at
`maxSweeps`, default 4 — the same convergence-loop shape
`src/optimizer/optimizer.js`, the Bytecode Optimizer, already uses for
the same reason: one pass's output can expose new opportunities for an
earlier pass):

```
IR → Constant Folding → Constant Propagation → Algebraic Simplification
   → Dead Code Elimination → Unreachable Code Elimination
   → Redundant Temporary Elimination → Optimized IR
```

| Pass | What it does | Safety rule |
|---|---|---|
| **A. Constant Folding** | `t2 = ADD t0, t1` → `t2 = CONST 30` when both operands are already known (a literal, or a temp whose defining `CONST` is earlier in the same block) | Division/modulo by a literal zero is NEVER folded — the runtime error must still occur |
| **B. Constant Propagation** | Replaces every READ of a variable with its value, when that variable is written to a known constant EXACTLY ONCE across its whole (already-unique) lifetime | A multiply-assigned variable (a loop counter, a reassigned `hold`) is never propagated — its value genuinely varies |
| **C. Algebraic Simplification** | `x + 0`/`x - 0`/`x * 1`/`x / 1` → `x` (a `COPY`); `x * 0` → `0` | Only applied in the exact operand position where the identity is actually valid (`0 - x` is NOT simplified to `x` — that's `-x`, a different value) |
| **D. Dead Code Elimination** | Removes a pure, value-producing instruction whose result is never read, or a `STORE` to a variable never read anywhere | **Never** removes `CALL`/`PRINT`, or a `STORE` to a variable that IS read somewhere — a function may have side effects the IR can't prove absent |
| **E. Unreachable Code Elimination** | Removes whole basic BLOCKS unreachable from the function's entry (a graph reachability walk, not a text pattern) | Only ever removes a block with zero incoming control-flow edges — e.g. code textually following `return`/`break`/`continue` |
| **F. Redundant Temporary Elimination** | Copy propagation for `COPY` instructions (Algebraic Simplification's own output): `t1 = x; y = t1` → `y = x` | Only ever substitutes within the SAME basic block (temps never cross blocks — §33.16) |

**Configurable**, exactly as the brief requests:

```js
import { optimize } from './src/native/ir/optimizer/index.js';
const { program, statistics } = optimize(ir, {
  constantFolding: true,
  constantPropagation: true,
  algebraicSimplification: true,
  deadCodeElimination: false, // any key omitted defaults to enabled
});
```

**A real bug this design caught**: a first version of Dead Code
Elimination tracked "which temps are used" in ONE set for the whole
program — but a virtual register's id is only unique WITHIN the function
that defines it (each function's own temp counter restarts at 0), so a
`t0` used in `$main` incorrectly protected an unrelated, genuinely-dead
`t0` in a different function from removal. Caught by tracing an actual
optimizer run where a known-dead instruction wasn't being removed, not
by code review — fixed by scoping the "used temps" tracking per function
(`dead-code-elimination.js`'s own class doc tells the full story); a
regression test for exactly this shape (`say f(5)` calling a function
with its own locally-dead temp) is in `tests/native/ir-optimizer.test.js`.

### 33.20 IR → Target Code

`src/native/codegen/ir-to-x86-64.js` is the actual code generator now —
it consumes the OPTIMIZED IR, not the AST (the brief's own §7
requirement). For the currently-emittable subset, this means walking
`$main`'s one basic block, resolving each `PRINT` instruction's operands
back to their literal string values (the same "is this temp's value
known" resolution every optimizer pass already uses), and emitting the
identical `GetStdHandle`/`WriteFile`/`ExitProcess` sequence §33.5
documents. `native-codegen.js` still runs its own, unchanged AST-level
"is this within the native-compilable subset" gate FIRST (§33.3's "two-
stage validation, deliberately" note) — so every optimized IR
`ir-to-x86-64.js` ever receives is guaranteed to already be in the simple
shape it knows how to emit; growing the emittable subset (§33.14) means
growing THIS file to walk more of the IR shapes the generator/optimizer
already fully support today.

### 33.21 How to Debug IR

```
pari --native <file.pr> --emit-ir             # the IR exactly as generated, before optimization
pari --native <file.pr> --emit-optimized-ir   # the same IR after the pipeline runs
pari --native <file.pr> --optimizer-stats     # how many changes each pass made
pari --native <file.pr> --ir                  # the older, short "what did the compiler understand" summary (predates this IR pipeline)
pari --native <file.pr> --asm                 # the actual generated x86-64, one line per instruction
```

All four IR/optimizer flags compose with each other and with `-o`; none
of them change whether the `.exe` gets written (they're additive
inspection, printed before it, per the brief's own §14: "do not expose
unstable internal details as the default user experience").

### 33.22 How to Add a New Optimization Pass

1. Create `src/native/ir/optimizer/your-pass.js`, exporting a function
   `(program) => ({ yourPassKey: countOfChangesMade })` — study
   `algebraic-simplification.js` for the simplest complete example (one
   pattern-match function + a loop over every instruction).
2. Add it to `PASSES` (name, `run` function) and `DEFAULT_OPTIMIZER_CONFIG`
   (default `true`) in `optimizer/index.js`; add a label to `STAT_LABELS`
   for `formatOptimizerStatistics()`.
3. **State your safety rule in a comment before writing any logic** — every
   existing pass's class doc leads with exactly what it will never do and
   why (§33.19's table's own right-hand column). If your pass could ever
   remove or reorder something with an observable effect (I/O, a variable
   another block reads), it isn't safe as an unconditional pass — needs a
   real dataflow analysis, not a heuristic.
4. Add tests to `tests/native/ir-optimizer.test.js`: one showing your
   pass's own transformation in isolation (disable every other pass via
   the config option, matching this file's own `optimizeOnly()` helper),
   and one showing it correctly declining to act on an unsafe case.
5. Run the full suite (`node --test`) — zero regressions, per this
   phase's own non-negotiable rule.

## 34. Adaptive Execution Engine (Phase 14)

By Phase 13, Parithi had **three independent, complete backends** that all
coexisted but were only ever reached by an explicit flag — the Tree-Walking
Interpreter (default, §17), the Bytecode Generator + PVM (§29/§30,
`--run-bytecode`), and the Native x86-64 compiler (§33, `--native`). A bare
`pari <file.pr>` always meant "run it on the Interpreter," regardless of
whether a faster backend could have run the exact same program. Phase 14
adds one new component — a **Backend Selector** — that picks the best
available backend for a program automatically, and a `--backend` flag to
force one explicitly, **without changing what any of the three backends
themselves do**.

### 34.1 Architecture

```
Source (.pr)
     |
     v
Lexer -> Parser -> Semantic Analyzer   (unchanged — shared by all four commands below)
     |
     v
Backend Capability Resolver  (src/backend/capability.js + selector.js)
     |
     |  static AST inspection only — no execution, no full compilation
     v
  +-------------------+     +-------------------+     +----------------------+
  |  Native x86-64    | --> |  Bytecode + PVM   | --> | Tree-Walking         |
  |  (§33)            |     |  (§29/§30)        |     | Interpreter (§17)    |
  +-------------------+     +-------------------+     +----------------------+
     first supported wins (priority order, left to right)
                          |
                          v
                  Program Output (stdout/stderr/exit code)
```

Only the **winning** backend ever touches the program. The other two are
never invoked, not even partially — see §34.3 for why this matters.

### 34.2 Backend Priority

Automatic selection (`pari <file.pr>`, no `--backend` flag) always tries,
in this fixed order, and runs the program on the first backend that
supports it:

1. **Native x86-64** — fastest, but currently only supports the small
   subset §33.9 documents (a sequence of top-level `say` statements with
   String literal arguments).
2. **Bytecode + PVM** — the Bytecode Generator (§29) has a compiler for
   every AST node type the Parser can produce (`bytecode-generator.js`'s
   `compileStatement()`/`compileExpression()` switches cover the complete
   `NodeType` enum), so in practice this step supports every program that
   passes Semantic Analysis.
3. **Tree-Walking Interpreter** — the reference implementation, always
   supported, the final fallback.

**Honest limitation**: because step 2 above is unconditionally true today,
automatic selection can only ever pick Native or Bytecode in practice — the
Interpreter branch of the *priority list* is real and tested (§34.6), but
no real Parithi program can reach it through *automatic* selection right
now, since nothing is currently both native-unsupported AND
bytecode-unsupported. It remains reachable directly via `--backend
interpreter`, and the priority order is still the correct, forward-looking
design: the day Bytecode gains any deliberately-scoped limitation (the same
way Native has one today), the Interpreter fallback engages with no
further changes needed.

### 34.3 Why Capability Analysis, Not Trial Execution

An earlier, tempting design would "just try Native, catch a failure, fall
back to Bytecode." This is explicitly wrong for a language with
side-effecting statements (`say`, and eventually file/network I/O): if
Native ran three `say` statements and then hit an unsupported fourth
statement, the program would have already printed output twice — once
(partially) from the abandoned Native attempt, once (fully) from the
Bytecode retry. Phase 14 forbids this categorically. Instead:

- `src/backend/capability.js` exports one **pure, static, side-effect-free
  check per backend** — `checkNativeCapability`, `checkBytecodeCapability`,
  `checkInterpreterCapability` — each answering "can you run this program?"
  by inspecting the already-validated (post-Semantic-Analysis) AST alone.
  None of them execute a single statement of the program.
- `checkNativeCapability` reuses the **exact same AST-level gate**
  `native-codegen.js`'s `extractSayText()` already runs (§33.3's "two-stage
  validation" — same feature/reason wording, same `NativeCompileError`
  shape) but stops there: no IR generation, no x86-64 emission, no PE
  assembly. This is what keeps the check cheap (§34.8) — it is the same
  gate that already ran before Native ever did real code generation, not a
  new, separate walk.
- `src/backend/selector.js`'s `selectBackend()` runs every check, in
  priority order, and returns the first `supported: true` result — a pure
  decision, made once, before any backend is invoked.

### 34.4 CLI

```
pari <file.pr>                     Automatic selection (Native -> Bytecode -> Interpreter)
pari <file.pr> --backend native        Force Native x86-64 — no fallback
pari <file.pr> --backend bytecode      Force Bytecode + PVM — no fallback
pari <file.pr> --backend interpreter   Force the Tree-Walking Interpreter — no fallback
pari --explain-backend <file.pr>       Analysis only — never executes the program
pari <file.pr> --verbose               Automatic/forced selection also prints "Backend: <name>"
                                        before the program's own output
```

`--backend` never silently falls back: if the named backend's capability
check reports unsupported, `pari` prints a clean diagnostic (the real
`NativeCompileError`/P030 when forcing Native, for example) and exits with
`ExitCode.COMPILER_ERROR` — it does **not** try a different backend.

### 34.5 `--explain-backend` — Example

```
$ pari --explain-backend hello.pr

Backend Selection for hello.pr
------------------------------------------------------------------------

Native x86-64             SUPPORTED
  Selected backend.

Bytecode + PVM            SUPPORTED

Tree-Walking Interpreter  SUPPORTED

Selected: Native x86-64
  Because it is first in priority (Native x86-64 -> Bytecode + PVM ->
  Tree-Walking Interpreter) and supports this program.

$ pari --explain-backend ifelse.pr

Native x86-64             UNSUPPORTED
  Reason: Feature "IfStatement" is not supported — the native backend
  currently only compiles "hold"/"const" declarations, assignment, and
  "say" statements built from literals, variables, arithmetic, and
  comparisons.

Bytecode + PVM            SUPPORTED
  Selected backend.

Tree-Walking Interpreter  SUPPORTED

Selected: Bytecode + PVM
```

(A plain `variables.pr` using only compile-time-constant-foldable
declarations/arithmetic now selects Native — see §37.)

This mode never generates bytecode, never emits x86-64, and never runs the
Interpreter — it only calls the three capability checks and prints their
verdicts.

### 34.6 How Execution Actually Happens Per Backend

Once a backend is selected, `src/cli/commands.js`'s `runWithBackend()`
dispatches to one of three small execute-helpers, all operating on the
**same already-parsed-and-analyzed AST** (the frontend runs exactly once,
regardless of which backend wins):

- **Interpreter** — `executeInterpreterProgram()`: unchanged from before
  Phase 14, `new Interpreter(filePath).run(program)`.
- **Bytecode + PVM** — `executeBytecodeProgram()`: `generateBytecode()` +
  `validateBytecode()` (in memory, no `.pbc` file written) then the same
  `executeBytecode()` helper `--run-bytecode` already used.
- **Native x86-64** — `executeNative()`: this is the one genuinely new
  execution path. It runs the real pipeline (`compileProgramToNative()` +
  `buildPE64Executable()` — the same functions `--native` uses), writes the
  resulting `.exe` to a throwaway temp directory (`os.tmpdir()`, never the
  user's project folder), **spawns it as a real child process**
  (`spawnSync`, `stdio: 'inherit'` so its stdout/stderr become this
  process's own), forwards its exit code, and deletes the temp directory
  afterward. This is what makes "Native x86-64" a genuine fourth way to run
  a program end-to-end, not a label that quietly falls back to something
  else.

`stop <n>` (§15.7) exit-code semantics, and every backend's own exit-code
scheme (`ExitCode.COMPILER_ERROR`/`RUNTIME_ERROR`), are preserved exactly
per-backend — Phase 14 changes *which* backend runs a program, never what
running a program on a given backend *means*.

### 34.7 Testing

- `tests/backend/capability.test.js` (20 tests) — unit tests for all three
  capability checks against real parsed/analyzed programs, the `BACKENDS`
  priority list shape, `selectBackend()`/`evaluateBackend()` against real
  programs, and `selectFromEvaluations()` (the pure priority-order
  algorithm) against **synthetic** evaluation lists covering all three
  outcomes — including the interpreter-selected branch no real program can
  reach today (§34.2's honest limitation), tested at the algorithm level
  instead of being falsely claimed against a real program.
- `tests/backend/cli.test.js` (31 tests) — real subprocess tests: automatic
  selection (native-selected and bytecode-selected cases), backend parity
  (Native/Bytecode/Interpreter agree on the same program's stdout and exit
  code), forced `--backend` success and no-fallback-on-failure, the
  `--verbose` banner's position and content, `--explain-backend`'s report
  and its never-executes guarantee, and every existing example program
  still producing identical output under automatic selection as under
  `--backend interpreter`.
- The full existing suite (855 tests as of Phase 13) was re-run after every
  change in this phase with zero regressions — see `CHANGELOG.md` for the
  final count.

### 34.8 Performance

Capability analysis is a single, bounded walk over `program.body` (Native's
check) or a constant-time answer (Bytecode's and Interpreter's checks
today) — it never generates IR, never emits machine code, and never builds
a PE executable just to find out a backend can't run a program. Only the
backend that actually wins proceeds to real compilation/execution. No new
performance claims are made beyond what §33.8/§33.13 already documented for
the Native backend itself — Phase 14 only changes when that backend gets
used, not how fast it is.

### 34.9 What Was Deliberately Not Done

Per this phase's own scope: no new language keywords, modules, OOP,
exception handling, async/await, garbage-collector redesign, new type
system, or new syntax. The Interpreter, Bytecode Generator, PVM, Optimizer,
and Native compiler are exactly as capable as they were at the end of
Phase 13 — Phase 14 adds a selection layer in front of them, not new
capability inside any of them.

## 35. Production Readiness Audit (Phase 15)

An end-to-end audit of the complete Phase 0–14 implementation — every
keyword, every backend, the Standard Library, the Native compiler, the
CLI, and npm packaging — each verified by actually running it (real
`.pr` programs through the real CLI, real generated `.exe` files
actually executed, a real `npm pack` extracted and installed into a
clean directory with zero access to this repository), not by reading
source and assuming it works. `npm test` was 906/906 passing immediately
before this phase; **929/929 passing after** (906 + 23 new regression
tests for the fixes below), zero regressions in any pre-existing test.

### 35.1 Method

Six areas were each audited independently: Lexer/Parser, Semantic
Analyzer/Interpreter, Bytecode/PVM/Optimizer, Native compiler, Standard
Library, and CLI/packaging/documentation. Several apparent "bugs" found
during testing turned out, on verification against source and existing
tests, to be correct, documented, deliberate behavior — for example
`isEmpty("")` correctly returning `false` (§32.3: `isEmpty()` checks for
the `empty` type or a zero-length Array, never string length) and
`remove(array, index)` correctly returning the removed *element*, not the
mutated array (matching `pop()`'s own convention). These are recorded
here as confirmations, not defects — "the code exists and the tests pass"
was never treated as sufficient on its own; every claim below was
independently re-verified before being called a bug or cleared as
not one.

### 35.2 Bugs Found and Fixed

| # | Severity | Bug | Fix |
|---|---|---|---|
| 1 | High | Deeply nested source (1000+ parenthesized groups, or thousands of nested `if`/`box(...)`) crashed with a raw, unformatted JS `RangeError` — violating this project's own "every failure is a P0xx diagnostic, never a stack trace" invariant (§18) | New `P031` "Maximum nesting depth exceeded," raised by a depth guard at the two recursive choke points (`parseExpression()`/`parseBlock()`) every deeply-nested construct funnels through — see [§35.3](#353-parser-recursion-guard-p031) |
| 2 | Medium | `>`/`<`/`>=`/`<=` were only checked for mutual type-*compatibility*, not for being an actually orderable type — `box(1,2) > box(3,4)` and `true > false` both passed Semantic Analysis silently and fell through to a meaningless raw JS `<`/`>` at runtime (Array-to-string coercion; Boolean-to-number coercion) | New `isOrderable()` (`types.js`): only Number, Decimal, and String may be ordered; Array and Boolean now raise `P002` with a specific "ordering only applies to..." message. `==`/`!=` (deep equality) are completely unaffected |
| 3 | Medium | `option -1` in a `choose` block always failed `P013` — the lexer always emits `-` as its own `OPERATOR` token (by design, §9.1), so there was no way to write a negative `option` value at all | `parseOptionClause()` now recognizes `-` immediately followed by a `NUMBER`/`DECIMAL` token and folds it into a single negated `Literal` node (not a `UnaryExpression` — `option.test` is read directly as a Literal by `analyzer.js`/`bytecode-generator.js`, so this keeps that exact shape) |
| 4 | Low | A name colliding with a reserved/built-in name (`P004`) left nothing declared in scope, so every later reference to that same name independently raised its own `P001` — one mistake, a cascade of unrelated-looking diagnostics | `checkNameAvailable()` now declares an `Unknown`-typed placeholder symbol after reporting `P004`, matching how `P014` (genuine duplicate) already avoids cascading, since the first (valid) declaration is already in scope there |
| 5 | Low | A bare `\r` line ending (no following `\n` — classic pre-OS X Mac text files) fell through the same silent-skip path as plain whitespace, so it never produced a `NEWLINE` token — an entire file collapsed onto one logical line | The lexer's `\r` case now checks for a following `\n` (CRLF — absorbed exactly as before) and otherwise emits its own `NEWLINE`, matching every other line-ending convention |
| 6 | Low (documentation) | `pari --version`'s "Backends" line still only listed the Interpreter and Bytecode Generator, never mentioning the Native x86-64 backend (Phase 13) or the Adaptive Execution Engine (Phase 14) — under-reporting the CLI's own live architecture | Added `nativeSupport()`/`adaptiveEngineSupport()` (same live-detection pattern as the existing `bytecodeSupport()`/`pvmSupport()`), a new "Execution" line, and "Native x86-64" appended to "Backends" |
| — | Low (cleanup) | `src/interpreter/builtins/array.js` still defined its own `contains()`, dead code shadowed since Phase 13a by the polymorphic (Array-or-String) version in `stdlib/array/index.js`, which is the one actually registered | Removed the dead function and its now-unused `deepEquals` import |

Panic-mode error recovery interacted badly with the new nesting-depth
guard: the first version simply reported `P031` and resumed parsing like
any other syntax error, which re-hit the identical depth wall a few
tokens later, over and over — one 5,000-deep test file produced **9,672**
near-duplicate diagnostics before this was caught and fixed. A
nesting-depth error now bypasses panic-mode recovery entirely and fails
fast with the single, real diagnostic — found by actually running the
fix against the exact input that motivated it, not assumed correct
because the guard "should" work.

### 35.3 Parser Recursion Guard (P031)

```
pari deeply-nested.pr

Error P031:
Maximum expression nesting depth (200) exceeded.
  → deeply-nested.pr:1:205
Hint: this program is nested far more deeply than any realistic Parithi
program needs to be — break it into smaller expressions, blocks, or
functions.
```

`MAX_NESTING_DEPTH` is `200` — comfortably below the observed real crash
threshold (500–1,000 on the reference machine, and stack-size-dependent
across machines) so the guard always fires first, and far above anything
a realistically-written Parithi program would ever need. Capping depth at
the parser is a single point of defense: since no AST deeper than the
limit can ever be produced, the Semantic Analyzer, Interpreter, Bytecode
Generator, and Native codegen are all protected transitively — none of
them need their own separate guard.

### 35.4 What Was Confirmed Correct (Not Bugs)

- `isEmpty("")` → `false` (§32.3 — `isEmpty()` is intentionally about the
  `empty` type or empty Arrays, never string length; matches
  `tests/array.test.js`'s own pre-existing assertion).
- `remove(array, index)` returns the removed *element*, matching
  `pop()`'s documented convention — not the mutated array.
- `contains()` is intentionally polymorphic (Array or String) since
  Phase 13a — confirmed against `stdlib/array/index.js`.
- No string escape sequences (`\n`, `\t`, `\"`, `\\`) — an explicit,
  documented lexer design decision (`lexer.js`'s own class doc), not an
  oversight.
- 99 Standard Library test programs across all 51 built-ins: zero
  Interpreter-vs-Bytecode parity mismatches, zero raw crashes.
- 15 language-feature programs, each run on the Interpreter, forced
  Bytecode, and *optimized* Bytecode execution: zero parity mismatches
  across all three.
- 13 real `.exe` files compiled and actually executed (not just
  inspected) for the native-supported subset: byte-for-byte identical to
  Interpreter output in every case, including a raw-buffer comparison for
  Unicode/emoji content.
- A real `npm pack` → extracted into a clean temp directory (zero access
  to this repository) → `npm install` (instant, zero dependencies) →
  `pari --version`, a self-authored `.pr` program, `--explain-backend`,
  and `--native` (compiled **and executed** a real `.exe`) — all worked
  correctly, confirming `package.json`'s `"files"` list genuinely ships
  everything the CLI needs, including the `native/` and `backend/`
  directories added in Phases 13–14.

### 35.5 What Was Deliberately Not Done

No new language keywords, syntax, or backend capability — every fix
above is a correctness/robustness fix to existing, documented behavior,
never a feature addition. `CR`-only line endings and the ordering
restriction were the only two behavior changes visible to a Parithi
*program* (as opposed to the CLI's own diagnostics); both make
previously-undefined or silently-wrong behavior into either working
correctly (CR) or a clear compile-time error instead of a meaningless
runtime result (ordering) — neither changes any previously-*working*
program's behavior.

## 36. Unified Loop Model (Phase 16)

Parithi's pre-existing loop keywords — `while`/`repeat`, both statements
only, with a bare `break`/`continue` — are unchanged and remain the
recommended, idiomatic way to write a conditional or counted loop. Phase
16 adds one new, unconditional construct, `loop`, and extends `break` to
optionally carry a value everywhere `break` already works, so that all
three loop forms share one underlying semantic: *a loop may produce a
value — whatever its `break <expression>` supplies, or `Empty` if none
does.*

### 36.1 `loop ... end loop`

```
hold i = 1

loop
    say i

    if i == 5
        break
    end if

    i = i + 1
end loop
```
```
1
2
3
4
5
```

Unlike `while`/`repeat`, `loop` carries no condition or count of its own
— it runs forever until a `break` (or `return`/`stop`) inside it fires.
`continue` works exactly as it already does for `while`/`repeat`: it
skips to the next iteration of the *nearest* enclosing loop.

### 36.2 `break <expression>` — a loop as an expression

```
hold items = box(3, 7, 10, 15)
hold i = 0

hold result = loop
    hold item = items[i]

    if item == 10
        break item
    end if

    i = i + 1
end loop

say result
```
```
10
```

`break <expression>`'s value is evaluated exactly once, at the moment
`break` runs. A bare `break` (no value) is equivalent to `break empty` —
no new value type was introduced; Parithi already has `Empty`
(§12.2), and it is what a loop evaluates to whenever nothing supplied a
real value, exactly as an un-assigned `hold x = empty` already means "no
value yet." A `break <expression>` **outside any loop** is a semantic
error (`P018`) — the value does not exempt it.

`while` and `repeat` participate in this exact same model: both may also
be used in expression position, and both evaluate to `Empty` on a
*natural* exit (condition false / count exhausted) unless a
`break <expression>` inside them overrides it —

```
hold x = 0
hold r = while x < 10
    x = x + 1
    if x == 5
        break x
    end if
end while
say r
```
```
5
```

Used as a bare statement (the overwhelmingly common case, and the only
form that existed before this phase), `while`/`repeat`/`loop` behave
*exactly* as they always have — nothing about their existing statement
usage changed.

### 36.3 Nesting

Each loop tracks its own break value independently. An inner loop's
`break <expression>` can never become an outer loop's result:

```
hold result = loop
    loop
        break 10
    end loop

    break 20
end loop

say result
```
```
20
```

This falls out of the exact same "innermost loop" tracking `break`/
`continue` already used before this phase (`loopStack` in the bytecode
generator, `this.context.loopDepth` plus a per-loop catch in the
Interpreter, a per-loop `breakValueStack` frame in the Semantic
Analyzer) — nesting correctness required no new mechanism, only
extending the existing one to also carry a value.

### 36.4 Distinguishing `break`, `continue`, and `return`

Three genuinely different control-flow operations, unaffected by each
other:

```
task find()
    loop
        if true
            break 42     # exits only the loop — "find" itself keeps running
        end if
    end loop

    return 1             # this is what find() actually returns
end task

say find()
```
```
1
```

`return` (even from deep inside a loop) exits the enclosing *function*;
`break` exits only its own nearest loop. Recursion composes with loops
normally — a recursive function's own loop is scoped to that call's own
loop-tracking state, exactly like an already-existing `while`/`repeat`
inside a recursive function.

### 36.5 Static Typing of a Loop's Result

A `hold`/`const` initialized from a loop locks its type from that loop's
`break <expression>` value(s), the same "locked from first assignment"
model every other variable already uses. Every `break <expression>`
*within the same loop* must agree on a compatible type — mixing
`break 5` and `break "text"` in the same loop is a `P002` type error,
exactly like reassigning a locked variable to an incompatible type; a
bare `break` (Empty) never conflicts with a concrete type, since `Empty`
is always compatible with anything (§13.1).

### 36.6 Backend Support

| Backend | Support |
|---|---|
| Tree-Walking Interpreter | Full — the reference implementation; `BreakSignal` (already existed for bare `break`) now carries an optional value, mirroring `ReturnSignal`'s pre-existing shape exactly. |
| Bytecode + PVM | Full — no new opcodes. Every loop exit path (natural or `break`) converges on exactly one pushed value at a shared label, reusing the same `PUSH`/`JMP`/`JMP_IF_FALSE` convergent-jump shape `and`/`or` short-circuiting already established. |
| Native x86-64 | Not supported, unchanged — the native backend's existing capability gate already rejects any loop construct (old or new) before it ever reaches code generation (§33.9); the Native IR generator explicitly rejects the *new* capability (`loop`, `break <expression>`, `while`/`repeat` in expression position) with a clean "not yet lowered to IR" error, leaving its pre-existing, tested bare-`break`/`while`/`repeat` IR modeling completely untouched. |

### 36.7 What Changed vs. What Stayed the Same

**New**: the `loop` keyword; `break <expression>`; `while`/`repeat`/`loop`
usable in expression position. No new error code was introduced — every
invalid-usage case reuses an existing one (`P018`/`P019`/`P002`).

**Unchanged**: every pre-existing `while`/`repeat`/`break`/`continue`
program behaves identically to before — this phase is purely additive.
No keyword was removed, no existing syntax was repurposed, and no
backend's *capability* boundary moved as a result of *this* phase (native
still rejected every loop construct exactly as before; the Interpreter
and Bytecode/PVM still support the whole language). Native's boundary did
move later, independently, in Phase 17 (§37) — loops remained unsupported
there too, only variables/arithmetic/comparisons were newly compiled.

---

## 37. Native Backend Recovery & Feature Expansion (Phase 17)

### 37.1 Starting Premise, and What Was Actually Found

This phase began from an explicit brief asserting "the native x86-64
backend is currently not working correctly," with instructions to
reproduce the failure with evidence before touching any code. A fresh
baseline was established first: `npm test` — **978/978 passing**
(immediately before this phase, matching Phase 16's own closing count) —
and the three dedicated native test files run explicitly by name
(`native-compiler.test.js`, `ir.test.js`, `ir-optimizer.test.js`) —
**90/90 passing**. A hands-on reproduction script then compiled and
*executed* real `.exe` files for every construct §33.9 already claimed
supported, and confirmed every unsupported construct was rejected with a
clean `P030` diagnostic — no crash, no corrupted PE file, no silent
fallback.

**Honest conclusion: no reproducible defect existed in what the native
backend already claimed to support.** The premise did not match reality.
Rather than force a fix onto a working system, this phase pivoted to the
brief's own explicitly-requested fallback path: **native feature
expansion**, in the same priority order the brief specified
(literals → variables → arithmetic → comparisons → …), stopping exactly
where the existing architecture's real limits are (§37.3).

### 37.2 What Made the Expansion Possible Without New Architecture

Reading `ir-to-x86-64.js` (the actual x86-64 emitter) showed it already
performed a form of compile-time constant resolution for `say`
arguments, via a `knownConstants`-style map — and the IR Optimizer
(§33.19, built in an earlier phase) already had working Constant Folding
and Constant Propagation passes. Nothing new was added to the optimizer.
The expansion generalized the emitter's existing resolver
(`ir-to-x86-64.js`'s `resolveConstantOperand`/`extractPrintedLines`) to
additionally track `STORE`d variables (not just `say`-bound temps), and
to stringify Number/Decimal/Boolean/Empty values (not just String) —
matching `stringify.js`'s own formatting exactly. `native-codegen.js`'s
Stage-1 AST gate (`checkNativeStatement`/`checkNativeExpression`) was
widened correspondingly to accept `hold`/`const` declarations,
assignment, and arithmetic/comparison/unary expressions — see §33.9 for
the resulting matrix.

`and`/`or` were deliberately left unsupported: `ir-generator.js` lowers
them to a real short-circuit **branch** (two basic blocks via
`compileShortCircuit`), which `ir-to-x86-64.js` cannot handle — it emits
exactly one straight-line basic block. Every operator that IS now allowed
(`+ - * / % **`, `== != > < >= <=`, unary `-`/`not`) lowers to exactly
one non-branching IR instruction, which is what keeps this expansion
inside the emitter's existing structural assumption rather than requiring
a new one.

### 37.3 Two Genuine Edge Cases Found and Fixed During the Expansion

Real end-to-end testing (compiling and *executing* generated `.exe`
files, not just inspecting compiled bytes) surfaced two cases where the
naive "everything built from literals/variables/arithmetic/comparisons is
always foldable" assumption was wrong — both are real, both were fixed
before being called done, per this phase's own "never claim success
unless the generated executable actually executed successfully" rule.

**1. Division/modulo by a divisor that folds to zero.** `hold x = 10 / 0`
passed the naive Stage-1 gate (it's just a `BinaryExpression` on two
literals) and was selected by automatic backend selection as
Native-eligible. The IR Optimizer's Constant Folding pass does not fold a
division/modulo whose divisor is zero (correctly — that's a *runtime*
error, P020, not a compile-time constant), so the value never resolved,
and `ir-to-x86-64.js` threw a bare, uncaught internal `Error` — a real
crash, violating the hard "never a crash" rule. **Fix:** `native-codegen.js`'s
Stage-1 gate now statically rejects any `/`/`%` whose right operand is a
literal `0`, with a specific `P030` naming the exact reason
(`"/" by a literal zero`) — this is the common case, and it restores
automatic selection's correctness: the program now falls through to
Bytecode + PVM automatically and reports the normal `P020` diagnostic, as
it did before this phase. As defense-in-depth for the deeper case Stage 1
cannot cheaply detect (a divisor that only resolves to zero after tracing
through a variable, e.g. `hold z = 0` then `10 / z`), the two internal
`throw new Error(...)` calls in `ir-to-x86-64.js` were changed to throw a
proper `NativeCompileError` (`P030`) instead — so this residual gap fails
cleanly (a Compiler Error, no bytecode fallback for this one narrow case)
rather than crashing. This residual gap is a known, documented limitation
(§37.6), not silently swept under the rug.

**2. Self-referencing reassignment** (`x = x + 1`). The IR Optimizer
propagates a variable's value forward from its declaration to later
*reads*, but does not fold an expression that reassigns a variable in
terms of that SAME variable's own prior value — this is a deliberate,
sound conservative choice in a general-purpose optimizer (reassignment
inside branches/loops cannot always be reasoned about statically), but it
meant the naive Stage-1 gate would accept `x = x + 1` as "foldable" when
it structurally never is. Without a fix, this would have hit the same
"unresolved constant" path as case 1 — cleanly rejected thanks to the fix
above, but *only after* automatic selection had already (incorrectly)
picked Native. **Fix:** `native-codegen.js` now walks an `Assignment`
node's value expression and rejects it upfront (`P030`, naming the
variable) if that variable is read anywhere within its own new value —
this keeps Stage 1's capability check accurate, so automatic selection
correctly picks Bytecode + PVM for these programs directly, with no
detour through a Native rejection first.

Both are covered by permanent regression tests (§37.4), not just the
throwaway scripts that originally found them.

### 37.4 Testing

**Regression baseline:** 978/978 passing immediately before this phase;
**989/989 passing after**, zero regressions — every existing
Lexer/Parser/AST/Semantic Analyzer/Interpreter/Bytecode/PVM/Optimizer/
Standard-Library test still passes unchanged. The net +11 reflects: 13
new "supported, really executed" tests added to
`tests/native/native-compiler.test.js` for the newly-compilable
constructs (variables, arithmetic, comparisons, reassignment, unary
operators, string concatenation, a const-only program), 3 new regression
tests for the two edge cases in §37.3 (literal-zero divisor,
variable-derived-zero divisor, self-referencing reassignment), a new
`checkNativeCapability`-level test for the self-reference case in
`tests/backend/capability.test.js`, minus 8 tests moved out of the
"unsupported" list (they now assert real compilation instead) and a
handful of existing tests whose *example program* had to change because
it was no longer a valid "this doesn't compile natively" example (e.g.
`hold x = 1\nsay x` is now native-eligible, so tests asserting the
Bytecode/interpreter-fallback path were updated to use a genuinely
still-unsupported example, such as an `if`/`task` program, instead —
never by weakening what the test actually checks).

Every "supported" test in `tests/native/native-compiler.test.js` follows
the file's own pre-existing discipline: writes a real `.exe`, executes it
via `spawnSync`, and asserts real stdout/exit code — AND that native's
output byte-for-byte matches the Tree-Walking Interpreter's. Every
"unsupported" test still asserts a clean `P030`, never a crash. An
additional throwaway stress sweep (not part of the permanent suite, since
it duplicates the permanent tests' intent) cross-checked 15 further
stringification/arithmetic edge cases (negative zero, floating-point
precision, fractional exponents, large multiplication, exact vs. inexact
division, boundary comparisons, empty-string concatenation, double
negation, `empty` literal handling) — all matched the Interpreter
exactly, and correctly-scoped self-reference cases (e.g. `z = z * 2`,
`b = b + a`) were confirmed to be genuine self-references, correctly
rejected by design, not false positives.

### 37.5 Native Feature Matrix

| IR Feature | IR Exists (ir-generator.js) | x86-64 Codegen (ir-to-x86-64.js) | Executable Tested |
|---|---|---|---|
| `CONST` (literal) | ✅ Yes | ✅ Yes (resolved to a known value) | ✅ Yes |
| `STORE` (`hold`/`const`/assignment) | ✅ Yes | ✅ Yes (tracked in `knownVars`, whenever the stored value resolves) | ✅ Yes |
| `ADD`/`SUB`/`MUL`/`DIV`/`MOD`/`POW` | ✅ Yes | ⚠️ Indirect only — never emitted as a machine instruction; the IR Optimizer must fold it to a `CONST` first, or Stage 1 rejects the program | ✅ Yes (for the foldable subset) |
| `EQ`/`NE`/`GT`/`LT`/`GE`/`LE` | ✅ Yes | ⚠️ Indirect only — same as arithmetic, folded before this emitter ever sees it | ✅ Yes (for the foldable subset) |
| `NEG`/`NOT` (unary) | ✅ Yes | ⚠️ Indirect only — folded before emission | ✅ Yes |
| `COPY` (constant propagation) | ✅ Yes | ✅ Yes (resolved via `resolveConstantOperand`) | ✅ Yes |
| `PRINT` (`say`) | ✅ Yes | ✅ Yes — the only op that emits a real `WriteFile` call | ✅ Yes |
| `LOAD` | Defined in the IR op enum; not currently emitted by `ir-generator.js` (variable reads are inlined as `{kind:'var'}` operands directly) | N/A | N/A |
| `CALL` (function calls) | ✅ Yes (`compileTaskDeclaration`/function calls generate real IR) | ❌ No — the emitter has no calling-convention/stack-frame support for user functions | ❌ No — rejected at Stage 1 before IR generation runs |
| `JUMP`/`BRANCH` (`if`/`while`/`repeat`, short-circuit `and`/`or`) | ✅ Yes (`compileIfStatement`/`compileWhileStatement` generate real multi-block IR with real branches) | ❌ No — the emitter assumes exactly one straight-line basic block | ❌ No — rejected at Stage 1 before IR generation runs |
| `RETURN` | ✅ Yes | ❌ No | ❌ No — rejected at Stage 1 before IR generation runs |
| Arrays (`box`) | ❌ No — explicitly in `ir-generator.js`'s own `UNSUPPORTED` set | ❌ No | ❌ No |
| `loop`/`break <expr>` (Phase 16) | ❌ No — explicitly in `ir-generator.js`'s own `UNSUPPORTED` set (§36.6) | ❌ No | ❌ No |

The pattern is consistent: the IR generator (built across Phases 13/16)
is already considerably more capable than the x86-64 emitter — real
multi-block IR exists today for branches, loops, and function calls.
The gap has always been specifically in `ir-to-x86-64.js`'s single-block
assumption, not in IR design (§33.14 already recommended closing it in
this order; this phase closed the first, purely-compile-time-foldable
slice of it without requiring a register allocator or real stack-based
runtime storage).

### 37.6 What Was Deliberately Not Done

- **No register allocator, no runtime variable storage.** Every native
  program's output is still fully determined at compile time by the IR
  Optimizer; a variable "read" at runtime never actually happens — the
  emitter only ever prints/stores an already-known constant. This is an
  honestly-scoped foundation, not a general-purpose native runtime.
- **`and`/`or`, `if`/`while`/`repeat`/`loop`, functions/recursion, Arrays,
  every Standard Library built-in** — all still correctly rejected with a
  clean `P030`; none of this was silently forced through, per the
  phase's own explicit "only implement what's real, don't invent syntax"
  rule.
- **The residual division-by-a-variable-that-folds-to-zero gap** (§37.3)
  was not closed with a full constant-propagation-aware Stage-1 checker
  (which would duplicate the IR Optimizer's own analysis) — the
  Stage-2 safety net (a clean `P030`, never a crash) was judged the
  right-sized fix for how rare and narrow this case is, honestly
  documented rather than silently left to crash.
- **No performance claim beyond Phase 13's original honest one.** No
  CPU-bound benchmark was added — compile-time-constant-folded programs
  have no runtime loop/recursion to measure that would mean anything new;
  §33.12's existing Hello World measurement and its own caveat still
  stand unchanged.

### 37.7 Final Verdict

**NATIVE BACKEND VERIFIED** — re-verified end to end (real `.exe`
compilation, real execution, PE structure, import tables, byte-level
codegen) with no reproducible defect in its existing, claimed scope, and
genuinely, honestly expanded within the existing architecture's real
limits, with 100% real-execution regression coverage for every new and
every still-rejected construct.

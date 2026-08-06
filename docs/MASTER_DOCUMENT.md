# Parithi Programming Language
## Master Document — Version 1.0

**Document Type:** Language & Implementation Specification
**Project Name:** Parithi
**Tagline:** A Human-Friendly Programming Language Designed for Readability and Simplicity
**Target Runtime:** Node.js (JavaScript)
**Status:** v1.0 — stable release, now including Arrays. Implementation complete and fully verified against this specification (see `docs/PHASE8_AUDIT_REPORT.md`), followed by a Phase 8.5 release-readiness pass (packaging/documentation only — see `CHANGELOG.md`) and a Phase 9 language addition (`box` arrays, [§28](#28-arrays-phase-9) — the first language-surface change since the Phase 8 audit).
**Document Owner:** Language Architecture Team
**Last Updated:** 2026-08-06

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
22. [Development Phases (Phase 0–9)](#22-development-phases-phase-09)
23. [Future Roadmap](#23-future-roadmap)
24. [Testing Strategy](#24-testing-strategy)
25. [Project Directory Structure Reference](#25-project-directory-structure-reference)
26. [Future Enhancements](#26-future-enhancements)
27. [Conclusion](#27-conclusion)
28. [Arrays (Phase 9)](#28-arrays-phase-9)

---

## 1. Project Overview

Parithi is a beginner-friendly, general-purpose programming language whose design goal is **readability first**. Where most languages optimize for terseness or power, Parithi optimizes for the experience of a first-time learner reading code out loud and understanding it without training. It borrows the "say what you mean" spirit of languages like Python and AppleScript, but keeps a small, fixed grammar so that tooling (parser, error messages, IDE support) can stay simple and predictable.

Parithi v1.0 is a **tree-walking interpreter** implemented in JavaScript/Node.js. The pipeline is:

```
Source (.pr) → Lexer → Parser → AST → Semantic Analyzer → Interpreter → Runtime → Output
```

There is no bytecode or virtual machine in v1.0 — programs are parsed into an AST and executed directly by walking that tree. This keeps the v1.0 implementation small, debuggable, and fast to build, while the architecture is deliberately modular so a bytecode compiler and VM (Parithi Bytecode `.pbc` + Parithi Virtual Machine, "PVM") can be added later **without changing the language surface**.

Parithi ships as a Node.js CLI (`pari`) that runs `.pr` source files directly, with debug flags to inspect the token stream and AST.

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
   ▼
Tree-Walking Interpreter → executes the validated AST directly, node by node
   │
   ▼
Runtime              → holds live state (variables, call stack) while executing
   │
   ▼
Output                → say/ask interact with stdout/stdin
```

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

Executes the annotated AST directly via a `evaluate(node, environment)` dispatch over node type. No intermediate bytecode exists in v1.0 — this is the defining trait of a tree-walking interpreter, and the reason a future PVM will be a separate, additive backend rather than a modification of this one.

### 9.6 Runtime Environment

See [§17](#17-runtime-architecture) for full detail on scope chaining, the call stack, and the built-in registry.

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
│   └── cli/                     # Phase 7 — professional CLI
│       ├── args.js              # argv → { mode, file, verbose } — throws CliUsageError on bad input
│       ├── commands.js          # dispatch: run / --tokens / --ast / --analyze / --runtime / --version / --help
│       ├── cli-error.js         # CliUsageError — bad flag/file, distinct from CompilerError/ParithiRuntimeError
│       ├── exit-codes.js        # ExitCode — the 0/1/2/3 table (§19.1)
│       ├── version-info.js      # language/compiler/Node/build-date/platform, read from package.json
│       ├── suggestions.js       # Levenshtein "did you mean" for flags and filenames (§19.2)
│       └── screens.js           # buildHelpText()/buildVersionText() — pure, testable display strings
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
│   ├── cli.test.js              # Phase 7: spawns the real `pari` binary — exit codes, file handling, suggestions
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

The original plan's core list (20 words), plus the `is` operator keyword identified in [§2](#2-design-corrections-applied-to-the-original-plan), plus `choose` / `option` / `other` added for the switch statement ([§15.2](#152-choose-switch-statement)), plus `stop` added in Phase 8 ([§15.7](#157-stop-statement)), plus `box` added in Phase 9 ([§28](#28-arrays-phase-9)) — 26 total:

```
hold      const
if        else      choose    option    other     end
repeat    while     break     continue
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

All errors are surfaced with a stable code, a one-line description, and the source line where possible. Errors are grouped by the phase that raises them: **Lexing** (P008–P010), **Parsing** (P003, P011–P013), **Semantic Analysis** (P001, P002, P004, P005, P007, P014–P019, P025, P026), and **Interpretation** (P006, P020–P024, P026, P027). The Interpreter also defensively re-raises P001, P002, P005, P017, P018, P019, P025, P026 at runtime — see [§17.7](#177-defensive-runtime-checks). P025/P026 are listed under both phases deliberately: each is caught statically whenever the relevant type is knowable from source text alone, and defensively at runtime whenever it isn't (most commonly, an Unknown-typed function parameter) — see [§28.6](#286-array-error-codes) for the full breakdown.

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

## 22. Development Phases (Phase 0–9)

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

**Phase 9 — Arrays** is the first genuine language-surface addition since the Phase 8 audit: the `box` keyword, `[...]` indexing/assignment, and seven new built-ins (`push`/`pop`/`insert`/`remove`/`sort`/`reverse`/`contains`), fully specified in [§28](#28-arrays-phase-9). This resolves the one open item `docs/ARRAYS_DESIGN.md` had been left waiting on since Phase 8 (§9's "what keyword should represent arrays?") and implements it end-to-end — Lexer through CLI/docs/tests — exactly as that design document's §8 "changes by layer" table anticipated, with three deliberate departures from its own recommendations (all made by explicit instruction, not inferred): 0-based indexing rather than 1-based, reference semantics rather than value semantics, and bracket indexing layered on top of keyword-call construction rather than picking only one literal style. Bytecode/PVM work remains untouched, per this phase's explicit scope boundary.

---

## 23. Future Roadmap

Ordered by planned sequence, each stage additive and non-breaking to existing `.pr` source:

1. **Bytecode Generator** — compile the validated AST into Parithi Bytecode (`.pbc`), a flat, stack-oriented instruction set. The semantic analyzer output (annotated AST) becomes the compiler's input, so no front-end work is repeated.
2. **Parithi Virtual Machine (PVM)** — a stack-based VM executing `.pbc` directly, replacing the tree-walking interpreter as the default execution backend for performance. The tree-walking interpreter remains available behind a `--interpret` flag for debugging/teaching parity.
3. **Optimizer Pass** — constant folding, dead-code elimination, and peephole optimization operating on the bytecode between the generator and the VM.
4. **Collections — Maps** — Lists shipped in Phase 9 as Arrays (`box`, [§28](#28-arrays-phase-9)); a key-value Map type remains future work, along with dedicated list-iteration support (`repeat item as x in list`) — arrays are iterated today via `repeat n as i` + indexing, per [§28.4](#284-iteration).
5. **Object-Oriented Programming** — a minimal `type`-block construct (name TBD, to avoid clashing with the existing `type()` built-in) for user-defined structured records with methods.
6. **Module System** — `import`/multi-file program support, once single-file programs stop being sufficient for the target audience's projects.
7. **Native Compilation** — an ahead-of-time backend (e.g., via LLVM or a transpile-to-C step) for producing standalone native binaries from `.pbc`, once the VM and language surface are stable.

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
│   └── cli/{args.js, commands.js, cli-error.js, exit-codes.js, version-info.js, suggestions.js, screens.js}
├── examples/*.pr
├── tests/foundation.test.js + {lexer,parser,semantic,interpreter}.test.js (added per phase) + e2e.test.js + error-messages.test.js (Phase 5) + runtime.test.js (Phase 6) + cli.test.js + fixtures/ (Phase 7)
├── docs/{MASTER_DOCUMENT.md, ARRAYS_DESIGN.md, PHASE8_AUDIT_REPORT.md, RELEASE_NOTES.md, RELEASE_VERIFICATION_REPORT.md}
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
- **Bytecode + VM + Optimizer + Native compilation** — see the full roadmap in [§23](#23-future-roadmap).

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

# Parithi

A human-friendly programming language designed for readability and
simplicity — read code out loud and understand it, no training required.

```
say "Hello, Parithi!"
```

Full language specification: [docs/MASTER_DOCUMENT.md](docs/MASTER_DOCUMENT.md)
· Release notes: [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md) ·
[CHANGELOG.md](CHANGELOG.md)

## Status

**v1.0 — stable release, now including Arrays.** A complete, fully-tested
implementation of the language specified in
[docs/MASTER_DOCUMENT.md](docs/MASTER_DOCUMENT.md): Lexer → Parser →
Semantic Analyzer → Tree-Walking Interpreter → Runtime, behind a
professional CLI (`pari`). Every keyword, language rule, built-in, and
documented error code has been individually verified against the
specification — see [docs/PHASE8_AUDIT_REPORT.md](docs/PHASE8_AUDIT_REPORT.md)
and [docs/RELEASE_VERIFICATION_REPORT.md](docs/RELEASE_VERIFICATION_REPORT.md).
**Phase 9** then added Arrays (`box`) — the first language-surface change
since that audit — end-to-end across every layer; see
[MASTER_DOCUMENT.md §28](docs/MASTER_DOCUMENT.md#28-arrays-phase-9) and
[CHANGELOG.md](CHANGELOG.md). 454 automated tests pass; no known
implementation bugs.

Deliberately **not** in v1.0, by explicit design decision rather than
oversight (see [Known Limitations](#known-limitations) below): Maps/
dictionaries, object-oriented programming, modules, exception handling, and
a bytecode VM.

## Installation

Requires **Node.js ≥ 18**. Parithi has zero runtime dependencies.

| Method | Command | Notes |
|---|---|---|
| Global (recommended) | `npm install && npm link` | Puts `pari` on your `PATH`. |
| Local, no install | `node bin/pari.js <file.pr>` | Works straight from a clone, no `npm link` needed. |

Verify the install:

```bash
pari --version
```

## Quick Start

```bash
npm install
npm link                    # installs the `pari` command globally
pari examples/hello.pr      # → Hello, Parithi!
```

Prefer not to install globally? Run the CLI directly from the repo:

```bash
node bin/pari.js examples/hello.pr
```

A minimal program, so you can see the syntax before reading further:

```
hold name = "Parithi"
hold age = 5

if age is at least 1
    say "Hello,", name
end if
```

## Feature List

- **Data types:** Number, Decimal, String, Boolean, Empty, Array — static
  type inference locked from first assignment; Number and Decimal are
  treated as mutually compatible.
- **Arrays (`box`):** `box(1, 2, 3)` / `box()`, 0-based `arr[i]` indexing
  and assignment, nested arrays, reference semantics (assigning/passing an
  array never copies it), deep (structural) equality for `==`/`!=`, and a
  "every element shares one type, except `empty`" homogeneity rule — see
  [MASTER_DOCUMENT.md §28](docs/MASTER_DOCUMENT.md#28-arrays-phase-9).
- **Variables & constants:** `hold` (mutable), `const` (immutable —
  reassignment rejected at compile time).
- **Block scope**, with proper shadowing, across `if`/`task`/`repeat`/
  `while`/`choose` bodies.
- **Operators:** full arithmetic (`+ - * / % **`); symbolic and
  readable-word comparisons (`==`/`is`, `>=`/`is at least`, etc.); word-only
  logical operators (`and`/`or`/`not`); fully specified precedence and
  associativity.
- **Control flow:** `if`/`else` (nested for else-if), `choose`/`option`/
  `other` (no fall-through, duplicate-value detection at compile time),
  `repeat` (fixed-count, optional 1-based counter), `while`, `break`/
  `continue`, and `stop [code]` (terminates the whole program immediately,
  from anywhere, with an optional numeric exit code — §15.7).
- **Functions:** `task` with parameters, `return`, recursion (mutual and
  self-), lexical closures, a 500-frame call-depth guard.
- **Built-ins:** `round`, `random` (math); `number`, `text`, `type`
  (conversion/inspection); `len` (text or array); `push`, `pop`, `insert`,
  `remove`, `sort`, `reverse`, `contains` (arrays) — argument-validated at
  both compile time and defensively at runtime.
- **I/O:** `say` (multi-value, space-joined output), `ask` (prompts and
  always returns a String).
- **Error reporting:** 27 stable error codes (`P001`–`P027`) across
  Lexing/Parsing/Semantic Analysis/Interpretation — each carries a code, a
  plain-English message, a source location, and a corrective hint. A raw
  JavaScript stack trace reaching the terminal is treated as a bug.
- **CLI (`pari`):** program execution plus four pipeline-introspection
  flags (`--tokens`, `--ast`, `--analyze`, `--runtime`), `--version`,
  `--help`, `--verbose`, four distinct exit codes, and "did you mean...?"
  suggestions for mistyped flags and filenames.

## CLI Reference

```
pari <file.pr>              Execute a Parithi program
pari --tokens <file.pr>     Print the lexer's token stream, then exit
pari --ast <file.pr>        Print the parsed AST as a tree, then exit
pari --analyze <file.pr>    Run semantic analysis (symbol tables + diagnostics), then exit
pari --runtime <file.pr>    Execute, then print runtime diagnostics (environment/call stack)
pari --version              Print version information (language, compiler, Node, platform)
pari --help / -h            Print usage and the flag reference
pari <file.pr> --verbose    Execute, then print total execution time
```

`<file.pr>` accepts relative paths, absolute paths, and paths containing
spaces (quote them: `pari "./my programs/hello world.pr"`).

### Exit Codes

| Code | Meaning | When it happens |
|---|---|---|
| `0` | Success | The requested command completed normally. |
| `1` | Compiler Error | The Lexer, Parser, or Semantic Analyzer rejected the program before it ran. |
| `2` | Runtime Error | The program parsed and type-checked, but failed while executing. |
| `3` | CLI Usage Error | The command line itself was invalid — bad flag, missing/unreadable file, wrong extension, missing argument. The program's source was never inspected. |

A `stop <code>` statement inside the program itself overrides this table entirely — the exit code is whatever the program chose (a bare `stop` still exits `0`). See MASTER_DOCUMENT.md §15.7.

### Diagnostics and Suggestions

Unknown flags and missing/mistyped filenames get a "did you mean" hint
rather than a bare rejection:

```
$ pari --toekns hello.pr
Error: Unknown flag "--toekns".
Hint: Did you mean "--tokens"?

$ pari hallo.pr
Error: Source file not found: "hallo.pr"
Hint: Did you mean "hello.pr"?
```

Every error the CLI can produce — bad arguments, a rejected program, or a
runtime failure — prints a stable code, a plain-English message, and (where
possible) a location and a hint. A raw JavaScript stack trace should never
reach the terminal; if one ever does, that's a bug — please report it.

## Examples

All eleven programs in [examples/](examples/) run successfully end-to-end
and are exercised by the automated test suite (`tests/e2e.test.js`). Five of
them correspond 1:1 to a named example in
[MASTER_DOCUMENT.md §20](docs/MASTER_DOCUMENT.md#20-example-programs),
verified to produce exactly the documented output; the rest are additional,
focused demonstrations of specific language sections (not §20 examples).

| File | Demonstrates | §20 example? |
|---|---|---|
| `hello.pr` | `say`, string literals | §20.1 Hello World |
| `calculator.pr` | `ask`, `number()`, arithmetic | §20.2 Simple Calculator |
| `fizzbuzz.pr` | `repeat`, nested `if`/`else` | §20.3 FizzBuzz |
| `grade-checker.pr` | `task`, `return`, readable comparisons | §20.4 Grade Checker |
| `while-break-continue.pr` | `while`, `break`, `continue` | §20.5 While Loop |
| `variables.pr` | all five scalar data types, `hold`/`const` (§14) | — |
| `ifelse.pr` | `if`/`else`, `choose`/`option`/`other` (§15.1–§15.2, incl. Day of Week) | — |
| `loops.pr` | `repeat`, `while`, `break`/`continue` together (§15.3–§15.6) | — |
| `functions.pr` | `task` parameters and `return` values (§16) | — |
| `stop.pr` | the `stop` statement (§15.7) | — |
| `arrays.pr` | `box(...)`, indexing, and every array built-in (§28) | — |

```bash
pari examples/hello.pr
pari examples/functions.pr
pari examples/calculator.pr        # prompts for two numbers via ask()
pari examples/fizzbuzz.pr
pari examples/grade-checker.pr     # prompts for a score via ask()
pari examples/stop.pr              # exits with code 1 — demonstrates §15.7
pari examples/arrays.pr            # box(...), push/pop/sort/contains — demonstrates §28
pari --tokens examples/hello.pr
pari --ast examples/hello.pr
pari --analyze examples/hello.pr
pari --runtime examples/hello.pr
pari examples/hello.pr --verbose
pari --version
pari --help
```

## Project Architecture

```
Source (.pr) → Lexer → Parser → AST → Semantic Analyzer → Tree-Walking Interpreter → Runtime → Output
```

There is no bytecode or VM in v1.0 — a program is parsed into an AST and
executed directly by walking that tree. The runtime layer (`src/runtime/`)
is a deliberately separable module — explicit `EnvironmentStack`/`CallStack`,
boxed `RuntimeValue`s, a reusable `BuiltinRegistry` — so a future bytecode
compiler/VM can be added later without changing the language surface or
touching the Lexer, Parser, or AST node definitions. See
[MASTER_DOCUMENT.md §27](docs/MASTER_DOCUMENT.md#27-conclusion).

```
bin/pari.js          CLI entry point
src/
├── lexer/           Source text → tokens
├── ast/             AST node definitions, builder, printer (for --ast)
├── parser/          Recursive-descent parser (tokens → AST)
├── semantic/        Symbol tables, scope, static type checking
├── interpreter/     Tree-walking evaluator + built-in functions (incl. arrays, builtins/array.js)
├── runtime/         Environment/call stacks, boxed runtime values (incl. ListValue), builtin registry
├── errors/          Shared error-code registry (P001–P027) and error classes
├── cli/             Argument parsing, command dispatch, help/version screens
└── utils/           Logging, ANSI colors, error-message formatting
examples/            Eleven runnable .pr sample programs (see table above)
tests/               454 tests across 9 files (node:test)
docs/                Language spec, audit report, release notes, arrays design proposal
```

Full detail: [docs/MASTER_DOCUMENT.md §10](docs/MASTER_DOCUMENT.md#10-project-folder-structure).

## Running Tests

```bash
npm test
```

454 tests across 9 files: `foundation`, `lexer`, `parser`, `semantic`,
`interpreter`, `e2e` (runs the real files in `examples/` through the full
pipeline), `error-messages` (verifies every error class/stage produces a
code, message, location, and helpful suggestion), `runtime` (RuntimeValue,
EnvironmentStack, Runtime, ExecutionContext, BuiltinRegistry, leak-proofing,
and defensive runtime errors), and `cli` (spawns the real `pari` binary to
check exit codes, file handling, suggestions, and console output
end-to-end). Full audit results (every keyword, rule, built-in, and error
code individually verified) are in
[docs/PHASE8_AUDIT_REPORT.md](docs/PHASE8_AUDIT_REPORT.md).

## Known Limitations

By explicit design decision, not oversight — see
[MASTER_DOCUMENT.md §26](docs/MASTER_DOCUMENT.md#26-future-enhancements):

- **No Maps/dictionaries** — Arrays (`box`) shipped in Phase 9 (§28); a
  key-value collection type remains future work.
- **No dedicated list-iteration syntax** — arrays are iterated via
  `repeat n as i` combined with indexing (§28.4), not a first-class
  `for each` form.
- **No object-oriented programming** — no classes, structs, or methods.
- **No modules** — every program is a single `.pr` file.
- **No exception handling** — any runtime error terminates the program;
  there is no `try`/`catch`. (`stop <code>` is a deliberate, controlled
  exit, not exception handling — there is no recovery.)
- **No string indexing or slicing** — only `len()` is provided.
- **No dedicated `else if` keyword** — nested `if`/`end if` inside `else`
  is the documented, supported way to chain conditions.
- **No file or system built-ins** — programs interact with the world only
  through `say`/`ask`.
- **Call-stack traces truncate** to the first 2 frames plus a count for
  very deep stacks (e.g. `... (498 more)`); full N-frame traces are future
  work alongside the planned bytecode VM.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, project layout, and pull
request guidelines.

## License

[MIT](LICENSE)

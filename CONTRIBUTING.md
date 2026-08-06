# Contributing to Parithi

Thanks for your interest in Parithi. This document covers how to set up the
project, how it's organized, and what's expected of a pull request.

## Before you start

Parithi's language surface is deliberately small and stable — see
[docs/MASTER_DOCUMENT.md](docs/MASTER_DOCUMENT.md), the single source of
truth for the language spec and architecture. Read §26 ("Future
Enhancements") and §23 ("Future Roadmap") before proposing a new keyword,
built-in, or syntax change: several capabilities (collections, OOP, modules,
exception handling) were **deliberately** left out of v1.0, not overlooked.
A PR that adds language surface without a prior design discussion is
unlikely to be merged as-is — open an issue first.

Bug fixes, test coverage, documentation corrections, and CLI/tooling
improvements that don't change language behavior are always welcome without
a prior design discussion.

## Setup

Requires Node.js ≥ 18 (no other runtime dependency — the project intentionally
has a zero-dependency core).

```bash
git clone <your-fork-url>
cd parithi
npm install
npm test
```

To run the CLI against your local checkout without `npm link`:

```bash
node bin/pari.js examples/hello.pr
```

## Project layout

```
src/
├── lexer/       Tokenizes .pr source
├── ast/         AST node definitions, builder, printer
├── parser/      Recursive-descent parser
├── semantic/    Symbol tables, scope, static type checking
├── interpreter/ Tree-walking evaluator + built-in functions
├── runtime/     Environment/call stacks, boxed runtime values, builtin registry
├── errors/      Shared error-code registry and error classes
├── cli/         Argument parsing, command dispatch, help/version screens
└── utils/       Logging, ANSI colors, error-message formatting
```

Full detail: [docs/MASTER_DOCUMENT.md §10](docs/MASTER_DOCUMENT.md#10-project-folder-structure).

## Making a change

1. **Find or open an issue** describing the bug or the improvement, especially
   for anything touching `src/lexer`, `src/parser`, `src/semantic`, or
   `src/interpreter` — those four together define the language itself.
2. **Write the test first, or alongside the fix.** Every bug fix should add a
   regression test in the matching `tests/*.test.js` file; every new example
   program should be exercised by `tests/e2e.test.js`.
3. **Match the existing error-reporting contract.** Any new failure a user
   can trigger must go through the existing error-code system
   (`src/errors/`) — a stable code, a plain-English message, a source
   location where possible, and a corrective hint. A raw JavaScript stack
   trace reaching the terminal is treated as a bug in itself; see
   [docs/MASTER_DOCUMENT.md §18](docs/MASTER_DOCUMENT.md#18-error-handling-and-error-codes).
4. **Keep the dependency tree at zero** for the core interpreter/CLI (per
   [docs/MASTER_DOCUMENT.md §21](docs/MASTER_DOCUMENT.md#21-technology-stack)).
   Dev-only tooling is a separate conversation — open an issue first.
5. **Run the full test suite** before opening a PR:

   ```bash
   npm test
   ```

   All tests must pass. If you touched CLI behavior, also manually verify
   `pari --help`, `pari --version`, and a plain run still behave as
   documented.
6. **Update the docs in the same PR** if behavior changed. At minimum:
   `docs/MASTER_DOCUMENT.md` (the spec) and `README.md` (user-facing usage).
   A change whose docs and code disagree won't be merged.

## Code style

- Plain ES modules, no build step, no TypeScript (see §21 for why — this may
  change post-v1.0, but isn't a per-PR decision).
- No comments that just restate what the code does — comments should explain
  a non-obvious *why* (a subtle invariant, a deliberate design tradeoff, a
  workaround), matching the existing style in `src/`.
- Prefer small, single-purpose modules over large ones — that's why `src/`
  is split as finely as it is.

## Reporting bugs

Include: the `.pr` program that triggers it (minimal, if possible), the
command you ran, what you expected, what actually happened, and the output
of `pari --version`.

## License

By contributing, you agree that your contributions will be licensed under
the project's [MIT License](LICENSE).

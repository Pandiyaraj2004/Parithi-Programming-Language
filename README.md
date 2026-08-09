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

**v1.0 — stable release, now including Arrays, a Bytecode Generator, a
Parithi Virtual Machine, and a Bytecode Optimizer.** A complete,
fully-tested implementation of the language specified in
[docs/MASTER_DOCUMENT.md](docs/MASTER_DOCUMENT.md): Lexer → Parser →
Semantic Analyzer, behind a professional CLI (`pari`), executed by
**either** of two independent, output-identical backends — the
Tree-Walking Interpreter (default) or the Parithi Virtual Machine. Every
keyword, language rule, built-in, and documented error code has been
individually verified against the specification — see
[docs/PHASE8_AUDIT_REPORT.md](docs/PHASE8_AUDIT_REPORT.md) and
[docs/RELEASE_VERIFICATION_REPORT.md](docs/RELEASE_VERIFICATION_REPORT.md).
**Phase 9** added Arrays (`box`) — the first language-surface change since
that audit — end-to-end across every layer
([MASTER_DOCUMENT.md §28](docs/MASTER_DOCUMENT.md#28-arrays-phase-9)).
**Phase 10** added a **Bytecode Generator** — `pari --compile` translates
the validated AST into Parithi Bytecode (`.pbc`)
([§29](docs/MASTER_DOCUMENT.md#29-bytecode-phase-10)). **Phase 11** then
added the **Parithi Virtual Machine (PVM)** — `pari <file.pbc>` executes
that bytecode directly
([§30](docs/MASTER_DOCUMENT.md#30-parithi-virtual-machine-phase-11)).
**Phase 12** added a **Bytecode Optimizer** — `pari <file.pr> --optimize`
runs 8 ordered passes (constant folding/propagation, dead-code/jump/
peephole/stack/constant-pool optimization, plus jump-target repair)
between the Generator and the Validator/PVM, shrinking a program's
bytecode without changing what it does
([§31](docs/MASTER_DOCUMENT.md#31-bytecode-optimizer-phase-12)). All four
phases changed **zero lines** in the Lexer, Parser, AST, Semantic
Analyzer, Interpreter, or Runtime — see [CHANGELOG.md](CHANGELOG.md).
**Phase 13 (in progress)** is adding two things in parallel: a **Standard
Library** — sub-phase 13a shipped Math/String/Array/Type/System (~45 new
built-ins — `sqrt`, `upper`, `clear`, `boolean`, `sleep`, and more), with
File/JSON/Date & Time/HTTP still to come
([§32](docs/MASTER_DOCUMENT.md#32-standard-library-phase-13)) — and a
**Native Compiler**: `pari --native <file.pr>` hand-compiles Parithi
through a real three-address-code IR and a 6-pass IR Optimizer (constant
folding/propagation, algebraic simplification, dead-code/unreachable-code/
redundant-temporary elimination — `--emit-ir`/`--emit-optimized-ir`/
`--optimizer-stats` inspect each stage), then straight to a real,
standalone Windows (x86-64) `.exe` — no Node.js, no `pari`, no PVM
involved once compiled — by writing the PE executable format and x86-64
machine code directly (no assembler/linker exists on the reference build
machine). This is a genuine, tested, actually-executed foundation, **not**
full native compilation of the language yet: `say`/`hold`/`const`/
assignment built from literals, variables, arithmetic, comparisons, and
unary operators reach actual machine code today, whenever the IR
Optimizer's existing constant-folding/propagation passes can resolve
every value to a compile-time constant (Phase 17 — §37); real
control-flow codegen (`if`/`while`/`loop`, functions, arrays) remains
future work — every unsupported construct fails with a clean diagnostic
rather than a wrong `.exe`
([§33](docs/MASTER_DOCUMENT.md#33-native-compiler-phase-13-x86-64-backend),
[§37](docs/MASTER_DOCUMENT.md#37-native-backend-recovery--feature-expansion-phase-17)).
**Phase 14** added the **Adaptive Execution Engine**: a bare `pari
<file.pr>` now automatically picks the best of the three coexisting
backends — Native x86-64 → Bytecode + PVM → Tree-Walking Interpreter, in
that priority order — via static capability analysis of the validated AST,
**never** by trying one backend and retrying on another (which could
duplicate a program's side effects). `pari <file.pr> --backend
native|bytecode|interpreter` forces one explicitly and never silently
falls back — an unsupported forced backend is a clean diagnostic, not a
different backend running instead. `pari --explain-backend <file.pr>`
reports every backend's SUPPORTED/UNSUPPORTED verdict (with the specific
reason) and which one would be selected, without executing the program
([§34](docs/MASTER_DOCUMENT.md#34-adaptive-execution-engine-phase-14)).
**Phase 15** ran a full production-readiness audit — every keyword,
backend, Standard Library built-in, and CLI command verified by actually
running it (real generated `.exe` files actually executed; a real `npm
pack` extracted and run in a clean directory with zero access to this
repository) — finding and fixing six real bugs, most notably deeply
nested source (1000+ parenthesized groups) crashing with a raw JS
`RangeError` instead of a clean diagnostic (new `P031`, a parser
recursion guard); see
[§35](docs/MASTER_DOCUMENT.md#35-production-readiness-audit-phase-15) for
the full list and what was confirmed correct rather than broken.
**Phase 16** added the **Unified Loop Model**: a new, unconditional `loop
... end loop` construct, and `break <expression>` — usable anywhere
`break` already is — lets `loop`/`while`/`repeat` alike optionally
*produce a value* when used in expression position (e.g. `hold result =
loop ... end loop`), defaulting to `Empty` when no `break <expression>`
supplies one. Purely additive: every pre-existing `while`/`repeat`/
`break`/`continue` program is unaffected, and the Native backend's
capability boundary does not move (it already rejected every loop
construct before this phase, and still does — see
[§36](docs/MASTER_DOCUMENT.md#36-unified-loop-model-phase-16)).
**992 automated tests pass**, including a dedicated 39-test suite proving
the Interpreter and the PVM produce byte-for-byte identical output, exit
codes, and error codes for the same programs, a further 54-test suite
proving the same parity holds for optimized bytecode, a 17-test suite
proving it for every new Standard Library built-in, a 45-test native suite
that actually writes and executes real `.exe` files (not just inspects
compiled bytes), and a 52-test backend-selection suite covering capability
analysis, automatic/forced selection, and cross-backend parity; no known
implementation bugs. **Phase 17** re-verified the native backend end to
end (real `.exe` compilation and execution, PE structure, import tables,
byte-level codegen) found no reproducible defect in what it already
claimed to support, then — using that same verification discipline —
expanded real x86-64 codegen to compile-time-constant variables,
arithmetic, comparisons, and unary operators, catching and cleanly fixing
two genuine edge cases surfaced by the expansion itself (division/modulo
by a divisor that folds to zero, and self-referencing reassignment like
`x = x + 1`) before they could reach a shipped diagnostic path; see
[§37](docs/MASTER_DOCUMENT.md#37-native-backend-recovery--feature-expansion-phase-17).

Deliberately **not** in v1.0, by explicit design decision rather than
oversight (see [Known Limitations](#known-limitations) below): Maps/
dictionaries, object-oriented programming, modules, and exception
handling.

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

## Data Types

Parithi has **six** data types. Every one of them is a real, implemented
`RuntimeValue` class in [`src/runtime/runtime-value.js`](src/runtime/runtime-value.js)
(`NumberValue`, `DecimalValue`, `StringValue`, `BooleanValue`, `EmptyValue`,
`ListValue`) and a real static type in
[`src/semantic/types.js`](src/semantic/types.js)'s `DataType` enum — this
section documents exactly those six, nothing more, matching
[MASTER_DOCUMENT.md §12.2](docs/MASTER_DOCUMENT.md#122-data-types),
[§14.4](docs/MASTER_DOCUMENT.md#144-static-type-system), and
[§28](docs/MASTER_DOCUMENT.md#28-arrays-phase-9) exactly. (There's also an
internal `Unknown` type, but it isn't a data type a value can ever
actually have — see [Assignment rules and limitations](#assignment-rules-and-limitations)
below.)

| Type | Represents | Created with |
|---|---|---|
| **Number** | A whole number | `hold age = 25` |
| **Decimal** | A number with a fractional part | `hold price = 19.99` |
| **String** | Text | `hold name = "Parithi"` |
| **Boolean** | A truth value | `hold isLoggedIn = true` |
| **Empty** | The deliberate absence of a value | `hold data = empty` |
| **Array** | An ordered, resizable, mutable collection | `hold nums = box(1, 2, 3)` |

### How type inference works

A variable's type is **inferred once**, from the expression on the
right-hand side of its **first** assignment — Parithi has no type
annotation syntax anywhere in its grammar, so this inferred type is the
only type information that ever exists for a variable. It is then
**locked**: every later assignment to that variable must produce a
*compatible* type, or the compiler rejects the program before it ever
runs (`P002`, a compile-time error, not a runtime one).

```
hold age = 20        # inferred: Number, locked from here on
age = 21             # fine — 21 is also Number
age = "twenty"        # rejected before the program runs
```
```
Error P002:
Cannot assign String to Number.
Hint: "age" was inferred as Number from its declaration.
```

### `empty` and type locking

`empty` is special: assigning it to a fresh `hold` variable does **not**
lock a type yet. The variable's type instead locks on its **first
non-`empty` assignment** — this lets you declare a variable before you
know what it will hold, without a spurious type error:

```
hold data = empty
say type(data)        # Empty — not locked yet
data = 42
say data               # 42
say type(data)          # Number — locked now
data = "oops"            # rejected — locked to Number, not Empty anymore
```
```
Error P002:
Cannot assign String to Number.
```

One subtlety worth knowing: once a variable *is* locked (say, to Number),
you can still assign `empty` back to it later — `empty` is always
compatible with every type, in both directions — but doing so does
**not** unlock or reset the variable's type. `data = empty` after the
example above is allowed, but `data` remains Number-typed, so a
following `data = "x"` would still be rejected. Locking is one-way and
permanent, for exactly the variable's first real type.

`empty` is also the implicit return value of a `task` that reaches its
end without ever hitting a `return` statement.

### Number vs. Decimal compatibility

Number and Decimal are two distinct labels — `type(10)` reports
`"Number"`, `type(10.0)` reports `"Decimal"`, and diagnostics always show
them separately — but they are always **compatible** with each other for
assignment, comparison, and passing as function arguments. This matters
because Parithi can't always know from the source text alone whether an
arithmetic result will be a whole number or a fraction:

```
hold a = 10
hold b = 3.5
say a + b              # 13.5
say type(a + b)         # Decimal

say 7 / 2               # 3.5
say type(7 / 2)          # Decimal — division promotes when the result isn't whole
```

A variable inferred as Number from `hold age = 20` can therefore later be
reassigned a Decimal-producing expression (`age = age / 2`) without a type
error — but String, Boolean, and Empty remain strictly separate from
Numeric and from each other; this loosening applies only within the
Number/Decimal family.

### Array (`box`) — implemented in Phase 9

Arrays are ordered, resizable, **mutable** collections created with the
`box(...)` keyword-call:

```
hold nums = box(1, 2, 3)
say nums                 # [1, 2, 3]
say type(nums)             # Array

push(nums, 4)
say nums                   # [1, 2, 3, 4]
say len(nums)                # 4
say nums[0]                   # 1 — 0-based indexing
nums[0] = 100
say nums                       # [100, 2, 3, 4]
```

Rules worth knowing, all real and enforced (not aspirational):

- **0-based indexing** — `nums[0]` is the first element (a deliberate
  choice against `ARRAYS_DESIGN.md`'s own 1-based recommendation).
- **Reference semantics** — `hold b = nums` makes `b` and `nums` the
  *same* underlying array; mutating one mutates both. This is the one
  type in Parithi where assignment doesn't behave like copying a scalar.
- **Deep (structural) equality** — `==`/`!=` and `contains()` compare
  arrays element-by-element, recursively; two separately-built arrays
  with identical contents are `==` even though they're different objects.
  This doesn't contradict reference semantics above — assignment and
  `==` are different operations.
- **Homogeneous elements** — every element in one array must share the
  same static type, with `empty` always exempted from the check in
  either direction:
  ```
  hold ok = box(1, empty, 3)      # fine — empty never conflicts
  hold bad = box(1, "two")        # rejected
  ```
  ```
  Error P026:
  Array elements must share the same type — found Number and String in the same "box(...)".
  ```
- **Array is a flat, non-parameterized type** — there's no "Array of
  Number" vs. "Array of String" distinction; every array's static type is
  simply `Array`, and `nums[0]`'s inferred type is `Unknown` (open, like a
  function parameter) rather than tracking what's actually inside.
- **Built-ins:** `push`, `pop`, `insert`, `remove`, `sort`, `reverse`,
  `contains` (Phase 9), plus `len`/`length`, `clear`, `isEmpty`, and
  `indexOf` (Phase 13) — see [MASTER_DOCUMENT.md §28.5](docs/MASTER_DOCUMENT.md#285-array-built-in-functions)
  for the full reference.

### Assignment rules and limitations

- **No implicit type coercion, ever.** `"Age: " + age` (String + Number)
  is a compile-time error — convert explicitly with `text(age)` first.
  `+` only concatenates when **both** sides are already String.
- **Function parameters have no static type.** Parithi's grammar has no
  parameter type-annotation syntax, so every parameter is internally
  `Unknown` — compatible with anything, so using it inside the function
  body never produces a spurious type error. This is *not* a seventh data
  type a value can hold; no variable, literal, or built-in can ever
  produce an `Unknown`-typed *value* — it only ever describes "this
  parameter's type isn't statically known yet."
- **No Maps/dictionaries, and no general Objects** — see
  [Known Limitations](#known-limitations). Arrays are the only collection
  type in v1.0.
- **No numeric width limits are enforced** — Number/Decimal are backed by
  JS's native `number` in v1.0; there's no overflow error for very large
  values.

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
  `repeat` (fixed-count, optional 1-based counter), `while`, the
  unconditional `loop` (§36), `break`/`continue`, `break <expression>`
  (lets `loop`/`while`/`repeat` alike optionally produce a value when
  used in expression position — `hold result = loop ... end loop`,
  defaulting to `Empty` when nothing supplies one), and `stop [code]`
  (terminates the whole program immediately, from anywhere, with an
  optional numeric exit code — §15.7).
- **Functions:** `task` with parameters, `return`, recursion (mutual and
  self-), lexical closures, a 500-frame call-depth guard.
- **Built-ins:** `round`, `random` (math); `number`, `text`, `type`
  (conversion/inspection); `len` (text or array); `push`, `pop`, `insert`,
  `remove`, `sort`, `reverse`, `contains` (arrays) — argument-validated at
  both compile time and defensively at runtime.
- **I/O:** `say` (multi-value, space-joined output), `ask` (prompts and
  always returns a String).
- **Error reporting:** 31 stable error codes (`P001`–`P031`) across
  Lexing/Parsing/Semantic Analysis/Interpretation/Native Compilation —
  each carries a code, a plain-English message, a source location, and a
  corrective hint. A raw JavaScript stack trace reaching the terminal is
  treated as a bug.
- **Bytecode Generator:** `--bytecode`/`--compile` translate the validated
  AST into Parithi Bytecode (`.pbc`) — a separate, additive backend; see
  [MASTER_DOCUMENT.md §29](docs/MASTER_DOCUMENT.md#29-bytecode-phase-10).
- **Parithi Virtual Machine (PVM):** `pari <file.pbc>` / `--run-bytecode`
  execute compiled bytecode directly — a second, independent execution
  engine, proven output-identical to the Interpreter for every construct
  in the language; see
  [MASTER_DOCUMENT.md §30](docs/MASTER_DOCUMENT.md#30-parithi-virtual-machine-phase-11).
- **Bytecode Optimizer:** `--optimize` runs 8 ordered, independently-tested
  passes (constant folding, constant propagation, dead-code elimination,
  jump optimization, peephole optimization, stack optimization, constant
  pool optimization, label/jump-target cleanup) between the Bytecode
  Generator and the Validator/PVM — re-validating after every single pass
  and rejecting anything invalid before it can execute. `--stats` prints
  an instruction/constant-pool before-vs-after report; `--disassemble`
  prints the optimized listing. Proven output-identical to the
  unoptimized Interpreter/PVM for every construct in the language; see
  [MASTER_DOCUMENT.md §31](docs/MASTER_DOCUMENT.md#31-bytecode-optimizer-phase-12).
- **Standard Library (in progress):** ~45 new built-ins across Math
  (`sqrt`, `pow`, `abs`, `floor`, `ceil`, `min`/`max`, `randomInt`,
  `sin`/`cos`/`tan`, `log`, `exp`), String (`upper`, `lower`, `trim`,
  `split`, `join`, `replace`, `startsWith`/`endsWith`, `substring`,
  `indexOf`/`lastIndexOf`, `repeatText`, `reverseText`), Array (`clear`,
  `length`, `isEmpty`), Type (`boolean`, `isNumber`, `isText`,
  `isBoolean`), and System (`sleep`, `version`, `platform`,
  `workingDirectory`, `arguments`) — every one argument-validated,
  proven output-identical between the Interpreter and the PVM, and
  additive (nothing from Phase 6/9's built-ins changed). File/JSON/Date &
  Time/HTTP are still to come; see
  [MASTER_DOCUMENT.md §32](docs/MASTER_DOCUMENT.md#32-standard-library-phase-13).
- **Native Compiler (Windows x86-64, minimal foundation):** `AST → IR →
  IR Optimizer (6 passes) → x86-64 → PE .exe`. The IR itself already
  models variables, arithmetic, comparisons, booleans, control flow
  (`if`/`while`/`repeat`/`break`/`continue`), and functions/recursion,
  and the optimizer genuinely folds constants, propagates them,
  simplifies algebraic identities, and removes dead/unreachable code and
  redundant temporaries. **Phase 17** used exactly that existing
  constant-folding/propagation machinery to expand real x86-64 codegen
  from "`say` with String literals only" to `say`/`hold`/`const`/
  assignment built from literals, variables, arithmetic, comparisons, and
  unary operators — wherever every value resolves to a compile-time
  constant (division/modulo by a zero divisor, and self-referencing
  reassignment like `x = x + 1`, are cleanly rejected, not silently
  miscompiled, since neither can be folded this way). Real control-flow
  codegen (`if`/`while`/`loop`, functions, arrays) is still future work —
  every other construct fails with a clean diagnostic, never a
  silently-wrong executable (hand-written x86-64 + PE format, since no
  assembler/linker exists on the reference build machine — every byte is
  verified by actually executing generated `.exe` files, not just
  inspecting them). `--emit-ir`/`--emit-optimized-ir`/`--optimizer-stats`/
  `--ir`/`--asm` inspect every stage; see
  [MASTER_DOCUMENT.md §33](docs/MASTER_DOCUMENT.md#33-native-compiler-phase-13-x86-64-backend)
  and
  [§37](docs/MASTER_DOCUMENT.md#37-native-backend-recovery--feature-expansion-phase-17).
- **Adaptive Execution Engine:** a bare `pari <file.pr>` automatically
  selects the best of the three backends — Native x86-64 → Bytecode + PVM →
  Tree-Walking Interpreter, in that priority order — via static capability
  analysis of the AST, never by trying one backend and retrying on another.
  `--backend native|bytecode|interpreter` forces one explicitly with no
  silent fallback; `--explain-backend` reports every backend's
  SUPPORTED/UNSUPPORTED verdict and the selection reasoning without
  executing the program; see
  [MASTER_DOCUMENT.md §34](docs/MASTER_DOCUMENT.md#34-adaptive-execution-engine-phase-14).
- **CLI (`pari`):** program execution plus seven pipeline-introspection/
  execution flags (`--tokens`, `--ast`, `--analyze`, `--runtime`,
  `--bytecode`, `--compile`, `--run-bytecode`), three optimizer flags
  (`--optimize`, `--stats`, `--disassemble`), `--native` (plus `-o`,
  `--ir`, `--asm`), `--backend`/`--explain-backend`, `--version`, `--help`,
  `--verbose`, four distinct exit codes, and "did you mean...?"
  suggestions for mistyped flags and filenames.

## CLI Reference

```
pari <file.pr>              Execute a Parithi program — automatically picks the best backend
pari <file.pr> --backend native|bytecode|interpreter   Force a specific backend, no fallback
pari --explain-backend <file.pr>   Report each backend's capability verdict, then exit (does not execute)
pari --tokens <file.pr>     Print the lexer's token stream, then exit
pari --ast <file.pr>        Print the parsed AST as a tree, then exit
pari --analyze <file.pr>    Run semantic analysis (symbol tables + diagnostics), then exit
pari --runtime <file.pr>    Execute, then print runtime diagnostics (environment/call stack)
pari --bytecode <file.pr>   Print the generated Parithi Bytecode listing, then exit (does not execute)
pari --compile <file.pr>    Compile to a .pbc bytecode file next to the source, then exit (does not execute)
pari <file.pbc>             Execute compiled bytecode directly on the PVM (auto-detected by extension)
pari --run-bytecode <file>  Execute on the PVM — accepts a .pbc file, or a .pr file (compiled in memory first)
pari <file.pr> --optimize   Run the 8-pass bytecode optimizer, then print the optimized listing (composes with --compile/--bytecode/--run-bytecode/plain run)
pari <file.pr> --stats      Print the optimizer's before/after instruction and constant-pool report
pari <file.pr> --disassemble  Print a human-readable optimized bytecode listing
pari --native <file.pr>      Compile to a real, standalone Windows (x86-64) .exe, next to the source
pari --native <file.pr> -o <path>   ...write it to <path> instead
pari --native <file.pr> --ir/--asm  ...also print the native IR / generated x86-64 instructions
pari --version              Print version information (language, compiler, Node, platform)
pari --help / -h            Print usage and the flag reference
pari <file.pr> --verbose    Print the selected backend and total execution time
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
pari --bytecode examples/hello.pr   # print the compiled bytecode listing
pari --compile examples/hello.pr    # write examples/hello.pbc
pari examples/hello.pbc             # execute it directly on the PVM
pari --run-bytecode examples/hello.pr  # compile + execute on the PVM, no .pbc file written
pari examples/calculator.pr --optimize # print the optimized bytecode listing
pari examples/calculator.pr --stats    # print the before/after Optimization Report
pari examples/calculator.pr --disassemble  # print a human-readable optimized listing
pari examples/hello.pr --verbose
pari --native examples/native/hello.pr        # write examples/native/hello.exe — run it directly, no Node.js involved
pari --native examples/native/hello.pr --asm  # also print the generated x86-64 instructions
pari --native examples/native/variables.pr    # variables/arithmetic/comparisons (Phase 17) — also compiles natively
pari examples/hello.pr --backend native       # force Native x86-64 — no fallback if unsupported
pari examples/variables.pr --backend bytecode # force Bytecode + PVM
pari examples/variables.pr --backend interpreter  # force the Tree-Walking Interpreter
pari --explain-backend examples/variables.pr  # report each backend's capability verdict, don't execute
pari --version
pari --help
```

## Project Architecture

```
                                                    ┌─→ Native IR → x86-64 Backend → PE .exe → Windows CPU ────────────┐
Source (.pr) → Lexer → Parser → AST → Semantic Analyzer → Backend Capability Resolver ─┤─→ Bytecode Generator → [Optimizer, optional] → Validator → PVM ─┼─→ Output
                                                    └─→ Tree-Walking Interpreter ────────────────────────────────────────┘
```

Three backends share the identical output of the Semantic Analyzer —
none of them changes what "a valid Parithi program" means. As of Phase 14,
`pari <file.pr>` (no flag) no longer hardcodes a single backend: the
**Backend Capability Resolver** (`src/backend/`) statically inspects the
AST and picks the first backend, in priority order (Native x86-64 →
Bytecode + PVM → Tree-Walking Interpreter), that supports the program —
never by trying one and retrying on another, since that could duplicate a
program's side effects (see
[MASTER_DOCUMENT.md §34.3](docs/MASTER_DOCUMENT.md#343-why-capability-analysis-not-trial-execution)).
`pari <file.pr> --backend <name>` forces one explicitly with no silent
fallback; `pari <file.pbc>` / `--run-bytecode` still always take the
Bytecode Generator → PVM path directly; `--native` still always takes the
third — Native IR → hand-written x86-64 machine code → a real, standalone
Windows `.exe`, executed directly by the CPU with no Node.js or `pari`
process involved (when Native wins automatic/forced selection, `pari`
itself writes that `.exe` to a temp file and runs it as a child process).
The Interpreter and PVM are proven, not just asserted, to produce
identical output for identical programs (a dedicated 39-test parity
suite); Native is proven the same way for the (currently small) subset it
supports (a 37-test suite that actually executes generated `.exe` files,
not just inspects them — see
[MASTER_DOCUMENT.md §33.8](docs/MASTER_DOCUMENT.md#338-testing--real-execution-not-just-it-compiled));
and all three backends are proven to agree with each other under both
automatic and forced selection (a 51-test backend-selection suite — see
[§34.7](docs/MASTER_DOCUMENT.md#347-testing)).
`--bytecode`/`--compile` still just generate a listing/file without
executing, exactly as Phase 10 left them. Adding `--optimize` inserts the
8-pass Bytecode Optimizer (Phase 12) between the Generator and the
Validator on the bytecode path — off by default, so plain
`pari <file.pr>` / `pari <file.pbc>` are completely unaffected, and proven
output-identical to the unoptimized path for every construct (a further
54-test parity suite). The runtime layer (`src/runtime/`) is a
deliberately separable module — explicit `EnvironmentStack`/`CallStack`,
boxed `RuntimeValue`s, a reusable `BuiltinRegistry` — which is exactly what
let every one of these additions get made with zero changes to the Lexer,
Parser, AST, Semantic Analyzer, or Interpreter. See
[MASTER_DOCUMENT.md §27](docs/MASTER_DOCUMENT.md#27-conclusion),
[§29](docs/MASTER_DOCUMENT.md#29-bytecode-phase-10),
[§30](docs/MASTER_DOCUMENT.md#30-parithi-virtual-machine-phase-11),
[§31](docs/MASTER_DOCUMENT.md#31-bytecode-optimizer-phase-12),
[§33](docs/MASTER_DOCUMENT.md#33-native-compiler-phase-13-x86-64-backend),
and
[§34](docs/MASTER_DOCUMENT.md#34-adaptive-execution-engine-phase-14).

```
bin/pari.js          CLI entry point
src/
├── lexer/           Source text → tokens
├── ast/             AST node definitions, builder, printer (for --ast)
├── parser/          Recursive-descent parser (tokens → AST)
├── semantic/        Symbol tables, scope, static type checking
├── interpreter/     Tree-walking evaluator + built-in functions (incl. arrays, builtins/array.js)
├── runtime/         Environment/call stacks, boxed runtime values (incl. ListValue), builtin registry
├── errors/          Shared error-code registry (P001–P031) and error classes
├── cli/             Argument parsing, command dispatch, help/version screens
├── utils/           Logging, ANSI colors, error-message formatting
├── bytecode/        AST → Parithi Bytecode (.pbc): opcodes, generator, validator, text/binary writers
├── vm/              Executes Parithi Bytecode: operand stack, call frames, instruction dispatcher
├── optimizer/       8-pass bytecode optimizer (pass-manager.js + passes/), statistics, --stats report
├── stdlib/          Standard Library (Phase 13, in progress): math/, string/, array/, type/, system/ — file/json/datetime/http/ pending
├── native/          Native (x86-64) backend (Phase 13, expanded Phase 17): ir/ (three-address-code IR + 6-pass optimizer), codegen/, pe/ — hand-written PE writer + x86-64 encoder; `say`/`hold`/`const`/assignment built from compile-time-constant-foldable literals/variables/arithmetic/comparisons reach actual machine code
└── backend/         Adaptive Execution Engine (Phase 14): capability.js (per-backend static AST capability checks), selector.js (priority-order BackendSelector) — never executes anything itself
examples/            Eleven runnable .pr sample programs (see table above), plus examples/stdlib/ (four more) and examples/native/ (three — the only programs that compile natively today)
tests/               992 tests across 22 files (node:test), incl. tests/native/ which actually executes generated .exe files and tests/backend/ which covers capability analysis and backend selection
benchmarks/          optimizer-benchmark.mjs, native-benchmark.mjs — before/after instruction count/VM timing, and native-vs-Interpreter/PVM timing (dev tools, not shipped)
docs/                Language spec, audit report, release notes, arrays design proposal, optimizer benchmarks
```

Full detail: [docs/MASTER_DOCUMENT.md §10](docs/MASTER_DOCUMENT.md#10-project-folder-structure).

## Running Tests

```bash
npm test
```

992 tests across 22 files: `foundation`, `lexer`, `parser`, `semantic`,
`interpreter`, `e2e` (runs the real files in `examples/` through the full
pipeline), `error-messages` (verifies every error class/stage produces a
code, message, location, and helpful suggestion), `runtime` (RuntimeValue,
EnvironmentStack, Runtime, ExecutionContext, BuiltinRegistry, leak-proofing,
and defensive runtime errors), `bytecode` (Generator/Validator correctness
across every construct, plus binary/text writer round-trip fidelity), `vm`
(every opcode, runtime object, recursion, arrays, stack overflow, and
invalid/corrupted bytecode on the PVM), `vm-parity` (the Interpreter and
PVM proven to produce identical output/exit/error codes for every
construct and all real examples), `optimizer` (each of the 8 passes
verified independently, plus nested loops/recursion/`choose`/arrays/`stop`/
built-ins/runtime errors/a 10,000+ instruction program, and a parity
harness proving the Interpreter and the optimized PVM stay
output-identical), `math`/`string`/`array` (every new Phase 13 built-in's
normal cases, invalid arguments, Unicode strings, and domain/range errors),
`stdlib` (Type/System libraries plus an Interpreter-vs-PVM parity sweep
across every new built-in in every category), `native` (the one suite
that doesn't stop at "the compiler produced bytes" — every success-path
test writes a real PE `.exe` and *executes* it via `spawnSync`, checking
genuine stdout/exit code, including Phase 17's compile-time-constant
variables/arithmetic/comparisons/reassignment/unary-operator cases;
every unsupported-feature case — including the two edge cases Phase 17
found and fixed, division/modulo-by-zero and self-referencing
reassignment — is asserted to fail with a clean P030, never a crash; a
3-way Interpreter/PVM/Native parity sweep for the currently-supported
subset), `native/ir` (AST → IR
generation for every construct §33.16 covers — variables, expressions,
conditions, loops, functions, recursion), `native/ir-optimizer` (all 6
IR optimizer passes, each tested both in isolation and as part of the
full pipeline, including the critical "never remove a side-effecting
call" safety rule), `cli` (spawns the
real `pari` binary to check exit codes, file handling, suggestions,
`--bytecode`/`--compile`/`--run-bytecode`/`.pbc`/`--optimize`/`--stats`/
`--disassemble`, and console output end-to-end), and `backend/capability`
+ `backend/cli` (Phase 14: per-backend static capability checks against
real programs, the priority-order selection algorithm against synthetic
outcomes including the interpreter-fallback case no real program can
trigger today, real subprocess tests for automatic selection, forced
`--backend` success/no-fallback-on-failure, `--explain-backend`'s
never-executes guarantee, and Native/Bytecode/Interpreter parity). Full audit results (every
keyword, rule, built-in, and error code individually verified) are in
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
  very deep stacks (e.g. `... (498 more)`) — on both backends identically;
  full N-frame traces remain future work.
- **Automatic backend selection only ever reaches Native or Bytecode in
  practice (Phase 14, §34.2)** — the Bytecode Generator compiles every AST
  node type the Parser can produce, so it never reports "unsupported"
  today; the Tree-Walking Interpreter fallback in the priority list is
  real and tested, but no current Parithi program is both
  native-unsupported and bytecode-unsupported, so automatic selection
  can't reach it yet. It remains directly reachable via
  `--backend interpreter`.
- **No loop-aware optimization** — the Phase 12 optimizer (§31) reduces
  static instruction count and constant-pool size (largest wins in
  constant-heavy/straight-line code); it does not perform loop-invariant
  code motion or strength reduction, so a tight loop's wall-clock time
  still tracks iteration count, not program size (§23 item 8).
- **Standard Library is partial (Phase 13 in progress)** — Math/String/
  Array/Type/System shipped in sub-phase 13a; File, JSON, Date & Time,
  and HTTP remain (§32). HTTP in particular needs a genuine architecture
  decision first — Parithi has no async/await/Promises anywhere, and the
  project has kept zero runtime dependencies since v1.0, so a *blocking*
  `get()`/`post()` needs either a `worker_threads`/`Atomics.wait` bridge,
  shelling out to `curl`, or an actual dependency (§32.10).
- **Native compiler is a compile-time-constant-only foundation, not
  full-language native compilation (Phase 13, expanded Phase 17)** —
  `--native` compiles `say`/`hold`/`const`/assignment built from
  literals, variables, arithmetic, comparisons, and unary operators,
  wherever the IR Optimizer's existing constant-folding/propagation
  passes can resolve every value to a compile-time constant; a
  self-referencing reassignment (`x = x + 1`) or division/modulo by a
  divisor that folds to zero cannot be, and are cleanly rejected rather
  than miscompiled. Real control flow (`if`/`while`/`loop`),
  functions/recursion, Arrays, and every Standard Library built-in still
  need genuine runtime codegen (registers, a call stack, real branches)
  and fail with a clean diagnostic, never a silently-wrong `.exe`
  (§33.9, §37). This is despite the IR itself already modeling all of
  those (§33.16) and the IR Optimizer already correctly optimizing
  programs that use them (§33.19) — the gap is specifically in
  `ir-to-x86-64.js`'s own coverage, not the IR/optimizer design, which is
  why closing it is the explicit next step (§33.14). Windows x86-64 only —
  no Linux/macOS/ARM64 target exists or was attempted. No assembler or
  linker exists on the reference build machine, so every PE header and
  x86-64 instruction is hand-written and verified by actually executing
  generated executables, not merely inspecting them (§33.2/§33.8).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, project layout, and pull
request guidelines.

## License

[MIT](LICENSE)

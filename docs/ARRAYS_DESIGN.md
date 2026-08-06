# Parithi Arrays — Design Proposal (Implemented in Phase 9)

**Status:** superseded — implemented. This document is preserved unedited as the historical design proposal it always was; it does **not** describe the final, shipped behavior. The keyword this document was waiting on (§9 below) was decided as **`box`**, and implementation proceeded in Phase 9 with three deliberate departures from this document's own recommendations (reference semantics instead of value semantics; 0-based indexing instead of 1-based; bracket indexing layered on top of the keyword-call literal rather than picking only one style) — see [MASTER_DOCUMENT.md §28](MASTER_DOCUMENT.md#28-arrays-phase-9) §28.1 for the full decision table, and §28 overall for the actual, current specification. Read *this* document only for the historical design discussion; read §28 for what Parithi actually does.

---

This design touches every layer of the pipeline. Each section calls out what changes and, where the master document doesn't already settle the question, flags an open decision instead of assuming an answer.

---

## 1. Concept and naming

A single ordered, resizable collection type — what §23.4 calls a "List." This document uses the placeholder **`<ARR>`** everywhere a keyword is needed; substitute your chosen word once you provide it (§9 asks for it directly).

## 2. Memory model — the one genuinely new problem

Every existing Parithi type (Number, Decimal, String, Boolean, Empty) is a scalar: assignment always copies a value, so `hold b = a` can never let a later `b = ...` be visible through `a`. Arrays are the **first reference-shaped type**, and that changes something fundamental — this needs your decision, not mine:

**Option A — Value semantics (copy-on-assign).** `hold b = a` copies the array; mutating `b` never affects `a`. Consistent with how every other Parithi value already behaves — a beginner never has to learn "some values alias, some don't." Cost: every assignment/pass-to-function of an array is an O(n) copy — fine at v1.0's scale, and matches the "small, teachable implementation" goal more than a performance one.

**Option B — Reference semantics (shared, like JS/Python).** `hold b = a` makes `b` and `a` the same underlying array; mutating one mutates both. Familiar to anyone who's used another language next, and it's what makes passing a large list into a function cheap. Cost: introduces the first "spooky action at a distance" in Parithi — a `task` that mutates a parameter array silently changes the caller's variable, which cuts against the language's "predictable, reads like English" pillar.

**Recommendation:** Option A (value semantics), for consistency with every existing type and with the beginner-first philosophy — but this is squarely a language-design call, not an implementation detail, so it's listed here rather than assumed.

## 3. Indexing — 0-based or 1-based?

`repeat N as i` deliberately starts its counter at **1**, specifically because it reads more naturally to a first-time programmer (§2, correction #4). The same argument applies to array indexing: 1-based (`<ARR>[1]` is the first element) is more consistent with that existing precedent than the 0-based convention nearly every mainstream language uses.

**Recommendation:** 1-based, for internal consistency with `repeat`'s own precedent — but note this is the one choice most likely to surprise someone who already knows another language. Your call.

## 4. Literal and access syntax

Two syntax questions, independent of the keyword itself:

**Literal construction** — two shapes fit Parithi's existing grammar differently:
- *Bracket literal:* `hold nums = [1, 2, 3]`. Immediately familiar, but `[` `]` would be Parithi's *first* new symbol category — every existing construct uses only `(` `)`, `,`, `.`, and word operators. This is a real tension with "no unnecessary symbols" (§6).
- *Keyword-call literal:* `hold nums = <ARR>(1, 2, 3)` — reuses the exact grammar Parithi already has for function calls (`round(...)`, `text(...)`), zero new symbols.

**Element access** — same fork: `nums[1]` (bracket indexing, universally recognized) vs. a built-in-function style `get(nums, 1)` / `item(nums, 1)` (zero new grammar, but noticeably more verbose for something used constantly).

**Recommendation:** if minimizing new grammar surface matters as much as it has at every prior phase, the keyword-call literal + a `get`/`set`-style built-in avoids introducing brackets at all. If readability at the call site matters more, bracket indexing is worth the one new symbol. Both are workable; this document doesn't assume which the language should prefer.

## 5. Element typing — homogeneous or mixed?

Parithi's static type system infers a variable's type once and locks it (§14.4). The same principle extended to array *elements* would mean an array's element type is inferred from its first element and enforced on every later `push`/assignment (`P002` on a mismatch) — consistent with the rest of the type system, and it means `type(nums)` can meaningfully report something like `"<ARR> of Number"`.

The alternative — elements of any type, checked only at runtime — is more flexible but is the first place Parithi would allow a value whose shape isn't knowable from the source text alone, which cuts against "strong compile-time error checking" (§6).

**Recommendation:** homogeneous, type-locked on first element, for the same reason Option A was recommended in §2 — it's the choice that requires learning nothing new about how the rest of the language already works.

## 6. Operations and "methods"

Parithi has no member-access (`.`) syntax anywhere in the grammar today. Adding `list.push(x)`-style methods would mean introducing an entirely new grammar category (a dot operator, method resolution) for this one feature. The built-in-function style Parithi already uses for everything else avoids that entirely:

| Operation | Proposed form | Notes |
|---|---|---|
| Length | `len(<ARR-value>)` | Reuses the existing `len()` built-in (§16.5) rather than adding a new one — `len()` already accepts one argument and returns a Number; extending it to accept an array is additive, not a new symbol. |
| Append | `push(<ARR-value>, item)` | New built-in. Returns the array (value semantics) or `empty` (reference semantics) — depends on §2's resolution. |
| Remove at index | `remove(<ARR-value>, index)` | New built-in. Runtime error if index is out of bounds (§7). |
| Membership | `contains(<ARR-value>, item)` | New built-in, returns Boolean. |
| Position | `indexOf(<ARR-value>, item)` | New built-in, returns Number (or a documented sentinel — needs a decision: `-1` like C-family languages, or `empty` matching Parithi's "Empty means absence" convention — the latter fits Parithi's own idioms better). |

No dot-syntax, no new grammar category beyond the array literal and indexing themselves.

## 7. Runtime behavior and error handling

- **Out-of-bounds access** (`<ARR-value>[99]` on a 3-element array) is not statically knowable from source text in general (an index computed from user input, a loop variable, etc.) — this is a **runtime-only** failure, structurally identical to P006/P020–P023 (§18's own framing: "these cannot be caught at semantic-analysis time, since they depend on runtime values"). Proposed as a new code, **P024 — Index out of bounds**, continuing the existing sequence.
- **Empty-array edge cases** — `len()` on an empty array is `0`; indexing into an empty array is always P024, never a special case.
- **`say <ARR-value>`** needs a defined text rendering (e.g. `[1, 2, 3]`) added to `stringify()` (`src/interpreter/stringify.js`) and to `RuntimeValue.toString()` (`src/runtime/runtime-value.js`) — currently every renderable type has exactly one canonical text form; arrays need one too, decided alongside the literal syntax in §4.
- **Iteration** — §23.4 already specifies the syntax: `repeat item as x in list`. This is an *extension* of the existing `repeat` keyword (not a new keyword), parsed as a new form of `RepeatStatement` distinguished by the presence of `in <expr>` after the counter name. This slots into work already planned, not something this proposal introduces.

## 8. Changes by layer (once a keyword is chosen)

| Layer | Change |
|---|---|
| **Lexer** (`src/lexer/`) | Add the new keyword to `keywords.js`'s reserved table (25th keyword). If bracket syntax is chosen (§4), add `[`/`]` token types to `token.js`/`lexer.js`; if keyword-call syntax is chosen, no new token types are needed at all. |
| **AST** (`src/ast/`) | New node types: `ArrayLiteral` (`elements: Expression[]`), `IndexExpression` (`target`, `index`). `ast-printer.js` needs a rendering for both, for `pari --ast`. |
| **Parser** (`src/parser/`) | New literal-parsing rule (in `parsePrimary` alongside existing literal handling) and a new postfix-indexing rule (alongside how call-expressions are already parsed as a postfix `(...)` after an identifier) — indexing is naturally the same "postfix operator" tier as a function call, so this fits the existing precedence-climbing structure without disturbing §13.5's table. If `repeat ... in ...` iteration is included, `parseRepeatStatement` gains a second form. |
| **Semantic Analyzer** (`src/semantic/`) | A new `DataType` entry (parameterized by element type, per §5) in `types.js`; `type-checker.js` needs element-type inference and homogeneity checking on literals/pushes; a new symbol-table concern for what `<ARR> of Number` should print in `pari --analyze`'s symbol tables. |
| **Interpreter** (`src/interpreter/`) | `visitArrayLiteral`, `visitIndexExpression` (throwing P024 on out-of-bounds); new built-ins `push`/`remove`/`contains`/`indexOf` registered exactly like the existing six (`interpreter/builtins/`); `len()`'s implementation extended to accept an array argument. |
| **Runtime** (`src/runtime/`) | A new `ListValue` class in `runtime-value.js` (wraps a JS array of already-wrapped `RuntimeValue`s), updates to `wrap()`/`unwrap()`; if value semantics (§2 Option A) is chosen, `ListValue.copy()` needs to be a *real* deep copy for the first time — every other type's `copy()` is currently a documented no-op precisely because nothing needed a real one until now. |
| **Errors** (`src/errors/`) | New code `P024` in `error-codes.js`'s registry, phase `Interpretation`. |

## 9. Testing requirements

Mirrors the existing per-phase suite structure exactly:

- **Lexer** (if brackets chosen): token tests for `[`/`]`.
- **Parser**: AST-shape tests for array literals, indexing, and (if included) `repeat item as x in list`.
- **Semantic**: type inference/locking on array literals, homogeneity mismatch → P002, `repeat ... in` binds the correct element type to its loop variable.
- **Interpreter**: literal evaluation, indexing (valid and out-of-bounds → P024), each new built-in's happy/error paths, and — critically — a test that pins down whichever semantics §2 resolves to (either "mutating a copy never affects the original" or "mutating a shared reference does," proven with an explicit `hold b = a; push(b, x); say a` program).
- **Runtime**: `ListValue` wrap/unwrap round-trip, leak-proofing for `repeat ... in` (a fresh child scope per iteration, exactly like existing `repeat`/`while`).
- **E2E**: at least one realistic example program (e.g., a running total over a list of grades) added to `examples/`, matching the pattern every other §20 example already follows.
- **CLI**: `pari --ast`/`--tokens`/`--analyze` regression coverage for the new node/token types, following the existing `tests/cli.test.js` pattern.

---

## Open questions, summarized

1. **The keyword itself — required before any of this can be implemented.**
2. Value semantics (recommended) vs. reference semantics for assignment/mutation (§2).
3. 1-based (recommended, matches `repeat`) vs. 0-based indexing (§3).
4. Bracket literal/indexing vs. keyword-call-style construction and `get`/`set` access (§4).
5. Homogeneous, type-locked elements (recommended) vs. mixed-type elements (§5).

**Question 1 is the one this document was specifically asked to stop on: what keyword should represent arrays?** Once you answer, questions 2–5 default to the recommendations above unless you say otherwise, and implementation can begin.

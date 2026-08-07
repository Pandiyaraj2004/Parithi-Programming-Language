/**
 * Pass E — Unreachable Code Elimination (§4E of the IR-optimizer brief).
 * Removes whole BASIC BLOCKS that no control-flow path from the
 * function's entry block can ever reach — e.g. `ir-generator.js`
 * deliberately keeps generating into a fresh, disconnected block for any
 * source code textually following a `return`/`break`/`continue` (see its
 * own `ensureOpenBlock()`), specifically so this pass has real,
 * well-defined work to do: `return 10\nprint("unreachable")` compiles to
 * a `print` living in exactly such a block, with no predecessor.
 *
 * Implementation: a plain reachability walk (BFS) over the CFG starting
 * at `blocks[0]` (the entry block), following `JUMP`/`BRANCH` targets —
 * `RETURN` has no successors. Every block never visited is deleted.
 * Deliberately NOT a general control-flow simplifier (no branch-folding,
 * no block-merging) — per this phase's own "avoid aggressive
 * control-flow transformations in the first implementation."
 */

function reachableLabels(fn) {
  const blockByLabel = new Map(fn.blocks.map((b) => [b.label, b]));
  const visited = new Set();
  const queue = fn.blocks.length ? [fn.blocks[0].label] : [];

  while (queue.length) {
    const label = queue.shift();
    if (visited.has(label)) continue;
    visited.add(label);
    const block = blockByLabel.get(label);
    if (!block) continue; // a jump to a nonexistent label would be a generator bug, not something this pass should crash on
    const { terminator } = block;
    if (terminator.kind === 'JUMP') queue.push(terminator.target);
    else if (terminator.kind === 'BRANCH') queue.push(terminator.trueTarget, terminator.falseTarget);
    // RETURN / NONE: no successors
  }
  return visited;
}

/** @returns {{ unreachableCodeElimination: number }} count of whole blocks removed */
export function unreachableCodeElimination(program) {
  let removed = 0;
  for (const fn of program.functions) {
    const reachable = reachableLabels(fn);
    const before = fn.blocks.length;
    fn.blocks = fn.blocks.filter((block) => reachable.has(block.label));
    removed += before - fn.blocks.length;
  }
  return { unreachableCodeElimination: removed };
}

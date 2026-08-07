/**
 * Pass B — Constant Propagation (§4B of the IR-optimizer brief).
 * Replaces every READ of a variable with its value directly, wherever
 * that variable is written to a compile-time-known constant exactly ONCE
 * across its entire (already-unique, per ir-generator.js's mangling)
 * lifetime.
 *
 * SAFETY — "only propagate when semantically safe" (§4B): a variable
 * assigned more than once (a loop counter, a variable reassigned in an
 * `if`/`else` branch, etc.) is never propagated — its value genuinely
 * varies, so substituting a single constant would change the program's
 * behavior. This is single-assignment analysis, not a `hold`-vs-`const`
 * check (the AST-level distinction no longer exists once lowered to IR,
 * and single-assignment is a strictly safe superset of it) — the exact
 * same reasoning `src/optimizer/passes/constant-propagation.js` (the
 * Bytecode Optimizer) already uses for the same problem.
 *
 * Runs by design AFTER Constant Folding in the default pipeline: folding
 * turns `hold x = 10 + 20`'s `STORE x, t2` into a store of a literal
 * `CONST` value first, which is exactly what lets THIS pass recognize `x`
 * as propagatable.
 */

import { IrOp } from '../ir-nodes.js';

/** Every STORE target across the whole program, and how many times each was written, and — for those written exactly once — what constant value (if any) it was written with. */
function collectSingleAssignmentConstants(program) {
  const storeCounts = new Map(); // varName -> count
  const storedConstant = new Map(); // varName -> const operand (only meaningful if storeCounts.get(name) === 1)

  for (const fn of program.functions) {
    for (const block of fn.blocks) {
      const knownConstants = new Map(); // tempId -> const operand, block-local (temps never cross blocks — see ir-generator.js)
      for (const instr of block.instructions) {
        if (instr.op === IrOp.CONST && instr.dest?.kind === 'temp') {
          knownConstants.set(instr.dest.id, instr.args[0]);
        }
        if (instr.op === IrOp.STORE) {
          const [target, value] = instr.args;
          const name = target.name;
          storeCounts.set(name, (storeCounts.get(name) ?? 0) + 1);
          const resolved = value.kind === 'const' ? value : (value.kind === 'temp' ? knownConstants.get(value.id) : undefined);
          if (resolved) storedConstant.set(name, resolved);
          else storedConstant.delete(name); // a non-constant (or unresolvable) write disqualifies this name even if an earlier write looked constant
        }
      }
    }
  }

  const propagatable = new Map();
  for (const [name, count] of storeCounts) {
    if (count === 1 && storedConstant.has(name)) propagatable.set(name, storedConstant.get(name));
  }
  return propagatable;
}

function replaceIfPropagatable(operand, propagatable) {
  if (operand?.kind === 'var' && propagatable.has(operand.name)) return propagatable.get(operand.name);
  return operand;
}

/** @returns {{ constantPropagation: number }} count of variable reads replaced */
export function constantPropagation(program) {
  const propagatable = collectSingleAssignmentConstants(program);
  const stats = { constantPropagation: 0 };
  if (propagatable.size === 0) return stats;

  for (const fn of program.functions) {
    for (const block of fn.blocks) {
      for (const instr of block.instructions) {
        // Never rewrite a STORE's own target (args[0]) — only its value operand(s) — a write is not a read.
        const startIndex = instr.op === IrOp.STORE ? 1 : 0;
        for (let i = startIndex; i < instr.args.length; i++) {
          const replaced = replaceIfPropagatable(instr.args[i], propagatable);
          if (replaced !== instr.args[i]) {
            instr.args[i] = replaced;
            stats.constantPropagation++;
          }
        }
      }
      if (block.terminator.kind === 'BRANCH') {
        const replaced = replaceIfPropagatable(block.terminator.condition, propagatable);
        if (replaced !== block.terminator.condition) {
          block.terminator.condition = replaced;
          stats.constantPropagation++;
        }
      } else if (block.terminator.kind === 'RETURN' && block.terminator.value) {
        const replaced = replaceIfPropagatable(block.terminator.value, propagatable);
        if (replaced !== block.terminator.value) {
          block.terminator.value = replaced;
          stats.constantPropagation++;
        }
      }
    }
  }
  return stats;
}

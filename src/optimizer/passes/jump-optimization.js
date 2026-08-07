/**
 * JumpOptimization (Phase 12, §31, Pass 4). Two rewrites, both provably
 * behavior-preserving because an unconditional `JMP` has zero stack effect
 * (§29.3) — hopping through or skipping one changes nothing observable:
 *
 * 1. **Jump-to-jump chain collapsing.** If a jump's target instruction is
 *    itself an unconditional `JMP`, redirect straight to *that* jump's own
 *    target, following the chain transitively (with cycle protection for
 *    a pathological hand-built `JMP A -> JMP B -> JMP A`):
 *
 *      JMP L1          JMP L2
 *      L1: JMP L2  ->  L1: JMP L2   (L1 becomes unreachable, cleaned up by
 *                                    DeadCodeElimination, which already ran
 *                                    — this pass runs after it)
 *
 *    Applies to *any* jump's target (`JMP`/`JMP_IF_TRUE`/`JMP_IF_FALSE` may
 *    all be the one doing the redirecting) — only the *target instruction*
 *    itself must be an unconditional `JMP` for the chain to be safe to
 *    skip through, since a conditional jump's target still has a
 *    condition attached to it that can't simply be bypassed.
 *
 * 2. **Jump-to-next-instruction removal.** If an unconditional `JMP`'s
 *    (already chain-collapsed) target is exactly the instruction right
 *    after it, the jump is a pure no-op — falling through gets there
 *    anyway. Deleted outright. Conditional jumps are deliberately **not**
 *    touched here even when their target is the next instruction: they
 *    must still pop the tested value off the operand stack, so simply
 *    deleting one would leave that value stranded — turning it into an
 *    unconditional `POP` instead would be a *correct* micro-optimization
 *    but a materially different one from "remove the jump," and isn't
 *    attempted by this pass.
 */

import { Opcode } from '../../bytecode/opcode.js';
import { Instruction } from '../../bytecode/instruction.js';
import { remapProgram } from '../program-utils.js';

export const name = 'JumpOptimization';

const JUMP_OPCODES = new Set([Opcode.JMP, Opcode.JMP_IF_TRUE, Opcode.JMP_IF_FALSE]);

function followChain(instructions, target, guard) {
  if (guard.has(target)) return target; // cyclic chain — stop rather than loop forever
  const targetInstruction = instructions[target];
  if (!targetInstruction || targetInstruction.opcode !== Opcode.JMP) return target;
  guard.add(target);
  return followChain(instructions, targetInstruction.operands[0], guard);
}

export function run(program) {
  const { instructions, constants, functions } = program;
  let changed = false;

  const chainCollapsed = instructions.map((instruction) => {
    if (!JUMP_OPCODES.has(instruction.opcode)) return instruction;
    const finalTarget = followChain(instructions, instruction.operands[0], new Set());
    if (finalTarget === instruction.operands[0]) return instruction;
    changed = true;
    return new Instruction(instruction.opcode, [finalTarget, ...instruction.operands.slice(1)], instruction.line, instruction.column);
  });

  const keep = chainCollapsed.map((instruction, index) => {
    const isJumpToNext = instruction.opcode === Opcode.JMP && instruction.operands[0] === index + 1;
    if (isJumpToNext) changed = true;
    return !isJumpToNext;
  });

  if (!changed) return program;
  return remapProgram({ instructions: chainCollapsed, constants, functions }, keep);
}

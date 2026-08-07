/**
 * IR pretty-printer — `pari --native --emit-ir` / `--emit-optimized-ir`
 * (§8 of the IR brief). Pure formatting only; never consulted by the
 * generator, optimizer, or codegen for any decision.
 */

function formatOperand(operand) {
  switch (operand.kind) {
    case 'temp': return `t${operand.id}`;
    case 'var': return operand.name;
    case 'const':
      if (operand.valueType === 'String') return JSON.stringify(operand.value);
      if (operand.valueType === 'Empty') return 'empty';
      return String(operand.value);
    default:
      return String(operand);
  }
}

function formatInstruction(instr) {
  const args = instr.args.map(formatOperand).join(', ');
  if (instr.dest) return `${formatOperand(instr.dest)} = ${instr.op} ${args}`;
  return `${instr.op} ${args}`;
}

function formatTerminator(terminator) {
  switch (terminator.kind) {
    case 'JUMP': return `GOTO ${terminator.target}`;
    case 'BRANCH': return `IF ${formatOperand(terminator.condition)} GOTO ${terminator.trueTarget} ELSE GOTO ${terminator.falseTarget}`;
    case 'RETURN': return `RETURN ${formatOperand(terminator.value)}`;
    case 'NONE': return '(no terminator — malformed IR)';
    default: return `(unknown terminator "${terminator.kind}")`;
  }
}

function formatFunction(fn) {
  const lines = [`function ${fn.name}(${fn.params.join(', ')}):`];
  for (const block of fn.blocks) {
    lines.push(`${block.label}:`);
    for (const instr of block.instructions) lines.push(`    ${formatInstruction(instr)}`);
    lines.push(`    ${formatTerminator(block.terminator)}`);
  }
  return lines.join('\n');
}

export function formatIR(irProgram) {
  return irProgram.functions.map(formatFunction).join('\n\n');
}

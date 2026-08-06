/**
 * Minimal ANSI color helper — zero dependencies, matching the "no external
 * CLI library" decision in MASTER_DOCUMENT.md §21. Colors are skipped
 * automatically when stdout isn't a TTY (e.g. piped or redirected output).
 */

const enabled = Boolean(process.stdout.isTTY);

function wrap(code) {
  return (text) => (enabled ? `\x1b[${code}m${text}\x1b[0m` : String(text));
}

export const colors = {
  bold: wrap(1),
  dim: wrap(2),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  cyan: wrap(36),
};

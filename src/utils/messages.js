/**
 * Formats CompilerError / ParithiRuntimeError instances for terminal output,
 * matching the error presentation style shown in MASTER_DOCUMENT.md §18.
 */

import { colors } from './colors.js';

export function printError(error) {
  if (typeof error.format === 'function') {
    console.error(colors.red(error.format()));
  } else {
    console.error(colors.red(`Error: ${error.message}`));
  }
}

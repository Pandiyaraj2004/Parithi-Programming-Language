/**
 * Shared logging utility for the CLI.
 * Centralizes error formatting so every command prints consistently.
 */

import { colors } from './colors.js';

export const logger = {
  error(message) {
    console.error(`${colors.red('error')} ${message}`);
  },
};

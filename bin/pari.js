#!/usr/bin/env node

import { runCli } from '../src/cli/commands.js';

runCli(process.argv.slice(2));

#!/usr/bin/env node
import { processIo } from './io';
import { main } from './main';

process.exitCode = await main(process.argv.slice(2), processIo());

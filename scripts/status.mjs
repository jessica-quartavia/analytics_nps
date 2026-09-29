#!/usr/bin/env node
import { runHealthcheck, formatStatusShort } from '../lib/ops/healthcheck-core.mjs';

const result = runHealthcheck();
console.log(formatStatusShort(result));
process.exit(result.ok ? 0 : 1);

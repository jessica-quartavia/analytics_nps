#!/usr/bin/env node
import { runHealthcheck, formatHealthcheckReport } from '../lib/ops/healthcheck-core.mjs';

const result = runHealthcheck();
console.log(formatHealthcheckReport(result));
process.exit(result.ok ? 0 : 1);

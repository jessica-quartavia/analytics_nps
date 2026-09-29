import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const partials = join(dirname(fileURLToPath(import.meta.url)), '../data/ingest/partials');
mkdirSync(partials, { recursive: true });

function extractData(agentPath) {
  let raw = readFileSync(agentPath, 'utf8').trim();
  if (raw.startsWith('{')) {
    try {
      const outer = JSON.parse(raw);
      if (typeof outer.result === 'string') raw = outer.result;
    } catch {
      // fall through
    }
  }
  const openTag = raw.indexOf('<untrusted-data-');
  let inner = raw;
  if (openTag >= 0) {
    const closeTag = raw.indexOf('</untrusted-data-', openTag);
    const startArray = raw.indexOf('[', openTag);
    const endArray = closeTag >= 0 ? raw.lastIndexOf(']', closeTag) : raw.lastIndexOf(']');
    if (startArray >= 0 && endArray > startArray) {
      inner = raw.slice(startArray, endArray + 1);
    }
  }
  const rows = JSON.parse(inner);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (row?.data) return row.data;
  if (row?.bundle) return row.bundle;
  throw new Error(`no data in MCP export ${agentPath}`);
}

const [, , agentPath, outName] = process.argv;
const parsed = extractData(agentPath);
if (outName === '__bundle__' && parsed.engenheiros_patrimoniais) {
  writeFileSync(join(partials, 'engenheiros_patrimoniais.json'), `${JSON.stringify(parsed.engenheiros_patrimoniais)}\n`);
  writeFileSync(join(partials, 'client_journeys.json'), `${JSON.stringify(parsed.client_journeys)}\n`);
  writeFileSync(join(partials, 'engenheiro_transfer_logs.json'), `${JSON.stringify(parsed.engenheiro_transfer_logs)}\n`);
  console.log(JSON.stringify({
    ok: true,
    eps: parsed.engenheiros_patrimoniais.length,
    journeys: parsed.client_journeys.length,
    logs: parsed.engenheiro_transfer_logs.length,
  }));
} else {
  const data = parsed;
  writeFileSync(join(partials, outName), `${JSON.stringify(data)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, outName, rows: data.length }));
}

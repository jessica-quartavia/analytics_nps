import { aggregateSystemLogs } from './system-logs-aggregator.mjs';

export async function executeSystemLogsRequest({ env = process.env } = {}) {
  const { events, warnings, sources } = await aggregateSystemLogs(env);
  return {
    status: 200,
    body: {
      ok: true,
      events,
      count: events.length,
      warnings,
      sources,
    },
  };
}

export async function handleSystemLogsVercel(req, res) {
  const out = await executeSystemLogsRequest({ env: process.env });
  if (typeof res.status === 'function') {
    res.status(out.status).json(out.body);
    return;
  }
  res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(out.body));
}

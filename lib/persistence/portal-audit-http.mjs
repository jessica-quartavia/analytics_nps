import { appendPortalAuditEvent } from './portal-audit-log.mjs';
import { aggregateSystemLogs } from './system-logs-aggregator.mjs';
import { resolveReviewerIdentity } from '../auth/dashboard-session-audit.mjs';

export async function executePortalAuditHttpRequest(input) {
  const method = input.method ?? 'GET';
  const env = input.env ?? process.env;

  if (method === 'GET') {
    const { events, warnings, sources } = await aggregateSystemLogs(env);
    return {
      status: 200,
      body: { ok: true, events, count: events.length, warnings, sources },
    };
  }

  if (method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'Method not allowed' } };
  }

  const identity = await resolveReviewerIdentity(input.authorization, env, {
    email: input.body?._dashboard_reviewer_email,
    name: input.body?._dashboard_reviewer_name,
  });

  const body = input.body ?? {};
  const row = appendPortalAuditEvent({
    ...body,
    email: body.email ?? identity.email ?? null,
    name: body.name ?? identity.name ?? null,
  });
  return { status: 200, body: { ok: true, event: row } };
}

export async function handlePortalAuditVercel(req, res) {
  let body = req.body;
  if (body == null && typeof req.on === 'function') {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch {
          resolve({});
        }
      });
    });
  }
  const auth = req.headers?.authorization ?? req.headers?.Authorization;
  const out = await executePortalAuditHttpRequest({
    method: req.method,
    authorization: auth,
    body,
    env: process.env,
  });
  if (typeof res.status === 'function') {
    res.status(out.status).json(out.body);
    return;
  }
  res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(out.body));
}

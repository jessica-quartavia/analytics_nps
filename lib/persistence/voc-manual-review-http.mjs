import { createBusinessDataAdminClient } from './voc-supabase-store.mjs';
import { resolveReviewerIdentity, isLocalDevReviewBypass } from '../auth/dashboard-session-audit.mjs';
import { saveManualReview, manualReviewToTopicRows } from './voc-manual-review.mjs';
import { appendPortalAuditEvent } from './portal-audit-log.mjs';
import { insertSystemAuditEvent } from './system-audit-log.mjs';

const POST_ERRORS = {
  missing_token: 'Não foi possível salvar a revisão. Recarregue a página e tente novamente.',
  invalid_session: 'Não foi possível salvar a revisão. Recarregue a página e tente novamente.',
  auth_client_not_configured:
    'Servidor de revisão indisponível (configuração de auth). Contate o time de dados.',
};

export async function executeVocManualReviewHttpRequest(input) {
  if (input.method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'Method not allowed' } };
  }

  const body = input.body ?? {};
  const devFallback = {
    email: body._dashboard_reviewer_email ?? body.reviewer_email_hint ?? null,
    name: body._dashboard_reviewer_name ?? null,
    user_id: body._dashboard_reviewer_user_id ?? null,
  };

  const identity = await resolveReviewerIdentity(input.authorization, input.env, devFallback);
  if (!identity.ok) {
    const friendly = POST_ERRORS[identity.code] ?? 'Não foi possível salvar a revisão.';
    return {
      status: 401,
      body: { ok: false, error: friendly, code: identity.code },
    };
  }

  let supabase;
  try {
    supabase = createBusinessDataAdminClient(input.env);
  } catch (err) {
    if (isLocalDevReviewBypass(input.env)) {
      return {
        status: 503,
        body: {
          ok: false,
          error:
            'Banco indisponível no ambiente local. Configure Supabase ou use deploy para persistir revisões.',
          code: 'database_unavailable',
        },
      };
    }
    return {
      status: 503,
      body: { ok: false, error: err.message ?? 'Persistência indisponível', code: 'database_unavailable' },
    };
  }

  try {
    const saved = await saveManualReview(supabase, {
      ...body,
      reviewer_email: identity.email,
      reviewer_name: body.reviewer_name ?? identity.name,
      reviewer_user_id: identity.user_id,
    });
    const topicRows = manualReviewToTopicRows(saved, {
      client_id: body.client_id,
      analytical_cycle_code: body.analytical_cycle_code,
    });
    const topics = body.reviewed_topics ?? body.topics ?? [];
    const summaryTopics = Array.isArray(topics)
      ? topics.map((t) => `${t.topic}: ${t.valence}`).join('; ')
      : 'Classificação VoC revisada';
    const auditPayload = {
      action_type: 'voc_reviewed',
      user_email: identity.email,
      user_name: identity.name,
      entity_type: 'voc_response',
      entity_id: body.response_id ?? null,
      client_id: body.client_id,
      client_name: body.client_name,
      cycle_code: body.analytical_cycle_code ?? body.cycle_code,
      page: body.origin ?? 'plano-de-acao',
      summary: summaryTopics || body.review_notes || 'VoC revisado',
      before: body.previous_topics_snapshot ?? null,
      after: { topics, notes: body.review_notes ?? null },
      metadata: { review_id: saved?.id ?? null },
    };
    await insertSystemAuditEvent(supabase, auditPayload);
    appendPortalAuditEvent({
      ...auditPayload,
      email: identity.email,
      name: identity.name,
      origin: auditPayload.page,
    });
    return {
      status: 200,
      body: {
        ok: true,
        review: saved,
        topic_rows: topicRows,
      },
    };
  } catch (err) {
    return {
      status: 400,
      body: { ok: false, error: err.message ?? 'Falha ao salvar revisão' },
    };
  }
}

export async function handleVocManualReviewVercel(req, res) {
  let body = req.body;
  if (body == null && typeof req.on === 'function') {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    }).catch(() => ({}));
  }
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const auth = req.headers?.authorization ?? req.headers?.Authorization;
  const out = await executeVocManualReviewHttpRequest({
    method: req.method,
    authorization: auth,
    body,
    env: process.env,
  });

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(out.status).json(out.body);
    return;
  }
  res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(out.body));
}

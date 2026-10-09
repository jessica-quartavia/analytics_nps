import { formatDate } from '../utils/format.js';

/** @returns {{ email: string, at: string|null, label: string } | null} */
export function getLastModification(row) {
  const candidates = [];

  const plan = row?.plan;
  if (plan?.updated_at || plan?.updated_by) {
    candidates.push({
      at: plan.updated_at ?? null,
      email: plan.updated_by ?? '—',
      label: 'Plano de ação',
    });
  }

  const pr = row?.priority_review;
  if (pr?.reviewed_at || pr?.reviewed_by) {
    candidates.push({
      at: pr.reviewed_at ?? null,
      email: pr.reviewed_by ?? pr.reviewed_by_email ?? '—',
      label: 'Prioridade',
    });
  }

  for (const t of row?.topics ?? []) {
    if (t.reviewed_at || t.reviewed_by_email) {
      candidates.push({
        at: t.reviewed_at ?? null,
        email: t.reviewed_by_email ?? t.reviewed_by_name ?? '—',
        label: 'VoC',
      });
    }
  }

  for (const h of row?.history ?? []) {
    const at = h.at ?? h.changed_at;
    const by = h.by ?? h.changed_by;
    if (at || by) {
      candidates.push({ at: at ?? null, email: by ?? '—', label: 'Histórico' });
    }
  }

  candidates.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  return candidates[0] ?? null;
}

export function renderAuditMetaHtml(row, { compact = false } = {}) {
  const last = getLastModification(row);
  const email = last?.email ?? '—';
  const when = last?.at ? formatDate(last.at) : '—';
  if (compact) {
    return `<p class="op-audit-meta"><span>Última modificação por:</span> <strong>${escape(email)}</strong> · <span>em:</span> <strong>${escape(when)}</strong></p>`;
  }
  return `<dl class="op-audit-dl">
    <div><dt>Última modificação por</dt><dd>${escape(email)}</dd></div>
    <div><dt>Última modificação em</dt><dd>${escape(when)}</dd></div>
  </dl>`;
}

function escape(s) {
  return String(s ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function planOriginDisplay(plan) {
  const o = plan?.plan_origin ?? plan?.plan_source;
  if (o === 'gemini' || o === 'ai_suggested') return 'Gemini';
  if (o === 'fallback') return 'Fallback';
  if (o === 'ai_revised') return 'IA revisada manualmente';
  return 'Manual';
}

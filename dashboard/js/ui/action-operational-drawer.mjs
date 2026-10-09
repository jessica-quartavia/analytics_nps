import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatDate } from '../utils/format.js';
import { openVocReviewModal, showVocSaveToast } from './voc-review-modal.mjs';
import { openActionPriorityReviewModal } from './action-priority-review-modal.mjs';
import { openActionPlanModal } from './action-plan-modal.mjs';
import { exportActionPlanPdf } from './action-plan-pdf.mjs';
import { logPortalAuditEvent } from './action-plan-api.mjs';
import { getResponseById, loadAnalyticsData } from '../data/analytics-store.js';
import { cell, resolveActionPriority, resolveRowProgram, hasActionProposal } from './action-display-helpers.mjs';
import { renderAuditMetaHtml } from './action-audit-helpers.mjs';
import { ACTION_PLAN_AI_ENABLED } from './action-operational-config.mjs';

function priorityPill(p) {
  const label = cell(p, '—');
  const cls = label === 'Crítica' ? 'priority-pill--critica' : `priority-pill--${escapeAttr(label)}`;
  return `<span class="priority-pill ${cls}">${escapeHtml(label)}</span>`;
}

const HISTORY_LABELS = {
  priority_changed: 'Prioridade revisada',
  priority_review: 'Prioridade revisada',
  plan_created: 'Plano criado',
  plan_updated: 'Plano editado',
  plan_update: 'Plano editado',
  action_plan_created: 'Plano criado',
  action_plan_updated: 'Plano editado',
  ai_classification: 'Classificação',
  voc_reviewed: 'VoC revisado',
  legacy_import: 'Importação',
};

function vocSourceLabel(t) {
  if (t.classifier_source === 'human_review' || t.reviewed) return 'Revisão humana';
  if (t.classifier_source === 'gemini') return 'Gemini';
  return 'Fallback';
}

function renderHistoryTimeline(row) {
  const items = [];
  for (const h of row.history ?? []) {
    items.push({
      at: h.at ?? h.changed_at,
      by: h.by ?? h.changed_by ?? '—',
      type: h.type ?? h.change_type,
      detail: h.snapshot?.priority_review?.review_reason ?? h.snapshot?.plan?.action_text?.slice(0, 80) ?? '',
    });
  }
  if (row.priority_review?.reviewed_at) {
    items.push({
      at: row.priority_review.reviewed_at,
      by: row.priority_review.reviewed_by ?? '—',
      type: 'priority_review',
      detail: row.priority_review.review_reason ?? '',
    });
  }
  items.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  const valid = items.filter((it) => it.at || it.detail);
  if (!valid.length) return '<p class="note-muted">Sem histórico registrado.</p>';
  return `<ul class="action-history-timeline">${valid
    .map(
      (it) =>
        `<li><span class="action-history-timeline__date">${escapeHtml(formatDate(it.at) || '—')}</span> · ${escapeHtml(it.by ?? '—')} · <strong>${escapeHtml(HISTORY_LABELS[it.type] ?? it.type)}</strong>${it.detail ? ` — ${escapeHtml(it.detail)}` : ''}</li>`,
    )
    .join('')}</ul>`;
}

export function renderActionOperationalDrawer(row) {
  const topics = row.topics ?? [];
  const displayTopics = topics;
  const finalP = resolveActionPriority(row);
  const program = resolveRowProgram(row);
  const hasPlan = hasActionProposal(row);

  return `
    <header class="drawer__header action-drawer__header">
      <div>
        <h2>${escapeHtml(row.client_name ?? 'Cliente')}</h2>
        <p class="note-muted">${escapeHtml(cell(row.ep_name))} · ${escapeHtml(program)}</p>
      </div>
      <div class="action-drawer__header-actions">
        <button type="button" class="btn btn--secondary btn--sm" id="action-export-pdf-top">Exportar PDF</button>
        <button type="button" class="drawer__close" id="action-drawer-close" aria-label="Fechar">×</button>
      </div>
    </header>
    <div class="drawer__body action-drawer__body">
      <section class="action-drawer-block">
        <h3>Resumo</h3>
        ${renderAuditMetaHtml(row, { compact: true })}
        <dl class="drawer-meta-list">
          <div><dt>Cliente</dt><dd>${escapeHtml(cell(row.client_name))}</dd></div>
          <div><dt>EP</dt><dd>${escapeHtml(cell(row.ep_name))}</dd></div>
          <div><dt>Programa</dt><dd>${escapeHtml(program)}</dd></div>
        </dl>
      </section>
      <section class="action-drawer-block">
        <h3>NPS</h3>
        <ul class="drawer-list">
          <li>Nota atual: ${cell(row.current_score)} (${escapeHtml(cell(row.current_category))})</li>
          <li>Nota anterior: ${cell(row.previous_score)}</li>
          <li>Delta: ${cell(row.score_delta)}</li>
          <li>Migração: ${escapeHtml(cell(row.nps_migration))}</li>
        </ul>
      </section>
      <section class="action-drawer-block">
        <h3>Voz do Cliente</h3>
        <p class="drawer-comment">${escapeHtml(row.comment ?? 'Sem comentário.')}</p>
        <ul class="drawer-list">${displayTopics.map((t) => `<li>${escapeHtml(t.topic)} · ${escapeHtml(t.valence)} <span class="note-muted">(${escapeHtml(vocSourceLabel(t))})</span></li>`).join('') || '<li>Sem temas classificados.</li>'}</ul>
      </section>
      <section class="action-drawer-block">
        <h3>Prioridade</h3>
        <p>Prioridade: ${priorityPill(finalP)}</p>
      </section>
      <section class="action-drawer-block">
        <h3>Histórico</h3>
        ${renderHistoryTimeline(row)}
      </section>
    </div>
    <footer class="action-drawer__actions">
      <p class="action-drawer__actions-title">Ações do caso</p>
      <button type="button" class="btn btn--primary btn--cta" id="action-edit-plan">
        ${hasPlan ? 'Criar/editar plano de ação' : 'Criar/editar plano de ação'}
      </button>
      <button type="button" class="btn btn--secondary" id="action-review-priority">Corrigir prioridade</button>
      <button type="button" class="btn btn--secondary" id="action-fix-voc">Corrigir classificação do VoC</button>
      <button type="button" class="btn btn--ghost" id="action-export-pdf">Exportar plano em PDF</button>
      <button type="button" class="btn btn--ghost btn--disabled" id="action-generate-plan-ai" disabled title="Temporariamente indisponível">
        Gerar plano de ação com IA <span class="nav-badge nav-badge--pill">Em breve</span>
      </button>
    </footer>`;
}

export function bindActionOperationalDrawer(row, drawer, { onRefresh } = {}) {
  const refresh = () => onRefresh?.(row.client_id, row.cycle_code);

  const exportPdf = async () => {
    exportActionPlanPdf(row);
    await logPortalAuditEvent({
      action_type: 'pdf_export',
      client_id: row.client_id,
      client_name: row.client_name,
      cycle_code: row.cycle_code,
      origin: 'plano-de-acao',
      summary: 'Exportação PDF do plano',
    });
  };

  drawer.querySelector('#action-export-pdf-top')?.addEventListener('click', exportPdf);
  drawer.querySelector('#action-export-pdf')?.addEventListener('click', exportPdf);

  drawer.querySelector('#action-edit-plan')?.addEventListener('click', () => {
    openActionPlanModal(row, { mode: 'edit', onSaved: refresh });
  });

  if (ACTION_PLAN_AI_ENABLED) {
    const aiBtn = drawer.querySelector('#action-generate-plan-ai');
    aiBtn?.removeAttribute('disabled');
    aiBtn?.classList.remove('btn--disabled');
    aiBtn?.addEventListener('click', () => openActionPlanModal(row, { mode: 'ai', onSaved: refresh }));
  }

  drawer.querySelector('#action-review-priority')?.addEventListener('click', () => {
    openActionPriorityReviewModal(row, { onSaved: refresh });
  });

  drawer.querySelector('#action-fix-voc')?.addEventListener('click', () => {
    const resp = getResponseById(row.response_id);
    if (!resp) {
      showVocSaveToast('Resposta não encontrada no cache local.');
      return;
    }
    openVocReviewModal(
      { response: resp, topics: row.topics ?? [], cycleCode: row.cycle_code },
      {
        onSaved: async () => {
          showVocSaveToast('VoC atualizado.');
          try {
            await loadAnalyticsData();
          } catch {
            /* mantém drawer */
          }
          refresh();
        },
      },
    );
  });
}

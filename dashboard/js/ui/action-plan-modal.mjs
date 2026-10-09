import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { cell, resolveActionPriority, primaryTheme } from './action-display-helpers.mjs';
import { renderAuditMetaHtml, planOriginDisplay } from './action-audit-helpers.mjs';
import { exportActionPlanPdf } from './action-plan-pdf.mjs';
import { saveActionPlan, suggestActionPlanWithAi, logPortalAuditEvent } from './action-plan-api.mjs';
import { ACTION_PLAN_AI_ENABLED } from './action-operational-config.mjs';

const SPARKLE_SVG = `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1z"/></svg>`;

const FALLBACK_TOOLTIP =
  'Gemini estava indisponível. A sugestão foi gerada automaticamente a partir dos dados do caso.';

function vocSourceLabel(t) {
  if (t.classifier_source === 'human_review' || t.reviewed) return 'Revisão humana';
  if (t.classifier_source === 'gemini') return 'Gemini';
  return 'Fallback';
}

function vocTopicsHtml(row) {
  const topics = row.topics ?? [];
  if (!topics.length) return '<p class="note-muted">Sem temas classificados.</p>';
  return `<ul class="op-voc-topic-list">${topics
    .map(
      (t) =>
        `<li><strong>${escapeHtml(t.topic)}</strong> — ${escapeHtml(t.valence)} <span class="note-muted">(${escapeHtml(vocSourceLabel(t))})</span></li>`,
    )
    .join('')}</ul>`;
}

function getProposalText(row) {
  return row.plan?.action_text ?? row.plan?.action_proposal ?? '';
}

function buildModalShell(row, { actionText = '', sourceBadge = '', aiHint = '' } = {}) {
  const plan = row.plan ?? {};
  const finalP = resolveActionPriority(row);

  return `
    <div class="op-modal__backdrop" data-close="1"></div>
    <div class="op-modal__panel op-modal__panel--wide op-modal__panel--plan" role="dialog" aria-labelledby="action-plan-modal-title">
      <header class="op-modal__head">
        <div>
          <h2 id="action-plan-modal-title">Plano de ação</h2>
          <p class="op-modal__subtitle">${escapeHtml(row.client_name ?? 'Cliente')} · ${escapeHtml(cell(row.cycle_code))}</p>
        </div>
        <button type="button" class="op-modal__close" data-close="1" aria-label="Fechar">×</button>
      </header>
      <div class="op-modal__body">
        <section class="op-modal-block">
          <div class="op-stat-grid op-stat-grid--4">
            <div class="op-stat-card"><span class="op-stat-card__label">Cliente</span><span class="op-stat-card__value">${escapeHtml(cell(row.client_name))}</span></div>
            <div class="op-stat-card"><span class="op-stat-card__label">EP</span><span class="op-stat-card__value">${escapeHtml(cell(row.ep_name))}</span></div>
            <div class="op-stat-card"><span class="op-stat-card__label">Nota atual</span><span class="op-stat-card__value">${cell(row.current_score)}</span></div>
            <div class="op-stat-card"><span class="op-stat-card__label">Nota anterior</span><span class="op-stat-card__value">${cell(row.previous_score)}</span></div>
            <div class="op-stat-card"><span class="op-stat-card__label">Delta</span><span class="op-stat-card__value">${cell(row.score_delta)}</span></div>
            <div class="op-stat-card"><span class="op-stat-card__label">Prioridade</span><span class="op-stat-card__value">${escapeHtml(finalP)}</span></div>
          </div>
        </section>
        <section class="op-modal-block">
          <h3 class="op-modal-block__title">Voz do Cliente</h3>
          <div class="op-evidence-box op-evidence-box--scroll">${escapeHtml(row.comment ?? 'Sem comentário.')}</div>
          ${vocTopicsHtml(row)}
        </section>
        <section class="op-modal-block op-modal-block--form">
          <h3 class="op-modal-block__title">Plano de ação</h3>
          <div id="action-plan-source-badge">${sourceBadge}</div>
          <p class="op-ai-hint" id="action-plan-ai-hint">${escapeHtml(aiHint)}</p>
          <form id="action-plan-modal-form">
            <label class="op-field op-field--full">Ação proposta
              <textarea name="action_proposal" id="action-proposal-field" rows="8" placeholder="Descreva a ação que deverá ser realizada para este cliente.">${escapeHtml(actionText)}</textarea>
            </label>
          </form>
        </section>
        <section class="op-modal-block op-modal-block--muted">
          <h3 class="op-modal-block__title">Auditoria</h3>
          ${renderAuditMetaHtml(row)}
          <dl class="op-audit-dl">
            <div><dt>Origem</dt><dd id="action-plan-origin-label">${escapeHtml(planOriginDisplay(plan))}</dd></div>
          </dl>
        </section>
      </div>
      <footer class="op-modal__foot op-modal__foot--sticky">
        <button type="button" class="btn btn--ghost" data-close="1">Cancelar</button>
        <button type="button" class="btn btn--secondary" id="action-plan-modal-pdf">Exportar PDF</button>
        <button type="submit" form="action-plan-modal-form" class="btn btn--primary">Salvar plano</button>
      </footer>
    </div>`;
}

function fallbackBadgeHtml() {
  return `<span class="badge badge--neutral-soft" title="${escapeAttr(FALLBACK_TOOLTIP)}">Sugestão automática</span>`;
}

/**
 * @param {object} row
 * @param {{ mode?: 'edit'|'ai', onSaved?: Function }} opts
 */
export function openActionPlanModal(row, { mode = 'edit', onSaved } = {}) {
  document.getElementById('action-plan-modal-root')?.remove();
  const shell = document.createElement('div');
  shell.id = 'action-plan-modal-root';
  shell.className = 'op-modal-root';
  shell.innerHTML = buildModalShell(row, {
    actionText: getProposalText(row),
    aiHint: mode === 'ai' ? 'Gerando sugestão…' : '',
  });
  document.body.appendChild(shell);

  const close = () => shell.remove();
  shell.querySelectorAll('[data-close="1"]').forEach((el) => el.addEventListener('click', close));

  let pendingAiSuggestion = null;
  let currentPlanSource = row.plan?.plan_origin ?? 'manual';
  const liveRow = row;

  function rowForPdf() {
    const draft = shell.querySelector('#action-proposal-field')?.value ?? '';
    const plan = { ...(liveRow.plan ?? {}), action_text: draft, plan_origin: currentPlanSource };
    return { ...liveRow, plan };
  }

  async function runAiSuggest() {
    const hint = shell.querySelector('#action-plan-ai-hint');
    const badgeHost = shell.querySelector('#action-plan-source-badge');
    const field = shell.querySelector('#action-proposal-field');
    const originLabel = shell.querySelector('#action-plan-origin-label');
    hint.textContent = 'Gerando sugestão…';
    hint.classList.remove('op-ai-hint--warn');
    badgeHost.innerHTML = '';

    const result = await suggestActionPlanWithAi(liveRow);
    if (!result.ok) {
      hint.textContent = result.message ?? 'Não foi possível gerar sugestão.';
      hint.classList.add('op-ai-hint--warn');
      return;
    }

    pendingAiSuggestion = result.suggestion;
    currentPlanSource = result.plan_source ?? result.suggestion?.plan_source ?? 'fallback';
    field.value = result.suggestion?.action_text ?? '';

    if (result.used_fallback) {
      hint.textContent =
        result.notice ??
        'IA temporariamente indisponível. Geramos uma sugestão automática com base nos dados do caso.';
      hint.classList.add('op-ai-hint--warn');
      badgeHost.innerHTML = fallbackBadgeHtml();
    } else {
      hint.textContent = 'Sugestão gerada — revise e salve.';
      hint.classList.remove('op-ai-hint--warn');
      badgeHost.innerHTML = '<span class="badge badge--method">Gemini</span>';
    }
    originLabel.textContent =
      currentPlanSource === 'gemini'
        ? 'Gemini'
        : currentPlanSource === 'fallback'
          ? 'Fallback'
          : planOriginDisplay({ plan_origin: currentPlanSource });
  }

  if (mode === 'ai' && ACTION_PLAN_AI_ENABLED) runAiSuggest();

  shell.querySelector('#action-plan-modal-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const action_text = shell.querySelector('#action-proposal-field')?.value?.trim() ?? '';
    const hint = shell.querySelector('#action-plan-ai-hint');
    try {
      await saveActionPlan(
        liveRow,
        { action_text, plan_source: currentPlanSource },
        {
          pendingAiSuggestion,
          onSaved: (entry) => {
            onSaved?.(entry);
            close();
          },
        },
      );
    } catch (err) {
      hint.textContent = err.message ?? 'Erro ao salvar';
      hint.classList.add('op-ai-hint--warn');
    }
  });

  shell.querySelector('#action-plan-modal-pdf')?.addEventListener('click', async () => {
    exportActionPlanPdf(rowForPdf());
    await logPortalAuditEvent({
      action_type: 'pdf_export',
      client_id: liveRow.client_id,
      client_name: liveRow.client_name,
      cycle_code: liveRow.cycle_code,
      origin: 'plano-de-acao',
      summary: 'Exportação PDF do plano',
    });
  });
}

export { SPARKLE_SVG };

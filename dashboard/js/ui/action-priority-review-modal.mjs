import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { getAuthSessionUser, getAccessToken } from '../auth/dashboard-auth.mjs';
import { patchLocalActionPlanEntry } from '../data/analytics-store.js';
import { resolveActionPriority } from '../data/action-priority.mjs';
import { showVocSaveToast } from './voc-review-modal.mjs';
import { logPortalAuditEvent } from './action-plan-api.mjs';

const PRIORITY_OPTIONS = ['Crítica', 'Alta', 'Média', 'Baixa'];

function buildPriorityOptions(current) {
  const set = new Set(PRIORITY_OPTIONS);
  if (current && !set.has(current)) set.add(current);
  return [...set];
}

export function openActionPriorityReviewModal(row, { onSaved } = {}) {
  document.getElementById('action-priority-review-modal')?.remove();
  const current = resolveActionPriority(row);
  const options = buildPriorityOptions(current);

  const shell = document.createElement('div');
  shell.id = 'action-priority-review-modal';
  shell.className = 'op-modal-root';
  shell.innerHTML = `
    <div class="op-modal__backdrop" data-close="1"></div>
    <div class="op-modal__panel op-modal__panel--compact" role="dialog" aria-labelledby="apr-title">
      <header class="op-modal__head">
        <div>
          <h2 id="apr-title">Corrigir prioridade</h2>
          <p class="op-modal__subtitle">A classificação foi sugerida automaticamente e pode ser corrigida por você.</p>
        </div>
        <button type="button" class="op-modal__close" data-close="1" aria-label="Fechar">×</button>
      </header>
      <div class="op-modal__body op-modal__body--compact">
        <label class="op-field op-field--full">
          <span class="op-field__label">Prioridade atual</span>
          <select class="select-input" id="apr-priority">
            ${options.map((p) => `<option value="${escapeAttr(p)}" ${current === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
          </select>
        </label>
        <p class="op-form-error" id="apr-error" hidden></p>
      </div>
      <footer class="op-modal__foot">
        <button type="button" class="btn btn--ghost" data-close="1">Cancelar</button>
        <button type="button" class="btn btn--primary" id="apr-save">Salvar prioridade</button>
      </footer>
    </div>`;
  document.body.appendChild(shell);
  const close = () => shell.remove();
  shell.querySelectorAll('[data-close="1"]').forEach((el) => el.addEventListener('click', close));

  const previousPriority = current;

  shell.querySelector('#apr-save')?.addEventListener('click', async () => {
    const err = shell.querySelector('#apr-error');
    err.hidden = true;
    const user = getAuthSessionUser();
    const token = await getAccessToken();
    const human_priority = shell.querySelector('#apr-priority')?.value;
    const body = {
      action: 'priority_review',
      client_id: row.client_id,
      response_id: row.response_id,
      cycle_code: row.cycle_code,
      client_name: row.client_name,
      human_priority,
      previous_priority: previousPriority,
      previous_ai_priority: row.ai_priority ?? previousPriority,
      origin: 'plano-de-acao',
      _dashboard_reviewer_email: user?.email,
      _dashboard_reviewer_name: user?.name,
    };
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/action-operational/plans', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? json.error ?? 'Falha ao salvar');
      patchLocalActionPlanEntry(json.entry);
      await logPortalAuditEvent({
        action_type: 'priority_updated',
        client_id: row.client_id,
        client_name: row.client_name,
        cycle_code: row.cycle_code,
        origin: 'plano-de-acao',
        summary: `${previousPriority} → ${human_priority}`,
        before: { priority: previousPriority },
        after: { priority: human_priority },
      });
      close();
      showVocSaveToast('Prioridade salva.');
      onSaved?.(json.entry);
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message ?? 'Erro ao salvar';
    }
  });
}

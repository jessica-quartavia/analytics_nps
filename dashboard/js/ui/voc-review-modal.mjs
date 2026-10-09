import { escapeHtml, escapeAttr } from '../utils/escape-html.js';

const OFFICIAL_TOPICS = [
  'Atendimento / relacionamento',
  'Engenheiro Patrimonial',
  'Clareza / comunicação',
  'Proatividade',
  'Resultados',
  'Oportunidades',
  'Plano patrimonial',
  'Agilidade',
  'Confiança',
  'Tecnologia / plataforma',
  'Expectativa',
  'Valor percebido',
];
import { getAccessToken, getAuthSessionUser } from '../auth/dashboard-auth.mjs';
import { replaceResponseTopicRows } from '../data/analytics-store.js';

const VALENCES = ['Positiva', 'Neutra', 'Negativa'];

export function showVocSaveToast(message = 'Revisão salva com sucesso.') {
  const el = document.createElement('div');
  el.className = 'voc-save-toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

function sortTopics(selectedMap) {
  const selected = OFFICIAL_TOPICS.filter((t) => selectedMap.has(t));
  const rest = OFFICIAL_TOPICS.filter((t) => !selectedMap.has(t));
  return [...selected, ...rest];
}

function topicEditorRow(topic, valence, selected) {
  const checked = selected ? 'checked' : '';
  const seg = VALENCES.map(
    (v) =>
      `<button type="button" class="voc-review-segment__btn${v === valence && selected ? ' is-active' : ''}" data-valence="${v}" data-topic="${escapeAttr(topic)}" ${selected ? '' : 'disabled'}>${escapeHtml(v)}</button>`,
  ).join('');
  return `
    <div class="voc-review-topic${selected ? ' voc-review-topic--selected' : ''}" data-topic="${escapeAttr(topic)}">
      <label class="voc-review-topic__pick">
        <input type="checkbox" class="voc-review-topic__check" value="${escapeAttr(topic)}" ${checked} />
        <span>${escapeHtml(topic)}</span>
      </label>
      <div class="voc-review-segment" role="radiogroup" aria-label="Valência ${escapeAttr(topic)}">${seg}</div>
      <input type="hidden" class="voc-review-topic__valence" value="${escapeAttr(selected ? valence : 'Neutra')}" />
    </div>`;
}

/**
 * @param {object} ctx
 * @param {object} ctx.response
 * @param {object[]} ctx.topics
 * @param {string} ctx.cycleCode
 */
export function openVocReviewModal(ctx, { onSaved } = {}) {
  const existing = document.getElementById('voc-review-modal');
  existing?.remove();

  const selectedMap = new Map((ctx.topics ?? []).map((t) => [t.topic, t.valence]));
  const orderedTopics = sortTopics(selectedMap);
  const editors = orderedTopics
    .map((topic) => topicEditorRow(topic, selectedMap.get(topic) ?? 'Neutra', selectedMap.has(topic)))
    .join('');

  const shell = document.createElement('div');
  shell.id = 'voc-review-modal';
  shell.className = 'voc-review-modal';
  shell.innerHTML = `
    <div class="voc-review-modal__backdrop" data-close="1"></div>
    <div class="voc-review-modal__panel" role="dialog" aria-modal="true" aria-labelledby="voc-review-title">
      <header class="voc-review-modal__head">
        <h2 id="voc-review-title">Revisar classificação</h2>
        <button type="button" class="btn btn--ghost btn--sm" data-close="1" aria-label="Fechar">✕</button>
      </header>
      <div class="voc-review-modal__body">
        <div class="voc-review-modal__grid">
          <section class="voc-review-modal__comment">
            <h3>Dados do comentário</h3>
            <dl class="drawer-meta-list">
              <div><dt>Cliente</dt><dd>${escapeHtml(ctx.response.client_name ?? '—')}</dd></div>
              <div><dt>EP</dt><dd>${escapeHtml(ctx.response.ep_name ?? '—')}</dd></div>
              <div><dt>Ciclo</dt><dd>${escapeHtml(ctx.response.analytical_cycle_name ?? ctx.cycleCode ?? '—')}</dd></div>
              <div><dt>Nota</dt><dd>${escapeHtml(String(ctx.response.score ?? '—'))} · ${escapeHtml(ctx.response.nps_category ?? '—')}</dd></div>
            </dl>
            <h4>Texto completo</h4>
            <div class="voc-review-modal__text">${escapeHtml(ctx.response.comment ?? '').replace(/\n/g, '<br/>')}</div>
          </section>
          <section class="voc-review-modal__editor">
            <h3>Temas e valências</h3>
            <p class="note-muted">Temas já selecionados aparecem primeiro. Use os botões para Positiva, Neutra ou Negativa.</p>
            <div class="voc-review-topic-list">${editors}</div>
          </section>
        </div>
        <section class="voc-review-modal__notes-block">
          <label class="voc-review-notes-field" for="voc-review-notes">
            <span class="voc-review-notes-field__label">Observação da revisão</span>
            <span class="voc-review-notes-field__hint">Opcional — registre algum contexto adicional sobre a correção.</span>
            <textarea id="voc-review-notes" class="voc-review-notes-field__input" rows="5" placeholder="Ex.: O comentário demonstra insatisfação com os resultados, por isso a valência foi corrigida para negativa."></textarea>
          </label>
        </section>
      </div>
      <footer class="voc-review-modal__footer">
        <p class="voc-review-modal__error note-muted" id="voc-review-error" hidden role="alert"></p>
        <div class="voc-review-modal__actions">
          <button type="button" class="btn btn--ghost" data-close="1">Cancelar</button>
          <button type="button" class="btn btn--primary btn--lg" id="voc-review-save">Salvar revisão</button>
        </div>
      </footer>
    </div>`;

  document.body.appendChild(shell);

  shell.querySelectorAll('[data-close="1"]').forEach((el) => {
    el.addEventListener('click', () => shell.remove());
  });

  shell.querySelectorAll('.voc-review-topic__check').forEach((chk) => {
    chk.addEventListener('change', () => {
      const row = chk.closest('.voc-review-topic');
      row?.classList.toggle('voc-review-topic--selected', chk.checked);
      row?.querySelectorAll('.voc-review-segment__btn').forEach((btn) => {
        btn.disabled = !chk.checked;
      });
    });
  });

  shell.querySelectorAll('.voc-review-segment__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const row = btn.closest('.voc-review-topic');
      row?.querySelectorAll('.voc-review-segment__btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const hidden = row?.querySelector('.voc-review-topic__valence');
      if (hidden) hidden.value = btn.dataset.valence ?? 'Neutra';
    });
  });

  shell.querySelector('#voc-review-save')?.addEventListener('click', async () => {
    const errEl = shell.querySelector('#voc-review-error');
    const notes = shell.querySelector('#voc-review-notes')?.value?.trim() ?? '';
    const reviewedTopics = [];
    shell.querySelectorAll('.voc-review-topic').forEach((row) => {
      const topic = row.dataset.topic;
      const checked = row.querySelector('.voc-review-topic__check')?.checked;
      if (!checked) return;
      const valence = row.querySelector('.voc-review-topic__valence')?.value;
      if (!valence) return;
      reviewedTopics.push({ topic, valence });
    });

    if (!reviewedTopics.length) {
      errEl.hidden = false;
      errEl.textContent = 'Selecione ao menos um tema.';
      return;
    }

    const user = getAuthSessionUser();
    const token = await getAccessToken();

    const primarySource =
      ctx.topics.find((t) => t.classifier_source === 'gemini')?.classifier_source ??
      ctx.topics[0]?.classifier_source ??
      null;

    const body = {
      response_id: ctx.response.response_id,
      client_id: ctx.response.client_id ?? null,
      analytical_cycle_code: ctx.response.analytical_cycle_code ?? ctx.cycleCode,
      score: ctx.response.score ?? null,
      nps_category: ctx.response.nps_category ?? null,
      review_notes: notes || null,
      reviewed_topics: reviewedTopics,
      supersedes_classifier_source: primarySource,
      previous_topics_snapshot: ctx.topics.map((t) => ({
        topic: t.topic,
        valence: t.valence,
        classifier_source: t.classifier_source,
        confidence: t.confidence,
      })),
      _dashboard_reviewer_email: user?.email ?? null,
      _dashboard_reviewer_name: user?.name ?? null,
      _dashboard_reviewer_user_id: user?.user?.id ?? null,
    };

    try {
      errEl.hidden = true;
      const saveBtn = shell.querySelector('#voc-review-save');
      saveBtn.disabled = true;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/voc-manual-review', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Falha ao salvar (HTTP ${res.status})`);
      }
      const rows = (json.topic_rows ?? []).map((t) => ({
        response_id: t.response_id,
        client_id: t.client_id,
        analytical_cycle_code: t.analytical_cycle_code,
        topic: t.topic,
        valence: t.valence,
        confidence: t.confidence ?? 1,
        classifier_source: 'human_review',
        classification_source: 'human_review',
        reviewed: true,
        reviewed_by_email: t.reviewed_by_email ?? user?.email,
        reviewed_by_name: t.reviewed_by_name ?? user?.name,
        reviewed_at: t.reviewed_at ?? new Date().toISOString(),
        review_notes: notes || null,
        previous_topics_snapshot: body.previous_topics_snapshot,
        supersedes_classifier_source: primarySource,
        valence_reason: 'human_review',
      }));
      replaceResponseTopicRows(ctx.response.response_id, rows);
      shell.remove();
      showVocSaveToast('Revisão salva. Classificação atualizada.');
      onSaved?.(rows);
    } catch (e) {
      errEl.hidden = false;
      errEl.textContent = e.message ?? 'Falha ao salvar revisão.';
      shell.querySelector('#voc-review-save').disabled = false;
    }
  });
}

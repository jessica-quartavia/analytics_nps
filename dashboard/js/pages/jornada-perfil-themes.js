import {
  getResponseTopics,
  getResponses,
  getNpsFinancialProfile,
  getNpsClientMilestones,
  getNpsChangeDrivers,
  hasVocArtifacts,
  hasNpsFinancialProfile,
  hasNpsMilestones,
} from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import {
  getThemeProfileFilters,
  setThemeProfileFilters,
  resetThemeProfileFilters,
} from '../filters/theme-profile-filters.mjs';
import { filterMilestoneEntries } from '../data/milestones-view.mjs';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatPct } from '../utils/format.js';
import { sectionHead } from '../ui/help.js';
import { median, mechanismBucket, pctTrue } from '../data/jornada-perfil-view.mjs';
import { fmtMoneyShort } from '../ui/analytics-table.mjs';
import { openJornadaThemeDrawer, closeJornadaThemeDrawer } from '../ui/jornada-theme-drawer.js';

const STARTER_THEMES = [
  'Resultados',
  'Atendimento / relacionamento',
  'Oportunidades',
  'Agilidade',
  'Expectativa',
  'Confiança',
];
const VALENCES = ['Todas', 'Positiva', 'Neutra', 'Negativa'];

function dominantStage(entries) {
  const counts = new Map();
  for (const e of entries) {
    const s = e.journey_stage || '(sem etapa)';
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best = null;
  let max = 0;
  for (const [s, n] of counts) {
    if (n > max) {
      max = n;
      best = s;
    }
  }
  return best;
}

function buildThemeRows(cycleCode, topic, valence, filterCtx) {
  if (!hasVocArtifacts()) return [];
  let topicRows = getResponseTopics(cycleCode).filter((t) => t.topic === topic);
  if (valence && valence !== 'Todas') topicRows = topicRows.filter((t) => t.valence === valence);
  const responseIds = new Set(topicRows.map((t) => t.response_id));
  let responses = getResponses(cycleCode).filter((r) => responseIds.has(r.response_id));

  const clientSet = filterCtx?.recorteActive
    ? new Set((filterCtx.rowsCurrent ?? []).map((r) => r.client_id))
    : null;
  if (clientSet?.size) responses = responses.filter((r) => clientSet.has(r.client_id));

  const finByClient = new Map();
  if (hasNpsFinancialProfile()) {
    for (const e of getNpsFinancialProfile().entries ?? []) {
      if (e.cycle_code === cycleCode || !e.cycle_code) finByClient.set(e.client_id, e);
    }
  }
  const mileByClient = new Map();
  if (hasNpsMilestones()) {
    const entries = filterMilestoneEntries(getNpsClientMilestones(), cycleCode, clientSet);
    for (const e of entries) mileByClient.set(e.client_id, e);
  }

  return responses.map((r) => {
    const fin = finByClient.get(r.client_id);
    const mile = mileByClient.get(r.client_id);
    return {
      response_id: r.response_id,
      client_id: r.client_id,
      client_code: r.client_code,
      client_name: r.client_name,
      score: r.score,
      nps_category: r.nps_category,
      ep_name: r.ep_name,
      comment: r.comment,
      tier: fin?.tier,
      reserve: fin?.reserve,
      contribution: fin?.contribution,
      has_debts: fin?.has_debts,
      mechanisms_count: mile?.mechanisms_count_before_response ?? fin?.mechanisms_count_before_response,
      journey_stage: mile?.journey_stage,
      meetings_count: mile?.meetings_count_before_response,
    };
  });
}

function profileMetrics(rows) {
  const tiers = rows.map((r) => r.tier).filter(Boolean);
  const tierCounts = tiers.reduce((acc, t) => {
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const topTier = Object.entries(tierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  const mechs = rows.map((r) => r.mechanisms_count).filter((v) => v != null);
  const meetings = rows.map((r) => r.meetings_count).filter((v) => v != null);
  const reserves = rows.map((r) => r.reserve).filter((v) => v != null);
  const contributions = rows.map((r) => r.contribution).filter((v) => v != null);
  const debtsPct = pctTrue(rows, (r) => r.has_debts === true);
  const twoPlusPct = pctTrue(rows, (r) => mechanismBucket(r.mechanisms_count) === '2+');
  return {
    n: rows.length,
    topTier,
    reserveMed: median(reserves),
    contributionMed: median(contributions),
    debtsPct,
    mechMed: median(mechs),
    twoPlusPct,
    meetingsMed: median(meetings),
    stage: dominantStage(rows.map((r) => ({ journey_stage: r.journey_stage }))),
  };
}

function metricTile(label, value) {
  return `<div class="theme-metric"><span class="theme-metric__label">${escapeHtml(label)}</span><span class="theme-metric__value">${escapeHtml(value ?? '—')}</span></div>`;
}

function renderThemeProfileCard(topic, valence, filterCtx, { highlight = false } = {}) {
  const filters = getFilters();
  const vKey = valence === '' || !valence ? 'Todas' : valence;
  const rows = buildThemeRows(filters.cycleCode, topic, vKey, filterCtx);
  const drivers = getNpsChangeDrivers()?.resultados_mechanisms;
  const neg = drivers?.resultados_negative;
  const oth = drivers?.others;
  const m = rows.length ? profileMetrics(rows) : null;
  const nDisplay = highlight && topic === 'Resultados' && vKey === 'Negativa' && neg?.n ? neg.n : rows.length;

  const mechMed =
    highlight && topic === 'Resultados' && vKey === 'Negativa' && neg?.median_mechanisms != null
      ? String(neg.median_mechanisms)
      : m?.mechMed != null
        ? String(m.mechMed)
        : '—';
  const twoPlus =
    highlight && topic === 'Resultados' && vKey === 'Negativa' && neg?.pct_two_plus != null
      ? formatPct(neg.pct_two_plus, 0)
      : m?.twoPlusPct != null
        ? formatPct(m.twoPlusPct, 0)
        : '—';

  const insights =
    highlight && topic === 'Resultados' && vKey === 'Negativa'
      ? `<ul class="theme-insights">
          <li>Esse grupo não apresenta menor quantidade de mecanismos. No ciclo atual, possui mediana de ${neg?.median_mechanisms ?? '—'} mecanismos contra ${oth?.median_mechanisms ?? '—'} nos demais.</li>
          <li>Não foi identificada concentração clara em um Tier específico.</li>
        </ul>`
      : '';

  const title =
    highlight && topic === 'Resultados' && vKey === 'Negativa'
      ? 'Clientes que mencionam "Resultados" negativamente'
      : `${topic} · ${vKey}`;

  return `
    <article class="card theme-profile-card" id="${highlight ? 'jornada-resultados-neg' : 'jornada-theme-active'}">
      <div class="theme-profile-card__head">
        <h3>${escapeHtml(title)}</h3>
        <span class="badge badge--ok">${escapeHtml(String(nDisplay))} clientes</span>
      </div>
      ${
        m || highlight
          ? `<div class="theme-metric-grid">
          ${metricTile('Tier mais frequente', m?.topTier ?? '—')}
          ${metricTile('Reserva mediana', fmtMoneyShort(m?.reserveMed))}
          ${metricTile('Aporte mediano', fmtMoneyShort(m?.contributionMed))}
          ${metricTile('Com indicador de débito', m?.debtsPct != null ? formatPct(m.debtsPct, 0) : '—')}
          ${metricTile('Mediana de mecanismos', mechMed)}
          ${metricTile('Com 2+ mecanismos', twoPlus)}
          ${metricTile('Mediana de reuniões', m?.meetingsMed != null ? m.meetingsMed.toFixed(1) : '—')}
          ${metricTile('Etapa predominante', m?.stage ?? '—')}
        </div>`
          : '<p class="note-muted">Nenhum cliente no recorte para este tema e valência.</p>'
      }
      ${insights}
      <p class="voc-profile-link">
        <button type="button" class="btn btn--primary btn--sm jornada-theme-open" data-topic="${escapeAttr(topic)}" data-valence="${escapeAttr(vKey)}">Ver clientes</button>
        <a class="btn btn--ghost btn--sm" href="#/drivers">Ver análise estatística →</a>
      </p>
    </article>`;
}

export function renderJornadaThemesSection(filterCtx) {
  if (!hasVocArtifacts()) return '';
  const { theme: topic, valence } = getThemeProfileFilters();
  const vKey = valence === '' || !valence ? 'Todas' : valence;
  const isResultadosNeg = topic === 'Resultados' && vKey === 'Negativa';

  const themeButtons = STARTER_THEMES.map(
    (t) =>
      `<button type="button" class="chip ${topic === t ? 'is-active' : ''}" data-jornada-topic="${escapeAttr(t)}">${escapeHtml(t)}</button>`,
  ).join('');

  const valenceButtons = VALENCES.map(
    (v) =>
      `<button type="button" class="chip ${vKey === v ? 'is-active' : ''}" data-jornada-valence="${escapeAttr(v)}">${escapeHtml(v)}</button>`,
  ).join('');

  return `
    <section id="jornada-temas" class="jornada-section">
    ${sectionHead(
      'Quem são os clientes por trás dos temas?',
      'Temas da Voz do Cliente cruzados com perfil operacional e financeiro',
      'Associações observadas — não causalidade. Tema e valência abaixo filtram somente esta seção.',
    )}
    <div class="action-chips" role="group" aria-label="Tema">${themeButtons}</div>
    <div class="action-chips" role="group" aria-label="Valência">${valenceButtons}</div>
    <p class="note-muted"><button type="button" class="btn btn--ghost btn--sm" id="jornada-theme-reset">Limpar seleção</button></p>
    ${renderThemeProfileCard(topic, vKey, filterCtx, { highlight: isResultadosNeg })}
    </section>`;
}

export function bindJornadaThemes(root, filterCtx, signal, onLocalChange) {
  const opts = signal ? { signal } : undefined;
  const openFor = (topic, valence) => {
    const v = valence === 'Todas' ? 'Todas' : valence;
    const rows = buildThemeRows(getFilters().cycleCode, topic, v, filterCtx);
    openJornadaThemeDrawer({
      title: `Clientes — ${topic} · ${valence || 'Todas'}`,
      subtitle: `${rows.length} clientes no recorte temático`,
      rows,
      cycleCode: getFilters().cycleCode,
    });
  };

  const refresh = () => {
    if (typeof onLocalChange === 'function') onLocalChange();
  };

  root.querySelectorAll('[data-jornada-topic]').forEach((btn) => {
    btn.addEventListener(
      'click',
      () => {
        setThemeProfileFilters({ theme: btn.dataset.jornadaTopic });
        refresh();
      },
      opts,
    );
  });

  root.querySelectorAll('[data-jornada-valence]').forEach((btn) => {
    btn.addEventListener(
      'click',
      () => {
        const v = btn.dataset.jornadaValence;
        setThemeProfileFilters({ valence: v === 'Todas' ? 'Todas' : v });
        refresh();
      },
      opts,
    );
  });

  root.querySelector('#jornada-theme-reset')?.addEventListener(
    'click',
    () => {
      resetThemeProfileFilters();
      refresh();
    },
    opts,
  );

  root.querySelectorAll('.jornada-theme-open').forEach((btn) => {
    btn.addEventListener(
      'click',
      () => openFor(btn.dataset.topic, btn.dataset.valence),
      opts,
    );
  });

  if (signal) {
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') closeJornadaThemeDrawer();
      },
      { signal },
    );
  }
}

import { getNpsPredictionDoc } from '../data/analytics-store.js';
import { escapeHtml } from '../utils/escape-html.js';
import { formatNps, formatPct, formatDate, formatNpsRange } from '../utils/format.js';
import { helpTip } from '../ui/help.js';
import { renderDataSourceNotice } from '../ui/data-source-notice.mjs';

function npsTechnologyScenario(baseProjectedNps, technologyUpliftPp = 0) {
  if (baseProjectedNps == null || Number.isNaN(Number(baseProjectedNps))) return null;
  const uplift = Number(technologyUpliftPp);
  const base = Number(baseProjectedNps);
  const sum = base + (Number.isNaN(uplift) ? 0 : uplift);
  return Math.max(-100, Math.min(100, sum));
}

let backtestChart = null;
/** @type {number} uplift assumido em p.p. (simulação — não altera o modelo). */
let technologyUpliftPp = 5;

const TECH_UPLIFT_OPTIONS = [0, 1, 2, 3, 5];

function destroyCharts() {
  if (backtestChart) {
    backtestChart.destroy();
    backtestChart = null;
  }
}

function npsToPct(nps) {
  if (nps == null || Number.isNaN(Number(nps))) return null;
  return Math.max(0, Math.min(100, ((Number(nps) + 100) / 200) * 100));
}

function formatDeltaPtsDisplay(delta) {
  if (delta == null || Number.isNaN(Number(delta))) return '—';
  const n = Number(delta);
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pontos`;
}

function formatUpliftPp(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
}

function renderTechUpliftControl(selected) {
  return `<div class="previsao-tech-control" role="group" aria-label="Impacto tecnológico assumido">
    <p class="previsao-tech-control__label">Impacto tecnológico assumido</p>
    <div class="previsao-tech-control__options">
      ${TECH_UPLIFT_OPTIONS.map(
        (v) =>
          `<button type="button" class="previsao-tech-control__btn${selected === v ? ' is-active' : ''}" data-uplift-pp="${v}">${v === 0 ? '0 p.p.' : formatUpliftPp(v)}</button>`,
      ).join('')}
    </div>
    <label class="previsao-tech-control__slider-wrap">
      <span class="note-muted">Slider (0 a +10 p.p.)</span>
      <input type="range" id="previsao-tech-uplift-slider" min="0" max="10" step="0.5" list="previsao-uplift-marks" value="${escapeHtml(String(selected))}" />
      <datalist id="previsao-uplift-marks">
        <option value="0" label="0"></option>
        <option value="5" label="+5"></option>
        <option value="10" label="+10"></option>
      </datalist>
      <output id="previsao-tech-uplift-out">${formatUpliftPp(selected)}</output>
    </label>
  </div>`;
}

function bindTechScenarioControls(container, onChange) {
  container.querySelectorAll('[data-uplift-pp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      technologyUpliftPp = Number(btn.getAttribute('data-uplift-pp')) || 0;
      onChange();
    });
  });
  const slider = container.querySelector('#previsao-tech-uplift-slider');
  const out = container.querySelector('#previsao-tech-uplift-out');
  slider?.addEventListener('input', () => {
    technologyUpliftPp = Number(slider.value);
    if (out) out.textContent = formatUpliftPp(technologyUpliftPp);
    onChange();
  });
}

function displayNum(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return String(value);
}

function friendlyDriverName(raw) {
  return String(raw ?? '—')
    .replace(/^num__/, '')
    .replace(/^cat__/, '')
    .replace(/_/g, ' ');
}

function directionArrow(dir) {
  if (dir === 'positiva') return '↑';
  if (dir === 'negativa') return '↓';
  return '—';
}

/** Escala -100…100 → faixa + marcadores (sem Chart.js). */
function renderProjectionBullet(lastNps, projected, low, high) {
  const lo = low ?? projected;
  const hi = high ?? projected;
  const bandL = npsToPct(lo);
  const bandR = npsToPct(hi);
  const projP = npsToPct(projected);
  const lastP = npsToPct(lastNps);
  const bandLeft = bandL != null && bandR != null ? Math.min(bandL, bandR) : null;
  const bandWidth =
    bandL != null && bandR != null ? Math.abs(bandR - bandL) : null;

  return `<div class="previsao-bullet" role="img" aria-label="Último NPS ${formatNps(lastNps)}, projetado ${formatNps(projected)}, faixa ${formatNpsRange(lo, hi)}">
    <div class="previsao-bullet__ticks" aria-hidden="true">
      <span>-100</span><span>-50</span><span>0</span><span>50</span><span>100</span>
    </div>
    <div class="previsao-bullet__track">
      ${
        bandLeft != null && bandWidth != null
          ? `<div class="previsao-bullet__band" style="left:${bandLeft}%;width:${Math.max(bandWidth, 0.5)}%"></div>`
          : ''
      }
      ${
        lastP != null
          ? `<div class="previsao-bullet__marker previsao-bullet__marker--last" style="left:${lastP}%" title="Último NPS: ${escapeHtml(formatNps(lastNps))}"></div>`
          : ''
      }
      ${
        projP != null
          ? `<div class="previsao-bullet__marker previsao-bullet__marker--proj" style="left:${projP}%" title="NPS projetado: ${escapeHtml(formatNps(projected))}"></div>`
          : ''
      }
    </div>
    <ul class="previsao-bullet__legend">
      <li><span class="previsao-bullet__swatch previsao-bullet__swatch--band"></span> Faixa estimada</li>
      <li><span class="previsao-bullet__swatch previsao-bullet__swatch--last"></span> Último NPS observado</li>
      <li><span class="previsao-bullet__swatch previsao-bullet__swatch--proj"></span> Próximo NPS projetado</li>
    </ul>
  </div>`;
}

function renderDriversTable(drivers) {
  const rows = (drivers ?? []).slice(0, 10);
  if (!rows.length) {
    return '<p class="note-muted">Nenhum fator disponível no artefato do modelo.</p>';
  }
  return `<div class="table-wrap">
    <table class="data-table data-table--compact">
      <thead>
        <tr><th>Fator</th><th>Direção</th><th>Importância</th><th>Interpretação</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (d) => `<tr>
          <td>${escapeHtml(friendlyDriverName(d.variable))}</td>
          <td>${escapeHtml(directionArrow(d.direction))} ${escapeHtml(d.direction ?? '—')}</td>
          <td>${escapeHtml(d.intensity ?? '—')}</td>
          <td>${escapeHtml(d.interpretation ?? '—')}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}

function chartOptionsBacktest(backtest) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          afterBody(items) {
            const i = items[0]?.dataIndex;
            const row = backtest[i];
            if (!row) return [];
            const lines = [`Erro absoluto: ${row.error != null ? `${Number(row.error).toFixed(1)} pts` : '—'}`];
            return lines;
          },
          title(items) {
            const i = items[0]?.dataIndex;
            return backtest[i]?.cycle ?? '';
          },
        },
      },
    },
    scales: {
      y: { min: -100, max: 100, title: { display: true, text: 'NPS' } },
      x: { ticks: { maxRotation: 0 } },
    },
  };
}

export function renderPrevisaoNps(container) {
  try {
    renderPrevisaoNpsInner(container);
  } catch (err) {
    console.error('[previsao-nps] render failed', err);
    container.innerHTML = `<div class="gd-status gd-status--error" role="alert"><p><strong>Erro ao renderizar Projeção NPS.</strong></p><p class="note-muted">${escapeHtml(err?.message ?? String(err))}</p></div>`;
  }
}

function renderPrevisaoNpsInner(container) {
  destroyCharts();
  const doc = getNpsPredictionDoc();
  const missing =
    !doc ||
    doc.error ||
    doc.prediction?.expected_nps == null ||
    Number.isNaN(Number(doc.prediction?.expected_nps));

  if (missing) {
    container.innerHTML = `
      <div class="previsao-nps-page">
        <header class="page-header">
          <h1>Projeção NPS <span class="nav-badge nav-badge--muted">Em construção</span></h1>
          <p class="page-lead">Estimativa matemática exploratória do próximo NPS.</p>
        </header>
        <div class="card previsao-card">
          <p><strong>Modelo ainda não foi gerado.</strong></p>
          <p class="note-muted">${escapeHtml(doc?.error ?? 'Execute npm run generate:phase1 e npm run model:nps-next para gerar os artefatos de projeção.')}</p>
        </div>
      </div>`;
    return;
  }

  const p = doc.prediction ?? {};
  const m = doc.model ?? {};
  const v = doc.validation ?? {};
  const q = doc.quality ?? {};
  const targetCycle = doc.target_cycle ?? '—';
  const updated = formatDate(doc.generated_at?.slice(0, 10));
  const warnings = q.warnings ?? [];
  const showWarn = p.trustworthy === false || warnings.length > 0;
  const backtest = (doc.backtest ?? []).filter(
    (b) => b.nps_actual != null && b.nps_predicted != null && !Number.isNaN(b.nps_predicted),
  );
  const baseNps = p.expected_nps;
  const scenarioNps = npsTechnologyScenario(baseNps, technologyUpliftPp);

  container.innerHTML = `
    <div class="previsao-nps-page">
      <header class="page-header previsao-page-header">
        <div class="previsao-page-header__main">
          <h1>Projeção NPS <span class="nav-badge nav-badge--muted">Em construção</span></h1>
          <p class="page-lead">Estimativa matemática exploratória do próximo NPS.</p>
          <div class="previsao-page-header__badges">
            <span class="badge badge--method">Modelagem preditiva</span>
            <span class="badge badge--neutral-soft">Atualizado em ${escapeHtml(updated)}</span>
          </div>
        </div>
      </header>

      ${renderDataSourceNotice('previsao-nps')}

      ${
        showWarn
          ? `<div class="callout callout--warn previsao-callout" role="status">${escapeHtml(warnings.join(' ') || 'Projeção com incerteza elevada — trate como estimativa exploratória.')}</div>`
          : ''
      }

      <section class="card previsao-card previsao-innovation-hero">
        <div class="previsao-innovation-hero__head">
          <span class="previsao-innovation-hero__icon" aria-hidden="true">⚡</span>
          <div>
            <h2 class="previsao-innovation-hero__title">Cenário de inovação tecnológica</h2>
            <p class="previsao-innovation-hero__lead">Simulação do efeito potencial das inovações em implantação. <span class="badge badge--sim">Simulação</span></p>
          </div>
        </div>
        <div class="previsao-innovation-hero__metrics">
          <div class="previsao-innovation-metric">
            <p class="previsao-innovation-metric__label">Projeção estatística</p>
            <p class="previsao-innovation-metric__value previsao-innovation-metric__value--base">${formatNps(baseNps)}</p>
          </div>
          <div class="previsao-innovation-metric previsao-innovation-metric--uplift">
            <p class="previsao-innovation-metric__label">Impacto assumido</p>
            <p class="previsao-innovation-metric__value" id="previsao-scenario-uplift">${formatUpliftPp(technologyUpliftPp)}</p>
          </div>
          <div class="previsao-innovation-metric previsao-innovation-metric--scenario">
            <p class="previsao-innovation-metric__label">Cenário com inovação</p>
            <p class="previsao-innovation-metric__value previsao-innovation-metric__value--hero" id="previsao-scenario-nps">${formatNps(scenarioNps)}</p>
          </div>
        </div>
        <p class="previsao-innovation-formula">NPS cenário = NPS projetado pelo modelo + impacto tecnológico assumido (limite −100 a +100)</p>
        ${renderTechUpliftControl(technologyUpliftPp)}
        <div class="previsao-prose previsao-prose--compact">
          <p>A projeção estatística não é alterada. O cenário de inovação adiciona um impacto assumido em pontos de NPS para simular o possível efeito das iniciativas tecnológicas.</p>
        </div>
      </section>

      <section class="card previsao-card previsao-hero">
        <div class="previsao-hero__grid">
          <div class="previsao-hero__stats">
            <p class="previsao-hero__eyebrow">Próximo NPS projetado (modelo)</p>
            <p class="previsao-hero__value">${formatNps(baseNps)}</p>
            <dl class="previsao-hero__meta">
              <div><dt>Faixa estimada</dt><dd>${formatNps(p.interval_low)} a ${formatNps(p.interval_high)}</dd></div>
              <div><dt>Comparação</dt><dd>${formatDeltaPtsDisplay(p.delta_vs_last_official)} vs último NPS observado (${formatNps(p.last_official_nps)})</dd></div>
              <div><dt>Próxima medição estimada</dt><dd>${escapeHtml(targetCycle)}</dd></div>
            </dl>
          </div>
          <div class="previsao-hero__chart">
            <p class="previsao-chart-title">Visual da projeção-base</p>
            <div class="prediction-chart-frame prediction-chart-frame--hero">
              ${renderProjectionBullet(p.last_official_nps, p.expected_nps, p.interval_low, p.interval_high)}
            </div>
          </div>
        </div>
      </section>

      <section class="previsao-kpi-grid" aria-label="Composição esperada">
        <div class="card previsao-card previsao-kpi-card">
          <p class="kpi-label">Promotores esperados</p>
          <p class="kpi-value">${formatPct(p.expected_promoter_pct)}</p>
        </div>
        <div class="card previsao-card previsao-kpi-card">
          <p class="kpi-label">Neutros esperados</p>
          <p class="kpi-value">${formatPct(p.expected_neutral_pct)}</p>
        </div>
        <div class="card previsao-card previsao-kpi-card">
          <p class="kpi-label">Detratores esperados</p>
          <p class="kpi-value">${formatPct(p.expected_detractor_pct)}</p>
        </div>
        <div class="card previsao-card previsao-kpi-card">
          <p class="kpi-label">Respondentes esperados</p>
          <p class="kpi-value">${displayNum(p.expected_responses)}</p>
          <p class="kpi-sub">${displayNum(p.eligible_clients)} clientes elegíveis</p>
        </div>
      </section>

      <section class="previsao-charts-grid">
        <div class="card previsao-card">
          <h2 class="section-title">Como o modelo se saiu no histórico ${helpTip('Backtest temporal: treino apenas com ciclos anteriores a cada fold.')}</h2>
          ${
            backtest.length
              ? `<div class="prediction-chart-frame"><canvas id="proj-backtest-chart" aria-label="Backtest NPS previsto versus realizado"></canvas></div>`
              : '<p class="note-muted">Não há folds temporais suficientes para exibir o backtest.</p>'
          }
        </div>
        <div class="card previsao-card">
          <h2 class="section-title">Qualidade da estimativa</h2>
          <ul class="metric-list previsao-quality-list">
            <li><span>MAE NPS</span><strong>${displayNum(v.mae_nps)}</strong></li>
            <li><span>Folds temporais</span><strong>${displayNum(v.temporal_folds)}</strong></li>
            <li><span>Clientes no treino</span><strong>${displayNum(q.training_clients)}</strong></li>
            <li><span>Respostas no treino</span><strong>${displayNum(q.training_responses)}</strong></li>
          </ul>
        </div>
      </section>

      <section class="card previsao-card">
        <h2 class="section-title">Principais fatores associados</h2>
        <p class="section-lead">Associação estatística no modelo — não implica causalidade.</p>
        ${renderDriversTable(doc.drivers)}
      </section>

      <section class="card previsao-card previsao-method">
        <h2 class="section-title">Como o próximo NPS é calculado</h2>
        <div class="previsao-formula" aria-label="Fórmula do NPS previsto">
          <p class="previsao-formula__line">NPS previsto =</p>
          <p class="previsao-formula__frac">
            <span class="previsao-formula__num">100 × Σ [ r<sub>i</sub> × (P<sub>i,Promotor</sub> − P<sub>i,Detrator</sub>) ]</span>
            <span class="previsao-formula__den">Σ r<sub>i</sub></span>
          </p>
        </div>
        <dl class="previsao-terms">
          <div><dt>r<sub>i</sub></dt><dd>probabilidade do cliente <em>i</em> responder à próxima pesquisa</dd></div>
          <div><dt>P<sub>i,Promotor</sub></dt><dd>probabilidade de o cliente <em>i</em> ser Promotor, caso responda</dd></div>
          <div><dt>P<sub>i,Detrator</sub></dt><dd>probabilidade de o cliente <em>i</em> ser Detrator, caso responda</dd></div>
        </dl>
      </section>

      <section class="card previsao-card">
        <h2 class="section-title">Em termos simples</h2>
        <div class="previsao-prose">
          <p>O modelo olha para o histórico dos clientes e estima duas coisas:</p>
          <ol>
            <li>a chance de cada cliente responder à próxima pesquisa;</li>
            <li>caso ele responda, a chance de sua nota colocá-lo como Promotor, Neutro ou Detrator.</li>
          </ol>
          <p>Depois, essas probabilidades são combinadas para estimar o NPS agregado da próxima medição.</p>
          <p>Ou seja: o modelo não tenta adivinhar uma nota exata para cada pessoa. Ele calcula probabilidades com base nos padrões históricos e transforma essas probabilidades em uma estimativa matemática do próximo NPS.</p>
        </div>
      </section>

      <section class="card previsao-card">
        <h2 class="section-title">Tipo de modelagem</h2>
        <dl class="method-dl previsao-model-dl">
          <dt>Modelagem</dt><dd>Regressão logística regularizada em duas etapas (${escapeHtml(m.regularization ?? 'L2')}) — prevê NPS agregado a partir do histórico.</dd>
          <dt>Cenário tecnológico</dt><dd>Ajuste manual em pontos de NPS sobre a projeção-base (<code>technology_uplift_pp</code>). Não faz parte do treino.</dd>
          <dt>Abordagem</dt><dd>${escapeHtml(m.type ?? 'Modelagem preditiva supervisionada')}</dd>
          <dt>Técnica</dt><dd>Regressão logística regularizada em duas etapas (${escapeHtml(m.regularization ?? 'L2')})</dd>
          <dt>Etapa 1</dt><dd>Probabilidade de resposta — ${escapeHtml(m.response_model ?? '—')}</dd>
          <dt>Etapa 2</dt><dd>Probabilidade de Promotor / Neutro / Detrator — ${escapeHtml(m.category_model ?? '—')}</dd>
          <dt>Saída</dt><dd>NPS agregado esperado</dd>
        </dl>
        <div class="previsao-prose">
          <p>A regressão logística é um modelo estatístico usado para estimar probabilidades. Ela aprende, a partir dos casos históricos, quais características aparecem associadas a determinadas respostas.</p>
          <p>Por exemplo, tempo de relacionamento, histórico de NPS, reuniões, mecanismos e frequência de participação podem ajudar o modelo a estimar a probabilidade de um cliente responder e a categoria provável dessa resposta.</p>
        </div>
        <div class="previsao-formula previsao-formula--compact">
          <p class="previsao-formula__label">Etapa resposta</p>
          <p class="previsao-formula__mono">logit(p) = ln(p / (1−p))</p>
          <p class="previsao-formula__mono">logit(p) = β₀ + β₁X₁ + β₂X₂ + … + βₖXₖ</p>
          <p class="note-muted">Os β são pesos aprendidos pelo modelo a partir dos dados históricos. Os X representam características do cliente.</p>
        </div>
        <div class="previsao-formula previsao-formula--compact">
          <p class="previsao-formula__label">Etapa categoria (multinomial)</p>
          <p class="previsao-formula__frac previsao-formula__frac--inline">
            <span class="previsao-formula__num">P(Y = k | X) = exp(β<sub>k</sub><sup>T</sup>X)</span>
            <span class="previsao-formula__den">Σ<sub>j</sub> exp(β<sub>j</sub><sup>T</sup>X)</span>
          </p>
          <p class="note-muted">Essa etapa distribui a probabilidade entre Promotor, Neutro e Detrator.</p>
        </div>
      </section>

      <section class="card previsao-card previsao-disclaimer">
        <p>${escapeHtml(p.disclaimer ?? 'Esta projeção é uma estimativa matemática baseada nos padrões observados na base histórica. O resultado real pode diferir.')}</p>
      </section>
    </div>
  `;

  const refreshScenarioDisplay = () => {
    const scenarioEl = container.querySelector('#previsao-scenario-nps');
    const upliftEl = container.querySelector('#previsao-scenario-uplift');
    const next = npsTechnologyScenario(baseNps, technologyUpliftPp);
    if (scenarioEl) scenarioEl.textContent = formatNps(next);
    if (upliftEl) upliftEl.textContent = formatUpliftPp(technologyUpliftPp);
    container.querySelectorAll('[data-uplift-pp]').forEach((btn) => {
      const v = Number(btn.getAttribute('data-uplift-pp'));
      btn.classList.toggle('is-active', v === technologyUpliftPp);
    });
    const slider = container.querySelector('#previsao-tech-uplift-slider');
    const out = container.querySelector('#previsao-tech-uplift-out');
    if (slider && Number(slider.value) !== technologyUpliftPp) slider.value = String(technologyUpliftPp);
    if (out) out.textContent = formatUpliftPp(technologyUpliftPp);
  };
  bindTechScenarioControls(container, refreshScenarioDisplay);

  if (backtest.length && window.Chart) {
    const canvas = container.querySelector('#proj-backtest-chart');
    if (canvas) {
      backtestChart = new window.Chart(canvas, {
        type: 'line',
        data: {
          labels: backtest.map((b) => b.cycle),
          datasets: [
            {
              label: 'NPS realizado',
              data: backtest.map((b) => b.nps_actual),
              borderColor: 'rgb(22, 101, 52)',
              backgroundColor: 'rgba(22, 101, 52, 0.08)',
              tension: 0.25,
              pointRadius: 4,
            },
            {
              label: 'NPS previsto',
              data: backtest.map((b) => b.nps_predicted),
              borderColor: 'rgb(37, 99, 235)',
              borderDash: [6, 4],
              tension: 0.25,
              pointRadius: 4,
            },
          ],
        },
        options: chartOptionsBacktest(backtest),
      });
    }
  }
}

export function closePrevisaoDrawer() {
  destroyCharts();
}

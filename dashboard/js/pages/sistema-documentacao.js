import { escapeHtml } from '../utils/escape-html.js';
import { PAGE_DATA_SOURCES, DATA_SOURCE_CATALOG } from '../data/page-data-sources.mjs';

const METRICS = [
  {
    id: 'nps-atual',
    title: 'NPS atual',
    meaning: 'Índice Net Promoter Score do ciclo analítico selecionado.',
    calc: '((Promotores − Detratores) / Total válido) × 100. Promotor 9–10, Neutro 7–8, Detrator 0–6.',
    why: 'Padrão oficial QuartaVia alinhado ao pipeline analítico.',
    notes: 'Recortes filtrados recalculam sobre o subconjunto; o card oficial do ciclo usa regra congelada em cycle_summary quando aplicável.',
  },
  {
    id: 'variacao',
    title: 'Variação do NPS',
    meaning: 'Diferença de NPS entre ciclo atual e anterior (clientes pareados quando a base é pareada).',
    calc: 'NPS(ciclo atual) − NPS(ciclo anterior) no mesmo universo de comparação.',
    why: 'Medir movimento entre ondas.',
    notes: 'Depende de existência de ciclo anterior e pareamento.',
  },
  {
    id: 'voc-ia',
    title: 'VoC / classificação IA',
    meaning: 'Temas e valências extraídos dos comentários.',
    calc: 'Gemini quando disponível; fallback por regras quando quota/indisponibilidade.',
    why: 'Escala a leitura qualitativa.',
    notes: 'Revisão humana prevalece e fica auditada.',
  },
  {
    id: 'prioridade-hibrida',
    title: 'Prioridade híbrida (Plano de Ação)',
    meaning: 'Ordem de atendimento combinando NPS, VoC, queda de nota e sinais operacionais.',
    calc: 'Score determinístico + enriquecimento IA; prioridade final = humana > híbrida > IA.',
    why: 'Fila operacional acionável.',
    notes: 'Gemini enriquece; fallback não bloqueia operação.',
  },
];

function metricAccordion(items) {
  return items
    .map(
      (m) => `
    <details class="doc-accordion">
      <summary>${escapeHtml(m.title)}</summary>
      <dl class="doc-dl">
        <div><dt>O que significa</dt><dd>${escapeHtml(m.meaning)}</dd></div>
        <div><dt>Como calculamos</dt><dd>${escapeHtml(m.calc)}</dd></div>
        <div><dt>Por que essa regra</dt><dd>${escapeHtml(m.why)}</dd></div>
        <div><dt>Observações</dt><dd>${escapeHtml(m.notes)}</dd></div>
      </dl>
    </details>`,
    )
    .join('');
}

function sourcesTable() {
  const rows = Object.entries(PAGE_DATA_SOURCES)
    .map(([route, cfg]) => {
      const bases = (cfg.sourceIds ?? [])
        .map((id) => DATA_SOURCE_CATALOG[id]?.label ?? id)
        .join(', ');
      return `<tr><td>${escapeHtml(route)}</td><td>${escapeHtml(bases)}</td><td>${escapeHtml(cfg.text)}</td></tr>`;
    })
    .join('');
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Página</th><th>Bases</th><th>Observações</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderSistemaDocumentacao(root) {
  root.innerHTML = `
    <header class="page-header">
      <div>
        <p class="eyebrow">Sistema</p>
        <h1 class="hero__title">Documentação</h1>
        <p class="page-header__lead">Metodologia, bases de dados e dicionário de métricas do Analytics NPS QuartaVia.</p>
      </div>
    </header>
    <article class="doc-card">
      <h2>Visão geral</h2>
      <p>O portal consolida NPS operacional (BASE QV / pipeline processado), histórico BASE0, match App PHARUS quando aplicável e camadas de VoC e Plano de Ação enriquecidas por IA com revisão humana.</p>
      <ul>
        <li><strong>BASE QV</strong> — universo operacional atual de clientes e respostas do pipeline.</li>
        <li><strong>BASE0</strong> — histórico consolidado (pagamentos, reuniões, mecanismos, NPS passado).</li>
        <li><strong>Business Data</strong> — persistência Postgres (planos, revisões, VoC revisado) via APIs.</li>
        <li><strong>App Pharus</strong> — cadastro e cobertura quando cruzado em Safras & Cobertura.</li>
      </ul>
    </article>
    <article class="doc-card">
      <h2>Metodologia geral NPS</h2>
      <p>NPS = % Promotores − % Detratores. Promotor: 9–10. Neutro: 7–8. Detrator: 0–6. Em recortes analíticos pode aplicar-se dedupe da última resposta válida por cliente conforme o contexto da página.</p>
      <p>Diferenças: <strong>NPS oficial do ciclo</strong> (artefato cycle_summary), <strong>NPS do recorte filtrado</strong> (kernel ao vivo no dashboard) e <strong>NPS histórico BASE0</strong> (ondas históricas).</p>
    </article>
    <article class="doc-card">
      <h2>Dicionário de métricas</h2>
      ${metricAccordion(METRICS)}
      <p class="note-muted">Métricas adicionais (safras, tenure, reuniões PIT, mecanismos, trocas de EP, projeção NPS) seguem os artefatos descritos em Metodologia e nos datasets de cada página.</p>
    </article>
    <article class="doc-card">
      <h2>Fontes por página</h2>
      ${sourcesTable()}
    </article>
    <article class="doc-card">
      <h2>IA e revisão humana</h2>
      <p>Gemini classifica VoC e sugere prioridades/planos quando a cota está disponível. Em indisponibilidade (429, timeout), o sistema usa <strong>fallback por regras</strong> sem bloquear a UI.</p>
      <p>Toda revisão manual (VoC, prioridade, plano) registra e-mail do usuário autenticado, timestamp e histórico auditável. A decisão humana prevalece sobre a sugestão da IA.</p>
    </article>`;
}

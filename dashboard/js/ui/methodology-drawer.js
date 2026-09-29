import { escapeHtml } from '../utils/escape-html.js';

let open = false;

function renderBody(snapshot, diagnosis) {
  const m = snapshot?.methodology ?? diagnosis?.methodology ?? {};
  const versions = [
    ['NPS', m.nps_method_version],
    ['VoC (classificador)', m.voc_classifier_version],
    ['CSAT', m.csat_method_version],
    ['Drivers', m.drivers_version],
    ['Prioridade (fila)', m.action_priority_version],
    ['Diagnóstico executivo', m.executive_diagnosis_version],
  ]
    .filter(([, v]) => v)
    .map(([label, v]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(v))}</li>`)
    .join('');

  return `
    <header class="drawer__header">
      <h2>Metodologia</h2>
      <button type="button" class="icon-btn" id="methodology-close" aria-label="Fechar">×</button>
    </header>
    <div class="drawer__body drawer__body--prose">
      <p>Analytics NPS consome artefatos file-based gerados pelo pipeline (<code>npm run refresh:nps</code>). BASE QV é somente leitura.</p>
      <h3>NPS</h3>
      <p>Net Promoter Score por ciclo analítico: % promotores (9–10) menos % detratores (0–6), sobre respostas válidas após dedupe. Intervalos de confiança quando aplicável na UI.</p>
      <h3>Base total vs pareada</h3>
      <p><strong>Total:</strong> todos os respondentes do ciclo. <strong>Pareada:</strong> clientes com resposta no ciclo atual e no ciclo anterior configurado (movimento e migração).</p>
      <h3>Voz do Cliente (VoC)</h3>
      <p>Classificação rule-based dos comentários (<code>rules_v1</code>), temas e valência. Cobertura = comentários classificados / com comentário.</p>
      <h3>CSAT</h3>
      <p>Respostas CSAT vinculadas analiticamente por ciclo; reconciliação legado documentada em limitações.</p>
      <h3>Drivers</h3>
      <p>Associações estatísticas entre features e NPS — não implicam causalidade; proxies de EP quando aplicável.</p>
      <h3>Fila de ação</h3>
      <p>Priorização determinística (crítico / alta / média / investigar) a partir de regras versionadas; enriquecimento pós-refresh.</p>
      <h3>Versões ativas</h3>
      <ul>${versions || '<li>Ver <code>data/config/methodology.json</code></li>'}</ul>
      <p class="note-muted">Limitações detalhadas: <code>docs/LIMITACOES_METODOLOGICAS.md</code> no repositório.</p>
    </div>
  `;
}

export function openMethodologyDrawer(snapshot, diagnosis) {
  const drawer = document.getElementById('methodology-drawer');
  const backdrop = document.getElementById('methodology-drawer-backdrop');
  if (!drawer || !backdrop) return;
  drawer.innerHTML = renderBody(snapshot, diagnosis);
  drawer.hidden = false;
  backdrop.hidden = false;
  backdrop.setAttribute('aria-expanded', 'true');
  open = true;
  drawer.querySelector('#methodology-close')?.addEventListener('click', closeMethodologyDrawer);
  backdrop.addEventListener('click', closeMethodologyDrawer, { once: true });
  drawer.focus();
}

export function closeMethodologyDrawer() {
  if (!open) return;
  const drawer = document.getElementById('methodology-drawer');
  const backdrop = document.getElementById('methodology-drawer-backdrop');
  if (drawer) drawer.hidden = true;
  if (backdrop) {
    backdrop.hidden = true;
    backdrop.setAttribute('aria-expanded', 'false');
  }
  open = false;
}

export function bindMethodologyTrigger(getContext) {
  document.getElementById('open-methodology')?.addEventListener('click', () => {
    const ctx = getContext();
    openMethodologyDrawer(ctx?.snapshot, ctx?.executiveDiagnosisDoc);
  });
}

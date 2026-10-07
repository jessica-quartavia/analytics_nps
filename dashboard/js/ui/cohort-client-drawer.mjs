import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatDate } from '../utils/format.js';
import { drawerShell, drawerMetaGrid } from './drawer-layout.mjs';

export function isAppSourceUnavailable(audit) {
  if (!audit) return true;
  if ((audit.app_clients_matched ?? 0) > 0) return false;
  const statusCounts = audit.app_match_status_counts ?? {};
  if ((statusCounts.unmatched ?? 0) > 0) {
    const src = String(audit.app_source ?? '').toLowerCase();
    if (src !== 'not_configured' && src !== '') return false;
  }
  const s = String(audit.app_source ?? '').toLowerCase();
  if (s.includes('personal_info') || s.includes('pharus_app') || s.startsWith('public.')) {
    return false;
  }
  return s.includes('nenhuma') || s.includes('not_configured') || s.includes('indispon');
}

export function badgeAppHtml(customerOrFlag, appUnavailable) {
  const c =
    customerOrFlag && typeof customerOrFlag === 'object'
      ? customerOrFlag
      : { has_app: customerOrFlag, has_app_access: customerOrFlag };
  const hasApp = c.has_app ?? c.has_app_access;
  const st = c.app_match_status;
  if (appUnavailable && hasApp == null && !st) {
    return '<span class="badge badge--neutral-soft">Não identificado</span>';
  }
  if (hasApp === true) return '<span class="badge badge--coral-soft">Com App</span>';
  if (st === 'ambiguous' || st === 'insufficient_identifiers' || (hasApp == null && st === 'not_found')) {
    return '<span class="badge badge--neutral-soft">Não identificado</span>';
  }
  if (hasApp === false && (st === 'unmatched' || st === 'not_found')) {
    return '<span class="badge badge--neutral-soft">Sem App</span>';
  }
  return '<span class="badge badge--neutral-soft">Não identificado</span>';
}

function appMatchMethodLabel(method) {
  if (!method) return '—';
  if (method === 'multiple' || method === 'exact_multi') return 'Vários identificadores (concordância)';
  if (method === 'cpf') return 'CPF';
  if (method === 'email') return 'E-mail';
  if (method === 'phone') return 'Telefone';
  return method;
}

function badgeCategoryHtml(cat) {
  const c = (cat ?? '').toLowerCase();
  let cls = 'badge--neutral-soft';
  if (c.includes('promot')) cls = 'badge--promoter';
  else if (c.includes('detrat')) cls = 'badge--detractor';
  else if (c.includes('neutr')) cls = 'badge--passive';
  return `<span class="badge ${cls}">${escapeHtml(cat ?? '—')}</span>`;
}

function renderHistoricoFieldBlock(label, value) {
  if (value == null || String(value).trim() === '') return '';
  return `<div class="drawer-qa"><p class="drawer-qa__q">${escapeHtml(label)}</p><p class="drawer-qa__a">${escapeHtml(String(value))}</p></div>`;
}

function renderResponseDetail(h) {
  const f = h.historico_fields ?? {};
  const parts = [
    renderHistoricoFieldBlock('Nota estrategista', f.nota_estrategista),
    renderHistoricoFieldBlock('Nota backoffice', f.nota_backoffice),
    renderHistoricoFieldBlock('Nota QV360', f.nota_qv360),
    renderHistoricoFieldBlock('Arquitetura patrimonial', f.nota_arquitetura_patrimonial),
    renderHistoricoFieldBlock('Plano patrimonial', f.plano_patrimonial),
    renderHistoricoFieldBlock('Plano apresentado', f.plano_apresentado),
    renderHistoricoFieldBlock('Caminho', f.caminho),
    renderHistoricoFieldBlock('Momento', f.momento),
    renderHistoricoFieldBlock('Retenção 5 anos', f.retencao_5_anos),
    renderHistoricoFieldBlock('Reuniões realizadas', f.reunioes_realizadas),
    renderHistoricoFieldBlock('Motivo da nota', f.motivo_nota),
    renderHistoricoFieldBlock('Melhoria', f.melhoria),
    renderHistoricoFieldBlock('Razão positiva', f.razao_positiva),
    renderHistoricoFieldBlock('Comentário', f.comentario_adicional ?? h.comment),
    renderHistoricoFieldBlock('Versão formulário', f.versao_formulario ?? h.versao_formulario),
  ].filter(Boolean);
  if (!parts.length) return '';
  return `<div class="safras-drawer-section"><h4>${escapeHtml(h.ciclo ?? '—')} · ${h.nota_nps ?? '—'} ${badgeCategoryHtml(h.categoria)}</h4>
    <p class="note-muted">${escapeHtml(formatDate(h.data_resposta))} · ${escapeHtml(h.source ?? '')}</p>${parts.join('')}</div>`;
}

/**
 * @param {object} c customer row from cohorts
 * @param {object[]} historyAll all history rows
 * @param {{ appUnavailable?: boolean }} opts
 */
export function renderCohortClientDrawerHtml(c, historyAll, opts = {}) {
  const appUnavailable = opts.appUnavailable ?? false;
  const hist = historyAll
    .filter((h) => h.client_id === c.client_id)
    .sort((a, b) => String(a.ciclo).localeCompare(String(b.ciclo)));

  const timeline = hist
    .map(
      (h) =>
        `<li><strong>${escapeHtml(h.ciclo)}</strong> · ${h.nota_nps ?? '—'} · ${badgeCategoryHtml(h.categoria)} <span class="note-muted">(${escapeHtml(h.source ?? '')})</span></li>`,
    )
    .join('');

  const detailBlocks = hist.map((h) => renderResponseDetail(h)).join('');

  return drawerShell({
    title: c.client_name ?? 'Cliente',
    subtitle: c.safra_trimestre ? `Safra ${c.safra_trimestre}` : undefined,
    closeId: 'drawer-close',
    bodyHtml: `
      ${drawerMetaGrid([
        { label: 'Safra', value: c.safra_trimestre ?? '—' },
        { label: 'Entrada', value: c.data_entrada ? formatDate(c.data_entrada) : '—' },
        { label: 'Programa', value: c.programa ?? '—' },
        { label: 'EP', value: c.ep ?? '—' },
        { label: 'App', html: badgeAppHtml(c, appUnavailable) },
        { label: 'Já respondeu NPS?', value: c.ever_answered_nps ? 'Sim' : 'Não' },
        { label: 'Qtd respostas', value: String(c.nps_response_count ?? 0) },
        { label: 'Primeira resposta', value: c.first_nps_at ? formatDate(c.first_nps_at) : '—' },
        { label: 'Última resposta', value: c.last_nps_at ? formatDate(c.last_nps_at) : '—' },
        { label: 'Última nota', value: c.last_nps_score ?? '—' },
        { label: 'Nota média', value: c.avg_nps_score ?? '—' },
        { label: 'Melhor nota', value: c.max_nps_score ?? '—' },
        { label: 'Pior nota', value: c.min_nps_score ?? '—' },
        { label: 'Último ciclo', value: c.last_nps_cycle ?? '—' },
        { label: 'Dias até 1º NPS', value: c.days_entry_to_first_nps_valid ?? '—' },
      ])}
      <div class="safras-drawer-section"><h4>App PHARUS</h4>
        ${drawerMetaGrid([
          {
            label: 'Status',
            value: c.has_app ? 'Com App' : c.app_match_status === 'unmatched' ? 'Sem App' : 'Não identificado',
          },
          { label: 'Match', value: appMatchMethodLabel(c.app_match_method) },
          { label: 'Cadastro', value: c.app_registered_at ? formatDate(c.app_registered_at) : '—' },
        ])}
      </div>
      <div class="safras-drawer-section"><h4>Linha do tempo NPS</h4><ul class="timeline-list">${timeline || '<li>Sem respostas</li>'}</ul></div>
      ${detailBlocks ? `<div class="safras-drawer-section"><h4>Detalhes por medição</h4>${detailBlocks}</div>` : ''}`,
  });
}

export function openCohortClientDrawer(clientId, customers, historyAll, opts = {}) {
  const drawer = document.getElementById('client-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const c = customers.find((x) => x.client_id === clientId);
  if (!drawer || !c) return;

  drawer.classList.add('drawer--safras');
  drawer.innerHTML = renderCohortClientDrawerHtml(c, historyAll, opts);
  drawer.classList.add('is-open');
  backdrop?.classList.add('is-visible');
  backdrop?.classList.add('is-open');
  backdrop?.setAttribute('aria-hidden', 'false');

  const closeBtn = drawer.querySelector('#drawer-close');
  closeBtn?.addEventListener('click', closeCohortClientDrawer);
  backdrop?.addEventListener('click', closeCohortClientDrawer, { once: true });
}

export function closeCohortClientDrawer() {
  const drawer = document.getElementById('client-drawer');
  drawer?.classList.remove('is-open', 'drawer--safras');
  const backdrop = document.getElementById('drawer-backdrop');
  backdrop?.classList.remove('is-visible', 'is-open');
  backdrop?.setAttribute('aria-hidden', 'true');
}

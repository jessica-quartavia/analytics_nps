import { escapeHtml } from '../utils/escape-html.js';
import { formatDate } from '../utils/format.js';
import { drawerShell, drawerMetaGrid } from './drawer-layout.mjs';

function fieldBlock(label, value) {
  if (value == null || String(value).trim() === '') return '';
  return `<div class="drawer-qa"><p class="drawer-qa__q">${escapeHtml(label)}</p><p class="drawer-qa__a">${escapeHtml(String(value))}</p></div>`;
}

export function renderHistoricoResponseDrawerHtml(r) {
  const f = r.historico_fields ?? {};
  const blocks = [
    fieldBlock('Nota estrategista', f.nota_estrategista),
    fieldBlock('Nota backoffice', f.nota_backoffice),
    fieldBlock('Nota QV360', f.nota_qv360),
    fieldBlock('Arquitetura patrimonial', f.nota_arquitetura_patrimonial),
    fieldBlock('Plano patrimonial', f.plano_patrimonial),
    fieldBlock('Plano apresentado', f.plano_apresentado),
    fieldBlock('Caminho', f.caminho),
    fieldBlock('Momento', f.momento),
    fieldBlock('Retenção 5 anos', f.retencao_5_anos),
    fieldBlock('Reuniões realizadas', f.reunioes_realizadas),
    fieldBlock('Motivo da nota', f.motivo_nota),
    fieldBlock('Melhoria', f.melhoria),
    fieldBlock('Razão positiva', f.razao_positiva),
    fieldBlock('Comentário adicional', f.comentario_adicional ?? r.comment),
    fieldBlock('Versão formulário', f.versao_formulario ?? r.versao_formulario),
  ].join('');

  return drawerShell({
    title: r.client_name ?? 'Resposta NPS',
    subtitle: `${r.ciclo ?? '—'} · Fonte: ${r.source ?? '—'}`,
    closeId: 'drawer-close',
    bodyHtml: `
      ${drawerMetaGrid([
        { label: 'Ciclo', value: r.ciclo ?? '—' },
        { label: 'Data', value: r.data_resposta ? formatDate(r.data_resposta) : '—' },
        { label: 'Nota', value: String(r.nota_nps ?? '—') },
        { label: 'Categoria', value: r.categoria ?? '—' },
        { label: 'Safra', value: r.safra_trimestre ?? '—' },
        { label: 'Programa', value: r.programa ?? '—' },
        { label: 'EP', value: r.ep ?? '—' },
      ])}
      ${blocks || '<p class="note-muted">Sem campos estruturados adicionais nesta resposta.</p>'}`,
  });
}

export function openHistoricoResponseDrawer(responseKey, responses) {
  const drawer = document.getElementById('client-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const r = responses.find((x) => x.response_key === responseKey);
  if (!drawer || !r) return;
  drawer.classList.add('drawer--safras');
  drawer.innerHTML = renderHistoricoResponseDrawerHtml(r);
  drawer.classList.add('is-open');
  backdrop?.classList.add('is-visible', 'is-open');
  backdrop?.setAttribute('aria-hidden', 'false');
  drawer.querySelector('#drawer-close')?.addEventListener('click', closeHistoricoResponseDrawer);
  backdrop?.addEventListener('click', closeHistoricoResponseDrawer, { once: true });
}

export function closeHistoricoResponseDrawer() {
  const drawer = document.getElementById('client-drawer');
  drawer?.classList.remove('is-open', 'drawer--safras');
  const backdrop = document.getElementById('drawer-backdrop');
  backdrop?.classList.remove('is-visible', 'is-open');
  backdrop?.setAttribute('aria-hidden', 'true');
}

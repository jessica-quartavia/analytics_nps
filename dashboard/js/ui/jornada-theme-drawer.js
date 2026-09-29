import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { fmtMoneyShort } from './analytics-table.mjs';
import { drawerQaBlock, drawerTopicChips } from './drawer-layout.mjs';
import { getResponseTopics } from '../data/analytics-store.js';

let drawerState = { rows: [], cycleCode: null, view: 'list', selectedId: null };

export function closeJornadaThemeDrawer() {
  document.getElementById('jornada-theme-drawer')?.classList.remove('is-open');
  const backdrop = document.getElementById('jornada-theme-drawer-backdrop');
  backdrop?.classList.remove('is-open');
  backdrop?.setAttribute('aria-expanded', 'false');
  drawerState.view = 'list';
  drawerState.selectedId = null;
}

function ensureDrawerDom() {
  let drawer = document.getElementById('jornada-theme-drawer');
  let backdrop = document.getElementById('jornada-theme-drawer-backdrop');
  if (!drawer) {
    backdrop = document.createElement('div');
    backdrop.id = 'jornada-theme-drawer-backdrop';
    backdrop.className = 'drawer-backdrop';
    document.body.appendChild(backdrop);
    drawer = document.createElement('aside');
    drawer.id = 'jornada-theme-drawer';
    drawer.className = 'drawer drawer--wide theme-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    document.body.appendChild(drawer);
  }
  return { drawer, backdrop };
}

function filteredRows(drawer) {
  const q = (drawer.querySelector('#jornada-theme-search')?.value ?? '').trim().toLowerCase();
  const ep = drawer.querySelector('#jornada-theme-ep')?.value ?? '';
  const tier = drawer.querySelector('#jornada-theme-tier')?.value ?? '';
  const cat = drawer.querySelector('#jornada-theme-cat')?.value ?? '';
  let list = drawerState.rows ?? [];
  if (q) list = list.filter((r) => (r.client_name ?? '').toLowerCase().includes(q));
  if (ep) list = list.filter((r) => r.ep_name === ep);
  if (tier) list = list.filter((r) => r.tier === tier);
  if (cat) list = list.filter((r) => r.nps_category === cat);
  return list;
}

function renderListView(drawer, title, subtitle) {
  const list = filteredRows(drawer);
  const uniqueClients = new Set(list.map((r) => r.client_id ?? r.response_id)).size;
  const rowsHtml = list
    .map(
      (r) => `<tr class="theme-drawer-row" data-response-id="${escapeAttr(r.response_id ?? r.client_id)}" tabindex="0">
        <td class="theme-drawer-row__name">${escapeHtml(r.client_name ?? '—')}</td>
        <td class="num">${escapeHtml(String(r.score ?? '—'))}</td>
        <td>${escapeHtml(r.nps_category ?? '—')}</td>
        <td>${escapeHtml(r.ep_name ?? '—')}</td>
        <td>${escapeHtml(r.tier ?? '—')}</td>
        <td class="num">${r.mechanisms_count != null ? escapeHtml(String(r.mechanisms_count)) : '—'}</td>
        <td><button type="button" class="btn btn--ghost btn--sm theme-drawer-open-detail" data-response-id="${escapeAttr(r.response_id ?? r.client_id)}">Ver</button></td>
      </tr>`,
    )
    .join('');

  return `
    <div class="theme-drawer__sticky">
      <header class="drawer__header theme-drawer__header">
        <div class="drawer__header-text">
          <h2 class="drawer__title">${escapeHtml(title ?? 'Clientes')}</h2>
          <p class="drawer__subtitle">${escapeHtml(String(uniqueClients))} clientes no recorte</p>
        </div>
        <button type="button" class="drawer__close" id="jornada-theme-drawer-close" aria-label="Fechar">×</button>
      </header>
      <div class="drawer-filters theme-drawer__filters">
        <input class="text-input" id="jornada-theme-search" type="search" placeholder="Buscar cliente" aria-label="Buscar cliente" />
        <select class="select-input" id="jornada-theme-ep" aria-label="Filtrar EP"><option value="">Todos EP</option>${drawerState._epOptions ?? ''}</select>
        <select class="select-input" id="jornada-theme-tier" aria-label="Filtrar Tier"><option value="">Todos Tiers</option>${drawerState._tierOptions ?? ''}</select>
        <select class="select-input" id="jornada-theme-cat" aria-label="Filtrar categoria NPS">
          <option value="">Todas categorias</option>
          ${['Promotor', 'Neutro', 'Detrator'].map((c) => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="drawer__body theme-drawer__body">
      ${
        list.length
          ? `<table class="gd-table theme-drawer-list"><thead><tr>
          <th>Cliente</th><th class="num">Nota</th><th>Categoria</th><th>EP</th><th>Tier</th><th class="num">Mec.</th><th>Ação</th>
        </tr></thead><tbody>${rowsHtml}</tbody></table>
        <div class="theme-drawer-cards">${list
          .map(
            (r) => `<article class="theme-drawer-card" data-response-id="${escapeAttr(r.response_id ?? r.client_id)}">
            <div><strong>${escapeHtml(r.client_name ?? '—')}</strong><span class="note-muted"> · ${escapeHtml(r.nps_category ?? '—')}</span></div>
            <div class="note-muted">Nota ${r.score ?? '—'} · ${escapeHtml(r.ep_name ?? '—')} · ${escapeHtml(r.tier ?? '—')}</div>
            <button type="button" class="btn btn--secondary btn--sm theme-drawer-open-detail" data-response-id="${escapeAttr(r.response_id ?? r.client_id)}">Ver detalhe</button>
          </article>`,
          )
          .join('')}</div>`
          : '<p class="placeholder-note">Nenhum cliente neste recorte.</p>'
      }
    </div>`;
}

function renderDetailView(drawer, row) {
  const cycleCode = drawerState.cycleCode;
  const topicRows =
    cycleCode && row.response_id
      ? getResponseTopics(cycleCode).filter((t) => t.response_id === row.response_id)
      : [];
  const commentBlocks = (row.comment ?? '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      if (lines.length >= 2) return drawerQaBlock(lines[0], lines.slice(1).join('\n'));
      return drawerQaBlock('', block);
    })
    .join('');

  return `
    <div class="theme-drawer__sticky">
      <header class="drawer__header theme-drawer__header">
        <div class="drawer__header-text">
          <button type="button" class="btn btn--ghost theme-drawer-back" id="jornada-theme-back">← Voltar para lista</button>
          <h2 class="drawer__title">${escapeHtml(row.client_name ?? 'Cliente')}</h2>
          ${row.client_code ? `<p class="drawer__subtitle">Código ${escapeHtml(row.client_code)}</p>` : ''}
        </div>
        <button type="button" class="drawer__close" id="jornada-theme-drawer-close" aria-label="Fechar">×</button>
      </header>
    </div>
    <div class="drawer__body theme-drawer__body">
      <div class="drawer-meta">
        <div class="drawer-meta__item"><span class="drawer-meta__label">EP</span><span class="drawer-meta__value">${escapeHtml(row.ep_name ?? '—')}</span></div>
        <div class="drawer-meta__item"><span class="drawer-meta__label">Nota</span><span class="drawer-meta__value">${row.score ?? '—'} · ${escapeHtml(row.nps_category ?? '—')}</span></div>
        <div class="drawer-meta__item"><span class="drawer-meta__label">Tier</span><span class="drawer-meta__value">${escapeHtml(row.tier ?? '—')}</span></div>
      </div>
      <h3 class="drawer-section-title">Perfil</h3>
      <div class="drawer-meta">
        <div class="drawer-meta__item"><span class="drawer-meta__label">Reserva</span><span class="drawer-meta__value">${escapeHtml(fmtMoneyShort(row.reserve))}</span></div>
        <div class="drawer-meta__item"><span class="drawer-meta__label">Aporte</span><span class="drawer-meta__value">${escapeHtml(fmtMoneyShort(row.contribution))}</span></div>
        <div class="drawer-meta__item"><span class="drawer-meta__label">Indicador de débito</span><span class="drawer-meta__value">${row.has_debts === true ? 'Sim' : row.has_debts === false ? 'Não' : '—'}</span></div>
        <div class="drawer-meta__item"><span class="drawer-meta__label">Mecanismos</span><span class="drawer-meta__value">${row.mechanisms_count ?? '—'}</span></div>
        <div class="drawer-meta__item"><span class="drawer-meta__label">Reuniões</span><span class="drawer-meta__value">${row.meetings_count ?? '—'}</span></div>
        <div class="drawer-meta__item"><span class="drawer-meta__label">Etapa</span><span class="drawer-meta__value">${escapeHtml(row.journey_stage ?? '—')}</span></div>
      </div>
      <h3 class="drawer-section-title">Resposta NPS</h3>
      ${commentBlocks || '<p class="note-muted">Sem comentário.</p>'}
      <h3 class="drawer-section-title">Temas identificados</h3>
      ${drawerTopicChips(topicRows.map((t) => ({ topic: t.topic, valence: t.valence, confidence: t.confidence, classification_source: t.classification_source, reviewed: t.reviewed })))}
    </div>`;
}

function paint(drawer, title, subtitle) {
  if (drawerState.view === 'detail' && drawerState.selectedId) {
    const row = drawerState.rows.find(
      (r) => (r.response_id ?? r.client_id) === drawerState.selectedId,
    );
    drawer.innerHTML = row ? renderDetailView(drawer, row) : renderListView(drawer, title, subtitle);
  } else {
    drawer.innerHTML = renderListView(drawer, title, subtitle);
  }
  bindDrawerEvents(drawer, title, subtitle);
}

function bindDrawerEvents(drawer, title, subtitle) {
  drawer.querySelector('#jornada-theme-drawer-close')?.addEventListener('click', closeJornadaThemeDrawer);
  drawer.querySelector('#jornada-theme-back')?.addEventListener('click', () => {
    drawerState.view = 'list';
    drawerState.selectedId = null;
    paint(drawer, title, subtitle);
  });
  const rerender = () => {
    if (drawerState.view === 'list') paint(drawer, title, subtitle);
  };
  drawer.querySelector('#jornada-theme-search')?.addEventListener('input', rerender);
  drawer.querySelector('#jornada-theme-ep')?.addEventListener('change', rerender);
  drawer.querySelector('#jornada-theme-tier')?.addEventListener('change', rerender);
  drawer.querySelector('#jornada-theme-cat')?.addEventListener('change', rerender);

  const openDetail = (id) => {
    if (!id) return;
    drawerState.view = 'detail';
    drawerState.selectedId = id;
    paint(drawer, title, subtitle);
  };
  drawer.querySelectorAll('.theme-drawer-open-detail').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail(btn.dataset.responseId);
    });
  });
  drawer.querySelectorAll('.theme-drawer-row').forEach((row) => {
    row.addEventListener('click', () => openDetail(row.dataset.responseId));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetail(row.dataset.responseId);
      }
    });
  });
  drawer.querySelectorAll('.theme-drawer-card').forEach((card) => {
    card.querySelector('.theme-drawer-open-detail')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail(card.dataset.responseId);
    });
  });
}

export function openJornadaThemeDrawer({ title, subtitle, rows, cycleCode, onFilter }) {
  const { drawer, backdrop } = ensureDrawerDom();
  drawerState = {
    rows: rows ?? [],
    cycleCode: cycleCode ?? null,
    view: 'list',
    selectedId: null,
    _epOptions: [...new Set((rows ?? []).map((r) => r.ep_name).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((ep) => `<option value="${escapeAttr(ep)}">${escapeHtml(ep)}</option>`)
      .join(''),
    _tierOptions: [...new Set((rows ?? []).map((r) => r.tier).filter(Boolean))]
      .sort()
      .map((t) => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`)
      .join(''),
  };
  paint(drawer, title, subtitle);
  onFilter?.({ count: rows?.length ?? 0 });

  drawer.classList.add('is-open');
  backdrop.classList.add('is-open');
  backdrop.setAttribute('aria-expanded', 'true');
  drawer.focus();
  backdrop.onclick = closeJornadaThemeDrawer;
}

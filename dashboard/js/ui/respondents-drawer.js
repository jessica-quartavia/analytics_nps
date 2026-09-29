import {
  getCycleSummary,
  getPopulationAudit,
  getCycles,
  getGlobalFilterContext,
} from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatDate } from '../utils/format.js';
import {
  filterRespondentRows,
  filterRespondentTableRows,
  dedupeStatsFromAudit,
} from '../data/population-transparency.mjs';

const PAGE_SIZES = [25, 50, 100];

let state = {
  page: 1,
  pageSize: 25,
  search: '',
  ep: '',
  category: '',
};

function epOptions(rows) {
  return [...new Set(rows.map((r) => r.ep_name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
}

function renderTableBody(pageRows) {
  if (!pageRows.length) {
    return '<tr><td colspan="6" class="placeholder-note">Nenhum respondente neste recorte.</td></tr>';
  }
  return pageRows
    .map(
      (r) => `
    <tr>
      <td class="col-client">${escapeHtml(r.client_name ?? '—')}</td>
      <td>${escapeHtml(r.client_code ?? '—')}</td>
      <td class="col-ep">${escapeHtml(r.ep_name ?? '—')}</td>
      <td class="num">${r.score}</td>
      <td>${escapeHtml(r.nps_category ?? '—')}</td>
      <td>${escapeHtml(formatDate(r.submitted_at))}</td>
    </tr>`,
    )
    .join('');
}

export function closeRespondentsDrawer() {
  document.getElementById('respondents-drawer')?.classList.remove('is-open');
  const backdrop = document.getElementById('respondents-drawer-backdrop');
  backdrop?.classList.remove('is-open');
  backdrop?.setAttribute('aria-expanded', 'false');
}

export function openRespondentsDrawer(cycleCode) {
  const drawer = document.getElementById('respondents-drawer');
  const backdrop = document.getElementById('respondents-drawer-backdrop');
  if (!drawer) return;

  const cycle = getCycles().find((c) => c.cycle_code === cycleCode);
  const summary = getCycleSummary(cycleCode);
  const globalFilters = getFilters();
  const filterCtx = getGlobalFilterContext(cycleCode, globalFilters);
  const allRows = filterRespondentRows(filterCtx?.rowsCurrent ?? [], cycleCode);
  const audit = getPopulationAudit();
  const dedupe = dedupeStatsFromAudit(audit);

  const filtered = filterRespondentTableRows(allRows, state);
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  if (state.page > pages) state.page = pages;
  const start = (state.page - 1) * state.pageSize;
  const pageRows = filtered.slice(start, start + state.pageSize);

  const eps = epOptions(allRows);
  const cycleLabel = cycle?.cycle_name ?? cycleCode;

  drawer.innerHTML = `
    <header class="drawer__header">
      <div>
        <h2>Respondentes — ${escapeHtml(cycleLabel)}</h2>
        <p class="drawer__subtitle">${escapeHtml(String(allRows.length))} clientes PHARUS com resposta válida.</p>
      </div>
      <button type="button" class="drawer__close" id="respondents-drawer-close" aria-label="Fechar">×</button>
    </header>
    <div class="drawer__body">
      <div class="respondents-summary">
        ${
          dedupe
            ? `<p><strong>${dedupe.raw_rows}</strong> respostas brutas · <strong>${dedupe.duplicates_treated}</strong> duplicidades tratadas · <strong>${dedupe.final_valid}</strong> clientes válidos</p>`
            : `<p><strong>${allRows.length}</strong> clientes válidos (detalhe de dedupe na auditoria de população).</p>`
        }
      </div>
      <div class="respondents-toolbar">
        <label class="respondents-toolbar__search">Buscar
          <input type="search" class="text-input" id="respondents-search" value="${escapeAttr(state.search)}" placeholder="Cliente ou código" />
        </label>
        <label>EP
          <select class="select-input" id="respondents-ep">
            <option value="">Todos</option>
            ${eps.map((e) => `<option value="${escapeAttr(e)}" ${state.ep === e ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
          </select>
        </label>
        <label>Categoria
          <select class="select-input" id="respondents-category">
            <option value="">Todas</option>
            <option value="Promotor" ${state.category === 'Promotor' ? 'selected' : ''}>Promotor</option>
            <option value="Neutro" ${state.category === 'Neutro' ? 'selected' : ''}>Neutro</option>
            <option value="Detrator" ${state.category === 'Detrator' ? 'selected' : ''}>Detrator</option>
          </select>
        </label>
        <label>Por página
          <select class="select-input" id="respondents-page-size">
            ${PAGE_SIZES.map((n) => `<option value="${n}" ${state.pageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="table-scroll">
        <table class="data-table gd-table" id="respondents-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Código</th>
              <th>EP</th>
              <th class="num">Nota</th>
              <th>Categoria</th>
              <th>Data da resposta</th>
            </tr>
          </thead>
          <tbody>${renderTableBody(pageRows)}</tbody>
        </table>
      </div>
      <div class="table-pagination">
        <button type="button" class="btn btn--ghost" id="respondents-prev" ${state.page <= 1 ? 'disabled' : ''}>Anterior</button>
        <span>Página ${state.page} de ${pages} · ${total} registros</span>
        <button type="button" class="btn btn--ghost" id="respondents-next" ${state.page >= pages ? 'disabled' : ''}>Próxima</button>
      </div>
    </div>`;

  drawer.classList.add('is-open');
  backdrop?.classList.add('is-open');
  backdrop?.setAttribute('aria-expanded', 'true');
  drawer.focus();

  const rerender = () => openRespondentsDrawer(cycleCode);

  drawer.querySelector('#respondents-drawer-close')?.addEventListener('click', closeRespondentsDrawer);
  backdrop?.addEventListener('click', closeRespondentsDrawer, { once: true });

  drawer.querySelector('#respondents-search')?.addEventListener('input', (e) => {
    state.search = e.target.value;
    state.page = 1;
    rerender();
  });
  drawer.querySelector('#respondents-ep')?.addEventListener('change', (e) => {
    state.ep = e.target.value;
    state.page = 1;
    rerender();
  });
  drawer.querySelector('#respondents-category')?.addEventListener('change', (e) => {
    state.category = e.target.value;
    state.page = 1;
    rerender();
  });
  drawer.querySelector('#respondents-page-size')?.addEventListener('change', (e) => {
    state.pageSize = Number(e.target.value);
    state.page = 1;
    rerender();
  });
  drawer.querySelector('#respondents-prev')?.addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    rerender();
  });
  drawer.querySelector('#respondents-next')?.addEventListener('click', () => {
    state.page = Math.min(pages, state.page + 1);
    rerender();
  });
}

export function bindRespondentsDrawer(cycleCode, signal) {
  document.getElementById('btn-ver-respondentes')?.addEventListener(
    'click',
    () => {
      state.page = 1;
      openRespondentsDrawer(cycleCode);
    },
    signal ? { signal } : undefined,
  );
}

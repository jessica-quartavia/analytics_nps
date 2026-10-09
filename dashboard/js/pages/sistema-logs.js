import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatDate } from '../utils/format.js';

let logsCache = [];
let loadWarnings = [];
let tableState = { search: '', action: '', email: '', page: '', periodFrom: '', periodTo: '' };

async function fetchLogs() {
  const endpoints = ['/api/system/logs', '/api/portal-audit/logs'];
  let lastError = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Resposta inválida de ${url}`);
      }
      if (!res.ok || json.ok === false) {
        throw new Error(json.error?.message ?? json.error ?? `HTTP ${res.status}`);
      }
      logsCache = Array.isArray(json.events) ? json.events : [];
      loadWarnings = Array.isArray(json.warnings) ? json.warnings : [];
      return logsCache;
    } catch (e) {
      lastError = e;
    }
  }
  logsCache = [];
  loadWarnings = [lastError?.message ?? 'Falha ao carregar logs'];
  return logsCache;
}

function eventTime(row) {
  return row.occurred_at ?? row.at ?? null;
}

function filterLogs(rows) {
  let out = [...rows];
  const q = tableState.search.toLowerCase();
  if (q) {
    out = out.filter(
      (r) =>
        (r.summary && String(r.summary).toLowerCase().includes(q)) ||
        (r.client_name && String(r.client_name).toLowerCase().includes(q)) ||
        (r.email && String(r.email).toLowerCase().includes(q)) ||
        (r.user_email && String(r.user_email).toLowerCase().includes(q)),
    );
  }
  if (tableState.action) out = out.filter((r) => r.action_type === tableState.action);
  const emailQ = tableState.email.toLowerCase();
  if (emailQ) {
    out = out.filter(
      (r) =>
        String(r.email ?? r.user_email ?? '')
          .toLowerCase()
          .includes(emailQ),
    );
  }
  if (tableState.page) {
    out = out.filter((r) => (r.page ?? r.origin ?? '') === tableState.page);
  }
  if (tableState.periodFrom) {
    out = out.filter((r) => String(eventTime(r) ?? '') >= tableState.periodFrom);
  }
  if (tableState.periodTo) {
    out = out.filter((r) => String(eventTime(r) ?? '').slice(0, 10) <= tableState.periodTo);
  }
  out.sort((a, b) => String(eventTime(b) ?? '').localeCompare(String(eventTime(a) ?? '')));
  return out;
}

function actionTypes(rows) {
  return [...new Set(rows.map((r) => r.action_type).filter(Boolean))].sort();
}

function pageOrigins(rows) {
  return [...new Set(rows.map((r) => r.page ?? r.origin).filter(Boolean))].sort();
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function openLogDrawer(row) {
  document.getElementById('sistema-log-drawer')?.remove();
  document.getElementById('sistema-log-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.id = 'sistema-log-backdrop';
  backdrop.className = 'drawer-backdrop is-open';
  backdrop.addEventListener('click', closeLogDrawer);

  const el = document.createElement('aside');
  el.id = 'sistema-log-drawer';
  el.className = 'drawer drawer--wide is-open';
  el.setAttribute('role', 'dialog');
  const label = row.action_label ?? row.action_type ?? '—';
  el.innerHTML = `
    <header class="drawer__header">
      <h2>Detalhe do log</h2>
      <button type="button" class="drawer__close" id="sistema-log-close">×</button>
    </header>
    <div class="drawer__body">
      <dl class="drawer-meta-list">
        <div><dt>Data/hora</dt><dd>${escapeHtml(formatDate(eventTime(row)) || '—')}</dd></div>
        <div><dt>Usuário</dt><dd>${escapeHtml(row.user_email ?? row.email ?? '—')}</dd></div>
        <div><dt>Ação</dt><dd>${escapeHtml(label)}</dd></div>
        <div><dt>Cliente</dt><dd>${escapeHtml(row.client_name ?? '—')}</dd></div>
        <div><dt>Origem</dt><dd>${escapeHtml(row.page ?? row.origin ?? '—')}</dd></div>
      </dl>
      <p><strong>Resumo:</strong> ${escapeHtml(row.summary ?? '—')}</p>
      ${
        row.before
          ? `<h3>Antes</h3><pre class="log-json">${escapeHtml(safeJson(row.before))}</pre>`
          : ''
      }
      ${
        row.after
          ? `<h3>Depois</h3><pre class="log-json">${escapeHtml(safeJson(row.after))}</pre>`
          : ''
      }
    </div>`;
  document.body.appendChild(backdrop);
  document.body.appendChild(el);
  el.querySelector('#sistema-log-close')?.addEventListener('click', closeLogDrawer);
}

function closeLogDrawer() {
  document.getElementById('sistema-log-drawer')?.remove();
  document.getElementById('sistema-log-backdrop')?.remove();
}

function renderTable(rows) {
  const types = actionTypes(logsCache);
  const pages = pageOrigins(logsCache);
  const filtered = filterLogs(rows).slice(0, 500);
  const body = filtered.length
    ? filtered
        .map(
          (r, i) => `
      <tr class="log-row" data-log-idx="${i}" tabindex="0">
        <td>${escapeHtml(formatDate(eventTime(r)) || '—')}</td>
        <td>${escapeHtml(r.user_email ?? r.email ?? '—')}</td>
        <td>${escapeHtml(r.action_label ?? r.action_type ?? '—')}</td>
        <td>${escapeHtml(r.client_name ?? '—')}</td>
        <td>${escapeHtml(r.page ?? r.origin ?? '—')}</td>
        <td class="col-hide-md">${escapeHtml(String(r.summary ?? '').slice(0, 120))}</td>
      </tr>`,
        )
        .join('')
    : '<tr><td colspan="6" class="placeholder-note">Nenhuma alteração registrada.</td></tr>';

  const warn =
    loadWarnings.length ?
      `<p class="note-muted gd-status--warn" role="status">${escapeHtml(loadWarnings.join(' · '))}</p>`
    : '';

  return `
    ${warn}
    <div class="table-toolbar">
      <label class="filter-field">Busca<input class="text-input" id="log-search" type="search" value="${escapeAttr(tableState.search)}" placeholder="Resumo ou cliente" /></label>
      <label class="filter-field">Tipo<select class="select-input" id="log-action"><option value="">Todos</option>${types.map((t) => `<option value="${escapeAttr(t)}" ${tableState.action === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></label>
      <label class="filter-field">Usuário<input class="text-input" id="log-email" type="search" value="${escapeAttr(tableState.email)}" placeholder="e-mail" /></label>
      <label class="filter-field">Página<select class="select-input" id="log-page"><option value="">Todas</option>${pages.map((p) => `<option value="${escapeAttr(p)}" ${tableState.page === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}</select></label>
      <label class="filter-field">De<input class="text-input" id="log-from" type="date" value="${escapeAttr(tableState.periodFrom)}" /></label>
      <label class="filter-field">Até<input class="text-input" id="log-to" type="date" value="${escapeAttr(tableState.periodTo)}" /></label>
    </div>
    <div class="table-scroll">
      <table class="data-table" id="sistema-logs-table">
        <thead><tr>
          <th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Cliente</th><th>Página</th><th class="col-hide-md">Resumo</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="note-muted">${filtered.length} evento(s) · exibindo até 500</p>`;
}

let filteredLogView = [];

function bindLogTable(host, onRefresh, signal) {
  filteredLogView = filterLogs(logsCache).slice(0, 500);
  const opts = signal ? { signal } : undefined;
  const bind = (id, fn) => host.querySelector(id)?.addEventListener('change', fn, opts);
  bind('#log-search', (e) => {
    tableState.search = e.target.value;
    onRefresh();
  });
  bind('#log-action', (e) => {
    tableState.action = e.target.value;
    onRefresh();
  });
  bind('#log-email', (e) => {
    tableState.email = e.target.value;
    onRefresh();
  });
  bind('#log-page', (e) => {
    tableState.page = e.target.value;
    onRefresh();
  });
  bind('#log-from', (e) => {
    tableState.periodFrom = e.target.value;
    onRefresh();
  });
  bind('#log-to', (e) => {
    tableState.periodTo = e.target.value;
    onRefresh();
  });
  host.querySelectorAll('.log-row').forEach((tr) => {
    tr.addEventListener(
      'click',
      () => {
        const row = filteredLogView[Number(tr.dataset.logIdx)];
        if (row) openLogDrawer(row);
      },
      opts,
    );
  });
}

export async function renderSistemaLogs(root, ctx = {}) {
  root.innerHTML = `<div class="gd-status" role="status"><p>Carregando logs…</p></div>`;
  await fetchLogs();

  const rerender = () => {
    const host = document.getElementById('sistema-logs-host');
    if (host) {
      host.innerHTML = renderTable(logsCache);
      bindLogTable(host, rerender, ctx.signal);
    }
  };

  root.innerHTML = `
    <header class="page-header">
      <div>
        <p class="eyebrow">Sistema</p>
        <h1 class="hero__title">Logs</h1>
        <p class="page-header__lead">Alterações operacionais: prioridade, VoC e planos de ação (Business Data + auditoria local).</p>
      </div>
    </header>
    <div id="sistema-logs-host"></div>`;
  rerender();
}

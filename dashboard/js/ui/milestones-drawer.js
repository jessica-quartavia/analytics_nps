import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatDate } from '../utils/format.js';

export function closeMilestonesDrawer() {
  document.getElementById('milestones-drawer')?.classList.remove('is-open');
  const backdrop = document.getElementById('milestones-drawer-backdrop');
  backdrop?.classList.remove('is-open');
  backdrop?.setAttribute('aria-expanded', 'false');
}

export function openMilestonesDrawer({ title, subtitle, rows }) {
  let drawer = document.getElementById('milestones-drawer');
  let backdrop = document.getElementById('milestones-drawer-backdrop');
  if (!drawer) {
    backdrop = document.createElement('div');
    backdrop.id = 'milestones-drawer-backdrop';
    backdrop.className = 'drawer-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
    drawer = document.createElement('aside');
    drawer.id = 'milestones-drawer';
    drawer.className = 'drawer drawer--wide';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', 'Clientes no recorte');
    document.body.appendChild(drawer);
  }

  const body =
    rows?.length ?
      `<div class="table-scroll"><table class="gd-table"><thead><tr>
        <th>Cliente</th><th>EP anterior</th><th>EP atual</th><th>Ant.</th><th>Atual</th><th>Migração</th><th>Eventos</th>
      </tr></thead><tbody>${rows
        .map(
          (r) => `<tr>
          <td>${escapeHtml(r.client_name ?? '—')}</td>
          <td>${escapeHtml(r.ep_name_previous ?? '—')}</td>
          <td>${escapeHtml(r.ep_name_current ?? r.ep_name ?? '—')}</td>
          <td class="num">${escapeHtml(String(r.previous_score ?? '—'))}</td>
          <td class="num">${escapeHtml(String(r.current_score ?? r.score ?? '—'))}</td>
          <td>${escapeHtml(r.migration ?? '—')}</td>
          <td>${escapeHtml(r.events_label ?? '—')}</td>
        </tr>`,
        )
        .join('')}</tbody></table></div>`
    : '<p class="placeholder-note">Nenhum cliente neste recorte.</p>';

  drawer.innerHTML = `
    <header class="drawer__header">
      <div>
        <h2>${escapeHtml(title ?? 'Clientes')}</h2>
        ${subtitle ? `<p class="drawer__subtitle">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <button type="button" class="drawer__close" id="milestones-drawer-close" aria-label="Fechar">×</button>
    </header>
    <div class="drawer__body">${body}</div>`;

  drawer.classList.add('is-open');
  backdrop.classList.add('is-open');
  backdrop.setAttribute('aria-expanded', 'true');
  drawer.focus();

  drawer.querySelector('#milestones-drawer-close')?.addEventListener('click', closeMilestonesDrawer, {
    once: true,
  });
  backdrop.addEventListener('click', closeMilestonesDrawer, { once: true });
}

export function milestoneClientRowsFromBetween(events, predicate) {
  return (events ?? []).filter(predicate).map((e) => ({
    ...e,
    events_label: e.ep_changed ? `Troca EP (${e.ep_changes})` : 'Sem troca EP entre ciclos',
  }));
}

export function milestoneClientRowsFromEntries(entries, predicate) {
  return (entries ?? []).filter(predicate).map((e) => ({
    client_name: e.client_name,
    ep_name: e.ep_name,
    score: e.score,
    previous_score: e.previous_score,
    migration: e.migration,
    events_label: [
      e.changed_ep_since_previous_response ? 'Troca EP' : null,
      e.has_mechanism_before_response ? 'Mecanismo' : null,
      e.frozen_at_response ? 'Congelado' : null,
    ]
      .filter(Boolean)
      .join(' · ') || '—',
  }));
}

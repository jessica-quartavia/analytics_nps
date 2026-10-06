import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { formatDate, formatNps } from '../utils/format.js';
import { drawerShell, drawerMetaGrid } from './drawer-layout.mjs';

let hostEl = null;

function badgeCategory(cat) {
  const c = (cat ?? '').toLowerCase();
  let cls = 'badge--neutral-soft';
  if (c.includes('promot')) cls = 'badge--promoter';
  else if (c.includes('detrat')) cls = 'badge--detractor';
  else if (c.includes('neutr')) cls = 'badge--passive';
  return `<span class="badge ${cls}">${escapeHtml(cat ?? '—')}</span>`;
}

function epLabel(row) {
  if (row.ep_at_response_source === 'transferencias_ep' || row.ep_at_response_source === 'transfer') {
    return `${row.ep_current_or_resolved ?? '—'} <span class="note-muted">(EP na data da resposta)</span>`;
  }
  if (row.ep_at_response_source === 'client_current') {
    return `${row.ep_current_or_resolved ?? '—'} <span class="note-muted">(EP atual — histórico indisponível)</span>`;
  }
  return escapeHtml(row.ep_current_or_resolved ?? '—');
}

function buildTimelineEvents(responses, cohort) {
  const events = [];
  const entryDate = cohort?.payment_entry_date ?? responses[0]?.payment_entry_date ?? null;
  if (entryDate) {
    events.push({
      date: String(entryDate).slice(0, 10),
      type: 'entrada',
      label: 'Entrada no programa (pagamento)',
      detail: cohort?.payment_entry_source
        ? `Fonte: ${cohort.payment_entry_source}`
        : String(entryDate).slice(0, 10),
    });
  }

  const epDates = new Set();
  for (const r of responses) {
    const epd = r.last_ep_transfer_before_response;
    if (epd && !epDates.has(epd)) {
      epDates.add(epd);
      events.push({
        date: String(epd).slice(0, 10),
        type: 'ep',
        label: 'Troca de EP',
        detail: `Até a próxima resposta: contagem PIT por medição`,
      });
    }
  }

  for (const r of responses) {
    const meetDetail =
      r.meetings_before_response != null
        ? `${r.meetings_before_response} reuniões até a data · recência: ${r.meeting_recency_bucket ?? '—'}`
        : 'Sem registro de reuniões';
    events.push({
      date: r.response_date,
      type: 'nps',
      label: `NPS · ${r.nps_cycle ?? '—'}`,
      detail: `Nota ${r.score ?? '—'} · ${r.nps_category ?? '—'} · ${meetDetail}`,
      response: r,
    });
    if (r.refund_before_response) {
      events.push({
        date: r.response_date,
        type: 'reembolso',
        label: 'Reembolso (antes da resposta)',
        detail: 'Flag PIT',
      });
    }
    if (r.refund_after_response) {
      events.push({
        date: r.response_date,
        type: 'reembolso',
        label: 'Reembolso (após a resposta)',
        detail: 'Flag PIT — evento posterior',
      });
    }
    if (r.churn_before_response && cohort?.data_churn) {
      events.push({
        date: String(cohort.data_churn).slice(0, 10),
        type: 'churn',
        label: 'Churn (antes da resposta)',
        detail: '',
      });
    } else if (r.churn_after_response && cohort?.data_churn) {
      events.push({
        date: String(cohort.data_churn).slice(0, 10),
        type: 'churn',
        label: 'Churn (após a resposta)',
        detail: '',
      });
    }
  }
  events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return events;
}

function renderResponseContext(r) {
  return `<div class="historico-pit-context">
    <h4>Contexto na data da resposta</h4>
    <dl class="historico-pit-dl">
      <dt>Tempo de casa</dt><dd>${r.months_since_entry != null ? `${r.months_since_entry} meses` : '—'}</dd>
      <dt>Reuniões até então</dt><dd>${r.meetings_before_response ?? '—'}</dd>
      <dt>Dias desde última reunião</dt><dd>${r.days_since_last_meeting_at_response ?? '—'}</dd>
      <dt>Mecanismos implementados</dt><dd>${r.implemented_mechanisms_before_response ?? '—'}${
        r.mechanism_temporal_status === 'date_unavailable'
          ? ' <span class="note-muted">(data do mecanismo indisponível — não assumido antes da resposta)</span>'
          : ''
      }</dd>
      <dt>Valor pago até então</dt><dd>${r.amount_paid_before_response != null ? r.amount_paid_before_response.toLocaleString('pt-BR') : '—'}</dd>
      <dt>Trocas de EP até então</dt><dd>${r.ep_transfers_before_response ?? 0}</dd>
      <dt>EP</dt><dd>${epLabel(r)}</dd>
    </dl>
  </div>`;
}

export function renderHistoricoClientDrawerHtml(clientId, enrichedRows, cohort) {
  const responses = [...(enrichedRows ?? [])].sort((a, b) =>
    String(a.response_date).localeCompare(String(b.response_date)),
  );
  const last = responses[responses.length - 1];
  const scores = responses.map((r) => r.score).filter((s) => s != null);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const meetingCounts = responses.map((r) => r.meetings_before_response ?? 0);
  const totalMeetings = meetingCounts.length ? Math.max(...meetingCounts) : 0;
  const mech = responses.filter((r) => r.has_implemented_mechanism_at_response).length;

  const events = buildTimelineEvents(responses, cohort);
  const timelineHtml = events
    .map((ev) => {
      const icon =
        ev.type === 'nps'
          ? '◆'
          : ev.type === 'entrada'
            ? '●'
            : ev.type === 'reuniao'
              ? '○'
              : ev.type === 'ep'
                ? '↔'
                : ev.type === 'mec'
                  ? '▸'
                  : '×';
      const pit =
        ev.response && ev.type === 'nps'
          ? `<div class="historico-timeline-pit" hidden data-pit-for="${escapeAttr(ev.response.response_id)}">${renderResponseContext(ev.response)}</div>`
          : '';
      return `<li class="historico-timeline-item historico-timeline-item--${ev.type}" ${ev.response ? `data-nps-id="${escapeAttr(ev.response.response_id)}" tabindex="0" role="button"` : ''}>
        <span class="historico-timeline-icon" aria-hidden="true">${icon}</span>
        <div class="historico-timeline-body">
          <strong>${escapeHtml(ev.label)}</strong>
          <span class="note-muted">${escapeHtml(formatDate(ev.date))}</span>
          <p>${escapeHtml(ev.detail)}</p>
          ${pit}
        </div>
      </li>`;
    })
    .join('');

  return drawerShell({
    title: last?.client_name ?? cohort?.client_name ?? 'Cliente',
    subtitle: cohort?.safra_trimestre
      ? `Safra ${cohort.safra_trimestre}${cohort.safra_ano ? ` (${cohort.safra_ano})` : ''} · entrada ${cohort.payment_entry_date ? formatDate(cohort.payment_entry_date) : '—'}`
      : last?.safra_trimestre
        ? `Safra ${last.safra_trimestre} · entrada ${last.payment_entry_date ? formatDate(last.payment_entry_date) : '—'}`
        : undefined,
    bodyHtml: `${drawerMetaGrid([
      { label: 'Respostas NPS', value: String(responses.length) },
      { label: 'Última nota', value: last?.score ?? '—' },
      { label: 'Nota média', value: avg != null ? avg.toFixed(1) : '—' },
      {
        label: 'Tempo de casa (últ.)',
        value: last?.months_since_entry != null ? `${last.months_since_entry} m` : '—',
      },
      { label: 'Reuniões (máx PIT)', value: String(totalMeetings) },
      { label: 'Respostas c/ mecanismo', value: String(mech) },
    ])}
    <section class="safras-drawer-section">
      <h4>Timeline</h4>
      <ul class="historico-timeline">${timelineHtml || '<li>Sem eventos</li>'}</ul>
    </section>`,
  });
}

export function openHistoricoClientDrawer(clientId, enrichedAll, cohorts) {
  const cohort = (cohorts ?? []).find((c) => c.client_id === clientId);
  const rows = (enrichedAll ?? []).filter((r) => r.client_id === clientId);
  if (!rows.length && !cohort) return;

  const drawer = document.getElementById('client-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (!drawer) return;

  drawer.classList.remove('drawer--historico', 'drawer--wide');
  drawer.innerHTML = '';
  drawer.classList.add('drawer--historico', 'drawer--wide');
  drawer.innerHTML = renderHistoricoClientDrawerHtml(clientId, rows, cohort);
  drawer.classList.add('is-open');
  backdrop?.classList.add('is-visible', 'is-open');
  backdrop?.setAttribute('aria-hidden', 'false');
  hostEl = drawer;

  hostEl.querySelectorAll('[data-nps-id]').forEach((el) => {
    const toggle = () => {
      const id = el.dataset.npsId;
      const pit = hostEl.querySelector(`[data-pit-for="${CSS.escape(id)}"]`);
      if (pit) pit.hidden = !pit.hidden;
    };
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        toggle();
      }
    });
  });

  hostEl.querySelector('#drawer-close')?.addEventListener('click', closeHistoricoClientDrawer);
  backdrop?.addEventListener('click', closeHistoricoClientDrawer, { once: true });
}

export function closeHistoricoClientDrawer() {
  const drawer = document.getElementById('client-drawer');
  drawer?.classList.remove('is-open', 'drawer--historico', 'drawer--wide');
  drawer.innerHTML = '';
  const backdrop = document.getElementById('drawer-backdrop');
  backdrop?.classList.remove('is-visible', 'is-open');
  backdrop?.setAttribute('aria-hidden', 'true');
  hostEl = null;
}

import { escapeHtml, escapeAttr } from '../utils/escape-html.js';
import { buildMethodologyModel } from '../data/methodology-sections.mjs';

let open = false;
let pendingSectionId = null;

function renderSectionBlock(section) {
  return `
    <article class="method-section" id="meth-${escapeAttr(section.id)}" data-meth-id="${escapeAttr(section.id)}">
      <h3 class="method-section__title">${escapeHtml(section.title)}</h3>
      <div class="method-block">
        <h4 class="method-block__label">Em linguagem simples</h4>
        <p>${escapeHtml(section.simple)}</p>
      </div>
      <div class="method-block">
        <h4 class="method-block__label">Regra técnica</h4>
        <pre class="method-pre">${escapeHtml(section.technical)}</pre>
      </div>
      <div class="method-block method-block--inline">
        <div><h4 class="method-block__label">Fonte</h4><p class="note-muted">${escapeHtml(section.source)}</p></div>
        <div><h4 class="method-block__label">Limitação</h4><p class="note-muted">${escapeHtml(section.limitation)}</p></div>
      </div>
      ${section.extraHtml ?? ''}
    </article>`;
}

function filterSections(sections, query) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return sections;
  return sections.filter((s) => {
    const blob = [s.title, s.simple, s.technical, s.source, ...(s.keywords ?? [])].join(' ').toLowerCase();
    return blob.includes(q);
  });
}

function renderQualityTable(rows) {
  return `
    <table class="data-table method-quality-table">
      <thead><tr><th>Fonte / domínio</th><th>Cobertura</th><th>Temporalidade</th><th>Qualidade</th><th>Observação</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
          <td>${escapeHtml(r.domain)}</td>
          <td>${escapeHtml(r.coverage)}</td>
          <td>${escapeHtml(r.time)}</td>
          <td>${escapeHtml(r.quality)}</td>
          <td>${escapeHtml(r.note)}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;
}

function renderBody(ctx, { searchQuery = '', activeSectionId = null } = {}) {
  const model = buildMethodologyModel(ctx);
  const sections = filterSections(model.sections, searchQuery);
  const nav = model.sections
    .map(
      (s) =>
        `<a class="method-nav__link${activeSectionId === s.id ? ' is-active' : ''}" href="#meth-${escapeAttr(s.id)}" data-meth-nav="${escapeAttr(s.id)}">${escapeHtml(s.title)}</a>`,
    )
    .join('');

  const versionChips = Object.entries(model.versions ?? {})
    .map(([k, v]) => `<span class="chip-modern">${escapeHtml(k)}: ${escapeHtml(String(v))}</span>`)
    .join('');

  const sectionHtml = sections
    .map((s) => {
      let html = renderSectionBlock(s);
      if (s.id === 'data-quality') html += renderQualityTable(model.qualityRows);
      return html;
    })
    .join('');

  return `
    <header class="drawer__header method-drawer__header">
      <div class="drawer__header-text">
        <h2 class="drawer__title">Metodologia do Analytics NPS</h2>
        <p class="drawer__subtitle">Regras de cálculo, fontes, qualidade dos dados e limitações da análise.</p>
      </div>
      <button type="button" class="drawer__close" id="methodology-close" aria-label="Fechar">×</button>
    </header>
    <div class="method-drawer__toolbar">
      <input type="search" class="text-input method-search" id="methodology-search" placeholder="Buscar na metodologia (NPS, Tier, Valência…)" value="${escapeAttr(searchQuery)}" aria-label="Buscar na metodologia" />
      <div class="method-versions">${versionChips}</div>
    </div>
    <div class="method-drawer__layout">
      <nav class="method-nav" aria-label="Índice da metodologia">${nav}</nav>
      <div class="method-drawer__content" id="methodology-content">
        ${sections.length ? sectionHtml : '<p class="note-muted">Nenhum tópico encontrado para esta busca.</p>'}
        <div class="method-callout method-callout--highlight">
          <strong>BASE QV somente leitura</strong>
          <p>Este projeto usa BASE QV apenas para leitura (SELECT / export). Sem INSERT, UPDATE, DELETE ou migrations na base operacional.</p>
        </div>
      </div>
    </div>`;
}

function scrollToSection(sectionId) {
  if (!sectionId) return;
  const el = document.getElementById(`meth-${sectionId}`);
  const scroller = document.querySelector('#methodology-drawer .method-drawer__content');
  if (el && scroller) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function bindDrawerInteractions(drawer, getContext) {
  drawer.querySelector('#methodology-close')?.addEventListener('click', closeMethodologyDrawer);

  const search = drawer.querySelector('#methodology-search');
  search?.addEventListener('input', () => {
    const q = search.value;
    drawer.innerHTML = renderBody(buildCtx(getContext()), { searchQuery: q, activeSectionId: pendingSectionId });
    drawer.classList.add('drawer--wide', 'method-drawer');
    bindDrawerInteractions(drawer, getContext);
    if (pendingSectionId) scrollToSection(pendingSectionId);
  });

  drawer.querySelectorAll('[data-meth-nav]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      pendingSectionId = link.dataset.methNav;
      scrollToSection(pendingSectionId);
      drawer.querySelectorAll('.method-nav__link').forEach((l) => l.classList.toggle('is-active', l === link));
    });
  });
}

function showMethodologyError(message) {
  const host = document.getElementById('page-content');
  if (!host) return;
  let banner = document.getElementById('methodology-error-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'methodology-error-banner';
    banner.className = 'filter-recorte-banner gd-status--error';
    banner.setAttribute('role', 'alert');
    host.prepend(banner);
  }
  banner.textContent = message;
  banner.hidden = false;
  setTimeout(() => {
    banner.hidden = true;
  }, 6000);
}

export function openMethodologyDrawer(ctx, sectionId = null) {
  const drawer = document.getElementById('methodology-drawer');
  const backdrop = document.getElementById('methodology-drawer-backdrop');
  if (!drawer || !backdrop) {
    console.error('[methodology] Elementos #methodology-drawer ou backdrop ausentes no DOM.');
    showMethodologyError('Não foi possível abrir a metodologia.');
    return;
  }
  pendingSectionId = sectionId;
  drawer.innerHTML = renderBody(ctx, { activeSectionId: sectionId });
  drawer.classList.add('drawer--wide', 'method-drawer', 'is-open');
  backdrop.classList.add('is-open');
  drawer.removeAttribute('hidden');
  backdrop.removeAttribute('hidden');
  drawer.setAttribute('aria-hidden', 'false');
  backdrop.setAttribute('aria-hidden', 'false');
  backdrop.setAttribute('aria-expanded', 'true');
  open = true;
  bindDrawerInteractions(drawer, () => ctx);
  backdrop.addEventListener('click', closeMethodologyDrawer, { once: true });
  requestAnimationFrame(() => scrollToSection(sectionId));
  drawer.focus();
}

export function closeMethodologyDrawer() {
  const drawer = document.getElementById('methodology-drawer');
  const backdrop = document.getElementById('methodology-drawer-backdrop');
  if (drawer) {
    drawer.classList.remove('is-open', 'method-drawer');
    drawer.setAttribute('aria-hidden', 'true');
  }
  if (backdrop) {
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('aria-expanded', 'false');
  }
  open = false;
  pendingSectionId = null;
}

export function bindMethodologyTrigger(getContext) {
  document.getElementById('open-methodology')?.addEventListener('click', (e) => {
    e.preventDefault();
    openMethodologyDrawer(buildCtx(getContext()));
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.methodology-open[data-meth-section]');
    if (!btn) return;
    e.preventDefault();
    openMethodologyDrawer(buildCtx(getContext()), btn.dataset.methSection);
  });
}

function buildCtx(raw) {
  const cycleCode = raw?.cycleCode;
  return {
    snapshot: raw?.snapshot,
    cycleSummary: raw?.cycleSummary,
    populationAudit: raw?.populationAudit,
    cycleCode,
    paired: raw?.paired,
    changeDrivers: raw?.changeDrivers,
  };
}

export function methodologyOpenButton(sectionId, label = 'Ver metodologia') {
  return `<button type="button" class="btn btn--ghost btn--sm methodology-open" data-meth-section="${escapeAttr(sectionId)}">${escapeHtml(label)}</button>`;
}

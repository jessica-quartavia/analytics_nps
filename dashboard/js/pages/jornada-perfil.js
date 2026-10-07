import { getGlobalFilterContext } from '../data/analytics-store.js';
import { getFilters } from '../filters/global-filters.js';
import {
  renderFilterRecorteBanner,
  filtersForJornadaPopulationView,
} from '../filters/filter-context.mjs';
import { renderJornadaMarcosSection, bindJornadaMarcos } from './jornada-perfil-marcos.js';
import { renderJornadaMechanismsSection } from './jornada-perfil-mechanisms.js';
import { renderJornadaStageSection } from './jornada-perfil-journey.js';
import { renderJornadaFinancialProfileSection, bindJornadaFinancialProfile } from './movimento-financial-profile.js';
import { renderJornadaThemesSection, bindJornadaThemes } from './jornada-perfil-themes.js';
import { closeJornadaThemeDrawer } from '../ui/jornada-theme-drawer.js';
import { closeMilestonesDrawer } from '../ui/milestones-drawer.js';
import { renderDataSourceNotice } from '../ui/data-source-notice.mjs';

export function renderJornadaPerfil(root, ctx = {}) {
  const signal = ctx.signal;
  const filters = getFilters();
  const populationFilters = filtersForJornadaPopulationView(filters);
  const filterCtx = getGlobalFilterContext(filters.cycleCode, populationFilters);

  root.innerHTML = `
    <header class="page-header">
      <div>
        <p class="eyebrow">Jornada & Perfil</p>
        <h1 class="hero__title">Quem são esses clientes e o que viveram na jornada?</h1>
        <p class="page-header__lead">Entenda como perfil financeiro, marcos da jornada e eventos operacionais se distribuem entre Promotores, Neutros e Detratores.</p>
        <p class="note-muted">As comparações mostram associações observadas nos dados. Não representam relação causal.</p>
      </div>
    </header>
    ${renderDataSourceNotice('jornada-perfil')}
    ${renderFilterRecorteBanner(filterCtx)}
    ${renderJornadaMarcosSection(filterCtx)}
    ${renderJornadaMechanismsSection(filterCtx)}
    ${renderJornadaStageSection(filterCtx)}
    ${renderJornadaFinancialProfileSection(filterCtx)}
    ${renderJornadaThemesSection(filterCtx)}
  `;

  bindJornadaMarcos(root, filterCtx, signal);
  bindJornadaFinancialProfile();
  bindJornadaThemes(root, filterCtx, signal, () => renderJornadaPerfil(root, ctx));

  if (signal) {
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          closeMilestonesDrawer();
          closeJornadaThemeDrawer();
        }
      },
      { signal },
    );
  }

  const hash = location.hash;
  if (hash.includes('jornada-temas') || hash.includes('tema=')) {
    requestAnimationFrame(() => {
      document.getElementById('jornada-temas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (hash.includes('jornada-financial')) {
    requestAnimationFrame(() => {
      document.getElementById('jornada-financial')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

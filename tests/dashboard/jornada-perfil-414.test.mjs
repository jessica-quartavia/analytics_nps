import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filtersForJornadaPopulationView,
  categoryDenomsFromContext,
} from '../../dashboard/js/filters/filter-context.mjs';
import { mechanismBucket } from '../../dashboard/js/data/jornada-perfil-view.mjs';
import {
  getThemeProfileFilters,
  setThemeProfileFilters,
  resetThemeProfileFilters,
} from '../../dashboard/js/filters/theme-profile-filters.mjs';
import { isClientRecorteActive } from '../../dashboard/js/data/store-core.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dash = join(root, 'dashboard');

function read(rel) {
  return readFileSync(join(dash, rel), 'utf8');
}

describe('ETAPA 4.14 — Jornada & Perfil', () => {
  it('Set/2026 — Tier distribuição oficial', () => {
    const doc = JSON.parse(readFileSync(join(root, 'data/processed/nps_financial_profile.json'), 'utf8'));
    const dist = doc.financial_profile_coverage?.tier_distribution ?? {};
    assert.equal(dist.T1, 67);
    assert.equal(dist.T2, 48);
    assert.equal(dist.T3, 98);
    assert.equal(dist.T4, 27);
    assert.equal(dist.unavailable, 13);
    assert.equal(
      (dist.T1 ?? 0) + (dist.T2 ?? 0) + (dist.T3 ?? 0) + (dist.T4 ?? 0) + (dist.unavailable ?? 0),
      253,
    );
    assert.equal(doc.nps_by_tier?.T1?.n, 67);
    assert.ok(Math.abs(doc.nps_by_tier?.T1?.nps - 49.3) < 0.2);
  });

  it('Set/2026 — P/N/D respondentes oficiais', () => {
    const summaries = JSON.parse(readFileSync(join(root, 'data/processed/cycle_summary.json'), 'utf8'));
    const row = summaries.cycles?.find((c) => c.cycle_code === 'NPS-2026-SET-PHARUS');
    assert.ok(row);
    assert.equal(row.valid_responses, 253);
    assert.equal(row.promoters, 174);
    assert.equal(row.passives ?? row.neutrals, 47);
    assert.equal(row.detractors, 32);
  });

  it('tema/valência não entram no recorte de população da Jornada', () => {
    const stripped = filtersForJornadaPopulationView({
      cycleCode: 'NPS-2026-SET-PHARUS',
      topic: 'Resultados',
      valence: 'Negativa',
      ep: '',
      category: '',
    });
    assert.equal(stripped.topic, '');
    assert.equal(stripped.valence, '');
    assert.equal(isClientRecorteActive(stripped), false);
  });

  it('chips temáticos usam estado local, não setFilter global', () => {
    const themes = read('js/pages/jornada-perfil-themes.js');
    assert.match(themes, /getThemeProfileFilters/);
    assert.match(themes, /setThemeProfileFilters/);
    assert.doesNotMatch(themes, /setFilter\('topic'/);
    assert.doesNotMatch(themes, /setFilter\('valence'/);
    assert.match(themes, /jornada-theme-reset/);
  });

  it('jornada-perfil usa filtersForJornadaPopulationView', () => {
    const page = read('js/pages/jornada-perfil.js');
    assert.match(page, /filtersForJornadaPopulationView/);
  });

  it('barra global Tema/Valência só na VoC', () => {
    const app = read('js/app.js');
    const fn = app.match(/function showTopicValenceFilters\(route\)\s*\{[^}]+\}/s)?.[0] ?? '';
    assert.match(fn, /route === 'voz-do-cliente'/);
    assert.doesNotMatch(fn, /jornada-perfil/);
  });

  it('mechanismBucket não trata ausência como zero', () => {
    assert.equal(mechanismBucket(null), null);
    assert.equal(mechanismBucket(undefined), null);
    assert.equal(mechanismBucket(0), '0');
  });

  it('themeProfileFilters default Resultados + Todas', () => {
    resetThemeProfileFilters();
    const f = getThemeProfileFilters();
    assert.equal(f.theme, 'Resultados');
    assert.equal(f.valence, 'Todas');
    setThemeProfileFilters({ valence: 'Negativa' });
    assert.equal(getThemeProfileFilters().valence, 'Negativa');
    resetThemeProfileFilters();
  });

  it('categoryDenomsFromContext usa summary oficial', () => {
    const denoms = categoryDenomsFromContext({
      recorteActive: false,
      officialSummary: { promoters: 174, neutrals: 47, detractors: 32 },
    });
    assert.deepEqual(denoms, { Promotor: 174, Neutro: 47, Detrator: 32 });
  });
});

describe('ETAPA 4.14 — Metodologia drawer', () => {
  it('openMethodologyDrawer aplica is-open', () => {
    const js = read('js/ui/methodology-drawer.js');
    assert.match(js, /classList\.add\([^)]*is-open/);
    assert.match(js, /backdrop\.classList\.add\('is-open'\)/);
  });
});

describe('ETAPA 4.14 — Plano de Ação prioridade local', () => {
  it('segmento de prioridade e fila não usa setFilter priority', () => {
    const plan = read('js/pages/plano-de-acao.js');
    assert.match(plan, /action-priority-segment/);
    assert.match(plan, /priorityFilter/);
    assert.doesNotMatch(plan, /setFilter\('priority'/);
    assert.match(plan, /action-tracking--disabled/);
  });
});

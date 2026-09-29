import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dash = join(root, 'dashboard');

function read(rel) {
  return readFileSync(join(dash, rel), 'utf8');
}

describe('Jornada & Perfil — dashboard 4.9', () => {
  it('rota jornada-perfil registrada em app.js e sidebar', () => {
    const app = read('js/app.js');
    assert.match(app, /'jornada-perfil'/);
    assert.match(app, /renderJornadaPerfil/);
    const html = readFileSync(join(root, 'dashboard/index.html'), 'utf8');
    assert.match(html, /href="#\/jornada-perfil"/);
    assert.match(html, /data-route="jornada-perfil"/);
  });

  it('Movimento não renderiza marcos nem perfil financeiro estático', () => {
    const mov = read('js/pages/movimento-jornada.js');
    assert.doesNotMatch(mov, /Marcos da jornada × NPS/);
    assert.doesNotMatch(mov, /renderMovimentoFinancialProfileSection/);
    assert.match(mov, /O que aconteceu entre os ciclos/);
    assert.match(mov, /renderMovimentoChangeDriversSection/);
  });

  it('Jornada & Perfil inclui blocos migrados', () => {
    const page = read('js/pages/jornada-perfil.js');
    assert.match(page, /renderJornadaMarcosSection/);
    assert.match(page, /renderJornadaMechanismsSection/);
    assert.match(page, /renderJornadaStageSection/);
    assert.match(page, /renderJornadaFinancialProfileSection/);
    assert.match(page, /renderJornadaThemesSection/);
    const marcos = read('js/pages/jornada-perfil-marcos.js');
    assert.match(marcos, /Marcos da jornada por classificação NPS/);
  });

  it('Resultados negativo no change drivers alinhado ao VoC', () => {
    const doc = JSON.parse(readFileSync(join(root, 'data/processed/nps_change_drivers.json'), 'utf8'));
    const topics = JSON.parse(readFileSync(join(root, 'data/processed/response_topics.json'), 'utf8'));
    const cycle = 'NPS-2026-SET-PHARUS';
    const negClients = new Set(
      topics
        .filter((t) => t.analytical_cycle_code === cycle && t.topic === 'Resultados' && t.valence === 'Negativa')
        .map((t) => t.response_id),
    );
    assert.equal(doc.resultados_mechanisms?.resultados_negative?.n, negClients.size);
  });

  it('Tier distribuição fecha no financial profile', () => {
    const doc = JSON.parse(readFileSync(join(root, 'data/processed/nps_financial_profile.json'), 'utf8'));
    const dist = doc.financial_profile_coverage?.tier_distribution ?? {};
    const sum = (dist.T1 ?? 0) + (dist.T2 ?? 0) + (dist.T3 ?? 0) + (dist.T4 ?? 0) + (dist.unavailable ?? 0);
    assert.equal(sum, doc.financial_profile_coverage?.respondents_total ?? sum);
  });

  it('VoC link para jornada-perfil com query', () => {
    const voc = read('js/pages/voz-do-cliente.js');
    assert.match(voc, /jornada-perfil\?tema=/);
    assert.match(voc, /Ver perfil desses clientes/);
  });

  it('hash query tema/valencia em app.js', () => {
    const app = read('js/app.js');
    assert.match(app, /applyHashQueryToFilters/);
    assert.match(app, /params\.get\('tema'\)/);
  });

  it('drawer de tema existe', () => {
    const drawer = read('js/ui/jornada-theme-drawer.js');
    assert.match(drawer, /openJornadaThemeDrawer/);
    const themes = read('js/pages/jornada-perfil-themes.js');
    assert.match(themes, /jornada-theme-open/);
    assert.match(themes, /theme-profile-card/);
    assert.doesNotMatch(themes, /renderHighlightResultados/);
  });

  it('drawer tema usa lista enxuta (sem tabela 12 colunas)', () => {
    const drawer = read('js/ui/jornada-theme-drawer.js');
    assert.match(drawer, /theme-drawer-list/);
    assert.match(drawer, /Voltar para lista/);
    assert.doesNotMatch(drawer, /Reserva.*Aporte.*Comentário/s);
  });
});

describe('visual system 4.10', () => {
  it('index referencia visual-system.css e tokens de drawer', () => {
    const html = readFileSync(join(root, 'dashboard/index.html'), 'utf8');
    assert.match(html, /visual-system\.css/);
    const css = readFileSync(join(dash, 'css/visual-system.css'), 'utf8');
    assert.match(css, /--drawer-width/);
    assert.match(css, /\.btn--primary/);
    assert.match(css, /\.cell-stack/);
  });

  it('débitos — labels e tooltip no financial profile', () => {
    const fin = read('js/pages/movimento-financial-profile.js');
    assert.match(fin, /Com indicador de débito/);
    assert.match(fin, /consolidação de débitos/);
  });
});

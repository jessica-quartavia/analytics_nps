import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMethodologyModel } from '../../dashboard/js/data/methodology-sections.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const REQUIRED_IDS = [
  'escopo',
  'ciclos',
  'populacao',
  'nps',
  'base-pareada',
  'valencia',
  'classificacao-voc',
  'tier',
  'debitos',
  'drivers',
  'plano-acao',
  'filtros',
  'data-quality',
  'fontes',
  'read-only',
  'refresh',
  'limitacoes',
];

describe('Metodologia 4.13', () => {
  it('todas as seções principais existem', () => {
    const { sections } = buildMethodologyModel({});
    const ids = new Set(sections.map((s) => s.id));
    for (const id of REQUIRED_IDS) {
      assert.ok(ids.has(id), `falta seção ${id}`);
    }
    assert.ok(sections.length >= 25);
  });

  it('Tier documenta limiares oficiais', () => {
    const tier = buildMethodologyModel({}).sections.find((s) => s.id === 'tier');
    assert.match(tier.simple, /100/);
    assert.match(tier.simple, /500/);
    assert.match(tier.technical, /financial-tier/);
  });

  it('NPS usa fórmula promotores − detratores', () => {
    const nps = buildMethodologyModel({
      cycleSummary: { valid_responses: 253, promoters: 174, detractors: 32, nps: 56.126 },
    }).sections.find((s) => s.id === 'nps');
    assert.match(nps.simple, /174/);
    assert.match(nps.technical, /calculateNps/);
  });

  it('Valência independente da nota', () => {
    const v = buildMethodologyModel({}).sections.find((s) => s.id === 'valencia');
    assert.match(v.simple, /independente/i);
    assert.match(v.simple, /Promotor/);
  });

  it('Débitos e read-only explícitos', () => {
    const d = buildMethodologyModel({}).sections.find((s) => s.id === 'debitos');
    assert.match(d.simple, /cheque_especial|cheque especial/i);
    const ro = buildMethodologyModel({}).sections.find((s) => s.id === 'read-only');
    assert.match(ro.simple, /leitura/i);
    assert.match(ro.simple, /INSERT/i);
  });

  it('Plano de ação reflete prioridades do código', () => {
    const p = buildMethodologyModel({}).sections.find((s) => s.id === 'plano-acao');
    assert.match(p.technical, /computeActionPriority/);
    assert.match(p.simple, /Investigar/);
    assert.match(p.simple, /Promotor.*Detrator/);
  });

  it('Ciclo parcial mencionado', () => {
    const c = buildMethodologyModel({ cycleSummary: { status: 'open' } }).sections.find(
      (s) => s.id === 'ciclo-aberto',
    );
    assert.match(c.simple, /15\/10/);
  });

  it('matriz de qualidade tem linhas', () => {
    const { qualityRows } = buildMethodologyModel({});
    assert.ok(qualityRows.length >= 6);
    assert.ok(qualityRows.some((r) => r.domain.includes('VoC')));
  });

  it('drawer UI: busca, navegação e links contextuais', () => {
    const drawer = readFileSync(join(root, 'dashboard/js/ui/methodology-drawer.js'), 'utf8');
    assert.match(drawer, /methodology-search/);
    assert.match(drawer, /method-nav/);
    assert.match(drawer, /methodology-open/);
    assert.match(drawer, /Metodologia do Analytics NPS/);
  });

  it('busca filtra seções por keyword', () => {
    const { sections } = buildMethodologyModel({});
    const tierOnly = sections.filter((s) =>
      [s.title, ...(s.keywords ?? [])].join(' ').toLowerCase().includes('tier'),
    );
    assert.ok(tierOnly.some((s) => s.id === 'tier'));
  });
});

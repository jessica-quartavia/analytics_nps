import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCommentWithRules } from '../lib/analytics/voc-classifier.mjs';
import { buildValenceChangeReport } from '../lib/analytics/voc-valence-impact.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ADEMIR = `Qual o principal motivo da sua nota?: Conhecimento, atenção, proatividade e vontade de ajudar no processo de construção do patrimônio

Qual a principal razão para a sua nota 9 ou 10? O que mais te agradou em sua experiência?: Atendimento personalizado e estruturado

O que te faria continuar com a gente por mais 5 anos sem hesitar?: Clareza dos próximos passos e visão de todas as oportunidades que podem ser geradas

Você gostaria de adicionar algum outro comentário sobre a sua experiência com a QuartaVia?: Estou feliz com esta oportunidade e ansioso para os próximos passos`;

const LENIS = `"Atenção dispensada"
"O atendimento sempre que precisamos"
"Se houvesse a garantia dos resultados prometidos."`;

describe('VoC valence 4.12', () => {
  it('Ademir: temas principais Positiva (não Neutra)', () => {
    const m = classifyCommentWithRules(ADEMIR, { npsScore: 10 });
    const atend = m.find((x) => x.topic === 'Atendimento / relacionamento');
    assert.equal(atend?.valence, 'Positiva');
    assert.equal(m.find((x) => x.topic === 'Proatividade')?.valence, 'Positiva');
    assert.equal(m.find((x) => x.topic === 'Clareza / comunicação')?.valence, 'Positiva');
    assert.ok(!m.some((x) => x.valence === 'Neutra' && ['Atendimento / relacionamento', 'Proatividade'].includes(x.topic)));
  });

  it('Lenis: atendimento Positiva; resultados/expectativa Negativa', () => {
    const m = classifyCommentWithRules(LENIS, { npsScore: 10 });
    assert.equal(m.find((x) => x.topic === 'Atendimento / relacionamento')?.valence, 'Positiva');
    const neg = m.filter((x) => x.valence === 'Negativa');
    assert.ok(neg.length >= 1);
    assert.ok(!neg.some((x) => x.topic === 'Atendimento / relacionamento'));
  });

  it('"não tive resultado" não vira positiva por conter resultado', () => {
    const m = classifyCommentWithRules('Ainda não tive resultado no plano patrimonial.', { npsScore: 10 });
    const res = m.find((x) => x.topic === 'Resultados' || x.topic === 'Plano patrimonial');
    if (res) assert.equal(res.valence, 'Negativa');
  });

  it('cláusula mista: atendimento excelente, mas ainda não vi resultado', () => {
    const m = classifyCommentWithRules('Atendimento excelente, mas ainda não vi resultado.', { npsScore: 10 });
    assert.equal(m.find((x) => x.topic === 'Atendimento / relacionamento')?.valence, 'Positiva');
    assert.equal(m.find((x) => x.topic === 'Resultados')?.valence, 'Negativa');
  });

  it('relatório de impacto tem matriz de transições', () => {
    const report = JSON.parse(readFileSync(join(root, 'data/quality/voc_valence_impact.json'), 'utf8'));
    assert.ok(report.total_classifications_comparable > 0);
    assert.ok(report.transitions['Neutra→Positiva'] != null);
    assert.ok(Array.isArray(report.by_topic));
    assert.ok(report.manual_cases?.ademir_barioni?.after?.length);
  });

  it('buildValenceChangeReport conta mudanças', () => {
    const before = [{ response_id: 'r1', analytical_cycle_code: 'C', topic: 'T', valence: 'Neutra' }];
    const after = [{ response_id: 'r1', analytical_cycle_code: 'C', topic: 'T', valence: 'Positiva' }];
    const r = buildValenceChangeReport(before, after);
    assert.equal(r.total_changed, 1);
    assert.equal(r.transitions['Neutra→Positiva'], 1);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProfessionCategory,
  normalizeProfessionText,
  rollupProfessionCategoriesForPie,
} from '../../lib/analytics/profession-category.mjs';

test('Medicina / Saúde: médico e médica', () => {
  assert.equal(classifyProfessionCategory('Médico'), 'Medicina / Saúde');
  assert.equal(classifyProfessionCategory('Medica'), 'Medicina / Saúde');
});

test('Engenharia antes de aposentado', () => {
  assert.equal(classifyProfessionCategory('Engenheiro Civil Aposentado'), 'Engenharia');
});

test('Aposentado só sem outra profissão', () => {
  assert.equal(classifyProfessionCategory('Aposentada'), 'Aposentado');
});

test('Servidor público', () => {
  assert.equal(classifyProfessionCategory('Funcionária Pública'), 'Servidor público');
});

test('vazio → Não informado', () => {
  assert.equal(classifyProfessionCategory(''), 'Não informado');
  assert.equal(classifyProfessionCategory(null), 'Não informado');
});

test('sem match → Outros', () => {
  assert.equal(classifyProfessionCategory('Artista plástico'), 'Outros');
});

test('normalização remove acentos', () => {
  assert.equal(normalizeProfessionText('Médico'), 'medico');
});

test('rollup pie mantém Não informado por último na ordenação', () => {
  const map = new Map([
    ['Não informado', 50],
    ['Engenharia', 8],
    ['Outros', 4],
  ]);
  const rolled = rollupProfessionCategoriesForPie(map, 8);
  assert.equal(rolled[rolled.length - 1].label, 'Não informado');
  const sum = rolled.reduce((s, r) => s + r.count, 0);
  assert.equal(sum, 62);
});

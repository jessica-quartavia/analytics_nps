import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const voc = readFileSync(join(root, 'dashboard/js/pages/voz-do-cliente.js'), 'utf8');

describe('VoC UI 4.12', () => {
  it('linha clicável e sem link Ver perfil no drawer', () => {
    assert.match(voc, /voc-comment-row--clickable/);
    assert.match(voc, /VALENCE_HELP/);
    assert.doesNotMatch(voc, /Ver perfil do cliente/);
  });

  it('explica classificação no drawer', () => {
    assert.match(voc, /Como essa classificação foi feita/);
    assert.match(voc, /Resposta NPS completa/);
  });

  it('informa valência analisada por IA', () => {
    assert.match(voc, /valência de cada tema é analisada por IA/);
    assert.match(voc, /Classificação por IA \(Gemini\)/);
    assert.match(voc, /corrigi-la manualmente/);
  });
});

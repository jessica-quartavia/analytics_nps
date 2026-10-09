import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceConflictsWithPositiveValence,
  applySemanticReviewFlags,
  detectScoreTextConflict,
  engineerCriticismConflictsWithPositive,
} from '../lib/analytics/voc-semantic-validate.mjs';

describe('voc-semantic-validate', () => {
  it('detecta Positiva incompatible com evidence negativa', () => {
    assert.equal(
      evidenceConflictsWithPositiveValence('não agregou em nada', 'Positiva'),
      true,
    );
    assert.equal(evidenceConflictsWithPositiveValence('valeu o investimento', 'Positiva'), false);
  });

  it('detecta conflito nota 0 + múltiplos positivos', () => {
    const r = detectScoreTextConflict(
      [
        { theme: 'Expectativa', valence: 'Positiva' },
        { theme: 'Valor percebido', valence: 'Positiva' },
      ],
      0,
      'Até o presente momento não agregou em nada.',
    );
    assert.equal(r.score_text_conflict, true);
  });

  it('detecta EP positiva com crítica ao engenheiro', () => {
    assert.equal(
      engineerCriticismConflictsWithPositive(
        'Engenheiro Patrimonial',
        'engenheiro que não tem habilidade',
        'Positiva',
      ),
      true,
    );
  });

  it('marca semantic_conflict e review', () => {
    const out = applySemanticReviewFlags(
      [{ theme: 'Valor percebido', valence: 'Positiva', confidence: 0.9, evidence: 'não agregou' }],
      { question: 'Motivo?', answer: 'não agregou' },
    );
    assert.equal(out[0].semantic_conflict, true);
    assert.equal(out[0].needs_human_review, true);
  });
});

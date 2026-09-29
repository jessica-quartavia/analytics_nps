/**
 * Regras oficiais CSAT (evidência: Typeform em public.csat_responses.answers —
 * pergunta "De 0 a 5, como foi a reunião de hoje?").
 */

/** Escala ordinal da pergunta principal. */
export const CSAT_SCORE_MIN = 0;
export const CSAT_SCORE_MAX = 5;

/** Apenas respostas de formulário CSAT (exclui NPS erroneamente na mesma tabela). */
export const CSAT_FORM_TYPE = 'CSAT';

/**
 * Agregação em csat_summary: cada resposta válida conta (reuniões distintas).
 * Não deduplicar por cliente/ciclo no summary — histórico bruto preservado em csat_responses.json.
 */
export const CSAT_SUMMARY_AGGREGATION = 'all_valid_responses';

/**
 * Satisfeitos: top-2 box (notas 4 e 5 em escala 0–5).
 * O banco não persiste limiar explícito; esta regra é documentada e auditável.
 * Divergência vs legado (~60,3%) registrada em csat_legacy_reconciliation.json.
 */
export const CSAT_SATISFIED_RULE_ID = 'top2_box_0_5_score_gte_4';
export const CSAT_SATISFIED_MIN_SCORE = 4;

/** Referência legado (Pesquisa Satisfação, trimestre latest — não baseline NPS). */
export const LEGACY_REFERENCE = {
  label: 'analytics_satisfacao CSV (trimestre latest)',
  csat_average: 4.8,
  satisfied_pct: 60.3,
};

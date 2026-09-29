/**
 * Taxonomia VoC e limiares de evolução de temas (documentados para auditoria).
 */

/** @typedef {'Positiva' | 'Neutra' | 'Negativa'} TopicValence */

export const VOC_TAXONOMY_VERSION = 'v1';

/** Temas oficiais iniciais (ordem estável para UI). */
export const OFFICIAL_TOPICS = [
  'Atendimento / relacionamento',
  'Engenheiro Patrimonial',
  'Clareza / comunicação',
  'Proatividade',
  'Resultados',
  'Oportunidades',
  'Plano patrimonial',
  'Agilidade',
  'Confiança',
  'Tecnologia / plataforma',
  'Expectativa',
  'Valor percebido',
];

/** Reservados para classificação futura (não emitidos por rules_v1). */
export const FUTURE_TOPICS = ['Outros', 'Não classificado'];

/**
 * Limiares de evolução (pct_responses = % sobre respostas com comentário no ciclo).
 * @type {{
 *   pctResponsesDeltaMin: number,
 *   negativeShareMin: number,
 *   positiveShareMin: number,
 *   negativeShareImproveMax: number,
 *   recurringMinPct: number,
 * }}
 */
export const TOPIC_EVOLUTION_THRESHOLDS = {
  /** Delta mínimo em pontos percentuais (pct_responses atual − anterior). */
  pctResponsesDeltaMin: 2,
  /** Participação negativa mínima (negative / mentions) para dor. */
  negativeShareMin: 0.4,
  /** Participação positiva mínima para sinal positivo emergente. */
  positiveShareMin: 0.45,
  /** Abaixo disso + queda de negative_pct indica melhora. */
  negativeShareImproveMax: 0.35,
  /** pct_responses mínimo no ciclo anterior para dor recorrente. */
  recurringMinPct: 1.5,
};

/**
 * Palavras-chave por tema (rules_v1 — cobertura parcial, transparente).
 * Valência é inferida no contexto local, não pelo comentário inteiro.
 */
export const TOPIC_KEYWORD_RULES = {
  'Atendimento / relacionamento': [
    'atendimento',
    'relacionamento',
    'contato',
    'suporte',
    'disponibilidade',
    'proximidade',
    'acolhimento',
  ],
  'Engenheiro Patrimonial': [
    'engenheiro',
    'patrimonial',
    'estrategista',
    'consultor',
    'ep ',
    'meu ep',
    'minha ep',
  ],
  'Clareza / comunicação': [
    'clareza',
    'comunicação',
    'comunicacao',
    'explica',
    'informação',
    'informacao',
    'entender',
    'didática',
    'didatica',
  ],
  Proatividade: ['proativ', 'iniciativa', 'antecip', 'follow', 'acompanhamento próximo', 'acompanhamento proximo'],
  Resultados: ['resultado', 'metas', 'retorno', 'performance', 'atingir', 'realizad', 'prazos'],
  Oportunidades: ['oportunidade', 'investimento', 'alocação', 'alocacao', 'carteira'],
  'Plano patrimonial': ['plano', 'patrimônio', 'patrimonio', 'estratégia', 'estrategia', 'planejamento'],
  Agilidade: ['agil', 'rápid', 'rapidez', 'demora', 'lent', 'tempo de resposta', 'prazo'],
  Confiança: ['confiança', 'confianca', 'confio', 'credibil', 'segurança', 'seguranca'],
  'Tecnologia / plataforma': [
    'plataforma',
    'sistema',
    'app',
    'aplicativo',
    'portal',
    'tecnologia',
    'digital',
    'acesso online',
  ],
  Expectativa: ['expectativa', 'esperava', 'decepcion', 'surpreend', 'promet'],
  'Valor percebido': ['valor', 'custo', 'preço', 'preco', 'investimento', 'benefício', 'beneficio', 'retorno sobre'],
};

export const POSITIVE_CUES = [
  'ótimo',
  'otimo',
  'excelente',
  'bom',
  'boa',
  'parabéns',
  'parabens',
  'confio',
  'satisfeit',
  'agrade',
  'melhor',
  'eficiente',
  'profissional',
  'compromet',
  'disponível',
  'disponivel',
];

export const NEGATIVE_CUES = [
  'ruim',
  'péssim',
  'pessim',
  'insatisfeit',
  'decepcion',
  'demora',
  'lento',
  'lenta',
  'falta',
  'não',
  'nao',
  'nunca',
  'difícil',
  'dificil',
  'problema',
  'melhorar',
  'ausência',
  'ausencia',
  'sem contato',
  'desacreditei',
];

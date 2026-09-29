/**
 * Taxonomia VoC e limiares de evolução de temas (documentados para auditoria).
 */

/** @typedef {'Positiva' | 'Neutra' | 'Negativa'} TopicValence */

export const VOC_TAXONOMY_VERSION = 'v1';

/** Versão do classificador de valência (rules_v2 = recalibração 4.16). */
export const VOC_CLASSIFIER_VERSION = 'rules_v2';

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
    'facilidade de contato',
    'facilidade',
  ],
  'Engenheiro Patrimonial': [
    'engenheiro',
    'patrimonial',
    'estrategista',
    'consultor',
    'assessor',
    'acessor',
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
  Oportunidades: [
    'oportunidade',
    'investimento',
    'alocação',
    'alocacao',
    'carteira',
    'diversificação',
    'diversificacao',
    'implantação',
    'implantacao',
    'implementação',
    'implementacao',
  ],
  'Plano patrimonial': ['plano', 'patrimônio', 'patrimonio', 'estratégia', 'estrategia', 'planejamento'],
  Agilidade: ['agil', 'rápid', 'rapidez', 'demora', 'lent', 'tempo de resposta', 'prazo', 'ganho de tempo'],
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
  'bom atendimento',
  'bom',
  'boa',
  'facilidade',
  'ganho de tempo',
  'diversificação',
  'diversificacao',
  'segurança',
  'seguranca',
  'tranquilidade',
  'resultado positivo',
  'melhores investimentos',
  'gostei',
  'gosto',
  'parabéns',
  'parabens',
  'confio',
  'confiança',
  'confianca',
  'satisfeit',
  'agrade',
  'melhor',
  'melhorou',
  'eficiente',
  'profissional',
  'compromet',
  'disponível',
  'disponivel',
  'atencioso',
  'atenção',
  'atencao',
  'proativ',
  'personalizado',
  'estruturado',
  'competente',
  'clareza',
  'claro',
  'clara',
  'agradou',
  'feliz',
  'ansioso',
  'oportunidade',
  'ajudou',
  'ajuda',
  'vontade de ajudar',
  'bem atendido',
  'recomendo',
  'conhecimento',
  'sempre que',
  'precisamos',
  'atendimento sempre',
];

/** Frases explícitas (prioridade sobre cues isolados). */
export const POSITIVE_PHRASES = [
  'estou feliz',
  'muito boa',
  'muito bom',
  'excelente atendimento',
  'boa experiencia',
  'boa experiência',
  'com certeza a confiança',
  'muito satisfeito',
  'estou satisfeito',
];

export const NEGATIVE_CUES = [
  'ruim',
  'péssim',
  'pessim',
  'insatisfeit',
  'decepcion',
  'demora',
  'frustra',
  'lento',
  'lenta',
  'falta',
  'difícil',
  'dificil',
  'problema',
  'ausência',
  'ausencia',
  'sem contato',
  'desacreditei',
  'dispensad',
  'caro',
  'pouco retorno',
];

/** Negação + contexto — não tratar "não" isolado como negativo. */
export const NEGATIVE_PHRASES = [
  'nao entreg',
  'não entreg',
  'nao aconteceu',
  'não aconteceu',
  'sem resultado',
  'nao tive resultado',
  'não tive resultado',
  'resultado nao chegou',
  'resultado não chegou',
  'nao confio',
  'não confio',
  'ainda nao vi',
  'ainda não vi',
  'ainda nao tive',
  'ainda não tive',
  'nao recebi',
  'nao entregou',
  'não entregou',
  'nao cumpriu',
  'não cumpriu',
  'esperava mais',
  'nao recomendo',
  'não recomendo',
  'sem resultado',
  'resultado abaixo',
  'pouco retorno',
  'não recebi',
  'nao tenho contato',
  'não tenho contato',
  'nao tenho apoio',
  'não tenho apoio',
  'se houvesse',
  'garantia dos resultados',
  'resultados prometidos',
];

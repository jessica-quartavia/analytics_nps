/** Ordem oficial: Alta > Média > Investigar > Aprendizado */
export const PRIORITY_RANK = {
  Alta: 4,
  Média: 3,
  Investigar: 2,
  Aprendizado: 1,
};

export const PRIORITY_ORDER = ['Alta', 'Média', 'Investigar', 'Aprendizado'];

export const RECOMMENDED_ACTION_BY_PRIORITY = {
  Alta: 'Contato imediato',
  Média: 'Acompanhar',
  Investigar: 'Investigar',
  Aprendizado: 'Aprendizado',
};

export const DEFAULT_ACTION_STATUS = 'Novo';

export const ACTION_STATUSES = [
  'Novo',
  'Em análise',
  'Contatado',
  'Em acompanhamento',
  'Resolvido',
  'Sem ação imediata',
];

export const PENDING_STATUSES = new Set(['Novo', 'Em análise', 'Contatado', 'Em acompanhamento']);

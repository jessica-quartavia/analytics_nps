/** Fontes de dados por rota — auditadas contra datasets do analytics-store / phase1. */

export const DATA_SOURCE_CATALOG = {
  base_qv: {
    id: 'base_qv',
    label: 'BASE QV',
    tooltip: 'Base operacional atual de clientes.',
  },
  base0: {
    id: 'base0',
    label: 'BASE0',
    tooltip:
      'Base histórica consolidada usada para pagamentos, reuniões, mecanismos e NPS passado.',
  },
  nps_pipeline: {
    id: 'nps_pipeline',
    label: 'NPS analítico',
    tooltip: 'Datasets processados do pipeline NPS (respostas, ciclos, summaries).',
  },
  app_pharus: {
    id: 'app_pharus',
    label: 'App PHARUS',
    tooltip: 'Base cadastral do aplicativo PHARUS.',
  },
  voc_ai: {
    id: 'voc_ai',
    label: 'IA',
    tooltip: 'Classificação automática de temas e valência dos comentários.',
  },
  modeling: {
    id: 'modeling',
    label: 'Modelagem preditiva',
    tooltip: 'Artefatos de projeção estatística (nps_next_model).',
  },
  action_queue: {
    id: 'action_queue',
    label: 'Plano de ação',
    tooltip: 'Fila enriquecida de ações derivada de NPS e VoC.',
  },
};

/** @type {Record<string, { lead?: string, text: string, sourceIds: string[], extraBadges?: { label: string, variant?: string }[] }>} */
export const PAGE_DATA_SOURCES = {
  executivo: {
    lead: 'Bases utilizadas',
    text: 'Os indicadores atuais são derivados da BASE QV e dos datasets analíticos do pipeline NPS.',
    sourceIds: ['base_qv', 'nps_pipeline'],
  },
  movimento: {
    lead: 'Bases utilizadas',
    text: 'As análises de migração comparam respostas NPS entre ciclos usando clientes pareados.',
    sourceIds: ['base_qv', 'nps_pipeline'],
  },
  'historico-nps': {
    lead: 'Bases utilizadas',
    text: 'Os dados históricos e enriquecimentos temporais vêm da BASE0. A BASE QV é utilizada para dados operacionais atuais quando aplicável.',
    sourceIds: ['base0', 'base_qv'],
  },
  eps: {
    lead: 'Bases utilizadas',
    text: 'Carteiras e respostas por EP usam summaries do pipeline NPS (BASE QV + respostas processadas).',
    sourceIds: ['base_qv', 'nps_pipeline'],
  },
  'voz-do-cliente': {
    lead: 'Bases utilizadas',
    text: 'Comentários históricos vêm da BASE0 e respostas atuais do pipeline NPS. Temas e valências são classificados por IA.',
    sourceIds: ['base0', 'nps_pipeline', 'voc_ai'],
  },
  'jornada-perfil': {
    lead: 'Bases utilizadas',
    text: 'Dados atuais de cliente vêm da BASE QV. Reuniões, mecanismos e análises temporais podem utilizar BASE0.',
    sourceIds: ['base_qv', 'base0'],
  },
  'safras-cobertura': {
    lead: 'Bases utilizadas',
    text: 'Safra é derivada da data de pagamento da BASE0. Status atual usa BASE QV. Informação de cadastro no App vem da base App PHARUS.',
    sourceIds: ['base0', 'base_qv', 'app_pharus'],
  },
  drivers: {
    lead: 'Bases utilizadas',
    text: 'Testes estatísticos usam respostas enriquecidas (BASE0/BASE QV) e artefatos analíticos do pipeline NPS.',
    sourceIds: ['base_qv', 'base0', 'nps_pipeline'],
  },
  'plano-de-acao': {
    lead: 'Bases utilizadas',
    text: 'Priorização combina sinais do NPS analítico, comentários (VoC) e fila de ações enriquecida.',
    sourceIds: ['nps_pipeline', 'voc_ai', 'action_queue'],
  },
  'sistema/documentacao': {
    lead: 'Referência',
    text: 'Documentação estática do portal; não consome datasets analíticos em tempo real.',
    sourceIds: ['nps_pipeline'],
  },
  'sistema/logs': {
    lead: 'Auditoria',
    text: 'Eventos operacionais agregados de planos, revisões e arquivo portal_audit_log.',
    sourceIds: ['action_queue'],
  },
  'previsao-nps': {
    lead: 'Bases utilizadas',
    text: 'O modelo usa histórico consolidado da BASE0 e variáveis derivadas do pipeline analítico.',
    sourceIds: ['base0', 'nps_pipeline', 'modeling'],
    extraBadges: [{ label: 'Em construção', variant: 'muted' }],
  },
};

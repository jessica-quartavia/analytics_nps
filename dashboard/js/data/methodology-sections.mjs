/** Espelha lib/analytics/voc-config.mjs OFFICIAL_TOPICS (sem import fora do bundle dashboard). */
const OFFICIAL_TOPICS = [
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

/** @typedef {{ id: string, title: string, keywords: string[], simple: string, technical: string, source: string, limitation: string, extraHtml?: string }} MethodologySection */

function fmtNps(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtPctRate(rate) {
  if (rate == null) return '—';
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/**
 * @param {object} ctx
 * @returns {{ sections: MethodologySection[], qualityRows: object[], live: object }}
 */
export function buildMethodologyModel(ctx = {}) {
  const m = ctx.snapshot?.methodology ?? {};
  const cs = ctx.cycleSummary ?? {};
  const setAudit = ctx.populationAudit?.set_2026 ?? {};
  const auditRef = setAudit.dashboard_reference ?? {};
  const dedupeAudit = ctx.populationAudit?.dedupe?.from_ingest_nps_responses ?? {};
  const paired = ctx.paired ?? {};
  const drivers = ctx.changeDrivers ?? {};
  const migPn = drivers.migration_groups?.['Promotor → Neutro']?.n ?? 12;

  const live = {
    valid: cs.valid_responses ?? 253,
    eligible: cs.eligible_clients ?? auditRef.eligible_clients ?? 967,
    rate: cs.response_rate,
    promoters: cs.promoters ?? 174,
    passives: cs.passives ?? 47,
    detractors: cs.detractors ?? 32,
    nps: cs.nps,
    npsDisplay: fmtNps(cs.nps),
    rawRows: dedupeAudit.raw_rows_in_window ?? setAudit.raw_rows_in_window ?? 258,
    dupes: dedupeAudit.duplicates_found ?? setAudit.duplicates_found ?? 5,
    pairedN: paired.paired_clients ?? 81,
    cycleStatus: cs.status ?? 'open',
    cycleName: cs.cycle_name ?? 'Set/2026',
  };

  const topicsList = OFFICIAL_TOPICS.map((t) => `• ${t}`).join('\n');

  /** @type {MethodologySection[]} */
  const sections = [
    {
      id: 'escopo',
      title: 'Escopo da análise',
      keywords: ['escopo', 'pharus', 'davos', 'programa'],
      simple:
        'O dashboard analisa hoje apenas clientes PHARUS. DAVOS não entra. O ciclo em foco é Set/2026 (campanha operacional NPS 2026-T3), com coleta a partir de 15/09/2026 e encerramento previsto em 15/10/2026.',
      technical:
        'Filtro de programa PHARUS nos pipelines analíticos. Exclusão explícita de DAVOS na população de envio e respostas do ciclo Set/2026. Ciclo analítico NPS-2026-SET-PHARUS mapeado ao source cycle NPS 2026-T3.',
      source: 'data/config/nps-cycles.json · data/processed/cycles.json',
      limitation: 'Outros programas não aparecem nas métricas agregadas atuais.',
    },
    {
      id: 'ciclos',
      title: 'Ciclos de NPS',
      keywords: ['ciclo', 'jun-jul', 'set', 't3', 't2'],
      simple:
        'Cada ciclo analítico agrupa respostas por janela e regras de resolução (envio, source cycle ou reconstrução histórica). Jun–Jul/2026 é reconstrução parcial; Set/2026 segue a janela da campanha T3.',
      technical:
        'sequence define ordem; analytical_cycle_code é a chave nos artefatos. Jun–Jul absorve PHARUS do T2 via historical_jun_jul_reconstruction. Set usa source_cycle_window com starts_at 2026-09-15 (BR) e ends operacional 15/10/2026.',
      source: 'lib/analytics/analytical-cycles.mjs · data/processed/cycles.json',
      limitation: 'Ciclos históricos reconstruídos podem ter confiança média e cobertura parcial documentada.',
    },
    {
      id: 'populacao',
      title: 'População e taxa de resposta',
      keywords: ['população', 'envio', '967', 'elegíveis', 'nps_sends'],
      simple: `"Clientes com envio" são clientes PHARUS únicos com registro de envio da campanha NPS 2026-T3 — não é a base total de clientes PHARUS no CRM. No snapshot atual: ${live.eligible} clientes com envio.`,
      technical:
        'Denominador: distinct client_id em public.nps_sends filtrado por cycle_id da T3 e programa PHARUS. Dedupe: 1 cliente = 1 linha no denominador (auditoria eligible_distinct_client_ids).',
      source: 'public.nps_sends · data/processed/eligible_clients.json · data/quality/nps_population_audit.json',
      limitation: 'Não aplica filtro de status CRM atual (ativo/congelado/churn) na elegibilidade de envio.',
    },
    {
      id: 'taxa-resposta',
      title: 'Taxa de resposta',
      keywords: ['taxa', 'resposta', '26'],
      simple: `Taxa = respostas válidas ÷ clientes com envio. Set atual: ${live.valid} / ${live.eligible} = ${fmtPctRate(live.rate)}. Enquanto o ciclo estiver aberto, a taxa pode mudar até o fechamento.`,
      technical: 'response_rate = valid_responses / eligible_clients no cycle_summary. Respondentes válidos são subconjunto dos clientes com envio.',
      source: 'data/processed/cycle_summary.json',
      limitation: 'Ciclo aberto: numerador e taxa não são finais.',
    },
    {
      id: 'respondentes',
      title: 'Respondentes e deduplicação',
      keywords: ['258', '253', 'duplicidade', 'dedupe'],
      simple: `${live.rawRows} respostas brutas na janela → ${live.dupes} duplicidades → ${live.valid} respostas válidas finais. Em empate no mesmo client_id + ciclo, mantém-se a submitted_at mais recente.`,
      technical: 'Chave dedupe: client_id + analytical_cycle_code. Regra implementada em dedupeResponsesByClientCycle antes de derivar histórico e NPS.',
      source: 'lib/analytics/dedupe-responses.mjs · data/quality/nps_population_audit.json',
      limitation: 'Duplicidades fora da janela analítica não entram neste recorte.',
    },
    {
      id: 'nps',
      title: 'Cálculo do NPS',
      keywords: ['nps', 'promotor', 'detrator', 'neutro', '56'],
      simple: `Promotor 9–10 · Neutro 7–8 · Detrator 0–6. NPS = % Promotores − % Detratores. Set atual: P ${live.promoters} · N ${live.passives} · D ${live.detractors} → NPS ${live.npsDisplay} (interno ${live.nps ?? '—'}).`,
      technical: 'calculateNps sobre score_distribution / categorias classifyNpsScore. Equivalente a (promoters − detractors) / valid_responses × 100.',
      source: 'lib/analytics/nps.mjs · data/processed/cycle_summary.json',
      limitation: 'NPS do ciclo reflete apenas respondentes válidos deduplicados.',
    },
    {
      id: 'arredondamento',
      title: 'Arredondamento',
      keywords: ['arredondamento', 'decimal', 'ui'],
      simple: 'Valores internos mantêm precisão completa. A UI exibe NPS com 1 casa decimal (pt-BR). Cálculos downstream não usam o valor já arredondado da tela.',
      technical: 'formatNps / formatNpsRange na camada de apresentação dashboard/js/utils/format.js.',
      source: 'dashboard/js/utils/format.js',
      limitation: 'Exportações CSV podem usar mais casas que a UI.',
    },
    {
      id: 'ic95',
      title: 'Intervalo de confiança (IC95)',
      keywords: ['ic', 'confiança', 'bootstrap'],
      simple: 'IC95 do NPS indica incerteza amostral da estimativa — sempre mostrado como intervalo. Não é previsão de resultado futuro.',
      technical: `Bootstrap percentil 95% (nps_ci_method bootstrap_percentile_95, seed fixa). n=${cs.nps_ci_n ?? live.valid}, iterations=${cs.nps_ci_iterations ?? 2000}.`,
      source: 'lib/analytics/nps-confidence.mjs · cycle_summary nps_ci_*',
      limitation: 'Assume amostra como representativa do universo de respondentes do ciclo.',
    },
    {
      id: 'base-pareada',
      title: 'Base total × base pareada',
      keywords: ['pareada', '81', 'base'],
      simple: `Base total: todos os respondentes válidos do ciclo. Base pareada: quem respondeu no ciclo atual e no anterior (${paired.previous_cycle ?? 'Jun–Jul'} → ${paired.current_cycle ?? 'Set'}). Hoje: ${live.pairedN} clientes pareados.`,
      technical: 'paired_cycles.json lista client_id com resposta em current_cycle e previous_cycle configurados. Movimento/migração entre ciclos usa principalmente a pareada.',
      source: 'data/processed/paired_cycles.json · store-core buildGlobalFilterContext',
      limitation: 'Comparativos fora da pareada refletem também mudança de composição.',
    },
    {
      id: 'migracao',
      title: 'Migração',
      keywords: ['migração', 'matriz', 'promotor neutro'],
      simple: `Matriz de transição de categoria NPS entre ciclos (ex.: Promotor → Neutro). Na base pareada atual, Promotor → Neutro = ${migPn} clientes (snapshot).`,
      technical: 'computeNpsMigration(previous_category, current_category) por cliente pareado. Contagens em nps_change_drivers.migration_groups.',
      source: 'lib/analytics/migration.mjs · data/processed/nps_change_drivers.json',
      limitation: 'Células com n pequeno não devem ser over-interpretadas.',
    },
    {
      id: 'evolucao',
      title: 'Evolução (delta de nota)',
      keywords: ['evolução', 'delta', 'melhora', 'queda'],
      simple: 'delta_nota = nota atual − nota anterior. Categorias: Grande melhora (Δ≥3), Melhora (Δ≥1), Estável (0), Qeda (−1 a −2), Queda severa (≤−3). Mudança de nota ≠ mudança de categoria NPS.',
      technical: 'computeEvolutionStatus em lib/analytics/migration.mjs. evolution_status derivado no histórico por cliente.',
      source: 'lib/analytics/migration.mjs · responses enriquecidas',
      limitation: 'Requer par anterior válido; null se sem histórico.',
    },
    {
      id: 'ep',
      title: 'Engenheiros Patrimoniais',
      keywords: ['ep', 'engenheiro', 'proxy', 'transfer'],
      simple: 'A resposta NPS não traz snapshot nativo de EP. Com histórico temporal usamos EP na data; senão, proxy do EP atual — exibir badge “EP aproximado”.',
      technical: 'resolveEpAtDate: engenheiro_transfer_logs + clients.engenheiro_patrimonial + engenheiros_anteriores. feature_quality / ep_resolution_method: point_in_time vs current_proxy.',
      source: 'lib/analytics/ep-at-date.mjs · responses ep_*',
      limitation: 'Proxy não substitui histórico completo.',
    },
    {
      id: 'voc',
      title: 'Voice of Customer (VoC)',
      keywords: ['voc', 'tema', 'comentário'],
      simple: 'Comentários podem receber múltiplos temas (multi-label). Taxonomia oficial listada abaixo; cobertura = comentários com ≥1 tema / comentários com texto.',
      technical: topicsList,
      source: 'lib/analytics/voc-config.mjs · data/processed/response_topics.json',
      limitation: 'Comentários sem match de keyword ficam sem tema (não inventamos tema).',
    },
    {
      id: 'valencia',
      title: 'Valência por tema',
      keywords: ['valência', 'positiva', 'negativa', 'neutra'],
      simple:
        'Valência é independente da categoria NPS. Positiva = favorável ao tema; Neutra = descritivo/ambíguo; Negativa = crítica ou insatisfação local. Promotor 10 pode ter Resultados Negativa.',
      technical: 'Valência inferida por cláusula/trecho, não pelo comentário inteiro nem pela nota automaticamente.',
      source: 'lib/analytics/voc-classifier.mjs',
      limitation: 'Automatizada — não substitui leitura humana em casos sensíveis.',
    },
    {
      id: 'classificacao-voc',
      title: 'Classificação VoC (rules_v1)',
      keywords: ['rules_v1', 'classificador', 'keyword'],
      simple: 'Classificador rules_v1: keywords por tema, janela de cláusula, sinais positivos/negativos, negação, contexto da pergunta do formulário, multi-label.',
      technical:
        'classifyCommentWithRules + buildResponseTopicsRows. Nota NPS só como contexto secundário em ambiguidade (ex.: pergunta de elogio), nunca sobrescreve texto claro.',
      source: 'lib/analytics/voc-classifier.mjs · data/config/methodology.json voc_classifier_version',
      limitation: 'Partial coverage by design; external_import sobrescreve quando presente.',
    },
    {
      id: 'valencia-qa',
      title: 'Valência — QA e recalibração',
      keywords: ['qa', 'recalibração', 'ademir'],
      simple: 'Versão atual passou por recalibração (4.12): frases positivas antes neutras, negações, comentários mistos, promotor com crítica local. Amostra manual e relatório voc_valence_impact.json.',
      technical: 'scripts/voc-valence-impact.mjs compara transições antes/depois; data/quality/voc_valence_qa_notes.json orienta QA estratificado.',
      source: 'data/quality/voc_valence_impact.json',
      limitation: 'Não há revisão humana 100% da base.',
    },
    {
      id: 'reunioes',
      title: 'Reuniões',
      keywords: ['reunião', 'meetings', '90 dias'],
      simple: 'Contam apenas reuniões com start_time ≤ submitted_at da resposta. Métricas: acumuladas, 30d, 90d, dias desde última, entre respostas.',
      technical: 'Fontes client_meetings + manual_meetings; corte temporal no builder de marcos.',
      source: 'lib/analytics/nps-milestones.mjs · data/processed/nps_client_milestones.json',
      limitation: 'Reuniões futuras ou sem timestamp válido ficam fora.',
    },
    {
      id: 'mecanismos',
      title: 'Mecanismos',
      keywords: ['mecanismo', 'implementado'],
      simple: 'Mecanismo conta antes do NPS se implemented_at ≤ submitted_at. Sem implemented_at: não inferimos historicamente. Buckets 0 / 1 / 2+.',
      technical: 'client_mecanismos · mechanisms_count_before_response nos marcos.',
      source: 'lib/analytics/nps-milestones.mjs',
      limitation: 'Cobertura parcial (~66% no QA de qualidade) quando implemented_at ausente.',
    },
    {
      id: 'troca-ep',
      title: 'Troca de EP',
      keywords: ['troca', 'transfer_log'],
      simple: 'Entre ciclos: evento em engenheiro_transfer_logs com previous_response_at < created_at ≤ current_response_at entra como troca na janela.',
      technical: 'Campo ep_changed / transfer entre respostas analíticas.',
      source: 'engenheiro_transfer_logs · nps_between_cycle_events.json',
      limitation: 'Logs incompletos reduzem detecção.',
    },
    {
      id: 'congelamento',
      title: 'Congelamento',
      keywords: ['congelado', 'snapshot', 'proxy'],
      simple: 'Sem histórico completo de status na data do NPS não afirmamos retrospectivamente que o cliente estava congelado — snapshot vira proxy atual.',
      technical: 'quality gates: current_proxy / unavailable conforme cobertura de jornada.',
      source: 'Marcos e quality flags nos artefatos de milestones',
      limitation: 'Não usar proxy como verdade histórica absoluta.',
    },
    {
      id: 'churn',
      title: 'Churn e cancelamentos',
      keywords: ['churn', 'cancelamento'],
      simple: 'Eventos de cancellations (e históricos disponíveis) entram como marco se ocorrerem até a data da resposta. Fonte parcial → cobertura parcial na UI.',
      technical: 'Regra temporal alinhada a milestones; quality churn_complete / partial nos change drivers.',
      source: 'cancellations · nps_change_drivers churn gates',
      limitation: 'Histórico de cancelamento pode estar incompleto.',
    },
    {
      id: 'perfil-financeiro',
      title: 'Perfil financeiro',
      keywords: ['financeiro', 'renda', 'reserva', 'aporte'],
      simple: 'Fonte client_financial_data: ultima_renda_mensal, ultimo_aporte, reserva_liquidez. Qualidade snapshot atual (current_proxy), não histórico na data da resposta.',
      technical: 'nps_financial_profile.json · merge por client_id no ciclo Set (253 entradas quando completo).',
      source: 'client_financial_data · data/processed/nps_financial_profile.json',
      limitation: 'Snapshot pode divergir do momento da resposta NPS.',
    },
    {
      id: 'tier',
      title: 'Tier derivado',
      keywords: ['tier', 't1', 't2', 'renda'],
      simple:
        'Tier derivado (não coluna nativa do banco). T1 se renda ≥ R$100k/m ou aporte ≥ R$30k/m ou reserva ≥ R$500k. T2: R$50k–100k. T3: R$20k–50k. T4: < R$20k. Precedência T1 > T2 > T3 > T4.',
      technical: 'deriveFinancialTier em lib/analytics/financial-tier.mjs com limiares T1_INCOME 100_000, T1_CONTRIBUTION 30_000, T1_RESERVE 500_000, etc.',
      source: 'lib/analytics/financial-tier.mjs',
      limitation: 'Tier unavailable quando evidência insuficiente.',
    },
    {
      id: 'tier-null',
      title: 'NULL no Tier',
      keywords: ['null', 'indisponível', 'tier unavailable'],
      simple: 'NULL não é zero. Renda NULL + reserva 100k + aporte 5k → Tier indisponível. Renda NULL + reserva 600k → T1 (evidência suficiente para critério reserva).',
      technical: 'Ordem de avaliação: critérios T1 alternativos antes de cair em unavailable por renda ausente.',
      source: 'lib/analytics/financial-tier.mjs · testes deriveFinancialTier',
      limitation: 'Casos limítrofes documentados em QA financeiro.',
    },
    {
      id: 'aporte',
      title: 'Aporte',
      keywords: ['aporte', 'ambíguo'],
      simple: 'ultimo_aporte é o último valor registrado; o schema não garante recorrência mensal. aporte_semantics = ambiguous — não usar como causalidade.',
      technical: 'Campo tratado como sinal de Tier T1 quando ≥ limiar; não annualizado automaticamente.',
      source: 'Schema client_financial_data · nps_financial_profile meta',
      limitation: 'Interpretação gerencial exige validação externa.',
    },
    {
      id: 'debitos',
      title: 'Débitos',
      keywords: ['débito', 'cheque especial', 'cartão'],
      simple:
        'Dimensão independente do Tier. “Com indicador de débito” se ≥1: cheque_especial, parcelamento_cartao, credito_pessoal, credito_consignado. Presença/ausência — sem valor total consolidado hoje.',
      technical: 'hasDebtIndicators em financial-tier / nps_financial_profile debts_summary.',
      source: 'client_financial_data',
      limitation: 'Consolidação de débitos em implementação para maior precisão.',
      extraHtml:
        '<p class="method-callout">Uma funcionalidade de consolidação de débitos está em implementação para aumentar a precisão dessa informação.</p>',
    },
    {
      id: 'drivers',
      title: 'Drivers estatísticos',
      keywords: ['drivers', 'spearman', 'associação'],
      simple: 'Drivers medem associação estatística com NPS ou outcomes — não causalidade. Métodos: Spearman, qui-quadrado/Fisher, Mann-Whitney, Kruskal-Wallis; correção BH-FDR quando múltiplos testes.',
      technical: 'lib/analytics/driver-stats.mjs · driver_tests.json · UI separa utilizáveis / ressalva / indisponíveis (feature_quality).',
      source: 'data/processed/driver_tests.json · dashboard/js/data/drivers-view.mjs',
      limitation: 'Proxies e unavailable não entram no ranking principal.',
    },
    {
      id: 'p-value',
      title: 'p-value',
      keywords: ['p-value', 'p ajustado', 'significância'],
      simple: 'p-value indica compatibilidade com variação aleatória — não é tamanho de efeito, causalidade nem prioridade gerencial. Sempre cruzar com n, efeito, qualidade e cobertura.',
      technical: 'UI principal: formato amigável (ex. p ajustado &lt; 0,001); drawer técnico mantém valor completo.',
      source: 'drivers-view formatPAdjusted',
      limitation: 'Testes múltiplos exigem p ajustado (FDR).',
    },
    {
      id: 'fdr',
      title: 'Correção FDR (BH)',
      keywords: ['fdr', 'bh', 'benjamini'],
      simple: 'Com vários testes simultâneos aplicamos Benjamini–Hochberg FDR para reduzir falsos positivos. Na UI: “p ajustado”.',
      technical: 'bhFdr em driver-stats.mjs aplicado ao conjunto de testes do ciclo.',
      source: 'lib/analytics/driver-stats.mjs',
      limitation: 'FDR controla taxa de descobertas falsas, não elimina incerteza de proxy.',
    },
    {
      id: 'quality-gates',
      title: 'Quality gates',
      keywords: ['quality', 'unavailable', 'proxy', 'parcial'],
      simple: 'Categorias: boa cobertura, parcial, proxy atual, amostra pequena, indisponível. unavailable → fora do ranking principal de drivers; current_proxy → ressalva.',
      technical: 'eligibleForDriverRanking / classifyDriverPresentation · badges na UI de marcos e drivers.',
      source: 'drivers-view.mjs · nps-milestones quality',
      limitation: 'Gates são de apresentação, não alteram teste bruto arquivado.',
    },
    {
      id: 'plano-acao',
      title: 'Plano de ação — prioridades',
      keywords: ['plano', 'alta', 'média', 'investigar', 'aprendizado'],
      simple:
        'Prioridade determinística (ordem: Alta > Média > Investigar > Aprendizado). Alta: Promotor→Detrator, Queda severa, Detrator recorrente, sinal crítico. Média: Promotor→Neutro, Neutro→Detrator, queda relevante sem mudança de categoria. Aprendizado: Detrator→Promotor, Grande melhora, Promotor consistente. Investigar: regras de sinal contraditório abaixo.',
      technical:
        'computeActionPriority + computeInvestigateReasons (action-priority.mjs). Investigar inclui: CSAT alto + NPS Detrator; queda NPS + CSAT médio alto; ≥2 temas negativos em Promotor só com sinal adicional (Δ≤−2, migração negativa, nota≤8, CSAT contraditório ou tema negativo reviewed); |Δ|≥4 sem comentário/temas; Detrator com evolution Melhora.',
      source: 'lib/analytics/action-priority.mjs · action-config.mjs PRIORITY_RANK',
      limitation: 'Fila enriquecida pós-refresh; tracking operacional separado.',
    },
    {
      id: 'sinal-qualitativo',
      title: 'Sinal qualitativo',
      keywords: ['qualitativo', 'promotor', 'tema negativo'],
      simple: 'Promotor estável (10→10 ou Δ≥−1) com ≥1 tema negativo no VoC gera sinal qualitativo — acompanhamento, não necessariamente prioridade Alta. Não dispara Investigar só por temas negativos sem sinal adicional.',
      technical: 'computeQualitativeSignal + promoterNegativeTopicsNeedsAdditionalSignal.',
      source: 'lib/analytics/action-priority.mjs · tests action-priority-qualitative',
      limitation: 'Depende de classificação VoC rules_v1.',
    },
    {
      id: 'filtros',
      title: 'Filtros globais',
      keywords: ['filtro', 'ep', 'pareada'],
      simple: 'Ciclo, EP, Categoria, Nota, Delta, Base total/pareada, Tema, Valência (VoC/Jornada), Prioridade/Status (plano). Nem todo bloco recalcula com qualquer filtro — blocos oficiais (NPS do ciclo) permanecem na visão do summary.',
      technical: 'buildGlobalFilterContext · pairedDisplay flag · summaryLikeFromResponses vs cycle_summary oficial.',
      source: 'dashboard/js/data/store-core.mjs · global-filters.js',
      limitation: 'Filtrar EP não altera NPS oficial do ciclo inteiro.',
    },
    {
      id: 'data-quality',
      title: 'Qualidade dos dados (matriz)',
      keywords: ['qualidade', 'cobertura', 'matriz'],
      simple: 'Referência de cobertura e temporalidade por domínio — valores do snapshot atual e QA; podem evoluir após refresh.',
      technical: 'Consolidado de healthcheck, milestone QA e financial QA.',
      source: 'data/quality/*.json',
      limitation: 'Percentuais aproximados quando fonte parcial.',
    },
    {
      id: 'fontes',
      title: 'Fontes BASE QV',
      keywords: ['fonte', 'base qv', 'supabase'],
      simple: 'Leitura em clients, nps_responses, nps_sends, nps_cycles, engenheiro_transfer_logs, client_meetings, manual_meetings, client_mecanismos, client_journeys, journey_stages, cancellations, client_engajamento_history, client_financial_data.',
      technical: 'Pipeline refresh:nps materializa JSON em data/processed; dashboard consome deploy/public ou dev server.',
      source: 'lib/pipeline/build-analytics.mjs',
      limitation: 'Campos legados ou payloads incompletos documentados por resposta.',
    },
    {
      id: 'read-only',
      title: 'BASE QV somente leitura',
      keywords: ['read-only', 'select', 'insert'],
      simple: 'Este projeto usa BASE QV apenas para leitura: SELECT e export. Não executamos INSERT, UPDATE, DELETE, migrations ou alteração de schema na base operacional.',
      technical: 'lib/data/read-only-guard.mjs bloqueia escrita em integrações.',
      source: 'lib/data/read-only-guard.mjs',
      limitation: 'action_tracking persiste localmente/operacional fora da BASE QV.',
    },
    {
      id: 'refresh',
      title: 'Atualização / refresh',
      keywords: ['refresh', 'build', 'deploy'],
      simple: 'Rotina: npm run refresh:nps → qa:final → sync:deploy-public → validate → build. Dashboard publicado consome datasets versionados do deploy.',
      technical: 'scripts/refresh-nps.mjs · generate:voc · generate:drivers · generate:nps-* · build-static.mjs',
      source: 'package.json scripts',
      limitation: 'Refresh incompleto sinalizado no topbar.',
    },
    {
      id: 'ciclo-aberto',
      title: 'Ciclo parcial (aberto)',
      keywords: ['aberto', 'parcial', '15/10'],
      simple: `Enquanto Set/2026 estiver aberto (${live.cycleStatus === 'open' ? 'status atual: aberto' : 'ver status no topbar'}), indicadores podem mudar até 15/10/2026 (fim operacional T3).`,
      technical: 'cycle_summary.status open + ends_at_note em nps-cycles.json.',
      source: 'data/processed/cycle_summary.json',
      limitation: 'Comparativos com Jun–Jul misturam ciclo fechado parcial com aberto.',
    },
    {
      id: 'limitacoes',
      title: 'Limitações conhecidas',
      keywords: ['limitação', 'cuidado'],
      simple:
        'Ciclo parcial; EP histórico incompleto; jornada/congelamento/financeiro em snapshot; aporte ambíguo; churn/engajamento parciais; Tier derivado; valência automatizada com QA parcial; associação ≠ causalidade.',
      technical: 'Ver também docs/LIMITACOES_METODOLOGICAS.md no repositório.',
      source: 'Documentação + quality flags',
      limitation: 'Lista viva — revisar a cada release metodológica.',
    },
  ];

  const qualityRows = [
    { domain: 'NPS / respostas', coverage: '100% respondentes válidos', time: 'point-in-time (submitted_at)', quality: 'Boa', note: 'Dedupe aplicado' },
    { domain: 'Reuniões', coverage: '~100% no escopo PHARUS', time: 'point-in-time', quality: 'Boa', note: 'Corte start_time ≤ resposta' },
    { domain: 'Mecanismos', coverage: '~66%', time: 'point-in-time', quality: 'Parcial', note: 'Depende implemented_at' },
    { domain: 'EP histórico', coverage: '~19%', time: 'point-in-time', quality: 'Parcial', note: 'Restante proxy atual' },
    { domain: 'Jornada / status', coverage: '~98%', time: 'snapshot', quality: 'Proxy atual', note: 'Não afirmar status na data' },
    { domain: 'Financeiro / Tier', coverage: `${live.valid}/${live.valid} no ciclo atual`, time: 'snapshot', quality: 'Proxy atual', note: 'Tier derivado' },
    { domain: 'Engajamento', coverage: '~3%', time: 'point-in-time', quality: 'Dados insuficientes', note: 'Histórico baixo' },
    { domain: 'Congelamento', coverage: 'snapshot', time: 'snapshot', quality: 'Proxy atual', note: 'Sem histórico completo' },
    { domain: 'VoC valência', coverage: `${m.voc_classifier_version ?? 'rules_v1'}`, time: 'reprocessável', quality: 'QA amostral', note: 'Não revisão humana total' },
  ];

  return { sections, qualityRows, live, versions: m };
}

export const METHODOLOGY_SECTION_IDS = () =>
  buildMethodologyModel({}).sections.map((s) => s.id);

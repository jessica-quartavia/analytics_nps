function templateDetractorMulti({ theme, snippet, ep, neg }) {
  const themes = neg.map((t) => t.topic).slice(0, 3).join(', ');
  const tail = snippet ? ` Considerar o relato: “${snippet}”.` : '';
  return `Agendar contato prioritário com o cliente${ep} para tratar os temas ${themes}, com foco inicial em “${theme}”, mapear causas raiz e definir plano de recuperação com responsáveis e prazos claros.${tail}`;
}

/**
 * Sugestão local de ação proposta quando Gemini indisponível.
 * @param {object} row — linha da fila enriquecida
 */
export function buildActionPlanFallback(row) {
  const topics = row.topics ?? [];
  const neg = topics.filter((t) => t.valence === 'Negativa');
  const pos = topics.filter((t) => t.valence === 'Positiva');
  const score = Number(row.current_score);
  const category = String(row.current_category ?? '');
  const theme = pickPrimaryTheme(row, neg, pos);
  const themeKey = normalizeThemeKey(theme);
  const ep = row.ep_name ? ` (${row.ep_name})` : '';
  const snippet = commentSnippet(row.comment);

  let action_text = templateForTheme(themeKey, { ep, snippet, theme, score, category });

  if (category === 'Promotor' || score >= 9 || row.display_priority === 'Acompanhamento positivo') {
    action_text = templatePromoter({ theme, snippet, ep });
  } else if (!Number.isNaN(score) && score <= 6 && neg.length >= 2) {
    action_text = templateDetractorMulti({ theme, snippet, ep, neg });
  }

  return {
    action_text,
    plan_source: 'fallback',
  };
}

function normalizeThemeKey(topic) {
  const t = String(topic ?? '').toLowerCase();
  if (t.includes('resultado')) return 'resultados';
  if (t.includes('valor')) return 'valor';
  if (t.includes('engenheiro') || t.includes('patrimonial') || t.includes(' ep')) return 'ep';
  if (t.includes('comunic') || t.includes('clareza')) return 'comunicacao';
  if (t.includes('expectativa')) return 'expectativa';
  return 'generico';
}

function pickPrimaryTheme(row, neg, pos) {
  const pick = neg[0] ?? row.topics?.[0] ?? pos[0];
  if (pick?.topic) return pick.topic;
  return row.ai_theme ?? row.primary_topic ?? 'Atendimento';
}

function commentSnippet(comment) {
  const c = String(comment ?? '').trim();
  if (!c) return '';
  const line = c.split(/\n/).find((l) => l.trim().length > 20) ?? c;
  return line.slice(0, 120).trim();
}

function templateForTheme(key, { ep, snippet, theme }) {
  const tail = snippet ? ` Priorizar os pontos mencionados pelo cliente: “${snippet}”.` : '';
  const maps = {
    resultados: `Entrar em contato com o cliente${ep} para revisar os resultados percebidos, entender os principais pontos de frustração e alinhar próximos passos objetivos para melhorar a entrega e a percepção de valor.${tail}`,
    valor: `Realizar contato com o cliente${ep} para revisar a percepção de valor da entrega, alinhar expectativas e apresentar de forma clara os próximos passos e resultados esperados.${tail}`,
    ep: `Realizar contato com o cliente para entender os pontos de insatisfação com o acompanhamento do engenheiro patrimonial${ep}, revisar o histórico da relação e definir ações para melhorar atendimento, comunicação e acompanhamento.${tail}`,
    comunicacao: `Entrar em contato com o cliente${ep} para esclarecer os pontos de dúvida, revisar os alinhamentos anteriores e estabelecer uma rotina de comunicação mais clara e objetiva.${tail}`,
    expectativa: `Revisar com o cliente${ep} as expectativas inicialmente estabelecidas, identificar diferenças entre o esperado e o entregue e definir próximos passos concretos para recuperar confiança e alinhamento.${tail}`,
    generico: `Entrar em contato com o cliente${ep} para aprofundar o contexto da nota e do feedback sobre “${theme}”, registrar principais dores e combinar ações objetivas de recuperação ou reforço da experiência.${tail}`,
  };
  return maps[key] ?? maps.generico;
}

function templatePromoter({ theme, snippet, ep }) {
  const tail = snippet ? ` Destacar no registro: “${snippet}”.` : '';
  return `Registrar os pontos positivos relatados pelo cliente${ep} (tema “${theme}”), reforçar as boas práticas observadas no atendimento e manter acompanhamento para preservar a experiência positiva.${tail}`;
}

function templateDetratorMulti({ theme, snippet, ep, neg }) {
  const themes = neg.map((t) => t.topic).slice(0, 3).join(', ');
  const tail = snippet ? ` Considerar o relato: “${snippet}”.` : '';
  return `Agendar contato prioritário com o cliente${ep} para tratar os temas ${themes}, com foco inicial em “${theme}”, mapear causas raiz e definir plano de recuperação com responsáveis e prazos claros.${tail}`;
}

/**
 * Tenta Gemini; em falha retorna fallback sempre com ok: true.
 */
export async function suggestActionPlanForCase(row, env = process.env) {
  const { suggestActionPlanWithGemini } = await import('./action-plan-suggester.mjs');
  const gemini = await suggestActionPlanWithGemini(row, env);
  if (gemini.ok && gemini.suggestion?.action_text) {
    return {
      ok: true,
      plan_source: 'gemini',
      used_fallback: false,
      notice: null,
      suggestion: {
        action_text: gemini.suggestion.action_text,
        plan_source: 'gemini',
      },
    };
  }
  const fb = buildActionPlanFallback(row);
  return {
    ok: true,
    plan_source: 'fallback',
    used_fallback: true,
    notice:
      'IA temporariamente indisponível. Geramos uma sugestão automática com base nos dados do caso.',
    suggestion: fb,
    gemini_code: gemini.code ?? null,
  };
}

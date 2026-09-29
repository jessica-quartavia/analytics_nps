/**
 * Compara classificações VoC (antes × depois) sem alterar datasets.
 * @param {Array<object>} beforeRows — response_topics atuais
 * @param {Array<object>} afterRows — recomputado com rules_v1 atualizado
 */
export function buildValenceChangeReport(beforeRows, afterRows) {
  const key = (r) => `${r.response_id}\0${r.analytical_cycle_code}\0${r.topic}`;
  const beforeMap = new Map(beforeRows.map((r) => [key(r), r]));
  const afterMap = new Map(afterRows.map((r) => [key(r), r]));

  const transitions = {
    'Neutra→Positiva': 0,
    'Neutra→Negativa': 0,
    'Positiva→Neutra': 0,
    'Negativa→Neutra': 0,
    'Positiva→Negativa': 0,
    'Negativa→Positiva': 0,
    unchanged: 0,
  };

  /** @type {Array<object>} */
  const changedSamples = [];
  const byTopic = new Map();

  for (const [k, after] of afterMap) {
    const before = beforeMap.get(k);
    if (!before) continue;
    const from = before.valence;
    const to = after.valence;
    if (from === to) {
      transitions.unchanged++;
      continue;
    }
    const label = `${from}→${to}`;
    if (transitions[label] != null) transitions[label]++;
    else transitions[label] = 1;

    const topicKey = after.topic;
    if (!byTopic.has(topicKey)) {
      byTopic.set(topicKey, { topic: topicKey, changes: 0, to_positive: 0, to_negative: 0, to_neutral: 0 });
    }
    const agg = byTopic.get(topicKey);
    agg.changes++;
    if (to === 'Positiva') agg.to_positive++;
    if (to === 'Negativa') agg.to_negative++;
    if (to === 'Neutra') agg.to_neutral++;

    if (changedSamples.length < 200) {
      changedSamples.push({
        response_id: after.response_id,
        topic: after.topic,
        from,
        to,
        cycle: after.analytical_cycle_code,
      });
    }
  }

  const totalComparable = [...afterMap.keys()].filter((k) => beforeMap.has(k)).length;
  const totalChanged = totalComparable - transitions.unchanged;

  return {
    generated_at: new Date().toISOString(),
    total_classifications_comparable: totalComparable,
    total_changed: totalChanged,
    pct_changed: totalComparable ? (totalChanged / totalComparable) * 100 : 0,
    transitions,
    by_topic: [...byTopic.values()].sort((a, b) => b.changes - a.changes),
    sample_changes: changedSamples,
  };
}

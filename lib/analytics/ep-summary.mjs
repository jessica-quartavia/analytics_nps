import {
  calculateNps,
  calculateNpsSummary,
  classifyNpsScore,
  isValidScore,
  dedupeLatestNpsByClient,
  npsScoreFromRow,
} from './nps.mjs';
import { calculateNpsConfidenceInterval } from './nps-confidence.mjs';
import { MIN_EP_SAMPLE } from './ep-config.mjs';

function median(scores) {
  if (!scores.length) return null;
  const s = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function average(scores) {
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** @param {{ ep_id?: string | null, ep_name?: string | null }} row */
export function epGroupKey(row) {
  if (row.ep_id) return `id:${row.ep_id}`;
  if (row.ep_name) return `name:${row.ep_name}`;
  return 'none:';
}

export function epMatchesKey(row, key) {
  return epGroupKey(row) === key;
}

function eligibleForEp(eligibleRows, cycleCode, epKey, sampleRow) {
  return eligibleRows.filter((e) => {
    if (e.analytical_cycle_code !== cycleCode) return false;
    if (sampleRow.ep_id && e.ep_id) return e.ep_id === sampleRow.ep_id;
    return (e.ep_name ?? '') === (sampleRow.ep_name ?? '');
  });
}

function computeEligibleRate(eligibleRows, cycleCode, epKey, sampleRow) {
  const elig = eligibleForEp(eligibleRows, cycleCode, epKey, sampleRow);
  if (!elig.length) {
    return {
      eligible_clients: null,
      response_rate: null,
      response_rate_quality: 'unavailable',
    };
  }
  const responded = elig.filter((e) => e.responded).length;
  const rate = responded / elig.length;
  let response_rate_quality = 'complete';
  if (responded < elig.length) response_rate_quality = 'partial';
  return {
    eligible_clients: elig.length,
    response_rate: rate,
    response_rate_quality,
  };
}

function countEpConfidence(rows) {
  let ep_high_confidence = 0;
  let ep_medium_confidence = 0;
  let ep_low_confidence = 0;
  for (const r of rows) {
    const c = r.ep_resolution_confidence;
    if (c === 'high') ep_high_confidence++;
    else if (c === 'medium') ep_medium_confidence++;
    else if (c === 'low') ep_low_confidence++;
  }
  const n = rows.length;
  return {
    ep_high_confidence,
    ep_medium_confidence,
    ep_low_confidence,
    ep_low_confidence_pct: n ? (ep_low_confidence / n) * 100 : 0,
  };
}

function pairedMetricsForEpCohort(pairedRows) {
  const deduped = dedupeLatestNpsByClient(pairedRows, { requireClientId: true });
  const prevScores = [];
  const currScores = [];
  for (const r of deduped) {
    if (!isValidScore(r.previous_score) || !isValidScore(r.score)) continue;
    prevScores.push(r.previous_score);
    currScores.push(r.score);
  }

  const paired_clients = prevScores.length;
  const previous_nps_paired = calculateNps(prevScores.map((score) => ({ score })));
  const current_nps_paired = calculateNps(currScores.map((score) => ({ score })));
  const delta_nps_paired =
    previous_nps_paired != null && current_nps_paired != null
      ? current_nps_paired - previous_nps_paired
      : null;

  const previous_average_score_paired = average(prevScores);
  const current_average_score_paired = average(currScores);
  const average_score_delta_paired =
    previous_average_score_paired != null && current_average_score_paired != null
      ? current_average_score_paired - previous_average_score_paired
      : null;

  let recovered_detractors = 0;
  let recovered_detractors_denominator = 0;
  let deteriorated_promoters = 0;
  let deteriorated_promoters_denominator = 0;

  for (const r of pairedRows) {
    if (!isValidScore(r.previous_score) || !isValidScore(r.score)) continue;
    const prevCat = r.previous_category ?? classifyNpsScore(r.previous_score);
    const currCat = r.nps_category ?? classifyNpsScore(r.score);

    if (prevCat === 'Detrator') {
      recovered_detractors_denominator++;
      if (currCat === 'Neutro' || currCat === 'Promotor') recovered_detractors++;
    }
    if (prevCat === 'Promotor') {
      deteriorated_promoters_denominator++;
      if (currCat === 'Neutro' || currCat === 'Detrator') deteriorated_promoters++;
    }
  }

  return {
    paired_clients,
    previous_nps_paired,
    current_nps_paired,
    delta_nps_paired,
    previous_average_score_paired,
    current_average_score_paired,
    average_score_delta_paired,
    recovered_detractors,
    recovered_detractors_denominator,
    deteriorated_promoters,
    deteriorated_promoters_denominator,
  };
}

/**
 * @param {string} cycleCode
 * @param {string} epKey
 * @param {Array<object>} validRows respostas válidas do ciclo+EP
 * @param {Array<object>} eligibleRows
 * @param {boolean} hasPreviousCycle
 */
export function buildEpSummaryEntry(cycleCode, epKey, validRows, eligibleRows, hasPreviousCycle) {
  const deduped = dedupeLatestNpsByClient(validRows, { requireClientId: true });
  const sample = deduped[0] ?? {};
  const summary = calculateNpsSummary(
    deduped.map((r) => ({ score: npsScoreFromRow(r) })),
  );
  const scores = deduped.map((r) => npsScoreFromRow(r));
  const ci = calculateNpsConfidenceInterval(scores);
  const eligibleMeta = computeEligibleRate(eligibleRows, cycleCode, epKey, sample);
  const confidence = countEpConfidence(deduped);

  const pairedRows = hasPreviousCycle
    ? deduped.filter((r) => r.previous_score != null && isValidScore(r.previous_score))
    : [];
  const paired = hasPreviousCycle ? pairedMetricsForEpCohort(pairedRows) : {
    paired_clients: 0,
    previous_nps_paired: null,
    current_nps_paired: null,
    delta_nps_paired: null,
    previous_average_score_paired: null,
    current_average_score_paired: null,
    average_score_delta_paired: null,
    recovered_detractors: 0,
    recovered_detractors_denominator: 0,
    deteriorated_promoters: 0,
    deteriorated_promoters_denominator: 0,
  };

  return {
    cycle_code: cycleCode,
    ep_id: sample.ep_id ?? null,
    ep_name: sample.ep_name ?? '',
    valid_responses: summary.total,
    promoters: summary.promoters,
    passives: summary.passives,
    detractors: summary.detractors,
    promoter_pct: summary.promoterPct,
    passive_pct: summary.passivePct,
    detractor_pct: summary.detractorPct,
    nps: summary.nps,
    average_score: average(scores),
    median_score: median(scores),
    nps_ci_low: ci.nps_ci_low,
    nps_ci_high: ci.nps_ci_high,
    nps_ci_method: ci.nps_ci_method,
    eligible_clients: eligibleMeta.eligible_clients,
    response_rate: eligibleMeta.response_rate,
    response_rate_quality: eligibleMeta.response_rate_quality,
    ...paired,
    ...confidence,
    _ep_key: epKey,
  };
}

/**
 * @param {Array<object>} responses processed deduplicated
 * @param {Array<object>} eligibleRows
 * @param {Array<{ cycle_code: string, sequence?: number }>} cycleDefs
 * @param {string} dataCutoff
 */
export function buildEpSummaryDocument(responses, eligibleRows, cycleDefs, dataCutoff) {
  const sorted = [...cycleDefs].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const prevByCode = new Map();
  for (let i = 0; i < sorted.length; i++) {
    prevByCode.set(sorted[i].cycle_code, i > 0 ? sorted[i - 1].cycle_code : null);
  }

  const entries = [];
  for (const def of sorted) {
    const cycleCode = def.cycle_code;
    const hasPrevious = Boolean(prevByCode.get(cycleCode));
    const cycleValid = responses.filter(
      (r) => r.analytical_cycle_code === cycleCode && isValidScore(r.score),
    );
    const byEp = new Map();
    for (const r of cycleValid) {
      const key = epGroupKey(r);
      if (!byEp.has(key)) byEp.set(key, []);
      byEp.get(key).push(r);
    }

    for (const [epKey, rows] of byEp) {
      if (epKey === 'none:' && rows.length === 0) continue;
      entries.push(buildEpSummaryEntry(cycleCode, epKey, rows, eligibleRows, hasPrevious));
    }
  }

  return {
    data_cutoff: dataCutoff,
    min_ep_sample: MIN_EP_SAMPLE,
    entries,
  };
}

/**
 * @param {object} doc ep_summary document
 */
export function validateEpSummaryInvariants(doc) {
  const errors = [];
  const seen = new Set();

  for (const e of doc?.entries ?? []) {
    const key = `${e.cycle_code}::${e._ep_key ?? e.ep_id ?? e.ep_name}`;
    if (seen.has(key)) {
      errors.push({ message: `Duplicate cycle+EP: ${key}` });
    }
    seen.add(key);

    const sum = e.promoters + e.passives + e.detractors;
    if (sum !== e.valid_responses) {
      errors.push({
        message: `P+N+D (${sum}) != valid_responses (${e.valid_responses}) ${e.ep_name} ${e.cycle_code}`,
      });
    }

    if (e.valid_responses === 0 && e.nps !== null) {
      errors.push({ message: `NPS deve ser null com n=0 (${e.ep_name})` });
    }

    if (e.valid_responses > 0 && e.nps == null) {
      errors.push({ message: `NPS ausente com n>0 (${e.ep_name})` });
    }

    if (e.paired_clients > e.valid_responses) {
      errors.push({
        message: `paired_clients > valid_responses (${e.ep_name} ${e.cycle_code})`,
      });
    }

    if (e.recovered_detractors_denominator < 0 || e.deteriorated_promoters_denominator < 0) {
      errors.push({ message: 'Denominador de recuperação/deterioração negativo' });
    }

    if (e.recovered_detractors > e.recovered_detractors_denominator) {
      errors.push({ message: 'recovered_detractors > denominator' });
    }
    if (e.deteriorated_promoters > e.deteriorated_promoters_denominator) {
      errors.push({ message: 'deteriorated_promoters > denominator' });
    }
  }

  return errors;
}

export { MIN_EP_SAMPLE };

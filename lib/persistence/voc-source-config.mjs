/**
 * VOC_SOURCE_MODE: base_qv | file
 * Em Vercel, default base_qv se não definido.
 */
export function loadVocSourceMode(env = process.env) {
  const raw = String(env.VOC_SOURCE_MODE ?? '').trim().toLowerCase();
  if (raw === 'base_qv' || raw === 'file') return raw;
  if (env.VERCEL === '1' || env.VERCEL_ENV) return 'base_qv';
  return 'file';
}

export function loadVocSourceLookbackHours(env = process.env) {
  const n = Number(env.VOC_SOURCE_LOOKBACK_HOURS ?? 72);
  return Number.isFinite(n) && n >= 0 ? n : 72;
}

export function loadVocSourceInitialLookbackDays(env = process.env) {
  const n = Number(env.VOC_SOURCE_INITIAL_LOOKBACK_DAYS ?? 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

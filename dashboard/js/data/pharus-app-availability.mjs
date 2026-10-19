/**
 * Disponibilidade do match App Pharus no dashboard (artifact + audit).
 */
export function isPharusAppMatchAvailable(matchDoc, pharusAudit) {
  const entries = matchDoc?.entries;
  if (!Array.isArray(entries) || entries.length === 0) return false;
  const src = String(pharusAudit?.app_source ?? matchDoc?.app_source ?? '').toLowerCase();
  if (src === 'not_configured' || src === 'no_table') return false;
  if (pharusAudit?.warning && !(pharusAudit?.pharus_records ?? pharusAudit?.app_records)) {
    return false;
  }
  return true;
}

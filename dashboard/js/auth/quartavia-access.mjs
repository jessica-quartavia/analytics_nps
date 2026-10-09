/** @param {string|null|undefined} email @param {string[]} allowedDomains */
export function isAuthorizedQuartaviaUser(email, allowedDomains = ['quartavia.com.br']) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2 || !parts[0]) return false;
  return allowedDomains.includes(parts[1]);
}

export function resolveOAuthRedirectTo(origin) {
  const base = String(origin ?? '').replace(/\/$/, '');
  return `${base}/`;
}

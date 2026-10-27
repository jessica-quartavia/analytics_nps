/** Mapa UF → região (somente com UF confiável de 2 letras). */
const UF_REGIAO = {
  AC: 'Norte',
  AP: 'Norte',
  AM: 'Norte',
  PA: 'Norte',
  RO: 'Norte',
  RR: 'Norte',
  TO: 'Norte',
  AL: 'Nordeste',
  BA: 'Nordeste',
  CE: 'Nordeste',
  MA: 'Nordeste',
  PB: 'Nordeste',
  PE: 'Nordeste',
  PI: 'Nordeste',
  RN: 'Nordeste',
  SE: 'Nordeste',
  DF: 'Centro-Oeste',
  GO: 'Centro-Oeste',
  MS: 'Centro-Oeste',
  MT: 'Centro-Oeste',
  ES: 'Sudeste',
  MG: 'Sudeste',
  RJ: 'Sudeste',
  SP: 'Sudeste',
  PR: 'Sul',
  RS: 'Sul',
  SC: 'Sul',
};

export function normalizeBrazilUf(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  if (s.length === 2 && UF_REGIAO[s]) return s;
  const m = s.match(/\b([A-Z]{2})\b/);
  if (m && UF_REGIAO[m[1]]) return m[1];
  return null;
}

export function regionFromUf(uf) {
  const n = normalizeBrazilUf(uf);
  return n ? UF_REGIAO[n] : null;
}

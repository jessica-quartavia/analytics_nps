export function cycleSortKey(ciclo) {
  const s = String(ciclo ?? '');
  const m = s.match(/^(\d{4})-Q(\d)/);
  if (m) return Number(m[1]) * 10 + Number(m[2]);
  return 9000 + s.charCodeAt(0);
}

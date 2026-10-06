import postgres from 'postgres';

const IDENT = /^[a-z_][a-z0-9_]*$/i;

/**
 * Conexão direta ao Business Data (schema base0 não exposto na Data API).
 */
export function connectBase0() {
  const url =
    process.env.ANALYTICS_NPS_DATABASE_URL ??
    process.env.BUSINESS_DATA_DATABASE_URL;
  if (!url?.includes('rckpuebaiswrxzmywllv')) {
    throw new Error(
      'Configure ANALYTICS_NPS_DATABASE_URL apontando para Business Data (rckpuebaiswrxzmywllv)',
    );
  }
  return postgres(url, { max: 1, prepare: false });
}

/**
 * INSERT … ON CONFLICT DO UPDATE (colunas derivadas das chaves do primeiro row).
 * @param {import('postgres').Sql} pg
 * @param {string} qualifiedTable ex: base0.clientes
 * @param {Record<string, unknown>[]} rows
 * @param {string} conflictKey
 */
export async function upsertBatches(pg, qualifiedTable, rows, conflictKey, batchSize = 300) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]).filter((k) => k !== 'id');
  for (const c of [...cols, conflictKey]) {
    if (!IDENT.test(c)) throw new Error(`identificador inválido: ${c}`);
  }
  if (!qualifiedTable.startsWith('base0.')) {
    throw new Error(`tabela fora de base0: ${qualifiedTable}`);
  }
  const updateCols = cols.filter((c) => c !== conflictKey);
  const setClause = updateCols.map((c) => `"${c}" = excluded."${c}"`).join(', ');

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    await pg`
      insert into ${pg.unsafe(qualifiedTable)} ${pg(chunk, cols)}
      on conflict (${pg.unsafe(`"${conflictKey}"`)}) do update set ${pg.unsafe(setClause)}
    `;
  }
}

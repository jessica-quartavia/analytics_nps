/**
 * Placeholder Parquet — ative com ANALYTICS_USE_PARQUET=1 após instalar dependência compatível.
 * @param {string} _absolutePath
 * @param {Array<object>} _rows
 */
export async function writeParquetTable(_absolutePath, _rows) {
  throw new Error(
    'Parquet não configurado. Use JSON (padrão) ou instale writer e ANALYTICS_USE_PARQUET=1.',
  );
}

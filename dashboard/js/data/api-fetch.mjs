/**
 * Cliente HTTP único para APIs consolidadas (/api/dashboard|actions|system|voc).
 * Detecta HTML/404, valida JSON e desempacota `{ ok, data }` quando presente.
 */
export async function apiFetch(url, options = {}) {
  const { unwrapData = false, ...fetchOptions } = options;
  let res;
  try {
    res = await fetch(url, { cache: 'no-store', ...fetchOptions });
  } catch (cause) {
    const err = new Error(`Falha de rede ao chamar ${url}`);
    err.code = 'API_FETCH_NETWORK';
    err.cause = cause;
    throw err;
  }

  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  if (!contentType.includes('json') && text.trimStart().startsWith('<')) {
    const err = new Error(
      `Resposta HTML inesperada (${res.status}) — verifique rotas /api no deploy.`,
    );
    err.code = 'API_HTML_RESPONSE';
    err.status = res.status;
    err.url = url;
    throw err;
  }

  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (cause) {
    const err = new Error(`JSON inválido em ${url}`);
    err.code = 'API_INVALID_JSON';
    err.status = res.status;
    err.url = url;
    err.cause = cause;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(json?.message ?? `HTTP ${res.status} em ${url}`);
    err.code = json?.code ?? 'API_HTTP_ERROR';
    err.status = res.status;
    err.url = url;
    err.payload = json;
    throw err;
  }

  if (unwrapData && json && typeof json === 'object' && 'data' in json && json.data != null) {
    return json.data;
  }
  return json;
}

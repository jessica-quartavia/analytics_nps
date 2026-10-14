export function sendJson(res, status, body) {
  if (typeof res.status === 'function') {
    res.status(status).json(body);
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function methodNotAllowed(res, allowed = ['GET', 'POST']) {
  sendJson(res, 405, {
    ok: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: `Use ${allowed.join(' or ')}` },
  });
}

export function unknownAction(res, action, router) {
  sendJson(res, 400, {
    ok: false,
    error: { code: 'UNKNOWN_ACTION', message: `Ação inválida: ${action ?? '(vazia)'}`, router },
  });
}

import { createHash } from 'node:crypto';

export function sha256Json(obj) {
  const h = createHash('sha256');
  h.update(JSON.stringify(obj));
  return h.digest('hex');
}

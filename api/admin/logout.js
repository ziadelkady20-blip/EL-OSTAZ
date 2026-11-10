import { allowMethods, sendJson } from '../../lib/http.js';
import { clearAdminSession } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  clearAdminSession(res);
  return sendJson(res, 200, { ok: true });
}
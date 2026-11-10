import { allowMethods, sendJson } from '../../lib/http.js';
import { getAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  const admin = getAdmin(req);
  if (!admin) return sendJson(res, 401, { authenticated: false });
  return sendJson(res, 200, { authenticated: true, username: admin.username });
}
import { getDb } from '../lib/db.js';
import { allowMethods, sendJson } from '../lib/http.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const sql = getDb();
    await sql`SELECT 1 AS ok`;
    return sendJson(res, 200, { ok: true, database: 'connected' });
  } catch (error) {
    console.error('health check failed', error);
    return sendJson(res, 503, { ok: false, database: 'unavailable' });
  }
}
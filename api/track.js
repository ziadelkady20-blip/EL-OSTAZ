import { getDb } from '../lib/db.js';
import { allowMethods, sendJson } from '../lib/http.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const code = String(new URL(req.url, 'https://ostaz.local').searchParams.get('code') || '').trim().toUpperCase();
    if (!/^OST-[A-F0-9]{14}$/.test(code)) return sendJson(res, 400, { error: 'اكتب رقم الطلب بشكل صحيح' });
    const sql = getDb();
    const rows = await sql`SELECT order_code, service_type, status, status_history, created_at, updated_at FROM public.print_orders WHERE order_code = ${code} LIMIT 1`;
    if (!rows.length) return sendJson(res, 404, { error: 'لم نعثر على طلب بهذا الرقم. راجع رقم الطلب وحاول مرة أخرى.' });
    return sendJson(res, 200, { order: rows[0] });
  } catch (error) {
    console.error('track api error', error);
    return sendJson(res, 500, { error: 'تعذر جلب حالة الطلب حاليًا' });
  }
}
import { getDb } from '../../lib/db.js';
import { allowMethods, readJson, safeText, sendJson } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';

const STATUSES = ['new', 'confirmed', 'printing', 'ready', 'delivered', 'cancelled'];

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!requireAdmin(req, res)) return;
  try {
    const body = await readJson(req);
    const id = Number.parseInt(body.id, 10);
    const status = safeText(body.status, 30);
    const note = safeText(body.note, 300);
    const price = body.quotedPrice === '' || body.quotedPrice == null ? null : Number(body.quotedPrice);
    if (!Number.isInteger(id) || id < 1 || !STATUSES.includes(status)) return sendJson(res, 400, { error: 'بيانات تحديث الطلب غير صحيحة' });
    if (price !== null && (!Number.isFinite(price) || price < 0 || price > 10000000)) return sendJson(res, 400, { error: 'السعر غير صحيح' });
    const event = JSON.stringify({ status, at: new Date().toISOString(), message: note || null });
    const sql = getDb();
    const rows = await sql`UPDATE public.print_orders
      SET status = ${status},
          status_history = COALESCE(status_history, '[]'::jsonb) || ${event}::jsonb,
          quoted_price = CASE WHEN ${price}::numeric IS NULL THEN quoted_price ELSE ${price}::numeric END,
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, order_code, status, status_history, quoted_price, updated_at`;
    if (!rows.length) return sendJson(res, 404, { error: 'الطلب غير موجود' });
    return sendJson(res, 200, { ok: true, order: rows[0] });
  } catch (error) {
    console.error('order status update error', error);
    return sendJson(res, 500, { error: 'تعذر تحديث حالة الطلب' });
  }
}
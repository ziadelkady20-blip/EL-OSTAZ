import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { getDb } from '../../lib/db.js';
import { requireAdmin } from '../../lib/auth.js';
import { sendJson } from '../../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'طريقة الطلب غير مدعومة' });
  if (!requireAdmin(req, res)) return;
  try {
    const id = Number.parseInt(new URL(req.url, 'https://ostaz.local').searchParams.get('id'), 10);
    if (!Number.isInteger(id) || id < 1) return sendJson(res, 400, { error: 'رقم الطلب غير صحيح' });
    const sql = getDb();
    const rows = await sql`SELECT file_path, file_name, file_type FROM public.print_orders WHERE id = ${id} LIMIT 1`;
    if (!rows.length || !rows[0].file_path) return sendJson(res, 404, { error: 'الملف غير موجود' });
    const result = await get(rows[0].file_path, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) return sendJson(res, 404, { error: 'تعذر الوصول إلى الملف' });
    const filename = String(rows[0].file_name || 'print-file').replace(/[\r\n"]/g, '_');
    res.statusCode = 200;
    res.setHeader('Content-Type', rows[0].file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    Readable.fromWeb(result.stream).pipe(res);
  } catch (error) {
    console.error('order file download error', error);
    return sendJson(res, 500, { error: 'تعذر تنزيل الملف' });
  }
}
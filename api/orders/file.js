import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { getDb } from '../../lib/db.js';
import { requireAdmin } from '../../lib/auth.js';
import { sendJson } from '../../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'طريقة الطلب غير مدعومة' });
  if (!requireAdmin(req, res)) return;
  try {
    const url = new URL(req.url, 'https://ostaz.local');
    const id = Number.parseInt(url.searchParams.get('id'), 10);
    const fileIndex = url.searchParams.has('fileIndex') ? Number.parseInt(url.searchParams.get('fileIndex'), 10) : 0;
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(fileIndex) || fileIndex < 0 || fileIndex >= 20) {
      return sendJson(res, 400, { error: 'بيانات تنزيل الملف غير صحيحة' });
    }
    const sql = getDb();
    const rows = await sql`SELECT file_path, file_name, file_type, files FROM public.print_orders WHERE id = ${id} LIMIT 1`;
    if (!rows.length) return sendJson(res, 404, { error: 'الطلب غير موجود' });
    const order = rows[0];
    const files = Array.isArray(order.files) ? order.files : [];
    const selected = files.length ? files[fileIndex] : (fileIndex === 0 ? {
      file_path: order.file_path,
      file_name: order.file_name,
      file_type: order.file_type,
    } : null);
    if (!selected || !selected.file_path) return sendJson(res, 404, { error: 'الملف غير موجود' });
    const result = await get(selected.file_path, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) return sendJson(res, 404, { error: 'تعذر الوصول إلى الملف' });
    const filename = String(selected.file_name || 'print-file').replace(/[\\r\\n"]/g, '_');
    res.statusCode = 200;
    res.setHeader('Content-Type', selected.file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    Readable.fromWeb(result.stream).pipe(res);
  } catch (error) {
    console.error('order file download error', error);
    return sendJson(res, 500, { error: 'تعذر تنزيل الملف' });
  }
}

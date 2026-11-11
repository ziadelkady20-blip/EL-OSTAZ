import { getDb } from '../lib/db.js';
import { allowMethods, sendJson } from '../lib/http.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const code = String(new URL(req.url, 'https://ostaz.local').searchParams.get('code') || '').trim().toUpperCase();
    if (!/^OST-[A-F0-9]{14}$/.test(code)) return sendJson(res, 400, { error: 'اكتب رقم الطلب بشكل صحيح' });
    const sql = getDb();
    const rows = await sql`SELECT order_code, service_type, status, status_history, page_count, copies, quoted_price, file_type, files, created_at, updated_at FROM public.print_orders WHERE order_code = ${code} LIMIT 1`;
    if (!rows.length) return sendJson(res, 404, { error: 'لم نعثر على طلب بهذا الرقم. راجع رقم الطلب وحاول مرة أخرى.' });
    const order = rows[0];
    const files = Array.isArray(order.files) && order.files.length
      ? order.files.map(file => ({
          file_name: file.file_name,
          service_type: file.service_type,
          paper_type: file.paper_type,
          paper_size: file.paper_size,
          finishing: file.finishing,
          copies: file.copies,
          page_count: file.page_count,
          sheets_per_copy: file.sheets_per_copy,
          total_sheets: file.total_sheets,
          quoted_price: file.quoted_price,
          notes: file.notes,
        }))
      : [{
          file_name: 'ملف الطلب',
          service_type: order.service_type,
          copies: order.copies,
          page_count: order.page_count,
          quoted_price: order.quoted_price,
        }];
    return sendJson(res, 200, {
      order: {
        order_code: order.order_code,
        service_type: order.service_type,
        status: order.status,
        status_history: order.status_history,
        page_count: order.page_count,
        copies: order.copies,
        quoted_price: order.quoted_price,
        files,
        created_at: order.created_at,
        updated_at: order.updated_at,
      },
    });
  } catch (error) {
    console.error('track api error', error);
    return sendJson(res, 500, { error: 'تعذر جلب حالة الطلب حاليًا' });
  }
}

import { getDb } from '../lib/db.js';
import { allowMethods, sendJson } from '../lib/http.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const code = String(new URL(req.url, 'https://ostaz.local').searchParams.get('code') || '').trim().toUpperCase();
    if (!/^OST-[A-F0-9]{14}$/.test(code)) return sendJson(res, 400, { error: 'اكتب رقم الطلب بشكل صحيح' });
    const sql = getDb();
    const rows = await sql`SELECT order_code, customer_name, phone, delivery_address, service_type, status, status_history, page_count, copies, quoted_price, file_type, files, catalog_items, catalog_total, print_total, fulfillment_method, created_at, updated_at FROM public.print_orders WHERE order_code = ${code} LIMIT 1`;
    if (!rows.length) return sendJson(res, 404, { error: 'لم نعثر على طلب بهذا الرقم. راجع رقم الطلب وحاول مرة أخرى.' });
    const order = rows[0];
    const files = Array.isArray(order.files) && order.files.length
      ? order.files.map(file => ({
          file_name: file.file_name,
          file_type: file.file_type,
          image_count: file.image_count ?? (String(file.file_type||'').startsWith('image/') ? 1 : 0),
          printed_image_count: file.printed_image_count ?? (String(file.file_type||'').startsWith('image/') ? (file.copies||1) : 0),
          service_type: file.service_type,
          paper_type: file.paper_type,
          paper_size: file.paper_size,
          finishing: file.finishing,
          copies: file.copies,
          page_count: file.page_count,
          pages_per_sheet: file.pages_per_sheet,
          printed_sides_per_copy: file.printed_sides_per_copy,
          sheets_per_copy: file.sheets_per_copy,
          total_sheets: file.total_sheets,
          price_per_sheet: file.price_per_sheet,
          order_binding_fee: file.order_binding_fee || 0,
          quoted_price: file.quoted_price,
          notes: file.notes,
        }))
      : [{
          file_name: 'ملف الطلب',
          file_type: order.file_type,
          image_count: String(order.file_type||'').startsWith('image/') ? 1 : 0,
          printed_image_count: String(order.file_type||'').startsWith('image/') ? (order.copies||1) : 0,
          service_type: order.service_type,
          copies: order.copies,
          page_count: order.page_count,
          quoted_price: order.quoted_price,
        }];
    const safeFiles = order.file_type || (Array.isArray(order.files) && order.files.length) ? files : [];
    const totalImages = safeFiles.reduce((sum, file) => sum + Number(file.image_count || 0), 0);
    const totalPrintedImages = safeFiles.reduce((sum, file) => sum + Number(file.printed_image_count || 0), 0);
    return sendJson(res, 200, {
      order: {
        order_code: order.order_code,
        customer_name: order.customer_name,
        phone: order.phone,
        delivery_address: order.delivery_address,
        service_type: order.service_type,
        status: order.status,
        status_history: order.status_history,
        page_count: order.page_count,
        copies: order.copies,
        quoted_price: order.quoted_price,
        total_images: totalImages,
        total_printed_images: totalPrintedImages,
        binding_fee: Number(safeFiles[0]?.order_binding_fee || 0),
        catalog_items: Array.isArray(order.catalog_items) ? order.catalog_items : [],
        catalog_total: Number(order.catalog_total || 0),
        print_total: order.print_total == null ? null : Number(order.print_total),
        fulfillment_method: order.fulfillment_method || 'pickup',
        files: safeFiles,
        created_at: order.created_at,
        updated_at: order.updated_at,
      },
    });
  } catch (error) {
    console.error('track api error', error);
    return sendJson(res, 500, { error: 'تعذر جلب حالة الطلب حاليًا' });
  }
}

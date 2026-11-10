import crypto from 'node:crypto';
import { put, del } from '@vercel/blob';
import { getDb } from '../lib/db.js';
import { allowMethods, readJson, safeText, sendJson } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';

const SERVICES = ['طباعة وجه واحد (ألوان)', 'طباعة وجهين (ألوان)', 'طباعة وجه واحد (أبيض وأسود)', 'طباعة وجهين (أبيض وأسود)', 'شهادات', 'صور شخصية'];
const PAPERS = ['ورق عادي', 'ورق جلوسي'];
const SIZES = ['A4 (20 × 30)', 'A3 (30 × 40)'];
const FINISHES = ['بدون', 'تكعيب', 'دبوس'];
const MAX_FILE = 3 * 1024 * 1024;

function validateFile(file) {
  if (!file || typeof file.base64 !== 'string') throw new Error('ارفق ملف الطباعة');
  if (file.base64.length > Math.ceil(MAX_FILE * 4 / 3) + 16) throw new Error('حجم الملف يجب ألا يتجاوز 3 ميجابايت');
  const buffer = Buffer.from(file.base64, 'base64');
  if (!buffer.length || buffer.length > MAX_FILE) throw new Error('حجم الملف يجب ألا يتجاوز 3 ميجابايت');
  const type = safeText(file.type, 80).toLowerCase();
  const isPdf = type === 'application/pdf' && buffer.subarray(0, 5).toString() === '%PDF-';
  const isJpg = type === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = type === 'image/png' && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (!isPdf && !isJpg && !isPng) throw new Error('نوع الملف غير مدعوم أو محتوى الملف لا يطابق امتداده');
  return { buffer, type };
}

function newOrderCode() {
  return 'OST-' + crypto.randomBytes(7).toString('hex').toUpperCase();
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  try {
    const sql = getDb();
    if (req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const rows = await sql`SELECT id, order_code, customer_name, phone, service_type, paper_type, paper_size, finishing, copies, page_count, notes, file_name, file_type, file_size, quoted_price, status, status_history, created_at, updated_at FROM public.print_orders ORDER BY created_at DESC LIMIT 300`;
      return sendJson(res, 200, { orders: rows });
    }

    const body = await readJson(req);
    const customer = safeText(body.customer, 120);
    const phone = safeText(body.phone, 30);
    const service = safeText(body.service, 100);
    const paper = safeText(body.paper, 40);
    const size = safeText(body.size, 40);
    const finish = safeText(body.finish, 30);
    const copies = Number.parseInt(body.copies, 10);
    const notes = safeText(body.notes, 1500);
    if (!customer || !/^\+?[0-9٠-٩\s()-]{8,20}$/.test(phone)) throw new Error('راجع الاسم ورقم الهاتف');
    if (!SERVICES.includes(service) || !PAPERS.includes(paper) || !SIZES.includes(size) || !FINISHES.includes(finish)) throw new Error('اختيارات الطلب غير صحيحة');
    if (!Number.isInteger(copies) || copies < 1 || copies > 500) throw new Error('عدد النسخ يجب أن يكون من 1 إلى 500');
    if ((service === 'شهادات' || service === 'صور شخصية') && paper !== 'ورق جلوسي') throw new Error('الشهادات والصور الشخصية تتطلب ورق جلوسي');
    const file = validateFile(body.file);
    const code = newOrderCode();
    const originalName = safeText(body.file.name, 160).replace(/[\\/]/g, '_') || 'print-file';
    const storedName = originalName.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 90) || 'print-file';
    const blob = await put(`orders/${code}/${storedName}`, file.buffer, {
      access: 'private',
      addRandomSuffix: true,
      contentType: file.type,
      cacheControlMaxAge: 60
    });
    try {
      const history = JSON.stringify([{ status: 'new', at: new Date().toISOString(), message: 'تم استلام طلبك بنجاح' }]);
      const rows = await sql`INSERT INTO public.print_orders
        (order_code, customer_name, phone, service_type, paper_type, paper_size, finishing, copies, page_count, notes, file_name, file_path, file_type, file_size, status, status_history, created_at, updated_at)
        VALUES (${code}, ${customer}, ${phone}, ${service}, ${paper}, ${size}, ${finish}, ${copies}, 1, ${notes || null}, ${originalName}, ${blob.pathname}, ${file.type}, ${file.buffer.length}, 'new', ${history}::jsonb, NOW(), NOW())
        RETURNING id, order_code, status, created_at`;
      return sendJson(res, 201, { ok: true, order: rows[0], trackingUrl: `/track.html?code=${code}` });
    } catch (dbError) {
      try { await del(blob.pathname, { access: 'private' }); } catch {}
      throw dbError;
    }
  } catch (error) {
    console.error('orders api error', error);
    const message = error?.message || '';
    const status = /ارفق|حجم الملف|نوع الملف|راجع الاسم|اختيارات الطلب|عدد النسخ|تتطلب ورق/i.test(message) ? 400 : 500;
    return sendJson(res, status, { error: status === 400 ? message : 'حدث خطأ أثناء حفظ الطلب. حاول مرة أخرى.' });
  }
}
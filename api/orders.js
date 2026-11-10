import crypto from 'node:crypto';
import { head, del } from '@vercel/blob';
import { getDb } from '../lib/db.js';
import { allowMethods, readJson, safeText, sendJson } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { sendPrinterWhatsAppOrder } from '../lib/whatsapp.js';

const SERVICES = ['طباعة وجه واحد (ألوان)', 'طباعة وجهين (ألوان)', 'طباعة وجه واحد (أبيض وأسود)', 'طباعة وجهين (أبيض وأسود)', 'شهادات', 'صور شخصية'];
const PAPERS = ['ورق عادي', 'ورق جلوسي'];
const SIZES = ['A4 (20 × 30)', 'A3 (30 × 40)'];
const FINISHES = ['بدون', 'تكعيب', 'دبوس'];
const MAX_FILE = 5 * 1024 ** 4;

function newOrderCode() {
  return 'OST-' + crypto.randomBytes(7).toString('hex').toUpperCase();
}

function validateUploadedFile(file, blob) {
  if (!file || typeof file.pathname !== 'string' || !file.pathname.startsWith('orders/')) {
    throw new Error('ارفع ملف الطباعة أولًا');
  }
  if (!blob || !Number.isSafeInteger(Number(blob.size)) || Number(blob.size) < 1 || Number(blob.size) > MAX_FILE) {
    throw new Error('حجم الملف غير صالح أو يتجاوز الحد التقني للتخزين');
  }
  const type = safeText(file.type, 80).toLowerCase();
  const storedType = safeText(blob.contentType, 100).toLowerCase();
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowed.includes(type) || storedType !== type) {
    throw new Error('نوع الملف غير مدعوم. ارفع PDF أو JPG أو PNG');
  }
  return { pathname: file.pathname, type, size: Number(blob.size) };
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

    const blob = await head(body.file?.pathname, { access: 'private' });
    const file = validateUploadedFile(body.file, blob);
    const code = newOrderCode();
    const originalName = safeText(body.file.name, 160).replace(/[\\/]/g, '_') || 'print-file';
    try {
      const history = JSON.stringify([{ status: 'new', at: new Date().toISOString(), message: 'تم استلام طلبك بنجاح' }]);
      const rows = await sql`INSERT INTO public.print_orders
        (order_code, customer_name, phone, service_type, paper_type, paper_size, finishing, copies, page_count, notes, file_name, file_path, file_type, file_size, status, status_history, created_at, updated_at)
        VALUES (${code}, ${customer}, ${phone}, ${service}, ${paper}, ${size}, ${finish}, ${copies}, 1, ${notes || null}, ${originalName}, ${file.pathname}, ${file.type}, ${file.size}, 'new', ${history}::jsonb, NOW(), NOW())
        RETURNING id, order_code, status, created_at`;
      const savedOrder = {
        ...rows[0],
        customer_name: customer,
        phone,
        service_type: service,
        paper_type: paper,
        paper_size: size,
        finishing: finish,
        copies,
        notes,
        file_name: originalName,
      };
      let whatsapp = { sent: false, configured: false, reason: 'WhatsApp notification was not attempted' };
      try {
        whatsapp = await sendPrinterWhatsAppOrder({ order: savedOrder, file: { ...file, name: originalName } });
        if (!whatsapp.sent) console.warn('order WhatsApp notification not sent', { orderCode: code, reason: whatsapp.reason });
      } catch (whatsappError) {
        console.error('order WhatsApp notification error', { orderCode: code, message: whatsappError?.message });
        whatsapp = { sent: false, configured: true, reason: 'WhatsApp delivery failed; order remains safely saved' };
      }
      return sendJson(res, 201, { ok: true, order: rows[0], trackingUrl: `/track.html?code=${code}`, whatsapp });
    } catch (dbError) {
      try { await del(file.pathname, { access: 'private' }); } catch {}
      throw dbError;
    }
  } catch (error) {
    console.error('orders api error', error);
    const message = error?.message || '';
    const status = /ارفع|حجم الملف|نوع الملف|راجع الاسم|اختيارات الطلب|عدد النسخ|تتطلب ورق/i.test(message) ? 400 : 500;
    return sendJson(res, status, { error: status === 400 ? message : 'حدث خطأ أثناء حفظ الطلب. حاول مرة أخرى.' });
  }
}

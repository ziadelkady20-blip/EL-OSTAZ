import crypto from 'node:crypto';
import { head, del } from '@vercel/blob';
import { getDb } from '../lib/db.js';
import { allowMethods, readJson, safeText, sendJson } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { sendPrinterWhatsAppOrder } from '../lib/whatsapp.js';
import { sendAdminPushNotification } from '../lib/push.js';

const SERVICES = ['طباعة وجه واحد (ألوان)', 'طباعة وجهين (ألوان)', 'طباعة وجه واحد (أبيض وأسود)', 'طباعة وجهين (أبيض وأسود)', 'شهادات', 'صور شخصية'];
const PAPERS = ['ورق عادي', 'ورق جلوسي'];
const SIZES = ['A4 (20 × 30)', 'A3 (30 × 40)'];
const FINISHES = ['بدون', 'تكعيب', 'دبوس'];
const PAGE_LAYOUTS = [1, 2, 4, 6, 8, 9, 16];
const MAX_FILE = 5 * 1024 ** 4;
const MAX_FILES = 20;

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

function summaryValue(items, key, fallback = 'متعدد') {
  return items.every(item => item[key] === items[0][key]) ? items[0][key] : fallback;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const uploadedForCleanup = [];
  let orderSaved = false;
  try {
    const sql = getDb();
    if (req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const rows = await sql`SELECT id, order_code, customer_name, phone, service_type, paper_type, paper_size, finishing, copies, page_count, notes, file_name, file_type, file_size, files, fulfillment_method, delivery_address, quoted_price, status, status_history, created_at, updated_at FROM public.print_orders ORDER BY created_at DESC LIMIT 300`;
      return sendJson(res, 200, { orders: rows });
    }

    const body = await readJson(req);
    const customer = safeText(body.customer, 120);
    const phone = safeText(body.phone, 30);
    const notes = safeText(body.notes, 1500);
    const fulfillmentMethod = safeText(body.fulfillmentMethod, 20) || 'pickup';
    const rawDeliveryAddress = safeText(body.deliveryAddress, 700);
    if (!['pickup', 'delivery'].includes(fulfillmentMethod)) throw new Error('اختر طريقة الاستلام');
    if (fulfillmentMethod === 'delivery' && !rawDeliveryAddress) throw new Error('اكتب عنوان التوصيل بالتفصيل');
    const deliveryAddress = fulfillmentMethod === 'delivery' ? rawDeliveryAddress : null;
    if (!customer || !/^\+?[0-9٠-٩\s()-]{8,20}$/.test(phone)) throw new Error('راجع الاسم ورقم الهاتف');

    // Accept the previous single-file payload as well, so older installed PWAs remain compatible.
    const incoming = Array.isArray(body.items) ? body.items : [{
      service: body.service,
      paper: body.paper,
      size: body.size,
      finish: body.finish,
      copies: body.copies,
      notes: '',
      pageCount: body.pageCount,
      file: body.file,
    }];
    if (!incoming.length || incoming.length > MAX_FILES) throw new Error('يمكنك إضافة من ملف واحد إلى ٢٠ ملفًا في الطلب الواحد');

    const items = [];
    for (let index = 0; index < incoming.length; index++) {
      const raw = incoming[index] || {};
      const service = safeText(raw.service, 100);
      const paper = safeText(raw.paper, 40);
      const size = safeText(raw.size, 40);
      const finish = safeText(raw.finish, 30);
      const copies = Number.parseInt(raw.copies, 10);
      const itemNotes = safeText(raw.notes, 700);
      if (!SERVICES.includes(service) || !PAPERS.includes(paper) || !SIZES.includes(size) || !FINISHES.includes(finish)) {
        throw new Error('اختيارات الملف رقم ' + (index + 1) + ' غير صحيحة');
      }
      if (!Number.isInteger(copies) || copies < 1 || copies > 500) {
        throw new Error('عدد النسخ للملف رقم ' + (index + 1) + ' يجب أن يكون من ١ إلى ٥٠٠');
      }
      if ((service === 'شهادات' || service === 'صور شخصية') && paper !== 'ورق جلوسي') {
        throw new Error('الشهادات والصور الشخصية تتطلب ورق جلوسي');
      }

      const blob = await head(raw.file?.pathname, { access: 'private' });
      const file = validateUploadedFile(raw.file, blob);
      uploadedForCleanup.push(file);
      const isPdf = file.type === 'application/pdf';
      const pageCount = isPdf ? Number.parseInt(raw.pageCount, 10) : null;
      if (isPdf && (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 10000)) {
        throw new Error('تعذر تحديد عدد صفحات ملف PDF رقم ' + (index + 1) + '. أعد حفظه كملف PDF عادي');
      }
      const isStandardPrint = SERVICES.slice(0, 4).includes(service);
      const isDuplex = service.includes('وجهين');
      if (isDuplex && paper !== 'ورق عادي') {
        throw new Error('الطباعة على الوجهين متاحة مع الورق العادي فقط');
      }
      if (isDuplex && !isPdf) {
        throw new Error('الطباعة على الوجهين متاحة لملفات PDF فقط');
      }
      const pagesPerSheet = isStandardPrint && isPdf ? Number(raw.pagesPerSheet ?? 1) : 1;
      if (isStandardPrint && isPdf && (!Number.isInteger(pagesPerSheet) || !PAGE_LAYOUTS.includes(pagesPerSheet))) {
        throw new Error('اختيار عدد الصفحات في الورقة للملف رقم ' + (index + 1) + ' غير صحيح');
      }
      const printedSidesPerCopy = isPdf
        ? (isStandardPrint ? Math.ceil(pageCount / pagesPerSheet) : pageCount)
        : 1;
      const sheetsPerCopy = isDuplex ? Math.ceil(printedSidesPerCopy / 2) : printedSidesPerCopy;
      const totalSheets = sheetsPerCopy * copies;
      const pricePerSheet = paper === 'ورق جلوسي' ? 5 : 0.75;
      const quotedPrice = Number((totalSheets * pricePerSheet).toFixed(2));
      const fileName = safeText(raw.file.name, 160).replace(/[\\/]/g, '_') || ('print-file-' + (index + 1));
      items.push({
        file_name: fileName,
        file_path: file.pathname,
        file_type: file.type,
        file_size: file.size,
        service_type: service,
        paper_type: paper,
        paper_size: size,
        finishing: finish,
        copies,
        page_count: pageCount,
        pages_per_sheet: pagesPerSheet,
        printed_sides_per_copy: printedSidesPerCopy,
        sheets_per_copy: sheetsPerCopy,
        total_sheets: totalSheets,
        price_per_sheet: pricePerSheet,
        quoted_price: quotedPrice,
        notes: itemNotes,
      });
    }

    const code = newOrderCode();
    const first = items[0];
    const bindingFee = items.some(item => item.finishing === 'تكعيب') ? 10 : 0;
    if (items.length) items[0].order_binding_fee = bindingFee;
    const allPriced = items.every(item => item.quoted_price !== null);
    const totalPrice = allPriced
      ? Number((items.reduce((sum, item) => sum + item.quoted_price, 0) + bindingFee).toFixed(2))
      : null;
    const totalPages = items.reduce((sum, item) => sum + (item.page_count || 0), 0);
    const totalCopies = items.reduce((sum, item) => sum + item.copies, 0);
    const totalSize = items.reduce((sum, item) => sum + item.file_size, 0);
    const serviceSummary = items.length === 1 ? first.service_type : 'طلب متعدد الملفات (' + items.length + ' ملفات)';
    const paperSummary = summaryValue(items, 'paper_type');
    const sizeSummary = summaryValue(items, 'paper_size');
    const finishSummary = summaryValue(items, 'finishing');
    const filesJson = JSON.stringify(items);
    const history = JSON.stringify([{ status: 'new', at: new Date().toISOString(), message: 'تم استلام طلبك بنجاح' }]);

    const rows = await sql`INSERT INTO public.print_orders
      (order_code, customer_name, phone, service_type, paper_type, paper_size, finishing, copies, page_count, quoted_price, notes, file_name, file_path, file_type, file_size, files, fulfillment_method, delivery_address, status, status_history, created_at, updated_at)
      VALUES (${code}, ${customer}, ${phone}, ${serviceSummary}, ${paperSummary}, ${sizeSummary}, ${finishSummary}, ${Math.min(500, totalCopies)}, ${Math.max(1, Math.min(1000, totalPages))}, ${totalPrice}, ${notes || null}, ${first.file_name}, ${first.file_path}, ${first.file_type}, ${totalSize}, ${filesJson}::jsonb, ${fulfillmentMethod}, ${deliveryAddress}, 'new', ${history}::jsonb, NOW(), NOW())
      RETURNING id, order_code, status, page_count, quoted_price, fulfillment_method, delivery_address, created_at`;
    orderSaved = true;

    const savedOrder = {
      ...rows[0],
      customer_name: customer,
      phone,
      fulfillment_method: fulfillmentMethod,
      delivery_address: deliveryAddress,
      service_type: serviceSummary,
      paper_type: paperSummary,
      paper_size: sizeSummary,
      finishing: finishSummary,
      copies: Math.min(500, totalCopies),
      page_count: Math.max(1, Math.min(1000, totalPages)),
      notes,
      file_name: first.file_name,
      files: items,
      file_count: items.length,
      binding_fee: bindingFee,
    };

    let push = { sent: 0, configured: false };
    try {
      push = await sendAdminPushNotification(savedOrder);
    } catch (pushError) {
      console.error('admin push notification error', { orderCode: code, message: pushError?.message });
    }

    let whatsapp = { sent: false, configured: false, reason: 'WhatsApp notification was not attempted' };
    try {
      // Keep the existing single WhatsApp attachment flow; the caption lists every file.
      whatsapp = await sendPrinterWhatsAppOrder({
        order: savedOrder,
        file: { pathname: first.file_path, type: first.file_type, size: first.file_size, name: first.file_name },
      });
      if (!whatsapp.sent) console.warn('order WhatsApp notification not sent', { orderCode: code, reason: whatsapp.reason });
    } catch (whatsappError) {
      console.error('order WhatsApp notification error', { orderCode: code, message: whatsappError?.message });
      whatsapp = { sent: false, configured: true, reason: 'WhatsApp delivery failed; order remains safely saved' };
    }

    const publicFiles = items.map(item => ({
      file_name: item.file_name,
      service_type: item.service_type,
      paper_type: item.paper_type,
      paper_size: item.paper_size,
      finishing: item.finishing,
      copies: item.copies,
      page_count: item.page_count,
      pages_per_sheet: item.pages_per_sheet,
      printed_sides_per_copy: item.printed_sides_per_copy,
      sheets_per_copy: item.sheets_per_copy,
      total_sheets: item.total_sheets,
      price_per_sheet: item.price_per_sheet,
      quoted_price: item.quoted_price,
      order_binding_fee: item.order_binding_fee || 0,
      notes: item.notes,
    }));
    return sendJson(res, 201, {
      ok: true,
      order: { ...rows[0], file_count: items.length, files: publicFiles, binding_fee: bindingFee },
      trackingUrl: '/track.html?code=' + code,
      whatsapp,
      push,
    });
  } catch (error) {
    if (!orderSaved && uploadedForCleanup.length) {
      await Promise.all(uploadedForCleanup.map(file => del(file.pathname, { access: 'private' }).catch(() => null)));
    }
    console.error('orders api error', error);
    const message = error?.message || '';
    const status = /ارفع|حجم الملف|نوع الملف|راجع الاسم|اختيارات|عدد النسخ|تتطلب ورق|صفحات|اختيار عدد الصفحات|ملف واحد إلى ٢٠|اختر طريقة الاستلام|عنوان التوصيل/i.test(message) ? 400 : 500;
    return sendJson(res, status, { error: status === 400 ? message : 'حدث خطأ أثناء حفظ الطلب. حاول مرة أخرى.' });
  }
}

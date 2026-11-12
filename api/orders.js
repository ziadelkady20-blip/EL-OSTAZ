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

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function catalogImageUrl(value) {
  const raw = safeText(value, 1000);
  if (!raw) return null;
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('رابط صورة المنتج غير صحيح'); }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('رابط صورة المنتج يجب أن يبدأ بـ https:// أو http://');
  return parsed.toString();
}

async function handleCatalogAdmin(req, res, sql) {
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === 'GET') {
      const [categories, products] = await Promise.all([
        sql`SELECT id, name, active, created_at, updated_at FROM public.catalog_categories ORDER BY id`,
        sql`SELECT p.id, p.category_id, c.name AS category_name, p.name, p.description, p.price, p.image_url, p.active, p.created_at, p.updated_at
          FROM public.catalog_products p
          INNER JOIN public.catalog_categories c ON c.id = p.category_id
          ORDER BY p.created_at DESC, p.id DESC`,
      ]);
      return sendJson(res, 200, { categories, products });
    }

    const body = await readJson(req);
    const type = safeText(body.type, 20);
    if (req.method === 'PATCH') {
      const id = positiveId(body.id);
      if (!id || typeof body.active !== 'boolean' || !['category', 'product'].includes(type)) {
        return sendJson(res, 400, { error: 'بيانات تحديث الحالة غير صحيحة' });
      }
      const rows = type === 'category'
        ? await sql`UPDATE public.catalog_categories SET active = ${body.active}, updated_at = NOW() WHERE id = ${id} RETURNING id, name, active`
        : await sql`UPDATE public.catalog_products SET active = ${body.active}, updated_at = NOW() WHERE id = ${id} RETURNING id, name, active`;
      if (!rows.length) return sendJson(res, 404, { error: 'العنصر المطلوب غير موجود' });
      return sendJson(res, 200, { ok: true, item: rows[0] });
    }

    if (req.method !== 'POST') return sendJson(res, 405, { error: 'طريقة الطلب غير مدعومة' });
    if (type === 'category') {
      const name = safeText(body.name, 120);
      if (name.length < 2) return sendJson(res, 400, { error: 'اكتب اسم القسم (حرفان على الأقل)' });
      const id = positiveId(body.id);
      const rows = id
        ? await sql`UPDATE public.catalog_categories SET name = ${name}, updated_at = NOW() WHERE id = ${id} RETURNING id, name, active`
        : await sql`INSERT INTO public.catalog_categories (name, active) VALUES (${name}, TRUE) RETURNING id, name, active`;
      if (!rows.length) return sendJson(res, 404, { error: 'القسم المطلوب غير موجود' });
      return sendJson(res, id ? 200 : 201, { ok: true, item: rows[0] });
    }

    if (type === 'product') {
      const id = positiveId(body.id);
      const categoryId = positiveId(body.categoryId);
      const name = safeText(body.name, 180);
      const description = safeText(body.description, 1500);
      const price = Number(body.price);
      const photo = catalogImageUrl(body.imageUrl);
      const active = typeof body.active === 'boolean' ? body.active : true;
      if (!categoryId || name.length < 2 || !Number.isFinite(price) || price < 0 || price > 100000000) {
        return sendJson(res, 400, { error: 'راجع القسم واسم المنتج والسعر' });
      }
      const category = await sql`SELECT id FROM public.catalog_categories WHERE id = ${categoryId} AND active = TRUE LIMIT 1`;
      if (!category.length) return sendJson(res, 400, { error: 'اختر قسمًا متاحًا' });
      const rows = id
        ? await sql`UPDATE public.catalog_products
            SET category_id = ${categoryId}, name = ${name}, description = ${description || null},
                price = ${price}, image_url = ${photo}, active = ${active}, updated_at = NOW()
            WHERE id = ${id}
            RETURNING id, category_id, name, description, price, image_url, active`
        : await sql`INSERT INTO public.catalog_products (category_id, name, description, price, image_url, active)
            VALUES (${categoryId}, ${name}, ${description || null}, ${price}, ${photo}, ${active})
            RETURNING id, category_id, name, description, price, image_url, active`;
      if (!rows.length) return sendJson(res, 404, { error: 'المنتج المطلوب غير موجود' });
      return sendJson(res, id ? 200 : 201, { ok: true, item: rows[0] });
    }

    return sendJson(res, 400, { error: 'نوع العنصر غير معروف' });
  } catch (error) {
    console.error('admin catalog error', error);
    if (/duplicate key|unique constraint/i.test(error?.message || '')) {
      return sendJson(res, 409, { error: 'يوجد قسم أو اسم مطابق بالفعل' });
    }
    return sendJson(res, 500, { error: error?.message || 'تعذر حفظ بيانات المتجر' });
  }
}

async function handlePublicCatalog(res, sql) {
  try {
    const categories = await sql`SELECT id, name FROM public.catalog_categories WHERE active = TRUE ORDER BY id`;
    const products = await sql`SELECT p.id, p.category_id, c.name AS category_name, p.name, p.description, p.price, p.image_url, p.active
      FROM public.catalog_products p
      INNER JOIN public.catalog_categories c ON c.id = p.category_id
      WHERE c.active = TRUE
      ORDER BY p.created_at DESC, p.id DESC`;
    return sendJson(res, 200, { categories, products });
  } catch (error) {
    console.error('public catalog error', error);
    return sendJson(res, 500, { error: 'تعذر تحميل منتجات المتجر حاليًا' });
  }
}

function summaryValue(items, key, fallback = 'متعدد') {
  return items.every(item => item[key] === items[0][key]) ? items[0][key] : fallback;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH'])) return;
  const uploadedForCleanup = [];
  let orderSaved = false;
  try {
    const sql = getDb();
    const url = new URL(req.url, 'https://ostaz.local');
    const catalogMode = url.searchParams.get('catalog');
    if (req.method === 'GET' && catalogMode === 'public') return await handlePublicCatalog(res, sql);
    if (catalogMode === 'admin' && (req.method === 'GET' || req.method === 'POST' || req.method === 'PATCH')) {
      return await handleCatalogAdmin(req, res, sql);
    }
    if (req.method === 'PATCH') return sendJson(res, 400, { error: 'مسار التحديث غير صحيح' });
    if (req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const rows = await sql`SELECT id, order_code, customer_name, phone, service_type, paper_type, paper_size, finishing, copies, page_count, notes, file_name, file_type, file_size, files, catalog_items, catalog_total, print_total, fulfillment_method, delivery_address, quoted_price, status, status_history, created_at, updated_at FROM public.print_orders ORDER BY created_at DESC LIMIT 300`;
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
    const incoming = Array.isArray(body.items) ? body.items : (body.file ? [{
      service: body.service,
      paper: body.paper,
      size: body.size,
      finish: body.finish,
      copies: body.copies,
      notes: '',
      pageCount: body.pageCount,
      file: body.file,
    }] : []);
    const requestedProducts = Array.isArray(body.products) ? body.products : [];
    if (incoming.length > MAX_FILES) throw new Error('الحد الأقصى ٢٠ ملفًا في طلب الطباعة الواحد');
    if (requestedProducts.length > 50) throw new Error('الحد الأقصى ٥٠ صنفًا مختلفًا في طلب المتجر');
    if (!incoming.length && !requestedProducts.length) throw new Error('أضف ملف طباعة أو منتجًا واحدًا على الأقل');

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
      const imageCount = isPdf ? 0 : 1;
      const printedImageCount = imageCount * copies;
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
        image_count: imageCount,
        printed_image_count: printedImageCount,
        pages_per_sheet: pagesPerSheet,
        printed_sides_per_copy: printedSidesPerCopy,
        sheets_per_copy: sheetsPerCopy,
        total_sheets: totalSheets,
        price_per_sheet: pricePerSheet,
        quoted_price: quotedPrice,
        notes: itemNotes,
      });
    }

    const catalogItems = [];
    for (let index = 0; index < requestedProducts.length; index++) {
      const raw = requestedProducts[index] || {};
      const productId = Number(raw.id);
      const quantity = Number(raw.quantity);
      if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
        throw new Error('راجع المنتج والكمية في السلة');
      }
      const productRows = await sql`SELECT p.id, p.category_id, c.name AS category_name, p.name, p.description, p.price, p.image_url, p.active, c.active AS category_active
        FROM public.catalog_products p
        INNER JOIN public.catalog_categories c ON c.id = p.category_id
        WHERE p.id = ${productId} LIMIT 1`;
      if (!productRows.length) throw new Error('أحد منتجات السلة لم يعد موجودًا');
      const product = productRows[0];
      if (!product.active || !product.category_active) throw new Error('المنتج «' + product.name + '» غير متاح حاليًا. حدّث المتجر قبل إرسال الطلب');
      const unitPrice = Number(product.price);
      const lineTotal = Number((unitPrice * quantity).toFixed(2));
      catalogItems.push({
        product_id: Number(product.id),
        category_id: Number(product.category_id),
        category_name: product.category_name,
        name: product.name,
        description: product.description,
        image_url: product.image_url,
        unit_price: unitPrice,
        quantity,
        line_total: lineTotal,
      });
    }

    const code = newOrderCode();
    const first = items[0] || null;
    const bindingFee = items.some(item => item.finishing === 'تكعيب') ? 10 : 0;
    if (items.length) items[0].order_binding_fee = bindingFee;
    const printSubtotal = Number((items.reduce((sum, item) => sum + Number(item.quoted_price || 0), 0) + bindingFee).toFixed(2));
    const catalogTotal = Number(catalogItems.reduce((sum, item) => sum + item.line_total, 0).toFixed(2));
    const totalPrice = Number((printSubtotal + catalogTotal).toFixed(2));
    const totalPages = items.reduce((sum, item) => sum + (item.page_count || 0), 0);
    const totalImages = items.reduce((sum, item) => sum + item.image_count, 0);
    const totalPrintedImages = items.reduce((sum, item) => sum + item.printed_image_count, 0);
    const totalCopies = items.reduce((sum, item) => sum + item.copies, 0) + catalogItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalSize = items.reduce((sum, item) => sum + item.file_size, 0);
    const serviceSummary = items.length
      ? (items.length === 1 ? first.service_type : 'طلب متعدد الملفات (' + items.length + ' ملفات)')
      : 'مشتريات المتجر';
    const paperSummary = items.length ? summaryValue(items, 'paper_type') : '—';
    const sizeSummary = items.length ? summaryValue(items, 'paper_size') : '—';
    const finishSummary = items.length ? summaryValue(items, 'finishing') : '—';
    const filesJson = JSON.stringify(items);
    const catalogJson = JSON.stringify(catalogItems);
    const history = JSON.stringify([{ status: 'new', at: new Date().toISOString(), message: 'تم استلام طلبك بنجاح' }]);

    const rows = await sql`INSERT INTO public.print_orders
      (order_code, customer_name, phone, service_type, paper_type, paper_size, finishing, copies, page_count, quoted_price, notes, file_name, file_path, file_type, file_size, files, catalog_items, catalog_total, print_total, fulfillment_method, delivery_address, status, status_history, created_at, updated_at)
      VALUES (${code}, ${customer}, ${phone}, ${serviceSummary}, ${paperSummary}, ${sizeSummary}, ${finishSummary}, ${Math.max(1, Math.min(500, totalCopies))}, ${Math.max(1, Math.min(1000, totalPages))}, ${totalPrice}, ${notes || null}, ${first?.file_name ?? null}, ${first?.file_path ?? null}, ${first?.file_type ?? null}, ${totalSize || null}, ${filesJson}::jsonb, ${catalogJson}::jsonb, ${catalogTotal}, ${printSubtotal}, ${fulfillmentMethod}, ${deliveryAddress}, 'new', ${history}::jsonb, NOW(), NOW())
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
      file_name: first?.file_name ?? null,
      files: items,
      catalog_items: catalogItems,
      catalog_total: catalogTotal,
      print_total: printSubtotal,
      file_count: items.length,
      total_images: totalImages,
      total_printed_images: totalPrintedImages,
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
        file: first ? { pathname: first.file_path, type: first.file_type, size: first.file_size, name: first.file_name } : null,
      });
      if (!whatsapp.sent) console.warn('order WhatsApp notification not sent', { orderCode: code, reason: whatsapp.reason });
    } catch (whatsappError) {
      console.error('order WhatsApp notification error', { orderCode: code, message: whatsappError?.message });
      whatsapp = { sent: false, configured: true, reason: 'WhatsApp delivery failed; order remains safely saved' };
    }

    const publicFiles = items.map(item => ({
      file_name: item.file_name,
      file_type: item.file_type,
      image_count: item.image_count,
      printed_image_count: item.printed_image_count,
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
      order: { ...rows[0], file_count: items.length, total_images: totalImages, total_printed_images: totalPrintedImages, files: publicFiles, catalog_items: catalogItems, catalog_total: catalogTotal, print_total: printSubtotal, binding_fee: bindingFee },
      trackingUrl: '/track.html?code=' + code,
      whatsapp,
      push,
    });
  } catch (error) {
    if (!orderSaved && uploadedForCleanup.length) {
      await Promise.all(uploadedForCleanup
        .filter(file => !file.pathname.startsWith('orders/share/'))
        .map(file => del(file.pathname, { access: 'private' }).catch(() => null)));
    }
    console.error('orders api error', error);
    const message = error?.message || '';
    const status = /ارفع|حجم الملف|نوع الملف|راجع الاسم|اختيارات|عدد النسخ|تتطلب ورق|صفحات|اختيار عدد الصفحات|ملف واحد إلى ٢٠|الحد الأقصى|اختر طريقة الاستلام|عنوان التوصيل|أضف ملف طباعة|منتج|السلة|غير متاح/i.test(message) ? 400 : 500;
    return sendJson(res, status, { error: status === 400 ? message : 'حدث خطأ أثناء حفظ الطلب. حاول مرة أخرى.' });
  }
}

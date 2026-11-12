import { get } from '@vercel/blob';

const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || 'v26.0';
const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function normalizePhone(value) {
  let digits = String(value || '').replace(/\\D/g, '');
  if (digits.startsWith('0')) digits = '20' + digits.slice(1);
  return digits;
}

async function graphRequest(url, options, label) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || label;
    throw new Error(message);
  }
  return data;
}

export async function sendPrinterWhatsAppOrder({ order, file }) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient = normalizePhone(process.env.WHATSAPP_PRINTER_NUMBER || '01507070009');

  if (!token || !phoneNumberId) {
    return { sent: false, configured: false, reason: 'WhatsApp Cloud API credentials are not configured' };
  }
  if (!/^\\d{10,15}$/.test(recipient)) {
    return { sent: false, configured: true, reason: 'Printer WhatsApp number is invalid' };
  }

  const base = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}`;
  if (!file) {
    const productsSummary = Array.isArray(order.catalog_items) && order.catalog_items.length
      ? order.catalog_items.map((item, index) => (index + 1) + ') ' + item.name + ' — ' + item.quantity + ' × ' + item.unit_price + ' = ' + item.line_total + ' جنيه').join('\\n').slice(0, 520)
      : '';
    const fulfillmentLabel = order.fulfillment_method === 'delivery' ? 'توصيل للعنوان' : 'استلام من الفرع';
    const caption = [
      `طلب متجر جديد — ${order.order_code}`,
      `العميل: ${order.customer_name}`,
      `الهاتف: ${order.phone}`,
      `طريقة الاستلام: ${fulfillmentLabel}`,
      order.fulfillment_method === 'delivery' ? `عنوان التوصيل: ${String(order.delivery_address || '').slice(0, 300)}` : '',
      productsSummary ? `المنتجات:\\n${productsSummary}` : '',
      `إجمالي المنتجات: ${order.catalog_total || 0} جنيه`,
      `الإجمالي التقديري للطلب: ${order.quoted_price ?? 0} جنيه`,
      order.notes ? `ملاحظات: ${order.notes}` : '',
    ].filter(Boolean).join('\\n').slice(0, 3900);
    const sent = await graphRequest(`${base}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: { preview_url: false, body: caption },
      }),
    }, 'WhatsApp could not send the store order');
    return { sent: true, configured: true, messageId: sent?.messages?.[0]?.id || null, recipient, mediaType: 'text' };
  }

  const isPdf = file.type === 'application/pdf';
  const isImage = file.type === 'image/jpeg' || file.type === 'image/png';
  const limit = isPdf ? MAX_DOCUMENT_BYTES : isImage ? MAX_IMAGE_BYTES : 0;
  if (!limit || file.size > limit) {
    return {
      sent: false,
      configured: true,
      reason: isPdf
        ? 'WhatsApp document limit is 100 MB'
        : isImage ? 'WhatsApp image limit is 5 MB' : 'Unsupported WhatsApp attachment type',
    };
  }

  const stored = await get(file.pathname, { access: 'private' });
  if (!stored || stored.statusCode !== 200 || !stored.stream) {
    throw new Error('Could not read the private print file for WhatsApp delivery');
  }
  const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());
  if (bytes.length !== file.size) throw new Error('Print file size mismatch before WhatsApp delivery');

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', file.type);
  form.append('file', new Blob([bytes], { type: file.type }), order.file_name || 'print-file');

  const uploaded = await graphRequest(`${base}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  }, 'WhatsApp media upload failed');

  if (!uploaded.id) throw new Error('WhatsApp did not return a media ID');

  const filesSummary = Array.isArray(order.files) && order.files.length
    ? order.files.map((item, index) => {
        const isImage = Number(item.image_count ?? 0) > 0 || String(item.file_type || '').startsWith('image/');
        const details = isImage
          ? ' — ' + (item.image_count ?? 1) + ' صورة / ' + (item.printed_image_count ?? ((item.image_count ?? 1) * (item.copies || 1))) + ' صورة مطبوعة / ' + (item.total_sheets ?? '—') + ' ورقة'
          : (item.page_count != null ? ' — ' + item.page_count + ' صفحة / ' + (item.pages_per_sheet || 1) + ' في الورقة / ' + (item.total_sheets ?? '—') + ' ورقة' : '');
        return (index + 1) + ') ' + item.file_name + ' — ' + item.service_type + ' — ' + item.copies + ' نسخة' + details + ' / ' + (item.quoted_price ?? '—') + ' جنيه';
      }).join('\n').slice(0, 620)
    : '';
  const fulfillmentLabel = order.fulfillment_method === 'delivery' ? 'توصيل للعنوان' : 'استلام من الفرع';
  const deliveryAddressLine = order.fulfillment_method === 'delivery'
    ? `عنوان التوصيل: ${String(order.delivery_address || '').slice(0, 350)}`
    : '';
  const caption = [
    `طلب طباعة جديد — ${order.order_code}`,
    `العميل: ${order.customer_name}`,
    `الهاتف: ${order.phone}`,
    `طريقة الاستلام: ${fulfillmentLabel}`,
    deliveryAddressLine,
    `الخدمة: ${order.service_type}`,
    filesSummary ? `ملفات الطلب:\n${filesSummary.slice(0, 360)}` : '',
    Array.isArray(order.catalog_items) && order.catalog_items.length
      ? `مشتريات المتجر:\n${order.catalog_items.map((item, index) => (index + 1) + ') ' + item.name + ' — ' + item.quantity + ' × ' + item.unit_price + ' = ' + item.line_total + ' جنيه').join('\\n').slice(0, 260)}`
      : '',
    order.catalog_total ? `إجمالي منتجات المتجر: ${order.catalog_total} جنيه` : '',
    order.total_images ? `إجمالي الصور المرفوعة: ${order.total_images} — بعد النسخ: ${order.total_printed_images} صورة مطبوعة` : '',
    order.binding_fee ? `رسوم التكعيب (مرة واحدة على الطلب): ${order.binding_fee} جنيه` : '',
    order.quoted_price != null ? `الإجمالي التقديري للطلب: ${order.quoted_price} جنيه` : '',
    `الورق: ${order.paper_type}`,
    `المقاس: ${order.paper_size}`,
    `التقفيل: ${order.finishing}`,
    `عدد النسخ الإجمالي: ${order.copies}`,
    order.files?.length > 1 ? 'تم إرفاق الملف الأول؛ باقي الملفات متاحة في لوحة الإدارة.' : '',
    order.notes ? `ملاحظات: ${order.notes}` : '',
  ].filter(Boolean).join('\n').slice(0, 1024);

  const mediaType = isPdf ? 'document' : 'image';
  const mediaKey = mediaType;
  const media = { id: uploaded.id, caption };
  if (mediaType === 'document') media.filename = order.file_name || 'print-file.pdf';

  const sent = await graphRequest(`${base}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: mediaType,
      [mediaKey]: media,
    }),
  }, 'WhatsApp could not send the print attachment');

  return {
    sent: true,
    configured: true,
    messageId: sent?.messages?.[0]?.id || null,
    recipient,
    mediaType,
  };
}

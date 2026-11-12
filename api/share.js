import crypto from 'node:crypto';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { head } from '@vercel/blob';
import { allowMethods, readJson, safeText, sendJson } from '../lib/http.js';

const MAX_FILE = 5 * 1024 ** 4;
const MAX_FILES = 20;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const TYPE_BY_EXTENSION = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

function cleanFileName(value) {
  return (safeText(value, 160).split('/').join('_')
    .split(String.fromCharCode(92)).join('_')
    .split(String.fromCharCode(0)).join('_')) || 'shared-file';
}

function signPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(encoded).digest('base64url');
  return encoded + '.' + signature;
}

function verifyToken(token) {
  if (!process.env.ADMIN_SESSION_SECRET || typeof token !== 'string' || token.length > 20000) return null;
  const [encoded, supplied] = token.split('.');
  if (!encoded || !supplied) return null;
  const expected = crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(encoded).digest();
  let actual;
  try { actual = Buffer.from(supplied, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.version !== 1 || !Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) return null;
    if (!Array.isArray(payload.files) || !payload.files.length || payload.files.length > MAX_FILES) return null;
    return payload;
  } catch { return null; }
}

async function issueUploadToken(body, res) {
  const fileName = cleanFileName(body.fileName || body.name);
  const extension = safeText(body.extension, 12).split('.').join('').toLowerCase() ||
    fileName.split('.').pop().toLowerCase();
  const contentType = TYPE_BY_EXTENSION[extension];
  const size = Number(body.size);
  if (!contentType) throw new Error('الملف غير مدعوم. استخدم PDF أو JPG أو PNG');
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE) throw new Error('حجم الملف غير صالح أو يتجاوز الحد التقني للتخزين');

  const pathname = 'orders/share/' + crypto.randomUUID() + '/' + fileName;
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const clientToken = await generateClientTokenFromReadWriteToken({
    pathname, allowedContentTypes: [contentType], maximumSizeInBytes: size,
    validUntil: expiresAt, addRandomSuffix: false
  });
  const storeId = clientToken.split('_')[3];
  if (!storeId) throw new Error('تعذر تجهيز صلاحية رفع الملف');
  const requestId = storeId + ':' + Date.now() + ':' + crypto.randomBytes(8).toString('hex');
  const headers = {
    authorization: 'Bearer ' + clientToken,
    'x-vercel-blob-store-id': storeId,
    'x-api-version': '13',
    'x-api-blob-request-id': requestId,
    'x-api-blob-request-attempt': '0',
    'x-vercel-blob-access': 'private',
    'x-content-type': contentType
  };
  return sendJson(res, 200, {
    pathname, fileName, contentType, size,
    uploadUrl: 'https://blob.vercel-storage.com/?pathname=' + encodeURIComponent(pathname),
    headers, expiresAt
  });
}

async function prepareImport(body, res) {
  if (!process.env.ADMIN_SESSION_SECRET) return sendJson(res, 503, { error: 'خدمة المشاركة غير مهيأة حاليًا' });
  const incoming = Array.isArray(body.files) ? body.files : [body.file || body];
  if (!incoming.length || incoming.length > MAX_FILES) throw new Error('يمكن مشاركة من ملف واحد إلى ٢٠ ملفًا في المرة الواحدة');
  const files = [];
  for (const raw of incoming) {
    const pathname = safeText(raw?.pathname, 500);
    const name = cleanFileName(raw?.name || raw?.fileName);
    const type = safeText(raw?.type || raw?.contentType, 80).toLowerCase();
    const size = Number(raw?.size);
    const pathParts = pathname.split('/');
    if (pathParts.length !== 4 || pathParts[0] !== 'orders' || pathParts[1] !== 'share' ||
        !/^[a-f0-9-]{36}$/i.test(pathParts[2]) || !pathParts[3] || pathParts[3].length > 160) {
      throw new Error('مسار الملف غير صالح');
    }
    if (!ALLOWED_TYPES.includes(type) || !Number.isSafeInteger(size) || size < 1 || size > MAX_FILE) {
      throw new Error('بيانات الملف غير صالحة');
    }
    const blob = await head(pathname, { access: 'private' });
    if (!blob || Number(blob.size) !== size || String(blob.contentType).toLowerCase() !== type) {
      throw new Error('لم نتمكن من التحقق من الملف المرفوع');
    }
    const pageCountValue = Number(raw?.pageCount);
    const pageCount = type === 'application/pdf' && Number.isInteger(pageCountValue) &&
      pageCountValue >= 1 && pageCountValue <= 10000 ? pageCountValue : null;
    files.push({ pathname, name, type, size, pageCount });
  }
  const expiresAt = Date.now() + 20 * 60 * 1000;
  const token = signPayload({ version: 1, expiresAt, nonce: crypto.randomBytes(12).toString('hex'), files });
  return sendJson(res, 200, {
    url: 'https://el-ostaz-ochre.vercel.app/#ostaz-share=' + encodeURIComponent(token),
    expiresAt
  });
}

async function importSharedFiles(body, res) {
  const payload = verifyToken(safeText(body.token, 20000));
  if (!payload) return sendJson(res, 410, { error: 'انتهت صلاحية رابط المشاركة. أعد مشاركة الملف من واتساب.' });
  const files = [];
  for (const file of payload.files) {
    const pathname = safeText(file.pathname, 500);
    const type = safeText(file.type, 80).toLowerCase();
    const size = Number(file.size);
    if (!pathname.startsWith('orders/share/') || !ALLOWED_TYPES.includes(type) || !Number.isSafeInteger(size) || size < 1) {
      throw new Error('بيانات الملف غير صالحة');
    }
    const blob = await head(pathname, { access: 'private' });
    if (!blob || Number(blob.size) !== size || String(blob.contentType).toLowerCase() !== type) {
      throw new Error('الملف لم يعد متاحًا. أعد مشاركته من واتساب.');
    }
    files.push({
      pathname, name: safeText(file.name, 160) || 'shared-file', type, size,
      pageCount: Number.isInteger(file.pageCount) ? file.pageCount : null
    });
  }
  return sendJson(res, 200, { files });
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  try {
    const body = await readJson(req);
    if (body.action === 'token') return await issueUploadToken(body, res);
    if (body.action === 'prepare') return await prepareImport(body, res);
    if (body.action === 'import') return await importSharedFiles(body, res);
    return sendJson(res, 400, { error: 'نوع المشاركة غير معروف' });
  } catch (error) {
    console.error('share api error', error);
    return sendJson(res, 400, { error: error?.message || 'تعذر تنفيذ مشاركة الملف' });
  }
}

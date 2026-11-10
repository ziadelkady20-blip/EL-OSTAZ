import { handleUpload } from '@vercel/blob/client';
import { sendJson } from '../lib/http.js';

const MAX_FILE = 5 * 1024 ** 4;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (typeof pathname !== 'string' || !pathname.startsWith('orders/')) {
          throw new Error('Invalid upload path');
        }
        let payload;
        try { payload = JSON.parse(clientPayload || '{}'); } catch { throw new Error('Invalid upload details'); }
        if (!ALLOWED_TYPES.includes(payload.contentType)) throw new Error('Only PDF, JPG and PNG files are allowed');
        if (!Number.isSafeInteger(payload.size) || payload.size < 1 || payload.size > MAX_FILE) {
          throw new Error('File exceeds the 5 TB storage limit');
        }
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_FILE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ purpose: 'customer-print-order' }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!blob.pathname.startsWith('orders/')) throw new Error('Unexpected upload location');
      },
    });
    return sendJson(res, 200, result);
  } catch (error) {
    console.error('blob client upload error', error);
    return sendJson(res, 400, { error: error?.message || 'تعذر بدء رفع الملف' });
  }
}

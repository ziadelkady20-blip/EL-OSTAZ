import { getDb } from '../../lib/db.js';
import { requireAdmin } from '../../lib/auth.js';
import { allowMethods, readJson, sendJson } from '../../lib/http.js';

function validSubscription(value) {
  return value && typeof value.endpoint === 'string' && value.endpoint.startsWith('https://') &&
    value.keys && typeof value.keys.p256dh === 'string' && typeof value.keys.auth === 'string';
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'DELETE'])) return;
  if (!requireAdmin(req, res)) return;
  try {
    const sql = getDb();
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        publicKey: process.env.WEB_PUSH_PUBLIC_KEY || '',
        configured: Boolean(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY),
      });
    }
    const body = await readJson(req);
    if (req.method === 'POST') {
      if (!validSubscription(body.subscription)) return sendJson(res, 400, { error: 'بيانات اشتراك الإشعارات غير صحيحة' });
      const endpoint = body.subscription.endpoint;
      await sql`INSERT INTO public.admin_push_subscriptions (endpoint, subscription, user_agent, updated_at)
        VALUES (${endpoint}, ${JSON.stringify(body.subscription)}::jsonb, ${String(req.headers['user-agent'] || '').slice(0, 500)}, NOW())
        ON CONFLICT (endpoint) DO UPDATE SET subscription = EXCLUDED.subscription, user_agent = EXCLUDED.user_agent, updated_at = NOW()`;
      return sendJson(res, 201, { ok: true, message: 'تم تفعيل إشعارات هذا الجهاز' });
    }
    if (req.method === 'DELETE') {
      const endpoint = String(body.endpoint || '');
      if (!endpoint.startsWith('https://')) return sendJson(res, 400, { error: 'عنوان الاشتراك غير صحيح' });
      await sql`DELETE FROM public.admin_push_subscriptions WHERE endpoint = ${endpoint}`;
      return sendJson(res, 200, { ok: true });
    }
  } catch (error) {
    console.error('admin push endpoint error', error);
    return sendJson(res, 500, { error: 'تعذر إعداد إشعارات الموبايل' });
  }
}

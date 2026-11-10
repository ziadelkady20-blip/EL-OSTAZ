import { allowMethods, readJson, safeText, sendJson } from '../../lib/http.js';
import { safeCompare, setAdminSession } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  try {
    const body = await readJson(req);
    const username = safeText(body.username, 80);
    const password = String(body.password ?? '');
    if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
      return sendJson(res, 503, { error: 'إعدادات دخول الإدارة غير مكتملة على الخادم' });
    }
    if (!safeCompare(username, process.env.ADMIN_USERNAME) || !safeCompare(password, process.env.ADMIN_PASSWORD)) {
      return sendJson(res, 401, { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    setAdminSession(res, username);
    return sendJson(res, 200, { ok: true, username });
  } catch (error) {
    console.error('admin login error', error);
    return sendJson(res, 400, { error: 'تعذر تسجيل الدخول' });
  }
}
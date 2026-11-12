import webpush from 'web-push';
import { getDb } from './db.js';

function configured() {
  return Boolean(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY);
}

function setup() {
  if (!configured()) throw new Error('Web Push VAPID keys are not configured');
  webpush.setVapidDetails(
    process.env.WEB_PUSH_SUBJECT || 'https://el-ostaz-ochre.vercel.app',
    process.env.WEB_PUSH_PUBLIC_KEY,
    process.env.WEB_PUSH_PRIVATE_KEY
  );
}

export async function sendAdminPushNotification(order) {
  if (!configured()) {
    console.warn('Web Push skipped: VAPID keys are not configured');
    return { sent: 0, configured: false };
  }
  setup();
  const sql = getDb();
  const subscriptions = await sql`SELECT id, subscription FROM public.admin_push_subscriptions`;
  const payload = JSON.stringify({
    title: 'طلب جديد من الأستاذ',
    body: `${order.customer_name} — ${order.service_type} — ${order.order_code}`,
    url: `/admin.html?order=${encodeURIComponent(order.order_code)}`,
    tag: `order-${order.order_code}`,
    orderCode: order.order_code,
  });
  let sent = 0;
  const expired = [];
  for (const row of subscriptions) {
    try {
      await webpush.sendNotification(row.subscription, payload, { TTL: 60 * 60, urgency: 'high' });
      sent += 1;
    } catch (error) {
      const status = error?.statusCode;
      console.error('Admin push delivery failed', { subscriptionId: row.id, status, message: error?.message });
      if (status === 404 || status === 410) expired.push(row.id);
    }
  }
  if (expired.length) await sql`DELETE FROM public.admin_push_subscriptions WHERE id = ANY(${expired})`;
  return { sent, configured: true };
}

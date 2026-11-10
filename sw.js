self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'إشعار من مطبعة الأستاذ';
  const options = {
    body: data.body || 'وصل تحديث جديد للطلبات.',
    icon: '/assets/ostaz-logo.svg?v=2',
    badge: '/assets/ostaz-logo.svg?v=2',
    tag: data.tag || 'ostaz-admin',
    renotify: true,
    data: { url: data.url || '/admin.html' },
    dir: 'rtl',
    lang: 'ar',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/admin.html', self.location.origin).href;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});

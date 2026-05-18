self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  const title = '智能名片交流站';
  const options = {
    body: '你有一封新的收件匣訊息',
    icon: './assets/entry-banner.png',
    badge: './assets/entry-banner.png',
    tag: 'line-engine-inbox',
    renotify: true,
    data: { url: './?open=inbox' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './?open=inbox', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.registration.scope)) {
        await client.focus();
        client.postMessage({ type: 'OPEN_INBOX' });
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});

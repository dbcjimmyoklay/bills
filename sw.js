const CACHE = 'bills-v1';
const SHELL = ['./', './index.html', './cycle.js', './manifest.webmanifest', './icon-180.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 網頁本身：先拿網路最新版，離線才用快取
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  const tasks = [
    self.registration.showNotification(d.title || '繳費提醒', {
      body: d.body || '有帳單待繳',
      icon: './icon-180.png',
      badge: './icon-180.png',
      tag: d.tag || 'daily',
      renotify: true,
      data: { url: './' }
    })
  ];
  if (typeof d.count === 'number' && self.navigator && self.navigator.setAppBadge) {
    tasks.push(d.count > 0 ? self.navigator.setAppBadge(d.count) : self.navigator.clearAppBadge());
  }
  e.waitUntil(Promise.all(tasks).catch(() => {}));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});

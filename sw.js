// Service worker «تخت جمشید» — فقط برای نصب‌پذیری (PWA) و بارگذاری سریع‌تر.
// قاعده‌ها:
//  • هیچ درخواستِ غیر هم‌مبدأ (Supabase) و هیچ غیر-GET دست نمی‌خورد؛ داده‌ی بازی همیشه زنده است.
//  • صفحه و اسکریپت‌ها: اول شبکه (نسخه‌ی تازه فوراً برسد)، اگر نبود از کش.
//  • assets (تصویر/فونت): از کش، و پشت صحنه تازه می‌شود.
const CACHE = 'tj-v1';
const SHELL = [
  './', './index.html', './supabase-client.js', './resolveNight.js', './manifest.webmanifest',
  './assets/vendor/supabase.js', './assets/vendor/fonts/vazirmatn.css',
  './assets/vendor/fonts/vazirmatn-400.ttf', './assets/vendor/fonts/vazirmatn-700.ttf',
  './assets/pwa/icon-192.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isCode = req.mode === 'navigate' || /\.(html|js|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (isCode && !url.pathname.startsWith('/assets/')) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

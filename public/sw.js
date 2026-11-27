// 简账 PWA Service Worker
// - 静态资源（/_next/static/*、图标、manifest）：Cache-First，二次打开 0ms 加载
// - 页面导航（/）：Network-First + 1.5s 超时降级缓存，既保证更新及时又避免弱网白屏
// - API（/api/*）：始终直连网络，不做缓存

const STATIC_CACHE = 'jianzhang-static-v1';
const PAGE_CACHE = 'jianzhang-pages-v1';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  const p = url.pathname;
  return (
    p.startsWith('/_next/static/') ||
    p === '/manifest.json' ||
    p === '/icon-192.png' ||
    p === '/icon-512.png' ||
    p === '/apple-touch-icon.png' ||
    p === '/icon.svg'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // 1. Immutable Next.js chunks & icons -> Cache First
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res && res.ok) {
          cache.put(request, res.clone());
        }
        return res;
      }),
    );
    return;
  }

  // 2. HTML navigation -> Network First with 1.5s fast fallback to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        const cached = await cache.match(request);

        const networkPromise = fetch(request)
          .then((res) => {
            if (res && res.ok && res.type === 'basic') {
              cache.put(request, res.clone());
            }
            return res;
          })
          .catch(() => null);

        if (!cached) {
          const fresh = await networkPromise;
          return fresh || new Response('Offline', { status: 503 });
        }

        // Race network against a short timeout so slow mobile links open fast
        const timeoutPromise = new Promise((resolve) => {
          setTimeout(() => resolve(null), 1500);
        });

        const winner = await Promise.race([networkPromise, timeoutPromise]);
        return winner || cached;
      })(),
    );
  }
});

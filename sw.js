// 绿角犀看图 · Service Worker
// 仅缓存 app shell（index.html / styles.css / app.js / manifest / icon）。
// 用户图片来自 <input type=file> / 拖放，不经过 http fetch，故不会被缓存，离线刷新应用壳后仍可浏览已选图片。
const CACHE = 'lvjiaoxi-viewer-v38';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './libheif-bundle.js',
  './assets/sub_pixel_cnn.onnx',
  './assets/ort/ort.min.js',
  './assets/ort/ort-wasm-simd-threaded.wasm',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 不拦截跨域（含 blob:/file:）
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit || caches.match('./index.html'));
    })
  );
});

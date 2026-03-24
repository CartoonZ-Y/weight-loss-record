/* eslint-disable no-restricted-globals */

// Update this string to bust the cache on new releases.
const CACHE_VERSION = "jlm-pwa-v8";

/**
 * 预缓存列表（相对当前 SW 脚本 URL）。
 * 不用 cache.addAll：任一资源 404（例如未提交 vendor/）会导致整次安装失败，线上 PWA 易半残。
 */
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./vendor/chart.umd.min.js",
  "./assets/icons/icon.svg",
  "./assets/icons/maskable.svg",
  "./assets/icons/apple-touch-icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192-v3.png",
  "./assets/icons/icon-512-v3.png",
  "./assets/icons/maskable-512-v3.png",
  "./assets/icons/apple-touch-icon-v3.png",
];

/**
 * @param {Cache} cache
 */
async function precacheAppShellSafe(cache) {
  for (const rel of APP_SHELL) {
    try {
      const url = new URL(rel, self.location).href;
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res);
    } catch {
      /* 缺失文件不阻断 SW 安装 */
    }
  }
}

/**
 * GitHub Pages 项目页 pathname 形如 /仓库名/vendor/chart.umd.min.js，
 * 不能再用 "./vendor/..." 与 APP_SHELL 直接字符串相等判断。
 */
function isAppShellAssetPath(pathname) {
  const p = pathname.replace(/\/+$/, "") || "/";
  const segs = p.split("/").filter(Boolean);
  const last = segs[segs.length - 1] || "";
  const last2 = segs.length >= 2 ? `${segs[segs.length - 2]}/${last}` : last;
  if (last === "index.html" || last === "styles.css" || last === "app.js" || last === "manifest.webmanifest")
    return true;
  if (last2 === "vendor/chart.umd.min.js") return true;
  if (last.endsWith(".svg") || last.endsWith(".png")) {
    const i = segs.indexOf("assets");
    return i >= 0 && segs[i + 1] === "icons";
  }
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await precacheAppShellSafe(cache);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const indexUrl = new URL("index.html", self.registration.scope).href;
        const cached = await cache.match(indexUrl);
        if (cached) return cached;
        return fetch(req);
      })()
    );
    return;
  }

  if (isAppShellAssetPath(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const res = await fetch(req);
        if (req.method === "GET" && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const cached = await cache.match(req);
        if (cached) return cached;
        return new Response("Offline and no cached response.", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })()
  );
});

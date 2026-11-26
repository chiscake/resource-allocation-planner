/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `rap-shell-${version}`;
const ASSETS = [...build, ...files];

/** Never intercept Supabase / API — offline data lives in IndexedDB. */
function isApiRequest(url: URL): boolean {
  return (
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/functions/v1/') ||
    url.hostname.includes('supabase')
  );
}

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS);
      await sw.skipWaiting();
    })(),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== sw.location.origin) return;
  if (isApiRequest(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      if (ASSETS.includes(url.pathname)) {
        const cached = await cache.match(url.pathname);
        if (cached) return cached;
      }

      try {
        const response = await fetch(event.request);
        if (!(response instanceof Response)) {
          throw new Error('invalid response from fetch');
        }
        if (
          response.status === 200 &&
          !response.headers.get('cache-control')?.includes('no-store') &&
          (event.request.mode === 'navigate' ||
            ASSETS.includes(url.pathname) ||
            url.pathname.endsWith('.js') ||
            url.pathname.endsWith('.css'))
        ) {
          void cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        if (event.request.mode === 'navigate') {
          const fallback =
            (await cache.match('/')) ||
            (await cache.match('/index.html')) ||
            (await cache.match('/app'));
          if (fallback) return fallback;
        }
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw new Error('offline and no cache');
      }
    })(),
  );
});

/* Predictable offline behavior: local shell, cached feed, complete MP4s with byte ranges. */
const SHELL = 'shorts-shell-v4';
const MEDIA = 'shorts-media-v1';
const API = 'shorts-api-v1';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/icon.svg', '/poster.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
let token = '';
self.addEventListener('install', event => { event.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith('shorts-shell-') && key !== SHELL) await caches.delete(key); await self.clients.claim(); })()); });
self.addEventListener('message', event => { if (event.data?.type === 'config') { token = event.data.token || ''; event.ports?.[0]?.postMessage({ok:true}); } });
async function rangeResponse(request, response) {
  const range = request.headers.get('range');
  if (!range) return response;
  const blob = await response.blob();
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match || !(match[1] || match[2])) return new Response(null, {status:416, headers:{'Content-Range':`bytes */${blob.size}`}});
  let start, end;
  if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), blob.size - 1) : blob.size - 1; }
  else { start = Math.max(0, blob.size - Number(match[2])); end = blob.size - 1; }
  if (start >= blob.size || start > end) return new Response(null, {status:416, headers:{'Content-Range':`bytes */${blob.size}`}});
  return new Response(blob.slice(start, end + 1), {status:206, headers:{'Content-Type':'video/mp4', 'Content-Length':String(end-start+1), 'Content-Range':`bytes ${start}-${end}/${blob.size}`, 'Accept-Ranges':'bytes'}});
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  if (url.pathname.startsWith('/media/')) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA);
      const cached = await cache.match(url.pathname);
      if (cached) { try { return await rangeResponse(request, cached); } catch (e) { return new Response(JSON.stringify({detail:'SW range error: '+String(e)}),{status:500,headers:{'Content-Type':'application/json'}}); } }
      const headers = new Headers(request.headers);
      if (token) headers.set('X-Shorts-Token', token);
      const response = await fetch(url.pathname, {headers});
      if (response.ok) { await cache.put(url.pathname, response.clone()); return rangeResponse(request, response); }
      return response;
    })());
    return;
  }
  if (url.pathname.startsWith('/api/avatars/')) {
    event.respondWith((async () => { const cache = await caches.open(API); const hit = await cache.match(request); if (hit) return hit; const headers = new Headers(request.headers); if (token) headers.set('X-Shorts-Token', token); const r = await fetch(request, {headers}); if (r.ok) await cache.put(request, r.clone()); return r; })());
    return;
  }
  if (['/api/feed','/api/settings','/api/status','/api/queue','/api/history'].includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(API);
      try { const headers = new Headers(request.headers); if (token) headers.set('X-Shorts-Token', token); const r = await fetch(request, {headers}); if (r.ok) await cache.put(url.pathname, r.clone()); return r; }
      catch { return new Response(JSON.stringify({detail:'Offline and no live engine response.'}), {status:503, headers:{'Content-Type':'application/json','X-Offline-Cache':'1'}}); }
    })());
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(request, {ignoreSearch:true});
    try { const response = await fetch(request); if (response.ok) await cache.put(request, response.clone()); return response; }
    catch { if (hit) return hit; if (request.mode === 'navigate') return cache.match('/index.html'); return new Response('Offline', {status:503}); }
  })());
});

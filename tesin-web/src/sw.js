const V = '__V__';
const DATA_ORIGIN = '__DATA__';
const PAGES = `pages-${V}`, ASSETS = `assets-${V}`, DATA = `data-${V}`, MEDIA = 'media-v1';
const KEEP = new Set([PAGES, ASSETS, DATA, MEDIA]);
const MEDIA_MAX = 600; // tiles and pictures kept (about 15 MB)
const CHUNK_MAX = 150; // chunks of buildings kept in the data cache (data/r*/b/, up to 350 KB each)

self.addEventListener('install', e => { e.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!KEEP.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const cacheable = r => r && r.ok && r.type !== 'opaque';
// (the response is cloned right away, before the page starts reading the original)
async function put(name, req, res) { try { const c = await caches.open(name); await c.put(req, res); } catch { /* quota */ } }
// (the oldest go; with a test only the entries whose address passes it are counted and trimmed)
async function trim(name, max, test = () => true) {
  const c = await caches.open(name), keys = (await c.keys()).filter(r => test(r.url));
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}
// a trim after every 25th write (listing hundreds of keys after every tile would cost more than it saves)
let writes = 0;
const trimSoon = (name, max, test) => (++writes % 25 === 0 ? trim(name, max, test) : Promise.resolve());
// (the writes into the caches are handed to e.waitUntil: the browser must not stop the worker before they finish)
// the page: network first (3 s), then the cache
async function page(e, req) {
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000))]);
    if (cacheable(res)) e.waitUntil(put(PAGES, req, res.clone()));
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match('./')) || Response.error();
  }
}
// hashed assets and fonts: the cache first (they never change under the same name)
async function asset(e, req) {
  const hit = await caches.match(req); if (hit) return hit;
  const res = await fetch(req); if (cacheable(res)) e.waitUntil(put(ASSETS, req, res.clone())); return res;
}
const FEED_FRESH_MS = 15 * 60e3, FEED_WAIT_MS = 3000;
// (a feed asked with a time slot in its address, data/jams.json?m=<minute>: one cache entry per file, not one per
// minute, which used to pile up thousands of copies a day in a page left open)
const dataKey = req => { const u = new URL(req.url); return DATA_ORIGIN && u.origin === DATA_ORIGIN && u.search ? u.origin + u.pathname : req; };
async function data(e, req) {
  const key = dataKey(req);
  const hit = await caches.match(key);
  const fresh = fetch(req).then(async res => {
    if (!cacheable(res)) return res;
    const copy = res.clone();
    const h = new Headers(copy.headers); h.set('x-sw-at', String(Date.now()));
    await put(DATA, key, new Response(await copy.blob(), { status: copy.status, statusText: copy.statusText, headers: h }));
    await trimSoon(DATA, CHUNK_MAX, u => /\/data\/r\d\/b\//.test(u));
    return res;
  }).catch(() => null);
  e.waitUntil(fresh);
  const feed = DATA_ORIGIN && new URL(req.url).origin === DATA_ORIGIN;
  const wantsNet = req.cache === 'reload' || req.cache === 'no-cache' || req.cache === 'no-store';
  const age = hit ? Date.now() - (+hit.headers.get('x-sw-at') || 0) : Infinity;
  if (hit && !wantsNet && !(feed && age > FEED_FRESH_MS)) return hit;
  const res = hit ? await Promise.race([fresh, new Promise(r => setTimeout(() => r(null), FEED_WAIT_MS))]) : await fresh;
  return res || hit || Response.error();
}
// tiles and pictures: the cache first, a bounded number of them
async function media(e, req) {
  const hit = await caches.match(req); if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) e.waitUntil(put(MEDIA, req, res.clone()).then(() => trimSoon(MEDIA, MEDIA_MAX)));
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') { e.respondWith(page(e, req)); return; }
  const same = url.origin === self.location.origin;
  if (same && url.pathname.includes('/assets/')) { e.respondWith(asset(e, req)); return; }
  if ((same || (DATA_ORIGIN && url.origin === DATA_ORIGIN)) && url.pathname.includes('/data/') && url.pathname.endsWith('.json')) { e.respondWith(data(e, req)); return; }
  if (/\/tiles\/|\/img\/proj\//.test(url.pathname) && /\.(webp|dzi)$/.test(url.pathname)) { e.respondWith(media(e, req)); return; }
  // everything else (live APIs, other sites): straight to the network
});

import { ADMIN } from './admin.js';

const ON = !ADMIN && import.meta.env.PROD && !/\.pages\.dev$/.test(location.hostname);
const send = (name, opts) => { if (!ON || typeof window.plausible !== 'function') return; try { window.plausible(name, opts); } catch { /* never in the way of the map */ } };
const clean = v => (v == null || v === '' ? undefined : String(v).replace(/\s+/g, ' ').trim().slice(0, 100));
const props = o => { const p = {}; for (const [k, v] of Object.entries(o || {})) { const c = clean(v); if (c !== undefined) p[k] = c; } return Object.keys(p).length ? p : undefined; };

/** One event: track('Karta', { typ: 'dum', nazev: 'Masarykova 12' }). */
export function track(name, o) { send(name, { props: props(o) }); }

const CAMPAIGN = /^(ref|source|utm_(source|medium|campaign|content|term))$/;
function campaign() {
  const out = new URLSearchParams();
  try { for (const [k, v] of new URLSearchParams(location.search)) if (CAMPAIGN.test(k)) out.append(k, v.slice(0, 100)); } catch { /* an address that cannot be read: no source */ }
  const s = out.toString();
  return s ? `?${s}` : '';
}
/** The page view of the map: once, without the hash (every view and place would be a page of its own otherwise). */
export function pageview(o) {
  if (pageview.sent) return;
  pageview.sent = true;
  send('pageview', { u: location.origin + location.pathname + campaign(), props: props(o) });
}
/** How the visitor came in, from the address: a place link, a shared view, or the plain map. */
export const entry = () => (location.hash.startsWith('#misto/') ? 'misto' : location.hash.startsWith('#@') ? 'pohled' : 'start');

if (ON && typeof PerformanceObserver === 'function' && (PerformanceObserver.supportedEntryTypes || []).includes('event')) {
  let top = null, what = '';
  const describe = el => {
    if (!el || !el.tagName) return 'neznamy';
    if (el.closest && el.closest('#viewer')) return 'mapa';
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : '';
    const self = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : cls}`;
    const host = !el.id && el.parentElement && el.parentElement.closest('[id]');
    return host ? `${self} v #${host.id}` : self;
  };
  const take = entries => {
    for (const e of entries) {
      if (!e.interactionId || (top && e.duration <= top.duration)) continue;
      top = e; what = describe(e.target); // the target now: it may be gone from the page by the time the visit ends
    }
  };
  const watch = new PerformanceObserver(list => take(list.getEntries()));
  try { watch.observe({ type: 'event', buffered: true, durationThreshold: 40 }); } catch { /* an older browser */ }
  const report = ev => {
    if (report.sent || (ev.type === 'visibilitychange' && document.visibilityState !== 'hidden')) return;
    try { take(watch.takeRecords()); } catch { /* nothing more */ }
    if (!top) return;
    report.sent = true;
    const d = top.duration, wait = top.processingStart - top.startTime, run = top.processingEnd - top.processingStart, paint = d - wait - run;
    let lite = false;
    try { lite = Date.now() - +(localStorage.getItem('b2k-lite') || 0) < 7 * 864e5; } catch { /* private mode */ }
    track('Odezva', {
      ms: d < 100 ? '<100' : d < 200 ? '100-200' : d < 500 ? '200-500' : d < 1000 ? '500-1000' : '>1000',
      prvek: what, typ: top.name,
      faze: wait >= run && wait >= paint ? 'cekani' : run >= paint ? 'zpracovani' : 'vykresleni',
      lite: lite ? 'ano' : 'ne',
    });
  };
  document.addEventListener('visibilitychange', report);
  addEventListener('pagehide', report);
}

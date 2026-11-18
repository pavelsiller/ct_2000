import { onScreen } from './onscreen.js';
import { DATA_BASE, SAMPLE } from './feed.js';
export const PARKING_WEB = 'https://www.bkom.cz/parkovani';
export const PARKING_DATA = 'https://data.brno.cz/datasets/d6c4f8fbcf0544a8b4ffd41570044a8f_0/about';
const POLL_MS = 120e3, STALE_MS = 30 * 60e3;
export const NUMBERS = 0.45; // screen px per metre from which the free spaces are written over the sign
export const BIG = 1.4; // … and from which the sign is drawn bigger
export const SHOW_Z = 0.7; // the zoom (v.z) from which the signs are drawn: the same as the line badges of MHD
const INK = '#161d2b', CREAM = '#fff6d8', BLUE = '#2b62c4', GREY = '#8d939e';
// the colour of how full it is (the share of taken spaces)
export const fullCol = (full, free) => (free === 0 || full >= 0.9 ? '#d8362a' : full >= 0.7 ? '#e8a42a' : '#4fb05a');
const P = ['#####.', '##..##', '##..##', '#####.', '##....', '##....', '##....']; // 6 × 7

// "38 volných", "1 volné", "3 volná"
export const freeText = n => (n === 1 ? '1 volné' : n >= 2 && n <= 4 ? `${n} volná` : `${n} volných`);

/**
 * @param base the address of the page (data/…)
 * @param llToImg (lon, lat) → image point
 * @param A image px per metre (GEO.A)
 * @param onChange called after every load
 */
export function createParking({ base, llToImg, A = 1, onChange = () => {} }) {
  const D = { items: [], at: 0, checked: 0, error: false };
  let info = null, loading = null, posKey = '', hits = [], wanted = 0;
  const loadInfo = () => (info ||= fetch(`${base}data/parking.json`).then(r => (r.ok ? r.json() : { items: [] })).then(d => d.items || []).catch(() => []));
  const urls = () => [DATA_BASE ? `${DATA_BASE}/data/parking-live.json?m=${Math.floor(Date.now() / 300e3)}` : '', `${base}data/parking-live.json`].filter(Boolean);
  async function fetchNow() {
    const items = await loadInfo();
    let rows = null;
    for (const u of urls()) {
      try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) { rows = (await r.json()).items || []; break; } } catch { /* the next address */ }
    }
    if (rows) {
      // the rows go to the hand-written car parks by a word of their name (DOMINI, RIVER, …); a car park the file does
      // not know yet is still drawn, with the name of the data
      const out = [];
      for (const a of rows) {
        const nm = a.name;
        const inf = items.find(i => new RegExp(i.match, 'i').test(nm)) || { id: nm.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-'), name: nm, short: nm };
        let free = a.free;
        const cap = a.cap || inf.capacity || 0;
        out.push({ ...inf, cap, free, full: cap && free != null ? Math.max(0, Math.min(1, 1 - free / cap)) : null, sub: a.sub, cars: a.cars, t: a.t || 0, lon: a.lon || inf.lon, lat: a.lat || inf.lat, feedName: nm });
      }
      // (the car parks of the file that the data left out: drawn grey, "bez údajů")
      for (const i of items) if (!out.some(o => o.id === i.id)) out.push({ ...i, cap: i.capacity || 0, free: null, full: null, t: 0 });
      D.items = out; D.error = false;
      D.at = Math.max(0, ...out.map(o => o.t || 0));
    } else {
      D.error = true;
      if (!D.items.length) D.items = items.map(i => ({ ...i, cap: i.capacity || 0, free: null, full: null, t: 0 }));
    }
    D.checked = Date.now(); posKey = '';
    onChange();
  }
  const load = () => (loading ||= fetchNow());
  // every two minutes while somebody looks at the layer (the file changes every 5 minutes)
  setInterval(() => { if (loading && !document.hidden && Date.now() - wanted < 2 * POLL_MS) fetchNow(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && loading && Date.now() - D.checked > POLL_MS) fetchNow(); });
  // a value older than half an hour is not shown as the state of now
  // (a car park closed for now, `out` in data/parking.json, has no state of now either: the city reports it as full)
  const live = o => !o.out && o.free != null && o.t && (SAMPLE || Date.now() - o.t < STALE_MS);
  function positions() {
    const key = `${llToImg(16.6, 49.2).join(',')}|${D.items.length}|${D.checked}`;
    if (key === posKey) return;
    posKey = key;
    for (const o of D.items) if (o.lon && o.lat) [o.X, o.Y] = llToImg(o.lon, o.lat);
  }

  // ---- the sign: a blue square with a cream P on a post (the manner of the signs of src/hasici.js), and beside it a
  // plain gauge like the delay gauge of the vehicles of MHD (src/vehicles.js): a dark upright bar as tall as the sign,
  // filled from the bottom as the car park is full, green, amber or red. (A column of little parked cars was tried on
  // 2026-11-12 and found too small to read.)
  // s: 2 the usual size, 3 zoomed in
  function sign(ctx, x, y, o, s) {
    const ok = live(o), col = ok ? fullCol(o.full, o.free) : GREY;
    const g = s, r = s === 3 ? 14 : 9, top = y - 2 * r - 6;
    // (exactly as tall as the sign, one pixel beside it; its shadow only to its right, so it ends where the sign ends)
    const gw = s === 3 ? 9 : 7, gh = 2 * r + 6, gx = x + r + 4;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - r + 2, top + 4, 2 * r + 2, 2 * r + 2); if (!o.out) ctx.fillRect(gx + gw, top + 3, 2, gh - 3);
    // the post and the sign
    ctx.fillStyle = INK; ctx.fillRect(x - r - 3, top, 2 * r + 6, 2 * r + 6); ctx.fillRect(x - 1, y - 3, 2, 5);
    ctx.fillStyle = CREAM; ctx.fillRect(x - r - 1, top + 2, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = ok ? BLUE : '#6f7a8c'; ctx.fillRect(x - r, top + 3, 2 * r, 2 * r);
    ctx.fillStyle = CREAM;
    const ox = x - 3 * g, oy = top + 3 + r - Math.round(3.5 * g);
    P.forEach((row, j) => { for (let i = 0; i < 6; i++) if (row[i] === '#') ctx.fillRect(ox + i * g, oy + j * g, g, g); });
    if (o.out) {
      ctx.fillStyle = INK;
      const n = 2 * r, d = s === 3 ? 3 : 2;
      for (let i = 0; i < n; i += d) { ctx.fillRect(x - r + i, top + 3 + i, d, d); ctx.fillRect(x + r - d - i, top + 3 + i, d, d); }
      return { box: [x - r - 3, top - 1, x + r + 5, y + 2], top, col, ok, cx: x };
    }
    // the gauge
    ctx.fillStyle = INK; ctx.fillRect(gx, top, gw, gh);
    ctx.fillStyle = '#384563'; ctx.fillRect(gx + 1, top + 1, gw - 2, gh - 2);
    if (ok) { const h = Math.max(2, Math.round(o.full * (gh - 2))); ctx.fillStyle = col; ctx.fillRect(gx + 1, top + gh - 1 - h, gw - 2, h); }
    return { box: [x - r - 3, top - 1, gx + gw + 2, y + 2], top, col, ok, cx: (x - r - 3 + gx + gw) / 2 };
  }
  // the label of the free spaces: "VOLNO 38" (or "PLNO") big, "z 367 míst" small under it; y is its bottom edge
  function label(ctx, x, y, o, col, f = 1) {
    const ok = live(o), main = o.out ? 'MIMO PROVOZ' : !ok ? 'BEZ ÚDAJŮ' : o.free === 0 ? 'PLNO' : `VOLNO ${o.free}`, sub = o.cap ? `z ${o.cap} míst${o.type === 'pr' ? ' · P+R' : ''}` : '';
    const fs = Math.round(17 * f), ss = Math.round(13 * f);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `400 ${fs}px "VT323", monospace`; const w1 = ctx.measureText(main).width;
    ctx.font = `400 ${ss}px "VT323", monospace`; const w2 = sub ? ctx.measureText(sub).width : 0;
    const w = Math.ceil(Math.max(w1, w2)) + 10, h1 = Math.round(fs * 0.95), h2 = sub ? Math.round(ss * 0.95) : 0;
    const x0 = Math.round(x - w / 2), y0 = y - h1 - h2 - 2;
    ctx.fillStyle = INK; ctx.fillRect(x0 - 1, y0 - 1, w + 2, h1 + h2 + 3);
    ctx.fillStyle = ok ? col : GREY; ctx.fillRect(x0, y0, w, h1);
    if (sub) { ctx.fillStyle = '#2a3348'; ctx.fillRect(x0, y0 + h1, w, h2 + 1); }
    ctx.font = `400 ${fs}px "VT323", monospace`; ctx.fillStyle = ok && col === '#e8a42a' ? INK : CREAM; ctx.fillText(main, x, y0 + h1 / 2 + 1);
    if (sub) { ctx.font = `400 ${ss}px "VT323", monospace`; ctx.fillStyle = '#d6dbe6'; ctx.fillText(sub, x, y0 + h1 + h2 / 2 + 1); }
    return [x0 - 1, y0 - 1, x0 + w + 1, y];
  }
  // (the signs come at the same zoom as the line badges of the vehicles of MHD, src/layers.js `labels`; the
  // highlighted theme (Zvýraznit) shows them at any zoom)
  function draw(ctx, v, hl = false) {
    hits = []; wanted = Date.now();
    if (!loading) { load(); return; }
    const far = v.z < SHOW_Z && !hl, isFull = o => live(o) && (o.free === 0 || o.full >= 0.9);
    if (!D.items.length || (far && !D.items.some(isFull))) return;
    positions();
    const m = v.k * A, nums = m >= NUMBERS, s = m >= BIG ? 3 : 2, alpha = ctx.globalAlpha;
    // (from the back to the front: a label in front is never covered by a sign behind it)
    const order = D.items.filter(o => o.X != null && (!far || isFull(o))).sort((a, b) => a.Y - b.Y);
    for (const o of order) {
      const x = Math.round(v.ox + o.X * v.k), y = Math.round(v.oy + o.Y * v.k);
      if (!onScreen(ctx, x, y, 140)) continue;
      const w = s === 3 ? 18 : 12, hgt = s === 3 ? 40 : 30;
      // (never folded into a "+N" under other icons: there are only eight; the icons that come later make way for them)
      if (ctx.__claim) ctx.__claim(x - w, y - hgt - (nums ? 34 : 0), x + w + 8, y + 2, true);
      ctx.globalAlpha = alpha;
      // (zoomed in: a soft patch of the colour on the ground under the post, the car park "glows" with how full it is)
      if (s === 3 && live(o)) {
        const c = fullCol(o.full, o.free), g = ctx.createRadialGradient(x, y, 0, x, y, 34);
        g.addColorStop(0, `${c}88`); g.addColorStop(1, `${c}00`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 34, 19, 0, 0, Math.PI * 2); ctx.fill();
      }
      const sg = sign(ctx, x, y, o, s);
      hits.push([...sg.box, o]);
      if (nums) hits.push([...label(ctx, Math.round(sg.cx), sg.top - 4, o, sg.col, s === 3 ? 1.15 : 1), o]);
    }
    ctx.globalAlpha = alpha;
  }
  const at = (sx, sy) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]) return h[4]; } return null; };
  // the total over the car parks with a fresh value (the line under the switch in Vrstvy)
  const summary = () => {
    const ok = D.items.filter(live);
    return { n: D.items.length, out: D.items.filter(o => o.out).map(o => o.short || o.name), ok: ok.length, free: ok.reduce((a, o) => a + o.free, 0), full: ok.filter(o => o.free === 0).length, at: D.at, error: D.error };
  };
  let hist = null, histAt = 0, histLoading = null;
  const loadHistory = () => {
    if (hist && Date.now() - histAt < 300e3) return Promise.resolve(hist);
    return (histLoading ||= (async () => {
      for (const u of [DATA_BASE ? `${DATA_BASE}/data/parking-history.json?m=${Math.floor(Date.now() / 300e3)}` : '', `${base}data/parking-history.json`].filter(Boolean)) {
        try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) { hist = await r.json(); histAt = Date.now(); break; } } catch { /* the next address */ }
      }
      histLoading = null;
      return hist;
    })());
  };
  // the car park's share of taken spaces over the last `hours` hours: [[time, 0..1 | null], …]
  async function series(o, hours = 24) {
    const h = await loadHistory();
    const p = h && (h.parks || []).find(q => q.n === o.feedName);
    if (!p) return [];
    const cap = o.cap || p.cap, k0 = Math.max(0, p.free.length - Math.round((hours * 3600e3) / h.step));
    return p.free.slice(k0).map((v, i) => [h.from + (k0 + i) * h.step, v == null || !cap ? null : Math.max(0, Math.min(1, 1 - v / cap))]);
  }
  return { load, draw, at, positions, live, summary, series, refresh: fetchNow, info: loadInfo, data: D };
}

import { onScreen } from './onscreen.js';
import { DATA_BASE } from './feed.js';
import { itemInMap } from './extent.js';
import { beacon } from './beacon.js';
import { doneTick } from './hasici.js';

export const VODA_WEB = 'https://mapy.bvk.cz/havarie-odstavky/';
export const VODA_PAGE = 'https://www.bvk.cz/havarie-a-odstavky/havarie-a-odstavky-vodovodu';
const POLL_MS = 120e3, STALE_MS = 30 * 60e3; // (a file not refreshed for half an hour: nothing blinks as "now")
export const PLAN_DAYS = 7; // the planned shut-offs of the next week
const PLAN_Z = 0.5; // the zoom (v.z) from which the planned ones are drawn (the whole city: only what goes on now)
const AREA_M = 0.15; // screen px per metre from which the areas are drawn (0.3 until 2026-11-15: seen too late)
const TANK_M = 0.45, TANK_KM = 1.5; // the tanks: from this zoom, within this distance of an event of now
const INK = '#161d2b', CREAM = '#fff6d8', RED = '#d8362a', BLUE = '#2b62c4', PALE = '#7fa6dc', GREY = '#8d939e';
const DROP = ['....#....', '....#....', '...###...', '..#####..', '.#######.', '.#######.', '.#######.', '..#####..', '...###...']; // 9 × 9
// a water tank on a trailer, seen from the side (o outline, b blue, l light, c cream stripe, k chassis, w wheel), 15 × 9
const TANK = ['..ooooooooooo..', '.olllllllllllo.', 'obbbbbbbbbbbbbo', 'occccccccccccco', 'obbbbbbbbbbbbbo', '.obbbbbbbbbbbo.', '..ooooooooooo..', 'kkkkkkkkkkkkkkk', '..ww.......ww..'];
const TANK_COL = { o: INK, b: BLUE, l: '#9fd4ff', c: CREAM, k: '#5b6270', w: INK };
const DAY = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' });

/**
 * @param base the address of the page (data/…)
 * @param llToImg (lon, lat) → image point
 * @param A image px per metre (GEO.A)
 * @param onChange called after every load
 */
export function createVoda({ base, llToImg, A = 1, onChange = () => {} }) {
  const D = { items: [], tanks: [], checked: 0, error: false };
  let loading = null, posKey = '', hits = [], wanted = 0;
  const urls = () => [DATA_BASE ? `${DATA_BASE}/data/voda.json?m=${Math.floor(Date.now() / 300e3)}` : '', `${base}data/voda.json`].filter(Boolean);
  async function fetchNow() {
    let d = null;
    for (const u of urls()) {
      try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) { d = await r.json(); break; } } catch { /* the next address */ }
    }
    if (d) {
      D.items = (d.items || []).filter(itemInMap); D.tanks = (d.tanks || []).filter(itemInMap); D.checked = d.checked || Date.now(); D.error = false;
    } else D.error = true;
    posKey = '';
    onChange();
  }
  const load = () => (loading ||= fetchNow());
  setInterval(() => { if (loading && !document.hidden && Date.now() - wanted < 2 * POLL_MS) fetchNow(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && loading && Date.now() - D.checked > POLL_MS) fetchNow(); });

  const W = { items: [], loaded: 0 };
  let range = 'h', weekLoading = null, weekKey = '';
  const weekUrls = () => [DATA_BASE ? `${DATA_BASE}/data/voda-tyden.json?m=${Math.floor(Date.now() / 300e3)}` : '', `${base}data/voda-tyden.json`].filter(Boolean);
  async function fetchWeek() {
    for (const u of weekUrls()) {
      try { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) continue; W.items = ((await r.json()).items || []).filter(itemInMap); weekKey = ''; break; } catch { /* the next address */ }
    }
    W.loaded = Date.now(); onChange();
  }
  const loadWeek = () => (weekLoading ||= fetchWeek());
  setInterval(() => { if (range === 'w' && weekLoading && !document.hidden && Date.now() - wanted < 2 * POLL_MS && Date.now() - W.loaded > 300e3) fetchWeek(); }, POLL_MS);
  function setRange(r) { range = r === 'w' ? 'w' : 'h'; if (range === 'w') loadWeek(); onChange(); }
  const weekList = () => { const now = new Set(D.items.filter(o => isNow(o)).map(o => o.id)); return W.items.filter(o => !now.has(o.id)); };
  function weekPositions() {
    const key = `${llToImg(16.6, 49.2).join(',')}|${W.items.length}|${W.loaded}`;
    if (key === weekKey) return;
    weekKey = key;
    for (const o of W.items) [o.X, o.Y] = llToImg(o.lon, o.lat);
  }
  function weekSummary() {
    const all = new Map([...W.items, ...D.items.filter(o => isNow(o))].map(o => [o.id, o]));
    const l = [...all.values()];
    return { loaded: !!W.loaded, havarie: l.filter(o => o.kind === 'havarie').length, odstavka: l.filter(o => o.kind !== 'havarie').length };
  }
  const fresh = () => Date.now() - D.checked < STALE_MS;
  // what an event is now: 'havarie' | 'skoncilo' | 'probiha' | 'chysta' (a planned one whose time has come counts as running)
  function stateOf(o, now = Date.now()) {
    if (o.kind === 'havarie') return o.gone || !fresh() ? 'skoncilo' : 'havarie';
    if (o.gone || (o.to && now > o.to)) return 'skoncilo'; // (a shut-off that is over: paler with a tick for 12 hours)
    if (o.list === 2 || (o.from && o.from <= now && (!o.to || now <= o.to))) return 'probiha';
    return 'chysta';
  }
  const isNow = o => { const s = stateOf(o); return s === 'havarie' || s === 'probiha'; };
  // the ones drawn: everything of now and the planned of the next week
  const shown = (o, now = Date.now()) => stateOf(o, now) !== 'chysta' || (o.from && o.from - now < PLAN_DAYS * 864e5);

  function positions() {
    const key = `${llToImg(16.6, 49.2).join(',')}|${D.items.length}|${D.checked}`;
    if (key === posKey) return;
    posKey = key;
    for (const o of D.items) {
      [o.X, o.Y] = llToImg(o.lon, o.lat);
      o.ring = (o.area || []).map(r => r.flatMap(([lon, lat]) => llToImg(lon, lat)));
    }
    const live = D.items.filter(isNow);
    const km = (a, b) => Math.hypot((a.lon - b.lon) * 72.9, (a.lat - b.lat) * 111.2);
    for (const t of D.tanks) { [t.X, t.Y] = llToImg(t.lon, t.lat); t.near = live.some(o => km(o, t) <= TANK_KM); }
  }

  // the sign: a square in the colour of the state with a cream rim and a dark edge on a short post, the drop inside
  function sign(ctx, x, y, col, s = 1, grey = false, pad = 4) {
    const r = Math.round(5.5 * s) + pad, top = y - 2 * r - 6;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - r + 2, top + 4, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = INK; ctx.fillRect(x - r - 3, top, 2 * r + 6, 2 * r + 6); ctx.fillRect(x - 1, y - 3, 2, 5);
    ctx.fillStyle = grey ? '#d9d3c0' : CREAM; ctx.fillRect(x - r - 1, top + 2, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = grey ? GREY : col; ctx.fillRect(x - r, top + 3, 2 * r, 2 * r);
    ctx.fillStyle = grey ? '#e6e2d3' : col === RED ? '#9fd4ff' : CREAM; // (on red the drop is light blue: water, not the flame of the fire brigade)
    const ox = x - Math.round(4.5 * s), oy = top + 3 + r - Math.round(4.5 * s);
    DROP.forEach((row, j) => { for (let i = 0; i < 9; i++) if (row[i] === '#') ctx.fillRect(ox + i * s, oy + j * s, s, s); });
    return [x - r - 3, top, x + r + 3, y + 2];
  }
  // a tag above the sign (y: its bottom edge); small: the day of a planned one, beside the sign
  function tag(ctx, x, y, text, bg, fg = CREAM, small = false) {
    const fs = small ? 13 : 15, hh = small ? 6 : 7;
    ctx.font = `400 ${fs}px "VT323", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.ceil(ctx.measureText(text).width) + 8, x0 = Math.round(x - w / 2), yc = y - hh - 1;
    ctx.fillStyle = INK; ctx.fillRect(x0 - 1, yc - hh - 1, w + 2, 2 * hh + 2);
    ctx.fillStyle = bg; ctx.fillRect(x0, yc - hh, w, 2 * hh);
    ctx.fillStyle = fg; ctx.fillText(text, x, yc + 1);
    return [x0 - 1, yc - hh - 1, x0 + w + 1, yc + hh + 1];
  }
  function area(ctx, v, o, st) {
    if (!o.ring || !o.ring.length) return;
    const col = st === 'havarie' ? '232,64,52' : st === 'skoncilo' ? '141,147,158' : '58,140,255';
    const a = st === 'skoncilo' ? 0.6 : st === 'chysta' ? 0.8 : 1;
    ctx.save();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const outline = () => { // (the path of the area; made again after the stripes, which have a path of their own)
      ctx.beginPath();
      for (const r of o.ring) { for (let i = 0; i < r.length; i += 2) { const x = v.ox + r[i] * v.k, y = v.oy + r[i + 1] * v.k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } ctx.closePath(); }
    };
    outline();
    ctx.fillStyle = `rgba(${col},${0.28 * a})`; ctx.fill('evenodd');
    ctx.save(); ctx.clip('evenodd'); // the stripes, 12 px apart, only inside
    ctx.strokeStyle = `rgba(${col},${0.4 * a})`; ctx.lineWidth = 2; ctx.beginPath();
    for (let d = x0 - (y1 - y0); d < x1; d += 12) { ctx.moveTo(d, y1); ctx.lineTo(d + (y1 - y0), y0); }
    ctx.stroke(); ctx.restore();
    outline();
    ctx.lineJoin = 'round';
    if (st === 'chysta') ctx.setLineDash([10, 6]);
    ctx.strokeStyle = `rgba(22,29,43,${0.85 * a})`; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = `rgba(${col},${a})`; ctx.lineWidth = 4; ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle = `rgba(255,246,216,${0.7 * a})`; ctx.lineWidth = 1; ctx.stroke(); // (a cream line in the middle: it reads on any ground)
    ctx.restore();
  }
  // an ended one: its own colour (red a burst main, blue a shut-off: the kind must stay readable), paler, with the
  // tick of a finished intervention of the fire brigade in the corner
  function past(ctx, x, y, o, alpha) {
    ctx.globalAlpha = alpha * 0.7;
    const b = sign(ctx, x, y, o.kind === 'havarie' ? RED : BLUE, 1);
    ctx.globalAlpha = alpha;
    const r = b[2] - x - 3; doneTick(ctx, x + r - 5, b[1] + 2 * r - 3); // (where src/hasici.js puts it)
    return b;
  }
  function tank(ctx, x, y) {
    const s = 2, w = 15 * s, h = 9 * s, x0 = Math.round(x - w / 2), y0 = y - h;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y, w / 2 + 2, 4, 0, 0, Math.PI * 2); ctx.fill();
    TANK.forEach((row, j) => { for (let i = 0; i < 15; i++) { const c = TANK_COL[row[i]]; if (c) { ctx.fillStyle = c; ctx.fillRect(x0 + i * s, y0 + j * s, s, s); } } });
    return [x0, y0, x0 + w, y + 2];
  }

  function draw(ctx, v, t = 0) {
    hits = []; wanted = Date.now();
    if (!loading) { load(); return; }
    if (!D.items.length) return;
    positions();
    const now = Date.now(), m = v.k * A, alpha = ctx.globalAlpha;
    const rows = D.items.map(o => [o, stateOf(o, now)]).filter(([o, st]) => shown(o, now) && o.X != null && !(range === 'w' && st === 'skoncilo'));
    if (range === 'w') { // the week: the signs of ended ones (the ended of the 12 hours among them); the newest win the place
      weekPositions();
      const l = weekList().sort((a, b) => (b.from || 0) - (a.from || 0));
      for (const o of l) {
        const x = Math.round(v.ox + o.X * v.k), y = Math.round(v.oy + o.Y * v.k);
        if (!onScreen(ctx, x, y, 60)) continue;
        if (ctx.__claim && !ctx.__claim(x - 14, y - 32, x + 14, y + 2, false)) continue;
        hits.unshift([...past(ctx, x, y, o, alpha), o]);
      }
      ctx.globalAlpha = alpha;
    }
    // the areas first, under every sign
    if (m >= AREA_M) for (const [o, st] of rows) if (st !== 'chysta' || v.z >= PLAN_Z || ctx.__hl) area(ctx, v, o, st);
    // the planned and the ended first, those of now over them
    const order = { chysta: 0, skoncilo: 1, probiha: 2, havarie: 3 };
    rows.sort((a, b) => order[a[1]] - order[b[1]] || a[0].Y - b[0].Y);
    for (const [o, st] of rows) {
      const x = Math.round(v.ox + o.X * v.k), y = Math.round(v.oy + o.Y * v.k);
      if (!onScreen(ctx, x, y, 120)) continue;
      if (st === 'chysta' || st === 'skoncilo') {
        if (v.z < PLAN_Z && !ctx.__hl) continue; // (the whole city in view: only what goes on now)
        if (ctx.__claim && !ctx.__claim(x - 14, y - 32, x + 14, y + 2, false)) continue;
        if (st === 'skoncilo') { hits.push([...past(ctx, x, y, o, alpha), o]); continue; }
        ctx.globalAlpha = alpha * 0.85;
        const b = sign(ctx, x, y, PALE, 1);
        hits.push([...b, o]);
        if (st === 'chysta' && o.from) { const tb = tag(ctx, b[2] + 2 + 20, b[1] + 13, DAY.format(new Date(o.from)), '#ffffff', INK, true); hits.push([...tb, o]); }
        continue;
      }
      ctx.globalAlpha = alpha;
      if (ctx.__claim) ctx.__claim(x - 16, y - 50, x + 16, y + 2, true); // (an event of now is never folded under other icons)
      if (st === 'havarie') beacon(ctx, x, y, t, RED, m >= AREA_M ? 26 : 20, 7);
      const b = sign(ctx, x, y, st === 'havarie' ? RED : BLUE, 2, false, 0); // (28 px, as a running intervention of the fire brigade)
      hits.push([...b, o]);
      tag(ctx, x, b[1] - 2, st === 'havarie' ? 'Havárie vody' : 'Bez vody', st === 'havarie' ? RED : BLUE);
    }
    // the tanks near an event of now
    if (m >= TANK_M) {
      ctx.globalAlpha = alpha;
      for (const k of D.tanks) {
        if (!k.near || k.X == null) continue;
        const x = Math.round(v.ox + k.X * v.k), y = Math.round(v.oy + k.Y * v.k);
        if (!onScreen(ctx, x, y, 40)) continue;
        hits.push([...tank(ctx, x, y), { tank: true, ...k }]);
      }
    }
    ctx.globalAlpha = alpha;
  }
  const at = (sx, sy) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]) return h[4]; } return null; };
  // the events drawn (for the panel and the highlight), those of now first
  const list = () => { positions(); const now = Date.now(); return D.items.filter(o => shown(o, now)); };
  const weekPts = () => { weekPositions(); return weekList().map(o => [o.X, o.Y]); };
  const api = { load, draw, at, list, stateOf, isNow, positions, data: D, setRange, range: () => range, loadWeek, weekList, weekPts, weekSummary };
  return api;
}

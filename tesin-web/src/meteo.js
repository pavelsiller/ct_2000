import { fetchData, watchFeed, RELOAD, relayOr } from './feed.js';
import { itemInMap } from './extent.js';
import { onScreen, imgPoints } from './onscreen.js';
const STALE_MS = 6 * 3600e3;
// the whole city in view (v.z < FAR_Z, about 7 m per pixel and further): only the stations that measure something out
// of the ordinary, with a tag saying what (heat, hard frost, strong wind, a lot of rain today); the others come closer in
export const FAR_Z = 0.3;
const fmt1 = n => n.toFixed(1).replace('.', ',');
function notable(val) {
  if (!val || (val.at && Date.now() - val.at > STALE_MS)) return '';
  if (Number.isFinite(val.t) && val.t >= 30) return `${fmt1(val.t)} °C`;
  if (Number.isFinite(val.t) && val.t <= -10) return `${fmt1(val.t)} °C`;
  if (Number.isFinite(val.w) && val.w >= 10) return `vítr ${Math.round(val.w)} m/s`;
  if (Number.isFinite(val.r) && val.r >= 10) return `${Math.round(val.r)} mm`;
  return '';
}
export function createMeteo({ base, llToImg }) {
  const pts = imgPoints(llToImg); // (the image points of the items, kept between the frames)
  let list = [], updated = '', loading = null, hits = [], lastLive = 0;
  const live = new Map(); // sensor id -> { t, h, p, at }
  const load = (init) => (loading ||= fetchData(`${base}data/meteo.json`, init).then(r => (r.ok ? r.json() : { stations: [] })).then(d => { list = (d.stations || []).filter(itemInMap); updated = d.updated || ''; }).catch(() => { list = []; }));
  watchFeed('meteo.json', () => { loading = null; histAt = 0; return load(RELOAD); });
  async function fetchLive() {
    lastLive = Date.now();
    await Promise.all(list.filter(s => s.sc).map(async s => {
      try {
        const d = await relayOr('meteo-live.json', String(s.sc), 30 * 60e3, async () => (await fetch(`https://data.sensor.community/airrohr/v1/sensor/${s.sc}/`)).json());
        const r = d[d.length - 1];
        if (!r) return;
        const v = Object.fromEntries(r.sensordatavalues.map(x => [x.value_type, +x.value]));
        live.set(s.sc, { t: v.temperature, h: v.humidity, p: v.pressure_at_sealevel ? v.pressure_at_sealevel / 100 : null, at: Date.parse(r.timestamp.replace(' ', 'T') + 'Z') });
      } catch { /* not available now */ }
    }));
  }
  const values = s => (s.sc ? live.get(s.sc) || null : s.vals ? { ...s.vals, at: s.at } : null);
  // hourly temperatures of the last 7 days (data/meteo-history.json, written by the same tool); read again after 10 minutes
  let hist = null, histAt = 0, histLoading = null;
  const loadHistory = () => {
    if (histLoading && Date.now() - histAt < 10 * 60e3) return histLoading;
    histAt = Date.now();
    return (histLoading = fetchData(`${base}data/meteo-history.json`).then(r => (r.ok ? r.json() : null)).then(d => { hist = d && Array.isArray(d.stations) ? d : null; }).catch(() => { hist = null; }));
  };
  // the station's key in the history (meteo.json written before the ids were added gets them from the page address)
  const idOf = s => s.id || (s.sc ? `sc${s.sc}` : '');
  // the station's temperatures of the last `hours` hours: [[time, t | null], ...]; [] when there is no history yet
  async function series(s, hours = 24) {
    await loadHistory();
    const id = idOf(s);
    const st = hist ? hist.stations.find(x => x.id === id) : null;
    if (!st) return [];
    const step = hist.step || 36e5;
    return st.t.map((v, i) => [hist.from + i * step, v]).slice(-hours);
  }
  function draw(ctx, v) {
    hits = []; pts.begin();
    if (!list.length) { load(); return; }
    if (Date.now() - lastLive > 10 * 60e3) fetchLive();
    // (far out: only the notable ones; a highlighted theme, ctx.__hl from main.js, shows all of them)
    const far = v.z < FAR_Z && !ctx.__hl;
    if (v.z < 0.15 && !far) return;
    const k = v.z >= 0.6 ? 1.3 : 1;
    ctx.font = '400 15px "VT323", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const boxes = [];
    for (const s of list) {
      const note = far ? notable(values(s)) : '';
      if (far && !note) continue;
      const [X, Y] = pts.of(s, s.lon, s.lat);
      const x = Math.round(v.ox + X * v.k), y = Math.round(v.oy + Y * v.k);
      if (!onScreen(ctx, x, y, 40)) continue;
      // white mast with an anemometer (three cups) and a small screen box
      const top = y - Math.round(20 * k);
      if (ctx.__claim && !ctx.__claim(x - 10 * k, top - 6, x + 10 * k, y + 2)) continue;
      ctx.fillStyle = '#161d2b'; ctx.fillRect(x - 2, top, 4, y - top);
      ctx.fillStyle = '#f0f2ea'; ctx.fillRect(x - 1, top + 1, 2, y - top - 1);
      ctx.fillStyle = '#161d2b'; ctx.fillRect(x - Math.round(6 * k), top - 1, Math.round(12 * k), 3);
      for (const dx of [-6, 0, 6]) { ctx.fillStyle = '#161d2b'; ctx.fillRect(x + Math.round(dx * k) - 2, top - 4, 4, 4); ctx.fillStyle = '#5fb3e6'; ctx.fillRect(x + Math.round(dx * k) - 1, top - 3, 2, 2); }
      ctx.fillStyle = '#161d2b'; ctx.fillRect(x - Math.round(5 * k), y - Math.round(10 * k), Math.round(10 * k), Math.round(6 * k));
      ctx.fillStyle = '#f0f2ea'; ctx.fillRect(x - Math.round(5 * k) + 1, y - Math.round(10 * k) + 1, Math.round(10 * k) - 2, Math.round(6 * k) - 2);
      let x1 = x + 8 * k;
      const val = values(s);
      // a temperature older than 6 hours (station silent, or the data file not refreshed) gets no tag
      const fresh = val && (!val.at || Date.now() - val.at <= STALE_MS);
      const txt = note || (fresh && val.t != null && Number.isFinite(val.t) ? `${val.t.toFixed(1).replace('.', ',')} °C` : '');
      const tw = txt ? ctx.measureText(txt).width + 8 : 0, tx = Math.round(x + 8 * k), ty = Math.round(top + 4);
      // temperature tags only where they don't overlap
      const showTag = txt && (note || (v.z >= 2 / 3.5)) && !boxes.some(b => b[0] < tx + tw + 2 && b[2] > tx - 2 && b[1] < ty + 10 && b[3] > ty - 10);
      if (showTag) {
        boxes.push([tx, ty - 9, tx + tw, ty + 9]);
        ctx.fillStyle = '#161d2b'; ctx.fillRect(tx - 1, ty - 9, tw + 2, 18);
        ctx.fillStyle = '#5fb3e6'; ctx.fillRect(tx, ty - 8, tw, 16);
        ctx.fillStyle = '#161d2b'; ctx.fillText(txt, tx + 4, ty + 1);
        x1 = tx + tw;
      }
      hits.push([x - 10 * k, top - 6, x1, y + 2, s]);
    }
  }
  const at = (sx, sy) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]) return h[4]; } return null; };
  return { load, draw, at, values, series, updated: () => updated, fetchLive, stations: () => list };
}

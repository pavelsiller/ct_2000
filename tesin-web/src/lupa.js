import { onScreen } from './onscreen.js';
import { inMap } from './extent.js';
export const LUPA = {
  pitka: { title: 'Pítko', fill: '#7fc8f0', glyph: '💧' },
  wc: { title: 'Veřejné WC', fill: '#c9a0e8', glyph: 'WC' },
  stin: { title: 'Stín na zastávce', fill: '#93c96a', glyph: '☂' },
  kose: { title: 'Odpadkový koš', fill: '#9aa3ad', glyph: '▾' },
};
const MIN_Z = 2 / 3.5; // from 3.5 m per pixel, like the other small things

export function createLupa({ base, llToImg }) {
  const data = {}; // kind -> [{ ...point, X, Y }]
  let loading = null, posKey = '', hits = [];
  const load = () => (loading ||= Promise.all(Object.keys(LUPA).map(k =>
    fetch(`${base}data/lupa/${k}.json`).then(r => (r.ok ? r.json() : [])).catch(() => [])
      .then(list => { data[k] = (Array.isArray(list) ? list : []).filter(p => Number.isFinite(+p.lat) && Number.isFinite(+p.lon) && inMap(+p.lon, +p.lat)).map(p => ({ ...p, lat: +p.lat, lon: +p.lon, kind: k })); }))));
  function positions() {
    const key = `${llToImg(16.6, 49.2).join(',')}|${Object.values(data).map(l => l.length).join(',')}`;
    if (key === posKey) return;
    posKey = key;
    for (const l of Object.values(data)) for (const p of l) [p.X, p.Y] = llToImg(p.lon, p.lat);
  }
  function pin(ctx, x, y, k) {
    const { fill, glyph } = LUPA[k], r = 6;
    if (ctx.__claim && !ctx.__claim(x - r - 2, y - 2 * r - 2, x + r + 2, y + 4)) return null;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - r + 2, y - 2 * r + 2, 2 * r, 2 * r);
    ctx.fillStyle = '#f3c868'; ctx.fillRect(x - r - 1, y - 2 * r - 1, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = fill; ctx.fillRect(x - r, y - 2 * r, 2 * r, 2 * r);
    ctx.fillStyle = '#161d2b'; ctx.fillRect(x - 1, y, 2, 3);
    ctx.font = glyph.length > 1 && /^[A-Z]+$/.test(glyph) ? '700 8px "Atkinson Hyperlegible", sans-serif' : '400 12px "VT323", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x, y - r + 1);
    return [x - r - 2, y - 2 * r - 2, x + r + 2, y + 4];
  }
  function draw(ctx, v, on) {
    hits = [];
    if (!loading) { load(); return; }
    if (v.z < MIN_Z) return;
    positions();
    for (const k of Object.keys(LUPA)) {
      if (!on[k] || !data[k]) continue;
      for (const p of data[k]) {
        if (p.X == null) continue;
        const x = Math.round(v.ox + p.X * v.k), y = Math.round(v.oy + p.Y * v.k);
        if (!onScreen(ctx, x, y, 30)) continue;
        const box = pin(ctx, x, y, k);
        if (box) hits.push([...box, p]);
      }
    }
  }
  const at = (sx, sy) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]) return h[4]; } return null; };
  const nearFountain = (lon, lat, m = 15) => (data.pitka || []).some(p => Math.hypot((p.lon - lon) * 72765, (p.lat - lat) * 111200) < m);
  return { load, draw, at, nearFountain, data };
}

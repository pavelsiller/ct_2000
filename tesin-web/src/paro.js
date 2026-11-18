import { fetchData, watchFeed, everyHour, RELOAD, relayOr } from './feed.js';
import { beacon } from './beacon.js';
import { itemInMap } from './extent.js';
import { onScreen } from './onscreen.js';
export const PARO_WEB = 'https://paro.damenavas.cz';
const MIN_Z = 2 / 3.5; // from 3.5 m per pixel, like the other small things (from further out they hid the city); chosen in Aktuálně: at any zoom

export function createParo({ base, llToImg }) {
  const D = { items: [], voting: null, year: 0, updated: '' };
  let loading = null, detailed = null, detail = {}, posKey = '', hits = [];
  const load = init => (loading ||= fetchData(`${base}data/paro.json`, init).then(r => (r.ok ? r.json() : null)).then(d => { if (!d) return; D.items = (d.items || []).filter(p => p.city || itemInMap(p)); D.voting = d.voting || null; D.year = d.year || 0; D.updated = d.updated || ''; posKey = ''; }).catch(() => {}));
  watchFeed('paro.json', () => loading && (loading = null, load(RELOAD)));
  // texts, pictures, budget items and the votes of the last data run: fetched before a card
  const getDetail = () => (detailed ||= load().then(() => fetchData(`${base}data/paro-detail.json`)).then(r => r.json()).then(d => { detail = d || {}; }).catch(() => { detailed = null; }));
  const detailOf = p => detail[p.id] || {};
  // the phase of the year: before the vote, the vote, counting (vote over, results not out), results
  function phase(t = Date.now()) {
    const v = D.voting;
    if (!v) return 'voting';
    if (t < Date.parse(v.start)) return 'before';
    if (t <= Date.parse(v.end)) return 'voting';
    if (t < Date.parse(`${v.announcement}T00:00:00+01:00`)) return 'counting';
    return 'results';
  }
  // which proposals the layer draws: all of the vote while it is on, the winners afterwards
  const shown = p => !p.city && (phase() === 'results' ? !!p.win : true);
  function positions() {
    const key = `${llToImg(16.6, 49.2).join(',')}|${D.items.length}`;
    if (key === posKey) return;
    posKey = key;
    for (const p of D.items) if (!p.city) [p.X, p.Y] = llToImg(p.lon, p.lat);
  }
  const dark = col => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(col || ''); if (!m) return false; const [r, g, b] = [1, 2, 3].map(i => parseInt(m[i], 16)); return 0.299 * r + 0.587 * g + 0.114 * b < 140; };
  // a sign on a post: a square in the colour of the category with a tick, a cream rim and a dark edge
  // (s: the scale of a highlighted pin from the Aktuálně panel — half again as big, always drawn, never clustered)
  function pin(ctx, x, y, p, s = 1) {
    const r = Math.round(7 * s);
    if (ctx.__claim && !ctx.__claim(x - r - 3, y - 2 * r - 6, x + r + 3, y + 2, s > 1)) return null;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - r + 2, y - 2 * r - 2, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = '#161d2b'; ctx.fillRect(x - r - 3, y - 2 * r - 6, 2 * r + 6, 2 * r + 6); // dark edge
    ctx.fillStyle = '#f0f2ea'; ctx.fillRect(x - r - 1, y - 2 * r - 4, 2 * r + 2, 2 * r + 2); // cream rim
    ctx.fillStyle = p.col || '#f3c868'; ctx.fillRect(x - r, y - 2 * r - 3, 2 * r, 2 * r);
    ctx.fillStyle = '#161d2b'; ctx.fillRect(x - 1, y - 3, 2, 5); // the post
    // the tick (pixel lines)
    ctx.fillStyle = dark(p.col) ? '#f0f2ea' : '#161d2b';
    const ox = x - Math.round(5 * s), oy = y - r - Math.round(3 * s), px = Math.ceil(s);
    for (const [dx, dy] of [[1, 0], [2, 1], [3, 2], [4, 1], [5, 0], [6, -1], [7, -2], [8, -3], [2, 0], [3, 1], [4, 0], [5, -1], [6, -2], [7, -3]]) ctx.fillRect(ox + Math.round(dx * s), oy + Math.round(dy * s), px, px);
    if (p.win && phase() === 'results') { ctx.fillStyle = '#e6c15a'; ctx.fillRect(x - r - 1, y - 2 * r - 4, 2 * r + 2, 1); ctx.fillRect(x - r - 1, y - 2 * r - 4, 1, 2 * r + 2); } // a gold corner for a winner
    return [x - r - 3, y - 2 * r - 6, x + r + 3, y + 2];
  }
  // hl: the proposals are the chosen theme of the Aktuálně panel — bigger signs with a pulsing ring, at any zoom
  function draw(ctx, v, t = 0, hl = false) {
    hits = [];
    if (!loading) { load(); return; }
    if ((v.z < MIN_Z && !hl) || !D.items.length) return;
    positions();
    const s = hl ? 1.5 : 1;
    for (const p of D.items) {
      if (!shown(p) || p.X == null) continue;
      const x = Math.round(v.ox + p.X * v.k), y = Math.round(v.oy + p.Y * v.k);
      if (!onScreen(ctx, x, y, 30)) continue;
      // highlighted: ripples in the colour of the category spread from the foot of the sign, and the sign hops
      const hop = hl ? beacon(ctx, x, y, t, p.col, 34, p.id || 0) : 0;
      const box = pin(ctx, x, y - hop, p, s);
      if (box) hits.push([...box, p]);
    }
  }
  const at = (sx, sy) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]) return h[4]; } return null; };
  // the running vote from the web (while the vote is on), read once per visit; null when it is not available
  let live = null;
  everyHour(() => { live = null; }); // a page left open during the vote: the counts once an hour (src/feed.js)
  const liveVotes = () => (live ||= phase() === 'voting'
    ? relayOr('paro-live.json', 'votes', 30 * 60e3, () => fetch(`${PARO_WEB}/wp-json/iq/v1/vote/votable-projects`, { signal: AbortSignal.timeout(12000) }).then(r => (r.ok ? r.json() : null))).then(list => {
      if (!Array.isArray(list)) return null;
      const m = new Map(); const at = Date.now();
      for (const w of list) if (w && w.vote) m.set(w.id, { plus: w.vote.positive || 0, minus: w.vote.negative || 0, bal: w.vote.balance || 0, at });
      return m;
    }).catch(() => { live = null; return null; })
    : Promise.resolve(null));
  return { load, detail: getDetail, detailOf, draw, at, phase, shown, positions, liveVotes, data: D };
}

import { DATA_BASE } from './feed.js';
import { itemInMap } from './extent.js';
import { beacon } from './beacon.js';
import { onScreen } from './onscreen.js';
export const HASICI_WEB = 'https://udalosti.firebrno.cz/';
const HOURS = 12, POLL_MS = 60e3;
const RED = '#d8362a', INK = '#161d2b', CREAM = '#fff6d8';
export const NEAR = 1.1; // screen px per metre from which the engine is drawn
// the kinds: the tag over a running intervention, the colour of the sign and its picture (9 × 9)
export const KINDS = {
  pozar: { tag: 'POŽÁR', col: '#e2452a', px: ['....#....', '...##....', '...###...', '..####.#.', '.#####.##', '.########', '.###.####', '..##..##.', '...####..'] },
  nehoda: { tag: 'NEHODA', col: '#ee8a2e', px: ['.........', '..#####..', '.#.....#.', '.#.....#.', '#########', '#.##.##.#', '#########', '.##...##.', '.........'] },
  unik: { tag: 'ÚNIK LÁTEK', col: '#7a4fb5', px: ['....#....', '....#....', '...###...', '...###...', '..#####..', '.#######.', '.#######.', '.#######.', '..#####..'] },
  pomoc: { tag: 'TECHNICKÁ POMOC', col: '#3b6fb6', px: ['......##.', '.....##..', '.....##.#', '....#####', '...####..', '..###....', '.###.....', '###......', '##.......'] },
  zachrana: { tag: 'ZÁCHRANA', col: '#3f9a5a', px: ['...###...', '...###...', '...###...', '#########', '#########', '#########', '...###...', '...###...', '...###...'] },
  jine: { tag: 'ZÁSAH', col: '#6f7a8c', px: ['...###...', '...###...', '...###...', '...###...', '...###...', '.........', '...###...', '...###...', '.........'] },
};
// a small green tick on a dark square in the corner of a sign: finished (cx, cy: its top left)
export function doneTick(ctx, cx, cy) {
  ctx.fillStyle = INK; ctx.fillRect(cx - 2, cy - 3, 11, 10);
  ctx.fillStyle = '#9fd67a'; for (const [dx, dy] of TICK) ctx.fillRect(cx + dx, cy + dy, 1, 2);
}
const TICK = [[0, 3], [1, 4], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1], [1, 3], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0]];

/**
 * @param base the address of the page (data/…)
 * @param llToImg (lon, lat) → image point
 * @param A image px per metre (GEO.A)
 * @param roads () → the roads [[class, [X, Y, …]], …] in image points (data.routes; empty until loaded)
 * @param needRoads asks for the roads
 * @param blocked (X, Y) → is the image point on a drawn building (its roof or wall)
 * @param onChange called after every load
 */
export function createHasici({ base, llToImg, A = 1, roads = () => [], needRoads = () => {}, blocked = () => false, onChange = () => {} }) {
  const D = { items: [], updated: '', checked: 0 };
  let loading = null, loadedAt = 0, posKey = '', parkKey = '', hits = [], wanted = 0;
  const STAGED = [];
  const urls = () => [DATA_BASE ? `${DATA_BASE}/data/hasici.json?m=${Math.floor(Date.now() / 60e3)}` : '', `${base}data/hasici.json`].filter(Boolean);
  async function fetchNow() {
    for (const u of urls()) {
      try {
        const r = await fetch(u, { cache: 'no-store' });
        if (!r.ok) continue;
        const d = await r.json();
        D.items = (d.items || []).filter(itemInMap); /* (the brigade of the region also goes to Kuřim or Šlapanice: only the calls in the map, src/extent.js) */ D.updated = d.updated || ''; D.checked = d.checked || 0; posKey = ''; loadedAt = Date.now();
        if (STAGED.length) D.items = STAGED;
        else {}
        onChange();
        return;
      } catch { /* the next address */ }
    }
  }
  const load = () => (loading ||= fetchNow());
  // once a minute while somebody looks at the layer (draw() was called in the last minutes)
  setInterval(() => { if (loading && !document.hidden && Date.now() - wanted < 2 * POLL_MS) fetchNow(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && loading && Date.now() - loadedAt > POLL_MS) fetchNow(); });

  const W = { items: [], loaded: 0 };
  let range = 'h', weekLoading = null, weekKey = '';
  const weekUrls = () => [DATA_BASE ? `${DATA_BASE}/data/hasici-tyden.json?m=${Math.floor(Date.now() / 300e3)}` : '', `${base}data/hasici-tyden.json`].filter(Boolean);
  async function fetchWeek() {
    for (const u of weekUrls()) {
      try { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) continue; W.items = ((await r.json()).items || []).filter(itemInMap); weekKey = ''; break; } catch { /* the next address */ }
    }
    W.loaded = Date.now(); onChange();
  }
  const loadWeek = () => (weekLoading ||= fetchWeek());
  setInterval(() => { if (range === 'w' && weekLoading && !document.hidden && Date.now() - wanted < 2 * POLL_MS && Date.now() - W.loaded > 300e3) fetchWeek(); }, POLL_MS);
  function setRange(r) { range = r === 'w' ? 'w' : 'h'; if (range === 'w') loadWeek(); onChange(); }
  // the week as dots: what is not running now (the newest form: the file of the minute wins over the week's)
  function weekList() {
    const now = new Map(D.items.map(o => [o.id, o]));
    return [...W.items.map(o => now.get(o.id) || o), ...D.items.filter(o => !W.items.some(w => w.id === o.id))].filter(o => !isOpen(o));
  }
  function weekPositions() {
    const key = `${llToImg(16.6, 49.2).join(',')}|${W.items.length}|${W.loaded}`;
    if (key === weekKey) return;
    weekKey = key;
    for (const o of W.items) [o.X, o.Y] = llToImg(o.lon, o.lat);
  }
  // the numbers of the week: all, by kind (running ones included)
  function weekSummary() {
    const all = new Map([...W.items, ...D.items].map(o => [o.id, o]));
    const by = {}; for (const o of all.values()) by[o.kind] = (by[o.kind] || 0) + 1;
    return { loaded: !!W.loaded, n: all.size, by };
  }
  // (shown while it runs and 12 hours after its end; the end is not known when it closed before the first run saw it: the call counts then)
  const list = (t = Date.now()) => D.items.filter(o => isOpen(o) || (o.end || o.t) > t - HOURS * 3600e3);
  // (a file that stopped being refreshed must not blink for ever: after 20 minutes without a check nothing "runs")
  const fresh = () => !D.checked || Date.now() - D.checked < 20 * 60e3;
  const isOpen = o => !!o.open && fresh();
  function positions() {
    const key = `${llToImg(16.6, 49.2).join(',')}|${D.items.length}|${D.checked}`;
    if (key === posKey) return;
    posKey = key; parkKey = '';
    for (const o of D.items) { [o.X, o.Y] = llToImg(o.lon, o.lat); o.park = o.park2 = null; }
  }
  // where the engine of a running intervention stands: on the ground near the place, never on a house or in front
  // of its wall. The kerbs of the streets around (within 250 m, on the side of the place)
  // and rings of spots around the place (grass, a yard), the nearest first; a spot is free when the middle and both ends of the engine
  // are clear of the drawn buildings (blocked). The buildings around come a moment after the view: tried again
  // for a few seconds, then the place is kept.
  // (seen(o): the place is on the screen. Only those are looked for, each with its own six tries: an intervention at the
  // other end of the city used to be searched too, and the search asks for the buildings around it.)
  // More than three vehicles on the spot (the card says so: "Na místě 12 vozů"): a second engine on the next free
  // spot (park2), the nearest one where the two do not cover each other on the screen. It stands a little askew
  // (14 to 23 degrees off its kerb, to the side where it fits), so the two do not look like copies.
  // (kept: the spots found, by intervention. The file comes anew every minute and the search is not cheap, some
  // 130 ms a try among houses: without it the six tries came again with every file, six hitches a minute. Looked
  // for again after ten minutes, should the houses have been missing the first time.)
  let parkAt = 0, parkGen = 0;
  const FAR = 250, KEEP_MS = 10 * 60e3, kept = new Map();
  const carsOf = o => (o.units || []).reduce((n, u) => n + (u.now || 0), 0); // the vehicles on the spot now
  // the engine as it is drawn (2.6 times its real size, with a metre to spare), in image points: the half length and
  // the half width of its footprint as vectors, the height of its roof over the ground
  const shape = (X, Y, ux, uy) => {
    const gn = Math.hypot(ux, 2 * uy) || 1, hl = (4.25 * 2.6 + 1) * A, hw = (1.3 * 2.6 + 1) * A;
    return { X, Y, ax: (ux / gn) * hl, ay: (uy / gn) * hl, bx: ((-2 * uy) / gn) * hw, by: (ux / (2 * gn)) * hw, up: 3.3 * 0.6 * 2.6 * A };
  };
  // are two engines clear of each other on the screen? Each is its footprint swept up to its roof. They meet when the
  // step from one to the other fits into the figure made of the four half sides and the height; it does not when it
  // sticks out across one of the five directions.
  const apart = (p, q) => {
    const G = [[p.ax, p.ay], [p.bx, p.by], [q.ax, q.ay], [q.bx, q.by], [0, p.up]], dx = q.X - p.X, dy = q.Y - p.Y;
    return G.some(([gx, gy]) => Math.abs(dy * gx - dx * gy) > G.reduce((sum, [hx, hy]) => sum + Math.abs(hy * gx - hx * gy), 0));
  };
  function park(seen) {
    const R = roads(), key = `${posKey}|${R.length}`;
    if (key !== parkKey) { parkKey = key; parkGen++; parkAt = 0; }
    if (Date.now() - parkAt < 1500) return;
    if (!D.items.some(o => o.open && seen(o) && !(o.parkGen === parkGen && o.parkTries >= 6))) return;
    const now = parkAt = Date.now(), rot = llToImg(16.6, 49.2).join(','); // (rot: the rotation of the map)
    // the whole engine as it is drawn: its footprint and its roof
    const free = (X, Y, ux, uy) => {
      if (blocked(X, Y)) return false;
      const { ax, ay, bx, by, up } = shape(X, Y, ux, uy);
      for (const a of [-1, -0.5, 0, 0.5, 1]) for (const b of [-1, 0, 1]) for (const l of [0, up]) if (blocked(X + ax * a + bx * b, Y + ay * a + by * b - l)) return false;
      return true;
    };
    const sig = o => { o.parkSig = `${Math.round(o.park.X)},${Math.round(o.park.Y)}${o.park2 ? `,${Math.round(o.park2.X)},${Math.round(o.park2.Y)}` : ''}`; };
    for (const o of D.items) {
      if (!o.open || !seen(o)) continue;
      if (o.parkGen !== parkGen) { o.parkGen = parkGen; o.parkTries = 0; }
      if (o.parkTries >= 6) continue;
      if (o.fix) { const [X, Y] = llToImg(o.fix.lon, o.fix.lat), r = (o.fix.deg * Math.PI) / 180; o.park = { X, Y, ux: Math.cos(r), uy: -Math.sin(r) }; o.park2 = null; sig(o); continue; } // (a staged scene)
      const two = carsOf(o) > 3, K = `${o.id}|${o.lon},${o.lat}|${two}|${rot}|${R.length}`;
      let e = kept.get(K);
      if (!e || now - e.at > KEEP_MS) { if (kept.size > 200) kept.clear(); kept.set(K, e = { at: now, tries: 0 }); }
      if (e.tries >= 6) { o.park = e.park; o.park2 = e.park2; o.parkTries = 6; sig(o); continue; }
      o.parkTries = ++e.tries;
      const gx = o.X / A, gy = (2 * o.Y) / A; // ground metres
      const cand = [];
      for (const [, p] of R) {
        for (let i = 0; i + 3 < p.length; i += 2) {
          const ax = p[i] / A, ay = (2 * p[i + 1]) / A, bx = p[i + 2] / A, by = (2 * p[i + 3]) / A;
          if (Math.min(ax, bx) > gx + FAR || Math.max(ax, bx) < gx - FAR || Math.min(ay, by) > gy + FAR || Math.max(ay, by) < gy - FAR) continue;
          const vx = bx - ax, vy = by - ay, L = Math.hypot(vx, vy) || 1;
          // the direction on the screen (image points), to the right so the cab is seen
          let ux = vx, uy = vy / 2; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
          if (ux < 0) { ux = -ux; uy = -uy; }
          const u0 = Math.max(0, Math.min(1, ((gx - ax) * vx + (gy - ay) * vy) / (L * L)));
          // the nearest point of the segment and points every 7 m along it
          for (const u of [u0, ...Array.from({ length: Math.floor(L / 7) + 1 }, (_, j) => (j * 7) / L)]) {
            const qx = ax + vx * u, qy = ay + vy * u, d = Math.hypot(qx - gx, qy - gy);
            if (d > FAR) continue;
            let nx = gx - qx, ny = gy - qy;
            if (d < 0.5) { nx = -vy / L; ny = vx / L; } else { nx /= d; ny /= d; }
            // (the side of the street: across its direction, towards the place)
            const side = Math.sign(nx * (-vy / L) + ny * (vx / L)) || 1, off = Math.min(d, 2.6);
            cand.push({ d, X: (qx + (-vy / L) * side * off) * A, Y: ((qy + (vx / L) * side * off) * A) / 2, ux, uy });
          }
        }
      }
            for (let r = 8; r <= FAR; r += 8) for (let k = 0; k < 16; k++) { const a = (k / 16) * 2 * Math.PI + r; cand.push({ d: r + 12, X: (gx + Math.cos(a) * r) * A, Y: ((gy + Math.sin(a) * r) * A) / 2, ux: 0.894, uy: 0.447 }); }
      cand.sort((m, n) => m.d - n.d); // (a spot on the grass counts as 12 m farther than a kerb: the street wins when both are near)
      const c = cand.find(q => free(q.X, q.Y, q.ux, q.uy));
      const f = c || cand[0]; // (houses everywhere within 250 m: the nearest spot, whatever stands there)
      o.park = { X: f.X, Y: f.Y, ux: f.ux, uy: f.uy };
      // the second engine of a big intervention: the nearest free spot clear of the first one, among the spots after
      // it (those before it are taken by houses) and at most 80 m farther from the place (none free: one engine);
      // turned a little off its kerb to one side or the other, straight along it when neither fits
      let c2 = null;
      if (c && two) {
        const s1 = shape(c.X, c.Y, c.ux, c.uy), by = (0.25 + 0.15 * rnd(o.id % 977, 2)) * (rnd(o.id % 983, 4) < 0.5 ? -1 : 1);
        // (the direction on the screen turned by an angle on the ground, the cab still to the right)
        const turn = (ux, uy, a) => { const gx = ux, gy = 2 * uy, x = gx * Math.cos(a) - gy * Math.sin(a), y = (gx * Math.sin(a) + gy * Math.cos(a)) / 2, l = (Math.hypot(x, y) || 1) * (x < 0 ? -1 : 1); return [x / l, y / l]; };
        for (let i = cand.indexOf(c) + 1; i < cand.length && !c2 && cand[i].d <= c.d + 80; i++) {
          const q = cand[i];
          if (blocked(q.X, q.Y)) continue;
          for (const a of [by, -by, 0]) { const [ux, uy] = turn(q.ux, q.uy, a); if (!c2 && apart(s1, shape(q.X, q.Y, ux, uy)) && free(q.X, q.Y, ux, uy)) c2 = { X: q.X, Y: q.Y, ux, uy }; }
        }
      }
      o.park2 = c2 ? { X: c2.X, Y: c2.Y, ux: c2.ux, uy: c2.uy } : null;
      e.park = o.park; e.park2 = o.park2;
      sig(o);
    }
  }

  // ---- the sign of the kind on a post: a square in the colour of the kind, a cream rim, a dark edge. done: grey, a tick
  // (pad: a wider field around the picture, for a sign a little bigger without bigger pixels)
  function sign(ctx, x, y, kind, done, s = 2, pad = 0) {
    const K = KINDS[kind] || KINDS.jine, r = Math.round(5.5 * s) + pad, top = y - 2 * r - 6;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - r + 2, top + 4, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = INK; ctx.fillRect(x - r - 3, top, 2 * r + 6, 2 * r + 6); ctx.fillRect(x - 1, y - 3, 2, 5);
    ctx.fillStyle = done ? '#d9d3c0' : CREAM; ctx.fillRect(x - r - 1, top + 2, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = done ? '#8d939e' : K.col; ctx.fillRect(x - r, top + 3, 2 * r, 2 * r);
    ctx.fillStyle = done ? '#e6e2d3' : CREAM;
    const ox = x - Math.round(4.5 * s), oy = top + 3 + r - Math.round(4.5 * s);
    K.px.forEach((row, j) => { for (let i = 0; i < 9; i++) if (row[i] === '#') ctx.fillRect(ox + i * s, oy + j * s, s, s); });
    if (done) doneTick(ctx, x + r - 5, top + 2 * r - 3); // (a small tick in the corner: finished)
    return [x - r - 3, top, x + r + 3, y + 2];
  }
  function tag(ctx, x, y, text, f = 1) { // (f: bigger with a bigger sign; y is the bottom edge)
    const fs = Math.round(15 * f), hh = Math.round(7 * f);
    ctx.font = `400 ${fs}px "VT323", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.ceil(ctx.measureText(text).width) + 8, x0 = Math.round(x - w / 2), yc = y - hh - 1;
    ctx.fillStyle = INK; ctx.fillRect(x0 - 1, yc - hh - 1, w + 2, 2 * hh + 2);
    ctx.fillStyle = RED; ctx.fillRect(x0, yc - hh, w, 2 * hh);
    ctx.fillStyle = CREAM; ctx.fillText(text, x, yc + 1);
  }
  // ---- the fire engine, in the manner of the cars of the map (src/vehicles.js) but built up layer by layer so its
  // sides show the white stripe and the windows of the cab: 8.5 × 2.5 × 3.3 m, drawn larger than life.
  // (x, y) the middle of its footprint on the screen, (ux, uy) its direction on the screen, m screen px per metre
  function engine(ctx, x, y, ux, uy, m, t) {
    const hl = 4.25 * m, hw = 1.3 * m, h = Math.max(6, Math.round(3.3 * m * 0.6));
    const gn = Math.hypot(ux, 2 * uy) || 1, px = (-2 * uy) / gn, py = ux / (2 * gn);
    ux /= gn; uy /= gn;
    // a rectangle on the ground frame: c its centre along the length, a half length, b half width, lift px up
    const quad = (c, a, b, lift, col) => {
      const cx = x + ux * c, cy = y + uy * c - lift;
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(cx + ux * a + px * b, cy + uy * a + py * b); ctx.lineTo(cx + ux * a - px * b, cy + uy * a - py * b);
      ctx.lineTo(cx - ux * a - px * b, cy - uy * a - py * b); ctx.lineTo(cx - ux * a + px * b, cy - uy * a + py * b);
      ctx.fill();
    };
    quad(0, hl + 2, hw + 2, -2, 'rgba(0,0,0,.3)'); // shadow
    quad(0, hl + 1, hw + 1, 0, INK); // the dark foot: wheels and chassis
    const cabC = hl * 0.72, cabA = hl * 0.28; // the cab: the front quarter
    for (let j = 1; j <= h; j++) {
      const f = j / h;
      quad(0, hl, hw, j, f < 0.16 ? INK : f > 0.38 && f < 0.52 ? '#f4efe0' : '#b8281f'); // body: dark sill, red, white stripe
      if (f > 0.58 && f < 0.9) { // the upper half of the sides: the windows of the cab, two roller shutters of the lockers behind it
        quad(cabC + 0.5, cabA - hl * 0.04, hw + 0.01, j, '#27344d');
        quad(hl * 0.12, hl * 0.2, hw + 0.01, j, '#c3c8d0'); quad(-hl * 0.5, hl * 0.3, hw + 0.01, j, '#c3c8d0');
      }
    }
    // the wheels on the side that is seen (the one lower on the screen), over the sill
    const sd = py >= 0 ? 1 : -1, wr = Math.max(2, 0.55 * m), wy = wr * 0.35;
    for (const c of [hl * 0.62, -hl * 0.5]) {
      const wx = x + ux * c + px * hw * sd, wyy = y + uy * c + py * hw * sd - wy;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(wx, wyy, wr * Math.max(0.45, Math.abs(ux)), wr, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.ellipse(wx, wyy, wr * 0.4 * Math.max(0.45, Math.abs(ux)), wr * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    quad(0, hl, hw, h, RED); // roof
    quad(cabC, cabA - 1, hw - 1, h, '#e8584a'); // the roof of the cab, lighter
    quad(-hl * 0.22, hl * 0.62, hw * 0.5, h + 1, '#7b8494'); quad(-hl * 0.22, hl * 0.6, hw * 0.3, h + 2, '#c9ced6'); // the ladder on the roof
    for (let i = -3; i <= 3; i++) quad(-hl * 0.22 + i * hl * 0.17, 0.6, hw * 0.3, h + 2, '#7b8494'); // its rungs
    // the light bar across the cab: its halves take turns, blue and white
    const on = Math.floor(t / 240) % 2 === 0, lc = cabC - cabA * 0.25;
    const half = (side, lit) => {
      const ox = px * hw * 0.45 * side, oy = py * hw * 0.45 * side;
      ctx.save(); ctx.translate(ox, oy);
      quad(lc, Math.max(1.5, hl * 0.07), hw * 0.42, h + 2, lit ? '#ffffff' : '#2d7fe0');
      ctx.restore();
      // the light: a white core, a strong blue glow around the lamp that is on (added to the picture, so it shines),
      // a faint one around the other
      const gx = x + ux * lc + ox, gy = y + uy * lc + oy - h - 2, R = lit ? 20 + m * 4.5 : 8 + m * 2, g = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
      g.addColorStop(0, lit ? 'rgba(235,246,255,1)' : 'rgba(80,170,255,.5)'); if (lit) { g.addColorStop(0.18, 'rgba(110,190,255,.9)'); g.addColorStop(0.5, 'rgba(60,150,255,.38)'); } g.addColorStop(1, 'rgba(60,150,255,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(gx - R, gy - R, 2 * R, 2 * R); ctx.restore();
    };
    half(-1, on); half(1, !on);
    const ex = Math.abs(ux) * hl + Math.abs(px) * hw + 3, ey = Math.abs(uy) * hl + Math.abs(py) * hw + 3;
    return [x - ex, y - ey - h - 3, x + ex, y + ey];
  }

  // ---- the crew of a running intervention: firefighters in reflective jackets busy in the whole space between the
  // engine and the place: each runs from one spot to the next and stands there a moment, on its own beat. The spots
  // are picked at random at the engine, at the place and anywhere on the way between them (with a few metres to the
  // sides), never on a house. Five to nine of them for each vehicle on the spot (six vehicles at most count). With
  // two engines drawn every other one belongs to the second engine and runs between that one and the place.
  // Nothing is remembered: where each one is follows from the time alone.
  const rnd = (a, b) => { const q = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return q - Math.floor(q); };
  const crewSize = o => {
    const cars = Math.max(1, Math.min(6, carsOf(o)));
    let n = 0; for (let c = 0; c < cars; c++) n += 5 + Math.floor(rnd(o.id % 991, c + 1) * 5);
    return n;
  };
  const spots = new Map(); // "id|man|round|where the engines stand" -> [X, Y] (image points)
  const groundDir = Q => { const gn = Math.hypot(Q.ux, 2 * Q.uy) || 1; return [Q.ux / gn, (2 * Q.uy) / gn]; }; // the engine's direction on the ground
  // is the image point under the engine Q as it is drawn (2.3 times its size)?
  const under = (Q, X, Y) => { const [qx, qy] = groundDir(Q), gx = (X - Q.X) / A, gy = (2 * (Y - Q.Y)) / A; return Math.abs(gx * qx + gy * qy) < 10.5 && Math.abs(gy * qx - gx * qy) < 3.6; };
  function spot(o, i, n) {
    const key = `${o.id}|${i}|${n}|${o.parkSig}`;
    let e = spots.get(key);
    if (e) return e;
    const P = o.park2 && i % 2 ? o.park2 : o.park, dx = (o.X - P.X) / A, dy = (2 * (o.Y - P.Y)) / A, L = Math.hypot(dx, dy) || 1; // engine -> place, ground metres
    const wide = Math.max(5, Math.min(12, L * 0.35));
    const [ex, ey] = groundDir(P);
    // (gx, gy: metres from the engine) free ground: no house, not under an engine, and with a hose at work not in
    // the water: within 3 m of the line from the one who holds it to the place (so the stream is seen)
    const hz = hosed(o) ? hoseOf(o) : null;
    const wet = (X, Y) => {
      if (!hz) return false;
      const ax = hz.X / A, ay = (2 * hz.Y) / A, vx = o.X / A - ax, vy = (2 * o.Y) / A - ay, qx = X / A - ax, qy = (2 * Y) / A - ay;
      const u = Math.max(0, Math.min(1, (qx * vx + qy * vy) / (vx * vx + vy * vy || 1)));
      return Math.hypot(qx - vx * u, qy - vy * u) < 3;
    };
    const ok = (gx, gy) => { const X = P.X + gx * A, Y = P.Y + (gy * A) / 2; return !under(o.park, X, Y) && !(o.park2 && under(o.park2, X, Y)) && !wet(X, Y) && !blocked(X, Y); };
    for (let k = 0; k < 12 && !e; k++) {
      const r1 = k < 8 ? rnd(i + k * 17, n) : 0, r2 = rnd(n + 5, i + k * 13), r3 = rnd(i + 11 + k, n + 3);
      let gx, gy;
      if (r1 < 0.33) { const ang = r3 * 6.283, rr = (k < 8 ? 6 : 9) + r2 * 9; gx = Math.cos(ang) * rr; gy = Math.sin(ang) * rr; } // around the engine
      else if (r1 < 0.66) { const ang = r3 * 6.283, rr = 2 + r2 * 12; gx = dx + Math.cos(ang) * rr; gy = dy + Math.sin(ang) * rr; } // around the place
      else { const along = 0.15 + r2 * 0.7, side = (r3 * 2 - 1) * wide; gx = dx * along - (dy / L) * side; gy = dy * along + (dx / L) * side; } // on the way
      if (ok(gx, gy)) e = [P.X + gx * A, P.Y + (gy * A) / 2];
    }
    e ||= [P.X + (ex * (rnd(i, n) * 2 - 1) * 9 - ey * 5) * A, P.Y + ((ey * (rnd(i, n) * 2 - 1) * 9 + ex * 5) * A) / 2]; // houses all around: along the side of the engine
    if (spots.size > 900) for (const k of spots.keys()) { spots.delete(k); if (spots.size <= 600) break; } // (the oldest rounds go; all at once would have every man look for his spots again in one frame)
    spots.set(key, e);
    return e;
  }
  function crewOf(o, t) {
    const out = [], N = crewSize(o);
    for (let i = 0; i < N; i++) {
      const T = 5000 + rnd(o.id % 997, i) * 5000, c = t / T + rnd(i, 3) * 7, n = Math.floor(c), f = c - n;
      const [ax, ay] = spot(o, i, n), [bx, by] = spot(o, i, n + 1);
      const u = Math.min(1, f / 0.78); // the run, then a moment on the spot
      out.push({ X: ax + (bx - ax) * u, Y: ay + (by - ay) * u, moving: u < 1, face: bx >= ax ? 1 : -1, i });
    }
    return out;
  }
  // ---- the hose of a fire that is still being fought (the firefighters work on the spot or have it under control;
  // not on the way yet, not the finishing works after it is out, not leaving): from the first engine over the ground
  // to a firefighter who stands to the side of the place as the screen shows it (left or right, the engine's side
  // first), some fourteen metres from it on free ground, seen side on, and sprays it in a high arc. The hose is
  // drawn only where no house stands in front of it.
  const hosed = o => o.kind === 'pozar' && (o.stav === 420 || o.stav === 430);
  const hoses = new Map(); // "id|where the engines stand" -> { X, Y: the man (image points), end: where the hose leaves the ground behind him, runs: [[X, Y, …], …] the seen parts of the hose } or null
  const arcH = d => Math.max(10, d * 0.45); // how high over the straight line the water flies (screen px)
  function hoseOf(o) {
    const key = `${o.id}|${o.parkSig}`;
    let h = hoses.get(key);
    if (h !== undefined) return h;
    const P = o.park, px = P.X / A, py = (2 * P.Y) / A, fx = o.X / A, fy = (2 * o.Y) / A; // ground metres: the engine, the place
    // (free ground where he is seen: no house, not under an engine and not behind its body, which stands 4.6 m up the screen)
    const behind = (Q, X, Y) => under(Q, X, Y) || under(Q, X, Y + 2.3 * A) || under(Q, X, Y + 4.6 * A);
    const clear = (gx, gy) => { const X = gx * A, Y = (gy * A) / 2; return !behind(o.park, X, Y) && !(o.park2 && behind(o.park2, X, Y)) && !blocked(X, Y); };
    const a0 = px >= fx ? 0 : Math.PI;
    let man = null, hid = null;
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) for (const a1 of k === 4 ? [a0] : [a0, a0 + Math.PI]) for (const r of [14, 16, 12, 10, 18, 8]) {
      const a = a1 + (k * Math.PI) / 8, cx = Math.cos(a) * r, cy = Math.sin(a) * r;
      if (man || !clear(fx + cx, fy + cy)) continue;
      if (cy < 0 && Math.abs(cx) < 0.6 * -cy) hid ||= [fx + cx, fy + cy]; else man = [fx + cx, fy + cy];
    }
    man ||= hid;
    h = null;
    if (man) {
      // from the end or the side of the engine that is nearer to him, in a lazy wave, bowed towards the bottom of the
      // screen: it often runs the same way as the water, which rises up the screen, and the two must not blend
      const [ex, ey] = groundDir(P);
      const from = [[px - ex * 9.6, py - ey * 9.6], [px - ex * 3 - ey * 2.9, py - ey * 3 + ex * 2.9], [px - ex * 3 + ey * 2.9, py - ey * 3 - ex * 2.9]]
        .sort((p, q) => Math.hypot(p[0] - man[0], p[1] - man[1]) - Math.hypot(q[0] - man[0], q[1] - man[1]))[0];
      const end = [man[0] + (man[0] >= fx ? 1.1 : -1.1), man[1]]; // (a step behind his back: from there it rises to his hands)
      const dx = end[0] - from[0], dy = end[1] - from[1], L = Math.hypot(dx, dy) || 1, n = Math.max(4, Math.ceil(L / 1.5));
      const amp = Math.min(2.2, L * 0.1), w = 1 + rnd(o.id % 97, 5), ph = rnd(o.id % 89, 7) * 6.283, bow = Math.min(5, L * 0.25) * (dx >= 0 ? 1 : -1);
      const runs = []; let run = null;
      for (let i = 0; i <= n; i++) {
        const u = i / n, side = Math.sin(Math.PI * u) * (bow + amp * Math.sin(2 * Math.PI * w * u + ph));
        const X = (from[0] + dx * u - (dy / L) * side) * A, Y = ((from[1] + dy * u + (dx / L) * side) * A) / 2;
        if (blocked(X, Y)) { run = null; continue; }
        if (!run) runs.push(run = []);
        run.push(X, Y);
      }
      h = { X: man[0] * A, Y: (man[1] * A) / 2, end: [end[0] * A, (end[1] * A) / 2], runs: runs.filter(r => r.length >= 4) };
    }
    if (hoses.size > 60) hoses.clear();
    hoses.set(key, h);
    return h;
  }
  // the water from the nozzle (x0, y0) to the place (x1, y1): drops running along an arc, scattered wider towards its
  // end, over a faint blue stream so it reads on a light wall too; a splash where it falls
  const WATER = ['#ffffff', '#cfeaff', '#8fd0ff'];
  function water(ctx, x0, y0, x1, y1, u, t, seed) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy), H = arcH(d), n = Math.max(12, Math.min(56, Math.round(d / 1.8)));
    const at = f => [x0 + dx * f, y0 + dy * f - H * 4 * f * (1 - f)];
    ctx.save();
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const [w, col, end] of [[u + 2, 'rgba(36,96,176,.6)', 12], [Math.max(1, u - 1), 'rgba(205,236,255,.95)', 8]]) { // (the bright core: the first two thirds, then it breaks into drops)
      ctx.lineWidth = w; ctx.strokeStyle = col;
      ctx.beginPath(); for (let i = 0; i <= end; i++) { const [px, py] = at(i / 12); ctx.lineTo(px, py); } ctx.stroke();
    }
    for (let i = 0; i < n; i++) {
      const f = (i / n + t / 650) % 1, [px, py] = at(f), sc = (0.4 + 2.2 * f) * u * 0.5, sz = f < 0.4 ? u : u + 1;
      ctx.fillStyle = WATER[i % 3];
      ctx.fillRect(Math.round(px + (rnd(i, seed % 89) * 2 - 1) * sc * 0.6 - sz / 2), Math.round(py + (rnd(seed % 83, i) * 2 - 1) * sc - sz / 2), sz, sz);
    }
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.ellipse(x1, y1, 3.5 * u, 1.8 * u, 0, 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k < 7; k++) {
      const f = (t / 520 + k / 7) % 1;
      ctx.fillStyle = WATER[k % 3];
      ctx.fillRect(Math.round(x1 + (rnd(k, 3) * 2 - 1) * (1.5 + 3 * f) * u), Math.round(y1 - Math.sin(f * Math.PI) * (2 + rnd(k, 5) * 3) * u), u, u);
    }
    ctx.restore();
  }
  // a firefighter, 3 × 7 units like the people of the map (src/people.js): dark trousers with a reflective cuff, a
  // yellow-green jacket with a silver band, a helmet (white, every third one red: the commander).
  // (c.hose: the one with the hose. It rises from the ground behind him (c.tail) to his hip and on to his hands, his
  // arm lies over it; in his hands the nozzle, a black spike that points the way the water leaves for c.aim.
  // Returns the tip of the nozzle.)
  function fireman(ctx, x, y, u, c, t) {
    const top = y - 7 * u, step = c.moving ? Math.floor((t + c.i * 97) / 130) % 2 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - u, y, 3 * u, u);
    ctx.fillStyle = '#232b3f';
    if (step) { ctx.fillRect(x - u, y - 2 * u, u, 2 * u); ctx.fillRect(x + u, y - u, u, u); } else { ctx.fillRect(x - u, y - u, u, u); ctx.fillRect(x + u, y - 2 * u, u, 2 * u); }
    ctx.fillStyle = '#d9f032'; ctx.fillRect(x - u, top + 2 * u, 3 * u, 3 * u); // the jacket
    ctx.fillStyle = '#eef3f6'; ctx.fillRect(x - u, top + 3 * u, 3 * u, Math.max(1, Math.round(u / 2))); // its band
    ctx.fillStyle = '#e9b98f'; ctx.fillRect(x, top + u, u, u); // face
    ctx.fillStyle = c.i % 3 === 0 ? '#d8362a' : '#f6f6f0'; ctx.fillRect(x - (c.face > 0 ? u : 0), top, 2 * u, u); ctx.fillRect(x, top - Math.max(1, Math.round(u / 2)), u, Math.max(1, Math.round(u / 2))); // helmet with a brim to the back
    if (!c.hose) return null;
    const f = c.face > 0 ? 1 : -1, hx = f > 0 ? x + 3 * u : x - 2 * u, hy = top + 3.5 * u; // his hands
    if (c.tail) {
      ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
      for (const [w, col] of [[u + 2, 'rgba(22,29,43,.85)'], [u, '#efe7cf']]) {
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath();
        ctx.moveTo(c.tail[0], c.tail[1]); ctx.lineTo(f > 0 ? x - 1.5 * u : x + 2.5 * u, top + 4.7 * u); ctx.lineTo(hx - f * 0.5 * u, hy + 0.7 * u); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = '#d9f032'; ctx.fillRect(f > 0 ? x + 2 * u : x - 2 * u, top + 3 * u, u, u); // the arm
    let dx = f, dy = -1;
    if (c.aim) { dx = c.aim[0] - hx; dy = c.aim[1] - hy; dy -= 4 * arcH(Math.hypot(dx, dy)); } // (the way the arc starts, see water)
    const l = Math.hypot(dx, dy) || 1, st = 0.8 * u; dx /= l; dy /= l;
    ctx.fillStyle = '#11151c'; // the nozzle: six squares, thinner towards the tip
    [u + 1, u + 1, u, u, Math.max(1, u - 1), Math.max(1, u - 1)].forEach((q, i) => ctx.fillRect(Math.round(hx + dx * st * i - q / 2), Math.round(hy + dy * st * i - q / 2), q, q));
    return [hx + dx * st * 5.5, hy + dy * st * 5.5];
  }
  function draw(ctx, v, t = 0) {
    hits = []; wanted = Date.now();
    if (!loading) { load(); return; }
    if (!D.items.length && range !== 'w') return;
    positions();
    const alpha = ctx.globalAlpha, m = v.k * A, near = m >= NEAR;
    const items = list();
    if (range === 'w') { // the week: the signs of finished ones; in a crowd the newest win the place (ctx.__claim, the
      // older give way), the running ones as always over them
      weekPositions();
      const now = Date.now(), l = weekList().sort((a, b) => b.t - a.t);
      for (const o of l) {
        if (o.X == null) [o.X, o.Y] = llToImg(o.lon, o.lat);
        const x = Math.round(v.ox + o.X * v.k), y = Math.round(v.oy + o.Y * v.k);
        if (!onScreen(ctx, x, y, 60)) continue;
        if (ctx.__claim && !ctx.__claim(x - 14, y - 28, x + 14, y + 2, false)) continue;
        ctx.globalAlpha = alpha * (0.9 - Math.min(0.35, ((now - o.t) / 6048e5) * 0.35)); // (a week old: paler)
        hits.unshift([...sign(ctx, x, y, o.kind, true, 1, 2), o]);
      }
      ctx.globalAlpha = alpha;
    }
    if (near && items.some(isOpen)) { if (!roads().length) needRoads(); park(o => o.X != null && onScreen(ctx, v.ox + o.X * v.k, v.oy + o.Y * v.k, 300)); }
    // the finished ones first, the running ones over them
    for (const live of [false, true]) {
      for (const o of items) {
        if (isOpen(o) !== live || o.X == null) continue;
        const x = Math.round(v.ox + o.X * v.k), y = Math.round(v.oy + o.Y * v.k);
        if (!onScreen(ctx, x, y, 120)) continue;
        if (!live) {
          if (range === 'w') continue; // (the week draws them as dots)
          if (v.z < 0.3 && !ctx.__hl) continue; // (the whole city in view: only the running ones; the finished come closer in, or highlighted)
          if (ctx.__claim && !ctx.__claim(x - 14, y - 28, x + 14, y + 2, false)) continue;
          ctx.globalAlpha = alpha * 0.9;
          hits.push([...sign(ctx, x, y, o.kind, true, 1, 2), o]); // (22 px: smaller than a running one)
          continue;
        }
        ctx.globalAlpha = alpha;
        if (ctx.__claim) ctx.__claim(x - (near ? 17 : 14), y - (near ? 34 : 30), x + (near ? 17 : 14), y + 2, true); // (a running one is never folded under other icons)
        let top = y, jet = null; // (jet: the nozzle of the hose on the screen and the size of a drop)
        if (near && o.park) {
          // the engine on its spot near the place, the ripples around it
          const big = Math.max(m * 2.3, 6), em = big * (o.fix ? o.fix.size : 1);
          const E = [{ p: o.park, x: v.ox + o.park.X * v.k, y: v.oy + o.park.Y * v.k, t, seed: o.id % 1000 }];
          // the second engine (its lights on another beat). Farther out the engines are drawn bigger than the ground
          // they stand on (big): the step between the two grows with them, so they stay clear of each other
          if (o.park2) { const g = (big / (m * 2.3)) * v.k; E.push({ p: o.park2, x: E[0].x + (o.park2.X - o.park.X) * g, y: E[0].y + (o.park2.Y - o.park.Y) * g, t: t + 120, seed: (o.id + 500) % 1000 }); }
          for (const e of E) beacon(ctx, e.x, e.y, t, RED, 26 + em * 4, e.seed);
          const fu = Math.max(2, Math.round((1.8 * em) / 7 / 1.3));
          const crew = crewOf(o, t), hz = hosed(o) ? hoseOf(o) : null;
          if (hz) { // the hose on the ground, under everybody; the one who holds it faces the place
            ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
            for (const [w, col] of [[fu + 3, 'rgba(22,29,43,.8)'], [fu, '#efe7cf']]) {
              ctx.lineWidth = w; ctx.strokeStyle = col;
              for (const r of hz.runs) { ctx.beginPath(); for (let i = 0; i < r.length; i += 2) ctx.lineTo(v.ox + r[i] * v.k, v.oy + r[i + 1] * v.k); ctx.stroke(); }
            }
            ctx.restore();
            crew.push({ X: hz.X, Y: hz.Y, moving: false, face: o.X >= hz.X ? 1 : -1, i: 1, hose: true, tail: [v.ox + hz.end[0] * v.k, v.oy + hz.end[1] * v.k], aim: [x, y] });
          }
          // the crew and the engines from the back to the front: who stands behind an engine is covered by it
          const men = crew.map(c => ({ ...c, x: Math.round(v.ox + c.X * v.k), y: Math.round(v.oy + c.Y * v.k) })).sort((a, b) => a.y - b.y);
          E.sort((a, b) => a.y - b.y);
          let j = 0;
          const man = c => { const n = fireman(ctx, c.x, c.y, fu, c, t); if (n) jet = [n[0], n[1], fu]; };
          for (const e of E) {
            for (; j < men.length && men[j].y < e.y; j++) man(men[j]);
            hits.push([...engine(ctx, e.x, e.y, e.p.ux, e.p.uy, em, e.t), o]);
          }
          for (; j < men.length; j++) man(men[j]);
        }
        // the sign of the kind stays on the place itself
        if (!(near && o.park)) beacon(ctx, x, y, t, RED, near ? 26 : 20, o.id % 1000);
        const ss = o.fix ? Math.round(3 * o.fix.size * 1.3) : near ? 2 : 1;
        if (jet) water(ctx, jet[0], jet[1], x, y, jet[2], t, o.id);
        const bx = sign(ctx, x, y, o.kind, false, ss, o.fix ? 0 : near ? 0 : 4);
        hits.push([...bx, o]); top = bx[1];
        tag(ctx, x, top - 2, (KINDS[o.kind] || KINDS.jine).tag, o.fix && ss / 3 > 1 ? ss / 3 : 1);
      }
    }
    ctx.globalAlpha = alpha;
  }
  const at = (sx, sy) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]) return h[4]; } return null; };
  const weekPts = () => { weekPositions(); return weekList().map(o => (o.X == null ? llToImg(o.lon, o.lat) : [o.X, o.Y])); };
  const api = { load, draw, at, list, isOpen, positions, refresh: fetchNow, data: D, setRange, range: () => range, loadWeek, weekList, weekPts, weekSummary };
  return api;
}

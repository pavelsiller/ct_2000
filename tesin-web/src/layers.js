// Map layers fed from data in lon/lat: live traffic, public transport (timetable) and
// city projects. A small elevation grid places them correctly on the hilly map in every rotation.
import { fetchTraffic } from './live.js';
import { level, isLive } from './nehodyted.js';
import { createMhd } from './mhd.js';
import { createMhdLive } from './mhdlive.js';
import { hatchPattern as behindHatch } from './hatch.js';
import { setBadgeSink, drawBadge, delayColor } from './vehicles.js';
import { carBatch, drawTransit, pickKind, setLength, CAR_COLORS, VAN_COLORS, TRUCK_CABS, SIZE, FAR_K } from './vehicles.js';
import { deadRoads } from './deadroads.js';
import { makeCrew, drawCrew, crewSpots, hash } from './workers.js';
const TOUCH = matchMedia('(pointer: coarse)').matches || /[?&]touch\b/.test(location.search); // phones and tablets: fingers, not a mouse (?touch: to see it on a desktop)
// the phone layout of the page (style.css, up to 640 px): the vehicles, their line badges and delay dots are drawn bigger
// there as on a touch screen, also in a narrowed desktop window (checked on every frame, so resizing shows it at once)
const PHONE = matchMedia('(max-width: 640px)');
const bigUi = () => TOUCH || PHONE.matches;
import { fetchData, watchFeed, RELOAD } from './feed.js';
import { inMap, itemInMap, shapeInMap, clipLine } from './extent.js';

// lite: a slow device (see main.js): no tests of what hides behind a building, solid lines instead of dashes, plain fills
// instead of patterns, the vehicles of the view only. T / tick: the parts of draw() timed for src/bench.js.
export function createLayers({ base, GEO, rotation, state, routes, lite = () => false, T = (n, f) => f(), tick = () => {} }) {
  const KX = Math.cos((GEO.LAT0 * Math.PI) / 180) * 111320, KY = 110574;
  let dem = null;
  fetch(`${base}data/dem.json`).then(r => r.json()).then(d => {
    const raw = atob(d.d), a = new Int16Array(raw.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = (raw.charCodeAt(2 * i) | (raw.charCodeAt(2 * i + 1) << 8)) << 16 >> 16;
    dem = { n: d.n, step: d.step, r: d.r, a };
    stamp++;
  });
  const elevAt = (x, y) => {
    if (!dem) return 250;
    let fx = (x + dem.r) / dem.step, fy = (dem.r - y) / dem.step;
    fx = Math.max(0, Math.min(dem.n - 1.001, fx)); fy = Math.max(0, Math.min(dem.n - 1.001, fy));
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * dem.n + i, A = dem.a;
    return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + dem.n] * (1 - u) + A[k + dem.n + 1] * u) * v;
  };
  const rotXY = (x, y) => { const r = rotation(); return r === 0 ? [x, y] : r === 1 ? [-y, x] : r === 2 ? [-x, -y] : [y, -x]; };
  const llToImg = (lon, lat) => {
    const x = (lon - GEO.LON0) * KX, y = (lat - GEO.LAT0) * KY;
    const z = elevAt(x, y);
    const [u, w] = rotXY(x, y);
    return [(u + GEO.R) * GEO.A, ((GEO.R - w) * GEO.A) / 2 - (z - GEO.Z0) * GEO.V + GEO.TOP];
  };
  let stamp = 0; // changes when the rotation, the elevation grid or a location correction changes: every position is recomputed
  // (A file of one layer arriving only invalidates that layer (its imgStamp = -1) and counts in dataV, which the page reads
  // for what is built from several layers (the tags of the projects). It used to bump stamp, and each of the eight files
  // at the start then recomputed every layer — the projects alone took tens of ms in one frame.)
  let dataV = 0;
  let lastRot = -1;
  const fresh = () => { if (lastRot !== rotation()) { lastRot = rotation(); stamp++; } return stamp; };

  // Nehody teď: one sign per accident (src/nehodyted.js), its look by how sure it is: one driver (pale, small, only close
  // up like the other reports), more drivers (orange), the firefighters went there (red, bigger, at any zoom). An accident
  // of the firefighters is left to their own sign when their layer is on. Drawn with the icons (main.js fx.top), so the
  // beacons of the highlight "dnešní nehody" do not cover it; highlighted (hl): a fixed size, those over a little paler.
  function drawAccidents(ctx, v, hl) {
    if (!state.layers.jams || !traffic.data) return;
    const T = trafficImg();
    if (!T) return;
    const W = ctx.canvas.width, H = ctx.canvas.height; // (device px: enough for the bounds, and no layout read in a frame)
    const s = Math.max(5, Math.min(10, v.z * 7)), a0 = ctx.globalAlpha;
    for (const c of liveAccidents(T)) {
      const L = level(c), on = !liveAll || isLive(c, liveAt);
      if (L === 1 && v.z < ALERT_Z && !liveAll) continue;
      if (c.h && state.layers.hasici && on) continue;
      const x = v.ox + c.X * v.k, y = v.oy + c.Y * v.k;
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const r = hl ? (L === 3 ? 12 : 10) : s * (L === 3 ? 1.25 : L === 2 ? 1.05 : 0.85);
      ctx.globalAlpha = a0 * (!on ? (hl ? 0.8 : 0.5) : L === 1 ? 0.85 : 1); // (over: paler)
      ctx.fillStyle = L === 3 ? '#d8342c' : L === 2 ? '#f08a3c' : '#f2b36d';
      ctx.strokeStyle = '#161d2b'; ctx.lineWidth = L === 1 && !hl ? 1.5 : 2;
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = L === 3 ? '#ffffff' : '#161d2b'; ctx.fillRect(x - 1, y - r * 0.45, 2, r * 0.65); ctx.fillRect(x - 1, y + r * 0.35, 2, 2);
    }
    ctx.globalAlpha = a0;
  }
  // ------------------------------------------------------------ traffic (live)
  // the accidents on the map now (the list is a minute old at most: checked against the clock, once a second); while
  // the highlight "dnešní nehody" is on (main.js FOCUS_KINDS nehody), all of today's, those over too
  let liveAt = 0, liveList = [], liveSrc = null, liveAll = false;
  const allToday = () => state.focus === 'nehody';
  const liveAccidents = T => { const now = Date.now(), all = allToday(); if (T.nehody !== liveSrc || all !== liveAll || now - liveAt > 1000) { liveSrc = T.nehody; liveAll = all; liveAt = now; liveList = all ? T.nehody : T.nehody.filter(c => isLive(c, now)); } return liveList; };
  const JAM_CARS_Z = 2 / 0.8; // v.z from which a jam is drawn as cars: 0.8 m per pixel (a car is about 7 px long); farther out it is a line
  const ALERT_Z = 2 / 14; // v.z at 14 m per pixel (m/px = 2 / v.z): accident icons and closures appear only closer than this
  let occluder = null; // (X, Y) -> is this image point hidden behind a building? (set by the page)
  const traffic = { data: null, img: null, imgStamp: -1, timer: null, status: '', onStatus: null };
  async function refreshTraffic() {
    try {
      traffic.data = await fetchTraffic();
      traffic.imgStamp = -1;
      const closed = traffic.data.alerts.filter(a => a.type === 'ROAD_CLOSED').length;
      const acc = ((traffic.data.nehody && traffic.data.nehody.items) || []).filter(c => isLive(c, traffic.data.at)).length; // (accidents, not reports: src/nehodyted.js)
      const t = new Date(traffic.data.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
      const sk = traffic.data.skipped || {};
      const nsk = (sk.closure || 0) + (sk.local || 0) + (sk.other || 0);
      // Czech plural: 1 kolona, 2–4 kolony, 5+ kolon; zero items are left out
      const pl = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
      const parts = [traffic.data.jams.length && pl(traffic.data.jams.length, 'kolona', 'kolony', 'kolon'), closed && pl(closed, 'uzavírka', 'uzavírky', 'uzavírek'), acc && pl(acc, 'nehoda', 'nehody', 'nehod')].filter(Boolean);
      traffic.status = `Doprava ${t}: ${parts.length ? parts.join(', ') : 'bez kolon a nehod'}${nsk ? ` (${nsk} nevěrohodných hlášení skryto)` : ''}`;
      traffic.tip = nsk ? `Skrytá hlášení kolon z Waze: ${sk.closure || 0} jsou ve skutečnosti uzavírky, ${sk.local || 0} krátká zdržení v klidných ulicích, ${sk.other || 0} bez zdržení nebo mimo silnice.` : '';
    } catch { traffic.status = 'Živá doprava se teď nenačetla, zkusím to znovu.'; }
    traffic.onStatus && traffic.onStatus(traffic.status);
  }
  function trafficImg() {
    if (!traffic.data) return null;
    if (traffic.imgStamp !== fresh()) {
      traffic.img = {
        jams: traffic.data.jams.map(j => { const pts = j.path.flatMap(([lon, lat]) => llToImg(lon, lat)); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); } return { ...j, pts, bb: [x0, y0, x1, y1] }; }),
        alerts: traffic.data.alerts.map(a => { const [X, Y] = llToImg(a.lon, a.lat); return { ...a, X, Y }; }),
        nehody: ((traffic.data.nehody && traffic.data.nehody.items) || []).map(c => { const [X, Y] = llToImg(c.lon, c.lat); return { ...c, X, Y }; }),
      };
      traffic.imgStamp = stamp;
      // cells covered by a jam: free-flowing cars are not drawn there
      const grid = new Set(), C = 24;
      for (const j of traffic.img.jams) {
        for (let i = 0; i + 3 < j.pts.length; i += 2) {
          const ax = j.pts[i], ay = j.pts[i + 1], bx = j.pts[i + 2], by = j.pts[i + 3];
          const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (C / 2)) + 1;
          for (let q = 0; q <= n; q++) grid.add(`${Math.floor((ax + ((bx - ax) * q) / n) / C)}_${Math.floor((ay + ((by - ay) * q) / n) / C)}`);
        }
      }
      traffic.grid = grid;
    }
    return traffic.img;
  }
  const WC = 32; // grid cell in image px (= metres)
  let wideGrid = null, wideSrc = null;
  const wideRoads = () => {
    const R = routes ? routes() : null;
    if (!R || !R.length) return null;
    if (wideSrc !== R) {
      wideSrc = R; wideGrid = new Map();
      for (const r of R) {
        if (!r[3]) continue;
        const p = r[1], seg = { w: r[3], ow: r[2] || 0 };
        for (let i = 0; i + 3 < p.length; i += 2) {
          const sg = [p[i], p[i + 1], p[i + 2], p[i + 3], seg];
          const x0 = Math.floor((Math.min(p[i], p[i + 2]) - 20) / WC), x1 = Math.floor((Math.max(p[i], p[i + 2]) + 20) / WC);
          const y0 = Math.floor((Math.min(p[i + 1], p[i + 3]) - 20) / WC), y1 = Math.floor((Math.max(p[i + 1], p[i + 3]) + 20) / WC);
          for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
            const k = `${gx}_${gy}`;
            const a = wideGrid.get(k); if (a) a.push(sg); else wideGrid.set(k, [sg]);
          }
        }
      }
    }
    return wideGrid;
  };
  // 0 = one row there; 1 = two lanes this way on a two-way road; 2 = two lanes on a one-way road (the point X, Y with
  // the direction of travel dx, dy, both in image px of the current rotation)
  const wideAt = (grid, X, Y, dx, dy) => {
    const cell = grid.get(`${Math.floor(X / WC)}_${Math.floor(Y / WC)}`);
    if (!cell) return 0;
    let best = 0, bd = 16 * GEO.A; // within 16 m of the road axis (the Waze line and the OSM line are drawn apart)
    for (const [ax, ay, bx, by, seg] of cell) {
      const ex = bx - ax, ey = by - ay, L = Math.hypot(ex, ey) || 1;
      const cos = (ex * dx + ey * dy) / L;
      if (Math.abs(cos) < 0.8) continue; // not the same road direction
      const t = Math.max(0, Math.min(1, ((X - ax) * ex + (Y - ay) * ey) / (L * L)));
      const d = Math.hypot(ax + ex * t - X, ay + ey * t - Y);
      if (d >= bd) continue;
      const w = cos > 0 ? seg.w & 1 : seg.w & 2;
      bd = d; best = w ? (seg.ow ? 2 : 1) : 0;
    }
    return best;
  };
  // the lanes of a whole jam: two rows only when nearly the whole stretch runs on a known two-lane road
  const jamWide = j => {
    const grid = wideRoads();
    if (!grid) return 0;
    if (j.wideG === grid) return j.wide;
    let n = 0, hits = 0, ow = 0;
    const step = 20 * GEO.A;
    for (let i = 0; i + 3 < j.pts.length; i += 2) {
      const ax = j.pts[i], ay = j.pts[i + 1], ex = j.pts[i + 2] - ax, ey = j.pts[i + 3] - ay, L = Math.hypot(ex, ey) || 1;
      const dx = ex / L, dy = ey / L, m = Math.max(1, Math.round(L / step));
      for (let q = 0; q < m; q++) {
        const f = (q + 0.5) / m, w = wideAt(grid, ax + ex * f, ay + ey * f, dx, dy);
        n++; if (w) { hits++; if (w === 2) ow++; }
      }
    }
    j.wideG = grid;
    j.wide = n && hits >= 0.8 * n ? (ow * 2 > hits ? 2 : 1) : 0;
    return j.wide;
  };
  // ------------------------------------------------------------ road closures
  // The queue of one jam, laid out once (the cars, their kinds and colours do not change from frame to frame, the
  // queue only creeps along by `shift`): j.rows = the lanes, each with the cars' centres along the line (at, in
  // image px, rising), their kinds and colours; j.step = the length the creeping repeats after.
  const jamBatch = carBatch();
  function jamRows(j) {
    j.cum = [0]; for (let i = 2; i < j.pts.length; i += 2) j.cum.push(j.cum[j.cum.length - 1] + Math.hypot(j.pts[i] - j.pts[i - 2], j.pts[i + 1] - j.pts[i - 1]));
    const total = j.cum[j.cum.length - 1];
    const gap = (j.level >= 5 ? 1.2 : j.level === 4 ? 2 : j.level === 3 ? 4 : 7) * GEO.A;
    j.step = SIZE.car[0] * GEO.A + gap;
    let seed = (j.t % 9973) | 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const pal = j.level >= 4 ? ['#d8342c', '#d8342c', '#b5241f', '#e5533a'] : j.level === 3 ? ['#d8342c', '#f08a3c', '#e5533a', '#f08a3c'] : ['#f08a3c', '#f3c868', '#e5533a', '#f3c868'];
    // Waze road types 3 freeway, 4 ramp, 6 major highway count as big roads; lorries only there and outside the centre
    const mid = j.path[Math.floor(j.path.length / 2)];
    const dist = Math.hypot((mid[0] - 16.608) * 72765, (mid[1] - 49.195) * 110574);
    const roadClass = [3, 4, 6].includes(j.road) ? 3 : 1;
    // two rows of cars only where OSM knows two or more lanes in this direction (jamWide); on a one-way road
    // they sit either side of the axis, on a two-way road both in the right-hand half. Otherwise a single row.
    const wide = jamWide(j);
    const lanes = wide === 2 ? [-1.75, 1.75] : wide ? [1.8, 5.2] : [1.8];
    j.rows = lanes.map((lane, li) => {
      const row = { lane, at: [], kind: [], col: [] };
      for (let s = li * (SIZE.car[0] * 0.55) * GEO.A; s < total;) {
        const kind = pickKind(rnd(), roadClass, dist);
        const len = SIZE[kind][0] * GEO.A;
        if (s + len / 2 > total) break;
        row.at.push(s + len / 2); row.kind.push(kind); row.col.push(pal[Math.floor(rnd() * pal.length)]);
        s += len + gap * (li ? 1.3 : 1);
      }
      return row;
    });
  }
  const clos = { data: null, img: null, imgStamp: -1, grid: null };
  const loadClosures = init => fetchData(`${base}data/closures.json`, init).then(r => r.json()).then(d => { d.items = (d.items || []).flatMap(c => { const parts = clipLine(c.p); return parts.length === 1 && parts[0] === c.p ? [c] : parts.map(p => ({ ...c, p })); }); /* (cut to the map, src/extent.js) */ clos.data = d; clos.imgStamp = -1; dataV++; }).catch(() => {});
  loadClosures(); watchFeed('closures.json', () => loadClosures(RELOAD));
  function closuresImg() {
    if (!clos.data) return null;
    if (clos.imgStamp !== fresh()) {
      clos.img = clos.data.items.map(c => {
        const pts = [];
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < c.p.length; i += 2) { const [X, Y] = llToImg(c.p[i], c.p[i + 1]); pts.push(X, Y); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
        return { ...c, pts, bb: [x0, y0, x1, y1] };
      });
      const grid = new Set(), C = 24, buf = 70 * GEO.A; // no free-flowing cars on and near a closed section
      const mark = (X, Y, r) => { for (let gx = Math.floor((X - r) / C); gx <= Math.floor((X + r) / C); gx++) for (let gy = Math.floor((Y - r / 2) / C); gy <= Math.floor((Y + r / 2) / C); gy++) grid.add(`${gx}_${gy}`); };
      for (const c of clos.img) for (let i = 0; i + 1 < c.pts.length; i += 2) {
        mark(c.pts[i], c.pts[i + 1], i === 0 || i === c.pts.length - 2 ? buf : 12);
        if (i + 3 < c.pts.length) { const n = Math.ceil(Math.hypot(c.pts[i + 2] - c.pts[i], c.pts[i + 3] - c.pts[i + 1]) / 10); for (let q = 1; q < n; q++) mark(c.pts[i] + ((c.pts[i + 2] - c.pts[i]) * q) / n, c.pts[i + 1] + ((c.pts[i + 3] - c.pts[i + 1]) * q) / n, 12); }
      }
      clos.grid = grid;
      clos.imgStamp = stamp;
    }
    return clos.img;
  }
  const inJam = (X, Y) => {
    const k = `${Math.floor(X / 24)}_${Math.floor(Y / 24)}`;
    if (state.layers.jams && traffic.grid && traffic.grid.has(k)) return true;
    if (state.layers.closures && closuresImg() && clos.grid.has(k)) return true;
    // live closure reports: keep cars away from the spot
    const T = state.layers.closures && traffic.img;
    if (T) for (const a of T.alerts) if (a.type === 'ROAD_CLOSED' && Math.abs(a.X - X) < 40 * GEO.A && Math.abs(a.Y - Y) < 20 * GEO.A) return true;
    return false;
  };
  const TRY_CLOSED = [];
  const dead = { at: -1e9, sig: '', list: null };
  function deadList() {
    const now = performance.now();
    if (now - dead.at > 3000) {
      dead.at = now;
      const rts = routes(), lines = [], points = [];
      if (rts.length) {
        if (state.layers.closures) {
          for (const c of closuresImg() || []) lines.push(c.pts);
          if (traffic.img) for (const a of traffic.img.alerts) if (a.type === 'ROAD_CLOSED') points.push([a.X, a.Y]);
        }
        if (state.layers.works) {
          for (const c of worksImg() || []) if (c.kind === 'uplna' && !c.soon) lines.push(...c.parts);
          for (const q of works.pts || []) if (/uzavřen/i.test(q.kind) && !q.planned) points.push(q.XY);
        }
        for (const [lat, lon] of TRY_CLOSED) points.push(llToImg(lon, lat));
        let sum = 0;
        for (const p of lines) sum += p.length + p[0] + p[p.length - 1];
        for (const p of points) sum += p[0] + p[1];
        const sig = `${fresh()}|${rts.length}|${lines.length}|${points.length}|${Math.round(sum)}`;
        if (sig !== dead.sig) { dead.sig = sig; dead.list = deadRoads(rts, lines, points, GEO.A); }
      }
    }
    return dead.list;
  }
  // "no entry" sign
  function noEntry(ctx, x, y, r, faint) {
    ctx.globalAlpha = faint ? 0.5 : 1;
    ctx.fillStyle = '#161d2b'; ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8342c'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - r * 0.65, y - r * 0.2, r * 1.3, r * 0.4);
    ctx.globalAlpha = 1;
  }
  function drawClosures(ctx, v, t, cw, ch) {
    const L = closuresImg();
    if (!L || v.z < ALERT_Z) return;
    ctx.save();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    const w = Math.max(1.5, Math.min(3.5, v.z * 2)); // (a quiet line: half of what it was)
    for (const c of L) {
      if (c.bb[2] * v.k + v.ox < -20 || c.bb[0] * v.k + v.ox > cw + 20 || c.bb[3] * v.k + v.oy < -20 || c.bb[1] * v.k + v.oy > ch + 20) continue;
      const path = () => { ctx.beginPath(); for (let i = 0; i < c.pts.length; i += 2) { const x = v.ox + c.pts[i] * v.k, y = v.oy + c.pts[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } };
      // barrier tape: red and white stripes over a dark edge (a tunnel shows thinner, it is underground)
      const ww = c.tunnel ? w * 0.7 : w;
      if (lite()) { ctx.setLineDash([]); ctx.strokeStyle = '#d8342c'; ctx.lineWidth = ww + 1; path(); ctx.stroke(); } // (a slow device: one solid red line)
      else {
        ctx.setLineDash([]); ctx.strokeStyle = 'rgba(22,29,43,.85)'; ctx.lineWidth = ww + 2; path(); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = ww; path(); ctx.stroke();
        ctx.strokeStyle = '#d8342c'; ctx.setLineDash([ww * 1.6, ww * 1.6]); path(); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (v.z >= 1 && !(lite() && v.z < 1.5)) { // no-entry signs only from about 2 m per pixel, half the size they were (a slow device: closer)
        const r = Math.max(3, Math.min(5.5, v.z * 3.5));
        noEntry(ctx, v.ox + c.pts[0] * v.k, v.oy + c.pts[1] * v.k - r - 2, r);
        noEntry(ctx, v.ox + c.pts[c.pts.length - 2] * v.k, v.oy + c.pts[c.pts.length - 1] * v.k - r - 2, r);
      }
    }
    ctx.restore();
  }
  function closureAt(sx, sy, v) {
    const L = state.layers.closures && v.z >= ALERT_Z && closuresImg();
    if (!L) return null;
    const X = (sx - v.ox) / v.k, Y = (sy - v.oy) / v.k, tol = 9 / v.k; // (the box first: the pointer moves over the map all the time)
    for (const c of L) for (let i = 0; i + 3 < c.pts.length; i += 2) {
      if (c.bb && (X < c.bb[0] - tol || X > c.bb[2] + tol || Y < c.bb[1] - tol || Y > c.bb[3] + tol)) break;
      const ax = v.ox + c.pts[i] * v.k, ay = v.oy + c.pts[i + 1] * v.k, bx = v.ox + c.pts[i + 2] * v.k, by = v.oy + c.pts[i + 3] * v.k;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const tt = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / L2));
      if (Math.hypot(ax + dx * tt - sx, ay + dy * tt - sy) < 9) return { closure: c, source: clos.data.source };
    }
    return null;
  }

  const works = { data: null, img: null, pts: null, groups: null, imgStamp: -1, loading: false };
  let selWork = null; // the site whose card is open: its pieces are lit in the map
  const loadWorks = init => { works.loading = true; return fetchData(`${base}data/roadworks.json`, init).then(r => r.json()).then(d => { d.items = (d.items || []).filter(itemInMap).map(w => ({ ...w, p: w.p.flatMap(clipLine) })).filter(w => w.p.length); d.points = (d.points || []).filter(itemInMap); /* (cut to the map, src/extent.js) */ works.data = d; works.imgStamp = -1; dataV++; }).catch(() => {}).finally(() => { works.loading = false; }); };
  watchFeed('roadworks.json', () => (works.data ? loadWorks(RELOAD) : null));
  // today in Prague as 2026-11-15, looked at once a minute: a consent from a later day is "coming" (soon). The feed says
  // soon too, but only once a day, so a page left open over midnight would keep tomorrow's closure faint (audit 2026-11-15)
  const DAYF = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' });
  let dayAt = 0, dayStr = '';
  const pragueDay = () => { const t = Date.now(); if (t - dayAt > 60000) { dayAt = t; dayStr = DAYF.format(t); } return dayStr; };
  function worksImg() {
    if (!works.data) { if (!works.loading) loadWorks(); return null; }
    const today = pragueDay();
    if (works.imgStamp === fresh() && works.soonDay !== today) setSoon(today);
    if (works.imgStamp !== fresh()) {
      works.img = works.data.items.map(w => {
        const parts = w.p.map(l => { const pts = []; for (let i = 0; i < l.length; i += 2) pts.push(...llToImg(l[i], l[i + 1])); return pts; });
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of parts) for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
        return { ...w, parts, XY: llToImg(w.lon, w.lat), bb: [x0, y0, x1, y1] };
      });
      const groups = new Map();
      for (const c of works.img) {
        if (c.osm) continue;
        const k = `${c.n}|${c.from}|${c.to}|${c.inv || ''}`;
        let g = groups.get(k);
        if (!g) groups.set(k, (g = { key: k, items: [] }));
        g.items.push(c); c.g = g;
      }
      for (const g of groups.values()) {
        const pts = []; // [X, Y, the metres of line it stands for, dx, dy], one every ~8 m
        for (const c of g.items) for (const p of c.parts) for (let i = 0; i + 3 < p.length; i += 2) {
          const dx = p[i + 2] - p[i], dy = p[i + 3] - p[i + 1], len = Math.hypot(dx, dy * 2) / GEO.A, n = Math.max(1, Math.round(len / 8));
          for (let q = 0; q < n; q++) pts.push([p[i] + (dx * (q + 0.5)) / n, p[i + 1] + (dy * (q + 0.5)) / n, len / n, dx, dy]);
        }
        let best = null, bs = -1;
        for (const a of pts) { let sum = 0; for (const b of pts) if (Math.hypot(a[0] - b[0], (a[1] - b[1]) * 2) < 45 * GEO.A) sum += b[2]; if (sum > bs) { bs = sum; best = a; } }
        g.XY = best ? [best[0], best[1]] : g.items[0].XY;
        g.dir = best ? [best[3], best[4]] : [1, 0];
        g.at = g.items.reduce((m, c) => (Math.hypot(c.XY[0] - g.XY[0], c.XY[1] - g.XY[1]) < Math.hypot(m.XY[0] - g.XY[0], m.XY[1] - g.XY[1]) ? c : m)); // (the consent nearest to that place: its coordinates for the card)
        g.len = g.items.reduce((sum, c) => sum + (c.len || 0), 0);
        g.kind = g.items.some(c => c.kind === 'uplna') ? 'uplna' : g.items.some(c => c.kind === 'smer') ? 'smer' : 'castecna';
        g.cat = g.items[0].cat;
      }
      works.groups = [...groups.values()];
      if (selWork) selWork = (works.img.find(c => c.g && c.g.key === selWork.key) || {}).g || null; // (the chosen site in the new list)
      works.pts = works.data.points.map(q => ({ ...q, XY: llToImg(q.lon, q.lat) }));
      works.imgStamp = stamp;
      setSoon(today);
    }
    return works.img;
  }
  function setSoon(today) {
    works.soonDay = today;
    for (const c of works.img) c.soon = !!c.from && c.from > today;
    const utc = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)), t0 = utc(today);
    for (const g of works.groups) { g.soon = g.items.every(c => c.soon); g.inDays = g.soon && g.items[0].from ? Math.round((utc(g.items[0].from) - t0) / 864e5) : null; }
  }
  // a traffic cone (pixel style), (x, y) its foot
  function cone(ctx, x, y, s, faint) {
    ctx.globalAlpha = faint ? 0.55 : 1;
    ctx.fillStyle = '#161d2b'; ctx.fillRect(x - s - 1, y - 1, 2 * s + 2, 3);
    ctx.fillStyle = '#f08a3c'; ctx.beginPath(); ctx.moveTo(x, y - 2.2 * s); ctx.lineTo(x + s * 0.9, y); ctx.lineTo(x - s * 0.9, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#161d2b'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - s * 0.45, y - 1.2 * s, s * 0.9, Math.max(1, s * 0.35));
    ctx.globalAlpha = 1;
  }
  // "od 15. 11." next to a closure that is only coming (a dark chip with the start date), only at the closest zoom, from about 25 cm per pixel
  const CHIP_Z = 8;
  const fromLabel = d => `od ${d.slice(8, 10).replace(/^0/, '')}. ${d.slice(5, 7).replace(/^0/, '')}.`;
  function dateChip(ctx, x, y, text) {
    ctx.font = '400 13px "VT323", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(22,29,43,.9)'; ctx.fillRect(x, y - 8, w, 16);
    ctx.fillStyle = '#f3c868'; ctx.fillText(text, x + 4, y + 1);
  }
  function drawWorks(ctx, v, t, cw, ch) {
    if (!state.layers.works || v.z < ALERT_Z) return;
    const L = worksImg();
    if (!L) return;
    ctx.save();
    const chips = []; // the start dates of coming closures, drawn last so the tape does not cross them
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    const w = Math.max(1.5, Math.min(3.5, v.z * 2));
    const vis = (x0, y0, x1, y1) => !(x1 * v.k + v.ox < -20 || x0 * v.k + v.ox > cw + 20 || y1 * v.k + v.oy < -20 || y0 * v.k + v.oy > ch + 20);
    if (selWork) { // the pieces of the site whose card is open: a glow under their tape, breathing slowly
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,221,102,${(0.45 + 0.25 * Math.sin(t / 380)).toFixed(2)})`; ctx.lineWidth = w + 12;
      ctx.beginPath();
      for (const c of selWork.items) for (const p of c.parts) for (let i = 0; i < p.length; i += 2) { const x = v.ox + p[i] * v.k, y = v.oy + p[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    for (const c of L) {
      if (c.osm || !vis(...c.bb)) continue; // (the same closure comes from OpenStreetMap, drawn with the closures)
      const full = c.kind === 'uplna';
      const path = () => { ctx.beginPath(); for (const p of c.parts) for (let i = 0; i < p.length; i += 2) { const x = v.ox + p[i] * v.k, y = v.oy + p[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } };
      const ww = full ? w : w * 0.7;
      ctx.globalAlpha = c.soon ? 0.55 : 1;
      // barrier tape: red and white for a closed street, orange and white for an occupied sidewalk or lane
      if (lite()) { ctx.setLineDash([]); ctx.strokeStyle = full ? '#d8342c' : '#f08a3c'; ctx.lineWidth = ww + 1; path(); ctx.stroke(); ctx.globalAlpha = 1; } // (a slow device: one solid line)
      else if (c.soon) { // coming: a loose dashed line without the dark edge, not a tape yet
        ctx.strokeStyle = full ? '#d8342c' : '#f08a3c'; ctx.lineWidth = ww; ctx.setLineDash([ww * 1.2, ww * 2.4]); path(); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      } else {
        ctx.setLineDash([]); ctx.strokeStyle = 'rgba(22,29,43,.85)'; ctx.lineWidth = ww + 2; path(); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = ww; path(); ctx.stroke();
        ctx.strokeStyle = full ? '#d8342c' : '#f08a3c'; ctx.setLineDash([ww * 1.6, ww * 1.6]); path(); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }
    // the crews (src/workers.js): where the consent is valid today and the work is one with a dig, from about 0.9 m per
    // pixel. 6–22 h; at night only a full closure or a tram track keeps a half crew on; the lamps go on with the dark.
    if (v.k >= 1.1 && !lite()) {
      const now = mhd.now(), day = String(now.date).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3'), h = now.sec / 3600, working = h >= 6 && h < 22;
      const u = Math.max(1, Math.round(v.k * 0.55 * 2) / 2);
      const hiders = new Set(), crews = [];
      for (const g of works.groups) {
        if (g.soon || g.items[0].from > day || g.items[0].to < day || g.cat === 'leseni' || g.cat === 'kontejner' || g.cat === 'stavba') continue;
        const x = v.ox + g.XY[0] * v.k, y = v.oy + g.XY[1] * v.k;
        if (x < -150 || y < -150 || x > cw + 150 || y > ch + 150) continue;
        const n = Math.max(3, Math.min(10, 3 + Math.floor(g.len / 60))), shift = working ? n : g.kind === 'uplna' || g.cat === 'tram' ? Math.ceil(n / 2) : 0;
        if (!g.crew || g.crew.n !== (shift || n)) g.crew = makeCrew(hash(g.key), shift || n);
        crews.push([g, x, y, !shift]);
        if (occluder && v.z >= 0.45) {
          const dl = Math.hypot(g.dir[0], g.dir[1]) || 1, ax = g.dir[0] / dl, ay = g.dir[1] / dl, m = u / v.k; // (a unit of the figures in image px)
          for (const [al, si] of crewSpots(g.crew)) { const b = occluder(Math.round(g.XY[0] + (ax * al - ay * si) * m), Math.round(g.XY[1] + (ay * al + ax * si) * m)); if (b) hiders.add(b); }
        }
      }
      if (crews.length) veilHouses(ctx, v, t, hiders, true);
      for (const [g, x, y, asleep] of crews) drawCrew(ctx, x, y, u, t, g.crew, g.dir, { night: state.night > 0.4 && !state.klid, asleep });
    }
    // one sign per site, at its busiest place; a site of several consents has a bigger one
    for (const g of works.groups) {
      const x = v.ox + g.XY[0] * v.k, y = v.oy + g.XY[1] * v.k;
      if (x < -30 || y < -30 || x > cw + 30 || y > ch + 30) continue;
      const big = g.items.length > 1 ? 1.7 : 1;
      if (v.z >= 1 && !(lite() && v.z < 1.5)) { // signs and cones only from about 2 m per pixel (a slow device: closer)
        if (g.kind === 'uplna') noEntry(ctx, x, y - 6 * big, Math.max(3, Math.min(5.5, v.z * 3.5)) * big, g.soon); // (a coming closure: a faint sign)
        else cone(ctx, x, y, Math.max(2.5, Math.min(5, v.z * 3)) * big, g.soon);
      }
      // a site that begins tomorrow or the day after says so wherever its sign is drawn (audit 2026-11-15: a closure of
      // tomorrow looked like one of today); a later one only close up, the faint dashed line tells it from afar
      if (g.soon && (v.z >= CHIP_Z || (v.z >= 1 && g.inDays <= 2))) chips.push([x + 6 * big, y - 14 * big, g.inDays === 1 ? 'od zítřka' : fromLabel(g.items[0].from)]);
    }
    // reports of the national centre without a line of the City: a cone (works) or a red bar (closed)
    const s = Math.max(3, Math.min(6, v.z * 4));
    for (const q of works.pts) {
      const x = v.ox + q.XY[0] * v.k, y = v.oy + q.XY[1] * v.k;
      if (x < -20 || y < -20 || x > cw + 20 || y > ch + 20) continue;
      if (/uzavřen/i.test(q.kind) && !q.planned) {
        ctx.fillStyle = '#161d2b'; ctx.fillRect(x - s - 1, y - s * 0.6 - 1, 2 * s + 2, 1.2 * s + 2);
        ctx.fillStyle = '#d8342c'; ctx.fillRect(x - s, y - s * 0.6, 2 * s, 1.2 * s);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - s * 0.7, y - s * 0.18, 1.4 * s, s * 0.36);
      } else cone(ctx, x, y + s, s, q.planned);
      if (q.planned && q.from && v.z >= CHIP_Z) chips.push([x + s + 3, y - s - 4, fromLabel(q.from)]);
    }
    // one chip per place and date: several consents on the same corner (stages of one work) would pile up
    const drawn = [];
    for (const [x, y, text] of chips) {
      if (drawn.some(d => d[2] === text && Math.hypot(d[0] - x, d[1] - y) < 40)) continue;
      drawn.push([x, y, text]); dateChip(ctx, x, y, text);
    }
    ctx.restore();
  }
  function workAt(sx, sy, v) {
    if (!state.layers.works || v.z < ALERT_Z) return null;
    const L = worksImg();
    if (!L) return null;
    for (const q of works.pts) if (Math.hypot(v.ox + q.XY[0] * v.k - sx, v.oy + q.XY[1] * v.k - sy) < 11) return { workPoint: q };
    const X = (sx - v.ox) / v.k, Y = (sy - v.oy) / v.k, tol = 8 / v.k; // (the box first: the pointer moves over the map all the time)
    for (const g of works.groups) if (Math.hypot(v.ox + g.XY[0] * v.k - sx, v.oy + g.XY[1] * v.k - sy - (g.kind === 'uplna' ? 6 : 4)) < (g.items.length > 1 ? 15 : 10)) return { work: g.at };
    for (const c of L) {
      if (c.osm) continue;
      if (c.bb && (X < c.bb[0] - tol || X > c.bb[2] + tol || Y < c.bb[1] - tol || Y > c.bb[3] + tol)) continue;
      for (const p of c.parts) for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = v.ox + p[i] * v.k, ay = v.oy + p[i + 1] * v.k, bx = v.ox + p[i + 2] * v.k, by = v.oy + p[i + 3] * v.k;
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        const tt = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / L2));
        if (Math.hypot(ax + dx * tt - sx, ay + dy * tt - sy) < 8) return { work: c };
      }
    }
    return null;
  }

  // ------------------------------------------------------------ projects (City of Brno open data)
  const proj = { list: null, img: null, imgStamp: -1, updated: '', cobude: [] };
  const loadProjects = init => fetchData(`${base}data/projects.json`, init).then(r => r.json()).then(d => { proj.vmo = d.projects.find(p => p.id === 'cb-velky-mestsky-okruh'); proj.list = d.projects.filter(p => p.id !== 'cb-velky-mestsky-okruh' && shapeInMap(p.g)); /* only the projects in the map (src/extent.js) */ /* the ring road is drawn as a line (src/vmo.js) */ proj.updated = d.updated; proj.cobude = d.cobude || []; proj.imgStamp = -1; sites.imgStamp = -1; dataV++; applyProjDetail(); }).catch(() => {});
  loadProjects(); watchFeed('projects.json', () => loadProjects(RELOAD));
  let projDetail = null, projDetailData = null;
  function applyProjDetail() { if (!projDetailData || !proj.list) return; for (const p of proj.list.concat(proj.vmo ? [proj.vmo] : [])) if (projDetailData[p.id]) Object.assign(p, projDetailData[p.id]); }
  // descriptions, investors, pictures and links of the projects: await it before a project card
  const projectDetail = () => (projDetail ||= fetchData(`${base}data/projects-detail.json`).then(r => r.json()).then(d => { projDetailData = d; applyProjDetail(); sites.imgStamp = -1; dataV++; }).catch(() => { projDetail = null; }));
  // construction sites from OpenStreetMap (landuse=construction)
  const sites = { list: null, img: null, imgStamp: -1 };
  // building sites whose hatched ground the visitor hid from the card (a big site covers the houses around it,
  // which then cannot be clicked): only the crane stays, and it still opens the card. Kept in this browser.
  const HIDE_LS = 'b2k-hide-area';
  let hiddenAreas = new Set();
  try { hiddenAreas = new Set(JSON.parse(localStorage.getItem(HIDE_LS) || '[]')); } catch { hiddenAreas = new Set(); }
  const areaKey = p => (p.osm ? `site-${p.osmId}` : String(p.id));
  const areaHidden = p => hiddenAreas.has(areaKey(p));
  function setAreaHidden(p, hidden) {
    if (hidden) hiddenAreas.add(areaKey(p)); else hiddenAreas.delete(areaKey(p));
    try { localStorage.setItem(HIDE_LS, JSON.stringify([...hiddenAreas])); } catch { /* private mode */ }
  }
  const loadSites = init => fetchData(`${base}data/sites.json`, init).then(r => r.json()).then(d => { sites.list = d.filter(s => shapeInMap(s.r)); sites.imgStamp = -1; dataV++; }).catch(() => {});
  loadSites(); watchFeed('sites.json', () => loadSites(RELOAD));
  const demol = { list: null, img: null, imgStamp: -1 };
  fetch(`${base}data/demolished.json`).then(r => r.json()).then(d => { demol.list = d; demol.imgStamp = -1; dataV++; }).catch(() => {});

  // ---- location corrections: published ones (data/corrections.json) + this browser's own (localStorage)
  const LS = 'b2k-corrections';
  const corr = { pub: {}, own: {} };
  try { corr.own = JSON.parse(localStorage.getItem(LS) || '{}'); } catch { corr.own = {}; }
  fetch(`${base}data/corrections.json`).then(r => (r.ok ? r.json() : {})).then(d => { corr.pub = d.items || d || {}; stamp++; }).catch(() => {});
  const correction = key => corr.own[key] || corr.pub[key] || null;
  function saveOwn() { try { localStorage.setItem(LS, JSON.stringify(corr.own)); } catch { /* private mode */ } stamp++; }
  const setPosition = (key, lon, lat, name) => { corr.own[key] = { lon: +lon.toFixed(6), lat: +lat.toFixed(6), name, at: new Date().toISOString() }; saveOwn(); };
  const confirmPosition = (key, name) => { const c = correction(key); corr.own[key] = { ...(c || {}), confirmed: true, name, at: new Date().toISOString() }; saveOwn(); };
  const resetPosition = key => { delete corr.own[key]; saveOwn(); };
  const ownCorrections = () => corr.own;
  // where a project's position comes from
  function positionInfo(p) {
    const c = correction(`proj:${p.id}`);
    if (c && c.lon) return c.confirmed ? 'potvrzená (upravená ručně)' : 'upravená ručně, zatím nepotvrzená';
    if (c && c.confirmed) return p.approx ? 'odhadnutá, potvrzená' : 'z dat města, potvrzená';
    return p.approx ? 'přibližná — odhad, nepotvrzená' : 'z dat města (Brno Brzo)';
  }

  // centre of a polygon (area-weighted), so labels sit in the middle of long areas
  function centroid(r) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const f = r[j] * r[i + 1] - r[i] * r[j + 1];
      a += f; cx += (r[j] + r[i]) * f; cy += (r[j + 1] + r[i + 1]) * f;
    }
    if (Math.abs(a) < 1e-6) { let x = 0, y = 0; for (let i = 0; i < r.length; i += 2) { x += r[i]; y += r[i + 1]; } return [x / (r.length / 2), y / (r.length / 2)]; }
    return [cx / (3 * a), cy / (3 * a)];
  }
  const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) a += r[j] * r[i + 1] - r[i] * r[j + 1]; return Math.abs(a / 2); };
  function geomImg(p) {
    const c = correction(`proj:${p.id}`);
    const g = p.pt && c && c.lon ? [[c.lon, c.lat]] : p.g;
    const rings = g.map(r => { const o = []; for (let i = 0; i < r.length; i += 2) o.push(...llToImg(r[i], r[i + 1])); return o; });
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const r of rings) for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
    let X, Y;
    if (!p.pt && c && c.lon) [X, Y] = llToImg(c.lon, c.lat); // a moved label of an area
    else if (p.pt || rings[0].length < 6) [X, Y] = rings[0];
    else { const big = rings.reduce((m, r) => (ringArea(r) > ringArea(m) ? r : m), rings[0]); [X, Y] = centroid(big); }
    return { p, rings, bb: [x0, y0, x1, y1], X, Y };
  }
  // where the map marks a project: the foot of its crane (a site under construction) or the middle of its area
  const projectPos = p => { const q = geomImg(p); return [q.X, q.Y]; };
  function projImg() {
    if (!proj.list) return null;
    if (proj.imgStamp !== fresh()) { proj.img = proj.list.map(geomImg); proj.imgStamp = stamp; }
    return proj.img;
  }
  // A construction site from OpenStreetMap that lies on a city project (Brno Brzo, with its pictures and
  // description) or that the project confirms only repeats it: it is left out, unless it has its own web page.
  // Its builder, dates and note go into the project's card when the project lacks them.
  const inLL = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  // the city project this site lies on (or that confirms it by name), or null
  function onProject(s) {
    const all = (proj.list || []).concat(proj.vmo ? [proj.vmo] : []);
    const m = /Brno Brzo:\s*(.+)$/.exec(s.confirmedBy || '');
    if (m) { const byName = all.find(q => q.n === m[1].trim()); if (byName) return byName; }
    const r = s.r[0]; let cx = 0, cy = 0;
    for (let i = 0; i < r.length; i += 2) { cx += r[i]; cy += r[i + 1]; }
    cx /= r.length / 2; cy /= r.length / 2;
    const pts = [[cx, cy]]; for (let i = 0; i < r.length; i += 2) pts.push([r[i], r[i + 1]]);
    return all.find(q => (q.g || []).some(g => inLL(g, cx, cy) || pts.filter(([a, b]) => inLL(g, a, b)).length / pts.length >= 0.3)) || (m ? true : null);
  }
  function sitesImg() {
    if (!sites.list) return null;
    if (sites.imgStamp !== fresh()) {
      const shown = proj.list ? sites.list.filter(s => {
        const q = onProject(s);
        if (!q) return true;
        // its own web page only counts when it is not the project's page
        const host = u => (u || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '').toLowerCase();
        if (s.web && (q === true || ![q.web, q.src].some(u => u && host(u) === host(s.web)))) return true;
        if (q !== true) { // keep what the site knows: the builder and the dates
          if (s.op && !q.dev) q.dev = s.op;
          if (s.open && !q.done) q.done = s.open;
          if (s.start && !q.begin) q.begin = s.start;
          if (s.desc && !q.txt && !(q.cb && q.cb.d)) q.txt = s.desc;
        }
        return false;
      }) : sites.list;
      sites.img = shown.map(s => geomImg({ ...s, osmId: s.id, id: `site-${sites.list.indexOf(s)}`, g: s.r, osm: true }));
      sites.imgStamp = stamp;
    }
    return sites.img;
  }
  function demolImg() {
    if (!demol.list) return null;
    if (demol.imgStamp !== fresh()) { demol.img = demol.list.map(d => geomImg({ ...d, g: d.r, demol: true })); demol.imgStamp = stamp; }
    return demol.img;
  }
  // a symbolic tower crane (pixel style); (x, y) foot of the mast on screen, s = size factor
  // OSM construction=* values that mean a fenced-off open-air space (playground, park, path), not a building site
  const SOFT_SITE = new Set(['playground', 'pitch', 'park', 'garden', 'recreation_ground', 'dog_park', 'footway', 'sidewalk', 'cycleway', 'path', 'pedestrian', 'square']);
  let craneHits = []; // [[mast x0,y0,x1,y1, jib x0,y0,x1,y1, project], ...]
  function crane(ctx, x, y, s, t, p) {
    const H = 34 * s, J = 26 * s;
    const sway = Math.sin(t / 1800) * 0.25;
    const jx = Math.cos(sway), jy = Math.sin(sway) * 0.5;
    if (p) craneHits.push([x, y, x, y - H, x - J * 0.35 * jx, y - H - J * 0.35 * jy, x + J * jx, y - H + J * jy, p]);
    ctx.save();
    ctx.lineCap = 'square';
    const line = (x0, y0, x1, y1, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
    const top = y - H;
    for (const [w, c] of [[Math.max(3, 3 * s) + 2, '#161d2b'], [Math.max(3, 3 * s), '#f3c868']]) {
      line(x, y, x, top, w, c); // mast
      line(x - J * 0.35 * jx, top - J * 0.35 * jy, x + J * jx, top + J * jy, w * 0.8, c); // jib and counter-jib
    }
    ctx.fillStyle = '#5b5f66'; ctx.fillRect(x - J * 0.35 * jx - 3 * s, top - J * 0.35 * jy - 1, 6 * s, 4 * s); // counterweight
    const hx = x + J * 0.75 * jx, hy = top + J * 0.75 * jy;
    line(hx, hy, hx, hy + H * 0.45, 1, '#161d2b'); // hook rope
    ctx.fillStyle = '#c9583b'; ctx.fillRect(hx - 2 * s, hy + H * 0.45, 4 * s, 3 * s); // load
    // lattice marks on the mast
    ctx.fillStyle = '#161d2b';
    for (let q = y - 6 * s; q > top; q -= 6 * s) ctx.fillRect(x - 1, q, 2, 1);
    ctx.restore();
  }
  let hatchPattern = null;
  function hatch(ctx) {
    if (hatchPattern) return hatchPattern;
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(110,80,50,.32)'; g.fillRect(0, 0, 8, 8);
    // cross-hatch (two sets of lines at right angles) so building sites differ from the single stripes of planned areas
    g.strokeStyle = 'rgba(243,200,104,.7)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-2, 10); g.lineTo(10, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6);
    g.moveTo(-2, -2); g.lineTo(10, 10); g.moveTo(6, -2); g.lineTo(10, 2); g.moveTo(-2, 6); g.lineTo(2, 10);
    g.stroke();
    hatchPattern = ctx.createPattern(c, 'repeat');
    return hatchPattern;
  }
  const inRing = (r, x, y) => {
    let c = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  // which projects are shown: building sites now / planned by the city and public bodies / planned private ones
  const CITY_INV = /veřejná|strategický|Dáme na vás|smíšená/i;
  const isCity = p => CITY_INV.test(p.inv || '') || !!p.cb;
  const projOn = p => { const st = p.st || 'plánovaný'; return st === 've výstavbě' ? !!state.layers.building : st === 'plánovaný' ? !!(isCity(p) ? state.layers.planCity : state.layers.planPrivate) : false; };
  const anyProj = () => state.layers.building || state.layers.planCity || state.layers.planPrivate;
  // fine diagonal stripes for planned areas (one pattern per colour)
  const stripeCache = new Map();
  // cleared site: grey-brown ground with light and dark bits (concrete, rubble)
  let rubblePattern = null;
  function rubble(ctx) {
    if (rubblePattern) return rubblePattern;
    const c = document.createElement('canvas'); c.width = c.height = 12;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(120,104,88,.28)'; g.fillRect(0, 0, 12, 12);
    g.fillStyle = 'rgba(235,228,215,.7)'; for (const [x, y] of [[1, 2], [7, 5], [4, 9], [10, 10]]) g.fillRect(x, y, 1, 1);
    g.fillStyle = 'rgba(60,50,42,.7)'; for (const [x, y] of [[4, 4], [9, 1], [1, 8], [8, 8]]) g.fillRect(x, y, 1, 1);
    rubblePattern = ctx.createPattern(c, 'repeat');
    return rubblePattern;
  }
  function planStripes(ctx, col) {
    if (!stripeCache.has(col)) {
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const g = c.getContext('2d'); g.strokeStyle = `rgba(${col},.5)`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
      stripeCache.set(col, ctx.createPattern(c, 'repeat'));
    }
    return stripeCache.get(col);
  }
  // a crane under the screen point (within a few pixels of its mast or jib): its building site
  function craneAt(sx, sy) {
    const seg = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, f = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / L2)); return Math.hypot(ax + dx * f - sx, ay + dy * f - sy); };
    for (let i = craneHits.length - 1; i >= 0; i--) { const h = craneHits[i]; if (seg(h[0], h[1], h[2], h[3]) < 7 || seg(h[4], h[5], h[6], h[7]) < 7) return h[8]; }
    return null;
  }
  function projectsAt(X, Y) {
    const list = projImg();
    if (!list || !anyProj()) return [];
    const hit = q => {
      if (q.p.pt) return Math.hypot(q.rings[0][0] - X, q.rings[0][1] - Y) < 40;
      if (areaHidden(q.p) && !SOFT_SITE.has(q.p.kind)) return false;
      return X >= q.bb[0] && X <= q.bb[2] && Y >= q.bb[1] && Y <= q.bb[3] && q.rings.some(r => inRing(r, X, Y));
    };
    // city projects first, then construction sites from OpenStreetMap (they are clickable too)
    return [...list.filter(q => projOn(q.p) && hit(q)), ...(state.layers.building ? (sitesImg() || []).filter(hit) : []), ...(state.layers.building ? (demolImg() || []).filter(hit) : [])].map(q => q.p);
  }
  // project tags: major city projects ("Co bude, Brno?") get a tag; when a Wikipedia tag sits on the
  // same place, the project joins that tag instead (one tag, one card)
  function projectTags(wikiPois) {
    const list = projImg();
    if (!list) return { tags: [], byWiki: new Map() };
    const byWiki = new Map(), tags = [];
    for (const q of list) {
      if (!q.p.cb) continue;
      let hit = null, bd = 90;
      for (const w of wikiPois || []) {
        const inside = !q.p.pt && w[2] >= q.bb[0] && w[2] <= q.bb[2] && w[3] >= q.bb[1] - 10 && w[3] <= q.bb[3] + 10 && q.rings.some(r => inRing(r, w[2], w[3] + 8));
        const d = Math.hypot(w[2] - q.X, w[3] - q.Y);
        if (inside) { hit = w; break; }
        if (d < bd) { bd = d; hit = w; }
      }
      if (hit) { if (!byWiki.has(hit[1])) byWiki.set(hit[1], []); byWiki.get(hit[1]).push(q.p); }
      else tags.push({ n: q.p.cb.t || q.p.n, X: q.X, Y: q.Y, proj: q.p });
    }
    return { tags, byWiki };
  }

  // ------------------------------------------------------------ public transport
  const mhd = createMhd({ base, rotation });
  const live = createMhdLive();
   // (the places drawn right now, for a look from the console: window.__mhdLive.sample())
  // live vehicles in image coordinates (only inside the map)
  // (v, cw, ch: only the vehicles in that view, and the chosen or ridden one, are copied out: the stream carries about a
  // thousand, and a thousand copies a frame cost a slow device)
  // (Each report is projected once — its start and end, and the way it moved — and the vehicle glides between the two in
  // the image: a thousand vehicles were projected through the terrain at every frame only to find the few in the view.
  // The glide is straight in the image instead of in lon/lat: the same ends, a hair apart in between, and it is put onto
  // its route anyway.)
  // A phone in the live mode without the timetable: no vehicles for the first 20 s of silence of the live positions (the
  // snapshot answers within a second), then the timetable is fetched and its vehicles run as on a desktop.
  let silentAt = 0, silentSeen = 0;
  function planWaits() {
    if (state.mhdMode !== 'live' || mhd.wantSnap || mhd.ready()) return false;
    const now = performance.now();
    if (now - silentSeen > 2000) silentAt = now; // (asked only while the live positions are silent: a new silence)
    silentSeen = now;
    return now - silentAt < 20000; // (the direct stream may take 10 s to bring its first batch)
  }
  const liveProj = new Map(); let liveGen = 0;
  // Playing the movement (src/mhdlive.js: the snapshot gives every vehicle the knots of its way and the page draws it a
  // fixed time behind the data): the knots are projected once, when the way changes, and every frame only finds the
  // place between two of them. Writes p.wx, p.wy (the place), p.wi (the knot the stretch starts at), p.wf (how far along).
  function wayAt(p, play) {
    const K = p.knots, P = p.pts, n = K.length, td = play.td;
    if (n === 1 || td <= K[0][0]) { p.wx = P[0][0]; p.wy = P[0][1]; p.wi = 0; p.wf = 0; return; }
    for (let i = 1; i < n; i++) {
      if (td >= K[i][0]) continue;
      const f = (td - K[i - 1][0]) / (K[i][0] - K[i - 1][0] || 1);
      p.wx = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f; p.wy = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f; p.wi = i - 1; p.wf = f;
      return;
    }
    // past its last state: it waits there (no forecast); only when the snapshot allows E ms does it run on that long
    // at the speed of the last stretch
    const f = 1 + Math.min(play.E, td - K[n - 1][0]) / (K[n - 1][0] - K[n - 2][0] || 1);
    p.wx = P[n - 2][0] + (P[n - 1][0] - P[n - 2][0]) * f; p.wy = P[n - 2][1] + (P[n - 1][1] - P[n - 2][1]) * f; p.wi = n - 2; p.wf = f;
  }
  function wayDir(p) {
    p.dirI = p.wi;
    const K = p.knots, P = p.pts;
    for (let i = Math.min(p.wi, K.length - 2); i >= 0; i--) {
      const mx = P[i + 1][0] - P[i][0], my = P[i + 1][1] - P[i][1];
      if (Math.hypot(mx, my) < 3 * GEO.A) continue; // (it stood)
      p.mx = mx; p.my = my;
      const dN = (K[i + 1][1] - K[i][1]) * 110574, dE = (K[i + 1][2] - K[i][2]) * Math.cos((K[i][1] * Math.PI) / 180) * 111320;
      p.hd = (Math.atan2(dE, dN) * 180) / Math.PI;
      return;
    }
  }
  function liveVehicles(v = null, cw = 0, ch = 0) {
    const out = [], now = performance.now(), gen = ++liveGen, play = live.play(), fc = live.fc();
    const geoF = fc ? mhd.shapes(fc.rv, mhd.wantSnap) : null; // (the shapes of the routes; until they come the forecast goes straight)
    for (const r of live.records()) {
      let p = liveProj.get(r.id), X, Y, latNow, lngNow;
      if (fc && r.knots) {
        const K = r.knots, n = K.length, tl = K[n - 1][0];
        const shape = geoF && r.sh != null && r.m != null ? mhd.shapeOf(geoF, r.sh) : null;
        if (!p || !p.fc || p.knots !== K || p.stamp !== stamp || p.shape !== shape) {
          const q = { fc: true, knots: K, stamp, shape, pts: K.map(k => llToImg(k[2], k[1])), bx: 0, by: 0, bt: 0, mx: p ? p.mx : undefined, my: p ? p.my : undefined, hd: p ? p.hd : undefined, dm: null, v: 0, span: 0, from: null, first: true, mo: 0, mt: 0, mT: 0, bT: 2000 };
          if (n > 1) {
            const dN = (K[n - 1][1] - K[n - 2][1]) * 110574, dE = (K[n - 1][2] - K[n - 2][2]) * Math.cos((K[n - 1][1] * Math.PI) / 180) * 111320;
            q.span = (tl - K[n - 2][0]) / 1000; q.v = Math.hypot(dN, dE) / (q.span || 1);
            if (q.v < 1) q.v = 0; else q.hd = (Math.atan2(dE, dN) * 180) / Math.PI; // (m/s over the last stretch; under 1: it stood)
          } else if (!p && r.moveLat !== undefined) { const b = q.pts[0], m0 = llToImg(r.lng - r.moveLng, r.lat - r.moveLat); q.mx = b[0] - m0[0]; q.my = b[1] - m0[1]; }
          q.vf = r.o != null && r.o < 25 ? 0 : q.v; // (the speed ahead: none at a stop)
          if (p && p.stamp === stamp) { if (p.fc && shape && p.shape === shape) q.dm = p.dm; if (p.X !== undefined) q.from = [p.X, p.Y]; }
          p = q; liveProj.set(r.id, p);
        }
        const dt = (fc.now - fc.d - tl) / 1000; // seconds past the last state (negative: still before it)
        if (p.shape) {
          let m = r.m + r.dir * (dt < 0 ? p.v * Math.max(dt, -p.span) : p.vf * Math.min(dt, fc.h / 1000));
          if (dt > 0 && r.ns != null) m = r.dir > 0 ? Math.min(m, Math.max(r.ns, r.m)) : Math.max(m, Math.min(r.ns, r.m));
          if (p.first && p.dm != null) { // behind its new state on the same shape: the gap is made up along the route
            const gap = (m - p.dm) * r.dir;
            if (gap > 3 && gap <= 500) { p.mo = -gap; p.mt = now; p.mT = Math.max(2, Math.min(8, gap / 12)) * 1000; p.from = null; }
          }
          if (p.mo) { const u = (now - p.mt) / p.mT; if (u >= 1) p.mo = 0; else m += r.dir * p.mo * (1 - u * u * (3 - 2 * u)); }
          if (p.dm != null && (m - p.dm) * r.dir < 0 && Math.abs(m - p.dm) < 120) m = p.dm;
          p.dm = m;
          const pt = mhd.pointAt(p.shape, m);
          X = pt[0]; Y = pt[1];
          if (pt[2] || pt[3]) { p.mx = pt[2] * r.dir; p.my = pt[3] * r.dir; }
        } else {
          const P = p.pts;
          if (n === 1) { X = P[0][0]; Y = P[0][1]; }
          else {
            const f = 1 + (dt < 0 ? Math.max(dt, -p.span) : p.v ? Math.min(dt, 6, fc.h / 1000) : 0) / (p.span || 1);
            X = P[n - 2][0] + (P[n - 1][0] - P[n - 2][0]) * f; Y = P[n - 2][1] + (P[n - 1][1] - P[n - 2][1]) * f;
            if (p.v) { p.mx = P[n - 1][0] - P[n - 2][0]; p.my = P[n - 1][1] - P[n - 2][1]; }
          }
        }
        if (p.from) { const dx = p.from[0] - X, dy = p.from[1] - Y, dd = Math.hypot(dx, dy); if (dd > 0.5 && dd < 500 * GEO.A) { p.bx = dx; p.by = dy; p.bt = now; p.bT = Math.max(2, Math.min(8, dd / GEO.A / 12)) * 1000; } p.from = null; }
        p.first = false;
        let fade = 0;
        if (p.bt) { const u = (now - p.bt) / p.bT; if (u >= 1) p.bt = 0; else fade = 1 - u * u * (3 - 2 * u); }
        X = p.X = X + p.bx * fade; Y = p.Y = Y + p.by * fade;
        p.gen = gen;
        if (X < 0 || Y < 0 || X > GEO.W || Y > GEO.H) continue;
        latNow = r.lat; lngNow = r.lng; // (the last state; the body is drawn from X, Y: liveBodySnapped, liveBody)
      } else if (play && r.knots) {
        if (!p || p.fc || p.knots !== r.knots || p.stamp !== stamp) {
          const q = { knots: r.knots, stamp, pts: r.knots.map(k => llToImg(k[2], k[1])), bx: 0, by: 0, bt: 0, dirI: -2, mx: undefined, my: undefined, hd: undefined };
          wayAt(q, play);
          if (p && p.pts && p.stamp === stamp) {
            q.mx = p.mx; q.my = p.my; q.hd = p.hd;
            // the way changed under the vehicle: the gap between where it is drawn and the new way fades within 2 s
            const dx = p.X - q.wx, dy = p.Y - q.wy, dd = Math.hypot(dx, dy);
            if (dd > 0.5 && dd < 300 * GEO.A) { q.bx = dx; q.by = dy; q.bt = now; }
          } else if (r.moveLat !== undefined) { const b = llToImg(r.lng, r.lat), m0 = llToImg(r.lng - r.moveLng, r.lat - r.moveLat); q.mx = b[0] - m0[0]; q.my = b[1] - m0[1]; }
          p = q; liveProj.set(r.id, p);
        } else wayAt(p, play);
        if (p.dirI !== p.wi) wayDir(p);
        const fade = p.bt ? Math.max(0, 1 - (now - p.bt) / 2000) : 0;
        if (!fade) p.bt = 0;
        X = p.X = p.wx + p.bx * fade; Y = p.Y = p.wy + p.by * fade;
        p.gen = gen;
        if (X < 0 || Y < 0 || X > GEO.W || Y > GEO.H) continue;
        const K = p.knots, i = p.wi, j = Math.min(i + 1, K.length - 1);
        latNow = K[i][1] + (K[j][1] - K[i][1]) * p.wf; lngNow = K[i][2] + (K[j][2] - K[i][2]) * p.wf;
      } else {
        if (!p || p.t0 !== r.t0 || p.lat !== r.lat || p.lng !== r.lng || p.stamp !== stamp) {
          const a = llToImg(r.lng0, r.lat0), b = llToImg(r.lng, r.lat);
          p = { t0: r.t0, lat: r.lat, lng: r.lng, stamp, a, b, mx: undefined, my: undefined };
          if (r.moveLat !== undefined) { const m0 = llToImg(r.lng - r.moveLng, r.lat - r.moveLat); p.mx = b[0] - m0[0]; p.my = b[1] - m0[1]; }
          liveProj.set(r.id, p);
        }
        p.gen = gen;
        const f = Math.max(0, Math.min(1, (now - r.t0) / (r.t1 - r.t0 || 1)));
        X = p.a[0] + (p.b[0] - p.a[0]) * f; Y = p.a[1] + (p.b[1] - p.a[1]) * f;
        if (X < 0 || Y < 0 || X > GEO.W || Y > GEO.H) continue;
        latNow = r.lat0 + (r.lat - r.lat0) * f; lngNow = r.lng0 + (r.lng - r.lng0) * f;
      }
      if (v && selectedVehicle !== r.id && rideId !== r.id) {
        const sx = v.ox + X * v.k, sy = v.oy + Y * v.k;
        if (sx < -80 || sy < -80 || sx > cw + 80 || sy > ch + 80) continue;
      }
      // (The copy of the report that is handed out: on the glide it is kept with the projection and made anew only with a
      // new report, which brings a new projection; its place is written into it at every frame. A new copy of its two
      // dozen fields for every vehicle in view at every frame was a fifth of the vehicles' time far out. The playing and
      // the forecast change fields of the report in between, so there the copy is made every time, as before.)
      let o = p.out;
      if (!o) { o = { ...r, live: true }; if (!p.fc && !p.knots) p.out = o; }
      o.latNow = latNow; o.lngNow = lngNow; o.X = X; o.Y = Y;
      if (p.fc) { o.fcst = true; if (p.shape) o.fs = { shape: p.shape, m: p.dm, back: r.dir < 0 }; } // (the forecast: its place on its route)
      if (p.mx !== undefined) { o.mx = p.mx; o.my = p.my; }
      if (p.hd !== undefined) o.heading = p.hd;
      out.push(o);
    }
    if (gen % 300 === 0) for (const [k, p] of liveProj) if (p.gen !== gen) liveProj.delete(k); // (vehicles gone from the stream)
    return out;
  }
  // A live vehicle is put onto its line's route (from the timetable) so its body follows the rails / road
  // front first. Without a matching route the body points the way the vehicle actually moved.
  // (The whole route was searched for every vehicle at every frame: a route has hundreds to thousands of stretches,
  // and in the rush hour two hundred vehicles are in view, 2 ms a frame. Now the whole route once a second per vehicle,
  // each at its own moment, and in between only SNAP_WIN stretches either way of the one found last; when the place
  // found there is not close, SNAP_NEAR m, the whole route again at once.)
  const snapCache = new Map(); // live id -> { pv, at, seg, fullAt }
  const SNAP_WIN = 8, SNAP_NEAR = 8, SNAP_FULL_MS = 1000;
  const snapHit = { d: 0, m: 0, dx: 0, dy: 0, i: 0 };
  function snapScan(xy, cm, X, Y, lo, hi) {
    let best = Infinity, bm = 0, bdx = 0, bdy = 0, bi = lo;
    for (let i = lo; i <= hi; i++) {
      const ax = xy[2 * i - 2], ay = xy[2 * i - 1], dx = xy[2 * i] - ax, dy = xy[2 * i + 1] - ay;
      const L2 = dx * dx + dy * dy || 1;
      const f = Math.max(0, Math.min(1, ((X - ax) * dx + (Y - ay) * dy) / L2));
      const d = Math.hypot(ax + dx * f - X, ay + dy * f - Y);
      if (d < best) { best = d; bm = cm[i - 1] + (cm[i] - cm[i - 1]) * f; bdx = dx; bdy = dy; bi = i; }
    }
    snapHit.d = best; snapHit.m = bm; snapHit.dx = bdx; snapHit.dy = bdy; snapHit.i = bi;
  }
  function snapLive(m) {
    let c = snapCache.get(m.id);
    if (!c || performance.now() - c.at > 10000) { c = { pv: matchPlan(m), at: performance.now() }; snapCache.set(m.id, c); }
    if (snapCache.size > 2000) snapCache.clear();
    const pv = c.pv;
    if (!pv || !pv.shape) return null;
    const [xy, cm] = pv.shape, last = cm.length - 1, now = performance.now();
    const near = c.shape === pv.shape && c.seg >= 1 && c.seg <= last && now < c.fullAt;
    if (near) snapScan(xy, cm, m.X, m.Y, Math.max(1, c.seg - SNAP_WIN), Math.min(last, c.seg + SNAP_WIN));
    // (a vehicle that runs beside its route, on a diversion, is as far from it after the whole search too: only a place
    // clearly worse than the one the whole search gave sends it searching again)
    if (!near || snapHit.d > Math.max(SNAP_NEAR * GEO.A, c.dFull * 1.25 + 2 * GEO.A)) { snapScan(xy, cm, m.X, m.Y, 1, last); c.fullAt = now + SNAP_FULL_MS * (0.75 + 0.5 * Math.random()); c.shape = pv.shape; c.dFull = snapHit.d; }
    c.seg = snapHit.i;
    const best = snapHit.d, bm = snapHit.m, bdx = snapHit.dx, bdy = snapHit.dy;
    if (best > 30 * GEO.A) return null; // off its route (detour): use the direction of travel
    // direction along the route: the way the timetable trip runs, checked against the real movement
    let back = pv.back;
    if (m.mx !== undefined && Math.hypot(m.mx, m.my) > 3) back = (m.mx * bdx + m.my * bdy) < 0;
    return { shape: pv.shape, m: bm, back };
  }
  function liveBodySnapped(m, lengthM, n) {
    // a vehicle of the forecast on its route: the body lies along that route behind the forecast place (also on a
    // phone, which does not look for the timetable trip), moved with the place while a gap fades
    if (m.fs) {
      const out = mhd.body(m.fs, lengthM, n), dx = m.X - out[0], dy = m.Y - out[1];
      if (dx || dy) for (let i = 0; i < out.length; i += 2) { out[i] += dx; out[i + 1] += dy; }
      return out;
    }
    const s = snapLive(m);
    return s ? mhd.body(s, lengthM, n) : liveBody(m, lengthM, n);
  }
  // body points of a live vehicle: from its position backwards along its heading (metres)
  function liveBody(m, lengthM, n) {
    const b = ((m.heading ?? m.bearing) * Math.PI) / 180, out = [];
    for (let i = 0; i < n; i++) {
      const d = (lengthM * i) / (n - 1);
      const lat = m.latNow - (Math.cos(b) * d) / 110574, lng = m.lngNow - (Math.sin(b) * d) / (Math.cos((m.latNow * Math.PI) / 180) * 111320);
      out.push(...llToImg(lng, lat));
    }
    // (the forecast draws the vehicle at X, Y, away from its last state: the body goes there with it)
    if (m.fcst) { const dx = m.X - out[0], dy = m.Y - out[1]; for (let i = 0; i < out.length; i += 2) { out[i] += dx; out[i + 1] += dy; } }
    return out;
  }
  // The timetable trip a live vehicle runs. The candidates are the line's trips at the vehicle's timetable time
  // (now minus its delay), including one about to start or just finished (a vehicle at the terminus). The stops
  // the live stream reports decide more than the distance: the trip ends at the vehicle's final stop and passes
  // its last stop; a trip that only shares the destination name, or none of it, is a weaker match.
  function matchPlan(lv) {
    if (!mhd.ready()) { if (mhd.wantSnap) mhd.load(); return null; } // (the timetable comes in the background, until then the body points the way the vehicle moves)
    const finalName = mhd.stopName(lv.final);
    const planSec = mhd.now().sec - (lv.delay || 0) * 60;
    let best = null, bs = Infinity;
    for (const pv of mhd.candidates(lv.line, planSec)) {
      const nums = pv.p[5] || [];
      const endsThere = nums.length > 0 && nums[nums.length - 1] === lv.final;
      const passes = lv.last && nums.includes(lv.last);
      let d = 2500 * GEO.A; // (no position and no stop to go by)
      if (Number.isFinite(pv.X)) d = Math.hypot(pv.X - lv.X, pv.Y - lv.Y);
      else if (passes) {
        // No position: the trip is on a part its shape does not cover (a diversion). Then the time decides: by the
        // vehicle's own timetable time the right trip has left the vehicle's last stop and not yet reached the next
        // one. Seconds off that stretch count as 8 m each (a minute is forgiven: the delay comes in whole minutes).
        // Without this any other trip of the line with a position within 2.5 km won, e.g. the one 15 minutes ahead,
        // and the card showed its timetable (tram 1 at Grohova, "next stop Mendlovo náměstí", 14. 11. 2026).
        const offs = pv.p[3], dt = planSec - pv.t0;
        let gap = Infinity;
        for (let k = 0; k < nums.length; k++) if (nums[k] === lv.last) gap = Math.min(gap, dt < offs[k] ? offs[k] - dt : dt > offs[Math.min(k + 1, offs.length - 1)] ? dt - offs[Math.min(k + 1, offs.length - 1)] : 0);
        d = Math.min(2500, Math.max(0, gap - 60) * 8) * GEO.A;
      }
      const s = d + (endsThere ? 0 : finalName && pv.hs === finalName ? 300 : 3000) + (passes ? 0 : 1500);
      if (s < bs) { bs = s; best = pv; }
    }
    return bs < 6000 * GEO.A ? best : null;
  }
  // What a closure changes on the way of a trip (pattern p of a line), for the route drawn in the map: the stops the
  // trip calls at only now ("náhradní trasa") and the pieces of its regular way it leaves out ("výluka"). Only for a
  // line with a closure or diversion valid now that has an end (closureEnd, set by main.js from the IDS JMK feed: the
  // ends of the line's closures, the nearest first): the regular way is the line's most alike pattern on the same day
  // of the week after such an end (mhd.usual). The ends are tried from the nearest. A line can have a closure of a
  // few days and one of many months at once, and the latest end, the only one looked at before, gave a day the
  // timetable does not reach: nothing was marked (N91 on 14. 11. 2026, Lidická to 17. 11. and Česká to the end of
  // 2027). No such day in the timetable (only closures of many months) or no closure: null, the route is drawn as it is.
  let closureEnd = () => [];
  // (day: the day the pattern runs on, today unless the stop card shows a line's ways of another day)
  function diversion(p, line, day = mhd.now()) {
    if (!p[5]) return null;
    let tried = 0;
    for (const end of [].concat(closureEnd(String(line)) || [])) {
      const t = new Date(end + 12 * 3600e3);
      for (let k = 0; k < 7 && (t.getUTCDay() + 6) % 7 !== day.wd; k++) t.setUTCDate(t.getUTCDate() + 1);
      const date = t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
      if (day.date >= date || date === tried) continue; // (a day after that closure: its way of that day is the regular one)
      tried = date;
      const ref = mhd.usual(p, { date, wd: day.wd });
      const d = ref && changes(p, ref);
      if (d) return d;
    }
    return null;
  }
  // (pattern p beside the regular pattern ref.p of its line, with the shape of that one)
  function changes(p, ref) {
    const mine = new Set(p[5]), theirs = new Set(ref.p[5]), all = mhd.stops();
    const added = p[5].map(n => !!n && !theirs.has(n));
    const rn = ref.p[5], rm = ref.p[2], [xy, cm] = ref.shape, skipped = [];
    for (let i = 0; i < rn.length; i++) {
      if (!rn[i] || mine.has(rn[i])) continue;
      let j = i;
      while (j + 1 < rn.length && !mine.has(rn[j + 1])) j++;
      // from the shared stop before the piece to the shared stop after it (or its own first / last stop)
      const a = i > 0 ? i - 1 : i, b = j + 1 < rn.length ? j + 1 : j;
      let piece = [];
      if (rm[a] >= 0 && rm[b] >= 0 && rm[a] !== rm[b]) {
        const lo = Math.min(rm[a], rm[b]), hi = Math.max(rm[a], rm[b]);
        piece.push(...mhd.pointAt(ref.shape, lo).slice(0, 2));
        for (let k = 0; k < cm.length; k++) if (cm[k] > lo && cm[k] < hi) piece.push(xy[2 * k], xy[2 * k + 1]);
        piece.push(...mhd.pointAt(ref.shape, hi).slice(0, 2));
      } else for (let k = a; k <= b; k++) { const st = all[rn[k]]; if (st) piece.push(...llToImg(st[1], st[2])); }
      if (piece.length >= 4) skipped.push(piece);
      i = j;
    }
    return added.some(Boolean) || skipped.length ? { added, skipped } : null;
  }
  // the selected vehicle's whole route with its stops
  let selRoute = null;
  function setRoute(pv) {
    if (!pv) { selRoute = null; return; }
    const [, , ms, offs, stopNames, stopNums] = pv.p;
    selRoute = { shape: pv.shape, ms, offs, names: stopNames, nums: stopNums, t0: pv.t0, type: pv.type, div: diversion(pv.p, pv.line) };
  }
  let selLine = null;
  function setLineRoute(list, day) {
    selLine = list && list.length ? list.map(pv => { const [, , ms, offs, names, nums] = pv.p; return { shape: pv.shape, ms, offs, names, nums, t0: pv.t0, type: pv.type, div: diversion(pv.p, pv.line, day) }; }) : null;
  }
  function routeGeom(R) {
    const st = fresh();
    if (R.g && R.g.stamp === st) return R.g;
    // (the places of the stops away from the shape come from the stops file, which the map reads only when it shows
    // the stops: far out, with a line highlighted from a link, it is not here yet. It is asked for and the route waits
    // for it: without it the regular way would be drawn across the diversion.)
    if (!mhd.stopsLoaded() && R.ms.some(m => m < 0)) { mhd.loadStops(); return { pts: [], on: [], away: [], tags: [] }; }
    const all = mhd.stops(), pts = [];
    R.ms.forEach((m, i) => {
      const num = R.nums ? R.nums[i] : 0;
      if (m >= 0) { const [X, Y] = mhd.pointAt(R.shape, m); pts.push({ X, Y, m, i, num }); return; }
      const s = num && all[num];
      if (s) { const [X, Y] = llToImg(s[1], s[2]); pts.push({ X, Y, m: -1, i, num }); }
    });
    const g = (R.g = { stamp: st, pts, on: [], away: [], tags: [] });
    if (pts.length < 2 || !pts.some(p => p.m >= 0)) { g.pts = []; return g; }
    const [xy, cm] = R.shape, solid = [], legs = []; // legs[k]: the way from stop k - 1 to stop k, in that order
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      if (a.m < 0 || b.m < 0) {
        const way = mhd.between(a.num, b.num, R.type);
        legs[k] = way; // (null: a straight piece, made below, once the stops have their places)
        if (!way) continue;
        g.on.push(way);
        // (such a stop is drawn where the borrowed route passes it, not in the middle of its platforms)
        if (a.m < 0 && !a.moved) { a.X = way[0]; a.Y = way[1]; a.moved = true; }
        if (b.m < 0) { b.X = way[way.length - 2]; b.Y = way[way.length - 1]; b.moved = true; }
        continue;
      }
      const lo = Math.min(a.m, b.m), hi = Math.max(a.m, b.m), piece = [...mhd.pointAt(R.shape, lo).slice(0, 2)];
      for (let i = 0; i < cm.length; i++) if (cm[i] > lo && cm[i] < hi) piece.push(xy[2 * i], xy[2 * i + 1]);
      piece.push(...mhd.pointAt(R.shape, hi).slice(0, 2));
      legs[k] = piece;
      if (b.m < a.m) { legs[k] = []; for (let i = piece.length - 2; i >= 0; i -= 2) legs[k].push(piece[i], piece[i + 1]); }
      // (pieces that follow each other along the shape are one line: no joint at every stop)
      const last = solid[solid.length - 1];
      if (last && last.hi === lo) { last.p.push(...piece.slice(2)); last.hi = hi; } else if (last && last.lo === hi) { last.p.unshift(...piece.slice(0, -2)); last.lo = lo; } else solid.push({ p: piece, lo, hi });
    }
    for (let k = 1; k < pts.length; k++) if (!legs[k]) { legs[k] = [pts[k - 1].X, pts[k - 1].Y, pts[k].X, pts[k].Y]; g.away.push(legs[k]); }
    g.on.unshift(...solid.map(s => s.p));
    // what a closure changes (diversion() above): a word on the regular way the trip leaves out and on its new piece
    if (R.div) {
      for (const p of R.div.skipped) g.tags.push(['výluka', '#ffb07a', p]);
      let run = null;
      for (let k = 0; k <= pts.length; k++) {
        if (k < pts.length && R.div.added[pts[k].i]) { run ||= []; if (k > 0) run.push(...legs[k]); } else if (run) { if (k < pts.length) run.push(...legs[k]); if (run.length >= 4) g.tags.push(['náhradní trasa', '#ffffff', run]); run = null; }
      }
    }
    return g;
  }
  function drawRoute(ctx, v, cw, ch, R = selRoute, named = null) {
    const g = routeGeom(R), pts = g.pts;
    if (pts.length < 2) return;
    const col = R.type === 'tram' ? '#c8202a' : R.type === 'trol' ? '#2f8f3a' : '#2f6fb7';
    // (only the pieces in the view go into the path, with a margin for the width of the line: at a close zoom the way
    // of a line is thousands of points off the screen, and stroking them all, three times and once dashed, cost more
    // than the vehicles of the whole view: measured 2026-11-14 with a line highlighted)
    const M = 16;
    const line = list => {
      ctx.beginPath();
      for (const p of list) {
        let px = 0, py = 0, pen = false;
        for (let i = 0; i < p.length; i += 2) {
          const x = v.ox + p[i] * v.k, y = v.oy + p[i + 1] * v.k;
          if (i) {
            if (Math.max(px, x) < -M || Math.min(px, x) > cw + M || Math.max(py, y) < -M || Math.min(py, y) > ch + M) pen = false;
            else { if (!pen) ctx.moveTo(px, py); ctx.lineTo(x, y); pen = true; }
          }
          px = x; py = y;
        }
      }
    };
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(22,29,43,.85)'; ctx.lineWidth = 9; line(g.on); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 5; line(g.on); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); line(g.on); ctx.stroke(); ctx.setLineDash([]);
    if (g.away.length) { // no route known between two stops: thinner and dashed, it joins them and does not follow the streets
      ctx.lineCap = 'butt';
      ctx.strokeStyle = 'rgba(22,29,43,.85)'; ctx.lineWidth = 7; line(g.away); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([9, 7]); line(g.away); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineCap = 'round';
    }
    if (R.div && R.div.skipped.length) {
      ctx.lineCap = 'butt';
      ctx.strokeStyle = 'rgba(22,29,43,.7)'; ctx.lineWidth = 3; line(R.div.skipped); ctx.stroke();
      ctx.strokeStyle = '#f08a3c'; ctx.lineWidth = 9; ctx.setLineDash([2, 5]); line(R.div.skipped); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineCap = 'round';
    }
    // stops: passed ones grey, upcoming white; names of the stops when zoomed in
    const now = named ? 0 : mhd.now().sec;
    ctx.font = '400 15px "VT323", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const p of pts) {
      const x = v.ox + p.X * v.k, y = v.oy + p.Y * v.k;
      if (x < -20 || y < -20 || x > cw + 20 || y > ch + 20) continue;
      const passed = !named && R.t0 + R.offs[p.i] < now;
      const end = p === pts[0] || p === pts[pts.length - 1];
      const r = end ? 7 : 5;
      ctx.fillStyle = '#161d2b'; ctx.fillRect(x - r - 1, y - r - 1, 2 * r + 2, 2 * r + 2);
      ctx.fillStyle = passed ? '#9aa3ad' : end ? '#f3c868' : '#ffffff'; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      if (v.z >= 0.5 || end) {
        const name = mhd.names ? mhd.names(R.names[p.i]) : '';
        if (name && !(named && named.has(name))) {
          if (named) named.add(name); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(22,29,43,.9)'; ctx.strokeText(name, x + r + 4, y); ctx.fillStyle = passed ? '#c9ced6' : '#ffffff'; ctx.fillText(name, x + r + 4, y);
        }
      }
    }
    // the words: each on its piece where that is nearest to the middle of the view, between two of its points; a
    // highlighted line (several routes) says each word once
    ctx.font = '400 17px "VT323", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [text, tc, p] of g.tags) {
      if (named && named.has(`§${text}`)) continue;
      let bx = 0, by = 0, bd = Infinity;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const x = v.ox + ((p[i] + p[i + 2]) / 2) * v.k, y = v.oy + ((p[i + 1] + p[i + 3]) / 2) * v.k;
        if (x < 40 || y < 40 || x > cw - 40 || y > ch - 40) continue;
        const d = Math.hypot(x - cw / 2, y - ch / 2);
        if (d < bd) { bd = d; bx = x; by = y; }
      }
      if (bd === Infinity) continue;
      if (named) named.add(`§${text}`);
      const w = Math.ceil(ctx.measureText(text).width) + 10;
      ctx.fillStyle = 'rgba(22,29,43,.92)'; ctx.fillRect(Math.round(bx - w / 2), Math.round(by - 22), w, 17);
      ctx.fillStyle = tc; ctx.fillText(text, Math.round(bx), Math.round(by - 13));
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ boundaries of the city and its districts
  const bnd = { list: null, img: null, imgStamp: -1, loading: false };
  // (120 KB, fetched when first drawn: from z 0.1, a step closer than the start view of a phone)
  const loadBoundaries = () => { bnd.loading = true; fetch(`${base}data/boundaries.json`).then(r => r.json()).then(d => { bnd.list = d.map(b => ({ ...b, r: b.r.flatMap(clipLine) })); /* (the city reaches beyond the map: its border is cut at the edge, src/extent.js) */ bnd.imgStamp = -1; dataV++; }).catch(() => {}); };
  function drawBoundaries(ctx, v) {
    if (v.z < 0.1 || (lite() && v.z >= 0.8)) return; // (a slow device close up: the streets matter, not the lines of the districts)
    if (!bnd.list) { if (!bnd.loading) loadBoundaries(); return; }
    if (bnd.imgStamp !== fresh()) {
      bnd.img = bnd.list.map(b => ({ lvl: b.lvl, rings: b.r.map(r => { const o = []; for (let i = 0; i < r.length; i += 2) o.push(...llToImg(r[i], r[i + 1])); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < o.length; i += 2) { x0 = Math.min(x0, o[i]); x1 = Math.max(x1, o[i]); y0 = Math.min(y0, o[i + 1]); y1 = Math.max(y1, o[i + 1]); } o.bb = [x0, y0, x1, y1]; return o; }) }));
      bnd.imgStamp = stamp;
    }
    ctx.save();
    ctx.lineJoin = 'round';
    const [vx0, vy0, vx1, vy1] = ctx.__view || [0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight]; // (src/onscreen.js; read once, not per ring)
    for (const b of bnd.img) {
      const city = b.lvl === 8;
      if (!city && v.z < 0.3) continue; // districts only when zoomed in
      ctx.setLineDash(lite() ? [] : city ? [10, 5] : [4, 5]); // (a slow device: solid, dashes cost the raster)
      ctx.lineWidth = city ? 1.6 : 1;
      ctx.strokeStyle = city ? 'rgba(243,200,104,.55)' : 'rgba(240,242,234,.32)';
      for (const r of b.rings) {
        if (r.bb && (v.ox + r.bb[2] * v.k < vx0 - 20 || v.ox + r.bb[0] * v.k > vx1 + 20 || v.oy + r.bb[3] * v.k < vy0 - 20 || v.oy + r.bb[1] * v.k > vy1 + 20)) continue; // (out of the view)
        ctx.beginPath();
        for (let i = 0; i < r.length; i += 2) { const x = v.ox + r[i] * v.k, y = v.oy + r[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // The outlines of the projects, the building sites and the cleared sites. Zoomed in (from PROJ_STILL_Z) they are drawn
  // at every frame and the dashes run round. Zoomed out there are hundreds of them on the screen, so
  // the dashes stand still and the whole picture is kept in a canvas PROJ_M px larger than the view on every side: a pan
  // only puts it down at the offset; drawn again when the zoom, the data, the layers, the hover or the size change, or when
  // the view has moved past the margin. Live over it: the pulsing rings of point projects and the cranes (they sway; their
  // places are kept with the picture).
  const PROJ_STILL_Z = 1.5, PROJ_M = 192; // (1.5 = about 1.3 m per pixel: the dashes run only close up)
  let projCache = null, projK = 0, projKT = 0;
  // R: the box [x0, y0, x1, y1] in the coordinates of ctx outside which nothing is drawn; still: dashes at rest, no rings
  function projBody(ctx, v, t, hover, R, still) {
    const vis = (x0, y0, x1, y1) => !(v.ox + x1 * v.k < R[0] || v.ox + x0 * v.k > R[2] || v.oy + y1 * v.k < R[1] || v.oy + y0 * v.k > R[3]);
    const off = still ? 0 : -(t / 120) % 10;
    // the outline of a building site: as it is close up, thinner the farther out (down to about a half), so that the edge
    // does not outweigh a site that is only a few pixels across
    const thin = Math.max(0.6, Math.min(1, v.z / PROJ_STILL_Z));
    const list = projImg(), cranes = [];
    ctx.save();
    ctx.setLineDash(lite() ? [] : [9, 5]);
    ctx.lineDashOffset = off;
    for (const q of list) {
      if (!vis(...q.bb) || !projOn(q.p)) continue;
      const on = hover && hover.includes(q.p);
      const major = !!q.p.cb;
      const priv = !isCity(q.p) && q.p.st !== 've výstavbě'; // planned private projects: blue outline
      if (q.p.pt) {
        if (still) continue; // (the ring is drawn live over the kept picture, projLive)
        const [X, Y] = q.rings[0];
        const r = (10 + 4 * Math.sin(t / 300)) * Math.max(1, v.z);
        ctx.strokeStyle = 'rgba(243,200,104,.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(v.ox + X * v.k, v.oy + Y * v.k, r, 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      const building = q.p.st === 've výstavbě';
      // ground hidden from the card: no hatch and no outline, the crane alone marks the site (drawn at any zoom, so the card stays reachable)
      if (building && areaHidden(q.p)) { cranes.push([q.X, q.Y, q.p, true]); continue; }
      if (building) {
        // building site: brown hatched ground and a tower crane
        ctx.save(); ctx.setLineDash([]);
        ctx.fillStyle = lite() ? 'rgba(120,88,52,.45)' : hatch(ctx);
        ctx.beginPath();
        for (const r of q.rings) { for (let i = 0; i < r.length; i += 2) { const x = v.ox + r[i] * v.k, y = v.oy + r[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); }
        ctx.fill();
        ctx.restore();
        cranes.push([q.X, q.Y, q.p]);
      }
      const shape = () => { ctx.beginPath(); for (const r of q.rings) { for (let i = 0; i < r.length; i += 2) { const x = v.ox + r[i] * v.k, y = v.oy + r[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); } };
      if (!building) {
        // planned: a well visible area (fill + stripes) and a thick dashed outline with a dark edge
        const col = priv ? '143,196,240' : '242,198,109';
        shape(); ctx.fillStyle = `rgba(${col},${on ? 0.32 : 0.2})`; ctx.fill();
        if (!lite()) { ctx.fillStyle = planStripes(ctx, col); ctx.fill(); }
        const lw = on ? 3.2 : major ? 2.6 : 2;
        if (!lite()) { ctx.save(); ctx.setLineDash([]); shape(); ctx.strokeStyle = 'rgba(22,29,43,.7)'; ctx.lineWidth = lw + 1.5; ctx.stroke(); ctx.restore(); shape(); } // (a slow device: the outline on the path of the fill, no dark edge)
        ctx.strokeStyle = on ? 'rgba(255,240,190,1)' : `rgba(${col},1)`; ctx.lineWidth = lw; ctx.stroke();
      } else {
        // under construction: the hatched ground above, a light wash when hovered, and a dashed yellow outline with a dark edge
        if (on) { shape(); ctx.fillStyle = 'rgba(243,200,104,.22)'; ctx.fill(); }
        const lw = (on ? 2.4 : major ? 1.7 : 1.3) * thin;
        if (!lite()) { ctx.save(); ctx.setLineDash([]); shape(); ctx.strokeStyle = 'rgba(22,29,43,.75)'; ctx.lineWidth = lw + thin; ctx.stroke(); ctx.restore(); } // (a slow device: no dark edge)
        shape(); ctx.strokeStyle = on ? 'rgba(255,240,190,1)' : 'rgba(243,200,104,1)'; ctx.lineWidth = lw; ctx.stroke();
      }
    }
    ctx.restore();
    // OpenStreetMap construction sites
    const S = state.layers.building ? sitesImg() : null;
    if (S) {
      ctx.save();
      ctx.lineJoin = 'round';
      for (const q of S) {
        if (!vis(...q.bb)) continue;
        // an open-air space being redone (a playground, a park, a path): no tower crane, the hatched ground alone marks it
        const soft = SOFT_SITE.has(q.p.kind);
        if (!soft && areaHidden(q.p)) { cranes.push([q.X, q.Y, q.p, true]); continue; }
        const on = hover && hover.includes(q.p);
        const shape = () => { ctx.beginPath(); for (const r of q.rings) { for (let i = 0; i < r.length; i += 2) { const x = v.ox + r[i] * v.k, y = v.oy + r[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); } };
        shape(); ctx.fillStyle = lite() ? 'rgba(120,88,52,.45)' : hatch(ctx); ctx.fill();
        if (on) { ctx.fillStyle = 'rgba(243,200,104,.22)'; ctx.fill(); }
        // dark edge and a dashed yellow outline, so the hatched ground does not get lost among the roofs
        const lw = (on ? 2.4 : 1.3) * thin;
        if (!lite()) { ctx.setLineDash([]); shape(); ctx.strokeStyle = 'rgba(22,29,43,.75)'; ctx.lineWidth = lw + thin; ctx.stroke(); ctx.setLineDash([9, 5]); ctx.lineDashOffset = off; shape(); } // (a slow device: the outline on the path of the fill, no dark edge, no dashes)
        ctx.strokeStyle = on ? 'rgba(255,240,190,1)' : 'rgba(243,200,104,1)'; ctx.lineWidth = lw; ctx.stroke();
        if (!soft && ringArea(q.rings[0]) > 1500 * GEO.A * GEO.A) cranes.push([q.X, q.Y, q.p]);
      }
      ctx.restore();
    }
    // cleared sites (demolished buildings): rubble over the ground, a thin dark outline, a light wash when hovered
    const D = state.layers.building && v.z >= 0.25 && !(lite() && v.z < 1.5) ? demolImg() : null; // (a slow device: the rubble close up only)
    if (D) {
      ctx.save(); ctx.lineJoin = 'round';
      for (const q of D) {
        if (!vis(...q.bb) || q.p.site) continue; // on a construction site the site's hatch is drawn instead (still clickable)
        const on = hover && hover.includes(q.p);
        ctx.beginPath(); for (const r of q.rings) { for (let i = 0; i < r.length; i += 2) { const x = v.ox + r[i] * v.k, y = v.oy + r[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); }
        if (q.p.g !== 'grass' && q.p.g !== 'paved') { ctx.fillStyle = lite() ? 'rgba(110,98,86,.5)' : rubble(ctx); ctx.fill('evenodd'); }
        if (on) { ctx.fillStyle = 'rgba(255,240,190,.25)'; ctx.fill('evenodd'); }
        ctx.setLineDash([]); ctx.strokeStyle = on ? 'rgba(255,240,190,1)' : 'rgba(70,58,48,.6)'; ctx.lineWidth = on ? 2.2 : 1; ctx.stroke();
      }
      ctx.restore();
    }
    return cranes;
  }
  // the part that moves, drawn over the kept picture: the rings of point projects
  function projLive(ctx, v, t, R) {
    const vis = (x0, y0, x1, y1) => !(v.ox + x1 * v.k < R[0] || v.ox + x0 * v.k > R[2] || v.oy + y1 * v.k < R[1] || v.oy + y0 * v.k > R[3]);
    ctx.save();
    ctx.setLineDash(lite() ? [] : [9, 5]);
    ctx.lineDashOffset = -(t / 120) % 10;
    ctx.strokeStyle = 'rgba(243,200,104,.95)'; ctx.lineWidth = 2;
    for (const q of projImg()) {
      if (!vis(...q.bb) || !projOn(q.p)) continue;
      if (q.p.pt) {
        const [X, Y] = q.rings[0];
        const r = (10 + 4 * Math.sin(t / 300)) * Math.max(1, v.z);
        ctx.beginPath(); ctx.arc(v.ox + X * v.k, v.oy + Y * v.k, r, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function projCached(ctx, v, t, hover, cw, ch) {
    const now = performance.now(), R = [-20, -20, cw + 20, ch + 20], M = PROJ_M;
    if (Math.abs(v.k / (projK || 1) - 1) > 1e-6) { projK = v.k; projKT = now; } // (k carries float noise during a pan)
    if (now - projKT < 150) return projBody(ctx, v, t, hover, R, true); // while zooming: straight to the screen, no picture kept
    const dpr = ctx.getTransform().a || 1;
    const hv = hover ? hover.filter(Boolean) : [];
    const lists = [projImg(), state.layers.building ? sitesImg() : null, state.layers.building && !(lite() && v.z < 1.5) ? demolImg() : null];
    const key = `${cw}x${ch}@${dpr}|${+!!state.layers.building}${+!!state.layers.planCity}${+!!state.layers.planPrivate}|${+!!lite()}|${dataV}|${[...hiddenAreas].join()}`;
    const c = projCache;
    if (!c || c.key !== key || Math.abs(v.k / c.k - 1) > 1e-6 || Math.abs(v.ox - c.ox) > M - 16 || Math.abs(v.oy - c.oy) > M - 16
      || lists.some((l, i) => l !== c.lists[i]) || hv.length !== c.hover.length || hv.some((h, i) => h !== c.hover[i])) {
      const canvas = c ? c.canvas : document.createElement('canvas');
      const CW = Math.round((cw + 2 * M) * dpr), CH = Math.round((ch + 2 * M) * dpr);
      if (canvas.width !== CW || canvas.height !== CH) { canvas.width = CW; canvas.height = CH; }
      const g = canvas.getContext('2d');
      // the origin of the map sits at a whole device pixel of the picture, so the pattern fills stay fixed to the map
      const tx = Math.round((v.ox + M) * dpr) / dpr, ty = Math.round((v.oy + M) * dpr) / dpr;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, CW, CH);
      g.setTransform(dpr, 0, 0, dpr, tx * dpr, ty * dpr);
      const cranes = projBody(g, { ...v, ox: 0, oy: 0 }, t, hover, [-tx, -ty, cw + 2 * M - tx, ch + 2 * M - ty], true);
      projCache = { canvas, key, k: v.k, ox: tx - M, oy: ty - M, lists, hover: hv, cranes };
    }
    const dx = Math.round((v.ox - projCache.ox) * dpr) / dpr - M, dy = Math.round((v.oy - projCache.oy) * dpr) / dpr - M;
    ctx.drawImage(projCache.canvas, dx, dy, cw + 2 * M, ch + 2 * M);
    projLive(ctx, v, t, R);
    return projCache.cranes; // (of the sites in the kept picture, the margin included)
  }
  // ------------------------------------------------------------ drawing
  function draw(ctx, v, t, hover) {
    arrowQ = []; badgeQ = []; setBadgeSink(badgeQ);
    const cw = ctx.canvas.clientWidth, ch = ctx.canvas.clientHeight;
    let t0 = performance.now();
    T('L:boundaries', () => drawBoundaries(ctx, v));
    t0 = performance.now();
    const vis = (x0, y0, x1, y1) => !(v.ox + x1 * v.k < -20 || v.ox + x0 * v.k > cw + 20 || v.oy + y1 * v.k < -20 || v.oy + y0 * v.k > ch + 20);
    // projects: outlines (planned and ongoing construction)
    if (anyProj() && v.z >= 0.25) {
      if (projImg()) {
        const cranes = v.z < PROJ_STILL_Z ? projCached(ctx, v, t, hover, cw, ch) : projBody(ctx, v, t, hover, [-20, -20, cw + 20, ch + 20], false);
        const cs = Math.max(0.45, Math.min(2.2, v.k * GEO.A * 1.1));
        // cranes only in detail: from about 2.5 m per pixel (z 0.8 = 1 / (A · 2.5) on the 2 m scale)
        craneHits = [];
        for (const [X, Y, p, always] of cranes) if (always || (v.z >= 0.8 && !(lite() && v.z < 1.5))) crane(ctx, v.ox + X * v.k, v.oy + Y * v.k, cs, t, p); // (a slow device: the cranes close up only)
      }
    }
    tick('L:projects', performance.now() - t0); t0 = performance.now();
    // live traffic: jams coloured by severity (layer jams), closures and accidents as icons (closures / jams)
    if (state.layers.jams || state.layers.closures) {
      if (!traffic.timer) { refreshTraffic(); traffic.timer = setInterval(refreshTraffic, 60e3); }
      const T = trafficImg();
      if (T) {
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (!state.layers.jams) {
          // (only the closures: no queues)
        } else if (v.z < JAM_CARS_Z) {
          // zoomed out: a car would be a speck of a pixel or two and there are thousands of them in view
          // (every one a few filled quads per frame), so show the queue as a coloured line instead
          // (one path and one stroke per severity colour, not per jam)
          // (the whole city in view, v.z < 0.3: the orange and red jams thicker, a thin line vanished among the streets)
          // (2026-11-12: there the orange and red ones 4 and 5 px, solid, on a dark edge, so the squares of the late
          // vehicles do not drown them)
          const base = Math.max(1.5, Math.min(4.5, v.z * 6)), far = v.z < 0.3;
          for (const [col, lo, hi, w] of [['rgba(243,200,104,.6)', -Infinity, 2, base], [far ? '#f08a3c' : 'rgba(240,138,60,.8)', 3, 3, far ? Math.max(base, 4) : base], [far ? '#e8362a' : 'rgba(216,52,44,.9)', 4, Infinity, far ? Math.max(base, 5) : base]]) {
            ctx.beginPath();
            for (const j of T.jams) {
              if (j.level < lo || j.level > hi || !vis(...j.bb)) continue;
              for (let i = 0; i < j.pts.length; i += 2) { const x = v.ox + j.pts[i] * v.k, y = v.oy + j.pts[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
            }
            if (far && lo >= 3) { ctx.strokeStyle = 'rgba(22,29,43,.85)'; ctx.lineWidth = w + 2.5; ctx.stroke(); }
            ctx.strokeStyle = col; ctx.lineWidth = w;
            ctx.stroke();
          }
        } else {
          // zoomed in: the jam is drawn as a queue of cars — the worse it is, the tighter, redder and stiller
          const sec = t / 1000;
          const mk = v.k * GEO.A; // screen px per metre
          const pad = 8 * GEO.A; // the lanes lie up to some 5 m off the axis
          for (const j of T.jams) {
            if (!vis(...j.bb)) continue;
            if (!j.rows) jamRows(j);
            const total = j.cum[j.cum.length - 1];
            const speed = Math.max(0, (j.speed || 0) / 3.6) * GEO.A * 0.6; // crawling speed in px/s
            const shift = (sec * speed) % j.step;
            for (let ri = 0; ri < j.rows.length; ri++) {
              const row = j.rows[ri];
              const at = row.at, n = at.length, off = row.lane * GEO.A;
              let i = 0;
              // segment by segment: where a segment is off the screen its cars are skipped in one step
              for (let a = 0; a < j.cum.length - 1 && i < n; a++) {
                const end = a === j.cum.length - 2 ? total : j.cum[a + 1];
                const ax = j.pts[2 * a], ay = j.pts[2 * a + 1], bx = j.pts[2 * a + 2], by = j.pts[2 * a + 3];
                if (!vis(Math.min(ax, bx) - pad, Math.min(ay, by) - pad, Math.max(ax, bx) + pad, Math.max(ay, by) + pad)) {
                  let lo = i, hi = n; // the first car beyond this segment
                  while (lo < hi) { const m = (lo + hi) >> 1; if (at[m] + shift <= end) lo = m + 1; else hi = m; }
                  i = lo;
                  continue;
                }
                const L = j.cum[a + 1] - j.cum[a] || 1;
                const dx = (bx - ax) / L, dy = (by - ay) / L;
                for (; i < n && at[i] + shift <= end; i++) {
                  const f = (at[i] + shift - j.cum[a]) / L;
                  // keep to the right-hand lane
                  let X = ax + (bx - ax) * f - dy * off, Y = ay + (by - ay) * f + dx * off;
                  // (a traffic node: each row of the queue into a lane as drawn there, counted from the left; a row with no lane there is left out)
                  if (laneSnap) { const q = laneSnap(X, Y, dx, dy, ri, true); if (q === false) continue; if (q) { X = q[0]; Y = q[1]; } }
                  const x = v.ox + X * v.k, y = v.oy + Y * v.k;
                  if (x < -20 || y < -20 || x > cw + 20 || y > ch + 20) continue;
                  if (occluder && !lite() && occluder(X, Y)) continue; // cars behind buildings are not drawn
                  jamBatch.add(x, y, dx, dy, row.kind[i], row.col[i], mk, row.col[i]);
                }
              }
            }
          }
          jamBatch.flush(ctx);
        }
        const s = Math.max(5, Math.min(10, v.z * 7));
        // accidents, hazards and closures from Waze only from about 14 m per pixel: zoomed out they would just dot the whole city
        if (v.z >= ALERT_Z) for (const a of T.alerts) {
          if (a.type === 'ACCIDENT') continue; // (the accidents: joined, below)
          if (!(a.type === 'ROAD_CLOSED' ? state.layers.closures : state.layers.jams)) continue;
          const x = v.ox + a.X * v.k, y = v.oy + a.Y * v.k;
          if (x < -20 || y < -20 || x > cw + 20 || y > ch + 20) continue;
          if (a.type === 'ROAD_CLOSED') {
            ctx.fillStyle = '#161d2b'; ctx.fillRect(x - s - 1, y - s * 0.6 - 1, 2 * s + 2, 1.2 * s + 2);
            ctx.fillStyle = '#d8342c'; ctx.fillRect(x - s, y - s * 0.6, 2 * s, 1.2 * s);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(x - s * 0.7, y - s * 0.18, 1.4 * s, s * 0.36);
          } else {
            ctx.fillStyle = a.type === 'ACCIDENT' ? '#f08a3c' : '#f3c868';
            ctx.strokeStyle = '#161d2b'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.8); ctx.lineTo(x - s, y + s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#161d2b'; ctx.fillRect(x - 1, y - s * 0.45, 2, s * 0.65); ctx.fillRect(x - 1, y + s * 0.35, 2, 2);
          }
        }
        // (the accidents: with the icons, drawAccidents, over the beacons of a highlight)
        ctx.restore();
      }
    } else if (traffic.timer) { clearInterval(traffic.timer); traffic.timer = null; }
    tick('L:traffic', performance.now() - t0); t0 = performance.now();
    if (state.layers.closures) drawClosures(ctx, v, t, cw, ch);
    drawWorks(ctx, v, t, cw, ch);
    tick('L:closures', performance.now() - t0); t0 = performance.now();
    // public transport by timetable: articulated trams, trolleybuses with poles, buses — with line numbers
    if (state.layers.mhd && selRoute) drawRoute(ctx, v, cw, ch);
    else if (selLine) { const named = new Set(); for (const R of selLine) drawRoute(ctx, v, cw, ch, R, named); } // (asked for in the stop card: also with the vehicles switched off)
    if (state.layers.mhdStops) drawStops(ctx, v, cw, ch, t); else drawnStops = [];
    tick('L:stops', performance.now() - t0); t0 = performance.now();
    focusQ = []; otherQ = [];
    if (state.layers.mhd && v.z >= 0.18) {
      // live positions when the stream delivers them, otherwise the timetable
      const useLive = state.mhdMode === 'live' && live.alive();
      // phones (no snapping, mhd.wantSnap false): they do not fetch the timetable (0.9 MB on the wire) for the moment
      // before the first live answer, only when the live positions stay silent (planWaits)
      // (the timetable: only the trips near the view are worked out; they are judged by where they were up to a second ago,
      // so 60 m are left for the way made since, on top of the 60 px of the test below; the chosen and the ridden one always)
      const pm = 60 + 60 * GEO.A * v.k;
      const inView = (X, Y, id) => { if (id === selectedVehicle || id === rideId) return true; const x = v.ox + X * v.k, y = v.oy + Y * v.k; return !(x < -pm || y < -pm || x > cw + pm || y > ch + pm); };
      const list = useLive ? liveVehicles(v, cw, ch) : planWaits() || live.waiting() ? [] : mhd.vehicles(inView);
      drawnVehicles = [];
      ctx.save();
      const labels = v.z >= 0.7;
      // draw far vehicles first so nearer ones overlap them
      list.sort((a, b) => a.Y - b.Y);
      const ways = wayCells(); // (the ways drawn just now: a vehicle on one of them is drawn whole)
      for (const m of list) {
        if (selectedVehicle === m.id) selPos = [m.X, m.Y, performance.now()];
        if (rideId === m.id) { ridePos = [m.X, m.Y, performance.now()]; rideM = m; } // riding along with it
        const x = v.ox + m.X * v.k, y = v.oy + m.Y * v.k;
        if (x < -60 || y < -60 || x > cw + 60 || y > ch + 60) continue;
        // a highlighted line (the beacon in its card): its vehicles wait for drawFocusLine, above the veil
        if (focusLine != null && inFocus(m)) { focusQ.push(m); continue; }
        if (focusLine != null && focusLine !== LATE10) { otherQ.push(m); continue; }
        drawVehicle(ctx, v, t, m, labels, onWay(ways, m));
      }
      ctx.restore();
    } else if (state.layers.mhd && state.mhdMode === 'live') {
      const late = live.alive() ? liveVehicles(v, cw, ch).filter(m => (m.delay || 0) >= 5) : lateFar ? lateFar() : [];
      ctx.save();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(22,29,43,.9)';
      for (const [lo, hi, col] of [[5, 10, delayColor(5)], [10, Infinity, delayColor(10)]]) { // (the red over the orange; the colours of the badges)
        ctx.beginPath();
        for (const m of late) {
          const d = m.delay || 0;
          if (d < lo || d >= hi) continue;
          const x = v.ox + m.X * v.k, y = v.oy + m.Y * v.k;
          if (x < -10 || y < -10 || x > cw + 10 || y > ch + 10) continue;
          ctx.rect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
        }
        ctx.stroke(); ctx.fillStyle = col; ctx.fill();
      }
      ctx.restore();
    }
    tick('L:vehicles', performance.now() - t0);
  }

  // The buildings in front of the chosen vehicle step back: a pale veil, hatched, over the house as it is drawn (its roof
  // outline swept down by its height), so the vehicle drawn whole over it reads as standing behind. Each house fades in
  // and out over a quarter of a second, so a tram passing a row of houses does not make them blink.
  const veilSeen = new Map(); // building -> { since, last }
  const VEIL_IN = 250, VEIL_OUT = 300;
  let veilFrame = -1; // (two chosen vehicles in one frame: each draws its own houses, the first also those fading out)
  function veilHouses(ctx, v, t, hiders, soft = false) {
    const first = veilFrame !== t; veilFrame = t;
    for (const b of hiders) { const e = veilSeen.get(b); if (e && t - e.last <= VEIL_OUT) e.last = t; else veilSeen.set(b, { since: t, last: t }); }
    if (!veilSeen.size) return;
    const P = [];
    for (const [b, e] of veilSeen) {
      const a = Math.min(1, (t - e.since) / VEIL_IN) * (1 - Math.min(1, (t - e.last) / VEIL_OUT));
      if (a <= 0) { if (t - e.last > VEIL_OUT) veilSeen.delete(b); continue; }
      if (hiders.has(b) || (first && e.last < t)) P.push([b, a]);
    }
    if (!P.length) return;
    const add = q => { // one closed shape, always turning the same way, so that the union of all of them is filled
      let ar = 0; for (let i = 0, j = q.length - 2; i < q.length; j = i, i += 2) ar += q[j] * q[i + 1] - q[i] * q[j + 1];
      const r = ar < 0;
      for (let k = 0; k < q.length; k += 2) { const i = r ? q.length - 2 - k : k; k ? ctx.lineTo(q[i], q[i + 1]) : ctx.moveTo(q[i], q[i + 1]); }
      ctx.closePath();
    };
    ctx.save();
    for (const [b, a] of P) {
      const p = b[0], hp = (b[1] || 0) * v.k, s = [];
      for (let i = 0; i < p.length; i += 2) s.push(v.ox + p[i] * v.k, v.oy + p[i + 1] * v.k);
      ctx.beginPath();
      add(s); add(s.map((c, i) => (i & 1 ? c + hp : c)));
      for (let i = 0, j = s.length - 2; i < s.length; j = i, i += 2) add([s[j], s[j + 1], s[i], s[i + 1], s[i], s[i + 1] + hp, s[j], s[j + 1] + hp]);
      ctx.globalAlpha = (soft ? 0.26 : 0.55) * a; ctx.fillStyle = '#f0f2ea'; ctx.fill('nonzero');
      ctx.globalAlpha = (soft ? 0.18 : 0.5) * a; ctx.fillStyle = behindHatch(ctx); ctx.fill('nonzero');
      if (soft && s.length >= 6) {
        const n = s.length / 2;
        // a wall is seen when the house lies above its edge on the screen: a point just above the middle of the edge is inside the roof
        const inside = (x, y) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const yi = s[2 * i + 1], yj = s[2 * j + 1]; if ((yi > y) !== (yj > y) && x < ((s[2 * j] - s[2 * i]) * (y - yi)) / (yj - yi) + s[2 * i]) c = !c; } return c; };
        const front = [];
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; front.push(inside((s[2 * i] + s[2 * j]) / 2, (s[2 * i + 1] + s[2 * j + 1]) / 2 - 1.5)); }
        ctx.globalAlpha = 0.4 * a; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const lines = () => {
          ctx.beginPath();
          for (let i = 0; i < n; i++) { i ? ctx.lineTo(s[2 * i], s[2 * i + 1]) : ctx.moveTo(s[2 * i], s[2 * i + 1]); }
          ctx.closePath();
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            if (front[i]) { ctx.moveTo(s[2 * i], s[2 * i + 1] + hp); ctx.lineTo(s[2 * j], s[2 * j + 1] + hp); }
            if (front[i] || front[(i + n - 1) % n]) { ctx.moveTo(s[2 * i], s[2 * i + 1]); ctx.lineTo(s[2 * i], s[2 * i + 1] + hp); }
          }
        };
        ctx.strokeStyle = '#161d2b'; ctx.lineWidth = 1; lines(); ctx.stroke();
      }
    }
    ctx.restore();
  }
  // The way a vehicle goes on along its route: from where it is to where it will be a little further on the route. How
  // far depends on the zoom (about 80 px of the screen, 25–300 m): close up the street it is on, further out the main
  // way of the route over the next couple of hundred metres — never across the street on a bend.
  // Without a route (a live vehicle off it, or no timetable yet): the way its nose points (the body runs front to back).
  function headOf(pts) {
    if (!pts || pts.length < 4) return null;
    const dx = pts[0] - pts[2], dy = pts[1] - pts[3], l = Math.hypot(dx, dy);
    return l > 0.01 ? [dx / l, dy / l] : null;
  }
  function wayOf(m, pts, v) {
    const r = m.live ? snapLive(m) : m.shape && Number.isFinite(m.m) ? m : null;
    if (r && r.shape) {
      const ahead = Math.max(25, Math.min(300, 80 / (v.k * GEO.A))) * GEO.A;
      const q = mhd.body({ shape: r.shape, m: r.m, back: !r.back }, ahead, 2); // (body runs backwards: flipped, it runs ahead)
      const dx = q[2] - q[0], dy = q[3] - q[1], l = Math.hypot(dx, dy);
      if (l > 3) return [dx / l, dy / l]; // (image and screen differ only by scale: the same direction; at the terminus there is no way on)
    }
    return headOf(pts);
  }
  // (collected while the vehicles are drawn and drawn by the page last, over every icon: drawArrows)
  let arrowQ = [];
  let badgeQ = [];
  function drawBadges(ctx) { ctx.save(); for (const [x, y, line, type, delay, s, a] of badgeQ) { ctx.globalAlpha = a; drawBadge(ctx, x, y, line, type, delay, s); } ctx.restore(); badgeQ.length = 0; }
  function drawArrows(ctx) { ctx.save(); ctx.globalAlpha = 1; for (const a of arrowQ) dirArrow(ctx, ...a); ctx.restore(); arrowQ = []; }
  // The way as three chevrons lying on the ground (flattened like the ripples of the beacons), in a row going out from
  // a circle of radius r around (cx, cy) the way (ux, uy), lit one after another like the markers of old strategy games;
  // a dark outline under the colour, so they stand out over any route; s: their size
  function dirArrow(ctx, cx, cy, ux, uy, r, col, s = 1) {
    let gx = ux, gy = 2 * uy; const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl; // (the way on the ground)
    const px = -gy, py = gx / 2; // (square to it on the ground, seen on the screen)
    const arm = 10 * s, depth = 7 * s, gap = 10 * s, lit = Math.floor(performance.now() / 260) % 4; // (the fourth step: none lit, a pause)
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'; ctx.miterLimit = 6;
    for (let i = 0; i < 3; i++) {
      const d = r + 4 * s + i * gap, bx = cx + ux * d, by = cy + uy * d, tx = bx + ux * depth, ty = by + uy * depth;
      const shape = () => { ctx.beginPath(); ctx.moveTo(Math.round(bx + px * arm), Math.round(by + py * arm)); ctx.lineTo(Math.round(tx), Math.round(ty)); ctx.lineTo(Math.round(bx - px * arm), Math.round(by - py * arm)); };
      ctx.globalAlpha = i === lit ? 1 : 0.55;
      shape(); ctx.lineWidth = 7 * s; ctx.strokeStyle = '#161d2b'; ctx.stroke();
      shape(); ctx.lineWidth = 3.5 * s; ctx.strokeStyle = i === lit ? '#fff6d8' : col; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineJoin = 'round';
  }
  // one vehicle of public transport: its body along the track, the ring when selected or under the pointer, the line badge
  const LEN = { tram: 31, trol: 18, bus: 12 }; // metres (Škoda 13T tram, articulated trolleybus, standard bus)
  const WAY = { key: '', cells: null, cx: 1, cy: 1 };
  function wayCells() {
    const R = [];
    if (state.layers.mhd && selRoute) R.push(selRoute); else if (selLine) R.push(...selLine);
    if (focusLine != null && focusLine !== LATE10 && focusRoutes.line === focusLine) R.push(...focusRoutes.list);
    if (!R.length) return null;
    const G = R.map(routeGeom);
    const key = `${fresh()}|${G.map(g => g.on.map(p => `${p.length}:${Math.round(p[0])}:${Math.round(p[p.length - 1])}`).join('/')).join(',')}`;
    if (key !== WAY.key) {
      const cells = new Set(), cx = 8 * GEO.A, cy = 4 * GEO.A; // (north-south the image is half as long: 8 m both ways)
      const add = (x, y) => { const i = Math.floor(x / cx), j = Math.floor(y / cy); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) cells.add((i + a) * 16384 + j + b); };
      for (const g of G) for (const p of g.on) for (let k = 0; k + 3 < p.length; k += 2) {
        const dx = p[k + 2] - p[k], dy = p[k + 3] - p[k + 1], n = Math.max(1, Math.ceil(Math.max(Math.abs(dx) / cx, Math.abs(dy) / cy) * 2));
        for (let q = 0; q <= n; q++) add(p[k] + (dx * q) / n, p[k + 1] + (dy * q) / n);
      }
      WAY.key = key; WAY.cells = cells; WAY.cx = cx; WAY.cy = cy;
    }
    return WAY.cells;
  }
  const onWay = (cells, m) => !!cells && cells.has(Math.floor(m.X / WAY.cx) * 16384 + Math.floor(m.Y / WAY.cy));
  // (whole: a vehicle on a way that is drawn, see wayCells: no hatching behind the houses)
  function drawVehicle(ctx, v, t, m, labels, whole = false) {
    // live vehicles: real set length (coupled cars from the feed, car length from its fleet number)
    const set = m.live && m.vid ? setLength(m.type, [m.vid, m.idb, m.idc]) : null;
    let lenM = set ? set.len : LEN[m.type];
    // phones: far out a vehicle would be a speck of a few pixels; it is stretched along its track to at least 7 px
    // (and drawTransit keeps its body half again as wide), so it can still be seen and hit with a finger
    if (bigUi()) lenM *= Math.min(4, Math.max(1, 7 / (lenM * v.k * GEO.A)));
    const cars = set ? set.joints.filter(j => j[1]).length + 1 : 1; // (coupled cars: a few more points, each car is drawn on its own)
    // (far out, where it is a block of a few pixels drawn by drawFar in src/vehicles.js: a point for every 6 px of its
    // length, the two ends for a bus; a coupled set two points a car)
    const lenPx = lenM * GEO.A * v.k, far = !labels && v.k * GEO.A < FAR_K;
    const n = lite() && v.z < 1.5 ? 2 : far ? (cars > 1 ? 2 * cars : lenPx <= 6 ? 2 : lenPx <= 12 ? 3 : 4)
      : Math.max(11, Math.min(14 + 4 * (cars - 1), Math.round(lenM / 3) + 1)); // at least 10 pieces, each tested for buildings in front (a slow device zoomed out: the two ends)
    const body = m.live ? liveBodySnapped(m, lenM * GEO.A, n) : mhd.body(m, lenM * GEO.A, n);
    const pts = [];
    for (let i = 0; i < body.length; i += 2) pts.push(v.ox + body[i] * v.k, v.oy + body[i + 1] * v.k);
    const sel = selectedVehicle === m.id || rideId === m.id, hov = hoverVehicle === m.id;
    // behind a building (seen at an angle): the hidden pieces are drawn see-through and hatched (ghost, drawTransit);
    // the chosen vehicle (selected, under the pointer, ridden) is drawn whole and the buildings in front of it step back
    let vis = null;
    if (occluder && v.z >= 0.45 && !lite() && !(whole && !sel && !hov)) {
      vis = [];
      const hiders = sel || hov ? new Set() : null;
      for (let i = 0; i + 3 < body.length; i += 2) {
        const b = occluder((body[i] + body[i + 2]) / 2, (body[i + 1] + body[i + 3]) / 2);
        vis.push(!b);
        if (b && hiders) hiders.add(b);
      }
      if (hiders) { veilHouses(ctx, v, t, hiders); if (hiders.size) vis = null; }
    }
    // ring around the whole vehicle: selected (solid, pulsing) or under the mouse (thin)
    if (sel || hov) {
      let cx = 0, cy = 0;
      for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1]; }
      cx /= pts.length / 2; cy /= pts.length / 2;
      let rad = 0;
      for (let i = 0; i < pts.length; i += 2) rad = Math.max(rad, Math.hypot(pts[i] - cx, pts[i + 1] - cy));
      rad = Math.max(sel ? 24 : 18, rad + (sel ? 14 + 3 * Math.sin(t / 250) : 8));
      ctx.strokeStyle = 'rgba(22,29,43,.8)'; ctx.lineWidth = sel ? 6 : 4;
      ctx.beginPath(); ctx.arc(cx, cy - 6, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = sel ? '#f3c868' : 'rgba(243,200,104,.75)'; ctx.lineWidth = sel ? 3 : 2;
      ctx.beginPath(); ctx.arc(cx, cy - 6, rad, 0, Math.PI * 2); ctx.stroke();
      const d = wayOf(m, pts, v);
      if (d) { // (out of the ring, and clear of the vehicle's nose where it reaches beyond the ring close up)
        let far = 0; for (let i = 0; i < pts.length; i += 2) far = Math.max(far, (pts[i] - cx) * d[0] + (pts[i + 1] - (cy - 6)) * d[1]);
        arrowQ.push([cx, cy - 6, d[0], d[1], Math.max(rad, far + 14 + 3.2 * v.k * GEO.A), sel ? '#f3c868' : '#f6dc8a', sel ? 1 : 0.85]);
      }
    } else if (focusLine != null && inFocus(m)) {
      // a vehicle of the highlighted line (the beacon in its card): the way it goes, just ahead of its nose
      const d = wayOf(m, pts, v);
      if (d) { let cx = 0, cy = 0; for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1]; } cx /= pts.length / 2; cy /= pts.length / 2; arrowQ.push([cx, cy - 4, d[0], d[1], Math.max(16, Math.hypot(pts[0] - cx, pts[1] - cy) + 6), FOCUS_COL[m.type] || '#f3c868', 1]); }
    }
    if (lite() && v.z < 1.5) { // (a slow device zoomed out: a short thick line in the colour of the kind, no pixel body, no badge)
      ctx.strokeStyle = m.type === 'tram' ? '#c8202a' : m.type === 'trol' ? '#2f8f3a' : '#2f6fb7'; ctx.lineWidth = Math.max(3, 4 * v.k * GEO.A); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1] - 2); ctx.lineTo(pts[pts.length - 2], pts[pts.length - 1] - 2); ctx.stroke();
    } else drawTransit(ctx, pts, m.type, v.k * GEO.A, m.line, labels, m.live ? Math.round(m.delay || 0) : null, set ? set.joints : null, false, vis, bigUi() ? 1.5 : 1, String(m.id)); // (the last: a ghost for the hidden pieces, kept under the vehicle's id)
    drawnVehicles.push([m, pts, labels]);
  }
  // The vehicles of one line highlighted from a vehicle card (the beacon beside ×): drawn by main.js in fx.top, after
  // the veil that darkens the map and the other vehicles, each with a beacon under it in the colour of its kind. Far
  // out (no vehicles drawn there) the beacons alone show where the line's vehicles are.
  // (the "line" LATE10 is not a line: every live vehicle 10 minutes or more behind, the beacon "Zpožděné 10+" of the
  // Doprava overview, src/doprava.js; it has no routes)
  let focusLine = null, focusQ = [], otherQ = []; // (otherQ: the vehicles of the other lines while a line is highlighted, see draw)
  let lateFar = null; // (the vehicles 10+ min late far out when the stream is closed: set by main.js from src/doprava.js)
  const LATE10 = '@late10';
  const inFocus = (m, line = focusLine) => (line === LATE10 ? !!m.live && (m.delay || 0) >= 10 : String(m.line) === line);
  const FOCUS_COL = { tram: '#ff6a5c', trol: '#6fdc78', bus: '#64a8ff' };
  function lineVehicles(line) {
    const useLive = state.mhdMode === 'live' && live.alive();
    const list = useLive ? liveVehicles() : planWaits() ? [] : mhd.vehicles();
    return list.filter(m => inFocus(m, String(line)));
  }
  // The way the highlighted line goes: the routes of its trips under way now (both directions, every variant in
  // service; from the timetable, so it is there with live vehicles too). Looked up again every 20 s and once the
  // timetable has arrived; it stays on the map with the card closed, until the beacon is switched off.
  let focusRoutes = { line: null, at: 0, ready: false, list: [] };
  function lineRoutes() {
    if (focusLine === LATE10) return [];
    const now = performance.now(), ready = mhd.ready();
    if (focusRoutes.line === focusLine && focusRoutes.ready === ready && now - focusRoutes.at < 20000) return focusRoutes.list;
    const sec = mhd.now().sec, seen = new Set(), list = [];
    let c = mhd.candidates(focusLine, sec); // (not loaded yet: this starts the download)
    if (!c.length && /^\d+$/.test(focusLine)) c = mhd.candidates(Number(focusLine), sec);
    for (const pv of c) {
      if (seen.has(pv.p)) continue;
      seen.add(pv.p);
      const [, , ms, offs, names, nums] = pv.p;
      list.push({ shape: pv.shape, ms, offs, names, nums, t0: pv.t0, type: pv.type, div: diversion(pv.p, pv.line) });
    }
    // (no trip of the line under way now, a night line by day: its ways of today, so that the highlight still shows
    // where the line goes; the lines of Dnes v Brně that run differently are highlighted whatever the hour)
    if (!list.length && ready) for (const pv of mhd.lineWays(focusLine, mhd.dayChoices().today)) {
      const [, , ms, offs, names, nums] = pv.p;
      list.push({ shape: pv.shape, ms, offs, names, nums, t0: pv.t0, type: pv.type, div: diversion(pv.p, pv.line) });
    }
    focusRoutes = { line: focusLine, at: now, ready, list };
    return list;
  }
  function drawFocusLine(ctx, v, t, beacon) {
    if (focusLine == null || !state.layers.mhd) return;
    const cw = ctx.canvas.clientWidth, ch = ctx.canvas.clientHeight, near = v.z >= 0.18;
    { const named = new Set(); for (const R of lineRoutes()) drawRoute(ctx, v, cw, ch, R, named); }
    // (the vehicles of the other lines: over the way of the highlighted one, under its vehicles and their beacons)
    if (near && otherQ.length) { const ways = wayCells(); ctx.save(); for (const m of otherQ) drawVehicle(ctx, v, t, m, v.z >= 0.7, onWay(ways, m)); ctx.restore(); }
    const list = near ? focusQ : lineVehicles(focusLine);
    for (const m of list) {
      const x = v.ox + m.X * v.k, y = v.oy + m.Y * v.k;
      if (x < -60 || y < -60 || x > cw + 60 || y > ch + 60) continue;
      beacon(ctx, x, y, t, FOCUS_COL[m.type] || '#f3c868', near ? 30 : 18, Math.round(m.X + m.Y));
      if (!near) { // (zoomed out the vehicles are not drawn: the way each goes beside its beacon)
        const b = m.live ? liveBodySnapped(m, 20 * GEO.A, 2) : mhd.body(m, 20 * GEO.A, 2), d = wayOf(m, b, v);
        if (d) arrowQ.push([x, y - 3, d[0], d[1], 10, FOCUS_COL[m.type] || '#f3c868', 0.75]);
      }
    }
    ctx.save();
    if (near) for (const m of list) drawVehicle(ctx, v, t, m, v.z >= 0.7, true); // (on their own way: whole, not hatched behind the houses)
    ctx.restore();
  }
  // ------------------------------------------------------------ stops: signs on the map, click for departures
  const stopsCache = { img: null, stamp: -1, n: 0, S: null };
  function stopsImg() {
    const S = mhd.stops();
    const n = Object.keys(S).length;
    if (!n) { mhd.loadStops(); return []; }
    if (stopsCache.stamp !== fresh() || stopsCache.n !== n || stopsCache.S !== S) { // (S: another list, read again with a new timetable)
      stopsCache.S = S;
      const P = mhd.posts();
      stopsCache.img = Object.entries(S).map(([num, [name, lon, lat]]) => {
        const [X, Y] = llToImg(lon, lat);
        const posts = P[num] ? P[num].map(([p, lo, la, next, tmp]) => { const [x, y] = llToImg(lo, la); return { p, X: x, Y: y, next, tmp: !!tmp }; }) : null;
        return { num, name, X, Y, posts };
      });
      stopsCache.stamp = stamp; stopsCache.n = n;
    }
    return stopsCache.img;
  }
  let selectedStop = null, selectedPosts = null, drawnStops = [];
  let laneSnap = null; // cars into the lanes drawn in a traffic node: (X, Y, dx, dy, pick, strict) => [X, Y] | null | false (main.js, part "uzly")
  // The signs of a stop: one for each direction (post, sloupek) once they stand far enough apart on the screen, else
  // one in the middle as before. The distance is taken on the screen, not in metres: north-south the map is half as
  // long, so two posts 40 m apart across a street leading north part at 1.3 m per pixel, along it at 0.65.
  // Posts nearer than SPLIT pixels share a sign (the big interchanges open step by step).
  let postSigns = false;
  const SPLIT = 28;
  function stopSigns(st, v) {
    if (!postSigns || !st.posts || st.posts.length < 2) return [st];
    if (st.ck === v.k) return st.cl;
    const cl = [];
    for (const p of st.posts) {
      let c = null;
      for (const q of cl) if (Math.hypot((q.X - p.X) * v.k, (q.Y - p.Y) * v.k) < SPLIT) { c = q; break; }
      if (c) { c.X = (c.X * c.n + p.X) / (c.n + 1); c.Y = (c.Y * c.n + p.Y) / (c.n + 1); c.n++; c.posts.push(p.p); c.tmp = c.tmp && p.tmp; if (p.next && !c.next.includes(p.next)) c.next.push(p.next); }
      else cl.push({ num: st.num, name: st.name, X: p.X, Y: p.Y, n: 1, posts: [p.p], next: p.next ? [p.next] : [], tmp: p.tmp });
    }
    st.ck = v.k; st.cl = cl.length < 2 ? [st] : cl;
    return st.cl;
  }
  function stopSign(ctx, x, y, s, on, tmp = false) {
    if (tmp) { ctx.save(); ctx.globalAlpha = 0.7; }
    const ph = Math.round(14 * s), w = Math.round(11 * s);
    ctx.fillStyle = '#161d2b'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - ph, 3, ph);
    ctx.fillStyle = '#5b5f66'; ctx.fillRect(Math.round(x), Math.round(y) - ph, 1, ph);
    const sx = Math.round(x - w / 2), sy = Math.round(y - ph - w);
    ctx.fillStyle = '#161d2b'; ctx.fillRect(sx - 1, sy - 1, w + 2, w + 2);
    ctx.fillStyle = on ? '#f3c868' : tmp ? '#e0892b' : '#3b6fb6'; ctx.fillRect(sx, sy, w, w);
    ctx.fillStyle = tmp ? '#fff6dc' : '#ffffff'; ctx.fillRect(sx + 2, sy + 2, w - 4, w - 4);
    ctx.fillStyle = tmp ? '#8a4b12' : '#2b4f86'; ctx.font = `700 ${Math.max(8, Math.round(9 * s))}px "Atkinson Hyperlegible", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Z', sx + w / 2, sy + w / 2 + 0.5);
    if (tmp) ctx.restore();
    return [sx - 2, sy - 2, sx + w + 2, Math.round(y) + 2];
  }
  function drawStops(ctx, v, cw, ch, t) {
    drawnStops = [];
    const STOP_Z = 2 / 1.3; // stops only from 1.3 m per pixel (the selected one always)
    if (v.z < STOP_Z && selectedStop == null) return;
    const s = v.z >= 1.2 ? 1.25 : 1;
    ctx.save();
    for (const st of stopsImg()) {
      const x = v.ox + st.X * v.k, y = v.oy + st.Y * v.k;
      if (x < -20 || y < -30 || x > cw + 20 || y > ch + 20) continue;
      const on = selectedStop === st.num;
      if (v.z < STOP_Z && !on) continue;
      let lx = -1e9, ly = 0; // the name goes once, to the sign farthest right (its text runs away from the others)
      for (const g of stopSigns(st, v)) {
        const x = v.ox + g.X * v.k, y = v.oy + g.Y * v.k;
        if (x < -20 || y < -30 || x > cw + 20 || y > ch + 20) continue;
        if (on && (!selectedPosts || !g.posts || g.posts.some(p => selectedPosts.includes(p)))) { // (the ring: around the sign that was picked)
          ctx.strokeStyle = '#f3c868'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y - 12 * s, 18 + 3 * Math.sin(t / 250), 0, Math.PI * 2); ctx.stroke();
        }
        drawnStops.push([g, stopSign(ctx, x, y, s, on, g.tmp)]);
        if (g.tmp && (v.z >= 1.1 || on)) {
          ctx.font = '400 13px "VT323", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(22,29,43,.9)'; ctx.strokeText('dočasná', x, y + 3);
          ctx.fillStyle = '#ffd59a'; ctx.fillText('dočasná', x, y + 3);
        }
        if (x > lx) { lx = x; ly = y; }
      }
      if (lx > -1e9 && (v.z >= 1.1 || on)) {
        ctx.font = '400 15px "VT323", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(22,29,43,.9)'; ctx.strokeText(st.name, x + 9, y - 18 * s);
        ctx.fillStyle = '#ffffff'; ctx.fillText(st.name, x + 9, y - 18 * s);
      }
    }
    ctx.restore();
  }
  function stopAt(sx, sy) {
    for (const [st, r] of drawnStops) if (sx >= r[0] - 3 && sx <= r[2] + 3 && sy >= r[1] - 3 && sy <= r[3] + 3) return st;
    return null;
  }
  // current delay (minutes) of every trip that a live vehicle is running right now
  function liveDelays() {
    const out = new Map();
    if (!live.alive()) return out;
    for (const lv of liveVehicles()) {
      const pv = matchPlan(lv);
      if (pv && !out.has(pv.id)) out.set(pv.id, Math.round(lv.delay || 0));
    }
    return out;
  }

  // ------------------------------------------------------------ clicking a vehicle
  let drawnVehicles = [], selectedVehicle = null, hoverVehicle = null, selPos = null, rideId = null, ridePos = null, rideM = null;
  // generous hit area: anywhere along the body (segments, not just points) or on the line-number badge
  function vehicleAt(sx, sy) {
    const big = bigUi();
    let best = null, bd = big ? 24 : 16; // (a finger is wider than a mouse pointer)
    for (const [m, pts, labels] of drawnVehicles) {
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const ax = pts[i], ay = pts[i + 1] - 5, bx = pts[i + 2], by = pts[i + 3] - 5;
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        const tt = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / L2));
        const d = Math.hypot(ax + dx * tt - sx, ay + dy * tt - sy);
        if (d < bd) { bd = d; best = m; }
      }
      if (labels && Math.abs(sx - pts[0]) < (big ? 26 : 18) && sy < pts[1] - 4 && sy > pts[1] - (big ? 46 : 40)) { best = m; bd = 0; } // (the badge: a quarter bigger on phones)
    }
    hoverVehicle = best ? best.id : null;
    return best;
  }

  // ------------------------------------------------------------ hit tests for clicks
  // the accident sign under a point (drawn over the works and the closures, so it is clicked before them)
  function accidentAt(sx, sy, v) {
    const T = state.layers.jams && trafficImg();
    if (!T) return null;
    for (const c of liveAccidents(T)) if ((level(c) > 1 || v.z >= ALERT_Z || liveAll) && !(c.h && state.layers.hasici && isLive(c, Date.now())) && Math.hypot(v.ox + c.X * v.k - sx, v.oy + c.Y * v.k - sy) < 12) return { nehoda: c };
    return null;
  }
  function trafficAt(sx, sy, v) {
    const ac = accidentAt(sx, sy, v);
    if (ac) return ac;
    const cl = closureAt(sx, sy, v);
    if (cl) return cl;
    const wk = workAt(sx, sy, v);
    if (wk) return wk;
    const T = (state.layers.jams || state.layers.closures) && trafficImg();
    if (!T) return null;
    if (v.z >= ALERT_Z) for (const a of T.alerts) if (a.type !== 'ACCIDENT' && (a.type === 'ROAD_CLOSED' ? state.layers.closures : state.layers.jams) && Math.hypot(v.ox + a.X * v.k - sx, v.oy + a.Y * v.k - sy) < 12) return { alert: a };
    const px = (sx - v.ox) / v.k, py = (sy - v.oy) / v.k, pr = 7 / v.k; // the pointer and its reach in image px
    if (state.layers.jams) for (const j of T.jams) {
      if (px < j.bb[0] - pr || px > j.bb[2] + pr || py < j.bb[1] - pr || py > j.bb[3] + pr) continue; // (nowhere near this jam)
      for (let i = 0; i + 3 < j.pts.length; i += 2) {
        const ax = v.ox + j.pts[i] * v.k, ay = v.oy + j.pts[i + 1] * v.k, bx = v.ox + j.pts[i + 2] * v.k, by = v.oy + j.pts[i + 3] * v.k;
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        const tt = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / L2));
        if (Math.hypot(ax + dx * tt - sx, ay + dy * tt - sy) < 7) return { jam: j };
      }
    }
    return null;
  }

  return { drawAccidents, drawArrows, drawBadges, veil: veilHouses, setOccluder: f => (occluder = f), llToImg, draw, projectsAt, projectTags, projectDetail, trafficAt, inJam, deadList, traffic, proj, mhd, live, matchPlan, setRoute, setLineRoute, setClosureEnd: f => (closureEnd = f), selectWork: g => { selWork = g || null; }, workItem: id => (worksImg() || []).find(c => c.id === id) || null, stopAt, liveDelays, selectStop: (num, posts = null) => { selectedStop = num; selectedPosts = num == null ? null : posts; }, setPostSigns: on => { postSigns = !!on; }, setLaneSnap: f => { laneSnap = f || null; }, vehicleAt, selectVehicle: id => { if (id !== selectedVehicle) selPos = null; selectedVehicle = id; if (!id) selRoute = null; }, selectedPos: () => selPos, craneAt, projOn, areaHidden, setAreaHidden, projectPos, drawnVehicles: () => drawnVehicles.map(d => d[0]), setLateFar: f => (lateFar = f), setFocusLine: line => { focusLine = line == null ? null : String(line); focusQ = []; otherQ = []; }, focusLine: () => focusLine, lineVehicles, allLive: () => (state.mhdMode === 'live' && live.alive() ? liveVehicles() : []), drawFocusLine, setRide: id => { rideId = id; ridePos = null; rideM = null; }, ridePos: () => ridePos, rideVehicle: () => rideM, stamp: () => fresh(), dataStamp: () => dataV, setPosition, confirmPosition, resetPosition, ownCorrections, correction, positionInfo, clos: () => clos.data, works: () => { if (!works.data) worksImg(); return works.data; },
    // the places of the works for the highlight: one per site (its cone) and the NDIC reports (image points; [] until loaded)
    workPts: () => (worksImg() && works.groups ? [...works.groups.map(g => g.XY), ...(works.pts || []).map(q => q.XY)] : []) };
}

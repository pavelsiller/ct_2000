import { fetchData, watchFeed, RELOAD } from './feed.js';
import { itemInMap, clipLine } from './extent.js';
import { CAR_COLORS } from './vehicles.js';
export const CISTENI_WEB = 'https://cisteni.bkom.cz';
export const RANGES = { d: 1, w: 7, m: 31, a: Infinity }; // the range → the last day shown (0 = today)
const DAY = 864e5;
const FAR_Z = 2 / 45; // today and tomorrow are drawn from 45 m per pixel (the whole city in view) …
const NEAR_Z = 2 / 14; // … the later dates from 14 m per pixel, as the closures
const SIGN_Z = 1; // the signs from 2 m per pixel
const CHIP_Z = 2; // the chips with the day and the hours from 1 m per pixel
const INK = '#161d2b', BLUE = '#12a0ff', LIGHT = '#7ad0ff', PALE = '#9fb4c4';
const MX = 72900, MY = 111200; // metres per degree in Brno
const STRETCH = 1000; // metres of street per sweeper
const SPEED = 4; // metres per second (faster than a real sweeper, so that it is seen to move)
const TRUCK_Z = 0.5; // the sweepers and the tow trucks from 4 m per pixel
const WORKER_Z = 1; // the street cleaners from 2 m per pixel
const WORKERS_KM = 5; // street cleaners to a kilometre of street
const WALK = 0.45; // their pace, metres per second
const TOW = { first: [15, 45], next: [30, 180], away: 20, load: 26, reach: 90, ends: 40, speed: 6 }; // seconds: the tow truck comes this long after the parked car is first seen, and after the car before it was taken; a scene not watched this long waits again; the loading; metres it drives in and out, metres it keeps from the ends of the street, m/s
const WD = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

const hm = d => (d.getMinutes() ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` : `${d.getHours()}`);
/** "8–12", "10–14:30" */
export const hoursText = o => `${hm(new Date(o.from))}–${hm(new Date(o.to))}`;
/** "út 18. 11." */
export const dayText = o => { const d = new Date(o.from); return `${WD[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`; };

/**
 * @param base the address of the page (data/…)
 * @param llToImg (lon, lat) → image point
 * @param A image px per metre (GEO.A)
 * @param occluder (X, Y) → the building that hides this image point, or null
 * @param veil (ctx, v, t, Set of buildings) → draws those houses see-through (layers.veil, as for a ridden vehicle of MHD)
 * @param range () → 'd' | 'w' | 'm' | 'a'
 * @param lite () → a slow device: plain lines, no pulse
 * @param onChange called after every load
 */
export function createCisteni({ base, llToImg, A = 1, occluder = null, veil = null, range = () => 'd', lite = () => false, onChange = () => {} }) {
  const D = { items: [], updated: '', loaded: false };
  let loading = null, posKey = '', stateAt = 0, vis = [], hits = []; // (vis: the sections drawn; hits: the boxes of their signs and chips, [x0, y0, x1, y1, section])
  const SHIFT = 0;
  const now = () => Date.now() + (SHIFT || 0);
  const midnight = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

  const read = init => fetchData(`${base}data/cisteni.json`, init).then(r => r.json()).then(d => {
    D.items = (d.items || []).filter(itemInMap).map(o => ({ ...o, p: o.p.flatMap(clipLine), t0: Date.parse(o.from), t1: Date.parse(o.to) })).filter(o => o.p.length && o.t0 && o.t1);
    D.updated = d.updated || ''; D.loaded = true; posKey = ''; stateAt = 0;
    onChange();
  }).catch(() => {});
  const load = () => (loading ||= read());
  watchFeed('cisteni.json', () => (loading ? read(RELOAD) : null));

  // the state of every cleaning, worked out again once a minute:
  // day: days from today (0 today, 1 tomorrow; past days are dropped); st: now | today | done | tomorrow | week | later
  function states() {
    const t = now();
    if (t - stateAt < 60e3 && stateAt) return;
    stateAt = t;
    const m0 = midnight(t);
    for (const o of D.items) {
      o.day = Math.round((midnight(o.t0) - m0) / DAY);
      o.st = o.day < 0 ? 'past' : o.day === 0 ? (t >= o.t1 ? 'done' : t >= o.t0 ? 'now' : 'today') : o.day === 1 ? 'tomorrow' : o.day <= 7 ? 'week' : 'later';
    }
  }
  function positions() {
    const key = `${llToImg(16.6, 49.2).join(',')}|${D.items.length}|${D.updated}`;
    if (key === posKey) return;
    posKey = key;
    for (const o of D.items) {
      o.parts = o.p.map(l => { const pts = []; for (let i = 0; i < l.length; i += 2) pts.push(...llToImg(l[i], l[i + 1])); return pts; });
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of o.parts) for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
      o.bb = [x0, y0, x1, y1];
      [o.X, o.Y] = llToImg(o.lon, o.lat);
      o.runs = runsOf(o);
    }
    fleetKey = '';
  }
  // ---- the sweepers: while a cleaning runs, a small orange sweeper drives along its streets there and back.
  // The lines of a section that follow one another are joined into runs. A run longer than about a kilometre is cut
  // into stretches of a kilometre, one sweeper in each, so two never meet; the short runs near one another share a
  // sweeper up to a kilometre in all (it does one street there and back, then the next one).
  const metres = (a, b, c, d) => Math.hypot((c - a) * MX, (d - b) * MY);
  const flip = f => { const r = []; for (let i = f.length - 2; i >= 0; i -= 2) r.push(f[i], f[i + 1]); return r; };
  function runsOf(o) {
    const used = new Set(), out = [];
    for (let i = 0; i < o.p.length; i++) {
      if (used.has(i)) continue;
      used.add(i);
      const ll = [...o.p[i]], im = [...o.parts[i]];
      for (let grown = true; grown;) {
        grown = false;
        for (let j = 0; j < o.p.length; j++) {
          if (used.has(j)) continue;
          const b = o.p[j], ex = ll[ll.length - 2], ey = ll[ll.length - 1];
          const head = metres(ex, ey, b[0], b[1]) < 15, tail = !head && metres(ex, ey, b[b.length - 2], b[b.length - 1]) < 15;
          if (!head && !tail) continue;
          ll.push(...(head ? b : flip(b)).slice(2)); im.push(...(head ? o.parts[j] : flip(o.parts[j])).slice(2));
          used.add(j); grown = true;
        }
      }
      const cum = [0];
      for (let k = 2; k < ll.length; k += 2) cum.push(cum[cum.length - 1] + metres(ll[k - 2], ll[k - 1], ll[k], ll[k + 1]));
      const len = cum[cum.length - 1], m = Math.floor(ll.length / 4) * 2;
      if (len >= 25) out.push({ im, ll, cum, len, lon: ll[m], lat: ll[m + 1] });
    }
    return out;
  }
  let fleetKey = '', trucks = [];
  function fleet() {
    const running = D.items.filter(o => o.st === 'now');
    const key = `${posKey}|${running.length}|${running.reduce((a, o) => a + o.id, 0)}`;
    if (key === fleetKey) return trucks;
    fleetKey = key; trucks = [];
    const short = new Set();
    for (const r of running.flatMap(o => o.runs || [])) {
      if (r.len < STRETCH * 1.3) { short.add(r); continue; }
      const n = Math.round(r.len / STRETCH);
      for (let k = 0; k < n; k++) trucks.push({ legs: [{ r, a: (k * r.len) / n, b: ((k + 1) * r.len) / n }] });
    }
    while (short.size) {
      let cur = short.values().next().value, sum = cur.len;
      short.delete(cur);
      const legs = [{ r: cur, a: 0, b: cur.len }];
      while (sum < STRETCH) {
        let best = null, bd = 400;
        for (const r of short) { const d = metres(cur.lon, cur.lat, r.lon, r.lat); if (d < bd && sum + r.len < STRETCH * 1.3) { bd = d; best = r; } }
        if (!best) break;
        short.delete(best); legs.push({ r: best, a: 0, b: best.len }); sum += best.len; cur = best;
      }
      trucks.push({ legs });
    }
    trucks.forEach((tr, i) => { tr.total = tr.legs.reduce((a, l) => a + 2 * (l.b - l.a), 0); tr.off = (i * 137) % Math.max(1, tr.total); tr.i = i; });
    return trucks;
  }
  // a point of a run at m metres from its start: [X, Y, dX, dY, lon, lat] (image point, the direction of the run)
  function runPoint(r, m) {
    const { im, ll, cum } = r;
    m = Math.max(0, Math.min(r.len, m));
    let k = 1;
    while (k < cum.length - 1 && cum[k] < m) k++;
    const f = (m - cum[k - 1]) / (cum[k] - cum[k - 1] || 1), ax = im[2 * k - 2], ay = im[2 * k - 1], bx = im[2 * k], by = im[2 * k + 1];
    return [ax + (bx - ax) * f, ay + (by - ay) * f, bx - ax, by - ay, ll[2 * k - 2] + (ll[2 * k] - ll[2 * k - 2]) * f, ll[2 * k - 1] + (ll[2 * k + 1] - ll[2 * k - 1]) * f];
  }
  // a point of the round of a stretch (each of its streets there and back) at s metres; the direction is the one of travel
  function roundPoint(tr, s) {
    s = ((s % tr.total) + tr.total) % tr.total;
    for (const l of tr.legs) {
      const L = l.b - l.a;
      if (s >= 2 * L) { s -= 2 * L; continue; }
      const fwd = s < L, p = runPoint(l.r, fwd ? l.a + s : l.b - (s - L));
      if (!fwd) { p[2] = -p[2]; p[3] = -p[3]; }
      p.leg = l; p.m = fwd ? l.a + s : l.b - (s - L); // (which street of the stretch, and how far along it)
      return p;
    }
    return null;
  }
  // where a sweeper would be by the clock alone
  const truckAt = (tr, sec) => roundPoint(tr, sec * SPEED + tr.off);
  // the part of a street the tow truck of a scene uses (it drives in, stands, drives out), with a gap at both ends
  const inTowZone = (e, p, gap) => !!p && p.leg.r === e.leg.r && p.m > e.m0 - e.dIn - gap && p.m < e.m0 + e.dOut + gap;
  // where a sweeper is now. It follows the clock, but it never drives into the tow truck: while a tow truck is on a
  // street, a sweeper (of any stretch of that street) that would enter its part of the street waits at the edge (and the tow truck does not set off
  // while the sweeper is inside, see towAt). Kept per stretch in tr.sw: s the metres driven, t the time of the last look.
  // gap: metres to keep from the tow truck's part of the street (the vehicles are drawn larger than life, so it grows when zoomed out)
  function sweeperAt(tr, sec, gap) {
    let st = tr.sw;
    if (!st) st = tr.sw = { s: sec * SPEED + tr.off, t: sec }; // (the first look: by the clock)
    if (sec - st.t > 2 || sec < st.t) st.t = sec; // (the page was away: it goes on from where it stood; a jump by the clock could land it on the tow truck)
    const next = st.s + (sec - st.t) * SPEED, pn = roundPoint(tr, next), pc = roundPoint(tr, st.s);
    st.t = sec; tr.gap = gap;
    // (the tow trucks of every stretch count: a long street is cut into stretches and the neighbour's truck works on the same street)
    // … and it never drives closer to a tow truck that is near, whatever street that one is on (round a corner, across a junction)
    const near = x => x.tow.at && pn && pc && metres(pn[4], pn[5], x.tow.at[0], x.tow.at[1]) < gap && metres(pn[4], pn[5], x.tow.at[0], x.tow.at[1]) < metres(pc[4], pc[5], x.tow.at[0], x.tow.at[1]);
    if (!trucks.some(x => x.tow && x.tow.going && ((inTowZone(x.tow, pn, gap) && !inTowZone(x.tow, pc, gap)) || near(x)))) st.s = next;
    return roundPoint(tr, st.s);
  }
  const rnd = (a, b) => { const q = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return q - Math.floor(q); };
  // ---- the street cleaners: about five to a kilometre of a stretch, in orange vests, each walks slowly along the
  // streets of the stretch (there and back, on its own beat and its own side of the street) and sweeps with a broom
  function workersOf(tr, sec) {
    const n = Math.max(1, Math.round((WORKERS_KM * tr.total) / 2 / STRETCH)), out = [];
    for (let i = 0; i < n; i++) {
      const p = roundPoint(tr, sec * WALK * (0.75 + 0.5 * rnd(i, tr.i)) + (tr.total * (i + 0.5)) / n);
      if (p) out.push([p, (i % 2 ? 1 : -1) * (1.9 + rnd(i + 2, tr.i) * 0.9), i + tr.i * 7]);
    }
    return out;
  }
  // ---- the tow truck: in every stretch a car is left parked at the kerb. From the moment the visitor has come close
  // and that car is in view, the tow truck comes after a random 15–45 s: it drives in along the street, stops beside
  // the car, lifts it on its bed with the crane and drives away with it. Then another car (of another colour) stands
  // somewhere else in the stretch and its tow truck comes after a random 30 s – 3 min. A scene nobody has watched for a
  // while waits again for the visitor. (Unlike the sweepers this is remembered, per stretch, in tr.tow.)
  const between = ([a, b]) => a + Math.random() * (b - a);
  function newTow(tr, sec, prevCol) {
    const legs = tr.legs.filter(l => l.b - l.a >= 110);
    if (!legs.length) return null;
    const leg = legs[Math.floor(Math.random() * legs.length)], m0 = leg.a + (leg.b - leg.a) * (0.3 + 0.4 * Math.random());
    const cols = CAR_COLORS.filter(c => c !== prevCol);
    return { leg, m0, spot: runPoint(leg.r, m0), side: Math.random() < 0.5 ? 1 : -1, col: cols[Math.floor(Math.random() * cols.length)],
      // (the truck keeps TOW.ends metres from both ends of the street: a sweeper may stand at the junction, on the street round the corner)
      dIn: Math.max(0, Math.min(TOW.reach, m0 - leg.a - TOW.ends)), dOut: Math.max(0, Math.min(TOW.reach, leg.b - m0 - TOW.ends)), born: sec, lastSeen: sec, startAt: null };
  }
  // visible(e): is the parked car of the scene in view?
  // -> { spot (the point of the street), side, col, phase: kerb | in | load | out, truck (its point), p (0..1 of the loading), alpha }
  function towAt(tr, sec, visible = () => false) {
    if (tr.tow === undefined) tr.tow = newTow(tr, sec, null);
    let e = tr.tow;
    if (!e) return null;
    const see = visible(e);
    if (see) e.lastSeen = sec;
    if (e.startAt == null) { if (see) e.startAt = sec + between(TOW.first); } // the first sight of the car: the truck is on its way
    else if (sec < e.startAt && sec - e.lastSeen > TOW.away) e.startAt = null; // nobody watches: wait for the visitor again
    // (its time has come: it sets off only once the sweeper is out of its part of the street, so the two never meet)
    if (e.startAt != null && sec >= e.startAt && !e.going) { if (trucks.some(x => x.sw && inTowZone(e, roundPoint(x, x.sw.s), tr.gap || 20))) e.startAt = sec + 0.5; else e.going = true; }
    const u = e.startAt == null ? -1 : sec - e.startAt, a1 = e.dIn / TOW.speed, a2 = a1 + TOW.load, a3 = a2 + e.dOut / TOW.speed;
    if (u >= a3) { e = tr.tow = newTow(tr, sec, e.col); if (!e) return null; e.startAt = sec + between(TOW.next); } // the next car of the stretch
    const o = { spot: e.spot, side: e.side, col: e.col, truck: null, p: 0, alpha: 1 }, w = e.startAt == null ? -1 : sec - e.startAt;
    if (w < 0) { o.phase = 'kerb'; o.alpha = Math.min(1, (sec - e.born) / 3); }
    else if (w < a1) { o.phase = 'in'; o.truck = runPoint(e.leg.r, e.m0 - e.dIn + w * TOW.speed); o.alpha = Math.min(1, w / 2); }
    else if (w < a2) { o.phase = 'load'; o.truck = e.spot; o.p = (w - a1) / TOW.load; }
    else { o.phase = 'out'; o.truck = runPoint(e.leg.r, e.m0 + (w - a2) * TOW.speed); o.alpha = Math.min(1, (a3 - w) / 2); }
    e.at = o.truck ? [o.truck[4], o.truck[5]] : null; // (where the truck is, lon and lat: the sweepers keep away from it)
    return o;
  }

  // ---- the vehicles, in the manner of the fire engine (src/hasici.js): built up layer by layer along the direction
  // of the street, so they always drive nose first, and drawn larger than life.
  // The ground frame of a vehicle: (x, y) the middle of its footprint on the screen, (ux, uy) its direction on the screen
  function frame(ctx, x, y, ux, uy) {
    const gn = Math.hypot(ux, 2 * uy) || 1, px = (-2 * uy) / gn, py = ux / (2 * gn);
    ux /= gn; uy /= gn;
    // a point: c along the length, d to the side, lift px up
    const at = (c, d = 0, lift = 0) => [x + ux * c + px * d, y + uy * c + py * d - lift];
    // a rectangle: c its centre along the length, a half length, b half width, lift px up, d its centre to the side
    const quad = (c, a, b, lift, col, d = 0) => {
      const [cx, cy] = at(c, d, lift);
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(cx + ux * a + px * b, cy + uy * a + py * b); ctx.lineTo(cx + ux * a - px * b, cy + uy * a - py * b);
      ctx.lineTo(cx - ux * a - px * b, cy - uy * a - py * b); ctx.lineTo(cx - ux * a + px * b, cy - uy * a + py * b);
      ctx.fill();
    };
    // a wheel on the side that is seen (the one lower on the screen), at c along the length, hw to the side
    const wheel = (c, hw, wr) => {
      const sd = py >= 0 ? 1 : -1, [wx, wy] = at(c, hw * sd, wr * 0.35);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(wx, wy, wr * Math.max(0.45, Math.abs(ux)), wr, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b9bfc8'; ctx.beginPath(); ctx.ellipse(wx, wy, wr * 0.42 * Math.max(0.45, Math.abs(ux)), wr * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    };
    return { at, quad, wheel, ux, uy, px, py };
  }
  // ---- the sweeper, after the street sweepers that clean Brno: orange all over, 7 × 2.4 × 3 m. A flat-nosed cab
  // with a tall dark windscreen, a black bumper and grille, a red-and-white board and a yellow line on the cab, an
  // amber beacon on its roof; behind a dark gap the orange hopper with a blue marking on its side, black mudguards,
  // a round brush under the middle on each side; a spray bar under the nose with fans of water, a wet trail behind.
  // m: screen px per metre
  function sweeper(ctx, x, y, ux, uy, m, t, plain) {
    const F = frame(ctx, x, y, ux, uy), { quad, at } = F;
    const hl = 3.5 * m, hw = 1.2 * m, h = Math.max(7, Math.round(3 * m * 0.6));
    const alpha = ctx.globalAlpha, ORANGE = '#f47a1c', DARK = '#23272f';
    // the wet trail behind: a shiny strip that fades
    for (let i = 0; i < 6; i++) { ctx.globalAlpha = alpha * (0.34 - i * 0.05); quad(-hl - (i + 0.5) * hl * 0.45, hl * 0.24, hw * 0.95, 0, '#5fb8f2'); }
    ctx.globalAlpha = alpha;
    quad(0, hl + 2, hw + 2, -2, 'rgba(0,0,0,.3)'); // shadow
    // the water: three fans from the spray bar under the nose (to both sides and ahead): a pale wedge on the ground and drops that fly out and fade
    if (!plain) {
      const jets = [[1, 0.25, 1], [1, -0.25, -1], [1.25, 0, 0]], N = 16;
      ctx.globalAlpha = alpha * (0.3 + 0.08 * Math.sin((t || 0) / 130)); ctx.fillStyle = '#a9dcff';
      for (const [fwd, start, side] of jets) {
        const p0 = at(hl * 0.95, hw * start), p1 = at(hl * (0.95 + fwd * 0.8), hw * (start + side * 2.6 + (side ? 0 : 0.9))), p2 = at(hl * (0.95 + fwd * 0.8), hw * (start + side * 1.1 - (side ? 0 : 0.9)));
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.fill();
      }
      for (const [fwd, start, side] of jets) for (let i = 0; i < N; i++) {
        const f = ((t || 0) / 320 + i / N + (side + 1) * 0.17) % 1, wob = Math.sin(i * 12.9 + side * 4.1) * 0.35;
        const [dx, dy] = at(hl * (0.95 + fwd * 0.75 * f), hw * (start + side * (0.5 + 1.9 * f) + wob * f), Math.sin(f * Math.PI) * m * 0.9);
        const r = Math.max(1.5, m * (0.22 + 0.3 * f));
        ctx.globalAlpha = alpha * Math.min(1, (1 - f) * 1.6);
        ctx.fillStyle = i % 3 ? '#9ad8ff' : '#e6f6ff'; ctx.fillRect(Math.round(dx - r / 2), Math.round(dy - r / 2), Math.ceil(r), Math.ceil(r));
      }
      const [mx, my] = at(hl * 1.35, 0, m * 0.3), R = hw * 2.6, g = ctx.createRadialGradient(mx, my, 0, mx, my, R);
      g.addColorStop(0, 'rgba(190,230,255,.5)'); g.addColorStop(1, 'rgba(190,230,255,0)');
      ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(mx - R, my - R, 2 * R, 2 * R);
    }
    ctx.globalAlpha = alpha;
    // the round brushes under the middle, one on each side, turning
    const br = Math.max(2, 0.8 * m), spin = (t || 0) / 90;
    for (const side of [1, -1]) {
      const [bx, by] = at(hl * 0.08, hw * 1.12 * side);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(bx, by, br, br * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6c7482'; ctx.beginPath(); ctx.ellipse(bx, by, br * 0.7, br * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      if (!plain) { ctx.strokeStyle = '#c3c8d0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx - Math.cos(spin) * br * 0.7, by - Math.sin(spin) * br * 0.38); ctx.lineTo(bx + Math.cos(spin) * br * 0.7, by + Math.sin(spin) * br * 0.38); ctx.stroke(); }
    }
    quad(0, hl + 1, hw + 1, 0, INK); // the dark foot: wheels and chassis
    const cabC = hl * 0.69, cabA = hl * 0.31, bodyC = -hl * 0.34, bodyA = hl * 0.62; // the cab: the front third; the hopper behind a gap
    const wr = Math.max(2.2, 0.56 * m);
    for (let j = 1; j <= h; j++) {
      const f = j / h;
      quad(0, hl, hw, j, f < 0.3 ? DARK : INK); // the chassis and, above it, the dark gap between the cab and the hopper
      if (f >= 0.24) quad(bodyC, bodyA, hw, j, f > 0.92 ? '#ff9a3d' : ORANGE); // the hopper
      if (f > 0.56 && f < 0.72) quad(bodyC + hl * 0.06, hl * 0.34, hw + 0.02, j, '#2b3fb0'); // the blue marking on its sides
      if (f >= 0.24) quad(bodyC - bodyA + Math.max(0.6, hl * 0.02), Math.max(0.6, hl * 0.02), hw + 0.02, j, '#d96a14'); // the edge of the rear door
      if (f >= 0.16) quad(cabC, cabA, hw, j, ORANGE); // the cab
      if (f < 0.34) quad(hl * 0.94, hl * 0.06, hw + 0.02, j, DARK); // the black bumper and grille
      if (f >= 0.28 && f < 0.34) quad(cabC - hl * 0.06, cabA - hl * 0.06, hw + 0.02, j, '#ffd23c'); // the yellow line along the cab
      if (f >= 0.36 && f < 0.48) { quad(hl * 0.985, Math.max(0.8, hl * 0.02), hw * 0.92, j, '#ffffff'); for (const d of [-0.62, 0.62]) quad(hl * 0.99, Math.max(0.8, hl * 0.02), hw * 0.2, j, '#d8342c', hw * d); } // the red-and-white board on the nose
      if (f > 0.5 && f < 0.92) { quad(cabC + hl * 0.03, cabA - hl * 0.07, hw + 0.02, j, '#1e2a3c'); quad(hl * 0.985, Math.max(0.8, hl * 0.02), hw * 0.9, j, '#2a3a52'); } // the side windows and the tall windscreen
      if (f > 0.5 && f < 0.92) quad(cabC - cabA * 0.25, Math.max(0.6, hl * 0.02), hw + 0.03, j, ORANGE); // the door post
      if (f < 0.4) for (const c of [hl * 0.6, -hl * 0.52]) quad(c, wr * 1.25, hw + 0.03, j, INK); // the black mudguards
    }
    F.wheel(hl * 0.6, hw, wr); F.wheel(-hl * 0.52, hw, wr);
    quad(bodyC, bodyA, hw, h, '#ff9a3d'); quad(bodyC, bodyA - 1, hw * 0.55, h + 1, ORANGE); // the top of the hopper, with its ridge
    quad(bodyC + bodyA * 0.55, Math.max(1.2, hl * 0.07), hw * 0.7, h + 1, '#d96a14'); // the hatch
    quad(cabC, cabA, hw, h, '#ff8d2e'); quad(hl * 0.95, hl * 0.05, hw, h, DARK); // the roof of the cab and the dark visor over the windscreen
    for (const d of [-0.62, 0.62]) quad(hl, Math.max(0.8, hl * 0.02), hw * 0.2, Math.round(h * 0.18), '#fff6d8', hw * d); // the headlights
    // the amber beacon on the roof of the cab: it flashes calmly, with a small soft glow
    const lit = Math.floor((t || 0) / 260) % 2 === 0, [gx, gy] = at(cabC - cabA * 0.2, -hw * 0.45, h + 3);
    for (let j = 1; j <= 3; j++) quad(cabC - cabA * 0.2, Math.max(1.2, hl * 0.045), Math.max(1.2, hw * 0.16), h + j, lit ? '#ffe9a0' : '#ff9d1c', -hw * 0.45);
    if (!plain && lit) {
      const R = 5 + m * 1.6, g = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
      g.addColorStop(0, 'rgba(255,236,170,.6)'); g.addColorStop(0.4, 'rgba(255,180,50,.25)'); g.addColorStop(1, 'rgba(255,160,30,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(gx - R, gy - R, 2 * R, 2 * R); ctx.restore();
    }
    ctx.globalAlpha = alpha;
  }
  // ---- a parked car, 4.4 × 1.8 × 1.45 m, of the colour col; lift: px above the ground (on the hook or on the bed)
  function car(ctx, x, y, ux, uy, m, col, lift = 0) {
    const { quad, wheel } = frame(ctx, x, y - lift, ux, uy);
    const hl = 2.2 * m, hw = 0.9 * m, h = Math.max(4, Math.round(1.45 * m * 0.6));
    if (!lift) quad(0, hl + 1.5, hw + 1.5, -1.5, 'rgba(0,0,0,.3)');
    quad(0, hl + 0.8, hw + 0.8, 0, INK);
    for (let j = 1; j <= h; j++) {
      const f = j / h;
      if (f <= 0.55) quad(0, hl, hw, j, f < 0.18 ? INK : col);
      else { quad(-hl * 0.08, hl * 0.52, hw * 0.92, j, '#27344d'); quad(-hl * 0.08, Math.max(0.5, hl * 0.03), hw * 0.94, j, col); }
    }
    wheel(hl * 0.6, hw, Math.max(1.5, 0.36 * m)); wheel(-hl * 0.6, hw, Math.max(1.5, 0.36 * m));
    quad(-hl * 0.08, hl * 0.48, hw * 0.88, h, col); quad(-hl * 0.08, hl * 0.4, hw * 0.6, h, 'rgba(255,255,255,.22)'); // the roof, with a shine
    for (const d of [-0.6, 0.6]) { quad(hl, Math.max(0.6, hl * 0.03), hw * 0.22, Math.round(h * 0.35), '#fff6d8', hw * d); quad(-hl, Math.max(0.6, hl * 0.03), hw * 0.22, Math.round(h * 0.35), '#d8342c', hw * d); }
  }
  // ---- the tow truck, 7 × 2.4 m: a white cab with an amber light bar, a low flat bed with yellow edges, a blue crane
  // behind the cab. load: null, or { col, d, lift } the car it carries (d to the side of the bed, lift above the
  // ground, both px), hook: the crane holds it (the arm reaches over it and a rope goes down)
  const TOW_HL = 3.5, TOW_BED = -0.3; // half length in metres; the middle of the bed along the length, in half lengths
  function towTruck(ctx, x, y, ux, uy, m, t, load = null, hook = false) {
    const F = frame(ctx, x, y, ux, uy), { quad, at } = F;
    const hl = TOW_HL * m, hw = 1.2 * m, h = Math.max(6, Math.round(2.6 * m * 0.6)), hb = Math.max(3, Math.round(h * 0.42));
    const cabC = hl * 0.7, cabA = hl * 0.3, bedC = hl * TOW_BED, bedA = hl * 0.68, wr = Math.max(2, 0.5 * m);
    quad(0, hl + 2, hw + 2, -2, 'rgba(0,0,0,.3)');
    quad(0, hl + 1, hw + 1, 0, INK);
    for (let j = 1; j <= h; j++) {
      const f = j / h;
      if (j <= hb) quad(bedC, bedA, hw, j, j < hb * 0.55 ? '#23272f' : j === hb ? '#f2c21c' : '#c9ced6'); // the bed: dark frame, grey side, yellow edge
      quad(cabC, cabA, hw, j, f < 0.2 ? '#23272f' : '#f4f5f2'); // the cab: dark bumper, white
      if (f > 0.5 && f < 0.9) { quad(cabC + hl * 0.03, cabA - hl * 0.07, hw + 0.02, j, '#1e2a3c'); quad(hl * 0.985, Math.max(0.8, hl * 0.02), hw * 0.9, j, '#2a3a52'); }
      if (f > 0.3 && f < 0.38) quad(cabC, cabA, hw + 0.02, j, '#f08a3c'); // an orange line round the cab
    }
    F.wheel(hl * 0.6, hw, wr); F.wheel(-hl * 0.5, hw, wr);
    quad(bedC, bedA, hw, hb, '#aeb4bd'); quad(bedC, bedA - 1, hw * 0.55, hb, '#c9453a'); // the floor of the bed with its red ramp
    quad(cabC, cabA, hw, h, '#ffffff');
    const on = Math.floor((t || 0) / 260) % 2 === 0;
    quad(cabC - cabA * 0.3, Math.max(1.2, hl * 0.04), hw * 0.4, h + 1, on ? '#ffe9a0' : '#ff9d1c', -hw * 0.45); quad(cabC - cabA * 0.3, Math.max(1.2, hl * 0.04), hw * 0.4, h + 1, on ? '#ff9d1c' : '#ffe9a0', hw * 0.45); // the light bar
    for (const d of [-0.62, 0.62]) quad(hl, Math.max(0.8, hl * 0.02), hw * 0.2, Math.round(h * 0.2), '#fff6d8', hw * d);
    // the car on the bed or on the hook
    const top = Math.round(h * 1.5), colC = hl * 0.34; // the top of the crane's column, its place along the length
    if (load && !hook) { const [cx, cy] = at(bedC, load.d); car(ctx, cx, cy, ux, uy, m, load.col, load.lift); }
    // the crane: a blue column behind the cab and its arm (folded along the bed, or reaching over the car)
    for (let j = hb; j <= top; j++) quad(colC, Math.max(1.2, hl * 0.05), Math.max(1.2, hw * 0.28), j, j % 4 ? '#2456c8' : '#1b3f96');
    const [ax, ay] = at(colC, 0, top), tip = hook && load ? at(bedC, load.d, load.lift + Math.round(1.45 * m * 0.6) + m * 1.3) : at(bedC - bedA * 0.55, 0, hb + m * 1.2);
    ctx.strokeStyle = '#1b3f96'; ctx.lineWidth = Math.max(2, m * 0.42) + 1.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.strokeStyle = '#3b74e6'; ctx.lineWidth = Math.max(2, m * 0.42); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    if (hook && load) {
      const [cx, cy] = at(bedC, load.d);
      car(ctx, cx, cy, ux, uy, m, load.col, load.lift);
      const roof = at(bedC, load.d, load.lift + Math.round(1.45 * m * 0.6));
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); for (const e of [-0.5, 0.5]) { ctx.moveTo(tip[0], tip[1]); ctx.lineTo(roof[0] + F.ux * 2.2 * m * e, roof[1] + F.uy * 2.2 * m * e); } ctx.stroke(); // the ropes
    }
  }
  // ---- a street cleaner: dark trousers, an orange vest with a pale reflective band, a yellow helmet, and a broom
  // that sweeps to and fro in front of him. (x, y) his feet, s the size of his pixel, dir: 1 he faces right
  function worker(ctx, x, y, s, t, i, dir) {
    const sw = Math.sin((t || 0) / 170 + i * 1.7), step = Math.sin((t || 0) / 240 + i) > 0 ? 1 : 0;
    const R = (c, gx, gy, gw, gh) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x + gx * s), Math.round(y + gy * s), Math.max(1, Math.round(gw * s)), Math.max(1, Math.round(gh * s))); };
    R('rgba(0,0,0,.3)', -2, -0.4, 4, 1);
    R(INK, -1.2, -3 + step * 0.5, 1, 3 - step * 0.5); R(INK, 0.2, -3 + (1 - step) * 0.5, 1, 3 - (1 - step) * 0.5); // legs
    R(INK, -1.7, -6.2, 3.4, 3.4); R('#ff7a1a', -1.4, -6, 2.8, 3); R('#fff3b0', -1.4, -4.6, 2.8, 0.7); // the vest and its band
    R('#e8b890', -0.9, -8, 1.8, 1.9); R('#ffd23c', -1.1, -8.7, 2.2, 1); // the head and the helmet
    // the broom: the stick from the hands to the ground ahead, the bristles at its end
    const hx = x + dir * 1.4 * s, hy = y - 4.8 * s, gx = x + dir * (3.6 + sw * 1.3) * s, gy = y - 0.3 * s;
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.55) + 1; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(gx, gy); ctx.stroke();
    ctx.strokeStyle = '#c99a4a'; ctx.lineWidth = Math.max(1, s * 0.55); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(gx, gy); ctx.stroke();
    ctx.fillStyle = '#7a3b2e'; ctx.fillRect(Math.round(gx - 1.1 * s), Math.round(gy - 0.5 * s), Math.max(2, Math.round(2.2 * s)), Math.max(1, Math.round(0.9 * s)));
    R('#ff7a1a', dir > 0 ? 0.6 : -1.6, -5.4, 1, 0.9); // the arm that holds it
  }
  // the cleanings of the chosen range, the latest first (so that today is drawn last, on top)
  const inRange = () => { states(); const last = RANGES[range()] ?? 1; return D.items.filter(o => o.day >= 0 && o.day <= last); };

  // a no-stopping sign (blue disc, red rim and cross), (x, y) its centre
  function noStop(ctx, x, y, r) {
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8342c'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b62c4'; ctx.beginPath(); ctx.arc(x, y, r * 0.76, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d8342c'; ctx.lineWidth = Math.max(1.2, r * 0.24); ctx.lineCap = 'butt';
    const q = r * 0.66;
    ctx.beginPath(); ctx.moveTo(x - q, y - q); ctx.lineTo(x + q, y + q); ctx.moveTo(x + q, y - q); ctx.lineTo(x - q, y + q); ctx.stroke();
  }
  // the chip of a section: two lines, the day ("dnes pá 13.11.") and the hours ("10-14:30"); (x, y) its left top corner.
  // Returns its box [x0, y0, x1, y1] (clicked as the section)
  function chip(ctx, x, y, lines, hot) {
    ctx.font = '400 13px "VT323", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const w = Math.ceil(Math.max(...lines.map(l => ctx.measureText(l).width))) + 8, h = 14 * lines.length + 3;
    ctx.fillStyle = 'rgba(22,29,43,.9)'; ctx.fillRect(x, y, w, h);
    lines.forEach((l, i) => { ctx.fillStyle = i ? (hot ? '#8fd4ff' : '#cfe3f2') : '#ffffff'; ctx.fillText(l, x + 4, y + 9 + i * 14); });
    return [x, y, x + w, y + h];
  }
  // "dnes pá 13.11." / "zítra so 14.11." / "út 18.11.", and under it "10-14:30" (or "hotovo" once today's cleaning is over)
  const label = o => {
    const d = new Date(o.from), date = `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
    return [`${o.day === 0 ? 'dnes ' : o.day === 1 ? 'zítra ' : ''}${date}`, o.st === 'done' ? 'hotovo' : hoursText(o).replace('–', '-')];
  };

  function draw(ctx, v, t) {
    vis = []; hits = [];
    if (!loading) { load(); return; }
    if (!D.items.length || v.z < FAR_Z) return;
    positions();
    const b = ctx.__view || [0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight];
    const seen = o => !(o.bb[2] * v.k + v.ox < b[0] - 20 || o.bb[0] * v.k + v.ox > b[2] + 20 || o.bb[3] * v.k + v.oy < b[1] - 20 || o.bb[1] * v.k + v.oy > b[3] + 20);
    const near = v.z >= NEAR_Z, plain = lite(), alpha = ctx.globalAlpha;
    const w = Math.max(2.4, Math.min(8, v.z * 4.5));
    // a cleaning that runs right now: its band breathes between a dark and a light blue, once in about 2.5 s
    const q = 0.5 + 0.5 * Math.sin((t || 0) / 400), mix = (a, c) => Math.round(a + (c - a) * q);
    const running = plain ? BLUE : `rgb(${mix(10, 110)},${mix(92, 205)},${mix(205, 255)})`;
    const list = inRange().filter(o => (near || o.day <= 1) && seen(o)).sort((a, c) => c.t0 - a.t0);
    ctx.save();
    ctx.lineJoin = 'round';
    const signs = [];
    for (const o of list) {
      vis.push(o);
      const path = () => { ctx.beginPath(); for (const p of o.parts) for (let i = 0; i < p.length; i += 2) { const x = v.ox + p[i] * v.k, y = v.oy + p[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } };
      ctx.setLineDash([]); ctx.lineCap = 'round';
      if (o.day <= 1) {
        const today = o.day === 0, done = o.st === 'done';
        const ww = today ? w : w * 0.85;
        ctx.globalAlpha = alpha * (done ? 0.5 : 1);
        if (!plain || near) { ctx.strokeStyle = 'rgba(22,29,43,.8)'; ctx.lineWidth = ww + 2; path(); ctx.stroke(); }
        ctx.strokeStyle = done ? PALE : o.st === 'now' ? running : today ? BLUE : LIGHT; ctx.lineWidth = ww; path(); ctx.stroke();
      } else if (o.day <= 7) {
        ctx.globalAlpha = alpha * 0.7; ctx.strokeStyle = BLUE; ctx.lineWidth = Math.max(1.2, w * 0.6); path(); ctx.stroke();
      } else {
        ctx.globalAlpha = alpha * 0.65; ctx.lineCap = 'butt'; ctx.strokeStyle = BLUE; ctx.lineWidth = Math.max(1, w * 0.45); ctx.setLineDash([w * 1.6, w * 1.4]); path(); ctx.stroke();
      }
      if (v.z >= SIGN_Z) signs.push(o);
    }
    ctx.setLineDash([]);
    // what moves on the streets that are being cleaned right now: the sweepers, the street cleaners and now and then a
    // tow truck with a car (from the back to the front)
    if (v.z >= TRUCK_Z) {
      const sec = now() / 1000, m = Math.max(2.6, v.k * A * 2.2); // (2.2 times the real size, a sweeper never shorter than about 18 px)
      const ex = m / (v.k * A); // how many times larger than life the vehicles are drawn (2.2, more when zoomed out)
      // the houses in front of a sweeper, a tow truck or a parked car step back (see-through and hatched, exactly as for
      // the vehicle of MHD one rides): the middle and both ends of each vehicle are asked for the house that hides them
      const hiders = new Set(), SEE = occluder && veil && v.z >= 0.45 && !plain;
      const hide = (X, Y, dX, dY, half) => {
        if (!SEE) return;
        const n = Math.hypot(dX, dY) || 1, r = (half * m) / v.k;
        for (const f of [-1, 0, 1]) { const h = occluder(Math.round(X + (dX / n) * r * f), Math.round(Y + (dY / n) * r * f)); if (h) hiders.add(h); }
      };
      const things = [], scr = p => [Math.round(v.ox + p[0] * v.k), Math.round(v.oy + p[1] * v.k)];
      const seenAt = ([x, y], pad = 70) => !(x < b[0] - pad || y < b[1] - pad || x > b[2] + pad || y > b[3] + pad);
      for (const tr of fleet()) {
        const p = sweeperAt(tr, sec, 9 * ex);
        if (p) {
          let s = scr(p);
          // (it steers round the car parked at the kerb: to the other side of the street, eased in and out)
          const e = tr.tow;
          if (e && !e.going && p.leg === e.leg) {
            const along = Math.abs((p.m - e.m0) / ex - TOW_HL * TOW_BED), w = Math.max(0, Math.min(1, (13 - along) / 5));
            if (w) s = frame(ctx, s[0], s[1], p[2], p[3]).at(0, (p[2] * e.spot[2] + p[3] * e.spot[3] >= 0 ? -1 : 1) * e.side * 1.2 * m * w * w * (3 - 2 * w)).map(Math.round);
          }
          if (seenAt(s)) { hide((s[0] - v.ox) / v.k, (s[1] - v.oy) / v.k, p[2], p[3], 3.5); things.push([s[1], () => sweeper(ctx, s[0], s[1], p[2], p[3], m, t, plain)]); }
        }
        if (plain) continue; // (a slow device: the sweepers only)
        if (v.z >= WORKER_Z) for (const [q, side, i] of workersOf(tr, sec)) {
          const s = scr(q);
          if (!seenAt(s)) continue;
          const [wx, wy] = frame(ctx, s[0], s[1], q[2], q[3]).at(0, side * m);
          things.push([wy, () => worker(ctx, wx, wy, Math.max(1.25, m * 0.26), t, i, q[2] >= 0 ? 1 : -1)]);
        }
        const tw = towAt(tr, sec, e => seenAt(scr(e.spot), -30)); // (in view: the car is at least 30 px inside the map)
        if (!tw) continue;
        const s0 = scr(tw.spot);
        if (!seenAt(s0, 200)) continue;
        const F0 = frame(ctx, s0[0], s0[1], tw.spot[2], tw.spot[3]), kd = tw.side * 2.5 * m, kerb = F0.at(TOW_HL * m * TOW_BED, kd);
        if (tw.phase !== 'out') hide((kerb[0] - v.ox) / v.k, (kerb[1] - v.oy) / v.k, tw.spot[2], tw.spot[3], 2.2);
        if (tw.phase === 'kerb' || tw.phase === 'in') things.push([kerb[1], () => { ctx.globalAlpha = alpha * (tw.phase === 'kerb' ? tw.alpha : 1); car(ctx, kerb[0], kerb[1], tw.spot[2], tw.spot[3], m, tw.col); }]);
        if (tw.truck) {
          hide(tw.truck[0], tw.truck[1], tw.truck[2], tw.truck[3], TOW_HL);
          const s = scr(tw.truck), bedH = Math.max(3, Math.round(Math.max(6, Math.round(2.6 * m * 0.6)) * 0.42)), up = bedH + 0.9 * m;
          // the loading: up from the kerb, over to the bed, down on it
          const q = tw.p, load = tw.phase === 'in' ? null
            : tw.phase === 'out' ? { col: tw.col, d: 0, lift: bedH }
            : { col: tw.col, d: q < 0.35 ? kd : q < 0.75 ? kd * (1 - (q - 0.35) / 0.4) : 0, lift: q < 0.35 ? (up * q) / 0.35 : q < 0.75 ? up : up - (up - bedH) * ((q - 0.75) / 0.25) };
          things.push([Math.max(s[1], tw.phase === 'load' ? kerb[1] : s[1]) + 1, () => { ctx.globalAlpha = alpha * tw.alpha; towTruck(ctx, s[0], s[1], tw.truck[2], tw.truck[3], m, t, load, tw.phase === 'load'); }]);
        }
      }
      if (SEE) veil(ctx, v, t, hiders);
      things.sort((a, c) => a[0] - c[0]);
      for (const [, f] of things) { ctx.globalAlpha = alpha; f(); }
      ctx.globalAlpha = alpha;
    }
    // the signs and the chips last, over every band; one chip per place and text (the sections of one block share a date)
    const drawn = [];
    hits = [];
    for (const o of signs.reverse()) {
      const x = Math.round(v.ox + o.X * v.k), y = Math.round(v.oy + o.Y * v.k);
      if (x < b[0] - 30 || y < b[1] - 30 || x > b[2] + 30 || y > b[3] + 30) continue;
      ctx.globalAlpha = alpha * (o.st === 'done' ? 0.55 : o.day > 1 ? 0.8 : 1);
      const r = Math.max(8, Math.min(12, v.z * 4.5));
      if (o.day <= 1) { noStop(ctx, x, y - 14, r); hits.push([x - r - 3, y - 14 - r - 3, x + r + 3, y - 14 + r + 3, o]); } // (the sign is clicked as the section)
      if (v.z >= CHIP_Z) {
        const lines = label(o), text = lines.join('|');
        if (drawn.some(d => d[2] === text && Math.hypot(d[0] - x, d[1] - y) < 90)) continue;
        drawn.push([x, y, text]);
        hits.push([...chip(ctx, x + 14, y - 30, lines, o.day === 0 && o.st !== 'done'), o]);
      }
    }
    ctx.restore();
    ctx.globalAlpha = alpha;
  }
  // the cleaning under the pointer: the one whose no-stopping sign or chip is there (the last drawn first), else, of
  // those drawn, the soonest one whose band is within 8 px
  // (markAt alone: the sign or the chip. The page asks it before the jams, closures and roadworks, whose lines may run
  // under a sign; the band itself comes after them)
  const markAt = (sx, sy) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]) return h[4]; } return null; };
  function at(sx, sy, v) {
    const mk = markAt(sx, sy);
    if (mk) return mk;
    if (!vis.length) return null;
    const X = (sx - v.ox) / v.k, Y = (sy - v.oy) / v.k, tol = 8 / v.k;
    let best = null;
    for (const o of vis) {
      if (best && o.t0 >= best.t0) continue;
      if (X < o.bb[0] - tol || X > o.bb[2] + tol || Y < o.bb[1] - tol || Y > o.bb[3] + tol) continue;
      hit: for (const p of o.parts) for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = v.ox + p[i] * v.k, ay = v.oy + p[i + 1] * v.k, bx = v.ox + p[i + 2] * v.k, by = v.oy + p[i + 3] * v.k;
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        const tt = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / L2));
        if (Math.hypot(ax + dx * tt - sx, ay + dy * tt - sy) < 8) { best = o; break hit; }
      }
    }
    return best;
  }
  // the other dates of the same section, the soonest first (the card: "další termín")
  const dates = o => { states(); return D.items.filter(q => q.sid === o.sid && q.day >= 0).sort((a, c) => a.t0 - c.t0); };
  // the line under the switch and the notices: how many sections today (and how many of them right now), tomorrow,
  // within a week, and in which districts
  function summary() {
    states();
    const up = D.items.filter(o => o.day >= 0);
    const of = day => up.filter(o => o.day === day);
    const where = l => [...new Set(l.map(o => o.part).filter(Boolean))];
    const t = of(0), z = of(1);
    return { loaded: D.loaded, total: up.length, today: t.length, now: t.filter(o => o.st === 'now').length, left: t.filter(o => o.st !== 'done').length, trucks: fleetKey ? trucks.length : 0, tomorrow: z.length,
      week: up.filter(o => o.day <= 7).length, todayParts: where(t), tomorrowParts: where(z), next: up.length ? up.reduce((a, o) => (o.t0 < a.t0 ? o : a)) : null, updated: D.updated };
  }
  // the image points of the sections of today and tomorrow (Zvýraznit v mapě)
  const points = () => { positions(); states(); return D.items.filter(o => o.day >= 0 && o.day <= 1 && o.st !== 'done' && o.X != null).map(o => [o.X, o.Y]); };
  // the next day with a cleaning after today (the news "V pondělí se blokově čistí …", Zprávy): how many days ahead, and its points
  const nextDay = () => { states(); const l = D.items.filter(o => o.day >= 1); return l.length ? Math.min(...l.map(o => o.day)) : null; };
  const pointsNext = () => { positions(); const d = nextDay(); return d == null ? [] : D.items.filter(o => o.day === d && o.X != null).map(o => [o.X, o.Y]); };
  const fold = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function street(name) {
    states();
    const k = fold(name || '');
    if (!k) return [];
    return D.items.filter(o => o.day >= 0 && o.st !== 'done' && (fold(o.n) === k || fold(o.n).startsWith(`${k} `))).sort((a, c) => a.t0 - c.t0);
  }
  return { load, draw, at, markAt, dates, summary, points, nextDay, pointsNext, positions, street, data: D };
}

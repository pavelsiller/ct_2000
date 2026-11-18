import { inMap } from './extent.js';
import { fetchData, RELOAD, watchFeed } from './feed.js';

export function createMhd({ base, rotation }) {
  let tt = null, geo = null, geoRot = -1, loading = null;
  // the stops (data/mhd-stops.json, ~100 KB): their signs on the map and the names of the live vehicles' stops
  // come from this small file at once; the timetable itself (mhd.json + mhd-geo.json, ~4 MB) only when needed:
  // the timetable mode, a stop or vehicle card, or (wantSnap) to put live vehicles onto their routes
  let st = null, stLoading = null;
  let active = [], activeAt = 0;
  let stopIdx = null, profTrips = null; // built on the first stop click

  async function ensure() {
    const rot = rotation();
    if (tt && geoRot === rot) return;
    const g = `r${rot}/mhd-geo.json`, get = (f, how, init) => how(`${base}data/${f}`, init).then(r => r.json());
    let t = tt || await get('mhd.json', fetchData), ge = geoS && geoSRot === rot ? geoS : await get(g, fetchData); // (the shapes may be here already: loadShapes)
    if (ge.ver !== t.ver) {
      [t, ge] = await Promise.all([get('mhd.json', fetchData, RELOAD), get(g, fetchData, RELOAD)]);
      if (ge.ver !== t.ver) [t, ge] = await Promise.all([get('mhd.json', (u, i) => fetch(u, i)), get(g, (u, i) => fetch(u, i))]);
    }
    use(t, ge, rot);
  }
  function use(t, ge, rot) {
    if (t !== tt) { tt = t; stopIdx = null; profTrips = null; lineTrips = null; svcDate = 0; rough = null; } // (what was built from the old timetable)
    geo = ge; geoRot = rot; activeAt = 0;
  }
  const load = () => (loading ||= ensure().finally(() => { loading = null; }));
  let metaVer = null;
  async function refresh(tries = 0, ver = null) {
    if (ver && ver === (tt ? tt.ver : metaVer)) { metaVer = ver; return; }
    if (ver) metaVer = ver;
    if (st && !tries) readStops(RELOAD);
    if (!tt || loading) return;
    const rot = rotation(), get = f => fetchData(`${base}data/${f}`, RELOAD).then(r => r.json());
    let t, ge;
    try { [t, ge] = await Promise.all([get('mhd.json'), get(`r${rot}/mhd-geo.json`)]); } catch { return; }
    if (!t || !t.ver || !Array.isArray(t.trips) || !tt || t.ver === tt.ver || rot !== rotation() || loading) return;
    if (!ge || ge.ver !== t.ver) { if (tries < 3) setTimeout(() => refresh(tries + 1), 60e3); return; }
    use(t, ge, rot);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mhd-new', { detail: t.ver }));
  }
  watchFeed('mhd.json', run => refresh(0, (run && run.files && run.files['mhd.json'] && run.files['mhd.json'].ver) || null));
  let geoS = null, geoSRot = -1, geoSLoading = null, geoSAt = -1e9;
  function loadShapes(init) {
    const rot = rotation();
    return (geoSLoading ||= fetchData(`${base}data/r${rot}/mhd-geo.json`, init).then(r => r.json()).then(g => { geoS = g; geoSRot = rot; }).catch(() => {}).finally(() => { geoSLoading = null; }));
  }
  // (read again with a new timetable, refresh() above: a failed read then keeps the stops the page has)
  const readStops = init => fetchData(`${base}data/mhd-stops.json`, init).then(r => r.json()).then(d => { /* only the stops in the map (src/extent.js) */ d.stops = Object.fromEntries(Object.entries(d.stops || {}).filter(([, s]) => inMap(s[1], s[2]))); d.posts = Object.fromEntries(Object.entries(d.posts || {}).filter(([k]) => d.stops[k])); st = d; }).catch(() => { st ||= { stops: {}, stopNum: {} }; });
  const loadStops = () => (stLoading ||= readStops());

  // (asked for at every frame: the time-zone formatting is slow, and the answer changes once a second; read only)
  let nowSec = -1, nowVal = null;
  function pragueNow() {
    const ms = Math.floor(Date.now() / 1000);
    if (ms === nowSec) return nowVal;
    nowSec = ms; nowVal = pragueNowFresh();
    return nowVal;
  }
  // (made once: a toLocaleString with options builds a new formatter at every call, up to tens of ms, see tickClock in main.js)
  const PRAGUE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  function pragueNowFresh() {
    const s = PRAGUE.format(new Date()); // 2026-11-04 08:41:12
    const [d, t] = s.split(' ');
    const [h, m, x] = t.split(':').map(Number);
    const date = +d.replace(/-/g, '');
    const wd = (new Date(`${d}T12:00:00`).getDay() + 6) % 7; // 0 = Monday
    return { date, wd, sec: h * 3600 + m * 60 + x };
  }
  function prevDay(date) {
    const y = Math.floor(date / 10000), mo = Math.floor(date / 100) % 100, d = date % 100;
    const t = new Date(Date.UTC(y, mo - 1, d) - 864e5);
    return { date: t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate(), wd: (t.getUTCDay() + 6) % 7 };
  }
  const runs = (svc, date, wd) => {
    const [days, from, to, add, rem] = svc;
    if (add.includes(date)) return true;
    if (rem.includes(date)) return false;
    return days[wd] === '1' && date >= from && date <= to;
  };

  // which trips are on the road now (refreshed every few seconds)
  let svcToday = null, svcYday = null, svcDate = 0;
  let rough = null, roughAt = 0; // the places of the active trips about a second ago (X, Y pairs; NaN: off the map), see vehicles()
  function refreshActive() {
    const now = pragueNow();
    const y = prevDay(now.date);
    const today = tt.services.map(s => runs(s, now.date, now.wd));
    const yday = tt.services.map(s => runs(s, y.date, y.wd));
    svcToday = today; svcYday = yday; svcDate = now.date;
    active = [];
    const T = tt.trips;
    for (let i = 0; i < T.length; i += 4) {
      const p = tt.profiles[T[i]], s = T[i + 1], t0 = T[i + 2], hs = tt.names[T[i + 3]];
      const dur = p[3][p[3].length - 1];
      if (today[s] && now.sec >= t0 && now.sec <= t0 + dur) active.push([p, t0, hs, i]);
      else if (yday[s] && now.sec + 86400 >= t0 && now.sec + 86400 <= t0 + dur) active.push([p, t0 - 86400, hs, i]);
    }
    activeAt = performance.now(); rough = null;
  }

  // where a trip (profile p, start t0) is at second sec of the day: a vehicle object, or null off the map
  let lineTrips = null; // line -> indices into tt.trips (built on first use)
  function posAt(p, t0, hs, id, sec) {
    const [r, vi, ms, offs] = p;
    const dt = sec - t0;
    let i = 0;
    while (i < offs.length - 2 && offs[i + 1] <= dt) i++;
    const a = ms[i], b = ms[i + 1];
    if (a < 0 || b < 0) return null;
    const span = offs[i + 1] - offs[i];
    // dwell ~20 s at stops, then move
    const moveStart = offs[i] + Math.min(20, span * 0.25);
    const f = span <= 0 ? 1 : Math.max(0, Math.min(1, (dt - moveStart) / (offs[i + 1] - moveStart || 1)));
    const shape = vi >= 0 ? geo.v[vi] : geo.s[-vi - 1];
    if (!shape) return null;
    const pt = pointAt(shape, a + (b - a) * f);
    const back = b < a;
    const m = a + (b - a) * f;
    return { X: pt[0], Y: pt[1], dx: back ? -pt[2] : pt[2], dy: back ? -pt[3] : pt[3], type: tt.routes[r][1], line: tt.routes[r][0], shape, m, back, hs, id, t0, p, seg: i };
  }
  function pointAt(shape, m) {
    const [xy, cm] = shape;
    if (m <= cm[0]) return [xy[0], xy[1], xy[2] - xy[0], xy[3] - xy[1]];
    let lo = 0, hi = cm.length - 1;
    if (m >= cm[hi]) return [xy[2 * hi], xy[2 * hi + 1], xy[2 * hi] - xy[2 * hi - 2], xy[2 * hi + 1] - xy[2 * hi - 1]];
    while (hi - lo > 1) { const md = (lo + hi) >> 1; if (cm[md] <= m) lo = md; else hi = md; }
    const f = (m - cm[lo]) / (cm[hi] - cm[lo] || 1);
    const dx = xy[2 * hi] - xy[2 * lo], dy = xy[2 * hi + 1] - xy[2 * lo + 1];
    return [xy[2 * lo] + dx * f, xy[2 * lo + 1] + dy * f, dx, dy];
  }

  // which profiles call at a stop (and where in them), and the trips of every profile: built on the first question
  // about a stop, again after a new timetable
  function stopIndex() {
    if (stopIdx) return;
    stopIdx = new Map();
    tt.profiles.forEach((p, pi) => (p[5] || []).forEach((num, pos) => { if (!num) return; if (!stopIdx.has(num)) stopIdx.set(num, []); stopIdx.get(num).push([pi, pos]); }));
    profTrips = new Map();
    for (let i = 0; i < tt.trips.length; i += 4) { const pi = tt.trips[i]; if (!profTrips.has(pi)) profTrips.set(pi, []); profTrips.get(pi).push(i); }
  }
  return {
    load,
    ready: () => !!tt && !!geo && geoRot === rotation(),
    // vehicles: [{ X, Y, dx, dy, type, line }]
    // (keep(X, Y, id): only the trips it says yes to are worked out, e.g. those in the view. It is asked with the place
    // of up to a second ago, kept in `rough` and made again once a second, so the caller leaves room for the way a
    // vehicle makes in that time. A trip with no place a second ago (just entering the map) is always worked out.)
    vehicles(keep = null) {
      if (!tt || !geo || geoRot !== rotation()) { load(); return []; }
      const now = performance.now();
      if (now - activeAt > 5000) refreshActive();
      const sec = pragueNow().sec + (Date.now() % 1000) / 1000;
      const out = [];
      if (!keep) { for (const [p, t0, hs, id] of active) { const v = posAt(p, t0, hs, id, sec); if (v) out.push(v); } return out; }
      if (!rough || now - roughAt > 1000) {
        roughAt = now; rough = new Float64Array(active.length * 2);
        for (let i = 0; i < active.length; i++) { const a = active[i], v = posAt(a[0], a[1], a[2], a[3], sec); rough[2 * i] = v ? v.X : NaN; rough[2 * i + 1] = v ? v.Y : NaN; }
      }
      for (let i = 0; i < active.length; i++) {
        const a = active[i], X = rough[2 * i];
        if (X === X && !keep(X, rough[2 * i + 1], a[3])) continue;
        const v = posAt(a[0], a[1], a[2], a[3], sec); if (v) out.push(v);
      }
      return out;
    },
    // The trips of a line a live vehicle may be running, judged at the time of its timetable (planSec = now minus
    // its delay): the trips under way then, plus those about to start (20 min: a vehicle waiting at the terminus)
    // and those just finished (10 min). Each with its position at that time (held at the ends of the trip).
    candidates(line, planSec) {
      if (!tt || !geo || geoRot !== rotation()) { load(); return []; }
      if (performance.now() - activeAt > 5000 || !svcToday) refreshActive();
      if (!lineTrips) { lineTrips = new Map(); for (let i = 0; i < tt.trips.length; i += 4) { const l = tt.routes[tt.profiles[tt.trips[i]][0]][0]; if (!lineTrips.has(l)) lineTrips.set(l, []); lineTrips.get(l).push(i); } }
      const out = [];
      for (const i of lineTrips.get(line) || []) {
        const T = tt.trips, p = tt.profiles[T[i]], s = T[i + 1], hs = tt.names[T[i + 3]], dur = p[3][p[3].length - 1];
        for (const [ok, t0] of [[svcToday[s], T[i + 2]], [svcYday[s], T[i + 2] - 86400]]) {
          if (!ok || planSec < t0 - 1200 || planSec > t0 + dur + 600) continue;
          const v = posAt(p, t0, hs, i, Math.max(t0, Math.min(t0 + dur, planSec)));
          if (v) { out.push(v); continue; }
          // on a part of the trip that the shape does not cover (stops far from it: a detour): no position, but the
          // trip still counts by its stops, and its route can be drawn where the shape does fit
          const vi = p[1], shape = vi >= 0 ? geo.v[vi] : geo.s[-vi - 1];
          if (shape) out.push({ X: NaN, Y: NaN, dx: 0, dy: 0, type: tt.routes[p[0]][1], line, shape, m: NaN, back: false, hs, id: i, t0, p, seg: -1 });
        }
      }
      return out;
    },
    // The way from stop a to stop b (their numbers) along the route of any line of the same kind that calls at both:
    // the tracks for a tram, the roads for a bus or a trolleybus. [x, y, …] in image px in that order, or null. For a
    // trip on a diversion, whose own shape is the regular route: its way round is drawn along what runs there. The
    // shortest such piece counts; one over three times as long as the two stops are apart (a line that comes to the
    // other stop only after a long round) is no good.
    between(a, b, type) {
      if (!tt || !geo || geoRot !== rotation() || !a || !b || a === b) return null;
      stopIndex();
      const rail = type === 'tram';
      let best = null, bl = Infinity;
      for (const [pi, pos] of stopIdx.get(+a) || []) {
        const p = tt.profiles[pi];
        if ((tt.routes[p[0]][1] === 'tram') !== rail || p[2][pos] < 0) continue;
        for (let j = 0; j < p[5].length; j++) {
          if (p[5][j] !== +b || p[2][j] < 0) continue;
          const l = Math.abs(p[2][j] - p[2][pos]);
          if (l > 0 && l < bl) { bl = l; best = [p, pos, j]; }
        }
      }
      // (no line joins the two stops: the way the timetable build found for this pair along the tracks / roads, when
      // a trip runs between them off its shape: "l" of mhd-geo.json, kept from the lower stop number to the higher)
      const leg = () => {
        const l = geo.l && geo.l[`${rail ? 't' : 'r'}${Math.min(a, b)}_${Math.max(a, b)}`];
        if (!l || +a < +b) return l || null;
        const back = [];
        for (let k = l.length - 2; k >= 0; k -= 2) back.push(l[k], l[k + 1]);
        return back;
      };
      if (!best) return leg();
      const sa = st && st.stops[a], sb = st && st.stops[b];
      if (sa && sb && bl > 3 * Math.hypot((sa[1] - sb[1]) * 72765, (sa[2] - sb[2]) * 111200) + 150) return leg();
      const [p, i, j] = best, vi = p[1], shape = vi >= 0 ? geo.v[vi] : geo.s[-vi - 1];
      if (!shape) return null;
      const [xy, cm] = shape, m0 = p[2][i], m1 = p[2][j], lo = Math.min(m0, m1), hi = Math.max(m0, m1), fwd = [...pointAt(shape, lo).slice(0, 2)];
      for (let k = 0; k < cm.length; k++) if (cm[k] > lo && cm[k] < hi) fwd.push(xy[2 * k], xy[2 * k + 1]);
      fwd.push(...pointAt(shape, hi).slice(0, 2));
      if (m1 >= m0) return fwd;
      const back = [];
      for (let k = fwd.length - 2; k >= 0; k -= 2) back.push(fwd[k], fwd[k + 1]);
      return back;
    },
    // The regular way of a trip that runs differently during a closure: of the line's patterns that run on `day` (a
    // day after the closure) the one that shares the most stops with the trip's pattern p, in the same direction.
    // { p, shape }, or null: the line does not run that day, nothing of it resembles the trip, or it is the same.
    usual(p, day) {
      if (!tt || !geo || geoRot !== rotation()) return null;
      const svc = tt.services.map(s => runs(s, day.date, day.wd));
      // the line's ways that day: the same stops in the same order are one way, whatever the times
      const ways = new Map(); // "stops" -> { q: one of its patterns, trips }
      for (let i = 0; i < tt.trips.length; i += 4) {
        const q = tt.profiles[tt.trips[i]];
        if (q[0] !== p[0] || !svc[tt.trips[i + 1]]) continue;
        const k = (q[5] || []).join(','), w = ways.get(k);
        if (w) w.trips++; else ways.set(k, { q, trips: 1 });
      }
      const mine = p[5] || [];
      if (ways.has(mine.join(','))) return null; // (the trip runs its way of an ordinary day)
      const at = new Map(mine.map((num, i) => [num, i])), alike = [];
      for (const w of ways.values()) {
        const nums = w.q[5] || [];
        let common = 0, fwd = 0, prev = -1;
        for (const num of nums) { const k = num ? at.get(num) : undefined; if (k === undefined) continue; common++; if (k > prev) fwd++; prev = k; }
        if (common >= 2 && fwd >= common * 0.7) alike.push([common / new Set([...nums, ...mine]).size, w]); // (else: the other direction)
      }
      // the more stops in common the better, and a way many trips take before one of a few runs to the depot
      const most = Math.max(0, ...alike.map(x => x[1].trips));
      let best = null, bs = 0;
      for (const [j, w] of alike) { const sc = j * (0.5 + 0.5 * Math.min(1, w.trips / most)); if (sc > bs) { bs = sc; best = w.q; } }
      if (!best || bs < 0.25) return null;
      const vi = best[1], shape = vi >= 0 ? geo.v[vi] : geo.s[-vi - 1];
      return shape ? { p: best, shape } : null;
    },
    count: () => active.length,
    timetable: () => tt, // (the whole timetable, read only: the journey planner, src/spojeni.js)
    pointAt,
    // the shapes of the routes in the version `ver` (the snapshot's "rv"), or null while they are not here (they are
    // then on their way: with the timetable when `full`, else alone); shapeOf(g, index as profile[1])
    shapes(ver, full) {
      const rot = rotation();
      for (const g of [geoRot === rot ? geo : null, geoSRot === rot ? geoS : null]) if (g && g.ver === ver) return g;
      const have = (geo && geoRot === rot) || (geoS && geoSRot === rot), now = performance.now();
      if (!have) { if (full) load(); else loadShapes(); }
      else if (now - geoSAt > 600e3) { geoSAt = now; loadShapes(RELOAD); }
      return null;
    },
    shapeOf: (g, vi) => (vi >= 0 ? g.v[vi] : g.s[-vi - 1]) || null,
    // one timetable trip (ti = index into tt.trips) as layers.setRoute() takes it: the stop card highlights the way
    // a chosen departure goes
    tripRoute(ti) {
      if (!tt || !geo || geoRot !== rotation()) return null;
      const p = tt.profiles[tt.trips[ti]];
      const vi = p[1], shape = vi >= 0 ? geo.v[vi] : geo.s[-vi - 1];
      if (!shape) return null;
      return { p, shape, t0: tt.trips[ti + 2], type: tt.routes[p[0]][1], line: tt.routes[p[0]][0] };
    },
    // The ways a line goes on a day, each as layers.setRoute() takes a trip: a line chosen in a stop card shows its
    // whole route on the map. The same stops in the same order are one way. Kept are the ways taken by at least
    // 15 % as many trips as the busiest one (both directions and the branches, not the few runs to a depot) and,
    // by the same rule among themselves, the ways that call at stop `stopNum`. Eight at most, the busiest last (it
    // is drawn on top).
    lineWays(line, day, stopNum = 0) {
      if (!tt || !geo || geoRot !== rotation()) return [];
      const svc = tt.services.map(s => runs(s, day.date, day.wd)), ways = new Map();
      for (let i = 0; i < tt.trips.length; i += 4) {
        const p = tt.profiles[tt.trips[i]];
        if (tt.routes[p[0]][0] !== line || !svc[tt.trips[i + 1]]) continue;
        const k = (p[5] || []).join(','), w = ways.get(k);
        if (w) w.trips++; else ways.set(k, { p, trips: 1, here: !!stopNum && (p[5] || []).includes(+stopNum) });
      }
      const all = [...ways.values()], top = l => Math.max(0, ...l.map(w => w.trips));
      const most = top(all), mostHere = top(all.filter(w => w.here));
      return all.filter(w => w.trips >= 0.15 * most || (w.here && w.trips >= 0.15 * mostHere))
        .sort((a, b) => b.trips - a.trips).slice(0, 8).reverse()
        .map(({ p }) => { const vi = p[1], shape = vi >= 0 ? geo.v[vi] : geo.s[-vi - 1]; return shape ? { p, shape, t0: 0, type: tt.routes[p[0]][1], line } : null; })
        .filter(Boolean);
    },
    // the kind of a line ('tram' | 'trol' | 'bus'); '' a line the timetable does not have, null while it is not here
    lineType(line) { if (!tt) return null; const r = tt.routes.find(x => x[0] === String(line)); return r ? r[1] : ''; },
    stopName: num => (st && st.stopNum ? st.stopNum[num] || '' : ''),
    names: i => (tt ? tt.names[i] || '' : ''),
    // ---------------------------------------------------------------- stops and their departures
    stops: () => (st ? st.stops || {} : {}),
    stopsLoaded: () => !!st, // (the stops file is here: until then stops() is empty)
    // the posts (sloupky) of the stops with two or more in use: { number: [[post, lon, lat, the usual next stop], …] }
    posts: () => (st ? st.posts || {} : {}),
    loadStops,
    wantSnap: true, // false (phones): live vehicles are drawn straight until the timetable is needed for something else
    now: pragueNow,
    // the dates to show a timetable for: today, the next working day, Saturday and Sunday
    dayChoices() {
      const n = pragueNow();
      const y = Math.floor(n.date / 10000), mo = Math.floor(n.date / 100) % 100, d = n.date % 100;
      const at = k => { const t = new Date(Date.UTC(y, mo - 1, d) + k * 864e5); return { date: t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate(), wd: (t.getUTCDay() + 6) % 7 }; };
      const next = test => { for (let k = 0; k < 8; k++) { const x = at(k); if (test(x.wd)) return x; } return at(0); };
      return { today: { ...at(0), label: 'Dnes' }, work: { ...next(w => w <= 4), label: 'Pracovní den' }, sat: { ...next(w => w === 5), label: 'Sobota' }, sun: { ...next(w => w === 6), label: 'Neděle' } };
    },
    // all calls at a stop on one day: [{ sec, line, type, hs, trip, last, first }]
    calls(stopNum, day) {
      if (!tt) return [];
      stopIndex();
      const svc = tt.services.map(s => runs(s, day.date, day.wd));
      const out = [];
      for (const [pi, pos] of stopIdx.get(+stopNum) || []) {
        const p = tt.profiles[pi];
        for (const ti of profTrips.get(pi) || []) {
          if (!svc[tt.trips[ti + 1]]) continue;
          out.push({ sec: tt.trips[ti + 2] + p[3][pos], line: tt.routes[p[0]][0], type: tt.routes[p[0]][1], hs: tt.names[tt.trips[ti + 3]], trip: ti, first: pos === 0, last: pos === p[3].length - 1, post: (p[6] || [])[pos] || 0 });
        }
      }
      return out.sort((a, b) => a.sec - b.sec);
    },
    // "Můj spoj" (src/moje.js): the rides from one stop to another without changing, whatever the line and whatever
    // the trip's destination says (a pair of stops holds through short runs and diversions better than a headsign):
    // [{ sec (leaves the first stop), arr (reaches the second), line, type, hs, trip }]
    callsTo(fromNum, toNum, day) {
      if (!tt) return [];
      stopIndex();
      const svc = tt.services.map(s => runs(s, day.date, day.wd));
      const out = [];
      for (const [pi, pos] of stopIdx.get(+fromNum) || []) {
        const p = tt.profiles[pi], to = (p[5] || []).indexOf(+toNum, pos + 1);
        if (to < 0) continue;
        for (const ti of profTrips.get(pi) || []) {
          if (!svc[tt.trips[ti + 1]]) continue;
          const t0 = tt.trips[ti + 2];
          out.push({ sec: t0 + p[3][pos], arr: t0 + p[3][to], line: tt.routes[p[0]][0], type: tt.routes[p[0]][1], hs: tt.names[tt.trips[ti + 3]], trip: ti });
        }
      }
      return out.sort((a, b) => a.sec - b.sec);
    },
    // the stops reached from a stop without changing, by name: [{ num, name, lines: ['4', '9'] }]
    reach(fromNum) {
      if (!tt) return [];
      stopIndex();
      const out = new Map();
      for (const [pi, pos] of stopIdx.get(+fromNum) || []) {
        const p = tt.profiles[pi], nums = p[5] || [], line = tt.routes[p[0]][0];
        for (let i = pos + 1; i < nums.length; i++) {
          const n = nums[i];
          if (!n || n === +fromNum) continue;
          let o = out.get(n);
          if (!o) out.set(n, (o = { num: n, name: tt.names[p[4][i]], lines: new Set() }));
          o.lines.add(line);
        }
      }
      const lineNo = l => parseInt(String(l).replace(/\D/g, '')) || 999;
      return [...out.values()].map(o => ({ ...o, lines: [...o.lines].sort((a, b) => lineNo(a) - lineNo(b) || String(a).localeCompare(String(b))) })).sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    },
    // the vehicle's itinerary: [{ name, time (s since midnight), state: 'past' | 'next' | 'later' }]
    itinerary(veh) {
      const [r, , , offs, stopNames, stopNums] = veh.p;
      const kind = tt.reqStops || {};
      const sec = pragueNow().sec;
      const out = [];
      for (let i = 0; i < offs.length; i++) {
        const t = veh.t0 + offs[i];
        // request stop ("na znamení") of the line: all day ('a') or only at night, 22–5 h ('n'); req = on this trip
        const rk = stopNums ? kind[`${r}|${stopNums[i]}`] || '' : '', s = ((t % 86400) + 86400) % 86400;
        out.push({ name: tt.names[stopNames[i]], num: stopNums ? stopNums[i] : 0, time: t, state: t <= sec ? 'past' : 'later', reqKind: rk, req: rk === 'a' || (rk === 'n' && (s >= 79200 || s < 18000)) });
      }
      const nx = out.find(o => o.state === 'later');
      if (nx) nx.state = 'next';
      return out;
    },
    // points along the vehicle body from the front to the back (image px), following the route's curves
    body(veh, lengthM, n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        const d = (lengthM * i) / (n - 1);
        const p = pointAt(veh.shape, veh.back ? veh.m + d : veh.m - d);
        out.push(p[0], p[1]);
      }
      return out;
    },
  };
}

export const WALK_MAX = 400; // m, straight
const WALK_SPEED = 1.25; // m/s
const DETOUR = 1.3; // the way on foot against the straight line
const WALK_EXTRA = 30; // s: crossing the street, finding the post
const CHANGE = 60; // s: getting off and on again at the same stop, posts not known
const CHANGE_SAME = 45; // s: off and on at the same post
const ROUNDS = 4; // rides at most (three changes)

const distM = (lon1, lat1, lon2, lat2) => Math.hypot((lon1 - lon2) * 72765, (lat1 - lat2) * 111200); // (Brno: 49.2° N)
export const walkSec = (d, speed = WALK_SPEED) => Math.round((d * DETOUR) / speed + WALK_EXTRA);

// tt: data/mhd.json; stops: { num: [name, lon, lat] } (the stops in the map, mhd.stops()); posts: { num: [[post, lon, lat, next], …] }
// how: who travels (src/spojstav.js WAYS): { walk: the pace in m/s, change: how many times longer a change takes,
//      low: only trips whose vehicle is promised to be low-floor (tt.wa), flat: getting on and off only at posts one
//      can board without help (tt.wb) }. A timetable without those two (an older feed) lets everything through.
export function createPlanner(tt, stops, posts = {}, { walk = 1.25, change: slow = 1, low = false, flat = false } = {}) {
  const wa = low && typeof tt.wa === 'string' ? tt.wa : null, wb = flat && tt.wb ? tt.wb : null;
  // (the names of the constants of the file, at the pace of this traveller)
  const WALK_SPEED = walk, CHANGE = Math.round(60 * slow), CHANGE_SAME = Math.round(45 * slow), walkSec = d => Math.round((d * DETOUR) / walk + WALK_EXTRA);
  // ------------------------------------------------------------ stops and the routes through them
  const sIdx = new Map(), sNum = [];
  const idxOf = num => { let i = sIdx.get(num); if (i === undefined) { i = sNum.length; sIdx.set(num, i); sNum.push(num); } return i; };
  const routeStops = tt.profiles.map(p => (p[5] || []).map(n => (n ? idxOf(n) : -1)));
  const S = sNum.length;
  const stopRoutes = Array.from({ length: S }, () => []);
  routeStops.forEach((rs, pi) => rs.forEach((s, pos) => { if (s >= 0) stopRoutes[s].push(pi, pos); }));

  // the change at the same stop: CHANGE, longer where its posts are far apart (half the widest gap walked)
  const change = new Float64Array(S).fill(CHANGE);
  for (const [num, list] of Object.entries(posts)) {
    const s = sIdx.get(+num);
    if (s === undefined || !list || list.length < 2) continue;
    let w = 0;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) w = Math.max(w, distM(list[i][1], list[i][2], list[j][1], list[j][2]));
    change[s] = Math.min(Math.round(240 * slow), Math.max(CHANGE, Math.round(CHANGE + (w * DETOUR) / WALK_SPEED / 2)));
  }

  // the change between two posts of a stop (pa: where the ride arrives, pb: where the next one leaves): the walk
  // between them when their places are known, else the estimate of the stop
  const postXY = new Map();
  for (const [num, list] of Object.entries(posts)) postXY.set(+num, new Map((list || []).map(q => [q[0], [q[1], q[2]]])));
  function changeAt(s, pa, pb) {
    if (!pa || !pb) return change[s];
    if (pa === pb) return CHANGE_SAME;
    const m = postXY.get(sNum[s]), a = m && m.get(pa), b = m && m.get(pb);
    if (!a || !b) return CHANGE;
    return Math.max(CHANGE, Math.round((distM(a[0], a[1], b[0], b[1]) * DETOUR) / WALK_SPEED + 30));
  }

  // walks between different stops: walks[s] = [to, sec, metres, …]
  const walks = Array.from({ length: S }, () => []);
  const placed = Object.entries(stops).map(([num, v]) => [sIdx.get(+num), v[1], v[2]]).filter(x => x[0] !== undefined);
  for (let i = 0; i < placed.length; i++) {
    const [a, lo1, la1] = placed[i];
    for (let j = i + 1; j < placed.length; j++) {
      const [b, lo2, la2] = placed[j];
      if (Math.abs(la1 - la2) > 0.004) continue; // (≈ 445 m: most pairs out at once)
      const d = distM(lo1, la1, lo2, la2);
      if (d > WALK_MAX) continue;
      const t = walkSec(d);
      walks[a].push(b, t, Math.round(d)); walks[b].push(a, t, Math.round(d));
    }
  }

  // ------------------------------------------------------------ the trips of a day, per route, by departure
  const runs = (svc, date, wd) => {
    const [days, from, to, add, rem] = svc;
    if (add.includes(date)) return true;
    if (rem.includes(date)) return false;
    return days[wd] === '1' && date >= from && date <= to;
  };
  const shiftDay = (date, k) => {
    const y = Math.floor(date / 10000), mo = Math.floor(date / 100) % 100, d = date % 100;
    const t = new Date(Date.UTC(y, mo - 1, d) + k * 864e5);
    return { date: t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate(), wd: (t.getUTCDay() + 6) % 7 };
  };
  let dayKey = 0, rT0 = null, rTi = null; // per route: the starts (s on the scale of the day) and the trip indices, sorted
  function prepare(date) {
    if (dayKey === date) return;
    const lists = tt.profiles.map(() => []);
    const T = tt.trips;
    for (const [k, shift] of [[-1, -86400], [0, 0], [1, 86400]]) {
      const d = shiftDay(date, k), on = tt.services.map(s => runs(s, d.date, d.wd));
      for (let i = 0; i < T.length; i += 4) if (on[T[i + 1]] && (!wa || wa[i >> 2] === '1')) lists[T[i]].push([T[i + 2] + shift, i]); // (wa: low-floor trips only)
    }
    rT0 = []; rTi = [];
    for (const l of lists) {
      l.sort((a, b) => a[0] - b[0]);
      rT0.push(Float64Array.from(l, x => x[0])); rTi.push(Int32Array.from(l, x => x[1]));
    }
    dayKey = date;
  }
  // per route: which of its posts are barred to somebody who needs a post without barriers (made on first use)
  const barredOf = new Map();
  function barred(pi) {
    let b = barredOf.get(pi);
    if (!b) { const p = tt.profiles[pi], nums = p[5] || [], pp = p[6] || []; b = nums.map((n, i) => !!n && wb[`${n}|${pp[i] || 0}`] !== undefined); barredOf.set(pi, b); }
    return b;
  }
  const lowerBound = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; };

  // ------------------------------------------------------------ the ends of a journey
  // A stop ({ num }), a point ({ lon, lat }: an address, a place, where one stands) or the stops a vehicle one sits in
  // still calls at ({ stops }: the start of a journey planned anew from on board). A stop starts at itself and at the
  // stops a walk away; a point at the stops within ACCESS_MAX m (the three nearest within 1.5 km when there is none).
  // [[stop index, walk s, m], …]
  const ACCESS_MAX = 700;
  function access(ep) {
    if (!ep) return [];
    // on board of a vehicle (src/spojeni.js replan): { stops: [[stop number, seconds until one can get off and board there], …] }
    if (ep.stops) return ep.stops.map(([num, sec]) => [sIdx.get(+num), Math.max(1, sec), 0]).filter(x => x[0] !== undefined);
    if (ep.num) {
      const s = sIdx.get(+ep.num);
      if (s === undefined) return [];
      const out = [[s, 0, 0]], w = walks[s];
      for (let i = 0; i < w.length; i += 3) out.push([w[i], w[i + 1], w[i + 2]]);
      return out;
    }
    const all = placed.map(([s, lo, la]) => [s, distM(lo, la, ep.lon, ep.lat)]).sort((a, b) => a[1] - b[1]);
    let near = all.filter(x => x[1] <= ACCESS_MAX);
    if (!near.length) near = all.filter(x => x[1] <= 1500).slice(0, 3);
    return near.map(([s, d]) => [s, walkSec(d), Math.round(d)]);
  }

  // ------------------------------------------------------------ one search: the best journeys leaving at t or later
  // labels per round k: arrival by a ride (rArr) and on foot after a ride (wArr); ready = when one can board there
  // (a ride's arrival plus the change, a walk's arrival as it is), carried over from the rounds before
  const K = ROUNDS + 1;
  const mk = () => Array.from({ length: K }, () => new Float64Array(S));
  const mkI = () => Array.from({ length: K }, () => new Int32Array(S));
  let rArr, wArr, ready, readySrc, rpPi, rpTrip, rpBoard, rpAlight, rpFrom, rpPost, wpFrom;
  const alloc = () => { rArr = mk(); wArr = mk(); ready = mk(); readySrc = mkI(); rpPi = mkI(); rpTrip = mkI(); rpBoard = mkI(); rpAlight = mkI(); rpFrom = mkI(); rpPost = mkI(); wpFrom = mkI(); };
  alloc();
  const accSec = new Float64Array(S), accM = new Float64Array(S); // (the walk from the start to a stop of round 0)

  // O, E: access() of the start and of the target
  // lazy: how many times its real time a walk costs in this search (1: as it is). With 2 the search prefers to ride
  // where it would walk (one stop by tram instead of eight minutes on foot); what it finds can be caught all the
  // same, a walk only takes less than the search counted with, and the legs carry the real times.
  function run(O, E, t, lazy = 1) {
    if (!O.length || !E.length) return [];
    for (let k = 0; k < K; k++) { rArr[k].fill(Infinity); wArr[k].fill(Infinity); ready[k].fill(Infinity); readySrc[k].fill(-1); }
    const best = new Float64Array(S).fill(Infinity);
    const eg = new Map(); // stop -> [walk s, m] to the target
    for (const [s, sec, m] of E) { const was = eg.get(s); if (!was || sec < was[0]) eg.set(s, [sec, m]); }
    let bestT = Infinity; // (the earliest arrival at the target so far: nothing later is followed)
    // round 0: the stops of the start (src: round * 2 + 1 a walk after a ride, round * 2 a ride; 0 the start)
    let marked = new Set();
    for (const [s, sec, m] of O) {
      const a = t + sec * lazy;
      if (a >= ready[0][s]) continue;
      ready[0][s] = a; readySrc[0][s] = 0; accSec[s] = sec; accM[s] = m; best[s] = a; marked.add(s);
    }
    for (let k = 1; k < K && marked.size; k++) {
      ready[k].set(ready[k - 1]); readySrc[k].set(readySrc[k - 1]);
      // the routes through the stops improved in the last round, from the first of them along the route
      const q = new Map();
      for (const s of marked) { const sr = stopRoutes[s]; for (let i = 0; i < sr.length; i += 2) { const pi = sr[i], pos = sr[i + 1], was = q.get(pi); if (was === undefined || pos < was) q.set(pi, pos); } }
      const byRide = new Set();
      const prevReady = ready[k - 1];
      for (const [pi, pos0] of q) {
        const t0s = rT0[pi];
        if (!t0s.length) continue;
        const offs = tt.profiles[pi][3], rs = routeStops[pi], pp = tt.profiles[pi][6] || [];
        const bar = wb ? barred(pi) : null; // (the posts of this route where one cannot get on or off without help)
        let cur = -1, board = -1, bStop = -1;
        for (let i = pos0; i < rs.length; i++) {
          const s = rs[i];
          if (s < 0) continue;
          if (cur >= 0 && i > board && !(bar && bar[i])) {
            const a = t0s[cur] + offs[i];
            if (a < best[s] && a < bestT) {
              rArr[k][s] = a; best[s] = a;
              rpPi[k][s] = pi; rpTrip[k][s] = cur; rpBoard[k][s] = board; rpAlight[k][s] = i; rpFrom[k][s] = bStop; rpPost[k][s] = pp[i] || 0;
              byRide.add(s);
              const e = eg.get(s);
              if (e && a + e[0] * lazy < bestT) bestT = a + e[0] * lazy;
            }
          }
          // a trip of this route caught here, earlier than the one ridden so far (not at the last stop)
          // (ready is the earliest possible: after a ride the change counts from the post it arrived at to this one)
          let r = prevReady[s];
          if (r < Infinity && i < rs.length - 1 && !(bar && bar[i]) && (cur < 0 || r <= t0s[cur] + offs[i])) {
            const src = readySrc[k - 1][s];
            if (src > 0 && !(src & 1)) { const rr = src >> 1; r = rArr[rr][s] + changeAt(s, rpPost[rr][s], pp[i] || 0); }
            const c = lowerBound(t0s, r - offs[i]);
            if (c < t0s.length && (cur < 0 || c < cur)) { cur = c; board = i; bStop = s; }
          }
        }
      }
      // on foot from the stops reached by a ride
      const next = new Set(byRide);
      for (const s of byRide) {
        const w = walks[s], base = rArr[k][s];
        for (let i = 0; i < w.length; i += 3) {
          const n = w[i], a = base + w[i + 1] * lazy;
          if (a < wArr[k][n] && a < rArr[k][n] && a < bestT && a < best[n] + 1) {
            wArr[k][n] = a; wpFrom[k][n] = s; if (a < best[n]) best[n] = a; next.add(n);
            const e = eg.get(n);
            if (e && e[0] === 0 && a < bestT) bestT = a; // (walked to the target stop itself; never two walks one after another)
          }
        }
      }
      for (const s of next) {
        const viaRide = rArr[k][s] + CHANGE_SAME, viaWalk = wArr[k][s]; // (the least a change takes: the posts decide on boarding)
        if (viaRide < ready[k][s]) { ready[k][s] = viaRide; readySrc[k][s] = 2 * k; }
        if (viaWalk < ready[k][s]) { ready[k][s] = viaWalk; readySrc[k][s] = 2 * k + 1; }
      }
      marked = next;
    }
    // the journeys: per number of rides, those that arrive earlier than with fewer
    const out = [];
    let bestSoFar = Infinity;
    for (let k = 1; k < K; k++) {
      let a = Infinity, end = -1, foot = false, e0 = null;
      for (const [s, e] of eg) {
        if (rArr[k][s] + e[0] * lazy < a) { a = rArr[k][s] + e[0] * lazy; end = s; foot = false; e0 = e; }
        if (e[0] === 0 && wArr[k][s] < a) { a = wArr[k][s]; end = s; foot = true; e0 = e; }
      }
      if (a < bestSoFar) { const j = rebuild(k, end, foot, e0); if (j) out.push(j); bestSoFar = a; }
    }
    return out;
  }

  const walkLeg = (a, b) => { const w = walks[a]; for (let i = 0; i < w.length; i += 3) if (w[i] === b) return { sec: w[i + 1], m: w[i + 2] }; return null; };
  function rideLeg(k, s) {
    const pi = rpPi[k][s], c = rpTrip[k][s], p = tt.profiles[pi], i = rpBoard[k][s], j = rpAlight[k][s], ti = rTi[pi][c], t0 = rT0[pi][c];
    return { kind: 'ride', pi, ti, t0, fromPos: i, toPos: j, from: sNum[rpFrom[k][s]], to: sNum[s], dep: t0 + p[3][i], arr: t0 + p[3][j],
      line: tt.routes[p[0]][0], type: tt.routes[p[0]][1], hs: tt.names[tt.trips[ti + 3]], postFrom: (p[6] || [])[i] || 0, postTo: (p[6] || [])[j] || 0, stops: j - i };
  }
  // back from the target: the walk to it from the last stop, a walk at the end of round k comes from a stop reached by
  // a ride in the same round, a ride was boarded at a stop whose readiness came from an earlier round (readySrc says
  // which and how), round 0 is the start with its walk to the first stop. Walks from the start and to the target have
  // from / to null (the ends of the journey, src/spojeni.js names them).
  function rebuild(k, end, foot, e) {
    const legs = [];
    if (e[0] > 0) legs.push({ kind: 'walk', from: sNum[end], to: null, sec: e[0], m: e[1] });
    let s = end, r = k, onFoot = foot;
    for (let guard = 0; guard < 2 * K + 2; guard++) {
      if (onFoot) { const f = wpFrom[r][s], w = walkLeg(f, s); if (!w) return null; legs.unshift({ kind: 'walk', from: sNum[f], to: sNum[s], sec: w.sec, m: w.m }); s = f; }
      legs.unshift(rideLeg(r, s));
      const b = rpFrom[r][s];
      if (b < 0) return null;
      const src = readySrc[r - 1][b];
      if (src < 0) return null;
      onFoot = (src & 1) === 1; s = b; r = src >> 1;
      if (r === 0) { if (accSec[s] > 0) legs.unshift({ kind: 'walk', from: null, to: sNum[s], sec: accSec[s], m: accM[s] }); break; }
    }
    // the times of the walks: before the first ride it ends when that ride leaves, the others start on arrival
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      if (l.kind !== 'walk') continue;
      if (i === 0 && legs[1]) { l.arr = legs[1].dep; l.dep = l.arr - l.sec; } else { l.dep = legs[i - 1].arr; l.arr = l.dep + l.sec; }
    }
    if (!legs.length) return null;
    return { dep: legs[0].dep, arr: legs[legs.length - 1].arr, rides: legs.filter(l => l.kind === 'ride').length, legs };
  }

  // ------------------------------------------------------------ the offer: several departures
  // the journeys leaving between t and until (enough: stop when that many are found), none of them worse than another
  // in all of leaving, arriving and changing; by departure
  const sig = j => j.legs.map(l => (l.kind === 'ride' ? `${l.ti}:${l.fromPos}-${l.toPos}` : `w${l.from}-${l.to}`)).join('|');
  const tick = () => new Promise(r => setTimeout(r, 0));
  async function collect(O, E, t, until, enough, maxIter = 24, lazy = 1) {
    const seen = new Map();
    let tq = t;
    for (let iter = 0; iter < maxIter && tq <= until; iter++) {
      if (iter) await tick(); // (one search at a time, the page keeps drawing in between)
      const found = run(O, E, tq, lazy);
      if (!found.length) break;
      for (const j of found) if (j.dep <= until && !seen.has(sig(j))) seen.set(sig(j), j);
      // (the next search leaves after the earliest first ride found: a walk to it before does not count)
      tq = Math.min(...found.map(j => j.legs.find(l => l.kind === 'ride').dep - (j.legs[0].kind === 'walk' ? j.legs[0].sec * lazy : 0))) + 1;
      if (seen.size >= enough) break;
    }
    const all = [...seen.values()];
    // (which is worse than which is judged as the search counted: with the walks at the ends at their lazy cost, else
    // the journey that rides one stop instead of walking would lose to the walk by half a minute and never show)
    const more = lazy - 1, first = j => (j.legs[0].kind === 'walk' ? j.legs[0].sec : 0), last = j => { const l = j.legs[j.legs.length - 1]; return l.kind === 'walk' && j.legs.length > 1 ? l.sec : 0; };
    const dOf = j => j.dep - more * first(j), aOf = j => j.arr + more * last(j);
    const dominated = (x, y) => y !== x && dOf(y) >= dOf(x) && aOf(y) <= aOf(x) && y.rides <= x.rides && (dOf(y) > dOf(x) || aOf(y) < aOf(x) || y.rides < x.rides);
    return all.filter(x => !all.some(y => dominated(x, y))).sort((a, b) => a.dep - b.dep || a.arr - b.arr);
  }
  return {
    // a, b: the ends ({ num } a stop, { lon, lat } a point); date: yyyymmdd of the day of the scale, t: seconds on it.
    // mode 'later': leaving at t or after; 'earlier': leaving before t; 'arrive': arriving by t, the latest ones.
    // (async: the searches run one by one with a pause between them)
    // lazy: see run() (the journeys with less walking, src/spojeni.js lessWalk)
    async options(a, b, date, t, { n = 5, mode = 'later', lazy = 1 } = {}) {
      prepare(date);
      const O = access(a), E = access(b);
      // (a lazy search counts the walk to the first stop longer than it is, so it would miss the ride one can still
      // catch right after t: it starts that much earlier and what leaves before t is dropped)
      const back = lazy > 1 ? Math.round((lazy - 1) * Math.max(0, ...O.map(x => x[1]))) : 0;
      if (mode === 'later') return (await collect(O, E, t - back, t + 3 * 3600, n + 3 + (back ? 4 : 0), 24, lazy)).filter(j => j.dep >= t).slice(0, n); // (a few more: some drop out as dominated)
      if (mode === 'earlier') return (await collect(O, E, t - 50 * 60, t - 1, Infinity, 24, lazy)).filter(j => j.dep < t).slice(-n);
      // arriving by t: how long the journey takes at least (one search two hours before), then the departures from that
      // long before t, plus 20 minutes for waiting and changing
      const probe = run(O, E, t - 2 * 3600, lazy);
      if (!probe.length) return [];
      const d = Math.min(...probe.map(j => j.arr - j.dep));
      let out = (await collect(O, E, t - d - 20 * 60, t, Infinity, 30, lazy)).filter(j => j.arr <= t);
      // (a sparse timetable, a holiday or the night: one journey or none in those 20 minutes, so an hour back)
      if (out.length < 3) out = (await collect(O, E, t - d - 60 * 60, t, Infinity, 40, lazy)).filter(j => j.arr <= t);
      return out.slice(-n);
    },
    // the stops a point reaches on foot (for the drawing): [{ num, sec, m }]
    access: ep => access(ep).map(([s, sec, m]) => ({ num: sNum[s], sec, m })),
    walks: num => { const s = sIdx.get(+num), w = s === undefined ? [] : walks[s], o = []; for (let i = 0; i < w.length; i += 3) o.push({ num: sNum[w[i]], sec: w[i + 1], m: w[i + 2] }); return o; },
    change: num => { const s = sIdx.get(+num); return s === undefined ? CHANGE : change[s]; },
    size: () => ({ stops: S, routes: tt.profiles.length }),
  };
}

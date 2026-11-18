// People on the streets (only when zoomed in): small pixel figures that walk from A to B along the
// pavements beside the roads, walk to public transport stops, wait there, get on when a tram or bus
// comes and others get off. How many depends on the time in Brno (rush hours on working days,
// a different rhythm at the weekend, quiet nights), the weather and events in the city.
// Coordinates: image px (X along the ground in metres, Y half of it, see main.js); walking is computed
// in "ground metres" (X, 2·Y), which is close enough for a few hundred metres.

const MIN_Z = 1.5; // from about 1.3 m per pixel
const CELL = 120; // spatial grid of road segments (image px)
// share of people out at each hour (0–23) on working days and at the weekend
const WD = [0.05, 0.03, 0.02, 0.02, 0.05, 0.25, 0.6, 1, 0.9, 0.5, 0.45, 0.5, 0.6, 0.55, 0.6, 0.8, 1, 0.9, 0.7, 0.6, 0.5, 0.35, 0.2, 0.1];
const WE = [0.12, 0.08, 0.05, 0.03, 0.03, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.65, 0.6, 0.55, 0.5, 0.4, 0.25, 0.15];
const SHIRTS = ['#c9583b', '#3b6fb6', '#f3c868', '#93c96a', '#f0f2ea', '#2b2f38', '#9b59b6', '#e58ac9', '#5fb3e6', '#d8342c', '#6b7a8f'];
const SKIN = ['#f0c8a0', '#e0ac7a', '#c68642', '#8d5524'];
const HAIR = ['#2b2118', '#5a3b22', '#a87b3c', '#d9c38a', '#8a8f99', '#1b1b1b'];
const LEGS = ['#2b2f38', '#384563', '#4b3b2a', '#161d2b'];
const pick = a => a[Math.floor(Math.random() * a.length)];

export function createPeople({ GEO, walks: loadWalks, stops, vehicles, events, occluded, weather, lite = () => false }) { // (lite: a slow device, see main.js: a third of the people, no tests of who is behind a building)
  let walks = null, walksLoading = false; // footways, loaded when first zoomed in
  let net = null; // { routes: [{ p, cum (m), off (m) }], grid: Map(cell -> [[route, segment]]) }
  const people = [];
  const stopState = new Map(); // stop key -> { X, Y, seen, served, waiting: [] }
  let lastT = 0, nextStopTick = 0;

  function prepare() {
    if (!walks) { if (!walksLoading) { walksLoading = true; loadWalks().then(w => { walks = Array.isArray(w) ? w : []; net = null; }).catch(() => { walks = []; }); } return false; }
    const routes = [], grid = new Map();
    for (const p of walks) {
      if (p.length < 4) continue;
      const cum = [0];
      for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot((p[i] - p[i - 2]) / GEO.A, (2 * (p[i + 1] - p[i - 1])) / GEO.A));
      const ri = routes.length;
      routes.push({ p, cum, off: 0.5 }); // keep to one side of the pavement
      for (let i = 0; i + 3 < p.length; i += 2) {
        const x0 = Math.floor(Math.min(p[i], p[i + 2]) / CELL), x1 = Math.floor(Math.max(p[i], p[i + 2]) / CELL);
        const y0 = Math.floor(Math.min(p[i + 1], p[i + 3]) / CELL), y1 = Math.floor(Math.max(p[i + 1], p[i + 3]) / CELL);
        for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) { const k = `${gx},${gy}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([ri, i / 2]); }
      }
    }
    net = { routes, grid };
    return true;
  }
  // a point on a road: s metres from its start, on one side (pavement), and the walking direction
  function at(r, s, side) {
    const { p, cum, off } = r;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1, u = Math.max(0, Math.min(1, (s - cum[lo]) / seg));
    const ax = p[2 * lo], ay = p[2 * lo + 1], bx = p[2 * hi], by = p[2 * hi + 1];
    const gx = (bx - ax) / GEO.A, gy = (2 * (by - ay)) / GEO.A, gl = Math.hypot(gx, gy) || 1;
    const nx = -gy / gl, ny = gx / gl; // perpendicular, in ground metres
    return [ax + (bx - ax) * u + nx * off * side * GEO.A, ay + (by - ay) * u + (ny * off * side * GEO.A) / 2, gx / gl, gy / gl];
  }
  // the nearest road to an image point: [route, s (m), distance (m)]
  function nearestRoad(X, Y, maxM = 60) {
    let best = null;
    const gx0 = Math.floor(X / CELL), gy0 = Math.floor(Y / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const [ri, si] of net.grid.get(`${gx0 + dx},${gy0 + dy}`) || []) {
      const r = net.routes[ri], p = r.p;
      const ax = p[2 * si] / GEO.A, ay = (2 * p[2 * si + 1]) / GEO.A, bx = p[2 * si + 2] / GEO.A, by = (2 * p[2 * si + 3]) / GEO.A;
      const px = X / GEO.A, py = (2 * Y) / GEO.A, vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
      const u = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2));
      const d = Math.hypot(ax + vx * u - px, ay + vy * u - py);
      if (d < maxM && (!best || d < best[2])) best = [r, r.cum[si] + (r.cum[si + 1] - r.cum[si]) * u, d];
    }
    return best;
  }

  // ---- how many people are out now (0–1.6)
  // (the part from the clock is the same for a minute: the time-zone formatting is slow and this is asked at every frame)
  let clockMin = -1, clockF = 0;
  function demand() {
    const mn = Math.floor(Date.now() / 60000);
    if (mn !== clockMin) {
      clockMin = mn;
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
      const h = now.getHours(), m = now.getMinutes() / 60, wd = now.getDay(), weekend = wd === 0 || wd === 6;
      const curve = weekend ? WE : WD;
      clockF = curve[h] + (curve[(h + 1) % 24] - curve[h]) * m;
      if (wd === 0) clockF *= 0.85; // Sunday a bit quieter
    }
    let f = clockF;
    const w = weather();
    if (w === 'rain') f *= 0.55; else if (w === 'snow') f *= 0.7; else if (w === 'fog') f *= 0.85;
    return f;
  }

  function newPerson(X, Y, extra) {
    return { X, Y, born: performance.now(), fade: 0, out: false, sp: 1.1 + Math.random() * 0.5, shirt: pick(SHIRTS), skin: pick(SKIN), hair: pick(HAIR), legs: pick(LEGS), ph: Math.random() * 1000, kid: Math.random() < 0.08, ...extra };
  }
  // a walker from A to B along a road
  function spawnWalker(view, near) {
    for (let k = 0; k < 14; k++) {
      const X = near ? near[0] + (Math.random() - 0.5) * 300 : view.x0 + Math.random() * (view.x1 - view.x0);
      const Y = near ? near[1] + (Math.random() - 0.5) * 150 : view.y0 + Math.random() * (view.y1 - view.y0);
      const cell = net.grid.get(`${Math.floor(X / CELL)},${Math.floor(Y / CELL)}`);
      if (!cell || !cell.length) continue;
      const [ri, si] = cell[Math.floor(Math.random() * cell.length)];
      const r = net.routes[ri];
      const s = r.cum[si] + Math.random() * (r.cum[si + 1] - r.cum[si]);
      const side = Math.random() < 0.5 ? 1 : -1, dir = Math.random() < 0.5 ? 1 : -1;
      const [px, py] = at(r, s, side);
      if (!lite() && occluded(px, py)) continue; // appear where they can be seen (they may walk behind a house later)
      people.push(newPerson(px, py, { mode: 'walk', r, s, side, dir, left: 60 + Math.random() * 340 }));
      return;
    }
  }
  // someone walking to a stop: along the nearest road towards it, then the last metres straight
  function spawnToStop(st) {
    const nr = nearestRoad(st.X, st.Y, 15);
    if (!nr) { if (st.waiting.length < 14) { const [x, y] = spot(st); const p = newPerson(x, y, { mode: 'wait', stop: st }); st.waiting.push(p); people.push(p); } return; } // (no pavement mapped there: someone just arrives)
    const [r, sStop] = nr;
    const from = Math.max(0, Math.min(r.cum[r.cum.length - 1], sStop + (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 110)));
    const side = Math.random() < 0.5 ? 1 : -1;
    const [px, py] = at(r, from, side);
    people.push(newPerson(px, py, { mode: 'tostop', r, s: from, side, dir: sStop > from ? 1 : -1, sEnd: sStop, stop: st }));
  }
  const spot = st => [st.X + (Math.random() - 0.5) * 7 * GEO.A, st.Y + (Math.random() - 0.5) * 2.5 * GEO.A];

  function update(v, cw, ch, dt, now) {
    const view = { x0: -v.ox / v.k - 40, y0: -v.oy / v.k - 40, x1: (cw - v.ox) / v.k + 40, y1: (ch - v.oy) / v.k + 40 };
    const f = demand();
    // events today in the view: more people around them
    const ev = events().filter(e => e.X > view.x0 && e.X < view.x1 && e.Y > view.y0 && e.Y < view.y1);
    const zoomIn = Math.max(0.35, Math.min(1, (v.z - 1.2) / 1.5));
    const target = Math.round((lite() ? 0.35 : 1) * f * (1 + Math.min(0.6, ev.length * 0.3)) * zoomIn * 45 * Math.min(1.4, (cw * ch) / (1440 * 900)) + (f > 0.02 ? 2 : 0));
    // keep the number of walkers near the target (a few new ones per second, fading in)
    const walkers = people.filter(p => p.mode === 'walk' || p.mode === 'tostop' || p.mode === 'leave').length;
    if (walkers < target) { const n = Math.min(3, target - walkers); for (let i = 0; i < n; i++) if (Math.random() < dt * 4) spawnWalker(view, ev.length && Math.random() < 0.3 ? [ev[0].X, ev[0].Y] : null); }

    // stops in the view: people waiting, arrivals, vehicles taking and dropping people
    const vis = stops().filter(s => s.X > view.x0 && s.X < view.x1 && s.Y > view.y0 && s.Y < view.y1);
    for (const s of vis) {
      let st = stopState.get(s.key);
      if (!st) { st = { X: s.X, Y: s.Y, served: 0, waiting: [], w: s.w || 1, side: !!s.side }; stopState.set(s.key, st); } // (w: a post's share of its stop; side: only vehicles passing with it on their right)
      st.seen = now;
      if (!st.init) { // first seen: some already waiting
        st.init = true;
        const n = Math.round(f * (2 + Math.random() * 6) * Math.max(0.34, st.w));
        for (let i = 0; i < n; i++) { const [x, y] = spot(st); const p = newPerson(x, y, { mode: 'wait', stop: st }); st.waiting.push(p); people.push(p); }
      }
    }
    if (now > nextStopTick) { // new people heading for the stops
      nextStopTick = now + 1000;
      for (const s of vis) { const st = stopState.get(s.key); if (st.waiting.length < Math.max(5, 14 * st.w) && Math.random() < f * 0.35 * Math.max(0.34, st.w)) spawnToStop(st); }
    }
    for (const m of vehicles()) {
      if (m.X < view.x0 || m.X > view.x1 || m.Y < view.y0 || m.Y > view.y1) continue;
      for (const s of vis) {
        const st = stopState.get(s.key);
        if (now - st.served < 60000 || Math.hypot((m.X - st.X) / GEO.A, (2 * (m.Y - st.Y)) / GEO.A) > 22) continue;
        // (a post, one direction of a stop: the vehicle has it on its right, where the doors are; on the screen the right of (dx, dy) is (-dy, dx))
        if (st.side && (m.dx || m.dy) && (st.Y - m.Y) * m.dx - (st.X - m.X) * m.dy < 0) continue;
        st.served = now;
        // those waiting get on
        for (const p of st.waiting) { p.mode = 'board'; p.tx = m.X; p.ty = m.Y; p.sp = 1.6; }
        st.waiting = [];
        // others get off and walk away
        const n = Math.round(f * (1 + Math.random() * 5) * Math.max(0.5, st.w));
        for (let i = 0; i < n; i++) { const [x, y] = spot(st); people.push(newPerson(m.X, m.Y, { mode: 'leave', tx: x, ty: y })); }
      }
    }

    // move everyone
    for (const p of people) {
      p.fade = Math.min(1, p.fade + dt * 1.5);
      if (p.mode === 'walk' || p.mode === 'tostop') {
        const step = p.sp * dt * (p.kid ? 0.85 : 1);
        p.s += p.dir * step;
        const len = p.r.cum[p.r.cum.length - 1];
        if (p.mode === 'walk') { p.left -= step; if (p.left <= 0 || p.s <= 0 || p.s >= len) p.out = true; }
        else if ((p.dir > 0 && p.s >= p.sEnd) || (p.dir < 0 && p.s <= p.sEnd) || p.s <= 0 || p.s >= len) { const [x, y] = spot(p.stop); p.mode = 'approach'; p.tx = x; p.ty = y; }
        p.s = Math.max(0, Math.min(len, p.s));
        const [x, y, gx, gy] = at(p.r, p.s, p.side);
        p.X = x; p.Y = y; p.face = (gx * p.dir >= 0) ? 1 : -1; p.moving = true;
      } else if (p.mode === 'approach' || p.mode === 'board' || p.mode === 'leave') {
        const gx = (p.tx - p.X) / GEO.A, gy = (2 * (p.ty - p.Y)) / GEO.A, d = Math.hypot(gx, gy), step = p.sp * dt;
        if (d <= step) {
          p.X = p.tx; p.Y = p.ty; p.moving = false;
          if (p.mode === 'approach') { p.mode = 'wait'; if (p.stop.waiting.length < 16) p.stop.waiting.push(p); else p.out = true; }
          else if (p.mode === 'board') p.out = true; // inside the vehicle
          else { // got off: off along the nearest road
            const nr = nearestRoad(p.X, p.Y, 15);
            if (nr) { p.mode = 'walk'; p.r = nr[0]; p.s = nr[1]; p.side = Math.random() < 0.5 ? 1 : -1; p.dir = Math.random() < 0.5 ? 1 : -1; p.left = 40 + Math.random() * 250; } else p.out = true;
          }
        } else { p.X += (gx / d) * step * GEO.A; p.Y += ((gy / d) * step * GEO.A) / 2; p.face = gx >= 0 ? 1 : -1; p.moving = true; }
      } else p.moving = false; // waiting
      if (p.out) p.fade -= dt * 3; // leaving: fades out (went into a house, got on)
    }
    // remove the faded and the far away ones; forget stops long out of view
    for (let i = people.length - 1; i >= 0; i--) {
      const p = people[i];
      const far = p.X < view.x0 - 300 || p.X > view.x1 + 300 || p.Y < view.y0 - 200 || p.Y > view.y1 + 200;
      if ((p.out && p.fade <= 0) || far) { people.splice(i, 1); if (p.stop && p.mode === 'wait') p.stop.waiting = p.stop.waiting.filter(q => q !== p); }
    }
    for (const [k, st] of stopState) if (now - st.seen > 60000) { for (const p of st.waiting) p.out = true; stopState.delete(k); }
  }

  // a tiny figure (2 × 4 px) for when zoomed out a bit: head, shirt, stepping legs
  function mini(ctx, x, y, p, t) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.fade));
    const step = p.moving ? Math.floor((t + p.ph) / 220) % 2 : 0;
    ctx.fillStyle = p.legs; ctx.fillRect(x + step, y - 1, 1, 1);
    ctx.fillStyle = p.shirt; ctx.fillRect(x, y - 3, 2, 2);
    ctx.fillStyle = p.skin; ctx.fillRect(x + (p.face > 0 ? 1 : 0), y - 4, 1, 1);
    ctx.globalAlpha = 1;
  }
  // a figure: 3 × 7 pixel units (head, body, legs that step while walking)
  function figure(ctx, x, y, u, p, t) {
    const h = p.kid ? 5 : 7;
    const top = y - h * u;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.fade));
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - u, y, 3 * u, u); // shadow
    const step = p.moving ? Math.floor((t + p.ph) / 220) % 2 : 0;
    ctx.fillStyle = p.legs;
    if (step) { ctx.fillRect(x - u, y - 2 * u, u, 2 * u); ctx.fillRect(x + u, y - u, u, u); } else { ctx.fillRect(x - u, y - u, u, u); ctx.fillRect(x + u, y - 2 * u, u, 2 * u); }
    ctx.fillStyle = p.shirt; ctx.fillRect(x - u, top + 2 * u, 3 * u, (h - 4) * u);
    ctx.fillStyle = p.skin; ctx.fillRect(x, top, u, 2 * u);
    ctx.fillStyle = p.hair; ctx.fillRect(x, top, u, u); ctx.fillRect(x + (p.face > 0 ? -u : u), top, u, u);
    ctx.globalAlpha = 1;
  }

  function draw(ctx, v, t, on) {
    if (!on || v.z < MIN_Z) { if (people.length) { people.length = 0; stopState.clear(); } lastT = t; return; }
    if (!net && !prepare()) return;
    const dt = Math.min(0.1, Math.max(0, (t - lastT) / 1000)); lastT = t;
    const cw = ctx.canvas.clientWidth, ch = ctx.canvas.clientHeight;
    update(v, cw, ch, dt, performance.now());
    const H = Math.round(1.8 * v.k * 1.3); // height on the screen: 1.8 m, a little enlarged (4 px at 0.6 m/px, 8 px at 0.3 m/px)
    const u = Math.max(1, Math.round(H / 7));
    // far ones first, so nearer ones overlap them; people behind buildings are not drawn
    people.sort((a, b) => a.Y - b.Y);
    for (const p of people) {
      const x = Math.round(v.ox + p.X * v.k), y = Math.round(v.oy + p.Y * v.k);
      if (x < -10 || y < -20 || x > cw + 10 || y > ch + 10) continue;
      if (!lite() && occluded(p.X, p.Y)) continue;
      if (H < 7) mini(ctx, x, y, p, t); else figure(ctx, x, y, u, p, t);
    }
  }
  return { draw, count: () => people.length };
}

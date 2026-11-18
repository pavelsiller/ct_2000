export function deadRoads(routes, lines, points, A) {
  if (!lines.length && !points.length) return null;
  const STEP = 4 * A, NEAR = 2.5 * A, TOL = 4 * A, REACH = 1500 * A, CELL = 2 * NEAR, MIN_RUN = 6, BIG = 80 * A;
  const R = routes.map(([c, p, ow]) => {
    if (c === 9 || p.length < 4) return null;
    const cum = [0];
    for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
    const len = cum[cum.length - 1], n = Math.max(1, Math.ceil(len / STEP)), xy = new Float32Array(2 * (n + 1));
    for (let i = 0, k = 0; i <= n; i++) {
      const s = (len * i) / n;
      while (k + 2 < cum.length && cum[k + 1] < s) k++;
      const f = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
      xy[2 * i] = p[2 * k] + (p[2 * k + 2] - p[2 * k]) * f; xy[2 * i + 1] = p[2 * k + 1] + (p[2 * k + 3] - p[2 * k + 1]) * f;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    return { n, len, xy, ow: !!ow, dead: null, bb: [x0, y0, x1, y1] };
  });
  const cellOf = (x, y, c) => (Math.floor(x / c) + 40000) * 100000 + Math.floor(y / c) + 40000; // (a number: quicker in a Set than a string)

  // ---- 1. the closed pieces
  let any = false;
  if (lines.length) {
    const L = new Set(), Lbig = new Set(); // the cells the closed lines pass through (a point every 2 px), fine and coarse
    for (const p of lines) for (let i = 0; i + 3 < p.length; i += 2) {
      const n = Math.max(1, Math.ceil(Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]) / 2));
      for (let q = 0; q <= n; q++) { const x = p[i] + ((p[i + 2] - p[i]) * q) / n, y = p[i + 1] + ((p[i + 3] - p[i + 1]) * q) / n; L.add(cellOf(x, y, TOL)); Lbig.add(cellOf(x, y, BIG)); }
    }
    const on = (x, y) => { for (let dx = -TOL; dx <= TOL; dx += TOL) for (let dy = -TOL; dy <= TOL; dy += TOL) if (L.has(cellOf(x + dx, y + dy, TOL))) return true; return false; };
    const nearLine = bb => { for (let x = bb[0] - TOL; x <= bb[2] + TOL + BIG; x += BIG) for (let y = bb[1] - TOL; y <= bb[3] + TOL + BIG; y += BIG) if (Lbig.has(cellOf(Math.min(x, bb[2] + TOL), Math.min(y, bb[3] + TOL), BIG))) return true; return false; };
    for (const r of R) {
      if (!r || !nearLine(r.bb)) continue;
      // a road that ends on a closed line leads only into it: its end is closed (a side street of a closed street,
      // the road to the portal of a closed tunnel: the tunnels themselves are not among the roads of the cars)
      for (const i of [0, r.n]) if (on(r.xy[2 * i], r.xy[2 * i + 1])) { r.dead ||= new Uint8Array(r.n + 1); r.dead[i] = 1; any = true; }
      // a run of the road along a closed line: at least MIN_RUN points in a row (24 m), or most of a short road
      for (let i = 0; i <= r.n; i++) {
        if (!on(r.xy[2 * i], r.xy[2 * i + 1])) continue;
        let j = i;
        while (j < r.n && on(r.xy[2 * j + 2], r.xy[2 * j + 3])) j++;
        if (j - i + 1 >= MIN_RUN || j - i + 1 >= 0.6 * (r.n + 1)) { r.dead ||= new Uint8Array(r.n + 1); r.dead.fill(1, i, j + 1); any = true; }
        i = j;
      }
    }
  }
  let tunnelEnds = null; // [road, its end point] to close once the roads are in their cells (an end at another road is a junction, not a portal)
  for (const [px, py] of points) { // the nearest road within 25 m: 40 m of it each way
    let br = null, bd = 25 * A;
    for (const r of R) { if (!r) continue; for (let i = 0; i <= r.n; i++) { const d = Math.hypot(r.xy[2 * i] - px, r.xy[2 * i + 1] - py); if (d < bd) { bd = d; br = r; } } }
    if (!br) {
      // No road there: the point lies in a tunnel (the tunnels are not among the roads of the cars, they end at the
      // portals). The roads that end within 350 m, at no other road, and point at it are the ways into that tunnel.
      for (const r of R) {
        if (!r || r.n < 2 || r.bb[0] > px + 350 * A || r.bb[2] < px - 350 * A || r.bb[1] > py + 350 * A || r.bb[3] < py - 350 * A) continue;
        for (const [i, j] of [[0, Math.min(r.n, 3)], [r.n, Math.max(0, r.n - 3)]]) {
          const ex = r.xy[2 * i], ey = r.xy[2 * i + 1], tx = ex - r.xy[2 * j], ty = ey - r.xy[2 * j + 1], vx = px - ex, vy = py - ey, dist = Math.hypot(vx, vy), tl = Math.hypot(tx, ty);
          if (dist > 350 * A || dist < 1 || tl < 1 || (tx * vx + ty * vy) / (tl * dist) < 0.9) continue; // (within 25° of the way the road goes on)
          (tunnelEnds ||= []).push([r, i]);
        }
      }
      continue;
    }
    br.dead ||= new Uint8Array(br.n + 1);
    for (let i = 0; i <= br.n; i++) if (Math.hypot(br.xy[2 * i] - px, br.xy[2 * i + 1] - py) < 40 * A) { br.dead[i] = 1; any = true; }
  }
  if (!any && !tunnelEnds) return null;

  // ---- 2. on along the roads to the first way out
  const H = new Map(); // where the roads are: [road, point, road, point, …] by cell
  R.forEach((r, ri) => { if (!r) return; for (let i = 0; i <= r.n; i++) { const k = cellOf(r.xy[2 * i], r.xy[2 * i + 1], CELL); let a = H.get(k); if (!a) H.set(k, (a = [])); a.push(ri, i); } });
  // the other roads at a point of a road: [road, its nearest point] of each within NEAR
  const others = (ri, i) => {
    const x = R[ri].xy[2 * i], y = R[ri].xy[2 * i + 1], best = new Map();
    for (let gx = -CELL; gx <= CELL; gx += CELL) for (let gy = -CELL; gy <= CELL; gy += CELL) {
      const a = H.get(cellOf(x + gx, y + gy, CELL));
      if (!a) continue;
      for (let q = 0; q < a.length; q += 2) {
        if (a[q] === ri) continue;
        const o = R[a[q]], d = Math.hypot(o.xy[2 * a[q + 1]] - x, o.xy[2 * a[q + 1] + 1] - y);
        if (d <= NEAR && !(best.has(a[q]) && best.get(a[q])[1] <= d)) best.set(a[q], [a[q + 1], d]);
      }
    }
    return [...best].map(([q, [j]]) => [q, j]);
  };
  if (tunnelEnds) for (const [r, i] of tunnelEnds) if (!others(R.indexOf(r), i).length) { r.dead ||= new Uint8Array(r.n + 1); r.dead[i] = 1; any = true; }
  if (!any) return null;
  // [road, the point to look at first, the way to go (+1 / -1 along its points), how far the closure has come,
  //  the road it came from (not a way out near the start), the first point is closed already]
  const stack = [];
  R.forEach((r, ri) => {
    if (!r || !r.dead) return;
    for (let i = 0; i <= r.n; i++) {
      if (!r.dead[i]) continue;
      if (i > 0 && !r.dead[i - 1]) stack.push([ri, i - 1, -1, 0, -1, false]);
      if (i < r.n && !r.dead[i + 1]) stack.push([ri, i + 1, 1, 0, -1, false]);
    }
    // (closed up to its end: the roads that go on from there)
    if (r.dead[0]) stack.push([ri, 0, -1, 0, -1, true]);
    if (r.dead[r.n]) stack.push([ri, r.n, 1, 0, -1, true]);
  });
  while (stack.length) {
    let [ri, k, d, far, from, first] = stack.pop();
    const r = R[ri];
    r.dead ||= new Uint8Array(r.n + 1);
    for (let steps = 0; k >= 0 && k <= r.n && far <= REACH; k += d, steps++, far += STEP) {
      if (r.dead[k] && !(first && steps === 0)) break; // (a piece of this road that is dead already)
      const live = others(ri, k).filter(([q, j]) => !(R[q].dead && R[q].dead[j]) && !(q === from && steps < 3));
      let out = false;
      const more = [];
      for (const [q, j] of live) {
        const o = R[q], starts = j <= 1, ends = j >= o.n - 1;
        if (!r.ow) {
          // a two-way road: any other road is a way out, but for the one road that simply goes on from its end
          if (!o.ow && live.length === 1 && (k === 0 || k === r.n) && (starts || ends)) more.push([q, ends && !starts ? o.n : 0, ends && !starts ? -1 : 1]);
          else out = true;
        } else if (!o.ow) out = true;
        // a one-way road, its cars go the way of its points: against them (d < 0) the cars here drive toward the
        // closure and need a road to leave by; a one-way road that ends here only brings more of them
        else if (d < 0) { if (ends) more.push([q, o.n, -1]); else out = true; }
        // with them (d > 0) the cars here would come out of the closure: the place is alive again where a road
        // brings cars in; a one-way road that starts here only takes them away
        else if (starts) more.push([q, 0, 1]); else out = true;
      }
      if (out) break;
      r.dead[k] = 1;
      for (const [q, j, dd] of more) stack.push([q, j, dd, far, ri, false]);
    }
  }
  return R.map(r => {
    if (!r || !r.dead) return undefined;
    const out = [], ds = r.len / r.n;
    for (let i = 0; i <= r.n; i++) {
      if (!r.dead[i]) continue;
      let j = i;
      while (j < r.n && r.dead[j + 1]) j++;
      out.push([i * ds - ds / 2, j * ds + ds / 2]);
      i = j;
    }
    return out.length ? out : undefined;
  });
}

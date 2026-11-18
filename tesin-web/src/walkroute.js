export function createWalkRoute(url) {
  let G = null, loading = null;
  const listeners = [];
  function load() {
    if (G || loading) return loading || Promise.resolve(G);
    loading = fetch(url).then(r => (r.ok ? r.json() : null)).then(d => { if (d) G = build(d); listeners.forEach(f => f()); return G; }).catch(() => null);
    return loading;
  }
  const len2 = (dx, dy) => Math.hypot(dx, dy * 2); // (image px to metres, the height left out)
  const CELL = 120;
  function build(d) {
    const N = d.n.length / 2, E = d.e.length / 3, nx = d.n;
    // the points of each way: its two ends and its bends, from a to b
    const pts = new Array(E), metres = new Float32Array(E), A = new Int32Array(E), B = new Int32Array(E);
    for (let e = 0; e < E; e++) {
      const a = d.e[3 * e], b = d.e[3 * e + 1];
      A[e] = a; B[e] = b; metres[e] = d.e[3 * e + 2];
      pts[e] = [nx[2 * a], nx[2 * a + 1], ...(d.s[e] || []), nx[2 * b], nx[2 * b + 1]];
    }
    // the ways at each junction (CSR)
    const off = new Int32Array(N + 1);
    for (let e = 0; e < E; e++) { off[A[e] + 1]++; off[B[e] + 1]++; }
    for (let i = 0; i < N; i++) off[i + 1] += off[i];
    const adj = new Int32Array(off[N]), cur = off.slice(0, N);
    for (let e = 0; e < E; e++) { adj[cur[A[e]]++] = e; adj[cur[B[e]]++] = e; }
    // a grid of the ways, to find the one nearest to a point
    const grid = new Map();
    for (let e = 0; e < E; e++) {
      const p = pts[e];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
        const k = cx * 100000 + cy; let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(e);
      }
    }
    return { N, E, pts, metres, A, B, off, adj, grid, dist: new Float64Array(N), seen: new Int32Array(N), prev: new Int32Array(N), stamp: 0 };
  }
  // the nearest place on a way: { e, i (the piece of its polyline), t, x, y, d (metres away), along (metres from its a) }
  function snap(X, Y, maxD) {
    const cx = Math.floor(X / CELL), cy = Math.floor(Y / CELL);
    let best = null;
    for (let r = 0; r <= 2 && !best; r++) for (let gx = cx - r; gx <= cx + r; gx++) for (let gy = cy - r; gy <= cy + r; gy++) {
      if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue;
      for (const e of G.grid.get(gx * 100000 + gy) || []) {
        const p = G.pts[e];
        for (let i = 0; i + 3 < p.length; i += 2) {
          const ax = p[i], ay = p[i + 1], dx = p[i + 2] - ax, dy = p[i + 3] - ay, L = dx * dx + 4 * dy * dy;
          const t = L ? Math.max(0, Math.min(1, ((X - ax) * dx + 4 * (Y - ay) * dy) / L)) : 0;
          const x = ax + t * dx, y = ay + t * dy, dd = len2(X - x, Y - y);
          if (dd <= maxD && (!best || dd < best.d)) best = { e, i, t, x, y, d: dd };
        }
      }
    }
    if (!best) return null;
    // (metres along the way to the place: by the drawn length, scaled to the way's real length)
    const p = G.pts[best.e];
    let all = 0, to = 0;
    for (let i = 0; i + 3 < p.length; i += 2) { const l = len2(p[i + 2] - p[i], p[i + 3] - p[i + 1]); if (i < best.i) to += l; else if (i === best.i) to += l * best.t; all += l; }
    best.along = all ? (to / all) * G.metres[best.e] : 0;
    return best;
  }
  // a piece of a way from a snapped place to one of its ends (toB: towards b), as points
  function part(s, toB) {
    const p = G.pts[s.e], out = [s.x, s.y];
    if (toB) for (let i = 2 * (s.i / 2 + 1); i < p.length; i += 2) out.push(p[i], p[i + 1]);
    else for (let i = s.i; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
    return out;
  }
  // the way on foot from (ax, ay) to (bx, by), image px: { pts: [x, y, …] from a to b, m (metres) }, or null
  function route(ax, ay, bx, by, { maxSnap = 120, maxM = 4000 } = {}) {
    if (!G) return null;
    const sa = snap(ax, ay, maxSnap), sb = snap(bx, by, maxSnap);
    if (!sa || !sb) return null;
    // both on the same way: along it
    if (sa.e === sb.e) {
      const p = G.pts[sa.e], fwd = sa.i < sb.i || (sa.i === sb.i && sa.t <= sb.t), out = [ax, ay, sa.x, sa.y];
      if (fwd) for (let i = sa.i + 2; i <= sb.i; i += 2) out.push(p[i], p[i + 1]); else for (let i = sa.i; i > sb.i; i -= 2) out.push(p[i], p[i + 1]);
      out.push(sb.x, sb.y, bx, by);
      return { pts: out, m: Math.abs(sb.along - sa.along) + sa.d + sb.d };
    }
    // Dijkstra from the two ends of the way at a, until the cheapest way into the way at b is sure
    const st = ++G.stamp, { dist, seen, prev } = G;
    const heap = [];
    const push = (c, n) => { heap.push([c, n]); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const relax = (n, c, e) => { if (seen[n] !== st || c < dist[n]) { seen[n] = st; dist[n] = c; prev[n] = e; push(c, n); } };
    relax(G.A[sa.e], sa.along, -1);
    relax(G.B[sa.e], G.metres[sa.e] - sa.along, -2);
    const endA = G.A[sb.e], endB = G.B[sb.e];
    let best = Infinity, bestEnd = -1;
    while (heap.length) {
      const [c, n] = pop();
      if (c > dist[n] || c >= best || c > maxM) { if (c >= best || c > maxM) break; continue; }
      if (n === endA && c + sb.along < best) { best = c + sb.along; bestEnd = n; }
      if (n === endB && c + G.metres[sb.e] - sb.along < best) { best = c + G.metres[sb.e] - sb.along; bestEnd = n; }
      for (let k = G.off[n]; k < G.off[n + 1]; k++) { const e = G.adj[k], o = G.A[e] === n ? G.B[e] : G.A[e]; relax(o, c + G.metres[e], e); }
    }
    if (bestEnd < 0) return null;
    // back from the end reached to the way at a
    const chain = [];
    let n = bestEnd;
    while (prev[n] >= 0) { const e = prev[n], o = G.A[e] === n ? G.B[e] : G.A[e]; chain.push([e, o, n]); n = o; }
    const first = prev[n] === -1 ? part(sa, false) : part(sa, true); // (to the end n of the way at a)
    const out = [ax, ay, ...first];
    for (let k = chain.length - 1; k >= 0; k--) {
      const [e, from] = chain[k], p = G.pts[e];
      if (G.A[e] === from) for (let i = 2; i < p.length; i += 2) out.push(p[i], p[i + 1]);
      else for (let i = p.length - 4; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
    }
    const last = part(sb, bestEnd === endB); // (from the end reached along the way at b to its place)
    for (let i = last.length - 2; i >= 0; i -= 2) out.push(last[i], last[i + 1]);
    out.push(bx, by);
    return { pts: out, m: best + sa.d + sb.d };
  }
  return { load, route, ready: () => !!G, onLoad: f => listeners.push(f) };
}

export function createPruhy({ base, rotation, file = 'pruhy.json', r1 = 4.5, r2 = 9, align = 0.8 }) {
  const CELL = 24, R1 = r1, R2 = r2, ALIGN = align;
  let grid = null, loading = null;
  const key = (cx, cy) => cx * 100003 + cy;
  // (pruhy.json: { T, k: ["tx_ty", …] } the tiles of T image pixels that have lanes; pruhy/<tx>_<ty>.json { t: [[id,
  // direction, X0, Y0, …], …] } loaded when a car first asks there; a lane in several tiles is added once, by its id)
  const have = new Set();
  function add(tracks) {
    const g = grid;
    for (const w of tracks) {
      const wi = w[0], dir = w[1];
      if (have.has(wi)) continue;
      have.add(wi);
      for (let i = 2; i + 3 < w.length; i += 2) {
        const ax = w[i], ay = w[i + 1] * 2, bx = w[i + 2], by = w[i + 3] * 2, L = Math.hypot(bx - ax, by - ay);
        if (L < 0.05) continue;
        const s = [ax, ay, (bx - ax) / L, (by - ay) / L, L, dir, wi];
        const n = Math.ceil(L / (CELL / 2));
        let last = null;
        for (let q = 0; q <= n; q++) {
          const k = key(Math.floor((ax + ((bx - ax) * q) / n) / CELL), Math.floor((ay + ((by - ay) * q) / n) / CELL));
          if (k === last) continue;
          last = k;
          let a = g.get(k); if (!a) g.set(k, (a = []));
          if (a[a.length - 1] !== s) a.push(s);
        }
      }
    }
  }
  let T = 0, tiles = null;
  const asked = new Set();
  const dir = () => `${base}data/r${rotation()}/${file.replace(/\.json$/, '')}/`;
  function tileAt(X, Y) { // (per car and frame: a number lookup; the name and the fetch only once per tile)
    const tx = Math.floor(X / T), ty = Math.floor(Y / T), k = tx * 65536 + ty;
    if (asked.has(k)) return;
    asked.add(k);
    const name = `${tx}_${ty}`;
    if (!tiles.has(name)) return;
    fetch(`${dir()}${name}.json`).then(r => (r.ok ? r.json() : null)).then(d => { if (d && d.t) add(d.t); }).catch(() => {});
  }
  const load = () => (loading ||= fetch(`${base}data/r${rotation()}/${file}`).then(r => (r.ok ? r.json() : null)).then(d => {
    if (!d) return;
    grid = new Map();
    if (d.t) add(d.t.map((w, i) => [i + 1, ...w])); // (the old file with all lanes at once)
    else { T = d.T; tiles = new Set(d.k); }
  }).catch(() => {}));
  // A car at (X, Y) (image) travelling along (tx, ty): its place in a lane of its direction, [X, Y]; null when no
  // lane is near (the car stays where it is). Where several lanes run side by side (within 3.6 m of the nearest),
  // `pick` chooses among them from the left: a number of the car (taken modulo the lanes), or with strict the row
  // of a queue, and then false = there is no such lane here (the car of that row is not drawn).
  const cand = [];
  function lane(X, Y, tx, ty, pick = 0, strict = false) {
    if (!grid) return null;
    if (tiles) { tileAt(X - 24, Y - 12); tileAt(X + 24, Y - 12); tileAt(X - 24, Y + 12); tileAt(X + 24, Y + 12); } // (a car near a tile edge sees the lanes beyond)
    const px = X, py = Y * 2;
    let ux = tx, uy = ty * 2;
    const tl = Math.hypot(ux, uy);
    if (tl < 1e-6) return null;
    ux /= tl; uy /= tl;
    const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL);
    cand.length = 0;
    let dmin = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const cell = grid.get(key(cx + a, cy + b));
      if (!cell) continue;
      for (const s of cell) {
        const al = s[2] * ux + s[3] * uy;
        if (Math.abs(al) < ALIGN || (s[5] && s[5] * al < 0)) continue;
        const t = Math.max(0, Math.min(s[4], (px - s[0]) * s[2] + (py - s[1]) * s[3]));
        const qx = s[0] + s[2] * t, qy = s[1] + s[3] * t, d = Math.hypot(qx - px, qy - py);
        if (d > R2) continue;
        let c = null;
        for (const q of cand) if (q[4] === s[6]) { c = q; break; }
        if (!c) cand.push((c = [0, 0, Infinity, 0, s[6]]));
        if (d < c[2]) { c[0] = qx; c[1] = qy; c[2] = d; c[3] = (qx - px) * -uy + (qy - py) * ux; } // (c[3]: how far to the right of the car)
        if (d < dmin) dmin = d;
      }
    }
    if (!cand.length) return null;
    let n = 0;
    for (const c of cand) if (c[2] <= dmin + 3.6) cand[n++] = c;
    cand.length = n;
    cand.sort((p, q) => p[3] - q[3]);
    if (strict && pick >= n) return false;
    const q = cand[strict ? pick : pick % n];
    if (strict && q[2] > 6) return false; // (a row of a queue is not carried far aside: rather no car than one out of its row)
    const w = q[2] <= R1 ? 1 : (R2 - q[2]) / (R2 - R1);
    return [px + (q[0] - px) * w, (py + (q[1] - py) * w) / 2];
  }
  return { load, lane, ready: () => !!grid };
}

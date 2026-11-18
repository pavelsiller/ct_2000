import { inMap } from './extent.js';

const MX = 111320 * Math.cos(49.2 * Math.PI / 180), MY = 111320; // metres per degree in Brno
const TOL = 12; // m: rows of one carriageway differ by less
function alongShare(A, B) { // share of the line A (a point every ~10 m) that runs along the line B in the same direction
  let n = 0, hit = 0;
  for (let i = 0; i + 1 < A.length; i++) {
    const ax = A[i][0], ay = A[i][1], dx = A[i + 1][0] - ax, dy = A[i + 1][1] - ay;
    const steps = Math.max(1, Math.round(Math.hypot(dx, dy) / 10));
    for (let s = 0; s <= steps; s++) {
      if (s === steps && i + 2 < A.length) continue; // the joint belongs to the next segment
      const x = ax + (dx * s) / steps, y = ay + (dy * s) / steps;
      n++;
      for (let k = 0; k + 1 < B.length; k++) {
        const ex = B[k + 1][0] - B[k][0], ey = B[k + 1][1] - B[k][1], L = ex * ex + ey * ey;
        if (ex * dx + ey * dy <= 0) continue;
        const t = L ? Math.max(0, Math.min(1, ((x - B[k][0]) * ex + (y - B[k][1]) * ey) / L)) : 0;
        if (Math.hypot(B[k][0] + ex * t - x, B[k][1] + ey * t - y) <= TOL) { hit++; break; }
      }
    }
  }
  return n ? hit / n : 0;
}
// rows: [{ t (freshness, ms), pub (pubMillis), len, path: [[lon, lat], …] }]; returns the rows to keep
export function newestPerStretch(rows) {
  const R = rows.map(r => {
    const m = r.path.map(([lon, lat]) => [lon * MX, lat * MY]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of m) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { r, m, bb: [x0 - TOL, y0 - TOL, x1 + TOL, y1 + TOL] };
  }).sort((a, b) => b.r.t - a.r.t || (b.r.pub || 0) - (a.r.pub || 0) || (b.r.len || 0) - (a.r.len || 0));
  const kept = [];
  for (const o of R) {
    const oe = o.m[o.m.length - 1];
    const dup = kept.some(k => {
      if (o.bb[2] < k.bb[0] || k.bb[2] < o.bb[0] || o.bb[3] < k.bb[1] || k.bb[3] < o.bb[1]) return false;
      if (alongShare(o.m, k.m) >= 0.5) return true;
      const ke = k.m[k.m.length - 1];
      return Math.hypot(ke[0] - oe[0], ke[1] - oe[1]) <= 30 && alongShare(k.m, o.m) >= 0.5;
    });
    if (!dup) kept.push(o);
  }
  return kept.map(o => o.r);
}

// the map area: rows outside the diamond of the map are left out (src/extent.js; it was a rectangle around Brno, which
// let in Kuřim and the villages in its corners)
export const inArea = inMap;
// level 5 with a blocking report, zero speed or no delay = the road is closed (a report of a driver), not a queue
const isClosure = a => a.level >= 5 && (a.blockingAlertUuid || (a.delay ?? 0) < 0 || !a.speedKMH);

// rows: [{ a (attributes of the table), path, t (freshness, ms) }], already limited to the rows that count as current.
// Returns { jams: [{ level, road, speed, delay, len, street, t, path }], skipped: { closure, local, other } }.
export function pickJams(rows) {
  const seen = new Set();
  const valid = rows.filter(r => r.path && r.path.length > 1 && !seen.has(r.a.uuid) && seen.add(r.a.uuid))
    .map(r => ({ ...r, pub: r.a.pubMillis, len: r.a.length }));
  // closed roads are compared among themselves, so that a short closed section does not hide a real queue next to it.
  // The freshest row decides even when it is one that is not shown: a jam that eased into a short hold-up is gone.
  const one = [...newestPerStretch(valid.filter(r => !isClosure(r.a))), ...newestPerStretch(valid.filter(r => isClosure(r.a)))];
  const jams = [], skipped = { closure: 0, local: 0, other: 0 };
  for (const { a, path, t } of one) {
    const pm = path[Math.floor(path.length / 2)];
    if (!inArea(pm[0], pm[1])) continue;
    // Plausibility check of a Waze jam (the table also contains things that are not queues of cars):
    //  - a closed road (above): closures are shown from the reports themselves
    //  - no delay = nothing to show
    //  - parking lots, private and off-road ways, paths: not traffic
    //  - local streets (Waze road type 1): one slow car (rubbish truck, someone parking) makes a 'jam' there;
    //    shown only when it is a real hold-up: at least 3 minutes of delay and heavy level
    const rt = +a.roadType || 0;
    if (isClosure(a)) { skipped.closure++; continue; }
    if (!(a.delay > 0)) { skipped.other++; continue; }
    if ([5, 8, 10, 17, 18, 19, 20].includes(rt)) { skipped.other++; continue; }
    if (rt === 1 && !(a.delay >= 180 && a.level >= 4)) { skipped.local++; continue; }
    jams.push({ level: a.level || 1, road: rt, speed: a.speedKMH, delay: a.delay, len: a.length, street: a.street || '', t, path });
  }
  return { jams, skipped };
}

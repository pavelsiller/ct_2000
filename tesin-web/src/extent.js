const LON0 = 16.606, LAT0 = 49.201;
const KX = Math.cos((LAT0 * Math.PI) / 180) * 111320, KY = 110574;
let R = 14000;
// (the page sets what the tiles' meta.json says, src/main.js)
export const setMapRadius = r => { if (r > 0) R = r; };

export const inMap = (lon, lat) => Math.abs((lon - LON0) * KX) + Math.abs((lat - LAT0) * KY) <= R;
// an object with lon and lat (a thing without a position is not "outside": it is kept, e.g. a city-wide project)
export const itemInMap = o => o.lon == null || o.lat == null || inMap(+o.lon, +o.lat);

// a shape (flat rings [lon, lat, …], or one point) counts as in the map when the middle of its points is
export function shapeInMap(rings) {
  let x = 0, y = 0, n = 0;
  for (const r of rings) for (let i = 0; i + 1 < r.length; i += 2) { x += r[i]; y += r[i + 1]; n++; }
  return n > 0 && inMap(x / n, y / n);
}

// a line (flat [lon, lat, …]) cut to the map: its pieces inside, their cut ends on the edge of the diamond
const SIDES = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
export function clipLine(flat) {
  let all = true;
  for (let i = 0; i + 1 < flat.length; i += 2) if (!inMap(flat[i], flat[i + 1])) { all = false; break; }
  if (all) return [flat];
  const parts = [];
  let cur = null;
  for (let i = 0; i + 3 < flat.length; i += 2) {
    const ax = (flat[i] - LON0) * KX, ay = (flat[i + 1] - LAT0) * KY;
    const dx = (flat[i + 2] - LON0) * KX - ax, dy = (flat[i + 3] - LAT0) * KY - ay;
    let t0 = 0, t1 = 1;
    for (const [sx, sy] of SIDES) {
      const p = sx * dx + sy * dy, q = R - (sx * ax + sy * ay);
      if (p === 0) { if (q < 0) t1 = -1; } else if (p > 0) t1 = Math.min(t1, q / p); else t0 = Math.max(t0, q / p);
    }
    if (t0 >= t1) { cur = null; continue; }
    const at = t => [(ax + dx * t) / KX + LON0, (ay + dy * t) / KY + LAT0];
    if (!cur || t0 > 0) { cur = t0 > 0 ? at(t0) : [flat[i], flat[i + 1]]; parts.push(cur); }
    if (t1 < 1) { cur.push(...at(t1)); cur = null; } else cur.push(flat[i + 2], flat[i + 3]);
  }
  return parts;
}
// the same for a line of pairs [[lon, lat], …]: its longest piece inside, or null
export function clipPath(path) {
  const parts = clipLine(path.flat());
  if (!parts.length) return null;
  const best = parts.reduce((m, p) => (p.length > m.length ? p : m));
  if (best.length === path.length * 2) return path;
  const out = [];
  for (let i = 0; i < best.length; i += 2) out.push([best[i], best[i + 1]]);
  return out;
}

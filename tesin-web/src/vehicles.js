// Vehicle sprites drawn on the map in real-world size (metres -> screen pixels), as small
// boxes in the same isometric look as the buildings: side, roof and a few details.
export const CAR_COLORS = ['#c9583b', '#f0f2ea', '#3b6fb6', '#2b2f38', '#9aa3ad', '#5c8f4a', '#d8b04a', '#7a3b2e', '#e6e6e6', '#4a5568'];
export const TRUCK_CABS = ['#f0f2ea', '#3b6fb6', '#c9583b', '#2b2f38', '#d8b04a'];
export const SIZE = { car: [4.5, 1.9, 1.5], van: [5.6, 2.0, 2.3], truck: [12, 2.5, 3.6] }; // length, width, height in metres
export const VAN_COLORS = ['#f0f2ea', '#e6e6e6', '#d9dcdf', '#3b6fb6', '#c9583b', '#f3c868'];
// which vehicle: lorries only on motorways and the big roads outside the centre (VMO, D1, D2),
// in town only cars and delivery vans
export function pickKind(r, roadClass, distFromCentreM) {
  const truckOk = roadClass >= 3 && distFromCentreM > 2500;
  if (truckOk && r < 0.22) return 'truck';
  if (r < (truckOk ? 0.34 : 0.15)) return 'van';
  return 'car';
}
// A touch larger than life so they read on the pixel map, but only far out: from 2 px per metre the cars shrink to
// their real size at 4 px per metre, where lanes 3 m wide are drawn under them (a car a quarter larger filled its lane
// from line to line).
const VIS = 1.25;
const visAt = k => (k <= 2 ? 1.25 : k >= 4 ? 1 : 1.25 - ((k - 2) / 2) * 0.25);

// Cars drawn in batches: add() only collects the quads of each car, flush() fills them layer by layer
// (shadows, sides, roofs, glass, lorry cabs), one path and one fill per colour. A street full of cars
// is then a few dozen fills instead of three or four for every car.
// add: (x, y) screen position of the car's centre on the road, (ux, uy) unit direction on screen
export function carBatch() {
  const layers = [new Map(), new Map(), new Map(), new Map()]; // colour → flat list of quads (8 numbers each)
  const cabs = []; // [x, y, w, h, colour]
  const quad = (layer, col, cx, cy, ax, ay, bx, by) => {
    let q = layers[layer].get(col);
    if (!q) layers[layer].set(col, (q = []));
    q.push(cx + ax + bx, cy + ay + by, cx + ax - bx, cy + ay - by, cx - ax - bx, cy - ay - by, cx - ax + bx, cy - ay + by);
  };
  return {
    add(x, y, ux, uy, kind, color, k, cab) {
      const [L, Wd, H] = SIZE[kind];
      const s = k * visAt(k);
      const hl = Math.max(2, (L * s) / 2), hw = Math.max(1, (Wd * s) / 2), h = Math.max(1, H * s * 0.6);
      // (ux, uy) is the direction on screen; on the ground (screen y is squashed to half) it is (ux, 2uy).
      // Length along the ground direction and width across it, both squashed back onto the screen,
      // so the vehicle always points along the road instead of looking skewed (drifting sideways).
      const gn = Math.hypot(ux, 2 * uy) || 1;
      const px = (-2 * uy) / gn, py = ux / (2 * gn);
      ux /= gn; uy /= gn;
      const q = (layer, col, ox, oy, a, b) => quad(layer, col, x + ox, y + oy, ux * a, uy * a, px * b, py * b);
      q(0, 'rgba(0,0,0,.28)', 1, 1, hl, hw * 1.1); // shadow
      if (kind === 'truck') {
        // box + cab
        q(1, '#5b5f66', 0, 0, hl, hw);
        q(2, '#d9dcdf', 0, -h, hl, hw);
        const cx = x + ux * hl * 0.78, cy = y + uy * hl * 0.78 - h * 0.6;
        cabs.push(Math.round(cx - hw * 0.9), Math.round(cy - h * 0.4), Math.max(2, Math.round(hw * 1.8)), Math.max(2, Math.round(h * 0.9)), cab || '#3b6fb6');
      } else if (kind === 'van') {
        // delivery van: a tall box, windscreen at the front
        q(1, shade(color, 0.72), 0, 0, hl, hw);
        q(2, color, 0, -h, hl, hw * 0.95);
        if (hl > 3) q(3, 'rgba(40,52,74,.8)', ux * hl * 0.7, uy * hl * 0.7 - h - 0.5, hl * 0.18, hw * 0.75);
      } else {
        q(1, shade(color, 0.7), 0, 0, hl, hw);
        q(2, color, 0, -h, hl * 0.95, hw * 0.92);
        if (hl > 3) q(3, 'rgba(40,52,74,.75)', 0, -h - 0.5, hl * 0.4, hw * 0.75); // windows / roof glass
      }
    },
    flush(ctx) {
      for (const layer of layers) for (const [col, q] of layer) {
        if (!q.length) continue;
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let i = 0; i < q.length; i += 8) { ctx.moveTo(q[i], q[i + 1]); ctx.lineTo(q[i + 2], q[i + 3]); ctx.lineTo(q[i + 4], q[i + 5]); ctx.lineTo(q[i + 6], q[i + 7]); ctx.closePath(); }
        ctx.fill();
        q.length = 0;
      }
      for (let i = 0; i < cabs.length; i += 5) { ctx.fillStyle = cabs[i + 4]; ctx.fillRect(cabs[i], cabs[i + 1], cabs[i + 2], cabs[i + 3]); }
      cabs.length = 0;
    },
  };
}

const shades = new Map();
function shade(hex, f) {
  const key = hex + f;
  let c = shades.get(key);
  if (c) return c;
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * f, g = ((n >> 8) & 255) * f, b = (n & 255) * f;
  shades.set(key, (c = `rgb(${r | 0},${g | 0},${b | 0})`));
  return c;
}

// Length of one car by its DPMB fleet number, and the type of a tram (bmhd.cz, přehled vozů in service, 2026-11-15;
// lengths from dpmb.cz/nas-vozovy-park). Trams: 15xx–16xx Tatra T3 (15.1 m, often two coupled; 32 of them rebuilt as
// VarioLFR.E, 16.2 m, keeping their numbers), 12xx T6A5 (15.6 m), 10xx–11xx VarioLF2R.E (23.7 m; the last K2 1018 and
// 1080, 21.5 m), 1701–1738 KT8D5 (31.2 m), 1751–1754 K3R-N (29.4 m), 1760–1799 Škoda 45T (31 m), 1801–1821 03T Anitra
// (20.1 m), 1822– EVO2 (23.4 m), 19xx Škoda 13T (31.1 m). Trolleybuses 36xx articulated (27Tr 18 m, 31Tr 18.75 m), the
// others solo (12 m). Buses 2xxx articulated (18 m) but 29xx Crossway (12 m), 7826–7828 Crossway 14.5 m, 75xx midi
// (Isuzu Novo, ~7.6 m), the others 12 m.
const VARIO_LFR = new Set([1497, 1523, 1530, 1539, 1541, 1551, 1553, 1554, 1555, 1556, 1557, 1567, 1573, 1574, 1575, 1580, 1582, 1584, 1586, 1590, 1592, 1596, 1597, 1598, 1599, 1601, 1605, 1616, 1617, 1626, 1627, 1630]);
const TRAM_LEN = { t3: 15.1, vario: 16.2, t6: 15.64, k2: 21.5, vario2: 23.7, anitra: 20.09, evo2: 23.4, kt8: 31.24, k3rn: 29.35, t45: 31, t13: 31.06 };
export function tramType(id) {
  const s = Math.floor(id / 100);
  if (s === 14 || s === 15 || s === 16) return VARIO_LFR.has(id) ? 'vario' : 't3';
  if (s === 12) return 't6';
  if (s === 10 || s === 11) return id === 1018 || id === 1080 ? 'k2' : 'vario2';
  if (s === 17) return id >= 1760 ? 't45' : id >= 1751 ? 'k3rn' : 'kt8';
  if (s === 18) return id >= 1822 ? 'evo2' : 'anitra';
  return 't13';
}
export function unitLength(type, id) {
  return type === 'tram' ? TRAM_LEN[tramType(id)] : ROADV[roadType(type, id)].len;
}
// a whole set as live data report it: the car itself plus coupled cars (IDB, IDC)
// (kept per set: it was worked out anew, half a dozen arrays, for every vehicle at every frame)
const setKept = new Map();
export function setLength(type, ids) {
  const key = `${type}|${ids[0]}|${ids[1] || 0}|${ids[2] || 0}`, was = setKept.get(key);
  if (was) return was;
  const cars = ids.filter(x => x > 0), units = cars.map(id => unitLength(type, id));
  const types = cars.map(id => (type === 'tram' ? tramType(id) : roadType(type, id)));
  const total = units.reduce((a, b) => a + b, 0);
  // where the cars meet (fractions of the length from the front) and articulations inside long single cars
  // (trams: the joints of their type, TRAMV)
  const joints = [];
  let acc = 0;
  for (let i = 0; i < units.length; i++) {
    const L = units[i], v = type === 'tram' ? TRAMV[types[i]] : ROADV[types[i]];
    const tj = v ? (type === 'tram' ? v.joints : v.joint != null ? [v.joint] : null) : null;
    if (tj) for (const f of tj) joints.push([(acc + L * f) / total, 0]); // its articulations
    acc += L;
    if (i < units.length - 1) joints.push([acc / total, 1]); // coupling between two cars
  }
  joints.types = types; // (the type of each car: drawTransit picks its drawing)
  const set = { len: total, joints };
  if (setKept.size > 4000) setKept.clear();
  setKept.set(key, set);
  return set;
}

// a public transport vehicle following its route: pts = sampled centre points along the
// vehicle from front to back (screen px); type = tram | trol | bus
const LIVERY = {
  // all three in the DPMB livery as they really run (white, a red skirt, black windows); the colour of the kind (red trams,
  // green trolleybuses, blue buses) is only on the line badges and the routes. (tram band: the grey roof gear stripe)
  tram: { body: '#d8232a', side: '#e3e5e1', band: '#b9b6ae', roof: '#d6d9dc' },
  trol: { body: '#d8232a', side: '#e3e5e1', band: '#d8232a', roof: '#f6f6f2' },
  bus: { body: '#d8232a', side: '#e3e5e1', band: '#d8232a', roof: '#f6f6f2' },
};
// Brno trams after the DPMB drawings (bmhd.cz: 03T Anitra, VarioLF2R.E, EVO2, K3R-N, KT8D5R.N2, 13T, T3R.PV) and the
// pictures of dpmb.cz (VarioLFR.E, 45T, T6A5), 2026-11-15. All in the DPMB livery: from the bottom a white edge, a red
// band, a thin white line, the dark band of windows, on top the silver-grey roof with grey boxes (EVO2 and 45T: white
// with a red skirt and a red top); dark ribbed bellows between the sections, a yellow pantograph near the front (single
// arm; the KT8D5 a diamond). Fractions of the length from the front; doors [from, to]; joints: the bellows; boxes
// [from, to, height m]; bands [height from the bottom as a fraction of the body's height, colour]; top: door tops.
const TW = '#e3e5e1', TR = '#d8232a', TB = '#1e242d', TG = '#d6d9dc';
const TRAMV = {
  t3: { doors: [[0.06, 0.15], [0.51, 0.6], [0.85, 0.94]], panto: 0.27, boxes: [[0.47, 0.5, 0.2]],
    bands: [[0, TW], [0.15, TR], [0.45, TW], [0.5, TB], [0.88, TG]], top: 0.86 },
  t6: { doors: [[0.073, 0.168], [0.45, 0.546], [0.84, 0.935]], panto: 0.3, boxes: [[0.55, 0.75, 0.2]],
    bands: [[0, TW], [0.12, TR], [0.45, TW], [0.5, TB], [0.9, TG]], top: 0.86 },
  vario: { doors: [[0.071, 0.158], [0.458, 0.546], [0.844, 0.933]], panto: 0.22, boxes: [[0.4, 0.46, 0.2], [0.5, 0.52, 0.2], [0.54, 0.61, 0.2]],
    bands: [[0, TW], [0.15, TR], [0.42, TW], [0.47, TB], [0.88, TG]], top: 0.86 },
  vario2: { doors: [[0.041, 0.1], [0.31, 0.367], [0.634, 0.693], [0.9, 0.959]], joints: [0.5], panto: 0.145,
    boxes: [[0.04, 0.065, 0.3], [0.26, 0.31, 0.15], [0.33, 0.36, 0.2], [0.37, 0.42, 0.2], [0.575, 0.634, 0.2], [0.64, 0.675, 0.2], [0.68, 0.73, 0.2]],
    bands: [[0, TW], [0.15, TR], [0.33, TW], [0.38, TB], [0.8, TG]], top: 0.78 },
  k2: { doors: [[0.06, 0.13], [0.3, 0.37], [0.63, 0.7], [0.87, 0.94]], joints: [0.5], panto: 0.2, boxes: [],
    bands: [[0, TW], [0.15, TR], [0.45, TW], [0.5, TB], [0.88, TG]], top: 0.86 },
  anitra: { doors: [[0.087, 0.127], [0.346, 0.425], [0.574, 0.653], [0.873, 0.913]], joints: [0.31, 0.69], panto: 0.18,
    boxes: [[0.226, 0.268, 0.25], [0.35, 0.4, 0.2], [0.504, 0.558, 0.15], [0.58, 0.64, 0.2], [0.733, 0.782, 0.3], [0.8, 0.847, 0.3]],
    bands: [[0, TW], [0.1, TR], [0.36, TW], [0.42, TB], [0.85, TR]], top: 0.82 },
  evo2: { doors: [[0.076, 0.12], [0.275, 0.349], [0.644, 0.718], [0.873, 0.947]], joints: [0.534], panto: 0.17,
    boxes: [[0.12, 0.14, 0.15], [0.21, 0.25, 0.15], [0.29, 0.33, 0.15], [0.36, 0.4, 0.15], [0.55, 0.6, 0.15], [0.63, 0.67, 0.15], [0.7, 0.75, 0.15], [0.78, 0.84, 0.15]],
    bands: [[0, TR], [0.08, TW], [0.33, TB], [0.81, TW], [0.9, TR]], top: 0.8 },
  kt8: { doors: [[0.044, 0.078], [0.234, 0.279], [0.478, 0.523], [0.721, 0.766], [0.921, 0.956]], joints: [0.378, 0.625], panto: 0.13, diamond: true,
    boxes: [[0.21, 0.29, 0.15], [0.48, 0.5, 0.2], [0.68, 0.77, 0.15]],
    bands: [[0, TW], [0.15, TR], [0.4, TW], [0.48, TB]], top: 0.86 },
  k3rn: { doors: [[0.033, 0.079], [0.23, 0.281], [0.474, 0.52], [0.722, 0.768], [0.92, 0.967]], joints: [0.367, 0.63], panto: 0.12,
    boxes: [[0.017, 0.063, 0.25], [0.215, 0.235, 0.25]],
    bands: [[0, TW], [0.12, TR], [0.42, TW], [0.47, TB], [0.87, TG]], top: 0.84 },
  t45: { doors: [[0.061, 0.09], [0.23, 0.259], [0.501, 0.526], [0.759, 0.788], [0.91, 0.937]], joints: [0.333, 0.667], panto: 0.1,
    boxes: [[0.15, 0.25, 0.2], [0.42, 0.58, 0.2], [0.75, 0.85, 0.2]],
    bands: [[0, TR], [0.06, TW], [0.35, TB], [0.82, TW], [0.88, TR]], top: 0.8 },
  // Škoda 13T: five sections, the short ones in the middle and at the ends hang between the others
  t13: { doors: [[0.062, 0.09], [0.24, 0.294], [0.352, 0.405], [0.596, 0.648], [0.705, 0.758], [0.911, 0.939]], joints: [0.217, 0.43, 0.57, 0.783], panto: 0.12,
    boxes: [[0.07, 0.105, 0.25], [0.15, 0.19, 0.25], [0.246, 0.274, 0.2], [0.66, 0.7, 0.15], [0.71, 0.75, 0.15], [0.83, 0.87, 0.3], [0.875, 0.905, 0.3]],
    bands: [[0, TW], [0.12, TR], [0.35, TW], [0.44, TB], [0.88, TG]], top: 0.84, bellowsM: 0.9 },
};
const tramKept = new Map();
function tramLV(t) {
  let v = tramKept.get(t);
  if (!v) tramKept.set(t, (v = { bellowsM: 1.1, ...TRAMV[t], len: TRAM_LEN[t], wheels: [], frame: '#9aa0a8', box: '#bcc0c5', boxSide: '#868b92', bellows: '#4a4f57', rib: '#2c3036' }));
  return v;
}
// Brno buses and trolleybuses by type, after the drawings of bmhd.cz (Urbanway 12 / 18, Urbino 18 IV, Crossway LE Line
// 12, Škoda 26Tr, 27Tr) and the pictures of dpmb.cz (31Tr, 32Tr, SOR TNS 12, SOR NBG 12, SOR NS 12, Citelis 12 CNG,
// Crossway LE 14.5), 2026-11-15: the DPMB livery (a red skirt, white, the black band of windows; the Crossways a second
// red stripe under the windows, the 31Tr a white top), doors of glass from the floor to the top of the windows, wheels
// in the skirt, boxes on the white roof (air conditioning, the CNG tanks, the traction gear of trolleybuses), bellows in
// the articulated ones. Fractions of the length from the front; boxes [from, to, height in metres]; joint: the bellows;
// pole: where the trolley poles stand on the roof; bands as for the trams (from the bottom, fractions of the height).
const BR = '#d8232a', BW = '#e3e5e1', BB = '#1e242d';
const ROADV = {
  uw12: { len: 12, doors: [[0.03, 0.165], [0.467, 0.608], [0.788, 0.925]], wheels: [0.23, 0.724], boxes: [[0.27, 0.49, 0.3]], bands: [[0, BR], [0.17, BW], [0.37, BB]] },
  uw18: { len: 18, joint: 0.561, doors: [[0.01, 0.099], [0.267, 0.352], [0.642, 0.73], [0.866, 0.954]], wheels: [0.139, 0.455, 0.825], boxes: [[0.16, 0.31, 0.3], [0.74, 0.88, 0.3]], bands: [[0, BR], [0.17, BW], [0.37, BB]] },
  urb18: { len: 18, joint: 0.577, doors: [[0.02, 0.096], [0.347, 0.422], [0.686, 0.762], [0.867, 0.943]], wheels: [0.149, 0.477, 0.815], boxes: [[0.15, 0.3, 0.3], [0.66, 0.76, 0.3]], arches: true, bands: [[0, BR], [0.17, BW], [0.35, BB]] },
  cw12: { len: 12.05, doors: [[0.027, 0.143], [0.485, 0.598]], wheels: [0.219, 0.738], boxes: [[0.16, 0.27, 0.1], [0.287, 0.477, 0.15], [0.684, 0.797, 0.1]], bands: [[0, BR], [0.15, BW], [0.36, BR], [0.45, BB]] },
  cw15: { len: 14.5, doors: [[0.026, 0.123], [0.458, 0.55], [0.83, 0.892]], wheels: [0.183, 0.663, 0.766], boxes: [[0.3, 0.45, 0.15]], bands: [[0, BR], [0.12, BW], [0.32, BR], [0.46, BB]] },
  nbg: { len: 12.18, doors: [[0.033, 0.124], [0.28, 0.4], [0.495, 0.615], [0.78, 0.9]], wheels: [0.201, 0.709], boxes: [[0.25, 0.65, 0.55], [0.055, 0.1, 0.15], [0.76, 0.84, 0.15]], bands: [[0, BR], [0.23, BW], [0.32, BB]] },
  ns12: { len: 12, doors: [[0.037, 0.146], [0.4, 0.51], [0.78, 0.898]], wheels: [0.225, 0.716], boxes: [[0.446, 0.643, 0.2]], bands: [[0, BR], [0.23, BW], [0.34, BB]] },
  cit12: { len: 12, doors: [[0.033, 0.157], [0.416, 0.54], [0.8, 0.925]], wheels: [0.22, 0.734], boxes: [[0.467, 0.923, 0.35], [0.047, 0.1, 0.2]], bands: [[0, BR], [0.23, BW], [0.46, BB]] },
  midi: { len: 7.6, doors: [[0.04, 0.17], [0.45, 0.58]], wheels: [0.22, 0.75], boxes: [[0.3, 0.5, 0.25]], bands: [[0, BR], [0.22, BW], [0.4, BB]] },
  tr26: { len: 12, doors: [[0.028, 0.138], [0.468, 0.578], [0.807, 0.917]], wheels: [0.217, 0.716], boxes: [[0.04, 0.42, 0.45], [0.48, 0.69, 0.28]], pole: 0.44, bands: [[0, BR], [0.2, BW], [0.39, BB]] },
  tr32: { len: 12, doors: [[0.04, 0.148], [0.405, 0.512], [0.787, 0.899]], wheels: [0.225, 0.717], boxes: [[0.152, 0.404, 0.45], [0.405, 0.54, 0.4], [0.83, 0.9, 0.2]], pole: 0.54, bands: [[0, BR], [0.24, BW], [0.35, BB]] },
  tr27: { len: 18, joint: 0.58, doors: [[0.023, 0.096], [0.347, 0.423], [0.685, 0.761], [0.866, 0.942]], wheels: [0.149, 0.475, 0.816], boxes: [[0.06, 0.2, 0.25], [0.22, 0.52, 0.45], [0.66, 0.76, 0.28]], pole: 0.645, arches: true, bands: [[0, BR], [0.2, BW], [0.37, BB]] },
  tr31: { len: 18.75, joint: 0.59, doors: [[0.023, 0.08], [0.184, 0.259], [0.323, 0.398], [0.673, 0.75], [0.857, 0.934]], wheels: [0.132, 0.46, 0.812], boxes: [[0.368, 0.545, 0.45], [0.637, 0.735, 0.4], [0.78, 0.83, 0.2]], pole: 0.73, bands: [[0, BR], [0.2, BW], [0.29, BB], [0.86, BW]] },
};
ROADV.tns = ROADV.tr32; // (SOR TNS 12: the same body as the 32Tr)
// the type of a bus or trolleybus by its DPMB fleet number (bmhd.cz, přehled vozů, 2026-11-15)
export function roadType(type, id) {
  if (type === 'trol') return id >= 3648 ? 'tr27' : id >= 3618 ? 'tr31' : id >= 3600 ? 'tr27' : id >= 3311 && id <= 3399 ? 'tr32' : id >= 3301 && id <= 3310 ? 'tr26' : id >= 3065 && id <= 3099 ? 'tns' : 'tr32';
  if (id >= 2000 && id < 2600) return 'uw18';
  if (id >= 2600 && id < 2900) return 'urb18';
  if (id >= 2900 && id < 3000) return 'cw12';
  if (id === 7008 || id === 7009 || id === 7010 || id === 7012) return 'cit12';
  if ((id >= 7001 && id <= 7044) || (id >= 7101 && id <= 7199)) return 'nbg';
  if ((id >= 7045 && id <= 7100) || (id >= 7673 && id <= 7686)) return 'uw12';
  if (id >= 7687 && id <= 7799) return 'ns12';
  if (id >= 7826 && id <= 7828) return 'cw15';
  if (id >= 7800 && id < 7900) return 'cw12';
  if (id >= 7500 && id < 7600) return 'midi';
  return 'uw12';
}
const RV_SKIRT = 0.24, RV_WIN = 0.4, RV_TOP = 0.84;
const RV_BANDS = [[0, '#d8232a'], [RV_SKIRT, '#e3e5e1'], [RV_WIN, '#1e242d']];
const RV_COL = { win: '#1e242d', pane: '#344152', door: '#4a5666', tyre: '#17191e', hub: '#9aa1aa', box: '#e2e5e8', boxSide: '#adb3ba', bellows: '#7b8189', rib: '#565b63', pole: '#4a4f57', catcher: '#e2bd3a' };
// Shapes of the ends (metres): Brno trams (Škoda 13T, EVO2, VarioLF, Tatra T3) have a rounded nose that narrows
// toward the front with a big windscreen wrapping round the corners, and a rounded back; trolleybuses and buses
// (Škoda 26Tr / 27Tr / 31Tr, Solaris, SOR) are boxier, with rounded corners and a dark windscreen.
const ENDS = {
  tram: { front: 2.1, ft: 0.42, back: 1.3, bt: 0.68, glass: 0.95 },
  trol: { front: 0.9, ft: 0.82, back: 0.7, bt: 0.86, glass: 0.6 },
  bus: { front: 0.9, ft: 0.82, back: 0.7, bt: 0.86, glass: 0.6 },
};
// one end of the body: from the cut end (x, y) forward along (ux, uy) by len, narrowing to taper × w, rounded
function endShape(ctx, x, y, ux, uy, w, len, taper, dy, color) {
  const px = -uy, py = ux, hw = w / 2, tw = (w * taper) / 2;
  const tx = x + ux * len, ty = y + uy * len + dy;
  y += dy;
  ctx.beginPath();
  ctx.moveTo(x + px * hw, y + py * hw);
  ctx.quadraticCurveTo(x + ux * len * 0.75 + px * hw, y + uy * len * 0.75 + py * hw, tx + px * tw, ty + py * tw);
  ctx.quadraticCurveTo(tx + ux * len * 0.12, ty + uy * len * 0.12, tx - px * tw, ty - py * tw);
  ctx.quadraticCurveTo(x + ux * len * 0.75 - px * hw, y + uy * len * 0.75 - py * hw, x - px * hw, y - py * hw);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
}
// The ghost of a vehicle partly or wholly behind a building: the vehicle's own shape (drawn as usual into a scratch
// canvas, without its shadow) loses its colours — its edge becomes a white outline, its inside is hatched in a light
// colour of the kind, the stripes at GHOST.ang degrees to the length of the vehicle (they turn with it on a bend).
// The pieces in view are then drawn over it as usual, so only the hidden part shows as a ghost. Same size as the vehicle.
const GHOST_COL = { tram: '#ffbdb7', trol: '#bff2c6', bus: '#bfe0ff' }; // (light: the roofs in front are mostly dark)
export const GHOST = { out: 1.5, ang: 45, gap: 5, lw: 1.5 };
let silhouette = false, ghostCv = null, ghostA = null, ghostB = null;
// The ghost is costly (the vehicle drawn a second time and a dozen passes over three scratch canvases), and it used to be
// made again at every frame for every vehicle behind a house. It is kept per vehicle (id: its key, or its car in a set)
// while its shape stays the same: the points relative to the first one, to half a device pixel, with the kind, the scale
// and the colour. That holds while the vehicle stands, while it goes straight and while the map only pans; the kept
// picture is then put down at the vehicle's place (to a whole device pixel). Close up (over GHOST_KEEP_PX) nothing is kept.
// A vehicle that turns or a map that zooms changes the shape at every frame, and in the rush hour 40–90 vehicles are
// behind houses at once: 2–9 ghosts were made anew at every frame while the map stood and every one of them during a
// zoom. With 70–77 a frame the map ran at 12–14 frames a second (measured 2026-11-16, afternoon peak: standing still
// at 3 m/px once more vehicles were behind houses than the 80 pictures kept then, which pushed each other out; and for
// 9 s after the tab came back, see GAP_MS in src/mhdlive.js). So a kept picture of another shape is still used (put down
// at the vehicle's place, scaled when the zoom changed) and made anew only now and then: never before it is
// GHOST_MIN_MS old, GHOST_PER_WIN pictures per 30 ms while they are younger than GHOST_MAX_MS, GHOST_OLD_PER_WIN once
// they are older; a vehicle with no picture yet gets one at once, GHOST_OLD_PER_WIN per 30 ms at most. A ghost thus
// lags the vehicle's turn by a tenth of a second, half a second in a crowd: it is the hatched part behind the house.
// GHOST_KEEP pictures are kept, GHOST_KEEP_ALL_PX device pixels of them in all (the oldest go first).
const ghostKept = new Map(), GHOST_KEEP = 300, GHOST_KEEP_PX = 600000, GHOST_KEEP_ALL_PX = 8e6;
const GHOST_MIN_MS = 100, GHOST_MAX_MS = 500, GHOST_PER_WIN = 2, GHOST_OLD_PER_WIN = 6;
let ghostWin = 0, ghostMade = 0, ghostPx = 0;
const ghostDrop = id => { const e = ghostKept.get(id); if (e) { ghostPx -= e.w * e.h; ghostKept.delete(id); } };
const scratch = (c, w, h) => { if (!c) c = document.createElement('canvas'); if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); } return c; };
function drawGhost(ctx, pts, type, k, joints, minScale, col, id = null) {
  const T = ctx.getTransform(), d = T.a || 1, n = pts.length / 2;
  const fx = pts[0] * d + T.e, fy = pts[1] * d + T.f; // the first point in device px: the kept picture hangs on it
  let sig = null, kept = null, kind = null;
  const now = performance.now();
  if (id != null && id !== true) {
    kind = `${type}|${d}|${minScale}|${col}|${joints ? joints.join(';') : ''}`; // (what a kept picture must share to stand in for a while)
    // (the zoom to 0.02 %: while the map pans, k carries the noise of the floating point, a new number at every
    // frame, and with the bare number in the key every ghost was made anew at every frame of a pan)
    sig = `${kind}|${Math.round(Math.log(k) * 5000)}`;
    for (let q = 2; q < pts.length; q++) sig += `,${Math.round((pts[q] - pts[q & 1]) * d * 2)}`;
    kept = ghostKept.get(id);
    if (now - ghostWin > 30) { ghostWin = now; ghostMade = 0; }
    let use = !!kept && kept.sig === sig;
    if (kept && !use && kept.kind === kind) {
      const age = now - kept.at;
      use = age < GHOST_MIN_MS || ghostMade >= (age < GHOST_MAX_MS ? GHOST_PER_WIN : GHOST_OLD_PER_WIN);
    }
    if (use) {
      let s = k / kept.k; // (1 unless the zoom changed since the picture was made)
      if (Math.abs(s - 1) < 3e-4) s = 1;
      ghostKept.delete(id); ghostKept.set(id, kept); // (the last used last: the oldest is dropped first)
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (s === 1) ctx.drawImage(kept.cv, 0, 0, kept.w, kept.h, Math.round(fx + kept.ox), Math.round(fy + kept.oy), kept.w, kept.h);
      else ctx.drawImage(kept.cv, 0, 0, kept.w, kept.h, Math.round(fx + kept.ox * s), Math.round(fy + kept.oy * s), kept.w * s, kept.h * s);
      ctx.restore();
      return;
    }
    if (kept) ghostMade++;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let q = 0; q < n; q++) { x0 = Math.min(x0, pts[2 * q]); x1 = Math.max(x1, pts[2 * q]); y0 = Math.min(y0, pts[2 * q + 1]); y1 = Math.max(y1, pts[2 * q + 1]); }
  const m = Math.max(12, 9 * k * VIS * minScale) + 4; // (room for the body's width and height, the pantograph, the poles)
  const X0 = Math.floor((x0 - m) * d + T.e), Y0 = Math.floor((y0 - m * 1.6) * d + T.f);
  const w = Math.ceil((x1 + m) * d + T.e) - X0, h = Math.ceil((y1 + m) * d + T.f) - Y0;
  if (w <= 0 || h <= 0 || w > 4096 || h > 4096) { if (kept) ghostDrop(id); return; }
  // (no picture of it yet, and a crowd of such in this frame: the rest get theirs in the next frames. Not close up,
  // where the pictures are too big to keep and every one is made at every frame.)
  if (sig && !kept && w * h <= GHOST_KEEP_PX) { if (ghostMade >= GHOST_OLD_PER_WIN) return; ghostMade++; }
  ghostA = scratch(ghostA, w, h); ghostB = scratch(ghostB, w, h); ghostCv = scratch(ghostCv, w, h);
  const A = ghostA.getContext('2d'), B = ghostB.getContext('2d'), C = ghostCv.getContext('2d');
  for (const g of [A, B, C]) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, w, h); }
  // A: the shape of the vehicle, drawn exactly as on the map
  A.setTransform(d, 0, 0, d, T.e - X0, T.f - Y0);
  silhouette = true;
  try { drawTransit(A, pts, type, k, '', false, null, joints, false, null, minScale, false); } finally { silhouette = false; }
  A.setTransform(1, 0, 0, 1, 0, 0);
  // B: the shape shrunk by the width of the outline (the shape kept only where it is under all its shifted copies)
  const o = Math.max(1, Math.round(GHOST.out * d));
  B.drawImage(ghostA, 0, 0, w, h, 0, 0, w, h);
  B.globalCompositeOperation = 'destination-in';
  for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o], [o * 0.7, o * 0.7], [-o * 0.7, o * 0.7], [o * 0.7, -o * 0.7], [-o * 0.7, -o * 0.7]]) B.drawImage(ghostA, 0, 0, w, h, Math.round(dx), Math.round(dy), w, h);
  B.globalCompositeOperation = 'source-over';
  // A becomes the outline: the shape less its inside, in white
  A.globalCompositeOperation = 'destination-out'; A.drawImage(ghostB, 0, 0, w, h, 0, 0, w, h);
  A.globalCompositeOperation = 'source-in'; A.fillStyle = '#ffffff'; A.fillRect(0, 0, w, h);
  A.globalCompositeOperation = 'source-over';
  // C: stripes along the whole length (and past both ends, over the noses), then kept only inside the shape
  C.setTransform(d, 0, 0, d, T.e - X0, T.f - Y0);
  const ang = (GHOST.ang * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang), L = m / Math.max(0.3, sa);
  C.strokeStyle = col; C.lineWidth = GHOST.lw; C.lineCap = 'butt';
  C.beginPath();
  let carry = 0;
  for (let q = 0; q + 1 < n; q++) {
    const p0x = pts[2 * q], p0y = pts[2 * q + 1], sx = pts[2 * q + 2] - p0x, sy = pts[2 * q + 3] - p0y, sl = Math.hypot(sx, sy);
    if (sl < 0.01) continue;
    const ux = sx / sl, uy = sy / sl, vx = ux * ca - uy * sa, vy = ux * sa + uy * ca;
    const from = q === 0 ? -m : carry, to = q + 2 === n ? sl + m : sl; // (past the front and the back)
    let t = from;
    for (; t < to; t += GHOST.gap) { const cx = p0x + ux * t, cy = p0y + uy * t; C.moveTo(cx - vx * L, cy - vy * L); C.lineTo(cx + vx * L, cy + vy * L); }
    carry = t - sl;
  }
  C.stroke();
  C.setTransform(1, 0, 0, 1, 0, 0);
  C.globalCompositeOperation = 'destination-in'; C.drawImage(ghostB, 0, 0, w, h, 0, 0, w, h);
  C.globalCompositeOperation = 'source-over'; C.drawImage(ghostA, 0, 0, w, h, 0, 0, w, h);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(ghostCv, 0, 0, w, h, X0, Y0, w, h);
  ctx.restore();
  if (sig && w * h <= GHOST_KEEP_PX) {
    const cv = kept ? kept.cv : document.createElement('canvas');
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } else cv.getContext('2d').clearRect(0, 0, w, h);
    cv.getContext('2d').drawImage(ghostCv, 0, 0, w, h, 0, 0, w, h);
    ghostDrop(id); ghostKept.set(id, { sig, kind, k, at: now, cv, w, h, ox: X0 - fx, oy: Y0 - fy }); ghostPx += w * h;
    while (ghostKept.size > GHOST_KEEP || (ghostPx > GHOST_KEEP_ALL_PX && ghostKept.size > 1)) ghostDrop(ghostKept.keys().next().value);
  } else if (kept) ghostDrop(id);
}
// A set of coupled cars (live data: the car and the cars coupled to it, setLength): each car is drawn as a vehicle of its
// own, with its own ends, a gap for the coupler between them, the line badge only over the first one.
function drawSet(ctx, pts, type, k, line, labels, delay, joints, hidden, vis, minScale, ghost) {
  const n = pts.length / 2;
  let L = 0; for (let i = 1; i < n; i++) L += Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
  const cut = joints.filter(j => j[1]).map(j => j[0]);
  const bounds = [0, ...cut, 1], gap = Math.min(0.03, Math.max(2, 0.8 * k * VIS) / Math.max(1, L)) / 2; // (half the gap, as a fraction)
  const at = t => { const i = Math.min(n - 2, Math.floor(t)), u = t - i; return [pts[2 * i] + (pts[2 * i + 2] - pts[2 * i]) * u, pts[2 * i + 1] + (pts[2 * i + 3] - pts[2 * i + 1]) * u]; };
  for (let c = 0; c < bounds.length - 1; c++) {
    const fa = bounds[c] + (c ? gap : 0), fb = bounds[c + 1] - (c < bounds.length - 2 ? gap : 0);
    if (fb <= fa) continue;
    const ta = fa * (n - 1), tb = fb * (n - 1), ts = [ta];
    for (let i = Math.floor(ta) + 1; i < tb; i++) ts.push(i);
    ts.push(tb);
    const sub = [], sv = vis ? [] : null;
    for (const t of ts) sub.push(...at(t));
    if (sv) for (let j = 0; j + 1 < ts.length; j++) sv.push(vis[Math.min(vis.length - 1, Math.floor((ts[j] + ts[j + 1]) / 2))]);
    const own = joints.filter(j => !j[1] && j[0] > fa && j[0] < fb).map(j => [(j[0] - fa) / (fb - fa), 0]); // (its articulations)
    if (joints.types) own.type = joints.types[c];
    drawTransit(ctx, sub, type, k, line, labels && c === 0, c === 0 ? delay : null, own, hidden, sv, minScale, ghost && ghost !== true ? `${ghost}/${c}` : ghost);
  }
}
// The route points of one car (front to back) as straight sections between its joints (cuts: fractions of the length
// from the front): the section ends lie on the route, the sections are chords, each split into as many pieces as it
// had (so the pieces stay about as long and the tests behind buildings, vis, still fit: each new piece takes the test
// of the old piece under its middle).
function rigid(pts, vis, cuts) {
  const n = pts.length / 2, cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]));
  const L = cum[n - 1];
  if (!(L > 1)) return null;
  const seg = s => { let j = 0; while (j < n - 2 && cum[j + 1] < s) j++; return j; };
  const pAt = s => { const j = seg(s), sl = cum[j + 1] - cum[j] || 1, u = Math.max(0, Math.min(1, (s - cum[j]) / sl)); return [pts[2 * j] + (pts[2 * j + 2] - pts[2 * j]) * u, pts[2 * j + 1] + (pts[2 * j + 3] - pts[2 * j + 1]) * u]; };
  const fs = [0, ...cuts.filter(f => f > 0.02 && f < 0.98).sort((a, b) => a - b), 1];
  const out = [], ov = vis ? [] : null;
  for (let b = 0; b + 1 < fs.length; b++) {
    const A = b ? [out[out.length - 2], out[out.length - 1]] : pAt(0), B = pAt(fs[b + 1] * L), m = Math.max(1, Math.round((n - 1) * (fs[b + 1] - fs[b])));
    if (!b) out.push(A[0], A[1]);
    for (let i = 1; i <= m; i++) {
      out.push(A[0] + ((B[0] - A[0]) * i) / m, A[1] + ((B[1] - A[1]) * i) / m);
      if (ov) ov.push(vis[Math.min(vis.length - 1, seg((fs[b] + ((fs[b + 1] - fs[b]) * (i - 0.5)) / m) * L))]);
    }
  }
  return { pts: out, vis: ov };
}
export const FAR_K = 0.35;
const farP = new Float64Array(64);
// the bands of a livery that can be seen at the height H: [from (px above the bottom), colour, …] from the bottom up
function farStrips(LV, H) {
  const c = LV.farKept;
  if (c && c.H === H) return c.s;
  const bands = LV.bands || RV_BANDS, hb = f => (f ? Math.min(H - 1, Math.max(1, H * f)) : 0);
  const wi = bands.findIndex(b => b[1] === TB), bw = Math.max(2, hb(bands[wi][0]));
  const from = bands.map(b => (b[0] === bands[wi][0] ? bw : hb(b[0]))), s = [];
  for (let i = 0; i < bands.length; i++) if ((i + 1 < bands.length ? from[i + 1] : H) - from[i] >= 0.1) s.push(from[i], bands[i][1]);
  LV.farKept = { H, s };
  return s;
}
// the body line through the n points of farP, lifted by dy, broken where a piece is hidden behind a building
function farPath(ctx, n, vis, dy) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    if (!i || (vis && vis[Math.min(vis.length - 1, i - 1)] === false)) ctx.moveTo(farP[2 * i], farP[2 * i + 1] + dy);
    else ctx.lineTo(farP[2 * i], farP[2 * i + 1] + dy);
  }
}
// (false: not a vehicle it knows how to draw, the full drawing takes it)
function drawFar(ctx, pts, type, k, delay, joints, vis, minScale, ghost) {
  const n = pts.length / 2;
  const jt = joints && (joints.type ?? (joints.types && joints.types.length === 1 ? joints.types[0] : null));
  const LV = type === 'tram' ? tramLV(jt || 't13') : ROADV[jt || (type === 'trol' ? 'tr27' : 'uw12')];
  if (!LV || !LV.len || n < 2 || n > 32) return false;
  const kv = k * VIS, W = 4 * minScale, H = 3 * minScale, E = ENDS[type] || ENDS.bus; // (the least size of the full drawing, which every vehicle has this far out)
  for (let i = 0; i < 2 * n; i++) farP[i] = pts[i];
  // the ends as in the full drawing: an end under half a pixel long is cut off (no shape was drawn for it); a longer
  // one, a tram's nose, had a rounded shape and is square here, the body running to its tip
  let fx = pts[0] - pts[2], fy = pts[1] - pts[3]; const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
  let bx = pts[2 * n - 2] - pts[2 * n - 4], by = pts[2 * n - 1] - pts[2 * n - 3]; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
  const lenF = Math.min(E.front * kv, fl * 0.9), lenB = Math.min(E.back * kv, bl * 0.9), noseF = lenF > 0.5, noseB = lenB > 0.5;
  if (!noseF) { farP[0] -= fx * lenF; farP[1] -= fy * lenF; }
  if (!noseB) { farP[2 * n - 2] -= bx * lenB; farP[2 * n - 1] -= by * lenB; }
  let none = false, some = false;
  if (vis) { none = true; for (let i = 0; i < vis.length; i++) { if (vis[i] === false) some = true; else none = false; } }
  if (ghost && some) drawGhost(ctx, pts, type, k, joints, minScale, GHOST_COL[type] || GHOST_COL.bus, ghost);
  if (!none) {
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    if (!silhouette) { ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = W + 1; farPath(ctx, n, vis, 1.5); ctx.stroke(); }
    // (the outline runs 0.75 px past the tip of a nose, as its rounded shape did: the vehicle stays closed in a dark line)
    const oF = noseF ? 0.75 : 0, oB = noseB ? 0.75 : 0;
    farP[0] += fx * oF; farP[1] += fy * oF; farP[2 * n - 2] += bx * oB; farP[2 * n - 1] += by * oB;
    ctx.strokeStyle = '#161d2b'; ctx.lineWidth = W + H + 1.5; farPath(ctx, n, vis, -H / 2); ctx.stroke();
    farP[0] -= fx * oF; farP[1] -= fy * oF; farP[2 * n - 2] -= bx * oB; farP[2 * n - 1] -= by * oB;
    const S = farStrips(LV, H);
    for (let i = 0; i < S.length; i += 2) { ctx.strokeStyle = S[i + 1]; ctx.lineWidth = W + H - S[i]; farPath(ctx, n, vis, -(H + S[i]) / 2); ctx.stroke(); }
    ctx.strokeStyle = LIVERY[type].roof; ctx.lineWidth = W; farPath(ctx, n, vis, -H); ctx.stroke();
  }
  // how late it is: a coloured dot above the vehicle (no badge this far out)
  if (delay !== null && delay !== undefined) {
    const d = minScale > 1 ? 2 : 1, x = Math.round(pts[0] - fx * lenF), y = Math.round(pts[1] - fy * lenF - H - W - 3 - (d - 1) * 4);
    ctx.fillStyle = '#161d2b'; ctx.fillRect(x - 4 * d, y - 4 * d, 8 * d, 8 * d);
    ctx.fillStyle = delayColor(delay); ctx.fillRect(x - 3 * d, y - 3 * d, 6 * d, 6 * d);
  }
  return true;
}
export function drawTransit(ctx, pts, type, k, line, labels, delay = null, joints = null, hidden = false, vis = null, minScale = 1, ghost = false) {
  if (joints && joints.some(j => j[1]) && pts.length >= 8) { drawSet(ctx, pts, type, k, line, labels, delay, joints, hidden, vis, minScale, ghost); return; }
  if (k < FAR_K && !labels && !hidden && drawFar(ctx, pts, type, k, delay, joints, vis, minScale, ghost)) return; // (seen from far: the lean drawing)
  // the type of this tram car (live data: from its fleet number, tramType; from the timetable a 13T)
  const tt = type === 'tram' ? (joints && (joints.type ?? (joints.types && joints.types.length === 1 ? joints.types[0] : null))) || 't13' : null;
  const TL = tt ? TRAM_LEN[tt] : 0;
  const c = LIVERY[type];
  // articulations: by default a three-section tram; a trolleybus from the timetable (no fleet number) is an articulated one (18 m)
  const js = joints || (type === 'tram' ? [[1 / 3, 0], [2 / 3, 0]] : type === 'trol' ? [[0.58, 0]] : []);
  // buses and trolleybuses: drawn after the drawings of the Brno vehicles (ROADV), 12 m solo or 18 m articulated
  // (by the type of the car from its fleet number; from the timetable an Urbanway 12 bus or a 27Tr trolleybus)
  const rt = type === 'bus' || type === 'trol' ? (joints && (joints.type ?? (joints.types && joints.types.length === 1 ? joints.types[0] : null))) || (type === 'trol' ? 'tr27' : 'uw12') : null;
  const RV = rt && pts.length >= 4 ? ROADV[rt] : null;
  const LV = RV || (tt && pts.length >= 4 ? tramLV(tt) : null); // (the livery bands: buses, trolleybuses and trams)
  // Rigid sections: the body bends only in its articulations. The points along the route are replaced by straight
  // chords between the ends and the joints (each on the route), so a solo bus is one straight box and an articulated
  // one or a tram breaks only at its bellows (the joints of its drawing: ROADV, TRAMV), whatever the curve.
  if (pts.length >= 6) {
    const cuts = RV ? (RV.joint != null ? [RV.joint] : []) : (LV && LV.joints) || js.filter(j => !j[1]).map(j => j[0]);
    const r = rigid(pts, vis, cuts);
    if (r) { pts = r.pts; vis = r.vis; }
  }
  // zoomed out the real size would be a speck: at least 4 x 3 px, so a tram still reads as a small block
  // (minScale: on phones the least size is half again as big, so a finger can hit it)
  // The body is a stroked line: its width on the screen was the same whichever way the vehicle ran (2.6 m of width
  // plus the height of the side, a quarter larger than life: 5.6 m across, nearly two lanes). Now it follows the
  // heading and the zoom: the ground is half as long north-south, so a vehicle running east-west is half as wide on
  // the screen (wf) and shows its whole side, one running north-south is full width and shows only a strip of its
  // side (sf); and from 2 px per metre the vehicles shrink to their real size like the cars (visAt).
  const VIS = visAt(k);
  let wf = 1, sf = 1;
  if (pts.length >= 4) {
    const hx = pts[pts.length - 2] - pts[0], hy = pts[pts.length - 1] - pts[1], hl = Math.hypot(hx, hy);
    if (hl > 1) { wf = Math.hypot(hx / hl, (2 * hy) / hl) / 2; sf = Math.max(0.35, Math.abs(hx / hl)); }
  }
  const W = Math.max(4 * minScale, 2.6 * k * VIS * wf), H = Math.max(3 * minScale, 3.2 * k * VIS * 0.6 * sf);
  const segOn = j => !vis || vis[Math.max(0, Math.min(vis.length - 1, j))] !== false;
  const E = ENDS[type] || ENDS.bus;
  const nn0 = pts.length / 2, full = pts; // (full: the body to its very ends, for the ghost)
  const ends = [];
  if (nn0 >= 2) {
    pts = pts.slice();
    // front (pts[0]) and back (last point): move the end inward by the end's length (at most 90 % of that piece)
    for (const [i, j, L, taper, front] of [[0, 1, E.front, E.ft, true], [nn0 - 1, nn0 - 2, E.back, E.bt, false]]) {
      const ex = pts[2 * i], ey = pts[2 * i + 1], dx = ex - pts[2 * j], dy = ey - pts[2 * j + 1], seg = Math.hypot(dx, dy) || 1;
      const len = Math.min(L * k * VIS, seg * 0.9);
      const ux = dx / seg, uy = dy / seg;
      pts[2 * i] = ex - ux * len; pts[2 * i + 1] = ey - uy * len;
      ends.push({ x: pts[2 * i], y: pts[2 * i + 1], ux, uy, len, taper, front, on: segOn(front ? 0 : nn0 - 2) });
    }
  }
  // draw one layer of the body's ends (same offset and width as the body strokes)
  const caps = (w, dy, color, lenF = 1, taperF = 1) => { for (const e of ends) if (e.on && e.len > 0.5) endShape(ctx, e.x, e.y, e.ux, e.uy, w, e.len * lenF, Math.min(1, e.taper * taperF), dy, color); };
  // the body line, broken where a piece is hidden behind a building
  const path = (dy) => { ctx.beginPath(); for (let i = 0; i < pts.length; i += 2) { const x = pts[i], y = pts[i + 1] + dy, j = i / 2; if (!i || !segOn(j - 1)) ctx.moveTo(x, y); else ctx.lineTo(x, y); } };
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  const n = pts.length / 2;
  // places along the whole body by length (full: to the very ends): s0..s1 is the body between its two ends
  let cum = null, Lf = 0, s0 = 0, s1 = 0, sm = 1, hv = 1;
  if (n >= 2) {
    cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(full[2 * i] - full[2 * i - 2], full[2 * i + 1] - full[2 * i - 1]));
    Lf = cum[n - 1] || 1;
    s0 = ends.length ? ends[0].len : 0; s1 = Lf - (ends.length ? ends[1].len : 0);
    sm = Lf / (RV ? RV.len : TL || 12); // screen px per metre along the body
    hv = k * VIS * 0.6; // screen px per metre of height
  }
  // the point at a fraction F of the length from the front, with the way the body goes there
  const at = F => {
    const s = Math.max(0, Math.min(Lf, F * Lf));
    let j = 0; while (j < n - 2 && cum[j + 1] < s) j++;
    const sl = cum[j + 1] - cum[j] || 1, u = (s - cum[j]) / sl, dx = full[2 * j + 2] - full[2 * j], dy = full[2 * j + 3] - full[2 * j + 1];
    return { x: full[2 * j] + dx * u, y: full[2 * j + 1] + dy * u, ux: dx / sl, uy: dy / sl, j };
  };
  // the path of the body between the fractions F0..F1 of its length (not over the ends, broken where hidden); false: nothing
  const seg = (F0, F1, dy) => {
    const a = Math.max(s0, F0 * Lf), b = Math.min(s1, F1 * Lf);
    if (b <= a) return false;
    ctx.beginPath();
    let pen = false, any = false;
    for (let j = 0; j < n - 1; j++) {
      const sa = cum[j], sb = cum[j + 1];
      if (sb <= a || sa >= b || sb <= sa) continue;
      if (!segOn(j)) { pen = false; continue; }
      const u0 = (Math.max(a, sa) - sa) / (sb - sa), u1 = (Math.min(b, sb) - sa) / (sb - sa);
      const X = full[2 * j], Y = full[2 * j + 1], DX = full[2 * j + 2] - X, DY = full[2 * j + 3] - Y;
      if (!pen) { ctx.moveTo(X + DX * u0, Y + DY * u0 + dy); pen = true; }
      ctx.lineTo(X + DX * u1, Y + DY * u1 + dy); any = true;
    }
    return any;
  };
  // the side from the height b (px above the bottom) up to the roof: the body stroke with its bottom edge lifted by b
  // (whole: with the two ends; F0..F1: only that stretch of the body)
  const side = (b, col, F0 = null, F1 = 1) => {
    const w = W + H - b, dy = -(H + b) / 2;
    ctx.strokeStyle = col; ctx.lineWidth = w;
    if (F0 === null) { path(dy); ctx.stroke(); caps(w, dy, col); } else if (seg(F0, F1, dy)) ctx.stroke();
  };
  const roadSide = () => {
    const bands = LV.bands || RV_BANDS, hb = f => (f ? Math.min(H - 1, Math.max(1, H * f)) : 0);
    const wi = bands.findIndex(b => b[1] === TB), bw = Math.max(2, hb(bands[wi][0])), bt = H * (LV.top || RV_TOP);
    // the bands from the bottom up (red skirt, white, black windows up to the roof; trams: white, red, white, black, top),
    // on the ends too (the black mask round the windscreen)
    for (const [f, col] of bands) {
      side(f === bands[wi][0] ? bw : hb(f), col);
      if (LV.arches && col === TW && H >= 4) for (const w of LV.wheels) side(0, c.body, w - 0.06, w + 0.06); // (Solaris 27Tr: the red flares up over the wheels)
    }
    if (H >= 7) { // panes of glass with thin pillars between them
      ctx.setLineDash([Math.max(2, 1.45 * sm), Math.max(1, 0.18 * sm)]);
      side(bw + Math.max(1, H * 0.05), RV_COL.pane, 0, 1);
      ctx.setLineDash([]);
    }
    // doors: glass from the floor to the top of the windows in a dark frame, two leaves when there is room
    if (H >= 5) for (const [a, b] of LV.doors) { // (far out the doors are a pixel: left out, there are many vehicles then)
      side(0, LV.frame || RV_COL.win, a, b);
      const g = Math.max(0.6, 0.06 * sm) / Lf, m = (a + b) / 2, lo = Math.max(1, H * 0.04);
      if ((b - a) * Lf >= 6) { side(lo, RV_COL.door, a + g, m - g / 2); side(lo, RV_COL.door, m + g / 2, b - g); }
      else side(lo, RV_COL.door, a, b);
    }
    if (H >= 5) { // (over the tops of the doors and the panes: the black band, and the band on top of it)
      side(bt, RV_COL.win, 0, 1);
      for (const [f, col] of bands) if (H * f > bt) side(hb(f), col, 0, 1);
    }
    // wheels in the skirt, on the side that is seen (not when the vehicle goes nearly north-south: its side is a strip)
    if (k * VIS >= 2) for (const f of LV.wheels) {
      const q = at(f);
      if (!segOn(q.j)) continue;
      let px = -q.uy, py = q.ux;
      if (py < 0) { px = -px; py = -py; }
      if (py < 0.4) continue;
      const rb = (0.5 * H) / 3.2, ra = 0.5 * sm, rot = Math.atan2(q.uy, q.ux);
      const x = q.x + (px * (W + H)) / 2, y = q.y - H / 2 + (py * (W + H)) / 2 - rb + 0.5;
      ctx.fillStyle = RV_COL.tyre; ctx.beginPath(); ctx.ellipse(x, y, ra, rb, rot, 0, Math.PI * 2); ctx.fill();
      if (rb >= 2) { ctx.fillStyle = RV_COL.hub; ctx.beginPath(); ctx.ellipse(x, y, ra * 0.45, rb * 0.45, rot, 0, Math.PI * 2); ctx.fill(); }
    }
  };
  const roadTop = () => {
    // boxes on the roof (air conditioning, traction gear): a darker side, a light top
    if (H >= 4.5) for (const [a, b, hm] of LV.boxes) {
      const bh = Math.max(1, hm * hv), wb = W * 0.62;
      ctx.strokeStyle = LV.boxSide || RV_COL.boxSide; ctx.lineWidth = wb + bh; if (seg(a, b, -H - bh / 2)) ctx.stroke();
      ctx.strokeStyle = LV.box || RV_COL.box; ctx.lineWidth = wb; if (seg(a, b, -H - bh)) ctx.stroke();
    }
    // the bellows of the articulations, ribbed, over the side and the roof (trams: dark, at the joints of their type)
    const jl = RV ? (RV.joint != null ? [RV.joint] : []) : LV.joints || js.filter(j => !j[1]).map(j => j[0]);
    const g = (LV.bellowsM || 1.6) / 2 / LV.len;
    for (const f of jl) {
      ctx.strokeStyle = LV.bellows || RV_COL.bellows; ctx.lineWidth = W + H; if (seg(f - g, f + g, -H / 2)) ctx.stroke();
      if (sm >= 5) { ctx.setLineDash([1, Math.max(1, 0.16 * sm)]); ctx.strokeStyle = LV.rib || RV_COL.rib; if (seg(f - g, f + g, -H / 2)) ctx.stroke(); ctx.setLineDash([]); }
    }
  };
  // trolleybus: two poles from the roof, trailing back about 6.6 m and up to the wires 2.4 m over the roof, yellow catchers at the top
  const trolleyPoles = () => {
    const q = at(RV.pole);
    if (!segOn(q.j)) return;
    const bx = q.x, by = q.y - H - 0.2 * hv, tx = q.ux * 6.6 * sm, ty = q.uy * 6.6 * sm - 2.4 * hv;
    const ox = -q.uy * W * 0.2, oy = q.ux * W * 0.2;
    ctx.lineWidth = Math.max(1, 0.11 * sm); ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const x0 = bx + ox * s, y0 = by + oy * s;
      ctx.strokeStyle = RV_COL.pole; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + tx * 0.86, y0 + ty * 0.86); ctx.stroke();
      ctx.strokeStyle = RV_COL.catcher; ctx.beginPath(); ctx.moveTo(x0 + tx * 0.86, y0 + ty * 0.86); ctx.lineTo(x0 + tx, y0 + ty); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  };
  if (vis && vis.every(x => x === false)) hidden = true;
  // ghost: the pieces behind a building are drawn as an outline with sparse hatching inside (no fill), in the dark
  // colour of the kind, so the vehicle can be followed along the street; the pieces in view are drawn over it as usual
  if (ghost && vis && vis.some(x => x === false)) drawGhost(ctx, full, type, k, joints, minScale, GHOST_COL[type] || GHOST_COL.bus, ghost);
  if (!hidden) {
  // shadow, side, roof
  if (!silhouette) { // (the shape alone, for the ghost: no shadow)
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = W + 1; path(1.5); ctx.stroke();
    caps(W + 1, 1.5, 'rgba(0,0,0,.3)');
  }
  ctx.strokeStyle = '#161d2b'; ctx.lineWidth = W + H + 1.5; path(-H / 2); ctx.stroke();
  for (const e of ends) if (e.on && e.len > 0.5) endShape(ctx, e.x, e.y, e.ux, e.uy, W + H + 1.5, e.len + 0.75, e.taper, -H / 2, '#161d2b');
  if (LV) roadSide();
  else { ctx.strokeStyle = c.side; ctx.lineWidth = W + H; path(-H / 2); ctx.stroke(); caps(W + H, -H / 2, c.side); }
  // windscreen: dark glass over the nose (trams: wrapping round the rounded front), a smaller window at the back
  for (const e of ends) {
    if (!e.on || e.len <= 0.5) continue;
    const g = e.front ? E.glass : 0.45;
    const gx = e.x + e.ux * e.len * (1 - g), gy = e.y + e.uy * e.len * (1 - g);
    endShape(ctx, gx, gy, e.ux, e.uy, (W + H) * (e.front ? 0.92 : 0.7) * (1 - (1 - e.taper) * (1 - g)), e.len * g * 0.92, e.taper, -H * 0.62, 'rgba(24,32,48,.97)');
    if (e.front && H >= 2.5) endShape(ctx, gx, gy, e.ux, e.uy, (W + H) * 0.35, e.len * g * 0.6, 0.6, -H * 0.8, 'rgba(150,175,205,.55)'); // reflection
    // lights: white at the front, red at the back (just above the bottom of the nose)
    const lx = e.x + e.ux * e.len * 0.85, ly = e.y + e.uy * e.len * 0.85 - H * 0.05;
    const s2 = Math.max(1, Math.round(0.35 * k * VIS));
    ctx.fillStyle = e.front ? '#fff6d8' : '#e0302a';
    for (const sgn of [-1, 1]) ctx.fillRect(Math.round(lx - e.uy * sgn * (W + H) * e.taper * 0.32 - s2 / 2), Math.round(ly + e.ux * sgn * (W + H) * e.taper * 0.32 - s2 / 2), s2, s2);
  }
  // window strip along the side
  if (!LV && H >= 2.5) { ctx.strokeStyle = 'rgba(40,52,74,.9)'; ctx.lineWidth = Math.max(1, H * 0.35); ctx.setLineDash([Math.max(2, 1.4 * k * VIS), Math.max(1, 0.5 * k * VIS)]); path(-H * 0.45); ctx.stroke(); ctx.setLineDash([]); }
  ctx.strokeStyle = c.roof; ctx.lineWidth = W; path(-H); ctx.stroke();
  // the roof ends behind the raked windscreen (at the front well before the nose, so the glass shows)
  for (const e of ends) if (e.on && e.len > 0.5) endShape(ctx, e.x, e.y, e.ux, e.uy, W, e.len * (e.front ? (type === 'tram' ? 0.3 : 0.35) : 0.7), Math.min(1, e.taper * 1.1), -H, c.roof);
  if (LV) roadTop();
  else { ctx.strokeStyle = c.band; ctx.lineWidth = Math.max(1, W * 0.28); path(-H); ctx.stroke(); }
  // articulations (thin dark line) and couplings between two cars (a wider gap); default: three-section tram
  // (buses and trolleybuses: only the couplings, their articulation is the bellows of roadTop)
  if (n >= 3) for (const [f, kind] of js) {
    if (LV && !kind) continue;
    const t = (n - 1) * f, i = Math.min(n - 2, Math.floor(t)), u = t - i;
    if (!segOn(i)) continue;
    const x = pts[2 * i] + (pts[2 * i + 2] - pts[2 * i]) * u, y = pts[2 * i + 1] + (pts[2 * i + 3] - pts[2 * i + 1]) * u;
    const g = kind ? Math.max(2, Math.round(0.9 * k * VIS)) : Math.max(1, Math.round(0.4 * k * VIS));
    // a line across the body (square to the way it goes), over the side and the roof
    const dx = pts[2 * i + 2] - pts[2 * i], dy = pts[2 * i + 3] - pts[2 * i + 1], dl = Math.hypot(dx, dy) || 1, r = (W + H) / 2, px = (-dy / dl) * r, py = (dx / dl) * r;
    ctx.strokeStyle = kind ? '#161d2b' : 'rgba(22,29,43,.85)'; ctx.lineWidth = g; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x - px, y - H / 2 - py); ctx.lineTo(x + px, y - H / 2 + py); ctx.stroke();
  }
  if (type === 'tram' && n >= 4) {
    // a yellow single-arm pantograph (as on all Brno trams now) in the front part: a dark base frame on the roof, the lower
    // arm forward and up to the knee, the upper arm back and up to the contact head across the roof (about 2.1 m high)
    const q = at(LV ? LV.panto : 0.2);
    if (k > 0.5 && segOn(q.j)) {
      const fx = -q.ux, fy = -q.uy, x = q.x, y = q.y - H; // (fx, fy: toward the front)
      const hh = Math.max(5, 2.1 * hv), kf = Math.max(2, 1.3 * sm), bl = Math.max(2, 1.0 * sm);
      const lw = Math.max(1, 0.12 * sm), px = -q.uy * W * 0.3, py = q.ux * W * 0.3;
      ctx.strokeStyle = '#5a5f66'; ctx.lineWidth = Math.max(1, W * 0.3); ctx.beginPath(); ctx.moveTo(x - fx * bl * 0.3, y - fy * bl * 0.3 - 0.5); ctx.lineTo(x + fx * bl, y + fy * bl - 0.5); ctx.stroke(); // base frame
      const kx = x + fx * kf, ky = y + fy * kf - hh * 0.5, hx = x + fx * kf * 0.15, hy = y + fy * kf * 0.15 - hh;
      // (KT8D5: the older diamond pantograph, both arms from the base frame meeting under the head)
      const arm = LV && LV.diamond
        ? () => { const ax = fx * kf * 0.6, ay = fy * kf * 0.6; ctx.beginPath(); ctx.moveTo(x + fx * kf * 0.15, y - 1); ctx.lineTo(x + ax + fx * kf * 0.15, y + ay - hh / 2); ctx.lineTo(hx, hy); ctx.lineTo(x - ax + fx * kf * 0.15, y - ay - hh / 2); ctx.closePath(); }
        : () => { ctx.beginPath(); ctx.moveTo(x, y - 1); ctx.lineTo(kx, ky); ctx.lineTo(hx, hy); };
      ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
      arm(); ctx.strokeStyle = 'rgba(22,29,43,.6)'; ctx.lineWidth = lw + 1.5; ctx.stroke();
      arm(); ctx.strokeStyle = '#e8c21e'; ctx.lineWidth = lw; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx - px, hy - py); ctx.lineTo(hx + px, hy + py); // contact head across the roof
      ctx.strokeStyle = '#161d2b'; ctx.lineWidth = lw + 1.5; ctx.stroke(); ctx.strokeStyle = '#e8c21e'; ctx.lineWidth = Math.max(1, lw * 0.8); ctx.stroke();
      ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    }
  }
  if (RV && RV.pole != null) trolleyPoles();
  }
  // phones (minScale > 1): the badge and its number a quarter bigger, the dot of the zoomed-out view twice as big
  const touch = minScale > 1;
  if (labels) {
    // line number badge above the vehicle (collected and drawn by the page last, over everything: setBadgeSink)
    const s = (touch ? 1.25 : 1) * 1.2; // (a fifth bigger than at first: the number reads at a glance)
    if (badgeSink) badgeSink.push([pts[0], pts[1] - H - W - 6, line, type, delay, s, ctx.globalAlpha]);
    else drawBadge(ctx, pts[0], pts[1] - H - W - 6, line, type, delay, s);
  } else if (delay !== null && delay !== undefined) {
    // zoomed out: just a coloured dot above the vehicle
    const d = touch ? 2 : 1;
    const x = Math.round(pts[0]), y = Math.round(pts[1] - H - W - 3 - (d - 1) * 4);
    ctx.fillStyle = '#161d2b'; ctx.fillRect(x - 4 * d, y - 4 * d, 8 * d, 8 * d);
    ctx.fillStyle = delayColor(delay); ctx.fillRect(x - 3 * d, y - 3 * d, 6 * d, 6 * d);
  }
}

// The line number badges: drawn by the page over every other thing on the map (the direction chevrons, the rings, the
// icons), so they are never covered. While a sink is set, drawTransit only collects them into it.
let badgeSink = null;
export const setBadgeSink = a => { badgeSink = a; };
export function drawBadge(ctx, x, y, line, type, delay, s) {
  const fs = Math.round(15 * s), ph = Math.round(14 * s);
  ctx.font = `400 ${fs}px "VT323", monospace`;
  const tw = ctx.measureText(line).width + Math.round(6 * s);
  const bx = Math.round(x - tw / 2), by = Math.round(y - ph - 1);
  ctx.fillStyle = '#161d2b'; ctx.fillRect(bx - 1, by - 1, Math.round(tw) + 2, ph + 2);
  ctx.fillStyle = type === 'tram' ? '#c8202a' : type === 'trol' ? '#2f8f3a' : '#2f6fb7';
  ctx.fillRect(bx, by, Math.round(tw), ph);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(line, Math.round(x), by + ph - Math.round(2 * s));
  if (delay !== null && delay !== undefined) delayGauge(ctx, bx + Math.round(tw) + 2, by - 1, delay, s);
}
// how late a vehicle is: green on time (or early), yellow 1–4 min, orange 5–9 min, red 10 min and more (one scale for the
// whole map: the badges, the ride box, the squares seen from far and the Doprava overview, src/doprava.js; 2026-11-12)
export function delayColor(d) {
  return d <= 0 ? '#5cc062' : d < 5 ? '#f3c868' : d < 10 ? '#f08a3c' : '#d8342c';
}
// a small thermometer next to the line number: the taller and redder, the later the vehicle
// (s: the scale of the badge, 1.25 on phones)
function delayGauge(ctx, x, y, d, s = 1) {
  const H = Math.round(16 * s), w = Math.round(7 * s), fill = Math.max(2, Math.round((Math.min(10, Math.max(0, d)) / 10) * (H - 4)) + 2);
  ctx.fillStyle = '#161d2b'; ctx.fillRect(x, y, w, H);
  ctx.fillStyle = '#384563'; ctx.fillRect(x + 1, y + 1, w - 2, H - 2);
  ctx.fillStyle = delayColor(d); ctx.fillRect(x + 1, y + H - 1 - fill, w - 2, fill);
  // the number of minutes beside it when late
  if (d >= 1) {
    const t = `+${Math.round(d)}`;
    ctx.font = `400 ${Math.round(13 * s)}px "VT323", monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(22,29,43,.95)'; ctx.strokeText(t, x + w + 2, y + H - 3);
    ctx.fillStyle = delayColor(d); ctx.fillText(t, x + w + 2, y + H - 3);
  }
}

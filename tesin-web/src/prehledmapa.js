import META from '../public/data/r0/meta.json';
import TILES_VERSION from '../public/data/r0/tiles-version.json';

const MEDIA = (import.meta.env.VITE_MEDIA_BASE || `${import.meta.env.BASE_URL}cdn/`).replace(/\/?$/, '/');
// the projection of the map with north up, the same as lonLatToImg in src/main.js; the sizes come from the same meta.json
const LON0 = 16.606, LAT0 = 49.201, KX = Math.cos((LAT0 * Math.PI) / 180) * 111320, KY = 110574;
const toImg = (lon, lat) => [((lon - LON0) * KX + META.R) * META.A, ((META.R - (lat - LAT0) * KY) * META.A) / 2 + META.TOP - 60 * META.V];
// the pyramid of the tiles (Deep Zoom): the top level is the full picture, every level under it is half of it.
// BASE is the level about 2000 px wide: its pixel is the unit of the "world" here (16 m of the city from west to east).
const TILE = 512, TOP = Math.ceil(Math.log2(Math.max(META.W, META.H))), BASE = TOP - Math.ceil(Math.log2(META.W / 2048));
const UNIT = 2 ** (TOP - BASE), WW = META.W / UNIT, WH = META.H / UNIT, FINEST = Math.min(TOP, BASE + 4);
// the corners of the ground of the map (north, east, south, west), in units: the map is the part of the city where
// |east| + |north| is under META.R metres
const DIAMOND = [[0, META.R], [META.R, 0], [0, -META.R], [-META.R, 0]].map(([u, w]) => [((u + META.R) * META.A) / UNIT, (((META.R - w) * META.A) / 2 + META.TOP - 60 * META.V) / UNIT]);
const NEAR_UNITS = 190; // (how much of the city the camera sees from near, across: 190 units = 3 km)
// the season of the date in Brno, as the map shows it (seasonOf in src/main.js)
const season = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' })).getMonth()];
const MHD_WORD = { tram: 'šalina', trol: 'trolejbus', bus: 'autobus' };
const VEHICLE = {
  tram: 'M2 0h3v1H2zM3 1h1v1H3zM1 2h5v1H1zM1 3h1v1H1zM5 3h1v1H5zM1 4h5v2H1zM1 6h1v1H1zM5 6h1v1H5z',
  trol: 'M0 0h1v1H0zM6 0h1v1H6zM1 1h1v1H1zM5 1h1v1H5zM1 2h5v1H1zM1 3h1v1H1zM5 3h1v1H5zM1 4h5v2H1zM1 6h1v1H1zM5 6h1v1H5z',
  bus: 'M1 1h5v1H1zM1 2h1v2H1zM5 2h1v2H5zM1 4h5v2H1zM1 6h1v1H1zM5 6h1v1H5z',
};
function vehicle(type) {
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
  s.setAttribute('viewBox', '0 0 7 7'); s.setAttribute('shape-rendering', 'crispEdges'); s.setAttribute('aria-hidden', 'true');
  p.setAttribute('d', VEHICLE[type] || VEHICLE.bus); p.setAttribute('fill', 'currentColor'); s.append(p);
  return s;
}
// the whole city at the start · the flight to a place at the longest · the way back at the end (ms) · places in a flight
const HOME_MS = 3200, FLY_MS = 3200, BACK_MS = 2200, MAX_STOPS = 6;
// the easings of the camera, as CSS has them (cubic-bezier), counted here: the canvas is drawn frame by frame
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t, dX = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => { let t = x; for (let i = 0; i < 6; i++) { const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= (X(t) - x) / d; } return Y(Math.max(0, Math.min(1, t))); };
}
const EASE = { linear: t => t, move: bezier(0.45, 0, 0.25, 1), rise: bezier(0.45, 0, 0.85, 0.6), fall: bezier(0.15, 0.4, 0.5, 1), sway: bezier(0.42, 0, 0.58, 1) };
const cz = x => String(x).replace('.', ',');

/**
 * The map in `view` (an empty element that fills its unit), the count line of the unit in `count`.
 * h: what prehled.js lends (el, icon, itemLink, plural, timeOf, since). Returns { setData, play, stop }.
 */
export function createMapView(view, count, h) {
  const { el, icon, itemLink, plural, timeOf, since } = h;
  const canvas = el('canvas', 'mp-canvas'), ctx = canvas.getContext('2d'), pins = el('div', 'mp-pins'), card = el('a', 'mp-card');
  view.append(canvas, pins, card);
  card.hidden = true;
  let vw = 0, vh = 0, dpr = 1, k0 = 1, rem = 16;

  // ---- the tiles: asked for once, kept, drawn when they have come
  const tiles = new Map(); // "level/c_r" → { im, ok, used }
  const sizeOf = level => { const f = 2 ** (TOP - level); return [Math.ceil(META.W / f), Math.ceil(META.H / f), 2 ** (level - BASE)]; }; // (its width and height in pixels, its pixels in a unit)
  function want(level, c, r) {
    const key = `${level}/${c}_${r}`, had = tiles.get(key);
    if (had) { had.used = performance.now(); return; }
    const t = { bmp: null, ok: false, warm: false, used: performance.now() }, im = new Image();
    // (asked for as the map asks for its tiles, with CORS: the browser then takes them from the same store. And kept
    // unpacked, as an ImageBitmap made off the main thread: a picture unpacked only when it is first drawn stopped the
    // flight for 100 to 300 ms, tile after tile, just as the camera came down; measured 2026-11-16.)
    im.crossOrigin = 'anonymous'; im.decoding = 'async';
    im.onload = () => (window.createImageBitmap ? createImageBitmap(im) : Promise.resolve(im)).then(b => {
      if (tiles.get(key) !== t) { if (b.close) b.close(); return; } // (given up in the meantime)
      t.bmp = b; t.ok = true; redraw();
    }, () => {});
    im.src = `${MEDIA}tiles/r0/${season}/map_files/${level}/${c}_${r}.webp?v=${encodeURIComponent(TILES_VERSION.rendered || '')}`;
    tiles.set(key, t);
    // (an unpacked tile is a megabyte of memory: over 260 of them, the fine ones nobody asked for nor drew for 20 s go)
    if (tiles.size > 260) for (const [k2, t2] of tiles) {
      if (tiles.size <= 200) break;
      if (+k2.split('/')[0] > BASE + 1 && t.used - t2.used > 20e3) { if (t2.bmp && t2.bmp.close) t2.bmp.close(); tiles.delete(k2); }
    }
  }
  // the tiles of a level that a camera sees (grow: a bit around it), in the columns and rows of that level
  function range(level, c, grow = 0) {
    const [w, hh, px] = sizeOf(level), u = TILE / px, gx = (vw / c.k) * grow, gy = (vh / c.k) * grow;
    const x0 = c.cx - (vw * c.fx) / c.k - gx, x1 = c.cx + (vw * (1 - c.fx)) / c.k + gx, y0 = c.cy - (vh * c.fy) / c.k - gy, y1 = c.cy + (vh * (1 - c.fy)) / c.k + gy;
    return [Math.max(0, Math.floor(x0 / u)), Math.max(0, Math.floor(y0 / u)), Math.min(Math.ceil(w / TILE), Math.ceil(x1 / u)), Math.min(Math.ceil(hh / TILE), Math.ceil(y1 / u)), u, w, hh, px];
  }
  const wantAll = level => { const [w, hh] = sizeOf(level); for (let r = 0; r * TILE < hh; r++) for (let c = 0; c * TILE < w; c++) want(level, c, r); };
  const wantView = (level, cam, grow) => { const [c0, r0, c1, r1] = range(level, cam, grow); for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) want(level, c, r); };
  // the level whose pixels are at least the pixels of the screen at this height (a tenth of stretching is let be)
  const levelFor = k => Math.max(BASE, Math.min(FINEST, BASE + Math.ceil(Math.log2(k * dpr) - 0.15)));
  wantAll(BASE);
  if ((window.devicePixelRatio || 1) > 1.2) wantAll(BASE + 1); // (a dense screen: the whole city is soft from the coarsest level)

  // ---- the districts of the city (public/data/boundaries.json, the file of the map): their names on the picture as
  // the camera comes down, and the district of a place for its card
  let parts = [], city = []; // (city: the rings of the boundary of Brno, drawn as a line round the city for orientation)
  const ringOf = f => { const p = []; for (let i = 0; i + 1 < f.length; i += 2) { const q = toImg(f[i], f[i + 1]); p.push([q[0] / UNIT, q[1] / UNIT]); } return p; };
  fetch(`${import.meta.env.BASE_URL}data/boundaries.json`).then(r => (r.ok ? r.json() : [])).then(list => {
    city = list.filter(b => b.n === 'Brno').flatMap(b => (b.r || []).map(ringOf));
    parts = list.filter(b => b.n !== 'Brno' && b.r && b.r.length).map(b => {
      const rings = b.r.map(ringOf);
      const big = rings.reduce((a, c) => (c.length > a.length ? c : a)); // (the name stands in the middle of the biggest piece)
      let A = 0, X = 0, Y = 0; for (let i = 0, j = big.length - 1; i < big.length; j = i++) { const f = big[j][0] * big[i][1] - big[i][0] * big[j][1]; A += f; X += (big[j][0] + big[i][0]) * f; Y += (big[j][1] + big[i][1]) * f; }
      const xs = big.map(p => p[0]), ys = big.map(p => p[1]);
      return { n: /^Brno-(střed|sever|jih)$/.test(b.n) ? b.n : b.n.replace(/^Brno-/, ''), rings, x: X / (3 * A), y: Y / (3 * A), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    });
    redraw();
  }).catch(() => {});
  const inRing = (ring, x, y) => { let in_ = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if ((ring[i][1] > y) !== (ring[j][1] > y) && x < ((ring[j][0] - ring[i][0]) * (y - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) in_ = !in_; return in_; };
  const partOf = (x, y) => { const p = parts.find(d => x >= d.box[0] && x <= d.box[2] && y >= d.box[1] && y <= d.box[3] && d.rings.some(r => inRing(r, x, y))); return p ? p.n : ''; };

  // ---- what is on the map: the stops (the events of "Teď" that have a place: the camera visits them) and the small
  // marks (the vehicles of the public transport 5 and more minutes late, the queues that are not a stop already).
  // Every mark is a point of no size at its place; what is seen hangs on it and keeps its size on the screen.
  let stops = [], queues = [], marks = [], lines = [], plays = 0, data = {};
  const inside = ([x, y]) => x >= 0 && y >= 0 && x <= META.W && y <= META.H;
  const at = (lon, lat) => { const p = toImg(lon, lat); return inside(p) ? { x: p[0] / UNIT, y: p[1] / UNIT } : null; };
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 14; // (14 units of the world: about 220 m)
  function setData(d) {
    data = d;
    const { Z, DOP } = d;
    stops = ((Z && Z.msgs) || []).filter(m => m.tier === 'now' && m.st !== 'end' && m.at)
      .map(m => ({ ...at(m.at[0], m.at[1]), m })).filter(s => s.x != null)
      .sort((a, b) => (a.m.quiet ? 1 : 0) - (b.m.quiet ? 1 : 0) || (b.m.prio || 0) - (a.m.prio || 0));
    marks = [];
    const small = (p, cls, title, ...kids) => { const e = el('span', `mp-mark ${cls}`), b = el('b'); b.append(...kids); e.append(b); e.title = title; marks.push({ ...p, e }); return b; };
    // the queues: lines along their roads (level 4 and more: the cars stand, red), each with the minutes it costs
    // written at its middle ("+10 min"). A stop that is a queue takes the length and the delay of the line nearest to
    // it for its card.
    lines = []; queues = [];
    for (const q of (d.J && d.J.jams) || []) {
      const pts = (q.path || []).map(p => at(p[0], p[1])).filter(Boolean);
      if (pts.length < 2) continue;
      lines.push({ pts, hard: q.level >= 4 });
      const min = Math.round((q.delay || 0) / 60), s = stops.find(o => o.m.src === 'kolony' && !o.jam && pts.some(p => near(o, p)));
      const jam = { s: q.street, km: Math.round((q.len || 0) / 100) / 10, min };
      if (s) s.jam = jam;
      // (a queue that is no event of "Teď" is a place for the camera all the same: it has no pin, its line and its minutes show it)
      else { const mid = pts[pts.length >> 1], ll = q.path[q.path.length >> 1]; queues.push({ x: mid.x, y: mid.y, jam, hard: q.level >= 4, m: { src: 'kolony', title: `Kolona, zdržení ${min} min`, sub: q.street || '', t: q.t, at: ll, ref: { kind: 'kolona' } } }); }
      if (min < 1) continue;
      const i = pts.length >> 1, a = pts[Math.max(0, i - 1)], z = pts[Math.min(pts.length - 1, i + 1)], len = Math.hypot(z.x - a.x, z.y - a.y) || 1;
      let nx = -(z.y - a.y) / len, ny = (z.x - a.x) / len; if (ny > 0) { nx = -nx; ny = -ny; }
      const far = 0.75 + 0.95 * Math.abs(nx), b = small(s || pts[i], `jam${q.level >= 4 ? ' hard' : ''}${min < 5 && !s ? ' minor' : ''}`, `Kolona: ${q.street || ''}, zdržení ${min} min`, `+${min} min`);
      b.style.transform = s ? 'translate(.85rem, -1.45rem)' : `translate(calc(-50% + ${(nx * far).toFixed(2)}rem), calc(-50% + ${(ny * far).toFixed(2)}rem))`;
    }
    queues.sort((a, b) => (b.hard ? 1 : 0) - (a.hard ? 1 : 0) || b.jam.min - a.jam.min); // (the red ones first, in each colour the longest wait first)
    const jams = d.J ? lines.length : ((DOP && DOP.top && DOP.top.now) || []).length;
    // a vehicle of the public transport that runs late: a tag with its kind, its line and its minutes ("+6"), orange
    // from 5 minutes and red from 10, as on the map (delayColor in src/vehicles.js)
    let late = 0;
    for (const [line, type, min, lon, lat] of (DOP && DOP.late) || []) {
      const p = at(lon, lat); if (!p) continue;
      late++;
      small(p, `late${min >= 10 ? ' much' : ''}`, `${MHD_WORD[type] || 'linka'} ${line}: zpoždění ${min} min`, vehicle(type), el('i', '', String(line)), el('em', '', `+${min}`));
    }
    for (const s of stops) { // (the stops last: over the small marks)
      const a = el('a', 'mp-pin'), b = el('span', 'mp-pb'), i = icon(s.m.src); i.setAttribute('class', 'mp-i'); // (not .zi: these keep their squares in a long run)
      a.title = s.m.title; a.href = itemLink(s.m.ref && s.m.ref.kind, s.m.ref && s.m.ref.id, s.m.at[1], s.m.at[0]);
      b.append(i); a.append(b); s.pin = a; marks.push({ x: s.x, y: s.y, e: a });
    }
    pins.replaceChildren(...marks.map(m => m.e));
    // the line of the head counts them and shows what each mark looks like
    const tag = (cls, ...kids) => { const s = el('span', `mp-s ${cls}`); s.append(...kids); return s; };
    const one = (sample, text) => { const s = el('span', 'mp-lg'); s.append(sample || '', text); return s; };
    const legend = [stops.length ? one(null, plural(stops.length, 'místo', 'místa', 'míst')) : null, jams ? one(tag('jam'), plural(jams, 'kolona', 'kolony', 'kolon')) : null,
      late ? one(tag('late', vehicle('tram'), el('em', '', '+5')), `${plural(late, 'vůz', 'vozy', 'vozů')} MHD se zpožděním`) : null].filter(Boolean);
    count.replaceChildren(...(legend.length ? legend : ['Teď je ve městě klid']));
    // (the map can come before the data: a flight planned over a city with no places starts again now that there are some)
    if (playing && plan && !plan.n && stops.length + queues.length) { play(Math.max(4e3, plan.ms - (performance.now() - plan.t0)), plan.opts); return; }
    redraw();
  }
  // the card of a stop: what it is, where (the street when the data name it, and the district), a line about it, since when
  function about(s) {
    const m = s.m, sub = m.sub || '', kind = m.src, head = sub.split(' · ')[0];
    let street = '', text = sub;
    if (kind === 'kolony') { street = s.jam ? s.jam.s : head; text = s.jam ? `Kolona dlouhá ${cz(s.jam.km)} km, průjezd se zdrží asi o ${s.jam.min} min.` : sub; }
    else if (kind === 'nehody') { street = /\d+ hlášení/.test(head) ? '' : head; const n = /(\d+) hlášení/.exec(sub); text = `Nehodu hlásí řidiči v aplikaci Waze${n ? `, zatím ${n[1]}×` : ''}.`; }
    else if (kind === 'hasici') {
      const o = ((data.H && data.H.items) || []).find(x => m.ref && String(x.id) === String(m.ref.id));
      if (o) { street = [o.street, o.part].filter(Boolean).join(', '); text = `${o.typ}${o.sub ? ` (${o.sub})` : ''}${o.units && o.units.length ? `, na místě ${plural(o.units.length, 'jednotka', 'jednotky', 'jednotek')}` : ''}.`; }
    } else if (kind === 'voda') {
      const o = ((data.V && data.V.items) || []).find(x => m.ref && String(x.id) === String(m.ref.id));
      if (o) { street = ((o.where || [])[0] || '').split(',')[0]; text = `${o.kind === 'havarie' ? 'Havárie vodovodu' : 'Odstávka vody'}${o.n ? `, bez vody ${plural(o.n, 'adresa', 'adresy', 'adres')}` : ''}${o.to ? `, do ${timeOf(o.to)}` : ''}.`; }
    } else if (kind === 'parkovani') text = `Parkoviště je plné: ${sub}.`;
    const part = partOf(s.x, s.y);
    const where = [street, part && !street.includes(part) ? part : ''].filter(Boolean).join(' · ');
    return { where, text, when: m.t && Date.now() - m.t < 864e5 ? `od ${timeOf(m.t)} · trvá ${since(m.t)}` : '' };
  }
  function fillCard(s) {
    const i = icon(s.m.src), t = el('span', 'mp-ct'), a = about(s); i.setAttribute('class', 'mp-i');
    t.append(el('b', '', s.m.title), a.where ? el('span', 'mp-cw', a.where) : '', a.text ? el('span', 'mp-ca', a.text) : '', a.when ? el('small', '', a.when) : '');
    card.replaceChildren(i, t); card.href = s.pin ? s.pin.href : itemLink(s.m.ref.kind, null, s.m.at[1], s.m.at[0]);
  }
  function showCard(s) {
    for (const o of stops) if (o.pin) o.pin.classList.toggle('at', o === s);
    card.hidden = !s;
    if (s) fillCard(s);
  }
  // where on the view a place stands while its card is shown: in the middle of the room the card leaves free. The card
  // lies in the bottom left corner; on a wide and low view (a television, 2026-11-16: "ten střed místa doprostřed toho
  // místa v pravé části vedle infoboxu") that room is right of it, on a higher one above it. The one whose shorter side
  // is longer wins. Measured with the card of that very place, laid out unseen, once per flight.
  function framing(s) {
    fillCard(s); card.style.visibility = 'hidden'; card.hidden = false;
    const l = card.offsetLeft, t = card.offsetTop, w = card.offsetWidth;
    card.hidden = true; card.style.visibility = '';
    if (!w) return { fx: 0.56, fy: 0.5 };
    const gap = 0.7 * rem, right = [l + w + gap, vw], above = [0, t - gap];
    const rw = right[1] - right[0], ah = above[1] - above[0];
    if (Math.min(rw, vh) >= Math.min(vw, ah)) return { fx: (right[0] + right[1]) / 2 / vw, fy: 0.5 };
    return { fx: 0.5, fy: Math.max(0.3, ah / 2 / vh) };
  }

  // ---- the camera: the place of the world it looks at (cx, cy), how much it magnifies (k), and where on the view
  // that place is (fx, fy: 0.5 the middle; over a stop the middle of the room beside its card, see framing)
  const homeCam = () => ({ cx: WW / 2, cy: WH / 2, k: k0, fx: 0.5, fy: 0.5 });
  const lerp = (a, b, p) => a + (b - a) * p;
  function camAt(path, t) { // (between two points of the path the place moves evenly and the zoom by ratio: it feels even to the eye)
    let i = 0; while (i < path.length - 2 && t >= path[i + 1].at) i++;
    const a = path[i], b = path[i + 1], p = EASE[a.ease || 'linear'](Math.max(0, Math.min(1, (t - a.at) / Math.max(1, b.at - a.at))));
    return { cx: lerp(a.c.cx, b.c.cx, p), cy: lerp(a.c.cy, b.c.cy, p), k: Math.exp(lerp(Math.log(a.c.k), Math.log(b.c.k), p)), fx: lerp(a.c.fx, b.c.fx, p), fy: lerp(a.c.fy, b.c.fy, p) };
  }
  // one picture: the tiles from the coarse level up to the one that fits, the queues, the names, and the marks moved
  function render(c, kz) {
    const ox = vw * c.fx - c.cx * c.k, oy = vh * c.fy - c.cy * c.k, now = performance.now(), best = levelFor(c.k);
    let more = false; // (tiles that had to wait for the next frame)
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
    // (the tiles lie at their exact places, in parts of a pixel: rounded to whole pixels they trembled against one
    // another when the camera came down slowly. Each one reaches a pixel over its neighbour, so no seam shows.)
    const s = c.k * dpr, lap = 1 / s;
    let fresh = 3; // (a tile drawn for the first time is sent to the graphics card: three in a frame at most, so twenty that come at once do not stop the flight; the coarser level shows for those few frames)
    ctx.setTransform(s, 0, 0, s, ox * dpr, oy * dpr);
    for (let level = BASE; level <= best; level++) {
      const [c0, r0, c1, r1, u, w, hh, px] = range(level, c);
      for (let r = r0; r < r1; r++) for (let col = c0; col < c1; col++) {
        const t = tiles.get(`${level}/${col}_${r}`);
        if (!t || !t.ok) continue;
        if (!t.warm) { if (!fresh) { more = true; continue; } fresh--; t.warm = true; }
        t.used = now;
        ctx.drawImage(t.bmp, col * u, r * u, Math.min(TILE, w - col * TILE) / px + lap, Math.min(TILE, hh - r * TILE) / px + lap);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const near_ = Math.max(0, Math.min(1, (c.k / k0 - 1.3) / 1.2));
    // the boundary of the city: a light line with a dark one under it. Only over the picture: the city reaches beyond
    // the diamond of the map in places, and a line over the empty corner would lead nowhere.
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.save(); ctx.beginPath();
    DIAMOND.forEach((p, i) => { const x = (ox + p[0] * c.k) * dpr, y = (oy + p[1] * c.k) * dpr; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.clip();
    for (const [colour, w] of [['rgba(14, 19, 28, .7)', 0.26], ['rgba(240, 242, 234, .9)', 0.12]]) {
      ctx.beginPath();
      for (const ring of city) { ring.forEach((p, i) => { const x = (ox + p[0] * c.k) * dpr, y = (oy + p[1] * c.k) * dpr; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); }
      ctx.strokeStyle = colour; ctx.lineWidth = rem * w * dpr; ctx.stroke();
    }
    ctx.restore();
    // the queues: a dark line under a coloured one, thin over the whole city and wider from near
    for (const [colour, extra] of [['rgba(14, 19, 28, .9)', 2.5], [null, 0]]) for (const q of lines) {
      ctx.beginPath();
      q.pts.forEach((p, i) => { const x = (ox + p.x * c.k) * dpr, y = (oy + p.y * c.k) * dpr; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.strokeStyle = colour || (q.hard ? '#ff6b57' : '#f5a04a'); ctx.lineWidth = (rem * (0.16 + 0.2 * near_) + extra) * dpr; ctx.stroke();
    } // (the names of the districts: none over the whole city, all from about three times nearer)
    if (near_ > 0 && parts.length) {
      const size = rem * 1.05 * dpr;
      ctx.font = `${size}px "Jersey 15", "Courier New", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = size / 4.5;
      ctx.globalAlpha = near_ * 0.9;
      for (const d of parts) {
        const x = (ox + d.x * c.k) * dpr, y = (oy + d.y * c.k) * dpr;
        if (x < -200 * dpr || y < -40 * dpr || x > canvas.width + 200 * dpr || y > canvas.height + 40 * dpr) continue;
        const name = d.n.toUpperCase();
        ctx.strokeStyle = 'rgba(14, 19, 28, .9)'; ctx.strokeText(name, x, y); ctx.fillStyle = '#f0f2ea'; ctx.fillText(name, x, y);
      }
      // from near the middle of a district is mostly out of the view: the district under the camera is named at the top
      const here = c.k > k0 * 3 && parts.find(d => d.n === partOf(c.cx, c.cy));
      if (here) {
        const x = (ox + here.x * c.k) * dpr, y = (oy + here.y * c.k) * dpr;
        if (x < 60 * dpr || y < 30 * dpr || x > canvas.width - 60 * dpr || y > canvas.height - 30 * dpr) {
          const name = here.n.toUpperCase(), big = size * 1.25;
          ctx.font = `${big}px "Jersey 15", "Courier New", monospace`; ctx.lineWidth = big / 4.5; ctx.globalAlpha = Math.min(1, (c.k / k0 - 3) / 1.5) * 0.95;
          const half = ctx.measureText(name).width / 2 + 12 * dpr, nx = Math.max(half, Math.min(canvas.width - half, canvas.width * c.fx)); // (over the place, not over the card)
          ctx.strokeStyle = 'rgba(14, 19, 28, .9)'; ctx.strokeText(name, nx, big * 0.95); ctx.fillStyle = '#f0f2ea'; ctx.fillText(name, nx, big * 0.95);
        }
      }
      ctx.globalAlpha = 1;
    }
    pins.classList.toggle('far', c.k < k0 * 2);
    const g = (1 + 0.3 * Math.max(0, Math.min(1, Math.log(c.k / k0) / Math.log((kz || k0 * 3) / k0)))).toFixed(3); // (the marks: a little bigger from near, far less than the ground)
    for (const m of marks) m.e.style.transform = `translate(${(ox + m.x * c.k).toFixed(1)}px, ${(oy + m.y * c.k).toFixed(1)}px) scale(${g})`;
    if (more) redraw(); // (a standing picture goes on by itself until all its tiles are in; a flight draws every frame anyway)
  }
  // ---- a flight is drawn frame by frame; without one the picture is drawn only when something changed
  let fly = null, plan = null, raf = 0, timers = [], playing = false, slowFlights = 0, standing = false, lastFps = 0;
  function redraw() { if (!fly && vw && !raf) raf = requestAnimationFrame(() => { raf = 0; if (!fly && vw) render(homeCam()); }); }
  function frame(now) {
    raf = 0;
    if (!fly) return;
    const t = Math.min(fly.total, now - fly.start);
    render(camAt(fly.path, t), fly.kz); fly.frames++;
    if (t < fly.total) { raf = requestAnimationFrame(frame); return; }
    lastFps = Math.round(fly.frames / (fly.total / 1000));
    if (lastFps < 28) { if (++slowFlights >= 2) standing = true; } else slowFlights = 0; // (a device that cannot keep up: the next flights stand)
    fly = null;
  }
  function measure() {
    vw = view.clientWidth; vh = view.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1); rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    if (!vw) return false;
    k0 = Math.min(vw / WW, vh / WH) * 0.98;
    if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) { canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr); }
    return true;
  }
  function stop() {
    playing = false; fly = null;
    cancelAnimationFrame(raf); raf = 0;
    for (const t of timers) clearTimeout(t); timers = [];
    showCard(null);
    if (measure()) render(homeCam());
  }
  /** One flight of `ms` (the time the block has): the whole city, then up to six places, then back. calm: no moves;
   * force: fly even when the flights before came out too slow (?prulet=1). */
  function play(ms = 30e3, { calm = false, loop = false, force = false } = {}) {
    stop();
    if (!vw) return;
    playing = true; calm = calm || (standing && !force);
    // (a block that comes on in the middle of its time has less of it: fewer places, down to the city alone)
    const home = homeCam(), total = Math.max(4e3, ms), homeMs = Math.min(HOME_MS, total * 0.3), backMs = Math.min(BACK_MS, total * 0.15);
    const all = [...stops, ...queues], n = Math.max(0, Math.min(MAX_STOPS, all.length, Math.floor((total - homeMs - backMs) / 3300)));
    const keep = Math.min(3, n), rest = all.slice(keep), slots = n - keep, first = rest.length > slots ? (plays * slots) % rest.length : 0;
    const chosen = [...all.slice(0, keep), ...Array.from({ length: slots }, (_, i) => rest[(first + i) % rest.length])];
    // (visited by the shortest way: from the most pressing one always to the nearest that is left)
    const tour = chosen.splice(0, 1);
    while (chosen.length) { const a = tour.at(-1); let bi = 0; chosen.forEach((b, i) => { if (Math.hypot(b.x - a.x, b.y - a.y) < Math.hypot(chosen[bi].x - a.x, chosen[bi].y - a.y)) bi = i; }); tour.push(...chosen.splice(bi, 1)); }
    plays++;
    plan = { ms: total, t0: performance.now(), n, opts: { calm, loop } };
    timers.push(setTimeout(() => { if (playing && loop) play(30e3, { calm, loop, force }); }, total + 50));
    // (the time of a place is shared between the way to it and the stay over it; with six places both are short)
    const each = n ? (total - homeMs - backMs) / n : 0, flyMs = Math.max(1500, Math.min(FLY_MS, each * 0.45)), hold = each - flyMs;
    const kz = Math.max(k0 * 3, Math.min(8, vw / NEAR_UNITS));
    const fine = !calm && !(navigator.connection && navigator.connection.saveData);
    // the path of the camera: where it is (c) at which time (at), and how it moves on from there (ease)
    const path = [{ c: home, at: 0, ease: 'linear' }];
    if (!n) { // nothing with a place: the city alone, coming a little nearer and back, so that it does not stand
      path[0].ease = 'sway';
      path.push({ c: { ...home, k: k0 * 1.15 }, at: total / 2, ease: 'sway' }, { c: home, at: total });
    } else {
      let t = homeMs, from = null;
      const stays = [];
      path.push({ c: home, at: t, ease: 'move' });
      const frames = calm ? [] : tour.map(framing);
      tour.forEach((s, i) => {
        const arrive = t + flyMs, leave = arrive + hold, over = { cx: s.x, cy: s.y, k: kz, ...frames[i] }, low = { ...over, k: kz * 1.1 };
        if (from) { // from place to place the camera rises on the way, the more the farther it is: a hop, not a slide
          const d = Math.hypot(s.x - from.x, s.y - from.y);
          path.at(-1).ease = 'rise';
          path.push({ c: { cx: (s.x + from.x) / 2, cy: (s.y + from.y) / 2, k: kz * Math.max(0.3, Math.min(0.85, 1 - d / 500)), fx: (frames[i - 1].fx + frames[i].fx) / 2, fy: (frames[i - 1].fy + frames[i].fy) / 2 }, at: t + flyMs / 2, ease: 'fall' });
        }
        path.push({ c: over, at: arrive, ease: 'sway' }, { c: low, at: leave, ease: 'move' }); // (while it stays, it goes on coming down a little: a flight does not stop)
        stays.push([arrive, leave]);
        timers.push(setTimeout(() => showCard(s), calm ? homeMs + i * each : arrive - Math.min(900, flyMs * 0.4)), setTimeout(() => showCard(null), calm ? homeMs + (i + 1) * each - 150 : leave - 150));
        t = leave; from = s;
      });
      path.push({ c: home, at: total });
      // the tiles of the whole way at the levels that fit the height of the camera ("pořád rozmazaná": the fine ones
      // used to wait at the places only, and the way down and the hops were drawn from the coarse levels). Where the
      // camera stays, the level that fits; where it moves, one under it: a moving picture does not show the difference
      // and the level under is a quarter of the tiles. Each second of the way is asked for 8 s ahead of the camera, not
      // all at the start: fetching and unpacking 200 tiles at once is work too.
      if (fine) for (let sec = Math.floor(homeMs / 1000); sec * 1000 < total; sec++) timers.push(setTimeout(() => {
        for (let at = sec * 1000; at < sec * 1000 + 1000 && at <= total; at += 160) {
          const c = camAt(path, at), stay = stays.some(([a, b]) => at >= a - 300 && at <= b + 300);
          wantView(Math.max(BASE + 1, levelFor(c.k) - (stay ? 0 : 1)), c, 0.05);
        }
      }, Math.max(0, sec * 1000 - 8000)));
    }
    if (calm) return;
    wantAll(BASE + 1);
    fly = { path, total, kz, start: performance.now(), frames: 0 };
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  new ResizeObserver(() => { if (measure() && !fly) render(homeCam()); }).observe(view);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw); // (the names are written in the letters of the page)
  // for the settings: how the last flight went, and whether the flights stand because they were too slow
  const state = () => ({ fps: lastFps, standing });
  return { setData, play, stop, state };
}

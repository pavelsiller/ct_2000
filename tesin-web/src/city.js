// What is in Brno and what is going on (City of Brno open data, data.brno.cz, CC BY; prepared by tools/*.mjs):
// GO TO BRNO tourist places, themed routes and events, cultural monuments (Wikidata, CC0), public transport
// closures (IDS JMK), memorial trees, drinking fountains, viewpoints and swimming pools.
import { fetchData, watchFeed, RELOAD } from './feed.js';
import { inMap, itemInMap } from './extent.js';
import { beacon } from './beacon.js';
import { onScreen } from './onscreen.js';
import { hatchTile } from './hatch.js';
import { words, placeScore } from './placenames.js';
const TXT_Z = 2 / 3.5; // text, events and stops only from 3.5 m per pixel
const SMALL_Z = 1 / 0.3; // the small things (statues, trees, fountains …) only from 0.3 m per pixel
export const dayStart = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

// hiddenBehind(X, Y): is this point on the ground hidden behind a building (true / false / null = not known yet)?
// things standing behind a building are drawn see-through
export function createCity({ base, llToImg, hiddenBehind = () => false, lite = () => false }) { // (lite: a slow device, see main.js)
  const D = { places: [], routes: [], events: [], monuments: [], outages: [], small: [], kameny: [], updated: {} };
  // Only what lies in the map is kept (src/extent.js). The whole lists of the places and events stay beside (raw):
  // the detail file is merged into them by index. All the transport closures stay too: a line of the map can have
  // a closure whose point lies out of town, and its card says so (outagesForLine).
  const raw = { places: [], events: [], outages: [] };
  let loading = null;
  const routesInMap = routes => (routes || []).map(r => ({ ...r, stops: r.stops.filter(s => inMap(s.lon, s.lat)) })).filter(r => r.stops.length > 1);
  const loadPlaces = init => fetchData(`${base}data/gotobrno.json`, init).then(r => r.json()).then(d => { raw.places = d.places || []; raw.events = d.events || []; D.places = raw.places.filter(itemInMap); D.routes = routesInMap(d.routes); D.events = raw.events.filter(itemInMap); D.updated.gotobrno = d.updated; posKey = ''; }).catch(() => {});
  const loadOutages = init => fetchData(`${base}data/outages.json`, init).then(r => r.json()).then(d => { raw.outages = d.items || []; D.outages = raw.outages.filter(itemInMap); D.updated.outages = d.updated; posKey = ''; }).catch(() => {});
  const loadSmall = init => fetchData(`${base}data/smallpois.json`, init).then(r => r.json()).then(d => { D.small = (d.items || []).filter(itemInMap); D.updated.small = d.updated; posKey = ''; }).catch(() => {});
  // the places, the events and the closures are wanted as soon as the map opens (the count of events, the Aktuálně panel)
  const load = () => (loading ||= Promise.all([loadPlaces(), loadOutages()]));
  let sprites = null; // { im, ids: { id: [x, y, w, h] }, models: { id: name }, types: { name: [x, y, w, h] } }
  // The small things and their sprites (about 1.1 MB together) are drawn only close up (SMALL_Z): fetched when the map
  // comes near that (draw below) or when something asks for them (whenSmall), not with the opening of the map.
  let smallP = null, smallFns = [];
  const loadSmallAll = () => (smallP ||= Promise.all([
    loadSmall(),
    fetchData(`${base}data/artsprites.json`).then(r => r.json()).then(d => new Promise(res => {
      const im = new Image(); im.onload = () => { sprites = { ...d, im }; hatchCache.clear(); res(); }; im.onerror = () => res(); im.src = `${base}data/artsprites.png`;
    })).catch(() => {}),
  ]).then(() => { const fns = smallFns; smallFns = []; for (const f of fns) f(); }));
  const whenSmall = f => { if (smallP) smallP.then(f); else smallFns.push(f); };
  // the sprite of a small thing: its own (cut out of the photo), or the model of its type; null = the pin
  const spriteOf = o => sprites && o.id != null ? sprites.ids[o.id] || sprites.types[sprites.models[o.id]] || null : null;
  let kamenyP = null;
  const loadKameny = init => fetchData(`${base}data/kameny.json`, init).then(r => r.json()).then(d => { D.kameny = (d.places || []).filter(itemInMap); D.updated.kameny = d.updated; posKey = ''; }).catch(() => { kamenyP = null; });
  const kameny = () => (kamenyP ||= loadKameny());
  // the cultural monuments (175 KB): fetched only when their layer is switched on or a building card asks for them
  let monuments = null;
  const loadMonuments = init => (monuments ||= fetchData(`${base}data/monuments.json`, init).then(r => r.json()).then(d => { D.monuments = (d.items || []).filter(itemInMap); D.updated.monuments = d.updated; posKey = ''; }).catch(() => {}));
  watchFeed('gotobrno.json', () => loading && loadPlaces(RELOAD).then(() => { detailed = null; }));
  watchFeed('outages.json', () => loading && loadOutages(RELOAD));
  watchFeed('smallpois.json', () => smallP && loadSmall(RELOAD));
  watchFeed('kameny.json', () => kamenyP && loadKameny(RELOAD));
  watchFeed('monuments.json', () => monuments && (monuments = null, loadMonuments(RELOAD)));
  // the detail file (descriptions, opening hours, pictures, links of the places and events), merged into the same
  // objects: await it before a card or a list that shows them
  let detailed = null;
  const detail = () => (detailed ||= load().then(() => fetchData(`${base}data/gotobrno-detail.json`)).then(r => r.json()).then(d => {
    (d.places || []).forEach((x, i) => raw.places[i] && Object.assign(raw.places[i], x));
    (d.events || []).forEach((x, i) => raw.events[i] && Object.assign(raw.events[i], x));
  }).catch(() => { detailed = null; }));
  // image positions depend on the rotation: recomputed when llToImg changes
  let posKey = '';
  function positions() {
    // (the key includes the sizes: the files arrive one by one)
    const k = `${llToImg(16.6, 49.2).join(',')}|${D.places.length},${D.routes.length},${D.events.length},${D.monuments.length},${D.outages.length},${D.small.length},${D.kameny.length}`;
    if (k === posKey) return;
    posKey = k;
    for (const list of [D.places, D.events, D.monuments, D.outages, D.small, D.kameny]) for (const o of list) { [o.X, o.Y] = llToImg(o.lon, o.lat); o.hid = undefined; }
    for (const r of D.routes) for (const s of r.stops) [s.X, s.Y] = llToImg(s.lon, s.lat);
    matched = null;
  }

  // ---- one object per place: GO TO BRNO places joined to the Wikipedia name tags nearby with a similar name
  let matched = null; // { byWiki: Map(title -> place), own: [places without a Wikipedia tag] }
  function match(wikiPois) {
    if (matched && matched.src === wikiPois) return matched;
    positions();
    const byWiki = new Map(), used = new Set();
    for (const p of D.places) {
      let best = null, bs = 0;
      for (const w of wikiPois || []) {
        // the same name (Hády, Zoo Brno, Koupaliště Riviéra…): one tag even when the two sources put the
        // point some hundreds of metres apart (large areas, or a GO TO BRNO point off the building); see placeScore
        const s = placeScore(p.n, w[0], Math.hypot(w[2] - p.X, (w[3] - p.Y) * 2));
        if (s > bs) { bs = s; best = w; }
      }
      if (best && !byWiki.has(best[1])) { byWiki.set(best[1], p); used.add(p); }
    }
    matched = { src: wikiPois, byWiki, own: D.places.filter(p => !used.has(p)) };
    return matched;
  }
  // the place of a project / building by name and position
  function placeNear(lon, lat, name, maxM = 80) {
    let best = null, bs = 0;
    const nw = words(name);
    for (const p of D.places) {
      const d = Math.hypot((p.lon - lon) * 72765, (p.lat - lat) * 111200);
      if (d > maxM) continue;
      const pw = words(p.n);
      const common = nw.length ? pw.filter(x => nw.some(y => y.startsWith(x.slice(0, 5)) || x.startsWith(y.slice(0, 5)))).length : 0;
      const score = (common ? 1 + common : 0) - d / maxM;
      if (score > bs) { bs = score; best = p; }
    }
    return bs >= 1 ? best : null;
  }

  // ---- monuments: the one inside the building's footprints (ground outlines, image px) or the nearest one within 20 m
  function monumentFor(footprints, lon, lat) {
    positions();
    const inPoly = (p, x, y) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    let near = null, nd = 20;
    for (const m of D.monuments) {
      if (footprints && footprints.some(p => inPoly(p, m.X, m.Y))) return m;
      const d = Math.hypot((m.lon - lon) * 72765, (m.lat - lat) * 111200);
      if (d < nd) { nd = d; near = m; }
    }
    return near;
  }

  // ---- what is valid / on
  // (not a moved stop, Z, and not a notice about the whole network, D: those keep the small sign)
  const newOutage = o => o.type !== 'Z' && o.type !== 'D' && !!o.from && Date.now() - o.from < 7 * 864e5;
  const outagesNow = () => D.outages.filter(o => (!o.from || o.from <= Date.now()) && (!o.to || o.to > Date.now()));
  const outagesForLine = line => raw.outages.filter(o => (!o.from || o.from <= Date.now()) && (!o.to || o.to > Date.now()) && o.lines.includes(String(line))); // (all of them, see raw above)
  // every closure valid some time today: also one that begins later in the day and one whose point lies out of town
  // (raw), for the lines that run differently today in Dnes v Brně (main.js, zprLinky)
  const outagesToday = () => { const end = new Date(); end.setHours(24, 0, 0, 0); return raw.outages.filter(o => (!o.from || o.from < +end) && (!o.to || o.to > Date.now())); };
  const outagesNear = (lon, lat, lines, m = 400) => outagesNow().filter(o => Math.hypot((o.lon - lon) * 72765, (o.lat - lat) * 111200) < m && (!lines || !lines.length || o.lines.some(l => lines.includes(l))));
  // range: any combination of three parts of time as letters, 't' the events on today, 'w' those that start later
  // within seven days, 'l' those that start after that ("tw", "l", "twl" …); the older names 'today', 'week' and 'all'
  // mean "t", "tw" and "twl"
  // (asked at every frame by the icons and the people: kept until the day, the list of events or the question changes;
  // the callers only read the list)
  const evMemo = new Map();
  function eventsIn(range, cat) {
    const t0 = dayStart(), key = `${range}|${cat || ''}`, m = evMemo.get(key);
    if (m && m.t0 === t0 && m.src === D.events && m.n === D.events.length) return m.out;
    const out = eventsInFresh(range, cat, t0);
    evMemo.set(key, { t0, src: D.events, n: D.events.length, out });
    return out;
  }
  function eventsInFresh(range, cat, t0) {
    const parts = { today: 't', week: 'tw', all: 'twl' }[range] || range || 'tw';
    const tT = t0 + 864e5, tW = t0 + 7 * 864e5;
    // (the dates come as midnight UTC, 1:00 or 2:00 here: the last day of an event is over at the local midnight after it,
    // otherwise yesterday's one-day events would still be in the map for an hour or two — and all day in the icon layer)
    return D.events.filter(e => dayStart(e.to || e.from) + 864e5 > t0 && (!cat || e.cats.includes(cat)) && parts.includes(e.from < tT ? 't' : e.from < tW ? 'w' : 'l'));
  }
  const categories = () => [...new Set(D.events.flatMap(e => e.cats))].sort((a, b) => a.localeCompare(b, 'cs'));

  // ---- drawing (in the icon layer, above labels and buildings)
  let hits = [];
  const route = { r: null, i: -1 };
  const inView = (ctx, x, y, m = 30) => onScreen(ctx, x, y, m);
  // colour and glyph of the pin of each kind of small thing (viewpoints: yellow triangle)
  const SMALL_PIN = { fountain: ['#7fc8f0', '💧'], pool: ['#4fa3e0', '≈'], art: ['#e3c48f', '🗿'], cross: ['#d9d4c7', '✝'], plaque: ['#c9a36a', '▭'] };
  function pin(ctx, x, y, fill, glyph, s = 1) {
    const r = Math.round(7 * s);
    if (ctx.__claim && !ctx.__claim(x - r - 2, y - 2 * r - 2, x + r + 2, y + 4)) return null; // another icon is here: counted in its cluster
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - r + 2, y - 2 * r + 2, 2 * r, 2 * r);
    ctx.fillStyle = '#161d2b'; ctx.fillRect(x - r - 1, y - 2 * r - 1, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = fill; ctx.fillRect(x - r, y - 2 * r, 2 * r, 2 * r);
    ctx.fillStyle = '#161d2b'; ctx.fillRect(x - 1, y, 2, 3);
    ctx.font = `400 ${Math.round(14 * s)}px "VT323", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x, y - r + 1);
    return [x - r - 2, y - 2 * r - 2, x + r + 2, y + 4];
  }
  // an event: a leaf of a tear-off calendar (holes along the top, pink header, the day of the event on it),
  // one person standing on its left and two on its right (the same figures as in the legend)
  const EVENT_PEOPLE = [[-9, '#5a3b22', '#f0c8a0', '#f3c868', '#384563', 1], [21, '#2b2118', '#c68642', '#5fb3e6', '#4b3b2a', -1], [28, '#d9c38a', '#e0ac7a', '#e58ac9', '#384563', 1]];
  // (s: the scale of a highlighted leaf from the Aktuálně panel — half again as big, never clustered, with a pulsing ring)
  function calendarLeaf(ctx, x, y, day, s = 1, t = 0, seed = 0) {
    const box = [x - 19 * s, y - 24 * s, x + 26 * s, y + 2];
    if (ctx.__claim && !ctx.__claim(...box)) return null; // (highlighted leaves still fold into clusters: far out there are hundreds in the centre)
    if (s > 1) {
      // highlighted: pink ripples spread over the ground from the leaf, and the leaf hops
      const hop = beacon(ctx, x + 3 * s, y, t, '#e58ac9', 36, seed);
      ctx.save(); ctx.translate(x, y - hop); ctx.scale(s, s); leafBody(ctx, 0, 0, day); ctx.restore();
    } else leafBody(ctx, x, y, day);
    return box;
  }
  function leafBody(ctx, x, y, day) {
    const w = 18, h = 19, x0 = x - w / 2, y0 = y - h - 3;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x0 + 2, y0 + 2, w, h); // shadow
    ctx.fillStyle = '#161d2b'; ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2); ctx.fillRect(x - 1, y0 + h, 2, 3); // outline and the stub to the ground
    ctx.fillStyle = '#f0f2ea'; ctx.fillRect(x0, y0, w, h); // the leaf
    ctx.fillStyle = '#e58ac9'; ctx.fillRect(x0, y0, w, 6); // the header
    ctx.fillStyle = '#161d2b'; for (const dx of [4, 9, 14]) ctx.fillRect(x0 + dx - 1, y0 + 1, 2, 2); // the holes of the binding
    ctx.fillStyle = '#161d2b'; ctx.fillRect(x0, y0 + 6, w, 1); // the tear line under the header
    ctx.font = '400 13px "VT323", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(day), x, y0 + 13);
    // the people: 6 × 14 px each (hair, face, shirt, a stepping pair of legs), feet level with the bottom of the leaf
    const g = y0 + h + 1;
    if (lite()) return; // (a slow device: the leaf without the three people, 18 rectangles fewer)
    for (const [dx, hair, skin, shirt, legs, face] of EVENT_PEOPLE) {
      const fx = x0 + dx, top = g - 14;
      ctx.fillStyle = skin; ctx.fillRect(fx + 2, top, 2, 4);
      ctx.fillStyle = hair; ctx.fillRect(fx + 2, top, 2, 2); ctx.fillRect(fx + (face > 0 ? 4 : 0), top, 2, 2);
      ctx.fillStyle = shirt; ctx.fillRect(fx, top + 4, 6, 6);
      ctx.fillStyle = legs;
      if (face > 0) { ctx.fillRect(fx, top + 10, 2, 4); ctx.fillRect(fx + 4, top + 12, 2, 2); } else { ctx.fillRect(fx, top + 12, 2, 2); ctx.fillRect(fx + 4, top + 10, 2, 4); }
    }
  }
  // Kámen zmizelých: a brass cube set in the pavement (10 × 10 cm), seen from above like the map; drawn much bigger than
  // life so it can be found. One cube per stone of the place up to four (two side by side, three, 2 × 2 like the stones
  // in front of a house), a place with more stones has the number beside them. s: the scale of the map (sc).
  // Returns the box of the drawing, null when another icon is already here (counted in its cluster).
  const BRASS = { top: '#d9a93a', lit: '#f6dc8a', left: '#8a6420', right: '#a87a26', cut: '#9a7428' };
  // A thing standing behind a building: drawn whole, then hatched with dark diagonal lines over its own pixels and a
  // little see-through, so it reads as "hidden" and stays easy to make out. draw(c) paints it into a scratch canvas at
  // the same screen coordinates; box: where it lies.
  // key: what the drawing depends on besides its place (the sprite and its size, the kind and size of the plaque, the
  // number and size of the stones). Every drawing here is the same shape wherever it stands (whole pixels), so the
  // hatched picture is made once per key and then only copied (it was drawn, hatched and copied for every hidden
  // statue at every frame, the costliest part of the icons close up). Without a key: drawn each time, as before.
  let scratch = null;
  const hatchCache = new Map(), HATCH_MAX = 400;
  if (document.fonts) document.fonts.ready.then(() => hatchCache.clear()); // (the number beside the stones: in the pixel font, not the stand-in)
  function hatched(ctx, box, draw, key = null) {
    const x0 = Math.floor(box[0]) - 2, y0 = Math.floor(box[1]) - 2, w = Math.ceil(box[2]) - x0 + 3, h = Math.ceil(box[3]) - y0 + 3;
    if (w <= 0 || h <= 0) return;
    const k = key && `${key}|${w}x${h}|${box[0] - Math.floor(box[0])},${box[1] - Math.floor(box[1])}`;
    let img = k ? hatchCache.get(k) : null;
    if (!img) {
      if (k) { img = document.createElement('canvas'); img.width = w; img.height = h; } else {
        if (!scratch) { scratch = document.createElement('canvas'); scratch.width = scratch.height = 128; }
        if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(scratch.width, w); scratch.height = Math.max(scratch.height, h); }
        img = scratch;
      }
      const s = img.getContext('2d');
      s.setTransform(1, 0, 0, 1, 0, 0); s.globalCompositeOperation = 'source-over'; s.globalAlpha = 1; s.clearRect(0, 0, w, h);
      s.imageSmoothingEnabled = false;
      s.setTransform(1, 0, 0, 1, -x0, -y0); draw(s); s.setTransform(1, 0, 0, 1, 0, 0);
      s.globalCompositeOperation = 'source-atop'; s.fillStyle = s.createPattern(hatchTile(), 'repeat'); s.fillRect(0, 0, w, h); // (src/hatch.js)
      s.globalCompositeOperation = 'source-over';
      if (k) { if (hatchCache.size >= HATCH_MAX) hatchCache.clear(); hatchCache.set(k, img); }
    }
    const a = ctx.globalAlpha; ctx.globalAlpha = a * 0.8;
    ctx.drawImage(img, 0, 0, w, h, x0, y0, w, h);
    ctx.globalAlpha = a;
  }
  const PLAQUE = { plate: '#8c6b3f', low: '#5b4327', gold: '#e2b84a' };
  function plaqueBox(x, y, s) { const W = Math.max(10, Math.round(24 * s)), H = Math.max(8, Math.round(18 * s)); return [x - (W >> 1), y - H + 2, x - (W >> 1) + W, y + 2]; }
  function plaque(c, box) {
    const [x0, y0, x1, y1] = box, W = x1 - x0, H = y1 - y0, o = W >= 16 ? 2 : 1;
    c.fillStyle = '#161d2b'; c.fillRect(x0, y0, W, H);
    c.fillStyle = PLAQUE.plate; c.fillRect(x0 + o, y0 + o, W - 2 * o, H - 2 * o);
    const lh = Math.max(1, Math.round(H / 9));
    c.fillStyle = PLAQUE.low; c.fillRect(x0 + o, y1 - o - lh, W - 2 * o, lh);
    c.fillStyle = PLAQUE.gold; // three engraved lines of a text, of uneven length
    const ix = x0 + o + Math.max(1, Math.round(W / 12)), iw = W - 2 * o;
    [[2, 0.62], [4, 0.52], [6, 0.62]].forEach(([row, len]) => c.fillRect(ix, Math.round(y0 + (row * H) / 9), Math.max(2, Math.round(iw * len)), lh));
  }
  const isPlaqueModel = o => o.k === 'plaque' && !(sprites && o.id != null && sprites.ids[o.id]); // (no photo of its own)
  // A statue or memorial on a wall (a relief, a plaquette, a coat of arms among the statues, without a photo of its own):
  // a light stone panel with a bust standing out of it, so it is not taken for a memorial plaque (brown, gold lines).
  // Mosaics, decorative walls and grilles keep their coloured model.
  const RELIEF = { panel: '#d8d2c2', shade: '#a79f8c', lit: '#efe9dc', bust: '#b9b09b' };
  const isReliefModel = o => o.k === 'art' && sprites && o.id != null && !sprites.ids[o.id] && ['plaque', 'wall'].includes(sprites.models[o.id]) && !/mozaik|stěn|mříž/i.test(o.t || '');
  function reliefBox(x, y, s) { const W = Math.max(10, Math.round(20 * s)), H = Math.max(10, Math.round(22 * s)); return [x - (W >> 1), y - H + 2, x - (W >> 1) + W, y + 2]; }
  function relief(c, box) {
    const [x0, y0, x1, y1] = box, W = x1 - x0, H = y1 - y0, o = W >= 16 ? 2 : 1, u = Math.max(1, Math.round(W / 20));
    c.fillStyle = '#161d2b'; c.fillRect(x0, y0, W, H);
    c.fillStyle = RELIEF.panel; c.fillRect(x0 + o, y0 + o, W - 2 * o, H - 2 * o);
    c.fillStyle = RELIEF.shade; c.fillRect(x0 + o, y1 - o - u, W - 2 * o, u); c.fillRect(x1 - o - u, y0 + o, u, H - 2 * o); // the frame in shadow
    c.fillStyle = RELIEF.lit; c.fillRect(x0 + o, y0 + o, W - 2 * o, u); // and in light
    // the bust: a round head, a neck, stepped shoulders, standing out of the panel (lit from the upper left)
    const cx = Math.round((x0 + x1) / 2), hr = Math.max(2, Math.round(W * 0.15)), hy = y0 + o + Math.round(H * 0.16);
    const nh = Math.max(1, Math.round(H * 0.07)), sy = hy + 2 * hr + nh, sw1 = Math.round(W * 0.42), sw2 = Math.round(W * 0.62), by = y1 - o - 2 * u;
    const bust = (dx, fill) => {
      c.fillStyle = fill;
      c.fillRect(cx - hr + dx + 1, hy + dx, 2 * hr - 2, 2 * hr); c.fillRect(cx - hr + dx, hy + dx + 1, 2 * hr, 2 * hr - 2); // the head, corners cut
      c.fillRect(cx - (hr >> 1) + dx, hy + 2 * hr + dx, hr, nh); // the neck
      c.fillRect(cx - (sw1 >> 1) + dx, sy + dx, sw1, u + 1); c.fillRect(cx - (sw2 >> 1) + dx, sy + u + 1 + dx, sw2, by - sy - u - 1); // the shoulders
    };
    bust(u, RELIEF.shade); bust(0, RELIEF.bust);
    c.fillStyle = RELIEF.lit; c.fillRect(cx - hr, hy + 1, u, 2 * hr - 2); c.fillRect(cx - (sw2 >> 1), sy + u + 1, u, Math.max(1, by - sy - u - 1)); // the lit edges
  }
  // (under: drawn after the place is claimed and before the cubes, e.g. the beacon of a highlighted theme)
  function stolper(ctx, x, y, n, s, ghost = false, under = null) {
    // (as strong as the plaque of the memorial plaques, 24 × 18 px: one cube about as wide, several a little smaller each)
    const w = Math.max(5, Math.round((n === 1 ? 11 : n === 2 ? 9 : 8) * s)), h = Math.ceil(w / 2), d = Math.max(3, Math.round(4 * s)), gap = 1;
    const cells = [[0, 0], [1, 0], [0, 1], [1, 1]].slice(0, Math.min(n, 4)); // (i, j) on the grid of the pavement
    const ci = cells.reduce((a, c) => a + c[0], 0) / cells.length, cj = cells.reduce((a, c) => a + c[1], 0) / cells.length;
    const pts = cells.map(([i, j]) => [Math.round(x + (i - ci - (j - cj)) * (w + gap)), Math.round(y + (i - ci + (j - cj)) * (h + gap / 2))]);
    const label = n > 4 ? String(n) : '';
    const x0 = Math.min(...pts.map(p => p[0])) - w - 2, x1 = Math.max(...pts.map(p => p[0])) + w + 2 + (label ? 6 + 7 * label.length : 0);
    const y0 = Math.min(...pts.map(p => p[1])) - h - 2, y1 = Math.max(...pts.map(p => p[1])) + h + d + 2;
    if (ctx.__claim && !ctx.__claim(x0, y0, x1, y1)) return null;
    if (under) under();
    if (!ghost) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x + 2, y + d + 1, (x1 - x0) / 2 - (label ? 4 : 0), Math.max(2, (y1 - y0) / 3), 0, 0, Math.PI * 2); ctx.fill(); }
    pts.sort((p, q) => p[1] - q[1]); // the back ones first
    // behind a building: hatched (no shadow); else straight on the map
    if (ghost) hatched(ctx, [x0, y0, x1, y1], c => cubes(c, pts, w, h, d, label, y), `st|${n}|${w}|${d}|${x - x0},${y - y0}`);
    else cubes(ctx, pts, w, h, d, label, y);
    return [x0, y0, x1, y1];
  }
  function cubes(ctx, pts, w, h, d, label, y) {
    const poly = (fill, ...p) => { ctx.fillStyle = fill; ctx.beginPath(); p.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill(); };
    for (const [cx, cy] of pts) {
      // the dark outline: the whole cube two pixels bigger (one when small)
      const o = w >= 8 ? 2 : 1;
      poly('#161d2b', [cx, cy - h - o], [cx + w + o, cy], [cx + w + o, cy + d], [cx, cy + h + d + o], [cx - w - o, cy + d], [cx - w - o, cy]);
      poly(BRASS.left, [cx - w, cy], [cx, cy + h], [cx, cy + h + d], [cx - w, cy + d]);
      poly(BRASS.right, [cx, cy + h], [cx + w, cy], [cx + w, cy + d], [cx, cy + h + d]);
      poly(BRASS.top, [cx, cy - h], [cx + w, cy], [cx, cy + h], [cx - w, cy]);
      poly(BRASS.lit, [cx, cy - h], [cx + w, cy], [cx + w - 2, cy], [cx, cy - h + 1]); // the light catches the far edge
      if (w >= 7) { // the engraved lines of the name, along the diamond
        const L = Math.max(3, Math.round(w * 0.55));
        ctx.fillStyle = BRASS.cut; for (let k = -1; k <= 1; k++) ctx.fillRect(Math.round(cx - L / 2 + k * w * 0.22), Math.round(cy - 1 + k * h * 0.4), L, w >= 10 ? 2 : 1);
      }
    }
    if (label) {
      const lx = Math.max(...pts.map(p => p[0])) + w + 4, ly = y;
      ctx.font = '400 15px "VT323", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = '#161d2b'; ctx.strokeText(label, lx, ly); ctx.fillStyle = BRASS.lit; ctx.fillText(label, lx, ly);
    }
  }
  // focus: the theme chosen in the Aktuálně panel ('events': the event leaves are bigger, at any zoom; the other icons dimmed)
  function draw(ctx, v, t, layers, focus = null, eventsRange = 'week') {
    hits = [];
    const dim = focus ? 0.3 : 1; // (a highlighted kind, main.js FOCUS_KINDS: everything else fades)
    ctx.globalAlpha = dim;
    if (!D.places.length) { load(); return; }
    if (v.z >= SMALL_Z / 1.7) loadSmallAll(); // (the small things come a zoom step before they are drawn)
    // (the stones come and go at the same zoom as the statues and plaques, SMALL_Z; a highlighted theme ("Ukázat
    // všechny" in a card, focus) is drawn at any zoom, with a beacon under each place)
    // (the small things that can be highlighted, with the colour of their beacon)
    const SMALL_HL = { plaque: '#c9a36a', art: '#e3c48f', cross: '#d9d4c7', tree: '#7fbf4a', fountain: '#7fc8f0', view: '#f3c868', pool: '#4fa3e0' };
    const stHl = focus === 'kameny', smHl = SMALL_HL[focus] ? focus : null, plHl = !!smHl;
    if ((layers.smStolper && v.z >= SMALL_Z / 1.7) || stHl) kameny();
    if (plHl) loadSmallAll();
    positions();
    const S = (o) => [Math.round(v.ox + o.X * v.k), Math.round(v.oy + o.Y * v.k)];
    // (monuments are drawn by the page as outlines of their buildings, see drawMonuments in main.js)
    // small things: memorial trees, fountains, viewpoints, pools, statues and memorials, crosses, plaques — only from 0.3 m per pixel
    // Kameny zmizelých first: they lie in the pavement under the plaques on the walls, and a cluster should not swallow them
    if ((layers.smStolper && v.z >= SMALL_Z) || stHl) {
      const near = v.z >= SMALL_Z, sc = near ? Math.min(1.6, Math.max(0.85, v.z * 0.25)) : 0.6;
      if (stHl) { ctx.globalAlpha = 1; ctx.__hl = true; }
      for (const o of D.kameny) {
        const [x, y] = S(o); if (!inView(ctx, x, y)) continue;
        if (near && !stHl && o.hid === undefined) { const hb = hiddenBehind(o.X, o.Y); if (hb !== null) o.hid = hb; }
        const box = stolper(ctx, x, y, o.stones.length, sc, near && !stHl && o.hid, stHl ? () => beacon(ctx, x, y, t, '#d9a93a', near ? 26 : 18, Math.round(o.X + o.Y)) : null);
        if (box) hits.push([...box, { kind: 'kamen', o }]);
      }
      ctx.globalAlpha = dim; ctx.__hl = false;
    }
    if (v.z >= SMALL_Z || plHl) {
      const near = v.z >= SMALL_Z;
      const on = { tree: layers.smTree, fountain: layers.pitka, view: layers.smView, pool: layers.smPool, art: layers.smArt, cross: layers.smCross, plaque: layers.smPlaque };
      if (smHl) on[smHl] = true;
      const hlCol = smHl ? SMALL_HL[smHl] : '';
      // everything is drawn to the scale of the map like the buildings, a quarter bigger than life (a sprite of
      // 40 px stands for an object of about 6.5 m): 0.25 × pixels per metre; never under 0.3 and never over 1.6
      // (close up the pixel art would fall apart)
      const sc = Math.min(1.6, Math.max(plHl ? 0.6 : 0.3, v.z * 0.25));
      for (const o of D.small) {
        if (!on[o.k] || o.dup) continue;
        const hl = o.k === smHl;
        if (!near && !hl) continue; // (further out only the highlighted plaques)
        const [x, y] = S(o); if (!inView(ctx, x, y)) continue;
        ctx.globalAlpha = hl ? 1 : dim; ctx.__hl = hl;
        let box;
        if (o.k === 'tree' && ctx.__claim && !ctx.__claim(x - 12 * sc, y - 30 * sc, x + 12 * sc, y + 2)) continue;
        if (o.k === 'tree') {
          // a big old tree
          const r = v => Math.round(v * sc);
          if (hl) beacon(ctx, x, y, t, hlCol, near ? 24 : 16, Math.round(o.X + o.Y));
          ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x + r(4), y, r(10), Math.max(2, r(4)), 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#5a3b22'; ctx.fillRect(x - r(2), y - r(10), Math.max(2, r(4)), r(10));
          ctx.fillStyle = '#161d2b'; ctx.beginPath(); ctx.arc(x, y - r(18), r(11), 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3f7a2c'; ctx.beginPath(); ctx.arc(x, y - r(18), r(10), 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#5e9a3a'; ctx.beginPath(); ctx.arc(x - r(3), y - r(21), r(5), 0, Math.PI * 2); ctx.fill();
          // no name tag (the name is in the card after a click)
          box = [x - r(12), y - r(30), x + r(12), y + 2];
        } else {
          const sp = spriteOf(o);
          const flat = isPlaqueModel(o) ? [plaqueBox, plaque] : isReliefModel(o) ? [reliefBox, relief] : null;
          if (flat) {
            // a memorial plaque, or a relief on a wall, without a photo of its own: drawn here (thin outline)
            const [boxOf, paint] = flat, b = boxOf(x, y, Math.max(sc, 0.5));
            if (ctx.__claim && !ctx.__claim(...b)) continue;
            if (hl) beacon(ctx, x, y, t, hlCol, near ? 24 : 16, Math.round(o.X + o.Y));
            else if (o.hid === undefined) { const hb = hiddenBehind(o.X, o.Y); if (hb !== null) o.hid = hb; }
            if (o.hid && !hl) hatched(ctx, b, c => paint(c, b), `${paint === plaque ? 'pl' : 'rl'}|${b[2] - b[0]}x${b[3] - b[1]}`);
            else { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 1, Math.max(4, (b[2] - b[0]) * 0.55), Math.max(2, 3 * sc), 0, 0, Math.PI * 2); ctx.fill(); paint(ctx, b); }
            box = b;
          } else if (sp) {
            // the object itself, standing on its point (a statue cut out of the photo, or the model of its type)
            const [sx, sy, sw, sh] = sp, w = Math.round(sw * sc), h = Math.round(sh * sc), x0 = x - (w >> 1), y0 = y - h + 2;
            if (ctx.__claim && !ctx.__claim(x0, y0, x0 + w, y + 2)) continue;
            if (hl) beacon(ctx, x, y, t, hlCol, near ? 24 : 16, Math.round(o.X + o.Y));
            else if (o.hid === undefined) { const hb = hiddenBehind(o.X, o.Y); if (hb !== null) o.hid = hb; } // (null: chunks still loading, asked again next time)
            const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
            if (o.hid && !hl) hatched(ctx, [x0, y0, x0 + w, y0 + h], c => c.drawImage(sprites.im, sx, sy, sw, sh, x0, y0, w, h), `sp|${sx},${sy},${sw},${sh}|${w}x${h}`); // behind a building: hatched, no shadow
            else {
              ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 1, Math.max(4, w * 0.55), Math.max(2, 3 * sc), 0, 0, Math.PI * 2); ctx.fill();
              ctx.drawImage(sprites.im, sx, sy, sw, sh, x0, y0, w, h);
            }
            ctx.imageSmoothingEnabled = sm;
            box = [x0, y0, x0 + w, y + 2];
          } else {
            box = pin(ctx, x, y, SMALL_PIN[o.k] ? SMALL_PIN[o.k][0] : '#f3c868', SMALL_PIN[o.k] ? SMALL_PIN[o.k][1] : '▲', 0.85 * sc);
            if (box && hl) beacon(ctx, x, y, t, hlCol, near ? 24 : 16, Math.round(o.X + o.Y));
          }
        }
        if (box) hits.push([...box, { kind: 'small', o }]);
      }
      ctx.globalAlpha = dim; ctx.__hl = false;
    }
    if ((layers.mhdOutages || layers.mhd || layers.mhdStops) && v.z >= TXT_Z) {
      for (const o of outagesNow()) {
        if (!newOutage(o) || !(layers.mhdOutages || o.lines.some(l => /^(N?\d{1,2}|P\d|E\d+|x\d{1,2}|š\d+)$/.test(l)))) continue;
        const [x, y] = S(o); if (!inView(ctx, x, y)) continue;
        const bx = pin(ctx, x, y, '#f08a3c', '!', 1.4); if (bx) hits.push([...bx, { kind: 'outage', o }]);
      }
    }
    // events today, this week or all coming (the range of the layer): a calendar leaf at the venue
    const evHl = focus === 'events';
    if (layers.events && (v.z >= TXT_Z || evHl)) {
      ctx.globalAlpha = evHl ? 1 : dim;
      for (const e of eventsIn(eventsRange)) {
        if (e.X == null) continue;
        const [x, y] = S(e); if (!inView(ctx, x, y)) continue;
        // the day on the leaf: the first day of the event, or today while it is running
        const bx = calendarLeaf(ctx, x, y, new Date(Math.max(e.from, dayStart())).getDate(), evHl ? 1.5 : 1, t, Math.round(e.X + e.Y)); if (bx) hits.push([...bx, { kind: 'event', o: e }]);
      }
      ctx.globalAlpha = dim;
    }
    // public transport closures valid now (layer "výluky" of the MHD group): the older ones (the new ones are above)
    if (layers.mhdOutages && v.z >= TXT_Z) {
      for (const o of outagesNow()) {
        if (newOutage(o)) continue;
        const [x, y] = S(o); if (!inView(ctx, x, y)) continue;
        const bx = pin(ctx, x, y, '#f08a3c', '!', 0.8); if (bx) hits.push([...bx, { kind: 'outage', o }]);
      }
    }
    // the chosen themed route: a line through its stops and numbered stops
    if (route.r) {
      const st = route.r.stops;
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const path = () => { ctx.beginPath(); st.forEach((s, i) => { const [x, y] = S(s); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
      path(); ctx.strokeStyle = 'rgba(22,29,43,.85)'; ctx.lineWidth = 6; ctx.stroke();
      path(); ctx.strokeStyle = '#e58ac9'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      st.forEach((s, i) => {
        const [x, y] = S(s); if (!inView(ctx, x, y)) return;
        const r = i === route.i ? 12 : 9;
        ctx.fillStyle = '#161d2b'; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = i === route.i ? '#f3c868' : '#e58ac9'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#161d2b'; ctx.font = '400 15px "VT323", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y + 1);
        hits.push([x - r, y - r, x + r, y + r, { kind: 'routeStop', r: route.r, i }]);
      });
    }
    ctx.globalAlpha = 1;
  }
  const at = (sx, sy) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]) return h[4]; } return null; };
  return {
    // (forgetHidden: the houses changed, Klidná mapa on or off; whether a thing stands behind a house is asked again)
    forgetHidden: () => { posKey = ''; },
    load, loadSmall: loadSmallAll, kameny, whenSmall, loadMonuments, detail, draw, at, match, positions, placeNear, monumentFor, outagesNow, outagesForLine, outagesToday, outagesNear, eventsIn, categories,
    data: D, setRoute: (r, i = -1) => { route.r = r; route.i = i; }, route: () => route,
  };
}

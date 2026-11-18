// Everything drawn over the map tiles: district labels, clouds, night lights,
// weather, traffic, chimney smoke, highlighted buildings and place pins.
import { carBatch, pickKind, CAR_COLORS, VAN_COLORS, TRUCK_CABS } from './vehicles.js';

// bleed: the canvas reaches this many px beyond the map on every side (phones, see the frame loop in main.js): between
// two drawings it is shifted along with the tiles, and the margin covers the edge the map moves towards. (0, 0) of the
// drawing stays the corner of the map; cw × ch is the map, not the canvas.
export function createFx({ canvas, pins, viewer, GEO, state, data, bleed = 0 }) {
  const ctx = canvas.getContext('2d');
  const S = GEO.A * 2; // sizes below were tuned at 2 m per image pixel
  let dpr = 1, cw = 0, ch = 0;
  // lite: a slow device (set by the page from the time a drawing takes): the costliest things are left out, see drawClouds,
  // drawTraffic, drawSmoke and drawStreetNames here, the people, the vehicles and the sprites of the city in their modules
  const fx = { hover: null, selected: null, pieces: b => [b], bleed, lite: false }; // pieces: every outline of a building (set by the page)
  let night = 0, weather = 'clear', season = 'summer', dm = false; // dm: a datová mapa is on (the map goes grey)
  let fv = false; // fv: a kind of places is highlighted from a card ("Ukázat všechny"): the city steps back a little (gentler since 2026-11-13: the veil .44 -> .22, the colour .35 -> .6)

  if (bleed) { canvas.style.inset = `-${bleed}px`; canvas.style.width = `calc(100% + ${2 * bleed}px)`; canvas.style.height = `calc(100% + ${2 * bleed}px)`; }
  function resize() {
    dpr = Math.min(fx.lite ? 1 : 2, window.devicePixelRatio || 1); // (a slow device: the overlay at 1 px per CSS px, fewer pixels to fill)
    cw = canvas.clientWidth - 2 * bleed; ch = canvas.clientHeight - 2 * bleed;
    canvas.width = Math.round((cw + 2 * bleed) * dpr); canvas.height = Math.round((ch + 2 * bleed) * dpr);
  }
  resize();
  addEventListener('resize', resize);
  const base = () => ctx.setTransform(dpr, 0, 0, dpr, bleed * dpr, bleed * dpr); // the drawing's coordinates: CSS px from the corner of the map
  fx.prof = {}; fx.profOn = false;
  const T = (name, f) => { if (!fx.profOn) { f(); return; } const t0 = performance.now(); f(); fx.prof[name] = (fx.prof[name] || 0) + performance.now() - t0; };
  fx.T = T;
  const full = () => ctx.fillRect(-bleed, -bleed, cw + 2 * bleed, ch + 2 * bleed); // a fill of the whole canvas, margin and all
  // the canvas and the pins moved by (dx, dy) screen px without drawing (the page shifts them with the tiles between two drawings)
  fx.shift = (dx, dy) => { const tr = dx || dy ? `translate(${dx}px, ${dy}px)` : ''; canvas.style.transform = tr; pins.style.transform = tr; };

  // ---------------------------------------------------------- seeded noise
  let seed = 99;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  // ---------------------------------------------------------- clouds: fluffy cumulus high above the map, with shadows
  // Each cloud is a pixel-art sprite built from overlapping puffs, lit from the upper left,
  // with a flat grey base; its shadow falls on the ground far below.
  function cloudSprite(w, h) {
    const puffs = [];
    const base = h * 0.66;
    const n = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) puffs.push([w * (0.14 + (0.72 * i) / (n - 1)) + (rnd() - 0.5) * 3, base - rnd() * 2, h * (0.24 + rnd() * 0.12)]);
    const m = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < m; i++) puffs.push([w * (0.3 + rnd() * 0.4), h * (0.36 + rnd() * 0.12), h * (0.3 + rnd() * 0.14)]);
    const flatY = Math.round(h * 0.84);
    const inside = (x, y) => y <= flatY && puffs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const cloud = mk(), shadow = mk();
    const g = cloud.getContext('2d'), gs = shadow.getContext('2d');
    gs.fillStyle = 'rgba(16,24,44,1)';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      gs.fillRect(x, y, 1, 1);
      // light from the nearest puff's surface normal
      let best = null, bd = Infinity;
      for (const p of puffs) { const d = Math.hypot(x + 0.5 - p[0], y + 0.5 - p[1]) - p[2]; if (Math.abs(d) < bd) { bd = Math.abs(d); best = p; } }
      const nx = (x + 0.5 - best[0]) / best[2], ny = (y + 0.5 - best[1]) / best[2];
      const lit = -0.55 * nx - 0.83 * ny + (y < flatY - 2 ? 0 : -0.6);
      const edge = !inside(x - 0.5, y + 0.5) || !inside(x + 1.5, y + 0.5) || !inside(x + 0.5, y - 0.5);
      g.fillStyle = lit > 0.5 ? '#ffffff' : lit > 0.05 ? '#f1f4f8' : lit > -0.35 ? '#dde4ec' : '#c3cdd9';
      g.globalAlpha = edge ? 0.85 : 1;
      g.fillRect(x, y, 1, 1);
    }
    return { cloud, shadow };
  }
  const clouds = [];
  for (let i = 0; i < 28; i++) {
    clouds.push({
      X: rnd() * GEO.W * 1.15 - GEO.W * 0.05,
      Y: rnd() * GEO.H * 0.95,
      v: (7 + rnd() * 9) * GEO.A * 2,
      alt: 1400 + rnd() * 800, // metres above the ground
      ...cloudSprite(34 + Math.floor(rnd() * 26), 16 + Math.floor(rnd() * 8)),
    });
  }

  // ---------------------------------------------------------- night lights (prepared once in image space / 8)
  const LS = 8 * S;
  const lightCanvas = document.createElement('canvas');
  const litMask = document.createElement('canvas'); // where it is lit: soft, strong alpha (built from the light map)
  const nightCanvas = document.createElement('canvas'); // the night veil, with holes where it is lit
  let litStamp = 0, nightKey = ''; // the veil is rebuilt only when the view, the size or the darkness changes
  function buildLitMask() {
    const W = lightCanvas.width, H = lightCanvas.height;
    litMask.width = W; litMask.height = H;
    const m = litMask.getContext('2d');
    const small = document.createElement('canvas'); small.width = Math.ceil(W / 3); small.height = Math.ceil(H / 3);
    const sg = small.getContext('2d'); sg.imageSmoothingEnabled = true;
    // several passes: the scattered lights of windows and lamps join into lit streets and quarters
    sg.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) sg.drawImage(lightCanvas, 0, 0, small.width, small.height);
    m.imageSmoothingEnabled = true;
    m.globalCompositeOperation = 'lighter';
    m.drawImage(small, 0, 0, W, H);
    m.globalAlpha = 0.5; m.drawImage(lightCanvas, 0, 0); // the lit streets themselves a little more
    litStamp++;
  }
  fx.prepareLights = () => {
    const L = data.lights;
    // (lights.json can be here while its values are still being decoded from lights.webp: atob(undefined) would throw
    // and stop whoever called this; fx.needLights calls again once the values are in)
    if (!L || !(L.raw || L.d)) return;
    lightCanvas.width = Math.ceil(GEO.W / LS); lightCanvas.height = Math.ceil(GEO.H / LS);
    const g = lightCanvas.getContext('2d');
    const raw = L.raw || Uint8Array.from(atob(L.d), ch => ch.charCodeAt(0)); // (lights.png decoded by the page, or the older base64)
    const cs = L.cell / LS;
    seed = 7;
    // street lamps along main roads
    g.strokeStyle = 'rgba(255,196,110,0.55)';
    g.lineWidth = 0.9;
    for (const [c, p] of data.routes) {
      if (c === 9) continue;
      g.beginPath();
      for (let i = 0; i < p.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, p[i] / LS, p[i + 1] / LS);
      g.stroke();
    }
    for (let j = 0; j < L.h; j++) for (let i = 0; i < L.w; i++) {
      const d = raw[j * L.w + i];
      if (!d) continue;
      const n = Math.ceil(d / 50);
      for (let q = 0; q < n; q++) {
        const x = (i + rnd()) * cs, y = (j + rnd()) * cs;
        const warm = rnd();
        g.fillStyle = warm < 0.7 ? `rgba(255,${200 + Math.floor(rnd() * 40)},120,${0.35 + d / 600})` : `rgba(190,215,255,${0.25 + d / 800})`;
        g.fillRect(x, y, 0.8, 0.8);
      }
    }
    buildLitMask();
  };

  // ---------------------------------------------------------- traffic
  let cars = [];
  function prepareTraffic() {
    seed = 1234;
    cars = [];
    for (const [c, p, ow] of data.routes) {
      const cum = [0];
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
      for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
      const len = cum[cum.length - 1];
      const route = { c, p, cum, len, ow: !!ow, bb: [x0 - 20, y0 - 20, x1 + 20, y1 + 20], cars: [], i: cars.length }; // (i: its index in routes.json)
      // local streets (class 0) get only an occasional car, so every street shows it is a road
      const per = (c === 9 ? 260 : c === 3 ? 40 : c === 2 ? 60 : c === 1 ? 110 : 420) * S;
      let n = Math.round(len / per);
      if (!n && c !== 9) n = c === 0 ? (rnd() < len / per ? 1 : 0) : 1;
      for (let i = 0; i < n; i++) {
        const dir = ow ? 1 : rnd() < 0.5 ? 1 : -1; // one-way streets: only the allowed way
        const col = c === 9 ? '#c8202a' : ['#c9583b', '#f0f2ea', '#3b6fb6', '#2b2f38', '#f3c868', '#9aa3ad', '#5c8f4a'][Math.floor(rnd() * 7)];
        // lorries only on motorways / the outer big roads, vans and cars everywhere
        const mx = (x0 + x1) / 2 / GEO.A - GEO.R, my = ((y0 + y1) / 2 - GEO.TOP) * 2 / GEO.A - GEO.R;
        const kind = pickKind(rnd(), c, Math.hypot(mx, my));
        const color = kind === 'van' ? VAN_COLORS[Math.floor(rnd() * VAN_COLORS.length)] : CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)];
        route.cars.push({ o: rnd() * len, s: (c === 9 ? 5 : c === 3 ? 14 : c === 0 ? 6 : 9) * S * (kind === 'truck' ? 0.75 : 1) * (0.8 + rnd() * 0.4), dir, col: color, kind, cab: TRUCK_CABS[Math.floor(rnd() * TRUCK_CABS.length)] });
      }
      cars.push(route);
    }
  }
  function along(r, s) {
    let lo = 0, hi = r.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= s) lo = m; else hi = m; }
    const seg = r.cum[hi] - r.cum[lo] || 1;
    const u = (s - r.cum[lo]) / seg;
    const ax = r.p[2 * lo], ay = r.p[2 * lo + 1], bx = r.p[2 * hi], by = r.p[2 * hi + 1];
    const dx = (bx - ax) / seg, dy = (by - ay) / seg;
    return [ax + (bx - ax) * u, ay + (by - ay) * u, dx, dy];
  }

  // ---------------------------------------------------------- weather particles
  const drops = [];
  for (let i = 0; i < 420; i++) drops.push({ x: Math.random(), y: Math.random(), z: 0.5 + Math.random() * 0.5 });

  // ---------------------------------------------------------- pins for places
  let pinEls = [];
  fx.setStories = list => {
    pinEls = list.map(s => {
      const el = document.createElement('div');
      el.className = 'pin';
      el.textContent = s.n;
      el.style.display = 'none';
      pins.append(el);
      return { el, s };
    });
  };
  // The marker of the place a card is about: shown as long as the card is open (fx.cardOpen, set by main.js), or
  // for a few seconds when there is no card. A card opened without a fresh marker (a vehicle, a building) drops it.
  let markerEl = null, markerUntil = 0, markerXY = null, markerAt = -1e9;
  fx.cardOpen = () => false;
  // ico: the icon of what is there (an svg, src/zpravy.js zprIcon: the kind of an event of the police) on a stalk above
  // the point; a marker without one drops it
  fx.marker = (X, Y, ms = 7000, ico = '') => {
    if (!markerEl) { markerEl = document.createElement('div'); markerEl.className = 'here-pin'; pins.append(markerEl); }
    if (markerEl.dataset.ico !== ico) { markerEl.dataset.ico = ico; markerEl.innerHTML = ico ? `<span class="here-ico">${ico}</span>` : ''; }
    markerXY = [X, Y]; markerAt = performance.now(); markerUntil = markerAt + ms;
  };
  fx.markerOff = () => { markerXY = null; };
  fx.markerIfNone = (X, Y) => { if (!markerXY) fx.marker(X, Y); };
  fx.cardOpened = () => { if (performance.now() - markerAt > 2000) markerXY = null; };

  // ---------------------------------------------------------- state setters
  const night0 = () => night, weather0 = () => weather;
  const WX_Z0 = 1, WX_Z1 = 2 / 0.3;
  const veilAt = z => Math.max(0, Math.min(1, Math.log(WX_Z1 / z) / Math.log(WX_Z1 / WX_Z0)));
  let wxK = 1; // (the veil of the current zoom, 0–1; the filter's tenth below)
  let wxTenth = 10;
  const osdCanvas = () => viewer.drawer && viewer.drawer.canvas && viewer.drawer.canvas.parentElement;
  function applyFilter() {
    const el = osdCanvas();
    if (!el) return;
    // (Klidná mapa, fx.plain: always a plain clear day, no light of the day, no weather, no clouds; the season,
    // the time and the weather chosen stay in the page and come back with the full map)
    const night = fx.plain ? 0 : night0(), weather = fx.plain ? 'clear' : weather0();
    const golden = Math.max(0, 1 - Math.abs(night - 0.5) * 2.2);
    const dark = Math.max(0, (night - 0.45) / 0.55);
    const fog = weather === 'fog' ? wxTenth / 10 : 0, rain = weather === 'rain' ? wxTenth / 10 : 0;
    const f = [];
    const b = 1 - 0.1 * golden - 0.14 * dark - 0.08 * rain; // night: lit places only a little darker than by day, the rest is the veil (fx.draw)
    if (b < 0.999) f.push(`brightness(${b.toFixed(3)})`);
    if (golden > 0.01) f.push(`sepia(${(0.38 * golden).toFixed(3)})`);
    const sat = 1 + 0.25 * golden - 0.25 * rain - 0.15 * fog;
    if (Math.abs(sat - 1) > 0.001) f.push(`saturate(${sat.toFixed(3)})`);
    if (fog > 0) f.push(`contrast(${(1 - 0.08 * fog).toFixed(3)})`);
    if (dm) f.push('saturate(0.2)', 'brightness(0.86)'); // the city steps back, the data shine
    if (fv) f.push('saturate(0.6)', 'brightness(0.95)'); // the houses lose their colour; the veil in fx.draw darkens them and every layer
    if (!el.style.transition) el.style.transition = 'filter .35s ease';
    el.style.filter = f.join(' ');
  }
  fx.resetTraffic = () => { cars = []; };
  fx.setNight = v => { night = v; applyFilter(); };
  fx.setWeather = w => { weather = w; applyFilter(); };
  fx.plain = false;
  fx.setPlain = on => { fx.plain = !!on; applyFilter(); };
  fx.setDatamap = on => { dm = !!on; applyFilter(); };
  fx.setFocusVeil = on => { if (fv !== !!on) { fv = !!on; applyFilter(); } };
  fx.size = () => ({ cw, ch, dpr });
  // live weather: cloud cover 0..1, precipitation mm/h, wind km/h
  fx.cloud = 0.5; fx.precip = -1; fx.wind = 0;
  fx.setSeason = s => { season = s; };
  viewer.addHandler('open', applyFilter);

  // ---------------------------------------------------------- drawing
  // map labels use VT323: a pixel font whose letters (Z, Ž, Ř…) stay easy to read
  const labelFont = px => `400 ${px}px "VT323", "Courier New", monospace`;
  if (document.fonts) document.fonts.load('20px "VT323"').catch(() => {});
  const labelWidth = new Map(); // `${size}|${text}` → width (cleared when the font has come)
  function drawLabels(v, names) {
    if (!state.layers.labels) return;
    const k = v.k;
    const boxes = [];
    for (const n of names || []) { boxes.push([n.sx - 4, n.sy - 4, n.sx + 4, n.sy + 4]); if (n.sb) boxes.push(n.sb); } // the names of places keep their room
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const list = data.labels;
    for (let pass = 1; pass <= 3; pass++) {
      if (pass === 2 && v.z < 0.16) break;
      if (pass === 3) break;
      const size = Math.round(Math.min(30, Math.max(15, (pass === 1 ? 19 : 16.5) * Math.pow(v.z / 0.103, 0.28))));
      ctx.font = labelFont(size);
      for (const l of list) {
        if (l.r !== pass) continue;
        const sx = v.ox + l.X * k, sy = v.oy + l.Y * k;
        if (sx < -100 || sy < -20 || sx > cw + 100 || sy > ch + 20) continue;
        const text = l.n.toUpperCase();
        const wk = `${size}|${text}`;
        let w = labelWidth.get(wk);
        if (w === undefined) { w = ctx.measureText(text).width; labelWidth.set(wk, w); }
        const box = [sx - w / 2 - 4, sy - size / 2 - 3, sx + w / 2 + 4, sy + size / 2 + 3];
        if (boxes.some(b => b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1])) continue;
        boxes.push(box);
        if (pass <= 2) fx.labelRects.push([...box, l]); // the names of quarters open a card
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(22,29,43,.85)';
        ctx.strokeText(text, sx, sy);
        ctx.fillStyle = '#f0f2ea';
        ctx.fillText(text, sx, sy);
      }
    }
  }

  function drawClouds(t, v) {
    if (fx.plain) return;
    // pixel size of one cloud pixel; clouds fade away when zoomed in close
    const s = Math.max(1, Math.min(7, Math.round(v.z * 9)));
    const fade = Math.max(0, Math.min(1, 1.6 - v.z));
    if (fade <= 0) return;
    if (fx.lite && s >= 4) return; // (a slow device: no big clouds, 56 large blits with alpha cost the most of all)
    ctx.imageSmoothingEnabled = false;
    const span = GEO.W * 1.2;
    // cloud cover 0 means a truly clear sky (the summer look, or "Jasno" chosen by hand); otherwise at least a few clouds
    const count = fx.cloud <= 0 ? 0 : Math.round(clouds.length * Math.max(0.05, Math.min(1, fx.cloud)));
    for (let ci = 0; ci < count; ci++) {
      const c = clouds[ci];
      let X = c.X + (t / 1000) * c.v * (1 + fx.wind / 15);
      X = ((X + GEO.W * 0.1) % span) - GEO.W * 0.1;
      const w = c.cloud.width * s, h = c.cloud.height * s;
      const gx = v.ox + X * v.k, gy = v.oy + c.Y * v.k; // shadow on the ground
      const lift = c.alt * GEO.V * v.k; // the cloud itself floats this much higher
      ctx.globalAlpha = (weather === 'fog' ? 0.08 : 0.16) * fade;
      if (!fx.lite && !(gx + w < 0 || gy + h < 0 || gx > cw || gy > ch)) ctx.drawImage(c.shadow, Math.round(gx + w * 0.25), Math.round(gy), w, h);
      ctx.globalAlpha = (weather === 'fog' ? 0.55 : 0.95) * fade;
      const sy = gy - lift;
      if (!(gx + w < 0 || sy + h < 0 || gx > cw || sy > ch)) ctx.drawImage(c.cloud, Math.round(gx), Math.round(sy), w, h);
    }
    ctx.globalAlpha = 1;
  }

  const CARS_Z = 1; // v.z from which the cars are drawn (m/px = 2 / v.z)
  const batch = carBatch(), lights = [];
  function drawTraffic(t, v) {
    if (!state.layers.traffic || dm || v.z < 0.4 || night > 0.97) return; // (no cars over a datová mapa)
    // cars only from 2 m per pixel: farther out each is a speck of a few pixels and there are thousands in view;
    // the trams of the routes (few, drawn as short lines) stay from 5 m per pixel
    const carsOn = v.z >= CARS_Z;
    if (!carsOn && state.layers.mhd) return;
    if (fx.lite && v.z < 1.5) return; // (a slow device: cars only close up, zoomed out they are specks of a few pixels)
    if (!cars.length) { if (!data.routes.length) { if (fx.needRoutes) fx.needRoutes(); return; } prepareTraffic(); } // (the roads come when first needed)
    const x0 = -v.ox / v.k, y0 = -v.oy / v.k, x1 = x0 + cw / v.k, y1 = y0 + ch / v.k;
    const sec = t / 1000;
    const cs = Math.max(1.5, v.z * 2.2);
    const shutAll = carsOn && fx.deadList ? fx.deadList() : null; // the pieces of the roads closed to cars, by the road's index
    for (const r of cars) {
      if (r.c === 9 ? state.layers.mhd : !carsOn) continue; // trams come from the timetable layer
      if (fx.lite && r.c === 0) continue; // (a slow device: no cars on the local streets, most of the roads)
      if (r.bb[2] < x0 || r.bb[0] > x1 || r.bb[3] < y0 || r.bb[1] > y1) continue;
      const shut = shutAll && r.c !== 9 ? shutAll[r.i] : undefined; // the pieces of this road closed to cars: [[from, to], …]
      for (let ci = 0; ci < r.cars.length; ci++) {
        const c = r.cars[ci];
        let s = (c.o + c.dir * c.s * sec) % r.len; if (s < 0) s += r.len;
        if (shut) { let hit = false; for (let q = 0; q < shut.length; q++) if (s >= shut[q][0] && s <= shut[q][1]) { hit = true; break; } if (hit) continue; } // (a closure, or a road that leads only to one)
        const [X, Y, dx, dy] = along(r, s);
        if (X < x0 - 5 || X > x1 + 5 || Y < y0 - 5 || Y > y1 + 5) continue;
        const off = r.c === 9 || r.ow ? 0 : (r.c === 0 ? 1.2 : 1.6) * S * c.dir; // keep right; one-way: middle of the road
        let px = X - dy * off, py = Y + dx * off;
        if (r.c !== 9 && fx.lane) { const q = fx.lane(px, py, dx * c.dir, dy * c.dir, ci); if (q) { px = q[0]; py = q[1]; } } // (a traffic node: into a lane as it is drawn there)
        if (r.c !== 9 && fx.inJam && fx.inJam(px, py)) continue; // that stretch is a jam: cars stand there instead
        if (!fx.lite && fx.occluder && v.z >= 0.45 && fx.occluder(px, py)) continue; // behind a building (seen at an angle; a slow device skips the test)
        const sx = v.ox + px * v.k, sy = v.oy + py * v.k;
        if (r.c === 9) {
          const L = 9 * v.z;
          ctx.strokeStyle = c.col; ctx.lineWidth = Math.max(2, 2.4 * v.z); ctx.lineCap = 'butt';
          ctx.beginPath(); ctx.moveTo(sx - dx * L / 2, sy - dy * L / 2); ctx.lineTo(sx + dx * L / 2, sy + dy * L / 2); ctx.stroke();
          ctx.strokeStyle = '#efe6cf'; ctx.lineWidth = Math.max(1, 0.8 * v.z);
          ctx.beginPath(); ctx.moveTo(sx - dx * L / 2, sy - dy * L / 2 - v.z * 0.6); ctx.lineTo(sx + dx * L / 2, sy + dy * L / 2 - v.z * 0.6); ctx.stroke();
        } else {
          batch.add(sx, sy, dx * c.dir, dy * c.dir, c.kind, c.col, v.k * GEO.A, c.cab);
          if (night > 0.6) lights.push(Math.round(sx + dx * c.dir * 3 * v.k) - 1, Math.round(sy + dy * c.dir * 3 * v.k) - 1); // headlights
        }
      }
    }
    batch.flush(ctx); // (all the cars at once, a fill per colour)
    if (lights.length) { ctx.fillStyle = '#ffe9a8'; for (let i = 0; i < lights.length; i += 2) ctx.fillRect(lights[i], lights[i + 1], 2, 2); lights.length = 0; }
  }

  function drawSmoke(t, v) {
    if (!state.layers.smoke || fx.lite || v.z < 0.22) return;
    const sec = t / 1000;
    for (const [X, Y] of data.chimneys) {
      const sx = v.ox + X * v.k, sy = v.oy + Y * v.k;
      if (sx < -80 || sx > cw + 80 || sy < -120 || sy > ch + 20) continue;
      for (let i = 0; i < 7; i++) {
        const ph = (sec * 0.18 + i / 7 + (X % 7) / 7) % 1;
        const r = (1.2 + ph * 5) * v.z * 1.6;
        ctx.fillStyle = `rgba(${200 + 30 * (1 - ph)},${205 + 30 * (1 - ph)},${215},${(1 - ph) * 0.5})`;
        ctx.beginPath();
        ctx.arc(sx + ph * 26 * v.z, sy - ph * 34 * v.z, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function outline(b, v, color, width, fillA = 0.18) {
    const p = b[0], hp = b[1];
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'miter';
    const P = i => [v.ox + p[i] * v.k, v.oy + p[i + 1] * v.k];
    ctx.beginPath();
    for (let i = 0; i < p.length; i += 2) { const [x, y] = P(i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.stroke();
    // left- and right-most corners drop down to the ground
    let li = 0, ri = 0;
    for (let i = 0; i < p.length; i += 2) { if (p[i] < p[li]) li = i; if (p[i] > p[ri]) ri = i; }
    ctx.beginPath();
    for (const i of [li, ri]) { const [x, y] = P(i); ctx.moveTo(x, y); ctx.lineTo(x, y + hp * v.k); }
    ctx.stroke();
    ctx.fillStyle = color.replace(/[\d.]+\)$/, `${fillA})`);
    ctx.beginPath();
    for (let i = 0; i < p.length; i += 2) { const [x, y] = P(i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill();
  }

  function drawWeather(t) {
    if (fx.plain) return;
    const sec = t / 1000;
    if (fx.cloud > 0.7 && wxK > 0.005) { ctx.fillStyle = `rgba(60,70,92,${((0.14 * (fx.cloud - 0.7)) / 0.3) * wxK})`; full(); }
    if (weather === 'rain') {
      if (wxK > 0.005) { ctx.fillStyle = `rgba(40,52,74,${(0.18 * wxK).toFixed(3)})`; full(); }
      ctx.strokeStyle = 'rgba(190,210,240,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath();
      const nd = fx.precip < 0 ? drops.length : Math.min(drops.length, 70 + fx.precip * 160);
      for (let di = 0; di < nd; di++) {
        const d = drops[di];
        const x = ((d.x * cw + sec * 120 * d.z) % (cw + 40)) - 20, y = ((d.y * ch + sec * 620 * d.z) % (ch + 40)) - 20;
        ctx.moveTo(x, y); ctx.lineTo(x - 3 * d.z, y - 12 * d.z);
      }
      ctx.stroke();
    } else if (weather === 'snow') {
      if (wxK > 0.005) { ctx.fillStyle = `rgba(220,230,245,${(0.12 * wxK).toFixed(3)})`; full(); }
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      const ns = fx.precip < 0 ? drops.length : Math.min(drops.length, 90 + fx.precip * 200);
      for (let di = 0; di < ns; di++) {
        const d = drops[di];
        const x = (((d.x * cw + Math.sin(sec * 0.8 + d.y * 20) * 18 + sec * 14) % (cw + 20)) + cw + 20) % (cw + 20) - 10;
        const y = ((d.y * ch + sec * 46 * d.z) % (ch + 20)) - 10;
        const s = d.z > 0.8 ? 3 : 2;
        ctx.fillRect(Math.round(x), Math.round(y), s, s);
      }
    } else if (weather === 'fog') {
      // only a hint of fog: a thin veil and a few drifting lighter patches (the map stays readable)
      // (thinner as one zooms in, none close up: wxK)
      if (wxK > 0.005) {
        ctx.fillStyle = `rgba(196,204,214,${(0.14 * wxK).toFixed(3)})`; full();
        for (let i = 0; i < 6; i++) {
          const x = ((i * 0.23 + sec * 0.012) % 1.4 - 0.2) * cw, y = (0.15 + i * 0.14) * ch;
          const g = ctx.createRadialGradient(x, y, 10, x, y, cw * 0.35);
          g.addColorStop(0, `rgba(220,226,232,${(0.16 * wxK).toFixed(3)})`); g.addColorStop(1, 'rgba(220,226,232,0)');
          ctx.fillStyle = g; full();
        }
      }
    }
  }

  // The veil (a full fill and three passes of the mask) is costly, so it is kept: drawn for one zoom into a canvas VEIL_M px
  // larger than the view on every side, and while the map only pans it is put down at the offset; drawn again when the view
  // leaves the part it covers, or the zoom, the darkness, the size or the mask change.
  const VEIL_M = 160;
  let veil = null; // the view (ox, oy) the veil canvas was drawn for
  function drawNight(v) {
    if (night < 0.02 || fx.plain) return;
    const dark = Math.max(0, (night - 0.45) / 0.55);
    const golden = Math.max(0, 1 - Math.abs(night - 0.5) * 2.2);
    if (golden > 0) { ctx.fillStyle = `rgba(255,150,60,${0.1 * golden})`; full(); }
    if (dark > 0) {
      // the light map (data/r<ROT>/lights.json) is fetched the first time the night falls
      if (!litStamp && fx.needLights) fx.needLights(); // (litStamp: the mask has been built; a fresh canvas has a width too)
      const lw = lightCanvas.width * LS * v.k, lh = lightCanvas.height * LS * v.k;
      const o = bleed + VEIL_M, W = cw + 2 * o, H = ch + 2 * o; // the corner of the map is o px into the veil canvas
      const key = `${W}|${H}|${v.k}|${dark}|${litStamp}`;
      if (key !== nightKey || !veil || Math.abs(v.ox - veil.ox) > VEIL_M || Math.abs(v.oy - veil.oy) > VEIL_M) {
        nightKey = key; veil = { ox: v.ox, oy: v.oy };
        if (nightCanvas.width !== W || nightCanvas.height !== H) { nightCanvas.width = W; nightCanvas.height = H; }
        const n = nightCanvas.getContext('2d');
        n.globalCompositeOperation = 'source-over'; n.globalAlpha = 1;
        n.clearRect(0, 0, W, H);
        n.fillStyle = `rgba(8,14,42,${0.7 * dark})`; n.fillRect(0, 0, W, H);
        if (litStamp) {
          n.globalCompositeOperation = 'destination-out'; // holes in the veil where it is lit (never quite day)
          n.imageSmoothingEnabled = true;
          // three passes: where it is lit the veil is gone completely (the map exactly as by day)
          for (let k = 0; k < 3; k++) n.drawImage(litMask, v.ox + o, v.oy + o, lw, lh);
        }
      }
      ctx.drawImage(nightCanvas, v.ox - veil.ox - o, v.oy - veil.oy - o, W, H);
    }
  }

  // Names of places ("Názvy zajímavých míst", state.layers.names): a dot on the place and its name beside it, light
  // letters with a dark edge like the names of quarters (no box; the names of streets, not clickable, have only a
  // shadow), above the outlines of the roofs and above the icons, always seen, also while the map moves. Who gets a name where it is crowded: the landmarks, the other places with a
  // story (each of these always has its dot, so all of them can be found), from NAME_Z (about 4 m per pixel) the other
  // places of Wikipedia and GO TO BRNO, from TAG_Z (0.7 m per pixel) the city projects too and also the offices and
  // parishes. Names never cover one another nor a dot (the names of quarters keep off them); zooming in shows more.
  // The layout depends only on the zoom, so moving the map only shifts it: no name jumps while the map moves.
  // Click on a name or on its dot opens the card of the place (fx.wikiRects, see wikiPoiAt in main.js).
  fx.wikiRects = [];
  const TAG_Z = 2 / 0.7, NAME_Z = 0.45;
  const LANDMARKS = ['Špilberk', 'Katedrála svatého Petra a Pavla', 'AZ Tower', 'Brněnské výstaviště', 'Vila Tugendhat'];
  // not before TAG_Z: offices, parishes, whole quarters and towns, the letters of the exhibition pavilions, firms
  const NAME_SKIP = /^(Úřad měst|Římskokatolická farnost|Farní sbor|Brno ?-|.$)|s\.r\.o\./;
  const NAME_COL = { wiki: '#93c96a', place: '#5fb3e6', proj: '#f3c868' };
  // a long name shortened on the map (the card has it whole): "Slovanský ústav ku vzdělání učitelů…"
  const shortName = n => (n.length <= 40 ? n : `${n.slice(0, 39).replace(/\s+\S*$/, '').replace(/[\s,(–-]+$/, '')}…`);
  const nameWidth = new Map(); // `${size}|${text}` → width (cleared when the font has come)
  let nameKey = '', nameLay = null, nameFonts = '';
  function nameList(z) {
    const W = data.wikiPois, out = [], seen = new Set();
    const add = (p, top, c) => { if (p && !seen.has(p) && Number.isFinite(p[2]) && Number.isFinite(p[3])) { seen.add(p); out.push({ p, top, c }); } };
    for (const t of LANDMARKS) add(W.find(w => w[1] === t), 1, NAME_COL.wiki);
    for (const p of W) if (p[4]) add(p, 1, NAME_COL.wiki);
    if (z >= TAG_Z) for (const q of fx.projTags || []) if (!fx.projOn || fx.projOn(q.proj)) add([q.n, null, q.X, q.Y, 1, q], 0, NAME_COL.proj);
    if (z >= NAME_Z) {
      for (const p of W) if (!p[4] && (z >= TAG_Z || !NAME_SKIP.test(p[0]))) add(p, 0, NAME_COL.wiki);
      for (const q of fx.placeTags || []) add(q, 0, NAME_COL.place);
    }
    return out;
  }
  // the whole city laid out at this zoom, in screen px from the corner of the image (a grid of 64 px cells for the
  // boxes taken); each name tries right of its dot, left, above right, above left, above, below
  function layoutNames(v) {
    const k = v.k, list = nameList(v.z), G = 64, grid = new Map(), out = [];
    const cellsOf = (b, f) => { for (let gx = Math.floor(b[0] / G); gx <= Math.floor(b[2] / G); gx++) for (let gy = Math.floor(b[1] / G); gy <= Math.floor(b[3] / G); gy++) f((gx + 4096) * 65536 + gy + 4096); }; // (a number for the cell, not a string: the layout is made at every frame of a zoom)
    const take = b => cellsOf(b, c => { const l = grid.get(c); if (l) l.push(b); else grid.set(c, [b]); });
    const hit = (b, pad) => { let h = false; cellsOf([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], c => { if (!h) h = (grid.get(c) || []).some(q => q[0] < b[2] + pad && q[2] > b[0] - pad && q[1] < b[3] + pad && q[3] > b[1] - pad); }); return h; };
    for (const o of list) { o.x = Math.round(o.p[2] * k); o.y = Math.round(o.p[3] * k); o.t = shortName(o.p[0]); }
    for (const o of list) if (o.top) take([o.x - 4, o.y - 4, o.x + 4, o.y + 4]); // the dots of the places with a story first
    let font = 0;
    for (const o of list) {
      const { x, y } = o, dot = [x - 4, y - 4, x + 4, y + 4];
      if (!o.top && hit(dot, 1)) continue; // a lesser place under a name or right at another dot: left out
      const size = o.top ? 16 : 15, h = Math.round(size * 0.8);
      if (font !== size) { ctx.font = labelFont(size); font = size; }
      const wk = `${size}|${o.t}`;
      let w = nameWidth.get(wk);
      if (w === undefined) { w = Math.ceil(ctx.measureText(o.t).width); nameWidth.set(wk, w); }
      let b = null;
      for (const [x0, y0] of [[x + 8, y - h / 2], [x - 8 - w, y - h / 2], [x + 6, y - 6 - h], [x - 6 - w, y - 6 - h], [x - w / 2, y - 8 - h], [x - w / 2, y + 8]]) {
        const c = [Math.round(x0), Math.round(y0), Math.round(x0) + w, Math.round(y0) + h];
        if (!hit(c, 2)) { b = c; break; }
      }
      if (b) take(b);
      if (b && !o.top) take(dot);
      if (b || o.top) out.push({ o, b, size });
    }
    return out;
  }
  // the layout for this view (null: no names here); made again only when the zoom, the places or the font change
  function namesFor(v) {
    if (!state.layers.names || !data.wikiPois || !data.wikiPois.length || !state.layers.labels || v.z < 0.08) return null;
    const projs = v.z >= TAG_Z ? (fx.projTags || []).filter(q => !fx.projOn || fx.projOn(q.proj)).length : 0;
    const key = `${v.k.toPrecision(6)}|${cw}|${data.wikiPois.length}|${(fx.placeTags || []).length}|${projs}`;
    if (key !== nameKey) { nameKey = key; nameLay = layoutNames(v); }
    const ox = Math.round(v.ox), oy = Math.round(v.oy), M = 40, list = [];
    for (const n of nameLay) {
      const sx = ox + n.o.x, sy = oy + n.o.y;
      const b = n.b && [n.b[0] + ox, n.b[1] + oy, n.b[2] + ox, n.b[3] + oy];
      if ((sx < -M || sy < -M || sx > cw + M || sy > ch + M) && !(b && b[2] > 0 && b[0] < cw && b[3] > 0 && b[1] < ch)) continue;
      list.push({ ...n, sx, sy, sb: b });
    }
    return list;
  }
  function drawNames(names) {
    fx.wikiRects = [];
    if (!names) return;
    ctx.save();
    ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const { o, sx, sy } of names) {
      const r = o.top ? 3 : 2.5;
      // a place that also has a city project: a gold ring round its dot
      const proj = !o.p[5] && o.p[1] && fx.projByWiki && fx.projByWiki.has(o.p[1]) && fx.projByWiki.get(o.p[1]).some(q => !fx.projOn || fx.projOn(q));
      ctx.fillStyle = proj ? NAME_COL.proj : 'rgba(22,29,43,.9)'; ctx.beginPath(); ctx.arc(sx, sy, r + 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = o.c; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      fx.wikiRects.push([sx - 7, sy - 7, sx + 7, sy + 7, o.p]);
    }
    for (const { o, sb, size } of names) {
      if (!sb) continue;
      ctx.font = labelFont(size);
      const ty = (sb[1] + sb[3]) / 2 + 0.5;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(22,29,43,.78)'; ctx.strokeText(o.t, sb[0], ty);
      ctx.fillStyle = o.top ? '#f4e9c6' : '#e4e8dc'; ctx.fillText(o.t, sb[0], ty);
      fx.wikiRects.push([sb[0] - 3, sb[1] - 3, sb[2] + 3, sb[3] + 3, o.p]); // the whole name opens the card
    }
    ctx.restore();
  }

  // Street names: written along the street, only when zoomed in (main roads from about 2.5 m per pixel,
  // all streets from about 1.5 m per pixel); each name at most once per ~half screen, never over other labels
  let streetPrep = null, streetSrc = null;
  function prepStreets() {
    if (streetSrc === data.streets) return streetPrep;
    streetSrc = data.streets;
    streetPrep = (data.streets || []).map(([n, r, p]) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const cum = [0];
      for (let i = 0; i < p.length; i += 2) {
        x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
        if (i) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
      }
      return { n, r, p, cum, L: cum[cum.length - 1], b: [x0, y0, x1, y1] };
    });
    return streetPrep;
  }
  // point and direction at arc length s (image px) along a street
  function alongSt(st, s) { // (street names; along() above moves the cars)
    const { p, cum } = st;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1] || 1, f = Math.min(1, Math.max(0, (s - cum[i - 1]) / seg));
    const ax = p[2 * i - 2], ay = p[2 * i - 1], bx = p[2 * i], by = p[2 * i + 1];
    return [ax + (bx - ax) * f, ay + (by - ay) * f, Math.atan2(by - ay, bx - ax)];
  }
  const charW = new Map();
  let charGen = 0; // (counts the changes of the font: the widths kept with the streets are of one font)
  // One pass of a street name: pass 0 the edge, pass 1 the letters. The usual map: light letters with a soft shadow
  // below right. Klidná mapa (fx.plain, light grey ground): dark letters with a white edge all round, the light ones
  // were hard to read there, above all on a phone (variant A of 2026-11-18).
  function streetGlyph(pass, c, x, y, a, main) {
    base();
    if (fx.plain) {
      ctx.translate(x, y); ctx.rotate(a);
      if (pass === 0) { ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 3.5; ctx.strokeText(c, 0, 0); }
      else { ctx.fillStyle = '#23272e'; ctx.fillText(c, 0, 0); }
      return;
    }
    ctx.translate(pass === 0 ? x + 1 : x, pass === 0 ? y + 1.5 : y); ctx.rotate(a);
    ctx.fillStyle = pass === 0 ? 'rgba(12,16,26,.8)' : main ? '#e9dbb0' : '#d9dcd2';
    ctx.fillText(c, 0, 0);
  }
  function drawStreetNames(v, names) {
    if (!state.layers.labels || v.z < 0.8) return;
    if (!data.streets) { if (fx.needStreets) fx.needStreets(); return; } // (the streets come when first needed)
    const list = prepStreets();
    const maxRank = fx.lite ? 2 : v.z >= 1.3 ? 3 : 2; // (a slow device: the main roads only)
    const size = v.z >= 2.5 ? 18 : v.z >= 1.6 ? 16 : 15;
    ctx.font = labelFont(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const k = v.k, pad = 60;
    const boxes = [];
    for (const n of names || []) { boxes.push([n.sx - 6, n.sy - 6, n.sx + 6, n.sy + 6]); if (n.sb) boxes.push(n.sb); } // never over a name of a place
    const seen = new Map(); // name -> placed label centres
    const gap = Math.max(cw, ch) * 0.55; // the same name again only this far away
    const spacing = 900; // screen px between repeats along one long street
    const wOf = c => { const key = `${size}${c}`; let w = charW.get(key); if (w === undefined) { w = ctx.measureText(c).width; charW.set(key, w); } return w; };
    let drawn = 0;
    for (const st of list) {
      if (st.r > maxRank) continue;
      const [bx0, by0, bx1, by1] = st.b;
      if (v.ox + bx1 * k < -pad || v.ox + bx0 * k > cw + pad || v.oy + by1 * k < -pad || v.oy + by0 * k > ch + pad) continue;
      const text = st.n;
      // (the letters and their widths are kept with the street for this size and font: they were made again at every frame)
      let sw = st.w;
      if (!sw || sw.size !== size || sw.gen !== charGen) { const chars = [...text], widths = chars.map(wOf); sw = st.w = { size, gen: charGen, chars, widths, tw: widths.reduce((a, b) => a + b, 0) }; }
      const { chars, widths, tw } = sw;
      const Ls = st.L * k; // street length on screen
      if (Ls < tw + 24) continue;
      const nRep = Math.max(1, Math.floor(Ls / spacing));
      for (let rep = 0; rep < nRep; rep++) {
        const sMid = ((rep + 0.5) / nRep) * st.L;
        const half = tw / 2 / k;
        if (sMid - half < 0 || sMid + half > st.L) continue;
        const [mx, my] = alongSt(st, sMid);
        const cx = v.ox + mx * k, cy = v.oy + my * k;
        if (cx < 0 || cy < 0 || cx > cw || cy > ch) continue;
        const prev = seen.get(text);
        if (prev && prev.some(([px, py]) => Math.hypot(px - cx, py - cy) < gap)) continue;
        // read left to right: reverse when the street runs right to left here
        const [ax, ay] = alongSt(st, sMid - half), [bx, by] = alongSt(st, sMid + half);
        const flip = bx < ax;
        if (fx.lite) {
          // a slow device: the whole name in one piece along the street at its middle (two text calls, not two a letter)
          const a0 = Math.atan2(by - ay, bx - ax), a = flip ? a0 + Math.PI : a0;
          const g = [cx - tw / 2, cy - size / 2, cx + tw / 2, cy + size / 2];
          if (boxes.some(q => q[0] < g[2] && q[2] > g[0] && q[1] < g[3] && q[3] > g[1])) continue;
          boxes.push(g);
          if (prev) prev.push([cx, cy]); else seen.set(text, [[cx, cy]]);
          for (const pass of [0, 1]) streetGlyph(pass, text, cx, cy, a, st.r === 1);
          base();
          if (++drawn > (fx.lite ? (v.z < 1.3 ? 20 : 30) : 60)) return;
          continue;
        }
        // place each letter on the street line; give up on sharp bends
        const glyphs = [];
        let s = flip ? sMid + half : sMid - half, ok = true, lastA = null;
        for (let i = 0; i < chars.length; i++) {
          const w = widths[i] / k;
          const [x, y, a0] = alongSt(st, flip ? s - w / 2 : s + w / 2);
          const a = flip ? a0 + Math.PI : a0;
          if (lastA !== null) { let d = Math.abs(a - lastA); if (d > Math.PI) d = 2 * Math.PI - d; if (d > 0.5) { ok = false; break; } }
          lastA = a;
          glyphs.push([chars[i], v.ox + x * k, v.oy + y * k, a]);
          s += flip ? -w : w;
        }
        if (!ok) continue;
        const r = size * 0.55;
        const gb = glyphs.map(([, x, y]) => [x - r, y - r, x + r, y + r]);
        if (gb.some(g => boxes.some(q => q[0] < g[2] && q[2] > g[0] && q[1] < g[3] && q[3] > g[1]))) continue;
        for (const g of gb) boxes.push(g);
        if (prev) prev.push([cx, cy]); else seen.set(text, [[cx, cy]]);
        // not clickable, so unlike the names of places and quarters (a dark edge all round): only a soft shadow
        // below right and quieter letters
        for (const pass of [0, 1]) for (const [c, x, y, a] of glyphs) streetGlyph(pass, c, x, y, a, st.r === 1);
        base();
        if (++drawn > (fx.lite ? (v.z < 1.3 ? 20 : 30) : 60)) return;
      }
    }
  }

  function placePins(v) {
    const show = v.z >= 0.6 && state.layers.labels;
    for (const { el, s } of pinEls) {
      const sx = v.ox + s.X * v.k, sy = v.oy + s.Y * v.k;
      const vis = show && sx > -150 && sx < cw + 150 && sy > -40 && sy < ch + 60;
      el.style.display = vis ? 'block' : 'none';
      if (vis) { el.style.left = `${sx}px`; el.style.top = `${sy}px`; }
    }
    if (markerEl) {
      // (off the screen it is not shown at all: its two rings pulse for ever, also where #pins cuts them off; 80 px for the rings)
      const mx = markerXY ? v.ox + markerXY[0] * v.k : 0, my = markerXY ? v.oy + markerXY[1] * v.k : 0;
      const on = !!markerXY && (fx.cardOpen() || performance.now() < markerUntil) && mx > -80 - bleed && my > -80 - bleed && mx < cw + 80 + bleed && my < ch + 80 + bleed;
      markerEl.style.display = on ? 'block' : 'none';
      if (on) { markerEl.style.left = `${mx}px`; markerEl.style.top = `${my}px`; }
    }
  }

  fx.labelRects = []; fx.area = null; // area: rings (image px) of the quarter whose card is open; area.rough: only an
  // approximate area (the police area of a case, ring.corners: where the posts stand): a police tape stretched around
  fx.labelAt = (sx, sy) => { const r = fx.labelRects.find(b => sx >= b[0] && sx <= b[2] && sy >= b[1] && sy <= b[3]); return r ? r[4] : null; };
  // the police tape: blue and white blocks along it, on posts at the corners and about every 70 px between them, lifted
  // above the ground. ground: its shadow and the faint tint of the area (under the layers); otherwise the posts and the
  // tape, drawn last of all, so that no sign, name or vehicle hides it
  const TAPE_LIFT = 7, TAPE_W = 4, TAPE_BLOCK = 7, POST_EVERY = 70;
  function drawTape(r, v, ground) {
    const n = r.length / 2, X = i => v.ox + r[2 * (i % n)] * v.k, Y = i => v.oy + r[2 * (i % n) + 1] * v.k;
    const path = lift => { ctx.beginPath(); for (let i = 0; i < n; i++) i ? ctx.lineTo(X(i), Y(i) - lift) : ctx.moveTo(X(i), Y(i) - lift); ctx.closePath(); };
    if (ground) { path(0); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,14,24,.3)'; ctx.stroke(); ctx.fillStyle = 'rgba(29,79,156,.07)'; ctx.fill('evenodd'); return; } // the shadow
    // the posts: at the corners, and evenly between two corners along the drawn line
    const posts = [], cs = r.corners && r.corners.length ? r.corners : [0];
    for (let c = 0; c < cs.length; c++) {
      const a = cs[c], b = c + 1 < cs.length ? cs[c + 1] : cs[0] + n;
      let len = 0; for (let i = a; i < b; i++) len += Math.hypot(X(i + 1) - X(i), Y(i + 1) - Y(i));
      const k = Math.max(1, Math.round(len / POST_EVERY)), step = len / k;
      posts.push([X(a), Y(a)]);
      let acc = 0, next = step;
      for (let i = a; i < b && posts.length < 4000; i++) {
        const d = Math.hypot(X(i + 1) - X(i), Y(i + 1) - Y(i));
        while (acc + d >= next - 0.01 && next < len - 1) { const t = (next - acc) / d; posts.push([X(i) + (X(i + 1) - X(i)) * t, Y(i) + (Y(i + 1) - Y(i)) * t]); next += step; }
        acc += d;
      }
    }
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    for (const [x, y] of posts) { // a post: dark, with a light side
      ctx.fillStyle = 'rgba(10,14,24,.35)'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 4, 2);
      ctx.fillStyle = '#2a2f38'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - TAPE_LIFT - 3, 2, TAPE_LIFT + 3);
      ctx.fillStyle = '#8a919c'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - TAPE_LIFT - 3, 1, TAPE_LIFT + 3);
    }
    path(TAPE_LIFT);
    ctx.lineWidth = TAPE_W + 2; ctx.strokeStyle = 'rgba(16,24,40,.6)'; ctx.stroke(); // the edge of the tape
    ctx.lineWidth = TAPE_W; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.setLineDash([TAPE_BLOCK, TAPE_BLOCK]); ctx.strokeStyle = '#1d4f9c'; ctx.stroke(); ctx.setLineDash([]);
  }
  function drawArea(v) {
    ctx.save();
    if (fx.area.rough) { for (const r of fx.area) drawTape(r, v, true); ctx.restore(); return; }
    ctx.lineJoin = 'round'; ctx.beginPath();
    for (const r of fx.area) for (let i = 0; i < r.length; i += 2) { const x = v.ox + r[i] * v.k, y = v.oy + r[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(243,200,104,.08)'; ctx.fill('evenodd');
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(243,200,104,.95)'; ctx.stroke();
    ctx.restore();
  }
  fx.draw = (t, v) => {
    fx.labelRects = [];
    if (canvas.clientWidth - 2 * bleed !== cw || canvas.clientHeight - 2 * bleed !== ch || dpr !== Math.min(fx.lite ? 1 : 2, window.devicePixelRatio || 1)) resize();
    if (!cw || !ch || !v || !Number.isFinite(v.k) || !(v.k > 0) || !Number.isFinite(v.ox) || !Number.isFinite(v.oy) || !Number.isFinite(v.z)) return;
    ctx.__view = [-bleed, -bleed, cw + bleed, ch + bleed]; // the part of the drawing that is seen (src/onscreen.js)
    wxK = veilAt(v.z);
    if (Math.round(wxK * 10) !== wxTenth) { wxTenth = Math.round(wxK * 10); if (weather === 'fog' || weather === 'rain') applyFilter(); }
    // the pixel font arrives after the first drawings: the widths measured with the stand-in font go
    const fonts = document.fonts ? document.fonts.status : '';
    if (fonts !== nameFonts) { nameFonts = fonts; nameWidth.clear(); labelWidth.clear(); charW.clear(); charGen++; nameKey = ''; }
    base();
    T('clear', () => ctx.clearRect(-bleed, -bleed, cw + 2 * bleed, ch + 2 * bleed));
    if (fx.under) T('datamap', () => fx.under(ctx, v, t)); // the datová mapa: under everything that moves
    T('night', () => drawNight(v));
    T('cars', () => drawTraffic(t, v));
    T('smoke', () => drawSmoke(t, v));
    T('outline', () => {
      if (fx.area) drawArea(v);
      if (fx.selected) for (const q of fx.pieces(fx.selected)) outline(q, v, 'rgba(201,88,59,1)', 2);
      if (fx.hover && fx.hover !== fx.selected && !(fx.selected && fx.hover[12] !== undefined && fx.hover[12] === fx.selected[12])) for (const q of fx.pieces(fx.hover)) outline(q, v, 'rgba(255,248,232,0.9)', 1.2, 0.12); // the house under the pointer: thin and pale, never the gold of the monuments
    });
    if (fx.extra) fx.extra(ctx, v, t); // (the layers, the zoo, the people: timed one by one in main.js)
    T('clouds', () => drawClouds(t, v));
    T('weather', () => drawWeather(t));
    if (fx.mid) T('monuments', () => fx.mid(ctx, v, t)); // outlines on the roofs (the cultural monuments): under every name
    let names = null;
    T('labels', () => {
      names = namesFor(v); // names of places: only when switched on (their boxes keep the names of quarters off)
      if (v.z < 0.5) drawLabels(v, names); // names of city districts and quarters, only zoomed out
    });
    T('streets', () => drawStreetNames(v, names));
    // a kind highlighted from a card: a dark veil over the map and every layer drawn so far (building sites, closures,
    // cars, street names), under the icons, so that the highlighted symbols and their beacons stand out
    if (fv) T('veil', () => { ctx.fillStyle = 'rgba(14,19,30,.22)'; ctx.fillRect(-bleed, -bleed, cw + 2 * bleed, ch + 2 * bleed); });
    if (fx.top) fx.top(ctx, v, t); // clickable icons (cameras, air stations) above labels and buildings (timed one by one in main.js)
    T('names', () => drawNames(names)); // the names of places above all: read whole and clicked whole (wikiPoiAt comes first in main.js)
    T('pins', () => placePins(v));
    if (fx.area && fx.area.rough) T('tape', () => { ctx.save(); for (const r of fx.area) drawTape(r, v, false); ctx.restore(); }); // the police tape: above everything
  };
  void season;
  return fx;
}

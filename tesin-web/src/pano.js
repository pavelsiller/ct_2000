// Street-level photos from Panoramax (panoramax.fr): a free, federated "street view" made by volunteers. In Brno
// they are mostly 360° pictures from 2024–2026 (pano.kasik-gis.eu, panoramax.openstreetmap.fr, pano.mahdi.cz), all
// reachable through the meta-catalogue api.panoramax.xyz (a STAC API). Licence CC BY-SA 4.0: the author is named
// with every picture.
// On the map: the layer "Fotky z ulice" draws the photographed streets (violet lines) and, zoomed in, the single
// pictures (dots). A click on a dot, into a street, on my own position, or the button in a building's card opens
// the picture in the card: a small 360° viewer (WebGL, one equirectangular picture, no library), and the map shows
// where the picture stands and which way you look (a cone, like the webcams).
import { helmetOffset, fixedYaw, BAND } from './helmet.js';
import { track } from './stats.js';
import { inMap, clipLine } from './extent.js';
import { PROXY, panoImg } from './proxy.js';

const META = 'https://api.panoramax.xyz/api';
const META_VIA = PROXY ? `${PROXY}/pano/api` : '';
const VIEW_URL = id => `https://api.panoramax.xyz/?focus=pic&pic=${id}`;
const EXT = 4096; // vector tile extent
const COMPASS = ['sever', 'severovýchod', 'východ', 'jihovýchod', 'jih', 'jihozápad', 'západ', 'severozápad'];
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
const rad = d => (d * Math.PI) / 180;
const norm = d => ((d % 360) + 360) % 360;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const distM = (lon1, lat1, lon2, lat2) => Math.hypot((lon2 - lon1) * Math.cos(rad(lat1)) * 111320, (lat2 - lat1) * 110574);
const bearing = (lon1, lat1, lon2, lat2) => norm((Math.atan2((lon2 - lon1) * Math.cos(rad(lat1)), lat2 - lat1) * 180) / Math.PI);
const offset = (lon, lat, brg, m) => [lon + (Math.sin(rad(brg)) * m) / (Math.cos(rad(lat)) * 111320), lat + (Math.cos(rad(brg)) * m) / 110574];
const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '');

// ---------------------------------------------------------------- the API (STAC items -> plain picture objects)
function picOf(f) {
  const p = f.properties || {}, [lon, lat] = f.geometry.coordinates;
  const link = r => (f.links || []).find(l => l.rel === r);
  const prod = (f.providers || []).find(x => (x.roles || []).includes('producer'));
  return {
    id: f.id, seq: f.collection, lon, lat,
    yaw: p['view:azimuth'] ?? p['pers:yaw'] ?? 0, // compass direction of the centre of the picture
    fov: (p['pers:interior_orientation'] || {}).field_of_view ?? 360,
    date: p.datetime, author: (prod && prod.name) || p['geovisio:producer'] || 'neznámý autor',
    sd: (f.assets && f.assets.sd && f.assets.sd.href) || (f.assets && f.assets.hd && f.assets.hd.href) || '',
    license: String(p.license || 'CC-BY-SA-4.0').replace(/[[\]]/g, '').replace(/^CC-BY-SA-/, 'CC BY-SA ').replace(/^CC-BY-/, 'CC BY '),
    instance: (link('via') || {}).instance_name || '',
    prev: (link('prev') || {}).id || null, next: (link('next') || {}).id || null,
  };
}
// Some rides write the direction of travel as the picture's heading while the camera has turned on its pole
// (see helmet.js): the rider's helmet at the bottom of the picture says where the bike really went. The bottom
// half of the picture, 512 px wide, through a small canvas; null when nothing helmet-like is there.
function helmetFix(img) {
  try {
    const w = 512, h = Math.round((w * img.naturalHeight * (1 - BAND)) / img.naturalWidth);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, img.naturalHeight * BAND, img.naturalWidth, img.naturalHeight * (1 - BAND), 0, 0, w, h);
    return helmetOffset(ctx.getImageData(0, 0, w, h).data, w, h, 4, 1);
  } catch { return null; } // a tainted canvas (no CORS on this instance): the data's heading stays
}
async function getJson1(url, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); } finally { clearTimeout(t); }
}
// q: the part after /api ("/search?…", "/pictures/<id>")
async function getJson(q, ms = 12000) {
  if (META_VIA) { try { return await getJson1(META_VIA + q, ms); } catch { /* the catalogue itself */ } }
  return getJson1(META + q, ms);
}
const tileBuf = async q => {
  const one = u => fetch(u).then(r => (r.status === 204 ? new ArrayBuffer(0) : r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))));
  if (META_VIA) { try { return await one(META_VIA + q); } catch { /* the catalogue itself */ } }
  return one(META + q);
};
// a picture: through the proxy, its own address when that fails (img: an <img> or Image, resolves when decoded)
async function loadPic(img, href) {
  const via = panoImg(href);
  if (via) { try { img.src = via; await img.decode(); return; } catch { /* its own address */ } }
  img.src = href; await img.decode();
}
// the best of several pictures for a place: the nearest, a 360° one rather than a flat one, newer rather than older
function best(feats, lon, lat) {
  let pick = null, score = Infinity;
  for (const f of feats) {
    const p = picOf(f);
    if (!p.sd) continue;
    const yr = p.date ? new Date(p.date).getFullYear() : 2020;
    const s = distM(lon, lat, p.lon, p.lat) + (p.fov < 360 ? 40 : 0) - clamp((yr - 2022) * 2, 0, 8); // a flat photo only when no 360° one is within 40 m
    if (s < score) { score = s; pick = p; }
  }
  return pick;
}

// ---------------------------------------------------------------- the 360° viewer: one picture on a sphere
const VS = 'attribute vec2 p;varying vec2 uv;void main(){uv=p;gl_Position=vec4(p,0.,1.);}';
const FS = `precision highp float;varying vec2 uv;uniform sampler2D tex;uniform float yaw,pitch,hfov,aspect,picYaw;
void main(){float tx=tan(hfov*.5);vec3 d=normalize(vec3(uv.x*tx,uv.y*tx/aspect,1.));
float cp=cos(pitch),sp=sin(pitch);d=vec3(d.x,d.y*cp+d.z*sp,-d.y*sp+d.z*cp);
float b=atan(d.x,d.z)+yaw-picYaw;float e=asin(clamp(d.y,-1.,1.));
gl_FragColor=texture2D(tex,vec2(fract(b/6.2831853+.5),.5-e/3.1415927));}`;
function sphere(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(pr, n);
  const uYaw = U('yaw'), uPitch = U('pitch'), uFov = U('hfov'), uAsp = U('aspect'), uPic = U('picYaw');
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  let ready = false;
  return {
    image(img) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // the seam behind you joins only with REPEAT, which WebGL 1 allows for power-of-two widths (the SD picture is 2048 px)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, (img.naturalWidth & (img.naturalWidth - 1)) === 0 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      ready = true;
    },
    draw(yaw, pitch, hfov, picYaw) {
      if (!ready) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uYaw, rad(yaw)); gl.uniform1f(uPitch, rad(pitch)); gl.uniform1f(uFov, rad(hfov)); gl.uniform1f(uAsp, canvas.width / Math.max(1, canvas.height)); gl.uniform1f(uPic, rad(picYaw));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    lose() { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); },
  };
}

// ---------------------------------------------------------------- minimal Mapbox Vector Tile decoder (points, lines, tags)
function varint(b, p) { let r = 0, s = 0, x; do { x = b[p.i++]; r += s < 28 ? (x & 0x7f) << s : (x & 0x7f) * 2 ** s; s += 7; } while (x & 0x80); return r; }
function fields(b, p, end, cb) {
  while (p.i < end) {
    const k = varint(b, p), f = k >> 3, w = k & 7;
    if (w === 0) cb(f, varint(b, p));
    else if (w === 2) { const l = varint(b, p); cb(f, b.subarray(p.i, p.i + l)); p.i += l; }
    else if (w === 5) { cb(f, b.subarray(p.i, p.i + 4)); p.i += 4; }
    else if (w === 1) { cb(f, b.subarray(p.i, p.i + 8)); p.i += 8; }
    else throw new Error('mvt');
  }
}
const td = new TextDecoder();
function value(v) {
  let out;
  fields(v, { i: 0 }, v.length, (f, x) => {
    if (f === 1) out = td.decode(x);
    else if (f === 2) out = new DataView(x.buffer, x.byteOffset, 4).getFloat32(0, true);
    else if (f === 3) out = new DataView(x.buffer, x.byteOffset, 8).getFloat64(0, true);
    else if (f === 4 || f === 5) out = x;
    else if (f === 6) out = (x >>> 1) ^ -(x & 1);
    else if (f === 7) out = !!x;
  });
  return out;
}
function decodeMvt(buf) {
  const b = new Uint8Array(buf), layers = {};
  fields(b, { i: 0 }, b.length, (f, lb) => {
    if (f !== 3) return;
    const L = { name: '', extent: EXT, keys: [], values: [], feats: [] }, raw = [];
    fields(lb, { i: 0 }, lb.length, (g, x) => { if (g === 1) L.name = td.decode(x); else if (g === 5) L.extent = x; else if (g === 3) L.keys.push(td.decode(x)); else if (g === 4) L.values.push(value(x)); else if (g === 2) raw.push(x); });
    for (const fb of raw) {
      const F = { type: 0, tags: {}, geom: [] }; const tags = [], geom = [];
      fields(fb, { i: 0 }, fb.length, (g, x) => { if (g === 3) F.type = x; else if (g === 2) { const p = { i: 0 }; while (p.i < x.length) tags.push(varint(x, p)); } else if (g === 4) { const p = { i: 0 }; while (p.i < x.length) geom.push(varint(x, p)); } });
      for (let i = 0; i < tags.length; i += 2) F.tags[L.keys[tags[i]]] = L.values[tags[i + 1]];
      let x = 0, y = 0, i = 0, ring = null;
      while (i < geom.length) {
        const c = geom[i++], cmd = c & 7, n = c >> 3;
        if (cmd === 7) continue;
        for (let k = 0; k < n; k++) { const dx = geom[i++], dy = geom[i++]; x += (dx >>> 1) ^ -(dx & 1); y += (dy >>> 1) ^ -(dy & 1); if (cmd === 1) { ring = []; F.geom.push(ring); } ring.push(x, y); }
      }
      L.feats.push(F);
    }
    layers[L.name] = L;
  });
  return layers;
}

export function createPano({ llToImg, imgToLonLat, stamp, onMove }) {
  // ---------------------------------------------------------------- finding pictures
  async function nearest(lon, lat, maxM = 40) {
    const dLon = maxM / (111320 * Math.cos(rad(lat))), dLat = maxM / 110574;
    const d = await getJson(`/search?bbox=${lon - dLon},${lat - dLat},${lon + dLon},${lat + dLat}&limit=100`);
    const p = best(d.features || [], lon, lat);
    return p && distM(lon, lat, p.lon, p.lat) <= maxM ? p : null;
  }
  // a picture that shows the place (the API returns 360° pictures nearby and flat ones looking that way); maxM: how
  // far from the point (the middle of a building) the street may be — a big building needs more. When nothing looks
  // at the place, the nearest picture a bit further away.
  async function lookingAt(lon, lat, maxM = 45) {
    const d = await getJson(`/search?place_position=${lon},${lat}&place_distance=4-${Math.round(maxM)}&limit=30`);
    const p = best(d.features || [], lon, lat) || (await nearest(lon, lat, maxM * 1.5));
    if (p) p.toward = bearing(p.lon, p.lat, lon, lat);
    return p;
  }
  const byId = async id => picOf(await getJson(`/pictures/${id}`));

  // ---------------------------------------------------------------- coverage: the tiles of the meta-catalogue
  // a tile: { seqs: [[lon, lat, …]], pics: [[lon, lat, id, heading]], img: projected copy (image px) for a stamp }
  const tiles = new Map();
  let inflight = 0;
  const tileLL = (z, x, y, px, py) => { const n = 2 ** z; const lon = ((x + px / EXT) / n) * 360 - 180; const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / EXT)) / n))) * 180) / Math.PI; return [lon, lat]; };
  function tile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    let t = tiles.get(key);
    if (t) { if (t.failed && Date.now() - t.failed > 60000) tiles.delete(key); else return t; }
    if (inflight >= 4) return null;
    t = { loading: true }; tiles.set(key, t); inflight++;
    tileBuf(`/map/${z}/${x}/${y}.mvt`).then(buf => {
      const L = decodeMvt(buf), seqs = [], pics = [];
      for (const f of (L.sequences || { feats: [] }).feats) for (const ring of f.geom) { const out = []; for (let i = 0; i < ring.length; i += 2) out.push(...tileLL(z, x, y, ring[i], ring[i + 1])); seqs.push(...clipLine(out)); } // (cut to the map, src/extent.js)
      for (const f of (L.pictures || { feats: [] }).feats) if (f.geom[0] && inMap(...tileLL(z, x, y, f.geom[0][0], f.geom[0][1]))) pics.push([...tileLL(z, x, y, f.geom[0][0], f.geom[0][1]), f.tags.id, f.tags.heading ?? 0, f.tags.type === 'equirectangular']);
      Object.assign(t, { loading: false, seqs, pics, img: null, imgStamp: -1 });
    }).catch(() => { t.loading = false; t.failed = Date.now(); t.seqs = []; t.pics = []; }).finally(() => { inflight--; });
    if (tiles.size > 300) tiles.delete(tiles.keys().next().value);
    return t;
  }
  // the lines and dots of a tile in image pixels (recomputed when the rotation or the terrain grid changes)
  function projected(t) {
    const st = stamp();
    if (t.img && t.imgStamp === st) return t.img;
    const seqs = t.seqs.map(s => { const o = new Float32Array(s.length); for (let i = 0; i < s.length; i += 2) { const [X, Y] = llToImg(s[i], s[i + 1]); o[i] = X; o[i + 1] = Y; } return o; });
    const pics = t.pics.map(p => { const [X, Y] = llToImg(p[0], p[1]); return [X, Y, p]; });
    t.img = { seqs, pics }; t.imgStamp = st;
    return t.img;
  }
  const tileXY = (lon, lat, z) => { const n = 2 ** z; return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(rad(lat)) + 1 / Math.cos(rad(lat))) / Math.PI) / 2) * n)]; };

  let hits = []; // [sx, sy, pic stub] of the dots drawn in this frame
  let cur = null; // the open viewer: { pic, yaw, pitch, hfov, box, flat }
  let status = '';
  // the layer is on from the start, so it shows only zoomed well in (v.z: 1 = one old map pixel of 2 m per screen px):
  // light blue dots of the single pictures on a thin line of the street, as people know it from other street views
  // from SHOW_FROM a pale line along the photographed street only; from DOTS_FROM it breaks up into the dots of the
  // single pictures, thinned so that they never pile on each other (the pictures are 1–4 m apart)
  const SHOW_FROM = 1.6, DOTS_FROM = 3.2, DOT_GAP = 11;
  const BLUE = '#a9dcf7', LINE = 'rgba(143,208,245,.45)', DARK = 'rgba(22,29,43,.7)';
  // the open viewer, or null once its card was closed (the card only hides: its content stays in the page) or replaced
  const alive = box => box.isConnected && !box.closest('[hidden]');
  const current = () => (cur && alive(cur.box) ? cur : (cur = null));

  function drawCone(ctx, v, c, t) {
    const dir = c.flat ? c.pic.yaw : c.yaw, fov = c.flat ? Math.min(c.pic.fov, 120) : c.hfov, R = 32;
    const { lon, lat } = c.pic;
    const [X0, Y0] = llToImg(lon, lat);
    const sx = v.ox + X0 * v.k, sy = v.oy + Y0 * v.k;
    const pts = [];
    for (let a = -fov / 2; a <= fov / 2 + 0.01; a += Math.max(3, fov / 10)) { const [l2, a2] = offset(lon, lat, dir + a, R); const [X, Y] = llToImg(l2, a2); pts.push(v.ox + X * v.k, v.oy + Y * v.k); }
    const pulse = 0.5 + 0.5 * Math.sin(t / 400);
    const grad = ctx.createLinearGradient(sx, sy, (pts[0] + pts[pts.length - 2]) / 2, (pts[1] + pts[pts.length - 1]) / 2);
    grad.addColorStop(0, `rgba(143,208,245,${0.5 + 0.1 * pulse})`); grad.addColorStop(1, 'rgba(143,208,245,0.06)');
    ctx.beginPath(); ctx.moveTo(sx, sy);
    for (let q = 0; q < pts.length; q += 2) ctx.lineTo(pts[q], pts[q + 1]);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = DARK; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = BLUE; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    // the standpoint: a bigger dot with a white ring
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fillStyle = DARK; ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fillStyle = '#2f8fd0'; ctx.fill();
  }

  // called from the page's top layer (above buildings): the coverage when the layer is on, the cone while a picture is open
  function draw(ctx, v, t, layerOn) {
    hits = [];
    const c = current();
    if (!layerOn && !c) return;
    if (!layerOn) status = '';
    else if (v.z < SHOW_FROM) status = 'Fotky z ulice se ukážou při větším přiblížení (světle modré tečky v ulicích).';
    if (layerOn && v.z >= SHOW_FROM) {
      const tz = 15;
      const [L, T, R, B] = ctx.__view || [0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight]; // (src/onscreen.js: the drawing's own size, not device px)
      // the visible part of the map in lon/lat (its four corners, with a margin), then the tiles over it
      const corners = [[L, T], [R, T], [L, B], [R, B]].map(([sx, sy]) => imgToLonLat((sx - v.ox) / v.k, (sy - v.oy) / v.k));
      const lons = corners.map(q => q[0]), lats = corners.map(q => q[1]);
      const [x0, y0] = tileXY(Math.min(...lons), Math.max(...lats), tz), [x1, y1] = tileXY(Math.max(...lons), Math.min(...lats), tz);
      const need = [];
      let loading = 0, failed = 0, wanted = 0;
      if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 30) for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { wanted++; const tl = tile(tz, x, y); if (!tl || tl.loading) loading++; else if (tl.failed) failed++; if (tl && !tl.loading && tl.seqs) need.push(tl); }
      const dots = v.z >= DOTS_FROM;
      status = loading ? 'Načítám, kde jsou fotky…' : wanted && failed === wanted ? 'Server Panoramaxu teď neodpovídá, zkusím to znovu.' : dots ? 'Modré tečky jsou fotky z ulice: plná 360° (dá se otáčet), prázdná obyčejná fotka. Kliknutím se rozhlédnete.' : 'Bledě modrá linka je nafocená ulice: kliknutím do ní se rozhlédnete, při větším přiblížení se rozpadne na jednotlivé fotky.';
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // a pale line along the photographed street …
      ctx.strokeStyle = LINE; ctx.lineWidth = dots ? 1.5 : 2.5;
      ctx.beginPath();
      for (const tl of need) for (const s of projected(tl).seqs) for (let i = 0; i < s.length; i += 2) { const x = v.ox + s[i] * v.k, y = v.oy + s[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      // … and, zoomed in more, the dots of the pictures: never closer than DOT_GAP px to one already drawn
      if (dots) {
        const r = v.z >= 6 ? 4.5 : 3.5, cell = DOT_GAP, kept = new Map();
        const free = (x, y) => { const cx = Math.floor(x / cell), cy = Math.floor(y / cell); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const k = kept.get(`${cx + i},${cy + j}`); if (k) for (let q = 0; q < k.length; q += 2) if (Math.hypot(k[q] - x, k[q + 1] - y) < DOT_GAP) return false; } const key = `${cx},${cy}`; (kept.get(key) || kept.set(key, []).get(key)).push(x, y); return true; };
        for (const tl of need) for (const [X, Y, p] of projected(tl).pics) {
          const x = Math.round(v.ox + X * v.k), y = Math.round(v.oy + Y * v.k);
          if (x < L - 8 || y < T - 8 || x > R + 8 || y > B + 8) continue;
          const sel = c && c.pic.id === p[2];
          if (!sel && !free(x, y)) continue;
          // a 360° picture: a filled dot; a flat photo: a hollow one
          ctx.fillStyle = sel ? '#f3c868' : p[4] ? BLUE : '#f3f8fc';
          ctx.beginPath(); ctx.arc(x, y, sel ? r + 2 : r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = p[4] || sel ? DARK : '#8fd0f5'; ctx.lineWidth = p[4] || sel ? 1 : 1.5; ctx.stroke();
          hits.push([x, y, p]);
        }
      }
      ctx.restore();
    }
    if (c) drawCone(ctx, v, c, t);
  }
  // the dot under the pointer: a picture stub { id, lon, lat } (or null)
  function at(sx, sy) {
    let pick = null, bd = 10;
    for (const h of hits) { const d = Math.hypot(h[0] - sx, h[1] - sy); if (d < bd) { bd = d; pick = h[2]; } }
    return pick ? { id: pick[2], lon: pick[0], lat: pick[1], yaw: pick[3] } : null;
  }

  // ---------------------------------------------------------------- the viewer in the card
  // heading: the compass direction to look at first (the way the map is turned, or towards the clicked building)
  function section(pic, { heading = 0, title = 'Pohled z ulice' } = {}) {
    const box = el('div', 'sec pano');
    box.append(el('h3', '', title));
    const view = el('div', 'pano-view');
    const canvas = el('canvas'); canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Fotka z ulice: tažením se rozhlédnete, kolečkem přiblížíte');
    const flatImg = el('img', 'pano-flat'); flatImg.alt = ''; flatImg.hidden = true; flatImg.referrerPolicy = 'no-referrer';
    const note = el('div', 'pano-note', 'Načítám fotku…');
    const comp = el('div', 'pano-compass');
    view.append(canvas, flatImg, note, comp);
    const btns = el('div', 'btns');
    const mk = (label, title) => { const b = el('button', 'pbtn small', label); b.type = 'button'; b.title = title; btns.append(b); return b; };
    const bPrev = mk('‹ Předchozí', 'Předchozí fotka v této řadě'), bNext = mk('Další ›', 'Další fotka v této řadě');
    const open = el('a', 'src-btn', 'Otevřít v Panoramaxu'); open.target = '_blank'; open.rel = 'noopener'; btns.append(open);
    const credit = el('p', 'credit');
    box.append(view, btns, credit);

    const st = (cur = { pic, yaw: heading, pitch: 0, hfov: 75, box, flat: false });
    let gl = null, raf = 0, busy = false, drag = null, pinch = null;
    const compass = () => { comp.textContent = st.flat ? `Obyčejná fotka (ne 360°, neotáčí se), dívá se na ${COMPASS[Math.round(norm(st.pic.yaw) / 45) % 8]}` : `Díváte se na ${COMPASS[Math.round(norm(st.yaw) / 45) % 8]}`; };
    function fit() {
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(view.clientWidth * dpr), h = Math.round(view.clientHeight * dpr);
      if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
    }
    const render = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (!st.flat && gl) { fit(); gl.draw(st.yaw, st.pitch, st.hfov, st.pic.yaw); } compass(); }); };
    const ro = 'ResizeObserver' in window ? new ResizeObserver(render) : null;
    if (ro) ro.observe(view);
    function describe() {
      credit.replaceChildren();
      const a = el('a', '', `Foto: ${st.pic.author}`); a.href = VIEW_URL(st.pic.id); a.target = '_blank'; a.rel = 'noopener';
      credit.append(a, document.createTextNode(`${st.pic.date ? `, ${fmtDate(st.pic.date)}` : ''} · Panoramax${st.pic.instance ? ` (${st.pic.instance})` : ''} · ${st.pic.license}`));
      open.href = VIEW_URL(st.pic.id);
      bPrev.disabled = !st.pic.prev; bNext.disabled = !st.pic.next;
    }
    async function load(p) {
      st.pic = p; busy = true; note.hidden = false; note.textContent = 'Načítám fotku…'; describe();
      st.flat = p.fov < 360;
      try {
        if (st.flat) {
          // a flat photo: shown as it is, the cone in the map takes its direction and angle of view
          await loadPic(flatImg, p.sd); flatImg.hidden = false; canvas.hidden = true;
        } else {
          const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
          await loadPic(img, p.sd);
          if (st.pic !== p) return;
          if (p.helmet === undefined) { p.helmet = helmetFix(img); if (p.helmet !== null) { p.yawSrc = p.yaw; p.yaw = fixedYaw(p.yaw, p.helmet); } }
          if (!gl) gl = sphere(canvas);
          if (!gl) { flatImg.src = img.src; flatImg.hidden = false; canvas.hidden = true; st.flat = true; } else { gl.image(img); flatImg.hidden = true; canvas.hidden = false; }
        }
        note.hidden = true;
      } catch {
        note.textContent = 'Fotka se teď nenačetla (server Panoramaxu neodpovídá). Zkuste to za chvíli nebo ji otevřete v Panoramaxu.';
      }
      busy = false; render();
      if (onMove) onMove(p);
    }
    const go = async id => { if (!id || busy) return; busy = true; note.hidden = false; note.textContent = 'Načítám další fotku…'; try { await load(await byId(id)); } catch { busy = false; note.textContent = 'Další fotka se nenačetla.'; } };
    bPrev.onclick = () => { track('Nástroj', { nastroj: 'pano-dalsi', hodnota: 'zpet' }); go(st.pic.prev); }; bNext.onclick = () => { track('Nástroj', { nastroj: 'pano-dalsi', hodnota: 'dal' }); go(st.pic.next); };
    // looking around: drag (mouse, finger), wheel and pinch for the angle of view, arrow keys
    canvas.addEventListener('pointerdown', e => { if (st.flat) return; canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true }); if (drag && drag.id !== e.pointerId) { pinch = { id2: e.pointerId, x: e.clientX, y: e.clientY, d0: Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0), f0: st.hfov }; return; } drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch }; });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      if (pinch && e.pointerId === pinch.id2) { pinch.x = e.clientX; pinch.y = e.clientY; st.hfov = clamp(pinch.f0 * (pinch.d0 / Math.max(10, Math.hypot(pinch.x - drag.x, pinch.y - drag.y))), 30, 120); render(); return; }
      if (e.pointerId !== drag.id) return;
      drag.x = e.clientX; drag.y = e.clientY;
      if (pinch) return;
      const k = st.hfov / Math.max(1, canvas.clientWidth);
      st.yaw = norm(drag.yaw - (e.clientX - drag.x0) * k); st.pitch = clamp(drag.pitch + (e.clientY - drag.y0) * k, -80, 80);
      render();
    });
    const up = e => { if (pinch && e.pointerId === pinch.id2) { pinch = null; if (drag) { drag.x0 = drag.x; drag.y0 = drag.y; drag.yaw = st.yaw; drag.pitch = st.pitch; } return; } if (drag && e.pointerId === drag.id) { drag = null; pinch = null; } };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => { if (st.flat) return; e.preventDefault(); st.hfov = clamp(st.hfov * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 30, 120); render(); }, { passive: false });
    canvas.addEventListener('keydown', e => {
      const step = st.hfov / 12;
      if (e.key === 'ArrowLeft') st.yaw = norm(st.yaw - step); else if (e.key === 'ArrowRight') st.yaw = norm(st.yaw + step);
      else if (e.key === 'ArrowUp') st.pitch = clamp(st.pitch + step, -80, 80); else if (e.key === 'ArrowDown') st.pitch = clamp(st.pitch - step, -80, 80);
      else if (e.key === '+') st.hfov = clamp(st.hfov / 1.12, 30, 120); else if (e.key === '-') st.hfov = clamp(st.hfov * 1.12, 30, 120);
      else return;
      e.preventDefault(); render();
    });
    // the card closes or shows something else: free the WebGL context
    const watch = setInterval(() => { if (alive(box)) return; clearInterval(watch); if (ro) ro.disconnect(); if (gl) gl.lose(); if (cur === st) cur = null; }, 1500);
    load(pic);
    return box;
  }
  // in a building's card: a button, the picture only on request (no requests for every click on a house)
  function buildingSection(lon, lat, maxM, openPic) {
    const box = el('div', 'sec pano');
    box.append(el('h3', '', 'Pohled z ulice'));
    const row = el('div', 'btns');
    const b = el('button', 'pbtn small', 'Ukázat fotku z ulice'); b.type = 'button'; b.title = 'Fotka od dobrovolníků z Panoramaxu, která se na tento dům dívá';
    const note = el('p', 'livenote', 'Fotky ulic od dobrovolníků (Panoramax, CC BY-SA 4.0).');
    row.append(b); box.append(row, note);
    b.onclick = async () => {
      track('Nástroj', { nastroj: 'pano-fotka-domu' });
      b.disabled = true; note.textContent = 'Hledám fotku…';
      try {
        const p = await lookingAt(lon, lat, maxM);
        if (!p) { note.textContent = 'Z ulice tu zatím žádná fotka není. Nafotit ji může kdokoli s 360° kamerou nebo telefonem (panoramax.fr).'; b.hidden = true; return; }
        box.replaceWith(openPic ? openPic(p, p.toward) : section(p, { heading: p.toward }));
      } catch { note.textContent = 'Server Panoramaxu teď neodpovídá, zkuste to za chvíli.'; b.disabled = false; }
    };
    return box;
  }
  return { nearest, lookingAt, byId, draw, at, section, buildingSection, current, status: () => status, SHOW_FROM, VIEW_URL };
}

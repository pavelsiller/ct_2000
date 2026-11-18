import { onScreen, imgPoints } from './onscreen.js';
const STORE = 'b2k-camdirs';
const loadOwn = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };

export function createWebcams({ base, llToImg }) {
  const pts = imgPoints(llToImg); // (the image points of the items, kept between the frames)
  let cams = [], loading = null, hits = [];
  let sel = null; // { g, i }
  let own = loadOwn();
  const load = () => (loading ||= fetch(`${base}data/webcams.json`).then(r => (r.ok ? r.json() : [])).then(d => { cams = d; }).catch(() => { cams = []; }));
  // corrections of one camera: { dir, fov, reach, lon, lat } (older ones: just a number = direction)
  const fixOf = v => { const o = own[v.id]; return o === undefined ? {} : typeof o === 'number' ? { dir: o } : o; };
  const dirOf = v => fixOf(v).dir ?? v.dir;
  const dirSrcOf = v => (fixOf(v).dir !== undefined ? 'opraveno v tomto prohlížeči' : v.dirSrc);
  const fovOf = v => fixOf(v).fov ?? v.fov ?? 60;
  const posOf = (g, v) => { const f = fixOf(v); return f.lon !== undefined ? [f.lon, f.lat] : [v.lon ?? g.lon, v.lat ?? g.lat]; };
  // how far the cone reaches (metres): panoramas far, traffic cameras to the junction / road ahead
  const reach0 = (g, v) => (/Hvězdárna|přehrad/i.test(g.name) ? 900 : /^D\d|dálnice/i.test(`${g.name} ${v.view}`) ? 260 : 140);
  const reach = (g, v) => fixOf(v).reach ?? v.reach ?? reach0(g, v);
  const offset = (lon, lat, brg, m) => {
    const b = (brg * Math.PI) / 180;
    return [lon + (Math.sin(b) * m) / (Math.cos((lat * Math.PI) / 180) * 111320), lat + (Math.cos(b) * m) / 110574];
  };

  function drawCone(ctx, v, t) {
    const { g, i } = sel;
    const cv = g.views[i];
    const [lon, lat] = posOf(g, cv);
    const d = dirOf(cv), R = reach(g, cv), fov = fovOf(cv);
    const [X0, Y0] = llToImg(lon, lat);
    const sx = v.ox + X0 * v.k, sy = v.oy + Y0 * v.k;
    // fan of points along the far edge of the view, projected through the map (so rotation and terrain fit)
    const pts = [];
    for (let a = -fov / 2; a <= fov / 2 + 0.01; a += Math.max(2, fov / 12)) { const [l2, a2] = offset(lon, lat, d + a, R); const [X, Y] = llToImg(l2, a2); pts.push(v.ox + X * v.k, v.oy + Y * v.k); }
    const pulse = 0.5 + 0.5 * Math.sin(t / 400);
    const grad = ctx.createLinearGradient(sx, sy, (pts[0] + pts[pts.length - 2]) / 2, (pts[1] + pts[pts.length - 1]) / 2);
    grad.addColorStop(0, `rgba(243,200,104,${0.55 + 0.1 * pulse})`); grad.addColorStop(1, 'rgba(243,200,104,0.08)');
    ctx.beginPath(); ctx.moveTo(sx, sy);
    for (let q = 0; q < pts.length; q += 2) ctx.lineTo(pts[q], pts[q + 1]);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(22,29,43,.8)'; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#f3c868'; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    // centre line: the direction itself
    const [lm, am] = offset(lon, lat, d, R);
    const [Xm, Ym] = llToImg(lm, am);
    ctx.strokeStyle = 'rgba(243,200,104,.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(v.ox + Xm * v.k, v.oy + Ym * v.k); ctx.stroke();
  }

  // the cameras appear from v.z 0.19 (about 10.5 m per pixel; until 2026-11-15 0.12, one step of the + button earlier)
  const CAM_Z = 0.19;
  function draw(ctx, v, t) {
    hits = []; pts.begin();
    if (!cams.length) { load(); return; }
    if (v.z < CAM_Z && !sel) return;
    if (sel) drawCone(ctx, v, t);
    const s = v.z >= 0.6 ? 1.4 : 1;
    for (const c of cams) {
      const isSel = sel && sel.g === c;
      if (v.z < CAM_Z && !isSel) continue;
      const cv = isSel ? c.views[sel.i] : c.views[0];
      const [cl, ca] = posOf(c, cv);
      const [X, Y] = pts.of(c, cl, ca);
      const x = Math.round(v.ox + X * v.k), y = Math.round(v.oy + Y * v.k);
      if (!onScreen(ctx, x, y, 30)) continue;
      const k = isSel ? s * 1.3 : s;
      // selected: a pulsing ring around the sign
      if (isSel) {
        const r = 18 * k + 3 * Math.sin(t / 250);
        ctx.strokeStyle = 'rgba(22,29,43,.8)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y - 10 * k, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#f3c868'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 10 * k, r, 0, Math.PI * 2); ctx.stroke();
      }
      // pixel camera on a short pole, its lens turned to the left or right after the view direction
      const w = Math.round(12 * k), h = Math.round(8 * k), py = y - Math.round(12 * k);
      if (!isSel && ctx.__claim && !ctx.__claim(x - w, py - h, x + w, y + 2)) continue;
      const [Xd] = llToImg(...offset(cl, ca, dirOf(cv), 50));
      const right = Xd >= X ? 1 : -1;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - w / 2 + 2, py - h / 2 + 2, w + 3, h);
      ctx.fillStyle = '#161d2b'; ctx.fillRect(x - 1, py, 2, y - py);
      ctx.fillRect(x - w / 2 - 1, py - h / 2 - 1, w + 2, h + 2);
      ctx.fillRect(right > 0 ? x + w / 2 : x - w / 2 - Math.round(4 * k), py - h / 2 + 1, Math.round(4 * k), h - 2); // lens hood
      ctx.fillStyle = isSel ? '#f3c868' : c.kind === 'link' ? '#9aa3ad' : '#f0f2ea'; ctx.fillRect(x - w / 2, py - h / 2, w, h);
      ctx.fillStyle = '#2f6fb7'; ctx.fillRect(right > 0 ? x + w / 2 - Math.round(4 * k) : x - w / 2 + 1, py - Math.round(2 * k), Math.round(3 * k), Math.round(3 * k));
      ctx.fillStyle = '#d8342c'; ctx.fillRect(right > 0 ? x - w / 2 + 2 : x + w / 2 - 4, py - h / 2 + 2, Math.max(2, Math.round(2 * k)), Math.max(2, Math.round(2 * k))); // recording light
      hits.push([x - w, py - h, x + w, y + 2, c]);
    }
  }
  const at = (sx, sy) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]) return h[4]; } return null; };
  // [ADMIN] corrections made while tuning the map (kept in this browser)
  function setFix(v, patch) {
    own = loadOwn();
    if (patch === null) delete own[v.id];
    else {
      const f = { ...fixOf(v), ...patch };
      if (f.dir !== undefined) f.dir = ((Math.round(f.dir) % 360) + 360) % 360;
      if (f.fov !== undefined) f.fov = Math.max(10, Math.min(170, Math.round(f.fov)));
      if (f.reach !== undefined) f.reach = Math.max(20, Math.min(3000, Math.round(f.reach)));
      if (f.lon !== undefined) { f.lon = +f.lon.toFixed(6); f.lat = +f.lat.toFixed(6); }
      own[v.id] = f;
    }
    localStorage.setItem(STORE, JSON.stringify(own));
  }
  const setDir = (v, deg) => setFix(v, deg === null ? null : { dir: deg });
  // direction from the camera to a point clicked in the map
  function dirTo(g, v, lon, lat) { const [l0, a0] = posOf(g, v); const dx = (lon - l0) * Math.cos((a0 * Math.PI) / 180), dy = lat - a0; return [(Math.atan2(dx, dy) * 180) / Math.PI, Math.hypot(dx * 111320, dy * 110574)]; }
  return {
    load, draw, at, list: () => cams,
    select: (g, i = 0) => { sel = g ? { g, i } : null; },
    selected: () => sel,
    dirOf, dirSrcOf, fovOf, posOf, reachOf: reach, fixOf, setDir, setFix, dirTo,
    own: () => loadOwn(),
  };
}

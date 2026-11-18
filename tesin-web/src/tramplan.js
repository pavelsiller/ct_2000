import { fetchData, watchFeed, RELOAD } from './feed.js';
export function createTramPlan({ base, llToImg }) {
  let data = null, loading = null, img = null, imgKey = null, selected = false;
  const load = init => (loading ||= fetchData(`${base}data/tramplan.json`, init).then(r => (r.ok ? r.json() : null)).then(d => { if (d) { data = d; img = null; } }).catch(() => {}));
  watchFeed('tramplan.json', () => loading && (loading = null, load(RELOAD))); // (src/feed.js)
  const bboxOf = p => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); } return [x0, y0, x1, y1]; };
  function project() {
    const k = llToImg(16.6, 49.2).join(',');
    if (img && imgKey === k) return img;
    imgKey = k;
    img = data.lines.map(p => { const pts = []; for (let i = 0; i < p.length; i += 2) pts.push(...llToImg(p[i], p[i + 1])); pts.bb = bboxOf(pts); return pts; });
    return img;
  }
  function draw(ctx, v) {
    if (!data) { load(); return; }
    if (v.z < 0.25 || !data.lines.length) return;
    const list = project();
    const w = v.z >= 0.8 ? 3.5 : 2.5;
    ctx.save();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    const [vx0, vy0, vx1, vy1] = ctx.__view || [0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight]; // (src/onscreen.js)
    for (const pts of list) {
      const b = pts.bb; // a line wholly off the screen is left out (12 px to spare for its width)
      if (v.ox + b[2] * v.k < vx0 - 12 || v.ox + b[0] * v.k > vx1 + 12 || v.oy + b[3] * v.k < vy0 - 12 || v.oy + b[1] * v.k > vy1 + 12) continue;
      const path = () => { ctx.beginPath(); for (let i = 0; i < pts.length; i += 2) { const x = v.ox + pts[i] * v.k, y = v.oy + pts[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } };
      ctx.setLineDash([]); path(); ctx.strokeStyle = 'rgba(22,29,43,.75)'; ctx.lineWidth = w + 3; ctx.stroke();
      path(); ctx.strokeStyle = selected ? '#e2c4ff' : '#a066e0'; ctx.lineWidth = w + 1; ctx.stroke();
      ctx.lineCap = 'round'; path(); ctx.setLineDash([0.1, 9]); ctx.strokeStyle = '#f6f0ff'; ctx.lineWidth = Math.max(2, w - 1); ctx.stroke(); ctx.lineCap = 'butt';
    }
    ctx.restore();
  }
  function at(sx, sy, v) {
    if (!data || !img || v.z < 0.25) return false;
    const X = (sx - v.ox) / v.k, Y = (sy - v.oy) / v.k, tol = 7 / v.k;
    for (const p of img) for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2], ay = p[i - 1], dx = p[i] - ax, dy = p[i + 1] - ay, L2 = dx * dx + dy * dy || 1;
      const f = Math.max(0, Math.min(1, ((X - ax) * dx + (Y - ay) * dy) / L2));
      if (Math.hypot(ax + dx * f - X, ay + dy * f - Y) < tol) return true;
    }
    return false;
  }
  const lengthKm = () => (data ? data.lines.reduce((s, p) => { for (let i = 2; i < p.length; i += 2) s += Math.hypot((p[i] - p[i - 2]) * 72765, (p[i + 1] - p[i - 1]) * 110574); return s; }, 0) / 1000 : 0);
  return { load, draw, at, lengthKm, data: () => data, select: s => (selected = s) };
}

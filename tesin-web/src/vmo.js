export const VMO_STYLE = {
  built: { c: '#f3c868', w: 4, dash: [], label: 'hotový úsek' },
  construction: { c: '#f08a3c', w: 4, dash: [8, 4], label: 've výstavbě' },
  provisional: { c: '#c9cfbf', w: 2.5, dash: [2, 5], label: 'dnes provizorně po městských ulicích' },
  planned: { c: '#f3c868', w: 3, dash: [10, 7], label: 'plánovaný úsek' },
};
export function createVmo({ base, llToImg }) {
  let data = null, loading = null, img = null, imgKey = null, hover = false, selected = false;
  const load = () => (loading ||= fetch(`${base}data/vmo.json`).then(r => (r.ok ? r.json() : null)).then(d => { data = d; }).catch(() => {}));
  // image positions (they change with the rotation, so recomputed when llToImg gives new values)
  function project() {
    const k = llToImg(16.6, 49.2).join(',');
    if (img && imgKey === k) return img;
    imgKey = k;
    img = data.sections.map(sec => {
      const pts = []; for (let i = 0; i < sec.p.length; i += 2) pts.push(...llToImg(sec.p[i], sec.p[i + 1]));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
      return { s: sec.s, pts, bb: [x0, y0, x1, y1] }; // (bb: sections out of the view or far from the pointer are skipped)
    });
    return img;
  }
  function draw(ctx, v, t) {
    if (!data) { load(); return; }
    if (v.z < 2 / 3) return; // only from 3 m per pixel (zoomed out it is too dominant)
    const list = project();
    const order = ['provisional', 'planned', 'construction', 'built'];
    const glow = selected || hover;
    const [vx0, vy0, vx1, vy1] = ctx.__view || [0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight], m = 12; // (src/onscreen.js)
    const seen = b => !(v.ox + b[2] * v.k < vx0 - m || v.ox + b[0] * v.k > vx1 + m || v.oy + b[3] * v.k < vy0 - m || v.oy + b[1] * v.k > vy1 + m);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const st of order) {
      const S = VMO_STYLE[st];
      const w = S.w * (v.z >= 0.5 ? 1.3 : 1) + (glow ? 1.5 : 0);
      for (const sec of list) {
        if (sec.s !== st || !seen(sec.bb)) continue;
        const path = () => { ctx.beginPath(); for (let i = 0; i < sec.pts.length; i += 2) { const x = v.ox + sec.pts[i] * v.k, y = v.oy + sec.pts[i + 1] * v.k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } };
        path(); ctx.setLineDash([]); ctx.strokeStyle = 'rgba(22,29,43,.75)'; ctx.lineWidth = w + 3; if (st !== 'provisional') ctx.stroke();
        path(); ctx.setLineDash(S.dash); ctx.strokeStyle = selected ? '#ffe7a0' : S.c; ctx.lineWidth = w;
        if (st === 'construction') ctx.lineDashOffset = -(t / 60) % 12;
        ctx.stroke(); ctx.lineDashOffset = 0;
      }
    }
    ctx.restore();
  }
  // is the screen point (sx, sy) on the line? (within a few pixels of any section)
  function at(sx, sy, v) {
    if (!data || !img || v.z < 2 / 3) return false;
    const X = (sx - v.ox) / v.k, Y = (sy - v.oy) / v.k, tol = 7 / v.k;
    for (const sec of img) {
      const b = sec.bb;
      if (X < b[0] - tol || X > b[2] + tol || Y < b[1] - tol || Y > b[3] + tol) continue;
      const p = sec.pts;
      for (let i = 2; i < p.length; i += 2) {
        const ax = p[i - 2], ay = p[i - 1], bx = p[i], by = p[i + 1];
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        const f = Math.max(0, Math.min(1, ((X - ax) * dx + (Y - ay) * dy) / L2));
        if (Math.hypot(ax + dx * f - X, ay + dy * f - Y) < tol) return true;
      }
    }
    return false;
  }
  const lengths = () => {
    if (!data) return {};
    const out = {};
    for (const sec of data.sections) { let L = 0; for (let i = 2; i < sec.p.length; i += 2) L += Math.hypot((sec.p[i] - sec.p[i - 2]) * 72765, (sec.p[i + 1] - sec.p[i - 1]) * 110574); out[sec.s] = (out[sec.s] || 0) + L; }
    return out;
  };
  return { load, draw, at, lengths, data: () => data, setHover: h => (hover = h), select: s => (selected = s) };
}

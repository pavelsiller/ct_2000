const VEST = ['#ff7a1a', '#d4ef2f', '#ff7a1a', '#ffd21f'], HELMET = ['#ffffff', '#ffd21f', '#ff7a1a', '#f4f4f4'], SKIN = ['#f0c8a0', '#e0ac7a', '#c68642'];
const ROLES = ['dig', 'throw', 'lean', 'hammer', 'dig', 'barrow', 'throw', 'boss', 'dig', 'throw'];
const rnd = seed => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function makeCrew(seed, n) {
  const r = rnd(seed), men = [];
  for (let i = 0; i < n; i++) {
    men.push({ role: ROLES[i % ROLES.length], along: (i - (n - 1) / 2) * 7 + (r() - 0.5) * 3, side: (i % 2 ? 3.2 : -3.2) + (r() - 0.5) * 2, face: r() < 0.5 ? 1 : -1, ph: r() * 10, speed: 0.75 + r() * 0.5,
      vest: VEST[Math.floor(r() * VEST.length)], helmet: HELMET[Math.floor(r() * HELMET.length)], skin: SKIN[Math.floor(r() * SKIN.length)] });
  }
  return { men, n, truck: r() < 0.5 ? 1 : -1, pile: r() < 0.5 ? 1 : -1 };
}

// where the site stands, for the houses in front of it to step back (src/layers.js): the trench at five places and the
// lorry, as [along the street, across it] in the units of the figures
export const crewSpots = crew => { const half = (crew.n * 7) / 2 + 4; return [[-half, 0], [-half / 2, 0], [0, 0], [half / 2, 0], [half, 0], [-(half + 11) * crew.truck, -4.5 * crew.pile]]; };

export function drawCrew(ctx, x, y, u, t, crew, dir, o = {}) {
  const dl = Math.hypot(dir[0], dir[1]) || 1, ax = dir[0] / dl, ay = dir[1] / dl, px = -ay, py = ax; // along the street, across it
  const at = (along, side) => [x + (ax * along + px * side) * u, y + (ay * along + py * side) * u];
  const half = (crew.n * 7) / 2 + 4, sec = t / 1000;
  ctx.save();
  ctx.lineCap = 'butt';
  // the lamps of the evening: a pool of light on the ground under everything
  if (o.night) {
    const g = ctx.createRadialGradient(x, y, 2 * u, x, y, (half + 14) * u);
    g.addColorStop(0, 'rgba(255,238,160,.42)'); g.addColorStop(0.6, 'rgba(255,238,160,.2)'); g.addColorStop(1, 'rgba(255,238,160,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, (half + 14) * u, (half * 0.55 + 9) * u, Math.atan2(ay, ax), 0, 2 * Math.PI); ctx.fill();
  }
  // the trench along the street and the heap beside it
  const [t0x, t0y] = at(-half, 0), [t1x, t1y] = at(half, 0);
  ctx.strokeStyle = '#4a3523'; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(t0x, t0y); ctx.lineTo(t1x, t1y); ctx.stroke();
  ctx.strokeStyle = '#231810'; ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.moveTo(t0x, t0y); ctx.lineTo(t1x, t1y); ctx.stroke();
  const [hx, hy] = at(half * 0.35, 6.5 * crew.pile);
  ctx.fillStyle = '#5e4129'; ctx.fillRect(hx - 4 * u, hy - 1.2 * u, 8 * u, 1.4 * u);
  ctx.fillStyle = '#74522f'; ctx.fillRect(hx - 2.8 * u, hy - 2.4 * u, 5.6 * u, 1.3 * u);
  ctx.fillStyle = '#8a6439'; ctx.fillRect(hx - 1.4 * u, hy - 3.4 * u, 2.8 * u, 1.1 * u);
  // what stands on the site, from the back to the front
  const things = [];
  const [kx, ky] = at(-(half + 11) * crew.truck, -4.5 * crew.pile);
  things.push([ky, () => truck(ctx, kx, ky, u, ax * crew.truck >= 0 ? -1 : 1, sec, o.night)]);
  if (o.night) { const [lx, ly] = at((half + 4) * crew.truck, -5 * crew.pile), [mx, my] = at(-half * 0.2, 6 * crew.pile); things.push([ly, () => lamp(ctx, lx, ly, u)], [my, () => lamp(ctx, mx, my, u)]); }
  if (!o.asleep) {
    for (const m of crew.men) {
      let along = m.along, face = m.face;
      const ph = sec * m.speed + m.ph;
      if (m.role === 'barrow') { const q = (ph * 0.22) % 2, tri = q < 1 ? q : 2 - q; along = -half + tri * 2 * half; face = (q < 1 ? 1 : -1) * (ax >= 0 ? 1 : -1); }
      if (m.role === 'boss' && Math.floor(ph * 0.12) % 2) face = -face;
      const [mx, my] = at(along, m.side);
      things.push([my, () => man(ctx, mx, my, u, face, m, ph, o.night)]);
    }
  }
  things.sort((a, b) => a[0] - b[0]);
  for (const [, f] of things) f();
  ctx.restore();
}

// ---- one worker; (x, y) the middle of his feet, f = 1 facing right, -1 left
function man(ctx, x, y, u, f, m, ph, night) {
  const R = (col, lx, ly, w, h) => { ctx.fillStyle = col; ctx.fillRect(f > 0 ? x + lx * u : x - (lx + w) * u, y + ly * u, w * u, h * u); };
  const P = (lx, ly) => [x + f * lx * u, y + ly * u];
  const stick = (a, b, col, w) => { const [x0, y0] = P(...a), [x1, y1] = P(...b); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w * u); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  const pants = '#2b3a55', stripe = night ? '#ffffff' : '#e9ecef', wood = '#9a6b3a', steel = '#aab2bd', soil = '#6b4a2e';
  let c = ph % 1.7, bent = false, jx = 0;
  if (m.role === 'throw') c = (ph + 0.6) % 1.7;
  if (m.role === 'dig' || m.role === 'throw') bent = c < 0.55;
  if (m.role === 'hammer') jx = Math.floor(ph * 14) % 2 ? 0.2 : -0.2;
  const walk = m.role === 'barrow' ? Math.floor(ph * 5) % 2 : -1;
  R('rgba(0,0,0,.3)', -1.6, 0, 3.4, 0.8);
  // legs
  if (walk === 1) { R(pants, -1.3, -2.4, 0.9, 2.4); R(pants, 0.5, -2.0, 0.9, 2.0); } else if (walk === 0) { R(pants, -1.0, -2.0, 0.9, 2.0); R(pants, 0.3, -2.4, 0.9, 2.4); } else { R(pants, -1.0 + jx, -2.4, 0.9, 2.4); R(pants, 0.2 + jx, -2.4, 0.9, 2.4); }
  if (bent) { // leaning over the shovel
    R(m.vest, -0.9, -4.6, 2.9, 2.3); R(stripe, -0.9, -3.7, 2.9, 0.5);
    R(m.skin, 1.9, -5.3, 1.2, 1.2); R(m.helmet, 1.6, -6.0, 1.9, 0.8);
    stick([1.8, -3.0], [3.6, -0.4], wood, 0.45); R(steel, 3.1, -0.6, 1.2, 0.8);
    R(m.skin, 1.4, -3.4, 0.8, 0.7);
    return;
  }
  // upright
  R(m.vest, -1.2 + jx, -5.4, 2.5, 3.1); R(stripe, -1.2 + jx, -4.3, 2.5, 0.55); R(stripe, -1.2 + jx, -3.2, 2.5, 0.4);
  R(m.skin, -0.5 + jx, -6.7, 1.3, 1.3); R(m.helmet, -0.8 + jx, -7.5, 1.9, 0.9); R(m.helmet, 0.7 + jx, -6.8, 0.7, 0.3);
  if (m.role === 'dig' || m.role === 'throw') {
    if (c < 0.95) { // lifting the load
      stick([1.2, -3.8], [3.6, -2.9], wood, 0.45); R(steel, 3.3, -3.3, 1.3, 0.7); R(soil, 3.4, -3.9, 1.1, 0.7); R(m.skin, 1.0, -4.2, 0.8, 0.7);
    } else if (c < 1.3) { // throwing it
      stick([1.0, -4.6], [3.0, -6.4], wood, 0.45); R(steel, 2.7, -7.0, 1.3, 0.7); R(m.skin, 0.9, -5.0, 0.8, 0.7);
      const q = (c - 0.95) / 0.35;
      for (let k = 0; k < 3; k++) R(soil, 3.4 + q * (3.5 + k * 1.4), -7.2 - Math.sin(q * Math.PI) * (2.2 - k * 0.5) + q * q * 4.5, 0.7, 0.7);
    } else { stick([1.2, -3.6], [2.8, -0.8], wood, 0.45); R(steel, 2.4, -0.9, 1.2, 0.7); R(m.skin, 1.0, -4.0, 0.8, 0.7); } // back to the trench
  } else if (m.role === 'lean') { // the one who watches the others work
    stick([1.7, -5.6], [1.7, -0.3], wood, 0.45); R(steel, 1.2, -0.7, 1.1, 0.8);
    if (ph % 7 < 1.2) R(m.skin, 0.6, -6.3, 1.1, 0.6); else R(m.skin, 1.2, -4.9, 0.8, 0.7); // (now and then a drink)
  } else if (m.role === 'hammer') { // the pneumatic hammer
    R('#59606b', 0.9 + jx, -3.6, 1.0, 3.3); R('#2a2e35', 1.15 + jx, -0.4, 0.5, 0.6); R('#ffd21f', 0.5 + jx, -3.9, 1.8, 0.5); R(m.skin, 0.5 + jx, -4.3, 0.7, 0.6);
    if (Math.floor(ph * 7) % 2) { R('rgba(210,205,195,.8)', 2.0, -0.9, 0.8, 0.7); R('rgba(210,205,195,.6)', 0.1, -0.6, 0.6, 0.5); }
  } else if (m.role === 'barrow') { // the wheelbarrow between the heap and the lorry
    stick([1.0, -3.3], [2.2, -2.2], '#59606b', 0.4); R('#7b8794', 1.9, -2.9, 3.1, 1.3); R(soil, 2.2, -3.5, 2.5, 0.7); R('#22262c', 4.3, -1.1, 1.1, 1.1); R(m.skin, 0.8, -3.7, 0.7, 0.6);
  } else { // the foreman: a plan in one hand, the other points
    R('#f4f4f4', -2.2, -4.6, 1.2, 1.5); R(m.vest, 1.2, -4.9, 1.9, 0.6); R(m.skin, 3.0, -4.95, 0.7, 0.7);
  }
}

// ---- the small tipper; (x, y) the middle of its wheels on the ground, f = 1 the cab on the right
function truck(ctx, x, y, u, f, sec, night) {
  const R = (col, lx, ly, w, h) => { ctx.fillStyle = col; ctx.fillRect(f > 0 ? x + lx * u : x - (lx + w) * u, y + ly * u, w * u, h * u); };
  R('rgba(0,0,0,.3)', -8.5, 0, 16, 1);
  R('#f08a3c', -8, -5.6, 9.6, 3.6); R('#c96a22', -8, -2.4, 9.6, 0.6); R('#6b4a2e', -7.4, -6.5, 8.4, 1.0); R('#8a6439', -6, -7.1, 5, 0.7);
  R('#ffd21f', 2.0, -6.4, 4.6, 4.6); R(night ? '#ffe9a0' : '#a9d8ff', 3.9, -5.8, 2.2, 1.9); R('#d9b312', 2.0, -2.4, 4.6, 0.6);
  R('#2a2e35', 6.6, -2.6, 0.6, 1.1); R('#1b1f25', -6.6, -1.9, 2.4, 2.1); R('#1b1f25', 2.9, -1.9, 2.4, 2.1); R('#8a8f98', -5.8, -1.2, 0.8, 0.7); R('#8a8f98', 3.7, -1.2, 0.8, 0.7);
  R(Math.floor(sec * 2) % 2 ? '#ffb000' : '#7a5200', 3.6, -7.2, 1.1, 0.8); // the beacon
  if (night) { R('#fff6c0', 6.6, -3.6, 0.7, 0.9); ctx.fillStyle = 'rgba(255,246,192,.25)'; ctx.beginPath(); ctx.moveTo(x + f * 7.2 * u, y - 3.2 * u); ctx.lineTo(x + f * 15 * u, y - 5.5 * u); ctx.lineTo(x + f * 15 * u, y + 0.5 * u); ctx.closePath(); ctx.fill(); }
}

// ---- a lamp on a tripod
function lamp(ctx, x, y, u) {
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 1.5 * u, y, 3 * u, 0.7 * u);
  ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = Math.max(1, 0.45 * u);
  ctx.beginPath(); ctx.moveTo(x, y - 9 * u); ctx.lineTo(x, y - 2 * u); ctx.lineTo(x - 1.6 * u, y); ctx.moveTo(x, y - 2 * u); ctx.lineTo(x + 1.6 * u, y); ctx.stroke();
  ctx.fillStyle = '#3a3f48'; ctx.fillRect(x - 2.2 * u, y - 10.4 * u, 4.4 * u, 1.6 * u);
  ctx.fillStyle = '#fff8cf'; ctx.fillRect(x - 1.8 * u, y - 10.1 * u, 3.6 * u, 1.0 * u);
  const g = ctx.createRadialGradient(x, y - 9.6 * u, 0, x, y - 9.6 * u, 7 * u);
  g.addColorStop(0, 'rgba(255,248,207,.75)'); g.addColorStop(1, 'rgba(255,248,207,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 9.6 * u, 7 * u, 0, 2 * Math.PI); ctx.fill();
}

const K = '#161d2b', W = '#f0f2ea';
// Sprite shapes, facing right. Letters: a = main colour, b = second colour (mane, pattern, antlers), c = shade
// (belly, legs' inside), k = dark (hooves, nose, eye), w = white, . = nothing.
//   legs  = how many bottom rows are legs (they step while walking, and are left out when the animal lies down)
//   neck  = from which column the head and neck begin (those pixels move down when the animal grazes)
//   graze = how many rows the head goes down for grazing
const SHAPES = {
  horse: { legs: 3, neck: 9, graze: 3, rows: [
    '..........kaa.',
    '..........aaak',
    '.........aaak.',
    '.........aa...',
    '..bbaaaaaaa...',
    '.bbaaaaaaaa...',
    '.baaaaaaaaa...',
    '.bcccccccca...',
    '..a.aa...a.a..',
    '..a.aa...a.a..',
    '..k.kk...k.k..'] },
  deer: { legs: 3, neck: 9, graze: 3, rows: [
    '.........b.b..',
    '.........bbb..',
    '..........kaa.',
    '..........aaak',
    '.........aaak.',
    '.........aa...',
    '..aaaaaaaaa...',
    '.aaaaaaaaaa...',
    '.waaaaaaaaa...',
    '.wcccccccca...',
    '..a.aa...a.a..',
    '..a.aa...a.a..',
    '..k.kk...k.k..'] },
  stocky: { legs: 2, neck: 9, graze: 2, rows: [
    '.........kaa.',
    '........aaaak',
    '.aaaaaaaaaak.',
    '.aaaaaaaaaa..',
    '.aaaaaaaaaa..',
    '.cccccccca...',
    '..a.aa..a.a..',
    '..k.kk..k.k..'] },
  horned: { legs: 2, neck: 9, graze: 2, rows: [
    '.........b..b',
    '..........bb.',
    '.........kaa.',
    '........aaaak',
    '.aaaaaaaaaak.',
    '.aaaaaaaaaa..',
    '.aaaaaaaaaa..',
    '.cccccccca...',
    '..a.aa..a.a..',
    '..k.kk..k.k..'] },
  bison: { legs: 2, neck: 10, graze: 2, rows: [
    '....aaaa......',
    '...aaaaaa.....',
    '..aaaaaaaabka.',
    '.aaaaaaaaaaaak',
    '.aaaaaaaaaaak.',
    '.aaaaaaaaaaa..',
    '.bbbbbbbbaaa..',
    '..a.aa...a.a..',
    '..k.kk...k.k..'] },
  camel: { legs: 3, neck: 11, graze: 3, rows: [
    '...aa..aa....ka',
    '..aaaa.aaaa..aa',
    '.aaaaaaaaaaa.ak',
    '.aaaaaaaaaaa.a.',
    '.aaaaaaaaaaaaa.',
    '.ccccccccccca..',
    '..a..a....a..a.',
    '..a..a....a..a.',
    '..k..k....k..k.'] },
  giraffe: { legs: 4, neck: 10, graze: 5, rows: [
    '...........k.k.',
    '...........kaa.',
    '...........aaak',
    '..........aaa..',
    '..........aa...',
    '..........aa...',
    '.........baa...',
    '.........baa...',
    '....aaaaaaa....',
    '..baaaaaaaa....',
    '.baaaaaaaaa....',
    '.bcccccccca....',
    '..a..aa...a.a..',
    '..a..aa...a.a..',
    '..a..aa...a.a..',
    '..k..kk...k.k..'] },
  cat: { legs: 2, neck: 9, graze: 1, rows: [
    '.........k.k.',
    '.........aaak',
    'a.aaaaaaaaaa.',
    '.aaaaaaaaaa..',
    '.cccccccca...',
    '..a.aa..a.a..',
    '..k.kk..k.k..'] },
  lion: { legs: 2, neck: 9, graze: 1, rows: [
    '.........bbb.',
    '........bbkab',
    'a.aaaaaabbaak',
    '.aaaaaaabbbb.',
    '.aaaaaaaaab..',
    '.cccccccca...',
    '..a.aa..a.a..',
    '..k.kk..k.k..'] },
  dog: { legs: 2, neck: 8, graze: 1, rows: [
    '........k.k.',
    '........aaak',
    'aa.aaaaaaaa.',
    '.aaaaaaaaa..',
    '.cccccccc...',
    '..a.aa..a.a.',
    '..k.kk..k.k.'] },
  longdog: { legs: 3, neck: 8, graze: 1, rows: [
    '........k.k.',
    '........aaak',
    'aa.aaaaaaaa.',
    '.aaaaaaaaa..',
    '.cccccccc...',
    '..a.aa..a.a.',
    '..a.aa..a.a.',
    '..k.kk..k.k.'] },
  bear: { legs: 2, neck: 9, graze: 1, rows: [
    '.........k.k.',
    '.........aaak',
    '..aaaaaaaaaa.',
    '.aaaaaaaaaa..',
    '.aaaaaaaaaa..',
    '.cccccccca...',
    '..aa.aa..aa..',
    '..kk.kk..kk..'] },
  tapir: { legs: 2, neck: 8, graze: 1, rows: [
    '........k.k.',
    '........aaak',
    '.aaaaaaaaaa.',
    '.abbbbbbaaa.',
    '.abbbbbba...',
    '..a.aa..a.a.',
    '..k.kk..k.k.'] },
  capybara: { legs: 1, neck: 7, graze: 1, rows: [
    '.......k.k',
    '.......aak',
    '.aaaaaaaa.',
    '.aaaaaaaa.',
    '.cccccca..',
    '..k.kk.k..'] },
  ostrich: { legs: 3, neck: 7, graze: 4, rows: [
    '.......kaak',
    '.......aa..',
    '.......a...',
    '.......a...',
    '.......a...',
    '..aaaaaa...',
    '.aaaaaaa...',
    '.bbbbbb....',
    '....a.a....',
    '....a.a....',
    '....k.k....'] },
  kangaroo: { legs: 2, neck: 6, graze: 2, rows: [
    '......k.k.',
    '......kaak',
    '......aa..',
    '.....aaa..',
    '....aaaa..',
    'aaaaaaaa..',
    'aa..aaaa..',
    '....aa.a..',
    '....kk.kk.'] },
  meerkat: { legs: 1, neck: 0, graze: 0, rows: [
    '.kak',
    '.aa.',
    '.aa.',
    '.ca.',
    '.ca.',
    'ak..',
    '.kk.'] },
  lemur: { legs: 2, neck: 8, graze: 1, rows: [
    'w.......kak',
    'k......aaak',
    'w...aaaaaa.',
    'k..aaaaaa..',
    'w..cccccc..',
    '...a.a..a.a',
    '...k.k..k.k'] },
  gelada: { legs: 1, neck: 0, graze: 0, rows: [
    '...bb..',
    '..bkab.',
    '..aaaa.',
    '.aabbaa',
    '.aabbaa',
    '.aaaaa.',
    '.k...k.'] },
  llama: { legs: 3, neck: 8, graze: 4, rows: [
    '........k.k',
    '........aak',
    '........aa.',
    '........a..',
    '........a..',
    '..aaaaaaa..',
    '.aaaaaaaa..',
    '.cccccccc..',
    '..a.aa..a.a',
    '..a.aa..a.a',
    '..k.kk..k.k'] },
};
// the animals: shape, colours (a main, b second, c shade), height on the ground (m), speed (m/s), pattern
const ANIMALS = {
  giraffe: { s: 'giraffe', a: '#e8bf74', b: '#8a5a2b', c: '#f3dcae', h: 5, v: 0.8, pat: 'spots' },
  zebra: { s: 'horse', a: '#f4f4f0', b: '#161d2b', c: '#f4f4f0', h: 2.1, v: 1, pat: 'stripes' },
  antelope: { s: 'horned', a: '#b9895a', b: '#5a3b22', c: '#e6d2b0', h: 1.6, v: 1 },
  ostrich: { s: 'ostrich', a: '#2b2f38', b: '#f0f2ea', c: '#2b2f38', h: 2.2, v: 1.1 },
  lion: { s: 'lion', a: '#d9b26c', b: '#8a5a2b', c: '#e9d0a0', h: 1.3, v: 0.6 },
  bison: { s: 'bison', a: '#5a3b22', b: '#3a2816', c: '#5a3b22', h: 2, v: 0.6 },
  yak: { s: 'bison', a: '#2b2118', b: '#1b1b1b', c: '#2b2118', h: 1.8, v: 0.5 },
  sheep: { s: 'stocky', a: '#8a5a2b', b: '#f0f2ea', c: '#f0f2ea', h: 0.8, v: 0.6 },
  kiang: { s: 'horse', a: '#b07a4a', b: '#5a3b22', c: '#f0f2ea', h: 2, v: 1 },
  camel: { s: 'camel', a: '#c99a5c', b: '#a87b3c', c: '#a87b3c', h: 2.4, v: 0.7 },
  przewalski: { s: 'horse', a: '#c9a46a', b: '#5a3b22', c: '#e6d2b0', h: 1.9, v: 1 },
  takin: { s: 'stocky', a: '#c9b06a', b: '#8a7a5a', c: '#8a7a5a', h: 1.5, v: 0.5 },
  wapiti: { s: 'deer', a: '#9a6a3c', b: '#5a3b22', c: '#d8c0a0', h: 2.4, v: 0.9 },
  ibex: { s: 'horned', a: '#8a7a5a', b: '#4b3b2a', c: '#c9b89a', h: 1.4, v: 0.8 },
  reindeer: { s: 'deer', a: '#9a8a7a', b: '#d8c0a0', c: '#f0f2ea', h: 2.1, v: 0.8 },
  milu: { s: 'deer', a: '#8a6a4a', b: '#5a3b22', c: '#c9a46a', h: 2.3, v: 0.8 },
  wolf: { s: 'dog', a: '#f0f2ea', b: '#9aa3ad', c: '#dde0d8', h: 1, v: 1.2 },
  lynx: { s: 'cat', a: '#c9a46a', b: '#8a5a2b', c: '#f0f2ea', h: 0.7, v: 0.7, pat: 'spots' },
  polarbear: { s: 'bear', a: '#f4f6f0', b: '#dde0d8', c: '#e2e5dc', h: 1.6, v: 0.6 },
  wolverine: { s: 'dog', a: '#4b3b2a', b: '#8a7a5a', c: '#8a7a5a', h: 0.6, v: 0.8 },
  arcticfox: { s: 'dog', a: '#f0f2ea', b: '#dde0d8', c: '#f0f2ea', h: 0.5, v: 1.2 },
  tahr: { s: 'horned', a: '#8a5a2b', b: '#4b3b2a', c: '#c9a46a', h: 1.2, v: 0.7 },
  tiger: { s: 'cat', a: '#e08a3c', b: '#161d2b', c: '#f0f2ea', h: 1.2, v: 0.6, pat: 'stripes' },
  leopard: { s: 'cat', a: '#e6c46a', b: '#161d2b', c: '#f0f2ea', h: 0.9, v: 0.6, pat: 'spots' },
  tapir: { s: 'tapir', a: '#2b2f38', b: '#f0f2ea', c: '#2b2f38', h: 1.1, v: 0.6 },
  capybara: { s: 'capybara', a: '#a87b3c', b: '#8a5a2b', c: '#c9a46a', h: 0.6, v: 0.5 },
  manedwolf: { s: 'longdog', a: '#c9583b', b: '#161d2b', c: '#e6a07a', h: 1, v: 1.1 },
  vicuna: { s: 'llama', a: '#d8b07a', b: '#f0f2ea', c: '#f0f2ea', h: 1.5, v: 1 },
  alpaca: { s: 'llama', a: '#f0f2ea', b: '#c9a46a', c: '#dde0d8', h: 1.5, v: 0.8 },
  kangaroo: { s: 'kangaroo', a: '#a87b5a', b: '#d8c0a0', c: '#d8c0a0', h: 1.4, v: 1.3 },
  gelada: { s: 'gelada', a: '#8a6a4a', b: '#d8342c', c: '#8a6a4a', h: 0.9, v: 0.7 },
  lemur: { s: 'lemur', a: '#8a8f99', b: '#161d2b', c: '#f0f2ea', h: 0.6, v: 1 },
  meerkat: { s: 'meerkat', a: '#c9a46a', b: '#8a5a2b', c: '#e6d2b0', h: 0.45, v: 0.9 },
};
const MIN_Z = 0.5; // animals from about 4 m per pixel (dots), paths from a little further out
const ENLARGE = 1.9; // like the people: bigger than life, so they can be seen and recognised

export function createZoo({ base, rot, GEO, occluded, night }) {
  let data = null, loading = null, lastT = 0, lastV = null;
  const animals = [];
  const load = () => (loading ||= fetch(`${base}data/r${rot}/zoo.json`).then(r => (r.ok ? r.json() : null)).then(d => { data = d; if (d) init(); }).catch(() => { data = null; }));

  const pip = (p, X, Y) => { let ins = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1]; if ((yi > Y) !== (yj > Y) && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
  const bbox = p => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); } return [x0, y0, x1, y1]; };
  // a random point inside the enclosure (image px), near a given point when asked (r metres)
  function spot(pen, near, r) {
    const [x0, y0, x1, y1] = pen.bb;
    for (let k = 0; k < 30; k++) {
      const X = near ? near[0] + (Math.random() - 0.5) * 2 * r * GEO.A : x0 + Math.random() * (x1 - x0);
      const Y = near ? near[1] + ((Math.random() - 0.5) * 2 * r * GEO.A) / 2 : y0 + Math.random() * (y1 - y0);
      if (pip(pen.p, X, Y)) return [X, Y];
    }
    return [pen.X, pen.Y];
  }
  function init() {
    animals.length = 0;
    for (const pen of data.pens) {
      pen.bb = bbox(pen.p);
      pen.herd = [];
      const [hx, hy] = spot(pen);
      for (const a of pen.animals) {
        const kind = ANIMALS[a.sp]; if (!kind) continue;
        for (let i = 0; i < a.n; i++) {
          const [X, Y] = spot(pen, [hx, hy], 12);
          const an = { pen, sp: a.sp, kind, X, Y, face: Math.random() < 0.5 ? 1 : -1, heading: Math.random() * Math.PI * 2, speed: 0, mode: 'graze', until: 0, ph: Math.random() * 1000, cruise: kind.v * (0.8 + Math.random() * 0.4), head: 0 };
          animals.push(an); pen.herd.push(an);
        }
      }
    }
  }

  // ---- what the animals do: day = wander in a loose herd and graze, night = lie down together, now and then a stroll
  function decide(a, now) {
    const n = night();
    const sleepy = Math.max(0, Math.min(1, (n - 0.35) / 0.4)); // 0 by day, 1 in the dark
    const r = Math.random();
    const mates = a.pen.herd.filter(m => m !== a);
    const mate = mates.length ? mates[Math.floor(Math.random() * mates.length)] : null;
    if (r < sleepy * 0.85) {
      // at night: lie down, but near the others (walk over to them first when far away)
      if (mate && Math.hypot((mate.X - a.X) / GEO.A, (2 * (mate.Y - a.Y)) / GEO.A) > 14 && a.mode !== 'walk') { const [X, Y] = spot(a.pen, [mate.X, mate.Y], 5); a.mode = 'walk'; a.tx = X; a.ty = Y; a.until = now + 60000; a.then = 'rest'; return; }
      a.mode = 'rest'; a.until = now + (40 + Math.random() * 160) * 1000; a.head = Math.random() < 0.4 ? 1 : 0; return;
    }
    if (a.mode !== 'walk' && r < sleepy * 0.85 + (1 - sleepy) * 0.55 + 0.1) {
      // a walk: mostly to somewhere near a herd mate (so they keep loosely together), sometimes off on their own
      const [X, Y] = mate && Math.random() < 0.6 ? spot(a.pen, [mate.X, mate.Y], 10) : spot(a.pen);
      a.mode = 'walk'; a.tx = X; a.ty = Y; a.until = now + 60000; a.then = sleepy > 0.5 ? 'rest' : 'graze'; return;
    }
    a.mode = 'graze'; a.until = now + (4 + Math.random() * 16) * 1000; a.head = 1;
  }
  function update(dt, now) {
    for (const a of animals) {
      if (now >= a.until) decide(a, now);
      if (a.mode === 'walk') {
        const gx = (a.tx - a.X) / GEO.A, gy = (2 * (a.ty - a.Y)) / GEO.A, d = Math.hypot(gx, gy);
        if (d < 1.2) { a.speed = 0; a.mode = a.then || 'graze'; a.until = now + (a.mode === 'rest' ? 40 + Math.random() * 160 : 3 + Math.random() * 10) * 1000; a.head = a.mode === 'graze' ? 1 : 0; continue; }
        // turn smoothly towards the target (with a little wandering), speed up and slow down gently
        const want = Math.atan2(gy, gx);
        let diff = want - a.heading; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
        const turn = Math.max(-2.2 * dt, Math.min(2.2 * dt, diff)) + (Math.random() - 0.5) * 0.6 * dt;
        a.heading += turn;
        const vmax = d < 4 ? a.cruise * Math.max(0.35, d / 4) : a.cruise;
        a.speed += Math.max(-1.2 * dt, Math.min(0.8 * dt, vmax - a.speed));
        const nx = a.X + Math.cos(a.heading) * a.speed * dt * GEO.A, ny = a.Y + (Math.sin(a.heading) * a.speed * dt * GEO.A) / 2;
        if (pip(a.pen.p, nx, ny)) { a.X = nx; a.Y = ny; } else { a.heading += Math.PI * 0.5; const [X, Y] = spot(a.pen, [a.pen.X, a.pen.Y], 8); a.tx = X; a.ty = Y; } // at the fence: turn back inside
        if (Math.abs(Math.cos(a.heading)) > 0.25) a.face = Math.cos(a.heading) >= 0 ? 1 : -1;
      } else a.speed = 0;
    }
  }

  // ---- drawing
  function sprite(ctx, a, x, y, u, t) {
    const sh = SHAPES[a.kind.s], rows = sh.rows, h = rows.length, w = rows[0].length;
    const lying = a.mode === 'rest';
    const bodyRows = lying ? h - sh.legs : h;
    const walking = a.mode === 'walk' && a.speed > 0.05;
    const phase = walking ? Math.floor((t + a.ph) / (170 / Math.max(0.4, a.speed / a.kind.v))) % 4 : 0;
    const bob = walking && phase % 2 === 1 ? 1 : 0; // the body dips a little between the steps
    // the head: down when grazing (now and then lifted to look around), down a little when asleep
    const look = Math.floor((t + a.ph) / 2600) % 5 === 0;
    const headDown = a.mode === 'graze' && a.head && !look ? sh.graze : lying && a.head ? Math.min(2, sh.graze) : 0;
    const col = { a: a.kind.a, b: a.kind.b, c: a.kind.c, k: K, w: W };
    const top = y - bodyRows * u;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x - (w * u) / 2 + u, y - u / 2, (w - 2) * u, u); // shadow on the ground
    const legOf = c => (c < w / 2 ? 0 : 1) + (c % 4 < 2 ? 0 : 2); // which leg a column belongs to (diagonal pairs)
    for (let r = 0; r < bodyRows; r++) {
      const row = rows[r], legRow = r >= h - sh.legs;
      for (let c = 0; c < w; c++) {
        let ch = row[c]; if (ch === '.') continue;
        if (ch === 'a' && a.kind.pat === 'stripes' && c % 2 === 1 && c < sh.neck) ch = 'b';
        if (ch === 'a' && a.kind.pat === 'spots' && (c * 7 + r * 3) % 5 === 0 && c < sh.neck + 1) ch = 'b';
        const cx = a.face > 0 ? c : w - 1 - c;
        let dy = 0, dx = 0;
        if (legRow) { const L = legOf(c); dx = phase === 1 ? (L % 2 ? 1 : -1) : phase === 3 ? (L % 2 ? -1 : 1) : 0; dx *= a.face; }
        else if (c >= sh.neck && headDown) dy = headDown + (r < h - sh.legs - sh.graze ? 0 : 0);
        else dy = bob;
        if (c >= sh.neck && headDown && r + dy >= bodyRows) continue; // the lowered head does not go below the ground
        ctx.fillStyle = col[ch] || col.a;
        ctx.fillRect(x - (w * u) / 2 + (cx + dx) * u, top + (r + dy) * u, u, u);
      }
    }
    if (lying) { // legs tucked under the body: a low strip in the body colour along the belly
      const row = rows[h - sh.legs - 1]; let c0 = w, c1 = -1;
      for (let c = 0; c < w; c++) if (row[c] !== '.') { c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
      if (c1 >= c0) { const x0 = a.face > 0 ? c0 + 1 : w - 1 - c1 + 1; ctx.fillStyle = a.kind.c; ctx.fillRect(x - (w * u) / 2 + x0 * u, y - u, Math.max(1, c1 - c0 - 1) * u, u); }
    }
  }
  function drawPaths(ctx, v) {
    if (v.z < 0.25) return;
    const k = v.k;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the grounds: a dashed green line
    ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(90,170,100,.7)'; ctx.lineWidth = Math.max(1, 1 * k);
    ctx.beginPath(); const b = data.boundary; for (let i = 0; i < b.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](v.ox + b[i] * k, v.oy + b[i + 1] * k); ctx.closePath(); ctx.stroke(); ctx.restore();
    // the paths: sand-coloured with a darker edge; service roads thinner and grey; steps dotted
    // (a path or a fence wholly off the screen is left out: close up most of the zoo is beyond the edge)
    const [vx0, vy0, vx1, vy1] = ctx.__view || [0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight], m = 12 + 3 * k;
    const off = b => v.ox + b[2] * k < vx0 - m || v.ox + b[0] * k > vx1 + m || v.oy + b[3] * k < vy0 - m || v.oy + b[1] * k > vy1 + m;
    for (const pass of [0, 1]) for (const p of data.paths) {
      if (off(p.bb || (p.bb = bbox(p.p)))) continue;
      const foot = p.k !== 'service';
      const wdt = Math.max(1, (foot ? 2 : 1.4) * k);
      ctx.beginPath(); const q = p.p; for (let i = 0; i < q.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](v.ox + q[i] * k, v.oy + q[i + 1] * k);
      if (pass === 0) { ctx.strokeStyle = 'rgba(70,60,40,.4)'; ctx.lineWidth = wdt + Math.max(1, 0.8 * k); ctx.setLineDash([]); ctx.stroke(); }
      else { ctx.strokeStyle = foot ? 'rgba(226,214,186,.85)' : 'rgba(200,194,180,.75)'; ctx.lineWidth = wdt; ctx.setLineDash(p.k === 'steps' ? [Math.max(2, k), Math.max(2, k)] : []); ctx.stroke(); }
    }
    ctx.setLineDash([]);
    // the enclosures: a thin brown fence
    if (v.z >= 0.5) for (const pen of data.pens) {
      if (off(pen.bb)) continue;
      const q = pen.p;
      ctx.beginPath(); for (let i = 0; i < q.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](v.ox + q[i] * k, v.oy + q[i + 1] * k); ctx.closePath();
      ctx.strokeStyle = 'rgba(110,80,40,.75)'; ctx.lineWidth = Math.max(1, 0.7 * k); ctx.setLineDash([Math.max(2, 2 * k), Math.max(1.5, 1.5 * k)]); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  function drawLabels(ctx, v) {
    if (v.z < 1.3) return;
    ctx.font = '400 15px "VT323", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const pen of data.pens) {
      const x = Math.round(v.ox + pen.X * v.k), y = Math.round(v.oy + pen.bb[1] * v.k) - 10;
      if (x < -100 || x > ctx.canvas.clientWidth + 100 || y < -20 || y > ctx.canvas.clientHeight + 20) continue;
      const tw = ctx.measureText(pen.n).width + 10;
      ctx.fillStyle = K; ctx.fillRect(x - tw / 2 - 1, y - 9, tw + 2, 18);
      ctx.fillStyle = '#c9e6a0'; ctx.fillRect(x - tw / 2, y - 8, tw, 16);
      ctx.fillStyle = K; ctx.fillText(pen.n, x, y + 1);
    }
  }
  function draw(ctx, v, t, on) {
    lastV = v;
    if (!on) { lastT = t; return; }
    if (!data) { load(); lastT = t; return; }
    const cw = ctx.canvas.clientWidth, ch = ctx.canvas.clientHeight;
    const [bx0, by0, bx1, by1] = data.bb || (data.bb = bbox(data.boundary));
    if (v.ox + bx1 * v.k < -50 || v.ox + bx0 * v.k > cw + 50 || v.oy + by1 * v.k < -50 || v.oy + by0 * v.k > ch + 50) { lastT = t; return; } // the zoo is not on the screen
    drawPaths(ctx, v);
    const dt = Math.min(0.1, Math.max(0, (t - lastT) / 1000)); lastT = t;
    if (v.z < MIN_Z) return;
    update(dt, performance.now());
    animals.sort((a, b) => a.Y - b.Y);
    for (const a of animals) {
      const x = Math.round(v.ox + a.X * v.k), y = Math.round(v.oy + a.Y * v.k);
      if (x < -60 || y < -80 || x > cw + 60 || y > ch + 20) continue;
      if (occluded(a.X, a.Y)) continue;
      const u = (a.kind.h * ENLARGE * v.k) / SHAPES[a.kind.s].rows.length; // screen px per sprite pixel
      if (u < 0.9) { ctx.fillStyle = a.kind.a; ctx.fillRect(x - 1, y - 1, Math.max(2, Math.round(a.kind.h * v.k)), Math.max(1, Math.round(a.kind.h * v.k * 0.5))); }
      else sprite(ctx, a, x, y, Math.max(1, Math.round(u)), t);
    }
    drawLabels(ctx, v);
  }
  // the enclosure under the screen point (for the click), when the zoo is drawn
  function at(sx, sy) {
    if (!data || !lastV || lastV.z < 0.4) return null;
    const X = (sx - lastV.ox) / lastV.k, Y = (sy - lastV.oy) / lastV.k;
    for (const pen of data.pens) if (X >= pen.bb[0] && X <= pen.bb[2] && Y >= pen.bb[1] && Y <= pen.bb[3] && pip(pen.p, X, Y)) return pen;
    return null;
  }
  return { load, draw, at, updated: () => (data ? data.updated : ''), data: () => data, count: () => animals.length };
}

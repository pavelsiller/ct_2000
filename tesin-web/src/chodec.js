export const WALK_SPEED = 1.25; // m/s (4.5 km/h), as src/raptor.js counts the walks

const OUT = '#161d2b'; // (the outline, as everything drawn over the map)
export const LOOKS = {
  // a teal jacket, dark trousers, white trainers, a mustard backpack, hair to the ears: neither a man nor a woman
  unisex: { skin: '#e9b98f', hair: '#4a3426', top: '#2bb3a3', topD: '#1f8378', legs: '#3a4876', legsD: '#2a3456', shoe: '#f0f2ea', bag: '#e0a43a', bagD: '#b07d22', eye: OUT },
};
const STEP_HZ = 0.9;
const KIND = { stick: '#6b4a2a', pram: '#3d6fb5', pramD: '#2b4f85', pramL: '#7ea3d8', wheel: '#20283a', rim: '#cfd5e2', hub: '#9aa3b5', frame: '#9aa3b5', seat: '#3a4876' };
const SENIOR = { hair: '#d8d9de', top: '#8c6a4f', topD: '#6e523c', bag: '#8c6a4f', bagD: '#6e523c' }; // (no backpack to see: it has the colour of the coat)
const HZ_OF = { slow: 0.62, pram: 0.8, chair: 0.7 };
// what it wears for the weather of its walk (src/vzit.js gear): an umbrella over the head (turned inside out in a
// strong wind), a red woolly hat, sunglasses
const GEAR = { hat: '#c9583b', band: '#f0f2ea', shades: '#0d1220', stick: '#d9d4c5', can: '#c9583b', canD: '#8f3a25', canL: '#ec8f70' };
const SIZE_AT = [[1, 1.25], [1 / 0.57, 1.47], [1 / 0.13, 3]];
export function cellPx(k) {
  if (!(k > SIZE_AT[0][0])) return SIZE_AT[0][1];
  for (let i = 1; i < SIZE_AT.length; i++) {
    const [k0, s0] = SIZE_AT[i - 1], [k1, s1] = SIZE_AT[i];
    if (k <= k1) return s0 + ((s1 - s0) * Math.log(k / k0)) / Math.log(k1 / k0);
  }
  return SIZE_AT[SIZE_AT.length - 1][1];
}

export function createChodec({ occluder = null, veil = null, lite = () => false } = {}) {
  // ---- the cells of one pose: [col, row, colour], col 0 = the middle, row 0 = the top of the head, 17 = the soles
  function cells(pose, L) {
    const out = [];
    const c = (x, y, col) => { if (col) out.push([x, y, col]); };
    const line = (x0, y0, x1, y1, col, w = 1, end = null) => { // (a limb: from the joint to the hand / the foot)
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
        const col2 = i === n && end ? end : col;
        for (let k = 0; k < w; k++) c(x - k, y, col2);
      }
    };
    const ph = pose.ph; // (the phase of the step, radians; null: standing)
    const holds = pose.gear === 'umbrella' || pose.gear === 'umbrella-inv'; // (the near / right hand holds the umbrella)
    const wear = () => {
      const g = pose.gear, side = pose.view === 'side';
      if (g === 'hat') {
        for (let x = side ? -1 : -2; x <= 2; x++) { c(x, 1, GEAR.band); c(x, 0, GEAR.hat); }
        for (let x = -1; x <= 1; x++) c(x, -1, GEAR.hat);
        c(0, -2, GEAR.band);
      } else if (g === 'shades' && pose.view !== 'back') {
        for (let x = side ? 1 : -1; x <= (side ? 2 : 1); x++) c(x, 2, GEAR.shades);
      } else if (holds) {
        line(3, side ? 4 : 3, 1, -4, GEAR.stick);
        const inv = g === 'umbrella-inv', rim = inv ? -8 : -5;
        const rows = inv ? [[-8, -5, 7], [-7, -4, 6], [-6, -3, 5], [-5, -1, 3]] : [[-8, -1, 3], [-7, -3, 5], [-6, -4, 6], [-5, -5, 7]];
        for (const [y, x0, x1] of rows) for (let x = x0; x <= x1; x++) c(x, y, y === rim ? (x & 1 ? GEAR.canD : GEAR.can) : x === x0 + 1 ? GEAR.canL : x === x1 ? GEAR.canD : GEAR.can);
      }
    };
    const sw = ph == null ? 0 : Math.sin(ph), lift = ph == null ? 0 : Math.cos(ph);
    const kind = pose.kind || null;
    if (kind === 'slow') L = Object.assign({}, L, SENIOR);
    if (kind === 'chair') {
      // ---- in a wheelchair: seated, four rows lower than standing (the head from row 4), the wheels turn with the hands
      const wearLow = () => { const n = out.length; wear(); for (let i = n; i < out.length; i++) out[i][1] += 4; }; // (the hat, the umbrella: as low as the head)
      const ring = (cx, cy, r) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y); if (d > r - 0.6 && d < r + 0.5) c(cx + x, cy + y, KIND.rim); } if (ph != null) line(cx, cy, cx + Math.round((r - 1) * Math.cos(ph)), cy + Math.round((r - 1) * Math.sin(ph)), KIND.hub); c(cx, cy, KIND.wheel); }; // (a light rim: a dark one runs into the outline and the legs, seen in the map)
      const up = pose.arm === 'wave', o = up && pose.wave > 0 ? 1 : 0;
      if (pose.view === 'side') {
        for (let y = 8; y <= 13; y++) c(-3, y, KIND.frame); c(-4, 8, KIND.frame); // the back of the chair and its handle
        for (let x = -2; x <= 3; x++) c(x, 14, KIND.seat);
        for (let y = 9; y <= 13; y++) for (let x = -2; x <= 0; x++) c(x, y, L.top); // the body
        for (let x = 0; x <= 4; x++) { c(x, 12, L.legs); c(x, 13, L.legs); } // the thighs
        for (let y = 14; y <= 15; y++) { c(4, y, L.legs); c(5, y, L.legs); } // the shins
        c(4, 16, L.shoe); c(5, 16, L.shoe); c(6, 16, L.shoe);
        c(3, 15, KIND.frame); c(3, 16, KIND.frame); c(3, 17, KIND.wheel); c(4, 17, KIND.wheel); // the front fork and its small wheel
        for (let x = -1; x <= 1; x++) c(x, 4, L.hair);
        c(-1, 5, L.hair); c(0, 5, L.hair); c(1, 5, L.skin); c(2, 5, L.skin);
        c(-1, 6, L.hair); c(0, 6, L.skin); c(1, 6, L.eye); c(2, 6, L.skin);
        c(-1, 7, L.hair); c(0, 7, L.skin); c(1, 7, L.skin); c(2, 7, L.skin);
        c(0, 8, L.skin); c(1, 8, L.skin);
        ring(-1, 13, 4); // (the big wheel round the seat, as on the sign)
        if (holds) line(-1, 10, 3, 9, L.top, 1, L.skin); else line(-1, 10, Math.round(-1 + 1.6 * sw), 12, L.top, 1, L.skin); // the near arm on the rim
        wearLow();
        return out;
      }
      const backC = pose.view === 'back';
      const rim = x0 => { for (let y = 10; y <= 17; y++) { const turn = ph != null && ((y + Math.round(ph * 1.3)) % 4 + 4) % 4 === 0; c(x0, y, y === 10 || y === 17 ? null : KIND.rim); c(x0 + (x0 < 0 ? 1 : -1), y, turn ? KIND.wheel : KIND.rim); } }; // (a wheel seen edge on, its rim turning)
      for (let x = -1; x <= 1; x++) c(x, 4, L.hair);
      for (let x = -2; x <= 2; x++) c(x, 5, L.hair);
      if (backC) {
        for (let y = 6; y <= 7; y++) for (let x = -2; x <= 2; x++) c(x, y, L.hair);
        c(0, 8, L.skin);
        for (let y = 9; y <= 10; y++) for (let x = -3; x <= 3; x++) c(x, y, L.top); // the shoulders over the back of the chair
        c(-4, 10, KIND.frame); c(4, 10, KIND.frame); // the handles
        for (let y = 11; y <= 15; y++) for (let x = -3; x <= 3; x++) c(x, y, y === 11 ? KIND.frame : KIND.seat);
        for (let x = -3; x <= 3; x++) c(x, 16, KIND.frame);
      } else {
        c(-2, 6, L.hair); c(-1, 6, L.eye); c(0, 6, L.skin); c(1, 6, L.eye); c(2, 6, L.hair);
        c(-2, 7, L.hair); c(-1, 7, L.skin); c(0, 7, L.skin); c(1, 7, L.skin); c(2, 7, L.hair);
        c(0, 8, L.skin);
        for (let y = 9; y <= 12; y++) for (let x = -2; x <= 2; x++) c(x, y, x === 0 && y > 9 ? L.topD : L.top);
        for (let y = 13; y <= 14; y++) for (let x = -3; x <= 3; x++) c(x, y, Math.abs(x) === 3 ? KIND.seat : L.legs); // the lap on the seat
        for (const x0 of [-2, 1]) { c(x0, 15, L.legs); c(x0 + 1, 15, L.legs); c(x0, 16, L.shoe); c(x0 + 1, 16, L.shoe); } // the shins and the shoes
        for (let x = -3; x <= 3; x++) c(x, 17, KIND.frame); // the footrest
        // the arms down to the rims; a wave when the target is reached
        for (let y = 9; y <= 11; y++) c(-3, y, L.top); c(-3, 12, L.skin);
        if (up) { c(3, 9, L.top); c(3, 8, L.top); c(3 + o, 7, L.top); c(3 + o, 6, L.skin); c(3 + o, 5, L.skin); }
        else if (holds) { c(3, 9, L.top); c(3, 8, L.top); c(3, 7, L.skin); }
        else { for (let y = 9; y <= 11; y++) c(3, y, L.top); c(3, 12, L.skin); }
      }
      rim(-5); rim(5);
      wearLow();
      return out;
    }
    // the pram in the three views (pushed ahead of the figure): from the side it stands in front, coming to the viewer
    // it is before the legs, going away it shows at both sides of the figure
    const pramSide = () => {
      line(3, 8, 5, 9, GEAR.stick);
      c(8, 7, KIND.pramD); c(9, 7, KIND.pramD);
      for (let x = 7; x <= 9; x++) c(x, 8, KIND.pramD);
      for (let x = 6; x <= 9; x++) c(x, 9, x === 6 ? KIND.pramL : KIND.pramD);
      for (let y = 10; y <= 12; y++) for (let x = 5; x <= 9; x++) c(x, y, y === 10 ? KIND.pramL : KIND.pram);
      for (let x = 5; x <= 9; x++) c(x, 13, GEAR.stick);
      c(5, 14, GEAR.stick); c(9, 14, GEAR.stick);
      for (const x0 of [4, 8]) for (let y = 15; y <= 17; y++) for (let x = x0; x <= x0 + 2; x++) c(x, y, (x === x0 + 1 && y === 16) ? KIND.hub : (x !== x0 + 1 && y !== 16) ? null : KIND.wheel);
    };
    const pramFront = () => {
      for (let x = -3; x <= 3; x++) c(x, 11, GEAR.stick); // the handle, in the hands
      for (let x = -3; x <= 3; x++) c(x, 12, KIND.pramD); // the hood, its rounded top
      for (let y = 13; y <= 14; y++) for (let x = -4; x <= 4; x++) c(x, y, KIND.pramD);
      for (let x = -2; x <= 2; x++) c(x, 14, KIND.wheel); // (the dark of the hood: the child is in there)
      for (let y = 15; y <= 17; y++) for (let x = -4; x <= 4; x++) c(x, y, y === 15 ? KIND.pramL : KIND.pram);
      for (const x0 of [-5, 4]) for (let y = 17; y <= 19; y++) { c(x0, y, KIND.wheel); c(x0 + 1, y, y === 18 ? KIND.hub : KIND.wheel); }
    };
    const pramBack = () => {
      for (let x = -4; x <= 4; x++) c(x, 5, KIND.pramD); // the hood beyond the shoulders
      for (let y = 6; y <= 8; y++) for (let x = -5; x <= 5; x++) c(x, y, KIND.pramD);
      for (let y = 9; y <= 11; y++) for (let x = -5; x <= 5; x++) c(x, y, y === 9 ? KIND.pramL : KIND.pram);
      for (const x0 of [-6, 5]) for (let y = 11; y <= 13; y++) { c(x0, y, KIND.wheel); c(x0 + 1, y, y === 12 ? KIND.hub : KIND.wheel); }
    };
    if (pose.view === 'side') {
      // (facing right; the left one is mirrored when drawn)
      // the far arm and leg first, a shade darker
      line(0, 6, Math.round(2 * sw), 10, L.topD, 1, L.skin);
      const bx = Math.round(-2.2 * sw), bl = -lift > 0.35 ? 1 : 0;
      line(0, 11, bx, 16 - bl, L.legsD, 2);
      c(bx - 1, 17 - bl, L.shoe); c(bx, 17 - bl, L.shoe); c(bx + 1, 17 - bl, L.shoe);
      // the backpack, the body, the hips
      for (let y = 5; y <= 9; y++) { c(-3, y, y === 9 ? L.bagD : L.bag); c(-2, y, y === 9 ? L.bagD : L.bag); }
      for (let y = 5; y <= 10; y++) for (let x = -1; x <= 1; x++) c(x, y, L.top);
      c(-1, 5, L.bagD); // (the strap over the shoulder)
      for (let x = -1; x <= 1; x++) c(x, 11, L.legs);
      // the head: hair over the top and down the back to the ear, the face forward
      for (let x = -1; x <= 1; x++) c(x, 0, L.hair);
      c(-1, 1, L.hair); c(0, 1, L.hair); c(1, 1, L.skin); c(2, 1, L.skin);
      c(-1, 2, L.hair); c(0, 2, L.skin); c(1, 2, L.eye); c(2, 2, L.skin);
      c(-1, 3, L.hair); c(0, 3, L.skin); c(1, 3, L.skin); c(2, 3, L.skin);
      c(0, 4, L.skin); c(1, 4, L.skin);
      // the near leg and arm
      const fx = Math.round(2.2 * sw), fl = lift > 0.35 ? 1 : 0;
      line(0, 11, fx, 16 - fl, L.legs, 2);
      c(fx - 1, 17 - fl, L.shoe); c(fx, 17 - fl, L.shoe); c(fx + 1, 17 - fl, L.shoe);
      if (holds) line(0, 6, 3, 5, L.top, 1, L.skin);
      else if (kind === 'pram') line(0, 6, 3, 8, L.top, 1, L.skin); // (both hands on the handle of the pram)
      else if (kind === 'slow') { const cx = 3 + Math.round(sw); line(0, 6, 2, 9, L.top, 1, L.skin); line(3, 9, cx, 17, KIND.stick); } // (the stick goes with the step)
      else line(0, 6, Math.round(-2 * sw), 10, L.top, 1, L.skin);
      if (kind === 'pram') pramSide();
      wear();
      return out;
    }
    // from the front or the back: the legs take turns to lift, the arms swing (a hand a row higher)
    const back = pose.view === 'back';
    const upL = ph != null && sw > 0.3, upR = ph != null && sw < -0.3;
    if (kind === 'pram' && back) pramBack();
    // the head
    for (let x = -1; x <= 1; x++) c(x, 0, L.hair);
    for (let x = -2; x <= 2; x++) c(x, 1, L.hair);
    if (back) { for (let y = 2; y <= 3; y++) for (let x = -2; x <= 2; x++) c(x, y, L.hair); }
    else {
      c(-2, 2, L.hair); c(-1, 2, L.eye); c(0, 2, L.skin); c(1, 2, L.eye); c(2, 2, L.hair);
      c(-2, 3, L.hair); c(-1, 3, L.skin); c(0, 3, L.skin); c(1, 3, L.skin); c(2, 3, L.hair);
    }
    c(0, 4, L.skin);
    // the body: from the front the zip and the straps of the backpack, from the back the backpack itself
    for (let y = 5; y <= 10; y++) for (let x = -2; x <= 2; x++) c(x, y, L.top);
    if (back) { for (let y = 5; y <= 9; y++) for (let x = -2; x <= 2; x++) c(x, y, y === 9 || y === 5 ? L.bagD : L.bag); }
    else { for (let y = 6; y <= 10; y++) c(0, y, L.topD); c(-1, 5, L.bagD); c(1, 5, L.bagD); c(-1, 6, L.bagD); c(1, 6, L.bagD); }
    // the arms (from the viewer: the left arm at col -3); the right hand may look at the watch or wave
    const arm = (x, up) => { for (let y = 5; y <= 9 - up; y++) c(x, y, L.top); c(x, 10 - up, L.skin); };
    const A = pose.arm;
    if (holds) { arm(-3, upR ? 1 : 0); c(3, 6, L.top); c(3, 5, L.top); c(3, 4, L.skin); }
    else if (A === 'watch' && !back) { arm(-3, 0); c(3, 5, L.top); c(3, 6, L.top); c(2, 7, L.top); c(1, 7, L.skin); c(0, 7, L.shoe); }
    else if (A === 'wave' && !back) { arm(-3, 0); const o = pose.wave > 0 ? 1 : 0; c(3, 5, L.top); c(3, 4, L.top); c(3 + o, 3, L.top); c(3 + o, 2, L.skin); c(3 + o, 1, L.skin); }
    else { arm(-3, upR ? 1 : 0); arm(3, upL ? 1 : 0); }
    // the hips, the legs, the trainers
    for (let x = -2; x <= 2; x++) c(x, 11, L.legs);
    const leg = (x0, up) => { for (let y = 12; y <= 16 - up; y++) { c(x0, y, L.legs); c(x0 + 1, y, L.legs); } c(x0, 17 - up, L.shoe); c(x0 + 1, 17 - up, L.shoe); };
    leg(-2, upL ? 1 : 0); leg(1, upR ? 1 : 0);
    if (kind === 'pram' && !back) pramFront();
    if (kind === 'slow') for (let y = 10; y <= 17; y++) c(4, y, KIND.stick); // (the stick beside the right hand)
    wear();
    return out;
  }

  // ---- the figure with its feet at (x, y) of the screen, s px a cell
  function figure(ctx, x, y, s, pose, look = 'unisex') {
    const L = LOOKS[look] || LOOKS.unisex, list = cells(pose, L);
    const flip = pose.view === 'side' && pose.flip ? -1 : 1;
    const bob = pose.ph == null || pose.kind === 'chair' ? 0 : -Math.round(Math.abs(Math.cos(pose.ph)) * Math.max(1, s / 2));
    const X0 = x - s / 2, Y0 = Math.round(y - 18 * s) + bob;
    // (a cell from its rounded edges: with a size of a fraction of a pixel the cells are 1 or 2 px, the figure stays whole)
    const at = (cx, cy) => { const l = Math.round(X0 + (flip > 0 ? cx : -cx) * s), t = Math.round(Y0 + cy * s); return [l, t, Math.round(X0 + (flip > 0 ? cx : -cx) * s + s) - l, Math.round(Y0 + cy * s + s) - t]; };
    // the shadow on the ground, the outline round every cell, then the cells in order (the near ones over the far)
    ctx.fillStyle = 'rgba(22,29,43,.32)'; ctx.beginPath(); ctx.ellipse(x, y, 4 * s, 1.3 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = OUT;
    for (const [cx, cy] of list) { const [px, py, w, h] = at(cx, cy); ctx.fillRect(px - 1, py - 1, w + 2, h + 2); }
    for (const [cx, cy, col] of list) { const [px, py, w, h] = at(cx, cy); ctx.fillStyle = col; ctx.fillRect(px, py, w, h); }
  }

  // ---- one state of the figure in the map: { X, Y (image px, the feet), mode: 'walk' | 'stand' | 'wait' | 'wave',
  // dx, dy (the way it walks, image px), dxs (a shift on the screen, px: beside a pin), gear (what it wears for the
  // weather), kind (who walks: 'slow' | 'pram' | 'chair', none = the usual figure) }
  function draw(ctx, v, t, st, look = 'unisex') {
    if (!st) return;
    const s = cellPx(v.k);
    const x = Math.round(v.ox + st.X * v.k + (st.dxs || 0)), y = Math.round(v.oy + st.Y * v.k);
    const cw = ctx.canvas.clientWidth, ch = ctx.canvas.clientHeight;
    if (x < -40 || y < -10 || x > cw + 40 || y > ch + 20 * s) return;
    const sec = t / 1000;
    let pose;
    if (st.mode === 'walk') {
      const ph = sec * (HZ_OF[st.kind] || STEP_HZ) * 2 * Math.PI;
      const dx = st.dx || 0, dy = st.dy || 0; // (image px: the screen has the same shape, only scaled)
      pose = Math.abs(dy) * 1.25 < Math.abs(dx) || (!dx && !dy) ? { view: 'side', flip: dx < 0, ph } : { view: dy > 0 ? 'front' : 'back', ph };
    } else if (st.mode === 'wave') pose = { view: 'front', ph: null, arm: 'wave', wave: Math.sin(sec * 7) };
    else {
      // standing: now and then (for 1.4 s in every 6) a look at the watch while waiting
      const watch = st.mode === 'wait' && (sec + (st.seed || 0)) % 6 < 1.4;
      pose = { view: 'front', ph: null, arm: watch ? 'watch' : null };
    }
    pose.gear = st.gear || null;
    pose.kind = st.kind || null; // (who walks: 'slow' | 'pram' | 'chair')
    // the houses in front of the feet step back: the middle and both sides of the feet are asked
    if (occluder && veil && v.z >= 0.45 && !lite()) {
      const hiders = new Set(), fX = (x - v.ox) / v.k, fY = (y - v.oy) / v.k, w = (2.5 * s) / v.k;
      for (const [ax, ay] of [[fX, fY], [fX - w, fY], [fX + w, fY], [fX, fY - (2 * s) / v.k]]) { const b = occluder(Math.round(ax), Math.round(ay)); if (b) hiders.add(b); }
      if (hiders.size) veil(ctx, v, t, hiders);
    }
    ctx.save();
    figure(ctx, x, y, s, pose, look);
    ctx.restore();
  }
  return { draw, figure };
}

export const metresOf = p => { let m = 0; for (let i = 2; i < p.length; i += 2) m += Math.hypot(p[i] - p[i - 2], 2 * (p[i + 1] - p[i - 1])); return m; };
// the point s metres along it and the way it goes there (looking a few metres back and ahead, so that a short
// zigzag of the pavement does not turn the figure to and fro): [X, Y, dx, dy]
export function alongPts(p, s) {
  const pt = q => {
    if (p.length < 4) return [p[0], p[1]];
    let acc = 0;
    for (let i = 2; i < p.length; i += 2) {
      const l = Math.hypot(p[i] - p[i - 2], 2 * (p[i + 1] - p[i - 1]));
      if (acc + l >= q || i === p.length - 2) { const u = l ? Math.max(0, Math.min(1, (q - acc) / l)) : 0; return [p[i - 2] + (p[i] - p[i - 2]) * u, p[i - 1] + (p[i + 1] - p[i - 1]) * u]; }
      acc += l;
    }
    return [p[p.length - 2], p[p.length - 1]];
  };
  const [X, Y] = pt(s), a = pt(Math.max(0, s - 4)), b = pt(s + 4);
  return [X, Y, b[0] - a[0], b[1] - a[1]];
}

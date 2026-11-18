// A beacon under a highlighted icon (the theme chosen in the Aktuálně panel), in the manner of the "look here"
// markers of old strategy games: ripples spreading over the ground from the foot of the icon (isometric ellipses
// in the colour of the icon, fading as they grow), a soft glow on the ground, pixel sparks twinkling around the
// icon. Returns how far up the caller should lift the icon (0: the icons stand still).
const RIPPLES = 3, PERIOD = 1500;
const rgb = col => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(col || ''); return m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : [242, 198, 109]; };
export function beacon(ctx, x, y, t, col, r = 22, seed = 0) {
  const [R, G, B] = rgb(col);
  const c = a => `rgba(${R},${G},${B},${a})`;
  ctx.save();
  // the glow on the ground (an ellipse: the ground is seen at an angle)
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, c(0.6)); g.addColorStop(1, c(0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  // the ripples: each starts small and strong and grows faint
  ctx.lineWidth = 2;
  for (let i = 0; i < RIPPLES; i++) {
    const ph = ((t + seed * 173) / PERIOD + i / RIPPLES) % 1;
    const rr = r * (0.2 + 1.1 * ph), a = 1 - ph;
    ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.55, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(22,29,43,${(0.8 * a).toFixed(3)})`; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = c(a.toFixed(3)); ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = `rgba(255,246,216,${(0.7 * a).toFixed(3)})`; ctx.lineWidth = 1; ctx.stroke(); // a cream edge: reads on any ground
  }
  const hop = 0; // (the icons stand still: a hop was tried and found too restless)
  // pixel sparks: four of them circling the icon, each twinkling on and off
  for (let i = 0; i < 4; i++) {
    const ang = (t + seed * 53) / 900 + (i * Math.PI) / 2, tw = Math.sin((t + seed * 31) / 160 + i * 1.7);
    if (tw < 0.2) continue;
    const sx = Math.round(x + Math.cos(ang) * r * 0.9), sy = Math.round(y - 16 - hop + Math.sin(ang) * r * 0.5), s = tw > 0.8 ? 4 : 3;
    ctx.fillStyle = '#161d2b'; ctx.fillRect(sx - 1, sy - 1, s + 2, s + 2);
    ctx.fillStyle = tw > 0.8 ? '#fff6d8' : c(1);
    ctx.fillRect(sx, sy, s, s);
  }
  ctx.restore();
  return hop;
}

const HUE_LO = 0.15, HUE_HI = 0.28; // neon yellow-green (yellow road paint is below 0.15, grass above 0.28 and duller)
const MIN_AREA = 0.001; // of the sampled band: a helmet is a big blob near the camera (a sunlit lawn far away is a third of it)
const MIN_SHARE = 0.5; // the blob must hold most of the yellow-green in the band (a lawn or a green car is spread out)
const BIN = 10, HALF = 20; // degrees: the histogram's bins; the blob is what lies within ±HALF of the fullest bin
export const BAND = 0.5; // the helmet is in the lower half of the picture (below the horizon), often right under the camera

// data: RGB or RGBA bytes of the bottom band of a 360° picture (from BAND of its height down), w × h, `ch` channels.
// Returns the direction of travel in degrees from the picture's centre (−180…180), or null when no helmet is seen.
export function helmetOffset(data, w, h, ch = 4, step = 2) {
  const hits = [], bins = new Uint32Array(360 / BIN); // columns as compass-like angles: 0 = column 0 (behind the camera)
  let sampled = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      sampled++;
      const i = (y * w + x) * ch, r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max < 153 || max - min < 0.55 * max) continue; // v > 0.6, s > 0.55
      const d = max - min;
      let hue = max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d;
      hue = (hue / 6 + 1) % 1;
      if (hue < HUE_LO || hue > HUE_HI) continue;
      const a = ((x + 0.5) / w) * 360;
      hits.push(a); bins[Math.floor(a / BIN)]++;
    }
  }
  const min = MIN_AREA * sampled;
  if (hits.length < min) return null;
  // the fullest bin with its neighbours (circular), then the circular mean of the hits around it
  let best = 0, bestN = -1;
  for (let k = 0; k < bins.length; k++) { const n = bins[k] + bins[(k + 1) % bins.length] + bins[(k + bins.length - 1) % bins.length]; if (n > bestN) { bestN = n; best = k; } }
  const peak = (best + 0.5) * BIN;
  let n = 0, sx = 0, sy = 0;
  for (const a of hits) { let d = Math.abs(a - peak) % 360; if (d > 180) d = 360 - d; if (d > HALF) continue; const r = (a * Math.PI) / 180; sx += Math.cos(r); sy += Math.sin(r); n++; }
  if (n < min || n < MIN_SHARE * hits.length) return null;
  const deg = (Math.atan2(sy, sx) * 180) / Math.PI - 180; // column 0 = behind the camera, the middle column = the picture's centre
  return ((deg + 540) % 360) - 180;
}

// The heading to draw a picture by when the helmet says the data's heading points elsewhere. A helmet right behind
// the camera (|offset| > 150°) is a handlebar mount: the rider rides behind the camera and the heading is right.
export function fixedYaw(yaw, offset) {
  if (offset === null || Math.abs(offset) > 150) return yaw;
  return (((yaw - offset) % 360) + 360) % 360;
}

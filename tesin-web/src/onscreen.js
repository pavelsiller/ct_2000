// Is the point (x, y) of the overlay drawing on the screen, with a margin of m px? The drawing's coordinates are CSS px
// from the corner of the map; the part that is seen runs from -bleed to the map's size + bleed (phones: the canvas
// reaches beyond the map, see fx.js). fx.draw puts that box on the context as ctx.__view = [x0, y0, x1, y1].
// (The layers used to compare with ctx.canvas.width, which counts device pixels: on a 2× screen they drew icons up to a
// whole screen beyond the right and the bottom edge.)
export function onScreen(ctx, x, y, m = 0) {
  const b = ctx.__view;
  if (!b) return true;
  return x > b[0] - m && y > b[1] - m && x < b[2] + m && y < b[3] + m;
}

// The image point of a place (lon, lat), kept for the object o it belongs to. llToImg reads the terrain at every call and
// the layers used to ask it for every item at every frame, before the test of the screen. begin() at the top of a drawing
// notices a turned map or a terrain that has just come (the same test as src/tramplan.js) and forgets the kept points.
export function imgPoints(llToImg) {
  let rot = '', kept = new WeakMap();
  return {
    begin() { const k = llToImg(16.6, 49.2).join(','); if (k !== rot) { rot = k; kept = new WeakMap(); } },
    of(o, lon, lat) {
      let p = kept.get(o);
      if (!p || p[2] !== lon || p[3] !== lat) { const [X, Y] = llToImg(lon, lat); p = [X, Y, lon, lat]; kept.set(o, p); }
      return p;
    },
  };
}

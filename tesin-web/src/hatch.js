// The hatching of things behind a building (statues, plaques and stones in city.js, the hidden pieces of trams and buses
// in vehicles.js, the house that steps back for the chosen vehicle in layers.js): dark diagonal lines 4 px apart.
let tile = null;
export function hatchTile() {
  if (!tile) { // a 4 × 4 tile with one diagonal
    tile = document.createElement('canvas'); tile.width = tile.height = 4;
    const c = tile.getContext('2d'); c.fillStyle = 'rgba(22,29,43,.75)'; for (let i = 0; i < 4; i++) c.fillRect(i, 3 - i, 1, 1);
  }
  return tile;
}
// the same as a fill or stroke style of this context (made once per context)
export function hatchPattern(ctx) {
  return ctx.__hatch || (ctx.__hatch = ctx.createPattern(hatchTile(), 'repeat'));
}

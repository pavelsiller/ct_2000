// Sizes without a forced layout. Reading clientWidth / clientHeight / getBoundingClientRect makes the browser finish the
// layout first whenever anything in the page changed since the last frame (the clock, a feed, a pane): inside the frame
// loop that is a synchronous layout in the middle of a frame, on a slow phone tens of ms, and the tap that comes then
// waits (INP, measured 2026-11-14: about 5 600 such reads in 20 s, 0.96 s spent inside them on a fast Mac).
// The drawing reads the size of the map container and of the overlay canvas some twenty times per frame (the frame loop,
// fx.js, every layer): those two elements keep their size here, refreshed by a ResizeObserver right after the browser
// has done its own layout, and their clientWidth / clientHeight answer from it. A change of size reaches the drawing one
// frame later, as with OpenSeadragon's own autoResize.
const get = name => Object.getOwnPropertyDescriptor(Element.prototype, name).get;
const CW = get('clientWidth'), CH = get('clientHeight');

/** clientWidth / clientHeight of el answered from a cache kept by a ResizeObserver (no layout on read). */
export function cacheSize(el) {
  if (!el || typeof ResizeObserver !== 'function') return;
  let w = CW.call(el), h = CH.call(el);
  // (in the observer's callback the layout is fresh, so these reads cost nothing)
  new ResizeObserver(() => { w = CW.call(el); h = CH.call(el); }).observe(el);
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => w });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => h });
}

/** The border-box size of each element, kept by one ResizeObserver: map.get(el) -> { w, h } (0 × 0 when not displayed). */
export function watchSizes(els) {
  const sizes = new Map();
  for (const el of els) { const r = el.getBoundingClientRect(); sizes.set(el, { w: r.width, h: r.height }); }
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const b = e.borderBoxSize && e.borderBoxSize[0];
        sizes.set(e.target, b ? { w: b.inlineSize, h: b.blockSize } : { w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    for (const el of els) ro.observe(el);
  }
  return sizes;
}

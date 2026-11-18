import OpenSeadragon from 'openseadragon';
import { createFx } from './fx.js';
import { createLayers } from './layers.js';
import { createPruhy } from './pruhy.js';
import { fetchWeather } from './live.js';
import { setLength } from './vehicles.js';
import { createAir, POLL, LEVEL, ADVICE, bandOf } from './air.js';
import { createWebcams } from './webcams.js';
import { createPano } from './pano.js';
import { createMeteo } from './meteo.js';
import { createVmo, VMO_STYLE } from './vmo.js';
import { ICON } from './sky.js';
import { createCity, dayStart } from './city.js';
import { createLupa, LUPA } from './lupa.js';
import { createParo, PARO_WEB } from './paro.js';
import THEMES from '../tools/data/themes.json';
import ALIASES0 from '../tools/data/search-aliases.json';
import SITE_CFG from '../site.config.json';
import { createHasici, HASICI_WEB, KINDS as HASICI_KINDS, NEAR as HASICI_NEAR } from './hasici.js';
import { createPolicie, KINDS as POLICIE_KINDS, caseText as policieText } from './policie.js';
import { createVoda, VODA_WEB, VODA_PAGE, PLAN_DAYS as VODA_PLAN_DAYS } from './voda.js';
import { createParking, PARKING_WEB, PARKING_DATA, fullCol } from './parking.js';
import { createCisteni, CISTENI_WEB, hoursText, dayText } from './cisteni.js';
import { createDoprava } from './doprava.js';
import { createZpravy, zprIcon } from './zpravy.js';
import { udalMsg } from './udalost.js';
import { createPeople } from './people.js';
import { createTramPlan } from './tramplan.js';
import { createZoo } from './zoo.js';
import { createDatamap, DATAMAPS } from './datamap.js';
import { level as accLevel, isLive as accLive, LEVEL_NAME as ACC_LEVEL } from './nehodyted.js';
import { ADMIN, stripAdmin, shown } from './admin.js';
import { track, pageview, entry } from './stats.js';
import { fetchData, watchFeed, freshenDatasets } from './feed.js';
import { createQuick, placePxIcons, pxIcon, GROUPS } from './quick.js';
import { beacon } from './beacon.js';
import { onScreen as seen } from './onscreen.js';
import { readableHours } from './hours.js';
import { openReader, factsText } from './reader.js';
import { createInstall } from './install.js';
import { createSpojeni } from './spojeni.js';
import { createMoje } from './moje.js';
import { safeUrl, safeFrame } from './safe.js';
import { picKey, commonsFile } from '../tools/mediakeys.mjs';
import META from '../public/data/r0/meta.json';
import { inMap, setMapRadius } from './extent.js';
import { cacheSize, watchSizes } from './sizecache.js';
import { camImg } from './proxy.js';
import { watchUpdates } from './update.js';
import { ROLES, ROLE_KEEP } from './roles.js';
import TILES_VERSION from '../public/data/r0/tiles-version.json';
import KLID_VERSION from '../public/data/r0/klid-version.json';
stripAdmin(); // [ADMIN] the public build has no tuning tools
// the visit (src/stats.js): how the visitor came in, and whether the map runs as an installed app
pageview({ vstup: entry(), instalace: matchMedia('(display-mode: standalone)').matches ? 'pwa' : 'web' });

const $ = id => document.getElementById(id);
const BASE = import.meta.env.BASE_URL;
const MEDIA = (import.meta.env.VITE_MEDIA_BASE || `${BASE}cdn/`).replace(/\/?$/, '/');
{ const el = document.getElementById('adminBadge'); if (el) el.textContent = `LADĚNÍ · místní verze · dlaždice ${import.meta.env.VITE_MEDIA_BASE ? `publikované (${new URL(MEDIA).host})` : 'místní (cdn/)'}`; }
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
let touched = false; // has the person moved the map yet?
// a phone or tablet (no fine pointer) and a wish for less motion: fewer tiles in memory, half the frame rate
const TOUCH = matchMedia('(pointer: coarse)').matches;
const CALM = TOUCH || matchMedia('(prefers-reduced-motion: reduce)').matches || (false);

const GEO = { LON0: 16.606, LAT0: 49.201, R: META.R, A: META.A, V: META.V, Z0: META.Z0, TOP: META.TOP, W: META.W, H: META.H };
// zoom thresholds were tuned at 2 m per image pixel; S converts them
const S = GEO.A * 2;
setMapRadius(GEO.R); // (src/extent.js: nothing outside the diamond of the map is shown)
const KX = Math.cos((GEO.LAT0 * Math.PI) / 180) * 111320, KY = 110574;
// The map is drawn in four rotations: 0 = north up, 1 = east up, 2 = south up, 3 = west up.
let ROT = 0;
const rotXY = (x, y) => (ROT === 0 ? [x, y] : ROT === 1 ? [-y, x] : ROT === 2 ? [-x, -y] : [y, -x]);
const unrotUW = (u, w) => (ROT === 0 ? [u, w] : ROT === 1 ? [w, -u] : ROT === 2 ? [-u, -w] : [-w, u]);
const imgToLonLat = (X, Y) => {
  const u = X / GEO.A - GEO.R;
  const w = GEO.R - ((Y - GEO.TOP + 60 * GEO.V) * 2) / GEO.A;
  const [x, y] = unrotUW(u, w);
  return [x / KX + GEO.LON0, y / KY + GEO.LAT0];
};
const lonLatToImg = (lon, lat) => {
  const [u, w] = rotXY((lon - GEO.LON0) * KX, (lat - GEO.LAT0) * KY);
  return [(u + GEO.R) * GEO.A, ((GEO.R - w) * GEO.A) / 2 + GEO.TOP - 60 * GEO.V];
};
const KLID_H = KLID_VERSION.h || 0.2; // (the renderer writes the height it drew with)
let klidOn = false;
const KLID_F = 4;
const tilePath = s => (klidOn ? 'klid8/summer' : s);
const tilesUrl = s => `${MEDIA}tiles/r${ROT}/${tilePath(s)}/map.dzi?v=${encodeURIComponent((klidOn ? KLID_VERSION : TILES_VERSION).rendered || '')}`; // OpenSeadragon passes the query on to every tile

// the season of a date in Brno (meteorological seasons)
const seasonOf = (d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }))) => ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][d.getMonth()];
// the look saved in this browser ("Pořád léto", setLook below): known before the viewer opens, so the map starts with the
// summer tiles at once instead of fetching the real season's tiles first and swapping them a moment later (two pyramids)
let startLook = null;
try { startLook = localStorage.getItem('b2k-look'); } catch { /* private mode */ }
const state = {
  season: startLook === 'summer' ? 'summer' : seasonOf(), night: 0, weather: 'clear',
  // (the measuring points and the permits, i.e. air quality, webcams, weather stations and roadworks, are off at the
  // start: the map opens with the city, the transport and the events on it, the rest is a tick away in Vrstvy)
  // The themes and their levels are in src/quick.js; the starting levels: Stavby 1 (building sites), MHD 1 (vehicles and stops; the
  // closures are level 2), Doprava 3 (jams, closures, roadworks), Akce 2 (this week), Zajímavosti 1 (statues, trees, crosses, plaques and Stolpersteine; names 2, listed buildings 3), Senzory 2
  // (webcams; weather stations and air quality), Fotky off. The switches in index.html start the same way.
  layers: { labels: true, traffic: true, smoke: false, hover: true, jams: true, closures: true, works: true, projects: true, mhd: true, mhdStops: true, mhdOutages: false, air: true, cams: true, meteo: true, events: true, monuments: false, people: true, zoo: true,
    // names of places (tags) off by default; building and development: building sites on, plans off
    names: false, building: true, planCity: false, planPrivate: false, bigplans: false, paro: true, hasici: true, policie: false, voda: true, parking: true, clean: true, vlaky: true,
    pitka: true, wc: true, stin: true, kose: false, smView: true, smPool: true, smTree: true,
    // statues, memorials, crosses, memorial plaques and Kameny zmizelých (Stolpersteine): all on, level 1 of Zajímavosti
    smArt: true, smCross: true, smPlaque: true,
    smStolper: true,
    // street-level photos (Panoramax): light blue dots of the pictures, only zoomed well in; off by default (the dots
    // get in the way), one tap on the Fotky tile shows them; the card of a house still offers its street photo
    pano: false },
  zasahRange: 'h', // výjezdy hasičů and voda: 'h' the last 12 hours (signs), 'w' the last 7 days (dots and the numbers of the week)
  cleanRange: 'd', // blokové čištění: 'd' today and tomorrow, 'w' within a week, 'm' within a month, 'a' every date known (src/cisteni.js)
  eventsRange: 't',
  mhdMode: 'live',
  focus: null, // the theme chosen in the Aktuálně panel ('paro', 'events'): its points are drawn bigger, the other icons dimmed
  datamap: null, // key of the datová mapa shown (src/datamap.js), null = none
};
// the day switch (the tile at the top right, on phones above the bottom tiles): the map in daylight although it is
// evening or night in Brno; everything else stays as it is. Remembered in this browser.
let dayLock = false;
let lookFromLink = false; // the look (summer, daylight) came from a shared link: shown, but not remembered in this browser
try { dayLock = localStorage.getItem('b2k-day') === '1'; } catch { /* private mode */ }

// ------------------------------------------------------------------ viewer
OpenSeadragon.setImageFormatsSupported({ webp: true });
const viewer = OpenSeadragon({
  element: $('viewer'),
  tileSources: tilesUrl(state.season), // the real season from the start
  showNavigationControl: false,
  imageSmoothingEnabled: false,
  // OpenSeadragon 6 would pick the WebGL drawer by itself ('auto'): the canvas drawer keeps the drawing as it was (the
  // CSS filter on its canvas, nearest-neighbour pixels, the detail layer); WebGL is tried separately, see the osd6 branch
  drawer: ['canvas'],
  maxZoomPixelRatio: 4, // (the tiles have 2 px per metre: up to 8 screen px per metre)
  minZoomImageRatio: 0.5,
  visibilityRatio: 0.3,
  animationTime: 0.7,
  springStiffness: 9,
  blendTime: 0,
  immediateRender: false,
  preserveImageSizeOnResize: true,
  gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true, flickEnabled: true },
  gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true, pinchRotate: false },
  zoomPerScroll: 1.4,
  crossOriginPolicy: 'Anonymous',
  // decoded tiles kept in memory (1 MB each): the default 200 is too much for a phone, where Safari drops the tab
  maxImageCacheCount: TOUCH ? 80 : 200,
});
// The keys OpenSeadragon binds by itself that this map has no use for: r / R (rotate), f (flip) and 0 (its own home
// view). The layers over the map are drawn for the one north-up view, so a rotated or flipped picture would not fit them.
viewer.addHandler('canvas-key', e => { const k = e.originalEvent && e.originalEvent.key; if (k && /^[rRfF0]$/.test(k)) e.preventDefaultAction = true; });
function loadFailed() {
  const l = $('loading');
  if (!l || l.hidden || l.classList.contains('failed')) return;
  l.classList.add('failed');
  l.querySelector('span').textContent = navigator.onLine === false ? 'Mapa se nenačetla: zařízení je teď bez připojení k internetu.' : 'Mapu se nepodařilo načíst. Zkuste to prosím znovu.';
  const b = document.createElement('button'); b.type = 'button'; b.className = 'pbtn retry'; b.textContent = 'Zkusit znovu'; b.onclick = () => location.reload();
  l.append(b);
}
viewer.addHandler('open-failed', loadFailed);
setTimeout(() => { if (!opened) loadFailed(); }, 30000);
viewer.container.style.background = 'transparent';

const UZLY_ON = shown('uzly');
const DETAIL = { meta: null, item: null, adding: false };
fetch(`${MEDIA}tiles/r${ROT}/detail/meta.json`, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(m => { if (m && m.seasons && m.seasons.length) { DETAIL.meta = m; detailUpdate(); } }).catch(() => {});
const detailUrl = s => `${MEDIA}tiles/r${ROT}/detail/${s}/map.dzi?v=${encodeURIComponent(DETAIL.meta.rendered || '')}`;
function detailWanted() {
  const m = DETAIL.meta;
  if (!m || klidOn || !m.seasons.includes(state.season) || !viewer.world.getItemCount()) return false;
  return view().k * (window.devicePixelRatio || 1) >= m.scale - 0.01;
}
function detailUpdate() {
  const want = detailWanted();
  if (want && !DETAIL.item && !DETAIL.adding) {
    const m = DETAIL.meta, season = state.season;
    DETAIL.adding = true;
    viewer.addTiledImage({
      tileSource: detailUrl(season), x: m.x / GEO.W, y: m.y / GEO.W, width: m.w / GEO.W, index: viewer.world.getItemCount(),
      success: ev => { DETAIL.adding = false; if (season !== state.season) { viewer.world.removeItem(ev.item); detailUpdate(); return; } DETAIL.item = ev.item; detailUpdate(); },
      error: () => { DETAIL.adding = false; },
    });
  } else if (!want && DETAIL.item) { viewer.world.removeItem(DETAIL.item); DETAIL.item = null; }
}
// (a season swap removes every other tiled image, the detail one too: setSeason calls this afterwards)
function detailReset() { DETAIL.item = null; detailUpdate(); }
viewer.addHandler('zoom', detailUpdate);
viewer.addHandler('animation-finish', detailUpdate);
const UZLY_WIN = { wins: [], on: UZLY_ON && true };
function uzlyUpdate() {
  if (!UZLY_WIN.wins.length || !viewer.world.getItemCount()) return;
  const fine = view().k * (window.devicePixelRatio || 1) >= 4 - 0.01;
  const b = viewer.viewport.getBounds(true);
  for (const w of UZLY_WIN.wins) {
    const m = w.meta, x = m.x / GEO.W, y = m.y / GEO.W, ww = m.w / GEO.W, hh = m.h / GEO.W;
    const want = !klidOn && m.seasons.includes(state.season) && (m.scale <= 2 || fine) && x < b.x + b.width && x + ww > b.x && y < b.y + b.height && y + hh > b.y;
    if (want && !w.item && !w.adding) {
      const season = state.season;
      w.adding = true;
      viewer.addTiledImage({
        tileSource: `${w.url}${season}/map.dzi?v=${encodeURIComponent(m.rendered || '')}`, x, y, width: ww, index: viewer.world.getItemCount(),
        success: ev => { w.adding = false; if (season !== state.season) { viewer.world.removeItem(ev.item); uzlyUpdate(); return; } w.item = ev.item; uzlyUpdate(); },
        error: () => { w.adding = false; },
      });
    } else if (!want && w.item) { viewer.world.removeItem(w.item); w.item = null; }
  }
}
function uzlyReset() { for (const w of UZLY_WIN.wins) w.item = null; uzlyUpdate(); }
if (UZLY_WIN.on) {
  const add = (root, list) => { for (const d of list) if (d && d.seasons && d.seasons.length) UZLY_WIN.wins.push({ meta: d, url: `${root}${d.dir || d.slug}/`, item: null, adding: false }); UZLY_WIN.wins.sort((p, q) => p.meta.scale - q.meta.scale); uzlyUpdate(); };
  const idx = root => fetch(`${root}index.json`, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : [])).then(l => add(root, l)).catch(() => {});
  idx(`${MEDIA}tiles/r${ROT}/uzly/`);
  viewer.addHandler('zoom', uzlyUpdate);
  viewer.addHandler('animation-finish', uzlyUpdate);
  viewer.addHandler('open', uzlyUpdate);
}
// Pixel-true magnification: once the drawing is magnified (from 1.75 physical pixels per drawn pixel), the zoom settles
// after every movement on a whole number of physical pixels per drawn pixel, so all the pixels of the drawing come out
// the same size (nearest-neighbour scaling at 2.5× draws runs of 2 and 3 px). Never during a gesture, and only above
// the usual flights (1 px = 1 m and the like), which stay as they are.
viewer.addHandler('animation-finish', () => {
  const dpr = window.devicePixelRatio || 1, src = DETAIL.item ? DETAIL.meta.scale : klidOn ? 2 * KLID_F : 2;
  const ratio = (view().k * dpr) / src;
  if (ratio < 1.75) return;
  const want = Math.round(ratio);
  if (Math.abs(ratio - want) < 0.005) return;
  viewer.viewport.zoomTo(viewer.viewport.getZoom() * (want / ratio), null, false);
});

// map image px (1 px per metre, GEO.W wide) <-> screen px; computed from the viewport (0…1 across the
// map's width), so it does not depend on the resolution of the tiles
function view() {
  const vp = viewer.viewport;
  const o = vp.viewportToViewerElementCoordinates(new OpenSeadragon.Point(0, 0));
  const e = vp.viewportToViewerElementCoordinates(new OpenSeadragon.Point(1, 0));
  const k = (e.x - o.x) / GEO.W;
  return { ox: o.x, oy: o.y, k, z: k * S, S };
}
const screenToImg = (sx, sy) => { const v = view(); return [(sx - v.ox) / v.k, (sy - v.oy) / v.k]; };

function homeBounds() {
  const cw = viewer.container.clientWidth, ch = viewer.container.clientHeight;
  let dw, cx;
  let cy = ch / 2;
  if (cw > 640) {
    dw = cw >= 1440 ? cw * 0.93 : 1340;
    cx = cw >= 1440 ? cw * 0.528 : cw / 2 + 40;
    cy -= 14;
  } else { dw = 1000; cx = cw / 2 + 5; cy -= 10; }
  const zoom = dw / cw;
  const ic = (GEO.TOP + GEO.H) / 2 / GEO.W;
  return { zoom, center: new OpenSeadragon.Point(0.5 + (cw / 2 - cx) / (zoom * cw), ic + (ch / 2 - cy) / (zoom * cw)) };
}
function goHome(immediately = false) {
  const h = homeBounds();
  viewer.viewport.zoomTo(h.zoom, null, immediately);
  viewer.viewport.panTo(h.center, immediately);
}
// z: zoom on the 2 m/px scale (1 = one image pixel of the old map per screen pixel)
const isPhone = () => matchMedia('(max-width: 640px)').matches;
// a phone lying on its side (the same query as the landscape block in style.css)
const isLandPhone = () => matchMedia('(min-width: 641px) and (max-height: 500px)').matches;
const flyToMap = (...a) => flyTo(...a); // (the same, under a name a local flyTo can lean on: openPlaceLink)
// A place flown to comes to rest in the middle of the part of the map that nothing covers, not in the middle of the
// screen: on a phone between the top bar and the sheet that is open (the card of the place, a tab …), where the middle
// of the screen lies right under the card; on a computer between the panel and the card.
function freeRect() { // [left, top, right, bottom] of that part, in screen px
  const cw = viewer.container.clientWidth, ch = viewer.container.clientHeight;
  if (isPhone()) {
    const top = Math.max(0, $('panel').getBoundingClientRect().bottom);
    const tops = topSheets().filter(x => !x.hidden).map(x => x.getBoundingClientRect().top);
    const qb = $('quick').getBoundingClientRect();
    const bottom = tops.length ? Math.min(...tops) : qb.height ? qb.top : ch;
    return bottom - top > 80 ? [0, top, cw, bottom] : [0, 0, cw, ch];
  }
  if (isLandPhone()) return [0, 0, cw, ch];
  const left = document.body.classList.contains('folded') ? 0 : Math.max(0, $('panel').getBoundingClientRect().right);
  const right = $('card').hidden ? cw : $('card').getBoundingClientRect().left;
  return right - left > 200 ? [left, 0, right, ch] : [0, 0, cw, ch];
}
function freeCentre() { const [l, t, r, b] = freeRect(); return [(l + r) / 2, (t + b) / 2]; }
// two places both in that part, as close as they fit (the stop and the coming vehicle of "můj spoj", src/moje.js)
function fitPair(a, b) {
  const [l, t, r, bt] = freeRect();
  // (less the room for the signs and the names around the two; on a computer also the top row and the corner controls)
  const w = Math.max(120, r - l - 140), h = Math.max(120, bt - t - (isPhone() ? 90 : 190));
  const k = Math.min(w / Math.max(1, Math.abs(a[0] - b[0])), h / Math.max(1, Math.abs(a[1] - b[1])));
  flyTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.max(0.15, Math.min(k * S, 3)));
}
function aimAt(X, Y, z, immediately = false) {
  const k = z / S, cw = viewer.container.clientWidth, ch = viewer.container.clientHeight;
  const [sx, sy] = freeCentre();
  viewer.viewport.zoomTo((k * GEO.W) / cw, null, immediately);
  viewer.viewport.panTo(new OpenSeadragon.Point((X - (sx - cw / 2) / k) / GEO.W, (Y - (sy - ch / 2) / k) / GEO.W), immediately);
}
// (flyAim: the place last flown to. The card of the place usually opens right after the flight starts and grows as its
// pictures come, so for a few seconds the flight is aimed again whenever a sheet opens, closes or changes its size;
// moving the map by hand ends that)
let flyAim = null;
function flyTo(X, Y, z = 1.4, immediately = false) {
  touched = true;
  flyAim = { X, Y, z, at: performance.now() };
  aimAt(X, Y, z, immediately);
}
// the view of a shared link: #@lat,lon,m/px[,season][,night][,weather][,rN][,dmap] (restoreFromHash, and a view kept in Moje)
const VIEW_RE = /^#@([\d.]+),([\d.]+),([\d.]+)(?:,(\w*))?(?:,(\d*))?(?:,(\w*))?(?:,(?:r(\d))?)?(?:,d(\w+))?/;
// A view brought back as it was kept (Moje, src/moje.js): its middle goes to the middle of the screen, not of the
// free part, so the map stands exactly as when the view was kept, whatever covers it now.
function viewTo(X, Y, z, immediately = false) {
  touched = true; flyAim = null;
  viewer.viewport.zoomTo(((z / S) * GEO.W) / viewer.container.clientWidth, null, immediately);
  viewer.viewport.panTo(new OpenSeadragon.Point(X / GEO.W, Y / GEO.W), immediately);
}
function reAim() { if (flyAim && performance.now() - flyAim.at < 2500) aimAt(flyAim.X, flyAim.Y, flyAim.z); }

// ------------------------------------------------------------------ data
// positions differ per rotation (data/r<ROT>/…); the Wikipedia texts are shared
const load = f => fetch(`${BASE}data/r${ROT}/${f}`).then(r => r.json());
const loadShared = f => fetch(`${BASE}data/${f}`).then(r => r.json());
const data = { labels: [], stories: [], routes: [], chimneys: [], lights: null, spots: [], wikiPois: [], streets: null };
// a file that fails to load keeps its empty default: the map still opens, only that layer is missing
const loadInto = (f, key, empty) => load(f).then(d => (data[key] = d)).catch(e => { console.warn(`data/${f}:`, e); data[key] = empty; });
const loadData = () => Promise.all([
  loadInto('stories.json', 'stories', []),
  loadInto('chimneys.json', 'chimneys', []),
  loadInto('wikipois.json', 'wikiPois', []),
  loadInto('labels.json', 'labels', []),
]);
const ready = loadData();
// the big files that are not needed to open the map come when first needed (fx.js asks for them): the roads
// (routes.json, 325 KB: the cars and the street lamps), the street names (streets.json, 230 KB: zoomed in) and the
// light map (lights.json, 540 KB: at night). A rotation drops them (lazyReset), the next need fetches them again.
const lazy = new Map();
function need(f, key, empty) {
  if (!lazy.has(f)) { const rot = ROT; lazy.set(f, load(f).then(d => { if (rot === ROT) data[key] = d; }).catch(e => { console.warn(`data/${f}:`, e); if (rot === ROT) data[key] = empty; })); }
  return lazy.get(f);
}
let lightsP = null; // the light map prepared once per rotation (fx.prepareLights is slow: it draws every light)
const lazyReset = () => { lazy.clear(); lightsP = null; data.routes = []; data.streets = null; data.lights = null; };

// building chunks for hover, click and the occlusion of cars, vehicles and people. A chunk file (b/<key>.json) has
// the geometry only: [roof outline, wall height, big (hides vehicles), group?]; the names, addresses and codes of
// the same buildings (ba/<key>.json, in the same order) are fetched when a building is clicked (withAttrs).
const CH = 1024;
const chunks = new Map(), chunkAttrs = new Map();
// an entry as the page uses it (see below); an older chunk file carries everything in one entry
// (the calm map: the roof outline comes down by the part of the wall that is gone, the wall keeps KLID_H of its height)
const lowerKlid = e => { const h = e[1], d = h * (1 - KLID_H), p = e[0]; for (let i = 1; i < p.length; i += 2) p[i] += d; e[1] = h * KLID_H; return e; };
const expand = e => { if (e.length > 4) { e.attrs = true; return e; } const b = [e[0], e[1], '', '', '', 0, 0, 0, '', 0, '', '']; if (e[3] !== undefined) b[12] = e[3]; b.big = !!e[2]; return b; };
// the chunks are fetched two at a time: nine of them come at once when the view moves, and parsing nine files of
// half a megabyte in the same moment froze the map for a second; this way each is parsed as it arrives
// The newest request goes first and the queue stays short: a fast pan over the city asks for chunks it has already left
// behind, those are dropped (asked for again should the view come back). Loaded chunks are kept up to CHUNK_MAX, the
// least recently used go: a phone holds a few dozen of them (up to 350 KB each), not the whole city.
const chunkQueue = []; let chunkBusy = 0, chunkTick = 0;
const CHUNK_MAX = TOUCH ? 40 : 120, QUEUE_MAX = 12;
const chunkUsed = new Map(); // key -> when it was last asked for
function pumpChunks() {
  while (chunkBusy < 2 && chunkQueue.length) {
    const [key, rot] = chunkQueue.shift();
    chunkBusy++;
    const kl = klidOn;
    fetch(`${BASE}data/r${rot}/b/${key}.json`).then(r => (r.ok ? r.json() : [])).then(list => { if (rot === ROT && kl === klidOn) { chunks.set(key, kl ? list.map(e => lowerKlid(expand(e))) : list.map(expand)); trimChunks();  } }).catch(() => { if (rot === ROT && kl === klidOn) chunks.set(key, []); })
      .finally(() => { chunkBusy--; pumpChunks(); });
  }
}
function trimChunks() {
  if (chunks.size <= CHUNK_MAX) return;
  const loaded = [...chunks.keys()].filter(k => chunks.get(k)).sort((a, b) => (chunkUsed.get(a) || 0) - (chunkUsed.get(b) || 0));
  for (const k of loaded.slice(0, chunks.size - CHUNK_MAX)) { chunks.delete(k); chunkAttrs.delete(k); chunkUsed.delete(k); }
}
function chunk(cx, cy) {
  const key = `${cx}_${cy}`;
  chunkUsed.set(key, ++chunkTick);
  const have = chunks.get(key);
  if (have === undefined) {
    chunks.set(key, null);
    chunkQueue.unshift([key, ROT]); pumpChunks();
    while (chunkQueue.length > QUEUE_MAX) { const [old] = chunkQueue.pop(); chunks.delete(old); }
  } else if (have === null) {
    const i = chunkQueue.findIndex(q => q[0] === key); // asked for again while waiting: to the front of the queue
    if (i > 0) chunkQueue.unshift(...chunkQueue.splice(i, 1));
  }
  return have || null;
}
// the attributes of the buildings of a chunk, merged into its entries (once)
function attrsOf(key) {
  if (!chunkAttrs.has(key)) {
    const rot = ROT;
    chunkAttrs.set(key, fetch(`${BASE}data/r${ROT}/ba/${key}.json`).then(r => (r.ok ? r.json() : [])).then(a => {
      const list = rot === ROT ? chunks.get(key) : null;
      if (list) a.forEach((x, i) => { const b = list[i]; if (b && !b.attrs) { for (let j = 0; j < 10; j++) b[j + 2] = x[j]; b.attrs = true; } });
    }).catch(() => {}));
  }
  return chunkAttrs.get(key);
}
const withAttrs = b => { if (b.attrs) return Promise.resolve(); const ci = chunkIndexOf(b); return ci ? attrsOf(ci[0]) : Promise.resolve(); };
function inPoly(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const pieceArea = q => { const p = q[0]; let a = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1]; return Math.abs(a); };
function piecesOf(b) {
  const g = b[12];
  if (g === undefined) return [b];
  const cx = Math.floor(b[0][0] / CH), cy = Math.floor(b[0][1] / CH), out = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const list = chunk(cx + dx, cy + dy);
    if (list) for (const q of list) if (q[12] === g) out.push(q);
  }
  if (out.length < 2) return out.length ? out : [b];
  // small pieces are left out of the outline, but not the piece under the cursor and not the tallest one: a tower is a
  // fraction of its building's area (the Old Town Hall's is a fifteenth) and is what people click on
  const big = Math.max(...out.map(pieceArea)) * 0.2, tall = Math.max(...out.map(q => q[1]));
  return out.filter(q => q === b || pieceArea(q) >= big || q[1] >= tall * 0.95);
}
function buildingAt(X, Y) {
  const cx = Math.floor(X / CH), cy = Math.floor(Y / CH);
  let best = null, bestY = -Infinity;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const list = chunk(cx + dx, cy + dy);
    if (!list) continue;
    for (const b of list) {
      const p = b[0], hp = b[1];
      if (Math.abs(p[0] - X) > 160 * S || Math.abs(p[1] - Y) > 160 * S) continue;
      const front = p[1] + hp;
      if (front < bestY) continue;
      let hit = false;
      // (steps of at most 2 px: a slender tower's footprint is only 5 px deep on screen, a sixth of a 60 m tower is 10)
      for (let d = 0; d <= hp + 0.01 && !hit; d += Math.max(0.5, Math.min(2, hp / 6))) hit = inPoly(p, X, Y - d);
      if (hit) { best = b; bestY = front; }
    }
  }
  return best;
}

// Is a point on the ground hidden behind a building (seen from the south-west)? It is when it lies in the
// silhouette of a building (roof outline swept down by the wall height) but not on the building's footprint:
// the building stands in front of it. null = the building chunks around are not loaded yet (asked for now).
function hiddenBehind(X, Y) {
  if (klidOn) return false; // (Klidná mapa: see occluderAt)
  const cx = Math.floor(X / CH), cy = Math.floor(Y / CH);
  let pending = false;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const list = chunk(cx + dx, cy + dy);
    if (!list) { pending = true; continue; }
    for (const b of list) {
      const p = b[0], hp = b[1];
      if (Math.abs(p[0] - X) > 160 * S || Math.abs(p[1] - Y) > 160 * S || hp < 2) continue;
      if (inPoly(p, X, Y - hp)) continue; // on the footprint: the thing stands on (or at) this building, not behind it
      for (let d = 0; d <= hp + 0.01; d += Math.max(0.5, hp / 6)) if (inPoly(p, X, Y - d)) return true;
    }
  }
  return pending ? null : false;
}

// ------------------------------------------------------------------ effects layer
// the overlay is drawn 48 px beyond the edges of the map (bleed), so that between two drawings it can be shifted along
// with the tiles without a bare strip at the leading edge (see the frame loop at the end of the file): phones always,
// computers since 2026-11-15 whenever a drawing is slow (the first seconds, a slow machine). Keep 48 in step with #mapOver in
// style.css, which sets the margin before the first paint
const fx = createFx({ canvas: $('mapOver'), pins: $('pins'), viewer, view, GEO, state, data, BASE, bleed: 48 });
// the map's and the overlay's size are read some twenty times per frame: from a cache, never a forced layout (src/sizecache.js)
cacheSize(viewer.container); cacheSize($('mapOver'));
try { if (Date.now() - +(localStorage.getItem('b2k-lite') || 0) < 7 * 864e5) fx.lite = true; } catch { /* private mode */ }
fx.cardOpen = () => !$('card').hidden; // the marker of a place stays while its card is open
fx.needRoutes = () => need('routes.json', 'routes', []);
fx.needStreets = () => need('streets.json', 'streets', []);
// the light map: lights.json has the grid size; the values are a greyscale image (lights.webp, lossless), decoded
// through a canvas (older data carry the values in the JSON itself, base64)
async function lightValues() {
  const L = data.lights;
  if (!L || L.d || L.raw || !L.img) return;
  try {
    const blob = await (await fetch(`${BASE}data/r${ROT}/${L.img}`)).blob();
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = document.createElement('canvas'); c.width = L.w; c.height = L.h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
    const px = g.getImageData(0, 0, L.w, L.h).data, raw = new Uint8Array(L.w * L.h);
    for (let i = 0; i < raw.length; i++) raw[i] = px[i * 4];
    L.raw = raw;
  } catch (e) { console.warn(`${L.img}:`, e); }
}
fx.needLights = () => (lightsP ||= Promise.all([need('lights.json', 'lights', null).then(lightValues), need('routes.json', 'routes', [])]).then(() => fx.prepareLights()));
fx.pieces = piecesOf; // the hover / selection outline covers every piece of the building
// live traffic, public transport and city projects
const layers = createLayers({ base: BASE, GEO, rotation: () => ROT, state, lite: () => fx.lite, T: (n, f) => fx.T(n, f), tick: (n, ms) => { if (fx.profOn) fx.prof[n] = (fx.prof[n] || 0) + ms; }, routes: () => { if (!data.routes.length) need('routes.json', 'routes', []); return data.routes; } }); // (routes: the lane counts for the queues of cars)
layers.mhd.wantSnap = !TOUCH && true;
// The live stream of vehicle positions (the whole region, filtered here) runs only while vehicles are drawn: live mode,
// the MHD layer on, the tab shown and the map close enough for them (z ≥ 0.18, as in layers.draw); zoomed out or
// switched off it is closed after 20 s (a short look at the whole city does not reconnect). The frame loop asks every second.
let liveOn = false, liveIdle = 0, liveWanted = false;
function liveCheck(v, t) {
  liveWanted = state.mhdMode === 'live' && !document.hidden && ((state.layers.mhd && v.z >= 0.18) || !!ride || (!!moje && moje.tracking())); // (riding along or watching "můj spoj": whatever the zoom)
  if (liveWanted) { liveIdle = 0; if (!liveOn) { layers.live.start(); liveOn = true; } }
  else if (!liveIdle) liveIdle = t;
  else if (liveOn && t - liveIdle > 20000) { layers.live.stop(); liveOn = false; }
}
let hoverProj = null;
// air quality stations (ČHMÚ; live values via the European Environment Agency)
const air = createAir({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat) });
const cams = createWebcams({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat) });
// street-level photos (Panoramax): when the open picture moves off the screen (walking along a street), the map follows
const pano = createPano({
  llToImg: (lon, lat) => layers.llToImg(lon, lat), imgToLonLat, stamp: () => layers.stamp(),
  onMove: p => {
    const v = view(); const [X, Y] = layers.llToImg(p.lon, p.lat);
    const sx = v.ox + X * v.k, sy = v.oy + Y * v.k, cw = viewer.container.clientWidth, ch = viewer.container.clientHeight;
    if (sx < 40 || sy < 40 || sx > cw - 40 || sy > ch - 40) viewer.viewport.panTo(new OpenSeadragon.Point(X / GEO.W, Y / GEO.W));
  },
});
const vmo = createVmo({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat) });
// Zoo Brno: the paths and the enclosures with the animals (under the people, so visitors walk over the paths)
const zoo = createZoo({ base: BASE, rot: ROT, GEO, occluded: (X, Y) => occludedAt(X, Y), night: () => (klidOn ? 0 : state.night) });
// Moje: places, stops and connections the visitor keeps in this browser (src/moje.js; the part "moje" of
// public.config.json). Made further down, once everything it leans on is here; null while the part is left out.
let moje = null;
let spojeni = null; // Spojení: the journey planner (src/spojeni.js, the part "spojeni")
fx.extra = (ctx, v, t) => { fx.T('zoo', () => zoo.draw(ctx, v, t, state.layers.zoo)); if (state.layers.bigplans) fx.T('plans', () => { vmo.draw(ctx, v, t); tramplan.draw(ctx, v); }); fx.T('people', () => people.draw(ctx, v, t, state.layers.people && !state.datamap)); if (state.layers.clean) fx.T('cisteni', () => cisteni.draw(ctx, v, t)); if (spojeni) fx.T('spojeni', () => spojeni.draw(ctx, v, 'way', t)); fx.T('layers', () => layers.draw(ctx, v, t, hoverProj)); if (spojeni) fx.T('spojeni-z', () => spojeni.draw(ctx, v, 'marks', t)); fx.T('me', () => drawMe(ctx, v, t)); };
// datové mapy: a quantity on the roofs and the ground (src/datamap.js), drawn under the traffic and the people
const datamap = createDatamap({ base: BASE, rotation: () => ROT, GEO, chunk, CH, canvasSize: () => fx.size() });
fx.under = (ctx, v) => datamap.draw(ctx, v);
// icons people click on are drawn on top of everything and win the click over labels, buildings and areas
const meteo = createMeteo({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat) });
const city = createCity({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat), hiddenBehind: (X, Y) => (fx.lite ? false : hiddenBehind(X, Y)), lite: () => fx.lite }); // (a slow device skips the test)
// (for the route of a vehicle: when the closures and diversions of its line that are valid now end, 0 = none or no end known)
layers.setClosureEnd(line => [...new Set(city.outagesForLine(line).filter(o => o.type !== 'Z' && o.type !== 'D' && o.to).map(o => o.to))].sort((a, b) => a - b)); // (the ends of the line's closures valid now, the nearest first: layers diversion())
const tramplan = createTramPlan({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat) });
fx.projOn = p => layers.projOn(p);
const LUPA_ON = shown('lupa'); // (left out of the public version until its data are ready, see public.config.json)
// Dáme na vás: the proposals of the participatory budget vote (src/paro.js)
const paro = createParo({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat) });
// Výjezdy hasičů: the interventions of the fire brigade of the last 12 hours (src/hasici.js; not public yet, public.config.json)
const HASICI_ON = shown('hasici');
const hasici = HASICI_ON ? createHasici({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat), A: GEO.A, roads: () => data.routes || [], needRoads: () => fx.needRoutes && fx.needRoutes(), blocked: (X, Y) => !!buildingAt(X, Y), onChange: () => updateHasiciPanel() })
  : { load: () => Promise.resolve(), draw() {}, at: () => null, list: () => [], isOpen: () => false, positions() {}, data: { items: [] } };
// Policie: případy týdne, the burglaries, thefts and violent crimes of one week from the open data of the police (src/policie.js;
// part "policie", public.config.json)
const POLICIE_ON = shown('policie');
const policie = POLICIE_ON ? createPolicie({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat), onChange: () => updatePoliciePanel() })
  : { load: () => Promise.resolve(), draw() {}, at: () => null, list: () => [], positions() {}, data: { items: [] } };
// Voda: havárie a odstávky, the burst mains and the shut-offs of the water supply of BVK (src/voda.js; part "voda", public.config.json)
const VODA_ON = shown('voda');
const voda = VODA_ON ? createVoda({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat), A: GEO.A, onChange: () => updateVodaPanel() })
  : { load: () => Promise.resolve(), draw() {}, at: () => null, list: () => [], stateOf: () => '', isNow: () => false, positions() {}, data: { items: [], tanks: [] } };
// Parkovací domy: the free spaces of the car parks of Brněnské komunikace, live from the city's open data (src/parking.js)
const PARKING_ON = shown('parking');
const SLOUPKY_ON = shown('sloupky'); // a sign for each direction of a stop when zoomed in (see public.config.json)
layers.setPostSigns(SLOUPKY_ON);
if (UZLY_ON && true) {
  const pruhy = createPruhy({ base: BASE, rotation: () => ROT });
  pruhy.load();
  fx.lane = (X, Y, dx, dy, pick) => pruhy.lane(X, Y, dx, dy, pick);
  layers.setLaneSnap((X, Y, dx, dy, pick, strict) => pruhy.lane(X, Y, dx, dy, pick, strict));
}
const parking = PARKING_ON ? createParking({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat), A: GEO.A, onChange: () => updateParkingPanel() })
  : { load: () => Promise.resolve(), draw() {}, at: () => null, positions() {}, live: () => false, summary: () => ({ n: 0 }), info: () => Promise.resolve([]), data: { items: [] } };
// Vlaky: the railway stations of Brno with their departure and arrival boards (src/vlaky.js; the part "vlaky" of
// public.config.json). The module is loaded with the first frame that draws the layer, or with a link to a station;
// until then the layer draws nothing.
const VLAKY_ON = shown('vlaky');
let vlaky = { load: () => Promise.resolve(), draw() {}, at: () => null, byId: () => null, positions() {}, data: { stations: [] } };
let vlakyP = null;
const needVlaky = () => (vlakyP ||= import('./vlaky.js').then(m => (vlaky = m.createVlaky({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat), A: GEO.A }))));
// Blokové čištění: the sections of streets the city sweeps, with the day and the hours (src/cisteni.js; the part "cisteni" of public.config.json, public since 2026-11-13)
const CISTENI_ON = shown('cisteni');
const cisteni = CISTENI_ON ? createCisteni({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat), A: GEO.A, occluder: (X, Y) => occluderAt(X, Y), veil: (ctx, v, t, houses) => layers.veil(ctx, v, t, houses), range: () => state.cleanRange, lite: () => fx.lite, onChange: () => updateCleanPanel() })
  : { load: () => Promise.resolve(), draw() {}, at: () => null, markAt: () => null, dates: () => [], summary: () => ({ total: 0 }), points: () => [], positions() {}, data: { items: [] } };
const DOPRAVA_ON = shown('doprava');
// Zprávy (Dnes v Brně, src/zpravy.js): the board and the list of the news, wired up at setZprOpen below
const zpravy = shown('zpravy') && document.getElementById('zprTile') ? createZpravy({ base: BASE }) : null;
const zprOpen = () => !!zpravy && !$('zpravy').hidden;
const zprNav = { via: 0, top: 0, keep: 0, from: {} }; // (via: an overview was just opened from the news, it gets a way back; top: how far the list was scrolled)
const doprava = DOPRAVA_ON ? createDoprava({
  base: BASE, parking: PARKING_ON, cisteni: CISTENI_ON ? () => cisteni.summary() : null, focusOn: () => state.focus, llToImg: (lon, lat) => layers.llToImg(lon, lat),
  inMap,
  // a row of the worst places or a car park: the overview stays open, the map moves the place beside it (left of it on a
  // computer, above the sheet on a phone) and a beacon marks it until the overview closes or a card opens (dopPin)
  onPlace: (lon, lat, park) => {
    const [X, Y] = imgOf(lon, lat), z = park ? 1.4 : 1, k = z / S;
    dopPin = [X, Y, park ? '#2b62c4' : '#d8362a'];
    // (an upright phone: flyTo itself aims at the middle of the map left above the sheet, freeCentre; an extra shift
    // here pushed the place up to the top edge or off the screen)
    let dx = 0;
    if (!isPhone() && !$('fcPop').hidden) dx = ($('fcPop').getBoundingClientRect().width + 16) / 2 / k;
    flyTo(X + dx, Y, z);
  },
  // (the overview stays open: the buttons show which one is on, pressed again it goes off)
  onFocus: k => {
    track('Panel', { co: `doprava-${k}` });
    const p = setFocus(state.focus === k ? null : k, { fit: true });
    const repaint = () => { if (!$('fcPop').hidden && fcWhat === 'dop') doprava.render($('fcPopBody')); };
    repaint(); Promise.resolve(p).then(repaint, repaint);
  },
}) : null;
if (doprava) layers.setLateFar(doprava.latePts);
let dopPin = null; // [X, Y, colour]: the place picked in the Doprava overview, with a beacon while the overview is open
const lupa = LUPA_ON ? createLupa({ base: BASE, llToImg: (lon, lat) => layers.llToImg(lon, lat) }) : { load: () => Promise.resolve(), draw() {}, at: () => null, nearFountain: () => false, data: {} };
// people on the streets when zoomed in: walking along the roads, waiting at stops, getting on and off
let stopsImg = null;
const people = createPeople({
  GEO,
  walks: () => fetch(`${BASE}data/r${ROT}/walks.json`).then(r => (r.ok ? r.json() : [])),
  stops: () => {
    if (!stopsImg) {
      const s = layers.mhd.stops(), P = SLOUPKY_ON ? layers.mhd.posts() : {}; const keys = Object.keys(s);
      // (with the signs per direction people wait at each post, on its platform; w = the post's share of the stop's people)
      if (keys.length) stopsImg = keys.flatMap(k => (P[k] ? P[k].map(([p, lo, la]) => { const [X, Y] = layers.llToImg(lo, la); return { key: `${k}/${p}`, X, Y, w: 1 / P[k].length, side: true }; }) : (() => { const [X, Y] = layers.llToImg(s[k][1], s[k][2]); return [{ key: k, X, Y }]; })()));
    }
    return stopsImg || [];
  },
  vehicles: () => (state.layers.mhd ? layers.drawnVehicles() : []),
  events: () => city.eventsIn('today').filter(e => e.X != null),
  occluded: (X, Y) => occludedAt(X, Y),
  weather: () => state.weather,
  lite: () => fx.lite,
});
lupa.load();
city.whenSmall(() => lupa.load().then(() => { for (const o of city.data.small) if (o.k === 'fountain' && lupa.nearFountain(o.lon, o.lat)) o.dup = true; }));
// icon clusters: icons do not pile up. Each icon asks for its place (ctx.__claim); where another icon already is,
// it is left out and counted, and the first icon gets a "+N" badge (click it to zoom in). Important icons first.
let clusterHits = [];
// the outlines of the cultural monuments on the roofs: under the names of places, which stay readable and clickable
fx.mid = (ctx, v) => { if (state.layers.monuments) drawMonuments(ctx, v); };
let placeTagsOf = null; // (the match the tags were made from: city.match gives a new one when the places or their positions change)
fx.top = (ctx, v, t) => {
  if (data.wikiPois && data.wikiPois.length && city.data.places.length) {
    const m = city.match(data.wikiPois);
    if (m !== placeTagsOf) { placeTagsOf = m; fx.placeTags = m.own.filter(p => Number.isFinite(p.X)).map(p => [p.n, null, p.X, p.Y, 0, null, p]); }
  }
  const boxes = [];
  ctx.__claim = (x0, y0, x1, y1, important = false) => {
    const pad = 2;
    // (ctx.__hl: a point of the highlighted theme is being drawn; an ordinary icon under it is left out without being
    // counted in its "+N", which then counts only the places of the theme)
    const hl = !!ctx.__hl;
    // (and a point of the theme is never left out because of an ordinary icon drawn before it, e.g. a webcam)
    if (!important) for (const b of boxes) if (b[0] < x1 + pad && b[2] > x0 - pad && b[1] < y1 + pad && b[3] > y0 - pad) { if (hl && !b[5]) continue; if (b[5] === hl) b[4]++; return false; }
    boxes.push([x0, y0, x1, y1, 0, hl, ctx.globalAlpha]); // (… and how strong the icon is drawn: its "+N" badge is as strong)
    return true;
  };
  // a theme chosen in Aktuálně: its icons bigger and at full strength, every other icon half see-through
  const F = state.focus, dim = F ? 0.3 : 1;
  // the layers of other modules (webcams, air and weather stations) get their beacons here, under their icons, at any zoom
  const gb = F && FOCUS_KINDS[F] && FOCUS_KINDS[F].beacon;
  // (many points, the works and the closures: one ring each without the glow, the full beacon costs ~0.012 ms a point)
  if (gb) fx.T('beacons', () => { ctx.globalAlpha = 1; const lite = focusPts.length > 80; for (const [X, Y] of focusPts) { const x = v.ox + X * v.k, y = v.oy + Y * v.k; if (seen(ctx, x, y, 40)) (lite ? beaconRing : beacon)(ctx, x, y, t, gb, 22, Math.round(X + Y)); } ctx.globalAlpha = 1; });
  if (dopPin) { ctx.globalAlpha = 1; beacon(ctx, v.ox + dopPin[0] * v.k, v.oy + dopPin[1] * v.k, t, dopPin[2], 30, 3); } // (Doprava: the picked place)
  if (layers.focusLine() != null) fx.T('line', () => { ctx.globalAlpha = 1; layers.drawFocusLine(ctx, v, t, beacon); });
  const on = k => { ctx.globalAlpha = F === k ? 1 : dim; ctx.__hl = F === k; }; // (a highlighted kind: full strength, never folded under other icons)
  // (the car parks first: they are never folded into a "+N", so the icons after them make way for them)
  on('parking'); if (state.layers.parking) fx.T('parking', () => parking.draw(ctx, v, F === 'parking')); ctx.__hl = false;
  // (the stations: like the car parks, a handful of signs that are never folded away)
  on('vlaky'); if (VLAKY_ON && state.layers.vlaky) { if (!vlakyP) needVlaky(); fx.T('vlaky', () => vlaky.draw(ctx, v, F === 'vlaky')); } ctx.__hl = false;
  on('air'); if (state.layers.air) fx.T('air', () => air.draw(ctx, v, t));
  on('cams'); if (state.layers.cams) fx.T('cams', () => cams.draw(ctx, v, t));
  ctx.globalAlpha = 1; ctx.__hl = false;
  fx.T('city', () => city.draw(ctx, v, t, state.layers, F, state.eventsRange));
  ctx.globalAlpha = F === 'paro' ? 1 : dim;
  if (state.layers.paro) fx.T('paro', () => paro.draw(ctx, v, t, F === 'paro'));
  on('nehody'); if (state.layers.jams) fx.T('nehody', () => layers.drawAccidents(ctx, v, F === 'nehody')); ctx.__hl = false; // (Nehody teď, src/nehodyted.js)
  on('hasici'); if (state.layers.hasici) fx.T('hasici', () => hasici.draw(ctx, v, t)); ctx.__hl = false;
  on('policie'); if (state.layers.policie) fx.T('policie', () => policie.draw(ctx, v)); ctx.__hl = false; // (highlighted: full strength, never folded)
  on('voda'); if (state.layers.voda) fx.T('voda', () => voda.draw(ctx, v, t)); ctx.__hl = false;
  ctx.globalAlpha = dim;
  fx.T('lupa', () => lupa.draw(ctx, v, state.layers));
  on('meteo'); if (state.layers.meteo) fx.T('meteo', () => meteo.draw(ctx, v)); ctx.__hl = false;
  ctx.globalAlpha = 1;
  fx.T('pano', () => pano.draw(ctx, v, t, state.layers.pano)); // photographed streets and pictures; the cone of the open picture
  if ($('panoNote') && $('panoNote').textContent !== pano.status()) { $('panoNote').textContent = pano.status(); $('panoNote').hidden = !pano.status(); }
  ctx.__claim = null;
  layers.drawArrows(ctx); // the way the chosen vehicle and the highlighted line go: over every icon
  clusterHits = [];
  ctx.font = '700 11px "Atkinson Hyperlegible", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const onlyHl = boxes.some(b => b[5]); // (a theme highlighted from a card: only its own "+N", the dimmed icons stay quiet)
  for (const b of boxes) if (b[4] && (!onlyHl || b[5])) {
    const x = b[2], y = b[1], txt = `+${b[4]}`, w = Math.max(16, ctx.measureText(txt).width + 8);
    // while a theme is highlighted the badge of a dimmed icon is dimmed with it (it stood out white over the faded map)
    ctx.globalAlpha = F ? b[6] : 1;
    ctx.fillStyle = '#161d2b'; ctx.fillRect(x - w / 2 - 1, y - 8, w + 2, 15);
    ctx.fillStyle = '#f0f2ea'; ctx.fillRect(x - w / 2, y - 7, w, 13);
    ctx.fillStyle = '#161d2b'; ctx.fillText(txt, x, y);
    clusterHits.push([x - w / 2 - 2, y - 9, x + w / 2 + 2, y + 9, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
  }
  ctx.globalAlpha = 1;
  layers.drawBadges(ctx); // the line numbers of the vehicles: last of all, never covered
};
const clusterAt = (sx, sy) => clusterHits.find(h => sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]);
fx.inJam = (X, Y) => layers.inJam(X, Y);
fx.deadList = () => layers.deadList(); // (the pieces of the roads without cars because of a closure, src/deadroads.js)
let tagStamp = -1, tagSrc = null;
function refreshProjectTags() {
  const st = `${layers.stamp()}|${layers.dataStamp()}`; // (positions, or the data of the projects and sites)
  if (st === tagStamp && tagSrc === data.wikiPois && layers.proj.list) return;
  const { tags, byWiki } = layers.projectTags(data.wikiPois);
  fx.projTags = tags; fx.projByWiki = byWiki;
  tagStamp = st; tagSrc = data.wikiPois;
}

let hover = null;
viewer.addHandler('canvas-exit', () => { hover = null; fx.hover = null; if ($('dmTip')) $('dmTip').hidden = true; });
new OpenSeadragon.MouseTracker({
  element: viewer.canvas,
  moveHandler: e => {
    const v = view();
    const [X, Y] = [(e.position.x - v.ox) / v.k, (e.position.y - v.oy) / v.k];
    const crH = layers.craneAt(e.position.x, e.position.y);
    hoverProj = crH ? [crH] : v.z >= 0.25 ? layers.projectsAt(X, Y) : null;
    if (hoverProj && !hoverProj.length) hoverProj = null;
    const tag = wikiPoiAt(e.position.x, e.position.y);
    hover = !crH && !tag && state.layers.hover && v.z >= 0.45 ? buildingAt(X, Y) : null; // (over a name of a place: the name, not the house under it)
    fx.hover = hover;
    dmTip(e.position.x, e.position.y, X, Y);
    // over the drawn way of a picked journey (src/spojeni.js): a click opens its card, the tooltip says so
    const spH = !!(spojeni && spojeni.at(e.position.x, e.position.y));
    if (viewer.canvas.title !== (spH ? spojeni.hint() : '')) viewer.canvas.title = spH ? spojeni.hint() : '';
    viewer.canvas.style.cursor = placing ? 'crosshair' : spH || hover || tag || hoverProj || layers.vehicleAt(e.position.x, e.position.y) || (state.layers.air && air.at(e.position.x, e.position.y)) || (state.layers.cams && cams.at(e.position.x, e.position.y)) || (state.layers.pano && pano.at(e.position.x, e.position.y)) || city.at(e.position.x, e.position.y) || lupa.at(e.position.x, e.position.y) || (state.layers.paro && paro.at(e.position.x, e.position.y)) || (state.layers.hasici && hasici.at(e.position.x, e.position.y)) || (state.layers.policie && policie.at(e.position.x, e.position.y)) || (state.layers.voda && voda.at(e.position.x, e.position.y)) || (state.layers.parking && parking.at(e.position.x, e.position.y)) || (state.layers.vlaky && vlaky.at(e.position.x, e.position.y)) || (state.layers.meteo && meteo.at(e.position.x, e.position.y)) || (state.layers.zoo && zoo.at(e.position.x, e.position.y)) || layers.trafficAt(e.position.x, e.position.y, v) || (state.layers.clean && cisteni.at(e.position.x, e.position.y, v)) || (state.layers.projects && vmo.at(e.position.x, e.position.y, v)) ? 'pointer' : '';
  },
});
viewer.addHandler('canvas-click', e => {
  if (!e.quick) return;
  if (placing) {
    const v0 = view();
    const [lon, lat] = clickToLonLat((e.position.x - v0.ox) / v0.k, (e.position.y - v0.oy) / v0.k);
    if (placing.pick) { const p = placing.pick; placing = null; viewer.canvas.style.cursor = ''; p(lon, lat, e.position.x, e.position.y); return; }
    layers.setPosition(placing.key, lon, lat, placing.name);
    const done = placing.done;
    placing = null; viewer.canvas.style.cursor = '';
    toast('Nová poloha je uložená v tomto prohlížeči. Opravy můžete stáhnout v menu Živá data.');
    updateCorrCount();
    if (done) done();
    return;
  }
  const hit = pickAt(e.position.x, e.position.y);
  // a datová mapa under a finger (no cursor to follow): the value of the tapped place, for a few seconds
  if (!hit && state.datamap && e.originalEvent && e.originalEvent.pointerType && e.originalEvent.pointerType !== 'mouse') {
    const v = view(), was = hover;
    hover = null; dmTip(e.position.x, e.position.y, (e.position.x - v.ox) / v.k, (e.position.y - v.oy) / v.k); hover = was;
    clearTimeout(dmTip.t); dmTip.t = setTimeout(() => { if ($('dmTip')) $('dmTip').hidden = true; }, 4000);
  }
});
// What a click at a point of the screen opens (the card of the icon, vehicle, building… there). link: the place of a
// shared link (#@…&k=), which neither zooms into a "+N" nor opens the card of a quarter or a street photo.
// True when something was opened.
function pickAt(sx, sy, link = false) {
  // a name of a place (or its dot): drawn above everything, so it is clicked whole, also over an icon
  const wp = wikiPoiAt(sx, sy);
  if (wp) { showWikiPoi(wp); return true; }
  // a "+N" cluster badge: zoom in there
  const cl = clusterAt(sx, sy);
  if (cl && !link) { const v1 = view(); flyTo((cl[4] - v1.ox) / v1.k, (cl[5] - v1.oy) / v1.k, Math.min(4, v1.z * 2)); return true; }
  // small icons first (they sit on top), then name tags, then areas and buildings
  const pd = state.layers.pano && !link ? pano.at(sx, sy) : null;
  if (pd) { openPanoId(pd.id); return true; } // a dot of a street-level picture
  const cam = state.layers.cams ? cams.at(sx, sy) : null;
  if (cam) { showCam(cam); return true; }
  const pa = state.layers.paro ? paro.at(sx, sy) : null;
  if (pa) { showParo(pa); return true; }
  const hz = state.layers.hasici ? hasici.at(sx, sy) : null;
  if (hz) {
    showHasici(hz);
    // a running intervention clicked from so far that its fire engine is not drawn: closer, until it is (otherwise the zoom stays)
    const v1 = view(), m = v1.k * GEO.A;
    if (hasici.isOpen(hz) && m < HASICI_NEAR && hz.X != null) flyTo(hz.X, hz.Y, v1.z * (3 / m));
    return true;
  }
  const po = state.layers.policie ? policie.at(sx, sy) : null;
  if (po) { showPolicie(po); return true; }
  const vd = state.layers.voda ? voda.at(sx, sy) : null;
  if (vd) { if (vd.tank) showVodaTank(vd); else showVoda(vd); return true; }
  const pk = state.layers.parking ? parking.at(sx, sy) : null;
  if (pk) { showParking(pk); return true; }
  const vk = state.layers.vlaky ? vlaky.at(sx, sy) : null;
  if (vk) { showStation(vk); return true; }
  const lp = lupa.at(sx, sy);
  if (lp) { showLupa(lp); return true; }
  const ci = city.at(sx, sy);
  if (ci) { ({ monument: () => showMonument(ci.o), small: () => showSmall(ci.o), kamen: () => showKamen(ci.o), event: () => showEvent(ci.o), outage: () => showOutage(ci.o), routeStop: () => showRouteStop(ci.r, ci.i) })[ci.kind](); return true; }
  const aq = state.layers.air ? air.at(sx, sy) : null;
  if (aq) { showAir(aq); return true; }
  const ws = state.layers.meteo ? meteo.at(sx, sy) : null;
  if (ws) { showMeteo(ws); return true; }
  const zp = state.layers.zoo ? zoo.at(sx, sy) : null;
  if (zp) { showZooPen(zp); return true; }
  const veh = link ? null : layers.vehicleAt(sx, sy); // (a vehicle has moved on since the link was made)
  if (veh) { showVehicle(veh); return true; }
  const cr = layers.craneAt(sx, sy);
  if (cr) { const v2 = view(); const [cx, cy] = [(sx - v2.ox) / v2.k, (sy - v2.oy) / v2.k]; const more = layers.projectsAt(cx, cy).filter(q => q !== cr); showProject(cr, more); return true; }
  const stop = state.layers.mhdStops ? layers.stopAt(sx, sy) : null;
  if (stop) { showStop(stop, lastLine); return true; }
  // the drawn way of a picked journey (src/spojeni.js): its card again
  if (!link && spojeni && spojeni.at(sx, sy)) { spojeni.reopen(); return true; }
  // the name of a quarter: its card, not the house, road or line under the letters (the card is part of the datové mapy,
  // public.config.json). After the icons: an icon drawn over the name is clicked as the icon, the rest of the name stays the name.
  // (the highlight "dnešní nehody": its signs before the names of the quarters lying over them)
  if (state.focus === 'nehody') { const tn = layers.trafficAt(sx, sy, view()); if (tn && tn.nehoda) { showTraffic(tn); return true; } }
  const lb = fx.labelAt(sx, sy);
  if (lb && !link && shown('datamap')) { showArea(lb); return true; }
  const v = view();
  if (state.layers.bigplans && vmo.at(sx, sy, v)) { showVmo(); return true; }
  if (state.layers.bigplans && tramplan.at(sx, sy, v)) { showTramPlan(); return true; }
  const sweepMark = state.layers.clean ? cisteni.markAt(sx, sy) : null; // (the no-stopping sign or the chip of a block cleaning: before the lines of the traffic under it)
  if (sweepMark) { showClean(sweepMark); return true; }
  const tr = layers.trafficAt(sx, sy, v);
  if (tr) { showTraffic(tr); return true; }
  const sweep = state.layers.clean ? cisteni.at(sx, sy, v) : null; // (after the jams and the closures: those lie over its band)
  if (sweep) { showClean(sweep); return true; }
  const [X, Y] = [(sx - v.ox) / v.k, (sy - v.oy) / v.k];
  const projs = v.z >= 0.25 ? layers.projectsAt(X, Y) : [];
  const b = v.z >= 0.45 ? buildingAt(X, Y) : null;
  if (b) { withAttrs(b).then(() => showBuilding(b, projs)); return true; }
  if (projs.length) { showProject(projs[0], projs.slice(1)); return true; }
  if (!link && state.layers.pano && v.z >= pano.SHOW_FROM) panoStreet(X, Y); // a click into a street with the photo dots shown: the nearest picture
  return false;
}

// ------------------------------------------------------------------ street-level photos (Panoramax) in the card
// the first look follows the map: what is up on the screen (north, east, south or west by the rotation)
const mapHeading = () => ROT * 90;
function openPano(p, heading = mapHeading()) {
  card({ kind: 'pano',
    title: 'Pohled z ulice',
    rows: [['Foceno', p.date ? new Date(p.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }) : ''], ['Autor', p.author]],
    lon: p.lon, lat: p.lat, extra: pano.section(p, { heading }),
  });
}
async function openPanoId(id) {
  toast('Načítám fotku…', 1500);
  try { openPano(await pano.byId(id)); } catch { track('Chyba', { co: 'pano-nenacten' }); toast('Server Panoramaxu teď neodpovídá, zkuste to za chvíli.'); }
}
async function panoAt(lon, lat, maxM, heading) {
  toast('Hledám fotku z ulice…', 1500);
  try {
    const p = await pano.nearest(lon, lat, maxM);
    if (p) openPano(p, heading); else { track('Chyba', { co: 'pano-zadna-fotka' }); toast('Tady z ulice žádná fotka není. Bledě modré linky ukazují, které ulice jsou nafocené.', 4000) };
  } catch { toast('Server Panoramaxu teď neodpovídá, zkuste to za chvíli.'); }
}
const panoStreet = (X, Y) => panoAt(...clickToLonLat(X, Y), 30);
// ------------------------------------------------------------------ card
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// Wikipedia summaries (downloaded once while the map data was prepared)
let wikiData = null;
const wikiLoad = () => (wikiData ||= loadShared('wiki.json'));
// The card: title and basic facts, then one block per source — Wikipedia first, then city
// projects — each with a picture and a clear link to the original source.
// a web address in a text (descriptions, the rows of a card) becomes a link that opens in a new window;
// the full stop or bracket after the address stays text
const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
function linkify(txt) {
  const f = document.createDocumentFragment(); let at = 0;
  for (const m of txt.matchAll(URL_IN_TEXT)) {
    let u = m[0];
    while (/[.,;:!?'"»“”)\]]$/.test(u) && !(u.endsWith(')') && (u.match(/\(/g) || []).length >= (u.match(/\)/g) || []).length)) u = u.slice(0, -1);
    if (u.length < 5) continue;
    f.append(txt.slice(at, m.index));
    const a = document.createElement('a'); a.textContent = u; a.href = /^www\./i.test(u) ? `https://${u}` : u; a.target = '_blank'; a.rel = 'noopener';
    f.append(a); at = m.index + u.length;
  }
  f.append(txt.slice(at));
  return f;
}
// paragraphs and the values of the rows get their web addresses as links
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) { if ((tag === 'p' || tag === 'dd') && typeof txt === 'string' && /https?:\/\/|www\./i.test(txt)) e.append(linkify(txt)); else e.textContent = txt; } return e; };
const srcBtn = (href, label) => { const a = el('a', 'src-btn', label); a.href = safeUrl(href); // (addresses from the data: src/safe.js)
  a.target = '_blank'; a.rel = 'noopener'; return a; };
function rowsDl(rows) { const dl = el('dl'); for (const [k, v] of rows) if (v) dl.append(el('dt', '', k), el('dd', '', v)); return dl; }
const BRNO_BRZO_MAP = 'https://experience.arcgis.com/experience/829f491bc03242ba99ba2e246056e982';
// the card of one project in the Brno Brzo map (opens straight on that project)
const brzoCard = id => `${BRNO_BRZO_MAP}?dlg=Karta-projektu#data_s=id%3AdataSource_1-190735f1807-layer-113%3A${id}`;
let siteWeb = {}, siteWebRead = '';
if (shown('siteweb')) loadShared('siteweb.json').then(d => { siteWeb = (d && d.items) || {}; siteWebRead = (d && d.updated) || ''; }).catch(() => {});
const searchUrl = q => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
let mediaPics = {}, mediaData = null;
const mediaReady = () => (mediaData ||= fetchData(`${BASE}data/media.json`).then(r => r.json()).then(d => { mediaPics = (d && d.pics) || {}; }).catch(() => { mediaData = null; }));
mediaReady();
watchFeed('media.json', () => { mediaData = null; return mediaReady(); });
const picSizes = base => ({ s: `${MEDIA}${base}-s.webp`, m: `${MEDIA}${base}-m.webp`, l: `${MEDIA}${base}-l.webp` });
// the copies of the given originals, in their order; originals without a copy are left out
const picsOf = urls => urls.filter(isUrl).map(u => { const k = picKey(u), src = mediaPics[k]; return src ? picSizes(`img/${src}/${k}`) : null; }).filter(Boolean);
const basePics = bases => bases.map(picSizes); // pictures stored under their own names (Dáme na vás)
// one picture in a card (the card size), a click opens the big view
function picImg(p, alt, credit, cls = '') {
  const im = el('img', cls); im.src = p.m; im.alt = alt; im.loading = 'lazy'; im.decoding = 'async';
  zoomable(im, credit, p.l);
  return im;
}
// pictures of a project: the first one big, the others as small thumbnails to switch; a click opens the big view.
// null when there is nothing to show
function gallery(pics, alt, credit) {
  if (!pics.length) return null;
  const wrap = el('div', 'gallery');
  let cur = 0;
  const big = el('img'); big.alt = alt; big.loading = 'lazy'; big.referrerPolicy = 'no-referrer'; big.src = pics[0].m;
  big.title = 'Zvětšit obrázek'; big.classList.add('zoomable');
  big.onerror = () => { wrap.remove(); };
  big.onclick = () => openLightbox(pics, cur, alt, credit);
  wrap.append(big);
  if (pics.length > 1) {
    const row = el('div', 'thumbs');
    pics.forEach((pc, i) => {
      const b = el('button', i ? '' : 'on'); b.type = 'button'; b.title = `Obrázek ${i + 1} z ${pics.length}`;
      const t = el('img'); t.src = pc.s; t.alt = ''; t.loading = 'lazy'; t.referrerPolicy = 'no-referrer'; t.onerror = () => b.remove();
      b.append(t); b.onclick = () => { cur = i; big.src = pc.m; row.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
      row.append(b);
    });
    wrap.append(row);
  }
  wrap.append(el('span', 'credit', credit));
  return wrap;
}
// the big view of the pictures: over the whole window, arrows (and ← →) to go through them, Esc or a click outside closes
function openLightbox(pics, i, alt, credit) {
  track('Nástroj', { nastroj: 'lightbox' });
  let d = $('lightbox');
  if (!d) {
    d = el('dialog', 'lightbox'); d.id = 'lightbox';
    d.innerHTML = '<button class="pbtn close" type="button" aria-label="Zavřít">×</button><button class="pbtn lb-prev" type="button" aria-label="Předchozí obrázek">‹</button><figure><img alt=""><figcaption></figcaption></figure><button class="pbtn lb-next" type="button" aria-label="Další obrázek">›</button>';
    document.body.append(d);
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    d.querySelector('.close').onclick = () => d.close();
    d.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') d.querySelector('.lb-prev').click(); if (e.key === 'ArrowRight') d.querySelector('.lb-next').click(); });
  }
  const img = d.querySelector('img'), cap = d.querySelector('figcaption');
  // (when the large picture is not there, the one shown in the card is used)
  img.onerror = () => { if (pics[i].m && img.src !== pics[i].m) img.src = pics[i].m; };
  const show = k => {
    i = (k + pics.length) % pics.length;
    img.src = pics[i].l; img.alt = alt; img.referrerPolicy = 'no-referrer';
    cap.textContent = `${alt}${pics.length > 1 ? ` · ${i + 1} / ${pics.length}` : ''} · ${credit}`;
  };
  d.querySelector('.lb-prev').hidden = d.querySelector('.lb-next').hidden = pics.length < 2;
  d.querySelector('.lb-prev').onclick = () => show(i - 1);
  d.querySelector('.lb-next').onclick = () => show(i + 1);
  show(i);
  if (!d.open) d.showModal();
}
// any single picture in a card: a click opens it in the big view (large: the address of a bigger copy, when there is one)
function zoomable(im, credit, large = '') {
  im.classList.add('zoomable'); im.title = 'Zvětšit obrázek';
  im.onclick = () => openLightbox([{ l: large || im.currentSrc || im.src, m: im.currentSrc || im.src }], 0, im.alt, credit);
  return im;
}
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'web projektu'; } };
const isUrl = u => /^https?:\/\//i.test(u || '');
const SITE_KIND = { residential: 'bytové domy', apartments: 'bytové domy', house: 'rodinné domy', commercial: 'komerční budovy', retail: 'obchody', office: 'kanceláře', industrial: 'průmysl', school: 'škola', kindergarten: 'mateřská škola', university: 'univerzita', hospital: 'nemocnice', hotel: 'hotel', theatre: 'divadlo', church: 'kostel', civic: 'veřejná budova', public: 'veřejná budova', transportation: 'dopravní stavba', road: 'silnice', highway: 'silnice', railway: 'železnice', rail: 'železnice', tram: 'tramvajová trať', bridge: 'most', utility_tunnel: 'kolektor', parking: 'parkoviště', yes: 'stavba', ...Object.fromEntries(Object.entries({ playground: 'dětské hřiště', pitch: 'sportovní hřiště', park: 'park', garden: 'zahrada', recreation_ground: 'rekreační plocha', dog_park: 'psí hřiště', footway: 'chodník', sidewalk: 'chodník', cycleway: 'cyklostezka', path: 'cesta', pedestrian: 'pěší zóna', square: 'náměstí' })) };
// an open-air space being redone (a playground, a park, a footpath): fenced ground, not a building site with a crane
const SOFT_SITE = new Set(['playground', 'pitch', 'park', 'garden', 'recreation_ground', 'dog_park', 'footway', 'sidewalk', 'cycleway', 'path', 'pedestrian', 'square']);
const softSite = p => SOFT_SITE.has(p.kind);
// the hatched ground of a building site can be switched off from its card: a big site covers the houses
// around it, which then cannot be clicked. The crane stays and still opens this card. Remembered in this browser.
function areaToggle(p) {
  const lab = el('label', 'areatoggle');
  const cb = el('input'); cb.type = 'checkbox'; cb.checked = !layers.areaHidden(p);
  cb.onchange = () => { layers.setAreaHidden(p, !cb.checked); toast(cb.checked ? 'Plocha staveniště je zpět na mapě' : 'Plocha staveniště je skrytá, zůstal jen jeřáb (klikací)'); };
  lab.append(cb, ' Kreslit šrafovanou plochu staveniště');
  lab.title = 'Odškrtnutím plocha zmizí a přestane zakrývat okolní budovy. Stavbu pak otevře klik na jeřáb.';
  return lab;
}
// a construction site mapped in OpenStreetMap (no record in the city's project data)
function siteSection(p) {
  const s = el('div', 'sec proj');
  const sw = siteWeb[`site-${p.osmId}`] || {};
  const soft = softSite(p);
  s.append(el('h3', '', soft ? 'Úprava veřejného prostoru' : 'Staveniště'));
  if (sw.title && !p.n) s.append(el('strong', '', sw.title));
  if (!soft) s.append(areaToggle(p));
  const sg = gallery(picsOf([sw.img]), sw.title || 'Stavba', `Obrázek: ${hostOf(sw.web)}`);
  if (sg) s.append(sg);
  const siteTxt = p.desc || (sw.sum && sw.sum.txt) || sw.desc || (soft ? `Tady se podle OpenStreetMap opravuje ${SITE_KIND[p.kind]}: plocha je po dobu prací oplocená. Není to stavba budovy, jen úprava toho, co tu už bylo. Podrobnosti zatím v otevřených datech nejsou.` : 'Území je zakreslené jako staveniště. Podrobnosti o stavbě zatím v otevřených datech nejsou.');
  s.append(el('p', '', siteTxt));
  const czDate = d => (d ? d.split('-').reverse().map(x => x.replace(/^0/, '')).join('. ') : '');
  const siteRows = [
    [soft ? 'Co se opravuje' : 'Co se staví', p.kind ? cap(SITE_KIND[p.kind] || p.kind.replace(/_/g, ' ')) : ''], ['Stavebník', p.op], ['Zahájení', p.start || sw.start], ['Dokončení plánováno', p.open || sw.end],
    ['Upraveno v OSM', czDate(p.edited)], ['Ověřeno', p.checked ? czDate(p.checked) : ''],
    ['Potvrzuje i', p.confirmedBy || 'jen OpenStreetMap (upraveno za poslední rok)'],
  ];
  s.append(rowsDl(siteRows));
  say(s, soft ? 'Úprava veřejného prostoru' : 'Staveniště', `${siteTxt}\n${factsText(siteRows, ['Co se opravuje', 'Co se staví', 'Stavebník', 'Zahájení', 'Dokončení plánováno'])}`);
  const btns = el('div', 'btns');
  const web = isUrl(p.web) ? p.web : sw.web;
  if (isUrl(web)) btns.append(srcBtn(web, 'Web stavby'));
  else btns.append(srcBtn(searchUrl(`${p.n && p.n !== 'Demolice' ? p.n : sw.title || 'stavba'} Brno${p.op ? ` ${p.op}` : ''}`), 'Hledat stavbu na webu'));
  s.append(btns);
  return s;
}
function demolSection(p) {
  const s = el('div', 'sec proj');
  s.append(el('h3', '', p.g === 'grass' || p.g === 'paved' ? 'Zbouraná budova' : 'Zbořeniště'));
  if (p.n) s.append(el('strong', '', p.n));
  const today = p.g === 'grass' ? 'je tu dnes tráva' : p.g === 'paved' ? 'je tu dnes zpevněná plocha' : 'je tu dnes zbořeniště';
  const demolTxt = `Budova tu podle ${p.src === 'osm' ? 'OpenStreetMap' : '3D modelu města (2020–2023)'} ještě stála, na leteckých snímcích z jara 2025 a na ortofotu z března 2026 ale už nestojí, ${today}. Mapa ji proto nekreslí.`;
  s.append(el('p', '', demolTxt));
  say(s, '', `${demolTxt}${p.addr ? `\nAdresa: ${p.addr} Brno.` : ''}`);
  s.append(rowsDl([['Adresa', p.addr ? `${p.addr} Brno` : ''], ['Půdorys', p.a ? `cca ${p.a} m²` : ''], ['Výška v datech', p.h ? `cca ${p.h} m` : ''], ['Staveniště v OSM', p.site ? 'ano' : '']]));
  return s;
}
function projectSection(p, showName) {
  if (p.demol) return demolSection(p);
  if (p.osm) return siteSection(p);
  const s = el('div', 'sec proj');
  s.append(el('h3', '', p.cb ? 'Co bude, Brno? · projekt města' : 'Projekt ve městě · Brno Brzo'));
  if (showName) s.append(el('strong', '', p.cb ? p.cb.t : p.n));
  if (p.st === 've výstavbě' && !p.pt) s.append(areaToggle(p));
  const sw = siteWeb[String(p.id)] || {};
  // the copies of the pictures of Brno Brzo and "Co bude, Brno?"; the project's web page when there is none
  const urls = [...(p.cb && p.cb.img ? [p.cb.img] : []), ...(p.imgs || [])];
  const pg = gallery(picsOf(urls), p.cb ? p.cb.t : p.n, p.imgsrc || (p.imgs && p.imgs.length ? 'Foto a vizualizace: Brno Brzo, Statutární město Brno' : 'Obrázek: Co bude, Brno?')) || gallery(picsOf([sw.img]), p.n, `Obrázek: ${hostOf(sw.web)}`);
  if (pg) s.append(pg);
  const dmy = d => d.split('-').reverse().map(x => x.replace(/^0/, '')).join('. ');
  const MON = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
  const sum = sw.sum && !sw.sum.no && sw.sum.txt ? sw.sum : null;
  const cityAge = p.edited ? `z ${MON[+p.edited.slice(5, 7) - 1]} ${p.edited.slice(0, 4)}` : 'bez data poslední úpravy';
  let rd = '';
  if (p.fix) {
    rd = p.fix.txt;
    s.append(el('p', '', p.fix.txt));
    s.append(el('p', 'livenote', `Popis upřesněn ${dmy(p.fix.date)}${isUrl(p.fix.src) ? ` podle ${hostOf(p.fix.src)}` : ''}${p.txt ? `; původní popis města byl ${cityAge}` : ''}.`));
  } else if (p.cb && p.cb.d) { rd = p.cb.d; s.append(el('p', '', p.cb.d)); }
  else {
    if (sum) {
      rd = sum.txt;
      for (const para of sum.txt.split(/\n{2,}/)) s.append(el('p', '', para.trim()));
      s.append(el('p', 'livenote', `Popis podle webu projektu (${[...new Set((sum.src || [sw.web]).map(hostOf))].join(', ')}).`));
    } else if (p.txt) {
      rd = p.txt;
      s.append(el('p', '', p.txt));
      s.append(el('p', 'livenote', `Popis z městské mapy Brno Brzo, ${cityAge}.`));
    } else if (!sw.sum && sw.desc) {
      // (the page's own description only where there is nothing else — and not where the summary found the page
      // says nothing about the project: a third of the descriptions is the investor's general advertising)
      rd = sw.desc;
      s.append(el('p', '', sw.desc));
      s.append(el('p', 'livenote', `Podle webu projektu (${hostOf(sw.web)})${siteWebRead ? `, načteno ${dmy(siteWebRead)}` : ''}.`));
    }
  }
  if (p.news) s.append(el('p', 'livenote', `Aktuálně: ${p.news}`));
  if (sw.dead) s.append(el('p', 'livenote', 'Web projektu uvedený v datech města už neexistuje.'));
  // the pages say the project is further than the city's state: said next to it, not instead of it
  const webState = sum && { done: 'dokončeno', partly_done: 'zčásti dokončeno', construction: p.st === 'plánovaný' ? 've výstavbě' : '' }[sum.state];
  const prRows = [['Stav', p.st], ['Stav podle webu projektu', webState || ''], ['Typ', p.ty && cap(p.ty)], ['Investice', p.inv], ['Investor', p.dev], ['Architekt', p.arch], ['Adresa', p.addr], ['Městská část', p.mc],
    ['Zahájení', p.begin || (sw.start ? `${sw.start} (podle webu projektu)` : '')], ['Dokončení', p.done || ((sum && sum.done) || sw.end ? `${(sum && sum.done) || sw.end} (podle webu projektu)` : '')]];
  s.append(rowsDl(prRows));
  say(s, showName ? (p.cb ? p.cb.t : p.n) : (p.cb ? 'Co bude, Brno?' : 'Projekt ve městě'), `${rd}\n${factsText(prRows, ['Stav', 'Typ', 'Investice', 'Investor', 'Architekt', 'Zahájení', 'Dokončení'])}`, p.cb ? 'Zdroj: cobude.brno.cz' : 'Zdroj: městská mapa Brno Brzo a web projektu');
  const btns = el('div', 'btns');
  if (p.cb) btns.append(srcBtn(p.cb.url, 'Detail na cobude.brno.cz'));
  const web = sw.dead ? '' : sw.web || (isUrl(p.web) ? p.web : '');
  if (isUrl(web) && (!p.cb || web !== p.cb.url)) btns.append(srcBtn(web, 'Web projektu'));
  else if (!p.cb) btns.append(srcBtn(searchUrl(`${p.n} Brno${p.dev ? ` ${p.dev}` : ''}`), 'Hledat projekt na webu'));
  if (sw.investor && sw.investor !== web) btns.append(srcBtn(sw.investor, 'Projekty investora'));
  if (!p.pt && typeof p.id === 'number') btns.append(srcBtn(brzoCard(p.id), 'Karta projektu v Brno Brzo'));
  s.append(btns);
  return s;
}
// ---- "Číst" (src/reader.js): on a phone, the texts of the card run over the whole screen and can be read aloud.
// Each block of a card says what of it is for reading: say(block, heading, text, credit) — the whole text from the
// data, not the shortened one shown in the card; for blocks of facts a few basic ones as short sentences.
// (a part of its own in public.config.json, public since 2026-11-10)
const READ_ON = shown('cist');
const READ_KINDS = new Set(['akce', 'pribeh', 'wiki', 'dum', 'gotobrno', 'trasa', 'trasa-uvod', 'paro', 'projekt', 'cobude', 'staveniste', 'demolice', 'drobnost', 'kamen']);
const say = (sec, h, t, c = '') => { if (t && t.trim()) (sec.read ||= []).push({ h, t: t.trim(), c }); };
// what may stand in the head of the card beside Číst: the focus button, the star of Moje and "Cesta sem" of Spojení
// (any other quick action, e.g. Nastoupit, takes the place; before 2026-11-15 "Cesta sem" hid Číst in every card)
const READ_BESIDE = ['focus-btn', 'fav-btn', 'sp-here'];
function readButton(kind, title, lead) {
  if (!READ_ON || !READ_KINDS.has(kind) || [...$('cardAct').children].some(c => !READ_BESIDE.some(k => c.classList.contains(k)))) return; // (on a desktop too since 2026-11-10)
  const parts = [...(lead ? [{ t: lead }] : []), ...[...$('cardSections').querySelectorAll('div')].flatMap(s => s.read || [])];
  if (parts.reduce((n, p) => n + p.t.length, 0) < 80) return;
  const b = el('button', 'pbtn ride-btn', '▶ Číst'); b.type = 'button'; b.title = 'Text karty přes celou obrazovku, s možností předčítání';
  b.onclick = () => { const voice = openReader({ title, parts, onVoice: on => { if (on) track('Nástroj', { nastroj: 'cist', hodnota: 'hlas' }); } }); track('Nástroj', { nastroj: 'cist', hodnota: voice ? 'hlas' : 'text' }); };
  const fav = $('cardAct').querySelector('.fav-btn'); // (the star of Moje and "Cesta sem" stay last, beside ×)
  if (fav) fav.before(b); else $('cardAct').append(b);
}
// Card kinds the star of Moje does not keep: what cannot be found again at its place (a vehicle moves on, a street
// photo, a route, a journey and a quarter are not points)
const NO_FAV = new Set(['vozidlo', 'pano', 'trasa', 'trasa-uvod', 'ctvrt', 'spojeni']);
const NO_TRIP = new Set(['vozidlo', 'zastavka', 'spojeni', 'pano', 'trasa-uvod', 'ctvrt']); // (no "Cesta sem" in these cards, src/spojeni.js)
async function card({ kind = null, title, text, rows = [], lon, lat, wiki, projects = [], extra = null, buttons = [], place = null, monument = null, link = null, action = null, read = null, top = null, part = null, fav = null }) {
  // (the card of a link from another page: no entry of its own in the history, openEventLink; any other card: as usual,
  // and one that replaces the card of a link gets its entry now)
  const fromLink = Date.now() < (card.linkUntil || 0);
  card.linkUntil = 0;
  if (fromLink) { card.histLink = true; card.histLinkSeen = false; } else if (card.histLink) { card.histLink = card.histLinkSeen = false; setTimeout(histSync, 0); }
  card.cur = { kind, link, part, lon: +lon, lat: +lat }; // (what the card shows: the place of a shared link, shareUrl)
  // the address of the page follows the open place (#misto/…), so it can be shared or bookmarked
  if (link) history.replaceState(history.state, '', `#misto/${link}`); else if (location.hash.startsWith('#misto/')) history.replaceState(history.state, '', location.pathname + location.search);
  // what people look at (src/stats.js): the kind of the card, its name and where it was opened from; a redraw of the same card does not count
  { const key = `${kind}|${title}`; if (key !== card.last) track('Karta', { typ: kind, nazev: title, odkud: card.fromLink ? 'odkaz' : card.fromSearch ? 'hledani' : 'mapa' }); card.last = key; card.fromLink = false; }
  if (document.activeElement !== $('q') && !(card.fromSearch && Date.now() - card.fromSearch < 3000)) { $('q').value = ''; $('results').replaceChildren(); offer(); } // (the field emptied: its offer back, src/moje.js)
  card.fromSearch = 0;
  // every card about a place marks the place on the map (a caller may set a more exact position itself)
  fx.cardOpened(); fx.area = null;
  if (Number.isFinite(+lon) && Number.isFinite(+lat) && +lat) fx.markerIfNone(...layers.llToImg(+lon, +lat)); // on the terrain (dem), not the flat formula
  $('cardTitle').textContent = title;
  $('cardAct').replaceChildren(...(action ? [action].flat().filter(Boolean) : [])); // the quick action(s) in the head, beside ×
  // Moje (src/moje.js): the star keeps what the card shows, by its link, by what the caller says (fav: a stop) or by its point
  if (moje) {
    const trip = kind === 'spojeni' && spojeni ? spojeni.pair() : null; // (a journey of Spojení: kept as its two ends)
    const ref = fav || (trip ? { j: trip.j } : link ? { m: link } : kind && !NO_FAV.has(kind) && Number.isFinite(+lat) && +lat ? { k: [+(+lat).toFixed(6), +(+lon).toFixed(6)] } : null);
    if (ref) $('cardAct').append(moje.star({ n: title, kind, ...ref }));
  }
  // Spojení (src/spojeni.js): the way here by public transport, from a card about a place
  if (spojeni && !NO_TRIP.has(kind) && Number.isFinite(+lat) && +lat && inMap(+lon, +lat)) $('cardAct').append(spojeni.toHereButton({ name: title, lon: +lon, lat: +lat }));
  $('cardFig').hidden = true;
  // (top: something to show first, right under the title and above the text and the rows: the strip with the state of
  // a fire brigade's action. Its place is made on the first use, so index.html stays as it is.)
  { let slot = $('cardTop'); if (!slot) { slot = el('div'); slot.id = 'cardTop'; $('cardLead').before(slot); } slot.replaceChildren(...(top ? [top] : [])); slot.hidden = !top; }
  $('cardLead').hidden = !text;
  $('cardLead').replaceChildren(linkify(text || ''));
  const dl = $('cardFacts');
  dl.replaceChildren(...rowsDl(rows).childNodes);
  const secs = $('cardSections');
  secs.replaceChildren();
  const links = $('cardLinks');
  links.replaceChildren();
  // a phone: the card opened from a tab (a list in Objevuj, Vrstvy …) takes its place; the tab and how far it was
  // scrolled are remembered, so the way back (the button in the card, the Back button, Esc) returns to that list.
  // A card that follows another one (the next stop of a route) keeps the way back of the first.
  if (isPhone() && openTab) { const sb = document.querySelector(`#pane-${openTab} .sheet-body`); card.fromTab = { tab: openTab, top: sb ? sb.scrollTop : 0 }; }
  else if ($('card').hidden) card.fromTab = null;
  $('card').hidden = false;
  { const ev = card.fromEvents && Date.now() - card.fromEvents < 3000; card.fromEvents = 0;
    const zp = card.fromZpr && Date.now() - card.fromZpr < 3000; card.fromZpr = 0; // (opened from the news, Zprávy: the way back leads there)
    if (ev || zp) card.fromTab = null;
    card.backZpr = !!zp;
    $('cardBack').hidden = !(ev || zp || card.fromTab);
    $('cardBack').textContent = card.fromTab ? `‹ Zpět: ${TAB_NAMES[card.fromTab.tab] || 'seznam'}` : zp ? '‹ Zpět na zprávy' : '‹ Zpět na události'; }
  $('card').querySelector('.sheet-body').scrollTop = 0; // a new card starts at its top
  $('fcPop').hidden = true; $('fcTile').setAttribute('aria-expanded', 'false');
  if (isPhone() && openTab) setTab(null);
  if (!$('events').hidden) setEventsOpen(false);
  if (isPhone() && !$('aktual').hidden) setAktOpen(false); // (on a phone the same sheet: the card would open under it)
  if (zprOpen()) setZprOpen(false); // (the card takes the place of the list of the news; its Back button returns there)
  $('noResults').hidden = true;
  cams.select(null); // a camera card selects its camera again after this
  layers.selectWork(null); // (the lit pieces of a site of works: its card chooses it again after this)
  layers.setLineRoute(null); // (the route of a line chosen in a stop card goes with that card)
  if (showStop.off) showStop.off(); // (and so do its lit sign and the route of a departure picked in it; a stop card sets its own after this)
  vmo.select(false); tramplan.select(false); air.select(null);
  if (extra) secs.append(extra);
  else layers.selectVehicle(null);
  const token = (card.token = (card.token || 0) + 1);
  await mediaReady(); // the list of our copies of the pictures (usually already here)
  if (token !== card.token) return;
  if (wiki) {
    const w = (await wikiLoad())[wiki];
    if (token !== card.token) return;
    if (w) {
      const s = el('div', 'sec wiki');
      s.append(el('h3', '', 'Wikipedie'));
      const wp = w[2] ? picsOf([w[2]]) : []; // the lead photo of the article, from our copy
      if (wp.length) {
        const cr = el('a', '', 'Foto: Wikimedia Commons'); cr.href = `https://cs.wikipedia.org/wiki/Soubor:${encodeURIComponent(w[3] || '')}`; cr.target = '_blank'; cr.rel = 'noopener';
        const c = el('span', 'credit'); c.append(cr);
        s.append(picImg(wp[0], title, 'Foto: Wikimedia Commons'), c);
      }
      s.append(el('p', '', w[0]));
      const btns = el('div', 'btns'); btns.append(srcBtn(w[1], 'Celý článek na Wikipedii'));
      s.append(btns, el('span', 'credit', 'Text: Wikipedie, CC BY-SA 4.0'));
      say(s, 'Wikipedie', w[0], 'Text: Wikipedie, CC BY-SA 4.0');
      secs.append(s);
    }
  }
  // GO TO BRNO for this place (matched to its Wikipedia tag, or given), then the cultural monument
  const gp = place || (wiki && city.data.places.length && data.wikiPois ? city.match(data.wikiPois).byWiki.get(wiki) : null);
  if (gp) { await city.detail(); if (token !== card.token) return; secs.append(gotobrnoSection(gp)); }
  if (monument) secs.append(monumentSection(monument));
  const seen = new Set();
  if (projects.length) { await layers.projectDetail(); if (token !== card.token) return; }
  for (const p of projects) { if (seen.has(p.id)) continue; seen.add(p.id); secs.append(projectSection(p, projects.length > 1 || (p.cb ? p.cb.t : p.n) !== title)); }
  // buttons to other maps and registers (open in a new window)
  for (const b of buttons) links.append(srcBtn(b.href, b.label));
  if (link) {
    const sh = el('button', 'src-btn', 'Sdílet odkaz na místo'); sh.type = 'button';
    sh.onclick = async () => { track('Sdílení', { co: 'misto', jak: navigator.share && matchMedia('(max-width: 640px)').matches ? 'share' : 'schranka' }); try { if (navigator.share && matchMedia('(max-width: 640px)').matches) await navigator.share({ title, url: location.href }); else { await navigator.clipboard.writeText(location.href); toast('Odkaz na místo je zkopírovaný', 6000, fbAction(location.href, 'misto')); } } catch { toast('Odkaz je v adresním řádku', 6000, fbAction(location.href, 'misto')); } };
    links.append(sh);
  } else if (part || (kind && !NO_PICK.has(kind) && Number.isFinite(+lat) && +lat)) {
    // no page of its own: the link to this view with the card open (by its id, part, or at its position)
    const sh = el('button', 'src-btn', 'Sdílet odkaz na místo'); sh.type = 'button'; sh.onclick = share;
    links.append(sh);
  }
  if (lon) {
    links.append(
      srcBtn(`https://mapy.cz/zakladni?x=${lon}&y=${lat}&z=19&source=coor&id=${lon}%2C${lat}`, 'Mapy.cz'),
      srcBtn(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`, 'OpenStreetMap'),
    );
  }
  readButton(kind, title, read);
}
const projByWiki = title => ((title && fx.projByWiki && fx.projByWiki.get(title)) || []).filter(p => layers.projOn(p));
function showBuilding(b, projs = []) {
  const [poly, , name, addr, type, lon, lat, h, wiki, levels, ruian, psc] = b;
  const fullAddr = addr ? `${addr}${psc ? `, ${String(psc).replace(/^(\d{3})(\d{2})$/, '$1 $2')}` : ''} Brno` : '';
  const buttons = [];
  // the building in the official register of addresses and buildings (RÚIAN, ČÚZK), which links on to the cadastre
  if (ruian) buttons.push({ href: `https://vdp.cuzk.cz/vdp/ruian/stavebniobjekty/${ruian}`, label: 'Katastr (RÚIAN, ČÚZK)' });
  else buttons.push({ href: `https://vdp.cuzk.cz/vdp/ruian/stavebniobjekty/vyhledej`, label: 'Katastr (RÚIAN, ČÚZK)' });
  card({ kind: 'dum',
    title: name || (wiki ? wiki.replace(/ \(.*\)$/, '') : addr ? addr.split(',')[0] : cap(type)),
    rows: [['Typ', cap(type)], ['Adresa', fullAddr], ['Podlaží', levels ? String(levels) : ''], ['Výška', h ? `cca ${h} m` : ''], ['Kód budovy', ruian ? String(ruian) : '']],
    lon, lat, wiki, projects: [...projByWiki(wiki), ...projs], buttons,
    // the cultural monument in this building (Wikidata): its point is on the ground, so it is tested against the
    // footprints (the roof outlines moved down by the wall height) of all the pieces of the building, not against
    // the roof, which for a tall building covers the ground of the building behind it. Then the GO TO BRNO place
    // when the building has no Wikipedia article.
    monument: city.data.monuments.length ? city.monumentFor(piecesOf(b).map(q => q[0].map((v, i) => (i % 2 ? v + q[1] : v))), lon, lat) : null,
    place: wiki ? null : city.placeNear(lon, lat, name || '', 40),
  });
  // the monuments (180 KB) come with the first building card, not with the first chunk of buildings: the card is made
  // again once they are here, should this building be one of them
  if (!city.data.monuments.length) city.loadMonuments().then(() => { if (fx.selected === b && !$('card').hidden && city.monumentFor(piecesOf(b).map(q => q[0].map((v, i) => (i % 2 ? v + q[1] : v))), lon, lat)) showBuilding(b, projs); });
  // a street-level photo of the house on request (the card's sections are already replaced at this point); the street
  // may be as far from the middle of the house as the house is big (its outline in image px: 1 px = 1 m across, 2 m down)
  if (shown('pano') && Number.isFinite(+lon) && +lat) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of piecesOf(b)) for (let i = 0; i < q[0].length; i += 2) { x0 = Math.min(x0, q[0][i]); x1 = Math.max(x1, q[0][i]); y0 = Math.min(y0, q[0][i + 1]); y1 = Math.max(y1, q[0][i + 1]); }
    const half = Number.isFinite(x0) ? Math.hypot((x1 - x0) / GEO.A, (2 * (y1 - y0)) / GEO.A) / 2 : 0;
    $('cardSections').append(pano.buildingSection(+lon, +lat, Math.min(150, 35 + half), (p, heading) => pano.section(p, { heading })));
    // [ADMIN] the facade as drawn checked against the street photo
    if (ADMIN) $('cardSections').append(facadeAdmin({ lon: +lon, lat: +lat, wiki, name: name || addr || '', levels }));
  }
  // the marker in the middle of the roof as drawn (of all the pieces of the building), that is what was clicked
  if (poly && poly.length >= 6) { let sx = 0, sy = 0, n = 0; for (const q of piecesOf(b)) for (let i = 0; i < q[0].length; i += 2) { sx += q[0][i]; sy += q[0][i + 1]; n++; } fx.marker(sx / n, sy / n); }
  fx.selected = b;
  void poly;
  // what the datová mapa that is on says about this building (its file is here already; all four were 1.3 MB for every first card)
  const ci = chunkIndexOf(b);
  if (ci && state.datamap) datamap.describe(ci[0], ci[1], state.datamap).then(rows => { if (fx.selected === b && rows.length) $('cardFacts').append(...rowsDl(rows).childNodes); });
}
const FAC_LS = 'b2k-facades';
function ownFacades() { try { return JSON.parse(localStorage.getItem(FAC_LS) || '{}'); } catch { return {}; } }
function saveFacades(o) { try { localStorage.setItem(FAC_LS, JSON.stringify(o)); } catch { /* private mode */ } updateCorrCount(); }
const FACADE_KINDS = [['', 'druh beze změny'], ['old', 'starý dům (činžák)'], ['house', 'rodinný dům'], ['flat', 'bytový dům'], ['panel', 'panelák'], ['office', 'kanceláře (sklo)'], ['shop', 'obchod, nízká budova'], ['public', 'veřejná budova'], ['ind', 'průmysl'], ['church', 'kostel'], ['portholes', 'hladká fasáda s průhledy (Letmo)']];
function facadeAdmin({ lon, lat, wiki, name, levels }) {
  const key = `${lon.toFixed(5)},${lat.toFixed(5)}`;
  const cur = ownFacades()[key] || {};
  const box = el('div', 'sec admin-box fac');
  box.append(el('h3', '', 'Fasáda podle fotky'));
  box.append(el('p', 'livenote', 'Otevřete fotku z ulice (tlačítko výš), porovnejte ji s kresbou a zapište, co má mapa kreslit jinak. Kapátko vezme barvu přímo z fotky (Chrome).'));
  const form = el('div', 'fac-form');
  const useCol = el('input'); useCol.type = 'checkbox'; useCol.checked = !!cur.wall; useCol.title = 'Změnit barvu zdi';
  const colour = el('input'); colour.type = 'color'; colour.value = cur.wall || '#d9d2c3'; colour.oninput = () => { useCol.checked = true; };
  const drop = el('button', 'pbtn small', 'Kapátko'); drop.type = 'button'; drop.title = 'Vybrat barvu kdekoli na obrazovce, třeba z fotky z ulice';
  drop.onclick = async () => {
    if (!window.EyeDropper) { toast('Kapátko umí jen Chrome a Edge.'); return; }
    try { const r = await new window.EyeDropper().open(); colour.value = r.sRGBHex; useCol.checked = true; } catch { /* cancelled */ }
  };
  const kind = el('select'); for (const [v, l] of FACADE_KINDS) { const o = el('option', '', l); o.value = v; kind.append(o); } kind.value = cur.kind || '';
  const lv = el('input'); lv.type = 'number'; lv.min = 1; lv.max = 40; lv.placeholder = levels ? `v datech ${levels}` : 'podle fotky'; lv.value = cur.lv || '';
  const shop = el('input'); shop.type = 'checkbox'; shop.checked = !!cur.shop;
  const why = el('input'); why.type = 'text'; why.placeholder = 'co je na fotce vidět'; why.value = cur.why || '';
  const row = (label, ...els) => { const l = el('label', 'fac-row'); l.append(el('span', '', label), ...els); return l; };
  form.append(row('Barva zdi', useCol, colour, drop), row('Druh', kind), row('Podlaží', lv), row('Výloha v přízemí', shop), row('Poznámka', why));
  const btns = el('div', 'btns');
  const save = el('button', 'pbtn small', 'Uložit opravu'); save.type = 'button';
  const del = el('button', 'pbtn small', 'Smazat'); del.type = 'button'; del.hidden = !cur.at;
  const state = el('span', 'livenote', cur.at ? `Uloženo ${new Date(cur.at).toLocaleDateString('cs-CZ')}.` : '');
  save.onclick = () => {
    const o = ownFacades();
    o[key] = { lon, lat, w: wiki || undefined, name, wall: useCol.checked ? colour.value : undefined, kind: kind.value || undefined, lv: +lv.value || undefined, shop: shop.checked || undefined, why: why.value || undefined, at: new Date().toISOString() };
    saveFacades(o); state.textContent = 'Uloženo.'; del.hidden = false; toast('Oprava fasády je uložená v tomto prohlížeči.');
  };
  del.onclick = () => { const o = ownFacades(); delete o[key]; saveFacades(o); state.textContent = ''; del.hidden = true; };
  btns.append(save, del, state);
  box.append(form, btns);
  return box;
}
// the chunk (key) and the index of a building in it
function chunkIndexOf(b) {
  const cx = Math.floor(b[0][0] / CH), cy = Math.floor(b[0][1] / CH);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const list = chunk(cx + dx, cy + dy), i = list ? list.indexOf(b) : -1; if (i >= 0) return [`${cx + dx}_${cy + dy}`, i]; }
  return null;
}
// the card of a quarter (cadastral unit) under the name clicked: people, and what the datové mapy say about its houses
const fmtN = n => Math.round(n).toLocaleString('cs-CZ');
function bars(classes, counts, total, firstLabel) {
  const ul = el('ul', 'bars');
  const row = (name, colour, n) => { const li = el('li'); const sw = el('span', 'dm-sw'); sw.style.background = colour; const bar = el('span', 'bar'); const fill = el('span', 'fill'); fill.style.width = `${total ? Math.round((100 * n) / total) : 0}%`; bar.append(fill); li.append(sw, el('span', 'nm', name), bar, el('span', 'val', total ? `${Math.round((100 * n) / total)} %` : '–')); ul.append(li); };
  if (firstLabel) row(firstLabel, '#6b7280', counts[0]);
  for (const c of classes) row(c.n, c.c, c.v.reduce((a, v) => a + (counts[v] || 0), 0));
  return ul;
}
async function showArea(lb) {
  const a = await datamap.areaAt(lb.X, lb.Y);
  if (!a) { toast(`${lb.n}: statistiky jsou jen pro území města Brna`); return; }
  const flats = a.vyuziti[1] + a.vyuziti[2];
  const sec = el('div', 'sec area');
  sec.append(el('h3', '', `Hluk z dopravy u ${fmtN(flats)} domů s bydlením`), bars(DATAMAPS.hluk.classes, a.hlukB, flats, 'pod 50 dB'));
  const wet = a.povodenB.slice(1).reduce((x, y) => x + y, 0);
  sec.append(el('h3', '', `Povodeň: ${fmtN(wet)} domů s bydlením v záplavovém území`), bars(DATAMAPS.povoden.classes, a.povodenB, flats, null));
  const known = a.b - a.vyuziti[0];
  sec.append(el('h3', '', `Co je v ${fmtN(known)} domech, které průzkum zná`), bars(DATAMAPS.vyuziti.classes, a.vyuziti, known, null));
  sec.append(el('p', 'livenote', 'Podíly jsou z domů, ne z lidí. Zdroje a datum najdete v Přehledu dat (Více).'));
  // (each section gets its place now, so they keep their order whichever file comes first)
  const later = (on, make) => { if (!on) return; const slot = el('div'); sec.append(slot); make(a).then(s => (s ? slot.replaceWith(s) : slot.remove())); };
  later(shown('kriminalita'), crimeSection);
  later(shown('pocitova'), fearSection);
  later(shown('nehody'), accidentSection);
  card({ kind: 'ctvrt', title: a.n, text: `${a.kind === 'mc' ? 'Městská část' : a.kod === 610003 ? 'Katastrální území, historické jádro města' : 'Katastrální území'}${a.note ? `, ${a.note}` : ''}`, rows: [['Obyvatelé (sčítání 2021)', fmtN(a.pop)], ['Rozloha', `${fmtN(a.ha)} ha`], ['Hustota', a.ha ? `${fmtN(a.pop / a.ha)} obyvatel na hektar` : ''], ['Domů v mapě', fmtN(a.b)]], extra: sec });
  fx.area = a.rings;
}
// kriminalita in the card of a quarter: per map the cases of the last five years, a year per km² against Brno, the trend
// by whole years and the most common kinds (the cases of the police areas whose centre lies in the quarter)
async function crimeSection(a) {
  const d = await datamap.crime(), q = d && d.areas[a.n];
  if (!q || !a.ha) return null;
  const num = datamap.crimeNum, box = el('div', 'crime');
  box.append(el('h3', '', `Kriminalita za posledních ${d.years} let`));
  for (const k of d.keys) {
    const def = DATAMAPS[k], v = q[k], rate = v.n / d.years / (a.ha / 100);
    const cls = def.classes[def.edges.filter(t => rate >= t).length];
    const row = el('p', 'crime-row'), sw = el('span', 'dm-sw'); sw.style.background = cls.c;
    row.append(sw, el('strong', '', def.n), ` ${fmtN(v.n)} ${v.n === 1 ? 'případ' : v.n >= 2 && v.n <= 4 ? 'případy' : 'případů'}, ${num(rate)} ročně na km² (průměr Brna ${num(d.avg[k])})`);
    // the trend: one bar a whole year
    const max = Math.max(1, ...v.years), bw = 100 / v.years.length;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 24'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'crime-spark');
    v.years.forEach((n, i) => {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'), h = (22 * n) / max;
      r.setAttribute('x', (i * bw + bw * 0.12).toFixed(2)); r.setAttribute('width', (bw * 0.76).toFixed(2)); r.setAttribute('y', (24 - h).toFixed(2)); r.setAttribute('height', h.toFixed(2));
      r.setAttribute('fill', cls.c);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = `${d.firstYear + i}: ${n}`; r.append(t);
      svg.append(r);
    });
    const yrs = el('div', 'crime-years'); yrs.append(el('span', '', String(d.firstYear)), el('span', '', String(d.firstYear + v.years.length - 1)));
    const top = Object.entries(v.sub).filter(([, n]) => n).sort((x, y) => y[1] - x[1]).slice(0, 3);
    box.append(row, svg, yrs);
    if (top.length && v.n) box.append(el('p', 'crime-sub', `Nejčastěji ${top.map(([n, c]) => `${n} ${Math.round((100 * c) / v.n)} %`).join(', ')}.`));
  }
  box.append(el('p', 'livenote', `Případy oznámené policii nebo jí zjištěné, po celých rocích od ${d.firstYear}. Policie zveřejňuje polohu jen zhruba, po oblastech; čtvrti patří oblasti, jejichž střed v ní leží. Zdroj: Policie České republiky, data k ${d.updated.split('-').reverse().join('. ')}.`));
  return box;
}
// Pocitová mapa 2025 in the card of a quarter: how many people of the survey put a point in it, map by map
async function fearSection(a) {
  const d = await datamap.fear(), q = d && d.areas[a.n];
  if (!q) return null;
  const box = el('div', 'crime');
  box.append(el('h3', '', 'Pocitová mapa 2025: kolik lidí z ankety sem dalo bod'));
  const ul = el('ul', 'bars');
  const max = Math.max(1, ...['bezpeci', 'oblibena', 'lepsi', 'nelibi'].map(k => q[k] || 0));
  for (const k of ['oblibena', 'lepsi', 'nelibi', 'bezpeci']) {
    const def = DATAMAPS[k], n = q[k] || 0, li = el('li'), sw = el('span', 'dm-sw'), bar = el('span', 'bar'), fill = el('span', 'fill');
    sw.style.background = def.classes[3].c; fill.style.width = `${Math.round((100 * n) / max)}%`; bar.append(fill);
    li.append(sw, el('span', 'nm', def.n), bar, el('span', 'val', fmtN(n))); ul.append(li);
  }
  box.append(ul, el('p', 'livenote', `Z ${fmtN(d.people)} lidí, kteří v anketě města (květen až říjen 2025) označili aspoň jedno místo; každý mohl u každé otázky až 5 míst. Anketa není reprezentativní. Zdroj: Statutární město Brno, Pocitová mapa Brna 2025.`));
  return box;
}
const ACC_KIND = ['jiný druh', 'srážka s jedoucím vozidlem', 'náraz do zaparkovaného vozidla', 'náraz do pevné překážky', 'srážka s chodcem', 'srážka se zvěří', 'srážka se zvířetem', 'srážka s vlakem', 'srážka s tramvají', 'havárie bez srážky'];
const ACC_CAUSE = ['', 'nezaviněno řidičem', 'nepřiměřená rychlost', 'nesprávné předjíždění', 'nedání přednosti', 'nesprávný způsob jízdy', 'technická závada'];
async function accidentSection(a) {
  const d = await datamap.accidents(), q = d && d.areas[a.n];
  if (!q || !a.ha) return null;
  const [from, to] = d.card, yrs = to - from + 1, num = datamap.crimeNum, b = d.brno;
  const rate = q.n / yrs / (a.ha / 100), avg = b.n / yrs / (b.ha / 100);
  const box = el('div', 'crime');
  box.append(el('h3', '', `Dopravní nehody ${from}–${to}`));
  const row = el('p', 'crime-row'), sw = el('span', 'dm-sw'), def = DATAMAPS.nehody;
  sw.style.background = def.classes[rate >= 2 * avg ? 4 : rate >= avg ? 3 : rate >= avg / 2 ? 2 : 1].c;
  const nw = (n, one, few, many) => `${fmtN(n)} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
  row.append(sw, el('strong', '', nw(q.n, 'nehoda', 'nehody', 'nehod')), `za ${yrs} let: ${num(rate)} ročně na km² (průměr Brna ${num(avg)})`);
  box.append(row);
  // every year since the first one; the running year paler (it is not over)
  const last = d.lastDate.slice(0, 4), max = Math.max(1, ...q.y), bw = 100 / q.y.length;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 24'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'crime-spark');
  q.y.forEach((n, i) => {
    const year = d.firstYear + i, part = String(year) === last && d.lastDate.slice(5) < '12-31';
    for (const [v, c] of [[n, '#f9a65a'], [q.yi[i], '#c8202a']]) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'), h = (22 * v) / max;
      r.setAttribute('x', (i * bw + bw * 0.12).toFixed(2)); r.setAttribute('width', (bw * 0.76).toFixed(2)); r.setAttribute('y', (24 - h).toFixed(2)); r.setAttribute('height', h.toFixed(2));
      r.setAttribute('fill', c); if (part) r.setAttribute('opacity', '0.45');
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = `${year}${part ? ` (do ${d.lastDate.split('-').slice(1).reverse().map(Number).join('. ')}.)` : ''}: ${n} nehod, z toho ${q.yi[i]} se zraněním`; r.append(t);
      svg.append(r);
    }
  });
  const ys = el('div', 'crime-years'); ys.append(el('span', '', String(d.firstYear)), el('span', '', `${last}${String(+last) !== String(to) ? ' (zatím)' : ''}`));
  box.append(svg, ys, el('p', 'crime-sub', 'Sloupce: všechny nehody (světle), z toho se zraněním (tmavě).'));
  const hurt = [q.k && nw(q.k, 'mrtvý', 'mrtví', 'mrtvých'), q.s && `${fmtN(q.s)} těžce`, q.l && `${fmtN(q.l)} lehce zraněných`].filter(Boolean).join(', ');
  box.append(el('p', 'crime-sub', `Se zraněním ${nw(q.inj, 'nehoda', 'nehody', 'nehod')}${hurt ? ` (${hurt})` : ''}. S chodcem ${fmtN(q.ped)}, s cyklistou ${fmtN(q.cyc)}, s motorkou ${fmtN(q.moto)}; alkohol u viníka ${fmtN(q.alc)}.`));
  const top = (arr, names, k) => arr.map((n, i) => [names[i], n]).filter(([nm, n]) => nm && n).sort((x, y) => y[1] - x[1]).slice(0, k).map(([nm, n]) => `${nm} ${Math.round((100 * n) / q.n)} %`).join(', ');
  if (q.n) box.append(el('p', 'crime-sub', `Nejčastěji ${top(q.kinds, ACC_KIND, 3)}. Hlavní příčina podle policie: ${top(q.causes, ACC_CAUSE, 2)}.`));
  box.append(el('p', 'livenote', `Nehody, které evidovala Policie ČR, i ty jen s plechovou škodou; čtvrti patří nehody uvnitř jejích hranic. Od roku 2023 policie v celém Brně eviduje méně nehod jen se škodou (asi 1 900 ročně místo 2 300 až 2 800 dřív), nehod se zraněním je zhruba stejně. Zdroj: Policie ČR, roky do 2022 přes otevřená data města Brna; data do ${d.lastDate.split('-').reverse().map(Number).join('. ')}.`));
  return box;
}
function showProject(p, more = []) {
  if (p.demol) { card({ kind: 'demolice', title: p.n || (p.g === 'grass' || p.g === 'paved' ? 'Zbouraná budova' : 'Zbořeniště'), lon: p.g[0][0].toFixed(5), lat: p.g[0][1].toFixed(5), projects: [p, ...more] }); fx.marker(...layers.projectPos(p)); return; }
  if (p.osm) {
    const sw = siteWeb[`site-${p.osmId}`] || {};
    const title = p.n ? (p.n === 'Demolice' ? 'Demolice · staveniště' : p.n) : sw.title || (softSite(p) ? `Oprava: ${SITE_KIND[p.kind]}` : 'Staveniště');
    card({ kind: 'staveniste', title, lon: p.g[0][0].toFixed(5), lat: p.g[0][1].toFixed(5), projects: [p, ...more] });
    fx.marker(...layers.projectPos(p)); // the crane (or the middle of a fenced-off playground), not a corner of the site
    return;
  }
  const key = `proj:${p.id}`, title = p.cb ? p.cb.t : p.n;
  const c = layers.correction(key);
  const lon = c && c.lon ? c.lon : p.g[0][0], lat = c && c.lon ? c.lat : p.g[0][1];
  // where the location comes from, and tools to move or confirm it
  const box = el('div', 'sec locate');
  box.append(el('h3', '', 'Poloha na mapě'));
  box.append(el('p', '', `Poloha: ${layers.positionInfo(p)}.`));
  // the marker blinks where the crane stands (under construction) or in the middle of the area (planned)
  if (!ADMIN) { card({ kind: 'projekt', title, lon, lat, projects: [p, ...more], extra: box }); fx.marker(...layers.projectPos(p)); return; }
  // [ADMIN] moving / confirming the position
  box.classList.add('admin-box');
  const btns = el('div', 'btns');
  const mk = (label, fn) => { const b = el('button', 'pbtn small', label); b.type = 'button'; b.onclick = fn; return b; };
  btns.append(mk(p.pt ? 'Přesunout na správné místo' : 'Přesunout popisek', () => startPlacing(key, title, () => showProject(p, more))));
  btns.append(mk('Potvrdit, že je správně', () => { layers.confirmPosition(key, title); toast('Poloha potvrzená (uloženo v tomto prohlížeči)'); showProject(p, more); }));
  if (layers.ownCorrections()[key]) btns.append(mk('Vrátit původní', () => { layers.resetPosition(key); showProject(p, more); }));
  box.append(btns);
  card({ kind: 'projekt', title, lon, lat, projects: [p, ...more], extra: box, link: placeSlug(title) });
  fx.marker(...layers.projectPos(p));
}
// ------------------------------------------------------------------ Dáme na vás (participatory budget)
const paroDay = iso => new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
const fmtKc = n => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
const darkCol = col => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(col || ''); if (!m) return false; const [r, g, b] = [1, 2, 3].map(i => parseInt(m[i], 16)); return 0.299 * r + 0.587 * g + 0.114 * b < 140; };
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
// what the phase of the year is called in the card
function paroPhaseName(p) {
  const ph = paro.phase();
  return ph === 'voting' ? 'návrh v hlasování' : ph === 'before' ? 'návrh před hlasováním' : ph === 'counting' ? 'hlasování skončilo, čeká na výsledky' : p.win ? 'vítězný projekt' : 'návrh, který nevyhrál';
}
// the card of a proposal: category, text, pictures, budget, the running vote and the link to the vote
async function showParo(p, fly = false, ms) {
  await paro.detail();
  const d = paro.detailOf(p), ph = paro.phase(), y = paro.data.year;
  const s = el('div', 'sec proj paro');
  s.append(el('h3', '', `Dáme na vás ${y} · ${paroPhaseName(p)}`));
  const chip = el('span', 'paro-cat', p.cat || 'návrh'); chip.style.background = p.col || '#f3c868'; chip.style.color = darkCol(p.col) ? '#f0f2ea' : '#161d2b';
  s.append(chip);
  if (d.imgs && d.imgs.length) s.append(gallery(basePics(d.imgs), p.n, 'Obrázek: navrhovatel, Dáme na vás (damenavas.brno.cz)'));
  if (d.anot) s.append(el('p', '', d.anot));
  if (d.txt && d.txt !== d.anot) s.append(el('p', 'paro-txt', d.txt));
  if (d.benefit) { const b = el('p', 'paro-txt'); b.append(el('strong', '', 'Přínos pro veřejnost: '), d.benefit); s.append(b); }
  say(s, `Dáme na vás ${y}`, [p.cat && `Kategorie: ${p.cat}.`, p.b ? `Rozpočet: ${fmtKc(p.b)}.` : '', d.anot, d.txt !== d.anot && d.txt, d.benefit && `Přínos pro veřejnost: ${d.benefit}`].filter(Boolean).join('\n'), 'Text: navrhovatel, Dáme na vás (damenavas.brno.cz)');
  if (d.items && d.items.length) {
    const det = el('details', 'paro-budget'); det.append(el('summary', '', `Rozpočet po položkách (celkem ${fmtKc(p.b)})`));
    det.append(rowsDl(d.items.map(([n, c]) => [n, fmtKc(c)])));
    s.append(det);
  }
  // the vote: the count of the last data run first, then the running count from the web (while the vote is on)
  const votes = el('p', 'livenote');
  const showVotes = (v, live) => { if (!v) return; votes.textContent = `${live ? 'Hlasy právě teď' : `Hlasy k ${new Date(v.at).toLocaleDateString('cs-CZ')}`}: ${v.plus} pro, ${v.minus} proti, bilance ${v.bal > 0 ? '+' : ''}${v.bal}${p.rank ? ` · ${p.rank}. místo` : ''}.`; };
  showVotes(d.votes, false);
  if (ph === 'voting') paro.liveVotes().then(m => { const lv = m && m.get(p.id); if (lv) showVotes(lv, true); });
  s.append(votes);
  if (ph === 'voting' && paro.data.voting) s.append(el('p', 'livenote', `Hlasovat může každý s trvalým pobytem v Brně, do ${paroDay(paro.data.voting.end)} ${new Date(paro.data.voting.end).toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit' })}.`));
  const btns = el('div', 'btns');
  btns.append(srcBtn(d.url || `${PARO_WEB}/project/${p.id}`, ph === 'voting' ? 'Detail a hlasování na damenavas.brno.cz' : 'Detail na damenavas.brno.cz'));
  if (p.city) { const b = el('button', 'src-btn inner', 'Ostatní návrhy pro celé Brno'); b.type = 'button'; b.onclick = () => showParoCity(); btns.append(b); }
  s.append(btns);
  s.append(el('span', 'credit', 'Zdroj: otevřená data města Brna (CC BY) a Dáme na vás, damenavas.brno.cz'));
  const rows = [['Kategorie', p.cat], ['Městská část', p.city ? 'celé Brno (bez jednoho konkrétního místa)' : p.mc], ['Navrhovatel', d.prop], ['Rozpočet', p.b ? fmtKc(p.b) : '']];
  paro.positions();
  card({ kind: 'paro', title: p.n, rows, lon: p.city ? undefined : p.lon.toFixed(5), lat: p.city ? undefined : p.lat.toFixed(5), extra: s, link: placeSlug(p.n), action: p.city ? null : focusButton('paro', [p.X, p.Y]) });
  if (!p.city) { if (fly) flyTo(p.X, p.Y, Math.max(1.5, view().z)); fx.marker(p.X, p.Y, ms); if (fly && matchMedia('(max-width: 640px)').matches) setPanelOpen(false); }
}
// the proposals for the whole city: a list in a card (they have no place on the map)
async function showParoCity() {
  await paro.load();
  const ph = paro.phase(), y = paro.data.year;
  const list = paro.data.items.filter(p => p.city && (ph !== 'results' || p.win)).sort((a, b) => a.n.localeCompare(b.n, 'cs'));
  const s = el('div', 'sec proj paro');
  s.append(el('h3', '', `Dáme na vás ${y} · ${ph === 'results' ? 'vítězné návrhy pro celé Brno' : 'návrhy pro celé Brno'}`));
  const ul = el('ul', 'places paro-list');
  for (const p of list) {
    const li = el('li'), btn = el('button', '', p.n); btn.type = 'button';
    const sw = el('span', 'paro-dot'); sw.style.background = p.col || '#f3c868'; btn.prepend(sw);
    const sm = el('small', '', ` · ${p.cat}${p.b ? `, ${fmtKc(p.b)}` : ''}`); sm.style.color = 'var(--faint)'; btn.append(sm);
    btn.onclick = () => showParo(p);
    li.append(btn); ul.append(li);
  }
  s.append(ul);
  const btns = el('div', 'btns'); btns.append(srcBtn(ph === 'voting' ? `${PARO_WEB}/` : 'https://damenavas.brno.cz/', ph === 'voting' ? 'Hlasování na damenavas.brno.cz' : 'Dáme na vás')); s.append(btns);
  card({ kind: 'paro-brno', title: `Návrhy pro celé Brno`, text: `${plural(list.length, 'návrh', 'návrhy', 'návrhů')} participativního rozpočtu, které nemají jedno konkrétní místo: týkají se celého města (sítě pítek, stromy, programy pro seniory, …). Na mapě proto cedulku nemají.`, extra: s });
  if (matchMedia('(max-width: 640px)').matches) setPanelOpen(false);
}
// the layer panel follows the phase of the year: the label, the button of the city-wide proposals, and outside the
// vote the layer starts switched off
function updateParoPanel() {
  const lab = $('paroLabel'), btn = $('paroCity'), box = $('lay-paro');
  if (!lab || !paro.data.voting) return;
  const ph = paro.phase(), v = paro.data.voting, y = paro.data.year;
  lab.textContent = ph === 'voting' ? `Dáme na vás ${y}: návrhy v hlasování (do ${paroDay(v.end)})` : ph === 'before' ? `Dáme na vás ${y}: návrhy před hlasováním (od ${paroDay(v.start)})` : ph === 'counting' ? `Dáme na vás ${y}: hlasování skončilo, výsledky ${paroDay(v.announcement)}` : `Dáme na vás ${y}: vítězné projekty`;
  const cw = paro.data.items.filter(p => p.city && (ph !== 'results' || p.win));
  if (btn) { btn.hidden = !cw.length; btn.textContent = `+${plural(cw.length, 'návrh', 'návrhy', 'návrhů')} pro celé Brno (bez místa na mapě)`; btn.onclick = () => showParoCity(); }
  if (ph !== 'voting' && box && box.checked && !updateParoPanel.touched) { box.checked = false; state.layers.paro = false; secCounts(); }
}
paro.load().then(updateParoPanel);
// placing mode: the next click on the map sets the new position
let placing = null;
function startPlacing(key, name, done) {
  placing = { key, name, done };
  toast(`Klikněte do mapy na správné místo: ${name}`);
  viewer.canvas.style.cursor = 'crosshair';
}
// A point of the map asked for by its next click (Spojení, "Vybrat v mapě", src/spojeni.js): { lon, lat, name } or, when
// a stop was clicked, { num, name }; null when given up (pickCancel: Esc, Zrušit, the form closed).
let pickDone = null;
function pickPoint() {
  pickCancel();
  return new Promise(res => {
    pickDone = res;
    const arm = () => {
      placing = { pick: async (lon, lat, sx, sy) => {
        if (pickDone !== res) return;
        if (!inMap(lon, lat)) { toast('Tohle místo je mimo mapu. Zkuste to blíž k Brnu.'); arm(); return; }
        const v = view(), X = (sx - v.ox) / v.k, Y = (sy - v.oy) / v.k;
        const st = state.layers.mhdStops ? layers.stopAt(sx, sy) : null;
        const wp = st ? null : wikiPoiAt(sx, sy);
        fx.marker(X, Y, 5000);
        const out = st ? { num: +st.num, name: st.name } : { lon, lat, name: wp ? wikiPoiName(wp) : await pointName(X, Y).catch(() => 'Bod v mapě') };
        if (pickDone !== res) return; // (given up while the name was on its way)
        pickDone = null;
        res(out);
      } };
      viewer.canvas.style.cursor = 'crosshair';
    };
    arm();
  });
}
function pickCancel() {
  if (!pickDone) return;
  const res = pickDone;
  pickDone = null;
  if (placing && placing.pick) { placing = null; viewer.canvas.style.cursor = ''; }
  res(null);
}
// The name of a point clicked in the map: the house under it (its name, else its address); else the nearest house with
// an address within 60 m ("Bod · Veveří 12": no "u" or "poblíž", the names of streets would need their cases); else
// the nearest street, square or place of the search; else just "Bod v mapě" (a field, a wood).
async function pointName(X, Y) {
  const cx = Math.floor(X / CH), cy = Math.floor(Y / CH);
  for (let i = 0; i < 10 && !chunk(cx, cy); i++) await new Promise(r => setTimeout(r, 150)); // (the houses there may still be on their way)
  const nameOf = b => b[2] || (b[8] ? b[8].replace(/ \(.*\)$/, '') : b[3] ? b[3].split(',')[0] : '');
  const hit = buildingAt(X, Y);
  if (hit) { await withAttrs(hit); const n = nameOf(hit); if (n) return n; }
  const near = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const list = chunk(cx + dx, cy + dy);
    if (!list) continue;
    for (const b of list) {
      const p = b[0];
      let mx = 0, my = 0;
      for (let i = 0; i < p.length; i += 2) { mx += p[i]; my += p[i + 1]; }
      const d = Math.hypot(mx / (p.length / 2) - X, (my / (p.length / 2) + b[1] - Y) * 2) / GEO.A; // (metres; the roof stands the wall's height above its ground)
      if (d <= 60) near.push([d, b]);
    }
  }
  near.sort((a, b) => a[0] - b[0]);
  for (const [, b] of near.slice(0, 8)) { await withAttrs(b); if (b[3]) return `Bod · ${b[3].split(',')[0]}`; }
  // no house with an address around (a square, a park, a bridge): the nearest street, square or place of the search
  // within 120 m (a street is one point there, its middle: a long one is found only near it)
  const idx = await loadIndex().catch(() => null);
  let best = null, bd = 120;
  for (const it of idx || []) {
    if (it.paro || it.far !== undefined || it.k === 'adresa' || !Number.isFinite(it.X)) continue;
    const d = Math.hypot(it.X - X, (it.Y - Y) * 2) / GEO.A;
    if (d < bd) { bd = d; best = it; }
  }
  if (best) return `Bod · ${best.n}`;
  return 'Bod v mapě';
}
// screen point -> lon/lat on the hilly map (refined twice against the terrain)
function clickToLonLat(X, Y) {
  let [lon, lat] = imgToLonLat(X, Y);
  const [l0, a0] = imgToLonLat(0, 0);
  for (let i = 0; i < 4; i++) {
    const [x2, y2] = layers.llToImg(lon, lat);
    const [l1, a1] = imgToLonLat(X - x2, Y - y2); // the same pixel error expressed in lon/lat
    lon += l1 - l0; lat += a1 - a0;
  }
  return [lon, lat];
}
function downloadCorrections() {
  const data = { note: 'Opravy poloh a fasád z mapy Brno 2000.', created: new Date().toISOString(), items: layers.ownCorrections(), camdirs: cams.own(), facades: ownFacades() };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'corrections.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// a tram, trolleybus or bus: where it goes and its stops with times
function showVehicle(m) {
  const NAME = { tram: 'Tramvaj', trol: 'Trolejbus', bus: 'Autobus' };
  const hhmm = sec => { const s = ((sec % 86400) + 86400) % 86400; return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`; };
  // The timetable (the trip, its route and stops) is loaded on demand on phones: until it is here, the card says so
  // and is drawn again once it arrives (the same vehicle, with its position of that moment).
  showVehicle.cur = m.id;
  const ready = layers.mhd.ready();
  if (!ready) layers.mhd.load().then(() => { if (showVehicle.cur === m.id && !$('card').hidden) showVehicle(layers.drawnVehicles().find(x => x.id === m.id) || m); });
  // a live vehicle is matched to its trip in the timetable; its real delay shifts the stop times
  const plan = m.live ? layers.matchPlan(m) : m;
  const delayMin = m.live ? Math.round(m.delay || 0) : null;
  const delayTxt = delayMin === null ? 'neznámé (vozidlo podle jízdního řádu)' : delayMin > 0 ? `+${delayMin} min (zpožděné)` : delayMin < 0 ? `${delayMin} min (jede napřed)` : 'včas';
  const it = plan ? layers.mhd.itinerary(plan) : [];
  if (m.live && it.length) {
    const now = (() => { const s = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Prague' }).split(' ')[1].split(':').map(Number); return s[0] * 3600 + s[1] * 60 + s[2]; })();
    let nextSet = false;
    for (const o of it) { const exp = o.time + delayMin * 60; if (exp <= now) o.state = 'past'; else if (!nextSet) { o.state = 'next'; nextSet = true; } else o.state = 'later'; }
  }
  const next = it.find(o => o.state === 'next');
  const sec = el('div', 'sec itin');
  // "Nastoupit": the map moves along with the vehicle, kept in the middle (dragging the map gets you off); the quick
  // action of the card, in its head beside ×
  const rideB = el('button', 'pbtn ride-btn', ride === m.id ? '■ Vystoupit' : '▶ Nastoupit');
  rideB.type = 'button'; rideB.dataset.id = String(m.id); rideB.title = 'Mapa pojede s vozem, ten zůstane uprostřed';
  rideB.setAttribute('aria-pressed', String(ride === m.id));
  rideB.onclick = () => { if (ride === m.id) stopRide(); else startRide(m); };
  sec.append(el('h3', '', m.live ? 'Jízdní řád spoje a skutečnost' : 'Jízdní řád tohoto spoje'));
  if (it.length) {
    const ol = el('ol', 'itinerary');
    const reqSeen = new Set();
    for (const o of it) {
      const li = el('li', o.state);
      const st = el('span', 'st', o.name);
      // request stops as in printed timetables: × (all day) or × with "v noci" (only 22–5 h)
      if (o.reqKind) {
        const mk = el('span', `rq${o.req ? '' : ' off'}`, o.reqKind === 'n' ? '× v noci' : '×');
        mk.title = o.reqKind === 'n' ? `Zastávka na znamení jen v noci (22–5 h)${o.req ? '' : ', tento spoj tu zastaví vždy'}` : 'Zastávka na znamení: vystupte stisknutím tlačítka, na zastávce dejte řidiči znamení';
        st.append(' ', mk); reqSeen.add(o.reqKind);
      }
      li.append(el('span', 'tm', hhmm(o.time)), st);
      // a stop in the itinerary opens that stop's departures for this line
      if (o.num) { li.classList.add('link'); li.title = 'Odjezdy z této zastávky'; li.onclick = () => showStopByNum(o.num, m.line); }
      if (m.live && delayMin) li.append(el('span', `exp ${delayMin > 0 ? 'late' : 'early'}`, hhmm(o.time + delayMin * 60)));
      ol.append(li);
    }
    sec.append(ol);
    if (reqSeen.size) sec.append(el('p', 'livenote', `× zastávka na znamení: kdo chce vystoupit, stiskne tlačítko, kdo chce nastoupit, dá na zastávce řidiči znamení.${reqSeen.has('n') ? ' „× v noci“ platí jen 22–5 h.' : ''}`));
  } else sec.append(el('p', '', ready ? 'K tomuto vozidlu se nepodařilo najít spoj v jízdním řádu.' : 'Načítám jízdní řád…'));
  sec.append(el('span', 'credit', m.live
    ? 'Poloha a zpoždění: živý proud KORDIS JMK (data.brno.cz, CC BY). Jízdní řád IDS JMK © KORDIS JMK.'
    : 'Poloha podle jízdního řádu IDS JMK © KORDIS JMK. Živé polohy zapnete ve Vrstvách: MHD → MHD živě.'));
  const from = it.length ? it[0].name : '';
  const to = m.live ? layers.mhd.stopName(m.final) || (it.length ? it[it.length - 1].name : '') : m.hs || (it.length ? it[it.length - 1].name : '');
  card({ kind: 'vozidlo',
    title: `${NAME[m.type]} ${m.line} → ${to}`,
    rows: [
      ['Linka', `${m.line} (${NAME[m.type].toLowerCase()})`], ['Odkud', from], ['Kam', to],
      ['Poslední zastávka', m.live ? layers.mhd.stopName(m.last) : ''],
      ['Další zastávka', next ? `${next.name} v ${hhmm(next.time + (delayMin || 0) * 60)}` : ''],
      ['Zpoždění', delayTxt],
      ['Aktualizace', m.live && m.at ? new Date(m.at).toLocaleTimeString('cs-CZ') : ''],
      ['Nízkopodlažní', m.live ? (m.lowFloor ? 'ano' : 'ne') : ''],
      ['Vůz', m.live && m.vid ? [m.vid, m.idb, m.idc].filter(x => x > 0).map(x => `ev. č. ${x}`).join(' + ') : ''],
      ['Výluka', city.outagesForLine(m.line).map(o => o.title).slice(0, 3).join('; ') ? `linka má výluku: ${city.outagesForLine(m.line).map(o => o.title).slice(0, 3).join('; ')}` : ''],
      ['Souprava', m.live && m.vid ? (() => { const n = [m.vid, m.idb, m.idc].filter(x => x > 0).length; return `${n === 1 ? 'jeden vůz' : n === 2 ? 'dva spojené vozy' : 'tři spojené vozy'}, asi ${Math.round(setLength(m.type, [m.vid, m.idb, m.idc]).len)} m`; })() : ''],
    ],
    extra: sec,
    action: [lineFocusButton(m.line, m.type, [m.X, m.Y]), rideB],
  });
  layers.selectVehicle(m.id);
  lastLine = m.line;
  layers.setRoute(plan);
  setTimeout(() => { const n = document.querySelector('.itinerary li.next'); if (n) n.scrollIntoView({ block: 'nearest' }); }, 60);
}
// ------------------------------------------------------------------ a stop: departures, arrivals, timetable
let lastLine = null; // the line of the last vehicle opened — preselected at its stops
function showStopByNum(num, line) {
  const s = layers.mhd.stops()[num];
  if (!s) return;
  const [X, Y] = layers.llToImg(s[1], s[2]);
  flyTo(X, Y, Math.max(view().z, 1.1));
  showStop({ num: String(num), name: s[0], X, Y }, line);
}
function showStop(st, line = null) {
  const mhd = layers.mhd;
  // opened from the sign of one direction (st.posts, the posts under that sign): its departures only, with a switch to all
  const myPosts = st.posts && st.posts.length ? st.posts : null;
  // the departures need the timetable: the card opens at once and fills in when it has come
  showStop.cur = st;
  if (!mhd.ready()) mhd.load().then(() => { if (showStop.cur === st && !$('card').hidden) showStop(st, line); });
  const days = mhd.dayChoices();
  const ui = { tab: 'dep', line: null, day: 'today', trip: null, dir: !!myPosts }; // trip: the departure whose route is shown on the map; dir: only this sign's direction
  const mine = c => !ui.dir || !myPosts || !c.post || myPosts.includes(c.post);
  const allToday = mhd.calls(st.num, days.today);
  const lines = [...new Set(mhd.calls(st.num, days.work).concat(allToday).map(c => c.line))].sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 999) - (parseInt(b.replace(/\D/g, '')) || 999) || a.localeCompare(b));
  if (line && lines.includes(line)) ui.line = line;
  const typeOfLine = l => { const c = allToday.find(x => x.line === l); return c ? c.type : 'bus'; };
  const hhmm = sec => { const s = ((sec % 86400) + 86400) % 86400; return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`; };
  const badge = l => { const b = el('span', `lbadge t-${typeOfLine(l)}`, l); return b; };
  const box = el('div', 'sec stopbox');
  const tripVehicle = c => {
    for (const m of layers.lineVehicles(c.line)) {
      if (!m.live) { if (m.id === c.trip) return m; continue; }
      const pv = layers.matchPlan(m);
      if (pv && pv.id === c.trip) return m;
    }
    return null;
  };
  const lineOnMap = () => {
    ui.onMap = true;
    let day = ui.tab === 'tt' ? days[ui.day] : days.today, ways = ui.line ? mhd.lineWays(ui.line, day, +st.num) : [];
    if (ui.line && !ways.length) ways = mhd.lineWays(ui.line, (day = days.work), +st.num);
    layers.setLineRoute(ways, day);
  };
  const render = () => {
    box.replaceChildren();
    // tabs
    const tabs = el('div', 'tabs');
    for (const [k, label] of [['dep', 'Odjezdy'], ['arr', 'Příjezdy'], ['tt', 'Jízdní řád']]) {
      const b = el('button', 'pbtn small', label); b.type = 'button'; b.setAttribute('aria-pressed', String(ui.tab === k));
      b.onclick = () => { ui.tab = k; if (ui.onMap) lineOnMap(); render(); };
      tabs.append(b);
    }
    box.append(tabs);
    // direction filter: only when the card came from the sign of one direction
    if (myPosts) {
      const df = el('div', 'linefilter');
      const one = el('button', 'pbtn small', `Směr ${(st.next || []).slice(0, 2).join(' / ') || 'z tohoto nástupiště'}${(st.next || []).length > 2 ? ' …' : ''}`); one.type = 'button'; one.setAttribute('aria-pressed', String(ui.dir));
      one.onclick = () => { ui.dir = true; render(); };
      const both = el('button', 'pbtn small', 'Všechny směry'); both.type = 'button'; both.setAttribute('aria-pressed', String(!ui.dir));
      both.onclick = () => { ui.dir = false; render(); };
      df.append(one, both);
      box.append(df);
    }
    // line filter
    const lf = el('div', 'linefilter');
    const all = el('button', 'pbtn small', 'Všechny linky'); all.type = 'button'; all.setAttribute('aria-pressed', String(!ui.line));
    all.onclick = () => { ui.line = null; layers.setLineRoute(null); render(); };
    lf.append(all);
    for (const l of lines) {
      const b = el('button', `lbtn t-${typeOfLine(l)}`, l); b.type = 'button'; b.setAttribute('aria-pressed', String(ui.line === l));
      b.title = `Linka ${l}: její odjezdy a celá trasa v mapě`;
      b.onclick = () => { ui.line = ui.line === l ? null : l; if (ui.tab === 'tt' && !ui.line) ui.line = l; if (ui.line) { ui.trip = null; if (ui.veh) layers.selectVehicle(null); ui.veh = false; layers.setRoute(null); } lineOnMap(); render(); };
      lf.append(b);
    }
    box.append(lf);
    const delays = layers.liveDelays();
    const now = mhd.now().sec;
    if (ui.tab === 'dep' || ui.tab === 'arr') {
      // the next calls from now (today, and after midnight the early ones of tomorrow are not included)
      const arr = ui.tab === 'arr';
      const list = allToday.filter(c => (!ui.line || c.line === ui.line) && (arr ? !c.first : !c.last) && mine(c));
      const upcoming = list.filter(c => c.sec + (delays.get(c.trip) || 0) * 60 >= now - 60).slice(0, 25);
      const ol = el('ol', 'deps');
      if (!upcoming.length) ol.append(el('li', 'empty', 'Dnes už odsud nic nejede.'));
      for (const c of upcoming) {
        const d = delays.get(c.trip);
        const exp = c.sec + (d || 0) * 60;
        const li = el('li');
        const mins = Math.round((exp - now) / 60);
        li.append(el('span', 'tm', hhmm(c.sec)), badge(c.line), el('span', 'dir', `${arr ? '' : '→ '}${c.hs}`));
        const right = el('span', 'eta');
        if (d !== undefined) { right.append(el('span', `exp ${d > 0 ? 'late' : d < 0 ? 'early' : 'ok'}`, d ? `${hhmm(exp)} (${d > 0 ? '+' : ''}${d})` : 'včas')); }
        right.append(el('small', '', mins <= 0 ? 'teď' : `za ${mins} min`));
        li.append(right);
        // a click shows the route this departure takes (its stops with it), a second click hides it again
        li.classList.add('link'); li.classList.toggle('sel', ui.trip === c.trip); li.title = ui.trip === c.trip ? 'Skrýt vůz a trasu spoje' : 'Ukázat na mapě vůz a trasu tohoto spoje';
        li.onclick = () => {
          ui.trip = ui.trip === c.trip ? null : c.trip;
          if (ui.trip == null) { if (ui.veh) layers.selectVehicle(null); ui.veh = false; layers.setRoute(null); render(); return; }
          if (!state.layers.mhd) setLayer('mhd', true);
          const m = tripVehicle(c), on = !!m && Number.isFinite(m.X);
          layers.selectVehicle(on ? m.id : null); ui.veh = on; // (ui.veh: the card has marked a vehicle)
          layers.setRoute(mhd.tripRoute(ui.trip));
          if (on) fitFree(Math.min(m.X, st.X), Math.min(m.Y, st.Y), Math.max(m.X, st.X), Math.max(m.Y, st.Y), 2.5);
          else toast('Vůz tohoto spoje teď v mapě není, ukazuji jeho trasu');
          render();
        };
        ol.append(li);
      }
      box.append(ol);
      box.append(el('span', 'credit', 'Čas podle jízdního řádu; u vozidel, která právě jedou, je vedle skutečný očekávaný čas podle živé polohy (KORDIS JMK).'));
    } else {
      // the full timetable like the one on the stop pole: per direction, hours and minutes
      const dl = el('div', 'tabs');
      for (const k of ['today', 'work', 'sat', 'sun']) {
        const b = el('button', 'pbtn small', days[k].label); b.type = 'button'; b.setAttribute('aria-pressed', String(ui.day === k));
        b.onclick = () => { ui.day = k; if (ui.onMap) lineOnMap(); render(); };
        dl.append(b);
      }
      box.append(dl);
      if (!ui.line && lines.length) { ui.line = lines[0]; lineOnMap(); render(); return; } // (no lines: the timetable is not here yet)
      const calls = mhd.calls(st.num, days[ui.day]).filter(c => c.line === ui.line && !c.last && mine(c));
      const dirs = [...new Set(calls.map(c => c.hs))];
      if (!calls.length) box.append(el('p', '', 'V tento den linka ze zastávky nejede.'));
      for (const dir of dirs) {
        const t = el('div', 'tt');
        t.append(el('h4', '', `Linka ${ui.line} → ${dir}`));
        const byHour = new Map();
        for (const c of calls.filter(c => c.hs === dir)) { const h = Math.floor((c.sec % 86400) / 3600); if (!byHour.has(h)) byHour.set(h, []); byHour.get(h).push(String(Math.floor((c.sec % 3600) / 60)).padStart(2, '0')); }
        const tbl = el('div', 'ttgrid');
        for (const [h, mins] of [...byHour.entries()].sort((a, b) => ((a[0] + 21) % 24) - ((b[0] + 21) % 24))) {
          tbl.append(el('span', 'hh', String(h)), el('span', 'mm', mins.join('  ')));
        }
        t.append(tbl);
        box.append(t);
      }
      box.append(el('span', 'credit', 'Jízdní řád IDS JMK © KORDIS JMK.'));
    }
  };
  render();
  if (!mhd.ready()) box.prepend(el('p', '', 'Načítám jízdní řád…'));
  // closures and diversions (IDS JMK) near this stop that touch its lines
  const ll = (layers.mhd.stops()[st.num] || []);
  const outs = ll.length ? city.outagesNear(ll[1], ll[2], lines, 400) : [];
  // ... and those that change which lines call here today, wherever their point lies: the source gives one point for
  // a whole closure (the tram closure of Lidická and Křížová, 14.–17. 11. 2026, had it on Křížová, and the stops along
  // Lidická, where trams 1 and 6 did not come and bus x6 did, said nothing). The lines of the closure that call here
  // on the same day of the week after it ends but not today, and the other way round.
  const changed = new Map();
  if (mhd.ready()) {
    // (a line "calls here" on a day with at least 8 calls: a few runs to or from the depot do not make a line of the stop)
    const served = calls => { const n = new Map(); for (const c of calls) n.set(c.line, (n.get(c.line) || 0) + 1); return new Set([...n].filter(([, k]) => k >= 8).map(([l]) => l)); };
    const today = served(allToday);
    for (const o of city.outagesNow()) {
      if (o.type === 'D' || o.type === 'Z' || !o.to) continue; // (D: a notice about the whole network, Z: one moved stop, marked at its place)
      const t = new Date(o.to + 12 * 3600e3);
      for (let k = 0; k < 7 && (t.getUTCDay() + 6) % 7 !== days.today.wd; k++) t.setUTCDate(t.getUTCDate() + 1);
      const then = mhd.calls(st.num, { date: t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate(), wd: days.today.wd });
      if (!then.length) continue; // (the timetable does not reach that far)
      const usual = served(then);
      const gone = o.lines.filter(l => usual.has(l) && !today.has(l)), extra = o.lines.filter(l => today.has(l) && !usual.has(l));
      if (gone.length || extra.length) changed.set(o, { gone, extra });
    }
  }
  const wrap = el('div');
  const few = l => (l.length > 8 ? `${l.slice(0, 8).join(', ')} a další` : l.join(', '));
  for (const o of new Set([...changed.keys(), ...outs])) {
    const c = changed.get(o);
    const what = c ? [c.gone.length ? `dnes tu nestaví ${few(c.gone)}` : '', c.extra.length ? `navíc tu staví ${few(c.extra)}` : ''].filter(Boolean).join(', ') : `linky ${few(o.lines)}`;
    const n = el('button', 'outage-note', `⚠ ${o.type === 'Z' ? 'Přesunutá zastávka' : o.type === 'D' ? 'Změna provozu' : 'Výluka'}: ${o.title} (${what})`); n.type = 'button'; n.onclick = () => showOutage(o); wrap.append(n);
  }
  if (st.tmp) { const n = el('div', 'outage-note', 'Dočasný sloupek: spoje tu staví jen několik dní, při výluce nebo objížďce.'); n.style.cursor = 'default'; wrap.append(n); }
  // Spojení: a journey from or to this stop, and in the same row what Moje adds (a connection from this stop to keep at
  // hand, and those kept already)
  if (spojeni) wrap.append(spojeni.stopEntry(st, moje ? moje.spojEntry(st) : null));
  else if (moje) wrap.append(moje.spojEntry(st));
  wrap.append(box);
  card({ kind: 'zastavka', title: `Zastávka ${st.name}`, rows: [['Linky', lines.join(', ')]], extra: wrap, part: `z=${st.num}`, fav: { s: +st.num, n: st.name } });
  fx.marker(st.X, st.Y);
  layers.selectStop(st.num, myPosts);
  // keep the departures fresh while the card is open
  clearInterval(showStop.timer);
  showStop.timer = setInterval(() => { if ($('card').hidden || !box.isConnected) { clearInterval(showStop.timer); return; } if (ui.tab !== 'tt') render(); }, 30000);
  // What the card put on the map (the lit sign, the route of a picked departure) goes with the card: at once, when
  // another card takes its place (card()) or it is closed. It used to be taken off by the timer above when it next
  // found the card gone, up to 30 s late, and by then the route on the map was that of a vehicle opened in the
  // meantime: its route vanished under its open card.
  showStop.off = () => { showStop.off = null; clearInterval(showStop.timer); layers.selectStop(null); if (ui.trip != null) { if (ui.veh) layers.selectVehicle(null); layers.setRoute(null); } };
}

// ------------------------------------------------------------------ air quality station card
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
// a small line chart: points [[ms, value]], the "worse air" limit of the pollutant as a dashed line
function airChart(points, p, labelFmt) {
  const Wc = 300, Hc = 120, L = 30, B = 18, T = 8;
  const svg = svgEl('svg', { viewBox: `0 0 ${Wc} ${Hc}`, class: 'airchart', role: 'img' });
  const pts = points.filter(q => q[1] != null);
  if (pts.length < 2) { const t = svgEl('text', { x: Wc / 2, y: Hc / 2, 'text-anchor': 'middle', class: 'ax' }); t.textContent = 'Data nejsou k dispozici'; svg.append(t); return svg; }
  const t0 = points[0][0], t1 = points[points.length - 1][0];
  const lim = POLL[p].th[1]; // above this the air is "zhoršená"
  const max = Math.max(lim * 1.15, ...pts.map(q => q[1])) * 1.05;
  const X = t => L + ((t - t0) / (t1 - t0 || 1)) * (Wc - L - 4), Y = v => T + (1 - v / max) * (Hc - T - B);
  // coloured level bands in the background
  const th = [0, ...POLL[p].th, Infinity];
  for (let b = 1; b <= 6; b++) {
    const lo = th[b - 1], hi = Math.min(th[b], max);
    if (lo >= max) break;
    svg.append(svgEl('rect', { x: L, y: Y(hi), width: Wc - L - 4, height: Y(lo) - Y(hi), fill: LEVEL[b].c, opacity: 0.18 }));
  }
  svg.append(svgEl('line', { x1: L, x2: Wc - 4, y1: Y(lim), y2: Y(lim), class: 'lim' }));
  // line with gaps where data are missing
  let d = '', pen = false;
  for (const [t, v] of points) { if (v == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${X(t).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; }
  svg.append(svgEl('path', { d, class: 'ln' }));
  const tx = (x, y, s, a = 'start') => { const e = svgEl('text', { x, y, 'text-anchor': a, class: 'ax' }); e.textContent = s; svg.append(e); };
  tx(L - 3, Y(0) + 3, '0', 'end'); tx(L - 3, Y(lim) + 3, String(lim), 'end');
  tx(L, Hc - 4, labelFmt(t0)); tx(Wc - 4, Hc - 4, labelFmt(t1), 'end');
  return svg;
}
// temperature of a private weather station over the last 24 hours: the line, a dashed 0 °C line and a blue band
// below it, so a night under zero is seen at a glance
function tempChart(points) {
  const Wc = 300, Hc = 120, L = 40, B = 18, T = 8;
  const svg = svgEl('svg', { viewBox: `0 0 ${Wc} ${Hc}`, class: 'airchart tempchart', role: 'img' });
  const vals = points.filter(q => q[1] != null).map(q => q[1]);
  if (vals.length < 2) { const t = svgEl('text', { x: Wc / 2, y: Hc / 2, 'text-anchor': 'middle', class: 'ax' }); t.textContent = 'Průběh teploty se teprve sbírá'; svg.append(t); return svg; }
  const t0 = points[0][0], t1 = points[points.length - 1][0];
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const pad = Math.max(1, (Math.max(0, mx) - Math.min(0, mn)) * 0.12);
  const lo = Math.min(0, mn) - pad, hi = Math.max(0, mx) + pad; // 0 °C is always in the picture
  const X = t => L + ((t - t0) / (t1 - t0 || 1)) * (Wc - L - 6), Y = v => T + ((hi - v) / (hi - lo)) * (Hc - T - B);
  svg.append(svgEl('rect', { x: L, y: Y(0).toFixed(1), width: Wc - L - 6, height: (Y(lo) - Y(0)).toFixed(1), class: 'frost' }));
  svg.append(svgEl('line', { x1: L, x2: Wc - 6, y1: Y(0).toFixed(1), y2: Y(0).toFixed(1), class: 'zero' }));
  // line with gaps where an hour is missing, a dot per hour (blue below zero)
  let d = '', pen = false;
  for (const [t, v] of points) { if (v == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${X(t).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; }
  svg.append(svgEl('path', { d, class: 'ln' }));
  for (const [t, v] of points) if (v != null) svg.append(svgEl('rect', { x: (X(t) - 1.5).toFixed(1), y: (Y(v) - 1.5).toFixed(1), width: 3, height: 3, class: v < 0 ? 'pt cold' : 'pt' }));
  const tx = (x, y, s, a = 'start') => { const e = svgEl('text', { x, y, 'text-anchor': a, class: 'ax' }); e.textContent = s; svg.append(e); };
  const deg = v => `${v.toFixed(1).replace('.', ',').replace('-', '−')} °`;
  tx(L - 3, Y(0) + 3, '0 °C', 'end');
  if (Math.abs(Y(mx) - Y(0)) > 9) tx(L - 3, Y(mx) + 3, deg(mx), 'end');
  if (Math.abs(Y(mn) - Y(0)) > 9 && Math.abs(Y(mn) - Y(mx)) > 9) tx(L - 3, Y(mn) + 3, deg(mn), 'end');
  // the hours along the bottom: every 6 hours of local time
  for (const [t] of points) { const h = new Date(t).getHours(); if (h % 6 === 0) { svg.append(svgEl('line', { x1: X(t).toFixed(1), x2: X(t).toFixed(1), y1: Hc - B, y2: Hc - B + 3, class: 'tick' })); tx(X(t).toFixed(1), Hc - 4, `${h}:00`, 'middle'); } }
  return svg;
}
// how full a car park was over the last day or two (src/parking.js series): the share of taken spaces as a filled
// area, its line coloured like the gauge of the sign (green, amber over 70 %, red over 90 %), the 70 % and 90 % lines
// dashed, midnight as a dotted line with the day under it
function parkingChart(points, hours) {
  const Wc = 300, Hc = 120, L = 34, B = 18, T = 8, R = 6;
  const svg = svgEl('svg', { viewBox: `0 0 ${Wc} ${Hc}`, class: 'airchart parkchart', role: 'img' });
  const known = points.filter(q => q[1] != null);
  if (known.length < 2) { const t = svgEl('text', { x: Wc / 2, y: Hc / 2, 'text-anchor': 'middle', class: 'ax' }); t.textContent = 'Průběh se teprve sbírá'; svg.append(t); return svg; }
  svg.setAttribute('aria-label', `Obsazenost za posledních ${hours} hodin`);
  const t1 = Date.now(), t0 = t1 - hours * 3600e3;
  const X = t => L + ((t - t0) / (t1 - t0)) * (Wc - L - R), Y = v => T + (1 - v) * (Hc - T - B);
  for (const [v, cls] of [[0.7, 'warn'], [0.9, 'full']]) svg.append(svgEl('line', { x1: L, x2: Wc - R, y1: Y(v).toFixed(1), y2: Y(v).toFixed(1), class: `lim ${cls}` }));
  svg.append(svgEl('line', { x1: L, x2: Wc - R, y1: Y(0), y2: Y(0), class: 'tick' }));
  // the runs of known values (a gap of more than 20 minutes breaks the line): an area under each, then the line in
  // pieces coloured by the level
  const runs = []; let cur = [];
  for (const q of points) { if (q[0] < t0) continue; if (q[1] == null) { if (cur.length && q[0] - cur[cur.length - 1][0] > 20 * 60e3) { runs.push(cur); cur = []; } continue; } cur.push(q); }
  if (cur.length) runs.push(cur);
  for (const r of runs) {
    if (r.length < 2) continue;
    let a = `M${X(r[0][0]).toFixed(1)},${Y(0)}`; for (const [t, v] of r) a += `L${X(t).toFixed(1)},${Y(v).toFixed(1)}`; a += `L${X(r[r.length - 1][0]).toFixed(1)},${Y(0)}Z`;
    svg.append(svgEl('path', { d: a, class: 'area' }));
    for (let i = 1; i < r.length; i++) { const v = Math.max(r[i - 1][1], r[i][1]); svg.append(svgEl('line', { x1: X(r[i - 1][0]).toFixed(1), y1: Y(r[i - 1][1]).toFixed(1), x2: X(r[i][0]).toFixed(1), y2: Y(r[i][1]).toFixed(1), stroke: fullCol(v, v >= 1 ? 0 : 1), class: 'seg' })); }
  }
  const tx = (x, y, s, a = 'start', cls = 'ax') => { const e = svgEl('text', { x, y, 'text-anchor': a, class: cls }); e.textContent = s; svg.append(e); };
  tx(L - 3, Y(1) + 3, '100 %', 'end'); tx(L - 3, Y(0.5) + 3, '50 %', 'end'); tx(L - 3, Y(0) + 3, '0 %', 'end');
  // the hours along the bottom (every 6 hours for a day, 12 for two), midnight dotted with the name of the day
  const every = hours > 30 ? 12 : 6, first = Math.ceil(t0 / 3600e3) * 3600e3;
  for (let t = first; t <= t1; t += 3600e3) {
    const d = new Date(t), h = d.getHours(); if (h % every) continue;
    const x = X(t).toFixed(1);
    if (h === 0) { svg.append(svgEl('line', { x1: x, x2: x, y1: T, y2: Hc - B, class: 'midnight' })); tx(+x + 3, T + 8, d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }), 'start', 'ax day'); }
    svg.append(svgEl('line', { x1: x, x2: x, y1: Hc - B, y2: Hc - B + 3, class: 'tick' })); tx(x, Hc - 4, `${h}:00`, 'middle');
  }
  return svg;
}
async function showAir(s) {
  await air.load();
  const st = air.state(s);
  const lv = air.live(s.c);
  const comps = Object.keys(POLL).filter(p => s.comps.includes(p) || (st && st.vals[p] != null) || (lv && lv.series[p]));
  const time = st ? new Date(st.t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const sec = el('div', 'sec air');
  sec.append(el('h3', '', st && st.live ? 'Aktuální hodnoty (hodinový průměr)' : 'Poslední známé hodnoty'));
  if (st) {
    const tb = el('table', 'airvals');
    for (const p of comps) {
      const v = st.vals[p];
      if (v == null) continue;
      const b = bandOf(p, v);
      const tr = el('tr');
      const lvl = el('td'); const chip = el('span', 'lvl', b ? LEVEL[b].n : '–'); if (b) { chip.style.background = LEVEL[b].c; if (b >= 5) chip.style.color = '#fff'; } lvl.append(chip);
      tr.append(el('td', '', `${POLL[p].n}`), el('td', 'num', `${Math.round(v * 10) / 10} µg/m³`), lvl);
      tr.title = POLL[p].long;
      tb.append(tr);
    }
    sec.append(tb);
    // what to do now, and what the measured substances are
    if (st.band) { const adv = el('p', 'air-advice'); adv.style.borderColor = LEVEL[st.band].c; adv.append(el('b', '', 'Co dělat: '), ADVICE[st.band]); sec.append(adv); }
    const ex = el('details', 'air-explain'); ex.append(el('summary', '', 'Co znamenají zkratky (PM10, NO₂…)'));
    for (const p of comps) if (POLL[p].what) { const d = el('p'); d.append(el('b', '', `${POLL[p].n} – ${POLL[p].long}: `), POLL[p].what); ex.append(d); }
    ex.append(el('p', 'livenote', 'Hodnoty jsou v mikrogramech na metr krychlový (µg/m³), hodinové průměry. Úrovně podle evropského indexu kvality ovzduší (EEA). Při smogové situaci vydává upozornění ČHMÚ.'));
    sec.append(ex);
    sec.append(el('p', 'livenote', `Měřeno ${time}${st.live ? '' : ' (živá data teď nejsou k dispozici, ukazuji poslední hodnoty z otevřených dat ČHMÚ)'}.`));
  } else sec.append(el('p', '', s.live ? 'Aktuální hodnoty teď nejsou k dispozici (stanice posílá data jen občas nebo má výpadek).' : 'Tato stanice měří, ale její hodnoty nejsou volně dostupné v otevřených datech ČHMÚ ani u Evropské agentury pro životní prostředí. Proto je její světlo šedé.'));
  // charts: last week (hourly) and since the start of the year (daily means)
  const charts = el('div', 'sec air');
  charts.append(el('h3', '', 'Grafy'));
  const chips = el('div', 'row2');
  const box = el('div');
  let cur = (st && st.culprit && comps.includes(st.culprit)) ? st.culprit : comps[0];
  const fmtD = t => new Date(t).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
  function render() {
    chips.replaceChildren(...comps.map(p => { const b = el('button', 'pbtn', POLL[p].n); b.type = 'button'; b.setAttribute('aria-pressed', String(p === cur)); b.title = POLL[p].long; b.onclick = () => { cur = p; render(); }; return b; }));
    box.replaceChildren();
    // week: live series from the EEA (13 days, last 7 shown) or the prepared ČHMÚ hours
    const weekAgo = Date.now() - 7 * 864e5;
    let wk = lv && lv.series[cur] ? lv.series[cur].filter(q => q[0] >= weekAgo) : [];
    if (wk.length < 24 && s.hour && s.hour.v[cur]) { const h0 = Date.parse(s.hour.start + ':00:00Z'); wk = s.hour.v[cur].map((v, i) => [h0 + i * 36e5, v]).filter(q => q[0] >= weekAgo); }
    // fill missing hours so gaps show as gaps
    if (wk.length) { const m = new Map(wk.map(q => [q[0], q[1]])); const out = []; for (let t = wk[0][0]; t <= wk[wk.length - 1][0]; t += 36e5) out.push([t, m.has(t) ? m.get(t) : null]); wk = out; }
    box.append(el('p', 'label', `Poslední týden · ${POLL[cur].long} (hodinové hodnoty, µg/m³)`), airChart(wk, cur, fmtD));
    if (s.day && s.day.v[cur]) {
      const d0 = Date.parse(s.day.start + 'T00:00:00Z');
      const yr = s.day.v[cur].map((v, i) => [d0 + i * 864e5, v]);
      box.append(el('p', 'label', `Od ${new Date(d0).toLocaleDateString('cs-CZ')} · denní průměry (µg/m³)`), airChart(yr, cur, t => new Date(t).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: '2-digit' })));
    } else box.append(el('p', 'livenote', 'Delší historie této stanice v otevřených datech ČHMÚ není.'));
    box.append(el('p', 'livenote', 'Barevné pásy: úrovně evropského indexu kvality ovzduší (EEA). Čárkovaná čára: od této hodnoty je ovzduší zhoršené.'));
  }
  if (comps.length) { render(); charts.append(chips, box); }
  const wrap = el('div'); wrap.append(sec, charts);
  const src = el('div', 'sec');
  src.append(el('p', 'credit', `Zdroj: ČHMÚ (měření), živá data přes Evropskou agenturu pro životní prostředí (EEA); historie: otevřená data ČHMÚ, staženo ${air.updated()}.`));
  wrap.append(src);
  card({ kind: 'ovzdusi',
    title: `${s.n} · kvalita ovzduší`,
    text: st && st.band ? `Ovzduší je teď ${LEVEL[st.band].n}${st.band >= 3 ? ` – nejhorší je ${POLL[st.culprit].long}` : ''}.` : '',
    rows: [['Stanice', s.kind ? `${s.kind}` : ''], ['Síť', s.net], ['Měří', s.comps.map(p => POLL[p] ? POLL[p].n : p).join(', ')]],
    lon: s.lon, lat: s.lat, extra: wrap, action: focusButton('air', imgOf(s.lon, s.lat)),
    buttons: [
      { href: 'https://opendata.chmi.cz/air_quality/', label: 'Otevřená data ČHMÚ' },
      { href: 'https://airindex.eea.europa.eu/AQI/index.html', label: 'Evropský index kvality ovzduší' },
    ],
  });
  air.select(s); // after card(), which clears the previous selection
}
// webcam: a preview in the card (picture refreshed while the card is open, or an embedded player)
function showCam(g) {
  // several cameras on one spot: chips to switch between their views
  const views = g.views || [g];
  const wrap = el('div');
  const chips = el('div', 'row2');
  const body = el('div');
  const dirBox = el('div', 'sec camdir');
  let cur = 0;
  const pick = i => {
    cur = i;
    chips.replaceChildren(...views.map((v, j) => { const b = el('button', 'pbtn', views.length > 4 ? String(j + 1) : v.view.replace(/^.*?(pohled|směr)/, '$1')); b.type = 'button'; b.title = v.view; b.setAttribute('aria-pressed', String(j === cur)); b.onclick = () => pick(j); return b; }));
    body.replaceChildren(camView({ ...views[i], name: g.name }));
    cams.select(g, i);
    renderDir();
  };
  // which way the camera looks: shown as a cone in the map, can be corrected here
  const COMPASS = ['sever', 'severovýchod', 'východ', 'jihovýchod', 'jih', 'jihozápad', 'západ', 'severozápad'];
  function renderDir() {
    const v = views[cur];
    const d = cams.dirOf(v);
    dirBox.replaceChildren(el('h3', '', 'Kam se kamera dívá'));
    dirBox.append(el('p', '', `Na ${COMPASS[Math.round(d / 45) % 8]} (${Math.round(d)}°) – ${cams.dirSrcOf(v)}. Žlutá výseč v mapě ukazuje záběr.`));
    if (!ADMIN) return;
    // [ADMIN] tuning: move the camera, turn it, make the view wider / narrower, longer / shorter
    const adm = el('div', 'admin-box');
    adm.append(el('p', 'livenote', `Záběr ${Math.round(cams.fovOf(v))}° široký, ${Math.round(cams.reachOf(g, v))} m daleko.`));
    const btns = el('div', 'btns');
    const done = (msg) => { renderDir(); updateCorrCount(); if (msg) toast(msg); };
    const mk = (label, fn, title) => { const b = el('button', 'pbtn small', label); b.type = 'button'; if (title) b.title = title; b.onclick = fn; btns.append(b); return b; };
    const pickMap = (hint, fn) => { placing = { pick: (lon, lat) => fn(lon, lat) }; toast(hint); viewer.canvas.style.cursor = 'crosshair'; };
    mk('Přesunout kameru', () => pickMap('Klikněte do mapy na místo, kde kamera skutečně je.', (lon, lat) => { cams.setFix(v, { lon, lat }); done('Poloha kamery je uložená v tomto prohlížeči.'); }), 'Další klik do mapy určí, kde kamera stojí');
    mk('Kam se dívá (klik)', () => pickMap('Klikněte do mapy na místo, na které se kamera dívá. Výseč tam natočí i protáhne.', (lon, lat) => { const [dir, dist] = cams.dirTo(g, v, lon, lat); cams.setFix(v, { dir, reach: dist }); done('Směr a délka záběru jsou uložené v tomto prohlížeči.'); }), 'Další klik do mapy určí směr i délku záběru');
    mk('⟲ 15°', () => { cams.setFix(v, { dir: d - 15 }); done(); }, 'Otočit doleva');
    mk('⟳ 15°', () => { cams.setFix(v, { dir: d + 15 }); done(); }, 'Otočit doprava');
    mk('Užší', () => { cams.setFix(v, { fov: cams.fovOf(v) - 10 }); done(); }, 'Zúžit záběr o 10°');
    mk('Širší', () => { cams.setFix(v, { fov: cams.fovOf(v) + 10 }); done(); }, 'Rozšířit záběr o 10°');
    mk('Kratší', () => { cams.setFix(v, { reach: cams.reachOf(g, v) * 0.75 }); done(); }, 'Zkrátit záběr');
    mk('Delší', () => { cams.setFix(v, { reach: cams.reachOf(g, v) * 1.33 }); done(); }, 'Prodloužit záběr');
    if (cams.own()[v.id] !== undefined) mk('Vrátit původní', () => { cams.setFix(v, null); done(); });
    adm.append(btns);
    dirBox.append(adm);
  }
  if (views.length > 1) wrap.append(chips);
  wrap.append(body, dirBox);
  card({ kind: 'kamera',
    title: g.name,
    rows: [['Provozovatel', g.source], ['Kamer na místě', views.length > 1 ? String(views.length) : '']],
    lon: g.lon, lat: g.lat, extra: wrap,
    buttons: g.page ? [{ href: g.page, label: 'Stránka kamery' }] : [],
    action: focusButton('cams', imgOf(...cams.posOf(g, views[0]))),
  });
  pick(0); // after the card opened (opening a card clears the previous selection)
}
function camView(c) {
  const sec = el('div', 'sec cam');
  sec.append(el('h3', '', c.view || 'Náhled kamery'));
  clearInterval(showCam.timer);
  if (c.kind === 'image') {
    const im = el('img'); im.alt = c.name; im.referrerPolicy = 'no-referrer'; im.className = 'campic';
    zoomable(im, 'snímek kamery');
    const stamp = el('p', 'livenote', 'Načítám…');
    const every = Math.max(10, c.refresh_s || 60) * 1000;
    let direct = !camImg(c.url);
    const reload = () => {
      if (!direct) { im.src = camImg(c.url, Math.floor(Date.now() / every)); return; }
      const u = new URL(c.url); u.searchParams.set('_', Date.now()); im.src = u.href;
    };
    im.onload = () => { stamp.textContent = `Obrázek načten ${new Date().toLocaleTimeString('cs-CZ')}${c.refresh_s ? `, obnovuje se každých ${Math.max(10, c.refresh_s)} s` : ''}.`; };
    im.onerror = () => { if (!direct) { direct = true; reload(); return; } stamp.textContent = 'Kamera teď obrázek neposílá. Zkuste stránku kamery.'; };
    reload();
    showCam.timer = setInterval(() => { if ($('card').hidden || !im.isConnected) { clearInterval(showCam.timer); return; } reload(); }, Math.max(10, c.refresh_s || 60) * 1000);
    sec.append(im, stamp);
  } else if (c.kind === 'iframe') {
    // (YouTube players need to know which page they are on, so the referrer is kept here)
    sec.append(frameGate({ src: c.url, title: c.name, cls: 'camframe', allow: 'autoplay; fullscreen; encrypted-media', referrer: 'strict-origin-when-cross-origin', label: 'Spustit přenos' }));
  } else sec.append(el('p', '', 'Tato kamera se dá sledovat jen na své vlastní stránce, otevřete ji tlačítkem „Stránka kamery“.'));
  return sec;
}
function frameGate({ src, title, cls, allow = '', referrer = 'no-referrer', label }) {
  let u = src, host = '';
  try { const x = new URL(src); host = x.hostname.replace(/^www\./, ''); if (/(^|\.)youtube\.com$/.test(x.hostname) && x.pathname.startsWith('/embed/')) { x.hostname = 'www.youtube-nocookie.com'; u = x.href; host = 'YouTube'; } } catch { /* as it is */ }
  const box = el('div', `${cls} framegate`);
  const b = el('button', 'framego', `▶ ${label}`); b.type = 'button';
  box.append(b, el('p', 'framenote', `Načte se ze stránky ${host || 'provozovatele'}.`));
  b.onclick = () => {
    const f = el('iframe'); f.src = safeFrame(u); f.className = cls; f.title = title; if (allow) f.allow = allow; f.referrerPolicy = referrer;
    box.replaceWith(f);
  };
  return box;
}
function showMeteo(s) {
  const v = meteo.values(s);
  const sec = el('div', 'sec cam');
  const fmt = (x, u, d = 1) => (x == null || !Number.isFinite(x) ? '' : `${x.toFixed(d).replace('.', ',')} ${u}`);
  const DIRS = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
  sec.append(el('h3', '', s.sc ? 'Aktuální hodnoty' : 'Poslední hodnoty (stahované jednou za hodinu)'));
  if (v) sec.append(rowsDl([['Teplota', fmt(v.t, '°C')], ['Vlhkost', fmt(v.h, '%', 0)], ['Tlak (na hladinu moře)', fmt(v.p, 'hPa', 1)], ['Vítr', v.w != null ? `${fmt(v.w, 'm/s')}${v.w > 0 ? ' od ' + DIRS[Math.round(v.wd / 45) % 8] : ''}` : ''], ['Srážky dnes', fmt(v.r, 'mm')], ['Změřeno', v.at ? new Date(v.at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '']]));
  else sec.append(el('p', '', 'Stanice teď hodnoty neposílá.'));
  // the temperature of the last 24 hours (data/meteo-history.json: one value an hour, collected by the feed)
  const hb = el('div');
  hb.append(el('p', 'label', 'Teplota za posledních 24 hodin'), el('p', 'livenote', 'Načítám…'));
  sec.append(hb);
  meteo.series(s, 24).then(pts => {
    const vals = pts.filter(q => q[1] != null);
    hb.replaceChildren(el('p', 'label', 'Teplota za posledních 24 hodin'));
    if (vals.length < 2) { hb.append(el('p', 'livenote', 'Průběh teploty se teprve sbírá: hodnoty se ukládají jednou za hodinu.')); return; }
    hb.append(tempChart(pts));
    const mn = vals.reduce((a, q) => (q[1] < a[1] ? q : a)), mx = vals.reduce((a, q) => (q[1] > a[1] ? q : a));
    const hm = t => new Date(t).toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit' });
    const cold = vals.filter(q => q[1] < 0).length;
    hb.append(el('p', 'livenote', `Nejméně ${fmt(mn[1], '°C')} (${hm(mn[0])}), nejvíce ${fmt(mx[1], '°C')} (${hm(mx[0])}). ${cold ? `Pod nulou ${cold} z ${vals.length} hodin.` : 'Pod nulu teplota neklesla.'} Hodinové hodnoty do ${hm(pts[pts.length - 1][0])}; čárkovaná čára a modrý pás: 0 °C a mráz.`));
  });
  if (s.embed) {
    sec.append(el('p', 'label', 'Stránka stanice (živé hodnoty a grafy)'));
    sec.append(frameGate({ src: s.embed, title: s.name, cls: 'camframe meteoframe', referrer: 'no-referrer', label: 'Zobrazit stránku stanice' }));
  }
  sec.append(el('p', 'credit', `Soukromá meteostanice, údaje bez záruky. Zdroj: ${s.src}${s.src === 'Sensor.Community' ? ' (otevřená data, ODbL)' : ''}.`));
  card({ kind: 'meteo', title: `${s.name} · meteostanice`, rows: [['Síť', s.src]], lon: s.lat ? s.lon : undefined, lat: s.lat, extra: sec, action: s.lat ? focusButton('meteo', imgOf(s.lon, s.lat)) : null, buttons: [{ href: s.page, label: s.src === 'Sensor.Community' ? 'Na mapě Sensor.Community' : 'Stránka stanice' }] });
}
// an enclosure in the zoo: who lives there, and the zoo's pages
function showZooPen(pen) {
  const sec = el('div', 'sec');
  sec.append(el('h3', '', 'Kdo tu bydlí'));
  sec.append(rowsDl(pen.animals.map(a => [a.name, `${a.n} na mapě`])));
  sec.append(el('p', 'livenote', 'Zvířata na mapě se přes den procházejí a pasou, v noci polehávají a jen občas se projdou. Výběhy a cesty jsou podle OpenStreetMap a mapy zoo; kolik zvířat tu je doopravdy, řekne zoo.'));
  sec.append(el('p', 'credit', `Zdroj: přispěvatelé OpenStreetMap (ODbL), stav k ${czDay(zoo.updated())}.`));
  const wp = pen.animals[0].wp;
  if (pen.X != null) fx.marker(pen.X, pen.Y);
  card({ kind: 'zoo', title: `${pen.n} · Zoo Brno`, rows: [['Část zoo', pen.n]], extra: sec, buttons: [{ href: 'https://www.zoobrno.cz/', label: 'Web zoo' }, ...(wp ? [{ href: `https://cs.wikipedia.org/wiki/${encodeURIComponent(wp.replace(/ /g, '_'))}`, label: `${wp} na Wikipedii` }] : [])] });
}
// Velký městský okruh: one card for the whole line
// a planned tram line (data.brno.cz)
function showTramPlan() {
  const d = tramplan.data();
  const s = el('div', 'sec');
  s.append(el('p', '', 'Nová nebo prodloužená tramvajová trať, kterou město plánuje. Data neříkají, kdy se postaví; některé tratě jsou teprve ve studii.'));
  s.append(el('span', 'credit', `Zdroj: ${d ? d.source : 'data.brno.cz'} (stav k ${d ? d.updated.split('-').reverse().map(x => x.replace(/^0/, '')).join('. ') : '–'}). Celkem asi ${Math.round(tramplan.lengthKm())} km plánovaných tratí.`));
  card({ kind: 'tramtrat', title: 'Plánovaná tramvajová trať', text: 'Velký dopravní záměr', extra: s });
  tramplan.select(true);
}
function showVmo() {
  const d = vmo.data();
  const sec = el('div', 'sec');
  sec.append(el('h3', '', 'Stav úseků na mapě'));
  const ul = el('ul', 'vmolegend');
  const present = new Set((d ? d.sections : []).map(s => s.s));
  for (const [k, S] of Object.entries(VMO_STYLE)) {
    if (!present.has(k)) continue;
    const li = el('li');
    const sw = el('span', 'vmoswatch'); sw.style.borderTop = `${Math.max(3, S.w)}px ${S.dash.length ? (S.dash[0] <= 2 ? 'dotted' : 'dashed') : 'solid'} ${S.c}`;
    li.append(sw, el('span', '', S.label));
    ul.append(li);
  }
  sec.append(ul);
  sec.append(el('p', '', 'Okruh je postavený na západě a severu města: od Pisárek přes Žabovřeskou, Královopolský a Husovický tunel až k Tomkovu náměstí a Rokytově. Na východě a jihu zatím silnice I/42 vede provizorně městskými ulicemi; zbývající úseky (tunel Vinohrady, Černovice, Brno-jih, tunel Červený kopec) jsou v přípravě.'));
  if (d && d.note) sec.append(el('p', 'livenote', `Stav úseků: ${d.note} Trasa podle OpenStreetMap (${d.updated}).`));
  const parts = (layers.proj.list || []).filter(p => /^VMO\b|Velký městský okruh/.test(p.n));
  layers.selectVehicle(null);
  card({ kind: 'vmo',
    title: 'Velký městský okruh (VMO)',
    rows: [['Silnice', 'I/42'], ['Investor', 'Ředitelství silnic a dálnic ČR a statutární město Brno']],
    projects: [layers.proj.vmo, ...parts].filter(Boolean),
    extra: sec,
    buttons: [
      { href: 'https://cobude.brno.cz/projekt/velky-mestsky-okruh/', label: 'VMO na cobude.brno.cz' },
      { href: 'https://www.rsd.cz/mapova-aplikace', label: 'Stavby ŘSD (mapová aplikace)' },
      { href: 'https://www.mestsky-okruh-brno.cz/', label: 'mestsky-okruh-brno.cz' },
      { href: 'https://www.openstreetmap.org/search?query=Velk%C3%BD%20m%C4%9Bstsk%C3%BD%20okruh%20Brno', label: 'Na OpenStreetMap' },
    ],
  });
  vmo.select(true);
}
// ------------------------------------------------------------------ GO TO BRNO, monuments, events, closures, small things
// Cultural monuments, drawn without extra symbols: the roof of a listed building gets a thin gold outline
// (from about 3 m per pixel, when the buildings around are loaded); a monument that is not a building
// (statue, cross, fountain) is a small gold dot from 2 m per pixel. Only the MON_MAX nearest to the middle of
// the screen. Off by default — the building card always says whether the building is a monument.
const monBld = new Map(); // monument -> building entry (or false = none) once its chunk is loaded
function monumentBuilding(m) {
  if (monBld.has(m) && monBld.get(m) !== null) return monBld.get(m);
  const cx = Math.floor(m.X / CH), cy = Math.floor(m.Y / CH);
  const list = chunk(cx, cy);
  if (!list) { monBld.set(m, null); return null; }
  // the building the point is in, otherwise the nearest one within ~10 m (points often sit on the street in front)
  let found = false, bd = 10;
  const segDist = (p, x, y) => { let d = Infinity; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const ax = p[j], ay = p[j + 1], dx = p[i] - ax, dy = p[i + 1] - ay, L2 = dx * dx + dy * dy || 1; const f = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)); d = Math.min(d, Math.hypot(ax + dx * f - x, (ay + dy * f - y) * 2)); } return d; };
  for (const b of list) {
    const p = b[0];
    if (Math.abs(p[0] - m.X) > 300 || Math.abs(p[1] - m.Y) > 300) continue;
    const hp = b[1] || 0;
    if (inPoly(p, m.X, m.Y - hp)) { found = b; break; } // footprint = the roof outline moved down by the height
    const d = segDist(p, m.X, m.Y - hp);
    if (d < bd) { bd = d; found = b; }
  }
  monBld.set(m, found);
  return found;
}
// Is an image point hidden behind a building? A building covers the point when its roof outline (stored) or a
// wall below it is drawn over the point: the point lies inside the roof outline moved down by 0..height.
// a big building that surely covers a tram or a bus behind it: at least 6 m tall (twice the vehicle),
// a footprint of at least 60 m², not a shelter, garage, shed or greenhouse
const SMALL_KIND = /přístřeš|garáž|kůln|skleník|zastáv|kiosk|stánek|altán/i;
function bigBuilding(b) {
  if (b.big === undefined) {
    const p = b[0]; let a = 0;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
    const m2 = (Math.abs(a) / 2) * 2 / (GEO.A * GEO.A); // image px (Y is half a metre) -> m²
    b.big = (b[7] || 0) >= 6 && m2 >= 60 && !SMALL_KIND.test(b[4] || '');
  }
  return b.big;
}
// big = only big buildings hide the point (used for public transport)
// The buildings of a chunk by cells of OCC px (absolute image coordinates), each building in every cell its
// roof outline moved down by its height touches: the occlusion test looks at one cell instead of every building
// of nine chunks (hundreds of tests a frame: every car and vehicle on the screen)
const OCC = 64;
const occKey = (gx, gy) => (gx + 32768) * 65536 + (gy + 32768);
function occIndex(list) {
  if (list.occ) return list.occ;
  const idx = new Map();
  for (const b of list) {
    const p = b[0], hp = b[1] || 0;
    if (!b.bb) { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); } b.bb = [x0, x1, y0, y1]; }
    const gx0 = Math.floor(b.bb[0] / OCC), gx1 = Math.floor(b.bb[1] / OCC), gy0 = Math.floor(b.bb[2] / OCC), gy1 = Math.floor((b.bb[3] + hp) / OCC);
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) { const k = occKey(gx, gy); let a = idx.get(k); if (!a) idx.set(k, a = []); a.push(b); }
  }
  list.occ = idx;
  return idx;
}
// (The answer is kept per 2 × 2 px cell, under a number: a string key was built at every call, for every car, piece of a
// vehicle, person and animal. Two generations of 25 000 answers: when the newer fills up the older goes, so the cache
// never empties all at once, which made a frame of nothing but misses.) The value: the building, or false.
let occNew = new Map(), occOld = new Map();
const OCC_GEN = 25000;
function occluderAt(X, Y, big = false) {
  if (klidOn) return null; // (Klidná mapa: the houses are a fifth of their height, nothing hides behind them, nothing is drawn see-through)
  const gx = (X >> 1) + 32768, gy = (Y >> 1) + 32768;
  const key = gx >= 0 && gx < 65536 && gy >= 0 && gy < 65536 ? ((ROT * 2 + (big ? 1 : 0)) * 65536 + gx) * 65536 + gy : `${ROT}|${big ? 1 : 0}|${X >> 1}|${Y >> 1}`;
  let c = occNew.get(key);
  if (c === undefined) { c = occOld.get(key); if (c !== undefined) occNew.set(key, c); }
  if (c !== undefined) return c || null;
  const cx = Math.floor(X / CH), cy = Math.floor(Y / CH);
  let ready = true, hit = false;
  for (let dx = -1; dx <= 1 && !hit; dx++) for (let dy = -1; dy <= 1 && !hit; dy++) {
    const list = chunk(cx + dx, cy + dy);
    if (!list) { ready = false; continue; }
    const cell = occIndex(list).get(occKey(Math.floor(X / OCC), Math.floor(Y / OCC)));
    if (!cell) continue;
    for (const b of cell) {
      if (big && !bigBuilding(b)) continue;
      const p = b[0], hp = b[1] || 0;
      if (X < b.bb[0] || X > b.bb[1] || Y < b.bb[2] || Y > b.bb[3] + hp) continue;
      const step = Math.max(0.7, hp / 8);
      for (let d = 0; d <= hp + 0.01; d += step) if (inPoly(p, X, Y - d)) { hit = b; break; }
      if (hit) break;
    }
  }
  if (ready || hit) { occNew.set(key, hit); if (occNew.size > OCC_GEN) { occOld = occNew; occNew = new Map(); } }
  return hit || null;
}
const occludedAt = (X, Y, big = false) => !!occluderAt(X, Y, big);
layers.setOccluder((X, Y) => occluderAt(X, Y, true)); // trams, trolleybuses, buses: only behind big buildings (the building, or null)
fx.occluder = occludedAt; // the moving cars hide behind buildings too
// Only the MON_MAX monuments on the screen nearest to its middle (the last few fading out): all the outlines of
// the screen at once made the panning stutter (hundreds of roofs a frame in the centre). The choice follows the
// map, so moving it over a street shows its listed houses; zoomed in, the 50 cover the whole screen.
const MON_MAX = 50, MON_FADE = 10;
const monPick = []; // [distance², monument] of this frame (reused)
function drawMonuments(ctx, v) {
  if (v.z < 0.65) return;
  if (!city.data.monuments.length) { city.loadMonuments(); return; }
  city.positions();
  // the map on the screen in CSS px (the canvas itself is bigger: device pixels and the bleed around) and its middle
  const { cw: mw, ch: mh } = fx.size();
  const cx = mw / 2, cy = mh / 2;
  monPick.length = 0;
  for (const m of city.data.monuments) {
    const x = v.ox + m.X * v.k, y = v.oy + m.Y * v.k;
    if (x < 0 || y < 0 || x > mw || y > mh) continue;
    const dx = x - cx, dy = (y - cy) * 2; // (screen Y is foreshortened by half)
    monPick.push([dx * dx + dy * dy, m]);
  }
  monPick.sort((a, b) => a[0] - b[0]);
  ctx.save();
  const done = new Set(); // a building with several entries counts (and is drawn) once
  let n = 0;
  for (const [, m] of monPick) {
    if (n >= MON_MAX) break;
    const x = v.ox + m.X * v.k, y = v.oy + m.Y * v.k;
    ctx.globalAlpha = n < MON_MAX - MON_FADE ? 1 : (MON_MAX - n) / (MON_FADE + 1);
    const b = monumentBuilding(m);
    if (b) {
      if (done.has(b)) continue;
      done.add(b); n++;
      for (const q of piecesOf(b)) {
        const p = q[0]; // (the stored outline is already the roof)
        ctx.beginPath();
        for (let i = 0; i < p.length; i += 2) { const px = v.ox + p[i] * v.k, py = v.oy + p[i + 1] * v.k; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.closePath();
        // strong gold on a dark edge: clearly the marked monuments, unlike the thin pale line of the house under the pointer
        ctx.fillStyle = 'rgba(255,196,40,.2)'; ctx.fill();
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(22,29,43,.55)'; ctx.lineWidth = 3.6; ctx.stroke();
        ctx.strokeStyle = '#ffc428'; ctx.lineWidth = 2; ctx.stroke();
      }
    } else if (b === false && v.z >= 1) {
      n++;
      ctx.fillStyle = '#161d2b'; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
      ctx.fillStyle = '#ffc428'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    }
  }
  ctx.restore();
}
function gotobrnoSection(p) {
  const s = el('div', 'sec gotobrno');
  s.append(el('h3', '', 'GO TO BRNO'));
  say(s, 'GO TO BRNO', p.t, 'Text: www.gotobrno.cz (TIC BRNO), CC BY');
  if (p.t) { const txt = p.t.length > 900 ? `${p.t.slice(0, 900).replace(/\s+\S*$/, '')}…` : p.t; for (const para of txt.split('\n')) if (para) s.append(el('p', '', para)); }
  s.append(rowsDl([['Adresa', p.addr], ['Otevírací doba', readableHours(p.hours)], ['Vstupenky', p.tickets]]));
  const btns = el('div', 'btns');
  if (isUrl(p.url)) btns.append(srcBtn(p.url, 'Stránka místa na gotobrno.cz'));
  if (isUrl(p.img)) btns.append(srcBtn(p.img, 'Fotka na gotobrno.cz'));
  if (isUrl(p.web) && p.web !== p.url) btns.append(srcBtn(p.web, 'Web místa'));
  s.append(btns, el('span', 'credit', 'Zdroj: www.gotobrno.cz (TIC BRNO), otevřená data města Brna, CC BY.'));
  return s;
}
async function showPlace(p) {
  await city.detail();
  card({ kind: 'gotobrno', title: p.n, lon: p.lon, lat: p.lat, extra: gotobrnoSection(p), link: placeSlug(p.n) });
  fx.marker(p.X, p.Y);
}
const fmtDay = t => new Date(t).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
const fmtRange = (a, b) => (!b || fmtDay(a) === fmtDay(b) ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`);
async function showEvent(e) {
  await city.detail();
  const s = el('div', 'sec gotobrno');
  s.append(el('h3', '', 'Akce · GO TO BRNO'));
  if (e.t) s.append(el('p', '', e.t.length > 700 ? `${e.t.slice(0, 700).replace(/\s+\S*$/, '')}…` : e.t));
  const btns = el('div', 'btns');
  if (isUrl(e.url)) btns.append(srcBtn(e.url, 'Akce na gotobrno.cz'));
  if (isUrl(e.tickets)) btns.append(srcBtn(e.tickets, 'Vstupenky'));
  if (isUrl(e.img)) btns.append(srcBtn(e.img, 'Foto: GO TO BRNO'));
  s.append(btns, el('span', 'credit', 'Zdroj: www.gotobrno.cz (TIC BRNO), otevřená data města Brna, CC BY.'));
  // for reading (Číst): when and where first, then the whole description
  // said in full: "úterý 10. listopadu"; a range without the days of the week ("od 30. září do 22. prosince")
  const sayDay = (t, wd = true) => new Date(t).toLocaleDateString('cs-CZ', { ...(wd ? { weekday: 'long' } : {}), day: 'numeric', month: 'long' });
  // the address without the house's second number in front, the postcode and the country
  const sayAddr = (e.addr || '').replace(/^\d+\w?,\s*/, '').replace(/,\s*\d{3}\s?\d{2}\b.*$/, '').replace(/,\s*Česko\.?$/, '');
  say(s, 'Akce · GO TO BRNO', [`Kdy: ${!e.to || fmtDay(e.from) === fmtDay(e.to) ? sayDay(e.from) : `od ${sayDay(e.from, false)} do ${sayDay(e.to, false)}`}.`, sayAddr && `Kde: ${sayAddr}.`, e.t].filter(Boolean).join('\n'), 'Text: www.gotobrno.cz (TIC BRNO), CC BY');
  // the leaf on the map stands for every event at this place (today and this week): the others are listed here
  const wrap = el('div'); wrap.append(s);
  const here = city.eventsIn('week').filter(o => o !== e && o.lon != null && e.lon != null && Math.hypot((o.lon - e.lon) * 72765, (o.lat - e.lat) * 111200) < 15).sort((a, b) => a.from - b.from);
  if (here.length) {
    const h = el('div', 'sec gotobrno');
    h.append(el('h3', '', 'Další akce na tomto místě'));
    const ol = el('ol', 'evt-list');
    for (const o of here) {
      const li = el('li'), b = el('button', 't-event evt-city'); b.type = 'button';
      const txt = el('span', '', o.n); txt.append(el('small', 'when', fmtRange(o.from, o.to)), el('small', '', o.cats.join(', ')));
      b.append(el('span', '', '★'), txt); b.onclick = () => showEvent(o);
      li.append(b); ol.append(li);
    }
    h.append(ol); wrap.append(h);
  }
  card({ kind: 'akce', title: e.n, rows: [['Kdy', fmtRange(e.from, e.to)], ['Kde', e.addr], ['Kategorie', e.cats.join(', ')], ['Vstupenky', e.ticketsInfo]], lon: e.lon, lat: e.lat, extra: wrap, action: e.X != null ? focusButton('events', [e.X, e.Y]) : null });
  if (e.X != null) fx.marker(e.X, e.Y);
}
// ---- Výjezdy hasičů (src/hasici.js): the card of one intervention, in words for somebody who is not a firefighter
const agoText = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60e3)); return m < 1 ? 'právě teď' : m < 60 ? `před ${m} min` : m < 48 * 60 ? `před ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `před ${Math.floor(m / 1440)} dny`; };
const HZ_DAY = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }), HZ_TIME = new Intl.DateTimeFormat('cs-CZ', { hour: 'numeric', minute: '2-digit' });
const clockText = t => { const d = new Date(t), days = Math.round((new Date(d).setHours(12, 0, 0, 0) - new Date().setHours(12, 0, 0, 0)) / 864e5); return `${days === 0 ? 'dnes' : days === -1 ? 'včera' : HZ_DAY.format(d)} v ${HZ_TIME.format(d)}`; };
const UDAL_HOW = { ulice: 'ulice', misto: '', zastavka: 'zastávka MHD', ctvrt: 'čtvrť, bod v jejím středu', centrum: '' };
const UDAL_SRC = { mpb: ['Městská policie Brno, denní přehled událostí (mpb.cz)', 'Celý text na mpb.cz'], pcr: ['Policie ČR, Krajské ředitelství Jihomoravského kraje (policie.gov.cz)', 'Celý text na policie.gov.cz'] };
function pressSec(list) {
  const s = el('div', 'sec press');
  s.append(el('h3', '', 'Píšou o tom'));
  const ul = el('ul');
  for (const a of list) { const li = el('li'), x = el('a', '', a.title); x.href = safeUrl(a.link); x.target = '_blank'; x.rel = 'noopener'; li.append(x, el('small', '', ` · ${a.n}`)); ul.append(li); }
  s.append(ul);
  return s;
}
function showUdalost(m) {
  const [credit, more] = UDAL_SRC[m.src] || UDAL_SRC.mpb;
  const s = el('div', 'sec');
  if (m.media && m.media.length) s.append(pressSec(m.media));
  s.append(el('p', 'livenote', m.at ? 'Místo je přečtené ze slov zprávy (ulice, známé místo, zastávka nebo čtvrť), proto je jen přibližné.' : m.how === 'centrum' ? 'Zpráva uvádí jen centrum města, přesnější místo v ní není.' : 'Zpráva neuvádí místo, které by šlo ukázat v mapě.'));
  s.append(el('span', 'credit', `Zdroj: ${credit}.`));
  const place = m.how === 'centrum' ? 'centrum města' : m.place ? `${m.place}${UDAL_HOW[m.how] ? ` (${UDAL_HOW[m.how]})` : ''}` : '';
  card({ kind: 'udalost', title: m.title, text: m.text || '', rows: [['Kdy', m.kdy ? m.kdy[0].toUpperCase() + m.kdy.slice(1) : ''], ['Místo', place], ['Zveřejněno', m.end ? clockText(m.end) : '']],
    lon: m.at ? m.at[0] : undefined, lat: m.at ? m.at[1] : undefined, extra: s, buttons: m.link ? [{ href: m.link, label: more }] : [],
    part: `u=udalost/${encodeURIComponent(m.ref.id)}` }); // (its own link: a card that survives the reload of src/update.js after reading the article)
  zprPlace(m);
}
// the press about the interventions of the fire brigade (udalosti.json hasici), asked for once when a card of the fire
// brigade first wants it (the file is renewed every hour: a card opened later asks again after an hour)
let udalFile = null, udalAt = 0;
const udalosti = () => { if (!udalFile || Date.now() - udalAt > 3600e3) { udalAt = Date.now(); udalFile = fetchData(`${BASE}data/udalosti.json`).then(r => (r.ok ? r.json() : null)).catch(() => null); } return udalFile; };
function showHasici(o) {
  const live = hasici.isOpen(o);
  const s = el('div', 'sec hasici');
  s.append(el('h3', '', live ? 'Hasiči právě zasahují' : 'Zásah hasičů skončil'));
  const st = el('p', `hz-state${live ? ' live' : ''}`, live ? o.phase : `Zásah skončil${o.end ? ` ${clockText(o.end)}` : ''}. Hasiči už na místě nejsou.`);
  const units = o.units || [];
  if (units.length) {
    const total = units.reduce((n, u) => n + (u.n || 0), 0), now = units.reduce((n, u) => n + (u.now || 0), 0);
    s.append(el('h4', '', live ? `Na místě ${plural(now, 'vůz', 'vozy', 'vozů')}${now !== total ? ` (vyjelo ${total})` : ''}` : `Vyjelo ${plural(total, 'vůz', 'vozy', 'vozů')}`));
    const ul = el('ul', 'hz-units');
    for (const u of units) { const li = el('li'); li.append(el('strong', '', u.u), ` · ${u.n > 1 ? `${u.n}× ` : ''}${String(u.v || '').replace(/\s*<\s*\d+$/, '')}`); ul.append(li); }
    s.append(ul);
  }
  const old = !live && (o.end || o.t) < Date.now() - 12 * 3600e3; // (from the week: older than the 12 hours of the map)
  s.append(el('p', 'livenote', old ? 'Poloha je místo, kde hasiči zasahovali. V přehledu Za týden zůstane zásah 7 dní od ohlášení.' : 'Poloha je místo, kde hasiči zasahují. Zásah z mapy zmizí 12 hodin po ukončení.'));
  s.append(el('span', 'credit', 'Zdroj: Hasičský záchranný sbor Jihomoravského kraje (udalosti.firebrno.cz).'));
  const where = [o.street, o.part && o.part !== o.obec ? o.part : '', o.obec && o.obec !== 'Brno' ? o.obec : ''].filter(Boolean).join(', ');
  card({ kind: 'hasici', title: o.typ, text: o.note && o.note.toLowerCase().replace(/[.\s]+$/, '') !== o.typ.toLowerCase() ? o.note : '',
    rows: [['Stav', live ? 'probíhá' : 'ukončeno'], ['Ohlášeno', `${clockText(o.t)} (${agoText(o.t)})`], ['Místo', where], ['Upřesnění', o.sub], ['Hlášení řidičů', wazeOf(o)]], lon: o.lon, lat: o.lat, extra: s, top: st, part: `u=hasici/${encodeURIComponent(o.id)}`, buttons: [{ href: HASICI_WEB, label: 'Přehled událostí HZS JMK' }], action: (hasici.positions(), focusButton('hasici', [o.X, o.Y])) });
  fx.marker(o.X, o.Y);
  if (o.kind === 'pozar' || o.kind === 'nehoda') udalosti().then(U => { const l = U && U.hasici && U.hasici[o.id]; if (l && l.length && s.isConnected) s.querySelector('.livenote').before(pressSec(l)); });
}
// the line under the switch in Vrstvy: how many run now, how many in the last 12 hours
function updateHasiciPanel() {
  const n = $('hasiciNow'); if (!n) return;
  const all = hasici.list(), live = all.filter(o => hasici.isOpen(o));
  n.hidden = false;
  const nowText = live.length ? `${plural(live.length, 'zásah právě probíhá', 'zásahy právě probíhají', 'zásahů právě probíhá')} (${live.map(o => (HASICI_KINDS[o.kind] || HASICI_KINDS.jine).tag.toLowerCase()).join(', ')})` : 'teď žádný zásah neprobíhá';
  const W = state.zasahRange === 'w' ? hasici.weekSummary() : null;
  if (W && W.loaded) { // the numbers of the week, the most frequent kind first
    const kinds = Object.entries(W.by).sort((a, b) => b[1] - a[1]).map(([k, c]) => plural(c, ...(HZ_WORDS[k] || HZ_WORDS.jine))).join(', ');
    n.textContent = `Hasiči za posledních 7 dní: ${plural(W.n, 'výjezd', 'výjezdy', 'výjezdů')}${kinds ? ` (${kinds})` : ''}${weekNote('hasici')}; ${nowText}.`;
    return;
  }
  n.textContent = `Hasiči: ${nowText}, za posledních 12 hodin ${all.length}.`;
}
const WEEK_SINCE = { hasici: Date.parse('2026-11-11T16:00:00+01:00'), voda: Date.parse('2026-11-15T01:00:00+01:00') };
const weekNote = k => { const s = WEEK_SINCE[k]; if (!(Date.now() < s + 7 * 864e5)) return ''; const d = t => `${new Date(t).getDate()}. ${new Date(t).getMonth() + 1}.`; return ` (mapa je sbírá od ${d(s)}, celý týden bude od ${d(s + 7 * 864e5)})`; };
const HZ_WORDS = { pozar: ['požár', 'požáry', 'požárů'], nehoda: ['dopravní nehoda', 'dopravní nehody', 'dopravních nehod'], unik: ['únik látek', 'úniky látek', 'úniků látek'], pomoc: ['technická pomoc', 'technické pomoci', 'technických pomocí'], zachrana: ['záchrana', 'záchrany', 'záchran'], jine: ['jiná událost', 'jiné události', 'jiných událostí'] };
// the switch under Doprava, nehody: the interventions of the fire brigade and the water of the last 12 hours or of the week
function setZasahRange(r) {
  state.zasahRange = r === 'w' ? 'w' : 'h';
  document.querySelectorAll('input[name="zsr"]').forEach(x => (x.checked = x.value === state.zasahRange));
  hasici.setRange && hasici.setRange(state.zasahRange); voda.setRange && voda.setRange(state.zasahRange);
  updateHasiciPanel(); updateVodaPanel();
  // a highlighted theme of these layers: its points again (the week, or the 12 hours), the view stays
  if (state.focus === 'hasici' || state.focus === 'voda') setFocus(state.focus, { keepView: true });
  try { viewer.forceRedraw(); } catch { /* not open yet */ }
}
// the switch is seen only with one of its layers on
function updateZasahRow() { const row = $('zasahRange'); if (row) row.hidden = !(state.layers.hasici || state.layers.voda); }
// ---- Policie: případy týdne (src/policie.js): the card of one area of the police with its cases of the week
const policieDay = (t, time = true) => { const d = new Date(t); return `${d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })}${time ? ` ${d.toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit' })}` : ''}`; };
const policieWeek = D => (D.from ? `${policieDay(`${D.from}T12:00`, false)} – ${policieDay(`${D.to}T12:00`, false)}` : '');
function showPolicie(g) {
  const D = policie.data, n = g.items.length;
  const s = el('div', 'sec policie');
  const ul = el('ul', 'po-cases');
  for (const o of g.items) {
    const li = el('li'), sw = el('span', 'dm-sw'); sw.style.background = POLICIE_KINDS[o.kind].col;
    li.append(sw, el('span', 'po-when', policieDay(o.t)), el('span', 'po-what', policieText(o)), el('span', 'po-st', o.st === 1 ? 'pachatel zjištěn' : 'neobjasněno'));
    ul.append(li);
  }
  s.append(el('h3', '', `${n === 1 ? 'Případ' : 'Případy'} týdne ${policieWeek(D)}`), ul);
  const note = el('p', 'livenote', 'Policie zveřejňuje polohu jen zhruba: každý případ posune doprostřed jeho oblasti, takže se stal někde v okolí značky, ne přímo na ní. Čas je čas, kdy ho policie zapsala (vloupání se často zjistí až ráno). Týden končí před třemi dny, protože poslední dny policie doplňuje později. Stav je podle policie v době zveřejnění.');
  s.append(note);
  s.append(el('span', 'credit', 'Zdroj: Policie České republiky (mapa kriminality, otevřená data CC BY 4.0), obnovováno denně.'));
  const kinds = Object.keys(POLICIE_KINDS).map(k => [k, g.items.filter(o => o.kind === k).length]).filter(([, c]) => c);
  card({ kind: 'policie', title: n === 1 ? policieText(g.items[0]) : `${n} ${n <= 4 ? 'případy' : 'případů'} za týden`,
    text: n === 1 ? `${POLICIE_KINDS[g.kind].n} v okolí tohoto místa` : `V okolí tohoto místa: ${kinds.map(([k, c]) => `${POLICIE_KINDS[k].n.toLowerCase()} ${c}×`).join(', ')}`,
    lon: g.lon, lat: g.lat, extra: s, buttons: [{ href: 'https://kriminalita.policie.cz/', label: 'Mapa kriminality Policie ČR' }], action: focusButton('policie', [g.X, g.Y]) });
  fx.marker(g.X, g.Y);
  // the area of the police the cases belong to, outlined while the card is open (fx.area, as the quarter of a quarter card)
  policie.areaAt(g.lon, g.lat).then(r => {
    if (!r || $('card').hidden || !card.cur || card.cur.kind !== 'policie' || card.cur.lon !== +g.lon || card.cur.lat !== +g.lat) return;
    fx.area = Object.assign([r], { rough: true }); // a police tape around it on posts (src/fx.js): the area is only approximate
    note.append(' Oblast je na mapě ohraničená: policie hranice oblastí nezveřejňuje, jsou dopočítané z jejich středů (každé místo patří k nejbližšímu středu).');
  });
}
// the line under the switch in Vrstvy: the week and its numbers
function updatePoliciePanel() {
  const n = $('policieNow'); if (!n) return;
  const D = policie.data, c = k => D.items.filter(o => o.kind === k).length;
  n.hidden = !D.items.length;
  n.textContent = `Policie, týden ${policieWeek(D)}: ${plural(c('vloupani'), 'vloupání', 'vloupání', 'vloupání')}, ${plural(c('kradeze'), 'krádež', 'krádeže', 'krádeží')}, ${plural(c('nasili'), 'násilný čin', 'násilné činy', 'násilných činů')}. Poloha jen po oblastech.`;
}
// ---- Voda: havárie a odstávky (src/voda.js): the card of one burst main or shut-off of BVK, and of a water tank
const VODA_DAY = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' });
const VODA_TIME = new Intl.DateTimeFormat('cs-CZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Prague' });
const vodaWhen = t => `${VODA_DAY.format(new Date(t))} ${VODA_TIME.format(new Date(t))}`;
// "po 16. 11. 8:00–14:00", or both days when it runs over midnight
const vodaSpan = o => (!o.from ? '' : !o.to ? `od ${vodaWhen(o.from)}` : VODA_DAY.format(new Date(o.from)) === VODA_DAY.format(new Date(o.to)) ? `${vodaWhen(o.from)}–${VODA_TIME.format(new Date(o.to))}` : `${vodaWhen(o.from)} – ${vodaWhen(o.to)}`);
const VODA_TITLE = { havarie: 'Havárie vodovodu', skoncilo: 'Havárie vodovodu (skončila)', konec: 'Odstávka vody (skončila)', probiha: 'Odstávka vody', chysta: 'Připravovaná odstávka vody' };
const VODA_SUPPLY = { 'předzásobení': 'žádné, BVK doporučuje natočit si vodu předem', cisterna: 'cisterna s pitnou vodou' };
const vodaWhere = o => (o.where || []).filter(l => /\p{Lu}/u.test(l) && l.replace(/[^\p{L}]/gu, '').length >= 4);
function showVoda(o) {
  const st = voda.stateOf(o);
  const strip = el('p', `hz-state${st === 'havarie' ? ' live' : st === 'probiha' ? ' vd-now' : ''}`,
    st === 'havarie' ? `Havárie vodovodu, BVK ji opravuje.${o.water ? ` ${o.water}.` : ''}` : st === 'skoncilo' ? (o.kind === 'havarie' ? 'Havárie už není v přehledu BVK, nejspíš je opravená.' : 'Odstávka skončila, voda zase teče.')
      : st === 'probiha' ? `Voda teď neteče${o.to ? `, má téct od ${VODA_TIME.format(new Date(o.to))}${VODA_DAY.format(new Date(o.to)) !== VODA_DAY.format(new Date()) ? ` (${VODA_DAY.format(new Date(o.to))})` : ''}` : ''}.`
        : `Voda nepoteče ${vodaSpan(o)}.`);
  const s = el('div', 'sec voda');
  const where = vodaWhere(o);
  if (where.length) {
    s.append(el('h4', '', st === 'chysta' ? 'Bez vody budou' : st === 'skoncilo' ? 'Bez vody byly' : 'Bez vody jsou'));
    const ul = el('ul', 'hz-units'); for (const w of where) ul.append(el('li', '', w)); s.append(ul);
  } else if (o.n) s.append(el('h4', '', `Zasažená oblast: ${plural(o.n, 'adresa', 'adresy', 'adres')}`)); // (the source names no street: the count and the area in the map)
  s.append(el('p', 'livenote', `Značka stojí u oblasti bez vody, při přiblížení je oblast vyznačená v mapě.${st === 'havarie' || st === 'skoncilo' ? ' Havárie zůstane v mapě ještě 12 hodin poté, co ji BVK vyřadí z přehledu.' : ` Každý dům s odstávkou dostane od BVK oznámení na vchod nejméně 15 dní předem. Připravované odstávky mapa ukazuje na ${VODA_PLAN_DAYS} dní dopředu.`}`));
  s.append(el('span', 'credit', 'Zdroj: Brněnské vodárny a kanalizace, a.s. (mapa havárií a odstávek). Havárie hlaste na dispečink BVK 543 212 537 (nonstop).'));
  const traffic = [o.traffic, o.trafficNote, o.trafficTo ? `do ${vodaWhen(o.trafficTo)}` : ''].filter(Boolean).join(', ');
  card({ kind: 'voda', title: VODA_TITLE[st === 'skoncilo' && o.kind !== 'havarie' ? 'konec' : st] || 'Voda', text: o.note,
    rows: [['Kdy', st === 'havarie' || st === 'skoncilo' ? (o.from ? `od ${vodaWhen(o.from)}` : '') : vodaSpan(o)], ['Kde', [o.obec && o.obec !== 'Brno' ? o.obec : '', o.n ? plural(o.n, 'adresa', 'adresy', 'adres') : ''].filter(Boolean).join(', ')],
      ['Náhradní voda', VODA_SUPPLY[o.supply] || o.supply], ['Doprava', traffic], ['Aktualizace', o.upd], ['Číslo BVK', o.id]],
    lon: o.lon, lat: o.lat, extra: s, top: strip, part: `u=voda/${encodeURIComponent(o.id)}`, buttons: [{ href: VODA_WEB, label: 'Mapa havárií a odstávek BVK' }, { href: VODA_PAGE, label: 'Přehled na bvk.cz' }],
    action: (voda.positions(), focusButton('voda', [o.X, o.Y])) });
  fx.marker(o.X, o.Y);
}
function showVodaTank(k) {
  const s = el('div', 'sec voda');
  s.append(el('p', 'livenote', 'Cisterny přistavuje BVK, když je někde bez vody kvůli havárii nebo odstávce. Mapa je ukazuje jen poblíž takového místa: přehled BVK neuvádí, ke které události cisterna patří.'));
  s.append(el('span', 'credit', 'Zdroj: Brněnské vodárny a kanalizace, a.s. (mapa havárií a odstávek).'));
  card({ kind: 'voda', title: 'Cisterna s pitnou vodou', text: 'Náhradní zásobování pitnou vodou od BVK. Vezměte si vlastní nádobu.',
    rows: [['Přistavena', k.t ? vodaWhen(k.t) : ''], ['Místo', k.addr], ['Označení', k.name ? `cisterna č. ${k.name}` : '']], lon: k.lon, lat: k.lat, extra: s, buttons: [{ href: VODA_WEB, label: 'Mapa havárií a odstávek BVK' }] });
  fx.marker(k.X, k.Y);
}
// the line under the switch in Vrstvy: what goes on now and how many shut-offs are planned for the next week
function updateVodaPanel() {
  const n = $('vodaNow'); if (!n) return;
  const all = voda.list(), st = all.map(o => voda.stateOf(o)), c = k => st.filter(x => x === k).length;
  n.hidden = false;
  const now = [c('havarie') ? plural(c('havarie'), 'havárie vodovodu', 'havárie vodovodu', 'havárií vodovodu') : '', c('probiha') ? `${plural(c('probiha'), 'odstávka', 'odstávky', 'odstávek')} právě teď` : ''].filter(Boolean);
  const W = state.zasahRange === 'w' ? voda.weekSummary() : null;
  const week = W && W.loaded ? ` Za posledních 7 dní: ${plural(W.havarie, 'havárie', 'havárie', 'havárií')}, ${plural(W.odstavka, 'odstávka', 'odstávky', 'odstávek')}${weekNote('voda')}.` : '';
  n.textContent = `Voda: ${now.length ? now.join(', ') : 'teď žádná havárie ani odstávka'}, ${c('chysta') ? `připravovaných odstávek do týdne ${c('chysta')}` : 'do týdne žádná připravovaná odstávka'}.${week}`;
}
// ---- Parkovací domy (src/parking.js): the card of one car park. The live block on top (free spaces, a thermometer,
// how old the value is; redrawn with every new value while the card is open), then what the car park is: photos,
// prices, opening hours, history (data/parking.json, written by hand)
const PARKING_TYPE = { dum: 'parkovací dům', podzemni: 'podzemní garáže', plocha: 'parkoviště pod širým nebem', pr: 'P+R: parkoviště pro přestup na MHD' };
function parkingLive(o) {
  const s = el('div', 'sec parking-live');
  const ok = parking.live(o);
  s.append(el('h3', '', 'Právě teď'));
  if (o.out) {
    // (closed for now, `out` of data/parking.json: the city's numbers say "full", so they are not shown)
    const big = el('p', 'pk-big'); big.append(el('strong', 'pk-out', 'Mimo provoz'));
    s.append(big, el('p', 'pk-none', `Teď se tu parkovat nedá (${o.out}). Město ho v datech dál hlásí jako plné, proto tu volná místa neukazujeme.`));
    s.append(el('span', 'credit', 'Zdroj: Brněnské komunikace a.s. (bkom.cz).'));
    return s;
  }
  if (!ok) {
    s.append(el('p', 'pk-none', o.free == null ? 'Město teď údaj o volných místech neposílá.' : `Poslední údaj je ${clockText(o.t)}, tedy starší než půl hodiny: nevíme, jak to tu vypadá teď.`));
  } else {
    const col = fullCol(o.full, o.free), pct = Math.round(o.full * 100);
    const big = el('p', 'pk-big');
    const num = el('strong', '', o.free === 0 ? 'Plno' : String(o.free)); num.style.color = col;
    big.append(num, el('span', '', o.free === 0 ? `všech ${o.cap} míst je obsazeno` : `${o.free === 1 ? 'volné místo' : o.free <= 4 ? 'volná místa' : 'volných míst'} z ${o.cap}`));
    const bar = el('div', 'pk-bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `obsazeno ${pct} %`);
    const fill = el('i'); fill.style.width = `${Math.max(2, pct)}%`; fill.style.background = col; bar.append(fill);
    for (const q of [25, 50, 75]) { const t = el('b'); t.style.left = `${q}%`; bar.append(t); }
    s.append(big, bar, el('p', 'pk-pct', `Obsazeno ${pct} %${o.cars != null && o.cars !== o.cap - o.free ? ` · v garážích stojí ${plural(o.cars, 'auto', 'auta', 'aut')} včetně abonentů` : ''}`));
    if (o.sub && o.sub.cap) s.append(el('p', 'pk-sub', `Místa pro abonenty (dlouhodobé pronájmy): volno ${o.sub.free} z ${o.sub.cap}. Ta se do volných míst pro veřejnost nepočítají.`));
  }
  s.append(el('p', 'livenote', `${o.t ? `Údaj z ${clockText(o.t)} (${agoText(o.t)}). ` : ''}`));
  s.append(el('span', 'credit', 'Zdroj: Brněnské komunikace a.s., otevřená data města Brna (data.brno.cz), CC BY 4.0.'));
  return s;
}
function showParking(o) {
  const wrap = el('div');
  const lv = parkingLive(o); wrap.append(lv);
  showParking.cur = { id: o.id, el: lv };
  // the course of the last day or two (data/parking-history.json): two buttons to switch, the day at the start
  if (o.feedName && !o.out) {
    const hs = el('div', 'sec parking-hist');
    const head = el('div', 'pk-hhead'); head.append(el('h3', '', 'Jak bylo plno'));
    const sw = el('div', 'row2');
    const box = el('div');
    const show = async hours => {
      for (const b of sw.children) b.setAttribute('aria-pressed', String(+b.dataset.h === hours));
      const pts = await parking.series(o, hours);
      box.replaceChildren(parkingChart(pts, hours));
    };
    for (const [h, lbl] of [[24, '1 den'], [48, '2 dny']]) { const b = el('button', 'pbtn small', lbl); b.type = 'button'; b.dataset.h = h; b.onclick = () => { track('Nástroj', { nastroj: 'parkovani-graf', hodnota: lbl }); show(h); }; sw.append(b); }
    head.append(sw); hs.append(head, box, el('p', 'livenote', 'Podíl obsazených míst pro veřejnost. Čárkované čáry: 70 % a 90 %.'));
    wrap.append(hs); show(24);
  }
  const s = el('div', 'sec parking');
  const pics = [...basePics(o.pics || []), ...picsOf(o.imgs || [])];
  const who = [...new Set((o.credits || []).map(c => c.author))];
  const credit = [who.length ? `Panoramax (${who.join(', ')}), CC BY-SA 4.0, výřez z panoramatu` : '', (o.imgCredits || []).length ? `Wikimedia Commons (${o.imgCredits.map(c => `${c[0]}, ${c[1]}`).join('; ')})` : ''].filter(Boolean).join(' · ');
  const g = gallery(pics, o.name || o.short, `Foto: ${credit}`);
  if (g) s.append(g);
  if (o.prices && o.prices.length) { s.append(el('h3', '', 'Kolik to stojí')); s.append(rowsDl(o.prices)); if (o.priceNote) s.append(el('p', 'livenote', o.priceNote)); }
  if (o.history) { s.append(el('h3', '', 'Historie')); for (const para of String(o.history).split('\n')) if (para) s.append(el('p', '', para)); }
  if (o.notes) for (const para of String(o.notes).split('\n')) if (para) s.append(el('p', 'livenote', para));
  if (o.sources) s.append(el('span', 'credit', `Texty: ${o.sources}`));
  if (s.childNodes.length) wrap.append(s);
  parking.positions();
  card({ kind: 'parkovani', title: o.short || o.name, text: o.desc || '', link: o.id,
    rows: [['Typ', o.type ? cap(PARKING_TYPE[o.type] || o.type) : ''], ['Adresa', o.addr || ''], ['Kapacita', o.cap ? `${o.cap} míst${o.capNote ? ` (${o.capNote})` : ''}` : ''], ['Podlaží', o.floors || ''], ['Otevřeno', o.hours || ''], ['Vjezd do výšky', o.height || ''], ['Provozuje', o.operator || ''], ['V provozu od', o.opened || ''], ['Nabíjení aut', o.ev || '']],
    lon: o.lon, lat: o.lat, extra: wrap,
    buttons: [...(o.web ? [{ href: o.web, label: 'Web provozovatele' }] : [{ href: PARKING_WEB, label: 'Parkování na webu BKOM' }]), { href: PARKING_DATA, label: 'Otevřená data města' }],
    action: o.X != null ? focusButton('parking', [o.X, o.Y]) : null });
  if (o.X != null) fx.marker(o.X, o.Y);
}
// the line under the switch in Vrstvy (free spaces in all of them together), and the live block of an open card
function updateParkingPanel() {
  const n = $('parkingNow');
  const sm = parking.summary();
  if (n) {
    n.hidden = !sm.n;
    n.textContent = !sm.ok ? 'Parkovací domy: město teď údaje o volných místech neposílá.'
      : `Parkovací domy: volno ${plural(sm.free, 'místo', 'místa', 'míst')} v ${sm.ok} parkovištích${sm.full ? `, ${sm.full === 1 ? 'jedno je plné' : `${sm.full} jsou plná`}` : ''} (údaj ${clockText(sm.at)}).${sm.out.length ? ` Mimo provoz: ${sm.out.join(', ')}.` : ''}`;
  }
  const c = showParking.cur;
  if (c && !$('card').hidden && card.cur && card.cur.link === c.id && c.el.isConnected) {
    const o = parking.data.items.find(q => q.id === c.id);
    if (o) { const nw = parkingLive(o); c.el.replaceWith(nw); c.el = nw; }
  }
}
// ---- Vlaky (src/vlaky.js): the card of a railway station. Its body is the board (departures / arrivals), which keeps
// itself fresh while the card is open; the real platform is on the board of Správa železnic, linked right above ours.
function showStation(st) {
  const b = vlaky.board(st), c = vlaky.counts(st);
  vlaky.positions();
  card({ kind: 'nadrazi', title: st.name, link: `vlaky-${st.id}`,
    text: vlaky.fresh() ? `Dnes podle jízdního řádu: ${plural(c.dep, 'odjezd', 'odjezdy', 'odjezdů')} a ${plural(c.arr, 'příjezd', 'příjezdy', 'příjezdů')}.` : '',
    lon: st.lon, lat: st.lat, extra: b.el, action: st.X != null ? focusButton('vlaky', [st.X, st.Y]) : null });
  b.start();
  if (st.X != null) fx.marker(st.X, st.Y);
}
function showOutage(o) {
  const s = el('div', 'sec');
  s.append(el('h3', '', o.type === 'Z' ? 'Přesunutá zastávka' : 'Výluka nebo odklon'));
  // (the open data carry the text without the bold of mapa.idsjmk.cz: the lines are set bold here, so that a reader
  // finds "linka 6" in a text about fourteen lines)
  const LINES = /(\blin(?:ka|ky|ce|ku|kou|ek|kám|kách|kami)\s+(?:[xšNPE]?\d+(?:[–-]\d+)?)(?:(?:\s*,\s*|\s+a\s+)[xšNPE]?\d+(?![\d.]))*)/g;
  for (const para of (o.text || '').split('\n')) {
    if (!para.trim()) continue;
    const p = el('p');
    para.split(LINES).forEach((part, i) => p.append(i % 2 ? el('strong', '', part) : /https?:\/\/|www\./i.test(part) ? linkify(part) : part));
    s.append(p);
  }
  s.append(el('span', 'credit', 'Zdroj: IDS JMK, KORDIS JMK (mapa.idsjmk.cz), otevřená data města Brna.'));
  // (the source's "number" is mostly the carrier's own code of the closure, e.g. DPMB_V2611-112 & 113: only a name of a place is shown)
  const place = String(o.place || '').replace(/!+\s*AKTUALIZACE\s*!+/i, '').replace(/^\s*(DPMB(_[A-Z]?\d{4}-\d+)?|\d{4}-\d+|\d{4}(?=\s))(\s*&\s*\d+)*\s*/, '').trim();
  const when = t => new Date(t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  card({ kind: 'vyluka', title: o.title, rows: [['Linky', o.lines.join(', ')], ['Platí', `${o.from ? when(o.from) : ''} – ${o.to ? when(o.to) : 'do odvolání'}`], ['Místo', place]], lon: o.lon, lat: o.lat, extra: s, part: `u=vyluka/${encodeURIComponent(o.id)}`, buttons: [{ href: 'https://mapa.idsjmk.cz/', label: 'Mapa výluk IDS JMK' }] });
  fx.marker(o.X, o.Y);
}
const SMALL = { tree: ['Památný strom', 'Památné stromy města Brna'], fountain: ['Pítko', 'Pítka města Brna'], view: ['Vyhlídka', 'Vyhlídkové body (ÚAP Brno)'], pool: ['Koupání', 'Plavecká sportoviště STAREZ a další'],
  art: ['Socha, pomník', 'Objekty drobné architektury (Sochařské Brno)'], cross: ['Kříž, boží muka', 'Objekty drobné architektury (Sochařské Brno)'], plaque: ['Pamětní deska', 'Objekty drobné architektury (Sochařské Brno)'] };
const SMALL_PHOTO = { tree: 'pasport zeleně', art: 'pasport drobné architektury', cross: 'pasport drobné architektury', plaque: 'pasport drobné architektury' };
function showLupa(p) {
  const s = el('div', 'sec lupa');
  s.append(el('h3', '', 'Brno pod lupou'));
  if (p.note) s.append(el('p', '', p.note));
  if (isUrl(p.url)) { const a = el('a', 'pbtn lupa-more', 'Víc o místě ›'); a.href = safeUrl(p.url); a.target = '_blank'; a.rel = 'noopener'; const b = el('div', 'btns'); b.append(a); s.append(b); }
  card({ kind: 'lupa', title: p.name || LUPA[p.kind].title, text: LUPA[p.kind].title, lon: p.lon, lat: p.lat, extra: s });
  fx.marker(p.X, p.Y);
}
function smallRead(o) {
  if (o.r) return o.r;
  const [facts, ...desc] = (o.d || '').split(' — ');
  if (!facts.includes(' · ')) return o.d || '';
  const f = facts.split(' · ').map(x => (/^\d{4}$/.test(x) ? `Rok vzniku: ${x}` : /^materiál /.test(x) ? `Materiál: ${x.slice(9)}` : x.replace(/\s*\([^)]*\)/, '')));
  return `${[...f, ...desc].map(x => cap(x.trim()).replace(/[.\s]+$/, '').replace(/ ul$/, ' ulice')).filter(Boolean).join('. ')}.`;
}
async function showSmall(o) {
  await mediaReady();
  const s = el('div', 'sec');
  const sp = SMALL_PHOTO[o.k] ? picsOf([o.img]) : [];
  if (sp.length) s.append(picImg(sp[0], o.n, `Foto: Statutární město Brno, ${SMALL_PHOTO[o.k]}`, 'campic'), el('span', 'credit', `Foto: Statutární město Brno, ${SMALL_PHOTO[o.k]} (gis.brno.cz)`));
  if (o.d) s.append(el('p', '', o.d));
  const btns = el('div', 'btns');
  if (isUrl(o.img)) btns.append(srcBtn(o.img, SMALL_PHOTO[o.k] ? 'Fotka v plné velikosti' : 'Fotka pítka'));
  if (isUrl(o.web)) btns.append(srcBtn(o.web, o.k === 'tree' ? 'Ústřední seznam ochrany přírody' : /encyklopedie\.brna\.cz/.test(o.web) ? 'Encyklopedie dějin města Brna' : 'Web'));
  s.append(btns, el('span', 'credit', `Zdroj: ${SMALL[o.k][1]}, otevřená data města Brna (data.brno.cz), CC BY.`));
  say(s, SMALL[o.k][0], smallRead(o), `Zdroj: ${SMALL[o.k][1]}, otevřená data města Brna, CC BY`);
  card({ kind: 'drobnost', title: o.n, text: SMALL[o.k][0], lon: o.lon, lat: o.lat, extra: s, action: FOCUS_KINDS[o.k] ? focusButton(o.k, [o.X, o.Y]) : null });
}
const KAMENY_WEB = 'https://www.kamenyzmizelychbrno.cz';
const KAMENY_SRC = 'Zdroj: Kameny zmizelých Brno (kamenyzmizelychbrno.cz), spolek ŠTETL; údaje o lidech podle Encyklopedie dějin města Brna.';
const stonesWord = n => (n === 1 ? 'kámen' : n < 5 ? 'kameny' : 'kamenů');
function showKamen(pl, i = 0) {
  const n = pl.stones.length, st = pl.stones[i];
  const wrap = el('div');
  if (n > 1) {
    const s = el('div', 'sec kameny');
    s.append(el('h3', '', `Jména na ${n} kamenech`));
    const ol = el('ol', 'kam-list');
    pl.stones.forEach((x, j) => {
      const li = el('li'), b = el('button', j === i ? 'on' : '', x.n); b.type = 'button';
      if (j === i) b.setAttribute('aria-current', 'true');
      b.onclick = () => showKamen(pl, j);
      li.append(b); ol.append(li);
    });
    const nav = el('div', 'btns routenav');
    const mk = (label, j) => { const b = el('button', 'pbtn small', label); b.type = 'button'; b.disabled = j < 0 || j >= n; b.onclick = () => showKamen(pl, j); return b; };
    nav.append(mk('‹ Předchozí', i - 1), el('span', 'routepos', `${i + 1} / ${n}`), mk('Další ›', i + 1));
    s.append(ol, nav);
    wrap.append(s);
  }
  const s = el('div', 'sec kamen');
  if (n > 1) s.append(el('h3', '', st.n));
  if (pl.pics && pl.pics.length) { const g = gallery(basePics(pl.pics), `Kameny zmizelých, ${pl.addr}`, 'Foto: Brno 2000'); if (g) s.append(g); }
  if (st.about) s.append(el('p', 'kam-person', st.about));
  const rows = [...(st.about ? [] : [['Narození', st.born], ['Deportace', st.dep], ['Úmrtí', st.died]]), ['Kámen položen', st.laid], ['Nechali položit', st.by]];
  s.append(rowsDl(rows));
  for (const para of (st.bio || '').split('\n\n')) if (para) s.append(el('p', '', para));
  const btns = el('div', 'btns');
  if (st.slug) btns.append(srcBtn(`${KAMENY_WEB}/kamen/${st.slug}`, 'Příběh na webu Kameny zmizelých'));
  if (isUrl(st.enc)) btns.append(srcBtn(st.enc, 'Encyklopedie dějin města Brna'));
  s.append(btns);
  s.append(el('p', 'kam-about', 'Kameny zmizelých (Stolpersteine) jsou mosazné destičky v dlažbě před domy, kde žili lidé pronásledovaní nacisty. Projekt umělce Guntera Demniga.'));
  s.append(el('span', 'credit', KAMENY_SRC));
  wrap.append(s);
  // Číst: the place first (where, what the stones are, the names), then every person of the place one after another,
  // from the one shown; all of it said by the first block of the card
  const first = wrap.firstChild, sayName = x => x.n.replace(/, roz\. /, ', rozená ');
  say(first, 'Kameny zmizelých', `${pl.addr.replace(/\b\d+\/(\d+\w?)\b/g, '$1').replace(/ · /g, ', ')}. Mosazné destičky v dlažbě připomínají lidi, kteří tu žili a které pronásledovali nacisté. ${n === 1 ? 'Je tu jeden kámen' : n < 5 ? `Jsou tu ${n} kameny` : `Je tu ${n} kamenů`}: ${pl.stones.map(sayName).join('; ')}.`);
  for (const x of [...pl.stones.slice(i), ...pl.stones.slice(0, i)]) {
    const facts = factsText([['Narození', x.born], ['Deportace', x.dep], ['Úmrtí', x.died]], ['Narození', 'Deportace', 'Úmrtí']);
    say(first, sayName(x), [x.about || facts, x.laid ? `Kámen položen ${x.laid}.` : '', x.bio].filter(Boolean).join('\n'), KAMENY_SRC);
  }
  card({ kind: 'kamen', title: n > 1 ? pl.addr : st.n, text: n > 1 ? `Kameny zmizelých · ${n} ${stonesWord(n)}` : `Kámen zmizelých · ${pl.addr}`, lon: pl.lon, lat: pl.lat, extra: wrap, link: `kameny-${pl.slug}`, action: focusButton('kameny', [pl.X, pl.Y]) });
  if (pl.X != null) fx.marker(pl.X, pl.Y);
}
function monumentSection(m) {
  const s = el('div', 'sec monument');
  const tag = el('span', 'mon-tag', 'Kulturní památka');
  s.append(tag);
  // picture of the monument from Wikidata (a Wikimedia Commons file, our copy; a link to its author and licence)
  const mp = m.img ? picsOf([commonsFile(m.img)]) : [];
  if (mp.length) {
    const im = picImg(mp[0], m.n, 'Foto: Wikimedia Commons');
    const cr = el('a', '', 'Foto: Wikimedia Commons (autor a licence)'); cr.href = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(m.img)}`; cr.target = '_blank'; cr.rel = 'noopener';
    const c = el('span', 'credit'); c.append(cr);
    s.append(im, c);
  }
  s.append(el('p', '', `${m.n} · rejstříkové číslo ÚSKP ${m.uskp}`));
  const btns = el('div', 'btns');
  btns.append(srcBtn(m.pk ? `https://pamatkovykatalog.cz/soupis/podle-relevance/1/seznam/?katCislo=${encodeURIComponent(m.pk)}` : `https://pamatkovykatalog.cz/uskp/podle-relevance/1/seznam/?uskp=${encodeURIComponent(m.uskp)}`, 'Památkový katalog'));
  btns.append(srcBtn(`https://www.wikidata.org/wiki/${m.wd}`, 'Wikidata'));
  s.append(btns, el('span', 'credit', 'Údaje o památce: Wikidata (CC0), Národní památkový ústav.'));
  return s;
}
function showMonument(m) { card({ kind: 'pamatka', title: m.n, text: 'Kulturní památka', lon: m.lon, lat: m.lat, extra: monumentSection(m) }); fx.marker(m.X, m.Y); }
// a themed route: stops one by one
// the tour: one stop every few seconds; any move of the map, a click or closing the card stops it
const tour = { r: null, i: 0, timer: null };
function stopTour() { if (tour.timer) { clearTimeout(tour.timer); tour.timer = null; toast('Prohlídka zastavena'); } tour.r = null; }
function playTour(r, from = 0) {
  stopTour();
  if (!from) track('Nástroj', { nastroj: 'prehrat-trasu', hodnota: r.theme });
  tour.r = r; tour.i = from;
  const step = () => {
    if (tour.r !== r) return;
    showRouteStop(r, tour.i, true);
    tour.i++;
    if (tour.i >= r.stops.length) { tour.timer = null; tour.r = null; toast('Konec trasy'); return; }
    tour.timer = setTimeout(step, 10000); // (the flight takes about 3 s, then time to look and read)
  };
  step();
}
for (const ev of ['canvas-drag', 'canvas-scroll', 'canvas-pinch']) viewer.addHandler(ev, () => { if (tour.r) stopTour(); });
// to the next stop of a route: zoom out so that both places are in view, fly over, then zoom in close
// on the stop (when it is already near on the screen, just zoom in)
let flight = 0;
const STOP_Z = 3; // about 0.7 m per pixel: the building and its surroundings fill the screen
function flyToStop(X, Y) {
  const id = ++flight;
  const v = view(), cw = viewer.container.clientWidth, ch = viewer.container.clientHeight;
  const [cx, cy] = screenToImg(cw / 2, ch / 2);
  const d = Math.hypot(X - cx, Y - cy);
  if (d * v.k < Math.min(cw, ch) * 0.35) { flyTo(X, Y, STOP_Z); return; }
  const zOut = Math.max(0.12, Math.min(v.z, 1, ((0.55 * Math.min(cw, ch)) / d) * S));
  flyTo((cx + X) / 2, (cy + Y) / 2, zOut);
  setTimeout(() => { if (id === flight) flyTo(X, Y, STOP_Z); }, 1500);
}
// a Wikipedia tag near a route stop with a similar name (for its photo and text)
function wikiNear(st) {
  const words = s => norm(s || '').replace(/[^a-z0-9 ]+/g, ' ').split(' ');
  // (words that only say the kind of place do not count: "Kostel sv. Michala" is not "Kostel sv. Jakuba")
  const KIND = new Set(['kostel', 'namesti', 'divadlo', 'muzeum', 'park', 'vila', 'hotel', 'galerie', 'pavilon', 'brana', 'kaple', 'ulice', 'brno', 'brne', 'brnenske', 'brnenska', 'narodni', 'mestske', 'stezka', 'naucna']);
  const sw = words(st.n).filter(w => w.length > 3 && !KIND.has(w));
  let best = null, bd = 150;
  for (const w of data.wikiPois) {
    const d = Math.hypot(w[2] - st.X, (w[3] - st.Y) * 2);
    if (d >= bd) continue;
    const ww = words(w[0]);
    if (sw.some(a => ww.some(b => b.length > 3 && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5)))))) { best = w; bd = d; }
  }
  return best;
}
function showRouteStop(r, i, fromTour = false) {
  if (!fromTour && tour.r) stopTour();
  const st = r.stops[i];
  city.setRoute(r, i);
  flyToStop(st.X, st.Y); fx.marker(st.X, st.Y);
  const p = city.placeNear(st.lon, st.lat, st.n, 150);
  // no GO TO BRNO photo: the photo and text from Wikipedia, when the stop has an article
  const w = p && isUrl(p.img) ? null : wikiNear(st);
  const wrap = el('div');
  const nav = el('div', 'btns routenav');
  const mk = (label, j) => { const b = el('button', 'pbtn small', label); b.type = 'button'; b.disabled = j < 0 || j >= r.stops.length; b.onclick = () => showRouteStop(r, j); return b; };
  nav.append(mk('‹ Předchozí', i - 1), el('span', 'routepos', `${i + 1} / ${r.stops.length}`), mk('Další ›', i + 1));
  if (!fromTour) { const all = el('button', 'pbtn small', '☰ Zastávky trasy'); all.type = 'button'; all.title = `Karta trasy ${r.theme} se seznamem všech zastávek`; all.onclick = () => showRouteIntro(r); nav.append(all); }
  if (fromTour) { const stop = el('button', 'pbtn small', '■ Zastavit prohlídku'); stop.type = 'button'; stop.onclick = () => stopTour(); nav.append(stop); }
  wrap.append(nav);
  if (p) wrap.append(gotobrnoSection(p));
  else {
    const s = el('div', 'sec gotobrno'); s.append(el('h3', '', r.theme));
    if (isUrl(r.img) && !w) { const b = el('div', 'btns'); b.append(srcBtn(r.img, 'Fotka k tématu na gotobrno.cz')); s.append(b); }
    if (r.t) s.append(el('p', '', r.t.length > 600 ? `${r.t.slice(0, 600).replace(/\s+\S*$/, '')}…` : r.t));
    s.append(el('span', 'credit', 'Zdroj: www.gotobrno.cz (TIC BRNO), otevřená data města Brna, CC BY.'));
    wrap.append(s);
  }
  card({ kind: 'trasa', title: `${i + 1}. ${st.n}`, text: `Trasa ${r.theme}`, rows: [['Adresa', st.addr]], lon: st.lon, lat: st.lat, extra: wrap, wiki: w ? w[1] : undefined });
  city.setRoute(r, i); // (opening a card does not clear the route)
  markRoute();
}
const WORK_TITLE = { leseni: 'Lešení na chodníku', kontejner: 'Kontejner na ulici', havarie: 'Oprava havárie', pripojka: 'Výkop pro přípojku', kolektor: 'Stavba kolektoru', tram: 'Oprava tramvajové trati', cyklo: 'Stavba cyklostezky', voda: 'Výkop: kanalizace a vodovod', plyn: 'Výkop: plynovod', optika: 'Výkop: optický kabel', stavba: 'Zábor u stavby', oprava: 'Oprava' };
const WORK_KIND = { uplna: 'úplná uzavírka', castecna: 'částečná uzavírka (zábor chodníku nebo jízdního pruhu)', smer: 'uzavírka jednoho směru' };
// the same in the 4th case, for "Město povolilo …"
const WORK_KIND_ACC = { uplna: 'úplnou uzavírku', castecna: 'částečnou uzavírku (zábor chodníku nebo jízdního pruhu)', smer: 'uzavírku jednoho směru' };
const czd = d => (d ? d.split('-').reverse().map(x => x.replace(/^0/, '')).join('. ') : '');
function showWork(c0) {
  // (several consents with the same text are one site, src/layers.js: the card speaks for all of them and their pieces
  // are lit in the map; a consent that comes from a list, not from a click, is looked up among the drawn ones)
  const c = (c0.g ? c0 : layers.workItem(c0.id)) || c0, g = c.g && c.g.items.length > 1 ? c.g : null, kind = g ? g.kind : c.kind;
  let head = kind === 'uplna' ? 'Uzavřeno' : kind === 'smer' ? 'Uzavřen jeden směr' : WORK_TITLE[c.cat] || 'Zábor chodníku nebo vozovky';
  if (c.soon) head = kind === 'uplna' ? `Uzavře se od ${czd(c.from)}` : kind === 'smer' ? `Jeden směr se uzavře od ${czd(c.from)}` : `Od ${czd(c.from)}: ${head.toLowerCase()}`;
  const what = kind === 'uplna' && WORK_TITLE[c.cat] ? `${WORK_TITLE[c.cat].toLowerCase()}: ${c.n}` : c.n;
  const pieces = n => (n === 1 ? '1 úsek' : n < 5 ? `${n} úseky` : `${n} úseků`);
  const streets = g ? [...new Set(g.items.map(x => x.street).filter(Boolean))] : [];
  const where = g ? `${streets.slice(0, 3).join(', ')}${streets.length > 3 ? ' a další' : ''}` : `${c.street}${c.usek ? ` ${c.usek}` : ''}`;
  const limits = g ? ['uplna', 'smer', 'castecna'].map(k => { const it = g.items.filter(x => x.kind === k); return it.length ? `${WORK_KIND[k]} (${pieces(it.length)}, ${it.reduce((sum, x) => sum + (x.len || 0), 0)} m)` : ''; }).filter(Boolean).join('; ') : WORK_KIND[c.kind];
  const any = k => (g ? g.items.map(x => x[k]).find(Boolean) : c[k]), at = g ? g.at : c;
  // what the City permitted: every kind the site has (a site of one full and two partial closures says both)
  const permitted = (g ? ['uplna', 'smer', 'castecna'].filter(k => g.items.some(x => x.kind === k)) : [c.kind]).map(k => WORK_KIND_ACC[k]).filter(Boolean);
  const permText = permitted.length > 1 ? `${permitted.slice(0, -1).join(', ')} a ${permitted.at(-1)}` : permitted[0] || 'zábor';
  card({ kind: 'vykop',
    title: `${head} · ${where}`,
    text: `${what ? what + '. ' : ''}Město povolilo ${permText}${c.soon ? ` od ${czd(c.from)}` : ''} do ${czd(c.to)}. Je to povolení na celé období, ne nutně každý den práce; co se tu právě děje, nejlépe ukáže fotka ulice nebo cesta kolem.${g ? ' Všechny úseky této akce jsou v mapě zvýrazněné.' : ''}`,
    rows: [
      ['Co se děje', c.n], ['Omezení', cap(limits) + (any('mhd') ? ', s výlukou MHD' : '')], [c.soon ? 'Začne' : 'Povoleno', c.soon ? `${czd(c.from)} (do ${czd(c.to)})` : `${czd(c.from)} – ${czd(c.to)}`],
      ['Vlastní uzavírka', any('uz') ? `${czd(any('uz')[0])} – ${czd(any('uz')[1])}` : ''], ['Investor', c.inv], ['Provedení', [any('how'), any('where')].filter(Boolean).join(', ')],
      g ? ['Rozsah', `${pieces(g.items.length)}, celkem ${g.len} m`] : ['Délka úseku', c.len ? `${c.len} m` : ''],
      ['Potvrzuje i', any('ndic') ? `NDIC (${any('ndic').issuer || 'úřad'}): ${any('ndic').kind || 'omezení'}, ${czd(any('ndic').from)} – ${czd(any('ndic').to)}` : 'jen souhlas města (koordinace výkopových prací)'],
      ['Zdroj', 'Koordinace výkopových prací, Odbor investic MMB'],
    ],
    buttons: [{ href: 'https://gis.brno.cz/mapa/kvp-uzavirky/', label: 'Mapa koordinace výkopů (město)' }],
    lon: at.lon.toFixed(5), lat: at.lat.toFixed(5), part: c.id != null ? `u=vykop/${encodeURIComponent(c.id)}` : null,
  });
  layers.selectWork(c.g || null); // (after card(): opening a card clears the site chosen before)
}
// ---- Blokové čištění (src/cisteni.js): the card of one section and the line under its switch in Vrstvy
const cleanWhen = o => `${o.day === 0 ? 'dnes' : o.day === 1 ? 'zítra' : dayText(o)} ${hoursText(o)}`;
function showClean(o) {
  const all = cisteni.dates(o), next = all.filter(q => q.t0 > o.t0);
  const head = o.st === 'now' ? 'Právě se čistí' : o.st === 'done' ? 'Dnes vyčištěno' : o.day === 0 ? `Dnes se čistí ${hoursText(o)}` : o.day === 1 ? `Zítra se čistí ${hoursText(o)}` : `Čistí se ${dayText(o)}`;
  const text = o.st === 'done' ? 'Blokové čištění tu dnes už skončilo. Zákaz zastavení platí po dobu uvedenou na přenosných značkách.'
    : `Blokové čištění ulice${o.day <= 1 ? '' : ` ${dayText(o)}`}. Auta, která v úseku zůstanou stát, se odtahují. Přesný rozsah a čas určují přenosné značky v ulici, ty mají přednost před mapou.`;
  const d = new Date(o.from);
  card({ kind: 'cisteni',
    title: `${head} · ${o.n}`,
    text,
    rows: [
      ['Kdy', `${d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}, ${hoursText(o)} h`],
      ['Další termín', next.length ? next.map(cleanWhen).join(', ') : 'plán zatím žádný další nemá'],
      ['Městská část', o.part ? `Brno-${o.part}` : ''],
      ['Zdroj', 'Brněnské komunikace a.s., plán blokového čištění'],
    ],
    buttons: [{ href: CISTENI_WEB, label: 'Plán a upozornění e-mailem (BKOM)' }],
    lon: o.lon.toFixed(5), lat: o.lat.toFixed(5),
  });
}
function updateCleanPanel() {
  const n = $('cleanNow'), row = $('cleanRange');
  if (row) row.hidden = !state.layers.clean;
  if (!n) return;
  const sm = cisteni.summary();
  n.hidden = !sm.loaded || !state.layers.clean;
  if (n.hidden) return;
  const parts = l => (l.length && l.length <= 4 ? ` (${l.join(', ')})` : '');
  n.textContent = !sm.total ? 'Blokové čištění: plán teď žádný termín nemá. Sezóna trvá zhruba od března do listopadu.'
    : `Blokové čištění: dnes ${plural(sm.today, 'úsek', 'úseky', 'úseků')}${sm.today ? parts(sm.todayParts) : ''}${sm.now ? `, v ${sm.now} se právě čistí` : ''}, zítra ${sm.tomorrow}${sm.tomorrow ? parts(sm.tomorrowParts) : ''}, do týdne ${sm.week}.${!sm.today && !sm.tomorrow && sm.next ? ` Nejbližší ${cleanWhen(sm.next)}.` : ''} Auta se odtahují, rozhoduje značení v ulici.`;
}
function setCleanRange(r) {
  state.cleanRange = 'dwma'.includes(r) && r ? r : 'd';
  document.querySelectorAll('input[name="clr"]').forEach(x => (x.checked = x.value === state.cleanRange));
  try { viewer.forceRedraw(); } catch { /* not open yet */ }
}
function showWorkPoint(q) {
  card({ kind: 'vykop',
    title: `${cap(q.kind || 'Dopravní omezení')}${q.planned ? ` od ${czd(q.from)}` : ''} · ${q.place || 'Brno'}`,
    text: `${q.txt || ''}${q.planned ? ` Teprve se chystá, začne ${czd(q.from)}.` : ''}`.trim(),
    rows: [['Platí', `${czd(q.from)} – ${czd(q.to)}`], ['Kategorie', q.cls], ['Vydal', q.issuer], ['Zdroj', 'NDIC (ŘSD ČR – JSDI), zrcadlí GIS města Brna']],
    buttons: [{ href: 'https://www.dopravniinfo.cz/', label: 'dopravniinfo.cz' }],
    lon: q.lon.toFixed(5), lat: q.lat.toFixed(5),
  });
}
function showTraffic(tr) {
  const time = t => new Date(t).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  if (tr.work) { showWork(tr.work); return; }
  if (tr.workPoint) { showWorkPoint(tr.workPoint); return; }
  if (tr.closure) {
    const c = tr.closure;
    const open = c.open ? c.open.split('-').reverse().map(x => x.replace(/^0/, '')).join('. ') : '';
    card({ kind: 'doprava',
      title: `Uzavřeno · ${c.n || 'úsek silnice'}`,
      text: `${c.tunnel ? 'Tunel je' : c.bridge ? 'Most je' : 'Úsek je'} uzavřený kvůli stavbě nebo rekonstrukci, auta ho objíždí — proto bývají okolo kolony.`,
      rows: [['Otevření plánováno', open || 'neuvedeno'], ['Upraveno v OSM', c.edited ? c.edited.split('-').reverse().map(x => x.replace(/^0/, '')).join('. ') : ''], ['Potvrzuje i', c.confirmedBy || 'jen OpenStreetMap (upraveno za poslední rok)'], ['Zdroj', tr.source]],
      lon: c.p[0].toFixed(5), lat: c.p[1].toFixed(5),
    });
    return;
  }
  if (tr.nehoda) { showAccident(tr.nehoda); return; }
  if (tr.alert) {
    const a = tr.alert;
    const kind = a.type === 'ROAD_CLOSED' ? 'Uzavírka' : a.type === 'ACCIDENT' ? 'Nehoda' : 'Překážka na silnici';
    card({ kind: 'doprava', title: `${kind}${a.street ? ` · ${a.street}` : ''}`, text: a.note || '', rows: [['Nahlášeno', time(a.t)], ['Zdroj', 'Waze, otevřená data města Brna']], lon: a.lon.toFixed(5), lat: a.lat.toFixed(5) });
  } else {
    const j = tr.jam;
    const lvl = ['', 'mírné zpomalení', 'zpomalení', 'kolona', 'velká kolona', 'stojí'][j.level] || 'kolona';
    let extra = null;
    if (doprava && j.street) {
      extra = el('div', 'sec dop-card'); extra.hidden = true;
      const box = extra;
      let tries = 0;
      const fill = async () => {
        const c = await doprava.course(j.street).catch(() => null);
        if (tries && !box.isConnected) return;
        if (c) { layers.selectVehicle(null); box.replaceChildren(el('h3', '', `Kolony v ulici ${j.street} za ${c.hours} hodin`)); box.insertAdjacentHTML('beforeend', c.html); box.hidden = false; }
        else if (++tries <= 8) setTimeout(() => { if (box.isConnected) fill(); }, 60e3);
      };
      fill();
    }
    card({ kind: 'doprava', extra, title: `${cap(lvl)}${j.street ? ` · ${j.street}` : ''}`, rows: [['Rychlost', j.speed != null ? `${Math.round(j.speed)} km/h` : ''], ['Zdržení', j.delay > 0 ? `${Math.round(j.delay / 60)} min` : ''], ['Délka', j.len ? `${Math.round(j.len)} m` : ''], ['Aktualizace', time(j.t)], ['Zdroj', 'Waze, otevřená data města Brna']] });
  }
}
// Nehody teď (src/nehodyted.js): one accident joined from the drivers' reports (Waze) and the firefighters' call-out,
// how sure it is, how it went, and what the statistics of the police say about the place (map Všechny nehody)
// a call-out to a traffic accident: how many drivers reported the same accident (Nehody teď, src/nehodyted.js)
function wazeOf(o) {
  if (o.kind !== 'nehoda') return '';
  const T = layers.traffic.data, c = T && T.nehody ? (T.nehody.items || []).find(x => x.h && x.h.id === o.id) : null;
  if (!c || !c.n) return '';
  const hm = t => new Date(t).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  return `${c.n} přes Waze, první v ${hm(c.reports[0])}${c.n > 1 ? `, poslední v ${hm(c.reports[c.reports.length - 1])}` : ''}`;
}
const ACC_TEXT = ['', 'Zatím ji nahlásil jen jeden řidič přes Waze, nemusí být potvrzená.', 'Nahlásilo ji víc řidičů přes Waze.', 'Vyjeli k ní hasiči.'];
const accStreet = s => String(s || '').replace(/^»\s*/, 'směr ');
function showAccident(c) {
  const hm = t => new Date(t).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const L = accLevel(c), h = c.h;
  const reps = c.n ? `${c.n === 1 ? '1 hlášení' : `${c.n} hlášení`}${c.n > 1 ? `, poslední v ${hm(c.reports[c.reports.length - 1])}` : ''}` : 'žádné';
  const fire = h ? `${h.phase || (h.open ? 'zasahují' : 'zásah skončil')}${h.sub ? ` (${h.sub})` : ''}, ohlášeno v ${hm(h.t)}` : '';
  const rows = [['Stav', `${cap(ACC_LEVEL[L])} nehoda${accLive(c, Date.now()) ? '' : ', už se nehlásí'}`], ['Nahlášeno', `${clockText(c.t)} (${agoText(c.t)})`], ['Hlášení řidičů', reps], ['Hasiči', fire], ['Silnice', c.hw ? 'dálnice nebo nájezd na ni' : '']];
  const extra = el('div', 'sec');
  extra.append(el('p', '', accLive(c, Date.now()) ? ACC_TEXT[L] : L === 1 ? 'Nahlásil ji jen jeden řidič přes Waze, nemusí být potvrzená.' : ACC_TEXT[L]));
  if (h && h.note) extra.append(el('p', '', `Hasiči: ${h.note}`));
  // the place in the statistics of the police (the street cells of the map Všechny nehody, the band within ~12 m)
  if (shown('nehody') && c.X != null) {
    const p = el('p', 'livenote'); p.hidden = true;
    // (the map of all accidents straight from here: the same as choosing it in Vrstvy, Datové mapy)
    const btns = el('div', 'btns'), mb = el('button', 'pbtn small', 'Ukázat mapu nehod');
    mb.type = 'button'; mb.title = 'Zapne datovou mapu Všechny nehody: ulice podle počtu nehod za posledních 5 let (Policie ČR)';
    const mark = () => { const onMap = state.datamap === 'nehody'; mb.setAttribute('aria-pressed', String(onMap)); mb.textContent = onMap ? 'Mapa nehod je zapnutá' : 'Ukázat mapu nehod'; };
    mb.onclick = () => { if (state.datamap === 'nehody') { setDatamap(null); track('Vrstva', { vrstva: 'dm-nehody', stav: 'vyp' }); } else { track('Vrstva', { vrstva: 'dm-nehody', stav: 'zap' }); setDatamap('nehody'); } mark(); };
    mark(); btns.append(mb);
    extra.append(p, btns);
    Promise.all([datamap.streetBand('nehody', c.X, c.Y), datamap.accidents().catch(() => null)]).then(([v, a]) => {
      if (!v) return;
      const d = DATAMAPS.nehody, w = a && a.windows && a.windows.nehody;
      p.textContent = `Na tomto místě: ${d.count(v)} do 40 m za ${d.years} let dohromady (${w ? `${w[0]}–${w[1]}, ` : ''}Policie ČR).`;
      p.hidden = false;
    }).catch(() => {});
  }
  extra.append(el('p', 'livenote', `Jedna nehoda = hlášení řidičů do 200 m a hodiny od sebe, s výjezdem hasičů do 300 m. Zdroj: Waze (otevřená data města Brna)${h ? ', HZS Jihomoravského kraje' : ''}.`));
  card({ kind: 'doprava', title: `Nehoda${c.street ? ` · ${accStreet(c.street)}` : ''}`, rows, extra, lon: c.lon.toFixed(5), lat: c.lat.toFixed(5) });
}
// places linked to Wikipedia that are not buildings (parks, statues, churches drawn as points…)
function wikiPoiAt(sx, sy) {
  const rects = fx.wikiRects || [];
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (sx >= r[0] && sx <= r[2] && sy >= r[1] && sy <= r[3]) return r[4];
  }
  return null;
}
function showWikiPoi(p) {
  if (p[6]) { showPlace(p[6]); return; }
  if (p[5]) { showProject(p[5].proj); fx.marker(p[2], p[3]); return; }
  const story = p[4] && data.stories.find(s => s.n === p[0]);
  if (story) { openStory(story); return; }
  const [lon, lat] = imgToLonLat(p[2], p[3]);
  card({ kind: 'wiki', title: p[0], rows: [], lon: lon.toFixed(5), lat: lat.toFixed(5), wiki: p[1], projects: projByWiki(p[1]), link: placeSlug(wikiPoiName(p)) });
  fx.marker(p[2], p[3]);
}
// closing the card also clears what it highlighted: the building, and a vehicle with its route
$('cardClose').onclick = () => {
  if (location.hash.startsWith('#misto/')) history.replaceState(history.state, '', location.pathname + location.search);
  // a themed route goes from the map with the card (it stayed drawn for ever); only the way back to its list in
  // Objevuj keeps it, there the next stop is chosen
  { const keep = card.keepRoute; card.keepRoute = false; if (!keep && city.route().r) clearRoute(); }
  card.cur = null; card.fromTab = null; stopTour(); $('card').hidden = true; fx.selected = null; fx.area = null; fx.markerOff(); layers.selectVehicle(null); layers.selectStop(null); layers.setLineRoute(null); if (showStop.off) showStop.off(); layers.selectWork(null); cams.select(null); vmo.select(false); tramplan.select(false); air.select(null); lastLine = null; };

// ------------------------------------------------------------------ places and stories
ready.then(() => {
  const ul = $('placeList');
  for (const s of data.stories) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('aria-label', s.n);
    btn.append(el('span', '', s.n), el('small', '', String(s.d || '').split(' · ')[0])); // (the name and, small, what the place is)
    btn.onclick = () => openStory(data.stories.find(x => x.n === s.n) || s);
    li.dataset.k = s.d || ''; li.dataset.t = s.t || ''; // (what the search of Objevuj compares the row by: src/explorefind.js)
    li.append(btn); ul.append(li);
  }
  $('placesCnt').textContent = data.stories.length;
  // apply a shared view only once the map image is open (opening resets the view); first, so that nothing below can
  // keep a link (#misto/…, #@…) from opening (a throw in the lights did, at night, on a first visit: 9. 11. 2026)
  if (opened) restoreFromHash();
  else viewer.addOnceHandler('open', () => setTimeout(restoreFromHash, 0));
  fx.prepareLights();
});
// A few places open with a fitting mood (idea borrowed from Tiny Prague's camera presets).
const PRESETS = {
  'Hvězdárna a planetárium Brno': { night: 100 },
  'Mahenovo divadlo': { night: 100 },
  'Hády': { night: 50 },
  'Arboretum Mendelovy univerzity': { season: 'spring' },
  'Brněnská přehrada': { season: 'summer' },
  'Koupaliště Riviéra': { season: 'summer' },
};
function openStory(s) {
  const p = PRESETS[s.n];
  if (p) {
    if (p.season) setSeason(p.season);
    if (p.night !== undefined) { $('clockLive').checked = false; setNight(p.night); }
  }
  flyTo(s.X, s.Y, Math.max(isPhone() ? 4 : 5, view().z)); // never zoom out when already closer
  fx.marker(s.X, s.Y);
  card({ kind: 'pribeh', title: s.n, text: s.t, rows: [['Co to je', s.d]], lon: s.lon, lat: s.lat, wiki: s.w, projects: projByWiki(s.w), link: placeSlug(s.n), read: [s.d && `${s.d.replace(/ · /g, ', ')}.`, s.t].filter(Boolean).join('\n') });
  if (matchMedia('(max-width: 640px)').matches) setPanelOpen(false);
}

// ------------------------------------------------------------------ search
let index = null;
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ALIASES = Object.fromEntries(Object.entries(ALIASES0).filter(([k]) => k !== '_'));
async function loadIndex() {
  if (index) return index;
  const d = await load('search.json');
  index = [];
  for (const s of data.stories) index.push({ n: s.n, k: 'místo', X: s.X, Y: s.Y, story: s });
  for (const [n, k, X, Y] of d.p) index.push({ n, k, X, Y });
  for (const [n, k, X, Y] of d.s) index.push({ n, k, X, Y });
  for (const [n, k, X, Y] of d.a) index.push({ n, k, X, Y });
  // districts, quarters and localities (the labels of the map): found by name, shown from above
  for (const l of data.labels || []) index.push({ n: l.n, k: l.r === 1 ? 'čtvrť' : l.r === 2 ? 'část města' : 'lokalita', X: l.X, Y: l.Y, far: l.r === 1 ? 0.3 : l.r === 2 ? 0.6 : 1 });
  // the proposals of Dáme na vás (the city-wide ones have no position: the card opens without a flight)
  await paro.load(); paro.positions();
  for (const p of paro.data.items) if (paro.shown(p) || p.city) index.push({ n: p.n, k: p.city ? 'návrh Dáme na vás · celé Brno' : 'návrh Dáme na vás', X: p.city ? NaN : p.X, Y: p.city ? NaN : p.Y, paro: p });
  // other names of a place (tools/data/search-aliases.json): the same place once more under that name; found by it, shown
  // under its own name
  for (const [n, list] of Object.entries(ALIASES)) {
    const it = index.find(o => o.n === n && o.story) || index.find(o => o.n === n);
    if (it && Array.isArray(list)) for (const a of list) index.push({ ...it, q0: a });
  }
  for (const it of index) it.q = norm(it.q0 || it.n);
  return index;
}
// How close a found thing is shown (z: 2 = one screen pixel per metre): a house or an address close enough to tell it
// from its neighbours, a church or a museum a little less, a street as a whole, a district or a quarter from above
// (the phone shows a third of the width of a desktop window, so it flies a step less close)
function zoomFor(it) {
  if (it.far) return it.far;
  const phone = isPhone();
  if (it.k === 'ulice') return phone ? 1.2 : 2;
  if (it.k === 'adresa') return phone ? 6 : 8;
  return phone ? 5 : 6;
}
let results = [], resSel = 0; // (resSel: the result the arrows have chosen, Enter opens it)
function listResults() {
  $('results').replaceChildren(...results.flatMap((it, i) => {
    const out = [];
    // (the offer under the empty field, src/moje.js suggest: a heading above each of its two lists, "Smazat" beside
    // the one of what was searched for lately)
    if (it.head) {
      const h = document.createElement('li'); h.className = 'res-head';
      const s = document.createElement('span'); s.textContent = it.head; h.append(s);
      if (it.clear) {
        const c = document.createElement('button'); c.type = 'button'; c.className = 'res-clear'; c.textContent = 'Smazat';
        c.title = 'Zapomenout naposledy hledané (jsou uložené jen v tomto prohlížeči)';
        c.onmousedown = e => e.preventDefault(); // (the field keeps the caret)
        c.onclick = () => { it.clear(); search(''); };
        h.append(c);
      }
      out.push(h);
    }
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    if (i === 0 && (!(it.moje || it.again) || document.activeElement === $('q'))) b.classList.add('on'); // (the row Enter takes; the offer standing there without the caret marks none)
    const span = document.createElement('span'); span.textContent = it.n;
    const small = document.createElement('small'); small.textContent = it.k;
    b.append(span, small);
    b.onclick = () => pick(it);
    li.append(b);
    out.push(li);
    return out;
  }));
}
const offerOn = () => !$('q').value.trim() && (document.activeElement === $('q') || (!isPhone() && !openTab && !panelShut()));
function offer() {
  if (!moje || $('q').value.trim()) return; // (something typed: its results stand there)
  results = offerOn() ? moje.suggest() : []; resSel = 0; $('noResults').hidden = true;
  listResults();
}
async function search(q) {
  const ul = $('results');
  const nq = norm(q.trim());
  if (!nq && moje) { offer(); return; }
  if (nq.length < 2) { ul.replaceChildren(); results = []; $('noResults').hidden = true; return; }
  const idx = await loadIndex();
  const starts = [], inner = [];
  for (const it of idx) {
    const p = it.q.indexOf(nq);
    if (p === 0) starts.push(it); else if (p > 0 && (it.q[p - 1] === ' ' || it.q[p - 1] === '.' || nq.length > 3)) inner.push(it);
    if (starts.length > 20) break;
  }
  // one result per place: the same name within ~150 m is a duplicate (e.g. a story and the building)
  const uniq = [];
  // (by the name shown, not by what was matched: an alias "Petrov" must not hide the cathedral behind the street Petrov)
  for (const it of [...starts, ...inner]) { if (!uniq.some(u => u.n === it.n && Math.hypot(u.X - it.X, (u.Y - it.Y) * 2) < 150 * GEO.A)) uniq.push(it); if (uniq.length >= 8) break; }
  // the whole name typed: that place first, and a district or a street before a building of the same name
  // ("Bystrc" is the quarter, "Česká" the street); the rest keep their order
  const rank = it => (it.q !== nq ? 9 : it.far ? 0 : it.k === 'ulice' ? 1 : 2);
  uniq.sort((a, b) => rank(a) - rank(b));
  results = uniq; resSel = 0;
  $('noResults').hidden = !!results.length;
  if (!results.length) $('noResults').textContent = `Nic jsem nenašel pro „${q.trim()}“. Hledání zná ulice, adresy, čtvrti a zajímavá místa.`;
  listResults();
}
function pick(it, again = false) {
  if (it.moje) { const m = it.moje; $('q').blur(); offer(); moje.open(m); return; } // (a thing kept in Moje, offered by the empty field: the offer stays on a computer, goes on a phone)
  if (it.again) { pickAgain(it.again); return; } // (searched for lately, offered by the empty field)
  if (!again) track('Hledání', { dotaz: $('q').value.toLowerCase(), vysledek: it.story ? 'pribeh' : it.paro ? 'paro' : it.k });
  // (kept among what was searched for lately, src/moje.js: the name, the kind and the place)
  if (moje) { const ll = Number.isFinite(it.X) ? imgToLonLat(it.X, it.Y) : null; moje.searched({ n: it.n, k: it.k, ...(ll ? { la: +ll[1].toFixed(5), lo: +ll[0].toFixed(5) } : {}) }); }
  // (found by typing: the results go and the name stays in the field; opened again from the offer under the empty
  // field: the field stays empty and the offer stands, as with a thing kept)
  if (again) $('q').blur();
  else { $('results').replaceChildren(); results = []; $('noResults').hidden = true; $('q').value = it.n; }
  card.fromSearch = Date.now(); // the card opened from the search keeps the name in the field
  if (it.story) { openStory(it.story); return; }
  if (it.paro) { showParo(it.paro, true); return; }
  flyTo(it.X, it.Y, zoomFor(it));
  showFound(it);
  if (matchMedia('(max-width: 640px)').matches) setPanelOpen(false);
}
// a result searched for lately, opened again: the result of that name and kind in the search of today (the nearest to
// where it was, should there be more), opened as the search would; gone from the search, its place with a plain card
async function pickAgain(r) {
  moje.again();
  const idx = await loadIndex(), at = Number.isFinite(r.la) ? layers.llToImg(r.lo, r.la) : null;
  let best = null, bd = Infinity;
  for (const it of idx) {
    if (it.n !== r.n || it.k !== r.k) continue;
    const d = at && Number.isFinite(it.X) ? Math.hypot(it.X - at[0], (it.Y - at[1]) * 2) : 0;
    if (d < bd) { bd = d; best = it; }
  }
  if (!best && at) best = { n: r.n, k: r.k, X: at[0], Y: at[1] };
  if (best) pick(best, true); else toast('Tohle místo už v hledání není.');
}
// the card of a street, an address or a place of the search (also from a shared link: part h=lat,lon,name)
function showFound(it) {
  fx.marker(it.X, it.Y);
  const [lon, lat] = imgToLonLat(it.X, it.Y);
  // (a street: when it is swept next, src/cisteni.js; up to three dates)
  const sw = it.k === 'ulice' && CISTENI_ON ? cisteni.street(it.n).slice(0, 3) : [];
  card({ kind: 'hledani', title: it.n, rows: [['Typ', cap(it.k)], ['Blokové čištění', sw.map(o => `${cleanWhen(o)}${o.n !== it.n ? ` (${o.n.replace(it.n, '').replace(/^\s*(v úseku|-|–)\s*/, '').trim() || o.n})` : ''}`).join('; ')]], lon: lon.toFixed(5), lat: lat.toFixed(5), part: `h=${lat.toFixed(5)},${lon.toFixed(5)},${encodeURIComponent(it.n)}` });
}
let st;
$('q').addEventListener('input', e => { clearTimeout(st); st = setTimeout(() => search(e.target.value), 120); });
$('q').addEventListener('focus', () => { loadIndex(); if (moje && !$('q').value.trim()) search(''); });
// (the offer of Moje under the empty field goes when the field is left, a moment later so that a click on it still counts)
$('q').addEventListener('blur', () => setTimeout(() => { if (moje && !$('q').value.trim() && document.activeElement !== $('q') && !$('results').contains(document.activeElement)) offer(); }, 250));
$('q').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const bs = [...$('results').querySelectorAll('button:not(.res-clear)')]; // (not "Smazat" of a heading: the arrows walk the rows)
    if (!bs.length) return;
    e.preventDefault();
    resSel = (resSel + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length;
    bs.forEach((b, i) => b.classList.toggle('on', i === resSel));
    bs[resSel].scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'Enter') { if (results[resSel] || results[0]) pick(results[resSel] || results[0]); else if ($('q').value.trim()) track('Hledání', { dotaz: $('q').value.toLowerCase(), vysledek: 'nic' }); }
  if (e.key === 'Escape') { $('results').replaceChildren(); $('noResults').hidden = true; }
});

// ------------------------------------------------------------------ seasons
let seasonBusy = 0;
// buttons, snow option and effects of a season (the map tiles are switched in setSeason)
function seasonUi(s) {
  document.querySelectorAll('[data-s]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === s)));
  const snow = document.querySelector('[data-w="snow"]');
  const snowOk = s === 'autumn' || s === 'winter';
  snow.disabled = !snowOk;
  if (!snowOk && state.weather === 'snow') setWeather('clear');
  fx.setSeason(s);
  lookUi();
}
function setSeason(s, immediate = false) {
  if (!SEASONS.includes(s)) return;
  state.season = s;
  seasonUi(s);
  const ticket = ++seasonBusy;
  const old = viewer.world.getItemAt(0);
  if (old && old.source && String(old.source.tilesUrl || '').includes(`/tiles/r${ROT}/${tilePath(s)}/`)) return;
  // the viewer is still opening, with this very season (the saved summer look sets it before the first tiles come): nothing to add
  if (!old && String(viewer.tileSources || '').includes(`/tiles/r${ROT}/${tilePath(s)}/`)) return;
  viewer.addTiledImage({
    tileSource: tilesUrl(s),
    index: viewer.world.getItemCount(),
    opacity: 1,
    success: ev => {
      const item = ev.item;
      const done = () => {
        if (ticket !== seasonBusy) { viewer.world.removeItem(item); return; }
        // everything but the new season goes (the old season, and the detail layer, which detailReset lays back
        // over the new one in its colours)
        for (let i = viewer.world.getItemCount() - 1; i >= 0; i--) { const it = viewer.world.getItemAt(i); if (it !== item) viewer.world.removeItem(it); }
        viewer.viewport.maxZoomPixelRatio = klidOn ? 4 / KLID_F : 4; // (the same closest zoom over the finer calm tiles)
        detailReset(); uzlyReset();
      };
      if (immediate || item.getFullyLoaded()) done();
      else item.addOnceHandler('fully-loaded-change', done);
    },
  });
}
// choosing a season by hand switches off 'as in Brno now'
document.querySelectorAll('[data-s]').forEach(b => (b.onclick = () => { track('Nástroj', { nastroj: 'rocni-obdobi', hodnota: b.dataset.s }); $('clockLive').checked = false; setSeason(b.dataset.s); }));

// ------------------------------------------------------------------ time of day
function setNight(v) {
  state.night = v / 100;
  $('night').value = v;
  fx.setNight(state.night);
  lookUi();
  dayUi();
}
$('night').addEventListener('input', e => { $('clockLive').checked = false; setDayLock(false, true); setNight(+e.target.value); });
$('night').addEventListener('change', e => track('Nástroj', { nastroj: 'denni-doba', hodnota: e.target.value >= 75 ? 'noc' : e.target.value >= 25 ? 'soumrak' : 'den' })); // (once, when the slider is let go)
// ------------------------------------------------------------------ the look chip and the day switch
// Whenever the map does not look as Brno does now, a chip above the map says what it shows and brings "now" back with
// one button: a clear summer day, daylight held at night, a look set by hand in Vzhled. While it is dark in Brno and
// the map follows it, the same chip offers "Ukázat den": the real season, weather, clock and live data stay, only the
// map is lit up. (A previewed forecast hour has its own pill; a datová mapa holds its own daylight.)
function lookChip() {
  const c = $('lookChip');
  if (!c) return;
  const live = $('clockLive').checked && $('liveWeather').checked, summer = isSummerLook(), dark = state.night > 0;
  let text = '', btn = 'Zpět na teď', act = 'now';
  if (!$('fcPill').hidden || state.datamap || klidOn) text = '';
  else if (isNoonLook()) text = '☀ Vzhled: poledne a jasno';
  else if (summer) text = '☀ Vzhled: jasný letní den';
  else if (dayLock && live) text = '☀ Vzhled: den místo noci';
  else if (!live) text = 'Vzhled nastavený ručně';
  else if (dark) { text = state.night >= 0.5 ? '☾ V Brně je tma' : '☾ V Brně je šero'; btn = 'Ukázat den'; act = 'day'; }
  c.hidden = !text; c.dataset.act = act;
  $('lookChipText').textContent = text; $('lookChipBtn').textContent = btn;
  c.title = act === 'day' ? 'Kliknutím ukážete mapu za denního světla. Roční období, počasí, čas i živá data zůstanou skutečné.' : 'Mapa teď nevypadá jako Brno v tuto chvíli. Čas, MHD, doprava i počasí v číslech jsou dál skutečné.';
  // the same two looks as buttons in Vzhled
  // the time of day as four chips: the one nearest to what the map shows is lit
  const tbs = [...document.querySelectorAll('#times [data-n]')], nv = state.night * 100;
  const near = tbs.reduce((a, b) => (Math.abs(+b.dataset.n - nv) < Math.abs(+a.dataset.n - nv) ? b : a), tbs[0]);
  tbs.forEach(b => b.setAttribute('aria-pressed', String(b === near)));
  // on top of Vzhled: what the map shows (season, time of day, weather) and whether that is Brno right now; the one
  // button under it sets a sunny summer day from "now" and brings "now" back from anything else
  const now = live && !dayLock, nb = $('lookNowBtn');
  const sb = document.querySelector(`#seasons [data-s="${state.season}"]`), wb = document.querySelector(`#weather [data-w="${state.weather}"]`);
  $('lookWhat').textContent = [sb && sb.textContent, near && near.textContent, wb && wb.textContent].filter(Boolean).join(', ').toLowerCase().replace(/^./, c => c.toUpperCase());
  $('lookWhy').textContent = now ? 'jak je právě teď v Brně' : state.datamap ? 'datová mapa drží denní světlo' : 'živá data jsou dál skutečná';
  nb.title = now ? 'Nastaví léto, poledne a jasno. Čas, MHD, doprava i počasí v číslech zůstanou skutečné.' : 'Roční období, denní doba a počasí zase podle skutečnosti v Brně.';
  $('lookNote').classList.toggle('manual', !now);
  nb.dataset.mode = now ? 'summer' : 'now'; nb.disabled = !!state.datamap && !now;
  nb.textContent = now ? '☀ Letní slunečný den' : '↺ Jako teď v Brně';
  // … and the Vzhled tab tells the state (on a phone it stands in for the chip, which would lie over the small map):
  // a moon while the map is dark, a yellow mark while it does not look as Brno does now
  const tab = document.querySelector('#tabs [data-tab="look"]'), ti = tab && tab.querySelector('.ti');
  if (tab) {
    tab.classList.toggle('alt', !!text && act === 'now');
    const ico = dark ? 'moon' : 'sun';
    if (ti.dataset.px !== ico || !ti.querySelector('svg')) { ti.dataset.px = ico; ti.innerHTML = pxIcon(ico); }
    tab.title = text && act === 'now' ? `${text.replace(/^\S+ /, '')}: tady je cesta zpět na teď` : dark ? 'V Brně je tma: tady jde ukázat mapu za denního světla' : '';
  }
  placeTop();
}
function lookNow() {
  lookFromLink = false;
  track('Nástroj', { nastroj: 'zpet-na-ted', hodnota: lookUi.state || '' });
  if (dayLock) setDayLock(false, true);
  backToNow();
}
function dayUi() { lookChip(); }
function setDayLock(on, quiet = false) {
  dayLock = on;
  if (!lookFromLink) try { if (on) localStorage.setItem('b2k-day', '1'); else localStorage.removeItem('b2k-day'); } catch { /* private mode */ }
  if (quiet) { dayUi(); return; }
  $('clockLive').checked = true;
  realTime();
}
$('lookChipBtn').onclick = () => {
  lookFromLink = false;
  if ($('lookChip').dataset.act === 'day') { track('Nástroj', { nastroj: 'ukazat-den', hodnota: 'zap' }); setDayLock(true); return; }
  lookNow();
};
$('lookNowBtn').onclick = () => { if ($('lookNowBtn').dataset.mode === 'now') { lookNow(); return; } lookFromLink = false; track('Nástroj', { nastroj: 'porad-leto', hodnota: 'zap' }); setLook('summer'); };
// the time of day chosen by hand (Ráno, Poledne, Večer, Noc) switches off 'as in Brno now', as a season does
document.querySelectorAll('#times [data-n]').forEach(b => (b.onclick = () => {
  track('Nástroj', { nastroj: 'denni-doba', hodnota: { 30: 'rano', 0: 'den', 55: 'soumrak', 100: 'noc' }[b.dataset.n] });
  lookFromLink = false; $('clockLive').checked = false; setDayLock(false, true); setNight(+b.dataset.n);
}));
function realTime() {
  lookUi();
  if (!$('clockLive').checked) return;
  if (state.season !== seasonOf()) setSeason(seasonOf()); // the real season too
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
  const h = now.getHours() + now.getMinutes() / 60;
  const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
  const dayLen = 12.2 + 4.1 * Math.sin(((doy - 80) / 365) * 2 * Math.PI);
  const rise = 12.6 - dayLen / 2, set = 12.6 + dayLen / 2;
  let v;
  if (h >= rise + 1 && h <= set - 1) v = 0;
  else if (h > set - 1 && h < set) v = ((h - (set - 1)) / 1) * 50;
  else if (h >= set && h < set + 1) v = 50 + (h - set) * 50;
  else if (h >= rise - 1 && h < rise) v = 100 - (h - (rise - 1)) * 50;
  else if (h >= rise && h < rise + 1) v = 50 - (h - rise) * 50;
  else v = 100;
  setNight(dayLock ? 0 : Math.round(v));
}
$('clockLive').addEventListener('change', realTime);
$('clockLive').addEventListener('change', e => track('Nástroj', { nastroj: 'jako-ted', hodnota: e.target.checked ? 'zap' : 'vyp' }));
setInterval(realTime, 60000);
if (startLook === 'summer' || startLook === 'noon') $('clockLive').checked = false; // (a saved look: the real time of day must not come first, setLook below finishes it)
seasonUi(state.season);
realTime(); // on by default: the map starts as it is in Brno now

// ------------------------------------------------------------------ weather
function setWeather(w) {
  state.weather = w;
  // with live weather on, no button is 'chosen': the buttons are dimmed and the real state is written below them
  const live = $('liveWeather').checked;
  document.querySelectorAll('[data-w]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.w === w))); // (lit also while the weather is the live one: what the map shows)
  if (!live) $('weatherLiveNote').hidden = true;
  fx.setWeather(w);
  lookUi();
}
// cloud cover for weather chosen by hand: "Jasno" is a truly clear sky, the others keep a few clouds
const manualCloud = w => (w === 'clear' ? 0 : 0.5);
document.querySelectorAll('[data-w]').forEach(b => (b.onclick = () => { track('Nástroj', { nastroj: 'pocasi', hodnota: b.dataset.w }); $('liveWeather').checked = false; liveWeather(); setWeather(b.dataset.w); fx.cloud = manualCloud(b.dataset.w); }));

// ------------------------------------------------------------------ live weather (Open-Meteo)
let weatherTimer = null, weatherAt = 0, weatherRun = () => {};
// the weather tile and the small indicator of a phone with the controls hidden (#miniHud) show the real weather
// whatever the map looks like: with the live weather off (a summer look, Ukázat den, weather chosen by hand) the map
// does not follow it, the tile still does
function paintWeatherTile(w) {
  $('fcTileIcon').textContent = ICON(w.code ?? 1, w.day ?? 1); $('fcTileTemp').textContent = `${Math.round(w.temp)} °C`;
  $('mhWi').textContent = $('fcTileIcon').textContent; $('mhWt').textContent = $('fcTileTemp').textContent; $('miniHud').hidden = false;
}
let tileWxAt = 0;
function tileWeather() {
  if ($('liveWeather').checked || Date.now() - tileWxAt < 9 * 60e3) return;
  tileWxAt = Date.now();
  fetchWeather().then(paintWeatherTile).catch(() => { tileWxAt = 0; });
}
setInterval(tileWeather, 60e3);
async function liveWeather() {
  clearInterval(weatherTimer); weatherTimer = null;
  lookUi();
  tileWeather();
  if (!$('liveWeather').checked) { fx.cloud = manualCloud(state.weather || 'clear'); fx.precip = -1; fx.wind = 0; $('weatherNow').hidden = true; setWeather(state.weather || 'clear'); return; }
  const run = async () => {
    weatherAt = Date.now();
    try {
      const w = await fetchWeather();
      // (the answer came after the live weather was switched off, e.g. a saved look restored at start-up: it must not
      // turn the chosen clear sky back into the real one)
      if (!$('liveWeather').checked) { paintWeatherTile(w); return; }
      fx.cloud = w.cloud; fx.precip = w.precip; fx.wind = w.wind;
      document.querySelector('[data-w="snow"]').disabled = false;
      setWeather(w.kind);
      $('weatherNow').hidden = false;
      $('weatherNow').textContent = `Teď v Brně: ${Math.round(w.temp)} °C, ${w.sky}, oblačnost ${Math.round(w.cloud * 100)} %${w.precip ? `, srážky ${w.precip} mm/h` : ''} · předpověď ›`;
      $('weatherLiveNote').hidden = false;
      $('weatherLiveNote').textContent = `Podle skutečnosti: ${w.sky}, ${Math.round(w.temp)} °C. Tlačítkem přepnete na ruční volbu.`;
      paintWeatherTile(w);
    } catch { $('weatherNow').hidden = false; $('weatherNow').textContent = 'Počasí se teď nenačetlo, zkusím to znovu.'; }
  };
  weatherRun = run;
  await run();
  weatherTimer = setInterval(run, 10 * 60e3);
}
$('liveWeather').addEventListener('change', liveWeather);
$('liveWeather').addEventListener('change', e => track('Nástroj', { nastroj: 'pocasi-zive', hodnota: e.target.checked ? 'zap' : 'vyp' }));
liveWeather();
// ------------------------------------------------------------------ weather forecast panel
// the forecast panel (charts, 16 days, pollen) loads after the map; forecastReady resolves with it
let forecast = null;
const forecastReady = import('./forecast.js').then(({ createForecast }) => (forecast = createForecast({
  base: BASE, el,
  // a forecast hour chosen in the panel: the map shows its clouds, rain / snow and time of day
  onPreview: p => {
    clearInterval(weatherTimer); weatherTimer = null;
    $('liveWeather').checked = false; $('clockLive').checked = false;
    fx.cloud = p.cloud; fx.precip = p.precip; fx.wind = p.wind;
    if (p.kind === 'snow') document.querySelector('[data-w="snow"]').disabled = false;
    setWeather(p.kind); setNight(p.night);
    $('fcPillText').textContent = `Předpověď: ${p.label}`; $('fcPill').hidden = false; lookChip();
  },
  onNow: () => backToNow(),
})));
function backToNow() {
  $('fcPill').hidden = true;
  $('liveWeather').checked = true; $('clockLive').checked = true;
  liveWeather(); realTime();
}
$('fcPillNow').onclick = backToNow;
// ------------------------------------------------------------------ look of the map (the switch at the bottom right)
// "Jako teď": season, time of day and weather as in Brno now. "Pořád léto": a clear summer day, nothing else changes:
// the clock, vehicles, traffic and the weather figures stay live (the picture is a backdrop, like a satellite view).
function isSummerLook() { return !$('clockLive').checked && !$('liveWeather').checked && state.season === 'summer' && state.night === 0 && state.weather === 'clear'; }
// "Poledne a jasno" (the watch beside the clock, 2026-11-12): the real season of today, noon, a clear sky; the clock and
// the live data stay real. (In summer it is the same picture as the summer look.)
function isNoonLook() { return !$('clockLive').checked && !$('liveWeather').checked && state.season === seasonOf() && state.night === 0 && state.weather === 'clear'; }
// (lookUi.ready: the stored look is written only after start-up, so the start-up itself does not wipe it)
function lookUi() {
  if (!$('lookSummer')) return;
  const noon = isNoonLook(), summer = !noon && isSummerLook();
  const live = $('clockLive').checked && $('liveWeather').checked;
  const btn = $('lookSummer');
  lookUi.state = noon ? 'noon' : summer ? 'summer' : live && !dayLock ? 'live' : 'custom';
  btn.dataset.look = lookUi.state;
  btn.setAttribute('aria-pressed', String(lookUi.state !== 'live'));
  btn.title = lookUi.state === 'live'
    ? 'Mapa vypadá jako Brno právě teď. Kliknutím: poledne a jasno v dnešním ročním období (čas, MHD, doprava i počasí v číslech zůstanou skutečné).'
    : `${noon ? 'Vzhled: poledne a jasno v dnešním ročním období.' : summer ? 'Vzhled: jasný letní den.' : 'Vzhled nastavený ručně.'} Kliknutím zpět na Brno právě teď.`;
  btn.setAttribute('aria-label', btn.title);
  // (the same watch in the small indicator of a phone with the controls hidden)
  const mb = $('mhL'); mb.dataset.look = btn.dataset.look; mb.setAttribute('aria-pressed', btn.getAttribute('aria-pressed')); mb.title = btn.title; mb.setAttribute('aria-label', btn.title);
  tickClock(); // the hands of the watch follow the state
  lookChip();
  if (lookUi.ready && !lookFromLink) try { if (noon || summer) localStorage.setItem('b2k-look', noon ? 'noon' : 'summer'); else localStorage.removeItem('b2k-look'); } catch { /* private mode */ }
}
function setLook(mode) {
  if (mode !== 'summer' && mode !== 'noon') { backToNow(); return; }
  clearInterval(weatherTimer); weatherTimer = null;
  $('fcPill').hidden = true;
  if (dayLock) setDayLock(false, true);
  $('clockLive').checked = false; $('liveWeather').checked = false;
  setSeason(mode === 'noon' ? seasonOf() : 'summer'); setNight(0);
  fx.cloud = 0; fx.precip = -1; fx.wind = 0;
  $('weatherNow').hidden = true;
  setWeather('clear');
  // said once: the picture changed, the live data did not
  const msg = mode === 'noon' ? 'Mapa teď ukazuje poledne a jasno v dnešním ročním období. Čas, MHD, doprava i počasí v číslech jsou dál skutečné. Dalším kliknutím na hodinky zpět.' : 'Mapa teď vypadá jako letní den. Čas, MHD, doprava i počasí v číslech jsou dál skutečné.';
  const key = mode === 'noon' ? 'b2k-noon-toast' : 'b2k-look-toast';
  try {
    if (!localStorage.getItem(key)) { toast(msg, 5000); localStorage.setItem(key, '1'); }
  } catch { toast(msg, 5000); }
}
$('lookSummer').onclick = () => {
  if (klidOn) { toast('Klidná mapa je vždy jasný den. Vzhled mapy se vrátí, až ji vypnete ve Vrstvách.', 5000); return; }
  lookFromLink = false;
  if (lookUi.state === 'live') { track('Nástroj', { nastroj: 'poledne-jasno', hodnota: 'zap' }); setLook('noon'); }
  else { track('Nástroj', { nastroj: 'poledne-jasno', hodnota: 'vyp' }); lookNow(); }
};
$('mhL').onclick = $('lookSummer').onclick;
// the chosen look survives a reload (a shared link with its own season or time wins, it is restored later)
try { const l = localStorage.getItem('b2k-look'); if (l === 'summer' || l === 'noon') setLook(l); } catch { /* private mode */ }
lookUi.ready = true; lookUi();
// the weather tile opens a short overview beside the map (now, next hours, 5 days); the full forecast
// with charts, 16 days, pollen, the half-year outlook and ČHMÚ texts is one click further
// (the same pop-up shows Doprava, what = 'dop': src/doprava.js; one of the two at a time)
let fcWhat = 'fc';
function setFcOpen(open, what = 'fc') {
  if (open && ($('fcPop').hidden || fcWhat !== what)) { track('Panel', { co: what === 'dop' ? 'doprava' : 'predpoved' }); $('fcPopBody').scrollTop = 0; }
  fcWhat = what;
  if (!open || what !== 'dop') dopPin = null;
  $('fcPop').hidden = !open;
  if (open) zprWay('fcPop');
  $('fcTile').setAttribute('aria-expanded', String(open && what === 'fc'));
  $('mhW').setAttribute('aria-expanded', String(open && what === 'fc'));
  if ($('mhD')) $('mhD').setAttribute('aria-expanded', String(open && what === 'dop'));
  if ($('dopTile')) $('dopTile').setAttribute('aria-expanded', String(open && what === 'dop'));
  $('fcPop').classList.toggle('dop', what === 'dop');
  $('fcPop').querySelector('.evt-head h2').textContent = what === 'dop' ? 'Doprava v Brně' : 'Počasí v Brně';
  $('fcPop').setAttribute('aria-label', what === 'dop' ? 'Doprava v Brně' : 'Počasí v Brně');
  if (!open) return;
  if (!$('card').hidden) $('cardClose').click();
  if (!$('events').hidden) setEventsOpen(false);
  if (!$('aktual').hidden) setAktOpen(false);
  if (zprOpen()) setZprOpen(false);
  if (isPhone()) setTab(null);
  if (what === 'dop') { doprava.render($('fcPopBody')); return; }
  forecastReady.then(f => { if (fcWhat === 'fc') f.renderShort($('fcPopBody'), openForecastFull); });
}
function openForecast() { setFcOpen(true); }
async function openForecastFull() { track('Panel', { co: 'predpoved-cela' }); setFcOpen(false); $('fcDlg').showModal(); await (await forecastReady).render($('fcBody')); }
$('weatherNow').onclick = openForecast;
$('fcTile').onclick = () => setFcOpen($('fcPop').hidden || fcWhat !== 'fc');
$('mhW').onclick = $('fcTile').onclick; // (the small indicator of a phone with the controls hidden)
if (doprava && $('dopTile')) {
  const tile = $('dopTile');
  tile.onclick = () => setFcOpen($('fcPop').hidden || fcWhat !== 'dop', 'dop');
  doprava.onUpdate(() => {
    tile.hidden = false; document.body.classList.add('has-dop');
    doprava.paintTile(tile);
    if ($('mhD')) { doprava.paintMini($('mhD')); $('miniHud').hidden = false; }
    if (!$('fcPop').hidden && fcWhat === 'dop') doprava.render($('fcPopBody'));
  });
  // (other code closes the pop-up by its hidden attribute; the tile must not stay pressed)
  if ($('mhD')) $('mhD').onclick = tile.onclick;
  new MutationObserver(() => { if ($('fcPop').hidden) { tile.setAttribute('aria-expanded', 'false'); $('mhW').setAttribute('aria-expanded', 'false'); if ($('mhD')) $('mhD').setAttribute('aria-expanded', 'false'); dopPin = null; } }).observe($('fcPop'), { attributes: true, attributeFilter: ['hidden'] });
  setInterval(() => { if (!tile.hidden) { doprava.paintTile(tile); if ($('mhD')) doprava.paintMini($('mhD')); } }, 60e3); // (a file that stops coming turns to "–" after 20 minutes)
  doprava.load();
}
$('fcPopClose').onclick = () => setFcOpen(false);
$('fcClose').onclick = () => $('fcDlg').close();
// ČHMÚ warnings for Brno: a strip at the top and items in the timeline (again when the feed brings a new file)
function renderAlertBar() {
  const al = forecast.alerts();
  const bar = $('alertBar');
  bar.hidden = !al.length;
  if (!al.length) return;
  const a = al[0];
  bar.replaceChildren(el('b', '', `⚠ ${a.event}`), el('span', '', ` – výstraha ČHMÚ pro Brno${al.length > 1 ? ` (+${al.length - 1})` : ''}`));
  bar.onclick = openForecastFull;
}
forecastReady.then(f => f.loadOff()).then(() => { renderAlertBar(); renderEvents(); });
// a feed file was reloaded on a page left open (src/feed.js): the canvas and the lists once more
window.addEventListener('feed-refresh', e => {
  if (e.detail.includes('weather') && forecast) renderAlertBar();
  renderEvents();
  if (!$('aktual').hidden) renderAktualne();
  try { viewer.forceRedraw(); } catch { /* not open yet */ }
});
// a new timetable took the place of the old one on a page left open (src/mhd.js refresh): the numbers of trips held by
// an open stop card, by a vehicle of the timetable or by a ride on one belong to the old timetable, so they are let go
window.addEventListener('mhd-new', () => {
  if (ride != null && !String(ride).startsWith('live-')) stopRide(true);
  if (!$('card').hidden && card.cur && (card.cur.kind === 'zastavka' || card.cur.kind === 'vozidlo')) $('cardClose').onclick();
  try { viewer.forceRedraw(); } catch { /* not open yet */ }
});
layers.traffic.onStatus = t => { $('trafficNow').hidden = false; $('trafficNow').textContent = t; $('trafficNow').title = layers.traffic.tip || ''; renderEvents(); };

// ------------------------------------------------------------------ location corrections
function updateCorrCount() { // [ADMIN]
  if (!ADMIN || !$('corrCount')) return;
  const n = Object.keys(layers.ownCorrections()).length + Object.keys(cams.own()).length + Object.keys(ownFacades()).length;
  $('corrCount').textContent = n ? `Máte ${n} ${n === 1 ? 'opravu' : n < 5 ? 'opravy' : 'oprav'}.` : '';
  $('corrDownload').disabled = !n;
}
if (ADMIN) $('corrDownload').onclick = downloadCorrections; // [ADMIN]
updateCorrCount();

// ------------------------------------------------------------------ events timeline (right column)
function setEventsOpen(open) {
  if (open && $('events').hidden) track('Panel', { co: 'akce' });
  if (open && !$('card').hidden) $('cardClose').click();
  if (open && isPhone()) setTab(null); // on phones one sheet at a time
  if (open) { $('fcPop').hidden = true; $('fcTile').setAttribute('aria-expanded', 'false'); if (!$('aktual').hidden) setAktOpen(false); if (zprOpen()) setZprOpen(false); }
  $('events').hidden = !open;
  if (open) zprWay('events');
  $('evtToggle').setAttribute('aria-pressed', String(open));
  if (open) renderEvents();
}
$('evtToggle').onclick = () => setEventsOpen($('events').hidden);
$('cardBack').onclick = () => { const back = card.fromTab; card.keepRoute = !!back && back.tab === 'explore'; $('cardClose').click(); if (back) backToTab(back); else if (card.backZpr) setZprOpen(true, true); else { zprNav.keep = Date.now(); setEventsOpen(true); } };
// back from a card to the tab it was opened from, scrolled as it was
const TAB_NAMES = { look: 'Vzhled', layers: 'Vrstvy', explore: 'Objevuj', more: 'Více', moje: 'Moje' }; // (moje: the tab of the part "moje", src/moje.js)
function backToTab(from) {
  setTab(from.tab);
  const sb = document.querySelector(`#pane-${from.tab} .sheet-body`);
  if (sb) requestAnimationFrame(() => (sb.scrollTop = from.top));
}
// timeline tabs: traffic (Waze, closures, public transport) / what is on in the city (GO TO BRNO events)
state.evtTab = 'city'; state.evtCat = ''; // (the time range is the one of the layer in the map, state.eventsRange: the list and the map show the same)
// // (the city events first, the traffic one click further)
document.querySelectorAll('#evtTabs [data-t]').forEach(b => (b.onclick = () => {
  state.evtTab = b.dataset.t;
  document.querySelectorAll('#evtTabs [data-t]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  $('evtFilter').hidden = state.evtTab !== 'city';
  renderEvents();
}));
document.querySelectorAll('#evtRange [data-r]').forEach(b => (b.onclick = () => {
  const r = state.eventsRange.includes(b.dataset.r) ? state.eventsRange.replace(b.dataset.r, '') : state.eventsRange + b.dataset.r;
  if (!r) { toast('Aspoň jedno období musí zůstat vybrané'); return; }
  track('Nástroj', { nastroj: 'rozsah-akci', hodnota: r });
  setEventsRange(r);
}));
$('evtCat').onchange = () => { state.evtCat = $('evtCat').value; renderEvents(); };
function renderCityEvents() {
  const ol = $('evtList');
  ol.replaceChildren();
  if (!city.data.events.length) {
    // (asked once: a feed that did not come must not send the list round and round)
    if (renderCityEvents.tried) { ol.append(el('li', 'sep', 'Akce se teď nepodařilo načíst. Zkuste to za chvíli znovu.')); return; }
    ol.append(el('li', 'sep', 'Načítám…'));
    city.load().catch(() => {}).then(() => { renderCityEvents.tried = true; renderEvents(); });
    return;
  }
  renderCityEvents.tried = false;
  if ($('evtCat').options.length <= 1) for (const c of city.categories()) $('evtCat').append(Object.assign(document.createElement('option'), { value: c, textContent: c }));
  const list = city.eventsIn(state.eventsRange, state.evtCat);
  // an offer that runs for more than two weeks (guided tours "until 31. 12." etc.) is a standing offer, not an event
  const longRun = e => (e.to || e.from) - e.from > 14 * 864e5;
  const dated = list.filter(e => !longRun(e)), standing = list.filter(longRun);
  const item = (e, target) => {
    const li = el('li'), b = el('button', 't-event evt-city'); b.type = 'button';
    const txt = el('span', '', e.n);
    const when = e.to && fmtDay(e.to) !== fmtDay(e.from) ? (e.from < dayStart() ? `do ${fmtDay(e.to)}` : `${fmtDay(e.from)} – ${fmtDay(e.to)}`) : fmtDay(e.from);
    txt.append(el('small', 'when', when), el('small', '', [e.cats.join(', '), e.addr].filter(Boolean).join(' · ')));
    b.append(el('span', '', '★'), txt);
    b.onclick = () => { if (e.X != null) { flyTo(e.X, e.Y, Math.max(1.2, view().z)); fx.marker(e.X, e.Y); } card.fromEvents = Date.now(); showEvent(e); };
    li.append(b); target.append(li);
  };
  ol.append(el('li', 'sep', [['t', 'Dnes'], ['w', 'tento týden'], ['l', 'později']].filter(([k]) => state.eventsRange.includes(k)).map(([, n]) => n).join(', ').replace(/^./, c => c.toUpperCase())));
  if (!dated.length) ol.append(el('li', 'sep', 'Žádné akce s konkrétním datem'));
  for (const e of dated.slice(0, 120)) item(e, ol);
  if (standing.length) {
    const li = el('li'), det = el('details', 'evt-standing');
    det.append(el('summary', '', `Stálá nabídka (${standing.length})`));
    const inner = el('ol', 'evt-list');
    for (const e of standing.slice(0, 80)) item(e, inner);
    det.append(inner); li.append(det); ol.append(li);
  }
  ol.append(el('li', 'sep', 'Zdroj: GO TO BRNO (www.gotobrno.cz), otevřená data města Brna'));
}
// ------------------------------------------------------------------ Aktuálně: what is topical in the city right now (right column)
// A short list of notes, each with a date, a title, a line of text, a link and a theme — the layer whose points
// the map lights up while the note is chosen: the icons half again as big with a pulsing ring, drawn at any zoom
// and never folded into a cluster, every other icon half see-through. The notes are a list here for now
// (data/aktualne.json once there are more of them); the texts of the vote follow its phase in data/paro.json.
function aktualneItems() {
  const out = [];
  const pd = paro.data, ph = paro.phase(), v = pd.voting;
  if (v) {
    const n = pd.items.filter(p => paro.shown(p)).length, nc = pd.items.filter(p => p.city).length;
    const endT = new Date(v.end).toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit' });
    const text = ph === 'voting' ? `Hlasování o návrzích participativního rozpočtu běží do ${paroDay(v.end)} ${endT}. Hlasovat může každý s trvalým pobytem v Brně. V mapě je ${plural(n, 'návrh', 'návrhy', 'návrhů')} s místem${nc ? ` a ${plural(nc, 'návrh', 'návrhy', 'návrhů')} pro celé město je v panelu Vrstvy` : ''}.`
      : ph === 'before' ? `Návrhy letošního ročníku jsou v mapě, hlasování začíná ${paroDay(v.start)}.`
      : ph === 'counting' ? `Hlasování skončilo, výsledky budou ${paroDay(v.announcement)}. V mapě jsou všechny návrhy, které šly do hlasování.`
      : `Vítězné projekty letošního hlasování: ${plural(n, 'projekt', 'projekty', 'projektů')} s místem v mapě.`;
    out.push({ id: 'paro', when: ph === 'voting' ? `Hlasování do ${paroDay(v.end)}` : ph === 'before' ? `Od ${paroDay(v.start)}` : ph === 'counting' ? `Výsledky ${paroDay(v.announcement)}` : 'Výsledky', title: `Dáme na vás ${pd.year}: ${ph === 'voting' ? 'hlasujte o nápadech pro Brno' : ph === 'results' ? 'vítězné projekty' : 'návrhy pro Brno'}`, text, focus: 'paro', layer: 'paro', link: [PARO_WEB, ph === 'voting' ? 'Hlasovat na damenavas.cz' : 'damenavas.cz'] });
  }
  // blokové čištění (src/cisteni.js): only on the days it concerns, today (until it is over) or tomorrow
  const cs = CISTENI_ON ? cisteni.summary() : null;
  if (cs && cs.total && (cs.left || cs.tomorrow)) {
    const where = l => (l.length ? ` (${l.slice(0, 6).join(', ')}${l.length > 6 ? ' a další' : ''})` : '');
    out.push({ id: 'clean', when: cs.left ? 'Dnes' : 'Zítra', title: cs.left ? 'Dnes se blokově čistí ulice' : 'Zítra se blokově čistí ulice',
      text: `${cs.left ? `Dnes ${plural(cs.today, 'úsek', 'úseky', 'úseků')}${where(cs.todayParts)}${cs.now ? `, v ${cs.now} se právě čistí` : ''}. ` : ''}${cs.tomorrow ? `Zítra ${plural(cs.tomorrow, 'úsek', 'úseky', 'úseků')}${where(cs.tomorrowParts)}. ` : ''}Auta, která v úseku zůstanou, se odtahují; rozhoduje značení v ulici.`,
      focus: 'clean', layer: 'clean', link: [CISTENI_WEB, 'Plán BKOM'] });
  }
  const ev = city.eventsIn('week').filter(e => e.X != null), today = city.eventsIn('today').filter(e => e.X != null);
  out.push({ id: 'events', when: 'Tento týden', title: 'Akce ve městě', text: ev.length ? `${plural(today.length, 'akce dnes', 'akce dnes', 'akcí dnes')}, ${plural(ev.length, 'akce', 'akce', 'akcí')} do konce týdne s místem v mapě (GO TO BRNO). Lístek kalendáře stojí tam, kde se akce koná.` : 'Načítám akce GO TO BRNO…', focus: 'events', layer: 'events', more: ['Seznam akcí', () => setEventsOpen(true)] });
  return out;
}
function renderAktualne() {
  const ol = $('aktList');
  ol.replaceChildren();
  for (const it of aktualneItems()) {
    const li = el('li', state.focus === it.focus ? 'on' : '');
    li.append(el('span', 'when', it.when), el('h3', '', it.title), el('p', '', it.text));
    const btns = el('div', 'btns');
    if (it.focus) {
      const b = el('button', 'pbtn small', state.focus === it.focus ? 'Zrušit zvýraznění' : 'Zvýraznit v mapě'); b.type = 'button';
      b.setAttribute('aria-pressed', String(state.focus === it.focus));
      b.onclick = () => setFocus(state.focus === it.focus ? null : it.focus);
      btns.append(b);
    }
    if (it.more) { const b = el('button', 'pbtn small', it.more[0]); b.type = 'button'; b.onclick = it.more[1]; btns.append(b); }
    if (it.link) { const a = el('a', 'pbtn small', it.link[1]); a.href = safeUrl(it.link[0]); a.target = '_blank'; a.rel = 'noopener'; btns.append(a); }
    li.append(btns); ol.append(li);
  }
}
// the points of a theme (image coordinates): to see whether any is in view
function focusPoints(f) { try { return FOCUS_KINDS[f] ? FOCUS_KINDS[f].pts() : []; } catch { return []; } }
// Kinds of points a card can highlight (the beacon beside ×, focusButton) or Aktuálně (paro, events): the layer they
// need (switched on), how the chip above the map names them, the tooltip of the button, what the data waits for, the
// points (image coordinates) and, for the layers of other modules (webcams, weather and air stations), the colour of
// the beacon drawn under each of them by fx.top (city.js and paro.js draw their own).
const imgOf = (lon, lat) => layers.llToImg(+lon, +lat);
const smallKind = (k, layer, n, all) => ({ layer, n, all, ready: () => city.loadSmall(), pts: () => { city.positions(); return city.data.small.filter(o => o.k === k && !o.dup && o.X != null).map(o => [o.X, o.Y]); } });
const FOCUS_KINDS = {
  kameny: { layer: 'smStolper', n: 'kameny zmizelých', all: 'Zvýraznit v mapě všechny kameny zmizelých', ready: () => city.kameny(), pts: () => { city.positions(); return city.data.kameny.filter(p => p.X != null).map(p => [p.X, p.Y]); } },
  plaque: smallKind('plaque', 'smPlaque', 'pamětní desky', 'Zvýraznit v mapě všechny pamětní desky'),
  art: smallKind('art', 'smArt', 'sochy, pomníky a kašny', 'Zvýraznit v mapě všechny sochy, pomníky a kašny'),
  cross: smallKind('cross', 'smCross', 'kříže a boží muka', 'Zvýraznit v mapě všechny kříže a boží muka'),
  tree: smallKind('tree', 'smTree', 'památné stromy', 'Zvýraznit v mapě všechny památné stromy'),
  fountain: smallKind('fountain', 'pitka', 'pítka', 'Zvýraznit v mapě všechna pítka'),
  view: smallKind('view', 'smView', 'vyhlídky', 'Zvýraznit v mapě všechny vyhlídky'),
  pool: smallKind('pool', 'smPool', 'koupaliště a bazény', 'Zvýraznit v mapě všechna koupaliště a bazény'),
  ...(HASICI_ON ? { hasici: { layer: 'hasici', n: 'výjezdy hasičů', all: 'Zvýraznit v mapě všechny výjezdy hasičů', ready: () => (state.zasahRange === 'w' ? Promise.all([hasici.load(), hasici.loadWeek()]) : hasici.load()), beacon: '#d8362a', pts: () => { hasici.positions(); const now = hasici.list().filter(o => o.X != null && hasici.isOpen(o)).map(o => [o.X, o.Y]); return state.zasahRange === 'w' ? [...now, ...hasici.weekPts()] : hasici.list().filter(o => o.X != null).map(o => [o.X, o.Y]); } } } : {}),
  ...(POLICIE_ON ? { policie: { layer: 'policie', n: 'případy policie za týden', all: 'Zvýraznit v mapě všechny případy policie za týden', ready: () => policie.load(), beacon: '#b3122e', pts: () => policie.list().filter(g => g.X != null).map(g => [g.X, g.Y]) } } : {}),
  nehody: { layer: 'jams', n: 'dnešní nehody', all: 'Zvýraznit v mapě všechny dnešní nehody', ready: () => waitFor(() => layers.traffic.data), beacon: '#f08a3c', pts: () => ((layers.traffic.data && layers.traffic.data.nehody && layers.traffic.data.nehody.items) || []).map(c => imgOf(c.lon, c.lat)) },
  vykopy: { layer: 'works', n: 'výkopy a zábory', all: 'Zvýraznit v mapě všechny výkopy a zábory', ready: () => waitFor(() => layers.workPts().length), beacon: '#f08a3c', pts: () => layers.workPts() },
  uzavirky: { layer: 'closures', n: 'uzavírky', all: 'Zvýraznit v mapě všechny uzavírky', ready: () => waitFor(() => layers.clos()), beacon: '#d8362a', pts: () => ((layers.clos() || {}).items || []).filter(c => c.p && c.p.length >= 2).map(c => { const i = Math.floor(c.p.length / 4) * 2; return imgOf(c.p[i], c.p[i + 1]); }) },
  vyluky: { layer: 'mhdOutages', n: 'výluky a odklony MHD', all: 'Zvýraznit v mapě všechny výluky a odklony MHD', ready: () => city.load(), beacon: '#e8a42a', pts: () => city.data.outages.filter(o => o.lon != null && nowIn(o)).map(o => imgOf(o.lon, o.lat)) },
  ...(VODA_ON ? { voda: { layer: 'voda', n: 'havárie a odstávky vody', all: 'Zvýraznit v mapě havárie a odstávky vody', ready: () => (state.zasahRange === 'w' ? Promise.all([voda.load(), voda.loadWeek()]) : voda.load()), beacon: '#2b62c4', pts: () => { const l = voda.list().filter(o => o.X != null); return state.zasahRange === 'w' ? [...l.filter(o => voda.stateOf(o) !== 'skoncilo').map(o => [o.X, o.Y]), ...voda.weekPts()] : l.map(o => [o.X, o.Y]); } } } : {}),
  ...(PARKING_ON ? { parking: { layer: 'parking', n: 'parkovací domy', all: 'Zvýraznit v mapě všechny parkovací domy a parkoviště', ready: () => parking.load(), beacon: '#2b62c4', pts: () => { parking.positions(); return parking.data.items.filter(o => o.X != null).map(o => [o.X, o.Y]); } } } : {}),
  // (the railway stations: the beacon stands on the station building, where the sign is)
  ...(VLAKY_ON ? { vlaky: { layer: 'vlaky', n: 'nádraží', all: 'Zvýraznit v mapě všechna nádraží', ready: async () => { await needVlaky(); await vlaky.load(); }, beacon: '#5b8def', pts: () => { vlaky.positions(); return vlaky.data.stations.filter(o => o.X != null).map(o => [o.X, o.Y]); } } } : {}),
  ...(CISTENI_ON ? { clean: { layer: 'clean', n: 'blokové čištění dnes a zítra', all: 'Zvýraznit v mapě úseky, které se čistí dnes a zítra', ready: () => cisteni.load(), beacon: '#12a0ff', pts: () => cisteni.points() },
    // (the next day with a cleaning, from the news: the range of the layer grows to hold it)
    cleanNext: { layer: 'clean', n: 'příští blokové čištění', all: 'Zvýraznit v mapě úseky příštího blokového čištění', ready: async () => { await cisteni.load(); const d = cisteni.nextDay(), need = d == null || d <= 1 ? 'd' : d <= 7 ? 'w' : 'm'; if ('dwma'.indexOf(state.cleanRange) < 'dwma'.indexOf(need)) setCleanRange(need); }, beacon: '#12a0ff', pts: () => cisteni.pointsNext() } } : {}),
  paro: { layer: 'paro', n: 'návrhy Dáme na vás', all: 'Zvýraznit v mapě všechny návrhy Dáme na vás', ready: () => paro.load(), pts: () => { paro.positions(); return paro.data.items.filter(p => paro.shown(p) && p.X != null).map(p => [p.X, p.Y]); } },
  events: { layer: 'events', n: 'akce tento týden', all: 'Zvýraznit v mapě všechny akce tohoto týdne', ready: () => city.load(), pts: () => city.eventsIn('week').filter(e => e.X != null).map(e => [e.X, e.Y]) },
  cams: { layer: 'cams', n: 'webkamery', all: 'Zvýraznit v mapě všechny webkamery', ready: () => cams.load(), beacon: '#7fc8f0', pts: () => cams.list().map(g => imgOf(...cams.posOf(g, (g.views || [g])[0]))) },
  meteo: { layer: 'meteo', n: 'meteostanice', all: 'Zvýraznit v mapě všechny meteostanice', ready: () => meteo.load(), beacon: '#f0f2ea', pts: () => meteo.stations().map(s => imgOf(s.lon, s.lat)) },
  ...(DOPRAVA_ON ? {
    kolony: { layer: 'jams', n: 'kolony', all: 'Zvýraznit v mapě všechny kolony', ready: () => doprava.load(), beacon: '#d8362a', pts: () => doprava.jamPts().map(([lon, lat]) => imgOf(lon, lat)) },
    zpozdene: { layer: 'mhd', n: 'vozy MHD zpožděné 10+ min', all: 'Zvýraznit v mapě vozy MHD zpožděné 10 minut a víc', ready: () => { if (state.mhdMode !== 'live') setMhdMode('live'); }, pts: () => layers.lineVehicles('@late10').map(m => [m.X, m.Y]) },
  } : {}),
  air: { layer: 'air', n: 'stanice kvality ovzduší', all: 'Zvýraznit v mapě všechny stanice kvality ovzduší', ready: () => air.load(), beacon: '#50f0e6', pts: () => air.stations().map(s => imgOf(s.lon, s.lat)) },
};
// the vehicles of one line of public transport (the beacon in a vehicle card): a kind made for that line, 'linka:4'
const LINE_KIND = { tram: 'tramvajové', trol: 'trolejbusové', bus: 'autobusové' };
function lineFocusButton(line, type, at) {
  return focusButton(lineKind(line, type), at);
}
// (made on demand: from a vehicle card, or from a shared link #@…&f=linka:4, which does not know the type)
function lineKind(line, type) {
  const f = `linka:${line}`;
  FOCUS_KINDS[f] ||= {
    layer: 'mhd', n: `vozy linky ${line}`, all: `Zvýraznit v mapě všechny ${LINE_KIND[type] || ''} vozy linky ${line}`.replace('  ', ' '),
    ready: () => (state.mhdMode === 'live' ? null : layers.mhd.load()), pts: () => layers.lineVehicles(line).map(m => [m.X, m.Y]),
  };
  return f;
}
let focusPts = []; // the points of the highlighted kind, for the beacons of fx.top (set by setFocus)
const focusLayer = f => (FOCUS_KINDS[f] ? FOCUS_KINDS[f].layer : f);
// the cheap beacon (a highlight of many points): one ring growing and fading on the ground, a dark edge under the colour
function beaconRing(ctx, x, y, t, col, r = 22, seed = 0) {
  const ph = ((t + seed * 173) / 1500) % 1, rr = r * (0.3 + 0.9 * ph);
  ctx.globalAlpha = 1 - ph;
  ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.55, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#161d2b'; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
}
const waitFor = async get => { for (let i = 0; i < 30 && !get(); i++) await new Promise(r => setTimeout(r, 150)); }; // (a file that comes when first asked for)
const nowIn = o => { const n = Date.now(); return (!o.from || o.from <= n) && (!o.to || o.to >= n); };
// the view that holds the points of a theme: the core with nine in ten of them (5–95 % on each axis), so that a few far
// ones (Žebětín, Líšeň) do not shrink the centre to a stamp; they keep their beacons just off the screen. A little
// margin; the open card covers the right side on a desktop, the tiles the bottom on a phone.
function fitPoints(pts, mx = 1.2, my = 1.25) { // (mx, my: the room around the points, across and down)
  if (!pts.length) return;
  const q = (a, f) => { const s = [...a].sort((m, n) => m - n); return s[Math.min(s.length - 1, Math.max(0, Math.round(f * (s.length - 1))))]; };
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), cut = pts.length >= 20 ? 0.05 : 0;
  const x0 = q(xs, cut), x1 = q(xs, 1 - cut), y0 = q(ys, cut), y1 = q(ys, 1 - cut);
  const cw = viewer.container.clientWidth, ch = viewer.container.clientHeight, side = !$('card').hidden && !isPhone() ? 380 : 0;
  const hh = isPhone() ? ch * 0.55 : ch, up = isPhone() ? (ch - hh) / 2 - 40 : 0; // (phone: the upper part of the screen, above the tiles)
  const k = Math.min((cw - side) / Math.max(200, (x1 - x0) * mx), hh / Math.max(200, (y1 - y0) * my));
  flyTo((x0 + x1) / 2 + side / 2 / k, (y0 + y1) / 2 + up / k, Math.min(k * S, 4));
}
// from a card: the place stays in the middle and the map zooms out only until five other places of the kind are on the
// screen (nothing changes when they already are); never further out than the city
function fitNear(pts, X, Y, want = 5) {
  const v = view(), cw = viewer.container.clientWidth, ch = viewer.container.clientHeight;
  const side = !$('card').hidden && !isPhone() ? 380 : 0, hh = isPhone() ? ch * 0.55 : ch;
  const others = pts.filter(([px, py]) => Math.hypot(px - X, py - Y) > 3);
  const onScreen = others.filter(([px, py]) => { const x = v.ox + px * v.k, y = v.oy + py * v.k; return x >= 20 && y >= 60 && x <= cw - side - 20 && y <= (isPhone() ? hh : ch) - 20; }).length;
  if (onScreen >= want || !others.length) return;
  // the distance (in each axis) of the want-th nearest place, with a margin: the half-size of the view needed
  const near = others.map(([px, py]) => [Math.abs(px - X), Math.abs(py - Y)]).sort((a, b) => Math.hypot(...a) - Math.hypot(...b)).slice(0, want);
  const dx = Math.max(...near.map(n => n[0])) * 1.25 + 30, dy = Math.max(...near.map(n => n[1])) * 1.3 + 30;
  const k = Math.min(v.k, ((cw - side) / 2) / dx, (hh / 2) / dy);
  flyTo(X + side / 2 / k, Y + (isPhone() ? (ch - hh) / 2 - 40 : 0) / k, Math.max(k * S, 0.15));
}
async function setFocus(f, { fit = false, at = null, keepView = false } = {}) { // (keepView: a shared link brings its own view)
  state.focus = f;
  layers.setFocusLine(f && f.startsWith('linka:') ? f.slice(6) : f === 'zpozdene' ? '@late10' : null); // (its vehicles above the veil, with beacons: layers.js; '@late10' = every vehicle 10+ min late)
  if (f) {
    // the layer of the theme on (the switch in Vrstvy follows), and a view with its points when none is on the screen
    // (from a card: always the view with all of them, that is what the button is for)
    const layer = focusLayer(f), box = $(`lay-${layer}`);
    if (box && !box.checked) setLayer(layer, true);
    if (FOCUS_KINDS[f]) await FOCUS_KINDS[f].ready();
    if (state.focus !== f) return;
    const v = view(), cw = viewer.container.clientWidth, ch = viewer.container.clientHeight;
    const pts = (focusPts = focusPoints(f));
    if (fit && at) fitNear(pts, at[0], at[1]);
    else if (fit) fitPoints(pts);
    else if (!keepView && pts.length && !pts.some(([X, Y]) => { const x = v.ox + X * v.k, y = v.oy + Y * v.k; return x >= 0 && y >= 0 && x <= cw && y <= ch; })) goHome();
  }
  focusChip(f);
  if (!f) focusPts = [];
  fx.setFocusVeil(!!f); // the map under the icons fades too (fx.js: the tiles lose colour, a veil under the icons)
  document.querySelectorAll('.focus-btn').forEach(b => paintFocusBtn(b, b.dataset.focus === f));
  $('aktToggle').toggleAttribute('data-focus', !!f);
  $('aktToggle').title = f ? 'Aktuálně: v mapě je zvýrazněné téma (tady se zvýraznění ruší)' : 'Aktuálně: co je v Brně právě teď aktuální, se zvýrazněním v mapě';
  if (!$('aktual').hidden) renderAktualne();
  if (zprOpen()) renderZpravy();
}
// the chip above the map while a theme is highlighted: what is highlighted, × cancels it (also after the card is closed)
function focusChip(f) {
  let c = $('focusChip');
  if (!f) { if (c) c.hidden = true; placeFocusChip(); return; }
  if (!c) {
    c = el('div', 'focus-chip'); c.id = 'focusChip'; c.setAttribute('role', 'status');
    const x = el('button', 'pbtn small', '×'); x.type = 'button'; x.title = 'Zrušit zvýraznění'; x.setAttribute('aria-label', 'Zrušit zvýraznění');
    x.onclick = () => setFocus(null);
    c.append(el('span', 'ico'), el('span', 'l'), x);
    c.querySelector('.ico').innerHTML = pxIcon('beacon');
    document.body.append(c);
  }
  c.querySelector('.l').textContent = `Zvýrazněno: ${FOCUS_KINDS[f] ? FOCUS_KINDS[f].n : f}${f === 'hasici' || f === 'voda' ? (state.zasahRange === 'w' ? ' (za týden)' : ' (za 12 h)') : ''}`;
  c.hidden = false;
  placeFocusChip();
}
// On a phone lying on its side the chip sits right above the clock block (bottom left), as wide as it and in line
// with it on both sides (a long name breaks into two lines); the panel above ends higher by the chip (--chip in
// style.css). Elsewhere, and with the clock hidden to the corner, the stylesheet's place (top middle) stays.
const PHONE_LAND = matchMedia('(min-width: 641px) and (max-height: 500px)');
function placeFocusChip() {
  const c = $('focusChip');
  const r = c && !c.hidden && PHONE_LAND.matches ? $('clock').getBoundingClientRect() : null;
  const by = !!(r && r.width > 0);
  if (c) {
    c.style.left = by ? `${Math.round(r.left)}px` : '';
    c.style.top = by ? 'auto' : '';
    c.style.bottom = by ? `${Math.round(innerHeight - r.top + 8)}px` : '';
    c.style.transform = by ? 'none' : '';
    c.style.width = by ? `${Math.round(r.width)}px` : '';
  }
  document.documentElement.style.setProperty('--chip', by ? `${Math.round(c.getBoundingClientRect().height + 8)}px` : '0px');
  placeTop();
}
// An upright phone: the chips (highlight, look, a previewed forecast hour) and the ride box stand in a column under
// the top bar, whatever its height is just now (small with the search alone, whole, with a fold-out or results open)
function placeTop() {
  const els = [$('focusChip'), $('dmChip'), $('fcPill'), $('rideBox'), $('spojBox')].filter(Boolean); // (#spojBox: "můj spoj", src/moje.js; never there together with the ride box)
  const chip = $('focusChip'), ride = $('rideBox');
  if (!isPhone()) { if (chip) chip.classList.remove('side'); for (const e of els) { e.style.visibility = ''; if (e.id !== 'focusChip' && e.id !== 'dmChip') e.style.top = ''; } return; }
  // (a sheet that reaches up to them, as a tall tab under the whole top bar does: the chips wait under it)
  const sheetTop = Math.min(innerHeight, ...topSheets().filter(x => !x.hidden).map(x => x.getBoundingClientRect().top));
  const pr = $('panel').getBoundingClientRect();
  let y = pr.bottom + 8;
  // riding with a theme highlighted: the ride box first, in the top right corner, the chip of the highlight beside it
  // (left of it, as wide as the room there, its text broken into lines) instead of above it
  const rr = chip && !chip.hidden && !ride.hidden ? ride.getBoundingClientRect() : null;
  const side = !!(rr && rr.width > 0);
  const topMin = document.body.classList.contains('top-min');
  if (chip) {
    chip.classList.toggle('side', side);
    const left = side && topMin ? Math.round(pr.left) : 10;
    if (side) { chip.style.left = `${left}px`; chip.style.transform = 'none'; chip.style.width = `${Math.max(90, Math.round(rr.left - left - 6))}px`; }
    else chip.style.left = chip.style.transform = chip.style.width = '';
  }
  if (side) {
    // (the top bar folded into ☰: the box goes into the very corner, level with that button; the chip stays left of
    // the box but under the button, as wide as the room there — beside the button it was squeezed and ran into it)
    const ry = topMin ? pr.top : y;
    chip.style.top = `${Math.round(y)}px`; ride.style.top = `${Math.round(ry)}px`;
    chip.style.visibility = y + chip.getBoundingClientRect().height > sheetTop - 4 ? 'hidden' : '';
    ride.style.visibility = '';
    y = Math.max(y + chip.getBoundingClientRect().height, ry + ride.getBoundingClientRect().height) + 6;
  }
  // (the top bar folded into ☰: the ride box alone goes into the top right corner too, level with that button, not under
  // it; what else stands there, a previewed forecast hour, comes under the box)
  if (!side && ride && !ride.hidden && topMin) {
    ride.style.top = `${Math.round(pr.top)}px`; ride.style.visibility = '';
    y = Math.max(y, pr.top + ride.getBoundingClientRect().height + 6);
  }
  for (const e of els) {
    if (e.hidden || (side && (e === chip || e === ride)) || (e === ride && topMin)) continue;
    e.style.top = `${Math.round(y)}px`;
    const h = e.getBoundingClientRect().height;
    e.style.visibility = e.id !== 'rideBox' && y + h > sheetTop - 4 ? 'hidden' : '';
    y += h + 6;
  }
}
function topSheets() { return [$('card'), $('events'), $('aktual'), $('fcPop'), ...document.querySelectorAll('#panel .pane')]; }
if (window.ResizeObserver) { const ro = new ResizeObserver(() => { placeTop(); reAim(); }); ro.observe($('panel')); for (const x of topSheets()) ro.observe(x); }
addEventListener('resize', placeFocusChip);
PHONE_LAND.addEventListener('change', placeFocusChip);
// the button in the head of a card, beside ×: a beacon and "Ukázat všechny"; pressed again it cancels the highlight
function paintFocusBtn(b, on) {
  b.setAttribute('aria-pressed', String(on));
  b.classList.toggle('on', on);
  b.title = on ? 'Zrušit zvýraznění v mapě' : FOCUS_KINDS[b.dataset.focus].all;
  b.setAttribute('aria-label', b.title);
}
function focusButton(f, at = null) { // (at: the place of the card, image coordinates)
  if (!FOCUS_KINDS[f]) return null;
  const b = el('button', 'pbtn small focus-btn'); b.type = 'button'; b.dataset.focus = f;
  b.innerHTML = pxIcon('beacon'); // (the beacon alone, as big as ×: the title says what it does)
  paintFocusBtn(b, state.focus === f);
  b.onclick = () => {
    const on = state.focus !== f;
    track('Nástroj', { nastroj: 'zvyraznit', hodnota: on ? f : 'zrusit' });
    setFocus(on ? f : null, { fit: on, at: at && at[0] != null ? at : null });
  };
  return b;
}
for (const [f, K] of Object.entries(FOCUS_KINDS)) {
  if (f === 'cleanNext' || f === 'zpozdene') continue;
  const box = $(`lay-${K.layer}`), lab = box && box.closest('label');
  if (!lab || lab.querySelector('.focus-btn')) continue;
  const b = focusButton(f);
  if (b) { b.classList.add('lay-focus'); lab.append(b); }
}
function setAktOpen(open) {
  if (open && $('aktual').hidden) track('Panel', { co: 'aktualne' });
  if (open && !$('card').hidden) $('cardClose').click();
  if (open && isPhone()) setTab(null); // on phones one sheet at a time
  if (open) { $('fcPop').hidden = true; $('fcTile').setAttribute('aria-expanded', 'false'); if (!$('events').hidden) setEventsOpen(false); }
  $('aktual').hidden = !open;
  $('aktToggle').setAttribute('aria-pressed', String(open));
  if (open) { renderAktualne(); Promise.all([paro.load(), city.load()]).then(() => { if (!$('aktual').hidden) renderAktualne(); }); }
}
$('aktToggle').onclick = () => setAktOpen($('aktual').hidden);
$('aktClose').onclick = () => setAktOpen(false);
function zprWay(id) {
  if (!zpravy) return;
  // (opened from the news just now: yes, and remembered; reopened by the Back button of a card that was opened from
  // it, keep: as it was; opened any other way: no)
  const on = (zprNav.from[id] = Date.now() - zprNav.via < 1500 ? true : Date.now() - zprNav.keep < 1500 ? !!zprNav.from[id] : false), p = $(id);
  zprNav.via = zprNav.keep = 0; // (each mark serves one opening)
  let b = p.querySelector(':scope > .zpr-back');
  if (!b && on) { b = el('button', 'pbtn small zpr-back', '‹ Zpět na zprávy'); b.type = 'button'; b.onclick = () => setZprOpen(true, true); p.querySelector(':scope > .evt-head').after(b); }
  if (b) b.hidden = !on;
}
function setZprOpen(open, back = false) { // (back: the return from a card or an overview, to where the list was)
  if (!zpravy) return;
  if (open && $('zpravy').hidden) track('Panel', { co: 'zpravy' });
  if (open && !$('card').hidden) $('cardClose').click();
  if (open && isPhone()) setTab(null); // on phones one sheet at a time
  if (open) { $('fcPop').hidden = true; $('fcTile').setAttribute('aria-expanded', 'false'); if (!$('events').hidden) setEventsOpen(false); if (!$('aktual').hidden) setAktOpen(false); }
  $('zpravy').hidden = !open;
  if (open && !back) zpravy.fold(); // (opened afresh: Stalo se shows its latest few again)
  $('zprTile').setAttribute('aria-pressed', String(open));
  if (open) { renderZpravy(); $('zprBody').scrollTop = back ? zprNav.top : 0; zpravy.refresh(); }
}
const zprPlace = m => { if (!m.at) return false; const [X, Y] = layers.llToImg(m.at[0], m.at[1]); flyTo(X, Y, Math.max(1.2, view().z)); fx.marker(X, Y, 7000, m.ico ? zprIcon(m) : ''); return true; }; // (an event of the police: the icon of its kind on the marker)
// a message made from several things (the closed stretches of a work), or one that names streets (an MHD diversion
// in Lidická and Křížová): only those highlighted, one beacon each, with a view that holds them all. Otherwise the
// one place of the message.
async function zprShow(m) {
  let pts = [];
  if (m.pts && m.pts.length) pts = m.pts.map(([lon, lat]) => layers.llToImg(lon, lat)); // (the things themselves)
  else if (m.streets && m.streets.length) {
    // the streets by their names: one beacon in the middle of each. A name may be a street of a village nearby too
    // (Lidická in Šlapanice): of each name the longest of the lines near the place of the message (within some 2 km
    // of the nearest one)
    try { await fx.needStreets(); } catch { /* the place alone */ }
    const names = new Set(m.streets), at = m.at ? layers.llToImg(m.at[0], m.at[1]) : null, by = new Map();
    for (const [n, , l] of data.streets || []) {
      if (!names.has(n) || l.length < 4) continue;
      let d = 0, len = 0;
      for (let i = 0; i < l.length; i += 2) { if (at) d = i ? Math.min(d, Math.hypot(l[i] - at[0], l[i + 1] - at[1])) : Math.hypot(l[i] - at[0], l[i + 1] - at[1]); if (i) len += Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]); }
      (by.get(n) || by.set(n, []).get(n)).push({ d, len, l });
    }
    for (const ls of by.values()) {
      const dmin = Math.min(...ls.map(x => x.d)), best = ls.filter(x => x.d <= dmin + 2000).sort((p, q) => q.len - p.len)[0];
      const i = Math.floor(best.l.length / 4); pts.push([best.l[2 * i], best.l[2 * i + 1]]);
    }
  }
  if (pts.length < 2) { if (state.focus && state.focus.startsWith('zpr:')) await setFocus(null); zprPlace(m); return; } // (one place: its marker; the highlight of another message goes)
  // a kind of its own, made for that message (as for a line of MHD), with a view that holds all its points
  const f = `zpr:${m.id}`;
  FOCUS_KINDS[f] = { layer: m.src === 'mhd' ? 'mhdOutages' : 'works', n: m.streets ? m.streets.join(', ') : 'místa uzavírky', all: '', ready: () => null, beacon: '#f3c868', pts: () => pts };
  await setFocus(f, { keepView: true });
  fitPoints(pts, 1.5, 1.7); // (more room than usual: a thing at the edge would hide under the small map or the chip)
}
const zprList = tab => () => { zprNav.via = Date.now(); zprNav.top = $('zprBody').scrollTop; const b = document.querySelector(`#evtTabs [data-t="${tab}"]`); if (b && state.evtTab !== tab) b.click(); setEventsOpen(true); };
async function openZprava(m) {
  const k = m.ref ? m.ref.kind : '';
  const focus = m.id === 'cisteni:priste' && FOCUS_KINDS.cleanNext ? 'cleanNext' : m.id === 'nehody:den' ? 'nehody' : m.focus; // (the sum of the day's accidents: all of them in the map)
  zprNav.top = $('zprBody').scrollTop; zprNav.via = Date.now();
  track('Zpráva', { zdroj: m.src, patro: m.tier });
  try {
    if (k === 'pocasi') { setFcOpen(true); return; }
    if (k === 'doprava' && doprava) { setFcOpen(true, 'dop'); return; }
    // a card of its own: the list makes room for it on a phone (card() closes it there)
    if (k === 'hasici' && m.ref.id && HASICI_ON) {
      await hasici.load();
      const o = hasici.list().find(x => x.id === m.ref.id);
      if (o) { if (!$(`l-hasici`) || !$(`l-hasici`).checked) setLayer('hasici', true); zprPlace(m); card.fromZpr = Date.now(); showHasici(o); return; }
    }
    if (k === 'voda' && m.ref.id && VODA_ON) {
      await voda.load();
      const o = voda.data.items.find(x => x.id === m.ref.id);
      if (o) { if (!$('lay-voda') || !$('lay-voda').checked) setLayer('voda', true); voda.positions(); zprPlace(m); card.fromZpr = Date.now(); showVoda(o); return; }
    }
    // (a late train: the card of the station it is due at, with its board)
    if (k === 'vlaky' && m.ref.id && VLAKY_ON) {
      await needVlaky(); await vlaky.load(); vlaky.positions();
      const st = vlaky.byId(m.ref.id);
      if (st) { if (!$('lay-vlaky') || !$('lay-vlaky').checked) setLayer('vlaky', true); zprPlace(m); card.fromZpr = Date.now(); showStation(st); return; }
    }
    if (k === 'udalost') { card.fromZpr = Date.now(); showUdalost(m); return; }
    if (k === 'vyluka') { await city.load(); const o = city.data.outages.find(x => x.id === m.ref.id); if (o) { card.fromZpr = Date.now(); showOutage(o); await zprShow(m); return; } }
    if (k === 'uzavirka') { const C = layers.clos(), c = C && C.items.find(x => x.id === m.ref.id); if (c) { card.fromZpr = Date.now(); showTraffic({ closure: c, source: C.source }); await zprShow(m); return; } }
    if (k === 'nehoda') { const I = layers.traffic.img, c = I && I.nehody ? I.nehody.find(x => x.id === m.ref.id) : null; if (c) { card.fromZpr = Date.now(); showTraffic({ nehoda: c }); await zprShow(m); return; } }
    if (k === 'vykop') { let W = layers.works(); for (let i = 0; i < 20 && !W; i++) { await new Promise(r => setTimeout(r, 150)); W = layers.works(); } // (its file comes when first asked for: up to 3 s)
      const w = W && W.items.find(x => x.id === m.ref.id); if (w) { card.fromZpr = Date.now(); showWork(w); await zprShow(m); return; } }
  } catch { /* the card is not to be had: the place or the highlight below */ }
  if (focus && FOCUS_KINDS[focus]) {
    const on = state.focus !== focus || !!m.at;
    await setFocus(on ? focus : null, { fit: on && !m.at });
    if (on && m.at) zprPlace(m);
    return;
  }
  await zprShow(m); // (no card to be had, the layer of the thing is not loaded: its places all the same)
}
const ZL_NEW = 7 * 864e5;
// A view that holds a rectangle of the image (the whole way of a line) in the part of the map nothing covers while
// the news are open: on a computer between the panel at the left and the list of the news (or the card) at the
// right, under the top row; on a phone as fitPoints has it (the upper part of the screen, above the sheet).
function fitFree(x0, y0, x1, y1, zMax = 4) { // (zMax: never closer than this, a vehicle standing at its stop is no reason for the closest view)
  if (isPhone() || isLandPhone()) {
    // (fitPoints has no such limit: the rectangle grows to the size that gives it)
    const cw = viewer.container.clientWidth, ch = viewer.container.clientHeight, w = cw / (zMax / S) / 1.2, h = (isPhone() ? ch * 0.55 : ch) / (zMax / S) / 1.25;
    if (x1 - x0 < w) { const c = (x0 + x1) / 2; x0 = c - w / 2; x1 = c + w / 2; }
    if (y1 - y0 < h) { const c = (y0 + y1) / 2; y0 = c - h / 2; y1 = c + h / 2; }
    fitPoints([[x0, y0], [x1, y1]]); return;
  }
  const cw = viewer.container.clientWidth, ch = viewer.container.clientHeight;
  let L = document.body.classList.contains('folded') ? 0 : Math.max(0, $('panel').getBoundingClientRect().right), R = cw;
  for (const id of ['zpravy', 'card']) { const e = $(id); if (e && !e.hidden) { const r = e.getBoundingClientRect(); if (r.left > cw / 2) R = Math.min(R, r.left); } }
  if (R - L < 240) { L = 0; R = cw; }
  const T = 70, B = ch - 30; // (the top row and the chip of the highlight; the controls at the bottom)
  const k = Math.min((R - L - 80) / Math.max(200, x1 - x0), (B - T - 60) / Math.max(200, y1 - y0)), z = Math.max(0.15, Math.min(k * S, zMax));
  // (flyTo brings its point to the middle of what it takes for the free part: moved by the difference of the two middles)
  const [fx, fy] = freeCentre();
  flyTo((x0 + x1) / 2 + (fx - (L + R) / 2) / (z / S), (y0 + y1) / 2 + (fy - (T + B) / 2) / (z / S), z);
}
function zprLinky() {
  const outs = city.outagesToday();
  if (!outs.length) return null;
  const mhd = layers.mhd, now = Date.now();
  const typeOf = l => { const t = mhd.lineType(l); return t != null ? t : /^(P6|[1-9]|1[0-2])$/.test(l) ? 'tram' : /^(2[1-9]|3\d)$/.test(l) ? 'trol' : /^[xšEN]?\d{1,2}$/.test(l) ? 'bus' : ''; };
  const rank = o => (o.type === 'Z' ? 1 : 0) + (o.from && now - o.from < ZL_NEW ? 0 : 2); // (0, 1: new this week, a closure before a moved stop; 2, 3: lasting longer)
  const by = new Map(); // line -> { l, type, rank (the lowest of its closures: a line with a new one stands among the new), outs }
  for (const o of outs) {
    if (o.type === 'D') continue;
    for (const l of o.lines || []) {
      const type = typeOf(l);
      if (!type) continue;
      const e = by.get(l) || by.set(l, { l, type, rank: 9, outs: [] }).get(l);
      e.rank = Math.min(e.rank, rank(o)); e.outs.push(o);
    }
  }
  if (!by.size) return null;
  const num = l => parseInt(l.replace(/\D/g, ''), 10) || 999;
  const lines = [...by.values()].sort((a, b) => num(a.l) - num(b.l) || a.l.localeCompare(b.l));
  const f = state.focus && state.focus.startsWith('linka:') ? state.focus.slice(6) : null;
  // (the day a closure ends: with the year when it is not this one, "do 31. 10. 2027")
  const dm = t => { const d = new Date(t); return d.toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }); };
  const openOut = o => () => {
    zprNav.top = $('zprBody').scrollTop; zprNav.via = Date.now(); card.fromZpr = Date.now();
    if (o.X == null) [o.X, o.Y] = layers.llToImg(o.lon, o.lat); // (a closure out of town has no place in the image yet)
    showOutage(o); flyTo(o.X, o.Y, Math.max(1.2, view().z));
  };
  const pick = async e => {
    const fk = lineKind(e.l, e.type), on = state.focus !== fk;
    track('Zpráva', { zdroj: 'linky', patro: 'today' });
    if (!on) { setFocus(null); return; }
    // (the timetable first: the way of the line comes from it; and a line offered by its number alone, before the
    // timetable was here, may turn out not to be in the map at all)
    try { await mhd.load(); await mhd.loadStops(); } catch { /* the vehicles alone */ }
    if (mhd.lineType(e.l) === '') { toast(`Linka ${e.l} v mapě není`); if (zprOpen()) renderZpravy(); return; }
    await setFocus(fk, { keepView: true });
    if (state.focus !== fk) return;
    // the view: the whole way of the line today (the stops of its ways), not only where its vehicles are just now
    const stops = mhd.stops(), pts = [];
    for (const w of mhd.lineWays(e.l, mhd.dayChoices().today)) for (const n of w.p[5] || []) { const s = stops[n]; if (s) pts.push(layers.llToImg(s[1], s[2])); }
    const all = pts.length ? pts : focusPts;
    if (all.length) fitFree(Math.min(...all.map(p => p[0])), Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[0])), Math.max(...all.map(p => p[1])));
  };
  const what = o => `${o.type === 'Z' ? 'Přesunutá zastávka' : 'Výluka nebo odklon'}: ${o.title}${o.to ? ` · do ${dm(o.to)}` : ''}`;
  return {
    groups: [['Výluka nebo odklon, nově', 0], ['Přesunutá zastávka, nově', 1], ['Výluka nebo odklon', 2], ['Přesunutá zastávka', 3]]
      .map(([label, r]) => ({ label, long: r >= 2, lines: lines.filter(e => e.rank === r).map(e => ({ l: e.l, type: e.type, sel: e.l === f, pick: () => pick(e) })) })).filter(g => g.lines.length),
    sel: f && by.has(f) ? { line: f, items: by.get(f).outs.map(o => ({ text: what(o), open: openOut(o) })), off: () => setFocus(null) } : null,
    notes: outs.filter(o => o.type === 'D' && (o.lines || []).some(typeOf)).slice(0, 3).map(o => ({ text: `Změna provozu: ${o.title}${o.to ? ` · do ${dm(o.to)}` : ''}`, open: openOut(o) })),
  };
}
function renderZpravy() {
  if (!zpravy) return;
  const top = $('zprBody').scrollTop; // (a new file or a highlight redraws the list: it stays where it was)
  zpravy.render($('zprBody'), {
    open: openZprava, focus: () => (state.focus === 'cleanNext' ? 'cleanNext' : state.focus), unfocus: () => setFocus(null),
    extra: m => [...(m.src === 'akce' ? [['Seznam akcí', zprList('city')]] : []), ...(m.src === 'kolony' && doprava ? [['Přehled dopravy', () => { zprNav.via = Date.now(); zprNav.top = $('zprBody').scrollTop; setFcOpen(true, 'dop'); }]] : []), ...(m.link ? [[new URL(m.link).hostname.replace(/^www\./, ''), m.link]] : [])],
    more: [['Všechny akce', zprList('city')], ['Doprava a uzavírky', zprList('traffic')]],
    linky: zprLinky,
  });
  $('zprBody').scrollTop = top;
}
if (zpravy) {
  const tile = $('zprTile');
  tile.onclick = () => setZprOpen($('zpravy').hidden);
  $('zprClose').onclick = () => setZprOpen(false);
  zpravy.onUpdate(() => {
    const ok = !zpravy.stale();
    tile.hidden = !ok; document.body.classList.toggle('has-zpr', ok);
    if (ok) zpravy.paintBoard(tile); else if (zprOpen()) setZprOpen(false);
    if (zprOpen()) renderZpravy();
  });
  setInterval(() => { if (zprOpen() && !document.hidden) renderZpravy(); }, 60e3); // (the minutes at the right of the running things)
  zpravy.load();
}

// themed routes (GO TO BRNO)
// the card of a whole route: its introduction and a button to walk it stop by stop
function showRouteIntro(r) {
  const s = el('div', 'sec gotobrno');
  s.append(el('h3', '', 'Tematická trasa · GO TO BRNO'));
  say(s, 'Tematická trasa', r.t, 'Text: www.gotobrno.cz (TIC BRNO), CC BY');
  const btns = el('div', 'btns');
  const go = el('button', 'pbtn', `Začít trasu: 1. ${r.stops[0].n}`); go.type = 'button'; go.onclick = () => showRouteStop(r, 0);
  const play = el('button', 'pbtn', '▶ Přehrát trasu'); play.type = 'button'; play.title = 'Mapa sama proletí zastávky jednu po druhé; zastaví ji posun mapy nebo tlačítko Zastavit prohlídku'; play.onclick = () => playTour(r);
  btns.append(play);
  btns.append(go);
  if (isUrl(r.img)) btns.append(srcBtn(r.img, 'Foto: GO TO BRNO'));
  // the stops of the route live here, in its card (the list in Objevuj stays a plain list of routes): any of them is one click away
  s.append(btns, el('h3', '', 'Zastávky trasy'), routeStopsList(r, -1));
  if (r.t) s.append(el('p', '', r.t.length > 700 ? `${r.t.slice(0, 700).replace(/\s+\S*$/, '')}…` : r.t));
  s.append(el('span', 'credit', 'Zdroj: www.gotobrno.cz (TIC BRNO), otevřená data města Brna, CC BY. Pořadí zastávek je seřazené jako jedna procházka.'));
  card({ kind: 'trasa-uvod', title: r.theme, text: `${r.stops.length} zastávek`, extra: s });
  city.setRoute(r, -1);
}
// the numbered stops of a route as a list of buttons (in the card of the route)
function routeStopsList(r, cur) {
  const ol = el('ol', 'routestops');
  r.stops.forEach((st, i) => {
    const li = el('li'), b = el('button', '', `${i + 1}. ${st.n}`); b.type = 'button';
    if (i === cur) b.setAttribute('aria-current', 'step');
    b.onclick = () => showRouteStop(r, i);
    li.append(b); ol.append(li);
  });
  return ol;
}
// the route off the map and out of the list
function clearRoute() {
  stopTour();
  city.setRoute(null, -1);
  $('routeSel').value = '';
  markRoute();
  try { viewer.forceRedraw(); } catch { /* not open yet */ }
}
// the list of the routes in Objevuj: the chosen one is marked (its stops are in its card)
function markRoute() {
  const R = city.route().r;
  for (const b of document.querySelectorAll('#routeList button')) {
    const on = !!R && b.dataset.theme === R.theme;
    if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  }
}
city.load().then(() => {
  for (const r of city.data.routes) {
    $('routeSel').append(Object.assign(document.createElement('option'), { value: r.theme, textContent: `${r.theme} (${r.stops.length})` }));
    const li = el('li'), b = el('button'); b.type = 'button'; b.dataset.theme = r.theme; b.setAttribute('aria-label', r.theme);
    b.append(el('span', '', r.theme), el('small', '', `${r.stops.length} zastávek`));
    b.onclick = () => { $('routeSel').value = r.theme; $('routeSel').onchange(); };
    li.dataset.t = r.t || ''; li.dataset.stops = r.stops.map(s => s.n).join('\n'); // (for the search of Objevuj: what the route is about and its stops)
    li.append(b); $('routeList').append(li);
  }
  $('routesCnt').textContent = city.data.routes.length;
});
$('routeSel').onchange = () => {
  const r = city.data.routes.find(x => x.theme === $('routeSel').value) || null;
  if (r) track('Nástroj', { nastroj: 'trasa', hodnota: r.theme });
  city.setRoute(r, -1);
  markRoute();
  if (r) showRouteIntro(r);
  if (r) {
    // show the whole route
    const xs = r.stops.map(s => s.X), ys = r.stops.map(s => s.Y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const vw = $('map').clientWidth || 1000;
    flyTo((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, Math.min(1.4, Math.max(0.12, (1.1 * vw) / Math.max(200, w, h * 1.8))));
  }
};
$('evtClose').onclick = () => setEventsOpen(false);
function renderEvents() {
  const T = layers.traffic.data;
  const items = [];
  if (T) {
    for (const a of T.alerts) if (a.type !== 'ACCIDENT') items.push({ t: a.t, kind: a.type === 'ROAD_CLOSED' ? 'closed' : 'hazard', icon: a.type === 'ROAD_CLOSED' ? '⛔' : '⚠', title: a.type === 'ROAD_CLOSED' ? 'Uzavírka' : 'Překážka na silnici', place: a.street, lon: a.lon, lat: a.lat, open: () => showTraffic({ alert: a }) });
    // the accidents joined (src/nehodyted.js), only those on the map now
    const now = Date.now(), img = layers.traffic.img;
    for (const c of (T.nehody && T.nehody.items) || []) {
      if (!accLive(c, now)) continue;
      const L = accLevel(c), ci = img && img.nehody ? img.nehody.find(x => x.id === c.id) || c : c;
      items.push({ t: c.t, kind: 'accident', icon: '⚠', title: L === 3 ? 'Nehoda, zasahují hasiči' : L === 2 ? 'Nehoda' : 'Nehoda (nepotvrzená)', place: `${accStreet(c.street)}${c.n > 1 ? ` · ${c.n} hlášení` : ''}`, lon: c.lon, lat: c.lat, open: () => showTraffic({ nehoda: ci }) });
    }
    for (const j of T.jams) if (j.level >= 3) items.push({ t: j.t, kind: 'jam', icon: '🚗', title: j.level >= 4 ? 'Velká kolona' : 'Kolona', place: `${j.street || ''}${j.delay > 0 ? ` · +${Math.round(j.delay / 60)} min` : ''}`, lon: j.path[Math.floor(j.path.length / 2)][0], lat: j.path[Math.floor(j.path.length / 2)][1], open: () => showTraffic({ jam: j }) });
  }
  // public transport closures and diversions valid now (IDS JMK), only those in the map
  try { for (const o of city.outagesNow()) if (o.X != null) items.push({ t: o.from || Date.now(), kind: 'outage', icon: '🚌', title: `Výluka: ${o.title}`, place: `linky ${o.lines.join(', ')}${o.to ? ` · do ${fmtDay(o.to)}` : ''}`, lon: o.lon, lat: o.lat, open: () => showOutage(o) }); } catch { /* not loaded yet */ }
  let wAlerts = []; try { wAlerts = forecast ? forecast.alerts() : []; } catch { /* forecast panel not set up yet */ }
  for (const a of wAlerts) items.push({ t: Date.parse(a.onset) || Date.now(), kind: 'alert', icon: '⚡', title: `Výstraha: ${a.event}`, place: a.expires ? `do ${new Date(a.expires).toLocaleString('cs-CZ', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : 'ČHMÚ', lon: 16.608, lat: 49.195, open: () => openForecastFull() });
  items.sort((a, b) => b.t - a.t);
  $('evtCount').textContent = items.length ? String(items.length) : '';
  if ($('events').hidden) return;
  if (state.evtTab === 'city') { renderCityEvents(); return; }
  const ol = $('evtList');
  ol.replaceChildren();
  const hhmm = t => new Date(t).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const add = (it, time) => {
    const li = el('li'), b = el('button', `t-${it.kind}`);
    b.type = 'button';
    const txt = el('span', '', it.title);
    if (it.place) txt.append(el('small', '', it.place));
    b.append(el('span', 'tm', time), el('span', '', it.icon), txt);
    b.onclick = () => {
      const [X, Y] = layers.llToImg(it.lon, it.lat);
      flyTo(X, Y, Math.max(1.2, view().z)); fx.marker(X, Y); card.fromEvents = Date.now(); it.open();
    };
    li.append(b); ol.append(li);
  };
  if (!items.length) ol.append(el('li', 'sep', T ? 'Žádné nové události' : 'Načítám…'));
  for (const it of items.slice(0, 60)) add(it, hhmm(it.t));
  // long-term closures (no time — they last weeks or months)
  const C = layers.clos();
  if (C && C.items.length) {
    ol.append(el('li', 'sep', 'Dlouhodobé uzavírky'));
    const seen = new Set();
    for (const c of C.items) {
      const name = c.n || 'úsek silnice';
      if (seen.has(name)) continue;
      seen.add(name);
      add({ kind: 'long', icon: '⛔', title: name, place: c.open ? `do ${c.open.split('-').reverse().map(x => x.replace(/^0/, '')).join('. ')}` : 've výstavbě', lon: c.p[0], lat: c.p[1], open: () => showTraffic({ closure: c, source: C.source }) }, '');
    }
  }
  const W = state.layers.works && layers.works();
  if (W) {
    const seen = new Set(C ? C.items.map(c => c.n) : []);
    const full = W.items.filter(w => w.kind === 'uplna' && !w.osm).sort((a, b) => (b.len || 0) - (a.len || 0)); // the longer closures first
    for (const soon of [false, true]) {
      const list = full.filter(w => !!w.soon === soon).slice(0, soon ? 20 : 50);
      if (!list.length) continue;
      ol.append(el('li', 'sep', soon ? 'Chystané uzavírky (povolené městem)' : 'Uzavírky povolené městem'));
      for (const w of list) {
        const name = w.n || `${w.street} ${w.usek}`.trim();
        if (seen.has(name)) continue;
        seen.add(name);
        add({ kind: 'long', icon: '🚧', title: name, place: `${w.street}${soon ? ` · od ${czd(w.from)}` : ''} · do ${czd(w.to)}`, lon: w.lon, lat: w.lat, open: () => showWork(w) }, '');
      }
    }
  }
}
// public transport: live positions (KORDIS stream) or the timetable
function setMhdMode(mode) {
  state.mhdMode = mode;
  document.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.m === mode)));
  if (mode !== 'live') { layers.live.stop(); liveOn = false; } else liveIdle = 0; // (live: the frame loop connects once vehicles are drawn, liveCheck)
  updateMhdNote();
}
function updateMhdNote() {
  const L = layers.live;
  $('mhdNow').textContent = state.mhdMode === 'live'
    ? (L.alive() ? `Živě: ${L.count()} vozidel MHD (KORDIS JMK).` : liveWanted ? `Připojuji živé polohy…${TOUCH && !layers.mhd.ready() ? '' : ' mezitím jezdí vozidla podle jízdního řádu.'}` : 'Živé polohy MHD se načtou, až mapu přiblížíte k vozidlům.')
    : 'Vozidla jezdí podle platného jízdního řádu IDS JMK.';
}
document.querySelectorAll('[data-m]').forEach(b => (b.onclick = () => { if (b.dataset.m !== state.mhdMode) track('Vrstva', { vrstva: 'mhd-zive', stav: b.dataset.m === 'live' ? 'zap' : 'vyp' }); setMhdMode(b.dataset.m); }));
setMhdMode('live');
setInterval(updateMhdNote, 5000);

// ------------------------------------------------------------------ city projects list
// the list is filled the first time its section is opened
function fillProjects() {
  if (fillProjects.done) return;
  if (!layers.proj.list) { setTimeout(fillProjects, 400); return; }
  // (which project of the map belongs to an item of the list is written in the details of the projects, a file of its
  // own that comes only when asked for: without it every item looked like "celé město" and the map did not move)
  if (fillProjects.detail === 1) return; // (on its way)
  if (!fillProjects.detail) { fillProjects.detail = 1; const go = () => { fillProjects.detail = 2; fillProjects(); }; layers.projectDetail().then(go, go); return; }
  fillProjects.done = true;
  $('projUpdated').textContent = `Data k ${layers.proj.updated.split('-').reverse().join('. ')}.`;
  const ul = $('projList');
  const items = layers.proj.cobude.slice().sort((a, b) => a.t.localeCompare(b.t, 'cs'));
  $('projCnt').textContent = items.length;
  for (const c of items) {
    const li = el('li'), btn = el('button');
    btn.append(el('span', '', c.t));
    btn.setAttribute('aria-label', c.t);
    btn.type = 'button';
    const p = layers.proj.list.find(q => q.cb && q.cb.url === c.url);
    if (!p) btn.append(el('small', '', 'celé město')); // (no single place in the map)
    btn.onclick = () => {
      if (p) {
        const [X, Y] = layers.llToImg(p.g[0][0], p.g[0][1]);
        flyTo(X, Y, Math.max(2.5, view().z)); fx.marker(X, Y); showProject(p);
      } else card({ kind: 'cobude', title: c.t, projects: [{ id: c.url, n: c.t, cb: c }] });
      if (matchMedia('(max-width: 640px)').matches) setPanelOpen(false);
    };
    li.dataset.t = c.d || ''; // (for the search of Objevuj)
    li.append(btn); ul.append(li);
  }
}
$('liveBox').addEventListener('toggle', () => { if ($('liveBox').open) fillProjects(); });
// Hledání v Objevuj (src/explorefind.js): the field at the top of the pane filters the three lists where they are.
// The module comes with the first use of the field.
let exploreFind = null, exploreFindWait = null;
const wakeExploreFind = () => exploreFindWait || (exploreFindWait = import('./explorefind.js').then(m => (exploreFind = m.createExploreFind({ track, isPhone, fill: fillProjects })), () => { exploreFindWait = null; return null; }));
$('efQ').addEventListener('focus', wakeExploreFind, { once: true });
$('efQ').addEventListener('input', wakeExploreFind, { once: true });

// ------------------------------------------------------------------ layers
// (zoo is not in the list: it has no switch in the page and is always drawn)
// One way in for every switch of a layer: the tick in Vrstvy, the quick tiles (src/quick.js) and Aktuálně all go through
// setLayer, so the state, the tick and the level dots always agree.
let quick = null; // the quick tiles, made below
// Klidná mapa offered (part klid): when someone switches layers on by hand and the map ends up full of them, a message
// offers to calm it, and the button blinks so that it is found next time. "Full": the share of the screen the drawing of
// the layers covers (the #mapOver canvas shrunk to cells of about 8 px, a cell counts when it is mostly drawn on), measured
// once, 2.5 s after the switch, when the map stands, close up (from 1.2 m/px: farther out there are no detailed houses
// to calm and the clouds are drawn), by day (the night veil covers everything). At most once a day; shown twice without
// being taken, it rests 30 days; whoever has used Klidná mapa does not get it again (they know the button).
var klidOffer = (() => { // (var: setLayer may run before this line, while a link is read: klidOffer?.)
  const KEY = 'b2k-klid-offer', COVER = 0.15, CELL = 8; // (COVER measured 2026-11-17: the centre close up 16–27 %, Královo Pole or Bystrc 2–4 %)
  let lastInput = 0, timer = 0, armedUntil = 0, cvs = null;
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => (lastInput = performance.now()), { capture: true, passive: true });
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const save = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* private mode */ } };
  function cover() {
    const c = $('mapOver'); if (!c || !c.width) return 0;
    const dpr = c.width / (c.clientWidth || c.width), w = Math.max(1, Math.round(c.width / dpr / CELL)), h = Math.max(1, Math.round(c.height / dpr / CELL));
    cvs ||= document.createElement('canvas'); cvs.width = w; cvs.height = h;
    const g = cvs.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, w, h); g.drawImage(c, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 96) n++;
    return n / (w * h);
  }
  function check() {
    timer = 0;
    if (!shown('klid') || klidOn || performance.now() > armedUntil) return;
    const o = load(), day = new Date().toDateString();
    if (o.used || o.day === day || (o.until && Date.now() < o.until)) { armedUntil = 0; return; }
    if (state.night >= 0.2 || state.datamap || !$('card').hidden) return; // (the night veil; a datová mapa greys the map itself; a card is being read)
    if (1 / GEO.A / view().k > 1.2) return; // (still armed: zooming in checks again, viewer 'animation-finish')
    const cv = cover();
    if (cv < COVER) return;
    armedUntil = 0;
    const no = (o.no || 0) + 1;
    save(no >= 2 ? { until: Date.now() + 30 * 864e5 } : { day, no });
    track('Nabídka klidu', { stav: 'ukazano', pokryti: `${Math.round(cv * 20) * 5} %` });
    const btn = [...document.querySelectorAll('.klid-btn')].find(b => b.getClientRects().length); // (the one shown: the row on a computer, the column on a phone; fixed, so no offsetParent)
    if (btn) { btn.classList.remove('hint'); void btn.offsetWidth; btn.classList.add('hint'); }
    toast('Hodně věcí najednou?', 9000, ['Zklidnit mapu', () => { track('Nabídka klidu', { stav: 'prijato' }); setLayer('klid', true); }]);
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(check, 2500); };
  viewer.addHandler('animation-finish', () => { if (performance.now() < armedUntil) later(); });
  return {
    arm() { if (performance.now() - lastInput > 1500 || !shown('klid')) return; armedUntil = performance.now() + 120000; later(); }, // (by hand only: a switch within 1.5 s of a tap or a key)
    used() { const o = load(); if (!o.used) save({ used: true }); },
  };
})();
// Klidná mapa on / off: the other tiles (the detail windows go with the swap and stay away), the chunks fetched again
// lowered or at full height, everything that kept a building drops it (as on a rotation, rotateTo)
function setKlid(on) {
  if (!shown('klid') || on === klidOn) return;
  klidOn = on; state.klid = on; // (state.klid: the layers draw a day over the calm map, src/layers.js)
  if (on) klidOffer?.used();
  chunks.clear(); chunkAttrs.clear(); chunkQueue.length = 0; hover = null; fx.hover = null; fx.selected = null;
  occNew = new Map(); occOld = new Map(); // (the answers kept for the houses of the other look)
  city.forgetHidden(); // (the statues, plaques and Kameny zmizelých: hatched as behind a house in the full map, not over the calm one)
  datamap.refresh();
  if (viewer.world.getItemCount()) setSeason(state.season);
  fx.setPlain(on);
  klidLookUi();
  for (const b of document.querySelectorAll('.klid-btn')) { b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Klidná mapa je zapnutá: kliknutím zpět na barevnou mapu' : 'Klidná mapa: šedé nízké domy bez oken a barev, vrstvy na ní vyniknou'; }
}
// the choices of the look make no sense over the calm map (one plain clear day): greyed out with a note, the clock
// button says so; what was chosen stays and comes back with the full map
function klidLookUi() {
  $('klidLookNote').hidden = !klidOn;
  for (const b of document.querySelectorAll('#seasons [data-s], #times [data-n], #weather [data-w], #lookNowBtn')) {
    if (klidOn) { b.dataset.klid = '1'; b.disabled = true; }
    else if (b.dataset.klid) { delete b.dataset.klid; b.disabled = b.dataset.w === 'snow' && !(state.season === 'autumn' || state.season === 'winter'); }
  }
  for (const id of ['lookSummer', 'mhL']) { const e = $(id); if (e) e.classList.toggle('klid', klidOn); }
  lookChip(); // (no "V Brně je tma" over the calm map)
}
function setLayer(k, on) {
  on = !!on;
  const box = $(`lay-${k}`);
  if (box) box.checked = on;
  else if (!(k in state.layers)) return;
  state.layers[k] = on;
  if (k === 'labels') $('map').classList.toggle('nolabels', !on);
  if (k === 'hover' && !on) fx.hover = null;
  if (k === 'paro') updateParoPanel.touched = true;
  if (k === 'clean') updateCleanPanel();
  if (k === 'hasici' || k === 'voda') updateZasahRow();
  if (k === 'klid') setKlid(on);
  else if (on) klidOffer?.arm(); // (a layer switched on by hand may have filled the map: Klidná mapa offered, see klidOffer)
  if (!on && state.focus && focusLayer(state.focus) === k) setFocus(null); // the highlighted theme goes with its layer
  secCounts();
  if (quick) quick.render();
}
if (!shown('klid')) $('lay-klid')?.closest('label')?.remove(); // (part klid: not public yet; the build leaves out the data-pub="klid" elements too)
for (const b of document.querySelectorAll('.klid-btn')) b.onclick = () => { track('Nástroj', { nastroj: 'klidna-mapa', hodnota: klidOn ? 'vyp' : 'zap' }); setLayer('klid', !klidOn); };
viewer.addHandler('open', () => { if (klidOn) setSeason(state.season); }); // (a link with Klidná mapa on, read before the map opened)
for (const k of ['klid', 'labels', 'traffic', 'hover', 'jams', 'closures', 'works', 'names', 'building', 'planCity', 'planPrivate', 'bigplans', 'paro', 'hasici', 'policie', 'voda', 'parking', 'clean', 'vlaky', 'mhd', 'mhdStops', 'mhdOutages', 'air', 'cams', 'meteo', 'pano', 'events', 'monuments', 'people', 'pitka', 'wc', 'stin', 'kose', 'smView', 'smPool', 'smTree', 'smArt', 'smCross', 'smPlaque', 'smStolper']) {
  const box = $(`lay-${k}`);
  if (!box) { state.layers[k] = false; continue; } // (not in this version of the page, or commented out for now)
  state.layers[k] = box.checked; // (the page and the state start the same; the ticks in index.html are the truth)
  box.addEventListener('change', e => { track('Vrstva', { vrstva: k, stav: e.target.checked ? 'zap' : 'vyp' }); setLayer(k, e.target.checked); });
}
$('map').classList.toggle('nolabels', !state.layers.labels);
// the switches as the page starts (the ticks in index.html), and those outside the quick tiles: a shared link
// (#@…&v=) names the tile levels and only the switches that differ from these
const LAYER_DEFAULT = { ...state.layers };
const TILE_LAYERS = new Set(GROUPS.flatMap(g => g.levels.flatMap(l => l.on)));
// The time of the events shown, in the map and in the list alike: any combination of 't' today, 'w' later this week
// and 'l' later (the ticks under Akce in Vrstvy, the items of the Akce tile, the chips of the list). The older names
// of a shared link ('today', 'week', 'all') are taken too.
function setEventsRange(r) {
  r = { today: 't', week: 'tw', all: 'twl' }[r] || r;
  r = [...'twl'].filter(k => r.includes(k)).join('') || 't';
  state.eventsRange = r;
  document.querySelectorAll('input[name="evp"]').forEach(x => (x.checked = r.includes(x.value)));
  document.querySelectorAll('#evtRange [data-r]').forEach(x => x.setAttribute('aria-pressed', String(r.includes(x.dataset.r))));
  if (quick) quick.render();
  if (!$('events').hidden) renderEvents();
  try { viewer.forceRedraw(); } catch { /* not open yet */ }
}
document.querySelectorAll('input[name="evp"]').forEach(x => x.addEventListener('change', () => {
  const r = [...document.querySelectorAll('input[name="evp"]')].filter(y => y.checked).map(y => y.value).join('');
  if (!r) { x.checked = true; toast('Aspoň jedno období musí zůstat vybrané; akce vypnete přepínačem Akce ve městě.'); return; }
  setEventsRange(r);
}));
document.querySelectorAll('input[name="clr"]').forEach(x => x.addEventListener('change', () => { if (x.checked) { track('Vrstva', { vrstva: 'clean', stav: x.value }); setCleanRange(x.value); } }));
document.querySelectorAll('input[name="zsr"]').forEach(x => x.addEventListener('change', () => { if (x.checked) { track('Vrstva', { vrstva: 'zasahy', stav: x.value === 'w' ? 'tyden' : '12h' }); setZasahRange(x.value); } }));
updateZasahRow();
if (CISTENI_ON) { updateCleanPanel(); setInterval(updateCleanPanel, 60e3); cisteni.load(); }
// The sections of the Vrstvy pane: each summary shows how much of the section is on ("3/6", or the name of the
// datová mapa chosen); which sections are open is remembered in this browser.
function secCounts() {
  document.querySelectorAll('#pane-layers .lsec').forEach(sec => {
    const cnt = sec.querySelector(':scope > summary > .cnt');
    if (!cnt) return;
    const radios = [...sec.querySelectorAll('input[type="radio"]')];
    if (radios.length && !sec.querySelector('input[type="checkbox"]')) { const on = radios.find(r => r.checked && r.value); cnt.textContent = on ? [...on.parentElement.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : 'vypnuto'; cnt.classList.toggle('off', !on); return; }
    const boxes = [...sec.querySelectorAll('input[type="checkbox"]')], on = boxes.filter(b => b.checked).length;
    cnt.textContent = `${on}/${boxes.length}`;
    cnt.classList.toggle('off', !on);
  });
  roleTiles();
}
secCounts();
document.querySelectorAll('#pane-layers .lsec').forEach(sec => {
  const key = `b2k-sec-${sec.dataset.sec}`;
  try { const v = localStorage.getItem(key); if (v !== null) sec.open = v === '1'; } catch { /* private mode */ }
  // (not while the pane is filtered by its search: src/layerfind.js opens the sections of the rows found and puts them back)
  sec.addEventListener('toggle', () => { if ($('pane-layers').classList.contains('finding')) return; try { localStorage.setItem(key, sec.open ? '1' : '0'); } catch { /* private mode */ } });
});
function layerDefault() {
  const def = { ...LAYER_DEFAULT };
  if (paro.data && paro.data.voting && paro.phase() !== 'voting') def.paro = false;
  return def;
}
function resetLayers() {
  track('Vrstva', { vrstva: 'vychozi', stav: 'zap' });
  const def = layerDefault();
  if (state.datamap) setDatamap(null);
  if (state.focus) setFocus(null);
  for (const [k, on] of Object.entries(def)) if (state.layers[k] !== on) setLayer(k, on);
  updateParoPanel.touched = false;
  setEventsRange('t');
  if (state.mhdMode !== 'live') setMhdMode('live');
  setCleanRange('d'); setZasahRange('h');
  secCounts();
  toast('Mirek: vrstvy, které si Mirek Kubásek sám zobrazuje nejčastěji a které jsou podle něj nejužitečnější', 4600, null, true);
}
// Pro koho (src/roles.js): a role sets every switch outside the section Mapa that this page has (Dáme na vás only
// during its vote, as Výchozí does), with no datová mapa and no highlighted theme. Its tile stays pressed while the
// switches are still the role's.
const roleKeys = () => Object.keys(state.layers).filter(k => !ROLE_KEEP.has(k) && $(`lay-${k}`));
function roleOn(r) {
  const on = new Set(r.on.filter(k => $(`lay-${k}`)));
  if (on.has('paro') && paro.data && paro.data.voting && paro.phase() !== 'voting') on.delete('paro');
  return on;
}
function roleTiles() {
  const g = $('rolesGrid');
  if (!g) return;
  for (const b of g.children) {
    if (b.dataset.role === 'mirek') { const def = layerDefault(); b.setAttribute('aria-pressed', String(!state.datamap && Object.keys(def).every(k => !$(`lay-${k}`) || !!state.layers[k] === !!def[k]))); continue; }
    const r = ROLES.find(x => x.key === b.dataset.role), on = r && roleOn(r);
    b.setAttribute('aria-pressed', String(!!r && !state.datamap && roleKeys().every(k => !!state.layers[k] === on.has(k))));
  }
}
function applyRole(r) {
  track('Vrstva', { vrstva: `role-${r.key}`, stav: 'zap' });
  const on = roleOn(r);
  if (state.datamap) setDatamap(null);
  if (state.focus) setFocus(null);
  if (r.events) setEventsRange(r.events);
  for (const k of roleKeys()) if (!!state.layers[k] !== on.has(k)) setLayer(k, on.has(k));
  if (on.has('mhd') && state.mhdMode !== 'live') setMhdMode('live');
  setCleanRange('d'); setZasahRange('h');
  secCounts();
  toast(`${r.name}: ${r.desc}`, 4600, null, true);
}
{
  const g = $('rolesGrid');
  if (g) {
    const MIREK = { key: 'mirek', name: 'Mirek', icon: 'mirek', desc: 'vrstvy, které si Mirek Kubásek sám zobrazuje nejčastěji a které jsou podle něj nejužitečnější (tak se stránka i otevře)' };
    for (const r of [MIREK, ...ROLES]) {
      const b = el('button', 'pbtn role-btn');
      b.type = 'button'; b.dataset.role = r.key; b.title = `${r.name}: ${r.desc}`;
      b.innerHTML = `${pxIcon(r.icon)}<span>${r.name}</span>`;
      b.onclick = () => {
        // the tile lights at once, the switches follow after the next frame (twenty-odd layers: INP, BEST-PRACTICES.md)
        for (const x of g.children) x.setAttribute('aria-pressed', String(x === b));
        requestAnimationFrame(() => setTimeout(() => (r === MIREK ? resetLayers() : applyRole(r)), 0));
      };
      g.append(b);
    }
    roleTiles();
  }
}

// ------------------------------------------------------------------ rychlé přepínače skupin vrstev (src/quick.js)
// the pixel icons in place of the font glyphs of the tiles, the tabs and the zoom buttons; then the tiles themselves
placePxIcons();
// the kept scrollbar gutter of the panel (style.css, --gut): where the bar takes room (a mouse, Windows), the panel is
// that much wider and has that much less padding on the right, so the content keeps its width and both sides stay alike; measured once while the page still boots (nothing jumps)
{ const p = document.querySelector('.panel'); if (p) { const g = p.offsetWidth - p.clientWidth - 4; if (g > 0 && g < 16) p.style.setProperty('--gut', `${g}px`); } }
// What the switches in Vrstvy mean: the explanations a computer shows as tooltips, for a finger too. A small "?" in
// the heading of a section writes them under its switches (and takes them away again); Dáme na vás has its own.
function hintButton(labels, onToggle) {
  const b = el('button', 'lh', '?'); b.type = 'button'; b.title = 'Co tyto vrstvy ukazují'; b.setAttribute('aria-label', 'Co tyto vrstvy ukazují'); b.setAttribute('aria-expanded', 'false');
  b.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    const open = b.getAttribute('aria-expanded') !== 'true';
    for (const l of labels) { const h = l.nextElementSibling; if (h && h.classList.contains('lhint')) h.remove(); if (open) l.after(el('p', 'lhint', l.title)); }
    b.setAttribute('aria-expanded', String(open));
    if (onToggle) onToggle(open);
  };
  return b;
}
document.querySelectorAll('#pane-layers .lsec').forEach(sec => {
  const labels = [...sec.querySelectorAll('label[title]')].filter(l => !l.hidden), sum = sec.querySelector(':scope > summary');
  if (!labels.length || !sum) return;
  const b = hintButton(labels, open => { sec.classList.toggle('hints', open); if (open) sec.open = true; });
  sum.insertBefore(b, sum.querySelector('.cnt'));
});
// Hledání ve Vrstvách (src/layerfind.js): the field at the top of the pane filters the switches where they are, "Jen
// zapnuté" leaves the layers that are on. The module comes with the first use (the caret in the field, a letter, the button).
let layerFind = null, layerFindWait = null;
const wakeLayerFind = () => layerFindWait || (layerFindWait = import('./layerfind.js').then(m => (layerFind = m.createLayerFind({ track, isPhone })), () => { layerFindWait = null; return null; }));
$('lfQ').addEventListener('focus', wakeLayerFind, { once: true });
$('lfQ').addEventListener('input', wakeLayerFind, { once: true });
$('lfOn').addEventListener('click', () => { if (!layerFind) { $('lfOn').setAttribute('aria-pressed', 'true'); wakeLayerFind().then(f => f && f.setOn(true)); } }); // (the first press: the module is not there to hear it)
const SEC_OF_TILE = { stavby: 'build', mhd: 'mhd', doprava: 'doprava', akce: 'akce', mista: 'mista', senzory: 'senzory', foto: 'foto' };
quick = createQuick({ state, setLayer, setEventsRange, mount: $('quick'), shown, focusButton: f => focusButton(f),
  onStep: (key, level) => {
    track('Přepínač', { skupina: key, uroven: level });
    // the street photos show only from close up: said at once, the tile alone would look as if nothing happened
    if (key === 'foto') toast(!level ? 'Fotky z ulice jsou vypnuté' : view().z < pano.SHOW_FROM ? 'Fotky z ulice jsou zapnuté: ukážou se po přiblížení mapy' : 'Fotky z ulice jsou zapnuté: klepněte na tečku nebo do ulice');
  },
  // "Podrobně ve Vrstvách" in the menu of a tile: the Vrstvy tab with the section of that theme open
  onMore: key => {
    if (document.body.classList.contains('folded')) $('tuck').click();
    if (layerFind) layerFind.clear(); // (the whole pane, not what its search left of it)
    setTab('layers');
    const sec = document.querySelector(`#pane-layers .lsec[data-sec="${SEC_OF_TILE[key]}"]`);
    if (sec) { sec.open = true; requestAnimationFrame(() => sec.scrollIntoView({ block: 'start', behavior: 'smooth' })); }
  } });

// ------------------------------------------------------------------ datové mapy
// One quantity painted over the city (src/datamap.js): the map goes grey, the roofs and the ground get the colour
// of their band. Time stands at day while it is on (the colours would not read at night); cars and people hide.
let dmSaved = null; // the time setting from before the map was switched on
function setDatamap(key) {
  key = DATAMAPS[key] && shown(DATAMAPS[key].part || 'datamap') ? key : null;
  const was = state.datamap;
  state.datamap = key;
  datamap.set(key);
  fx.setDatamap(!!key);
  const radio = key ? DATAMAPS[key].radio || key : ''; // (a map without a radio of its own lights the one it belongs to)
  document.querySelectorAll('input[name="dm"]').forEach(r => (r.checked = r.value === radio));
  secCounts();
  if (key && !was) { dmSaved = { realTime: $('clockLive').checked, night: $('night').value }; $('clockLive').checked = false; setNight(0); }
  if (!key && was && dmSaved) { if (dmSaved.realTime) { $('clockLive').checked = true; realTime(); } else setNight(+dmSaved.night); dmSaved = null; }
  if (!key && $('dmTip')) $('dmTip').hidden = true;
  lookChip();
  dmChip();
}
// While a datová mapa is on, a chip over the map says which one and of what time, with the way to its legend and ×
// (audit 2026-11-15: a shared link opened with the map on and the panel closed, and the colours said nothing). The
// look of a focus chip, under it when both are there; on a phone in the column under the top bar (placeTop).
const DM_PERIOD = { hluk: '2022', hustota: 'sčítání 2021', vyuziti: '2018–2020', bezpeci: 'anketa 2025', oblibena: 'anketa 2025', lepsi: 'anketa 2025', nelibi: 'anketa 2025' };
async function dmChip() {
  let c = $('dmChip');
  const key = state.datamap, def = key && DATAMAPS[key];
  if (!def) { if (c) { c.hidden = true; placeTop(); } return; }
  if (!c) {
    c = el('div', 'focus-chip dm-chip'); c.id = 'dmChip'; c.setAttribute('role', 'status');
    const leg = el('button', 'pbtn small', 'Legenda'); leg.type = 'button'; leg.title = 'Co barvy znamenají (Vrstvy → Datové mapy)';
    leg.onclick = () => {
      track('Nástroj', { nastroj: 'datova-mapa', hodnota: 'legenda' });
      if (document.body.classList.contains('folded')) $('tuck').click();
      if (layerFind) layerFind.clear();
      setTab('layers');
      const sec = document.querySelector('#pane-layers .lsec[data-sec="datamap"]');
      if (sec) { sec.open = true; requestAnimationFrame(() => ($('dmLegend') || sec).scrollIntoView({ block: 'start', behavior: 'smooth' })); }
    };
    const x = el('button', 'pbtn small', '×'); x.type = 'button'; x.title = 'Vypnout datovou mapu'; x.setAttribute('aria-label', 'Vypnout datovou mapu');
    x.onclick = () => { track('Vrstva', { vrstva: `dm-${state.datamap}`, stav: 'vyp' }); setDatamap(null); };
    c.append(el('span', 'l'), leg, x);
    document.body.append(c);
  }
  let period = DM_PERIOD[key] || '';
  if (def.part === 'nehody') { // (the years from the data: all accidents 5 years, the others 10)
    try { const w = (await datamap.accidents()).windows; const y = w && (key === 'nehody' ? w.nehody : w.zraneni); if (y) period = y.join('–'); } catch { /* without the years */ }
    if (state.datamap !== key) return;
  } else if (def.part === 'kriminalita') { // (the months of the police data: 11/2021–10/2026)
    try { const d = await datamap.crime(), mo = v => `${+String(v).slice(4)}/${String(v).slice(0, 4)}`; if (d && d.from) period = `${mo(d.from)}–${mo(d.to)}`; } catch { /* without the months */ }
    if (state.datamap !== key) return;
  }
  c.querySelector('.l').textContent = `Datová mapa: ${def.n}${period ? ` · ${period}` : ''}`;
  c.hidden = false;
  placeTop();
}
document.querySelectorAll('input[name="dm"]').forEach(r => {
  r.addEventListener('change', () => { if (!r.checked) return; if (r.value !== (state.datamap || '')) track('Vrstva', { vrstva: `dm-${r.value || state.datamap}`, stav: r.value ? 'zap' : 'vyp' }); setDatamap(r.value); });
  r.addEventListener('click', () => {
    if (!r.value || !state.datamap) return;
    if (r.value === state.datamap) datamap.all(); // the map already on: all its classes again
    else if (DATAMAPS[state.datamap].radio === r.value) setDatamap(r.value); // from a map of its legend back to the map itself
  });
});
// the legend of the map shown: a click on a class switches it off or on (the last lit one stays lit),
// "jen" shows that class alone; a click on the name of the map lights all of them again
function dmLegend() {
  const box = $('dmLegend');
  if (!box) return;
  const def = datamap.def();
  box.hidden = !def;
  box.replaceChildren();
  if (!def) return;
  const lit = datamap.lit(), allLit = lit.every(Boolean);
  if (def.matrix) { dmMatrix(box, def, lit); return; }
  const ul = el('ul', 'dm-classes');
  def.classes.forEach((c, i) => {
    const li = el('li', 'dm-row'), b = el('button', 'dm-class');
    b.type = 'button';
    const sw = el('span', 'dm-sw'); sw.style.background = c.c;
    b.append(sw, document.createTextNode(c.n));
    b.setAttribute('aria-pressed', String(lit[i]));
    b.classList.toggle('dim', !lit[i]);
    b.title = lit[i] ? 'Kliknutím tuto třídu schováte' : 'Kliknutím tuto třídu zase ukážete';
    b.onclick = () => { if (!datamap.toggle(i)) toast('Aspoň jedna třída musí zůstat zapnutá; mapu vypnete volbou Vypnuto.'); };
    const solo = el('button', 'dm-only', 'jen');
    solo.type = 'button'; solo.title = `Ukázat jen ${c.n}`; solo.setAttribute('aria-label', `Ukázat jen ${c.n}`);
    solo.onclick = () => datamap.solo(i);
    li.append(b, solo); ul.append(li);
  });
  const when = datamap.updated ? `, data k ${datamap.updated.split('-').reverse().join('. ')}` : '';
  const hint = el('p', 'livenote dm-hint', allLit ? 'Kliknutím třídu schováte, „jen“ ukáže jen tu jednu.' : `Kliknutím na název mapy (${def.radio ? DATAMAPS[def.radio].n : def.n}) rozsvítíte zase všechny třídy.`);
  box.append(ul, hint);
  // another view of the same data (Necítím se tu bezpečně ↔ Strach a kriminalita)
  if (def.alt && DATAMAPS[def.alt[0]] && shown(DATAMAPS[def.alt[0]].part || 'datamap')) {
    const [to, label] = def.alt, b = el('button', 'pbtn small dm-alt', label);
    b.type = 'button';
    b.onclick = () => { track('Vrstva', { vrstva: `dm-${to}`, stav: 'zap' }); setDatamap(to); };
    box.append(b);
  }
  box.append(el('p', 'livenote', `${def.what} Zdroj: ${def.source}${when}.`));
}
// a map that sets two data side by side (Strach a kriminalita): the legend is a table, the rows one data, the columns
// the other; a click on a cell switches its class off or on
function dmMatrix(box, def, lit) {
  const m = def.matrix, grid = el('div', 'dm-matrix');
  grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', `${def.n}: legenda`);
  grid.append(el('span', ''), ...m.cols.map(c => el('span', 'dm-mh col', c)));
  m.rows.forEach((r, ri) => {
    grid.append(el('span', 'dm-mh row', r));
    m.cells[ri].forEach(i => {
      if (i < 0) { const n = el('span', 'dm-mcell none'); n.title = 'nic z toho: šedá'; grid.append(n); return; }
      const c = def.classes[i], b = el('button', 'dm-mcell');
      b.type = 'button'; b.style.setProperty('--c', c.c);
      b.setAttribute('aria-label', c.n); // (only the colour: the row and the column say what it is)
      b.setAttribute('aria-pressed', String(lit[i])); b.classList.toggle('dim', !lit[i]);
      b.title = `${c.n}: ${lit[i] ? 'kliknutím schováte' : 'kliknutím zase ukážete'}`;
      b.onclick = () => { if (!datamap.toggle(i)) toast('Aspoň jedna třída musí zůstat zapnutá; mapu vypnete volbou Vypnuto.'); };
      grid.append(b);
    });
  });
  const when = datamap.updated ? `, data k ${datamap.updated.split('-').reverse().join('. ')}` : '';
  box.append(el('p', 'dm-intro', m.intro), grid, el('p', 'livenote dm-hint', 'Najeďte na dům: obě čísla vedle sebe. Kliknutím na políčko jeho barvu schováte.'));
  if (def.alt && DATAMAPS[def.alt[0]]) {
    const [to, label] = def.alt, b = el('button', 'pbtn small dm-alt', label);
    b.type = 'button'; b.onclick = () => { track('Vrstva', { vrstva: `dm-${to}`, stav: 'zap' }); setDatamap(to); };
    box.append(b);
  }
  box.append(el('p', 'livenote', `${def.what} Zdroj: ${def.source}${when}.`));
}
datamap.onChange(dmLegend);
// the value under the cursor: of the building under it, otherwise of the ground
function dmTip(sx, sy, X, Y) {
  const tip = $('dmTip');
  if (!tip) return;
  if (!state.datamap) { tip.hidden = true; return; }
  let v = 0, both = null;
  if (hover && !datamap.def().streets) { // (a map on the streets: always the ground under the cursor)
    const cx = Math.floor(hover[0][0] / CH), cy = Math.floor(hover[0][1] / CH);
    for (let dx = -1; dx <= 1 && !v; dx++) for (let dy = -1; dy <= 1 && !v; dy++) {
      const list = chunk(cx + dx, cy + dy), i = list ? list.indexOf(hover) : -1;
      if (i >= 0) { v = datamap.valueOf(`${cx + dx}_${cy + dy}`, i); if (datamap.def().fear) both = datamap.fearAt(`${cx + dx}_${cy + dy}`, i); }
    }
  } else v = datamap.valueAt(X, Y);
  // Strach a kriminalita over a building: both numbers side by side (the survey and the police)
  const txt = both ? `Anketa: ${both[0].toLocaleString('cs-CZ')} ${both[0] === 1 ? 'člověk se tu bojí' : both[0] >= 2 && both[0] <= 4 ? 'lidé se tu bojí' : 'lidí se tu bojí'} · Policie: ${both[1].toLocaleString('cs-CZ')} ${both[1] === 1 ? 'případ' : both[1] >= 2 && both[1] <= 4 ? 'případy' : 'případů'} za 10 let` : datamap.text(v);
  if (!txt) { tip.hidden = true; return; }
  tip.textContent = txt; tip.hidden = false;
  tip.style.left = `${Math.round(sx + 14)}px`; tip.style.top = `${Math.round(sy - 30)}px`;
}

// ------------------------------------------------------------------ panel, menu, dialogs
// tabs: each opens one pane under the search (on phones a sheet above the bottom bar); the open tab closes it
let openTab = null;
function setTab(t) {
  if (t && t !== openTab) track('Panel', { co: t });
  if (t === 'explore' && isPhone() && !$('card').hidden) card.keepRoute = true; // (a phone closes the card for the tab just below: the route of that card stays for its list)
  if (openTab === 'explore' && t !== 'explore' && $('card').hidden && city.route().r) clearRoute(); // (the list left with no card of the route open)
  openTab = t;
  document.querySelectorAll('#tabs [data-tab]').forEach(b => b.setAttribute('aria-expanded', String(b.dataset.tab === t)));
  for (const p of document.querySelectorAll('#panel .pane')) p.hidden = p.id !== `pane-${t}`;
  document.body.classList.toggle('pane-open', !!t);
  document.body.dataset.tab = t || ''; // (a computer: what belongs to Více shows with it, style.css)
  paintModes();
  if (t && isPhone()) { if (!$('card').hidden) $('cardClose').click(); if (!$('events').hidden) setEventsOpen(false); if (!$('aktual').hidden) setAktOpen(false); if (zprOpen()) setZprOpen(false); $('fcPop').hidden = true; }
  if (t === 'explore') fillProjects(); // (also for the count in the heading of Projekty města)
  if (t === 'layers' && layerFind) layerFind.refresh(); // ("Jen zapnuté" still pressed: what is on now)
  offer(); // (a computer: the offer under the empty search field stands only while no tab is open)
}
const panelShut = () => document.body.classList.contains('panel-shut');
function setShut(on) { document.body.classList.toggle('panel-shut', on && !isPhone()); paintModes(); offer(); }
function paintModes() {
  const sp = !!(spojeni && spojeni.active()), on = !openTab && !panelShut();
  if ($('tabFind')) $('tabFind').setAttribute('aria-pressed', String(on && !sp));
  if ($('tabSpoj')) $('tabSpoj').setAttribute('aria-pressed', String(on && sp));
}
document.querySelectorAll('#tabs [data-tab]').forEach(b => (b.onclick = () => { const off = openTab === b.dataset.tab; setTab(off ? null : b.dataset.tab); if (off) setShut(false); }));
document.querySelectorAll('#panel .pane-close').forEach(b => (b.onclick = () => { setTab(null); setShut(false); }));
if ($('tabFind')) $('tabFind').onclick = () => {
  if (!openTab && !panelShut() && !(spojeni && spojeni.active())) { setShut(true); return; } // (the search is what stands there: folded)
  track('Panel', { co: 'hledat' });
  if (openTab) setTab(null);
  if (spojeni && spojeni.active()) spojeni.close();
  setShut(false);
  $('q').focus();
};
if ($('tabSpoj')) {
  // (its icon: the one of the square that opens Spojení from the corner of the map, #spojGo)
  { const ico = $('spojGo') && $('spojGo').querySelector('svg'); if (ico) $('tabSpoj').querySelector('.ti').replaceChildren(ico.cloneNode(true)); }
  $('tabSpoj').onclick = () => {
    if (!spojeni) return;
    if (!openTab && !panelShut() && spojeni.active()) { spojeni.close(); setShut(false); return; }
    track('Panel', { co: 'spojeni' });
    spojeni.start(); // (the panel comes with Spojení and the caret in its first empty field: openPanel below)
  };
}
// What lies on top of the map, closed one at a time: a dialog (help, data, forecast, a big picture, the reader), the
// open tab, the weather overview, Události, the card, Aktuálně. True when something was closed.
function closeTop() {
  const dl = [...document.querySelectorAll('dialog[open]')];
  if (dl.length) { dl[dl.length - 1].close(); return true; }
  if (openTab) { setTab(null); setShut(false); return true; } // (as its ×: back to the search or Spojení)
  if (!$('fcPop').hidden) { setFcOpen(false); return true; }
  if (!$('events').hidden) { setEventsOpen(false); return true; }
  if (!$('card').hidden) { const back = isPhone() && card.fromTab; card.keepRoute = !!back && back.tab === 'explore'; $('cardClose').click(); if (back) backToTab(back); return true; }
  if (!$('aktual').hidden) { setAktOpen(false); return true; }
  if (zprOpen()) { setZprOpen(false); return true; }
  return false;
}
// Esc: the same everywhere (a dialog closes itself; the search field and the menu of a tile take their own Esc first)
addEventListener('keydown', e => {
  if (e.key === 'Escape' && pickDone) { pickCancel(); return; } // (a point awaited by Spojení: only that is given up)
  if (e.key !== 'Escape' || document.querySelector('dialog[open], .qt-menu')) return;
  if (document.activeElement === $('q') && ($('results').children.length || !$('noResults').hidden)) return;
  { const a = document.activeElement; if (a && a.matches('.mj-name, .mj-tagnew')) return; } // (a name or a new tag in Moje: Esc gives up the field only, src/moje.js)
  { const a = document.activeElement; if (a && a.matches('.lfind-box input') && a.closest('.pane.finding')) return; } // (the search of a pane, Vrstvy or Objevuj: the first Esc gives the whole pane back, src/panefind.js)
  closeTop();
}, true);
// The Back button (and the back gesture of a phone) closes what is open instead of leaving the map: while something is
// open, one extra entry sits in the history; Back takes it and closes the top thing; closing everything by hand takes
// the entry away again. On a computer the tabs of the panel are no overlay, so they do not count.
const overlayOpen = () => !!(document.querySelector('dialog[open]') || (isPhone() && openTab) || !$('card').hidden || !$('events').hidden || !$('aktual').hidden || zprOpen() || !$('fcPop').hidden);
let histSkip = 0, histPopAt = 0, histHashAt = 0;
if (history.state && history.state.b2kOverlay) history.replaceState(null, ''); // (a reload with something open: the entry is plain again)
function histSync() {
  if (histSkip) return; // (our own step back is on its way)
  const has = !!(history.state && history.state.b2kOverlay);
  // (the card of a link: once it has been seen and everything is closed again, from now on as usual)
  if (card.histLink) { if (overlayOpen()) card.histLinkSeen = true; else if (card.histLinkSeen) card.histLink = card.histLinkSeen = false; }
  if (overlayOpen()) { if (!has && !card.histLink) history.pushState({ b2kOverlay: 1 }, ''); }
  else if (has) { histSkip++; histPopAt = Date.now(); history.back(); }
}
addEventListener('popstate', () => {
  if (histSkip) { histSkip--; histPopAt = Date.now(); histSync(); return; }
  // (our own jump to a #… address raises popstate too: it is no step back. Taken for one, it closed the card open under
  // the window Seznam míst, the closing card wiped the new address and the place asked for never opened, 2026-11-16)
  if (Date.now() - histHashAt < 400) { histHashAt = 0; return; }
  if (overlayOpen()) { histPopAt = Date.now(); closeTop(); }
  histSync();
});
new MutationObserver(() => { histSync(); placeTop(); reAim(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
// (older callers: closing the panel = closing the open pane, and on phones the fold-outs under the search too)
function setPanelOpen(open) { if (!open) { setTab(null); if (isPhone()) document.querySelectorAll('#panel .quick details[open]').forEach(d => (d.open = false)); } }
function setPw() { document.documentElement.style.setProperty('--pw', `${$('panel').offsetWidth}px`); }
setPw();
addEventListener('resize', setPw);
function setFolded(folded) {
  document.body.classList.toggle('folded', folded);
  $('tuck').querySelector('.tuck-arrow').textContent = folded ? '›' : '‹';
  $('tuck').setAttribute('aria-expanded', String(!folded));
  $('tuck').setAttribute('aria-label', folded ? 'Vysunout panel' : 'Zasunout panel');
  $('tuck').title = folded ? 'Vysunout panel' : 'Zasunout panel';
}
$('tuck').onclick = $('panelClose').onclick = () => {
  const folded = !document.body.classList.contains('folded');
  setFolded(folded);
  // a phone on its side: the same choice as the top bar of an upright phone (remembered, and kept when it turns)
  if (isLandPhone()) setBarMin('top-min', folded);
  if (folded && document.activeElement === $('panelClose')) $('tuck').focus(); // (the × goes away with the panel: the keyboard lands on the ☰)
};
$('help').onclick = () => { track('Panel', { co: 'napoveda' }); $('helpDlg').showModal(); };
// Kontrastní zobrazení: black panels, white text and strong lines, for people who need more contrast (style.css,
// :root[data-kontrast]). The ◐ button stands beside ? on a computer and at the end of the row above the search field
// on a phone. The choice is kept in this browser; the script at the top of <body> applies it before the first paint
// (with no choice made, the system's wish for more contrast decides).
{
  const btns = document.querySelectorAll('.kontrast-btn');
  const paint = () => { const on = document.documentElement.hasAttribute('data-kontrast'); for (const b of btns) b.setAttribute('aria-pressed', String(on)); };
  for (const b of btns) b.onclick = () => {
    const on = document.documentElement.toggleAttribute('data-kontrast');
    try { localStorage.setItem('b2k-kontrast', on ? '1' : '0'); } catch (e) { /* private mode: lasts until a reload */ }
    paint();
  };
  paint();
}
// "Licence a autorství" in the help: the link in "Kdo za aplikací stojí" (a.lic-link) and the address #licence (the page
// /o-mape links it) open the help at that section
const openLicence = () => { track('Panel', { co: 'licence' }); if (!$('helpDlg').open) $('helpDlg').showModal(); $('licence').scrollIntoView({ block: 'start' }); };
document.addEventListener('click', e => { const a = e.target.closest ? e.target.closest('a.lic-link') : null; if (a) { e.preventDefault(); openLicence(); } });
if (location.hash === '#licence') { history.replaceState(history.state, '', location.pathname + location.search); openLicence(); }
// the sections of the panel that open by themselves (details): which ones people unfold
for (const [id, co] of [['storiesBox', 'pribehy'], ['routesBox', 'trasy'], ['liveBox', 'projekty'], ['legendBox', 'legenda']]) { const d = $(id); if (d) d.addEventListener('toggle', () => { if (d.open && !d.closest('.pane').matches('.finding, .lf-settling')) track('Panel', { co }); }); } // (not the lists opened by the search of the pane, nor put back after it)
{
  const d = document.querySelector('#panel details.about');
  if (d) {
    d.addEventListener('toggle', () => { if (d.open && !d.dataset.quiet) track('Panel', { co: 'jak-vzniklo' }); delete d.dataset.quiet; });
    // (in Více on a computer its title is a plain heading: a click or Enter on it folds nothing)
    d.querySelector('summary').addEventListener('click', e => { if (!isPhone() && openTab === 'more') e.preventDefault(); });
  }
}
$('helpClose').onclick = () => $('helpDlg').close();
// the map on the home screen of a phone: the tip and the button in Více (src/install.js)
createInstall({ toast, button: $('installOpen'), base: BASE, onOpen: () => setTab(null) });
// Moje (src/moje.js): the star in the cards, the visitor's own menu (the tab with the head, before Více), the offer
// under the empty search and "můj spoj"
if (shown('moje')) {
  moje = createMoje({
    $, el, toast, track, layers, flyTo, fitPair,
    openPlace: slug => openPlaceLink(slug),
    openPoint: (la, lo) => { const [X, Y] = layers.llToImg(lo, la); flyTo(X, Y, Math.max(isPhone() ? 5 : 6, view().z)); fx.marker(X, Y, 7000); openAtPoint(la, lo, false); },
    openStop: num => layers.mhd.loadStops().then(() => showStopByNum(num)),
    // a view of the map to keep: where, how close and which layers (the link of Sdílet with every layer said), and a
    // name to start with: the quarter or the place nearest to its middle
    viewHash: () => shareUrl(true).split('#')[1],
    viewName: () => {
      if (view().z < 0.15) return 'Celé Brno';
      const c = viewer.viewport.getCenter(true), X = c.x * GEO.W, Y = c.y * GEO.W;
      let best = null, bd = Infinity;
      for (const l of data.labels || []) { const dd = Math.hypot(l.X - X, (l.Y - Y) * 2); if (dd < bd) { bd = dd; best = l; } }
      return best ? best.n : 'Pohled na mapu';
    },
    // … and opened again: what the kept view does not have (a highlight, a datová mapa) goes first
    openView: h => {
      const m = `#${h}`.match(VIEW_RE);
      if (!m) return;
      if (state.focus && !/&f=/.test(h)) setFocus(null);
      if (state.datamap && !m[8]) setDatamap(null);
      history.replaceState(history.state, '', `#${h}`);
      restoreFromHash(false, true);
    },
    startRide: m => startRide(m), riding: () => !!ride,
    showMhd: () => { if (!state.layers.mhd) setLayer('mhd', true); },
    openMenu: () => setTab('moje'), closeMenu: () => { if (isPhone()) setTab(null); },
    cardOpen: () => !$('card').hidden,
    isPhone,
    changed: () => offer(), // (something kept, removed or searched for: the offer under the empty search field anew)
    // a journey kept (the star in Spojení): its ends back in the form, searched from now
    openTrip: h => { if (spojeni) spojeni.fromHash(`#${h}`, true); },
  });
  offer(); // (a computer: what is kept and what was searched for lately stands under the empty search field from the start)
  // brno2000.cz/?spoj (the shortcut "Můj spoj" of the installed app): the connection of this moment, opened at once
  if (new URLSearchParams(location.search).has('spoj')) ready.then(() => setTimeout(() => moje.openSpoj('zkratka'), 1200));
}

// Spojení (src/spojeni.js, src/raptor.js): the switch "Hledat / ⇄ Spojení" above the search, the journeys from a stop,
// a place, an address or where one stands to another, with changes, live delays and the vehicle that comes;
// "Odsud / Sem" in the stop card, "Cesta sem" in the cards of places, the link #spojeni/…
if (shown('spojeni')) {
  spojeni = createSpojeni({
    $, el, layers, card, toast, track, fitFree, setLayer, state, isPhone,
    fav: moje ? r => moje.star(r) : null, // (the star of Moje in the form: the journey kept as its two ends)
    walkUrl: `${BASE}data/r${ROT}/walkgraph.json`,
    // the figure walking the walks in real time (src/chodec.js): the houses in front of it step back
    walker: shown('chodec') ? { occluder: (X, Y) => occluderAt(X, Y), veil: (ctx, v, t, houses) => layers.veil(ctx, v, t, houses), lite: () => fx.lite } : null,
    // the weather of the journey's walks and waits (src/vzit.js), from the forecast panel's data
    weather: () => forecastReady.then(f => f.outlook()),
    startRide: m => startRide(m), stopRide: () => stopRide(), riding: () => { try { return ride; } catch { return null; } }, // (ride is declared further down)
    // (a computer: Spojení is one of the things under the row of the panel, so the open pane goes and what was folded comes back)
    openPanel: () => { if (document.body.classList.contains('folded')) setFolded(false); if (isPhone()) { setTab(null); if (document.body.classList.contains('top-min')) setBarMin('top-min', false); } else { if (openTab) setTab(null); setShut(false); } },
    onMode: () => { paintModes(); offer(); },
    // for the bar of a journey (src/spojstav.js): how the visitor moves (only with "Moje poloha" on) and the line of the
    // vehicle the map rides with, so that Nastoupit in any card counts as getting on
    motion: () => geoMotion(), ridingLine: () => rideLine,
    // the places and addresses of the search as ends of a journey: [{ n, k, lon, lat }]
    placeSearch: async q => {
      const nq = norm(q.trim());
      if (nq.length < 2) return [];
      const idx = await loadIndex(), starts = [], inner = [];
      for (const it of idx) {
        if (it.paro || !Number.isFinite(it.X)) continue;
        const p = it.q.indexOf(nq);
        if (p === 0) starts.push(it); else if (p > 0 && (it.q[p - 1] === ' ' || it.q[p - 1] === '.')) inner.push(it);
        if (starts.length > 12) break;
      }
      const uniq = [];
      for (const it of [...starts, ...inner]) { if (!uniq.some(u => u.n === it.n && Math.hypot(u.X - it.X, (u.Y - it.Y) * 2) < 150 * GEO.A)) uniq.push(it); if (uniq.length >= 6) break; }
      return uniq.map(it => { const [lon, lat] = imgToLonLat(it.X, it.Y); return { n: it.n, k: it.k, lon, lat }; });
    },
    // an end clicked in the map ("Vybrat v mapě"): the next click as { lon, lat, name } or { num, name } (a stop), null = given up
    pickPoint, pickCancel,
    // where the visitor stands, only when "Moje poloha" is on (never asked for): [lon, lat] or null
    whereAmI: () => (geo.mode !== 'off' && geo.pos ? [geo.pos[0], geo.pos[1]] : null),
    // where the visitor stands: [lon, lat], asked for when not known yet (the button of my position does the same)
    myPos: async () => {
      if (!geo.pos && geo.mode === 'off') geoStart();
      for (let i = 0; i < 80 && !geo.pos && geo.mode !== 'off'; i++) await new Promise(r => setTimeout(r, 250));
      return geo.pos && inBrno(geo.pos[0], geo.pos[1]) ? [geo.pos[0], geo.pos[1]] : null;
    },
  });
  // the square left of my position (bottom right): the panel opens in Spojení, the cursor in "Odkud"
  if ($('spojGo')) $('spojGo').onclick = () => { track('Nástroj', { nastroj: 'spojeni', hodnota: 'tlacitko' }); spojeni.start(); };
}

// ------------------------------------------------------------------ overview of all data in the map
let datasets = null;
const MODE = { live: ['živě', 'm-live'], regular: ['obnovováno', 'm-regular'], snapshot: ['stav k datu', 'm-snapshot'] };
const fmtNum = n => (n == null ? '–' : n.toLocaleString('cs-CZ'));
const czDay = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('cs-CZ') : '');
function renderData() {
  const q = $('dataSearch').value.trim().toLowerCase();
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const qn = norm(q);
  const list = datasets.filter(d => !qn || norm([d.name, d.what, d.owner, d.licence, d.note, MODE[d.mode][0], d.unit].join(' ')).includes(qn));
  const by = $('dataSort').value;
  const order = { live: 0, regular: 1, snapshot: 2 };
  list.sort((a, b) => by === 'name' ? a.name.localeCompare(b.name, 'cs')
    : by === 'date' ? (order[a.mode] - order[b.mode]) || (b.date || '').localeCompare(a.date || '')
      : by === 'mode' ? (order[a.mode] - order[b.mode]) || a.name.localeCompare(b.name, 'cs')
        : (b.count ?? -1) - (a.count ?? -1) || a.name.localeCompare(b.name, 'cs'));
  // highlight the searched words
  const hi = (text, cls) => {
    const e = el('span', cls);
    const t = text || '';
    if (!qn) { e.textContent = t; return e; }
    const i = norm(t).indexOf(qn);
    if (i < 0) { e.textContent = t; return e; }
    e.append(t.slice(0, i), el('mark', '', t.slice(i, i + qn.length)), t.slice(i + qn.length));
    return e;
  };
  $('dataRows').replaceChildren(...list.map(d => {
    const tr = el('tr');
    const c1 = el('td'); c1.append(hi(d.name, 'dname'), el('br'), hi(d.what, 'dwhat'));
    const c2 = el('td'); c2.append(hi(d.owner, ''), el('br'), hi(d.licence ? `Licence: ${d.licence}` : '', 'dnote'));
    if (d.links && d.links.length) { const l = el('div', 'dlinks'); for (const [label, href] of d.links) { const a = el('a', '', `${label} ↗`); a.href = safeUrl(href); a.target = '_blank'; a.rel = 'noopener'; l.append(a); } c2.append(l); }
    const c3 = el('td', 'num'); c3.append(el('span', '', fmtNum(d.count)), el('br'), el('span', 'dnote', d.unit || ''));
    const c4 = el('td'); const [mt, mc] = MODE[d.mode]; c4.append(el('span', mc, mt));
    if (d.period) c4.append(el('br'), el('span', 'dnote', `data ${d.period}`));
    if (d.date) c4.append(el('br'), el('span', 'dnote', `${d.period ? 'zpracováno ' : ''}${czDay(d.date)}`));
    if (d.note) c4.append(el('br'), el('span', 'dnote', d.note));
    tr.append(c1, c2, c3, c4);
    return tr;
  }));
  $('dataCount').textContent = `${list.length} z ${datasets.length} datových sad.`;
}
// the two tabs of the dialog: the table of the data, the ready-made links
function dataTab(t) {
  document.querySelectorAll('#dataTabs [data-t]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
  $('dataPaneData').hidden = t !== 'data'; $('dataLinks').hidden = t !== 'links';
}
document.querySelectorAll('#dataTabs [data-t]').forEach(b => (b.onclick = () => { track('Panel', { co: `data-${b.dataset.t}` }); dataTab(b.dataset.t); }));
const SITE_HOST = (SITE_CFG.siteUrl || location.origin).replace(/^https?:\/\//, '').replace(/\/$/, '');
async function openData(e) {
  if (e) e.preventDefault();
  track('Panel', { co: 'data' });
  if (!datasets) { try { datasets = await freshenDatasets(await loadShared('datasets.json'), BASE); } catch { datasets = []; } }
  renderData();
  const themes = THEMES.filter(t => shown(t.part) && FOCUS_KINDS[t.kind]);
  $('dataLinkList').replaceChildren(...themes.map(t => {
    const li = el('li'), a = el('a', '', `${SITE_HOST}/${t.slug}`);
    a.href = `./${t.slug}`;
    a.onclick = ev => { ev.preventDefault(); $('dataDlg').close(); track('Odkaz', { co: `tema-${t.kind}` }); setFocus(t.kind, { fit: true }); };
    li.append(a, ' ', el('b', '', t.title), el('br'), el('span', 'dnote', t.desc));
    return li;
  }));
  $('dataTabs').hidden = !themes.length; // (no public theme: the table alone, as before)
  dataTab('data');
  if ($('helpDlg').open) $('helpDlg').close();
  $('dataDlg').showModal();
}
$('dataOpen').onclick = openData;
$('dataOpen2').onclick = openData;
$('dataClose').onclick = () => $('dataDlg').close();
$('dataSearch').addEventListener('input', () => datasets && renderData());
$('dataSort').addEventListener('change', () => datasets && renderData());
for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', e => {
  if (e.target !== d) return;
  const r = d.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
});
// "Kdo za aplikací stojí" from the help: the fold-out under the search, as the logo over the map opens it
$('aboutOpen').onclick = e => { e.preventDefault(); $('helpDlg').close(); $('brand').click(); };
const FRAMES = {
  places: { title: 'Seznam míst', src: './misto/' },
  media: { title: 'Pro média', src: 'https://media.brno2000.cz/kit/index.html' },
};
function openFrame(kind) {
  const f = FRAMES[kind];
  track('Panel', { co: kind === 'media' ? 'pro-media' : 'seznam-mist' });
  $('frameTitle').textContent = f.title;
  if ($('frameBox').dataset.kind !== kind) {
    const box = document.createElement('iframe');
    box.id = 'frameBox'; box.title = f.title; box.dataset.kind = kind; box.src = f.src;
    box.addEventListener('load', () => frameLinks(box));
    $('frameBox').replaceWith(box);
  }
  $('frameDlg').showModal(); // (Více stays open under it: × brings the visitor back to it, as with the Přehled dat)
}
function frameLinks(box) {
  let doc; try { doc = box.contentDocument; } catch { return; } // (the press kit: another origin)
  if (!doc) return;
  doc.addEventListener('click', ev => {
    const a = ev.target.closest && ev.target.closest('a[href]');
    if (!a || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    const u = new URL(a.href, doc.baseURI);
    if (u.origin !== location.origin) { a.target = '_blank'; a.rel = 'noopener'; return; }
    ev.preventDefault();
    if (/^\/misto(\/|$)/.test(u.pathname)) { box.contentWindow.location.replace(u.href); return; } // (a page of a place, inside the frame)
    $('frameDlg').close();
    if (u.hash) { setTab(null); histHashAt = Date.now(); location.hash = u.hash; } // (Více closes: the place and its card are what was asked for; the popstate of this jump is ours, see histSync)
    else if (/^\/data/.test(u.pathname)) openData();
  });
}
$('frameClose').onclick = () => $('frameDlg').close();
$('placesOpen').onclick = () => openFrame('places');
if ($('mediaOpen')) $('mediaOpen').onclick = () => openFrame('media');
$('fbShare').addEventListener('click', () => { track('Sdílení', { co: 'pohled', jak: 'facebook' }); $('fbShare').href = fbUrl(location.href); });
// the share on Facebook offered right in the message after a link is copied (on a computer; a phone has its own
// share sheet with Facebook in it)
const fbUrl = u => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`;
function fbAction(url, co) { return ['Sdílet na Facebooku', () => { track('Sdílení', { co, jak: 'facebook' }); window.open(fbUrl(url), '_blank', 'noopener,width=640,height=600'); }]; }

// ------------------------------------------------------------------ controls
$('zoomIn').onclick = () => { touched = true; viewer.viewport.zoomBy(1.6); };
$('zoomOut').onclick = () => { touched = true; viewer.viewport.zoomBy(1 / 1.6); };
$('home').onclick = () => { track('Nástroj', { nastroj: 'domu' }); goHome(); };
function toast(msg, ms = 2600, action = null, high = false) { // (action: [label, fn], a button at the end of the message; high: at the top on phones, style.css)
  const t = $('toast');
  t.textContent = msg; t.hidden = false; t.classList.toggle('high', high);
  if (action) { const b = el('button', 'pbtn small', action[0]); b.type = 'button'; b.onclick = () => { t.hidden = true; action[1](); }; t.append(b); }
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
}
// The map opened while it is dark in Brno: the daylight is offered once a day in a message that goes away by itself
// (the lasting way is the Vzhled tab, which shows a moon meanwhile)
setTimeout(() => {
  if (klidOn || state.datamap || dayLock || state.night < 0.5 || !($('clockLive').checked && $('liveWeather').checked)) return;
  const day = new Date().toDateString();
  try { if (localStorage.getItem('b2k-night-offer') === day) return; localStorage.setItem('b2k-night-offer', day); } catch { /* private mode */ }
  toast('V Brně je tma.', 7000, ['Ukázat den', () => { lookFromLink = false; track('Nástroj', { nastroj: 'ukazat-den', hodnota: 'zap' }); setDayLock(true); }]);
}, 6000);
// The link to this view: #@lat,lon,m/px[,season,night,weather,rotation,datamap] and, after "&", named parts:
//   v=1132302+monuments-paro  the level of every quick tile (order of GROUPS, 0 = off) and the switches that differ
//                             from it (ticked by hand) or, outside the tiles, from the start of the page
//   f=paro                    the highlighted kind (beacons), FOCUS_KINDS
//   m=vila-tugendhat          the open card of a place with a link (#misto/…); k=lat,lon the open card of anything else
//   l=leto | l=poledne | l=den  the summer look / noon and clear in the season of the day the link is opened (the watch) /
//                             "Ukázat den"; without it the map opens as it is in Brno now
//   p=1 | p=0                 the top (the panel on a computer and a phone on its side, the top bar of an upright
//                             phone) unfolded / hidden; always in the link
// The look is kept only when chosen: by default a link opens live (a view shared in the evening is not night forever).
// Card kinds that make no sense to reopen at a point: a vehicle (it moves on), a street photo, a search, a route, a quarter.
const NO_PICK = new Set(['vozidlo', 'pano', 'hledani', 'trasa', 'ctvrt', 'pribeh']);
// (whole: a view kept in Moje, src/moje.js: every layer is said, also those that are as at the start, so that opening
// the view brings back exactly these; without the fold of the top, which is of the moment, and never the link of a
// journey; its point is the middle of the whole map, viewTo puts it back there)
function shareUrl(whole = false) {
  // a journey of Spojení on the map (and no other card in front of it): the link of the journey, #spojeni/… (audit
  // 2026-11-15: the share button gave a bare view). The receiver's search runs from their now (or the chosen time).
  const cur0 = !$('card').hidden && card.cur;
  const sj = !whole && spojeni && (!cur0 || cur0.kind === 'spojeni') ? spojeni.link() : null;
  if (sj) { shareUrl.has = ['spojení']; shareUrl.me = sj.includes('/ja'); return `${location.origin}${location.pathname}${sj}`; }
  shareUrl.me = false;
  // the point in the free middle of the map (beside the panel and the card), not the middle of the whole map: a link
  // opens with its point there (flyTo → aimAt), so a view written and opened again stays in place (it went half the
  // panel west on every round)
  const [sx, sy] = freeCentre();
  const c = whole ? viewer.viewport.getCenter(true) : viewer.viewport.viewerElementToViewportCoordinates(new OpenSeadragon.Point(sx, sy), true);
  const v = view();
  const [lon, lat] = imgToLonLat(c.x * GEO.W, c.y * GEO.W);
  const mpp = (1 / GEO.A / v.k).toFixed(whole ? 3 : 2);
  const live = $('clockLive').checked && $('liveWeather').checked, noon = isNoonLook(), summer = !noon && isSummerLook();
  const custom = !live && !summer && !noon && !state.datamap; // (a datová mapa sets its own daylight)
  const extra = [custom ? state.season : '', custom ? Math.round(state.night * 100) : '', custom && state.weather !== 'clear' ? state.weather : '', ROT ? `r${ROT}` : '', state.datamap ? `d${state.datamap}` : ''];
  while (extra.length && extra[extra.length - 1] === '') extra.pop();
  const parts = [], has = [];
  const { digits, odd } = quick.code();
  let more = odd;
  for (const k of Object.keys(LAYER_DEFAULT)) if (!TILE_LAYERS.has(k) && $(`lay-${k}`) && (whole || !!state.layers[k] !== !!LAYER_DEFAULT[k])) more += `${state.layers[k] ? '+' : '-'}${k}`;
  const defDigits = GROUPS.map(g => g.def).join('');
  if (whole || digits !== defDigits || more) { parts.push(`v=${digits}${more}`); has.push('vrstvy'); }
  if (state.focus) { parts.push(`f=${state.focus}`); has.push('zvýraznění'); }
  const cur = !$('card').hidden && card.cur;
  if (cur && cur.link) { parts.push(`m=${cur.link}`); has.push('vybrané místo'); }
  else if (cur && cur.part) { parts.push(cur.part); has.push(cur.kind === 'zastavka' ? 'zastávka' : cur.kind === 'hledani' ? 'vybrané místo' : 'událost'); }
  else if (cur && !NO_PICK.has(cur.kind) && Number.isFinite(cur.lat) && cur.lat) { parts.push(`k=${cur.lat.toFixed(6)},${cur.lon.toFixed(6)}`); has.push('vybrané místo'); }
  if (noon) parts.push('l=poledne');
  else if (summer) parts.push('l=leto');
  else if (dayLock && live) parts.push('l=den');
  if (!whole) parts.push(`p=${topHidden() ? 0 : 1}`);
  shareUrl.has = has;
  shareUrl.only = !!cur && !has.some(h => h !== 'vrstvy' && h !== 'zvýraznění'); // (a card open that the link will not open)
  return `${location.origin}${location.pathname}#@${lat.toFixed(whole ? 6 : 5)},${lon.toFixed(whole ? 6 : 5)},${mpp}${extra.length ? ',' + extra.join(',') : ''}${parts.map(p => '&' + p).join('')}`;
}
async function share() {
  const url = shareUrl();
  const what = ['pohled', ...shareUrl.has].join(', ').replace(/, ([^,]*)$/, ' a $1');
  track('Sdílení', { co: 'pohled', jak: navigator.share && matchMedia('(max-width: 640px)').matches ? 'share' : 'schranka' });
  history.replaceState(history.state, '', url);
  try {
    if (navigator.share && matchMedia('(max-width: 640px)').matches) await navigator.share({ title: 'Brno 2000', url });
    else { await navigator.clipboard.writeText(url); toast(shareUrl.has[0] === 'spojení' ? `Odkaz na spojení je zkopírovaný.${shareUrl.me ? ' Odkud je „Moje poloha“: příjemci se cesta najde z jeho polohy.' : ''} Příjemci se spoje hledají znovu podle jízdního řádu.` : shareUrl.only ? 'Odkaz je zkopírovaný: jen pohled, tahle karta se v něm neotevře' : shareUrl.has.length ? `Odkaz je zkopírovaný: ${what}` : 'Odkaz na tento pohled je zkopírovaný', 7000, fbAction(url, 'pohled')); }
  } catch { toast('Odkaz je v adresním řádku', 6000, fbAction(url, 'pohled')); }
}
$('share').onclick = share;
$('shareTop').onclick = share;
// "Vila Tugendhat" -> "vila-tugendhat"
function placeSlug(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function wikiPoiName(p) { return p[0].length <= 3 && p[1].length > p[0].length ? p[1].replace(/\s*\([^)]*\)$/, '') : p[0]; }
// open a place from its link: stories, Wikipedia tags, GO TO BRNO places, city projects
async function openPlaceLink(slug, { stay = false } = {}) {
  await ready; await city.load();
  const flyTo = stay ? () => {} : flyToMap; // (a link with its own view (#@…&m=) keeps it: card and marker only)
  for (let i = 0; i < 40 && !(layers.proj.list && data.wikiPois.length); i++) await new Promise(r => setTimeout(r, 250));
  // from a link the reader has not seen the map yet: closer than from the list (1 px = 1 m) and the marker stays longer
  const Z = isPhone() ? 5 : 6, ZP = 3, MS = 7000;
  card.fromLink = true; // the card counts as opened from a link (src/stats.js)
  const story = data.stories.find(s => placeSlug(s.n) === slug);
  if (story) { openStory(story); flyTo(story.X, story.Y, Math.max(Z, view().z)); fx.marker(story.X, story.Y, MS); return; }
  // (by the article's name, or by the tag itself: the links shared before 9. 11. 2026 were #misto/a)
  const w = data.wikiPois.find(p => placeSlug(wikiPoiName(p)) === slug) || data.wikiPois.find(p => placeSlug(p[0]) === slug);
  if (w) { flyTo(w[2], w[3], Math.max(Z, view().z)); showWikiPoi(w); fx.marker(w[2], w[3], MS); return; }
  city.positions();
  const pl = city.data.places.find(p => placeSlug(p.n) === slug);
  if (pl) { flyTo(pl.X, pl.Y, Math.max(Z, view().z)); showPlace(pl); fx.marker(pl.X, pl.Y, MS); return; }
  const pr = (layers.proj.list || []).find(p => placeSlug(p.cb ? p.cb.t : p.n) === slug);
  if (pr) { const [X, Y] = layers.llToImg(pr.g[0][0], pr.g[0][1]); flyTo(X, Y, Math.max(ZP, view().z)); showProject(pr); fx.marker(X, Y, MS); return; }
  // Kameny zmizelých: #misto/kameny-<the address> (the layer is switched on with the card)
  if (slug.startsWith('kameny-') && shown('kameny')) {
    await city.kameny(); city.positions();
    const kp = city.data.kameny.find(p => `kameny-${p.slug}` === slug);
    if (kp) { setLayer('smStolper', true); flyTo(kp.X, kp.Y, Math.max(Z, view().z)); showKamen(kp); fx.marker(kp.X, kp.Y, MS); return; }
  }
  // a railway station: #misto/vlaky-hlavni-nadrazi (the layer is switched on with the card)
  if (VLAKY_ON && slug.startsWith('vlaky-')) {
    await needVlaky(); await vlaky.load(); vlaky.positions();
    const st = vlaky.byId(slug.slice(6));
    if (st) { setLayer('vlaky', true); flyTo(st.X, st.Y, Math.max(Z, view().z)); showStation(st); fx.marker(st.X, st.Y, MS); return; }
  }
  // a car park: #misto/domini-park (the layer is switched on with the card)
  if (PARKING_ON && (await parking.info()).some(i => i.id === slug)) {
    await parking.load(); parking.positions();
    const pk = parking.data.items.find(o => o.id === slug);
    if (pk && pk.X != null) { setLayer('parking', true); flyTo(pk.X, pk.Y, Math.max(Z, view().z)); showParking(pk); fx.marker(pk.X, pk.Y, MS); return; }
  }
  await paro.load(); paro.positions();
  const pa = paro.data.items.find(p => placeSlug(p.n) === slug);
  if (pa) { if (!pa.city) flyTo(pa.X, pa.Y, Math.max(ZP, view().z)); showParo(pa, false, MS); return; }
  card.fromLink = false;
  track('Chyba', { co: 'misto-nenalezeno', detail: slug });
  toast('Místo z odkazu jsem nenašel');
}
// a #misto/ link pasted or clicked while the map is already open
window.addEventListener('hashchange', () => { if (Date.now() - histPopAt < 800) return; if (/^#(misto\/|tema\/|spojeni\/|udalost\/|@)/.test(location.hash)) restoreFromHash(); }); // (not after our own step in the history, see histSync)
// // (also a #@ link pasted into the open map)
// (immediately = false: a flight instead of a jump; kept: a view kept in Moje, put back exactly and not counted as a
// link opened; VIEW_RE: the view of a link, declared with viewTo above)
function restoreFromHash(immediately = true, kept = false) {
  // a journey (src/spojeni.js): #spojeni/<a>/<b>[&o=HHMM|&p=HHMM]
  if (location.hash.startsWith('#spojeni/')) { if (spojeni) spojeni.fromHash(location.hash); return; }
  const lm = location.hash.match(/^#misto\/([a-z0-9-]+)/);
  if (lm) { openPlaceLink(lm[1]); return; }
  const um = location.hash.match(/^#udalost\/([a-z]+)\/([^/@]+)(?:@([\d.]+),([\d.]+))?/);
  if (um) { track('Odkaz', { co: `udalost-${um[1]}` }); openEventLink(um[1], decodeURIComponent(um[2]), um[3] ? [+um[4], +um[3]] : null); return; }
  const tm = location.hash.match(/^#tema\/([a-z]+)/);
  if (tm) { if (FOCUS_KINDS[tm[1]] && $(`lay-${focusLayer(tm[1])}`)) { track('Odkaz', { co: `tema-${tm[1]}` }); setFocus(tm[1], { fit: true }); } return; }
  const m = location.hash.match(VIEW_RE);
  if (!m) return;
  // (older shared links may carry a rotation: the map now always has north up)
  const [X, Y] = lonLatToImg(+m[2], +m[1]);
  if (kept) viewTo(X, Y, 2 / +m[3], immediately); else flyTo(X, Y, 2 / +m[3], immediately);
  restoreRest(m);
  restoreParts(location.hash, kept);
}
async function openEventLink(kind, id, at) {
  if (at) { const [X, Y] = lonLatToImg(at[0], at[1]); flyTo(X, Y, 4, true); }
  card.linkUntil = Date.now() + 8000; // (the first card within this time is the one of the link)
  try {
    if (kind === 'ovzdusi') { // (the station nearest to the place of the news)
      await air.load(); const near = nearestTo(air.stations(), at);
      if (near) { if (!state.layers.air) setLayer('air', true); await showAir(near); }
      return;
    }
    if (kind === 'udalost') { // (an event of the last 30 days of udalosti.json, as its message in the news)
      const U = await udalosti(), o = U && U.items && U.items.find(x => x.id === id);
      if (o) showUdalost(udalMsg(o));
      return;
    }
    if (kind === 'vlaky' && VLAKY_ON) { // (a late train of the news: the station it is due at)
      await needVlaky(); await vlaky.load(); vlaky.positions();
      const st = vlaky.byId(id);
      if (st) { if (!state.layers.vlaky) setLayer('vlaky', true); showStation(st); }
      return;
    }
    if (kind === 'parkovani' && PARKING_ON) {
      await parking.load(); parking.positions(); const near = nearestTo(parking.data.items, at);
      if (near) { if (!state.layers.parking) setLayer('parking', true); showParking(near); }
      return;
    }
    if (kind === 'hasici' && HASICI_ON) {
      await hasici.load();
      let o = hasici.list().find(x => String(x.id) === id);
      if (!o) { await hasici.loadWeek(); hasici.weekPts(); o = hasici.weekList().find(x => String(x.id) === id); if (o) setZasahRange('w'); }
      if (o) { if (!state.layers.hasici) setLayer('hasici', true); hasici.positions(); showHasici(o); }
      return;
    }
    if (kind === 'voda' && VODA_ON) {
      await voda.load();
      let o = voda.data.items.find(x => x.id === id);
      if (!o) { await voda.loadWeek(); voda.weekPts(); o = voda.weekList().find(x => x.id === id); if (o) setZasahRange('w'); }
      if (o) { if (!state.layers.voda) setLayer('voda', true); voda.positions(); showVoda(o); }
      return;
    }
    if (kind === 'vyluka') { await city.load(); const o = city.data.outages.find(x => String(x.id) === id); if (o) showOutage(o); return; }
    if (kind === 'uzavirka') { let C = layers.clos(); for (let i = 0; i < 20 && !C; i++) { await new Promise(r => setTimeout(r, 150)); C = layers.clos(); } const c = C && C.items.find(x => String(x.id) === id); if (c) showTraffic({ closure: c, source: C.source }); return; }
    if (kind === 'vykop') { let W = layers.works(); for (let i = 0; i < 20 && !W; i++) { await new Promise(r => setTimeout(r, 150)); W = layers.works(); } const w = W && W.items.find(x => String(x.id) === id); if (w) showWork(w); }
  } catch { /* no card to be had: the view stays on the place */ } finally { card.linkUntil = 0; } // (no card came: the next one is an ordinary one)
}
const nearestTo = (list, at) => (at ? (list || []).filter(o => o.lon != null).reduce((b, o) => { const d = Math.hypot((o.lon - at[0]) * 0.65, o.lat - at[1]); return !b || d < b.d ? { o, d } : b; }, null)?.o : null);
// the building whose own point (lon, lat of its entry) this is, in the chunks around (X, Y); null while they load
async function buildingByLonLat(lo, la, X, Y) {
  const cx = Math.floor(X / CH), cy = Math.floor(Y / CH);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const list = chunk(cx + dx, cy + dy);
    if (!list) continue;
    await attrsOf(`${cx + dx}_${cy + dy}`);
    const b = list.find(e => e[5] != null && Math.abs(e[5] - lo) < 2e-6 && Math.abs(e[6] - la) < 2e-6);
    if (b) return b;
  }
  return null;
}
// the named parts of a shared link (#@…&v=…&f=…&m=…|k=…&l=…), see shareUrl ("+" is a sign here, not a space)
async function restoreParts(hash, quiet = false) {
  const P = {};
  for (const kv of hash.split('&').slice(1)) { const i = kv.indexOf('='); if (i > 0) try { P[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch { /* a broken part */ } }
  if (!Object.keys(P).length) return;
  if (!quiet) track('Odkaz', { co: ['v', 'f', 'm', 'k', 'u', 'z', 'h', 'l'].filter(k => P[k]).join(',') });
  if (P.p === '0' || P.p === '1') setTopHidden(P.p === '0');
  // the look: chosen by the sender, shown here without being remembered in this browser
  if (P.l === 'leto') { lookFromLink = true; setLook('summer'); }
  else if (P.l === 'poledne') { lookFromLink = true; setLook('noon'); }
  else if (P.l === 'den') { lookFromLink = true; setDayLock(true); }
  // the layers: the levels of the tiles, then the single switches (only those this version of the page has)
  if (P.v) {
    const [, digits = '', rest = ''] = P.v.match(/^(\d*)(.*)$/);
    quick.setCode(digits);
    for (const [, sign, k] of rest.matchAll(/([+-])(\w+)/g)) if (k in state.layers && $(`lay-${k}`)) setLayer(k, sign === '+');
  }
  // the highlighted kind (its beacons); the view stays the one of the link
  if (P.f) {
    const lm = P.f.match(/^linka:(\w+)$/);
    const f = lm ? lineKind(lm[1]) : P.f;
    if (FOCUS_KINDS[f] && $(`lay-${focusLayer(f)}`)) setFocus(f, { keepView: true });
  }
  // the selected place: by its link, or whatever is at the point (as if clicked there), else a marker on the point
  if (P.m && /^[a-z0-9-]+$/.test(P.m)) openPlaceLink(P.m, { stay: true });
  else if (P.u && P.u.indexOf('/') > 0) { // one thing by its id (hasiči, voda, výkop, výluka): the view of the link stays
    const i = P.u.indexOf('/');
    await ready; card.fromLink = true;
    openEventLink(P.u.slice(0, i), P.u.slice(i + 1), null);
  } else if (P.z && /^\d+$/.test(P.z)) { // a stop by its number
    await ready; await layers.mhd.loadStops();
    const s = layers.mhd.stops()[P.z];
    if (s) { const [X, Y] = layers.llToImg(s[1], s[2]); card.fromLink = true; showStop({ num: P.z, name: s[0], X, Y }); }
  } else if (P.h) { // a street, an address or a place of the search: the same name nearest to its point
    const [la, lo, ...nm] = P.h.split(','), name = nm.join(','), [X, Y] = layers.llToImg(+lo, +la);
    if (!Number.isFinite(X) || !name) return;
    const idx = await loadIndex();
    const it = idx.filter(o => o.n === name && Number.isFinite(o.X)).reduce((b, o) => (!b || Math.hypot(o.X - X, o.Y - Y) < Math.hypot(b.X - X, b.Y - Y) ? o : b), null);
    card.fromLink = true;
    if (it && !it.story && !it.paro) showFound(it); else if (it) pick(it);
  } else if (P.k) {
    const [la, lo] = P.k.split(',').map(Number);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
    await openAtPoint(la, lo);
  }
}
// Whatever is at a point, as if clicked there (k= of a shared link, a place kept in Moje): the card of the house whose
// own point it is, else of what is drawn there, else a marker alone. fromLink: the card counts as opened from a link.
async function openAtPoint(la, lo, fromLink = true) {
  const [X, Y] = layers.llToImg(lo, la);
  await ready; await city.load();
  card.fromLink = fromLink;
  // (the icons and buildings answer only once drawn: a few tries; an icon stands above its foot, so also a little higher)
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, i ? 400 : 800));
    // a building card keeps the building's own point (the middle of its footprint), which on the screen is often
    // behind the house in front of it: found by that point first
    const b = await buildingByLonLat(lo, la, X, Y);
    if (b) { showBuilding(b); return; }
    const v = view(), sx = v.ox + X * v.k, sy = v.oy + Y * v.k;
    if ([0, -6, -12, -18].some(dy => pickAt(sx, sy + dy, true))) { fx.marker(X, Y, 7000); return; }
  }
  card.fromLink = false;
  fx.marker(X, Y, 7000);
}
function restoreRest(m) {
  if (m[4] || m[5] || m[6]) lookFromLink = true; // (the look of the link is shown, the one remembered here stays)
  if (m[4] || m[5]) $('clockLive').checked = false; // a shared view keeps its own season and time
  if (m[4]) setSeason(m[4], true);
  if (m[5]) setNight(+m[5]);
  if (m[6] === 'leto') setLook('summer'); // a shared clear summer day
  else if (m[6]) setWeather(m[6]);
  if (m[8] && DATAMAPS[m[8]]) setDatamap(m[8]); // a shared datová mapa (…,dhluk)
}

// ------------------------------------------------------------------ rotation
const ROT_NAMES = ['sever', 'východ', 'jih', 'západ'];
let rotating = false;
async function rotateTo(r, keep) {
  if (rotating) return;
  rotating = true;
  // keep the same place and zoom on screen
  const v = view();
  const c = viewer.viewport.getCenter(true);
  const [lon, lat] = keep ? [keep[0], keep[1]] : imgToLonLat(c.x * GEO.W, c.y * GEO.W);
  const z = keep ? keep[2] : v.z;
  const wasHome = !touched;
  ROT = r;
  chunks.clear(); chunkAttrs.clear(); index = null; hover = null; fx.hover = null; fx.selected = null;
  lazyReset();
  await loadData();
  fx.resetTraffic(); fx.prepareLights();
  setSeason(state.season, false);
  if (wasHome && !keep) goHome(true);
  else { const [X, Y] = lonLatToImg(lon, lat); flyTo(X, Y, z, true); }
  toast(`Nahoře je ${ROT_NAMES[ROT]}`);
  rotating = false;
}
const rotate = d => rotateTo((ROT + d + 4) % 4);
// (the map has only the north-up view; rotating was removed to save rendering time and disk space)
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, textarea')) return;
});

// ------------------------------------------------------------------ minimap
const mini = $('mini');
const mctx = mini.getContext('2d');
const miniImgs = {};
function miniImg(s) {
  const key = `r${ROT}/${s}`;
  if (!miniImgs[key]) { const im = new Image(); im.src = `${MEDIA}tiles/${key}/mini.webp`; miniImgs[key] = im; }
  return miniImgs[key];
}
// (the pictures come when the minimap is first drawn: it is hidden on phones, and only the season shown is needed)
// north arrow in the top right corner of the minimap
function drawNorth() {
  const cx = mini.width - 13, cy = 13;
  const ang = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][ROT]; // where north points on screen
  mctx.fillStyle = 'rgba(22,29,43,.85)';
  mctx.fillRect(cx - 11, cy - 11, 22, 22);
  mctx.save();
  mctx.translate(cx, cy); mctx.rotate(ang + Math.PI / 2);
  mctx.fillStyle = '#c9583b';
  mctx.beginPath(); mctx.moveTo(0, -9); mctx.lineTo(5, 2); mctx.lineTo(-5, 2); mctx.closePath(); mctx.fill();
  mctx.fillStyle = '#f0f2ea';
  mctx.beginPath(); mctx.moveTo(0, 9); mctx.lineTo(5, 2); mctx.lineTo(-5, 2); mctx.closePath(); mctx.fill();
  mctx.restore();
  mctx.fillStyle = '#f0f2ea'; mctx.font = '700 9px "Atkinson Hyperlegible", sans-serif'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
  const lx = cx + Math.cos(ang) * 0, ly = cy + Math.sin(ang) * 0;
  void lx; void ly;
}
const MS = mini.width / GEO.W;
let miniKey = '', scaleText = null;
function drawMini() {
  // (called with every drawing of the map: drawn again only when the view, the season, the size or the picture changed)
  const im = miniImg(state.season), bb = viewer.viewport.getBounds(true);
  const key = `${bb.x}|${bb.y}|${bb.width}|${bb.height}|${state.season}|${im.complete && im.naturalWidth}|${mini.width}x${mini.height}|${ROT}|${document.fonts ? document.fonts.status : ''}`;
  if (key === miniKey) return;
  miniKey = key;
  mctx.fillStyle = '#161d2b';
  mctx.fillRect(0, 0, mini.width, mini.height);
  mctx.imageSmoothingEnabled = true;
  if (im.complete && im.naturalWidth) mctx.drawImage(im, 0, (mini.height - GEO.H * MS) / 2, mini.width, GEO.H * MS);
  const b = viewer.viewport.getBounds(true);
  const x0 = b.x * GEO.W * MS, y0 = b.y * GEO.W * MS + (mini.height - GEO.H * MS) / 2;
  mctx.strokeStyle = '#f3c868';
  mctx.lineWidth = 2;
  mctx.strokeRect(Math.round(x0) + 1, Math.round(y0) + 1, Math.round(b.width * GEO.W * MS) - 2, Math.round(b.height * GEO.W * MS) - 2);
  const k = view().k;
  const m = 1 / GEO.A / k;
  drawNorth();
  const txt = !Number.isFinite(m) || m <= 0 ? '' : `1 px = ${m >= 10 ? Math.round(m) : m >= 1 ? m.toFixed(1).replace('.', ',') : m.toFixed(2).replace('.', ',')} m`;
  if (txt !== scaleText) { scaleText = txt; $('scale').textContent = txt; }
}
let dragging = false;
function miniPan(e) {
  const r = mini.getBoundingClientRect();
  const mx = ((e.clientX - r.left) / r.width) * mini.width, my = ((e.clientY - r.top) / r.height) * mini.height - (mini.height - GEO.H * MS) / 2;
  viewer.viewport.panTo(new OpenSeadragon.Point(mx / MS / GEO.W, my / MS / GEO.W));
}
mini.addEventListener('pointerdown', e => { dragging = true; mini.setPointerCapture(e.pointerId); miniPan(e); });
mini.addEventListener('pointermove', e => dragging && miniPan(e));
mini.addEventListener('pointerup', () => (dragging = false));
// a computer: the − under the minimap hides it (and its scale), a small button with a folded map in the corner brings it
// back; remembered in this browser (localStorage b2k-mini). Hidden, it is not drawn either (miniOn in the frame loop).
function miniHidden(off, save = true) {
  document.documentElement.classList.toggle('mini-off', off);
  if (save) try { if (off) localStorage.setItem('b2k-mini', '0'); else localStorage.removeItem('b2k-mini'); } catch { /* private mode */ }
}
try { if (localStorage.getItem('b2k-mini') === '0') miniHidden(true, false); } catch { /* private mode */ }
$('miniHide').onclick = () => { miniHidden(true); track('Nástroj', { nastroj: 'minimapa', hodnota: 'vyp' }); $('miniShow').focus({ preventScroll: true }); };
$('miniShow').onclick = () => { miniHidden(false); track('Nástroj', { nastroj: 'minimapa', hodnota: 'zap' }); $('miniHide').focus({ preventScroll: true }); };

// ------------------------------------------------------------------ snímek (src/snimek.js, loaded on the first click)
// the name of the place for the strip under the picture: the open card, else the nearest quarter to the middle of the
// free part of the map, else Brno (the whole city in view)
function snapPlace() {
  if (!$('card').hidden) { const t = $('cardTitle').textContent.trim(); if (t) return t; }
  const v = view();
  if (v.z < 0.6) return 'Brno';
  const [sx, sy] = freeCentre(), X = (sx - v.ox) / v.k, Y = (sy - v.oy) / v.k;
  let best = null, bd = Infinity;
  for (const l of data.labels || []) {
    if (l.r !== 1 && l.r !== 2) continue;
    const d = Math.hypot(l.X - X, l.Y - Y) * (l.r === 1 ? 1 : 1.4);
    if (d < bd) { bd = d; best = l; }
  }
  return best && bd < 2500 ? best.n : 'Brno';
}
let snimek = null;
async function snapshot(btn) {
  if (!snimek) {
    const { createSnimek } = await import('./snimek.js');
    snimek = snimek || createSnimek({ viewer, fx, redraw: () => drawFull(performance.now(), view()), place: snapPlace, link: shareUrl, toast, track });
  }
  snimek.run(btn);
}
$('snap').onclick = () => snapshot($('snap'));
$('mSnap').onclick = () => snapshot($('mSnap'));
$('pSnap').onclick = () => snapshot($('pSnap'));

// ------------------------------------------------------------------ frame loop
let opened = false;
viewer.addHandler('open', () => {
  if (opened) return; // later opens are season / rotation swaps
  opened = true;
  if (!touched) goHome(true);
  $('loading').hidden = true;
});
// ------------------------------------------------------------------ riding along with a vehicle
// The map moves with the vehicle; a small box at the top right shows the next stops and "Vystoupit".
// Places on the way can be opened meanwhile; moving the map pauses following (the box offers "K vozu",
// following comes back by itself after 15 s).
let ride = null, rideLine = '', rideAt = 0, ridePaused = 0, rideTimer = null, rideFollowAt = 0;
const pragueSec = () => { const s = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Prague' }).split(' ')[1].split(':').map(Number); return s[0] * 3600 + s[1] * 60 + s[2]; };
const hhmmSec = sec => { const s = ((sec % 86400) + 86400) % 86400; return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`; };
function startRide(m) {
  if (geo.mode === 'follow') { geo.mode = 'on'; geoUi(); }
  ride = m.id; rideLine = m.line; rideAt = performance.now(); ridePaused = 0;
  track('Nástroj', { nastroj: 'nastoupit', hodnota: m.line });
  layers.setRide(m.id);
  if (view().z < 1.5) { const p = layers.selectedPos(); if (p) flyTo(p[0], p[1], 2); }
  $('rideBox').hidden = false;
  // a phone on its side has no room for both: the card goes, the box stays (the vehicle stays selected, its route on
  // the map); the title of the box opens the card again
  if (isLandPhone()) $('card').hidden = true;
  $('rbTitle').textContent = `Linka ${m.line}`;
  renderRideBox();
  clearInterval(rideTimer); rideTimer = setInterval(renderRideBox, 2000);
  rideBtns();
  toast(`Jedete linkou ${m.line}: mapa se posouvá s vozem`);
}
// quiet = the ride ended by itself (the vehicle left the map, the location took over); only pressing Vystoupit is counted
function stopRide(quiet = false) {
  if (!ride) return;
  if (!quiet) track('Nástroj', { nastroj: 'vystoupit', hodnota: rideLine });
  ride = null; layers.setRide(null);
  if ($('card').hidden) layers.selectVehicle(null); // (the card hidden on getting on: its route goes with the ride)
  clearInterval(rideTimer); rideTimer = null;
  $('rideBox').hidden = true;
  rideBtns();
  if (!quiet) toast('Vystoupili jste');
}
function rideBtns() { document.querySelectorAll('.ride-btn[data-id]').forEach(b => { const on = !!ride && b.dataset.id === String(ride); b.textContent = on ? '■ Vystoupit' : '▶ Nastoupit'; b.setAttribute('aria-pressed', String(on)); }); }
// the next stops of the ridden vehicle with expected times (live delay included)
function renderRideBox() {
  const m = layers.rideVehicle();
  if (!m) return;
  const plan = m.live ? layers.matchPlan(m) : m;
  const it = plan ? layers.mhd.itinerary(plan) : [];
  const d = m.live ? Math.round(m.delay || 0) : 0, now = pragueSec();
  const to = m.live ? layers.mhd.stopName(m.final) || (it.length ? it[it.length - 1].name : '') : m.hs || (it.length ? it[it.length - 1].name : '');
  $('rbTitle').textContent = `Linka ${m.line} → ${to}`;
  $('rbDelay').textContent = m.live ? (d > 0 ? `zpoždění +${d} min` : d < 0 ? `napřed ${-d} min` : 'jede včas') : 'podle jízdního řádu';
  $('rbDelay').className = `rb-delay ${d >= 10 ? 'd3' : d >= 5 ? 'd2' : d >= 1 ? 'd1' : ''}`; // (the scale of delayColor, src/vehicles.js)
  const next = it.filter(o => o.time + d * 60 > now - 20).slice(0, 4);
  $('rbStops').replaceChildren(...(next.length ? next : [null]).map(o => {
    const li = el('li');
    if (!o) { li.textContent = 'Konečná'; return li; }
    const name = el('span', 'st', o.name);
    if (o.req) { const x = el('span', 'rq', '×'); x.title = 'Zastávka na znamení'; name.append(' ', x); }
    li.append(el('span', 'tm', hhmmSec(o.time + d * 60)), name);
    if (o.num) { li.classList.add('link'); li.title = 'Odjezdy z této zastávky'; li.onclick = () => showStopByNum(o.num, m.line); }
    return li;
  }));
  $('rbBack').hidden = !ridePaused;
}
$('rbStop').onclick = () => stopRide();
$('rbBack').onclick = () => { ridePaused = 0; $('rbBack').hidden = true; };
$('rbTitle').onclick = () => { const m = layers.rideVehicle(); if (m) showVehicle(m); };
function followRide(v) {
  if (ridePaused && Date.now() - ridePaused > 15000) { ridePaused = 0; $('rbBack').hidden = true; }
  const p = layers.ridePos();
  if (!p || performance.now() - p[2] > 6000) { if (performance.now() - rideAt > 6000) { stopRide(true); toast('Vůz zmizel z mapy, vystupujeme'); } return; }
  if (ridePaused) return;
  const cw = viewer.container.clientWidth, ch = viewer.container.clientHeight;
  // on a phone the card covers the bottom: keep the vehicle in the middle of the part above it
  let sx = cw / 2, sy = ch / 2;
  if (isPhone() && !$('card').hidden) sy = Math.max(70, $('card').getBoundingClientRect().top / 2 + 30);
  // on a phone on its side the stops (or the card) take the right side and the panel maybe the left: keep the vehicle
  // in the middle of the map between them (with the panel folded that is about a third from the left)
  if (isLandPhone()) {
    const shown = e => (e.getClientRects().length ? e.getBoundingClientRect() : null);
    const r = shown($('card')) || shown($('rideBox')), l = shown($('panel'));
    const x0 = l ? Math.max(0, l.right) : 0, x1 = r ? r.left : cw;
    if (x1 - x0 > 80) sx = (x0 + x1) / 2;
  }
  const tx = p[0] + (cw / 2 - sx) / v.k, ty = p[1] + (ch / 2 - sy) / v.k;
  // How often to follow depends on the zoom (v.k = screen px per metre): zoomed in, the vehicle moves fast
  // on the screen, so every frame; zoomed out it creeps by fractions of a pixel, and moving the map that
  // often makes the pixel-art map twitch, so then less often (up to 3 s), with a short glide, and only once
  // the vehicle is a few pixels off. Steps are always whole screen pixels (no shimmering of the pixels).
  const every = Math.max(0, Math.min(3000, 600 / v.k - 300)); // ms: ≤0.5 m/px every frame, 1 m/px 0.3 s, 2 m/px 0.9 s, 4 m/px 2.1 s
  const dead = every === 0 ? 1 : Math.min(12, 2 / v.k); // px the vehicle may drift before the map follows
  const now = performance.now();
  if (now - rideFollowAt < every) return;
  const c = viewer.viewport.getCenter(every > 0 ? false : true); // (while gliding: from where the glide ends)
  const cx0 = c.x * GEO.W, cy0 = c.y * GEO.W;
  const dx = Math.round((tx - cx0) * v.k), dy = Math.round((ty - cy0) * v.k);
  if (Math.hypot(dx, dy) < dead) return;
  rideFollowAt = now;
  viewer.viewport.panTo(new OpenSeadragon.Point((cx0 + dx / v.k) / GEO.W, (cy0 + dy / v.k) / GEO.W), every === 0);
}
viewer.addHandler('canvas-drag', () => { if (ride) { ridePaused = Date.now(); $('rbBack').hidden = false; } });

// ------------------------------------------------------------------ my position (GPS)
// first tap: find me and show me on the map; second tap: follow me (the map moves after me when I have moved,
// every 20 s on foot and every few seconds in a car); third tap: off. Dragging the map stops following, the dot stays.
// While the dot is on, the trail behind me is kept: the last 5 minutes, at most 1 km on foot and up to 3 km by
// car (the limit is 5 minutes of the pace of the last two minutes), fading out with age and distance.
const geo = { watch: null, pos: null, mode: 'off', first: false, centeredAt: 0, centerPos: null, trail: [], zoomHint: false, fixes: [] };
const inBrno = (lon, lat) => lon > 16.41 && lon < 16.80 && lat > 49.075 && lat < 49.33;
const distM = (a, b) => Math.hypot((a[0] - b[0]) * 72765, (a[1] - b[1]) * 111200);
const TRAIL_T = 300000, TRAIL_MIN = 1000, TRAIL_MAX = 3000;
function geoUi() {
  const b = $('locate');
  b.setAttribute('aria-pressed', String(geo.mode !== 'off'));
  b.classList.toggle('follow', geo.mode === 'follow');
  b.title = geo.mode === 'off' ? 'Moje poloha' : geo.mode === 'on' ? 'Sledovat moji polohu' : 'Vypnout polohu';
}
// a new fix: on the trail only when I have moved (a standing GPS wanders 10–20 m), bad and jumping fixes dropped
function trailAdd(lon, lat, acc, t) {
  if (acc > 50) return;
  const tr = geo.trail, last = tr[tr.length - 1];
  let d = 0, gap = '';
  if (last) {
    d = distM([lon, lat], [last.lon, last.lat]);
    const dt = (t - last.t) / 1000;
    if (d < Math.max(5, acc / 2)) return;
    if (dt > 0 && d / dt > 42) return; // over 150 km/h: a jump between fixes, not a ride
    if (dt > 120) { gap = 'break'; d = 0; } // the phone slept: the trail starts afresh, the old piece fades away
    else if (dt > 30) gap = 'dash'; // a tunnel: bridged with a dashed line
  }
  const [X, Y] = layers.llToImg(lon, lat);
  tr.push({ lon, lat, t, X, Y, d, gap });
  trailTrim(t);
}
// pace (m/s) of the last two minutes, from the trail itself (the speed from the GPS is missing on many phones)
function trailPace(now) {
  const tr = geo.trail;
  let s = 0, t0 = now;
  for (let i = tr.length - 1; i > 0 && now - tr[i].t < 120000; i--) { s += tr[i].d; t0 = tr[i - 1].t; }
  return s / Math.max(30, (now - t0) / 1000);
}
const trailLimit = now => Math.max(TRAIL_MIN, Math.min(TRAIL_MAX, trailPace(now) * TRAIL_T / 1000));
function trailTrim(now) {
  const tr = geo.trail;
  while (tr.length && now - tr[0].t > TRAIL_T) tr.shift();
  const lim = trailLimit(now);
  let s = 0;
  for (let i = tr.length - 1; i > 0; i--) { s += tr[i].d; if (s > lim) { tr.splice(0, i); break; } }
}
// where I am heading, from the last 100 m of the trail: a unit vector in image coordinates, or null when standing
function trailHeading() {
  const tr = geo.trail, h = tr[tr.length - 1];
  if (!h) return null;
  let s = 0, i = tr.length - 1;
  while (i > 0 && s < 100 && !tr[i].gap) { s += tr[i].d; i--; }
  if (s < 30) return null;
  const dx = h.X - tr[i].X, dy = h.Y - tr[i].Y, n = Math.hypot(dx, dy);
  return n ? [dx / n, dy / n] : null;
}
// centre the map on me; in a car (ahead = true) a bit ahead of me, so the road ahead is on the screen and the trail behind
function centerMe(z, ahead = false) {
  let [X, Y] = layers.llToImg(geo.pos[0], geo.pos[1]);
  const hd = ahead ? trailHeading() : null;
  if (hd) {
    const v = view(), off = 0.18 * Math.min(viewer.container.clientWidth, viewer.container.clientHeight) / v.k;
    X += hd[0] * off; Y += hd[1] * off;
  }
  flyTo(X, Y, z ?? view().z);
  geo.centeredAt = Date.now(); geo.centerPos = geo.pos.slice(0, 2);
}
function geoStart() {
  if (!('geolocation' in navigator)) { toast('Tento prohlížeč polohu nezjistí'); return; }
  geo.mode = 'on'; geo.first = true; geo.trail = []; geo.fixes = []; geoUi();
  toast('Zjišťuji polohu…');
  geo.watch = navigator.geolocation.watchPosition(p => {
    geo.pos = [p.coords.longitude, p.coords.latitude, p.coords.accuracy || 30];
    trailAdd(geo.pos[0], geo.pos[1], geo.pos[2], Date.now());
    // (the raw fixes of the last 20 s, with the pace the phone reports when it does: geoMotion)
    geo.fixes.push({ lon: geo.pos[0], lat: geo.pos[1], t: Date.now(), sp: Number.isFinite(p.coords.speed) && p.coords.speed >= 0 ? p.coords.speed : null });
    while (geo.fixes.length > 1 && geo.fixes[geo.fixes.length - 1].t - geo.fixes[0].t > 20000) geo.fixes.shift();
    if (!geo.first) return;
    geo.first = false;
    if (!inBrno(geo.pos[0], geo.pos[1])) { track('Chyba', { co: 'poloha-mimo-brno' }); toast('Jste mimo mapu Brna'); return; }
    centerMe(Math.max(2, view().z));
    toast('Tady jste. Dalším klepnutím zapnete sledování polohy.');
  }, err => { track('Chyba', { co: err.code === 1 ? 'poloha-odmitnuta' : 'poloha-nezjistena' }); toast(err.code === 1 ? 'Přístup k poloze je v prohlížeči zakázaný' : 'Polohu se nepodařilo zjistit'); geoStop(); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
function geoStop() { if (geo.watch != null) navigator.geolocation.clearWatch(geo.watch); geo.watch = null; geo.mode = 'off'; geo.pos = null; geo.trail = []; geo.fixes = []; geoUi(); }
// How I move just now, for the bar of a journey (src/spojstav.js: am I walking to the stop, running, riding?): the
// place, the pace and the way over the last eight seconds of raw fixes, or null without a fresh fix. A standing phone
// wanders a few metres: less than that is no movement. The trail is of no use here, it keeps only what has moved.
function geoMotion() {
  const f = geo.fixes;
  if (geo.mode === 'off' || !geo.pos || !f.length) return null;
  const last = f[f.length - 1];
  if (Date.now() - last.t > 20000) return null;
  let i = f.length - 1;
  while (i > 0 && last.t - f[i - 1].t <= 8000) i--;
  const a = f[i], dt = (last.t - a.t) / 1000, d = distM([a.lon, a.lat], [last.lon, last.lat]), acc = geo.pos[2] || 30;
  const moved = dt >= 2 && d >= Math.max(8, acc * 0.6);
  return { lon: last.lon, lat: last.lat, acc, speed: last.sp != null ? (last.sp < 0.5 && !moved ? 0 : last.sp) : moved ? d / dt : 0,
    head: moved && d >= 12 ? (Math.atan2((last.lon - a.lon) * 72765, (last.lat - a.lat) * 111200) * 180 / Math.PI + 360) % 360 : null };
}
// The map opened from afar (the whole city, as after loading): the button of my position softly calls for a click (blue,
// like the position itself). It stops for this visit on a click, once the map is zoomed in (one click on + or
// two turns of the wheel) and after two minutes; a link to a place opens close, so there it never starts.
let locateHintDone = false;
const locateFar = () => viewer.viewport.getZoom() < homeBounds().zoom * 1.5; // one click on + (1.6×) is close enough; (the target zoom: a flight to a place counts at once)
function locateHintOff() { locateHintDone = true; $('locate').classList.remove('hint'); }
function locateHint() {
  setTimeout(() => {
    if (locateHintDone || geo.mode !== 'off' || !locateFar()) return;
    $('locate').classList.add('hint');
    setTimeout(locateHintOff, 120000);
  }, 1500);
}
viewer.addHandler('zoom', () => { if (!locateHintDone && $('locate').classList.contains('hint') && !locateFar()) locateHintOff(); });
if (opened) locateHint(); else viewer.addOnceHandler('open', locateHint);
$('locate').onclick = () => {
  locateHintOff();
  track('Nástroj', { nastroj: 'poloha', hodnota: geo.mode === 'off' ? 'zapnout' : geo.mode === 'on' ? 'sledovat' : 'vypnout' });
  if (geo.mode === 'off') geoStart();
  else if (geo.mode === 'on') {
    const rode = !!ride;
    geo.mode = 'follow'; geoUi(); if (ride) stopRide(true);
    if (geo.pos && inBrno(geo.pos[0], geo.pos[1])) centerMe();
    toast((rode ? 'Vystoupili jste z vozu. ' : '') + 'Sleduji vaši polohu: když se pohnete, mapa se posune (pěšky po 20 s, v autě po pár sekundách)');
  } else { geoStop(); toast('Poloha vypnutá'); }
};
// following: how often the map moves after me depends on my pace (20 s on foot, 10 s on a bike, 4 s in a car)
setInterval(() => {
  const now = Date.now();
  trailTrim(now);
  if (geo.mode !== 'follow' || !geo.pos || !geo.centerPos || !inBrno(geo.pos[0], geo.pos[1])) return;
  const pace = trailPace(now), car = pace > 5.5;
  const every = car ? 4000 : pace > 2.5 ? 10000 : 20000;
  if (now - geo.centeredAt < every || distM(geo.pos, geo.centerPos) <= 15) return;
  centerMe(undefined, car);
  if (pace > 8 && view().z > 2.5 && !geo.zoomHint) { geo.zoomHint = true; toast('Pro jízdu autem mapu raději oddalte'); }
}, 2000);
viewer.addHandler('canvas-drag', () => { if (geo.mode === 'follow') { geo.mode = 'on'; geoUi(); toast('Sledování polohy vypnuto, tečka zůstává'); } });
// [ADMIN] GPS at the desk: ?sim=pesky | kolo | auto swaps the GPS for a ride from Náměstí Svobody along Koliště
// to the station and back (a fix a second with a few metres of jitter; by car with a 40 s tunnel after half a minute)
// and switches following on, so the trail and the map following can be tried without leaving the chair.
const simGps = ADMIN && new URLSearchParams(location.search).get('sim');
if (simGps) {
  const WP = [[16.6083, 49.1951], [16.6080, 49.1978], [16.6115, 49.1988], [16.6148, 49.1976], [16.6168, 49.1948], [16.6160, 49.1912], [16.6128, 49.1886], [16.6090, 49.1895], [16.6075, 49.1925]];
  const mps = { pesky: 1.5, kolo: 5, auto: 14 }[simGps] || 1.5;
  let seg = 0, s = 0, cb = null, tick = 0;
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: ok => { cb = ok; return 1; }, clearWatch: () => (cb = null), getCurrentPosition: ok => cb && ok } });
  setInterval(() => {
    if (!cb) return;
    let step = mps;
    while (step > 0) { const a = WP[seg], b = WP[(seg + 1) % WP.length], L = distM(a, b), rest = L - s; if (step < rest) { s += step; step = 0; } else { step -= rest; seg = (seg + 1) % WP.length; s = 0; } }
    const a = WP[seg], b = WP[(seg + 1) % WP.length], f = s / distM(a, b);
    tick++;
    if (mps > 8 && tick > 30 && tick < 70) return; // the tunnel
    const j = () => (Math.random() - 0.5) * 6;
    cb({ coords: { longitude: a[0] + (b[0] - a[0]) * f + j() / 72765, latitude: a[1] + (b[1] - a[1]) * f + j() / 111200, accuracy: 8 + Math.random() * 6, speed: mps, heading: null }, timestamp: Date.now() });
  }, 1000);
  setTimeout(() => { geoStart(); geo.mode = 'follow'; geoUi(); toast(`Simulace GPS: ${simGps} (${Math.round(mps * 3.6)} km/h)`); }, 1500);
}
// the trail behind me (fading with age and with the distance behind me), then the blue dot with the accuracy circle
function drawMe(ctx, v, t) {
  if (!geo.pos) return;
  const tr = geo.trail;
  if (tr.length > 1) {
    const now = Date.now(), lim = trailLimit(now);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    let behind = 0;
    for (let i = tr.length - 1; i > 0; i--) {
      const p = tr[i], q = tr[i - 1];
      if (p.gap === 'break') continue; // the piece before the phone slept stays, fading on its own
      behind += p.d;
      const a = 1 - Math.max((now - p.t) / TRAIL_T, behind / lim);
      if (a <= 0) break;
      ctx.strokeStyle = `rgba(47,128,237,${(0.85 * a).toFixed(3)})`;
      ctx.lineWidth = 1.5 + 3.5 * a;
      ctx.setLineDash(p.gap === 'dash' ? [6, 6] : []);
      ctx.beginPath(); ctx.moveTo(v.ox + q.X * v.k, v.oy + q.Y * v.k); ctx.lineTo(v.ox + p.X * v.k, v.oy + p.Y * v.k); ctx.stroke();
    }
    ctx.restore();
  }
  const [X, Y] = layers.llToImg(geo.pos[0], geo.pos[1]);
  const x = v.ox + X * v.k, y = v.oy + Y * v.k, r = geo.pos[2] * GEO.A * v.k;
  if (r > 8 && r < 4000) { ctx.fillStyle = 'rgba(66,153,255,.15)'; ctx.strokeStyle = 'rgba(66,153,255,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y, r, r / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  const pulse = 9 + 4 * Math.sin(t / 300);
  if (geo.mode === 'follow') { ctx.strokeStyle = 'rgba(66,153,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, pulse + 6, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2f80ed'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
}

// ------------------------------------------------------------------ phones: sheets resized by their handle,
// the top and bottom bars folded into a corner
function sheetDrag(sheet, close) {
  const g = sheet.querySelector(':scope > .grip');
  if (!g) return;
  let y0 = 0, h0 = 0, on = false;
  g.addEventListener('pointerdown', e => { if (!isPhone()) return; on = true; y0 = e.clientY; h0 = sheet.getBoundingClientRect().height; g.setPointerCapture(e.pointerId); sheet.style.transition = 'none'; });
  g.addEventListener('pointermove', e => {
    if (!on) return;
    const h = Math.max(40, Math.min(innerHeight * 0.88, h0 + (y0 - e.clientY)));
    sheet.style.maxHeight = 'none'; sheet.style.height = `${Math.round(h)}px`;
  });
  const end = () => {
    if (!on) return; on = false; sheet.style.transition = '';
    if (sheet.getBoundingClientRect().height < 90) { sheet.style.height = ''; sheet.style.maxHeight = ''; close(); } // pulled down: closed
  };
  g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
}
sheetDrag($('card'), () => $('cardClose').click());
sheetDrag($('events'), () => setEventsOpen(false));
sheetDrag($('aktual'), () => setAktOpen(false));
if (zpravy) sheetDrag($('zpravy'), () => setZprOpen(false));
sheetDrag($('fcPop'), () => setFcOpen(false));
document.querySelectorAll('#panel .pane').forEach(p => sheetDrag(p, () => setTab(null)));
// the top as the person sees it: on an upright phone the top bar folded into ☰, elsewhere the panel folded aside
const topHidden = () => document.body.classList.contains(isPhone() ? 'top-min' : 'folded');
// … and as a shared link sets it (both states together, as the fold button of a phone on its side does; not remembered)
function setTopHidden(h) {
  document.body.classList.toggle('top-min', h);
  setFolded(h);
  placeFocusChip();
}
function setBarMin(which, min) {
  document.body.classList.toggle(which, min);
  placeFocusChip(); // (the clock comes or goes with the controls: the chip above it follows)
  try { localStorage.setItem(`b2k-${which}`, min ? '1' : ''); } catch { /* private mode */ }
}
$('topMin').onclick = () => setBarMin('top-min', true);
$('topMax').onclick = () => setBarMin('top-min', false);
$('tabsMin').onclick = () => { setTab(null); setEventsOpen(false); setAktOpen(false); setFcOpen(false); setBarMin('tabs-min', true); }; // (on phones everything at the bottom hides with it)
$('tabsMax').onclick = () => setBarMin('tabs-min', false);
// a phone lying on its side: the corner button hides the controls (the same state as the folded bottom bar upright; the
// panel and its open pane stay, the overviews close)
$('dockMin').onclick = () => { setEventsOpen(false); setAktOpen(false); setFcOpen(false); setBarMin('tabs-min', true); };
$('dockMax').onclick = () => setBarMin('tabs-min', false);
const aboutOpen = on => { $('aboutBox').hidden = !on; $('brand').setAttribute('aria-expanded', String(on)); };
$('brand').onclick = () => {
  const folded = document.body.classList.contains('top-min') || document.body.classList.contains('folded');
  if (folded) { aboutOpen($('aboutBox').hidden); if (!$('aboutBox').hidden) setTab(null); return; }
  setTab(null);
  if (spojeni && spojeni.active()) spojeni.close();
  setShut(false);
  const d = document.querySelector('#panel details.about');
  if (!d) return;
  d.open = true;
  // the details box itself may be display: contents (see .quick in style.css), so scroll its text instead
  requestAnimationFrame(() => (d.querySelector('.qd-body') || d).scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
};
$('aboutClose').onclick = () => aboutOpen(false);
// (the panel unfolded: the box goes, the text is in the panel then)
new MutationObserver(() => { if (!document.body.classList.contains('top-min') && !document.body.classList.contains('folded')) aboutOpen(false); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
{
  const others = [$('card'), $('events'), $('aktual'), $('zpravy'), $('fcPop'), $('rideBox'), $('spoj'), ...document.querySelectorAll('dialog'), ...document.querySelectorAll('#panel .pane')].filter(Boolean);
  const mo = new MutationObserver(recs => { if (!$('aboutBox').hidden && recs.some(r => (r.target.tagName === 'DIALOG' ? r.target.open : !r.target.hidden))) aboutOpen(false); });
  for (const x of others) mo.observe(x, { attributes: true, attributeFilter: ['hidden', 'open'] });
}
// the folded bars were set before the first paint (the script at the top of <body> in index.html, the first visit on a
// phone with the menu folded); here only the arrow of a folded panel
if (document.body.classList.contains('folded')) setFolded(true);
// turned on its side with the menu folded upright: folded there too (never unfolds a panel folded by hand)
matchMedia('(min-width: 641px) and (max-height: 500px)').addEventListener('change', e => { if (e.matches && document.body.classList.contains('top-min')) setFolded(true); });

// until the person moves the map, keep the start view fitted to the window
for (const ev of ['canvas-drag', 'canvas-scroll', 'canvas-pinch', 'canvas-double-click']) viewer.addHandler(ev, () => { touched = true; flyAim = null; });
viewer.addHandler('resize', () => { if (!touched && viewer.world.getItemCount()) goHome(true); });
let lastSize = '', pendingHome = false, lastDraw = -1e9, lastViewKey = '', covered = false, coveredAt = -1e9, miniOn = false;
const SHEETS = [$('card'), $('events'), $('fcPop'), ...document.querySelectorAll('#panel .pane')].filter(Boolean);
// their sizes and the minimap's, kept by a ResizeObserver: the frame loop asks every 400 ms without forcing a layout
const sheetSize = watchSizes([...SHEETS, mini]);
function mapCovered() {
  if (!isPhone()) return false;
  if (document.querySelector('dialog[open]')) return true;
  return SHEETS.some(s => !s.hidden && sheetSize.get(s).h >= innerHeight * 0.75);
}
// the size of the container (and, until the person moves the map, the start view fitted to it), then the view
function fitView() {
  const cwid = viewer.container.clientWidth, chei = viewer.container.clientHeight;
  const size = `${cwid}x${chei}`;
  if (size !== lastSize) { if (lastSize) pendingHome = true; lastSize = size; }
  if (pendingHome) {
    const cs = viewer.viewport.getContainerSize();
    if (Math.round(cs.x) === cwid && Math.round(cs.y) === chei) { pendingHome = false; if (!touched) goHome(true); }
  }
  return view();
}
// The overlay (#mapOver: clouds, traffic, people, icons, names; #pins: the pins of the places) has to move in the same frame
// as the tiles. OpenSeadragon raises 'viewport-change' right after it has moved its springs, in the same task in which it
// then draws the tiles: drawn from there, the overlay stands exactly where the tiles are. (Our own requestAnimationFrame
// callback is registered before the viewer's, so it ran before the springs moved and drew everything one frame behind;
// and on phones it drew at most 30 times a second while the tiles moved at 60–120 a second: the icons stepped after
// the map and jumped into place.) The frame loop below keeps only the idle rhythm of what moves by itself (clouds,
// cars, people, rain): 10 fps far out, 20 fps on phones, 30 fps otherwise.
// Phones (CALM): a full drawing at every frame is more than they can spare, so between two full drawings (at most every
// MOVE_MS) a plain pan only shifts the canvas and the pins by the distance the map moved: exact for a pan, and free (the
// canvas is drawn with a margin, fx bleed, so the shift uncovers drawn ground); a zoom waits for the next full drawing.
const MOVE_MS = CALM ? 32 : 0;
const SLOW_FULL_MS = 12;
// A plain pan on a computer: as soon as a full drawing is not nearly free (over PAN_FULL_MS; the rush hour with two
// hundred vehicles in view takes 8–12 ms, and the browser's own painting of those thousands of strokes as much again),
// the overlay is drawn in full only every PAN_MS, the rhythm it has when the map stands, and shifted with the map in
// between, which is exact for a pan. A full drawing at every frame of a 120 Hz screen left the map at 40–50 frames a
// second with single frames of 40–90 ms (measured 2026-11-16, afternoon peak). Even a drawing of 2.3 ms at every frame
// gave fewer frames (99 a second) than shifting does with a drawing of 5 ms (109). A zoom is drawn as before.
const PAN_FULL_MS = 2, PAN_MS = 30;
let lastFullMs = 0;
// A slow device (a full drawing of the overlay alone takes more than LITE_MS, as a 2019 tablet does with 30–150 ms): fx.lite
// leaves out what costs most (the big clouds, the cars of the local streets, the tests of what hides behind a building,
// two thirds of the people, the letter-by-letter street names) and the full drawings come at most every 120 ms while the
// map moves (shifted in between). Judged by the median of the last 40 drawings, not a mean: the first drawings of a place
// also prepare things (the network of the people, the streets, the stops) and a fast Mac has single drawings of 300 ms. A
// device remembered as slow (a week, localStorage) that then draws in under LITE_OFF_MS is let out again.
const LITE_MS = 20, LITE_OFF_MS = 8;
const fxLast = []; let fxN = 0;
// (the drawings in lite mode are cheaper by design, so "fast enough" is judged on them: a device just over the line went
// in and out every few seconds, the canvas changing its sharpness and the note shown again and again. Each time it
// comes back to lite, letting it out waits four times longer; the note is shown once a visit.)
let liteOffAt = 200, liteWait = 200, liteNoted = false;
// (the first seconds after the map appears are not judged at all: the first drawings prepare the people, the streets,
// the stops and the icons of the place, and a fast Mac went into lite for a few seconds, note and all)
const LITE_GRACE_MS = 10000;
let firstFull = 0;
const fxMedian = () => { const a = [...fxLast].sort((x, y) => x - y); return a[a.length >> 1]; };
const moveMs = () => (fx.lite ? 120 : CALM ? MOVE_MS : lastFullMs > SLOW_FULL_MS ? Math.min(150, 3 * lastFullMs) : 0);
const panMs = () => Math.max(moveMs(), lastFullMs > PAN_FULL_MS ? PAN_MS : 0);
let drawn = null, shifted = false, moving = false, liveAt = 0; // drawn: the view of the last full drawing
function drawFull(t, v) {
  lastViewKey = `${v.ox}|${v.oy}|${v.k}|${lastSize}`; lastDraw = t; drawn = v;
  if (shifted) { fx.shift(0, 0); shifted = false; }
  refreshProjectTags();
  const t1 = performance.now();
  fx.draw(t, v);
  const dt = performance.now() - t1;
  lastFullMs = dt;
  if (!firstFull) firstFull = t;
  if (t - firstFull < LITE_GRACE_MS) { if (miniOn) drawMini(); return; }
  fxLast.push(dt); if (fxLast.length > 40) fxLast.shift();
  if (++fxN % 40 === 0) {
    const med = fxMedian();
    if (!fx.lite && med > LITE_MS && true) {
      fx.lite = true;
      console.info(`Mapa: úsporné kreslení (překreslení trvá ${med.toFixed(0)} ms)`);
      if (!liteNoted) { liteNoted = true; toast('Na tomto zařízení kreslím mapu úsporně: bez mraků a s méně auty a lidmi, aby se hýbala plynule.', 5000); }
      try { localStorage.setItem('b2k-lite', String(Date.now())); } catch { /* private mode */ }
      if (fxN > 200) { liteOffAt = fxN + liteWait; liteWait *= 4; } // (back in lite after it was let out: wait longer)
    } else if (fx.lite && med < LITE_OFF_MS && fxN >= liteOffAt) {
      fx.lite = false;
      console.info(`Mapa: zpět plné kreslení (překreslení trvá ${med.toFixed(0)} ms)`);
      try { localStorage.removeItem('b2k-lite'); } catch { /* private mode */ }
    }
  }
  if (miniOn) drawMini();
}
viewer.addHandler('viewport-change', () => {
  moving = true;
  if (covered) return;
  try {
    const v = view(), t = performance.now();
    // (the same zoom up to the noise of the floating point: k is computed from two screen points that both move with a pan)
    const pan = !!drawn && Math.abs(v.k - drawn.k) < 1e-7 * drawn.k;
    if (drawn && t - lastDraw < (pan ? panMs() : moveMs())) {
      // a pan further than the margin shifts too: a strip at the leading edge stays bare until the next full drawing, which
      // looks better than all the icons standing still while the map runs away under them
      if (pan) { fx.shift(v.ox - drawn.ox, v.oy - drawn.oy); shifted = true;  } else {}
      return; // (a zoom: the drawing stays as it is until the next full one)
    }
    drawFull(t, v);
  } catch (e) { console.error(e); } // (an error here must not stop the viewer's own update loop)
});
function frame(t) {
  if (viewer.world.getItemCount()) {
    const v = fitView();
    $('map').classList.toggle('far', v.z < 0.6);
    if (ride) followRide(v);
    if (t - liveAt > 1000) { liveAt = t; liveCheck(v, t); }
    // on a phone a card, a pane or a dialog pulled up over the map hides it: nothing is drawn under it
    if (t - coveredAt > 400) { coveredAt = t; const c = mapCovered(); if (covered && !c) lastViewKey = ''; covered = c; miniOn = sheetSize.get(mini).w > 0; }
    if (moving) moving = false; // the view moved since the last frame: the viewer's handler above has drawn (or shifted) it
    else if (!covered) {
      const key = `${v.ox}|${v.oy}|${v.k}|${lastSize}`;
      if (key !== lastViewKey || shifted) drawFull(t, v); // the view came to rest after a shift, or changed without the springs (a resize)
      else if (t - lastDraw >= (v.z < 0.18 ? 100 : CALM ? 50 : 33)) {  drawFull(t, v); } // the idle rhythm
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// the service worker (src/sw.js): the page and its data from the cache on a repeat visit; built site only
if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register(`${BASE}sw.js`).catch(() => {}));
// a new build while the page waited in memory (the app on the home screen): load again, at the same view (src/update.js)
watchUpdates(BASE, () => { if (!location.hash.startsWith('#misto/')) history.replaceState(null, '', shareUrl()); });
// back in the tab (or the phone woke up): fit the canvas again and redraw
// iPhone: the keyboard scrolls the whole page to bring the field into view and does not always scroll it back when it
// goes. The page itself never scrolls (body overflow: hidden), so whatever is left over is put back once no field has the caret.
document.addEventListener('focusout', () => setTimeout(() => {
  const a = document.activeElement;
  if (a && a.matches && a.matches('input, textarea, select, [contenteditable]')) return;
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
}, 150));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // the tab is hidden (another app on the phone, another tab): the stream of vehicle positions and the traffic
    // polling stop, so they do not use data in the background; the frame loop stops on its own
    layers.live.stop(); liveOn = false;
    if (layers.traffic.timer) { clearInterval(layers.traffic.timer); layers.traffic.timer = null; }
    return;
  }
  // (the live stream and the traffic polling come back of their own accord: liveCheck in the frame loop, the draw of the traffic layer)
  if (weatherTimer && Date.now() - weatherAt > 10 * 60e3) weatherRun(); // the 10-minute timer was frozen with the tab
  window.dispatchEvent(new Event('resize'));
  try { viewer.forceRedraw(); } catch { /* not open yet */ }
});

// ------------------------------------------------------------------ current date and time in Brno
// the pixel watch in the clock: a hand of `len` pixels from the centre towards one of 12 positions
// (function declarations: the first tick comes from lookUi during start-up, before this part of the file runs)
function handPath(k, len) { const a = (k / 12) * 2 * Math.PI; let d = ''; for (let t = 1; t <= len; t++) d += `M${Math.floor(5.5 + t * Math.sin(a))} ${Math.floor(5.5 - t * Math.cos(a))}h1v1h-1z`; return d; }
function calmMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
function tickClock() {
  // the formatters made once (kept on the function: the first tick comes before this part of the file runs). A
  // toLocale…String with options builds a new formatter at every call: 0.5–22 ms on a fast Mac once the browser's own
  // cache is gone, every second, and a tap that comes then waits (INP, measured 2026-11-14)
  const f = tickClock.f ||= Object.fromEntries(Object.entries({
    date: { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' }, time: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
    wd: { weekday: 'short' }, dm: { day: 'numeric', month: 'numeric' }, yr: { year: 'numeric' },
  }).map(([k, o]) => [k, new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', ...o })]));
  const now = new Date();
  const date = f.date.format(now), time = f.time.format(now);
  const c = $('clockText');
  const wd = f.wd.format(now), dm = f.dm.format(now), yr = f.yr.format(now);
  const d = el('small', '', `${wd} ${dm}`); d.append(el('span', 'y', ` ${yr}`));
  c.replaceChildren(d, el('b', 'hm', time.slice(0, 5)), el('span', 's', time.slice(5)));
  $('clock').title = `${date} ${time}: aktuální datum a čas v Brně, k nim se vztahují živá data (počasí, doprava, MHD)`;
  // the watch beside it: the short hand shows the real hour; the long hand steps every 2 seconds (a turn in 24 s) while
  // the map runs as in Brno now, stands still when the look is set by hand, and with reduced motion only moves every 5 minutes
  if ($('clkH')) {
    const [hh, mm, ss] = time.split(':').map(Number);
    $('clkH').setAttribute('d', handPath(Math.round((hh % 12) + mm / 60) % 12, 2));
    const live = (lookUi.state || 'live') === 'live';
    $('clkM').setAttribute('d', handPath(!live ? 0 : calmMotion() ? Math.floor(mm / 5) : Math.floor(ss / 2) % 12, 4));
    $('mhClkH').setAttribute('d', $('clkH').getAttribute('d')); $('mhClkM').setAttribute('d', $('clkM').getAttribute('d'));
  }
}
tickClock();
setInterval(tickClock, 1000);

// The controls waited unseen since the first paint (body.booting): they show at once, together with the map, in their
// final shape: the tiles built, the pixel icons in place, the fonts loaded, and the count of events and the temperature
// if they come within a moment (so they do not push the tiles right after). At the latest 3.5 s + 0.7 s after the start.
{
  const until = (ok, end) => new Promise(res => { const tick = () => (ok() || performance.now() > end ? res() : setTimeout(tick, 50)); tick(); });
  const mapOpen = new Promise(res => (opened ? res() : viewer.addOnceHandler('open', res)));
  Promise.race([Promise.all([mapOpen, document.fonts ? document.fonts.ready : null]), new Promise(res => setTimeout(res, 3500))])
    .then(() => until(() => $('evtCount').textContent && $('fcTileTemp').textContent, performance.now() + 700))
    .then(() => document.body.classList.remove('booting'));
}

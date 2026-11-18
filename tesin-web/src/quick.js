// Rychlé přepínače skupin vrstev: one tile per theme (Stavby, MHD, Doprava, Akce, Místa, Senzory, Fotky) at the
// right edge of the map (on phones a row above the tiles at the bottom). Each tile has one dot per item of its theme,
// lit when that item is shown. A click on a tile that is off turns the theme on (with what was ticked last time, the
// first time with its start set) and opens the menu of its items beside the tile; there any combination is ticked.
// A click on a tile that is on only opens the menu; a second click on the tile, the × of the menu or a click elsewhere
// closes it and leaves what was ticked. The theme is turned off by "Vypnout" in the menu, by holding the tile or by
// a right click. The items of Akce are parts of time (today, this week, later), ticked
// in any combination like the rest. A tile of a single item (Fotky) is a plain switch.
// The detailed switches in Vrstvy stay the truth: the tiles read state.layers and write to it through setLayer, so
// both always agree.
import { shown } from './admin.js';

// ------------------------------------------------------------------ pixel icons, 12 × 12, # = a lit pixel
const PX = {
  crane: ['..##########', '..##.#.#.#.#', '####.......#', '####.......#', '..##.....###', '..##.....#.#', '..##.....###', '..##........', '..##........', '..##........', '..##........', '.######.....'],
  tram: ['.....##.....', '..########..', '.##########.', '.##......##.', '.##......##.', '.##......##.', '.##########.', '.#.######.#.', '.##########.', '..########..', '...##..##...', '...##..##...'],
  cone: ['.....##.....', '.....##.....', '....####....', '....####....', '....#..#....', '...######...', '...######...', '...#....#...', '..########..', '..########..', '.##########.', '############'],
  ticket: ['............', '............', '.####..####.', '#....##....#', '#..#.......#', '#..........#', '#..#.......#', '#..........#', '#..#.......#', '#....##....#', '.####..####.', '............'],
  bust: ['....####....', '...######...', '...######...', '....####....', '.....##.....', '..########..', '.##########.', '.##########.', '............', '...######...', '...######...', '.##########.'],
  thermo: ['....####....', '....#..#....', '....#..#....', '....#..#....', '....####....', '....####....', '....####....', '...######...', '..########..', '..########..', '...######...', '....####....'],
  camera: ['............', '...###......', '############', '############', '####....####', '###......###', '###..##..###', '###..##..###', '###......###', '####....####', '############', '############'],
  // the controls that were glyphs of the font until now, in the same raster
  flag: ['.##.........', '.####.......', '.#######....', '.#########..', '.#########..', '.#######....', '.####.......', '.##.........', '.##.........', '.##.........', '.##.........', '.##.........'],
  ring: ['....####....', '..##....##..', '.#........#.', '.#........#.', '#....##....#', '#...####...#', '#...####...#', '#....##....#', '.#........#.', '.#........#.', '..##....##..', '....####....'],
  sun: ['.....##.....', '.#........#.', '............', '....####....', '...######...', '##.######.##', '##.######.##', '...######...', '....####....', '............', '.#...##...#.', '.....##.....'],
  moon: ['....#####...', '..####......', '.####.......', '.###........', '####........', '####........', '####........', '####.......#', '.####.....##', '.##########.', '..########..', '....####....'],
  layers: ['.....##.....', '...######...', '.##########.', '...######...', '.....##.....', '.##......##.', '...##..##...', '.....##.....', '.##......##.', '...##..##...', '.....##.....', '............'],
  star: ['.....##.....', '.....##.....', '....####....', '....####....', '############', '.##########.', '..########..', '...######...', '...######...', '..###..###..', '.##......##.', '............'],
  // a head and shoulders: the visitor's own menu (Moje, src/moje.js)
  user: ['....####....', '...######...', '...######...', '...######...', '....####....', '............', '..########..', '.##########.', '############', '############', '############', '............'],
  more: ['............', '............', '............', '............', '............', '.##..##..##.', '.##..##..##.', '............', '............', '............', '............', '............'],
  share: ['.....##.....', '....####....', '...##..##...', '..##....##..', '.....##.....', '.....##.....', '.##..##..##.', '.#...##...#.', '.#........#.', '.#........#.', '.##########.', '............'],
  home: ['.....##.....', '....####....', '...######...', '..########..', '.##########.', '############', '..########..', '..###..###..', '..###..###..', '..###..###..', '..########..', '............'],
  // a lighthouse with its rays: "show all of this kind" (a beacon under every highlighted point, src/beacon.js)
  beacon: ['#....##....#', '.#..####..#.', '...######...', '##.#....#.##', '...######...', '....####....', '....#..#....', '....####....', '...##..##...', '...######...', '..########..', '.##########.'],
  // the roles at the top of Vrstvy (src/roles.js): a car, a grown-up with a child, a newspaper, a hard hat
  car: ['............', '............', '...######...', '..##.##.##..', '.##..##..##.', '############', '############', '#.########.#', '############', '.###....###.', '.###....###.', '............'],
  family: ['..##........', '..##........', '............', '.####...##..', '######..##..', '######......', '.####..####.', '.####.######', '.#..#..####.', '.#..#..#..#.', '.#..#..#..#.', '.#..#..#..#.'],
  news: ['............', '.#########..', '.#.......#..', '.#.#####.###', '.#.......#.#', '.#.##.##.#.#', '.#.##....#.#', '.#.##.##.#.#', '.#.......#.#', '.#.#####.#.#', '.###########', '............'],
  helmet: ['............', '............', '.....##.....', '...######...', '..##.##.##..', '.###.##.###.', '.###.##.###.', '.##########.', '############', '############', '............', '............'],
  mirek: ['...######...', '..#......#..', '.#........#.', '#..##..##..#', '#..##..##..#', '#..........#', '#..........#', '#.#......#.#', '#..#....#..#', '.#..####..#.', '..#......#..', '...######...'],
  block: ['............', '.....##.....', '...######...', '.##########.', '############', '#.########.#', '##..####..##', '####.##.####', '.####..####.', '...######...', '.....##.....', '............'], // (Pro koho: Čistá mapa, the map as an isometric block)
  // the rows of Více: install, the data overview, Brno teď, the list of places, Facebook, the press kit
  install: ['.....##.....', '.....##.....', '.....##.....', '.....##.....', '..########..', '...######...', '....####....', '.....##.....', '............', '#..........#', '#..........#', '############'],
  chart: ['............', '.........##.', '.........##.', '.....##..##.', '.....##..##.', '.##..##..##.', '.##..##..##.', '.##..##..##.', '.##..##..##.', '.##..##..##.', '############', '............'],
  pin: ['...######...', '..########..', '.###....###.', '.###....###.', '.###....###.', '..########..', '..########..', '...######...', '....####....', '.....##.....', '.....##.....', '............'],
  fb: ['............', '......####..', '.....#####..', '.....##.....', '.....##.....', '...######...', '...######...', '.....##.....', '.....##.....', '.....##.....', '.....##.....', '............'],
  picture: ['############', '#..........#', '#.......##.#', '#.......##.#', '#...#......#', '#..###..#..#', '#.#####.##.#', '############', '............', '.##########.', '............', '..########..'],
  plus: ['............', '............', '.....##.....', '.....##.....', '.....##.....', '..########..', '..########..', '.....##.....', '.....##.....', '.....##.....', '............', '............'],
  snap: ['####....####', '####....####', '##........##', '##...##...##', '...######...', '...##..##...', '...##..##...', '...######...', '##........##', '##........##', '####....####', '####....####'], // (Snímek: the corners of a viewfinder around a small camera; the big camera is the theme Fotky)
  map: ['....##.....#', '..######.###', '##..#####..#', '#...#####..#', '#...#####..#', '#...#####..#', '#...#####..#', '#...#####..#', '#...#####..#', '#...#####..#', '#.##..#####.', '##......#...'], // (the button that brings the minimap back: a map folded in three, the middle panel in shadow)
  contrast: ['....####....', '..####..##..', '.#####....#.', '.#####....#.', '######.....#', '######.....#', '######.....#', '######.....#', '.#####....#.', '.#####....#.', '..####..##..', '....####....'], // (Kontrastní zobrazení: a disc, one half full)
  find: ['...####.....', '..#....#....', '.#......#...', '.#......#...', '.#......#...', '.#......#...', '..#....#....', '...####.#...', '.........##.', '..........##', '...........#', '............'],
  // how one moves (Spojení, "Jak se pohybuji"): on foot, slowly (a tortoise), with a pram, in a wheelchair
  walk: ['.....##.....', '.....##.....', '....###.....', '...####.#...', '..#.##.#....', '....##......', '....###.....', '...##.#.....', '...#..##....', '..##...#....', '.##....##...', '............'],
  slow: ['............', '............', '...####.....', '..######....', '.########...', '.########.##', '.###########', '#########.##', '.########...', '..##..##....', '..##..##....', '............'],
  pram: ['............', '.####.....#.', '######...#..', '######..#...', '#######.#...', '########....', '.######.....', '..####......', '.#....#.....', '###..###....', '###..###....', '............'],
  chair: ['...##.......', '...##.......', '...#........', '...#####....', '...#........', '...#####....', '..#....##...', '.#..##..#...', '.#.#..#.##..', '.#.#..#.....', '..#.##.#....', '...####.....'],
  minus: ['............', '............', '............', '............', '............', '..########..', '..########..', '............', '............', '............', '............', '............'],
};
const pathCache = {};
function pxPath(name) {
  if (pathCache[name]) return pathCache[name];
  let d = '';
  (PX[name] || []).forEach((r, y) => { let x = 0; while (x < 12) { if (r[x] === '#') { const s = x; while (x < 12 && r[x] === '#') x++; d += `M${s} ${y}h${x - s}v1h-${x - s}z`; } else x++; } });
  return (pathCache[name] = d);
}
/** The SVG of a pixel icon (fills currentColor). */
export const pxIcon = (name, cls = 'ico px-ico') => `<svg class="${cls}" viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="${pxPath(name)}"/></svg>`;
/** Elements with data-px="name" get the pixel icon instead of their text glyph. */
export function placePxIcons(root = document) {
  root.querySelectorAll('[data-px]').forEach(el => { if (!el.querySelector('svg')) el.innerHTML = pxIcon(el.dataset.px); });
}

const HASICI = shown('hasici');
const PARKING = shown('parking');
const CISTENI = shown('cisteni');
const VODA = shown('voda');
export const EVENT_PARTS = 'twl';
const EVENT_CODES = ['', 't', 'tw', 'twl', 'w', 'l', 'wl', 'tl'];
export const GROUPS = [
  { key: 'stavby', name: 'Stavby', icon: 'crane', def: 1, levels: [
    { n: 'aktuálně probíhající výstavba', on: ['building'] }, { n: 'plány města', on: ['planCity'] }, { n: 'soukromé plány', on: ['planPrivate'] }, { n: 'dopravní záměry', on: ['bigplans'] }] },
  { key: 'mhd', name: 'MHD', icon: 'tram', def: 1, levels: [
    { n: 'vozidla a zastávky', on: ['mhd', 'mhdStops'] }, { n: 'výluky', on: ['mhdOutages'], focus: 'vyluky' }] },
  // (výjezdy hasičů: only where the part "hasici" is public, public.config.json; without it the tile is as it was)
  // (parkovací domy: the last level, on at the start like the rest of the tile; only where the part "parking" is public)
  { key: 'doprava', name: HASICI ? 'Doprava, nehody' : 'Doprava', short: 'Doprava', icon: 'cone', def: 3 + (HASICI ? 1 : 0) + (PARKING ? 1 : 0) + (CISTENI ? 1 : 0) + (VODA ? 1 : 0), levels: [
    { n: 'kolony a nehody', on: ['jams'], focus: 'kolony' }, ...(HASICI ? [{ n: 'výjezdy hasičů', on: ['hasici'], focus: 'hasici' }] : []), { n: 'uzavírky', on: ['closures'], focus: 'uzavirky' }, { n: 'výkopy a zábory', on: ['works'], focus: 'vykopy' }, ...(PARKING ? [{ n: 'parkovací domy', on: ['parking'], focus: 'parking' }] : []),
    // (blokové čištění: always the last level, so the digits of older shared links keep their meaning; only where the part "cisteni" is public)
    ...(CISTENI ? [{ n: 'blokové čištění', on: ['clean'], focus: 'clean' }] : []),
    // (havárie a odstávky vody: after blokové čištění for the same reason; only where the part "voda" is public)
    ...(VODA ? [{ n: 'havárie a odstávky vody', on: ['voda'], focus: 'voda' }] : [])] },
  { key: 'akce', name: 'Akce', icon: 'ticket', def: 1, levels: [
    { n: 'dnes', on: ['events'] }, { n: 'tento týden', on: [], focus: 'events' }, { n: 'později', on: [] }] },
  { key: 'mista', name: 'Místa', icon: 'bust', def: 1, levels: [
    { n: 'sochy, stromy, kříže, pamětní desky a kameny zmizelých', on: ['smArt', 'smTree', 'smCross', 'smPlaque', 'smStolper'] }, { n: 'názvy míst', on: ['names'] }, { n: 'kulturní památky', on: ['monuments'] }] },
  // the sensors of the city: the webcams first, then the temperatures and the air quality together
  { key: 'senzory', name: 'Senzory', icon: 'thermo', def: 2, levels: [
    { n: 'webkamery', on: ['cams'], focus: 'cams' }, { n: 'teploty a ovzduší', on: ['meteo', 'air'] }] },
  // the street-level photos get in the way: one tile, one dot, off at the start and shown with one tap (only where the part "pano" is public)
  { key: 'foto', name: 'Fotky', icon: 'camera', def: 0, pub: 'pano', levels: [
    { n: 'fotky z ulice (Panoramax)', on: ['pano'] }] },
];

/**
 * @param state the page state (state.layers, state.eventsRange)
 * @param setLayer (key, on) → sets the layer and its switch in Vrstvy
 * @param setEventsRange (range) → the time range of the events layer
 * @param mount the element that takes the tiles
 */
export function createQuick({ state, setLayer, setEventsRange, mount, shown = () => true, onStep = null, onMore = null, focusButton = null }) {
  // (a part that is not public has no tile; a layer of such a part is left out of its level, with the words that name it)
  const PUB_LAYERS = { smStolper: ['kameny', ' a kameny zmizelých'] };
  const GROUPS_HERE = GROUPS.filter(g => !g.pub || shown(g.pub)).map(g => ({ ...g, levels: g.levels.map(l => {
    const off = l.on.filter(k => PUB_LAYERS[k] && !shown(PUB_LAYERS[k][0]));
    return off.length ? { ...l, on: l.on.filter(k => !off.includes(k)), n: off.reduce((n, k) => n.replace(PUB_LAYERS[k][1], ''), l.n) } : l;
  }) }));
  const byKey = k => GROUPS_HERE.find(g => g.key === k);

  // which items of a group are shown (Akce: the parts of time ticked, while the layer is on)
  const itemOn = (g, i) => (g.key === 'akce' ? !!state.layers.events && state.eventsRange.includes(EVENT_PARTS[i]) : g.levels[i].on.every(k => state.layers[k]));
  const onList = g => g.levels.map((l, i) => itemOn(g, i));
  const countOn = g => onList(g).filter(Boolean).length;
  const anyOn = g => (g.key === 'akce' ? !!state.layers.events : g.levels.some(l => l.on.some(k => state.layers[k])));
  const shownText = g => g.levels.filter((l, i) => itemOn(g, i)).map(l => l.n).join(', ');
  // the level of a shared link (#@…&v=): how many items from the first one on are shown in a row (Akce: the digit of its combination)
  function levelOf(g) {
    if (g.key === 'akce') return state.layers.events ? Math.max(1, EVENT_CODES.indexOf(state.eventsRange)) : 0;
    let L = 0;
    while (L < g.levels.length && g.levels[L].on.every(k => state.layers[k])) L++;
    return L;
  }
  function apply(g, L) {
    if (g.key === 'akce') { if (L > 0) setEventsRange(EVENT_CODES[L] || 't'); setLayer('events', L > 0); }
    else g.levels.forEach((l, i) => l.on.forEach(k => setLayer(k, i < L)));
  }
  function setItem(g, i, on) {
    if (g.key !== 'akce') { g.levels[i].on.forEach(k => setLayer(k, on)); return; }
    // (the last part unticked: the layer goes off and keeps its parts for the next time)
    const cur = state.layers.events ? state.eventsRange : '', k = EVENT_PARTS[i], next = on ? cur + k : cur.replace(k, '');
    if (next) setEventsRange(next);
    setLayer('events', !!next);
  }
  // what a tile had ticked when it was turned off: it comes back with the same (the first time with its start set)
  const last = {};
  function turnOff(g) {
    if (anyOn(g) && g.key !== 'akce') last[g.key] = onList(g);
    if (g.key === 'akce') setLayer('events', false); else g.levels.forEach((l, i) => setItem(g, i, false));
  }
  function turnOn(g) {
    if (g.key === 'akce') { setLayer('events', true); return; } // (the range stays the one chosen last)
    const set = last[g.key] && last[g.key].some(Boolean) ? last[g.key] : g.levels.map((l, i) => i < Math.max(1, g.def));
    g.levels.forEach((l, i) => setItem(g, i, set[i]));
  }

  // the tiles
  const tiles = {};
  mount.classList.toggle('n7', GROUPS_HERE.length >= 7); // (seven tiles: the short names on phones)
  for (const g of GROUPS_HERE) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'qt'; b.dataset.g = g.key;
    b.innerHTML = `${pxIcon(g.icon)}<span class="dots">${g.levels.map(() => '<i></i>').join('')}</span><span class="l">${g.name}</span><span class="l s">${g.short || g.name}</span>`;
    mount.append(b); tiles[g.key] = b;
  }

  function paint(el, g) {
    const on = anyOn(g), n = g.levels.length;
    el.setAttribute('aria-pressed', String(on));
    el.querySelectorAll('.dots i').forEach((d, i) => d.classList.toggle('on', itemOn(g, i)));
    el.title = `${g.name}: ${on ? shownText(g) || 'zapnuto' : 'vypnuto'}. ${n > 1 ? (on ? 'Klepnutí: nabídka, co ukázat (druhé klepnutí ji zavře); podržení: vypnout.' : 'Klepnutí: zapnout a vybrat, co ukázat.') : 'Klepnutí: zapnout nebo vypnout.'}`;
    el.setAttribute('aria-label', `${g.name}, ${on ? (n < 2 ? 'zapnuto' : `zapnuto ${countOn(g)} z ${n}`) : 'vypnuto'}`);
  }
  function render() { for (const g of GROUPS_HERE) paint(tiles[g.key], g); }

  // The menu of a tile: the items of its theme, each ticked on its own, "Vypnout" and
  // the way to the detailed switches. It goes by itself after eight seconds without a touch, with a click elsewhere or Esc.
  let menuTimer = null, menuKey = null;
  const closeMenu = () => { clearTimeout(menuTimer); menuKey = null; document.querySelectorAll('.qt-menu').forEach(m => m.remove()); };
  const menuLife = () => { clearTimeout(menuTimer); menuTimer = setTimeout(closeMenu, 8000); };
  function menu(g) {
    const on = anyOn(g);
    document.querySelectorAll('.qt-menu').forEach(m => m.remove());
    const m = document.createElement('div');
    m.className = 'qt-menu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', `${g.name}: co ukázat`);
    const head = document.createElement('div'); head.className = 'qm-head';
    head.innerHTML = `<b>${g.name}</b><small>${!on ? 'vypnuto' : `${countOn(g)}/${g.levels.length}`}</small>`;
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'qm-x'; x.textContent = '×'; x.title = 'Zavřít nabídku (výběr zůstane)'; x.setAttribute('aria-label', 'Zavřít nabídku');
    x.onclick = e => { e.stopPropagation(); closeMenu(); };
    head.append(x);
    m.append(head);
    const row = (text, checked, act) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'qm-row';
      if (checked !== null) { b.setAttribute('role', 'menuitemcheckbox'); b.setAttribute('aria-checked', String(checked)); }
      b.innerHTML = `<i aria-hidden="true"></i><span></span>`; b.lastChild.textContent = text;
      b.onclick = e => { e.stopPropagation(); act(); render(); menu(g); if (onStep) onStep(g.key, countOn(g)); };
      m.append(b);
      return b;
    };
    g.levels.forEach((l, i) => {
      const b = row(l.n, itemOn(g, i), () => setItem(g, i, !itemOn(g, i)));
      // the beacon of the row's theme (the same button as in Vrstvy and in a card): the layer on, all its points highlighted
      const f = l.focus && focusButton ? focusButton(l.focus) : null;
      if (!f) return;
      const line = document.createElement('div'); line.className = 'qm-line';
      b.replaceWith(line); line.append(b, f);
      f.addEventListener('click', () => setTimeout(() => { render(); if (menuKey === g.key) menu(g); }, 60)); // (the switch it turned on: ticked in the menu too)
    });
    if (on) row('Vypnout vrstvy', null, () => turnOff(g)).classList.add('qm-off');
    if (onMore) {
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'qm-more'; more.textContent = 'Podrobně ve Vrstvách ›';
      more.onclick = e => { e.stopPropagation(); closeMenu(); onMore(g.key); };
      m.append(more);
    }
    // beside the tile, but a child of the column, not of the pressed button (a pressed button is transformed, which
    // would catch a fixed menu inside it); on phones the stylesheet puts it above the row of tiles
    const b = tiles[g.key];
    m.style.top = `${b.offsetTop}px`;
    m.addEventListener('pointerdown', menuLife); m.addEventListener('pointermove', menuLife);
    mount.append(m);
    menuKey = g.key; menuLife();
  }
  addEventListener('pointerdown', e => { if (menuKey && !e.target.closest('.qt-menu, .qt')) closeMenu(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && menuKey) closeMenu(); });

  // a click on a tile (off = held or right-clicked: off at once)
  function step(key, off) {
    const g = byKey(key); if (!g) return;
    const on = anyOn(g), single = g.levels.length < 2;
    if (off) { turnOff(g); closeMenu(); }
    else if (!on) { turnOn(g); if (single) closeMenu(); else menu(g); }
    else if (single) { turnOff(g); closeMenu(); } // (a plain switch)
    else if (menuKey === g.key) { closeMenu(); return; } // (the second click only closes the menu: what was ticked stays)
    else { render(); menu(g); return; } // (on: only the menu, nothing changes yet)
    render();
    if (onStep) onStep(g.key, countOn(g));
  }

  // click = on and the menu (see step); holding (500 ms) or the right button = off
  let holdTimer = null, held = false;
  const onDown = e => { const b = e.target.closest('[data-g]'); if (!b || (e.pointerType === 'mouse' && e.button !== 0)) return; held = false; clearTimeout(holdTimer); holdTimer = setTimeout(() => { held = true; step(b.dataset.g, true); }, 500); };
  const onUp = () => clearTimeout(holdTimer);
  const onClick = e => { const b = e.target.closest('[data-g]'); if (!b) return; e.preventDefault(); e.stopPropagation(); if (held) { held = false; return; } step(b.dataset.g, false); };
  const onMenu = e => { const b = e.target.closest('[data-g]'); if (!b) return; e.preventDefault(); step(b.dataset.g, true); };
  mount.addEventListener('pointerdown', onDown); mount.addEventListener('pointerup', onUp); mount.addEventListener('pointercancel', onUp); mount.addEventListener('pointerleave', onUp, true);
  mount.addEventListener('click', onClick); mount.addEventListener('contextmenu', onMenu);
  render();
  // For a shared link (#@…&v=…): one digit per tile in the fixed order of GROUPS (the level, 0 = off; a tile this
  // version has not is 0), and the switches of the tiles that differ from their level (ticked by hand) as +key / -key.
  function code() {
    let digits = '', odd = '';
    for (const G of GROUPS) {
      const g = byKey(G.key);
      if (!g) { digits += '0'; continue; }
      const L = levelOf(g);
      digits += String(Math.min(9, L));
      if (g.key !== 'akce') g.levels.forEach((l, i) => l.on.forEach(k => { if (!!state.layers[k] !== i < L) odd += `${state.layers[k] ? '+' : '-'}${k}`; }));
    }
    return { digits, odd };
  }
  // … and back: the levels of the tiles (a tile missing here, or a digit missing in the link, is left as it is)
  function setCode(digits) {
    GROUPS.forEach((G, i) => {
      const g = byKey(G.key), d = digits[i];
      if (g && d >= '0' && d <= '9') apply(g, Math.min(+d, g.key === 'akce' ? 7 : g.levels.length));
    });
    render();
  }
  return { render, step, levelOf, code, setCode, closeMenu };
}

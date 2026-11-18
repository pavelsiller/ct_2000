import { DATA_BASE } from './feed.js';
import { itemInMap } from './extent.js';
import { onScreen } from './onscreen.js';

const INK = '#161d2b', CREAM = '#fff6d8', POLL_MS = 30 * 60e3;
// the kinds: name, colour of the sign and its picture (9 × 9)
export const KINDS = {
  vloupani: { n: 'Vloupání', col: '#b3122e', px: ['...####..', '..#....#.', '..#....#.', '..#......', '#########', '####.####', '####.####', '#########', '#########'] }, // an open padlock
  kradeze: { n: 'Krádež', col: '#e2741c', px: ['...###...', '..#...#..', '..#...#..', '.#######.', '#########', '#########', '####.####', '#########', '.#######.'] }, // a bag
  nasili: { n: 'Násilí', col: '#6b2fa0', px: ['....###..', '...###...', '..###....', '.#######.', '....###..', '...###...', '..##.....', '.##......', '##.......'] }, // a lightning
};
// the classes of the police in plain words (data: the label of the police)
const NICE = {
  'Krádeže součástek a věcí (nebo PHM) z motorových vozidel včetně vloupání': 'Krádež věcí z auta (i s vloupáním do auta)',
  'Krádeže motorových vozidel - dvoustopých': 'Krádež auta', 'Krádeže motorových vozidel - jednostopých': 'Krádež motorky',
  'Krádeže jízdních kol': 'Krádež kola', 'Krádeže na osobách': 'Krádež na osobě (kapsář)', 'Krádeže věcí v objektech (bez vloupání)': 'Krádež v budově',
  'Krádeže věcí ve volném terénu': 'Krádež venku', 'Ostatní krádeže (bez vloupání)': 'Jiná krádež', 'Krádeže SPZ': 'Krádež SPZ', 'Krádeže obchodního majetku zaměstnancem': 'Krádež zaměstnancem',
  'Krádeže se vztahem k železniční přepravě osob': 'Krádež ve vlaku nebo na nádraží', 'Krádeže přepravovaných zásilek': 'Krádež zásilky',
  Byt: 'Vloupání do bytu', 'Rodinný domek': 'Vloupání do rodinného domu', Prodejna: 'Vloupání do prodejny', 'Restaurace a jiná pohostinská zařízení': 'Vloupání do restaurace',
  'Ubytovací objekt': 'Vloupání do ubytovny nebo hotelu', 'Rekreační objekt': 'Vloupání do chaty', 'Jiný objekt': 'Vloupání do jiného objektu (sklep, garáž, kůlna…)',
  'Podnik výrobní objekt': 'Vloupání do firmy', 'Školský objekt': 'Vloupání do školy', 'Sportovní objekt': 'Vloupání do sportoviště', 'Kulturní objekt': 'Vloupání do kulturního zařízení',
  'Zdravotnický objekt': 'Vloupání do zdravotnického zařízení', 'Církevní objekt': 'Vloupání do kostela', Úřad: 'Vloupání do úřadu', 'Peněžní ústav': 'Vloupání do banky',
  loupež: 'Loupež', Loupež: 'Loupež', 'Výtržnictví (bez mravnostního charakteru)': 'Výtržnictví', 'Úmyslné ublížení na zdraví': 'Úmyslné ublížení na zdraví',
  'Útok proti výkonu pravomoci státního orgánu a úřední osoby': 'Útok na úřední osobu', 'Omezování osobní svobody (bez mravnostního charakteru)': 'Omezování osobní svobody',
};
const inRing = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > y) !== (r[j + 1] > y) && x < ((r[j] - r[i]) * (y - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; };
export const caseText = o => NICE[o.sub] || o.sub || (o.kind === 'nasili' ? 'Násilný trestný čin' : KINDS[o.kind].n);

export function createPolicie({ base, llToImg, onChange = () => {} }) {
  const D = { items: [], from: '', to: '', updated: '' };
  let loading = null, loadedAt = 0, posKey = '', groups = [], hits = [];
  const urls = () => [DATA_BASE ? `${DATA_BASE}/data/policie.json?h=${Math.floor(Date.now() / 3600e3)}` : '', `${base}data/policie.json`].filter(Boolean);
  async function fetchNow() {
    for (const u of urls()) {
      try {
        const r = await fetch(u, { cache: 'no-store' });
        if (!r.ok) continue;
        const d = await r.json();
        D.items = (d.items || []).filter(itemInMap); D.from = d.from || ''; D.to = d.to || ''; D.updated = d.updated || '';
        posKey = ''; loadedAt = Date.now();
        onChange();
        return;
      } catch { /* the next address */ }
    }
  }
  const load = () => (loading ||= fetchNow());
  // the file changes once a day: looked at again after half an hour when the tab comes back
  document.addEventListener('visibilitychange', () => { if (!document.hidden && loading && Date.now() - loadedAt > POLL_MS) fetchNow(); });

  // the cases of one area together: { X, Y, lon, lat, items (newest first), kind (of the newest), age (days of the newest) }
  function positions() {
    const key = `${llToImg(16.6, 49.2).join(',')}|${D.items.length}|${D.updated}`;
    if (key === posKey) return;
    posKey = key;
    const by = new Map();
    for (const o of D.items) {
      const k = `${o.lon},${o.lat}`;
      let g = by.get(k);
      if (!g) { const [X, Y] = llToImg(o.lon, o.lat); by.set(k, (g = { X, Y, lon: o.lon, lat: o.lat, items: [] })); }
      g.items.push(o);
    }
    const end = D.to ? Date.parse(`${D.to}T23:59`) : Date.now();
    groups = [...by.values()].map(g => {
      g.items.sort((a, b) => (a.t < b.t ? 1 : -1));
      g.kind = g.items[0].kind;
      g.age = Math.max(0, (end - Date.parse(g.items[0].t)) / 864e5);
      return g;
    }).sort((a, b) => a.Y - b.Y);
  }
  // the sign: a square in the colour of the kind with a cream rim and a dark edge on a short post; n > 1: the number
  // of cases in a dark box at its corner
  function sign(ctx, x, y, kind, n) {
    const K = KINDS[kind], s = 1, r = 9, top = y - 2 * r - 6;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - r + 2, top + 4, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = INK; ctx.fillRect(x - r - 3, top, 2 * r + 6, 2 * r + 6); ctx.fillRect(x - 1, y - 3, 2, 5);
    ctx.fillStyle = CREAM; ctx.fillRect(x - r - 1, top + 2, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = K.col; ctx.fillRect(x - r, top + 3, 2 * r, 2 * r);
    ctx.fillStyle = CREAM;
    const ox = x - Math.round(4.5 * s), oy = top + 3 + r - Math.round(4.5 * s);
    K.px.forEach((row, j) => { for (let i = 0; i < 9; i++) if (row[i] === '#') ctx.fillRect(ox + i * s, oy + j * s, s, s); });
    let x1 = x + r + 3;
    if (n > 1) {
      ctx.font = '400 15px "VT323", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const t = String(n), w = Math.max(11, Math.ceil(ctx.measureText(t).width) + 5), bx = x + r - 2, by = top - 5;
      ctx.fillStyle = INK; ctx.fillRect(bx - 1, by - 1, w + 2, 14);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, w, 12);
      ctx.fillStyle = INK; ctx.fillText(t, bx + w / 2, by + 6.5);
      x1 = Math.max(x1, bx + w);
    }
    return [x - r - 3, top - 5, x1, y + 2];
  }
  function draw(ctx, v) {
    hits = [];
    if (!loading) { load(); return; }
    if (!D.items.length) return;
    positions();
    const alpha = ctx.globalAlpha;
    for (const g of groups) {
      const x = Math.round(v.ox + g.X * v.k), y = Math.round(v.oy + g.Y * v.k);
      if (!onScreen(ctx, x, y, 60)) continue;
      if (ctx.__claim && !ctx.__claim(x - 14, y - 32, x + 16, y + 2, false)) continue;
      ctx.globalAlpha = alpha * (1 - Math.min(0.45, (g.age / 7) * 0.45)); // the last day full, a week old paler
      hits.push([...sign(ctx, x, y, g.kind, g.items.length), g]);
    }
    ctx.globalAlpha = alpha;
  }
  const at = (sx, sy) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]) return h[4]; } return null; };
  const list = () => { positions(); return groups; };
  let cells = null;
  async function areaAt(lon, lat) {
    cells ||= fetch(`${base}data/r0/dm/kriminalita-oblasti.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const d = await cells;
    if (!d) { cells = null; return null; }
    const r = d.rings.find(q => q.length >= 6 && inRing(q, lon, lat));
    if (!r) return null;
    const out = [], corners = [];
    for (let i = 0; i < r.length; i += 2) {
      const lo = r[i], la = r[i + 1], lo1 = r[(i + 2) % r.length], la1 = r[(i + 3) % r.length];
      const n = Math.max(1, Math.ceil(Math.hypot((lo1 - lo) * 73e3, (la1 - la) * 111e3) / 30)); // a point every 30 m: the line lies on the hills
      corners.push(out.length / 2);
      for (let j = 0; j < n; j++) out.push(...llToImg(lo + ((lo1 - lo) * j) / n, la + ((la1 - la) * j) / n));
    }
    return Object.assign(out, { corners });
  }
  return { load, draw, at, list, positions, areaAt, data: D };
}

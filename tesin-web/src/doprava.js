import { DATA_BASE, SAMPLE } from './feed.js';
import { delayColor } from './vehicles.js';
import './doprava.css';

const POLL_MS = 60e3, STALE_MIN = 20;
const SEV = ['#4fb05a', '#9cc04a', '#e8b32a', '#e07a2a', '#d8362a'];
export const sevCol = v => (v == null ? '#8d939e' : SEV[Math.max(0, Math.min(4, Math.floor(v / 20)))]);
const ZONE = { centrum: 'centrum', sirsi: 'širší centrum', okraj: 'okraj', dalnice: 'dálnice' };
const TYPE = { tram: 'Šaliny', trol: 'Trolejbusy', bus: 'Autobusy' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (v, d = 0) => (v == null ? '–' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('cs-CZ'));
const hm = ms => new Date(ms).toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: 'numeric', minute: '2-digit' });
const toMin = (from, i, step) => ((from + i * step) - from) / 60e3; // (minutes since midnight of the slot i)

// pixel glyphs, 12 × 8
const G = {
  tram: ['....#.#.....', '.....#......', '############', '#..#..#..#.#', '############', '############', '############', '.##......##.'],
  trol: ['...#....#...', '....#....#..', '.....#....#.', '############', '#..#..#..#.#', '############', '############', '.##......##.'],
  bus: ['............', '............', '###########.', '#..#..#..###', '############', '############', '############', '.##......##.'],
  car: ['............', '...#####....', '..#..#..#...', '.##########.', '############', '############', '.##.....##..', '............'],
  p: ['..######....', '..##...##...', '..##...##...', '..######....', '..##........', '..##........', '..##........', '............'],
};
const glyph = (g, col = 'currentColor', w = 18, h = 12) => { let d = ''; G[g].forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') d += `M${x} ${y}h1v1h-1z`; })); return `<svg class="dg" width="${w}" height="${h}" viewBox="0 0 12 8" shape-rendering="crispEdges" aria-hidden="true"><path fill="${col}" d="${d}"/></svg>`; };
// the gauge of the tile: a half dial green → red, the needle at the value
function gauge(v) {
  const n = v == null ? '' : v < 25 ? 'M5 6h1v2H5zM4 6h1v1H4zM3 5h1v1H3z' : v < 45 ? 'M5 6h1v2H5zM5 5h1v1H5zM4 4h1v1H4z' : v < 60 ? 'M5 6h1v2H5zM5 5h1v1H5zM5 4h1v1H5z' : v < 80 ? 'M5 6h1v2H5zM6 5h1v1H6zM7 4h1v1H7z' : 'M5 6h1v2H5zM6 6h1v1H6zM7 5h1v1H7z';
  return `<svg width="22" height="16" viewBox="0 0 11 8" shape-rendering="crispEdges" aria-hidden="true"><path fill="${SEV[0]}" d="M0 6h2v2H0zM1 4h2v2H1z"/><path fill="${SEV[2]}" d="M3 2h2v2H3zM5 1h1v2H5z"/><path fill="${SEV[4]}" d="M6 1h2v2H6zM8 3h2v2H8zM9 5h2v3H9z"/>${n ? `<path fill="#f0f2ea" d="${n}"/>` : ''}</svg>`;
}
function spark(D, W = 64, H = 20) {
  const Y = v => H - 2 - (Math.min(100, v) / 100) * (H - 5);
  let pts = [];
  if (D.h24 && Array.isArray(D.h24.idx)) { const n = D.h24.idx.length; pts = D.h24.idx.map((v, i) => [1 + (i / (n - 1)) * (W - 4), v]); }
  else if (D.day && D.day.idx) { const m0 = 300; pts = D.day.idx.map((v, i) => [toMin(D.day.from, i, 300e3), v]).filter(([m]) => m >= m0).map(([m, v]) => [1 + ((m - m0) / (1440 - m0)) * (W - 2), v]); }
  let s = '', last = null;
  for (const p of pts) {
    if (p[1] != null && last && last[1] != null) s += `<line x1="${last[0].toFixed(1)}" y1="${Y(last[1]).toFixed(1)}" x2="${p[0].toFixed(1)}" y2="${Y(p[1]).toFixed(1)}" stroke="${sevCol((last[1] + p[1]) / 2)}" stroke-width="2" stroke-linecap="square"/>`;
    last = p;
  }
  const e = [...pts].reverse().find(p => p[1] != null);
  if (e) s += `<rect class="now" x="${(e[0] - 2).toFixed(1)}" y="${(Y(e[1]) - 2).toFixed(1)}" width="4" height="4" fill="#f0f2ea"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${s}</svg>`;
}
// the big dial of the overview: 20 blocks on a half circle
function dial(v) {
  const cx = 66, cy = 70, R = 56, n = 20; let s = '';
  for (let i = 0; i < n; i++) {
    const a = Math.PI - ((i + 0.5) / n) * Math.PI, x = cx + Math.cos(a) * R, y = cy - Math.sin(a) * R, val = ((i + 0.5) / n) * 100;
    s += `<rect x="${(x - 5).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="10" height="10" fill="${v != null && val <= v ? sevCol(val) : '#171f2e'}" stroke="#384563" transform="rotate(${((-a * 180) / Math.PI + 90).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  if (v != null) { const a = Math.PI - (v / 100) * Math.PI; s += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * (R - 14)).toFixed(1)}" y2="${(cy - Math.sin(a) * (R - 14)).toFixed(1)}" stroke="#f0f2ea" stroke-width="4"/><rect x="${cx - 5}" y="${cy - 5}" width="10" height="10" fill="#f0f2ea"/>`; }
  return `<svg class="dop-dial" viewBox="0 0 132 76" width="132" height="76" role="img" aria-label="Ucpanost ${v ?? 'bez dat'} ze 100">${s}</svg>`;
}
// the day: the number 0–100 every 5 minutes, the bands of the scale behind it
function dayChart(D) {
  const W = 360, H = 120, L = 22, R = 6, T = 14, B = 16, X = m => L + (m / 1440) * (W - L - R), Y = v => T + (1 - v / 100) * (H - T - B);
  let s = '';
  for (let b = 0; b < 5; b++) s += `<rect x="${L}" y="${Y((b + 1) * 20)}" width="${W - L - R}" height="${Y(b * 20) - Y((b + 1) * 20)}" fill="${SEV[b]}" opacity=".07"/>`;
  for (const v of [0, 50, 100]) s += `<text x="${L - 4}" y="${Y(v) + 3}" class="ax" text-anchor="end">${v}</text>`;
  for (const h of [0, 6, 12, 18, 24]) s += `<text x="${X(h * 60)}" y="${H - 3}" class="ax" text-anchor="middle">${h}:00</text>`;
  const pts = D.day.idx.map((v, i) => [toMin(D.day.from, i, D.step || 300e3), v]);
  let seg = [], path = '', area = '';
  const flush = () => { if (seg.length > 1) { const d = seg.map(([m, v]) => `${X(m).toFixed(1)} ${Y(v).toFixed(1)}`).join('L'); path += `M${d}`; area += `M${X(seg[0][0]).toFixed(1)} ${Y(0)}L${d}L${X(seg[seg.length - 1][0]).toFixed(1)} ${Y(0)}Z`; } seg = []; };
  for (const p of pts) { if (p[1] == null) flush(); else seg.push(p); }
  flush();
  s += `<path d="${area}" fill="url(#dopGr)"/><path d="${path}" fill="none" stroke="#f0f2ea" stroke-width="1.6" stroke-linejoin="round"/>`;
  s = `<defs><linearGradient id="dopGr" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${SEV[0]}" stop-opacity=".2"/><stop offset=".5" stop-color="${SEV[2]}" stop-opacity=".4"/><stop offset="1" stop-color="${SEV[4]}" stop-opacity=".7"/></linearGradient></defs>${s}`;
  if (D.peak) { const m = (D.peak.t - D.day.from) / 60e3; s += `<rect x="${X(m) - 3}" y="${Y(D.peak.idx) - 3}" width="6" height="6" fill="${sevCol(D.peak.idx)}" stroke="#f0f2ea"/><text x="${Math.min(X(m) + 6, W - 90)}" y="${Math.max(Y(D.peak.idx) - 4, 10)}" class="lb">vrchol ${esc(D.peak.at)} · ${D.peak.idx}</text>`; }
  const e = [...pts].reverse().find(p => p[1] != null);
  if (e) s += `<line x1="${X(e[0])}" x2="${X(e[0])}" y1="${T - 4}" y2="${Y(0)}" stroke="#f3c868" stroke-dasharray="2 2"/><rect class="now" x="${X(e[0]) - 4}" y="${Y(e[1]) - 4}" width="8" height="8" fill="#f3c868" stroke="#161d2b"/>`;
  return `<svg class="dop-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ucpanost dnes po pěti minutách${D.peak ? `, nejhůř v ${D.peak.at} (${D.peak.idx})` : ''}">${s}</svg>`;
}
// several days (week of the file: every day a value every 15 minutes): 2 days by quarter hours, the week by hours (the
// highest of the hour); the days apart by a dotted line and named under the chart, the weekend a little lighter, the
// highest moment marked, the yellow line is now
const WD = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
function daysChart(D, nd) {
  const days = D.week.days.slice(-nd), per = nd > 2 ? 4 : 1, slot = (D.week.step || 900e3) / 60e3, tot = nd * 1440;
  const W = 360, H = 120, L = 22, R = 6, T = 14, B = 16, X = m => L + (m / tot) * (W - L - R), Y = v => T + (1 - v / 100) * (H - T - B);
  let s = '';
  for (let b = 0; b < 5; b++) s += `<rect x="${L}" y="${Y((b + 1) * 20)}" width="${W - L - R}" height="${Y(b * 20) - Y((b + 1) * 20)}" fill="${SEV[b]}" opacity=".07"/>`;
  for (const v of [0, 50, 100]) s += `<text x="${L - 4}" y="${Y(v) + 3}" class="ax" text-anchor="end">${v}</text>`;
  const pts = [];
  let peak = null;
  days.forEach((d, k) => {
    const wd = new Date(`${d.date}T12:00:00`).getDay(), last = k === days.length - 1;
    if (wd === 0 || wd === 6) s += `<rect x="${X(k * 1440)}" y="${T}" width="${X(1440) - X(0)}" height="${Y(0) - T}" fill="#f0f2ea" opacity=".05"/>`;
    if (k) s += `<line x1="${X(k * 1440)}" x2="${X(k * 1440)}" y1="${T}" y2="${Y(0)}" stroke="#384563" stroke-dasharray="2 2"/>`;
    const name = nd === 2 ? (last ? 'dnes' : 'včera') : last ? 'dnes' : `${WD[wd]} ${+d.date.slice(8)}.`;
    s += `<text x="${X(k * 1440 + 720)}" y="${H - 3}" class="ax" text-anchor="middle">${name}</text>`;
    for (let i = 0; i < d.idx.length; i += per) {
      let v = null;
      for (let j = i; j < Math.min(i + per, d.idx.length); j++) if (d.idx[j] != null && (v == null || d.idx[j] > v)) v = d.idx[j];
      const m = k * 1440 + (i + (per > 1 ? per / 2 : 0)) * slot;
      pts.push([m, v]);
      if (v != null && (!peak || v > peak.v)) peak = { m, v, at: `${nd === 2 ? (last ? 'dnes' : 'včera') : WD[wd]} ${Math.floor((i * slot) / 60)}:${String((i * slot) % 60).padStart(2, '0')}` };
    }
  });
  let seg = [], path = '', area = '';
  const flush = () => { if (seg.length > 1) { const d = seg.map(([m, v]) => `${X(m).toFixed(1)} ${Y(v).toFixed(1)}`).join('L'); path += `M${d}`; area += `M${X(seg[0][0]).toFixed(1)} ${Y(0)}L${d}L${X(seg[seg.length - 1][0]).toFixed(1)} ${Y(0)}Z`; } seg = []; };
  for (const p of pts) { if (p[1] == null) flush(); else seg.push(p); }
  flush();
  s += `<path d="${area}" fill="url(#dopGrW)"/><path d="${path}" fill="none" stroke="#f0f2ea" stroke-width="${nd > 2 ? 1.2 : 1.4}" stroke-linejoin="round"/>`;
  s = `<defs><linearGradient id="dopGrW" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${SEV[0]}" stop-opacity=".2"/><stop offset=".5" stop-color="${SEV[2]}" stop-opacity=".4"/><stop offset="1" stop-color="${SEV[4]}" stop-opacity=".7"/></linearGradient></defs>${s}`;
  if (peak) s += `<rect x="${X(peak.m) - 3}" y="${Y(peak.v) - 3}" width="6" height="6" fill="${sevCol(peak.v)}" stroke="#f0f2ea"/><text x="${Math.max(L + 2, Math.min(X(peak.m) + 6, W - 100))}" y="${Math.max(Y(peak.v) - 4, 10)}" class="lb">vrchol ${esc(peak.at)} · ${peak.v}</text>`;
  const e = [...pts].reverse().find(p => p[1] != null);
  if (e) s += `<line x1="${X(e[0])}" x2="${X(e[0])}" y1="${T - 4}" y2="${Y(0)}" stroke="#f3c868" stroke-dasharray="2 2"/><rect class="now" x="${X(e[0]) - 4}" y="${Y(e[1]) - 4}" width="8" height="8" fill="#f3c868" stroke="#161d2b"/>`;
  return `<svg class="dop-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ucpanost ${nd === 2 ? 'včera a dnes po čtvrthodinách' : 'za týden po hodinách'}${peak ? `, nejhůř ${peak.at} (${peak.v})` : ''}">${s}</svg>`;
}
function zonesSvg(z) {
  const dia = (r, c, o) => `<path d="M59 ${40 - r}L${59 + r * 1.7} 40L59 ${40 + r}L${59 - r * 1.7} 40Z" fill="${c}" fill-opacity="${o}" stroke="#161d2b" stroke-width="2"/>`;
  const t = (y, v, fs = 9, x = 59) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#ffffff" stroke="#161d2b" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${Math.round(v)}</text>`;
  return `<svg viewBox="0 0 118 80" width="118" height="80" role="img" aria-label="Kolony podle zón: centrum ${num(z.centrum, 1)} km, širší centrum ${num(z.sirsi, 1)} km, okraj ${num(z.okraj, 1)} km">${dia(33, SEV[2], 0.55)}${dia(21, SEV[3], 0.75)}${dia(10, SEV[4], 0.9)}${t(45, z.centrum, 13, 59)}${t(45, z.sirsi, 12, 34)}${t(45, z.okraj, 12, 13)}</svg>`;
}
const HELP = {
  cislo: 'Číslo 0–100 shrnuje, jak je Brno právě teď ucpané. Skládá se ze tří částí: silnice (váha 55 %), MHD (35 %) a parkování (10 %). Silnice: 100 bodů je 160 km kolon, vážné kolony se počítají 1,5×, dálnice napůl. MHD: 100 bodů je průměrné zpoždění všech vozů 8 minut. Parkování: kolik procent míst je obsazeno v parkovištích v centru (P+R a parkoviště mimo provoz se nepočítají). Číslo je průměr za posledních 15 minut a server ho počítá každých 5 minut. Slovo podle čísla: 0–19 volný provoz, 20–39 plynulý provoz, 40–59 hustý provoz, 60–79 zácpy, 80–100 Brno stojí.',
  namape: 'Zvýrazní na mapě všechny kolony, vozy MHD zpožděné 10 minut a víc, nebo parkovací domy. Mapa zešedne a vybraná místa blikají. Druhé klepnutí na stejné tlačítko zvýraznění vypne.',
  dnes: 'Dnes: číslo ucpanosti od půlnoci, jeden bod každých 5 minut. 2 dny: včerejšek a dnešek po čtvrthodinách. Týden: posledních sedm dní, za každou hodinu nejvyšší hodnota, víkend je o něco světlejší. Barevné pruhy v pozadí jsou stupně škály (zelená volný provoz až červená Brno stojí), čtvereček s popiskem je nejhorší chvíle zobrazeného období a žlutá svislá čára je teď. Mezera v čáře znamená, že tehdy chyběla data.',
  silnice: 'Kolony podle hlášení řidičů v aplikaci Waze (otevřená data města Brna), každý úsek jednou. Kosočtverec a čísla vedle ukazují kilometry kolon v centru (do 1,2 km od náměstí Svobody), v širším centru (do 3 km) a dál na okraji. Dálnice D1, D2 a další jsou zvlášť. „Stojí nebo se plazí“ jsou kolony nejvyššího stupně, kde auta skoro nejedou.',
  mista: 'Teď: ulice seřazené podle zdržení, tedy o kolik minut déle se jimi právě teď jede (součet všech kolon v ulici), a délka kolon. Dnes: pořadí podle zdržení sečteného za celý den, čas je chvíle, kdy byla kolona v ulici nejdelší. Klepnutí přesune mapu na místo a označí ho blikáním.',
  mhd: 'Polohy a zpoždění všech šalin, trolejbusů a autobusů MHD z dispečinku KORDIS. Čtverečky ukazují, jaká část vozů je 5 minut a víc pozadu (jeden čtvereček = 5 % vozů). Barva podle průměrného zpoždění: žlutá 1–4 minuty, oranžová 5–9, červená 10 a víc, stejně jako u vozů na mapě. Vpravo dvě linky s největším průměrným zpožděním a o kolik minut.',
  parking: 'Volná místa v parkovacích domech a na parkovištích Brněnských komunikací, jak je posílají do otevřených dat města. Teploměr ukazuje, jak je parkoviště plné: zelená, žlutá od 70 %, červená od 90 % nebo plno. Čárkovaně jsou parkoviště P+R u konečných. Šedý přeškrtnutý teploměr znamená, že je parkoviště mimo provoz. Číslo pod teploměrem jsou volná místa. Klepnutí přesune mapu na parkoviště.',
  hlaseni: 'Co řidiči nahlásili v aplikaci Waze za poslední hodinu: nehody, mlhu, nefunkční semafory a zavřené jízdní pruhy. Každé místo se počítá jednou, i když ho nahlásilo víc řidičů; u nehod se hlášení do 200 m a hodiny od sebe berou jako jedna nehoda a patří k ní i výjezd hasičů. Jsou to hlášení lidí, ne úřední údaje.',
};
const shortPark = n => String(n).replace(/^(Parkovací dům|Parkoviště|Parking|P\s*\+\s*R)\s+(u\s+)?/i, '').replace(/\s+(Park|u Zetoru)$/i, '').replace('Ústředního hřbitova', 'Hřbitov').replace('Janáčkova divadla', 'Janáček');

const delayCol = m => (m >= 15 ? SEV[4] : m >= 8 ? SEV[3] : m >= 3 ? SEV[2] : SEV[1]);
function histSvg(a, from, step, hours = 24) {
  const W = 300, H = 64, B = 13, T = 10, n = a.length, mx = Math.max(5, ...a.filter(v => v != null));
  const X = i => (i / n) * W, bw = Math.max(1, W / n), Y = v => T + (1 - v / mx) * (H - B - T);
  let bars = '', gaps = '', ticks = '';
  a.forEach((v, i) => {
    if (v == null) { gaps += `<rect x="${X(i).toFixed(1)}" y="${H - B - 2}" width="${bw.toFixed(2)}" height="2" fill="#5b6478" opacity=".5"/>`; return; }
    if (v > 0) bars += `<rect x="${X(i).toFixed(1)}" y="${Y(v).toFixed(1)}" width="${bw.toFixed(2)}" height="${(H - B - Y(v)).toFixed(1)}" fill="${delayCol(v)}"/>`;
  });
  for (let i = 0; i < n; i++) {
    const t = from + i * step, d = new Date(t), h = +d.toLocaleString('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', hourCycle: 'h23' }), m = d.getUTCMinutes();
    if (m === 0 && h % (hours > 24 ? 12 : 6) === 0) ticks += `<line x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${H - B}" y2="${H - B + 3}" stroke="#c9cfbf"/><text x="${X(i).toFixed(1)}" y="${H - 2}" text-anchor="middle">${h}:00</text>`;
  }
  return `<svg class="dop-hsvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Zdržení za posledních ${hours} hodin"><line x1="0" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="#5b6478"/>${gaps}${bars}${ticks}<text x="2" y="8">+${mx} min</text><text x="${W - 2}" y="8" text-anchor="end">teď</text></svg>`;
}
const dayOf = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
const dayWord = ms => { const d = Math.round((Date.parse(dayOf(Date.now())) - Date.parse(dayOf(ms))) / 864e5); return d === 1 ? 'včera ' : d === 2 ? 'předevčírem ' : ''; };
function courseHtml(HS, st, where = 'na místě', hours = 24) {
  const a = HS && HS.s && HS.s[st];
  if (!a) return '';
  const known = a.filter(v => v != null), mx = Math.max(0, ...known), at = a.indexOf(mx), jam = known.filter(v => v > 0).length;
  return `<div class="dop-hist">${histSvg(a, HS.from, HS.step, hours)}<p class="mut">Zdržení ${where} za posledních ${hours} hodin, po 5 minutách${known.length ? `: kolona ${num((jam * HS.step) / 3600e3, 1)} h, nejhůř +${mx} min ${hours > 24 ? dayWord(HS.from + at * HS.step) : ''}v ${esc(hm(HS.from + at * HS.step))}` : ''}${known.length < a.length * 0.9 ? ' (server měří teprve od ' + (hours > 24 ? dayWord(HS.from + a.findIndex(v => v != null) * HS.step) : '') + esc(hm(HS.from + a.findIndex(v => v != null) * HS.step)) + ')' : ''}.</p></div>`;
}
export function createDoprava({ base = './', llToImg = null, inMap = () => true, onPlace = () => {}, onFocus = () => {}, focusOn = () => null, parking = true, cisteni = null } = {}) {
  let span = 'dnes'; try { span = localStorage.getItem('b2k-dop-span') || 'dnes'; } catch { /* no storage */ } // (the chart: dnes, 2dny, tyden)
  let D = null, loading = null, wanted = 0, rank = 'now', inFlight = null, openSt = null; // (openSt: the place whose course is shown)
  const openHelp = new Set(); // (the explanations open: kept when a new file redraws the overview)
  const subs = [];
  const urls = () => [DATA_BASE ? `${DATA_BASE}/data/doprava.json?m=${Math.floor(Date.now() / 60e3)}` : '', `${base}data/doprava.json`].filter(Boolean);
  // (one request at a time, each at most 15 s: a hanging connection must not pile up a request every minute)
  function fetchNow() { return (inFlight ||= fetchOnce().finally(() => { inFlight = null; })); }
  async function fetchOnce() {
    for (const u of urls()) {
      try {
        const r = await fetch(u, { cache: 'no-cache', signal: AbortSignal.timeout(15e3) });
        if (!r.ok) continue;
        const d = await r.json();
        if (!d || d.v !== 1) continue;
        if (!D || d.t >= D.t) { D = d; for (const f of subs) { try { f(D); } catch { /* one listener must not stop the others */ } } }
        return D;
      } catch { /* the next address */ }
    }
    return D;
  }
  function load() {
    wanted = Date.now();
    if (!loading) {
      loading = fetchNow();
      setInterval(() => { if (!document.hidden && (!D || Date.now() - D.t > 6.5 * 60e3)) fetchNow(); }, POLL_MS);
      document.addEventListener('visibilitychange', () => { if (!document.hidden && (!D || Date.now() - D.t > 6.5 * 60e3)) fetchNow(); });
    }
    return loading;
  }
  const stale = () => !D || (!SAMPLE && Date.now() - Date.parse(D.updated) > STALE_MIN * 60e3);
  const value = () => (stale() ? null : D.idx);

  function paintTile(btn) {
    const v = value();
    btn.querySelector('.i').innerHTML = gauge(v);
    btn.querySelector('.sp').innerHTML = D && !stale() ? spark(D) : '';
    const n = btn.querySelector('.n');
    n.textContent = v == null ? '–' : String(v);
    n.style.background = sevCol(v);
    btn.title = v == null ? 'Doprava v Brně: údaje se teď neobnovují' : `Doprava v Brně: ucpanost ${v} ze 100, ${D.word.toLowerCase()}${D.peak ? `; dnes nejhůř v ${D.peak.at}` : ''}`;
    btn.setAttribute('aria-label', btn.title);
  }

  // the small indicator of a phone with the controls hidden (index.html #mhD): the gauge, the number in its colour and
  // the word; without fresh data it is not shown
  function paintMini(btn) {
    const v = value();
    btn.hidden = v == null;
    if (v == null) return;
    btn.querySelector('.i').innerHTML = gauge(v);
    const n = btn.querySelector('.n');
    n.textContent = String(v); n.style.color = sevCol(v);
    btn.querySelector('.w').textContent = D.word.toLowerCase();
    btn.title = `Doprava v Brně: ucpanost ${v} ze 100, ${D.word.toLowerCase()}`;
    btn.setAttribute('aria-label', btn.title);
  }

  function render(body) {
    if (!D) { body.innerHTML = '<p class="dop-none">Načítám údaje o dopravě…</p>'; return; }
    if (stale()) { body.innerHTML = `<p class="dop-none">Údaje o dopravě se teď neobnovují (poslední ${esc(hm(Date.parse(D.updated)))}). Zkuste to za chvíli.</p>`; return; }
    const v = D.idx, p = D.parts || {}, ok = D.ok || {};
    const noData = '<p class="dop-nd">Bez dat: zdroj teď neodpovídá.</p>';
    const part = (k, label) => `<div><small>${label}</small><b style="color:${sevCol(p[k])}">${p[k] ?? '–'}</b></div>`;
    // (short: the label used when the whole one does not fit the button, e.g. on a phone)
    const fbtn = (k, g, label, title, short = '') => `<button type="button" data-focus="${k}" aria-pressed="${focusOn() === k}" title="${title}"${short ? ` data-short="${short}"` : ''}>${glyph(g, 'currentColor', 15, 10)}<span>${label}</span></button>`;
    const q = k => `<button type="button" class="dop-q" data-q="${k}" aria-expanded="${openHelp.has(k)}" aria-controls="dop-help-${k}" title="Co to znamená?" aria-label="Co to znamená?">?</button>`;
    const helpP = k => `<p class="dop-help" id="dop-help-${k}" data-help="${k}"${openHelp.has(k) ? '' : ' hidden'}>${HELP[k]}</p>`;
    let h = `<div class="dop-hero">${dial(v)}<div class="dop-verdict"><div class="dop-big"><b style="color:${sevCol(v)}">${v ?? '–'}</b><span>${esc(D.word)}</span>${q('cislo')}</div><p>${esc(D.text)}</p></div></div>`;
    h += `<div class="dop-subs">${part('silnice', 'Silnice')}${part('mhd', 'MHD')}${part('park', 'Parkování')}</div>${helpP('cislo')}`;
    h += `<div class="dop-onmap" role="group" aria-label="Zvýraznit na mapě"><span>Na mapě ${q('namape')}</span>${fbtn('kolony', 'car', 'Kolony', 'Zvýraznit v mapě všechny kolony')}${fbtn('zpozdene', 'bus', 'Zpožděné 10+', 'Zvýraznit v mapě vozy MHD zpožděné 10 minut a víc')}${parking ? fbtn('parking', 'p', 'Parkovací domy', 'Zvýraznit v mapě parkovací domy a parkoviště', 'Park. domy') : ''}</div>${helpP('namape')}`;
    // the day
    // (the switch only when the file has the week: an older file draws today only)
    const wk = D.week && Array.isArray(D.week.days) && D.week.days.length >= 2, sp = wk ? span : 'dnes';
    const sbtn = (k, label) => `<button type="button" data-span="${k}" aria-pressed="${sp === k}">${label}</button>`;
    if (D.day && Array.isArray(D.day.idx)) h += `<section class="dop-b"><div class="dop-bh"><h3>${sp === 'dnes' ? 'Dnes' : sp === '2dny' ? 'Včera a dnes' : 'Týden'}${q('dnes')}</h3>${wk ? `<span class="dop-seg" role="group" aria-label="Období grafu">${sbtn('dnes', 'dnes')}${sbtn('2dny', '2 dny')}${sbtn('tyden', 'týden')}</span>` : '<span>ucpanost po 5 minutách</span>'}</div>${helpP('dnes')}${sp === 'dnes' ? dayChart(D) : daysChart(D, sp === '2dny' ? 2 : 7)}</section>`;
    // the roads
    const S = D.silnice;
    h += `<section class="dop-b"><div class="dop-bh"><h3>${glyph('car')}Silnice${q('silnice')}</h3><span>${S ? `${num(S.km, 1)} km · ${S.n} ${S.n === 1 ? 'kolona' : S.n < 5 ? 'kolony' : 'kolon'}` : ''}</span></div>${helpP('silnice')}`;
    h += S ? `<div class="dop-roads">${zonesSvg(S.zones)}<div class="dop-zones"><div><span style="color:${SEV[4]}">■ centrum</span><b>${num(S.zones.centrum, 1)} km</b></div><div><span style="color:${SEV[3]}">■ širší centrum</span><b>${num(S.zones.sirsi, 1)} km</b></div><div><span style="color:${SEV[2]}">■ okraj</span><b>${num(S.zones.okraj, 1)} km</b></div><div><span class="mut">D1, D2 a další dálnice</span><b>${num(S.zones.dalnice, 1)} km</b></div><div class="mut">stojí nebo se plazí ${num(S.heavy, 1)} km</div></div></div>` : noData;
    h += '</section>';
    // the worst places
    const list = ((D.top || {})[rank === 'now' ? 'now' : 'day']) || [];
    const max = Math.max(1, ...list.map(o => (rank === 'now' ? o.min : o.score)));
    h += `<section class="dop-b"><div class="dop-bh"><h3>Nejucpanější místa${q('mista')}</h3><span class="dop-seg" role="group" aria-label="Období"><button type="button" data-rank="now" aria-pressed="${rank === 'now'}">teď</button><button type="button" data-rank="day" aria-pressed="${rank === 'day'}">dnes</button></span></div>${helpP('mista')}`;
    const HS = (D.top || {}).hist;
    // (a row clicked: the map goes to the place, and under the row its course over the last 24 hours; clicked again it closes)
    const course = o => courseHtml(HS, o.s) || '<div class="dop-hist"><p class="mut">Průběh za 24 hodin pro tohle místo zatím není.</p></div>';
    h += list.length ? `<ol class="dop-rank">${list.map((o, i) => `<li${openSt === o.s ? ' class="open"' : ''}><button type="button" data-lon="${o.lon}" data-lat="${o.lat}" data-st="${esc(o.s)}" aria-expanded="${openSt === o.s}" title="Ukázat ${esc(o.s)} na mapě a průběh za 24 hodin"><span class="n">${i + 1}</span><span class="st">${esc(/^\d+$/.test(o.s) ? `silnice ${o.s}` : o.s)}<small>${ZONE[o.z] || ''}</small></span><span class="v">${rank === 'now' ? `+${o.min} min · ${num(o.km, 1)} km` : `nejvíc v ${esc(o.at)}`}</span><span class="bar" style="--w:${Math.round(((rank === 'now' ? o.min : o.score) / max) * 100)}%;--c:${rank === 'now' ? SEV[4] : SEV[3]}"></span></button>${openSt === o.s ? course(o) : ''}</li>`).join('')}</ol>` : `<p class="dop-nd">${ok.jams === false ? 'Bez dat: zdroj teď neodpovídá.' : 'Žádné kolony.'}</p>`;
    h += '</section>';
    // public transport
    const M = D.mhd;
    h += `<section class="dop-b"><div class="dop-bh"><h3>${glyph('tram')}MHD${q('mhd')}</h3><span>${M ? `${M.n} vozů · ⌀ +${num(M.avg, 1)} min · ■ = 5 % vozů ≥ 5 min pozadu` : ''}</span></div>${helpP('mhd')}`;
    if (M) {
      h += '<div class="dop-mhd">';
      for (const t of ['tram', 'trol', 'bus']) {
        const x = M.types[t];
        if (!x) continue;
        // (the share 5+ minutes late; an older file without late5 counts from 3 minutes; the colour of the average delay)
        const late = x.late5 ?? x.late3, k = Math.round((late / x.n) * 20), col = delayColor(Math.max(1, x.avg));
        h += `<div class="dop-mrow">${glyph(t, 'currentColor', 22, 15)}<span class="nm">${TYPE[t]}<small>${x.n} · +${num(x.avg, 1)} min</small></span><span class="dots" title="${Math.round((late / x.n) * 100)} % vozů se zpožděním ${x.late5 != null ? 5 : 3} minut a víc">${Array.from({ length: 20 }, (_, i) => `<i${i < k ? ` style="background:${col}"` : ''}></i>`).join('')}</span><span class="lines">${(x.worst || []).map(([l, d]) => `<span class="ln" title="linka ${esc(l)}: v průměru +${num(d, 1)} min">${esc(l)}<small style="color:${delayColor(d) === '#f3c868' ? '#9a7a10' : delayColor(d)}">+${Math.round(d)}</small></span>`).join('')}</span></div>`;
      }
      h += `</div>${M.late10 ? `<p class="mut dop-small">${M.late10} ${M.late10 === 1 ? 'vůz má' : M.late10 < 5 ? 'vozy mají' : 'vozů má'} zpoždění 10 minut a víc.</p>` : ''}`;
    } else h += noData;
    h += '</section>';
    // car parks
    if (parking) {
      const P = D.park;
      h += `<section class="dop-b"><div class="dop-bh"><h3>${glyph('p', '#2b62c4')}Parkovací domy, P+R${q('parking')}</h3><span>${p.park != null ? `centrum ${p.park} % obsazeno` : ''}</span></div>${helpP('parking')}`;
      h += P ? `<div class="dop-parks">${P.map(o => { const full = 1 - o.free / o.cap;
        // (closed for now, `out` of data/parking.json: the city reports it as full; a crossed-out grey gauge instead)
        if (o.out) return `<button type="button" class="park out"${o.lon != null ? ` data-lon="${o.lon}" data-lat="${o.lat}" data-park="1"` : ''} title="${esc(o.n)}: mimo provoz" aria-label="${esc(o.n)}: mimo provoz"><span class="th"></span><b aria-hidden="true">&nbsp;</b>${esc(shortPark(o.n))}</button>`;
        return `<button type="button" class="park${o.pr ? ' pr' : ''}"${o.lon != null ? ` data-lon="${o.lon}" data-lat="${o.lat}" data-park="1"` : ''} title="${esc(o.n)}: ${o.free} volných z ${o.cap}"><span class="th" style="--h:${Math.round(full * 100)}%;--c:${o.free === 0 || full >= 0.9 ? SEV[4] : full >= 0.7 ? SEV[2] : SEV[0]}"></span><b>${o.free === 0 ? 'plno' : o.free}</b>${esc(shortPark(o.n))}</button>`; }).join('')}</div>` : noData;
      h += '</section>';
    }
    // reports of the drivers
    // block cleaning of the streets (src/cisteni.js, only where its part is public): today and tomorrow, with a button that lights the sections up
    const C = cisteni ? cisteni() : null;
    if (C && C.total && (C.today || C.tomorrow)) {
      const n = k => `${k} ${k === 1 ? 'úsek' : k >= 2 && k <= 4 ? 'úseky' : 'úseků'}`, where = l => (l.length && l.length <= 5 ? ` (${l.map(esc).join(', ')})` : '');
      h += `<section class="dop-b"><div class="dop-bh"><h3>Blokové čištění</h3><span>auta se odtahují</span></div><p class="dop-clean">${C.today ? `Dnes ${n(C.today)}${where(C.todayParts)}${C.now ? `, v ${C.now} se právě čistí` : C.left ? '' : ', už hotovo'}. ` : 'Dnes se nečistí. '}${C.tomorrow ? `Zítra ${n(C.tomorrow)}${where(C.tomorrowParts)}.` : 'Zítra se nečistí.'}</p><div class="dop-onmap"><button type="button" data-focus="clean" aria-pressed="${focusOn() === 'clean'}" title="Zvýraznit v mapě úseky, které se čistí dnes a zítra"><span>Ukázat v mapě</span></button></div></section>`;
    }
    const A = D.alerts;
    if (A) h += `<section class="dop-b"><div class="dop-bh"><h3>Za poslední hodinu${q('hlaseni')}</h3><span>hlášení řidičů (Waze)</span></div>${helpP('hlaseni')}<div class="dop-extra"><div><b>${A.nehody}</b>${A.nehody === 1 ? 'nehoda' : A.nehody > 1 && A.nehody < 5 ? 'nehody' : 'nehod'}</div><div><b${A.mlha >= 5 ? ' style="color:#f3c868"' : ''}>${A.mlha}</b>× mlha</div><div><b>${A.semafory}</b>semaforů mimo provoz</div><div><b>${A.pruhy}</b>zavřených pruhů</div></div>${A.dnes != null ? `<p class="dop-clean">Dnes ${A.dnes} ${A.dnes === 1 ? 'nehoda' : A.dnes > 1 && A.dnes < 5 ? 'nehody' : 'nehod'}${A.dalnice ? `, z toho ${A.dalnice} na dálnici` : ''}${A.hasici ? `, hasiči vyjeli k ${A.hasici}` : ''}. Nehoda = hlášení řidičů do 200 m a hodiny od sebe.</p>` : ''}</section>`;
    h += `<p class="dop-foot"><span>Aktualizace ${esc(hm(Date.parse(D.updated)))} · další za 5 min</span><span>Waze · KORDIS · BKOM</span></p>`;
    body.innerHTML = h;
    // a label that does not fit its button gets its short form (Parkovací domy -> Park. domy)
    body.querySelectorAll('[data-short]').forEach(b => { if (b.scrollWidth > b.clientWidth + 1) b.querySelector('span').textContent = b.dataset.short; });
    body.querySelectorAll('[data-q]').forEach(b => (b.onclick = () => {
      const k = b.dataset.q, on = !openHelp.has(k);
      if (on) openHelp.add(k); else openHelp.delete(k);
      const p2 = body.querySelector(`[data-help="${k}"]`);
      if (p2) p2.hidden = !on;
      b.setAttribute('aria-expanded', String(on));
    }));
    body.querySelectorAll('[data-rank]').forEach(b => (b.onclick = () => { rank = b.dataset.rank; render(body); }));
    body.querySelectorAll('[data-span]').forEach(b => (b.onclick = () => { span = b.dataset.span; try { localStorage.setItem('b2k-dop-span', span); } catch { /* no storage */ } render(body); }));
    body.querySelectorAll('[data-lon]').forEach(b => (b.onclick = () => {
      if (b.dataset.st != null) { const st = b.dataset.st; const was = openSt === st; openSt = was ? null : st; render(body); if (was) return; }
      onPlace(+b.dataset.lon, +b.dataset.lat, !!b.dataset.park);
    }));
    body.querySelectorAll('[data-focus]').forEach(b => (b.onclick = () => onFocus(b.dataset.focus)));
  }

  let latePos = { t: -1, pts: [] };
  function latePts() {
    if (!D || stale() || !llToImg || !Array.isArray(D.late)) return [];
    if (latePos.t !== D.t) latePos = { t: D.t, pts: D.late.filter(([, , , lon, lat]) => inMap(lon, lat)).map(([, , delay, lon, lat]) => { const [X, Y] = llToImg(lon, lat); return { X, Y, delay }; }) }; // (a bus beyond the edge of the map would hang in the sky)
    return latePos.pts;
  }
  let ST = null, stFlight = null;
  async function streets() {
    if (ST && D && ST.t >= D.t) return ST;
    return (stFlight ||= (async () => {
      for (const u of [DATA_BASE ? `${DATA_BASE}/data/doprava-ulice.json?m=${Math.floor(Date.now() / 60e3)}` : '', `${base}data/doprava-ulice.json`].filter(Boolean)) {
        try {
          const r = await fetch(u, { cache: 'no-cache', signal: AbortSignal.timeout(15e3) });
          if (!r.ok) continue;
          const d = await r.json();
          if (d && d.v === 1 && d.s && (!ST || d.t >= ST.t)) ST = d;
          if (ST) break;
        } catch { /* the next address */ }
      }
      return ST;
    })().finally(() => { stFlight = null; }));
  }
  async function course(st) {
    if (!D || stale()) return null;
    const S = await streets();
    if (S && Date.now() - S.t < (STALE_MIN + 5) * 60e3 && S.s[st]) {
      const a = Array(S.n).fill(null), p = S.s[st];
      for (const [i0, i1] of S.rec || []) for (let i = i0; i <= i1 && i < S.n; i++) a[i] = 0;
      for (let k = 0; k < p.length; k += 2) if (p[k] >= 0 && p[k] < S.n) a[p[k]] = p[k + 1];
      const hours = Math.round((S.n * S.step) / 3600e3);
      return { html: courseHtml({ from: S.from, step: S.step, s: { [st]: a } }, st, 'v celé ulici', hours), hours };
    }
    const html = D && !stale() ? courseHtml((D.top || {}).hist, st, 'v celé ulici') : '';
    return html ? { html, hours: 24 } : null;
  }
  return { load, render, paintTile, paintMini, course, latePts, onUpdate: f => subs.push(f), data: () => D, value, jamPts: () => (D && !stale() ? D.jamPts || [] : []), wanted: () => wanted };
}

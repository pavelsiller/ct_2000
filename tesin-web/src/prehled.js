import { DATA_BASE, SAMPLE } from './feed.js';
import { KINDS as HZ } from './hasici.js';
import { KINDS as PO, caseText } from './policie.js';
import { track } from './stats.js';

const PERIOD = 60e3, WEEK_MS = 300e3;
const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
// the lines of a water outage that name a place (a bare "pod" from the source names nothing, audit 2026-11-15)
const usefulWhere = o => (o.where || []).filter(l => /\p{Lu}/u.test(l) && l.replace(/[^\p{L}]/gu, '').length >= 4);
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
const PRAGUE_DAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' });
const DAY = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' });
const TIME = new Intl.DateTimeFormat('cs-CZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Prague' });
const CLOCK = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Prague' });
const dayKey = t => PRAGUE_DAY.format(new Date(t));
const when = t => { const d = new Date(t), k = dayKey(t), today = dayKey(Date.now()), yest = dayKey(Date.now() - 864e5); return `${k === today ? 'dnes' : k === yest ? 'včera' : DAY.format(d)} ${TIME.format(d)}`; };
const since = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60e3)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const mapLink = (lat, lon, mpp = 0.5) => `./#@${(+lat).toFixed(5)},${(+lon).toFixed(5)},${mpp}`;
// one thing with its card in the map (src/main.js openEventLink): the kinds the map can open a card of
const CARD_KINDS = new Set(['hasici', 'voda', 'vyluka', 'uzavirka', 'vykop', 'ovzdusi', 'parkovani', 'vlaky']);
const NO_ID = new Set(['ovzdusi', 'parkovani']); // (the map opens the station or the car park nearest to the place)
const itemLink = (kind, id, lat, lon) => (CARD_KINDS.has(kind) && (id != null || NO_ID.has(kind)) ? `./#udalost/${kind}/${encodeURIComponent(id ?? '-')}${lat != null ? `@${(+lat).toFixed(5)},${(+lon).toFixed(5)}` : ''}` : mapLink(lat, lon));
const HZ_WORDS = { pozar: ['požár', 'požáry', 'požárů'], nehoda: ['dopravní nehoda', 'dopravní nehody', 'dopravních nehod'], unik: ['únik látek', 'úniky látek', 'úniků látek'], pomoc: ['technická pomoc', 'technické pomoci', 'technických pomocí'], zachrana: ['záchrana', 'záchrany', 'záchran'], jine: ['jiná událost', 'jiné události', 'jiných událostí'] };
// the picture (12 × 12 pixels) and the colour of each source of the news: the same as SRC in src/zpravy.js (copied, so
// this page does not load the board of the map with its styles)
const SRC = {
  hasici: ['#ff7a5c', 'M5 0h2v2H5zM4 2h4v2H4zM3 4h7v5H3zM2 6h1v3H2zM4 9h5v2H4z'],
  kolony: ['#f5a04a', 'M3 2h6v1H3zM2 3h8v3H2zM1 6h10v3H1zM2 9h2v2H2zM8 9h2v2H8z'],
  nehody: ['#f08a3c', 'M5 0h2v2H5zM4 2h4v2H4zM3 4h6v2H3zM2 6h8v2H2zM1 8h10v3H1z'],
  doprava: ['#f5a04a', 'M3 2h6v1H3zM2 3h8v3H2zM1 6h10v3H1zM2 9h2v2H2zM8 9h2v2H8z'],
  mhd: ['#93c96a', 'M5 0h2v1H5zM2 1h8v1H2zM2 2h1v7H2zM9 2h1v7H9zM3 5h6v4H3zM3 9h2v2H3zM7 9h2v2H7z'],
  cisteni: ['#6cc4ff', 'M8 0h2v2H8zM7 2h2v2H7zM6 4h2v2H6zM2 6h7v2H2zM1 8h8v1H1zM1 9h1v3H1zM3 9h1v3H3zM5 9h1v3H5zM7 9h1v3H7z'],
  akce: ['#f0a8d8', 'M1 2h10v2H1zM1 4h1v7H1zM10 4h1v7h-1zM1 10h10v1H1zM3 0h1v3H3zM8 0h1v3H8zM4 6h4v3H4z'],
  paro: ['#f3c868', 'M0 6h2v2H0zM2 8h2v2H2zM4 6h2v2H4zM6 4h2v2H6zM8 2h2v2H8zM10 0h2v2h-2z'],
  uzavirky: ['#e8736a', 'M1 3h10v5H1zM3 8h1v4H3zM8 8h1v4H8z'],
  voda: ['#5aa8ff', 'M5 0h2v2H5zM4 2h4v2H4zM3 4h6v2H3zM2 6h8v3H2zM3 9h6v1H3zM4 10h4v1H4z'],
  pocasi: ['#b9d4e6', 'M4 1h4v1H4zM3 2h6v1H3zM1 3h10v4H1zM2 8h1v2H2zM5 8h1v2H5zM8 8h1v2H8z'],
  ovzdusi: ['#d8e36a', 'M2 1h3v3H2zM7 2h3v3H7zM4 6h4v4H4zM9 8h2v2H9zM0 7h2v2H0z'],
  parkovani: ['#7fa8ff', 'M3 1h5v1H3zM3 2h2v9H3zM8 2h2v4H8zM5 6h4v1H5z'],
  vlaky: ['#a9c4ff', 'M3 1h6v1H3zM2 2h8v1H2zM2 3h1v2H2zM5 3h2v2H5zM9 3h1v2H9zM2 5h8v3H2zM2 8h1v1H2zM4 8h4v1H4zM9 8h1v1H9zM2 9h8v1H2zM3 10h2v1H3zM7 10h2v1H7z'],
};
const OTHER = ['#adb6c6', 'M5 2h2v5H5zM5 9h2v2H5z'];
const SVGNS = 'http://www.w3.org/2000/svg';
function icon(src, off) {
  const [col, d] = SRC[src] || OTHER, s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('class', off ? 'zi off' : 'zi'); if (!off) s.style.setProperty('--zc', col); // (--zc: the colour of the picture alone, when the dashboard in a long run draws the icons without their squares)
  s.setAttribute('viewBox', '-2 -2 16 16'); s.setAttribute('shape-rendering', 'crispEdges'); s.setAttribute('aria-hidden', 'true');
  const r = document.createElementNS(SVGNS, 'rect'); r.setAttribute('x', -2); r.setAttribute('y', -2); r.setAttribute('width', 16); r.setAttribute('height', 16); r.setAttribute('fill', off ? '#384563' : col);
  const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', off ? '#adb6c6' : '#141a26');
  s.append(r, p); return s;
}

async function get(file, slotMs = 60e3) {
  const urls = [DATA_BASE ? `${DATA_BASE}/data/${file}?m=${Math.floor(Date.now() / slotMs)}` : '', `./data/${file}`].filter(Boolean);
  for (const u of urls) {
    try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) return await r.json(); } catch { /* the next address */ }
  }
  return null;
}

// ---- a tile of "Právě teď": its source and caption, a big number, a word, a line under it, a few items, a link
const lastN = new Map(); // (the number each tile showed before: a changed one pops)
function tile({ key, src, cap, n, unit, label, sub, lines = [], href, more = 'V mapě ›', tone = '', live = false, extra }) {
  const t = el('article', `tile ${tone}`), c = el('div', 'cap');
  c.append(icon(src), el('span', '', cap));
  if (live) c.append(el('span', 'lv'));
  const num = el('div', 'n', n); if (unit) num.append(el('small', '', unit));
  t.append(c, num, el('div', 'l', label));
  if (lastN.has(key) && lastN.get(key) !== n) t.classList.add('chg');
  lastN.set(key, n);
  if (sub) t.append(el('p', 'sub', sub));
  if (extra) t.append(extra);
  if (lines.length) { const ul = el('ul'); for (const l of lines) { const li = el('li'); if (l.href) { const a = el('a', '', l.text); a.href = l.href; li.append(a); } else li.textContent = l.text; li.title = l.text; ul.append(li); } t.append(ul); }
  if (href) { const a = el('a', 'more', more); a.href = href; t.append(a); }
  return t;
}
// the course of the traffic index today: a line over the whole day, midnight to midnight, with the rush hours marked
function spark(day) {
  const v = (day && day.idx) || [];
  if (v.length < 3) return null;
  const N = 288, W = 288, H = 36, top = Math.max(40, ...v.filter(Number.isFinite)); // (a 5-minute step; the scale goes at least to 40, so a quiet day stays low)
  const pts = []; v.forEach((x, i) => { if (Number.isFinite(x)) pts.push([i, H - 1 - (x / top) * (H - 4)]); });
  if (pts.length < 3) return null;
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('class', 'spark'); s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('aria-hidden', 'true');
  const line = pts.map(([x, y]) => `${(x * W / N).toFixed(1)},${y.toFixed(1)}`).join(' ');
  const mk = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  for (const h of [6, 12, 18]) s.append(mk('line', { class: 'gd', x1: h * 12, x2: h * 12, y1: 0, y2: H }));
  s.append(mk('polygon', { class: 'ar', points: `${(pts[0][0] * W / N).toFixed(1)},${H} ${line} ${(pts.at(-1)[0] * W / N).toFixed(1)},${H}` }), mk('polyline', { class: 'ln', points: line }));
  const wrap = el('div', 'spark-w'); wrap.append(s);
  const lab = el('div', 'spark-l'); for (const h of ['0', '6', '12', '18', '24 h']) lab.append(el('span', '', h));
  wrap.append(lab);
  return wrap;
}
// a bar chart of a few values: [[label, value, colour, address of the label, share of the full width]]
function bars(rows, { unit = '', cls = '' } = {}) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  const ul = el('ul', `bars ${cls}`.trim());
  for (const [label, v, col, href, share] of rows) {
    const li = el('li'), b = el('span', 'bar'), bl = el('span', 'bl'), bw = el('span', 'bw');
    if (href) { const a = el('a', '', label); a.href = href; bl.append(a); } else bl.textContent = label;
    bl.title = label;
    b.style.width = `${Math.max(2, (share != null ? share : v / max) * 100)}%`; if (col) b.style.background = col;
    bw.append(b);
    li.append(bl, bw, el('span', 'bv', `${v}${unit}`));
    ul.append(li);
  }
  return ul;
}
const source = text => el('p', 'src', text);

// ---- the running headline: the lines of the board of the map (zpravy.json run), twice in a row, so the crawl loops
let tickerKey = '';
function renderTicker(Z) {
  const run = (Z && Z.run) || [], key = run.join('\n');
  if (key === tickerKey) return; // (the same lines: the crawl goes on without a jump)
  tickerKey = key;
  $('ticker').hidden = !run.length;
  if (!run.length) return;
  const one = () => run.map(t => { const s = el('span'); const m = /^NOVÉ · /.exec(t); if (m) { s.append(el('b', 'nw', 'NOVÉ'), ` ${t.slice(m[0].length)}`); } else s.textContent = t; return s; });
  const box = $('ticker-in');
  box.replaceChildren(...one(), ...one());
  box.style.setProperty('--dur', `${Math.max(25, Math.round(key.length / 7))}s`); // (about 7 letters a second, whatever the length)
}

// ---- Právě teď
function renderNow({ Z, DOP, H, V }) {
  const tiles = [];
  {
    const run = H ? (H.items || []).filter(o => o.open) : [];
    tiles.push(tile({
      key: 'hasici', src: 'hasici', cap: 'Hasiči', n: H ? String(run.length) : '–', live: run.length > 0,
      label: !H ? 'data teď nejdou načíst' : run.length === 1 ? 'zásah právě probíhá' : run.length >= 2 && run.length <= 4 ? 'zásahy právě probíhají' : 'zásahů právě probíhá',
      sub: H ? `Za 12 hodin ${plural((H.items || []).length, 'výjezd', 'výjezdy', 'výjezdů')}.` : '', tone: run.length ? 'hot' : '',
      // (nothing running: the last ones of the 12 hours instead, so the tile tells what happened)
      lines: run.length ? run.slice(0, 4).map(o => ({ text: `${o.typ}${o.sub ? ` (${o.sub})` : ''} · ${[o.street, o.part].filter(Boolean).join(', ') || o.obec} · ${since(o.t)}`, href: itemLink('hasici', o.id, o.lat, o.lon) }))
        : ((H && H.items) || []).slice().sort((a, b) => b.t - a.t).slice(0, 3).map(o => ({ text: `${TIME.format(new Date(o.t))} ${o.typ} · ${[o.street, o.part].filter(Boolean).join(', ') || o.obec}`, href: itemLink('hasici', o.id, o.lat, o.lon) })),
      href: './#tema/hasici',
    }));
  }
  {
    const now = Date.now(), items = (V && V.items) || [];
    const hav = items.filter(o => o.kind === 'havarie' && !o.gone), off = items.filter(o => o.kind === 'odstavka' && !o.gone && o.from <= now && (!o.to || now <= o.to));
    const place = o => usefulWhere(o).map(w => w.split(',')[0]).slice(0, 2).join(', ') || (o.n ? plural(o.n, 'adresa', 'adresy', 'adres') : o.obec);
    tiles.push(tile({
      key: 'voda', src: 'voda', cap: 'Voda', n: V ? String(hav.length + off.length) : '–', tone: hav.length ? 'hot' : '', live: hav.length > 0,
      label: !V ? 'data teď nejdou načíst' : hav.length ? 'havárie a odstávky teď' : 'odstávek vody teď',
      sub: !V ? '' : hav.length ? plural(hav.length, 'havárie vodovodu', 'havárie vodovodu', 'havárií vodovodu') : 'Žádná havárie vodovodu.',
      href: './#tema/voda',
      // (nothing now: the next planned shut-offs)
      lines: hav.length + off.length ? [...hav, ...off].slice(0, 4).map(o => ({ text: `${o.kind === 'havarie' ? 'Havárie' : 'Bez vody'}: ${place(o)}${o.n ? ` · ${plural(o.n, 'adresa', 'adresy', 'adres')}` : ''}`, href: itemLink('voda', o.id, o.lat, o.lon) }))
        : items.filter(o => o.kind === 'odstavka' && !o.gone && o.from > now).sort((a, b) => a.from - b.from).slice(0, 3).map(o => ({ text: `Odstávka ${when(o.from)} · ${place(o)}`, href: itemLink('voda', o.id, o.lat, o.lon) })),
    }));
  }
  if (DOP && Number.isFinite(DOP.idx)) {
    const d = DOP.day || {}, km = (d.km || []).at(-1);
    tiles.push(tile({
      key: 'doprava', src: 'doprava', cap: 'Doprava', n: `${DOP.idx}`, unit: '/100', label: DOP.word || 'doprava', tone: DOP.idx >= 40 ? 'hot' : '',
      sub: [km != null ? `Kolony ${String(km).replace('.', ',')} km.` : '', DOP.text || ''].filter(Boolean).join(' '),
      extra: spark(d), href: './',
    }));
  } else tiles.push(tile({ key: 'doprava', src: 'doprava', cap: 'Doprava', n: '–', label: 'data teď nejdou načíst' }));
  {
    const live = Z ? (Z.msgs || []).filter(m => m.tier === 'now' && m.st !== 'end' && !m.quiet && m.src !== 'hasici' && m.src !== 'voda') : [];
    tiles.push(tile({
      key: 'dalsi', src: 'other', cap: 'Další', n: Z ? String(live.length) : '–', label: !Z ? 'zprávy teď nejdou načíst' : live.length === 1 ? 'další věc právě teď' : live.length >= 2 && live.length <= 4 ? 'další věci právě teď' : 'dalších věcí právě teď',
      sub: live.length ? '' : 'Kolony, zpoždění MHD, výstrahy, ovzduší, plná parkoviště.',
      lines: live.slice(0, 4).map(m => ({ text: m.title, href: m.at ? itemLink(m.ref && m.ref.kind, m.ref && m.ref.id, m.at[1], m.at[0]) : null })),
    }));
  }
  $('tiles').replaceChildren(...tiles);
}

// ---- the news by tier, as the board of the map has them; what was not there at the last refresh flashes once
const seen = new Set(); let firstNews = true;
const SHOW = 14;
function renderNews(Z) {
  for (const [tier, none] of [['now', 'Teď se nic mimořádného neděje.'], ['today', 'Na dnešek nic zvláštního.'], ['past', 'Dnes zatím nic neskončilo.'], ['week', 'Nic v nejbližších dnech.']]) {
    const all = Z ? (Z.msgs || []).filter(m => m.tier === tier && (tier !== 'now' || m.st !== 'end')) : [];
    // (quiet: worth a look but not counted, e.g. zhoršené ovzduší, common in winter; the same as the counter on the
    // board of the map. Listed last, under the line "Také")
    const l = all.filter(m => !m.quiet), quiet = all.filter(m => m.quiet);
    $(`c-${tier}`).textContent = Z ? String(l.length) : '';
    const head = document.querySelector(`.col[data-t="${tier}"] h3`);
    if (head) { head.querySelector('b')?.remove(); head.append(el('b', '', Z ? String(l.length) : '')); }
    const lis = [...l.slice(0, SHOW), ...quiet].map(m => {
      const li = el('li', m.st === 'end' ? 'ended' : m.quiet ? 'quiet' : ''), top = el('div', 'top'), tt = el('div', 'tt');
      if (m.st === 'new') tt.append(el('span', 'nw', 'NOVÉ'));
      if (m.at) { const a = el('a', '', m.title); a.href = itemLink(m.ref && m.ref.kind, m.ref && m.ref.id, m.at[1], m.at[0]); tt.append(a); } else tt.append(m.title);
      top.append(tt);
      const meta = m.meta || ((tier === 'now' || tier === 'past') && m.t ? TIME.format(new Date(m.t)) : '');
      if (meta) top.append(el('span', 'meta', meta));
      li.append(icon(m.src, m.st === 'end'), top);
      if (m.sub) li.append(el('div', 'sub', m.sub));
      const k = `${tier}:${m.id || m.title}`;
      if (!firstNews && !seen.has(k)) li.classList.add('fresh');
      seen.add(k);
      return li;
    });
    if (l.length > SHOW) lis.splice(SHOW, 0, el('li', 'rest', `a ${plural(l.length - SHOW, 'další zpráva', 'další zprávy', 'dalších zpráv')} v mapě`));
    if (quiet.length) lis.splice(lis.length - quiet.length, 0, el('li', 'also', 'Také, méně naléhavé:'));
    if (!l.length) lis.unshift(el('li', 'none', Z ? none : 'Zprávy se nepodařilo načíst.'));
    $(`m-${tier}`).replaceChildren(...lis);
    $(`m-${tier}`).dataset.extra = String(Math.max(0, l.length - SHOW)); // (for the dashboard: how many more than the list holds)
  }
  if (Z) firstNews = false;
}

// ---- the boxes of the week and of the traffic: a head (the name and the big number), blocks that stand side by side
// on a monitor and one under another on a phone, the source at the bottom
const head = (title, big) => { const h = el('header', 'bh'); h.append(el('h3', '', title)); if (big) h.append(el('p', 'big', big)); return h; };
const blk = (title, ...kids) => { const b = el('div', 'blk'); b.append(el('h4', '', title), ...kids.filter(Boolean)); return b; };
// a list of links: [[text, address, what follows the link]]
const links = rows => { const ul = el('ul', 'plain'); for (const [text, href, tail] of rows) { const li = el('li'), a = el('a', '', text); a.href = href; li.append(a, tail || ''); ul.append(li); } return ul; };

// ---- the week: the fire brigade by kind, by day and by part of the city; today against the days before
function renderHasici(HW, H) {
  const box = $('w-hasici');
  if (!HW) { box.replaceChildren(head('Výjezdy hasičů'), el('p', 'muted', 'Data za týden se nepodařilo načíst.')); return; }
  const all = new Map([...(HW.items || []), ...((H && H.items) || [])].map(o => [o.id, o]));
  const l = [...all.values()].filter(o => o.t > Date.now() - 7 * 864e5);
  const by = {}; for (const o of l) by[o.kind] = (by[o.kind] || 0) + 1;
  const blks = el('div', 'blks');
  blks.append(blk('Podle druhu', bars(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, c]) => [(HZ_WORDS[k] || HZ_WORDS.jine)[2].replace(/^./, s => s.toUpperCase()), c, (HZ[k] || HZ.jine).col]))));
  // by day: the days the week file covers (the first one may be partial: before the archive began)
  const first = l.length ? Math.min(...l.map(o => o.t)) : Date.now();
  const days = []; for (let i = 6; i >= 0; i--) { const t = Date.now() - i * 864e5; if (dayKey(t) >= dayKey(first)) days.push(t); }
  const perDay = days.map(t => [DAY.format(new Date(t)), l.filter(o => dayKey(o.t) === dayKey(t)).length]);
  const full = perDay.slice(0, -1).slice(dayKey(days[0]) === dayKey(first) && days.length === 7 ? 0 : 1); // (whole days before today; a first day cut by the beginning of the archive is left out)
  let note = null;
  if (full.length) {
    const avg = full.reduce((s, d) => s + d[1], 0) / full.length, today = perDay.at(-1)[1];
    note = el('p', 'note', `Dnes zatím ${today}, předchozí ${plural(full.length, 'den', 'dny', 'dní')} průměrně ${avg.toFixed(1).replace('.', ',')} za den.`);
  }
  blks.append(blk('Po dnech', bars(perDay), note));
  const parts = {}; for (const o of l) { const p = o.part || o.obec || '?'; parts[p] = (parts[p] || 0) + 1; }
  const top = Object.entries(parts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (top.length) blks.append(blk('Nejvíc výjezdů', bars(top)));
  const fires = l.filter(o => o.kind === 'pozar').sort((a, b) => b.t - a.t).slice(0, 5);
  if (fires.length) blks.append(blk('Požáry', links(fires.map(o => [`${when(o.t)} · ${[o.street, o.part].filter(Boolean).join(', ') || o.obec}`, itemLink('hasici', o.id, o.lat, o.lon), o.note ? ` · ${o.note}` : '']))));
  box.replaceChildren(head('Výjezdy hasičů', plural(l.length, 'výjezd', 'výjezdy', 'výjezdů')), blks,
    source('Zdroj: HZS Jihomoravského kraje (udalosti.firebrno.cz), jen zásahy na území města Brna. Plané poplachy nejsou započítané.'));
}
function renderPolicie(P) {
  const box = $('w-policie');
  if (!P) { box.replaceChildren(head('Policie: případy týdne'), el('p', 'muted', 'Data policie se nepodařilo načíst.')); return; }
  const l = P.items || [], by = {}; for (const o of l) by[o.kind] = (by[o.kind] || 0) + 1;
  const d = s => DAY.format(new Date(`${s}T12:00:00`));
  const span = `Týden ${d(P.from)} až ${d(P.to).replace(/\.$/, '')}. Končí před třemi dny, protože policie poslední dny doplňuje později.`;
  const lead = el('p', 'note', span); lead.title = span;
  const blks = el('div', 'blks');
  blks.append(blk('Podle druhu', bars(Object.keys(PO).map(k => [PO[k].n, by[k] || 0, PO[k].col]))));
  const sub = {}; for (const o of l) { const t = caseText(o); sub[t] = (sub[t] || 0) + 1; }
  const solved = l.filter(o => o.st === 1).length;
  blks.append(blk('Nejčastější', bars(Object.entries(sub).sort((a, b) => b[1] - a[1]).slice(0, 6)),
    l.length ? el('p', 'note', `Pachatel zjištěn u ${plural(solved, 'případu', 'případů', 'případů')} z ${l.length} (stav při zveřejnění).`) : null));
  box.replaceChildren(head('Policie: případy týdne', plural(l.length, 'případ', 'případy', 'případů')), lead, blks,
    source('Zdroj: Policie České republiky, mapa kriminality (otevřená data CC BY 4.0). Policie zveřejňuje polohu jen po oblastech.'));
}
function renderVoda(VW, V) {
  const box = $('w-voda');
  if (!VW && !V) { box.replaceChildren(head('Voda: havárie a odstávky'), el('p', 'muted', 'Data BVK se nepodařilo načíst.')); return; }
  const l = (VW && VW.items) || [], hav = l.filter(o => o.kind === 'havarie'), off = l.filter(o => o.kind !== 'havarie');
  const place = o => usefulWhere(o).map(w => w.split(',')[0]).slice(0, 2).join(', ') || (o.n ? plural(o.n, 'adresa', 'adresy', 'adres') : o.obec);
  const adr = o => (o.n && usefulWhere(o).length ? ` · ${plural(o.n, 'adresa', 'adresy', 'adres')}` : ''); // (without a named place the count of addresses already stands for it)
  const blks = el('div', 'blks');
  blks.append(blk('Za posledních 7 dní', l.length
    ? links(l.slice(0, 8).map(o => [`${o.from ? when(o.from) : ''} · ${o.kind === 'havarie' ? 'havárie' : 'odstávka'} · ${place(o)}`, itemLink('voda', o.id, o.lat, o.lon), adr(o)]))
    : el('p', 'note', 'Žádná havárie ani odstávka (přehled vede mapa od 15. 11. 2026).')));
  const plan = ((V && V.items) || []).filter(o => o.kind === 'odstavka' && !o.gone && o.from > Date.now()).sort((a, b) => a.from - b.from);
  if (plan.length) blks.append(blk(`Připravované odstávky (${plan.length})`, links(plan.slice(0, 6).map(o => [`${when(o.from)} · ${place(o)}`, itemLink('voda', o.id, o.lat, o.lon), adr(o)]))));
  box.replaceChildren(head('Voda: havárie a odstávky', `${plural(hav.length, 'havárie', 'havárie', 'havárií')}, ${plural(off.length, 'odstávka', 'odstávky', 'odstávek')}`), blks,
    source('Zdroj: Brněnské vodárny a kanalizace, a.s. (mapa havárií a odstávek).'));
}

// ---- the traffic (a block of the dashboard): the course of the index today, the worst queues now, the lines of the
// public transport that run most late and the room in the car parks. All from doprava.json, which the tile reads too.
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const LEVEL_COL = ['#93c96a', '#d8e36a', '#f3c868', '#f5a04a', '#ff6b57'];
const MHD_WORD = { tram: 'šalina', trol: 'trolejbus', bus: 'autobus' };
function dayChart(DOP) {
  const pts = []; ((DOP.day && DOP.day.idx) || []).forEach((x, i) => { if (Number.isFinite(x)) pts.push([i, x]); });
  if (pts.length < 3) return null;
  const N = 288, H = 100, top = Math.max(50, ...pts.map(p => p[1])) * 1.15; // (a 5-minute step, midnight to midnight; the scale goes at least to 50, so a quiet day stays low)
  const X = i => i * 100 / N, Y = x => H - (x / top) * H;
  const s = svgEl('svg', { class: 'dc-svg', viewBox: `0 0 100 ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  for (const h of [6, 12, 18]) s.append(svgEl('line', { class: 'gd', x1: X(h * 12), x2: X(h * 12), y1: 0, y2: H }));
  const levels = [25, 50, 75].filter(v => v < top);
  for (const v of levels) s.append(svgEl('line', { class: 'gd', x1: 0, x2: 100, y1: Y(v), y2: Y(v) }));
  const line = pts.map(([i, x]) => `${X(i).toFixed(2)},${Y(x).toFixed(1)}`).join(' ');
  s.append(svgEl('polygon', { class: 'ar', points: `${X(pts[0][0]).toFixed(2)},${H} ${line} ${X(pts.at(-1)[0]).toFixed(2)},${H}` }), svgEl('polyline', { class: 'ln', points: line }));
  const wrap = el('div', 'daychart'), plot = el('div', 'dc-plot'); plot.append(s);
  // the marks are HTML over the picture, so the stretching of the chart does not deform them
  for (const v of levels) { const y = el('span', 'dc-y', String(v)); y.style.top = `${Y(v)}%`; plot.append(y); }
  const mark = (i, x, cls, text) => { const m = el('span', `dc-m ${cls}${X(i) > 80 ? ' lft' : ''}`); m.style.left = `${X(i).toFixed(2)}%`; m.style.top = `${Y(x).toFixed(1)}%`; if (text) m.append(el('b', '', text)); plot.append(m); };
  const [ni, nx] = pts.at(-1), pk = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (Math.abs(pk[0] - ni) > 18) mark(pk[0], pk[1], 'pk', `špička ${pk[1]}`); // (a peak within an hour and a half of now: its label would lie over "teď")
  mark(ni, nx, 'nw', `teď ${nx}`);
  const xs = el('div', 'dc-x'); for (const h of ['0', '6', '12', '18', '24 h']) xs.append(el('span', '', h));
  wrap.append(plot, xs);
  return wrap;
}
function renderDoprava(DOP) {
  const box = $('w-doprava');
  if (!DOP || !Number.isFinite(DOP.idx)) { box.replaceChildren(head('Doprava a MHD'), el('p', 'muted', 'Data o dopravě se nepodařilo načíst.')); return; }
  const blks = el('div', 'blks'), cz = x => String(x).replace('.', ',');
  const peak = [DOP.peak ? `Špička dnes ${DOP.peak.idx} v ${DOP.peak.at}` : '', DOP.kmPeak ? `nejvíc kolon ${cz(DOP.kmPeak.km)} km v ${DOP.kmPeak.at}` : ''].filter(Boolean).join(', ');
  const chart = blk('Index dopravy dnes (0 volno, 100 město stojí)', dayChart(DOP), el('p', 'note', [DOP.text, peak ? `${peak}.` : ''].filter(Boolean).join(' ')));
  chart.classList.add('wide'); blks.append(chart);
  const jams = ((DOP.top && DOP.top.now) || []).slice(0, 7);
  const km = DOP.silnice && DOP.silnice.km;
  blks.append(blk(`Kolony teď${km != null ? ` (${cz(km)} km)` : ''}`, jams.length
    ? bars(jams.map(o => [o.s, o.min, LEVEL_COL[o.lv] || LEVEL_COL[2], mapLink(o.lat, o.lon, 1)]), { unit: ' min', cls: 'wv' })
    : el('p', 'note', 'Teď žádná kolona.')));
  // the public transport: the vehicle that runs most late of every line
  const byLine = new Map();
  for (const [line, type, min, lon, lat] of DOP.late || []) { const o = byLine.get(line); if (!o) byLine.set(line, { line, type, min, lon, lat, n: 1 }); else { o.n++; if (min > o.min) Object.assign(o, { min, lon, lat }); } }
  const late = [...byLine.values()].sort((a, b) => b.min - a.min).slice(0, 7), m = DOP.mhd;
  blks.append(blk('MHD: největší zpoždění', late.length
    ? bars(late.map(o => [`${MHD_WORD[o.type] || 'linka'} ${o.line}${o.n > 1 ? ` (${o.n}×)` : ''}`, o.min, '', mapLink(o.lat, o.lon, 0.5)]), { unit: ' min', cls: 'wv' })
    : el('p', 'note', 'Žádný vůz nemá zpoždění přes 5 minut.'),
  m ? el('p', 'note', `${plural(m.n, 'vůz', 'vozy', 'vozů')} na trati, průměrné zpoždění ${cz(m.avg)} min.`) : null));
  const park = (DOP.park || []).filter(p => !p.out && p.cap);
  if (park.length) blks.append(blk('Volná místa v parkovacích domech', bars(park.map(p => [p.n.replace(/^(Parkoviště|Parking)\s+/, ''), p.free, p.free ? '' : '#ff6b57', mapLink(p.lat, p.lon, 0.5), p.free / p.cap]), { cls: 'names' })));
  box.replaceChildren(head('Doprava a MHD', `${DOP.idx}/100 · ${DOP.word || ''}`), blks,
    source('Zdroj: Waze přes otevřená data města Brna (kolony), KORDIS JMK (MHD), Brněnské komunikace (parkování). Index z nich počítá mapa.'));
}

const PINNED = [['now', 3]]; // (the units that stay, with the weights of their columns)
const BLOCKS = [ // (the units of a block with the weights of their columns, how many seconds the block stays, and a short name for a narrow line)
  { key: 'dnes', name: 'Dnes a chystá se', short: 'Dnes', sec: 15, units: [['today', 3.5], ['week', 3.5]] },
  { key: 'stalo', name: 'Stalo se dnes', short: 'Stalo se', sec: 15, units: [['past', 7]] },
  { key: 'hasici', name: 'Hasiči za týden', short: 'Hasiči', sec: 15, units: [['hasici', 7]] },
  { key: 'policie', name: 'Policie a voda', short: 'Policie, voda', sec: 15, units: [['policie', 3.5], ['voda', 3.5]] },
  { key: 'mapa', name: 'Mapa', sec: 30, units: [['mapa', 7]] }, // (src/prehledmapa.js; OPT.mapa takes it out of the round)
];
const USED = new Set([...PINNED, ...BLOCKS.flatMap(b => b.units)].map(u => u[0])); // (a unit in no block is not drawn at all)
const DASH_MQ = matchMedia('(min-width: 1000px) and (min-height: 620px)');
const stage = $('stage'), unitEl = Object.fromEntries([...stage.querySelectorAll('.unit')].map(e => [e.dataset.u, e]));
// the block that the address asks to keep (#blok/<key>), or -1: the turns are on
const hashBlock = () => { const m = /^#blok\/([\w-]+)/.exec(location.hash); return m ? BLOCKS.findIndex(b => b.key === m[1]) : -1; };
// the settings that the address carries (see "the settings" below): what the care of the screen may do, the hours of the night
const parseNoc = v => { const m = /^(\d{1,2})-(\d{1,2})$/.exec(v || ''); return m && +m[1] < 24 && +m[2] < 24 && +m[1] !== +m[2] ? [+m[1], +m[2]] : null; };
const asked = new URLSearchParams(location.search);
const OPT = { mapa: asked.get('mapa') !== '0', skryt: asked.get('skryt') !== '0', ztlumit: asked.get('ztlumit') !== '0', zrcadlit: asked.get('zrcadlit') !== '0', noc: parseNoc(asked.get('noc')), prulet: ['0', '1'].includes(asked.get('prulet')) ? asked.get('prulet') : '' };
// the address says what is set: only what differs from the plain page is in it (anything else of the query stays)
function writeUrl() {
  const q = new URLSearchParams(location.search);
  for (const k of ['mapa', 'skryt', 'ztlumit', 'zrcadlit']) { if (OPT[k]) q.delete(k); else q.set(k, '0'); }
  if (OPT.noc) q.set('noc', OPT.noc.join('-')); else q.delete('noc');
  if (OPT.prulet) q.set('prulet', OPT.prulet); else q.delete('prulet');
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${s ? `?${s}` : ''}${rot.on ? '' : `#blok/${BLOCKS[rot.i].key}`}`);
}
// on: the blocks take turns · i: the block on the stage · holds: why a turn waits now (the pointer over a block, the
// page not seen) · fx: the animations of a change that runs
const rot = { on: hashBlock() < 0, i: 0, anim: null, round: 0, timer: 0, holds: new Set(), fx: [] };
let dashOn = false, sbar = null, reel = null;
const sheets = [], homes = new Map(); // (homes: the place of every unit in the page, for the way back to a phone)

const TURN_MS = 600, TURN_EASE = 'cubic-bezier(.6, 0, .3, 1)';
const LESS_MOTION = matchMedia('(prefers-reduced-motion: reduce)');
const fxState = { slow: navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2, bad: 0, lite: false };
try { if (Date.now() - +(localStorage.getItem('b2k-lite') || 0) < 7 * 864e5) fxState.slow = fxState.lite = true; } catch { /* a private window */ }
// the frames of a change that runs are counted (only then, about half a second): too few twice in a row and the
// changes go without a move for the rest of the visit
function watchFrames(ms) {
  let t0 = 0, n = 0;
  const step = t => {
    if (!t0) t0 = t; else n++; // (from the second frame on: the first one carries the layout and the painting of the new sheet)
    if (t - t0 < ms) { requestAnimationFrame(step); return; }
    const fps = n / ((t - t0) / 1000);
    fxState.bad = fps < 30 ? fxState.bad + 1 : 0;
    fxState.fps = Math.round(fps);
    if (fxState.bad >= 2) fxState.slow = true;
  };
  requestAnimationFrame(step);
}

const pxIcon = d => { const s = svgEl('svg', { class: 'px', viewBox: '0 0 12 12', 'shape-rendering': 'crispEdges', 'aria-hidden': 'true' }); s.append(svgEl('path', { d, fill: 'currentColor' })); return s; };
const ICON = { gear: 'M3 3h6v2H3zM3 7h6v2H3zM3 5h2v2H3zM7 5h2v2H7zM5 0h2v3H5zM5 9h2v3H5zM0 5h3v2H0zM9 5h3v2H9zM2 2h2v2H2zM8 2h2v2H8zM2 8h2v2H2zM8 8h2v2H8z' };
// the bar under the stage: the line of the minute, the names of the blocks under their parts of it, and the wheel
// of the settings in the corner
function buildBar() {
  const bar = el('div', 'stage-bar'), left = el('div', 'sb-left'), track = el('div', 'sb-track'), names = el('div', 'sb-names');
  track.append(el('i', 'sb-fill'));
  names.setAttribute('role', 'tablist'); names.setAttribute('aria-label', 'Bloky přehledu');
  BLOCKS.forEach((b, i) => {
    const t = el('button', 'sb-tab'); t.type = 'button'; t.setAttribute('role', 'tab'); t.title = `${b.name}: nechat na obrazovce`;
    t.append(el('span', 'sb-n', b.name), el('span', 'sb-n sb-s', b.short || b.name)); t.setAttribute('aria-label', b.name); t.style.flexGrow = String(b.sec); // (its part of the line is as long as its time)
    t.addEventListener('click', () => pickBlock(i, i < rot.i ? -1 : 1));
    names.append(t);
  });
  left.append(track, names);
  const gear = el('button', 'sb-ib'); gear.type = 'button'; gear.title = 'Nastavení přehledu'; gear.setAttribute('aria-label', 'Nastavení přehledu'); gear.setAttribute('aria-haspopup', 'dialog'); gear.append(pxIcon(ICON.gear));
  gear.addEventListener('click', () => { setup.showModal(); syncSetup(); });
  const tools = el('div', 'sb-tools'); tools.append(gear);
  bar.append(left, tools);
  stage.append(bar);
  return bar;
}
function markBar() {
  if (!sbar) return;
  const order = turns();
  sbar.querySelectorAll('.sb-tab').forEach((t, k) => { t.setAttribute('aria-selected', String(k === rot.i)); t.tabIndex = k === rot.i ? 0 : -1; t.hidden = !order.includes(k) && k !== rot.i; });
  document.documentElement.classList.toggle('pinned', !rot.on);
  syncSetup();
}

// ---- nothing scrolls, so every list shows only what fits and says how many more there are; a block of a box that
// does not fit is left out. All the reading of the layout first, then all the writing (two rounds for the whole stage).
function fit() {
  if (!dashOn) return;
  const units = [...stage.querySelectorAll('.unit.pin, .sheet.on .unit')], lists = units.flatMap(u => [...u.querySelectorAll('.wire, .bars, .plain')]);
  for (const x of stage.querySelectorAll('.fit-out')) x.classList.remove('fit-out');
  for (const x of stage.querySelectorAll('.fit-more')) x.remove();
  if (!rot.on) return; // (the turns are off: whole lists, they scroll inside their boxes)
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16, moreH = rem * 1.6;
  const cuts = lists.map(ul => {
    const box = (ul.closest('.blks') || ul).getBoundingClientRect(), items = [...ul.children], rs = items.map(li => li.getBoundingClientRect());
    const last = ul.closest('.blk') && ul.closest('.blk').lastElementChild, tail = last && last !== ul ? Math.max(0, last.getBoundingClientRect().bottom - ul.getBoundingClientRect().bottom) : 0; // (what follows the list in its block, a note under the bars, needs its room too)
    const clip = { bottom: box.bottom - Math.min(tail, box.height / 3), right: box.right };
    const over = r => r.bottom > clip.bottom + 1, beside = r => r.left >= clip.right - 1; // (beside: a further column of a list in columns)
    const first = rs.findIndex(r => r.height > 0 && (over(r) || beside(r)));
    if (first < 0) return null;
    let cut = first; // (the items before it stay)
    if (beside(rs[first])) cut = first - 1; // (in columns: one more goes, the line "+ N dalších" takes its place)
    else while (cut > 0 && rs[cut - 1].bottom > clip.bottom - moreH) cut--;
    cut = Math.max(0, cut);
    while (cut > 0 && items[cut - 1].classList.contains('also')) cut--; // (not a lone "Také, méně naléhavé:")
    return { ul, items, cut };
  });
  for (const c of cuts) {
    if (!c) continue;
    let n = +(c.ul.dataset.extra || 0);
    for (const li of c.items.slice(c.cut)) { li.classList.add('fit-out'); if (!li.matches('.rest, .also, .none')) n++; }
    if (n) c.ul.append(el('li', 'fit-more', `+ ${plural(n, 'další', 'další', 'dalších')}`));
  }
  const gone = [];
  for (const u of units) for (const bs of u.querySelectorAll('.blks')) { const clip = bs.getBoundingClientRect(); for (const b of bs.children) if (b.getBoundingClientRect().bottom > clip.bottom + 1) gone.push(b); }
  for (const b of gone) b.classList.add('fit-out');
}

// a change that runs is ended at once: only the sheet of the block that is on stays
function settle() {
  for (const a of rot.fx) a.cancel();
  rot.fx = [];
  sheets.forEach((s, k) => { if (k !== rot.i) s.classList.remove('on'); });
}
// the block i on the stage (quick: without the move · dir: 1 the new sheet comes from below, -1 from above)
function show(i, quick, dir = 1) {
  settle();
  const n = BLOCKS.length, outS = sheets[rot.i];
  rot.i = ((i % n) + n) % n;
  markBar();
  const inS = sheets[rot.i], from = outS !== inS && outS.classList.contains('on');
  inS.classList.add('on');
  fit(); // (reads the layout: the new sheet is measured and cut before anything moves)
  mapTurn();
  if (quick || !from || fxState.slow || LESS_MOTION.matches) { if (from) outS.classList.remove('on'); return; }
  const h = dir * (reel.clientHeight + (parseFloat(getComputedStyle(stage).rowGap) || 10)), opts = { duration: TURN_MS, easing: TURN_EASE, fill: 'both' };
  const fx = [outS.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-h}px)` }], opts), inS.animate([{ transform: `translateY(${h}px)` }, { transform: 'translateY(0)' }], opts)];
  rot.fx = fx;
  fx[1].finished.then(() => { if (rot.fx === fx) settle(); }, () => { /* cancelled by the next change */ });
  watchFrames(TURN_MS);
}
// ---- the round of the blocks. The blocks that take turns (the map only when it is on) share a round: 4 × 15 s and
// 30 s of the map make 90 s. The round goes by the clock of the device, not from the moment the page was opened: screens
// side by side change together and nothing has to be remembered. The line under the stage is one round.
const turns = () => BLOCKS.map((b, i) => i).filter(i => BLOCKS[i].key !== 'mapa' || OPT.mapa);
const roundMs = () => turns().reduce((s, i) => s + BLOCKS[i].sec, 0) * 1000;
function clockAt() { // the block the round is at now, and how long it still has
  let t = Date.now() % roundMs();
  for (const i of turns()) { const ms = BLOCKS[i].sec * 1000; if (t < ms) return { i, left: ms - t }; t -= ms; }
  return { i: turns()[0], left: 0 };
}
const blockNow = () => clockAt().i;
// the turn of the round: the block of the clock comes on the stage (unless the turns are off or wait), the line is put
// where the round is, and the next turn is set
function runRound() {
  clearTimeout(rot.timer);
  if (!dashOn) return;
  const round = roundMs(), c = clockAt();
  if (!rot.anim || rot.round !== round) { // (one run of the line is one round)
    if (rot.anim) rot.anim.cancel();
    rot.round = round;
    rot.anim = sbar.querySelector('.sb-fill').animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: round, easing: 'linear', iterations: Infinity });
  }
  rot.anim.currentTime = Date.now() % round; // (set at every turn: the clock of the device and the clock of the animation must not part)
  if (rot.on && !rot.holds.size && rot.i !== c.i) show(c.i);
  rot.timer = setTimeout(runRound, c.left + 30);
}
// the map of the city (src/prehledmapa.js, fetched when it is first wanted): it flies while its block is on the stage
let mapView = null, mapData = null, mapAsked = false, jams0 = null; // (jams0: the queues asked for with the map itself, until a refresh brings its own)
function loadMap() {
  if (mapAsked) return;
  mapAsked = true;
  get('jams.json').then(J => { jams0 = J; if (J && mapData && !mapData.J) { mapData = { ...mapData, J }; if (mapView) mapView.setData(mapData); } });
  import('./prehledmapa.js').then(m => { mapView = m.createMapView($('mp-view'), $('mp-count'), { el, icon, itemLink, plural, since, timeOf: t => TIME.format(new Date(t)) }); if (mapData) mapView.setData(mapData); mapTurn(); }, () => { mapAsked = false; });
}
function mapTurn() {
  const on = dashOn && BLOCKS[rot.i].key === 'mapa';
  if (on && !mapAsked) loadMap();
  if (!mapView) return;
  // (the flight is tried also where the blocks change without a move: the map measures its own frames and stands when
  // it cannot keep up. ?prulet=0 never flies, ?prulet=1 always, also against "less motion".)
  const calm = OPT.prulet === '0' || (OPT.prulet !== '1' && LESS_MOTION.matches);
  if (on) mapView.play(rot.on ? clockAt().left : BLOCKS[rot.i].sec * 1000, { calm, force: OPT.prulet === '1', loop: !rot.on }); else mapView.stop();
}
// a turn waits while the mouse moves over a block (it must not change under the hand) or the page is not seen; after
// that the stage catches up with the clock
function hold(why, on) {
  const was = rot.holds.size > 0; if (on) rot.holds.add(why); else rot.holds.delete(why);
  if (was && !rot.holds.size) runRound();
}
function setRot(on) {
  rot.on = on; writeUrl();
  markBar();
  if (on && blockNow() !== rot.i) show(blockNow()); else { fit(); mapTurn(); }
}
// a click on the name of a block (or the arrow keys): that block stays, the turns go off. The switch puts them on again.
function pickBlock(i, dir) {
  show(i, false, dir);
  if (rot.on) setRot(false); else { writeUrl(); syncSetup(); }
}
const ORBIT = [[4, 0], [4, 2], [3, 3], [2, 4], [0, 4], [-2, 4], [-3, 3], [-4, 2], [-4, 0], [-4, -2], [-3, -3], [-2, -4], [0, -4], [2, -4], [3, -3], [4, -2],
  [2, 0], [1, 1], [0, 2], [-1, 1], [-2, 0], [-1, -1], [0, -2], [1, -1]]; // (a ring of 4 px, then a ring of 2 px: 48 minutes round)
const ORBIT_MS = 120e3, QUIET_MS = 60e3, LONG_MS = 900e3, FLIP_MS = 3600e3;
const care = { quiet: false, dim: false, flip: false, night: false, touched: Date.now(), xy: '', step: -1, demo: false };

function layCols() { // the columns of the stage: the units that stay and the reel, mirrored or not
  const pin = PINNED.map(u => `minmax(0, ${u[1]}fr)`), rest = `minmax(0, ${BLOCKS[0].units.reduce((s, u) => s + u[1], 0)}fr)`;
  stage.style.gridTemplateColumns = (care.flip ? [rest, ...pin] : [...pin, rest]).join(' ');
}
function orbit(step = Math.floor(Date.now() / ORBIT_MS) % ORBIT.length) {
  if (step === care.step) return;
  care.step = step;
  const root = document.documentElement.style; // (prehled.css moves the bar, the headline and the rest by these two)
  root.setProperty('--ox', `${ORBIT[step][0]}px`); root.setProperty('--oy', `${ORBIT[step][1]}px`);
}
// the controls leave the page and come back: the wheel of the settings fades (html.quiet), the link back to the map
// goes out of the top bar and the name of the page slides to its new place
function setQuiet(on) {
  care.quiet = on;
  document.documentElement.classList.toggle('quiet', on);
  const back = document.querySelector('.tomap'), mast = document.querySelector('.mast'), x0 = mast.getBoundingClientRect().left;
  back.hidden = on;
  if (fxState.slow || LESS_MOTION.matches) return;
  const dx = x0 - mast.getBoundingClientRect().left;
  if (dx) mast.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration: 450, easing: TURN_EASE });
  if (!on) back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
}
function setDim(on) { care.dim = on; document.documentElement.classList.toggle('longrun', on); }
function setNight(on) { care.night = on; document.documentElement.classList.toggle('night', on); }
// the sides change: the page fades out, turns over and fades in (a slow device: at once)
function setFlip(on) {
  care.flip = on;
  const turn = () => { document.documentElement.classList.toggle('flip', care.flip); layCols(); fit(); };
  const main = document.querySelector('main');
  if (fxState.slow || LESS_MOTION.matches) { turn(); return; }
  const out = main.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
  out.finished.then(() => { turn(); out.cancel(); main.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' }); }, () => {});
}
const inHours = ([a, b], h) => (a <= b ? h >= a && h < b : h >= a || h < b);
// what the time without a touch and the settings ask for now; only what differs is changed
function applyCare() {
  if (!dashOn || care.demo) return;
  const idle = Date.now() - care.touched, long = idle > LONG_MS;
  const quiet = OPT.skryt && idle > QUIET_MS, dim = OPT.ztlumit && long, night = !!OPT.noc && long && inHours(OPT.noc, new Date().getHours());
  const flip = OPT.zrcadlit ? (long ? Math.floor(Date.now() / FLIP_MS) % 2 === 1 : care.flip) : false; // (the sides change in a long run only, and stay while somebody is at the page)
  if (quiet !== care.quiet) setQuiet(quiet);
  if (dim !== care.dim) setDim(dim);
  if (night !== care.night) setNight(night);
  if (flip !== care.flip) setFlip(flip);
}
function careTick() { if (dashOn && !care.demo) { orbit(); applyCare(); } } // (once a minute, with the countdown)
// a touch of the page. A browser sends a "move" of a pointer that lies still whenever the page changes under it, so
// a move counts only when the pointer is somewhere else than last time (a mouse left on a kiosk is not a visitor).
function movedFor(e) {
  const xy = `${e.screenX},${e.screenY}`;
  if (xy === care.xy) return false;
  care.xy = xy;
  return true;
}
function touched() {
  care.touched = Date.now();
  if (care.quiet || care.dim || care.night) applyCare();
}
function careOff() { // (a phone, or the window made small: the page that scrolls has none of this)
  document.documentElement.style.removeProperty('--ox'); document.documentElement.style.removeProperty('--oy'); care.step = -1; care.demo = false;
  if (care.quiet) setQuiet(false);
  setDim(false); setNight(false);
  care.flip = false; document.documentElement.classList.remove('flip');
  care.touched = Date.now();
}

// ---- the settings (the wheel in the corner of the bar opens them: <dialog id="setup"> in prehled.html holds the
// texts, here its switches are tied to the page). Everything that is set is written into the address of the page and
// nowhere else, so the plain address always behaves the plain way, and a kiosk or a bookmark gets the address with
// its settings: ?skryt=0 ?ztlumit=0 ?zrcadlit=0 switch the care of the screen off part by part, ?noc=23-5 dims the
// night, #blok/hasici keeps one block.
const setup = $('setup');
function syncSetup() { // the dialog shows what holds now
  if (!setup || !setup.open) return;
  $('st-rot').setAttribute('aria-checked', String(rot.on));
  [...$('st-blocks').children].forEach((b, k) => { b.setAttribute('aria-pressed', String(!rot.on && k === rot.i)); b.hidden = !turns().includes(k) && k !== rot.i; });
  for (const k of ['mapa', 'skryt', 'ztlumit', 'zrcadlit']) $(`st-${k}`).setAttribute('aria-checked', String(OPT[k]));
  const noc = $('st-noc'), val = OPT.noc ? OPT.noc.join('-') : '';
  if (val && ![...noc.options].some(o => o.value === val)) noc.add(new Option(`${OPT.noc[0]}:00 až ${OPT.noc[1]}:00`, val)); // (hours written into the address by hand)
  noc.value = val;
  $('st-prulet').value = OPT.prulet;
  $('st-dev').textContent = deviceNote();
  $('st-url').textContent = decodeURI(location.href);
  const fs = $('st-full'); fs.hidden = !document.fullscreenEnabled; fs.textContent = document.fullscreenElement ? 'Zpět z celé obrazovky' : 'Na celou obrazovku';
}
// what the page found out about this device and what it does because of it (a television has no console to look in)
function deviceNote() {
  const why = [];
  if (navigator.hardwareConcurrency <= 2) why.push(`jen ${navigator.hardwareConcurrency} jádra`);
  if (navigator.deviceMemory <= 2) why.push(`paměť ${navigator.deviceMemory} GB`);
  if (fxState.lite) why.push('mapa tu běžela v úsporném režimu');
  if (fxState.bad >= 2) why.push(`výměna bloků jen ${fxState.fps} snímků za sekundu`);
  if (LESS_MOTION.matches) why.push('zařízení chce méně pohybu');
  const hw = [navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} jader` : '', navigator.deviceMemory ? `${navigator.deviceMemory} GB paměti` : '', `obraz ${screen.width} × ${screen.height}`, fxState.fps ? `výměna bloků ${fxState.fps} snímků/s` : ''].filter(Boolean).join(', ');
  const m = mapView && mapView.state(), calm = OPT.prulet === '0' || (OPT.prulet !== '1' && LESS_MOTION.matches);
  const map = calm ? 'mapa stojí' : m && m.standing && OPT.prulet !== '1' ? `mapa stojí, průlet nestíhal (${m.fps} snímků/s)` : `mapa letí${m && m.fps ? ` (posledně ${m.fps} snímků/s)` : ''}`;
  return `Toto zařízení: ${hw}. Bloky se mění ${fxState.slow || LESS_MOTION.matches ? `bez pohybu (${why.join(', ') || 'pomalé zařízení'})` : 's pohybem'}, ${map}.`;
}
function startSetup() {
  BLOCKS.forEach((b, i) => { const x = el('button', '', b.name); x.type = 'button'; x.addEventListener('click', () => pickBlock(i, i < rot.i ? -1 : 1)); $('st-blocks').append(x); });
  $('st-rot').addEventListener('click', () => setRot(!rot.on));
  $('st-mapa').addEventListener('click', () => { OPT.mapa = !OPT.mapa; writeUrl(); if (OPT.mapa) loadMap(); markBar(); runRound(); });
  for (const k of ['skryt', 'ztlumit', 'zrcadlit']) $(`st-${k}`).addEventListener('click', () => { OPT[k] = !OPT[k]; writeUrl(); applyCare(); syncSetup(); });
  $('st-noc').addEventListener('change', e => { OPT.noc = parseNoc(e.target.value); writeUrl(); applyCare(); syncSetup(); });
  $('st-prulet').addEventListener('change', e => { OPT.prulet = e.target.value; writeUrl(); syncSetup(); if (BLOCKS[rot.i].key === 'mapa') mapTurn(); });
  $('st-full').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
  document.addEventListener('fullscreenchange', syncSetup);
  $('st-copy').addEventListener('click', async e => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(location.href); b.textContent = 'Zkopírováno'; } catch { const r = document.createRange(); r.selectNodeContents($('st-url')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Označeno, zkopírujte'; }
    setTimeout(() => { b.textContent = 'Kopírovat adresu'; }, 2500);
  });
  setup.addEventListener('click', e => { if (e.target === setup) setup.close(); }); // (a click beside the panel closes it)
}

// the units move from their places in the page into the sheets of their blocks, and back for a phone
function buildReel() {
  reel = el('div', 'reel');
  for (const b of BLOCKS) { const s = el('div', 'sheet'); s.style.gridTemplateColumns = b.units.map(u => `minmax(0, ${u[1]}fr)`).join(' '); sheets.push(s); reel.append(s); }
  stage.append(reel);
}
function setDash(on) {
  dashOn = on;
  const fine = $('fine');
  if (on) {
    if (!reel) buildReel();
    sbar = sbar || buildBar();
    layCols(); orbit();
    for (const [u] of PINNED) unitEl[u].classList.add('on', 'pin');
    BLOCKS.forEach((b, k) => { for (const [u] of b.units) { const e = unitEl[u], mark = document.createComment(u); e.before(mark); homes.set(e, mark); e.classList.add('on'); sheets[k].append(e); } });
    if (!homes.has(fine)) { const mark = document.createComment('fine'); fine.before(mark); homes.set(fine, mark); $('st-in').append(fine); } // (the sources: the last part of the settings)
    if (OPT.mapa) loadMap(); // (ahead of its turn: its picture is there when the block comes)
    show(rot.on ? blockNow() : Math.max(0, hashBlock()), true);
    runRound(); careTick();
  } else {
    clearTimeout(rot.timer);
    if (rot.anim) { rot.anim.cancel(); rot.anim = null; }
    settle();
    if (mapView) mapView.stop();
    if (setup.open) setup.close();
    careOff();
    stage.style.gridTemplateColumns = '';
    for (const [e, mark] of homes) mark.replaceWith(e);
    homes.clear();
    for (const s of sheets) s.classList.remove('on');
    for (const e of Object.values(unitEl)) e.classList.remove('on', 'pin');
    for (const x of stage.querySelectorAll('.fit-out')) x.classList.remove('fit-out');
    for (const x of stage.querySelectorAll('.fit-more')) x.remove();
  }
}
function startDash() {
  startSetup();
  setDash(DASH_MQ.matches);
  DASH_MQ.addEventListener('change', e => setDash(e.matches));
  let raf = 0;
  new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); }).observe(stage);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  // the pointer: a real move is a touch of the page, and over a block it makes the turn wait. A mouse that lies still
  // for 30 s holds nothing any more (on a kiosk it may lie over a block for days); the column "Teď" does not change,
  // so the pointer over it holds nothing either.
  const inBlock = t => !!(t && t.closest && t.closest('.sheet'));
  let mouseT = 0;
  document.addEventListener('pointermove', e => {
    if (!movedFor(e)) return;
    touched();
    if (!dashOn || e.pointerType !== 'mouse') return;
    clearTimeout(mouseT);
    if (inBlock(e.target)) { hold('mys', true); mouseT = setTimeout(() => hold('mys', false), 30e3); } else hold('mys', false);
  }, { passive: true });
  for (const ev of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(ev, touched, { passive: true });
  document.addEventListener('visibilitychange', () => hold('skryto', document.hidden));
  // the address changed by hand (or Back): the block it names stays, without one the turns go on
  window.addEventListener('hashchange', () => { const k = hashBlock(); if (!dashOn) return; if (k >= 0) { rot.on = false; show(k); fit(); } else if (!rot.on) setRot(true); });
  document.addEventListener('keydown', e => {
    if (!dashOn || setup.open || e.altKey || e.ctrlKey || e.metaKey || !e.target.closest || e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const d = e.key === 'ArrowRight' ? 1 : -1, order = turns(), k = Math.max(0, order.indexOf(rot.i)); pickBlock(order[(k + d + order.length) % order.length], d); } else if (e.key === ' ' && !e.target.closest('button, a')) { e.preventDefault(); setRot(!rot.on); }
  });
}

// ---- the countdown: a bar under the top bar runs out and the hand of the dial goes round once a minute (both by the
// Web Animations API on transform, so they run off the main thread); the text under the dial counts the seconds
const live = $('live'), next = $('next'), clock = $('clock');
let nextAt = 0, busy = false, anims = [], okTimer = 0;
function startCountdown() {
  nextAt = Date.now() + PERIOD;
  for (const a of anims) a.cancel();
  anims = [
    $('prog').animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: PERIOD, easing: 'linear', fill: 'forwards' }),
    $('hand').animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: PERIOD, easing: 'linear', fill: 'forwards' }),
  ];
  careTick();
}
function tick() {
  clock.textContent = CLOCK.format(new Date()).slice(0, 5);
  applyCare(); // (the dashboard: every second, so the controls leave a minute after the last touch, not at the next refresh)
  if (busy) return;
  const s = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
  if (!live.classList.contains('ok')) next.textContent = `${s} s`;
  if (s <= 0 && !document.hidden) refresh();
}

const cityOnly = d => (d ? { ...d, items: (d.items || []).filter(o => !o.obec || o.obec === 'Brno') } : d);
// ---- loading: the minute files every minute, the week files every 5 minutes
const week = { at: 0, HW: null, VW: null, P: null };
async function refresh() {
  if (busy) return;
  busy = true; live.classList.remove('ok'); live.classList.add('busy'); next.textContent = '…';
  try {
    // (jams.json: the lines of the queues for the map block of the dashboard, asked only when that block is in use)
    const [Z, DOP, H0, V, J] = await Promise.all([get('zpravy.json'), get('doprava.json'), get('hasici.json'), get('voda.json', 300e3), mapAsked ? get('jams.json') : null]);
    if (Date.now() - week.at > WEEK_MS) { const [HW, VW, P] = await Promise.all([get('hasici-tyden.json', 300e3), get('voda-tyden.json', 300e3), get('policie.json', 3600e3)]); Object.assign(week, { HW: cityOnly(HW), VW, P, at: Date.now() }); }
    const H = cityOnly(H0);
    $('kicker').textContent = Z && Z.lead ? Z.lead.day.replace(/\.$/, '') : 'Přehled města z otevřených dat';
    $('lead').textContent = Z && Z.lead ? Z.lead.text : 'Zprávy se teď nepodařilo načíst.';
    const st = $('stamp'), stale = !SAMPLE && Z && Z.t && Date.now() - Z.t > 15 * 60e3;
    st.replaceChildren(...(stale ? [el('span', 'warn', `Pozor: zprávy jsou z ${when(Z.t)}, teď se neobnovují.`)] : []));
    st.hidden = !stale;
    renderTicker(Z);
    renderNow({ Z, DOP, H, V });
    renderNews(Z);
    renderHasici(week.HW, H); renderPolicie(week.P); renderVoda(week.VW, V); if (USED.has('doprava')) renderDoprava(DOP);
    mapData = { Z, DOP, H, V, J: J || jams0 }; if (mapView) mapView.setData(mapData);
    fit(); // (the dashboard: the counts in its bar, the lists cut to the height of the stage)
  } finally {
    busy = false; live.classList.remove('busy'); live.classList.add('ok'); next.textContent = '✓';
    clearTimeout(okTimer); okTimer = setTimeout(() => live.classList.remove('ok'), 2500);
    startCountdown();
  }
}
refresh();
tick();
setInterval(tick, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() >= nextAt) refresh(); });
$('sweep').addEventListener('click', () => refresh());

// the tabs stick right under the top bar: its height (two rows on a phone, the safe area of a notch) as --barh
const bar = document.querySelector('.bar');
new ResizeObserver(() => document.documentElement.style.setProperty('--barh', `${Math.round(bar.getBoundingClientRect().height)}px`)).observe(bar);

// ---- the tabs of the news on a phone (from a tablet up all four columns are side by side and the tabs are hidden)
const tabs = [...document.querySelectorAll('#tabs [role="tab"]')];
function pick(btn, focus) {
  for (const b of tabs) { const on = b === btn; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  $('desk').dataset.t = btn.dataset.t;
  if (focus) btn.focus();
}
for (const b of tabs) {
  b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1;
  b.addEventListener('click', () => pick(b));
  b.addEventListener('keydown', e => { const i = tabs.indexOf(b), j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1; if (j >= 0 && j < tabs.length) { e.preventDefault(); pick(tabs[j], true); } });
}

startDash();

document.addEventListener('click', e => {
  const a = e.target.closest('a'); if (!a) return;
  const h = a.getAttribute('href') || '';
  if (h === './') { track('Odkaz', { co: `prehled-mapa${a.classList.contains('mapcard') ? '-karta' : ''}` }); return; }
  if (h.startsWith('./#')) track('Odkaz', { co: `prehled-${h.startsWith('./#tema') ? h.slice(9) : h.startsWith('./#udalost/') ? h.split('/')[2] : 'misto'}` });
});

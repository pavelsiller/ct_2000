import { onScreen } from './onscreen.js';
import { fetchData, watchFeed, RELOAD } from './feed.js';
import './vlaky.css';

const DEV = false, Q = null;
const LIVE = (import.meta.env.VITE_MHD_SNAP || '').trim().replace(/mhd-live\.json.*$/, 'vlaky-live.json');
const POLL_MS = 20e3, LIVE_STALE_MS = 120e3;
const GONE_S = 60; // a train stays on the board this long after it has left
const LIVE_BEFORE_S = 4 * 3600, LIVE_AFTER_S = 3 * 3600; // a report of train 4141 belongs to the run that is around now, not to tomorrow's
const PAGE = 10; // rows of the board, and how many "Další" adds
export const SHOW_Z = 0.7, NAMES = 0.45, BIG = 1.4; // (as the signs of the car parks, src/parking.js)
const INK = '#161d2b', CREAM = '#fff6d8', NAVY = '#16335f';
// the station's own board on the web of Správa železnic: the one place that knows the real platform and track
const SZ_BOARD = 'https://provoz.spravazeleznic.cz/Tabule/Pages/StationTable.aspx?Key=';
const TRAIN = ['.#####.', '#######', '#..#..#', '#..#..#', '#######', '#.###.#', '.#...#.']; // 7 × 7: the front of a train

// ---- the time: the seconds of the timetable count from the Prague midnight of the day of the file
const PARTS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function pragueMidnight(day) {
  const u = Date.parse(`${day}T00:00:00Z`), p = PARTS.formatToParts(new Date(u)), g = t => +p.find(x => x.type === t).value;
  return u - (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - u);
}
const two = n => String(n).padStart(2, '0');
export const hhmm = s => { const m = Math.floor((((s % 86400) + 86400) % 86400) / 60); return `${two(Math.floor(m / 60))}:${two(m % 60)}`; };
// the kind of the train for the colour of its badge: s / r the lines of the integrated transport, d long-distance
const kindOf = tr => (tr.l ? (/^S/.test(tr.l) ? 's' : 'r') : /^(Os|Sp)\b/.test(tr.n) ? 'o' : 'd');

/**
 * @param base the address of the page (data/…)
 * @param llToImg (lon, lat) → image point
 * @param A image px per metre (GEO.A)
 * @param onChange called after every load of the timetable
 */
export function createVlaky({ base, llToImg, A = 1, onChange = () => {} }) {
  const D = { stations: [], day: null, mid: 0, places: [], w: [], carriers: [], patterns: [], source: '', updated: null, error: false, live: new Map(), liveAt: 0, liveOk: false };
  let loading = null, posKey = '', hits = [], order = [];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  async function fetchNow(init) {
    try {
      const r = await fetchData(`${base}data/vlaky.json`, init);
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      const st = d.stations.map(s => ({ ...s, dep: [], arr: [], next: null, nextAt: 0 }));
      const byPlace = new Map(st.map(s => [s.place, s]));
      for (const tr of d.trains) {
        const pat = d.patterns[tr.p];
        for (const [pos, a, dp, k] of tr.s) {
          const s = byPlace.get(pat[pos]);
          if (!s) continue;
          if (dp != null) s.dep.push({ t: dp, tr, pos, k });
          if (a != null) s.arr.push({ t: a, tr, pos, k });
        }
      }
      for (const s of st) { s.dep.sort((x, y) => x.t - y.t); s.arr.sort((x, y) => x.t - y.t); }
      Object.assign(D, { stations: st.filter(s => s.dep.length || s.arr.length), day: d.day, mid: pragueMidnight(d.day), places: d.places, w: d.w, carriers: d.carriers, patterns: d.patterns, source: d.source || '', updated: d.updated || null, error: false });
    } catch { D.error = true; }
    posKey = '';
    onChange();
  }
  const load = () => (loading ||= fetchNow());
  watchFeed('vlaky.json', () => fetchNow(RELOAD));
  const nowS = () => { const s = (Date.now() - D.mid) / 1000; return s; };
  // (the file holds two days: older than that, it says nothing about now)
  const fresh = () => !!D.day && nowS() < 2 * 86400;

  // ---- the trains on their way
  let liveBusy = null;
  function fetchLive() {
    if (!LIVE) return Promise.resolve();
    return (liveBusy ||= (async () => {
      try {
        const r = await fetch(LIVE, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        const d = await r.json(), c = Object.fromEntries(d.cols.map((k, i) => [k, i])), m = new Map();
        for (const v of d.v) m.set(v[c.no], { delay: v[c.delay], line: v[c.line], lat: v[c.lat], lng: v[c.lng], units: v[c.units] });
        D.live = m; D.liveAt = Date.now(); D.liveOk = true;
      } catch { D.liveOk = false; }
      liveBusy = null;
    })());
  }
  // the report of the train of this row, when it is fresh and belongs to this run
  function liveOf(row, now = nowS()) {
    if (Date.now() - D.liveAt > LIVE_STALE_MS || row.t - now > LIVE_BEFORE_S || now - row.t > LIVE_AFTER_S) return null;
    const v = D.live.get(row.tr.no);
    return v && v.delay != null ? v : null;
  }
  const realT = (row, now) => { const v = liveOf(row, now); return row.t + (v ? v.delay * 60 : 0); };

  // ---- one row in words
  // the places named between this station and the end of the train: the three where the most trains stop, in order
  function via(row, arr) {
    const key = arr ? 'viaA' : 'viaD';
    if (row[key] != null) return row[key];
    const pat = D.patterns[row.tr.p], mid = arr ? pat.slice(1, row.pos) : pat.slice(row.pos + 1, -1);
    const top = new Set([...new Set(mid)].sort((a, b) => D.w[b] - D.w[a]).slice(0, 3));
    return (row[key] = mid.filter(i => top.has(i)).map(i => D.places[i].replace(/^Brno-/, '')).join(' – '));
  }
  const endOf = (row, arr) => { const pat = D.patterns[row.tr.p]; return D.places[arr ? pat[0] : pat[pat.length - 1]]; };
  // the rows of a station from now on (a train that is late stays until it has really left)
  function rowsOf(st, arr, n) {
    const now = nowS(), list = arr ? st.arr : st.dep, out = [];
    for (const row of list) {
      if (row.t < now - LIVE_AFTER_S) continue;
      if (realT(row, now) < now - GONE_S) continue;
      out.push(row);
      if (out.length >= n) break;
    }
    return out;
  }
  // the next departure, for the label on the map (looked up again every 20 s, not in every frame)
  function nextOf(st) {
    const t = Date.now();
    if (t - st.nextAt < POLL_MS) return st.next;
    st.nextAt = t;
    const r = fresh() ? rowsOf(st, false, 1)[0] : null;
    if (!r) return (st.next = null);
    const v = liveOf(r);
    return (st.next = `${hhmm(r.t)} ${r.tr.l || r.tr.n} ${endOf(r, false)}${v && v.delay > 0 ? ` +${v.delay}` : ''}`);
  }

  // ---- the board of Správa železnic over the whole page: their page in a frame under a thin bar of ours with the name
  // of the station, the way to the same page in a new window (should they ever forbid frames, the frame stays empty)
  // and the cross. A <dialog> like the big pictures and the reader: Esc and the Back button close it (main.js closeTop,
  // histSync). Their page is asked for only now, after the press, and is let go again with the closing; its own
  // cookie window is theirs to show and the visitor's to close.
  function openFull(st, url) {
    let d = document.getElementById('vlFull');
    if (!d) {
      d = el('dialog', 'vl-full'); d.id = 'vlFull';
      const head = el('div', 'vl-fhead'), out = el('a', 'vl-fout', 'v novém okně ↗'), x = el('button', 'pbtn close', '×');
      out.target = '_blank'; out.rel = 'noopener';
      x.type = 'button'; x.setAttribute('aria-label', 'Zavřít'); x.onclick = () => d.close();
      head.append(el('b', 'vl-ftitle'), out, x);
      d.append(head);
      d.addEventListener('close', () => { const f = d.querySelector('iframe'); if (f) f.remove(); });
      document.body.append(d);
    }
    d.querySelector('.vl-ftitle').textContent = `Tabule Správy železnic · ${st.name}`;
    d.querySelector('.vl-fout').href = url;
    const old = d.querySelector('iframe'); if (old) old.remove();
    const f = el('iframe', 'vl-frame'); f.title = `Tabule Správy železnic: ${st.name}`; f.referrerPolicy = 'no-referrer';
    // (their own scripts and requests run, nothing of it can move our page away)
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
    f.src = url;
    d.append(f);
    if (!d.open) d.showModal();
    d.querySelector('.close').focus();
  }

  // ---- the board of a station (the body of its card): Odjezdy / Příjezdy, redrawn every 20 s while it is on the page
  function board(st) {
    const wrap = el('div', 'sec vlaky');
    const tabs = el('div', 'row2 vl-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Tabule');
    const bDep = el('button', 'pbtn small', 'Odjezdy'), bArr = el('button', 'pbtn small', 'Příjezdy');
    bDep.type = bArr.type = 'button';
    const clock = el('span', 'vl-clock');
    tabs.append(bDep, bArr, clock);
    const sz = el('button', 'vl-sz');
    const szUrl = () => `${SZ_BOARD}${st.sz}${arr ? '&Arr=1' : ''}`; // (their arrivals for our arrivals)
    if (st.sz) {
      sz.type = 'button'; sz.title = 'Otevře tabuli Správy železnic přes celou stránku (načte se z provoz.spravazeleznic.cz)';
      sz.append(el('span', '', 'Nástupiště:'), el('b', '', 'tabule Správy železnic'), el('i', '', '⤢'));
      sz.onclick = () => openFull(st, szUrl());
    } else sz.hidden = true;
    const table = el('table', 'vl-board'), more = el('button', 'pbtn small vl-more', 'Další vlaky');
    more.type = 'button';
    const note = el('p', 'livenote'), credit = el('span', 'credit');
    wrap.append(tabs, sz, table, more, note, credit);
    let arr = false, n = PAGE, timer = null;
    function draw() {
      const now = nowS();
      bDep.setAttribute('aria-pressed', String(!arr)); bArr.setAttribute('aria-pressed', String(arr));
      clock.textContent = hhmm(now);
      if (!fresh()) {
        table.replaceChildren(); more.hidden = true;
        note.textContent = D.error && !D.day ? 'Jízdní řád vlaků se nepodařilo načíst.' : 'Jízdní řád vlaků pro dnešek tu teď není (soubor je starší než dva dny).';
        credit.textContent = '';
        return;
      }
      const rows = rowsOf(st, arr, n + 1), today = Math.floor(now / 86400);
      more.hidden = rows.length <= n;
      const head = el('thead'), hr = el('tr');
      for (const [c, t] of [['vl-t', 'Čas'], ['vl-n', 'Vlak'], ['vl-to', arr ? 'Odkud' : 'Směr'], ...([])]) { const th = el('th', c, t); th.scope = 'col'; hr.append(th); }
      head.append(hr);
      const body = el('tbody');
      let anyLive = false, anyQuiet = false;
      for (const row of rows.slice(0, n)) {
        const tr = row.tr, v = liveOf(row, now), r = el('tr');
        const tm = el('td', 'vl-t');
        tm.append(el('b', '', hhmm(row.t)));
        if (Math.floor(row.t / 86400) > today) tm.append(el('i', 'vl-day', 'zítra'));
        if (v) { anyLive = true; tm.append(v.delay > 0 ? el('span', `vl-late${v.delay >= 10 ? ' much' : ''}`, `+${v.delay} min`) : el('span', 'vl-ok', 'včas')); } else anyQuiet = true;
        const tn = el('td', 'vl-n');
        if (tr.l) tn.append(el('span', `vl-line ${kindOf(tr)}`, tr.l));
        tn.append(el('span', `vl-no${tr.l ? '' : ` ${kindOf(tr)}`}`, tr.n));
        const sub = [tr.nm, D.carriers[tr.c] !== 'ČD' ? D.carriers[tr.c] : ''].filter(Boolean).join(' · ');
        if (sub) tn.append(el('small', '', sub));
        const to = el('td', 'vl-to');
        to.append(el('b', '', endOf(row, arr)));
        const vi = via(row, arr);
        if (vi) to.append(el('small', '', vi));
        r.append(tm, tn, to);
        body.append(r);
      }
      if (!rows.length) { const r = el('tr'), c = el('td', 'vl-none', arr ? 'V nejbližších dvou dnech sem podle jízdního řádu žádný vlak nepřijede.' : 'V nejbližších dvou dnech odtud podle jízdního řádu žádný vlak nejede.'); c.colSpan = 3 + (0); r.append(c); body.append(r); }
      table.replaceChildren(head, body);
      const liveNote = !LIVE ? 'Zpoždění tu teď neukazujeme.'
        : Date.now() - D.liveAt > LIVE_STALE_MS ? 'Zpoždění vlaků se teď nedaří načíst, časy jsou podle jízdního řádu.'
          : `Zpoždění hlásí vlaky, které jsou právě na cestě v síti IDS JMK (linky S a R)${anyQuiet && anyLive ? '; u ostatních je jen čas podle jízdního řádu' : !anyLive ? '; žádný z těchto vlaků ho teď nehlásí, časy jsou podle jízdního řádu' : ''}.`;
      note.textContent = `${liveNote} U mezinárodních vlaků je jako cíl poslední stanice, kterou zná český jízdní řád.`;
      credit.textContent = `Jízdní řád: ${D.source || 'CIS JŘ'}. Zpoždění: KORDIS JMK, otevřená data města Brna (data.brno.cz).`;
    }
    const tick = async () => {
      if (!wrap.isConnected) { clearInterval(timer); timer = null; return; }
      if (document.hidden) return;
      await fetchLive();
      if (wrap.isConnected) draw();
    };
    bDep.onclick = () => { arr = false; n = PAGE; draw(); };
    bArr.onclick = () => { arr = true; n = PAGE; draw(); };
    more.onclick = () => { n += PAGE; draw(); };
    draw();
    // (the caller puts the board on the page; from then on it keeps itself fresh and stops when the card closes)
    const start = () => { if (!timer) { timer = setInterval(tick, POLL_MS); fetchLive().then(() => { if (wrap.isConnected) draw(); }); } };
    return { el: wrap, start, mode: a => { arr = !!a; n = PAGE; draw(); } };
  }

  // ---- the signs on the map
  function positions() {
    const key = `${llToImg(16.6, 49.2).join(',')}|${D.stations.length}|${D.updated}`;
    if (key === posKey) return;
    posKey = key;
    for (const s of D.stations) [s.X, s.Y] = llToImg(s.lon, s.lat);
    order = [...D.stations].sort((a, b) => a.Y - b.Y); // (from the back to the front, once: not in every frame)
  }
  // s: 2 the usual size, 3 zoomed in
  function sign(ctx, x, y, s) {
    const r = s === 3 ? 14 : 9, top = y - 2 * r - 6, g = s === 3 ? 3 : 2;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - r + 2, top + 4, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = INK; ctx.fillRect(x - r - 3, top, 2 * r + 6, 2 * r + 6); ctx.fillRect(x - 1, y - 3, 2, 5);
    ctx.fillStyle = CREAM; ctx.fillRect(x - r - 1, top + 2, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = NAVY; ctx.fillRect(x - r, top + 3, 2 * r, 2 * r);
    ctx.fillStyle = CREAM;
    const ox = x - Math.round(3.5 * g), oy = top + 3 + r - Math.round(3.5 * g);
    TRAIN.forEach((row, j) => { for (let i = 0; i < 7; i++) if (row[i] === '#') ctx.fillRect(ox + i * g, oy + j * g, g, g); });
    return { box: [x - r - 3, top - 1, x + r + 3, y + 2], top };
  }
  // the label: the name of the station, under it the next departure; y is its bottom edge
  function label(ctx, x, y, st, f = 1) {
    const main = st.short.toUpperCase(), sub = nextOf(st) || '';
    const fs = Math.round(17 * f), ss = Math.round(13 * f);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `400 ${fs}px "VT323", monospace`; const w1 = ctx.measureText(main).width;
    ctx.font = `400 ${ss}px "VT323", monospace`; const w2 = sub ? ctx.measureText(sub).width : 0;
    const w = Math.ceil(Math.max(w1, w2)) + 10, h1 = Math.round(fs * 0.95), h2 = sub ? Math.round(ss * 0.95) : 0;
    const x0 = Math.round(x - w / 2), y0 = y - h1 - h2 - 2;
    ctx.fillStyle = INK; ctx.fillRect(x0 - 1, y0 - 1, w + 2, h1 + h2 + 3);
    ctx.fillStyle = NAVY; ctx.fillRect(x0, y0, w, h1);
    if (sub) { ctx.fillStyle = '#2a3348'; ctx.fillRect(x0, y0 + h1, w, h2 + 1); }
    ctx.font = `400 ${fs}px "VT323", monospace`; ctx.fillStyle = CREAM; ctx.fillText(main, x, y0 + h1 / 2 + 1);
    if (sub) { ctx.font = `400 ${ss}px "VT323", monospace`; ctx.fillStyle = '#d6dbe6'; ctx.fillText(sub, x, y0 + h1 + h2 / 2 + 1); }
    return [x0 - 1, y0 - 1, x0 + w + 1, y];
  }
  let liveAsked = 0;
  function draw(ctx, v, hl = false) {
    hits = [];
    if (!loading) { load(); return; }
    if (!D.stations.length || (v.z < SHOW_Z && !hl)) return;
    positions();
    const m = v.k * A, names = m >= NAMES, s = m >= BIG ? 3 : 2, alpha = ctx.globalAlpha;
    // (the labels name the next departure with its delay: the trains on their way are asked for while the labels show)
    if (names && Date.now() - liveAsked > POLL_MS) { liveAsked = Date.now(); if (!document.hidden) fetchLive(); }
    for (const st of order) {
      const x = Math.round(v.ox + st.X * v.k), y = Math.round(v.oy + st.Y * v.k);
      if (!onScreen(ctx, x, y, 160)) continue;
      const w = s === 3 ? 18 : 12, hgt = s === 3 ? 40 : 30;
      if (ctx.__claim) ctx.__claim(x - w, y - hgt - (names ? 34 : 0), x + w, y + 2, true);
      ctx.globalAlpha = alpha;
      const sg = sign(ctx, x, y, s);
      hits.push([...sg.box, st]);
      if (names) hits.push([...label(ctx, x, sg.top - 4, st, s === 3 ? 1.15 : 1), st]);
    }
    ctx.globalAlpha = alpha;
  }
  const at = (sx, sy) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]) return h[4]; } return null; };
  // how many trains leave a station on the day of now (for the rows of its card)
  const counts = st => { const d0 = Math.floor(nowS() / 86400) * 86400, inDay = r => r.t >= d0 && r.t < d0 + 86400; return { dep: st.dep.filter(inDay).length, arr: st.arr.filter(inDay).length }; };
  return { load, draw, at, positions, board, counts, fresh, byId: id => D.stations.find(s => s.id === id) || null, data: D };
}

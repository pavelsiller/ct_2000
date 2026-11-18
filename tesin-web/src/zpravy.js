import { DATA_BASE, SAMPLE } from './feed.js';
import { shown } from './admin.js';
import { safeUrl } from './safe.js';
import './zpravy.css';

const POLL_MS = 60e3, STALE_MIN = 15, PAST_SHOWN = 4;
// the picture (12 × 12 pixels) and the colour of each source
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
  'k-nasili': ['#8fb4e8', 'M5 0h2v1H5zM1 1h1v1H1zM5 1h2v1H5zM10 1h1v1H10zM2 2h1v1H2zM4 2h4v1H4zM9 2h1v1H9zM3 3h6v1H3zM1 4h10v1H1zM0 5h12v1H0zM0 6h12v1H0zM1 7h10v1H1zM3 8h6v1H3zM2 9h1v1H2zM4 9h4v1H4zM9 9h1v1H9zM1 10h1v1H1zM5 10h2v1H5zM10 10h1v1H10zM5 11h2v1H5z'],
  'k-kradez': ['#8fb4e8', 'M4 1h4v1H4zM3 2h1v1H3zM8 2h1v1H8zM3 3h1v1H3zM8 3h1v1H8zM1 4h10v1H1zM1 5h10v1H1zM1 6h4v1H1zM7 6h4v1H7zM1 7h10v1H1zM1 8h10v1H1zM1 9h10v1H1zM2 10h8v1H2z'],
  'k-vandal': ['#8fb4e8', 'M8 0h1v1H8zM10 0h1v1H10zM4 1h2v1H4zM9 1h1v1H9zM4 2h2v1H4zM8 2h1v1H8zM10 2h1v1H10zM3 3h4v1H3zM2 4h6v1H2zM2 5h6v1H2zM2 6h1v1H2zM7 6h1v1H7zM2 7h1v1H2zM7 7h1v1H7zM2 8h6v1H2zM2 9h6v1H2zM2 10h6v1H2z'],
  'k-alkohol': ['#8fb4e8', 'M5 0h2v1H5zM5 1h2v1H5zM5 2h2v1H5zM4 3h4v1H4zM3 4h6v1H3zM3 5h6v1H3zM3 6h1v1H3zM8 6h1v1H8zM3 7h1v1H3zM8 7h1v1H8zM3 8h6v1H3zM3 9h6v1H3zM3 10h6v1H3z'],
  'k-patrani': ['#8fb4e8', 'M3 1h4v1H3zM2 2h2v1H2zM6 2h2v1H6zM1 3h2v1H1zM7 3h2v1H7zM1 4h1v1H1zM8 4h1v1H8zM1 5h1v1H1zM8 5h1v1H8zM1 6h2v1H1zM7 6h2v1H7zM2 7h2v1H2zM6 7h2v1H6zM3 8h6v1H3zM7 9h3v1H7zM8 10h3v1H8zM9 11h2v1H9z'],
  'k-jine': ['#8fb4e8', 'M2 1h8v1H2zM1 2h10v3H1zM2 5h8v1H2zM3 6h6v3H3zM4 9h4v1H4zM5 10h2v1H5z'], // (a badge)
  'k-doprava': ['#f5a04a', 'M3 2h6v1H3zM2 3h8v3H2zM1 6h10v3H1zM2 9h2v2H2zM8 9h2v2H8z'],
  'k-nehoda': ['#f08a3c', 'M5 0h2v2H5zM4 2h4v2H4zM3 4h6v2H3zM2 6h8v2H2zM1 8h10v3H1z'],
  'k-pozar': ['#ff7a5c', 'M5 0h2v2H5zM4 2h4v2H4zM3 4h7v5H3zM2 6h1v3H2zM4 9h5v2H4z'],
  'k-pomoc': ['#9fd8a0', 'M1 1h4v1H1zM7 1h4v1H7zM0 2h12v1H0zM0 3h12v1H0zM0 4h12v1H0zM1 5h10v1H1zM2 6h8v1H2zM3 7h6v1H3zM4 8h4v1H4zM5 9h2v1H5z'],
  'k-zvire': ['#9fd8a0', 'M3 1h2v1H3zM7 1h2v1H7zM3 2h2v1H3zM7 2h2v1H7zM1 4h2v1H1zM9 4h2v1H9zM1 5h2v1H1zM4 5h4v1H4zM9 5h2v1H9zM3 6h6v1H3zM2 7h8v1H2zM2 8h8v1H2zM2 9h3v1H2zM7 9h3v1H7z'],
  parkovani: ['#7fa8ff', 'M3 1h5v1H3zM3 2h2v9H3zM8 2h2v4H8zM5 6h4v1H5z'],
  vlaky: ['#a9c4ff', 'M3 1h6v1H3zM2 2h8v1H2zM2 3h1v2H2zM5 3h2v2H5zM9 3h1v2H9zM2 5h8v3H2zM2 8h1v1H2zM4 8h4v1H4zM9 8h1v1H9zM2 9h8v1H2zM3 10h2v1H3zM7 10h2v1H7z'],
};
const OTHER = ['#adb6c6', 'M5 2h2v5H5zM5 9h2v2H5z'];
const TIERS = [['now', 'Právě teď', 'živě, obnova každou minutu'], ['today', 'Dnes', 'platí do půlnoci'], ['past', 'Stalo se', 'dnes od půlnoci'], ['week', 'V příštích dnech', 'dny až týdny']];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const icon = (src, off) => { const [col, d] = SRC[src] || OTHER; return `<svg class="zi" width="28" height="28" viewBox="-2 -2 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="-2" y="-2" width="16" height="16" fill="${off ? '#384563' : col}"/><path d="${d}" fill="${off ? '#adb6c6' : '#141a26'}"/></svg>`; };
const hm = ms => new Date(ms).toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: 'numeric', minute: '2-digit' });
// how long a running thing has lasted: "6 min", "1,5 h"
const since = ms => { const m = Math.max(0, Math.round((Date.now() - ms) / 60e3)); return m < 1 ? 'teď' : m < 90 ? `${m} min` : `${(Math.round(m / 6) / 10).toLocaleString('cs-CZ')} h`; };

// the icon of a message (its kind m.ico, else its source) for the marker in the map (src/main.js zprPlace)
export const zprIcon = m => ((m.ico || m.src) in SRC ? icon(m.ico || m.src, false) : '');
export function createZpravy({ base = './' } = {}) {
  let D = null, loading = null, inFlight = null, pastAll = false, tab = 'dnes'; // (tab: 'dnes' today, 'pak' the coming days)
  let longOpen = false; // (MHD dnes jinak: the lines whose closure has lasted longer than a week are unfolded)
  const subs = [];
  const urls = () => [DATA_BASE ? `${DATA_BASE}/data/zpravy.json?m=${Math.floor(Date.now() / 60e3)}` : '', `${base}data/zpravy.json`].filter(Boolean);
  const stale = () => !D || (!SAMPLE && Date.now() - D.t > STALE_MIN * 60e3);
  const tell = () => { for (const f of subs) { try { f(D); } catch { /* one listener must not stop the others */ } } };
  // (one request at a time, each at most 15 s: a hanging connection must not pile up a request every minute)
  function fetchNow() { return (inFlight ||= fetchOnce().finally(() => { inFlight = null; })); }
  async function fetchOnce() {
    for (const u of urls()) {
      try {
        const r = await fetch(u, { cache: 'no-cache', signal: AbortSignal.timeout(15e3) });
        if (!r.ok) continue;
        const d = await r.json();
        if (!d || d.v !== 1 || !Array.isArray(d.msgs)) continue;
        if (!D || d.t > D.t) { D = d; tell(); } else if (stale()) tell();
        return D;
      } catch { /* the next address */ }
    }
    if (D && stale()) tell();
    return D;
  }
  function load() {
    if (!loading) {
      loading = fetchNow();
      setInterval(() => { if (!document.hidden) fetchNow(); }, POLL_MS);
      document.addEventListener('visibilitychange', () => { if (!document.hidden && (!D || Date.now() - D.t > 90e3)) fetchNow(); });
    }
    return loading;
  }

  // ---- the board: a dot (red and blinking while something is new), the running headlines, how many things run now
  function paintBoard(tile) {
    if (stale()) return;
    const run = D.run && D.run.length ? D.run : [D.lead ? D.lead.text : 'Dnes v Brně'];
    const text = run.join('   +++   ');
    const box = tile.querySelector('.zr'), n = tile.querySelector('.zn');
    if (box.dataset.text !== text) { // (the same text goes on running: a repaint every minute would start it from the edge again)
      box.dataset.text = text;
      const s = el('span', '', text);
      s.style.animationDuration = `${Math.max(12, Math.round(text.length * 0.17))}s`;
      box.replaceChildren(s);
    }
    const c = D.counts || {};
    n.replaceChildren(...(c.now ? [el('b', '', String(c.now)), el('span', '', ' teď')] : [])); // (a phone shows the number only)
    tile.classList.toggle('fresh', !!c.fresh);
    tile.title = `Dnes v Brně: ${c.now ? `${c.now} ${c.now === 1 ? 'věc se děje' : c.now < 5 ? 'věci se dějí' : 'věcí se děje'} právě teď` : 'co se děje ve městě'} (kliknutím seznam)`;
  }

  // ---- the lines of MHD that run differently today (on.linky(), put together in main.js from the closures valid
  // today): rows of line numbers, each a button that highlights its line in the map; under them what the chosen line
  // is about, and the notices about the whole network as lines of text. The rows of what has lasted longer than a
  // week (long) stand aside: folded behind a button that says how many lines they hold, until the list is closed.
  // L: { groups: [{ label, long, lines: [{ l, type, sel, pick() }] }], sel: { line, items: [{ text, open() }], off() }
  // | null, notes: [{ text, open() }] }; redraw(): the list again, where it was
  function linky(root, L, redraw) {
    const h = el('h3', 'zpr-h t-mhd'); h.append(el('span', '', 'MHD dnes jinak'), el('small', '', 'kliknutím se linka zvýrazní v mapě')); root.append(h);
    const box = el('div', 'zpr-linky');
    const row = g => {
      const r = el('div', 'zl-row'), chips = el('div', 'zl-chips');
      for (const x of g.lines) {
        const b = el('button', `lbtn t-${x.type}`, x.l); b.type = 'button'; b.setAttribute('aria-pressed', String(x.sel));
        b.title = x.sel ? `Linka ${x.l}: zrušit zvýraznění` : `Linka ${x.l}: zvýraznit v mapě`; b.onclick = x.pick;
        chips.append(b);
      }
      r.append(el('span', 'zl-lab', g.label), chips);
      return r;
    };
    const fresh = L.groups.filter(g => !g.long), long = L.groups.filter(g => g.long);
    for (const g of fresh) box.append(row(g));
    if (long.length) {
      const n = long.reduce((s, g) => s + g.lines.length, 0);
      const t = el('button', 'pbtn small zl-more', longOpen ? 'Dlouhodobé výluky: skrýt' : `Dlouhodobé výluky: ${n} ${n === 1 ? 'linka' : n < 5 ? 'linky' : 'linek'}`);
      t.type = 'button'; t.setAttribute('aria-expanded', String(longOpen)); t.title = 'Výluky, odklony a přesunuté zastávky, které trvají déle než týden';
      t.onclick = () => { longOpen = !longOpen; redraw(); };
      box.append(t);
      if (longOpen) for (const g of long) box.append(row(g));
    }
    if (L.sel) {
      const s = el('div', 'zl-sel'); s.append(el('b', '', `Linka ${L.sel.line}`));
      for (const it of L.sel.items) { const b = el('button', 'zl-note', `${it.text} ›`); b.type = 'button'; b.onclick = it.open; s.append(b); }
      const x = el('button', 'pbtn small', 'Zrušit zvýraznění'); x.type = 'button'; x.setAttribute('aria-pressed', 'true'); x.onclick = L.sel.off; s.append(x);
      box.append(s);
    }
    for (const n of L.notes) { const b = el('button', 'zl-note', `${n.text} ›`); b.type = 'button'; b.onclick = n.open; box.append(b); }
    root.append(box);
  }

  // ---- the list. on: { open(m) a click on a message, focus() the kind highlighted now, unfocus(), more: [[label, fn], …]
  // (the buttons under the list), extra(m) -> [[label, fn | url], …] (the buttons of the chosen message), linky() the
  // lines of MHD that run differently today (see above) or null }
  function render(root, on) {
    // (the two tabs stand in the heading of the list, beside ×, in place of a title: #zprTabs)
    const tabs = document.getElementById('zprTabs');
    root.replaceChildren(); tabs.replaceChildren();
    if (stale()) { root.append(el('p', 'zpr-none', 'Zprávy teď nejsou k dispozici.')); return; }
    // two tabs: today (what lasts now, what the day brings, what has happened) and the coming days
    const nPak = D.msgs.filter(m => m.tier === 'week').length;
    for (const [k, label] of [['dnes', 'Dnes v Brně'], ['pak', `Chystá se${nPak ? ` (${nPak})` : ''}`]]) { const b = el('button', 'pbtn small', label); b.type = 'button'; b.setAttribute('aria-pressed', String(tab === k)); b.onclick = () => { if (tab !== k) { tab = k; render(root, on); root.scrollTop = 0; } }; tabs.append(b); }
    if (tab === 'dnes' && D.lead) { const p = el('p', 'zpr-lead'); p.append(el('b', '', D.lead.day), ` ${D.lead.text}`); root.append(p); }
    const f = on.focus();
    for (const [tier, name, note] of TIERS) {
      if ((tier === 'week') !== (tab === 'pak')) continue;
      if (tier === 'today') { const L = on.linky ? on.linky() : null; if (L) linky(root, L, () => { const top = root.scrollTop; render(root, on); root.scrollTop = top; }); } // (between what runs now and what the day brings)
      const all = D.msgs.filter(m => m.tier === tier);
      // (quiet: worth a look but not counted on the board, e.g. zhoršené ovzduší, common in winter; listed apart under
      // "Také" so the list and the number "N teď" agree, audit 2026-11-15)
      const l = all.filter(m => !m.quiet), quiet = all.filter(m => m.quiet);
      if (!all.length && tier !== 'now') continue;
      const h = el('h3', `zpr-h t-${tier}`); h.append(el('span', '', name), el('small', '', note)); root.append(h);
      if (!l.length && tier === 'now') root.append(el('p', 'zpr-none', 'Právě teď je ve městě klid.'));
      for (const [list, quietList] of [[l, false], [quiet, true]]) {
        if (!list.length) continue;
        if (quietList) root.append(el('p', 'zpr-also', 'Také, méně naléhavé:'));
        const ol = el('ol', `zpr-list${quietList ? ' zpr-quiet' : ''}`);
        // (Stalo se: the latest few; the rest behind a button, open until the list is closed)
        const shownN = tier === 'past' && !pastAll && list.length > PAST_SHOWN + 1 ? PAST_SHOWN : list.length;
        for (const m of list.slice(0, shownN)) {
          const sel = !!m.focus && m.focus === f, li = el('li', `s-${m.st}${sel ? ' on' : ''}`), b = el('button'); b.type = 'button';
          const txt = el('span', 'zt'); txt.append(el('b', '', m.title)); if (m.sub) txt.append(el('small', '', m.sub));
          const meta = m.st === 'end' ? hm(m.end) : m.meta || (tier === 'now' && m.t ? since(m.t) : '');
          b.insertAdjacentHTML('beforeend', icon(m.ico || m.src, m.st === 'end'));
          b.append(txt, el('span', 'zm', m.st === 'new' ? 'NOVÉ' : meta));
          b.onclick = () => on.open(m);
          li.append(b);
          if (sel) {
            const btns = el('div', 'btns'), x = el('button', 'pbtn small', 'Zrušit zvýraznění'); x.type = 'button'; x.setAttribute('aria-pressed', 'true'); x.onclick = () => on.unfocus();
            btns.append(x);
            for (const [label, act] of on.extra(m)) {
              if (typeof act === 'string') { const a = el('a', 'pbtn small', label); a.href = safeUrl(act); a.target = '_blank'; a.rel = 'noopener'; btns.append(a); } else { const e = el('button', 'pbtn small', label); e.type = 'button'; e.onclick = act; btns.append(e); }
            }
            li.append(btns);
          }
          ol.append(li);
        }
        root.append(ol);
        if (shownN < list.length) { const b = el('button', 'pbtn small zpr-rest', `Dalších ${list.length - shownN}`); b.type = 'button'; b.onclick = () => { pastAll = true; render(root, on); }; root.append(b); }
      }
    }
    const more = el('div', 'zpr-more');
    for (const [label, fn] of on.more) { const b = el('button', 'pbtn small', label); b.type = 'button'; b.onclick = fn; more.append(b); }
    // the whole overview of the city, Brno teď (prehled.html; only where its part "prehled" is public): the news are its first part
    if (shown('prehled')) { const a = el('a', 'pbtn small', 'Brno teď'); a.href = './prehled.html'; a.title = 'Brno teď: zpravodajský přehled toho, co se v Brně děje, s čísly za dnešek a za týden'; more.append(a); }
    root.append(more, el('p', 'livenote', `Zprávy z dat v mapě, naposledy v ${hm(D.t)}. Kliknutím na zprávu se mapa přesune na místo nebo zvýrazní, čeho se zpráva týká.`));
  }
  return { load, render, paintBoard, stale, fold: () => { pastAll = false; longOpen = false; tab = 'dnes'; }, refresh: fetchNow, onUpdate: f => subs.push(f), data: () => D };
}

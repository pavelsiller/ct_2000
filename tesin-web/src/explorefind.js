import { words, stem, rec, level, decide, paneField } from './panefind.js';

const plural = n => (n === 1 ? 'položka' : n >= 2 && n <= 4 ? 'položky' : 'položek');

export function createExploreFind({ track = () => {}, isPhone = () => false, fill = () => {} } = {}) {
  const pane = document.getElementById('pane-explore'), q = document.getElementById('efQ'), x = document.getElementById('efX'), info = document.getElementById('efInfo');
  const secs = [...pane.querySelectorAll('details.exsec')];
  const recs = new WeakMap(); // <li> → what it is compared by (made once a row)
  let active = false, was = new Map(), found = 0, settle = 0;

  function record(li, sec, secName) {
    let r = recs.get(li);
    if (r) return r;
    const b = li.querySelector('button'), stops = li.dataset.stops ? li.dataset.stops.split('\n') : [];
    r = Object.assign(rec((b.querySelector('span') || b).textContent, li.dataset.k, `${li.dataset.t || ''} ${stops.join(' ')}`, secName),
      { li, sec, t: li.dataset.t || '', stops: stops.map(n => ({ n, w: words(n) })), show: true });
    recs.set(li, r);
    return r;
  }
  // (read afresh each time: the projects come when their file does, the routes with the data of the city)
  function rowsNow() {
    const rows = [];
    for (const sec of secs) {
      const secName = (sec.querySelector(':scope > summary > span') || {}).textContent || '';
      for (const li of sec.querySelectorAll('.places > li')) rows.push(record(li, sec, secName));
    }
    return rows;
  }
  // the line under a row found: the stops of a route that answer one of the words, otherwise the text of the row
  function hintOf(r, ws) {
    if (r.stops.length) {
      const hit = r.stops.filter(s => ws.some(w => w.length >= 3 && s.w.some(h => h.startsWith(stem(w)))));
      const more = hit.length - 4;
      if (hit.length) return `Zastávky: ${hit.slice(0, 4).map(s => s.n).join(', ')}${more > 0 ? ` a ${more} ${more < 5 ? 'další' : 'dalších'}` : ''}`;
    }
    // (a long text: from the sentence that has the word, the line shows two lines of it)
    const sent = r.t.match(/[^.!?]+[.!?]*\s*/g) || [];
    const i = sent.findIndex(x => { const xw = words(x); return ws.some(w => w.length >= 4 && xw.some(h => h.startsWith(w.length >= 5 ? w.slice(0, -1) : w))); });
    return i > 0 ? `… ${sent.slice(i).join('').trim()}` : r.t;
  }

  function enter() {
    active = true;
    clearTimeout(settle); pane.classList.remove('lf-settling');
    fill(); // (the projects, if their list has not been opened yet)
    was = new Map(secs.map(s => [s, { open: s.open, name: s.getAttribute('name') }]));
    pane.classList.add('finding'); // (first: the lists opened below are no openings to count, main.js)
    for (const s of secs) s.removeAttribute('name'); // (one open at a time: not while the rows found may be in all three)
  }
  function leave() {
    if (!active) return;
    active = false;
    for (const e of pane.querySelectorAll('.lf-hint')) e.remove();
    for (const e of pane.querySelectorAll('.lf-out')) e.classList.remove('lf-out');
    for (const [s, w] of was) s.open = w.open;
    for (const [s, w] of was) if (w.name) s.setAttribute('name', w.name);
    pane.classList.remove('finding', 'lf-few');
    // (the lists going back to how they were tell of it a moment later: still nothing to count)
    pane.classList.add('lf-settling'); settle = setTimeout(() => pane.classList.remove('lf-settling'), 400);
    info.hidden = true; info.textContent = '';
  }
  function apply() {
    const ws = words(q.value), on = ws.length > 0;
    x.hidden = !on;
    if (!on) { leave(); return; }
    if (!active) enter();
    const rows = rowsNow();
    for (const r of rows) r.lv = level(r, ws);
    const n = decide(rows);
    for (const r of rows) {
      r.li.classList.toggle('lf-out', !r.show);
      let h = r.li.querySelector(':scope > .lf-hint');
      const txt = r.show ? hintOf(r, ws) : '';
      if (!txt) { if (h) h.remove(); continue; }
      if (!h) { h = document.createElement('p'); h.className = 'lhint lf-hint'; h.onclick = () => h.classList.toggle('open'); r.li.append(h); }
      if (h.textContent !== txt) h.textContent = txt;
    }
    for (const sec of secs) {
      const any = rows.some(r => r.sec === sec && r.show);
      sec.classList.toggle('lf-out', !any);
      if (any) sec.open = true;
    }
    pane.classList.toggle('lf-few', n <= 3); // (a few rows: their lines whole, otherwise two lines and a tap for the rest)
    found = n;
    info.hidden = false;
    info.textContent = n ? `Nalezeno: ${n} ${plural(n)} · křížek vrátí celý seznam` : 'Nic nenalezeno. Zkuste jiné slovo, třeba „kostel“, „vila“ nebo „nádraží“.';
  }
  function clear() {
    if (!q.value) return;
    q.value = '';
    apply();
  }

  q.addEventListener('input', apply);
  // (once the field is left, not every letter: as the other searches)
  q.addEventListener('change', () => { if (q.value.trim()) track('Hledání', { dotaz: q.value.trim().toLowerCase(), kde: 'objevuj', vysledek: found ? 'nalezeno' : 'nic' }); });
  paneField({ pane, q, x, isPhone, isOn: () => !!q.value, clear });
  // a list filled while the search is on (the projects): its rows are looked through too
  const mo = new MutationObserver(() => { if (active) apply(); });
  for (const ul of pane.querySelectorAll('.exsec > .places')) mo.observe(ul, { childList: true });

  apply(); // (what was typed before the module came)
  return { clear, get active() { return active; } };
}

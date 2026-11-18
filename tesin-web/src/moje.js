import { pxIcon } from './quick.js';
import { paneField } from './panefind.js';

const LS = 'b2k-moje', OFF_SS = 'b2k-spoj-off';
const LS_SEEN = 'b2k-hledane', SEEN_MAX = 8; // (what was searched for lately, see "seen" below)
const GONE_KEEP = 90 * 864e5;
const KNOWN = new Set(['misto', 'zastavka', 'spoj', 'pohled', 'cesta']);
const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const TAG_MAX = 24, TAG_HINTS = ['Domů', 'Práce', 'Škola']; // (offered until the visitor has three tags of their own)
const FIND_FROM = 5; // (the search of the list comes with the fifth thing kept: for two rows it would only be in the way)
const CS = new Intl.Collator('cs');
const KIND = { dum: 'dům', hledani: 'adresa', projekt: 'stavba', cobude: 'stavba', staveniste: 'stavba', demolice: 'stavba', pamatka: 'památka', kamen: 'kámen zmizelých', akce: 'akce', paro: 'návrh' };

const uid = () => { try { const a = crypto.getRandomValues(new Uint32Array(2)); return (a[0].toString(36) + a[1].toString(36)).slice(0, 10); } catch { return Math.random().toString(36).slice(2, 12); } };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hm = min => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const hmField = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; // (<input type="time">)
const toMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
const hmSec = sec => hm(Math.floor((((sec % 86400) + 86400) % 86400) / 60));

/** '1111100' -> 'Po–Pá', '1010000' -> 'Po, St', '1111111' -> 'každý den'. */
export function daysText(d) {
  if (d === '1111111') return 'každý den';
  const out = [];
  for (let i = 0; i < 7; i++) {
    if (d[i] !== '1') continue;
    let j = i;
    while (j + 1 < 7 && d[j + 1] === '1') j++;
    out.push(j - i >= 2 ? `${DAYS[i]}–${DAYS[j]}` : j > i ? `${DAYS[i]}, ${DAYS[j]}` : DAYS[i]);
    i = j;
  }
  return out.join(', ') || 'žádný den';
}

// ------------------------------------------------------------------ the record in this browser
function createStore() {
  let doc = { v: 1, items: [] };
  const subs = new Set();
  const read = () => { try { const d = JSON.parse(localStorage.getItem(LS) || 'null'); if (d && Array.isArray(d.items)) doc = d; } catch { /* private mode, a broken record */ } };
  const told = () => { for (const f of subs) f(); };
  const write = () => {
    const now = Date.now();
    doc.items = doc.items.filter(i => !(i.x && now - (i.t || 0) > GONE_KEEP));
    try { localStorage.setItem(LS, JSON.stringify(doc)); } catch { /* private mode: kept for this visit only */ }
    told();
  };
  read();
  addEventListener('storage', e => { if (e.key === LS) { read(); told(); } }); // (changed in another tab of the map)
  const live = () => doc.items.filter(i => !i.x && KNOWN.has(i.typ));
  return {
    all: live,
    of: typ => live().filter(i => i.typ === typ),
    get: id => live().find(i => i.id === id) || null,
    add(item) { const it = { id: uid(), ...item, t: Date.now() }; doc.items.push(it); write(); return it; },
    // (back after "Vrátit": the very same thing under its id)
    put(item) { const it = { ...item, t: Date.now() }; delete it.x; const i = doc.items.findIndex(x => x.id === item.id); if (i >= 0) doc.items[i] = it; else doc.items.push(it); write(); return it; },
    update(id, patch) { const it = doc.items.find(x => x.id === id && !x.x); if (!it) return null; Object.assign(it, patch, { t: Date.now() }); write(); return it; },
    remove(id) { const i = doc.items.findIndex(x => x.id === id); if (i >= 0) { doc.items[i] = { id, x: 1, t: Date.now() }; write(); } },
    on: f => subs.add(f),
  };
}

/**
 * d: { $, el, toast, track, layers, flyTo, fitPair(a, b), openPlace(slug), openPoint(lat, lon), openStop(num),
 *      viewHash(), viewName(), openView(hash), openTrip(link),
 *      startRide(m), riding(), showMhd(), openMenu(), closeMenu(), cardOpen(), isPhone(),
 *      changed() (what is kept or what was searched for lately has changed) }
 */
export function createMoje(d) {
  const { $, el, toast, track, layers } = d;
  const mhd = layers.mhd;
  const store = createStore();
  const box = $('spojBox');
  const say = what => track('Nástroj', { nastroj: 'moje', hodnota: what });
  const saySpoj = what => track('Nástroj', { nastroj: 'muj-spoj', hodnota: what });

  // the time a kept journey carries in its link: "&p=0745" arriving by, "&o=0710" leaving at
  const tripWhen = h => { const t = /&([op])=(\d{3,4})/.exec(h || ''); if (!t) return ''; const v = t[2].padStart(4, '0'); return ` · ${t[1] === 'p' ? 'příjezd do' : 'odjezd v'} ${+v.slice(0, 2)}:${v.slice(2)}`; };
  const label = it => (it.typ === 'spoj' ? `${it.an} → ${it.bn}` : it.n);
  const sub = it => (it.typ === 'spoj' ? `${daysText(it.dny)} ${hm(it.od)}–${hm(it.do)}` : it.typ === 'zastavka' ? 'zastávka' : it.typ === 'pohled' ? 'pohled s vrstvami' : it.typ === 'cesta' ? `spojení MHD${tripWhen(it.h)}` : KIND[it.kind] || 'místo');
  const sorted = () => store.all().sort((a, b) => (b.typ === 'spoj') - (a.typ === 'spoj') || (b.t || 0) - (a.t || 0));
  // the kept thing a card stands for: by its link, the number of its stop, or its point (a metre or two apart)
  const find = r => store.all().find(i => (r.j != null ? i.typ === 'cesta' && i.h === r.j : r.s != null ? i.typ === 'zastavka' && i.s === r.s : r.m != null ? i.m === r.m : !!r.k && !!i.k && Math.abs(i.k[0] - r.k[0]) < 2e-5 && Math.abs(i.k[1] - r.k[1]) < 3e-5)) || null;

  // the first thing kept: the browser is asked not to throw the record away when it tidies up (Firefox would ask the
  // visitor with a window of its own, so not there)
  const holdOn = () => { if (navigator.storage && navigator.storage.persist && !/Firefox/.test(navigator.userAgent)) navigator.storage.persist().catch(() => {}); };
  function keep(r) {
    const first = !store.all().length;
    const it = store.add(r.j != null ? { typ: 'cesta', n: r.n, h: r.j } : r.s != null ? { typ: 'zastavka', n: r.n, s: r.s } : { typ: 'misto', n: r.n, kind: r.kind || '', ...(r.m != null ? { m: r.m } : { k: r.k }) });
    say(`ulozit-${it.typ}`);
    // (the first time with where it went: the tab Moje, which the message can open)
    if (first) toast('Uloženo do Moje: najdete to v nabídce pod ikonou postavy a v hledání. Zůstává jen v tomto prohlížeči.', 8000, ['Ukázat', () => d.openMenu()]);
    else toast('Uloženo do Moje');
    if (first) holdOn();
    return it;
  }
  function drop(it) {
    store.remove(it.id);
    say('odebrat');
    if (S.item && S.item.id === it.id) hide();
    toast(`Odebráno z Moje: ${label(it)}`, 6000, ['Vrátit', () => store.put(it)]);
  }

  // ---------------------------------------------------------------- the star in the head of a card
  /** r: { n, kind, m } | { n, kind, k: [lat, lon] } | { n, s } | { n, j } (a journey of Spojení: its link without the time) */
  function star(r) {
    const b = el('button', 'pbtn fav-btn'); b.type = 'button';
    b.innerHTML = pxIcon('star');
    b.paint = () => { const on = !!find(r); b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Uloženo v Moje (dalším kliknutím odeberete)' : 'Uložit do Moje'; b.setAttribute('aria-label', b.title); };
    b.onclick = () => { const it = find(r); if (it) drop(it); else keep(r); b.paint(); };
    b.paint();
    return b;
  }

  function open(it) {
    if (it.typ === 'spoj') { d.closeMenu(); watch(it, true, 'seznam'); return; }
    say(`otevrit-${it.typ}`);
    if (it.typ === 'zastavka') { d.openStop(it.s); return; }
    if (it.typ === 'pohled') { d.closeMenu(); d.openView(it.h); return; }
    if (it.typ === 'cesta') { d.openTrip(it.h); return; } // (Spojení opens with its ends and searches from now)
    if (it.m != null) d.openPlace(it.m); else if (it.k) d.openPoint(it.k[0], it.k[1]);
  }
  const seen = {
    all() { try { const a = JSON.parse(localStorage.getItem(LS_SEEN) || '[]'); return Array.isArray(a) ? a.filter(r => r && typeof r.n === 'string') : []; } catch { return []; } },
    add(r) { try { localStorage.setItem(LS_SEEN, JSON.stringify([{ ...r, t: Date.now() }, ...this.all().filter(x => !(x.n === r.n && x.k === r.k))].slice(0, SEEN_MAX))); } catch { /* private mode */ } if (d.changed) d.changed(); },
    clear() { try { localStorage.removeItem(LS_SEEN); } catch { /* private mode */ } if (d.changed) d.changed(); },
  };
  /**
   * What the search offers while its field is empty: two lists, the things kept (moje: the thing) and what was
   * searched for lately (again: its record; not what is kept anyway). The first row of a list carries its heading
   * (head), that of the second also what "Smazat" does (clear).
   */
  function suggest() {
    const kept = sorted().slice(0, 5).map(it => ({ n: label(it), k: sub(it), moje: it }));
    const names = new Set(store.all().map(it => norm(label(it))));
    const late = seen.all().filter(r => !names.has(norm(r.n))).slice(0, 5).map(r => ({ n: r.n, k: r.k || '', again: r }));
    if (kept.length) kept[0].head = 'Uložené';
    if (late.length) { late[0].head = 'Naposledy hledané'; late[0].clear = () => { seen.clear(); say('naposledy-smazat'); }; }
    return [...kept, ...late];
  }

  const tidyTag = s => String(s || '').replace(/[\s#]+/g, ' ').trim().slice(0, TAG_MAX);
  const tagsOf = it => (Array.isArray(it.tg) ? it.tg.filter(t => typeof t === 'string' && t) : []);
  function allTags() {
    const m = new Map();
    for (const it of store.all()) for (const t of tagsOf(it)) if (!m.has(norm(t))) m.set(norm(t), t);
    return [...m.values()].sort(CS.compare);
  }
  // (several at once: what was typed with commas, "výlety, hrady")
  function setTag(it, tag, on) {
    let next = tagsOf(store.get(it.id) || it);
    for (const one of [].concat(tag)) {
      const k = norm(one);
      next = next.filter(t => norm(t) !== k);
      if (on) next.push(allTags().find(t => norm(t) === k) || one); // (written as on the other things that have it)
    }
    store.update(it.id, { tg: next.length ? next : undefined });
  }
  // the tags of one thing, under its row (the "#" of the row): those in use to switch on and off, a field for a new one
  function tagEditor(it) {
    const box = el('div', 'mj-tags');
    const mine = new Set(tagsOf(it).map(norm)), known = allTags();
    const hints = known.length < 3 ? TAG_HINTS.filter(h => !known.some(t => norm(t) === norm(h))) : [];
    for (const t of [...known, ...hints]) {
      const on = mine.has(norm(t));
      const c = el('button', 'pbtn small', t); c.type = 'button'; c.setAttribute('aria-pressed', String(on));
      c.onclick = () => { say(on ? 'stitek-odebrat' : 'stitek'); setTag(it, t, !on); };
      box.append(c);
    }
    const f = el('input', 'mj-tagnew'); f.type = 'text'; f.placeholder = 'Nový štítek'; f.maxLength = TAG_MAX; f.autocomplete = 'off'; f.enterKeyHint = 'done';
    f.setAttribute('aria-label', `Nový štítek pro: ${label(it)}`);
    const add = () => { const ts = f.value.split(',').map(tidyTag).filter(Boolean); if (!ts.length) return false; say('stitek-novy'); setTag(it, ts, true); return true; };
    // Enter adds the tag typed and the field stays for the next one; Hotovo (and Esc) puts the tags away
    f.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); S.tagFocus = true; if (!add()) S.tagFocus = false; } else if (e.key === 'Escape') { e.stopPropagation(); S.tagging = null; renderList(); } };
    const ok = el('button', 'pbtn small', 'Hotovo'); ok.type = 'button';
    ok.onclick = () => { S.tagging = null; if (!add()) renderList(); };
    box.append(f, ok);
    return box;
  }

  // ---------------------------------------------------------------- the list in the tab Moje
  const F = { q: '' }; // (what the field of the list asks for)
  const hit = (it, ws) => { const hay = norm(`${label(it)} ${sub(it)} ${tagsOf(it).join(' ')}`); return ws.every(w => hay.includes(w)); };
  function row(it, withTags = false) {
    const li = el('li'); li.dataset.id = it.id;
    const b = el('button', 'mj-open'); b.type = 'button';
    b.innerHTML = pxIcon(it.typ === 'misto' ? 'star' : it.typ === 'pohled' ? 'layers' : it.typ === 'cesta' ? 'ticket' : 'tram');
    const name = el('span', 'mj-n', label(it));
    const tags = tagsOf(it);
    // (found by the search the rows stand in one list: each says its tags itself)
    b.append(name, el('small', '', `${sub(it)}${withTags && tags.length ? ` · ${tags.join(', ')}` : ''}`));
    b.onclick = () => open(it);
    const tb = el('button', `mj-btn mj-tagbtn${tags.length ? ' on' : ''}`, '#'); tb.type = 'button';
    tb.title = tags.length ? `Štítky: ${tags.join(', ')}` : 'Přidat štítek'; tb.setAttribute('aria-label', `${tb.title} (${label(it)})`);
    tb.setAttribute('aria-expanded', String(S.tagging === it.id));
    tb.onclick = () => { S.tagging = S.tagging === it.id ? null : it.id; renderList(); };
    const ed = el('button', 'mj-btn', '✎'); ed.type = 'button';
    ed.title = it.typ === 'spoj' ? 'Upravit čas a dny' : 'Přejmenovat'; ed.setAttribute('aria-label', ed.title);
    li.edit = ed.onclick = () => {
      if (it.typ === 'spoj') { S.edit = it.id; S.editAt = Date.now(); d.openStop(it.a); return; }
      // the name turns into a field: Enter or leaving it keeps the new name, Esc the old one
      const f = el('input', 'mj-name'); f.type = 'text'; f.value = it.n; f.maxLength = 60; f.setAttribute('aria-label', 'Název');
      let done = false;
      const end = ok => { if (done) return; done = true; const v = f.value.trim(); if (ok && v && v !== it.n) { store.update(it.id, { n: v }); say('prejmenovat'); } else renderList(); };
      f.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); end(true); } else if (e.key === 'Escape') { e.stopPropagation(); end(false); } };
      f.onblur = () => end(true);
      b.replaceWith(f); f.focus(); f.select();
    };
    const del = el('button', 'mj-btn', '×'); del.type = 'button'; del.title = 'Odebrat'; del.setAttribute('aria-label', `Odebrat: ${label(it)}`);
    del.onclick = () => drop(it);
    li.append(b, tb, ed, del);
    // (its tags open: once, under its first row, though it may stand in several blocks)
    if (S.tagging === it.id && !S.tagShown) { S.tagShown = true; li.append(tagEditor(it)); }
    return li;
  }
  function renderList() {
    const host = $('mojeList');
    if (!host) return;
    const items = sorted(), ws = norm(F.q).split(/\s+/).filter(Boolean), finding = ws.length > 0;
    if (S.tagging && !items.some(i => i.id === S.tagging)) S.tagging = null; // (removed meanwhile)
    S.tagShown = false;
    const list = (arr, withTags) => { const ul = el('ul', 'moje-list'); ul.append(...arr.map(it => row(it, withTags))); return ul; };
    const tags = finding ? [] : allTags();
    let found = items;
    if (finding) { found = items.filter(it => hit(it, ws)); host.replaceChildren(list(found, true)); }
    else if (!tags.length) host.replaceChildren(list(items, false));
    else {
      // the blocks: a tag and its things, the tags by the alphabet; then what has no tag
      const groups = tags.map(t => [t, items.filter(it => tagsOf(it).some(x => norm(x) === norm(t)))]);
      const rest = items.filter(it => !tagsOf(it).length);
      if (rest.length) groups.push([null, rest]);
      host.replaceChildren(...groups.map(([t, arr]) => {
        const key = t == null ? '' : norm(t), dt = el('details', 'mj-group');
        // (shut blocks stay shut for this visit; the block of the thing whose tags are open opens)
        dt.open = !S.shut.has(key) || (!!S.tagging && !S.tagShown && arr.some(i => i.id === S.tagging)) || (!!S.rename && arr.some(i => i.id === S.rename));
        const sm = el('summary'); sm.append(t == null ? 'Bez štítku' : t, el('small', '', ` ${arr.length}`));
        dt.append(sm, list(arr, false));
        dt.addEventListener('toggle', () => { if (dt.open) S.shut.delete(key); else S.shut.add(key); });
        return dt;
      }));
    }
    $('mojeEmpty').hidden = !!items.length;
    if ($('mjFind')) {
      $('mjFind').hidden = items.length < FIND_FROM && !finding;
      $('mjX').hidden = !finding;
      $('pane-moje').classList.toggle('finding', finding);
      $('mjInfo').hidden = !(finding && !found.length);
      $('mjInfo').textContent = finding && !found.length ? 'Nic takového mezi uloženými není. Hledám v názvech, druzích a štítcích.' : '';
    }
    // (a view just kept: its name is offered for a change at once)
    const li = S.rename && [...host.querySelectorAll('li')].find(x => x.dataset.id === S.rename);
    S.rename = null;
    if (li) li.edit();
    // (the tags of a thing open: in sight also after the thing has moved to another block; the field again after Enter)
    const ed = host.querySelector('.mj-tags');
    if (ed) { if (ed.scrollIntoView) ed.scrollIntoView({ block: 'nearest' }); if (S.tagFocus) ed.querySelector('.mj-tagnew').focus(); }
    S.tagFocus = false;
  }

  // ---------------------------------------------------------------- a new connection, in the card of a stop
  /** The line under the head of a stop's card: "+ Hlídat spoj odsud" and the connections already kept from here. */
  function spojEntry(st) {
    const wrap = el('div', 'spoj-new');
    const closed = () => {
      const b = el('button', 'pbtn small', '+ Hlídat spoj odsud'); b.type = 'button';
      b.title = 'V čase, kdy jezdíte, vám mapa sama ukáže, kde vaše šalina je a za kolik minut přijede';
      b.onclick = () => { saySpoj('formular'); wrap.replaceChildren(form(st, null, closed)); };
      wrap.replaceChildren(b, ...store.of('spoj').filter(i => i.a === +st.num).map(i => {
        const c = el('button', 'pbtn small', `▶ ${i.bn}`); c.type = 'button'; c.title = `Můj spoj ${i.an} → ${i.bn}: ukázat nejbližší odjezdy`;
        c.onclick = () => open(i);
        return c;
      }));
    };
    // ✎ in the list: the card of its stop opens with the form filled in (the card is built twice when the timetable
    // has to come first, so the wish holds for a few seconds, or until the form is closed)
    const mine = S.edit && Date.now() - S.editAt < 8000 ? store.get(S.edit) : null;
    if (mine && mine.a === +st.num) wrap.replaceChildren(form(st, mine, () => { S.edit = null; closed(); })); else closed();
    return wrap;
  }
  function form(st, item, done) {
    const f = el('form', 'spoj-form');
    f.noValidate = true;
    const now = mhd.now(), nowMin = Math.floor(now.sec / 60);
    // a new one: the hour around now (set up where and when one travels, it fits at once), the kind of day of today
    const v = item ? { b: item.b, bn: item.bn, od: item.od, do: item.do, dny: item.dny }
      : { b: null, bn: '', od: Math.max(0, Math.floor((nowMin - 10) / 5) * 5), do: Math.min(1439, Math.ceil((nowMin + 50) / 5) * 5), dny: now.wd <= 4 ? '1111100' : '0000011' };
    f.append(el('h3', '', item ? `Můj spoj ze zastávky ${st.name}` : `Hlídat spoj ze zastávky ${st.name}`));

    const q = el('input'); q.type = 'search'; q.placeholder = 'Cílová zastávka'; q.autocomplete = 'off'; q.value = v.bn; q.setAttribute('aria-label', 'Kam jedete');
    const to = el('label', 'sf-row'); to.append(el('span', '', 'Kam'), q);
    const list = el('ul', 'sf-list'), info = el('p', 'livenote');
    let reach = null;
    const preview = () => {
      if (!v.b || !mhd.ready()) { info.textContent = v.b ? '' : 'Vyberte zastávku, kam jezdíte. Hlídá se každý spoj, který tam odsud jede bez přestupu, ať je to kterákoli linka.'; return; }
      const calls = mhd.callsTo(st.num, v.b, mhd.dayChoices().today), next = calls.find(c => c.sec >= mhd.now().sec);
      const no = l => parseInt(String(l).replace(/\D/g, '')) || 999;
      const lines = [...new Set(calls.map(c => c.line))].sort((a, b) => no(a) - no(b) || String(a).localeCompare(String(b)));
      info.textContent = calls.length ? `Dnes tudy ${lines.length > 1 ? 'jedou linky' : 'jede linka'} ${lines.join(', ')}${next ? `, nejbližší v ${hmSec(next.sec)}` : ''}.` : 'Dnes tudy nic nejede (jiný jízdní řád nebo výluka).';
    };
    const fill = () => {
      const nq = norm(q.value.trim());
      const hits = !reach || !nq || (v.b && norm(v.bn) === nq) ? [] : reach.filter(s => norm(s.name).includes(nq)).sort((a, b) => norm(a.name).indexOf(nq) - norm(b.name).indexOf(nq)).slice(0, 8);
      list.replaceChildren(...hits.map(s => {
        const li = el('li'), b = el('button'); b.type = 'button';
        b.append(el('span', '', s.name), el('small', '', s.lines.join(', ')));
        b.onclick = () => { v.b = s.num; v.bn = s.name; q.value = s.name; fill(); preview(); save.disabled = false; };
        li.append(b);
        return li;
      }));
      if (reach && nq && !hits.length && !(v.b && norm(v.bn) === nq)) info.textContent = 'Taková zastávka odsud bez přestupu není.';
    };
    q.oninput = () => { if (v.b && norm(q.value.trim()) !== norm(v.bn)) { v.b = null; save.disabled = true; } preview(); fill(); };
    const load = () => {
      if (!mhd.ready()) { info.textContent = 'Načítám jízdní řád…'; mhd.load().then(() => { if (f.isConnected) load(); }); return; }
      reach = mhd.reach(st.num);
      preview(); fill();
    };

    const od = el('input'), dox = el('input');
    od.type = dox.type = 'time'; od.value = hmField(v.od); dox.value = hmField(v.do);
    od.setAttribute('aria-label', 'Od'); dox.setAttribute('aria-label', 'Do');
    const times = el('div', 'sf-times'); times.append(od, el('span', '', '–'), dox);
    const when = el('div', 'sf-row'); when.append(el('span', '', 'Kdy'), times);
    const days = el('div', 'sf-days');
    DAYS.forEach((n, i) => {
      const b = el('button', 'pbtn small', n); b.type = 'button'; b.setAttribute('aria-pressed', String(v.dny[i] === '1'));
      b.onclick = () => { v.dny = v.dny.slice(0, i) + (v.dny[i] === '1' ? '0' : '1') + v.dny.slice(i + 1); b.setAttribute('aria-pressed', String(v.dny[i] === '1')); };
      days.append(b);
    });
    const dayRow = el('div', 'sf-row'); dayRow.append(el('span', '', 'Dny'), days);

    const save = el('button', 'pbtn small', item ? 'Uložit změny' : 'Uložit spoj'); save.type = 'submit'; save.disabled = !v.b;
    const cancel = el('button', 'pbtn small', 'Zrušit'); cancel.type = 'button'; cancel.onclick = () => done();
    const btns = el('div', 'sf-btns'); btns.append(cancel, save);
    f.onsubmit = e => {
      e.preventDefault();
      const a = toMin(od.value), b = toMin(dox.value);
      if (!v.b) return;
      if (a == null || b == null || b <= a) { info.textContent = 'Čas „do“ musí být později než „od“.'; return; }
      if (!v.dny.includes('1')) { info.textContent = 'Vyberte aspoň jeden den.'; return; }
      const rec = { a: +st.num, an: st.name, b: v.b, bn: v.bn, od: a, do: b, dny: v.dny };
      const it = item ? store.update(item.id, rec) : store.add({ typ: 'spoj', ...rec });
      saySpoj(item ? 'upravit' : 'ulozit');
      toast(item ? 'Spoj upraven' : 'Spoj uložen. V nastavený čas se ukáže sám nahoře na mapě, jindy ho najdete v nabídce Moje.', item ? 2600 : 7000);
      done();
      if (it && S.item && S.item.id === it.id) S.item = it;
      loop(true);
    };
    f.append(to, list, info, when, dayRow, btns);
    load();
    return f;
  }

  // ---------------------------------------------------------------- můj spoj: the box
  // item: the connection in the box; open: the next rides listed and marked on the map (else the small box);
  // sel: the ride picked by a click (else the next one); edit: the connection whose form is to open in its stop's card
  // tagging: the thing whose tags are open in the list; shut: the blocks of the list folded (the keys of their tags)
  const S = { item: null, open: false, sel: null, edit: null, loading: false, stops: false, n: 0, tagging: null, tagShown: false, tagFocus: false, shut: new Set() };
  const offKey = it => `${it.id}|${mhd.now().date}`;
  const offs = () => { try { return JSON.parse(sessionStorage.getItem(OFF_SS) || '[]'); } catch { return []; } };
  const isOff = it => offs().includes(offKey(it));
  const setOff = it => { try { sessionStorage.setItem(OFF_SS, JSON.stringify([...offs().filter(k => k.endsWith(`|${mhd.now().date}`)), offKey(it)])); } catch { /* private mode */ } };
  const inWindow = it => { const n = mhd.now(), m = Math.floor(n.sec / 60); return it.dny[n.wd] === '1' && m >= it.od && m <= it.do; };
  const stopXY = num => { const s = mhd.stops()[num]; return s ? layers.llToImg(s[1], s[2]) : null; };

  // the next rides of the connection: by the timetable, moved by the delay of the vehicle that runs them now
  function upcoming(it) {
    const now = mhd.now().sec;
    const calls = mhd.callsTo(it.a, it.b, mhd.dayChoices().today).filter(c => c.sec >= now - 2400);
    // (the vehicles of the lines in question only: each is matched to its trip of the timetable)
    const veh = new Map();
    for (const line of new Set(calls.map(c => c.line))) for (const m of layers.lineVehicles(line)) {
      if (!m.live) { if (!veh.has(m.id)) veh.set(m.id, m); continue; } // (timetable mode: the vehicle is its trip)
      const pv = layers.matchPlan(m);
      if (pv && !veh.has(pv.id)) veh.set(pv.id, m);
    }
    return calls.map(c => { const m = veh.get(c.trip) || null, dl = m && m.live ? Math.round(m.delay || 0) : null; return { ...c, m, d: dl, exp: c.sec + (dl || 0) * 60 }; })
      .filter(c => c.exp >= now - 20).sort((a, b) => a.exp - b.exp).slice(0, 3);
  }
  // the ride on the map: its vehicle marked (when it is on its way already), its route, the stop
  function mark(c, fit) {
    const it = S.item;
    const on = !!(c && c.m && Number.isFinite(c.m.X));
    layers.selectVehicle(on ? c.m.id : null);
    if (c) layers.setRoute(on && c.m.live ? layers.matchPlan(c.m) || mhd.tripRoute(c.trip) : on ? c.m : mhd.tripRoute(c.trip));
    layers.selectStop(String(it.a));
    if (!fit) return;
    const a = stopXY(it.a);
    if (a && on) d.fitPair(a, [c.m.X, c.m.Y]); else if (a) d.flyTo(a[0], a[1], 2);
  }
  function render(fit = false) {
    const it = S.item;
    if (!it || box.hidden) return;
    box.classList.toggle('compact', !S.open);
    $('sbTitle').textContent = `${it.an} → ${it.bn}`;
    $('sbTitle').title = S.open ? 'Ukázat zastávku a vůz na mapě' : 'Ukázat nejbližší odjezdy a vůz na mapě';
    if (!mhd.ready() || !S.stops) {
      // the timetable and the stops: asked for once (again at the next look when that failed), then drawn again
      $('sbNote').textContent = 'Načítám jízdní řád…'; $('sbNote').className = 'rb-delay'; $('sbDeps').replaceChildren(); $('sbRide').hidden = true;
      if (!S.loading) { S.loading = true; Promise.all([mhd.load(), mhd.loadStops()]).then(() => { S.stops = true; }).catch(() => {}).finally(() => { S.loading = false; if (mhd.ready() && S.stops) render(fit); }); }
      return;
    }
    const now = mhd.now().sec, list = upcoming(it);
    const wait = c => { const m = Math.round((c.exp - now) / 60); return m <= 0 ? 'teď' : `za ${m} min`; };
    if (!list.some(c => c.trip === S.sel)) S.sel = null; // (the picked ride has left)
    const cur = list.find(c => c.trip === S.sel) || list[0] || null;
    const note = $('sbNote');
    note.className = `rb-delay ${cur && cur.d >= 10 ? 'd3' : cur && cur.d >= 5 ? 'd2' : cur && cur.d >= 1 ? 'd1' : ''}`; // (the scale of the ride box)
    if (!cur) note.textContent = mhd.callsTo(it.a, it.b, mhd.dayChoices().today).length ? 'Dnes už tudy nic nejede.' : 'Dnes tudy nic nejede (jiný jízdní řád nebo výluka).';
    else if (!S.open) note.textContent = `linka ${cur.line} ${wait(cur)}${cur.d > 0 ? ` (+${cur.d})` : ''}`;
    else note.textContent = cur.d == null ? `linka ${cur.line}: podle jízdního řádu` : cur.d > 0 ? `linka ${cur.line}: zpoždění +${cur.d} min` : cur.d < 0 ? `linka ${cur.line}: napřed ${-cur.d} min` : `linka ${cur.line} jede včas`;
    $('sbDeps').replaceChildren(...(S.open ? list : []).map(c => {
      const li = el('li', `link${c === cur ? ' sel' : ''}`);
      const st = el('span', 'st'); st.append(el('span', `lbadge t-${c.type}`, c.line), ` ${wait(c)}`);
      li.append(el('span', 'tm', hmSec(c.exp)), st);
      li.title = 'Ukázat tento spoj na mapě';
      li.onclick = () => { S.sel = c.trip; render(true); };
      return li;
    }));
    $('sbRide').hidden = !(S.open && cur && cur.m && cur.m.live);
    // (getting on: the box goes for today, the vehicle stays marked with its route, as when boarding from its card)
    $('sbRide').onclick = () => { saySpoj('nastoupit'); const m = cur.m; setOff(it); S.open = false; hide(); layers.selectStop(null); d.startRide(m); };
    // on the map (not under a card the visitor has opened meanwhile: that card marks its own things)
    if (S.open && (fit || !d.cardOpen())) mark(cur, fit);
  }
  function watch(it, open, from) {
    S.item = it; S.open = open; S.sel = null;
    box.hidden = false;
    if (open) { saySpoj(from || 'otevrit'); d.showMhd(); }
    render(open);
  }
  function hide() {
    if (S.open && !d.cardOpen()) { layers.selectVehicle(null); layers.setRoute(null); layers.selectStop(null); }
    S.item = null; S.open = false; S.sel = null;
    box.hidden = true;
  }
  // every 5 s: the box comes in the part of the day of a connection and goes after it; an open one is kept fresh
  // (the small one twice a minute)
  function loop(now = false) {
    if (document.hidden && !now) return;
    S.n++;
    if (d.riding()) { if (!box.hidden) hide(); return; }
    if (S.item && !store.get(S.item.id)) hide(); // (removed meanwhile, here or in another tab)
    if (!S.item || !S.open) {
      const it = store.of('spoj').find(i => inWindow(i) && !isOff(i)) || null;
      if (it && (!S.item || S.item.id !== it.id)) watch(it, false);
      else if (!it && S.item) hide();
      else if (S.item) S.item = it;
    }
    if (S.item && (S.open || now || S.n % 6 === 0)) render();
  }
  $('sbTitle').onclick = () => { if (!S.item) return; if (S.open) render(true); else watch(S.item, true, 'lista'); };
  $('sbClose').onclick = () => {
    if (!S.item) return;
    // an open box in its part of the day folds back into the small one; the small one goes away for today
    if (S.open && inWindow(S.item) && !isOff(S.item)) { const it = S.item; hide(); watch(it, false); return; }
    saySpoj('zavrit'); setOff(S.item); hide();
  };
  /** The connection of this moment, opened: the address ?spoj (the shortcut of the installed app). */
  function openSpoj(from = 'zkratka') {
    const all = store.of('spoj');
    if (!all.length) { toast('Zatím nemáte uložený žádný spoj. Otevřete zastávku a zvolte „Hlídat spoj odsud“.', 8000); return; }
    const n = mhd.now(), min = Math.floor(n.sec / 60), today = all.filter(i => i.dny[n.wd] === '1');
    watch(today.find(i => min >= i.od && min <= i.do) || today.filter(i => i.od > min).sort((a, b) => a.od - b.od)[0] || all[0], true, from);
  }

  // the view of the map as it is now, kept: where, how close, which layers; named by its quarter until renamed
  if ($('mojeView')) $('mojeView').onclick = () => {
    const first = !store.all().length;
    const it = store.add({ typ: 'pohled', n: d.viewName(), h: d.viewHash() });
    say('ulozit-pohled');
    if (first) holdOn();
    // (no message: the new row comes with its name ready to be changed, at the top of the list or of the block of
    // what has no tag, which opens and comes into sight with the caret; on a phone a message would lie over it)
    if (F.q && $('mjQ')) { $('mjQ').value = ''; F.q = ''; } // (a search of the list would hide the new row)
    S.rename = it.id; renderList();
  };
  // the search of the list: the field of the panes (src/panefind.js: Esc and × give the whole list back, a phone's
  // keyboard lifts the sheet); every word asked has to be in the name, the kind or a tag of the thing
  if ($('mjQ')) {
    const q = $('mjQ');
    q.addEventListener('input', () => { if (!F.q.trim() && q.value.trim()) say('hledat'); F.q = q.value; renderList(); });
    paneField({ pane: $('pane-moje'), q, x: $('mjX'), isPhone: d.isPhone || (() => false), isOn: () => !!F.q.trim(), clear: () => { q.value = ''; F.q = ''; renderList(); } });
  }
  store.on(() => { renderList(); document.querySelectorAll('.fav-btn').forEach(b => b.paint && b.paint()); if (d.changed) d.changed(); });
  renderList();
  setInterval(loop, 5000);
  setTimeout(() => loop(true), 1500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(true); });

  return { star, spojEntry, suggest, open, openSpoj,
    // a result of the search was opened ({ n, k, la, lo }): kept among those searched for lately; again: one of them reopened
    searched: r => seen.add(r), again: () => say('naposledy'),
    tracking: () => S.open && !box.hidden, count: () => store.all().length };
}

import { createPlanner, walkSec } from './raptor.js';
import { createWalkRoute } from './walkroute.js';
import { createChodec, metresOf, alongPts, cellPx } from './chodec.js';
import { vzitIcon, outside, judge, fakeWeather } from './vzit.js';
import { pxIcon } from './quick.js';
import { journeyState, say as sayState, liveJourney, sideWords, WAYS, span } from './spojstav.js';

export function createSpojeni({ $, el, layers, card, toast, track, fitFree, setLayer, state, startRide, stopRide = null, riding = () => null, isPhone, openPanel, placeSearch, myPos, whereAmI, walkUrl, walker = null, weather = null, fav = null, onMode = null, pickPoint = null, pickCancel = null, motion = null, ridingLine = null }) {
  // the figure that walks the walks in real time (src/chodec.js; walker: { occluder, veil, lite }, null = none)
  const fig = walker ? createChodec(walker) : null;
  // the walks along the pavements and streets (src/walkroute.js); straight until its network has come, or where it
  // finds nothing sensible (too far from any way, a detour three times the distance)
  const walk = walkUrl ? createWalkRoute(walkUrl) : null;
  let walkVer = 0;
  if (walk) walk.onLoad(() => { walkVer++; });
  // the way of a walk: { pts: [x, y, …], m: its metres along the network, or null where it stays straight }
  function walkPts(a, b) {
    const straight = { pts: [a[0], a[1], b[0], b[1]], m: null };
    if (!walk) return straight;
    if (!walk.ready()) { walk.load(); return straight; }
    const d = Math.hypot(b[0] - a[0], 2 * (b[1] - a[1]));
    if (d < 25) return { pts: straight.pts, m: d }; // (a few steps: straight, and that is its length)
    const r = walk.route(a[0], a[1], b[0], b[1]);
    return r && r.m <= d * 3 + 200 ? { pts: r.pts, m: r.m } : straight;
  }
  let wayKey = 'bezne';
  try { const k = localStorage.getItem('b2k-spoj-jak'); if (WAYS[k]) wayKey = k; } catch { /* (no storage) */ }
  const wayNow = () => WAYS[wayKey];
  const WALK_EXTRA = 30;
  const walkM = l => (l.routed ? l.m : l.m * 1.3); // (the metres to show)
  function applyWalks(j) {
    let changed = false;
    for (const l of j.legs) if (l.kind === 'walk' && l.mRoute != null && !l.routed) {
      l.est = { sec: l.sec, m: l.m };
      l.m = Math.round(l.mRoute); l.sec = Math.round(l.mRoute / wayNow().walk + WALK_EXTRA); l.routed = true; changed = true;
    }
    if (!changed) return;
    if (j.walkOnly) { const l = j.legs[0]; if (j.byArr) { l.dep = l.arr - l.sec; j.dep = l.dep; } else { l.arr = l.dep + l.sec; j.arr = j.dep + l.sec; } } // (byArr: "Příjezd do", the end holds)
    else {
      const rides = j.legs.filter(l => l.kind === 'ride'), first = j.legs[0], last = j.legs[j.legs.length - 1];
      if (first.kind === 'walk' && rides.length) j.dep = rides[0].dep - first.sec;
      if (last.kind === 'walk' && rides.length) j.arr = rides[rides.length - 1].arr + last.sec;
    }
    clearTimeout(applyWalks.t);
    applyWalks.t = setTimeout(() => { // (the list, the bar and an open card with the new times; not inside the drawing)
      if (ui.open && ui.list.length) renderList();
      paintBar();
      if (ui.cardBox && ui.cardBox.isConnected && ui.sel >= 0) fillCard(ui.list[ui.sel], ui.cardBox);
    }, 0);
  }
  const mhd = layers.mhd;
  const ui = { a: null, b: null, when: 'now', at: null, list: [], sel: -1, end: {}, busy: false, open: false, timer: null, cardBox: null, ends: null };
  const GROW_MAX = 40; // (journeys in the list at most, grow())
  let growing = null; // ('after' / 'before' while a step of grow() runs)
  let planner = null, plannerTt = null, plannerWay = null; // (built for a timetable and for who travels)
  const stat = (window.__spoj = { build: 0, search: 0 }); // (the time of the last build and search, ms, for tuning)
  const plannerFor = () => {
    const tt = mhd.timetable();
    if (!tt) return null;
    if (tt !== plannerTt || plannerWay !== wayKey) { const t0 = performance.now(); planner = createPlanner(tt, mhd.stops(), mhd.posts(), wayNow()); plannerTt = tt; plannerWay = wayKey; stat.build = Math.round(performance.now() - t0); }
    return planner;
  };

  // now in seconds from the midnight of the day of the search (ui.date): after midnight 0:05 is 86700, so a journey found
  // at 23:50 for 0:00 counts down right (it said "Vyjděte za 1437 min", found 2026-11-15)
  const ymdUTC = d => Date.UTC(Math.floor(d / 1e4), Math.floor(d / 100) % 100 - 1, d % 100);
  const nowSecOf = n => n.sec + (ui.date && n.date !== ui.date ? Math.round((ymdUTC(n.date) - ymdUTC(ui.date)) / 864e5) * 86400 : 0);
  const daySec = () => nowSecOf(mhd.now());
  const hhmm = sec => { const s = ((Math.round(sec) % 86400) + 86400) % 86400; return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`; };
  const mins = sec => Math.max(1, Math.round(sec / 60));
  const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const stopName = num => { const s = mhd.stops()[num]; return s ? s[0] : mhd.stopName(num) || String(num); };
  const badge = (line, type) => el('span', `lbadge t-${type}`, line);
  const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
  const distM = (lo1, la1, lo2, la2) => Math.hypot((lo1 - lo2) * 72765, (la1 - la2) * 111200);
  // the place of an end (a stop: its own point)
  const llOf = e => { if (!e) return null; if (e.num) { const s = mhd.stops()[e.num]; return s ? [s[1], s[2]] : null; } return [e.lon, e.lat]; };
  const epOf = e => (e.num ? { num: e.num } : { lon: e.lon, lat: e.lat }); // (as raptor.js takes it)
  // a walk's ends by name: a stop number, or null = the start / the target of the journey
  const endName = (num, which) => (num != null ? stopName(num) : (ui.ends && ui.ends[which] ? ui.ends[which].name : which === 'a' ? 'start' : 'cíl'));

  // ------------------------------------------------------------------ Co si vzít s sebou (src/vzit.js)
  // the forecast is asked for with a search and then at most every 10 minutes; what a journey needs is worked out again
  // each minute (the moments out move with the delays), kept on the journey
  let wxData = null, wxAsked = 0, wxVer = 0;
  function wxLoad() {
    if (!weather || Date.now() - wxAsked < 10 * 60e3) return;
    wxAsked = Date.now();
    weather().then(d => { if (!d || !d.fc) return; wxData = d; wxVer++; tickLive(); }).catch(() => {});
  }
  function wxOf(j) {
    if (!wxData || !j) return null;
    const key = `${wxVer}|${Math.floor(Date.now() / 60e3)}`;
    if (j.wx && j.wx.key === key) return j.wx.res;
    const L = live(j);
    const res = judge(outside(L.legs, L.leave), wxData, ui.date, daySec());
    j.wx = { key, res };
    return res;
  }
  // where on the journey it is: "cestou na zastávku X", "cestou do cíle", "při čekání na zastávce X"
  function wxWhere(j, it) {
    const l = j.legs[it.i];
    if (!l) return '';
    if (it.kind === 'wait') return `při čekání na zastávce ${stopName(l.from)}`;
    return l.to != null ? `cestou na zastávku ${stopName(l.to)}` : j.walkOnly ? '' : 'cestou do cíle';
  }
  const wxSentence = (j, it) => `${it.rest}${it.where && wxWhere(j, it) ? ` ${wxWhere(j, it)}` : ''}.`;
  // B: the line in the box of the card
  function wxLine(j, W) {
    const t = W.top, d = el('div', `sp-wx wx-${t.tone}`);
    const tx = el('span', ''); tx.append(el('b', '', t.bold), ` ${wxSentence(j, t)}`);
    if (W.also) tx.append(` ${W.also.bold.replace(/\.$/, '')}: ${W.also.short}.`);
    d.append(vzitIcon(t.icon, 26), tx);
    return d;
  }

  // ------------------------------------------------------------------ the form in the panel
  const host = $('spoj'), panel = $('panel');
  const mkField = (cls, ph, id) => {
    const f = el('div', 'sp-field');
    const dot = el('span', `sp-dot ${cls}`); dot.setAttribute('aria-hidden', 'true');
    const inp = el('input'); inp.type = 'search'; inp.id = id; inp.placeholder = ph; inp.autocomplete = 'off'; inp.setAttribute('aria-label', ph);
    f.append(dot, inp);
    // the pin: this end by a click in the map, with the form folded away (aimAt)
    if (pickPoint) {
      const pk = el('button', 'sp-pick'); pk.type = 'button'; pk.innerHTML = pxIcon('pin');
      pk.title = 'Vybrat v mapě'; pk.setAttribute('aria-label', `${cls === 'a' ? 'Odkud' : 'Kam'}: vybrat kliknutím do mapy`);
      pk.onclick = () => aimAt(aim === cls && aimFold ? null : cls, true);
      f.append(pk);
    }
    return { f, inp };
  };
  const A = mkField('a', 'Odkud: zastávka, adresa, místo', 'spA'), B = mkField('b', 'Kam: zastávka, adresa, místo', 'spB'); // (the placeholders: PH below)
  const swap = el('button', 'pbtn small sp-swap', '⇅'); swap.type = 'button'; swap.title = 'Prohodit odkud a kam'; swap.setAttribute('aria-label', 'Prohodit odkud a kam');
  const ends = el('div', 'sp-ends'); const fields = el('div', 'sp-fields'); fields.append(A.f, B.f); ends.append(fields, swap);
  const sug = el('ul', 'results sp-sug');
  // when: now / leaving at / arriving by (the time today)
  const whenBtns = {};
  const when = el('div', 'sp-when');
  for (const [k, label] of [['now', 'Teď'], ['dep', 'Odjezd v'], ['arr', 'Příjezd do']]) {
    const b = el('button', 'pbtn small', label); b.type = 'button';
    b.onclick = () => { ui.when = k; if (k !== 'now' && ui.at == null) { const n = mhd.now().sec; ui.at = Math.ceil(n / 300) * 300 + (k === 'arr' ? 1800 : 0); tm.value = hhmm(ui.at).padStart(5, '0'); } if (k !== 'now' && ui.at != null) ui.at = nextAt(ui.at, k); markWhen(); if (k === 'now' || tm.value) go(); if (k !== 'now') tm.focus(); };
    whenBtns[k] = b; when.append(b);
  }
  const tm = el('input', 'sp-time'); tm.type = 'time'; tm.id = 'spTime'; tm.setAttribute('aria-label', 'Čas (dnes)');
  // the star of Moje (src/moje.js; fav: what is kept -> its button): the journey from here to there, kept without its
  // time; there once both ends are known
  const favSlot = el('span', 'sp-fav');
  const tmDay = el('span', 'sp-day', 'zítra'); tmDay.hidden = true; tmDay.title = 'Ten čas už dnes byl: hledám na zítřek'; // (the time set has passed today, nextAt)
  const tmBox = el('span', 'sp-timebox'); tmBox.append(tm, tmDay);
  when.append(tmBox, favSlot);
  const whenTok = () => (ui.when === 'now' || ui.at == null ? '' : `&${ui.when === 'arr' ? 'p' : 'o'}=${hhmm(ui.at).replace(':', '').padStart(4, '0')}`);
  const pairOf = () => (ui.a && ui.b ? { n: `${ui.a.name} → ${ui.b.name}`, j: `spojeni/${tokOf(ui.a)}/${tokOf(ui.b)}${whenTok()}` } : null);
  // A time of the day as the next time it comes: arriving by a time that has passed today means tomorrow; leaving at
  // a time more than half an hour ago too (a little after it the departures of today still serve). The seconds go on
  // past midnight (the planner counts the next day on the same scale).
  const nextAt = (sec, mode) => { const t = ((sec % 86400) + 86400) % 86400, now = mhd.now().sec; return (mode === 'arr' ? t < now : t < now - 1800) ? t + 86400 : t; };
  let favFor = null;
  function paintFav() {
    const p = fav ? pairOf() : null, key = p ? p.j : null;
    if (key === favFor) return;
    favFor = key;
    favSlot.replaceChildren(...(p ? [fav(p)] : []));
  }
  tm.onchange = () => { if (!tm.value) return; const [h, m] = tm.value.split(':').map(Number); if (ui.when === 'now') ui.when = 'dep'; ui.at = nextAt(h * 3600 + m * 60, ui.when); markWhen(); go(); };
  const wayBtn = el('button', 'pbtn small sp-waybtn'); wayBtn.type = 'button'; wayBtn.setAttribute('aria-haspopup', 'true'); wayBtn.setAttribute('aria-expanded', 'false');
  const wayMenu = el('ul', 'results sp-waymenu'); wayMenu.hidden = true; wayMenu.setAttribute('aria-label', 'Jak se pohybuji');
  favSlot.after(wayBtn); // (the last in the row: right under ⇅, as wide as it; the star of Moje stands before it)
  const wayOpen = on => { wayMenu.hidden = !on; wayBtn.setAttribute('aria-expanded', String(on)); };
  wayBtn.onclick = () => wayOpen(wayMenu.hidden);
  document.addEventListener('pointerdown', e => { if (!wayMenu.hidden && !wayMenu.contains(e.target) && !wayBtn.contains(e.target)) wayOpen(false); }, true);
  wayMenu.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); wayOpen(false); wayBtn.focus(); } });
  function markWay() {
    const tt = mhd.timetable(), has = !!(tt && typeof tt.wa === 'string');
    if (tt && WAYS[wayKey].data && !has) wayKey = 'pomalu';
    const w = WAYS[wayKey];
    wayBtn.innerHTML = pxIcon(w.ico);
    wayBtn.title = `Jak se pohybuji: ${w.name}`; wayBtn.setAttribute('aria-label', wayBtn.title);
    wayBtn.classList.toggle('on', wayKey !== 'bezne'); // (not the usual walk: the button stays lit, the journeys are other than most people get)
    const head = el('li', 'res-head'); head.append(el('span', '', 'Jak se pohybuji'));
    wayMenu.replaceChildren(head, ...Object.entries(WAYS).filter(([, x]) => !x.data || has).map(([k, x]) => {
      const li = el('li'), b = el('button', k === wayKey ? 'on' : ''); b.type = 'button'; b.setAttribute('aria-pressed', String(k === wayKey));
      b.innerHTML = pxIcon(x.ico);
      b.append(el('span', '', x.name), el('small', '', x.title));
      b.onclick = () => {
        wayOpen(false);
        if (wayKey === k) return;
        wayKey = k; try { localStorage.setItem('b2k-spoj-jak', k); } catch { /* (no storage) */ }
        track('Nástroj', { nastroj: 'spojeni', hodnota: `jak-${k}` });
        markWay(); ui.mem = null; go();
        if (x.low) toast(x.flat ? 'Hledám jen nízkopodlažní spoje a bezbariérová nástupiště. Cestu k zastávce si ověřte: schody na ní zatím nehlídám.' : 'Hledám jen nízkopodlažní spoje.', 7000);
      };
      li.append(b);
      return li;
    }));
  }
  markWay();
  function markWhen() { for (const k in whenBtns) whenBtns[k].setAttribute('aria-pressed', String(ui.when === k)); tm.hidden = tmBox.hidden = ui.when === 'now'; tmDay.hidden = ui.when === 'now' || ui.at == null || ui.at < 86400; paintFav(); }
  // the bar of a phone: the journey picked, the form folded away (the map stays in sight between it and the card)
  const bar = el('div', 'sp-bar');
  const barT = el('span', 'sp-bar-t');
  const barEdit = el('button', 'pbtn small', 'Upravit'); barEdit.type = 'button'; barEdit.onclick = () => panel.classList.remove('sp-compact');
  bar.append(barT, barEdit);
  const opts = el('ol', 'sp-opts'); opts.setAttribute('aria-live', 'polite');
  // the list grows (grow below): the earlier journeys by the button above it, the later ones by scrolling to its end
  // (the button there is for a keyboard, and for a list too short to scroll)
  const earlier = el('button', 'pbtn small', '▲ Dřívější spoje'), later = el('button', 'pbtn small', 'Další spoje ▼');
  earlier.type = later.type = 'button';
  const moreTop = el('div', 'sp-more sp-more-top'); moreTop.append(earlier);
  const moreSay = el('span', 'sp-more-say'); moreSay.setAttribute('role', 'status');
  const more = el('div', 'sp-more'); more.append(moreSay, later);
  const note = el('p', 'sp-note', `Zadejte odkud a kam: napište zastávku, adresu nebo místo, zvolte svou polohu${pickPoint ? ', nebo klikněte přímo do mapy na dům, zastávku či volné místo' : ''}. Najdu spojení i s přestupy a pěšími přesuny, se zpožděním vozů, které právě jedou.`);
  const credit = el('p', 'sp-note sp-credit', 'Jízdní řád IDS JMK © KORDIS JMK, živé polohy KORDIS JMK (data.brno.cz). Jen městské linky. Pěší úseky po chodnících a cestách z OpenStreetMap, kde je nenajdu, odhadem.');
  // while a click in the map is awaited: this line instead of the form (a phone needs the map), with the way out
  const pickBar = el('div', 'sp-pickbar');
  const pickT = el('span', 'sp-bar-t'); pickT.setAttribute('role', 'status');
  const pickX = el('button', 'pbtn small', 'Zrušit'); pickX.type = 'button'; pickX.onclick = () => { if (pickCancel) pickCancel(); };
  pickBar.append(pickT, pickX);
  host.append(bar, pickBar, ends, sug, when, wayMenu, note, moreTop, opts, more, credit);
  more.hidden = moreTop.hidden = true;
  markWhen();

  // suggestions: "Moje poloha", the stops in the map by name (the words of the name from their start, without accents),
  // then the places and addresses of the search
  let sugFor = null, sugList = [], sugSel = 0, sugTok = 0;
  const MAP_SUG = { kind: 'map', name: 'Vybrat v mapě', k: 'kliknutím' };
  async function suggest(which) {
    const inp = which === 'a' ? A.inp : B.inp, raw = inp.value.trim(), q = fold(raw), my = ++sugTok;
    sugFor = which;
    const out = [{ kind: 'me', name: 'Moje poloha', k: 'kde stojím' }];
    if (q) {
      const seen = new Set(), stops = [];
      for (const [num, s] of Object.entries(mhd.stops())) {
        const n = fold(s[0]);
        if (seen.has(s[0])) continue;
        const at = n.indexOf(q);
        if (at < 0 || (at > 0 && !/[\s,.\-(]/.test(n[at - 1]))) continue;
        seen.add(s[0]); stops.push({ kind: 'stop', num: +num, name: s[0], k: 'zastávka', score: (at === 0 ? 0 : 1) * 100 + n.length });
      }
      out.push(...stops.sort((x, y) => x.score - y.score).slice(0, 5));
      if (q.length >= 2 && placeSearch) {
        const pl = await placeSearch(raw).catch(() => []);
        if (my !== sugTok) return;
        out.push(...pl.filter(p => !seen.has(p.n)).slice(0, 5).map(p => ({ kind: 'place', name: p.n, k: p.k, lon: p.lon, lat: p.lat })));
      }
    }
    const none = q && out.length === 1;
    if (pickPoint) out.splice(1, 0, MAP_SUG);
    const lead = pickPoint ? 2 : 1;
    sugList = out; sugSel = q && !none ? lead : 0;
    sug.replaceChildren();
    const two = el('li', 'sp-two');
    sug.append(two);
    if (none) { const li = el('li', 'sp-none', 'Nic takového v mapě nemám. Zkuste zastávku, ulici, adresu nebo místo.'); sug.append(li); }
    sugList.forEach((s, i) => {
      const b = el('button', i === sugSel ? 'on' : ''); b.type = 'button';
      b.onmousedown = e => e.preventDefault(); // (the field keeps the focus until the click is done)
      b.onclick = () => pickSug(i);
      if (i < lead) { b.append(el('span', '', s.kind === 'me' ? '◎ Moje poloha' : '⌖ Vybrat v mapě')); b.title = s.kind === 'me' ? 'Odkud právě stojím' : 'Ukázat místo kliknutím do mapy'; two.append(b); return; }
      b.append(el('span', '', s.name), el('small', '', s.k));
      const li = el('li'); li.append(b); sug.append(li);
    });
  }
  async function pickSug(i) {
    const s = sugList[i], which = sugFor;
    if (!s) return;
    sug.replaceChildren(); sugList = [];
    if (s.kind === 'me') { await useMe(which); }
    else if (s.kind === 'map') { aimAt(which, true); return; }
    else setEnd(which, s.kind === 'stop' ? { kind: 'stop', num: s.num, name: s.name } : { kind: 'place', name: s.name, lon: s.lon, lat: s.lat });
    if (which === 'a' && !ui.b) B.inp.focus(); else (which === 'a' ? A : B).inp.blur();
  }
  async function useMe(which) {
    const F = which === 'a' ? A : B;
    F.inp.value = 'Zjišťuji polohu…';
    const p = myPos ? await myPos() : null;
    if (!p) { F.inp.value = ui[which] ? ui[which].name : ''; toast('Polohu se nepodařilo zjistit, nebo jste mimo mapu'); return; }
    setEnd(which, { kind: 'me', name: 'Moje poloha', lon: p[0], lat: p[1] });
  }
  const PH = { a: 'Odkud: zastávka, adresa, místo', b: 'Kam: zastávka, adresa, místo' }, PH_AIM = 'Pište, nebo klikněte do mapy';
  let aim = null, aimFold = false, aimTok = 0;
  function paintAim() {
    A.f.classList.toggle('aim', aim === 'a' && !aimFold); B.f.classList.toggle('aim', aim === 'b' && !aimFold);
    A.inp.placeholder = aim === 'a' ? PH_AIM : PH.a; B.inp.placeholder = aim === 'b' ? PH_AIM : PH.b;
    panel.classList.toggle('sp-picking', !!aim && aimFold);
  }
  function aimAt(which, fold = false) {
    if (!pickPoint || (aim === which && aimFold === (fold && !!which))) return;
    const my = ++aimTok;
    if (aim) pickCancel(); // (its promise comes back empty and finds its turn gone)
    aim = which; aimFold = fold && !!which;
    if (aimFold) { pickT.textContent = which === 'a' ? 'Klikněte do mapy: odkud vyrazíte' : 'Klikněte do mapy: kam chcete jet'; sug.replaceChildren(); sugList = []; (which === 'a' ? A : B).inp.blur(); }
    paintAim();
    if (!which) return;
    pickPoint().then(p => {
      if (my !== aimTok) return; // (given up, or aimed elsewhere meanwhile)
      const folded = aimFold;
      aim = null; aimFold = false; paintAim();
      if (!p) return; // (Esc, Zrušit)
      sug.replaceChildren(); sugList = [];
      track('Nástroj', { nastroj: 'spojeni', hodnota: `${p.num ? 'bod-v-mape-zastavka' : 'bod-v-mape'}${folded ? '' : '-pole'}` });
      setEnd(which, p.num ? { kind: 'stop', num: p.num, name: p.name } : { kind: 'place', name: p.name, lon: p.lon, lat: p.lat });
      const other = which === 'a' ? 'b' : 'a', O = other === 'a' ? A : B;
      // (the other end still empty waits next: on a computer with the caret in its field, on a phone for the map only,
      // no keyboard over the map just used, and folded when this one was)
      if (ui[other]) (which === 'a' ? A : B).inp.blur(); else if (isPhone()) aimAt(other, folded); else O.inp.focus();
    });
  }
  if (pickPoint) {
    // what else is clicked ends the waiting of a field (not the map, not the field itself, not its suggestions); a
    // folded one ends with the row of the panel
    document.addEventListener('pointerdown', e => {
      const t = e.target;
      if (!aim || !t || !t.closest) return;
      if (aimFold ? !t.closest('#tabs') : (t.closest('#map') || (aim === 'a' ? A : B).f.contains(t) || sug.contains(t))) return;
      aimAt(null);
    }, true);
    panel.addEventListener('focusin', e => { if (aim && !aimFold && e.target !== (aim === 'a' ? A : B).inp && !sug.contains(e.target) && !(aim === 'a' ? A : B).f.contains(e.target)) aimAt(null); });
  }
  for (const [which, F] of [['a', A], ['b', B]]) {
    F.inp.addEventListener('input', () => { ui[which] = null; paintFav(); mhd.loadStops().then(() => suggest(which)); });
    F.inp.addEventListener('focus', () => { mhd.loadStops(); mhd.load(); F.inp.select(); if (!F.inp.value.trim()) suggest(which); aimAt(which); }); // (the field with the caret also waits for a click in the map)
    // (left without a choice: the field says again what its end is; also after Esc, which empties a search field by itself
    // while the end stays, so the field looked empty and the journey still went from the old place)
    F.inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement === F.inp) return; if (sugFor === which) { sug.replaceChildren(); sugList = []; } F.inp.value = ui[which] ? ui[which].name : ''; }, 200));
    F.inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!sugList.length) return;
        e.preventDefault(); sugSel = (sugSel + (e.key === 'ArrowDown' ? 1 : sugList.length - 1)) % sugList.length;
        [...sug.querySelectorAll('button')].forEach((b, i) => b.classList.toggle('on', i === sugSel));
      } else if (e.key === 'Enter') { e.preventDefault(); pickSug(sugSel); }
      else if (e.key === 'Escape') { sug.replaceChildren(); sugList = []; F.inp.blur(); }
    });
  }
  swap.onclick = () => { [ui.a, ui.b] = [ui.b, ui.a]; A.inp.value = ui.a ? ui.a.name : ''; B.inp.value = ui.b ? ui.b.name : ''; go(); };
  earlier.onclick = () => grow('before');
  later.onclick = () => grow('after');
  // the end of the list came into sight (scrolled to): the later journeys come by themselves
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) grow('after'); }).observe(more);

  function setEnd(which, e, search = true) {
    if (aim === which) aimAt(null); // (given another way: the field no longer waits for the map)
    ui[which] = e;
    (which === 'a' ? A : B).inp.value = e ? e.name : '';
    if (search) go();
  }

  // ------------------------------------------------------------------ the mode: Hledat / ⇄ Spojení
  const btnFind = $('qmFind'), btnSpoj = $('qmSpoj');
  function setMode(on, { focus = true } = {}) {
    ui.open = on;
    panel.classList.toggle('spoj-mode', on);
    if (!on) panel.classList.remove('sp-compact');
    if (!on) aimAt(null);
    host.hidden = !on;
    btnFind.setAttribute('aria-pressed', String(!on)); btnSpoj.setAttribute('aria-pressed', String(on));
    if (on) {
      mhd.loadStops(); mhd.load().then(markWay);
      if (focus) { if (!ui.a) A.inp.focus(); else if (!ui.b) B.inp.focus(); }
      if (ui.list.length) renderList();
    } else {
      if (location.hash.startsWith('#spojeni/') && ui.sel < 0) history.replaceState(history.state, '', location.pathname + location.search);
    }
    paintBar();
    if (onMode) onMode(on); // (the row of the panel marks Hledat or Spojení, src/main.js paintModes)
  }
  btnFind.onclick = () => { setMode(false); $('q').focus(); };
  btnSpoj.onclick = () => setMode(!ui.open);

  setInterval(tickLive, 15000); // (the list and an open card of a journey: the live delays)

  // ------------------------------------------------------------------ the link
  const tokOf = e => (e.kind === 'stop' ? `z${e.num}` : e.kind === 'me' ? 'ja' : `${(+e.lat).toFixed(5)},${(+e.lon).toFixed(5)},${encodeURIComponent(e.name)}`);
  const linkOf = () => `#spojeni/${tokOf(ui.a)}/${tokOf(ui.b)}${whenTok()}`;
  function writeHash() {
    if (!ui.a || !ui.b) return;
    history.replaceState(history.state, '', linkOf());
  }
  // opened from a link: the ends, the time, the search
  async function fromHash(hash, quiet = false) { // (quiet: opened from Moje, not from a link somebody followed)
    const m = hash.match(/^#spojeni\/([^/&]+)\/([^/&]+)(?:&([op])=(\d{3,4}))?/);
    if (!m) return false;
    if (openPanel) openPanel();
    setMode(true, { focus: false });
    await mhd.loadStops();
    const parse = async (tok, which) => {
      if (tok === 'ja') { await useMe(which); return ui[which]; }
      const z = tok.match(/^z(\d+)$/);
      if (z) return mhd.stops()[z[1]] ? { kind: 'stop', num: +z[1], name: stopName(+z[1]) } : null;
      const p = tok.split(',');
      if (p.length >= 3 && Number.isFinite(+p[0]) && Number.isFinite(+p[1])) return { kind: 'place', lat: +p[0], lon: +p[1], name: decodeURIComponent(p.slice(2).join(',')) || 'Místo' };
      return null;
    };
    const a = await parse(m[1], 'a'), b = await parse(m[2], 'b');
    if (m[3]) { const v = m[4].padStart(4, '0'); ui.when = m[3] === 'p' ? 'arr' : 'dep'; ui.at = nextAt(+v.slice(0, 2) * 3600 + +v.slice(2) * 60, ui.when); tm.value = `${v.slice(0, 2)}:${v.slice(2)}`; } else { ui.when = 'now'; ui.at = null; }
    markWhen();
    setEnd('a', a, false); setEnd('b', b, false);
    if (!quiet) track('Odkaz', { co: 'spojeni' });
    go();
    return true;
  }

  async function grow(dir) {
    if (growing || ui.busy || !ui.a || !ui.b) return;
    const rides = ui.list.filter(j => !j.walkOnly);
    if (!rides.length || ui.end[dir] || rides.length >= GROW_MAX) return;
    const my = token, P = plannerFor();
    if (!P) return;
    const md = dir === 'after' ? 'later' : 'earlier', from = dir === 'after' ? rides[rides.length - 1].dep + 60 : rides[0].dep;
    growing = dir; renderList();
    const found = await P.options(epOf(ui.a), epOf(ui.b), ui.date, from, { n: 5, mode: md });
    growing = null;
    if (my !== token) return; // (another search meanwhile: its list stands)
    const seen = new Set(rides.map(sigOf)), add = found.filter(j => !seen.has(sigOf(j)));
    if (!add.length) { ui.end[dir] = true; renderList(); return; }
    track('Nástroj', { nastroj: 'spojeni', hodnota: md });
    const sel = ui.sel >= 0 ? ui.list[ui.sel] : null;
    ui.list = [...ui.list.filter(j => j.walkOnly), ...[...rides, ...add].sort((x, y) => x.dep - y.dep || x.arr - y.arr)];
    ui.sel = sel ? ui.list.indexOf(sel) : -1;
    // (rows coming in above: the rows in sight stay where they were, the scrolled box moves by what came in)
    const box = dir === 'before' ? scrollBox(opts) : null, h0 = box ? box.scrollHeight : 0;
    renderList();
    if (box) box.scrollTop += box.scrollHeight - h0;
    lessWalk(my, P, md, from, ui.date, false);
    // (still in sight after the step, the list being short: one more; the observer only tells when it comes into sight)
    if (dir === 'after') requestAnimationFrame(() => { const r = more.getBoundingClientRect(), b = box || scrollBox(opts); const bot = b ? b.getBoundingClientRect().bottom : innerHeight; if (!more.hidden && r.height && r.top < bot) grow('after'); });
  }
  // (the nearest ancestor that scrolls: the panel on a computer and, with the list open, on a phone)
  function scrollBox(e) { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p; } return null; }

  // ------------------------------------------------------------------ the search
  let token = 0;
  async function go({ from = null, mode = null } = {}) {
    markWhen(); paintFav();
    if (!ui.a || !ui.b) { ui.list = []; ui.sel = -1; renderList(); return; }
    const la = llOf(ui.a), lb = llOf(ui.b);
    if ((ui.a.num && ui.a.num === ui.b.num) || (la && lb && distM(la[0], la[1], lb[0], lb[1]) < 30)) { ui.list = []; ui.sel = -1; renderList('Odkud i kam je totéž místo.'); return; }
    const my = ++token;
    ui.busy = true; renderList();
    await mhd.loadStops(); await mhd.load();
    if (my !== token) return;
    const P = plannerFor();
    if (!P) { ui.busy = false; renderList('Jízdní řád se nepodařilo načíst.'); return; }
    const n = mhd.now();
    const md = mode || (ui.when === 'arr' ? 'arrive' : 'later');
    const t = from != null ? from : ui.when !== 'now' && ui.at != null ? ui.at : n.sec;
    const t0 = performance.now();
    let list = await P.options(epOf(ui.a), epOf(ui.b), n.date, t, { n: 5, mode: md });
    stat.search = Math.round(performance.now() - t0);
    if (my !== token) return;
    const ends = { a: { ...ui.a, ll: la }, b: { ...ui.b, ll: lb } };
    if (md === 'arrive' && from == null && list.length) {
      if (walk && !walk.ready()) await walk.load();
      if (my !== token) return;
      const over = Math.max(...list.map(j => { geom(j, ends); return j.arr - t; }));
      if (over > 0) {
        const more = await P.options(epOf(ui.a), epOf(ui.b), n.date, t - Math.ceil(over / 60) * 60, { n: 5, mode: md });
        if (my !== token) return;
        const seen = new Set();
        const all = [...more, ...list].filter(j => { geom(j, ends); const k = sigOf(j); return seen.has(k) ? false : (seen.add(k), true); }).sort((x, y) => x.dep - y.dep || x.arr - y.arr);
        const inTime = all.filter(j => j.arr <= t);
        list = (inTime.length ? inTime : all).slice(-5); // (none in time: the nearest ones, each with its warning in the list)
      }
    }
    ui.busy = false; // (only now: the list of the search before must not show again while the walks are measured)
    if (!list.length && from != null) { toast(md === 'later' ? 'Později už nic nejede (hledám 3 hodiny dopředu).' : 'Dřív nic nejelo.'); renderList(); return; }
    // on foot all the way, when the ends are close (1.5 km at most): first, the rides after it
    const d = la && lb ? distM(la[0], la[1], lb[0], lb[1]) : Infinity;
    if (d <= 1500 && from == null) {
      const sec = walkSec(d, wayNow().walk), s0 = md === 'arrive' ? t - sec : t;
      list = [{ walkOnly: true, byArr: md === 'arrive', dep: s0, arr: s0 + sec, rides: 0, legs: [{ kind: 'walk', from: null, to: null, sec, m: Math.round(d), dep: s0, arr: s0 + sec }] }, ...list];
    }
    ui.ends = ends;
    ui.date = n.date; // (the day the times of the list count from)
    wxLoad();
    ui.list = list; ui.end = {}; ui.sel = list.findIndex(j => !j.walkOnly); if (ui.sel < 0) ui.sel = list.length ? 0 : -1;
    track('Nástroj', { nastroj: 'spojeni', hodnota: from != null ? md : ui.when === 'arr' ? 'prijezd' : ui.when === 'dep' ? 'odjezd' : 'ted' });
    writeHash();
    renderList();
    if (ui.sel >= 0) pick(ui.sel, { fit: true });
    lessWalk(my, P, md, t, n.date, from == null); // (after the list is shown: it takes as long as the search again)
  }
  const LAZY = 2, NEAR = 4, LESS = 120;
  const sigOf = j => j.legs.map(l => (l.kind === 'ride' ? `${l.ti}:${l.fromPos}-${l.toPos}` : `w${l.from}-${l.to}`)).join('|');
  const minOf = sec => Math.floor(Math.round(sec) / 60); // (the minute the list shows, hhmm)
  const footOf = j => j.legs.reduce((s, l) => s + (l.kind === 'walk' ? l.sec : 0), 0);
  // (which journey of a list j walks less than, while comparable with it: [that journey, the seconds saved] or null)
  const lessThan = (j, list) => { const k = list.filter(x => x !== j && Math.abs(minOf(j.dep) - minOf(x.dep)) <= NEAR && Math.abs(minOf(j.arr) - minOf(x.arr)) <= NEAR && footOf(x) - footOf(j) >= LESS).sort((x, y) => Math.abs(x.dep - j.dep) - Math.abs(y.dep - j.dep))[0]; return k ? [k, footOf(k) - footOf(j)] : null; };
  async function lessWalk(my, P, md, t, date, first) {
    if (!ui.list.some(j => !j.walkOnly && footOf(j) >= LESS)) return; // (nothing to save)
    const found = await P.options(epOf(ui.a), epOf(ui.b), date, t, { n: 8, mode: md, lazy: LAZY });
    if (my !== token) return;
    const peers = ui.list.filter(j => !j.walkOnly), have = new Set(peers.map(sigOf)), add = new Map(); // peer -> its variant
    for (const j of peers) geom(j, ui.ends); // (the walks of both along the pavements: the same measure)
    for (const a of found) {
      if (have.has(sigOf(a))) continue;
      geom(a, ui.ends);
      if (first && (md === 'arrive' ? a.arr > t : a.dep < t - 30)) continue; // (the time asked for holds for a variant too)
      // (the journey of the list it stands beside: the one that leaves nearest to it)
      const lt = lessThan(a, peers);
      if (!lt) continue;
      const was = add.get(lt[0]);
      if (was && (footOf(was) < footOf(a) || (footOf(was) === footOf(a) && was.dep >= a.dep))) continue;
      add.set(lt[0], a);
    }
    const sel = ui.sel >= 0 ? ui.list[ui.sel] : null;
    const all = [...peers, ...add.values()].sort((x, y) => x.dep - y.dep || x.arr - y.arr);
    // the tag: every journey that walks less than a comparable one beside it, also one the planner offered by itself
    // (a ride of one stop that lets one leave half a minute later); the minutes on foot it saves
    let tagged = false;
    for (const j of all) { const lt = lessThan(j, all), v = lt ? Math.max(1, Math.round(lt[1] / 60)) : 0; if ((j.less || 0) !== v) { j.less = v; tagged = true; } }
    if (!add.size && !tagged) return;
    ui.list = [...ui.list.filter(j => j.walkOnly), ...all];
    ui.sel = sel ? ui.list.indexOf(sel) : -1;
    renderList();
  }

  // ------------------------------------------------------------------ live: delays, the vehicle, the changes
  const delayOf = ti => { const d = layers.liveDelays().get(ti); return d === undefined ? null : d; };
  // a journey with the live delays put in: every ride { …, d (min or null), eDep, eArr }, the changes checked
  function live(j) { return liveJourney(j, l => delayOf(l.ti)); }
  // "Příjezd do": by how many minutes (of the clock shown) a journey ends later than asked for; 0 in time or not asked
  const lateBy = arrive => (ui.when === 'arr' && ui.at != null ? Math.max(0, Math.floor(Math.round(arrive) / 60) - Math.floor(ui.at / 60)) : 0);
  function stepsOf(l) {
    const tt = mhd.timetable();
    if (!tt || typeof tt.wa !== 'string') return null;
    const w = tt.wa[l.ti >> 2], wb = tt.wb || {};
    const postOk = (num, q) => { const v = wb[`${num}|${q || 0}`]; return v === undefined ? true : v === 2 ? false : null; };
    const m = vehicleOf(l);
    return { low: m && m.live && m.lowFloor === false ? false : w === '1' ? true : w === '2' ? false : null, on: postOk(l.from, l.postFrom), off: postOk(l.to, l.postTo) };
  }
  // a journey without barriers: every ride in a low-floor vehicle, from a post and to a post one can use without help
  const stepFree = j => { const r = j.legs.filter(l => l.kind === 'ride'); return r.length > 0 && r.every(l => { const s = stepsOf(l); return !!s && s.low === true && s.on === true && s.off === true; }); };
   // (window.__spoj.steps(): what the sign goes by)
  const FREE_SAYS = 'Bez bariér: nízkopodlažní vozy a nástupiště, kde se nastoupí i vystoupí bez pomoci. Schody na pěší cestě mapa nezná.';
  // the vehicle running a trip just now (as the stop card does it), or null
  function vehicleOf(ride) {
    for (const m of layers.lineVehicles(ride.line)) {
      if (!m.live) { if (m.id === ride.ti) return m; continue; }
      const pv = layers.matchPlan(m);
      if (pv && pv.id === ride.ti) return m;
    }
    return null;
  }
  // the place in the trip's profile of the stop that vehicle passed last (-1: not known; past the boarding stop: fromPos + 1)
  function lastPosOf(m, ride) {
    const tt = mhd.timetable();
    const p = tt && tt.profiles[ride.pi];
    if (!m || !p) return null;
    const nums = p[5] || [];
    let lastPos = -1;
    if (m.live && m.last) { for (let i = 0; i <= ride.fromPos; i++) if (nums[i] === m.last) lastPos = i; if (lastPos < 0 && nums.indexOf(m.last) > ride.fromPos) lastPos = ride.fromPos + 1; }
    else if (!m.live && Number.isFinite(m.seg)) lastPos = m.seg;
    return lastPos;
  }
  // where that vehicle is against the stop where one gets on
  function whereIs(m, ride) {
    const tt = mhd.timetable();
    const p = tt && tt.profiles[ride.pi];
    const lastPos = lastPosOf(m, ride);
    if (lastPos == null) return null;
    const NAME = { tram: 'Šalina', trol: 'Trolejbus', bus: 'Autobus' };
    const veh = `${NAME[ride.type] || 'Vůz'} ${ride.line}${m.live && m.vid ? ` (ev. č. ${m.vid})` : ''}`;
    const how = m.live ? (m.lowFloor ? ' Nízkopodlažní.' : '') : ' (Podle jízdního řádu, živou polohu nemá.)';
    if (lastPos < 0) return `${veh} je na cestě, polohu u zastávek zatím neznám.`;
    if (lastPos > ride.fromPos) return `${veh} už je za zastávkou ${stopName(ride.from)}.`;
    const away = ride.fromPos - lastPos;
    if (away === 0) return `${veh} je na zastávce ${stopName(ride.from)}.${how}`;
    return `${veh} je za zastávkou ${tt.names[p[4][lastPos]]}, ${plural(away, 'zastávka', 'zastávky', 'zastávek')} od vás.${how}`;
  }

  // ------------------------------------------------------------------ the list
  const changes = j => (j.walkOnly ? 'pěšky' : j.rides <= 1 ? 'bez přestupu' : plural(j.rides - 1, 'přestup', 'přestupy', 'přestupů'));
  function chipsOf(j) {
    const c = el('span', 'sp-chips');
    j.legs.forEach((l, i) => {
      if (i) c.append(el('span', 'sp-arrow', '›'));
      if (l.kind === 'ride') c.append(badge(l.line, l.type));
      else c.append(el('span', 'sp-walk', `pěšky ${mins(l.sec)}`));
    });
    // (the sign of a journey without barriers, at the end of the row)
    if (stepFree(j)) { const f = el('span', 'sp-free'); f.innerHTML = pxIcon('chair'); f.title = FREE_SAYS; f.setAttribute('role', 'img'); f.setAttribute('aria-label', 'bez bariér'); c.append(f); }
    return c;
  }
  function renderList(msg = null) {
    opts.replaceChildren();
    note.hidden = !!(ui.a && ui.b) || !!msg;
    if (msg) { opts.append(el('li', 'sp-empty', msg)); more.hidden = moreTop.hidden = true; return; }
    if (ui.busy) { opts.append(el('li', 'sp-empty', 'Hledám spojení…')); more.hidden = moreTop.hidden = true; return; }
    // the ends of the list (grow): the earlier journeys above it, the later ones under it, what is being looked for
    const nRides = ui.list.filter(j => !j.walkOnly).length, full = nRides >= GROW_MAX;
    more.hidden = !nRides;
    moreTop.hidden = !nRides || !!ui.end.before || (full && growing !== 'before');
    earlier.disabled = growing === 'before'; earlier.textContent = growing === 'before' ? 'Hledám dřívější spoje…' : '▲ Dřívější spoje';
    later.hidden = !!ui.end.after || full || growing === 'after';
    moreSay.textContent = growing === 'after' ? 'Hledám další spoje…' : ui.end.after ? 'Další spoje v příštích třech hodinách nejedou.' : '';
    if (!ui.a || !ui.b) return;
    if (!ui.list.length) { opts.append(el('li', 'sp-empty', ui.when === 'arr' ? 'Do toho času nic nedojede.' : wayNow().low ? 'Bez bariér jsem v nejbližších třech hodinách žádné spojení nenašel. Zkuste jinou zastávku poblíž, nebo volbu Pomaleji.' : 'V nejbližších třech hodinách jsem žádné spojení nenašel.')); return; }
    const nowSec = daySec();
    const Ls = ui.list.map(j => live(j)), gone = i => !ui.list[i].walkOnly && Ls[i].leave - nowSec < -30 && rodeOf(ui.list[i]).on < 0;
    const rides = ui.list.map((j, i) => [j, Ls[i]]).filter(([j], i) => !j.walkOnly && !gone(i));
    const fastest = Math.min(...rides.map(([, L]) => L.arrive)), fewest = Math.min(...rides.map(([j]) => j.rides));
    ui.list.forEach((j, i) => {
      const L = Ls[i];
      const li = el('li', `${i === ui.sel ? 'sel' : ''}${gone(i) ? ' gone' : ''}`);
      const b = el('button', 'sp-opt'); b.type = 'button'; b.setAttribute('aria-pressed', String(i === ui.sel));
      const top = el('span', 'sp-top');
      if (j.walkOnly) top.append(el('span', 'sp-times', `Pěšky ${span(j.legs[0].sec)}`), el('span', 'sp-in', `asi ${Math.round(walkM(j.legs[0]) / 50) * 50} m`));
      else {
        top.append(el('span', 'sp-times', `${hhmm(L.leave)} → ${hhmm(L.arrive)}`));
        const inS = L.leave - nowSec;
        const rode = rodeOf(j);
        top.append(rode.on >= 0 ? el('span', 'sp-in soon', '✓ jedete') : el('span', `sp-in${inS < 0 ? ' gone' : inS < 300 ? ' soon' : ''}`, inS < -30 ? 'ujelo' : inS < 60 ? 'teď' : inS < 5400 ? `za ${span(inS)}` : `v ${hhmm(L.leave)}`));
      }
      const sub = el('span', 'sp-sub');
      if (!j.walkOnly) {
        sub.append(`${span(L.arrive - L.leave)} · ${changes(j)}`);
        if (!gone(i) && L.arrive === fastest && rides.length > 1) sub.append(' ', el('span', 'sp-tag', 'nejdřív v cíli'));
        if (!gone(i) && j.rides === fewest && j.rides === 1 && rides.some(([x]) => x.rides > 1)) sub.append(' ', el('span', 'sp-tag', 'bez přestupu'));
        if (L.risk) sub.append(' ', el('span', 'sp-tag warn', L.risk === 'lost' ? 'přestup nestihnete' : 'přestup ohrožen'));
        if (j.less) { const tg = el('span', 'sp-tag', 'méně chůze'); tg.title = `Pěšky o ${j.less} min méně než spojení vedle, za cenu přestupu navíc`; sub.append(' ', tg); }
        if (lateBy(L.arrive)) sub.append(' ', el('span', 'sp-tag warn', `v cíli o ${lateBy(L.arrive)} min později`));
        if (L.first && L.first.d) sub.append(' ', el('span', `sp-delay ${L.first.d > 0 ? 'late' : 'early'}`, `${L.first.d > 0 ? '+' : ''}${L.first.d} min`));
        b.append(top, chipsOf(j), sub);
      } else b.append(top);
      b.onclick = () => pick(i, { fit: true });
      li.append(b); opts.append(li);
    });
    const j = ui.list[ui.sel];
    if (j) { const L = live(j); barT.textContent = `${ui.a.name} → ${ui.b.name}${j.walkOnly ? ' · pěšky' : ` · ${hhmm(L.leave)} → ${hhmm(L.arrive)}`}`; }
  }
  function tickLive() {
    if (ui.sel >= 0) wxLoad();
    if (ui.open && ui.list.length) renderList();
    if (ui.cardBox && ui.cardBox.isConnected && ui.sel >= 0) fillCard(ui.list[ui.sel], ui.cardBox);
  }

  function pick(i, { fit = false, open = false } = {}) {
    ui.sel = i; renderList();
    const j = ui.list[i];
    if (!j) return;
    if (!state.layers.mhd && !j.walkOnly) setLayer('mhd', true); // (the vehicles and their delays)
    // (picked again, or its card opened from the bar: whether it went is asked anew; who got on is kept, see memOf)
    if (ui.mem && ui.mem.j === j) ui.mem.m.miss = null;
    if (!open && !j.walkOnly) {
      if (ui.cardBox && ui.cardBox.isConnected && !$('card').hidden) $('cardClose').click(); // (the card of the journey before)
      ui.cardBox = null;
      if (isPhone() && ui.open) panel.classList.add('sp-compact');
      if (fit) fitJourney(j);
      paintBar();
      return;
    }
    const box = el('div', 'sec sp-card');
    ui.cardBox = box;
    fillCard(j, box);
    const L = live(j);
    card({ kind: 'spojeni', title: `${ui.a.name} → ${ui.b.name}`, rows: [], extra: box, action: rideButton(L.first) });
    const m = L.first && vehicleOf(L.first);
    layers.selectVehicle(m && Number.isFinite(m.X) ? m.id : null);
    // a phone: the form folds into a bar, the map stays in sight between the panel and the card
    if (isPhone() && ui.open) panel.classList.add('sp-compact');
    if (fit) fitJourney(j);
    paintBar();
  }
  function rideButton(first) {
    const m = first && vehicleOf(first);
    // on board already (said in the bar, found out by the position, or the map rides with another vehicle of the line):
    // the card says so, and a click takes it back
    const j = ui.list[ui.sel], onBoard = !!(j && ui.mem && ui.mem.j === j && ui.mem.m.on >= 0);
    if (onBoard && !(m && m.live && riding() === m.id)) {
      const b = el('button', 'pbtn ride-btn', '✓ Jedete'); b.type = 'button'; b.setAttribute('aria-pressed', 'true');
      b.title = 'Jste ve voze tohoto spojení. Klepnutím: nejedu.';
      b.onclick = () => { notOn(j); $('cardClose').click(); };
      return b;
    }
    if (!m || !m.live) return null;
    const on = riding() === m.id;
    const b = el('button', 'pbtn ride-btn', on ? '■ Vystoupit' : '▶ Nastoupit'); b.type = 'button';
    b.dataset.id = String(m.id); // (main.js rideBtns switches it with the ride, as in the stop card)
    b.setAttribute('aria-pressed', String(on));
    b.title = `Mapa pojede s vozem linky ${first.line}`;
    b.onclick = () => { if (riding() === m.id && stopRide) { stopRide(); return; } board(ui.list[ui.sel], m); };
    return b;
  }
  // The visitor says they got on (Nastoupit in the card of the journey, "Jedu" in the bar): the bar
  // follows the journey from now on (src/spojstav.js); with a live vehicle the map rides along (main.js startRide).
  function board(j, m = null) {
    if (!j) return;
    const L = live(j), mem = memOf(j);
    sayState({ now: barNow(), L }, mem, 'on');
    const l = L.legs.filter(x => x.kind === 'ride')[mem.on], v = m || (l && vehicleOf(l));
    if (v && v.live && riding() !== v.id) startRide(v); // (counted there as Nástroj nastoupit; it says "Jedete linkou …" itself)
    else { if (!v || !v.live) track('Nástroj', { nastroj: 'nastoupit', hodnota: (l || {}).line || '' }); if (l) toast(`Nastoupeno: linka ${l.line}, vystoupíte na zastávce ${stopName(l.to)}.`, 5000); }
    paintBar();
  }
  // … or that they did not (the ride went, or the bar guessed a ride that was none): the next journey before the first
  // ride, "Hledat znovu" at a change
  function notOn(j) {
    if (!j) return;
    // a journey planned anew from a vehicle the visitor is not in after all: the journey before comes back, and that
    // vehicle is not asked about again
    if (ui.prev && ui.mem && ui.mem.j === j && ui.mem.m.note) {
      const p = ui.prev; ui.prev = null;
      track('Nástroj', { nastroj: 'spojeni', hodnota: 'novy-postup-zpet' });
      ui.list = p.list; ui.end = {}; ui.a = p.a; ui.ends = p.ends; ui.date = p.date; ui.when = p.when; ui.at = p.at; ui.mem = p.mem;
      A.inp.value = ui.a ? ui.a.name : ''; markWhen();
      if (ui.mem) { ui.mem.m.notMate = p.mate; ui.mem.m.else = null; }
      ui.mate = null;
      writeHash(); renderList(); pick(p.sel);
      toast('Zpět u původního spojení.', 4000);
      return;
    }
    const L = live(j), mem = memOf(j);
    // (a map riding with a vehicle of this journey would put the visitor on board again at once)
    if (riding() != null && stopRide && L.legs.some(l => l.kind === 'ride' && (v => v && v.id === riding())(vehicleOf(l)))) stopRide();
    sayState({ now: barNow(), L }, mem, 'off');
    track('Nástroj', { nastroj: 'spojeni', hodnota: 'lista-nejedu' });
    if (mem.miss && mem.miss.k === 0 && nextJourney() >= 0) moveOn(false); else paintBar();
  }
  function paintProgress(j, ol = ui.cardBox && ui.cardBox.querySelector('.sp-tl')) {
    if (!ol || !ol.spans) return;
    const sp = ol.spans, L = live(j), now = barNow(), mem = memOf(j), rides = L.legs.filter(l => l.kind === 'ride');
    const on = mem.on == null ? -1 : mem.on, out = !!(mem.out && mem.out.k === on);
    let hit = null, p = 0; // (the row of the mark and how far down it, 0..1)
    const find = (kind, k) => sp.find(x => x.kind === kind && (k == null || x.k === k));
    const near = now >= L.leave - 600 && now <= L.arrive + 300; // (a journey far ahead or long done: no mark)
    if (!near || j.walkOnly) hit = null;
    else if (mem.miss) hit = find('board', mem.miss.k);
    else if (on >= 0 && now < rides[on].eArr && !out) { hit = find('ride', on); const r = rides[on]; p = Math.max(0, Math.min(1, (now - r.eDep) / Math.max(1, r.eArr - r.eDep))); }
    else if (on + 1 < rides.length && now >= rides[on + 1].eDep) hit = find('board', on + 1); // (at the stop: the vehicle late, or the question open)
    else {
      const t = out ? Math.max(now, rides[on].eArr) : now;
      hit = sp.find(x => (x.kind === 'walk' || x.kind === 'start' || x.kind === 'goal') && x.a <= t && t <= x.b && x.b > x.a) || (t < L.leave ? sp[0] : t >= L.arrive ? sp[sp.length - 1] : null);
      if (hit && hit.b > hit.a) p = Math.max(0, Math.min(1, (t - hit.a) / (hit.b - hit.a)));
    }
    const key = hit ? `${sp.indexOf(hit)}|${Math.round(p * 200)}|${mem.miss ? 1 : 0}` : '';
    if (ol.dataset.at === key) return;
    ol.dataset.at = key;
    const at = hit ? sp.indexOf(hit) : -1;
    for (const [i, x] of sp.entries()) { x.li.classList.toggle('past', at >= 0 && i < at); x.li.classList.toggle('now', i === at); }
    let me = ol.querySelector('.sp-here');
    if (!hit) { if (me) me.remove(); ol.classList.remove('going'); return; }
    ol.classList.add('going');
    if (!me) { me = el('span', 'sp-here'); me.title = 'Tady jste'; me.setAttribute('aria-label', 'Tady jste'); me.setAttribute('role', 'img'); }
    const rail = hit.li.querySelector('.rail');
    if (me.parentElement !== rail) rail.append(me);
    me.classList.toggle('miss', !!mem.miss);
    const point = hit.b === hit.a; // (a stop, a start, a target: the mark on its square)
    me.classList.toggle('pt', point); // (on a stop its time stands left of the mark: no "teď" there)
    me.style.top = point ? '7px' : `${(p * 100).toFixed(1)}%`;
    rail.style.setProperty('--p', point ? '0' : String(p));
  }
  function fillCard(j, box) {
    const L = live(j), nowSec = daySec();
    box.replaceChildren();
    const W = wxOf(j);
    box.append(el('p', 'sp-sum', j.walkOnly ? `Pěšky ${span(j.legs[0].sec)}, asi ${Math.round(walkM(j.legs[0]) / 50) * 50} m` : `${hhmm(L.leave)} → ${hhmm(L.arrive)} · ${span(L.arrive - L.leave)} · ${changes(j)}`));
    if (!j.walkOnly && stepFree(j)) { const f = el('p', 'sp-freep'); f.innerHTML = pxIcon('chair'); f.append(FREE_SAYS); box.append(f); }
    if (!j.walkOnly && lateBy(L.arrive)) box.append(el('p', 'sp-late', `V cíli budete v ${hhmm(L.arrive)}, o ${lateBy(L.arrive)} min později, než jste chtěli (${hhmm(ui.at)}).`));
    // the figure that walks it (src/chodec.js): what it is, and a button to it (the map zoomed out shows it small)
    if (fig && j.legs.some(l => l.kind === 'walk')) {
      const me = el('div', 'sp-me');
      me.append(el('p', '', `Postavička v mapě jde pěší úseky rychlostí ${String(Math.round(wayNow().walk * 36) / 10).replace('.', ',')} km/h a na zastávce čeká, přesně jako byste šli podle plánu. Podle modré tečky své polohy uvidíte, jestli jdete napřed, nebo pozadu.`));
      const go = el('button', 'pbtn small', 'Ukázat postavičku'); go.type = 'button';
      go.onclick = () => {
        const f = selfAt(j);
        if (!f) { const n = nowFine(), on = selfSteps(j).some(s => s.kind === 'ride' && n >= s.t0 && n < s.t1); toast(on ? 'Postavička teď jede ve voze.' : 'Postavička už je v cíli, cesta skončila.'); return; }
        fitFree(f.X - 50, f.Y - 25, f.X + 50, f.Y + 25, 3);
        track('Nástroj', { nastroj: 'spojeni', hodnota: 'postavicka' });
      };
      me.append(go);
      box.append(me);
    }
    // the vehicle of the first ride: where it is and in how long it comes
    if (L.first) {
      const m = vehicleOf(L.first), w = whereIs(m, L.first);
      const lb = el('div', 'sp-live');
      const head = el('div', 'sp-live-h');
      const left = el('span'); left.append(badge(L.first.line, L.first.type), ` → ${L.first.hs}`);
      if (L.first.d != null) left.append(' ', el('span', `sp-delay ${L.first.d > 0 ? 'late' : L.first.d < 0 ? 'early' : 'ok'}`, L.first.d ? `${L.first.d > 0 ? '+' : ''}${L.first.d} min` : 'včas'));
      const inS = L.first.eDep - nowSec, rode = rodeOf(j);
      head.append(left, el('b', `sp-count${rode.on >= 0 ? ' on' : ''}`, rode.miss ? 'ujelo' : rode.on >= 0 ? '✓ jedete' : inS < -30 ? 'ujelo' : inS < 60 ? 'teď' : inS < 5400 ? `${span(inS)}` : hhmm(L.first.eDep)));
      lb.append(head, el('p', '', w || (inS > 1800 ? 'Vůz ještě nevyjel.' : 'Vůz zatím v mapě nevidím, čas je podle jízdního řádu.')));
      if (L.legs[0].kind === 'walk') { const leaveIn = L.first.eDep - L.legs[0].sec - nowSec; lb.append(el('p', 'sp-go', leaveIn < 0 ? `Na zastávku ${stopName(L.first.from)} je to pěšky ${span(L.legs[0].sec)}: už byste měli jít.` : `Vyrazte na zastávku ${stopName(L.first.from)} ${leaveIn < 60 ? 'hned' : `za ${span(leaveIn)}`} (pěšky ${span(L.legs[0].sec)}).`)); }
      if (m && Number.isFinite(m.X)) {
        const show = el('button', 'pbtn small', 'Ukázat vůz'); show.type = 'button';
        show.onclick = () => { layers.selectVehicle(m.id); const s = mhd.stops()[L.first.from]; if (s) { const [X, Y] = layers.llToImg(s[1], s[2]); fitFree(Math.min(m.X, X), Math.min(m.Y, Y), Math.max(m.X, X), Math.max(m.Y, Y), 2.5); } };
        lb.append(show);
      }
      if (L.risk) lb.append(el('p', 'sp-warn', L.risk === 'lost' ? 'Se současným zpožděním přestup nestihnete. Zkuste další spojení.' : 'Přestup bude těsný, vůz má zpoždění.'));
      if (W) lb.append(wxLine(j, W));
      box.append(lb);
    } else if (W) box.append(wxLine(j, W)); // (on foot all the way: under the summary)
    // the time line
    const ol = el('ol', 'sp-tl');
    ol.spans = []; // (each row with its stretch of time, for the mark "tady jste": paintProgress)
    const row = (cls, time, plan, body, color, at = null) => {
      const li = el('li', cls);
      if (at) ol.spans.push(Object.assign({ li }, at));
      const t = el('span', 'tm');
      if (plan != null && Math.round(plan / 60) !== Math.round(time / 60)) t.append(el('s', '', hhmm(plan)));
      if (time != null) t.append(el('span', '', hhmm(time)));
      const rail = el('span', 'rail'); if (color) rail.style.setProperty('--c', color);
      li.append(t, rail, body);
      ol.append(li);
    };
    const COL = { tram: '#c8202a', trol: '#2f8f3a', bus: '#2f6fb7' };
    const post = p => (p ? ` · nást. ${p}` : '');
    const place = (name, cls, time) => { const b = el('span', 'tx'); b.append(el('b', '', name)); row(`stop end ${cls}`, time, null, b, null, { kind: cls, a: time, b: time }); };
    // (a start or a target that is not a stop: its own line at the top / the bottom)
    if (L.legs[0].kind === 'walk' && ui.ends && !ui.ends.a.num) place(ui.ends.a.name, 'start', L.legs[0].kind === 'walk' && L.first ? L.first.eDep - L.legs[0].sec : j.dep);
    let rk = -1; // (which ride of the journey: the rows of the mark "tady jste")
    const nextDep = i => { for (let n = i + 1; n < L.legs.length; n++) if (L.legs[n].kind === 'ride') return L.legs[n].eDep; return L.arrive; };
    L.legs.forEach((l, i) => {
      if (l.kind === 'walk') {
        const b = el('span', 'tx');
        const to = l.to != null ? `na zastávku ${stopName(l.to)}` : `do cíle, ${endName(null, 'b')}`;
        const s = el('span', 's', `pěšky ${span(l.sec)}, ${l.routed ? '' : 'asi '}${Math.round(walkM(l) / 10) * 10} m, ${to}`);
        const wl = W && W.byLeg.get(i);
        if (wl) s.append(' · ', el('span', `sp-wet wx-${wl.tone}`, wl.short));
        b.append(s);
        row('walk', null, null, b, null, { kind: 'walk', a: i ? L.legs[i - 1].eArr : L.leave, b: nextDep(i) });
        if (wl) { const ic = vzitIcon(wl.icon, 22); ic.classList.add('sp-tl-wx'); ol.lastChild.querySelector('.rail').append(ic); }
        return;
      }
      const prev = L.legs[i - 1];
      if (prev && prev.kind === 'ride') { const b = el('span', 'tx'); b.append(el('span', 's', `přestup na stejné zastávce, ${span(l.eDep - prev.eArr)}`)); row('change', null, null, b, null, { kind: 'walk', a: prev.eArr, b: l.eDep }); }
      rk++;
      const c = COL[l.type] || COL.bus;
      const sf = stepsOf(l), bar = () => el('span', 'sp-nofree', ' · nástupiště s bariérou');
      const b1 = el('span', 'tx'); b1.append(el('b', '', stopName(l.from)), post(l.postFrom)); if (sf && sf.on === false) b1.append(bar()); b1.append(el('br'));
      const ln = el('span', 's'); ln.append(badge(l.line, l.type), ` → ${l.hs}`); b1.append(ln);
      row('stop', l.eDep, l.dep, b1, c, { kind: 'board', k: rk, a: l.eDep, b: l.eDep });
      const b2 = el('span', 'tx'); b2.append(el('span', 's', `${plural(l.stops, 'zastávka', 'zastávky', 'zastávek')} · ${span(l.arr - l.dep)}${sf && sf.low === true ? ' · nízkopodlažní vůz' : ''}`));
      if (sf && sf.low === false) b2.firstChild.append(el('span', 'sp-nofree', ' · vůz není nízkopodlažní'));
      row('ride', null, null, b2, c, { kind: 'ride', k: rk, a: l.eDep, b: l.eArr });
      const b3 = el('span', 'tx'); b3.append(el('b', '', stopName(l.to)), post(l.postTo)); if (sf && sf.off === false) b3.append(bar());
      row('stop off', l.eArr, l.arr, b3, c, { kind: 'off', k: rk, a: l.eArr, b: l.eArr });
    });
    const last = L.legs[L.legs.length - 1];
    if (last.kind === 'walk' && ui.ends && !ui.ends.b.num) place(ui.ends.b.name, 'goal', L.arrive);
    box.append(ol);
    paintProgress(j, ol);
    box.append(el('span', 'credit', 'Plánované časy jsou přeškrtnuté, vedle očekávané podle živé polohy vozu (KORDIS JMK). Pěší úseky po chodnících a cestách z OpenStreetMap (© přispěvatelé OSM), kde je nenajdu, odhadem.'));
  }

  // ------------------------------------------------------------------ the drawing on the map
  // the geometry of a journey in image px, made once per journey and turn of the map (layers.stamp)
  function geom(j, ends = ui.ends) { // (ends: of a search still running, search(); else those of the list shown)
    const st = layers.stamp();
    if (j.g && j.g.stamp === st && j.g.wv === walkVer) return j.g;
    const tt = mhd.timetable();
    const img = ll => (ll ? layers.llToImg(ll[0], ll[1]) : null);
    const at = num => img(llOf({ num }));
    const endA = img(ends && ends.a.ll), endB = img(ends && ends.b.ll);
    const g = { stamp: st, wv: walkVer, rides: [], walks: [], wl: [], marks: [] }; // walks: polylines [x, y, …]; wl: the leg of each (i), or the ride a step across leads to (step)
    let last = null; // the end of the leg before (image px)
    for (let i = 0; i < j.legs.length; i++) {
      const l = j.legs[i];
      if (l.kind === 'walk') {
        const a = l.from == null ? endA : last || at(l.from);
        const nx = j.legs[i + 1];
        const b = l.to == null ? endB : nx && nx.kind === 'ride' ? rideStart(nx, tt) || at(l.to) : at(l.to);
        if (a && b) { const w = walkPts(a, b); g.walks.push(w.pts); g.wl.push({ i }); l.mRoute = w.m; }
        last = b;
        continue;
      }
      const pts = ridePts(l, tt, at);
      const prev = j.legs[i - 1];
      if (prev && prev.kind === 'ride' && last && pts.length >= 2 && Math.hypot(pts[0] - last[0], pts[1] - last[1]) > 0.5) { g.walks.push([last[0], last[1], pts[0], pts[1]]); g.wl.push({ i, step: true }); }
      if (pts.length >= 4) { g.rides.push({ pts, type: l.type, i }); last = [pts[pts.length - 2], pts[pts.length - 1]]; }
      else last = at(l.to);
    }
    // the stops where one gets on and off (names), the changes; A and B where the journey starts and ends
    const ridesL = j.legs.filter(l => l.kind === 'ride');
    ridesL.forEach((l, k) => {
      const r = g.rides[k];
      if (!r) return;
      // (a change, where one gets off or on between two rides: yellow; the first boarding and the last alighting are A
      // and B, or white squares when a walk leads to / from them)
      const first = k === 0, lastR = k === ridesL.length - 1;
      g.marks.push({ X: r.pts[0], Y: r.pts[1], name: stopName(l.from), kind: !first ? 'change' : j.legs[0].kind !== 'walk' ? 'a' : 'stop' });
      g.marks.push({ X: r.pts[r.pts.length - 2], Y: r.pts[r.pts.length - 1], name: stopName(l.to), kind: !lastR ? 'change' : j.legs[j.legs.length - 1].kind !== 'walk' ? 'b' : 'stop' });
    });
    if (j.legs[0].kind === 'walk' && endA) g.marks.push({ X: endA[0], Y: endA[1], name: ends.a.num ? '' : ends.a.name, kind: 'a' });
    if (j.legs[j.legs.length - 1].kind === 'walk' && endB) g.marks.push({ X: endB[0], Y: endB[1], name: ends.b.num ? '' : ends.b.name, kind: 'b' });
    // (getting off and on at the same place: one mark)
    g.marks = g.marks.filter((m, i, all) => !(m.kind === 'change' && all.some((o, k) => k < i && o.kind === 'change' && Math.hypot(o.X - m.X, o.Y - m.Y) < 4)));
    // (a change from one post to another of the same stop: the name once, over the step between them)
    g.marks.forEach((m, i, all) => { if (m.kind === 'change' && all.some((o, k) => k < i && o.kind === 'change' && o.name === m.name && Math.hypot(o.X - m.X, o.Y - m.Y) < 80)) m.name = ''; });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = p => { for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); } };
    g.rides.forEach(r => grow(r.pts)); g.walks.forEach(grow);
    g.bb = [x0, y0, x1, y1];
    j.g = g;
    applyWalks(j);
    return g;
  }
  function rideStart(l, tt) {
    const rt = mhd.tripRoute(l.ti), p = tt && tt.profiles[l.pi];
    if (!rt || !p || p[2][l.fromPos] < 0) return null;
    return mhd.pointAt(rt.shape, p[2][l.fromPos]).slice(0, 2);
  }
  // the way of a ride: along its trip's shape between the stops, where a stop is off the shape (a diversion) along the
  // route of another line between the two stops (mhd.between), else straight
  function ridePts(l, tt, at) {
    const rt = mhd.tripRoute(l.ti), p = tt && tt.profiles[l.pi];
    if (!rt || !p) return [];
    const ms = p[2], nums = p[5] || [], [xy, cm] = rt.shape, out = [];
    const push = (x, y) => { const n = out.length; if (n >= 2 && Math.abs(out[n - 2] - x) < 0.01 && Math.abs(out[n - 1] - y) < 0.01) return; out.push(x, y); };
    for (let i = l.fromPos; i < l.toPos; i++) {
      const a = ms[i], b = ms[i + 1];
      if (a >= 0 && b >= 0) {
        const lo = Math.min(a, b), hi = Math.max(a, b), piece = [...mhd.pointAt(rt.shape, lo).slice(0, 2)];
        for (let k = 0; k < cm.length; k++) if (cm[k] > lo && cm[k] < hi) piece.push(xy[2 * k], xy[2 * k + 1]);
        piece.push(...mhd.pointAt(rt.shape, hi).slice(0, 2));
        if (b < a) for (let k = piece.length - 2; k >= 0; k -= 2) push(piece[k], piece[k + 1]);
        else for (let k = 0; k < piece.length; k += 2) push(piece[k], piece[k + 1]);
        continue;
      }
      const way = mhd.between(nums[i], nums[i + 1], l.type);
      if (way) { for (let k = 0; k < way.length; k += 2) push(way[k], way[k + 1]); continue; }
      const pa = a >= 0 ? mhd.pointAt(rt.shape, a) : at(nums[i]), pb = b >= 0 ? mhd.pointAt(rt.shape, b) : at(nums[i + 1]);
      if (pa) push(pa[0], pa[1]);
      if (pb) push(pb[0], pb[1]);
    }
    return out;
  }
  function fitJourney(j) {
    if (!mhd.ready()) return;
    const g = geom(j);
    if (!Number.isFinite(g.bb[0])) return;
    fitFree(g.bb[0], g.bb[1], g.bb[2], g.bb[3], 2.5);
  }

  // ------------------------------------------------------------------ the ideal me (src/chodec.js)
  // Where one is who keeps to the journey to the second: each walk at the pace of who travels (wayNow) from its start (the first
  // one so as to be at the stop when the planner says, with its half minute to spare; a change and the walk to the
  // target as soon as one gets off), at the stop waiting until the vehicle leaves, on board out of sight, at the target
  // waving and then standing a while. The steps of a journey: [{ kind: 'walk' (k: its walk in g.walks) | 'wait' |
  // 'ride' | 'end', t0, t1 (seconds of the day), X, Y }], made again with the geometry and every 5 s (the delays).
  const ARRIVED_SEC = 180, WAVE_SEC = 4;
  function selfSteps(j) {
    const g = geom(j), key = `${g.stamp}|${g.wv}|${Math.floor(Date.now() / 5000)}`;
    if (j.me && j.me.key === key) return j.me.steps;
    const L = live(j), legs = L.legs, steps = [];
    let t = L.leave, pos = null;
    const walkStep = k => { const p = g.walks[k], dur = metresOf(p) / wayNow().walk; steps.push({ kind: 'walk', k, t0: t, t1: t + dur }); t += dur; pos = [p[p.length - 2], p[p.length - 1]]; };
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      if (l.kind === 'walk') {
        const k = g.wl.findIndex(w => w.i === i && !w.step);
        if (k >= 0) walkStep(k); else { t += l.sec; pos = null; }
        continue;
      }
      const ks = g.wl.findIndex(w => w.i === i && w.step); // (the step across from the post one got off at)
      if (ks >= 0) walkStep(ks);
      const r = g.rides.find(x => x.i === i), at = r ? [r.pts[0], r.pts[1]] : pos;
      if (at && l.eDep > t) steps.push({ kind: 'wait', i, t0: t, t1: l.eDep, X: at[0], Y: at[1] });
      t = Math.max(t, l.eDep);
      steps.push({ kind: 'ride', t0: t, t1: l.eArr });
      t = l.eArr; pos = r ? [r.pts[r.pts.length - 2], r.pts[r.pts.length - 1]] : null;
    }
    if (pos) steps.push({ kind: 'end', i: legs.length - 1, t0: t, t1: t + ARRIVED_SEC, X: pos[0], Y: pos[1] });
    j.me = { key, steps };
    return steps;
  }
  const nowFine = () => daySec() + (Date.now() % 1000) / 1000 + (0);
  // the figure now: { X, Y, dx, dy, mode, dxs, walk (the walk it is on) } or null (on board, the journey over)
  function selfAt(j, now = nowFine()) {
    const steps = selfSteps(j);
    if (!steps.length) return null;
    const PIN = -22; // (beside the pin of A or B, on its left: the name is on its right)
    const s0 = steps[0];
    if (now < s0.t0) { // (not yet off: at the start)
      const p = s0.kind === 'walk' ? geom(j).walks[s0.k] : [s0.X, s0.Y];
      return p && Number.isFinite(p[0]) ? { X: p[0], Y: p[1], mode: 'wait', dxs: PIN, seed: 3, i: 0 } : null;
    }
    for (const s of steps) {
      if (now >= s.t1) continue;
      if (s.kind === 'walk') { const [X, Y, dx, dy] = alongPts(geom(j).walks[s.k], (now - s.t0) * wayNow().walk); return { X, Y, dx, dy, mode: 'walk', walk: s.k, i: geom(j).wl[s.k].i }; }
      if (s.kind === 'wait') return { X: s.X, Y: s.Y, mode: 'wait', dxs: -14, i: s.i };
      if (s.kind === 'ride') return null;
      return { X: s.X, Y: s.Y, mode: now - s.t0 < WAVE_SEC ? 'wave' : 'stand', dxs: PIN, i: s.i };
    }
    return null;
  }

  const COLORS = { tram: '#c8202a', trol: '#2f8f3a', bus: '#2f6fb7' };
  function draw(ctx, v, part = 'way', t = performance.now()) {
    if (ui.sel < 0 || !ui.list[ui.sel] || !mhd.ready()) return; // (the shapes of the routes are here: the geometry is kept)
    ui.lastV = v; // (for a click on the route, at())
    if (part === 'way') {
      ui.me = fig ? selfAt(ui.list[ui.sel]) : null; // (the figure of this frame: its walk loses its still figure)
      if (ui.me) { const W = wxOf(ui.list[ui.sel]), w = W && W.byLeg.get(ui.me.i); ui.me.gear = w ? w.gear : null; ui.me.kind = wayNow().fig || null; } // (what it wears there, and who it is: "Jak se pohybuji")
    }
    if (part === 'marks') { drawMarks(ctx, v); if (ui.me) fig.draw(ctx, v, t, ui.me); return; }
    const cw = ctx.canvas.clientWidth, ch = ctx.canvas.clientHeight, M = 16;
    const path = list => {
      ctx.beginPath();
      for (const p of list) {
        let px = 0, py = 0, pen = false;
        for (let i = 0; i < p.length; i += 2) {
          const x = v.ox + p[i] * v.k, y = v.oy + p[i + 1] * v.k;
          if (i) {
            if (Math.max(px, x) < -M || Math.min(px, x) > cw + M || Math.max(py, y) < -M || Math.min(py, y) > ch + M) pen = false;
            else { if (!pen) ctx.moveTo(px, py); ctx.lineTo(x, y); pen = true; }
          }
          px = x; py = y;
        }
      }
    };
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the other journeys of the list, faint
    for (let i = 0; i < ui.list.length; i++) {
      if (i === ui.sel) continue;
      const g = geom(ui.list[i]);
      if (!g.rides.length) continue;
      ctx.strokeStyle = 'rgba(22,29,43,.45)'; ctx.lineWidth = 5; path(g.rides.map(r => r.pts)); ctx.stroke();
      ctx.strokeStyle = 'rgba(240,242,234,.42)'; ctx.lineWidth = 2.5; path(g.rides.map(r => r.pts)); ctx.stroke();
    }
    const g = geom(ui.list[ui.sel]);
    for (const r of g.rides) {
      ctx.strokeStyle = 'rgba(22,29,43,.9)'; ctx.lineWidth = 10; path([r.pts]); ctx.stroke();
      ctx.strokeStyle = COLORS[r.type] || COLORS.bus; ctx.lineWidth = 6; path([r.pts]); ctx.stroke();
    }
    // walks: pixel dots every 9 px of the screen
    g.walks.forEach((w, wi) => {
      // (along the polyline of the walk: a dot every 9 px of its length on the screen, and one at its very end)
      const P = [];
      for (let i = 0; i < w.length; i += 2) P.push(v.ox + w[i] * v.k, v.oy + w[i + 1] * v.k);
      let L = 0; for (let i = 2; i < P.length; i += 2) L += Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]);
      const n = Math.max(1, Math.round(L / 9)), step = L / n;
      const dot = (x, y) => {
        x = Math.round(x); y = Math.round(y);
        if (x < -8 || y < -8 || x > cw + 8 || y > ch + 8) return;
        ctx.fillStyle = '#161d2b'; ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.fillStyle = '#f0f2ea'; ctx.fillRect(x - 2, y - 2, 4, 4);
      };
      const at = s => { for (let i = 2, acc = 0; i < P.length; i += 2) { const l = Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]); if (acc + l >= s || i === P.length - 2) { const t = l ? Math.min(1, (s - acc) / l) : 0; return [P[i - 2] + (P[i] - P[i - 2]) * t, P[i - 1] + (P[i + 1] - P[i - 1]) * t]; } acc += l; } return [P[0], P[1]]; };
      // (walking the pieces once: the dots in order)
      let next = 0, acc = 0;
      for (let i = 2; i < P.length; i += 2) {
        const l = Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]);
        while (next <= acc + l + 0.01 && next <= L + 0.01) { const t = l ? (next - acc) / l : 0; dot(P[i - 2] + (P[i] - P[i - 2]) * t, P[i - 1] + (P[i + 1] - P[i - 1]) * t); next += step; }
        acc += l;
      }
      if (P.length < 4) dot(P[0], P[1]);
      // a walking figure over the middle of a walk long enough on the screen (not over the step between two posts)
      const [mx, my] = at(L / 2).map(Math.round);
      if (L >= 48 && mx > -20 && my > -40 && mx < cw + 20 && my < ch + 20 && !(ui.me && ui.me.walk === wi)) drawWalker(ctx, mx - 7, my - 26, 2);
    });
    ctx.restore();
  }
  // the walking figure, 7 x 10 pixels (as the strip of the bar has it, .sl-strip .walker), a dark outline round it
  const WALKER = ['...##..', '...##..', '..###..', '.#.###.', '#..##.#', '...##..', '..#..#.', '..#...#', '.#....#', '.#.....'];
  function drawWalker(ctx, x, y, s) {
    ctx.fillStyle = '#161d2b';
    WALKER.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(x + c * s - 1, y + r * s - 1, s + 2, s + 2); });
    ctx.fillStyle = '#f0f2ea';
    WALKER.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(x + c * s, y + r * s, s, s); });
  }
  function drawMarks(ctx, v) {
    const cw = ctx.canvas.clientWidth, ch = ctx.canvas.clientHeight;
    const g = geom(ui.list[ui.sel]);
    ctx.save();
    // the stops of getting on and off with their names; the changes yellow; A and B as pins
    ctx.textBaseline = 'middle';
    for (const m of g.marks) {
      const x = Math.round(v.ox + m.X * v.k), y = Math.round(v.oy + m.Y * v.k);
      if (x < -60 || y < -60 || x > cw + 60 || y > ch + 60) continue;
      if (m.kind === 'change' || m.kind === 'stop') {
        const r = m.kind === 'change' ? 6 : 5;
        ctx.fillStyle = '#161d2b'; ctx.fillRect(x - r - 2, y - r - 2, 2 * r + 4, 2 * r + 4); ctx.fillStyle = m.kind === 'change' ? '#f3c868' : '#ffffff'; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      } else {
        ctx.fillStyle = '#161d2b'; ctx.fillRect(x - 11, y - 33, 22, 22); ctx.fillRect(x - 2, y - 12, 4, 12);
        ctx.fillStyle = m.kind === 'a' ? '#93c96a' : '#c9583b'; ctx.fillRect(x - 9, y - 31, 18, 18);
        ctx.fillStyle = '#161d2b'; ctx.font = '400 19px "VT323", monospace'; ctx.textAlign = 'center'; ctx.fillText(m.kind === 'a' ? 'A' : 'B', x, y - 22);
      }
      if (m.name) {
        ctx.font = '400 16px "VT323", monospace'; ctx.textAlign = 'left';
        const pin = m.kind === 'a' || m.kind === 'b', tx = x + (pin ? 14 : 12), ty = pin ? y - 22 : y;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(22,29,43,.92)'; ctx.strokeText(m.name, tx, ty);
        ctx.fillStyle = m.kind === 'change' ? '#f3c868' : '#ffffff'; ctx.fillText(m.name, tx, ty);
      }
    }
    // the flag over the stop where one gets on: the post and the countdown (from the bar, paintBar, every 5 s), until
    // one is on board; red when the vehicle has gone without the visitor
    const fl = ui.flag;
    if (fl && g.rides.length) {
      const fX = g.rides[0].pts[0], fY = g.rides[0].pts[1], under = ui.me && ui.me.mode !== 'walk' && Math.hypot(ui.me.X - fX, ui.me.Y - fY) * v.k < 4; // (the figure waits under it)
      const x = Math.round(v.ox + fX * v.k), y = Math.round(v.oy + fY * v.k) - (fl.pin ? 38 : under ? Math.round(18 * cellPx(v.k)) + 6 : 12);
      if (x > -120 && y > -40 && x < cw + 120 && y < ch + 60) {
        ctx.font = '400 17px "VT323", monospace'; ctx.textAlign = 'center';
        const w = Math.ceil(ctx.measureText(fl.text).width) + 12, h = 20;
        ctx.fillStyle = '#161d2b'; ctx.fillRect(x - w / 2 - 2, y - h - 8, w + 4, h + 4);
        ctx.beginPath(); ctx.moveTo(x - 6, y - 5); ctx.lineTo(x + 6, y - 5); ctx.lineTo(x, y + 2); ctx.fill();
        ctx.fillStyle = fl.miss ? '#ff6a5f' : '#f3c868'; ctx.fillRect(x - w / 2, y - h - 6, w, h);
        ctx.fillStyle = '#161d2b'; ctx.fillText(fl.text, x, y - h / 2 - 6);
      }
    }
    ctx.restore();
  }
  // a point of the screen on the drawn journey (its rides and walks, 8 px around): a click there opens its card again
  function at(sx, sy) {
    const v = ui.lastV;
    if (!v || ui.sel < 0 || !ui.list[ui.sel] || !mhd.ready()) return false;
    const g = geom(ui.list[ui.sel]), R = 8;
    const near = (ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / L2)) : 0;
      return Math.hypot(ax + t * dx - sx, ay + t * dy - sy) <= R;
    };
    for (const r of g.rides) {
      const p = r.pts;
      for (let i = 2; i < p.length; i += 2) if (near(v.ox + p[i - 2] * v.k, v.oy + p[i - 1] * v.k, v.ox + p[i] * v.k, v.oy + p[i + 1] * v.k)) return true;
    }
    for (const w of g.walks) for (let i = 2; i < w.length; i += 2) if (near(v.ox + w[i - 2] * v.k, v.oy + w[i - 1] * v.k, v.ox + w[i] * v.k, v.oy + w[i + 1] * v.k)) return true;
    return false;
  }

  const LOOKS = [['pasek', 'pásek'], ['tabule', 'tabule'], ['lista', 'lišta']];
  let look = 'pasek';
  try { const k = localStorage.getItem('b2k-spoj-look'); if (LOOKS.some(l => l[0] === k)) look = k; } catch { /* (no storage) */ }
  const sbar = el('aside', 'sl-wrap'); sbar.id = 'spojBar'; sbar.hidden = true; sbar.setAttribute('aria-label', 'Vybrané spojení');
  const sbox = el('div', 'sl-bar'); sbox.setAttribute('role', 'button'); sbox.tabIndex = 0; sbox.title = 'Otevřít kartu spojení';
  const looks = el('div', 'sl-looks'); looks.setAttribute('role', 'group'); looks.setAttribute('aria-label', 'Vzhled lišty');
  const lookBtns = LOOKS.map(([k, name]) => {
    const b = el('button', `sl-look l-${k}`); b.type = 'button'; b.title = name; b.setAttribute('aria-label', `Vzhled: ${name}`);
    b.append(el('i'));
    b.onclick = e => { e.stopPropagation(); look = k; try { localStorage.setItem('b2k-spoj-look', k); } catch { /* (no storage) */ } track('Nástroj', { nastroj: 'spojeni', hodnota: `lista-${k}` }); paintBar(); };
    looks.append(b);
    return [k, b];
  });
  // the sticker of "Co si vzít s sebou" over the top left corner of the bar (src/vzit.js; the bar itself clips)
  const smain = el('div', 'sl-main'), sstk = el('span', 'sl-stk'); sstk.hidden = true;
  smain.append(sbox, sstk);
  sbar.append(smain, looks);
  document.body.append(sbar);
  const reopen = () => { if (ui.sel < 0 || !ui.list[ui.sel]) return; track('Nástroj', { nastroj: 'spojeni', hodnota: 'lista-karta' }); pick(ui.sel, { open: true }); };
  sbox.onclick = reopen;
  sbox.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reopen(); } };
  // × : the journey goes from the map (the list in the panel stays)
  function dropJourney() {
    const ours = ui.cardBox && ui.cardBox.isConnected && !$('card').hidden;
    ui.sel = -1; ui.cardBox = null; ui.flag = null; ui.mem = null;
    if (location.hash.startsWith('#spojeni/') && !ui.open) history.replaceState(history.state, '', location.pathname + location.search);
    layers.selectVehicle(null);
    if (ours) $('cardClose').click();
    renderList();
    paintBar();
  }
  // the card hidden or shown (closed by ×, by another card): the bar comes or goes at once
  new MutationObserver(() => paintBar()).observe($('card'), { attributes: true, attributeFilter: ['hidden'] });
  setInterval(() => paintBar(), 5000);

  const delayEl = d => (d == null || d === 0 ? null : el('span', `sl-dl ${d >= 10 ? 'd3' : d >= 5 ? 'd2' : d >= 1 ? 'd1' : 'd0'}`, d > 0 ? `+${d} min` : `${d} min`));
  const postOf = p => (p ? `, nást. ${p}` : '');
  // the stops still ahead on a ride, the one to get off at included (by the timetable with the live delay)
  function stopsLeft(l, now) {
    const tt = mhd.timetable(), p = tt && tt.profiles[l.pi];
    if (!p) return null;
    const t0 = l.dep - p[3][l.fromPos];
    let n = 0;
    for (let i = l.fromPos + 1; i <= l.toPos; i++) if (t0 + p[3][i] + (l.d || 0) * 60 > now - 15) n++;
    return Math.max(1, n);
  }
  // the vehicle against the stop where one gets on, short (for the bar)
  function whereShort(m, ride) {
    const lp = lastPosOf(m, ride);
    if (lp == null || lp < 0) return null;
    if (lp > ride.fromPos) return 'vůz už je za zastávkou';
    const away = ride.fromPos - lp;
    return away === 0 ? 'vůz je na zastávce' : `vůz je ${plural(away, 'zastávku', 'zastávky', 'zastávek')} před vámi`;
  }
  const GRACE = 30;
  const memOf = j => { if (!ui.mem || ui.mem.j !== j) ui.mem = { j, m: {} }; return ui.mem.m; };
  // what the bar knows of a journey of the list without starting its memory: { on (the ride on board of, -1), miss }
  function rodeOf(j) { return ui.mem && ui.mem.j === j ? { on: ui.mem.m.on == null ? -1 : ui.mem.m.on, miss: !!ui.mem.m.miss } : { on: -1, miss: false }; }
  const simOf = () => null;
  const barNow = () => daySec() + ((simOf() || {}).shift || 0);
  // The live vehicle the visitor's position travels with: the nearest one within 150 m that goes the same way, and for
  // how long it has been the same one (ui.mate). What it is against this journey: the vehicle of one of its rides, or
  // at least whether it calls at the stop where the ride waited for (or ridden) gets off.
  const bearDeg = (a, b) => (Math.atan2((b[0] - a[0]) * 72765, (b[1] - a[1]) * 111200) * 180 / Math.PI + 360) % 360;
  const turnDeg = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
  let pxM = 0; // (image points per metre across the map: the vehicles are compared where they are drawn, not where they last reported)
  function mateOf(gps, rides, l, now) {
    if (!gps || gps.speed < 3 || !layers.allLive) { ui.mate = null; return null; }
    if (!pxM) { const a = layers.llToImg(16.6, 49.2), b = layers.llToImg(16.6 + 200 / 72765, 49.2); pxM = Math.hypot(b[0] - a[0], (b[1] - a[1]) * 2) / 200 || 1; }
    const me = layers.llToImg(gps.lon, gps.lat);
    // (150 m: a vehicle is drawn where it is thought to be some seconds after its last report, not where it is. The
    // vehicle the journey waits for wins over a nearer one: two trams one behind the other must not raise a false alarm)
    const mine = l ? vehicleOf(l) : null;
    let best = null, bd = 150 * pxM;
    for (const m of layers.allLive()) {
      if (!Number.isFinite(m.X)) continue;
      const d = Math.hypot(m.X - me[0], (m.Y - me[1]) * 2);
      if (d >= 150 * pxM || (gps.head != null && Number.isFinite(m.bearing) && turnDeg(gps.head, m.bearing) > 75)) continue;
      if (mine && m.id === mine.id) { best = m; break; }
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) { ui.mate = null; return null; }
    if (!ui.mate || ui.mate.id !== best.id) ui.mate = { id: best.id, since: now };
    ui.mate.m = best;
    const plan = layers.matchPlan(best), nums = (plan && plan.p && plan.p[5]) || [], at = best.last ? nums.lastIndexOf(best.last) : -1;
    return { id: best.id, line: best.line, type: best.type, hs: mhd.stopName(best.final) || '', idx: rides.findIndex(r => { const v = vehicleOf(r); return !!v && v.id === best.id; }),
      toward: plan && l ? nums.indexOf(l.to, at + 1) >= 0 : null, secs: now - ui.mate.since };
  }
  // The journey planned anew from on board (src/spojstav.js 'replan': the position travels with a vehicle that is not
  // the planned one, or the visitor asks for "Nový postup"). The planner starts at the stops that vehicle still calls
  // at, each when it gets there (raptor.js { stops }), and the first leg of what it finds becomes the ride one is on:
  // "✓ Jedete · vystupte za 2 zast.", then the best way on. No vehicle told: a plain search from where one stands.
  let replanning = false;
  async function replan() {
    if (replanning) return;
    const rv = riding() != null && layers.rideVehicle ? layers.rideVehicle() : null;
    const mt = (ui.mate && ui.mate.m) || (rv && rv.live ? rv : null), plan = mt ? layers.matchPlan(mt) : null, tt = mhd.timetable(), P = plannerFor();
    track('Nástroj', { nastroj: 'spojeni', hodnota: plan ? 'novy-postup-vuz' : 'novy-postup-poloha' });
    if (!plan || !plan.p || !tt || !P || !ui.b) { ui.mem = null; await useMe('a'); return; }
    replanning = true;
    try {
      const n = mhd.now(), now = n.sec; // (the new journey counts from today: its times are on the scale of this day)
      const p = plan.p, nums = p[5] || [], ti = plan.id, d = Math.round(mt.delay || 0) * 60;
      const at = Math.max(0, mt.last ? nums.lastIndexOf(mt.last) : 0);
      // (the trip on the scale of the day of the search: the day whose time at the stop just passed is nearest to now)
      let t0 = tt.trips[ti + 2];
      for (const k of [-86400, 86400]) if (Math.abs(tt.trips[ti + 2] + k + p[3][at] + d - now) < Math.abs(t0 + p[3][at] + d - now)) t0 = tt.trips[ti + 2] + k;
      const src = [];
      // (every stop still ahead: the good place to change may be far down the line; 45 s to get off and look around)
      for (let i = at + 1; i < nums.length; i++) { const sec = t0 + p[3][i] + d - now; if (sec > 20) src.push([nums[i], sec + 45]); }
      const found = src.length ? await P.options({ stops: src }, epOf(ui.b), n.date, n.sec, { n: 3 }) : [];
      const list = [];
      for (const j of found) {
        const w = j.legs[0];
        if (!w || w.kind !== 'walk' || w.from != null) continue;
        const to = nums.indexOf(w.to, at + 1);
        if (to < 0) continue;
        const mk = toPos => ({ kind: 'ride', pi: tt.trips[ti], ti, t0, fromPos: at, toPos, from: nums[at], to: nums[toPos], dep: t0 + p[3][at], arr: t0 + p[3][toPos], line: mt.line, type: tt.routes[p[0]][1], hs: tt.names[tt.trips[ti + 3]], postFrom: (p[6] || [])[at] || 0, postTo: (p[6] || [])[toPos] || 0, stops: toPos - at });
        let rest = j.legs.slice(1), ride = mk(to);
        if (rest[0] && rest[0].kind === 'ride' && rest[0].ti === ti) { ride = mk(rest[0].toPos); rest = rest.slice(1); } // (the planner got back into the same vehicle: one ride)
        list.push({ dep: ride.dep, arr: j.arr, rides: 1 + rest.filter(x => x.kind === 'ride').length, legs: [ride, ...rest] });
      }
      if (!list.length) { toast('Z tohohle vozu se mi cestu do cíle najít nepodařilo. Zkuste „Hledat znovu“, až vystoupíte.', 7000); if (ui.mem) sayState({ now: barNow(), L: live(ui.mem.j) }, ui.mem.m, 'notmate'); paintBar(); return; }
      const g = motion ? motion() : null;
      // (what the bar thought of that vehicle, src/spojstav.js elsewhere: the right way or not; and the journey left,
      // for "Nejedu": the bar was wrong about the vehicle and the journey before comes back)
      const was = ui.sel >= 0 && ui.list[ui.sel] ? ui.list[ui.sel] : null, wasMem = was && ui.mem && ui.mem.j === was ? ui.mem.m : null;
      const guess = wasMem && wasMem.else ? !!wasMem.else.good : null, wasArr = was ? live(was).arrive : null;
      ui.prev = was ? { list: ui.list, sel: ui.sel, a: ui.a, ends: ui.ends, date: ui.date, when: ui.when, at: ui.at, mem: ui.mem, mate: mt.id } : null;
      ui.a = { kind: 'place', name: `Ve voze ${mt.line}`, lon: g ? g.lon : mt.lng, lat: g ? g.lat : mt.lat };
      A.inp.value = ui.a.name;
      ui.when = 'now'; ui.at = null; markWhen();
      ui.ends = { a: { ...ui.a, ll: llOf(ui.a) }, b: { ...ui.b, ll: llOf(ui.b) } };
      ui.date = n.date;
      ui.list = list; ui.end = {}; ui.sel = 0;
      // Good news or bad? The new plan itself says: in the target about when the old one was (five minutes later at
      // most) = another vehicle going the right way, the journey goes on in it; later than that = it was taking one
      // away, another way had to be found. (Without an old plan to compare: what the bar guessed of the vehicle.)
      const late = wasArr != null ? live(list[0]).arrive - wasArr : null, good = late != null ? late <= 300 : guess;
      ui.mem = { j: list[0], m: { on: 0, how: 'gps', onAt: barNow(), note: good === true ? 'Jiný vůz, správný směr' : good === false ? 'Náhradní trasa' : 'Nový postup' } }; // (on board of its first ride; "Nejedu" for a while: back to the journey before, notOn)
      writeHash(); renderList();
      pick(0);
      const L = live(list[0]), r0 = L.legs[0], nx = L.legs.find((x, i) => i > 0 && x.kind === 'ride');
      const diff = wasArr != null ? Math.round((L.arrive - wasArr) / 60) : null, when = `V cíli ${hhmm(L.arrive)}${diff == null || !diff ? '' : diff < 0 ? ` (o ${-diff} min dřív)` : ` (o ${diff} min později)`}.`;
      const on = `vystupte na zastávce ${stopName(r0.to)}${nx ? `, pak linka ${nx.line}` : ''}`;
      toast(good === true ? `Jiný vůz, správný směr: pokračujeme linkou ${r0.line}, ${on}. ${when}` : good === false ? `Tenhle vůz vás od cíle odváží. Náhradní trasa: ${on}. ${when}` : `Nový postup: jedete linkou ${r0.line}, ${on}. ${when}`, 10000);
    } finally { replanning = false; }
  }
  function ctxOf(j, L, now) {
    const sim = simOf(), rides = L.legs.filter(l => l.kind === 'ride'), r = riding();
    const llOfStop = num => { const st = mhd.stops()[num]; return st ? [st[1], st[2]] : null; };
    const nk = nextJourney();
    const gps = sim && sim.gps !== undefined ? sim.gps : motion ? motion() : null;
    const mem = memOf(j), pend = rides[mem.on >= 0 && now < rides[mem.on].eArr ? mem.on : Math.min(rides.length - 1, (mem.on == null ? -1 : mem.on) + 1)];
    const dirOf = l => { const tt = mhd.timetable(), p = tt && tt.profiles[l.pi], nums = (p && p[5]) || [], a = llOfStop(l.from), b = llOfStop(nums[l.fromPos + 1]); return a && b ? bearDeg(a, b) : null; };
    return {
      now, L, gps,
      mate: sim && sim.mate !== undefined ? sim.mate : mateOf(gps, rides, pend, now),
      // which way the first ride leaves against the way one comes to its stop: the way one walks just now, else the straight line from the start
      sideOf: l => { const st = llOfStop(l.from), a = ui.ends && ui.ends.a && ui.ends.a.ll, dir = dirOf(l); if (l !== rides[0] || L.legs[0].kind !== 'walk' || !st || dir == null) return null; const come = gps && gps.head != null && gps.speed < 3 ? gps.head : a ? bearDeg(a, st) : null; return come == null ? null : sideWords(come, dir); },
      stopLL: llOfStop, stopName, endName: () => endName(null, 'b'),
      veh: l => { if (sim && sim.veh !== undefined) return sim.veh; const m = vehicleOf(l); if (!m) return null; const lp = lastPosOf(m, l); return { live: !!m.live, gone: lp != null && lp > l.fromPos, lon: Number.isFinite(m.lng) ? m.lng : null, lat: Number.isFinite(m.lat) ? m.lat : null, where: whereShort(m, l), low: m.live && typeof m.lowFloor === 'boolean' ? m.lowFloor : null }; },
      dirOf, // (the way a ride leaves its stop: towards the next stop of its trip)
      way: wayNow(),
      // getting on / off at a request stop ("na znamení": all day, or 22–5 h for the night ones, as stopsOn has it)
      reqOf: l => { const tt = mhd.timetable(), p = tt && tt.profiles[l.pi]; if (!p) return null; const kind = tt.reqStops || {}, nums = p[5] || []; const at = (pos, t) => { const rk = nums[pos] ? kind[`${p[0]}|${nums[pos]}`] || '' : '', sd = ((t % 86400) + 86400) % 86400; return rk === 'a' || (rk === 'n' && (sd >= 79200 || sd < 18000)); }; return { on: at(l.fromPos, l.eDep), off: at(l.toPos, l.eArr) }; },
      // the map rides with a vehicle (Nastoupit in any card): which ride of this journey it runs, or just its line
      ride: r != null ? { line: ridingLine ? ridingLine() : '', idx: rides.findIndex(l => { const m = vehicleOf(l); return !!m && m.id === r; }) } : null,
      stopsLeft: l => stopsLeft(l, now),
      next: nk >= 0 ? { dep: live(ui.list[nk]).first.eDep } : null,
    };
  }
  function nextJourney() {
    const now = daySec();
    for (let k = 0; k < ui.list.length; k++) {
      const j = ui.list[k];
      if (k === ui.sel || j.walkOnly) continue;
      const L = live(j);
      if (L.first && L.first.eDep - now > 0 && L.leave - now >= -GRACE) return k;
    }
    return -1;
  }
  function moveOn(auto) {
    track('Nástroj', { nastroj: 'spojeni', hodnota: auto ? 'lista-dalsi-sam' : 'lista-dalsi' });
    const k = nextJourney();
    if (k >= 0) { pick(k); const L = live(ui.list[k]); toast(`${auto ? 'Spoj odjel bez vás, ' : ''}sleduji další: ${hhmm(L.first.eDep)}`, 4000); return; }
    ui.when = 'now'; ui.at = null; ui.mem = null; go();
  }
  // what the bar says just now (src/spojstav.js journeyState), with the pieces of its second line made: + L, now
  function barState(j) {
    const L = live(j), now = barNow();
    const s = journeyState(ctxOf(j, L, now), memOf(j));
    s.L = L; s.now = now;
    s.sub = s.sub.map(p => (typeof p === 'string' ? p : p.b ? badge(p.b[0], p.b[1]) : p.d != null ? delayEl(p.d) : null)).filter(Boolean);
    return s;
  }
  // the stops passed on a ride (between getting on and off): [{ t (expected), name, req (a request stop on this trip,
  // "na znamení": all day, or 22–5 h for the night ones, as the itinerary of a vehicle says it, src/mhd.js) }]
  function stopsOn(l) {
    const tt = mhd.timetable(), p = tt && tt.profiles[l.pi];
    if (!p) return [];
    const kind = tt.reqStops || {}, nums = p[5] || [], t0 = l.dep - p[3][l.fromPos], out = [];
    for (let i = l.fromPos + 1; i < l.toPos; i++) {
      const t = t0 + p[3][i] + (l.d || 0) * 60, s = ((t % 86400) + 86400) % 86400;
      const rk = nums[i] ? kind[`${p[0]}|${nums[i]}`] || '' : '';
      out.push({ t, name: tt.names[p[4][i]], req: rk === 'a' || (rk === 'n' && (s >= 79200 || s < 18000)) });
    }
    return out;
  }
  // the parts of the journey for the strip: walks (with the waiting) and rides, by time; positions 0..1 by those weights
  function stripOf(L) {
    const segs = [];
    let t = L.leave;
    for (const l of L.legs) if (l.kind === 'ride') { if (l.eDep > t) segs.push({ k: 'walk', a: t, b: l.eDep }); segs.push({ k: 'ride', l, a: l.eDep, b: l.eArr, stops: stopsOn(l) }); t = l.eArr; }
    if (L.arrive > t) segs.push({ k: 'walk', a: t, b: L.arrive });
    let W = 0;
    for (const s of segs) { s.w = s.k === 'walk' ? 80 + (s.b - s.a) * 0.3 : Math.max(s.b - s.a, 150); s.x = W; W += s.w; }
    const pos = time => { for (const s of segs) if (time <= s.b) return (s.x + (Math.max(0, time - s.a) / Math.max(1, s.b - s.a)) * s.w) / W; return 1; };
    return { segs, W, pos };
  }
  // the buttons of the state (src/spojstav.js btns and pop.btns): the bar and the window take the same ones
  function doOf(s, j) {
    const tell = (what, val) => { sayState({ now: barNow(), L: s.L }, memOf(j), what); track('Nástroj', { nastroj: 'spojeni', hodnota: val }); };
    return {
      on: () => board(j), off: () => notOn(j), next: () => moveOn(false), replan: () => replan(),
      notmate: () => { tell('notmate', 'lista-neni-to-on'); paintBar(); },
      out: () => { tell('out', 'vystoupil'); paintBar(); }, // (off the vehicle: the journey goes on from its next part)
      stay: () => { tell('stay', 'jedu-dal'); replan(); }, // (riding on past the stop: the journey anew from the vehicle)
    };
  }
  const pop = el('div', 'sp-pop'); pop.hidden = true;
  pop.setAttribute('role', 'alertdialog'); pop.setAttribute('aria-modal', 'false');
  const popT = el('h2', 'sp-pop-t'); popT.id = 'spPopT'; pop.setAttribute('aria-labelledby', 'spPopT');
  const popX = el('button', 'pbtn close sp-pop-x', '×'); popX.type = 'button'; popX.setAttribute('aria-label', 'Zavřít okno (lišta zůstane)');
  const popTx = el('p', 'sp-pop-tx'), popB = el('div', 'sp-pop-b');
  const popHead = el('div', 'sp-pop-h'); popHead.append(popT, popX);
  pop.append(popHead, popTx, popB);
  document.body.append(pop);
  let popKey = '', popLook = '', popAt = 0, popBtns = '';
  popX.onclick = () => { const j = ui.sel >= 0 ? ui.list[ui.sel] : null; if (j && popKey) (memOf(j).popShut ||= []).push(popKey); track('Nástroj', { nastroj: 'spojeni', hodnota: 'okno-zavrit' }); pop.hidden = true; };
  function paintPop(s, j) {
    const q = s && s.pop, mem = j ? memOf(j) : null;
    if (!q || (mem.popShut || []).includes(q.key)) { pop.hidden = true; popKey = popLook = ''; return; }
    const look = `${q.key}|${q.title}`;
    if (look !== popLook) { // (new words: the time a window that only tells is shown counts from here)
      popLook = look; popAt = Date.now();
      if (q.key !== popKey) { popKey = q.key; try { if (navigator.vibrate) navigator.vibrate([120, 80, 120]); } catch { /* (not allowed) */ } }
    }
    if (q.ttl && Date.now() - popAt > q.ttl * 1000) { pop.hidden = true; return; }
    pop.className = `sp-pop tone-${q.tone}`;
    popT.textContent = q.title;
    popTx.replaceChildren(...q.text.map(p => (typeof p === 'string' ? p : p.b ? badge(p.b[0], p.b[1]) : p.d != null ? delayEl(p.d) : null)).filter(Boolean));
    // (the buttons only when they change: the window is painted every second, a button must not be swapped under a finger)
    const sig = `${q.key}|${q.btns.map(b => `${b.id}:${b.label}`).join('|')}`;
    if (sig !== popBtns) {
      popBtns = sig;
      const DO = doOf(s, j);
      popB.replaceChildren(...q.btns.map(b => { const x = el('button', `pbtn${b.id === 'on' || b.id === 'out' ? ' yes' : ''}`, b.label); x.type = 'button'; x.onclick = () => { track('Nástroj', { nastroj: 'spojeni', hodnota: `okno-${b.id}` }); DO[b.id](); }; return x; }));
      if (!q.btns.length) { const ok = el('button', 'pbtn', 'Rozumím'); ok.type = 'button'; ok.onclick = () => popX.click(); popB.append(ok); }
    }
    pop.hidden = false;
  }
  function paintBar() {
    const j = ui.sel >= 0 ? ui.list[ui.sel] : null;
    const ok = !!(j && !j.walkOnly && j.legs.some(l => l.kind === 'ride'));
    const s = ok ? barState(j) : null;
    if (s && s.tone === 'done' && s.now >= s.L.arrive + 300) { dropJourney(); return; }
    // what the rules found out by themselves since the last look
    if (s) for (const e of s.ev) {
      const mem = memOf(j);
      // (it went without the visitor: the next journey that can still be caught, said in a message; moveOn paints the bar again)
      if (e === 'missed' && mem.miss && mem.miss.k === 0 && nextJourney() >= 0) { moveOn(true); return; }
      if (e === 'replan') { replan(); continue; } // (the position travels with another vehicle: the journey anew from on board)
      if (e === 'auto-on') { // taken as on board (the position moved like a ride, or no answer at a change)
        const l = s.L.legs.filter(x => x.kind === 'ride')[mem.on], v = l && vehicleOf(l);
        track('Nástroj', { nastroj: 'spojeni', hodnota: mem.how === 'gps' ? 'nastoupeno-poloha' : 'nastoupeno-samo' });
        if (v && v.live && riding() !== v.id) startRide(v);
        else if (l) toast(`Beru to jako nastoupeno: linka ${l.line}. Když nejedete, klepněte v liště na „Nejedu“.`, 6000);
      }
    }
    // the flag in the map: until one is on board
    ui.flag = s && s.flag ? Object.assign({ pin: j.legs[0].kind !== 'walk' }, s.flag) : null; // (pin: no walk to the stop, the stop is the pin A and the flag goes above it)
    paintPop(s, j);
    if (j && ui.cardBox && ui.cardBox.isConnected) paintProgress(j);
    const cardOpen = !!(ui.cardBox && ui.cardBox.isConnected && !$('card').hidden);
    sbar.hidden = !s || cardOpen;
    if (sbar.hidden) return;
    for (const [k, b] of lookBtns) b.setAttribute('aria-pressed', String(k === look));
    const W = wxOf(j), wk = W ? `${W.top.icon}|${W.top.bold}` : '';
    if (sstk.dataset.k !== wk) { // (only when it changes: the bar is painted every second)
      sstk.dataset.k = wk; sstk.hidden = !W; smain.classList.toggle('has-wx', !!W);
      if (W) sstk.replaceChildren(vzitIcon(W.top.icon, 20), el('span', 'vh', ` ${W.top.bold}`));
    }
    sbox.className = `sl-bar sl-${look} tone-${s.tone}`;
    // (on board, or riding something else: the bar stays beside the box of the ride and says what the journey wants, style.css)
    sbar.classList.toggle('with-ride', memOf(j).on >= 0 || s.ph === 'other');
    const x = el('button', 'pbtn close sl-x', '×'); x.type = 'button'; x.title = 'Zrušit spojení: trasa i lišta zmizí z mapy'; x.setAttribute('aria-label', 'Zrušit spojení');
    x.onclick = e => { e.stopPropagation(); track('Nástroj', { nastroj: 'spojeni', hodnota: 'lista-zrusit' }); dropJourney(); };
    // the buttons of the state: Jedu / Nejedu and the like (src/spojstav.js btns), Hledat znovu
    const DO = doOf(s, j);
    const acts = s.btns.map(q => { const b = el('button', `sl-again${q.id === 'on' ? ' yes' : ''}`, q.label); b.type = 'button'; b.onclick = e => { e.stopPropagation(); DO[q.id](); }; return b; });
    if (s.again) { const b = el('button', 'sl-again', 'Hledat znovu'); b.type = 'button'; b.onclick = e => { e.stopPropagation(); track('Nástroj', { nastroj: 'spojeni', hodnota: 'lista-znovu' }); ui.when = 'now'; ui.at = null; ui.mem = null; go(); }; acts.push(b); }
    let again = null;
    if (acts.length === 1) again = acts[0]; else if (acts.length) { again = el('span', 'sl-ask'); again.append(...acts); }
    const st = el('div', 'sl-st', s.st);
    // (the look lišta has the lines in the row above already: no badge again in what follows)
    const sub = el('div', 'sl-sub'); sub.append(...s.sub.filter(p => p && !(look === 'lista' && p.classList && p.classList.contains('lbadge'))));
    const route = el('div', 'sl-rt');
    j.legs.filter(l => l.kind === 'ride').forEach(l => route.append(badge(l.line, l.type), ' '));
    route.append(el('b', '', `${ui.a.name} → ${ui.b.name}`));
    if (look === 'lista') {
      if (again) st.append(' ', again);
      sbox.replaceChildren(st, route, sub, x);
    } else if (look === 'tabule') {
      const big = el('div', 'sl-big');
      big.append(el('small', '', s.lab), el('b', s.big.length > 2 ? 'w' : '', s.big), el('i', '', s.unit));
      const txt = el('div', 'sl-txt'); txt.append(st, sub);
      if (again) txt.append(again);
      sbox.replaceChildren(big, txt, x);
    } else {
      const row = el('div', 'sl-row'); row.append(st, again || el('span', 'sl-eta', `cíl ${hhmm(s.L.arrive)}`));
      const S = stripOf(s.L), strip = el('div', `sl-strip${s.tone === 'miss' ? ' miss' : ''}`);
      for (const g of S.segs) {
        const d = el('div', `seg ${g.k}${g.k === 'ride' ? ` t-${g.l.type}` : ''}`); d.style.flex = String(g.w);
        if (g.k === 'ride' && g.w / S.W > 0.06) d.append(badge(g.l.line, g.l.type));
        if (g.k === 'walk' && g.w / S.W > 0.05) d.append(el('i', 'walker'));
        strip.append(d);
      }
      // the stops passed on each ride: a dark notch, a request stop a taller yellow one (its name in the tooltip)
      for (const g of S.segs) if (g.k === 'ride') for (const o of g.stops) {
        const q = el('span', o.req ? 'tick req' : 'tick'); q.style.left = `${(S.pos(o.t) * 100).toFixed(1)}%`;
        q.title = o.req ? `${o.name} (na znamení)` : o.name;
        strip.append(q);
      }
      for (const g of S.segs) if (g.k === 'ride') for (const t of [g.a, g.b]) { const q = el('span', 'stop'); q.style.left = `${(S.pos(t) * 100).toFixed(1)}%`; strip.append(q); }
      strip.append(el('span', 'end a', 'A'), el('span', 'end b', 'B'));
      if (s.now >= s.L.leave && s.now <= s.L.arrive) { const n = el('span', 'now'); n.style.left = `${(S.pos(s.now) * 100).toFixed(1)}%`; strip.append(n); }
      const times = el('div', 'sl-times');
      times.append(el('span', '', hhmm(s.L.leave)), el('span', 'sl-mid', s.mid || `${hhmm(s.L.first.eDep)} nástup`), el('span', '', hhmm(s.L.arrive))); // (the middle: which way the ride goes, or where to get off, src/spojstav.js mid)
      sbox.replaceChildren(row, strip, times, x);
    }
  }

  // ------------------------------------------------------------------ the ways in from elsewhere
  // a stop card: "⇄ Odsud" / "⇄ Sem", with what Moje adds there (the watched connection) in the same row
  function stopEntry(st, extra = null) {
    const w = el('div', 'sp-entry');
    w.append(el('span', 'sp-entry-l', 'Spojení:'));
    for (const [which, label, title] of [['a', '⇄ Odsud', 'Hledat spojení z této zastávky'], ['b', '⇄ Sem', 'Hledat spojení na tuto zastávku']]) {
      const b = el('button', 'pbtn small', label); b.type = 'button'; b.title = title;
      b.onclick = () => openWith(which, { kind: 'stop', num: +st.num, name: st.name });
      w.append(b);
    }
    if (extra) w.append(extra);
    return w;
  }
  // a place card: "⇄ Cesta sem" (from where one stands, when that is known; else the start is asked for)
  function toHereButton({ name, lon, lat }) {
    const b = el('button', 'pbtn small sp-here', '⇄ Cesta sem'); b.type = 'button'; b.title = 'Spojení MHD sem';
    b.onclick = () => { openWith('b', { kind: 'place', name, lon: +lon, lat: +lat }); track('Nástroj', { nastroj: 'spojeni', hodnota: 'cesta-sem' }); };
    return b;
  }
  function openWith(which, e) {
    if (openPanel) openPanel();
    panel.classList.remove('sp-compact');
    setMode(true, { focus: false });
    setEnd(which, e);
    const other = which === 'a' ? 'b' : 'a';
    if (!ui[other]) (other === 'a' ? A : B).inp.focus();
  }

  return { start: () => { if (openPanel) openPanel(); panel.classList.remove('sp-compact'); setMode(true); }, draw, at, reopen, hint: () => (ui.a && ui.b ? `Spojení ${ui.a.name} → ${ui.b.name}: klik otevře kartu` : ''), stopEntry, toHereButton, fromHash, open: () => setMode(true), close: () => setMode(false), active: () => ui.open,
    // the link of the journey on the map (#spojeni/…), or null: the share button of the map uses it (main.js shareUrl)
    link: () => (ui.sel >= 0 && ui.list[ui.sel] && ui.a && ui.b ? linkOf() : null),
    // the journey asked for, as Moje keeps it: { n: "Odkud → Kam", j: its link without '#' and without the time }, or null
    pair: pairOf };
}

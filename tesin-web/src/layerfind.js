import { words, rec, level, decide, paneField } from './panefind.js';

// what people call a layer when its name says it otherwise (bare words, compared without diacritics like the rest)
const WORDS = {
  labels: 'popisky nazvy ulice ctvrti napisy',
  hover: 'zvyrazneni obrys budova dum',
  traffic: 'auta provoz animace',
  people: 'lide chodci postavicky animace',
  mhd: 'salina saliny tramvaj autobus trolejbus rozjezd spoj linka zpozdeni dpmb zive jizdni rad',
  mhdStops: 'zastavka odjezdy jizdni rad',
  mhdOutages: 'vyluka odklon zmena dpmb',
  vlaky: 'vlak vlaky nadrazi odjezdy prijezdy tabule zpozdeni zeleznice ceske drahy regiojet rychlik',
  jams: 'zacpa kolona nehoda bouracka waze provoz prekazka',
  hasici: 'hasici pozar zasah vyjezd hzs',
  policie: 'policie kradez vloupani nasili kriminalita zlocin',
  voda: 'voda havarie odstavka bvk vodovod cisterna porucha',
  closures: 'uzavirka uzavreno zakaz vjezdu objizdka',
  works: 'vykop leseni zabor rozkopano oprava stavba',
  parking: 'parkovani parkoviste garaz volna mista auto',
  clean: 'cisteni blokove odtah zametani uklid',
  building: 'stavba staveniste jerab vystavba',
  planCity: 'stavba plan projekt mesto zamer',
  planPrivate: 'stavba plan projekt developer byty kancelare zamer',
  bigplans: 'okruh vmo tramvaj plan stavba zamer',
  events: 'akce koncert divadlo vystava kultura program kam dnes tyden pozdeji',
  smArt: 'socha pomnik kasna fontana umeni',
  smTree: 'strom pamatny',
  smCross: 'kriz bozi muka',
  smPlaque: 'deska pametni',
  smStolper: 'stolpersteine kameny zmizelych holocaust',
  names: 'nazvy mista wikipedie popisky',
  monuments: 'pamatka pamatky',
  cams: 'kamera kamery webkamera',
  meteo: 'pocasi teplota stanice meteostanice',
  air: 'ovzdusi smog vzduch prach chmu znecisteni stanice',
  pano: 'fotky panoramax ulice rozhlednout',
  paro: 'participativni rozpocet dame na vas hlasovani navrhy',
  'dm:hluk': 'hluk decibely',
  'dm:povoden': 'povoden zaplava voda reka',
  'dm:hustota': 'obyvatele lide hustota scitani',
  'dm:vyuziti': 'byty obchody bydleni domy',
  'dm:vloupani': 'kriminalita policie',
  'dm:kradeze': 'kriminalita policie',
  'dm:nasili': 'kriminalita policie',
  'dm:oblibena': 'pocitova anketa',
  'dm:lepsi': 'pocitova anketa',
  'dm:bezpeci': 'pocitova anketa strach',
  'dm:nelibi': 'pocitova anketa',
  'dm:strach': 'pocitova anketa bezpeci policie',
  'dm:nehody': 'bouracka',
  'dm:zraneni': 'bouracka',
  'dm:chodci': 'bouracka kolo',
};
// what goes with a row though it is no layer of its own: shown when one of the rows named is (ids of the pane)
const WITH = {
  mhdMode: ['mhd'], mhdNow: ['mhd'], cleanRange: ['clean'], zasahRange: ['hasici', 'voda'], paroCity: ['paro'],
  trafficNow: ['jams'], hasiciNow: ['hasici'], policieNow: ['policie'], vodaNow: ['voda'], parkingNow: ['parking'], cleanNow: ['clean'], panoNote: ['pano'],
};
const plural = n => (n === 1 ? 'vrstva' : n >= 2 && n <= 4 ? 'vrstvy' : 'vrstev');

export function createLayerFind({ track = () => {}, isPhone = () => false } = {}) {
  const pane = document.getElementById('pane-layers'), q = document.getElementById('lfQ'), x = document.getElementById('lfX'),
    onBtn = document.getElementById('lfOn'), info = document.getElementById('lfInfo');
  let rows = [], secs = [], active = false, onlyOn = false, onSet = new Set(), wasOpen = new Map(), found = 0, told = false;

  // the rows: every switch of a layer and every datová mapa. The parts of time of Akce and the ranges of blokové
  // čištění and of hasiči and voda are no layers: they come with their layer (WITH, and "evp" with Akce ve městě).
  // A row is compared by its name, its other names (WORDS), its explanation (the tooltip) and the headings over it.
  function index() {
    rows = []; secs = [...pane.querySelectorAll('.lsec')];
    for (const sec of secs) {
      const secName = (sec.querySelector(':scope > summary > span') || {}).textContent || '';
      for (const lab of sec.querySelectorAll('.layers label')) {
        const inp = lab.querySelector('input');
        const hid = lab.closest('[hidden]');
        if (!inp || (hid && hid !== pane && pane.contains(hid))) continue; // (a part this version of the page does not show)
        const key = inp.type === 'checkbox' && inp.id.startsWith('lay-') ? inp.id.slice(4) : inp.name === 'dm' && inp.value ? `dm:${inp.value}` : null;
        if (!key) continue;
        const sub = lab.closest('.layers.sub'), subName = sub ? (sub.querySelector('.sub-h') || {}).textContent || '' : '';
        rows.push(Object.assign(rec(lab.textContent, WORDS[key], lab.title, `${secName} ${subName}`), { key, lab, inp, sec, show: true }));
      }
    }
  }
  const isOn = r => r.inp.checked;
  const out = (e, o) => e && e.classList.toggle('lf-out', !!o);

  function enter() {
    active = true;
    index();
    wasOpen = new Map(secs.map(s => [s, s.open]));
    pane.classList.add('finding'); // (first: the sections opened below are then not remembered, main.js)
  }
  function leave() {
    if (!active) return;
    active = false;
    for (const e of pane.querySelectorAll('.lf-hint')) e.remove();
    for (const e of pane.querySelectorAll('.lf-out')) e.classList.remove('lf-out');
    for (const [s, o] of wasOpen) s.open = o;
    pane.classList.remove('finding', 'lf-words', 'lf-few');
    info.hidden = true; info.textContent = '';
  }
  const syncRoles = () => pane.classList.toggle('lf-noroles', isPhone() && (document.activeElement === q || words(q.value).length > 0));
  function apply() {
    const ws = words(q.value), on = ws.length > 0 || onlyOn;
    syncRoles();
    x.hidden = !on;
    onBtn.setAttribute('aria-pressed', String(onlyOn));
    if (!on) { leave(); return; }
    if (!active) enter();
    for (const r of rows) r.lv = (onlyOn && !onSet.has(r.key)) ? 0 : ws.length ? level(r, ws) : 3;
    const n = decide(rows), shown = new Set(rows.filter(r => r.show).map(r => r.key));
    for (const r of rows) {
      out(r.lab, !r.show);
      // the explanation under a row found by words (the one "?" wrote is left where it is, and hides with its row)
      let h = r.lab.nextElementSibling;
      if (h && !h.classList.contains('lhint')) h = null;
      if (h && !h.classList.contains('lf-hint')) out(h, !r.show);
      else if (r.show && ws.length && r.lab.title) { if (!h) { h = document.createElement('p'); h.className = 'lhint lf-hint'; h.textContent = r.lab.title; h.onclick = () => h.classList.toggle('open'); r.lab.after(h); } }
      else if (h) h.remove();
    }
    // the parts of time of Akce with Akce ve městě; what belongs to a layer with that layer
    for (const i of pane.querySelectorAll('input[name="evp"]')) out(i.closest('label'), !shown.has('events'));
    for (const [id, keys] of Object.entries(WITH)) out(document.getElementById(id), !keys.some(k => shown.has(k)));
    for (const sec of secs) {
      const mine = rows.filter(r => r.sec === sec), any = mine.some(r => r.show);
      out(sec, !any);
      if (!any) continue;
      sec.open = true;
      for (const box of sec.querySelectorAll(':scope > .layers')) { if (!WITH[box.id]) out(box, !mine.some(r => r.show && r.lab.parentElement === box)); }
      for (const p of sec.querySelectorAll(':scope > .livenote')) { if (!WITH[p.id]) out(p, true); }
    }
    pane.classList.toggle('lf-words', ws.length > 0); // (one column: the explanations need the width)
    pane.classList.toggle('lf-few', n <= 3); // (a few rows: their explanations whole, otherwise two lines and a tap for the rest)
    found = n;
    info.hidden = false;
    info.textContent = n ? `${!ws.length ? 'Zapnuto' : onlyOn ? 'Nalezeno mezi zapnutými' : 'Nalezeno'}: ${n} ${plural(n)} · křížek vrátí všechny`
      : !ws.length ? 'Žádná vrstva není zapnutá.'
      : `Žádná ${onlyOn ? 'zapnutá ' : ''}vrstva neodpovídá. Zkuste jiné slovo, třeba „parkování“, „hluk“ nebo „MHD“.`;
  }
  function setOn(v) {
    onlyOn = !!v;
    if (onlyOn) {
      if (!active) index();
      onSet = new Set(rows.filter(isOn).map(r => r.key));
      if (!told) { told = true; track('Hledání', { kde: 'vrstvy', vysledek: 'zapnute' }); } // (once a visit)
    }
    apply();
  }
  function clear() {
    if (!q.value && !onlyOn) return;
    q.value = ''; onlyOn = false;
    apply();
  }
  // the pane opened again with "Jen zapnuté" still pressed: what is on now (the layers may have changed meanwhile)
  function refresh() {
    if (!active) return;
    if (onlyOn) onSet = new Set(rows.filter(isOn).map(r => r.key));
    apply();
  }

  q.addEventListener('input', apply);
  // what people look for, to learn the words the layers lack (once the field is left, not every letter: as the other searches)
  q.addEventListener('change', () => { if (q.value.trim()) track('Hledání', { dotaz: q.value.trim().toLowerCase(), kde: 'vrstvy', vysledek: found ? 'nalezeno' : 'nic' }); });
  onBtn.addEventListener('click', () => setOn(!onlyOn));
  paneField({ pane, q, x, isPhone, isOn: () => !!q.value || onlyOn, clear, onCaret: syncRoles });

  apply(); // (what was typed before the module came)
  return { clear, refresh, setOn, get active() { return active; } };
}

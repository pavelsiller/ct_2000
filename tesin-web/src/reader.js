// "Číst": the texts of a card over the whole screen of a phone, running upwards like a teleprompter, and (when the
// switch Hlas is on) read aloud by the phone's own voice (speechSynthesis; no recordings, no service).
// The unit is one sentence: it is lit while it is read, the text scrolls to the next one meanwhile. One utterance per
// sentence — the "boundary" events are unreliable on phones and Chrome cuts long utterances short.
// The text SHOWN stays as it is in the card; speakable() only prepares what the voice gets (units, abbreviations).

const ABBR = /(?:^|[\s(„"])(?:sv|ul|nám|tř|č|čp|cca|mj|tzv|např|tj|tzn|př|n|l|st|ml|stol|r|prof|doc|ing|arch|akad|mudr|judr|phdr|rndr|mgr|dr|mil|mld|tis|atd|apod|resp|popř|kol|ev|sign|inv|obr|str|roz)\.$/i;

// the text as shown in the reader: without addresses of pages and without the leftovers of links
// (a line repeated right after itself, "Virtuální prohlídka"), cut at the end of a sentence when too long
export function tidy(text, max = 3000) {
  const out = [];
  for (let line of String(text || '').split(/\n+/)) {
    line = line.replace(/https?:\/\/\S+|www\.\S+/g, '').replace(/…\s*$/, '').replace(/\s{2,}/g, ' ').trim();
    if (!line || line === out[out.length - 1] || /^virtuální prohlídka$/i.test(line)) continue;
    out.push(line);
  }
  let t = out.join('\n');
  if (t.length > max) { const cut = t.slice(0, max), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n')); t = end > max / 2 ? cut.slice(0, end + 1) : cut; }
  return t;
}

// sentences of one paragraph. A full stop ends a sentence only before a capital letter, a digit or a quote, and not
// after an abbreviation (sv., ul., č.), a single letter (n. l., J. A. Komenský) or inside a date (5. 6. 2020)
export function sentences(par) {
  const res = [], re = /[.!?…]+["“”)]*\s+/g;
  let from = 0, m;
  while ((m = re.exec(par))) {
    const end = m.index + m[0].length, next = par[end] || '';
    if (!/[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ0-9„"(]/.test(next)) continue;
    const head = par.slice(from, m.index + 1);
    if (m[0][0] === '.' && (ABBR.test(head) || /(?:^|[\s(])\p{L}\.$/u.test(head) || (/\d/.test(next) && /(?:^|[\s(])\d{1,2}\.$/.test(head)))) continue;
    res.push(par.slice(from, end).trim()); from = end;
  }
  const rest = par.slice(from).trim();
  if (rest) res.push(rest);
  return res;
}

// abbreviations said in words (a whole word only: \b does not know Czech letters, hence the prefix group)
const WORDS = { 'mil.': 'milionů', 'mld.': 'miliard', 'tis.': 'tisíc', 'kč': 'korun', 'cca': 'přibližně', 'cca.': 'přibližně', 'mj.': 'mimo jiné', 'např.': 'například', 'tj.': 'to je', 'tzn.': 'to znamená', 'atd.': 'a tak dále', 'apod.': 'a podobně', 'č.p.': 'číslo popisné', 'ul.': 'ulice', 'nám.': 'náměstí', 'stol.': 'století' };
const WORDS_RE = /(^|[^\p{L}\d])(mil\.|mld\.|tis\.|kč(?![\p{L}\d])|cca\.?(?![\p{L}\d])|mj\.|např\.|tj\.|tzn\.|atd\.|apod\.|č\.\s*p\.|ul\.|nám\.|stol\.)/giu;
// what the voice gets: units and abbreviations in words, numbers in one piece, no quotes
export function speakable(s) {
  return String(s)
    .replace(/[„“”"]/g, '')
    .replace(/(\d)[   ](?=\d{3}(?!\d))/g, '$1')            // 4 499 -> 4499
    .replace(/(\d)\s*[–—-]\s*(?=\d)/g, '$1 až ')                     // 1928–1930
    .replace(/\bm\s*n\.\s*m\./g, 'metrů nad mořem')
    .replace(/(\d)\s*(?:m2|m²)(?![\p{L}\d])/gu, '$1 metrů čtverečních')
    .replace(/(\d)\s*(?:m3|m³)(?![\p{L}\d])/gu, '$1 metrů krychlových')
    .replace(/(\d)\s*km(?![\p{L}\d])/gu, '$1 kilometrů')
    .replace(/(\d)\s*cm(?![\p{L}\d])/gu, '$1 centimetrů')
    .replace(/(\d)\s*mm(?![\p{L}\d])/gu, '$1 milimetrů')
    .replace(/(\d)\s*ha(?![\p{L}\d])/gu, '$1 hektarů')
    .replace(/(\d)\s*m(?![\p{L}\d])/gu, '$1 metrů')
    .replace(/(\d)\s*%/g, '$1 procent')
    .replace(WORDS_RE, (m, pre, w) => pre + WORDS[w.toLowerCase().replace(/\s+/g, '')])
    .replace(/(^|[^\p{L}\d])č\.\s*(?=\d)/giu, '$1číslo ')
    .replace(/\s·\s/g, ', ').replace(/×/g, ' krát ')
    .replace(/\s{2,}/g, ' ').trim();
}

// basic facts of a card as short sentences ("Stav: ve výstavbě. Investor: …."), only the rows named in keys
export function factsText(rows, keys) {
  return rows.filter(([k, v]) => v && keys.includes(k)).map(([k, v]) => `${k}: ${String(v).replace(/\s*\(podle webu projektu\)/, '').replace(/\.$/, '')}.`).join(' ');
}

const RATES = [0.8, 1, 1.25];
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } } };
const synth = () => ('speechSynthesis' in window ? window.speechSynthesis : null);
const voices = () => (synth() ? synth().getVoices() : []);
const csVoice = () => { const cs = voices().filter(v => /^cs/i.test(v.lang)); return cs.find(v => v.localService) || cs[0] || null; };
// no voice at all, or voices without a Czech one. An empty list is not a "no": Android often lists nothing and reads anyway.
const voiceMissing = () => !synth() || (voices().length > 0 && !csVoice());
if (synth()) synth().getVoices(); // the list fills in later (voiceschanged)

let dlg = null, st = null;
const wide = () => matchMedia('(min-width: 900px) and (min-height: 501px)').matches;

function make() {
  const d = document.createElement('dialog');
  d.className = 'reader'; d.id = 'reader';
  d.innerHTML = `<div class="rd-col">
      <div class="rd-head"><h2></h2><button class="pbtn rd-x" type="button" data-a="close" aria-label="Zavřít čtení">×</button></div>
      <div class="rd-prog"><b></b></div>
      <div class="rd-view"><span class="rd-mark"></span><span class="rd-mark"></span><div class="rd-track"></div></div>
      <p class="rd-note" hidden></p>
    </div>
    <div class="rd-bar">
      <button class="pbtn" type="button" data-a="prev" aria-label="Věta zpět">‹</button>
      <button class="pbtn rd-play" type="button" data-a="play"></button>
      <button class="pbtn" type="button" data-a="next" aria-label="Věta vpřed">›</button>
      <button class="pbtn" type="button" data-a="voice" aria-pressed="false">Hlas</button>
      <button class="pbtn" type="button" data-a="rate" aria-label="Rychlost čtení"></button>
    </div>`;
  document.body.append(d);
  d.addEventListener('click', e => {
    if (e.target === d) { d.close(); return; }
    const b = e.target.closest('[data-a]');
    if (b) act(b.dataset.a); else if (e.target.closest('.rd-view')) { if (swallow) swallow = false; else act('play'); }
  });
  // A finger (or the wheel) moves the text up and down: the sentence that ends up at the marks is lit meanwhile, and
  // reading goes on from it when the finger lets go — to skip a paragraph or to go back to one. A tap without a move
  // stays pause / play.
  const view = d.querySelector('.rd-view'), track = d.querySelector('.rd-track');
  let drag = null, swallow = false, wheelT = 0, wheelY = 0;
  const grab = () => { const y = new DOMMatrixReadOnly(getComputedStyle(track).transform).m42; halt(); track.style.transition = 'none'; track.style.transform = `translateY(${y}px)`; return y; };
  const moveTo = y => {
    const band = view.clientHeight * .34, a = st.units[0].el, z = st.units[st.units.length - 1].el;
    y = Math.min(band - a.offsetTop, Math.max(band - (z.offsetTop + z.offsetHeight) + 2, y));
    track.style.transform = `translateY(${y}px)`;
    const pos = band - y + 10; let k = 0;
    st.units.forEach((u, i) => { if (u.el.offsetTop <= pos) k = i; });
    st.i = k;
    st.units.forEach((u, i) => { u.el.classList.toggle('cur', i === k); u.el.classList.toggle('past', i < k); });
    return y;
  };
  const release = () => { st.playing = true; st.done = false; lock(true); step(); };
  view.addEventListener('pointerdown', e => { if (st && !e.button) drag = { id: e.pointerId, at: e.clientY, y0: null }; });
  view.addEventListener('pointermove', e => {
    if (!st || !drag || e.pointerId !== drag.id) return;
    if (drag.y0 === null) {
      if (Math.abs(e.clientY - drag.at) < 8) return;
      drag.y0 = grab(); drag.at = e.clientY;
      try { view.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
      return;
    }
    moveTo(drag.y0 + e.clientY - drag.at);
  });
  const drop = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.y0 !== null; drag = null;
    if (moved && st) { swallow = true; setTimeout(() => { swallow = false; }, 80); release(); }
  };
  view.addEventListener('pointerup', drop); view.addEventListener('pointercancel', drop);
  view.addEventListener('wheel', e => {
    if (!st) return;
    e.preventDefault();
    if (!wheelT) wheelY = grab();
    wheelY = moveTo(wheelY - e.deltaY);
    clearTimeout(wheelT); wheelT = setTimeout(() => { wheelT = 0; if (st) release(); }, 350);
  }, { passive: false });
  d.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !d.matches(':modal')) { e.preventDefault(); d.close(); return; } // (a panel shown with show(): Esc is ours)
    if (e.key === ' ') { e.preventDefault(); act('play'); } else if (e.key === 'ArrowLeft') act('prev'); else if (e.key === 'ArrowRight') act('next');
  });
  d.addEventListener('close', () => { halt(); lock(false); audio(false); st = null; });
  addEventListener('resize', () => { if (st) { const was = st.playing; halt(); st.playing = was; step(); } });
  document.addEventListener('visibilitychange', () => { if (st && document.hidden && st.playing) act('play'); });
  if (synth() && synth().addEventListener) synth().addEventListener('voiceschanged', () => { if (st) paint(false); });
  return d;
}

// keep the display on while the text runs
let wake = null;
async function lock(on) {
  try {
    if (on && !wake && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    else if (!on && wake) { const w = wake; wake = null; await w.release(); }
  } catch { wake = null; }
}

// iPhone: the page's sound follows the ring/silent switch unless the page says it plays media (Safari 16.4+);
// asked for only while the voice reads, given back when the reader closes
function audio(on) { try { if (navigator.audioSession) navigator.audioSession.type = on ? 'playback' : 'auto'; } catch { /* not there */ } }
const q = sel => dlg.querySelector(sel);
// how long a sentence stays: by its length; with the voice on, by how fast the voice has been reading so far
const dur = u => Math.max(1100, u.say.length * (st.voice && !voiceMissing() ? st.msChar : 62)) / (st.voice && !voiceMissing() ? 1 : st.rate);

function paint(run) {
  const u = st.units[st.i], nx = st.units[st.i + 1];
  q('.rd-play').textContent = st.playing ? '❚❚' : '▶';
  q('.rd-play').setAttribute('aria-label', st.playing ? 'Pozastavit' : 'Pokračovat ve čtení');
  const miss = voiceMissing();
  const vb = q('[data-a=voice]'); vb.setAttribute('aria-pressed', String(st.voice && !miss)); vb.disabled = miss;
  // on a phone the voice goes out as media sound: with the media volume down or the phone on silent the text runs and
  // nothing is heard — said under the text while the first two sentences are read
  const hint = st.voice && !miss && !st.failed && (st.spoken || 0) < 2 && matchMedia('(pointer: coarse)').matches;
  const note = q('.rd-note'); note.hidden = !(miss || st.failed || hint);
  note.textContent = miss ? 'V tomto zařízení chybí český hlas, text běží bez zvuku.'
    : st.failed === 'stuck' ? `Hlas prohlížeče neodpovídá, text běží bez zvuku.${/Chrome/.test(navigator.userAgent) && !/Edg|OPR/.test(navigator.userAgent) ? ' V Chromu pomůže prohlížeč úplně zavřít a znovu otevřít.' : ''}`
    : st.failed ? 'Hlas se nepodařilo spustit, text běží bez zvuku.' : hint ? 'Není nic slyšet? Zesilte hlasitost médií a vypněte tichý režim telefonu.' : '';
  q('[data-a=rate]').textContent = `${String(st.rate).replace('.', ',')}×`;
  q('.rd-prog b').style.width = `${(st.i + (st.playing ? 1 : 0)) / st.units.length * 100}%`;
  st.units.forEach((x, i) => { x.el.classList.toggle('cur', i === st.i); x.el.classList.toggle('past', i < st.i); });
  const view = q('.rd-view'), track = q('.rd-track'), band = view.clientHeight * .34;
  const y0 = band - u.el.offsetTop, y1 = band - (nx ? nx.el.offsetTop : u.el.offsetTop + u.el.offsetHeight);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  track.style.transition = run || calm ? 'none' : 'transform .35s ease';
  track.style.transform = `translateY(${y0}px)`;
  if (run && st.playing && !calm) {
    track.getBoundingClientRect(); // the start position first, then the run to the next sentence
    track.style.transition = `transform ${dur(u)}ms linear`;
    track.style.transform = `translateY(${y1}px)`;
  }
}

function halt() {
  if (!st) return;
  clearTimeout(st.timer); st.token++;
  const s = synth(); if (s && (s.speaking || s.pending)) s.cancel();
}

function step() {
  halt(); paint(true);
  if (!st.playing) return;
  const token = st.token, u = st.units[st.i], t0 = performance.now();
  const go = spoken => {
    if (!st || token !== st.token) return;
    // the real pace of the voice (ms per character) sets the scroll of the next sentences
    if (spoken) st.spoken = (st.spoken || 0) + 1;
    if (spoken && u.say.length > 20) st.msChar = st.msChar * .5 + (performance.now() - t0) / u.say.length * .5;
    if (st.i < st.units.length - 1) { st.i++; step(); } else { st.playing = false; st.done = true; lock(false); paint(false); }
  };
  if (st.voice && !voiceMissing()) {
    const x = new SpeechSynthesisUtterance(u.say), v = csVoice();
    if (v) x.voice = v;
    x.lang = v ? v.lang.replace('_', '-') : 'cs-CZ'; x.rate = st.rate;
    // a voice that does not start (not allowed, no voice data: an error, or an "end" right away) must not make the
    // text race through: the voice is switched off and the sentence runs by the clock
    const fail = (why = 'failed') => { if (!st || token !== st.token) return; clearTimeout(st.timer); st.voice = false; st.failed = why; const s = synth(); if (s) s.cancel(); step(); };
    // Chrome on a Mac can get stuck: speak() takes the sentence, then neither "start" nor "end" nor an error ever come
    // (the whole browser's voice hangs until Chrome is restarted). No start within 3 s: the text goes on without the
    // voice, with a note. A sentence that "speaks" far longer than it could (Chrome cuts long ones, or hangs mid-way):
    // cut, and the next one goes.
    let started = false;
    x.onstart = () => { started = true; clearTimeout(st.timer); st.timer = setTimeout(() => { if (st && token === st.token) { const s = synth(); if (s) s.cancel(); go(true); } }, Math.max(8000, u.say.length * 200 / st.rate)); };
    st.timer = setTimeout(() => { if (!started) fail('stuck'); }, 3000);
    x.onend = () => { clearTimeout(st.timer); if (performance.now() - t0 < Math.min(400, u.say.length * 12)) fail(); else go(true); };
    x.onerror = e => { if (e.error !== 'canceled' && e.error !== 'interrupted') fail(); };
    st.utt = x; // kept: Safari drops an utterance nobody holds, and with it its events
    audio(true);
    synth().speak(x);
  } else st.timer = setTimeout(() => go(false), dur(u));
}

function act(a) {
  if (!st) return;
  if (a === 'close') { dlg.close(); return; }
  if (a === 'play') {
    st.playing = !st.playing;
    if (st.playing) { if (st.done) { st.i = 0; st.done = false; } lock(true); step(); } else {
      // stop the scroll where it is; the sentence starts again on the next ▶
      const track = q('.rd-track'), m = getComputedStyle(track).transform;
      track.style.transition = 'none'; track.style.transform = m;
      halt(); lock(false);
      q('.rd-play').textContent = '▶'; q('.rd-play').setAttribute('aria-label', 'Pokračovat ve čtení');
    }
    return;
  }
  if (a === 'prev') st.i = Math.max(0, st.i - 1);
  else if (a === 'next') st.i = Math.min(st.units.length - 1, st.i + 1);
  else if (a === 'rate') { st.rate = RATES[(RATES.indexOf(st.rate) + 1) % RATES.length]; st.msChar = 70 / st.rate; store.set('b2k-cist-rychlost', String(st.rate)); }
  else if (a === 'voice') { st.voice = !st.voice; st.failed = false; store.set('b2k-cist-hlas', st.voice ? '1' : '0'); if (st.onVoice) st.onVoice(st.voice); }
  step();
}

// parts: [{ h: heading of the source (shown, not read), t: text, c: credit line }]
// onVoice(on): called when the reader switches the voice
export function openReader({ title, parts, onVoice }) {
  dlg ||= make();
  const track = dlg.querySelector('.rd-track');
  track.replaceChildren();
  dlg.querySelector('.rd-head h2').textContent = title;
  const units = [];
  const unit = (parent, text, cls) => { const e = document.createElement('span'); e.className = `rd-s${cls ? ` ${cls}` : ''}`; e.textContent = text; parent.append(e, ' '); const say = speakable(text); if (say) units.push({ el: e, say }); };
  const head = document.createElement('p'); head.className = 'rd-title'; unit(head, title); track.append(head);
  for (const part of parts) {
    const text = tidy(part.t);
    if (!text) continue;
    if (part.h) { const h = document.createElement('h3'); h.textContent = part.h; track.append(h); }
    for (const par of text.split('\n')) { const p = document.createElement('p'); for (const s of sentences(par)) unit(p, s); track.append(p); }
    if (part.c) { const c = document.createElement('span'); c.className = 'credit'; c.textContent = part.c; track.append(c); }
  }
  const rate = +store.get('b2k-cist-rychlost', '1');
  st = { units, i: 0, playing: true, voice: store.get('b2k-cist-hlas', '0') === '1', rate: RATES.includes(rate) ? rate : 1, msChar: 70, timer: 0, token: 0, onVoice };
  st.msChar = 70 / st.rate;
  // on a desktop a panel in the left third, the map stays to be seen and used (not modal); on a phone the whole screen
  if (!dlg.open) { if (wide()) dlg.show(); else dlg.showModal(); }
  lock(true);
  step();
  return st.voice && !voiceMissing();
}

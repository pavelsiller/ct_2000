// "Nainstalovat aplikaci": the map on the home screen of a phone.
//
// Android (Chrome, Edge, Samsung Internet) offers the installation by itself and hands the page the event
// 'beforeinstallprompt'; we keep it (without stopping the browser's own offer) so that our button can open the same
// window later. iOS has nothing like that: a page can only be added by hand (Share → Přidat na plochu), in Safari
// and since iOS 16.4 in Chrome, Edge and Firefox too. The browsers inside other apps (Facebook, Instagram…) cannot
// do it at all, there the only advice is to open the map in the real browser.
//
// So there is one small tip (#installTip) with three contents:
//   ios     the three steps with the pictures of the buttons
//   prompt  one button that opens the browser's installation window (Android; on a computer only from the menu)
//   inapp   "open it in the browser first" and a button that copies the link
// It comes by itself only on phones and tablets, never on the first seconds of a visit: on iOS after a minute and a
// half of the first visit or 20 s into a later one, elsewhere from the second visit on (Android has just shown its
// own offer on the first one). Closed, it stays away for 30 days, closed twice for half a year. The same tip opens
// any time from the menu Více → Nainstalovat aplikaci; the button is there only where installing is possible.
// An installed map (display-mode standalone) shows neither.
//
// A look at it on any device: ?install=ios | android | inapp (nothing is remembered then).
import { track } from './stats.js';

const LS = 'b2k-install'; // { n: visits, off: time of the last closing, offs: how many times closed }
const DAY = 864e5;
const ua = navigator.userAgent;
const FORCE = { ios: 'ios', android: 'prompt', inapp: 'inapp' }[new URLSearchParams(location.search).get('install')] || null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const IOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // an iPad says it is a Mac
const ANDROID = /Android/.test(ua);
// the browser inside another app: its name for the sentence "jste v prohlížeči …"
const INAPP = [[/FBAN|FBAV|FB_IAB/, 'Facebooku'], [/Instagram/, 'Instagramu'], [/Messenger/, 'Messengeru'], [/LinkedInApp/, 'LinkedInu'], [/TikTok|musical_ly/, 'TikToku'], [/Twitter/, 'sítě X'], [/Snapchat/, 'Snapchatu'], [/Line\//, 'aplikace Line']]
  .find(([re]) => re.test(ua))?.[1] || null;

const SHARE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/><path d="M8 10H5v11h14V10h-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg>';
const PLUS = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg>';

const read = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } };
const write = o => { try { localStorage.setItem(LS, JSON.stringify(o)); } catch { /* private mode */ } };

/**
 * @param {{ toast: (msg: string, ms?: number) => void, button: HTMLElement | null, base: string, onOpen?: () => void }} o
 *   button: the menu button (shown only where installing is possible), onOpen: called before the tip opens from the menu
 */
export function createInstall({ toast, button, base, onOpen }) {
  let deferred = null; // the kept 'beforeinstallprompt'
  let tip = null;
  let planned = false;
  const say = hodnota => { if (!FORCE) track('Nástroj', { nastroj: 'instalace', hodnota }); };
  // what can be offered here: null = nothing (installed already, or a browser that cannot)
  const kind = () => FORCE || (standalone() ? null : INAPP && (IOS || ANDROID) ? 'inapp' : IOS ? 'ios' : deferred ? 'prompt' : null);

  function body(k) {
    if (k === 'ios') return `<ol class="it-steps">
      <li>Klepněte na <b>Sdílet</b> <span class="it-key">${SHARE}</span> v liště prohlížeče. <small>Není tam? Schovává se pod tlačítkem <b>⋯</b>.</small></li>
      <li>Sjeďte níž a zvolte <b>Přidat na plochu</b> <span class="it-key">${PLUS}</span></li>
      <li>Potvrďte vpravo nahoře <b>Přidat</b>.</li>
    </ol>`;
    if (k === 'inapp') return `<p class="it-text">Teď jste v prohlížeči ${INAPP || 'Facebooku'}, ze kterého to nejde. Klepněte nahoře na <b>⋯</b> a zvolte <b>Otevřít v externím prohlížeči</b>, tam už mapu na plochu přidáte.</p>
      <div class="it-btns"><button class="pbtn" type="button" data-act="copy">Zkopírovat odkaz</button></div>`;
    return `<div class="it-btns"><button class="pbtn it-go" type="button" data-act="go">Nainstalovat</button><button class="pbtn" type="button" data-act="off">Teď ne</button></div>`;
  }

  function hide() { if (tip) tip.hidden = true; }
  function dismiss() {
    hide();
    say('zavreno');
    if (!FORCE) { const s = read(); write({ ...s, off: Date.now(), offs: (s.offs || 0) + 1 }); }
  }
  async function go() {
    if (!deferred) { hide(); if (FORCE) toast('Ukázka: tady telefon otevře své okno instalace.', 4000); return; }
    const ev = deferred;
    deferred = null; // the event serves once; the browser sends a new one if the installation was refused
    hide();
    say('nainstalovat');
    try { ev.prompt(); const { outcome } = await ev.userChoice; say(outcome === 'accepted' ? 'prijato' : 'odmitnuto'); } catch { /* the window did not open */ }
    sync();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(location.href.split('?')[0]); toast('Odkaz je zkopírovaný, vložte ho do prohlížeče.', 4000); } catch { toast(location.href); }
  }

  function show(k) {
    if (!tip) {
      tip = document.createElement('section');
      tip.className = 'install-tip'; tip.id = 'installTip';
      tip.setAttribute('role', 'dialog'); tip.setAttribute('aria-labelledby', 'itTitle');
      tip.addEventListener('click', e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'off') dismiss(); else if (act === 'go') go(); else if (act === 'copy') copy();
      });
      document.body.append(tip);
    }
    tip.innerHTML = `<button class="pbtn close" type="button" data-act="off" aria-label="Zavřít">×</button>
      <div class="it-head"><img src="${base}apple-touch-icon.png" width="36" height="36" alt="">
        <div><h2 id="itTitle">Brno 2000 jako aplikace</h2><p>Mapa na ploše telefonu: na celou obrazovku a na jedno klepnutí.</p></div></div>
      ${body(k)}`;
    tip.dataset.kind = k;
    tip.hidden = false;
  }

  // by itself: only when nothing else is open (a card, a pane, a dialog), otherwise a little later
  function auto(tries = 8) {
    const k = kind();
    if (!k || (tip && !tip.hidden)) return;
    const busy = document.hidden || document.querySelector('dialog[open], .reader:not([hidden])') || document.body.classList.contains('pane-open')
      || ['card', 'events', 'aktual', 'fcPop', 'rideBox'].some(id => { const e = document.getElementById(id); return e && !e.hidden; });
    if (busy) { if (tries > 0) setTimeout(() => auto(tries - 1), 15000); return; }
    show(k);
    say(`tip-${k === 'prompt' ? 'android' : k}`);
  }
  function plan() {
    if (planned || FORCE || !kind()) return;
    const k = kind();
    if (k === 'prompt' && !ANDROID) return; // a computer: only from the menu
    const s = read();
    if (s.off && Date.now() - s.off < (s.offs > 1 ? 180 : 30) * DAY) return;
    const later = (s.n || 0) > 1;
    if (!later && k !== 'ios') return;
    planned = true;
    setTimeout(auto, later ? 20000 : 90000);
  }
  function sync() { if (button) button.hidden = !kind(); }

  // count the visits (once per opened tab)
  if (!FORCE && !standalone()) {
    try { if (!sessionStorage.getItem(LS)) { sessionStorage.setItem(LS, '1'); const s = read(); write({ ...s, n: (s.n || 0) + 1 }); } } catch { /* private mode */ }
  }
  addEventListener('beforeinstallprompt', e => { deferred = e; sync(); plan(); }); // not prevented: the browser's own offer stays
  addEventListener('appinstalled', () => { deferred = null; hide(); sync(); say('nainstalovano'); });
  if (button) button.onclick = () => {
    const k = kind();
    if (!k) return;
    say(`menu-${k === 'prompt' ? 'android' : k}`);
    if (onOpen) onOpen();
    if (k === 'prompt' && !FORCE) go(); else show(k);
  };
  sync();
  plan();
  if (FORCE) setTimeout(() => show(FORCE), 800);
}

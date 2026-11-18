// A new version of the page for the app on the home screen. Opening it from the home screen often only wakes the page
// kept in memory (days old, no load, so neither the new page nor the new service worker comes). Back after a long time
// away, the page asks for version.json (written by the build next to sw.js, vite.config.js) and loads itself again
// when the build is newer; the view goes into the address first, so it opens at the same place. A short time away
// (a call, a look at another app) is never interrupted: the check waits for the next long absence.
// And a page that lives across a deploy asks for a chunk the new deploy no longer has (import() of an old hash):
// Vite tells it by 'vite:preloadError', and the page loads itself again too.
const BUILD = import.meta.env.VITE_BUILD;
const AWAY_MS = 60 * 60e3; // away this long: a reload is not in the way of anything
const GUARD_MS = 10 * 60e3; // at most one reload per tab in this time (a page that comes back old does not loop)
const KEY = 'b2k-reload';

function reloadOnce(keepView) {
  try {
    if (Date.now() - (+sessionStorage.getItem(KEY) || 0) < GUARD_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { return false; } // (no storage: no guard against a loop, so no reload)
  try { keepView?.(); } catch { /* the address stays as it is */ }
  location.reload();
  return true;
}

export function watchUpdates(base, keepView) {
  if (!import.meta.env.PROD || !BUILD) return;
  let hiddenAt = 0, checking = false;
  async function check() {
    if (checking) return;
    checking = true;
    try {
      const r = await fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' });
      const v = r.ok ? (await r.json()).v : null;
      if (v && v !== BUILD && !document.hidden) reloadOnce(keepView);
    } catch { /* offline: the page stays as it is */ } finally { checking = false; }
  }
  function back() {
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (away > AWAY_MS) check();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt ||= Date.now(); else back(); });
  window.addEventListener('pagehide', () => { hiddenAt ||= Date.now(); });
  window.addEventListener('pageshow', e => { if (e.persisted) back(); }); // (back from the back-forward cache)
  window.addEventListener('vite:preloadError', e => { if (reloadOnce(keepView)) e.preventDefault(); });
  // (a debugging hook: __b2kUpdate.away(ms) pretends the page was hidden that long, __b2kUpdate.check() asks now)
  window.__b2kUpdate = { build: BUILD, check, away: ms => { hiddenAt = Date.now() - ms; } };
}

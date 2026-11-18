// The names under which this browser keeps the settings of the map (localStorage, sessionStorage) start with "b2k-"
// (Brno 2000). Until 2026-11-17 they started with "izo-", and the span of the traffic chart had the bare name "dopSpan".
// What a visitor has under the old names is copied once under the new ones, before anything on the page reads them;
// the old entries stay as they are (a page of the older build still open in another tab, or a step back to that
// build, finds them). Once only (the mark "b2k-keys"): a setting
// the visitor removes later must not come back from its old entry.
// Not a module: vite.config.js writes it into the pages at <!--#oldkeys--> (without these lines), so it runs before
// the first paint and before the script at the start of <body> reads the folded bars and the contrast.
(function () {
  function move(s) {
    if (s.getItem('b2k-keys')) return;
    var old = [], i, k, n;
    for (i = 0; i < s.length; i++) { k = s.key(i); if (k && k.indexOf('izo-') === 0) old.push(k); }
    for (i = 0; i < old.length; i++) { n = 'b2k-' + old[i].slice(4); if (s.getItem(n) === null) s.setItem(n, s.getItem(old[i])); }
    if (s.getItem('dopSpan') !== null && s.getItem('b2k-dop-span') === null) s.setItem('b2k-dop-span', s.getItem('dopSpan'));
    s.setItem('b2k-keys', '1');
  }
  try { move(localStorage); } catch (e) { /* private mode, or no room left: the page starts with its defaults */ }
  try { move(sessionStorage); } catch (e) { /* the same */ }
})();

export const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const words = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
// Czech endings: "hasiči" has to find "hasičů", "parkování" the "parkovací domy", "vody" the "voda". Cut as little
// as that takes: "kamera" cut by two would find the Kameny zmizelých.
export const stem = w => (w.length >= 8 ? w.slice(0, -2) : w.length >= 4 ? w.slice(0, -1) : w);

// a row as the comparison wants it: its name, its other names (what people call it, what kind of thing it is), its
// explanation and the heading it stands under
export function rec(name, other, desc, ctx) {
  const n = norm(name);
  return { name: n, nameW: words(n), headW: words(`${n} ${other || ''}`), descW: words(desc), ctxW: words(ctx) };
}
// How a row answers the words asked. Each word is looked for in three places:
//   its own names: at the start of a word of the name; from three letters on also at the start of one of its other
//     names (one or two letters would find half the pane by them: "vo" is Vozidla and Voda, not the car parks for
//     their "volná místa"); from five letters on anywhere in the name ("kamery" in Webkamery; shorter pieces are in
//     too many words, "dnes" in "týdne")
//   its explanation: at the start of a word, from four letters on ("vod" must not find "kam vodí návštěvy")
//   the heading it stands under (the section, the group of datové mapy)
// 3 = every word in the names or the explanation, one at least in the names; 2 = every word in the explanation;
// 1 = every word somewhere, the heading included; 0 = not this row. Rows of 2 and 3 always show. A row of 1 shows
// when its section has no row of 3: a section named by the words shows whole ("mhd", "doprava"), but "nehody"
// gives Kolony a nehody, not all of "Doprava, nehody".
export function level(r, ws) {
  let own = true, named = false;
  for (const w of ws) {
    const s = stem(w);
    const n = r.nameW.some(h => h.startsWith(s)) || (w.length >= 3 && r.headW.some(h => h.startsWith(s))) || (w.length >= 5 && r.name.includes(s));
    const d = !n && w.length >= 4 && r.descW.some(h => h.startsWith(w.length >= 5 ? w.slice(0, -1) : w)); // (one letter of the ending at most: "čištění" is not "cisterny")
    if (n) named = true;
    else if (!d) { own = false; if (!r.ctxW.some(h => h.startsWith(s))) return 0; }
  }
  return !own ? 1 : named ? 3 : 2;
}
// which rows show: rows = [{ sec, lv }]; sets .show on each, returns how many
export function decide(rows) {
  const strong = new Set();
  let n = 0;
  for (const r of rows) if (r.lv === 3) strong.add(r.sec);
  for (const r of rows) { r.show = r.lv >= 2 || (r.lv === 1 && !strong.has(r.sec)); if (r.show) n++; }
  return n;
}

// The field of a pane. Esc gives the pane back first (the next one closes it: main.js lets the first through to the
// field while the pane has the class "finding"), × does the same, Enter puts the keyboard of a phone away.
// A phone: the pane is a sheet at the bottom of the screen and the keyboard would lie over the rows found. While the
// field has the caret the sheet stands on the keyboard (the part of the screen that is left: visualViewport).
//   isOn: something is filtered · clear: back to the whole pane · onCaret: the caret came or went (after the tap that
//   took it away has landed)
export function paneField({ pane, q, x, isPhone, isOn, clear, onCaret = () => {} }) {
  q.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOn()) { e.preventDefault(); e.stopPropagation(); clear(); }
    if (e.key === 'Enter') q.blur();
  });
  x.addEventListener('click', () => { clear(); if (!isPhone()) q.focus(); });
  const vv = window.visualViewport;
  let lifted = false, dropT = 0;
  function drop() { lifted = false; pane.classList.remove('lf-kb'); pane.style.removeProperty('--lf-kb'); pane.style.removeProperty('--lf-vh'); }
  function lift() {
    if (!vv || !isPhone() || document.activeElement !== q || vv.scale > 1.01) return;
    const kb = Math.round(window.innerHeight - vv.height - vv.offsetTop);
    if (kb < 120) { if (lifted) drop(); return; } // (no keyboard on the screen: a tablet with keys, or it has gone)
    lifted = true;
    pane.style.setProperty('--lf-kb', `${kb}px`); pane.style.setProperty('--lf-vh', `${Math.round(vv.height)}px`);
    pane.classList.add('lf-kb');
  }
  if (vv) { vv.addEventListener('resize', lift); vv.addEventListener('scroll', lift); }
  q.addEventListener('focus', () => { clearTimeout(dropT); onCaret(); lift(); });
  // (a little later: a tap on a row found takes the caret away first, the row must not move under the finger)
  q.addEventListener('blur', () => { clearTimeout(dropT); dropT = setTimeout(() => { if (document.activeElement === q) return; onCaret(); if (lifted) drop(); }, 250); });
  if (document.activeElement === q) { onCaret(); lift(); } // (the caret came before the module)
}

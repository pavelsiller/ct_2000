export const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['a', 'v', 'na', 'u', 've', 'brno', 'brne', 'brna', 'the', 'and', 'of', 'z', 'do', 'pro', 'k', 'se', 's']);
export const words = s => norm(s).split(' ').filter(w => w.length > 2 && !STOP.has(w));
// Two names of the same place: all words agree in some Czech form ("Výstaviště Brno" = "Brněnské výstaviště",
// "Kostel sv. Jiljí" = "sv. Jiljí"), or the shorter name of at least two words is all in the longer one
// ("Janáčkovo divadlo" in "Janáčkovo divadlo – Národní divadlo Brno"); letters and numbers must agree ("Pavilon A").
const OPTIONAL = new Set(['park', 'kostel', 'svaty', 'svata', 'svateho', 'svate', 'brnenska', 'brnenske', 'brnensky', 'brnenskeho']);
const sameWord = (a, b) => { if (a === b) return true; let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i >= 5 && i >= Math.max(a.length, b.length) - 3; };
const marks = s => String(s).split(/[^\p{L}\p{N}]+/u).filter(t => /^(\p{Lu}|\d+)$/u.test(t)).sort().join(','); // (Unicode-aware: "Výstaviště" is a word, not a "V")
export function sameName(a, b) {
  if (marks(a) !== marks(b)) return false;
  const ka = words(a).filter(w => !OPTIONAL.has(w)), kb = words(b).filter(w => !OPTIONAL.has(w));
  if (!ka.length || !kb.length) return false;
  const [s, l] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (!s.every(x => l.some(y => sameWord(x, y)))) return 0;
  return l.every(y => s.some(x => sameWord(x, y))) ? 2 : s.length >= 2 ? 1 : 0; // 2 = the same name, 1 = contained
}
// How well a place (name pn) fits a tag (name wn) d metres away, the rule of the map: the same name up to 800 m, a
// contained name up to 200 m, else shared words up to 120 m. 0 = not the same place; the higher, the better.
export function placeScore(pn, wn, d) {
  const sn = d <= 800 ? sameName(pn, wn) : 0;
  if (sn === 2 || (sn === 1 && d <= 200)) return 2 - d / 800;
  if (d > 120) return 0;
  const pw = words(pn), ww = words(wn);
  const common = pw.filter(x => ww.some(y => y.startsWith(x.slice(0, 5)) || x.startsWith(y.slice(0, 5)))).length;
  const score = common / Math.max(1, Math.min(pw.length, ww.length)) - d / 400;
  return common && score > 0.3 ? score : 0;
}

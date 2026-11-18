const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const CS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
// a Python literal (single quotes, None/True/False) → JSON
const pyToJson = s => s.replace(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\bNone\b|\bTrue\b|\bFalse\b/g, (m, sq, dq) => {
  if (sq != null) return JSON.stringify(sq.replace(/\\(.)/g, '$1'));
  if (dq != null) return m;
  return m === 'None' ? 'null' : m.toLowerCase();
});
// "08:00" → "8:00", "18:00:00" → "18:00", "9.30" → "9:30"
const time = t => { const m = String(t ?? '').trim().match(/^(\d{1,2})[:.](\d{2})/); return m ? `${+m[1]}:${m[2]}` : ''; };
// "Po", "Po–St", "Po, St–Pá"
function dayRanges(idx) {
  const out = [];
  for (let i = 0; i < idx.length; i++) {
    let j = i; while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    out.push(j > i ? `${CS[idx[i]]}–${CS[idx[j]]}` : CS[idx[i]]);
    i = j;
  }
  return out.join(', ');
}
export function readableHours(s) {
  if (s == null) return '';
  const raw = String(s).trim();
  if (!/^\[\s*\{/.test(raw) && !/^\{/.test(raw)) return raw === 'None' || raw === 'null' ? '' : raw;
  let list;
  try { list = JSON.parse(pyToJson(raw)); } catch { return ''; } // broken: better nothing than the code
  if (!Array.isArray(list)) list = [list];
  // the slots of each day (a day can have more of them: 9:00–12:00, 13:00–17:00)
  const byDay = new Map(); // 0..6 | 'hol' | 'other' → ['10:00–18:00', …] ('' = the day without times)
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const o = time(e.opens), c = time(e.closes);
    const slot = o && c ? `${o}–${c}` : o ? `od ${o}` : c ? `do ${c}` : '';
    const days = (Array.isArray(e.dayOfWeek) ? e.dayOfWeek : [e.dayOfWeek]).map(d => {
      const n = String(d ?? '').replace(/^.*[/#]/, '').toLowerCase();
      const i = DAYS.indexOf(n);
      return i >= 0 ? i : n === 'publicholidays' ? 'hol' : 'other';
    });
    for (const d of days) {
      if (d === 'other' && !slot) continue; // a day we don't know and no times: says nothing
      const a = byDay.get(d) || []; if (!a.includes(slot)) a.push(slot); byDay.set(d, a);
    }
  }
  // the days with the same times on one line, in the order of the week
  const groups = new Map(); // 'slots' → { days: [0..6], hol, other }
  for (const d of [0, 1, 2, 3, 4, 5, 6, 'hol', 'other']) {
    const slots = byDay.get(d); if (!slots) continue;
    const key = slots.filter(Boolean).join(', ');
    const g = groups.get(key) || { days: [], hol: false, other: false };
    if (typeof d === 'number') g.days.push(d); else g[d] = true;
    groups.set(key, g);
  }
  const named = [...byDay.keys()].some(d => d !== 'other');
  const lines = [];
  for (const [slots, g] of groups) {
    const parts = [];
    if (g.days.length === 7) parts.push('Denně'); else if (g.days.length) parts.push(dayRanges(g.days));
    if (g.hol) parts.push(parts.length ? 'svátky' : 'Svátky');
    // a day the source could not name: "a jiné dny" beside the named ones; alone it is just the times
    if (g.other && named) parts.push(parts.length ? 'jiné dny' : 'Jiné dny');
    const days = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} a ${parts.at(-1)}` : parts[0] || '';
    lines.push(`${days} ${slots}`.trim());
  }
  return lines.filter(Boolean).join('\n');
}

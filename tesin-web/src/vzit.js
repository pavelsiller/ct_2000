// ---- the pixel icons (16 x 16; the letters are colours of PAL, '.' empty)
const PAL = {
  k: '#10151f', r: '#c9583b', R: '#8f3a25', l: '#ec8f70', w: '#f0f2ea', v: '#adb6c6', b: '#5fb3e6', B: '#3a86bd',
  m: '#93c96a', M: '#5d8a3c', s: '#cfe9ff', f: '#c9583b', d: '#0d1220', y: '#f3c868', t: '#a8703f', T: '#6e4527',
  i: '#cfe9ff', I: '#8fc7ef', c: '#c3cad6', C: '#8a94a8',
};
const SPR = {
  umbrella: ['................', '.......kk.......', '.....kkrrkk.....', '....krrrrrrk....', '...krlrrrrrRk...', '..krlrrrrrrrRk..',
    '.krlrrrrrrrrrRk.', 'krrrrrrrrrrrrrRk', 'kk.kkk.kk.kkk.kk', '........w.......', '..b.....w....b..', '........w.......',
    '...b....w...b...', '.....w..w.......', '......ww........', '................'],
  inverted: ['kk.kkk.kk.kkk.kk', 'krrrrrrrrrrrrrRk', '.krlrrrrrrrrrRk.', '..krlrrrrrrrRk..', '...krlrrrrrRk...', '....krrrrrrk....',
    '.....kkrrkk.....', '.......kk.......', '........w.......', 'vvvvv...w.......', '........w..vvvv.', '.vvvv...w.......',
    '........w.vvvvvv', '.....w..w.......', '......ww........', '................'],
  mitten: ['................', '......kkkk......', '.....kmmmmk.....', '....kmlmmmmk..s.', '....kmmmmmmk.sss', '.kk.kmmmmmmk..s.',
    'kmmkkmmmmmMk....', 'kmmmkmmmmmMk....', '.kmmmmmmmmMk....', '..kmmmmmmmMk....', '...kmmmmmmMk....', '...kwwwwwwwk....',
    '...kwvwvwvwk....', '...kwwwwwwwk....', '...kkkkkkkkk....', '................'],
  shades: ['................', '................', '................', '................', '................', '.ffffffffffffff.',
    'fdydddddfdyddddf', 'fyddddddfydddddf', 'fdddddf..fdddddf', '.fdddf....fdddf.', '..fff......fff..', '................',
    '................', '................', '................', '................'],
  bottle: ['......kkkk......', '......kffk......', '......kkkk......', '......kbbk......', '.....kbbbbk.....', '....kbbbbbbk....',
    '....kibbbbBk....', '....kibbbbBk....', '....kwwwwwwk....', '....kwvvvvwk....', '....kwwwwwwk....', '....kibbbbBk....',
    '....kibbbbBk....', '....kbbbbbBk....', '....kkkkkkkk....', '................'],
  boot: ['................', '................', '....kkkkk.......', '....kTttk.......', '....kTttk.......', '....kTttk.......',
    '....kTttk.......', '....kTttk.......', '....kTtttkkk....', '....kTttttttkk..', '....kTtttttttk..', '...kkkkkkkkkkk..',
    'iiiiiiiiiiiiiiii', 'IIIIIIIIIIIIIIII', '.I...I...I...I..', '.....I.......I..'],
  storm: ['................', '......kkkk......', '.....kcccck.....', '..kkkcccccckkk..', '.kcccccccccccck.', 'kcccccccccccccck',
    'kCcccccccccccCCk', '.kCCCCCCCCCCCCk.', '..kkkkkkkkkkkk..', '.......yy.......', '..b...yy.....b..', '.....yyyy.......',
    '...b...yy..b....', '......yy........', '.....y..........', '................'],
  beanie: ['.s.....ww.......', '.......ww.....s.', '......wwww......', '.....kkkkkk.....', '....krrrrrrk....', '...krlrrrrrRk...',
    '..krlrrrrrrrRk..', '..krrrrrrrrrRk..', '.kwwwwwwwwwwwwk.', '.kwvwvwvwvwvwwk.', '.kwwwwwwwwwwwwk.', '.kkkkkkkkkkkkkk.',
    '................', 's.............s.', '......s.........', '................'],
};
const svgCache = new Map();
// the icon as an inline SVG, px wide (decorative: the text beside it says the same)
export function vzitIcon(name, px = 24) {
  const key = `${name}|${px}`;
  if (!svgCache.has(key)) {
    const g = SPR[name] || SPR.umbrella;
    let r = '';
    g.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = PAL[row[x]]; if (c) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`; } });
    svgCache.set(key, `<svg viewBox="0 0 16 16" width="${px}" height="${px}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${r}</svg>`);
  }
  const s = document.createElement('span');
  s.className = 'vzit-ico';
  s.innerHTML = svgCache.get(key); // (our own constant markup)
  return s;
}

// ---- the things, in order of importance (the first that holds is shown); tone: the colour of its words
const ORDER = ['alert', 'storm', 'ice', 'wind', 'rain', 'snow', 'frost', 'heat', 'sun'];
const TONE = { alert: 'warn', storm: 'warn', ice: 'cold', wind: 'wet', rain: 'wet', snow: 'cold', frost: 'cold', heat: 'sun', sun: 'sun' };
const ICON = { storm: 'storm', ice: 'boot', wind: 'inverted', rain: 'umbrella', snow: 'beanie', frost: 'mitten', heat: 'bottle', sun: 'shades' };
// what the figure in the map wears (src/chodec.js gear)
const GEAR = { storm: 'umbrella', ice: 'hat', wind: 'umbrella-inv', rain: 'umbrella', snow: 'hat', frost: 'hat', heat: 'shades', sun: 'shades' };
// a ČHMÚ warning by its name: the thing it is about
const alertKind = ev => {
  const e = (ev || '').toLowerCase();
  return /bouř/.test(e) ? 'storm' : /ledovk|náled|mrznouc/.test(e) ? 'ice' : /vítr|vichřic/.test(e) ? 'wind' : /sníh|sněh|závěj/.test(e) ? 'snow'
    : /mráz|nízk/.test(e) ? 'frost' : /vysok|horko|teplot/.test(e) ? 'heat' : /déšť|srážk|povod/.test(e) ? 'rain' : 'storm';
};
const n0 = x => Math.round(x).toString().replace('-', '−');
// the felt temperature: the wind chill (°C, the wind in m/s; only below 10 °C and with some wind)
const chill = (t, ws) => { const v = ws * 3.6; return t <= 10 && v >= 4.8 ? 13.12 + 0.6215 * t - 11.37 * v ** 0.16 + 0.3965 * t * v ** 0.16 : t; };

// the hour rows by their time ('2026-11-16T08:00'), kept per answer of Open-Meteo
const rowsOf = new WeakMap();
const indexOf = h => { let m = rowsOf.get(h); if (!m) { m = new Map(h.time.map((t, i) => [t, i])); rowsOf.set(h, m); } return m; };
const pad = n => String(n).padStart(2, '0');
// the local hour 'YYYY-MM-DDTHH:00' of a second of the day of the search (ymd: 20261116; sec may pass midnight)
function hourKey(ymd, sec) {
  const d = new Date(Date.UTC(Math.floor(ymd / 1e4), Math.floor(ymd / 100) % 100 - 1, ymd % 100) + Math.floor(sec / 3600) * 3600e3);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:00`;
}

// The moments out of a journey: [{ i (the leg: a walk, or the ride waited for), kind: 'walk' | 'wait', a, b (seconds
// of the day of the search) }]. legs as spojeni.js live() gives them (rides with eDep / eArr), leave = when one sets off.
export function outside(legs, leave) {
  const out = [];
  let t = leave;
  legs.forEach((l, i) => {
    if (l.kind === 'walk') { if (l.sec >= 60) out.push({ i, kind: 'walk', a: t, b: t + l.sec }); t += l.sec; return; }
    if (l.eDep - t >= 120) out.push({ i, kind: 'wait', a: t, b: l.eDep });
    t = Math.max(t, l.eArr);
  });
  return out;
}

// The things for those moments: { top, also (another, of another kind: precipitation vs. comfort), byLeg: Map(leg ->
// { key, short, gear }) } or null. d = { fc, aq, alerts } (src/forecast.js outlook), ymd the day of the search, nowSec
// the second of that day now, nowMs Date.now() at it. Only the moments still to come within the next 12 hours.
export function judge(wins, d, ymd, nowSec, nowMs = Date.now()) {
  if (!d || !d.fc || !d.fc.hourly) return null;
  const H = d.fc.hourly, idx = indexOf(H);
  const A = d.aq && d.aq.hourly, aIdx = A ? indexOf(A) : null;
  const hm = sec => { const s = ((Math.round(sec) % 86400) + 86400) % 86400; return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}`; };
  const found = []; // { key, w, at (sec), val }
  for (const w of wins) {
    if (w.b < nowSec || w.a > nowSec + 12 * 3600) continue;
    const a = Math.max(w.a, nowSec), seen = {};
    const hit = (key, at, val, better = (x, y) => x > y) => { if (!seen[key]) seen[key] = { key, w, at, val }; else if (better(val, seen[key].val)) seen[key].val = val; };
    // the ČHMÚ warnings in force at that moment
    const msA = nowMs + (a - nowSec) * 1000, msB = nowMs + (w.b - nowSec) * 1000;
    for (const al of d.alerts || []) {
      const on = al.onset ? Date.parse(al.onset) : -Infinity, off = al.expires ? Date.parse(al.expires) : Infinity;
      if (on <= msB && off >= msA) hit('alert', a, al);
    }
    // the hour rows: from the hour after the start (its sums are of the hour the start is in) to the one after the end
    for (let h = Math.floor(a / 3600) + 1; h <= Math.floor(w.b / 3600) + 1; h++) {
      const r = idx.get(hourKey(ymd, h * 3600));
      if (r == null) continue;
      const at = Math.max(a, (h - 1) * 3600); // (when that hour's weather starts to count)
      const code = H.weather_code[r] ?? 0, pp = H.precipitation_probability?.[r] ?? 0, pr = H.precipitation?.[r] ?? 0;
      const sn = H.snowfall?.[r] ?? 0, t = H.temperature_2m[r], ws = H.wind_speed_10m?.[r] ?? 0;
      const snowy = sn > 0 || (code >= 71 && code <= 77) || code === 85 || code === 86;
      const wet = !snowy && (pr >= 0.2 || pp >= 60);
      if (code >= 95) hit('storm', at, pp);
      if ([56, 57, 66, 67].includes(code)) hit('ice', at, t);
      if (wet && ws >= 9) hit('wind', at, ws);
      if (wet) hit('rain', at, pp);
      if (snowy && (pp >= 40 || sn > 0)) hit('snow', at, t, (x, y) => x < y);
      if (t != null) { const c = chill(t, ws); if (c <= -3) hit('frost', at, { t, c }, (x, y) => x.c < y.c); }
      if (t >= 30 && w.kind === 'walk' && w.b - w.a >= 600) hit('heat', at, t);
      const ai = aIdx && aIdx.get(hourKey(ymd, (h - 1) * 3600)); // (UV is the state at the time: the hour one is in)
      const uv = ai != null ? A.uv_index?.[ai] : null;
      if (uv >= 6 && H.is_day?.[r] && (H.cloud_cover?.[r] ?? 0) < 50) hit('sun', at, uv);
    }
    found.push(...Object.values(seen));
  }
  if (!found.length) return null;
  const rank = f => ORDER.indexOf(f.key);
  found.sort((x, y) => rank(x) - rank(y) || x.at - y.at);
  // (the same thing on more moments out than one: no "cestou na zastávku X", it is all the way)
  const cnt = {};
  for (const f of found) cnt[f.key] = (cnt[f.key] || 0) + 1;
  const item = f => {
    const soon = f.at > Math.max(f.w.a, nowSec) + 300; // (it starts later than one is out: "od 7:50")
    const o = { key: f.key, tone: TONE[f.key], icon: ICON[f.key], gear: GEAR[f.key], i: f.w.i, kind: f.w.kind, where: false };
    const v = f.val;
    switch (f.key) {
      case 'alert': { const k = alertKind(v.event); Object.assign(o, { icon: ICON[k], gear: GEAR[k], bold: `Výstraha ČHMÚ: ${v.event}.`, rest: 'Platí v čase vaší cesty', short: (v.event || 'výstraha').toLowerCase() }); break; }
      case 'storm': Object.assign(o, { bold: 'Bouřky.', rest: `${soon ? `Kolem ${hm(f.at)} mají` : 'Mají'} být bouřky, zvažte jiné spojení`, short: 'bouřky', where: cnt[f.key] === 1 }); break;
      case 'ice': Object.assign(o, { bold: 'Klouže to.', rest: 'Mrznoucí déšť, na chodníku může být náledí', short: 'náledí', where: cnt[f.key] === 1 }); break;
      case 'wind': Object.assign(o, { bold: 'Deštník to nevydrží.', rest: `Prší a fouká ${n0(v)} m/s, v nárazech víc. Spíš kapuce`, short: 'déšť a vítr' }); break;
      case 'rain': Object.assign(o, { bold: 'Vemte deštník.', rest: `${soon ? `Od ${hm(f.at)} má` : 'Má'} pršet${v >= 1 ? ` (${n0(v)} %)` : ''}`, short: soon ? `od ${hm(f.at)} prší` : 'prší', where: cnt[f.key] === 1 }); break;
      case 'snow': Object.assign(o, { bold: 'Čepice.', rest: `${soon ? `Od ${hm(f.at)} má` : 'Má'} sněžit, ${n0(v)} °C`, short: 'sněží', where: cnt[f.key] === 1 }); break;
      case 'frost': Object.assign(o, { bold: 'Rukavice.', rest: `${v.t <= 0 ? 'Mrzne' : 'Fouká'}, pocitově ${n0(v.c)} °C`, short: `pocitově ${n0(v.c)} °C` }); break;
      case 'heat': Object.assign(o, { bold: 'Vemte si vodu.', rest: `${soon ? `V ${hm(f.at)} bude` : 'Venku je'} ${n0(v)} °C`, short: `${n0(v)} °C` }); break;
      case 'sun': Object.assign(o, { bold: 'Brýle a krém.', rest: `Silné slunce, UV ${n0(v)}`, short: `UV ${n0(v)}` }); break;
    }
    return o;
  };
  const top = item(found[0]);
  // another thing of the other kind (rain and frost on one walk): one short addition
  const wetKind = k => ['alert', 'storm', 'ice', 'wind', 'rain', 'snow'].includes(k);
  const sec = found.find(f => wetKind(f.key) !== wetKind(top.key));
  // per leg the most important thing on it (the icon on the time line, what the figure wears there)
  const byLeg = new Map();
  for (const f of found) if (!byLeg.has(f.w.i)) byLeg.set(f.w.i, item(f));
  return { top, also: sec ? item(sec) : null, byLeg };
}

export function fakeWeather(kind) {
  const pad2 = n => String(n).padStart(2, '0'), time = [];
  for (const d of [0, 1]) { const t = new Date(Date.now() + d * 864e5); for (let h = 0; h < 24; h++) time.push(`${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}T${pad2(h)}:00`); }
  const V = { dest: [61, 75, 0.8, 0, 6, 3], vitr: [63, 90, 2, 0, 8, 11], snih: [73, 80, 0.5, 0.6, -1, 3], mraz: [1, 0, 0, 0, -5, 3], vedro: [0, 0, 0, 0, 32, 2],
    slunce: [0, 0, 0, 0, 24, 2], bourka: [95, 80, 3, 0, 22, 5], naledi: [67, 80, 0.6, 0, -1, 3] }[kind] || [61, 75, 0.8, 0, 6, 3];
  const all = v => time.map(() => v);
  const hourly = { time, weather_code: all(V[0]), precipitation_probability: all(V[1]), precipitation: all(V[2]), snowfall: all(V[3]), temperature_2m: all(V[4]), wind_speed_10m: all(V[5]), is_day: all(1), cloud_cover: all(V[0] ? 90 : 5) };
  return { fc: { hourly }, aq: { hourly: { time, uv_index: all(kind === 'slunce' ? 7 : 1) } }, alerts: [] };
}

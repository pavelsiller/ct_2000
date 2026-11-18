import fs from 'node:fs';
import path from 'node:path';
import { picKey } from './mediakeys.mjs';
import { sameName } from '../src/placenames.js';
import { readableHours } from '../src/hours.js';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { iconVersion } from './iconversion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'dist-public');
const ICON_V = iconVersion(path.join(ROOT, 'public'));
const DATA = path.join(ROOT, 'public/data');
const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE = (site.siteUrl || '').replace(/\/?$/, '/');
if (!SITE) { console.log('placepages: site.config.json has no siteUrl, the pages of the places need the absolute address; skipped'); process.exit(0); }
const STATS = site.statsUrl ? site.statsUrl.replace(/\/?$/, '/') : '';
const STATS_TAG = STATS ? `<script defer data-domain="${new URL(SITE).hostname}" src="${STATS}js/script.outbound-links.js"></script>\n` : '';
const envFile = ['.env.public', '.env'].map(f => path.join(ROOT, f)).find(f => fs.existsSync(f));
const MEDIA = ((envFile && (/^VITE_MEDIA_BASE=(.*)$/m.exec(fs.readFileSync(envFile, 'utf8')) || [])[1]) || `${SITE}cdn/`).trim().replace(/\/?$/, '/');
const mediaPics = (() => { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'media.json'), 'utf8')).pics || {}; } catch { return {}; } })();
const picOf = url => { const k = picKey(url || ''), s = mediaPics[k]; return s ? `${MEDIA}img/${s}/${k}-m.webp` : ''; };

// ---- the same slug as in the map
const slugOf = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = esc;
// the sources put words where an address belongs ("Veřejně dostupný zdroj", "zdarma", a company's name): only a real
// address becomes a link, as in the map (isUrl in src/main.js); a crawler would follow the words as a relative address
const isUrl = u => /^https?:\/\//i.test(u || '');
// the project's card in the city's Brno Brzo map (brzoCard in src/main.js)
const brzoCard = id => `https://experience.arcgis.com/experience/829f491bc03242ba99ba2e246056e982?dlg=Karta-projektu#data_s=id%3AdataSource_1-190735f1807-layer-113%3A${id}`;
// a Wikipedia tag of one to three letters (the pavilions of the exhibition grounds "A", "B"…) is named after its
// article, "Pavilon A" (wikiPoiName in src/main.js, the map uses the same slug)
const wikiPoiName = (name, key) => (name.length <= 3 && key.length > name.length ? key.replace(/\s*\([^)]*\)$/, '') : name);
// image pixel -> lon/lat (imgToLonLat in src/main.js, rotation 0)
const META = read('r0/meta.json');
const LON0 = 16.606, LAT0 = 49.201, KX = Math.cos((LAT0 * Math.PI) / 180) * 111320, KY = 110574;
const imgToLonLat = (X, Y) => [(X / META.A - META.R) / KX + LON0, (META.R - ((Y - META.TOP + 60 * META.V) * 2) / META.A) / KY + LAT0];
const centroid = ring => { let x = 0, y = 0, n = 0; for (let i = 0; i + 1 < ring.length; i += 2) { x += ring[i]; y += ring[i + 1]; n++; } return n ? [x / n, y / n] : null; };
const dist = (a, b) => Math.hypot((a.lon - b.lon) * KX, (a.lat - b.lat) * KY);

// ---- collect the places: { slug, name, kind, texts: [{ t, by }], lon, lat, img: { src, alt, by, url }, facts: [[k, v]], links: [{ t, u }],
//      src: the sources (story, wiki, gtb, proj, cobude), names: the names the map knows the place by (a Wikipedia tag: "A") }
const places = new Map();
function place(name, kind, src, alias = name) {
  const slug = slugOf(name);
  if (!slug) return null;
  let p = places.get(slug);
  if (!p) { p = { slug, name, kind, texts: [], facts: [], links: [], sameAs: [], src: new Set(), names: new Set() }; places.set(slug, p); }
  else if (!p.kind && kind) p.kind = kind;
  p.src.add(src); p.names.add(alias);
  return p;
}
const addText = (p, t, by) => { t = String(t || '').trim(); if (t && !p.texts.some(x => x.t === t)) p.texts.push({ t, by }); };
const addLink = (p, t, u) => { if (isUrl(u) && !p.links.some(x => x.u === u)) p.links.push({ t, u }); };
const setPos = (p, lon, lat) => { if (p.lon == null && Number.isFinite(lon) && Number.isFinite(lat)) { p.lon = lon; p.lat = lat; } };

// 1. the stories
for (const s of read('r0/stories.json')) {
  const p = place(s.n, s.d || 'Místo s příběhem', 'story'); if (!p) continue;
  addText(p, s.t, 'Brno 2000'); setPos(p, s.lon, s.lat);
  if (s.w) p.wiki = s.w;
}
// 2. the Wikipedia tags
const wiki = read('wiki.json');
const renamed = new Map(); // the old address of a page -> the new one (_redirects)
for (const [tag, key, X, Y] of read('r0/wikipois.json')) {
  const w = wiki[key]; if (!w) continue;
  const name = wikiPoiName(tag, key);
  const p = place(name, 'Památka či zajímavost', 'wiki', tag); if (!p) continue;
  if (slugOf(tag) !== p.slug) renamed.set(slugOf(tag), p.slug);
  const [lon, lat] = imgToLonLat(X, Y); setPos(p, lon, lat);
  addText(p, w[0], 'Wikipedie, CC BY-SA 4.0');
  if (w[1]) { addLink(p, 'Článek na Wikipedii', w[1]); p.sameAs.push(w[1]); }
  if (w[2] && !p.img && picOf(w[2])) p.img = { src: picOf(w[2]), alt: name, by: 'Wikimedia Commons', url: w[3] ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(w[3])}` : w[1] };
}
// 3. GO TO BRNO
const gtb = read('gotobrno.json'), gtbd = read('gotobrno-detail.json');
gtb.places.forEach((l, i) => {
  const d = gtbd.places[i] || {};
  const p = place(l.n, 'Tip z Go to Brno', 'gtb'); if (!p) return;
  setPos(p, l.lon, l.lat);
  addText(p, d.t, 'Go to Brno (TIC Brno)');
  if (d.addr) p.facts.push(['Adresa', d.addr.replace(/, Česko$/, '')]);
  if (readableHours(d.hours)) p.facts.push(['Otevírací doba', readableHours(d.hours)]);
  if (d.url) addLink(p, 'Místo na gotobrno.cz', d.url);
  if (d.web) addLink(p, 'Web místa', d.web);
  // (the tickets are an address or the prices in words)
  if (isUrl(d.tickets)) addLink(p, 'Vstupenky', d.tickets); else if (d.tickets) p.facts.push(['Vstupné', d.tickets]);
  // (the GO TO BRNO photos are not copied: their licence is not stated, the map only links to them)
});
// 4. the city projects (Brno Brzo) and the city's "Co bude" pages
const proj = read('projects.json'), projd = read('projects-detail.json');
const siteweb = fs.existsSync(path.join(DATA, 'siteweb.json')) ? read('siteweb.json').items || {} : {};
for (const r of proj.projects) {
  const d = projd[r.id] || {};
  const name = r.cb ? r.cb.t : r.n; if (!name) continue;
  const p = place(name, r.ty ? `Projekt · ${r.ty}` : 'Projekt', 'proj'); if (!p) continue;
  const c = r.g && r.g[0] ? centroid(r.g[0]) : null; if (c) setPos(p, c[0], c[1]);
  if (r.cb && r.cb.d) addText(p, r.cb.d, 'Co bude (město Brno)');
  const czd = s => s.split('-').reverse().map(x => x.replace(/^0/, '')).join('. ');
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'web projektu'; } };
  const sum = !(r.cb && r.cb.d) && !d.fix && siteweb[r.id] && siteweb[r.id].sum;
  if (sum && sum.txt) addText(p, sum.txt, `podle webu projektu (${[...new Set((sum.src || []).map(host))].join(', ')})`);
  if (d.fix) addText(p, d.fix.txt, `Brno 2000, upřesněno ${czd(d.fix.date)}${isUrl(d.fix.src) ? ` podle ${host(d.fix.src)}` : ''}`);
  else if (!(sum && sum.txt)) addText(p, d.txt, `Brno Brzo (město Brno)${d.edited ? `, stav k ${czd(d.edited)}` : ''}`);
  if (r.st) p.facts.push(['Stav', r.st]);
  p.proj = r.st || 'neuvedený'; // (counted in the surroundings of the other places)
  if (d.addr) p.facts.push(['Adresa', d.addr]);
  if (d.inv) p.facts.push(['Investor', d.inv]);
  if (d.dev) p.facts.push(['Developer', d.dev]);
  if (d.arch) p.facts.push(['Architekt', d.arch]);
  const card = !r.pt && typeof r.id === 'number' ? brzoCard(r.id) : '';
  const pic = [...(r.cb && r.cb.img ? [r.cb.img] : []), ...(d.imgs || [])].map(picOf).find(Boolean);
  const fromCb = r.cb && r.cb.img && picOf(r.cb.img) === pic;
  if (pic && !p.img) p.img = { src: pic, alt: name, by: fromCb ? 'Co bude, město Brno' : 'Brno Brzo, město Brno', url: [fromCb ? r.cb.url : d.src, card].find(isUrl) || 'https://brzo.brno.cz/' };
  if (r.cb && r.cb.url) addLink(p, 'Projekt na cobude.brno.cz', r.cb.url);
  if (d.web) addLink(p, 'Web projektu', d.web);
  if (d.src && d.src !== d.web) addLink(p, 'Záznam v Brno Brzo', d.src);
  if (card) addLink(p, 'Karta projektu v Brno Brzo', card);
}
for (const c of proj.cobude || []) {
  if (!c.t) continue;
  const p = place(c.t, 'Projekt města', 'cobude'); if (!p) continue;
  addText(p, c.d, 'Co bude (město Brno)');
  // (only our copy of the picture, as everywhere else)
  if (picOf(c.img) && !p.img) p.img = { src: picOf(c.img), alt: c.t, by: 'Co bude, město Brno', url: isUrl(c.url) ? c.url : 'https://cobude.brno.cz/' };
  addLink(p, 'Projekt na cobude.brno.cz', c.url);
}

// ---- one page per place: a GO TO BRNO place joins the story or the Wikipedia tag of the same name (sameName in
// src/placenames.js, as the map joins them into one card: "Divadlo Husa na provázku" = "Husa na provázku", "Mahenovo
// divadlo – Národní divadlo Brno" = "Mahenovo divadlo"), so their texts end on one page instead of pages competing for
// the same searches. Only the strict part of the map's rule: the same name up to 800 m, a name of two words or more
// inside the other up to 200 m; the map's looser "a shared word up to 120 m" would join "Veřejné WC na hradě Špilberk"
// to the castle or "Palác Salm-Reifferscheidtů" to "palác Padowetz". Several GO TO BRNO places may join one tag. The
// page keeps the tag's name, position and link into the map (#misto/<its slug>); the joined page's address is
// redirected. The city's projects stay on their own pages: a project at a place (a reconstruction) is another thing.
function mergeInto(t, q) {
  for (const x of q.texts) addText(t, x.t, x.by);
  for (const f of q.facts) if (!t.facts.some(g => g[0] === f[0])) t.facts.push(f);
  for (const l of q.links) addLink(t, l.t, l.u);
  if (!t.img && q.img) t.img = q.img;
  places.delete(q.slug);
  renamed.set(q.slug, t.slug);
  for (const [from, to] of renamed) if (to === q.slug) renamed.set(from, t.slug);
}
const anchors = [...places.values()].filter(p => (p.src.has('story') || p.src.has('wiki')) && p.lon != null);
// a service or a market at a place keeps its own page (GO TO BRNO has no categories, the name tells): its opening
// hours would end on the page of the station or the square, and "vánoční trhy Brno" is a search of its own
const OWN_PAGE = /^(veřejné wc|(vánoční|velikonoční|farmářské|adventní) trhy)\b/i;
const joined = [];
for (const q of [...places.values()]) {
  if (q.lon == null || q.src.size !== 1 || !q.src.has('gtb') || OWN_PAGE.test(q.name)) continue;
  let best = null, bs = 0;
  for (const a of anchors) {
    const d = dist(a, q);
    if (d > 800) continue;
    for (const n of a.names) { const sn = sameName(q.name, n); const s = sn === 2 || (sn === 1 && d <= 200) ? 2 - d / 800 : 0; if (s > bs) { bs = s; best = a; } }
  }
  if (!best) continue;
  joined.push(`${q.name} -> ${best.name} (${Math.round(dist(best, q))} m)`);
  mergeInto(best, q);
}
if (process.env.PLACEPAGES_JOINED) fs.writeFileSync(process.env.PLACEPAGES_JOINED, joined.join('\n') + '\n');

// only places that have something to say
const list = [...places.values()].filter(p => p.texts.length);
const placed = list.filter(p => p.lon != null);
for (const p of list) {
  if (p.lon == null) { p.near = []; continue; }
  p.near = placed.filter(q => q !== p).map(q => [dist(p, q), q]).sort((a, b) => a[0] - b[0]).slice(0, 6).map(([d, q]) => ({ q, d }));
}

const tryRead = f => { try { return read(f); } catch { return null; } };
const km = d => (d < 950 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1).replace('.', ',')} km`);
const andList = a => (a.length > 1 ? `${a.slice(0, -1).join(', ')} a ${a[a.length - 1]}` : a[0] || '');
const count = (n, [one, few, many]) => `${n} ${n === 1 ? one : n <= 4 ? few : many}`; // 1 / 2–4 / 5+ (21 památek)
// the city districts (boundaries.json: the city at level 8, its 29 districts at level 9; rings of lon, lat)
const districts = (tryRead('boundaries.json') || []).filter(b => b.lvl === 9);
const inRing = (r, lon, lat) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { if ((r[i + 1] > lat) !== (r[j + 1] > lat) && lon < ((r[j] - r[i]) * (lat - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; } return c; };
const districtOf = p => (districts.find(b => b.r.some(r => inRing(r, p.lon, p.lat))) || {}).n || '';
// the height above the sea (dem.json, elevAt in src/layers.js: 16-bit metres every 100 m around the map's origin)
const demF = tryRead('dem.json');
const dem = demF && (() => { const b = Buffer.from(demF.d, 'base64'), a = new Int16Array(b.length / 2); for (let i = 0; i < a.length; i++) a[i] = b.readInt16LE(2 * i); return { n: demF.n, step: demF.step, r: demF.r, a }; })();
function elevOf(p) {
  if (!dem) return null;
  const x = (p.lon - LON0) * KX, y = (p.lat - LAT0) * KY;
  if (Math.abs(x) > dem.r - dem.step || Math.abs(y) > dem.r - dem.step) return null;
  const fx = (x + dem.r) / dem.step, fy = (dem.r - y) / dem.step, i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * dem.n + i, A = dem.a;
  return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + dem.n] * (1 - u) + A[k + dem.n + 1] * u) * v;
}
// the centre: náměstí Svobody
const CENTRE = { lon: 16.60796, lat: 49.19522 };
const DIRS = ['severně', 'severovýchodně', 'východně', 'jihovýchodně', 'jižně', 'jihozápadně', 'západně', 'severozápadně'];
const dirOf = p => DIRS[Math.round(((Math.atan2((p.lon - CENTRE.lon) * KX, (p.lat - CENTRE.lat) * KY) * 180) / Math.PI + 360) % 360 / 45) % 8];
// the stops (mhd-stops.json: number -> [name, lon, lat], one per name) and their lines (mhd.json: a profile is
// [route, …, stop numbers at 5], a trip [profile, service, start, headsign], a service [weekdays, from, to, added,
// removed]). The timetable also holds the past days and the one-off trips (a weekend diversion, a run to the depot),
// so a line counts at a stop only if from the day of the build on it stops there on a quarter of the days or more,
// three times a day or more on average; the replacement lines (x1, x94…) are left out, they run only during closures
const mhd = tryRead('mhd.json'), stopsF = tryRead('mhd-stops.json');
const routesAt = new Map();
let mhdFrom = 0;
if (mhd) {
  const ymd = d => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const today = +new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' }).replace(/-/g, '');
  const lo = Math.min(...mhd.services.map(s => s[1])), hi = Math.max(...mhd.services.map(s => s[2]));
  mhdFrom = today <= hi ? Math.max(today, lo) : lo; // (a timetable that ended: all of it)
  const days = [];
  for (let d = new Date(Date.UTC(Math.floor(mhdFrom / 10000), Math.floor(mhdFrom / 100) % 100 - 1, mhdFrom % 100)); ymd(d) <= hi; d = new Date(+d + 864e5)) days.push({ n: ymd(d), wd: (d.getUTCDay() + 6) % 7 });
  const svcDays = mhd.services.map(([wd, from, to, add, rem]) => days.map((d, i) => (add.includes(d.n) || (!rem.includes(d.n) && wd[d.wd] === '1' && d.n >= from && d.n <= to) ? i : -1)).filter(i => i >= 0));
  const perProfile = new Map(); // profile -> service -> trips
  for (let i = 0; i < mhd.trips.length; i += 4) { const pi = mhd.trips[i], s = mhd.trips[i + 1]; if (!perProfile.has(pi)) perProfile.set(pi, new Map()); const m = perProfile.get(pi); m.set(s, (m.get(s) || 0) + 1); }
  const use = new Map(); // "stop|route" -> { days: Set, trips }
  mhd.profiles.forEach((pr, pi) => {
    const svc = perProfile.get(pi); if (!svc) return;
    for (const num of new Set(pr[5] || [])) {
      if (!num) continue;
      const k = `${num}|${pr[0]}`; let u = use.get(k); if (!u) use.set(k, (u = { days: new Set(), trips: 0 }));
      for (const [s, c] of svc) { for (const i of svcDays[s]) u.days.add(i); u.trips += c * svcDays[s].length; }
    }
  });
  for (const [k, u] of use) {
    if (u.days.size < days.length / 4 || u.trips < 3 * u.days.size) continue;
    const [num, r] = k.split('|').map(Number);
    if (!routesAt.has(num)) routesAt.set(num, new Set());
    routesAt.get(num).add(r);
  }
}
const stops = !stopsF || !mhd ? [] : Object.entries(stopsF.stops).map(([num, [n, lon, lat]]) => ({ n, lon, lat, routes: routesAt.get(+num) })).filter(s => s.routes && s.routes.size);
const LINE_KINDS = [['tram', 'tramvaj', 'tramvaje'], ['trol', 'trolejbus', 'trolejbusy'], ['bus', 'autobus', 'autobusy'], ['night', 'noční autobus', 'noční autobusy']];
function linesOf(routes) {
  const by = {};
  for (const ri of routes) {
    const [name, type] = mhd.routes[ri];
    if (/^x/i.test(name)) continue;
    (by[type === 'bus' && /^N\d/.test(name) ? 'night' : type] ||= new Set()).add(name);
  }
  return LINE_KINDS.filter(([k]) => by[k]).map(([k, one, many]) => {
    const l = [...by[k]].sort((a, b) => a.localeCompare(b, 'cs', { numeric: true }));
    return `${l.length === 1 ? one : many} ${l.length > 8 ? `${l.slice(0, 8).join(', ')} a další` : andList(l)}`;
  }).join(', ');
}
// what is around (monuments.json: the cultural monuments; smallpois.json: statues, plaques, crosses, memorable
// trees, fountains, viewpoints, swimming pools), in the accusative after "najdete": 1 / 2–4 / 5+
const mons = (tryRead('monuments.json') || {}).items || [];
const smalls = (tryRead('smallpois.json') || {}).items || [];
const AROUND = [
  ['mon', ['kulturní památku', 'kulturní památky', 'kulturních památek']],
  ['art', ['sochu nebo umělecké dílo', 'sochy a umělecká díla', 'soch a uměleckých děl']],
  ['plaque', ['pamětní desku', 'pamětní desky', 'pamětních desek']],
  ['cross', ['kříž nebo boží muka', 'kříže a boží muka', 'křížů a božích muk']],
  ['tree', ['památný strom', 'památné stromy', 'památných stromů']],
  ['fountain', ['kašnu nebo fontánu', 'kašny a fontány', 'kašen a fontán']],
  ['view', ['vyhlídku', 'vyhlídky', 'vyhlídek']],
  ['pool', ['koupaliště nebo bazén', 'koupaliště a bazény', 'koupališť a bazénů']],
];
const around = [...mons.map(m => ({ k: 'mon', lon: m.lon, lat: m.lat })), ...smalls.map(s => ({ k: s.k, lon: s.lon, lat: s.lat }))].filter(a => Number.isFinite(a.lon) && Number.isFinite(a.lat));
const projPlaces = placed.filter(q => q.proj);

for (const p of list) {
  if (p.lon == null) continue;
  const sent = [];
  // 1. where
  const mc = districtOf(p), h = elevOf(p), dc = dist(p, CENTRE);
  const height = h != null ? `v nadmořské výšce kolem ${Math.round(h / 10) * 10} m` : '';
  const who = p.name.charAt(0).toLocaleUpperCase('cs') + p.name.slice(1); // ("svatí Janové" starts the sentence)
  if (dc < 250) sent.push(`${who} leží v samém centru Brna u náměstí Svobody${mc ? `, v městské části ${mc}` : ''}${height ? `, ${height}` : ''}.`);
  else sent.push(`${who} leží ${mc ? `v městské části ${mc}` : 'za hranicí města Brna'}, ${km(dc)} ${dirOf(p)} od náměstí Svobody${height ? `, ${height}` : ''}.`);
  // 2. the nearest stops (one or two names within 700 m, else the nearest one wherever it is)
  if (stops.length) {
    const byDist = stops.map(s => [dist(p, s), s]).sort((a, b) => a[0] - b[0]);
    const pick = byDist.filter(([d]) => d <= 700).slice(0, 2);
    const say = ([d, s]) => { const l = linesOf(s.routes); return `${s.n}, ${km(d)}${l ? ` (${l})` : ''}`; };
    if (pick.length === 2) sent.push(`Nejbližší zastávka MHD je ${say(pick[0])}; o kus dál ${say(pick[1])}.`);
    else if (pick.length === 1) sent.push(`Nejbližší zastávka MHD je ${say(pick[0])}.`);
    else sent.push(`Nejbližší zastávka MHD, ${byDist[0][1].n}, je ${km(byDist[0][0])} daleko${linesOf(byDist[0][1].routes) ? ` (${linesOf(byDist[0][1].routes)})` : ''}.`);
  }
  // 3. within 300 m
  const n = {};
  for (const a of around) if (dist(p, a) <= 300) n[a.k] = (n[a.k] || 0) + 1;
  const found = AROUND.filter(([k]) => n[k]).map(([k, forms]) => count(n[k], forms));
  if (found.length) sent.push(`Do 300 metrů odsud najdete ${andList(found)}.`);
  // 4. the city's projects within 500 m (the place itself not counted)
  const pr = projPlaces.filter(q => q !== p && dist(p, q) <= 500);
  if (pr.length) {
    const building = pr.filter(q => q.proj === 've výstavbě').length, planned = pr.filter(q => q.proj === 'plánovaný').length;
    const parts = [building && `${building} ve výstavbě`, planned && count(planned, ['plánovaný', 'plánované', 'plánovaných'])].filter(Boolean);
    sent.push(`Do 500 metrů eviduje město ${count(pr.length, ['stavbu nebo projekt', 'stavby a projekty', 'staveb a projektů'])}${parts.length ? ` (${parts.join(', ')})` : ''}.`);
  }
  p.where = sent;
  p.district = mc;
  p.elev = h;
}

// ---- the pages
const CSS = `:root{--sky:#1b2333;--box:#232d42;--rim:#3a4762;--text:#eef1e6;--faint:#a9b3c4;--brick:#c9583b;--leaf:#8cc063;color-scheme:dark}
body{margin:0;background:var(--sky);color:var(--text);font:16px/1.55 "Atkinson Hyperlegible",system-ui,sans-serif}
main{max-width:680px;margin:0 auto;padding:24px 16px 48px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px;font-size:.95rem}
.top a{color:var(--leaf);text-decoration:none;font-weight:700}
h1{font-size:1.8rem;line-height:1.15;margin:0 0 4px}
.kind{color:var(--faint);margin:0 0 16px}
.card{background:var(--box);border:2px solid var(--rim);box-shadow:4px 4px 0 rgba(0,0,0,.35);padding:16px 18px;margin-bottom:18px}
.card p{margin:0 0 12px}.card p:last-child{margin-bottom:0}
figure{margin:0 0 16px}figure img{display:block;width:100%;height:auto;max-height:420px;object-fit:cover;border:2px solid var(--rim)}
figcaption{font-size:.8rem;color:var(--faint);margin-top:6px}
.by{font-size:.8rem;color:var(--faint);margin-top:-6px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0}dt{color:var(--faint)}dd{margin:0}
.open{display:inline-block;background:var(--brick);color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border:2px solid #7a3220;box-shadow:3px 3px 0 rgba(0,0,0,.4);margin:4px 0 18px}
.open:hover{filter:brightness(1.1)}
ul{padding-left:20px;margin:0}li{margin:4px 0}a{color:var(--text)}
h2{font-size:1.1rem;margin:0 0 10px;color:var(--leaf)}
.near a{text-decoration:none}.near a:hover{text-decoration:underline}.near small{color:var(--faint)}
footer{color:var(--faint);font-size:.85rem;margin-top:24px}footer a{color:var(--text)}
.index h2{margin-top:24px}.index ul{columns:2;column-gap:24px;list-style:none;padding:0}.index li{break-inside:avoid}
@media(max-width:520px){.index ul{columns:1}}`;
const head = (title, desc, canon, img, extra = '') => `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}">
<meta name="author" content="Mirek Kubásek">
<link rel="canonical" href="${canon}">
<meta property="og:type" content="article">
<meta property="og:locale" content="cs_CZ">
<meta property="og:site_name" content="Brno 2000">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:url" content="${canon}">
<meta property="og:image" content="${attr(img)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico?v=${ICON_V}" sizes="32x32">
<link rel="icon" href="/favicon.svg?v=${ICON_V}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${ICON_V}">
<link rel="mask-icon" href="/safari-pinned-tab.svg?v=${ICON_V}" color="#c9583b">
<link rel="manifest" href="/manifest.webmanifest?v=${ICON_V}">
<meta name="theme-color" content="#1b2333">
<meta name="application-name" content="Brno 2000">
<meta name="apple-mobile-web-app-title" content="Brno 2000">
<link rel="stylesheet" href="/misto/misto.css">
${STATS_TAG}${extra}</head>
<body>
<main>
<nav class="top"><a href="/">‹ Brno 2000 · mapa Brna</a><a href="/misto/">Všechna místa</a></nav>
`;
const foot = `<footer>Mapu <a href="/o-mape/">Brno 2000</a> vytvořil Mirek Kubásek.</footer>
</main>
</body>
</html>
`;
const shorten = (s, n) => (s.length <= n ? s : s.slice(0, n).replace(/\s\S*$/, '') + '…');

const picFile = src => { const m = /\/img\/([\w-]+)\/([\w-]+\.webp)$/.exec(src || ''); return m ? path.join(ROOT, 'cdn/img', m[1], m[2]) : ''; };
await Promise.all(list.filter(p => p.img).map(async p => {
  const f = picFile(p.img.src);
  if (f && fs.existsSync(f)) try { const m = await sharp(f).metadata(); p.img.w = m.width; p.img.h = m.height; } catch { /* no size: the page still works */ }
}));
const LASTMOD = path.join(ROOT, 'tools/data/placepages-lastmod.json');
const lastmodOld = (() => { try { return JSON.parse(fs.readFileSync(LASTMOD, 'utf8')); } catch { return {}; } })();
const lastmodNew = {};
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
function changed(key, html) {
  const h = crypto.createHash('sha1').update(html.replace(/, linky podle jízdního řádu IDS JMK od [^·<]*/g, '').replaceAll(`?v=${ICON_V}`, '')).digest('hex').slice(0, 12);
  const o = lastmodOld[key];
  lastmodNew[key] = o && o[0] === h ? o : [h, today];
  return lastmodNew[key][1];
}

fs.mkdirSync(path.join(OUT, 'misto'), { recursive: true });
// the pages of an earlier run that are no longer places (joined into another page, renamed) go: their addresses are
// redirected, and a page left in the folder would be served instead of the redirect
{ const keep = new Set(list.map(p => p.slug)); for (const d of fs.readdirSync(path.join(OUT, 'misto'), { withFileTypes: true })) if (d.isDirectory() && !keep.has(d.name)) fs.rmSync(path.join(OUT, 'misto', d.name), { recursive: true, force: true }); }
fs.writeFileSync(path.join(OUT, 'misto/misto.css'), CSS);
const urls = []; // [address, lastmod]
for (const p of list) {
  const canon = `${SITE}misto/${p.slug}/`;
  const title = `${p.name} · Brno 2000, mapa Brna`;
  // (a text shorter than a line, "Denně 9.00 – 19.00 Cena: zdarma", is followed by where the place is)
  const first = p.texts[0].t.replace(/\s+/g, ' ');
  const desc = shorten(first.length < 100 && p.where ? `${first.replace(/[.\s]*$/, '.')} ${p.where[0]}` : first, 158);
  const img = p.img ? p.img.src : `${SITE}og.png`;
  const ld = { '@context': 'https://schema.org', '@type': 'Place', name: p.name, description: desc, url: canon };
  if (p.lon != null) ld.geo = { '@type': 'GeoCoordinates', latitude: +p.lat.toFixed(5), longitude: +p.lon.toFixed(5), ...(p.elev != null ? { elevation: Math.round(p.elev) } : {}) };
  if (p.district) ld.containedInPlace = { '@type': 'AdministrativeArea', name: p.district, containedInPlace: { '@type': 'City', name: 'Brno' } };
  if (p.img) ld.image = p.img.src;
  const addr = p.facts.find(f => f[0] === 'Adresa'); if (addr) ld.address = { '@type': 'PostalAddress', streetAddress: addr[1], addressLocality: 'Brno', addressCountry: 'CZ' };
  if (p.sameAs.length) ld.sameAs = p.sameAs;
  const paras = p.texts.map(x => `${x.t.split(/\n+/).map(t => `<p>${esc(t)}</p>`).join('')}<p class="by">Text: ${esc(x.by)}</p>`).join('');
  // the way to the page (Google shows it in place of the address): the map, the list of the places, the place
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['Brno 2000', SITE], ['Místa v Brně', `${SITE}misto/`], [p.name, canon]].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) };
  // a city-wide programme without a place ("Odpadové hospodářství") has only the city's own text: kept for the
  // visitors, out of the search results and the sitemap
  const noindex = p.lon == null;
  const extra = (noindex ? '<meta name="robots" content="noindex, follow">\n' : '') +
    (p.img && p.img.w ? `<meta property="og:image:width" content="${p.img.w}">\n<meta property="og:image:height" content="${p.img.h}">\n` : '') +
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n<script type="application/ld+json">${JSON.stringify(crumbs)}</script>\n`;
  const html = head(title, desc, canon, img, extra) +
    `<h1>${esc(p.name)}</h1>
<p class="kind">${esc(p.kind || 'Místo v Brně')}${p.lon != null ? ` · <a href="https://www.openstreetmap.org/?mlat=${p.lat.toFixed(5)}&amp;mlon=${p.lon.toFixed(5)}#map=17/${p.lat.toFixed(5)}/${p.lon.toFixed(5)}" rel="noopener">${p.lat.toFixed(4)} N, ${p.lon.toFixed(4)} E</a>` : ''}</p>
<a class="open" href="/#misto/${p.slug}">Otevřít na živé mapě Brna</a>
${p.img ? `<figure><img src="${attr(p.img.src)}" alt="${attr(p.img.alt)}"${p.img.w ? ` width="${p.img.w}" height="${p.img.h}"` : ''} fetchpriority="high"><figcaption>Foto: ${isUrl(p.img.url) ? `<a href="${attr(p.img.url)}" rel="noopener">${esc(p.img.by)}</a>` : esc(p.img.by)}</figcaption></figure>` : ''}
<div class="card">${paras}</div>
${p.facts.length ? `<div class="card"><dl>${p.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${String(v).trim().split(/\s*\n\s*/).map(esc).join('<br>')}</dd>`).join('')}</dl></div>` : ''}
${p.where && p.where.length ? `<div class="card"><h2>Poloha a okolí</h2>${p.where.map(s => `<p>${esc(s)}</p>`).join('')}<p class="by">Z dat mapy Brno 2000${mhdFrom && stops.length ? `, linky podle jízdního řádu IDS JMK od ${mhdFrom % 100}. ${Math.floor(mhdFrom / 100) % 100}. ${Math.floor(mhdFrom / 10000)}` : ''} · <a href="/data">odkud data jsou</a></p></div>` : ''}
${p.links.length ? `<div class="card"><h2>Odkazy</h2><ul>${p.links.map(l => `<li><a href="${attr(l.u)}" rel="noopener">${esc(l.t)}</a></li>`).join('')}</ul></div>` : ''}
${p.near.length ? `<div class="card near"><h2>Další místa v okolí</h2><ul>${p.near.map(({ q, d }) => `<li><a href="/misto/${q.slug}/">${esc(q.name)}</a> <small>${km(d)}</small></li>`).join('')}</ul></div>` : ''}
` + foot;
  fs.mkdirSync(path.join(OUT, 'misto', p.slug), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'misto', p.slug, 'index.html'), html);
  const mod = changed(p.slug, html);
  if (!noindex) urls.push([canon, mod]);
}

const bySlug = new Set(list.map(p => p.slug));
const moves = [...renamed].filter(([from, to]) => !bySlug.has(from) && bySlug.has(to));
if (moves.length) {
  const rf = path.join(OUT, '_redirects');
  const keep = fs.existsSync(rf) ? fs.readFileSync(rf, 'utf8').split('\n').filter(l => l && !/^\/misto\//.test(l)) : [];
  fs.writeFileSync(rf, [...keep, ...moves.flatMap(([from, to]) => [`/misto/${from}/ /misto/${to}/ 301`, `/misto/${from} /misto/${to}/ 301`]), ''].join('\n'));
}

// the list of all the places
const groups = [
  ['Místa a příběhy', p => p.texts.some(t => t.by === 'Brno 2000')],
  ['Památky a zajímavosti', p => p.sameAs.length],
  ['Tipy Go to Brno', p => p.texts.some(t => /Go to Brno/.test(t.by))],
  ['Stavby a projekty města', () => true],
];
const used = new Set();
const sections = groups.map(([h, test]) => {
  const items = list.filter(p => !used.has(p) && test(p)).sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  for (const p of items) used.add(p);
  return items.length ? `<h2>${h} (${items.length})</h2><ul>${items.map(p => `<li><a href="/misto/${p.slug}/">${esc(p.name)}</a></li>`).join('')}</ul>` : '';
}).join('');
const idxDesc = `Všechna místa na živé izometrické mapě Brna: ${list.length} památek, zajímavostí, tipů na výlet a staveb, každé s popisem a odkazem na mapu.`;
const idxHtml = head('Místa v Brně · Brno 2000', idxDesc, `${SITE}misto/`, `${SITE}og.png`) +
  `<div class="index"><h1>Místa v Brně</h1><p class="kind">${esc(idxDesc)}</p>${sections}</div>\n` + foot;
fs.writeFileSync(path.join(OUT, 'misto/index.html'), idxHtml);
urls.unshift([`${SITE}misto/`, changed('', idxHtml)]);
fs.writeFileSync(LASTMOD, `${JSON.stringify(Object.fromEntries(Object.entries(lastmodNew).sort(([a], [b]) => a.localeCompare(b))), null, 0).replace(/\],"/g, '],\n"')}\n`);

// the sitemap
const sm = path.join(OUT, 'sitemap.xml');
if (fs.existsSync(sm)) {
  const old = fs.readFileSync(sm, 'utf8').replace(/ {2}<url><loc>[^<]*\/misto\/[^<]*<\/loc>[^\n]*\n/g, '');
  const add = urls.map(([u, mod]) => `  <url><loc>${u}</loc><lastmod>${mod}</lastmod><priority>${u.endsWith('misto/') ? '0.7' : '0.5'}</priority></url>`).join('\n');
  fs.writeFileSync(sm, old.replace('</urlset>', `${add}\n</urlset>`));
}
const fresh = Object.values(lastmodNew).filter(([, d]) => d === today).length;
console.log(`placepages: ${list.length} places (${placed.length} with a position, ${list.filter(p => p.img).length} with a picture${moves.length ? `, ${moves.length} old addresses redirected` : ''}${joined.length ? `, ${joined.length} joined into another place's page` : ''}; ${fresh} pages changed today) -> ${path.relative(ROOT, OUT)}/misto/`);

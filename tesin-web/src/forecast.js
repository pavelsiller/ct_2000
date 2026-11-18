import { fetchData, watchFeed, RELOAD, relayOr } from './feed.js';
const LL = 'latitude=49.195&longitude=16.608&timezone=Europe%2FPrague';
const FORECAST = `https://api.open-meteo.com/v1/forecast?${LL}&wind_speed_unit=ms&forecast_days=16`
  + '&hourly=temperature_2m,precipitation,precipitation_probability,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code,is_day,snowfall,visibility'
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset';
const ENSEMBLE = `https://ensemble-api.open-meteo.com/v1/ensemble?${LL}&models=ecmwf_ifs025&forecast_days=16&daily=temperature_2m_max,temperature_2m_min,precipitation_sum`;
const SEASONAL = `https://seasonal-api.open-meteo.com/v1/seasonal?${LL}&forecast_days=183&daily=temperature_2m_mean,precipitation_sum`;
import { ICON, SKY, kindOf } from './sky.js';
export { ICON, SKY, kindOf };
const AIRQ = `https://air-quality-api.open-meteo.com/v1/air-quality?${LL}&forecast_days=3&hourly=birch_pollen,grass_pollen,ragweed_pollen,uv_index`;

const DIRS = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
const pct = (arr, q) => { const a = arr.filter(x => x != null).sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * q, lo = Math.floor(i); return a[lo] + (a[Math.min(a.length - 1, lo + 1)] - a[lo]) * (i - lo); };
const members = (daily, name) => Object.keys(daily).filter(k => k === name || k.startsWith(`${name}_member`));

export function createForecast({ base, el, onPreview, onNow }) {
  let fc = null, ens = null, sea = null, aq = null, off = null, loadedAt = 0;
  const loadOff = (init) => fetchData(`${base}data/weather.json`, init).then(r => (r.ok ? r.json() : null)).then(d => (off = d || off)).catch(() => null);
  watchFeed('weather.json', () => loadOff(RELOAD)); // a new warning reaches a page left open (src/feed.js)
  const j = u => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const H = 3600e3, R = (key, maxAge, u) => relayOr('forecast.json', key, maxAge, () => j(u)).catch(() => null);
  async function load() {
    if (Date.now() - loadedAt < 15 * 60e3 && fc) return;
    loadedAt = Date.now();
    [fc, ens, sea, aq] = await Promise.all([R('fc', 3 * H, FORECAST), R('ens', 8 * H, ENSEMBLE), R('sea', 36 * H, SEASONAL), R('aq', 6 * H, AIRQ), off ? null : loadOff()]);
  }
  // only the hours and the UV, for "Co si vzít s sebou" of a journey (src/vzit.js): the ensemble and the seasonal
  // outlook stay for the panel
  let nearAt = 0;
  async function outlook() {
    if (!(fc && Date.now() - Math.max(loadedAt, nearAt) < 15 * 60e3)) {
      nearAt = Date.now();
      const [f, a] = await Promise.all([R('fc', 3 * H, FORECAST), R('aq', 6 * H, AIRQ), off ? null : loadOff()]);
      fc = f || fc; aq = a || aq;
    }
    return { fc, aq, alerts: alerts() };
  }
  const hhmm = t => t.slice(11, 16);
  const dayName = t => new Date(t.slice(0, 10) + 'T12:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
  const num = (x, d = 0) => (x == null ? '–' : x.toFixed(d).replace('.', ','));

  // ---- hours of today and tomorrow
  function hoursBox() {
    const box = el('div', 'fc-sec');
    box.append(el('h3', '', 'Dnes a zítra po hodinách'));
    if (!fc) { box.append(el('p', 'livenote', 'Předpověď se nenačetla.')); return box; }
    const H = fc.hourly, D = fc.daily;
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
    const startIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00`;
    const i0 = Math.max(0, H.time.indexOf(startIso));
    const end = H.time.findIndex(t => t.slice(0, 10) > (D.time[1] || ''));
    const idx = []; for (let i = i0; i < (end < 0 ? Math.min(H.time.length, i0 + 48) : end); i++) idx.push(i);
    const sun = [0, 1].map(d => D.sunrise[d] ? `${dayName(D.time[d])}: východ ${hhmm(D.sunrise[d])}, západ ${hhmm(D.sunset[d])}` : '').filter(Boolean);
    box.append(el('p', 'livenote', `☀ ${sun.join(' · ')}`));
    // chart: temperature line, precipitation bars, probability as light bars
    const NS = 'http://www.w3.org/2000/svg', W = Math.max(600, idx.length * 26), Hh = 120;
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.setAttribute('class', 'fc-chart'); svg.style.width = `${W}px`;
    const temps = idx.map(i => H.temperature_2m[i]), tmin = Math.min(...temps) - 1, tmax = Math.max(...temps) + 1;
    const X = k => 13 + k * 26, Y = t => 12 + (1 - (t - tmin) / (tmax - tmin || 1)) * 60;
    const mk = (tag, a) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.append(e); return e; };
    idx.forEach((i, k) => {
      const pp = H.precipitation_probability[i] || 0, pr = H.precipitation[i] || 0;
      mk('rect', { x: X(k) - 10, y: Hh - 4 - pp * 0.3, width: 20, height: pp * 0.3, fill: 'rgba(95,179,230,.25)' });
      if (pr > 0) mk('rect', { x: X(k) - 6, y: Hh - 4 - Math.min(30, pr * 10), width: 12, height: Math.min(30, pr * 10), fill: '#5fb3e6' });
      if (H.time[i].endsWith('T00:00') && k) mk('line', { x1: X(k) - 13, x2: X(k) - 13, y1: 0, y2: Hh, stroke: '#3a4560', 'stroke-dasharray': '3 3' });
    });
    mk('path', { d: idx.map((i, k) => `${k ? 'L' : 'M'}${X(k)},${Y(H.temperature_2m[i]).toFixed(1)}`).join(''), fill: 'none', stroke: '#f3c868', 'stroke-width': 2 });
    idx.forEach((i, k) => { if (k % 3 === 0) { const t = mk('text', { x: X(k), y: Y(H.temperature_2m[i]) - 5, 'text-anchor': 'middle', class: 'ax' }); t.textContent = `${Math.round(H.temperature_2m[i])}°`; } });
    // hour cells (click: show that hour on the map)
    const strip = el('div', 'fc-hours');
    const scroller = el('div', 'fc-scroll');
    const cells = el('div', 'fc-cells');
    cells.style.width = `${W}px`;
    idx.forEach(i => {
      const b = el('button', 'fc-hour'); b.type = 'button';
      b.title = `${dayName(H.time[i])} ${hhmm(H.time[i])}: ${SKY(H.weather_code[i])}, ${num(H.temperature_2m[i], 1)} °C, srážky ${num(H.precipitation[i], 1)} mm (${H.precipitation_probability[i] ?? '–'} %), oblačnost ${H.cloud_cover[i]} %, vítr ${num(H.wind_speed_10m[i])} m/s od ${DIRS[Math.round(H.wind_direction_10m[i] / 45) % 8]}. Kliknutím ukážete tuto hodinu na mapě.`;
      // a time label only every 3 hours, so the labels don't overlap
      b.append(el('span', 'h', +H.time[i].slice(11, 13) % 3 === 0 ? hhmm(H.time[i]) : ''), el('span', 'i', ICON(H.weather_code[i], H.is_day[i])), el('span', 't', `${Math.round(H.temperature_2m[i])}°`), el('span', 'p', `${H.precipitation_probability[i] ?? '–'}%`), el('span', 'w', `${Math.round(H.wind_speed_10m[i])} m/s`));
      b.onclick = () => preview(i);
      cells.append(b);
    });
    scroller.append(svg, cells);
    strip.append(scroller);
    box.append(strip);
    box.append(el('p', 'livenote', 'Žlutá čára: teplota · modré sloupce: srážky (mm) · světlé: pravděpodobnost srážek. Klikněte na hodinu a mapa ukáže mraky, déšť nebo sníh a denní dobu pro ten čas.'));
    return box;
  }

  // ---- a forecast hour chosen in the hours above: the map shows it (the pill above the map leads back to now)
  function preview(i) {
    const H = fc.hourly, D = fc.daily;
    const day = D.time.indexOf(H.time[i].slice(0, 10));
    const t = H.time[i];
    const sr = day >= 0 ? D.sunrise[day] : null, ss = day >= 0 ? D.sunset[day] : null;
    const h = +t.slice(11, 13) + 0.5;
    const hr = sr ? +sr.slice(11, 13) + +sr.slice(14, 16) / 60 : 7, hs = ss ? +ss.slice(11, 13) + +ss.slice(14, 16) / 60 : 17;
    // 0 day, 50 golden hour, 100 night (an hour around sunrise and sunset)
    let night;
    if (h >= hr + 1 && h <= hs - 1) night = 0; else if (h > hs - 1 && h < hs + 1) night = 50 + (h - hs) * 50; else if (h > hr - 1 && h < hr + 1) night = 50 - (h - hr) * 50; else night = 100;
    onPreview({
      cloud: (H.cloud_cover[i] ?? 50) / 100, precip: H.precipitation[i] || 0, wind: H.wind_speed_10m[i] * 3.6 || 0,
      kind: kindOf(H.weather_code[i], H.snowfall[i], H.precipitation[i], H.visibility[i]), night: Math.max(0, Math.min(100, Math.round(night))),
      label: `${dayName(t)} ${hhmm(t)} – ${SKY(H.weather_code[i])}, ${num(H.temperature_2m[i], 1)} °C`,
    });
  }

  // ---- 16 days with the ensemble spread
  function daysBox() {
    const box = el('div', 'fc-sec');
    box.append(el('h3', '', 'Dalších 16 dní'));
    if (!fc) return box;
    // daily lowest / highest temperature from the same hourly data as the hourly chart (Prague days),
    // so the two parts of the panel always agree; the API's daily values only where hours are missing
    const D = { ...fc.daily, temperature_2m_min: fc.daily.temperature_2m_min.slice(), temperature_2m_max: fc.daily.temperature_2m_max.slice() };
    D.time.forEach((day, d) => {
      const hs = fc.hourly.time.map((t, i) => (t.startsWith(day) ? fc.hourly.temperature_2m[i] : null)).filter(x => x != null);
      if (hs.length >= 20) { D.temperature_2m_min[d] = Math.min(...hs); D.temperature_2m_max[d] = Math.max(...hs); }
    });
    let E = null;
    if (ens && ens.daily) {
      const mx = members(ens.daily, 'temperature_2m_max'), mn = members(ens.daily, 'temperature_2m_min'), pr = members(ens.daily, 'precipitation_sum');
      E = ens.daily.time.map((t, d) => ({ t, max: [pct(mx.map(k => ens.daily[k][d]), 0.1), pct(mx.map(k => ens.daily[k][d]), 0.9)], min: [pct(mn.map(k => ens.daily[k][d]), 0.1), pct(mn.map(k => ens.daily[k][d]), 0.9)], rain: pr.map(k => ens.daily[k][d]).filter(x => x != null && x >= 1).length / Math.max(1, pr.length) }));
    }
    const all = D.time.map((t, d) => [D.temperature_2m_min[d], D.temperature_2m_max[d], ...(E && E[d] ? [E[d].min[0], E[d].max[1]] : [])]).flat().filter(x => x != null);
    const lo = Math.floor(Math.min(...all)) - 1, hi = Math.ceil(Math.max(...all)) + 1;
    const P = x => `${((x - lo) / (hi - lo)) * 100}%`;
    const tb = el('table', 'fc-days');
    D.time.forEach((t, d) => {
      const tr = el('tr');
      const e = E && E.find(x => x.t === t);
      const bar = el('td', 'fc-bar');
      const track = el('div', 'track');
      // spread of the ensemble (10–90 %), shown from day 4 on, where it matters
      if (e && d >= 3 && e.min[0] != null && e.max[1] != null) { const s = el('div', 'spread'); s.style.left = P(e.min[0]); s.style.width = `calc(${P(e.max[1])} - ${P(e.min[0])})`; s.title = `Nejistota (90 % členů ensemblu ECMWF): ráno ${num(e.min[0])} až ${num(e.min[1])} °C, odpoledne ${num(e.max[0])} až ${num(e.max[1])} °C`; track.append(s); }
      const r = el('div', 'range'); r.style.left = P(D.temperature_2m_min[d]); r.style.width = `calc(${P(D.temperature_2m_max[d])} - ${P(D.temperature_2m_min[d])})`; track.append(r);
      bar.append(track);
      tr.append(el('td', 'd', dayName(t)), el('td', 'i', ICON(D.weather_code[d])), el('td', 'num lo', `${num(D.temperature_2m_min[d])}°`), bar, el('td', 'num hi', `${num(D.temperature_2m_max[d])}°`),
        el('td', 'num p', D.precipitation_sum[d] > 0 ? `${num(D.precipitation_sum[d], 1)} mm` : ''), el('td', 'num pp', e && d >= 3 ? `déšť ${Math.round(e.rain * 100)} %` : D.precipitation_probability_max[d] != null ? `${D.precipitation_probability_max[d]} %` : ''));
      tr.title = `${SKY(D.weather_code[d])}`;
      tb.append(tr);
    });
    box.append(tb);
    box.append(el('p', 'livenote', 'Tmavší pruh: rozpětí teplot dne. Světlý pruh od 4. dne: nejistota podle 50 variant modelu ECMWF (10–90 %); u vzdálených dnů je proto předpověď jen orientační. „Déšť %“ = podíl variant s alespoň 1 mm srážek.'));
    return box;
  }

  // ---- 6 months: warmer / colder / drier / wetter than usual (normal 1991–2020)
  function seasonBox() {
    const box = el('div', 'fc-sec');
    box.append(el('h3', '', 'Dlouhodobý výhled na 6 měsíců'));
    if (!sea || !sea.daily || !off || !off.normals) { box.append(el('p', 'livenote', 'Výhled se teď nenačetl.')); return box; }
    const tk = members(sea.daily, 'temperature_2m_mean'), pk = members(sea.daily, 'precipitation_sum');
    const months = new Map();
    sea.daily.time.forEach((t, d) => {
      const key = t.slice(0, 7);
      if (!months.has(key)) months.set(key, { T: [], P: [] });
      const m = months.get(key);
      const tv = tk.map(k => sea.daily[k][d]).filter(x => x != null), pv = pk.map(k => sea.daily[k][d]).filter(x => x != null);
      if (tv.length) m.T.push(tv.reduce((a, b) => a + b, 0) / tv.length);
      if (pv.length) m.P.push(pv.reduce((a, b) => a + b, 0) / pv.length);
    });
    const tb = el('table', 'fc-season');
    tb.append(Object.assign(el('tr'), { innerHTML: '<th>Měsíc</th><th>Teplota</th><th>Srážky</th>' }));
    let n = 0;
    for (const [key, m] of months) {
      if (m.T.length < 20 || n >= 6) continue; // only (nearly) whole months
      n++;
      const [nt, np] = off.normals.month[+key.slice(5) - 1];
      const dT = m.T.reduce((a, b) => a + b, 0) / m.T.length - nt;
      const rP = (m.P.reduce((a, b) => a + b, 0) / m.P.length) / (np || 1);
      const tTxt = dT > 1 ? 'tepleji než obvykle' : dT < -1 ? 'chladněji než obvykle' : 'teplota kolem normálu';
      const pTxt = rP > 1.25 ? 'vlhčeji než obvykle' : rP < 0.75 ? 'sušeji než obvykle' : 'srážky kolem normálu';
      const tr = el('tr');
      const name = new Date(key + '-15T12:00:00').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
      tr.append(el('td', '', name), el('td', dT > 1 ? 'warm' : dT < -1 ? 'cold' : '', tTxt), el('td', rP > 1.25 ? 'wet' : rP < 0.75 ? 'dry' : '', pTxt));
      tb.append(tr);
    }
    box.append(tb);
    box.append(el('p', 'livenote', `Orientační výhled podle sezónního modelu ECMWF (Open-Meteo), srovnaný s normálem ${off.normals.period} pro Brno. Neukazuje počasí konkrétních dnů, jen zda bude měsíc v průměru tepleji, chladněji, sušeji nebo vlhčeji než obvykle.`));
    return box;
  }

  // ---- pollen and UV for 3 days
  function pollenBox() {
    const box = el('div', 'fc-sec');
    box.append(el('h3', '', 'Pyl a UV na 3 dny'));
    if (!aq || !aq.hourly) { box.append(el('p', 'livenote', 'Data o pylu se nenačetla.')); return box; }
    const H = aq.hourly;
    const days = [...new Set(H.time.map(t => t.slice(0, 10)))].slice(0, 3);
    const lvl = v => (v == null ? ['–', ''] : v < 1 ? ['žádný', 'l0'] : v < 10 ? ['nízký', 'l1'] : v < 50 ? ['střední', 'l2'] : ['vysoký', 'l3']);
    const uvl = v => (v == null ? ['–', ''] : v < 3 ? [`${num(v, 1)} nízký`, 'l1'] : v < 6 ? [`${num(v, 1)} střední`, 'l2'] : v < 8 ? [`${num(v, 1)} vysoký`, 'l3'] : [`${num(v, 1)} velmi vysoký`, 'l3']);
    const tb = el('table', 'fc-pollen');
    tb.append(Object.assign(el('tr'), { innerHTML: `<th></th>${days.map(d => `<th>${dayName(d)}</th>`).join('')}` }));
    const max = (key, d) => { const v = H.time.map((t, i) => (t.startsWith(d) ? H[key][i] : null)).filter(x => x != null); return v.length ? Math.max(...v) : null; };
    for (const [key, name, f] of [['birch_pollen', 'Bříza', lvl], ['grass_pollen', 'Trávy', lvl], ['ragweed_pollen', 'Ambrozie', lvl], ['uv_index', 'UV index', uvl]]) {
      const tr = el('tr'); tr.append(el('td', '', name));
      for (const d of days) { const [txt, cls] = f(max(key, d)); tr.append(el('td', `lv ${cls}`, txt)); }
      tb.append(tr);
    }
    box.append(tb, el('p', 'livenote', 'Nejvyšší hodnota dne. Pyl: zrna na m³ podle modelu CAMS (nízký < 10, střední < 50, vysoký ≥ 50). Mimo sezónu květu je pyl nulový.'));
    return box;
  }

  // ---- ČHMÚ text and warnings
  function chmiBox() {
    const box = el('div', 'fc-sec');
    box.append(el('h3', '', 'Oficiální předpověď ČHMÚ'));
    if (!off) { box.append(el('p', 'livenote', 'Předpověď ČHMÚ není k dispozici.')); return box; }
    for (const a of alerts()) box.append(alertEl(a));
    for (const f of off.forecast || []) {
      const d = el('details', 'fc-chmi'); if (f.label === 'Dnes' || f.label === 'Zítra') d.open = true;
      d.append(el('summary', '', `${f.label} – ${f.headline} ${f.place}`));
      for (const [h, t] of f.items) { const p = el('p'); if (h) p.append(el('b', '', `${h} `)); p.append(t); d.append(p); }
      d.append(el('p', 'livenote', `Vydal ČHMÚ ${new Date(f.sent).toLocaleString('cs-CZ')}${f.author ? `, ${f.author}` : ''}.`));
      box.append(d);
    }
    box.append(el('p', 'livenote', `Zdroj: otevřená data ČHMÚ, ${new Date(off.fetched).toLocaleString('cs-CZ')}.`));
    return box;
  }
  const alerts = () => (off && off.alerts ? off.alerts.filter(a => !a.expires || Date.parse(a.expires) > Date.now()) : []);
  function alertEl(a) {
    const d = el('div', `fc-alert sev-${(a.severity || '').toLowerCase()}`);
    const fmt = t => (t ? new Date(t).toLocaleString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
    d.append(el('b', '', `⚠ ${a.event}`), el('span', '', ` ${fmt(a.onset)}${a.expires ? ` – ${fmt(a.expires)}` : ''}`));
    if (a.description) d.append(el('p', '', a.description));
    if (a.instruction) d.append(el('p', 'livenote', a.instruction));
    return d;
  }

  // ---- the short overview: now, the next hours, 5 days and warnings (the rest in the full forecast)
  async function renderShort(root, onMore) {
    root.replaceChildren(el('p', 'livenote', 'Načítám předpověď…'));
    await load();
    const parts = [];
    for (const a of alerts()) { const d = el('button', `fc-alert short sev-${(a.severity || '').toLowerCase()}`, `⚠ ${a.event}`); d.type = 'button'; d.title = 'Podrobnosti výstrahy'; d.onclick = onMore; parts.push(d); }
    if (!fc) { parts.push(el('p', 'livenote', 'Předpověď se nenačetla.')); root.replaceChildren(...parts); return; }
    const H = fc.hourly, D = fc.daily;
    const nowP = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
    const iso = `${nowP.getFullYear()}-${String(nowP.getMonth() + 1).padStart(2, '0')}-${String(nowP.getDate()).padStart(2, '0')}T${String(nowP.getHours()).padStart(2, '0')}:00`;
    const i0 = Math.max(0, H.time.indexOf(iso));
    // now
    const now = el('div', 'fcs-now');
    now.append(el('span', 'i', ICON(H.weather_code[i0], H.is_day[i0])), el('span', 't', `${Math.round(H.temperature_2m[i0])} °C`));
    const d0 = D.time.indexOf(H.time[i0].slice(0, 10));
    const txt = el('span', 'x');
    txt.append(el('b', '', SKY(H.weather_code[i0])), el('small', '', `vítr ${Math.round(H.wind_speed_10m[i0])} m/s · srážky ${H.precipitation_probability[i0] ?? '–'} %`));
    if (d0 >= 0) txt.append(el('small', '', `dnes ${num(D.temperature_2m_min[d0])} až ${num(D.temperature_2m_max[d0])} °C`));
    now.append(txt);
    parts.push(now);
    // the next hours: every 3 hours (click: that hour on the map)
    const hrs = el('div', 'fcs-hours');
    for (let k = 1; k <= 6; k++) {
      const i = i0 + k * 3;
      if (i >= H.time.length) break;
      const b = el('button', 'fcs-h'); b.type = 'button';
      b.title = `${dayName(H.time[i])} ${hhmm(H.time[i])}: ${SKY(H.weather_code[i])}. Kliknutím ukážete tuto hodinu na mapě.`;
      b.append(el('span', 'h', hhmm(H.time[i])), el('span', 'i', ICON(H.weather_code[i], H.is_day[i])), el('span', 't', `${Math.round(H.temperature_2m[i])}°`), el('span', 'p', `${H.precipitation_probability[i] ?? 0} %`));
      b.onclick = () => preview(i);
      hrs.append(b);
    }
    parts.push(hrs);
    // 5 days
    const tb = el('table', 'fcs-days');
    for (let d = Math.max(0, d0); d < Math.min(D.time.length, Math.max(0, d0) + 5); d++) {
      const hs = H.time.map((t, i) => (t.startsWith(D.time[d]) ? H.temperature_2m[i] : null)).filter(x => x != null);
      const lo = hs.length >= 20 ? Math.min(...hs) : D.temperature_2m_min[d], hi = hs.length >= 20 ? Math.max(...hs) : D.temperature_2m_max[d];
      const tr = el('tr'); tr.title = SKY(D.weather_code[d]);
      tr.append(el('td', 'd', d === d0 ? 'Dnes' : dayName(D.time[d])), el('td', 'i', ICON(D.weather_code[d])), el('td', 'num', `${num(lo)}° / ${num(hi)}°`), el('td', 'num p', D.precipitation_sum[d] > 0.1 ? `${num(D.precipitation_sum[d], 1)} mm` : ''));
      tb.append(tr);
    }
    parts.push(tb);
    const more = el('button', 'pbtn fcs-more', 'Podrobná předpověď ›'); more.type = 'button'; more.onclick = onMore;
    parts.push(more, el('p', 'livenote', '16 dní, grafy po hodinách, pyl a UV, výhled na půl roku a text ČHMÚ. Zdroj: Open-Meteo (CC BY 4.0), ČHMÚ.'));
    root.replaceChildren(...parts);
  }

  async function render(root) {
    root.replaceChildren(el('p', 'livenote', 'Načítám předpověď…'));
    await load();
    const parts = [];
    for (const a of alerts()) parts.push(alertEl(a));
    parts.push(hoursBox(), daysBox(), pollenBox(), seasonBox(), chmiBox());
    const cr = el('p', 'muted', 'Předpověď, ensemble, sezónní výhled, pyl a UV: Open-Meteo (CC BY 4.0, zdarma pro nekomerční použití), modely ECMWF, DWD ICON a CAMS. Text a výstrahy: ČHMÚ.');
    parts.push(cr);
    root.replaceChildren(...parts);
  }
  return { render, renderShort, loadOff, alerts, outlook, official: () => off };
}

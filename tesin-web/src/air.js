import { fetchData, watchFeed, RELOAD, relayOr } from './feed.js';
import { itemInMap } from './extent.js';
import { onScreen, imgPoints } from './onscreen.js';
const EEA = 'https://dis2datalake.blob.core.windows.net/airquality-derivated/AQI-noRunningMeans/current/';
export const POLL = {
  'PM10': { n: 'PM10', long: 'prachové částice PM10', th: [15, 45, 120, 195, 270], what: 'Prach menší než 10 mikrometrů. Hlavně z dopravy (otěr pneumatik a brzd, zvířený prach), z topení v domácnostech a ze staveb. Dráždí dýchací cesty.' },
  'PM2.5': { n: 'PM2,5', long: 'jemné prachové částice PM2,5', th: [5, 15, 50, 90, 140], what: 'Nejjemnější prach, který se dostane hluboko do plic i do krve. Hlavně z lokálních topenišť (dřevo, uhlí) a z výfuků. Nejškodlivější složka smogu, hlavně v zimě při inverzi.' },
  'NO2': { n: 'NO₂', long: 'oxid dusičitý', th: [10, 25, 60, 100, 150], what: 'Plyn hlavně z výfuků aut (nejvíc dieselových), nejvyšší u rušných ulic ve špičce. Dráždí průdušky, zhoršuje astma.' },
  'O3': { n: 'O₃', long: 'přízemní ozon', th: [60, 100, 120, 160, 180], what: 'Vzniká za slunečných letních dnů ze zplodin dopravy a průmyslu. Nejvyšší odpoledne a mimo centrum. Dráždí oči a plíce, hlavně při námaze venku.' },
  'SO2': { n: 'SO₂', long: 'oxid siřičitý', th: [20, 40, 125, 190, 275], what: 'Plyn ze spalování uhlí a dalších paliv se sírou. Dnes v Brně většinou nízký. Dráždí dýchací cesty.' },
};
// what to do at each level (after the European air quality index advice, simplified)
export const ADVICE = [null,
  'Ovzduší je v pořádku, venkovní aktivity bez omezení.',
  'Ovzduší je přijatelné. Velmi citliví lidé (astmatici) mohou omezit dlouhou námahu venku.',
  'Zhoršené ovzduší. Lidé s nemocemi srdce a plic, starší lidé a malé děti by měli omezit delší a namáhavý pohyb venku, zvlášť u rušných silnic. Zdraví lidé bez omezení.',
  'Špatné ovzduší. Citliví lidé by se měli vyhnout námaze venku, ostatní ji omezit. Větrejte krátce, netopte dřevem ani uhlím, nechte auto doma.',
  'Velmi špatné ovzduší. Omezte pobyt a námahu venku všichni; citliví lidé zůstaňte raději uvnitř. Řiďte se pokyny lékaře a informacemi ČHMÚ o smogové situaci.',
  'Mimořádně špatné ovzduší. Zůstaňte pokud možno uvnitř, nesportujte venku a sledujte varování ČHMÚ a města.',
];
// European air quality index levels (EEA)
export const LEVEL = [null,
  { n: 'dobrá', c: '#50f0e6' }, { n: 'přijatelná', c: '#50ccaa' }, { n: 'zhoršená', c: '#f0e641' },
  { n: 'špatná', c: '#ff5050' }, { n: 'velmi špatná', c: '#960032' }, { n: 'extrémně špatná', c: '#7d2181' }];
export const bandOf = (p, v) => { const t = POLL[p] && POLL[p].th; if (!t || v == null) return 0; let b = 1; while (b <= 5 && v >= t[b - 1]) b++; return b; };

export function createAir({ base, llToImg }) {
  const pts = imgPoints(llToImg); // (the image points of the items, kept between the frames)
  let stations = [], updated = '', loading = null, lastFetch = 0;
  const live = new Map(); // code -> { t, vals: {p: v}, band, culprit, series: {p: [[ms, v]]} }
  function load(init) {
    loading ||= fetchData(`${base}data/air.json`, init).then(r => r.json()).then(d => { stations = (d.stations || []).filter(itemInMap); updated = d.updated; }).catch(() => { stations = []; });
    return loading;
  }
  watchFeed('air.json', () => { loading = null; return load(RELOAD); }); // (the live values from the EEA stay)
  async function fetchLive() {
    lastFetch = Date.now();
    await load();
    const now = Date.now();
    await Promise.all(stations.filter(s => s.live).map(async s => {
      try {
        const d = await relayOr('air-live.json', s.eea, 2 * 3600e3, async () => { const r = await fetch(EEA + s.eea + '.json'); return r.ok ? r.json() : null; });
        if (!d) return;
        const series = {};
        let last = null;
        for (const k of Object.keys(d).sort()) {
          const t = Date.parse(k);
          if (t > now) break; // later hours are a forecast
          const e = d[k];
          let any = false;
          for (const p of Object.keys(POLL)) {
            const v = e[`val_${p}`];
            if (v == null || e[`modelled_${p}`]) continue;
            (series[p] ||= []).push([t, v]); any = true;
          }
          if (any) last = [t, e];
        }
        if (!last) return;
        const [t, e] = last;
        const vals = {};
        let band = 0, culprit = '';
        for (const p of Object.keys(POLL)) {
          const v = e[`val_${p}`];
          if (v == null || e[`modelled_${p}`]) continue;
          vals[p] = v;
          const b = Math.max(1, Math.min(6, Math.floor(e[`aqi_${p}`] || bandOf(p, v))));
          if (b > band) { band = b; culprit = p; }
        }
        if (now - t > 6 * 36e5) return; // older than 6 hours: not current
        live.set(s.c, { t, vals, band, culprit, series });
      } catch { /* station not available now */ }
    }));
  }
  // the newest values: live, or the last hour of the prepared history
  function state(s) {
    const l = live.get(s.c);
    if (l) return { ...l, live: true };
    if (!s.hour) return null;
    const t0 = Date.parse(s.hour.start + ':00:00Z');
    let best = null;
    for (const [p, arr] of Object.entries(s.hour.v)) for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) { const t = t0 + i * 36e5; if (!best || t > best) best = t; break; }
    if (!best) return null;
    const i = Math.round((best - t0) / 36e5);
    const vals = {};
    let band = 0, culprit = '';
    for (const [p, arr] of Object.entries(s.hour.v)) { const v = arr[i]; if (v == null) continue; vals[p] = v; const b = bandOf(p, v); if (b > band) { band = b; culprit = p; } }
    return { t: best, vals, band, culprit, live: false };
  }

  let hits = [], sel = null; // sel: the station whose card is open
  function draw(ctx, v, t) {
    hits = []; pts.begin();
    if (!stations.length) { load(); return; }
    if (Date.now() - lastFetch > 15 * 60e3) fetchLive();
    if (v.z < 0.08) return;
    for (const s of stations) {
      // stations without open data are shown too, with a grey light (the card explains why)
      const [X, Y] = pts.of(s, s.lon, s.lat);
      const x = v.ox + X * v.k, y = v.oy + Y * v.k;
      if (!onScreen(ctx, x, y, 300)) continue;
      const st = state(s);
      const band = st ? st.band : 0;
      // the whole city in view (v.z < 0.3, about 7 m per pixel and further): only the stations with worse air (zhoršená and
      // worse), with their tag; the others come closer in, or when the theme is highlighted (ctx.__hl, main.js)
      const far = v.z < 0.3 && !ctx.__hl;
      if (far && band < 3) continue;
      // worse air: a dark haze around the station (about 700 m), stronger and wider with the level
      if (band >= 3) {
        const R = (450 + 250 * (band - 2)) * v.k * 1; // metres -> screen px (1 image px = 1 m across)
        if (!Number.isFinite(R) || !Number.isFinite(x) || !Number.isFinite(y) || R <= 0) continue;
        const pulse = 1 + 0.04 * Math.sin(t / 700);
        const g = ctx.createRadialGradient(x, y, 0, x, y, R * pulse);
        const a = Math.min(0.55, 0.2 + 0.1 * (band - 3));
        g.addColorStop(0, `rgba(40,30,40,${a})`); g.addColorStop(0.7, `rgba(40,30,40,${a * 0.6})`); g.addColorStop(1, 'rgba(40,30,40,0)');
        ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5); ctx.translate(-x, -y); // flat on the ground
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * pulse, 0, Math.PI * 2); ctx.fill();
        // card open: a light fill in the colour of the level shows which area it is about
        if (sel && s.c === sel.c) { ctx.fillStyle = LEVEL[band].c; ctx.globalAlpha = 0.22; ctx.fill(); }
        ctx.strokeStyle = LEVEL[band].c; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(x, y, R * pulse, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
      }
      // the station: a small white measuring container with a mast, a light in the colour of the level
      const s2 = v.z >= 0.6 ? 1.5 : 1;
      const bw = Math.round(9 * s2), bh = Math.round(6 * s2);
      if (ctx.__claim && !ctx.__claim(x - bw, y - bh - 18 * s2, x + bw, y + 4, band >= 3)) continue;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - bw / 2 + 2, y - bh + 2, bw, bh);
      ctx.fillStyle = '#161d2b'; ctx.fillRect(x - bw / 2 - 1, y - bh - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#f0f2ea'; ctx.fillRect(x - bw / 2, y - bh, bw, bh);
      ctx.fillStyle = '#9aa3ad'; ctx.fillRect(x - bw / 2, y - 2 * s2, bw, 2 * s2);
      ctx.fillStyle = '#161d2b'; ctx.fillRect(x + bw / 2 - 3 * s2, y - bh - 9 * s2, 1.5 * s2, 9 * s2); // mast
      const lc = band ? LEVEL[band].c : '#9aa3ad';
      const r = 4 * s2;
      ctx.fillStyle = '#161d2b'; ctx.beginPath(); ctx.arc(x + bw / 2 - 2.2 * s2, y - bh - 10 * s2, r + 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lc; ctx.beginPath(); ctx.arc(x + bw / 2 - 2.2 * s2, y - bh - 10 * s2, r, 0, Math.PI * 2); ctx.fill();
      hits.push([x - bw, y - bh - 18 * s2, x + bw, y + 4, s]);
      // what is worse here: name of the pollutant next to the station
      if (band >= 3 && (v.z >= 2 / 3.5 || far)) { // text from 3.5 m per pixel, and far out where only these are left
        const txt = `${LEVEL[band].n}: ${POLL[st.culprit].n}`;
        ctx.font = '400 15px "VT323", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(txt).width + 10, tx = Math.round(x + bw / 2 + 8), ty = Math.round(y - bh - 10 * s2);
        ctx.fillStyle = '#161d2b'; ctx.fillRect(tx - 1, ty - 9, tw + 2, 18);
        ctx.fillStyle = LEVEL[band].c; ctx.fillRect(tx, ty - 8, tw, 16);
        ctx.fillStyle = band >= 5 ? '#ffffff' : '#161d2b'; ctx.fillText(txt, tx + 5, ty + 1);
        hits.push([tx, ty - 9, tx + tw, ty + 9, s]);
      }
    }
  }
  const at = (sx, sy) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (sx >= h[0] && sx <= h[2] && sy >= h[1] && sy <= h[3]) return h[4]; } return null; };
  return { load, fetchLive, draw, at, state, select: st => (sel = st), live: c => live.get(c), stations: () => stations, updated: () => updated };
}

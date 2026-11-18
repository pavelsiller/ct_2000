import { DATA_BASE, DIRECT, relayOr } from './feed.js';
import { pickJams, inArea } from './jams.js';
import { clipPath } from './extent.js';
import { joinAccidents, fromWaze } from './nehodyted.js';

const WEATHER = 'https://api.open-meteo.com/v1/forecast?latitude=49.195&longitude=16.608&current=temperature_2m,cloud_cover,precipitation,rain,showers,snowfall,weather_code,visibility,wind_speed_10m,is_day&timezone=Europe%2FPrague';
const JAMS = 'https://gis.brno.cz/ags1/rest/services/Hosted/WazeJams/FeatureServer/0/query';
const ALERTS = 'https://gis.brno.cz/ags1/rest/services/Hosted/WazeAlerts/FeatureServer/0/query';

const weatherDirect = async () => { const r = await fetch(WEATHER); if (!r.ok) throw new Error(`weather ${r.status}`); return r.json(); };
export async function fetchWeather() {
  const c = (await relayOr('weather-now.json', 'now', 40 * 60e3, weatherDirect)).current;
  const code = c.weather_code;
  let kind = 'clear';
  if (code === 45 || code === 48 || (c.visibility && c.visibility < 1000)) kind = 'fog';
  if (c.snowfall > 0 || (code >= 71 && code <= 77) || code === 85 || code === 86) kind = 'snow';
  else if (c.precipitation > 0 || c.rain > 0 || c.showers > 0 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) kind = 'rain';
  const sky = code === 0 ? 'jasno' : code <= 2 ? 'polojasno' : code === 3 ? 'zataženo' : code <= 48 ? 'mlha' : code <= 67 ? 'déšť' : code <= 77 ? 'sněžení' : code <= 82 ? 'přeháňky' : code <= 86 ? 'sněhové přeháňky' : 'bouřka';
  return { code, day: c.is_day, kind, cloud: (c.cloud_cover ?? 50) / 100, precip: c.precipitation || 0, wind: c.wind_speed_10m || 0, temp: c.temperature_2m, sky, time: c.time };
}

async function query(url, params) {
  const q = new URLSearchParams({ outSR: '4326', f: 'json', ...params });
  const r = await fetch(`${url}?${q}`);
  if (!r.ok) throw new Error(`traffic ${r.status}`);
  return (await r.json()).features || [];
}

const JAM_LIVE = 10, JAM_DIRECT = 20, FEED_STALE = 4 * 60e3;
async function jamsFromFeed(now) {
  if (DIRECT) return null; // (VITE_DIRECT: the city table itself, as when our file is missing)
  const urls = [DATA_BASE ? `${DATA_BASE}/data/jams.json?m=${Math.floor(now / 60e3)}` : '', `${import.meta.env.BASE_URL}data/jams.json`].filter(Boolean);
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) continue;
      const d = await r.json();
      if (!Array.isArray(d.jams) || !(now - d.checked < FEED_STALE)) continue;
      const alerts = Array.isArray(d.alerts) && now - d.alertsAt < 5 * 60e3 ? d.alerts : null;
      // (Nehody teď: the accidents of today joined with the firefighters' call-outs, src/nehodyted.js; older than 5 minutes = made here from the reports)
      const nehody = d.nehody && Array.isArray(d.nehody.items) && now - d.nehody.at < 5 * 60e3 ? d.nehody : null;
      return { jams: d.jams.filter(j => now - j.t < (JAM_LIVE + 1) * 60e3), skipped: d.skipped || {}, alerts, nehody };
    } catch { /* the next address */ }
  }
  return null;
}
async function jamsDirect(now) {
  const rows = await query(JAMS, { where: `pubMillis > ${now - JAM_DIRECT * 60e3}`, outFields: 'uuid,level,speedKMH,delay,length,street,pubMillis,roadType,blockingAlertUuid', orderByFields: 'pubMillis DESC', resultRecordCount: '2000' });
  return pickJams(rows.filter(f => f.geometry && f.geometry.paths && f.geometry.paths[0]).map(f => ({ a: f.attributes, path: f.geometry.paths[0], t: f.attributes.pubMillis })));
}
// incidents from the last hour: from jams.json; asked from the city (every other minute at most) only when that file is
// missing or its incidents are older than 5 minutes
// (Waze "road closed" reports are not used: a single point says little about which section is closed;
// the official closures from the city and OpenStreetMap are shown instead)
let alertsAt = 0, alertsLast = [];
async function alertRows(now) {
  if (now - alertsAt < 110e3) return alertsLast;
  const rows = await query(ALERTS, { where: `pubMillis > ${now - 3600e3} AND type IN ('ACCIDENT','HAZARD')`, outFields: 'uuid,type,subtype,street,pubMillis,reportDescription,roadType,nThumbsUp', orderByFields: 'pubMillis DESC', resultRecordCount: '2000' });
  const seen = new Set();
  alertsLast = [];
  for (const f of rows) {
    const a = f.attributes;
    if (seen.has(a.uuid) || !f.geometry) continue;
    seen.add(a.uuid);
    alertsLast.push({ type: a.type, sub: a.subtype || '', street: a.street || '', t: a.pubMillis, note: a.reportDescription || '', lon: f.geometry.x, lat: f.geometry.y, uuid: a.uuid, road: a.roadType, up: a.nThumbsUp || 0 });
  }
  alertsAt = now;
  return alertsLast;
}
export async function fetchTraffic() {
  const now = Date.now();
  const F = await jamsFromFeed(now);
  const [J, alerts] = await Promise.all([F || jamsDirect(now), F && F.alerts ? F.alerts : alertRows(now)]);
  const outA = alerts.filter(a => inArea(a.lon, a.lat));
  const nehody = F && F.nehody ? { ...F.nehody, partial: false }
    : { at: now, partial: true, items: joinAccidents(outA.filter(a => a.type === 'ACCIDENT').map((a, i) => fromWaze({ uuid: a.uuid || `${a.t}-${i}`, pubMillis: a.t, street: a.street, roadType: a.road, subtype: a.sub, nThumbsUp: a.up }, a.lon, a.lat))) };
  // (a jam that runs out of the map is cut at its edge, one wholly outside is left out, src/extent.js)
  const jams = J.jams.map(j => { const path = clipPath(j.path); return !path ? null : path === j.path ? j : { ...j, path }; }).filter(Boolean);
  return { jams, alerts: outA, nehody, at: now, skipped: J.skipped };
}

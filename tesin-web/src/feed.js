import FEEDS from '../tools/data/feeds.json';
import { track } from './stats.js';

export const DATA_BASE = (import.meta.env.VITE_DATA_BASE || '').trim().replace(/\/$/, '');
export const SAMPLE = !DATA_BASE;
export const DIRECT = import.meta.env.VITE_DIRECT === '1';
const FILES = new Set(Object.values(FEEDS).filter(f => typeof f === 'object').flatMap(f => f.files || []));
FILES.add('feed-meta.json');
export const isFeed = f => FILES.has(f);

export function fetchData(url, init) {
  const m = /(?:^|\/)data\/([\w./-]+\.json)$/.exec(url);
  if (!DATA_BASE || !m || !isFeed(m[1])) return fetch(url, init);
  return fetch(`${DATA_BASE}/data/${m[1]}`, init).then(r => (r.ok ? r : Promise.reject(new Error(`${r.status}`)))).catch(() => { track('Chyba', { co: 'feed-nenacten', detail: m[1] }); return fetch(url, init); });
}

const feedOf = file => Object.keys(FEEDS).find(k => (FEEDS[k].files || []).includes(file));
const watchers = new Map(); // feed name -> [reload]
const hourly = []; // run on every tick, feed or not (live counts read once per visit)
export function watchFeed(file, reload) {
  const name = feedOf(file);
  if (!name) return;
  if (!watchers.has(name)) watchers.set(name, []);
  watchers.get(name).push(reload);
}
export const everyHour = fn => hourly.push(fn);
export const RELOAD = { cache: 'reload' };

const TICK_MIN = 40, JITTER_MS = 120e3, RETURN_MS = 15 * 60e3;
const seen = {}; // feed -> time (ms) of the run whose files the page has; unknown = the page load
const loadedAt = Date.now();
let lastTick = Date.now(), timer = null;
async function tick(since = loadedAt) { // (since: the dev hook can pretend the page is older)
  lastTick = Date.now();
  if (!watchers.size && !hourly.length) return;
  const meta = DATA_BASE ? await fetch(`${DATA_BASE}/data/feed-meta.json`, RELOAD).then(r => (r.ok ? r.json() : null)).catch(() => null) : null;
  const due = [];
  for (const name of watchers.keys()) {
    if (!meta) { if (FEEDS[name].every === 'hourly') due.push(name); continue; }
    const run = meta.feeds && meta.feeds[name];
    const at = run && run.ok ? Date.parse(run.at) : NaN;
    if (at > (seen[name] ?? since)) { seen[name] = at; due.push(name); }
  }
  // (a reload gets the record of the feed's run from feed-meta.json, or null without it: { at, ok, files: { name: { n, bytes, ver? } } })
  await Promise.all(due.flatMap(n => watchers.get(n).map(f => Promise.resolve().then(() => f((meta && meta.feeds && meta.feeds[n]) || null)).catch(() => {}))));
  for (const f of hourly) { try { f(); } catch { /* one hook must not stop the others */ } }
  if (due.length) window.dispatchEvent(new CustomEvent('feed-refresh', { detail: due }));
}
function msToTick() {
  const d = new Date();
  let min = TICK_MIN - d.getMinutes();
  if (min <= 0) min += 60;
  return (min * 60 - d.getSeconds()) * 1000 + Math.random() * JITTER_MS;
}
function schedule() { clearTimeout(timer); timer = setTimeout(() => tick().finally(schedule), msToTick()); }
if (typeof window !== 'undefined') {
  schedule();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastTick > RETURN_MS) tick().finally(schedule); });
}

const relays = new Map(); // file -> { t, p }
export function relayFile(file) {
  const now = Date.now(), c = relays.get(file);
  if (c && now - c.t < 60e3) return c.p;
  const urls = [DATA_BASE ? `${DATA_BASE}/data/${file}?m=${Math.floor(now / 60e3)}` : '', `${import.meta.env.BASE_URL}data/${file}`].filter(Boolean);
  const p = (async () => {
    for (const u of urls) {
      try { const r = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(10e3) }); if (r.ok) { const d = await r.json(); if (d && d.parts) return d; } } catch { /* the next address */ }
    }
    return null;
  })();
  relays.set(file, { t: now, p });
  return p;
}
export async function relayPart(file, key, maxAge) {
  const d = await relayFile(file);
  const p = d && d.parts && d.parts[key];
  return p && p.data != null && Date.now() - p.at < maxAge ? p.data : null;
}
export async function relayOr(file, key, maxAge, direct) {
  if (DIRECT) return direct();
  const v = await relayPart(file, key, maxAge).catch(() => null);
  if (v != null) return v;
  track('Chyba', { co: 'rele-naprimo', detail: `${file}#${key}` });
  return direct();
}

export async function freshenDatasets(rows, base = './') {
  const meta = DATA_BASE ? await fetchData(`${base}data/feed-meta.json`, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null) : null;
  for (const row of rows) {
    const run = row.feed && meta?.feeds?.[row.feed];
    if (!run?.ok || !(Date.parse(run.at) > Date.parse(`${row.date || '2000-01-01'}T23:59:59`))) continue;
    row.feedAt = run.at; row.date = run.at.slice(0, 10);
    const n = row.metaFile && run.files?.[row.metaFile]?.n;
    if (Number.isFinite(n)) row.count = n;
  }
  await Promise.all(rows.filter(r => r.liveFile).map(row => fetchData(`${base}data/${row.liveFile}`, { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null)).then(d => { if (d && Array.isArray(d.items)) { row.count = d.items.filter(o => !o.gone).length; row.liveAt = d.checked || Date.parse(d.updated) || null; } }).catch(() => {})));
  return rows;
}

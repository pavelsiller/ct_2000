export const JOIN_M = 200, JOIN_MIN = 60, CALL_M = 300, CALL_MIN = 60;
// an accident is on the map while the drivers still report it (LIVE_MIN after the last report) or the firefighters work
export const LIVE_MIN = 60;
const KX = 111320 * Math.cos((49.2 * Math.PI) / 180), KY = 110540;
const dist = (a, b) => Math.hypot((a.lon - b.lon) * KX, (a.lat - b.lat) * KY);
const near = (p, c) => Math.min(dist(p, c), ...c.pts.map(q => dist(p, q))); // to the nearest report of an accident

// reports: [{ id (uuid), t (ms), lon, lat, street, road (Waze roadType), major (subtype ACCIDENT_MAJOR), up (thumbs) }]
// calls:   [{ id, t (ms of the call), end, open, phase, sub, note, street, part, lon, lat }] (hasici.json, kind "nehoda")
// returns: [{ id, lon, lat, t (first known), last, n (reports), up, street, hw (motorway), major, reports: [t…],
//             h: the call or null }], newest first
export function joinAccidents(reports, calls = []) {
  const list = [...reports].sort((a, b) => a.t - b.t), out = [], open = [];
  for (const r of list) {
    let best = null, bd = Infinity;
    for (let i = open.length - 1; i >= 0; i--) {
      const c = open[i];
      if (r.t - c.last > JOIN_MIN * 60e3) { open.splice(i, 1); continue; }
      const d = near(r, c);
      if (d <= JOIN_M && d < bd) { bd = d; best = c; }
    }
    if (best) { best.n++; best.last = r.t; best.reports.push(r.t); best.pts.push({ lon: r.lon, lat: r.lat }); best.up += r.up || 0; best.major ||= !!r.major; best.hw ||= hw(r); best.streets.push(r.street); }
    else { const c = { id: `w${r.id}`, lon: r.lon, lat: r.lat, t: r.t, last: r.t, n: 1, up: r.up || 0, major: !!r.major, hw: hw(r), reports: [r.t], pts: [], streets: [r.street], h: null }; out.push(c); open.push(c); }
  }
  for (const h of [...calls].sort((a, b) => a.t - b.t)) {
    let best = null, bd = Infinity;
    for (const c of out) {
      if (c.h || h.t < c.t - CALL_MIN * 60e3 || h.t > c.last + CALL_MIN * 60e3) continue;
      const d = near(h, c);
      if (d <= CALL_M && d < bd) { bd = d; best = c; }
    }
    const call = { id: h.id, t: h.t, end: h.end || null, open: !!h.open, phase: h.phase || '', sub: h.sub || '', note: h.note || '', street: h.street || '' };
    if (best) { best.h = call; best.lon = h.lon; best.lat = h.lat; best.t = Math.min(best.t, h.t); best.last = Math.max(best.last, h.t); }
    else out.push({ id: `h${h.id}`, lon: h.lon, lat: h.lat, t: h.t, last: h.t, n: 0, up: 0, major: false, hw: /^D\s?\d/.test(h.street || ''), reports: [], pts: [], streets: [h.street || h.part || ''], h: call });
  }
  for (const c of out) {
    // the street most reports name (the firefighters' street first)
    const cnt = new Map(); for (const s of c.streets) if (s) cnt.set(s, (cnt.get(s) || 0) + 1);
    c.street = (c.h && c.h.street) || [...cnt].sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || '';
    delete c.streets; delete c.pts;
    c.lon = +c.lon.toFixed(5); c.lat = +c.lat.toFixed(5);
  }
  return out.sort((a, b) => b.t - a.t);
}
// a motorway: Waze road type 3 (freeway) or 4 (ramp), or a street named D1, D2…
const hw = r => r.road === 3 || r.road === 4 || /^D\s?\d/.test(r.street || '');

// how sure: 3 the firefighters went there, 2 two or more drivers reported it, 1 one driver
export const level = c => (c.h ? 3 : c.n >= 2 ? 2 : 1);
export const LEVEL_NAME = ['', 'nepotvrzená', 'potvrzená', 'vážná'];
// on the map now: the firefighters still at work, or a report within LIVE_MIN (a call-out already over: until its end
// plus LIVE_MIN at most, not for the 12 hours hasici.json keeps it)
export function isLive(c, now) {
  if (c.h && c.h.open) return true;
  const last = c.h && c.h.end ? Math.max(c.last, c.h.end) : c.last;
  return now - last < LIVE_MIN * 60e3;
}
// the reports of a Waze row as joinAccidents wants them (the city table's attributes and point)
export const fromWaze = (a, lon, lat) => ({ id: a.uuid, t: a.pubMillis, lon, lat, street: a.street || '', road: a.roadType, major: a.subtype === 'ACCIDENT_MAJOR', up: a.nThumbsUp || 0 });
// the call-outs to traffic accidents of hasici.json
export const callsOf = items => (items || []).filter(o => o.kind === 'nehoda' && o.lon != null).map(o => ({ id: o.id, t: o.t, end: o.end, open: o.open, phase: o.phase, sub: o.sub, note: o.note, street: o.street, part: o.part, lon: o.lon, lat: o.lat }));

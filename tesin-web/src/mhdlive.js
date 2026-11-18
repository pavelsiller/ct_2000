// Live positions of public transport vehicles from the City of Brno open data stream
// (KORDIS JMK, licence CC BY; data.brno.cz "Polohy vozidel hromadné dopravy").
// Every vehicle reports its position, bearing, line, delay and last / final stop about every 10–30 s;
// between reports the vehicle glides from its previous to its new position.
import { inMap } from './extent.js';

const STREAM = 'wss://gis.brno.cz/geoevent/ws/services/Kordis_stream/StreamServer/subscribe?outSR=4326';
const SNAP = (import.meta.env.VITE_MHD_SNAP || '').trim();
const POLL_MS = 5000;
const STILL_MS = 45e3; // a snapshot whose time has not moved for this long is no good
const OLD_MS = 120e3;
// A vehicle whose report before this one is older than this is met anew: it is put where it is now, it does not glide
// there from where the page saw it last. The page asks nothing while its tab is hidden, and the glide of every vehicle
// from its place of minutes ago sent the whole fleet racing across the city in straight lines for 9 s after the tab
// came back (measured 2026-11-16 after 90 s away: 220 of 396 vehicles over 108 km/h, the fastest 626 km/h, and the map
// at 14 frames a second meanwhile, every vehicle behind a house drawn anew at every frame). Fresh states come every
// 10–12 s, 34 s at the worst (two copies of a batch in a row).
const GAP_MS = 40e3;
const SNAP_RETRY_MS = 300e3;
const FC = true, FD_DEV = null, FH_DEV = null;
const TYPE = { 0: 'tram', 1: 'trol', 2: 'bus' }; // LType: 0 tram, 1 trolleybus, 2 city bus (4 regional bus, 5 train)
const drawn = a => TYPE[a.VType] || TYPE[a.LType];

export function createMhdLive() {
  const vehicles = new Map();
  let ws = null, wanted = false, lastMsg = 0, retry = null;
  const status = { connected: false, onChange: null };
  const stat = { mode: SNAP ? 'snap' : 'ws', msgs: 0, bytes: 0, polls: 0, fresh: 0, copies: 0, fallbacks: 0, off: null, D: null, F: null, knots: null };
  const say = () => {};
  const setConnected = c => { if (status.connected !== c) { status.connected = c; status.onChange && status.onChange(); } };

  function apply(a, seen, move, from) {
    if (!a || !(a.LType in TYPE) || a.IsInactive === 'true') return;
    // a vehicle that left the map (a bus on its way to a village) is gone from the page with its first report from outside
    if (!inMap(a.Lng, a.Lat)) { vehicles.delete(a.ID); return; }
    const now = performance.now();
    let v = vehicles.get(a.ID);
    if (v && seen - v.seen > GAP_MS) v = null; // (its last report is too old to glide from: as if met for the first time)
    if (v) {
      // keep where it is drawn right now as the start of the glide to the new position
      const p = pos(v, now);
      v.lat0 = p[0]; v.lng0 = p[1]; v.t0 = now;
    }
    const n = v || (from ? { lat0: from[0], lng0: from[1], t0: now } : { lat0: a.Lat, lng0: a.Lng, t0: now });
    // real direction of travel (the reported bearing is often stale): from the last report to this one
    let dLat = a.Lat - n.lat0, dLng = a.Lng - n.lng0;
    if (!v && move && !(from && Math.hypot(dLat * 110574, dLng * 72760) > 4)) [dLat, dLng] = move;
    const dN = dLat * 110574, dE = dLng * Math.cos((a.Lat * Math.PI) / 180) * 111320;
    if (Math.hypot(dN, dE) > 4) { n.heading = (Math.atan2(dE, dN) * 180) / Math.PI; n.moveLat = dLat; n.moveLng = dLng; }
    Object.assign(n, {
      id: `live-${a.ID}`, lat: a.Lat, lng: a.Lng, t1: now + (!v && from ? from[2] : 9000), bearing: a.Bearing || 0, line: a.LineName, type: drawn(a),
      vid: a.ID, idb: a.IDB || 0, idc: a.IDC || 0, delay: a.Delay, last: a.LastStopID, final: a.FinalStopID, at: a.TimeUpdated, seen, lowFloor: a.LF === 'true',
    });
    vehicles.set(a.ID, n);
  }

  function connect() {
    if (ws || !wanted) return;
    try { ws = new WebSocket(STREAM); } catch { ws = null; schedule(); return; }
    ws.onopen = () => setConnected(true);
    ws.onclose = () => { ws = null; if (!snapOn) setConnected(false); schedule(); };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    ws.onmessage = m => {
      let a;
      try { a = JSON.parse(m.data).attributes; } catch { return; }
      stat.msgs++; stat.bytes += m.data.length;
      if (a && a.LType in TYPE && a.IsInactive !== 'true') lastMsg = Date.now();
      apply(a, Date.now());
    };
  }

  // ---- the snapshot: asked once per batch while the live positions are wanted
  const offs = [];
  let play = null; // { D, E } while the snapshots carry what the playing needs
  let fc = null; // { d, h, rv } while they also carry what the forecast needs
  let snapOn = !!SNAP, timer = null, busy = false, bad = 0, lastT = 0, lastTAt = 0, snapBack = 0, lastTb = null;
  const counts = new Map(); // vehicle -> the number of its report the page has (a new number = a new report)
  let plainTb = null, tbAt = Date.now(); // plain passing on: the batch the page has, and when a new one came last
  // back after a pause longer than GAP_MS (the tab was hidden, the map zoomed out): what the page holds is too old to
  // show, and the first answer is due within a moment. Until it comes (WAIT_MS at most) the page draws no vehicles
  // instead of the timetable ones, which stood elsewhere and jumped when the live positions took over.
  const WAIT_MS = 3000;
  let stoppedAt = 0, waitTo = 0;
  async function poll() {
    timer = null;
    if (!wanted || busy) return;
    if (!snapOn) { // on the stream after a failure: time to try the snapshot again?
      if (Date.now() < snapBack) { timer = setTimeout(poll, POLL_MS); return; }
    }
    busy = true;
    let ok = false, next = POLL_MS;
    try {
      const r = await fetch(plainTb ? `${SNAP}?a=${plainTb}` : SNAP, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const text = await r.text(), d = JSON.parse(text), got = Date.now();
        stat.polls++; stat.bytes += text.length;
        if (d.f === 2) {
          const old = d.tb != null && Date.now() - d.tb > OLD_MS;
          if (old) bad = 2; // (no three tries: it will not get younger)
          else if (d.tb !== plainTb) { tbAt = Date.now(); stat.fresh++; if (d.copy) stat.copies++; }
          if (d.tb != null && !old && Date.now() - tbAt < STILL_MS) {
            ok = true;
            next = d.tb !== plainTb ? Math.min(12000, Math.max(1000, d.w || POLL_MS)) : 200;
            if (wanted && d.tb !== plainTb) takePlain(d);
            plainTb = d.tb;
          }
        } else {
          plainTb = null;
          if (d.t !== lastT) { lastT = d.t; lastTAt = Date.now(); }
          if (d.ok && Array.isArray(d.v) && Date.now() - lastTAt < STILL_MS) {
            ok = true;
            if (d.tb != null && d.tb !== lastTb) { lastTb = d.tb; stat.fresh++; if (d.copy) stat.copies++; }
            if (Number.isFinite(d.left)) next = Math.min(12000, Math.max(1000, d.left + 300));
            if (Number.isFinite(d.t)) { offs.push(got - d.t); if (offs.length > 20) offs.shift(); stat.off = Math.min(...offs); }
            if (wanted) take(d);
          }
        }
      }
    } catch { /* counted below */ }
    busy = false;
    if (ok) {
      bad = 0;
      if (!snapOn) { snapOn = true; stat.mode = 'snap'; if (ws) ws.close(); say('snímek zase odpovídá, přímý proud zavírám'); }
      else if (!status.connected) say(`snímek načten: ${vehicles.size} vozů`);
      lastMsg = Date.now(); setConnected(true);
    } else if (snapOn && ++bad >= 3) { // three in a row: the stream itself, the snapshot again in a while
      snapOn = false; bad = 0; snapBack = Date.now() + SNAP_RETRY_MS; stat.mode = 'ws'; stat.fallbacks++; counts.clear(); plainTb = null;
      play = null; fc = null; stat.D = null; stat.F = null; stat.knots = null; for (const v of vehicles.values()) v.knots = null; // (the stream: the glide again)
      setConnected(false); connect(); say('snímek neodpovídá, přecházím na přímý proud');
    } else if (!snapOn) snapBack = Date.now() + SNAP_RETRY_MS;
    if (wanted) timer = setTimeout(poll, next);
  }
  function take(d) {
    const c = {};
    d.cols.forEach((k, i) => { c[k] = i; });
    const here = new Set();
    const ago = Array.isArray(d.ago) && d.ago.length && Number.isFinite(d.D) && c.h !== undefined ? d.ago : null;
    play = ago ? { D: d.D, E: d.E || 0 } : null; stat.D = play ? play.D : null;
    fc = ago && Array.isArray(d.F) && d.F[0] > 0 && c.ns !== undefined ? { d: d.F[0], h: d.F[1], rv: d.rv } : null; stat.F = fc ? fc.d : null;
    if (!ago && stat.knots) { stat.knots = null; for (const v of vehicles.values()) v.knots = null; }
    for (const r of d.v) {
      const id = r[c.id];
      here.add(id);
      if (counts.get(id) === r[c.n] && vehicles.has(id) && (!ago || vehicles.get(id).knots)) continue; // no news of this one
      counts.set(id, r[c.n]);
      stat.msgs++;
      apply({ ID: id, Lat: r[c.lat], Lng: r[c.lng], Bearing: r[c.bearing], LineName: r[c.line], LType: r[c.ltype], Delay: r[c.delay], LastStopID: r[c.last], FinalStopID: r[c.final],
        TimeUpdated: r[c.at], LF: r[c.lf] ? 'true' : 'false', IDB: r[c.idb], IDC: r[c.idc] }, Date.now() - r[c.age] * 1000, r[c.mlat] == null ? null : [r[c.mlat] / 1e6, r[c.mlng] / 1e6]);
      // the knots of its way, the oldest first: the states before (h: [dLat, dLng, how many states back, …], the
      // newer first) and the present one; the time of a state is t - ago[states back]. A new array = a new way.
      const v = ago && vehicles.get(id);
      if (v) {
        const h = r[c.h], lat = r[c.lat], lng = r[c.lng], k = [];
        if (h) for (let i = h.length - 3; i >= 0; i -= 3) if (ago[h[i + 2]] != null) k.push([d.t - ago[h[i + 2]], lat + h[i] / 1e6, lng + h[i + 1] / 1e6]);
        k.push([d.t - ago[0], lat, lng]);
        v.knots = k;
        // its place on its route, for the forecast (null off the route)
        v.sh = r[c.sh]; v.m = r[c.m]; v.dir = r[c.dir]; v.ns = c.ns !== undefined ? r[c.ns] : null; v.o = c.o !== undefined ? r[c.o] : null;
      }
    }
    if (ago) { const n = { 1: 0, 2: 0, 3: 0 }; for (const v of vehicles.values()) if (v.knots) n[v.knots.length]++; stat.knots = n; }
    for (const id of vehicles.keys()) if (!here.has(id)) { vehicles.delete(id); counts.delete(id); }
  }

  function takePlain(d) {
    const all = plainTb == null || plainTb !== d.pb, here = new Set(), now = Date.now();
    if (play || fc || stat.knots) { play = null; fc = null; stat.D = null; stat.F = null; stat.knots = null; for (const v of vehicles.values()) v.knots = null; }
    // (a page that has just opened: how far the glide of this batch would be on a page that had been open, by this
    // device's clock, the batch being ready about 2.5 s after its stamp and a copy bringing the state of the batch
    // before; at most a half, so that there is always something to drive)
    const part = d.pa ? Math.max(0, Math.min(0.5, (Date.now() - d.tb - 2500 + (d.copy ? 10000 : 0)) / 9000)) : 0;
    let id = 0;
    for (let i = 0; i < d.n; i++) {
      id += d.id[i];
      here.add(id);
      if (!all && d.u[i] !== '1' && vehicles.has(id)) continue; // no news of this one
      stat.msgs++;
      const lat = (d.la[i] + 4900000) / 1e5, lng = (d.lo[i] + 1600000) / 1e5, b = +d.b[i], h = d.h[i];
      // (a vehicle met for the first time: 10 m of its last move, for the direction it is drawn in)
      const move = h < 0 ? null : [(Math.cos((h * 5 * Math.PI) / 180) * 10) / 110574, (Math.sin((h * 5 * Math.PI) / 180) * 10) / (Math.cos((lat * Math.PI) / 180) * 111320)];
      apply({ ID: id, Lat: lat, Lng: lng, Bearing: b > 7 ? -1 : b * 45, LineName: d.l[i], LType: +d.t[i], Delay: d.d[i], LastStopID: d.s[i], FinalStopID: d.fs[i],
        TimeUpdated: d.tb, LF: d.lf[i] === '1' ? 'true' : 'false', IDB: d.ib[i], IDC: d.ic[i] }, now, move,
        d.pa && (d.pa[i] || d.po[i]) ? [lat + (d.pa[i] / 1e5) * (1 - part), lng + (d.po[i] / 1e5) * (1 - part), 9000 * (1 - part)] : null);
    }
    for (const k of vehicles.keys()) if (!here.has(k)) vehicles.delete(k);
  }

  function schedule() { if (wanted && !snapOn && !retry) retry = setTimeout(() => { retry = null; if (!snapOn) connect(); }, 5000); }
  function pos(v, now) {
    const f = Math.max(0, Math.min(1, (now - v.t0) / (v.t1 - v.t0 || 1)));
    return [v.lat0 + (v.lat - v.lat0) * f, v.lng0 + (v.lng - v.lng0) * f];
  }
  return {
    status,
    start() {
      if (!wanted && stoppedAt && Date.now() - stoppedAt > GAP_MS) { vehicles.clear(); counts.clear(); plainTb = null; waitTo = Date.now() + WAIT_MS; }
      wanted = true; if (SNAP && !timer) poll(); if (!snapOn) connect();
    },
    stop() { if (wanted) stoppedAt = Date.now(); wanted = false; if (timer) { clearTimeout(timer); timer = null; } if (ws) ws.close(); if (snapOn) setConnected(false); },
    // just back after a long pause and no answer yet: nothing to draw for a moment (see WAIT_MS)
    waiting: () => wanted && Date.now() < waitTo && Date.now() - lastMsg >= 60e3,
    stat,
    play: () => (play && snapOn && stat.off != null ? { td: Date.now() - stat.off - play.D, E: play.E } : null),
    fc: () => (fc && snapOn && stat.off != null ? { now: Date.now() - stat.off, d: fc.d, h: fc.h, rv: fc.rv } : null),
    // fresh vehicles (reported in the last 3 minutes) with their current glide position
    // (keep(lat, lng, id): only the vehicles it says yes to are copied out, e.g. those in the view)
    list(keep = null) {
      const now = performance.now(), cut = Date.now() - 180e3, out = [];
      for (const [k, v] of vehicles) {
        if (v.seen < cut) { vehicles.delete(k); continue; }
        const [lat, lng] = pos(v, now);
        if (keep && !keep(lat, lng, v.id)) continue;
        out.push({ ...v, latNow: lat, lngNow: lng });
      }
      return out;
    },
    // the fresh records themselves, not copied (read only): the page projects each report once and glides in the image
    records() {
      const cut = Date.now() - 180e3;
      for (const [k, v] of vehicles) if (v.seen < cut) vehicles.delete(k);
      return vehicles.values();
    },
    alive: () => Date.now() - lastMsg < 60e3,
    count: () => vehicles.size,
  };
}

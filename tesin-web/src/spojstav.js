export const WAYS = {
  bezne: { name: 'Běžně', title: 'chůze 4,5 km/h', ico: 'walk', walk: 1.25, change: 1, hurry: true, patience: 1 },
  pomalu: { name: 'Pomaleji', title: '3 km/h, víc času na přestup', ico: 'slow', fig: 'slow', walk: 0.85, change: 2, hurry: false, patience: 2 },
  // (data: offered only when the timetable says which trips are low-floor and which posts are without barriers;
  // low: only low-floor trips, and the bar checks the very vehicle that comes; flat: only posts without barriers)
  kocarek: { name: 'S kočárkem', title: 'jen nízkopodlažní spoje', ico: 'pram', fig: 'pram', walk: 1.0, change: 1.5, hurry: false, patience: 2, low: true, data: true },
  vozik: { name: 'Na vozíku', title: 'nízkopodlažní spoje, bezbariérová nástupiště', ico: 'chair', fig: 'chair', walk: 0.85, change: 2.5, hurry: false, patience: 2, low: true, flat: true, data: true },
};

export const P = {
  WALK: 1.25, // m/s: the walk of the plan (4.5 km/h)
  BRISK: 1.9, // m/s: "přidejte do kroku" up to here (7 km/h)
  RUN: 3.0, // m/s: "běžte" up to here (11 km/h); more than that is not caught
  DETOUR: 1.25, // metres in a straight line -> metres walked
  BOARD: 15, // s to get on once at the stop
  NEAR: 45, // m: at the stop
  FAR_OFF: 600, // m (and twice the walk): farther than that the position says nothing about this journey
  GRACE: 30, // s after its time a vehicle without a live position counts as gone
  LIVE_HOLD: 90, // s after its time a live vehicle not yet seen behind the stop is still waited for
  RIDE_SPEED: 3.5, // m/s: faster than a run that lasts = a ride
  RIDE_AWAY: 60, // m from the stop before a ride is believed
  RIDE_CONE: 70, // degrees between my way and the way of the line
  RIDE_WITH: 300, // m from the live vehicle at most
  SEEM_SEC: 30, // s "vypadá to, že jedete" waits for a tap before it counts as said
  SEEM_LOST: 20, // s without anything like a ride: it was not one
  STAY_SEC: 45, // s still at the stop after the vehicle left: it went without me
  FAR_SEC: 20, // s after the vehicle left while I am still on my way to the stop: not caught
  ASK_SEC: 120, // s the question waits without a position (the first ride), then the next journey
  ASK_CHANGE: 60, // s the question waits at a change, then the ride is taken as caught
  UNDO_SEC: 90, // s "Nejedu" stays after the bar took the getting on for granted
  MATE_SEC: 10, // s the position has to travel with one vehicle before it is believed to be in it
  BEEN_SEC: 900, // s after standing at the stop of a ride a vehicle the position travels with still counts for this journey
  MATE_ON: 30, // s the same, before somebody said to be in the planned vehicle is told they are in another
  WRONG_TURN: 110, // degrees between my way and the way of the line: riding the other way
  OVER_SEC: 30, // s after the time of getting off the position still rides on with the vehicle: the stop was passed
  POP_INFO: 30, // s a window that only tells something stays in the middle of the screen
};

const distM = (a, b) => Math.hypot((a[0] - b[0]) * 72765, (a[1] - b[1]) * 111200);
/** The way from a to b ([lon, lat]) in degrees, north 0, east 90. */
export const bearing = (a, b) => (Math.atan2((b[0] - a[0]) * 72765, (b[1] - a[1]) * 111200) * 180 / Math.PI + 360) % 360;
const turn = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
export function sideWords(come, dir) {
  const d = ((((dir - come) % 360) + 540) % 360) - 180; // (-180…180, plus = to the right of the way one walks)
  return Math.abs(d) <= 45 ? 'pojede dál vaším směrem' : Math.abs(d) >= 135 ? 'pojede zpět, odkud jdete' : d > 0 ? 'pojede od vás doprava' : 'pojede od vás doleva';
}
const hhmm = sec => { const s = ((Math.round(sec) % 86400) + 86400) % 86400; return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`; };
const mins = sec => Math.max(1, Math.round(sec / 60));
export const span = sec => { const m = mins(sec); return m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`; };
// the same for the big square of the bar: { big, unit }, "25" min or "5:25" h
const bigOf = sec => { const m = mins(sec); return m < 60 ? { big: String(m), unit: 'min' } : { big: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, unit: 'h' }; };
const secs = sec => `${Math.max(1, Math.ceil(sec / 5) * 5)} s`; // (by fives: the bar is painted every few seconds)
const WHO = { tram: ['Šalina', 'odjela', 'ujela', 'Šalinu'], trol: ['Trolejbus', 'odjel', 'ujel', 'Trolejbus'], bus: ['Autobus', 'odjel', 'ujel', 'Autobus'] };
const who = l => WHO[l.type] || ['Linka', 'odjela', 'ujela', 'Linku'];
const post = p => (p ? `, nást. ${p}` : '');
const ridesOf = L => L.legs.filter(l => l.kind === 'ride');
// the walk before a ride: from the start to the first one, between two rides at a change
function walkBefore(L, k) {
  let n = -1, sec = 0, m = 0;
  for (const l of L.legs) {
    if (l.kind === 'ride') { n++; if (n === k) break; sec = 0; m = 0; continue; }
    sec += l.sec || 0; m += l.m != null ? l.m : (l.sec || 0) * P.WALK;
  }
  return { sec, m };
}
const blank = o => Object.assign({ ph: '', k: 0, tone: 'calm', st: '', sub: [], lab: '', big: '', unit: '', btns: [], again: false, flag: null }, o);
function getOn(mem, k, how, now) { mem.on = k; mem.how = how; mem.onAt = now; mem.seem = mem.stay = mem.far = mem.ask = mem.been = mem.wrong = mem.else = null; mem.miss = null; }

/**
 * A journey with the live delays put in (delayOf(ride) -> minutes or null): every ride gets { d, eDep, eArr }, the
 * changes are checked (risk: 'tight' | 'lost' when the ride in comes later than the ride out leaves, less the walk
 * or the step across), leave and arrive are the times of the whole.
 */
export function liveJourney(j, delayOf) {
  const legs = j.legs.map(l => (l.kind === 'ride' ? { ...l, d: delayOf(l) } : { ...l }));
  for (const l of legs) if (l.kind === 'ride') { l.eDep = l.dep + (l.d || 0) * 60; l.eArr = l.arr + (l.d || 0) * 60; }
  let risk = null;
  for (let i = 0; i < legs.length; i++) {
    if (legs[i].kind !== 'ride') continue;
    let k = i + 1, walk = 0;
    while (k < legs.length && legs[k].kind === 'walk') walk += legs[k++].sec;
    const nx = legs[k];
    if (!nx || nx.kind !== 'ride') continue;
    const slack = nx.eDep - legs[i].eArr - (walk || 45);
    if (slack < 0) risk = risk === 'lost' ? risk : slack < -60 ? 'lost' : 'tight';
  }
  const first = legs.find(l => l.kind === 'ride');
  const lead = legs[0].kind === 'walk' && first ? legs[0].sec : 0;
  const leave = first ? first.eDep - lead : j.dep;
  let arrive = leave;
  for (const l of legs) arrive = l.kind === 'ride' ? l.eArr : arrive + l.sec;
  return { legs, risk, leave, arrive, first };
}

/** What the bar says now. Changes mem; the things that happened by themselves are in ev. */
export function journeyState(c, mem) {
  if (mem.on == null) mem.on = -1;
  const ev = [];
  const s = step(c, mem, ev);
  s.ev = ev;
  // which way the ride waited for goes (what its front says), or where to get off the one ridden
  const rides = ridesOf(c.L), l = rides[Math.min(rides.length - 1, Math.max(0, s.k))];
  const rq = (c.reqOf && c.reqOf(l)) || {};
  s.mid = s.ph === 'done' || s.ph === 'walk-end' ? '' : s.ph === 'ride' ? `výstup ${hhmm(l.eArr)} ${c.stopName(l.to)}${rq.off ? ' · na znamení' : ''}` : `${hhmm(l.eDep)}${l.hs ? ` směr ${l.hs}` : ' nástup'}${rq.on ? ' · na znamení' : ''}`;
  s.pop = popOf(c, s, l);
  return s;
}

function popOf(c, s, l) {
  const k = s.k, base = { key: `${s.ph}:${k}`, tone: s.tone, title: s.st, text: s.sub, btns: s.btns, wait: s.wait || null, ttl: null };
  switch (s.ph) {
    case 'ask': case 'seems': return Object.assign(base, { key: `on:${k}` });
    case 'wrong-way': case 'overshoot': case 'other': return base;
    case 'missed': case 'change-lost': case 'not-low': return Object.assign(base, { ttl: P.POP_INFO * 2 });
    case 'elsewhere': return Object.assign(base, { ttl: P.POP_INFO });
    // (the vehicle is due: "Nástup teď" with the word of whether one is on board; on the way to the stop by the clock alone
    // too, as nobody knows where the visitor is; a position on the way says it in the bar: walk, hurry, run)
    case 'leave': case 'walk-late': case 'walk-brisk': case 'walk-run': if (c.gps) return null; // falls through
    case 'wait': case 'change':
      if (l.eDep - c.now >= 60) return null; // (from when the bar says "teď" too)
      return Object.assign(base, { key: `on:${k}`, title: s.ph === 'change' ? 'Přestup teď' : 'Nástup teď',
        text: [{ b: [l.line, l.type] }, `${l.hs ? ` směr ${l.hs}` : ''} · ${c.stopName(l.from)}${post(l.postFrom)}`, ...(l.d ? [{ d: l.d }] : [])], btns: [{ id: 'on', label: k ? 'Přestoupil jsem' : 'Nastoupil jsem' }, { id: 'off', label: 'Nestihl jsem' }] });
    case 'ride':
      if (s.st === 'Vystupte teď') return Object.assign(base, { key: `off:${k}`, btns: [{ id: 'out', label: 'Vystoupil jsem' }, { id: 'stay', label: 'Jedu dál' }] });
      if (s.unit === 'příští') return Object.assign(base, { key: `off:${k}`, btns: [], ttl: P.POP_INFO }); // ("Vystupte na příští": get ready; shut after a while, "Vystupte teď" opens it again)
      return null;
    default: return null;
  }
}
/** The visitor's word: 'on' = I am on board of the ride waited for; 'off' = I am not (it went, or the bar guessed wrong). */
export function say(c, mem, what) {
  const rides = ridesOf(c.L);
  if (what === 'notmate') { if (mem.else) mem.notMate = mem.else.id; mem.else = mem.wrong = null; return; } // (not in that vehicle: it is not asked about again)
  // off the ride before the clock says so (or just as it says): the journey goes on from its next part
  if (what === 'out') { if (mem.on >= 0) { mem.out = { k: mem.on, at: c.now }; mem.over = null; } return; }
  // riding on past the stop of getting off (on purpose, or it was missed): src/spojeni.js plans the journey anew from the vehicle
  if (what === 'stay') { if (mem.on >= 0) { mem.stayOn = { k: mem.on, at: c.now }; mem.over = null; } return; }
  if (what === 'on') { const k = Math.min(rides.length - 1, mem.on + (mem.on >= 0 && c.now < rides[mem.on].eArr ? 0 : 1)); getOn(mem, k, 'said', c.now); return; }
  // not on board: of the ride the bar took for granted, or of the one waited for
  const k = mem.on >= 0 && c.now < rides[mem.on].eArr && mem.how !== 'said' ? mem.on : mem.on + 1;
  mem.on = k - 1; mem.how = null; mem.seem = mem.stay = mem.far = mem.ask = null;
  mem.miss = { k: Math.min(k, rides.length - 1), why: 'said' };
}

function step(c, mem, ev) {
  const { now, L } = c, rides = ridesOf(L);
  // the map rides with a vehicle: the one of a ride of this journey, or one of the line waited for = on board of it
  if (c.ride) {
    const k = mem.on + 1;
    let hit = c.ride.idx;
    if (hit < 0 && rides[k] && String(c.ride.line) === String(rides[k].line) && now >= rides[k].eDep - 600) hit = k;
    if (hit > mem.on) {
      const other = c.ride.idx < 0; // (not the vehicle of the plan, another one of its line: its times are its own)
      getOn(mem, hit, 'ride', now); ev.push('on');
      if (other && !mem.swapped) { mem.swapped = true; ev.push('replan'); }
    }
  }
  if (mem.miss) return missed(c, mem);
  if (mem.on >= 0) {
    const l = rides[mem.on], next = rides[mem.on + 1] || null, out = !!(mem.out && mem.out.k === mem.on);
    if (now < l.eArr && !out) {
      const mate = c.gps && c.mate && c.mate.secs >= P.MATE_ON && c.mate.idx !== mem.on && mem.notMate !== c.mate.id && mem.how !== 'ride' ? c.mate : null;
      if (mate) return elsewhere(c, mem, ev, mem.on, l, mate);
      return onBoard(c, mem, l, next);
    }
    const stays = !!(mem.stayOn && mem.stayOn.k === mem.on);
    if (!out && !stays && c.gps && c.mate && c.mate.idx === mem.on && c.gps.speed >= P.RIDE_SPEED && now >= l.eArr + P.OVER_SEC) {
      if (!mem.over || mem.over.k !== mem.on) mem.over = { k: mem.on, since: now };
      const rest = P.SEEM_SEC - (now - mem.over.since);
      if (rest <= 0) { mem.stayOn = { k: mem.on, at: now }; mem.over = null; ev.push('replan'); }
      return blank({ ph: 'overshoot', k: mem.on, tone: 'miss', st: `Nevystoupili jste na ${c.stopName(l.to)}?`, sub: [`Podle polohy jedete dál s vozem ${l.line}. ${rest > 0 ? `Bez odpovědi za ${secs(rest)} spočítám cestu odsud.` : 'Počítám cestu odsud.'}`], lab: 'výstup', big: '?', unit: '', btns: [{ id: 'out', label: 'Vystoupil jsem' }, { id: 'stay', label: 'Jedu dál' }], wait: Math.max(0, rest) });
    }
    if (mem.over && mem.over.k === mem.on) mem.over = null; // (slowed down, or left the vehicle: got off after all)
    if (!next) {
      if (now >= L.arrive) return blank({ ph: 'done', k: mem.on, tone: 'done', st: 'Jste v cíli', sub: [`lišta i trasa zmizí v ${hhmm(L.arrive + 300)}`], lab: 'v cíli', big: '✓', unit: hhmm(L.arrive) });
      const m = mins(L.arrive - now);
      return blank({ ph: 'walk-end', k: mem.on, tone: 'ride', st: `Pěšky do cíle, ${m} min`, sub: [`${c.endName()} · v cíli ${hhmm(L.arrive)}`], lab: 'v cíli za', big: String(m), unit: 'min' });
    }
  }
  return before(c, mem, ev, mem.on + 1);
}

// on board of a ride: the stops to getting off; "Nejedu" for a while when the bar took the getting on for granted
function onBoard(c, mem, l, next) {
  const { now, L } = c, n = Math.max(1, (c.stopsLeft && c.stopsLeft(l)) || 1);
  const lostNext = !!next && L.risk === 'lost'; // (this vehicle is late: the next one will not wait)
  const then = lostNext ? [' · přestup na ', { b: [next.line, next.type] }, ` v ${hhmm(next.eDep)} nestihnete`] : next ? [' · pak ', { b: [next.line, next.type] }, ` v ${hhmm(next.eDep)}`] : [` · v cíli ${hhmm(L.arrive)}`];
  const guessed = mem.how === 'gps' || mem.how === 'quiet';
  const btns = guessed && now - mem.onAt < P.UNDO_SEC ? [{ id: 'off', label: 'Nejedu' }] : [];
  const where = [{ b: [l.line, l.type] }, ` ${c.stopName(l.to)}${post(l.postTo)} v ${hhmm(l.eArr)}`, ...then];
  const s = blank({ ph: 'ride', k: mem.on, tone: n <= 1 ? 'go' : 'ride', sub: where, lab: 'vystupte za', big: String(n), unit: n <= 1 ? 'příští' : 'zast.', btns });
  const stopBtn = !!(c.reqOf && (c.reqOf(l) || {}).off); // (the stop of getting off is a request stop: the button has to be pressed)
  if (now >= l.eArr - 20) s.st = 'Vystupte teď';
  else if (n <= 1) s.st = stopBtn ? 'Zmáčkněte STOP · vystupte na příští' : 'Vystupte na příští';
  else s.st = `✓ Jedete · vystupte za ${n} zast.`;
  if (stopBtn && n <= 2) where.unshift('Výstup je na znamení · ');
  if (guessed && btns.length) s.sub = [mem.note ? `${mem.note} · ` : mem.how === 'gps' ? 'Podle polohy jedete, beru to jako nastoupeno · ' : 'Bez odpovědi to beru jako přestoupeno · ', ...where];
  return s;
}

// the ride went without the visitor (said, or found out): the next journey when there is one, else Hledat znovu
function missed(c, mem) {
  const rides = ridesOf(c.L), l = rides[mem.miss.k], w = who(l), why = mem.miss.why;
  c = mem.miss.k === 0 ? c : Object.assign({}, c, { next: null }); // (the next journey of the list starts where this one did: no help at a change)
  const st = why === 'far' ? `${w[3]} ${l.line} jste nestihli` : why === 'silent' ? `${w[0]} ${l.line} ${w[1]}` : `${w[0]} ${l.line} ${w[2]}`;
  return blank({ ph: 'missed', k: mem.miss.k, tone: 'miss', st, sub: [c.next ? `Další spoj jede v ${hhmm(c.next.dep)}` : 'Hledat znovu najde další spojení odsud'], lab: 'ujelo', big: '!', unit: '', btns: c.next ? [{ id: 'next', label: 'Další spoj' }] : [], again: !c.next, flag: { text: 'ujelo', miss: true } });
}
function lost(c, mem, ev, k, why) { mem.miss = { k, why }; mem.seem = mem.stay = mem.far = mem.ask = null; ev.push('missed'); return missed(c, mem); }

function elsewhere(c, mem, ev, k, l, mate) {
  const { now } = c;
  const same = String(mate.line) === String(l.line), good = mate.toward === true || (same && mate.toward !== false);
  if (!mem.else || mem.else.id !== mate.id) mem.else = { id: mate.id, since: now };
  mem.else.good = good;
  if (!mem.else.asked) { mem.else.asked = true; ev.push('replan'); }
  const btns = [{ id: 'notmate', label: 'Nejedu' }];
  if (good) return blank({ ph: 'elsewhere', k, tone: 'ride', st: 'Jiný vůz, správný směr', sub: [`Jedete ${same ? `jiným spojem linky ${l.line}` : `linkou ${mate.line} místo ${l.line}`}. Pokračujeme tímto vozem, přepočítávám.`], lab: 'jiný vůz', big: '✓', unit: '', btns });
  // the same line the other way: surely wrong. Another line that does not call at the stop planned: it may still take
  // one most of the way; what it is worth is known only once the new plan is there (src/spojeni.js says it then)
  if (same) return blank({ ph: 'elsewhere', k, tone: 'miss', st: 'Jedete opačným směrem', sub: [`Linka ${l.line} má jet směr ${l.hs || c.stopName(l.to)}. Hledám náhradní trasu.`], lab: 'jinam', big: '!', unit: '', btns });
  return blank({ ph: 'elsewhere', k, tone: 'go', st: `Jedete ${mate.line}, ne ${l.line}`, sub: [`Linka ${mate.line}${mate.hs ? ` směr ${mate.hs}` : ''}. Zjišťuji, jestli vás doveze, nebo je lepší vystoupit.`], lab: 'jiný vůz', big: '?', unit: '', btns });
}

// before a ride: setting out, the way to the stop, the wait, the departure and whether one got on
function before(c, mem, ev, k) {
  if (k > 0 && c.next) c = Object.assign({}, c, { next: null }); // (as in missed(): no next journey from the middle of this one)
  const { now, L } = c, rides = ridesOf(L), l = rides[k], w = walkBefore(L, k), W = who(l);
  const v = (c.veh && c.veh(l)) || null, live = !!(v && v.live);
  const gone = (live && v.gone) || now >= l.eDep + (live ? P.LIVE_HOLD : P.GRACE);
  const at = c.stopLL(l.from);
  let g = c.gps && at ? c.gps : null;
  const dStop = g ? distM([g.lon, g.lat], at) : null;
  // (a position far off the journey says nothing about it: somebody looking up a journey from elsewhere)
  if (g && dStop > Math.max(P.FAR_OFF, w.m * 2 + 300)) g = null;
  const near = !!g && dStop <= P.NEAR + Math.min(25, (g.acc || 0) / 2);
  if (near) mem.been = { k, at: now };
  const stop = `${c.stopName(l.from)}${post(l.postFrom)}`, inS = l.eDep - now;
  const big = inS < 60 ? { big: 'TEĎ', unit: '' } : bigOf(inS);
  const flagIn = { text: `${inS < 60 ? 'teď' : `za ${span(inS)}`}${l.postFrom ? ` · nást. ${l.postFrom}` : ''}`, miss: false };
  const delay = l.d ? [{ d: l.d }] : [];
  const way = l.hs ? ` směr ${l.hs}` : ''; // (what the front of the vehicle says: the surest way to tell the right one)
  // who travels: the pace that is a plain walk, and up to which pace one is told to hurry (not told at all: the same)
  const how = c.way || WAYS.bezne, WALK = how.walk, BRISK = how.hurry ? P.BRISK : WALK * 1.15, RUN = how.hurry ? P.RUN : WALK * 1.15, wait = how.patience || 1;
  const req = (c.reqOf && c.reqOf(l)) || {}; // (a request stop: the driver has to be waved at)
  const wave = req.on ? ' · na znamení: dejte řidiči znamení' : '';
  const side = (c.sideOf && c.sideOf(l)) || ''; // ("pojede dál vaším směrem": against the way one comes to the stop)

  // the map rides with a vehicle of another line while this ride is due: not this journey
  if (c.ride && c.ride.idx < 0 && String(c.ride.line) !== String(l.line) && now >= l.eDep - 120) {
    return blank({ ph: 'other', k, tone: 'miss', st: `Jedete ${c.ride.line}, ne ${l.line}`, sub: [`Spojení počítalo s linkou ${l.line} v ${hhmm(l.eDep)}. Nový postup spočítá cestu z vozu, ve kterém jedete.`], lab: 'jinde', big: '?', unit: '', btns: [{ id: 'replan', label: 'Nový postup' }] });
  }

  // the position travels with a vehicle that could be told: the one of this ride = on board at once, no question;
  // any other = not this journey as planned (an earlier vehicle caught at a change, the other way, another line)
  // (also far from the stop, when the visitor was at it not long ago: a vehicle caught there carries the position away fast)
  const wasHere = !!mem.been && mem.been.k === k && now - mem.been.at < P.BEEN_SEC;
  const mate = c.gps && (g || wasHere) && c.mate && c.mate.secs >= P.MATE_SEC && mem.notMate !== c.mate.id ? c.mate : null;
  if (mate && mate.idx === k) { getOn(mem, k, 'gps', now); ev.push('auto-on'); return step(c, mem, ev); }
  if (mate) return elsewhere(c, mem, ev, k, l, mate);

  // riding away from the stop against the way of the line, around its time, with no vehicle to tell it by
  if (g && !near && mem.been && mem.been.k === k && now - mem.been.at < 120 && now >= l.eDep - 120) {
    const dir = c.dirOf ? c.dirOf(l) : null;
    if (g.speed >= P.RIDE_SPEED && dStop >= P.RIDE_AWAY && dir != null && g.head != null && turn(g.head, dir) >= P.WRONG_TURN) {
      if (!mem.wrong || mem.wrong.k !== k) mem.wrong = { k, since: now };
      mem.been.at = now; // (still that ride from that stop)
      if (now - mem.wrong.since >= P.MATE_SEC) return blank({ ph: 'wrong-way', k, tone: 'miss', st: 'Jedete opačným směrem?', sub: [`Linka ${l.line} má odsud jet${l.hs ? ` směr ${l.hs}` : ' na druhou stranu'}.`], lab: 'směr', big: '?', unit: '', btns: [{ id: 'replan', label: 'Nový postup' }, { id: 'notmate', label: 'Nejedu' }] });
    } else if (mem.wrong && mem.wrong.k === k && g.speed < 1) mem.wrong = null;
  }

  // it looks like a ride: fast, away from the stop, the way the line goes (and with its vehicle, when that is known)
  if (g && (now >= l.eDep - 30 || (live && v.gone))) { // (from a little before its time: a vehicle may leave early)
    const dir = c.dirOf ? c.dirOf(l) : null;
    const along = dir == null || g.head == null || turn(g.head, dir) <= P.RIDE_CONE;
    const withIt = !(live && v.lon != null) || distM([g.lon, g.lat], [v.lon, v.lat]) <= P.RIDE_WITH;
    if (g.speed >= P.RIDE_SPEED && dStop >= P.RIDE_AWAY && along && withIt) {
      if (!mem.seem || mem.seem.k !== k) mem.seem = { k, since: now };
      mem.seem.seen = now;
    }
    if (mem.seem && mem.seem.k === k) {
      if (near || now - mem.seem.seen > P.SEEM_LOST) mem.seem = null;
      else if (now - mem.seem.since >= P.SEEM_SEC) { getOn(mem, k, 'gps', now); ev.push('auto-on'); return step(c, mem, ev); }
      else {
        const rest = P.SEEM_SEC - (now - mem.seem.since);
        return blank({ ph: 'seems', k, tone: 'ride', st: `Jedete linkou ${l.line}?`, sub: [`Podle polohy to tak vypadá. Bez odpovědi to za ${secs(rest)} beru jako nastoupeno.`], lab: 'jedete?', big: '?', unit: '', btns: [{ id: 'on', label: 'Jedu' }, { id: 'off', label: 'Nejedu' }], wait: rest });
      }
    }
  }

  // a change: the ride in was late and the next one has not waited (said before anything else is asked)
  if (k > 0 && L.risk === 'lost' && !(mem.seem && mem.seem.k === k)) return blank({ ph: 'change-lost', k, tone: 'miss', st: 'Přestup nestihnete', sub: [{ b: [l.line, l.type] }, ` ${c.stopName(l.from)} v ${hhmm(l.eDep)} · předchozí vůz měl zpoždění`], lab: 'přestup', big: '!', unit: '', again: true });

  // the vehicle has gone and nobody has said they are on board (also: the position was at the stop and is carried
  // away from it around the time of the departure, whatever the clock or a vehicle without a live position says)
  const been0 = !!g && !!mem.been && mem.been.k === k && now - mem.been.at < 90;
  if (gone || (been0 && !near && now >= l.eDep - 30 && g.speed >= P.RIDE_SPEED)) {
    const flag = { text: 'odjelo', miss: true }; // (the question is short for the narrow bar: "Odjezd 9 · jedete?" [Jedu] [Nejedu])
    if (g) {
      // has the visitor been at the stop at all (now, or a moment ago: a vehicle leaving carries the position away)?
      if (near) mem.been = { k, at: now };
      const been = !!(mem.been && mem.been.k === k && now - mem.been.at < 90);
      if (been) {
        // fast and away already: most likely the ride itself, a few seconds before it can be told ("Vypadá to, že jedete")
        if (g.speed >= P.RIDE_SPEED) { mem.stay = null; return blank({ ph: 'ask', k, tone: 'go', st: `Odjezd ${l.line} · jedete?`, sub: ['Podle polohy to vypadá na jízdu, za chvíli to poznám sám.'], lab: 'odjelo', big: '?', unit: '', btns: [{ id: 'on', label: 'Jedu' }, { id: 'off', label: 'Nejedu' }], flag }); }
        // still there (or walking off): it went without the visitor
        if (!mem.stay || mem.stay.k !== k) mem.stay = { k, since: now };
        const rest = P.STAY_SEC * wait - (now - mem.stay.since);
        if (rest <= 0) return lost(c, mem, ev, k, 'stay');
        return blank({ ph: 'ask', k, tone: 'miss', st: `Odjezd ${l.line} · jedete?`, sub: [`Stojíte u zastávky. Bez odpovědi za ${secs(rest)} ${c.next ? 'přejdu na další spoj' : 'to beru jako ujeté'}.`], lab: 'odjelo', big: '?', unit: '', btns: [{ id: 'on', label: 'Jedu' }, { id: 'off', label: 'Nejedu' }], flag, wait: rest });
      }
      // never got to the stop: it went without the visitor
      if (!mem.far || mem.far.k !== k) mem.far = { k, since: now };
      const rest = P.FAR_SEC * wait - (now - mem.far.since);
      if (rest <= 0) return lost(c, mem, ev, k, 'far');
      return blank({ ph: 'ask', k, tone: 'miss', st: `Odjezd ${l.line} · jedete?`, sub: [`K zastávce vám zbývalo ${Math.round(dStop / 10) * 10} m. Bez odpovědi za ${secs(rest)} ${c.next ? 'přejdu na další spoj' : 'to beru jako ujeté'}.`], lab: 'odjelo', big: '?', unit: '', btns: [{ id: 'on', label: 'Jedu' }, { id: 'off', label: 'Nejedu' }], flag, wait: rest });
    }
    // no position: the question; the first ride unanswered = not caught, a change unanswered = caught
    if (!mem.ask || mem.ask.k !== k) mem.ask = { k, since: now };
    const rest = (k === 0 ? P.ASK_SEC : P.ASK_CHANGE) * wait - (now - mem.ask.since);
    if (rest <= 0) {
      if (k === 0) return lost(c, mem, ev, k, 'silent');
      getOn(mem, k, 'quiet', now); ev.push('auto-on');
      return step(c, mem, ev);
    }
    const sub = k === 0 ? `Bez odpovědi ${rest > 55 ? `za ${span(rest)}` : `za ${secs(rest)}`} ${c.next ? 'přejdu na další spoj' : 'to beru jako ujeté'}.` : `Bez odpovědi to za ${secs(rest)} beru jako přestoupeno.`;
    return blank({ ph: 'ask', k, tone: 'miss', st: `Odjezd ${l.line} · jedete?`, sub: [sub], lab: 'odjelo', big: '?', unit: '', btns: [{ id: 'on', label: 'Jedu' }, { id: 'off', label: 'Nejedu' }], flag, wait: rest });
  }

  // a change: the ride in is late, the next one will not wait
  if (k > 0) {
    return blank(Object.assign({ ph: 'change', k, tone: 'go', st: inS < 60 ? 'Přestup teď' : `Přestup za ${span(inS)}`, sub: [{ b: [l.line, l.type] }, `${way} · ${stop} v ${hhmm(l.eDep)}`, inS <= 300 ? wave : '', w.sec > 60 ? ` · ${span(w.sec)} pěšky` : '', ...delay], lab: 'přestup za' }, big));
  }

  const head = [{ b: [l.line, l.type] }, `${way} v ${hhmm(l.eDep)} · ${stop}`];
  // who needs a low floor: the timetable promised it, but the very vehicle that comes is not (the live data say so)
  if (how.low && live && v.low === false && inS < 900) {
    return blank({ ph: 'not-low', k, tone: 'miss', st: 'Přijede vůz bez nízké podlahy', sub: [{ b: [l.line, l.type] }, ` v ${hhmm(l.eDep)} měl být nízkopodlažní, podle živých dat není.`, c.next ? ` Další spoj v ${hhmm(c.next.dep)}.` : ''], lab: 'schody', big: '!', unit: '', btns: c.next ? [{ id: 'next', label: 'Další spoj' }] : [], again: !c.next, flag: flagIn });
  }

  // at the stop (or the journey starts at one and no position says otherwise): the wait, with where the vehicle is
  if (near || (!w.sec && !g)) {
    const where = v && v.where ? ` · ${v.where}` : ` · v ${hhmm(l.eDep)}`;
    return blank(Object.assign({ ph: 'wait', k, tone: w.sec || inS <= 180 ? 'go' : 'calm', st: inS < 60 ? 'Nástup teď' : `${near && w.sec ? 'Jste na zastávce · nástup' : 'Nástup'} za ${span(inS)}`, sub: [{ b: [l.line, l.type] }, `${way} · ${stop}`, inS <= 300 ? wave : '', side ? ` · ${side}` : '', where, ...delay], lab: 'nástup za', flag: flagIn }, big));
  }

  // the walk to the stop, with the position: how far it still is and what pace catches the ride
  if (g) {
    const left = dStop * P.DETOUR, need = left / Math.max(1, inS - P.BOARD), setOut = inS - P.BOARD - left / WALK, moving = g.speed >= 0.7;
    const dist = ` · ${Math.round(dStop / 10) * 10} m`;
    const bigNow = moving ? Object.assign({ lab: 'nástup za' }, big) : { lab: 'vyjít', big: 'TEĎ', unit: '' }; // (not on the way yet: the square says to set out)
    if (setOut > 45 && !moving) return blank({ ph: 'leave', k, tone: setOut <= 120 ? 'go' : 'calm', st: `Vyjděte za ${span(setOut)}`, sub: [...head, ...delay], lab: 'vyjít za', flag: flagIn, ...bigOf(setOut) });
    if (need <= WALK * 1.15) return blank(Object.assign({ ph: 'walk', k, tone: 'go', st: moving ? `Jdete včas · nástup za ${span(inS)}` : 'Vyjděte teď', sub: [...head, dist, ...delay], flag: flagIn }, bigNow));
    if (need <= BRISK && how.hurry) return blank(Object.assign({ ph: 'walk-brisk', k, tone: 'go', st: moving ? 'Přidejte do kroku' : 'Vyjděte hned a přidejte do kroku', sub: [...head, dist, ` · nástup za ${span(inS)}`], flag: flagIn }, bigNow));
    if (need <= RUN && how.hurry) return blank(Object.assign({ ph: 'walk-run', k, tone: 'go', st: moving ? 'Běžte, stihnete to' : 'Když poběžíte, stihnete to', sub: [...head, dist, ` · nástup za ${span(inS)}`], flag: flagIn }, bigNow, moving ? { lab: 'běžte' } : {}));
    return blank({ ph: 'walk-lost', k, tone: 'miss', st: 'Tohle už nestihnete', sub: [...head, dist, c.next ? ` · další spoj v ${hhmm(c.next.dep)}` : ''], lab: 'nestihnete', big: '!', unit: '', btns: c.next ? [{ id: 'next', label: 'Další spoj' }] : [], again: !c.next, flag: flagIn });
  }

  // the walk to the stop by the clock alone: whether the visitor has set out is not known, so both are said
  const late = now - (l.eDep - w.sec);
  if (late < 0) { const inL = -late; return blank({ ph: 'leave', k, tone: inL <= 120 ? 'go' : 'calm', st: inL < 60 ? 'Vyjděte teď' : `Vyjděte za ${span(inL)}`, sub: [...head, ...delay], lab: 'vyjít za', flag: flagIn, ...(inL < 60 ? { big: 'TEĎ', unit: '' } : bigOf(inL)) }); }
  const need = w.m / Math.max(1, inS - P.BOARD);
  const hint = late < 45 ? '' : !how.hurry ? (need <= WALK * 1.15 ? '' : ' · kdo vychází až teď, už to nestihne') : need <= BRISK ? ' · vycházíte až teď? Přidejte do kroku' : need <= RUN ? ' · vycházíte až teď? Během to stihnete' : ' · kdo vychází až teď, už to nestihne';
  return blank(Object.assign({ ph: late < 45 ? 'leave' : need <= BRISK ? 'walk-brisk' : need <= RUN ? 'walk-run' : 'walk-late', k, tone: 'go', st: late < 45 ? 'Vyjděte teď' : inS < 60 ? 'Nástup teď' : `Nástup za ${span(inS)}`, sub: [{ b: [l.line, l.type] }, `${way} · ${stop}`, hint || ` · v ${hhmm(l.eDep)}`, ...delay], lab: 'nástup za', flag: flagIn }, big));
}

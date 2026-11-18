import { inMap } from './extent.js';

const PRAGUE_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }); // (YYYY-MM-DD; made once)
const WD_IN = ['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu'];
const WD_ON = ['neděli', 'pondělí', 'úterý', 'středu', 'čtvrtek', 'pátek', 'sobotu'];
const PART = [[/půlnoc/, 'kolem půlnoci'], [/nad ránem|ranních|ráno/, 'ráno'], [/dopoledn/, 'dopoledne'], [/odpoledn/, 'odpoledne'], [/poledn/, 'v poledne'], [/navečer|k večeru/, 'navečer'], [/večer/, 'večer'], [/noc|nočních/, 'v noci']];
const noonOf = day => Date.parse(`${day}T12:00:00Z`); // (a date without a time: its noon, safely inside the Prague day)
export const UDAL_WHO = { mpb: 'Strážníci', pcr: 'Policie ČR' };

// when an event happened, short: "včera večer", "v pátek 13. 11. ráno", "v noci na sobotu 14. 11." (now: the moment it
// is said at, so that "včera" is right)
export function udalKdy(o, now = Date.now()) {
  if (!o.day) return '';
  const t = noonOf(o.day), d = Math.round((t - noonOf(PRAGUE_DAY.format(new Date(now)))) / 864e5), w = (o.when || '').toLowerCase();
  const dt = new Date(t), wd = dt.getUTCDay(), dm = `${dt.getUTCDate()}. ${dt.getUTCMonth() + 1}.`;
  if (/^v noci na/.test(w)) return d === 0 ? 'dnes v noci' : d === -1 ? 'v noci na včerejšek' : `v noci na ${WD_ON[wd]} ${dm}`;
  const day = d === 0 ? 'dnes' : d === -1 ? 'včera' : `${WD_IN[wd]} ${dm}`;
  const p = (PART.find(([re]) => re.test(w.replace(/^ve? \S+/, ''))) || [])[1];
  return p ? `${day} ${p}` : day;
}

export function udalMsg(o, now = Date.now()) {
  const at = o.lon != null && inMap(+o.lon, +o.lat) ? [o.lon, o.lat] : null;
  const kdy = udalKdy(o, now), place = o.how === 'centrum' ? 'centrum' : o.place, media = o.media || [];
  return {
    id: `udalost:${o.id}`, src: o.src === 'pcr' ? 'policie' : 'straznici', ico: `k-${o.kind || 'jine'}`, end: o.pub, t: o.pub,
    title: o.title, sub: [UDAL_WHO[o.src] || 'Policie', kdy, place, media.length ? `píšou o tom ${media.length}×` : ''].filter(Boolean).join(' · '),
    ...(at ? { at } : {}), ref: { kind: 'udalost', id: o.id }, link: o.link,
    text: o.text, place: o.place, how: o.how, kdy, ...(media.length ? { media: media.map(({ n, title, link }) => ({ n, title, link })) } : {}),
  };
}

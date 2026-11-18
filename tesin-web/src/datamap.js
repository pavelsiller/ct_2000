import { shown } from './admin.js';
export const DATAMAPS = {
  hluk: {
    n: 'Hluk z dopravy',
    what: 'Celodenní hladina hluku Lden ze silnic, železnice a tramvají (strategická hluková mapa 2022). Budova má barvu nejhlučnějšího místa svého půdorysu.',
    source: 'Statutární město Brno, data.brno.cz, CC BY',
    // one entry per band value in the data (1..8: 50–54 … 85–89 dB), grouped into the classes of the legend
    classes: [
      { n: '50–54 dB', c: '#f7f0b4', v: [1] },
      { n: '55–59 dB', c: '#f2e68a', v: [2] },
      { n: '60–64 dB', c: '#f2b24d', v: [3] },
      { n: '65–69 dB', c: '#e8743b', v: [4] },
      { n: '70–74 dB', c: '#c8202a', v: [5] },
      { n: '75 dB a více', c: '#7a0f3a', v: [6, 7, 8] },
    ],
    label: v => (v >= 8 ? 'Lden 85 dB a více' : `Lden ${45 + 5 * v}–${49 + 5 * v} dB`),
    ground: true, // the raster is also drawn between the buildings when zoomed in
  },
  povoden: {
    n: 'Povodeň',
    what: 'Kam sahá pětiletá, dvacetiletá a stoletá voda Svratky, Svitavy a dalších toků podle stanovených záplavových území, a aktivní zóna, kde se nesmí stavět. Budova má barvu nejhorší vody, která dosáhne na její půdorys.',
    source: 'Statutární město Brno a Povodí Moravy, data.brno.cz, CC BY',
    classes: [
      { n: 'aktivní zóna', c: '#1f4e9c', v: [4] },
      { n: 'pětiletá voda (Q5)', c: '#3b7fd1', v: [3] },
      { n: 'dvacetiletá voda (Q20)', c: '#5fa8e6', v: [2] },
      { n: 'stoletá voda (Q100)', c: '#a6d2f2', v: [1] },
    ],
    label: v => ['', 'Stoletá voda (Q100)', 'Dvacetiletá voda (Q20)', 'Pětiletá voda (Q5)', 'Aktivní zóna záplavového území'][v] || '',
    ground: true,
  },
  hustota: {
    n: 'Hustota obyvatel',
    what: 'Obyvatelé s obvyklým pobytem podle sčítání 2021 na hektar základní sídelní jednotky (celé její plochy, i s ulicemi a parky). Všechny budovy jednotky mají její barvu; jednotky, kde nikdo nebydlí, zůstávají šedé.',
    source: 'Český statistický úřad (otevřená data sčítání 2021), hranice jednotek Statutární město Brno, CC BY',
    classes: [
      { n: 'do 10 obyvatel na hektar', c: '#f7e7a0', v: [1] },
      { n: '10–30', c: '#cfdc8a', v: [2] },
      { n: '30–60', c: '#8ec5a0', v: [3] },
      { n: '60–120', c: '#4fa3a0', v: [4] },
      { n: '120–200', c: '#2c6b9e', v: [5] },
      { n: 'nad 200', c: '#1e2f6b', v: [6] },
    ],
    label: v => ['', 'Do 10 obyvatel na hektar', '10–30 obyvatel na hektar', '30–60 obyvatel na hektar', '60–120 obyvatel na hektar', '120–200 obyvatel na hektar', 'Přes 200 obyvatel na hektar'][v] || '',
    ground: true,
  },
  vyuziti: {
    n: 'Co je v domě',
    what: 'Typ domu podle průzkumu budov 2018 až 2020, který zná využití každého podlaží: kde se jen bydlí, kde se bydlí nad obchodem nebo kanceláří, a co je v domech bez bytů. Domy, které průzkum nezná, zůstávají šedé.',
    source: 'Kancelář architekta města Brna, data.brno.cz, CC BY',
    classes: [
      { n: 'čistě bydlení', c: '#e9b84a', v: [1] },
      { n: 'bydlení nad obchodem či kanceláří', c: '#e8743b', v: [2] },
      { n: 'obchody, služby, hospody, hotely', c: '#d8342c', v: [3] },
      { n: 'kanceláře a veřejné budovy', c: '#3b6fb6', v: [4] },
      { n: 'výroba, sklady, technika', c: '#20a4a0', v: [5] },
      { n: 'garáže, chaty, zahradní domky', c: '#93c96a', v: [6] },
      { n: 'prázdné, bez využití', c: '#1b1f2a', v: [7] },
    ],
    label: v => ['', 'Čistě bydlení', 'Bydlení v patrech, dole obchod, hospoda nebo kancelář', 'Obchody, služby, hospody, hotely (bez bytů)', 'Kanceláře, úřady a veřejné budovy (školství, zdravotnictví, kultura, sport)', 'Výroba, sklady, technika', 'Garáž, chata nebo zahradní domek', 'Prázdné, bez využití'][v] || '',
    ground: false, // the roofs only; the raster stands in for them when zoomed out
  },
  ...Object.fromEntries([
    ['vloupani', 'Vloupání', 'Vloupání do bytů, domů, sklepů, garáží, obchodů a dalších objektů', [2, 5, 10, 20, 50]],
    ['kradeze', 'Krádeže', 'Krádeže bez vloupání: věci z aut, auta, kola, kapsáři, krádeže v obchodech a další', [5, 10, 25, 50, 150]],
    ['nasili', 'Násilí', 'Násilná trestná činnost: loupeže, ublížení na zdraví, rvačky, výtržnictví, vyhrožování', [1, 2, 5, 10, 25]],
  ].map(([k, n, what, edges]) => {
    const names = [`do ${edges[0]}`, ...edges.slice(0, -1).map((e, i) => `${e}–${edges[i + 1]}`), `nad ${edges[edges.length - 1]}`];
    return [k, {
      n,
      part: 'kriminalita',
      what: `${what} podle otevřených dat Policie ČR: případy za posledních 5 let, ročně na km² oblasti. Policie zveřejňuje polohu jen zhruba (každý případ posune doprostřed své oblasti), proto mají všechny domy oblasti stejnou barvu.`,
      source: 'Policie České republiky (mapa kriminality, CC BY 4.0)',
      classes: ['#ffffb2', '#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'].map((c, i) => ({ n: i ? `${names[i]}` : `${names[0]} případů ročně na km²`, c, v: [i + 1] })),
      label: v => (v ? `${n}: ${names[v - 1]} případů ročně na km²` : ''),
      ground: true,
      crime: k,
      edges,
    }];
  })),
  ...Object.fromEntries([
    ['bezpeci', 'Necítím se tu bezpečně', 'se tu necítí bezpečně', 'Kde se lidé necítí bezpečně', ['#fdd36a', '#fca048', '#f2652e', '#d1262b', '#8e0f2e']],
    ['oblibena', 'Oblíbená místa', 'tu tráví volný čas nebo sem vodí návštěvy', 'Kde lidé tráví volný čas a kam vodí návštěvy odjinud (obě otázky dohromady, kdo odpověděl na obě, se počítá jednou)', ['#b9e3a5', '#7fcc9a', '#3fae99', '#1d8291', '#16507a']],
    ['lepsi', 'Změnilo se k lepšímu', 'tu vidí změnu k lepšímu', 'Kde se to podle lidí v poslední době proměnilo k lepšímu', ['#b9e3a5', '#7fcc9a', '#3fae99', '#1d8291', '#16507a']],
    ['nelibi', 'Nelíbí se mi to', 'se tu nelíbí a chtěli by změnu', 'Kde se lidem nelíbí a zasloužilo by si to změnu', ['#fdd36a', '#fca048', '#f2652e', '#d1262b', '#8e0f2e']],
  ].map(([k, n, verb, what, colours]) => {
    const names = ['2–3 lidé', '4–7 lidí', '8–15 lidí', '16–31 lidí', '32 a více lidí'];
    return [k, {
      n,
      part: 'pocitova',
      what: `${what} podle Pocitové mapy Brna 2025 (anketa města od května do října 2025, každý mohl označit až 5 míst). Počítají se lidé, ne body: místo má barvu podle toho, kolik různých lidí dalo bod do 70 m od něj; místo jediného člověka zůstává šedé. Anketa není reprezentativní, odpovídal, kdo chtěl.`,
      source: 'Statutární město Brno, Pocitová mapa Brna 2025 (data.brno.cz, CC BY)',
      classes: colours.map((c, i) => ({ n: i ? names[i] : `${names[0]} z ankety`, c, v: [i + 1] })),
      label: v => (v ? `${names[v - 1]} z ankety ${verb}` : ''),
      ground: true,
      alt: k === 'bezpeci' ? ['strach', 'Srovnat s kriminalitou'] : null,
    }];
  })),
  strach: {
    n: 'Strach a kriminalita',
    part: 'pocitova',
    alt: ['bezpeci', 'Ukázat jen pocitovou mapu'],
    what: 'Pocitová mapa 2025 (Na tomto místě se necítím bezpečně) proti kriminalitě podle Policie ČR (vloupání, krádeže a násilí 2016–2025), po oblastech policie. Bojí se: aspoň 5 lidí z ankety dalo bod do oblasti. Hodně případů: oblast patří do třetiny oblastí s nejvíc případy, počtem i na km². Strach tam, kde policie eviduje málo, nemusí být bez důvodu: lidé píšou hlavně o lidech pod vlivem, obtěžování a tmě, a to se do statistiky trestných činů často nedostane.',
    source: 'Statutární město Brno (Pocitová mapa Brna 2025, data.brno.cz, CC BY) a Policie České republiky (mapa kriminality, CC BY 4.0)',
    classes: [
      { n: 'strach, málo případů', c: '#3b6fb6', v: [1] },
      { n: 'strach i hodně případů', c: '#7b3fa0', v: [2] },
      { n: 'hodně případů bez strachu', c: '#f08a24', v: [3] },
    ],
    label: v => ['', 'Lidé se tu bojí, policie tu eviduje méně případů', 'Lidé se tu bojí a policie tu eviduje hodně případů', 'Policie tu eviduje hodně případů, skoro nikdo se tu nebojí'][v] || '',
    ground: true,
    fear: true,
    // the legend as a table of the two data: rows the survey, columns the police; cells = index of the class (-1 grey)
    matrix: {
      intro: 'Spojuje dvoje data: strach z ankety města (Pocitová mapa 2025) a případy, které eviduje Policie ČR (2016–2025).',
      rows: ['Anketa: bojí se', 'skoro nikdo se nebojí'],
      cols: ['Policie: méně případů', 'hodně případů'],
      cells: [[0, 1], [-1, 2]],
    },
  },
  ...Object.fromEntries([
    ['nehody', 'Všechny nehody', 'nehod', 5, 'Všechny dopravní nehody, které evidovala Policie ČR (i ty jen s plechovou škodou)', [2, 4, 7, 12, 20], ['#fcd9a8', '#f9a65a', '#ec6a3c', '#c8202a', '#6e0b2e']],
    ['zraneni', 'Nehody se zraněním', 'nehod se zraněním', 10, 'Dopravní nehody, při kterých byl někdo zraněn nebo zemřel', [2, 3, 5, 9, 15], ['#fcd9a8', '#f9a65a', '#ec6a3c', '#c8202a', '#6e0b2e']],
    ['chodci', 'Chodci a cyklisté', 'nehod s chodcem či cyklistou', 10, 'Dopravní nehody, při kterých byl účastníkem chodec nebo cyklista', [2, 3, 5, 8, 12], ['#d9cdf2', '#b39be0', '#8a62c9', '#5f2d9e', '#36106b']],
  ].map(([k, n, noun, years, what, edges, colours]) => {
    const names = edges.map((e, i) => (i === edges.length - 1 ? `${e} a více` : edges[i + 1] - 1 === e ? `${e}` : `${e}–${edges[i + 1] - 1}`));
    // 2, 3–4, 2–3 nehody; 4–6, 5 a více nehod
    const word = i => (i < edges.length - 1 && edges[i + 1] - 1 <= 4 ? noun.replace(/^nehod/, 'nehody') : noun);
    return [k, {
      n,
      part: 'nehody',
      row: 'Nehody v okolí',
      what: `${what}. Ulice má barvu podle toho, kolik takových nehod se za posledních ${years} celých let stalo do 40 m od místa; místo jediné nehody zůstává šedé. Polohu nehody zapisuje policista na místě, u křižovatek bývá posunutá o pár metrů.`,
      source: 'Policie ČR (statistiky dopravní nehodovosti, policie.gov.cz), roky do 2022 přes otevřená data Statutárního města Brna (data.brno.cz, CC BY)',
      classes: colours.map((c, i) => ({ n: i ? `${names[i]}` : `${names[0]} ${word(0)} do 40 m za ${years} let`, c, v: [i + 1] })),
      // a sum over the whole window, not a yearly figure ("2–3 nehody … za 5 let dohromady")
      count: v => (v ? `${names[v - 1]} ${word(v - 1)}` : ''), years,
      label: v => (v ? `${names[v - 1]} ${word(v - 1)} do 40 m za posledních ${years} let dohromady` : ''),
      ground: true,
      streets: true, // painted on the streets only: no roofs, the ground stronger when zoomed in, the value under the cursor from the ground
    }];
  })),
};
const CELL = 16;
const ROOF_ALPHA = 0.72, GROUND_ALPHA = 0.33, FAR_ALPHA = 0.82, STREET_ALPHA = 0.7; // STREET_ALPHA: the ground of a map on the streets, zoomed in
const Z_NEAR = 0.5, Z_FAR = 0.8; // between them the raster fades to the ground tint and the roofs appear

export function createDatamap({ base, rotation, GEO, chunk, CH, canvasSize }) {
  let key = null, def = null, lit = []; // lit: which classes of the legend are shown (one per class, at least one true)
  let img = null, raster = null, cls = null, loadTicket = 0; // img: the ground raster as loaded; raster: recoloured; cls: bands per chunk
  let values = null, rw = 0, rh = 0; // the band value per cell, for the label under the cursor
  let origin = [0, 0]; // map image px of the top left corner of the raster (a map on the streets: of its cells)
  // a map on the streets (def.streets): its coloured cells as runs [y, x, length, band] (cells of scell px, from origin),
  // rowAt[y] = index of the first run of row y; zoomed out a small raster of FAR_CELL px is made from them
  let runs = null, rowAt = null, scell = 4, sh = 0;
  const FAR_CELL = 16;
  const cache = document.createElement('canvas'); // the roofs of the current view (drawn only when the view changes)
  let cacheKey = '', cacheAt = [0, 0], cacheM = 0, cacheK = 0, cacheT = 0;
  const MARGIN = 192; // css px of roofs drawn beyond the screen on every side (a pan only moves the cache)
  const dm = { listeners: [] };

  const hex = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const classOf = v => (def ? def.classes.findIndex(c => c.v.includes(v)) : -1);
  const lut = () => { const t = new Int8Array(16).fill(-1); def.classes.forEach((c, i) => c.v.forEach(v => (t[v] = i))); return t; };

  // the ground raster recoloured with the palette (a faint grey for the classes that are not lit). The band values are
  // read from the image once; a colour is one 32-bit write per cell (the streets maps have 6.6 M cells)
  function recolour() {
    const w = img.width, h = img.height;
    if (!values) {
      const r = document.createElement('canvas'); r.width = w; r.height = h;
      const rg = r.getContext('2d', { willReadFrequently: true });
      rg.drawImage(img, 0, 0);
      const d = rg.getImageData(0, 0, w, h).data;
      values = new Uint8Array(w * h); rw = w; rh = h;
      for (let i = 0, p = 0; i < d.length; i += 4, p++) values[p] = d[i];
    }
    const t = lut(), rgba = new Uint32Array(256), le = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
    const pack = (r, g, b, a) => (le ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0);
    for (let v = 1; v < 16; v++) {
      const k = t[v];
      if (k < 0) continue;
      if (!lit[k]) { rgba[v] = pack(110, 116, 128, 70); continue; }
      const n = parseInt(def.classes[k].c.slice(1), 16);
      rgba[v] = pack(n >> 16, (n >> 8) & 255, n & 255, 255);
    }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const id = g.createImageData(w, h), px = new Uint32Array(id.data.buffer);
    for (let p = 0; p < values.length; p++) { const v = values[p]; if (v) px[p] = rgba[v]; }
    g.putImageData(id, 0, 0);
    return c;
  }

  // the small raster of a map on the streets, for zoomed out: the highest band of every FAR_CELL px block
  function farRaster() {
    const f = FAR_CELL / scell, fw = Math.ceil(runs.w / f), fh = Math.ceil(sh / f), vals = new Uint8Array(fw * fh);
    for (let q = 0; q < runs.length; q += 4) {
      const row = ((runs[q] / f) | 0) * fw, b = runs[q + 3];
      for (let x = runs[q + 1], e = x + runs[q + 2]; x < e; x++) { const i = row + ((x / f) | 0); if (b > vals[i]) vals[i] = b; }
    }
    const t = lut(), c = document.createElement('canvas'); c.width = fw; c.height = fh;
    const g = c.getContext('2d'), id = g.createImageData(fw, fh), d = id.data;
    const rgb = def.classes.map(k => { const n = parseInt(k.c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; });
    for (let i = 0; i < vals.length; i++) {
      const k = vals[i] ? t[vals[i]] : -1;
      if (k < 0) continue;
      if (!lit[k]) { d[4 * i] = 110; d[4 * i + 1] = 116; d[4 * i + 2] = 128; d[4 * i + 3] = 70; continue; }
      d[4 * i] = rgb[k][0]; d[4 * i + 1] = rgb[k][1]; d[4 * i + 2] = rgb[k][2]; d[4 * i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  function parseRuns(d) {
    let n = 0; for (const r of d.rows) n += (r.length - 1) / 3;
    const R = new Int32Array(4 * n), at = new Int32Array(d.h + 1);
    R.w = d.w;
    let q = 0, y = 0;
    for (const r of d.rows) {
      for (; y <= r[0]; y++) at[y] = q;
      for (let i = 1, end = 0; i < r.length; i += 3) { const x = end + r[i]; R[q++] = r[0]; R[q++] = x; R[q++] = r[i + 1]; R[q++] = r[i + 2]; end = x + r[i + 1]; }
    }
    for (; y <= d.h; y++) at[y] = q;
    return { runs: R, rowAt: at, cell: d.cell || 4, h: d.h, origin: d.origin || [0, 0] };
  }
  function loadRuns(d) { const p = parseRuns(d); runs = p.runs; rowAt = p.rowAt; scell = p.cell; sh = p.h; }
  // the highest band of a map on the streets within `reach` cells of an image point (the card of an accident: what
  // the statistics say about the place), whether that map is shown or not; 0 = no coloured street there
  const parsed = new Map();
  dm.streetBand = async (k, X, Y, reach = 3) => {
    const pk = `${rotation()}|${k}`;
    if (!parsed.has(pk)) parsed.set(pk, loadFile(k).then(d => (d && d.rows ? parseRuns(d) : null)));
    const p = await parsed.get(pk);
    if (!p) return 0;
    const cx = Math.floor((X - p.origin[0]) / p.cell), cy = Math.floor((Y - p.origin[1]) / p.cell);
    let best = 0;
    for (let y = Math.max(0, cy - reach); y <= Math.min(p.h - 1, cy + reach); y++)
      for (let q = p.rowAt[y]; q < p.rowAt[y + 1]; q += 4) if (cx + reach >= p.runs[q + 1] && cx - reach < p.runs[q + 1] + p.runs[q + 2] && p.runs[q + 3] > best) best = p.runs[q + 3];
    return best;
  };

  dm.set = k => {
    key = DATAMAPS[k] ? k : null; def = key ? DATAMAPS[key] : null; lit = def ? def.classes.map(() => true) : [];
    img = null; raster = null; cls = null; values = null; runs = null; cacheKey = '';
    const ticket = ++loadTicket;
    if (!key) { dm.changed(); return; }
    if (def.fear && !fearNums) Promise.all([dm.fear(), dm.crime(), json('kriminalita-cell.json')]).then(([p, d, c]) => { if (p && d && c) fearNums = { p, d, c }; });
    if (!def.streets) {
      const im = new Image();
      im.onload = () => { if (ticket === loadTicket) { img = im; raster = recolour(); cacheKey = ''; dm.changed(); } };
      im.onerror = () => { if (ticket === loadTicket) console.warn(`data/r${rotation()}/dm/${key}.png: missing`); };
      im.src = `${base}data/r${rotation()}/dm/${key}.png`;
    }
    origin = null; // (until the file says where the raster lies)
    loadFile(key).then(d => {
      if (ticket !== loadTicket || !d) return;
      cls = d.cls; origin = d.origin || [0, 0]; dm.updated = d.updated;
      if (def.streets && d.rows) { loadRuns(d); raster = farRaster(); }
      cacheKey = ''; dm.changed();
    });
    dm.changed();
  };
  dm.key = () => key;
  dm.def = () => def;
  // the classes shown: switch one on or off (the last lit one stays), one alone, or all of them
  // (the legend changes at once, the map after the next frame: recolouring the raster is the heavy part of the click)
  let relightT = 0;
  const relight = () => { cacheKey = ''; dm.changed(); cancelAnimationFrame(relightT); relightT = requestAnimationFrame(() => setTimeout(() => { if (runs) raster = farRaster(); else if (img) raster = recolour(); cacheKey = ''; dm.changed(); }, 0)); };
  dm.lit = () => lit.slice();
  dm.toggle = i => { if (lit[i] && lit.filter(Boolean).length < 2) return false; lit[i] = !lit[i]; relight(); return true; };
  dm.solo = i => { lit = lit.map((_, j) => j === i); relight(); };
  dm.all = () => { lit = lit.map(() => true); relight(); };
  dm.onChange = f => dm.listeners.push(f);
  dm.changed = () => dm.listeners.forEach(f => f());
  dm.refresh = () => { cacheKey = ''; dm.changed(); }; // (the building outlines changed: Klidná mapa lowered or raised them)

  // the band of an image point (from the raster) or of a building (b = entry of a chunk, i = its index there)
  dm.valueAt = (X, Y) => {
    if (runs && origin) { // a map on the streets: the run of the row under the point
      const cx = Math.floor((X - origin[0]) / scell), cy = Math.floor((Y - origin[1]) / scell);
      if (cy < 0 || cy >= sh) return 0;
      for (let q = rowAt[cy]; q < rowAt[cy + 1]; q += 4) if (cx >= runs[q + 1] && cx < runs[q + 1] + runs[q + 2]) return runs[q + 3];
      return 0;
    }
    if (!values || !origin) return 0; const C = def.cell || CELL, cx = Math.floor((X - origin[0]) / C), cy = Math.floor((Y - origin[1]) / C); return cx < 0 || cy < 0 || cx >= rw || cy >= rh ? 0 : values[cy * rw + cx]; };
  dm.valueOf = (ckey, i) => (cls && cls[ckey] ? cls[ckey][i] || 0 : 0);
  dm.text = v => (def && v ? def.label(v) : '');
  dm.classOf = classOf;

  function roofs(ctx, v, cw, ch) {
    if (!cls) return;
    const x0 = Math.floor(-v.ox / v.k / CH) - 1, x1 = Math.floor((cw - v.ox) / v.k / CH) + 1;
    const y0 = Math.floor(-v.oy / v.k / CH) - 1, y1 = Math.floor((ch - v.oy) / v.k / CH) + 1;
    const colours = def.classes.map((k, i) => (!lit[i] ? ['rgba(110,116,128,0.35)', 'rgba(70,76,90,0.6)'] : [hex(k.c, ROOF_ALPHA), hex(k.c, 0.95)]));
    const t = lut();
    ctx.lineWidth = 1;
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const ck = `${cx}_${cy}`, list = chunk(cx, cy), bands = cls[ck];
      if (!list || !bands) continue;
      for (let i = 0; i < list.length; i++) {
        const k = bands[i] ? t[bands[i]] : -1;
        if (k < 0) continue;
        const p = list[i][0];
        const px0 = v.ox + p[0] * v.k, py0 = v.oy + p[1] * v.k;
        if (px0 < -400 || py0 < -400 || px0 > cw + 400 || py0 > ch + 400) continue;
        ctx.beginPath();
        for (let j = 0; j < p.length; j += 2) { const sx = v.ox + p[j] * v.k, sy = v.oy + p[j + 1] * v.k; j ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }
        ctx.closePath();
        ctx.fillStyle = colours[k][0]; ctx.fill();
        ctx.strokeStyle = colours[k][1]; ctx.stroke();
      }
    }
  }

  // a map on the streets zoomed in: its cells in the view, a rectangle per run, one fill per class (edges rounded to whole
  // px, so the rows meet without seams)
  function streetCells(g, v, cw, ch) {
    if (!runs) return;
    const s = scell * v.k, ox = v.ox + origin[0] * v.k, oy = v.oy + origin[1] * v.k;
    const y0 = Math.max(0, Math.floor(-oy / s)), y1 = Math.min(sh - 1, Math.floor((ch - oy) / s)), x0 = Math.floor(-ox / s), x1 = Math.floor((cw - ox) / s);
    const t = lut();
    def.classes.forEach((c, ci) => {
      g.fillStyle = lit[ci] ? c.c : 'rgba(110,116,128,0.27)';
      g.beginPath();
      for (let y = y0; y <= y1; y++) {
        const sy = Math.round(oy + y * s), ey = Math.round(oy + (y + 1) * s);
        for (let q = rowAt[y]; q < rowAt[y + 1]; q += 4) {
          const xs = runs[q + 1], xe = xs + runs[q + 2];
          if (xe < x0 || xs > x1 || t[runs[q + 3]] !== ci) continue;
          const sx = Math.round(ox + xs * s);
          g.rect(sx, sy, Math.round(ox + xe * s) - sx, ey - sy);
        }
      }
      g.fill();
    });
  }

  // drawn under the traffic and the people (fx.under)
  dm.draw = (ctx, v) => {
    if (!key) return;
    const { cw, ch, dpr } = canvasSize();
    const near = Math.max(0, Math.min(1, (v.z - Z_NEAR) / (Z_FAR - Z_NEAR))); // 0 zoomed out … 1 zoomed in
    if (raster && origin) {
      // (a map on the streets: the small raster only zoomed out, near its cells from the cache below take over)
      const a = def.streets ? FAR_ALPHA * (1 - near) : FAR_ALPHA + (def.ground ? (GROUND_ALPHA - FAR_ALPHA) * near : -FAR_ALPHA * near);
      if (a > 0.01) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = a;
        const C = def.streets ? FAR_CELL : def.cell || CELL;
        ctx.drawImage(raster, v.ox + origin[0] * v.k, v.oy + origin[1] * v.k, raster.width * C * v.k, raster.height * C * v.k);
        ctx.restore();
      }
    }
    if (near <= 0 || (def.streets ? !runs : !cls)) return;
    // the roofs: thousands of polygons, so they are drawn into a cache with a margin of MARGIN px all round, and a pan only
    // moves the cache (by whole device pixels); drawn again when the zoom, the classes, the files or the size change, or
    // when the view has moved past the margin. (It used to be drawn again at every frame of a pan: ~2.5 ms a frame.)
    // (while zooming the roofs are drawn anew at every frame anyway: then without the margin, the smaller area)
    const now = performance.now(), sameK = Math.abs(v.k / (cacheK || 1) - 1) < 1e-6, zooming = !sameK && now - cacheT < 150; // (k carries float noise during a pan)
    let M = cacheM;
    let loaded = 0;
    const MM = MARGIN, x0 = Math.floor((-v.ox - MM) / v.k / CH) - 1, x1 = Math.floor((cw + MM - v.ox) / v.k / CH) + 1, y0 = Math.floor((-v.oy - MM) / v.k / CH) - 1, y1 = Math.floor((ch + MM - v.oy) / v.k / CH) + 1;
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) if (chunk(cx, cy)) loaded++;
    const k = `${key}|${lit.map(Number).join('')}|${cw}x${ch}@${dpr}|${loaded}`;
    if (k !== cacheKey || !sameK || Math.abs(v.ox - cacheAt[0]) > Math.max(0, M - 16) || Math.abs(v.oy - cacheAt[1]) > Math.max(0, M - 16)) {
      M = zooming ? 0 : MARGIN;
      cacheKey = k; cacheAt = [v.ox, v.oy]; cacheM = M; cacheK = v.k; cacheT = now;
      const W2 = cw + 2 * M, H2 = ch + 2 * M;
      // (the canvas always has the size with the margin: without it only its corner is used, never a new canvas)
      const CW = Math.round((cw + 2 * MARGIN) * dpr), CHh = Math.round((ch + 2 * MARGIN) * dpr);
      if (cache.width !== CW || cache.height !== CHh) { cache.width = CW; cache.height = CHh; }
      const g = cache.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W2, H2);
      (def.streets ? streetCells : roofs)(g, { ...v, ox: v.ox + M, oy: v.oy + M }, W2, H2);
    }
    const W2 = cw + 2 * M, H2 = ch + 2 * M;
    const dx = Math.round((v.ox - cacheAt[0]) * dpr) / dpr - M, dy = Math.round((v.oy - cacheAt[1]) * dpr) / dpr - M;
    ctx.save();
    ctx.globalAlpha = near * (def.streets ? STREET_ALPHA : 1);
    ctx.drawImage(cache, 0, 0, Math.round(W2 * dpr), Math.round(H2 * dpr), dx, dy, W2, H2);
    ctx.restore();
  };

  // ---- for the cards: the bands of a building in every map (the files load when first asked for)
  // the files of the maps (one a map, about 300 KB each), fetched once and shared by the map shown and the cards
  const files = new Map();
  const loadFile = k => { const fk = `${rotation()}|${k}`; if (!files.has(fk)) files.set(fk, fetch(`${base}data/r${rotation()}/dm/${k}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null)); return files.get(fk); };
  const loadCls = k => loadFile(k).then(d => (d ? d.cls : null));
  // rows [name of the map, text] for the building i of the chunk ckey: of the map `only` (the one shown, its file is here
  // already), or of every map that knows the building
  dm.describe = async (ckey, i, only = null) => {
    const rows = [];
    for (const [k, d] of Object.entries(DATAMAPS)) {
      if (only && k !== only) continue;
      if (d.part && !shown(d.part)) continue;
      if (d.streets) continue; // (a map of the streets says nothing about the house itself)
      if (d.crime) { const t = await crimeText(d.crime, ckey, i); if (t) rows.push([`${d.n} v okolí`, t]); continue; }
      if (d.fear) { const t = await fearText(ckey, i); if (t) rows.push([`${d.n} v okolí`, t]); continue; }
      const c = await loadCls(k);
      const v = c && c[ckey] ? c[ckey][i] || 0 : 0;
      const t = v ? d.label(v) : k === 'hluk' ? 'pod 50 dB' : k === 'povoden' ? 'mimo záplavové území' : '';
      if (t) rows.push([d.row || d.n, t]);
    }
    return rows;
  };
  // kriminalita: the numbers (kriminalita.json: cells [ha, cases per key…], quarters, Brno) and the cell of every
  // building (kriminalita-cell.json, cell + 1), both loaded when first asked for
  const json = name => { const fk = `${rotation()}|${name}`; if (!files.has(fk)) files.set(fk, fetch(`${base}data/r${rotation()}/dm/${name}`).then(r => (r.ok ? r.json() : null)).catch(() => null)); return files.get(fk); };
  dm.crime = () => json('kriminalita.json');
  const num = x => x.toLocaleString('cs-CZ', { maximumFractionDigits: x < 10 ? 1 : 0 });
  dm.crimeNum = num;
  async function crimeText(k, ckey, i) {
    const [d, c] = await Promise.all([dm.crime(), json('kriminalita-cell.json')]);
    const cell = d && c && c.cell[ckey] ? c.cell[ckey][i] || 0 : 0;
    if (!cell) return '';
    const [ha, ...n] = d.cells[cell - 1], cases = n[d.keys.indexOf(k)];
    const rate = ha ? cases / d.years / (ha / 100) : 0;
    return `${num(rate)} ročně na km², průměr Brna ${num(d.avg[k])} (${cases.toLocaleString('cs-CZ')} za ${d.years} let v oblasti policie o ${num(ha)} ha)`;
  }
  // the comparison: the people afraid and the cases in the area of the police around the building (pocitova.json, the
  // cells in the order of kriminalita.json)
  dm.fear = () => json('pocitova.json');
  dm.accidents = () => json('nehodovost.json');
  // [people afraid, cases] in the area of the police around the building, once the files are here (the cursor chip)
  let fearNums = null;
  dm.fearAt = (ckey, i) => {
    if (!fearNums) return null;
    const cell = fearNums.c.cell[ckey] ? fearNums.c.cell[ckey][i] || 0 : 0;
    return cell && fearNums.p.cells[cell - 1] ? fearNums.p.cells[cell - 1] : null;
  };
  async function fearText(ckey, i) {
    const [p, d, c] = await Promise.all([dm.fear(), dm.crime(), json('kriminalita-cell.json')]);
    const cell = p && d && c && c.cell[ckey] ? c.cell[ckey][i] || 0 : 0;
    if (!cell || !p.cells[cell - 1]) return '';
    const [f, n] = p.cells[cell - 1], people = f === 1 ? 'člověk' : f >= 2 && f <= 4 ? 'lidé' : 'lidí';
    return `${f.toLocaleString('cs-CZ')} ${people} z ankety se tu necítí bezpečně; policie tu za ${p.crime.from}–${p.crime.to} eviduje ${n.toLocaleString('cs-CZ')} vloupání, krádeží a násilných činů (oblast policie o ${num(d.cells[cell - 1][0])} ha)`;
  }
  // the quarters (cadastral units) with their statistics: the one around an image point
  let areasP = null;
  const inRing = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { if ((r[i + 1] > y) !== (r[j + 1] > y) && x < ((r[j] - r[i]) * (y - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; } return c; };
  dm.areaAt = async (X, Y) => {
    if (!areasP) areasP = fetch(`${base}data/r${rotation()}/dm/areas.json`).then(r => (r.ok ? r.json() : null)).then(d => (d ? d.areas : [])).catch(() => []);
    const areas = await areasP;
    return areas.find(a => X >= a.bb[0] && X <= a.bb[2] && Y >= a.bb[1] && Y <= a.bb[3] && a.rings.reduce((c, r) => c ^ inRing(r, X, Y), 0)) || null;
  };
  return dm;
}

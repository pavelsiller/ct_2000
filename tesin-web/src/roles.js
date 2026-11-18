export const ROLES = [
  { key: 'ridic', name: 'Řidič', icon: 'car', desc: 'kolony a nehody, uzavírky, výkopy, parkovací domy, blokové čištění, havárie a odstávky vody, webkamery, meteostanice a vozidla MHD',
    on: ['mhd', 'jams', 'closures', 'works', 'parking', 'clean', 'voda', 'cams', 'meteo'] },
  { key: 'mhd', name: 'Jezdím MHD', icon: 'tram', desc: 'vozidla MHD živě, zastávky s odjezdy, výluky a odklony a kolony, ve kterých stojí i autobusy',
    on: ['mhd', 'mhdStops', 'mhdOutages', 'jams', 'stin'] },
  { key: 'deti', name: 'Ven s dětmi', icon: 'family', desc: 'akce dnes a tento týden, kašny a sochy, ovzduší, teploty a MHD se zastávkami',
    on: ['mhd', 'events', 'smArt', 'air', 'meteo', 'mhdStops', 'smPool', 'pitka', 'wc'], events: 'tw' },
  { key: 'deje', name: 'Co se děje', icon: 'news', desc: 'výjezdy hasičů, policie, havárie a odstávky vody, blokové čištění, kolony a nehody, vozidla a výluky MHD, dnešní akce a ovzduší',
    on: ['mhd', 'hasici', 'policie', 'voda', 'clean', 'jams', 'mhdOutages', 'events', 'paro', 'air'], events: 't' },
  { key: 'stavar', name: 'Stavař', icon: 'helmet', desc: 'výstavba, plánované projekty města i soukromé, velké dopravní záměry, výkopy, uzavírky, památky a fotky z ulice',
    on: ['building', 'planCity', 'planPrivate', 'bigplans', 'works', 'closures', 'paro', 'monuments', 'pano'] },
  { key: 'poznavam', name: 'Poznávám Brno', icon: 'bust', desc: 'názvy míst, kulturní památky, sochy, pamětní desky, kameny zmizelých, kříže, památné stromy, fotky z ulice a vozidla MHD',
    on: ['mhd', 'names', 'monuments', 'smArt', 'smPlaque', 'smStolper', 'smCross', 'smTree', 'smView', 'pano', 'pitka', 'wc'] },
  { key: 'cista', name: 'Čistá mapa', icon: 'block', desc: 'jen samotná mapa bez značek; auta, lidé a popisky zůstanou', on: [] },
];
// the section Mapa: the look of the map, which no role touches
export const ROLE_KEEP = new Set(['klid', 'labels', 'traffic', 'hover', 'people']); // (klid: Klidná mapa is the look of the map too)

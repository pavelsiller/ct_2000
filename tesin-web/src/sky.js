// Weather codes (WMO, as Open-Meteo sends them) as an icon, a Czech word and the map's weather kind.
// (A small module of its own: the page needs ICON at start, the forecast panel loads later.)
export const ICON = (c, day = 1) => (c === 0 ? (day ? '☀️' : '🌙') : c <= 2 ? (day ? '⛅' : '☁️') : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : c <= 82 ? '🌦️' : c <= 86 ? '🌨️' : '⛈️');
export const SKY = c => (c === 0 ? 'jasno' : c <= 2 ? 'polojasno' : c === 3 ? 'zataženo' : c <= 48 ? 'mlha' : c <= 57 ? 'mrholení' : c <= 67 ? 'déšť' : c <= 77 ? 'sněžení' : c <= 82 ? 'přeháňky' : c <= 86 ? 'sněhové přeháňky' : 'bouřky');
// the map's weather for a forecast hour
export const kindOf = (code, snow, precip, vis) => (code === 45 || code === 48 || (vis && vis < 1000) ? 'fog' : snow > 0 || (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : precip > 0 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 ? 'rain' : 'clear');

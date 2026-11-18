// FNV-1a over the UTF-8 bytes of the address, two passes with different seeds: 12 hex characters (48 bits)
export function picKey(url) {
  let a = 0x811c9dc5, b = 0x050c5d1f;
  for (let i = 0; i < url.length; i++) {
    let c = url.charCodeAt(i);
    // UTF-8 split of non-ASCII characters, so the key is the same in node and in the browser
    const bytes = c < 0x80 ? [c] : c < 0x800 ? [0xc0 | (c >> 6), 0x80 | (c & 63)] : [0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)];
    for (const x of bytes) { a = Math.imul(a ^ x, 0x01000193) >>> 0; b = Math.imul(b ^ x, 0x01000193) >>> 0; }
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0').slice(0, 4);
}

// the canonical address of a Wikimedia Commons file (the width is part of the key: one key per picture)
export const commonsFile = (name, w = 1600) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${w}`;
// Wikipedia lead photos come as a ~500 px thumbnail (data/wiki.json): the key is that address, downloaded is the 1280 px one
export const wikiLarge = u => u.replace(/\/\d+px-/, '/1280px-').replace(/\?.*$/, '');

const LINK_ONLY = ['gotobrno.cz', 'googleusercontent.com'];
export function linkOnly(url) {
  try { const h = new URL(url).hostname; return LINK_ONLY.some(d => h === d || h.endsWith(`.${d}`)); } catch { return true; }
}
export const isUrl = u => /^https?:\/\//i.test(u || '');
export const picBase = (src, key) => `img/${src}/${key}`;

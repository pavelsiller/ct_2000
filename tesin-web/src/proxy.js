export const PROXY = (import.meta.env.VITE_PROXY_BASE || '').trim().replace(/\/$/, '');

// a Panoramax picture (https://<instance>/…/pictures/…) through the proxy, '' when there is no proxy
export const panoImg = href => {
  if (!PROXY || !href) return '';
  try { const u = new URL(href); return u.protocol === 'https:' && /\/pictures\//.test(u.pathname) ? `${PROXY}/pano/img/${u.host}${u.pathname}${u.search}` : ''; } catch { return ''; }
};
// a webcam image (an image address of data/webcams.json) through the proxy;
// slot: the page's time slot (the same for everybody, so the caches share one copy), '' when there is no proxy
export const camImg = (src, slot = '') => (PROXY && src ? `${PROXY}/cam?u=${encodeURIComponent(src)}${slot !== '' ? `&t=${slot}` : ''}` : '');

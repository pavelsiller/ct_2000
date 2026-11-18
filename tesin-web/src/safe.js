const LINK = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const parse = u => { try { return new URL(String(u ?? '').trim(), location.href); } catch { return null; } };
export function safeUrl(u) { const p = parse(u); return p && LINK.has(p.protocol) ? String(u).trim() : '#'; }
export function safeFrame(u) { const p = parse(u); return p && (p.protocol === 'https:' || (p.protocol === 'http:' && location.protocol === 'http:')) ? String(u).trim() : 'about:blank'; }

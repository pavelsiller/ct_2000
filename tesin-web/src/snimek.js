import { pxIcon } from './quick.js';

const MAX_SIDE = 4096, MAX_BYTES = 5 * 1024 * 1024;
const C = { bg: '#161d2b', hi: 'rgba(255, 255, 255, .10)', ink: '#f0f2ea', ink2: '#adb6c6', tile: '#c9583b', lamp: '#f3c868', rule: 'rgba(173, 182, 198, .35)', panel: '#1e2739' };
const DISPLAY = '"Jersey 15", "Courier New", monospace', BODY = '"Atkinson Hyperlegible", system-ui, sans-serif', PINF = '"VT323", "Courier New", monospace';
const HOST = 'brno2000.cz';
const CREDITS = ['© přispěvatelé OpenStreetMap', 'ortofoto ČÚZK, TopGis a Statutární město Brno'];
const TEXT = 'Brno 2000, živá pixelová mapa Brna';

const icon = new Image();
icon.src = `${import.meta.env.BASE_URL}icon-192.png`;

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
// canvas.toBlob as a promise (null when the browser cannot: a tainted canvas, or no memory for it)
const toBlob = (c, type, q) => new Promise(res => { try { c.toBlob(b => res(b), type, q); } catch { res(null); } });

// "Masarykova čtvrť" -> brno2000-masarykova-ctvrt-20261115-2140.png
function fileName(place, type, d = new Date()) {
  const slug = String(place || 'brno').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'brno';
  const p = n => String(n).padStart(2, '0');
  return `brno2000-${slug}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${type === 'image/png' ? 'png' : 'jpg'}`;
}

export function createSnimek({ viewer, fx, redraw, place, link, toast, track }) {
  const st = { busy: false, shot: null, png: null, url: null };
  const mapEl = document.getElementById('map'), fxEl = document.getElementById('mapOver'), pinsEl = document.getElementById('pins');

  // the tiles of the view loaded and the view at rest, or at most `max` ms (a slow network still gets its picture)
  function settle(max = 1500) {
    const t0 = performance.now();
    return new Promise(res => {
      const check = () => {
        const items = [];
        for (let i = 0; i < viewer.world.getItemCount(); i++) { const it = viewer.world.getItemAt(i); if (it.getOpacity() > 0) items.push(it); }
        const done = items.every(it => (it.getFullyLoaded ? it.getFullyLoaded() : true)) && !viewer.world.needsDraw();
        if (done || performance.now() - t0 > max) res(); else setTimeout(check, 50);
      };
      check();
    });
  }

  // the map as on the screen, at the resolution of the tiles' canvas (at most MAX_SIDE px on the longer side)
  function frame(withFx = true) {
    const osd = viewer.drawer.canvas, cw = mapEl.clientWidth, ch = mapEl.clientHeight;
    let s = Math.max(1, osd.width / Math.max(1, viewer.container.clientWidth));
    if (Math.max(cw, ch) * s > MAX_SIDE) s = MAX_SIDE / Math.max(cw, ch);
    const c = document.createElement('canvas');
    c.width = Math.round(cw * s); c.height = Math.round(ch * s); c.s = s;
    const g = c.getContext('2d');
    g.fillStyle = C.bg; g.fillRect(0, 0, c.width, c.height);
    // the tiles with the same filter as on the screen (evening light, rain, the data maps), fx.js applyFilter
    const filt = osd.parentElement && osd.parentElement.style.filter;
    if (filt && 'filter' in g) g.filter = filt;
    g.imageSmoothingEnabled = Math.abs(osd.width - c.width) > 1; // (1:1 stays crisp, a smaller copy is smoothed)
    g.drawImage(osd, 0, 0, c.width, c.height);
    g.filter = 'none';
    g.imageSmoothingEnabled = true;
    if (withFx) {
      // the overlay reaches `bleed` px beyond the map on every side: only the part over the map
      const { cw: fw, ch: fh, dpr } = fx.size();
      const bx = (fxEl.width - fw * dpr) / 2, by = (fxEl.height - fh * dpr) / 2;
      g.drawImage(fxEl, bx, by, fw * dpr, fh * dpr, 0, 0, c.width, c.height);
      drawPins(g, s);
    }
    return c;
  }

  // the pins of the places are elements over the map (style.css .pin): drawn the same way
  function drawPins(g, s) {
    const m = mapEl.getBoundingClientRect();
    g.save(); g.scale(s, s);
    for (const el of pinsEl.children) {
      if (el.style.display === 'none' || !el.offsetParent) continue;
      const r = el.getBoundingClientRect(), x = r.left - m.left, y = r.top - m.top;
      if (r.right < m.left || r.left > m.right || r.bottom < m.top || r.top > m.bottom) continue;
      if (el.classList.contains('here-pin')) {
        const cx = x + r.width / 2, cy = y + r.height / 2;
        g.strokeStyle = 'rgba(255, 154, 60, .8)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 20, 0, 2 * Math.PI); g.stroke();
        g.fillStyle = '#ff9a3c'; g.strokeStyle = '#141a28'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 5, 0, 2 * Math.PI); g.fill(); g.stroke();
        continue;
      }
      g.fillStyle = 'rgba(0, 0, 0, .4)'; g.fillRect(x + 2, y + 2, r.width, r.height);
      g.fillStyle = C.panel; g.fillRect(x, y, r.width, r.height);
      g.strokeStyle = C.tile; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, r.width - 2, r.height - 2);
      g.fillStyle = C.tile; g.fillRect(x + r.width / 2 - 1, y + r.height, 2, 10);
      g.fillStyle = C.ink; g.font = `400 ${parseFloat(getComputedStyle(el).fontSize) || 18}px ${PINF}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(el.textContent, x + r.width / 2, y + r.height / 2 + 1);
    }
    g.restore();
  }

  // the strip along the bottom: [icon] Brno2000 | place ........ brno2000.cz · credits (two or three rows when narrow)
  function strip(W, s, where) {
    const meas = document.createElement('canvas').getContext('2d');
    const w = (t, f) => { meas.font = f; return meas.measureText(t).width; };
    const f = Math.round(Math.max(13 * s, W / 105));
    const F = { logo: `400 ${Math.round(f * 1.75)}px ${DISPLAY}`, place: `700 ${f}px ${BODY}`, host: `700 ${f}px ${BODY}`, credit: `400 ${Math.round(f * 0.82)}px ${BODY}` };
    const pad = Math.round(f * 1.1), gap = Math.round(f * 0.9), ico = Math.round(f * 1.9), hair = Math.round(f * 1.75 * 0.1);
    const logoW = w('Brno', F.logo) + hair + w('2000', F.logo);
    const left = [{ k: 'icon', w: ico }, { k: 'logo', w: logoW }];
    if (where) left.push({ k: 'place', t: where, f: F.place, c: C.ink, w: w(where, F.place), rule: true });
    const dot = w(' · ', F.credit);
    const right = [{ k: 'text', t: HOST, f: F.host, c: C.lamp, w: w(HOST, F.host) }, ...CREDITS.map(t => ({ k: 'text', t, f: F.credit, c: C.ink2, w: w(t, F.credit), dot: true }))];
    const width = (items, sep) => items.reduce((a, it, i) => a + it.w + (i ? (it.dot ? dot : sep) : 0), 0);
    const room = W - 2 * pad;
    let rows;
    if (width(left, gap) + 2 * gap + width(right, gap) <= room) rows = [[...left, { k: 'push' }, ...right]];
    else {
      if (where && width(left, gap) > room) { // a long name of a place: shortened with …
        const it = left[2];
        while (it.t.length > 2 && width(left, gap) > room) { it.t = it.t.slice(0, -2) + '…'; it.w = w(it.t, it.f); }
      }
      rows = [left];
      let row = [];
      for (const it of right) { if (row.length && width([...row, it], gap) > room) { rows.push(row); row = []; it.dot = false; } row.push(it); }
      if (row.length) rows.push(row);
      rows.slice(1).forEach(r => { if (r[0]) r[0].dot = false; });
    }
    const rowH = [Math.round(ico * 1.45), ...rows.slice(1).map(() => Math.round(f * 1.7))];
    const h = rowH.reduce((a, b) => a + b, 0) + Math.round(pad * (rows.length > 1 ? 0.7 : 0.2));
    return {
      h,
      draw(g, y0) {
        g.save();
        g.fillStyle = C.bg; g.fillRect(0, y0, W, h);
        g.fillStyle = C.hi; g.fillRect(0, y0, W, Math.max(1, Math.round(f / 12)));
        g.textBaseline = 'middle';
        let y = y0 + Math.round(pad * (rows.length > 1 ? 0.25 : 0.1));
        rows.forEach((row, ri) => {
          const cy = y + rowH[ri] / 2;
          const pushAt = row.findIndex(it => it.k === 'push');
          const tail = pushAt >= 0 ? row.slice(pushAt + 1) : [];
          let x = pad;
          const put = (it, i) => {
            if (i) x += it.dot ? 0 : gap;
            if (it.k === 'icon') {
              if (icon.complete && icon.naturalWidth) { g.imageSmoothingEnabled = false; g.drawImage(icon, x, Math.round(cy - ico / 2), ico, ico); g.imageSmoothingEnabled = true; }
              else { g.fillStyle = C.tile; g.fillRect(x, Math.round(cy - ico / 2), ico, ico); }
            } else if (it.k === 'logo') {
              g.font = F.logo; g.fillStyle = C.ink; g.textAlign = 'left';
              g.fillText('Brno', x, cy + f * 0.08);
              g.fillStyle = C.tile; g.fillText('2000', x + w('Brno', F.logo) + hair, cy + f * 0.08);
            } else {
              if (it.rule) { g.fillStyle = C.rule; g.fillRect(Math.round(x - gap / 2), Math.round(cy - f * 0.6), Math.max(1, Math.round(f / 12)), Math.round(f * 1.2)); }
              if (it.dot) { g.font = F.credit; g.fillStyle = C.ink2; g.textAlign = 'left'; g.fillText(' · ', x, cy); x += dot; }
              g.font = it.f; g.fillStyle = it.c; g.textAlign = 'left'; g.fillText(it.t, x, cy);
            }
            x += it.w;
          };
          (pushAt >= 0 ? row.slice(0, pushAt) : row).forEach(put);
          if (tail.length) { x = W - pad - width(tail, gap); tail.forEach(put); }
          y += rowH[ri];
        });
        g.restore();
      },
    };
  }

  async function encode(c) {
    let type = 'image/png', b = await toBlob(c, type);
    for (const q of [0.92, 0.85, 0.75]) { if (b && b.size <= MAX_BYTES) break; type = 'image/jpeg'; b = await toBlob(c, type, q); }
    return b ? { blob: b, type } : null;
  }

  async function capture() {
    if (document.fonts) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 500))]);
    await settle();
    await nextFrame();
    redraw(); // (the overlay drawn for this very view, not shifted: main.js drawFull)
    const where = place(), url = link();
    let view = frame(true), out = null;
    for (const withFx of [true, false]) {
      if (!withFx) view = frame(false);
      const sp = strip(view.width, view.s, where);
      const c = document.createElement('canvas');
      c.width = view.width; c.height = view.height + sp.h;
      const g = c.getContext('2d');
      g.drawImage(view, 0, 0); sp.draw(g, view.height);
      const enc = await encode(c);
      if (enc) { out = { ...enc, canvas: c, place: where, link: url, name: fileName(where, enc.type), noFx: !withFx }; break; }
    }
    return out;
  }

  // ---------------------------------------------------------- the panel
  const el = document.createElement('div');
  el.className = 'snap'; el.id = 'snapPanel'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Snímek tohoto pohledu');
  el.innerHTML = `
    <div class="snap-head"><b>Snímek</b><button class="pbtn sq-btn close" type="button" aria-label="Zavřít" title="Zavřít">×</button></div>
    <img class="snap-img" alt="Snímek pohledu, dole logo, místo a autoři dat">
    <p class="snap-meta"></p>
    <div class="snap-btns">
      <button class="pbtn snap-share" type="button" hidden>${pxIcon('share')}<span>Sdílet…</span></button>
      <button class="pbtn snap-dl" type="button">Stáhnout</button>
      <button class="pbtn snap-copy" type="button">Kopírovat</button>
    </div>`;
  document.body.append(el);
  const q = s => el.querySelector(s);
  const P = { img: q('.snap-img'), meta: q('.snap-meta'), share: q('.snap-share'), copy: q('.snap-copy'), dl: q('.snap-dl'), close: q('.close') };
  let opener = null;
  const phone = () => matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) <= 1100;
  const canCopy = () => !!(navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined');
  const shareData = shot => {
    const file = new File([shot.blob], shot.name, { type: shot.type });
    const data = { files: [file], title: 'Brno 2000', text: `${shot.place && shot.place !== 'Brno' ? `${shot.place}: ` : ''}${TEXT} ${shot.link}` };
    try { return navigator.canShare && navigator.share && navigator.canShare({ files: [file] }) ? data : null; } catch { return null; }
  };

  function show(shot, data) {
    if (st.url) URL.revokeObjectURL(st.url);
    st.url = URL.createObjectURL(shot.blob);
    P.img.src = st.url; P.img.width = shot.canvas.width; P.img.height = shot.canvas.height;
    P.meta.textContent = `${shot.place} · ${shot.canvas.width} × ${shot.canvas.height} px · ${shot.type === 'image/png' ? 'PNG' : 'JPEG'} · ${(shot.blob.size / 1048576).toFixed(1).replace('.', ',')} MB`;
    P.share.hidden = !data;
    P.copy.hidden = !canCopy();
    el.hidden = false;
    opener && opener.setAttribute('aria-expanded', 'true');
    (data ? P.share : P.dl).focus({ preventScroll: true });
    // the clipboard takes PNG only: a JPEG shot gets its PNG ready meanwhile
    st.png = shot.type === 'image/png' ? Promise.resolve(shot.blob) : toBlob(shot.canvas, 'image/png');
  }
  function hide() {
    if (el.hidden) return;
    el.hidden = true;
    if (opener) { opener.setAttribute('aria-expanded', 'false'); opener.focus({ preventScroll: true }); }
  }
  async function copy() {
    if (!st.shot || !canCopy()) return false;
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': st.png })]); return true; } catch (e) { console.warn('snímek: kopie', e); return false; }
  }
  function download() {
    const a = document.createElement('a');
    a.href = st.url; a.download = st.shot.name; a.rel = 'noopener';
    document.body.append(a); a.click(); a.remove();
  }
  P.close.onclick = hide;
  P.copy.onclick = async () => { track('Sdílení', { co: 'snimek', jak: 'kopie' }); toast(await copy() ? 'Obrázek je zkopírovaný' : 'Obrázek se nepodařilo zkopírovat, stáhněte ho'); };
  P.dl.onclick = () => { track('Sdílení', { co: 'snimek', jak: 'stazeni' }); download(); };
  P.share.onclick = async () => {
    const data = st.shot && shareData(st.shot);
    if (!data) return;
    track('Sdílení', { co: 'snimek', jak: 'share' });
    try { await navigator.share(data); hide(); } catch (e) { if (e && e.name !== 'AbortError') toast('Sdílení tady nejde, obrázek stáhněte'); }
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) { e.stopImmediatePropagation(); hide(); } }, true);
  document.addEventListener('pointerdown', e => { if (!el.hidden && !el.contains(e.target) && !(opener && opener.contains(e.target))) hide(); });

  function flash() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const f = document.createElement('div');
    f.className = 'snap-flash';
    document.body.append(f);
    setTimeout(() => f.remove(), 450);
  }

  async function run(btn) {
    if (st.busy) return;
    if (!el.hidden && opener === btn) { hide(); return; }
    opener = btn;
    st.busy = true; btn.setAttribute('aria-busy', 'true');
    flash();
    let shot = null;
    try { shot = await capture(); } catch (e) { console.warn('snímek', e); }
    st.busy = false; btn.removeAttribute('aria-busy');
    if (!shot) { toast('Snímek se tady nepodařilo udělat'); return; }
    st.shot = shot;
    track('Nástroj', { nastroj: 'snimek' });
    if (shot.noFx) console.warn('snímek: bez vrstvy nad mapou (obrázek z cizího serveru bez CORS)');
    const data = phone() ? shareData(shot) : null; // (a computer: Stáhnout and Kopírovat, the picture goes into a post by hand)
    // a phone: straight to the share sheet; the panel when the sheet cannot open (the click is too long ago for it)
    if (data) {
      try { track('Sdílení', { co: 'snimek', jak: 'share' }); await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    show(shot, data);
  }

  return { run, hide, capture };
}

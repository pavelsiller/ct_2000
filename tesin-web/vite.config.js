import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import fs from 'node:fs';
import { iconVersion } from './tools/iconversion.mjs';

// The build of the Brno 2000 pages (the map, the overview of the data, how the map was made, Brno teď).
// Settings: .env (where the tiles, the data feeds and the live positions are read from) and site.config.json
// (the address of the site, the contact, the visit counter).

const site = JSON.parse(fs.readFileSync(resolve(__dirname, 'site.config.json'), 'utf8'));
const SITE = site.siteUrl ? site.siteUrl.replace(/\/?$/, '/') : '';
const CONTACT = site.email ? `<a href="mailto:${site.email}">${site.email}</a>` : '';
// Visits (site.config.json statsUrl, a Plausible server): counted only when statsUrl is filled in. The tag is
// `async`, never `defer`: a defer script runs in order with the map's module script, so a slow stats server would
// hold the map back until it answers.
const STATS = site.statsUrl ? site.statsUrl.replace(/\/?$/, '/') : '';
const STATS_DOMAIN = SITE ? new URL(SITE).hostname : '';
const statsTag = manual => (STATS && STATS_DOMAIN
  ? `<script>window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}</script>\n<script async data-domain="${STATS_DOMAIN}" src="${STATS}js/script.${manual ? 'manual.' : ''}outbound-links.js"></script>`
  : '');

// the "Jak to vzniklo" text (src/about.html) goes into the map and into the page /o-mape; the contact and the
// absolute address for sharing previews are filled in here, at build time
function authorPages() {
  return {
    name: 'author-pages',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const where = `${ctx.path || ''} ${ctx.filename || ''}`;
        const sub = /o-mape/.test(where);
        const base = sub ? '../' : './';
        const page = sub ? 'o-mape/' : /data\.html/.test(where) ? 'data' : /prehled\.html/.test(where) ? 'prehled' : '';
        // the story of the map (src/about-story.html) is part of the text only on the page /o-mape; the map shows who made it
        const storyFile = resolve(__dirname, 'src/about-story.html');
        const story = sub && fs.existsSync(storyFile) ? fs.readFileSync(storyFile, 'utf8').replace(/^<!--[^\n]*-->\n/, '') : '';
        const about = fs.readFileSync(resolve(__dirname, 'src/about.html'), 'utf8').replace(/^<!--[^\n]*-->\n/, '').replace('<!--#story-->\n', story);
        // the settings a visitor keeps under the old names (izo-…) are copied under the new ones (b2k-…) before anything
        // reads them: src/oldkeys.js goes straight into the head of the pages that read the storage
        const oldKeysFile = resolve(__dirname, 'src/oldkeys.js');
        const oldKeys = fs.existsSync(oldKeysFile) ? `<script>${fs.readFileSync(oldKeysFile, 'utf8').replace(/^\/\/[^\n]*\n/gm, '').trim()}</script>` : '';
        return html
          .replaceAll('<!--#oldkeys-->', oldKeys)
          .replaceAll('<!--#about-->', about)
          .replaceAll('<!--#ogurl-->', SITE ? `<meta property="og:url" content="${SITE}${page}">\n<link rel="canonical" href="${SITE}${page}">` : '')
          .replaceAll('<!--#datasets-->', '')
          .replaceAll('<!--#stats-->', statsTag(page === ''))
          .replaceAll('<!--#statsnote-->', statsTag(false) ? '<p class="fine">Návštěvnost měřím anonymně, bez cookies a bez sledování napříč weby (Plausible na vlastním serveru). Vidím jen, co lidi v mapě zajímá, ne kdo jsou.</p>' : '')
          .replaceAll('%OGIMAGE%', SITE ? `${SITE}og.png` : `${base}og.png`)
          .replaceAll('%SITE%', SITE || base)
          .replaceAll('%CONTACT%', CONTACT)
          // the icon links carry the hash of the icon files (tools/iconversion.mjs): a redrawn icon is a new address
          .replaceAll('%ICONV%', iconVersion(resolve(__dirname, 'public')))
          .replaceAll('%BASE%', base);
      },
    },
  };
}

// the parts of the map that are not published yet: their code is in the bundle, switched off
const HIDDEN = ["lupa","rotations"];

// the map page opens the connections to the tile and the data servers while it still reads its CSS and script:
// <!--#preconnect--> in index.html, one link per other origin
function preconnect(...bases) {
  const origins = [...new Set(bases.filter(b => /^https?:\/\//.test(b || '')).map(b => new URL(b).origin))];
  const tags = origins.map(o => `<link rel="preconnect" href="${o}" crossorigin>`).join('\n');
  return { name: 'preconnect', transformIndexHtml: html => html.replace('<!--#preconnect-->', tags) };
}

// the version of this build (its time): the service worker (src/sw.js) takes over the caches with it, the page knows
// its own (import.meta.env.VITE_BUILD) and compares it with version.json when it comes back after a long time
const BUILD = Date.now().toString(36);
function swVersion(dataBase) {
  let origin = '';
  try { origin = dataBase ? new URL(dataBase).origin : ''; } catch { /* not an absolute address: no feed origin */ }
  return {
    name: 'sw-version', apply: 'build',
    generateBundle() {
      const src = fs.readFileSync(resolve(__dirname, 'src/sw.js'), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src.replaceAll('__V__', BUILD).replace("'__DATA__'", JSON.stringify(origin)) });
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: BUILD }) });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  // The data are in public/data. With STATIC_ORIGIN in .env, the dev server and the preview take data/ and misto/
  // from that site instead.
  const origin = (env.STATIC_ORIGIN || '').replace(/\/$/, '');
  const proxy = origin ? { '^/(data|misto)/': { target: origin, changeOrigin: true } } : undefined;
  return {
    base: './',
    plugins: [authorPages(), swVersion(env.VITE_DATA_BASE), preconnect(env.VITE_MEDIA_BASE, env.VITE_DATA_BASE)],
    server: { proxy },
    preview: { proxy },
    // import.meta.env.DEV is switched off for the dev server too: the pages then run as they do on the web, without the
    // author's test controls and test addresses (they are in the source, cut from every build)
    define: { 'import.meta.env.VITE_PUBLIC_HIDE': JSON.stringify(HIDDEN.join(',')), 'import.meta.env.VITE_BUILD': JSON.stringify(BUILD), 'import.meta.env.DEV': 'false' },
    build: {
      // the browsers the bundle is written for; the page itself needs iOS 15.4 / Chrome 103 / Firefox 104
      target: ['chrome107', 'edge107', 'firefox104', 'safari16'],
      outDir: 'dist-public', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 1000,
      rollupOptions: { input: { data: resolve(__dirname, 'data.html'), main: resolve(__dirname, 'index.html'), about: resolve(__dirname, 'o-mape/index.html'), prehled: resolve(__dirname, 'prehled.html') } },
    },
  };
});

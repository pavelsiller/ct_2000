import fs from 'node:fs';
import crypto from 'node:crypto';
import { resolve } from 'node:path';

export const ICON_FILES = ['favicon.ico', 'favicon.svg', 'safari-pinned-tab.svg', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'manifest.webmanifest'];
export const hashOf = (...bufs) => { const h = crypto.createHash('sha1'); for (const b of bufs) h.update(b); return h.digest('hex').slice(0, 8); };
// one version for all the links: any icon or the manifest changed -> every link changes
export const iconVersion = publicDir => hashOf(...ICON_FILES.map(f => fs.readFileSync(resolve(publicDir, f))));

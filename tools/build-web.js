/* Wonky Boy - tools/build-web.js
 * ---------------------------------------------------------------------------
 * Collects the game into www/, which is what Capacitor bundles into the APK.
 *
 * The game has no build step of its own - it is plain files - so this is just
 * a copy with an explicit allow-list. The allow-list matters: pointing
 * Capacitor at the project root would sweep node_modules, the android project
 * and the tools folder into the app.
 *
 * Run: node tools/build-web.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www');

/* Everything the game needs at runtime, and nothing else. */
const INCLUDE = [
  'index.html',
  'manifest.webmanifest',
  'css',
  'js',
  'icons'
];

/* The service worker is deliberately NOT bundled. In a packaged app every
 * asset is already local, so a cache layer only adds a way to serve stale
 * files after an update. */
const EXCLUDE_NAMES = new Set(['sw.js']);

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (EXCLUDE_NAMES.has(entry)) continue;
      copy(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.copyFileSync(src, dest);
}

rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

let files = 0;
for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) {
    console.error('missing: ' + item);
    process.exit(1);
  }
  copy(src, path.join(OUT, item));
}

/* Strip the service worker registration - harmless but pointless offline. */
const indexPath = path.join(OUT, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(
  /<script>\s*if \('serviceWorker' in navigator\)[\s\S]*?<\/script>\s*/,
  ''
);
fs.writeFileSync(indexPath, html);

(function count(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) count(path.join(dir, e.name));
    else files++;
  }
})(OUT);

console.log('www/ built: ' + files + ' files');

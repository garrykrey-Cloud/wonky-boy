/* Wonky Boy - tools/make-android-icons.js
 * ---------------------------------------------------------------------------
 * Writes the Android launcher icons straight into the Capacitor project,
 * reusing the same drawing code as the web icons so the app icon and the PWA
 * icon are the same artwork.
 *
 * Three sets are produced:
 *   ic_launcher.png / ic_launcher_round.png  legacy full-bleed icon
 *   ic_launcher_foreground.png               adaptive foreground, transparent
 *
 * Adaptive icons are 108dp with only the middle 72dp guaranteed visible - the
 * launcher crops the rest to whatever mask the device uses. The foreground is
 * therefore drawn at 66% scale so nothing important can be clipped, and the
 * background comes from the ic_launcher_background colour.
 *
 * Run: node tools/make-android-icons.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { makeIcon, writePng } = require('./make-icons.js');

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

/* Density buckets. Legacy icons are 48dp, adaptive layers are 108dp. */
const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4]
];

if (!fs.existsSync(RES)) {
  console.error('No Android project yet. Run: npx cap add android');
  process.exit(1);
}

let written = 0;

for (const [bucket, scale] of DENSITIES) {
  const dir = path.join(RES, 'mipmap-' + bucket);
  fs.mkdirSync(dir, { recursive: true });

  const legacy = Math.round(48 * scale);
  const adaptive = Math.round(108 * scale);

  writePng(path.join(dir, 'ic_launcher.png'), legacy, legacy,
    makeIcon(legacy, {}));

  writePng(path.join(dir, 'ic_launcher_round.png'), legacy, legacy,
    makeIcon(legacy, { round: true }));

  writePng(path.join(dir, 'ic_launcher_foreground.png'), adaptive, adaptive,
    makeIcon(adaptive, { foreground: true }));

  written += 3;
  console.log('  mipmap-' + bucket + ': ' + legacy + 'px legacy, ' + adaptive + 'px adaptive');
}

/* The template ships a white adaptive background, which fights the artwork.
 * Match the deep navy the icon and the game already use. */
const bgFile = path.join(RES, 'values', 'ic_launcher_background.xml');
if (fs.existsSync(bgFile)) {
  fs.writeFileSync(bgFile,
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<resources>\n' +
    '    <color name="ic_launcher_background">#141534</color>\n' +
    '</resources>\n');
  console.log('  adaptive background set to #141534');
}

console.log(written + ' icon files written into the Android project');

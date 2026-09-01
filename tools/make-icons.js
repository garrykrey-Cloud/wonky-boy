/* Wonky Boy - tools/make-icons.js
 * Generates the PWA icons as real PNGs with no dependencies at all.
 * Run: node tools/make-icons.js
 */
'use strict';

module.exports = {};
(function main() {

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');

/* ------------------------------------------------------------ png writer */

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function writePng(file, width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
  return png.length;
}

/* -------------------------------------------------------------- drawing */

function mix(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + dx * t, qy = y1 + dy * t;
  return Math.hypot(px - qx, py - qy);
}

/* variant: 'boy' -> light blue signature, 'girl' -> light pink */
function makeIcon(size, opts) {
  opts = opts || {};
  /* foreground: the adaptive-icon layer. Transparent, and pulled well inside
   * the 108dp canvas so no launcher mask can crop the boy or the ring. */
  const pad = opts.foreground ? 0.17 : (opts.maskable ? 0.18 : 0.0);
  const sig = opts.variant === 'girl' ? [255, 158, 200] : [125, 205, 255];
  const rgba = Buffer.alloc(size * size * 4);
  const S = size;
  const inner = S * (1 - pad * 2);
  const off = S * pad;
  const radius = inner * 0.235;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;

      const lx = x - off, ly = y - off;
      let alpha;

      if (opts.foreground) {
        // no plate at all - the adaptive background colour shows through
        alpha = 0;
      } else if (opts.round) {
        // circular mask, for ic_launcher_round
        const rd = Math.hypot(lx - inner / 2, ly - inner / 2);
        alpha = Math.max(0, Math.min(1, (inner / 2 - rd) * 1.6 + 1));
      } else {
        // rounded-square mask in the padded area
        const cx = Math.min(Math.max(lx, radius), inner - radius);
        const cy = Math.min(Math.max(ly, radius), inner - radius);
        const d = Math.hypot(lx - cx, ly - cy);
        const insideBox = lx >= 0 && ly >= 0 && lx <= inner && ly <= inner;
        alpha = insideBox ? Math.max(0, Math.min(1, (radius - d) * 1.6 + 1)) : 0;
      }

      if (alpha <= 0 && !opts.foreground) { rgba[i + 3] = 0; continue; }

      const u = lx / inner, v = ly / inner;

      // deep playful gradient (in foreground mode this only tints the
      // antialiased edges, since alpha there comes from the art alone)
      let col = opts.foreground
        ? [20, 21, 52]
        : mix([46, 32, 110], [12, 15, 46], v);
      if (!opts.foreground) {
        col = mix(col, [92, 40, 130], Math.max(0, 0.55 - Math.hypot(u - 0.2, v - 0.15)) * 1.5);
      }

      // light blue signature glow ring - the family mark
      const ringD = Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.415);
      const ringAmt = Math.max(0, 1 - ringD * 22) * 0.85;
      col = mix(col, sig, ringAmt);
      if (opts.foreground) alpha = Math.max(alpha, ringAmt);

      // confetti speckle so the icon reads colourful
      const sp = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const fr = sp - Math.floor(sp);
      if (fr > 0.9965) {
        const hues = [[255, 210, 87], [255, 138, 208], [99, 230, 164], [255, 122, 138]];
        col = mix(col, hues[(x + y) % 4], 0.75);
      }

      // ---- the boy: head, body, flailing arms and legs
      const bx = (u - 0.5) * inner, by = (v - 0.52) * inner;
      const sc = inner / 100;

      const head = Math.hypot(bx, by + 20 * sc) - 12.5 * sc;
      const body = segDist(bx, by, 0, -6 * sc, 0, 9 * sc) - 8.5 * sc;
      const armL = segDist(bx, by, -6 * sc, -3 * sc, -23 * sc, 9 * sc) - 4.2 * sc;
      const armR = segDist(bx, by, 6 * sc, -3 * sc, 22 * sc, -12 * sc) - 4.2 * sc;
      const legL = segDist(bx, by, -3 * sc, 8 * sc, -14 * sc, 27 * sc) - 4.6 * sc;
      const legR = segDist(bx, by, 3 * sc, 8 * sc, 13 * sc, 26 * sc) - 4.6 * sc;

      const limb = Math.min(armL, armR, legL, legR);
      const boy = Math.min(head, body, limb);

      if (boy < 2.2 * sc) {
        // signature outline around the whole boy
        const outline = Math.max(0, 1 - Math.abs(boy) / (2.2 * sc));
        col = mix(col, sig, outline * 0.9);
        if (opts.foreground) alpha = Math.max(alpha, outline);
      }
      if (opts.foreground && boy < 0) alpha = 1;
      if (boy < 0) {
        let fill;
        if (head < 0) fill = [247, 207, 168];
        else if (body < 0) fill = [91, 183, 239];
        else if (armL < 0 || armR < 0) fill = [247, 207, 168];
        else fill = [47, 95, 149];
        col = mix(col, fill, 1);
      }
      // eyes
      if (Math.hypot(bx + 4.5 * sc, by + 21 * sc) < 1.9 * sc ||
          Math.hypot(bx - 4.5 * sc, by + 21 * sc) < 1.9 * sc) {
        col = [26, 20, 44];
      }

      rgba[i] = Math.round(Math.max(0, Math.min(255, col[0])));
      rgba[i + 1] = Math.round(Math.max(0, Math.min(255, col[1])));
      rgba[i + 2] = Math.round(Math.max(0, Math.min(255, col[2])));
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }
  return rgba;
}

Object.assign(module.exports, { makeIcon, writePng, mix, segDist });

if (require.main !== module) return;

fs.mkdirSync(OUT, { recursive: true });

const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
  ['icon-girl-512.png', 512, { variant: 'girl' }]
];

for (const [name, size, opts] of jobs) {
  const bytes = writePng(path.join(OUT, name), size, size, makeIcon(size, opts));
  console.log('wrote icons/' + name + '  ' + size + 'x' + size + '  ' + bytes + ' bytes');
}

})();

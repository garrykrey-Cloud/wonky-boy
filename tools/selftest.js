/* Wonky Boy - tools/selftest.js
 * Headless checks on the parts that must never quietly break: the hazard
 * catalog, all 1000 board layouts, and the sloppiness maths.
 * Run: node tools/selftest.js
 */
'use strict';

const path = require('path');
const JS = path.join(__dirname, '..', 'js');

global.window = {};
require(path.join(JS, 'rng.js'));
require(path.join(JS, 'hazards.js'));
require(path.join(JS, 'maze.js'));

const SB = global.window.SB;
const HAZ = SB.HAZARDS;
const MAZE = SB.MAZE;

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (detail ? '  -> ' + detail : ''));
}

console.log('\nHazard catalog');
check('exactly 100 hazards', HAZ.count === 100, HAZ.count);
check('all keys unique', new Set(HAZ.CATALOG.map(h => h.key)).size === 100);
check('all names unique', new Set(HAZ.CATALOG.map(h => h.name)).size === 100);
check('all descriptions present', HAZ.CATALOG.every(h => h.desc && h.desc.length > 8));
check('every hazard has a base hue', HAZ.CATALOG.every(h => h.hue >= 0 && h.hue < 360));

const hues = HAZ.CATALOG.map(h => h.hue);
check('hazard colours span the wheel', Math.max(...hues) - Math.min(...hues) > 300,
  Math.min(...hues) + '..' + Math.max(...hues));

const zaps = HAZ.CATALOG.filter(HAZ.isZap);
check('zaps exist and are a minority', zaps.length >= 10 && zaps.length <= 25, zaps.length);
check('boons exist', HAZ.CATALOG.filter(HAZ.isBoon).length >= 8);

const sloppier = HAZ.CATALOG.filter(h => (h.fx.slop || 0) > 0);
check('items that make him sloppier exist', sloppier.length >= 15, sloppier.length);
const steadier = HAZ.CATALOG.filter(h => (h.fx.slop || 0) < 0);
check('modifiers go both ways', steadier.length >= 4, steadier.length);

check('first hazard unlocks on board 1', HAZ.CATALOG[0].unlock === 1);
check('last hazard unlocks before board 1000', HAZ.CATALOG[99].unlock < 1000, HAZ.CATALOG[99].unlock);
check('unlock order never goes backwards',
  HAZ.CATALOG.every((h, i) => i === 0 || h.unlock >= HAZ.CATALOG[i - 1].unlock));
check('all 100 available by board 1000', HAZ.availableFor(1000).length === 100);

const behaviors = new Set(HAZ.CATALOG.map(h => h.behavior));
check('every behaviour is a known kind',
  [...behaviors].every(b => ['wall', 'tile', 'item', 'zapStatic', 'zapToggle',
    'zapPatrol', 'zapChase', 'zapStrike', 'mob'].includes(b)),
  [...behaviors].join(','));
check('stylised hazard walls exist', HAZ.CATALOG.filter(h => h.behavior === 'wall').length >= 15);

console.log('\nBoards');

/* Same one-cell margin rule the generator enforces. */
function dilate(mask, w, h, keepA, keepB) {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % w, y = (i / w) | 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = x + ox, gy = y + oy;
        if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
        out[gy * w + gx] = 1;
      }
    }
  }
  out[keepA] = 0;
  out[keepB] = 0;
  return out;
}

let unsolvable = 0, zapBlocked = 0, hazTotal = 0, maxHaz = 0, noMargin = 0;
const t0 = Date.now();
for (let n = 1; n <= 1000; n++) {
  const m = MAZE.build(n);
  if (!m.solution.length) unsolvable++;
  const lethal = new Uint8Array(m.w * m.h);
  m.hazards.forEach(e => {
    if (HAZ.isZap(e.hz) && (e.behavior === 'zapStatic' || e.behavior === 'zapStrike')) {
      lethal[e.cell] = 1;
    }
  });
  if (!MAZE.findPath(m.cells, m.w, m.h, m.start.idx, m.exit.idx, lethal)) zapBlocked++;
  const margin = dilate(lethal, m.w, m.h, m.start.idx, m.exit.idx);
  if (!MAZE.findPath(m.cells, m.w, m.h, m.start.idx, m.exit.idx, margin)) noMargin++;
  hazTotal += m.hazards.length;
  maxHaz = Math.max(maxHaz, m.hazards.length);
  if (m.hazards.some(e => e.cell === m.start.idx || e.cell === m.exit.idx)) {
    console.log('  FAIL hazard on start/exit, board ' + n);
    failures++;
  }
}
const buildMs = Date.now() - t0;
check('all 1000 boards have a route to the exit', unsolvable === 0, unsolvable + ' bad');
check('no board is sealed off by static zaps', zapBlocked === 0, zapBlocked + ' bad');
check('every board has a lethal-free route with a one-cell margin', noMargin === 0, noMargin + ' bad');
check('board generation is fast', buildMs < 4000, buildMs + 'ms for 1000 boards');

const b1 = MAZE.boardConfig(1), b1000 = MAZE.boardConfig(1000);
console.log('\nSloppiness');
check('board 1 base randomness is 10%', Math.abs(b1.baseSlop - 0.10) < 1e-9, b1.baseSlop);
check('board 1000 base randomness is 35%', Math.abs(b1000.baseSlop - 0.35) < 1e-9, b1000.baseSlop);
check('base randomness only ever rises', (() => {
  let prev = -1;
  for (let n = 1; n <= 1000; n++) {
    const s = MAZE.boardConfig(n).baseSlop;
    if (s < prev - 1e-12) return false;
    prev = s;
  }
  return true;
})());
check('every board sits inside the 10-35% band', (() => {
  for (let n = 1; n <= 1000; n++) {
    const s = MAZE.boardConfig(n).baseSlop;
    if (s < 0.0999 || s > 0.3501) return false;
  }
  return true;
})());

check('hazards increase with progress', (() => {
  const at = n => MAZE.boardConfig(n).hazardCount;
  return at(1) <= at(50) && at(50) < at(200) && at(200) < at(600) && at(600) <= at(1000);
})(), [1, 50, 200, 600, 1000].map(n => n + ':' + MAZE.boardConfig(n).hazardCount).join(' '));

check('mazes grow with progress', (() => {
  const a = MAZE.boardConfig(1), b = MAZE.boardConfig(500), c = MAZE.boardConfig(1000);
  return a.w < b.w && b.w <= c.w && a.h < b.h && b.h <= c.h;
})());

/* The camera is locked dead-centre on the boy and never clamps to the board,
 * so every board must be bigger than the screen in both directions or he
 * would be standing next to visible emptiness. At the current zoom the phone
 * view is about 5.25 cells across and 10.2 down. */
const VIEW_W = 5.25, VIEW_H = 10.2;
console.log('\nBoard size against the screen');
check('every board is wider than the screen', (() => {
  for (let n = 1; n <= 1000; n++) if (MAZE.boardConfig(n).w <= VIEW_W) return false;
  return true;
})(), 'smallest width ' + MAZE.boardConfig(1).w);
check('every board is taller than the screen', (() => {
  for (let n = 1; n <= 1000; n++) if (MAZE.boardConfig(n).h <= VIEW_H) return false;
  return true;
})(), 'smallest height ' + MAZE.boardConfig(1).h);
check('the biggest board is several screens across', (() => {
  const c = MAZE.boardConfig(1000);
  return c.w / VIEW_W >= 6 && c.h / VIEW_H >= 4;
})(), (MAZE.boardConfig(1000).w / VIEW_W).toFixed(1) + ' x ' +
     (MAZE.boardConfig(1000).h / VIEW_H).toFixed(1) + ' screens');
check('the walk to the exit grows with progress', (() => {
  const walk = n => MAZE.build(n).solution.length;
  return walk(1) < walk(300) && walk(300) < walk(1000);
})(), [1, 300, 1000].map(n => n + ':' + (MAZE.build(n).solution.length - 1)).join(' '));

/* ---------------------------------------------------------------- corridor
 * The splash corridor's camera heading must agree with the projection's sign
 * convention. These have silently disagreed twice. The symptom is subtle:
 * north/south hallways render correctly while east/west ones put their whole
 * geometry BEHIND the camera and draw nothing, so the corridor appears and
 * vanishes as the maze turns. It looks like an art problem; it is arithmetic.
 */
console.log('');
console.log('Splash corridor');
try {
  require(path.join(JS, 'theme.js'));
  require(path.join(JS, 'haunted.js'));
  require(path.join(JS, 'paintings.js'));
  require(path.join(JS, 'carpet.js'));
  require(path.join(JS, 'furniture.js'));
  require(path.join(JS, 'corridor.js'));

  const C = new SB.Corridor('selftest');
  const dirsSeen = new Set();
  let behind = 0, checked = 0;
  for (let r = 0; r < 16; r++) {
    while (C.turning) C.advance(1 / 60);
    for (let k = 0; k < 40; k++) C.advance(1 / 60);
    const run = C.runs[C.runIdx];
    const cam = C.cameraPos();
    /* the same convention toCamera() uses in corridor.js */
    const sinY = Math.sin(C.yaw), cosY = Math.cos(C.yaw);
    const P = C.points[run.startPoint + Math.max(0, Math.floor(C.along / 200) - 3)];
    const depth = (P.z - cam.z) * cosY + (P.x - cam.x) * sinY;
    dirsSeen.add(run.dir);
    checked++;
    if (depth <= 0) behind++;
    while (!C.turning) C.advance(1 / 60);
  }
  check('corridor renders in every direction', behind === 0,
    behind + ' of ' + checked + ' runs had geometry behind the camera');
  check('all four compass directions exercised', dirsSeen.size === 4,
    [...dirsSeen].sort().join(','));

  const C2 = new SB.Corridor('cadence');
  let turns = 0, frames = 0, turning = 0, was = false;
  for (let f = 0; f < 60 * 40; f++) {
    C2.advance(1 / 60);
    frames++;
    if (C2.turning) turning++;
    if (C2.turning && !was) turns++;
    was = C2.turning;
  }
  const gap = 40 / turns;
  check('corners are seconds apart, not fractions', gap > 1.8 && gap < 4.5, gap.toFixed(2) + 's apart');
  check('most of the time is spent going straight', turning / frames < 0.25,
    Math.round(100 * turning / frames) + '% turning');
  check('speed eases through corners', (function () {
    const C3 = new SB.Corridor('speed');
    let min = 1, max = 0;
    for (let f = 0; f < 60 * 20; f++) { C3.advance(1 / 60); const v = C3.speedFactor || 1; min = Math.min(min, v); max = Math.max(max, v); }
    return min < 0.4 && max > 0.95;
  })(), 'slows into the apex, returns to full on the straight');
} catch (e) {
  failures++;
  console.log('  FAIL corridor checks threw -> ' + e.message);
}

console.log('\nSummary');
console.log('  average hazards per board: ' + (hazTotal / 1000).toFixed(1) + ', busiest board: ' + maxHaz);
console.log('  ' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

/* Wonky Boy - tools/sim.js
 * CLI over the headless play-tester in sim-core.js.
 *
 *   node tools/sim.js                 quick sweep across the whole game
 *   node tools/sim.js 250             detail on one board
 *   node tools/sim.js 1 1000 3        custom range and attempts per board
 */
'use strict';

const { playBoard } = require('./sim-core.js');

/* ------------------------------------------------------------------ run */

const args = process.argv.slice(2).map(Number).filter(n => !isNaN(n));

if (args.length === 1) {
  const s = playBoard(args[0]);
  console.log('\nBoard ' + s.board + '  (' + s.mazeSize + ', ' + s.hazardCount + ' hazards)');
  console.log('  cleared      ' + s.cleared);
  console.log('  time         ' + s.seconds.toFixed(1) + 's over ' + s.pathCells + ' cells');
  console.log('  zaps taken   ' + s.deaths + (s.killedBy ? ' (last: ' + s.killedBy + ')' : ''));
  console.log('  shield saves ' + s.shieldSaves);
  console.log('  stumbles     ' + s.stumbles);
  console.log('  slop         base ' + (s.baseSlop * 100).toFixed(0) + '%, ranged ' +
    (s.minSlop * 100).toFixed(0) + '% to ' + (s.peakSlop * 100).toFixed(0) + '%');
  const trig = Object.entries(s.triggers).sort((a, b) => b[1] - a[1]);
  if (trig.length) {
    console.log('  hazards hit  ' + trig.map(([k, v]) => k + ' x' + v).join(', '));
  }
  process.exit(0);
}

const from = args[0] || 1;
const to = args[1] || 1000;
const attempts = args[2] || 1;
const step = Math.max(1, Math.round((to - from) / 24));

console.log('\nWonky Boy - simulated playthrough');
console.log('board    size    haz   base   clear   time     zaps   stumbles  slop range');
console.log('-'.repeat(78));

let totalClear = 0, totalBoards = 0, totalDeaths = 0;

for (let n = from; n <= to; n += step) {
  let clears = 0, secs = 0, deaths = 0, stum = 0, lo = 9, hi = 0, size = '', haz = 0, base = 0;
  for (let a = 0; a < attempts; a++) {
    const s = playBoard(n);
    if (s.cleared) clears++;
    secs += s.seconds; deaths += s.deaths; stum += s.stumbles;
    lo = Math.min(lo, s.minSlop); hi = Math.max(hi, s.peakSlop);
    size = s.mazeSize; haz = s.hazardCount; base = s.baseSlop;
  }
  totalClear += clears; totalBoards += attempts; totalDeaths += deaths;
  console.log(
    String(n).padStart(5) +
    String(size).padStart(9) +
    String(haz).padStart(6) +
    (base * 100).toFixed(0).padStart(6) + '%' +
    (clears + '/' + attempts).padStart(8) +
    (secs / attempts).toFixed(1).padStart(8) + 's' +
    (deaths / attempts).toFixed(1).padStart(7) +
    (stum / attempts).toFixed(0).padStart(10) +
    ('  ' + (lo * 100).toFixed(0) + '-' + (hi * 100).toFixed(0) + '%').padStart(13)
  );
}

console.log('-'.repeat(78));
console.log('cleared ' + totalClear + ' of ' + totalBoards +
  ' attempts, ' + (totalDeaths / totalBoards).toFixed(2) + ' zaps per attempt');

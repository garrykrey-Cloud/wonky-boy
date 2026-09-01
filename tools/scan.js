/* Wonky Boy - tools/scan.js
 * Plays every board and reports any that a competent player could not
 * reasonably finish. Run: node tools/scan.js [attemptsPerBoard]
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

/* Reuse the simulator by importing it as a module would need refactoring, so
 * scan simply re-implements the sweep using the same playBoard through a
 * child process is wasteful. Instead require sim's internals directly. */
process.env.SIM_QUIET = '1';
const sim = require('./sim-core.js');

const attempts = parseInt(process.argv[2], 10) || 1;

const fails = [];
const slow = [];
let totalTime = 0, totalDeaths = 0, cleared = 0, runs = 0;
const perDecile = new Array(10).fill(null).map(() => ({ t: 0, d: 0, n: 0, fail: 0 }));

const t0 = Date.now();
for (let n = 1; n <= 1000; n++) {
  for (let a = 0; a < attempts; a++) {
    const s = sim.playBoard(n);
    runs++;
    totalTime += s.seconds;
    totalDeaths += s.deaths;
    const dec = perDecile[Math.min(9, Math.floor((n - 1) / 100))];
    dec.n++; dec.t += s.seconds; dec.d += s.deaths;
    if (s.cleared) {
      cleared++;
      if (s.seconds > 150) slow.push(n + ' (' + s.seconds.toFixed(0) + 's, ' + s.deaths + ' zaps)');
    } else {
      dec.fail++;
      fails.push({ n, deaths: s.deaths, killedBy: s.killedBy, haz: s.hazardCount, size: s.mazeSize });
    }
  }
}

console.log('\nFull scan: ' + runs + ' attempts across 1000 boards in ' +
  ((Date.now() - t0) / 1000).toFixed(1) + 's\n');

console.log('boards   clear%   avg time   avg zaps');
console.log('-'.repeat(42));
perDecile.forEach((d, i) => {
  console.log(
    (i * 100 + 1 + '-' + (i + 1) * 100).padEnd(9) +
    (100 * (d.n - d.fail) / d.n).toFixed(0).padStart(5) + '%' +
    (d.t / d.n).toFixed(1).padStart(10) + 's' +
    (d.d / d.n).toFixed(2).padStart(11));
});
console.log('-'.repeat(42));
console.log('overall  ' + (100 * cleared / runs).toFixed(1) + '% cleared, ' +
  (totalTime / runs).toFixed(1) + 's average, ' +
  (totalDeaths / runs).toFixed(2) + ' zaps per attempt');

if (slow.length) {
  console.log('\nSlow boards (over 150s): ' + slow.length);
  console.log('  ' + slow.slice(0, 20).join(', ') + (slow.length > 20 ? ' ...' : ''));
}

if (fails.length) {
  console.log('\nNOT CLEARED: ' + fails.length);
  fails.slice(0, 40).forEach(f => {
    console.log('  board ' + String(f.n).padStart(4) + '  ' + f.size.padStart(6) +
      '  ' + String(f.haz).padStart(3) + ' hazards, ' + f.deaths +
      ' zaps, last: ' + f.killedBy);
  });
  if (fails.length > 40) console.log('  ... and ' + (fails.length - 40) + ' more');
} else {
  console.log('\nEvery board was cleared.');
}

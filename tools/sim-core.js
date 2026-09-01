/* Wonky Boy - tools/sim-core.js
 * ---------------------------------------------------------------------------
 * Headless play-tester. Drives a bot through real boards using the real
 * physics, the real hazards and the real effect engine, so difficulty can be
 * measured instead of guessed.
 *
 *
 * The bot is deliberately competent but not superhuman: it follows the
 * shortest route and steers toward the next waypoint. Anything it loses to is
 * sloppiness or hazards, not bad pathing.
 * ------------------------------------------------------------------------ */
'use strict';

const path = require('path');
const JS = path.join(__dirname, '..', 'js');

global.window = {};
require(path.join(JS, 'rng.js'));
require(path.join(JS, 'hazards.js'));
require(path.join(JS, 'maze.js'));
require(path.join(JS, 'effects.js'));
require(path.join(JS, 'player.js'));
require(path.join(JS, 'entities.js'));

const SB = global.window.SB;
const MAZE = SB.MAZE;
const HAZ = SB.HAZARDS;
const EFFECTS = SB.EFFECTS;

const DT = 1 / 60;
const MAX_SECONDS = Number(process.env.SIM_MAX || 240);

function playBoard(boardNumber, opts) {
  opts = opts || {};
  let maze = MAZE.build(boardNumber);
  let player = new SB.Player(maze);

  const stats = {
    board: boardNumber,
    cleared: false,
    deaths: 0,
    seconds: 0,
    triggers: {},
    shieldSaves: 0,
    stumbles: 0,
    peakSlop: 0,
    minSlop: 9,
    killedBy: null
  };

  const state = {
    maze, player, time: 0, temp: [], pulls: [], hooks: null, dt: DT
  };

  /* Death rebuilds the board from its seed, exactly as the game does. */
  function respawn() {
    stats.deaths++;
    maze = MAZE.build(boardNumber);
    player.reset(maze);
    state.maze = maze;
    state.temp = [];
    state.pulls = [];
    state.lastMods = null;
    repathIn = 0;
  }

  const env = {
    get player() { return player; },
    get time() { return state.time; },
    discover() { },
    kill(ent) {
      if (player.dead || player.won) return;
      if (player.shield > 0) {
        player.shield = 0;
        player.stun = 0.25;
        stats.shieldSaves++;
        return;
      }
      stats.killedBy = ent ? ent.hz.name : 'unknown';
      player.dead = true;
    },
    consumed() { }
  };

  state.hooks = {
    onKill: (ent) => env.kill(ent),
    onTile: (ent) => { count(ent); EFFECTS.trigger(ent, { gate: 0.35 }, env); },
    onItem: (ent) => { count(ent); EFFECTS.trigger(ent, {}, env); },
    onMob: (ent) => {
      count(ent);
      EFFECTS.trigger(ent, { gate: 0.55, dir: { x: player.x - ent.x, y: player.y - ent.y } }, env);
    },
    onWallHit: (ent, normal) => { count(ent); EFFECTS.trigger(ent, { normal }, env); },
    onStumble: () => { stats.stumbles++; }
  };

  function count(ent) {
    stats.triggers[ent.hz.name] = (stats.triggers[ent.hz.name] || 0) + 1;
  }

  /* --- the bot ---
   * Re-plans from wherever he has actually ended up, several times a second.
   * A real player does the same after being shoved off line; a bot that stuck
   * to one precomputed route would jam against a wall and fake a hard board. */
  let route = maze.solution;
  let repathIn = 0;

  function blot(blocked, cx, cy, radius) {
    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        const gx = cx + ox, gy = cy + oy;
        if (gx < 0 || gy < 0 || gx >= maze.w || gy >= maze.h) continue;
        blocked[gy * maze.w + gx] = 1;
      }
    }
  }

  /* Cells a sighted player would simply refuse to walk into. */
  function dangerMap() {
    const blocked = new Uint8Array(maze.w * maze.h);
    for (const e of maze.hazards) {
      if (e.consumed) continue;

      /* A player steps around a bad pickup and goes out of their way for a
       * good one. Modelling that keeps the measurement honest. */
      if (e.behavior === 'item') {
        if (!HAZ.isBoon(e.hz)) blocked[e.cell] = 1;
        continue;
      }
      if (!HAZ.isZap(e.hz)) continue;

      if (e.behavior === 'zapChase') {
        blot(blocked, Math.floor(e.x), Math.floor(e.y), 2);
      } else if (e.behavior === 'zapStatic' || e.behavior === 'zapStrike') {
        blocked[e.cell] = 1;
      } else if (e.behavior === 'zapToggle') {
        const list = SB.ENTITIES.toggleCells(maze, e) || [e.cell];
        for (const c of list) blocked[c] = 1;
      } else if (e.behavior === 'zapPatrol') {
        blot(blocked, Math.floor(e.x), Math.floor(e.y), 1);
      }
    }
    blocked[maze.exit.idx] = 0;
    return blocked;
  }

  function repath() {
    const from = (Math.floor(player.y) * maze.w) + Math.floor(player.x);
    const safe = dangerMap();
    safe[from] = 0;
    let found = MAZE.findPath(maze.cells, maze.w, maze.h, from, maze.exit.idx, safe);
    /* If the only way through is past something lethal, take it carefully. */
    if (!found || !found.length) {
      found = MAZE.findPath(maze.cells, maze.w, maze.h, from, maze.exit.idx, null);
    }
    if (found && found.length) route = found;
  }

  function steer(dt) {
    repathIn -= dt;
    if (repathIn <= 0) { repathIn = 0.3; repath(); }

    /* Always aim a couple of cells down the fresh route. Aiming at the
     * nearest waypoint means aiming at the cell he is already standing in,
     * which makes him dither on the spot instead of walking. */
    const target = route[Math.min(route.length - 1, 2)];
    const wx = (target % maze.w) + 0.5, wy = ((target / maze.w) | 0) + 0.5;
    const dx = wx - player.x, dy = wy - player.y;
    const d = Math.hypot(dx, dy) || 1;

    /* Ease off near anything lethal, the way a person does. Charging at full
     * tilt past a spark puddle is a bot habit, not a player habit. */
    let caution = 1;
    for (const e of maze.hazards) {
      if (e.consumed || !HAZ.isZap(e.hz)) continue;
      const ex = e.x !== undefined ? e.x : e.cx + 0.5;
      const ey = e.y !== undefined ? e.y : e.cy + 0.5;
      const near = Math.hypot(player.x - ex, player.y - ey);
      if (near < 2.2) caution = Math.min(caution, 0.45 + 0.25 * near);
    }
    return { x: (dx / d) * caution, y: (dy / d) * caution };
  }

  let steps = 0;
  const maxSteps = MAX_SECONDS / DT;

  while (steps++ < maxSteps) {
    if (player.dead) { respawn(); continue; }

    const scale = state.lastMods ? state.lastMods.time : 1;
    const dt = DT * scale;
    state.time += dt;
    stats.seconds += DT;

    SB.ENTITIES.update(state, dt);
    const mods = player.update(dt, steer(dt), {
      pulls: state.pulls,
      onWallHit: state.hooks.onWallHit,
      onStumble: state.hooks.onStumble
    });
    state.lastMods = mods;
    SB.ENTITIES.cellContacts(state);

    stats.peakSlop = Math.max(stats.peakSlop, mods.slop);
    stats.minSlop = Math.min(stats.minSlop, mods.slop);

    if (Math.hypot(player.x - (maze.exit.x + 0.5), player.y - (maze.exit.y + 0.5)) < 0.34) {
      stats.cleared = true;
      break;
    }
    if (stats.deaths > 40) break; // this board is not happening
  }

  stats.pathCells = maze.solution.length;
  stats.baseSlop = maze.cfg.baseSlop;
  stats.hazardCount = maze.hazards.length;
  stats.mazeSize = maze.w + 'x' + maze.h;
  return stats;
}


module.exports = { playBoard, DT, MAX_SECONDS };

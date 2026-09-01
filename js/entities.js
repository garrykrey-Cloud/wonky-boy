/* Wonky Boy - entities.js
 * ---------------------------------------------------------------------------
 * Runtime for every hazard that does something over time: patrols, chasers,
 * toggling beams, arming traps and the roaming mobs. Static tiles, items and
 * walls need no simulation - they are handled by contact tests here and by
 * the collision pass in player.js.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SB = global.SB;
  var DIRS = SB.MAZE.DIRS;

  function dist2(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  function openNeighbours(maze, idx) {
    var x = idx % maze.w, y = (idx / maze.w) | 0, out = [];
    for (var d = 0; d < 4; d++) {
      if (maze.cells[idx] & DIRS[d].bit) continue;
      var nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
      if (nx < 0 || ny < 0 || nx >= maze.w || ny >= maze.h) continue;
      out.push({ idx: ny * maze.w + nx, d: d });
    }
    return out;
  }

  /* The set of cells a toggling hazard covers. Worked out once, then cached. */
  function toggleCells(maze, ent) {
    if (ent.cellsList) return ent.cellsList;
    var list = [ent.cell];
    var fx = ent.hz.fx;
    var reach = fx.sweep ? 4 : (fx.cluster ? 3 : (ent.span || 0));

    if (reach > 0) {
      var cur = ent.cell;
      var prev = -1;
      /* Walk a straight-ish line down the corridor so beams read as beams. */
      var pref = Math.floor(ent.phase / (Math.PI / 2)) % 4;
      for (var i = 0; i < reach; i++) {
        var ns = openNeighbours(maze, cur).filter(function (n) { return n.idx !== prev; });
        if (!ns.length) break;
        var chosen = null;
        for (var k = 0; k < ns.length; k++) if (ns[k].d === pref) chosen = ns[k];
        if (!chosen) chosen = ns[0];
        prev = cur;
        cur = chosen.idx;
        pref = chosen.d;
        list.push(cur);
      }
    }
    ent.cellsList = list;
    return list;
  }

  /* Is a toggling hazard lethal right now, at this particular cell? */
  function toggleLive(ent, cellIndexInList, t) {
    var fx = ent.hz.fx;
    var cycle = ent.cycle || 2.5;
    var list = ent.cellsList || [ent.cell];

    if (fx.sweep) {
      var pos = Math.floor(((t + ent.offset) / cycle * list.length)) % list.length;
      return pos === cellIndexInList;
    }
    var off = ent.offset + (fx.cluster ? cellIndexInList * (cycle / Math.max(1, list.length)) : 0);
    var p = ((t + off) % cycle) / cycle;
    return p < 0.42;
  }

  function moveAlongRoute(maze, ent, dt) {
    var route = ent.route;
    if (!route || route.length < 2) return;
    var from = route[ent.leg];
    var to = route[ent.leg + (ent.forward ? 1 : -1)];
    if (to === undefined) {
      ent.forward = !ent.forward;
      return;
    }
    var fx = (from % maze.w) + 0.5, fy = ((from / maze.w) | 0) + 0.5;
    var tx = (to % maze.w) + 0.5, ty = ((to / maze.w) | 0) + 0.5;
    var len = Math.hypot(tx - fx, ty - fy) || 1;

    ent.legT += (ent.speed * dt) / len;
    while (ent.legT >= 1) {
      ent.legT -= 1;
      ent.leg += ent.forward ? 1 : -1;
      if (ent.leg >= route.length - 1) { ent.leg = route.length - 1; ent.forward = false; }
      else if (ent.leg <= 0) { ent.leg = 0; ent.forward = true; }
      from = route[ent.leg];
      to = route[ent.leg + (ent.forward ? 1 : -1)];
      if (to === undefined) { ent.forward = !ent.forward; ent.legT = 0; break; }
      fx = (from % maze.w) + 0.5; fy = ((from / maze.w) | 0) + 0.5;
      tx = (to % maze.w) + 0.5; ty = ((to / maze.w) | 0) + 0.5;
      len = Math.hypot(tx - fx, ty - fy) || 1;
    }
    ent.x = fx + (tx - fx) * ent.legT;
    ent.y = fy + (ty - fy) * ent.legT;
  }

  /* Step toward the player through open corridors, recomputed periodically.
   *
   * A hunter with no leash and no stamina is not a hazard, it is a countdown:
   * it simply follows you until a corner kills you. So this one gives up when
   * you get far enough away, and has to stop for a breather after a long
   * chase. Outrunning it is a real option.                                   */
  var CHASE_LEASH = 8.5;    // cells - beyond this it loses interest
  var CHASE_STAMINA = 6.0;  // seconds of pursuit before it needs a rest
  var CHASE_REST = 2.5;

  function chaseStep(maze, ent, player, dt, t) {
    var away = Math.hypot(player.x - ent.x, player.y - ent.y);

    if (ent.rest > 0) {
      ent.rest -= dt;
      ent.stamina = CHASE_STAMINA;
      /* hovers in place, buzzing crossly */
      ent.x += Math.sin(t * 6 + ent.phase) * 0.25 * dt;
      ent.y += Math.cos(t * 5 + ent.phase) * 0.25 * dt;
      return;
    }

    if (away > CHASE_LEASH) {
      /* drift home rather than pursuing forever */
      var hx = (ent.cx + 0.5) - ent.x, hy = (ent.cy + 0.5) - ent.y;
      var hd = Math.hypot(hx, hy);
      if (hd > 0.15) {
        ent.x += (hx / hd) * ent.speed * 0.55 * dt;
        ent.y += (hy / hd) * ent.speed * 0.55 * dt;
      }
      ent.stamina = CHASE_STAMINA;
      return;
    }

    ent.stamina = (ent.stamina === undefined ? CHASE_STAMINA : ent.stamina) - dt;
    if (ent.stamina <= 0) { ent.rest = CHASE_REST; return; }

    ent.wake -= dt;
    if (ent.wake <= 0) {
      ent.wake = 0.35;
      var from = (Math.floor(ent.y) * maze.w) + Math.floor(ent.x);
      var to = (Math.floor(player.y) * maze.w) + Math.floor(player.x);
      var path = SB.MAZE.findPath(maze.cells, maze.w, maze.h, from, to, null);
      ent.target = (path && path.length > 1) ? path[1] : null;
    }
    var tgtX, tgtY;
    if (ent.target === null || ent.target === undefined) {
      tgtX = player.x; tgtY = player.y;
    } else {
      tgtX = (ent.target % maze.w) + 0.5;
      tgtY = ((ent.target / maze.w) | 0) + 0.5;
    }
    var dx = tgtX - ent.x, dy = tgtY - ent.y;
    var d = Math.hypot(dx, dy) || 1;
    /* A lazy weave so it does not track like a guided missile. */
    var weave = Math.sin(t * 3.1 + ent.phase) * 0.25;
    ent.x += (dx / d + -dy / d * weave) * ent.speed * dt;
    ent.y += (dy / d + dx / d * weave) * ent.speed * dt;
  }

  function ghostStep(maze, ent, player, dt, t) {
    var dx = player.x - ent.x, dy = player.y - ent.y;
    var d = Math.hypot(dx, dy) || 1;
    var drift = d < 7 ? 0.55 : 0.2;
    ent.x += (dx / d) * drift * dt + Math.sin(t * 0.9 + ent.phase) * 0.35 * dt;
    ent.y += (dy / d) * drift * dt + Math.cos(t * 1.1 + ent.phase) * 0.35 * dt;
    ent.x = Math.max(0.4, Math.min(maze.w - 0.4, ent.x));
    ent.y = Math.max(0.4, Math.min(maze.h - 0.4, ent.y));
  }

  function mimicStep(ent, player, dt) {
    /* Copy Cat replays where the player was a moment ago. */
    ent.memory = ent.memory || [];
    ent.memory.push({ x: player.x, y: player.y });
    if (ent.memory.length > 90) ent.memory.shift();
    if (ent.memory.length > 70) {
      var m = ent.memory[0];
      ent.x += (m.x - ent.x) * Math.min(1, dt * 4);
      ent.y += (m.y - ent.y) * Math.min(1, dt * 4);
    }
  }

  /* ------------------------------------------------------------- update */

  function update(state, dt) {
    var maze = state.maze, player = state.player, hooks = state.hooks;
    var t = state.time;
    var pulls = [];
    var i;

    /* Short-lived slick patches dropped by Drip Blobs. */
    if (state.temp) {
      for (i = state.temp.length - 1; i >= 0; i--) {
        state.temp[i].ttl -= dt;
        if (state.temp[i].ttl <= 0) state.temp.splice(i, 1);
      }
    }

    for (i = 0; i < maze.hazards.length; i++) {
      var ent = maze.hazards[i];
      if (ent.consumed) continue;
      var fx = ent.hz.fx;

      switch (ent.behavior) {
        case 'zapToggle': {
          var list = toggleCells(maze, ent);
          ent.liveCells = [];
          for (var c = 0; c < list.length; c++) {
            if (toggleLive(ent, c, t)) ent.liveCells.push(list[c]);
          }
          var pcell = (Math.floor(player.y) * maze.w) + Math.floor(player.x);
          if (ent.liveCells.indexOf(pcell) >= 0) hooks.onKill(ent);
          break;
        }

        case 'zapStrike': {
          ent.timer += dt;
          var near = dist2(player.x, player.y, ent.cx + 0.5, ent.cy + 0.5) < 6.25;
          if (ent.state === 'idle') {
            if (!fx.prox || near) {
              if (ent.timer > (fx.prox ? 0.05 : 1.6)) { ent.state = 'arming'; ent.timer = 0; }
            } else {
              ent.timer = 0;
            }
          } else if (ent.state === 'arming') {
            if (fx.scatter && ent.timer === 0) { /* target chosen on entry */ }
            if (ent.timer >= ent.arm) { ent.state = 'firing'; ent.timer = 0; }
          } else if (ent.state === 'firing') {
            var fcell = (Math.floor(player.y) * maze.w) + Math.floor(player.x);
            if (fcell === ent.cell) hooks.onKill(ent);
            if (ent.timer >= 0.34) { ent.state = 'cooldown'; ent.timer = 0; }
          } else {
            if (ent.timer >= 1.1) { ent.state = 'idle'; ent.timer = 0; }
          }
          break;
        }

        case 'zapPatrol': {
          if (fx.drift) {
            ent.x += Math.cos(t * 0.7 + ent.phase) * ent.speed * dt;
            ent.y += Math.sin(t * 0.53 + ent.phase * 1.7) * ent.speed * dt;
            ent.x = Math.max(0.4, Math.min(maze.w - 0.4, ent.x));
            ent.y = Math.max(0.4, Math.min(maze.h - 0.4, ent.y));
          } else {
            moveAlongRoute(maze, ent, dt);
          }
          if (dist2(player.x, player.y, ent.x, ent.y) < Math.pow(player.r + 0.30, 2)) {
            hooks.onKill(ent);
          }
          break;
        }

        case 'zapChase': {
          if (ent.sleep > 0) { ent.sleep -= dt; break; }
          chaseStep(maze, ent, player, dt, t);
          if (dist2(player.x, player.y, ent.x, ent.y) < Math.pow(player.r + 0.26, 2)) {
            hooks.onKill(ent);
          }
          break;
        }

        case 'mob': {
          if (fx.ghost) ghostStep(maze, ent, player, dt, t);
          else if (fx.mimic) mimicStep(ent, player, dt);
          else moveAlongRoute(maze, ent, dt);

          if (fx.pull) {
            pulls.push({
              x: ent.x, y: ent.y,
              strength: fx.pull,
              range: fx.aura ? fx.aura + 1.5 : 3.2
            });
          }

          if (fx.trail) {
            ent.dripT = (ent.dripT || 0) + dt;
            if (ent.dripT > 0.4) {
              ent.dripT = 0;
              state.temp.push({
                x: ent.x, y: ent.y, ttl: 5.5, r: 0.42, hz: ent.hz,
                fx: { grip: fx.grip || -0.4, dur: fx.dur || 2 }
              });
            }
          }

          var radius = fx.aura ? fx.aura : (fx.swarm ? 1.15 : (player.r + 0.32));
          if (dist2(player.x, player.y, ent.x, ent.y) < radius * radius) {
            hooks.onMob(ent, radius);
          }
          break;
        }

        default:
          break;
      }
    }

    /* Slick trails apply while he is standing in them. */
    if (state.temp) {
      for (i = 0; i < state.temp.length; i++) {
        var tp = state.temp[i];
        if (dist2(player.x, player.y, tp.x, tp.y) < tp.r * tp.r) {
          player.addAffliction(tp.hz, tp.fx, tp.fx.dur || 2);
        }
      }
    }

    state.pulls = pulls;
  }

  /* Everything sitting in the cell he is standing in right now. */
  function cellContacts(state) {
    var maze = state.maze, player = state.player;
    var cx = Math.floor(player.x), cy = Math.floor(player.y);
    if (cx < 0 || cy < 0 || cx >= maze.w || cy >= maze.h) return;
    var list = maze.byCell[cy * maze.w + cx];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var ent = list[i];
      if (ent.consumed) continue;
      if (ent.behavior === 'zapStatic') {
        state.hooks.onKill(ent);
      } else if (ent.behavior === 'tile') {
        state.hooks.onTile(ent);
      } else if (ent.behavior === 'item') {
        /* Items need a closer touch so he can squeeze past one on purpose. */
        var d = dist2(player.x, player.y, ent.cx + 0.5, ent.cy + 0.5);
        if (d < Math.pow(player.r + 0.22, 2)) state.hooks.onItem(ent);
      }
    }
  }

  global.SB.ENTITIES = {
    update: update,
    cellContacts: cellContacts,
    toggleCells: toggleCells,
    toggleLive: toggleLive
  };
})(window);

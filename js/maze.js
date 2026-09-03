/* Wonky Boy - maze.js
 * ---------------------------------------------------------------------------
 * Builds any of the 1000 boards on demand from its number alone.
 *
 * Board N always generates identically, on every device, forever - the layout
 * and every hazard position come from a seeded RNG keyed on N. Nothing about a
 * board is stored; only which boards you have cleared.
 *
 * Difficulty ramps on four independent axes:
 *   1. maze size          grows until it caps out around board 250
 *   2. base sloppiness    10% on board 1, 35% on board 1000 (the design spec)
 *   3. hazard density     none on the first boards, rising steadily after
 *   4. hazard variety     which of the 100 hazards are unlocked yet
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SB = global.SB;
  var Rng = SB.Rng;
  var HAZ = SB.HAZARDS;

  var TOTAL_BOARDS = 1000;

  /* Wall bits, one per side of a cell. A set bit means the wall is there. */
  var N = 1, E = 2, S = 4, W = 8;
  var DIRS = [
    { bit: N, dx: 0, dy: -1, opp: S, name: 'N' },
    { bit: E, dx: 1, dy: 0, opp: W, name: 'E' },
    { bit: S, dx: 0, dy: 1, opp: N, name: 'S' },
    { bit: W, dx: -1, dy: 0, opp: E, name: 'W' }
  ];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------------------------------------------------------------- config */

  function boardConfig(n) {
    n = clamp(n | 0, 1, TOTAL_BOARDS);
    var t = (n - 1) / (TOTAL_BOARDS - 1); // 0..1 across the whole game

    /* Board SIZE.
     * Every board is much larger than the phone screen - the view shows about
     * 5 cells across and 10 down, so even board 1 is several screenfuls and
     * the maze scrolls under a permanently centred boy. Boards keep growing
     * to roughly nine screens wide and six deep. */
    var w = clamp(17 + Math.floor((n - 1) / 16) * 2, 17, 45);
    var h = clamp(23 + Math.floor((n - 1) / 13) * 2, 23, 61);
    var cells = w * h;

    /* Hazard count is the smaller of an absolute growth curve and a density
     * ceiling. The curve makes hazards appear steadily from board 3 onward;
     * the ceiling stops a small early maze from being wall-to-wall trouble. */
    var curve = n <= 2 ? 0 : 1 + Math.pow(n - 2, 0.75) * 0.586;
    var ceiling = cells * (0.03 + 0.06 * t);

    return {
      board: n,
      w: w,
      h: h,

      /* THE SPEC: 10% randomness on every movement at the start,
       * rising to 35% by board 1000. Hazards then modify it further,
       * in both directions. */
      baseSlop: 0.10 + 0.25 * t,

      /* Fraction of dead ends opened into loops. More loops later means more
       * room to be sloppy in, and fewer unwinnable corridors. */
      braid: 0.05 + 0.30 * t,

      hazardCount: Math.floor(Math.min(curve, ceiling)),

      /* Lethal hazards are capped so a board is never a minefield. */
      maxZapShare: 0.16 + 0.12 * t
    };
  }

  /* ------------------------------------------------------------ generation */

  function carve(cfg, rng) {
    var w = cfg.w, h = cfg.h, len = w * h;
    var cells = new Uint8Array(len);
    for (var i = 0; i < len; i++) cells[i] = N | E | S | W;

    var seen = new Uint8Array(len);
    var stack = [0];
    seen[0] = 1;

    while (stack.length) {
      var cur = stack[stack.length - 1];
      var cx = cur % w, cy = (cur / w) | 0;
      var options = [];
      for (var d = 0; d < 4; d++) {
        var nx = cx + DIRS[d].dx, ny = cy + DIRS[d].dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var ni = ny * w + nx;
        if (!seen[ni]) options.push({ d: d, ni: ni });
      }
      if (!options.length) { stack.pop(); continue; }
      var pick = options[rng.int(0, options.length - 1)];
      cells[cur] &= ~DIRS[pick.d].bit;
      cells[pick.ni] &= ~DIRS[pick.d].opp;
      seen[pick.ni] = 1;
      stack.push(pick.ni);
    }
    return cells;
  }

  /* Open some dead ends so the maze has loops instead of pure tree corridors */
  function braid(cfg, cells, rng) {
    var w = cfg.w, h = cfg.h;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        var walls = 0, d;
        for (d = 0; d < 4; d++) if (cells[i] & DIRS[d].bit) walls++;
        if (walls < 3) continue;              // not a dead end
        if (!rng.chance(cfg.braid)) continue;

        var cands = [];
        for (d = 0; d < 4; d++) {
          if (!(cells[i] & DIRS[d].bit)) continue;
          var nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          cands.push(d);
        }
        if (!cands.length) continue;
        var pd = cands[rng.int(0, cands.length - 1)];
        var ni = (y + DIRS[pd].dy) * w + (x + DIRS[pd].dx);
        cells[i] &= ~DIRS[pd].bit;
        cells[ni] &= ~DIRS[pd].opp;
      }
    }
  }

  /* -------------------------------------------------------------- pathing */

  function neighbours(cells, w, h, i, blocked) {
    var x = i % w, y = (i / w) | 0, out = [];
    for (var d = 0; d < 4; d++) {
      if (cells[i] & DIRS[d].bit) continue;
      var nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      var ni = ny * w + nx;
      if (blocked && blocked[ni]) continue;
      out.push(ni);
    }
    return out;
  }

  /* Breadth-first search. Returns the cell path, or null when there is none. */
  function findPath(cells, w, h, from, to, blocked) {
    if (blocked && (blocked[from] || blocked[to])) return null;
    var prev = new Int32Array(w * h).fill(-1);
    var seen = new Uint8Array(w * h);
    var queue = [from];
    seen[from] = 1;
    for (var qi = 0; qi < queue.length; qi++) {
      var cur = queue[qi];
      if (cur === to) {
        var path = [], c = to;
        while (c !== -1) { path.push(c); c = prev[c]; }
        return path.reverse();
      }
      var ns = neighbours(cells, w, h, cur, blocked);
      for (var k = 0; k < ns.length; k++) {
        if (seen[ns[k]]) continue;
        seen[ns[k]] = 1;
        prev[ns[k]] = cur;
        queue.push(ns[k]);
      }
    }
    return null;
  }

  /* A wandering corridor route for patrols and mobs. */
  function corridorRoute(cells, w, h, start, maxLen, rng) {
    var route = [start], cur = start, prev = -1;
    for (var i = 0; i < maxLen; i++) {
      var ns = neighbours(cells, w, h, cur, null).filter(function (n2) { return n2 !== prev; });
      if (!ns.length) break;
      var nxt = ns[rng.int(0, ns.length - 1)];
      route.push(nxt);
      prev = cur;
      cur = nxt;
    }
    return route;
  }

  /* Walking distance in cells from one cell to every other. */
  function distancesFrom(cells, w, h, from) {
    var dist = new Int32Array(w * h).fill(-1);
    var queue = [from];
    dist[from] = 0;
    for (var qi = 0; qi < queue.length; qi++) {
      var cur = queue[qi];
      var ns = neighbours(cells, w, h, cur, null);
      for (var k = 0; k < ns.length; k++) {
        if (dist[ns[k]] >= 0) continue;
        dist[ns[k]] = dist[cur] + 1;
        queue.push(ns[k]);
      }
    }
    return dist;
  }

  /* Where to put the exit.
   *
   * The board itself is always far bigger than the screen, but the WALK does
   * not have to cross all of it. Early boards put the exit a short way in, so
   * board 1 is a minute of wobbling rather than a trek; by board 1000 the exit
   * is as far away as the maze allows. This is what keeps a much larger map
   * from turning every board into a marathon that one zap sends you back to
   * the start of. */
  function pickExit(cfg, cells, rng, startIdx) {
    var w = cfg.w, h = cfg.h;
    var t = (cfg.board - 1) / (TOTAL_BOARDS - 1);
    var dist = distancesFrom(cells, w, h, startIdx);

    var maxD = 0, i;
    for (i = 0; i < dist.length; i++) if (dist[i] > maxD) maxD = dist[i];

    var want = Math.min(maxD, 26 + (maxD - 26) * Math.pow(t, 0.85));

    /* Every reachable cell close to that distance is a fair candidate. */
    var best = [], bestGap = Infinity;
    for (i = 0; i < dist.length; i++) {
      if (dist[i] < 0) continue;
      var gap = Math.abs(dist[i] - want);
      if (gap < bestGap - 0.5) { bestGap = gap; best = [i]; }
      else if (gap <= bestGap + 0.5) best.push(i);
    }
    if (!best.length) return (h - 1) * w + (w - 1);

    /* Of the cells at about the right walking distance, prefer ones that are
     * also genuinely far across the map. Otherwise the exit can sit a few
     * paces from the start behind a wall - a fair maze, but a baffling one to
     * look at when you can only see a screenful at a time. */
    var sx = startIdx % w, sy = (startIdx / w) | 0;
    var far = 0, k;
    for (k = 0; k < best.length; k++) {
      far = Math.max(far, Math.hypot((best[k] % w) - sx, ((best[k] / w) | 0) - sy));
    }
    var roomy = best.filter(function (c) {
      return Math.hypot((c % w) - sx, ((c / w) | 0) - sy) >= far * 0.62;
    });
    var pool = roomy.length ? roomy : best;
    return pool[rng.int(0, pool.length - 1)];
  }

  /* Grow a blocked set by one cell in every direction, so a route computed
   * against it keeps a wobble-sized margin away from everything lethal. */
  function dilate(mask, w, h, keepA, keepB) {
    var out = new Uint8Array(mask.length);
    for (var i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      var x = i % w, y = (i / w) | 0;
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          var gx = x + ox, gy = y + oy;
          if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
          out[gy * w + gx] = 1;
        }
      }
    }
    out[keepA] = 0;
    out[keepB] = 0;
    return out;
  }

  /* ----------------------------------------------------- hazard placement */

  function placeHazards(cfg, cells, rng, startIdx, exitIdx, roomAt) {
    var w = cfg.w, h = cfg.h, len = w * h;
    var pool = HAZ.availableFor(cfg.board);
    var placed = [];
    if (!pool.length) return placed;

    var target = cfg.hazardCount;
    if (target <= 0) return placed;
    /* Lethal hazards are capped as a share AND in absolute terms. Past a
     * dozen or so, a board stops being a maze and becomes a lottery. */
    var zapBudget = Math.max(1, Math.min(10, Math.floor(target * cfg.maxZapShare)));

    /* Cells kept clear: the start, the exit and everything touching them. */
    var safe = new Uint8Array(len);
    function markSafe(idx, radius) {
      var sx = idx % w, sy = (idx / w) | 0;
      for (var y = sy - radius; y <= sy + radius; y++) {
        for (var x = sx - radius; x <= sx + radius; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          safe[y * w + x] = 1;
        }
      }
    }
    markSafe(startIdx, 1);
    markSafe(exitIdx, 1);

    var occupied = new Uint8Array(len);
    var lethal = new Uint8Array(len);
    var zapCount = 0;
    var attempts = target * 14;

    var weighted = pool.map(function (hz) { return { w: hz.w, hz: hz }; });

    while (placed.length < target && attempts-- > 0) {
      var choice = rng.weighted(weighted);
      if (!choice) break;
      var hz = choice.hz;
      var isZap = HAZ.isZap(hz);
      if (isZap && zapCount >= zapBudget) continue;

      var idx = rng.int(0, len - 1);
      if (safe[idx] || occupied[idx]) continue;
      /* rooms belong to their mini-game; no loose hazards inside one */
      if (roomAt && roomAt[idx] !== -1) continue;

      var ent = buildEntity(hz, cfg, cells, rng, idx, w, h);
      if (!ent) continue;

      /* A lethal cell must never sever the route to the exit - and, because
       * the whole point of the game is that he veers off line, there must
       * still be a route with a one-cell margin on either side. Otherwise a
       * board demands pixel-perfect steering from a boy who has none. */
      if (isZap) {
        lethal[idx] = 1;
        if (!findPath(cells, w, h, startIdx, exitIdx, dilate(lethal, w, h, startIdx, exitIdx))) {
          lethal[idx] = 0;
          continue;
        }
        zapCount++;
      }

      occupied[idx] = 1;
      placed.push(ent);
    }

    /* Once zaps have unlocked, a board of any real size always gets at least
     * one. Dying and restarting the board is a core mechanic; it should not
     * be left to a weighted dice roll. */
    var zapPool = pool.filter(HAZ.isZap);
    if (zapCount === 0 && zapPool.length && target >= 3) {
      var tries = 250;
      while (tries-- > 0) {
        var zhz = zapPool[rng.int(0, zapPool.length - 1)];
        var zi = rng.int(0, len - 1);
        if (safe[zi] || occupied[zi]) continue;
        if (roomAt && roomAt[zi] !== -1) continue;
        var zent = buildEntity(zhz, cfg, cells, rng, zi, w, h);
        if (!zent) continue;
        lethal[zi] = 1;
        if (!findPath(cells, w, h, startIdx, exitIdx, dilate(lethal, w, h, startIdx, exitIdx))) { lethal[zi] = 0; continue; }
        occupied[zi] = 1;
        placed.push(zent);
        break;
      }
    }

    return placed;
  }

  var uid = 0;

  function buildEntity(hz, cfg, cells, rng, idx, w, h) {
    var cx = idx % w, cy = (idx / w) | 0;
    var ent = {
      uid: ++uid,
      key: hz.key,
      hz: hz,
      behavior: hz.behavior,
      cx: cx,
      cy: cy,
      cell: idx,
      phase: rng.range(0, Math.PI * 2),
      alive: true,
      consumed: false
    };

    switch (hz.behavior) {
      case 'wall': {
        /* Attach to a real wall edge so it reads as a stylised piece of maze */
        var opts = [];
        for (var d = 0; d < 4; d++) {
          if (!(cells[idx] & DIRS[d].bit)) continue;
          var nx = cx + DIRS[d].dx, ny = cy + DIRS[d].dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; // skip outer border
          opts.push(d);
        }
        if (!opts.length) return null;
        ent.dir = opts[rng.int(0, opts.length - 1)];
        ent.dirBit = DIRS[ent.dir].bit;
        ent.broken = false;
        break;
      }

      case 'tile':
      case 'item':
      case 'zapStatic':
        break;

      case 'zapToggle':
        ent.cycle = hz.fx.cycle || 2.5;
        ent.offset = rng.range(0, ent.cycle);
        ent.span = hz.fx.span ? rng.int(1, 2) : 0;
        break;

      case 'zapStrike':
        ent.arm = hz.fx.arm || 1.0;
        ent.timer = rng.range(0, ent.arm * 2);
        ent.state = 'idle';
        break;

      case 'zapPatrol':
      case 'mob': {
        ent.route = corridorRoute(cells, w, h, idx, rng.int(4, 10), rng);
        if (ent.route.length < 2) return null;
        ent.leg = 0;
        ent.legT = 0;
        ent.forward = true;
        ent.speed = hz.fx.speed || 1.0;
        ent.x = cx + 0.5;
        ent.y = cy + 0.5;
        break;
      }

      case 'zapChase':
        ent.x = cx + 0.5;
        ent.y = cy + 0.5;
        ent.speed = hz.fx.speed || 1.4;
        ent.wake = 0;
        /* A hunter that is already moving the instant you respawn can camp
         * the start and kill you forever. Give the boy a head start. */
        ent.sleep = 1.4;
        break;

      default:
        return null;
    }
    return ent;
  }

  /* ---------------------------------------------------------------- rooms
   *
   * Four to six open rooms are cut into every board. Walking into one blows
   * it up to fill the screen and starts a mini-game; the exits stay usable
   * throughout, so a room can always be walked straight through.
   *
   * Carving only ever REMOVES walls, so it can add connectivity but never
   * take it away - a board that was solvable before is still solvable after,
   * which is why this runs after the maze is carved and braided rather than
   * being woven into generation.
   *
   * Rooms keep clear of the start, the exit and the board edge, and never
   * touch each other, so two rooms cannot merge into one cavern.
   */
  function carveRooms(cfg, cells, rng, startIdx, exitIdx, games) {
    var w = cfg.w, h = cfg.h;
    var rooms = [];
    var roomAt = new Int16Array(w * h).fill(-1);
    if (!games || !games.length) return { rooms: rooms, roomAt: roomAt };

    /* Small boards get small rooms, or there would be no maze left. */
    var maxSide = Math.max(3, Math.min(4, Math.floor(Math.min(w, h) / 4)));
    var want = rng.int(4, 6);
    var sx = startIdx % w, sy = (startIdx / w) | 0;
    var ex = exitIdx % w, ey = (exitIdx / w) | 0;

    var tries = 400;
    while (rooms.length < want && tries-- > 0) {
      var rw = rng.int(3, maxSide);
      var rh = rng.int(3, maxSide);
      if (rw + 4 >= w || rh + 4 >= h) continue;
      var x0 = rng.int(1, w - rw - 2);
      var y0 = rng.int(1, h - rh - 2);

      /* A one-cell moat around the room keeps rooms apart and stops a room
       * swallowing the start or the exit. */
      var clash = false;
      for (var yy = y0 - 1; yy <= y0 + rh && !clash; yy++) {
        for (var xx = x0 - 1; xx <= x0 + rw; xx++) {
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          var ci = yy * w + xx;
          if (roomAt[ci] !== -1) { clash = true; break; }
          if (ci === startIdx || ci === exitIdx) { clash = true; break; }
          if (Math.abs(xx - sx) + Math.abs(yy - sy) < 3) { clash = true; break; }
          if (Math.abs(xx - ex) + Math.abs(yy - ey) < 3) { clash = true; break; }
        }
      }
      if (clash) continue;

      var id = rooms.length;
      var list = [];
      var x, y, i, d;

      /* Open the interior: drop every wall between two cells of the room. */
      for (y = y0; y < y0 + rh; y++) {
        for (x = x0; x < x0 + rw; x++) {
          i = y * w + x;
          roomAt[i] = id;
          list.push(i);
          for (d = 0; d < 4; d++) {
            var nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
            if (nx < x0 || ny < y0 || nx >= x0 + rw || ny >= y0 + rh) continue;
            cells[i] &= ~DIRS[d].bit;
            cells[ny * w + nx] &= ~DIRS[d].opp;
          }
        }
      }

      /* Count the ways out that the maze already gave us, and cut more if
       * there are fewer than two - a room with one door is a dead end, and a
       * room with none is a sealed box the player can never reach. */
      var exits = [];
      var candidates = [];
      for (y = y0; y < y0 + rh; y++) {
        for (x = x0; x < x0 + rw; x++) {
          i = y * w + x;
          for (d = 0; d < 4; d++) {
            var ox = x + DIRS[d].dx, oy = y + DIRS[d].dy;
            if (ox < 0 || oy < 0 || ox >= w || oy >= h) continue;
            if (ox >= x0 && oy >= y0 && ox < x0 + rw && oy < y0 + rh) continue;
            if (cells[i] & DIRS[d].bit) candidates.push({ i: i, d: d, o: oy * w + ox });
            else exits.push({ i: i, d: d, o: oy * w + ox });
          }
        }
      }
      rng.shuffle(candidates);
      while (exits.length < 2 && candidates.length) {
        var c = candidates.pop();
        cells[c.i] &= ~DIRS[c.d].bit;
        cells[c.o] &= ~DIRS[c.d].opp;
        exits.push(c);
      }

      rooms.push({
        id: id,
        x0: x0, y0: y0, w: rw, h: rh,
        cx: x0 + rw / 2, cy: y0 + rh / 2,
        cells: list,
        exits: exits.map(function (e) { return { from: e.i, to: e.o, dir: e.d }; }),
        game: games[rng.int(0, games.length - 1)],
        cleared: false
      });
    }

    return { rooms: rooms, roomAt: roomAt };
  }

  /* ------------------------------------------------------------- assembly */

  function build(boardNumber) {
    var cfg = boardConfig(boardNumber);
    var rng = new Rng('wonky-boy-board-' + cfg.board);
    var w = cfg.w, h = cfg.h;

    var cells = carve(cfg, rng);
    braid(cfg, cells, rng);

    var startIdx = 0;                 // top-left
    var exitIdx = pickExit(cfg, cells, rng, startIdx);

    var games = (SB.MINIGAMES && SB.MINIGAMES.keys) ? SB.MINIGAMES.keys() : [];
    var roomInfo = carveRooms(cfg, cells, rng, startIdx, exitIdx, games);

    var hazards = placeHazards(cfg, cells, rng, startIdx, exitIdx, roomInfo.roomAt);

    /* Cell lookup so the physics step only tests what is underfoot. */
    var byCell = new Array(w * h);
    var wallHaz = {};
    hazards.forEach(function (e) {
      if (e.behavior === 'wall') {
        wallHaz[e.cell + ':' + e.dir] = e;
        var nx = e.cx + DIRS[e.dir].dx, ny = e.cy + DIRS[e.dir].dy;
        wallHaz[(ny * w + nx) + ':' + ((e.dir + 2) % 4)] = e;
        return;
      }
      if (e.behavior === 'zapPatrol' || e.behavior === 'zapChase' || e.behavior === 'mob') return;
      if (!byCell[e.cell]) byCell[e.cell] = [];
      byCell[e.cell].push(e);
    });

    var solution = findPath(cells, w, h, startIdx, exitIdx, null) || [];

    return {
      cfg: cfg,
      board: cfg.board,
      w: w,
      h: h,
      cells: cells,
      start: { x: startIdx % w, y: (startIdx / w) | 0, idx: startIdx },
      exit: { x: exitIdx % w, y: (exitIdx / w) | 0, idx: exitIdx },
      hazards: hazards,
      byCell: byCell,
      rooms: roomInfo.rooms,
      roomAt: roomInfo.roomAt,
      wallHaz: wallHaz,
      solution: solution,
      /* Which hazard types this board actually contains - used for the
       * "new hazard" callout and for the codex unlock. */
      types: (function () {
        var seen = {}, out = [];
        hazards.forEach(function (e) {
          if (seen[e.key]) return;
          seen[e.key] = 1;
          out.push(e.hz);
        });
        return out;
      })(),
      hasWall: function (x, y, d) {
        if (x < 0 || y < 0 || x >= w || y >= h) return true;
        return !!(this.cells[y * w + x] & DIRS[d].bit);
      }
    };
  }

  global.SB.MAZE = {
    build: build,
    boardConfig: boardConfig,
    findPath: findPath,
    TOTAL_BOARDS: TOTAL_BOARDS,
    DIRS: DIRS,
    N: N, E: E, S: S, W: W
  };
})(window);

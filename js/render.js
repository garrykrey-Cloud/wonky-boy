/* Wonky Boy - render.js
 * ---------------------------------------------------------------------------
 * Canvas drawing.
 *
 * THE COLOUR RULE, enforced by sigShape() below: a hazard may be any colour it
 * likes, but it is ALWAYS wrapped in the light blue signature - an outer glow,
 * a rim stroke and an inner core. That is what makes a thing read as "hazard"
 * at a glance, and swapping SB.THEME to the girl variant turns every one of
 * those signatures pink in a single step.
 *
 * The map is drawn live each frame, culled to the handful of cells actually
 * on screen, so it stays crisp at any zoom with no huge offscreen canvas.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SB = global.SB;
  var THEME = SB.THEME;
  var DIRS = SB.MAZE.DIRS;
  var ENT = SB.ENTITIES;

  /* Cells visible across the short edge of the screen. Halving this doubles
   * the on-screen size of every corridor. */
  var VISIBLE_CELLS = 5.25;
  var WALL_W = 0.155;        // wall thickness in cells
  var PLAYER_ART = 1.3;      // sprite scale, tuned against the collision radius

  function rgbaHue(h, s, l, a) { return THEME.hue(h, s, l, a); }

  /* Shortest distance between two hues, 0..180 degrees. */
  function hueGap(a, b) {
    var d = (((a - b) % 360) + 360) % 360;
    return d > 180 ? 360 - d : d;
  }

  /* The board's palette. Worked out once per board, not per frame. */
  function paletteFor(maze) {
    var floorBase = (maze.board * 47) % 360;

    /* Plain walls take their colour from the board, but are pushed out of the
     * signature's hue band. Ordinary scenery must never be mistaken for a
     * hazard just because a board happened to roll a blue palette. */
    var sigH = THEME.sigHue();
    var wallHue = floorBase + 190;
    if (hueGap(wallHue, sigH) < 50) wallHue += 95;
    if (hueGap(wallHue, sigH) < 50) wallHue += 95;   // belt and braces

    return { floorBase: floorBase, wallHue: wallHue };
  }

  /* ------------------------------------------------- floor and walls -----
   * The map is drawn live, cell by cell, clipped to what is actually on
   * screen. At this zoom only about six by eleven cells are visible, so this
   * is cheap - and unlike a pre-baked image it stays perfectly crisp however
   * far in the camera is zoomed, with no giant offscreen canvas to hold.
   * Everything here is a pure function of the cell coordinates, so the board
   * looks identical every time it is drawn. */
  Renderer.prototype.drawMap = function (g, maze, view) {
    var pal = this.pal;
    var x, y, ci, d;

    for (y = view.y0; y <= view.y1; y++) {
      for (x = view.x0; x <= view.x1; x++) {
        var swirl = Math.sin(x * 0.55) + Math.cos(y * 0.42);
        var hue = pal.floorBase + swirl * 26 + ((x * 5 + y * 3) % 4) * 7;
        var lit = 21 + ((x + y) % 2) * 2.4 + ((x * 3 + y * 7) % 3) * 1.4;

        g.fillStyle = rgbaHue(hue, 44, lit, 1);
        g.fillRect(x, y, 1.002, 1.002);

        /* a lighter inset so each cell reads as a tile */
        g.fillStyle = rgbaHue(hue + 14, 50, lit + 5, 0.5);
        g.fillRect(x + 0.16, y + 0.16, 0.68, 0.68);

        /* two deterministic flecks of confetti per cell */
        for (var k = 0; k < 2; k++) {
          var n = hash2(x, y, k);
          g.fillStyle = rgbaHue((n * 360) % 360, 85, 65, 0.11);
          g.beginPath();
          g.arc(x + 0.15 + ((n * 7.3) % 1) * 0.7,
                y + 0.15 + ((n * 13.7) % 1) * 0.7,
                0.035 + ((n * 3.1) % 1) * 0.075, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    /* Walls. Each shared wall belongs to exactly one cell so it is stroked
     * once: north and west always, south and east only on the outer border. */
    g.lineCap = 'round';
    for (y = view.y0; y <= view.y1; y++) {
      for (x = view.x0; x <= view.x1; x++) {
        ci = y * maze.w + x;
        for (d = 0; d < 4; d++) {
          if (!(maze.cells[ci] & DIRS[d].bit)) continue;
          if (d === 2 && y !== maze.h - 1) continue;   // S, drawn by the neighbour
          if (d === 1 && x !== maze.w - 1) continue;   // E, drawn by the neighbour
          if (maze.wallHaz[ci + ':' + d]) continue;    // hazard walls draw live
          var s = segCell(x, y, d);

          g.strokeStyle = 'rgba(8,6,24,0.85)';
          g.lineWidth = WALL_W + 0.055;
          stroke(g, s);
          g.strokeStyle = rgbaHue(pal.wallHue, 30, 56, 1);
          g.lineWidth = WALL_W;
          stroke(g, s);
          g.strokeStyle = rgbaHue(pal.wallHue, 48, 76, 0.55);
          g.lineWidth = WALL_W * 0.32;
          stroke(g, s);
        }
      }
    }
  };

  /* A wall segment in cell units. */
  function segCell(x, y, d) {
    switch (d) {
      case 0: return { x1: x, y1: y, x2: x + 1, y2: y };
      case 1: return { x1: x + 1, y1: y, x2: x + 1, y2: y + 1 };
      case 2: return { x1: x, y1: y + 1, x2: x + 1, y2: y + 1 };
      default: return { x1: x, y1: y, x2: x, y2: y + 1 };
    }
  }

  /* Small deterministic hash, so the floor decoration is stable per cell. */
  function hash2(x, y, k) {
    var n = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function stroke(g, s) {
    g.beginPath();
    g.moveTo(s.x1, s.y1);
    g.lineTo(s.x2, s.y2);
    g.stroke();
  }

  /* --------------------------------------------------- signature helper */

  /* Draw any hazard shape with its own colour AND the mandatory light blue
   * signature. shapeFn(g) must lay down a path; everything else is automatic. */
  function sigShape(g, shapeFn, hue, opts) {
    opts = opts || {};
    var pulse = opts.pulse === undefined ? 1 : opts.pulse;
    var sat = opts.sat || 78;
    var lit = opts.lit || 56;

    /* 1. outer signature glow */
    g.save();
    g.shadowColor = THEME.sig(0.85 * pulse);
    g.shadowBlur = (opts.glow || 14) * pulse;
    g.fillStyle = rgbaHue(hue, sat, lit, opts.alpha === undefined ? 0.95 : opts.alpha);
    shapeFn(g);
    g.fill();
    g.restore();

    /* 2. signature rim */
    g.save();
    g.strokeStyle = THEME.sig(0.95, opts.rimLit || 0);
    g.lineWidth = opts.rim || 0.04;   // cell units - everything here is scaled
    shapeFn(g);
    g.stroke();
    g.restore();
  }

  /* 3. signature core - a light blue heart inside the thing */
  function sigCore(g, x, y, r, pulse) {
    var grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, THEME.sig(0.95 * pulse, 12));
    grd.addColorStop(0.55, THEME.sig(0.35 * pulse, 4));
    grd.addColorStop(1, THEME.sig(0, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  function circlePath(x, y, r) {
    return function (g) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); };
  }

  function roundRectPath(x, y, w, h, r) {
    return function (g) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
  }

  function starPath(x, y, r, points, inner) {
    return function (g) {
      g.beginPath();
      for (var i = 0; i < points * 2; i++) {
        var rad = i % 2 ? r * inner : r;
        var a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
        var px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
    };
  }

  /* ------------------------------------------------------------ renderer */

  function Renderer(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.maze = null;
    this.pal = null;
    this.camX = 0;
    this.camY = 0;
    this.dpr = 1;
  }

  Renderer.prototype.setBoard = function (maze) {
    this.maze = maze;
    this.pal = paletteFor(maze);
    this.camX = maze.start.x + 0.5;
    this.camY = maze.start.y + 0.5;
  };

  Renderer.prototype.resize = function () {
    var c = this.canvas;
    var dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    var w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    this.dpr = dpr;
    this.vw = w;
    this.vh = h;
  };

  Renderer.prototype.draw = function (state) {
    var g = this.g, maze = this.maze, player = state.player;
    if (!maze) return;
    this.resize();

    var W = this.vw, H = this.vh;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    /* Backdrop */
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, rgbaHue(240, 42, 12, 1));
    bg.addColorStop(1, rgbaHue(268, 38, 7, 1));
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    /* Camera zoom. About five cells across the short edge, so corridors are
     * wide and chunky rather than a distant top-down plan. */
    var mods = state.lastMods || { vision: 1 };
    var visible = this.visibleCells || VISIBLE_CELLS;
    var scale = Math.min(W, H) / visible;
    scale = Math.max(scale, 34);

    /* THE BOY NEVER MOVES ON SCREEN.
     * The camera sits exactly on him, so he stays pinned to the centre of the
     * phone and the maze slides underneath instead. Deliberately no smoothing
     * and no clamping to the board edges - either one would let him drift off
     * centre, which is precisely what this must not do. Boards are always far
     * larger than the screen (see maze.js), so there is always more maze to
     * scroll into view. */
    this.camX = player.x;
    this.camY = player.y;

    /* ...except inside a mini-game room, where the camera lets go of him and
     * eases onto the room instead, zooming until the room fills the view.
     *
     * This is the entire room effect. The maze is untouched: the same cells,
     * the same walls, the same exits, all still working. Only the framing
     * changes, which is why walking out of a room can never break - there is
     * no second world to keep in step, just one world and two framings with a
     * blend between them. */
    var frame = state.rooms && state.rooms.framing ? state.rooms.framing() : null;
    if (frame) {
      var fitX = W / (frame.spanX * scale);
      var fitY = H / (frame.spanY * scale);
      var roomScale = scale * Math.min(fitX, fitY);
      scale = scale + (roomScale - scale) * frame.blend;
      this.camX = player.x + (frame.cx - player.x) * frame.blend;
      this.camY = player.y + (frame.cy - player.y) * frame.blend;
    }

    var shake = player.shake;
    var sx = shake ? (Math.random() - 0.5) * shake * 16 : 0;
    var sy = shake ? (Math.random() - 0.5) * shake * 16 : 0;

    var offX = W / 2 - this.camX * scale + sx;
    var offY = H / 2 - this.camY * scale + sy;

    this.drawParallax(g, W, H, offX, offY);

    /* Everything below works in cell units. */
    g.save();
    g.translate(offX, offY);
    g.scale(scale, scale);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    /* Only the cells actually on screen, plus a one-cell skirt so wall caps
     * and half-visible tiles at the edges are not clipped. */
    var view = {
      x0: Math.max(0, Math.floor(this.camX - (W / scale) / 2) - 1),
      x1: Math.min(maze.w - 1, Math.ceil(this.camX + (W / scale) / 2) + 1),
      y0: Math.max(0, Math.floor(this.camY - (H / scale) / 2) - 1),
      y1: Math.min(maze.h - 1, Math.ceil(this.camY + (H / scale) / 2) + 1)
    };
    this.drawMap(g, maze, view);

    var t = state.time;
    this.drawBoardEdge(g, maze, t);
    this.drawExit(g, maze, t);
    if (player.revealed > 0) this.drawSolution(g, maze, t);
    this.drawTemp(g, state);
    this.drawHazards(g, state, t, scale);
    /* The encounter draws between the hazards and the boy, in cell units, so
     * it sits on the floor of the room and he walks over the top of it. */
    if (state.rooms) state.rooms.draw(g, t);
    this.drawPlayer(g, state, t);

    g.restore();

    /* Fog is a screen-space effect, so it goes on after the world transform */
    if (mods.vision < 0.99) this.drawFog(g, W, H, offX, offY, scale, player, mods);

    /* The board is several screens across, so when the exit is off-screen the
     * player needs to know which way to wobble. */
    this.drawExitPointer(g, W, H, offX, offY, scale, maze, player, t);

    /* Phase shimmer */
    if (player.phase > 0) {
      g.fillStyle = THEME.sig(0.10);
      g.fillRect(0, 0, W, H);
    }
  };

  /* A drifting layer behind the board, scrolling slower than the maze itself.
   * It gives the space beyond the board something to be, and - because it
   * moves at a different rate to the maze - it sells the fact that the world
   * is sliding around a boy who is standing still. */
  var PARALLAX_SPAN = 260;
  var PARALLAX_DOTS = (function () {
    var out = [];
    for (var i = 0; i < 16; i++) {
      var a = Math.sin(i * 12.9898) * 43758.5453;
      var b = Math.sin(i * 78.233) * 12345.6789;
      out.push({
        x: (a - Math.floor(a)) * PARALLAX_SPAN,
        y: (b - Math.floor(b)) * PARALLAX_SPAN,
        r: 12 + ((i * 37) % 46),
        hue: (i * 53) % 360
      });
    }
    return out;
  })();

  Renderer.prototype.drawParallax = function (g, W, H, offX, offY) {
    var k = 0.25;
    var px = ((offX * k) % PARALLAX_SPAN + PARALLAX_SPAN) % PARALLAX_SPAN;
    var py = ((offY * k) % PARALLAX_SPAN + PARALLAX_SPAN) % PARALLAX_SPAN;
    var cols = Math.ceil(W / PARALLAX_SPAN) + 1;
    var rows = Math.ceil(H / PARALLAX_SPAN) + 1;

    g.save();
    for (var c = -1; c < cols; c++) {
      for (var r = -1; r < rows; r++) {
        for (var i = 0; i < PARALLAX_DOTS.length; i++) {
          var d = PARALLAX_DOTS[i];
          var x = d.x + px + c * PARALLAX_SPAN;
          var y = d.y + py + r * PARALLAX_SPAN;
          if (x < -d.r || y < -d.r || x > W + d.r || y > H + d.r) continue;
          var grd = g.createRadialGradient(x, y, 0, x, y, d.r);
          grd.addColorStop(0, rgbaHue(d.hue, 70, 55, 0.13));
          grd.addColorStop(1, rgbaHue(d.hue, 70, 55, 0));
          g.fillStyle = grd;
          g.beginPath();
          g.arc(x, y, d.r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.restore();
  };

  /* The camera is welded to the boy, so near a corner you see past the edge of
   * the board. Give the board a lit rim so that space reads as deliberate -
   * a lump of maze floating in the dark - rather than as a rendering gap. */
  Renderer.prototype.drawBoardEdge = function (g, maze, t) {
    var pulse = 0.55 + Math.sin(t * 1.4) * 0.15;
    g.save();
    g.shadowColor = THEME.sig(0.5);
    g.shadowBlur = 22;
    g.strokeStyle = THEME.sig(0.45 * pulse);
    g.lineWidth = 0.09;
    g.strokeRect(-0.045, -0.045, maze.w + 0.09, maze.h + 0.09);
    g.restore();

    g.save();
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 0.03;
    g.strokeRect(0, 0, maze.w, maze.h);
    g.restore();
  };

  Renderer.prototype.drawExit = function (g, maze, t) {
    var x = maze.exit.x + 0.5, y = maze.exit.y + 0.5;
    var pulse = 0.72 + Math.sin(t * 3) * 0.28;

    g.save();
    g.shadowColor = 'hsla(46,100%,62%,0.95)';
    g.shadowBlur = 26 * pulse;
    for (var ring = 0; ring < 3; ring++) {
      g.strokeStyle = 'hsla(' + (44 + ring * 8) + ',100%,' + (62 - ring * 6) + '%,' + (0.85 - ring * 0.22) + ')';
      g.lineWidth = 0.06;
      g.beginPath();
      g.arc(x, y, 0.18 + ring * 0.11 + pulse * 0.05, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = 'hsla(48,100%,72%,' + (0.55 + pulse * 0.35) + ')';
    g.beginPath();
    g.arc(x, y, 0.15, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  Renderer.prototype.drawSolution = function (g, maze, t) {
    g.save();
    g.strokeStyle = THEME.sig(0.55);
    g.lineWidth = 0.06;
    g.setLineDash([0.18, 0.18]);
    g.lineDashOffset = -t * 0.8;
    g.beginPath();
    for (var i = 0; i < maze.solution.length; i++) {
      var c = maze.solution[i];
      var x = (c % maze.w) + 0.5, y = ((c / maze.w) | 0) + 0.5;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.restore();
  };

  Renderer.prototype.drawTemp = function (g, state) {
    for (var i = 0; i < state.temp.length; i++) {
      var tp = state.temp[i];
      var a = Math.min(1, tp.ttl / 2);
      sigShape(g, circlePath(tp.x, tp.y, tp.r), tp.hz.hue,
        { alpha: 0.35 * a, glow: 8, rim: 0.03, sat: 70, lit: 52, pulse: a });
    }
  };

  /* ------------------------------------------------------- hazard shapes */

  Renderer.prototype.drawHazards = function (g, state, t, scale) {
    var maze = state.maze;
    g.lineWidth = 0.035;

    for (var i = 0; i < maze.hazards.length; i++) {
      var e = maze.hazards[i];
      if (e.consumed) continue;
      var hz = e.hz;
      var hue = hz.fx.rainbow ? (t * 90) % 360 : hz.hue;
      var pulse = 0.75 + Math.sin(t * 4 + e.phase) * 0.25;

      switch (e.behavior) {
        case 'wall':
          if (!e.broken) this.drawHazardWall(g, e, hue, t);
          break;

        case 'tile':
          this.drawTile(g, e, hue, pulse, t);
          break;

        case 'item':
          this.drawItem(g, e, hue, pulse, t);
          break;

        case 'zapStatic':
          this.drawZapStatic(g, e, hue, pulse, t);
          break;

        case 'zapToggle':
          this.drawZapToggle(g, e, hue, t);
          break;

        case 'zapStrike':
          this.drawZapStrike(g, e, hue, t);
          break;

        case 'zapPatrol':
        case 'zapChase':
          this.drawZapMover(g, e, hue, pulse, t);
          break;

        case 'mob':
          this.drawMob(g, e, hue, pulse, t);
          break;
      }
    }
  };

  Renderer.prototype.drawHazardWall = function (g, e, hue, t) {
    var s = segCell(e.cx, e.cy, e.dir);
    var wob = e.hz.fx.shift ? Math.sin(t * 2 + e.phase) * 0.05 : 0;
    var path = function (gg) {
      gg.beginPath();
      gg.moveTo(s.x1 + wob, s.y1);
      gg.lineTo(s.x2 + wob, s.y2);
    };

    g.save();
    g.lineCap = 'round';
    /* body in the hazard own colour */
    g.shadowColor = THEME.sig(0.9);
    g.shadowBlur = 12;
    g.strokeStyle = rgbaHue(hue, 80, 55, 1);
    g.lineWidth = WALL_W * 1.25;
    path(g);
    g.stroke();
    g.restore();

    /* light blue signature rim running along the whole wall */
    g.save();
    g.strokeStyle = THEME.sig(0.9, 10);
    g.lineWidth = WALL_W * 0.34;
    path(g);
    g.stroke();
    g.restore();

    /* signature ticks so even a plain-looking wall reads as hazardous */
    var midx = (s.x1 + s.x2) / 2, midy = (s.y1 + s.y2) / 2;
    sigCore(g, midx, midy, 0.24, 0.6 + Math.sin(t * 5 + e.phase) * 0.3);
    this.glyph(g, e.hz.glyph, midx, midy, 0.16);
  };

  Renderer.prototype.drawTile = function (g, e, hue, pulse, t) {
    var x = e.cx + 0.06, y = e.cy + 0.06, s = 0.88;
    sigShape(g, roundRectPath(x, y, s, s, 0.16), hue,
      { alpha: 0.5, glow: 10, rim: 0.035, sat: 75, lit: 50, pulse: pulse });
    /* moving texture so tiles are alive */
    g.save();
    g.globalAlpha = 0.5;
    g.strokeStyle = rgbaHue(hue, 90, 72, 0.8);
    g.lineWidth = 0.04;
    for (var i = 0; i < 3; i++) {
      var o = ((t * 0.4 + i / 3) % 1) * s;
      g.beginPath();
      g.moveTo(x, y + o);
      g.lineTo(x + s, y + o);
      g.stroke();
    }
    g.restore();
    sigCore(g, e.cx + 0.5, e.cy + 0.5, 0.3, pulse * 0.8);
    this.glyph(g, e.hz.glyph, e.cx + 0.5, e.cy + 0.5, 0.2);
  };

  Renderer.prototype.drawItem = function (g, e, hue, pulse, t) {
    var x = e.cx + 0.5, y = e.cy + 0.5 + Math.sin(t * 2.4 + e.phase) * 0.06;
    var boon = SB.HAZARDS.isBoon(e.hz);
    sigShape(g, starPath(x, y, 0.26, boon ? 6 : 5, 0.52), hue,
      { alpha: 0.95, glow: 16, rim: 0.04, sat: 88, lit: 60, pulse: pulse });
    sigCore(g, x, y, 0.2, pulse);
    this.glyph(g, e.hz.glyph, x, y, 0.17);
  };

  Renderer.prototype.drawZapStatic = function (g, e, hue, pulse, t) {
    var x = e.cx + 0.5, y = e.cy + 0.5;
    var r = 0.3 + Math.sin(t * 9 + e.phase) * 0.03;
    sigShape(g, starPath(x, y, r, 8, 0.42), hue,
      { alpha: 0.95, glow: 20, rim: 0.045, sat: 95, lit: 58, pulse: pulse });
    sigCore(g, x, y, 0.26, pulse);
    this.sparks(g, x, y, 0.34, t + e.phase, 4);
  };

  Renderer.prototype.drawZapToggle = function (g, e, hue, t) {
    var list = ENT.toggleCells(this.maze, e) || [e.cell];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var x = (c % this.maze.w) + 0.5, y = ((c / this.maze.w) | 0) + 0.5;
      var live = (e.liveCells || []).indexOf(c) >= 0;
      if (live) {
        sigShape(g, roundRectPath(x - 0.4, y - 0.4, 0.8, 0.8, 0.14), hue,
          { alpha: 0.9, glow: 22, rim: 0.05, sat: 96, lit: 60, pulse: 1 });
        sigCore(g, x, y, 0.34, 1);
        this.sparks(g, x, y, 0.36, t * 2 + i, 5);
      } else {
        /* Telegraph: dim, but unmistakably the same hazard. */
        g.save();
        g.globalAlpha = 0.42;
        g.strokeStyle = rgbaHue(hue, 70, 52, 0.9);
        g.lineWidth = 0.04;
        g.setLineDash([0.09, 0.09]);
        roundRectPath(x - 0.36, y - 0.36, 0.72, 0.72, 0.12)(g);
        g.stroke();
        g.setLineDash([]);
        g.strokeStyle = THEME.sig(0.5);
        g.lineWidth = 0.02;
        g.stroke();
        g.restore();
      }
    }
  };

  Renderer.prototype.drawZapStrike = function (g, e, hue, t) {
    var x = e.cx + 0.5, y = e.cy + 0.5;
    if (e.state === 'firing') {
      sigShape(g, starPath(x, y, 0.44, 10, 0.36), hue,
        { alpha: 1, glow: 26, rim: 0.05, sat: 98, lit: 64, pulse: 1 });
      sigCore(g, x, y, 0.4, 1);
    } else if (e.state === 'arming') {
      var k = Math.min(1, e.timer / e.arm);
      g.save();
      g.globalAlpha = 0.35 + k * 0.5;
      g.strokeStyle = rgbaHue(hue, 92, 58, 1);
      g.lineWidth = 0.05;
      g.beginPath();
      g.arc(x, y, 0.42 - k * 0.2, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = THEME.sig(0.85);
      g.lineWidth = 0.022;
      g.stroke();
      g.restore();
      sigCore(g, x, y, 0.16 + k * 0.16, 0.4 + k * 0.6);
    } else {
      g.save();
      g.globalAlpha = 0.3;
      sigShape(g, circlePath(x, y, 0.2), hue,
        { alpha: 0.6, glow: 6, rim: 0.025, sat: 60, lit: 44, pulse: 0.4 });
      g.restore();
    }
    this.glyph(g, e.hz.glyph, x, y, 0.16);
  };

  Renderer.prototype.drawZapMover = function (g, e, hue, pulse, t) {
    var spin = t * (e.hz.fx.chase ? 7 : 4.5) + e.phase;
    g.save();
    g.translate(e.x, e.y);
    g.rotate(spin);
    sigShape(g, starPath(0, 0, 0.3, e.hz.fx.chase ? 6 : 9, 0.5), hue,
      { alpha: 0.98, glow: 20, rim: 0.045, sat: 94, lit: 58, pulse: pulse });
    g.restore();
    sigCore(g, e.x, e.y, 0.24, pulse);
    this.sparks(g, e.x, e.y, 0.34, t * 1.6 + e.phase, 4);
  };

  Renderer.prototype.drawMob = function (g, e, hue, pulse, t) {
    var fx = e.hz.fx;
    var r = fx.aura ? 0.44 : 0.28;

    if (fx.aura || fx.pull) {
      var range = fx.aura ? fx.aura : 3.2;
      g.save();
      g.globalAlpha = 0.16 + Math.sin(t * 2 + e.phase) * 0.05;
      var grd = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, range);
      grd.addColorStop(0, THEME.sig(0.6));
      grd.addColorStop(1, THEME.sig(0));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(e.x, e.y, range, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    if (fx.swarm) {
      for (var i = 0; i < 5; i++) {
        var a = t * 2.2 + i * 1.257 + e.phase;
        var rr = 0.34 + Math.sin(t * 3 + i) * 0.16;
        sigShape(g, circlePath(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, 0.09), hue,
          { alpha: 0.95, glow: 10, rim: 0.02, sat: 88, lit: 66, pulse: pulse });
      }
      sigCore(g, e.x, e.y, 0.22, pulse * 0.7);
      return;
    }

    var squash = 1 + Math.sin(t * 5 + e.phase) * 0.12;
    g.save();
    g.translate(e.x, e.y);
    g.scale(1 / squash, squash);
    sigShape(g, roundRectPath(-r, -r, r * 2, r * 2, r * 0.55), hue,
      { alpha: fx.ghost ? 0.55 : 0.95, glow: 16, rim: 0.045, sat: 84, lit: 56, pulse: pulse });
    g.restore();

    /* eyes, because everything is friendlier with eyes */
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath(); g.arc(e.x - r * 0.34, e.y - r * 0.12, r * 0.20, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(e.x + r * 0.34, e.y - r * 0.12, r * 0.20, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(20,16,40,0.95)';
    g.beginPath(); g.arc(e.x - r * 0.30, e.y - r * 0.10, r * 0.10, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(e.x + r * 0.38, e.y - r * 0.10, r * 0.10, 0, Math.PI * 2); g.fill();

    sigCore(g, e.x, e.y + r * 0.5, r * 0.6, pulse * 0.6);
  };

  Renderer.prototype.sparks = function (g, x, y, r, t, n) {
    g.save();
    g.strokeStyle = THEME.sig(0.85, 14);
    g.lineWidth = 0.022;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + t * 2.2;
      var l = r * (0.9 + Math.sin(t * 11 + i * 2) * 0.35);
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    g.restore();
  };

  Renderer.prototype.glyph = function (g, text, x, y, size) {
    if (!text) return;
    g.save();
    g.font = '600 ' + size + 'px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(12,10,26,0.72)';
    g.fillText(text, x, y + size * 0.04);
    g.restore();
  };

  /* --------------------------------------------------------- the boy */

  Renderer.prototype.drawPlayer = function (g, state, t) {
    var p = state.player;
    var c = THEME.current;
    var mods = state.lastMods || { slop: 0.1 };
    var slop = mods.slop;

    /* wobble tail showing where his last few frames went */
    g.save();
    for (var i = 0; i < p.trail.length; i++) {
      var a = (i / p.trail.length) * 0.22;
      g.fillStyle = THEME.sig(a);
      g.beginPath();
      g.arc(p.trail[i].x, p.trail[i].y, 0.05 + i * 0.008, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    var x = p.x, y = p.y;
    var lean = Math.max(-0.5, Math.min(0.5, p.vx * 0.06));
    var bob = Math.sin(p.limbPhase) * 0.02;

    /* Limb wobble is driven directly by current sloppiness, so you can SEE
     * how sloppy he is before you feel it. */
    var amp = 0.16 + slop * 0.9;
    var f = p.limbPhase;

    g.save();
    g.translate(x, y + bob);
    g.rotate(lean * 0.5);
    /* The sprite was drawn much smaller than his collision circle, which at
     * this zoom made him look like he was clipping walls from a distance.
     * Scale the art so what you see is roughly what collides. */
    g.scale(PLAYER_ART, PLAYER_ART);

    /* shadow */
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.beginPath();
    g.ellipse(0, 0.24, 0.2, 0.07, 0, 0, Math.PI * 2);
    g.fill();

    if (p.shield > 0) {
      g.strokeStyle = THEME.sig(0.85);
      g.lineWidth = 0.035;
      g.beginPath();
      g.arc(0, -0.02, 0.34 + Math.sin(t * 4) * 0.02, 0, Math.PI * 2);
      g.stroke();
    }

    g.lineCap = 'round';

    /* legs */
    g.strokeStyle = c.pants;
    g.lineWidth = 0.075;
    var l1 = Math.sin(f) * amp, l2 = Math.sin(f + Math.PI) * amp;
    g.beginPath(); g.moveTo(-0.045, 0.09); g.lineTo(-0.045 + l1 * 0.5, 0.235); g.stroke();
    g.beginPath(); g.moveTo(0.045, 0.09); g.lineTo(0.045 + l2 * 0.5, 0.235); g.stroke();
    g.strokeStyle = c.shoe;
    g.lineWidth = 0.06;
    g.beginPath(); g.moveTo(-0.045 + l1 * 0.5, 0.235); g.lineTo(-0.045 + l1 * 0.5 + 0.05, 0.245); g.stroke();
    g.beginPath(); g.moveTo(0.045 + l2 * 0.5, 0.235); g.lineTo(0.045 + l2 * 0.5 + 0.05, 0.245); g.stroke();

    /* body */
    g.fillStyle = c.shirt;
    roundRectPath(-0.085, -0.075, 0.17, 0.175, 0.055)(g);
    g.fill();

    /* arms - these are the sloppy bit, flailing with the slop value */
    g.strokeStyle = c.skin;
    g.lineWidth = 0.058;
    var a1 = Math.sin(f * 1.35 + 1.1) * amp * 1.5;
    var a2 = Math.sin(f * 1.35 + 4.0) * amp * 1.5;
    g.beginPath(); g.moveTo(-0.08, -0.045); g.lineTo(-0.155 - a1 * 0.35, -0.02 + a1 * 0.42); g.stroke();
    g.beginPath(); g.moveTo(0.08, -0.045); g.lineTo(0.155 + a2 * 0.35, -0.02 + a2 * 0.42); g.stroke();

    /* head */
    g.fillStyle = c.skin;
    g.beginPath();
    g.arc(0, -0.145, 0.088, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = c.hair;
    g.beginPath();
    g.arc(0, -0.168, 0.088, Math.PI * 1.05, Math.PI * 1.95);
    g.fill();

    /* face - eyes cross when he is very sloppy */
    g.fillStyle = 'rgba(24,18,40,0.9)';
    var eye = Math.min(1, slop / 0.6);
    g.beginPath(); g.arc(-0.032 + eye * 0.01, -0.15, 0.014, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0.032 - eye * 0.01, -0.15, 0.014, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(24,18,40,0.75)';
    g.lineWidth = 0.012;
    g.beginPath();
    g.arc(0, -0.115, 0.026, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();

    g.restore();

    if (p.stun > 0) {
      g.save();
      g.strokeStyle = THEME.sig(0.9);
      g.lineWidth = 0.028;
      for (var s = 0; s < 3; s++) {
        var sa = t * 6 + s * 2.1;
        g.beginPath();
        g.arc(x + Math.cos(sa) * 0.2, y - 0.3 + Math.sin(sa) * 0.06, 0.035, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    }
  };

  /* An arrow pinned to the edge of the screen, pointing at the exit, with how
   * far away it is. Only shown while the exit is actually off-screen. */
  Renderer.prototype.drawExitPointer = function (g, W, H, offX, offY, scale, maze, player, t) {
    var ex = maze.exit.x + 0.5, ey = maze.exit.y + 0.5;
    var sx = offX + ex * scale, sy = offY + ey * scale;
    var pad = 34;
    if (sx > pad && sx < W - pad && sy > pad && sy < H - pad) return;

    var cx = W / 2, cy = H / 2;
    var dx = sx - cx, dy = sy - cy;
    var ang = Math.atan2(dy, dx);

    /* Push the arrow out to the edge of a rounded inset rectangle. */
    var mx = (W / 2 - pad) / Math.abs(Math.cos(ang) || 1e-6);
    var my = (H / 2 - pad) / Math.abs(Math.sin(ang) || 1e-6);
    var r = Math.min(mx, my);
    var ax = cx + Math.cos(ang) * r;
    var ay = cy + Math.sin(ang) * r;

    var cells = Math.round(Math.hypot(ex - player.x, ey - player.y));
    var pulse = 0.78 + Math.sin(t * 4) * 0.22;

    g.save();
    g.translate(ax, ay);

    /* the badge */
    g.rotate(0);
    g.shadowColor = 'hsla(46,100%,60%,0.9)';
    g.shadowBlur = 16 * pulse;
    g.fillStyle = 'rgba(14,12,34,0.88)';
    g.beginPath();
    g.arc(0, 0, 21, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'hsla(46,100%,66%,' + (0.7 + pulse * 0.3) + ')';
    g.lineWidth = 2;
    g.stroke();

    /* the arrow */
    g.save();
    g.rotate(ang);
    g.fillStyle = 'hsla(48,100%,68%,1)';
    g.beginPath();
    g.moveTo(13, 0);
    g.lineTo(1, -7.5);
    g.lineTo(4, 0);
    g.lineTo(1, 7.5);
    g.closePath();
    g.fill();
    g.restore();

    /* distance */
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.font = '700 10px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(cells, 0, 11);
    g.restore();
  };

  Renderer.prototype.drawFog = function (g, W, H, offX, offY, scale, player, mods) {
    var px = offX + player.x * scale;
    var py = offY + player.y * scale;
    var r = Math.max(W, H) * 0.62 * mods.vision;
    var grd = g.createRadialGradient(px, py, r * 0.28, px, py, r);
    grd.addColorStop(0, 'rgba(6,6,20,0)');
    grd.addColorStop(0.65, 'rgba(6,6,20,0.72)');
    grd.addColorStop(1, 'rgba(4,4,14,0.97)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  };

  global.SB.Renderer = Renderer;
})(window);

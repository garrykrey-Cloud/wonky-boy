/* Wonky Boy - rooms.js
 * ---------------------------------------------------------------------------
 * The lifecycle of a mini-game room: walking in, the room swelling to fill the
 * screen, the encounter, and the shrink back to the board.
 *
 * THE CAMERA IS THE WHOLE TRICK. Nothing about the maze changes when a room
 * opens - the boy is in the same cells, the same walls are there, the exits
 * work exactly as before. What changes is the framing: the camera stops
 * tracking the boy and instead eases onto the room, zooming until the room
 * fills the view. Shrinking back is the same move played backwards.
 *
 * Doing it that way means the exits cannot break. There is no separate "room
 * mode" world to keep in step with the board; there is one world and two
 * camera framings, blended.
 *
 * STATES
 *   idle      not in a room
 *   opening   blending toward the room framing
 *   active    fully framed, the mini-game is running
 *   closing   blending back to the boy
 *
 * A room is entered by walking into it and left by walking out, at any point.
 * Leaving mid-game abandons the encounter without penalty, which is the point:
 * rooms are optional, and punishing curiosity would teach players to avoid
 * them.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SB = global.SB;

  var OPEN_TIME = 0.42;
  var CLOSE_TIME = 0.34;
  var RESULT_HOLD = 1.1;   // how long the outcome stays on screen

  function smoothstep(p) { return p * p * (3 - 2 * p); }

  function Rooms(state) {
    this.state = state;
    this.reset();
  }

  Rooms.prototype.reset = function () {
    this.mode = 'idle';
    this.room = null;
    this.blend = 0;
    this.t = 0;
    this.ctx = null;
    this.result = null;
    this.resultT = 0;
    this.hud = '';
  };

  Rooms.prototype.roomAtCell = function (cellIdx) {
    var maze = this.state.maze;
    if (!maze || !maze.roomAt) return null;
    var id = maze.roomAt[cellIdx];
    return id === -1 || id === undefined ? null : maze.rooms[id];
  };

  Rooms.prototype.update = function (dt) {
    var st = this.state;
    var p = st.player;
    if (!p || !st.maze) return;

    var cx = Math.floor(p.x), cy = Math.floor(p.y);
    var inBounds = cx >= 0 && cy >= 0 && cx < st.maze.w && cy < st.maze.h;
    var here = inBounds ? this.roomAtCell(cy * st.maze.w + cx) : null;

    switch (this.mode) {
      case 'idle':
        if (here && !here.cleared) this.open(here);
        break;

      case 'opening':
        this.t += dt;
        this.blend = smoothstep(Math.min(1, this.t / OPEN_TIME));
        if (here !== this.room) { this.close(); break; }
        if (this.t >= OPEN_TIME) { this.mode = 'active'; this.blend = 1; }
        break;

      case 'active':
        /* Walked out - abandon, no penalty. */
        if (here !== this.room) { this.close(); break; }
        this.runGame(dt);
        break;

      case 'closing':
        this.t += dt;
        this.blend = 1 - smoothstep(Math.min(1, this.t / CLOSE_TIME));
        if (this.t >= CLOSE_TIME) this.reset();
        break;
    }

    if (this.resultT > 0) this.resultT -= dt;
  };

  Rooms.prototype.open = function (room) {
    var game = SB.MINIGAMES.get(room.game);
    if (!game) return;
    this.mode = 'opening';
    this.room = room;
    this.t = 0;
    this.blend = 0;
    this.result = null;
    this.ctx = {
      room: room,
      s: {},
      player: this.state.player,
      rng: new SB.Rng('room-' + this.state.board + '-' + room.id),
      hud: ''
    };
    this.game = game;
    game.init(this.ctx);
    this.hud = game.name;
  };

  Rooms.prototype.close = function () {
    this.mode = 'closing';
    this.t = 0;
  };

  Rooms.prototype.runGame = function (dt) {
    var g = this.game, c = this.ctx;
    g.update(c, dt);
    this.hud = c.hud || g.goal || g.name;
    var st = g.status(c);
    if (st === 'won' || st === 'lost') {
      this.room.cleared = true;
      this.result = st;
      this.resultT = RESULT_HOLD;
      if (st === 'won' && this.onWin) this.onWin(this.room, g);
      this.close();
    }
  };

  /* How the camera should be framed this instant. Returns null when the board
   * framing applies unchanged. */
  Rooms.prototype.framing = function () {
    if (this.blend <= 0.001 || !this.room) return null;
    var r = this.room;
    return {
      blend: this.blend,
      cx: r.x0 + r.w / 2,
      cy: r.y0 + r.h / 2,
      /* Tight. The room is meant to BECOME the screen, not to sit in a
       * zoomed-out view of the maze with some corridor around it. The margin
       * is just enough to show the exit gaps in the room wall and a sliver of
       * what is beyond them, which is all the brief needs: the way out stays
       * visible and usable. Everything past that is blacked out by the mask
       * below, so the room reads as its own place. */
      spanX: r.w + 1.1,
      spanY: r.h + 1.1
    };
  };

  Rooms.prototype.draw = function (g, t) {
    if (!this.room || this.blend <= 0.01) return;
    var r = this.room;
    var b = this.blend;

    /* 1. BLACK OUT THE REST OF THE MAZE.
     *
     * Without this the room is only a zoomed-out view of the board with a
     * clearing in it, and it never stops feeling like part of the corridor.
     * Four rects around the room - rather than one with a hole punched in it -
     * because a plain fill is far cheaper than an even-odd path and this runs
     * every frame. The reach is generous so nothing pokes out at the corners
     * of a wide screen. */
    var reach = 40;
    g.save();
    g.fillStyle = 'rgba(3,3,10,' + (0.93 * b) + ')';
    g.fillRect(r.x0 - reach, r.y0 - reach, r.w + reach * 2, reach);
    g.fillRect(r.x0 - reach, r.y0 + r.h, r.w + reach * 2, reach);
    g.fillRect(r.x0 - reach, r.y0, reach, r.h);
    g.fillRect(r.x0 + r.w, r.y0, reach, r.h);
    g.restore();

    /* 2. The room as a lit stage. */
    g.save();
    g.globalAlpha = b;
    var grd = g.createRadialGradient(
      r.x0 + r.w / 2, r.y0 + r.h / 2, 0,
      r.x0 + r.w / 2, r.y0 + r.h / 2, Math.max(r.w, r.h) * 0.8);
    grd.addColorStop(0, 'hsla(40,60%,60%,0.10)');
    grd.addColorStop(1, 'hsla(268,50%,40%,0.16)');
    g.fillStyle = grd;
    g.fillRect(r.x0, r.y0, r.w, r.h);

    g.strokeStyle = SB.THEME.sig(0.55 * b);
    g.lineWidth = 0.07;
    g.strokeRect(r.x0 + 0.05, r.y0 + 0.05, r.w - 0.10, r.h - 0.10);
    g.restore();

    /* 3. THE WAYS OUT, marked explicitly.
     *
     * With the maze blacked out the exits would otherwise be invisible holes
     * in a black wall. Each one gets a lit arch on the room side, so leaving
     * is always an obvious option - the brief is specific that the exits stay
     * visible and usable, and blacking out the surroundings would have
     * quietly broken that. */
    g.save();
    g.globalAlpha = b;
    var pulse = 0.55 + Math.sin(t * 3) * 0.25;
    for (var i = 0; i < r.exits.length; i++) {
      var e = r.exits[i];
      var fx = (e.from % this.state.maze.w) + 0.5;
      var fy = ((e.from / this.state.maze.w) | 0) + 0.5;
      var d = SB.MAZE.DIRS[e.dir];
      var ex = fx + d.dx * 0.5, ey = fy + d.dy * 0.5;
      var ang = Math.atan2(d.dy, d.dx);

      var eg = g.createRadialGradient(ex, ey, 0, ex, ey, 0.75);
      eg.addColorStop(0, 'hsla(140,80%,62%,' + (0.5 * pulse) + ')');
      eg.addColorStop(1, 'hsla(140,80%,62%,0)');
      g.fillStyle = eg;
      g.beginPath(); g.arc(ex, ey, 0.75, 0, Math.PI * 2); g.fill();

      g.strokeStyle = 'hsla(140,85%,68%,' + (0.85 * pulse) + ')';
      g.lineWidth = 0.07;
      g.beginPath();
      g.arc(ex, ey, 0.34, ang - Math.PI * 0.62, ang + Math.PI * 0.62);
      g.stroke();
    }
    g.restore();

    /* 4. The encounter itself. */
    if (this.mode === 'active' || this.mode === 'opening') {
      g.save();
      g.globalAlpha = b;
      try { this.game.draw(this.ctx, g, t); } catch (e2) { /* never kill the frame */ }
      g.restore();
    }
  };

  global.SB = global.SB || {};
  global.SB.Rooms = Rooms;
  global.SB.ROOM_CONST = { OPEN_TIME: OPEN_TIME, CLOSE_TIME: CLOSE_TIME };
})(window);

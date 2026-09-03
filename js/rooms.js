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
      /* Fit the room, with a margin so the exits and a slice of the corridor
       * beyond them stay on screen - the brief is explicit that the way out
       * must remain visible. */
      spanX: r.w + 2.2,
      spanY: r.h + 2.2
    };
  };

  Rooms.prototype.draw = function (g, t) {
    if (!this.room || this.blend <= 0.01) return;
    var r = this.room;

    /* A wash over the room so it reads as the lit stage. */
    g.save();
    g.globalAlpha = this.blend;
    g.fillStyle = 'hsla(268,50%,60%,0.06)';
    g.fillRect(r.x0, r.y0, r.w, r.h);
    g.strokeStyle = SB.THEME.sig(0.35 * this.blend);
    g.lineWidth = 0.05;
    g.strokeRect(r.x0 + 0.04, r.y0 + 0.04, r.w - 0.08, r.h - 0.08);
    g.restore();

    if (this.mode === 'active' || this.mode === 'opening') {
      g.save();
      g.globalAlpha = this.blend;
      try { this.game.draw(this.ctx, g, t); } catch (e) { /* never kill the frame */ }
      g.restore();
    }
  };

  global.SB = global.SB || {};
  global.SB.Rooms = Rooms;
  global.SB.ROOM_CONST = { OPEN_TIME: OPEN_TIME, CLOSE_TIME: CLOSE_TIME };
})(window);

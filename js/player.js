/* Wonky Boy - player.js
 * ---------------------------------------------------------------------------
 * THE SLOPPINESS ENGINE.
 *
 * Wonky Boy cannot reliably control his arms and legs. Every movement he
 * makes is the movement you asked for, plus an error term:
 *
 *     baseSlop      10% on board 1, rising to 35% on board 1000
 *     effective     baseSlop * (1 + sum of every active slop modifier)
 *
 * Modifiers come from hazards and go BOTH ways: Itchy Sweater adds +0.55,
 * Calm Blanket subtracts 0.50, and they combine. The result is clamped to a
 * sane band so he is never perfectly steady and never completely unplayable.
 *
 * The error term itself has three parts, because pure white noise feels like
 * a broken controller rather than a clumsy boy:
 *   1. WANDER   slow smoothed drift - his aim quietly wanders off line
 *   2. JITTER   fast small tremor  - his limbs never quite settle
 *   3. STUMBLE  rare big impulse   - a proper trip, with a moment of no control
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SB = global.SB;
  var DIRS = SB.MAZE.DIRS;

  var PLAYER_R = 0.26;      // radius in cells
  var ACCEL = 34;           // cells per second squared
  var MAX_SPEED = 5.4;      // cells per second
  var DRAG = 6.5;
  var WALL_COOLDOWN = 0.45; // seconds before the same wall can zap you again

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Smoothed value noise: random keyframes, eased between. Gives the drift a
   * body-like slowness instead of a per-frame twitch. */
  function Noise(period) {
    this.period = period;
    this.t = 0;
    this.a = Math.random() * 2 - 1;
    this.b = Math.random() * 2 - 1;
  }
  Noise.prototype.step = function (dt) {
    this.t += dt;
    while (this.t >= this.period) {
      this.t -= this.period;
      this.a = this.b;
      this.b = Math.random() * 2 - 1;
    }
    var k = this.t / this.period;
    k = k * k * (3 - 2 * k); // smoothstep
    return lerp(this.a, this.b, k);
  };

  function Player(maze) {
    this.reset(maze);
  }

  Player.prototype.reset = function (maze) {
    this.maze = maze;
    this.x = maze.start.x + 0.5;
    this.y = maze.start.y + 0.5;
    this.vx = 0;
    this.vy = 0;
    this.r = PLAYER_R;
    this.facing = Math.PI / 2;

    this.afflictions = [];     // active timed effects
    this.shield = 0;
    this.stun = 0;
    this.phase = 0;
    this.flail = 0;            // seconds of reduced control after a stumble
    this.revealed = 0;
    this.shake = 0;
    this.dead = false;
    this.won = false;

    this.wanderA = new Noise(0.55);
    this.wanderM = new Noise(0.45);
    this.jitterX = new Noise(0.11);
    this.jitterY = new Noise(0.11);

    this.inputBuffer = [];     // for lag modifiers
    this.wallTouch = {};       // uid -> cooldown remaining
    this.periodics = {};       // key -> timer, for period-based effects
    this.baseSlop = maze.cfg.baseSlop;
    this.trail = [];           // recent positions, for the wobble tail
    this.limbPhase = 0;
    this.stepDist = 0;
  };

  /* ---------------------------------------------------------- modifiers */

  Player.prototype.mods = function () {
    var m = {
      slopSum: 0, speed: 1, grip: 1, turn: 1, lag: 0,
      invert: false, mirror: false, spin: 0, vision: 1, time: 1,
      bounce: 0
    };
    for (var i = 0; i < this.afflictions.length; i++) {
      var f = this.afflictions[i].fx;
      if (f.slop) m.slopSum += f.slop;
      if (f.speed) m.speed += f.speed;
      if (f.grip) m.grip += f.grip;
      if (f.turn) m.turn += f.turn;
      if (f.lag) m.lag += f.lag;
      if (f.invert) m.invert = !m.invert;
      if (f.mirror) m.mirror = !m.mirror;
      if (f.spin) m.spin += f.spin;
      if (f.vision) m.vision *= f.vision;
      if (f.time) m.time *= f.time;
      if (f.bounce) m.bounce = Math.max(m.bounce, f.bounce);
    }
    m.speed = clamp(m.speed, 0.25, 2.6);
    /* Grip has a hard floor. Stacking Slick Ice under a Jelly Bean Spill
     * should be horrible, not a board that cannot be steered at all. */
    m.grip = clamp(m.grip, 0.32, 2.2);
    m.turn = clamp(m.turn, 0.2, 2.0);
    m.lag = clamp(m.lag, 0, 0.6);
    m.vision = clamp(m.vision, 0.2, 2.0);
    m.time = clamp(m.time, 0.5, 1.6);
    /* THE HEADLINE NUMBER: base randomness, pushed around by modifiers. */
    m.slop = clamp(this.baseSlop * (1 + m.slopSum), 0.02, 0.72);
    return m;
  };

  Player.prototype.addAffliction = function (hz, fx, dur, sourceName) {
    var key = hz ? hz.key : sourceName;
    for (var i = 0; i < this.afflictions.length; i++) {
      if (this.afflictions[i].key === key) {
        /* Same source again: refresh rather than stack forever. */
        this.afflictions[i].until = Math.max(this.afflictions[i].until, dur);
        this.afflictions[i].total = Math.max(this.afflictions[i].total, dur);
        return this.afflictions[i];
      }
    }
    var a = {
      key: key,
      name: hz ? hz.name : sourceName,
      hz: hz,
      fx: fx,
      until: dur,
      total: dur,
      boon: hz ? SB.HAZARDS.isBoon(hz) : false
    };
    this.afflictions.push(a);
    return a;
  };

  Player.prototype.cleanse = function () {
    this.afflictions = this.afflictions.filter(function (a) { return a.boon; });
  };

  /* ------------------------------------------------------------ movement */

  Player.prototype.update = function (dt, input, world) {
    var m = this.mods();
    var i;

    /* Tick down afflictions. */
    for (i = this.afflictions.length - 1; i >= 0; i--) {
      this.afflictions[i].until -= dt;
      if (this.afflictions[i].until <= 0) this.afflictions.splice(i, 1);
    }
    for (var uid in this.wallTouch) {
      this.wallTouch[uid] -= dt;
      if (this.wallTouch[uid] <= 0) delete this.wallTouch[uid];
    }

    this.phase = Math.max(0, this.phase - dt);
    this.flail = Math.max(0, this.flail - dt);
    this.revealed = Math.max(0, this.revealed - dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);

    /* Periodic nuisances - Tangle Laces trip him on a timer, Squeaky Shoes
     * nudge him. These live on the affliction, not on the hazard object. */
    for (i = 0; i < this.afflictions.length; i++) {
      var af = this.afflictions[i];
      if (!af.fx.period) continue;
      af.pt = (af.pt || 0) + dt;
      if (af.pt >= af.fx.period) {
        af.pt = 0;
        if (af.fx.stun) this.stun = Math.max(this.stun, af.fx.stun);
        if (af.fx.push) {
          var ang = Math.random() * Math.PI * 2;
          this.vx += Math.cos(ang) * af.fx.push * 2.2;
          this.vy += Math.sin(ang) * af.fx.push * 2.2;
        }
      }
    }

    /* Stun freezes him solid. */
    if (this.stun > 0) {
      this.stun -= dt;
      this.vx *= 0.86;
      this.vy *= 0.86;
      this.integrate(dt, world);
      return m;
    }

    /* Input, delayed if a lag modifier is active. */
    var ix = input.x, iy = input.y;
    this.inputBuffer.push({ t: 0, x: ix, y: iy });
    for (i = 0; i < this.inputBuffer.length; i++) this.inputBuffer[i].t += dt;
    while (this.inputBuffer.length > 2 && this.inputBuffer[0].t > m.lag + 0.05) {
      this.inputBuffer.shift();
    }
    if (m.lag > 0.01) {
      var chosen = this.inputBuffer[0];
      for (i = 0; i < this.inputBuffer.length; i++) {
        if (this.inputBuffer[i].t >= m.lag) chosen = this.inputBuffer[i];
      }
      ix = chosen.x; iy = chosen.y;
    }

    if (m.invert) { ix = -ix; iy = -iy; }
    if (m.mirror) { var tmp = ix; ix = iy; iy = tmp; }

    var mag = Math.sqrt(ix * ix + iy * iy);
    if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }

    var s = m.slop;

    /* The three error terms are tuned so that even at maximum sloppiness he
     * still makes net forward progress. He should feel hopeless, not BE
     * hopeless - a board you cannot finish is not difficulty, it is a wall.
     * These numbers are validated by tools/sim.js across all 1000 boards. */

    /* 1. WANDER - slow drift off the line he intended. Capped well short of
     * a right angle so "forward" always means roughly forward. */
    var wanderAngle = this.wanderA.step(dt) * s * 1.15;
    var wanderMag = 1 + this.wanderM.step(dt) * s * 0.45;

    /* 2. JITTER - constant small tremor in his limbs, present even at rest. */
    var jx = this.jitterX.step(dt) * s * 1.3;
    var jy = this.jitterY.step(dt) * s * 1.3;

    /* 3. STUMBLE - occasional real trip, with a moment of lost control. */
    var stumbleRate = 0.2 + s * 1.8;
    if (Math.random() < stumbleRate * dt) {
      var sa = Math.random() * Math.PI * 2;
      var si = s * MAX_SPEED * (0.35 + Math.random() * 0.4);
      this.vx += Math.cos(sa) * si;
      this.vy += Math.sin(sa) * si;
      this.flail = 0.10 + s * 0.18;
      this.shake = Math.max(this.shake, s * 0.5);
      if (world && world.onStumble) world.onStumble(s);
    }

    /* Control authority: how much of his intent actually reaches his legs. */
    var authority = m.turn * (this.flail > 0 ? 0.45 : 1);

    var dx = 0, dy = 0;
    if (mag > 0.02) {
      var ang = Math.atan2(iy, ix) + wanderAngle;
      dx = Math.cos(ang) * mag * wanderMag;
      dy = Math.sin(ang) * mag * wanderMag;
      this.facing = ang;
    }

    this.vx += (dx * ACCEL * m.speed * authority + jx) * dt;
    this.vy += (dy * ACCEL * m.speed * authority + jy) * dt;

    /* Spin drift - Dizzy Juice and Spin Plates rotate his whole velocity. */
    if (m.spin) {
      var c = Math.cos(m.spin * dt), sn = Math.sin(m.spin * dt);
      var nvx = this.vx * c - this.vy * sn;
      var nvy = this.vx * sn + this.vy * c;
      this.vx = nvx; this.vy = nvy;
    }

    /* Continuous pulls from whirlpools, moles and the Sloppinator.
     * The total pull is capped below what he can walk against, so a puller
     * standing in a mud patch can never hold him there forever. */
    if (world && world.pulls && world.pulls.length) {
      var pullX = 0, pullY = 0;
      for (i = 0; i < world.pulls.length; i++) {
        var p = world.pulls[i];
        var pdx = p.x - this.x, pdy = p.y - this.y;
        var d2 = pdx * pdx + pdy * pdy;
        if (d2 < 0.0001 || d2 > p.range * p.range) continue;
        var d = Math.sqrt(d2);
        var f = p.strength * (1 - d / p.range) * 6;
        pullX += (pdx / d) * f;
        pullY += (pdy / d) * f;
      }
      var pullMag = Math.sqrt(pullX * pullX + pullY * pullY);
      var pullCap = ACCEL * m.speed * 0.45;
      if (pullMag > pullCap) {
        pullX = pullX / pullMag * pullCap;
        pullY = pullY / pullMag * pullCap;
      }
      this.vx += pullX * dt;
      this.vy += pullY * dt;
    }

    /* Drag. Low grip means ice: almost nothing slows him down. */
    var drag = DRAG * m.grip;
    var damp = Math.exp(-drag * dt);
    this.vx *= damp;
    this.vy *= damp;

    var sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    var cap = MAX_SPEED * m.speed * 1.35;
    if (sp > cap) { this.vx = this.vx / sp * cap; this.vy = this.vy / sp * cap; }

    this.stepDist += sp * dt;
    this.limbPhase += sp * dt * 4.2 + dt * 0.7;

    this.integrate(dt, world);
    return m;
  };

  /* Move and resolve against walls. */
  Player.prototype.integrate = function (dt, world) {
    var maze = this.maze;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    var ghost = this.phase > 0;

    for (var pass = 0; pass < 3; pass++) {
      var cx = Math.floor(this.x), cy = Math.floor(this.y);
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          var gx = cx + ox, gy = cy + oy;
          if (gx < 0 || gy < 0 || gx >= maze.w || gy >= maze.h) continue;
          var ci = gy * maze.w + gx;
          for (var d = 0; d < 4; d++) {
            if (!(maze.cells[ci] & DIRS[d].bit)) continue;
            var wallEnt = maze.wallHaz[ci + ':' + d];
            if (wallEnt && wallEnt.broken) continue;

            /* Phasing ignores interior walls but never the outer boundary. */
            var nx2 = gx + DIRS[d].dx, ny2 = gy + DIRS[d].dy;
            var outer = nx2 < 0 || ny2 < 0 || nx2 >= maze.w || ny2 >= maze.h;
            if (ghost && !outer) continue;

            var seg = segmentFor(gx, gy, d);
            var hit = resolveCircleSegment(this, seg);
            if (hit && wallEnt && world && world.onWallHit) {
              if (!this.wallTouch[wallEnt.uid]) {
                this.wallTouch[wallEnt.uid] = WALL_COOLDOWN;
                world.onWallHit(wallEnt, hit);
              }
            }
          }
        }
      }
    }

    this.x = clamp(this.x, this.r, maze.w - this.r);
    this.y = clamp(this.y, this.r, maze.h - this.r);

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 14) this.trail.shift();
  };

  function segmentFor(x, y, d) {
    switch (d) {
      case 0: return { x1: x, y1: y, x2: x + 1, y2: y };          // N
      case 1: return { x1: x + 1, y1: y, x2: x + 1, y2: y + 1 };  // E
      case 2: return { x1: x, y1: y + 1, x2: x + 1, y2: y + 1 };  // S
      default: return { x1: x, y1: y, x2: x, y2: y + 1 };         // W
    }
  }

  /* Push a circle out of a segment. Returns the contact normal, or null. */
  function resolveCircleSegment(p, seg) {
    var ax = seg.x1, ay = seg.y1, bx = seg.x2, by = seg.y2;
    var abx = bx - ax, aby = by - ay;
    var apx = p.x - ax, apy = p.y - ay;
    var ab2 = abx * abx + aby * aby;
    var t = ab2 > 0 ? clamp((apx * abx + apy * aby) / ab2, 0, 1) : 0;
    var qx = ax + abx * t, qy = ay + aby * t;
    var dx = p.x - qx, dy = p.y - qy;
    var d2 = dx * dx + dy * dy;
    if (d2 >= p.r * p.r) return null;

    var d = Math.sqrt(d2);
    var nx, ny;
    if (d < 1e-6) {
      nx = aby === 0 ? 0 : 1;
      ny = aby === 0 ? 1 : 0;
      d = 0;
    } else {
      nx = dx / d; ny = dy / d;
    }
    var push = p.r - d;
    p.x += nx * push;
    p.y += ny * push;

    /* Kill the velocity component going into the wall. */
    var vn = p.vx * nx + p.vy * ny;
    if (vn < 0) {
      p.vx -= vn * nx;
      p.vy -= vn * ny;
    }
    return { nx: nx, ny: ny, speed: Math.abs(vn) };
  }

  Player.prototype.bounceOff = function (normal, strength) {
    var sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    var kick = (sp * 0.5 + 2.2) * strength;
    this.vx += normal.nx * kick;
    this.vy += normal.ny * kick;
  };

  Player.prototype.shove = function (dirx, diry, strength) {
    var len = Math.sqrt(dirx * dirx + diry * diry) || 1;
    this.vx += (dirx / len) * strength * 3.2;
    this.vy += (diry / len) * strength * 3.2;
  };

  global.SB.Player = Player;
  global.SB.PLAYER_CONST = {
    R: PLAYER_R, ACCEL: ACCEL, MAX_SPEED: MAX_SPEED, DRAG: DRAG
  };
})(window);

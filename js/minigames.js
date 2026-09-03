/* Wonky Boy - minigames.js
 * ---------------------------------------------------------------------------
 * The encounters that run inside a room. Ten of the hundred in MINIGAMES.md,
 * one from each category, chosen so no two play alike and none needs a system
 * that does not already exist.
 *
 * THE CONTRACT
 *
 * Every game is an object with the same four methods. It is handed a context
 * and never touches anything outside it:
 *
 *   init(c)    set up state on c.s
 *   update(c, dt)
 *   draw(c, g) draw in CELL coordinates - the renderer has already applied
 *              the camera transform, so 1 unit is one maze cell
 *   status(c)  'playing' | 'won' | 'lost'
 *
 * c gives them { room, s, player, rng, t, hud }. c.s is scratch that belongs
 * to the game. c.hud is a short line of text shown to the player.
 *
 * RULES OF ENGAGEMENT, all deliberate and all easy to change:
 *   - losing costs nothing but the room closing. Rooms are optional, and
 *     punishing curiosity would just teach players to walk past them.
 *   - winning gives a TRINKET, which is a collectible and nothing else. No
 *     speed, no shield, no shortcut. Rooms that hand out advantages would make
 *     selling advantages a much more loaded proposition later.
 *   - a room can always be walked straight out of, per the brief.
 *   - a cleared room stays cleared until the board resets.
 *
 * Difficulty is mostly free: the boy does not steer properly, so a goal and
 * one obstacle is usually enough.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SB = global.SB;

  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function rnd(c) { return c.rng ? c.rng.next() : Math.random(); }

  /* Points scattered inside the room, kept off the walls. */
  function scatter(c, n, inset) {
    var r = c.room, out = [];
    inset = inset === undefined ? 0.7 : inset;
    for (var i = 0; i < n; i++) {
      out.push({
        x: r.x0 + inset + rnd(c) * (r.w - inset * 2),
        y: r.y0 + inset + rnd(c) * (r.h - inset * 2),
        got: false, phase: rnd(c) * Math.PI * 2
      });
    }
    return out;
  }

  function ring(g, x, y, rad, fill, stroke, lw) {
    g.fillStyle = fill;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw || 0.03;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.stroke();
    }
  }

  /* ================================================== 1. Candle Round ==== */
  var candleRound = {
    key: 'candle_round',
    name: 'Candle Round',
    goal: 'Light every candle before the first one gutters out',
    init: function (c) {
      c.s.candles = scatter(c, 5);
      c.s.candles.forEach(function (k) { k.lit = false; });
      c.s.timer = 15;
    },
    update: function (c, dt) {
      c.s.timer -= dt;
      var p = c.player, lit = 0;
      c.s.candles.forEach(function (k) {
        if (!k.lit && dist(p.x, p.y, k.x, k.y) < 0.42) k.lit = true;
        if (k.lit) lit++;
      });
      c.s.lit = lit;
      c.hud = 'Candles ' + lit + ' / ' + c.s.candles.length +
              '   ' + Math.max(0, c.s.timer).toFixed(1) + 's';
    },
    draw: function (c, g, t) {
      c.s.candles.forEach(function (k) {
        var flick = k.lit ? 0.8 + Math.sin(t * 11 + k.phase) * 0.2 : 0;
        g.fillStyle = 'hsla(44,30%,84%,0.95)';
        g.fillRect(k.x - 0.05, k.y - 0.16, 0.1, 0.3);
        if (k.lit) {
          var grd = g.createRadialGradient(k.x, k.y - 0.22, 0, k.x, k.y - 0.22, 0.9);
          grd.addColorStop(0, 'hsla(40,96%,64%,' + (0.5 * flick) + ')');
          grd.addColorStop(1, 'hsla(40,96%,64%,0)');
          g.fillStyle = grd;
          g.beginPath(); g.arc(k.x, k.y - 0.22, 0.9, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'hsla(44,100%,72%,0.98)';
          g.beginPath();
          g.ellipse(k.x, k.y - 0.24, 0.05, 0.1 * flick, 0, 0, Math.PI * 2);
          g.fill();
        } else {
          g.fillStyle = 'rgba(30,26,40,0.8)';
          g.beginPath(); g.arc(k.x, k.y - 0.2, 0.045, 0, Math.PI * 2); g.fill();
        }
      });
    },
    status: function (c) {
      if (c.s.lit >= c.s.candles.length) return 'won';
      return c.s.timer <= 0 ? 'lost' : 'playing';
    }
  };

  /* =============================================== 11. Chandelier Drop ==== */
  var chandelierDrop = {
    key: 'chandelier_drop',
    name: 'Chandelier Drop',
    goal: 'Survive twenty seconds',
    init: function (c) {
      c.s.timer = 20;
      c.s.drops = [];
      c.s.next = 0.8;
    },
    update: function (c, dt) {
      c.s.timer -= dt;
      c.s.next -= dt;
      if (c.s.next <= 0) {
        var r = c.room;
        c.s.next = 0.55 + rnd(c) * 0.7;
        c.s.drops.push({
          x: r.x0 + 0.6 + rnd(c) * (r.w - 1.2),
          y: r.y0 + 0.6 + rnd(c) * (r.h - 1.2),
          warn: 0.9, fall: 0
        });
      }
      var p = c.player;
      for (var i = c.s.drops.length - 1; i >= 0; i--) {
        var d = c.s.drops[i];
        if (d.warn > 0) { d.warn -= dt; if (d.warn <= 0) d.fall = 0.45; }
        else if (d.fall > 0) {
          d.fall -= dt;
          if (d.fall > 0.3 && dist(p.x, p.y, d.x, d.y) < 0.55) c.s.hit = true;
          if (d.fall <= 0) c.s.drops.splice(i, 1);
        }
      }
      c.hud = 'Hold out   ' + Math.max(0, c.s.timer).toFixed(1) + 's';
    },
    draw: function (c, g, t) {
      c.s.drops.forEach(function (d) {
        if (d.warn > 0) {
          g.strokeStyle = 'hsla(44,90%,60%,' + (0.4 + 0.5 * (1 - d.warn)) + ')';
          g.lineWidth = 0.04;
          g.beginPath(); g.arc(d.x, d.y, 0.5, 0, Math.PI * 2); g.stroke();
        } else {
          var k = 1 - d.fall / 0.45;
          ring(g, d.x, d.y, 0.34 + k * 0.16, 'hsla(44,70%,58%,0.95)', 'hsla(44,90%,72%,0.9)', 0.04);
        }
      });
    },
    status: function (c) {
      if (c.s.hit) return 'lost';
      return c.s.timer <= 0 ? 'won' : 'playing';
    }
  };

  /* ================================================= 21. Cellar Hound ==== */
  var cellarHound = {
    key: 'cellar_hound',
    name: 'Cellar Hound',
    goal: 'Reach the far corner without being caught',
    init: function (c) {
      var r = c.room;
      c.s.hound = { x: r.x0 + r.w - 0.8, y: r.y0 + 0.8, vx: 0, vy: 0 };
      c.s.goalPt = { x: r.x0 + r.w - 0.8, y: r.y0 + r.h - 0.8 };
      c.s.timer = 22;
    },
    update: function (c, dt) {
      c.s.timer -= dt;
      var p = c.player, hd = c.s.hound;
      var dx = p.x - hd.x, dy = p.y - hd.y;
      var m = Math.hypot(dx, dy) || 1;
      var sp = 1.5;
      hd.x += (dx / m) * sp * dt;
      hd.y += (dy / m) * sp * dt;
      if (dist(p.x, p.y, hd.x, hd.y) < 0.45) c.s.caught = true;
      if (dist(p.x, p.y, c.s.goalPt.x, c.s.goalPt.y) < 0.5) c.s.reached = true;
      c.hud = 'Reach the mark   ' + Math.max(0, c.s.timer).toFixed(1) + 's';
    },
    draw: function (c, g, t) {
      var gp = c.s.goalPt;
      g.strokeStyle = 'hsla(140,70%,60%,' + (0.5 + Math.sin(t * 4) * 0.3) + ')';
      g.lineWidth = 0.05;
      g.beginPath(); g.arc(gp.x, gp.y, 0.4, 0, Math.PI * 2); g.stroke();
      var hd = c.s.hound;
      ring(g, hd.x, hd.y, 0.3, 'hsla(18,50%,32%,0.98)', 'hsla(18,60%,50%,0.9)', 0.035);
      g.fillStyle = 'hsla(8,90%,60%,0.95)';
      g.beginPath(); g.arc(hd.x - 0.1, hd.y - 0.07, 0.055, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(hd.x + 0.1, hd.y - 0.07, 0.055, 0, Math.PI * 2); g.fill();
    },
    status: function (c) {
      if (c.s.reached) return 'won';
      if (c.s.caught || c.s.timer <= 0) return 'lost';
      return 'playing';
    }
  };

  /* ================================================= 31. Clock Chimes ==== */
  var clockChimes = {
    key: 'clock_chimes',
    name: 'Clock Chimes',
    goal: 'Cross only while the clock is chiming',
    init: function (c) {
      var r = c.room;
      c.s.cycle = 2.6;
      c.s.phase = 0;
      c.s.goalPt = { x: r.x0 + r.w - 0.8, y: r.y0 + r.h - 0.8 };
      c.s.start = { x: c.player.x, y: c.player.y };
      c.s.timer = 26;
      c.s.strikes = 0;
    },
    update: function (c, dt) {
      c.s.timer -= dt;
      c.s.phase = (c.s.phase + dt) % c.s.cycle;
      c.s.chiming = c.s.phase < c.s.cycle * 0.45;
      var p = c.player;
      var moved = Math.hypot(p.vx, p.vy);
      if (!c.s.chiming && moved > 1.2) {
        c.s.strikes++;
        c.s.flash = 0.3;
        /* pushed back rather than killed - the room is not lethal */
        p.vx *= -0.6; p.vy *= -0.6;
      }
      if (c.s.flash > 0) c.s.flash -= dt;
      if (dist(p.x, p.y, c.s.goalPt.x, c.s.goalPt.y) < 0.5) c.s.reached = true;
      c.hud = (c.s.chiming ? 'CHIMING - go' : 'silent - stand still') +
              '   strikes ' + c.s.strikes + '/3';
    },
    draw: function (c, g, t) {
      var r = c.room;
      if (c.s.chiming) {
        g.fillStyle = 'hsla(44,80%,60%,0.10)';
        g.fillRect(r.x0, r.y0, r.w, r.h);
      }
      if (c.s.flash > 0) {
        g.fillStyle = 'hsla(0,80%,55%,' + (c.s.flash * 0.5) + ')';
        g.fillRect(r.x0, r.y0, r.w, r.h);
      }
      var gp = c.s.goalPt;
      g.strokeStyle = 'hsla(140,70%,60%,0.8)';
      g.lineWidth = 0.05;
      g.beginPath(); g.arc(gp.x, gp.y, 0.4, 0, Math.PI * 2); g.stroke();
    },
    status: function (c) {
      if (c.s.reached) return 'won';
      if (c.s.strikes >= 3 || c.s.timer <= 0) return 'lost';
      return 'playing';
    }
  };

  /* ============================================== 41. Tightrope Landing == */
  var tightrope = {
    key: 'tightrope',
    name: 'Tightrope',
    goal: 'Cross the beam without stepping off',
    init: function (c) {
      var r = c.room;
      c.s.y = r.y0 + r.h / 2;
      c.s.halfWidth = 0.34;
      c.s.timer = 20;
      c.s.goalX = r.x0 + r.w - 0.7;
    },
    update: function (c, dt) {
      c.s.timer -= dt;
      var p = c.player;
      var off = Math.abs(p.y - c.s.y);
      if (off > c.s.halfWidth) {
        c.s.fellFor = (c.s.fellFor || 0) + dt;
        /* nudged back toward the beam rather than an instant loss */
        p.vy += (c.s.y - p.y) * 6 * dt;
      } else {
        c.s.fellFor = Math.max(0, (c.s.fellFor || 0) - dt * 0.6);
      }
      if (p.x > c.s.goalX) c.s.reached = true;
      c.hud = 'Stay on the beam   ' + Math.max(0, c.s.timer).toFixed(1) + 's';
    },
    draw: function (c, g, t) {
      var r = c.room;
      g.fillStyle = 'hsla(28,34%,26%,0.95)';
      g.fillRect(r.x0 + 0.2, c.s.y - c.s.halfWidth, r.w - 0.4, c.s.halfWidth * 2);
      g.strokeStyle = 'hsla(34,46%,46%,0.9)';
      g.lineWidth = 0.03;
      g.strokeRect(r.x0 + 0.2, c.s.y - c.s.halfWidth, r.w - 0.4, c.s.halfWidth * 2);
      g.strokeStyle = 'hsla(140,70%,60%,0.8)';
      g.lineWidth = 0.05;
      g.beginPath(); g.moveTo(c.s.goalX, c.s.y - 0.5); g.lineTo(c.s.goalX, c.s.y + 0.5); g.stroke();
    },
    status: function (c) {
      if (c.s.reached) return 'won';
      if ((c.s.fellFor || 0) > 2.5 || c.s.timer <= 0) return 'lost';
      return 'playing';
    }
  };

  /* ================================================= 49. Ice Ballroom ==== */
  var iceBallroom = {
    key: 'ice_ballroom',
    name: 'Ice Ballroom',
    goal: 'Reach the mark on a floor with no grip',
    init: function (c) {
      var r = c.room;
      c.s.goalPt = { x: r.x0 + r.w - 0.8, y: r.y0 + 0.8 };
      c.s.timer = 22;
      c.s.applied = false;
    },
    update: function (c, dt) {
      c.s.timer -= dt;
      var p = c.player;
      /* the room itself is the hazard: near-zero traction while inside */
      p.addAffliction({ key: 'ice_ballroom', name: 'Ice Ballroom', hue: 190, fx: {} },
        { grip: -0.82 }, 0.4);
      if (dist(p.x, p.y, c.s.goalPt.x, c.s.goalPt.y) < 0.5) c.s.reached = true;
      c.hud = 'No grip   ' + Math.max(0, c.s.timer).toFixed(1) + 's';
    },
    draw: function (c, g, t) {
      var r = c.room;
      g.fillStyle = 'hsla(190,50%,58%,0.13)';
      g.fillRect(r.x0, r.y0, r.w, r.h);
      g.strokeStyle = 'hsla(190,60%,74%,0.22)';
      g.lineWidth = 0.02;
      for (var i = 0; i < 6; i++) {
        var yy = r.y0 + (i + 0.5) * (r.h / 6);
        g.beginPath(); g.moveTo(r.x0, yy); g.lineTo(r.x0 + r.w, yy); g.stroke();
      }
      var gp = c.s.goalPt;
      g.strokeStyle = 'hsla(140,70%,60%,' + (0.5 + Math.sin(t * 4) * 0.3) + ')';
      g.lineWidth = 0.05;
      g.beginPath(); g.arc(gp.x, gp.y, 0.4, 0, Math.PI * 2); g.stroke();
    },
    status: function (c) {
      if (c.s.reached) return 'won';
      return c.s.timer <= 0 ? 'lost' : 'playing';
    }
  };

  /* =========================================== 51. Which Portrait Blinked = */
  var whichBlinked = {
    key: 'which_blinked',
    name: 'Which Portrait Blinked',
    goal: 'Touch the portrait that moved',
    init: function (c) {
      var r = c.room;
      var n = 4;
      c.s.frames = [];
      for (var i = 0; i < n; i++) {
        c.s.frames.push({
          x: r.x0 + 0.8 + (i % 2) * (r.w - 1.6),
          y: r.y0 + 0.8 + Math.floor(i / 2) * (r.h - 1.6),
          blinked: false
        });
      }
      c.s.answer = Math.floor(rnd(c) * n);
      c.s.frames[c.s.answer].blinked = true;
      c.s.showFor = 2.2;
      c.s.timer = 18;
    },
    update: function (c, dt) {
      c.s.timer -= dt;
      if (c.s.showFor > 0) { c.s.showFor -= dt; return; }
      var p = c.player;
      c.s.frames.forEach(function (f, i) {
        if (dist(p.x, p.y, f.x, f.y) < 0.45 && c.s.picked === undefined) c.s.picked = i;
      });
      c.hud = c.s.picked === undefined
        ? 'Which one blinked?   ' + Math.max(0, c.s.timer).toFixed(1) + 's'
        : (c.s.picked === c.s.answer ? 'Correct' : 'Wrong one');
    },
    draw: function (c, g, t) {
      var showing = c.s.showFor > 0;
      c.s.frames.forEach(function (f, i) {
        g.fillStyle = 'hsla(44,60%,44%,0.95)';
        g.fillRect(f.x - 0.32, f.y - 0.4, 0.64, 0.8);
        g.fillStyle = 'hsla(22,26%,12%,1)';
        g.fillRect(f.x - 0.24, f.y - 0.32, 0.48, 0.64);
        var blink = showing && f.blinked && (Math.sin(t * 7) > 0.2);
        g.fillStyle = 'hsla(34,24%,60%,0.9)';
        g.beginPath(); g.ellipse(f.x, f.y - 0.04, 0.15, 0.2, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(8,6,14,0.92)';
        if (!blink) {
          g.beginPath(); g.arc(f.x - 0.06, f.y - 0.08, 0.032, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(f.x + 0.06, f.y - 0.08, 0.032, 0, Math.PI * 2); g.fill();
        } else {
          g.fillRect(f.x - 0.1, f.y - 0.09, 0.2, 0.018);
        }
        if (c.s.picked === i) {
          g.strokeStyle = c.s.picked === c.s.answer ? 'hsla(140,80%,60%,0.9)' : 'hsla(0,80%,60%,0.9)';
          g.lineWidth = 0.05;
          g.strokeRect(f.x - 0.36, f.y - 0.44, 0.72, 0.88);
        }
      });
      if (showing) {
        g.fillStyle = 'hsla(44,80%,70%,0.06)';
        g.fillRect(c.room.x0, c.room.y0, c.room.w, c.room.h);
      }
    },
    status: function (c) {
      if (c.s.picked !== undefined) return c.s.picked === c.s.answer ? 'won' : 'lost';
      return c.s.timer <= 0 ? 'lost' : 'playing';
    }
  };

  /* ================================================ 61. Wardrobe Shove ==== */
  var wardrobeShove = {
    key: 'wardrobe_shove',
    name: 'Wardrobe Shove',
    goal: 'Push the wardrobe onto the mark',
    init: function (c) {
      var r = c.room;
      c.s.box = { x: r.x0 + r.w * 0.4, y: r.y0 + r.h * 0.5, vx: 0, vy: 0 };
      c.s.mark = { x: r.x0 + r.w - 0.9, y: r.y0 + r.h * 0.5 };
      c.s.timer = 26;
    },
    update: function (c, dt) {
      c.s.timer -= dt;
      var p = c.player, b = c.s.box, r = c.room;
      var d = dist(p.x, p.y, b.x, b.y);
      if (d < 0.62) {
        var nx = (b.x - p.x) / (d || 1), ny = (b.y - p.y) / (d || 1);
        var push = Math.hypot(p.vx, p.vy) * 0.5;
        b.vx += nx * push * dt * 9;
        b.vy += ny * push * dt * 9;
      }
      b.vx *= Math.exp(-4.5 * dt); b.vy *= Math.exp(-4.5 * dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.x = Math.max(r.x0 + 0.45, Math.min(r.x0 + r.w - 0.45, b.x));
      b.y = Math.max(r.y0 + 0.45, Math.min(r.y0 + r.h - 0.45, b.y));
      if (dist(b.x, b.y, c.s.mark.x, c.s.mark.y) < 0.42) c.s.done = true;
      c.hud = 'Shove it onto the mark   ' + Math.max(0, c.s.timer).toFixed(1) + 's';
    },
    draw: function (c, g, t) {
      var m = c.s.mark;
      g.strokeStyle = 'hsla(140,70%,60%,0.8)';
      g.lineWidth = 0.05;
      g.strokeRect(m.x - 0.4, m.y - 0.4, 0.8, 0.8);
      var b = c.s.box;
      g.fillStyle = 'hsla(26,36%,26%,0.98)';
      g.fillRect(b.x - 0.4, b.y - 0.42, 0.8, 0.84);
      g.strokeStyle = 'hsla(34,44%,44%,0.9)';
      g.lineWidth = 0.035;
      g.strokeRect(b.x - 0.4, b.y - 0.42, 0.8, 0.84);
      g.fillStyle = 'hsla(44,60%,58%,0.9)';
      g.beginPath(); g.arc(b.x + 0.22, b.y, 0.05, 0, Math.PI * 2); g.fill();
    },
    status: function (c) {
      if (c.s.done) return 'won';
      return c.s.timer <= 0 ? 'lost' : 'playing';
    }
  };

  /* ==================================================== 71. Blackout ===== */
  var blackout = {
    key: 'blackout',
    name: 'Blackout',
    goal: 'Remember the way, then walk it in the dark',
    init: function (c) {
      c.s.gems = scatter(c, 3);
      c.s.showFor = 2.6;
      c.s.timer = 22;
    },
    update: function (c, dt) {
      c.s.timer -= dt;
      if (c.s.showFor > 0) c.s.showFor -= dt;
      var p = c.player, got = 0;
      c.s.gems.forEach(function (k) {
        if (!k.got && dist(p.x, p.y, k.x, k.y) < 0.42) k.got = true;
        if (k.got) got++;
      });
      c.s.got = got;
      c.hud = c.s.showFor > 0
        ? 'Memorise them...'
        : 'Found ' + got + ' / 3   ' + Math.max(0, c.s.timer).toFixed(1) + 's';
    },
    draw: function (c, g, t) {
      var r = c.room, showing = c.s.showFor > 0;
      c.s.gems.forEach(function (k) {
        if (k.got) {
          ring(g, k.x, k.y, 0.2, 'hsla(140,80%,60%,0.9)', null);
        } else if (showing) {
          ring(g, k.x, k.y, 0.2, 'hsla(48,90%,62%,0.95)', 'hsla(48,100%,80%,0.9)', 0.03);
        }
      });
      if (!showing) {
        /* pitch dark but for a small pool around the boy */
        var p = c.player;
        var grd = g.createRadialGradient(p.x, p.y, 0.3, p.x, p.y, 1.5);
        grd.addColorStop(0, 'rgba(4,4,12,0)');
        grd.addColorStop(1, 'rgba(4,4,12,0.96)');
        g.fillStyle = grd;
        g.fillRect(r.x0 - 1, r.y0 - 1, r.w + 2, r.h + 2);
      }
    },
    status: function (c) {
      if (c.s.got >= 3) return 'won';
      return c.s.timer <= 0 ? 'lost' : 'playing';
    }
  };

  /* ================================================== 91. Three Doors ==== */
  var threeDoors = {
    key: 'three_doors',
    name: 'Three Doors',
    goal: 'Pick a door. One of them is worth picking',
    init: function (c) {
      var r = c.room;
      c.s.doors = [];
      for (var i = 0; i < 3; i++) {
        c.s.doors.push({
          x: r.x0 + (i + 1) * (r.w / 4),
          y: r.y0 + 0.7,
          opened: false
        });
      }
      c.s.good = Math.floor(rnd(c) * 3);
      c.s.timer = 20;
    },
    update: function (c, dt) {
      c.s.timer -= dt;
      var p = c.player;
      c.s.doors.forEach(function (d, i) {
        if (!c.s.chosen && dist(p.x, p.y, d.x, d.y) < 0.45) {
          c.s.chosen = true; c.s.pick = i; d.opened = true;
        }
      });
      c.hud = c.s.chosen
        ? (c.s.pick === c.s.good ? 'The right one' : 'Not that one')
        : 'Choose   ' + Math.max(0, c.s.timer).toFixed(1) + 's';
    },
    draw: function (c, g, t) {
      c.s.doors.forEach(function (d, i) {
        var open = d.opened;
        g.fillStyle = open
          ? (i === c.s.good ? 'hsla(140,60%,40%,0.95)' : 'hsla(0,50%,30%,0.95)')
          : 'hsla(26,38%,22%,0.98)';
        g.fillRect(d.x - 0.32, d.y - 0.55, 0.64, 1.1);
        g.strokeStyle = 'hsla(34,46%,48%,0.9)';
        g.lineWidth = 0.035;
        g.strokeRect(d.x - 0.32, d.y - 0.55, 0.64, 1.1);
        g.fillStyle = 'hsla(44,70%,62%,0.95)';
        g.beginPath(); g.arc(d.x + 0.18, d.y, 0.05, 0, Math.PI * 2); g.fill();
      });
    },
    status: function (c) {
      if (c.s.chosen) return c.s.pick === c.s.good ? 'won' : 'lost';
      return c.s.timer <= 0 ? 'lost' : 'playing';
    }
  };

  var LIST = [
    candleRound, chandelierDrop, cellarHound, clockChimes, tightrope,
    iceBallroom, whichBlinked, wardrobeShove, blackout, threeDoors
  ];

  var BY_KEY = {};
  LIST.forEach(function (m) { BY_KEY[m.key] = m; });

  global.SB = global.SB || {};
  global.SB.MINIGAMES = {
    LIST: LIST,
    BY_KEY: BY_KEY,
    keys: function () { return LIST.map(function (m) { return m.key; }); },
    get: function (k) { return BY_KEY[k]; },
    count: LIST.length
  };
})(window);

/* Wonky Boy - corridor.js
 * ---------------------------------------------------------------------------
 * The 3D maze corridor behind the splash boy.
 *
 * This is the classic pseudo-3D road technique, bent into a tunnel. The world
 * is a list of segments running away from the camera; each is projected with
 * a simple perspective divide and drawn back-to-front as three quads - left
 * wall, right wall, floor. Accumulating a per-segment `curve` while walking
 * that list is what makes the corridor bend, so the maze appears to turn left
 * and right as he runs through it.
 *
 * The track is generated randomly at construction: straights, sweeping turns
 * and the occasional tight one, looping forever. Real hazards from the game's
 * catalogue are mounted on the walls and floor, drawn with their own colour
 * plus the light-blue signature, exactly as they appear in play.
 *
 * Nothing here is gameplay. It never touches a save, a board or a score.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SB = global.SB;

  /* World units. Tuned so a phone-shaped viewport frames the corridor with
   * the boy comfortably inside it. */
  var SEG_LEN = 200;
  var ROAD_W = 520;       // half-width of the corridor floor - narrow reads as a hallway
  var WALL_H = 1500;      // how tall the side walls stand
  var CAM_H = 620;        // camera height above the floor
  var DRAW_DIST = 90;     // segments rendered; the rest is fog
  var FOV = 100;
  var HORIZON = 0.44;     // vanishing point, as a fraction of screen height
  var SPEED = 5200;       // world units per second

  function rnd(rng) { return rng ? rng.next() : Math.random(); }
  function rint(rng, a, b) { return Math.floor(a + rnd(rng) * (b - a + 1)); }

  /* ------------------------------------------------------------ the track */

  function Corridor(seed) {
    this.rng = SB.Rng ? new SB.Rng(seed || 'wonky-splash') : null;
    this.cameraDepth = 1 / Math.tan((FOV / 2) * Math.PI / 180);
    this.position = 0;
    this.segments = [];
    this.build();
  }

  Corridor.prototype.build = function () {
    var rng = this.rng;
    var self = this;

    /* Hazards worth looking at from the front: strong silhouettes, and a
     * spread of colours rather than five browns in a row. */
    var pool = (SB.HAZARDS ? SB.HAZARDS.CATALOG : []).filter(function (h) {
      return h.behavior === 'wall' || h.behavior === 'tile' ||
             h.behavior === 'item' || h.behavior === 'zapStatic';
    });

    function addSegment(curve) {
      var n = self.segments.length;
      var seg = {
        index: n,
        curve: curve,
        /* alternating bands give the sense of speed */
        band: Math.floor(n / 3) % 2,
        hazard: null
      };
      self.segments.push(seg);
    }

    /* ease in, hold, ease out - a turn that does not snap */
    function addRoad(enter, hold, leave, curve) {
      var i;
      for (i = 0; i < enter; i++) addSegment(curve * easeIn(i / enter));
      for (i = 0; i < hold; i++) addSegment(curve);
      for (i = 0; i < leave; i++) addSegment(curve * (1 - easeIn(i / leave)));
    }

    function easeIn(p) { return p * p; }

    /* Build a looping run of corridor: mostly straights, punctuated by turns
     * of varying severity so it reads as a maze rather than a racetrack. */
    addRoad(8, 20, 8, 0);
    for (var s = 0; s < 14; s++) {
      var pick = rnd(rng);
      if (pick < 0.32) {
        addRoad(10, rint(rng, 8, 24), 10, 0);                 // straight
      } else if (pick < 0.66) {
        addRoad(12, rint(rng, 10, 22), 12, (rnd(rng) < 0.5 ? -1 : 1) * 2.2);
      } else if (pick < 0.9) {
        addRoad(8, rint(rng, 6, 14), 8, (rnd(rng) < 0.5 ? -1 : 1) * 4.4);
      } else {
        addRoad(6, rint(rng, 4, 9), 6, (rnd(rng) < 0.5 ? -1 : 1) * 6.6);
      }
    }
    addRoad(10, 20, 10, 0);

    /* Mount hazards down the corridor. */
    if (pool.length) {
      var at = rint(rng, 6, 14);
      while (at < this.segments.length - 4) {
        var hz = pool[rint(rng, 0, pool.length - 1)];
        var side;
        if (hz.behavior === 'tile') side = 'floor';
        else if (hz.behavior === 'item') side = 'float';
        else side = rnd(rng) < 0.5 ? 'left' : 'right';
        this.segments[at].hazard = {
          hz: hz,
          side: side,
          /* how far along the wall, and a little vertical variety */
          lift: 0.25 + rnd(rng) * 0.5,
          phase: rnd(rng) * Math.PI * 2
        };
        at += rint(rng, 7, 18);
      }
    }
  };

  Corridor.prototype.total = function () { return this.segments.length * SEG_LEN; };

  Corridor.prototype.advance = function (dt) {
    this.position = (this.position + SPEED * dt) % this.total();
  };

  /* --------------------------------------------------------- projection */

  /* Returns screen x/y for a world point at (worldX, worldY, depth). */
  function project(worldX, worldY, depth, camX, W, H, cameraDepth) {
    var scale = cameraDepth / depth;
    return {
      x: W / 2 + scale * (worldX - camX) * W / 2,
      /* HORIZON rather than H/2: on a tall phone a centred vanishing point
       * leaves a huge dead wedge of floor across the bottom half. */
      y: H * HORIZON - scale * (worldY - CAM_H) * H / 2,
      scale: scale
    };
  }

  function quad(g, ax, ay, bx, by, cx, cy, dx, dy, fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.lineTo(cx, cy);
    g.lineTo(dx, dy);
    g.closePath();
    g.fill();
  }

  /* ------------------------------------------------------------- render */

  Corridor.prototype.draw = function (g, W, H, t) {
    var THEME = SB.THEME;
    var segs = this.segments;
    var count = segs.length;
    var base = Math.floor(this.position / SEG_LEN) % count;
    var offset = this.position % SEG_LEN;

    /* Walk out from the camera accumulating the bend. */
    var x = 0, dx = 0;
    var camX = 0;
    var frames = [];

    for (var n = 0; n < DRAW_DIST; n++) {
      var seg = segs[(base + n) % count];
      var depth = (n * SEG_LEN) - offset + SEG_LEN;
      if (depth < 1) depth = 1;

      var floorPt = project(x, 0, depth, camX, W, H, this.cameraDepth);
      var ceilPt = project(x, WALL_H, depth, camX, W, H, this.cameraDepth);
      var halfW = floorPt.scale * ROAD_W * W / 2;

      frames.push({
        seg: seg,
        n: n,
        depth: depth,
        fx: floorPt.x, fy: floorPt.y,
        cy: ceilPt.y,
        w: halfW,
        scale: floorPt.scale
      });

      x += dx;
      dx += seg.curve;
    }

    /* Back to front, so nearer segments paint over farther ones. */
    for (var i = frames.length - 1; i > 0; i--) {
      var f = frames[i];       // far
      var nr = frames[i - 1];  // near
      var fade = 1 - (f.n / DRAW_DIST);
      var fog = Math.pow(fade, 1.7);
      if (fog <= 0.01) continue;

      var band = f.seg.band;

      /* floor */
      quad(g,
        nr.fx - nr.w, nr.fy, nr.fx + nr.w, nr.fy,
        f.fx + f.w, f.fy, f.fx - f.w, f.fy,
        THEME.hue(252, 40, band ? 30 : 38, fog));

      /* a bright centre strip so turns read clearly */
      quad(g,
        nr.fx - nr.w * 0.06, nr.fy, nr.fx + nr.w * 0.06, nr.fy,
        f.fx + f.w * 0.06, f.fy, f.fx - f.w * 0.06, f.fy,
        THEME.sig(0.18 * fog));

      /* Walls. The two sides are lit differently so the corridor has a
       * sense of direction rather than looking like a symmetrical funnel. */
      quad(g,
        nr.fx - nr.w, nr.fy, f.fx - f.w, f.fy,
        f.fx - f.w, f.cy, nr.fx - nr.w, nr.cy,
        THEME.hue(268, 56, band ? 24 : 31, fog));

      quad(g,
        nr.fx + nr.w, nr.fy, f.fx + f.w, f.fy,
        f.fx + f.w, f.cy, nr.fx + nr.w, nr.cy,
        THEME.hue(222, 56, band ? 29 : 37, fog));

      /* Transverse rungs across the floor - the floor equivalent of the
       * wall ribs, and the strongest single motion cue in the frame. */
      if (f.seg.index % 3 === 0) {
        g.strokeStyle = THEME.sig(0.50 * fog, -6);
        g.lineWidth = Math.max(1, nr.w * 0.045);
        g.beginPath();
        g.moveTo(nr.fx - nr.w, nr.fy);
        g.lineTo(nr.fx + nr.w, nr.fy);
        g.stroke();
      }

      /* Vertical ribs where segments meet. These are what actually sell the
       * forward motion - without them the walls are flat colour and the eye
       * has nothing to track. */
      if (f.seg.index % 3 === 0) {
        g.strokeStyle = THEME.sig(0.34 * fog, -6);
        g.lineWidth = Math.max(0.6, nr.w * 0.035);
        g.beginPath();
        g.moveTo(nr.fx - nr.w, nr.fy); g.lineTo(nr.fx - nr.w, nr.cy);
        g.moveTo(nr.fx + nr.w, nr.fy); g.lineTo(nr.fx + nr.w, nr.cy);
        g.stroke();
      }

      /* signature trim along the top of each wall */
      g.strokeStyle = THEME.sig(0.42 * fog);
      g.lineWidth = Math.max(1, nr.w * 0.03);
      g.beginPath();
      g.moveTo(nr.fx - nr.w, nr.cy); g.lineTo(f.fx - f.w, f.cy);
      g.moveTo(nr.fx + nr.w, nr.cy); g.lineTo(f.fx + f.w, f.cy);
      g.stroke();

      /* and a warmer line where each wall meets the floor */
      g.strokeStyle = THEME.hue(28, 80, 58, 0.22 * fog);
      g.lineWidth = Math.max(0.8, nr.w * 0.02);
      g.beginPath();
      g.moveTo(nr.fx - nr.w, nr.fy); g.lineTo(f.fx - f.w, f.fy);
      g.moveTo(nr.fx + nr.w, nr.fy); g.lineTo(f.fx + f.w, f.fy);
      g.stroke();
    }

    /* Hazards, also back to front. */
    for (var k = frames.length - 1; k >= 0; k--) {
      var fr = frames[k];
      if (!fr.seg.hazard) continue;
      this.drawHazard(g, fr, t, W, H);
    }
  };

  Corridor.prototype.drawHazard = function (g, fr, t, W, H) {
    var THEME = SB.THEME;
    var h = fr.seg.hazard;
    var hz = h.hz;
    var fog = Math.pow(1 - (fr.n / DRAW_DIST), 1.5);
    if (fog <= 0.02) return;

    /* Anything this close is level with the camera, so it would balloon over
     * the whole frame and swallow the boy. Let it pass by unseen instead. */
    if (fr.n < 5) return;

    /* Hard cap as well, for the segment right on the cull boundary. */
    var size = Math.min(fr.w * 0.28, W * 0.11);
    if (size < 1.5) return;

    var px, py;
    if (h.side === 'floor') {
      px = fr.fx;
      py = fr.fy - size * 0.15;
    } else if (h.side === 'float') {
      px = fr.fx + Math.sin(t * 1.4 + h.phase) * fr.w * 0.30;
      py = fr.fy + (fr.cy - fr.fy) * 0.55 + Math.sin(t * 2 + h.phase) * size * 0.3;
    } else {
      var dir = h.side === 'left' ? -1 : 1;
      px = fr.fx + dir * fr.w * 0.92;
      py = fr.fy + (fr.cy - fr.fy) * h.lift;
    }

    var hue = hz.fx && hz.fx.rainbow ? (t * 90) % 360 : hz.hue;
    var pulse = 0.7 + Math.sin(t * 5 + h.phase) * 0.3;

    /* Same visual grammar as in play: own colour, light-blue signature. */
    g.save();
    g.globalAlpha = fog;
    g.shadowColor = THEME.sig(0.9);
    g.shadowBlur = Math.min(26, size * 0.9);
    g.fillStyle = THEME.hue(hue, 85, 56, 0.96);
    g.beginPath();
    g.arc(px, py, size, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.save();
    g.globalAlpha = fog;
    g.strokeStyle = THEME.sig(0.95, 8);
    g.lineWidth = Math.max(1, size * 0.16);
    g.beginPath();
    g.arc(px, py, size, 0, Math.PI * 2);
    g.stroke();

    /* signature core */
    var grd = g.createRadialGradient(px, py, 0, px, py, size * 0.8);
    grd.addColorStop(0, THEME.sig(0.95 * pulse, 12));
    grd.addColorStop(1, THEME.sig(0, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(px, py, size * 0.8, 0, Math.PI * 2);
    g.fill();
    g.restore();

    /* glyph, once it is big enough to read */
    if (size > 11 && hz.glyph) {
      g.save();
      g.globalAlpha = fog;
      g.font = '700 ' + (size * 0.9) + 'px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(12,10,26,0.75)';
      g.fillText(hz.glyph, px, py + size * 0.04);
      g.restore();
    }
  };

  global.SB = global.SB || {};
  global.SB.Corridor = Corridor;
  global.SB.CORRIDOR_CONST = { SEG_LEN: SEG_LEN, ROAD_W: ROAD_W, WALL_H: WALL_H };
})(window);

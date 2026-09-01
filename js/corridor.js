/* Wonky Boy - corridor.js
 * ---------------------------------------------------------------------------
 * The 3D maze corridor behind the splash boy.
 *
 * WHY THIS IS REAL GEOMETRY AND NOT THE ROAD TRICK
 *
 * This began as the classic pseudo-3D road renderer, where the corridor is a
 * list of slices and a per-slice `curve` value slides them sideways. That
 * technique cannot turn a corner. Its entire world model assumes the corridor
 * always heads away from the camera, so a "turn" is really the hall drifting
 * sideways while you carry on looking the same way. Ease it and you get a
 * bend; snap it and you get a cut two frames long. Neither is a corner.
 *
 * So the corridor is now genuine world-space geometry: an axis-aligned path of
 * straight runs meeting at right angles, and a camera with a position and a
 * HEADING that pivots through 90 degrees on reaching a vertex. The turn takes
 * TURN_TIME seconds - about eighteen frames - during which the camera slows
 * almost to a stop and rotates, exactly as a person would at the end of a
 * hallway. The end wall sweeps out of frame and the next passage swings in.
 *
 * Everything downstream is unchanged: each slice still hands haunted.js and
 * furniture.js a near and far wall line plus the constants that turn a world
 * height into a screen y, so the panelling, portraits, armour and chandeliers
 * all draw exactly as before.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SB = global.SB;

  var SEG_LEN = 200;
  var ROAD_W = 430;        // half-width of the corridor
  var WALL_H = 2250;       // wall height
  var CAM_H = 620;         // eye height
  var DRAW_DIST = 60;      // path points rendered ahead
  var FOV = 100;
  var HORIZON = 0.44;
  var SPEED = 5200;        // world units per second down a straight

  /* THE TURN. It cannot be instantaneous - it needs at least ten frames. At
   * 60fps this is eighteen: quick enough to feel urgent, slow enough to read
   * as a pivot rather than a jump cut. */
  var TURN_TIME = 0.30;
  var TURN_CREEP = 0;      // pivot in place: the camera is standing in the junction

  var NEAR = 60;           // near clip, world units

  /* North, East, South, West. */
  var DIR4 = [
    { dx: 0, dz: 1 }, { dx: 1, dz: 0 }, { dx: 0, dz: -1 }, { dx: -1, dz: 0 }
  ];

  function rnd(rng) { return rng ? rng.next() : Math.random(); }
  function rint(rng, a, b) { return Math.floor(a + rnd(rng) * (b - a + 1)); }
  function smoothstep(p) { return p * p * (3 - 2 * p); }

  /* ------------------------------------------------------------- the path */

  function Corridor(seed) {
    this.rng = SB.Rng ? new SB.Rng(seed || 'wonky-splash') : null;
    this.cameraDepth = 1 / Math.tan((FOV / 2) * Math.PI / 180);

    this.runs = [];
    this.points = [];
    this.build();

    this.runIdx = 0;
    this.along = 0;
    this.yaw = this.runs[0].dir * (Math.PI / 2);
    this.turning = false;
    this.turnT = 0;
    this.turnFrom = this.yaw;
    this.turnTo = this.yaw;
  }

  Corridor.prototype.build = function () {
    var rng = this.rng;
    var dir = 0;
    var x = 0, z = 0;

    /* Runs of 10-18 slices - roughly two to three seconds apart - each
     * meeting the next at a true right angle. Direction is a coin flip with
     * no memory, so it genuinely wanders. */
    for (var r = 0; r < 26; r++) {
      var len = rint(rng, 10, 18);
      var run = { dir: dir, len: len, x0: x, z0: z, startPoint: this.points.length };
      for (var i = 0; i <= len; i++) {
        this.points.push({
          x: x + DIR4[dir].dx * SEG_LEN * i,
          z: z + DIR4[dir].dz * SEG_LEN * i,
          dir: dir,
          run: r,
          i: i,
          isEnd: i === len,
          band: ((this.points.length / 3) | 0) % 2,
          hazard: null,
          feature: null,
          furn: null
        });
      }
      x += DIR4[dir].dx * SEG_LEN * len;
      z += DIR4[dir].dz * SEG_LEN * len;
      this.runs.push(run);
      dir = (dir + (rnd(rng) < 0.5 ? 1 : 3)) % 4;   // +1 right, +3 left
    }

    this.dressWalls();
  };

  Corridor.prototype.dressWalls = function () {
    var rng = this.rng;
    var pts = this.points;

    var HAUNT = SB.HAUNTED;
    if (HAUNT) {
      var fside = 'left';
      var fat = rint(rng, 2, 5);
      while (fat < pts.length - 1) {
        pts[fat].feature = {
          kind: HAUNT.FEATURE_BAG[rint(rng, 0, HAUNT.FEATURE_BAG.length - 1)],
          side: fside,
          phase: rnd(rng) * Math.PI * 2
        };
        fside = fside === 'left' ? 'right' : 'left';
        fat += rint(rng, 3, 6);
      }
    }

    var FURN = SB.FURNITURE;
    if (FURN) {
      var uat = rint(rng, 3, 7);
      while (uat < pts.length - 2) {
        var kind = FURN.BAG[rint(rng, 0, FURN.BAG.length - 1)];
        pts[uat].furn = {
          kind: kind,
          side: rnd(rng) < 0.5 ? 'left' : 'right',
          centre: !!FURN.CENTRE_PIECES[kind],
          phase: rnd(rng) * Math.PI * 2
        };
        uat += rint(rng, 4, 8);
      }
    }

    var pool = (SB.HAZARDS ? SB.HAZARDS.CATALOG : []).filter(function (h) {
      return h.behavior === 'wall' || h.behavior === 'tile' ||
             h.behavior === 'item' || h.behavior === 'zapStatic';
    });
    if (pool.length) {
      var at = rint(rng, 3, 8);
      while (at < pts.length - 2) {
        var hz = pool[rint(rng, 0, pool.length - 1)];
        pts[at].hazard = {
          hz: hz,
          side: hz.behavior === 'tile' ? 'floor'
            : (hz.behavior === 'item' ? 'float'
              : (rnd(rng) < 0.5 ? 'left' : 'right')),
          lift: 0.25 + rnd(rng) * 0.5,
          phase: rnd(rng) * Math.PI * 2
        };
        at += rint(rng, 4, 9);
      }
    }
  };

  /* ----------------------------------------------------------- the camera */

  Corridor.prototype.advance = function (dt) {
    var run = this.runs[this.runIdx];
    var runLen = run.len * SEG_LEN;

    if (this.turning) {
      this.turnT += dt;
      var p = Math.min(1, this.turnT / TURN_TIME);
      /* shortest way round, so a left turn never spins the long way */
      var d = this.turnTo - this.turnFrom;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw = this.turnFrom + d * smoothstep(p);
      this.along += SPEED * TURN_CREEP * dt;   // barely creeping while pivoting
      if (p >= 1) {
        this.turning = false;
        this.runIdx = (this.runIdx + 1) % this.runs.length;
        this.along = 0;
        this.yaw = this.runs[this.runIdx].dir * (Math.PI / 2);
      }
      return;
    }

    this.along += SPEED * dt;
    if (this.along >= runLen) {
      this.along = runLen;
      var next = this.runs[(this.runIdx + 1) % this.runs.length];
      this.turning = true;
      this.turnT = 0;
      this.turnFrom = this.yaw;
      this.turnTo = next.dir * (Math.PI / 2);
    }
  };

  Corridor.prototype.cameraPos = function () {
    var run = this.runs[this.runIdx];
    var d = DIR4[run.dir];
    return { x: run.x0 + d.dx * this.along, z: run.z0 + d.dz * this.along };
  };

  /* ---------------------------------------------------------- projection */

  /* World point -> camera space. Kept separate from projection so that edges
   * which straddle the camera can be CLIPPED rather than thrown away. */
  function toCamera(wx, wz, cam, sinY, cosY) {
    var dx = wx - cam.x, dz = wz - cam.z;
    return {
      /* Depth is the component of (point - camera) along the heading.
       * Sign matters: with sin(-yaw) this is only correct when yaw is 0, so
       * the very first run looked fine and every run after it had its entire
       * geometry behind the camera - which is what was blacking out the
       * screen after each turn. */
      d: dz * cosY + dx * sinY,
      l: dx * cosY - dz * sinY
    };
  }

  function projectCam(c, W, H, cameraDepth) {
    var scale = cameraDepth / c.d;
    return {
      x: W / 2 + scale * c.l * W / 2,
      depth: c.d,
      scale: scale,
      /* y(h) = yA - yB*h.  W/2 on both axes keeps world proportions on a tall
       * phone; using H/2 for the vertical stretches everything about 2x. */
      yA: H * HORIZON + scale * CAM_H * W / 2,
      yB: scale * W / 2
    };
  }

  /* Clip a near->far edge against the near plane and project both ends.
   *
   * Without this, any wall slice with one end behind the camera is discarded
   * whole, so the wall you are actually walking past vanishes, and standing at
   * a junction - where EVERY point of the next run sits at depth zero - leaves
   * a black screen. Clipping keeps the visible part of a straddling edge. */
  function projectEdge(a, b, W, H, cameraDepth) {
    var A = a, B = b;
    if (A.d < NEAR && B.d < NEAR) return null;      // wholly behind
    if (A.d < NEAR) {
      var ta = (NEAR - A.d) / (B.d - A.d);
      A = { d: NEAR, l: A.l + (B.l - A.l) * ta };
    } else if (B.d < NEAR) {
      var tb = (NEAR - B.d) / (A.d - B.d);
      B = { d: NEAR, l: B.l + (A.l - B.l) * tb };
    }
    return { near: projectCam(A, W, H, cameraDepth), far: projectCam(B, W, H, cameraDepth) };
  }

  function projectPoint(wx, wz, cam, sinY, cosY, W, H, cameraDepth) {
    var c = toCamera(wx, wz, cam, sinY, cosY);
    if (c.d < NEAR) return null;
    return projectCam(c, W, H, cameraDepth);
  }

  function yAt(P, h) { return P.yA - P.yB * h; }

  function quad(g, ax, ay, bx, by, cx, cy, dx, dy, fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.lineTo(dx, dy);
    g.closePath();
    g.fill();
  }

  /* -------------------------------------------------------------- render */

  Corridor.prototype.draw = function (g, W, H, t) {
    var HAUNT = SB.HAUNTED;
    if (!HAUNT) return;

    var cam = this.cameraPos();
    var sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    var pts = this.points;

    var run = this.runs[this.runIdx];
    /* Two points back: at a vertex the camera is standing ON the last point,
     * and a slice needs a NEARER neighbour to pair with or nothing draws.
     * Anything actually behind the camera is dropped by the near clip. */
    var startIdx = run.startPoint + Math.max(0, Math.floor(this.along / SEG_LEN) - 2);

    var frames = [];
    for (var n = 0; n < DRAW_DIST; n++) {
      var pi = (startIdx + n) % pts.length;
      var P = pts[pi];
      var d = DIR4[P.dir];
      /* wall lines either side of the centre, perpendicular to the run */
      var rxw = P.x + d.dz * ROAD_W, rzw = P.z - d.dx * ROAD_W;
      var lxw = P.x - d.dz * ROAD_W, lzw = P.z + d.dx * ROAD_W;

      /* At a run end the corridor opens into the junction; the wall you see
       * is its FAR side, half a corridor width beyond the vertex. Projecting
       * it at the vertex itself puts it at zero distance, where it clips away
       * and leaves a black hole in the middle of the turn. */
      var endP = null;
      if (P.isEnd) {
        endP = {
          C: projectPoint(P.x + d.dx * ROAD_W, P.z + d.dz * ROAD_W, cam, sinY, cosY, W, H, this.cameraDepth),
          L: projectPoint(P.x + d.dx * ROAD_W - d.dz * ROAD_W, P.z + d.dz * ROAD_W + d.dx * ROAD_W, cam, sinY, cosY, W, H, this.cameraDepth),
          R: projectPoint(P.x + d.dx * ROAD_W + d.dz * ROAD_W, P.z + d.dz * ROAD_W - d.dx * ROAD_W, cam, sinY, cosY, W, H, this.cameraDepth)
        };
        if (!endP.C || !endP.L || !endP.R) endP = null;
      }
      /* Camera space only. Projection happens per EDGE in the pair loop, so
       * a slice with one end behind the camera can be clipped instead of
       * discarded. */
      frames.push({
        P: P, n: n,
        cC: toCamera(P.x, P.z, cam, sinY, cosY),
        cL: toCamera(lxw, lzw, cam, sinY, cosY),
        cR: toCamera(rxw, rzw, cam, sinY, cosY),
        endP: endP
      });
    }

    /* Turn a pair of frames into projected near/far points for one line of the
     * corridor, clipped against the near plane. */
    var self = this;
    function edge(nr, f, key) {
      return projectEdge(nr[key], f[key], W, H, self.cameraDepth);
    }
    function heights(P) {
      return {
        floor: yAt(P, 0),
        skirt: yAt(P, HAUNT.HEIGHTS.skirt),
        dado: yAt(P, HAUNT.HEIGHTS.dado),
        rail: yAt(P, HAUNT.HEIGHTS.rail),
        cornice: yAt(P, HAUNT.HEIGHTS.cornice),
        top: yAt(P, WALL_H)
      };
    }

    for (var i = frames.length - 1; i > 0; i--) {
      var f = frames[i], nrf = frames[i - 1];
      if (!f || !nrf) continue;
      /* Never span a corner: the two points belong to different runs and the
       * quad between them would shear across the turn. */
      if (f.P.run !== nrf.P.run) continue;

      var fog = Math.pow(1 - (f.n / DRAW_DIST), 1.7);
      if (fog <= 0.01) continue;

      /* Project this slice's three lines, clipped to the near plane. */
      var eC = edge(nrf, f, 'cC'), eL = edge(nrf, f, 'cL'), eR = edge(nrf, f, 'cR');
      if (!eC || !eL || !eR) continue;

      var nr = { L: eL.near, R: eR.near, C: eC.near, ys: heights(eC.near) };
      nr.w = Math.abs(eR.near.x - eL.near.x) / 2;
      var ff = { L: eL.far, R: eR.far, C: eC.far, ys: heights(eC.far) };
      /* `f` keeps its P/n/endP; give it the projected geometry too */
      f = { P: f.P, n: f.n, endP: f.endP, L: ff.L, R: ff.R, C: ff.C, ys: ff.ys };

      var band = f.P.band;
      var detail = f.n < 26;

      /* floorboards */
      quad(g, nr.L.x, nr.ys.floor, nr.R.x, nr.ys.floor,
        f.R.x, f.ys.floor, f.L.x, f.ys.floor,
        HAUNT.hsl(band ? HAUNT.PALETTE.floorAlt : HAUNT.PALETTE.floor, fog));

      if (detail) {
        g.strokeStyle = HAUNT.hsl(HAUNT.PALETTE.joint, 0.8 * fog);
        g.lineWidth = Math.max(0.5, nr.w * 0.012);
        g.beginPath();
        for (var bd = 0; bd < 7; bd++) {
          var p2 = (bd + 0.5) / 7;
          g.moveTo(nr.L.x + (nr.R.x - nr.L.x) * p2, nr.ys.floor);
          g.lineTo(f.L.x + (f.R.x - f.L.x) * p2, f.ys.floor);
        }
        g.stroke();
      }

      /* walls */
      if (detail) {
        HAUNT.wallSlice(g, nr.L.x, f.L.x, nr.ys, f.ys, fog, band, 'left', true);
        HAUNT.wallSlice(g, nr.R.x, f.R.x, nr.ys, f.ys, fog, band, 'right', true);
      } else {
        quad(g, nr.L.x, nr.ys.floor, f.L.x, f.ys.floor, f.L.x, f.ys.top, nr.L.x, nr.ys.top,
          HAUNT.hsl(HAUNT.PALETTE.paper, fog, -4));
        quad(g, nr.R.x, nr.ys.floor, f.R.x, f.ys.floor, f.R.x, f.ys.top, nr.R.x, nr.ys.top,
          HAUNT.hsl(HAUNT.PALETTE.paper, fog, 0));
      }

      /* wall dressing */
      if (detail && f.P.feature) {
        var ft = f.P.feature;
        var fn = HAUNT.FEATURES[ft.kind];
        if (fn) {
          var isL = ft.side === 'left';
          fn(g, isL ? nr.L.x : nr.R.x, isL ? f.L.x : f.R.x,
            nr.ys, f.ys, fog, t, ft.phase, ft.side);
        }
      }

      /* furniture */
      if (detail && f.n >= 4 && f.P.furn && SB.FURNITURE) {
        var fu = f.P.furn;
        var piece = SB.FURNITURE.PIECES[fu.kind];
        if (piece) {
          var l2 = fu.side === 'left';
          piece(g, {
            nx: fu.centre ? nr.C.x : (l2 ? nr.L.x : nr.R.x),
            fx: fu.centre ? f.C.x : (l2 ? f.L.x : f.R.x),
            nF: nr.C, fF: f.C,
            nw: nr.w, fog: fog, t: t, phase: fu.phase,
            inward: l2 ? 1 : -1,
            centreX: nr.C.x
          });
        }
      }

      /* THE END WALL. A run finishes in a solid face - the wall you would walk
       * into if you missed the turn. With real geometry this is just the
       * cross-section at the run's last point, and the camera pivot sweeps it
       * out of frame instead of it vanishing sideways. */
      if (f.P.isEnd) {
        this.junction(g, f.P, this.runs[(f.P.run + 1) % this.runs.length].dir,
          cam, sinY, cosY, W, H, fog, band);
      }

      /* dark ceiling line */
      g.strokeStyle = 'rgba(8,6,14,' + (0.5 * fog) + ')';
      g.lineWidth = Math.max(0.8, nr.w * 0.02);
      g.beginPath();
      g.moveTo(nr.L.x, nr.ys.top); g.lineTo(f.L.x, f.ys.top);
      g.moveTo(nr.R.x, nr.ys.top); g.lineTo(f.R.x, f.ys.top);
      g.stroke();
    }

    /* The junction you are standing in, last, so it sits on top of
     * everything. This is what fills the frame during a pivot. */
    for (var jn = Math.min(3, frames.length - 1); jn >= 0; jn--) {
      var jf = frames[jn];
      if (!jf || !jf.P.isEnd) continue;
      this.junction(g, jf.P, this.runs[(jf.P.run + 1) % this.runs.length].dir,
        cam, sinY, cosY, W, H, Math.pow(1 - (jf.n / DRAW_DIST), 1.7), jf.P.band);
    }

    for (var k = frames.length - 1; k >= 0; k--) {
      var fr = frames[k];
      if (fr && fr.P.hazard) this.drawHazard(g, fr, t, W, H);
    }
  };

  /* THE JUNCTION.
   *
   * Where two corridors meet there is a small square room. Two of its four
   * sides are the openings you arrive through and leave by; the other two are
   * solid, and they are the entire reason a pivot has anything to look at.
   *
   * Without them the camera sits at the vertex with both runs exactly edge-on
   * - every point at depth zero - and the screen goes black for the whole
   * turn. Modelling the two solid sides is what fixes that properly, rather
   * than stretching a fake wall across the frame.
   */
  Corridor.prototype.junction = function (g, P, nextDir, cam, sinY, cosY, W, H, fog, band) {
    var HAUNT = SB.HAUNTED;
    var A = DIR4[P.dir];
    var Pa = { dx: A.dz, dz: -A.dx };          // perpendicular, to the right
    var R = ROAD_W;
    var self = this;

    function corner(a, p) {
      return { x: P.x + A.dx * R * a + Pa.dx * R * p, z: P.z + A.dz * R * a + Pa.dz * R * p };
    }
    var FL = corner(1, -1), FR = corner(1, 1);
    var NL = corner(-1, -1), NR = corner(-1, 1);

    /* Which way out? +Pa is a right turn, -Pa a left one. */
    var B = DIR4[nextDir];
    var turningRight = (B.dx * Pa.dx + B.dz * Pa.dz) > 0;

    /* Always the wall straight ahead, plus whichever side is not the exit. */
    var walls = [[FL, FR, 'left']];
    walls.push(turningRight ? [FL, NL, 'left'] : [FR, NR, 'right']);

    function heights(Q) {
      return {
        floor: Q.yA,
        skirt: Q.yA - Q.yB * HAUNT.HEIGHTS.skirt,
        dado: Q.yA - Q.yB * HAUNT.HEIGHTS.dado,
        rail: Q.yA - Q.yB * HAUNT.HEIGHTS.rail,
        cornice: Q.yA - Q.yB * HAUNT.HEIGHTS.cornice,
        top: Q.yA - Q.yB * WALL_H
      };
    }

    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      var e = projectEdge(
        toCamera(w[0].x, w[0].z, cam, sinY, cosY),
        toCamera(w[1].x, w[1].z, cam, sinY, cosY),
        W, H, self.cameraDepth);
      if (!e) continue;
      var hn = heights(e.near), hf = heights(e.far);
      /* floor of the junction */
      g.fillStyle = HAUNT.hsl(HAUNT.PALETTE.floor, fog);
      HAUNT.wallSlice(g, e.near.x, e.far.x, hn, hf, fog, band, w[2], true);
    }

    /* a portrait on the wall you would walk into */
    var eF = projectEdge(
      toCamera(FL.x, FL.z, cam, sinY, cosY),
      toCamera(FR.x, FR.z, cam, sinY, cosY),
      W, H, this.cameraDepth);
    if (eF) {
      var h2 = heights(eF.near);
      var ww = Math.abs(eF.far.x - eF.near.x);
      if (ww > 26) {
        var pw = ww * 0.4, ph = (h2.rail - h2.cornice) * 0.5;
        var pcx = (eF.near.x + eF.far.x) / 2, pcy = (h2.rail + h2.cornice) / 2;
        g.fillStyle = HAUNT.hsl(HAUNT.PALETTE.gilt, fog, -12);
        g.fillRect(pcx - pw / 2, pcy - ph / 2, pw, ph);
        g.fillStyle = 'hsla(20,30%,9%,' + fog + ')';
        g.fillRect(pcx - pw * 0.38, pcy - ph * 0.38, pw * 0.76, ph * 0.76);
        g.fillStyle = 'hsla(34,22%,60%,' + (0.8 * fog) + ')';
        g.beginPath();
        g.ellipse(pcx, pcy - ph * 0.06, pw * 0.2, ph * 0.24, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  };

  Corridor.prototype.drawHazard = function (g, fr, t, W, H) {
    var THEME = SB.THEME;
    var h = fr.P.hazard, hz = h.hz;
    var fog = Math.pow(1 - (fr.n / DRAW_DIST), 1.5);
    if (fog <= 0.02 || fr.n < 4) return;
    if (fr.cC.d < NEAR) return;
    var HAUNT = SB.HAUNTED;
    var C = projectCam(fr.cC, W, H, this.cameraDepth);
    var L = projectCam(fr.cL.d < NEAR ? fr.cC : fr.cL, W, H, this.cameraDepth);
    var R = projectCam(fr.cR.d < NEAR ? fr.cC : fr.cR, W, H, this.cameraDepth);
    fr = { P: fr.P, n: fr.n, C: C, L: L, R: R, w: Math.abs(R.x - L.x) / 2,
      ys: { floor: C.yA, cornice: C.yA - C.yB * HAUNT.HEIGHTS.cornice } };

    var size = Math.min(fr.w * 0.28, W * 0.11);
    if (size < 1.5) return;

    var px, py;
    if (h.side === 'floor') { px = fr.C.x; py = fr.ys.floor - size * 0.15; }
    else if (h.side === 'float') {
      px = fr.C.x + Math.sin(t * 1.4 + h.phase) * fr.w * 0.3;
      py = fr.ys.floor + (fr.ys.cornice - fr.ys.floor) * 0.55;
    } else {
      px = h.side === 'left' ? fr.L.x : fr.R.x;
      py = fr.ys.floor + (fr.ys.cornice - fr.ys.floor) * h.lift;
    }

    var hue = hz.fx && hz.fx.rainbow ? (t * 90) % 360 : hz.hue;
    var pulse = 0.7 + Math.sin(t * 5 + h.phase) * 0.3;

    g.save();
    g.globalAlpha = fog;
    g.shadowColor = THEME.sig(0.9);
    g.shadowBlur = Math.min(26, size * 0.9);
    g.fillStyle = THEME.hue(hue, 85, 56, 0.96);
    g.beginPath(); g.arc(px, py, size, 0, Math.PI * 2); g.fill();
    g.restore();

    g.save();
    g.globalAlpha = fog;
    g.strokeStyle = THEME.sig(0.95, 8);
    g.lineWidth = Math.max(1, size * 0.16);
    g.beginPath(); g.arc(px, py, size, 0, Math.PI * 2); g.stroke();
    var grd = g.createRadialGradient(px, py, 0, px, py, size * 0.8);
    grd.addColorStop(0, THEME.sig(0.95 * pulse, 12));
    grd.addColorStop(1, THEME.sig(0, 0));
    g.fillStyle = grd;
    g.beginPath(); g.arc(px, py, size * 0.8, 0, Math.PI * 2); g.fill();
    g.restore();

    if (size > 11 && hz.glyph) {
      g.save();
      g.globalAlpha = fog;
      g.font = '700 ' + (size * 0.9) + 'px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(12,10,26,0.75)';
      g.fillText(hz.glyph, px, py + size * 0.04);
      g.restore();
    }
  };

  global.SB = global.SB || {};
  global.SB.Corridor = Corridor;
  global.SB.CORRIDOR_CONST = {
    SEG_LEN: SEG_LEN, ROAD_W: ROAD_W, WALL_H: WALL_H, TURN_TIME: TURN_TIME
  };
})(window);

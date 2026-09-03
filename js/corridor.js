/* Wonky Boy - corridor.js
 * ---------------------------------------------------------------------------
 * The 3D maze corridor behind the splash boy.
 *
 * ARCHITECTURE
 *
 * The maze is a path of axis-aligned straight runs meeting at right angles.
 * maze3d.js turns that path into ONE closed wall boundary - the centreline
 * offset left and right by the corridor half-width - plus a set of floor
 * quads. Corners are part of that boundary, not a special case bolted on.
 *
 * That distinction is the whole point. The previous renderer drew wall slices
 * belonging to whichever RUN the camera was in, and patched the corners with a
 * separate junction routine. Every gap, black box and flicker during a turn
 * came from the seam between those two systems. With one closed boundary the
 * seam does not exist: a corner is two wall pieces meeting at a vertex, drawn
 * by exactly the same code as a straight.
 *
 * THE CAMERA runs ahead of the boy and faces back at him, so what it sees
 * recedes. It travels the path, easing off into each corner, rounding it on an
 * arc while rotating through ninety degrees, and accelerating out again.
 *
 * COST. Everything per frame is bounded: candidate geometry comes only from
 * the runs immediately around the camera, the visible set is capped, and the
 * scratch buffers are allocated once and reused. No work is proportional to
 * the size of the maze.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SB = global.SB;

  var SEG_LEN = 200;
  var ROAD_W = 430;        // half-width of the corridor
  var WALL_H = 2250;       // wall height
  var CAM_H = 620;         // eye height
  var FOV = 100;
  var HORIZON = 0.44;
  var SPEED = 5200;        // world units per second on a straight
  var NEAR = 60;           // near clip, world units
  var FAR = 13000;         // beyond this is fog

  /* THE TURN, AS MECHANICS. Speed eases off over EASE_DIST into a corner,
   * bottoms out at the apex, and builds back over the same distance out, so
   * the corner is symmetric. TURN_TIME is not a feel value: it is how long the
   * quarter-circle arc through the junction takes at the apex speed, so the
   * pivot and the travel agree. About half a second, or thirty frames. */
  var TURN_MIN_SPEED = 0.25;
  var EASE_DIST = 2600;
  var TURN_TIME = (Math.PI / 2 * ROAD_W) / (SPEED * TURN_MIN_SPEED);

  /* Bounded draw budget - the ceiling on per-frame cost. */
  var MAX_WALLS = 160;
  var MAX_FLOORS = 100;

  var DIR4 = [
    { dx: 0, dz: 1 }, { dx: 1, dz: 0 }, { dx: 0, dz: -1 }, { dx: -1, dz: 0 }
  ];

  function rnd(rng) { return rng ? rng.next() : Math.random(); }
  function rint(rng, a, b) { return Math.floor(a + rnd(rng) * (b - a + 1)); }
  function smoothstep(p) { return p * p * (3 - 2 * p); }

  function cornerEase(dist) {
    if (dist >= EASE_DIST) return 1;
    if (dist <= 0) return TURN_MIN_SPEED;
    return TURN_MIN_SPEED + (1 - TURN_MIN_SPEED) * smoothstep(dist / EASE_DIST);
  }

  function byDepthDesc(a, b) { return b.depth - a.depth; }

  /* ------------------------------------------------------------- the path */

  function Corridor(seed) {
    this.rng = SB.Rng ? new SB.Rng(seed || 'wonky-splash') : null;
    this.cameraDepth = 1 / Math.tan((FOV / 2) * Math.PI / 180);

    this.runs = [];
    this.buildPath();

    this.geo = SB.MAZE3D.build(this.runs, ROAD_W, SEG_LEN);
    this.indexByRun();
    this.dress();

    this.runIdx = this.runs.length - 1;
    this.along = this.runs[this.runIdx].len * SEG_LEN - ROAD_W;
    this.yaw = this.headingFor(this.runs[this.runIdx]);
    this.turning = false;
    this.turnT = 0;
    this.turnFrom = this.yaw;
    this.turnTo = this.yaw;
    this.turnPrevDir = this.runs[this.runIdx].dir;
    this.turnPos = null;
    this.speedFactor = 1;

    /* Scratch, allocated once and reused. */
    this._wallBuf = [];
    this._floorBuf = [];
  }

  Corridor.prototype.buildPath = function () {
    var rng = this.rng;
    var dir = 0, x = 0, z = 0;
    /* Run length is in POINTS, and points are SEG_LEN apart, so n points last
     * n*SEG_LEN/SPEED seconds - but the corner easing lowers the average
     * speed, so the wall-clock gap is longer than that arithmetic suggests.
     * 32-54 measures at about 3.2 seconds between corners. Getting this wrong
     * is invisible in a still and ruinous in motion; it once produced a corner
     * every 0.67 seconds, which never read as a hallway at all. */
    for (var r = 0; r < 26; r++) {
      var len = rint(rng, 32, 54);
      this.runs.push({ dir: dir, len: len, x0: x, z0: z });
      x += DIR4[dir].dx * SEG_LEN * len;
      z += DIR4[dir].dz * SEG_LEN * len;
      dir = (dir + (rnd(rng) < 0.5 ? 1 : 3)) % 4;   // +1 right, +3 left
    }
  };

  /* Wall pieces are ordered along each boundary, so those belonging to a run
   * form a contiguous span. Recording the spans lets a frame consider only
   * the runs around the camera instead of the whole maze. */
  Corridor.prototype.indexByRun = function () {
    var spans = {}, i;
    for (i = 0; i < this.geo.walls.length; i++) {
      var w = this.geo.walls[i];
      var key = w.side + ':' + w.run;
      if (!spans[key]) spans[key] = { from: i, to: i };
      spans[key].to = i;
    }
    this.wallSpans = spans;

    var fs = {};
    for (i = 0; i < this.geo.floors.length; i++) {
      var f = this.geo.floors[i];
      if (!fs[f.run]) fs[f.run] = { from: i, to: i };
      fs[f.run].to = i;
    }
    this.floorSpans = fs;
  };

  Corridor.prototype.dress = function () {
    var rng = this.rng;
    var walls = this.geo.walls;
    var at;

    var HAUNT = SB.HAUNTED;
    if (HAUNT) {
      at = rint(rng, 2, 5);
      while (at < walls.length) {
        walls[at].feature = {
          kind: HAUNT.FEATURE_BAG[rint(rng, 0, HAUNT.FEATURE_BAG.length - 1)],
          phase: rnd(rng) * Math.PI * 2
        };
        at += rint(rng, 5, 11);
      }
    }

    var FURN = SB.FURNITURE;
    if (FURN) {
      at = rint(rng, 4, 9);
      while (at < walls.length) {
        if (!walls[at].feature) {
          var kind = FURN.BAG[rint(rng, 0, FURN.BAG.length - 1)];
          walls[at].furn = {
            kind: kind,
            centre: !!FURN.CENTRE_PIECES[kind],
            phase: rnd(rng) * Math.PI * 2
          };
        }
        at += rint(rng, 9, 17);
      }
    }

    var pool = (SB.HAZARDS ? SB.HAZARDS.CATALOG : []).filter(function (h) {
      return h.behavior === 'wall' || h.behavior === 'tile' ||
             h.behavior === 'item' || h.behavior === 'zapStatic';
    });
    if (pool.length) {
      at = rint(rng, 3, 9);
      while (at < walls.length) {
        walls[at].hazard = {
          hz: pool[rint(rng, 0, pool.length - 1)],
          lift: 0.3 + rnd(rng) * 0.4,
          phase: rnd(rng) * Math.PI * 2
        };
        at += rint(rng, 8, 16);
      }
    }
  };

  /* ----------------------------------------------------------- the camera */

  /* THE CAMERA FACES FORWARD AND TRAVELS BACKWARD.
   *
   * This is the crux of the whole splash, and it took several attempts.
   *
   * The boy runs at the camera, so the corridor must RECEDE. The obvious way
   * to get that is to point the camera back down the hallway it came from and
   * drive it forwards. That works on a straight and fails at every corner:
   * what sits behind you just after rounding a right angle is the outer
   * corner wall, a few hundred units from your face. A third of every cycle
   * was spent staring at wallpaper with no depth in frame at all.
   *
   * Facing FORWARD and travelling BACKWARD gives the same recession - the
   * camera moves away from everything it can see - but the view now always
   * looks down open hallway, because the corridor ahead is the part not yet
   * backed through. Corners arrive behind the camera and swing the view
   * around, and what comes into frame is the hallway just left, seen end-on
   * with its full depth.
   *
   * Consequences, all deliberate:
   *   - runs are traversed in DECREASING index
   *   - along counts DOWN, from the far end of a run to its near end
   *   - yaw is the run own direction: view = (sin(yaw), cos(yaw)) = +DIR4,
   *     which solves to dir * 90 degrees exactly, for all four directions
   *
   * tools/selftest.js checks the heading against the projection, because
   * these two have silently disagreed before - once for exactly half the
   * compass, which is why it looked correct in some screenshots. */
  Corridor.prototype.headingFor = function (run) {
    return run.dir * (Math.PI / 2);
  };

  Corridor.prototype.advance = function (dt) {
    var run = this.runs[this.runIdx];
    var runLen = run.len * SEG_LEN;

    if (this.turning) {
      this.turnT += dt;
      var p = Math.min(1, this.turnT / TURN_TIME);
      var d = this.turnTo - this.turnFrom;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      var e = smoothstep(p);
      this.yaw = this.turnFrom + d * e;
      this.speedFactor = TURN_MIN_SPEED;

      /* Round the corner on a quadratic Bezier rather than pivoting on the
       * spot. Standing still at the vertex puts the lens half a corridor
       * width from a flat wall, which reads as a room, not a hallway. */
      var A = DIR4[run.dir], B = DIR4[this.turnPrevDir];
      var jx = run.x0, jz = run.z0;                            // the junction
      var ix = jx + A.dx * ROAD_W, iz = jz + A.dz * ROAD_W;    // entry mouth
      var ox = jx - B.dx * ROAD_W, oz = jz - B.dz * ROAD_W;    // exit mouth
      var u = 1 - e;
      this.turnPos = {
        x: u * u * ix + 2 * u * e * jx + e * e * ox,
        z: u * u * iz + 2 * u * e * jz + e * e * oz
      };

      if (p >= 1) {
        this.turning = false;
        this.runIdx = (this.runIdx - 1 + this.runs.length) % this.runs.length;
        var nr = this.runs[this.runIdx];
        this.along = nr.len * SEG_LEN - ROAD_W;   // exactly where the arc ended
        this.turnPos = null;
        this.yaw = this.headingFor(nr);
      }
      return;
    }

    /* along counts down. Ease off approaching the corner at ROAD_W, and again
     * just after entering a run at its far end, so corners are symmetric. */
    var toCorner = this.along - ROAD_W;
    var fromCorner = (runLen - ROAD_W) - this.along;
    this.speedFactor = Math.min(cornerEase(toCorner), cornerEase(fromCorner));
    this.along -= SPEED * this.speedFactor * dt;

    if (this.along <= ROAD_W) {
      this.along = ROAD_W;
      var prev = this.runs[(this.runIdx - 1 + this.runs.length) % this.runs.length];
      this.turnPrevDir = prev.dir;
      this.turning = true;
      this.turnT = 0;
      this.turnFrom = this.yaw;
      this.turnTo = this.headingFor(prev);
      /* Seed the arc where the camera already is, so the first frame of the
       * pivot is continuous with the last frame of the straight. */
      var mA = DIR4[run.dir];
      this.turnPos = { x: run.x0 + mA.dx * this.along, z: run.z0 + mA.dz * this.along };
    }
  };

  Corridor.prototype.cameraPos = function () {
    if (this.turning && this.turnPos) return this.turnPos;
    var run = this.runs[this.runIdx];
    var d = DIR4[run.dir];
    return { x: run.x0 + d.dx * this.along, z: run.z0 + d.dz * this.along };
  };

  /* ---------------------------------------------------------- projection */

  function toCamera(wx, wz, cam, sinY, cosY) {
    var dx = wx - cam.x, dz = wz - cam.z;
    return { d: dz * cosY + dx * sinY, l: dx * cosY - dz * sinY };
  }

  function projectCam(c, W, H, cameraDepth) {
    var scale = cameraDepth / c.d;
    return {
      x: W / 2 + scale * c.l * W / 2,
      d: c.d,
      /* y(h) = yA - yB*h. W/2 on both axes keeps world proportions on a tall
       * phone; using H/2 vertically stretches everything about twofold. */
      yA: H * HORIZON + scale * CAM_H * W / 2,
      yB: scale * W / 2
    };
  }

  /* Project an edge, clipping against the near plane so a piece with one end
   * behind the camera is SHORTENED rather than discarded. Returning null only
   * when the whole edge is behind is what keeps the walls gap-free. */
  function projectEdge(A, B, W, H, cameraDepth) {
    if (A.d < NEAR && B.d < NEAR) return null;
    if (A.d < NEAR) {
      var ta = (NEAR - A.d) / (B.d - A.d);
      A = { d: NEAR, l: A.l + (B.l - A.l) * ta };
    } else if (B.d < NEAR) {
      var tb = (NEAR - B.d) / (A.d - B.d);
      B = { d: NEAR, l: B.l + (A.l - B.l) * tb };
    }
    return {
      near: projectCam(A, W, H, cameraDepth),
      far: projectCam(B, W, H, cameraDepth)
    };
  }

  function heights(P, HAUNT) {
    return {
      floor: P.yA,
      skirt: P.yA - P.yB * HAUNT.HEIGHTS.skirt,
      dado: P.yA - P.yB * HAUNT.HEIGHTS.dado,
      rail: P.yA - P.yB * HAUNT.HEIGHTS.rail,
      cornice: P.yA - P.yB * HAUNT.HEIGHTS.cornice,
      top: P.yA - P.yB * WALL_H
    };
  }

  function quad(g, ax, ay, bx, by, cx, cy, dx, dy, fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.lineTo(dx, dy);
    g.closePath();
    g.fill();
  }

  function fogAt(depth) {
    var f = 1 - depth / FAR;
    return f <= 0 ? 0 : Math.pow(f, 1.4);
  }

  /* -------------------------------------------------------------- render */

  /* The runs whose geometry can be on screen: the one the camera is in, one
   * behind (seen through the corner just passed) and one ahead (swinging in
   * during a pivot). Bounded, and independent of maze size. */
  Corridor.prototype.nearbyRuns = function (out) {
    var n = this.runs.length;
    out[0] = (this.runIdx - 1 + n) % n;
    out[1] = this.runIdx;
    out[2] = (this.runIdx + 1) % n;
    return out;
  };

  var RUNS_SCRATCH = [0, 0, 0];

  Corridor.prototype.draw = function (g, W, H, t) {
    var HAUNT = SB.HAUNTED;
    if (!HAUNT || !this.geo) return;

    var cam = this.cameraPos();
    var sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    var runsNear = this.nearbyRuns(RUNS_SCRATCH);
    var i, j, s;

    /* ---- floors, far to near ------------------------------------------ */
    var floors = this._floorBuf;
    floors.length = 0;
    for (i = 0; i < runsNear.length; i++) {
      var fspan = this.floorSpans[runsNear[i]];
      if (!fspan) continue;
      for (j = fspan.from; j <= fspan.to && floors.length < MAX_FLOORS; j++) {
        var fq = this.geo.floors[j];
        var q0 = toCamera(fq.p[0].x, fq.p[0].z, cam, sinY, cosY);
        var q1 = toCamera(fq.p[1].x, fq.p[1].z, cam, sinY, cosY);
        var q2 = toCamera(fq.p[2].x, fq.p[2].z, cam, sinY, cosY);
        var q3 = toCamera(fq.p[3].x, fq.p[3].z, cam, sinY, cosY);
        var dMin = Math.min(q0.d, q1.d, q2.d, q3.d);
        if (dMin > FAR) continue;
        var eN = projectEdge(q0, q1, W, H, this.cameraDepth);
        var eF = projectEdge(q3, q2, W, H, this.cameraDepth);
        if (!eN || !eF) continue;
        floors.push({ q: fq, eN: eN, eF: eF, depth: (q0.d + q1.d + q2.d + q3.d) * 0.25 });
      }
    }
    floors.sort(byDepthDesc);

    /* Ceiling first, from the same plan at WALL_H. Flat colour only - it is
     * barely lit and nothing is mounted on it, so it costs one quad each. */
    for (i = 0; i < floors.length; i++) {
      var cl2 = floors[i];
      var cfog = fogAt(cl2.depth);
      if (cfog <= 0.01) continue;
      var cnL = cl2.eN.near, cnR = cl2.eN.far, cfL = cl2.eF.near, cfR = cl2.eF.far;
      quad(g,
        cnL.x, cnL.yA - cnL.yB * WALL_H, cnR.x, cnR.yA - cnR.yB * WALL_H,
        cfR.x, cfR.yA - cfR.yB * WALL_H, cfL.x, cfL.yA - cfL.yB * WALL_H,
        HAUNT.hsl(HAUNT.PALETTE.cornice, cfog, cl2.q.band ? -13 : -10));
    }

    for (i = 0; i < floors.length; i++) {
      var fl = floors[i];
      var ffog = fogAt(fl.depth);
      if (ffog <= 0.01) continue;
      var nL = fl.eN.near, nR = fl.eN.far;
      var fL = fl.eF.near, fR = fl.eF.far;
      quad(g, nL.x, nL.yA, nR.x, nR.yA, fR.x, fR.yA, fL.x, fL.yA,
        HAUNT.hsl(fl.q.band ? HAUNT.PALETTE.floorAlt : HAUNT.PALETTE.floor, ffog));
      if (SB.CARPET && !fl.q.junction) {
        SB.CARPET.draw(g,
          { L: { x: nL.x }, R: { x: nR.x }, ys: { floor: nL.yA } },
          { L: { x: fL.x }, R: { x: fR.x }, ys: { floor: fL.yA } },
          ffog, fl.q.run * 1000 + fl.q.k);
      }
    }

    /* ---- walls, far to near ------------------------------------------- */
    var walls = this._wallBuf;
    walls.length = 0;
    for (i = 0; i < runsNear.length; i++) {
      for (s = 0; s < 2; s++) {
        var span = this.wallSpans[(s ? 'right' : 'left') + ':' + runsNear[i]];
        if (!span) continue;
        for (j = span.from; j <= span.to && walls.length < MAX_WALLS; j++) {
          var w = this.geo.walls[j];
          var a = toCamera(w.x1, w.z1, cam, sinY, cosY);
          var b = toCamera(w.x2, w.z2, cam, sinY, cosY);
          if (Math.min(a.d, b.d) > FAR) continue;
          var e = projectEdge(a, b, W, H, this.cameraDepth);
          if (!e) continue;
          walls.push({ w: w, e: e, depth: Math.max(a.d, b.d) });
        }
      }
    }
    walls.sort(byDepthDesc);

    for (i = 0; i < walls.length; i++) {
      var it = walls[i];
      var wfog = fogAt(it.depth);
      if (wfog <= 0.01) continue;

      var pn = it.e.near, pf = it.e.far;
      var ysN = heights(pn, HAUNT), ysF = heights(pf, HAUNT);
      var detail = it.depth < FAR * 0.5;

      HAUNT.wallSlice(g, pn.x, pf.x, ysN, ysF, wfog, it.w.band, it.w.side, detail);

      /* Dressing is skipped on a piece whose near end is clipped or which has
       * blown up on screen. A painting is a dark canvas inside a frame, and
       * stretching that trapezoid across a clipped piece paints a black
       * rectangle onto the wall. The wall itself still draws; it just stays
       * plain for the frame or two involved. */
      var dressable = detail && pn.d > NEAR * 2.5 &&
                      Math.abs(pn.x - pf.x) < W * 1.5;
      if (!dressable) continue;

      if (it.w.feature) {
        var fn = HAUNT.FEATURES[it.w.feature.kind];
        if (fn) fn(g, pn.x, pf.x, ysN, ysF, wfog, t, it.w.feature.phase, it.w.side);
      }
      if (it.w.furn && SB.FURNITURE) {
        var piece = SB.FURNITURE.PIECES[it.w.furn.kind];
        if (piece) {
          piece(g, {
            nx: pn.x, fx: pf.x, nF: pn, fF: pf,
            nw: Math.abs(pn.x - pf.x) * 0.5 + 8,
            fog: wfog, t: t, phase: it.w.furn.phase,
            inward: it.w.side === 'left' ? 1 : -1,
            centreX: (pn.x + pf.x) * 0.5
          });
        }
      }
      if (it.w.hazard) this.drawHazard(g, it, ysN, wfog, t, W);
    }
  };

  Corridor.prototype.drawHazard = function (g, it, ysN, fog, t, W) {
    var THEME = SB.THEME;
    var hz = it.w.hazard.hz;
    var pn = it.e.near, pf = it.e.far;
    var size = Math.min(Math.abs(pn.x - pf.x) * 0.45, W * 0.10);
    if (size < 2) return;

    var px = (pn.x + pf.x) * 0.5;
    var py = ysN.floor + (ysN.cornice - ysN.floor) * it.w.hazard.lift;
    var hue = hz.fx && hz.fx.rainbow ? (t * 90) % 360 : hz.hue;
    var pulse = 0.7 + Math.sin(t * 5 + it.w.hazard.phase) * 0.3;

    g.save();
    g.globalAlpha = fog;
    g.shadowColor = THEME.sig(0.9);
    g.shadowBlur = Math.min(24, size);
    g.fillStyle = THEME.hue(hue, 85, 56, 0.96);
    g.beginPath(); g.arc(px, py, size, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = THEME.sig(0.95, 8);
    g.lineWidth = Math.max(1, size * 0.16);
    g.beginPath(); g.arc(px, py, size, 0, Math.PI * 2); g.stroke();
    var grd = g.createRadialGradient(px, py, 0, px, py, size * 0.8);
    grd.addColorStop(0, THEME.sig(0.95 * pulse, 12));
    grd.addColorStop(1, THEME.sig(0, 0));
    g.fillStyle = grd;
    g.beginPath(); g.arc(px, py, size * 0.8, 0, Math.PI * 2); g.fill();
    if (size > 10 && hz.glyph) {
      g.font = '700 ' + (size * 0.9) + 'px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(12,10,26,0.75)';
      g.fillText(hz.glyph, px, py + size * 0.04);
    }
    g.restore();
  };

  global.SB = global.SB || {};
  global.SB.Corridor = Corridor;
  global.SB.CORRIDOR_CONST = {
    SEG_LEN: SEG_LEN, ROAD_W: ROAD_W, WALL_H: WALL_H,
    TURN_TIME: TURN_TIME, SPEED: SPEED, FAR: FAR
  };
})(window);

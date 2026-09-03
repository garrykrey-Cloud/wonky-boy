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
  /* Draw distance. 9000 units is about twenty corridor widths - past that
   * the fog has taken over and the slices are a pixel or two tall, so the
   * work is invisible. Dropping it from 13000 roughly halved the per-frame
   * geometry with no visible change to the frame. */
  var FAR = 9000;
  /* must match maze3d.js FLOOR_OVERHANG */
  var FLOOR_OVERHANG = 1.9;

  /* THE TURN, AS MECHANICS. Speed eases off over EASE_DIST into a corner,
   * bottoms out at the apex, and builds back over the same distance out, so
   * the corner is symmetric. TURN_TIME is not a feel value: it is how long the
   * quarter-circle arc through the junction takes at the apex speed, so the
   * pivot and the travel agree. About half a second, or thirty frames. */
  /* THE CORNER.
   *
   * There is no TURN_TIME any more. The pivot is driven by DISTANCE along
   * the corner arc, so rotation and travel cannot drift apart - the turn
   * takes exactly as long as it takes to drive round it.
   *
   * Which makes the apex speed the one dial that sets corner duration:
   *
   *     duration = TURN_ARC / (SPEED * TURN_MIN_SPEED)
   *              = 675 / (5200 * 0.39)
   *              = 0.33s
   *
   * a third of a second, which is the ten frames at 30fps Garry asked for,
   * or twenty at 60. It also stays well clear of the old quarter-speed
   * apex, which read as the camera stopping dead and lurching off again. */
  var TURN_MIN_SPEED = 0.39;
  var EASE_DIST = 3000;
  var TURN_ARC = (Math.PI / 2) * ROAD_W;   // length of the quarter turn

  /* Bounded draw budget - the ceiling on per-frame cost. */
  var MAX_WALLS = 110;
  var MAX_FLOORS = 70;

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
    this.turnE = 0;
    this.turnPrevDir = this.runs[this.runIdx].dir;
    this.turnPos = null;
    this.speedFactor = 1;

    /* SCRATCH, ALLOCATED ONCE.
     *
     * A frame considers a couple of hundred pieces of geometry, and every
     * one used to mint fresh objects for its entry and its two projected
     * points - roughly eight hundred short-lived allocations per frame.
     * The average frame was fine and the collector was not: ten frames in
     * nine hundred blew the 16.7ms budget, one of them by 396ms, which is
     * a visible hitch.
     *
     * These pools are filled once and rewritten in place. Steady-state
     * allocation in draw() is now zero. */
    this._wallBuf = [];
    this._floorBuf = [];
    this._pool = { pts: [], edges: [], items: [], n: 0, e: 0, i: 0 };
    for (var pi = 0; pi < (MAX_WALLS + MAX_FLOORS) * 4 + 32; pi++) {
      this._pool.pts.push({ x: 0, d: 0, yA: 0, yB: 0 });
    }
    for (var ei = 0; ei < (MAX_WALLS + MAX_FLOORS) * 2 + 16; ei++) {
      this._pool.edges.push({ near: null, far: null });
    }
    for (var ii = 0; ii < MAX_WALLS + MAX_FLOORS + 16; ii++) {
      this._pool.items.push({ w: null, q: null, e: null, eN: null, eF: null, depth: 0 });
    }
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
      /* Drive the corner by DISTANCE, not by a timer. */
      this.turnE += (SPEED * TURN_MIN_SPEED * dt) / TURN_ARC;
      var e = Math.min(1, this.turnE);
      var u = 1 - e;
      this.speedFactor = TURN_MIN_SPEED;

      var A = DIR4[run.dir], B = DIR4[this.turnPrevDir];
      var jx = run.x0, jz = run.z0;                            // the junction
      var ix = jx + A.dx * ROAD_W, iz = jz + A.dz * ROAD_W;    // entry mouth
      var ox = jx - B.dx * ROAD_W, oz = jz - B.dz * ROAD_W;    // exit mouth

      this.turnPos = {
        x: u * u * ix + 2 * u * e * jx + e * e * ox,
        z: u * u * iz + 2 * u * e * jz + e * e * oz
      };

      /* YAW COMES FROM THE PATH, NOT A SEPARATE EASE.
       *
       * Interpolating the angle on its own curve meant rotation and travel
       * were two independent animations that only agreed at the ends. Here
       * the heading is simply the tangent of the arc being driven, negated
       * because the camera faces where it came from.
       *
       * That is continuous by construction. At e=0 the derivative points
       * along -DIR4[run.dir], so the heading is exactly headingFor(run); at
       * e=1 it points along -DIR4[prev], exactly headingFor(prev). No seam at
       * either end, and the rate of turn always matches the speed. */
      var tx = 2 * u * (jx - ix) + 2 * e * (ox - jx);
      var tz = 2 * u * (jz - iz) + 2 * e * (oz - jz);
      var m = Math.sqrt(tx * tx + tz * tz) || 1;
      this.yaw = Math.atan2(-tx / m, -tz / m);

      if (e >= 1) {
        this.turning = false;
        this.runIdx = (this.runIdx - 1 + this.runs.length) % this.runs.length;
        var nr = this.runs[this.runIdx];
        this.along = nr.len * SEG_LEN - ROAD_W;
        this.turnPos = null;
        this.yaw = this.headingFor(nr);
      }
      return;
    }

    /* along counts down. Ease off approaching the corner at ROAD_W, and
     * again just after entering a run at its far end, so corners are
     * symmetric coming and going. */
    var toCorner = this.along - ROAD_W;
    var fromCorner = (runLen - ROAD_W) - this.along;
    this.speedFactor = Math.min(cornerEase(toCorner), cornerEase(fromCorner));
    this.along -= SPEED * this.speedFactor * dt;

    if (this.along <= ROAD_W) {
      this.along = ROAD_W;
      var prev = this.runs[(this.runIdx - 1 + this.runs.length) % this.runs.length];
      this.turnPrevDir = prev.dir;
      this.turning = true;
      this.turnE = 0;
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

  function projectCam(c, W, H, cameraDepth, out) {
    var scale = cameraDepth / c.d;
    out = out || { x: 0, d: 0, yA: 0, yB: 0 };
    out.x = W / 2 + scale * c.l * W / 2;
    out.d = c.d;
    /* y(h) = yA - yB*h. W/2 on both axes keeps world proportions on a tall
     * phone; using H/2 vertically stretches everything about twofold. */
    out.yA = H * HORIZON + scale * CAM_H * W / 2;
    out.yB = scale * W / 2;
    return out;
  }

  /* Project an edge, clipping against the near plane so a piece with one end
   * behind the camera is SHORTENED rather than discarded. Returning null only
   * when the whole edge is behind is what keeps the walls gap-free. */
  function projectEdge(A, B, W, H, cameraDepth, pool) {
    if (A.d < NEAR && B.d < NEAR) return null;
    if (A.d < NEAR) {
      var ta = (NEAR - A.d) / (B.d - A.d);
      A = { d: NEAR, l: A.l + (B.l - A.l) * ta };
    } else if (B.d < NEAR) {
      var tb = (NEAR - B.d) / (A.d - B.d);
      B = { d: NEAR, l: B.l + (A.l - B.l) * tb };
    }
    var edge = pool ? pool.edges[pool.e++] : { near: null, far: null };
    edge.near = projectCam(A, W, H, cameraDepth, pool ? pool.pts[pool.n++] : null);
    edge.far = projectCam(B, W, H, cameraDepth, pool ? pool.pts[pool.n++] : null);
    return edge;
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
    var pool = this._pool;
    pool.n = 0; pool.e = 0; pool.i = 0;
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
        var eN = projectEdge(q0, q1, W, H, this.cameraDepth, pool);
        var eF = projectEdge(q3, q2, W, H, this.cameraDepth, pool);
        if (!eN || !eF) continue;
        var fitem = pool.items[pool.i++];
        fitem.q = fq; fitem.eN = eN; fitem.eF = eF;
        fitem.depth = (q0.d + q1.d + q2.d + q3.d) * 0.25;
        floors.push(fitem);
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
        /* The floor quad is laid wider than the corridor to fill the near
         * field (see maze3d.js). The runner must not be: scale the edges back
         * to the true wall line, or the carpet borders end up hidden behind
         * the skirting and the pattern reads at the wrong width. */
        var nMid = (nL.x + nR.x) * 0.5, fMid = (fL.x + fR.x) * 0.5;
        var k = 1 / FLOOR_OVERHANG;
        SB.CARPET.draw(g,
          { L: { x: nMid + (nL.x - nMid) * k }, R: { x: nMid + (nR.x - nMid) * k }, ys: { floor: nL.yA } },
          { L: { x: fMid + (fL.x - fMid) * k }, R: { x: fMid + (fR.x - fMid) * k }, ys: { floor: fL.yA } },
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
          var e = projectEdge(a, b, W, H, this.cameraDepth, pool);
          if (!e) continue;
          var witem = pool.items[pool.i++];
          witem.w = w; witem.e = e; witem.depth = Math.max(a.d, b.d);
          walls.push(witem);
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
      /* Joinery, stiles and beads only where they can be resolved. */
      var detail = it.depth < FAR * 0.42;

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
    TURN_ARC: TURN_ARC, TURN_MIN_SPEED: TURN_MIN_SPEED, SPEED: SPEED, FAR: FAR
  };
})(window);

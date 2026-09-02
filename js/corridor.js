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
    this.yaw = this.headingFor(this.runs[0]);
    this.turning = false;
    this.turnT = 0;
    this.turnFrom = this.yaw;
    this.turnTo = this.yaw;
  }

  Corridor.prototype.build = function () {
    var rng = this.rng;
    var dir = 0;
    var x = 0, z = 0;

    /* RUN LENGTH IS IN POINTS, AND POINTS ARE SEG_LEN APART.
     *
     * This is worth spelling out because getting it wrong is invisible in a
     * still and ruinous in motion. At SPEED units/sec a run of n points lasts
     * n * SEG_LEN / SPEED seconds. The old road-renderer track counted its
     * straights in segments and this rewrite reused those numbers unchanged,
     * which gave runs of 2000-3600 units - 0.38 to 0.69 SECONDS apiece. With
     * a 0.3s pivot on the end of each, the corridor spent 45% of its life
     * mid-turn and never held still long enough to read as a hallway.
     *
     * 52-88 points is 10400-17600 units, i.e. 2.0 to 3.4 seconds of straight
     * between corners, which is what was actually intended all along. */
    for (var r = 0; r < 26; r++) {
      var len = rint(rng, 52, 88);
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
      var e = smoothstep(p);
      this.yaw = this.turnFrom + d * e;

      /* ROUND the corner, do not pivot on the spot.
       *
       * Standing still at the vertex puts the camera about half a corridor
       * width from the junction's solid wall, so for the whole pivot the
       * frame is one flat expanse of wallpaper with no depth in it at all -
       * which reads as an open room rather than a hallway, alternating with
       * the corridor every couple of seconds.
       *
       * Nobody stops dead at a corner. The camera now follows a quadratic
       * Bezier from the entry mouth, through the vertex as control point, to
       * the exit mouth of the next run, timed on the same easing as the yaw.
       * The old hall swings out, the corner passes, the new hall opens up,
       * and there is corridor on screen the entire way through. */
      var A = DIR4[run.dir], B = DIR4[this.turnNextDir];
      var jx = run.x0 + A.dx * runLen, jz = run.z0 + A.dz * runLen;
      var ix = jx - A.dx * ROAD_W, iz = jz - A.dz * ROAD_W;
      var ox = jx + B.dx * ROAD_W, oz = jz + B.dz * ROAD_W;
      var u = 1 - e;
      this.turnPos = {
        x: u * u * ix + 2 * u * e * jx + e * e * ox,
        z: u * u * iz + 2 * u * e * jz + e * e * oz
      };
      if (p >= 1) {
        this.turning = false;
        this.runIdx = (this.runIdx + 1) % this.runs.length;
        /* Step clear of the junction rather than landing dead on it.
         * Finishing a pivot at along = 0 leaves the camera standing exactly
         * ON the vertex, so the corner wall behind it is at distance zero,
         * gets thrown away by the near clip, and the view stays dim and empty
         * for half a second until enough of the new run accumulates. One
         * corridor half-width puts the corner a readable distance behind,
         * which is physically where you are once the turn is complete.
         * At full speed this is under a tenth of a second of travel. */
        this.along = ROAD_W;
        this.yaw = this.headingFor(this.runs[this.runIdx]);
      }
      return;
    }

    this.along += SPEED * dt;
    /* Start the pivot at the junction's MOUTH, not its centre, so the arc
     * below begins exactly where the camera already is. */
    if (this.along >= runLen - ROAD_W) {
      this.along = runLen - ROAD_W;
      var next = this.runs[(this.runIdx + 1) % this.runs.length];
      this.turnNextDir = next.dir;
      /* Seed the arc at the mouth. The turning branch above runs BEFORE
       * this trigger, so without seeding it here the first frame of the new
       * turn would read the previous turn's stale arc position and the
       * camera would teleport across the map. */
      var mA = DIR4[run.dir];
      this.turnPos = {
        x: run.x0 + mA.dx * (runLen - ROAD_W),
        z: run.z0 + mA.dz * (runLen - ROAD_W)
      };
      this.turning = true;
      this.turnT = 0;
      this.turnFrom = this.yaw;
      this.turnTo = this.headingFor(next);
    }
  };

  /* THE CAMERA FACES BACKWARDS.
   *
   * It runs ahead of the boy and looks at him, so it travels along the run
   * but faces the way it came. Features it can see therefore get FURTHER
   * away every frame and shrink toward the vanishing point - the hallway
   * recedes.
   *
   * Facing the direction of travel instead makes walls sweep out past the
   * viewer, which is a camera chasing him from behind, and reads as the boy
   * running backwards. That is the bug this exists to prevent; it has come
   * back twice. */
  Corridor.prototype.headingFor = function (run) {
    /* Deriving this from projectPoint rather than guessing, because guessing
     * got it wrong twice. projectPoint computes
     *     depth = dz*cos(-yaw) + dx*sin(-yaw)
     * so the view direction is (sin(-yaw), cos(-yaw)) in (x, z). Facing back
     * down the run means that vector must equal -DIR4[dir].
     *
     * Solving gives forward yaw = ((4 - dir) % 4) * 90, and backwards is that
     * plus 180. The obvious-looking (dir + 2) * 90 is NOT the same thing: it
     * happens to be right for dir 0 and 2 and is exactly inverted for 1 and
     * 3, because x maps to sin and z to cos, which reverses the handedness of
     * the odd directions. That is why the corridor ran the correct way down
     * some halls and backwards down others. */
    return ((4 - run.dir) % 4) * (Math.PI / 2) + Math.PI;
  };

  Corridor.prototype.cameraPos = function () {
    if (this.turning && this.turnPos) return this.turnPos;
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
    /* Looking back down the run, so the points in view are the ones with a
     * LOWER index: walk down the array, not up. Start one point past the
     * camera so the nearest slice still has a partner to pair with; that one
     * is behind the view and the near clip removes it. */
    var startIdx = run.startPoint + Math.min(run.len, Math.floor(this.along / SEG_LEN) + 1);

    /* HOW MUCH OF THE MAZE TO DRAW.
     *
     * Walking the full DRAW_DIST back from the camera runs through many
     * earlier runs, all perpendicular, whose wall quads project as enormous
     * skewed shapes across the frame. Measured before fixing: 42 to 58 of 60
     * slices came from a foreign run, and the count rose and fell with the
     * turn rhythm - which is exactly what made the view alternate between
     * corridor and open room every couple of seconds.
     *
     * Culling to the current run alone overcorrected twice over. Looking back
     * at a corner, the opening you came through is right in the sightline, so
     * dropping the previous hallway punched a black hole in the junction. And
     * mid-pivot the hallway being turned INTO is swinging across the frame,
     * so dropping that left half the screen empty.
     *
     * The honest answer is what you can actually see from inside a corner:
     * this hallway, one back through the opening behind, and - only while
     * pivoting - the one ahead. Never more.
     */
    var prevIdx = (this.runIdx - 1 + this.runs.length) % this.runs.length;
    var nextIdx = (this.runIdx + 1) % this.runs.length;
    var nextRun = this.runs[nextIdx];
    /* Mid-turn, start the walk at the far end of the hallway being entered so
     * it is gathered too. Skipped when the path wraps, where the runs are not
     * contiguous in the array. */
    var showNext = this.turning && nextRun.startPoint > run.startPoint;
    if (showNext) startIdx = nextRun.startPoint + nextRun.len;

    var frames = [];
    for (var n = 0; n < DRAW_DIST; n++) {
      var pi = startIdx - n;
      if (pi < 0) break;
      var P = pts[pi];
      if (P.run !== this.runIdx && P.run !== prevIdx &&
          !(showNext && P.run === nextIdx)) break;
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

      /* the runner goes down over the boards, leaving a margin of bare wood */
      if (SB.CARPET) SB.CARPET.draw(g, nr, f, fog, f.P.run * 1000 + f.P.i);

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
          var wnx = isL ? nr.L.x : nr.R.x, wfx = isL ? f.L.x : f.R.x;
          /* screen side, not world side - see the note on furniture below */
          fn(g, wnx, wfx, nr.ys, f.ys, fog, t, ft.phase,
            wnx < nr.C.x ? 'left' : 'right');
        }
      }

      /* furniture */
      if (detail && f.n >= 4 && f.P.furn && SB.FURNITURE) {
        var fu = f.P.furn;
        var piece = SB.FURNITURE.PIECES[fu.kind];
        if (piece) {
          var l2 = fu.side === 'left';
          var pnx = fu.centre ? nr.C.x : (l2 ? nr.L.x : nr.R.x);
          var pfx = fu.centre ? f.C.x : (l2 ? f.L.x : f.R.x);
          /* INWARD COMES FROM THE PROJECTION, NOT THE LABEL.
           * fu.side is fixed when the track is built and describes world
           * space. Which side of the SCREEN that wall lands on depends on
           * which way the camera faces, so a hard-coded +1/-1 silently
           * inverts the moment the facing changes and every piece of
           * furniture gets pushed into the wall instead of into the room.
           * Taking the sign from the projected centre cannot go wrong. */
          piece(g, {
            nx: pnx, fx: pfx,
            nF: nr.C, fF: f.C,
            nw: nr.w, fog: fog, t: t, phase: fu.phase,
            inward: nr.C.x >= pnx ? 1 : -1,
            centreX: nr.C.x
          });
        }
      }

      /* THE END WALL. A run finishes in a solid face - the wall you would walk
       * into if you missed the turn. With real geometry this is just the
       * cross-section at the run's last point, and the camera pivot sweeps it
       * out of frame instead of it vanishing sideways. */
      if (f.P.i === 0) this.junctionAt(g, f.P, cam, sinY, cosY, W, H, fog, band);

      /* dark ceiling line */
      g.strokeStyle = 'rgba(8,6,14,' + (0.5 * fog) + ')';
      g.lineWidth = Math.max(0.8, nr.w * 0.02);
      g.beginPath();
      g.moveTo(nr.L.x, nr.ys.top); g.lineTo(f.L.x, f.ys.top);
      g.moveTo(nr.R.x, nr.ys.top); g.lineTo(f.R.x, f.ys.top);
      g.stroke();
    }

    /* The junction you are standing in, last, so it sits on top of everything.
     *
     * Two different junctions can matter. The one at the FAR end of the run is
     * the corner you came through, and caps the corridor so you are not
     * looking into black where the previous hallway used to be drawn. The one
     * at the NEAR end is the corner you are pivoting through right now; it is
     * indexed against the NEXT run's first point, which this run's frames do
     * not include, so it has to be drawn explicitly or the screen empties out
     * mid-turn. */
    for (var jn = Math.min(3, frames.length - 1); jn >= 0; jn--) {
      var jf = frames[jn];
      if (!jf || jf.P.i !== 0) continue;
      this.junctionAt(g, jf.P, cam, sinY, cosY, W, H,
        Math.pow(1 - (jf.n / DRAW_DIST), 1.7), jf.P.band);
    }

    if (this.turning) {
      var endPt = pts[run.startPoint + run.len];
      var nextRun = this.runs[(this.runIdx + 1) % this.runs.length];
      this.junction(g, { x: endPt.x, z: endPt.z, dir: run.dir }, nextRun.dir,
        cam, sinY, cosY, W, H, 1, endPt.band);
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
  /* The junction at a run start joins the PREVIOUS run to this one. Arriving
   * along the previous run's direction, leaving along this one's. */
  Corridor.prototype.junctionAt = function (g, P, cam, sinY, cosY, W, H, fog, band) {
    var prev = this.runs[(P.run - 1 + this.runs.length) % this.runs.length];
    this.junction(g, { x: P.x, z: P.z, dir: prev.dir }, P.dir,
      cam, sinY, cosY, W, H, fog, band);
  };

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

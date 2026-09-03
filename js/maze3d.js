/* Wonky Boy - maze3d.js
 * ---------------------------------------------------------------------------
 * THE CORRIDOR AS ONE CLOSED SHAPE.
 *
 * The renderer used to treat the maze as a list of straight RUNS, drawing wall
 * slices between consecutive points of whichever run the camera was in, and
 * then patching the corners with a special-case "junction" routine. Every gap,
 * black box and flicker during a turn came from that split: a corner is
 * exactly the place where the run-based model has nothing to say, so it was
 * always being papered over.
 *
 * This builds the corridor the way it actually is - a single continuous
 * boundary. Take the centreline of the maze and offset it left and right by
 * the corridor half-width. Those two offset polylines ARE the walls, corners
 * included, and they are closed by construction. A corner stops being a
 * special case and becomes what it really is: two wall pieces meeting at a
 * vertex, drawn by the same code as everything else.
 *
 * OFFSETTING A RIGHT ANGLE
 *
 * At a vertex where the path turns from direction a to direction b, the offset
 * boundary on a given side has its corner at
 *
 *     V = P + (n_side(a) + n_side(b)) * R
 *
 * For a 90 degree turn the two normals are perpendicular, so that lands at
 * R*sqrt(2) from the vertex - the mitre point. Worked through concretely for a
 * corridor running north then turning east, half-width R:
 *
 *   incoming occupies x in [-R, R],  outgoing occupies z in [-R, R]
 *   outer (left) corner  -> (-R, +R)
 *   inner (right) corner -> (+R, -R)
 *
 * which is exactly what the formula gives for each side. The same expression
 * handles left turns, right turns, and the straight case (where the two
 * normals are equal and it reduces to a plain offset).
 *
 * The boundary is then chopped into pieces of roughly SEG_LEN so that wall
 * dressing has somewhere to hang and so each piece shades independently. The
 * chopping is cosmetic; the geometry underneath is continuous either way.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var DIR4 = [
    { dx: 0, dz: 1 }, { dx: 1, dz: 0 }, { dx: 0, dz: -1 }, { dx: -1, dz: 0 }
  ];

  /* Left of travel, and right of travel. Rotating (x,z) by +90 gives (-z,x). */
  function normal(dir, side) {
    var d = DIR4[dir];
    return side === 'left'
      ? { x: -d.dz, z: d.dx }
      : { x: d.dz, z: -d.dx };
  }

  /* The corridor centreline as a list of vertices: the start of every run,
   * plus the far end of the last one. */
  function centreline(runs, SEG_LEN) {
    var v = [];
    for (var i = 0; i < runs.length; i++) {
      v.push({ x: runs[i].x0, z: runs[i].z0, dir: runs[i].dir, run: i });
    }
    var last = runs[runs.length - 1];
    var d = DIR4[last.dir];
    v.push({
      x: last.x0 + d.dx * last.len * SEG_LEN,
      z: last.z0 + d.dz * last.len * SEG_LEN,
      dir: last.dir,
      run: runs.length - 1
    });
    return v;
  }

  /* One offset polyline. Index i of the result corresponds to vertex i of the
   * centreline, so a wall piece between result[i] and result[i+1] belongs to
   * run i. */
  function offsetPolyline(cl, side, R) {
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      /* The mitre formula (n_in + n_out) * R only applies where a turn
       * actually happens. At the two open ends there is just one run, so
       * summing a normal with itself would offset by 2R and flare the
       * corridor mouth outwards. Those get a plain single offset. */
      var interior = i > 0 && i < cl.length - 1;
      var a, b;
      if (interior) {
        a = normal(cl[i - 1].dir, side);
        b = normal(cl[i].dir, side);
      } else {
        a = normal(i === 0 ? cl[0].dir : cl[i - 1].dir, side);
        b = { x: 0, z: 0 };
      }
      out.push({
        x: cl[i].x + (a.x + b.x) * R,
        z: cl[i].z + (a.z + b.z) * R
      });
    }
    return out;
  }

  /* Chop the boundary into drawable pieces. */
  function pieces(poly, side, SEG_LEN) {
    var out = [];
    for (var i = 0; i < poly.length - 1; i++) {
      var A = poly[i], B = poly[i + 1];
      var dx = B.x - A.x, dz = B.z - A.z;
      var len = Math.hypot(dx, dz);
      if (len < 1) continue;
      var n = Math.max(1, Math.round(len / SEG_LEN));
      for (var k = 0; k < n; k++) {
        var t0 = k / n, t1 = (k + 1) / n;
        out.push({
          x1: A.x + dx * t0, z1: A.z + dz * t0,
          x2: A.x + dx * t1, z2: A.z + dz * t1,
          side: side,
          run: i,
          k: out.length,
          band: out.length % 2,
          feature: null,
          furn: null
        });
      }
    }
    return out;
  }

  /* Floor: a quad per run slice, plus a square at every junction so the corner
   * floor is covered too. Slight overlap at the corners is harmless - it is
   * the same carpet either way - and it guarantees no bare patches. */
  function floors(runs, cl, R, SEG_LEN) {
    var out = [];
    var i, k;
    for (i = 0; i < runs.length; i++) {
      var run = runs[i];
      var d = DIR4[run.dir];
      var nx = -d.dz, nz = d.dx;          // left normal
      for (k = 0; k < run.len; k++) {
        var s0 = k * SEG_LEN, s1 = (k + 1) * SEG_LEN;
        var ax = run.x0 + d.dx * s0, az = run.z0 + d.dz * s0;
        var bx = run.x0 + d.dx * s1, bz = run.z0 + d.dz * s1;
        out.push({
          run: i, k: k, band: (k % 2),
          p: [
            { x: ax + nx * R, z: az + nz * R },
            { x: ax - nx * R, z: az - nz * R },
            { x: bx - nx * R, z: bz - nz * R },
            { x: bx + nx * R, z: bz + nz * R }
          ]
        });
      }
    }
    /* junction squares - every interior vertex of the centreline */
    for (i = 1; i < cl.length - 1; i++) {
      out.push({
        run: cl[i].run, k: -1, band: 0, junction: true,
        p: [
          { x: cl[i].x - R, z: cl[i].z - R },
          { x: cl[i].x + R, z: cl[i].z - R },
          { x: cl[i].x + R, z: cl[i].z + R },
          { x: cl[i].x - R, z: cl[i].z + R }
        ]
      });
    }
    return out;
  }

  function build(runs, R, SEG_LEN) {
    var cl = centreline(runs, SEG_LEN);
    var left = offsetPolyline(cl, 'left', R);
    var right = offsetPolyline(cl, 'right', R);
    return {
      centreline: cl,
      leftPoly: left,
      rightPoly: right,
      walls: pieces(left, 'left', SEG_LEN).concat(pieces(right, 'right', SEG_LEN)),
      /* Floor and ceiling share the same plan; only the height differs. A
       * corridor is a closed tube, and without the lid everything above the
       * cornice is empty backdrop - which reads as a hole in the wall when
       * the camera is close to one, as it is through every corner. */
      floors: floors(runs, cl, R, SEG_LEN)
    };
  }

  global.SB = global.SB || {};
  global.SB.MAZE3D = { build: build, normal: normal, DIR4: DIR4 };
})(window);

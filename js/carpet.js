/* Wonky Boy - carpet.js
 * ---------------------------------------------------------------------------
 * The corridor runner: the deep patterned carpet of an expensive old hotel.
 *
 * It is laid OVER the floorboards rather than replacing them, with a margin of
 * bare board showing either side. That is how these corridors are actually
 * done, and it also keeps the boards doing their job as a depth cue right at
 * the edges of the frame.
 *
 * The pattern is built in layers, from the ground up:
 *   1. field        the deep base colour
 *   2. guard stripes  two pairs of lengthwise lines defining the runner edge
 *   3. medallions   a large central motif repeating down the corridor
 *   4. corner sprigs smaller motifs flanking it, on the off-beat
 *   5. pile sheen   a soft lengthwise highlight, so it reads as fabric
 *
 * Everything is drawn per SLICE, between the near and far edge of one segment,
 * so the whole pattern foreshortens with the corridor instead of sliding about
 * on the screen. Motifs are lozenges rather than circles because a circle
 * lying on the floor is an ellipse in perspective, and a lozenge sells that
 * more cheaply and more legibly at small sizes.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  /* Deep hotel reds and golds, with a navy alternative. */
  var PALETTE = {
    field: [348, 42, 21],
    fieldAlt: [348, 42, 18],
    border: [40, 44, 30],
    guard: [42, 58, 46],
    motif: [40, 52, 40],
    motifCore: [44, 62, 55],
    sprig: [180, 20, 32],
    sheen: [44, 40, 60]
  };

  function hsl(c, a, dl) {
    return 'hsla(' + c[0] + ',' + c[1] + '%,' +
      Math.max(0, Math.min(100, c[2] + (dl || 0))) + '%,' + (a === undefined ? 1 : a) + ')';
  }

  /* A quad spanning the corridor between two lateral fractions, near to far.
   * p runs -1 (left wall) to +1 (right wall). */
  function band(g, nr, f, p0, p1, fill) {
    var nL = nr.L.x, nR = nr.R.x, fL = f.L.x, fR = f.R.x;
    var nx0 = nL + (nR - nL) * (p0 + 1) / 2;
    var nx1 = nL + (nR - nL) * (p1 + 1) / 2;
    var fx0 = fL + (fR - fL) * (p0 + 1) / 2;
    var fx1 = fL + (fR - fL) * (p1 + 1) / 2;
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(nx0, nr.ys.floor);
    g.lineTo(nx1, nr.ys.floor);
    g.lineTo(fx1, f.ys.floor);
    g.lineTo(fx0, f.ys.floor);
    g.closePath();
    g.fill();
  }

  /* A lozenge lying flat on the floor, centred on lateral fraction p, spanning
   * this slice from near to far. */
  function lozenge(g, nr, f, p, halfW, fill, inset) {
    var nL = nr.L.x, nR = nr.R.x, fL = f.L.x, fR = f.R.x;
    var nc = nL + (nR - nL) * (p + 1) / 2;
    var fc = fL + (fR - fL) * (p + 1) / 2;
    var nw = (nR - nL) * halfW / 2;
    var fw = (fR - fL) * halfW / 2;
    var ny = nr.ys.floor, fy = f.ys.floor;
    var my = (ny + fy) / 2, mc = (nc + fc) / 2, mw = (nw + fw) / 2;
    var k = inset || 0;

    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(nc, ny - (ny - fy) * k);
    g.lineTo(mc + mw, my);
    g.lineTo(fc, fy + (ny - fy) * k);
    g.lineTo(mc - mw, my);
    g.closePath();
    g.fill();
  }

  /* Draw the runner across one corridor slice.
   * idx is the segment index, which drives the repeat. */
  function draw(g, nr, f, fog, idx) {
    var beat = ((idx % 4) + 4) % 4;

    /* 1. field, alternating very slightly so the repeat is visible */
    band(g, nr, f, -0.78, 0.78, hsl(beat < 2 ? PALETTE.field : PALETTE.fieldAlt, fog));

    /* 2. guard stripes: a wide border band, then a fine gold line inside it */
    band(g, nr, f, -0.78, -0.64, hsl(PALETTE.border, fog));
    band(g, nr, f, 0.64, 0.78, hsl(PALETTE.border, fog));
    band(g, nr, f, -0.60, -0.575, hsl(PALETTE.guard, 0.85 * fog));
    band(g, nr, f, 0.575, 0.60, hsl(PALETTE.guard, 0.85 * fog));

    /* Only the near half of the corridor is worth detailing; beyond that the
     * slices are a couple of pixels deep and the motifs turn to noise. */
    var slice = Math.abs(nr.ys.floor - f.ys.floor);
    if (slice < 2.5) return;

    /* 3. central medallion, every fourth segment */
    if (beat === 0) {
      lozenge(g, nr, f, 0, 0.62, hsl(PALETTE.motif, 0.55 * fog));
      lozenge(g, nr, f, 0, 0.40, hsl(PALETTE.motif, 0.75 * fog, 6));
      lozenge(g, nr, f, 0, 0.18, hsl(PALETTE.motifCore, 0.9 * fog));
    }

    /* 4. flanking sprigs on the off-beat, so the eye reads a repeat rather
     *    than a row of identical blobs */
    if (beat === 2) {
      lozenge(g, nr, f, -0.36, 0.24, hsl(PALETTE.sprig, 0.5 * fog));
      lozenge(g, nr, f, 0.36, 0.24, hsl(PALETTE.sprig, 0.5 * fog));
      lozenge(g, nr, f, 0, 0.16, hsl(PALETTE.motif, 0.5 * fog));
    }

    /* small linking diamonds on every segment, tying the repeats together */
    lozenge(g, nr, f, -0.5, 0.10, hsl(PALETTE.guard, 0.30 * fog));
    lozenge(g, nr, f, 0.5, 0.10, hsl(PALETTE.guard, 0.30 * fog));

    /* 5. pile sheen down the centre - the giveaway that it is fabric */
    band(g, nr, f, -0.16, 0.16, hsl(PALETTE.sheen, 0.05 * fog));
  }

  global.SB = global.SB || {};
  global.SB.CARPET = { draw: draw, PALETTE: PALETTE };
})(window);

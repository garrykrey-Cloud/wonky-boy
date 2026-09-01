/* Wonky Boy - paintings.js
 * ---------------------------------------------------------------------------
 * The picture gallery on the corridor walls.
 *
 * A house like this would not hang the same face forty times, so the subject,
 * the frame, the proportions and how badly it hangs are all derived from the
 * feature's phase. A given painting is therefore identical every time you pass
 * it, while the corridor as a whole is full of different ones.
 *
 * Crookedness is done by giving the near edge and the far edge different top
 * and bottom fractions. The wall slice is already a perspective trapezoid, so
 * that tilts the picture ON THE WALL rather than rotating a rectangle on the
 * screen, which would just look wrong.
 *
 * Called with the same signature as the other wall dressing in haunted.js:
 *   (g, nx, fx, nY, fY, fog, t, phase, side)
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  function lerp(a, b, p) { return a + (b - a) * p; }

  function hsl(c, a, dl) {
    return 'hsla(' + c[0] + ',' + c[1] + '%,' +
      Math.max(0, Math.min(100, c[2] + (dl || 0))) + '%,' + (a === undefined ? 1 : a) + ')';
  }

  function quad(g, pts, fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fill();
  }

  var GILT = [44, 70, 58];
  var CANDLE = [40, 96, 64];

  var FRAMES = [
    { col: GILT, dl: -14, thick: 0.14 },        // ornate gilt
    { col: [28, 34, 22], dl: 0, thick: 0.11 },  // dark wood
    { col: [40, 12, 44], dl: -6, thick: 0.10 }, // tarnished silver
    { col: GILT, dl: -24, thick: 0.18 }         // heavy, very old gilt
  ];

  function painting(g, nx, fx, nY, fY, fog, t, phase) {
    var pick = Math.floor(phase * 997);
    var subject = pick % 7;
    var frame = FRAMES[(pick >> 3) % FRAMES.length];
    var tilt = (((pick >> 5) % 5) - 2) * 0.018;   // a few of them hang badly

    /* tall portrait, wide landscape, or a small square */
    var shape = (pick >> 7) % 3;
    var top = shape === 0 ? 0.12 : (shape === 1 ? 0.30 : 0.26);
    var bot = shape === 0 ? 0.88 : (shape === 1 ? 0.72 : 0.66);

    var topN = lerp(nY.rail, nY.cornice, top + tilt);
    var botN = lerp(nY.rail, nY.cornice, bot + tilt);
    var topF = lerp(fY.rail, fY.cornice, top - tilt);
    var botF = lerp(fY.rail, fY.cornice, bot - tilt);

    quad(g, [nx, topN, fx, topF, fx, botF, nx, botN], hsl(frame.col, fog, frame.dl));

    var iT = frame.thick;
    var inTopN = lerp(topN, botN, iT), inBotN = lerp(topN, botN, 1 - iT);
    var inTopF = lerp(topF, botF, iT), inBotF = lerp(topF, botF, 1 - iT);
    var mx = lerp(nx, fx, iT);

    quad(g, [mx, inTopN, fx, inTopF, fx, inBotF, mx, inBotN], hsl([22, 26, 10], fog));

    var cxp = lerp(nx, fx, 0.55);
    var cyp = (inTopN + inBotN + inTopF + inBotF) / 4;
    var w = Math.abs(nx - fx);
    var r = w * 0.5;
    var hgt = Math.abs(inBotN - inTopN);
    if (r < 2.5 || hgt < 5) return;

    g.save();
    g.globalAlpha = fog;

    if (subject === 0 || subject === 6) {
      /* an ancestor, or two of them staring out together */
      var faces = subject === 6 ? [-0.26, 0.26] : [0];
      for (var fi = 0; fi < faces.length; fi++) {
        var ox = cxp + faces[fi] * r;
        var fr = r * (subject === 6 ? 0.30 : 0.44);
        g.fillStyle = hsl([250, 16, 18], 0.9);
        g.beginPath();
        g.ellipse(ox, cyp + hgt * 0.30, fr * 1.5, hgt * 0.22, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = hsl([34, 24, 60], 0.85);
        g.beginPath();
        g.ellipse(ox, cyp - hgt * 0.06, fr, fr * 1.28, 0, 0, Math.PI * 2);
        g.fill();
        /* eyes that never quite look away */
        var look = Math.sin(t * 0.7 + phase + fi) * fr * 0.14;
        g.fillStyle = 'rgba(8,6,14,0.92)';
        g.beginPath(); g.ellipse(ox - fr * 0.36 + look, cyp - hgt * 0.10, fr * 0.15, fr * 0.19, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(ox + fr * 0.36 + look, cyp - hgt * 0.10, fr * 0.15, fr * 0.19, 0, 0, Math.PI * 2); g.fill();
      }

    } else if (subject === 1) {
      /* landscape: sky, hills, a small cold moon */
      g.fillStyle = hsl([214, 26, 30], 0.9);
      g.fillRect(cxp - r * 0.8, cyp - hgt * 0.38, r * 1.6, hgt * 0.44);
      g.fillStyle = hsl([44, 30, 78], 0.85);
      g.beginPath(); g.arc(cxp + r * 0.4, cyp - hgt * 0.24, r * 0.14, 0, Math.PI * 2); g.fill();
      g.fillStyle = hsl([120, 16, 18], 0.95);
      g.beginPath();
      g.moveTo(cxp - r * 0.8, cyp + hgt * 0.34);
      g.lineTo(cxp - r * 0.2, cyp - hgt * 0.04);
      g.lineTo(cxp + r * 0.3, cyp + hgt * 0.20);
      g.lineTo(cxp + r * 0.8, cyp - hgt * 0.10);
      g.lineTo(cxp + r * 0.8, cyp + hgt * 0.34);
      g.closePath(); g.fill();

    } else if (subject === 2) {
      /* seascape: dark water, a moon streak, a ship in trouble */
      g.fillStyle = hsl([210, 30, 22], 0.95);
      g.fillRect(cxp - r * 0.8, cyp - hgt * 0.06, r * 1.6, hgt * 0.42);
      g.fillStyle = hsl([220, 20, 34], 0.9);
      g.fillRect(cxp - r * 0.8, cyp - hgt * 0.38, r * 1.6, hgt * 0.32);
      g.strokeStyle = hsl([44, 40, 72], 0.5);
      g.lineWidth = Math.max(0.5, r * 0.06);
      g.beginPath(); g.moveTo(cxp + r * 0.2, cyp - hgt * 0.04); g.lineTo(cxp + r * 0.2, cyp + hgt * 0.3); g.stroke();
      g.strokeStyle = 'rgba(10,8,16,0.95)';
      g.lineWidth = Math.max(0.6, r * 0.07);
      g.beginPath();
      g.moveTo(cxp - r * 0.3, cyp + hgt * 0.02);
      g.lineTo(cxp - r * 0.05, cyp + hgt * 0.02);
      g.moveTo(cxp - r * 0.18, cyp + hgt * 0.02);
      g.lineTo(cxp - r * 0.24, cyp - hgt * 0.2);
      g.stroke();

    } else if (subject === 3) {
      /* still life, with the obligatory memento mori */
      g.fillStyle = hsl([28, 30, 18], 0.95);
      g.fillRect(cxp - r * 0.8, cyp + hgt * 0.16, r * 1.6, hgt * 0.16);
      g.fillStyle = hsl([352, 44, 32], 0.95);
      g.beginPath(); g.arc(cxp - r * 0.32, cyp + hgt * 0.06, r * 0.16, 0, Math.PI * 2); g.fill();
      g.fillStyle = hsl([40, 44, 34], 0.95);
      g.beginPath(); g.arc(cxp - r * 0.02, cyp + hgt * 0.10, r * 0.12, 0, Math.PI * 2); g.fill();
      g.fillStyle = hsl([44, 14, 62], 0.9);
      g.beginPath(); g.ellipse(cxp + r * 0.36, cyp + hgt * 0.02, r * 0.2, r * 0.22, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(10,8,16,0.9)';
      g.beginPath(); g.arc(cxp + r * 0.29, cyp - hgt * 0.01, r * 0.06, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(cxp + r * 0.43, cyp - hgt * 0.01, r * 0.06, 0, Math.PI * 2); g.fill();

    } else if (subject === 4) {
      /* a stag, mostly antler */
      g.strokeStyle = hsl([30, 30, 26], 0.95);
      g.lineWidth = Math.max(0.6, r * 0.09);
      g.beginPath();
      g.moveTo(cxp, cyp + hgt * 0.3);
      g.lineTo(cxp, cyp - hgt * 0.04);
      for (var a = -1; a <= 1; a += 2) {
        g.moveTo(cxp, cyp - hgt * 0.04);
        g.lineTo(cxp + a * r * 0.42, cyp - hgt * 0.26);
        g.moveTo(cxp + a * r * 0.2, cyp - hgt * 0.14);
        g.lineTo(cxp + a * r * 0.34, cyp - hgt * 0.32);
      }
      g.stroke();
      g.fillStyle = hsl([28, 26, 20], 0.95);
      g.beginPath(); g.ellipse(cxp, cyp + hgt * 0.06, r * 0.16, hgt * 0.16, 0, 0, Math.PI * 2); g.fill();

    } else {
      /* subject 5: an empty canvas, which is somehow the worst of them */
      g.fillStyle = hsl([26, 18, 14], 0.7);
      g.fillRect(cxp - r * 0.8, cyp - hgt * 0.36, r * 1.6, hgt * 0.72);
    }

    g.restore();

    /* a gilt picture light over roughly a third of them */
    if (w > 9 && (pick >> 9) % 3 === 0) {
      g.fillStyle = hsl(GILT, 0.85 * fog, -6);
      g.fillRect(lerp(nx, fx, 0.3), lerp(topN, topF, 0.3) - Math.max(1, w * 0.16),
        w * 0.4, Math.max(1, w * 0.12));
      var lgy = lerp(topN, topF, 0.4);
      var lg = g.createRadialGradient(cxp, lgy, 0, cxp, lgy, r * 2);
      lg.addColorStop(0, hsl(CANDLE, 0.22 * fog));
      lg.addColorStop(1, hsl(CANDLE, 0));
      g.fillStyle = lg;
      g.beginPath(); g.arc(cxp, lgy, r * 2, 0, Math.PI * 2); g.fill();
    }
  }

  global.SB = global.SB || {};
  global.SB.PAINTINGS = { painting: painting, FRAMES: FRAMES };
})(window);

/* Wonky Boy - furniture.js
 * ---------------------------------------------------------------------------
 * The contents of the haunted house: armour standing sentry, bookcases,
 * console tables, high-backed chairs, longcase clocks, fireplaces, draped
 * windows and a chandelier or two.
 *
 * These stand on the FLOOR against a wall, unlike the flat dressing in
 * haunted.js which is painted on the wall itself. Each is handed the
 * projected wall line for its segment plus the two constants that convert a
 * world height into a screen y, so a bookcase is genuinely taller than a
 * chair and everything shrinks correctly as the corridor recedes.
 *
 * ctx = {
 *   nx, fx      wall line x at the near and far edge of this segment
 *   nF, fF      frames, carrying yA/yB for height projection
 *   nw          corridor half-width in pixels at the near edge
 *   fog         0..1 distance fade
 *   t, phase    clock, and a per-item offset so they are not in lockstep
 *   inward      +1 or -1: screen direction from this wall toward the middle
 * }
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  /* Screen y for a world height on a given frame. */
  function yy(F, h) { return F.yA - F.yB * h; }

  function hsl(h, s, l, a) {
    return 'hsla(' + h + ',' + s + '%,' + l + '%,' + (a === undefined ? 1 : a) + ')';
  }

  /* A box standing against the wall: front face plus a shaded side face, which
   * is what stops everything looking like flat cardboard. */
  function box(g, ctx, hBottom, hTop, depthFrac, widthFrac, front, sideCol) {
    var nx = ctx.nx, fx = ctx.fx, inward = ctx.inward;
    var wpx = ctx.nw * widthFrac;

    var x0 = nx;                       // against the wall
    var x1 = nx + inward * wpx;        // inner edge, toward the corridor middle
    var xf0 = fx;
    var xf1 = fx + inward * wpx * (ctx.fF.yB / ctx.nF.yB);

    var nTop = yy(ctx.nF, hTop), nBot = yy(ctx.nF, hBottom);
    var fTop = yy(ctx.fF, hTop), fBot = yy(ctx.fF, hBottom);

    /* side face, receding down the corridor */
    if (sideCol) {
      g.fillStyle = sideCol;
      g.beginPath();
      g.moveTo(x1, nTop); g.lineTo(xf1, fTop); g.lineTo(xf1, fBot); g.lineTo(x1, nBot);
      g.closePath(); g.fill();
    }

    /* front face, facing across the corridor */
    g.fillStyle = front;
    g.beginPath();
    g.moveTo(x0, nTop); g.lineTo(x1, nTop); g.lineTo(x1, nBot); g.lineTo(x0, nBot);
    g.closePath(); g.fill();

    return { x0: x0, x1: x1, nTop: nTop, nBot: nBot, w: Math.abs(x1 - x0) };
  }

  /* ------------------------------------------------------------- pieces */

  function armour(g, ctx) {
    var f = ctx.fog, inward = ctx.inward;
    var b = box(g, ctx, 0, 60, 0.2, 0.46, hsl(24, 30, 14, f), hsl(24, 30, 10, f));
    var w = b.w;
    if (w < 3) return;
    var cx = b.x0 + inward * w * 0.5;
    var steel = hsl(212, 14, 58, f);
    var steelDark = hsl(212, 16, 38, f);
    var gilt = hsl(44, 66, 52, f);

    var yTop = function (h) { return yy(ctx.nF, h); };

    /* legs */
    g.strokeStyle = steelDark;
    g.lineWidth = Math.max(1, w * 0.16);
    g.beginPath();
    g.moveTo(cx - w * 0.16, yTop(60)); g.lineTo(cx - w * 0.16, yTop(430));
    g.moveTo(cx + w * 0.16, yTop(60)); g.lineTo(cx + w * 0.16, yTop(430));
    g.stroke();

    /* breastplate */
    g.fillStyle = steel;
    g.beginPath();
    g.moveTo(cx - w * 0.34, yTop(430));
    g.lineTo(cx + w * 0.34, yTop(430));
    g.lineTo(cx + w * 0.26, yTop(760));
    g.lineTo(cx - w * 0.26, yTop(760));
    g.closePath();
    g.fill();

    /* pauldrons */
    g.fillStyle = steelDark;
    g.beginPath(); g.ellipse(cx - w * 0.34, yTop(745), w * 0.17, w * 0.12, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + w * 0.34, yTop(745), w * 0.17, w * 0.12, 0, 0, Math.PI * 2); g.fill();

    /* helm, with a dark slit where a face should be */
    g.fillStyle = steel;
    g.beginPath();
    g.ellipse(cx, yTop(870), w * 0.21, w * 0.27, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(4,4,10,' + (0.92 * f) + ')';
    g.fillRect(cx - w * 0.16, yTop(890), w * 0.32, Math.max(1, w * 0.09));

    /* plume */
    g.strokeStyle = hsl(352, 52, 40, f);
    g.lineWidth = Math.max(1, w * 0.12);
    g.beginPath();
    g.moveTo(cx, yTop(960)); g.lineTo(cx + inward * w * 0.18, yTop(1040));
    g.stroke();

    /* halberd, planted on the floor */
    g.strokeStyle = hsl(26, 40, 26, f);
    g.lineWidth = Math.max(0.8, w * 0.07);
    g.beginPath();
    g.moveTo(cx + inward * w * 0.55, yTop(0));
    g.lineTo(cx + inward * w * 0.55, yTop(1120));
    g.stroke();
    g.fillStyle = gilt;
    g.beginPath();
    g.moveTo(cx + inward * w * 0.55, yTop(1220));
    g.lineTo(cx + inward * w * 0.80, yTop(1090));
    g.lineTo(cx + inward * w * 0.55, yTop(1060));
    g.closePath();
    g.fill();
  }

  function bookcase(g, ctx) {
    var f = ctx.fog, inward = ctx.inward;
    var b = box(g, ctx, 0, 1180, 0.24, 0.58, hsl(24, 38, 17, f), hsl(24, 38, 11, f));
    var w = b.w;
    if (w < 3) return;

    /* shelves and their books */
    var shelves = 5;
    for (var s = 0; s < shelves; s++) {
      var hA = 90 + s * 210, hB = hA + 165;
      var yA = yy(ctx.nF, hA), yB = yy(ctx.nF, hB);
      /* shelf recess */
      g.fillStyle = hsl(22, 34, 8, f);
      g.fillRect(Math.min(b.x0, b.x1) + w * 0.08, yB, w * 0.84, Math.max(1, yA - yB));
      /* spines */
      var n = 7;
      for (var k = 0; k < n; k++) {
        var bw = w * 0.84 / n;
        var bx = Math.min(b.x0, b.x1) + w * 0.08 + k * bw;
        var hue = [352, 32, 96, 210, 268, 18, 44][(k + s * 3) % 7];
        var lean = (k === n - 2) ? Math.max(1, bw * 0.5) : 0;
        g.fillStyle = hsl(hue, 34, 30 + ((k * 7 + s * 11) % 12), f);
        g.fillRect(bx + lean * 0.5, yB + (yA - yB) * 0.12, Math.max(0.6, bw * 0.82), (yA - yB) * 0.88);
      }
      /* shelf board */
      g.fillStyle = hsl(26, 40, 22, f);
      g.fillRect(Math.min(b.x0, b.x1) + w * 0.05, yA - Math.max(1, w * 0.05), w * 0.9, Math.max(1, w * 0.05));
    }
    /* cornice on top */
    g.fillStyle = hsl(28, 42, 26, f);
    g.fillRect(Math.min(b.x0, b.x1) - w * 0.04, yy(ctx.nF, 1180), w * 1.08, Math.max(1, w * 0.10));
  }

  function table(g, ctx) {
    var f = ctx.fog, inward = ctx.inward;
    var w = ctx.nw * 0.56;
    var x0 = ctx.nx, x1 = ctx.nx + inward * w;
    var yTop = yy(ctx.nF, 430), yFloor = yy(ctx.nF, 0);
    if (Math.abs(w) < 3) return;

    /* legs, turned and tapering */
    g.strokeStyle = hsl(24, 42, 18, f);
    g.lineWidth = Math.max(1, Math.abs(w) * 0.09);
    g.beginPath();
    g.moveTo(x0 + inward * w * 0.12, yTop); g.lineTo(x0 + inward * w * 0.16, yFloor);
    g.moveTo(x1 - inward * w * 0.12, yTop); g.lineTo(x1 - inward * w * 0.16, yFloor);
    g.stroke();

    /* top */
    g.fillStyle = hsl(26, 44, 24, f);
    g.beginPath();
    g.moveTo(x0, yTop);
    g.lineTo(x1, yTop);
    g.lineTo(x1, yTop + Math.max(1, Math.abs(w) * 0.10));
    g.lineTo(x0, yTop + Math.max(1, Math.abs(w) * 0.10));
    g.closePath();
    g.fill();

    /* candelabra on top, three flames */
    var cx = x0 + inward * w * 0.5;
    var base = yTop;
    g.strokeStyle = hsl(44, 60, 44, f);
    g.lineWidth = Math.max(0.7, Math.abs(w) * 0.05);
    g.beginPath();
    g.moveTo(cx, base); g.lineTo(cx, yy(ctx.nF, 620));
    g.stroke();
    for (var c = -1; c <= 1; c++) {
      var fx2 = cx + c * Math.abs(w) * 0.20;
      var fy2 = yy(ctx.nF, 620 + (c === 0 ? 60 : 0));
      var flick = 0.7 + Math.sin(ctx.t * 12 + ctx.phase + c) * 0.3;
      var grd = g.createRadialGradient(fx2, fy2, 0, fx2, fy2, Math.abs(w) * 0.9);
      grd.addColorStop(0, hsl(40, 96, 66, 0.5 * f));
      grd.addColorStop(1, hsl(40, 96, 66, 0));
      g.fillStyle = grd;
      g.beginPath(); g.arc(fx2, fy2, Math.abs(w) * 0.9, 0, Math.PI * 2); g.fill();
      g.fillStyle = hsl(44, 98, 72, f);
      g.beginPath();
      g.ellipse(fx2, fy2, Math.max(0.5, Math.abs(w) * 0.05), Math.max(1, Math.abs(w) * 0.13 * flick), 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  function chair(g, ctx) {
    var f = ctx.fog, inward = ctx.inward;
    var w = ctx.nw * 0.42;
    if (Math.abs(w) < 3) return;
    var x0 = ctx.nx + inward * w * 0.15;
    var x1 = x0 + inward * w;
    var ySeat = yy(ctx.nF, 300), yFloor = yy(ctx.nF, 0), yBack = yy(ctx.nF, 780);

    g.strokeStyle = hsl(24, 44, 17, f);
    g.lineWidth = Math.max(0.8, Math.abs(w) * 0.10);
    /* legs */
    g.beginPath();
    g.moveTo(x0, ySeat); g.lineTo(x0, yFloor);
    g.moveTo(x1, ySeat); g.lineTo(x1, yFloor);
    g.stroke();
    /* high back */
    g.beginPath();
    g.moveTo(x0, ySeat); g.lineTo(x0, yBack);
    g.moveTo(x1, ySeat); g.lineTo(x1, yBack);
    g.stroke();
    /* seat */
    g.fillStyle = hsl(352, 34, 26, f);
    g.fillRect(Math.min(x0, x1), ySeat - Math.max(1, Math.abs(w) * 0.10), Math.abs(w), Math.max(1, Math.abs(w) * 0.14));
    /* upholstered back panel */
    g.fillStyle = hsl(352, 32, 22, f);
    g.fillRect(Math.min(x0, x1), yBack, Math.abs(w), Math.max(1, ySeat - yBack) * 0.62);
  }

  function clock(g, ctx) {
    var f = ctx.fog, inward = ctx.inward;
    var b = box(g, ctx, 0, 1330, 0.18, 0.40, hsl(22, 44, 19, f), hsl(22, 44, 12, f));
    var w = b.w;
    if (w < 3) return;
    var cx = b.x0 + inward * w * 0.5;

    /* face */
    g.fillStyle = hsl(44, 30, 78, f);
    g.beginPath();
    g.arc(cx, yy(ctx.nF, 1140), w * 0.34, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = hsl(24, 40, 12, f);
    g.lineWidth = Math.max(0.6, w * 0.05);
    /* hands, stopped at some unhelpful hour */
    var cy2 = yy(ctx.nF, 1140);
    g.beginPath();
    g.moveTo(cx, cy2); g.lineTo(cx + w * 0.20, cy2 - w * 0.10);
    g.moveTo(cx, cy2); g.lineTo(cx - w * 0.06, cy2 - w * 0.24);
    g.stroke();

    /* pendulum, swinging behind the glass */
    var sw = Math.sin(ctx.t * 1.8 + ctx.phase) * w * 0.22;
    g.strokeStyle = hsl(44, 56, 44, f);
    g.lineWidth = Math.max(0.5, w * 0.04);
    g.beginPath();
    g.moveTo(cx, yy(ctx.nF, 900));
    g.lineTo(cx + sw, yy(ctx.nF, 430));
    g.stroke();
    g.fillStyle = hsl(44, 62, 50, f);
    g.beginPath();
    g.arc(cx + sw, yy(ctx.nF, 430), w * 0.12, 0, Math.PI * 2);
    g.fill();
  }

  function fireplace(g, ctx) {
    var f = ctx.fog, inward = ctx.inward;
    var b = box(g, ctx, 0, 820, 0.1, 0.66, hsl(28, 14, 30, f), hsl(28, 14, 20, f));
    var w = b.w;
    if (w < 3) return;
    var left = Math.min(b.x0, b.x1);

    /* the opening */
    g.fillStyle = 'rgba(6,4,8,' + (0.95 * f) + ')';
    g.fillRect(left + w * 0.18, yy(ctx.nF, 560), w * 0.64, Math.max(1, yy(ctx.nF, 0) - yy(ctx.nF, 560)));

    /* embers, breathing */
    var glow = 0.55 + Math.sin(ctx.t * 2.2 + ctx.phase) * 0.25;
    var gx = left + w * 0.5, gy = yy(ctx.nF, 90);
    var grd = g.createRadialGradient(gx, gy, 0, gx, gy, w * 1.1);
    grd.addColorStop(0, hsl(22, 96, 56, 0.75 * glow * f));
    grd.addColorStop(0.5, hsl(14, 92, 44, 0.28 * glow * f));
    grd.addColorStop(1, hsl(14, 90, 40, 0));
    g.fillStyle = grd;
    g.beginPath(); g.arc(gx, gy, w * 1.1, 0, Math.PI * 2); g.fill();

    /* mantelpiece */
    g.fillStyle = hsl(30, 16, 38, f);
    g.fillRect(left - w * 0.06, yy(ctx.nF, 820), w * 1.12, Math.max(1, w * 0.10));
  }

  function drapedWindow(g, ctx) {
    var f = ctx.fog, inward = ctx.inward;
    var nx = ctx.nx, fx = ctx.fx;
    var top = yy(ctx.nF, 1180), bot = yy(ctx.nF, 260);
    var topF = yy(ctx.fF, 1180), botF = yy(ctx.fF, 260);

    /* moonlight through the glass */
    g.fillStyle = hsl(210, 34, 46, 0.62 * f);
    g.beginPath();
    g.moveTo(nx, top); g.lineTo(fx, topF); g.lineTo(fx, botF); g.lineTo(nx, bot);
    g.closePath(); g.fill();

    var w = Math.abs(nx - fx);
    if (w < 3) return;

    /* glazing bars */
    g.strokeStyle = hsl(26, 30, 14, 0.9 * f);
    g.lineWidth = Math.max(0.6, w * 0.06);
    g.beginPath();
    g.moveTo(nx, (top + bot) / 2); g.lineTo(fx, (topF + botF) / 2);
    g.stroke();

    /* heavy drapes, gathered at each side with a pelmet across the top */
    var drape = hsl(352, 40, 24, f);
    var drapeDark = hsl(352, 42, 16, f);
    g.fillStyle = drape;
    g.beginPath();
    g.moveTo(nx, top);
    g.lineTo(nx + inward * ctx.nw * 0.10, top);
    g.lineTo(nx + inward * ctx.nw * 0.06, bot);
    g.lineTo(nx, bot);
    g.closePath(); g.fill();

    g.fillStyle = drapeDark;
    g.beginPath();
    g.moveTo(fx, topF);
    g.lineTo(fx + inward * ctx.nw * 0.07, topF);
    g.lineTo(fx + inward * ctx.nw * 0.04, botF);
    g.lineTo(fx, botF);
    g.closePath(); g.fill();

    /* pelmet */
    g.fillStyle = hsl(352, 44, 28, f);
    g.beginPath();
    g.moveTo(nx, top); g.lineTo(fx, topF);
    g.lineTo(fx, topF + Math.max(1, w * 0.5)); g.lineTo(nx, top + Math.max(1, w * 0.6));
    g.closePath(); g.fill();
  }

  /* Hangs from the ceiling in the middle of the corridor, not on a wall. */
  function chandelier(g, ctx) {
    var f = ctx.fog;
    var cx = ctx.centreX;
    var w = ctx.nw * 0.46;
    if (w < 3) return;
    var yHang = yy(ctx.nF, 1430), yBody = yy(ctx.nF, 1130);

    g.strokeStyle = hsl(40, 40, 34, f);
    g.lineWidth = Math.max(0.6, w * 0.04);
    g.beginPath();
    g.moveTo(cx, yHang); g.lineTo(cx, yBody);
    g.stroke();

    /* tiers of arms with candles */
    for (var tier = 0; tier < 2; tier++) {
      var r = w * (0.62 - tier * 0.22);
      var ty = yy(ctx.nF, 1130 - tier * 110);
      g.strokeStyle = hsl(42, 56, 44, f);
      g.lineWidth = Math.max(0.5, w * 0.035);
      g.beginPath();
      g.ellipse(cx, ty, r, r * 0.26, 0, 0, Math.PI * 2);
      g.stroke();
      for (var k = 0; k < 6; k++) {
        var a = (k / 6) * Math.PI * 2 + tier * 0.5;
        var px = cx + Math.cos(a) * r;
        var py = ty + Math.sin(a) * r * 0.26;
        var flick = 0.7 + Math.sin(ctx.t * 10 + k + ctx.phase) * 0.3;
        var grd = g.createRadialGradient(px, py, 0, px, py, w * 0.5);
        grd.addColorStop(0, hsl(40, 96, 68, 0.55 * f));
        grd.addColorStop(1, hsl(40, 96, 68, 0));
        g.fillStyle = grd;
        g.beginPath(); g.arc(px, py, w * 0.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = hsl(44, 98, 74, f);
        g.beginPath();
        g.ellipse(px, py - w * 0.05, Math.max(0.5, w * 0.035), Math.max(1, w * 0.10 * flick), 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  global.SB = global.SB || {};
  global.SB.FURNITURE = {
    yy: yy,
    PIECES: {
      armour: armour,
      bookcase: bookcase,
      table: table,
      chair: chair,
      clock: clock,
      fireplace: fireplace,
      drapedWindow: drapedWindow,
      chandelier: chandelier
    },
    /* Chandeliers hang in the middle, everything else stands against a wall. */
    CENTRE_PIECES: { chandelier: 1 },
    BAG: [
      'armour', 'armour',
      'bookcase', 'bookcase',
      'table', 'table',
      'chair', 'chair',
      'drapedWindow', 'drapedWindow',
      'clock',
      'fireplace',
      'chandelier'
    ]
  };
})(window);

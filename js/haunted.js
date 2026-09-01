/* Wonky Boy - haunted.js
 * ---------------------------------------------------------------------------
 * The fittings that dress the splash corridor as the inside of a decaying
 * 18th century house: panelling, peeling wallpaper, portraits whose eyes
 * follow you, guttering candle sconces, boarded windows, cobwebs.
 *
 * Everything here draws in SCREEN space, but is handed the projected corners
 * of the wall slice it belongs to, so it foreshortens correctly as the
 * corridor recedes. A feature spans one segment, which gives each piece a
 * proper trapezoid rather than a flat sticker pasted on the wall.
 *
 * Colour is deliberately warm and dirty - candle amber, tarnished gilt, faded
 * crimson damask, old oak. That is partly period accuracy and partly so the
 * light-blue hazard signature stays the one cool thing in the frame and keeps
 * reading as "danger".
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  /* Heights in world units, measured up the wall from the floor. */
  var H_SKIRT = 150;
  var H_DADO = 560;
  var H_RAIL = 640;
  var H_CORNICE = 1900;

  var PALETTE = {
    floor: [26, 32, 22],
    floorAlt: [26, 30, 18],
    joint: [24, 34, 11],
    skirt: [28, 32, 21],
    panel: [26, 36, 28],
    panelAlt: [26, 36, 24],
    rail: [34, 46, 40],
    paper: [352, 30, 31],
    paperAlt: [352, 28, 27],
    cornice: [34, 30, 35],
    gilt: [44, 70, 58],
    candle: [40, 96, 64]
  };

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

  /* ------------------------------------------------------- wall dressing */

  /* Draw one wall slice, from near frame to far frame, on one side.
   * ys are objects of projected screen y at each named height. */
  function wallSlice(g, nx, fx, nY, fY, fog, band, side, detail) {
    var shade = side === 'left' ? -4 : 2;      // one side catches more light
    var alt = band ? -2 : 0;

    /* wallpaper, above the dado */
    quad(g, [nx, nY.rail, fx, fY.rail, fx, fY.cornice, nx, nY.cornice],
      hsl(PALETTE.paper, fog, shade + alt));

    /* cornice band under the ceiling line */
    quad(g, [nx, nY.cornice, fx, fY.cornice, fx, fY.top, nx, nY.top],
      hsl(PALETTE.cornice, fog, shade));

    /* dado rail - the bright horizontal that reads as period joinery */
    quad(g, [nx, nY.dado, fx, fY.dado, fx, fY.rail, nx, nY.rail],
      hsl(PALETTE.rail, fog, shade + 4));

    /* panelling, below the dado */
    quad(g, [nx, nY.skirt, fx, fY.skirt, fx, fY.dado, nx, nY.dado],
      hsl(band ? PALETTE.panelAlt : PALETTE.panel, fog, shade));

    /* skirting board */
    quad(g, [nx, nY.floor, fx, fY.floor, fx, fY.skirt, nx, nY.skirt],
      hsl(PALETTE.skirt, fog, shade + 3));

    if (!detail) return;

    /* Panel stiles: the vertical joinery that makes it read as wainscot
     * rather than a painted stripe. */
    g.strokeStyle = hsl(PALETTE.panel, 0.85 * fog, -7);
    g.lineWidth = Math.max(0.6, Math.abs(nx - fx) * 0.06 + 1);
    g.beginPath();
    g.moveTo(nx, nY.skirt);
    g.lineTo(nx, nY.dado);
    g.stroke();

    /* a lighter bead along the top of the rail */
    g.strokeStyle = hsl(PALETTE.rail, 0.7 * fog, 12);
    g.lineWidth = Math.max(0.5, 1.2);
    g.beginPath();
    g.moveTo(nx, nY.dado);
    g.lineTo(fx, fY.dado);
    g.stroke();
  }

  /* ---------------------------------------------------------- features */

  /* Each takes the trapezoid of its wall slice and paints inside it. */

  function portrait(g, nx, fx, nY, fY, fog, t, phase) {
    var topN = lerp(nY.rail, nY.cornice, 0.16), botN = lerp(nY.rail, nY.cornice, 0.84);
    var topF = lerp(fY.rail, fY.cornice, 0.16), botF = lerp(fY.rail, fY.cornice, 0.84);

    /* gilt frame */
    quad(g, [nx, topN, fx, topF, fx, botF, nx, botN], hsl(PALETTE.gilt, fog, -14));
    var iN = 0.14, iF = 0.14;
    var inTopN = lerp(topN, botN, iN), inBotN = lerp(topN, botN, 1 - iN);
    var inTopF = lerp(topF, botF, iF), inBotF = lerp(topF, botF, 1 - iF);
    var mx = lerp(nx, fx, 0.16);
    quad(g, [mx, inTopN, fx, inTopF, fx, inBotF, mx, inBotN], hsl([20, 30, 9], fog));

    /* a pale face, and two eyes that never quite look away */
    var cxp = lerp(nx, fx, 0.5);
    var cyp = (inTopN + inBotN + inTopF + inBotF) / 4;
    var r = Math.abs(nx - fx) * 0.5;
    if (r < 2) return;
    g.fillStyle = hsl([34, 22, 62], 0.75 * fog);
    g.beginPath();
    g.ellipse(cxp, cyp - r * 0.15, r * 0.42, r * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(8,6,14,' + (0.9 * fog) + ')';
    var ew = r * 0.13;
    var look = Math.sin(t * 0.7 + phase) * r * 0.05;
    g.beginPath(); g.ellipse(cxp - r * 0.17 + look, cyp - r * 0.22, ew, ew * 1.2, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cxp + r * 0.17 + look, cyp - r * 0.22, ew, ew * 1.2, 0, 0, Math.PI * 2); g.fill();
  }

  function sconce(g, nx, fx, nY, fY, fog, t, phase) {
    var cxp = lerp(nx, fx, 0.5);
    var cyp = lerp(lerp(nY.rail, nY.cornice, 0.42), lerp(fY.rail, fY.cornice, 0.42), 0.5);
    var r = Math.abs(nx - fx) * 0.5;
    if (r < 2) return;

    /* bracket */
    g.strokeStyle = hsl(PALETTE.gilt, fog, -18);
    g.lineWidth = Math.max(1, r * 0.12);
    g.beginPath();
    g.moveTo(cxp, cyp + r * 0.5);
    g.lineTo(cxp, cyp - r * 0.1);
    g.stroke();

    /* candle */
    g.fillStyle = hsl([44, 30, 82], 0.9 * fog);
    g.fillRect(cxp - r * 0.09, cyp - r * 0.5, r * 0.18, r * 0.42);

    /* flame, guttering */
    var flick = 0.72 + Math.sin(t * 11 + phase) * 0.18 + Math.sin(t * 23 + phase) * 0.1;
    var fh = r * 0.34 * flick;
    var grd = g.createRadialGradient(cxp, cyp - r * 0.6, 0, cxp, cyp - r * 0.6, r * 2.4);
    grd.addColorStop(0, hsl(PALETTE.candle, 0.55 * fog, 8));
    grd.addColorStop(0.35, hsl(PALETTE.candle, 0.18 * fog));
    grd.addColorStop(1, hsl(PALETTE.candle, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cxp, cyp - r * 0.6, r * 2.4, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = hsl(PALETTE.candle, 0.95 * fog, 12);
    g.beginPath();
    g.ellipse(cxp, cyp - r * 0.62, r * 0.11, fh, 0, 0, Math.PI * 2);
    g.fill();
  }

  function doorway(g, nx, fx, nY, fY, fog) {
    var topN = lerp(nY.floor, nY.cornice, 0.86), topF = lerp(fY.floor, fY.cornice, 0.86);
    quad(g, [nx, topN, fx, topF, fx, fY.floor, nx, nY.floor], hsl([24, 36, 11], fog));
    /* frame */
    g.strokeStyle = hsl(PALETTE.rail, 0.9 * fog, 6);
    g.lineWidth = Math.max(1, Math.abs(nx - fx) * 0.07);
    g.beginPath();
    g.moveTo(nx, topN); g.lineTo(fx, topF);
    g.stroke();
    /* the thin sliver of something behind it */
    var r = Math.abs(nx - fx);
    if (r < 3) return;
    g.fillStyle = 'hsla(190,40%,60%,' + (0.10 * fog) + ')';
    g.fillRect(lerp(nx, fx, 0.42), lerp(topN, nY.floor, 0.1), r * 0.10, (nY.floor - topN) * 0.8);
  }

  function window_(g, nx, fx, nY, fY, fog, t, phase) {
    var topN = lerp(nY.rail, nY.cornice, 0.12), botN = lerp(nY.rail, nY.cornice, 0.9);
    var topF = lerp(fY.rail, fY.cornice, 0.12), botF = lerp(fY.rail, fY.cornice, 0.9);
    /* cold moonlight, the only cool colour the architecture is allowed */
    quad(g, [nx, topN, fx, topF, fx, botF, nx, botN], 'hsla(212,32%,42%,' + (0.55 * fog) + ')');
    var r = Math.abs(nx - fx);
    if (r < 3) return;
    /* muntin bars */
    g.strokeStyle = hsl([26, 30, 12], 0.9 * fog);
    g.lineWidth = Math.max(0.7, r * 0.05);
    g.beginPath();
    g.moveTo(lerp(nx, fx, 0.5), lerp(topN, topF, 0.5));
    g.lineTo(lerp(nx, fx, 0.5), lerp(botN, botF, 0.5));
    g.moveTo(nx, lerp(topN, botN, 0.5));
    g.lineTo(fx, lerp(topF, botF, 0.5));
    g.stroke();
    /* boards nailed across, at an angle */
    g.strokeStyle = hsl([26, 34, 22], 0.85 * fog);
    g.lineWidth = Math.max(1, r * 0.13);
    g.beginPath();
    g.moveTo(nx, lerp(topN, botN, 0.3 + Math.sin(phase) * 0.05));
    g.lineTo(fx, lerp(topF, botF, 0.62));
    g.stroke();
  }

  function cobweb(g, nx, fx, nY, fY, fog, side) {
    var r = Math.abs(nx - fx);
    if (r < 3) return;
    var cxp = nx, cyp = nY.cornice;
    var dir = side === 'left' ? 1 : -1;
    g.strokeStyle = 'hsla(210,12%,78%,' + (0.20 * fog) + ')';
    g.lineWidth = Math.max(0.4, r * 0.02);
    var R = r * 2.2;
    var a;
    for (a = 0; a <= 4; a++) {
      var ang = (a / 4) * (Math.PI / 2);
      g.beginPath();
      g.moveTo(cxp, cyp);
      g.lineTo(cxp + dir * Math.cos(ang) * R, cyp + Math.sin(ang) * R);
      g.stroke();
    }
    for (a = 1; a <= 3; a++) {
      var rr = R * (a / 3.4);
      g.beginPath();
      g.moveTo(cxp + dir * rr, cyp);
      g.quadraticCurveTo(cxp + dir * rr * 0.72, cyp + rr * 0.72, cxp, cyp + rr);
      g.stroke();
    }
  }

  function crack(g, nx, fx, nY, fY, fog, phase) {
    var r = Math.abs(nx - fx);
    if (r < 2) return;
    g.strokeStyle = 'hsla(20,20%,6%,' + (0.55 * fog) + ')';
    g.lineWidth = Math.max(0.5, r * 0.04);
    var x0 = lerp(nx, fx, 0.5);
    g.beginPath();
    g.moveTo(x0, nY.cornice);
    var steps = 5;
    for (var i = 1; i <= steps; i++) {
      var p = i / steps;
      var y = lerp(nY.cornice, nY.rail, p);
      g.lineTo(x0 + Math.sin(phase + i * 2.3) * r * 0.35, y);
    }
    g.stroke();
  }

  function lerp(a, b, p) { return a + (b - a) * p; }

  var FEATURES = {
    portrait: portrait,
    sconce: sconce,
    door: doorway,
    window: window_,
    cobweb: cobweb,
    crack: crack
  };

  /* Weighted so the corridor is mostly wall, with sconces frequent enough to
   * keep it lit and portraits frequent enough to be unnerving. */
  var FEATURE_BAG = [
    'sconce', 'sconce', 'sconce',
    'portrait', 'portrait',
    'crack', 'crack',
    'cobweb',
    'window',
    'door'
  ];

  global.SB = global.SB || {};
  global.SB.HAUNTED = {
    HEIGHTS: { skirt: H_SKIRT, dado: H_DADO, rail: H_RAIL, cornice: H_CORNICE },
    PALETTE: PALETTE,
    hsl: hsl,
    wallSlice: wallSlice,
    FEATURES: FEATURES,
    FEATURE_BAG: FEATURE_BAG
  };
})(window);

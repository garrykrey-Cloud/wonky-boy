/* Wonky Boy - theme.js
 * ---------------------------------------------------------------------------
 * COLOUR MODEL
 *
 * The game is deliberately colourful: every one of the 100 hazards carries its
 * own vivid hue, chosen to suit what it is (mud is brown, ice is cyan, sugar
 * is hot pink, and so on).
 *
 * On top of that, EVERY hazard is rendered with a mandatory "signature
 * aspect" - a light blue rim, inner core and outer glow. That signature is
 * what marks a thing as a hazard at a glance, and it is the single knob that
 * turns Wonky Boy into Wonky Girl: swap the signature to light pink and the
 * entire hazard system re-reads as feminine without touching one hazard.
 *
 * Rule for any new art: pick any base colour you like, then always draw the
 * signature. SB.THEME.sig() is the only place that colour comes from.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var VARIANTS = {
    boy: {
      id: 'boy',
      name: 'Wonky Boy',
      sigHue: 202,        // LIGHT BLUE - the signature aspect on every hazard
      sigSat: 92,
      sigLit: 74,
      skin: '#f7cfa8',
      shirt: '#5bb7ef',
      pants: '#2f5f95',
      hair: '#7a4d2b',
      shoe: '#e2543f'
    },
    girl: {
      id: 'girl',
      name: 'Wonky Girl',
      sigHue: 336,        // LIGHT PINK - same system, feminine signature
      sigSat: 92,
      sigLit: 76,
      skin: '#fbd8bd',
      shirt: '#ff9ec8',
      pants: '#b8477f',
      hair: '#a35a2c',
      shoe: '#ffd24a'
    }
  };

  var THEME = {
    variants: VARIANTS,
    current: VARIANTS.boy,

    setVariant: function (id) {
      if (!VARIANTS[id]) return false;
      THEME.current = VARIANTS[id];
      THEME.applyCssVars();
      return true;
    },

    /* THE SIGNATURE ASPECT. Light blue for Boy, light pink for Girl.
     * Every hazard must show this somewhere. */
    sig: function (a, litShift, satShift) {
      var c = THEME.current;
      var l = Math.max(0, Math.min(100, c.sigLit + (litShift || 0)));
      var s = Math.max(0, Math.min(100, c.sigSat + (satShift || 0)));
      return 'hsla(' + c.sigHue + ',' + s + '%,' + l + '%,' + (a === undefined ? 1 : a) + ')';
    },

    sigHue: function () { return THEME.current.sigHue; },

    /* A hazard's own colour. Free to be any hue at all. */
    hue: function (h, s, l, a) {
      return 'hsla(' + ((h % 360) + 360) % 360 + ',' + s + '%,' + l + '%,' +
        (a === undefined ? 1 : a) + ')';
    },

    applyCssVars: function () {
      var c = THEME.current;
      var r = document.documentElement;
      r.style.setProperty('--sig-hue', String(c.sigHue));
      r.style.setProperty('--sig-sat', c.sigSat + '%');
      r.style.setProperty('--sig-lit', c.sigLit + '%');
      r.style.setProperty('--sig', 'hsl(' + c.sigHue + ',' + c.sigSat + '%,' + c.sigLit + '%)');
      r.style.setProperty('--sig-dim', 'hsl(' + c.sigHue + ',' + (c.sigSat - 20) + '%,' + (c.sigLit - 28) + '%)');
      r.setAttribute('data-variant', c.id);
    }
  };

  global.SB = global.SB || {};
  global.SB.THEME = THEME;
})(window);

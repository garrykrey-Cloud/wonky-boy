/* Wonky Boy - backbutton.js
 * ---------------------------------------------------------------------------
 * Android's hardware back button.
 *
 * Without this the back button kills the app instantly from anywhere - mid
 * board, mid pause, mid anything - which is the single loudest signal that
 * something is a wrapped web page rather than an app. Back should walk back
 * out through the screens, and only leave from the very top.
 *
 * The game is plain scripts with no bundler, so the plugin is reached through
 * the bridge Capacitor injects (`window.Capacitor.Plugins.App`) rather than by
 * importing '@capacitor/app'. The npm package still has to be installed,
 * because that is what registers the plugin on the native side.
 *
 * In an ordinary browser there is no bridge, so this falls back to the browser
 * back button via a sacrificial history entry. That keeps desktop testing
 * honest: the same handler runs in both places.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var handler = null;
  var mode = 'none';

  function bridgeApp() {
    var C = global.Capacitor;
    return (C && C.Plugins && C.Plugins.App) ? C.Plugins.App : null;
  }

  /* The handler returns true when it consumed the press, false to leave. */
  function fire() {
    if (!handler) return true;
    var consumed = false;
    try {
      consumed = handler() === true;
    } catch (e) {
      /* Never let a handler bug trap someone in the app with no way out. */
      consumed = false;
    }
    return consumed;
  }

  function initNative(App) {
    mode = 'capacitor';
    App.addListener('backButton', function () {
      if (fire()) return;
      if (App.exitApp) App.exitApp();
    });
  }

  /* Browser fallback: keep one spare history entry parked so that pressing
   * back pops that instead of leaving the page, then immediately re-park it. */
  function initBrowser() {
    mode = 'history';
    try {
      global.history.pushState({ wonkyBack: true }, '');
    } catch (e) {
      mode = 'none';
      return;
    }
    global.addEventListener('popstate', function () {
      var consumed = fire();
      if (consumed) {
        try { global.history.pushState({ wonkyBack: true }, ''); } catch (e) { /* ignore */ }
      } else {
        /* Let the next back actually leave the page. */
        try { global.history.back(); } catch (e) { /* ignore */ }
      }
    });
  }

  function init(fn) {
    handler = fn;
    var App = bridgeApp();
    if (App && App.addListener) {
      initNative(App);
      return mode;
    }
    /* The bridge is injected before our scripts run, but be forgiving about
     * ordering: try again once the page has settled, then give up on it. */
    global.addEventListener('load', function () {
      if (mode !== 'none') return;
      var late = bridgeApp();
      if (late && late.addListener) initNative(late);
      else initBrowser();
    });
    return mode;
  }

  global.SB = global.SB || {};
  global.SB.BACK = {
    init: init,
    mode: function () { return mode; },
    isNative: function () { return mode === 'capacitor'; }
  };
})(window);

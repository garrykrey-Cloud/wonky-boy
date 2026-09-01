/* Wonky Boy - splash.js
 * ---------------------------------------------------------------------------
 * The launch splash: a wild-eyed boy sprinting straight at the camera while
 * the world rushes past him.
 *
 * Everything is drawn on canvas so it scales to any phone without assets. The
 * wordmark on top of it is DOM text (see index.html and style.css) because
 * text renders far more crisply that way.
 *
 * He is deliberately over the top - bulging mismatched eyes, hair standing on
 * end, arms and legs thrown in directions no runner would choose. This is the
 * same boy the game is about, at maximum panic.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SB = global.SB;
  var THEME = SB.THEME;

  function Splash(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.t = 0;
    this.raf = 0;
    this.running = false;
    this.last = 0;
    this.puffs = [];

    /* The corridor he is running through. Seeded on the clock so the layout
     * of turns and hazards differs every launch. */
    this.corridor = SB.Corridor ? new SB.Corridor('splash-' + Date.now()) : null;

    /* A few streaks still fly past the camera on top of the corridor - they
     * sell the speed at the edges of the frame where the walls are behind
     * the viewer. */
    this.lines = [];
    for (var i = 0; i < 22; i++) {
      this.lines.push({
        a: Math.random() * Math.PI * 2,
        d: Math.random(),
        len: 0.05 + Math.random() * 0.16,
        sp: 0.35 + Math.random() * 0.85,
        hue: Math.random() * 360,
        w: 1 + Math.random() * 2.6
      });
    }
  }

  Splash.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    var self = this;
    var step = function (ts) {
      if (!self.running) return;
      var dt = self.last ? Math.min((ts - self.last) / 1000, 0.05) : 0.016;
      self.last = ts;
      self.t += dt;
      self.draw(dt);
      self.raf = global.requestAnimationFrame(step);
    };
    this.raf = global.requestAnimationFrame(step);
  };

  Splash.prototype.stop = function () {
    this.running = false;
    if (this.raf) global.cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  Splash.prototype.resize = function () {
    var c = this.canvas;
    var dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    var w = c.clientWidth || global.innerWidth;
    var h = c.clientHeight || global.innerHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    this.dpr = dpr; this.W = w; this.H = h;
  };

  Splash.prototype.draw = function (dt) {
    this.resize();
    var g = this.g, W = this.W, H = this.H, t = this.t;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    /* vanishing point, a little above the middle */
    var vx = W * 0.5, vy = H * 0.42;

    this.backdrop(g, W, H, vx, vy, t);
    if (this.corridor) {
      this.corridor.advance(dt);
      this.corridor.draw(g, W, H, t);
    } else {
      this.ground(g, W, H, vy, t);      // fallback if corridor.js is absent
    }
    this.rushLines(g, W, H, vx, vy, dt);
    this.puffStep(g, dt, W, H, t);
    this.boy(g, W, H, t);
    this.vignette(g, W, H);
  };

  /* ------------------------------------------------------------ backdrop */

  Splash.prototype.backdrop = function (g, W, H, vx, vy, t) {
    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, 'hsl(258,58%,13%)');
    sky.addColorStop(0.45, 'hsl(272,54%,18%)');
    sky.addColorStop(1, 'hsl(232,58%,9%)');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    /* a hot glow behind him, cycling colour so it never looks static */
    var glow = g.createRadialGradient(vx, vy, 0, vx, vy, Math.max(W, H) * 0.62);
    var hue = (t * 26) % 360;
    glow.addColorStop(0, 'hsla(' + hue + ',95%,62%,0.20)');
    glow.addColorStop(0.4, 'hsla(' + ((hue + 60) % 360) + ',90%,55%,0.07)');
    glow.addColorStop(1, 'hsla(280,80%,40%,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
  };

  /* Speed lines flying outward past the camera. */
  Splash.prototype.rushLines = function (g, W, H, vx, vy, dt) {
    var R = Math.max(W, H) * 0.85;
    g.save();
    g.lineCap = 'round';
    for (var i = 0; i < this.lines.length; i++) {
      var L = this.lines[i];
      L.d += L.sp * dt * (0.35 + L.d * 1.5);
      if (L.d > 1.25) {
        L.d = 0.02 + Math.random() * 0.05;
        L.a = Math.random() * Math.PI * 2;
        L.hue = Math.random() * 360;
      }
      var d0 = L.d, d1 = Math.min(1.3, L.d + L.len);
      var ca = Math.cos(L.a), sa = Math.sin(L.a);
      g.strokeStyle = 'hsla(' + L.hue + ',95%,70%,' + Math.min(0.75, d0 * 0.9) + ')';
      g.lineWidth = L.w * (0.4 + d0 * 2.2);
      g.beginPath();
      g.moveTo(vx + ca * R * d0, vy + sa * R * d0);
      g.lineTo(vx + ca * R * d1, vy + sa * R * d1);
      g.stroke();
    }
    g.restore();
  };

  /* Perspective floor rushing toward the viewer. */
  Splash.prototype.ground = function (g, W, H, horizon, t) {
    g.save();
    var grd = g.createLinearGradient(0, horizon, 0, H);
    grd.addColorStop(0, 'hsla(280,60%,26%,0.15)');
    grd.addColorStop(1, 'hsla(210,70%,32%,0.55)');
    g.fillStyle = grd;
    g.fillRect(0, horizon, W, H - horizon);

    /* Rungs sweep from the horizon down past the camera, accelerating as they
     * come - that is what running TOWARD the viewer looks like.
     *
     * Careful with this loop. It previously advanced the offset by
     * `(t * 0.42) % (1/16)`, which is only one rung's worth of spacing before
     * snapping back, about seven times a second. Each rung therefore jiggled
     * across a sixteenth of its journey instead of travelling the whole way,
     * and at that rate against a 60Hz display it strobed into apparent
     * BACKWARD motion - the wagon-wheel effect - so he read as running in
     * reverse. Each rung must travel the full 0..1, continuously. */
    var RUNGS = 18;
    var SCROLL = 0.30;              // journeys per second, horizon to camera
    g.strokeStyle = THEME.sig(0.22);
    for (var i = 0; i < RUNGS; i++) {
      var k = ((i / RUNGS) + t * SCROLL) % 1;
      var p = Math.pow(k, 2.4);
      var y = horizon + (H - horizon) * p;
      g.globalAlpha = Math.min(1, p * 2.2) * 0.5;
      g.lineWidth = 1 + p * 5;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    g.globalAlpha = 1;

    /* rails converging on the vanishing point */
    g.strokeStyle = THEME.sig(0.16);
    g.lineWidth = 2;
    for (var r = -5; r <= 5; r++) {
      g.beginPath();
      g.moveTo(W / 2 + r * 22, horizon);
      g.lineTo(W / 2 + r * W * 0.42, H);
      g.stroke();
    }
    g.restore();
  };

  /* ------------------------------------------------------------ the boy */

  Splash.prototype.boy = function (g, W, H, t) {
    var c = THEME.current;

    /* One frantic stride cycle, fast. */
    var f = t * 11.5;
    var lunge = Math.sin(f * 0.5);
    var bob = Math.sin(f) * 0.028 + Math.sin(f * 2.1) * 0.012;

    /* He grows and shrinks a touch, as if pounding toward the lens. */
    var S = Math.min(W, H * 0.62) * (0.74 + lunge * 0.04);
    var cx = W * 0.5 + Math.sin(f * 0.37) * W * 0.035;
    var cy = H * 0.645 + bob * H;

    g.save();
    g.translate(cx, cy);
    g.rotate(Math.sin(f * 0.63) * 0.075);

    /* ground shadow */
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.ellipse(0, S * 0.53, S * 0.30, S * 0.055, 0, 0, Math.PI * 2);
    g.fill();

    var lw = S * 0.085;
    g.lineCap = 'round';
    g.lineJoin = 'round';

    /* ---- legs ----
     * Head on, a run is not left-right splay - that reads as a jumping jack.
     * Each leg alternates between planted and knee-up-toward-the-lens, so the
     * motion is mostly vertical with only a little sideways slop. The raised
     * leg is drawn thicker because it is nearer the camera. */
    var liftA = (Math.sin(f) + 1) / 2;             // front leg: 0 planted, 1 up
    var liftB = (Math.sin(f + Math.PI) + 1) / 2;   // back leg
    var swayA = Math.sin(f * 1.6) * 0.032;
    var swayB = Math.sin(f * 1.6 + 2.2) * 0.032;

    this.limb(g,
      -S * 0.06, S * 0.14,
      S * (-0.13 + swayB - liftB * 0.02), S * (0.33 - liftB * 0.07),
      S * (-0.17 + swayB * 1.6 - liftB * 0.03), S * (0.50 - liftB * 0.16),
      lw * (0.9 + liftB * 0.18), c.pants, c.shoe, S);

    /* ---- back arm */
    this.limb(g, -S * 0.12, -S * 0.07,
      -S * 0.27 + Math.sin(f * 1.7) * S * 0.12, -S * 0.16 + Math.cos(f * 1.7) * S * 0.20,
      -S * 0.38 + Math.sin(f * 2.3) * S * 0.18, -S * 0.30 + Math.cos(f * 2.1) * S * 0.24,
      lw * 0.82, c.skin, null, S);

    /* ---- torso */
    g.fillStyle = c.shirt;
    g.strokeStyle = 'rgba(10,8,26,0.55)';
    g.lineWidth = S * 0.018;
    roundRect(g, -S * 0.17, -S * 0.16, S * 0.34, S * 0.32, S * 0.10);
    g.fill();
    g.stroke();

    /* a scruffy collar so he reads as a small boy, not a blob */
    g.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(g, -S * 0.11, -S * 0.155, S * 0.22, S * 0.05, S * 0.02);
    g.fill();

    /* ---- front leg, knee driving at the camera */
    this.limb(g,
      S * 0.06, S * 0.15,
      S * (0.13 + swayA + liftA * 0.02), S * (0.34 - liftA * 0.07),
      S * (0.17 + swayA * 1.6 + liftA * 0.04), S * (0.51 - liftA * 0.17),
      lw * (0.95 + liftA * 0.2), c.pants, c.shoe, S);

    /* ---- front arm, flailing across the body */
    this.limb(g, S * 0.12, -S * 0.07,
      S * 0.28 + Math.sin(f * 1.7 + 2) * S * 0.14, -S * 0.14 + Math.cos(f * 1.7 + 2) * S * 0.22,
      S * 0.40 + Math.sin(f * 2.3 + 2) * S * 0.20, -S * 0.34 + Math.cos(f * 2.1 + 2) * S * 0.26,
      lw * 0.95, c.skin, null, S);

    /* ---- head */
    var hx = Math.sin(f * 1.1) * S * 0.022;
    var hy = -S * 0.31 + Math.sin(f * 2) * S * 0.012;

    /* hair standing straight up in panic */
    g.strokeStyle = c.hair;
    g.lineWidth = S * 0.035;
    for (var i = -4; i <= 4; i++) {
      var a = -Math.PI / 2 + i * 0.26;
      var wob = Math.sin(f * 2.4 + i) * 0.14;
      var r0 = S * 0.128, r1 = S * (0.188 + Math.abs(Math.sin(f * 1.8 + i)) * 0.058);
      g.beginPath();
      g.moveTo(hx + Math.cos(a) * r0, hy + Math.sin(a) * r0);
      g.lineTo(hx + Math.cos(a + wob) * r1, hy + Math.sin(a + wob) * r1);
      g.stroke();
    }

    g.fillStyle = c.skin;
    g.strokeStyle = 'rgba(10,8,26,0.5)';
    g.lineWidth = S * 0.016;
    g.beginPath();
    g.arc(hx, hy, S * 0.138, 0, Math.PI * 2);
    g.fill();
    g.stroke();

    /* ---- the insane face */
    var ex = S * 0.048, ey = -S * 0.02;

    /* two mismatched bulging eyes */
    var e1 = S * (0.052 + Math.sin(f * 3.1) * 0.008);
    var e2 = S * (0.042 + Math.cos(f * 2.7) * 0.008);
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(hx - ex, hy + ey, e1, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(hx + ex, hy + ey, e2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(10,8,26,0.45)';
    g.lineWidth = S * 0.008;
    g.beginPath(); g.arc(hx - ex, hy + ey, e1, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(hx + ex, hy + ey, e2, 0, Math.PI * 2); g.stroke();

    /* pupils skittering in different directions */
    g.fillStyle = '#141026';
    var p1x = Math.sin(f * 4.3) * e1 * 0.42, p1y = Math.cos(f * 3.3) * e1 * 0.42;
    var p2x = Math.sin(f * 3.1 + 2) * e2 * 0.45, p2y = Math.cos(f * 5.1) * e2 * 0.45;
    g.beginPath(); g.arc(hx - ex + p1x, hy + ey + p1y, e1 * 0.42, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(hx + ex + p2x, hy + ey + p2y, e2 * 0.46, 0, Math.PI * 2); g.fill();

    /* eyebrows, high and alarmed */
    g.strokeStyle = c.hair;
    g.lineWidth = S * 0.017;
    g.beginPath();
    g.moveTo(hx - ex - e1 * 0.9, hy + ey - e1 * 1.05 - Math.sin(f * 2) * S * 0.006);
    g.lineTo(hx - ex + e1 * 0.8, hy + ey - e1 * 1.38);
    g.stroke();
    g.beginPath();
    g.moveTo(hx + ex - e2 * 0.8, hy + ey - e2 * 1.45);
    g.lineTo(hx + ex + e2 * 0.9, hy + ey - e2 * 1.0 + Math.sin(f * 2.3) * S * 0.006);
    g.stroke();

    /* mouth wide open, yelling */
    var mo = S * (0.038 + Math.abs(Math.sin(f * 1.6)) * 0.030);
    g.fillStyle = '#3d1020';
    g.beginPath();
    g.ellipse(hx, hy + S * 0.062, S * 0.048, mo, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    roundRect(g, hx - S * 0.038, hy + S * 0.062 - mo * 0.92, S * 0.076, S * 0.018, S * 0.006);
    g.fill();
    g.fillStyle = 'hsla(348,70%,58%,0.95)';
    g.beginPath();
    g.ellipse(hx, hy + S * 0.062 + mo * 0.42, S * 0.022, mo * 0.36, 0, 0, Math.PI * 2);
    g.fill();

    g.restore();

    /* sweat flying off him */
    g.fillStyle = THEME.sig(0.85);
    for (var s = 0; s < 5; s++) {
      var sa = f * 0.9 + s * 1.9;
      var sd = ((f * 0.5 + s * 0.37) % 1);
      var rr = S * (0.28 + sd * 0.5);
      g.globalAlpha = 1 - sd;
      g.beginPath();
      g.ellipse(cx + Math.cos(sa) * rr, cy - S * 0.28 + Math.sin(sa) * rr * 0.5,
        S * 0.014, S * 0.024, sa, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    /* kick up dust every stride */
    if (Math.sin(f) > 0.96 && this.puffs.length < 26) {
      this.puffs.push({ x: cx + (Math.random() - 0.5) * S * 0.3, y: cy + S * 0.45, r: S * 0.05, life: 1 });
    }
  };

  /* A two-segment limb with an optional shoe on the end. */
  Splash.prototype.limb = function (g, x0, y0, x1, y1, x2, y2, w, col, shoe, S) {
    g.strokeStyle = 'rgba(10,8,26,0.45)';
    g.lineWidth = w * 1.35;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke();

    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke();

    if (shoe) {
      g.fillStyle = shoe;
      g.strokeStyle = 'rgba(10,8,26,0.5)';
      g.lineWidth = S * 0.012;
      g.beginPath();
      g.ellipse(x2, y2, w * 0.95, w * 0.62, Math.atan2(y2 - y1, x2 - x1), 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  };

  Splash.prototype.puffStep = function (g, dt, W, H, t) {
    for (var i = this.puffs.length - 1; i >= 0; i--) {
      var p = this.puffs[i];
      p.life -= dt * 1.5;
      p.r += dt * 90;
      p.y += dt * 40;
      if (p.life <= 0) { this.puffs.splice(i, 1); continue; }
      g.fillStyle = 'hsla(268,45%,72%,' + (p.life * 0.3) + ')';
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
  };

  Splash.prototype.vignette = function (g, W, H) {
    var v = g.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.32,
      W / 2, H * 0.5, Math.max(W, H) * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(4,3,14,0.82)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  };

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  global.SB.Splash = Splash;
})(window);

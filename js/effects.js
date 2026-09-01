/* Wonky Boy - effects.js
 * ---------------------------------------------------------------------------
 * The single place where a hazard actually happens to the boy.
 *
 * Both the real game and the headless simulator in tools/sim.js call straight
 * into here, so what the test harness measures is exactly what the player
 * feels - there is no second copy of the rules to drift out of sync.
 *
 * env supplies whatever the caller can do about presentation:
 *   env.player      the Player instance
 *   env.time        world clock, used for contact cooldowns
 *   env.discover(hz)  first time this hazard has ever been met
 *   env.kill(ent)     lethal contact (shields are handled by the caller)
 *   env.consumed(ent) an item was picked up
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SB = global.SB;

  /* Effect keys that persist for a while, as opposed to firing once. */
  var TIMED_KEYS = ['slop', 'speed', 'grip', 'turn', 'lag', 'invert', 'mirror',
    'spin', 'vision', 'time', 'period'];

  function timedPart(fx) {
    var out = null;
    for (var i = 0; i < TIMED_KEYS.length; i++) {
      var k = TIMED_KEYS[i];
      if (fx[k] !== undefined) { out = out || {}; out[k] = fx[k]; }
    }
    /* period-driven nuisances carry their payload along with them */
    if (out && fx.period) {
      if (fx.stun) out.stun = fx.stun;
      if (fx.push) out.push = fx.push;
    }
    return out;
  }

  /* Mystery Mush rolls any other item effect, good or bad. */
  function rollMystery(env) {
    var pool = SB.HAZARDS.CATALOG.filter(function (h) {
      return h.behavior === 'item' && !h.fx.random;
    });
    var pick = pool[Math.floor(Math.random() * pool.length)];
    var timed = timedPart(pick.fx);
    var p = env.player;
    if (timed) p.addAffliction(pick, timed, pick.fx.dur || 8);
    if (pick.fx.shield) p.shield = 1;
    if (pick.fx.reveal) p.revealed = 15;
    if (pick.fx.cleanse) p.cleanse();
    if (env.mystery) env.mystery(pick);
    return pick;
  }

  /* ctx:
   *   gate    seconds of cooldown before this entity can fire again
   *   normal  {nx, ny} contact normal, for walls
   *   dir     {x, y} direction to push, for mobs
   */
  function trigger(ent, ctx, env) {
    var hz = ent.hz, fx = hz.fx;
    var p = env.player;
    ctx = ctx || {};

    if (env.discover) env.discover(hz);

    if (fx.kill) { env.kill(ent); return; }

    if (ctx.gate) {
      if (ent.lastFire !== undefined && env.time - ent.lastFire < ctx.gate) return;
      ent.lastFire = env.time;
    }

    var timed = timedPart(fx);
    if (timed) p.addAffliction(hz, timed, fx.dur || 2);

    if (fx.stun && !fx.period) p.stun = Math.max(p.stun, fx.stun);
    if (fx.shield) p.shield = Math.max(p.shield, fx.shield);
    if (fx.reveal) p.revealed = Math.max(p.revealed, fx.dur || 15);
    if (fx.cleanse) p.cleanse();
    if (fx.phase) p.phase = Math.max(p.phase, fx.phase);
    if (fx.shake) p.shake = Math.max(p.shake, 0.7);

    if (fx.brittle && ent.behavior === 'wall') ent.broken = true;

    if (fx.bounce) {
      if (ctx.normal) {
        p.bounceOff(ctx.normal, fx.bounce);
      } else {
        var ba = Math.random() * Math.PI * 2;
        p.shove(Math.cos(ba), Math.sin(ba), fx.bounce);
      }
    }

    if (fx.push && !fx.period) {
      var dirx, diry;
      if (ctx.dir) { dirx = ctx.dir.x; diry = ctx.dir.y; }
      else if (ctx.normal) { dirx = ctx.normal.nx; diry = ctx.normal.ny; }
      else {
        /* Conveyors and slopes shove a fixed way; sneezes are random. */
        var ang = fx.drift ? ent.phase : ent.phase + Math.random() * 0.9;
        dirx = Math.cos(ang); diry = Math.sin(ang);
      }
      if (fx.push < 0) { dirx = -dirx; diry = -diry; }
      p.shove(dirx, diry, Math.abs(fx.push));
    }

    if (fx.random) rollMystery(env);

    if (ent.behavior === 'item') {
      ent.consumed = true;
      if (env.consumed) env.consumed(ent);
    }
  }

  global.SB.EFFECTS = {
    trigger: trigger,
    rollMystery: rollMystery,
    timedPart: timedPart,
    TIMED_KEYS: TIMED_KEYS
  };
})(window);

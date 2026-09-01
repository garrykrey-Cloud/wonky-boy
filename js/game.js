/* Wonky Boy - game.js
 * ---------------------------------------------------------------------------
 * Loop, input, screens, saving. This is the glue that turns the maze, the
 * sloppiness engine and the 100 hazards into a game you can hold in one hand.
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SB = global.SB;
  var THEME = SB.THEME;
  var MAZE = SB.MAZE;
  var HAZ = SB.HAZARDS;
  var ENTITIES = SB.ENTITIES;

  var SAVE_KEY = 'wonky-boy-save-v1';
  /* The game was called Sloppy Boy before the rename. Anyone who played it
   * under the old name keeps their progress. */
  var LEGACY_SAVE_KEYS = ['sloppy-boy-save-v1'];
  var TOTAL = MAZE.TOTAL_BOARDS;

  /* ------------------------------------------------------------- saving */

  var save = {
    version: 1,
    variant: 'boy',
    highest: 1,          // highest board unlocked
    deaths: 0,
    clears: 0,
    best: {},            // board -> best seconds
    seen: {},            // hazard key -> 1
    reduceMotion: false
  };

  function loadSave() {
    try {
      var raw = global.localStorage.getItem(SAVE_KEY);
      for (var i = 0; !raw && i < LEGACY_SAVE_KEYS.length; i++) {
        raw = global.localStorage.getItem(LEGACY_SAVE_KEYS[i]);
      }
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return;
      save.highest = Math.max(1, Math.min(TOTAL, d.highest | 0 || 1));
      save.deaths = d.deaths | 0;
      save.clears = d.clears | 0;
      save.best = d.best || {};
      save.seen = d.seen || {};
      save.variant = d.variant === 'girl' ? 'girl' : 'boy';
      save.reduceMotion = !!d.reduceMotion;
    } catch (e) { /* a corrupt save is not worth crashing over */ }
  }

  function writeSave() {
    try { global.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
    catch (e) { /* private mode, quota - the game still plays */ }
  }

  /* ------------------------------------------------------------- state */

  var state = {
    screen: 'title',
    maze: null,
    player: null,
    board: 1,
    time: 0,          // world clock for animation
    runTime: 0,       // clock for this attempt
    dt: 0,
    temp: [],
    pulls: [],
    lastMods: null,
    deathT: 0,
    winT: 0,
    hooks: null,
    newHazards: []
  };

  var renderer = null;
  var canvas = null;
  var el = {};

  /* ------------------------------------------------------------- input */

  var input = { x: 0, y: 0 };
  var forceInput = false;   // tools/shoot.js drives input directly
  var keys = {};
  var stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
  var STICK_RADIUS = 62;

  function readKeys() {
    var x = 0, y = 0;
    if (keys.ArrowLeft || keys.a || keys.A) x -= 1;
    if (keys.ArrowRight || keys.d || keys.D) x += 1;
    if (keys.ArrowUp || keys.w || keys.W) y -= 1;
    if (keys.ArrowDown || keys.s || keys.S) y += 1;
    return { x: x, y: y };
  }

  function updateInput() {
    if (forceInput) return;
    if (stick.active) {
      input.x = stick.x;
      input.y = stick.y;
      return;
    }
    var k = readKeys();
    var mag = Math.hypot(k.x, k.y);
    input.x = mag ? k.x / mag : 0;
    input.y = mag ? k.y / mag : 0;
  }

  function bindInput() {
    global.addEventListener('keydown', function (e) {
      keys[e.key] = true;
      if (e.key === 'Escape') togglePause();
      if (e.key === 'r' || e.key === 'R') { if (state.screen === 'play') restartBoard(); }
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) >= 0) e.preventDefault();
    }, { passive: false });
    global.addEventListener('keyup', function (e) { keys[e.key] = false; });
    global.addEventListener('blur', function () { keys = {}; });

    var pad = el.stickZone;

    function start(e) {
      if (state.screen !== 'play') return;
      var t = e.changedTouches ? e.changedTouches[0] : e;
      stick.active = true;
      stick.id = t.identifier === undefined ? 'mouse' : t.identifier;
      stick.ox = t.clientX;
      stick.oy = t.clientY;
      stick.x = 0; stick.y = 0;
      el.stick.style.display = 'block';
      el.stick.style.left = stick.ox + 'px';
      el.stick.style.top = stick.oy + 'px';
      el.stickNub.style.transform = 'translate(-50%,-50%)';
      e.preventDefault();
    }

    function move(e) {
      if (!stick.active) return;
      var t = null;
      if (e.changedTouches) {
        for (var i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === stick.id) t = e.changedTouches[i];
        }
      } else t = e;
      if (!t) return;
      var dx = t.clientX - stick.ox, dy = t.clientY - stick.oy;
      var d = Math.hypot(dx, dy);
      var capped = Math.min(d, STICK_RADIUS);
      var nx = d ? dx / d : 0, ny = d ? dy / d : 0;
      /* A small dead zone so resting a thumb does not walk him into a zap. */
      var mag = Math.max(0, (capped - 6) / (STICK_RADIUS - 6));
      stick.x = nx * mag;
      stick.y = ny * mag;
      el.stickNub.style.transform =
        'translate(calc(-50% + ' + (nx * capped) + 'px), calc(-50% + ' + (ny * capped) + 'px))';
      e.preventDefault();
    }

    function end(e) {
      if (!stick.active) return;
      stick.active = false;
      stick.x = 0; stick.y = 0;
      el.stick.style.display = 'none';
    }

    pad.addEventListener('touchstart', start, { passive: false });
    pad.addEventListener('touchmove', move, { passive: false });
    pad.addEventListener('touchend', end);
    pad.addEventListener('touchcancel', end);
    pad.addEventListener('mousedown', start);
    global.addEventListener('mousemove', move);
    global.addEventListener('mouseup', end);
  }

  /* ------------------------------------------------------ effect engine */

  function buzz(ms) {
    if (save.reduceMotion) return;
    if (global.navigator && global.navigator.vibrate) {
      try { global.navigator.vibrate(ms); } catch (e) { /* unsupported */ }
    }
  }

  function noteDiscovery(hz) {
    if (save.seen[hz.key]) return;
    save.seen[hz.key] = 1;
    writeSave();
    showToast(hz);
  }

  /* Presentation wrapper around the shared effect engine in effects.js. */
  function effectEnv() {
    return {
      player: state.player,
      time: state.time,
      discover: noteDiscovery,
      kill: kill,
      consumed: function (ent) { buzz(12); flash(ent.hz); },
      mystery: function (hz) { showToast(hz, 'Mystery Mush turned out to be...'); }
    };
  }

  function trigger(ent, ctx) {
    SB.EFFECTS.trigger(ent, ctx, effectEnv());
  }

  function kill(ent) {
    var p = state.player;
    if (p.dead || p.won) return;
    if (p.shield > 0) {
      p.shield = 0;
      p.stun = 0.25;
      p.shake = 1;
      showBanner('SHIELD POPPED', 'That one was free.');
      buzz([20, 40, 20]);
      return;
    }
    p.dead = true;
    state.deathT = 0;
    p.shake = 1.2;
    save.deaths++;
    writeSave();
    buzz([30, 60, 30]);
    el.deathName.textContent = ent ? ent.hz.name : 'A Zap';
    el.death.classList.add('show');
  }

  function buildHooks() {
    return {
      onKill: function (ent) { kill(ent); },
      onTile: function (ent) { trigger(ent, { gate: 0.35 }); },
      onItem: function (ent) { trigger(ent, {}); },
      onMob: function (ent, radius) {
        var p = state.player;
        var dx = p.x - ent.x, dy = p.y - ent.y;
        trigger(ent, { gate: 0.55, dir: { x: dx, y: dy } });
      },
      onWallHit: function (ent, normal) { trigger(ent, { normal: normal }); },
      onStumble: function (s) { if (s > 0.4) buzz(8); }
    };
  }

  /* -------------------------------------------------------- board flow */

  function loadBoard(n) {
    state.board = Math.max(1, Math.min(TOTAL, n));
    state.maze = MAZE.build(state.board);
    state.player = new SB.Player(state.maze);
    state.player.hooksOwner = state;
    state.temp = [];
    state.pulls = [];
    state.runTime = 0;
    state.deathT = 0;
    state.winT = 0;
    state.hooks = buildHooks();
    state.lastMods = state.player.mods();
    renderer.setBoard(state.maze);

    /* Which hazards on this board are brand new to the player? */
    state.newHazards = state.maze.types.filter(function (h) { return !save.seen[h.key]; });

    el.death.classList.remove('show');
    el.complete.classList.remove('show');
    updateHud(true);
    showScreen('play');
    announceBoard();
  }

  function restartBoard() { loadBoard(state.board); }

  function completeBoard() {
    var p = state.player;
    if (p.won) return;
    p.won = true;
    state.winT = 0;
    buzz([15, 30, 15, 30, 60]);

    var secs = state.runTime;
    var key = String(state.board);
    var prev = save.best[key];
    var isBest = prev === undefined || secs < prev;
    if (isBest) save.best[key] = Math.round(secs * 100) / 100;
    save.clears++;
    if (state.board + 1 > save.highest) save.highest = Math.min(TOTAL, state.board + 1);
    writeSave();

    el.completeBoard.textContent = 'Board ' + state.board + ' cleared';
    el.completeTime.textContent = fmtTime(secs);
    el.completeBest.textContent = isBest ? 'New best!' : 'Best ' + fmtTime(save.best[key]);
    el.completeNext.textContent = state.board >= TOTAL ? 'You finished all 1000' : 'Board ' + (state.board + 1);
    el.complete.classList.add('show');
  }

  function fmtTime(s) {
    if (s === undefined || s === null) return '--';
    var m = Math.floor(s / 60);
    var r = s - m * 60;
    return (m ? m + ':' + (r < 10 ? '0' : '') : '') + r.toFixed(2) + (m ? '' : 's');
  }

  /* ----------------------------------------------------------- the loop */

  var lastT = 0;

  function frame(ts) {
    global.requestAnimationFrame(frame);
    var raw = (ts - lastT) / 1000;
    lastT = ts;
    if (!isFinite(raw) || raw <= 0) return;
    tick(Math.min(raw, 0.05));          // never let a stall teleport him
  }

  /* One step of the game. Split out from the animation callback so tools can
   * drive the real loop rather than a copy of it. */
  function tick(raw) {
    if (state.screen !== 'play' || !state.maze) {
      state.time += raw;
      if (renderer && state.maze) { state.dt = 0; renderer.draw(state); }
      return;
    }

    var scale = state.lastMods ? state.lastMods.time : 1;
    var dt = raw * scale;
    state.dt = dt;
    state.time += dt;

    var p = state.player;

    if (p.dead) {
      state.deathT += raw;
      p.vx *= 0.9; p.vy *= 0.9;
      p.shake = Math.max(0, p.shake - raw * 1.6);
      if (state.deathT > 1.0) restartBoard();
      renderer.draw(state);
      return;
    }

    if (p.won) {
      state.winT += raw;
      p.vx *= 0.86; p.vy *= 0.86;
      renderer.draw(state);
      return;
    }

    state.runTime += raw;
    updateInput();

    ENTITIES.update(state, dt);
    state.lastMods = p.update(dt, input, {
      pulls: state.pulls,
      onWallHit: state.hooks.onWallHit,
      onStumble: state.hooks.onStumble
    });
    ENTITIES.cellContacts(state);

    /* Reached the exit? */
    var ex = state.maze.exit.x + 0.5, ey = state.maze.exit.y + 0.5;
    if (Math.hypot(p.x - ex, p.y - ey) < 0.34) completeBoard();

    updateHud(false);
    renderer.draw(state);
  }

  /* -------------------------------------------------------------- HUD */

  var hudTick = 0;

  function updateHud(force) {
    hudTick++;
    if (!force && hudTick % 3 !== 0) return;
    var m = state.lastMods || { slop: 0.1 };

    el.hudBoard.textContent = state.board;
    el.hudTime.textContent = fmtTime(state.runTime);
    el.hudDeaths.textContent = save.deaths;

    var pct = Math.round(m.slop * 100);
    el.slopValue.textContent = pct + '%';
    el.slopFill.style.width = Math.min(100, pct) + '%';
    el.slopFill.className = 'slop-fill' +
      (pct >= 55 ? ' hot' : (pct <= 12 ? ' cool' : ''));

    renderChips();
  }

  var chipSig = '';

  function renderChips() {
    var p = state.player;
    var list = p.afflictions;
    var sig = list.map(function (a) {
      return a.key + Math.ceil(a.until);
    }).join('|') + '#' + p.shield + '#' + Math.ceil(p.phase);
    if (sig === chipSig) return;
    chipSig = sig;

    var html = '';
    if (p.shield > 0) {
      html += '<span class="chip boon">Shield</span>';
    }
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var pctLeft = Math.max(0, Math.min(1, a.until / a.total));
      html += '<span class="chip ' + (a.boon ? 'boon' : 'bad') +
        '" style="--hue:' + (a.hz ? a.hz.hue : 200) + ';--left:' + (pctLeft * 100) + '%">' +
        escapeHtml(a.name) + '</span>';
    }
    el.chips.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------ toasts */

  var toastTimer = null;

  function showToast(hz, prefix) {
    el.toastName.textContent = (prefix ? prefix + ' ' : '') + hz.name;
    el.toastDesc.textContent = hz.desc;
    el.toast.style.setProperty('--hue', hz.hue);
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 3200);
  }

  var flashTimer = null;
  function flash(hz) {
    el.flash.style.setProperty('--hue', hz.hue);
    el.flash.classList.remove('go');
    void el.flash.offsetWidth;
    el.flash.classList.add('go');
  }

  var bannerTimer = null;
  function showBanner(title, sub) {
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub || '';
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { el.banner.classList.remove('show'); }, 1600);
  }

  function announceBoard() {
    if (!state.newHazards.length) return;
    var h = state.newHazards[0];
    setTimeout(function () {
      if (state.screen === 'play' && !save.seen[h.key]) showToast(h, 'New:');
    }, 700);
  }

  /* ----------------------------------------------------------- screens */

  /* The codex opens from the title AND from the pause menu, so back has to
   * return to whichever one opened it. */
  var codexCameFrom = 'title';

  function showScreen(name) {
    if (name === 'codex') codexCameFrom = state.screen === 'pause' ? 'pause' : 'title';
    state.screen = name;
    ['title', 'levels', 'codex', 'pause'].forEach(function (s) {
      el[s].classList.toggle('show', s === name);
    });
    el.playUi.classList.toggle('show', name === 'play');
    if (name === 'levels') renderLevels();
    if (name === 'codex') renderCodex();
    if (name === 'title') renderTitleStats();
  }

  /* --------------------------------------------------- hardware back */

  var exitArmed = 0;

  /* Returns true when the press was consumed, false to let the app close.
   * Driven by the Android back button, and by the browser back button when
   * running as a web page. */
  function handleBack() {
    /* Overlays sit on top of whatever screen is underneath them. */
    if (el.complete.classList.contains('show')) {
      el.complete.classList.remove('show');
      showScreen('title');
      return true;
    }
    if (el.death.classList.contains('show')) {
      /* The board is already restarting; swallow it so back cannot fling
       * the player out of the app mid-death. */
      return true;
    }

    var splashNode = document.getElementById('splash');
    if (splashNode && splashNode.classList.contains('show')) {
      dismissSplash();
      return true;
    }

    switch (state.screen) {
      case 'play':
        showScreen('pause');
        return true;
      case 'pause':
        showScreen('play');            // backing out of pause resumes
        return true;
      case 'levels':
        showScreen('title');
        return true;
      case 'codex':
        showScreen(codexCameFrom);
        return true;
      case 'title':
        return !confirmExit();
      default:
        showScreen('title');
        return true;
    }
  }

  /* Android convention: one press warns, a second within the window leaves.
   * Returns true when the app should actually close. */
  function confirmExit() {
    var now = Date.now();
    if (exitArmed && now - exitArmed < 2000) return true;
    exitArmed = now;
    showBanner('Press back again to exit', 'Your progress is saved.');
    return false;
  }

  function togglePause() {
    if (state.screen === 'play') showScreen('pause');
    else if (state.screen === 'pause') showScreen('play');
  }

  function renderTitleStats() {
    el.titleProgress.textContent = save.highest > 1
      ? 'Board ' + save.highest + ' of ' + TOTAL
      : 'Board 1 of ' + TOTAL;
    el.titleSeen.textContent = Object.keys(save.seen).length + ' / ' + HAZ.count;
    el.titleDeaths.textContent = save.deaths;
    el.playBtn.textContent = save.highest > 1 ? 'Continue - board ' + save.highest : 'Start wobbling';
  }

  var levelPage = 0;

  function renderLevels() {
    var perPage = 100;
    var pages = Math.ceil(TOTAL / perPage);
    levelPage = Math.max(0, Math.min(pages - 1, levelPage));
    var start = levelPage * perPage;
    var html = '';
    for (var i = start; i < start + perPage && i < TOTAL; i++) {
      var n = i + 1;
      var locked = n > save.highest;
      var best = save.best[String(n)];
      html += '<button class="lvl' + (locked ? ' locked' : '') +
        (best !== undefined ? ' done' : '') + '" data-n="' + n + '"' +
        (locked ? ' disabled' : '') + '>' + n + '</button>';
    }
    el.levelGrid.innerHTML = html;
    el.levelPage.textContent = (start + 1) + ' - ' + Math.min(TOTAL, start + perPage);
    el.levelPrev.disabled = levelPage === 0;
    el.levelNext.disabled = levelPage >= pages - 1;
  }

  function renderCodex() {
    var html = '';
    var seenCount = 0;
    for (var i = 0; i < HAZ.CATALOG.length; i++) {
      var h = HAZ.CATALOG[i];
      var seen = !!save.seen[h.key];
      if (seen) seenCount++;
      var boon = HAZ.isBoon(h);
      var zap = HAZ.isZap(h);
      html += '<div class="cx' + (seen ? '' : ' unseen') + '" style="--hue:' + h.hue + '">' +
        '<div class="cx-badge">' + h.id + '</div>' +
        '<div class="cx-body">' +
        '<div class="cx-name">' + (seen ? escapeHtml(h.name) : '? ? ?') + '</div>' +
        '<div class="cx-desc">' + (seen ? escapeHtml(h.desc) : 'Not met yet.') + '</div>' +
        '<div class="cx-tags">' +
        '<span class="tag ' + (zap ? 'zap' : (boon ? 'boon' : 'bad')) + '">' +
        (zap ? 'ZAP' : (boon ? 'HELPS' : 'HINDERS')) + '</span>' +
        '<span class="tag cat">' + h.cat + '</span>' +
        '<span class="tag brd">from board ' + h.unlock + '</span>' +
        '</div></div></div>';
    }
    el.codexList.innerHTML = html;
    el.codexCount.textContent = seenCount + ' of ' + HAZ.count + ' met';
  }

  /* --------------------------------------------------------------- boot */

  function grab() {
    ['hudBoard', 'hudTime', 'hudDeaths', 'slopValue', 'slopFill', 'chips',
      'stick', 'stickNub', 'stickZone', 'toast', 'toastName', 'toastDesc',
      'flash', 'banner', 'bannerTitle', 'bannerSub', 'death', 'deathName',
      'complete', 'completeBoard', 'completeTime', 'completeBest', 'completeNext',
      'title', 'levels', 'codex', 'pause', 'playUi', 'levelGrid', 'levelPage',
      'levelPrev', 'levelNext', 'codexList', 'codexCount', 'titleProgress',
      'titleSeen', 'titleDeaths', 'playBtn'].forEach(function (id) {
        el[id] = document.getElementById(id);
      });
  }

  function bindUi() {
    el.playBtn.onclick = function () { loadBoard(save.highest); };
    document.getElementById('levelsBtn').onclick = function () { showScreen('levels'); };
    document.getElementById('codexBtn').onclick = function () { showScreen('codex'); };
    document.getElementById('levelsBack').onclick = function () { showScreen('title'); };
    document.getElementById('codexBack').onclick = function () { showScreen('title'); };

    el.levelPrev.onclick = function () { levelPage--; renderLevels(); };
    el.levelNext.onclick = function () { levelPage++; renderLevels(); };
    el.levelGrid.onclick = function (e) {
      var b = e.target.closest('.lvl');
      if (!b || b.disabled) return;
      loadBoard(parseInt(b.dataset.n, 10));
    };

    document.getElementById('pauseBtn').onclick = togglePause;
    document.getElementById('resumeBtn').onclick = function () { showScreen('play'); };
    document.getElementById('retryBtn').onclick = function () { restartBoard(); };
    document.getElementById('quitBtn').onclick = function () { showScreen('title'); };
    document.getElementById('pauseCodex').onclick = function () { showScreen('codex'); };

    document.getElementById('nextBtn').onclick = function () {
      if (state.board >= TOTAL) { showScreen('title'); return; }
      loadBoard(state.board + 1);
    };
    document.getElementById('replayBtn').onclick = function () { restartBoard(); };
    document.getElementById('completeQuit').onclick = function () { showScreen('title'); };

    var vb = document.getElementById('variantBtn');
    vb.onclick = function () {
      save.variant = save.variant === 'boy' ? 'girl' : 'boy';
      THEME.setVariant(save.variant);
      writeSave();
      vb.textContent = THEME.current.name;
      document.getElementById('gameTitle').textContent = THEME.current.name;
      if (state.maze) renderer.setBoard(state.maze);
      renderCodexIfOpen();
    };
    vb.textContent = THEME.current.name;

    var rm = document.getElementById('motionBtn');
    rm.onclick = function () {
      save.reduceMotion = !save.reduceMotion;
      writeSave();
      rm.textContent = 'Rumble: ' + (save.reduceMotion ? 'off' : 'on');
    };
    rm.textContent = 'Rumble: ' + (save.reduceMotion ? 'off' : 'on');
  }

  function renderCodexIfOpen() {
    if (state.screen === 'codex') renderCodex();
  }

  /* ------------------------------------------------------------- splash */

  var SPLASH_KEY = 'wonky-boy-splash-seen-v1';
  var splash = null;

  function splashAlreadySeen() {
    try { return global.sessionStorage.getItem(SPLASH_KEY) === '1'; }
    catch (e) { return false; }
  }

  function dismissSplash() {
    var node = document.getElementById('splash');
    if (!node || !node.classList.contains('show')) return;
    try { global.sessionStorage.setItem(SPLASH_KEY, '1'); } catch (e) { /* private mode */ }
    node.classList.remove('show');
    if (splash) splash.stop();
    showScreen('title');
  }

  /* The wordmark is set in whatever heavy condensed face the device happens to
   * have, and those vary wildly in width - Arial Black on Windows, something
   * quite different on Android. Measure it and scale it down if it would run
   * off the edge, so "WONKY BOY" always sits on one line inside the screen. */
  function fitWordmark() {
    var mark = document.querySelector('.wordmark');
    var wrap = document.querySelector('.splash-words');
    if (!mark || !wrap) return;
    mark.style.setProperty('--wm-fit', 1);
    var avail = wrap.clientWidth - 16;
    var w = mark.getBoundingClientRect().width;
    if (w > avail && w > 0) {
      mark.style.setProperty('--wm-fit', Math.max(0.4, avail / w).toFixed(3));
    }
  }

  /* Session-scoped: once per launch, not on every navigation within a session. */
  function startSplash() {
    var node = document.getElementById('splash');
    if (!node || splashAlreadySeen()) { showScreen('title'); return; }

    node.classList.add('show');
    fitWordmark();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitWordmark).catch(function () { });
    }
    global.addEventListener('resize', fitWordmark);

    splash = new SB.Splash(document.getElementById('splashCanvas'));
    splash.start();

    /* Anything at all gets him going. */
    node.addEventListener('pointerdown', dismissSplash);
    node.addEventListener('touchstart', dismissSplash, { passive: true });
    global.addEventListener('keydown', dismissSplash, { once: true });
  }

  function boot() {
    loadSave();
    THEME.setVariant(save.variant);
    grab();
    canvas = document.getElementById('game');
    renderer = new SB.Renderer(canvas);
    bindInput();
    bindUi();
    document.getElementById('gameTitle').textContent = THEME.current.name;
    if (SB.BACK) SB.BACK.init(handleBack);
    startSplash();
    global.requestAnimationFrame(function (t) { lastT = t; global.requestAnimationFrame(frame); });

    global.addEventListener('resize', function () { if (renderer) renderer.resize(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.screen === 'play') showScreen('pause');
    });
  }

  global.SB.GAME = {
    boot: boot,
    state: state,
    save: save,
    loadBoard: function (n) { loadBoard(n); },
    /* exposed so tools can drive and inspect the real loop without a visible
     * window - see tools/shoot.js */
    get renderer() { return renderer; },
    showScreen: function (n) { showScreen(n); },
    /* the hardware back handler, exposed so it can be exercised without a
     * physical device - returns true when it swallowed the press */
    handleBack: function () { return handleBack(); },
    step: function (raw, forcedInput) {
      if (forcedInput) { input.x = forcedInput.x; input.y = forcedInput.y; forceInput = true; }
      tick(raw === undefined ? 1 / 60 : raw);
      forceInput = false;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);

/* Wonky Boy - tools/shoot.js
 * Browser-side helper: drives a board forward a number of frames, renders one
 * frame at phone size and posts the PNG back to the dev server so it can be
 * looked at. Paste-run through the page, not shipped with the game.
 */
window.SBSHOT = async function (opts) {
  const SB = window.SB, G = SB.GAME, st = G.state;
  opts = opts || {};
  const W = opts.w || 390, H = opts.h || 760;

  SB.Renderer.prototype.resize = function () {
    this.canvas.width = W;
    this.canvas.height = H;
    this.dpr = 1; this.vw = W; this.vh = H;
  };

  if (opts.board) G.loadBoard(opts.board);
  const R = G.renderer;

  const frames = opts.frames === undefined ? 120 : opts.frames;
  const ix = opts.ix === undefined ? 1 : opts.ix;
  const iy = opts.iy === undefined ? 0.35 : opts.iy;

  for (let i = 0; i < frames; i++) {
    const dt = 1 / 60;
    st.time += dt; st.dt = dt;
    SB.ENTITIES.update(st, dt);
    st.lastMods = st.player.update(dt, { x: ix, y: iy }, {
      pulls: st.pulls, onWallHit: st.hooks.onWallHit, onStumble: st.hooks.onStumble
    });
    SB.ENTITIES.cellContacts(st);
    if (st.player.dead) { st.player.dead = false; st.player.reset(st.maze); }
    R.draw(st);   // every frame, so the camera actually follows him
  }

  const url = document.getElementById('game').toDataURL('image/png');
  await fetch('/_shot/' + (opts.name || 'frame') + '.png', { method: 'POST', body: url });
  return {
    name: opts.name, board: st.board,
    slop: st.lastMods ? +st.lastMods.slop.toFixed(3) : null,
    afflictions: st.player.afflictions.map(a => a.name),
    bytes: url.length
  };
};

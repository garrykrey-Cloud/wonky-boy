/* Wonky Boy - hazards.js
 * ---------------------------------------------------------------------------
 * THE 100 HAZARDS.
 *
 * Ordering is meaningful: index 0 is the mildest, index 99 the nastiest.
 * A hazard's unlock board is derived from its index, so hazards arrive in a
 * steadily escalating order and board 3 never shows a late-game horror.
 *
 * COLOUR: each hazard owns a vivid base hue that suits what it is - mud is
 * brown, ice is cyan, sugar is hot pink. On top of that the renderer always
 * paints the LIGHT BLUE signature aspect from SB.THEME.sig(): a rim, an inner
 * core and an outer glow. That signature is what says "hazard", and swapping
 * it to light pink is the whole of the Wonky Girl reskin.
 *
 * BEHAVIOURS
 *   wall       occupies a maze wall edge; effect fires on contact
 *   tile       occupies a floor cell; effect applies while standing on it
 *   item       a pickup; effect applies for fx.dur seconds then wears off
 *   zapStatic  a fixed lethal cell
 *   zapToggle  a lethal cell or beam that switches on and off on a cycle
 *   zapPatrol  a lethal thing that walks a fixed route
 *   zapChase   a lethal thing that hunts the player
 *   zapStrike  a lethal thing that arms, telegraphs, then fires
 *   mob        a non-lethal creature that shoves, pulls or slops you
 *
 * EFFECT KEYS (fx) - all deltas are relative, 0 means no change
 *   slop    + sloppier movement, - steadier movement
 *   speed   + faster, - slower
 *   grip    + traction, - sliding
 *   turn    + sharper steering, - mushier steering
 *   lag     seconds of input delay added
 *   invert  true = controls reversed
 *   mirror  true = X and Y swapped
 *   spin    constant rotational drift in radians per second
 *   vision  multiplier on sight radius
 *   time    multiplier on game speed
 *   push    one-shot impulse strength (negative pushes away from the hazard)
 *   pull    continuous attraction strength
 *   bounce  restitution kick on contact
 *   stun    seconds frozen solid
 *   shield  1 = absorbs the next zap
 *   reveal  1 = shows the whole maze
 *   cleanse 1 = clears every negative affliction
 *   brittle 1 = the wall breaks open after one contact
 *   phase   seconds of walking through walls
 *   random  1 = rolls a random effect on pickup
 *   trail   mob leaves a slick trail behind it
 *   rainbow 1 = base hue cycles instead of sitting still
 *   dur     seconds the effect lasts
 *   w       spawn weight (relative frequency)
 * ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  /* key, name, cat, behavior, glyph, ownHue, fx, description */
  var TABLE = [
    ['tickle_grass', 'Tickle Grass', 'floor', 'tile', 'vvv', 100, { slop: 0.15, dur: 2.5, w: 10 }, 'Wiry grass that makes his knees giggle.'],
    ['grease_wall', 'Grease Wall', 'wall', 'wall', '~', 50, { grip: -0.35, dur: 3, w: 9 }, 'Slick to the touch. Bouncing off it costs him his footing.'],
    ['crumb_wall', 'Crumb Wall', 'wall', 'wall', '::', 32, { brittle: 1, w: 6 }, 'Stale and flaky. One good shoulder opens a shortcut.'],
    ['sticky_gum', 'Sticky Gum', 'floor', 'tile', 'oo', 320, { speed: -0.35, dur: 2, w: 9 }, 'Somebody chewed it. Now his shoes own it.'],
    ['jelly_wall', 'Jelly Wall', 'wall', 'wall', '}}', 275, { bounce: 0.55, slop: 0.2, dur: 1.5, w: 8 }, 'Wobbles when hit, and so does he.'],
    ['grippy_socks', 'Grippy Socks', 'item', 'item', '^^', 140, { grip: 0.5, dur: 14, w: 5 }, 'Little rubber nubs. Genuinely helpful for once.'],
    ['zap_coil', 'Zap Coil', 'zap', 'zapStatic', '*', 52, { kill: 1, w: 8 }, 'A tight coil that pops the moment he leans in.'],
    ['wobble_wall', 'Wobble Wall', 'wall', 'wall', 'S', 28, { turn: -0.3, dur: 3, w: 8 }, 'Never quite where he left it. Steering goes mushy.'],
    ['marble_scatter', 'Marble Scatter', 'floor', 'tile', '...', 180, { grip: -0.45, dur: 2, w: 8 }, 'Loose marbles. His ankles were not consulted.'],
    ['steady_snack', 'Steady Snack', 'item', 'item', '+', 40, { slop: -0.35, dur: 16, w: 5 }, 'A dry biscuit. Boring, and that is the point.'],

    ['squeak_wall', 'Squeak Wall', 'wall', 'wall', '~~', 78, { slop: 0.2, push: 0.3, dur: 2, w: 7 }, 'It shrieks on contact and he flinches sideways.'],
    ['mud_patch', 'Mud Patch', 'floor', 'tile', '##', 26, { speed: -0.5, grip: -0.2, dur: 2, w: 8 }, 'Thick muck that eats momentum.'],
    ['ouch_spikes', 'Ouch Spikes', 'zap', 'zapStatic', '^^', 2, { kill: 1, w: 7 }, 'Blunt and absolutely non-negotiable.'],
    ['static_wall', 'Static Wall', 'wall', 'wall', 'z', 268, { slop: 0.35, dur: 3, w: 7 }, 'Charges his hair and scrambles his limbs.'],
    ['banana_peel', 'Banana Peel', 'item', 'item', '((', 50, { grip: -0.6, dur: 9, w: 6 }, 'The oldest joke in the world still works on him.'],
    ['slick_ice', 'Slick Ice', 'floor', 'tile', '==', 190, { grip: -0.75, dur: 1.5, w: 7 }, 'No brakes. None. Plan several corners ahead.'],
    ['rumble_strip', 'Rumble Strip', 'floor', 'tile', '|||', 20, { slop: 0.3, dur: 1.5, w: 7 }, 'Ridged flooring that shakes his joints loose.'],
    ['prickle_wall', 'Prickle Wall', 'wall', 'wall', 'xx', 350, { speed: -0.3, slop: 0.25, dur: 3, w: 6 }, 'Bristled. Brushing it is a small disaster.'],
    ['calm_blanket', 'Calm Blanket', 'item', 'item', '[]', 250, { slop: -0.5, dur: 14, w: 4 }, 'Weighted and warm. His arms finally behave.'],
    ['spark_puddle', 'Spark Puddle', 'zap', 'zapStatic', '!', 66, { kill: 1, w: 7 }, 'Shallow water with strong opinions about electricity.'],

    ['jelly_floor', 'Jelly Floor', 'floor', 'tile', '~o~', 315, { bounce: 0.4, grip: -0.4, dur: 1.5, w: 6 }, 'Springy underfoot. Every step is a small launch.'],
    ['noodle_arms', 'Noodle Arms', 'item', 'item', '~~', 44, { turn: -0.5, slop: 0.4, dur: 12, w: 6 }, 'His elbows have quietly resigned.'],
    ['rubber_wall', 'Rubber Wall', 'wall', 'wall', '))', 12, { bounce: 0.95, dur: 1, w: 6 }, 'Hits back harder than he hit it.'],
    ['sand_pit', 'Sand Pit', 'floor', 'tile', ':::', 42, { speed: -0.55, dur: 2, w: 6 }, 'Fine sand that drags at his shins.'],
    ['wobble_bot', 'Wobble Bot', 'mob', 'mob', '[o]', 210, { push: 0.9, slop: 0.25, dur: 2, w: 6 }, 'A patrolling tin thing with no sense of personal space.'],
    ['chalk_wall', 'Chalk Wall', 'wall', 'wall', '#', 36, { grip: 0.6, dur: 8, w: 4 }, 'Dusty and dry. Wipe your hands and grip improves.'],
    ['jelly_legs', 'Jelly Legs', 'item', 'item', 'JJ', 290, { slop: 0.5, dur: 11, w: 7 }, 'Knees now optional.'],
    ['conveyor_tile', 'Conveyor Tile', 'floor', 'tile', '>>', 32, { push: 0.7, dur: 0.2, w: 6 }, 'Moves the floor without asking him first.'],
    ['lightning_tile', 'Lightning Tile', 'zap', 'zapToggle', '/', 56, { kill: 1, cycle: 2.6, w: 7 }, 'On, off, on, off. Count it or die guessing.'],
    ['focus_goggles', 'Focus Goggles', 'item', 'item', 'oo', 172, { slop: -0.45, vision: 1.4, dur: 13, w: 4 }, 'Everything sharpens, including his intentions.'],

    ['frost_wall', 'Frost Wall', 'wall', 'wall', '**', 196, { grip: -0.8, dur: 3, w: 6 }, 'Iced over. Contact turns the floor into a rumour.'],
    ['wind_vent', 'Wind Vent', 'floor', 'tile', '^^^', 150, { push: 1.1, dur: 0.2, w: 6 }, 'Blasts him off his line in pulses.'],
    ['sugar_rush', 'Sugar Rush', 'item', 'item', '$', 330, { speed: 0.6, slop: 0.45, dur: 10, w: 6 }, 'Faster. Much worse at steering. Extremely happy.'],
    ['snap_trap', 'Snap Trap', 'zap', 'zapStrike', 'V', 16, { kill: 1, arm: 0.9, w: 6 }, 'It hears him coming, then it waits a beat.'],
    ['bouncy_boots', 'Bouncy Boots', 'item', 'item', 'bb', 90, { bounce: 0.8, slop: 0.4, speed: 0.2, dur: 11, w: 5 }, 'Every footfall becomes a negotiation with the ceiling.'],
    ['dizzy_juice', 'Dizzy Juice', 'item', 'item', '@', 285, { spin: 1.1, dur: 9, w: 6 }, 'The maze starts turning even when he does not.'],
    ['soap_suds', 'Soap Suds', 'floor', 'tile', 'ooo', 185, { grip: -0.65, slop: 0.25, dur: 2, w: 6 }, 'Clean floor, filthy trick.'],
    ['push_puppy', 'Push Puppy', 'mob', 'mob', 'dd', 34, { push: 0.7, w: 5 }, 'Delighted to see him. Repeatedly.'],
    ['hiccup_wall', 'Hiccup Wall', 'wall', 'wall', '!.', 8, { stun: 0.25, dur: 2.5, w: 6 }, 'Startles him into little frozen moments.'],
    ['bubble_shield', 'Bubble Shield', 'item', 'item', 'O', 160, { shield: 1, dur: 22, w: 3 }, 'One free mistake. Spend it well.'],

    ['spin_plate', 'Spin Plate', 'floor', 'tile', '@@', 305, { spin: 1.6, dur: 2.5, w: 5 }, 'A turntable in the floor. He is the record.'],
    ['buzz_saw', 'Buzz Saw', 'zap', 'zapPatrol', 'X', 356, { kill: 1, speed: 2.4, w: 6 }, 'Runs the corridor on a fixed route. It does not deviate.'],
    ['molasses_wall', 'Molasses Wall', 'wall', 'wall', '===', 22, { speed: -0.6, dur: 3.5, w: 5 }, 'Touch it and the whole world thickens.'],
    ['itchy_sweater', 'Itchy Sweater', 'item', 'item', 'WW', 46, { slop: 0.55, dur: 12, w: 6 }, 'He cannot stop squirming inside it.'],
    ['fog_bank', 'Fog Bank', 'floor', 'tile', '~~~', 215, { vision: 0.45, dur: 3, w: 5 }, 'Pale murk. The exit is in there somewhere.'],
    ['slow_mo_lolly', 'Slow-Mo Lolly', 'item', 'item', 'qq', 155, { time: 0.72, dur: 11, boon: true, w: 3 }, 'The world slows down and he almost keeps up.'],
    ['sneeze_wall', 'Sneeze Wall', 'wall', 'wall', 'A', 118, { push: 1.6, slop: 0.3, dur: 2, w: 5 }, 'A single enormous sneeze, direction unknown.'],
    ['bounce_pad', 'Bounce Pad', 'floor', 'tile', '^O^', 36, { bounce: 1.2, dur: 0.2, w: 5 }, 'Launches him whichever way he was leaning.'],
    ['drip_blob', 'Drip Blob', 'mob', 'mob', 'o.', 96, { trail: 1, grip: -0.5, dur: 3, w: 5 }, 'Wanders, leaks, and greases the whole corridor.'],
    ['zap_fence', 'Zap Fence', 'zap', 'zapToggle', '||', 60, { kill: 1, cycle: 3.4, span: 1, w: 6 }, 'Two posts, one lethal line, a rhythm to learn.'],

    ['map_crumb', 'Map Crumb', 'item', 'item', 'M', 38, { reveal: 1, dur: 20, w: 3 }, 'A torn corner of a map somebody dropped.'],
    ['slurp_wall', 'Slurp Wall', 'wall', 'wall', '<', 262, { pull: 1.0, dur: 2, w: 5 }, 'Draws him in exactly when he wants to leave.'],
    ['bubble_bath', 'Bubble Bath', 'floor', 'tile', 'OOO', 178, { grip: -0.5, slop: 0.35, dur: 2.5, w: 5 }, 'Warm, foamy, completely unnavigable.'],
    ['butterfingers', 'Butterfingers', 'item', 'item', '88', 48, { turn: -0.6, dur: 12, w: 5 }, 'Whatever he grabs, including direction, slips away.'],
    ['gust_wisp', 'Gust Wisp', 'mob', 'mob', '~', 168, { push: 1.3, w: 5 }, 'A drifting puff that shoves in rhythmic pulses.'],
    ['buzz_wall', 'Buzz Wall', 'wall', 'wall', 'zz', 272, { lag: 0.18, dur: 4, w: 5 }, 'His commands arrive late and slightly confused.'],
    ['whirl_pool', 'Whirl Pool', 'floor', 'tile', '(@)', 192, { pull: 1.2, spin: 1.3, dur: 2, w: 5 }, 'A slow drain in the middle of the corridor.'],
    ['fizz_pit', 'Fizz Pit', 'zap', 'zapStatic', 'vvv', 84, { kill: 1, size: 2, w: 5 }, 'Wide, bubbling and entirely fatal.'],
    ['heavy_backpack', 'Heavy Backpack', 'item', 'item', 'B', 68, { speed: -0.4, slop: -0.3, dur: 15, w: 5 }, 'Slow and steady. An honest trade.'],
    ['zigzag_wall', 'Zigzag Wall', 'wall', 'wall', 'ZZ', 24, { push: 1.0, slop: 0.3, dur: 2, w: 5 }, 'Deflects him sideways every single time.'],

    ['clunky_boots', 'Clunky Boots', 'item', 'item', 'LL', 30, { lag: 0.25, speed: -0.15, dur: 12, w: 5 }, 'Enormous. His feet arrive after he does.'],
    ['crackle_orb', 'Crackle Orb', 'zap', 'zapPatrol', '(*)', 312, { kill: 1, speed: 1.9, orbit: 1, w: 5 }, 'Circles its post forever, crackling to itself.'],
    ['slope_tile', 'Slope Tile', 'floor', 'tile', '//', 130, { push: 0.5, dur: 0.2, drift: 1, w: 5 }, 'Tilted floor. Standing still is not an option.'],
    ['tickle_moth', 'Tickle Moth', 'mob', 'mob', 'MM', 288, { slop: 0.6, dur: 3, swarm: 1, w: 5 }, 'A little cloud of them. He cannot stop laughing.'],
    ['rattle_wall', 'Rattle Wall', 'wall', 'wall', '###', 18, { slop: 0.5, shake: 1, dur: 3, w: 5 }, 'The whole corridor judders and so does the screen.'],
    ['second_wind', 'Second Wind', 'item', 'item', '++', 145, { cleanse: 1, slop: -0.2, dur: 8, w: 3 }, 'Everything bad falls off him at once.'],
    ['jelly_bean_spill', 'Jelly Bean Spill', 'floor', 'tile', 'ooo', 300, { grip: -0.55, bounce: 0.5, dur: 2, w: 5 }, 'Sweet, round, and lethal to balance.'],
    ['magnet_mole', 'Magnet Mole', 'mob', 'mob', 'mm', 4, { pull: 1.5, w: 5 }, 'Burrows about, dragging him off course.'],
    ['mirror_wall', 'Mirror Wall', 'wall', 'wall', '||', 205, { mirror: true, dur: 5, w: 5 }, 'His left and right politely swap places.'],
    ['rocket_sneakers', 'Rocket Sneakers', 'item', 'item', '>>', 14, { speed: 1.0, slop: 0.3, dur: 9, w: 5 }, 'Wonderful in a straight line. There are no straight lines.'],

    ['zap_rain', 'Zap Rain', 'zap', 'zapStrike', '...', 58, { kill: 1, arm: 1.2, scatter: 1, w: 5 }, 'Bolts drop on marked squares. Do not linger.'],
    ['dark_patch', 'Dark Patch', 'floor', 'tile', '###', 258, { vision: 0.25, dur: 3, w: 4 }, 'The lights simply stop working here.'],
    ['noodle_wall', 'Noodle Wall', 'wall', 'wall', 'SS', 46, { shift: 1, slop: 0.3, dur: 2, w: 4 }, 'It does not stay put. The maze rewrites itself.'],
    ['mystery_mush', 'Mystery Mush', 'item', 'item', '?', 295, { random: 1, rainbow: 1, dur: 11, w: 4 }, 'Could be wonderful. Usually is not.'],
    ['rolling_barrel', 'Rolling Barrel', 'mob', 'mob', '[]', 30, { push: 2.0, w: 4 }, 'Heavy and completely uninterested in him.'],
    ['shock_rail', 'Shock Rail', 'zap', 'zapToggle', '---', 44, { kill: 1, cycle: 2.2, sweep: 1, w: 5 }, 'A live line that sweeps the corridor end to end.'],
    ['backwards_cap', 'Backwards Cap', 'item', 'item', 'C', 358, { invert: true, dur: 9, w: 4 }, 'Worn the wrong way. So is everything else now.'],
    ['puff_wall', 'Puff Wall', 'wall', 'wall', 'oO', 158, { push: -1.0, dur: 1, boon: true, w: 3 }, 'Politely pushes him back into the open.'],
    ['slop_ghost', 'Slop Ghost', 'mob', 'mob', 'U', 280, { slop: 0.7, dur: 4, ghost: 1, w: 4 }, 'Walks through walls. Leaves him wobbling.'],
    ['tangle_laces', 'Tangle Laces', 'item', 'item', '&', 174, { stun: 0.3, period: 2.4, dur: 13, w: 4 }, 'They knot themselves every couple of seconds.'],

    ['static_cloud', 'Static Cloud', 'zap', 'zapPatrol', '~*~', 276, { kill: 1, speed: 1.1, drift: 1, w: 4 }, 'Drifts nowhere in particular, kills anything it touches.'],
    ['yawn_wall', 'Yawn Wall', 'wall', 'wall', 'oo', 30, { time: 0.8, dur: 6, boon: true, w: 3 }, 'Everything gets sleepy and slow. Blessedly so.'],
    ['mirror_shades', 'Mirror Shades', 'item', 'item', '==', 208, { mirror: true, vision: 0.8, dur: 10, w: 4 }, 'Cool. Useless. Actively harmful.'],
    ['zap_bee', 'Zap Bee', 'zap', 'zapChase', 'vv', 48, { kill: 1, speed: 1.5, chase: 1, w: 5 }, 'It has decided he is the flower.'],
    ['wiggle_worm_snack', 'Wiggle Worm Snack', 'item', 'item', 'ss', 340, { slop: 0.7, speed: 0.35, dur: 11, w: 4 }, 'Delicious. He is now mostly wiggle.'],
    ['squeaky_shoes', 'Squeaky Shoes', 'item', 'item', 'pp', 350, { push: 0.4, period: 0.9, dur: 12, w: 4 }, 'Every squeak nudges him somewhere unhelpful.'],
    ['backwards_wall', 'Backwards Wall', 'wall', 'wall', '<>', 300, { invert: true, dur: 5, w: 4 }, 'One brush and forward becomes back.'],
    ['copy_cat', 'Copy Cat', 'mob', 'mob', 'cc', 220, { push: 1.0, mimic: 1, w: 4 }, 'Replays his own moves back at him, in the way.'],
    ['live_wire', 'Live Wire', 'zap', 'zapPatrol', '~~', 10, { kill: 1, speed: 1.7, snake: 1, w: 5 }, 'A loose cable whipping down the corridor.'],
    ['fast_fwd_fizz', 'Fast-Fwd Fizz', 'item', 'item', '>>>', 186, { time: 1.35, slop: 0.2, dur: 9, w: 4 }, 'The world speeds up. His limbs do not keep pace.'],

    ['balloon_hat', 'Balloon Hat', 'item', 'item', 'O^', 352, { slop: 0.6, grip: -0.4, speed: 0.15, dur: 11, w: 4 }, 'Buoyant. He is now partly airborne and fully useless.'],
    ['bubble_wall', 'Bubble Wall', 'wall', 'wall', '()', 165, { phase: 3.5, w: 2 }, 'For a few seconds walls are merely a suggestion.'],
    ['boom_bulb', 'Boom Bulb', 'zap', 'zapStrike', '(!)', 20, { kill: 1, arm: 0.55, prox: 1, w: 4 }, 'Lights up when he is close. Then it is too late.'],
    ['wobble_helmet', 'Wobble Helmet', 'item', 'item', 'nn', 26, { slop: 0.8, dur: 12, w: 4 }, 'Heavy on top. His head leads and his body argues.'],
    ['extra_left_foot', 'Extra Left Foot', 'item', 'item', 'LL', 24, { slop: 1.0, turn: -0.4, dur: 12, w: 4 }, 'He now has two left feet, literally and legally.'],
    ['sleepy_milk', 'Sleepy Milk', 'item', 'item', 'U', 44, { speed: -0.5, slop: -0.6, dur: 14, w: 3 }, 'Slow, calm, and finally in control of his own arms.'],
    ['trampoline_square', 'Trampoline Square', 'floor', 'tile', '^^^', 245, { bounce: 1.8, slop: 0.3, dur: 0.3, w: 4 }, 'Sends him somewhere. Rarely the intended somewhere.'],
    ['shock_gauntlet', 'Shock Gauntlet', 'zap', 'zapToggle', '###', 46, { kill: 1, cycle: 1.8, cluster: 1, w: 4 }, 'A row of beams firing out of step with each other.'],
    ['total_slop_syndrome', 'Total Slop Syndrome', 'item', 'item', '???', 310, { slop: 1.4, turn: -0.5, grip: -0.4, rainbow: 1, dur: 14, w: 3 }, 'Full-body slop. Nothing he does is on purpose any more.'],
    ['the_sloppinator', 'The Sloppinator', 'mob', 'mob', 'WW', 105, { slop: 1.2, pull: 1.0, push: 1.4, aura: 2.5, w: 3 }, 'Enormous and radiating pure sloppiness.']
  ];

  var CATALOG = TABLE.map(function (row, i) {
    var fx = row[6] || {};
    return {
      index: i,
      id: i + 1,
      key: row[0],
      name: row[1],
      cat: row[2],
      behavior: row[3],
      glyph: row[4],
      hue: row[5],
      fx: fx,
      desc: row[7],
      w: fx.w || 4,
      /* Unlock curve: hazard 1 from the very first board, hazard 100 by 945. */
      unlock: Math.max(1, Math.round(945 * Math.pow(i / (TABLE.length - 1), 1.18))),
      tier: 1 + Math.floor(i / 10)
    };
  });

  var BY_KEY = {};
  CATALOG.forEach(function (h) { BY_KEY[h.key] = h; });

  /* Everything the player is allowed to meet on a given board. */
  function availableFor(board) {
    var out = [];
    for (var i = 0; i < CATALOG.length; i++) {
      if (CATALOG[i].unlock <= board) out.push(CATALOG[i]);
    }
    return out;
  }

  function isZap(h) { return !!(h.fx && h.fx.kill); }

  /* Does this hazard help? Drives the HUD chip colour and the codex sorting. */
  function isBoon(h) {
    var f = h.fx;
    if (!f || f.kill) return false;
    if (f.boon || f.shield || f.reveal || f.cleanse || f.phase || f.brittle) return true;
    if (f.invert || f.mirror || f.lag || f.spin || f.stun) return false;
    if ((f.vision || 1) > 1) return true;
    var score = (f.slop || 0) - (f.turn || 0) - (f.grip || 0);
    return score < -0.05;
  }

  global.SB = global.SB || {};
  global.SB.HAZARDS = {
    CATALOG: CATALOG,
    BY_KEY: BY_KEY,
    availableFor: availableFor,
    isZap: isZap,
    isBoon: isBoon,
    count: CATALOG.length
  };
})(window);

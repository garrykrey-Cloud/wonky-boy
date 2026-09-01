# Wonky Boy

A phone maze game about a small boy who cannot control his arms and legs.

You point him where you want to go. He goes *roughly* there. 1000 boards,
100 hazards, and a boy who gets steadily worse at being a boy.

---

## Playing it

```bash
node tools/serve.js
```

Then open `http://localhost:5178/`. The server prints a LAN address too, so a
phone on the same wifi can open it directly and install it from the browser
menu ("Add to home screen") as a standalone app.

**Controls**

| | |
|---|---|
| Phone | Drag anywhere on the lower part of the screen. A thumbstick appears where you touch. |
| Keyboard | Arrows or WASD |
| | `R` restart the board, `Esc` pause |

Progress is saved in the browser under `wonky-boy-save-v1`. It is per-device
and per-origin — the same caveat as any browser-stored save.

---

## The splash

On launch, a wild-eyed boy sprints straight at the camera down a rushing
perspective floor, under a heavy condensed wordmark reading **WONKY BOY** with
**by Garry** beneath it. Tap anywhere to go in.

The boy is drawn entirely on canvas (js/splash.js) so it needs no art assets
and scales to any phone. The wordmark is DOM text, because text renders far
more crisply that way: three stacked copies of the same words give a dark
extrude, a fat outline and a gradient face, squeezed horizontally to fake the
very condensed weight of a game logo out of fonts the device already has. If
the device font runs wide, fitWordmark() in game.js scales it to fit.

The splash is session-scoped - once per launch, not on every reload.

---

## The camera

**The boy never moves on screen.** He is pinned to the exact centre of the
phone and the maze slides underneath him. The camera sits precisely on his
position — deliberately no smoothing and no clamping to the board edges,
because either one would let him drift off centre.

Every board is much larger than the screen. The view shows about 5 cells
across and 10 down, so corridors are wide and chunky rather than a distant
top-down plan; boards run from 17x23 (roughly 3 x 2 screens) up to 45x61
(roughly 9 x 6 screens). Because the camera never clamps, near a
corner you see past the edge of the board — so the board carries a lit rim,
and the space beyond it holds a parallax layer scrolling at a different rate
to the maze, which is what makes the world read as moving around a boy who is
standing still.

The **walk** to the exit scales separately from the board size. Early boards
put the exit about 26 cells away; by board 1000 it is over 200. That stops a
very large map turning every board into a marathon that a single zap sends you
back to the beginning of. Whenever the exit is off-screen, a gold arrow pinned
to the screen edge points at it and counts down the cells.

---

## The idea

**Sloppiness** is the whole game. Every movement you ask for is delivered with
an error term:

```
effective sloppiness = baseSlop x (1 + sum of every active modifier)

baseSlop   10% on board 1, rising linearly to 35% on board 1000
modifiers  come from hazards, and go BOTH ways
```

Itchy Sweater adds +0.55. Calm Blanket subtracts 0.50. Extra Left Foot adds a
full +1.00. They stack, and the total is clamped to a band that keeps him
hopeless-feeling without being genuinely unplayable.

The error itself has three parts, because pure noise feels like a broken
controller rather than a clumsy child:

1. **Wander** — slow smoothed drift, his aim quietly leaves the line
2. **Jitter** — a constant small tremor, present even standing still
3. **Stumble** — an occasional real trip, with a moment of lost control

You can see the current number on the SLOP bar at the top of the screen, and
you can see it in his arms: limb wobble is driven directly off the same value.

---

## The 100 hazards

All 100 live in `js/hazards.js`, ordered from mildest (index 0) to nastiest
(index 99). A hazard's unlock board is derived from its index, so hazards
arrive in a steadily escalating order — one type on board 1, about fifteen by
board 100, all one hundred by board 945.

| Kind | Count | What it is |
|---|---:|---|
| Stylised walls | 23 | Wall segments that do something on contact — Grease Wall, Mirror Wall, Bubble Wall |
| Floor tiles | 20 | Apply while he stands on them — Slick Ice, Fog Bank, Whirl Pool |
| Items | 31 | Pickups, good and bad — Extra Left Foot, Calm Blanket, Mystery Mush |
| Zaps | 16 | Lethal. He returns to the start of the board — Zap Coil, Buzz Saw, Zap Bee |
| Mobs | 10 | Shove, pull or slop him — Push Puppy, Slop Ghost, The Sloppinator |

Fifteen of them genuinely help. Thirty-one make him sloppier in one way or
another. Every one has a name, a description and an entry in the in-game
Hazards codex, which fills in as you meet them.

### Behaviours

`wall` `tile` `item` `zapStatic` `zapToggle` `zapPatrol` `zapChase`
`zapStrike` `mob` — nine distinct runtime behaviours, so a lethal thing might
sit still, blink on a cycle, walk a route, hunt you, or arm and fire.

---

## Colour: the light blue rule

Everything is colourful. Each of the 100 hazards owns a vivid base hue that
suits what it is — mud is brown, ice is cyan, sugar is hot pink — and each
board draws its floor and walls from its own slice of the colour wheel.

On top of that, **every hazard always wears a light blue signature**: an outer
glow, a rim stroke and an inner core. That signature is what makes a thing
read as "hazard" at a glance, no matter what colour it happens to be.

Two rules keep it working:

- `render.js` `sigShape()` / `sigCore()` are the only way hazards get drawn, so
  the signature can never be forgotten.
- Ordinary walls are actively pushed **at least 50 degrees away** from the
  signature hue on every board, so scenery is never mistaken for danger.

### Wonky Girl

The whole feminine reskin is one constant. In `js/theme.js`:

```js
girl: { sigHue: 336, ... }   // light pink instead of light blue
```

`SB.THEME.setVariant('girl')` re-tints all 100 hazard signatures to light
pink, swaps the character's palette, and repaints the board so the walls move
out of the pink band instead of the blue one. No hazard code changes at all.
There is a button for it on the title screen.

---

## Layout

```
index.html              markup, HUD, screens
css/style.css           phone-first styling, safe areas, thumbstick
js/theme.js             the signature colour, and the boy/girl variants
js/rng.js               seeded deterministic random
js/hazards.js           THE 100 HAZARDS
js/maze.js              board generation, hazard placement, pathing
js/effects.js           what a hazard does to the boy (shared with the tests)
js/player.js            THE SLOPPINESS ENGINE, physics, wall collision
js/entities.js          runtime for patrols, chasers, beams, mobs
js/render.js            canvas drawing and the light blue signature
js/splash.js            the launch splash: the boy running at the camera
js/game.js              loop, input, screens, saving
sw.js                   offline caching
tools/                  dev + test tooling (not shipped to players)
```

Boards are never stored. Board N is regenerated from its number every time,
identically, on every device — layout, hazards and all. The save file only
records how far you got, your best times and which hazards you have met.

---

## Tooling

```bash
node tools/selftest.js     # invariants: catalog, all 1000 boards, slop maths
node tools/sim.js          # headless bot plays a sample of boards
node tools/sim.js 450      # detailed report on one board
node tools/scan.js         # bot plays all 1000 boards, difficulty by decile
node tools/make-icons.js   # regenerate the PWA icons (no dependencies)
```

`sim.js` and `scan.js` drive the **real** physics, hazards and effect engine
through `sim-core.js`, so difficulty is measured rather than guessed. Every
balance number in the game was tuned against `scan.js` output.

### Measured difficulty

A competent bot, given four minutes per board:

| Boards | Cleared | Avg time | Avg zaps |
|---|---:|---:|---:|
| 1-100 | 100% | 12s | 0.0 |
| 201-300 | 99% | 49s | 0.1 |
| 401-500 | 94% | 74s | 0.4 |
| 601-700 | 93% | 85s | 0.6 |
| 801-900 | 81% | 116s | 2.2 |
| 901-1000 | 82% | 114s | 0.9 |

The bot has no memory and never learns a board, so a human should do rather
better. Its purpose is to catch boards that are unfair rather than hard.

---

## Design rules the generator enforces

- Every board has a route from start to exit.
- No hazard sits on the start or exit cell, or anything touching them.
- Every board has a route to the exit that avoids lethal hazards **with a
  one-cell margin either side** — because a boy who veers off line cannot be
  asked for pixel-perfect steering.
- Lethal hazards are capped both as a share of the board and at 10 absolute.
- Every board is larger than the screen in both directions, because the camera
  is welded to the boy and never clamps.
- The walk to the exit scales with progress independently of board size — a
  zap sends you to the start of the board, so a huge map plus one late mistake
  would be punishment rather than challenge.
- Chasers have a leash and stamina, so outrunning one is a real option.

# Wonky Boy — working rules and invariants

Read this before changing anything. It exists because decisions kept getting
re-litigated and the same bug kept coming back.

Scope: this file governs **Wonky Boy only**. It has nothing to do with any
other project in this folder tree, and rules from elsewhere do not apply here.

---

## 1. How to work on this (Garry's rules, 2026-09-01)

These are binding for the duration of the project.

### 1.1 Fix the actual problem

- No masks, overlays, timing delays, cosmetic hiding or other band-aids.
- When a bug shows up in one place, **treat it as a class** and inspect the
  related system for the same failure pattern before declaring it fixed.
- Prefer changes that simplify the build.
- Report the **root cause** and the **verification**, not "the first local
  patch made it look right".

### 1.2 Investigate the whole tree, not the first hit

When Garry asks a question, reports a problem, or says a previous fix made no
visible difference: do not stop at the first matching file or first plausible
cause. Check the whole related system — layered overrides, shared helpers,
generated and staged output, deployment and cache paths where relevant — then
report **what was checked** as well as what was wrong.

### 1.3 Below 90% confidence, stop and ask

If confidence in a fix is under 90%, do not edit or deploy. Explain the
suspected issue, the uncertainty and the options, and ask before proceeding.

Also: **give a time estimate before starting each new task.**

### 1.4 What these rules have already caught

Worth keeping, as evidence they earn their place:

- The corridor direction bug came back **three times**, because nothing
  recorded that "the hallway recedes" was settled. It is now an invariant
  below, with the reasoning, in the code comment and here.
- Applying 1.1 to that fix immediately turned up the *same fault class* in the
  furniture: every piece was oriented from a build-time world-space label
  rather than the projection, so all of it was being drawn into the walls. It
  would not have been found by fixing only the reported symptom.

---

## 2. Product decisions — settled, do not silently revisit

| Decision | Value | Notes |
|---|---|---|
| Name | **Wonky Boy** | Checked: clear on Play. "Crazy Boy" is taken by an existing endless runner. |
| Package | **`com.garry.wonkyboy`** | Permanent. Changing it means a new listing with zero installs and reviews. |
| Packaging | **Bundled native app (Capacitor)**, not a wrapped website | "it should be an app not a site". No domain, no hosting, no assetlinks. |
| Target age | **13+** | Chosen deliberately over all-ages once IAP entered the picture, to stay out of the Families programme. |
| Monetisation | In-app purchases planned | Non-consumables are safe with local saves; consumables require durable storage first. See PLAY-STORE.md §1b. |
| Girl variant | One signature colour swap | See §3.1. |

---

## 3. Technical invariants

Each of these has a reason. Do not change one without reading the reason.

### 3.1 The light-blue signature is the whole Girl variant

Every hazard carries its own vivid colour **plus** a mandatory light-blue rim,
core and glow from `SB.THEME.sig()`. That signature is what marks a thing as a
hazard. Swapping it to pink is the entire Wonky Girl reskin — so no hazard may
ever hard-code its outline colour.

The haunted-house corridor is deliberately warm (candle amber, old oak, faded
crimson) so the light blue stays the only cool thing in frame.

### 3.2 The hallway recedes; the camera faces backwards

The camera runs **ahead** of the boy and **looks at him**. It therefore travels
along the corridor while facing back the way it came, so everything it can see
gets further away and shrinks toward the vanishing point.

Facing the direction of travel sweeps walls out past the viewer. That is a
camera *chasing* him, and it makes a forward-facing boy read as running
backwards. **This has been got wrong three times.** Verify by measurement — a
fixed point's depth must increase over successive frames — never by eye.

### 3.3 Projection uses W/2 on both axes

The textbook road-renderer formula uses screen height for the vertical term.
On a 390x800 phone that stretches the world about 2x vertically: the corridor
becomes a canyon and a suit of armour renders as a sliver. Both axes use W/2.

### 3.4 Orientation comes from the projection, never from a label

`side: 'left'` is fixed when the track is built and describes world space.
Which half of the *screen* that wall lands on depends on the camera facing.
Anything positional — furniture `inward`, wall dressing sides — must derive
its direction from the projected geometry, so it cannot invert when the facing
changes.

### 3.5 Corners are 90 degrees and take at least ten frames

Real world-space geometry, axis-aligned runs, camera pivots through exactly 90
degrees over ~18 frames. Not a curve, not a cut. The junction is a real room
with two solid sides — without them the camera stands at the vertex with both
runs edge-on, every point at depth zero, and the screen goes black.

### 3.6 Boards are deterministic

Board N generates identically from its number alone, on every device, forever.
Nothing about a board is stored; only which boards are cleared.

### 3.7 Sloppiness is the mechanic

10% randomness on board 1, 35% by board 1000, pushed both ways by hazard
modifiers. The gameplay vocabulary is "slop" and stays that way — it is
unrelated to the game being called Wonky Boy.

---

## 4. Build and device rules

- **Gradle cannot build from this path.** `!` is Java's JAR-URL separator, so
  `H:\!!GARRY\! GK WORK\...` fails with an unhelpful "filename, directory name,
  or volume label syntax is incorrect". `tools/build-apk.js` mirrors what
  Gradle needs to a clean temp path, builds there, and copies the artifact
  back. Always build through that script.
- **Never commit the keystore, `keystore.properties` or `local.properties`.**
  The keystore lives outside the repo. Losing it means the app can never be
  updated again.
- **Never clear phone data**, never `pm clear`, never uninstall to "fix" an
  install problem without saying so first — local progress lives in app
  storage.
- **Update the phone only when Garry asks.** Building and committing is fine;
  installing is not automatic.
- Verify claims with numbers where numbers are available. The direction bug was
  only ever settled by measuring depth over frames.

---

## 5. Layout

```
index.html        markup and script order (order matters, no bundler)
css/style.css     all styling
js/theme.js       the signature colour and the boy/girl variants
js/rng.js         seeded deterministic random
js/hazards.js     the 100 hazards
js/maze.js        board generation
js/effects.js     hazard effects, shared by game and simulator
js/player.js      the sloppiness engine
js/entities.js    moving hazards
js/render.js      the game board
js/backbutton.js  Android hardware back
js/splash.js      the splash scene and the boy
js/corridor.js    the 3D corridor: path, camera, projection
js/haunted.js     wall architecture and fittings
js/furniture.js   freestanding furniture
tools/            build, icons, server, self-test, simulator
android/          Capacitor project
```

Docs: `README.md` (how it works), `PLAY-STORE.md` (release checklist and the
reasoning behind the product decisions above).

---

## 6. Known gaps

- **No sound at all.** The biggest quality gap for a shipped mobile game.
- **Saves are local only** — no export, import or cloud save. Blocking for
  consumable IAP.
- **No tutorial** and no settings screen.
- **Release build is unsigned** until the upload keystore exists.
- **No automated visual regression** on the splash; every corridor bug so far
  was caught by Garry looking at it.

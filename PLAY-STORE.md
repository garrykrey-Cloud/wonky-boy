# Wonky Boy — Google Play release checklist

**Current state: a real Android app that builds a Play-ready bundle.**

`node tools/build-apk.js --bundle` produces `dist/app-release.aab`, minified,
resource-shrunk and split by density and ABI. The game is bundled inside the
app, so it needs no server, no domain and no network to run.

The single thing standing between here and a first upload is the **signing
key**, which only Garry can create — see section 3.

Sections 1a and 1b below record why the bundled route was chosen over a
Trusted Web Activity. That decision is made; they are kept as the reasoning,
not as open questions.

---

## Money

| Item | Cost | Required? |
|---|---|---|
| Google Play developer account | **Already owned** — the $25 is a one-off and is paid | Done |
| Hosting | **None needed** — the game ships inside the app | Not required |
| Domain | **None needed** — no origin to verify | Not required |
| Capacitor, Gradle, Android SDK, JDK | Free, and already installed | — |

**Remaining cost to publish: £0.** No ads, no analytics, no server and nothing
to keep running.

The one future cost is **Google's service fee on in-app purchase revenue**
(see section 1b) — a percentage of sales, so it only applies once money is
actually coming in.

---

## 1. Decisions to make first

These are hard to change later, so settle them before anything else.

- [x] **Developer account.** Owned already, so the $25 and the signup are done.
- [ ] **Establish which kind of account it is**, because it decides whether
      section 6 applies at all:
      - *Organisation* account → no testing gate.
      - *Personal*, created **before 13 Nov 2023** → no testing gate.
      - *Personal*, created **on or after 13 Nov 2023** → 12 testers for 14
        days before production.
      Check under Play Console → Settings → Developer account → Account
      details. If apps have already been published from it, the gate has
      almost certainly been satisfied or never applied.
- [x] **Packaging route: bundled native app (Route B).** Decided — "it should
      be an app not a site". Built with Capacitor; the game files ship inside
      the APK. This removes the domain, the hosting and the `assetlinks.json`
      work entirely, and there is no origin that can take the saves with it.
- [x] **Package name: `com.garry.wonkyboy`.** Decided and permanent — it can
      never be changed after the first publish, and changing it in practice
      means a brand new listing with zero installs, ratings or reviews carried
      over.

      Valid and safe: Play requires only that the full string is globally
      unique and is not a reserved prefix such as `com.example.*`. It does not
      verify domain ownership, so the fact that `garry.com` is someone else's
      domain is irrelevant — reverse-DNS is a naming convention here, not a
      claim Play checks. It also does not need to match whatever origin the
      game is eventually served from, if Route A is chosen.

      Must be written identically in every one of these places:
      - the Capacitor / Bubblewrap project config (`applicationId`)
      - `assetlinks.json`, if Route A
      - the Play Console listing, at first upload
- [x] **Target age: 13+.** Decided, after weighing it against the IAP plan.
      Keeps the app out of the Families programme entirely. See section 5a.
- [ ] **Confirm the name is still clear** on Play at submission time. Checked
      August 2026: "Wonky Boy" returned nothing. "Crazy Boy" is taken.

---

## 1a. Wrap a website, or bundle the game inside the app?

Two legitimate routes. Both are explicitly compliant with Play's 2026 webview
rules; what Play rejects is a bare webview of a site with no app value, which
this is not either way.

**Route A — TWA (wrap a hosted site).** The app is a Chrome window pointed at
your origin.

- Needs a permanent HTTPS origin, hosting, and `assetlinks.json`.
- **The origin owns the save data.** `localStorage` is scoped to it. Move the
  game to a different origin later and every player's progress is gone — two
  deployments means two entirely separate sets of saves.
- Change the origin later and you must ship an app update and new assetlinks
  together, or the app renders with a browser address bar.
- Upside: redeploy the website and every installed app updates instantly, with
  no Play review.

**Route B — bundle it (Capacitor or a packaged WebView).** The game's files
ship inside the `.aab`.

- No domain, no hosting, no `assetlinks.json`, nothing to keep alive.
- Saves live in the app's own private storage and survive for as long as the
  app is installed. No origin to lose them to.
- Works offline from the very first launch, with no first-run network fetch.
- Removes any ambiguity about "is this a browser?" under the Families policy,
  which matters now that the target is all ages.
- Downside: each game update goes through Play review instead of a redeploy.

**Recommendation: Route B.** Wonky Boy is entirely static, fully offline, has
no server, no accounts and no network calls at all. Bundling is cheaper (£0,
no domain), more robust, and deletes two of the three permanent decisions
above. The only thing given up — instant updates — barely matters for a game
that is feature complete.

The web version can carry on existing regardless: same source, two build
targets.

---

## 1b. In-app purchases

Decided: the game will have IAP. Three consequences.

### It works on both routes, but not equally

- **Route B (bundled).** Standard Google Play Billing through a Capacitor
  plugin. The well-trodden path.
- **Route A (TWA).** Also genuinely supported, via the **Digital Goods API**
  plus the **Payment Request API**, Chrome 101+. Caveats: product IDs cannot be
  listed from the API, so they must be hard-coded or fetched from a backend;
  the same code opened in an ordinary browser has no Digital Goods API and must
  degrade gracefully; and it only works inside the TWA.

Either is viable. Route B remains the simpler build.

### Google takes a cut

Play charges a service fee on IAP revenue. It is commonly 15% for developers
under roughly $1M of annual earnings and 30% above, with subscriptions lower —
but the exact figure depends on programme enrolment and category, and I have
not verified the current 2026 number. **Check the fee schedule directly before
pricing anything.** Also needed before any money can be taken:

- [ ] Payments profile and bank details in Play Console (Garry does this — not
      something to hand off).
- [ ] Tax information for the selling entity.
- [ ] Confirm the current service fee and enrol in any small-developer
      programme that applies.

### Interaction with the age rating — resolved

All-ages plus IAP would have been the heaviest policy combination on this
list, because the Families Ads and Monetization Policy governs every piece of
commercial content in a child-directed app, not just ads. Choosing **13+**
removes that entirely: IAP now gets ordinary review rather than Families
review.

Still worth building the purchase flow cleanly — no countdown timers, no
pressure tactics, no prompts that could be tapped through by accident. That is
good practice rather than a policy gate now.

### The architecture question: what kind of product?

This decides whether a backend is needed at all.

- **Non-consumable** (unlock all boards, extra characters, cosmetic themes) —
  Play Billing stores the entitlement against the buyer's Google account, so it
  survives reinstalls and new devices on its own. **Safe with the current
  local-only save.** Little new infrastructure.
- **Consumable** (hint tokens, board skips, extra shields) — Play marks it
  consumed, then the balance lives in *our* storage. Today that is
  `localStorage`, which a cleared browser or a lost origin wipes. A player who
  buys 50 hints and loses them will, correctly, ask for a refund. Consumables
  effectively require durable accounts or a server.

**Selling both types is fine** — Play supports it and it is completely normal.
It does not add policy risk. What it changes is that **save durability stops
being optional**.

Non-consumables carry no such risk: the entitlement lives with Google, so
`queryPurchases()` at launch restores everything with no storage of our own.
Consumables are the opposite — Play's involvement ends the moment the purchase
is consumed, and the balance is then entirely our problem.

To sell consumables responsibly, in increasing order of effort:

1. **Move the balance off `localStorage`.** On Route B, Capacitor Preferences
   or SQLite is app-private storage: far more durable than a browser origin,
   survives updates, and is not lost to a cleared browser. Survives everything
   short of uninstall or an explicit clear-data. No server needed. This is the
   minimum bar.
2. **Restore-on-reinstall.** Needs an identity to key on — Play Games Services
   sign-in is the least intrusive option — plus somewhere to keep the balance.
3. **Server-side receipt verification.** Matters far more for consumables than
   for entitlements, because consumables are what gets replayed and forged.
   Requires a backend, which the game does not currently have in any form.

Also mandatory for both types, and easy to miss: **purchases must be
acknowledged within three days** or Google automatically refunds them.

**Recommendation: non-consumables in v1, consumables in v2.** If both must ship
at launch, then item 1 above moves from the "gaps" list in section 7 into the
blocking path, and item 3 should be seriously considered before real money
changes hands.

Separately, and as a design question rather than a compliance one: consumable
hints or board-skips sell relief from the very thing the game is about. Worth
deciding on purpose. Nothing in policy stops it.

### Worth deciding deliberately

One product note: the **Wonky Girl** variant already exists and is currently a
free toggle. If it becomes a paid unlock, that is a choice worth making on
purpose rather than by default.

---

## 2. Hosting — not needed

Route B bundles the game inside the app, so there is **no domain, no hosting
and no `assetlinks.json`**. Nothing to keep alive and nothing to pay for.

The web build still exists and can be served from anywhere for desktop
testing (`node tools/serve.js`), but nothing about the Play release depends
on it.

---

## 3. Packaging — DONE, except the signing key

The Android project exists and builds. `node tools/build-apk.js --bundle`
produces a Play-ready `.aab` in `dist/`.

Already in place:

- [x] Capacitor project at `android/`, application ID `com.garry.wonkyboy`.
- [x] `compileSdk` and `targetSdk` **36 (Android 16)** — meets the
      31 August 2026 requirement for new apps.
- [x] `minSdk` 24.
- [x] Portrait locked.
- [x] Launcher icons at all five densities, plus the adaptive foreground.
- [x] Release build minified and resource-shrunk, with ProGuard keeps for
      Capacitor's reflection. **Verified on the device** — a shrunk release
      was signed with the throwaway debug key, installed and confirmed to run
      before that key was removed again.
- [x] `versionCode` and `versionName` both derived from `package.json`,
      so they cannot drift. 1.2.3 becomes versionCode 10203.
- [x] Bundle splits by language, density and ABI.
- [x] `.gitignore` covering keystores, `keystore.properties` and
      `local.properties`.

### The one remaining step: create the upload key

**This has to be Garry, not Claude.** It means choosing a password, and a
password that an assistant generated and wrote into a file is not a secret.

Run this, somewhere outside the project folder:

```
keytool -genkeypair -v -keystore wonky-boy-upload.jks -keyalg RSA -keysize 4096 -validity 10000 -alias wonky-boy
```

Then copy `android/keystore.properties.example` to
`android/keystore.properties` and fill in the real path and passwords. That
file is gitignored. Point `storeFile` at an **absolute path outside this
project** so the key never ends up in a backup or a zip of the repo.

- [ ] Create the keystore.
- [ ] Fill in `android/keystore.properties`.
- [ ] **Back the `.jks` up somewhere you will still have in five years.**
      Lose it and the app can never be updated again — a new key means a new
      listing, with every install, rating and review left behind.
- [ ] Rebuild: `node tools/build-apk.js --bundle`, and confirm `dist/`
      contains `app-release.aab` with no "UNSIGNED" warning.
- [ ] Enrol in **Play App Signing** at first upload, so Google holds the
      distribution key and your `.jks` is only the upload key.

### A one-time wrinkle when the real key arrives

The build currently on the phone is signed with Android's public debug key.
Android refuses to update an app when the signature changes, so installing the
first properly-signed build means uninstalling first — which clears local
progress on that device once. Worth doing before there is any progress worth
keeping.

---

## 4. Store listing assets

- [ ] **App icon** — 512×512, 32-bit PNG. Already have `icons/icon-512.png`.
- [ ] **Feature graphic** — 1024×500, JPEG or 24-bit PNG, **no transparency**.
      Does not exist yet. The splash art is the obvious source.
- [ ] **Phone screenshots** — 2 to 8, JPEG or 24-bit PNG, 16:9 or 9:16, max
      8 MB each. Can be generated from the game itself.
- [ ] **Short description** — 80 characters.
- [ ] **Full description** — 4000 characters.
- [ ] Optional but worth it: tablet screenshots, a promo video.

---

## 5. Compliance forms

All of these are mandatory and all are unusually easy here, because the game
collects nothing, sends nothing and has no accounts.

- [ ] **Privacy policy** at a public URL. Required even when no data is
      collected. Needs hosting alongside the game.
- [ ] **Data safety form** — declare no collection, no sharing. Must match the
      privacy policy exactly; mismatches get apps suspended.
- [ ] **Content rating questionnaire** (IARC). Expect a very low rating: no
      violence beyond a cartoon character being zapped, no text chat, no
      purchases.
- [ ] **Target audience and content** settings.
- [ ] **Ads declaration** — none.
- [ ] **Developer verification** — newly required in 2026 for accounts behind
      published apps. Expect ID checks.
- [ ] **App access** — confirm no login is needed, so reviewers can play it.

### 5a. Target age 13+ — what it saves

Decided as 13+ once IAP entered the picture. The app stays out of the
**Families programme**, which drops all of the following:

- No Families programme enrolment or age-bracket declarations.
- No COPPA / GDPR-K child-privacy provisions in the privacy policy.
- No certified-ads-SDK restriction and no personalised-advertising ban.
- No Families review of the purchase flow — IAP is reviewed normally.
- No requirement to avoid a browser-like surface, which means **Route A is no
  longer disadvantaged on policy grounds**. The case for Route B now rests
  purely on simplicity and save durability, not on the age rating.

Still required, exactly as for any app:

- [ ] Privacy policy at a public URL.
- [ ] Data safety form — will declare no collection, since the game collects
      nothing. Purchases are handled by Google, not by us.
- [ ] Content rating questionnaire. Expect a low rating regardless: the only
      "violence" is a cartoon boy being zapped and restarting the board.
- [ ] Set target audience to 13+ and keep the store listing free of anything
      that reads as aimed at younger children.

Note the trade-off taken: 13+ narrows the audience for what is, in content
terms, a game a seven-year-old could happily play. That was accepted in
exchange for far less policy surface around the purchases.

---

## 6. The testing gate — may not apply

**Skip this whole section** if the account is an organisation account, or a
personal one created before 13 Nov 2023. Confirm which before planning around
it; it is the difference between publishing this week and publishing in three.

If the account is personal and was created on or after 13 Nov 2023:

- [ ] Run a **closed test** with **at least 12 testers**, opted in
      **continuously for 14 days**, before production access can be requested.
- [ ] Line up 12 real people with Google accounts in advance — this is the
      single most common thing that stalls a first release. The 14 days only
      start once 12 testers are actually opted in.

An organisation account skips this entirely.

---

## 7. Gaps in the game itself

Not Play requirements, but things a published game is expected to have. Listed
roughly by how much they matter.

- [ ] **Sound.** There is none at all — no footsteps, no zap, no win jingle.
      This is the single biggest quality gap for a shipped mobile game.
- [ ] **Android back button.** In a TWA the hardware back button currently
      exits the app outright. It should back out through screens — pause from
      play, menu from pause — and only prompt to exit at the top.
- [ ] **Save durability.** Progress lives in `localStorage` for that origin.
      Clearing Chrome data or moving device loses 1000 boards of progress and
      there is no export, import or cloud save. Worth solving before people
      have real progress to lose.
- [ ] **First-run tutorial.** Board 1 teaches nothing explicitly; the sloppy
      controls are learned by surprise.
- [ ] **Settings screen.** Volume, rumble, variant and a reset are currently
      scattered or missing.
- [ ] **Landscape.** The manifest locks portrait. Fine, but confirm it behaves
      on tablets and foldables.
- [ ] **Accessibility.** No colourblind consideration for the hazard signature,
      which is the main "this is dangerous" cue. Shape already varies by
      behaviour, which helps.
- [ ] **Store-facing polish.** An "about" or credits screen with the version
      number makes support and review easier.

---

## Suggested order

1. Hosting + assetlinks (section 2) — unblocks everything.
2. Sound and the back button (section 7) — the two things reviewers and
   players notice immediately.
3. Package and side-load to the phone (section 3) — proves the wrapper works.
4. Assets and compliance forms (sections 4 and 5) — can be done in parallel.
5. Closed test with 12 testers (section 6) — start early, it costs 14 days.
6. Production release.

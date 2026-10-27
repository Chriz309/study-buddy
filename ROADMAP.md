# Study Buddy — roadmap, backlog & design decisions

Handoff between build sessions. What's done, what's next, how to add content.

## ⭐ CURRENT DIRECTION (v0.3, 2026-10-27) — READ FIRST
Chris rejected hand-coded SVG art ("looks like MS Paint"). We pivoted to a real
art + animation pipeline, and **focused on Blob only** until it's perfect. Other
characters were removed from the catalog and return later via the gacha.

**The pipeline (proven, in use):**
1. Generate the character with **Canva** `mcp__Canva__generate-image` — ask for a
   FACELESS body (so the face can animate), illustrated/kawaii, plain white bg.
   The result PNG is saved locally under the session tool-results dir.
2. **Cut out the background locally** with Python (scipy flood-fill from the edges —
   keeps interior highlights). No Canva Pro needed. See scratchpad/cutout.py.
   (Canva `remove-background` requires a paid plan — don't use it.)
3. Bake the cut-out PNG as a **data URI** in `src/renderer/art.js` (WebGL taints
   file:// textures, so data URI is required).
4. Render with the **WebGL soft-body mesh** (`src/renderer/jelly.js`) for
   jiggle/squash/stretch, plus a **separately animated vector face**
   (`src/renderer/face.js` — blink, glance, happy/surprised/sleepy, talk) that
   tracks the body's deformation.

**Architecture now:**
- `engine.js` = logic only (roaming position + behaviour state + event hooks).
- `app.js` = owns the WebGL body + face, maps engine events → squash/expressions/
  speech/particles. Full-screen transparent canvas overlay.
- Controls are **tray-only** (the overlay right-click menu was buggy and removed).
- Roam-all-monitors defaults ON.

**To preview art/animation without Electron:** render in headless chromium with
`--use-gl=angle --use-angle=swiftshader` and screenshot frames → GIF (see
scratchpad/capture*.js). Always preview + send Chris a GIF before mass work.

**GitHub:** repo is `Chriz309/study-buddy` (attached, pushable). Tag push is blocked
by proxy policy — the CI publishes the release on a **manual "Run workflow"**
(Actions tab) instead. electron-updater auto-updates installed copies.

---


## DONE — Milestone 1 (foundation)
Electron overlay (transparent, always-on-top, click-through except over pet); tray;
multi-monitor world; physics + non-repeating behaviour scheduler; drag/throw/pat;
idle economy (Sparks accrue in main, persisted); Shop/Care/Behaviour/About; start-on-boot;
single-instance; auto-update pipeline + CI.

## DONE — Milestone 1.5 (this session)
- **Bug fixes:** right-click menu now closes (full-screen backdrop catches the click);
  tray has a clear Show/Hide; **watchdog** forces a new decision if the FSM is ever
  idle >7s (no more freezing); pet confined to the **primary monitor by default**
  (fixes the "vanishes on 2nd screen" paint glitch) with a "Roam across all monitors"
  toggle for those who want it.
- **Removed** autonomous cursor-chasing (per request).
- **Tray-centric controls** + **Open the Drive** shortcut (tray + right-click menu).
- **Art upgrade:** ink outlines, shaded belly, highlight, cuter faces — no more "paint".
- **Expression:** blink + look/smile/surprise/talk (mouth moves while speaking).
- **New movement styles:** `fly` (bird swoops, wings flap), `swim` (dolphin lurks low,
  leaps in arcs with a splash). Alongside `walk` and `float`.
- **Chattiness** slider; the ghost is scaled down so it's not too talkative.
- **Rarities** (common→legendary) in metadata + shown on shop cards.
- **TEST build:** every implemented character is owned (search `TEST_UNLOCK_ALL` in
  catalog.js — revert to `['blob']` for release so the gacha hands them out).
- 5 characters live: Blob(walk), Pib(cat/walk), Chirp(bird/fly), Boo(ghost/float),
  Finn(dolphin/swim). Added WhatsApp to the bug-report contact.

## NEXT — prioritised backlog (from Chris's big brief)

### M2 — the gacha + rarity economy  ← do this next
- **Gumball/egg machine:** characters are ONLY obtainable via a random pull that costs a
  lot of Sparks. **No duplicate characters.** Pull odds by rarity (see numbers below).
  A character pull that would dupe instead gives a consolation (Sparks or a cosmetic).
- **Egg hatch:** a pull delivers an **egg that hatches** (animation) into the new sprite.
- **Costume store (separate page):** per owned sprite — hats/accessories, bought with
  Sparks (not random). Cosmetics are the Sparks sink; characters are the rare thrill.
- Keep `feed`/levels as the earn-rate booster.

### M3 — multi-pet
- "Show all my owned pets at once," each doing its own thing. Engine → support N pets
  (array of Pet instances sharing the world). Setting `showAll` already stubbed.

### M4 — special-ability characters
- Portal-opener (steps through a portal, reappears elsewhere), bubble-blower, etc.
- Movement/ability hooks per character. Original designs only (see IP note).

### M5 — screen-interaction (the big "wow")  — hardest; stage it
- v1 (safe, achievable): the pet reacts to **screen regions** we can read without moving
  anything — e.g. perches on the top edge of the focused window, parachutes down, sits a
  campfire on the taskbar, puts a "ladder"/magnifying-glass prop near the active window.
  Uses window-rect APIs (read-only) + our own overlay props. **Never moves real files.**
- Battery/Wi-Fi/sound **tray-icon gags**: pet pokes the battery icon and gets "shocked",
  etc. Needs the icon's screen position (OS APIs / computer-use-style region) — permission
  prompt kept smooth. Overlay-only; nothing real is changed.
- "Moving taskbar icons" = **overlay illusion only**, always reverted. Flagged as advanced.

### M6 — engagement systems
- **Hidden egg-codes in past papers:** redeem in-app → free sprite/cosmetic. Anti-cheat:
  rate-limit redemptions (e.g. 1/day), flag bursts, server-validated codes. Needs a
  lightweight backend (Apps Script + a Sheet, or Supabase — Chris already uses Supabase).
- **Monthly game update:** new characters + new codes pushed via the normal auto-update.
- **Paper submission → free sprite:** user submits a past paper not in the Drive; Claude
  vets + files it; grants a code. Needs an intake (form/Drive folder) + a review step.
- **Stats dashboard in the Drive:** active players, pulls, etc. Anonymous telemetry →
  a Sheet/Supabase → a simple dashboard doc for Chris.

### M7 — GitHub + one-file update-and-open  (NEEDS CHRIS)
- Chris wants "run one file that updates and opens." The NSIS install already auto-updates
  on launch — but that requires a GitHub repo with Releases + the CI (already written).
  Blocker: pushing needs Chris's GitHub account (the sandbox can't push). Options:
  (a) Chris creates an empty `study-buddy` repo and gives access / runs two git commands;
  (b) we drive his browser to set it up. Then every launch self-updates.

## Design decisions / recommendations (Chris asked for input)
- **IP / copyright:** CANNOT ship Spider-Man, Iron Man, Mario, Pokémon, Pickle Rick, etc.
  (trademarked). We make **original** characters inspired by the *genres* — a caped hero,
  original "mon"-style critters, a mecha, a slime, etc. High quality, all ours.
- **Idle timing (8am–8pm ≈ 12h/day):** target ~**4–6 days** of idling per character pull
  early on, stretching as the roster grows. Proposed: pull costs scale, base earn ~2–3
  Sparks/s. A pull ≈ 50k Sparks ⇒ ~1 week at 12h/day — the "sweet spot" Chris wanted.
  Feeding + more owned pets speed it up, rewarding engagement. (Tunable constant.)
- **Pull odds (per pull):** common 55 / uncommon 27 / rare 13 / unique 4 / legendary 1 (%).
  No dupes: once all of a tier owned, its weight redistributes.
- **Art ceiling:** hand-built SVG (current) scales to cute, clean, animated vector pets.
  For truly "high-end sprite" shading we could switch specific characters to multi-frame
  PNG sprite sheets later; SVG keeps file size tiny and animation flexible for now.

## How to add a character
1. `src/shared/catalog.js` — entry (id,name,tier,move,rarity,cost,personality,blurb); set
   `implemented:true`. (TEST build auto-owns implemented ones.)
2. `src/renderer/characters.js` — `CHAR_ART[id] = { move, accent, svg, lines }` using the
   shared classes: `.body .body2 .shine .eye .glint .mouth/.mouthO/.eyeline .cheek .foot
   (.footL/.footR) .ear/.ear2 .tail/.tailcat .fin .wing .halo .nose .antenna/.antennaTip
   .whisker .leg`.
3. `src/renderer/index.html` (inline `<style>`) — add `.char-<id> { --c1 --c2 --accent --ink }`.
4. `src/settings/settings.js` — add an emoji to `EMOJI`.
5. Test via `run-studybuddy.bat` (quit any running copy first — single instance).

## Known limitations to revisit
- Dolphin "below the screen" currently sits low in the work area, not truly off-screen
  (needs clipping below the taskbar). Good enough for now.
- Multi-monitor roaming can flicker on some GPUs (hence default off); real fix = one
  overlay window per display (bigger refactor).
- Not code-signed → first-run SmartScreen warning (needs a cert; Chris's call).
- CSS is inlined into index.html/settings.html (external stylesheet was blocked on
  Chris's machine). Keep editing the inline `<style>` blocks.

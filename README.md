# Study Buddy ⚡

A little desktop companion that lives on your screen while you study — part of the
**“Study time with Chris”** project for NWU students. It roams freely across your
desktop (and every monitor), reacts to your cursor, can be dragged and patted, and
slowly earns **Sparks** you spend to unlock new characters.

Built for — and with — **Christopher Blair Hook**.

---

## Download & run (no coding needed)

Grab the latest build from the **[Releases](../../releases)** page:

- **`StudyBuddy-x.y.z-Setup.exe`** — installs it, adds a Start-menu/desktop shortcut,
  and keeps itself up to date automatically.
- **`StudyBuddy-x.y.z-portable.exe`** — just double-click to run, nothing installed.

Then look for the ⚡ icon in your system tray (bottom-right, near the clock) to open
**Shop & Settings**.

> Windows may show a SmartScreen warning the first time because the app isn’t
> code-signed yet. Click **More info → Run anyway**.

### Mac

- **`StudyBuddy-x.y.z-mac-arm64.dmg`** — Apple Silicon Macs (M1, M2, M3, M4…).
- **`StudyBuddy-x.y.z-mac-x64.dmg`** — older Intel Macs.
  (Not sure? Apple menu → **About This Mac**: “Chip: Apple M…” = arm64, “Processor: Intel” = x64.)

Open the .dmg and drag **Study Buddy** into **Applications**. The first time, macOS
will say it’s from an unidentified developer because the app isn’t Apple-signed:
**right-click the app → Open → Open**. (On newer macOS: try to open it once, then
go to **System Settings → Privacy & Security** and click **Open Anyway**.)

Look for the ⚡ icon in the menu bar (top-right) to open **Shop & Settings**.
On Mac, new versions show a pop-up with a **Download** button instead of
installing silently — just drag the new version over the old one in Applications.
Your Sparks and buddies are kept.

---

## What it does

- **Lives on the real desktop** — a transparent always-on-top layer, not a window.
- **Roams on its own** — walks, sits, naps, jumps, climbs the screen edges, peeks in,
  and wanders across multiple monitors. A weighted scheduler keeps it from looping.
- **Reacts to you** — chases and grabs the cursor, can be **dragged and thrown**, and
  **patted** (a click) for a few Sparks.
- **Idle game** — earns Sparks continuously (even while the window is closed). Owning
  more characters and **feeding** them raises your earn rate.
- **Characters** — start as **Blob**, then unlock a cat, a ghost, and a growing roster
  of critters, exotic animals and sci-fi/fantasy buddies. Each walks or floats and has
  its own personality and voice lines.
- **Personality & mischief** — chill / hyper / sleepy / naughty, plus a mischief slider
  for how cheeky it gets.
- **Fits in** — size, speed, speech bubbles, reduce-motion, start-on-boot, and pause.

---

## Run from source (for development)

```bash
npm install
npm start
```

### Build installers

```bash
npm run dist      # full installers into dist/  (see electron-builder.yml)
npm run pack      # quick unpacked build for testing
```

### Cut a release (auto-update enabled)

1. In `electron-builder.yml`, set `publish.owner` to your GitHub username.
2. Bump `version` in `package.json`.
3. Tag and push:
   ```bash
   git tag v0.1.0
   git push --tags
   ```
   The GitHub Action builds on Windows and macOS runners and publishes the
   installers to a Release. Installed copies then update themselves via `electron-updater`.

---

## How it’s put together

```
src/
  main/        Electron main process
    main.js      overlay + settings windows, tray, economy, cursor stream, updates, IPC
    store.js     JSON save file (Sparks, unlocks, levels, settings)
    preload.js   safe bridge (contextIsolation) → window.buddy
  renderer/    the pet overlay (transparent, click-through except over the pet)
    index.html
    style.css    pet rig + per-character palettes + pose animations
    characters.js  SVG art + voice lines, keyed by id
    engine.js    physics, state machine, non-repeating behaviour scheduler
    app.js       bootstrap + input + IPC glue
  settings/    the Shop & Settings window (shop, care, behaviour, about)
  shared/
    catalog.js   single source of truth: characters, costs, defaults
```

Adding a character = one entry in `shared/catalog.js` + matching art in
`renderer/characters.js` + a palette in `renderer/style.css`. See `ROADMAP.md`.

---

*Sparks, unlocks and settings are saved locally on your computer.*

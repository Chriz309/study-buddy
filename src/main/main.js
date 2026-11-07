'use strict';
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, shell, dialog, powerMonitor, desktopCapturer } = require('electron');
const path = require('path');
const fgProbe = require('./fgprobe');   // Windows foreground-window + fullscreen probe (one long-lived PowerShell)
const fsdetect = require('./fullscreen');   // pure: which displays are covered by a fullscreen app
const store = require('./store');
const engine = require('./engine');
const { CHARACTERS, CURRENCY, DEV_TOOLS, GUMBALL_COST, RARITIES, PERSONALITIES, characterById, rollPool, lockedIds, tierUnlocked, pickWeighted } = require('../shared/catalog');
const fs = require('fs');
const geo = require('../shared/geometry');
const watchdog = require('./watchdog');
const scripts = require('./scripts');
const toy = require('./toy');
const devrun = require('./devrun');
const mlogic = require('./mischief/logic');       // desktop mischief (Windows overlay illusions): see src/main/mischief/
const { createManager } = require('./mischief/manager');
const { createHost } = require('./mischief/host');
const { createProbe, killAll: killProbes } = require('./mischief/probe');
const MGAGS = require('../mischief/gags');

// --- dev mode (STUDYBUDDY_DEV=1): tray test items, a scripted command run and a log file. Off in
// normal use; it also keeps test runs from registering a login item (see applyLoginItem).
// Dev mode is ON only for (a) a dedicated dev build (flag baked in at build time, see electron-builder.dev.yml;
// public builds never have it) or (b) an UNPACKAGED run with STUDYBUDDY_DEV=1. The env var is ignored in any packaged build.
const DEV_BUILD = require('../../package.json').studyBuddyDevBuild === true;
const DEV = require('../shared/devmode').isDevMode({ devBuildFlag: DEV_BUILD, isPackaged: app.isPackaged, env: process.env });
const economy = require('../shared/devmode').createEconomy(DEV);   // dev builds: infinite Sparks
const TOOLTIP = DEV_BUILD ? 'Study Buddy DEV BUILD' : 'Study Buddy';
// the dev build keeps its own save/profile and single-instance lock so it can run beside the live app without touching its data
if (DEV_BUILD) { try { app.setPath('userData', require('path').join(app.getPath('appData'), 'Study Buddy Dev')); } catch {} }
// dev builds always log to <userData>/dev.log (ids and reasons only: never screen contents or text); STUDYBUDDY_DEV_LOG overrides the path
const DEV_LOG = DEV ? (process.env.STUDYBUDDY_DEV_LOG || require('path').join(app.getPath('userData'), 'dev.log')) : null;
const DEV_LOG_MAX = 200 * 1024; let devLogWrites = 0;
function devLog(...a) {
  const line = new Date().toISOString() + ' ' + a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  if (DEV_LOG) { try {
    if (devLogWrites++ % 25 === 0) { try { if (fs.statSync(DEV_LOG).size > DEV_LOG_MAX) fs.renameSync(DEV_LOG, DEV_LOG + '.1'); } catch {} }   // rotate at ~200 KB (one previous file kept)
    fs.appendFileSync(DEV_LOG, line + '\n'); } catch {} }
  if (DEV) console.log(line);
}
if (DEV) store.setErrorHook((kind, code, file) => devLog('store ' + kind + ' ' + code + ' ' + file));
function logError(where, e) {
  const msg = where + ': ' + (e && e.stack || e);
  try { console.error(msg); } catch {}
  if (DEV) devLog('ERROR', msg);
}
// An uncaught exception in main used to pop Electron's modal error box and could freeze the
// pet loop; log it and keep going (every timer below is also wrapped).
process.on('uncaughtException', (e) => logError('uncaughtException', e));
process.on('unhandledRejection', (e) => logError('unhandledRejection', e));

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const INDEX = path.join(__dirname, '..', 'renderer', 'index.html');
const isDev = !app.isPackaged;
const DRIVE_URL = 'https://drive.google.com/drive/folders/1vPoKKqMPH1ZbTRkgT_10apMRS_mb3W7c';
const IS_MAC = process.platform === 'darwin';
// macOS can't self-install updates without a paid Apple Developer ID signature,
// so on Mac we announce the new version and open the download page instead.
const RELEASES_URL = 'https://github.com/Chriz309/study-buddy/releases/latest';

let petWin = null;          // ONE small sprite-sized window that moves (not a full-screen overlay)
let settingsWin = null;
let tray = null;
let grabOff = null;         // {dx,dy} cursor offset while dragging
let dragStartAt = 0, dragPingAt = 0;   // drag heartbeat (see watchdog)
let update = { status: 'idle', info: null };

// Keep the software WebGL fallback (SwiftShader). Newer Chromium (Electron 32+) no longer
// falls back automatically when a PC's graphics driver is blocklisted — old laptops, some
// lab PCs, VMs — which would leave the pet invisible. It's flagged "unsafe" only for
// untrusted websites; Study Buddy only ever loads its own local pages.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

// Software-graphics safety net. If a PC's graphics process can't start (broken driver,
// remote desktop, some VMs) Electron 31 quietly fell back to software rendering, but
// newer Electron doesn't — the pet would be invisible. We detect that once after start-up,
// remember it in a small flag file and relaunch in software mode (and stay in it on that PC).
const SOFTWARE_GL_FLAG = path.join(app.getPath('userData'), 'use-software-graphics');
const useSoftwareGL = (() => { try { return require('fs').existsSync(SOFTWARE_GL_FLAG); } catch { return false; } })();
if (useSoftwareGL) { app.commandLine.appendSwitch('use-gl', 'angle'); app.commandLine.appendSwitch('use-angle', 'swiftshader'); }
function checkGraphicsOnce() {
  if (useSoftwareGL) return;
  let webgl = '';
  try { webgl = String((app.getGPUFeatureStatus() || {}).webgl || ''); } catch { return; }
  if (!webgl || webgl.startsWith('enabled')) return;
  try { require('fs').writeFileSync(SOFTWARE_GL_FLAG, `WebGL was "${webgl}" on ${new Date().toISOString()}\n`); } catch { return; }
  try { store.saveNow(); } catch {}
  app.relaunch(); app.exit(0);
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { bringBuddyBack(); openSettings(); });

// --- single moving pet window -------------------------------------------
let userHidden = false;   // user hid the buddy via the tray/GUI

// Window box around the sprite: room above for the parachute, speech bubble and
// food-drop; sprite sits near the bottom-centre. All in DIP.
function petBox(M) {
  const Wd = Math.max(Math.round(M * 1.6), 240);
  const Ht = Math.max(Math.round(M * 2.45), 210);
  const localX = Math.round((Wd - M) / 2);
  const localY = Ht - Math.round(M * 0.22) - M;   // sprite top within the window
  return { Wd, Ht, localX, localY };
}
function createPetWindow() {
  if (petWin && !petWin.isDestroyed()) return;
  const { Wd, Ht } = petBox(engine.size);
  petWin = new BrowserWindow({
    width: Wd, height: Ht, x: 0, y: 0,
    transparent: true, frame: false, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, show: false, fullscreenable: false,
    type: process.platform === 'win32' ? undefined : 'panel',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  petWin._interactive = false; petWin._localX = 0; petWin._localY = 0; petWin._shown = true;
  petWin.setAlwaysOnTop(true, 'screen-saver');
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  petWin.setIgnoreMouseEvents(true, { forward: true });
  petWin.loadFile(INDEX);
  // show once so the window exists; after this we only fade opacity, never hide()
  petWin.once('ready-to-show', () => { petWin.showInactive(); applyVisibility(); petWin.webContents.send('state', fullState()); });
  petWin.on('closed', () => { petWin = null; });
  petWin.on('session-end', () => { try { store.saveNow(); } catch {} });   // Windows logoff / shutdown
  // A crashed / hung / failed-to-load renderer leaves a transparent window that draws nothing
  // (the "sprite stopped responding" look). Reload it; if it keeps dying, rebuild the window.
  const wc = petWin.webContents;
  wc.on('render-process-gone', (_e, d) => { logError('pet renderer gone', JSON.stringify(d)); reloadPetSoon(); });
  wc.on('unresponsive', () => { logError('pet renderer unresponsive', ''); reloadPetSoon(); });
  // code -3 = ABORTED (a navigation superseded by another): not a failure
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain && code !== -3) { logError('pet did-fail-load', code + ' ' + desc); reloadPetSoon(); } });
}
// Reload loops are capped: exponential back-off, then give up (the tray keeps working; "Bring buddy back" retries).
const reloadGov = require('../shared/backoff').createGovernor({ base: 1000, max: 30000, cap: 5 });
let _reloadPending = false, petGaveUp = false;
function reloadPetSoon() {
  if (_reloadPending) return;
  const r = reloadGov.next(Date.now());
  if (r.give) {
    petGaveUp = true; logError('pet window', 'giving up after repeated renderer failures');
    const w = petWin; petWin = null; try { if (w && !w.isDestroyed()) w.destroy(); } catch {}
    if (tray) tray.setToolTip(TOOLTIP + ' (graphics problem: use "Bring buddy back" to retry)');
    return;
  }
  _reloadPending = true;
  setTimeout(() => {
    _reloadPending = false;
    if (!petWin || petWin.isDestroyed()) return;
    try {
      if (r.attempt >= 4) { const w = petWin; petWin = null; w.destroy(); createPetWindow(); }   // reloads keep failing: fresh window
      else petWin.webContents.reload();
      if (petWin) petWin._shown = null;
    } catch (e) { logError('reloadPet', e); }
  }, r.delay);
}
// visible unless the user hid it, or the sprite's RECT touches a display covered by a fullscreen app (not just its centre)
function petShouldShow() { return !userHidden && !spriteTouchesFullscreen() && !petBoxTouchesFullscreen(); }
// the window box holds the speech bubble and can overhang the sprite: a bubble must not poke onto a movie from the neighbouring monitor
function petBoxTouchesFullscreen() {
  if (!fsDisplays.size) return false;
  const { Wd, Ht, localX, localY } = petBox(engine.size);
  for (const d of screen.getAllDisplays()) if (fsDisplays.has(d.id) && geo.overlapArea(engine.pos.x - localX, engine.pos.y - localY, Wd, Ht, d.bounds) > 0) return true;
  return false;
}
function spriteTouchesFullscreen() {
  if (!fsDisplays.size) return false;
  for (const d of screen.getAllDisplays()) if (fsDisplays.has(d.id) && geo.overlapArea(engine.pos.x, engine.pos.y, engine.size, engine.size, d.bounds) > 0) return true;
  return false;
}
// Toggle visibility WITHOUT hide()/show(): on Windows that cycle resets the
// transparent/click-through window styles and left the pet un-clickable after
// exiting fullscreen. Instead we fade opacity + drop topmost so it neither shows
// nor interferes, while the window (and its mouse styles) stay intact.
function applyVisibility() {
  if (!petWin || petWin.isDestroyed()) return;
  const vis = petShouldShow();
  if (petWin._shown === vis) return;
  petWin._shown = vis;
  try {
    if (vis) {
      petWin.setOpacity(1); petWin.setAlwaysOnTop(true, 'screen-saver');
      petWin.setIgnoreMouseEvents(true, { forward: true }); petWin._interactive = null; petWin._iTick = 99;
    } else {
      petWin.setIgnoreMouseEvents(true, { forward: true }); petWin.setAlwaysOnTop(false); petWin.setOpacity(0);
      resetInteraction(); engine.cancelScript('hidden');   // a drag/antic must not keep running (or resume) behind a hidden window
      if (petWin.webContents && !petWin.webContents.isDestroyed()) petWin.webContents.send('pet', { show: false });
    }
  } catch {}
}
function showBuddy() { userHidden = false; if (!petWin || petWin.isDestroyed()) createPetWindow(); applyVisibility(); scheduleAntic(); }
function hideBuddy() { userHidden = true; applyVisibility(); }
function overlaysVisible() { return !userHidden; }

// The engine's world: every display, except the ones a fullscreen app covers (so the sprite never roams onto them).
// If every display is covered the full list stays (the sprite is hidden and idle then, see loopOnce).
function worldDisplays() { const all = screen.getAllDisplays(), free = all.filter(d => !fsDisplays.has(d.id)); return free.length ? free : all; }
function syncWorld() { engine.setWorld(worldDisplays()); }
function allDisplaysFullscreen() { const all = screen.getAllDisplays(); return all.length > 0 && all.every(d => fsDisplays.has(d.id)); }

// --- engine loop (60fps): tick, route pet to its monitor, manage mouse capture
function startEngine() {
  const s = store.get().settings;
  engine.init({
    state: () => {},                       // state is sent every frame in the pet packet
    event: (type, data) => {
      if (type === 'pet') store.set({ sparks: +(store.get().sparks + 1).toFixed(3) });
      if (petWin && !petWin.isDestroyed()) petWin.webContents.send('petEvent', Object.assign({ type }, data || {}));
    },
    toy: (cmd) => { try { toy.handle(cmd); } catch (e) { logError('toy', e); } },   // chase toy lives in its own window
  }, Date.now());
  engine.pos = { x: 0, y: 0 };
  syncWorld();
  // start somewhere sensible on the primary
  const pb = screen.getPrimaryDisplay().workArea;
  engine.pos = { x: pb.x + pb.width * 0.4, y: pb.y + pb.height - engine.size };
  syncEngineSettings(); syncActiveChar();

  let calmSkip = 0;
  setInterval(() => { try { loopOnce(); } catch (e) { logError('engine loop', e); } }, 1000 / 60);
  function loopOnce() {
    if (!petWin || petWin.isDestroyed()) return;
    if (fsDisplays.size && allDisplaysFullscreen()) { applyVisibility(); return; }   // every display is covered: hidden and idle, nothing moves
    // CPU saver: when the pet is resting (sitting / idle / asleep, not being dragged
    // or carried along) run this loop at 20fps instead of 60. Anything that moves
    // — walking, falling, jumping, climbing, dragging — still gets the full 60fps.
    const calm = !engine.dragging && !grabOff && !engine.script && (engine.state === 'sleep' || engine.state === 'sit' || engine.state === 'idle')
      && Math.abs(engine.vel.x) < 1 && Math.abs(engine.vel.y) < 1;
    if (calm && (++calmSkip % 3)) return;
    if (!calm) calmSkip = 0;
    const now = Date.now();
    const cur = screen.getCursorScreenPoint();
    engine.setCursor({ x: cur.x, y: cur.y }); mischiefActivity.note(cur.x, cur.y, now);   // the only per-frame cost of desktop mischief: one EMA update
    if (grabOff && engine.dragging) engine.dragTo(cur.x - grabOff.dx + engine.size / 2, cur.y - grabOff.dy + engine.size / 2);
    engine.tick(now);
    if (fsDisplays.size && spriteTouchesFullscreen()) moveOffFullscreen();   // it wandered or was dropped onto a covered display
    applyVisibility();
    if (!engine.script && toy.isActive()) toy.destroy();     // never leave the toy window behind
    if (petWin._shown) { positionPetWindow(); sendPet(); setPetInteractive(cur); keepOnTop(); }
  }
}
function positionPetWindow() {
  try {
    if (!petWin || petWin.isDestroyed()) return;
    const { Wd, Ht, localX, localY } = petBox(engine.size);
    let x = Math.round(engine.pos.x - localX), y = Math.round(engine.pos.y - localY);
    if (![x, y, Wd, Ht].every(Number.isFinite)) return;
    // clamp to a sane integer range so an out-of-range value can never trip the
    // native setBounds/setPosition ("conversion failure") and crash main.
    x = Math.max(-32000, Math.min(32000, x)); y = Math.max(-32000, Math.min(32000, y));
    const w = Math.max(1, Math.min(32000, Wd)), h = Math.max(1, Math.min(32000, Ht));
    const b = petWin.getBounds();
    petWin._localX = localX; petWin._localY = localY; petWin._want = { x, y, width: w, height: h };
    if (b.width !== w || b.height !== h) petWin.setBounds({ x, y, width: w, height: h });
    else if (b.x !== x || b.y !== y) petWin.setPosition(x, y);
  } catch (e) { /* transient bad value — skip this frame rather than crash */ }
}
let _lastPx = null, _lastPt = 0, _vx = 0;
function sendPet() {
  // horizontal speed (DIP/s, smoothed) so the renderer can lock the walk cycle to distance
  const now = Date.now();
  if (_lastPx != null && now > _lastPt) { const v = (engine.pos.x - _lastPx) / ((now - _lastPt) / 1000); if (Number.isFinite(v)) _vx += (v - _vx) * 0.3; }
  _lastPx = engine.pos.x; _lastPt = now;
  const mf = engine.mischief;   // set only while a mischief script runs: clip line (peeking out of the taskbar) and tilt
  petWin.webContents.send('pet', { show: true, x: petWin._localX, y: petWin._localY, size: engine.size, state: engine.state, facing: engine.facing, vx: Math.round(_vx),
    clip: mf && mf.clipY != null ? Math.round(mf.clipY - (engine.pos.y - petWin._localY)) : null, rot: mf && mf.rot ? Math.round(mf.rot) : 0 });
}
function setPetInteractive(cur) {
  if (!petWin || petWin.isDestroyed() || !petWin._shown) return;
  const pad = Math.max(18, engine.size * 0.5);
  const want = engine.dragging || engine.hitTest(cur.x, cur.y, pad);
  // Re-assert periodically (every ~0.5s) even when unchanged: a setBounds / DPI
  // change / focus event can silently drop the mouse-passthrough style, which is
  // what left the pet "stuck, can't interact". This self-heals it within 0.5s.
  petWin._iTick = (petWin._iTick || 0) + 1;
  if (petWin._interactive !== want || petWin._iTick >= 30) {
    petWin._interactive = want; petWin._iTick = 0;
    if (want) petWin.setIgnoreMouseEvents(false); else petWin.setIgnoreMouseEvents(true, { forward: true });
  }
}
// keep the pet above other windows; Windows can silently drop topmost
function keepOnTop() {
  petWin._topTick = (petWin._topTick || 0) + 1;
  if (petWin._topTick >= 90) { petWin._topTick = 0;
    try { petWin.setAlwaysOnTop(true, 'screen-saver'); if (petWin.moveTop) petWin.moveTop(); } catch {}
  }
}
function syncEngineSettings() {
  const s = store.get().settings;
  engine.setSettings({ speed: s.speed, personality: s.personality, mischief: s.mischief, stayPut: !!s.stayPut, reduceMotion: !!s.reduceMotion });
  if (s.antics === false) engine.cancelScript('settings');
  engine.setSize(s.size || 140);
}
let _lastActive = null;
function syncActiveChar() {
  const id = store.get().active, c = characterById(id);
  if (id !== _lastActive) { engine.cancelScript('char'); _lastActive = id; anticPlanner.reset(Date.now()); devLog('character', id); }
  engine.setMoveType(c && c.move ? c.move : 'walk'); engine.setGait(c && c.gait ? c.gait : 'hop');
  scheduleAntic();
}

// --- window awareness + fullscreen detection ---------------------------------
// ONE probe (fgprobe.js) per poll returns the foreground window, the shell's notification state and the z-ordered window list, all in
// physical pixels. fullscreen.js decides which displays a fullscreen app covers; the foreground rect also gives the engine a "ledge".
// Fails safe: any error/uncertainty -> no ledge; a failed probe HOLDS the last fullscreen state (capped at ~2 minutes, see fullscreen.createTracker).
const OWN_PIDS = new Set([process.pid]);
const fsTracker = fsdetect.createTracker();
let fgBusy = false;
let fsDisplays = new Set();   // display ids currently covered by a fullscreen app
let pendingPopup = null;      // { version }: an update popup that is waiting for the fullscreen app to go away
const sameIds = (a, b) => a.size === b.size && [...a].every(id => b.has(id));
function physDisplays() {     // physical-pixel rect per display, so a window rect compares directly with it on any DPI mix
  return screen.getAllDisplays().map(d => {
    let r = d.bounds; try { r = screen.dipToScreenRect(null, d.bounds); } catch {}
    return { id: d.id, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  });
}
function pollForeground() {
  try {
    if (process.platform !== 'win32') { engine.setLedge(null); return; }
    if (userHidden && !pendingPopup) { engine.setLedge(null); return; }   // nothing on screen: don't spawn the probe
    if (fgBusy) return;
    const aware = store.get().settings.windowAware;
    fgBusy = true;
    fgProbe.query((stdout) => {
      fgBusy = false;
      try {
        const p = stdout ? fsdetect.parseProbe(stdout) : null;
        if (!p) { engine.setLedge(null); setFullscreen(fsTracker.update(null, Date.now())); return; }   // failed probe: hold the last state
        setFullscreen(fsTracker.update(fsdetect.fullscreenDisplays({ windows: p.windows, displays: physDisplays(), ns: p.ns, fg: p.fg, ownPids: OWN_PIDS }), Date.now()));
        engine.setLedge(aware ? ledgeFor(p.fg) : null);
      } catch { engine.setLedge(null); }
    });
  } catch { fgBusy = false; engine.setLedge(null); }
}
// perch on a normal floating foreground window's top edge (DIP). null = no ledge.
function ledgeFor(fg) {
  if (!fg || fsdetect.SHELL_CLASSES.has((fg.cls || '').trim())) return null;
  const dr = screen.screenToDipRect(null, { x: fg.rect.x, y: fg.rect.y, width: fg.rect.w, height: fg.rect.h });   // converts the whole rect: the corner trick breaks on mixed DPI
  const x0 = dr.x, y0 = dr.y, x1 = dr.x + dr.width, y1 = dr.y + dr.height, w = dr.width, h = dr.height;
  const d = screen.getDisplayNearestPoint({ x: Math.round((x0 + x1) / 2), y: Math.round((y0 + y1) / 2) });
  if (fsDisplays.has(d.id)) return null;
  const wa = d.workArea;
  const coversWork = (x0 <= wa.x + 4 && x1 >= wa.x + wa.width - 4 && y0 <= wa.y + 4);
  const normal = w > 220 && h > 120 && y0 > wa.y + 48 && y0 < wa.y + wa.height - 80 && !coversWork;
  return normal ? { x0: x0 + 8, x1: x1 - 8, y: y0 } : null;
}
// a new set of fullscreen displays: log it, silence everything that must not run over a movie, keep the sprite on a free display
function setFullscreen(next) {
  if (sameIds(next, fsDisplays)) return;
  fsDisplays = next;
  devLog('fullscreen', { displays: [...next] });   // display ids only
  if (next.size) stopFullscreenActivity();
  moveOffFullscreen();
  syncWorld();
  applyVisibility();
  if (!next.size && pendingPopup) { const v = pendingPopup.version; pendingPopup = null; showUpdatePopup(v); }
}
// antics, the chase toy, pranks and their overlays stop at once; an update popup that is already up goes away and comes back later
function stopFullscreenActivity() {
  try { engine.cancelScript('fullscreen'); } catch {}
  try { toy.destroy(); } catch {}
  try { if (mischief) mischief.stop('fullscreen'); } catch {}
  if (updatePopupWin && !updatePopupWin.isDestroyed()) { pendingPopup = { version: updatePopupVersion }; closeUpdatePopup(); }
}
// if the sprite is on (or touches) a covered display and another display is free, move it across while it is hidden
function moveOffFullscreen() {
  if (!fsDisplays.size || !spriteTouchesFullscreen()) return;
  const free = screen.getAllDisplays().filter(d => !fsDisplays.has(d.id));
  if (!free.length) return;   // all covered: stays hidden where it is
  syncWorld();
  const cur = screen.getCursorScreenPoint();
  engine.rescue(geo.homePosition(engine.size, free, cur));
  resetInteraction();
  devLog('sprite moved off the fullscreen display');
}

// --- settings / shop window ---------------------------------------------
function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 760, height: 620, minWidth: 560, minHeight: 480, title: 'Study Buddy',
    backgroundColor: '#13131a', show: false,
    icon: path.join(ASSETS, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, '..', 'settings', 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
}

// --- broadcast state (settings window + overlays for size/speech/etc) ----
function fullState() {
  const s = store.get();
  const pool = rollPool(s.owned).map(c => c.id);
  return { ...s, lockedIds: lockedIds(s.owned), catalog: CHARACTERS, currency: CURRENCY, rarities: RARITIES, personalities: PERSONALITIES,
    rate: sparkRate(), gumballCost: gumballCost(), gumballPool: pool, buddyHidden: userHidden,
    devTools: DEV_TOOLS, infiniteSparks: economy.infinite, mischiefOn: mischiefEnabled(), update, platform: process.platform, appVersion: app.getVersion() };
}
function pushState() {
  const payload = fullState();
  for (const w of [petWin, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('state', payload);
}

// --- economy -------------------------------------------------------------
function sparkRate() { const s = store.get(); const lvl = (s.levels && s.levels[s.active]) || 0; return +(1 + 0.4 * (s.owned.length - 1) + 0.1 * lvl).toFixed(2); }
let lastTick = Date.now();
setInterval(() => { const now = Date.now(); const dt = (now - lastTick) / 1000; lastTick = now;
  const s = store.get(); if (!s.settings.paused) store.set({ sparks: +(s.sparks + sparkRate() * dt).toFixed(3) }); }, 1000);
setInterval(() => { const s = store.get(); for (const w of [petWin, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('sparks', s.sparks); }, 1000);

// --- tray ----------------------------------------------------------------
function buildTray() {
  let img = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  if (IS_MAC) {
    // the menu bar is ~22pt tall: a raw 32px image shows huge. Use 16px @1x + 32px @2x.
    const small = nativeImage.createFromPath(path.join(ASSETS, 'tray16.png'));
    if (!small.isEmpty() && !img.isEmpty()) {
      const mac = nativeImage.createEmpty();
      mac.addRepresentation({ scaleFactor: 1, buffer: small.toPNG() });
      mac.addRepresentation({ scaleFactor: 2, buffer: img.toPNG() });
      img = mac;
    } else if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 });
  }
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip(TOOLTIP); refreshTrayMenu();
  tray.on('click', () => openSettings());
  if (DEV) tray.on('right-click', () => refreshTrayMenu());   // the dev status line is rebuilt each time the menu opens
}
function devStatusLine() {
  const sec = (ms) => (ms == null ? '-' : '~' + Math.round(ms / 1000) + 's');
  const pn = mischief && mischiefEnabled() ? mischief.nextInMs() : null;
  const freq = store.get().settings.deskMischiefFreq || 'normal';
  return 'next antic ' + sec(anticDueAt ? Math.max(0, anticDueAt - Date.now()) : null) + ' / next prank ' + sec(pn) + ' (' + (mischiefChaos ? 'chaos' : freq) + ')';
}
function refreshTrayMenu() {
  if (!tray) return; const s = store.get(); const shown = overlaysVisible();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Shop & Settings…', click: () => openSettings() },
    { label: '📂  Open the Drive', click: () => shell.openExternal(DRIVE_URL) },
    { type: 'separator' },
    { label: s.settings.paused ? '▶  Resume idle points' : '⏸  Pause idle points', click: () => toggle('paused') },
    { label: shown ? '🙈  Hide buddy' : '👋  Show buddy', click: () => { if (shown) hideBuddy(); else showBuddy(); refreshTrayMenu(); } },
    { label: '🧲  Bring buddy back', click: () => bringBuddyBack() },
    { label: 'Start on login', type: 'checkbox', checked: s.settings.startOnBoot, click: (mi) => setStartOnBoot(mi.checked) },
    { type: 'separator' },
    { label: 'About', click: () => openSettings() },
    ...(process.platform === 'win32' ? [{ label: 'Stop mischief', enabled: mischiefEnabled(), click: () => stopMischief() }] : []),
    ...(DEV ? [{ type: 'separator' }, { label: devStatusLine(), enabled: false }, { label: 'DEV: unlock Captain Cram', click: () => devUnlock('hero') }, { label: 'DEV: unlock Pib (cat)', click: () => devUnlock('cat') },
      { label: 'DEV: cat chase', click: () => devTrigger('chase') }, { label: 'DEV: hero landing', click: () => devTrigger('landing') },
      { label: 'DEV: hero patrol', click: () => devTrigger('patrol') }, { label: 'DEV: hero power up', click: () => devTrigger('powerup') },
      { label: 'DEV: mischief', submenu: [...Object.keys(MGAGS.G).map(id => ({ label: MGAGS.G[id].label, click: () => devPrank(id) })), { type: 'separator' },
        { label: 'chaos: a prank every 30-90 s', type: 'checkbox', checked: mischiefChaos, click: (mi) => { mischiefChaos = mi.checked; if (mischief) mischief.setChaos(mischiefChaos); devLog('mischief chaos', mischiefChaos); } }] }] : []),
    { label: 'Quit Study Buddy', click: () => { app.isQuiting = true; app.quit(); } },
  ]));
}
function toggle(key) { const s = store.get(); store.set({ settings: { [key]: !s.settings[key] } }); pushState(); refreshTrayMenu(); }

function setStartOnBoot(enabled) {
  store.set({ settings: { startOnBoot: enabled } });
  applyLoginItem(enabled);
  pushState(); refreshTrayMenu();
}
// Never register a login item from an unpackaged / dev-mode run: it would point Windows at
// electron.exe (or a temp build) and survive the test session.
function applyLoginItem(enabled) {
  if (!app.isPackaged || DEV) return;
  try { app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] }); } catch {}
}

// --- auto update ---------------------------------------------------------
let _updater = null;          // the electron-updater instance (once initialised)
let _installing = false;      // guard so we only trigger the install once
let _promptOpen = false;      // guard so we only show the restart dialog once

let updatePopupWin = null, updatePopupVersion = '';

// Quit everything and let NSIS swap in the new version, then relaunch.
function installUpdateNow() {
  if (IS_MAC) { try { closeUpdatePopup(); } catch {} shell.openExternal(RELEASES_URL); return; }
  if (_installing || !_updater) return;
  _installing = true;
  app.isQuiting = true;
  try { store.saveNow(); } catch {}
  try { closeUpdatePopup(); } catch {}
  try { if (petWin && !petWin.isDestroyed()) petWin.destroy(); } catch {}
  try { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.destroy(); } catch {}
  // isSilent = true (no installer wizard), isForceRunAfter = true (reopen after).
  setTimeout(() => { try { _updater.quitAndInstall(true, true); } catch { app.quit(); } }, 150);
}

function closeUpdatePopup() {
  if (updatePopupWin && !updatePopupWin.isDestroyed()) updatePopupWin.destroy();
  updatePopupWin = null;
}

// A small on-screen toast (bottom-right of the primary screen) that appears even
// when only the sprite is visible — no need to open Settings.
function showUpdatePopup(version) {
  if (_installing) return;
  if (fsDisplays.size) { pendingPopup = { version }; devLog('update popup waits for the fullscreen app'); return; }   // never over a movie / game
  pendingPopup = null; updatePopupVersion = version;
  if (updatePopupWin && !updatePopupWin.isDestroyed()) { updatePopupWin.show(); return; }
  const wa = screen.getPrimaryDisplay().workArea;
  const W = 360, H = 150;
  updatePopupWin = new BrowserWindow({
    width: W, height: H, x: wa.x + wa.width - W - 18, y: wa.y + wa.height - H - 18,
    frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, hasShadow: false, show: false, fullscreenable: false, focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  updatePopupWin.setAlwaysOnTop(true, 'screen-saver');
  updatePopupWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  updatePopupWin.loadFile(path.join(__dirname, '..', 'settings', 'update-popup.html'), { search: 'v=' + encodeURIComponent(version || '') + (IS_MAC ? '&mac=1' : '') });
  updatePopupWin.once('ready-to-show', () => { updatePopupWin.show(); });
  updatePopupWin.on('closed', () => { updatePopupWin = null; });
}

function initUpdates() {
  if (isDev || DEV_BUILD) return; let autoUpdater;   // the dev build never checks for updates
  try { autoUpdater = require('electron-updater').autoUpdater; } catch { return; }
  _updater = autoUpdater;
  autoUpdater.autoDownload = !IS_MAC;              // Mac: unsigned apps can't self-install
  autoUpdater.autoInstallOnAppQuit = !IS_MAC;      // also install if the app is simply quit (Windows)
  autoUpdater.on('checking-for-update', () => { update = { status: 'checking', info: null }; pushState(); });
  autoUpdater.on('update-available', (i) => {
    if (IS_MAC) { update = { status: 'manual', info: { version: i.version } }; pushState(); showUpdatePopup(i.version); return; }
    update = { status: 'available', info: { version: i.version } }; pushState();
  });
  autoUpdater.on('update-not-available', () => { update = { status: 'current', info: null }; pushState(); });
  autoUpdater.on('error', (e) => { update = { status: 'error', info: { message: String(e && e.message || e) } }; pushState(); });
  autoUpdater.on('update-downloaded', (i) => {
    update = { status: 'downloaded', info: { version: i && i.version } }; pushState();
    if (tray && tray.displayBalloon) tray.displayBalloon({ title: 'Study Buddy', content: `Update ${i && i.version || ''} downloaded — ready to install.` });
    showUpdatePopup(i && i.version);          // on-screen toast, no need to open settings
  });
  ipcMain.handle('update:check', () => { try { autoUpdater.checkForUpdates(); } catch {} return true; });
  ipcMain.handle('update:install', () => { installUpdateNow(); return true; });
  ipcMain.on('update:later', () => { closeUpdatePopup(); });
  setTimeout(() => { try { autoUpdater.checkForUpdatesAndNotify(); } catch {} }, 4000);
}

// --- IPC -----------------------------------------------------------------
ipcMain.handle('state:get', () => fullState());
ipcMain.handle('settings:patch', (_e, patch) => applySettingsPatch(patch));
function applySettingsPatch(patch) {
  store.set({ settings: patch }); if (DEV) devLog('settings', Object.keys(patch).map(k => k + '=' + patch[k]).join(' '));
  if ('startOnBoot' in patch) setStartOnBoot(patch.startOnBoot);
  syncEngineSettings(); pushState(); refreshTrayMenu(); scheduleAntic(); if (mischief) { if (!mischiefEnabled()) mischief.stop('stopped'); mischief.refresh(); } return fullState();
}
ipcMain.handle('buddy:unlock', (_e, id) => {
  const s = store.get(); const c = characterById(id);
  if (!c || !c.implemented) return { ok: false, reason: 'unavailable' };
  if (s.owned.includes(id)) return { ok: true };
  if (!tierUnlocked(c.tier || 1, s.owned)) return { ok: false, reason: 'locked' };
  if (!economy.canAfford(s.sparks, c.cost)) return { ok: false, reason: 'poor' };
  store.set({ sparks: economy.after(s.sparks, c.cost), owned: [...s.owned, id], active: id }); pushState(); return { ok: true };
});
// Each buddy you already own makes the next crank 1.6x pricier (rounded to 1k).
function gumballCost() {
  const s = store.get();
  const ownedImpl = CHARACTERS.filter(c => c.implemented && s.owned.includes(c.id)).length;
  const raw = GUMBALL_COST * Math.pow(1.6, Math.max(0, ownedImpl - 1));
  return Math.round(raw / 1000) * 1000;
}
// Gumball machine: spend Sparks for a random buddy you don't own yet.
ipcMain.handle('buddy:roll', () => {
  const s = store.get();
  const pool = rollPool(s.owned);                                            // every unowned buddy, any tier
  if (pool.length === 0) return { ok: false, reason: 'complete' };          // owns everything available
  const cost = gumballCost();
  if (!economy.canAfford(s.sparks, cost)) return { ok: false, reason: 'poor', cost };
  const got = pickWeighted(pool, Math.random);                               // rarity-weighted
  store.set({ sparks: economy.after(s.sparks, cost), owned: [...s.owned, got.id], active: got.id });
  syncActiveChar(); pushState();
  showHatch(got.id, got.name, got.rarity);   // egg-hatch reveal on the desktop
  const left = rollPool(store.get().owned).length;
  return { ok: true, got: got.id, name: got.name, rarity: got.rarity, emoji: got.id, remaining: left, sparks: store.get().sparks };
});
// --- egg-hatch reveal window --------------------------------------------
let hatchWin = null;
function showHatch(id, name, rarity) {
  try { if (hatchWin && !hatchWin.isDestroyed()) hatchWin.destroy(); } catch {}
  const wa = screen.getPrimaryDisplay().workArea; const W = 460, H = 460;
  hatchWin = new BrowserWindow({
    width: W, height: H, x: Math.round(wa.x + (wa.width - W) / 2), y: Math.round(wa.y + (wa.height - H) / 2),
    transparent: true, frame: false, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, hasShadow: false, show: false, fullscreenable: false, focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  hatchWin.setAlwaysOnTop(true, 'screen-saver');
  hatchWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  hatchWin.loadFile(path.join(__dirname, '..', 'settings', 'reveal.html'),
    { search: `id=${encodeURIComponent(id)}&name=${encodeURIComponent(name || '')}&rarity=${encodeURIComponent(rarity || '')}` });
  hatchWin.once('ready-to-show', () => hatchWin.show());
  hatchWin.on('closed', () => { hatchWin = null; });
  setTimeout(() => { try { if (hatchWin && !hatchWin.isDestroyed()) hatchWin.destroy(); } catch {} }, 9000);  // safety
}
ipcMain.on('hatch:done', () => { try { if (hatchWin && !hatchWin.isDestroyed()) hatchWin.destroy(); } catch {} });

// --- DEV-ONLY testing tools (gated by DEV_TOOLS; absent in public builds) ---
ipcMain.handle('dev:addSparks', () => { if (!DEV_TOOLS) return fullState(); const s = store.get(); store.set({ sparks: +(s.sparks + 500000).toFixed(3) }); pushState(); return fullState(); });
ipcMain.handle('dev:sell', (_e, id) => {
  if (!DEV_TOOLS) return fullState();
  const s = store.get(); if (id === 'blob' || !s.owned.includes(id)) return fullState();
  const owned = s.owned.filter(x => x !== id);
  const active = (s.active === id) ? 'blob' : s.active;
  store.set({ owned, active }); syncActiveChar(); pushState(); return fullState();
});

ipcMain.handle('buddy:setActive', (_e, id) => { const s = store.get(); if (s.owned.includes(id)) { store.set({ active: id }); syncActiveChar(); pushState(); } return fullState(); });
ipcMain.handle('buddy:rename', (_e, id, name) => {
  const s = store.get(); if (!s.owned.includes(id)) return fullState();
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 18);
  store.set({ names: { ...s.names, [id]: clean } }); pushState(); return fullState();
});
ipcMain.handle('buddy:setColor', (_e, id, val) => {
  const s = store.get(); if (!s.owned.includes(id)) return fullState();
  // numeric hue (blob/ghost) is clamped; a named coat key (cat: ginger/grey/…) stored as-is
  let v = val;
  if (typeof val === 'number' || (typeof val === 'string' && /^\d+$/.test(val))) v = Math.max(0, Math.min(360, Math.round(Number(val))));
  store.set({ colors: { ...s.colors, [id]: v } }); pushState(); return fullState();
});
ipcMain.handle('buddy:earn', (_e, n) => { const s = store.get(); store.set({ sparks: +(s.sparks + Math.max(0, n || 0)).toFixed(3) }); return store.get().sparks; });
function feedCost(level) { return 50 * (level + 1); }
ipcMain.handle('buddy:feed', (_e, id) => {
  const s = store.get(); if (!s.owned.includes(id)) return { ok: false, reason: 'unowned' };
  const cur = (s.levels && s.levels[id]) || 0; const cost = feedCost(cur);
  if (!economy.canAfford(s.sparks, cost)) return { ok: false, reason: 'poor', cost };
  store.set({ sparks: economy.after(s.sparks, cost), levels: { ...s.levels, [id]: cur + 1 } }); pushState();
  // tell the pet to react happily
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('petEvent', { type: 'fed' });
  return { ok: true, level: cur + 1, sparks: store.get().sparks, next: feedCost(cur + 1) };
});

// pet input from the pet window. Dragging is driven by the GLOBAL cursor in the
// engine loop (the window moves with the pet, so local coords would feed back),
// so we just record the grab offset here.
ipcMain.on('pet:grab', () => { const c = screen.getCursorScreenPoint(); grabOff = { dx: c.x - engine.pos.x, dy: c.y - engine.pos.y }; dragStartAt = dragPingAt = Date.now(); engine.grab(); });
ipcMain.on('pet:drag', () => {});                       // no-op: loop drives drag from the global cursor
ipcMain.on('pet:dragPing', () => { dragPingAt = Date.now(); });   // renderer heartbeat while it believes a drag is live
ipcMain.on('pet:release', () => { if (engine.dragging) engine.release(); grabOff = null; dragPingAt = 0; });
ipcMain.on('pet:tap', () => engine.petted());

ipcMain.on('app:openSettings', () => openSettings());
ipcMain.on('app:toggle', (_e, key) => toggle(key));
ipcMain.on('app:hideBuddy', () => { hideBuddy(); refreshTrayMenu(); pushState(); });
ipcMain.on('app:showBuddy', () => { showBuddy(); refreshTrayMenu(); pushState(); });
ipcMain.on('app:openEmail', () => shell.openExternal('mailto:christopherblairhook@gmail.com'));
ipcMain.on('app:openDrive', () => shell.openExternal(DRIVE_URL));
ipcMain.on('app:openWhatsApp', () => shell.openExternal('https://wa.me/27729633580'));
ipcMain.on('app:quit', () => { app.isQuiting = true; app.quit(); });

// --- recovery: watchdog + "Bring buddy back" -------------------------------------
// Drop any half-finished drag (the renderer lost its pointerup, crashed, or the window was hidden mid-drag).
function resetInteraction() {
  grabOff = null; dragPingAt = 0;
  try { engine.forceRelease(); } catch (e) { logError('forceRelease', e); }
  if (petWin && !petWin.isDestroyed() && !petWin.webContents.isDestroyed()) { try { petWin.webContents.send('petEvent', { type: 'resetInput' }); } catch {} }
}
function reassertWindowStyles() {
  if (!petWin || petWin.isDestroyed() || !petWin._shown) return;
  petWin._interactive = null; petWin._iTick = 99;            // next tick re-applies click-through / interactive
  try { petWin.setAlwaysOnTop(true, 'screen-saver'); if (petWin.moveTop) petWin.moveTop(); } catch {}
}
function runWatchdog() {
  try {
    const alive = !!(petWin && !petWin.isDestroyed());
    const now = Date.now();
    const acts = watchdog.assess({
      hasWindow: alive, userHidden, shown: alive && petWin._shown !== false,
      winBounds: alive ? petWin.getBounds() : null, wantBounds: alive ? petWin._want : null,
      dragging: engine.dragging, dragPingAge: now - dragPingAt, dragAge: now - dragStartAt,
      scripted: !!engine.script, wrapping: !!engine._wrapping, pos: engine.pos, size: engine.size, displays: engine.displays,
    });
    for (const a of acts) {
      if (a === 'recreateWindow') { if (petGaveUp) continue; logError('watchdog', 'pet window missing; recreating'); createPetWindow(); }
      else if (a === 'rescue') { devLog('watchdog: sprite off-screen, rescuing', engine.pos); engine.rescue(); resetInteraction(); }
      else if (a === 'releaseDrag') { devLog('watchdog: stuck drag released'); resetInteraction(); }
      else if (a === 'fixBounds') { try { petWin.setBounds(petWin._want); devLog('watchdog: window bounds re-applied'); } catch {} }
      else if (a === 'reassertMouse' || a === 'reassertTop') { if (a === 'reassertMouse') { petWin._iTick = 99; } else { petWin._topTick = 99; } }
    }
  } catch (e) { logError('watchdog', e); }
}
function refreshAfterWake() {
  try { syncWorld(); reassertWindowStyles(); runWatchdog(); } catch (e) { logError('wake', e); }
}
// Tray item: recentre the sprite on the screen the mouse is on and reset all interaction state.
function bringBuddyBack() {
  try {
    userHidden = false;
    if (petGaveUp) { petGaveUp = false; reloadGov.reset(); if (tray) tray.setToolTip(TOOLTIP); }   // manual retry
    if (!petWin || petWin.isDestroyed()) createPetWindow();
    syncWorld();
    toy.destroy();
    engine.rescue(geo.homePosition(engine.size, engine.displays, screen.getCursorScreenPoint()));
    resetInteraction();
    petWin._shown = null; petWin._want = null; applyVisibility(); reassertWindowStyles();
    refreshTrayMenu(); pushState(); scheduleAntic();
  } catch (e) { logError('bringBuddyBack', e); }
}

// --- antics: the cat's butterfly chase / Captain Cram's stunts ---------------------------------
// ONE scheduled timeout (re-armed after each firing); nothing runs between antics.
let anticTimer = null, anticDueAt = 0;
const anticPlanner = scripts.createAnticPlanner(Math.random); anticPlanner.reset(Date.now());
const anticCharId = () => { const id = store.get().active; return scripts.ANTIC_NAMES[id] ? id : null; };
// delay undefined: recompute from the time since the last antic (a settings change never pushes a due antic back)
function scheduleAntic(delay) {
  clearTimeout(anticTimer); anticTimer = null; anticDueAt = 0;
  const id = anticCharId();
  if (!id || !store.get().settings.antics) return;
  const d = delay == null ? anticPlanner.delay(Date.now(), store.get().settings.mischief) : delay;
  anticDueAt = Date.now() + d; anticTimer = setTimeout(onAnticTimer, d); if (DEV) devLog('antic scheduled in ' + Math.round(d / 1000) + 's (' + id + ')');
}
// null = OK to play now; otherwise why not. A merely walking sprite is settled first; scripts, drags, sleep, jumps and climbs count as busy.
function anticBlocked() {
  const s = store.get().settings;
  if (!petWin || petWin.isDestroyed() || userHidden || !petWin._shown) return 'hidden';
  if (fsDisplays.size) return 'fullscreen';   // any covered display: no antics anywhere
  if (s.stayPut || s.reduceMotion || s.paused || !s.antics) return 'quiet';
  engine.settle();
  return engine.canStartScript(true) ? null : 'busy';
}
function onAnticTimer() {
  anticTimer = null; anticDueAt = 0;
  try {
    const why = anticBlocked();
    if (!why) { const ok = startAntic(); if (ok) anticPlanner.fired(Date.now()); scheduleAntic(ok ? undefined : 5000); }
    else { if (DEV) devLog('antic skipped: ' + why); scheduleAntic(why === 'busy' ? 1500 : 30000); }   // busy: a settled sprite is a hop from idle; otherwise look again in 30 s
  } catch (e) { logError('antic timer', e); scheduleAntic(10000); }
}
function startAntic(name) {
  const id = anticCharId(); if (!id) return false;
  const sc = scripts.makeScript(id, name); if (!sc) return false;
  const ok = engine.startScript(sc, Date.now());
  devLog('antic ' + (ok ? 'played' : 'skipped') + ' ' + id + ' ' + sc.name + (ok ? '' : ' (not-started)'));
  return ok;
}

// --- desktop mischief ----------------------------------------------------------------------------
// ON by default for everyone since 0.7.1 (store migration v6; an explicit false stays off). Overlay illusions only: see src/main/mischief/manager.js.
const mischiefActivity = mlogic.createActivity();
let devDuring = null;
let mischief = null, mischiefHost = null, mischiefChaos = false, mfFlags = { locked: false, suspended: false }, devCursor = null, devAbortAt = 0;
function mischiefEnabled() { if (process.platform !== 'win32') return false; const v = store.get().settings.deskMischief; return v == null ? true : !!v; }
function petEventOut(type, data) { if (petWin && !petWin.isDestroyed()) petWin.webContents.send('petEvent', Object.assign({ type }, data || {})); }
function initMischief() {
  if (process.platform !== 'win32') return;   // other platforms: nothing is created, nothing is requested
  mischiefHost = createHost({ BrowserWindow, desktopCapturer, screen, getPetWin: () => petWin });
  mischief = createManager({
    platform: process.platform, now: Date.now, rand: Math.random, log: (...a) => devLog(...a), engine, host: mischiefHost, activity: mischiefActivity,
    settings: () => ({ enabled: mischiefEnabled(), freq: store.get().settings.deskMischiefFreq || 'normal' }),
    flags: () => { const s = store.get().settings; return { userHidden, petShown: !!(petWin && !petWin.isDestroyed() && petWin._shown), paused: !!s.paused, stayPut: !!s.stayPut, reduceMotion: !!s.reduceMotion, fullscreen: fsDisplays.size > 0, locked: mfFlags.locked, suspended: mfFlags.suspended }; },
    holdBrain: (ms) => { engine.nextDecision = Math.max(engine.nextDecision || 0, Date.now() + ms); }, makeProbe: () => createProbe(), char: () => store.get().active, cursor: () => devCursor || screen.getCursorScreenPoint(),
    emit: petEventOut, setFx: (fx) => { engine.mischief = fx; }, sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    spriteBox: () => mlogic.R(engine.pos.x, engine.pos.y - engine.size * 0.3, engine.size, engine.size * 1.3),
    hidePet: (on) => { try { if (petWin && !petWin.isDestroyed()) petWin.setOpacity(on ? 0 : (petWin._shown ? 1 : 0)); } catch {} },
    onGo: () => { if (devDuring) devDuring(); },
    onResult: (r) => { if (r.status === 'aborted' && devAbortAt) { devLog('ABORT-LATENCY', r.id, r.reason, (Date.now() - devAbortAt) + 'ms'); devAbortAt = 0; } },
  });
  ipcMain.on('mischief:ready', () => mischiefHost._ready());
  ipcMain.on('mischief:error', (_e, m) => mischiefHost._error(m));
  const stopNow = (why) => { if (mischief) mischief.stop(why); };
  try {
    powerMonitor.on('lock-screen', () => { mfFlags.locked = true; stopNow('session-locked'); }); powerMonitor.on('unlock-screen', () => { mfFlags.locked = false; });
    powerMonitor.on('suspend', () => { mfFlags.suspended = true; stopNow('suspended'); }); powerMonitor.on('resume', () => { mfFlags.suspended = false; });
  } catch {}
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => stopNow('display-changed'));
  mischief.schedule();
}
function stopMischief() {   // tray "Stop mischief": end the current prank right now and switch the feature off
  if (mischief) mischief.stop('stopped');
  store.set({ settings: { deskMischief: false } }); if (mischief) mischief.schedule(); pushState(); refreshTrayMenu();
}
function devPrank(id) {
  if (!DEV || !mischief) return;
  engine.cancelScript('dev'); resetInteraction(); engine.setLedge(null); engine.pos.y = engine.floorAt(engine.pos.x); engine.onFloor = true; engine.vel.x = engine.vel.y = 0; engine.setState('idle', 1000);
  devLog('dev prank', id); return mischief.start({ only: id, force: true });
}
// DEV: prove a prank restores the screen. Captures the target area (sprite hidden) before and after, compares in memory, logs the numbers. Nothing is saved.
async function devVerify(id) {
  if (!DEV || !mischief) return;
  const wins0 = BrowserWindow.getAllWindows().length, disp = mischiefHost.displays()[0], whole = mlogic.R(disp.bounds.x, disp.bounds.y, disp.bounds.width, disp.bounds.height);
  const grab = async () => { mischief.hidePetForVerify(true); await new Promise(r => setTimeout(r, 120)); const p = await mischiefHost.pixels(disp, whole); mischief.hidePetForVerify(false); return p; };
  // system state must not change either: notification state (2 = a fullscreen app is running, which turns on Do Not Disturb) and the tray layout
  const sp = createProbe(); sp.start();
  const sample = async () => { const s = await sp.request('scan', 5000); return s && { ns: s.ns, tray: (s.items || []).filter(i => i.k === 'tray').map(i => i.r.join(',')).join('|') }; };
  const sBefore = await sample(); let sDuring = null; devDuring = () => { setTimeout(async () => { sDuring = await sample(); }, 1800); };
  const before = await grab(); const res = await devPrank(id);
  await new Promise(r => setTimeout(r, 2200));   // sprite falls back to the floor
  const sAfter = await sample(); sp.stop(); devDuring = null;
  const after = await grab(), rects = (res && res.rects) || [];
  const cmp = mlogic.compareRegions(before, after, rects.length ? rects : [whole], disp);
  const sysOk = !!(sBefore && sDuring && sAfter && sBefore.ns === sDuring.ns && sBefore.ns === sAfter.ns && sBefore.tray === sDuring.tray && sBefore.tray === sAfter.tray);
  devLog('VERIFY', id, JSON.stringify({ ok: res && res.status === 'played' ? (cmp.mean < 0.001 && sysOk) : null, dims: [before && before.w, before && before.h, after && after.w, after && after.h, before && before.data && before.data.length], result: res && res.status, reason: res && res.reason, meanDiff: +cmp.mean.toFixed(5), pctChanged: +cmp.pct.toFixed(3), maxChannel: cmp.max, system: { nsBefore: sBefore && sBefore.ns, nsDuring: sDuring && sDuring.ns, nsAfter: sAfter && sAfter.ns, trayStable: !!(sBefore && sDuring && sAfter && sBefore.tray === sDuring.tray && sBefore.tray === sAfter.tray), trayBefore: sBefore && sBefore.tray, trayDuring: sDuring && sDuring.tray }, overlaysBefore: wins0, overlaysAfter: BrowserWindow.getAllWindows().length }));
}

// --- dev helpers (STUDYBUDDY_DEV=1 only) -------------------------------------------------------
function devUnlock(id) {
  if (!DEV) return;
  const s = store.get(); if (!characterById(id)) return;
  store.set({ owned: s.owned.includes(id) ? s.owned : [...s.owned, id], active: id });
  syncActiveChar(); pushState(); devLog('dev unlocked', id);
}
function devTrigger(name) {
  if (!DEV) return false;
  const want = name === 'chase' ? 'cat' : 'hero';
  if (store.get().active !== want) devUnlock(want);
  if (userHidden) showBuddy();
  engine.cancelScript('dev'); resetInteraction();
  engine.target = null; engine._wantClimb = engine._peeking = false; engine.parachute = false;
  engine.pos.y = engine.floorAt(engine.pos.x); engine.onFloor = true; engine.vel.x = engine.vel.y = 0; engine.setState('idle', 1000);
  return startAntic(name);
}
function devSnapshot(tag) {
  const wins = BrowserWindow.getAllWindows().map(w => ({ id: w.id, vis: w.isVisible(), focusable: w.isFocusable(), focused: w.isFocused(), b: w.getBounds() }));
  devLog('SNAP', tag, { state: engine.state, script: engine.script && engine.script.name, pos: { x: Math.round(engine.pos.x), y: Math.round(engine.pos.y) }, dragging: engine.dragging,
    interactive: petWin && petWin._interactive, shown: petWin && petWin._shown, toy: toy._info(), windows: wins.length, focusedWin: BrowserWindow.getFocusedWindow() && BrowserWindow.getFocusedWindow().id });
}
function startDevRun() {
  const plan = devrun.parse(process.env.STUDYBUDDY_DEV_RUN || '');
  for (const step of plan) setTimeout(() => {
    try {
      devLog('DEV step', step.cmd, step.arg || '');
      switch (step.cmd) {
        case 'unlock': devUnlock(step.arg); break;
        case 'chase': case 'landing': case 'patrol': case 'powerup': devLog('started:', devTrigger(step.cmd)); break;
        case 'snap': devSnapshot(step.arg || ''); break;
        case 'flick': { // simulate a hard throw: grab, then release with a given velocity ("vx,vy")
          const [vx, vy] = (step.arg || '2500,-2500').split(',').map(Number);
          engine.cancelScript('dev'); engine.grab(); engine.vel.x = vx; engine.vel.y = vy; engine.release(); break; }
        case 'grab': engine.grab(); grabOff = { dx: engine.size / 2, dy: engine.size / 2 }; dragStartAt = dragPingAt = Date.now(); break;
        case 'release': engine.release(); grabOff = null; break;
        case 'bringback': bringBuddyBack(); break;
        case 'prank': devPrank(step.arg); break;
        case 'set': { const [k, v] = (step.arg || '').split('='); if (k) applySettingsPatch({ [k]: /^-?[0-9]+(\.[0-9]+)?$/.test(v) ? +v : v === 'true' ? true : v === 'false' ? false : v }); break; }
        case 'fsstat': devLog('FSSTAT', { fs: [...fsDisplays], shown: petWin && petWin._shown, opacity: petWin && !petWin.isDestroyed() ? petWin.getOpacity() : null, interactive: petWin && petWin._interactive, pos: { x: Math.round(engine.pos.x), y: Math.round(engine.pos.y) },
          script: engine.script && engine.script.name, anticBlocked: anticBlocked(), prankBlocked: mischief ? mischief.blocked(false) : 'no-manager', world: engine.displays.map(d => d.id), probeAlive: fgProbe._test.state().alive }); break;
        case 'antic': onAnticTimer(); break;                                  // the real scheduled path (gates included), not the forced dev trigger
        case 'prankgo': if (mischief) mischief.start({}).then(r => devLog('prankgo', r && r.status, r && r.reason)); break;   // real path: respects every gate
        case 'mstop': if (mischief) mischief.stop('stopped'); break;
        case 'mchaos': mischiefChaos = true; if (mischief) mischief.setChaos(true); break;
        case 'mnear': { const r = mischief && mischief.targets(); if (r && r[0]) { devAbortAt = Date.now(); devCursor = { x: Math.round(r[0].x + r[0].w / 2), y: Math.round(r[0].y + r[0].h / 2) }; } break; }
        case 'mfar': devCursor = null; break;
        case 'mverify': devVerify(step.arg).catch((e) => logError('mverify', e)); break;
        case 'mdown': case 'mmove': case 'mup': { // dev: synthesize pointer events straight into the pet renderer ("dx,dy[,held]" relative to the sprite)
          const [dx = 0, dy = 0, held = 0] = (step.arg || '').split(',').map(Number);
          if (!petWin || petWin.isDestroyed()) break;
          const dbg = petWin.webContents.debugger; if (!dbg.isAttached()) dbg.attach('1.3');   // CDP gives real `buttons` state, like a physical mouse
          dbg.sendCommand('Input.dispatchMouseEvent', { type: step.cmd === 'mdown' ? 'mousePressed' : step.cmd === 'mup' ? 'mouseReleased' : 'mouseMoved',
            x: Math.round(petWin._localX + engine.size / 2 + dx), y: Math.round(petWin._localY + engine.size / 2 + dy), button: step.cmd === 'mmove' && !held ? 'none' : 'left',
            buttons: held || step.cmd === 'mdown' ? 1 : 0, clickCount: step.cmd === 'mmove' ? 0 : 1, pointerType: 'mouse' }).catch((e) => devLog('cdp', String(e)));
          break; }
        case 'shot': { // dev: save the pet window (and the toy) as PNGs next to the log
          const dir = path.dirname(DEV_LOG || path.join(app.getPath('userData'), 'x'));
          if (petWin && !petWin.isDestroyed()) petWin.webContents.capturePage().then(i => fs.writeFileSync(path.join(dir, 'shot-' + (step.arg || 'pet') + '.png'), i.toPNG())).catch(() => {});
          toy._capture().then(i => { if (i) fs.writeFileSync(path.join(dir, 'shot-' + (step.arg || 'pet') + '-toy.png'), i.toPNG()); }).catch(() => {});
          break; }
        case 'offscreen': engine.pos.x = engine.world.x1 + 5000; engine.pos.y = engine.world.y0 - 5000; break;   // simulate a lost sprite
        case 'quit': app.isQuiting = true; app.quit(); break;
      }
    } catch (e) { logError('dev step ' + step.cmd, e); }
  }, step.at);
}
// DEV: pipe every window's console + crashes into the log
if (DEV) app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (...a) => { const ev = a[0]; const level = ev && ev.level != null ? ev.level : a[1]; const msg = ev && ev.message != null ? ev.message : a[2];
    devLog('renderer[' + level + ']', msg); });
  wc.on('render-process-gone', (_e2, d) => devLog('ERROR render-process-gone', d));
});

// --- lifecycle -----------------------------------------------------------
let relayoutTimer = null;
function relayout() {
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(() => {
    try {
      const ids = new Set(screen.getAllDisplays().map(d => d.id));          // forget fullscreen flags of unplugged monitors
      fsDisplays = fsTracker.forget(ids);
      syncWorld(); moveOffFullscreen(); applyVisibility(); runWatchdog();
    } catch (e) { logError('relayout', e); }
  }, 300);
}

app.on('ready', () => {
  store.load();
  applyLoginItem(store.get().settings.startOnBoot);
  startEngine();
  createPetWindow();
  buildTray();
  initUpdates();
  // save immediately when the PC sleeps or shuts down (laptops often die asleep)
  try { for (const ev of ['suspend', 'shutdown', 'lock-screen']) powerMonitor.on(ev, () => { try { store.saveNow(); } catch {} }); } catch {}
  // after sleep / unlock / RDP the OS can drop topmost + the click-through style and reshuffle displays
  try { for (const ev of ['resume', 'unlock-screen']) powerMonitor.on(ev, () => setTimeout(refreshAfterWake, 800)); } catch {}
  screen.on('display-added', relayout);
  screen.on('display-removed', relayout);
  screen.on('display-metrics-changed', relayout);
  setInterval(pollForeground, 1500);
  setInterval(runWatchdog, 2500);       // self-healing: off-screen sprite, stuck drag, drifted window, lost click-through/topmost
  scheduleAntic();
  initMischief();
  if (DEV) { devLog('userData', app.getPath('userData'), 'dev', DEV, 'infiniteSparks', economy.infinite); startDevRun(); }
  setTimeout(checkGraphicsOnce, 6000);   // see "Software-graphics safety net" at the top  // window-awareness / fullscreen poll (Windows) — gentler on CPU
});
app.on('window-all-closed', () => { /* keep running in tray */ });
app.on('activate', () => openSettings());   // macOS: clicking the Dock icon opens Shop & Settings
app.on('before-quit', () => { app.isQuiting = true; clearTimeout(anticTimer); try { if (mischief) mischief.stop('quit'); if (mischiefHost) mischiefHost.close(); killProbes(); } catch {} try { toy.destroy(); } catch {} try { fgProbe.stop(); } catch {} store.saveNow(); });

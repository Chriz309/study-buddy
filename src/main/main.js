'use strict';
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, shell, dialog, powerMonitor } = require('electron');
const path = require('path');
const fgProbe = require('./fgprobe');   // Windows foreground-window probe (one long-lived PowerShell)
const store = require('./store');
const engine = require('./engine');
const { CHARACTERS, CURRENCY, DEV_TOOLS, GUMBALL_COST, RARITIES, PERSONALITIES, characterById, rollPool, lockedIds, tierUnlocked } = require('../shared/catalog');
const fs = require('fs');
const geo = require('../shared/geometry');
const watchdog = require('./watchdog');
const scripts = require('./scripts');
const toy = require('./toy');
const devrun = require('./devrun');

// --- dev mode (STUDYBUDDY_DEV=1): tray test items, a scripted command run and a log file. Off in
// normal use; it also keeps test runs from registering a login item (see applyLoginItem).
const DEV = process.env.STUDYBUDDY_DEV === '1';
const DEV_LOG = DEV && process.env.STUDYBUDDY_DEV_LOG ? process.env.STUDYBUDDY_DEV_LOG : null;
function devLog(...a) {
  const line = new Date().toISOString() + ' ' + a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  if (DEV_LOG) { try { fs.appendFileSync(DEV_LOG, line + '\n'); } catch {} }
  if (DEV) console.log(line);
}
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
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain) { logError('pet did-fail-load', code + ' ' + desc); reloadPetSoon(); } });
}
let _reloads = [];
function reloadPetSoon() {
  const now = Date.now(); _reloads = _reloads.filter(t => now - t < 60000); _reloads.push(now);
  setTimeout(() => {
    if (!petWin || petWin.isDestroyed()) return;
    try {
      if (_reloads.length > 3) { const w = petWin; petWin = null; w.destroy(); createPetWindow(); }   // keeps crashing: fresh window
      else petWin.webContents.reload();
      petWin._shown = null;
    } catch (e) { logError('reloadPet', e); }
  }, 600);
}
// visible unless the user hid it, or a fullscreen app owns the display it's on
function petShouldShow() { if (userHidden) return false; const d = ownerDisplay(); return !(d && fsDisplays.has(d.id)); }
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

function ownerDisplay() {
  const cx = engine.pos.x + engine.size / 2, cy = engine.pos.y + engine.size / 2;
  for (const d of screen.getAllDisplays()) { const b = d.bounds; if (cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height) return d; }
  let best = null, bd = Infinity;
  for (const d of screen.getAllDisplays()) { const b = d.bounds; const dd = Math.abs((b.x + b.width / 2) - cx); if (dd < bd) { bd = dd; best = d; } }
  return best;
}

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
  engine.setWorld(screen.getAllDisplays());
  // start somewhere sensible on the primary
  const pb = screen.getPrimaryDisplay().workArea;
  engine.pos = { x: pb.x + pb.width * 0.4, y: pb.y + pb.height - engine.size };
  syncEngineSettings(); syncActiveChar();

  let calmSkip = 0;
  setInterval(() => { try { loopOnce(); } catch (e) { logError('engine loop', e); } }, 1000 / 60);
  function loopOnce() {
    if (!petWin || petWin.isDestroyed()) return;
    // CPU saver: when the pet is resting (sitting / idle / asleep, not being dragged
    // or carried along) run this loop at 20fps instead of 60. Anything that moves
    // — walking, falling, jumping, climbing, dragging — still gets the full 60fps.
    const calm = !engine.dragging && !grabOff && !engine.script && (engine.state === 'sleep' || engine.state === 'sit' || engine.state === 'idle')
      && Math.abs(engine.vel.x) < 1 && Math.abs(engine.vel.y) < 1;
    if (calm && (++calmSkip % 3)) return;
    if (!calm) calmSkip = 0;
    const now = Date.now();
    const cur = screen.getCursorScreenPoint();
    engine.setCursor({ x: cur.x, y: cur.y });
    if (grabOff && engine.dragging) engine.dragTo(cur.x - grabOff.dx + engine.size / 2, cur.y - grabOff.dy + engine.size / 2);
    engine.tick(now);
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
  petWin.webContents.send('pet', { show: true, x: petWin._localX, y: petWin._localY, size: engine.size, state: engine.state, facing: engine.facing, vx: Math.round(_vx) });
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
  if (id !== _lastActive) { engine.cancelScript('char'); _lastActive = id; }
  engine.setMoveType(c && c.move ? c.move : 'walk'); engine.setGait(c && c.gait ? c.gait : 'hop');
  scheduleAntic();
}

// --- window awareness: perch on the active window's top edge -------------
// Reads the foreground window rect on Windows and feeds the engine a "ledge".
// Fails safe: any error/uncertainty -> no ledge -> normal desktop behaviour.
const SHELL_CLASSES = new Set(['Progman', 'WorkerW', '']);
let fgBusy = false;
let fsDisplays = new Set();   // display ids currently covered by a fullscreen app
function pollForeground() {
  try {
    if (process.platform !== 'win32') { engine.setLedge(null); if (fsDisplays.size) { fsDisplays = new Set(); applyVisibility(); } return; }
    if (userHidden) { engine.setLedge(null); return; }   // nothing on screen — don't spawn the probe
    if (fgBusy) return;
    const aware = store.get().settings.windowAware;
    fgBusy = true;
    fgProbe.query((stdout) => {
      fgBusy = false;
      try {
        if (!stdout) { engine.setLedge(null); if (++fgEmpty >= 2) clearFullscreen(); return; }   // probe lost the foreground window (lock screen, UAC, closed game)
        fgEmpty = 0;
        const [rectPart, cls = ''] = stdout.trim().split('|');
        const m = rectPart.split(',').map(Number);
        if (m.length !== 4 || m.some(n => !isFinite(n))) { engine.setLedge(null); return; }
        const [l, t, r, b] = m; if (r <= l || b <= t) { engine.setLedge(null); return; }
        const tl = screen.screenToDipPoint({ x: l, y: t }), br = screen.screenToDipPoint({ x: r, y: b });
        const x0 = tl.x, y0 = tl.y, x1 = br.x, y1 = br.y, w = x1 - x0, h = y1 - y0;
        const d = screen.getDisplayNearestPoint({ x: Math.round((x0 + x1) / 2), y: Math.round((y0 + y1) / 2) });
        const wa = d.workArea, bd = d.bounds;
        // --- fullscreen detection: covers the FULL monitor (incl. taskbar) and not the shell ---
        const isShell = SHELL_CLASSES.has((cls || '').trim());
        const fullscreen = !isShell && x0 <= bd.x + 2 && y0 <= bd.y + 2 && x1 >= bd.x + bd.width - 2 && y1 >= bd.y + bd.height - 2;
        const nextFs = new Set(fsDisplays);
        if (fullscreen) nextFs.add(d.id); else nextFs.delete(d.id);
        if (nextFs.size !== fsDisplays.size || [...nextFs].some(id => !fsDisplays.has(id))) { fsDisplays = nextFs; applyVisibility(); }
        // --- ledge: perch on a normal floating window's top edge ---
        const coversWork = (x0 <= wa.x + 4 && x1 >= wa.x + wa.width - 4 && y0 <= wa.y + 4);
        const normal = aware && !fullscreen && !isShell && w > 220 && h > 120 && y0 > wa.y + 48 && y0 < wa.y + wa.height - 80 && !coversWork;
        engine.setLedge(normal ? { x0: x0 + 8, x1: x1 - 8, y: y0 } : null);
      } catch { engine.setLedge(null); }
    });
  } catch { fgBusy = false; engine.setLedge(null); }
}
let fgEmpty = 0;
function clearFullscreen() { if (fsDisplays.size) { fsDisplays = new Set(); applyVisibility(); } }

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
    devTools: DEV_TOOLS, update, platform: process.platform, appVersion: app.getVersion() };
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
  tray.setToolTip('Study Buddy'); refreshTrayMenu();
  tray.on('click', () => openSettings());
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
    ...(DEV ? [{ type: 'separator' }, { label: 'DEV: unlock Captain Cram', click: () => devUnlock('hero') }, { label: 'DEV: unlock Pib (cat)', click: () => devUnlock('cat') },
      { label: 'DEV: cat chase', click: () => devTrigger('chase') }, { label: 'DEV: hero landing', click: () => devTrigger('landing') },
      { label: 'DEV: hero patrol', click: () => devTrigger('patrol') }, { label: 'DEV: hero power up', click: () => devTrigger('powerup') }] : []),
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

let updatePopupWin = null;

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
  if (isDev) return; let autoUpdater;
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
ipcMain.handle('settings:patch', (_e, patch) => {
  store.set({ settings: patch });
  if ('startOnBoot' in patch) setStartOnBoot(patch.startOnBoot);
  syncEngineSettings(); pushState(); refreshTrayMenu(); scheduleAntic(); return fullState();
});
ipcMain.handle('buddy:unlock', (_e, id) => {
  const s = store.get(); const c = characterById(id);
  if (!c || !c.implemented) return { ok: false, reason: 'unavailable' };
  if (s.owned.includes(id)) return { ok: true };
  if (!tierUnlocked(c.tier || 1, s.owned)) return { ok: false, reason: 'locked' };
  if (s.sparks < c.cost) return { ok: false, reason: 'poor' };
  store.set({ sparks: +(s.sparks - c.cost).toFixed(3), owned: [...s.owned, id], active: id }); pushState(); return { ok: true };
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
  const pool = rollPool(s.owned);                                            // higher tiers only once the tier below is complete
  if (pool.length === 0) return { ok: false, reason: 'complete' };          // owns everything available
  const cost = gumballCost();
  if (s.sparks < cost) return { ok: false, reason: 'poor', cost };
  const got = pool[Math.floor(Math.random() * pool.length)];
  store.set({ sparks: +(s.sparks - cost).toFixed(3), owned: [...s.owned, got.id], active: got.id });
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
  if (s.sparks < cost) return { ok: false, reason: 'poor', cost };
  store.set({ sparks: +(s.sparks - cost).toFixed(3), levels: { ...s.levels, [id]: cur + 1 } }); pushState();
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
      if (a === 'recreateWindow') { logError('watchdog', 'pet window missing; recreating'); createPetWindow(); }
      else if (a === 'rescue') { devLog('watchdog: sprite off-screen, rescuing', engine.pos); engine.rescue(); resetInteraction(); }
      else if (a === 'releaseDrag') { devLog('watchdog: stuck drag released'); resetInteraction(); }
      else if (a === 'fixBounds') { try { petWin.setBounds(petWin._want); devLog('watchdog: window bounds re-applied'); } catch {} }
      else if (a === 'reassertMouse' || a === 'reassertTop') { if (a === 'reassertMouse') { petWin._iTick = 99; } else { petWin._topTick = 99; } }
    }
  } catch (e) { logError('watchdog', e); }
}
function refreshAfterWake() {
  try { engine.setWorld(screen.getAllDisplays()); reassertWindowStyles(); runWatchdog(); } catch (e) { logError('wake', e); }
}
// Tray item: recentre the sprite on the screen the mouse is on and reset all interaction state.
function bringBuddyBack() {
  try {
    userHidden = false; fsDisplays = new Set();
    if (!petWin || petWin.isDestroyed()) createPetWindow();
    engine.setWorld(screen.getAllDisplays());
    toy.destroy();
    engine.rescue(geo.homePosition(engine.size, engine.displays, screen.getCursorScreenPoint()));
    resetInteraction();
    petWin._shown = null; petWin._want = null; applyVisibility(); reassertWindowStyles();
    refreshTrayMenu(); pushState(); scheduleAntic();
  } catch (e) { logError('bringBuddyBack', e); }
}

// --- antics: the cat's butterfly chase / Captain Cram's stunts ---------------------------------
// ONE scheduled timeout (re-armed after each firing); nothing runs between antics.
let anticTimer = null;
const anticCharId = () => { const id = store.get().active; return scripts.ANTIC_NAMES[id] ? id : null; };
function scheduleAntic(delay) {
  clearTimeout(anticTimer); anticTimer = null;
  const id = anticCharId();
  if (!id || !store.get().settings.antics) return;
  anticTimer = setTimeout(onAnticTimer, delay == null ? scripts.nextAnticDelay(id) : delay);
}
// null = OK to play now; otherwise why not
function anticBlocked() {
  const s = store.get().settings;
  if (!petWin || petWin.isDestroyed() || userHidden || !petWin._shown) return 'hidden';
  if (s.stayPut || s.reduceMotion || s.paused || !s.antics) return 'quiet';
  if (!petShouldShow()) return 'fullscreen';
  return engine.canStartScript() ? null : 'busy';
}
function onAnticTimer() {
  anticTimer = null;
  try {
    const why = anticBlocked();
    if (!why) { startAntic(); scheduleAntic(); }
    else scheduleAntic(why === 'busy' ? 8000 : undefined);        // busy: try again shortly; otherwise wait a full interval
  } catch (e) { logError('antic timer', e); scheduleAntic(); }
}
function startAntic(name) {
  const id = anticCharId(); if (!id) return false;
  const sc = scripts.makeScript(id, name); if (!sc) return false;
  devLog('antic start', id, sc.name);
  return engine.startScript(sc, Date.now());
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
      engine.setWorld(screen.getAllDisplays());
      const ids = new Set(screen.getAllDisplays().map(d => d.id));          // forget fullscreen flags of unplugged monitors
      for (const id of [...fsDisplays]) if (!ids.has(id)) fsDisplays.delete(id);
      applyVisibility(); runWatchdog();
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
  if (DEV) startDevRun();
  setTimeout(checkGraphicsOnce, 6000);   // see "Software-graphics safety net" at the top  // window-awareness / fullscreen poll (Windows) — gentler on CPU
});
app.on('window-all-closed', () => { /* keep running in tray */ });
app.on('activate', () => openSettings());   // macOS: clicking the Dock icon opens Shop & Settings
app.on('before-quit', () => { app.isQuiting = true; clearTimeout(anticTimer); try { toy.destroy(); } catch {} try { fgProbe.stop(); } catch {} store.saveNow(); });

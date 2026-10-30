'use strict';
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const store = require('./store');
const engine = require('./engine');
const { CHARACTERS, CURRENCY, DEV_TOOLS, GUMBALL_COST, RARITIES, PERSONALITIES, characterById } = require('../shared/catalog');

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
let update = { status: 'idle', info: null };

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { showBuddy(); openSettings(); });

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
      if (petWin.webContents && !petWin.webContents.isDestroyed()) petWin.webContents.send('pet', { show: false });
    }
  } catch {}
}
function showBuddy() { userHidden = false; if (!petWin || petWin.isDestroyed()) createPetWindow(); applyVisibility(); }
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
  }, Date.now());
  engine.pos = { x: 0, y: 0 };
  engine.setWorld(screen.getAllDisplays());
  // start somewhere sensible on the primary
  const pb = screen.getPrimaryDisplay().workArea;
  engine.pos = { x: pb.x + pb.width * 0.4, y: pb.y + pb.height - engine.size };
  syncEngineSettings(); syncActiveChar();

  setInterval(() => {
    if (!petWin || petWin.isDestroyed()) return;
    const now = Date.now();
    const cur = screen.getCursorScreenPoint();
    engine.setCursor({ x: cur.x, y: cur.y });
    if (grabOff && engine.dragging) engine.dragTo(cur.x - grabOff.dx + engine.size / 2, cur.y - grabOff.dy + engine.size / 2);
    engine.tick(now);
    applyVisibility();
    if (petWin._shown) { positionPetWindow(); sendPet(); setPetInteractive(cur); keepOnTop(); }
  }, 1000 / 60);
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
    petWin._localX = localX; petWin._localY = localY;
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
  engine.setSettings({ speed: s.speed, personality: s.personality, mischief: s.mischief, stayPut: !!s.stayPut });
  engine.setSize(s.size || 140);
}
function syncActiveChar() { const c = characterById(store.get().active); engine.setMoveType(c && c.move ? c.move : 'walk'); engine.setGait(c && c.gait ? c.gait : 'hop'); }

// --- window awareness: perch on the active window's top edge -------------
// Reads the foreground window rect on Windows and feeds the engine a "ledge".
// Fails safe: any error/uncertainty -> no ledge -> normal desktop behaviour.
const PS_FG = 'Add-Type -Namespace Win -Name U -MemberDefinition \'[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r); [DllImport("user32.dll")] public static extern int GetClassName(System.IntPtr h, System.Text.StringBuilder s, int m); public struct RECT { public int left, top, right, bottom; }\' ; $h=[Win.U]::GetForegroundWindow(); $r=New-Object Win.U+RECT; [void][Win.U]::GetWindowRect($h,[ref]$r); $sb=New-Object System.Text.StringBuilder 256; [void][Win.U]::GetClassName($h,$sb,256); Write-Output ("{0},{1},{2},{3}|{4}" -f $r.left,$r.top,$r.right,$r.bottom,$sb.ToString())';
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
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', PS_FG], { timeout: 2500, windowsHide: true }, (err, stdout) => {
      fgBusy = false;
      try {
        if (err || !stdout) { engine.setLedge(null); return; }
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
  const pool = CHARACTERS.filter(c => c.implemented && !s.owned.includes(c.id)).map(c => c.id);
  return { ...s, catalog: CHARACTERS, currency: CURRENCY, rarities: RARITIES, personalities: PERSONALITIES,
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
    { label: 'Start on login', type: 'checkbox', checked: s.settings.startOnBoot, click: (mi) => setStartOnBoot(mi.checked) },
    { type: 'separator' },
    { label: 'About', click: () => openSettings() },
    { label: 'Quit Study Buddy', click: () => { app.isQuiting = true; app.quit(); } },
  ]));
}
function toggle(key) { const s = store.get(); store.set({ settings: { [key]: !s.settings[key] } }); pushState(); refreshTrayMenu(); }

function setStartOnBoot(enabled) {
  store.set({ settings: { startOnBoot: enabled } });
  try { app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] }); } catch {}
  pushState(); refreshTrayMenu();
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
  try { store.save(); } catch {}
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
  syncEngineSettings(); pushState(); refreshTrayMenu(); return fullState();
});
ipcMain.handle('buddy:unlock', (_e, id) => {
  const s = store.get(); const c = characterById(id);
  if (!c || !c.implemented) return { ok: false, reason: 'unavailable' };
  if (s.owned.includes(id)) return { ok: true };
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
  const pool = CHARACTERS.filter(c => c.implemented && !s.owned.includes(c.id));
  if (pool.length === 0) return { ok: false, reason: 'complete' };          // owns everything available
  const cost = gumballCost();
  if (s.sparks < cost) return { ok: false, reason: 'poor', cost };
  const got = pool[Math.floor(Math.random() * pool.length)];
  store.set({ sparks: +(s.sparks - cost).toFixed(3), owned: [...s.owned, got.id], active: got.id });
  syncActiveChar(); pushState();
  showHatch(got.id, got.name, got.rarity);   // egg-hatch reveal on the desktop
  const left = CHARACTERS.filter(c => c.implemented && !store.get().owned.includes(c.id)).length;
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
ipcMain.on('pet:grab', () => { const c = screen.getCursorScreenPoint(); grabOff = { dx: c.x - engine.pos.x, dy: c.y - engine.pos.y }; engine.grab(); });
ipcMain.on('pet:drag', () => {});                       // no-op: loop drives drag from the global cursor
ipcMain.on('pet:release', () => { engine.release(); grabOff = null; });
ipcMain.on('pet:tap', () => engine.petted());

ipcMain.on('app:openSettings', () => openSettings());
ipcMain.on('app:toggle', (_e, key) => toggle(key));
ipcMain.on('app:hideBuddy', () => { hideBuddy(); refreshTrayMenu(); pushState(); });
ipcMain.on('app:showBuddy', () => { showBuddy(); refreshTrayMenu(); pushState(); });
ipcMain.on('app:openEmail', () => shell.openExternal('mailto:christopherblairhook@gmail.com'));
ipcMain.on('app:openDrive', () => shell.openExternal(DRIVE_URL));
ipcMain.on('app:openWhatsApp', () => shell.openExternal('https://wa.me/27729633580'));
ipcMain.on('app:quit', () => { app.isQuiting = true; app.quit(); });

// --- lifecycle -----------------------------------------------------------
let relayoutTimer = null;
function relayout() { clearTimeout(relayoutTimer); relayoutTimer = setTimeout(() => { engine.setWorld(screen.getAllDisplays()); }, 300); }

app.on('ready', () => {
  store.load();
  try { app.setLoginItemSettings({ openAtLogin: store.get().settings.startOnBoot, args: ['--hidden'] }); } catch {}
  startEngine();
  createPetWindow();
  buildTray();
  initUpdates();
  screen.on('display-added', relayout);
  screen.on('display-removed', relayout);
  screen.on('display-metrics-changed', relayout);
  setInterval(pollForeground, 1500);  // window-awareness / fullscreen poll (Windows) — gentler on CPU
});
app.on('window-all-closed', () => { /* keep running in tray */ });
app.on('activate', () => openSettings());   // macOS: clicking the Dock icon opens Shop & Settings
app.on('before-quit', () => { app.isQuiting = true; store.save(); });

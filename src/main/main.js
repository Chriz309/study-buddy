'use strict';
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const store = require('./store');
const { CHARACTERS, CURRENCY, RARITIES, PERSONALITIES, characterById } = require('../shared/catalog');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const isDev = !app.isPackaged;
const DRIVE_URL = 'https://drive.google.com/drive/folders/1vPoKKqMPH1ZbTRkgT_10apMRS_mb3W7c';

let overlay = null;      // the transparent full-desktop pet layer
let settingsWin = null;  // normal window for shop/settings
let tray = null;
let interactive = false; // whether the overlay currently accepts the mouse
let update = { status: 'idle', info: null };

// --- single instance ----------------------------------------------------
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { showOverlay(); openSettings(); });

// --- geometry ------------------------------------------------------------
function virtualBounds() {
  const displays = screen.getAllDisplays();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of displays) {
    const b = d.bounds;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// display rects in overlay-local coordinates (origin at overlay top-left)
function displaysForRenderer() {
  const vb = virtualBounds();
  return {
    origin: { x: vb.x, y: vb.y },
    size: { width: vb.width, height: vb.height },
    primaryId: screen.getPrimaryDisplay().id,
    displays: screen.getAllDisplays().map(d => ({
      id: d.id,
      bounds: { x: d.bounds.x - vb.x, y: d.bounds.y - vb.y, width: d.bounds.width, height: d.bounds.height },
      work:   { x: d.workArea.x - vb.x, y: d.workArea.y - vb.y, width: d.workArea.width, height: d.workArea.height },
      scale: d.scaleFactor,
    })),
  };
}

// --- overlay window ------------------------------------------------------
function createOverlay() {
  const vb = virtualBounds();
  overlay = new BrowserWindow({
    x: vb.x, y: vb.y, width: vb.width, height: vb.height,
    transparent: true, frame: false, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, hasShadow: false,
    show: false, fullscreenable: false, type: process.platform === 'win32' ? undefined : 'panel',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  interactive = false;
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  overlay.once('ready-to-show', () => { overlay.showInactive(); pushDisplays(); pushState(); });
  overlay.on('closed', () => { overlay = null; });
}

function showOverlay() { if (!overlay) createOverlay(); else overlay.showInactive(); }

function relayoutOverlay() {
  if (!overlay) return;
  const vb = virtualBounds();
  overlay.setBounds(vb);
  pushDisplays();
}

// --- settings / shop window ---------------------------------------------
function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 760, height: 620, minWidth: 560, minHeight: 480,
    title: 'Study Buddy', backgroundColor: '#13131a', show: false,
    icon: path.join(ASSETS, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, '..', 'settings', 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
}

// --- broadcast helpers ---------------------------------------------------
function fullState() {
  const s = store.get();
  return {
    ...s,
    catalog: CHARACTERS,
    currency: CURRENCY,
    rarities: RARITIES,
    personalities: PERSONALITIES,
    rate: sparkRate(),
    update,
    platform: process.platform,
    appVersion: app.getVersion(),
  };
}
function pushState() {
  const payload = fullState();
  for (const w of [overlay, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('state', payload);
  }
}
function pushDisplays() {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('displays', displaysForRenderer());
}

// --- economy -------------------------------------------------------------
function sparkRate() {
  const s = store.get();
  const lvl = (s.levels && s.levels[s.active]) || 0;
  return +(1 + 0.4 * (s.owned.length - 1) + 0.1 * lvl).toFixed(2);
}
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick) / 1000; lastTick = now;
  const s = store.get();
  if (!s.settings.paused) {
    store.set({ sparks: +(s.sparks + sparkRate() * dt).toFixed(3) });
  }
}, 1000);
// lighter broadcast of just the number so UIs stay live without full repaints
setInterval(() => {
  const s = store.get();
  for (const w of [overlay, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('sparks', s.sparks);
  }
}, 1000);

// --- cursor stream (authoritative, multi-monitor) ------------------------
setInterval(() => {
  if (!overlay || overlay.isDestroyed()) return;
  const vb = virtualBounds();
  const p = screen.getCursorScreenPoint();
  overlay.webContents.send('cursor', { x: p.x - vb.x, y: p.y - vb.y });
}, 1000 / 30);

// --- tray ----------------------------------------------------------------
function buildTray() {
  const img = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('Study Buddy');
  refreshTrayMenu();
  tray.on('click', () => openSettings());
}
function refreshTrayMenu() {
  if (!tray) return;
  const s = store.get();
  const shown = overlay && overlay.isVisible();
  const menu = Menu.buildFromTemplate([
    { label: 'Shop & Settings…', click: () => openSettings() },
    { label: '📂  Open the Drive', click: () => shell.openExternal(DRIVE_URL) },
    { type: 'separator' },
    { label: s.settings.paused ? '▶  Resume idle points' : '⏸  Pause idle points', click: () => toggle('paused') },
    { label: shown ? '🙈  Hide buddy' : '👋  Show buddy', click: () => {
        if (shown) overlay.hide(); else showOverlay();
        refreshTrayMenu();
      } },
    { label: 'Start on login', type: 'checkbox', checked: s.settings.startOnBoot, click: (mi) => setStartOnBoot(mi.checked) },
    { type: 'separator' },
    { label: 'About', click: () => openSettings() },
    { label: 'Quit Study Buddy', click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}
function toggle(key) {
  const s = store.get();
  store.set({ settings: { [key]: !s.settings[key] } });
  pushState(); refreshTrayMenu();
}

// --- start on boot -------------------------------------------------------
function setStartOnBoot(enabled) {
  store.set({ settings: { startOnBoot: enabled } });
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
  } catch (e) { /* unsupported platform */ }
  pushState(); refreshTrayMenu();
}

// --- auto update ---------------------------------------------------------
function initUpdates() {
  if (isDev) return; // never in dev
  let autoUpdater;
  try { autoUpdater = require('electron-updater').autoUpdater; } catch { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.on('checking-for-update', () => { update = { status: 'checking', info: null }; pushState(); });
  autoUpdater.on('update-available', (i) => { update = { status: 'available', info: { version: i.version } }; pushState(); });
  autoUpdater.on('update-not-available', () => { update = { status: 'current', info: null }; pushState(); });
  autoUpdater.on('error', (e) => { update = { status: 'error', info: { message: String(e && e.message || e) } }; pushState(); });
  autoUpdater.on('update-downloaded', (i) => {
    update = { status: 'downloaded', info: { version: i.version } }; pushState();
    if (tray) tray.displayBalloon && tray.displayBalloon({ title: 'Study Buddy', content: `Update ${i.version} ready — restart to apply.` });
  });
  ipcMain.handle('update:check', () => { try { autoUpdater.checkForUpdates(); } catch {} return true; });
  ipcMain.handle('update:install', () => { try { autoUpdater.quitAndInstall(); } catch {} return true; });
  setTimeout(() => { try { autoUpdater.checkForUpdatesAndNotify(); } catch {} }, 4000);
}

// --- IPC -----------------------------------------------------------------
ipcMain.handle('state:get', () => fullState());

ipcMain.handle('settings:patch', (_e, patch) => {
  store.set({ settings: patch });
  if ('startOnBoot' in patch) setStartOnBoot(patch.startOnBoot);
  pushState(); refreshTrayMenu();
  return fullState();
});

ipcMain.handle('buddy:unlock', (_e, id) => {
  const s = store.get(); const c = characterById(id);
  if (!c || !c.implemented) return { ok: false, reason: 'unavailable' };
  if (s.owned.includes(id)) return { ok: true };
  if (s.sparks < c.cost) return { ok: false, reason: 'poor' };
  store.set({ sparks: +(s.sparks - c.cost).toFixed(3), owned: [...s.owned, id], active: id });
  pushState();
  return { ok: true };
});

ipcMain.handle('buddy:setActive', (_e, id) => {
  const s = store.get();
  if (s.owned.includes(id)) { store.set({ active: id }); pushState(); }
  return fullState();
});

// pet interactions (pet / feed) award sparks and can raise a level
ipcMain.handle('buddy:earn', (_e, n) => {
  const s = store.get();
  store.set({ sparks: +(s.sparks + Math.max(0, n || 0)).toFixed(3) });
  return store.get().sparks;
});
function feedCost(level) { return 50 * (level + 1); }      // rises as the pet grows
ipcMain.handle('buddy:feed', (_e, id) => {
  const s = store.get();
  if (!s.owned.includes(id)) return { ok: false, reason: 'unowned' };
  const cur = (s.levels && s.levels[id]) || 0;
  const cost = feedCost(cur);
  if (s.sparks < cost) return { ok: false, reason: 'poor', cost };
  store.set({ sparks: +(s.sparks - cost).toFixed(3), levels: { ...s.levels, [id]: cur + 1 } });
  pushState();
  return { ok: true, level: cur + 1, sparks: store.get().sparks, next: feedCost(cur + 1) };
});

ipcMain.on('overlay:interactive', (_e, on) => {
  if (!overlay || overlay.isDestroyed()) return;
  if (on === interactive) return;
  interactive = on;
  if (on) overlay.setIgnoreMouseEvents(false);
  else overlay.setIgnoreMouseEvents(true, { forward: true });
});

ipcMain.on('app:openSettings', () => openSettings());
ipcMain.on('app:toggle', (_e, key) => toggle(key));
ipcMain.on('app:hideBuddy', () => { if (overlay) overlay.hide(); refreshTrayMenu(); });
ipcMain.on('app:showBuddy', () => { showOverlay(); refreshTrayMenu(); });
ipcMain.on('app:openEmail', () => shell.openExternal('mailto:christopherblairhook@gmail.com'));
ipcMain.on('app:openDrive', () => shell.openExternal(DRIVE_URL));
ipcMain.on('app:openWhatsApp', () => shell.openExternal('https://wa.me/27729633580'));
ipcMain.on('app:quit', () => { app.isQuiting = true; app.quit(); });

// --- lifecycle -----------------------------------------------------------
app.on('ready', () => {
  store.load();
  // apply persisted boot setting
  try { app.setLoginItemSettings({ openAtLogin: store.get().settings.startOnBoot, args: ['--hidden'] }); } catch {}
  createOverlay();
  buildTray();
  initUpdates();

  screen.on('display-added', relayoutOverlay);
  screen.on('display-removed', relayoutOverlay);
  screen.on('display-metrics-changed', relayoutOverlay);

  const startedHidden = process.argv.includes('--hidden');
  if (!startedHidden) setTimeout(() => { /* overlay already shown; settings stays closed */ }, 100);
});

app.on('window-all-closed', (e) => { /* keep running in tray */ });
app.on('before-quit', () => { app.isQuiting = true; store.save(); });

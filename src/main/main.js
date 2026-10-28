'use strict';
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const store = require('./store');
const engine = require('./engine');
const { CHARACTERS, CURRENCY, RARITIES, PERSONALITIES, characterById } = require('../shared/catalog');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const INDEX = path.join(__dirname, '..', 'renderer', 'index.html');
const isDev = !app.isPackaged;
const DRIVE_URL = 'https://drive.google.com/drive/folders/1vPoKKqMPH1ZbTRkgT_10apMRS_mb3W7c';

let overlays = new Map();   // displayId -> BrowserWindow (one transparent layer per monitor)
let settingsWin = null;
let tray = null;
let ownerId = null;         // which display currently shows the pet
let update = { status: 'idle', info: null };

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { showAllOverlays(); openSettings(); });

// --- per-display overlays -----------------------------------------------
function createOverlays() {
  destroyOverlays();
  for (const d of screen.getAllDisplays()) {
    const b = d.bounds;
    const w = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height,
      transparent: true, frame: false, resizable: false, movable: false,
      skipTaskbar: true, focusable: false, hasShadow: false, show: false, fullscreenable: false,
      type: process.platform === 'win32' ? undefined : 'panel',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
    });
    w._displayId = d.id; w._bounds = b; w._interactive = false;
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    w.setIgnoreMouseEvents(true, { forward: true });
    w.loadFile(INDEX);
    w.once('ready-to-show', () => { applyVisibility(); w.webContents.send('state', fullState()); });
    w.on('closed', () => { overlays.delete(d.id); });
    overlays.set(d.id, w);
  }
  engine.setWorld(screen.getAllDisplays());
  syncEngineSettings();
}
function destroyOverlays() { for (const w of overlays.values()) if (w && !w.isDestroyed()) w.destroy(); overlays.clear(); }
let userHidden = false;   // user hid the buddy via the tray
function applyVisibility() {
  for (const [id, w] of overlays) { if (!w || w.isDestroyed()) continue;
    const vis = !userHidden && !fsDisplays.has(id);
    if (vis && !w.isVisible()) w.showInactive();
    else if (!vis && w.isVisible()) w.hide();
  }
}
function showAllOverlays() { userHidden = false; if (overlays.size === 0) createOverlays(); applyVisibility(); }
function hideAllOverlays() { userHidden = true; applyVisibility(); }
function overlaysVisible() { return !userHidden && overlays.size > 0; }
function winOf(sender) { for (const w of overlays.values()) if (w && !w.isDestroyed() && w.webContents === sender) return w; return null; }

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
      const w = overlays.get(ownerId);
      if (w && !w.isDestroyed()) w.webContents.send('petEvent', Object.assign({ type }, data || {}));
    },
  }, Date.now());
  engine.pos = { x: 0, y: 0 };
  engine.setWorld(screen.getAllDisplays());
  // start somewhere sensible on the primary
  const pb = screen.getPrimaryDisplay().workArea;
  engine.pos = { x: pb.x + pb.width * 0.4, y: pb.y + pb.height - engine.size };
  syncEngineSettings();

  setInterval(() => {
    if (overlays.size === 0 || !overlaysVisible()) return;
    const now = Date.now();
    const cur = screen.getCursorScreenPoint();
    engine.setCursor({ x: cur.x, y: cur.y });
    engine.tick(now);
    broadcastPet();
    updateInteractive(cur);
  }, 1000 / 60);
}
function broadcastPet() {
  const d = ownerDisplay(); if (!d) return; ownerId = d.id; const b = d.bounds;
  for (const [id, w] of overlays) { if (!w || w.isDestroyed()) continue;
    if (id === d.id) w.webContents.send('pet', { show: true, x: engine.pos.x - b.x, y: engine.pos.y - b.y, size: engine.size, state: engine.state, facing: engine.facing });
    else w.webContents.send('pet', { show: false });
  }
}
function updateInteractive(cur) {
  const d = ownerDisplay(); const hit = !!d && engine.hitTest(cur.x, cur.y);
  for (const [id, w] of overlays) { if (!w || w.isDestroyed()) continue;
    const want = hit && d && id === d.id;
    if (w._interactive !== want) { w._interactive = want;
      if (want) w.setIgnoreMouseEvents(false); else w.setIgnoreMouseEvents(true, { forward: true }); }
  }
}
function syncEngineSettings() {
  const s = store.get().settings;
  engine.setSettings({ speed: s.speed, personality: s.personality, mischief: s.mischief });
  engine.setSize(s.size || 140);
}

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
  return { ...s, catalog: CHARACTERS, currency: CURRENCY, rarities: RARITIES, personalities: PERSONALITIES,
    rate: sparkRate(), update, platform: process.platform, appVersion: app.getVersion() };
}
function pushState() {
  const payload = fullState();
  for (const w of [...overlays.values(), settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('state', payload);
}

// --- economy -------------------------------------------------------------
function sparkRate() { const s = store.get(); const lvl = (s.levels && s.levels[s.active]) || 0; return +(1 + 0.4 * (s.owned.length - 1) + 0.1 * lvl).toFixed(2); }
let lastTick = Date.now();
setInterval(() => { const now = Date.now(); const dt = (now - lastTick) / 1000; lastTick = now;
  const s = store.get(); if (!s.settings.paused) store.set({ sparks: +(s.sparks + sparkRate() * dt).toFixed(3) }); }, 1000);
setInterval(() => { const s = store.get(); for (const w of [...overlays.values(), settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('sparks', s.sparks); }, 1000);

// --- tray ----------------------------------------------------------------
function buildTray() {
  const img = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
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
    { label: shown ? '🙈  Hide buddy' : '👋  Show buddy', click: () => { if (shown) hideAllOverlays(); else showAllOverlays(); refreshTrayMenu(); } },
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
function initUpdates() {
  if (isDev) return; let autoUpdater;
  try { autoUpdater = require('electron-updater').autoUpdater; } catch { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.on('checking-for-update', () => { update = { status: 'checking', info: null }; pushState(); });
  autoUpdater.on('update-available', (i) => { update = { status: 'available', info: { version: i.version } }; pushState(); });
  autoUpdater.on('update-not-available', () => { update = { status: 'current', info: null }; pushState(); });
  autoUpdater.on('error', (e) => { update = { status: 'error', info: { message: String(e && e.message || e) } }; pushState(); });
  autoUpdater.on('update-downloaded', (i) => { update = { status: 'downloaded', info: { version: i.version } }; pushState();
    if (tray) tray.displayBalloon && tray.displayBalloon({ title: 'Study Buddy', content: `Update ${i.version} ready — restart to apply.` }); });
  ipcMain.handle('update:check', () => { try { autoUpdater.checkForUpdates(); } catch {} return true; });
  ipcMain.handle('update:install', () => { try { autoUpdater.quitAndInstall(); } catch {} return true; });
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
ipcMain.handle('buddy:setActive', (_e, id) => { const s = store.get(); if (s.owned.includes(id)) { store.set({ active: id }); pushState(); } return fullState(); });
ipcMain.handle('buddy:earn', (_e, n) => { const s = store.get(); store.set({ sparks: +(s.sparks + Math.max(0, n || 0)).toFixed(3) }); return store.get().sparks; });
function feedCost(level) { return 50 * (level + 1); }
ipcMain.handle('buddy:feed', (_e, id) => {
  const s = store.get(); if (!s.owned.includes(id)) return { ok: false, reason: 'unowned' };
  const cur = (s.levels && s.levels[id]) || 0; const cost = feedCost(cur);
  if (s.sparks < cost) return { ok: false, reason: 'poor', cost };
  store.set({ sparks: +(s.sparks - cost).toFixed(3), levels: { ...s.levels, [id]: cur + 1 } }); pushState();
  // tell the pet to react happily
  const w = overlays.get(ownerId); if (w && !w.isDestroyed()) w.webContents.send('petEvent', { type: 'fed' });
  return { ok: true, level: cur + 1, sparks: store.get().sparks, next: feedCost(cur + 1) };
});

// pet input from the owning overlay (coords are local to that window's display)
ipcMain.on('pet:grab', () => engine.grab());
ipcMain.on('pet:drag', (e, p) => { const w = winOf(e.sender); if (!w) return; const b = w._bounds; engine.dragTo(p.x + b.x, p.y + b.y); });
ipcMain.on('pet:release', () => engine.release());
ipcMain.on('pet:tap', () => engine.petted());

ipcMain.on('app:openSettings', () => openSettings());
ipcMain.on('app:toggle', (_e, key) => toggle(key));
ipcMain.on('app:hideBuddy', () => { hideAllOverlays(); refreshTrayMenu(); });
ipcMain.on('app:showBuddy', () => { showAllOverlays(); refreshTrayMenu(); });
ipcMain.on('app:openEmail', () => shell.openExternal('mailto:christopherblairhook@gmail.com'));
ipcMain.on('app:openDrive', () => shell.openExternal(DRIVE_URL));
ipcMain.on('app:openWhatsApp', () => shell.openExternal('https://wa.me/27729633580'));
ipcMain.on('app:quit', () => { app.isQuiting = true; app.quit(); });

// --- lifecycle -----------------------------------------------------------
let relayoutTimer = null;
function relayout() { clearTimeout(relayoutTimer); relayoutTimer = setTimeout(() => { createOverlays(); }, 300); }

app.on('ready', () => {
  store.load();
  try { app.setLoginItemSettings({ openAtLogin: store.get().settings.startOnBoot, args: ['--hidden'] }); } catch {}
  startEngine();
  createOverlays();
  buildTray();
  initUpdates();
  screen.on('display-added', relayout);
  screen.on('display-removed', relayout);
  screen.on('display-metrics-changed', relayout);
  setInterval(pollForeground, 800);   // window-awareness poll (Windows)
});
app.on('window-all-closed', () => { /* keep running in tray */ });
app.on('before-quit', () => { app.isQuiting = true; store.save(); });

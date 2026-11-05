// The cat-chase toy (a butterfly) lives in its OWN tiny window: transparent, frameless,
// always-on-top, non-focusable, fully click-through and not in the taskbar. It is created
// when a chase starts and destroyed when it ends (plus a hard time cap), so nothing lingers.
'use strict';
const { BrowserWindow } = require('electron');
const path = require('path');

const PAGE = path.join(__dirname, '..', 'renderer', 'toy.html');
const HARD_CAP_MS = 30000;      // a chase is ~12 s; this guarantees the window can never be left behind

let win = null, capTimer = null, ready = false, queued = null, size = 48;

const alive = () => win && !win.isDestroyed();
const num = (n, d) => (Number.isFinite(n) ? n : d);

function spawn({ x, y, size: s, dir }) {
  destroy();
  size = Math.max(48, Math.min(160, Math.round(num(s, 48))));
  win = new BrowserWindow({
    width: size, height: size, x: Math.round(num(x, 0) - size / 2), y: Math.round(num(y, 0) - size / 2),
    transparent: true, frame: false, resizable: false, movable: false, skipTaskbar: true, focusable: false,
    hasShadow: false, show: false, fullscreenable: false, minimizable: false, maximizable: false, closable: true,
    type: process.platform === 'win32' ? undefined : 'panel',
    webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true },
  });
  const w = win; ready = false; queued = null;
  w.setIgnoreMouseEvents(true);                       // no forward: it never sees the mouse at all
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false, skipTransformProcessType: true });
  w.setOpacity(0);
  w.loadFile(PAGE);
  w.once('ready-to-show', () => {
    if (!alive() || win !== w) return;
    ready = true; try { w.webContents.executeJavaScript('document.body.dataset.dir=' + (dir < 0 ? -1 : 1)).catch(() => {}); } catch {}
    w.showInactive(); w.setOpacity(queued != null ? queued : 1);   // showInactive: never takes focus
  });
  w.on('closed', () => { if (win === w) { win = null; clearTimeout(capTimer); capTimer = null; } });
  clearTimeout(capTimer); capTimer = setTimeout(destroy, HARD_CAP_MS);
}

function move({ x, y, dir }) {
  if (!alive()) return;
  try {
    win.setPosition(Math.round(num(x, 0) - size / 2), Math.round(num(y, 0) - size / 2));
    if (dir) win.webContents.executeJavaScript('document.body.dataset.dir=' + (dir < 0 ? -1 : 1)).catch(() => {});
  } catch { /* transient bad value: skip the frame */ }
}

function fade({ a }) {
  queued = Math.max(0, Math.min(1, num(a, 1)));
  if (alive() && ready) { try { win.setOpacity(queued); } catch {} }
}

function destroy() {
  clearTimeout(capTimer); capTimer = null;
  const w = win; win = null; ready = false; queued = null;
  if (w && !w.isDestroyed()) { try { w.destroy(); } catch {} }
}

function handle(cmd) {
  if (!cmd) return;
  switch (cmd.type) { case 'spawn': spawn(cmd); break; case 'move': move(cmd); break; case 'fade': fade(cmd); break; case 'end': destroy(); break; }
}

const capture = () => (alive() ? win.webContents.capturePage() : Promise.resolve(null));
module.exports = { handle, _capture: capture, destroy, isActive: () => !!alive(), _info: () => (alive() ? { focusable: win.isFocusable(), focused: win.isFocused(), visible: win.isVisible(), bounds: win.getBounds() } : null) };

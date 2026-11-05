'use strict';
// Electron side of the illusion: per-display capture (memory only) and the overlay window.
// Overlay = transparent, frameless, fully click-through, non-focusable, skipTaskbar, 'screen-saver' level.
// It is created only for a prank and destroyed after it; its contents (the crops) die with it.
const path = require('path');
const logic = require('./logic');

function createHost({ BrowserWindow, desktopCapturer, screen, getPetWin }) {
  let win = null, readyCb = null, errCb = null;
  const PAGE = path.join(__dirname, '..', '..', 'mischief', 'overlay.html'), PRELOAD = path.join(__dirname, '..', '..', 'mischief', 'overlay-preload.js');

  const displays = () => screen.getAllDisplays().map(d => ({
    id: d.id, bounds: { ...d.bounds }, workArea: { ...d.workArea }, scaleFactor: d.scaleFactor || 1,
    phys: (() => { try { const r = screen.dipToScreenRect(null, d.bounds); return logic.R(r.x, r.y, r.width, r.height); } catch { return logic.R(d.bounds.x, d.bounds.y, d.bounds.width, d.bounds.height); } })(),
  }));
  // probe rects come in PHYSICAL pixels: screenToDipRect (handles mixed-DPI desktops), with the pure maths as the fallback
  function toDip(r) {
    try { const d = screen.screenToDipRect(null, { x: r.x, y: r.y, width: r.w, height: r.h }); return logic.R(d.x, d.y, d.width, d.height); } catch { return logic.physToDip(r, displays()); }
  }
  async function shotOf(display) {
    const sf = display.scaleFactor || 1, size = { width: Math.round(display.bounds.width * sf), height: Math.round(display.bounds.height * sf) };
    const srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
    const s = srcs.find(q => String(q.display_id) === String(display.id)) || srcs[0];
    return s && s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail : null;
  }
  // crops: { key: dipRect }. Returns { key: { rect, png (data URL), padL.. } }. Never touches disk or network.
  async function capture(display, crops, padPx) {
    const img = await shotOf(display); if (!img) return null;
    const sz = img.getSize(), out = {};
    for (const k of Object.keys(crops)) {
      const c = logic.cropFor(display, crops[k], padPx, { w: sz.width, h: sz.height }); if (c.w < 2 || c.h < 2) return null;
      const part = img.crop({ x: c.x, y: c.y, width: c.w, height: c.h });
      out[k] = { rect: crops[k], png: part.toDataURL(), padL: c.padL, padT: c.padT, padR: c.padR, padB: c.padB };
    }
    return out;
  }
  // raw pixels of a DIP rect (for the dev restore check only; kept in memory and compared, never saved)
  async function pixels(display, rect) {
    const img = await shotOf(display); if (!img) return null;
    const sz = img.getSize(), c = logic.cropFor(display, rect, 0, { w: sz.width, h: sz.height });
    return { w: c.w, h: c.h, data: img.crop({ x: c.x, y: c.y, width: c.w, height: c.h }).toBitmap() };
  }
  function openOverlay(display, scene, onReady, onError) {
    close();
    const b = display.bounds;
    win = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height, transparent: true, frame: false, resizable: false, movable: false, skipTaskbar: true, focusable: false,
      hasShadow: false, show: false, fullscreenable: false, minimizable: false, maximizable: false, closable: true,
      type: process.platform === 'win32' ? undefined : 'panel',
      webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true, backgroundThrottling: false },
    });
    const w = win; readyCb = onReady; errCb = onError;
    w.setIgnoreMouseEvents(true);                                    // no forward: it never sees the mouse at all
    w.setAlwaysOnTop(true, 'screen-saver'); w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false, skipTransformProcessType: true });
    w.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    w.loadFile(PAGE);
    w.webContents.once('did-finish-load', () => { if (win === w && !w.isDestroyed()) w.webContents.send('mischief:scene', scene); });
    w.on('closed', () => { if (win === w) win = null; });
    return w;
  }
  const show = () => {                       // called once the first frame is drawn, so nothing flashes
    if (!win || win.isDestroyed()) return;
    win.showInactive(); const pet = getPetWin(); try { if (pet && !pet.isDestroyed()) pet.moveTop(); } catch {}   // the pet stays above the overlay
  };
  const go = (startAt) => { if (win && !win.isDestroyed()) win.webContents.send('mischief:go', { startAt }); };
  function close() { const w = win; win = null; readyCb = errCb = null; if (w && !w.isDestroyed()) { try { w.destroy(); } catch {} } }
  return { displays, toDip, capture, pixels, openOverlay, show, go, close, count: () => (win && !win.isDestroyed() ? 1 : 0),
    _ready: () => { const f = readyCb; readyCb = null; if (f) f(); }, _error: (m) => { const f = errCb; if (f) f(m); }, _win: () => win };
}
module.exports = { createHost };

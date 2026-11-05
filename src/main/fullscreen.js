'use strict';
// Which monitors are covered by a fullscreen app (a game, a movie)? Pure logic: no Electron, no I/O, unit-tested (test/fullscreen.test.js).
//
// Everything is in PHYSICAL pixels: the probe (fgprobe.js) runs per-monitor DPI aware, and the displays come from
// screen.dipToScreenRect(null, display.bounds). That makes the cover test independent of the 100% / 125% mix.
//
// Rule, per monitor: walk the windows from the top of the z-order down. Skip what cannot be "the app on screen" (invisible,
// minimised, cloaked, our own windows, shell windows, tool windows, click-through overlays, anything covering less than
// SUBSTANTIAL of the monitor). The first window left decides: it covers the whole monitor (2 px tolerance) -> fullscreen;
// anything else -> a normal window is in front -> not fullscreen. The exception is a MAXIMISED window with a caption, which can reach every edge
// when the taskbar auto-hides. A non-maximised window keeps counting even with a caption style: some players and borderless games keep that bit.
// SHQueryUserNotificationState 3 (exclusive Direct3D) or 4 (presentation mode) additionally marks the foreground window's monitor.
// State 2 (busy) is NOT used: our own overlay windows can cause it.

const TOL = 2;                 // px: a window "covers" the monitor when it reaches every edge within this
const SUBSTANTIAL = 0.4;       // a window covering less of the monitor than this is a toast / widget / small tool: ignored
const HOLD_MS = 120000;        // how long a failed probe keeps the last known state (see createTracker)

const SHELL_CLASSES = new Set(['', 'Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'NotifyIconOverflowWindow', 'TopLevelWindowForOverflowXamlIsland',
  'Windows.UI.Core.CoreWindow', 'XamlExplorerHostIslandWindow', 'TaskListThumbnailWnd', 'TaskListOverlayWnd', 'MultitaskingViewFrame', 'ForegroundStaging', 'SysShadow']);

const area = (r) => Math.max(0, r.w) * Math.max(0, r.h);
function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
const covers = (r, d) => r.x <= d.x + TOL && r.y <= d.y + TOL && r.x + r.w >= d.x + d.w - TOL && r.y + r.h >= d.y + d.h - TOL;

// ignorable for the whole rule, whatever monitor we look at
function skipped(w, ownPids) {
  return !w || !w.visible || w.iconic || w.cloaked || w.toolwindow || w.transparent || SHELL_CLASSES.has(String(w.cls || '').trim()) || (ownPids && ownPids.has(w.pid));
}

// windows: top -> bottom [{ rect:{x,y,w,h}, cls, pid, visible, iconic, cloaked, zoomed, caption, toolwindow, transparent, topmost }]
// displays: [{ id, rect:{x,y,w,h} }]   ns: SHQueryUserNotificationState   fg: the foreground window (same shape) or null
// returns the Set of display ids that are fullscreen
function fullscreenDisplays({ windows, displays, ns, fg, ownPids }) {
  const out = new Set(), own = ownPids instanceof Set ? ownPids : new Set(ownPids || []);
  for (const d of displays || []) {
    const need = area(d.rect) * SUBSTANTIAL;
    for (const w of windows || []) {
      if (skipped(w, own) || overlap(w.rect, d.rect) < need) continue;
      if (covers(w.rect, d.rect) && !(w.zoomed && w.caption)) out.add(d.id);
      break;   // the first substantial window decides, either way
    }
  }
  if ((ns === 3 || ns === 4) && fg && fg.rect && area(fg.rect) > 0 && !skipped(Object.assign({ visible: true }, fg), own)) {
    let best = null, ba = 0;
    for (const d of displays || []) { const a = overlap(fg.rect, d.rect); if (a > ba) { ba = a; best = d; } }
    if (best) out.add(best.id);
  }
  return out;
}

// ---------------------------------------------------------------- probe text -> data
// one line from the PowerShell helper:  "l,t,r,b|class|pid|ns|w1;w2;..."   (first part = foreground window, then the z-ordered window list)
// each window:  "l,t,r,b,flags,pid,class"   flags: 1 visible, 2 iconic, 4 cloaked, 8 zoomed, 16 caption, 32 toolwindow, 64 transparent, 128 topmost
const FLAG = { visible: 1, iconic: 2, cloaked: 4, zoomed: 8, caption: 16, toolwindow: 32, transparent: 64, topmost: 128 };
const toRect = (a) => (a.length === 4 && a.every(Number.isFinite) ? { x: a[0], y: a[1], w: a[2] - a[0], h: a[3] - a[1] } : null);
function parseWindow(s) {
  const p = String(s).split(','); if (p.length < 7) return null;
  const n = p.slice(0, 6).map(Number), rect = toRect(n.slice(0, 4)); if (!rect || !Number.isFinite(n[4]) || !Number.isFinite(n[5])) return null;
  const w = { rect, pid: n[5], cls: p.slice(6).join(',') };
  for (const k of Object.keys(FLAG)) w[k] = (n[4] & FLAG[k]) !== 0;
  return w;
}
function parseProbe(text) {
  if (typeof text !== 'string') return null;
  const parts = text.trim().split('|'); if (parts.length < 5) return null;
  const rect = toRect(parts[0].split(',').map(Number)); if (!rect && parts[0].split(',').length !== 4) return null;
  const pid = Number(parts[2]), ns = Number(parts[3]); if (!Number.isFinite(pid) || !Number.isFinite(ns)) return null;
  const fg = rect && rect.w > 0 && rect.h > 0 ? { rect, cls: parts[1], pid, visible: true, iconic: false, cloaked: false, zoomed: false, caption: false, toolwindow: false, transparent: false, topmost: false } : null;
  const windows = parts.slice(4).join('|').split(';').filter(Boolean).map(parseWindow).filter(Boolean);
  return { fg, ns, windows };
}

// ---------------------------------------------------------------- hold / expire
// A failed or slow probe says nothing about the screen, so it must not change what we believe: the last known set is held.
// Only a successful probe replaces it. The hold is capped (measured from the last success) so a dead probe cannot hide the sprite forever.
function createTracker({ holdMs = HOLD_MS } = {}) {
  let cur = new Set(), okAt = 0;
  return {
    // set = the Set from a successful probe, or null for a failed one. Returns the current Set.
    update(set, now) {
      if (set) { cur = new Set(set); okAt = now; }
      else if (cur.size && now - okAt > holdMs) cur = new Set();
      return new Set(cur);
    },
    forget(validIds) { cur = new Set([...cur].filter(id => validIds.has(id))); return new Set(cur); },   // unplugged monitors
    reset() { cur = new Set(); okAt = 0; },
    get: () => new Set(cur),
  };
}

module.exports = { fullscreenDisplays, parseProbe, createTracker, SHELL_CLASSES, HOLD_MS, SUBSTANTIAL, TOL };

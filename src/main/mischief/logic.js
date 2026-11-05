'use strict';
// Pure logic for desktop mischief: rectangles + DPI, target classification, scheduling, abort rules and prank picking.
// No Electron, no I/O: everything here is unit-tested (test/mischief.logic.test.js).

// ------------------------------------------------------------------ rectangles (all {x,y,w,h})
const R = (x, y, w, h) => ({ x, y, w, h });
const fromArr = (a) => (Array.isArray(a) && a.length === 4 && a.every(Number.isFinite) ? R(a[0], a[1], a[2], a[3]) : null);
const right = (r) => r.x + r.w, bottom = (r) => r.y + r.h;
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const inflate = (r, p) => R(r.x - p, r.y - p, r.w + 2 * p, r.h + 2 * p);
const intersects = (a, b) => a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
const containsPt = (r, p) => p.x >= r.x && p.x <= right(r) && p.y >= r.y && p.y <= bottom(r);
const union = (rs) => { const l = rs.filter(Boolean); if (!l.length) return null; const x0 = Math.min(...l.map(r => r.x)), y0 = Math.min(...l.map(r => r.y)), x1 = Math.max(...l.map(right)), y1 = Math.max(...l.map(bottom)); return R(x0, y0, x1 - x0, y1 - y0); };
const distToRect = (p, r) => Math.hypot(Math.max(r.x - p.x, 0, p.x - right(r)), Math.max(r.y - p.y, 0, p.y - bottom(r)));
const sameRect = (a, b, tol = 2) => !!a && !!b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;
const within = (inner, outer, tol = 0) => inner.x >= outer.x - tol && inner.y >= outer.y - tol && right(inner) <= right(outer) + tol && bottom(inner) <= bottom(outer) + tol;

// Physical pixels -> DIPs. `displays` = [{ bounds (DIP), phys (physical bounds), scaleFactor }]. The real app uses
// electron's screen.screenToDipRect (same maths, plus mixed-DPI quirks); this pure version is what the tests pin down.
function physToDip(r, displays) {
  let best = displays[0], bo = -1;
  for (const d of displays) {
    const ox = Math.max(0, Math.min(right(r), right(d.phys)) - Math.max(r.x, d.phys.x)), oy = Math.max(0, Math.min(bottom(r), bottom(d.phys)) - Math.max(r.y, d.phys.y));
    if (ox * oy > bo) { bo = ox * oy; best = d; }
  }
  const s = best.scaleFactor || 1;
  return R(best.bounds.x + (r.x - best.phys.x) / s, best.bounds.y + (r.y - best.phys.y) / s, r.w / s, r.h / s);
}
// A capture crop: the DIP rect (+pad physical px each side) as a physical rect inside the display's capture image.
function cropFor(display, rectDip, padPx, img) {
  const sf = display.scaleFactor || 1, b = display.bounds;
  const x0 = Math.floor((rectDip.x - b.x) * sf), y0 = Math.floor((rectDip.y - b.y) * sf), x1 = Math.ceil((right(rectDip) - b.x) * sf), y1 = Math.ceil((bottom(rectDip) - b.y) * sf);
  const cx0 = Math.max(0, x0 - padPx), cy0 = Math.max(0, y0 - padPx), cx1 = Math.min(img.w, x1 + padPx), cy1 = Math.min(img.h, y1 + padPx);
  return { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0, padL: x0 - cx0, padT: y0 - cy0, padR: cx1 - x1, padB: cy1 - y1, inner: R(x0, y0, x1 - x0, y1 - y0) };
}
const displayAt = (displays, p) => displays.find(d => containsPt(R(d.bounds.x, d.bounds.y, d.bounds.width, d.bounds.height), p)) || null;
const layoutKey = (displays) => displays.map(d => [d.id, d.bounds.x, d.bounds.y, d.bounds.width, d.bounds.height, d.scaleFactor].join(':')).join('|');

// ------------------------------------------------------------------ classifying what the probe saw
const ALLOWED_APPS = new Set(['winword', 'notepad', 'chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'wordpad', 'notepad++', 'write']);
const SHELL = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);
const appAllowed = (proc) => ALLOWED_APPS.has(String(proc || '').toLowerCase());

// raw = parsed probe scan (physical px). conv = physical rect -> DIP rect. Returns a model of DIP rects, or only what is usable.
function buildModel(raw, conv, displays) {
  const m = { bar: null, start: null, buttons: [], wifi: null, volume: null, battery: null, clock: null, desktop: [], rows: [], win: null };
  if (!raw) return m;
  const cv = (a) => { const r = fromArr(a); return r ? conv(r) : null; };
  const bar = cv(raw.bar);
  // taskbar must be a visible, bottom-docked, horizontal bar (auto-hide leaves a sliver; side/top taskbars are not supported)
  const disp = bar && displayAt(displays, center(bar));
  if (bar && disp) {
    const db = R(disp.bounds.x, disp.bounds.y, disp.bounds.width, disp.bounds.height);
    if (bar.h >= 24 && bar.w >= bar.h * 4 && Math.abs(bottom(bar) - bottom(db)) <= 3 && within(bar, inflate(db, 2))) m.bar = bar;
  }
  if (m.bar) {
    const tray = [];
    for (const it of raw.items || []) {
      const r = cv(it.r); if (!r || !within(r, inflate(m.bar, 2))) continue;
      if (it.k === 'start') m.start = r; else if (it.k === 'btn') m.buttons.push(r);
      else if (it.k === 'tray') tray.push({ r, n: String(it.n || '').toLowerCase(), c: it.c || '' });
    }
    m.buttons.sort((a, b) => a.x - b.x);
    const by = (re) => (tray.find(t => re.test(t.n)) || {}).r || null;
    m.wifi = by(/^(network|wi-?fi|internet|wlan)/); m.volume = by(/^(volume|speakers?|sound)/); m.battery = by(/^(power|battery)/); m.clock = by(/^(clock|time)/);
    // localised builds: fall back on the tray order network, volume, battery, clock
    const main = tray.filter(t => /Accent|Omni/.test(t.c) && !/ShowDesktop/.test(t.c)).map(t => t.r).sort((a, b) => a.x - b.x);
    if (main.length >= 3 && !m.clock) m.clock = main[main.length - 1];
    if (main.length >= 4) { m.wifi = m.wifi || main[0]; m.volume = m.volume || main[1]; m.battery = m.battery || main[2]; }
  }
  m.desktop = (raw.desk || []).map(cv).filter(Boolean);
  m.rows = desktopRows(m.desktop);
  const fg = raw.fg;
  if (fg && fg.r && !fg.i && !SHELL.has(fg.c)) {
    const r = cv(fg.r), d = r && displayAt(displays, center(r));
    if (r && d) m.win = { r, proc: String(fg.p || '').toLowerCase(), cls: fg.c || '', max: !!fg.z, h: fg.h, display: d, allowed: appAllowed(fg.p) };
  }
  return m;
}
// groups desktop icons that share a row (same top within tolerance) and are roughly evenly spaced: >=4 per row
function desktopRows(icons) {
  const rows = [];
  for (const r of [...icons].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find(q => Math.abs(q[0].y - r.y) <= 6);
    if (row) row.push(r); else rows.push([r]);
  }
  return rows.map(q => q.sort((a, b) => a.x - b.x)).filter(q => q.length >= 4);
}
// consecutive text-line fragments on the same line merge to one rect; tiny/huge fragments drop out
function groupLines(rects) {
  const lines = [];
  for (const r of [...rects].filter(q => q.h >= 8 && q.h <= 60 && q.w >= 12).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const l = lines.find(q => Math.abs(q.y - r.y) <= 4 && Math.abs(q.h - r.h) <= 6 && r.x <= right(q) + 12);
    if (l) { const x1 = Math.max(right(l), right(r)); l.x = Math.min(l.x, r.x); l.w = x1 - l.x; } else lines.push({ ...r });
  }
  return lines;
}

// ------------------------------------------------------------------ scheduling (one single timeout, never a poll)
const FREQ = { rare: [15, 30], normal: [3, 8], chaos: [0.5, 1.5] };   // minutes between prank attempts (chaos: every 30-90 s)
const FIRST_CHAOS_MS = [20000, 40000];   // the first prank after startup on chaos
function nextDelay(freq, R_ = Math.random) { const [a, b] = FREQ[freq] || FREQ.normal; return Math.round((a + R_() * (b - a)) * 60000); }
// Cursor activity without any poll: main's existing 60 fps loop feeds note(); this keeps an exponential moving average of speed.
function createActivity(tau = 3) {
  let last = null, ema = 0;
  return {
    note(x, y, nowMs) {
      if (last && nowMs > last.t) { const dt = (nowMs - last.t) / 1000, v = Math.hypot(x - last.x, y - last.y) / dt; ema += (v - ema) * Math.min(1, dt / tau); }
      last = { x, y, t: nowMs };
    },
    speed: () => ema,
    busy: (threshold = 350) => ema > threshold,
    reset() { last = null; ema = 0; },
  };
}
// null = may run now; otherwise the reason it must not
function blockedReason(c) {
  if (c.platform !== 'win32') return 'not-windows';
  if (!c.enabled) return 'disabled';
  if (c.running) return 'running';
  if (c.userHidden || !c.petShown) return 'hidden';
  if (c.paused || c.stayPut || c.reduceMotion) return 'quiet';
  if (c.locked || c.suspended) return 'locked';
  if (c.fullscreen) return 'fullscreen';
  if (c.userBusy) return 'user-busy';
  if (!c.petIdle) return 'sprite-busy';
  return null;
}

// ------------------------------------------------------------------ abort rules (rule 4)
const CAP_MS = 15000;
// ctx: { now, startedAt, cursor, near (rects), zones (rects the sprite/props occupy), nearPx, fg0, fg, caret0, caret, textMode, layout0, layout,
//        locked, suspended, fullscreen, grabbed, stop, probeLost }
function abortReason(c) {
  if (c.stop) return 'stopped';
  if (c.grabbed) return 'sprite-grabbed';
  if (c.locked) return 'session-locked';
  if (c.suspended) return 'suspended';
  if (c.layout0 !== c.layout) return 'display-changed';
  if (c.fullscreen) return 'fullscreen';
  if (c.probeLost) return 'probe-lost';
  if (c.pw) return 'password-field';
  if (c.fg0 && c.fg && (c.fg0.h !== c.fg.h || !sameRect(c.fg0.r, c.fg.r, 2))) return 'foreground-changed';
  if (c.textMode && !sameSig(c.caret0, c.caret)) return 'caret-changed';
  if (c.cursor) {
    const near = c.nearPx == null ? 56 : c.nearPx;
    for (const r of c.near || []) if (distToRect(c.cursor, r) <= near) return 'cursor-near-target';
    for (const z of c.zones || []) if (containsPt(inflate(z, 10), c.cursor)) return 'cursor-on-area';
  }
  if (c.now - c.startedAt >= CAP_MS) return 'time-cap';
  return null;
}
// caret signature: any of the signals moving counts as typing (rects compared with 1px slack)
function sameSig(a, b) {
  if (!a || !b) return true;
  const eq = (p, q) => (!p && !q) || (p && q && sameRect(p, q, 1));
  return eq(a.c, b.c) && eq(a.s, b.s) && eq(a.v, b.v);
}

// ------------------------------------------------------------------ picking
// gags: { id: { weight, find(model, env) -> targets|null, needsText } }. Returns [{id, targets}] shuffled by weight, recent ones last.
function candidates(gags, model, env, recent, R_ = Math.random, only) {
  const out = [];
  for (const id of Object.keys(gags)) {
    if (only && id !== only) continue;
    const g = gags[id]; let t = null;
    try { t = g.find(model, env); } catch { t = null; }
    if (!t) continue;
    const w = (g.weight || 1) * (recent && recent.includes(id) ? 0.15 : 1);
    out.push({ id, targets: t, key: -Math.log(1 - R_()) / w });   // weighted random order (exponential race)
  }
  return out.sort((a, b) => a.key - b.key);
}

// The overlay must never look like a fullscreen app (Windows then turns on Do Not Disturb and shifts the tray): it only covers the box the prank needs,
// and is always at least 16 px smaller than the display in both directions.
function overlayBox(area, bounds, margin = 160) {
  const x0 = Math.max(bounds.x, Math.floor(area.x - margin)), y0 = Math.max(bounds.y, Math.floor(area.y - margin));
  const x1 = Math.min(bounds.x + bounds.width, Math.ceil(area.x + area.w + margin)), y1 = Math.min(bounds.y + bounds.height, Math.ceil(area.y + area.h + margin));
  const w = Math.min(x1 - x0, bounds.width - 16), h = Math.min(y1 - y0, bounds.height - 16);
  return R(Math.min(x0, bounds.x + bounds.width - w), Math.min(y0, bounds.y + bounds.height - h), w, h);
}

module.exports = { FIRST_CHAOS_MS, overlayBox, R, fromArr, right, bottom, center, inflate, intersects, containsPt, union, distToRect, sameRect, within, physToDip, cropFor, displayAt, layoutKey,
  ALLOWED_APPS, appAllowed, buildModel, desktopRows, groupLines, FREQ, nextDelay, createActivity, blockedReason, CAP_MS, abortReason, sameSig, candidates };

// Dev restore check: compares the same screen areas before and after a prank (bitmaps of a whole display, physical pixels).
// Returns mean absolute channel difference (0..1), percent of pixels that differ by more than 24/255 in any channel, and the largest channel difference.
function compareRegions(a, b, rects, display) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return { mean: 1, pct: 100, max: 255 };
  let sum = 0, n = 0, bad = 0, max = 0;
  for (const r of rects) {
    const c = cropFor(display, r, 0, { w: a.w, h: a.h });
    for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) {
      const i = (y * a.w + x) * 4; let worst = 0;
      for (let k = 0; k < 3; k++) { const dd = Math.abs(a.data[i + k] - b.data[i + k]); sum += dd; worst = Math.max(worst, dd); }
      if (worst > 24) bad++; if (worst > max) max = worst; n++;
    }
  }
  return n ? { mean: sum / (n * 3 * 255), pct: (bad / n) * 100, max } : { mean: 0, pct: 0, max: 0 };
}
module.exports.compareRegions = compareRegions;

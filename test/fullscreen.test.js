'use strict';
// Fullscreen detection (src/main/fullscreen.js): pure, physical pixels, no Electron.
// Layout used throughout = the maintainer's desk: A = primary 1920x1080 at 100% (x=0), B = 1920x1080 physical at x=1920 shown at 125%.
const test = require('node:test');
const assert = require('node:assert/strict');
const fsd = require('../src/main/fullscreen');

const A = { id: 1, rect: { x: 0, y: 0, w: 1920, h: 1080 } };
const B = { id: 2, rect: { x: 1920, y: 0, w: 1920, h: 1080 } };
const DISPLAYS = [A, B];

let pidSeq = 1000;
// l,t,r,b in physical px; opts override the defaults of an ordinary visible top-level window
const win = (l, t, r, b, o = {}) => ({ rect: { x: l, y: t, w: r - l, h: b - t }, cls: 'GameWnd', pid: ++pidSeq, visible: true, iconic: false, cloaked: false,
  zoomed: false, caption: false, toolwindow: false, transparent: false, topmost: false, ...o });
const fsA = (o) => win(0, 0, 1920, 1080, o), fsB = (o) => win(1920, 0, 3840, 1080, o);
const ids = (set) => [...set].sort();
const run = (windows, extra = {}) => ids(fsd.fullscreenDisplays({ windows, displays: DISPLAYS, ns: 5, fg: null, ownPids: new Set([42]), ...extra }));

// ------------------------------------------------------------------ the rule
test('a window covering the 100% primary monitor is fullscreen (next to a 125% neighbour)', () => {
  assert.deepEqual(run([fsA()]), [1]);
});
test('a window covering the 125% monitor is fullscreen (physical px, so scaling is irrelevant)', () => {
  assert.deepEqual(run([fsB()]), [2]);
});
test('2px tolerance, but not 3+ px short', () => {
  assert.deepEqual(run([win(1, 1, 1919, 1079)]), [1]);
  assert.deepEqual(run([win(0, 0, 1920, 1070)]), []);
});
test('a toast / the taskbar / the start menu on top of a movie keeps it fullscreen', () => {
  const taskbar = win(0, 1040, 1920, 1080, { cls: 'Shell_TrayWnd', topmost: true });
  const toast = win(1500, 800, 1900, 1000, { cls: 'Windows.UI.Core.CoreWindow', topmost: true });
  const smallTopmost = win(1500, 700, 1900, 780, { cls: 'SomeToast', topmost: true });
  const startMenu = win(300, 300, 900, 1040, { cls: 'Windows.UI.Core.CoreWindow' });
  const host = win(300, 300, 900, 1040, { cls: 'XamlExplorerHostIslandWindow' });
  assert.deepEqual(run([taskbar, toast, smallTopmost, startMenu, host, fsA()]), [1]);
});
test('a movie on A with focus on B flags A only', () => {
  const work = win(1920, 0, 3840, 1040, { cls: 'Chrome_WidgetWin_1', zoomed: true, caption: true });
  assert.deepEqual(run([work, fsA()], { fg: work }), [1]);
});
test('a fullscreen window on each monitor flags both', () => {
  assert.deepEqual(run([fsB(), fsA()]), [1, 2]);
});
test('closing the movie clears it (a later probe without it)', () => {
  assert.deepEqual(run([fsA()]), [1]);
  assert.deepEqual(run([win(100, 100, 1000, 700, { caption: true })]), []);
});
test('a normal window in front of a background fullscreen one: not fullscreen', () => {
  const normal = win(200, 100, 1700, 1000, { caption: true });   // ~65% of the monitor
  assert.deepEqual(run([normal, fsA()]), []);
});
test('a small normal window in front is ignored (only substantial windows count)', () => {
  assert.deepEqual(run([win(100, 100, 500, 400, { caption: true }), fsA()]), [1]);
});
test('a normal window on the OTHER monitor does not affect this one', () => {
  assert.deepEqual(run([win(2000, 100, 3700, 1000, { caption: true }), fsA()]), [1]);
});
test('a transparent (click-through) full-monitor overlay is ignored', () => {
  const overlay = fsA({ transparent: true, topmost: true, cls: 'CEF-OSC-WIDGET' });
  assert.deepEqual(run([overlay, win(100, 100, 900, 700, { caption: true })]), []);   // over a normal window: still not fullscreen
  assert.deepEqual(run([overlay, fsA()]), [1]);                                       // over a movie: still fullscreen
});
test('a maximized window with a caption is not fullscreen, even with an auto-hidden taskbar', () => {
  assert.deepEqual(run([win(-8, -8, 1928, 1088, { zoomed: true, caption: true })]), []);
  assert.deepEqual(run([fsA({ caption: true })]), []);
});
test('invisible, minimised, cloaked, tool-window and own-process windows are skipped', () => {
  const normal = win(100, 100, 1800, 1000, { caption: true });
  for (const o of [{ visible: false }, { iconic: true }, { cloaked: true }, { toolwindow: true }, { pid: 42 }]) {
    assert.deepEqual(run([fsA(o), normal]), [], 'skipped window must not count as fullscreen: ' + JSON.stringify(o));
    assert.deepEqual(run([fsA(o), fsA()]), [1], 'and must not hide a real movie below it either: ' + JSON.stringify(o));
  }
  assert.deepEqual(run([win(100, 100, 1800, 1000, { caption: true, cloaked: true }), fsA()]), [1]);
});
test('shell windows never count', () => {
  for (const cls of ['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'NotifyIconOverflowWindow', 'Windows.UI.Core.CoreWindow', 'XamlExplorerHostIslandWindow', 'TopLevelWindowForOverflowXamlIsland']) {
    assert.deepEqual(run([fsA({ cls })]), [], cls);
  }
});
test('the order matters: fullscreen window on top of a normal one wins', () => {
  assert.deepEqual(run([fsA(), win(100, 100, 1800, 1000, { caption: true })]), [1]);
});

// ------------------------------------------------------------------ notification state
test('notification state 3 (exclusive D3D) / 4 (presentation) marks the foreground window display', () => {
  const game = win(1920, 0, 3840, 1080, { caption: true });   // looks windowed, but the shell says exclusive fullscreen
  assert.deepEqual(run([game], { ns: 3, fg: game }), [2]);
  assert.deepEqual(run([game], { ns: 4, fg: game }), [2]);
});
test('notification state 2 (busy) alone is NOT fullscreen (our own overlay can cause it)', () => {
  const game = win(0, 0, 1920, 1080, { caption: true });
  assert.deepEqual(run([game], { ns: 2, fg: game }), []);
  assert.deepEqual(run([game], { ns: 5, fg: game }), []);
});
test('state 3 with a shell / own / missing foreground window marks nothing', () => {
  assert.deepEqual(run([], { ns: 3, fg: win(0, 1040, 1920, 1080, { cls: 'Shell_TrayWnd' }) }), []);
  assert.deepEqual(run([], { ns: 3, fg: win(0, 0, 800, 600, { pid: 42 }) }), []);
  assert.deepEqual(run([], { ns: 3, fg: null }), []);
});

// ------------------------------------------------------------------ probe parsing
test('parseProbe: foreground, notification state, window list; garbage -> null', () => {
  const p = fsd.parseProbe('0,0,1920,1080|GameWnd|321|3|0,0,1920,1080,1,321,GameWnd;-8,-8,1928,1088,25,77,Chrome_WidgetWin_1');
  assert.deepEqual(p.fg.rect, { x: 0, y: 0, w: 1920, h: 1080 }); assert.equal(p.fg.cls, 'GameWnd'); assert.equal(p.fg.pid, 321); assert.equal(p.ns, 3);
  assert.equal(p.windows.length, 2);
  assert.equal(p.windows[0].visible, true); assert.equal(p.windows[0].caption, false); assert.equal(p.windows[0].pid, 321);
  const w = p.windows[1]; assert.equal(w.zoomed, true); assert.equal(w.caption, true); assert.equal(w.visible, true); assert.equal(w.cls, 'Chrome_WidgetWin_1');
  for (const bad of ['', null, undefined, 'nonsense', '1,2,3|x|1|5|']) assert.equal(fsd.parseProbe(bad), null, String(bad));
  assert.equal(fsd.parseProbe('0,0,0,0||0|5|10,10,500,500,1,5,Foo').fg, null, 'no foreground window');
  assert.equal(fsd.parseProbe('0,0,0,0||0|5|10,10,500,500,1,5,Foo').windows.length, 1);
});
test('parseProbe flags: visible=1 iconic=2 cloaked=4 zoomed=8 caption=16 toolwindow=32 transparent=64 topmost=128', () => {
  const f = (n) => fsd.parseProbe('0,0,10,10|x|1|5|0,0,500,500,' + n + ',1,C').windows[0];
  assert.equal(f(1).visible, true); assert.equal(f(2).iconic, true); assert.equal(f(4).cloaked, true); assert.equal(f(8).zoomed, true);
  assert.equal(f(16).caption, true); assert.equal(f(32).toolwindow, true); assert.equal(f(64).transparent, true); assert.equal(f(128).topmost, true);
  assert.equal(f(0).visible, false);
});

// ------------------------------------------------------------------ hold / expire
test('tracker: a failed probe holds the last state, a good probe replaces it, the hold expires', () => {
  const t = fsd.createTracker({ holdMs: 120000 });
  assert.deepEqual(ids(t.update(null, 0)), [], 'a failure before any success: nothing to hold');
  assert.deepEqual(ids(t.update(new Set([1]), 1000)), [1]);
  assert.deepEqual(ids(t.update(null, 2500)), [1], 'one failed probe holds');
  assert.deepEqual(ids(t.update(null, 4000)), [1], 'two failed probes hold (the old code un-hid the sprite here)');
  assert.deepEqual(ids(t.update(null, 1000 + 119000)), [1], 'still held just before the cap');
  assert.deepEqual(ids(t.update(null, 1000 + 121000)), [], 'expired: a dead probe cannot hide the sprite forever');
  assert.deepEqual(ids(t.update(null, 1000 + 130000)), []);
  assert.deepEqual(ids(t.update(new Set([2]), 1000 + 131000)), [2]);
  assert.deepEqual(ids(t.update(new Set(), 1000 + 132000)), [], 'only a successful probe clears it');
});
test('tracker: the hold is measured from the last SUCCESS, not from the last failure', () => {
  const t = fsd.createTracker({ holdMs: 10000 });
  t.update(new Set([1]), 0);
  for (let now = 1500; now <= 9000; now += 1500) assert.deepEqual(ids(t.update(null, now)), [1]);
  assert.deepEqual(ids(t.update(null, 10500)), []);
});
test('tracker: forget() drops unplugged displays', () => {
  const t = fsd.createTracker({ holdMs: 10000 });
  t.update(new Set([1, 2]), 0);
  assert.deepEqual(ids(t.forget(new Set([1]))), [1]);
  assert.deepEqual(ids(t.update(null, 100)), [1]);
});

// ------------------------------------------------------------------ the bugs this replaces (measured on the maintainer's desk, see report)
// The pre-0.7.1 detector, verbatim apart from the screen object, run against Windows' real conversion rules:
// screenToDipPoint() puts the point on the monitor under it (or the nearest) and scales from THAT monitor.
function fakeScreen() {
  const mons = [{ dip: { x: 0, y: 0, width: 1920, height: 1080 }, phys: { x: 0, y: 0, width: 1920, height: 1080 }, sf: 1 },
    { dip: { x: 1920, y: 0, width: 1536, height: 864 }, phys: { x: 1920, y: 0, width: 1920, height: 1080 }, sf: 1.25 }];
  return {
    mons,
    screenToDipPoint(p) {
      // measured: the exclusive bottom-right corner of the primary (1920,1080) is taken to be on the 125% monitor
      const inside = (m) => p.x >= m.phys.x && p.x <= m.phys.x + m.phys.width && p.y >= m.phys.y && p.y <= m.phys.y + m.phys.height;
      const m = [...mons].reverse().find(inside) || mons[0];
      return { x: m.dip.x + (p.x - m.phys.x) / m.sf, y: m.dip.y + (p.y - m.phys.y) / m.sf };
    },
  };
}
function legacyIsFullscreen(screen, [l, t, r, b], dipBounds) {
  const tl = screen.screenToDipPoint({ x: l, y: t }), br = screen.screenToDipPoint({ x: r, y: b });
  return tl.x <= dipBounds.x + 2 && tl.y <= dipBounds.y + 2 && br.x >= dipBounds.x + dipBounds.width - 2 && br.y >= dipBounds.y + dipBounds.height - 2;
}
test('REGRESSION (hypothesis 1): the old corner conversion fails a true fullscreen window on the primary; the new rule does not', () => {
  const s = fakeScreen();
  assert.equal(legacyIsFullscreen(s, [0, 0, 1920, 1080], s.mons[0].dip), false, 'old code missed it: (1920,1080) landed on the 125% monitor');
  assert.deepEqual(run([fsA()]), [1]);
});
test('REGRESSION (hypothesis 2): a DPI-unaware GetWindowRect reports a 125%-monitor window as 1920,0,3456,864; the old code then missed it', () => {
  const s = fakeScreen();
  assert.equal(legacyIsFullscreen(s, [1920, 0, 3456, 864], s.mons[1].dip), false, 'old code missed it: virtualised coordinates were read as physical');
  assert.deepEqual(run([fsB()]), [2], 'the new probe is per-monitor aware, so the rect is the physical 1920,0,3840,1080');
});

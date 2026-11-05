'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/main/mischief/logic');

const D1 = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 }, scaleFactor: 1 };
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

test('physToDip: 150% scaled primary + 100% second monitor to the right', () => {
  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1280, height: 720 }, phys: L.R(0, 0, 1920, 1080), scaleFactor: 1.5 },
    { id: 2, bounds: { x: 1280, y: 0, width: 1920, height: 1080 }, phys: L.R(1920, 0, 1920, 1080), scaleFactor: 1 },
  ];
  assert.deepEqual(L.physToDip(L.R(300, 600, 66, 72), displays), L.R(200, 400, 44, 48));
  assert.deepEqual(L.physToDip(L.R(2000, 100, 44, 48), displays), L.R(1360, 100, 44, 48));
});

test('cropFor: padded physical crop clamps at the display edge and reports the pad actually available', () => {
  const d = { ...D1, scaleFactor: 1.25 };
  const c = L.cropFor(d, L.R(0, 1000, 40, 32), 8, { w: 2400, h: 1350 });
  assert.equal(c.x, 0); assert.equal(c.padL, 0); assert.equal(c.padT, 8); assert.equal(c.inner.w, 50); assert.equal(c.inner.h, 40);
  assert.ok(c.y + c.h <= 1350);
});

test('rect helpers', () => {
  assert.equal(L.distToRect({ x: 5, y: 5 }, L.R(0, 0, 10, 10)), 0);
  assert.equal(L.distToRect({ x: 13, y: 14 }, L.R(0, 0, 10, 10)), 5);
  assert.ok(L.sameRect(L.R(0, 0, 10, 10), L.R(1, 1, 11, 9)));
  assert.ok(!L.sameRect(L.R(0, 0, 10, 10), L.R(9, 0, 10, 10)));
  assert.deepEqual(L.union([L.R(0, 0, 5, 5), L.R(10, 10, 5, 5)]), L.R(0, 0, 15, 15));
});

const RAW = {
  bar: [0, 1032, 1920, 48],
  items: [
    { k: 'start', c: 'ToggleButton', n: '', r: [562, 1032, 45, 48] },
    ...[875, 919, 963, 1007, 1051].map(x => ({ k: 'btn', c: 'Taskbar.TaskListButtonAutomationPeer', n: '', r: [x, 1032, 44, 48] })),
    { k: 'tray', c: 'SystemTray.NormalButton', n: 'Show', r: [1681, 1032, 32, 48] },
    { k: 'tray', c: 'SystemTray.AccentButton', n: 'Network', r: [1749, 1032, 24, 48] },
    { k: 'tray', c: 'SystemTray.OmniButtonCenter', n: 'Volume', r: [1777, 1032, 24, 48] },
    { k: 'tray', c: 'SystemTray.AccentButton', n: 'Power', r: [1805, 1032, 28, 48] },
    { k: 'tray', c: 'SystemTray.OmniButton', n: 'Clock', r: [1841, 1032, 63, 48] },
  ],
  desk: [[20, 20, 75, 90], [20, 130, 75, 90]],
  fg: { h: 99, p: 'WINWORD', c: 'OpusApp', z: 0, i: 0, r: [300, 120, 900, 600] },
};
const conv = (r) => r;

test('buildModel classifies the Windows 11 taskbar, tray, start and the foreground window', () => {
  const m = L.buildModel(RAW, conv, [D1]);
  assert.equal(m.buttons.length, 5); assert.ok(m.start && m.wifi && m.volume && m.battery && m.clock);
  assert.equal(m.battery.x, 1805); assert.equal(m.clock.w, 63);
  assert.ok(m.win.allowed && m.win.proc === 'winword' && !m.win.max);
  assert.equal(m.rows.length, 0, 'two icons do not make a row');
});

test('buildModel: auto-hidden, side or missing taskbar yields no taskbar targets; localised names fall back on tray order', () => {
  const hidden = L.buildModel({ ...RAW, bar: [0, 1078, 1920, 2] }, conv, [D1]); assert.equal(hidden.bar, null); assert.equal(hidden.buttons.length, 0);
  const side = L.buildModel({ ...RAW, bar: [0, 0, 60, 1080] }, conv, [D1]); assert.equal(side.bar, null);
  assert.equal(L.buildModel(null, conv, [D1]).bar, null);
  const loc = L.buildModel({ ...RAW, items: RAW.items.map(i => (i.k === 'tray' ? { ...i, n: 'Xyz' } : i)) }, conv, [D1]);
  assert.ok(loc.wifi && loc.volume && loc.battery && loc.clock, 'positional fallback');
});

test('buildModel: shell windows, minimised windows and unknown apps are not usable foreground targets', () => {
  assert.equal(L.buildModel({ ...RAW, fg: { ...RAW.fg, c: 'Progman' } }, conv, [D1]).win, null);
  assert.equal(L.buildModel({ ...RAW, fg: { ...RAW.fg, i: 1 } }, conv, [D1]).win, null);
  assert.equal(L.buildModel({ ...RAW, fg: { ...RAW.fg, p: 'keepass' } }, conv, [D1]).win.allowed, false);
  for (const p of ['WINWORD', 'notepad', 'chrome', 'msedge', 'firefox']) assert.ok(L.appAllowed(p), p);
  for (const p of ['KeePass', 'Code', 'cmd', 'outlook', '']) assert.ok(!L.appAllowed(p), p);
});

test('desktopRows needs 4+ icons on a row; groupLines merges fragments of one line and drops junk', () => {
  const icons = [0, 1, 2, 3, 4].map(i => L.R(20 + i * 90, 40, 75, 90)).concat([L.R(20, 300, 75, 90)]);
  assert.equal(L.desktopRows(icons).length, 1); assert.equal(L.desktopRows(icons)[0].length, 5);
  const lines = L.groupLines([L.R(100, 200, 300, 20), L.R(405, 201, 80, 20), L.R(100, 230, 400, 20), L.R(100, 260, 3, 20), L.R(100, 290, 400, 200)]);
  assert.equal(lines.length, 2); assert.equal(lines[0].w, 385);
});

test('nextDelay: rare > normal > chaos, randomised, within bounds', () => {
  for (const f of Object.keys(L.FREQ)) {
    const [a, b] = L.FREQ[f]; const ds = new Set();
    for (let s = 1; s < 40; s++) { const d = L.nextDelay(f, rng(s)); assert.ok(d >= a * 60000 && d <= b * 60000, f); ds.add(d); }
    assert.ok(ds.size > 20);
  }
  assert.ok(L.FREQ.rare[0] > L.FREQ.normal[1] && L.FREQ.normal[0] > L.FREQ.chaos[1]);
  assert.ok(L.nextDelay('nonsense', () => 0) === L.FREQ.normal[0] * 60000);
});

test('activity tracker: calm cursor is not busy, wild scrubbing is, and it cools down', () => {
  const a = L.createActivity(); let t = 0;
  for (let i = 0; i < 600; i++) { t += 16; a.note(500 + (i % 2), 500, t); } assert.ok(!a.busy());
  for (let i = 0; i < 300; i++) { t += 16; a.note(300 + (i % 40) * 25, 500 + (i % 3) * 5, t); } assert.ok(a.busy(), 'busy while scrubbing');
  for (let i = 0; i < 600; i++) { t += 16; a.note(500, 500, t); } assert.ok(!a.busy(), 'calm again');
});

const OK = { platform: 'win32', enabled: true, running: false, userHidden: false, petShown: true, paused: false, stayPut: false, reduceMotion: false, locked: false, suspended: false, fullscreen: false, userBusy: false, petIdle: true };
test('blockedReason: runs only on Windows, enabled, idle sprite, calm user, no fullscreen/lock', () => {
  assert.equal(L.blockedReason(OK), null);
  assert.equal(L.blockedReason({ ...OK, platform: 'darwin' }), 'not-windows'); assert.equal(L.blockedReason({ ...OK, platform: 'linux' }), 'not-windows');
  for (const [k, v, why] of [['enabled', false, 'disabled'], ['running', true, 'running'], ['userHidden', true, 'hidden'], ['petShown', false, 'hidden'], ['paused', true, 'quiet'], ['stayPut', true, 'quiet'],
    ['reduceMotion', true, 'quiet'], ['locked', true, 'locked'], ['suspended', true, 'locked'], ['fullscreen', true, 'fullscreen'], ['userBusy', true, 'user-busy'], ['petIdle', false, 'sprite-busy']]) {
    assert.equal(L.blockedReason({ ...OK, [k]: v }), why, k);
  }
});

const AB = { now: 1000, startedAt: 0, cursor: { x: 900, y: 500 }, near: [L.R(100, 1032, 44, 48)], zones: [L.R(80, 960, 60, 60)], layout0: 'a', layout: 'a',
  fg0: { h: 5, r: L.R(0, 0, 800, 600) }, fg: { h: 5, r: L.R(0, 0, 800, 600) } };
test('abortReason: every rule of the safety spec', () => {
  assert.equal(L.abortReason(AB), null);
  assert.equal(L.abortReason({ ...AB, stop: true }), 'stopped');
  assert.equal(L.abortReason({ ...AB, grabbed: true }), 'sprite-grabbed');
  assert.equal(L.abortReason({ ...AB, locked: true }), 'session-locked');
  assert.equal(L.abortReason({ ...AB, suspended: true }), 'suspended');
  assert.equal(L.abortReason({ ...AB, layout: 'b' }), 'display-changed');
  assert.equal(L.abortReason({ ...AB, fullscreen: true }), 'fullscreen');
  assert.equal(L.abortReason({ ...AB, probeLost: true }), 'probe-lost');
  assert.equal(L.abortReason({ ...AB, pw: true }), 'password-field');
  assert.equal(L.abortReason({ ...AB, fg: { h: 6, r: AB.fg.r } }), 'foreground-changed');
  assert.equal(L.abortReason({ ...AB, fg: { h: 5, r: L.R(30, 0, 800, 600) } }), 'foreground-changed', 'window moved');
  assert.equal(L.abortReason({ ...AB, fg: { h: 5, r: L.R(1, 1, 800, 600) } }), null, '1px jitter is fine');
  assert.equal(L.abortReason({ ...AB, cursor: { x: 150, y: 1040 } }), 'cursor-near-target');
  assert.equal(L.abortReason({ ...AB, cursor: { x: 170, y: 1040 } }), 'cursor-near-target', 'within 56px');
  assert.equal(L.abortReason({ ...AB, cursor: { x: 100, y: 970 } }), 'cursor-on-area');
  assert.equal(L.abortReason({ ...AB, now: 15000 }), 'time-cap');
  assert.equal(L.abortReason({ ...AB, now: 14999 }), null);
});
test('abortReason: caret / selection / first-line change counts as typing (text mode only)', () => {
  const sig = { c: L.R(300, 200, 2, 18), s: null, v: L.R(220, 150, 500, 20) };
  const T = { ...AB, textMode: true, caret0: sig };
  assert.equal(L.abortReason({ ...T, caret: { ...sig } }), null);
  assert.equal(L.abortReason({ ...T, caret: { ...sig, c: L.R(309, 200, 2, 18) } }), 'caret-changed');
  assert.equal(L.abortReason({ ...T, caret: { ...sig, s: L.R(300, 200, 2, 18) } }), 'caret-changed', 'selection appeared');
  assert.equal(L.abortReason({ ...T, caret: { ...sig, v: L.R(220, 130, 500, 20) } }), 'caret-changed', 'document scrolled');
  assert.equal(L.abortReason({ ...AB, caret0: sig, caret: { ...sig, c: L.R(1, 1, 1, 1) } }), null, 'ignored outside text mode');
});

test('candidates: weighted, skips targets that are missing, de-prioritises recent, honours only', () => {
  const g = { a: { weight: 1, find: () => ({ x: 1 }) }, b: { weight: 1, find: () => null }, c: { weight: 1, find: () => { throw new Error('x'); } }, d: { weight: 1, find: () => ({ y: 1 }) } };
  assert.deepEqual(L.candidates(g, {}, {}, [], rng(1)).map(c => c.id).sort(), ['a', 'd']);
  assert.deepEqual(L.candidates(g, {}, {}, [], rng(1), 'd').map(c => c.id), ['d']);
  let firstA = 0; for (let s = 1; s <= 300; s++) if (L.candidates(g, {}, {}, ['a'], rng(s))[0].id === 'a') firstA++;
  assert.ok(firstA < 90, 'recent gag is picked far less often: ' + firstA);
});

test('compareRegions: identical = 0, a changed pixel block shows up', () => {
  const w = 100, h = 100, mk = () => ({ w, h, data: Buffer.alloc(w * h * 4, 120) }); const a = mk(), b = mk();
  assert.equal(L.compareRegions(a, b, [L.R(0, 0, 100, 100)], D1).mean, 0);
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) b.data[(y * w + x) * 4] = 250;
  const c = L.compareRegions(a, b, [L.R(0, 0, 100, 100)], D1); assert.ok(c.mean > 0 && c.pct === 1 && c.max === 130);
  assert.equal(L.compareRegions(a, { ...b, w: 5 }, [L.R(0, 0, 1, 1)], D1).mean, 1);
});

test('overlayBox: only the prank area, never a whole display (a full-screen window makes Windows enable Do Not Disturb and shift the tray)', () => {
  const b = { x: 0, y: 0, width: 1920, height: 1080 };
  const small = L.overlayBox(L.R(1000, 960, 300, 120), b); assert.ok(small.w < 1000 && small.h < 500);
  assert.ok(L.within(L.R(1000, 960, 300, 120), small), 'contains the area');
  for (const area of [L.R(0, 0, 1920, 1080), L.R(-50, -50, 3000, 3000), L.R(10, 10, 1900, 1060)]) {
    const box = L.overlayBox(area, b); assert.ok(box.w <= 1920 - 16 && box.h <= 1080 - 16, 'at least 16 px short in both directions'); assert.ok(L.within(box, L.R(0, 0, 1920, 1080)));
  }
  const second = { x: 1920, y: 0, width: 2560, height: 1440 }; const sb = L.overlayBox(L.R(1920, 0, 2560, 1440), second); assert.ok(sb.w < 2560 && sb.x >= 1920 && sb.x + sb.w <= 4480);
});

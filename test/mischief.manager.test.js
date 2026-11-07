'use strict';
// The orchestration with a fake probe, host and engine clock: abort rules end a prank within 250 ms and always take the overlay down.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/main/mischief/logic');
const { createManager } = require('../src/main/mischief/manager');
const { freshEngine, LAYOUTS } = require('./helpers');

const D1 = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 }, scaleFactor: 1, phys: L.R(0, 0, 1920, 1080) };
const SCAN = (ps) => ps.scan ? ps.scan() : ({
  bar: [0, 1032, 1920, 48],
  items: [{ k: 'start', c: 'ToggleButton', n: '', r: [562, 1032, 45, 48] },
    ...[875, 919, 963, 1007, 1051, 1095].map(x => ({ k: 'btn', c: 'Taskbar.TaskListButtonAutomationPeer', n: '', r: [x, 1032, 44, 48] })),
    { k: 'tray', c: 'SystemTray.AccentButton', n: 'Network', r: [1749, 1032, 24, 48] }, { k: 'tray', c: 'SystemTray.OmniButtonCenter', n: 'Volume', r: [1777, 1032, 24, 48] },
    { k: 'tray', c: 'SystemTray.AccentButton', n: 'Power', r: [1805, 1032, 28, 48] }, { k: 'tray', c: 'SystemTray.OmniButton', n: 'Clock', r: [1841, 1032, 63, 48] }],
  desk: ps.desk || [], fg: { h: ps.fgH, p: 'notepad', c: 'Notepad', z: 0, i: 0, r: ps.fgR },
});

function rig(over = {}) {
  const E = freshEngine(), cls = { order: [], wentAt: 0, closed: 0, opened: 0, probeStarted: 0, probeStopped: 0, scenes: [], fx: [], emitted: [] };
  E.init({ event: () => {}, toy: () => {}, state: () => {} }, 1000); E.setWorld([{ id: 1, bounds: D1.bounds, workArea: D1.workArea }]); E.setSize(60); E.settings = { speed: over.speed || 8, personality: 'chill', mischief: 25 };   // speed 8: the walk-in to the start spot is quick here (the pace test below runs at speed 1)
  E.moveType = 'walk'; E.gait = 'step'; E.pos = { x: over.sx == null ? 700 : over.sx, y: 1032 - 60 }; E.vel = { x: 0, y: 0 }; E.onFloor = true; E.setState('idle', 0); E.nextDecision = 1e15; E.tick(Date.now()); E.lastChange = Date.now(); E.onFloor = true; E.setState('idle', 0); E.lastChange = Date.now();   // hold the random brain quiet (it would otherwise decide() because the fake clock is far from Date.now())
  const ps = { fgH: 99, fgR: [300, 200, 900, 600], c: null, s: null, v: null, probeDead: false, pw: false }, st = { cursor: { x: 1500, y: 300 }, flags: { userHidden: false, petShown: true, paused: false, stayPut: false, reduceMotion: false, locked: false, suspended: false, fullscreen: false }, displays: [D1], enabled: true };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const probe = {
    start() { cls.probeStarted++; return true; }, stop() { cls.probeStopped++; }, isAlive: () => true,
    async request(cmd) {
      await wait(ps.delay || 2); if (ps.probeDead) return null;
      if (cmd === 'scan') { cls.scans = (cls.scans || 0) + 1; cls.order.push('scan'); const sc = SCAN(ps); if (ps.shiftFromScan && cls.scans >= ps.shiftFromScan) for (const it of sc.items) if (it.k === 'tray') it.r = [it.r[0] - 28, ...it.r.slice(1)]; return Object.assign(sc, { pw: ps.pwFromScan && cls.scans >= ps.pwFromScan ? 1 : 0 }); }
      if (cmd === 'text') return { pw: ps.pw, l: [0, 1, 2, 3, 4, 5].map(i => [330, 250 + i * 26, 520, 20]) };
      return { fg: { h: ps.fgH, p: 'notepad', c: 'Notepad', z: 0, i: 0, r: ps.fgR }, c: ps.c, s: ps.s, v: [330, 250, 520, 20] };
    },
  };
  const host = {
    displays: () => st.displays, toDip: (r) => (st.toDip ? st.toDip(r) : r), count: () => (cls.opened - cls.closed > 0 ? 1 : 0), show() {}, go() { cls.wentAt = Date.now(); },
    async capture(display, crops) { cls.order.push('capture'); const o = {}; for (const k of Object.keys(crops)) o[k] = { rect: crops[k], png: 'data:,', padL: 8, padT: 8, padR: 8, padB: 8 }; return o; },
    openOverlay(display, scene, ready) { cls.opened++; cls.scenes.push(scene); setTimeout(ready, 3); }, close() { if (cls.opened > cls.closed) cls.closed++; },
  };
  if (over.spy) over.spy(host, cls);
  const m = createManager(Object.assign({
    platform: 'win32', now: Date.now, rand: () => 0.5, log: () => {}, engine: E, host, activity: L.createActivity(), settings: () => ({ enabled: st.enabled, freq: 'normal' }), flags: () => st.flags,
    makeProbe: () => probe, char: () => 'cat', cursor: () => st.cursor, emit: (t) => cls.emitted.push(t), setFx: (f) => cls.fx.push(f), sleep: wait,
    spriteBox: () => L.R(E.pos.x, E.pos.y, 60, 60), hidePet() {},
  }, over));
  const tk = setInterval(() => E.tick(Date.now()), 16);
  return { E, m, ps, st, cls, wait, done() { clearInterval(tk); }, async untilGo() { for (let i = 0; i < 3000 && !cls.wentAt; i++) await wait(5); assert.ok(cls.wentAt, 'prank started'); } };
}

// scripted cursor-near-target abort: restores within 250 ms (spec D), for several pranks
for (const id of ['tug', 'shock', 'manhole', 'trampoline', 'clock']) {
  test(`abort: cursor comes near the target ends "${id}" within 250 ms and removes the overlay`, async () => {
    const r = rig(); try {
      const run = r.m.start({ only: id, force: true }); await r.untilGo(); await r.wait(200);
      assert.equal(r.cls.opened - r.cls.closed, 1, 'overlay up while playing'); assert.ok(r.E.script && r.E.script.name === 'mischief:' + id);
      const t0 = Date.now(), tg = r.m.targets()[0]; r.st.cursor = { x: tg.x + tg.w / 2, y: tg.y + tg.h / 2 };
      const res = await run, dt = Date.now() - t0;
      assert.equal(res.status, 'aborted'); assert.equal(res.reason, 'cursor-near-target'); assert.ok(dt <= 250, `restored in ${dt} ms`);
      assert.equal(r.cls.opened, r.cls.closed, 'overlay window count back to baseline'); assert.equal(r.cls.probeStopped, 1, 'probe process released'); assert.equal(r.E.script, null, 'sprite script ended');
      assert.deepEqual(r.cls.fx[r.cls.fx.length - 1], null, 'clip / tilt cleared');
    } finally { r.done(); }
  });
}

test('abort: the cursor moving onto the area the sprite occupies', async () => {
  const r = rig(); try {
    const run = r.m.start({ only: 'tug', force: true }); await r.untilGo(); await r.wait(100);
    const t0 = Date.now(); r.st.cursor = { x: r.E.pos.x + 30, y: r.E.pos.y + 30 }; const res = await run;
    assert.equal(res.status, 'aborted'); assert.ok(['cursor-on-area', 'cursor-near-target'].includes(res.reason)); assert.ok(Date.now() - t0 <= 250); assert.equal(r.cls.opened, r.cls.closed);
  } finally { r.done(); }
});

test('abort: foreground window changed or moved', async () => {
  for (const change of [(ps) => { ps.fgH = 123; }, (ps) => { ps.fgR = [340, 200, 900, 600]; }]) {
    const r = rig(); try {
      const run = r.m.start({ only: 'tug', force: true }); await r.untilGo(); await r.wait(150); const t0 = Date.now(); change(r.ps); const res = await run;
      assert.equal(res.reason, 'foreground-changed'); assert.ok(Date.now() - t0 <= 250, 'within 250 ms'); assert.equal(r.cls.opened, r.cls.closed);
    } finally { r.done(); }
  }
});

test('abort: caret moved while the text prank runs (typing detected without any hook)', async () => {
  const r = rig(); r.ps.c = [400, 640, 2, 20]; try {
    const run = r.m.start({ only: 'text', force: true }); await r.untilGo(); await r.wait(300);
    assert.equal(r.E.script.name, 'mischief:text'); const t0 = Date.now(); r.ps.c = [409, 640, 2, 20]; const res = await run;
    assert.equal(res.status, 'aborted'); assert.equal(res.reason, 'caret-changed'); assert.ok(Date.now() - t0 <= 250, `restored in ${Date.now() - t0} ms`); assert.equal(r.cls.opened, r.cls.closed);
  } finally { r.done(); }
});

test('abort: sprite grabbed, Stop mischief, session lock, display change', async () => {
  const cases = [['sprite-grabbed', (r) => r.E.grab()], ['stopped', (r) => r.m.stop()], ['session-locked', (r) => { r.st.flags.locked = true; }],
    ['display-changed', (r) => { r.st.displays = [{ ...D1, bounds: { ...D1.bounds, width: 1280 } }]; }], ['suspended', (r) => { r.st.flags.suspended = true; }]];
  for (const [why, act] of cases) {
    const r = rig(); try {
      const run = r.m.start({ only: 'shock', force: true }); await r.untilGo(); await r.wait(120); const t0 = Date.now(); act(r); const res = await run;
      assert.equal(res.status, 'aborted', why); assert.ok(res.reason === why || res.reason === 'sprite-drag' && why === 'sprite-grabbed', why + ' got ' + res.reason);
      assert.ok(Date.now() - t0 <= 250, why + ' in ' + (Date.now() - t0)); assert.equal(r.cls.opened, r.cls.closed, why);
    } finally { r.done(); }
  }
});

test('abort: the probe going silent ends the prank (safe default)', async () => {
  const r = rig(); try {
    const run = r.m.start({ only: 'shock', force: true }); await r.untilGo(); await r.wait(100); r.ps.probeDead = true; const res = await run;
    assert.equal(res.reason, 'probe-lost'); assert.equal(r.cls.opened, r.cls.closed);
  } finally { r.done(); }
});

test('skips silently: not Windows, disabled, cursor already near, password field, nothing to target', async () => {
  let r = rig({ platform: 'darwin' }); let res = await r.m.start({ only: 'tug', force: true }); r.done();
  assert.deepEqual([res.status, res.reason], ['skipped', 'not-windows']); assert.equal(r.cls.probeStarted, 0, 'no probe on other platforms'); assert.equal(r.cls.opened, 0);
  r = rig(); r.st.enabled = false; res = await r.m.start({}); r.done(); assert.equal(res.reason, 'disabled'); assert.equal(r.cls.probeStarted, 0);
  r = rig(); r.st.cursor = { x: 1010, y: 1050 }; res = await r.m.start({ only: 'tug', force: true }); r.done(); assert.deepEqual([res.status, res.reason], ['skipped', 'cursor-near-target']); assert.equal(r.cls.opened, 0, 'never even captured');
  r = rig(); r.ps.pw = true; res = await r.m.start({ only: 'text', force: true }); r.done(); assert.equal(res.status, 'skipped'); assert.equal(r.cls.opened, 0, 'password field: no overlay');
  r = rig(); r.ps.fgR = [0, 0, 1920, 1080]; res = await r.m.start({ only: 'peel', force: true }); r.done(); assert.equal(res.status, 'skipped', 'maximised/fullscreen window has no corner to peel');
  r = rig({ makeProbe: () => ({ start: () => true, stop() {}, request: async () => null }) }); res = await r.m.start({ only: 'tug', force: true }); r.done(); assert.equal(res.reason, 'probe-failed');
  assert.equal(r.cls.opened, 0);
});

test('the screenshot crop is taken BEFORE any overlay exists, and the overlay is closed + probe stopped at the end', async () => {
  const order = []; let r0 = null; const r = r0 = rig({ spy: (h) => { const c = h.capture, o = h.openOverlay, cl = h.close; h.capture = async (...a) => { order.push('capture'); return c(...a); }; h.openOverlay = (...a) => { order.push('overlay'); return o(...a); }; h.close = () => { order.push('close'); return cl(); }; } });
  try {
    const run = r.m.start({ only: 'shock', force: true }); await r.untilGo(); r.m.stop(); await run;
    assert.deepEqual(order.slice(0, 2), ['capture', 'overlay']); assert.equal(order[order.length - 1], 'close');
    const sc = r.cls.scenes[0]; assert.ok(sc.crops.ic && /^data:/.test(sc.crops.ic.png), 'crop travels as an in-memory data URL'); assert.equal(r.cls.probeStopped, 1);
  } finally { r.done(); }
});

test('only one prank at a time, and nothing is scheduled while disabled', async () => {
  const r = rig(); try {
    const run = r.m.start({ only: 'shock', force: true }); await r.wait(5); assert.equal((await r.m.start({ only: 'tug', force: true })).reason, 'running');
    await r.untilGo(); r.m.stop(); await run; r.st.enabled = false; r.m.schedule(); assert.equal(r.m.isRunning(), false);
  } finally { r.done(); }
});

test('prep can be stopped: stop(), lock, suspend, fullscreen, grab, disabled or a moved sprite during the 3-5 s preparation never open an overlay', async () => {
  const cases = [['stopped', (r) => r.m.stop()], ['session-locked', (r) => { r.st.flags.locked = true; }], ['suspended', (r) => { r.st.flags.suspended = true; }], ['fullscreen', (r) => { r.st.flags.fullscreen = true; }],
    ['sprite-grabbed', (r) => { r.E.dragging = true; }], ['sprite-moved', (r) => { r.E.pos.x += 80; }], ['quit', (r) => r.m.stop('quit')]];
  for (const [why, act] of cases) {
    const r = rig({ sx: 999 }); r.ps.delay = 60; try {   // sx 999: already standing at the tug's start spot, so no walk-in is under way
      const run = r.m.start({ only: 'tug', force: true }); await r.wait(90); act(r); const res = await run;
      assert.equal(res.status, 'skipped', why); assert.equal(res.reason, why === 'quit' ? 'quit' : why, why); assert.equal(r.cls.opened, 0, why + ': no overlay'); assert.ok(!r.cls.order.includes('capture') || why === 'x', why + ': checked before the capture');
    } finally { r.done(); }
  }
  const r = rig({ sx: 999 }); r.ps.delay = 60; r.st.enabled = true; try { const run = r.m.start({ only: 'tug' }); await r.wait(90); r.st.enabled = false; const res = await run; assert.equal(res.reason, 'disabled'); assert.equal(r.cls.opened, 0); } finally { r.done(); }
});

test('privacy order: the desktop is looked at again right BEFORE the capture; a focused password field means no crop is ever taken', async () => {
  let r = rig(); try {
    const run = r.m.start({ only: 'shock', force: true }); await r.untilGo(); r.m.stop(); await run;
    const o = r.cls.order; assert.deepEqual(o.slice(0, 4), ['scan', 'scan', 'capture', 'scan'], 'scan, re-scan, capture, re-scan, then the overlay');
  } finally { r.done(); }
  r = rig(); r.ps.pwFromScan = 2; try {
    const res = await r.m.start({ only: 'shock', force: true });
    assert.deepEqual([res.status, res.reason], ['skipped', 'password-field']); assert.ok(!r.cls.order.includes('capture'), 'no screenshot of a password field'); assert.equal(r.cls.opened, 0);
  } finally { r.done(); }
  r = rig(); r.ps.pwFromScan = 3; try {
    const res = await r.m.start({ only: 'shock', force: true });
    assert.deepEqual([res.status, res.reason], ['skipped', 'password-field'], 'the after-capture check is kept'); assert.equal(r.cls.opened, 0);
  } finally { r.done(); }
  r = rig(); try {   // another app became foreground between the first scan and the re-scan
    const orig = r.m; r.ps.fgH = 99; const run = r.m.start({ only: 'shock', force: true }); await r.wait(4); r.ps.fgH = 5; const res = await run;
    assert.equal(res.status, 'skipped'); assert.ok(['foreground-changed'].includes(res.reason), res.reason); assert.ok(!r.cls.order.includes('capture') || res.reason === 'foreground-changed');
  } finally { r.done(); }
});

test('a target that moved between locating and opening the overlay (the tray shifted 28 px) is skipped', async () => {
  for (const n of [2, 3]) {
    const r = rig(); r.ps.shiftFromScan = n; try {
      const res = await r.m.start({ only: 'clock', force: true });
      assert.deepEqual([res.status, res.reason], ['skipped', 'target-moved'], 'scan #' + n); assert.equal(r.cls.opened, 0, 'no overlay'); assert.equal(r.cls.order.includes('capture'), n === 3, 'a re-scan before the capture stops it early');
    } finally { r.done(); }
  }
});

test('target on another display: the sprite is brought over to the target display instead of skipping, and ends on-screen', async () => {
  const D2 = { id: 2, bounds: { x: 1920, y: 0, width: 1536, height: 864 }, workArea: { x: 1920, y: 0, width: 1536, height: 824 }, scaleFactor: 1, phys: L.R(1920, 0, 1536, 864) };
  const r = rig(); try {
    r.st.displays = [D1, D2]; r.E.setWorld([D1, D2].map(x => ({ id: x.id, bounds: x.bounds, workArea: x.workArea })));
    r.E.pos = { x: 2500, y: 824 - 60 }; r.E.onFloor = true; r.E.setState('idle', 0); r.E.nextDecision = 1e15; r.E.lastChange = Date.now();
    const run = r.m.start({ only: 'tug', force: true }); await r.untilGo(); await r.wait(100);
    assert.ok(r.E.pos.x < 1920, 'prank plays on the primary display: ' + r.E.pos.x);
    const res = await run; assert.notEqual(res.reason, 'other-display'); assert.equal(r.cls.opened, r.cls.closed);
    await r.wait(1500); assert.ok(r.E.pos.x >= 0 && r.E.pos.x <= 3456 - 60 && r.E.pos.y >= 0 && r.E.pos.y <= 1080, 'sprite on-screen: ' + JSON.stringify(r.E.pos));
  } finally { r.done(); }
});

test('walk-in: before the overlay exists the sprite walks to the start spot at its normal walking pace (no fast lerp, no flight), then the prank starts', async () => {
  const r = rig({ sx: 400, speed: 1 }); try {
    const run = r.m.start({ only: 'tug', force: true }), xs = [], pts = []; let walking = 0, overlayEarly = 0;
    while (!r.cls.wentAt && xs.length < 3000) {
      await r.wait(8); const x = r.E.pos.x;
      if (r.cls.opened && r.E.script && r.E.script.name === 'mischief-walkin') overlayEarly++;
      if (xs.length && x !== xs[xs.length - 1] && r.E.state === 'walk') walking++;
      xs.push(x); pts.push([Date.now(), x]);
      if (r.cls.opened) break;
    }
    // speed over ~120 ms windows (single timer ticks are jittery on a busy machine, the pace is what matters)
    let max = 0; for (let i = 0, j = 0; i < pts.length; i++) { while (j < pts.length && pts[j][0] - pts[i][0] < 120) j++; if (j < pts.length) max = Math.max(max, Math.abs(pts[j][1] - pts[i][1]) / ((pts[j][0] - pts[i][0]) / 1000)); }
    await r.untilGo();
    const spans = xs.filter((x) => x > 405 && x < 990).length;
    assert.ok(spans > 150, 'it walked there visibly (' + spans + ' frames in between), not a jump');
    assert.ok(max <= 150, 'max speed while walking in ' + max.toFixed(0) + ' px/s <= walking bound 150 (cat walks at 128)');
    assert.ok(max >= 60, 'and it really moved at walking speed: ' + max.toFixed(0));
    assert.ok(walking > 100, 'in the walk state'); assert.equal(overlayEarly, 0, 'no overlay while it is still walking over');
    assert.ok(Math.abs(xs[xs.length - 1] - 999) < 20, 'arrived at the spot: ' + xs[xs.length - 1]);
    r.m.stop(); await run;
  } finally { r.done(); }
});
test('walk-in can be cancelled: grabbing the sprite, stop(), lock or a hidden pet while it walks over ends the prank without any overlay', async () => {
  const cases = [['sprite-grabbed', (r) => r.E.grab()], ['stopped', (r) => r.m.stop()], ['session-locked', (r) => { r.st.flags.locked = true; }], ['hidden', (r) => { r.st.flags.userHidden = true; }]];
  for (const [why, act] of cases) {
    const r = rig({ sx: 300, speed: 1 }); try {
      const run = r.m.start({ only: 'tug', force: true }); await r.wait(500); assert.equal(r.E.script && r.E.script.name, 'mischief-walkin', why + ': walking over'); act(r);
      const t0 = Date.now(), res = await run;
      assert.equal(res.status, 'skipped', why); assert.equal(res.reason, why, why); assert.ok(Date.now() - t0 < 400, why + ' stops quickly'); assert.equal(r.cls.opened, 0, why + ': no overlay'); assert.ok(!r.cls.order.includes('capture'), why + ': no capture');
      assert.ok(!r.E.script || r.E.script.name !== 'mischief-walkin', 'walk-in script released');
    } finally { r.done(); }
  }
});

// ---- the desktop-icon gags on a 2-monitor mixed-DPI desktop with a normal one-column icon layout (they used to be unplannable: domino needed a row of four icons)
function mixedRig(k, over = {}) {
  const bw = Math.round(1920 * k), bh = Math.round(1080 * k), P = (x, y, w, h) => [Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k)];
  const DP = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 }, scaleFactor: k, phys: L.R(0, 0, bw, bh) };
  const DS = { id: 2, bounds: { x: 1920, y: 0, width: 1536, height: 864 }, workArea: { x: 1920, y: 0, width: 1536, height: 824 }, scaleFactor: 1, phys: L.R(bw, 0, 1536, 864) };
  const r = rig(Object.assign({ sx: 700 }, over)), displays = [DP, DS];
  r.st.displays = displays; r.st.toDip = (q) => L.physToDip(q, displays); r.E.setWorld(displays.map((x) => ({ id: x.id, bounds: x.bounds, workArea: x.workArea })));
  r.ps.scan = () => ({ bar: [0, bh - Math.round(48 * k), bw, Math.round(48 * k)],
    items: [{ k: 'start', c: 'ToggleButton', n: '', r: P(562, 1032, 45, 48) }, ...[875, 919, 963, 1007, 1051, 1095].map((x) => ({ k: 'btn', c: 'Taskbar.TaskListButtonAutomationPeer', n: '', r: P(x, 1032, 44, 48) })),
      { k: 'tray', c: 'SystemTray.OmniButton', n: 'Clock', r: P(1841, 1032, 63, 48) }],
    desk: [0, 1, 2, 3, 4, 5].map((i) => P(10, 10 + i * 100, 75, 90)), fg: { h: 99, p: 'notepad', c: 'Notepad', z: 0, i: 0, r: P(300, 200, 900, 600) } });
  r.ps.fgR = P(300, 200, 900, 600);
  return r;
}
for (const id of ['moustache', 'domino', 'sled']) {
  for (const [k, onSecond] of [[1.5, false], [1.5, true]]) {
    test(`${id} plays on a mixed-DPI 2-monitor desktop (primary ${k * 100}%, second monitor 100%), sprite starting on the ${onSecond ? 'second' : 'primary'} monitor`, async () => {
      const r = mixedRig(k); try {
        if (onSecond) { r.E.pos = { x: 2600, y: 824 - 60 }; r.E.onFloor = true; r.E.setState('idle', 0); r.E.nextDecision = 1e15; r.E.lastChange = Date.now(); }
        const run = r.m.start({ only: id, force: true }); await r.untilGo(); await r.wait(150);
        assert.ok(r.E.script && r.E.script.name === 'mischief:' + id, 'the prank itself is running'); const sc = r.cls.scenes[0];
        assert.equal(sc.plan.id, id); assert.ok(Object.keys(sc.crops).length >= 1, 'icon crops were captured'); assert.ok(sc.ox >= 0 && sc.ox + sc.w <= 1920, 'overlay is on the primary display, where the desktop icons are');
        if (id === 'domino') assert.equal(sc.plan.mode, 'col', 'one column of icons: chain flip');
        r.m.stop(); const res = await run; assert.equal(res.reason, 'stopped'); assert.equal(r.cls.opened, r.cls.closed);
      } finally { r.done(); }
    });
  }
}
test('normal (unforced) selection on that desktop picks the icon gags often, and never reports no-target', async () => {
  let icon = 0, n = 0;
  for (let i = 0; i < 6; i++) {
    const rnd = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8][i], r = mixedRig(1.5, { rand: () => rnd, sx: 999 }); try {
      const run = r.m.start({}); await r.untilGo(); const id = r.cls.scenes[0].plan.id; n++; if (['moustache', 'domino', 'sled'].includes(id)) icon++;
      r.m.stop(); const res = await run; assert.ok(res.reason !== 'no-target');
    } finally { r.done(); }
  }
  assert.equal(n, 6); assert.ok(icon >= 2, 'icon gags were picked ' + icon + '/6 with a visible desktop');
});

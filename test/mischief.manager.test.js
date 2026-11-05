'use strict';
// The orchestration with a fake probe, host and engine clock: abort rules end a prank within 250 ms and always take the overlay down.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/main/mischief/logic');
const { createManager } = require('../src/main/mischief/manager');
const { freshEngine, LAYOUTS } = require('./helpers');

const D1 = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 }, scaleFactor: 1, phys: L.R(0, 0, 1920, 1080) };
const SCAN = (ps) => ({
  bar: [0, 1032, 1920, 48],
  items: [{ k: 'start', c: 'ToggleButton', n: '', r: [562, 1032, 45, 48] },
    ...[875, 919, 963, 1007, 1051, 1095].map(x => ({ k: 'btn', c: 'Taskbar.TaskListButtonAutomationPeer', n: '', r: [x, 1032, 44, 48] })),
    { k: 'tray', c: 'SystemTray.AccentButton', n: 'Network', r: [1749, 1032, 24, 48] }, { k: 'tray', c: 'SystemTray.OmniButtonCenter', n: 'Volume', r: [1777, 1032, 24, 48] },
    { k: 'tray', c: 'SystemTray.AccentButton', n: 'Power', r: [1805, 1032, 28, 48] }, { k: 'tray', c: 'SystemTray.OmniButton', n: 'Clock', r: [1841, 1032, 63, 48] }],
  desk: [], fg: { h: ps.fgH, p: 'notepad', c: 'Notepad', z: 0, i: 0, r: ps.fgR },
});

function rig(over = {}) {
  const E = freshEngine(), cls = { wentAt: 0, closed: 0, opened: 0, probeStarted: 0, probeStopped: 0, scenes: [], fx: [], emitted: [] };
  E.init({ event: () => {}, toy: () => {}, state: () => {} }, 1000); E.setWorld([{ id: 1, bounds: D1.bounds, workArea: D1.workArea }]); E.setSize(60); E.settings = { speed: 1, personality: 'chill', mischief: 25 };
  E.moveType = 'walk'; E.gait = 'step'; E.pos = { x: 700, y: 1032 - 60 }; E.vel = { x: 0, y: 0 }; E.onFloor = true; E.setState('idle', 0); E.nextDecision = 1e15; E.tick(Date.now()); E.lastChange = Date.now(); E.onFloor = true; E.setState('idle', 0); E.lastChange = Date.now();   // hold the random brain quiet (it would otherwise decide() because the fake clock is far from Date.now())
  const ps = { fgH: 99, fgR: [300, 200, 900, 600], c: null, s: null, v: null, probeDead: false, pw: false }, st = { cursor: { x: 1500, y: 300 }, flags: { userHidden: false, petShown: true, paused: false, stayPut: false, reduceMotion: false, locked: false, suspended: false, fullscreen: false }, displays: [D1], enabled: true };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const probe = {
    start() { cls.probeStarted++; return true; }, stop() { cls.probeStopped++; }, isAlive: () => true,
    async request(cmd) {
      await wait(2); if (ps.probeDead) return null;
      if (cmd === 'scan') return SCAN(ps);
      if (cmd === 'text') return { pw: ps.pw, l: [0, 1, 2, 3, 4, 5].map(i => [330, 250 + i * 26, 520, 20]) };
      return { fg: { h: ps.fgH, p: 'notepad', c: 'Notepad', z: 0, i: 0, r: ps.fgR }, c: ps.c, s: ps.s, v: [330, 250, 520, 20] };
    },
  };
  const host = {
    displays: () => st.displays, toDip: (r) => r, count: () => (cls.opened - cls.closed > 0 ? 1 : 0), show() {}, go() { cls.wentAt = Date.now(); },
    async capture(display, crops) { const o = {}; for (const k of Object.keys(crops)) o[k] = { rect: crops[k], png: 'data:,', padL: 8, padT: 8, padR: 8, padB: 8 }; return o; },
    openOverlay(display, scene, ready) { cls.opened++; cls.scenes.push(scene); setTimeout(ready, 3); }, close() { if (cls.opened > cls.closed) cls.closed++; },
  };
  if (over.spy) over.spy(host, cls);
  const m = createManager(Object.assign({
    platform: 'win32', now: Date.now, rand: () => 0.5, log: () => {}, engine: E, host, activity: L.createActivity(), settings: () => ({ enabled: st.enabled, freq: 'normal' }), flags: () => st.flags,
    makeProbe: () => probe, char: () => 'cat', cursor: () => st.cursor, emit: (t) => cls.emitted.push(t), setFx: (f) => cls.fx.push(f), sleep: wait,
    spriteBox: () => L.R(E.pos.x, E.pos.y, 60, 60), hidePet() {},
  }, over));
  const tk = setInterval(() => E.tick(Date.now()), 16);
  return { E, m, ps, st, cls, wait, done() { clearInterval(tk); }, async untilGo() { for (let i = 0; i < 400 && !cls.wentAt; i++) await wait(5); assert.ok(cls.wentAt, 'prank started'); } };
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
  const order = []; const r = rig({ spy: (h) => { const c = h.capture, o = h.openOverlay, cl = h.close; h.capture = async (...a) => { order.push('capture'); return c(...a); }; h.openOverlay = (...a) => { order.push('overlay'); return o(...a); }; h.close = () => { order.push('close'); return cl(); }; } });
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

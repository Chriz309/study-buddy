'use strict';
// Lively behaviour, deterministic: a headless engine on fake time (seeded Math.random) and the prank scheduler on mock timers.
const test = require('node:test');
const assert = require('node:assert/strict');
const geo = require('../src/shared/geometry');
const scripts = require('../src/main/scripts');
const L = require('../src/main/mischief/logic');
const { createManager } = require('../src/main/mischief/manager');
const { LAYOUTS, freshEngine, rng } = require('./helpers');

const SIZE = 100, LAYOUT = LAYOUTS.single, DISP = LAYOUT[0];
const CHARS = { blob: { move: 'walk', gait: 'hop' }, cat: { move: 'walk', gait: 'step' }, hero: { move: 'walk', gait: 'step' }, ghost: { move: 'float', gait: 'hop' } };

// 10 simulated minutes at 60 fps. Mirrors main.js: the antic planner decides when, a walking sprite is settled, a busy one retries in 8 s.
function simulate(charId, mischief, seed, minutes = 10) {
  const realRandom = Math.random; Math.random = rng(seed);
  try {
    const E = freshEngine(), c = CHARS[charId], counts = { climb: 0, peek: 0, toWindow: 0, jump: 0, zoom: 0 }, played = [];
    E.init({ event: () => {}, toy: () => {}, state: () => {} }, 0);
    E.setWorld(LAYOUT); E.setSize(SIZE); E.settings = { speed: 1, personality: 'chill', mischief };
    E.moveType = c.move; E.gait = c.gait; E.pos = geo.homePosition(SIZE, LAYOUT, null); E.vel = { x: 0, y: 0 }; E.onFloor = c.move !== 'float'; E.setState('idle', 0);
    const run0 = E.run.bind(E); E.run = (b) => { if (b in counts) counts[b]++; return run0(b); };
    const planner = scripts.createAnticPlanner(Math.random); planner.reset(0);
    let due = planner.delay(0, mischief), now = 0, cur = null, curAt = 0, stuck = 0;
    const END = minutes * 60000, DT = 1000 / 60;
    while (now < END) {
      now += DT; E.tick(now);
      if (E.script && E.script !== cur) { cur = E.script; curAt = now; }
      if (cur && !E.script) {   // a script finished or was cancelled: the sprite must be back on screen and the brain must be free
        assert.ok(geo.visibleFraction(E.pos, SIZE, LAYOUT) > 0.5, `${charId}/${cur.name} ended off-screen at ${JSON.stringify(E.pos)}`);
        assert.ok(now - curAt <= (cur.maxMs || 20000) + 3000, `${cur.name} overran`); cur = null;
      }
      if (cur && now - curAt > (cur.maxMs || 20000) + 3000) stuck++;
      if (!E.script && now >= due) {
        if (E.state === 'walk') E.settle();
        const sc = scripts.makeScript(charId, null, Math.random);
        if (E.canStartScript(sc.allowAir === true) && E.startScript(sc, now)) { played.push(sc.name); planner.fired(now); due = now + planner.delay(now, mischief); }
        else due = now + 1500;
      }
      assert.ok(Number.isFinite(E.pos.x) && Number.isFinite(E.pos.y), 'finite');
    }
    // no stuck state: let the brain run free for 5 s and check it is not scripted/dragged/climbing forever
    if (E.script) { E.cancelScript('test'); }
    for (let i = 0; i < 300; i++) { now += DT; E.tick(now); }
    assert.equal(stuck, 0, 'no script outlived its cap');
    assert.equal(E.script, null); assert.equal(E.dragging, false);
    assert.ok(geo.visibleFraction(E.pos, SIZE, LAYOUT) > 0.99 || E.state === 'walk' || E.state === 'climb' || E.state === 'fall', `${charId} ends on-screen: ${JSON.stringify(E.pos)} ${E.state}`);
    assert.ok(E.pos.x >= DISP.bounds.x - 1 && E.pos.x <= DISP.bounds.x + DISP.bounds.width, 'x within the display');
    return { counts, played, E };
  } finally { Math.random = realRandom; }
}

test('blob at Mischief 100% climbs or peeks at least 5 times in 10 minutes; at 0% at most once', () => {
  for (const seed of [1, 2, 3]) {
    const hi = simulate('blob', 100, seed), lo = simulate('blob', 0, seed);
    assert.ok(hi.counts.climb + hi.counts.peek + hi.counts.toWindow >= 5, `seed ${seed}: ${JSON.stringify(hi.counts)}`);
    assert.ok(lo.counts.climb + lo.counts.peek + lo.counts.toWindow <= 1, `seed ${seed}: ${JSON.stringify(lo.counts)}`);
  }
});

test('cat stays wall-free but jumps and zooms more at high mischief', () => {
  const hi = simulate('cat', 100, 4), lo = simulate('cat', 0, 4);
  assert.equal(hi.counts.climb + hi.counts.peek + hi.counts.toWindow, 0, 'cat never wall-climbs');
  assert.ok(hi.counts.zoom >= 5 && hi.counts.jump > lo.counts.jump && hi.counts.zoom > lo.counts.zoom, JSON.stringify([hi.counts, lo.counts]));
});

for (const id of Object.keys(CHARS)) {
  test(`${id} at Mischief 100% plays at least 3 special antics in 10 minutes, all end on-screen, nothing stuck`, () => {
    for (const seed of [11, 12]) {
      const r = simulate(id, 100, seed);
      assert.ok(r.played.length >= 3, `seed ${seed}: ${r.played.join(',')}`);
      for (const n of r.played) assert.ok(scripts.ANTIC_NAMES[id].includes(n));
    }
  });
}

test('each new blob/ghost antic completes by itself on every layout and stays on its display', () => {
  for (const [id, names] of [['blob', ['wallscale', 'spree']], ['ghost', ['wallphase', 'swoop']]]) for (const n of names) for (const layout of Object.values(LAYOUTS)) {
    const E = freshEngine(); E.init({ event: () => {}, toy: () => {}, state: () => {} }, 0); E.setWorld(layout); E.setSize(SIZE);
    E.settings = { speed: 1, personality: 'chill', mischief: 50 }; E.moveType = CHARS[id].move; E.gait = CHARS[id].gait;
    E.pos = geo.homePosition(SIZE, layout, null); E.onFloor = CHARS[id].move !== 'float'; E.setState('idle', 0); E.nextDecision = 1e12;
    const sc = scripts.makeScript(id, n, rng(7)); assert.ok(E.startScript(sc, 0), `${id}/${n} starts`);
    let now = 0; for (let i = 0; i < 60 * 40 && E.script; i++) { now += 1000 / 60; E.tick(now); assert.ok(geo.displayAt(layout, E.pos.x + SIZE / 2, E.pos.y + SIZE / 2) || E.pos.y < 0, `${n} centre on a monitor`); }
    assert.equal(E.script, null, `${id}/${n} finished`);
    // cancel on drag
    const E2 = freshEngine(); E2.init({ event: () => {}, toy: () => {}, state: () => {} }, 0); E2.setWorld(layout); E2.setSize(SIZE); E2.settings = { speed: 1, personality: 'chill', mischief: 50 };
    E2.moveType = CHARS[id].move; E2.gait = CHARS[id].gait; E2.pos = geo.homePosition(SIZE, layout, null); E2.onFloor = CHARS[id].move !== 'float'; E2.setState('idle', 0); E2.nextDecision = 1e12;
    assert.ok(E2.startScript(scripts.makeScript(id, n, rng(7)), 0)); for (let i = 0; i < 40; i++) E2.tick(16 * (i + 1)); E2.grab(); assert.equal(E2.script, null, 'drag cancels');
  }
});

// ---------------------------------------------------------------- prank scheduler on mock timers
const SCAN = () => ({
  bar: [0, 1032, 1920, 48],
  items: [{ k: 'start', c: 'ToggleButton', n: '', r: [562, 1032, 45, 48] },
    ...[875, 919, 963, 1007, 1051, 1095].map(x => ({ k: 'btn', c: 'Taskbar.TaskListButtonAutomationPeer', n: '', r: [x, 1032, 44, 48] })),
    { k: 'tray', c: 'SystemTray.AccentButton', n: 'Network', r: [1749, 1032, 24, 48] }, { k: 'tray', c: 'SystemTray.OmniButtonCenter', n: 'Volume', r: [1777, 1032, 24, 48] },
    { k: 'tray', c: 'SystemTray.OmniButton', n: 'Clock', r: [1841, 1032, 63, 48] }],
  desk: [], fg: { h: 99, p: 'notepad', c: 'Notepad', z: 0, i: 0, r: [300, 200, 900, 600] },
});
const D1 = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 }, scaleFactor: 1, phys: L.R(0, 0, 1920, 1080) };
const flush = () => new Promise(r => setImmediate(r));

async function prankRig(t, freq, { busyCursor = true } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1.7e12 });
  const E = freshEngine(); const log = [], cls = { opened: 0, closed: 0 };
  E.init({ event: () => {}, toy: () => {}, state: () => {} }, Date.now()); E.setWorld([{ id: 1, bounds: D1.bounds, workArea: D1.workArea }]); E.setSize(60);
  E.settings = { speed: 1, personality: 'chill', mischief: 25 }; E.moveType = 'walk'; E.gait = 'step'; E.pos = { x: 700, y: 1032 - 60 }; E.vel = { x: 0, y: 0 };
  E.onFloor = true; E.setState('idle', 0); E.nextDecision = 1e15; E.tick(Date.now()); E.lastChange = Date.now();
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const probe = { start: () => true, stop() {}, isAlive: () => true, async request(cmd) { await wait(2); if (cmd === 'scan') return SCAN(); if (cmd === 'text') return { pw: false, l: [] }; return { fg: SCAN().fg, c: null, s: null, v: [330, 250, 520, 20] }; } };
  const host = { displays: () => [D1], toDip: (r) => r, count: () => 0, show() {}, go() {},
    async capture(d, crops) { const o = {}; for (const k of Object.keys(crops)) o[k] = { rect: crops[k], png: 'data:,', padL: 8, padT: 8, padR: 8, padB: 8 }; return o; },
    openOverlay(d, scene, ready) { cls.opened++; setTimeout(ready, 3); }, close() { cls.closed++; } };
  const act = L.createActivity(); if (busyCursor) act.busy = () => true;   // the user is wiggling the mouse the whole time
  const m = createManager({ platform: 'win32', now: Date.now, rand: () => 0.5, log: (...a) => log.push(a.join(' ')), engine: E, host, activity: act, settings: () => ({ enabled: true, freq }),
    flags: () => ({ userHidden: false, petShown: true, paused: false, stayPut: false, reduceMotion: false, locked: false, suspended: false, fullscreen: false }),
    makeProbe: () => probe, char: () => 'cat', cursor: () => ({ x: 1700, y: 100 }), emit: () => {}, setFx: () => {}, sleep: wait, spriteBox: () => L.R(E.pos.x, E.pos.y, 60, 60), hidePet() {} });
  const tk = setInterval(() => E.tick(Date.now()), 16);
  const advance = async (ms) => { for (let i = 0; i < ms / 25; i++) { t.mock.timers.tick(25); await flush(); } };
  return { E, m, log, cls, advance, stop() { clearInterval(tk); m.stop('test'); } };
}

test('chaos: a prank starts within 90 s of simulated time even though the sprite is walking and the cursor is busy', async (t) => {
  const r = await prankRig(t, 'chaos');
  try {
    r.E.target = 1500; r.E.setState('walk', 1e9);   // walking across the screen
    r.m.schedule();
    const first = /prank scheduled in (\d+)s/.exec(r.log[0]); assert.ok(first && +first[1] >= 20 && +first[1] <= 40, 'first prank in 20-40 s: ' + r.log[0]);
    await r.advance(90000);
    assert.ok(r.cls.opened >= 1, 'a prank overlay opened:\n' + r.log.join('\n'));
    assert.ok(!r.log.some(l => /skipped: (user-busy)/.test(l)), 'user-busy does not block on chaos');
  } finally { r.stop(); }
});

test('normal frequency: the walking sprite is settled, but a busy cursor still blocks (retry 15-35 s)', async (t) => {
  const r = await prankRig(t, 'normal');
  try {
    r.E.target = 1500; r.E.setState('walk', 1e9); r.m.schedule();
    await r.advance(5 * 60000);
    assert.equal(r.cls.opened, 0, 'busy cursor blocks outside chaos'); assert.ok(r.log.some(l => /prank skipped: user-busy/.test(l)));
  } finally { r.stop(); }
});

test('a script, a drag or sleep still counts as busy: chaos retries in 5-10 s', async (t) => {
  const r = await prankRig(t, 'chaos', { busyCursor: false });
  try {
    r.E.setState('sleep', 1e9); r.m.schedule(); await r.advance(40000);
    assert.ok(r.log.some(l => /prank skipped: sprite-busy/.test(l)), r.log.join('\n'));
    const retry = r.log.filter(l => /prank scheduled in/.test(l)).map(l => +/in (\d+)s/.exec(l)[1]);
    assert.ok(retry.slice(1).every(s => s >= 5 && s <= 10), 'retry delays ' + retry);
    assert.equal(r.cls.opened, 0);
  } finally { r.stop(); }
});

test('a settings change (refresh) recomputes from the time since the cycle began and never pushes a due prank back', async (t) => {
  const r = await prankRig(t, 'chaos', { busyCursor: false });
  try {
    r.m.schedule(); const d0 = +/in (\d+)s/.exec(r.log[0])[1];
    await r.advance(20000); r.m.refresh();
    const d1 = +/in (\d+)s/.exec(r.log[r.log.length - 1])[1];
    assert.ok(d1 <= d0 - 19 && d1 >= 2, `after 20 s of ${d0} s the remaining wait is ~${d0 - 20} s, got ${d1}`);
  } finally { r.stop(); }
});

test('settle(): a walking, climbing or window-perched sprite is brought to rest on the ground so an antic/prank can start; scripts, drags and sleep are left alone', () => {
  const E = freshEngine(); E.init({ event: () => {}, toy: () => {}, state: () => {} }, 0); E.setWorld(LAYOUT); E.setSize(SIZE);
  E.settings = { speed: 1, personality: 'chill', mischief: 25 }; E.moveType = 'walk'; E.gait = 'step'; E.pos = geo.homePosition(SIZE, LAYOUT, null); E.onFloor = true; E.setState('idle', 0); E.nextDecision = 1e12;
  let now = 100; const tick = (ms) => { for (let i = 0; i < ms / 16; i++) { now += 16; E.tick(now); } };
  tick(100);
  E.target = 1500; E.setState('walk', 1e9); assert.equal(E.canStartScript(), false); assert.ok(E.settle()); tick(1500); assert.ok(E.canStartScript(), 'walking sprite is startable after settling');
  E.ledge = { x0: 0, x1: 1900, y: 500 }; E.pos.y = 500 - SIZE; E.onFloor = true; assert.ok(E.onLedge()); assert.equal(E.canStartScript(), false);
  assert.ok(E.settle()); tick(2500); assert.ok(!E.onLedge() && E.canStartScript(), 'stepped down from the window ledge');
  E.setState('sleep', 1e9); assert.equal(E.settle(), false, 'sleep is left alone'); E.setState('idle', 0);
  E.grab(); assert.equal(E.settle(), false, 'drag is left alone');
});

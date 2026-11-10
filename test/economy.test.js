'use strict';
// Idle points (src/main/economy.js), wake rules (src/main/wake.js), the probe's backed-off fallback, and source guards for the
// 0.9.1 fixes: the clock can no longer pay or take Sparks, and the old purchase / earn endpoints are gone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const E = require('../src/main/economy');
const W = require('../src/main/wake');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('a normal tick pays rate x seconds', () => {
  assert.equal(E.earn(100, 2.6, 1000), 102.6);
  assert.equal(E.earn(0, 1, 1004), 1.004);
});

test('a sleeping PC or a clock set forward pays for a few seconds at most', () => {
  assert.equal(E.earn(100, 2, 8 * 3600 * 1000), 100 + 2 * E.MAX_TICK_MS / 1000);
  assert.equal(E.earn(100, 2, E.MAX_TICK_MS), 110);
});

test('a clock set backwards takes nothing away', () => {
  assert.equal(E.earn(100, 2.6, -2 * 3600 * 1000), 100);
  assert.equal(E.earn(100, 2.6, 0), 100);
});

test('a damaged balance or junk input never turns into NaN', () => {
  for (const bad of [NaN, null, undefined, 'abc', Infinity]) assert.equal(E.earn(bad, 1, 1000), 1);
  assert.equal(E.earn(50, NaN, 1000), 50); assert.equal(E.earn(50, 1, NaN), 50); assert.equal(E.earn('7', 1, 1000), 8);
});

test('rate: 1 base, +0.4 per extra buddy, +0.1 per feed level of EVERY owned buddy', () => {
  assert.equal(E.sparkRate(['blob'], {}), 1);
  assert.equal(E.sparkRate(['blob', 'cat', 'hero'], {}), 1.8);
  assert.equal(E.sparkRate(['blob', 'cat'], { blob: 3, cat: 7 }), 2.4);
  assert.equal(E.sparkRate(['blob'], { blob: 2, cat: 50 }), 1.2, 'levels of buddies that are not owned do not count');
  assert.equal(E.sparkRate(['blob'], { blob: -4 }), 1); assert.equal(E.sparkRate(['blob'], { blob: 'x' }), 1);
  assert.equal(E.sparkRate(null, null), 1);
});

test('wake detection from the timer gap', () => {
  assert.equal(E.looksLikeWake(1000), false); assert.equal(E.looksLikeWake(E.WAKE_GAP_MS), false);
  assert.equal(E.looksLikeWake(E.WAKE_GAP_MS + 1), true); assert.equal(E.looksLikeWake(-5e6), false); assert.equal(E.looksLikeWake(NaN), false);
});

test('several wake signals close together cause one rebuild', () => {
  assert.equal(W.tooSoon(1000, 0), false, 'the first wake ever');
  assert.equal(W.tooSoon(50000, 50000 - 800), true, 'unlock-screen right after resume');
  assert.equal(W.tooSoon(50000 + W.MIN_GAP_MS, 50000), false);
  assert.equal(W.tooSoon(1000, 90000), false, 'a clock that went backwards must not block the next wake');
  assert.ok(W.SETTLE_MS >= 500 && W.SETTLE_MS < W.MIN_GAP_MS);
});

test('main.js: the tick uses the clock-safe maths and a wake rebuilds the windows', () => {
  const src = read('src/main/main.js');
  assert.ok(src.includes('economy_.earn(s.sparks, sparkRate(), gap)'));
  assert.ok(src.includes("if (economy_.looksLikeWake(gap)) onWake('timer-gap')"));
  assert.ok(/powerMonitor\.on\(ev, \(\) => onWake\(ev\)\)/.test(src));
  const wake = src.slice(src.indexOf('function onWake('), src.indexOf('function bringBuddyBack'));
  for (const need of ['rebuildPetWindow()', 'companions.rebuildWindows()', 'fgProbe.restart()', 'wake.tooSoon(']) assert.ok(wake.includes(need), need);
});

test('the old direct purchase and free-Sparks endpoints are gone, and the default menu (DevTools shortcut) is removed', () => {
  const main = read('src/main/main.js'), pre = read('src/main/preload.js');
  for (const gone of ["handle('buddy:unlock'", "handle('buddy:earn'"]) assert.ok(!main.includes(gone), gone);
  for (const gone of ['buddy:unlock', 'buddy:earn']) assert.ok(!pre.includes(gone), gone);
  assert.ok(main.includes('Menu.setApplicationMenu('));
  const ui = ['settings.js', 'wardrobe.js', 'study.js'].map(f => read('src/settings/' + f)).join('\n');
  assert.ok(!/buddy\.(unlock|earn)\(/.test(ui), 'the settings pages must not call the removed endpoints');
});

test('no setting without an effect: roamMonitors is gone everywhere', () => {
  for (const f of ['src/shared/catalog.js', 'src/settings/settings.js', 'src/main/main.js']) assert.ok(!read(f).includes('roamMonitors'), f);
});

test('probe fallback: backs off after failures, recovers after a success, never runs twice inside the minimum wait', () => {
  const P = require('../src/main/fgprobe')._test; P.reset();
  let runs = 0, answer = null; const run = (_c, _a, _o, cb) => { runs++; cb(answer ? null : new Error('x'), answer || ''); };
  const ask = (now) => { let got; P.oneShot((v) => { got = v; }, now, run); return got; };
  let t = 100000; assert.equal(ask(t), null); assert.equal(runs, 1);
  assert.equal(ask(t + 1500), null); assert.equal(runs, 1, 'inside the wait: no new process');
  const waits = []; for (let i = 0; i < 12; i++) { t = P.state().oneShotNextAt; ask(t); waits.push(P.state().oneShotWait); }
  assert.equal(runs, 13); assert.equal(waits[waits.length - 1], P.ONE_SHOT_MAX_WAIT); assert.ok(waits[0] > P.ONE_SHOT_MIN_WAIT);
  answer = '0,0,10,10|X|1|0|'; t = P.state().oneShotNextAt; assert.equal(ask(t), answer); assert.equal(P.state().oneShotWait, 0);
  assert.equal(P.nextWait(0), P.ONE_SHOT_MIN_WAIT); assert.equal(P.nextWait(P.ONE_SHOT_MAX_WAIT), P.ONE_SHOT_MAX_WAIT);
  assert.ok(/System32/i.test(P.POWERSHELL) && path.isAbsolute(P.POWERSHELL), 'absolute path, never a PATH lookup');
  P.reset();
});

test('engine: a long walk or fall is not cut short by the stuck guard, a long rest still is', () => {
  const Engine = require('../src/main/engine'); const e = Engine.create();
  e.init({}, 0); e.setWorld([{ id: 1, bounds: { x: 0, y: 0, width: 6000, height: 1000 }, workArea: { x: 0, y: 0, width: 6000, height: 960 } }]);
  e.setSize(50); e.setGait('step'); e.pos = { x: 10, y: e.floorAt(10) }; e.onFloor = true;
  let t = 1000; e.tick(t); e.nextDecision = Infinity; e.target = 5800; e.setState('walk', 1e9);
  for (let i = 0; i < 15 * 60; i++) { t += 16; e.tick(t); }   // 15 s of walking
  assert.equal(e.state, 'walk'); assert.equal(e.target, 5800); assert.ok(e.pos.x > 1500, 'still on its way: ' + e.pos.x);
});

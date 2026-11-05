'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const geo = require('../src/shared/geometry');
const scripts = require('../src/main/scripts');
const { LAYOUTS, freshEngine, run, rng } = require('./helpers');

const SIZE = 100;
function setup(layout = LAYOUTS.dual, pos) {
  const E = freshEngine();
  const log = { events: [], toy: [], states: new Set() };
  E.init({ event: (t, d) => log.events.push([t, d]), toy: (c) => log.toy.push(c), state: (s) => log.states.add(s) }, 1000);
  E.setWorld(layout); E.setSize(SIZE); E.settings = { speed: 1, personality: 'chill', mischief: 25 };
  E.moveType = 'walk'; E.gait = 'step';
  E.pos = pos ? { ...pos } : geo.homePosition(SIZE, layout, null);
  E.vel = { x: 0, y: 0 }; E.onFloor = true; E.setState('idle', 0);
  E.nextDecision = 1e12;   // keep the random brain quiet so the pet is resting when the antic starts
  E.tick(1100);
  return { E, log };
}
// run until the antic ends (cap ms), then settle 1.5 s with the random brain held off so we look at the antic's own end state
function runScript(E, cap, probe, from = 1200) {
  let now = from;
  for (let t = 0; t < cap && E.script; t += 1000 / 60) { now += 1000 / 60; E.tick(now); if (probe) probe(E, t); }
  E.nextDecision = 1e12; E.lastChange = now;
  return run(E, 1500, null, now);
}
const start = (E, charId, name, seed = 1) => { const ok = E.startScript(scripts.makeScript(charId, name, rng(seed)), 1200); assert.ok(ok, 'script started'); };
const evs = (log) => log.events.map(e => e[0]);

test('nextAnticDelay: cat chase every 10-25 minutes, randomised', () => {
  const ds = new Set();
  for (let s = 1; s < 60; s++) { const d = scripts.nextAnticDelay('cat', rng(s)); assert.ok(d >= 10 * 60000 && d <= 25 * 60000, String(d)); ds.add(d); }
  assert.ok(ds.size > 20, 'varied');
  assert.equal(scripts.nextAnticDelay('cat', () => 0), 10 * 60000);
  assert.ok(scripts.nextAnticDelay('cat', () => 0.999999) >= 25 * 60000 - 2);
});

test('makeScript: cat -> chase, hero -> its three stunts, others -> none', () => {
  assert.equal(scripts.makeScript('cat').name, 'chase');
  assert.deepEqual(['landing', 'patrol', 'powerup'].map(n => scripts.makeScript('hero', n).name), ['landing', 'patrol', 'powerup']);
  assert.equal(scripts.makeScript('blob'), null); assert.equal(scripts.makeScript('ghost'), null);
});

test('chase: runs its sequence, faster than a walk, facing the toy, never leaves the display, ends clean', () => {
  for (const [layout, pos] of [[LAYOUTS.dual, { x: 400, y: 940 }], [LAYOUTS.dual, { x: 2500, y: 940 }], [LAYOUTS.single, { x: 1700, y: 940 }], [LAYOUTS.offset, { x: 2200, y: 980 }]]) {
    const { E, log } = setup(layout, pos);
    const D = E.currentDisplay();
    start(E, 'cat', 'chase', 7);
    const walk = scripts.walkSpeed(E); let maxSpeed = 0, lastX = E.pos.x, lastT = 0, facingOk = 0, runTicks = 0, toyX = null;
    log.toyHook = null;
    E.hooks.toy = (c) => { log.toy.push(c); if (c.type === 'move' || c.type === 'spawn') toyX = c.x; };
    runScript(E, 40000, (e, t) => {
      assert.ok(e.pos.x >= D.x0 - 0.01 && e.pos.x + SIZE <= D.x1 + 0.01, 'stays on its display horizontally: ' + e.pos.x);
      assert.ok(e.pos.y <= D.y1 && e.pos.y >= D.y0 - 0.01, 'stays on its display vertically');
      if (e.state === 'run') { runTicks++; maxSpeed = Math.max(maxSpeed, Math.abs(e.pos.x - lastX) / (1 / 60)); if (toyX != null && Math.sign(toyX - (e.pos.x + SIZE / 2)) === e.facing) facingOk++; }
      lastX = e.pos.x;
    }, 1200);
    assert.equal(E.script, null, 'finished');
    assert.ok(runTicks > 30, 'actually ran');
    assert.ok(maxSpeed > walk * 1.8, `run speed ${Math.round(maxSpeed)} vs walk ${Math.round(walk)}`);
    assert.ok(facingOk / runTicks > 0.9, 'faces the toy while running');
    const order = [...evs(log)]; assert.ok(order.includes('wiggle') && order.includes('jump') && order.includes('land') && order.includes('happy'), order.join());
    const types = log.toy.map(c => c.type);
    assert.equal(types[0], 'spawn'); assert.equal(types[types.length - 1], 'end'); assert.equal(types.filter(t => t === 'spawn').length, 1);
    for (const c of log.toy) if (c.type === 'move') assert.ok(c.x > D.x0 - SIZE && c.x < D.x1 + SIZE, 'toy stays near its display');
    assert.ok(['alert', 'run', 'pounce', 'happy', 'sit'].every(s => log.states.has(s)), [...log.states].join());
    assert.ok(E.onFloor, 'ends standing on the floor');
  }
});

test('chase cancelled by a drag mid-run: toy removed, no script, no stuck flags, normal life resumes', () => {
  for (const cancelAt of [200, 1500, 4000, 7000]) {
    const { E, log } = setup(LAYOUTS.dual, { x: 400, y: 940 });
    start(E, 'cat', 'chase', 3);
    let now = run(E, cancelAt, null, 1200);
    assert.ok(E.script, 'still running at ' + cancelAt);
    E.grab();                                                  // the user grabs the cat
    assert.equal(E.script, null); assert.equal(E.state, 'drag'); assert.equal(E.dragging, true);
    assert.equal(log.toy[log.toy.length - 1].type, 'end', 'toy told to end');
    E.dragTo(900, 500); E.dragTo(1000, 300); E.release();
    now = run(E, 8000, null, now);
    assert.equal(E.dragging, false); assert.equal(E.script, null);
    assert.ok(E.onFloor && geo.visibleFraction(E.pos, SIZE, LAYOUTS.dual) > 0.999);
    assert.ok(['idle', 'walk', 'sit', 'sleep', 'fall'].includes(E.state), E.state);
  }
});

test('antics are refused unless the pet is resting on the floor (idle/sit), not stay-put, not dragged', () => {
  const { E } = setup();
  assert.equal(E.canStartScript(), true);
  E.state = 'walk'; assert.equal(E.canStartScript(), false);
  E.state = 'sleep'; assert.equal(E.canStartScript(), false);
  E.state = 'idle'; E.onFloor = false; assert.equal(E.canStartScript(), false);
  E.onFloor = true; E.settings.stayPut = true; assert.equal(E.canStartScript(), false);
  E.settings.stayPut = false; E.dragging = true; assert.equal(E.canStartScript(), false);
  E.dragging = false; assert.equal(E.startScript(scripts.makeScript('cat')), true);
  assert.equal(E.startScript(scripts.makeScript('cat')), false, 'one at a time');
});

test('stay-put, reduce-motion, a character swap or rescue cancel a running antic and tell the toy to end', () => {
  for (const how of ['stayPut', 'reduceMotion', 'char', 'rescue']) {
    const { E, log } = setup();
    start(E, 'cat', 'chase', 5); run(E, 800, null, 1200);
    if (how === 'stayPut') E.setSettings({ stayPut: true }); else if (how === 'reduceMotion') E.setSettings({ reduceMotion: true });
    else if (how === 'char') E.setMoveType('float'); else E.rescue();
    assert.equal(E.script, null, how); assert.equal(log.toy[log.toy.length - 1].type, 'end', how);
  }
});

test('a script that never finishes is stopped by the time cap', () => {
  const { E } = setup();
  E.startScript({ name: 'stuck', maxMs: 2000, init() {}, update() { return false; } }, 1200);
  run(E, 6000, null, 1200);
  assert.equal(E.script, null);
});

test('a script that throws is dropped, not repeated', () => {
  const { E, log } = setup();
  E.startScript({ name: 'bad', init() {}, update() { throw new Error('boom'); } }, 1200);
  run(E, 200, null, 1200);
  assert.equal(E.script, null); assert.equal(log.toy.slice(-1)[0].type, 'end');
});

for (const name of ['landing', 'patrol', 'powerup']) {
  test(`hero ${name}: completes, stays on its display (x) and lands on the floor, no toy`, () => {
    for (const [layout, pos, seed] of [[LAYOUTS.dual, { x: 300, y: 940 }, 1], [LAYOUTS.dual, { x: 2900, y: 940 }, 2], [LAYOUTS.single, { x: 900, y: 940 }, 3]]) {
      const { E, log } = setup(layout, pos);
      const D = E.currentDisplay();
      start(E, 'hero', name, seed);
      let minY = Infinity;
      runScript(E, 30000, (e) => { minY = Math.min(minY, e.pos.y); assert.ok(e.pos.x >= D.x0 - 0.01 && e.pos.x + SIZE <= D.x1 + 0.01, `${name} x ${e.pos.x}`); assert.ok(Number.isFinite(e.pos.y)); }, 1200);
      assert.equal(E.script, null, name + ' finished');
      assert.ok(Math.abs(E.pos.y - E.floorAt(E.pos.x)) < 1 || E.state === 'idle', 'back on the floor');
      assert.ok(geo.visibleFraction(E.pos, SIZE, layout) > 0.999, 'visible at the end');
      assert.equal(log.toy.filter(c => c.type === 'spawn').length, 0);
      const ev = evs(log);
      if (name === 'landing') { assert.ok(minY < D.y0 - SIZE * 0.5, 'leaps off the top'); assert.ok(ev.includes('dust') && ev.includes('land') && ev.includes('squash'), ev.join()); assert.ok(['crouch', 'fly', 'dive', 'land', 'flex'].every(s => log.states.has(s))); }
      if (name === 'patrol') { assert.ok(minY >= D.y0, 'patrol stays on screen'); assert.ok(log.states.has('fly') && ev.includes('launch')); }
      if (name === 'powerup') { assert.ok(ev.includes('sparkle') && ev.includes('popup')); assert.equal(log.events.find(e => e[0] === 'popup')[1].text, '+1 INT!'); assert.ok(log.states.has('flex')); }
    }
  });
}

test('patrol really crosses most of the display, in the direction with more room', () => {
  const { E } = setup(LAYOUTS.single, { x: 100, y: 940 });
  const D = E.currentDisplay(); start(E, 'hero', 'patrol', 1);
  let maxX = 0; runScript(E, 20000, (e) => { maxX = Math.max(maxX, e.pos.x); });
  assert.ok(maxX > D.x1 * 0.85, 'reached the far side: ' + maxX);
});

test('hero antic dragged mid-flight cancels cleanly and the hero is back on screen after the drop', () => {
  for (const name of ['landing', 'patrol', 'powerup']) {
    const { E } = setup(LAYOUTS.dual, { x: 500, y: 940 });
    start(E, 'hero', name, 4); let now = run(E, 900, null, 1200);
    E.grab(); assert.equal(E.script, null);
    E.dragTo(700, 400); E.release(); now = run(E, 6000, null, now);
    assert.ok(E.onFloor && geo.visibleFraction(E.pos, SIZE, LAYOUTS.dual) > 0.999 && !E.dragging, name);
  }
});

'use strict';
// Repro-style tests for "the sprite sometimes becomes unreachable" (see the commit message / report).
// Run them against the pre-fix engine with:  SB_ENGINE=<path to old engine.js> npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const geo = require('../src/shared/geometry');
const { LAYOUTS, freshEngine, run } = require('./helpers');

const SIZE = 100;
function setup(layout, { gait = 'hop', move = 'walk', pos } = {}) {
  const E = freshEngine();
  const events = [];
  E.init({ event: (t, d) => events.push(t), state: () => {} }, 1000);
  LAYOUT = layout; E.setWorld(layout); E.setSize(SIZE); E.settings = { speed: 1, personality: 'chill', mischief: 25 };
  E.moveType = move; E.gait = gait;
  const home = geo.homePosition(SIZE, layout, null);
  E.pos = pos ? { ...pos } : { ...home }; E.vel = { x: 0, y: 0 };
  E.onFloor = true; E.setState('idle', 0);
  return { E, events };
}
let LAYOUT = LAYOUTS.single;   // (the old engine has no .displays, so tests use the layout they set up)
const centreOnScreen = (E) => !!geo.displayAt(LAYOUT, E.pos.x + SIZE / 2, E.pos.y + SIZE / 2);

// a throw: drag to (x,y) in two big jumps (so the engine sees a huge velocity), then let go
function throwTo(E, x, y) {
  E.grab();
  E.dragTo(E.pos.x + SIZE / 2, E.pos.y + SIZE / 2);
  E.dragTo(x, y);
  E.release();
}

const DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];

test('REPRO flick: a hard throw in any direction (parachute rolled) never takes the sprite off-screen, on any monitor layout', () => {
  const realRandom = Math.random;
  Math.random = () => 0.01;                     // worst case: always roll the parachute (weak gravity)
  try {
    for (const [name, layout] of Object.entries(LAYOUTS)) {
      const wb = geo.worldBounds(layout);
      for (const [dx, dy] of DIRS) {
        for (const start of [geo.homePosition(SIZE, layout, null), { x: wb.x0 + 300, y: wb.y0 + 300 }]) {
          const { E } = setup(layout, { pos: start });
          // fling towards the far edge in that direction
          throwTo(E, E.pos.x + dx * 6000, E.pos.y + dy * 6000);
          let worst = 1;
          run(E, 30000, (e) => { worst = Math.min(worst, geo.visibleFraction(e.pos, SIZE, LAYOUT));
            assert.ok(Number.isFinite(e.pos.x) && Number.isFinite(e.pos.y), 'finite position');
            assert.ok(centreOnScreen(e), `${name} dir ${dx},${dy}: sprite centre left every monitor at ${JSON.stringify(e.pos)}`); });
          assert.ok(E.pos.y <= E.floorAt(E.pos.x) + 0.01, `${name} dir ${dx},${dy}: below the floor at ${JSON.stringify(E.pos)}`);
          assert.ok(geo.visibleFraction(E.pos, SIZE, LAYOUT) > 0.999, `${name} dir ${dx},${dy}: lands fully visible`);
        }
      }
    }
  } finally { Math.random = realRandom; }
});

test('REPRO flick upwards with the parachute: the sprite is back on screen within 2 seconds (was ~15 s above the screen)', () => {
  const realRandom = Math.random; Math.random = () => 0.01;
  try {
    const { E } = setup(LAYOUTS.single);
    E.pos.y = 300; E.onFloor = true;   // high enough that the throw rolls the parachute
    E.grab(); E.vel.x = 0; E.vel.y = -1400; E.release();
    let offscreenMs = 0;
    run(E, 20000, (e) => { if (e.pos.y < e.world.y0) offscreenMs += 1000 / 60; });
    assert.ok(offscreenMs < 2000, `was above the screen for ${Math.round(offscreenMs)} ms`);
  } finally { Math.random = realRandom; }
});

test('REPRO dead zone: released over a gap between monitors, the sprite ends up on a monitor', () => {
  for (const name of ['gap', 'offset', 'leftNeg']) {
    const layout = LAYOUTS[name];
    // pick a spot whose centre is in dead space for this layout
    const spots = [];
    const wb = geo.worldBounds(layout);
    for (let x = wb.x0; x < wb.x1; x += 40) for (let y = wb.y0; y < wb.y1; y += 40) if (!geo.displayAt(layout, x, y)) spots.push({ x, y });
    assert.ok(spots.length > 0, name + ' has dead space');
    for (const s of spots.filter((_, i) => i % 7 === 0)) {
      const { E } = setup(layout, { pos: { x: s.x - SIZE / 2, y: s.y - SIZE / 2 } });
      E.onFloor = false; E.setState('fall', 1e9);
      run(E, 6000);
      assert.ok(centreOnScreen(E), `${name}: still in dead space at ${JSON.stringify(E.pos)} (started ${JSON.stringify(s)})`);
    }
  }
});

test('ghost (float) thrown to the edges stays inside the desktop and keeps floating', () => {
  for (const name of ['single', 'dual']) {
    const layout = LAYOUTS[name];
    for (const [dx, dy] of DIRS) {
      const { E } = setup(layout, { move: 'float', gait: 'hop' });
      throwTo(E, E.pos.x + dx * 6000, E.pos.y + dy * 6000);
      const wb = geo.worldBounds(layout);
      // (the ghost's wall-dash deliberately re-enters from just outside an edge for a frame)
      run(E, 12000, (e) => assert.ok(e.pos.x > wb.x0 - 2 * SIZE && e.pos.x < wb.x1 + SIZE && e.pos.y > wb.y0 - SIZE && e.pos.y < wb.y1, `${name} ghost lost at ${JSON.stringify(e.pos)}`));
      assert.ok(geo.visibleFraction(E.pos, SIZE, LAYOUT) >= 0.3 || E._wrapping, `${name} ghost not back on screen ${JSON.stringify(E.pos)} wrapping=${E._wrapping}`);
    }
  }
});

test('setWorld with an empty display list (display sleep / RDP) keeps the last good layout', () => {
  const { E } = setup(LAYOUTS.dual);
  const before = JSON.stringify(E.world);
  E.setWorld([]);
  assert.equal(JSON.stringify(E.world), before);
  run(E, 2000);
  assert.ok(Number.isFinite(E.pos.x) && Number.isFinite(E.pos.y) && centreOnScreen(E));
});

test('grab() clears stale climb/peek/target state so nothing is left half-done after a throw', () => {
  const { E } = setup(LAYOUTS.single);
  E._wantClimb = true; E._peeking = true; E.target = 500; E._climbStopY = 300; E.setState('walk', 1e9);
  E.grab();
  assert.equal(E._wantClimb, false); assert.equal(E._peeking, false); assert.equal(E.target, null); assert.equal(E._climbStopY, null);
  assert.equal(E.state, 'drag');
});

test('rescue() recovers a lost / NaN sprite, clears the drag flag and cancels any script', () => {
  const { E } = setup(LAYOUTS.dual);
  E.dragging = true; E.pos.x = NaN; E.pos.y = 1e9; E.parachute = true;
  E.rescue();
  assert.equal(E.dragging, false); assert.equal(E.parachute, false);
  assert.ok(geo.visibleFraction(E.pos, SIZE, LAYOUT) > 0.999);
  E.pos = { x: -90000, y: -90000 }; E.rescue({ x: 2200, y: 900 });
  assert.deepEqual([E.pos.x, E.pos.y], [2200, 900]);
});

test('forceRelease only acts on a live drag (watchdog safety net)', () => {
  const { E } = setup(LAYOUTS.single);
  assert.equal(E.forceRelease(), false);
  E.grab(); assert.equal(E.dragging, true);
  assert.equal(E.forceRelease(), true);
  assert.equal(E.dragging, false); assert.equal(E.state, 'fall');
});

test('a normal drop still behaves: cat (step gait) thrown up comes back and lands', () => {
  const { E } = setup(LAYOUTS.dual, { gait: 'step' });
  E.pos.x = 1000; E.pos.y = 900;
  E.grab(); E.vel.x = 0; E.vel.y = -1400; E.release();
  run(E, 5000);
  assert.ok(E.onFloor && geo.visibleFraction(E.pos, SIZE, LAYOUT) > 0.999);
});

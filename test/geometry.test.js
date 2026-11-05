'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const geo = require('../src/shared/geometry');
const { LAYOUTS } = require('./helpers');

test('visibleFraction: fully on, half off, fully off, NaN', () => {
  const d = LAYOUTS.single;
  assert.equal(geo.visibleFraction({ x: 100, y: 100 }, 100, d), 1);
  assert.equal(geo.visibleFraction({ x: -50, y: 100 }, 100, d), 0.5);
  assert.equal(geo.visibleFraction({ x: 5000, y: 100 }, 100, d), 0);
  assert.equal(geo.visibleFraction({ x: NaN, y: 0 }, 100, d), 0);
  assert.equal(geo.visibleFraction({ x: 0, y: 0 }, 100, []), 0);
});

test('clampSpriteToDisplays pulls a far-off sprite into the work area of the nearest display', () => {
  for (const [name, layout] of Object.entries(LAYOUTS)) {
    for (const p of [{ x: 99999, y: -99999 }, { x: -99999, y: 99999 }, { x: 4000, y: 4000 }, { x: -3000, y: -3000 }]) {
      const c = geo.clampSpriteToDisplays(p, 100, layout);
      assert.ok(geo.visibleFraction(c, 100, layout) === 1, `${name}: ${JSON.stringify(p)} -> ${JSON.stringify(c)} should be fully visible`);
      const inWork = layout.some(d => c.x >= d.workArea.x && c.x + 100 <= d.workArea.x + d.workArea.width && c.y >= d.workArea.y && c.y + 100 <= d.workArea.y + d.workArea.height);
      assert.ok(inWork, `${name}: inside some work area`);
    }
  }
});

test('clampSpriteToDisplays leaves an on-screen sprite alone and survives NaN', () => {
  const c = geo.clampSpriteToDisplays({ x: 300, y: 300 }, 100, LAYOUTS.dual);
  assert.deepEqual([c.x, c.y, c.moved], [300, 300, false]);
  const n = geo.clampSpriteToDisplays({ x: NaN, y: NaN }, 100, LAYOUTS.dual);
  assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
});

test('displayAt and homePosition', () => {
  assert.equal(geo.displayAt(LAYOUTS.dual, 2000, 10).id, 2);
  assert.equal(geo.displayAt(LAYOUTS.gap, 2000, 10), null);          // dead zone between monitors
  const h = geo.homePosition(100, LAYOUTS.dual, { x: 2500, y: 100 });  // cursor on monitor 2
  assert.ok(h.x >= 1920 && h.x + 100 <= 3840, 'home is on the cursor monitor');
  assert.equal(h.y, 1040 - 100);                                       // standing on the work-area floor
  const f = geo.homePosition(100, LAYOUTS.dual, null);
  assert.ok(f.x < 1920);
});

test('worldBounds', () => {
  assert.deepEqual(geo.worldBounds(LAYOUTS.leftNeg), { x0: -1280, y0: 0, x1: 1920, y1: 1080 });
  assert.equal(geo.worldBounds([]), null);
});

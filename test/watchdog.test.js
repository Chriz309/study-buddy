'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assess } = require('../src/main/watchdog');
const { LAYOUTS } = require('./helpers');

const base = () => ({ hasWindow: true, userHidden: false, shown: true, winBounds: { x: 10, y: 10, width: 240, height: 245 }, wantBounds: { x: 10, y: 10, width: 240, height: 245 },
  dragging: false, dragPingAge: 0, dragAge: 0, scripted: false, wrapping: false, pos: { x: 500, y: 900 }, size: 100, displays: LAYOUTS.dual });

test('healthy sprite: only the topmost re-assertion (never the mouse style: that flickered the cursor)', () => {
  assert.deepEqual(assess(base()), ['reassertTop']);
});
test('a drifted window gets its bounds AND its mouse style re-applied', () => {
  const a = assess({ ...base(), winBounds: { x: 400, y: 10, width: 240, height: 245 } });
  assert.deepEqual(a.filter(x => x === 'fixBounds' || x === 'reassertMouse'), ['fixBounds', 'reassertMouse']);
});
test('missing window is recreated unless the user hid the buddy', () => {
  assert.deepEqual(assess({ ...base(), hasWindow: false }), ['recreateWindow']);
  assert.deepEqual(assess({ ...base(), hasWindow: false, userHidden: true }), []);
});
test('hidden buddy: nothing to heal', () => {
  assert.deepEqual(assess({ ...base(), shown: false }), []);
});
test('off-screen sprite is rescued; scripted leaps and the ghost wall-dash are exempt', () => {
  assert.ok(assess({ ...base(), pos: { x: 90000, y: -90000 } }).includes('rescue'));
  assert.ok(assess({ ...base(), pos: { x: 4000, y: 5000 } }).includes('rescue'));
  assert.ok(!assess({ ...base(), pos: { x: 90000, y: -90000 }, scripted: true }).includes('rescue'));
  assert.ok(!assess({ ...base(), pos: { x: 90000, y: -90000 }, wrapping: true }).includes('rescue'));
  assert.ok(!assess({ ...base(), pos: { x: -60, y: 900 } }).includes('rescue'), 'a peek (60% visible) is fine');
});
test('stuck drag: released only after the renderer heartbeat has been silent', () => {
  assert.ok(!assess({ ...base(), dragging: true, dragPingAge: 500, dragAge: 9000 }).includes('releaseDrag'));
  assert.ok(assess({ ...base(), dragging: true, dragPingAge: 5000, dragAge: 9000 }).includes('releaseDrag'));
  assert.ok(!assess({ ...base(), dragging: true, dragPingAge: 5000, dragAge: 800 }).includes('releaseDrag'), 'just grabbed');
});
test('window drifted from the engine position gets its bounds re-applied', () => {
  assert.ok(assess({ ...base(), winBounds: { x: 400, y: 10, width: 240, height: 245 } }).includes('fixBounds'));
  assert.ok(!assess({ ...base(), winBounds: { x: 12, y: 11, width: 240, height: 245 } }).includes('fixBounds'));
});

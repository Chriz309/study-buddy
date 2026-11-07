'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { trackMotion, isCalm, hitPad, subpixel, MOTION_HOLD_MS } = require('../src/main/pacing');

const rest = (o = {}) => ({ dragging: false, script: null, state: 'idle', vel: { x: 0, y: 0 }, isSpeaking: () => false, ...o });

test('a drifting ghost (vel 0, state idle) is NOT calm: it keeps the full frame rate', () => {
  let m = { x: NaN, y: NaN, until: 0 };
  m = trackMotion(m, { x: 100, y: 100 }, 1000);
  m = trackMotion(m, { x: 100.4, y: 100.1 }, 1016);      // sub-pixel drift still counts as motion
  assert.equal(isCalm(rest(), false, 1032, m.until), false);
});

test('a truly still pet becomes calm once the motion hold has expired, and never while moving', () => {
  let m = { x: NaN, y: NaN, until: 0 };
  m = trackMotion(m, { x: 100, y: 100 }, 1000);
  m = trackMotion(m, { x: 100, y: 100 }, 1016);          // no movement: the hold is not extended
  assert.equal(m.until, 1000 + MOTION_HOLD_MS);
  assert.equal(isCalm(rest(), false, 1000 + MOTION_HOLD_MS - 1, m.until), false);
  assert.equal(isCalm(rest(), false, 1000 + MOTION_HOLD_MS, m.until), true);
  assert.equal(isCalm(rest({ state: 'walk' }), false, 5000, 0), false);
  assert.equal(isCalm(rest({ vel: { x: 3, y: 0 } }), false, 5000, 0), false);
  assert.equal(isCalm(rest({ dragging: true }), false, 5000, 0), false);
  assert.equal(isCalm(rest(), true, 5000, 0), false, 'carried along by the cursor');
  assert.equal(isCalm(rest({ script: {} }), false, 5000, 0), false);
  assert.equal(isCalm(rest({ isSpeaking: () => true }), false, 5000, 0), false);
});

test('hit pad: tight round the sprite, wider (hysteresis) while captured', () => {
  assert.equal(hitPad(140, false), 140 * 0.28);
  assert.equal(hitPad(40, false), 14);
  assert.equal(hitPad(140, true), hitPad(140, false) + 10);
  assert.ok(hitPad(140, false) < 70, 'smaller than the old half-size halo');
});

test('subpixel remainder is the part the whole-pixel window move dropped', () => {
  assert.ok(Math.abs(subpixel(100.4, 100) - 0.4) < 1e-9);
  assert.ok(Math.abs(subpixel(99.6, 100) + 0.4) < 1e-9);
  assert.equal(subpixel(NaN, 100), 0);
  assert.equal(subpixel(500, 100), 1);
});

test('main.js: setIgnoreMouseEvents is never forwarded and never driven by a tick counter', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8').replace(/\/\/.*$/gm, '');   // code only, comments stripped
  assert.ok(!/forward\s*:\s*true/.test(src), 'no forwarding hook');
  assert.ok(!/_iTick/.test(src), 'no periodic re-assert counter');
  const fn = src.slice(src.indexOf('function setPetInteractive'), src.indexOf('function keepOnTop'));
  assert.ok(/_interactive !== want/.test(fn), 'only applied when the wanted state changed');
  assert.ok(!/_tick|setInterval|Date\.now/.test(fn), 'no timer in the mouse-capture path');
});

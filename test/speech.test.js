'use strict';
// A speech line on screen = the pet stands still (walk / float drift / climb) and then carries on.
const test = require('node:test');
const assert = require('node:assert/strict');
const geo = require('../src/shared/geometry');
const { LAYOUTS, freshEngine, run } = require('./helpers');

const SIZE = 100;
function setup({ gait = 'hop', move = 'walk' } = {}) {
  const E = freshEngine();
  E.init({ event: () => {}, state: () => {} }, 1000);
  E.setWorld(LAYOUTS.dual); E.setSize(SIZE); E.settings = { speed: 1, personality: 'chill', mischief: 25 };
  E.moveType = move; E.gait = gait;
  E.pos = { ...geo.homePosition(SIZE, LAYOUTS.dual, null) }; E.vel = { x: 0, y: 0 };
  E.onFloor = move !== 'float'; E.setState('idle', 0); E.nextDecision = 1e12;
  return E;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('a walking cat stops while a line shows, then resumes toward the same target', () => {
  const E = setup({ gait: 'step' });
  E.target = E.pos.x - 600; E.setState('walk', 1e9);
  let now = run(E, 500);
  assert.equal(E.state, 'walk');
  E.holdForSpeech(now, 2000);
  now = run(E, 100, null, now);          // let the pause take hold
  const at = { ...E.pos };
  now = run(E, 1500, (e) => assert.equal(e.state, 'idle', 'talking pet is not "walk"'), now);
  assert.equal(dist(E.pos, at), 0, 'did not move while talking');
  now = run(E, 900, null, now);          // line is over
  assert.equal(E.state, 'walk');
  assert.ok(dist(E.pos, at) > 5, 'walks on after the line');
});

test('a floating ghost hovers still while a line shows and drifts again afterwards', () => {
  const E = setup({ move: 'float' });
  E.target = { x: E.pos.x - 700, y: E.pos.y }; E.nextDecision = 1e12;
  let now = run(E, 300);
  E.holdForSpeech(now, 1500);
  const at = { ...E.pos };
  now = run(E, 1400, null, now);
  assert.equal(dist(E.pos, at), 0, 'ghost did not drift while talking');
  now = run(E, 800, null, now);
  assert.ok(dist(E.pos, at) > 3, 'drifts on after the line');
});

test('a slime mid-hop lands normally (gravity is not paused), then stops and talks', () => {
  const E = setup();
  E.target = E.pos.x - 800; E.setState('walk', 1e9);
  let now = run(E, 3000, (e) => { if (!e.onFloor) e._seenAir = true; });
  assert.ok(E._seenAir, 'slime hopped');
  // wait for a moment in the air, then hold
  now = run(E, 5000, null, now);
  E.holdForSpeech(now, 2000);
  now = run(E, 600, null, now);
  assert.equal(E.onFloor, true, 'landed');
  const at = { ...E.pos };
  run(E, 1200, null, now);
  assert.equal(dist(E.pos, at), 0, 'stood still while talking');
});

test('holdForSpeech is bounded and never shortens an existing hold', () => {
  const E = setup();
  E.holdForSpeech(1000, 99999);
  assert.equal(E.speakingUntil, 1000 + 6000);
  E.holdForSpeech(1000, 100);
  assert.equal(E.speakingUntil, 1000 + 6000);
  E.holdForSpeech(1000, NaN);
  assert.equal(E.speakingUntil, 1000 + 6000);
  assert.equal(E.isSpeaking(7001), false);
  assert.equal(E.isSpeaking(6999), true);
});

test('a throw is not held: a released pet still falls while a line shows', () => {
  const E = setup({ gait: 'step' });
  E.pos.y -= 300; E.onFloor = false; E.setState('fall', 1e9);
  const y0 = E.pos.y;
  E.holdForSpeech(1000, 3000);
  run(E, 300);
  assert.ok(E.pos.y > y0 + 20, 'gravity still applies');
});

test('no new antic starts while a line is showing', () => {
  const E = setup({ gait: 'step' });
  assert.equal(E.canStartScript(), true);
  E.holdForSpeech(1000, 3000); E._now = 1500;
  assert.equal(E.canStartScript(), false);
  E._now = 5000;
  assert.equal(E.canStartScript(), true);
});

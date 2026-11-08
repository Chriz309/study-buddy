'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInputHealth, STALL_MS, RECREATE_AFTER, RECREATE_GAP_MS, RECREATE_MAX } = require('../src/main/inputhealth');

const over = { interactive: true, overPet: true, moved: true, blocked: false };
// move the cursor over the pet every 50ms for ms; returns the actions emitted
function hover(h, t0, ms, s = over, seenEvery = 0) {
  const out = [];
  for (let t = t0; t <= t0 + ms; t += 50) {
    if (seenEvery && (t - t0) % seenEvery === 0) h.seen();
    const a = h.sample(t, s); if (a) out.push(a);
  }
  return out;
}

test('working input: the renderer keeps seeing the mouse, nothing happens', () => {
  const h = createInputHealth();
  assert.deepEqual(hover(h, 0, 10000, over, 150), []);
});
test('stuck input: cursor moves over an interactive pet with no mouse events -> re-apply', () => {
  const h = createInputHealth();
  const a = hover(h, 0, STALL_MS + 100);
  assert.deepEqual(a, ['reapply']);
});
test('a resting cursor proves nothing', () => {
  const h = createInputHealth();
  assert.deepEqual(hover(h, 0, 10000, { ...over, moved: false }), []);
});
test('not interactive, not over the pet, or over another of our windows: no action', () => {
  const h = createInputHealth();
  assert.deepEqual(hover(h, 0, 5000, { ...over, interactive: false }), []);
  assert.deepEqual(hover(h, 0, 5000, { ...over, interactive: null }), []);
  assert.deepEqual(hover(h, 0, 5000, { ...over, overPet: false }), []);
  assert.deepEqual(hover(h, 0, 5000, { ...over, blocked: true }), []);
});
test('re-apply that does not help escalates to a window rebuild', () => {
  const h = createInputHealth();
  const a = hover(h, 0, (STALL_MS + 100) * (RECREATE_AFTER + 1));
  assert.deepEqual(a, [...Array(RECREATE_AFTER).fill('reapply'), 'recreate']);
});
test('a seen event clears the strikes', () => {
  const h = createInputHealth();
  hover(h, 0, (STALL_MS + 100) * RECREATE_AFTER);
  h.seen();
  assert.deepEqual(hover(h, 100000, STALL_MS + 100), ['reapply']);
});
test('rebuilds are rate limited (a foreign overlay over the pet must not loop)', () => {
  const h = createInputHealth();
  const a = hover(h, 0, 30 * 60000);
  const rebuildTimes = [];
  { const h2 = createInputHealth(); for (let t = 0; t <= 30 * 60000; t += 50) if (h2.sample(t, over) === 'recreate') rebuildTimes.push(t); }
  assert.ok(a.filter(x => x === 'recreate').length <= Math.ceil(30 / 10) * RECREATE_MAX);
  for (let i = 1; i < rebuildTimes.length; i++) assert.ok(rebuildTimes[i] - rebuildTimes[i - 1] >= RECREATE_GAP_MS);
  const inFirstTen = rebuildTimes.filter(t => t < 600000).length;
  assert.ok(inFirstTen <= RECREATE_MAX);
  assert.ok(a.includes('reapply'));
});

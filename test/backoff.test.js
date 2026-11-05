'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGovernor } = require('../src/shared/backoff');

test('delays double up to the ceiling, then the governor gives up for good', () => {
  const g = createGovernor({ base: 1000, max: 5000, cap: 5 });
  const ds = []; let r;
  for (let i = 0; i < 5; i++) { r = g.next(i); assert.equal(r.give, false); ds.push(r.delay); }
  assert.deepEqual(ds, [1000, 2000, 4000, 5000, 5000]);
  assert.equal(g.next(10).give, true); assert.equal(g.gaveUp, true);
  assert.equal(g.next(1e9).give, true, 'stays given-up');
});
test('a long stable period resets the count; reset() re-arms after giving up', () => {
  const g = createGovernor({ base: 100, max: 1000, cap: 2, resetAfter: 1000 });
  assert.equal(g.next(0).delay, 100); assert.equal(g.next(10).delay, 200);
  assert.equal(g.next(5000).delay, 100, 'stable for 5 s: starts over');
  g.next(5010); assert.equal(g.next(5020).give, true);
  g.reset(); assert.equal(g.next(6000).give, false);
});
test('hundreds of failures in a row produce only `cap` reloads', () => {
  const g = createGovernor({ cap: 5 }); let n = 0;
  for (let i = 0; i < 500; i++) if (!g.next(i * 10).give) n++;
  assert.equal(n, 5);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { LINES, SHARED, MAX_LEN, getPool, createPicker } = require('../src/renderer/lines');

const CHARS = ['blob', 'ghost', 'cat', 'hero'];
const MIN = { idle: 40, study: 25, pet: 12, sleep: 8, fed: 8, greet: 6 };
const NAMES = { blob: ['blob'], ghost: ['boo'], cat: ['pib'], hero: ['captain cram', 'cram'] };

// small deterministic RNG (mulberry32)
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

test('every character has enough lines of every kind', () => {
  for (const c of CHARS) for (const [k, n] of Object.entries(MIN)) {
    assert.ok(LINES[c][k].length >= n, `${c}.${k} has ${LINES[c][k].length}, needs ${n}`);
  }
});

test('all lines fit the bubble and are non-empty strings', () => {
  const all = [];
  for (const c of CHARS) for (const arr of Object.values(LINES[c])) all.push(...arr);
  all.push(...SHARED.idle, ...SHARED.night);
  for (const l of all) { assert.equal(typeof l, 'string'); assert.ok(l.trim().length > 0); assert.ok(l.length <= MAX_LEN, `too long (${l.length}): ${l}`); }
});

test('no duplicates inside any pool, including shared additions', () => {
  for (const c of CHARS) for (const k of Object.keys(MIN)) for (const h of [12, 2]) {
    const { pool } = getPool(c, k, h);
    assert.equal(new Set(pool).size, pool.length, `${c}.${k} (hour ${h}) has duplicates`);
  }
});

test('no character says another character\'s name in its greet', () => {
  for (const c of CHARS) for (const line of LINES[c].greet) for (const o of CHARS) {
    if (o === c) continue;
    for (const n of NAMES[o]) assert.ok(!line.toLowerCase().includes(n), `${c} greet mentions ${o}: ${line}`);
  }
});

test('shuffle bag: no repeats until the pool is used, and none across reshuffles', () => {
  for (const c of CHARS) for (const k of ['idle', 'pet', 'greet']) {
    const picker = createPicker(rng(7));
    const size = getPool(c, k, 12).pool.length;
    let prevLast = null;
    for (let round = 0; round < 6; round++) {
      const seen = [];
      for (let i = 0; i < size; i++) seen.push(picker.pick(c, k, 12));
      assert.equal(new Set(seen).size, size, `${c}.${k} round ${round} repeated a line`);
      if (prevLast !== null) assert.notEqual(seen[0], prevLast, `${c}.${k} repeated across reshuffle`);
      prevLast = seen[size - 1];
    }
  }
});

test('reshuffle boundary is safe even with a worst-case rng', () => {
  for (const r of [() => 0, () => 0.999999]) {
    const picker = createPicker(r);
    const size = getPool('cat', 'sleep', 12).pool.length;
    let prev = null;
    for (let i = 0; i < size * 5; i++) { const l = picker.pick('cat', 'sleep', 12); assert.notEqual(l, prev); prev = l; }
  }
});

test('characters keep separate bags and unknown kinds fall back to idle', () => {
  const picker = createPicker(rng(3));
  const idle = new Set(getPool('ghost', 'idle', 12).pool);
  assert.ok(idle.has(picker.pick('ghost', 'nonsense', 12)));
  assert.ok(getPool('hero', 'nonsense', 12).kind === 'idle');
  assert.ok(new Set(LINES.blob.pet).has(picker.pick('blob', 'pet', 12)));
  assert.ok(new Set(LINES.cat.pet).has(picker.pick('cat', 'pet', 12)));
});

test('unknown character falls back to blob; night adds the late-night lines', () => {
  assert.deepEqual(getPool('nope', 'pet', 12).pool, LINES.blob.pet);
  const day = getPool('blob', 'idle', 14).pool.length, night = getPool('blob', 'idle', 1).pool.length;
  assert.equal(night - day, SHARED.night.length);
  assert.equal(getPool('blob', 'pet', 1).pool.length, LINES.blob.pet.length, 'night only affects idle');
});

test('pick is deterministic for a seeded rng', () => {
  const a = createPicker(rng(42)), b = createPicker(rng(42));
  for (let i = 0; i < 60; i++) assert.equal(a.pick('hero', 'study', 12), b.pick('hero', 'study', 12));
});

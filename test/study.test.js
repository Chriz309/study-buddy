'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/main/study');

const MIN = 60000;
function rig() {
  let t = new Date(2026, 5, 10, 9, 0, 0).getTime(); const ev = [];
  const st = S.createStudy({ now: () => t, emit: (e) => ev.push(e) });
  // adv = awake time: the clock moves in steps of at most 10 s with a tick each (main.js ticks every second). jump = the PC slept: one big gap, then a tick.
  const adv = (ms) => { let hit = false; do { const d = Math.min(ms, 10000); t += d; ms -= d; if (st.tick()) hit = true; } while (ms > 0); return hit; };
  return { st, ev, adv, jump: (ms) => { t += ms; return st.tick(); }, types: (ty) => ev.filter(e => e.type === ty) };
}

test('25/5 cycles focus -> break -> focus and pays 60 sparks per minute', () => {
  const r = rig(); assert.ok(r.st.start('25/5'));
  assert.equal(r.st.status().phase, 'focus'); assert.equal(r.st.status().remainingMs, 25 * MIN);
  r.adv(25 * MIN - 1); assert.equal(r.st.status().phase, 'focus');
  r.adv(1); assert.equal(r.st.status().phase, 'break'); assert.equal(r.st.status().remainingMs, 5 * MIN);
  const fc = r.types('focusComplete'); assert.equal(fc.length, 1); assert.equal(fc[0].bonus, 1500); assert.equal(fc[0].minutes, 25);
  r.adv(5 * MIN); assert.equal(r.st.status().phase, 'focus'); assert.equal(r.types('breakComplete').length, 1);
});

test('50/10 preset pays 3000 and never takes a long break', () => {
  const r = rig(); r.st.start('50/10');
  for (let i = 0; i < 5; i++) { r.adv(50 * MIN); assert.equal(r.st.status().remainingMs, 10 * MIN); assert.equal(r.st.status().long, false); r.adv(10 * MIN); }
  assert.equal(r.types('focusComplete')[0].bonus, 3000);
});

test('long break (15) after every 4th focus block of 25/5', () => {
  const r = rig(); r.st.start('25/5'); const breaks = [];
  for (let i = 0; i < 5; i++) { r.adv(25 * MIN); breaks.push(r.st.status().remainingMs / MIN); r.adv(breaks[i] * MIN); }
  assert.deepEqual(breaks, [5, 5, 5, 15, 5]);
});

test('pause and resume keep the remaining time; paused time does not count', () => {
  const r = rig(); r.st.start('25/5'); r.adv(10 * MIN);
  assert.ok(r.st.pause()); assert.equal(r.st.status().remainingMs, 15 * MIN);
  r.adv(3 * 60 * MIN); assert.equal(r.st.status().phase, 'focus'); assert.equal(r.st.status().remainingMs, 15 * MIN);
  assert.ok(r.st.resume()); r.adv(14 * MIN); assert.equal(r.st.status().phase, 'focus'); r.adv(MIN); assert.equal(r.st.status().phase, 'break');
});

test('time asleep does not count: no bonus for a slept-through block, the countdown carries on after the wake', () => {
  const r = rig(); r.st.start('25/5'); r.adv(10 * MIN);
  assert.equal(r.jump(5 * 60 * MIN), false);   // laptop slept five hours
  assert.equal(r.types('focusComplete').length, 0); assert.equal(r.types('slept').length, 1);
  assert.equal(r.st.status().phase, 'focus'); assert.equal(r.st.status().remainingMs, 15 * MIN);
  r.adv(15 * MIN - 1000); assert.equal(r.st.status().phase, 'focus');
  r.adv(1000); assert.equal(r.types('focusComplete').length, 1); assert.equal(r.st.status().phase, 'break');
  r.jump(60 * MIN); assert.equal(r.st.status().phase, 'break'); assert.equal(r.st.status().remainingMs, 5 * MIN);   // a break freezes the same way
});

test('a clock set backwards never lengthens a block or pays early; a short hiccup is not a sleep', () => {
  const r = rig(); r.st.start('25/5'); r.adv(5 * MIN);
  r.jump(-2 * 60 * MIN); assert.equal(r.st.status().remainingMs, 25 * MIN); assert.equal(r.types('focusComplete').length, 0);
  const q = rig(); q.st.start('25/5'); q.jump(S.SLEEP_GAP_MS); assert.equal(q.types('slept').length, 0); assert.equal(q.st.status().remainingMs, 25 * MIN - S.SLEEP_GAP_MS);
});

test('stop gives nothing; skipping a focus gives nothing; skipping a break starts focus', () => {
  const r = rig(); r.st.start('25/5'); r.adv(20 * MIN); assert.ok(r.st.stop());
  assert.equal(r.st.status().phase, 'idle'); r.adv(60 * MIN); assert.equal(r.types('focusComplete').length, 0);
  r.st.start('25/5'); r.st.skip(); assert.equal(r.st.status().phase, 'break'); assert.equal(r.types('focusComplete').length, 0);
  r.st.skip(); assert.equal(r.st.status().phase, 'focus');
  assert.equal(rig().st.stop(), false); assert.equal(rig().st.pause(), false);
});

test('dev override: 1 minute focus, 1 minute break, 60 sparks', () => {
  const r = rig(); r.st.start('25/5', { focusMs: MIN, breakMs: MIN }); r.adv(MIN);
  assert.equal(r.types('focusComplete')[0].bonus, 60); assert.equal(r.st.status().remainingMs, MIN);
});

test('bonusFor and fmt', () => {
  assert.equal(S.bonusFor(25), 1500); assert.equal(S.bonusFor(0.5), 30);
  assert.equal(S.fmt(18 * MIN + 42000), '18:42'); assert.equal(S.fmt(0), '0:00'); assert.equal(S.fmt(3 * MIN + 9001), '3:10');
});

test('stats: same day counts up, streak grows on consecutive days and resets after a gap', () => {
  let s = S.EMPTY_STATS;
  s = S.recordSession(s, '2026-06-10'); s = S.recordSession(s, '2026-06-10');
  assert.deepEqual(S.viewStats(s, '2026-06-10'), { total: 2, today: 2, streak: 1 });
  s = S.recordSession(s, '2026-06-11'); assert.deepEqual(S.viewStats(s, '2026-06-11'), { total: 3, today: 1, streak: 2 });
  s = S.recordSession(s, '2026-06-12'); assert.equal(S.viewStats(s, '2026-06-12').streak, 3);
  assert.equal(S.viewStats(s, '2026-06-13').streak, 3); assert.equal(S.viewStats(s, '2026-06-13').today, 0);   // yesterday counted: streak still alive
  assert.equal(S.viewStats(s, '2026-06-14').streak, 0);   // missed a day
  s = S.recordSession(s, '2026-06-14'); assert.equal(S.viewStats(s, '2026-06-14').streak, 1);
  assert.equal(S.recordSession(S.EMPTY_STATS, '2026-03-01').streak, 1);
  assert.equal(S.prevDay('2026-03-01'), '2026-02-28'); assert.equal(S.prevDay('2026-01-01'), '2025-12-31');
});

test('status line text', () => {
  const v = { today: 3, total: 9, streak: 2 };
  assert.equal(S.statusLine({ phase: 'idle' }, v), 'Today: 3 sessions'); assert.equal(S.statusLine({ phase: 'idle' }, { today: 1 }), 'Today: 1 session');
  assert.equal(S.statusLine({ phase: 'focus', remainingMs: 18 * MIN + 42000 }, v), 'Focus 18:42 left');
  assert.equal(S.statusLine({ phase: 'break', remainingMs: 3 * MIN + 10000 }, v), 'Break 3:10 left');
  assert.equal(S.statusLine({ phase: 'break', long: true, remainingMs: MIN }, v), 'Long break 1:00 left');
  assert.equal(S.statusLine({ phase: 'focus', paused: true, remainingMs: MIN }, v), 'Focus 1:00 (paused)');
});

test('focus gate: only a running focus block suppresses antics and mischief', () => {
  const r = rig(); assert.equal(S.focusGate(r.st.status()), null);
  r.st.start('25/5'); assert.equal(S.focusGate(r.st.status()), 'study-focus');
  r.st.pause(); assert.equal(S.focusGate(r.st.status()), null); r.st.resume();
  r.adv(25 * MIN); assert.equal(S.focusGate(r.st.status()), null);   // break: normal life
  r.st.stop(); assert.equal(S.focusGate(r.st.status()), null); assert.equal(S.focusGate(null), null);
});

test('study speech lines: every character, short, no em or en dashes', () => {
  const { STUDY, STUDY_KINDS, MAX_LEN, getPool, createPicker } = require('../src/renderer/lines');
  for (const c of ['blob', 'ghost', 'cat', 'hero', 'wizard']) for (const k of STUDY_KINDS) {
    const pool = STUDY[c][k]; assert.ok(pool.length >= 2, c + '.' + k);
    for (const l of pool) { assert.ok(l.length > 0 && l.length <= MAX_LEN, l); assert.ok(!/[\u2013\u2014]/.test(l), l); }
    assert.equal(getPool(c, k, 12).pool, pool);
  }
  assert.equal(createPicker(() => 0.5).pick('wizard', 'studyDone', 12).length > 0, true);
  assert.ok(STUDY.blob.studyDone.includes('Break time! You earned it.'));
});

test('main.js wires the focus gate into antics, mischief, chatter and the engine', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.ok(src.includes("study.focusGate(studyStatus())"));
  assert.ok(src.includes("enabled: mischiefEnabled() && !studyFocusing()"));
  assert.ok(src.includes("type === 'say' && studyFocusing()"));
  assert.ok(src.includes("stayPut: !!s.stayPut || focus, focus"));
});

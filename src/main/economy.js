'use strict';
// Idle-points maths (pure, no Electron): the earn rate, one tick of earning, and "that gap was a sleep".
// main.js calls these once a second. Kept apart so the clock-safety rules are unit-tested (test/economy.test.js).
const MAX_TICK_MS = 5000;     // a tick never pays for more than this, however long the timer was frozen
const WAKE_GAP_MS = 30000;    // a one-second timer that fires this late means the PC was asleep (or the process was frozen)

// 1 Spark/s, +0.4 per extra owned buddy, +0.1 per feed level of every owned buddy
function sparkRate(owned, levels) {
  const ids = Array.isArray(owned) ? owned : [], lv = levels && typeof levels === 'object' ? levels : {};
  let lvl = 0; for (const id of ids) { const n = Number(lv[id]); if (Number.isFinite(n) && n > 0) lvl += n; }
  return +(1 + 0.4 * Math.max(0, ids.length - 1) + 0.1 * lvl).toFixed(2);
}
// gapMs = wall-clock time since the last tick. Negative (clock set back) pays nothing; a huge gap (sleep, clock set forward) pays MAX_TICK_MS.
function earn(sparks, rate, gapMs) {
  const have = Number.isFinite(Number(sparks)) ? Number(sparks) : 0;   // a damaged balance (null / NaN) restarts from 0 instead of spreading NaN
  const dt = Math.max(0, Math.min(MAX_TICK_MS, Number(gapMs) || 0)) / 1000;
  return +(have + (Number(rate) || 0) * dt).toFixed(3);
}
const looksLikeWake = (gapMs) => Number(gapMs) > WAKE_GAP_MS;

module.exports = { sparkRate, earn, looksLikeWake, MAX_TICK_MS, WAKE_GAP_MS };

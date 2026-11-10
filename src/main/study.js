'use strict';
// Study timer (pomodoro): a pure state machine on the wall clock, no Electron, no timers of its own.
// main.js calls tick() every second while a block runs; everything is derived from now(), so nothing drifts.
// Time the PC spent ASLEEP does not count: if tick() finds a gap of more than SLEEP_GAP_MS since the last one, the
// block's end moves out by that gap (the countdown simply froze). A block used to complete on wake and pay its
// full bonus, so closing the lid for 25 minutes was a free session. A clock set backwards never lengthens a block.
const PRESETS = { '25/5': { focus: 25, brk: 5, long: 15, every: 4 }, '50/10': { focus: 50, brk: 10, long: 0, every: 0 } };
const SPARKS_PER_MIN = 60;
const MIN = 60000;
const SLEEP_GAP_MS = 20000;   // ticks are 1 s apart: a gap this long means the PC slept (or the process was frozen)

const bonusFor = (minutes) => Math.round(SPARKS_PER_MIN * minutes);
const pad = (n) => String(n).padStart(2, '0');
function fmt(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + pad(s % 60); }
const dayKey = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const prevDay = (key) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d - 1, 12).getTime()); };

// ---- stats: { total, streak, lastDay, today, todayDay } (persisted in the save as `study`) ----
const EMPTY_STATS = { total: 0, streak: 0, lastDay: '', today: 0, todayDay: '' };
function recordSession(stats, day, bonus) {
  const s = { ...EMPTY_STATS, ...stats };
  const today = s.todayDay === day ? s.today + 1 : 1;
  const streak = s.lastDay === day ? Math.max(1, s.streak) : s.lastDay === prevDay(day) ? s.streak + 1 : 1;
  return { total: s.total + 1, streak, lastDay: day, today, todayDay: day, sparks: (Number(s.sparks) || 0) + (Number(bonus) || 0) };
}
// what to show on a given day: a stale "today" is 0, a streak that missed yesterday is 0
function viewStats(stats, day) {
  const s = { ...EMPTY_STATS, ...stats };
  return { total: s.total, today: s.todayDay === day ? s.today : 0, streak: (s.lastDay === day || s.lastDay === prevDay(day)) ? s.streak : 0 };
}

// the gate used by antics, desktop mischief, chatter and the calm pose: only a RUNNING focus block is quiet
const isFocusing = (st) => !!st && st.phase === 'focus' && !st.paused;
const focusGate = (st) => (isFocusing(st) ? 'study-focus' : null);

function statusLine(st, view) {
  if (st.phase === 'idle') return 'Today: ' + view.today + (view.today === 1 ? ' session' : ' sessions');
  return (st.phase === 'focus' ? 'Focus' : st.long ? 'Long break' : 'Break') + ' ' + fmt(st.remainingMs) + (st.paused ? ' (paused)' : ' left');
}

// opts: { now, emit }. Dev overrides: start(key, { focusMs, breakMs }) replaces the block lengths (no long break).
function createStudy({ now = Date.now, emit = () => {} } = {}) {
  let phase = 'idle', paused = false, preset = null, cfg = null, endAt = 0, left = 0, total = 0, done = 0, isLong = false, seenAt = 0;
  const fire = (e) => { try { emit(e); } catch {} };
  function begin(p, ms, long) { phase = p; isLong = !!long; total = ms; endAt = now() + ms; seenAt = now(); left = ms; paused = false; fire({ type: 'phase', phase: p, long: isLong }); }
  const startFocus = () => begin('focus', cfg.focusMs, false);
  function startBreak() { const long = !!(cfg.longMs && cfg.every && done > 0 && done % cfg.every === 0); begin('break', long ? cfg.longMs : cfg.breakMs, long); }
  function finish() {   // the current block ran out
    if (phase === 'focus') {
      done++; const minutes = cfg.focusMs / MIN;
      fire({ type: 'focusComplete', minutes, bonus: bonusFor(minutes), cycle: done });
      startBreak();
    } else if (phase === 'break') { fire({ type: 'breakComplete' }); startFocus(); }
  }
  function remaining() { return phase === 'idle' ? 0 : paused ? left : Math.min(total, Math.max(0, endAt - now())); }
  return {
    start(key, over) {
      const p = PRESETS[key]; if (!p) return false;
      preset = key; done = 0;
      cfg = { focusMs: (over && over.focusMs) || p.focus * MIN, breakMs: (over && over.breakMs) || p.brk * MIN, longMs: over ? 0 : p.long * MIN, every: over ? 0 : p.every };
      startFocus(); return true;
    },
    pause() { if (phase === 'idle' || paused) return false; left = remaining(); paused = true; fire({ type: 'paused' }); return true; },
    resume() { if (phase === 'idle' || !paused) return false; endAt = now() + left; seenAt = now(); paused = false; fire({ type: 'resumed' }); return true; },
    stop() { if (phase === 'idle') return false; phase = 'idle'; paused = false; fire({ type: 'stopped' }); fire({ type: 'phase', phase: 'idle' }); return true; },
    skip() {   // skipping a focus block pays nothing; skipping a break starts the next focus
      if (phase === 'idle') return false;
      if (phase === 'focus') { done++; startBreak(); } else startFocus();
      return true;
    },
    tick() {
      if (phase === 'idle' || paused) return false;
      const t = now(), gap = t - seenAt; seenAt = t;
      if (gap > SLEEP_GAP_MS) { endAt += gap; fire({ type: 'slept', ms: gap }); }   // asleep: the countdown froze
      if (t >= endAt) { finish(); return true; }
      return false;
    },
    status() { return { phase, paused, remainingMs: remaining(), totalMs: total, long: isLong, preset, cycle: done }; },
  };
}

module.exports = { SLEEP_GAP_MS, PRESETS, SPARKS_PER_MIN, bonusFor, fmt, dayKey, prevDay, recordSession, viewStats, isFocusing, focusGate, statusLine, createStudy, EMPTY_STATS };

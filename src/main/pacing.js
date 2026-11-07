// Pure helpers for the pet loop's frame pacing and mouse capture (no Electron), so they can be unit-tested.
'use strict';

const MOTION_EPS = 0.05;      // DIP the sprite must have moved between two executed ticks to count as "moving"
const MOTION_HOLD_MS = 300;   // keep the full frame rate this long after the last visible motion

// Remember where the sprite was; returns the time until which the loop must stay at full rate.
function trackMotion(prev, pos, now) {
  const moved = !Number.isFinite(prev.x) || Math.abs(pos.x - prev.x) + Math.abs(pos.y - prev.y) > MOTION_EPS;
  return { x: pos.x, y: pos.y, until: moved ? now + MOTION_HOLD_MS : prev.until };
}

// Only a truly resting pet may run at a third of the rate. A floating ghost has no velocity (its position is eased
// directly), so "calm" is judged from real motion, not from vel.
function isCalm(e, grabbed, now, motionUntil) {
  if (e.dragging || grabbed || e.script) return false;
  if (e.state !== 'sleep' && e.state !== 'sit' && e.state !== 'idle') return false;
  if (Math.abs(e.vel.x) >= 1 || Math.abs(e.vel.y) >= 1) return false;
  if (e.isSpeaking && e.isSpeaking(now)) return false;
  return now >= motionUntil;
}

// Margin (DIP) round the sprite where the window captures the mouse. Wider while already captured, so the
// edge does not flip-flop (every flip is a native call).
function hitPad(size, captured) {
  const base = Math.max(14, size * 0.28);
  return captured ? base + 10 : base;
}

// The window moves in whole pixels; this is the sub-pixel remainder the renderer should add to the sprite position.
function subpixel(want, rounded) {
  const r = want - rounded;
  return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : 0;
}

module.exports = { trackMotion, isCalm, hitPad, subpixel, MOTION_EPS, MOTION_HOLD_MS };

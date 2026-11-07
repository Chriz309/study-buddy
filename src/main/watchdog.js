// Pure decision logic for the pet watchdog (no Electron) so it can be unit-tested.
// main.js gathers the facts, calls assess(), and performs the returned actions.
'use strict';
const geo = require('../shared/geometry');

const DRAG_PING_TIMEOUT = 3000;   // renderer pings every ~400ms while it believes a drag is live
const BOUNDS_SLOP = 3;            // px the real window may differ from where it should be
const MIN_VISIBLE = 0.3;          // fraction of the sprite that must be on a monitor

// facts: { hasWindow, userHidden, shown, winBounds, wantBounds, dragging, dragPingAge, dragAge,
//          scripted, wrapping, floating, pos, size, displays }
// returns an array of action names, in the order they should run.
function assess(f) {
  const out = [];
  if (!f.hasWindow) { if (!f.userHidden) out.push('recreateWindow'); return out; }
  if (f.userHidden || !f.shown) return out;   // nothing on screen: nothing to heal
  // stuck drag: the renderer stopped confirming it (lost pointerup / crashed / reloaded)
  if (f.dragging && f.dragPingAge > DRAG_PING_TIMEOUT && f.dragAge > DRAG_PING_TIMEOUT) out.push('releaseDrag');
  // off-screen sprite (scripted leaps and the ghost's wall-dash are allowed to leave briefly)
  if (!f.dragging && !f.scripted && !f.wrapping && geo.visibleFraction(f.pos, f.size, f.displays) < MIN_VISIBLE) out.push('rescue');
  // the real window drifted from where the engine thinks it is (failed setBounds, DPI bounce). A bounce like that is exactly
  // when Windows drops the click-through style, so re-assert the mouse style then (and only then: re-applying it on every
  // watchdog pass re-installed the mouse hook and made the cursor flicker).
  if (f.winBounds && f.wantBounds && (Math.abs(f.winBounds.x - f.wantBounds.x) > BOUNDS_SLOP || Math.abs(f.winBounds.y - f.wantBounds.y) > BOUNDS_SLOP
      || Math.abs(f.winBounds.width - f.wantBounds.width) > BOUNDS_SLOP || Math.abs(f.winBounds.height - f.wantBounds.height) > BOUNDS_SLOP)) out.push('fixBounds', 'reassertMouse');
  // topmost can be lost silently with no visible symptom: cheap and harmless to re-assert (main.js throttles the real calls)
  out.push('reassertTop');
  return out;
}

module.exports = { assess, DRAG_PING_TIMEOUT, BOUNDS_SLOP, MIN_VISIBLE };

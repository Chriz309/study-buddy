// Pure detector for a pet window that is meant to be capturing the mouse but is not getting it (no Electron), so it can be unit-tested.
// Symptom it catches: the sprite is visible, the cursor moves over it, main has switched the window to "interactive", yet the page
// receives no mouse events, so the buddy cannot be clicked or dragged. Windows can drop the window's mouse style silently
// (content-protection toggles, DPI rescales, driver quirks, another app's topmost overlay), and nothing else would notice.
// main.js feeds it one sample per loop tick plus every "mouse seen" ping from the renderer, and performs the returned action.
'use strict';

const STALL_MS = 900;          // cursor moving over the pet this long with no mouse event reaching the page = stuck
const MIN_MOVES = 4;           // and at least this many cursor moves in that time (a resting cursor proves nothing)
const RECREATE_AFTER = 2;      // re-applies that did not help before the window is rebuilt
const RECREATE_GAP_MS = 60000; // at most one rebuild a minute ...
const RECREATE_WINDOW_MS = 600000, RECREATE_MAX = 3;   // ... and three in ten minutes (a foreign overlay must not cause a rebuild loop)

function createInputHealth() {
  let unseenSince = 0, moves = 0, strikes = 0, rebuilds = [];
  return {
    // the renderer saw a mouse event: input works
    seen() { unseenSince = 0; moves = 0; strikes = 0; },
    // s: { interactive, overPet, moved, blocked } -> null | 'reapply' | 'recreate'
    sample(now, s) {
      if (s.interactive !== true || !s.overPet || s.blocked) { unseenSince = 0; moves = 0; return null; }
      if (!s.moved) return null;
      if (!unseenSince) { unseenSince = now; moves = 1; return null; }
      moves++;
      if (now - unseenSince < STALL_MS || moves < MIN_MOVES) return null;
      unseenSince = 0; moves = 0; strikes++;
      if (strikes > RECREATE_AFTER) {
        rebuilds = rebuilds.filter(t => now - t < RECREATE_WINDOW_MS);
        const last = rebuilds.length ? rebuilds[rebuilds.length - 1] : -Infinity;
        if (rebuilds.length < RECREATE_MAX && now - last >= RECREATE_GAP_MS) { rebuilds.push(now); strikes = 0; return 'recreate'; }
      }
      return 'reapply';
    },
    _state: () => ({ unseenSince, moves, strikes, rebuilds: rebuilds.length }),
  };
}

module.exports = { createInputHealth, STALL_MS, MIN_MOVES, RECREATE_AFTER, RECREATE_GAP_MS, RECREATE_MAX };

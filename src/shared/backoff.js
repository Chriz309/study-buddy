// Pure reload governor: exponential back-off with a hard cap, so a broken GPU / renderer can
// never reload-loop forever. Used by main (pet window) and the renderer (WebGL context loss).
// Works as a CommonJS module (tests, main) and as window.Backoff (renderer script tag).
(function (root) {
  'use strict';
  // opts: base (first delay ms), max (delay ceiling ms), cap (attempts before giving up),
  //       resetAfter (ms of stability after which the count starts over)
  function createGovernor(opts) {
    const o = Object.assign({ base: 1000, max: 30000, cap: 5, resetAfter: 120000 }, opts || {});
    let attempts = 0, last = 0, gaveUp = false;
    return {
      // -> { give: false, attempt, delay } or { give: true }
      next(now) {
        if (gaveUp) return { give: true };
        if (attempts && now - last > o.resetAfter) attempts = 0;
        if (attempts >= o.cap) { gaveUp = true; return { give: true }; }
        attempts++; last = now;
        return { give: false, attempt: attempts, delay: Math.min(o.max, o.base * Math.pow(2, attempts - 1)) };
      },
      reset() { attempts = 0; last = 0; gaveUp = false; },
      get gaveUp() { return gaveUp; },
      get attempts() { return attempts; },
    };
  }
  const api = { createGovernor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Backoff = api;
})(typeof window !== 'undefined' ? window : this);

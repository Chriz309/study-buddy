'use strict';
// Pure timing rules for "the PC just came back" (no Electron), used by main.js onWake().
// One wake produces several signals close together (powerMonitor resume, unlock-screen, the idle tick's timer gap): the first one
// schedules a window rebuild after SETTLE_MS (the desktop needs a moment: displays re-attach, the GPU process restarts), and any
// further signal inside MIN_GAP_MS only gets the light in-place refresh.
const SETTLE_MS = 1500;
const MIN_GAP_MS = 20000;

const tooSoon = (now, lastWakeAt) => !!lastWakeAt && now - lastWakeAt >= 0 && now - lastWakeAt < MIN_GAP_MS;

module.exports = { tooSoon, SETTLE_MS, MIN_GAP_MS };

'use strict';
// shared fixtures for the tests
const path = require('path');
const ROOT = path.join(__dirname, '..');
// SB_ENGINE lets you point the same tests at an older engine.js (e.g. the pre-fix one) to see them fail
const ENGINE_PATH = process.env.SB_ENGINE || path.join(ROOT, 'src', 'main', 'engine.js');

const disp = (id, x, y, w, h, taskbar = 40) => ({ id, bounds: { x, y, width: w, height: h }, workArea: { x, y, width: w, height: h - taskbar } });
const LAYOUTS = {
  single: [disp(1, 0, 0, 1920, 1080)],
  dual: [disp(1, 0, 0, 1920, 1080), disp(2, 1920, 0, 1920, 1080)],
  // second monitor smaller and offset downwards: leaves dead space above/below
  offset: [disp(1, 0, 0, 1920, 1080), disp(2, 1920, 400, 1280, 720)],
  // monitor to the left at negative coordinates, shorter than the primary
  leftNeg: [disp(1, 0, 0, 1920, 1080), disp(2, -1280, 200, 1280, 800)],
  // small gap between monitors
  gap: [disp(1, 0, 0, 1920, 1080), disp(2, 2100, 0, 1920, 1080)],
};

function freshEngine() {
  delete require.cache[require.resolve(ENGINE_PATH)];
  const E = require(ENGINE_PATH);
  // the module is a singleton: reset what the tests touch
  E.hooks = {}; E.script = null; E.dragging = false; E.parachute = false; E._chuteRolled = false; E._wrapping = false; E.target = null;
  E._wantClimb = E._peeking = false; E._climbStopY = null; E.ledge = null; E.recent = []; E.vel = { x: 0, y: 0 }; E.facing = 1;
  return E;
}

// run `ms` of 60fps ticks; calls probe(engine, t) after each tick
function run(E, ms, probe, start = 1000, step = 1000 / 60) {
  let now = start;
  for (let t = 0; t < ms; t += step) { now += step; E.tick(now); if (probe) probe(E, t); }
  return now;
}

// seeded RNG so a failing run is reproducible
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

module.exports = { ROOT, ENGINE_PATH, LAYOUTS, disp, freshEngine, run, rng };

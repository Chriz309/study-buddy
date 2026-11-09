'use strict';
// Merlo the wizard: sprite-only spell antics, their cleanup, the state -> pose map and the art contract.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const geo = require('../src/shared/geometry');
const scripts = require('../src/main/scripts');
const { ROOT, LAYOUTS, freshEngine, run, rng } = require('./helpers');

const SIZE = 100, NAMES = ['levitate', 'potion', 'blink', 'study', 'starshow'];
const CAPS = { levitate: 12000, potion: 12000, blink: 8000, study: 10000, starshow: 8000 };
function setup(layout = LAYOUTS.dual, pos) {
  const E = freshEngine(), log = { events: [], states: new Set() };
  E.init({ event: (t, d) => log.events.push([t, d]), toy: () => {}, state: (s) => log.states.add(s) }, 1000);
  E.setWorld(layout); E.setSize(SIZE); E.settings = { speed: 1, personality: 'chill', mischief: 25 };
  E.moveType = 'walk'; E.gait = 'step'; E.pos = pos ? { ...pos } : geo.homePosition(SIZE, layout, null);
  E.vel = { x: 0, y: 0 }; E.onFloor = true; E.setState('idle', 0); E.nextDecision = 1e12; E.tick(1100);
  return { E, log };
}
const evs = (log) => log.events.map(e => e[0]);
const normal = (m) => !m || ((m.sc == null || m.sc === 1) && !m.hue && (m.alpha == null || m.alpha === 1));

test('wizard antics are registered with the specified weights', () => {
  assert.deepEqual(scripts.ANTIC_NAMES.wizard, NAMES);
  for (const n of NAMES) assert.equal(scripts.makeScript('wizard', n).name, n);
  const R = rng(5), c = {}; for (let i = 0; i < 4000; i++) { const n = scripts.makeScript('wizard', null, R).name; c[n] = (c[n] || 0) + 1; }
  const want = { levitate: 0.25, potion: 0.3, blink: 0.15, study: 0.15, starshow: 0.15 };
  for (const n of NAMES) assert.ok(Math.abs(c[n] / 4000 - want[n]) < 0.04, n + ' ' + c[n]);
});

for (const name of NAMES) {
  test(`wizard ${name}: finishes within its cap from a standing start, stays on its display and floor, fx back to normal`, () => {
    for (const [layout, pos, seed] of [[LAYOUTS.dual, { x: 300, y: 940 }, 1], [LAYOUTS.dual, { x: 2900, y: 940 }, 2], [LAYOUTS.single, { x: 900, y: 940 }, 3], [LAYOUTS.single, { x: 20, y: 940 }, 4]]) {
      const { E, log } = setup(layout, pos); const D = E.currentDisplay(), startX = E.pos.x;
      assert.ok(E.startScript(scripts.makeScript('wizard', name, rng(seed)), 1200)); assert.equal(E.script.name, name);
      let now = 1200, t = 0, minY = Infinity; const fxSeen = [];
      while (E.script && t < CAPS[name] + 2000) {
        now += 1000 / 60; t += 1000 / 60; E.tick(now); minY = Math.min(minY, E.pos.y); fxSeen.push(E.mischief ? { ...E.mischief } : null);
        assert.ok(E.pos.x >= D.x0 - 0.01 && E.pos.x + SIZE <= D.x1 + 0.01, name + ' x ' + E.pos.x); assert.ok(Number.isFinite(E.pos.y));
      }
      assert.equal(E.script, null, name + ' finished'); assert.ok(t <= CAPS[name] + 1600, `${name} took ${t} ms`); assert.ok(t >= 4000, `${name} too short: ${t}`);
      assert.ok(normal(E.mischief), name + ' fx reset: ' + JSON.stringify(E.mischief));
      for (const m of fxSeen) if (m) assert.ok(m.sc >= 0.3 && m.sc <= 1 && m.alpha >= 0 && m.alpha <= 1 && Number.isFinite(m.hue));
      E.nextDecision = 1e12; now = run(E, 1500, null, now);
      assert.ok(Math.abs(E.pos.y - E.floorAt(E.pos.x)) < 1 || E.state === 'idle', 'back on the floor'); assert.ok(geo.visibleFraction(E.pos, SIZE, layout) > 0.999);
      assert.ok(minY >= D.y0 - 0.01, 'never leaves the top of the display');
      const ev = evs(log);
      if (name === 'levitate') { assert.ok(minY < E.floorAt(E.pos.x) - SIZE * 1.2, 'rises about 1.5 sprite heights: ' + minY); assert.ok(log.states.has('fly') && log.states.has('cast') && ev.includes('sparkle')); }
      if (name === 'blink') { assert.ok(log.states.has('cast') && ev.filter(x => x === 'sparkle').length >= 2); assert.ok(fxSeen.some(m => m && m.alpha === 0), 'vanishes'); assert.ok(E.pos.x !== startX, 'reappears elsewhere'); }
      if (name === 'study') { assert.ok(log.states.has('read')); assert.ok(log.events.some(e => e[0] === 'popup' && e[1].text === '+1 WIS')); }
      if (name === 'starshow') { assert.ok(log.states.has('cast2') && log.states.has('happy')); assert.ok(ev.filter(x => x === 'burst').length >= 3); assert.ok(log.events.some(e => e[0] === 'popup' && /Ta-da/.test(e[1].text))); }
      if (name === 'potion') assert.ok(log.states.has('drink'));
    }
  });
}

test('potion: every effect happens, each ends normal; the frog hops twice, shrink and fade stay in range', () => {
  const seen = {};
  for (let seed = 1; seed < 80 && Object.keys(seen).length < 4; seed++) {
    const { E, log } = setup(LAYOUTS.single, { x: 900, y: 940 }), sc = scripts.makeScript('wizard', 'potion', rng(seed * 1000003));
    if (seen[sc.effect]) continue; seen[sc.effect] = 1;
    assert.ok(E.startScript(sc, 1200)); let now = 1200; const lo = { sc: 1, alpha: 1 }, hues = new Set();
    while (E.script && now < 20000) { now += 1000 / 60; E.tick(now); if (E.mischief) { lo.sc = Math.min(lo.sc, E.mischief.sc); lo.alpha = Math.min(lo.alpha, E.mischief.alpha); hues.add(Math.round(E.mischief.hue / 30)); } }
    assert.equal(E.script, null); assert.ok(normal(E.mischief), sc.effect);
    if (sc.effect === 'shrink') assert.ok(lo.sc <= 0.36 && lo.sc >= 0.3, 'shrinks tiny: ' + lo.sc);
    if (sc.effect === 'invisible') assert.ok(lo.alpha <= 0.16 && lo.alpha > 0, 'fades to ~0.15: ' + lo.alpha);
    if (sc.effect === 'rainbow') assert.ok(hues.size >= 8, 'cycles hue');
    if (sc.effect === 'frog') { assert.ok(log.states.has('frog')); assert.equal(evs(log).filter(x => x === 'hop').length, 2); }
  }
  assert.deepEqual(Object.keys(seen).sort(), ['frog', 'invisible', 'rainbow', 'shrink']);
});

test('wizard antics cancelled by a drag, a character swap or a rescue reset sc/hue/alpha at once', () => {
  for (const name of NAMES) for (const how of ['grab', 'char', 'rescue']) for (const seed of [1, 2, 3, 4]) {
    const { E } = setup(LAYOUTS.dual, { x: 500, y: 940 }); assert.ok(E.startScript(scripts.makeScript('wizard', name, rng(seed)), 1200));
    const now = run(E, 1500 + seed * 700, null, 1200);
    if (how === 'grab') E.grab(); else if (how === 'char') E.setMoveType('float'); else E.rescue();
    assert.equal(E.script, null, name + how); assert.ok(normal(E.mischief), `${name} ${how} ${seed} ${JSON.stringify(E.mischief)}`);
    if (how === 'grab') { E.dragTo(700, 400); E.release(); }
    run(E, 6000, null, now); assert.ok(geo.visibleFraction(E.pos, SIZE, LAYOUTS.dual) > 0.999, name);
  }
});

test('another script finishing never wipes a fx object it does not own', () => {
  const { E } = setup(); E.mischief = { clipY: 5, rot: 3, sc: 0.5 };
  E.startScript({ name: 'x', maxMs: 1000, init() {}, update() { return true; } }, 1200); run(E, 100, null, 1200);
  assert.deepEqual(E.mischief, { clipY: 5, rot: 3, sc: 0.5 });
});

// ---- renderer contract: every sprite state maps to a WIZARD_ART key ----
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'app.js'), 'utf8');
const mm = /const WIZ_POSE=(\{[^}]*\});/.exec(appSrc);
const WIZ_POSE = mm && new Function('return ' + mm[1])();
const KEYS = ['idle', 'idle2', 'blink', 'walk1', 'walk2', 'fly', 'cast', 'cast2', 'point', 'stir', 'drink', 'read', 'happy', 'surprised', 'sleep', 'frog', 'pull', 'hang'];
const STATES = ['idle', 'walk', 'run', 'fall', 'fly', 'flex', 'cast', 'cast2', 'point', 'stir', 'drink', 'read', 'frog', 'surprised', 'sleep', 'pull', 'hang', 'pushing'];

test('app.js maps every wizard sprite state to a pose key from the art contract', () => {
  assert.ok(WIZ_POSE, 'WIZ_POSE table found in app.js');
  for (const st of STATES.filter(s => s !== 'idle')) assert.ok(WIZ_POSE[st], 'state has a pose: ' + st);
  assert.equal(WIZ_POSE.flex, 'happy'); assert.equal(WIZ_POSE.pushing, 'pull');
  for (const [st, k] of Object.entries(WIZ_POSE)) assert.ok(KEYS.includes(k), `${st} -> ${k} is not a contract key`);
  assert.ok(appSrc.includes("return WIZ_POSE[st]||'idle'"));
  assert.ok(appSrc.includes('wizard:{poses:(window.WIZARD_ART||{})'));
  assert.ok(/art-wizard\.js/.test(fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8')));
});

test('every state the wizard antics use maps to a pose', () => {
  const used = new Set();
  for (const n of NAMES) for (let seed = 1; seed < 8; seed++) { const { E, log } = setup(); E.startScript(scripts.makeScript('wizard', n, rng(seed)), 1200); run(E, 14000, null, 1200); log.states.forEach(s => used.add(s)); }
  for (const s of used) if (s !== 'idle') assert.ok(WIZ_POSE[s], 'unmapped antic state ' + s);
});

const artPath = path.join(ROOT, 'src', 'renderer', 'art-wizard.js');
test('art-wizard.js provides every mapped pose as a 48x48 PNG', { skip: !fs.existsSync(artPath) && 'art-wizard.js not present yet' }, () => {
  const sandbox = { window: {} }; new Function('window', fs.readFileSync(artPath, 'utf8'))(sandbox.window);
  const art = sandbox.window.WIZARD_ART; assert.ok(art);
  for (const k of KEYS) { assert.ok(art[k], 'missing key ' + k); const b = Buffer.from(String(art[k]).split(',')[1], 'base64'); assert.equal(b.readUInt32BE(16), 48, k + ' width'); assert.equal(b.readUInt32BE(20), 48, k + ' height'); }
  for (const k of new Set(Object.values(WIZ_POSE))) assert.ok(art[k], 'mapped pose exists in art: ' + k);
});

test('no em or en dashes in the wizard strings (blurb, popups)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'main', 'scripts.js'), 'utf8');
  assert.ok(!/[–—]/.test(src.slice(src.indexOf('wizard (Merlo)'))));
  assert.ok(!/[–—]/.test(require('../src/shared/catalog').characterById('wizard').blurb));
});

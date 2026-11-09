'use strict';
// Multi-pet pair interactions: pure planner / sessions (src/shared/pairs.js) and their scheduling in companions.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { LAYOUTS } = require('./helpers');
const Engine = require('../src/main/engine');
const pairs = require('../src/shared/pairs');
const { createCompanions } = require('../src/main/companions');
const { characterById } = require('../src/shared/catalog');

const SIZE = 100;
function mk(id, x, over = {}) {
  const e = Engine.create(), events = [];
  e.init({ event: (t, d) => events.push([t, d]), state() {} }, 0); e.setWorld(LAYOUTS.single); e.setSize(SIZE);
  const c = characterById(id) || {}; e.setMoveType(c.move || 'walk'); e.setGait(c.gait || 'hop');
  e.pos = { x: x, y: 0 }; e.pos.y = e.moveType === 'float' ? 500 : e.floorAt(x); e.onFloor = e.moveType !== 'float'; e.setState('idle', 0);
  Object.assign(e, over);
  return { id, engine: e, events };
}
// start a session on two engines and run frames: conductor tick, then each engine tick (as companions.frame + the engine loops do)
function start(kind, A, B) {
  const s = pairs.createSession(kind, A, B), [sa, sb] = s.scripts;
  assert.ok(A.engine.startScript(sa, 0));
  assert.ok(s.forceB ? pairs.forceScript(B.engine, sb, 0) : B.engine.startScript(sb, 0));
  return s;
}
function run(s, A, B, ms, probe) { let t = 0; for (; t < ms; t += 16) { s.tick(0.016); A.engine.tick(t + 16); B.engine.tick(t + 16); if (probe) probe(t); if (s.done && !A.engine.script && !B.engine.script) break; } return t; }

test('canPair: both free, same display, within range, not cooling down, right roles', () => {
  const p = (id, x, o = {}) => ({ id, x, y: 800, size: 100, disp: 1, free: true, ...o });
  const ok = (a, b, o) => pairs.canPair(a, b, { now: 1000, cool: new Map(), ...o });
  assert.ok(ok(p('blob', 100), p('cat', 400), { kind: 'meet' }));
  assert.ok(!ok(p('blob', 100), p('cat', 400, { free: false }), { kind: 'meet' }));
  assert.ok(!ok(p('blob', 100), p('cat', 400, { disp: 2 }), { kind: 'meet' }));
  assert.ok(!ok(p('blob', 100), p('blob', 400), { kind: 'meet' }));
  assert.ok(ok(p('blob', 100), p('cat', 950), { kind: 'meet' }), 'meet may walk two together from 850');
  assert.ok(!ok(p('blob', 100), p('cat', 1100), { kind: 'meet' }), 'beyond 900');
  assert.ok(ok(p('ghost', 100), p('blob', 600), { kind: 'spook' }));
  assert.ok(!ok(p('ghost', 100), p('blob', 760), { kind: 'spook' }), 'spook needs 600');
  assert.ok(!ok(p('ghost', 100), p('cat', 300), { kind: 'spook' }), 'spook is ghost -> blob only');
  assert.ok(ok(p('cat', 100), p('wizard', 400), { kind: 'zap' }));
  assert.ok(!ok(p('blob', 100), p('wizard', 400), { kind: 'zap' }));
  const cool = new Map([[pairs.pairKey('cat', 'blob'), 5000]]);
  assert.ok(!ok(p('blob', 100), p('cat', 400), { kind: 'meet', cool }), 'cooling down');
  assert.ok(pairs.canPair(p('blob', 100), p('cat', 400), { kind: 'meet', cool, now: 5001 }));
});

test('pickPair favours the special kinds, orders roles, and returns null when nobody fits', () => {
  const p = (id, x) => ({ id, x, y: 800, size: 100, disp: 1, free: true });
  const o = { now: 0, cool: new Map(), rand: () => 0.01 };
  const z = pairs.pickPair([p('cat', 100), p('wizard', 400)], o); assert.equal(z.kind, 'zap'); assert.equal(z.a.id, 'wizard'); assert.equal(z.b.id, 'cat');
  const s = pairs.pickPair([p('blob', 100), p('ghost', 400)], o); assert.equal(s.kind, 'spook'); assert.equal(s.a.id, 'ghost');
  assert.equal(pairs.pickPair([p('blob', 100), p('hero', 400)], o), null);   // no automatic meet & greet any more (it made walkers look stuck)
  assert.equal(pairs.pickPair([p('blob', 100)], o), null);
  assert.equal(pairs.pickPair([p('blob', 100), p('cat', 1500)], o), null);
  assert.ok(pairs.cooldownUntil(1000, () => 0) >= 1000 + 60000 && pairs.cooldownUntil(1000, () => 0.999) <= 1000 + 120000);
});

test('rescue threshold: only a fall of more than 150 DIP, never the hero, a floater, or without a free hero', () => {
  const base = { id: 'blob', moveType: 'walk', drop: 151, heroFree: true, sameDisplay: true, cooling: false };
  assert.ok(pairs.shouldRescue(base)); assert.ok(!pairs.shouldRescue({ ...base, drop: 150 })); assert.ok(!pairs.shouldRescue({ ...base, drop: 120 }));
  assert.ok(!pairs.shouldRescue({ ...base, id: 'hero' })); assert.ok(!pairs.shouldRescue({ ...base, moveType: 'float' }));
  assert.ok(!pairs.shouldRescue({ ...base, heroFree: false })); assert.ok(!pairs.shouldRescue({ ...base, sameDisplay: false })); assert.ok(!pairs.shouldRescue({ ...base, cooling: true }));
});

test('meet: they walk together, face each other, hop, show hearts, then both are released', () => {
  const A = mk('blob', 300), B = mk('cat', 900); const s = start('meet', A, B);
  run(s, A, B, 12000);
  assert.ok(s.done && !s.aborted); assert.equal(A.engine.script, null); assert.equal(B.engine.script, null);
  assert.ok(Math.abs(A.engine.pos.x - B.engine.pos.x) <= 0.9 * SIZE + 4, 'gap ' + Math.abs(A.engine.pos.x - B.engine.pos.x));
  for (const X of [A, B]) { assert.ok(X.events.some(([t]) => t === 'happy')); assert.ok(X.events.some(([t]) => t === 'hop')); }
  assert.ok(A.engine.pos.x < B.engine.pos.x);
});

test('rendezvous timeout cancels both sides', () => {
  const A = mk('blob', 100), B = mk('cat', 800); A.engine.settings.speed = 0.0001; B.engine.settings.speed = 0.0001;   // nobody can ever arrive
  const s = start('meet', A, B);
  const t = run(s, A, B, 9000 - 100); assert.ok(!s.done && A.engine.script && B.engine.script, 'still waiting before the limit');
  for (let i = 0; i < 20; i++) { s.tick(0.05); A.engine.tick(t + i * 50); B.engine.tick(t + i * 50); }
  assert.ok(s.done); assert.equal(s.aborted, 'timeout'); assert.equal(A.engine.script, null); assert.equal(B.engine.script, null);
});

test('cancelling either side (a drag, a hide) aborts the whole session and releases the other', () => {
  const A = mk('blob', 300), B = mk('cat', 800); const s = start('meet', A, B);
  run(s, A, B, 300); assert.ok(!s.done);
  A.engine.grab();   // the user picks up one of them
  assert.ok(s.done); assert.ok(s.aborted);
  B.engine.tick(1000); assert.equal(B.engine.script, null);
});

test('zap: the cat shrinks and turns green for about 3 s, then every effect is back to default', () => {
  const W = mk('wizard', 300), C = mk('cat', 700); const s = start('zap', W, C);
  let seen = null, frogAt = 0, firstFrog = 0;
  run(s, W, C, 20000, (t) => { const m = C.engine.mischief; if (m && m.sc <= 0.6001 && m.hue === 100) { if (!firstFrog) firstFrog = t; frogAt = t; seen = m; } });
  assert.ok(seen && seen.sc === 0.6 && seen.hue === 100 && seen.alpha === 1);
  assert.ok(frogAt - firstFrog >= 2900 && frogAt - firstFrog <= 3300, 'frog for ' + (frogAt - firstFrog));
  assert.ok(s.done && !s.aborted); assert.equal(C.engine.mischief, null); assert.equal(W.engine.mischief || null, null);
  assert.equal(W.engine.script, null); assert.equal(C.engine.script, null);
  assert.ok(W.events.some(([t, d]) => t === 'popup' && d.text === 'Zap!'));
});

test('zap aborted mid-frog also restores the cat', () => {
  const W = mk('wizard', 300), C = mk('cat', 700); const s = start('zap', W, C);
  run(s, W, C, 20000, () => {}); // complete once to reach the end
  const W2 = mk('wizard', 300), C2 = mk('cat', 700), s2 = start('zap', W2, C2);
  let t = 0; for (; t < 20000; t += 16) { s2.tick(0.016); W2.engine.tick(t + 16); C2.engine.tick(t + 16); if (C2.engine.mischief && C2.engine.mischief.sc <= 0.61) break; }
  assert.ok(C2.engine.mischief); W2.engine.cancelScript('hidden');
  assert.equal(C2.engine.mischief, null); C2.engine.tick(t + 32); assert.equal(C2.engine.script, null);
});

test('spook: ghost swoops, blob goes shocked then calm, everything released', () => {
  const G = mk('ghost', 200), B = mk('blob', 600); const s = start('spook', G, B); const states = new Set();
  run(s, G, B, 20000, () => states.add(B.engine.state));
  assert.ok(s.done && !s.aborted); assert.ok(states.has('shocked')); assert.notEqual(B.engine.state, 'shocked');
  assert.ok(G.events.some(([t, d]) => t === 'popup' && d.text === 'Boo!')); assert.ok(B.events.some(([t]) => t === 'wiggle'));
});

test('rescue: the hero catches a faller (no parachute) and sets it on the floor', () => {
  const H = mk('hero', 300), F = mk('blob', 500); F.engine.pos.y = F.engine.floorAt(500) - 400; F.engine.onFloor = false; F.engine.parachute = true; F.engine.setState('fall', 1e9);
  const s = start('rescue', H, F); let minVy = 0;
  run(s, H, F, 15000, () => { minVy = Math.max(minVy, F.engine.vel.y); });
  assert.ok(s.done && !s.aborted); assert.equal(F.engine.parachute, false); assert.equal(minVy, 0);
  assert.ok(Math.abs(F.engine.pos.y - F.engine.floorAt(F.engine.pos.x)) < 2, 'faller on the floor'); assert.ok(Math.abs(H.engine.pos.y - H.engine.floorAt(H.engine.pos.x)) < 2);
  assert.ok(H.events.some(([t, d]) => t === 'popup' && d.text === 'Got you!')); assert.ok(F.events.some(([t]) => t === 'happy'));
});

// ---- scheduling in companions ----------------------------------------------------------------------------------------------
class FakeWin {
  constructor(o) { this.opts = o; this.destroyed = false; this.ev = {}; this.b = { x: 0, y: 0, width: o.width, height: o.height }; FakeWin.all.push(this); this.webContents = { send() {}, isDestroyed: () => this.destroyed, on() {} }; }
  setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} showInactive() {} setOpacity() {} moveTop() {} isAlwaysOnTop() { return true; } setContentProtection() {} setIgnoreMouseEvents() {}
  loadFile() {} once(n, f) { this.ev[n] = f; } on(n, f) { this.ev[n] = f; } isDestroyed() { return this.destroyed; } destroy() { this.destroyed = true; }
  getBounds() { return this.b; } setBounds(b) { this.b = { ...b }; } setPosition(x, y) { this.b = { ...this.b, x, y }; } isVisible() { return true; } isFocusable() { return false; }
}
FakeWin.all = []; FakeWin.getAllWindows = () => FakeWin.all.filter(w => !w.destroyed);
const petBox = (M) => { const Wd = Math.max(Math.round(M * 1.6), 240), Ht = Math.max(Math.round(M * 2.45), 210); return { Wd, Ht, localX: Math.round((Wd - M) / 2), localY: Ht - Math.round(M * 0.22) - M }; };
let T = 5000;
function world(over = {}) {
  FakeWin.all = [];
  const state = { owned: ['blob', 'cat', 'wizard'], active: 'blob', settings: { showAll: true, antics: true, size: SIZE, mischief: 25, speed: 1, personality: 'chill' }, ...over.state };
  const lead = mk(state.active, 500).engine; lead.settings = { speed: 1, personality: 'chill', mischief: 25 };
  const g = { userHidden: false, fsDisplays: new Set(), leadBusy: false, leadSpeaking: false, focus: false, mischiefRunning: false, ...over.gates };
  const c = createCompanions({ BrowserWindow: FakeWin, screen: { getAllDisplays: () => LAYOUTS.single }, store: { get: () => state }, characterById, fullState: () => ({}), worldDisplays: () => LAYOUTS.single,
    cursor: () => ({ x: 5, y: 5 }), lead: () => ({ pos: lead.pos, size: lead.size }), leadActor: () => ({ id: state.active, engine: lead, shown: true }), gates: () => g, petBox,
    indexPath: 'i.html', preloadPath: 'p.js', staggerMs: 0, now: () => T, rand: over.rand || (() => 0.01), log: () => {}, logError: (w, e) => { throw new Error(w + ' ' + e); } });
  c.sync(); c.forEach(s => s.win.ev['ready-to-show']());
  const pos = (id, x) => { const e = id === state.active ? lead : c.get(id).engine; e.pos.x = x; e.pos.y = e.floorAt(x); e.onFloor = true; e.setState('idle', 5000); };
  return { c, state, lead, g, pos };
}
const frames = (w, n) => { for (let i = 0; i < n; i++) { T += 16; w.lead.tick(T); w.c.frame(T); w.c.forEach(s => { s.engine.setState(s.engine.script ? s.engine.state : s.engine.state, 0); }); } };
const pairRunning = (w) => { let n = 0; for (const e of [w.lead, ...['cat', 'wizard'].map(id => w.c.get(id) && w.c.get(id).engine)]) if (e && e.script && /^pair-/.test(e.script.name)) n++; return n; };
const holdIdle = (w) => { w.lead.settings.stayPut = false; };

test('pairs start on their own once both are idle and close, then rest (cooldown) and respect gates', () => {
  const w = world(); w.c.forEach(s => { s.engine.settings.stayPut = false; });
  let started = 0, ended = 0, prev = 0;
  for (let i = 0; i < 60 * 60 * 6; i++) {   // ~6 simulated minutes, keep the three standing near each other and idle between sessions
    if (!pairRunning(w)) { for (const [id, x] of [['blob', 500], ['cat', 760], ['wizard', 300]]) w.pos(id, x); }
    frames(w, 1); const n = pairRunning(w); if (n && !prev) started++; if (!n && prev) ended++; prev = n;
  }
  assert.ok(started >= 2, 'pairs ran ' + started); assert.ok(ended >= started - 1);
});

test('gates block pairs: focus, fullscreen, hidden, prank, lead script, stayPut, antics off', () => {
  for (const patch of [{ focus: true }, { fsDisplays: new Set([1]) }, { userHidden: true }, { mischiefRunning: true }, { leadBusy: true }]) {
    const w = world(); Object.assign(w.g, patch);
    for (let i = 0; i < 60 * 150; i++) { if (!pairRunning(w)) for (const [id, x] of [['blob', 500], ['cat', 760], ['wizard', 300]]) w.pos(id, x); frames(w, 1); assert.equal(pairRunning(w), 0, JSON.stringify(Object.keys(patch))); }
  }
  for (const k of ['stayPut', 'reduceMotion']) { const w = world(); w.state.settings[k] = true; for (let i = 0; i < 60 * 150; i++) { if (!pairRunning(w)) for (const [id, x] of [['blob', 500], ['cat', 760], ['wizard', 300]]) w.pos(id, x); frames(w, 1); assert.equal(pairRunning(w), 0, k); } }
  const w = world(); w.state.settings.antics = false; for (let i = 0; i < 60 * 150; i++) { if (!pairRunning(w)) for (const [id, x] of [['blob', 500], ['cat', 760], ['wizard', 300]]) w.pos(id, x); frames(w, 1); assert.equal(pairRunning(w), 0); }
});

test('slot exclusivity: a pair never overlaps a satellite antic or a second pair', () => {
  const w = world({ state: { owned: ['blob', 'cat', 'wizard', 'hero'] } });
  let both = 0, max = 0;
  for (let i = 0; i < 60 * 60 * 10; i++) {
    if (!pairRunning(w)) for (const [id, x] of [['blob', 500], ['cat', 760], ['wizard', 300], ['hero', 1200]]) w.pos(id, x);
    frames(w, 1);
    let pairs_ = 0, antics = 0; for (const e of [w.lead, ...['cat', 'wizard', 'hero'].map(id => w.c.get(id).engine)]) if (e.script) { if (/^pair-/.test(e.script.name)) pairs_++; else antics++; }
    if (pairs_ && antics) both++; max = Math.max(max, pairs_);
  }
  assert.equal(both, 0, 'pair and antic overlapped'); assert.ok(max <= 2);
});

test('force() runs each dev interaction and busy state shows through anyBusy', () => {
  const w = world({ state: { owned: ['blob', 'cat', 'wizard', 'hero', 'ghost'], active: 'blob' } });
  frames(w, 6);
  for (const kind of ['meet', 'zap', 'spook', 'rescue']) {
    assert.deepEqual(w.c.force(kind), { ok: true }, kind); assert.ok(w.c.anyBusy());
    for (let i = 0; i < 60 * 25 && w.c.anyBusy(); i++) frames(w, 1);
    assert.ok(!w.c.anyBusy(), kind + ' finished');
  }
  assert.equal(w.c.force('nope').ok, false);
  const small = world({ state: { owned: ['blob', 'cat'] } }); frames(small, 6); assert.equal(small.c.force('zap').reason, 'roster');
});

test('rescue is triggered by releasing a buddy above 150 DIP with the hero free, not below', (t) => {
  // the engines' own brains use Math.random: seed it so a random antic cannot take the shared slot mid-test (was ~1 in 10 flaky)
  const orig = Math.random; let seed = 12345; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647; t.after(() => { Math.random = orig; });
  const w = world({ state: { owned: ['blob', 'cat', 'hero'], active: 'blob' } });
  w.pos('cat', 900); w.pos('hero', 300); frames(w, 5);
  const cat = w.c.get('cat'), e = cat.engine;
  const drop = (h) => { e.pos.y = e.floorAt(e.pos.x) - h; e.onFloor = false; cat.grab(); frames(w, 1); cat.release(); e.pos.y = e.floorAt(e.pos.x) - h; frames(w, 2); };
  drop(120); assert.ok(!w.c.anyBusy(), 'small drop: nobody comes');
  for (let i = 0; i < 60 * 8; i++) frames(w, 1);
  w.pos('cat', 900); w.pos('hero', 300); frames(w, 5);
  drop(400); for (let i = 0; i < 90 && !w.c.anyBusy(); i++) frames(w, 1);   // the hero may be mid-hop when the buddy is let go
  assert.ok(w.c.anyBusy(), 'big drop: the hero comes');
  for (let i = 0; i < 60 * 15 && w.c.anyBusy(); i++) frames(w, 1);
  assert.ok(!w.c.anyBusy()); assert.ok(Math.abs(e.pos.y - e.floorAt(e.pos.x)) < 3);
});

test('destroyAll mid-pair aborts it and leaves no stuck effect', () => {
  const w = world({ state: { owned: ['blob', 'cat', 'wizard'], active: 'blob' } });
  frames(w, 6); assert.deepEqual(w.c.force('zap'), { ok: true });
  for (let i = 0; i < 60 * 4; i++) frames(w, 1);
  w.c.destroyAll(); assert.ok(!w.c.anyBusy());
});

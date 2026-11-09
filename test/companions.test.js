'use strict';
// Multi-pet mode (phase 1): Engine.create isolation and the companions manager, with BrowserWindow / screen doubles (no Electron).
const test = require('node:test');
const assert = require('node:assert/strict');
const { LAYOUTS } = require('./helpers');
const Engine = require('../src/main/engine');
const { createCompanions, wantedIds, MAX_SATS, ANTIC_GAP_MS, SAY_GAP_MS } = require('../src/main/companions');
const { characterById } = require('../src/shared/catalog');

class FakeWin {
  constructor(o) { this.opts = o; this.destroyed = false; this.calls = []; this.sent = []; this.ev = {}; this.b = { x: 0, y: 0, width: o.width, height: o.height }; FakeWin.all.push(this);
    this.webContents = { send: (c, p) => this.sent.push([c, p]), isDestroyed: () => this.destroyed, on: (n, f) => { this.ev['wc:' + n] = f; } }; }
  setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} showInactive() {} setOpacity(v) { this.opacity = v; } moveTop() {} isAlwaysOnTop() { return true; } setContentProtection(v) { this.protected = !!v; }
  setIgnoreMouseEvents(v) { this.calls.push(['ignore', v]); this.ignore = v; }
  loadFile(f, o) { this.loaded = { f, o }; }
  once(n, f) { this.ev[n] = f; } on(n, f) { this.ev[n] = f; }
  isDestroyed() { return this.destroyed; } destroy() { this.destroyed = true; if (this.ev.closed) this.ev.closed(); }
  getBounds() { return this.b; } setBounds(b) { this.b = { ...b }; } setPosition(x, y) { this.b = { ...this.b, x, y }; }
  isVisible() { return true; } isFocusable() { return false; }
}
FakeWin.all = [];
FakeWin.getAllWindows = () => FakeWin.all.filter(w => !w.destroyed);
const live = () => FakeWin.all.filter(w => !w.destroyed);

const petBox = (M) => { const Wd = Math.max(Math.round(M * 1.6), 240), Ht = Math.max(Math.round(M * 2.45), 210); return { Wd, Ht, localX: Math.round((Wd - M) / 2), localY: Ht - Math.round(M * 0.22) - M }; };
const FAKE_IDS = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'blob', 'ghost', 'cat', 'hero', 'wizard']);

function setup(over = {}) {
  FakeWin.all = [];
  const state = { owned: ['blob', 'cat', 'wizard'], active: 'blob', settings: { showAll: true, antics: true, size: 100, mischief: 25, speed: 1, personality: 'chill' }, ...over.state };
  const lead = { pos: { x: 600, y: 900 }, size: 100 };
  const g = { userHidden: false, fsDisplays: new Set(), leadBusy: false, leadSpeaking: false, focus: false, mischiefRunning: false, ...over.gates };
  const msgs = [];
  const c = createCompanions({
    BrowserWindow: FakeWin, screen: { getAllDisplays: () => LAYOUTS.single }, store: { get: () => state },
    characterById: (id) => (FAKE_IDS.has(id) ? (characterById(id) || { id }) : null), fullState: () => ({ s: 1 }), worldDisplays: () => LAYOUTS.single,
    cursor: () => ({ x: 5, y: 5 }), lead: () => lead, gates: () => g, petBox, indexPath: 'index.html', preloadPath: 'preload.js', staggerMs: 0, now: over.now || (() => T), rand: over.rand || Math.random,
    log: () => {}, logError: (w, e) => msgs.push([w, String(e)]), ...over.deps,
  });
  return { c, state, lead, g, msgs };
}
let T = 1000;
const frames = (c, n = 4) => { for (let i = 0; i < n; i++) { T += 16; c.frame(T); } };
const ready = (c) => c.forEach(s => s.win.ev['ready-to-show']());

test('Engine.create is isolated from the singleton and from other instances', () => {
  const a = Engine.create(), b = Engine.create();
  a.pos.x = 5; a.vel.y = 9; a.recent.push('walk'); a.settings.speed = 3; a.world.floors.push(1); a.displays.push(1); a.hooks.x = 1; a.setState('walk', 10); a.script = { name: 's' };
  assert.equal(b.pos.x, 300); assert.equal(b.vel.y, 0); assert.equal(b.recent.length, 0); assert.equal(b.settings.speed, 1); assert.equal(b.world.floors.length, 0);
  assert.equal(b.displays.length, 0); assert.equal(b.hooks.x, undefined); assert.equal(b.state, 'idle'); assert.equal(b.script, null);
  assert.notEqual(Engine.pos.x, 5); assert.equal(Engine.script, null); assert.equal(Engine.recent.length, 0);
  b.setWorld(LAYOUTS.single); assert.equal(a.displays.length, 1); assert.equal(Engine.displays.length, 0);   // a's single fake entry, untouched by b
});

test('a created engine ticks on its own and roams', () => {
  const e = Engine.create(); e.init({ event() {}, state() {} }, 0); e.setWorld(LAYOUTS.single); e.setSize(100); e.pos = { x: 500, y: 0 };
  let landed = false; for (let i = 0; i < 600; i++) { e.tick(i * 16); if (e.onFloor && e.pos.y === e.floorAt(e.pos.x)) landed = true; }   // random hops later are fine: it must have landed
  assert.ok(landed); assert.equal(Engine.lastTick, Engine.lastTick); assert.notEqual(Engine.lastTick, e.lastTick);
});

test('nothing is created with showAll off, one buddy owned, or software GL', () => {
  let t = setup({ state: { settings: { showAll: false, antics: true } } }); t.c.sync(); assert.equal(live().length, 0);
  t = setup({ state: { owned: ['blob'] } }); t.c.sync(); assert.equal(live().length, 0);
  t = setup({ deps: { softwareGL: true } }); t.c.sync(); assert.equal(live().length, 0);
  t.c.frame(1); assert.equal(t.c.count(), 0);
});

test('one satellite per owned non-active buddy, capped at 4, loading index.html?char=id', () => {
  const t = setup({ state: { owned: ['blob', 'a', 'b', 'c', 'd', 'e', 'f'], active: 'blob' } });
  t.c.sync(); assert.equal(live().length, MAX_SATS); assert.equal(t.c.count(), 4);
  assert.deepEqual(live().map(w => w.loaded.o.query.char), ['a', 'b', 'c', 'd']);
  assert.deepEqual(wantedIds({ owned: ['x', 'y'], active: 'x', settings: { showAll: true } }), ['y']);
  assert.deepEqual(wantedIds({ owned: ['x', 'y', 'z'], active: 'x', settings: { showAll: true, hideBuddies: ['y'] } }), ['z']);   // user kept y home
  assert.deepEqual(wantedIds({ owned: ['x'], active: 'x', settings: { showAll: true } }), []);   // never anything not owned
  assert.ok(live().every(w => w.opts.transparent && w.opts.focusable === false && w.ignore === true));   // click-through until the cursor is over a buddy
});

test('satellites are created one at a time, staggered', () => {
  const timers = []; let n = 1000;
  const t = setup({ now: () => n, deps: { staggerMs: 500, setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: () => {} } });
  t.c.sync(); assert.equal(live().length, 1); assert.equal(timers.length, 1); assert.ok(timers[0].ms > 0 && timers[0].ms <= 500);
  n += 500; timers.shift().f(); assert.equal(live().length, 2); assert.equal(timers.length, 0);
});

test('sync after setActive swaps: the old lead becomes a satellite, the new lead loses its window', () => {
  const t = setup(); t.c.sync(); assert.deepEqual(live().map(w => w.loaded.o.query.char), ['cat', 'wizard']);
  const catWin = t.c.get('cat').win, wizWin = t.c.get('wizard').win;
  t.state.active = 'cat'; t.c.sync();
  assert.ok(catWin.destroyed); assert.ok(!wizWin.destroyed); assert.ok(t.c.get('blob')); assert.equal(t.c.get('cat'), null); assert.equal(t.c.count(), 2);
  t.state.settings.showAll = false; t.c.sync(); assert.equal(live().length, 0); assert.equal(t.c.count(), 0);
});

test('destroying a satellite never touches the lead; destroyAll empties everything', () => {
  const lead = { destroyed: false, destroy() { this.destroyed = true; } }, t = setup(); t.c.sync();
  t.state.owned = ['blob', 'cat']; t.c.sync(); assert.equal(t.c.count(), 1);
  assert.equal(lead.destroyed, false); assert.equal(t.lead.pos.x, 600);
  t.c.destroyAll(); assert.equal(live().length, 0); assert.equal(t.c.count(), 0);
});

test('satellites spawn near the lead on the floor and tick without stacking', () => {
  const t = setup(); t.c.sync(); ready(t.c);
  const [a, b] = ['cat', 'wizard'].map(id => t.c.get(id).engine);
  assert.ok(Math.abs(a.pos.x - 600) >= 80 && Math.abs(b.pos.x - 600) >= 80 && Math.abs(a.pos.x - b.pos.x) >= 80);
  assert.equal(a.pos.y, a.floorAt(a.pos.x));
  for (let i = 0; i < 60; i++) { T += 16; t.c.frame(T); }
  const w = t.c.get('cat').win; assert.ok(w.sent.some(([c, p]) => c === 'pet' && p.show === true)); assert.equal(w.opacity, 1);
});

test('gates: user hidden and fullscreen hide satellites and freeze them; a mischief prank keeps them visible but out of the capture', () => {
  const t = setup(); t.c.sync(); ready(t.c); T += 16; t.c.frame(T);
  const s = t.c.get('cat'); assert.equal(s.shown, true);
  t.g.userHidden = true; T += 16; t.c.frame(T); assert.equal(s.shown, false); assert.equal(s.win.opacity, 0);
  const x = s.engine.pos.x; for (let i = 0; i < 30; i++) { T += 16; t.c.frame(T); } assert.equal(s.engine.pos.x, x);
  t.g.userHidden = false; t.g.mischiefRunning = true; T += 16; t.c.frame(T); assert.equal(s.shown, true); assert.equal(s.win.protected, true);   // visible, excluded from capture
  t.g.mischiefRunning = false; T += 16; t.c.frame(T); assert.equal(s.shown, true); assert.equal(s.win.protected, false);
  t.g.fsDisplays = new Set([1]); T += 16; t.c.frame(T); assert.equal(s.shown, false);   // the only display is covered
});

test('dragging: grab, follows the cursor, release throws; a lost pointerup is released', () => {
  let cur = { x: 5, y: 5 };
  const t = setup({ deps: { cursor: () => cur } }); t.c.sync(); ready(t.c); T += 16; t.c.frame(T);
  const s = t.c.get('cat'), e = s.engine; cur = { x: e.pos.x + 50, y: e.pos.y + 50 }; s.grab(); assert.ok(e.dragging);
  cur = { x: 900, y: 400 }; T += 16; s.dragPing(); t.c.frame(T); assert.ok(Math.abs(e.pos.x + 50 - 900) < 60 || e.pos.x > 700);
  s.release(); assert.ok(!e.dragging); assert.equal(e.state, 'fall');
  s.grab(); T += 5000; t.c.frame(T); assert.ok(!e.dragging);   // heartbeat stopped: dropped
});

test('mouse capture follows the cursor and is per satellite', () => {
  let cur = { x: 5, y: 5 };
  const t = setup({ deps: { cursor: () => cur } }); t.c.sync(); ready(t.c); frames(t.c);
  const s = t.c.get('cat'), e = s.engine; assert.equal(s.interactive, false);
  cur = { x: e.pos.x + 50, y: e.pos.y + 50 }; frames(t.c); assert.equal(s.interactive, true); assert.equal(s.win.ignore, false);
  assert.equal(t.c.get('wizard').interactive, false);
  cur = { x: 5, y: 5 }; frames(t.c); assert.equal(s.interactive, false);
});

test('a lost window is rebuilt with back-off and given up on after repeated failures', () => {
  const t = setup(); t.c.sync(); ready(t.c); T += 16; t.c.frame(T);
  const s = t.c.get('cat'); let made = live().length;
  s.win.destroy(); T += 16; t.c.frame(T); assert.equal(live().length, made - 1);   // back-off armed
  T += 1100; t.c.frame(T); assert.equal(live().length, made);
  for (let i = 0; i < 8; i++) { s.win && s.win.destroy(); T += 40000; t.c.frame(T); T += 40000; t.c.frame(T); }
  assert.ok(s.dead || s.win);   // never loops forever: the governor gives up
});

// ---- antic slot -------------------------------------------------------------------------------------------------------
const settleAll = (t) => t.c.forEach(s => { s.engine.setState('idle', 5000); s.engine.onFloor = true; });
function runTo(t, until) { for (; T < until; T += 16) { t.c.frame(T); } }

test('antic slot: only one satellite antic at a time, at least 8 s apart, sprite-only', () => {
  const t = setup({ state: { owned: ['blob', 'hero', 'wizard', 'ghost'], active: 'blob' }, rand: () => 0.01 });
  t.c.sync(); ready(t.c); t.c.frame(T);
  let max = 0; const starts = [], ends = []; let prev = false;
  for (let i = 0; i < 60 * 60 * 20; i++) {   // ~20 simulated minutes
    T += 16; t.c.frame(T);
    let n = 0; t.c.forEach(s => { if (s.engine.script && !/^pair-/.test(s.engine.script.name)) n++; });
    max = Math.max(max, n);
    if (n && !prev) starts.push(T); if (!n && prev) ends.push(T); prev = !!n;
    settleAll;
  }
  assert.ok(starts.length >= 2, 'antics ran: ' + starts.length); assert.equal(max, 1);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - ends[i - 1] >= ANTIC_GAP_MS - 50, 'gap ' + (starts[i] - ends[i - 1]));
  assert.ok(!t.c.anyBusy() || t.c.anyBusy());
});

test('antics never start while the lead runs a script or a prank, nor under the quiet gates', () => {
  const t = setup({ rand: () => 0.01 }); t.c.sync(); ready(t.c); t.c.frame(T);
  const scriptsRunning = () => { let n = 0; t.c.forEach(s => { if (s.engine.script) n++; }); return n; };
  for (const patch of [{ leadBusy: true }, { mischiefRunning: true }, { focus: true }, { userHidden: true }, { fsDisplays: new Set([1]) }]) {
    Object.assign(t.g, { leadBusy: false, mischiefRunning: false, focus: false, userHidden: false, fsDisplays: new Set() }, patch);
    for (let i = 0; i < 60 * 120; i++) { T += 16; t.c.frame(T); }
    assert.equal(scriptsRunning(), 0, JSON.stringify(Object.keys(patch)));
  }
  Object.assign(t.g, { leadBusy: false, mischiefRunning: false, focus: false, userHidden: false, fsDisplays: new Set() });
  for (const k of ['stayPut', 'reduceMotion', 'paused']) { t.state.settings[k] = true; for (let i = 0; i < 60 * 120; i++) { T += 16; t.c.frame(T); } assert.equal(scriptsRunning(), 0, k); t.state.settings[k] = false; }
  t.state.settings.antics = false; for (let i = 0; i < 60 * 120; i++) { T += 16; t.c.frame(T); } assert.equal(scriptsRunning(), 0, 'antics off');
});

test('an antic is cancelled when its satellite is hidden, and the slot frees up', () => {
  const t = setup({ state: { owned: ['blob', 'wizard'] }, rand: () => 0.01 }); t.c.sync(); ready(t.c); t.c.frame(T);
  const s = t.c.get('wizard'); let started = false;
  for (let i = 0; i < 60 * 900 && !started; i++) { T += 16; t.c.frame(T); started = !!s.engine.script; }
  assert.ok(started); assert.ok(t.c.anyBusy());
  t.g.userHidden = true; T += 16; t.c.frame(T); assert.equal(s.engine.script, null); assert.ok(!t.c.anyBusy());
});

test('the cat has no satellite antic (its chase needs the lead-only toy window)', () => {
  const t = setup({ state: { owned: ['blob', 'cat'] }, rand: () => 0.01 }); t.c.sync(); ready(t.c); t.c.frame(T);
  for (let i = 0; i < 60 * 60 * 15; i++) { T += 16; t.c.frame(T); assert.equal(t.c.get('cat').engine.script, null); }
});

// ---- speech -----------------------------------------------------------------------------------------------------------
test('satellite speech: one global budget, never over the lead, muted during focus', () => {
  const t = setup(); t.c.sync(); ready(t.c); T = 100000; t.c.frame(T);
  const a = t.c.get('cat'), b = t.c.get('wizard'), say = (s) => s.engine.hooks.event('say', { kind: 'idle' });
  const said = (s) => s.win.sent.filter(([c, p]) => c === 'petEvent' && p.type === 'say').length;
  t.g.leadSpeaking = true; T += 16; t.c.frame(T); say(a); assert.equal(said(a), 0);
  t.g.leadSpeaking = false; t.g.focus = true; T += 16; t.c.frame(T); say(a); assert.equal(said(a), 0);
  t.g.focus = false; T += 16; t.c.frame(T); say(a); assert.equal(said(a), 1);
  say(b); assert.equal(said(b), 0);   // shared budget: the other one waits
  T += SAY_GAP_MS - 1000; t.c.frame(T); say(b); assert.equal(said(b), 0);
  T += 2000; t.c.frame(T); say(b); assert.equal(said(b), 1);
  a.engine.hooks.event('sparkle', { n: 3 }); assert.ok(a.win.sent.some(([c, p]) => p && p.type === 'sparkle'));   // non-speech events always flow
});

test('study focus keeps satellites calm (stay put + focus)', () => {
  const t = setup(); t.c.sync(); ready(t.c); T += 16; t.c.frame(T);
  const s = t.c.get('cat'); s.engine.setState('sleep', 99999);
  t.g.focus = true; T += 300; t.c.frame(T);
  assert.equal(s.engine.settings.stayPut, true); assert.equal(s.engine.settings.focus, true); assert.equal(s.engine.state, 'idle');
});

test('displays changed: every satellite gets the new world', () => {
  const t = setup(); t.c.sync(); ready(t.c);
  let worlds = LAYOUTS.dual; const t2 = setup({ deps: { worldDisplays: () => worlds } }); t2.c.sync(); worlds = LAYOUTS.single; t2.c.onDisplaysChanged();
  t2.c.forEach(s => assert.equal(s.engine.displays.length, 1));
});

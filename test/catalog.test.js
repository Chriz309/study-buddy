'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const cat = require('../src/shared/catalog');
const devrun = require('../src/main/devrun');
const { ROOT } = require('./helpers');

test('Captain Cram is a real tier-2 unique character priced above the rest', () => {
  const h = cat.characterById('hero');
  assert.ok(h && h.implemented && h.tier === 2 && h.rarity === 'unique' && h.move === 'walk' && h.gait === 'step');
  assert.ok(h.cost > cat.characterById('cat').cost && h.name === 'Captain Cram');
  assert.ok(cat.RARITIES[h.rarity]);
});

test('tier gating: the hero only enters the gumball machine once every tier-1 buddy is owned', () => {
  const ids = (o) => cat.rollPool(o).map(c => c.id).sort();
  assert.deepEqual(ids(['blob']), ['cat', 'ghost']);
  assert.deepEqual(ids(['blob', 'ghost']), ['cat']);
  assert.deepEqual(ids(['blob', 'cat', 'ghost']), ['hero']);
  assert.deepEqual(ids(['blob', 'cat', 'ghost', 'hero']), []);
  assert.deepEqual(cat.lockedIds(['blob']), ['hero']);
  assert.deepEqual(cat.lockedIds(['blob', 'cat', 'ghost']), []);
  assert.equal(cat.tierUnlocked(2, ['blob']), false); assert.equal(cat.tierUnlocked(1, []), true);
});

test('defaults: antics on, version 5', () => { assert.equal(cat.DEFAULTS.settings.antics, true); assert.equal(cat.DEFAULTS.version, 5); });

// store.js needs Electron's `app`: stub it and point userData at a temp dir
function loadStoreWith(saveObj) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-test-'));
  if (saveObj !== undefined) fs.writeFileSync(path.join(dir, 'buddy-save.json'), typeof saveObj === 'string' ? saveObj : JSON.stringify(saveObj));
  const orig = Module._load;
  Module._load = function (req, ...a) { return req === 'electron' ? { app: { getPath: () => dir } } : orig.call(this, req, ...a); };
  try {
    const p = require.resolve('../src/main/store.js'); delete require.cache[p];
    const store = require(p); const st = store.load();
    return { store, st, dir };
  } finally { Module._load = orig; }
}

test('migration: an existing v4 save loads unchanged (owned, active, names, sparks, settings) and gains the new defaults', () => {
  const old = { version: 4, sparks: 12345.5, active: 'cat', owned: ['blob', 'ghost', 'cat'], levels: { cat: 3 }, names: { cat: 'Mittens' }, colors: { cat: 'grey' },
    settings: { size: 110, speed: 1.4, personality: 'hyper', mischief: 60, startOnBoot: false, stayPut: true, reduceMotion: true } };
  const { st, dir } = loadStoreWith(old);
  try {
    assert.equal(st.version, 5);
    assert.deepEqual(st.owned, ['blob', 'ghost', 'cat']); assert.equal(st.active, 'cat'); assert.equal(st.sparks, 12345.5);
    assert.deepEqual(st.names, { cat: 'Mittens' }); assert.deepEqual(st.levels, { cat: 3 }); assert.deepEqual(st.colors, { cat: 'grey' });
    assert.equal(st.settings.size, 110); assert.equal(st.settings.speed, 1.4); assert.equal(st.settings.startOnBoot, false); assert.equal(st.settings.stayPut, true);
    assert.equal(st.settings.antics, true, 'new setting defaults on');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('migration: a save that names an unknown/unowned active buddy falls back to Blob; corrupt or missing saves give defaults', () => {
  let r = loadStoreWith({ version: 5, owned: ['blob'], active: 'mystery', settings: {} });
  try { assert.equal(r.st.active, 'blob'); } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
  r = loadStoreWith('{ not json');
  try { assert.deepEqual(r.st.owned, ['blob']); assert.equal(r.st.version, 5); } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
  r = loadStoreWith(undefined);
  try { assert.equal(r.st.settings.antics, true); } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});

test('devrun.parse', () => {
  assert.deepEqual(devrun.parse('unlock:hero@1500; chase@3000;flick:2500,-2500@500;bogus;quit@9000'), [
    { cmd: 'flick', arg: '2500,-2500', at: 500 }, { cmd: 'unlock', arg: 'hero', at: 1500 }, { cmd: 'chase', arg: '', at: 3000 }, { cmd: 'quit', arg: '', at: 9000 }]);
  assert.deepEqual(devrun.parse(''), []);
});

test('hero art: all frames the renderer asks for exist as 40x40 PNGs', () => {
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'art-hero.js'), 'utf8'))(sandbox.window);
  const art = sandbox.window.HERO_ART;
  const need = ['idle', 'idle2', 'idle_blink', 'idle2_blink', 'walk1', 'walk2', 'walk3', 'walk4', 'fly', 'flex', 'land', 'happy', 'sleep'];
  for (const k of need) {
    assert.ok(art[k], 'frame ' + k);
    const buf = Buffer.from(art[k].replace(/^data:image\/png;base64,/, ''), 'base64');
    assert.equal(buf.readUInt32BE(16), 40); assert.equal(buf.readUInt32BE(20), 40);
    assert.equal(buf.subarray(1, 4).toString(), 'PNG');
  }
});

test('renderer wiring: every state the engine/scripts emit has a pose for both antic characters', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'app.js'), 'utf8');
  for (const st of ['run', 'pounce', 'happy', 'fly', 'dive', 'flex', 'land', 'crouch']) assert.ok(new RegExp("case '" + st + "'").test(app), 'poseFor handles ' + st);
});

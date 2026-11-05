'use strict';
// Regression: settings changed from the UI (settings:patch -> store.set) really reach buddy-save.json: the Mischief slider and
// Desktop mischief frequency survive a restart, and the throttled write lands within ~1 s.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');

function loadStore(dir) {
  const orig = Module._load;
  Module._load = function (req, ...a) { return req === 'electron' ? { app: { getPath: () => dir } } : orig.call(this, req, ...a); };
  try {
    delete require.cache[require.resolve('../src/main/store')];
    return require('../src/main/store');
  } finally { Module._load = orig; }
}

test('settings patches (mischief slider, desktop mischief frequency) are written to disk and reload', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-store-'));
  try {
    const store = loadStore(dir); store.load();
    assert.equal(store.get().settings.deskMischiefFreq, 'normal'); assert.equal(store.get().settings.mischief, 25);
    store.set({ settings: { mischief: 100 } }); store.set({ settings: { deskMischiefFreq: 'chaos' } });
    store.set({ sparks: 12.5 });   // the 1 s sparks tick keeps writing too
    await new Promise(r => setTimeout(r, 1300));   // the throttled write (SAVE_DELAY 1 s) must have happened without saveNow()
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'buddy-save.json'), 'utf8'));
    assert.equal(onDisk.settings.mischief, 100); assert.equal(onDisk.settings.deskMischiefFreq, 'chaos');
    const again = loadStore(dir); again.load();
    assert.equal(again.get().settings.mischief, 100); assert.equal(again.get().settings.deskMischiefFreq, 'chaos');
    assert.equal(again.get().settings.antics, true, 'untouched settings keep their defaults');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// migration -> v6 (0.7.1): desktop mischief is ON by default. Saves from before that have deskMischief null ("never chosen"): switch it on once.
// An explicit false (the user turned it off, or used "Stop mischief") must stay off.
function saveWith(dir, version, deskMischief) {
  const settings = deskMischief === undefined ? {} : { deskMischief };
  fs.writeFileSync(path.join(dir, 'buddy-save.json'), JSON.stringify({ version, sparks: 5, owned: ['blob'], active: 'blob', settings }));
}
test('migration v6: deskMischief null/missing -> true, explicit false stays false, explicit true stays true', () => {
  for (const [saved, want] of [[null, true], [undefined, true], [false, false], [true, true]]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-mig-'));
    try {
      saveWith(dir, 5, saved);
      const store = loadStore(dir); store.load();
      assert.equal(store.get().settings.deskMischief, want, 'saved ' + saved);
      assert.equal(store.get().version, 6);
      store.saveNow();
      const again = loadStore(dir); again.load();
      assert.equal(again.get().settings.deskMischief, want, 'after a second load, saved ' + saved);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});
test('migration v6 runs once: a v6 save with null is left alone (and a later explicit false is never re-enabled)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-mig-'));
  try {
    saveWith(dir, 6, false);
    const store = loadStore(dir); store.load();
    assert.equal(store.get().settings.deskMischief, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('a fresh install has desktop mischief on', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-mig-'));
  try { const store = loadStore(dir); store.load(); assert.equal(store.get().settings.deskMischief, true); assert.equal(store.get().version, 6); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

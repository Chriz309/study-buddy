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

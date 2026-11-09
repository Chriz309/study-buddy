'use strict';
// Wardrobe: catalog shape + prices, the art contract, the anchor table (every buddy x every frame it can show),
// buy/equip validation, and that bought + equipped items survive a restart.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), Module = require('module');
const cat = require('../src/shared/catalog');
const W = require('../src/shared/wardrobe');
const C = require('../src/renderer/cosmetics');
const { createEconomy } = require('../src/shared/devmode');
const { ROOT } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ART = (() => { const sb = { window: {} }; vm.createContext(sb); vm.runInContext(read('src/renderer/art-cosmetics.js'), sb); return sb.window.COSMETIC_ART; })();
const pngSize = (b64) => { const b = Buffer.from(b64, 'base64'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
// every `key: "data:image/png;base64,..."` frame in an art file -> { key: [w, h] }
const frames = (f) => Object.fromEntries([...read(f).matchAll(/^\s*(\w+)\s*:\s*"data:image\/png;base64,([A-Za-z0-9+/=]+)"/gm)].map(m => [m[1], pngSize(m[2])]));
const rich = (over = {}) => ({ sparks: 100000, owned: ['blob', 'cat', 'wizard'], cosmetics: { owned: [], equipped: {} }, ...over });

test('catalog: 15 items over head / face / neck, unique ids, prices 2,000 to 40,000, crown and medal the priciest', () => {
  const L = cat.COSMETICS;
  assert.equal(L.length, 15); assert.deepEqual(cat.COSMETIC_SLOTS, ['head', 'face', 'neck']);
  assert.equal(new Set(L.map(i => i.id)).size, L.length);
  for (const i of L) {
    assert.ok(cat.COSMETIC_SLOTS.includes(i.slot), i.id); assert.ok(Number.isInteger(i.price) && i.price >= 2000 && i.price <= 40000, i.id + ' ' + i.price);
    assert.ok(i.name && !/[–—]/.test(i.name), i.id + ' name'); for (const c of i.not || []) assert.ok(cat.characterById(c), i.id + ' not ' + c);
  }
  for (const s of cat.COSMETIC_SLOTS) assert.ok(L.filter(i => i.slot === s).length >= 3, s + ' has a few items');
  const top = L.filter(i => i.price === 40000).map(i => i.id).sort(); assert.deepEqual(top, ['crown', 'gold_medal']);
  for (const id of ['grad_cap', 'party_hat', 'crown', 'beanie', 'flower_crown', 'top_hat', 'chef_hat', 'frog_hat', 'round_glasses', 'star_shades', 'monocle', 'blush', 'bow_tie', 'scarf', 'gold_medal']) assert.ok(cat.cosmeticById(id), id);
});

test('Merlo keeps his hat: no head item fits him, every face and neck item does', () => {
  const w = cat.characterById('wizard');
  for (const i of cat.COSMETICS) assert.equal(cat.canWear(w.id, i), i.slot !== 'head', i.id);
  for (const c of cat.CHARACTERS) assert.ok(cat.COSMETICS.some(i => i.slot === 'face' && cat.canWear(c.id, i)) && cat.COSMETICS.some(i => i.slot === 'neck' && cat.canWear(c.id, i)), c.id);
});

test('art: every catalog item has a pixel-art image whose size and attach point match', () => {
  for (const i of cat.COSMETICS) {
    const a = ART[i.id]; assert.ok(a, i.id + ' art'); assert.equal(a.slot, i.slot, i.id + ' slot');
    const [w, h] = pngSize(a.src.split(',')[1]); assert.deepEqual([a.w, a.h], [w, h], i.id + ' size');
    assert.ok(a.w <= 20 && a.h <= 20, i.id + ' stays tiny');
  }
  assert.deepEqual(Object.keys(ART).sort(), cat.COSMETICS.map(i => i.id).sort(), 'no orphan art');
});

test('anchors: every buddy and every frame it can show has a row; frame sizes match the real art', () => {
  assert.deepEqual(Object.keys(C.ANCHORS).sort(), cat.CHARACTERS.map(c => c.id).sort());
  const real = { hero: frames('src/renderer/art-hero.js'), wizard: frames('src/renderer/art-wizard.js'), cat: { ...frames('src/renderer/art-cat.js'), ...frames('src/renderer/art-cat-mischief.js') } };
  for (const [char, fr] of Object.entries(real)) for (const [key, [w, h]] of Object.entries(fr)) {
    const A = C.anchorsFor(char, key); assert.ok(A, `${char}/${key} has anchors`);
    assert.deepEqual([A.fw, A.fh], [w, h], `${char}/${key} frame size`);
  }
  for (const char of ['blob', 'ghost']) {
    const s = read(char === 'blob' ? 'src/renderer/art.js' : 'src/renderer/art-ghost.js').match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)[1];
    for (const key of ['front', 'back']) { const A = C.anchorsFor(char, key); assert.ok(A, char + '/' + key); assert.deepEqual([A.fw, A.fh], pngSize(s), char + ' body size'); }
  }
  // no stale rows: every row in the table is a frame that exists (the *_blink and Merlo's 'blink' frames reuse their base row)
  for (const char of ['hero', 'wizard', 'cat']) for (const key of Object.keys(C.ANCHORS[char].poses)) assert.ok(real[char][key], `${char}/${key} is not a real frame`);
  assert.equal(C.poseKey('wizard', 'blink'), 'idle'); assert.equal(C.poseKey('hero', 'idle2_blink'), 'idle2'); assert.equal(C.poseKey('cat', 'sit_blink'), 'sit');
  assert.equal(C.anchorsFor('cat', 'nope'), null); assert.equal(C.anchorsFor('dragon', 'front'), null);
});

test('anchors: every pose the app can pick is covered (app.js poseFor, the wizard map, climbing blob/ghost)', () => {
  const app = read('src/renderer/app.js');
  const wiz = app.match(/const WIZ_POSE=\{([^}]*)\}/)[1];
  for (const m of wiz.matchAll(/:\s*'(\w+)'/g)) assert.ok(C.anchorsFor('wizard', m[1]), 'wizard ' + m[1]);
  assert.ok(C.anchorsFor('wizard', 'read') && C.anchorsFor('wizard', 'frog'));
  for (const k of ['idle', 'idle2', 'walk1', 'walk2', 'walk3', 'walk4', 'fly', 'flex', 'land', 'sleep', 'happy', 'shock', 'frazzled', 'pull', 'juggle', 'peek']) assert.ok(C.anchorsFor('hero', k), 'hero ' + k);
  for (const k of ['side', 'side2', 'side3', 'side4', 'front', 'sit', 'lay', 'front_blink', 'sit_blink', 'shock', 'frazzled', 'pull', 'juggle', 'peek']) assert.ok(C.anchorsFor('cat', k), 'cat ' + k);
});

test('anchors: placements are finite and sane, hidden slots return nothing, items stay in their own slot order', () => {
  const eq = { head: 'crown', face: 'round_glasses', neck: 'bow_tie' };
  for (const char of Object.keys(C.ANCHORS)) for (const key of Object.keys(C.ANCHORS[char].poses)) {
    const A = C.anchorsFor(char, key), list = C.place(char, key, eq, ART);
    assert.deepEqual(list.map(p => p.slot), ['neck', 'face', 'head'].filter(s => A[s] && !(char === 'wizard' && s === 'head')), `${char}/${key} slots`);
    for (const p of list) {
      for (const v of [p.x, p.y, p.w, p.h, p.ox, p.oy, p.rot]) assert.ok(Number.isFinite(v), `${char}/${key}/${p.slot}`);
      assert.ok(p.w > 0 && p.h > 0 && p.x > -A.fw && p.x < 2 * A.fw && p.y > -A.fh && p.y < 2 * A.fh, `${char}/${key}/${p.slot} on the sprite`);
      assert.ok(Math.abs(p.rot) <= 45, `${char}/${key}/${p.slot} tilt`);
    }
  }
  assert.equal(C.place('wizard', 'frog', eq, ART).length, 0, 'nothing on the frog');
  assert.equal(C.place('wizard', 'sleep', eq, ART).length, 0, 'nothing on the sleeping wizard');
  assert.equal(C.place('blob', 'back', eq, ART).some(p => p.slot === 'face'), false, 'no glasses on a back turned to us');
  assert.equal(C.place('hero', 'idle', { head: 'bow_tie' }, ART).length, 0, 'an item in the wrong slot is ignored');
  // pixel buddies are drawn 1:1 so the art stays crisp: Captain Cram and Merlo use whole-pixel scale
  for (const char of ['hero', 'wizard']) for (const key of Object.keys(C.ANCHORS[char].poses)) for (const p of C.place(char, key, eq, ART)) assert.equal(p.h, ART[p.id].h, `${char}/${key}/${p.slot} 1:1`);
});

test('buy: deducts the price, owns the item, refuses unknown / owned / unaffordable ids (nothing changes on a refusal)', () => {
  const eco = createEconomy(false), s = rich({ sparks: 5000 });
  const r = W.buyCosmetic(s, 'beanie', eco);
  assert.ok(r.ok); assert.equal(r.patch.sparks, 3000); assert.deepEqual(r.patch.cosmetics.owned, ['beanie']);
  assert.deepEqual(s.cosmetics.owned, [], 'input state is not mutated');
  const s2 = { ...s, ...r.patch };
  assert.deepEqual(W.buyCosmetic(s2, 'beanie', eco), { ok: false, reason: 'owned' });
  assert.deepEqual(W.buyCosmetic(s2, 'crown', eco), { ok: false, reason: 'poor', cost: 40000 });
  for (const bad of ['nope', '', null, undefined, 7, {}, ['crown']]) assert.equal(W.buyCosmetic(s2, bad, eco).ok, false);
  assert.equal(W.buyCosmetic(rich({ sparks: 2000 }), 'blush', eco).patch.sparks, 0, 'exact price is affordable');
});

test('buy: dev builds keep infinite Sparks (the balance never moves)', () => {
  const r = W.buyCosmetic(rich({ sparks: 5 }), 'crown', createEconomy(true));
  assert.ok(r.ok); assert.equal(r.patch.sparks, 5);
});

test('equip: needs an owned buddy, an owned item, the right slot and a buddy that can wear it; null takes it off', () => {
  const eco = createEconomy(true);
  let s = rich(); for (const id of ['crown', 'round_glasses', 'bow_tie', 'top_hat']) s = { ...s, ...W.buyCosmetic(s, id, eco).patch };
  const eq = (c, slot, id) => W.equipCosmetic(s, c, slot, id);
  const apply = (r) => { assert.ok(r.ok, JSON.stringify(r)); s = { ...s, ...r.patch }; };
  apply(eq('cat', 'head', 'crown')); apply(eq('cat', 'face', 'round_glasses')); apply(eq('cat', 'neck', 'bow_tie'));
  assert.deepEqual(s.cosmetics.equipped, { cat: { head: 'crown', face: 'round_glasses', neck: 'bow_tie' } });
  apply(eq('cat', 'head', 'top_hat')); assert.equal(s.cosmetics.equipped.cat.head, 'top_hat', 'one item per slot: the new hat replaces the crown');
  apply(eq('blob', 'face', 'round_glasses')); assert.equal(s.cosmetics.equipped.blob.face, 'round_glasses'); assert.equal(s.cosmetics.equipped.cat.face, 'round_glasses', 'items are shared across buddies');
  apply(eq('cat', 'head', null)); assert.equal(s.cosmetics.equipped.cat.head, undefined);
  apply(eq('cat', 'face', '')); apply(eq('cat', 'neck', null)); assert.equal(s.cosmetics.equipped.cat, undefined, 'an empty outfit is dropped');
  assert.equal(eq('wizard', 'head', 'crown').reason, 'cannotwear'); assert.equal(eq('wizard', 'neck', 'bow_tie').ok, true);
  assert.equal(eq('ghost', 'head', 'crown').reason, 'unowned', 'buddy not owned'); assert.equal(eq('dragon', 'head', 'crown').reason, 'unowned');
  assert.equal(eq('cat', 'head', 'beanie').reason, 'notowned'); assert.equal(eq('cat', 'head', 'nope').reason, 'unknown');
  assert.equal(eq('cat', 'face', 'crown').reason, 'slot'); assert.equal(eq('cat', 'hat', 'crown').reason, 'slot');
  for (const bad of [7, {}, ['crown']]) assert.equal(eq('cat', 'head', bad).ok, false);
});

test('normalize: the old empty {} and junk become a clean shape; stale or illegal equips are dropped', () => {
  assert.deepEqual(W.normalizeCosmetics({}), { owned: [], equipped: {} });
  for (const junk of [null, undefined, 5, 'x', [], { owned: 'crown', equipped: [] }]) assert.deepEqual(W.normalizeCosmetics(junk), { owned: [], equipped: {} });
  const n = W.normalizeCosmetics({ owned: ['crown', 'crown', 'ghost-hat', 7, 'bow_tie'], equipped: {
    cat: { head: 'crown', face: 'crown', neck: 'scarf' }, wizard: { head: 'crown', neck: 'bow_tie' }, dragon: { head: 'crown' }, blob: 'hat' } });
  assert.deepEqual(n.owned, ['crown', 'bow_tie']);
  assert.deepEqual(n.equipped, { cat: { head: 'crown' }, wizard: { neck: 'bow_tie' } }, 'wrong slot, unowned item, Merlo head item and unknown buddy all dropped');
});

// ---- the real store: migration and surviving a restart ----
function loadStore(dir) {
  const orig = Module._load;
  Module._load = function (req, ...a) { return req === 'electron' ? { app: { getPath: () => dir } } : orig.call(this, req, ...a); };
  try { delete require.cache[require.resolve('../src/main/store')]; return require('../src/main/store'); } finally { Module._load = orig; }
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sb-wardrobe-'));

test('store: DEFAULTS carry the new shape and a save with the old empty cosmetics {} migrates to it', () => {
  assert.deepEqual(cat.DEFAULTS.cosmetics, { owned: [], equipped: {} });
  const dir = tmp();
  try {
    fs.writeFileSync(path.join(dir, 'buddy-save.json'), JSON.stringify({ version: 6, sparks: 9, owned: ['blob'], active: 'blob', cosmetics: {}, settings: {} }));
    const store = loadStore(dir); store.load();
    assert.deepEqual(store.get().cosmetics, { owned: [], equipped: {} });
    fs.writeFileSync(path.join(dir, 'buddy-save.json'), JSON.stringify({ version: 6, sparks: 9, owned: ['blob'], active: 'blob', cosmetics: { owned: ['crown', 'zzz'], equipped: { blob: { head: 'crown', face: 'zzz' } } } }));
    const again = loadStore(dir); again.load();
    assert.deepEqual(again.get().cosmetics, { owned: ['crown'], equipped: { blob: { head: 'crown' } } });
    fs.rmSync(path.join(dir, 'buddy-save.json'));
    const fresh = loadStore(dir); fresh.load(); assert.deepEqual(fresh.get().cosmetics, { owned: [], equipped: {} }, 'brand new save');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('store: buy deducts Sparks and equip (including taking an item off) persist across a restart', () => {
  const dir = tmp(), eco = createEconomy(false);
  try {
    const store = loadStore(dir); store.load();
    store.set({ sparks: 10000, owned: ['blob', 'cat'] });
    const apply = (r) => { assert.ok(r.ok, JSON.stringify(r)); store.replace({ ...store.get(), ...r.patch }); };   // exactly what the IPC handlers do
    apply(W.buyCosmetic(store.get(), 'party_hat', eco)); apply(W.buyCosmetic(store.get(), 'bow_tie', eco));
    assert.equal(store.get().sparks, 10000 - 3000 - 3000);
    apply(W.equipCosmetic(store.get(), 'cat', 'head', 'party_hat')); apply(W.equipCosmetic(store.get(), 'cat', 'neck', 'bow_tie')); apply(W.equipCosmetic(store.get(), 'blob', 'neck', 'bow_tie'));
    apply(W.equipCosmetic(store.get(), 'cat', 'neck', null));
    store.saveNow();
    const again = loadStore(dir); again.load();
    assert.equal(again.get().sparks, 4000);
    assert.deepEqual(again.get().cosmetics, { owned: ['party_hat', 'bow_tie'], equipped: { cat: { head: 'party_hat' }, blob: { neck: 'bow_tie' } } });
    assert.deepEqual(W.buyCosmetic(again.get(), 'party_hat', eco), { ok: false, reason: 'owned' }, 'ownership survived');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('wiring: main exposes buy/equip over IPC, preload bridges them, the renderer and settings load the Wardrobe scripts', () => {
  const main = read('src/main/main.js'), pre = read('src/main/preload.js');
  assert.ok(/ipcMain\.handle\('cosmetic:buy'/.test(main) && /ipcMain\.handle\('cosmetic:equip'/.test(main) && /economy/.test(main.slice(main.indexOf("'cosmetic:buy'"), main.indexOf("'cosmetic:buy'") + 200)));
  assert.ok(/buyCosmetic:.*cosmetic:buy/.test(pre) && /equipCosmetic:.*cosmetic:equip/.test(pre));
  assert.ok(/cosmeticCatalog: COSMETICS/.test(main));
  const idx = read('src/renderer/index.html'); assert.ok(idx.indexOf('art-cosmetics.js') > 0 && idx.indexOf('cosmetics.js') > 0 && idx.indexOf('cosmetics.js') < idx.indexOf('app.js'));
  const set = read('src/settings/settings.html'); assert.ok(/data-tab="wardrobe"/.test(set) && /id="wardrobeRoot"/.test(set) && /wardrobe\.js/.test(set));
  assert.ok(!/[–—]/.test(read('src/settings/wardrobe.js')), 'no em or en dashes in user-facing text');
});

'use strict';
// Verification sheet for the Wardrobe: every buddy x every sprite frame it can show, wearing one item per slot, drawn with the
// SAME anchor table + placement code the app uses (src/renderer/cosmetics.js). This script computes the placements headlessly
// and scripts/wardrobe_check.py rasterises them onto the real art.
//   node scripts/wardrobe_check.js [char ...]      (run from the repo root; optional buddy filter)
// Output: graphify-out/wardrobe-check.png (+ wardrobe-placements.json). Four outfits (A to D) per buddy, one block of frames each.
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const sandbox = { window: {} }; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('src/renderer/art-cosmetics.js'), sandbox);
const C = require('../src/renderer/cosmetics.js');
const art = sandbox.window.COSMETIC_ART;

const artKeys = (f) => [...read(f).matchAll(/^\s*(\w+)\s*:\s*"data:image\/png/gm)].map(m => m[1]);
const FRAMES = {
  blob: ['front', 'back'], ghost: ['front', 'back'],
  cat: [...artKeys('src/renderer/art-cat.js'), ...artKeys('src/renderer/art-cat-mischief.js')],
  hero: artKeys('src/renderer/art-hero.js'), wizard: artKeys('src/renderer/art-wizard.js'),
};
const SETS = { A: { head: 'grad_cap', face: 'round_glasses', neck: 'bow_tie' }, B: { head: 'crown', face: 'star_shades', neck: 'gold_medal' },
               C: { head: 'frog_hat', face: 'monocle', neck: 'scarf' }, D: { head: 'party_hat', face: 'blush', neck: 'gold_medal' } };
const out = {};
for (const [char, keys] of Object.entries(FRAMES)) {
  out[char] = [];
  for (const key of keys) {
    const A = C.anchorsFor(char, key);
    for (const [name, eq] of Object.entries(SETS)) out[char].push({ key, set: name, fw: A ? A.fw : 0, fh: A ? A.fh : 0, items: C.place(char, key, eq, art) });
  }
}
const dir = path.join(ROOT, 'graphify-out'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'wardrobe-placements.json'), JSON.stringify({ items: Object.fromEntries(Object.entries(art).map(([k, v]) => [k, v.src])), placements: out }));
const r = cp.spawnSync('python', [path.join(__dirname, 'wardrobe_check.py'), ...process.argv.slice(2)], { cwd: ROOT, stdio: 'inherit' });
process.exit(r.status || 0);

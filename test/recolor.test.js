'use strict';
// Clothes colours of the pixel buddies (src/shared/recolor.js): every swatch gives a distinct, honest colour, and the numbers match the desktop pet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('../src/shared/recolor');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

test('wizard: original is purple, the second swatch is a real blue, and no two swatches look alike', () => {
  const pal = R.paletteFor('wizard'); assert.equal(pal[0], 0); assert.equal(new Set(pal).size, pal.length);
  const hues = pal.map(v => R.hueOf(...R.mainColor('wizard', v)));
  assert.ok(hueDist(hues[0], 255) < 6, 'original robe is purple: ' + hues[0]);
  assert.ok(hueDist(hues[1], 205) < 6, 'second swatch is blue: ' + hues[1]);
  for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) assert.ok(hueDist(hues[i], hues[j]) >= 30, `swatches ${pal[i]} and ${pal[j]} look alike (${hues[i].toFixed(0)} vs ${hues[j].toFixed(0)})`);
});

test('hero: original is blue and every swatch is distinct', () => {
  const pal = R.paletteFor('hero'), hues = pal.map(v => R.hueOf(...R.mainColor('hero', v)));
  assert.ok(hueDist(hues[0], 219) < 8);
  for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) assert.ok(hueDist(hues[i], hues[j]) >= 25, pal[i] + ' vs ' + pal[j]);
});

test('swatch style shows the colour the buddy really gets', () => {
  assert.equal(R.swatchStyle('wizard', 0), 'background:rgb(84,58,164)');
  assert.equal(R.swatchStyle('wizard', 360), 'background:#2fa8ff');
  assert.equal(R.swatchStyle('wizard', 90), 'background:#2fa8ff;filter:hue-rotate(90deg)');
  assert.equal(R.swatchStyle('blob', 0), 'background:#2fa8ff'); assert.equal(R.swatchStyle('blob', 45), 'background:#2fa8ff;filter:hue-rotate(45deg)');
});

test('recolorPixels turns only the clothes palette; skin, transparency and non-recolour buddies are untouched', () => {
  const px = new Uint8ClampedArray([84, 58, 164, 255, 240, 200, 170, 255, 84, 58, 164, 0, 62, 46, 140, 255]);
  R.recolorPixels(px, 'wizard', 360);
  const main = R.mainColor('wizard', 360); assert.deepEqual([...px.slice(0, 3)], main); assert.ok(main[2] > main[0] && hueDist(R.hueOf(...main), 205) < 6);
  assert.deepEqual([...px.slice(4, 8)], [240, 200, 170, 255]); assert.deepEqual([...px.slice(8, 12)], [84, 58, 164, 0]);
  assert.notDeepEqual([...px.slice(12, 15)], [62, 46, 140]);
  const same = new Uint8ClampedArray([84, 58, 164, 255]); R.recolorPixels(same, 'wizard', 0); assert.deepEqual([...same], [84, 58, 164, 255]);
  R.recolorPixels(same, 'blob', 90); assert.deepEqual([...same], [84, 58, 164, 255]);
  assert.equal(R.shiftFor('blob', 90), 0); assert.equal(R.has('cat'), false);
});

test('same numbers as the desktop pet (src/renderer/app.js), and the value 360 survives main.js setColor', () => {
  const app = read('src/renderer/app.js').replace(/\s+/g, '');
  assert.ok(app.includes('RECOLOR={wizard:' + JSON.stringify(R.RECOLOR.wizard) + ',hero:' + JSON.stringify(R.RECOLOR.hero) + '}'));
  assert.ok(app.includes('SW_HUE=' + R.SW_HUE + ',MAIN_RGB={wizard:' + JSON.stringify(R.MAIN_RGB.wizard) + ',hero:' + JSON.stringify(R.MAIN_RGB.hero) + '}'));
  assert.ok(app.includes("Math.round(SW_HUE+h0-hueOf(...MAIN_RGB[curChar]))"));
  assert.ok(read('src/main/main.js').includes('Math.max(0, Math.min(360, Math.round(Number(val))))'));
  assert.ok(/shared\/recolor\.js/.test(read('src/settings/settings.html')));
});

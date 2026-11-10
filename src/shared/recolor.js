// Clothes recolouring for the pixel buddies (Merlo, Captain Cram): the colour picked in Customise turns only the CLOTHES palette,
// never skin, beard, gold trim or eyes. The desktop pet does this in src/renderer/app.js (texFor); this module holds the same numbers
// and maths for the Settings window (swatches + preview), and test/recolor.test.js keeps the two in step.
// Works as a CommonJS module (tests) and as window.Recolor (script tag).
(function (root) {
  'use strict';
  const RECOLOR = { wizard: [[62, 46, 140], [38, 28, 96], [104, 86, 186], [84, 58, 164], [52, 36, 112]],
                    hero: [[47, 107, 216], [31, 69, 160], [110, 168, 255], [214, 40, 57], [142, 21, 38], [255, 90, 106]] };
  const MAIN_RGB = { wizard: [84, 58, 164], hero: [47, 107, 216] };
  const SW_HUE = 205, SWBASE = '#2fa8ff';   // the swatch base colour and its hue
  const PALETTE = [0, 45, 90, 140, 190, 250, 300];
  // Merlo's own robe is purple (hue ~255). The 45 swatch (hue 250) was purple again, so he had two purples and no blue, and the
  // "original" swatch was drawn blue. His second swatch is 360 instead: a full turn of the swatch (blue) that is not the value 0 (original).
  const PALETTE_BY = { wizard: [0, 360, 90, 140, 190, 250, 300] };

  function hueOf(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0;
    const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4); return h * 60; }
  function rotHue(r, g, b, deg) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let h = 0, sat = 0;
    if (d) { sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4); h *= 60; }
    h = ((h + deg) % 360 + 360) % 360; const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, pp = 2 * l - q, f = (t) => { t = (t % 1 + 1) % 1; return t < 1 / 6 ? pp + (q - pp) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? pp + (q - pp) * (2 / 3 - t) * 6 : pp; };
    const k = h / 360; return [Math.round(f(k + 1 / 3) * 255), Math.round(f(k) * 255), Math.round(f(k - 1 / 3) * 255)]; }

  const has = (id) => !!RECOLOR[id];
  const paletteFor = (id) => PALETTE_BY[id] || PALETTE;
  // degrees the clothes turn for a stored colour value (0 = original, untouched)
  const shiftFor = (id, v) => (has(id) && v ? Math.round(SW_HUE + v - hueOf(...MAIN_RGB[id])) : 0);
  // the main clothes colour a value gives, as [r, g, b]
  const mainColor = (id, v) => (has(id) ? (v ? rotHue(...MAIN_RGB[id], shiftFor(id, v)) : MAIN_RGB[id].slice()) : null);
  // inline style for a swatch button: the colour the buddy will really get
  function swatchStyle(id, v) {
    if (has(id) && !v) return 'background:rgb(' + MAIN_RGB[id].join(',') + ')';   // "original" shows the buddy's own colour, not the base blue
    return 'background:' + SWBASE + (v % 360 ? ';filter:hue-rotate(' + v + 'deg)' : '');
  }
  // RGBA pixel data (Uint8ClampedArray) recoloured in place
  function recolorPixels(px, id, v) {
    const set = RECOLOR[id], h = shiftFor(id, v); if (!set || !h) return px;
    const map = new Map(set.map(([r, g, b]) => [(r << 16) | (g << 8) | b, rotHue(r, g, b, h)]));
    for (let i = 0; i < px.length; i += 4) { if (!px[i + 3]) continue; const m = map.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]); if (m) { px[i] = m[0]; px[i + 1] = m[1]; px[i + 2] = m[2]; } }
    return px;
  }
  const api = { RECOLOR, MAIN_RGB, SW_HUE, SWBASE, PALETTE, has, paletteFor, shiftFor, mainColor, swatchStyle, recolorPixels, hueOf, rotHue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Recolor = api;
})(typeof window !== 'undefined' ? window : this);

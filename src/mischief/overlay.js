/* Overlay page: one per prank, per display. Receives the captured crops (in memory, as data URLs that die with this window),
   covers each target with a patch sampled from around it, then animates the crop as a prop. Closing this window IS the restore. */
(function () {
  'use strict';
  const cv = document.getElementById('c'), g = cv.getContext('2d'), K = window.MKIT, G = window.GAGS.G;
  let scene = null, T = {}, raf = 0, startAt = 0, running = false;
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  // patch: blend of the four edge strips just outside the target (inverse-distance weights): reads as "what was behind it"
  function makePatch(img, c) {
    const pw = img.width, ph = img.height, w = pw - c.padL - c.padR, h = ph - c.padT - c.padB;
    const src = document.createElement('canvas'); src.width = pw; src.height = ph; const sx = src.getContext('2d', { willReadFrequently: true }); sx.drawImage(img, 0, 0);
    const d = sx.getImageData(0, 0, pw, ph).data, out = document.createElement('canvas'); out.width = w; out.height = h;
    const ox = out.getContext('2d'), od = ox.createImageData(w, h), px = (x, y) => { const i = (y * pw + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const avg = (pts) => { const a = [0, 0, 0]; for (const p of pts) { const v = px(p[0], p[1]); a[0] += v[0]; a[1] += v[1]; a[2] += v[2]; } return a.map(q => q / pts.length); };
    const L = [], R = [], Tt = [], B = [];
    for (let y = 0; y < h; y++) { const yy = c.padT + y; L.push(c.padL > 0 ? avg([[c.padL - 1, yy], [Math.max(0, c.padL - 2), yy]]) : null); R.push(c.padR > 0 ? avg([[c.padL + w, yy], [Math.min(pw - 1, c.padL + w + 1), yy]]) : null); }
    for (let x = 0; x < w; x++) { const xx = c.padL + x; Tt.push(c.padT > 0 ? avg([[xx, c.padT - 1], [xx, Math.max(0, c.padT - 2)]]) : null); B.push(c.padB > 0 ? avg([[xx, c.padT + h], [xx, Math.min(ph - 1, c.padT + h + 1)]]) : null); }
    let lum = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cs = [[L[y], 1 / ((x + 1) * (x + 1))], [R[y], 1 / ((w - x) * (w - x))], [Tt[x], 1 / ((y + 1) * (y + 1))], [B[x], 1 / ((h - y) * (h - y))]]; let r = 0, gg = 0, b = 0, ws = 0;
      for (const [v, wt] of cs) if (v) { r += v[0] * wt; gg += v[1] * wt; b += v[2] * wt; ws += wt; }
      const i = (y * w + x) * 4; od.data[i] = r / (ws || 1); od.data[i + 1] = gg / (ws || 1); od.data[i + 2] = b / (ws || 1); od.data[i + 3] = 255; lum += (0.2126 * od.data[i] + 0.7152 * od.data[i + 1] + 0.0722 * od.data[i + 2]) / 255;
    }
    ox.putImageData(od, 0, 0);
    const exact = document.createElement('canvas'); exact.width = w; exact.height = h; exact.getContext('2d').drawImage(img, -c.padL, -c.padT);
    return { patch: out, img: exact, lum: lum / (w * h) };
  }

  function paint(t) {
    const plan = scene.plan, gag = G[plan.id], tf = (gag.tf && gag.tf(t, plan)) || {};
    g.clearRect(scene.ox, scene.oy, scene.w, scene.h);
    for (const k of Object.keys(T)) g.drawImage(T[k].patch, T[k].rect.x, T[k].rect.y, T[k].rect.w, T[k].rect.h);       // 1. cover the real thing
    if (gag.under) gag.under(g, t, plan, K, T);                                                                             // 2. holes etc.
    for (const k of Object.keys(T)) { const o = tf[k] || {}; if (!o.hide) K.crop(g, T[k], o); }                              // 3. the crop as a prop
    if (gag.over) gag.over(g, t, plan, K, T);                                                                               // 4. props
  }
  function frame() {
    if (!running) return;
    try { paint(Math.max(0, Date.now() - startAt)); } catch (e) { running = false; window.mischief.error('draw: ' + (e && e.message)); return; }
    raf = requestAnimationFrame(frame);
  }
  window.mischief.onScene(async (s) => {
    try {
      scene = s; const dpr = Math.max(1, window.devicePixelRatio || 1);
      cv.width = Math.round(s.w * dpr); cv.height = Math.round(s.h * dpr); g.setTransform(dpr, 0, 0, dpr, -s.ox * dpr, -s.oy * dpr); g.imageSmoothingEnabled = true;
      for (const k of Object.keys(s.crops)) { const c = s.crops[k], img = await load(c.png), m = makePatch(img, c); T[k] = { rect: c.rect, img: m.img, patch: m.patch, lum: m.lum }; c.png = null; }
      paint(0); window.mischief.ready();
    } catch (e) { window.mischief.error('scene: ' + (e && e.message)); }
  });
  window.mischief.onGo((o) => { startAt = o.startAt; running = true; raf = requestAnimationFrame(frame); });
})();

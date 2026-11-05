/* Drawing kit for the mischief overlay: crisp pixel-style props painted on a 2D canvas (UMD; the node test drives it with a recording context). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.MKIT = factory(); })(this, function () {
  'use strict';
  const cl = (v, a, b) => Math.max(a, Math.min(b, v)), hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const U = 3;                                   // one prop "pixel"
  const snap = (v) => Math.round(v / U) * U;
  const K = {};
  K.px = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(snap(x), snap(y), Math.max(U, snap(w)), Math.max(U, snap(h))); };
  K.text = (g, s, x, y, size, fill, stroke, alpha, font) => {
    g.save(); g.globalAlpha = alpha == null ? 1 : alpha; g.font = '800 ' + size + 'px ' + (font === 'ui' ? '"Segoe UI Variable","Segoe UI",sans-serif' : '"Courier New",monospace'); g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) { g.lineWidth = Math.max(2, size / 6); g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(s, x, y); }
    g.fillStyle = fill; g.fillText(s, x, y); g.restore();
  };
  K.line = (g, x0, y0, x1, y1, w, c, sag) => {
    g.save(); g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0);
    if (sag) g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 10, x1, y1); else g.lineTo(x1, y1); g.stroke(); g.restore();
  };
  // the captured crop, drawn with a transform about an optional pivot (offset from the rect centre)
  K.crop = (g, tg, o) => {
    o = o || {}; if (o.hide) return; const r = tg.rect, pv = o.pv || [0, 0], cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    g.save(); g.globalAlpha = o.a == null ? 1 : o.a; g.translate(cx + pv[0] + (o.dx || 0), cy + pv[1] + (o.dy || 0)); g.rotate(o.rot || 0); g.scale(o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy);
    g.drawImage(tg.img, -r.w / 2 - pv[0], -r.h / 2 - pv[1], r.w, r.h); g.restore();
  };
  // the crop stretched like taffy between two points (the rubber band)
  K.stretch = (g, tg, ax, ay, bx, by, thick, alpha) => {
    const r = tg.rect, len = Math.hypot(bx - ax, by - ay) + r.w * 0.5, ang = Math.atan2(by - ay, bx - ax);
    g.save(); g.globalAlpha = alpha == null ? 0.6 : alpha; g.translate((ax + bx) / 2, (ay + by) / 2); g.rotate(ang); g.drawImage(tg.img, -len / 2, -r.h * thick / 2, len, r.h * thick); g.restore();
    g.save(); g.globalAlpha = (alpha == null ? 0.6 : alpha) * 0.7; g.strokeStyle = '#f2b84b'; g.lineWidth = Math.max(1.5, r.h * thick * 0.18); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.restore();
  };
  K.flash = (g, r, c, a) => { g.save(); g.globalAlpha = cl(a, 0, 1); g.fillStyle = c; g.fillRect(r.x, r.y, r.w, r.h); g.restore(); };
  K.burst = (g, x, y, k, n, rad, c) => {
    g.save(); g.globalAlpha = 1 - cl(k, 0, 1); g.fillStyle = c;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + hash(i) * 0.6, d = rad * (0.3 + 0.7 * Math.sqrt(k)) * (0.8 + hash(i + 5) * 0.4); g.fillRect(snap(x + Math.cos(a) * d), snap(y + Math.sin(a) * d), U, U); }
    g.restore();
  };
  K.sparks = (g, x, y, secs, n, rad) => {
    g.save();
    for (let i = 0; i < n; i++) { const ph = (secs * 2.2 + hash(i)) % 1, a = hash(i + 3) * 6.283, d = rad * ph; g.globalAlpha = 1 - ph; g.fillStyle = i % 2 ? '#ffe14d' : '#ffffff'; g.fillRect(snap(x + Math.cos(a) * d), snap(y + Math.sin(a) * d - ph * 10), U, U); }
    g.restore();
  };
  K.bolt = (g, x0, y0, x1, y1, seed, w) => {
    const n = 7; g.save(); g.lineJoin = 'miter'; g.lineCap = 'butt';
    for (const [c, ww] of [['#ffb300', w + 3], ['#fff6a0', w]]) { g.strokeStyle = c; g.lineWidth = ww; g.beginPath(); g.moveTo(x0, y0);
      for (let i = 1; i < n; i++) { const k = i / n; g.lineTo(x0 + (x1 - x0) * k + (hash(seed * 9 + i) - 0.5) * 22, y0 + (y1 - y0) * k + (hash(seed * 5 + i) - 0.5) * 12); }
      g.lineTo(x1, y1); g.stroke(); }
    g.restore();
  };
  K.hole = (g, r, k) => {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2; g.save(); g.fillStyle = '#0a0a0e'; g.beginPath(); g.ellipse(cx, cy, r.w * 0.5 * k, r.h * 0.34 * k, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#5b5f6b'; g.lineWidth = 3; g.stroke(); g.restore();
  };
  K.arc = (g, x, y, rad, a, c) => { g.save(); g.globalAlpha = cl(a, 0, 1); g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.arc(x, y, rad, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(x, y, rad * 1.7, -0.7, 0.7); g.stroke(); g.restore(); };
  K.rod = (g, bx, by, tx, ty, bend) => {
    g.save(); g.strokeStyle = '#6b3f1d'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo((bx + tx) / 2 + bend * 28, (by + ty) / 2 + bend * 28, tx + bend * 18, ty + bend * 30); g.stroke();
    g.fillStyle = '#c9a15a'; g.fillRect(snap(bx - 3), snap(by - 3), 9, 9); g.restore();
  };
  K.broom = (g, x, y, dir, ang, S) => {
    g.save(); g.translate(x, y); g.rotate(ang * dir); const L = Math.max(34, S * 0.9);
    g.fillStyle = '#8a5a2b'; g.fillRect(-1.5, -L, 3, L);
    g.fillStyle = '#e0b84c'; g.fillRect(-9, -2, 18, 9); g.fillStyle = '#b8902e'; for (let i = -8; i < 9; i += 4) g.fillRect(i, 2, 2, 9); g.restore();
  };
  K.dust = (g, x, y, t) => { g.save(); for (let i = 0; i < 4; i++) { const ph = ((t / 500) + i / 4) % 1; g.globalAlpha = 0.6 * (1 - ph); g.fillStyle = '#d8d2c4'; g.fillRect(snap(x - ph * 30 - 4), snap(y - ph * 12 + hash(i) * 6), U, U); } g.restore(); };
  // page curl: reveals paper under a corner and folds the flap back (fold line x'+y' = D, in rect space)
  K.curl = (g, tg, k) => {
    const r = tg.rect, w = r.w, h = r.h;
    if (k <= 0.004) { K.crop(g, tg, {}); return; }
    const D = k * (w + h) * 0.85, pts = [[0, 0], [Math.min(D, w), 0]]; if (D > w) pts.push([w, D - w]); if (D > h) pts.push([D - h, h]); pts.push([0, Math.min(D, h)]);
    const tri = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
    g.save(); g.translate(r.x, r.y);
    g.save(); tri(); g.clip(); g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, w, h); g.fillStyle = '#cfc8b4'; for (let i = 0; i < 6; i++) g.fillRect(8 + i * 22, 10 + (i % 3) * 9, 10, 3);
    const gr = g.createLinearGradient(D / 2, D / 2, 0, 0); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(0.4, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.restore();
    g.save(); g.beginPath(); g.rect(0, 0, w, h); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.clip('evenodd'); g.drawImage(tg.img, 0, 0, w, h); g.restore();
    g.save(); tri(); g.clip(); g.transform(0, -1, -1, 0, D, D); g.drawImage(tg.img, 0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, 0, w, h);
    const sh = g.createLinearGradient(0, 0, w, h); sh.addColorStop(0, 'rgba(0,0,0,.25)'); sh.addColorStop(1, 'rgba(255,255,255,.2)'); g.fillStyle = sh; g.fillRect(0, 0, w, h); g.restore();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(Math.min(D, w), D > w ? D - w : 0); g.lineTo(D > h ? D - h : 0, Math.min(D, h)); g.stroke(); g.restore();
  };
  K.hammer = (g, x, y, rot) => { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = '#7b4a22'; g.fillRect(-2, -4, 5, 22); g.fillStyle = '#9aa3b2'; g.fillRect(-11, -14, 22, 12); g.fillStyle = '#c8d0dc'; g.fillRect(-11, -14, 22, 4); g.restore(); };
  K.crack = (g, x, y, grow, seed, radius) => {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; const arms = 9;
    for (const [c, w] of [['rgba(0,0,0,.45)', 4], ['rgba(255,255,255,.95)', 2]]) {
      g.strokeStyle = c; g.lineWidth = w; g.beginPath();
      for (let a = 0; a < arms; a++) { let ang = (a / arms) * 6.283 + hash(seed + a) * 0.5, px = x, py = y, len = radius * (0.35 + 0.65 * hash(seed + a * 3)) * grow; g.moveTo(px, py);
        const segs = 6; for (let s = 1; s <= segs; s++) { ang += (hash(seed * 7 + a * 11 + s) - 0.5) * 0.9; const d = len / segs; px += Math.cos(ang) * d; py += Math.sin(ang) * d; g.lineTo(px, py);
          if (s === 3 && hash(seed + a * 2) > 0.4) { g.moveTo(px, py); g.lineTo(px + Math.cos(ang + 0.9) * len * 0.3, py + Math.sin(ang + 0.9) * len * 0.3); g.moveTo(px, py); } } }
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 3; i++) g.fillRect(x - 3 + (i - 1) * 7, y - 3, 5, 5); g.restore();
  };
  K.bandage = (g, x, y, rot, scale, alpha) => {
    g.save(); g.globalAlpha = cl(alpha, 0, 1); g.translate(x, y); g.rotate(rot); g.scale(scale, scale);
    g.fillStyle = '#e9b98c'; g.fillRect(-30, -9, 60, 18); g.fillStyle = '#d99f6e'; g.fillRect(-30, 6, 60, 3);
    g.fillStyle = '#f6dcc0'; g.fillRect(-10, -9, 20, 18); g.fillStyle = '#d9b48b'; for (let i = -6; i <= 6; i += 6) g.fillRect(i - 1, -4, 3, 3), g.fillRect(i - 1, 2, 3, 3);
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.strokeRect(-30, -9, 60, 18); g.restore();
  };
  K.note = (g, x, y, rot, scale, alpha, peel) => {
    g.save(); g.globalAlpha = cl(alpha, 0, 1); g.translate(x, y); g.rotate(rot); g.scale(scale, scale);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-58, -48, 120, 108); g.fillStyle = '#ffe66b'; g.fillRect(-60, -52, 120, 108); g.fillStyle = '#f7d544'; g.fillRect(-60, 44, 120, 12);
    g.fillStyle = '#fff3a8'; g.fillRect(-60, -52, 120, 14);
    if (peel > 0.02) { g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.moveTo(60, 56); g.lineTo(60 - 60 * peel, 56); g.lineTo(60, 56 - 60 * peel); g.fill(); }
    g.font = '900 28px "Segoe Print","Comic Sans MS","Courier New",monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#d6232a'; g.fillText('STUDY!', 0, 2);
    g.fillStyle = '#d6232a'; g.fillRect(-40, 20, 80, 4); g.restore();
  };
  K.moustache = (g, x, y, k, w) => {
    if (k <= 0) return; g.save(); g.translate(x, y); g.scale(k, k); const c = '#2b1a10', u = Math.max(3, Math.round(w / 12));
    const rows = [[-6, 6], [-9, 9], [-11, 11], [-12, 12], [-11, 7], [-9, 5]];
    g.fillStyle = c; rows.forEach((r, i) => { g.fillRect(r[0] * u / 2 * 1, i * u - 2 * u, (r[1] - r[0]) * u / 2, u); });
    g.fillRect(-13 * u / 2, -3 * u, u, u); g.fillRect(12 * u / 2 - u, -3 * u, u, u); g.fillStyle = '#4a2f1d'; g.fillRect(-4 * u / 2, -2 * u, 8 * u / 2, u / 2); g.restore();
  };
  K.clipRect = (g, x, y, w, h, fn) => { g.save(); g.beginPath(); g.rect(x, y, Math.max(0, w), h); g.clip(); fn(); g.restore(); };
  return K;
});

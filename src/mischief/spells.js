/* Merlo's spells: big screen-wide gags for the legendary wizard buddy. UMD, loaded by the main process (planning, sprite script) and the overlay page (drawing),
   exactly like gags.js, and played by the same manager. Every spell is a pure function of time. find() is null unless env.char === 'wizard'.
   Targetless spells (portal, cauldron, weather, conjure) capture nothing; the targeted ones (fireball, levitate) animate a captured crop like the other gags.
   Sprite keyframes may carry sc (0.3..1), hue (deg) and alpha (0..1): a key's value holds at the START of its segment and eases to the next key's value (Seq.set is sticky).
   Art: window.SPELL_IMG (loaded from SPELL_ART by overlay.js). Every prop has a plain-shape fallback, so a missing image never breaks a draw. Units: DIP, ms, global desktop coordinates. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./gags')); else root.SPELLS = factory(root.GAGS); })(this, function (GAGS) {
  'use strict';
  const { Seq, spriteOf, kit: Q, helpers: H } = GAGS, { cl, lerp, sm, seg, spring, hash, ctr } = H, TAU = Math.PI * 2, base = Q.base;
  const isW = (e) => !!e && e.char === 'wizard', rnd = (e) => (e && e.rand) || Math.random, pick = (R, a) => a[Math.min(a.length - 1, Math.floor(R() * a.length))];
  const pulse = (t, a, d, b, e) => sm(seg(t, a, a + d)) * (1 - sm(seg(t, b, b + (e || d))));   // 0 -> 1 from a over d, back to 0 from b over e
  const hand = (sp, S, f) => ({ x: sp.x + S / 2 + f * S * 0.45, y: sp.y + S * 0.42 }), hat = (sp, S) => ({ x: sp.x + S / 2, y: sp.y + S * 0.1 });
  const POTS = ['red', 'blue', 'green', 'pink'], POT = { red: '#e5484d', blue: '#3e7bfa', green: '#3ecf6b', pink: '#ff7ad9' }, FXS = ['shrink', 'rainbow', 'vanish', 'frog'];

  // ---- art: window.SPELL_IMG[key] when present, else a plain shape in the same box
  const disc = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, TAU); g.fill(); };
  const oval = (g, x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, TAU); g.fill(); };
  const AR = { portal: 1, cauldron: 1, smoke: 1, potion: 1.33, fireball: 1, cloud: 0.5, cloud_white: 0.5, rainbow: 0.5, owl: 1, bunny: 1.25, book: 0.8, star: 1, flower: 1, frog_small: 0.75, anvil: 0.75, duck: 0.86, rune: 1 };
  const FB = {
    portal: (g, w, h, i) => { oval(g, 0, 0, w / 2, h / 2, '#2a1466'); oval(g, 0, 0, w * 0.4, h * 0.42, '#5b32d6'); oval(g, 0, 0, w * 0.27, h * 0.3, '#9a7bff'); oval(g, 0, 0, w * 0.12, h * 0.15, '#efe6ff'); g.fillStyle = '#7ff0ff'; for (let j = 0; j < 3; j++) { const a = i * 1.57 + j * 2.09; g.fillRect(Math.cos(a) * w * 0.36 - 2, Math.sin(a) * h * 0.38 - 2, 4, 4); } },
    cauldron: (g, w, h) => { oval(g, 0, h * 0.34, w * 0.4, h * 0.14, '#15151c'); g.fillStyle = '#2b2b36'; g.fillRect(-w * 0.4, -h * 0.05, w * 0.8, h * 0.4); oval(g, 0, -h * 0.05, w * 0.4, h * 0.14, '#2b2b36'); oval(g, 0, -h * 0.05, w * 0.33, h * 0.1, '#4fc36b'); },
    smoke: (g, w) => disc(g, 0, 0, w * 0.5, '#cfcfd6'),
    potion: (g, w, h, i, key) => { g.fillStyle = '#e8f2ff'; g.fillRect(-w * 0.15, -h * 0.5, w * 0.3, h * 0.25); g.fillStyle = '#a0522d'; g.fillRect(-w * 0.2, -h * 0.56, w * 0.4, h * 0.1); oval(g, 0, h * 0.12, w * 0.5, h * 0.36, '#e8f2ff'); oval(g, 0, h * 0.16, w * 0.4, h * 0.28, POT[String(key).slice(7)] || '#cc99cc'); },
    fireball: (g, w) => { disc(g, 0, 0, w * 0.5, '#ff5a1f'); disc(g, 0, 0, w * 0.34, '#ffb02e'); disc(g, 0, 0, w * 0.17, '#fff3a0'); },
    cloud: (g, w, h, i, key) => { const c = key === 'cloud_white' ? '#f4f8ff' : '#59606e'; oval(g, 0, h * 0.12, w * 0.46, h * 0.3, c); disc(g, -w * 0.22, -h * 0.05, h * 0.3, c); disc(g, w * 0.08, -h * 0.15, h * 0.38, c); disc(g, w * 0.3, 0, h * 0.25, c); },
    rainbow: (g, w, h) => { const lw = Math.max(2, h * 0.07); g.lineWidth = lw; ['#ff4d4d', '#ffa63d', '#ffe14d', '#4fd16b', '#4d8dff', '#a35cff'].forEach((c, k) => { g.strokeStyle = c; g.beginPath(); g.arc(0, h / 2, w * 0.5 - k * lw, Math.PI, TAU); g.stroke(); }); },
    owl: (g, w, h, i) => { oval(g, 0, h * 0.05, w * 0.3, h * 0.4, '#8a6a46'); disc(g, -w * 0.12, -h * 0.15, w * 0.11, '#fff'); disc(g, w * 0.12, -h * 0.15, w * 0.11, '#fff'); disc(g, -w * 0.12, -h * 0.15, w * 0.05, '#111'); disc(g, w * 0.12, -h * 0.15, w * 0.05, '#111');
      g.fillStyle = '#f2a33a'; g.fillRect(-2, -h * 0.07, 4, 4); const u = i % 2 ? -1 : 1; oval(g, -w * 0.4, u * h * 0.04, w * 0.14, h * 0.26, '#6b4f30'); oval(g, w * 0.4, u * h * 0.04, w * 0.14, h * 0.26, '#6b4f30'); },
    bunny: (g, w, h) => { oval(g, 0, h * 0.22, w * 0.36, h * 0.26, '#f4f1ee'); disc(g, w * 0.1, -h * 0.06, w * 0.24, '#f4f1ee'); oval(g, w * 0.02, -h * 0.4, w * 0.07, h * 0.2, '#f4f1ee'); oval(g, w * 0.2, -h * 0.4, w * 0.07, h * 0.2, '#f4f1ee'); disc(g, w * 0.18, -h * 0.08, 1.6, '#222'); },
    book: (g, w, h) => { g.fillStyle = '#6b3fa0'; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = '#f4ecd0'; g.fillRect(-w / 2 + 3, -h / 2 + 2, w - 6, h - 4); },
    star: (g, w) => { g.fillStyle = '#ffe14d'; g.fillRect(-w * 0.12, -w * 0.5, w * 0.24, w); g.fillRect(-w * 0.5, -w * 0.12, w, w * 0.24); g.fillStyle = '#fff6b0'; g.fillRect(-w * 0.12, -w * 0.12, w * 0.24, w * 0.24); },
    flower: (g, w) => { for (let j = 0; j < 5; j++) disc(g, Math.cos(j * 1.256) * w * 0.28, Math.sin(j * 1.256) * w * 0.28, w * 0.2, '#ff7ad9'); disc(g, 0, 0, w * 0.15, '#ffe14d'); },
    frog: (g, w, h) => { oval(g, 0, h * 0.1, w * 0.42, h * 0.34, '#4fc36b'); disc(g, -w * 0.2, -h * 0.25, w * 0.12, '#4fc36b'); disc(g, w * 0.2, -h * 0.25, w * 0.12, '#4fc36b'); disc(g, -w * 0.2, -h * 0.25, 1.5, '#111'); disc(g, w * 0.2, -h * 0.25, 1.5, '#111'); },
    anvil: (g, w, h) => { g.fillStyle = '#5d6168'; g.fillRect(-w * 0.5, -h * 0.5, w, h * 0.35); g.fillRect(-w * 0.25, -h * 0.15, w * 0.5, h * 0.3); g.fillStyle = '#42454b'; g.fillRect(-w * 0.4, h * 0.15, w * 0.8, h * 0.35); },
    duck: (g, w, h) => { oval(g, 0, h * 0.15, w * 0.42, h * 0.3, '#ffd23f'); disc(g, w * 0.25, -h * 0.18, w * 0.2, '#ffd23f'); g.fillStyle = '#ff8a1f'; g.fillRect(w * 0.4, -h * 0.15, w * 0.15, h * 0.12); disc(g, w * 0.3, -h * 0.25, 1.4, '#111'); },
    rune: (g, w, i) => { g.strokeStyle = '#d9c8ff'; g.lineWidth = Math.max(1.5, w * 0.12); g.beginPath(); if (i % 3 === 0) { g.moveTo(0, -w * 0.4); g.lineTo(0, w * 0.4); g.moveTo(-w * 0.25, -w * 0.1); g.lineTo(w * 0.25, -w * 0.1); } else if (i % 3 === 1) { g.moveTo(-w * 0.3, w * 0.4); g.lineTo(0, -w * 0.4); g.lineTo(w * 0.3, w * 0.4); } else { g.arc(0, 0, w * 0.3, 0, TAU); } g.stroke(); },
  };
  FB.frog_small = FB.frog; FB.cloud_white = FB.cloud;
  // centre cx,cy, width w (height follows the art's own aspect), o: { a alpha, rot, flip, sx, sy }. Pixel art stays crisp and the smoothing state is restored.
  function art(g, key, cx, cy, w, o) {
    o = o || {}; const a = o.a == null ? 1 : o.a; if (a <= 0.004 || w < 1) return;
    const im = (globalThis.SPELL_IMG || {})[key], b = String(key).replace(/\d+$/, '').replace(/^potion_.*/, 'potion'), h = w * (im && im.width ? im.height / im.width : AR[b] || 1);
    g.save(); g.globalAlpha = Math.min(1, a); g.translate(cx, cy); if (o.rot) g.rotate(o.rot); g.scale((o.flip ? -1 : 1) * (o.sx == null ? 1 : o.sx), o.sy == null ? 1 : o.sy);
    if (im) { g.imageSmoothingEnabled = false; g.drawImage(im, -w / 2, -h / 2, w, h); } else (FB[b] || FB[b.split('_')[0]] || FB.star)(g, w, h, +((String(key).match(/\d+$/) || [0])[0]), key);
    g.restore();
  }
  const puff = (g, t, t0, x, y, sz, n) => { const k = (t - t0) / 700, N = n || 6; if (k < 0 || k > 1) return; for (let i = 0; i < N; i++) { const a = TAU * i / N + hash(i) * 0.8, d = sz * (0.25 + 0.9 * k) * (0.7 + hash(i + 3) * 0.6); art(g, 'smoke', x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8 - k * sz * 0.4, sz * (0.5 + 0.6 * k), { a: 0.9 * (1 - k) }); } };
  const bubbles = (g, t, x, y, w, col, n, a) => { for (let i = 0; i < n; i++) { const ph = (t / 1000 * 0.85 + hash(i)) % 1; g.save(); g.globalAlpha = (1 - ph) * a; disc(g, x + (hash(i + 3) - 0.5) * w * 0.5, y - ph * w * 0.9, (3 + (i % 3) * 2) * (0.6 + ph * 0.5), col); g.restore(); } };
  const smokeUp = (g, t, x, y, S, n, a) => { for (let i = 0; i < n; i++) { const ph = (t / 1400 + i / n) % 1; art(g, 'smoke', x + (hash(i + 1) - 0.5) * S * 0.4 + Math.sin(ph * 6 + i) * S * 0.08, y - ph * S * 1.1, S * (0.22 + ph * 0.4), { a: 0.7 * (1 - ph) * a }); } };
  const stand = (p, dir, ms) => { const s = Seq(p.sx, p.sy); if (Math.abs(p.sy - p.fy) > 4) s.to(450, p.sx, p.fy, 'fall', { f: dir }); s.hold(ms == null ? 300 : ms, 'idle', { f: dir }); return s; };
  const fin = (p, s) => {   // the finish of gags.js plus every prop rectangle in the overlay area (p.pr also keeps the cursor out of the props)
    Q.finish(p, s); let x0 = p.area.x, y0 = p.area.y, x1 = x0 + p.area.w, y1 = y0 + p.area.h;
    for (const r of p.pr) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    p.area = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; return p;
  };
  const mk = (env, tg, id) => { const p = base(env, tg || {}); p.id = id; p.pr = []; return p; };
  // a spell that needs k sprites of room each side is cast where the wizard stands, or after a shuffle of a second at most (~128 px): otherwise it is not picked
  const SHUFFLE = 128, fits = (env, k) => { const S = env.S, cx = env.sx + S / 2, lo = env.wa.x0 + S * k, hi = env.wa.x1 - S * k; return hi > lo && cx >= lo - SHUFFLE && cx <= hi + SHUFFLE; };
  const sideRoom = (p) => { const cx = p.sx + p.S / 2, rr = p.wa.x1 - cx, rl = cx - p.wa.x0; return { dir: rr >= rl ? 1 : -1, room: Math.max(rr, rl), cx }; };

  // ---- targets for the two spells that act on something on screen: small and clean only. A desktop icon (preferred), else one short stretch of a single text line in
  // an allowed app window (needs the text pass like the text gag: the first find says { pending: true }). At most 4 sprites wide and 1.2 sprites high for text.
  const DMIN = (S) => Math.max(S * 2.8, 240), DMAX = 900, MAXWALK = 420;
  // where to stand: where it already is when the target is a good arc away; otherwise the nearest spot that is (never more than DMIN of walking, or the excess beyond DMAX)
  function standSpot(p, c) {
    const S = p.S, cx0 = p.sx + S / 2, dx = c.x - cx0, ad = Math.abs(dx), dmin = DMIN(S), fits = (x) => x - S / 2 >= p.wa.x0 + 4 && x + S / 2 <= p.wa.x1 - 4; let xs = cx0;
    if (ad < dmin) { const cs = [c.x - dmin, c.x + dmin].filter(fits).sort((a, b) => Math.abs(a - cx0) - Math.abs(b - cx0)); xs = cs.length ? cs[0] : cl(c.x - dmin, p.wa.x0 + S / 2 + 4, p.wa.x1 - S / 2 - 4); }
    else if (ad > DMAX) xs = c.x - Math.sign(dx) * DMAX;
    xs = cl(xs, p.wa.x0 + S / 2 + 4, p.wa.x1 - S / 2 - 4); return { dir: c.x >= xs ? 1 : -1, hx: Q.clampX(p, xs - S / 2), walk: Math.abs(xs - cx0) };
  }
  function pickTarget(m, env, minTop) {
    const R = rnd(env), db = env.db, S = env.S, wa = env.wa, reach = (r) => standSpot({ S, sx: env.sx, wa, db }, ctr(r)).walk <= MAXWALK;
    const ic = (m.desktop || []).filter((r) => r.y - db.y0 >= minTop && r.x >= db.x0 && r.x + r.w <= db.x1 && r.y + r.h <= db.y1 && r.w <= S * 4 && r.h <= S * 2 && reach(r));
    if (ic.length) return { tgt: pick(R, ic) };
    const w = m.win; if (!w || !w.allowed || !w.r) return null;
    if (m.text === undefined) return { pending: true };
    const tx = m.text, car = tx && tx.caret; if (!tx || tx.pw || !tx.lines) return null;
    const ok = tx.lines.filter((l) => l.w >= 80 && l.h >= 8 && l.h <= S * 1.2 && l.x >= w.r.x && l.x + l.w <= w.r.x + w.r.w && l.y >= w.r.y && l.y + l.h <= w.r.y + w.r.h && l.y - db.y0 >= minTop && l.y + l.h < wa.y1 - 70 && l.x >= db.x0 && l.x + l.w <= db.x1
      && (!car || Math.abs(l.y - car.y) > l.h * 3 + 12) && reach(l));
    if (!ok.length) return null;
    const L = pick(R, ok), cw = Math.round(Math.min(L.w, cl(S * 3, 90, S * 4))), c = { x: Math.round(L.x + (L.w - cw) * (0.15 + 0.7 * R())), y: Math.round(L.y), w: cw, h: Math.round(L.h) };
    return { tgt: c, text: true };
  }

  const G = {};
  // =============================================================== 1. portal (targetless): steps into a portal beside it, steps out of another one far along the floor; sometimes something falls out first
  const ITEM = { duck: 'duck', anvil: 'anvil', frog: 'frog_small' };
  function portalAt(g, K, t, x, y, w, k, n) {
    if (k <= 0.01) return;
    g.save(); g.globalAlpha = 0.3 * k; oval(g, x, y, w * 0.62 * k, w * 0.62 * k, '#8a5cff'); g.restore();
    art(g, 'portal' + (Math.floor(t / 110) % 4), x, y, w * k, {}); K.sparks(g, x, y, t / 1000 + n * 0.37, 6, w * 0.62 * k);
  }
  G.portal = {
    label: 'Merlo portal', weight: 1.2, spell: true,
    find(m, env) { if (!isW(env)) return null; if (sideRoom({ sx: env.sx, S: env.S, wa: env.wa }).room < env.S * 7) return null; const R = rnd(env); return { item: R() < 0.3 ? pick(R, ['duck', 'anvil', 'frog']) : '' }; },
    plan(tg, env) {
      const p = mk(env, null, 'portal'), S = p.S, { dir, room, cx } = sideRoom(p), Pw = S * 1.35, off = S * 1.7, ax = cx + dir * off, bx = cx + dir * cl(room * 0.7, off + S * 3, 800), py = p.gy - Pw / 2, ex = bx + dir * S * 1.4, c1 = ax - dir * S * 0.8;
      Object.assign(p, { item: (tg && tg.item) || '', dir, ax, bx, pw: Pw, py });
      p.pr.push({ x: ax - Pw / 2, y: py - Pw / 2, w: Pw, h: Pw }, { x: bx - Pw / 2, y: py - Pw / 2, w: Pw, h: Pw });
      const s = stand(p, dir), wms = (d) => Math.max(900, d / 70 * 1000);
      p.t1 = s.t; s.hold(1500, 'cast', { f: dir }); p.tA = p.t1 + 300; p.ev.push([p.t1 + 400, 'sparkle', { n: 6 }]);
      s.to(wms(Math.abs(c1 - cx)), c1 - S / 2, p.fy, 'walk', { f: dir, lin: true });                                        // walks up to it
      s.to(wms(Math.abs(ax + dir * S * 0.1 - c1)), ax + dir * S * 0.1 - S / 2, p.fy, 'walk', { f: dir, lin: true });         // and in: shrinks and fades as it goes through
      s.set({ alpha: 0, sc: 0.45 }); p.t2 = s.t; p.tAc = p.t2 + 100;
      s.to(20, bx - S / 2, p.fy, 'idle', { f: dir });                                                                         // (unseen) it is now at the exit
      p.tB = p.t2 + 500; p.tD = p.item ? p.tB + 900 : 0; p.tE = p.item ? p.tD + 1500 : p.tB + 1100;
      s.hold(p.tE - s.t, 'idle', { f: dir });
      if (p.item) { s.hold(600, 'surprised', { f: dir }); s.set({ alpha: 1, sc: 1 }); s.hold(900, 'surprised', { f: dir }); s.to(700, ex - S / 2, p.fy, 'walk', { f: dir, lin: true }); }
      else { s.to(500, bx - S / 2 + dir * S * 0.35, p.fy, 'walk', { f: dir, lin: true }); s.set({ alpha: 1, sc: 1 }); s.to(700, ex - S / 2, p.fy, 'walk', { f: dir, lin: true }); }
      p.tBc = s.t; p.ev.push([p.tE + 200, 'sparkle', { n: 6 }]);
      s.hold(800, 'happy', { f: dir }); s.hold(250, 'idle', { f: dir }); return fin(p, s);
    },
    sprite: GAGS.spriteOf,
    _item(t, p) {   // the thing that falls out of the exit portal: arcs out, lands, bounces once and waits there
      const s = (t - p.tD) / 1000; if (!p.item || s < 0) return null;
      const S = p.S, w = S * (p.item === 'anvil' ? 0.55 : 0.5), ih = w * (p.item === 'duck' ? 0.86 : 0.75), g0 = 2600, y0 = p.py - p.pw * 0.1, vx = p.dir * 150, vy = -380, yf = p.gy - ih / 2, tl = (-vy + Math.sqrt(vy * vy + 2 * g0 * (yf - y0))) / g0;
      let y, rot; if (s < tl) { y = y0 + vy * s + 0.5 * g0 * s * s; rot = s * 7 * p.dir; } else { const vb = (vy + g0 * tl) * 0.38, ss = s - tl, air = 2 * vb / g0; y = ss < air ? yf - (vb * ss - 0.5 * g0 * ss * ss) : yf; rot = tl * 7 * p.dir; }
      return { x: p.bx + vx * Math.min(s, tl + 0.25), y, rot, w, a: 1 - sm(seg(t, p.tBc, p.tBc + 800)) };
    },
    over(g, t, p, K) {
      portalAt(g, K, t, p.ax, p.py, p.pw, pulse(t, p.tA, 900, p.tAc, 700), 0); portalAt(g, K, t, p.bx, p.py, p.pw, pulse(t, p.tB, 900, p.tBc, 700), 1);
      const q = G.portal._item(t, p); if (q) art(g, ITEM[p.item], q.x, q.y, q.w, { rot: q.rot, a: q.a });
      if (p.item && t >= p.tD && t < p.tD + 300) K.burst(g, p.bx, p.py, (t - p.tD) / 300, 8, p.pw * 0.5, '#d8c8ff');
      puff(g, t, p.tE, p.bx, p.py, p.S * 0.7, 6);
    },
  };

  // =============================================================== 2. cauldron (targetless): conjures a cauldron, brews, bottles a potion, drinks it, and something happens
  G.cauldron = {
    label: 'Merlo cauldron', weight: 1.2, spell: true,
    find(m, env) { if (!isW(env)) return null; if (sideRoom({ sx: env.sx, S: env.S, wa: env.wa }).room < env.S * 4) return null; const R = rnd(env); return { pot: Math.floor(R() * 4), fxn: Math.floor(R() * 4) }; },
    plan(tg, env) {
      const p = mk(env, null, 'cauldron'), S = p.S, { dir, cx } = sideRoom(p), Cw = S * 1.05, ccx = cl(cx + dir * S * 1.15, p.wa.x0 + Cw / 2 + 2, p.wa.x1 - Cw / 2 - 2), hx = Q.clampX(p, cx - S / 2);
      Object.assign(p, { dir, pot: POTS[((tg && tg.pot) | 0) % 4], fxn: FXS[((tg && tg.fxn) | 0) % 4], cw: Cw, ccx, ccy: p.gy - Cw / 2 });
      p.pr.push({ x: ccx - Cw / 2 - 10, y: p.gy - Cw * 2.2, w: Cw + 20, h: Cw * 2.2 });
      const s = stand(p, dir);
      p.t1 = s.t; s.hold(900, 'cast', { f: dir }); p.tAp = p.t1 + 400; p.ev.push([p.tAp, 'sparkle', { n: 6 }]);
      p.t2 = s.t; s.hold(3000, 'stir', { f: dir });
      p.t3 = s.t; s.hold(1100, 'pull', { f: dir });
      p.t4 = s.t; s.hold(1400, 'drink', { f: dir });
      p.t5 = s.t; p.fxS = [];   // the effect
      if (p.fxn === 'shrink') { s.set({ sc: 1 }); s.hold(500, 'surprised', { f: dir }); s.set({ sc: 0.45 }); s.hold(2300, 'happy', { f: dir }); s.set({ sc: 0.45 }); s.hold(500, 'surprised', { f: dir }); s.set({ sc: 1 }); s.hold(400, 'idle', { f: dir }); p.fxS = [p.t5 + 200, p.t5 + 2800]; }
      else if (p.fxn === 'rainbow') { s.set({ hue: 0 }); s.hold(3200, 'flex', { f: dir }); s.set({ hue: 720 }); s.hold(700, 'happy', { f: dir }); p.fxS = [p.t5 + 100]; }
      else if (p.fxn === 'vanish') { s.set({ alpha: 1 }); s.hold(500, 'surprised', { f: dir }); s.set({ alpha: 0 }); s.hold(1400, 'idle', { f: dir }); s.set({ alpha: 0 }); s.hold(500, 'idle', { f: dir }); s.set({ alpha: 1 }); s.hold(800, 'surprised', { f: dir }); p.fxS = [p.t5 + 400, p.t5 + 2400]; }
      else { s.hold(400, 'surprised', { f: dir }); p.fxS = [p.t5 + 300]; const hop = [0.8, 1.6, 0.8, 0.2, 0].map((k) => Q.clampX(p, hx - dir * S * k));
        hop.forEach((x, i) => { s.to(360, x, p.fy, 'frog', { f: i > 2 ? dir : -dir, h: S * 0.3 }); s.hold(140, 'frog', { f: i > 2 ? dir : -dir }); }); p.fxS.push(s.t); s.hold(500, 'surprised', { f: dir }); p.ev.push([s.t - 400, 'sparkle', { n: 6 }]); }
      p.t6 = s.t; s.hold(1000, 'happy', { f: dir }); s.hold(250, 'idle', { f: dir }); p.hx = hx; return fin(p, s);
    },
    sprite: GAGS.spriteOf,
    over(g, t, p, K) {
      const S = p.S, Cw = p.cw, x = p.ccx, k = pulse(t, p.tAp, 300, p.t6 + 200, 350), top = p.gy - Cw, col = POT[p.pot], brew = t >= p.t2 && t < p.t3 + 500 ? 1 : 0;
      if (k > 0.01) art(g, 'cauldron' + (brew ? Math.floor(t / 140) % 3 : 0), x, p.ccy + (1 - k) * Cw * 0.25, Cw * k, {});
      puff(g, t, p.tAp, x, p.ccy, Cw * 0.8, 7); puff(g, t, p.t6 + 200, x, p.ccy, Cw * 0.8, 7);
      if (brew) { const a = sm(seg(t, p.t2, p.t2 + 300)) * (1 - sm(seg(t, p.t3 + 200, p.t3 + 500))); bubbles(g, t, x, top + Cw * 0.12, Cw * 1.1, col, 8, a); smokeUp(g, t, x, top, S, 5, a); }
      const sp = spriteOf(t, p), mouth = { x: sp.x + S / 2 + p.dir * S * 0.12, y: sp.y + S * 0.3 };   // the bottled potion: rises out of the pot, comes to the mouth, is tipped back and is gone
      if (t >= p.t3 + 200 && t < p.t4 + 1250) {
        const up = sm(seg(t, p.t3 + 200, p.t3 + 800)), fl = sm(seg(t, p.t4, p.t4 + 500)), px = lerp(x, mouth.x, fl), py = lerp(top - up * S * 0.55 + Math.sin(t * 0.008) * 2, mouth.y, fl);
        art(g, 'potion_' + p.pot, px, py, S * 0.28, { rot: -p.dir * sm(seg(t, p.t4 + 400, p.t4 + 800)) * 1.9, a: 1 - sm(seg(t, p.t4 + 900, p.t4 + 1200)) });
        if (t >= p.t3 + 200 && t < p.t3 + 700) K.sparks(g, x, top - S * 0.2, (t - p.t3) / 1000, 5, S * 0.4);
      }
      for (const tt of p.fxS) { puff(g, t, tt, sp.x + S / 2, sp.y + S * 0.55, S * 0.8, 7); }
      if (p.fxn === 'shrink' && t > p.t5 + 500 && t < p.t5 + 2800) K.sparks(g, sp.x + S / 2, sp.y + S * 0.6, (t - p.t5) / 1000, 5, S * 0.5);
      if (p.fxn === 'rainbow' && t > p.t5 && t < p.t5 + 3800) K.sparks(g, sp.x + S / 2, sp.y + S * 0.5, (t - p.t5) / 1000, 8, S * 0.7);
    },
  };

  // =============================================================== 3. fireball (targets an icon or a window crop): scorches it, then "Oops! Undo spell!"
  G.fireball = {
    label: 'Merlo fireball', weight: 1, spell: true,
    needsText: true, fastText: true, find: (m, env) => (isW(env) ? pickTarget(m, env, 20) : null),
    plan(tg, env) {
      const p = mk(env, { tgt: tg.tgt }, 'fireball'), S = p.S, r = tg.tgt, c = ctr(r), { dir, hx } = standSpot(p, c), s = Seq(p.sx, p.sy);
      p.c = c; p.dir = dir; p.hx = hx; p.text = !!tg.text; Q.approach(p, s, hx, p.fy);
      s.hold(300, 'idle', { f: dir });
      p.t1 = s.t; s.hold(800, 'point', { f: dir }); p.tL = s.t; p.fm = cl(Math.hypot(c.x - (hx + S / 2), c.y - p.fy) / 1100 * 1000, 650, 1100);
      s.hold(p.fm, 'point', { f: dir }); p.tH = s.t; p.ev.push([p.tH, 'squash', { a: 0.4 }]);
      s.hold(1000, 'surprised', { f: dir }); s.hold(1900, 'idle', { f: dir }); p.tU = s.t; p.tR = p.tU + 500; p.ev.push([p.tU + 150, 'popup', { text: 'Oops! Undo spell!' }]);
      s.hold(1400, 'cast', { f: dir }); p.ev.push([p.tR, 'sparkle', { n: 8 }]); s.hold(900, 'happy', { f: dir }); s.hold(250, 'idle', { f: dir }); return fin(p, s);
    },
    sprite: GAGS.spriteOf,
    _wob(t, p) { const b = seg(t, p.tH, p.tH + 300) * (1 - sm(seg(t, p.tR - 150, p.tR + 250))); return { dx: Math.sin(t * 0.07) * 3 * b, dy: Math.cos(t * 0.09) * 1.5 * b, rot: Math.sin(t * 0.05) * 0.04 * b }; },
    tf(t, p) { const w = G.fireball._wob(t, p), l = t > p.tR ? spring((t - p.tR) / 1000, 20, 8) : 0; return { tgt: { dx: w.dx, dy: w.dy, rot: w.rot, sy: 1 - 0.08 * l } }; },
    over(g, t, p, K) {
      const S = p.S, r = p.tg.tgt, c = p.c, sp = spriteOf(p.tL, p), h0 = hand(sp, S, p.dir);
      if (t >= p.t1 + 100 && t < p.tL) { const k = sm(seg(t, p.t1 + 100, p.tL)), hp = hand(spriteOf(t, p), S, p.dir); art(g, 'fireball' + (Math.floor(t / 90) % 2), hp.x, hp.y, S * (0.12 + 0.28 * k), {}); K.sparks(g, hp.x, hp.y, t / 1000, 4, S * 0.3); }
      if (t >= p.tL && t < p.tH) {   // the throw: an arc to the target with a short trail
        const arcH = cl(Math.abs(c.x - h0.x) * 0.18, 40, 140), arc = Math.max(0, Math.min(arcH, Math.min(h0.y, c.y) - p.db.y0 - 20));
        for (let i = 5; i >= 0; i--) { const k = cl((t - p.tL) / p.fm - i * 0.035, 0, 1); art(g, 'fireball' + ((Math.floor(t / 90) + i) % 2), lerp(h0.x, c.x, k), lerp(h0.y, c.y, k) - arc * 4 * k * (1 - k), S * 0.4 * (1 - i * 0.12), { a: 1 - i * 0.16 }); }
      }
      if (t >= p.tH && t < p.tH + 450) { K.burst(g, c.x, c.y, (t - p.tH) / 450, 16, Math.max(40, r.w * 0.5), '#ffb02e'); K.burst(g, c.x, c.y, (t - p.tH) / 450, 10, Math.max(26, r.w * 0.3), '#ff5a1f'); }
      const sc = sm(seg(t, p.tH, p.tH + 500)) * (1 - sm(seg(t, p.tR, p.tR + 300)));   // scorched: darkened, charred specks, flames and smoke
      if (sc > 0.01) {
        K.flash(g, r, '#120700', 0.62 * sc); for (let i = 0; i < 16; i++) { g.save(); g.globalAlpha = 0.7 * sc; K.px(g, r.x + hash(i) * (r.w - 6), r.y + hash(i + 9) * (r.h - 6), 6 + (i % 3) * 3, 6, '#000'); g.restore(); }
        const fa = sm(seg(t, p.tH + 100, p.tH + 500)) * (1 - sm(seg(t, p.tU - 300, p.tU + 200))), n = cl(Math.floor(r.w / 22), 4, 14);
        for (let i = 0; i < n; i++) { const fx = r.x + (i + 0.15 + hash(i) * 0.7) * r.w / n, fy = r.y + r.h - hash(i + 7) * r.h * 0.7, fz = 16 + hash(i + 2) * 14; art(g, 'fireball' + ((Math.floor(t / 90) + i) % 2), fx, fy - Math.abs(Math.sin(t * 0.012 + i)) * 4, fz * fa, { a: fa }); }
        smokeUp(g, t, r.x + r.w / 2, r.y + r.h * 0.3, S * 0.9, 5, sm(seg(t, p.tH + 200, p.tH + 700)) * (1 - sm(seg(t, p.tR - 200, p.tR + 200))));
      }
      if (t >= p.tR && t < p.tR + 1100) { const k = (t - p.tR) / 1000; K.flash(g, r, '#fff6c8', 0.5 * (1 - cl(k * 3, 0, 1)));
        for (let i = 0; i < 5; i++) K.sparks(g, r.x + r.w * (0.1 + 0.2 * i), r.y + r.h * (0.3 + 0.4 * hash(i + 1)), k + i * 0.13, 6, 36); art(g, 'star', c.x, c.y - k * 30, 14, { a: 1 - k }); }
    },
  };

  // =============================================================== 4. levitate (targets an icon or a window crop): lifts it, sways in the air, sets it back exactly
  G.levitate = {
    label: 'Merlo levitate', weight: 1, spell: true,
    needsText: true, fastText: true, find: (m, env) => (isW(env) ? pickTarget(m, env, 70) : null),
    plan(tg, env) {
      const p = mk(env, { tgt: tg.tgt }, 'levitate'), S = p.S, r = tg.tgt, c = ctr(r), { dir, hx } = standSpot(p, c), s = Seq(p.sx, p.sy);
      p.c = c; p.dir = dir; p.text = !!tg.text; p.L = cl(r.y - p.db.y0 - 40, 0, 110); Q.approach(p, s, hx, p.fy);
      s.hold(300, 'idle', { f: dir }); p.tP = s.t; s.hold(1300, 'cast2', { f: dir }); p.ev.push([p.tP + 200, 'sparkle', { n: 6 }]);
      s.hold(3800, 'cast2', { f: dir }); p.tS = s.t; s.hold(900, 'cast2', { f: dir }); p.ev.push([p.tS + 600, 'sparkle', { n: 6 }]); s.hold(800, 'happy', { f: dir }); s.hold(250, 'idle', { f: dir }); return fin(p, s);
    },
    sprite: GAGS.spriteOf,
    _o(t, p) {   // offset of the crop from home
      const up = sm(seg(t, p.tP + 600, p.tP + 1500)), a = up * (1 - sm(seg(t, p.tS, p.tS + 600))), l = t > p.tS + 600 ? spring((t - p.tS - 600) / 1000, 22, 8) : 0;
      return { dx: 8 * Math.sin(t * 0.0023) * a, dy: -p.L * a + 5 * Math.sin(t * 0.004) * a + 4 * l, rot: 0.07 * Math.sin(t * 0.0031 + 1) * a, sy: 1 + 0.015 * Math.sin(t * 0.006) * a - 0.08 * l, a };
    },
    tf(t, p) { const o = G.levitate._o(t, p); return { tgt: { dx: o.dx, dy: o.dy, rot: o.rot, sy: o.sy } }; },
    under(g, t, p) {   // the gap it leaves: a faint shade on the patch and a shadow
      const o = G.levitate._o(t, p), r = p.tg.tgt, k = o.a; if (k < 0.01) return;
      g.save(); g.globalAlpha = 0.14 * k; g.fillStyle = '#000'; g.fillRect(r.x, r.y, r.w, r.h); g.globalAlpha = 0.22 * k; oval(g, r.x + r.w / 2, r.y + r.h - 2, r.w * 0.42, Math.max(4, r.h * 0.05), '#000'); g.restore();
    },
    over(g, t, p, K) {
      const o = G.levitate._o(t, p), r = p.tg.tgt, c = p.c, cx = c.x + o.dx, cy = c.y + o.dy, S = p.S;
      if (t >= p.tP + 300 && t < p.tS + 700) { const sp = spriteOf(t, p), h = hand(sp, S, p.dir), bk = sm(seg(t, p.tP + 300, p.tP + 700)) * (1 - sm(seg(t, p.tS + 300, p.tS + 700))); g.save(); g.globalAlpha = (0.55 + 0.25 * Math.sin(t * 0.01)) * bk; K.line(g, h.x, h.y, cx, cy + r.h * 0.5, 2, '#a8d0ff', 0); g.restore(); }
      if (o.a > 0.02 || (t > p.tP + 500 && t < p.tS + 1300)) {
        const a = Math.max(o.a, sm(seg(t, p.tP + 500, p.tP + 800)) * (1 - sm(seg(t, p.tS + 400, p.tS + 1300))));
        for (let i = 0; i < 4; i++) K.sparks(g, cx + (i % 2 ? 1 : -1) * r.w * 0.5, cy + (i < 2 ? -1 : 1) * r.h * 0.5, t / 1000 + i * 0.21, 4, 24);
        for (let i = 0; i < 5; i++) { const ph = t * 0.0014 + i * TAU / 5; art(g, 'star', cx + Math.cos(ph) * (r.w * 0.5 + 16), cy + Math.sin(ph) * (r.h * 0.5 + 14), 10 + (i % 2) * 4, { a: a * (0.6 + 0.4 * Math.sin(t * 0.01 + i)) }); }
      }
    },
  };

  // =============================================================== 5. weather (targetless): a storm that zaps it, a snow flurry, or sunshine and a rainbow
  G.weather = {
    label: 'Merlo weather', weight: 1.2, spell: true,
    find: (m, env) => (isW(env) && fits(env, 2.9) ? { v: pick(rnd(env), ['storm', 'snow', 'sun']) } : null),
    plan(tg, env) {
      const p = mk(env, null, 'weather'), S = p.S, v = (tg && tg.v) || 'storm', cx = cl(p.sx + S / 2, p.wa.x0 + S * 2.9, p.wa.x1 - S * 2.9), Cw = S * 3.4, Ch = Cw * 0.5, cyc = p.fy - S * 0.08 - Ch / 2, top = cyc - Ch / 2, s = Seq(p.sx, p.sy);
      Object.assign(p, { v, cx, cw: Cw, chh: Ch, cyc, top }); p.pr.push({ x: cx - S * 2.7, y: top - 8, w: S * 5.4, h: p.gy - top + 8 });
      Q.approach(p, s, Q.clampX(p, cx - S / 2), p.fy); s.hold(300, 'idle', { f: 1 });
      p.t1 = s.t; s.hold(1400, 'cast2', { f: 1 }); p.tCl = p.t1 + 300; p.ev.push([p.t1 + 300, 'sparkle', { n: 6 }]); p.tR = s.t;
      if (v === 'storm') { s.hold(2400, 'idle', { f: 1 }); p.tZ = s.t; s.hold(1500, 'surprised', { f: 1 }); p.jit.push([p.tZ, s.t, 3]); p.ev.push([p.tZ + 100, 'smoke', { ms: 2200 }], [p.tZ + 100, 'squash', { a: 0.6 }]); p.tLv = p.tZ + 800; p.tLd = 1500; p.tF = s.t; s.hold(2000, 'idle', { f: 1 }); }
      else if (v === 'snow') { s.hold(3800, 'happy', { f: 1 }); p.tF = s.t; p.tLv = p.tF; p.tLd = 1000; s.hold(1800, 'idle', { f: 1 }); }
      else { s.hold(1500, 'idle', { f: 1 }); p.tSun = s.t; p.tLv = p.tSun; p.tLd = 1500; s.hold(1500, 'surprised', { f: 1 }); p.tRb = s.t; p.ev.push([p.tRb, 'sparkle', { n: 8 }]); s.hold(3200, 'happy', { f: 1 }); p.tF = s.t; s.hold(900, 'idle', { f: 1 }); }
      s.hold(250, 'idle', { f: 1 }); return fin(p, s);
    },
    sprite: GAGS.spriteOf,
    over(g, t, p, K) {
      const S = p.S, cx = p.cx, Cw = p.cw, v = p.v, bot = p.cyc + p.chh / 2, k = sm(seg(t, p.tCl, p.tCl + 900)), lv = sm(seg(t, p.tLv, p.tLv + p.tLd)), sp = spriteOf(t, p), hh = hat(sp, S);
      const rain = (n, a, wend) => { for (let i = 0; i < n; i++) { const ph = (t / 450 + hash(i + 5)) % 1, x = cx + (hash(i) - 0.5) * Cw * 0.9; g.save(); g.globalAlpha = a; K.px(g, x, bot + ph * (p.gy - bot), 3, wend, '#7fb4ff'); g.restore(); } };
      if (k > 0.01) art(g, v === 'snow' ? 'cloud_white' : 'cloud', cx + lv * S * 3.2, p.cyc - (1 - k) * 8, Cw * (0.3 + 0.7 * k), { a: k * (1 - lv) });
      if (v === 'storm') {
        if (t >= p.tR && t < p.tZ + 250) rain(22, 1 - sm(seg(t, p.tZ, p.tZ + 250)), 9);
        for (const z of [p.tZ, p.tZ + 170]) if (t >= z && t < z + 90) { K.bolt(g, cx + (hash(z) - 0.5) * 20, bot, hh.x, hh.y, Math.floor(z), 4); g.save(); g.globalAlpha = 0.4; oval(g, hh.x, hh.y + S * 0.3, S * 1.8, S * 1.4, '#fff'); g.restore(); K.sparks(g, hh.x, hh.y + S * 0.3, (t - z) / 1000, 8, S * 0.5); }
        if (t >= p.tZ + 100 && t < p.tZ + 2400) smokeUp(g, t, hh.x, hh.y + S * 0.1, S, 4, 1 - sm(seg(t, p.tZ + 1700, p.tZ + 2400)));
      } else if (v === 'snow') {
        if (t >= p.tR && t < p.tF + 300) for (let i = 0; i < 34; i++) { const ph = (t / 2600 + hash(i + 3)) % 1; g.save(); g.globalAlpha = 1 - sm(seg(t, p.tF, p.tF + 300)); K.px(g, cx + (hash(i) - 0.5) * Cw + Math.sin(t * 0.002 + i) * S * 0.12, bot + ph * (p.gy - bot), 3, 3, '#ffffff'); g.restore(); }
        const ph = S * 0.3 * sm(seg(t, p.tR + 400, p.tR + 3600)) * (1 - sm(seg(t, p.tF + 400, p.tF + 1400))), px = cx + S * 0.85;   // the little pile, stacked in rows
        for (let r = 0; r * 3 < ph; r++) K.px(g, px - S * 0.45 * Math.sqrt(Math.max(0, 1 - (r * 3 / Math.max(3, ph)) ** 2)), p.gy - 3 * (r + 1), S * 0.9 * Math.sqrt(Math.max(0, 1 - (r * 3 / Math.max(3, ph)) ** 2)), 3, r % 2 ? '#e3eefb' : '#f6faff');
      } else {
        if (t >= p.tR && t < p.tSun + 600) for (let i = 0; i < 9; i++) { const q = (t / 520 + hash(i + 5)) % 1; g.save(); g.globalAlpha = 0.7 * (1 - sm(seg(t, p.tSun, p.tSun + 600))); K.px(g, cx + (hash(i) - 0.5) * Cw * 0.8, bot + q * (p.gy - bot), 3, 6, '#9ec6ff'); g.restore(); }
        const sk = pulse(t, p.tSun, 800, p.tF, 800), sx = cx + S * 1.7, sy = lerp(p.top + p.chh * 0.6, p.top - S * 0.1, sk), sr = S * 0.34;
        if (sk > 0.02) { g.save(); g.globalAlpha = sk; for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + t * 0.001; K.px(g, sx + Math.cos(a) * sr * 1.5 - 1, sy + Math.sin(a) * sr * 1.5 - 1, 3, 6, '#ffd23f'); } disc(g, sx, sy, sr, '#ffd23f'); disc(g, sx, sy, sr * 0.7, '#fff2a0'); g.restore(); }
        const rb = pulse(t, p.tRb, 900, p.tF, 900); if (rb > 0.01) art(g, 'rainbow', cx, p.gy - S * 1.25, S * 5, { a: rb });
      }
    },
  };

  // =============================================================== 6. conjure (targetless): glowing runes underfoot, then a bunny from the hat, an owl familiar, or a flower / star rain
  G.conjure = {
    label: 'Merlo conjure', weight: 1.2, spell: true,
    find(m, env) { if (!isW(env) || !fits(env, 3.3)) return null; const R = rnd(env); return { v: pick(R, ['bunny', 'owl', 'rain']), it: R() < 0.5 ? 'flower' : 'star' }; },
    plan(tg, env) {
      const p = mk(env, null, 'conjure'), S = p.S, v = (tg && tg.v) || 'bunny', cx = cl(p.sx + S / 2, p.wa.x0 + S * 3.3, p.wa.x1 - S * 3.3), s = Seq(p.sx, p.sy), dir = p.wa.x1 - cx >= cx - p.wa.x0 ? 1 : -1, room = (dir > 0 ? p.wa.x1 - cx : cx - p.wa.x0) - S * 1.4;
      Object.assign(p, { v, it: (tg && tg.it) || 'flower', cx, dir, D: cl(S * 4.9, 0, Math.max(S, room)) }); p.pr.push({ x: cx - S * 3.2, y: p.gy - S * 3.4, w: S * 6.4, h: S * 3.4 + 4 });
      if (v === 'bunny') p.pr.push({ x: Math.min(cx, cx + dir * (S + p.D)) - S * 0.6, y: p.gy - S * 1.4, w: S + p.D + S * 1.2, h: S * 1.4 + 4 });
      Q.approach(p, s, Q.clampX(p, cx - S / 2), p.fy); s.hold(300, 'idle', { f: dir });
      p.t1 = s.t; s.hold(1800, 'cast', { f: dir }); p.ev.push([p.t1 + 500, 'sparkle', { n: 7 }]); p.tV = s.t;
      if (v === 'bunny') { s.hold(1400, 'pull', { f: dir }); p.tJ = s.t; s.hold(900, 'happy', { f: dir }); p.tHop = s.t; s.hold(7 * 330, 'point', { f: dir }); p.tE = s.t; s.hold(900, 'happy', { f: dir }); p.tRf = p.tE + 300; }
      else if (v === 'owl') { s.hold(3000, 'point', { f: dir }); p.tL = s.t; s.hold(1800, 'happy', { f: dir }); p.tT = s.t; s.hold(1000, 'point', { f: dir }); s.hold(700, 'happy', { f: dir }); p.tRf = p.tT + 400; }
      else { s.hold(4200, 'cast2', { f: dir }); p.tEnd = s.t; s.hold(1100, 'happy', { f: dir }); p.tRf = p.tEnd; }
      s.hold(250, 'idle', { f: dir }); return fin(p, s);
    },
    sprite: GAGS.spriteOf,
    _bunny(t, p) {   // { x, y, a, flip, sy } or null: rises out of the hat (behind the sprite), jumps to the floor, hops away, pops out of sight
      const S = p.S, w = S * 0.5, bh = w * 1.25, hh = hat(spriteOf(p.tV, p), S), fy = p.gy - bh / 2; if (t < p.tV) return null;
      if (t < p.tJ) { const k = sm(seg(t, p.tV + 100, p.tJ - 200)); return { x: hh.x, y: hh.y + S * 0.12 - k * S * 0.62, a: 1, flip: p.dir < 0, sy: 1, w }; }
      const tx = p.cx + p.dir * S * 0.9;
      if (t < p.tHop) { const k = seg(t, p.tJ, p.tHop - 150); return { x: lerp(hh.x, tx, sm(k)), y: lerp(hh.y - S * 0.5, fy, k * k) - 4 * S * 0.5 * k * (1 - k) * (1 - k * 0.3), a: 1, flip: p.dir < 0, sy: 1, w }; }
      const q = (t - p.tHop) / 330, i = Math.min(6, Math.floor(q)), ph = q - i, x = tx + p.dir * (p.D / 7) * (i + sm(Math.min(1, ph * 1.4))), land = t >= p.tHop + 7 * 330 ? 0 : 1;
      return { x, y: fy - Math.sin(Math.PI * Math.min(1, ph * 1.1)) * S * 0.3 * land, a: 1 - sm(seg(t, p.tE - 450, p.tE)), flip: p.dir < 0, sy: 1 - 0.12 * (ph < 0.12 ? 1 : 0), w };
    },
    _owl(t, p) {   // circles the hat on an ellipse, comes down onto it, sits, then flies off up and away
      const S = p.S, hh = hat(spriteOf(p.tV, p), S), cy = hh.y - S * 0.2, w = S * 0.55; if (t < p.tV) return null;
      if (t < p.tL) { const k = (t - p.tV) / 3000, a = -1.2 + TAU * 1.7 * k, shrink = 1 - 0.8 * sm(seg(t, p.tL - 700, p.tL)), land = sm(seg(t, p.tL - 700, p.tL)); return { x: hh.x + Math.cos(a) * S * 1.5 * shrink, y: lerp(cy + Math.sin(a) * S * 0.6 * shrink, hh.y - w * 0.35, land), a: sm(seg(t, p.tV, p.tV + 300)), flip: -Math.sin(a) < 0, w, fl: land < 1 }; }
      if (t < p.tT) return { x: hh.x, y: hh.y - w * 0.35 + Math.sin(t * 0.006) * 1.2, a: 1, flip: p.dir < 0, w, fl: false };
      const k = seg(t, p.tT, p.tT + 900), kk = k * k; return { x: hh.x + p.dir * kk * S * 2.4, y: hh.y - w * 0.35 - kk * S * 2.4 - Math.sin(k * 8) * 3, a: 1 - sm(seg(t, p.tT + 500, p.tT + 900)), flip: p.dir < 0, w, fl: true };
    },
    over(g, t, p, K) {
      const S = p.S, v = p.v, rp = sm(seg(t, p.t1 + 100, p.t1 + 1200)), rf = 1 - sm(seg(t, p.tRf, p.tRf + 700)), rx = S * 1.15, ry = S * 0.32, ry0 = p.gy - S * 0.04, ra = rp * rf;   // the rune circle
      if (ra > 0.01) {
        g.save(); g.globalAlpha = 0.5 * ra; oval(g, p.cx, ry0, rx * 1.1, ry * 1.2, '#7d5cff'); g.globalAlpha = 0.85 * ra; g.strokeStyle = '#c8b6ff'; g.lineWidth = 3; g.beginPath(); g.ellipse(p.cx, ry0, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + rp * TAU); g.stroke(); g.restore();
        for (let i = 0; i < 8; i++) { if (i / 8 > rp) break; const a = i * TAU / 8 + t * 0.0006; art(g, 'rune' + (i % 3), p.cx + Math.cos(a) * rx, ry0 + Math.sin(a) * ry, S * 0.27, { a: ra * (0.7 + 0.3 * Math.sin(t * 0.008 + i)) }); }
        K.sparks(g, p.cx, ry0, t / 1000, 7, rx);
      }
      if (v === 'bunny') { const q = G.conjure._bunny(t, p); if (q) { art(g, 'bunny', q.x, q.y, q.w, { flip: q.flip, a: q.a, sy: q.sy }); puff(g, t, p.tE - 450, q.x, q.y, S * 0.5, 5); } if (t >= p.tV + 100 && t < p.tV + 700) K.sparks(g, hat(spriteOf(t, p), S).x, hat(spriteOf(t, p), S).y, (t - p.tV) / 1000, 6, S * 0.5); }
      else if (v === 'owl') { const q = G.conjure._owl(t, p); if (q) { art(g, 'owl' + (q.fl ? Math.floor(t / 120) % 2 : 0), q.x, q.y, q.w, { flip: q.flip, a: q.a }); if (t < p.tV + 600) K.sparks(g, q.x, q.y, (t - p.tV) / 1000, 7, S * 0.5); } }
      else for (let i = 0; i < 30; i++) {
        const ti = p.tV + (i / 30) * 3200, d = 1500 + hash(i + 4) * 400, u = (t - ti) / d; if (u < 0) continue;
        const x = p.cx + (hash(i + 1) - 0.5) * S * 4.2 + Math.sin(t * 0.003 + i) * S * 0.1, y = lerp(p.gy - S * 3, p.gy - 6, cl(u, 0, 1)), a = u < 1 ? 1 : 1 - sm(seg(u, 1, 1 + 700 / d)); if (a > 0.01) art(g, p.it, x, y, S * 0.24, { rot: u < 1 ? u * (3 + hash(i) * 4) : 0, a });
      }
    },
  };

  const IDS = Object.keys(G);
  return { G, IDS, art, pickTarget };
});

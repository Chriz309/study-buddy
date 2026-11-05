/* Desktop mischief: the gags. UMD, loaded by BOTH the main process (sprite choreography, planning, events) and the overlay page (drawing).
   Every gag is a pure function of time: sprite(t, plan) and tf/under/over(t, plan). Nothing here touches the real desktop: the overlay only
   ever paints a patch over a captured target and animates the captured crop as a prop. Units: DIP, ms, global desktop coordinates. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GAGS = factory(); })(this, function () {
  'use strict';
  const cl = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k, sm = (t) => { t = cl(t, 0, 1); return t * t * (3 - 2 * t); };
  const sg = (v) => (v < 0 ? -1 : 1), seg = (t, a, b) => cl((t - a) / (b - a), 0, 1), TAU = Math.PI * 2;
  const spring = (s, f, d) => (s < 0 ? 1 : Math.exp(-d * s) * Math.cos(f * s));   // s in seconds; 1 -> 0 with overshoot
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const ctr = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  // ---- keyframe sequencing for the sprite: each key holds the state used for the segment that STARTS at it
  function Seq(x, y) {
    const ks = []; let t = 0, cx = x, cy = y;
    const o = {
      get t() { return t; }, get x() { return cx; }, get y() { return cy; },
      to(ms, nx, ny, s, opt) { ks.push(Object.assign({ t, x: cx, y: cy, s }, opt)); t += ms; cx = nx; cy = ny; return o; },
      hold(ms, s, opt) { return o.to(ms, cx, cy, s, opt); },
      end() { ks.push({ t, x: cx, y: cy, s: 'idle', f: ks.length ? ks[ks.length - 1].f : 1 }); return ks; },
    };
    return o;
  }
  function track(t, ks) {
    t = Math.max(0, t); let i = 0;
    while (i < ks.length - 2 && t >= ks[i + 1].t) i++;
    const a = ks[i], b = ks[Math.min(i + 1, ks.length - 1)], k = b.t > a.t ? cl((t - a.t) / (b.t - a.t), 0, 1) : 1, kk = a.lin ? k : sm(k);
    const f = a.f != null ? a.f : (b.x !== a.x ? sg(b.x - a.x) : (i ? ks[i - 1].f || 1 : 1));
    return { x: lerp(a.x, b.x, kk), y: lerp(a.y, b.y, kk) - (a.h ? 4 * a.h * k * (1 - k) : 0), state: a.s, facing: f, rot: lerp(a.rot || 0, b.rot || 0, kk), clip: a.clip != null ? a.clip : null, k };
  }
  // a leap between two heights must not peak above the top of the display
  const hopH = (p, y0, y1, want) => { let h = want; for (let k = 0.02; k < 1; k += 0.02) { const d = 4 * k * (1 - k), room = y0 + (y1 - y0) * sm(k) - p.db.y0 - 2; h = Math.min(h, Math.max(0, room) / d); } return Math.max(0, h); };
  const walkS = (p) => (p.fl ? 'idle' : 'walk');
  const dirTo = (a, b) => (b >= a ? 1 : -1);

  function base(env, tg) {
    const p = { id: '', S: env.S, ch: env.char, fl: env.char === 'ghost', fy: env.fy, gy: env.fy + env.S, sx: env.sx, sy: env.sy, wa: env.wa, db: env.db, ev: [], tg: {}, jit: [], keys: null, dur: 0 };
    for (const k of Object.keys(tg)) if (tg[k] && tg[k].w != null) p.tg[k] = tg[k];
    p.fy = p.fl ? p.fy - env.S * 0.22 : p.fy;   // ghosts hover a little above the floor line
    return p;
  }
  const clampX = (p, x) => cl(x, p.wa.x0 + 2, p.wa.x1 - p.S - 2);
  const walkMs = (a, b, S) => cl(Math.abs(a - b) / 170 * 1000, 500, 2400);
  // the character-flavoured "ready" beat
  function ready(p, S_) {
    const t = S_.t;
    if (p.ch === 'hero') { S_.hold(650, 'flex'); p.ev.push([t + 120, 'sparkle', { n: 7 }], [t + 120, 'popup', { text: 'HUP!' }]); }
    else if (p.ch === 'cat') { S_.hold(600, 'alert'); p.ev.push([t + 80, 'wiggle']); }
    else if (p.ch === 'ghost') { S_.hold(500, 'idle'); p.ev.push([t + 60, 'phase']); }
    else { S_.hold(500, 'idle'); p.ev.push([t + 60, 'squash', { a: 0.45 }], [t + 260, 'launch']); }
  }
  const grabS = (p) => (p.ch === 'cat' ? 'pushing' : 'pulling');
  function finish(p, S_) {
    p.keys = S_.end(); p.dur = S_.t + 150;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const k of p.keys) { x0 = Math.min(x0, k.x); y0 = Math.min(y0, k.y - (k.h || 0)); x1 = Math.max(x1, k.x + p.S); y1 = Math.max(y1, k.y + p.S); }
    for (const r of Object.values(p.tg)) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    p.area = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    p.ev.sort((a, b) => a[0] - b[0]); return p;
  }
  function spriteOf(t, p) {
    const s = track(t, p.keys);
    for (const j of p.jit) if (t >= j[0] && t <= j[1]) { const a = j[2] * (1 - seg(t, j[0], j[1]) * 0.6); s.x += Math.sin(t * 0.09) * a; s.y += Math.cos(t * 0.13) * a * 0.6; }
    if (p.fl && s.state === 'idle') s.y += Math.sin(t / 380) * 3;
    return s;
  }

  const G = {};
  const bar = (m) => m.bar && m.buttons.length >= 3;

  // =============================================================== 1. taskbar tug of war
  G.tug = {
    label: 'Taskbar tug of war', weight: 1.2,
    find: (m) => (bar(m) ? { ic: m.buttons[1 + Math.floor((m.buttons.length - 2) * 0.5)] } : null),
    plan(tg, env) {
      const p = base(env, tg); p.id = 'tug'; const r = tg.ic, c = ctr(r), S = p.S;
      let dir = c.x < (p.db.x0 + p.db.x1) / 2 ? 1 : -1; let P = (dir > 0 ? p.wa.x1 - c.x : c.x - p.wa.x0) - S - 30; if (P < 110) { dir = -dir; P = (dir > 0 ? p.wa.x1 - c.x : c.x - p.wa.x0) - S - 30; }
      P = cl(P, 110, 300); const hx = clampX(p, c.x - S / 2), s = Seq(p.sx, p.sy);
      s.to(walkMs(p.sx, hx), hx, p.fy, walkS(p), { f: dirTo(p.sx, hx) }); ready(p, s);
      p.t1 = s.t; s.hold(520, grabS(p), { f: -dir }); p.ev.push([s.t - 400, 'squash', { a: 0.5 }]);
      p.t2 = s.t; s.to(2300, hx + dir * P, p.fy, 'pulling', { f: -dir, lin: true }); p.t3 = s.t; p.ev.push([p.t2, 'pulse'], [p.t2 + 1100, 'pulse']);
      s.hold(550, 'pulling', { f: -dir }); p.jit.push([p.t3, s.t, 3]); p.t4 = s.t;       // max tension: strains, then
      s.to(950, hx - dir * S * 0.9, p.fy, 'fall', { f: -dir, h: 120, rot: -dir * 360, lin: false }); p.ev.push([p.t4, 'launch'], [p.t4 + 940, 'land', { vy: 900 }], [p.t4 + 940, 'dust']);   // the snap flings it
      s.hold(900, 'shocked'); p.ev.push([p.t4 + 1000, 'dizzy']); s.hold(300, 'idle');
      p.dir = dir; p.hx = hx; p.c = c; return finish(p, s);
    },
    sprite: spriteOf,
    _icon(t, p) {   // where the icon is, relative to its slot
      const S = p.S, c = p.c, sp = spriteOf(Math.max(0, t - 90), p), hand = { x: sp.x + S / 2 - p.dir * S * 0.55, y: sp.y + S * 0.66 };
      if (t < p.t1 + 200) return { dx: 0, dy: 0, sx: 1, sy: 1, band: 0 };
      if (t < p.t4) { const k = sm(seg(t, p.t1 + 200, p.t2 + 250)); const hh = t > p.t3 ? { x: hand.x + Math.sin(t * 0.1) * 2, y: hand.y } : hand;
        return { dx: (hh.x - c.x) * k, dy: (hh.y - c.y) * k, sx: 1 - 0.1 * k, sy: 1 + 0.12 * k, band: k }; }
      const s = (t - p.t4) / 1000, h0 = { x: hand.x - c.x, y: hand.y - c.y }, a = spring(s, 12, 5.5);
      const hx0 = spriteOf(p.t4, p), h1 = { x: hx0.x + S / 2 - p.dir * S * 0.55 - c.x, y: hx0.y + S * 0.66 - c.y };
      return { dx: h1.x * a, dy: h1.y * a, sx: 1 + 0.3 * (1 - a) * (s < 0.5 ? 1 : 0), sy: 1 - 0.3 * (1 - a) * (s < 0.5 ? 1 : 0), band: 0 };
    },
    tf(t, p) { const i = G.tug._icon(t, p); return { ic: { dx: i.dx, dy: i.dy, sx: i.sx, sy: i.sy } }; },
    over(g, t, p, K, T) {
      const i = G.tug._icon(t, p), c = p.c;
      if (i.band > 0) { K.stretch(g, T.ic, c.x, c.y, c.x + i.dx, c.y + i.dy, 0.5 / (1 + Math.hypot(i.dx, i.dy) / 70), 0.55); }
      if (t >= p.t4 && t < p.t4 + 380) K.burst(g, c.x, c.y, (t - p.t4) / 380, 8, 26 + p.S * 0.3, '#ffd23f');
      if (t >= p.t4 && t < p.t4 + 500) K.text(g, 'TWANG!', c.x, c.y - 44 - (t - p.t4) * 0.03, 15, '#ffe14d', '#5a2200', 1 - seg(t, p.t4 + 300, p.t4 + 500));
    },
  };

  // =============================================================== 2. taskbar trampoline
  G.trampoline = {
    label: 'Taskbar trampoline', weight: 1.2,
    find(m) { if (!bar(m) || m.buttons.length < 5) return null; const c = Math.floor(m.buttons.length / 2) + (m.buttons.length > 6 ? -1 : 0), tg = {}; for (let j = -3; j <= 3; j++) if (m.buttons[c + j]) tg['b' + j] = m.buttons[c + j]; return tg; },
    plan(tg, env) {
      const p = base(env, tg); p.id = 'trampoline'; const S = p.S, c0 = ctr(tg.b0), hx = clampX(p, c0.x - S / 2), s = Seq(p.sx, p.sy);
      s.to(walkMs(p.sx, hx), hx, p.fy, walkS(p), { f: dirTo(p.sx, hx) }); ready(p, s); p.land = [];
      const hs = [34, 54, 80, 108, 150]; p.depth = [];
      hs.forEach((h, i) => { const air = 260 + h * 2.4; s.to(air, hx, p.fy, 'fall', { h: h * (S / 60 + 0.5), f: 1, lin: true }); p.land.push(s.t); p.depth.push(5 + i * 2.5);
        p.ev.push([s.t, 'land', { vy: 500 + h * 6 }]); if (i < hs.length - 1) { s.hold(70, 'crouch'); p.ev.push([s.t - 30, 'squash', { a: 0.5 }]); } });
      p.launch = s.t; s.hold(1000, 'happy'); p.ev.push([s.t - 800, 'sparkle', { n: 8 }]); s.hold(300, 'idle');
      p.hx = hx; p.c0 = c0; return finish(p, s);
    },
    sprite: spriteOf,
    tf(t, p) {
      const o = {};
      for (const k of Object.keys(p.tg)) {
        const j = +k.slice(1), r = p.tg[k]; let dy = 0, sy = 1, rot = 0, dx = 0;
        p.land.forEach((tl, i) => { const s = (t - tl - Math.abs(j) * 75) / 1000; if (s > 0 && s < 1.6) { const amp = p.depth[i] * Math.pow(0.72, Math.abs(j)); dy += amp * Math.exp(-5 * s) * Math.sin(17 * s); } });
        if (j === 0) { const lp = p.land[p.land.length - 1]; sy = 1 - cl(Math.sin(Math.min(1, Math.max(0, (t - lp + 90) / 90)) * Math.PI) * 0.0, 0, 1);
          if (t >= lp) { const s = (t - lp) / 1000, v0 = 1050, g = 2800, y = -(v0 * s - 0.5 * g * s * s); if (y <= 0) { dy = y; rot = s * TAU * 1.6; } else { const s2 = s - 2 * v0 / g; dy = 12 * Math.exp(-6 * Math.max(0, s2)) * Math.sin(16 * Math.max(0, s2)); rot = 0; } } }
        o[k] = { dy, sy, rot };
      }
      return o;
    },
  };

  // =============================================================== 3. icon juggling
  G.juggle = {
    label: 'Icon juggling', weight: 1,
    find(m) { if (!bar(m) || m.buttons.length < 4) return null; const i = Math.floor((m.buttons.length - 3) / 2); return { a: m.buttons[i], b: m.buttons[i + 1], c: m.buttons[i + 2] }; },
    plan(tg, env) {
      const p = base(env, tg); p.id = 'juggle'; const S = p.S, cb = ctr(tg.b), hx = clampX(p, cb.x - S / 2), s = Seq(p.sx, p.sy);
      s.to(walkMs(p.sx, hx), hx, p.fy, walkS(p), { f: dirTo(p.sx, hx) }); ready(p, s);
      p.t1 = s.t; s.hold(700, grabS(p), { f: 1 }); p.ev.push([p.t1 + 200, 'squash', { a: 0.5 }]);
      p.t2 = s.t; s.hold(3600, 'juggling', { f: 1 }); p.ev.push([p.t2, 'launch'], [p.t2 + 1500, 'pulse'], [p.t2 + 2400, 'pulse']);
      p.t3 = s.t; s.hold(900, 'shocked', { f: 1 }); p.ev.push([p.t3, 'squash', { a: 0.6 }], [p.t3 + 600, 'dizzy']);       // one drops
      p.t4 = s.t; s.hold(1700, 'sit', { f: 1 }); p.ev.push([p.t4, 'say']);                                                    // sheepish; the others go home
      s.hold(300, 'idle'); p.hx = hx; p.cx = hx + S / 2; p.top = p.fy - S * 0.15; return finish(p, s);
    },
    sprite: spriteOf,
    _pos(t, p, k) {   // k = 0..2 ; absolute centre of that icon + rotation
      const r = p.tg['abc'[k]], c = ctr(r), S = p.S, w = 0.0042;
      const orbit = (tt) => { const ph = tt * w * 1.0 + k * TAU / 3; return { x: p.cx + Math.cos(ph) * (S * 0.85 + 6), y: p.top - S * 0.55 - Math.abs(Math.sin(ph)) * S * 0.7 - 10 }; };
      if (t < p.t1 + 300) return { x: c.x, y: c.y, rot: 0, band: 0 };
      if (t < p.t2 + 500) { const q = sm(seg(t, p.t1 + 300, p.t2 + 500)), o = orbit(t); return { x: lerp(c.x, o.x, q), y: lerp(c.y, o.y, q) - 4 * 40 * q * (1 - q), rot: q * 0.6, band: 1 - q }; }
      if (k === 1 && t >= p.t3) {   // the dropped one: falls, bounces on the bar, then waits
        const o = orbit(p.t3), s = (t - p.t3) / 1000, gy = p.gy - r.h / 2 - 2; let y = o.y + 0.5 * 2600 * s * s, vy = 2600 * s;
        if (y >= gy) { const s2 = s - Math.sqrt(2 * (gy - o.y) / 2600), v = 2600 * Math.sqrt(2 * (gy - o.y) / 2600) * 0.45; y = gy - Math.max(0, v * s2 - 0.5 * 2600 * s2 * s2); if (s2 > 2 * v / 2600) y = gy; }
        if (t >= p.t4 + 600) { const q = sm(seg(t, p.t4 + 600, p.t4 + 1150)); return { x: lerp(o.x, c.x, q), y: lerp(y, c.y, q) - 4 * 55 * q * (1 - q), rot: (1 - q) * 0.3, band: 0 }; }
        return { x: o.x, y, rot: s * 2, band: 0 };
      }
      if (t >= p.t4) { const q = sm(seg(t, p.t4 + (k === 0 ? 100 : 350), p.t4 + (k === 0 ? 650 : 900))), o = orbit(p.t3 > 0 ? p.t4 : t); return { x: lerp(o.x, c.x, q), y: lerp(o.y, c.y, q) - 4 * 50 * q * (1 - q), rot: 0.6 * (1 - q), band: 0 }; }
      const o = orbit(t); return { x: o.x, y: o.y, rot: t * 0.003 + k, band: 0 };
    },
    tf(t, p) {
      const o = {};
      for (let k = 0; k < 3; k++) { const r = p.tg['abc'[k]], c = ctr(r), q = G.juggle._pos(t, p, k), land = t > p.t4 + 650 + (k ? 250 : 0) ? spring((t - p.t4 - 650 - (k ? 250 : 0)) / 1000, 18, 7) : 0;
        o['abc'[k]] = { dx: q.x - c.x, dy: q.y - c.y, rot: q.rot, sy: 1 - 0.18 * Math.abs(land), sx: 1 + 0.1 * Math.abs(land) }; }
      return o;
    },
    over(g, t, p, K, T) { for (let k = 0; k < 3; k++) { const q = G.juggle._pos(t, p, k), c = ctr(p.tg['abc'[k]]); if (q.band > 0.05) K.stretch(g, T['abc'[k]], c.x, c.y, q.x, q.y, 0.45, 0.5 * q.band); } },
  };

  // =============================================================== 4. battery shock (Wi-Fi / volume on desktops without a battery)
  G.shock = {
    label: 'Battery shock', weight: 1.3,
    find(m) { const r = m.battery || m.wifi || m.volume; return m.bar && r ? { ic: r } : null; },
    plan(tg, env) {
      const p = base(env, tg); p.id = 'shock'; const S = p.S, c = ctr(tg.ic), hx = clampX(p, c.x - S / 2), s = Seq(p.sx, p.sy);
      s.to(walkMs(p.sx, hx), hx, p.fy, walkS(p), { f: dirTo(p.sx, hx) }); ready(p, s);
      p.t1 = s.t; s.to(380, hx, p.fy + S * 0.2, 'pushing', { f: 1 }); p.t2 = s.t; s.hold(260, 'pushing');                          // lean in and poke
      p.t3 = s.t; s.to(120, hx, p.fy - 6, 'shocked'); s.hold(1100, 'shocked'); p.jit.push([p.t3, s.t, 4]);
      p.ev.push([p.t3, 'xray', { ms: 520 }], [p.t3, 'squash', { a: 0.7 }], [p.t3 + 600, 'xray', { ms: 260 }]);
      p.t4 = s.t; s.hold(2000, 'frazzled'); p.ev.push([p.t4, 'smoke', { ms: 2600 }]);
      p.t5 = s.t; s.hold(1000, 'frazzled'); p.jit.push([p.t5, s.t, 3]); p.ev.push([p.t5, 'squash', { a: 0.4 }], [p.t5 + 300, 'pulse'], [p.t5 + 600, 'pulse']);   // shakes it off
      s.hold(500, 'idle'); p.ev.push([s.t - 400, 'sparkle', { n: 6 }]); p.c = c; return finish(p, s);
    },
    sprite: spriteOf,
    tf(t, p) {
      let dy = 0, sy = 1, sx = 1, dx = 0;
      if (t > p.t2 - 100 && t < p.t3) { const k = seg(t, p.t2 - 100, p.t2 + 100); sy = 1 - 0.3 * k; dy = 2 * k; }
      else if (t >= p.t3 && t < p.t5 + 400) { const f = t < p.t4 ? 1 : Math.max(0, 1 - (t - p.t4) / 1800); dx = Math.sin(t * 0.12) * 2.5 * f; dy = Math.cos(t * 0.17) * 1.5 * f; sy = 1 + Math.sin(t * 0.03) * 0.04; }
      else if (t >= p.t3 - 1) { const s = (t - p.t5 - 400) / 1000; sy = 1 - 0.2 * spring(s, 20, 8); }
      return { ic: { dx, dy, sx, sy } };
    },
    over(g, t, p, K, T) {
      const c = p.c, sp = spriteOf(t, p);
      if (t >= p.t3 && t < p.t4 + 300) {   // arcing bolts between icon and sprite, re-rolled ~20 fps, white flash on the icon
        const n = Math.floor(t / 50); for (let i = 0; i < 3; i++) K.bolt(g, c.x + (hash(n + i) - 0.5) * 8, c.y - 6, sp.x + p.S / 2 + (hash(n * 3 + i) - 0.5) * p.S * 0.5, sp.y + p.S * 0.7, n * 7 + i, i === 0 ? 3 : 2);
        if ((n & 1) === 0) K.flash(g, p.tg.ic, '#fff7b0', 0.55); K.sparks(g, c.x, c.y - 8, (t - p.t3) / 1000, 7, 38);
      }
      if (t >= p.t4 - 100 && t < p.t5 + 800) K.flash(g, p.tg.ic, '#000', 0.12 + 0.1 * Math.sin(t * 0.02));   // scorched, flickering
    },
  };

  // =============================================================== 5. manhole Start button
  G.manhole = {
    label: 'Manhole Start button', weight: 1,
    find: (m) => (m.bar && m.start ? { st: m.start } : null),
    plan(tg, env) {
      const p = base(env, tg); p.id = 'manhole'; const S = p.S, c = ctr(tg.st), hx = clampX(p, c.x - S / 2), s = Seq(p.sx, p.sy), clip = p.gy;
      const deep = p.gy + 4, eyes = p.gy - S * 0.38, head = p.gy - S * 0.72;
      s.to(walkMs(p.sx, hx - S * 0.9), hx - S * 0.9, p.fy, walkS(p), { f: 1 }); ready(p, s);
      p.t1 = s.t; s.hold(1100, 'alert', { f: 1 });                                                       // the lid slides off
      p.t2 = s.t; s.to(520, hx, p.fy - 4, 'fall', { h: 60, f: 1, clip }); s.to(380, hx, deep, 'fall', { clip }); p.ev.push([s.t, 'dust']);   // hops in
      s.hold(500, 'peeking', { clip });
      p.t3 = s.t; s.to(420, hx, eyes, 'peeking', { f: -1, clip, lin: false }); s.hold(420, 'peeking', { f: 1, clip }); s.to(220, hx, deep, 'peeking', { clip });   // peek 1: eyes only
      s.hold(300, 'peeking', { clip });
      p.t4 = s.t; s.to(360, hx, head, 'peeking', { f: 1, clip }); s.hold(520, 'shocked', { f: 1, clip }); p.ev.push([p.t4 + 400, 'popup', { text: 'psst...' }]); s.to(160, hx, deep, 'shocked', { clip });   // peek 2: spotted
      p.t5 = s.t; s.hold(900, 'peeking', { clip });                                                      // clang
      p.t6 = s.t; s.hold(900, 'peeking', { clip });                                                      // rattles
      p.t7 = s.t; s.to(300, hx, p.fy - 20, 'fall', { clip, h: 12 }); s.to(520, hx + S * 0.9, p.fy, 'fall', { h: 80, f: 1, clip }); p.ev.push([s.t, 'land', { vy: 700 }], [s.t, 'dust']);   // escapes
      p.t8 = s.t; s.hold(700, 'happy'); s.hold(250, 'idle'); p.c = c; return finish(p, s);
    },
    sprite: spriteOf,
    _lid(t, p) {   // lid offset {dx,dy,rot,sy}
      const r = p.tg.st, w = r.w;
      if (t < p.t1) return { dx: 0, dy: 0, rot: 0, sy: 1 };
      if (t < p.t2 - 200) { const q = sm(seg(t, p.t1, p.t1 + 500)), sl = sm(seg(t, p.t1 + 450, p.t1 + 1000)); return { dx: sl * (w * 1.15), dy: -q * 26 + sl * 24, rot: sl * 0.35, sy: 1 - q * 0.35 + sl * 0.3 }; }
      if (t < p.t5 - 250) return { dx: w * 1.15, dy: -2, rot: 0.35, sy: 0.95 };
      if (t < p.t5) { const q = sm(seg(t, p.t5 - 250, p.t5)); return { dx: w * 1.15 * (1 - q), dy: -2 - 30 * Math.sin(q * Math.PI), rot: 0.35 * (1 - q), sy: 0.95 }; }
      if (t < p.t6) { const s = (t - p.t5) / 1000, a = spring(s, 24, 6); return { dx: 0, dy: 2 * (1 - a), rot: 0.05 * a, sy: 1 - 0.18 * Math.abs(a) }; }                            // CLANG wobble
      if (t < p.t7 - 200) { const s = (t - p.t6) / 1000, b = (Math.sin(s * 40) > 0.4 ? 1 : 0) * Math.exp(-s * 1.2); return { dx: 0, dy: -6 * b, rot: 0.04 * b, sy: 1 }; }                // rattle
      if (t < p.t7 + 450) { const q = sm(seg(t, p.t7 - 200, p.t7 + 120)); return { dx: w * 0.7 * q, dy: -12 * q, rot: 0.3 * q, sy: 1 }; }
      if (t < p.t8 + 100) { const q = sm(seg(t, p.t7 + 450, p.t8 - 100)); return { dx: w * 0.7 * (1 - q), dy: -12 * (1 - q), rot: 0.3 * (1 - q), sy: 1 }; }
      const s = (t - p.t8 - 100) / 1000; return { dx: 0, dy: 0, rot: 0, sy: 1 - 0.12 * spring(s, 22, 8) };
    },
    tf(t, p) { const l = G.manhole._lid(t, p); return { st: { dx: l.dx, dy: l.dy, rot: l.rot, sy: l.sy } }; },
    under(g, t, p, K) { const r = p.tg.st, c = ctr(r), open = t > p.t1 + 300 && t < p.t5 - 200 || (t > p.t7 - 100 && t < p.t8); if (open) K.hole(g, r, 1); },
    over(g, t, p, K) {
      const c = p.c; if (t >= p.t5 && t < p.t5 + 800) { K.text(g, 'CLANG!', c.x, c.y - 52 - (t - p.t5) * 0.02, 18, '#ffffff', '#222', 1 - seg(t, p.t5 + 500, p.t5 + 800)); K.burst(g, c.x, c.y - 4, (t - p.t5) / 500, 10, 36, '#ffffff'); }
      if (t >= p.t6 && t < p.t7 - 200 && Math.sin((t - p.t6) / 1000 * 40) > 0.4) K.text(g, 'tk', c.x + 24, c.y - 30, 11, '#fff', '#222', 0.9);
    },
  };

  // =============================================================== 6. clock tamper
  G.clock = {
    label: 'Clock tamper', weight: 1,
    find: (m) => (m.bar && m.clock ? { ck: m.clock } : null),
    plan(tg, env) {
      const p = base(env, tg); p.id = 'clock'; const S = p.S, c = ctr(tg.ck), hx = clampX(p, c.x - S / 2), s = Seq(p.sx, p.sy);
      s.to(walkMs(p.sx, hx), hx, p.fy, walkS(p), { f: dirTo(p.sx, hx) }); ready(p, s);
      p.t1 = s.t; s.hold(700, 'pushing', { f: 1 });
      p.t2 = s.t; s.hold(1700, 'happy', { f: 1 }); p.ev.push([p.t2, 'pulse'], [p.t2 + 500, 'pulse'], [p.t2 + 1000, 'pulse']);          // spinning the digits, delighted
      p.t3 = s.t; for (let i = 0; i < 3; i++) { s.to(240, hx, p.fy, 'fall', { h: 38, f: 1 }); s.hold(70, 'crouch'); } p.ev.push([p.t3, 'popup', { text: '!!' }], [p.t3 + 600, 'squash', { a: 0.5 }]);   // panic hops
      p.t4 = s.t; s.hold(1500, 'shocked', { f: 1 });                                                                                      // resets
      p.t5 = s.t; s.hold(900, 'happy'); p.ev.push([p.t5, 'sparkle', { n: 8 }]); s.hold(250, 'idle'); p.c = c; return finish(p, s);
    },
    sprite: spriteOf,
    tf: () => ({ ck: { hide: true } }),
    under(g, t, p, K, T) {
      const r = p.tg.ck, c = ctr(r);
      if (t < p.t1 + 200 || t >= p.t5 - 200) { K.crop(g, T.ck, {}); return; }
      const d = (n) => String(Math.floor(n)), fast = t < p.t3 ? 55 : 35, n = Math.floor(t / fast), real = new Date(), settle = seg(t, p.t4 + 300, p.t4 + 1300);
      const hh = real.getHours(), mm = real.getMinutes(), tr = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
      let str = ''; for (let i = 0; i < 5; i++) { if (i === 2) { str += ':'; continue; } str += (settle * 5 > i + 0.2 + (i > 2 ? 0.5 : 0) ? tr[i] : d(hash(n * 5 + i) * 10)); }
      if (t >= p.t3 && t < p.t4 + 300) str = (n & 2) ? '88:88' : str;
      const big = t >= p.t3 && t < p.t4 ? 1.35 + 0.15 * Math.sin(t * 0.03) : 1 + 0.08 * Math.sin(t * 0.02);
      K.text(g, str, c.x + (hash(n) - 0.5) * (t < p.t4 ? 4 : 0), c.y - 6, Math.round(r.h * 0.34 * big), T.ck.lum < 0.5 ? '#f4f4f4' : '#101010', null, 1, 'ui');
      K.text(g, d(1 + hash(n + 9) * 28) + '/' + d(1 + hash(n + 4) * 12) + '/' + d(1999 + hash(n + 2) * 80), c.x, c.y + r.h * 0.22, Math.round(r.h * 0.22), T.ck.lum < 0.5 ? '#c8c8c8' : '#303030', null, 0.9, 'ui');
      if (t > p.t4 + 1250 && t < p.t4 + 1500) K.burst(g, c.x, c.y, (t - p.t4 - 1250) / 250, 8, 30, '#7dffb0');
    },
  };

  // =============================================================== 7. Wi-Fi fishing  (volume icon gets blown over when there is no Wi-Fi)
  G.fishing = {
    label: 'Wi-Fi fishing', weight: 1.1,
    find(m) { if (!m.bar) return null; if (m.wifi) return { ic: m.wifi, mode: 'fish' }; return m.volume ? { ic: m.volume, mode: 'blow' } : null; },
    plan(tg, env) {
      const mode = tg.mode; tg = { ic: tg.ic };
      const p = base(env, tg); p.id = 'fishing'; p.mode = mode; const S = p.S, c = ctr(tg.ic), s = Seq(p.sx, p.sy);
      const gap = mode === 'fish' ? Math.max(110, S * 1.6) : Math.max(80, S * 1.1), hx = clampX(p, c.x - gap - S / 2); p.hx = hx; p.c = c;
      s.to(walkMs(p.sx, hx), hx, p.fy, walkS(p), { f: dirTo(p.sx, hx) }); ready(p, s);
      if (mode === 'fish') {
        p.t1 = s.t; s.hold(800, 'pulling', { f: 1 }); p.ev.push([p.t1 + 300, 'launch']);                       // cast
        p.t2 = s.t; s.hold(1300, 'peeking', { f: 1 });                                                           // waiting, nibble
        p.t3 = s.t; s.hold(500, 'pulling', { f: 1 }); p.ev.push([p.t3, 'squash', { a: 0.5 }]);                    // hook set
        p.t4 = s.t; s.hold(1700, 'pulling', { f: 1 }); p.jit.push([p.t4, s.t, 1.5]); p.ev.push([p.t4 + 300, 'pulse'], [p.t4 + 900, 'pulse']);   // reeling in
        p.t5 = s.t; s.to(650, hx - S * 0.7, p.fy, 'fall', { h: 40, f: 1, rot: -80 }); s.hold(600, 'shocked', { rot: -80 }); p.ev.push([p.t5, 'launch'], [p.t5 + 640, 'land', { vy: 600 }], [p.t5 + 640, 'dust']);   // it wriggles free; he topples
        p.t6 = s.t; s.hold(500, 'frazzled', { f: 1 }); s.hold(300, 'idle', { f: 1 });
      } else {
        p.t1 = s.t; s.hold(700, 'alert', { f: 1 });                                                               // inhale
        p.t2 = s.t; s.hold(1000, 'shocked', { f: 1 }); p.ev.push([p.t2, 'squash', { a: 0.6 }], [p.t2 + 100, 'popup', { text: 'BEEP!' }]);    // tiny sound wave
        p.t3 = s.t; s.hold(1500, 'peeking', { f: 1 });                                                            // it has toppled
        p.t4 = s.t; s.to(900, hx + gap * 0.5, p.fy, walkS(p), { f: 1 }); s.hold(900, 'pushing', { f: 1 }); p.ev.push([p.t4 + 1200, 'squash', { a: 0.4 }]);   // props it back up
        p.t5 = s.t; s.hold(500, 'happy'); s.hold(250, 'idle');
      }
      return finish(p, s);
    },
    sprite: spriteOf,
    _fish(t, p) {   // icon centre while hooked + line tip
      const c = p.c, S = p.S, hand = { x: p.hx + S * 0.95, y: p.fy + S * 0.35 }, tip = { x: hand.x + S * 0.55, y: hand.y - S * 0.75 };
      let q = { x: c.x, y: c.y, rot: 0, tight: 0 };
      if (t >= p.t2 + 500 && t < p.t3) q.y += Math.sin(t * 0.03) * 3 * (hash(Math.floor(t / 200)) > 0.3 ? 1 : 0);
      if (t >= p.t3 && t < p.t5) { const k = sm(seg(t, p.t3 + 200, p.t4 + 1500)), up = { x: hand.x + S * 0.45, y: hand.y - S * 0.5 }; q = { x: lerp(c.x, up.x, k) + Math.sin(t * 0.02) * 6 * k, y: lerp(c.y, up.y, k) - 4 * 30 * k * (1 - k), rot: Math.sin(t * 0.03) * 0.7 * k, tight: 1 }; }
      if (t >= p.t5) { const k = seg(t, p.t5, p.t5 + 1150), up = { x: hand.x + S * 0.45, y: hand.y - S * 0.5 }; q = { x: lerp(up.x, c.x, sm(k)) + Math.sin(k * 9) * 5 * (1 - k), y: lerp(up.y, c.y, sm(k)) - 4 * 90 * k * (1 - k), rot: (1 - k) * 8, tight: 0 }; }
      return { q, hand, tip };
    },
    tf(t, p) {
      if (p.mode === 'fish') { const f = G.fishing._fish(t, p), c = p.c; return { ic: { dx: f.q.x - c.x, dy: f.q.y - c.y, rot: f.q.rot, sx: 1, sy: 1 + (t > p.t5 + 1100 ? 0.12 * spring((t - p.t5 - 1100) / 1000, 20, 8) : 0) } }; }
      const r = p.tg.ic; let rot = 0, dx = 0, dy = 0;
      if (t >= p.t2 + 450 && t < p.t4 + 1200) { const k = sm(seg(t, p.t2 + 450, p.t2 + 1150)), b = t > p.t2 + 1150 ? 0.06 * spring((t - p.t2 - 1150) / 1000, 20, 5) : 0; rot = (Math.PI / 2) * k * 0.97 + b; dy = r.h * 0.3 * k; dx = r.w * 0.2 * k; }
      if (t >= p.t4 + 1000) { const k = sm(seg(t, p.t4 + 1100, p.t4 + 1500)); rot = (Math.PI / 2 * 0.97) * (1 - k) - 0.1 * spring((t - p.t4 - 1500) / 1000, 18, 6) * (t > p.t4 + 1500 ? 1 : 0); dy = r.h * 0.3 * (1 - k); dx = r.w * 0.2 * (1 - k); }
      return { ic: { dx, dy, rot, pv: [0, r.h * 0.5] } };
    },
    over(g, t, p, K, T) {
      const S = p.S, c = p.c;
      if (p.mode === 'fish') {
        const f = G.fishing._fish(t, p); if (t < p.t1 + 300) { K.rod(g, f.hand.x, f.hand.y, f.tip.x, f.tip.y, -0.2); return; }
        const cast = sm(seg(t, p.t1 + 300, p.t1 + 800)), end = t >= p.t5 + 450 ? sm(seg(t, p.t5 + 450, p.t5 + 800)) : 0, bend = f.q.tight ? 0.45 : 0.05;
        const tx = lerp(f.tip.x, f.q.x, cast), ty = lerp(f.tip.y, f.q.y - (f.q.tight ? 0 : 10), cast) - 4 * 40 * cast * (1 - cast) * (1 - end);
        K.rod(g, f.hand.x, f.hand.y, f.tip.x, f.tip.y, bend);
        if (end < 1) { K.line(g, f.tip.x, f.tip.y, lerp(tx, f.tip.x, end), lerp(ty, f.tip.y, end), 1.5, '#e8eef5', f.q.tight ? 0 : 6 * (1 - cast)); if (t < p.t3 || (t >= p.t3 && t < p.t5)) K.px(g, tx - 3, ty - 3, 6, 6, '#ff4d4d'); }
        if (t >= p.t3 && t < p.t5) K.burst(g, f.q.x, f.q.y, ((t - p.t3) % 500) / 500, 5, 24, '#9fd8ff');
        if (t >= p.t5 && t < p.t5 + 600) K.text(g, 'splash!', c.x, c.y - 40, 13, '#bfe8ff', '#134', 1 - seg(t, p.t5 + 350, p.t5 + 600));
      } else {
        const src = { x: p.hx + S + 4, y: p.fy + S * 0.4 };
        if (t >= p.t2 + 100 && t < p.t2 + 1000) for (let i = 0; i < 4; i++) { const k = seg(t, p.t2 + 100 + i * 110, p.t2 + 100 + i * 110 + 520); if (k > 0 && k < 1) K.arc(g, lerp(src.x, c.x - 8, k), lerp(src.y, c.y - 8, k), 6 + k * 14, 1 - k, '#cfe8ff'); }
      }
    },
  };

  // =============================================================== 8. desktop icon shove and domino
  G.domino = {
    label: 'Desktop icon domino', weight: 1.2,
    find(m) { const row = m.rows[0]; if (!row) return null; const tg = {}; row.slice(0, 6).forEach((r, i) => { tg['i' + i] = r; }); return tg; },
    plan(tg, env) {
      const p = base(env, tg); p.id = 'domino'; const S = p.S, n = Object.keys(tg).length, r0 = tg.i0, rl = tg['i' + (n - 1)];
      const bot = r0.y + r0.h, fy = bot - S, left = r0.x - S * 0.85 > p.wa.x0 + 4, sx0 = left ? r0.x - S * 0.85 : rl.x + rl.w + 6;
      p.dir = left ? 1 : -1; if (!left) { /* mirror: topple towards the left */ }
      p.n = n; const s = Seq(p.sx, p.sy), T0 = 1300;
      s.to(T0, sx0, fy, 'fall', { h: hopH(p, p.sy, fy, Math.max(120, p.gy - fy) * 0.4 + 90), f: p.dir }); p.ev.push([s.t, 'land', { vy: 800 }], [s.t, 'dust']);
      ready(p, s); p.t1 = s.t; s.hold(520, 'pushing', { f: p.dir }); p.ev.push([p.t1 + 300, 'squash', { a: 0.5 }]);
      p.t2 = s.t; const fallMs = 170; s.hold(fallMs * n + 500, 'shocked', { f: p.dir }); p.ev.push([p.t2 + fallMs * n + 100, 'dizzy']);
      p.t3 = s.t; s.hold(300, 'alert', { f: p.dir });
      p.sweep = 2200; p.t4 = s.t; const x1 = clampX(p, left ? rl.x + rl.w - S * 0.3 : r0.x - S * 0.5); s.to(p.sweep, x1, fy, 'pushing', { f: p.dir, lin: true });
      p.t5 = s.t; s.hold(700, 'happy'); p.ev.push([p.t5, 'sparkle', { n: 8 }]); s.hold(250, 'idle');
      p.fall = fallMs; p.bot = bot; p.sx0 = sx0; return finish(p, s);
    },
    sprite: spriteOf,
    _ang(i, t, p) {   // 0 upright .. PI/2 lying (toppled direction = p.dir)
      const t0 = p.t2 + i * p.fall + 50 * (i ? 0 : -1);   // first is pushed by hand
      const sweepX = (() => { const sp = spriteOf(Math.min(Math.max(t, p.t4), p.t5), p); return sp.x + p.S / 2 + p.dir * p.S * 0.55; })();
      const r = p.tg['i' + i], cx = r.x + r.w / 2;
      if (t >= p.t4 && (p.dir > 0 ? sweepX > cx : sweepX < cx)) { const when = p.t4 + (() => { for (let q = 0; q < 200; q++) { const tt = p.t4 + q * 15, sp = spriteOf(tt, p), bx = sp.x + p.S / 2 + p.dir * p.S * 0.55; if (p.dir > 0 ? bx > cx : bx < cx) return q * 15; } return 0; })();
        const s = (t - when) / 1000; return (Math.PI / 2) * Math.max(0, 1 - sm(s / 0.28)) + (s > 0.28 ? 0.18 * spring(s - 0.28, 20, 6) : 0); }
      if (t < t0) return 0;
      const k = cl((t - t0) / 360, 0, 1); return (Math.PI / 2) * k * k * (k > 0.98 ? 1 : 1) + (k >= 1 ? 0.06 * spring((t - t0 - 360) / 1000, 22, 9) : 0);
    },
    tf(t, p) {
      const o = {};
      for (let i = 0; i < p.n; i++) { const a = G.domino._ang(i, t, p), r = p.tg['i' + i]; o['i' + i] = { rot: a * p.dir, pv: [p.dir * r.w / 2, r.h / 2] }; }
      return o;
    },
    over(g, t, p, K) {
      const sp = spriteOf(t, p);
      if (t >= p.t4 - 100 && t < p.t5) K.broom(g, sp.x + p.S / 2 + p.dir * p.S * 0.55, sp.y + p.S * 0.95, p.dir, Math.sin(t * 0.02) * 0.35, p.S);
      if (t >= p.t4 && t < p.t5) K.dust(g, sp.x + p.S / 2 + p.dir * p.S * 0.55, sp.y + p.S * 0.95, t);
      for (let i = 0; i < p.n; i++) { const tt = p.t2 + i * p.fall + 360; if (t >= tt && t < tt + 260) { const r = p.tg['i' + i]; K.burst(g, r.x + r.w / 2 + p.dir * r.w * 0.5, r.y + r.h - 4, (t - tt) / 260, 5, 22, '#d9d2c0'); } }
    },
  };

  // =============================================================== 9. window corner peel
  G.peel = {
    label: 'Window corner peel', weight: 1,
    find(m, env) { const w = m.win; if (!w || !w.allowed || w.max || !env) return null; const wa = w.display.workArea, r = w.r;
      if (r.y < wa.y + env.S + 12 || r.w < 320 || r.h < 220 || r.x < wa.x - 4 || r.x + r.w > wa.x + wa.width + 4) return null;
      return { cn: { x: r.x, y: r.y, w: Math.min(170, r.w * 0.4), h: Math.min(120, r.h * 0.4) } }; },
    plan(tg, env) {
      const p = base(env, tg); p.id = 'peel'; const S = p.S, r = tg.cn, s = Seq(p.sx, p.sy), x = clampX(p, r.x + 4), y = r.y - S + 6;
      s.to(1300, x, y, 'fall', { h: hopH(p, p.sy, y, Math.max(140, p.fy - y) * 0.35 + 100), f: 1 }); p.ev.push([s.t, 'land', { vy: 700 }], [s.t, 'dust']);
      ready(p, s); p.t1 = s.t; s.hold(700, grabS(p), { f: -1 }); p.ev.push([p.t1 + 300, 'squash', { a: 0.4 }]);
      p.t2 = s.t; s.hold(900, 'pulling', { f: -1 });                                                                // lifts the corner
      p.t3 = s.t; s.hold(1500, 'peeking', { f: 1 }); p.ev.push([p.t3 + 400, 'look', { dir: 1 }], [p.t3 + 900, 'look', { dir: -1 }]);
      p.t4 = s.t; s.hold(700, 'shocked', { f: 1 }); p.ev.push([p.t4, 'squash', { a: 0.6 }], [p.t4 + 100, 'popup', { text: '!' }]);   // caught
      p.t5 = s.t; s.hold(1500, 'pushing', { f: -1 }); p.ev.push([p.t5 + 250, 'pulse'], [p.t5 + 650, 'pulse'], [p.t5 + 1050, 'pulse']);   // smooths it down
      p.t6 = s.t; s.hold(500, 'happy'); p.ev.push([p.t6, 'sparkle', { n: 6 }]); s.hold(250, 'idle'); return finish(p, s);
    },
    sprite: spriteOf,
    _k(t, p) { return t < p.t2 ? 0.55 * sm(seg(t, p.t1 + 250, p.t2)) : t < p.t3 + 1500 ? 0.55 + 0.4 * sm(seg(t, p.t2, p.t3)) : t < p.t5 ? 0.95 : 0.95 * (1 - sm(seg(t, p.t5 + 100, p.t5 + 1300))) + (Math.sin((t - p.t5) * 0.014) > 0 ? 0.03 : 0); },
    tf: () => ({ cn: { hide: true } }),
    under(g, t, p, K, T) { K.curl(g, T.cn, G.peel._k(t, p)); },
  };

  // =============================================================== 10. text climber
  G.text = {
    label: 'Text climber', weight: 1.5, needsText: true,
    find(m, env) {
      const w = m.win; if (!w || !w.allowed || !env) return null; if (m.text === undefined) return { pending: true };
      const tx = m.text; if (!tx || tx.pw || !tx.lines || !tx.lines.length) return null;
      const wa = w.display.workArea, S = env.S, car = tx.caret;
      const ok = tx.lines.filter(l => l.w >= 160 && l.y > wa.y + S + 6 && l.y + l.h < wa.y + wa.height - 70 && (!car || Math.abs(l.y - car.y) > l.h * 3 + 12));
      if (!ok.length) return null;
      const L = ok[Math.floor(ok.length * (tx.pick == null ? 0.5 : tx.pick))], lw = Math.max(8, Math.round(L.h * 0.55));
      let x = L.x + L.w * 0.62; if (car && Math.abs(x - car.x) < 140) x = L.x + L.w * 0.3;
      return { ch: { x: Math.round(x), y: L.y, w: lw, h: L.h }, line: L };
    },
    plan(tg, env) {
      const L = tg.line; tg = { ch: tg.ch }; const p = base(env, tg); p.id = 'text'; const S = p.S, r = tg.ch, s = Seq(p.sx, p.sy), ly = L.y - S + L.h * 0.3, x0 = clampX(p, L.x + 6), xt = clampX(p, r.x - S * 0.45);
      p.L = L; p.gnd = p.gy - r.h;
      s.to(1300, x0, ly, 'fall', { h: hopH(p, p.sy, ly, Math.max(160, p.fy - ly) * 0.4 + 110), f: 1 }); p.ev.push([s.t, 'land', { vy: 700 }]);
      s.to(Math.max(900, Math.abs(xt - x0) / 110 * 1000), xt, ly, walkS(p), { f: 1, lin: true });
      p.t1 = s.t; s.to(300, xt + S * 0.35, ly - 14, 'fall', { f: 1 }); s.hold(120, 'shocked'); p.ev.push([p.t1 + 150, 'squash', { a: 0.6 }]);      // trips
      p.t2 = s.t; s.hold(700, 'shocked', { f: 1 }); p.ev.push([p.t2, 'popup', { text: 'oops' }]);
      p.ground = p.gy - S; const lx = clampX(p, r.x + 150 * (r.x > (p.wa.x0 + p.wa.x1) / 2 ? -1 : 1));
      p.v0 = (lx - r.x) / 1.2; p.t0f = p.t2 - 400; p.lx = lx;
      s.to(700, clampX(p, lx - S * 0.9 * sg(p.v0)), p.ground, 'fall', { h: 70, f: sg(p.v0) }); p.ev.push([s.t, 'land', { vy: 800 }]); p.t3 = s.t;
      for (let i = 0; i < 3; i++) { s.to(420, clampX(p, lx - S * 0.9 * sg(p.v0) + sg(p.v0) * (i + 1) * 70), p.ground, 'pushing', { f: sg(p.v0) }); p.ev.push([s.t - 260, 'pulse']); }   // kicks / dribbles
      p.dx = sg(p.v0) * 210; p.t4 = s.t; s.hold(500, 'pulling', { f: sg(p.v0) }); p.ev.push([p.t4 + 200, 'squash', { a: 0.4 }]);       // picks it up
      p.t5 = s.t; const bx = clampX(p, r.x - S * 0.4); s.to(Math.max(800, Math.abs(bx - s.x) / 130 * 1000), bx, p.ground, walkS(p), { f: dirTo(s.x, bx) });
      p.t6 = s.t; s.to(900, bx, ly, 'fall', { h: hopH(p, p.ground, ly, Math.max(140, p.ground - ly) * 0.3 + 90), f: 1 }); p.ev.push([s.t, 'land', { vy: 600 }]);
      p.t7 = s.t; s.hold(500, grabS(p), { f: 1 }); p.ev.push([p.t7 + 300, 'sparkle', { n: 6 }]);                                           // pops it back in
      p.t8 = s.t; s.hold(600, 'happy'); s.hold(250, 'idle'); return finish(p, s);
    },
    sprite: spriteOf,
    _letter(t, p) {   // absolute centre + rot of the knocked-off letter; null while it sits in place
      const r = p.tg.ch, w = r.w, h = r.h, home = { x: r.x + w / 2, y: r.y + h / 2 };
      if (t < p.t1 + 150) return null;
      if (t < p.t4 + 400) {   // flung, falls with gravity, bounces on the "floor", then is dribbled along it
        const s = (t - p.t1 - 150) / 1000, g = 1900, fy = p.gy - h / 2; let vx = p.v0 * 0.9, x = home.x + vx * s, vy = -300, y = home.y + vy * s + 0.5 * g * s * s;
        if (y >= fy) { let tt = (-vy + Math.sqrt(vy * vy + 2 * g * (fy - home.y))) / g, e = 0.5, v = (vy + g * tt) * e, ss = s - tt; y = fy;
          for (let b = 0; b < 4 && ss > 0; b++) { const air = 2 * v / g; if (ss < air) { y = fy - (v * ss - 0.5 * g * ss * ss); ss = -1; break; } ss -= air; v *= e; if (v < 40) break; }
          x = home.x + vx * Math.min(s, tt + 0.9); }
        let rot = Math.min(s, 1.4) * 7; if (t >= p.t3) { const n = Math.min(3, Math.max(0, Math.floor((t - p.t3) / 420))); const k = ((t - p.t3) % 420) / 420; x = lerp(x, x, 1); const base0 = p.lx + sg(p.v0) * 70 * n + (n < 3 ? sg(p.v0) * 70 * sm(k) : 0); x = base0 + sg(p.v0) * 0; y = fy - (n < 3 ? Math.sin(k * Math.PI) * 26 : 0); rot += n; }
        if (t >= p.t4) { const sp = spriteOf(t, p), q = sm(seg(t, p.t4, p.t4 + 400)); return { x: lerp(x, sp.x + p.S / 2, q), y: lerp(y, sp.y - h * 0.4, q), rot: rot * (1 - q) }; }
        return { x, y, rot };
      }
      if (t < p.t7) { const sp = spriteOf(t, p); return { x: sp.x + p.S / 2 + sp.facing * 4, y: sp.y - h * 0.35 - Math.abs(Math.sin(t * 0.012)) * 3, rot: 0.2 * Math.sin(t * 0.01) }; }
      const q = sm(seg(t, p.t7 + 150, p.t7 + 450)), sp = spriteOf(p.t7, p); return { x: lerp(sp.x + p.S / 2 + sp.facing * 4, home.x, q), y: lerp(sp.y - h * 0.35, home.y, q) - 4 * 20 * q * (1 - q), rot: 0 };
    },
    tf(t, p) {
      const r = p.tg.ch, q = G.text._letter(t, p), c = ctr(r); if (!q) return { ch: {} };
      const settle = t > p.t7 + 450 ? spring((t - p.t7 - 450) / 1000, 24, 9) : 0;
      return { ch: { dx: q.x - c.x, dy: q.y - c.y, rot: q.rot, sy: 1 - 0.3 * Math.abs(settle), sx: 1 + 0.2 * Math.abs(settle) } };
    },
    over(g, t, p, K) { const r = p.tg.ch; if (t >= p.t1 + 150 && t < p.t1 + 500) K.burst(g, r.x + r.w / 2, r.y + r.h / 2, (t - p.t1 - 150) / 350, 6, 20, '#ffffff'); },
  };

  // =============================================================== 11. fake glass crack, hammer, bandage (pure props on the active window)
  G.crack = {
    label: 'Glass crack and bandage', weight: 0.8,
    find(m, env) { const w = m.win; if (!w || !w.allowed || !env || w.r.w < 300 || w.r.h < 200) return null; return { hit: { x: Math.round(w.r.x + w.r.w * 0.6), y: Math.round(w.r.y + w.r.h * 0.4), w: 1, h: 1 }, win: w.r }; },
    plan(tg, env) {
      const win = tg.win; tg = { hit: tg.hit }; const p = base(env, tg); p.id = 'crack'; const S = p.S, s = Seq(p.sx, p.sy), hx = clampX(p, tg.hit.x - S / 2 - 120);
      p.win = win; p.hit = ctr(tg.hit); s.to(walkMs(p.sx, hx), hx, p.fy, walkS(p), { f: 1 }); ready(p, s);
      p.t1 = s.t; s.hold(500, grabS(p), { f: 1 }); p.t2 = s.t; s.hold(650, 'pushing', { f: 1 }); p.ev.push([p.t2, 'launch']);            // wind-up, throw
      p.t3 = s.t; s.hold(1500, 'shocked', { f: 1 }); p.ev.push([p.t3, 'squash', { a: 0.6 }], [p.t3 + 100, 'popup', { text: 'oops' }]);
      p.t4 = s.t; s.hold(900, 'pulling', { f: 1 });                                                                       // fetches a bandage
      p.t5 = s.t; s.hold(1100, 'pushing', { f: 1 }); p.ev.push([p.t5 + 250, 'pulse']);                                     // slaps it on
      p.t6 = s.t; s.hold(900, 'happy'); p.ev.push([p.t6, 'sparkle', { n: 6 }]);
      p.t7 = s.t; s.hold(900, 'idle'); s.hold(200, 'idle'); return finish(p, s);
    },
    sprite: spriteOf,
    tf: () => ({}),
    over(g, t, p, K) {
      const h = p.hit, S = p.S, sp = spriteOf(t, p), from = { x: sp.x + S * 0.8, y: sp.y + S * 0.35 };
      if (t >= p.t2 && t < p.t3 - 650 + 650) { const k = seg(t, p.t2 + 250, p.t3); if (k > 0 && k < 1) K.hammer(g, lerp(from.x, h.x, k), lerp(from.y, h.y, k) - 4 * 120 * k * (1 - k), k * 14); }
      if (t >= p.t3) { const grow = sm(seg(t, p.t3, p.t3 + 420)), heal = t >= p.t7 ? 1 - sm(seg(t, p.t7, p.t7 + 800)) : 1; if (heal > 0) K.crack(g, h.x, h.y, grow * heal, 31, Math.max(90, Math.min(p.win.w, p.win.h) * 0.45));
        if (t < p.t3 + 500) K.burst(g, h.x, h.y, (t - p.t3) / 500, 9, 50, '#ffffff'); if (t < p.t3 + 220) K.flash(g, { x: h.x - 40, y: h.y - 40, w: 80, h: 80 }, '#ffffff', 0.5 * (1 - (t - p.t3) / 220)); }
      if (t >= p.t5 + 200 && t < p.t7 + 800) { const k = seg(t, p.t5 + 200, p.t5 + 420), out = t >= p.t7 ? sm(seg(t, p.t7, p.t7 + 800)) : 0;
        K.bandage(g, h.x, h.y - out * 60 * out, 0.5 + 0.15 * (1 - k), (1.4 - 0.4 * k) * (1 - out * 0.2), (1 - out) * Math.min(1, k * 3)); }
      if (t >= p.t5 && t < p.t5 + 260) K.bandage(g, lerp(from.x, h.x, seg(t, p.t5, p.t5 + 250)), lerp(from.y, h.y, seg(t, p.t5, p.t5 + 250)), 0.5, 1, 1);
    },
  };

  // =============================================================== 12. sticky note "STUDY!"
  G.note = {
    label: 'Sticky note', weight: 0.8,
    find(m, env) { const w = m.win; if (!w || !w.allowed || w.max || !env) return null; const wa = w.display.workArea, r = w.r;
      if (r.y < wa.y + env.S + 12 || r.w < 360 || r.h < 260 || r.x < wa.x - 4 || r.x + r.w > wa.x + wa.width + 4) return null;
      return { spot: { x: Math.round(r.x + r.w * 0.5), y: Math.round(r.y + r.h * 0.3), w: 1, h: 1 }, win: r }; },
    plan(tg, env) {
      const win = tg.win; tg = { spot: tg.spot }; const p = base(env, tg); p.id = 'note'; const S = p.S, s = Seq(p.sx, p.sy), spot = ctr(tg.spot), x = clampX(p, spot.x - S / 2), y = win.y - S + 6;
      p.win = win; p.spot = spot; s.to(1300, x, y, 'fall', { h: hopH(p, p.sy, y, Math.max(140, p.fy - y) * 0.35 + 100), f: 1 }); p.ev.push([s.t, 'land', { vy: 700 }], [s.t, 'dust']);
      ready(p, s); p.t1 = s.t; s.hold(500, grabS(p), { f: 1 }); p.t2 = s.t; s.hold(500, 'pushing', { f: 1 }); p.ev.push([p.t2 + 150, 'squash', { a: 0.5 }]);   // slap
      p.t3 = s.t; s.hold(2200, p.ch === 'hero' ? 'flex' : 'happy', { f: 1 }); p.ev.push([p.t3 + 100, 'sparkle', { n: 6 }]);
      p.t4 = s.t; s.hold(900, 'pulling', { f: 1 }); p.t5 = s.t; s.hold(800, 'shocked', { f: 1 }); p.ev.push([p.t5, 'squash', { a: 0.4 }]); s.hold(250, 'idle'); return finish(p, s);
    },
    sprite: spriteOf,
    tf: () => ({}),
    over(g, t, p, K) {
      const sp = spriteOf(t, p), c = p.spot; let k = 0, out = 0;
      if (t >= p.t2) k = seg(t, p.t2 + 100, p.t2 + 330); if (t >= p.t4) out = sm(seg(t, p.t4 + 250, p.t5 + 650));
      if (t < p.t2 + 100 && t >= p.t1) { K.note(g, sp.x + p.S * 0.9, sp.y + p.S * 0.5, 0.2, 0.55, 1); return; }
      if (t >= p.t2 + 100 && out < 1) { const peel = t >= p.t4 ? sm(seg(t, p.t4, p.t4 + 700)) : 0, wob = k >= 1 ? 0.04 * spring((t - p.t2 - 330) / 1000, 18, 7) : 0;
        K.note(g, lerp(sp.x + p.S * 0.9, c.x, sm(k)) + out * 160, lerp(sp.y + p.S * 0.5, c.y, sm(k)) - out * 260, -0.07 + wob + peel * 0.5 + out * 5, (1.5 - 0.5 * sm(k)) * (1 - peel * 0.12), 1 - out * 0.4, peel); }
    },
  };

  // =============================================================== 13. pixel moustache on a desktop icon, then wiped
  G.moustache = {
    label: 'Desktop icon moustache', weight: 1,
    find: (m) => (m.desktop.length ? { ic: m.desktop[Math.floor(m.desktop.length / 2)] } : null),
    plan(tg, env) {
      const p = base(env, tg); p.id = 'moustache'; const S = p.S, r = tg.ic, s = Seq(p.sx, p.sy), bot = r.y + r.h, left = r.x - S * 0.8 > p.wa.x0 + 4, x = left ? r.x - S * 0.8 : r.x + r.w + 4, y = bot - S;
      p.dir = left ? 1 : -1; p.c = ctr(r); s.to(1300, x, y, 'fall', { h: hopH(p, p.sy, y, Math.max(100, p.fy - y) * 0.35 + 90), f: p.dir }); p.ev.push([s.t, 'land', { vy: 700 }], [s.t, 'dust']);
      ready(p, s); p.t1 = s.t; s.hold(900, grabS(p), { f: p.dir }); p.t2 = s.t; s.hold(1900, 'happy', { f: p.dir }); p.ev.push([p.t2 + 200, 'pulse'], [p.t2 + 900, 'pulse']);
      p.t3 = s.t; s.hold(1300, 'pushing', { f: p.dir }); p.ev.push([p.t3 + 200, 'pulse'], [p.t3 + 600, 'pulse'], [p.t3 + 1000, 'pulse']);                  // wipes it off
      p.t4 = s.t; s.hold(600, 'happy'); p.ev.push([p.t4, 'sparkle', { n: 6 }]); s.hold(250, 'idle'); return finish(p, s);
    },
    sprite: spriteOf,
    tf: () => ({}),
    over(g, t, p, K) {
      const r = p.tg.ic; if (t < p.t1 + 400) return; const pop = sm(seg(t, p.t1 + 400, p.t1 + 650)), wipe = seg(t, p.t3, p.t3 + 1100), cx = p.c.x, cy = r.y + r.h * 0.38;
      if (wipe < 1) { const edge = lerp(cx - r.w * 0.6, cx + r.w * 0.6, wipe) * (p.dir > 0 ? 1 : 1);
        K.clipRect(g, p.dir > 0 ? edge : cx - r.w, cy - 30, p.dir > 0 ? r.w * 2 : edge - (cx - r.w), 60, () => K.moustache(g, cx, cy, pop * (1 + 0.04 * Math.sin(t * 0.02)), Math.max(10, r.w * 0.5)));
        if (wipe > 0) K.text(g, '~', edge, cy, 18, '#ffffff', null, 0.8); }
    },
  };

  return { G, Seq, track, spriteOf, helpers: { cl, lerp, sm, seg, spring, hash, ctr, sg } };
});

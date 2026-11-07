'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/main/mischief/logic');
const GAGS = require('../src/mischief/gags');
const { G, spriteOf } = GAGS;
const { rng } = require('./helpers');
const K = require('../src/mischief/kit');

const D1 = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 }, scaleFactor: 1 };
const RAW = {
  bar: [0, 1032, 1920, 48],
  items: [
    { k: 'start', c: 'ToggleButton', n: '', r: [562, 1032, 45, 48] },
    ...[875, 919, 963, 1007, 1051, 1095, 1139, 1183].map(x => ({ k: 'btn', c: 'Taskbar.TaskListButtonAutomationPeer', n: '', r: [x, 1032, 44, 48] })),
    { k: 'tray', c: 'SystemTray.AccentButton', n: 'Network', r: [1749, 1032, 24, 48] }, { k: 'tray', c: 'SystemTray.OmniButtonCenter', n: 'Volume', r: [1777, 1032, 24, 48] },
    { k: 'tray', c: 'SystemTray.AccentButton', n: 'Power', r: [1805, 1032, 28, 48] }, { k: 'tray', c: 'SystemTray.OmniButton', n: 'Clock', r: [1841, 1032, 63, 48] },
  ],
  desk: [0, 1, 2, 3, 4].map(i => [30 + i * 90, 40, 75, 90]).concat([[30, 300, 75, 90]]),
  fg: { h: 99, p: 'notepad', c: 'Notepad', z: 0, i: 0, r: [300, 200, 900, 600] },
};
const conv = (r) => r;
const model = () => {
  const m = L.buildModel(RAW, conv, [D1]);
  m.text = { pw: false, caret: L.R(320, 640, 2, 20), pick: 0.5, lines: [0, 1, 2, 3, 4, 5].map(i => L.R(320, 260 + i * 26, 500 + (i % 3) * 40, 20)) };
  return m;
};
const envFor = (char, S, sx = 700) => ({ char, S, fy: 1032 - S, sx, sy: 1032 - S, wa: { x0: 0, x1: 1920, y0: 0, y1: 1032 }, db: { x0: 0, x1: 1920, y0: 0, y1: 1080 }, display: D1 });
const recorder = () => new Proxy({}, { get: (t, p) => (p === 'createLinearGradient' ? () => ({ addColorStop() {} }) : p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });

const IDS = Object.keys(G);
test('there are at least 10 distinct pranks, each with a label; crack and fishing are gone, the new taskbar/desktop gags are in', () => {
  assert.ok(IDS.length >= 10); for (const id of IDS) assert.ok(G[id].label && typeof G[id].plan === 'function' && typeof G[id].find === 'function');
  for (const gone of ['crack', 'fishing']) assert.ok(!(gone in G), gone + ' removed from the registry');
  for (const id of ['crate', 'clocksit', 'startpult', 'sled', 'peekaboo', 'sweep']) assert.ok(id in G, id);
  for (const k of ['crack', 'bandage', 'hammer', 'rod', 'arc']) assert.ok(!(k in K), 'kit prop ' + k + ' removed with its gag');
  for (const id of IDS) assert.ok(!/[–—]/.test(G[id].label), 'no dashes in the label of ' + id);
});

for (const char of ['blob', 'ghost', 'cat', 'hero']) {
  for (const id of IDS) {
    test(`gag ${id} as ${char}: plan, sprite path, events and drawing are sane`, () => {
      const env = envFor(char, char === 'hero' ? 80 : 50), m = model(), tg = G[id].find(m, env);
      assert.ok(tg && !tg.pending, 'finds a target on a typical desktop');
      const p = G[id].plan(tg, env), p2 = G[id].plan(G[id].find(model(), env), env);
      assert.deepEqual(JSON.parse(JSON.stringify(p)), JSON.parse(JSON.stringify(p2)), 'deterministic');
      const own = p.dur - (p.appr ? p.appr.ms : 0); assert.ok(own > 3000 && own <= 13500, 'duration ' + own + ' (without the walk-in) fits the 15 s cap');
      let prev = -1; for (const e of p.ev) { assert.ok(e[0] >= prev && e[0] <= p.dur, 'event order/time ' + e[1]); prev = e[0]; }
      const s0 = spriteOf(0, p); assert.ok(Math.abs(s0.x - env.sx) < 1 && Math.abs(s0.y - env.sy) < 1, 'starts exactly where the sprite is');
      const g = recorder(), T = {};
      for (const k of Object.keys(p.tg)) if (p.tg[k].w > 1) T[k] = { rect: p.tg[k], img: {}, patch: {}, lum: 0.3 };
      for (let t = 0; t <= p.dur + 200; t += 40) {
        const s = spriteOf(t, p);
        assert.ok([s.x, s.y, s.rot].every(Number.isFinite), 'finite');
        assert.ok(s.x >= -1 && s.x + env.S <= 1921, `x in display at ${t}: ${s.x}`);
        assert.ok(s.y >= -env.S * 0.5 && s.y <= 1080 + env.S, `y in range at ${t}: ${s.y}`);
        const tf = (G[id].tf && G[id].tf(t, p)) || {};
        for (const k of Object.keys(tf)) assert.ok(k in p.tg, 'tf key ' + k);
        for (const v of Object.values(tf)) for (const n of ['dx', 'dy', 'rot', 'sx', 'sy']) if (v[n] != null) assert.ok(Number.isFinite(v[n]), `tf ${n} finite at ${t}`);
        if (G[id].under) G[id].under(g, t, p, K, T); if (G[id].over) G[id].over(g, t, p, K, T);
      }
      const last = spriteOf(p.dur + 500, p); assert.equal(last.state, 'idle', 'finishes calm');
      assert.ok(p.area && p.area.w > 0 && p.area.h > 0);
    });
  }
}

test('every target is put back: at the end of each gag every transform is the identity', () => {
  const env = envFor('cat', 50), m = model();
  for (const id of IDS) {
    const p = G[id].plan(G[id].find(m, env), env), tf = (G[id].tf && G[id].tf(p.dur, p)) || {};
    for (const [k, v] of Object.entries(tf)) {
      if (v.hide) continue;   // clock/peel draw the pristine crop themselves in their last frames (checked below)
      assert.ok(Math.abs(v.dx || 0) < 1 && Math.abs(v.dy || 0) < 1 && Math.abs(((v.rot || 0) + Math.PI) % (Math.PI * 2) - Math.PI) < 0.02 && Math.abs((v.sx == null ? 1 : v.sx) - 1) < 0.03 && Math.abs((v.sy == null ? 1 : v.sy) - 1) < 0.03, `${id}.${k} home at the end: ${JSON.stringify(v)}`);
    }
  }
  const pp = G.peel.plan(G.peel.find(m, env), env); assert.ok(G.peel._k(pp.dur, pp) < 0.05, 'peel is flat again');
});

test('finders skip silently when the target is missing (no taskbar, no desktop icons, no suitable window)', () => {
  const env = envFor('blob', 50), empty = L.buildModel(null, conv, [D1]);
  for (const id of IDS) assert.equal(G[id].find(empty, env), null, id);
  const noBat = model(); noBat.battery = null; assert.ok(G.shock.find(noBat, env).ic, 'battery -> wifi/volume fallback');
  const max = model(); max.win.max = true; assert.equal(G.peel.find(max, env), null); assert.equal(G.note.find(max, env), null);
  const odd = model(); odd.win.allowed = false; for (const id of ['peel', 'text', 'note']) assert.equal(G[id].find(odd, env), null, id + ' only in allow-listed apps');
  const pw = model(); pw.text = { pw: true, lines: [] }; assert.equal(G.text.find(pw, env), null, 'password field: never');
  const nt = model(); delete nt.text; assert.deepEqual(G.text.find(nt, env), { pending: true });
});

test('text prank: stays away from the caret line', () => {
  const env = envFor('cat', 50), m = model(); m.text.caret = L.R(500, 286 + 26, 2, 20);
  const tg = G.text.find(m, env); assert.ok(Math.abs(tg.line.y - m.text.caret.y) > 20 * 3);
});

// ---------------------------------------------------------------------------------------------- walk-in
const FRAME = 1000 / 60;
const speeds = (p, t0, t1) => { let prev = spriteOf(t0, p), max = 0, n = 0; for (let t = t0 + FRAME; t <= t1; t += FRAME) { const q = spriteOf(t, p); max = Math.max(max, Math.hypot(q.x - prev.x, q.y - prev.y) / (FRAME / 1000)); prev = q; n++; } return { max, n }; };
test('walk-in: a far-away sprite travels to the start spot at a natural pace (walking speed for walkers, a slow drift for the ghost), never a fast lerp', () => {
  for (const char of ['blob', 'cat', 'hero', 'ghost']) {
    const S = char === 'hero' ? 80 : 50, ghost = char === 'ghost', bound = ghost ? 100 : 140;
    for (const id of IDS) {
      const env = envFor(char, S, 60), p = G[id].plan(G[id].find(model(), env), env);
      assert.ok(p.appr && p.appr.ms > 600, `${id}/${char}: a far sprite gets a walk-in segment`);
      const dist = Math.hypot(p.appr.x - env.sx, p.appr.y - env.sy), want = dist / (ghost ? GAGS.FLOAT : GAGS.WALK) * 1000;
      assert.ok(Math.abs(p.appr.ms - want) < 5, `${id}/${char}: duration follows the natural pace`);
      const v = speeds(p, 0, p.appr.ms); assert.ok(v.n > 30 && v.max <= bound, `${id}/${char}: max walk-in speed ${v.max.toFixed(0)} px/s <= ${bound}`);
      const mid = spriteOf(p.appr.ms / 2, p); assert.equal(mid.state, ghost ? 'idle' : 'walk', `${id}/${char}: walks (floats) while approaching`);
      const e2 = { ...envFor(char, S, p.appr.x), sy: p.appr.y }, p2 = G[id].plan(G[id].find(model(), e2), e2);
      assert.ok(!p2.appr || p2.appr.ms < 700, `${id}/${char}: a sprite already at the spot does not walk in again`);
    }
  }
});
test('walk-in: a spot up on another level (window top, desktop icon row) is reached by walking along the floor first, then the hop goes straight up', () => {
  const env = envFor('cat', 50, 60);
  for (const id of ['peel', 'note', 'moustache', 'domino', 'sled']) {
    const p = G[id].plan(G[id].find(model(), env), env), a = p.appr;
    assert.ok(a && Math.abs(a.y - p.fy) < 1, id + ': approach runs along the floor line');
    const v = speeds(p, 0, a.ms); assert.ok(v.max <= 140, id + ' walks the floor at walking speed');
    const k = p.keys.findIndex((q) => q.s === 'fall' && q.h), hop = p.keys[k], nxt = p.keys[k + 1];
    assert.ok(hop && Math.abs(hop.x - nxt.x) < 1 && nxt.y < hop.y - 100, id + ': the existing hop is vertical after the walk, not a diagonal flight across the screen');
  }
  const g = envFor('ghost', 50, 60), pg = G.moustache.plan(G.moustache.find(model(), g), g);
  assert.ok(pg.appr.y < pg.fy - 100, 'the ghost just floats straight up to an icon row'); assert.ok(speeds(pg, 0, pg.appr.ms).max <= 100);
});

// ---------------------------------------------------------------------------------------------- moustache / domino availability (mixed DPI, 2 monitors)
const MX = (primaryScale, secondaryLeft) => {
  const k = primaryScale, bw = Math.round(1920 * k), bh = Math.round(1080 * k), taskH = Math.round(48 * k);
  const DP = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 }, scaleFactor: k, phys: L.R(0, 0, bw, bh) };
  const DS = secondaryLeft
    ? { id: 2, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, workArea: { x: -1920, y: 0, width: 1920, height: 1032 }, scaleFactor: 1.5, phys: L.R(-2880, 0, 2880, 1620) }
    : { id: 2, bounds: { x: 1920, y: 0, width: 1536, height: 864 }, workArea: { x: 1920, y: 0, width: 1536, height: 824 }, scaleFactor: 1, phys: L.R(bw, 0, 1536, 864) };
  const P = (x, y, w, h) => [Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k)];
  // a perfectly normal desktop: ONE column of icons down the left edge (what Windows does), no row of four anywhere
  const raw = { bar: [0, bh - taskH, bw, taskH], items: [{ k: 'start', c: 'ToggleButton', n: '', r: P(562, 1032, 45, 48) },
      ...[875, 919, 963, 1007, 1051, 1095].map((x) => ({ k: 'btn', c: 'Taskbar.TaskListButtonAutomationPeer', n: '', r: P(x, 1032, 44, 48) })),
      { k: 'tray', c: 'SystemTray.OmniButton', n: 'Clock', r: P(1841, 1032, 63, 48) }],
    desk: [0, 1, 2, 3, 4, 5].map((i) => P(10, 10 + i * 100, 75, 90)), fg: null };
  const displays = [DP, DS], m = L.buildModel(raw, (r) => L.physToDip(r, displays), displays);
  const env = { char: 'cat', S: 60, fy: 1032 - 60, sx: 700, sy: 1032 - 60, wa: { x0: 0, x1: 1920, y0: 0, y1: 1032 }, db: { x0: 0, x1: 1920, y0: 0, y1: 1080 }, display: DP };
  return { displays, m, env };
};
for (const [label, k, left] of [['primary 150%, second monitor right at 100%', 1.5, false], ['primary 100%, second monitor on the left at 150%', 1, true], ['primary 125%, second monitor right', 1.25, false]]) {
  test(`moustache and domino are selectable and plannable with a normal one-column desktop on a 2-monitor mixed-DPI setup (${label})`, () => {
    const { m, env } = MX(k, left), ICON = ['moustache', 'domino', 'sled'];
    assert.equal(m.desktop.length, 6, 'all six icons found'); assert.equal(m.rows.length, 0, 'no horizontal row of icons on a normal desktop (this is what used to block domino)'); assert.equal(m.cols.length, 1);
    assert.ok(Math.abs(m.desktop[0].x - 10) < 1.5 && Math.abs(m.desktop[0].w - 75) < 1.5, 'icon rect converted to DIPs: ' + JSON.stringify(m.desktop[0]));
    const cands = L.candidates(G, m, env, [], rng(7)), ids = cands.map((c) => c.id);
    for (const id of ICON) assert.ok(ids.includes(id), id + ' is a candidate');
    assert.equal(cands.find((c) => c.id === 'domino').targets.mode, 'col');
    for (const c of cands.filter((q) => ICON.includes(q.id))) {
      const p = G[c.id].plan(c.targets, env); assert.ok(p.dur > 3000 && p.area.w > 0, c.id + ' plans');
      for (const r of Object.values(p.tg)) assert.ok(r.x >= 0 && r.x + r.w <= 1920 && r.y >= 0, c.id + ' targets are on the primary display where the icons are');
      for (let t = 0; t <= p.dur; t += 100) { const s = spriteOf(t, p); assert.ok(s.x >= -1 && s.x + env.S <= 1921 && s.y > -env.S, c.id + ' sprite stays on the display'); }
    }
    // icons are rarely visible: when they are, the icon gags are favoured over the all-day taskbar ones
    let first = 0; for (let sd = 1; sd <= 300; sd++) if (ICON.includes(L.candidates(G, m, env, [], rng(sd))[0].id)) first++;
    const noIcons = { ...m, desktop: [], rows: [], cols: [] }; let first0 = 0; for (let sd = 1; sd <= 300; sd++) if (ICON.includes(L.candidates(G, noIcons, env, [], rng(sd))[0].id)) first0++;
    assert.equal(first0, 0); assert.ok(first > 90, 'icon gags win often enough when the desktop is visible: ' + first + '/300');
  });
}
test('domino: a row of 3+ topples like dominoes, a column of 3+ chain-flips; both end with every icon home', () => {
  const env = envFor('cat', 50), m = model();
  const rowP = G.domino.plan(G.domino.find(m, env), env); assert.equal(rowP.mode, 'row');
  assert.ok(Math.abs(G.domino.tf(rowP.t2 + 3 * rowP.fall + 200, rowP).i0.rot) > 1.2, 'row: lying down mid-gag');
  const icons = [0, 1, 2, 3, 4].map((i) => L.R(30, 40 + i * 100, 75, 90)), colM = { ...m, rows: [], desktop: icons, cols: L.desktopCols(icons) };
  const colP = G.domino.plan(G.domino.find(colM, env), env); assert.equal(colP.mode, 'col'); assert.ok(colP.n >= 3);
  let min0 = 1, min2 = 1, first0 = 1e9, first2 = 1e9;
  for (let t = 0; t <= colP.dur; t += 20) { const tf = G.domino.tf(t, colP); min0 = Math.min(min0, tf.i0.sx); min2 = Math.min(min2, tf.i2.sx); if (tf.i0.sx < 0.9) first0 = Math.min(first0, t); if (tf.i2.sx < 0.9) first2 = Math.min(first2, t); }
  assert.ok(min0 < -0.9 && min2 < -0.9, 'each icon really flips over'); assert.ok(first2 > first0 + 150, 'one after the other, top to bottom');
  for (const v of Object.values(G.domino.tf(colP.dur, colP))) assert.ok(Math.abs(v.sx - 1) < 0.01 && Math.abs(v.dy || 0) < 0.5, 'home');
  assert.equal(G.domino.find({ ...m, rows: [], cols: [] }, env), null, 'no run of three: no domino');
});

// ---------------------------------------------------------------------------------------------- the new taskbar / desktop gags
const sample = (p, fn, step = 20) => { const out = []; for (let t = 0; t <= p.dur; t += step) out.push(fn(t)); return out; };
test('crate: the button hops out onto the taskbar edge, is pushed at a walking pace by the sprite right behind it, then springs back into its slot', () => {
  const env = envFor('cat', 50), p = G.crate.plan(G.crate.find(model(), env), env), r = p.tg.bt;
  assert.ok(G.crate.tf(p.t2 + 100, p).bt.dy < -r.h * 0.9, 'popped out above the bar');
  const sp0 = spriteOf(p.t2 + 1000, p), cr = G.crate.tf(p.t2 + 1000, p).bt, cx = p.c.x + cr.dx, scx = sp0.x + env.S / 2;
  assert.ok(Math.abs((cx - scx) * p.dir - Math.abs(p.g0)) < 12, 'the sprite stays right behind the crate while pushing');
  assert.ok(Math.abs(G.crate.tf(p.t3 - 10, p).bt.dx) >= p.P * 0.9, 'it was pushed the whole way');
  const v = speeds(p, p.t2, p.t3); assert.ok(v.max <= 130, 'push pace ' + v.max.toFixed(0) + ' px/s');
  assert.ok(Math.abs(G.crate.tf(p.t4 + 2000, p).bt.dx) < 1 && Math.abs(G.crate.tf(p.t4 + 2000, p).bt.dy) < 1, 'back in its slot');
  assert.ok(sample(p, (t) => G.crate.tf(t, p).bt.dx).some((dx) => dx * p.dir < -2), 'the spring overshoots past its slot');
});
test('clocksit: the clock is pressed by the sprite sitting on it, then hops and wobbles with each bounce, and is perfectly still afterwards', () => {
  const env = envFor('blob', 50), p = G.clocksit.plan(G.clocksit.find(model(), env), env);
  const sitting = spriteOf(p.land[0] + 800, p); assert.equal(sitting.state, 'sit'); assert.ok(Math.abs(sitting.y - p.fy) < 1, 'sits on the bar edge, on the clock');
  assert.ok(G.clocksit.tf(p.land[0] + 600, p).ck.sy < 0.96, 'its weight squashes the clock');
  const ys = sample(p, (t) => G.clocksit.tf(t, p).ck.dy), rots = sample(p, (t) => G.clocksit.tf(t, p).ck.rot);
  assert.ok(Math.min(...ys) < -1.5 && Math.max(...ys) > 5, 'it hops up and is pushed down'); assert.ok(Math.max(...rots) > 0.015 && Math.min(...rots) < -0.015, 'and wobbles');
  assert.equal(p.land.length, 4, 'one landing and three bounces');
  const end = G.clocksit.tf(p.dur, p).ck; assert.ok(Math.abs(end.dy) < 0.5 && Math.abs(end.rot) < 0.01 && Math.abs(end.sy - 1) < 0.01 && Math.abs(end.sx - 1) < 0.01);
});
test('startpult: the Start button is pressed down, then flings the sprite in a high spinning arc across the taskbar; the button springs back up', () => {
  const env = envFor('cat', 50), p = G.startpult.plan(G.startpult.find(model(), env), env);
  assert.ok(G.startpult.tf(p.t2 - 10, p).st.sy < 0.7, 'pressed all the way down before the launch');
  assert.ok(Math.max(...sample(p, (t) => (t >= p.t2 ? G.startpult.tf(t, p).st.sy : 1))) > 1.08, 'springs back past its normal size');
  let minY = 1e9; for (let t = p.t2; t <= p.t2 + 1150; t += 20) minY = Math.min(minY, spriteOf(t, p).y); assert.ok(p.fy - minY > 150, 'high arc: ' + (p.fy - minY));
  assert.ok(Math.abs(spriteOf(p.t2 + 1200, p).x - p.x2) < 1 && Math.abs(p.x2 - spriteOf(p.t2 - 1, p).x) >= 250, 'lands a good way along the bar, still on screen');
  assert.ok(spriteOf(p.t2 + 500, p).rot !== 0, 'spinning in flight');
  const end = G.startpult.tf(p.dur, p).st; assert.ok(Math.abs(end.dy) < 0.5 && Math.abs(end.sy - 1) < 0.01);
});
test('sled: the icon is towed across the desktop behind the sprite on a rope at a walking pace, coasts, then slingshots home', () => {
  const env = envFor('cat', 50), m = model(), p = G.sled.plan(G.sled.find(m, env), env);
  const mid = G.sled.tf(p.t3 - 20, p).ic, sp = spriteOf(p.t3 - 20, p); assert.ok(Math.abs(mid.dx) > 100 && Math.abs(mid.dx - (sp.x - p.x0)) < 14, 'follows the sprite on its rope: ' + mid.dx);
  assert.ok(Math.abs(G.sled.tf(p.t3 + 500, p).ic.dx) > Math.abs(mid.dx), 'coasts a little past where the sprite stopped');
  const v = speeds(p, p.t2, p.t3); assert.ok(v.max <= 130, 'tow pace ' + v.max.toFixed(0) + ' px/s');
  assert.ok(Math.abs(G.sled.tf(p.dur, p).ic.dx) < 0.5 && Math.abs(G.sled.tf(p.dur, p).ic.rot) < 0.01, 'home');
  const ropes = [], g2 = recorder(), K2 = { ...K, line: (...a) => ropes.push(a) }; G.sled.over(g2, p.t2 + 600, p, K2, {}); assert.equal(ropes.length, 1, 'rope drawn while towing'); G.sled.over(g2, p.dur, p, K2, {}); assert.equal(ropes.length, 1, 'and gone at the end');
  const tight = model(); tight.desktop = [L.R(900, 40, 75, 90)]; const e2 = { ...env, wa: { x0: 800, x1: 1200, y0: 0, y1: 1032 } }; assert.equal(G.sled.find(tight, e2), null, 'no room to tow it: skipped');
  assert.ok(G.sled.find(tight, env), 'plenty of room on the real display');
});
test('peekaboo: it ducks below the taskbar edge (clipped away), slips under the button which bumps, and pops up on the other side', () => {
  const env = envFor('ghost', 50), p = G.peekaboo.plan(G.peekaboo.find(model(), env), env);
  const hidden = spriteOf(p.t1 + 300 + 420 + 300, p); assert.equal(hidden.clip, p.gy, 'clipped at the taskbar line'); assert.ok(hidden.y >= p.gy, 'fully below it: invisible');
  const eyes = spriteOf(p.t2 + 380 + 200, p); assert.ok(eyes.y < p.gy - 10 && eyes.y > p.gy - p.S * 0.6, 'only the eyes show');
  assert.ok(Math.abs(spriteOf(p.t2 + 100, p).x - p.xl) < 1 && Math.abs(spriteOf(p.t4 + 380 + 100, p).x - p.xr) < 1 && p.xr > p.xl + 20, 'left side first, then the right side');
  const bump = Math.min(...sample(p, (t) => (t >= p.t3 && t < p.t4 ? G.peekaboo.tf(t, p).bt.dy : 0))); assert.ok(bump < -5, 'the button bumps as it slides under: ' + bump);
  assert.equal(spriteOf(p.dur, p).clip, null, 'ends visible, standing on the bar'); const end = G.peekaboo.tf(p.dur, p).bt; assert.ok(Math.abs(end.dy) < 0.5 && Math.abs(end.rot) < 0.01);
});
test('sweep: it sweeps along the taskbar edge at a steady walk, the dust in front of the broom disappears into a pile, and the pile is flicked away', () => {
  const env = envFor('hero', 80), p = G.sweep.plan(G.sweep.find(model(), env), env);
  const v = speeds(p, p.t2, p.t3); assert.ok(v.max <= 100, 'sweeping pace ' + v.max.toFixed(0) + ' px/s'); assert.ok(Math.abs(p.x1 - p.sx0) >= 200, 'covers a good stretch of the bar');
  assert.ok(Math.abs(spriteOf(p.t2 + 50, p).y - p.fy) < 1 && Math.abs(spriteOf((p.t2 + p.t3) / 2, p).y - p.fy) < 1, 'on the floor line the whole time');
  let n = 0; const K2 = { ...K, px: () => { n++; } }, g = recorder(), count = (t) => { n = 0; G.sweep.over(g, t, p, K2, {}); return n; };
  const before = count(p.t2 - 10), midSweep = count(p.t2 + (p.t3 - p.t2) * 0.6), after = count(p.t4 + 300);
  assert.ok(before >= 20, 'specks of dust lie along the bar: ' + before); assert.ok(midSweep < before + 12 && midSweep > 0, 'fewer specks ahead of the broom, a growing pile at it'); assert.equal(after, 0, 'the pile is gone after the flick');
  assert.equal(G.sweep.find(L.buildModel(null, conv, [D1]), env), null);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/main/mischief/logic');
const { G, spriteOf } = require('../src/mischief/gags');
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
test('there are at least 10 distinct pranks, each with a label', () => { assert.ok(IDS.length >= 10); for (const id of IDS) assert.ok(G[id].label && typeof G[id].plan === 'function' && typeof G[id].find === 'function'); });

for (const char of ['blob', 'ghost', 'cat', 'hero']) {
  for (const id of IDS) {
    test(`gag ${id} as ${char}: plan, sprite path, events and drawing are sane`, () => {
      const env = envFor(char, char === 'hero' ? 80 : 50), m = model(), tg = G[id].find(m, env);
      assert.ok(tg && !tg.pending, 'finds a target on a typical desktop');
      const p = G[id].plan(tg, env), p2 = G[id].plan(G[id].find(model(), env), env);
      assert.deepEqual(JSON.parse(JSON.stringify(p)), JSON.parse(JSON.stringify(p2)), 'deterministic');
      assert.ok(p.dur > 3000 && p.dur <= 13500, 'duration ' + p.dur + ' fits the 15 s cap');
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
  noBat.wifi = null; assert.equal(G.fishing.find(noBat, env).mode, 'blow', 'no Wi-Fi: volume gets blown over');
  const max = model(); max.win.max = true; assert.equal(G.peel.find(max, env), null); assert.equal(G.note.find(max, env), null);
  const odd = model(); odd.win.allowed = false; for (const id of ['peel', 'text', 'crack', 'note']) assert.equal(G[id].find(odd, env), null, id + ' only in allow-listed apps');
  const pw = model(); pw.text = { pw: true, lines: [] }; assert.equal(G.text.find(pw, env), null, 'password field: never');
  const nt = model(); delete nt.text; assert.deepEqual(G.text.find(nt, env), { pending: true });
});

test('text prank: stays away from the caret line', () => {
  const env = envFor('cat', 50), m = model(); m.text.caret = L.R(500, 286 + 26, 2, 20);
  const tg = G.text.find(m, env); assert.ok(Math.abs(tg.line.y - m.text.caret.y) > 20 * 3);
});

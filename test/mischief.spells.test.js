'use strict';
// Merlo's spells: portal, cauldron, fireball, levitate, weather, conjure. Pure plans and drawing (no Electron), the pick weighting, and the manager running them end to end.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/main/mischief/logic');
const { createManager } = require('../src/main/mischief/manager');
const GAGS = require('../src/mischief/gags');
const SP = require('../src/mischief/spells');
const K = require('../src/mischief/kit');
const { freshEngine, rng } = require('./helpers');
const { G: GG, spriteOf, Seq, track } = GAGS, { G, IDS } = SP, ctr = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

const D1 = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 }, scaleFactor: 1, phys: L.R(0, 0, 1920, 1080) };
const RAW = {
  bar: [0, 1032, 1920, 48],
  items: [{ k: 'start', c: 'ToggleButton', n: '', r: [562, 1032, 45, 48] }, ...[875, 919, 963, 1007, 1051, 1095, 1139, 1183].map(x => ({ k: 'btn', c: 'Taskbar.TaskListButtonAutomationPeer', n: '', r: [x, 1032, 44, 48] })),
    { k: 'tray', c: 'SystemTray.OmniButton', n: 'Clock', r: [1841, 1032, 63, 48] }],
  desk: [0, 1, 2, 3, 4].map(i => [30, 60 + i * 110, 75, 90]),
  fg: { h: 99, p: 'notepad', c: 'Notepad', z: 0, i: 0, r: [500, 150, 1000, 700] },
};
const LINES = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => L.R(520, 200 + i * 26, 300 + (i % 4) * 150, 20 + (i % 3)));   // text lines of the notepad window
const model = (over = {}, text = true) => { const m = L.buildModel(Object.assign({}, RAW, over), (r) => r, [D1]); if (text) m.text = { pw: false, caret: L.R(520, 700, 2, 20), pick: 0.5, lines: LINES }; return m; };
const envFor = (char, S = 72, sx = 700, R = rng(5)) => ({ char, S, rand: R, fy: 1032 - S, sx, sy: 1032 - S, wa: { x0: 0, x1: 1920, y0: 0, y1: 1032 }, db: { x0: 0, x1: 1920, y0: 0, y1: 1080 }, display: D1 });
const recorder = () => new Proxy({}, { get: (t, p) => (p === 'createLinearGradient' || p === 'createRadialGradient' ? () => ({ addColorStop() {} }) : p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
const fakeImgs = () => { const o = {}; for (const k of ['portal0', 'portal1', 'portal2', 'portal3', 'cauldron0', 'cauldron1', 'cauldron2', 'smoke', 'potion_red', 'potion_blue', 'potion_green', 'potion_pink', 'fireball0', 'fireball1', 'cloud', 'cloud_white', 'rainbow', 'owl0', 'owl1', 'bunny', 'book', 'star', 'flower', 'frog_small', 'anvil', 'duck', 'rune0', 'rune1', 'rune2']) o[k] = { width: 16, height: 16 }; return o; };

// every spell with every variant of its random choices, as find() would hand them to plan()
const VARIANTS = {
  portal: [{ item: '' }, { item: 'duck' }, { item: 'anvil' }, { item: 'frog' }],
  cauldron: [0, 1, 2, 3].flatMap((pot) => [0, 1, 2, 3].map((fxn) => ({ pot, fxn }))),
  weather: ['storm', 'snow', 'sun'].map((v) => ({ v })),
  conjure: ['bunny', 'owl', 'rain'].flatMap((v) => ['flower', 'star'].map((it) => ({ v, it }))),
};
const targetsFor = (id, env, m) => {
  if (VARIANTS[id]) return VARIANTS[id];
  const a = G[id].find(m, envFor('wizard', env.S, env.sx, () => 0.1)), w = G[id].find(model({ desk: [] }), env), w2 = G[id].find(model({ desk: [] }), envFor('wizard', env.S, env.sx, () => 0.9));   // an icon, and two text crops
  return [a, w, w2].filter((q) => q && !q.pending);
};

test('six spells exist, each with a label without dashes, flagged as spells, and none of them is in the ordinary gag registry', () => {
  assert.deepEqual([...IDS].sort(), ['cauldron', 'conjure', 'fireball', 'levitate', 'portal', 'weather']);
  for (const id of IDS) { assert.ok(G[id].label && G[id].spell === true && typeof G[id].plan === 'function', id); assert.ok(!/[–—]/.test(G[id].label)); assert.ok(!(id in GG), id + ' stays out of gags.js'); }
});

test('find() is null for every other buddy and for a missing desktop; the wizard finds all six on a normal desktop', () => {
  for (const char of ['blob', 'ghost', 'cat', 'hero', undefined]) for (const id of IDS) assert.equal(G[id].find(model(), envFor(char)), null, `${id} as ${char}`);
  for (const id of IDS) assert.ok(G[id].find(model(), envFor('wizard')), id + ' as wizard');
  const empty = L.buildModel(null, (r) => r, [D1]); for (const id of ['fireball', 'levitate']) assert.equal(G[id].find(empty, envFor('wizard')), null, id + ' needs a target');
  for (const id of ['portal', 'cauldron', 'weather', 'conjure']) assert.ok(G[id].find(empty, envFor('wizard')), id + ' is targetless');
  const nar = envFor('wizard', 72, 200); nar.wa = { x0: 0, x1: 400, y0: 0, y1: 1032 }; for (const id of ['portal', 'weather', 'conjure']) assert.equal(G[id].find(model(), nar), null, id + ' skips a display too narrow for it');
  const bad = model(); bad.win.allowed = false; bad.desktop = []; for (const id of ['fireball', 'levitate']) assert.equal(G[id].find(bad, envFor('wizard')), null, id + ' only in allow-listed apps');
});

for (const S of [60, 72, 80]) for (const sx of [700, 90, 1800]) for (const id of IDS) {
  test(`spell ${id} (S ${S}, sprite at x ${sx}): every variant plans, stays on screen, ends calm with sc 1 / hue 0 / alpha 1, and draws with and without the art`, () => {
    const env = envFor('wizard', S, sx), m = model(), tgs = targetsFor(id, env, m); assert.ok(tgs.length > 0);
    for (const tg of tgs) {
      const p = G[id].plan(tg, env), p2 = G[id].plan(tg, env); assert.deepEqual(JSON.parse(JSON.stringify(p)), JSON.parse(JSON.stringify(p2)), 'deterministic');
      const own = p.dur - (p.appr ? p.appr.ms : 0); assert.ok(own >= 6900 && own <= 13000, `${id} ${JSON.stringify(tg)} lasts ${own} ms: 7 to 13 s`);
      assert.ok(own + 100 < L.CAP_MS, 'under the 15 s cap (the walk-in happens before the overlay and its clock)');
      let prev = -1; for (const e of p.ev) { assert.ok(e[0] >= prev && e[0] <= p.dur, 'event order ' + e[1]); prev = e[0]; }
      const s0 = spriteOf(0, p); assert.ok(Math.abs(s0.x - env.sx) < 1 && Math.abs(s0.y - env.sy) < 1, 'starts exactly where the sprite stands');
      for (let t = 0; t <= p.dur + 300; t += 25) {
        const s = spriteOf(t, p);
        assert.ok([s.x, s.y, s.rot, s.sc, s.hue, s.alpha].every(Number.isFinite), 'finite at ' + t);
        assert.ok(s.x >= env.wa.x0 - 1 && s.x + S <= env.wa.x1 + 1, `x on screen at ${t}: ${s.x}`); assert.ok(s.y >= env.wa.y0 && s.y <= env.wa.y1 - S + 2.5, `y in the work area (a zap shake may dip a pixel or two) at ${t}: ${s.y}`);
        assert.ok(s.sc >= 0.3 - 1e-9 && s.sc <= 1 + 1e-9 && s.alpha >= -1e-9 && s.alpha <= 1 + 1e-9 && s.hue >= 0 && s.hue < 360, `fx ranges at ${t}: ${s.sc} ${s.alpha} ${s.hue}`);
        const tf = (G[id].tf && G[id].tf(t, p)) || {}; for (const k of Object.keys(tf)) assert.ok(k in p.tg, 'tf key ' + k);
        for (const v of Object.values(tf)) for (const n of ['dx', 'dy', 'rot', 'sx', 'sy']) if (v[n] != null) assert.ok(Number.isFinite(v[n]), n);
      }
      const last = spriteOf(p.dur + 500, p); assert.equal(last.state, 'idle'); assert.ok(Math.abs(last.sc - 1) < 1e-9 && Math.abs(last.alpha - 1) < 1e-9 && last.hue === 0, `defaults at the end: ${last.sc} ${last.alpha} ${last.hue}`);
      const endTf = (G[id].tf && G[id].tf(p.dur, p)) || {}; for (const v of Object.values(endTf)) assert.ok(Math.abs(v.dx || 0) < 0.5 && Math.abs(v.dy || 0) < 0.5 && Math.abs(v.rot || 0) < 0.01 && Math.abs((v.sy == null ? 1 : v.sy) - 1) < 0.01, 'the crop is home at the end: ' + JSON.stringify(v));
      // drawing: against the recording context, with the art missing and with it present
      const T = {}; for (const k of Object.keys(p.tg)) T[k] = { rect: p.tg[k], img: {}, patch: {}, lum: 0.3 };
      for (const imgs of [undefined, fakeImgs()]) {
        globalThis.SPELL_IMG = imgs; const g = recorder();
        try { for (let t = 0; t <= p.dur + 200; t += 40) { if (G[id].under) G[id].under(g, t, p, K, T); if (G[id].over) G[id].over(g, t, p, K, T); } } finally { delete globalThis.SPELL_IMG; }
      }
      // the overlay is only the box the spell needs: never the whole display, always inside it
      const pp = p.appr ? G[id].plan(tg, { ...env, sx: p.appr.x, sy: p.appr.y }) : p, box = L.overlayBox(pp.area, D1.bounds);   // the manager walks the sprite to the start spot first and plans again from there
      assert.ok(box.w <= 1904 && box.h <= 1064 && box.w * box.h < 0.9 * 1920 * 1080, `box ${box.w}x${box.h}`);
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 1920 && box.y + box.h <= 1080);
      for (const r of p.pr || []) assert.ok(r.w > 0 && r.h > 0 && Number.isFinite(r.x + r.y));
      assert.ok(p.area.w > 0 && p.area.h > 0); JSON.stringify(p);   // structured-clone friendly: it travels to the overlay page
    }
  });
}

test('the spell props stay inside the overlay box (no clipped portal, cloud or rune circle)', () => {
  for (const id of ['portal', 'cauldron', 'weather', 'conjure']) for (const tg of VARIANTS[id]) for (const sx of [100, 700, 1700]) {
    const env = envFor('wizard', 72, sx), p = G[id].plan(tg, env), box = L.overlayBox(p.area, D1.bounds);
    for (const r of p.pr) assert.ok(r.x >= box.x - 1 && r.y >= box.y - 1 && r.x + r.w <= box.x + box.w + 1 && r.y + r.h <= box.y + box.h + 1, `${id} prop ${JSON.stringify(r)} in box ${JSON.stringify(box)}`);
  }
});

test('Seq.set / track: sc, hue and alpha ease between keys, default to 1 / 0 / 1, and the end key restores them (a whole turn of hue ends at 0)', () => {
  const plain = Seq(0, 0).hold(500, 'walk'), ks0 = plain.end(); const d = track(100, ks0); assert.deepEqual([d.sc, d.hue, d.alpha], [1, 0, 1]);
  const s = Seq(0, 0); s.set({ sc: 1 }); s.hold(1000, 'cast'); s.set({ sc: 0.5, alpha: 0, hue: 360 }); s.hold(1000, 'idle'); s.set({ sc: 1, alpha: 1, hue: 360 }); s.hold(500, 'idle'); const ks = s.end();
  const mid = track(500, ks); assert.ok(mid.sc > 0.7 && mid.sc < 0.9 && mid.alpha > 0.4 && mid.alpha < 0.6 && mid.hue > 100 && mid.hue < 260, JSON.stringify(mid));
  const end = track(5000, ks); assert.deepEqual([end.sc, end.hue, end.alpha], [1, 0, 1]);
  assert.ok(track(1000, ks).hue < 1 || track(1000, ks).hue > 359, 'a full turn is the same hue as none');
});

test('the dev prank ids exist for the manager: all six spells are in the registry it plays', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'main', 'mischief', 'manager.js'), 'utf8'); assert.ok(/require\('\.\.\/\.\.\/mischief\/spells'\)/.test(src) && /SPELLS\.G/.test(src));
});

// ---------------------------------------------------------------------------------------------- targeted spells
test('fireball and levitate only pick small clean things: a desktop icon (preferred), else a short stretch of ONE text line (max 4 sprites wide, 1.2 high, inside the window, clear of the caret)', () => {
  for (const S of [60, 72, 80, 110]) for (const id of ['fireball', 'levitate']) {
    const env = envFor('wizard', S, 700), icon = G[id].find(model(), env); assert.ok(icon && !icon.text && model().desktop.some((r) => L.sameRect(r, icon.tgt, 0)), 'icons first, even with a window in front');
    assert.ok(icon.tgt.w <= S * 4 && icon.tgt.h <= S * 2, 'icon size');
    const noIc = model({ desk: [] }, false); assert.deepEqual(G[id].find(noIc, env), { pending: true }, 'needs the text pass first (like the text gag)'); assert.equal(G[id].needsText, true);
    for (const rd of [0.05, 0.5, 0.95]) {
      const tg = G[id].find(model({ desk: [] }), envFor('wizard', S, 700, () => rd)), r = tg.tgt; assert.ok(tg.text === true && r, 'a text crop');
      assert.ok(r.w <= S * 4 + 1 && r.h <= S * 1.2 + 0.5 && r.w >= 80 * 0.99 && r.h >= 8, `small: ${r.w}x${r.h} for S ${S}`);
      assert.ok(LINES.some((l) => r.x >= l.x && r.x + r.w <= l.x + l.w + 1 && Math.abs(r.y - l.y) < 1 && Math.abs(r.h - l.h) < 1), 'one single text line, no more');
      assert.ok(Math.abs(r.y - 700) > r.h * 3 + 12, 'not near the caret'); assert.ok(L.within(r, L.R(500, 150, 1000, 700)), 'inside the window');
      const p = G[id].plan(tg, env); assert.equal(p.text, true, 'plan tells the manager to watch the caret'); assert.equal(G[id].plan(icon, env).text, false);
    }
    const pw = model({ desk: [] }); pw.text = { pw: true, lines: [] }; assert.equal(G[id].find(pw, env), null, 'password field: never');
    const tall = model({ desk: [] }); tall.text.lines = [L.R(520, 300, 600, 200)]; assert.equal(G[id].find(tall, env), null, 'a big block of text is never a target');
  }
  const max = model({ fg: { h: 99, p: 'chrome', c: 'Chrome', z: 1, i: 0, r: [0, 0, 1920, 1032] }, desk: [] }); max.text.lines = LINES;
  for (const id of ['fireball', 'levitate']) { const t = G[id].find(max, envFor('wizard')); assert.ok(t && t.text && t.tgt.w <= 72 * 4, id + ' works on a maximised allowed window (a line, not a block)'); }
});

test('fireball finds exactly what levitate finds (and more): same targets on the same screen, notepad in front or not, icons or not, any sprite position', () => {
  const wins = [[500, 150, 1000, 700], [0, 0, 1920, 1032], [100, 100, 500, 400], [1300, 200, 600, 700], [700, 40, 900, 300]];
  for (const S of [60, 72, 140]) for (const sx of [20, 400, 700, 1200, 1800]) for (const r of wins) for (const desk of [true, false]) for (const rd of [0.1, 0.5, 0.9]) {
    const mm = model({ fg: { h: 99, p: 'notepad', c: 'Notepad', z: 0, i: 0, r }, desk: desk ? RAW.desk : [] }); mm.text.lines = LINES.map((l) => L.R(l.x + (r[0] - 500), l.y + (r[1] - 150), l.w, l.h)).filter((l) => l.x + l.w < r[0] + r[2] && l.y + l.h < r[1] + r[3]);
    const e = () => envFor('wizard', S, sx, () => rd), a = G.fireball.find(mm, e()), b = G.levitate.find(mm, e());
    if (b) { assert.ok(a, `fireball must find when levitate does: S ${S} sx ${sx} win ${r} desk ${desk}`); assert.equal(!!a.pending, !!b.pending); }
  }
  const hasText = model({ desk: [] }); assert.ok(G.fireball.find(hasText, envFor('wizard')) && G.levitate.find(hasText, envFor('wizard')), 'a notepad in front with text: both find a line');
});

test('time budget: plan duration INCLUDING the walk-in stays under the manager cap minus 1.5 s for every spell, variant, sprite size and position; targetless spells cast where the wizard stands', () => {
  for (const S of [60, 72, 80, 110, 140]) for (const sx of [0, 60, 300, 700, 960, 1500, 1860 - S]) for (const id of IDS) {
    const env = envFor('wizard', S, sx), m = model(), tgs = (VARIANTS[id] || [G[id].find(m, env), G[id].find(model({ desk: [] }), env)]).filter((q) => q && !q.pending);
    if (VARIANTS[id] && !G[id].find(m, env)) { for (const x of [G[id].find(m, env)]) assert.equal(x, null); continue; }   // too near an edge to cast without walking: not picked
    for (const tg of tgs) {
      const p = G[id].plan(tg, env); assert.ok(p.dur < L.CAP_MS - 1500, `${id} S ${S} sx ${sx} ${JSON.stringify(tg).slice(0, 40)}: total ${Math.round(p.dur)} ms incl. walk-in`);
      if (VARIANTS[id]) { const walk = p.appr ? p.appr.ms : 0; assert.ok(walk <= 1100, `${id} S ${S} sx ${sx}: shuffle ${walk} ms`); if (id === 'portal' || id === 'cauldron') assert.ok(!p.appr, id + ' never walks first'); }
      else if (p.appr) assert.ok(p.appr.ms <= 3400, `${id}: walk-in ${p.appr.ms}`);
    }
  }
  for (const id of ['portal', 'cauldron']) for (const x of [0, 960, 1860]) assert.ok(G[id].find(model(), envFor('wizard', 72, x)), id + ' can be cast anywhere along the floor');
  for (const id of ['fireball', 'levitate']) { const far = envFor('wizard', 72, 1800); assert.equal(G[id].find(model({ desk: [] }, false), far).pending, true); const m2 = model(); const t = G[id].find(m2, far); assert.ok(!t || (t.tgt && Math.abs(t.tgt.x + t.tgt.w / 2 - 1836) <= 1400), 'no target further than a short walk'); }
});

test('fireball: charge, an arc to the target, scorch (crop wobbles, darkened, flames, smoke), then Oops! Undo spell! and the crop is restored', () => {
  const env = envFor('wizard', 72), tg = G.fireball.find(model(), envFor('wizard', 72, 700, () => 0.1)), p = G.fireball.plan(tg, env), K2 = { ...K }, flashes = [];
  K2.flash = (g, r, c, a) => flashes.push([c, a]); assert.equal(spriteOf(p.t1 + 400, p).state, 'point');
  assert.ok(Math.abs(G.fireball.tf(p.tH + 600, p).tgt.dx) + Math.abs(G.fireball.tf(p.tH + 600, p).tgt.rot) > 0.3, 'the crop wobbles while it burns');
  const u0 = G.fireball.tf(p.tL, p).tgt; assert.ok(Math.abs(u0.dx) + Math.abs(u0.dy) + Math.abs(u0.rot) === 0 && u0.sy === 1, 'untouched before the hit');
  const g = recorder(); G.fireball.over(g, p.tH + 1000, p, K2, {}); assert.ok(flashes.some(([c, a]) => c === '#120700' && a > 0.3), 'darkened');
  const pop = p.ev.find((e) => e[1] === 'popup'); assert.equal(pop[2].text, 'Oops! Undo spell!'); assert.ok(pop[0] >= p.tU && spriteOf(p.tU + 400, p).state === 'cast', 'waves cast while undoing');
  flashes.length = 0; G.fireball.over(g, p.tR + 1200, p, K2, {}); assert.ok(!flashes.some(([c]) => c === '#120700'), 'no scorch after the undo');
  const home = G.fireball.tf(p.dur, p).tgt; assert.ok(Math.abs(home.dx) < 0.5 && Math.abs(home.dy) < 0.5 && Math.abs(home.rot) < 0.01 && Math.abs(home.sy - 1) < 0.01);
});

test('levitate: the crop lifts well off its spot, sways and tilts gently, and settles back exactly in place', () => {
  const env = envFor('wizard', 72), tg = G.levitate.find(model(), envFor('wizard', 72, 700, () => 0.1)), p = G.levitate.plan(tg, env);
  assert.equal(spriteOf(p.tP + 800, p).state, 'cast2');
  let minDy = 0, maxRot = 0, maxDx = 0; for (let t = 0; t <= p.dur; t += 20) { const o = G.levitate.tf(t, p).tgt; minDy = Math.min(minDy, o.dy); maxRot = Math.max(maxRot, Math.abs(o.rot)); maxDx = Math.max(maxDx, Math.abs(o.dx)); }
  assert.ok(minDy < -20 && p.tg.tgt.y + minDy > 0, 'lifted and still on screen: ' + minDy); assert.ok(maxRot > 0.02 && maxRot <= 0.1, 'gentle tilt ' + maxRot); assert.ok(maxDx > 2 && maxDx < 12, 'gentle sway');
  const home = G.levitate.tf(p.dur, p).tgt; assert.ok(Math.abs(home.dx) < 0.1 && Math.abs(home.dy) < 0.1 && Math.abs(home.rot) < 0.001 && Math.abs(home.sy - 1) < 0.001, JSON.stringify(home));
  const top = ctr(p.tg.tgt); assert.ok(top.y - p.tg.tgt.h / 2 + minDy - 30 > 0, 'tilted corners stay on screen');
});

// ---------------------------------------------------------------------------------------------- the individual choreographies
test('portal: steps into a portal beside it (shrinking and fading), reappears at another portal far along the same floor; the 30% variant drops something out first and the wizard comes out surprised', () => {
  const env = envFor('wizard', 72, 600), p = G.portal.plan({ item: '' }, env); assert.ok(Math.abs(p.bx - p.ax) >= 72 * 3 && Math.abs(p.bx - p.ax) <= 800, 'exit well away from the entrance');
  assert.equal(spriteOf(p.t1 + 700, p).state, 'cast'); assert.ok(spriteOf(p.t2 - 10, p).alpha < 0.05 && spriteOf(p.t2 - 10, p).sc < 0.5, 'gone into the portal');
  let sawWalk = false; for (let t = p.t1 + 1500; t < p.t2; t += 30) { const s = spriteOf(t, p); if (s.state === 'walk') sawWalk = true; assert.ok(Math.abs(s.y - p.fy) < 1); } assert.ok(sawWalk, 'it walks in');
  assert.ok(spriteOf(p.tE + 1300, p).alpha > 0.95 && Math.abs(spriteOf(p.tE + 1300, p).x + 36 - p.bx) > 20 && Math.abs(spriteOf(p.tE + 2300, p).x + 36 - p.bx) > 60, 'steps out of the exit');
  const pv = G.portal.plan({ item: 'anvil' }, env); assert.ok(pv.tE > pv.tD + 1000 && pv.dur > p.dur + 900, 'something drops out first');
  assert.ok(G.portal._item(pv.tD + 100, pv) && G.portal._item(pv.tD + 2000, pv).y > pv.gy - 72, 'the thing lands on the floor'); assert.equal(G.portal._item(pv.tD - 1, pv), null);
  let surprised = false; for (let t = pv.tE; t < pv.tE + 1600; t += 30) if (spriteOf(t, pv).state === 'surprised') surprised = true; assert.ok(surprised, 'wizard pops out surprised'); assert.equal(G.portal.plan({ item: '' }, env).item, '');
  const hits = { n: 0 }; globalThis.SPELL_IMG = fakeImgs(); const g = recorder(), im = g.drawImage; g.drawImage = (...a) => { hits.n++; return im(...a); };
  try { G.portal.over(g, p.tB + 150, p, K, {}); } finally { delete globalThis.SPELL_IMG; } assert.ok(hits.n >= 2, 'the closing and the opening portal are drawn from the art');
  const left = G.portal.plan({ item: '' }, envFor('wizard', 72, 1700)); assert.ok(left.dir === -1 && left.bx < left.ax, 'goes toward the side with more room');
});

test('cauldron: all four effects work (shrink to about 0.45 for 2 s, hue cycle, vanish and reappear, frog hops), after stir, bottle and drink; the cauldron poofs away', () => {
  const env = envFor('wizard', 72), at = (fxn) => G.cauldron.plan({ pot: 1, fxn }, env), seen = (p, a, b, f) => { const o = []; for (let t = a; t < b; t += 25) o.push(f(spriteOf(t, p))); return o; };
  const p0 = at(0); assert.deepEqual([spriteOf(p0.t2 + 500, p0).state, spriteOf(p0.t3 + 500, p0).state, spriteOf(p0.t4 + 500, p0).state], ['stir', 'pull', 'drink']);
  assert.ok(p0.t2 > p0.t1 && p0.t3 > p0.t2 && p0.t4 > p0.t3 && p0.t5 > p0.t4 && p0.t6 > p0.t5, 'order: conjure, stir, bottle, drink, effect, poof');
  const small = seen(p0, p0.t5, p0.t6, (s) => s.sc), low = small.filter((v) => v < 0.46).length * 25; assert.ok(Math.min(...small) <= 0.45 + 1e-9 && low >= 2000, 'shrunk to 0.45 for at least 2 s: ' + low);
  const p1 = at(1), hues = seen(p1, p1.t5, p1.t6, (s) => s.hue); assert.ok(Math.max(...hues) > 300 && hues.some((h) => h > 100 && h < 200), 'the hue sweeps the whole wheel');
  const p2 = at(2), al = seen(p2, p2.t5, p2.t6, (s) => s.alpha); assert.ok(Math.min(...al) < 0.01 && al[al.length - 1] > 0.99 && al.filter((v) => v < 0.01).length * 25 >= 1000, 'fades out, stays gone a moment, comes back');
  const p3 = at(3), st = seen(p3, p3.t5, p3.t6, (s) => s.state); assert.ok(st.filter((s) => s === 'frog').length > 20, 'frog form'); assert.ok(seen(p3, p3.t5, p3.t6, (s) => s.y).some((y) => y < p3.fy - 8), 'the frog hops');
  assert.ok(p0.fxS.length > 0);
  const fl = G.cauldron.plan({ pot: 0, fxn: 0 }, env); let potion = 0; const A = { ...K }, g = recorder(); globalThis.SPELL_IMG = fakeImgs();
  try { const dr = g.drawImage; g.drawImage = (...a) => { potion++; return dr(...a); }; G.cauldron.over(g, fl.t3 + 700, fl, A, {}); } finally { delete globalThis.SPELL_IMG; } assert.ok(potion >= 2, 'cauldron and potion drawn');
});

test('weather: a storm zaps the wizard (surprised, smoke), snow builds a little pile, sunshine clears the cloud and a rainbow appears; the cloud sits over the wizard', () => {
  const env = envFor('wizard', 72), st = G.weather.plan({ v: 'storm' }, env), sn = G.weather.plan({ v: 'snow' }, env), su = G.weather.plan({ v: 'sun' }, env);
  assert.equal(spriteOf(st.t1 + 700, st).state, 'cast2'); assert.equal(spriteOf(st.tZ + 400, st).state, 'surprised'); assert.ok(st.ev.some((e) => e[1] === 'smoke') && st.jit.length === 1, 'zapped: smoke and a shake');
  const bolts = []; const K2 = { ...K, bolt: (...a) => bolts.push(a) }, g = recorder(); G.weather.over(g, st.tZ + 30, st, K2, {}); assert.ok(bolts.length >= 1, 'lightning bolt drawn at the strike'); bolts.length = 0; G.weather.over(g, st.tR + 500, st, K2, {}); assert.equal(bolts.length, 0, 'none before it');
  const px = []; const K3 = { ...K, px: (g2, x, y, w, h, c) => px.push(c) }; G.weather.over(g, sn.tR + 3000, sn, K3, {}); assert.ok(px.filter((c) => c === '#ffffff').length > 20 && px.some((c) => /^#(e3eefb|f6faff)$/.test(c)), 'flakes and a pile');
  px.length = 0; G.weather.over(g, sn.dur, sn, K3, {}); assert.ok(!px.some((c) => /^#(e3eefb|f6faff)$/.test(c)), 'the pile has melted at the end');
  let rb = 0; globalThis.SPELL_IMG = fakeImgs(); const dg = recorder(), dr = dg.drawImage; dg.drawImage = (...a) => { rb++; return dr(...a); }; try { G.weather.over(dg, su.tRb + 1500, su, K, {}); } finally { delete globalThis.SPELL_IMG; } assert.ok(rb >= 1, 'rainbow drawn after the cloud is gone');
  const cx = st.cx, sp = spriteOf(0, st); assert.ok(Math.abs(sp.x + 36 - cx) < 1 || st.appr, 'the cloud is over the wizard (or the wizard walks under it first)');
  const edge = G.weather.plan({ v: 'snow' }, envFor('wizard', 72, 20)); assert.ok(edge.appr && edge.appr.x > 150, 'near the screen edge it first steps in so the cloud fits');
  for (const p of [st, sn, su]) assert.ok(p.pr[0].x >= 0 && p.pr[0].x + p.pr[0].w <= 1920, 'weather area on the display');
});

test('conjure: rune circle first, then a bunny out of the hat that hops off, an owl that circles and lands on the hat then flies away, or a flower or star rain', () => {
  const env = envFor('wizard', 72), b = G.conjure.plan({ v: 'bunny', it: 'star' }, env), o = G.conjure.plan({ v: 'owl' }, env), r = G.conjure.plan({ v: 'rain', it: 'flower' }, env);
  for (const p of [b, o, r]) assert.equal(spriteOf(p.t1 + 900, p).state, 'cast', 'casts while the runes glow');
  assert.equal(spriteOf(b.tV + 500, b).state, 'pull'); const q0 = G.conjure._bunny(b.tV + 1000, b), q1 = G.conjure._bunny(b.tHop + 1500, b), q2 = G.conjure._bunny(b.tE - 20, b);
  assert.ok(q0 && q1 && Math.abs(q1.x - q0.x) > 72 && q2.a < 0.2 && G.conjure._bunny(b.tE - 20, b).x * b.dir > q1.x * b.dir, 'the bunny hops away from the hat and fades at the end');
  const hh = (p, t) => { const s = spriteOf(p.tV, p); return { x: s.x + 36, y: s.y + 7.2 }; }, h = hh(o), a1 = G.conjure._owl(o.tV + 1500, o), a2 = G.conjure._owl(o.tL + 600, o), a3 = G.conjure._owl(o.tT + 900, o);
  assert.ok(Math.hypot(a1.x - h.x, a1.y - h.y) > 72 * 0.5, 'circling around the wizard'); assert.ok(Math.abs(a2.x - h.x) < 2 && a2.y < h.y, 'sits on the hat'); assert.ok(Math.hypot(a3.x - h.x, a3.y - h.y) > 72 * 2 && a3.a < 0.05, 'flies off and away');
  let flowers = 0; const g = recorder(), dr = g.drawImage; globalThis.SPELL_IMG = fakeImgs(); g.drawImage = (...a) => { flowers++; return dr(...a); }; try { G.conjure.over(g, r.tV + 2500, r, K, {}); } finally { delete globalThis.SPELL_IMG; } assert.ok(flowers > 8, 'a rain of them: ' + flowers);
  const edge = G.conjure.plan({ v: 'bunny', it: 'star' }, envFor('wizard', 72, 1800)); assert.ok(edge.dir === -1 && edge.appr, 'a wizard at the right edge steps in and the bunny hops the roomy way');
});

// ---------------------------------------------------------------------------------------------- picking: about 80% spells for the wizard, none for anyone else
test('scheduling: for the wizard about 80% of the first picks are spells, other gags are still possible; for every other buddy no spell is ever offered', () => {
  const all = Object.assign({}, GG, G), m = model(); let sp = 0, other = 0; const N = 2000, seen = new Set();
  for (let sd = 1; sd <= N; sd++) { const first = L.candidates(all, m, envFor('wizard', 72), [], rng(sd))[0]; if (all[first.id].spell) sp++; else { other++; seen.add(first.id); } }
  const share = sp / N; assert.ok(share > 0.74 && share < 0.86, 'spell share ' + share); assert.ok(other > 100 && seen.size >= 4, 'ordinary gags still come up: ' + [...seen]);
  for (const char of ['blob', 'cat', 'hero', 'ghost']) for (let sd = 1; sd <= 50; sd++) for (const c of L.candidates(all, m, envFor(char, 60), [], rng(sd))) assert.ok(!all[c.id].spell, char + ' never gets ' + c.id);
  const none = L.candidates(all, L.buildModel(null, (r) => r, [D1]), envFor('wizard'), [], rng(3)); assert.ok(none.length === 4 && none.every((c) => all[c.id].spell), 'with nothing on screen only the targetless spells are possible');
  assert.deepEqual(L.candidates(all, m, envFor('wizard'), [], rng(3), 'portal').map((c) => c.id), ['portal'], 'dev only: picks just that one');
  let rec = 0; for (let sd = 1; sd <= 600; sd++) if (L.candidates(all, m, envFor('wizard'), ['portal'], rng(sd))[0].id === 'portal') rec++; assert.ok(rec < 600 * 0.06, 'a spell that just played is much less likely again: ' + rec);
});

// ---------------------------------------------------------------------------------------------- the manager runs them
function rig(over = {}) {
  const E = freshEngine(), cls = { cmds: [], opened: 0, closed: 0, scenes: [], fx: [], emitted: [], wentAt: 0, captures: 0 };
  E.init({ event: () => {}, toy: () => {}, state: () => {} }, 1000); E.setWorld([{ id: 1, bounds: D1.bounds, workArea: D1.workArea }]); E.setSize(72); E.settings = { speed: 8, personality: 'chill', mischief: 25 };
  E.moveType = 'walk'; E.gait = 'step'; E.pos = { x: 700, y: 1032 - 72 }; E.vel = { x: 0, y: 0 }; E.onFloor = true; E.setState('idle', 0); E.nextDecision = 1e15; E.tick(Date.now()); E.lastChange = Date.now(); E.onFloor = true; E.setState('idle', 0); E.lastChange = Date.now();
  const st = { caret: [520, 700, 2, 20], cursor: { x: 1700, y: 300 }, flags: { userHidden: false, petShown: true, paused: false, stayPut: false, reduceMotion: false, locked: false, suspended: false, fullscreen: false } }, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const probe = { start: () => true, stop() {}, isAlive: () => true, async request(cmd, tmo) { cls.cmds.push(cmd); if (over.silentText && (cmd === 'text' || cmd === 'tick2')) { await wait(tmo || 2500); return null; } await wait(2); if (cmd === 'scan') return Object.assign({}, RAW, { pw: 0 }, over.noIcons ? { desk: [] } : {}); if (cmd === 'text') return { pw: 0, l: LINES.map((q) => [q.x, q.y, q.w, q.h]) }; return { fg: RAW.fg, c: st.caret, s: null, v: [510, 160, 900, 20] }; } };
  const host = { displays: () => [D1], toDip: (r) => r, count: () => (cls.opened - cls.closed > 0 ? 1 : 0), show() {}, go() { cls.wentAt = Date.now(); },
    async capture(display, crops) { cls.captures++; const o = {}; for (const k of Object.keys(crops)) o[k] = { rect: crops[k], png: 'data:,', padL: 8, padT: 8, padR: 8, padB: 8 }; return o; },
    openOverlay(display, scene, ready) { cls.opened++; cls.scenes.push(scene); setTimeout(ready, 3); }, close() { if (cls.opened > cls.closed) cls.closed++; } };
  const m = createManager(Object.assign({ platform: 'win32', now: Date.now, rand: () => 0.5, log: () => {}, engine: E, host, activity: L.createActivity(), settings: () => ({ enabled: true, freq: 'normal' }), flags: () => st.flags,
    makeProbe: () => probe, char: () => 'wizard', cursor: () => st.cursor, emit: (t) => cls.emitted.push(t), setFx: (f) => cls.fx.push(f), sleep: wait, spriteBox: () => L.R(E.pos.x, E.pos.y, 72, 72), hidePet() {} }, over));
  const tk = setInterval(() => E.tick(Date.now()), 16);
  return { E, m, st, cls, wait, done() { clearInterval(tk); }, async untilGo() { for (let i = 0; i < 3000 && !cls.wentAt; i++) await wait(5); assert.ok(cls.wentAt, 'started'); } };
}

test('manager: a targetless spell plays with no capture, sends sc / hue / alpha to the pet each frame, takes the overlay down at the end and clears the effects', async () => {
  const r = rig(); try {
    const run = r.m.start({ only: 'cauldron', force: true }); await r.untilGo(); await r.wait(150);
    assert.equal(r.cls.captures, 0, 'nothing captured: there is no target'); assert.equal(r.cls.opened - r.cls.closed, 1); assert.deepEqual(Object.keys(r.cls.scenes[0].crops), [], 'no crops travel to the overlay');
    assert.ok(r.cls.scenes[0].plan.id === 'cauldron' && r.cls.scenes[0].w < 1904 && r.cls.scenes[0].h < 1064, 'a box, not the whole display');
    const f = r.cls.fx[r.cls.fx.length - 1]; assert.ok(f && 'sc' in f && 'hue' in f && 'alpha' in f && f.sc === 1 && f.alpha === 1, JSON.stringify(f));
    r.m.stop(); const res = await run; assert.equal(res.status, 'aborted'); assert.equal(r.cls.opened, r.cls.closed); assert.equal(r.cls.fx[r.cls.fx.length - 1], null, 'clip, tilt, size, hue and opacity back to normal');
  } finally { r.done(); }
});

test('manager: every targetless spell starts for the wizard and a non-wizard gets "target-missing" (no spell ever plays for anyone else)', async () => {
  for (const id of ['portal', 'weather', 'conjure']) { const r = rig(); try { const run = r.m.start({ only: id, force: true }); await r.untilGo(); assert.equal(r.E.script.name, 'mischief:' + id); r.m.stop(); const res = await run; assert.equal(res.id, id); assert.equal(r.cls.opened, r.cls.closed); } finally { r.done(); } }
  const r = rig({ char: () => 'cat' }); try { const res = await r.m.start({ only: 'portal', force: true }); assert.deepEqual([res.status, res.reason], ['skipped', 'target-missing']); assert.equal(r.cls.opened, 0); } finally { r.done(); }
});

test('manager: fireball plays on a desktop icon with a real capture, and the cursor going near the target aborts it within 250 ms', async () => {
  const r = rig(); try {
    const run = r.m.start({ only: 'fireball', force: true }); await r.untilGo(); await r.wait(150); assert.equal(r.cls.captures, 1); assert.equal(Object.keys(r.cls.scenes[0].crops).length, 1);
    const tg = r.m.targets()[0], t0 = Date.now(); r.st.cursor = { x: tg.x + tg.w / 2, y: tg.y + tg.h / 2 }; const res = await run;
    assert.equal(res.status, 'aborted'); assert.equal(res.reason, 'cursor-near-target'); assert.ok(Date.now() - t0 <= 250); assert.equal(r.cls.opened, r.cls.closed);
  } finally { r.done(); }
});

test('manager: with no desktop icons visible, levitate and fireball crop one short text line (text pass, caret watched): typing aborts within 250 ms; otherwise it plays', async () => {
  for (const id of ['levitate', 'fireball']) {
    const r = rig({ noIcons: true }); try {
      const run = r.m.start({ only: id, force: true }); await r.untilGo(); await r.wait(150); const sc = r.cls.scenes[0], c = sc.crops.tgt; assert.ok(c && c.rect.h <= 72 * 1.2 + 1 && c.rect.w <= 72 * 4 + 1, 'one small crop: ' + JSON.stringify(c && c.rect)); assert.equal(sc.plan.text, true);
      const t0 = Date.now(); r.st.caret = [530, 700, 2, 20]; const res = await run; assert.equal(res.status, 'aborted'); assert.equal(res.reason, 'caret-changed'); assert.ok(Date.now() - t0 <= 250); assert.equal(r.cls.opened, r.cls.closed);
    } finally { r.done(); }
  }
});

test('manager: a probe that never answers the text pass does not matter when an icon is available (plays on the icon at once), and with no icon the spell skips softly within about 2 s', async () => {
  for (const id of ['fireball', 'levitate']) {
    let r = rig({ silentText: true }); try {
      const run = r.m.start({ only: id, force: true }); await r.untilGo(); await r.wait(100); assert.ok(!r.cls.cmds.includes('text') && !r.cls.cmds.includes('tick2'), 'no text pass needed for an icon'); assert.equal(Object.keys(r.cls.scenes[0].crops).length, 1);
      assert.ok(r.cls.cmds.indexOf('tick') > 0 && r.cls.cmds.indexOf('tick') < r.cls.cmds.indexOf('scan', 1) + 1, 'the caret path is warmed up before the walk-in'); r.m.stop(); await run;
    } finally { r.done(); }
    r = rig({ silentText: true, noIcons: true }); try {
      const t0 = Date.now(), res = await r.m.start({ only: id, force: true }); assert.equal(res.status, 'skipped'); assert.ok(/^(no-text|no-target|target-missing)$/.test(res.reason), 'soft reason: ' + res.reason); assert.ok(Date.now() - t0 < 2600, `skipped in ${Date.now() - t0} ms`);
      assert.equal(r.cls.opened, 0);
    } finally { r.done(); }
  }
});

test('manager: the cursor stepping onto a portal (a prop, not a target) aborts the spell: props keep the pointer away just like targets', async () => {
  const r = rig(); try {
    const run = r.m.start({ only: 'portal', force: true }); await r.untilGo(); await r.wait(120); const p = r.cls.scenes[0].plan, t0 = Date.now(); r.st.cursor = { x: p.bx, y: p.py };
    const res = await run; assert.equal(res.status, 'aborted'); assert.equal(res.reason, 'cursor-on-area'); assert.ok(Date.now() - t0 <= 250); assert.equal(r.cls.opened, r.cls.closed);
  } finally { r.done(); }
});

test('manager: a spell plays to its end inside the 15 s cap, ending "played" with the sprite idle and every effect cleared', async () => {
  const r = rig(); r.E.settings.speed = 8; try {
    const t0 = Date.now(), res = await r.m.start({ only: 'conjure', force: true }); assert.equal(res.status, 'played', res.reason); assert.ok(Date.now() - t0 < L.CAP_MS, 'within the cap');
    assert.equal(r.cls.opened, r.cls.closed); assert.equal(r.cls.fx[r.cls.fx.length - 1], null); assert.equal(r.E.script, null);
  } finally { r.done(); }
}, { timeout: 30000 });

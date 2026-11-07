'use strict';
// Orchestrates one prank at a time: pick -> locate (UI Automation) -> capture -> overlay -> sprite script -> restore.
// Everything it needs from the outside world is injected (`d`), so test/mischief.manager.test.js can drive it with fakes.
// Restore is "destroy the overlay window": the overlay's contents die with it, so even a crash restores the screen.
const logic = require('./logic');
const GAGS = require('../../mischief/gags');
const { G, spriteOf } = GAGS;

const TICK_MS = 50;            // abort monitor period (cheap checks only: cursor, flags)
const PROBE_MS = 110;          // how often the probe is asked for foreground / caret while a prank runs
const PAD = 8;                 // physical px of surroundings captured around each target (used to build the patch)

function createManager(d) {
  let running = false, timer = null, timerAt = 0, chaos = false, recent = [], cur = null, prepAbort = null, forced = false, firstDone = false, retriedNoTarget = false;
  const isChaos = () => chaos || settings().freq === 'chaos';

  const settings = () => d.settings();
  const enabled = () => d.platform === 'win32' && !!settings().enabled;

  // Only a sprite in a script, a drag or asleep is "busy"; a merely walking one is settled (target dropped, brain held) so the prank can start.
  // On chaos a fast cursor does not block: the abort rules still keep it away from the prank's targets.
  function blocked(settle) {
    const s = settings(), f = d.flags(), e = d.engine;
    const idleNow = () => e.canStartScript(true) && (e.state === 'idle' || e.state === 'sit');
    const why = () => logic.blockedReason({ platform: d.platform, enabled: !!s.enabled, running, userHidden: f.userHidden, petShown: f.petShown, paused: f.paused, stayPut: f.stayPut, reduceMotion: f.reduceMotion,
      locked: f.locked, suspended: f.suspended, fullscreen: f.fullscreen, userBusy: !isChaos() && d.activity.busy(), petIdle: idleNow() });
    let r = why();
    if (r === 'sprite-busy' && settle && e.settle && e.settle()) { hold(); r = why(); }
    return r;
  }
  // ---------------------------------------------------------------- scheduling: ONE timeout, re-armed after each firing
  // One random roll `u` per cycle: a settings change (refresh) recomputes from the time since the cycle began, so it never pushes a due prank back.
  let cycleAt = 0, cycleU = 0.5;
  const totalMs = () => {
    const c = isChaos(), [fa, fb] = logic.FIRST_CHAOS_MS, [ra, rb] = logic.FREQ[c ? 'chaos' : settings().freq] || logic.FREQ.normal;
    if (c) return firstDone ? (ra + cycleU * (rb - ra)) * 60000 : fa + cycleU * (fb - fa);
    const t = (ra + cycleU * (rb - ra)) * 60000; return firstDone ? t : Math.min(t, (60 + cycleU * 60) * 1000);
  };
  function arm(delay) {
    clearTimeout(timer); timer = null; timerAt = 0;
    if (!enabled()) return;
    timerAt = d.now() + delay;
    d.log('prank scheduled in ' + Math.round(delay / 1000) + 's' + (isChaos() ? ' (chaos)' : ''));
    timer = setTimeout(onTimer, delay);
    if (timer.unref) timer.unref();
  }
  function schedule(delay) {   // start a new cycle (after a prank, a retry, or at startup)
    cycleAt = d.now(); cycleU = d.rand();
    arm(delay != null ? delay : Math.round(totalMs()));
  }
  function refresh() {         // settings changed: same cycle, new interval
    if (!enabled()) { clearTimeout(timer); timer = null; timerAt = 0; return; }
    if (!timer && !running) return schedule();
    if (timer) arm(Math.max(2000, Math.round(totalMs() - (d.now() - cycleAt))));
  }
  const SOFT = /^(no-target|no-text|target-missing|target-offscreen|other-display)$/;
  async function onTimer() {
    timer = null; timerAt = 0;
    const c = isChaos(), retry = () => (c ? 5000 + d.rand() * 5000 : 15000 + d.rand() * 20000);
    try {
      let why = blocked(true);
      // walking / hopping / jumping / climbing is not busy: give it up to 3 s to land and come to rest (the brain is held meanwhile)
      for (let i = 0; i < 30 && why === 'sprite-busy' && !d.engine.script && !d.engine.dragging && d.engine.state !== 'sleep'; i++) { await d.sleep(100); hold(); why = blocked(true); }
      if (why) { d.log('prank skipped: ' + why); return schedule(why === 'sprite-busy' || why === 'user-busy' ? retry() : (c ? 20000 + d.rand() * 10000 : undefined)); }
      let r = await start({});
      if (r && r.status === 'skipped' && SOFT.test(r.reason || '') && !retriedNoTarget) { retriedNoTarget = true; d.log('prank retry after ' + r.reason); r = await start({}); }   // nothing fit: try another prank at once
      retriedNoTarget = false; firstDone = true;
      if (r && r.status === 'skipped' && SOFT.test(r.reason || '') && c) return schedule(20000 + d.rand() * 5000);
      if (r && r.status === 'skipped' && (r.reason === 'sprite-busy' || r.reason === 'user-busy')) return schedule(retry());
    } catch (e) { d.log('prank error', String(e && e.stack || e)); retriedNoTarget = false; }
    schedule();
  }
  const setChaos = (on) => { chaos = !!on; refresh(); };

  const hold = () => { if (d.holdBrain) d.holdBrain(6000); };   // re-armed at every step of the preparation: the random brain must not walk the sprite off
  // checked right before the capture and again right before the overlay opens: stop(), settings, lock, suspend, fullscreen, grab, a sprite that moved
  function prepWhy() {   // everything that must stop the preparation, whether the sprite is standing, walking in or about to be captured
    const f = d.flags(), e = d.engine; hold();
    if (prepAbort) return prepAbort;
    if (!forced && !settings().enabled) return 'disabled';
    if (f.locked) return 'session-locked'; if (f.suspended) return 'suspended'; if (f.fullscreen) return 'fullscreen'; if (f.userHidden || !f.petShown) return 'hidden';
    if (e.dragging) return 'sprite-grabbed';
    return null;
  }
  function gate(env) {
    const e = d.engine, w = prepWhy(); if (w) return w;
    if (!e.canStartScript(true)) return 'sprite-busy';
    if (Math.abs(e.pos.x - env.sx) > 6 || Math.abs(e.pos.y - env.sy) > 6) return 'sprite-moved';
    return null;
  }
  const rectsOf = (m) => [...m.buttons, m.start, m.wifi, m.volume, m.battery, m.clock, ...m.desktop].filter(Boolean);
  // a fresh look at the desktop: same foreground window, no password field focused, and every target rect still exactly where we found it
  async function lookAgain(probe, scan, model, plan, displays) {
    const s = await probe.request('scan', 3000); if (!s) return 'probe-lost';
    if (s.pw) return 'password-field';
    const f0 = scan.fg, f1 = s.fg;
    if (!f1 || (f0 && (f0.h !== f1.h || !logic.sameRect(logic.fromArr(f0.r), logic.fromArr(f1.r), 2)))) return 'foreground-changed';
    const m2 = logic.buildModel(s, d.host.toDip, displays), was = rectsOf(model), now = rectsOf(m2);
    for (const r of Object.values(plan.tg)) if (was.some(q => logic.sameRect(q, r, 1)) && !now.some(q => logic.sameRect(q, r, 4))) return 'target-moved';
    return null;
  }
  // ---------------------------------------------------------------- one prank
  // opts.only = a gag id (dev), opts.force = skip the idle/busy gates (dev)
  async function start(opts = {}) {
    if (running) return { status: 'skipped', reason: 'running' };
    if (d.platform !== 'win32') return { status: 'skipped', reason: 'not-windows' };
    if (!opts.force) { const why = blocked(); if (why) { d.log('prank skipped: ' + why); return { status: 'skipped', reason: why }; } }
    else if (!d.engine.canStartScript(true)) return { status: 'skipped', reason: 'sprite-busy' };
    running = true; prepAbort = null; forced = !!opts.force; hold();
    const t0 = d.now(); let probe = null, result = { status: 'skipped', reason: 'no-target' };
    try {
      probe = d.makeProbe(); if (!probe.start()) throw new Error('probe did not start');
      const scan = await probe.request('scan', 9000);
      if (!scan) result = { status: 'skipped', reason: 'probe-failed' };
      else {
        const displays = d.host.displays(), model = logic.buildModel(scan, d.host.toDip, displays), env = makeEnv(displays);
        if (!env) result = { status: 'skipped', reason: 'sprite-offscreen' };
        else {
          const cands = logic.candidates(G, model, env, recent, d.rand, opts.only).slice(0, 4); let lastWhy = opts.only ? 'target-missing' : 'no-target';
          for (const c of cands) {
            let tg = c.targets;
            if (tg.pending) {
              if (!(await loadText(probe, model, env))) { lastWhy = 'no-text'; continue; }
              tg = G[c.id].find(model, env); if (!tg) { lastWhy = 'no-text'; continue; }
            }
            const r = await play(c.id, tg, env, probe, scan, model, displays);
            if (r.status !== 'skipped') { result = r; break; }
            lastWhy = r.reason; result = r;
          }
          if (result.status === 'skipped' && !cands.length) result = { status: 'skipped', reason: lastWhy };
        }
      }
    } catch (e) { result = { status: 'skipped', reason: 'error: ' + String(e && e.message || e) }; }
    finally { if (probe) probe.stop(); running = false; cur = null; }
    result.id = result.id || (opts.only || ''); result.ms = d.now() - t0;
    if (result.status === 'played' && result.id) recent = [result.id, ...recent].slice(0, 4);
    d.log('prank ' + (result.status === 'played' ? 'played' : 'skipped') + ' ' + (result.id || '-') + (result.reason ? ' (' + result.reason + ')' : '') + ' ' + result.ms + 'ms overlays=' + d.host.count());
    if (d.onResult) d.onResult(result);
    return result;
  }

  function makeEnv(displays) {
    const e = d.engine, S = e.size, c = { x: e.pos.x + S / 2, y: e.pos.y + S / 2 }, disp = logic.displayAt(displays, c); if (!disp) return null;
    const wa = disp.workArea, b = disp.bounds;
    return { char: d.char(), S, fy: wa.y + wa.height - S, sx: e.pos.x, sy: e.pos.y, wa: { x0: wa.x, x1: wa.x + wa.width, y0: wa.y, y1: wa.y + wa.height }, db: { x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height }, display: disp };
  }
  async function loadText(probe, model, env) {
    const w = model.win; if (!w || !w.allowed) return false;
    const tx = await probe.request('text', 5000); if (!tx || tx.pw) { model.text = { pw: true, lines: [] }; return false; }     // password field: never
    const tk = await probe.request('tick2', 3000), lines = logic.groupLines((tx.l || []).map(logic.fromArr).filter(Boolean).map(d.host.toDip));
    const cr = tk && (logic.fromArr(tk.s) || logic.fromArr(tk.c)); model.text = { pw: false, lines, caret: cr ? d.host.toDip(cr) : null, hasCaret: !!cr, pick: 0.2 + d.rand() * 0.6 };
    model.textSig = tk && { c: logic.fromArr(tk.c), s: logic.fromArr(tk.s), v: logic.fromArr(tk.v) };
    return lines.length > 0;
  }

  // Walk-in: the sprite goes to the gag's start spot with its normal pace (a walker walks along the floor at its walking speed, the ghost drifts gently),
  // BEFORE any capture or overlay, so the prank never starts with the sprite flying across the screen. Cancellable like the rest of the preparation.
  const GHOST_PACE = 0.62;
  async function walkIn(appr, env) {
    const e = d.engine, ghost = env.char === 'ghost';
    const pace = e.baseSpeed * (e.settings.speed || 1) * (e.settings.personality === 'hyper' ? 1.5 : e.settings.personality === 'sleepy' ? 0.6 : 1) * 1.6 * (ghost ? GHOST_PACE : 1);
    const tx = appr.x, ty = ghost ? appr.y : e.pos.y, dist = Math.hypot(tx - e.pos.x, ty - e.pos.y);
    if (dist < 6) return null;
    let fin = null, done = false;
    const maxMs = dist / Math.max(30, pace) * 1000 + 3000;
    const script = {
      name: 'mischief-walkin', maxMs, allowAir: true,
      init() {},
      update(en, dt) {
        const dx = tx - en.pos.x, dy = ty - en.pos.y, rem = Math.hypot(dx, dy), step = Math.min(rem, pace * dt);
        if (rem > 0.01) { en.pos.x += dx / rem * step; en.pos.y += dy / rem * step; if (Math.abs(dx) > 0.5) en.facing = dx < 0 ? -1 : 1; }
        en.setState(ghost ? 'idle' : 'walk', 1e9);
        return rem - step < 0.5;
      },
      cancel(en, why) { done = true; fin = why; },
    };
    if (!e.startScript(script, d.now())) return 'sprite-busy';
    const t0 = d.now();
    while (!done) {
      await d.sleep(40);
      const why = prepWhy();
      if (why) { if (e.script === script) e.cancelScript('mischief-prep'); return why; }
      if (d.now() - t0 > maxMs + 4000) { if (e.script === script) e.cancelScript('mischief-prep'); return 'approach-timeout'; }
    }
    if (fin !== 'done') return fin === 'drag' ? 'sprite-grabbed' : 'sprite-' + fin;
    e.pos.x = tx; if (!ghost) e.pos.y = ty;
    for (let i = 0; i < 25 && !e.canStartScript(true); i++) { await d.sleep(40); const why = prepWhy(); if (why) return why; }   // lands on the floor and comes to rest
    return null;
  }

  async function play(id, targets, env, probe, scan, model, displays) {
    const gag = G[id], e = d.engine, rects = {};
    for (const k of Object.keys(targets)) { const r = targets[k]; if (r && typeof r.w === 'number') rects[k] = r; }
    { const why = gate(env); if (why) return { status: 'skipped', id, reason: why }; }
    // the target is on another display than the sprite: bring the sprite over (fall in from the top at the nearest edge) instead of skipping
    { const t0 = Object.values(targets).find(r => r && typeof r.w === 'number' && r.w > 1), td = t0 && logic.displayAt(displays, logic.center(t0));
      if (td && td.id !== env.display.id) {
        const f = d.flags();
        if (f.stayPut || f.reduceMotion || e.settings.stayPut || e.settings.reduceMotion) return { status: 'skipped', id, reason: 'quiet' };
        const S = env.S, wa = td.workArea, fromRight = env.sx > wa.x + wa.width / 2, nx = fromRight ? wa.x + wa.width - S - 4 : wa.x + 4;
        e.pos.x = nx; e.pos.y = wa.y - S; e.vel.x = 0; e.vel.y = 0; e.onFloor = false; e.facing = fromRight ? -1 : 1; e.setState('fall', 1e9); d.emit('jump');
        for (let i = 0; i < 40 && !(e.onFloor && (e.state === 'idle' || e.state === 'sit')); i++) { hold(); await d.sleep(60); if (e.dragging) break; }
        const w0 = gate({ sx: e.pos.x, sy: e.pos.y }); if (w0) return { status: 'skipped', id, reason: w0 };
        env = makeEnv(displays); if (!env) return { status: 'skipped', id, reason: 'sprite-offscreen' };
        if (env.display.id !== td.id) return { status: 'skipped', id, reason: 'other-display' };
      } }
    let plan = gag.plan(targets, env);
    if (plan.appr && logic.abortReason({ now: d.now(), startedAt: d.now(), cursor: d.cursor(), near: Object.values(plan.tg), zones: [] })) return { status: 'skipped', id, reason: 'cursor-near-target' };   // no point walking over there
    // walk to the start spot at a natural pace first (plan.appr), then plan again from where the sprite now stands
    if (plan.appr && plan.appr.ms > 400) {
      const why = await walkIn(plan.appr, env); if (why) return { status: 'skipped', id, reason: why };
      env = makeEnv(displays); if (!env) return { status: 'skipped', id, reason: 'sprite-offscreen' };
      plan = gag.plan(targets, env);
    }
    const first = Object.values(plan.tg)[0] || plan.area, disp = logic.displayAt(displays, logic.center(first));
    if (!disp || disp.id !== env.display.id) return { status: 'skipped', id, reason: disp ? 'other-display' : 'target-offscreen' };
    const zones = zonesOf(plan, env.S), near = Object.values(plan.tg), textMode = id === 'text';
    const fg0 = scan.fg ? { h: scan.fg.h, r: logic.fromArr(scan.fg.r) } : null, layout0 = logic.layoutKey(displays);
    if (textMode && !model.textSig) return { status: 'skipped', id, reason: 'no-caret-signal' };
    if (logic.abortReason({ now: d.now(), startedAt: d.now(), cursor: d.cursor(), near, zones, layout0, layout: layout0, fg0, fg: fg0 })) return { status: 'skipped', id, reason: 'cursor-near-target' };
    // 0. look again IMMEDIATELY before capturing: never take a crop of a password field or of another app
    { const why = (await lookAgain(probe, scan, model, plan, displays)) || gate(env); if (why) return { status: 'skipped', id, reason: why }; }
    // 1. capture BEFORE any overlay exists (the sprite is hidden for the instant of the capture if it overlaps a target)
    let crops = {};
    const capKeys = {}; for (const k of Object.keys(plan.tg)) if (plan.tg[k].w > 1 && plan.tg[k].h > 1) capKeys[k] = plan.tg[k];
    if (Object.keys(capKeys).length) {
      const sb = d.spriteBox(), hide = Object.values(capKeys).some(r => logic.intersects(logic.inflate(r, PAD + 2), sb));
      if (hide) { d.hidePet(true); await d.sleep(80); }
      try { crops = await d.host.capture(env.display, capKeys, PAD); } finally { if (hide) d.hidePet(false); }
      if (!crops) return { status: 'skipped', id, reason: 'capture-failed' };
    }
    // 2. nothing may have changed while we looked (foreground window, sprite state, display layout)
    { const why = (await lookAgain(probe, scan, model, plan, displays)) || gate(env) || (logic.layoutKey(d.host.displays()) !== layout0 ? 'display-changed' : null); if (why) { crops = null; return { status: 'skipped', id, reason: why }; } }
    return await new Promise((resolve) => {
      let ended = false, startedAt = 0, mon = null, capT = null, probeBusy = false, tk = null, tkAt = d.now(), stopFlag = false, evI = 0, script = null, goT = null;
      const ctxBase = () => ({ now: d.now(), startedAt, near, zones, nearPx: 56, fg0, textMode, layout0 });
      function end(status, reason) {
        if (ended) return; ended = true; clearInterval(mon); clearTimeout(capT); clearTimeout(goT); cur = null;
        d.host.close();                                                     // THE restore: overlay gone, crops gone with it
        crops = null;
        d.setFx(null);
        if (e.script === script) e.cancelScript('mischief-end');
        const rects = near.filter(r => r.w > 1 && r.h > 1); if (!rects.length && plan.win) rects.push(plan.win);
        resolve(status === 'played' ? { status, id, rects } : { status, id, reason, rects });
      }
      cur = { id, near, stop: () => { stopFlag = true; end('aborted', 'stopped'); }, abort: (why) => end('aborted', why) };
      script = {
        name: 'mischief:' + id, maxMs: plan.dur + 4000, allowAir: true,
        init(en) { en.mischief = {}; },
        update(en) {
          const t = d.now() - startedAt, s = spriteOf(Math.max(0, t), plan);
          en.pos.x = s.x; en.pos.y = s.y; if (s.facing) en.facing = s.facing; en.setState(s.state, 1e9);
          d.setFx({ clipY: s.clip, rot: s.rot });
          while (evI < plan.ev.length && plan.ev[evI][0] <= t) { d.emit(plan.ev[evI][1], plan.ev[evI][2]); evI++; }
          return t >= plan.dur;
        },
        cancel(en, why) { if (!ended) end(why === 'done' ? 'played' : 'aborted', why === 'done' ? '' : 'sprite-' + why); },
      };
      const box = logic.overlayBox(plan.area, env.display.bounds), scene = { plan, ox: box.x, oy: box.y, w: box.w, h: box.h, crops };
      let readyT = setTimeout(() => end('skipped', 'overlay-timeout'), 4000);
      d.host.openOverlay(env.display, scene, () => {
        clearTimeout(readyT); if (ended) return;
        startedAt = d.now() + 90; tkAt = d.now(); d.host.show(); if (d.onGo) d.onGo();
        if (!e.startScript(script, d.now())) return end('skipped', 'sprite-busy');
        d.host.go(startedAt);
        capT = setTimeout(() => end('aborted', 'time-cap'), logic.CAP_MS);
        mon = setInterval(() => {
          if (ended) return;
          const f = d.flags(), now = d.now();
          if (!probeBusy && now - tkAt >= PROBE_MS) {
            probeBusy = true; const asked = now;
            probe.request(textMode ? 'tick2' : 'tick', 1500).then((r) => { probeBusy = false; if (r) { tk = r; tkAt = d.now(); } else if (d.now() - asked > 1400) tk = null; });
          }
          const pwNow = !!(tk && tk.pw), fgNow = tk && tk.fg ? { h: tk.fg.h, r: logic.fromArr(tk.fg.r) } : null;
          const why = logic.abortReason(Object.assign(ctxBase(), { now, cursor: d.cursor(), fg: fgNow, caret0: textMode ? model.textSig : null, caret: textMode && tk ? sigOf(tk) : null, layout: logic.layoutKey(d.host.displays()),
            locked: f.locked, suspended: f.suspended, fullscreen: f.fullscreen, grabbed: e.dragging, stop: stopFlag, pw: pwNow, probeLost: !tk && now - startedAt > 1600 || now - tkAt > 1500 }));
          if (why) end('aborted', why);
        }, TICK_MS);
      }, (m) => end('aborted', 'overlay-error: ' + m));
    });
  }
  const sigOf = (t) => ({ c: logic.fromArr(t.c), s: logic.fromArr(t.s), v: logic.fromArr(t.v) });
  // sprite boxes sampled along the choreography + every target, as the "prank area" the cursor must stay out of
  function zonesOf(plan, S) {
    const z = []; for (let t = 0; t <= plan.dur; t += 200) { const s = spriteOf(t, plan); z.push(logic.R(s.x, s.y, S, S)); }
    for (const r of Object.values(plan.tg)) z.push(r); return z;
  }

  const sigOf2 = null;
  function stop(why) { if (cur) { cur.abort(why || 'stopped'); return true; } if (running) { prepAbort = why || 'stopped'; return true; } return false; }
  return { start, stop, schedule, refresh, setChaos, nextInMs: () => (timerAt ? Math.max(0, timerAt - d.now()) : null), chaosOn: isChaos, isRunning: () => running, blocked, targets: () => (cur ? cur.near : null), hidePetForVerify: (on) => d.hidePet(on), _zonesOf: zonesOf };
}
module.exports = { createManager, TICK_MS, PROBE_MS };

/* Multi-pet mode, phase 1: every owned buddy except the lead (store.active) roams the desktop in its own small click-through window.
   One satellite = one isolated Engine instance + one window (same box / DPI / mouse-capture handling as the lead in main.js).
   Satellites roam, sleep, can be dragged, thrown and tapped, and rarely play a sprite-only antic (never the desktop pranks / overlay spells).
   Everything here is gated on settings.showAll && owned.length > 1: with the mode off nothing is created and main.js behaves as before.
   Electron things (BrowserWindow, screen) and the app state are injected, so tests run with doubles. See graphify-out/multipet-brief.md. */
'use strict';
const geo = require('../shared/geometry');
const pacing = require('./pacing');
const scripts = require('./scripts');
const backoff = require('../shared/backoff');
const pairs = require('../shared/pairs');
const { createInputHealth } = require('./inputhealth');
const { sizeFor } = require('../shared/catalog');

const MAX_SATS = 4, STAGGER_MS = 500, ANTIC_GAP_MS = 8000, SAY_GAP_MS = 90000, SETTINGS_MS = 250, SPACING_PX_S = 45;
const NO_SAT_ANTICS = new Set(['chase']);   // the cat's chase needs the toy window (lead only)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// which owned buddies get a window: [] unless the mode is on and there is more than one buddy
function wantedIds(state, softwareGL, known) {
  if (!state || !state.settings || !state.settings.showAll || softwareGL) return [];
  const owned = Array.isArray(state.owned) ? state.owned : [];
  if (owned.length < 2) return [];
  const hide = Array.isArray(state.settings.hideBuddies) ? state.settings.hideBuddies : [];   // the user's own pick: owned buddies left at home
  return owned.filter(id => id !== state.active && !hide.includes(id) && (!known || known(id))).slice(0, MAX_SATS);
}
const anticNames = (id) => (scripts.ANTIC_NAMES[id] || []).filter(n => !NO_SAT_ANTICS.has(n));

// deps: { leadActor() -> {id, engine, shown} (optional: lets the lead take part in pair interactions), BrowserWindow, screen, store, characterById, fullState(), worldDisplays(), cursor(), lead() -> {pos,size}, gates() -> {userHidden, fsDisplays:Set,
//         leadBusy, leadSpeaking, focus, mischiefRunning}, indexPath, preloadPath, softwareGL, staggerMs, now, rand, setTimeout, clearTimeout, createEngine, log, logError }
function createCompanions(d) {
  const now = d.now || Date.now, rand = d.rand || Math.random, log = d.log || (() => {}), logError = d.logError || (() => {});
  const setT = d.setTimeout || setTimeout, clearT = d.clearTimeout || clearTimeout;
  const mkEngine = d.createEngine || (() => require('./engine').create());
  const stagger = d.staggerMs == null ? STAGGER_MS : d.staggerMs;
  const sats = new Map();   // id -> satellite (insertion order = spawn order)
  let queue = [], pumpT = null, lastCreateAt = -Infinity;
  let pair = null, nextPairAt = 0, pairAt = 0, lastSlotEnd = -Infinity, lastFrameT = 0, rescueCoolAt = 0; const cool = new Map(), wasDrag = new Map(); let pendingRescue = null;   // pair: the running interaction session (shares the antic slot)
  let slot = null, nextAnticAt = 0, lastSayAt = -Infinity, settingsAt = -Infinity, G = null;   // slot: id of the satellite that owns the shared antic slot
  const state = () => d.store.get();
  const wanted = () => wantedIds(state(), d.softwareGL, (id) => !!d.characterById(id));

  // ---- lifecycle ---------------------------------------------------------------------------------------------------
  function sync() {
    const want = wanted();
    for (const s of [...sats.values()]) if (!want.includes(s.id)) remove(s);
    queue = want.filter(id => !sats.has(id));
    if (queue.length) pump(); else if (pumpT) { clearT(pumpT); pumpT = null; }
    for (const s of sats.values()) applySettings(s);
  }
  function pump() {
    if (pumpT) return;
    while (queue.length) {
      const wait = lastCreateAt + stagger - now();
      if (stagger > 0 && wait > 0) { pumpT = setT(() => { pumpT = null; try { pump(); } catch (e) { logError('companions pump', e); } }, wait); return; }
      const id = queue.shift();
      if (sats.has(id) || !wanted().includes(id)) continue;
      try { create(id); } catch (e) { logError('companions create ' + id, e); }
      lastCreateAt = now();
    }
  }
  function remove(s) {
    sats.delete(s.id); queue = queue.filter(id => id !== s.id);
    if (slot === s.id) slot = null;
    try { s.engine.cancelScript('removed'); } catch {}
    const w = s.win; s.win = null; s.dead = true;
    try { if (w && !w.isDestroyed()) w.destroy(); } catch {}
  }
  function destroyAll() {
    queue = []; if (pumpT) { clearT(pumpT); pumpT = null; }
    for (const s of [...sats.values()]) remove(s);
    slot = null; if (pair) { pair.sess.abort('destroy'); pair = null; }
  }
  function create(id) {
    const c = d.characterById(id), e = mkEngine(), idx = sats.size;
    const s = { id, engine: e, win: null, ready: false, shown: null, interactive: false, topAt: 0, topChk: 0, localX: 0, localY: 0, want: null, fx: 0, fy: 0,
      grabOff: null, dragPingAt: 0, dragStartAt: 0, calmSkip: 0, motion: { x: NaN, y: NaN, until: 0 }, vx: 0, lastPx: null, lastPt: 0, hcCur: null,
      health: createInputHealth(), gov: backoff.createGovernor({ base: 1000, max: 30000, cap: 5 }), reviveAt: 0, dead: false };
    e.init({ state: () => {}, event: (type, data) => onEvent(s, type, data) }, now());
    e.setWorld(d.worldDisplays());
    e.setSize(sizeFor(id, state().settings.size));
    e.setMoveType(c && c.move ? c.move : 'walk'); e.setGait(c && c.gait ? c.gait : 'hop');
    place(s, idx);
    applySettings(s);
    sats.set(id, s);
    if (!nextAnticAt) nextAnticAt = now() + 30000 + rand() * 30000;
    if (!nextPairAt) nextPairAt = now() + 25000 + rand() * 20000;
    makeWindow(s);
    wire(s);
    log('companion created ' + id);
  }
  // staggered near the lead, alternating sides, on the floor (floaters keep the lead's height)
  function place(s, idx) {
    const e = s.engine, L = d.lead(), step = e.size * 1.3, off = [step, -step, step * 2, -step * 2][idx % 4];
    const lo = e.world.x0, hi = e.world.x1 - e.size;
    let x = clamp(L.pos.x + off, lo, hi);
    if (Math.abs(x - L.pos.x) < e.size * 0.8) x = clamp(L.pos.x - off, lo, hi);
    e.pos = { x, y: e.moveType === 'float' ? clamp(L.pos.y, e.world.y0, e.world.y1 - e.size) : e.floorAt(x) };
    e.vel = { x: 0, y: 0 }; e.onFloor = e.moveType !== 'float'; e.setState('idle', 400);
  }
  // per-satellite input handlers (called by main's pet:* IPC with {sat:id})
  function wire(s) {
    s.grab = () => { const c = d.cursor(); s.grabOff = { dx: c.x - s.engine.pos.x, dy: c.y - s.engine.pos.y }; s.dragStartAt = s.dragPingAt = now(); s.engine.grab(); };
    s.release = () => { if (s.engine.dragging) s.engine.release(); s.grabOff = null; s.dragPingAt = 0; };
    s.dragPing = () => { s.dragPingAt = now(); };
    s.tap = () => s.engine.petted();
    s.speaking = (ms) => s.engine.holdForSpeech(now(), Number(ms));
    s.seen = () => s.health.seen();
    s.rescue = (at) => { s.engine.rescue(at || geo.homePosition(s.engine.size, s.engine.displays, d.cursor())); s.grabOff = null; s.dragPingAt = 0; s.shown = null; };
  }

  // ---- window ------------------------------------------------------------------------------------------------------
  function makeWindow(s) {
    const { Wd, Ht } = d.petBox(s.engine.size);
    const w = new d.BrowserWindow({
      width: Wd, height: Ht, x: 0, y: 0, transparent: true, frame: false, resizable: false, movable: false,
      skipTaskbar: true, focusable: false, hasShadow: false, show: false, fullscreenable: false,
      type: process.platform === 'win32' ? undefined : 'panel',
      webPreferences: { preload: d.preloadPath, backgroundThrottling: false },
    });
    s.win = w; s.ready = false; s.shown = null; s.interactive = false; s.topAt = 0; s.want = null;
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    w.setIgnoreMouseEvents(true);
    w.loadFile(d.indexPath, { query: { char: s.id } });
    w.once('ready-to-show', () => { if (s.win !== w || w.isDestroyed()) return; w.showInactive(); s.ready = true; s.shown = null; try { w.webContents.send('state', d.fullState()); } catch {} });
    w.on('closed', () => { if (s.win === w) s.win = null; });
    const wc = w.webContents, kill = (why) => () => { logError('companion renderer ' + s.id, why); try { if (!w.isDestroyed()) w.destroy(); } catch {} };   // the frame loop rebuilds it (back-off governed)
    wc.on('did-finish-load', () => { s.interactive = null; });
    wc.on('render-process-gone', kill('gone')); wc.on('unresponsive', kill('unresponsive'));
    wc.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain && code !== -3) kill('fail-load ' + code)(); });
  }
  function revive(s, t) {   // window lost: rebuild after an exponential back-off, give up after a few tries
    if (s.dead) return;
    if (!s.reviveAt) { const r = s.gov.next(t); if (r.give) { s.dead = true; logError('companion ' + s.id, 'giving up after repeated window failures'); return; } s.reviveAt = t + r.delay; return; }
    if (t >= s.reviveAt) { s.reviveAt = 0; makeWindow(s); }
  }
  function setVisible(s, vis, t) {
    if (s.shown === vis) return; s.shown = vis; const w = s.win;
    try {
      if (vis) { w.setOpacity(1); w.setAlwaysOnTop(true, 'screen-saver'); w.setIgnoreMouseEvents(true); s.interactive = null; s.topAt = 0; s.engine.lastTick = t; }
      else {
        w.setIgnoreMouseEvents(true); s.interactive = false; w.setAlwaysOnTop(false); w.setOpacity(0);
        s.grabOff = null; s.dragPingAt = 0; s.engine.forceRelease(); s.engine.cancelScript('hidden'); if (slot === s.id) slot = null;
        if (!w.webContents.isDestroyed()) w.webContents.send('pet', { show: false });
      }
    } catch {}
  }
  function position(s) {
    try {
      const e = s.engine, { Wd, Ht, localX, localY } = d.petBox(e.size);
      let x = Math.round(e.pos.x - localX), y = Math.round(e.pos.y - localY);
      if (![x, y, Wd, Ht].every(Number.isFinite)) return;
      x = clamp(x, -32000, 32000); y = clamp(y, -32000, 32000);
      const w = clamp(Wd, 1, 32000), h = clamp(Ht, 1, 32000), b = s.win.getBounds();
      s.localX = localX; s.localY = localY; s.want = { x, y, width: w, height: h };
      s.fx = pacing.subpixel(e.pos.x - localX, x); s.fy = pacing.subpixel(e.pos.y - localY, y);
      if (b.width !== w || b.height !== h) { s.win.setBounds({ x, y, width: w, height: h }); s.interactive = null; }
      else if (b.x !== x || b.y !== y) s.win.setPosition(x, y);
    } catch { /* transient bad value: skip this frame */ }
  }
  function send(s, t) {
    const e = s.engine;
    if (s.lastPx != null && t > s.lastPt) { const v = (e.pos.x - s.lastPx) / ((t - s.lastPt) / 1000); if (Number.isFinite(v)) s.vx += (v - s.vx) * 0.3; }
    s.lastPx = e.pos.x; s.lastPt = t;
    const mf = e.mischief;   // the wizard's self effects (shrink / rainbow / fade) ride the same fields as the lead
    s.win.webContents.send('pet', { show: true, x: s.localX, y: s.localY, fx: s.fx || 0, fy: s.fy || 0, size: e.size, state: e.state, facing: e.facing, vx: Math.round(s.vx),
      clip: null, rot: mf && mf.rot ? Math.round(mf.rot) : 0,
      sc: mf && Number.isFinite(mf.sc) ? clamp(mf.sc, 0.3, 1) : 1, hue: mf && Number.isFinite(mf.hue) ? Math.round(mf.hue) : 0, alpha: mf && Number.isFinite(mf.alpha) ? clamp(mf.alpha, 0, 1) : 1 });
  }
  function setMouse(s, cur) {   // capture the mouse only while the cursor is over this buddy (or it is dragged); native call only on change
    const e = s.engine, want = !!(e.dragging || e.hitTest(cur.x, cur.y, pacing.hitPad(e.size, s.interactive === true)));
    if (s.interactive !== want) { s.interactive = want; if (want) s.win.setIgnoreMouseEvents(false); else s.win.setIgnoreMouseEvents(true); }
    const moved = !!s.hcCur && (s.hcCur.x !== cur.x || s.hcCur.y !== cur.y); s.hcCur = { x: cur.x, y: cur.y };
    if (!moved || s.interactive !== true || !want) { s.health.sample(now(), { interactive: s.interactive, overPet: want, moved, blocked: false }); return; }
    const a = s.health.sample(now(), { interactive: true, overPet: true, moved: true, blocked: cursorOverOtherWindow(s, cur) });
    if (a === 'reapply') { try { s.win.setContentProtection(false); s.win.setIgnoreMouseEvents(true); s.win.setIgnoreMouseEvents(false); s.win.setAlwaysOnTop(true, 'screen-saver'); if (s.win.moveTop) s.win.moveTop(); } catch {} }
    else if (a === 'recreate') { logError('companion ' + s.id, 'window stopped receiving the mouse; rebuilding it'); try { s.win.destroy(); } catch {} }
  }
  function cursorOverOtherWindow(s, cur) {   // one of our own normal windows (settings, popup) under the cursor: legitimately no mouse
    try { return d.BrowserWindow.getAllWindows().some(w => w !== s.win && !w.isDestroyed() && w.isVisible() && w.isFocusable()
      && (b => cur.x >= b.x && cur.x < b.x + b.width && cur.y >= b.y && cur.y < b.y + b.height)(w.getBounds())); } catch { return false; }
  }
  function keepOnTop(s, t) {
    if (t - s.topChk < 500 && s.topAt !== 0) return; s.topChk = t;
    try {
      if (!s.win.isAlwaysOnTop()) s.win.setAlwaysOnTop(true, 'screen-saver');
      if (t - s.topAt >= 6000) { s.topAt = t; s.win.setAlwaysOnTop(true, 'screen-saver'); if (s.win.moveTop) s.win.moveTop(); }
    } catch {}
  }

  // ---- behaviour ---------------------------------------------------------------------------------------------------
  function applySettings(s) {
    const st = state().settings, g = d.gates(), e = s.engine, focus = !!g.focus;
    e.setSettings({ speed: st.speed, personality: st.personality, mischief: st.mischief, stayPut: !!st.stayPut || focus, focus, reduceMotion: !!st.reduceMotion });
    if (!st.antics) e.cancelScript('settings');
    e.setSize(sizeFor(s.id, st.size));
    if (focus && e.state === 'sleep') e.setState('idle', 300);   // a nap that spans the start of focus ends now
  }
  // satellites rarely talk: one global budget, never over the lead, mute during focus
  function sayOk(t) { return !!G && !G.focus && !G.leadSpeaking && t - lastSayAt >= SAY_GAP_MS && ![...sats.values()].some(o => o.engine.isSpeaking(t)); }
  function onEvent(s, type, data) {
    if (!s.win || s.win.isDestroyed() || s.win.webContents.isDestroyed()) return;
    if (type === 'say') { const t = now(); if (!sayOk(t)) return; lastSayAt = t; }
    s.win.webContents.send('petEvent', Object.assign({ type }, data || {}));
  }
  const touchesFs = (s, g) => { if (!g.fsDisplays || !g.fsDisplays.size) return false; const e = s.engine, { Wd, Ht, localX, localY } = d.petBox(e.size);
    for (const dp of d.screen.getAllDisplays()) if (g.fsDisplays.has(dp.id) && (geo.overlapArea(e.pos.x, e.pos.y, e.size, e.size, dp.bounds) > 0 || geo.overlapArea(e.pos.x - localX, e.pos.y - localY, Wd, Ht, dp.bounds) > 0)) return true;
    return false; };
  function moveOffFullscreen(s, g) {   // wandered or was dropped onto a covered display: hop across to a free one
    const free = d.screen.getAllDisplays().filter(x => !g.fsDisplays.has(x.id)); if (!free.length) return;
    s.engine.rescue(geo.homePosition(s.engine.size, free, d.cursor())); s.grabOff = null;
  }
  // soft spacing: buddies standing on top of each other drift apart slowly (never while dragged, scripted or climbing)
  function spread(s, dt) {
    const e = s.engine; if (e.dragging || e.script || e.state === 'climb' || e.state === 'drag' || !e.onFloor && e.moveType !== 'float') return;
    if (e.state === 'walk' || e.target != null) return;   // a buddy on its way somewhere walks straight past the others (pushing it back made it look stuck)
    const me = e.pos.x + e.size / 2, L = d.lead(), others = [L.pos.x + L.size / 2];
    for (const o of sats.values()) if (o !== s && o.shown) others.push(o.engine.pos.x + o.engine.size / 2);
    for (const c of others) { const dx = me - c, min = e.size * 0.7; if (Math.abs(dx) < min) e.pos.x = clamp(e.pos.x + (dx < 0 ? -1 : 1) * SPACING_PX_S * dt * (1 - Math.abs(dx) / min + 0.2), e.world.x0, e.world.x1 - e.size); }
  }
  function step(s, t, cur) {
    const e = s.engine;
    if (!s.win || s.win.isDestroyed()) { revive(s, t); return; }
    if (!s.ready) return;
    if (G.fsDisplays.size && touchesFs(s, G)) moveOffFullscreen(s, G);
    const vis = !G.userHidden && !touchesFs(s, G);
    setVisible(s, vis, t);
    if (!vis) { s._veiled = false; return; }
    // While the lead plays a desktop prank the extras stay VISIBLE (hiding them looked like a glitch): they are excluded from the
    // prank's screen capture (same trick as the lead) and hold still so they don't wander into the gag.
    if (G.mischiefRunning) {
      if (!s._veiled) { s._veiled = true; try { s.win.setContentProtection(true); } catch {} }
      if (!e.dragging && !e.script) { e.settle(); e.nextDecision = Math.max(e.nextDecision || 0, t + 1500); }
    } else if (s._veiled) { s._veiled = false; try { s.win.setContentProtection(false); s.interactive = null; } catch {} }
    const calm = pacing.isCalm(e, !!s.grabOff, t, s.motion.until);
    if (calm && (++s.calmSkip % 3)) return;
    if (!calm) s.calmSkip = 0;
    e.setCursor({ x: cur.x, y: cur.y });
    if (e.dragging && t - s.dragPingAt > 3000) { e.forceRelease(); s.grabOff = null; }   // the renderer lost its pointerup
    else if (s.grabOff && e.dragging) e.dragTo(cur.x - s.grabOff.dx + e.size / 2, cur.y - s.grabOff.dy + e.size / 2);
    spread(s, Math.min(0.05, Math.max(0, (t - (e.lastTick || t)) / 1000)));
    e.tick(t);
    s.motion = pacing.trackMotion(s.motion, e.pos, t);
    position(s); send(s, t); setMouse(s, cur); keepOnTop(s, t);
  }
  function frame(t) {
    if (!sats.size) return;
    t = t == null ? now() : t;
    G = d.gates();
    const cur = d.cursor();
    if (t - settingsAt >= SETTINGS_MS) { settingsAt = t; for (const s of sats.values()) { try { applySettings(s); } catch (err) { logError('companion settings', err); } } }
    for (const s of sats.values()) { try { step(s, t, cur); } catch (err) { logError('companion ' + s.id, err); } }
    try { pairFrame(t); pairTick(t); anticTick(t); } catch (err) { logError('companion antic', err); }
  }

  // ---- antics: ONE shared slot, min 8 s apart, sprite-only, never while the lead runs a script or a prank ------------------
  function anticDelay() {
    const [a, b] = scripts.anticRange(state().settings.mischief), n = Math.max(1, sats.size);
    return Math.max(ANTIC_GAP_MS, (a + rand() * (b - a)) * 60000 / n);
  }
  function anticTick(t) {
    if (pair) return;   // a pair interaction owns the shared slot
    if (slot) {
      const o = sats.get(slot);
      if (o && o.engine.script) return;
      slot = null; lastSlotEnd = t; nextAnticAt = Math.max(nextAnticAt, t + ANTIC_GAP_MS, t + anticDelay());   // finished (or cancelled): rest before the next one
      return;
    }
    if (t < nextAnticAt) return;
    const st = state().settings, g = G;
    if (g.leadBusy || g.mischiefRunning) { nextAnticAt = t + 5000; return; }
    if (g.focus || g.userHidden || (g.fsDisplays && g.fsDisplays.size) || st.stayPut || st.reduceMotion || st.paused || !st.antics) { nextAnticAt = t + 30000; return; }
    const cands = [...sats.values()].filter(s => s.ready && s.shown && s.win && !s.win.isDestroyed() && anticNames(s.id).length);
    for (let i = cands.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [cands[i], cands[j]] = [cands[j], cands[i]]; }
    for (const s of cands) {
      const e = s.engine; e.settle();
      if (!e.canStartScript(true)) continue;
      const names = anticNames(s.id), sc = scripts.makeScript(s.id, names[(rand() * names.length) | 0]);
      if (sc && e.startScript(sc, t)) { slot = s.id; log('companion antic ' + s.id + ' ' + sc.name); return; }
    }
    nextAnticAt = t + 1500;   // everyone busy: look again soon
  }

  // ---- pair interactions: meet / spook / zap / rescue (pure planner + sessions in shared/pairs.js) ---------------------------
  function actors() {   // everyone who can take part: the lead (if the host gave it) and every satellite
    const out = [], L = d.leadActor && d.leadActor();
    if (L && L.engine) out.push({ id: L.id, engine: L.engine, shown: !!L.shown });
    for (const s of sats.values()) out.push({ id: s.id, engine: s.engine, shown: !!(s.ready && s.shown && s.win && !s.win.isDestroyed()) });
    return out;
  }
  const dispOf = (e) => { const x = geo.displayForSprite(e.pos, e.size, e.displays); return x ? x.id : null; };
  const quiet = (st, g) => g.focus || g.userHidden || g.mischiefRunning || (g.fsDisplays && g.fsDisplays.size) || st.stayPut || st.reduceMotion || !st.antics;
  function startPair(kind, A, B, t) {
    const sess = pairs.createSession(kind, A, B, { rand }), [sa, sb] = sess.scripts;
    if (!A.engine.startScript(sa, t)) return false;
    if (!(sess.forceB ? pairs.forceScript(B.engine, sb, t) : B.engine.startScript(sb, t))) { A.engine.cancelScript('pair'); return false; }
    pair = { sess, A, B, sa, sb, kind }; log('companion pair ' + kind + ' ' + A.id + ' + ' + B.id);
    return true;
  }
  function endPair(p, t) {
    for (const [a, sc] of [[p.A, p.sa], [p.B, p.sb]]) if (a.engine.script === sc) a.engine.cancelScript('pair');
    pair = null; lastSlotEnd = t;
    nextAnticAt = Math.max(nextAnticAt, t + ANTIC_GAP_MS); nextPairAt = Math.max(nextPairAt, t + 20000 + rand() * 25000);
    log('companion pair ended ' + p.kind + (p.sess.aborted ? ' (aborted: ' + p.sess.aborted + ')' : ''));
  }
  function pairFrame(t) {
    const dt = lastFrameT ? (t - lastFrameT) / 1000 : 0.016; lastFrameT = t;
    if (pair) {
      const p = pair, g = G;
      if (g.focus || g.userHidden || g.mischiefRunning || (g.fsDisplays && g.fsDisplays.size)) p.sess.abort('gate');
      p.sess.tick(dt);
      if (!p.sess.alive(p.sa, p.sb)) endPair(p, t);
    }
    for (const a of actors()) {   // a buddy let go (or thrown) high above the floor: the hero catches it
      const was = wasDrag.get(a.id), isD = !!a.engine.dragging; wasDrag.set(a.id, isD);
      if (was && !isD && !tryRescue(a, t)) pendingRescue = a.id;   // the hero may be mid-hop: keep trying while it falls
    }
    if (pendingRescue) { const a = actors().find(x => x.id === pendingRescue);
      if (!a || a.engine.dragging || a.engine.onFloor || a.engine.state !== 'fall') pendingRescue = null; else if (tryRescue(a, t)) pendingRescue = null; }
  }
  function tryRescue(f, t) {
    const st = state().settings;
    if (pair || slot || quiet(st, G) || t < rescueCoolAt) return false;
    const e = f.engine, hero = actors().find(a => a.id === 'hero' && a.id !== f.id && a.shown && !a.engine.script && !a.engine.dragging);
    if (!hero) return false;
    if (!hero.engine.canStartScript(true)) { hero.engine.settle(); if (!hero.engine.canStartScript(true)) return false; }   // mid-stroll: stop and go (asleep / mid-hop: no rescue)
    const ok = pairs.shouldRescue({ id: f.id, moveType: e.moveType, drop: e.floorAt(e.pos.x) - e.pos.y, heroFree: true, sameDisplay: dispOf(e) === dispOf(hero.engine), cooling: false });
    if (ok && e.state === 'fall' && startPair('rescue', hero, f, t)) { rescueCoolAt = t + pairs.RESCUE_COOLDOWN_MS; return true; }
    return false;
  }
  function pairTick(t) {   // ~4 Hz: look for two idle buddies close together and let them interact
    if (t < pairAt) return; pairAt = t + 250;
    if (pair || slot || t < nextPairAt || t - lastSlotEnd < ANTIC_GAP_MS) return;
    const st = state().settings; if (quiet(st, G) || G.leadBusy) return;
    const cands = actors().filter(a => a.shown && a.engine.canStartScript(true)).map(a => ({ id: a.id, x: a.engine.pos.x, y: a.engine.pos.y, size: a.engine.size, disp: dispOf(a.engine), free: true, a }));
    const pk = pairs.pickPair(cands, { now: t, cool, rand });
    if (!pk) return;
    if (startPair(pk.kind, pk.a.a, pk.b.a, t)) cool.set(pairs.pairKey(pk.a.id, pk.b.id), pairs.cooldownUntil(t, rand));
    else nextPairAt = t + 5000;
  }
  // dev: force one interaction now (ignores cooldowns and the schedule, not the roster). -> { ok, reason }
  function force(kind) {
    const t = now(), all = actors().filter(a => a.shown), by = (id) => all.find(a => a.id === id);
    let A, B;
    if (kind === 'zap') { A = by('wizard'); B = by('cat'); } else if (kind === 'spook') { A = by('ghost'); B = by('blob'); }
    else if (kind === 'rescue') { A = by('hero'); B = all.find(a => a.id !== 'hero' && a.engine.moveType !== 'float'); } else if (kind === 'meet') { A = all[0]; B = all[1]; }
    else return { ok: false, reason: 'kind' };
    if (!A || !B) return { ok: false, reason: 'roster' };
    if (pair) { pair.sess.abort('forced'); endPair(pair, t); }
    for (const a of [A, B]) { const e = a.engine; e.cancelScript('dev'); e.forceRelease(); e.parachute = false; e.target = null; e._wantClimb = e._peeking = false; e.vel.x = e.vel.y = 0; e.setState('idle', 1000); if (e.moveType !== 'float') { e.pos.y = e.floorAt(e.pos.x); e.onFloor = true; } }
    const ea = A.engine, eb = B.engine, D = ea.currentDisplay(), sd = ea.pos.x + ea.size * 3.2 + eb.size > D.x1 ? -1 : 1;
    eb.pos.x = clamp(ea.pos.x + sd * ea.size * 3.2, D.x0, D.x1 - eb.size); eb.pos.y = eb.moveType === 'float' ? ea.pos.y : eb.floorAt(eb.pos.x);
    if (kind === 'rescue') { eb.pos.y = Math.max(eb.world.y0, eb.floorAt(eb.pos.x) - 400); eb.onFloor = false; eb.setState('fall', 1e9); }
    return startPair(kind, A, B, t) ? { ok: true } : { ok: false, reason: 'not-started' };
  }

  function onDisplaysChanged() {
    for (const s of sats.values()) { try { s.engine.setWorld(d.worldDisplays()); s.shown = null; s.interactive = null; s.topAt = 0; } catch (err) { logError('companion displays', err); } }
  }
  // after a wake from sleep: a fresh window for every satellite (same reason as the lead, see main.js onWake)
  function rebuildWindows() {
    for (const s of sats.values()) {
      if (s.dead) continue;
      try { const w = s.win; s.win = null; if (w && !w.isDestroyed()) w.destroy(); } catch {}
      s.grabOff = null; s.dragPingAt = 0; s.reviveAt = 0; try { s.engine.forceRelease(); } catch {}
      try { makeWindow(s); } catch (err) { logError('companion rebuild ' + s.id, err); }
    }
  }
  return {
    sync, frame, destroyAll, onDisplaysChanged, force, rebuildWindows,
    get: (id) => sats.get(id) || null,
    anyBusy: () => !!slot || !!pair || [...sats.values()].some(s => !!s.engine.script),
    forEach: (fn) => { for (const s of [...sats.values()]) fn(s); },
    broadcast: (channel, payload) => { for (const s of sats.values()) { try { if (s.win && !s.win.isDestroyed()) s.win.webContents.send(channel, payload); } catch {} } },
    count: () => sats.size,
  };
}

module.exports = { createCompanions, wantedIds, anticNames, MAX_SATS, STAGGER_MS, ANTIC_GAP_MS, SAY_GAP_MS };

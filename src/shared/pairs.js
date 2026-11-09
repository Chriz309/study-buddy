/* Multi-pet pair interactions (pure, no Electron): who may pair, and the two-buddy "sessions" that act them out.
   A session drives BOTH engines from one conductor (tick(dt), called once per frame by companions.js) and hands each engine a thin script
   that only holds it (the engine's own brain is suspended, a drag / hide / quiet gate cancels it). If either script is cancelled, or the
   rendezvous takes too long, the whole session aborts and both sides are released with every visual effect back to default.
   Kinds: meet (any pair), spook (ghost -> blob), zap (wizard -> cat, frog tint), rescue (hero catches a dropped buddy). */
'use strict';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sign = (v) => (v < 0 ? -1 : 1);
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;

const PAIR_DIST = 600, MEET_DIST = 900;      // DIP between sprite centres: spook / zap need 600, a meet can walk two buddies together from 900
const RDV_MS = 9000;                          // rendezvous: both must arrive within this, else both are released
const COOLDOWN_MS = [60000, 120000];          // per pair
const RESCUE_MIN_DROP = 150, RESCUE_COOLDOWN_MS = 20000;
const FROG = { sc: 0.6, hue: 100 };

const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const centre = (p) => ({ x: p.x + p.size / 2, y: p.y + p.size / 2 });
const dist = (a, b) => { const p = centre(a), q = centre(b); return Math.hypot(p.x - q.x, p.y - q.y); };

// roles for a kind: the special kinds fix who plays which part (null = this pair cannot do it)
function rolesFor(kind, a, b) {
  if (kind === 'meet') return [a, b];
  const need = kind === 'spook' ? ['ghost', 'blob'] : kind === 'zap' ? ['wizard', 'cat'] : null;
  if (!need) return null;
  if (a.id === need[0] && b.id === need[1]) return [a, b];
  if (b.id === need[0] && a.id === need[1]) return [b, a];
  return null;
}
// p: { id, x, y, size, disp, free } (free: idle on the floor, shown, not in a script or drag). o: { now, cool: Map(pairKey -> until), kind }
function canPair(a, b, o) {
  o = o || {};
  if (!a || !b || a.id === b.id || !a.free || !b.free) return false;
  if (a.disp !== b.disp) return false;
  const kind = o.kind || 'meet';
  if (dist(a, b) > (kind === 'meet' ? MEET_DIST : PAIR_DIST)) return false;
  if (o.cool && (o.cool.get(pairKey(a.id, b.id)) || 0) > (o.now || 0)) return false;
  return !!rolesFor(kind, a, b);
}
// pick one {kind, a, b} (a, b already in role order) among every eligible pair, special kinds favoured over a plain meet; null if none
function pickPair(cands, o) {
  const R = (o && o.rand) || Math.random, opts = [];
  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
    for (const kind of ['spook', 'zap']) {   // 'meet' is no longer picked on its own: two buddies walking into each other looked stuck (still forceable via dev pair:meet)
      if (!canPair(cands[i], cands[j], { ...o, kind })) continue;
      const r = rolesFor(kind, cands[i], cands[j]); opts.push({ kind, a: r[0], b: r[1], w: kind === 'meet' ? 1 : 3 });
    }
  }
  if (!opts.length) return null;
  let r = R() * opts.reduce((s, x) => s + x.w, 0);
  for (const x of opts) { r -= x.w; if (r <= 0) return { kind: x.kind, a: x.a, b: x.b }; }
  const l = opts[opts.length - 1]; return { kind: l.kind, a: l.a, b: l.b };
}
const cooldownUntil = (now, R) => now + COOLDOWN_MS[0] + (R || Math.random)() * (COOLDOWN_MS[1] - COOLDOWN_MS[0]);

// a thrown / released buddy that falls more than 150 DIP is caught by a free hero (never the hero itself, never a floater, never a parachuting one)
function shouldRescue(i) {
  return !!(i && i.drop > RESCUE_MIN_DROP && i.moveType !== 'float' && i.id !== 'hero' && i.heroFree && i.sameDisplay && !i.cooling);
}

// ---- session -------------------------------------------------------------------------------------------------------------
const ev = (e, type, data) => { if (e.hooks && e.hooks.event) e.hooks.event(type, data); };
const cx = (e) => e.pos.x + e.size / 2;
const onGround = (e) => { if (e.moveType !== 'float') e.pos.y = e.floorAt(e.pos.x); };
const clampX = (e, x) => { const D = e.currentDisplay(); return clamp(x, D.x0, D.x1 - e.size); };
const faceTo = (e, o) => { e.facing = sign(cx(o) - cx(e)); };
const setSt = (e, s) => { if (e.state !== s) e.setState(s, 1e9); };
// one walking / drifting step toward pos.x = tx (and pos.y = ty for floaters); true on arrival
function stepTo(e, tx, ty, dt, mul) {
  const spd = e.baseSpeed * (e.settings.speed || 1) * 1.6 * (mul || 1), dx = tx - e.pos.x;
  e.pos.x += sign(dx) * Math.min(Math.abs(dx), spd * dt);
  if (Math.abs(dx) > 1) e.facing = sign(dx);
  let atY = true;
  if (e.moveType === 'float' && ty != null) { const dy = ty - e.pos.y; e.pos.y += sign(dy) * Math.min(Math.abs(dy), spd * dt); atY = Math.abs(ty - e.pos.y) < 2; } else onGround(e);
  setSt(e, e.moveType === 'float' ? 'idle' : 'walk');
  return Math.abs(tx - e.pos.x) < 2 && atY;
}
const setFx = (e, o) => { e.mischief = Object.assign({ sc: 1, hue: 0, alpha: 1, _p: 1 }, o); };
const clearFx = (e) => { if (e.mischief && e.mischief._p) e.mischief = null; };

// the faller of a rescue is not idle, so it is held by a script without the usual canStartScript check
function forceScript(e, s, now) {
  e.script = s; e._scriptAt = now == null ? e._now : now; e.target = null; e._wantClimb = e._peeking = false; e.vel.x = 0; e.vel.y = 0;
  try { s.init && s.init(e, e._scriptAt); } catch (err) { e.script = null; return false; }
  return true;
}

// A, B: { id, engine }. For 'rescue': A = hero, B = the faller. Returns { kind, scripts: [forA, forB], forceB, tick(dt), alive(), done, aborted, cleanup }
function createSession(kind, A, B, o) {
  o = o || {};
  const ea = A.engine, eb = B.engine, sh = { phase: 'approach', pt: 0, t: 0, done: false, aborted: null, f: {} };
  const go = (p) => { sh.phase = p; sh.pt = 0; sh.f = {}; };
  const once = (k, fn) => { if (!sh.f[k]) { sh.f[k] = 1; fn(); } };
  const cleanup = () => { clearFx(ea); clearFx(eb); };
  const finish = () => { if (sh.done) return; sh.done = true; cleanup(); };
  const abort = (why) => { if (sh.done) return; sh.done = true; sh.aborted = why || 'cancel'; cleanup(); };
  const hold = (name, forced) => ({ name: 'pair-' + name, allowAir: true, maxMs: RDV_MS + 12000, init(e) { e.target = null; if (!forced) e.vel.x = e.vel.y = 0; }, update: () => sh.done, cancel: (e, why) => abort(why) });
  const S = (ea.size + eb.size) / 2;

  const P = {
    // meet & greet: walk to within ~0.9 sprite widths, face each other, both hop, hearts
    meet: {
      approach(dt) {
        const gap = 0.9 * S, ca = cx(ea), cb = cx(eb);
        if (Math.abs(ca - cb) <= gap + 2) return go('greet');
        const mid = (ca + cb) / 2, d = sign(cb - ca);
        const a = stepTo(ea, clampX(ea, mid - d * gap / 2 - ea.size / 2), eb.pos.y, dt), b = stepTo(eb, clampX(eb, mid + d * gap / 2 - eb.size / 2), ea.pos.y, dt);
        if (a && b) go('greet');
      },
      greet(dt) {
        faceTo(ea, eb); faceTo(eb, ea); setSt(ea, 'idle'); setSt(eb, 'idle');
        once('hi', () => { ev(ea, 'hop'); ev(eb, 'hop'); ev(ea, 'popup', { text: 'Hi!' }); ev(eb, 'popup', { text: 'Hey!' }); });
        const k = sh.pt / 1.6, hop = Math.abs(Math.sin(Math.PI * 2 * clamp(k, 0, 1)));
        for (const e of [ea, eb]) if (e.moveType !== 'float') e.pos.y = e.floorAt(e.pos.x) - e.size * 0.2 * hop;
        if (k > 0.3) once('hearts', () => { ev(ea, 'happy'); ev(eb, 'happy'); });
        if (k > 0.5) once('hop2', () => { ev(ea, 'hop'); ev(eb, 'hop'); });
        if (sh.pt >= 1.7) { onGround(ea); onGround(eb); finish(); }
      },
    },
    // spook: the ghost drifts up, swoops through the blob, the blob jiggles with a surprised face, the ghost giggles
    spook: {
      approach(dt) {
        faceTo(eb, ea); setSt(eb, 'idle');
        const side = sign(cx(ea) - cx(eb)); sh.side = side;
        if (stepTo(ea, clampX(ea, cx(eb) + side * 2.3 * eb.size - ea.size / 2), eb.pos.y - eb.size * 0.1, dt, 1.3)) { sh.sx = ea.pos.x; go('swoop'); }
      },
      swoop(dt) {
        const k = clamp(sh.pt / 0.9, 0, 1), side = sh.side || 1, tx = clampX(ea, cx(eb) - side * 1.8 * eb.size - ea.size / 2);
        once('boo', () => ev(ea, 'popup', { text: 'Boo!' }));
        ea.pos.x = lerp(sh.sx, tx, ease(k)); ea.pos.y = eb.pos.y - eb.size * 0.1 + Math.sin(Math.PI * k) * eb.size * 0.18; ea.facing = -side; setSt(ea, 'idle');
        if (k >= 0.5) once('scare', () => { setSt(eb, 'shocked'); ev(eb, 'wiggle'); ev(eb, 'popup', { text: '!' }); });
        if (k >= 1) go('giggle');
      },
      giggle(dt) {
        faceTo(ea, eb); setSt(ea, 'idle');
        once('hee', () => { ev(ea, 'popup', { text: 'Hee hee!' }); ev(ea, 'wiggle'); });
        if (sh.pt > 0.7) once('hee2', () => ev(ea, 'wiggle'));
        if (sh.pt > 0.9) once('calm', () => { setSt(eb, 'idle'); ev(eb, 'popup', { text: 'Hey!' }); });
        if (sh.pt >= 1.7) finish();
      },
    },
    // zap: the wizard points and casts, a sparkle bolt hits the cat, which shrinks and turns frog-green for ~3 s, then poofs back
    zap: {
      approach(dt) {
        faceTo(eb, ea); setSt(eb, 'idle');
        const side = sign(cx(ea) - cx(eb)); sh.side = side;
        if (stepTo(ea, clampX(ea, cx(eb) + side * 2.2 * eb.size - ea.size / 2), null, dt, 1.2)) { faceTo(ea, eb); go('cast'); }
      },
      cast(dt) {
        faceTo(ea, eb); setSt(ea, 'cast'); onGround(ea);
        once('zap', () => { ev(ea, 'popup', { text: 'Zap!' }); ev(ea, 'sparkle', { n: 8 }); });
        if (sh.pt >= 0.9) { sh.bx = eb.pos.x; go('bolt'); }
      },
      bolt(dt) {
        const k = clamp(sh.pt / 0.5, 0, 1);
        once('hit', () => { setSt(eb, 'surprised'); ev(eb, 'wiggle'); });
        sh.sp = (sh.sp || 0) - dt; if (sh.sp <= 0) { sh.sp = 0.12; ev(ea, 'sparkle', { n: 3 }); ev(eb, 'sparkle', { n: 4 }); }
        setFx(eb, { sc: lerp(1, FROG.sc, ease(k)), hue: Math.round(lerp(0, FROG.hue, ease(k))) });
        if (k >= 1) go('frog');
      },
      frog(dt) {
        setFx(eb, { sc: FROG.sc, hue: FROG.hue }); setSt(ea, 'happy'); onGround(ea);
        once('hehe', () => { ev(ea, 'popup', { text: 'Hehe!' }); ev(eb, 'popup', { text: 'Mrrp?' }); });
        eb.pos.x = clampX(eb, sh.bx + (sh.pt < 0.6 ? Math.sin(sh.pt * 60) * 3 : 0));
        if (sh.pt > 0.6) setSt(eb, 'idle');
        if (sh.pt >= 3.0) { clearFx(eb); go('poof'); }
      },
      poof(dt) {
        clearFx(eb);
        once('poof', () => { ev(eb, 'sparkle', { n: 12 }); ev(eb, 'dust'); ev(ea, 'sparkle', { n: 6 }); setSt(eb, 'surprised'); });
        if (sh.pt >= 0.7) { setSt(eb, 'idle'); finish(); }
      },
    },
    // rescue: the hero dashes under the falling buddy, catches it (no parachute), sets it down, hearts + a line
    rescue: {
      approach(dt) {
        once('hold', () => { if (eb.parachute) { eb.parachute = false; ev(eb, 'parachuteClose'); } eb.vel.x = eb.vel.y = 0; setSt(eb, 'fall'); setSt(ea, 'fly'); ev(ea, 'launch'); });
        const fl = eb.floorAt(eb.pos.x) - eb.size * 0.3;
        eb.pos.y = Math.min(eb.pos.y + 150 * dt, fl);                                  // drifts down a little while the hero comes
        const hy = Math.min(ea.floorAt(eb.pos.x), eb.pos.y + eb.size * 0.85), hx = clampX(ea, eb.pos.x + (eb.size - ea.size) / 2);
        const spd = 1700 * dt, dx = hx - ea.pos.x, dy = hy - ea.pos.y;
        ea.pos.x += sign(dx) * Math.min(Math.abs(dx), spd); ea.pos.y += sign(dy) * Math.min(Math.abs(dy), spd); ea.facing = sign(dx) || ea.facing;
        if ((Math.abs(dx) < 6 && Math.abs(dy) < 6) || sh.pt > 1.2) { ea.pos.x = hx; ea.pos.y = hy; go('carry'); }
      },
      carry(dt) {
        once('got', () => { ev(ea, 'popup', { text: 'Got you!' }); setSt(eb, 'happy'); });
        const k = clamp(sh.pt / 1.1, 0, 1); sh.hy0 = sh.hy0 == null ? ea.pos.y : sh.hy0;
        ea.pos.y = lerp(sh.hy0, ea.floorAt(ea.pos.x), ease(k)); setSt(ea, 'fly');
        eb.pos.x = clampX(eb, ea.pos.x + (ea.size - eb.size) / 2); eb.pos.y = ea.pos.y - eb.size * 0.85;
        if (k >= 1) go('land');
      },
      land(dt) {
        once('down', () => { onGround(ea); ev(ea, 'land', { vy: 300 }); ev(ea, 'dust'); ev(ea, 'happy'); ev(eb, 'happy'); ev(eb, 'popup', { text: 'Phew!' }); sh.side = ea.pos.x > (ea.currentDisplay().x0 + ea.currentDisplay().x1) / 2 ? -1 : 1; });
        eb.pos.x = clampX(eb, ea.pos.x + (sh.side || 1) * ea.size * 0.95); onGround(eb); onGround(ea);
        setSt(ea, sh.pt < 0.3 ? 'land' : 'flex'); setSt(eb, 'idle');
        if (sh.pt >= 1.4) finish();
      },
    },
  };
  const table = P[kind];
  return {
    kind, forceB: kind === 'rescue',
    scripts: [hold(kind, false), hold(kind, kind === 'rescue')],
    get done() { return sh.done; }, get aborted() { return sh.aborted; }, get phase() { return sh.phase; },
    abort, cleanup,
    alive(sa, sb) { return !sh.done && ea.script === sa && eb.script === sb; },
    tick(dt) {
      if (sh.done || !table) return;
      dt = clamp(dt, 0, 0.05); sh.t += dt; sh.pt += dt;
      if (sh.phase === 'approach' && sh.t > RDV_MS / 1000) return abort('timeout');   // the rendezvous never happened: release both
      table[sh.phase](dt);
    },
  };
}

module.exports = { createSession, forceScript, canPair, pickPair, rolesFor, shouldRescue, cooldownUntil, pairKey, PAIR_DIST, MEET_DIST, RDV_MS, COOLDOWN_MS, RESCUE_MIN_DROP, RESCUE_COOLDOWN_MS, FROG };

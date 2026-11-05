// Scripted antics for the engine: the cat's butterfly chase, Captain Cram's stunts, the blob's wall scale + bounce spree and the ghost's wall-phase dash + swoop.
// Pure logic (no Electron): each factory returns a script { name, maxMs, init, update, cancel }
// that the engine runs in place of its normal brain (see Engine.startScript). All motion is
// confined to the display the pet is on; the engine cancels a script on drag/rescue/char swap.
'use strict';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sign = (v) => (v < 0 ? -1 : 1);
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
// = the cat's walking speed in Engine.step (spd * 1.6)
const walkSpeed = (e) => e.baseSpeed * (e.settings.speed || 1) *
  (e.settings.personality === 'hyper' ? 1.5 : e.settings.personality === 'sleepy' ? 0.6 : 1) * 1.6;

// Minutes between special antics, driven by the Mischief slider (0..100): 100% ~1-2 min, 50% ~3-6, 25% (default) ~5-12, 0% ~20-30.
// The first one comes 30-60 s after startup / switching character.
const ANCHORS = [[0, 20, 30], [25, 5, 12], [50, 3, 6], [100, 1, 2]];
function anticRange(mis) {
  const m = clamp(Number.isFinite(+mis) ? +mis : 25, 0, 100);
  for (let i = 1; i < ANCHORS.length; i++) {
    const [m0, a0, b0] = ANCHORS[i - 1], [m1, a1, b1] = ANCHORS[i];
    if (m <= m1) { const k = (m - m0) / (m1 - m0); return [a0 + (a1 - a0) * k, b0 + (b1 - b0) * k]; }
  }
  return [ANCHORS[3][1], ANCHORS[3][2]];
}
const INTERVALS = { cat: anticRange(25), hero: anticRange(25) };   // kept for callers that only want the default range
function nextAnticDelay(charId, R = Math.random, mis = 25) {
  const [a, b] = anticRange(mis);
  return Math.round((a + R() * (b - a)) * 60000);
}
const FIRST_MS = [30000, 60000];
// Planner: one random roll `u` per cycle, so a settings change recomputes from the time since the last antic
// (an already-due antic is never pushed back) instead of re-arming a full interval.
function createAnticPlanner(R = Math.random) {
  let base = 0, first = true, u = R(), f = R();
  return {
    reset(now) { base = now; first = true; u = R(); f = R(); },
    fired(now) { base = now; first = false; u = R(); },
    delay(now, mis) {
      const since = Math.max(0, now - base);
      const total = first ? FIRST_MS[0] + f * (FIRST_MS[1] - FIRST_MS[0]) : (() => { const [a, b] = anticRange(mis); return (a + u * (b - a)) * 60000; })();
      return Math.max(2000, Math.round(total - since));
    },
    isFirst: () => first,
  };
}

const ev = (e, type, data) => { if (e.hooks && e.hooks.event) e.hooks.event(type, data); };
const toy = (e, c) => { if (e.hooks && e.hooks.toy) e.hooks.toy(c); };

// ---------------------------------------------------------------- cat: butterfly chase
// alert/wiggle -> run after it (2.3x walk speed, walk cycle) -> pounce, near miss -> it flutters
// off the top -> happy -> sit.
function chase(R = Math.random) {
  let D, S, ws, toySize, ph, tx, ty, dir, turnT, spd, baseOff, t, phase, pt, fromX, fromY, aimX, exitX;
  const groundTop = (e) => e.floorAt(e.pos.x);
  const setPhase = (p, e, st) => { phase = p; pt = 0; e.setState(st, 1e9); };
  const moveToy = (e, dt) => {
    turnT -= dt;
    if (turnT <= 0) { if (R() < 0.4) dir = -dir; turnT = 0.7 + R() * 1.3; spd = ws * (0.55 + R() * 0.55); }
    tx += dir * spd * dt;
    const m = toySize;
    if (tx < D.x0 + m) { tx = D.x0 + m; dir = 1; } else if (tx > D.x1 - m) { tx = D.x1 - m; dir = -1; }
    const base = groundTop(e) + S * 0.5 - baseOff;
    ty = clamp(base + Math.sin(t * 7 + ph) * S * 0.28 + Math.sin(t * 2.3 + ph * 2) * S * 0.16, D.y0 + toySize * 0.6, D.y1 - toySize);
  };
  const sendToy = (e) => toy(e, { type: 'move', x: tx, y: ty, dir });
  return {
    name: 'chase', maxMs: 30000,
    init(e) {
      D = e.currentDisplay(); S = e.size; ws = walkSpeed(e); toySize = clamp(Math.round(S * 0.7), 48, 90);   // >= 48: Windows enforces a minimum window size
      t = 0; ph = R() * 6.28; baseOff = S * (0.75 + R() * 0.35); turnT = 1; spd = ws * 0.8;
      const cx = e.pos.x + S / 2, room = D.x1 - D.x0;
      dir = (cx - D.x0) < (D.x1 - cx) ? 1 : -1;               // towards the side with more room
      tx = clamp(cx + dir * room * (0.30 + R() * 0.2), D.x0 + toySize, D.x1 - toySize);
      ty = groundTop(e) + S * 0.5 - baseOff;
      e.facing = dir; setPhase('alert', e, 'alert');
      toy(e, { type: 'spawn', x: tx, y: ty, size: toySize, dir });
      ev(e, 'wiggle');
    },
    update(e, dt) {
      t += dt; pt += dt;
      if (phase !== 'pounce') e.pos.y = groundTop(e);
      if (phase === 'alert') {
        moveToy(e, dt); e.facing = sign(tx - (e.pos.x + S / 2)); sendToy(e);
        if (pt > 1.0) setPhase('run', e, 'run');
      } else if (phase === 'run') {
        moveToy(e, dt);
        const dx = tx - (e.pos.x + S / 2); e.facing = sign(dx);
        e.pos.x = clamp(e.pos.x + sign(dx) * Math.min(Math.abs(dx), ws * 2.3 * dt), D.x0, D.x1 - S);
        sendToy(e);
        if ((Math.abs(dx) < S * 0.75 && pt > 0.8) || pt > 9) {
          setPhase('pounce', e, 'pounce'); fromX = e.pos.x; fromY = groundTop(e); aimX = clamp(tx - S / 2, D.x0, D.x1 - S);
          ev(e, 'jump');
        }
      } else if (phase === 'pounce') {
        const T = 0.55, k = clamp(pt / T, 0, 1);
        e.pos.x = fromX + (aimX - fromX) * ease(k); e.pos.y = fromY - 4 * (S * 0.85) * k * (1 - k);
        turnT = 99; moveToy(e, dt);
        if (k > 0.45) { dir = -sign(tx - (fromX + S / 2)); spd = ws * 2.6; baseOff += S * 2.2 * dt; }   // darts away: a near miss
        sendToy(e);
        if (k >= 1) {
          e.pos.y = groundTop(e); ev(e, 'land', { vy: 520 });
          exitX = dir > 0 ? D.x1 + toySize : D.x0 - toySize; fromX = tx; fromY = ty; setPhase('watch', e, 'alert');
        }
      } else if (phase === 'watch') {                       // it flutters up and away; the cat watches it go
        const k = clamp(pt / 2.2, 0, 1);
        const x = fromX + (exitX - fromX) * ease(k) * 0.9;
        const y = fromY + (D.y0 - toySize * 1.5 - fromY) * ease(k) + Math.sin(pt * 9) * S * 0.12;
        toy(e, { type: 'move', x: clamp(x, D.x0 - toySize, D.x1 + toySize), y, dir });
        if (k > 0.8) toy(e, { type: 'fade', a: clamp(1 - (k - 0.8) / 0.2, 0, 1) });
        e.facing = sign(x - (e.pos.x + S / 2));
        if (pt > 2.3) { toy(e, { type: 'end' }); setPhase('happy', e, 'happy'); ev(e, 'happy'); }
      } else if (phase === 'happy') {
        if (pt > 1.8) setPhase('sit', e, 'sit');
      } else if (phase === 'sit') {
        if (pt > 1.8) return true;
      }
      e.pos.x = clamp(e.pos.x, D.x0, D.x1 - S);
      return false;
    },
  };
}

// ---------------------------------------------------------------- hero stunts
// (a) Hero landing: leaps off the top of the screen, re-enters, crash-lands (dust + squash).
function heroLanding(R = Math.random) {
  let D, S, phase, pt, v;
  const go = (p, e, s) => { phase = p; pt = 0; e.setState(s, 1e9); };
  return {
    name: 'landing', maxMs: 12000,
    init(e) { D = e.currentDisplay(); S = e.size; v = 0; go('crouch', e, 'crouch'); ev(e, 'squash', { a: 0.5 }); },
    update(e, dt) {
      pt += dt;
      if (phase === 'crouch') { if (pt > 0.4) { go('launch', e, 'fly'); v = 300; ev(e, 'launch'); } }
      else if (phase === 'launch') { v += 6000 * dt; e.pos.y -= v * dt; if (e.pos.y < D.y0 - S * 1.4) go('away', e, 'fly'); }
      else if (phase === 'away') {
        if (pt > 0.9) {
          e.pos.x = D.x0 + (D.x1 - D.x0 - S) * (0.15 + R() * 0.7); e.facing = R() < 0.5 ? -1 : 1;
          e.pos.y = D.y0 - S * 1.4; v = 0; go('dive', e, 'dive');
        }
      } else if (phase === 'dive') {
        v += 5200 * dt; e.pos.y += v * dt;
        const g = e.floorAt(e.pos.x);
        if (e.pos.y >= g) { e.pos.y = g; go('land', e, 'land'); ev(e, 'land', { vy: 1400 }); ev(e, 'dust'); }
      } else if (phase === 'land') {
        e.pos.y = e.floorAt(e.pos.x);
        if (pt > 1.0) { go('flex', e, 'flex'); ev(e, 'sparkle', { n: 6 }); }
      } else if (phase === 'flex') { e.pos.y = e.floorAt(e.pos.x); if (pt > 0.9) return true; }
      e.pos.x = clamp(e.pos.x, D.x0, D.x1 - S);
      return false;
    },
  };
}

// (b) Patrol: takes off and flies across the display with a cape trail, lands on the far side.
function heroPatrol() {
  let D, S, phase, pt, dir, y0, cruiseY, xEnd, x0, t = 0, yDesc, ws;
  const go = (p, e, s) => { phase = p; pt = 0; e.setState(s, 1e9); };
  return {
    name: 'patrol', maxMs: 14000,
    init(e) {
      D = e.currentDisplay(); S = e.size; ws = walkSpeed(e);
      const cx = e.pos.x + S / 2; dir = (cx - D.x0) < (D.x1 - cx) ? 1 : -1; e.facing = dir;
      y0 = e.floorAt(e.pos.x); cruiseY = Math.max(D.y0 + 6, y0 - (D.y1 - D.y0) * 0.42);
      xEnd = dir > 0 ? D.x1 - S - 8 : D.x0 + 8;
      go('crouch', e, 'crouch'); ev(e, 'squash', { a: 0.4 });
    },
    update(e, dt) {
      pt += dt; t += dt;
      if (phase === 'crouch') { if (pt > 0.3) { go('rise', e, 'fly'); x0 = e.pos.x; ev(e, 'launch'); } }
      else if (phase === 'rise') {
        const k = clamp(pt / 0.6, 0, 1);
        e.pos.y = y0 + (cruiseY - y0) * ease(k); e.pos.x = x0 + dir * S * 0.4 * ease(k);
        if (k >= 1) go('cruise', e, 'fly');
      } else if (phase === 'cruise') {
        e.pos.x += dir * Math.max(420, ws * 3.2) * dt; e.pos.y = cruiseY + Math.sin(t * 5) * S * 0.1; e.facing = dir;
        if ((dir > 0 && e.pos.x >= xEnd) || (dir < 0 && e.pos.x <= xEnd)) { e.pos.x = xEnd; yDesc = e.pos.y; go('descend', e, 'fly'); }
      } else if (phase === 'descend') {
        const k = clamp(pt / 0.7, 0, 1), g = e.floorAt(e.pos.x);
        e.pos.y = yDesc + (g - yDesc) * k * k; e.pos.x += dir * 90 * (1 - k) * dt;
        if (k >= 1) { e.pos.y = g; go('land', e, 'land'); ev(e, 'land', { vy: 700 }); ev(e, 'dust'); }
      } else if (phase === 'land') { e.pos.y = e.floorAt(e.pos.x); if (pt > 0.6) return true; }
      e.pos.x = clamp(e.pos.x, D.x0, D.x1 - S);
      return false;
    },
  };
}

// (c) Power up: flexes, arcade sparkle, floating "+1 INT!".
function heroPowerUp() {
  let pt = 0, nextPulse = 0, second = false;
  return {
    name: 'powerup', maxMs: 6000,
    init(e) { e.setState('flex', 1e9); ev(e, 'sparkle', { n: 14 }); ev(e, 'popup', { text: '+1 INT!' }); },
    update(e, dt) {
      pt += dt; nextPulse -= dt;
      if (nextPulse <= 0) { nextPulse = 0.45; ev(e, 'pulse'); }
      if (!second && pt > 1.1) { second = true; ev(e, 'sparkle', { n: 8 }); }
      return pt > 2.6;
    },
  };
}

// ---------------------------------------------------------------- blob: wall scale
// Slides to the nearest side wall, scrambles up it, hangs there wobbling, lets go and drops with a splat.
function blobWallScale() {
  let D, S, phase, pt, edge, y0, topY, vy, t = 0;
  const go = (p, e, st) => { phase = p; pt = 0; e.setState(st, 1e9); };
  return {
    name: 'wallscale', maxMs: 24000,
    init(e) {
      D = e.currentDisplay(); S = e.size; y0 = e.floorAt(e.pos.x); vy = 0;
      const cx = e.pos.x + S / 2; edge = (cx - D.x0) < (D.x1 - cx) ? D.x0 : D.x1 - S;
      topY = Math.max(D.y0 + 8, y0 - (y0 - D.y0) * 0.6);
      e.facing = edge === D.x0 ? -1 : 1; go('run', e, 'walk'); ev(e, 'wiggle');
    },
    update(e, dt) {
      pt += dt; t += dt;
      if (phase === 'run') {
        const dx = edge - e.pos.x, sp = Math.max(260, e.baseSpeed * (e.settings.speed || 1) * 3.2);
        e.pos.y = y0 - Math.abs(Math.sin(t * 9)) * S * 0.12;
        e.pos.x += sign(dx) * Math.min(Math.abs(dx), sp * dt); e.facing = sign(dx);
        if (Math.abs(dx) < 2) { e.pos.x = edge; e.pos.y = y0; e.facing = edge === D.x0 ? 1 : -1; go('climb', e, 'climb'); }
      } else if (phase === 'climb') {
        e.pos.y -= Math.max(190, e.baseSpeed * (e.settings.speed || 1) * 2.6) * dt;
        if (e.pos.y <= topY) { e.pos.y = topY; go('hang', e, 'climb'); ev(e, 'squash', { a: 0.85 }); }
      } else if (phase === 'hang') {
        e.pos.y = topY + Math.sin(pt * 6) * S * 0.04;
        if (pt > 1.4) { go('drop', e, 'fall'); vy = 0; ev(e, 'say', { kind: 'idle' }); }
      } else if (phase === 'drop') {
        vy += 2300 * dt; e.pos.y += vy * dt;
        const g = e.floorAt(e.pos.x);
        if (e.pos.y >= g) { e.pos.y = g; go('splat', e, 'idle'); ev(e, 'land', { vy: 1300 }); ev(e, 'squash', { a: 0.55 }); ev(e, 'dust'); }
      } else if (phase === 'splat') {
        e.pos.y = e.floorAt(e.pos.x); if (pt > 1.1) { go('happy', e, 'happy'); ev(e, 'happy'); }
      } else if (phase === 'happy') { e.pos.y = e.floorAt(e.pos.x); if (pt > 1.0) return true; }
      e.pos.x = clamp(e.pos.x, D.x0, D.x1 - S);
      return false;
    },
  };
}

// ---------------------------------------------------------------- blob: bounce spree
// Six increasingly huge bounces across the screen with a squash on every landing and a sparkle finale.
function blobSpree() {
  let D, S, n, pt, dir, x0, tx, H, T, phase, y0;
  const BOUNCES = 6;
  const launch = (e) => {
    H = S * (0.9 + 0.38 * n); T = 0.5 + 0.07 * n; x0 = e.pos.x;
    if (dir > 0 && x0 >= D.x1 - S - S * 0.5) dir = -1; else if (dir < 0 && x0 <= D.x0 + S * 0.5) dir = 1;
    tx = clamp(x0 + dir * S * (1.2 + 0.3 * n), D.x0, D.x1 - S);
    pt = 0; ev(e, 'hop');
  };
  return {
    name: 'spree', maxMs: 16000,
    init(e) {
      D = e.currentDisplay(); S = e.size; n = 0; phase = 'air'; const cx = e.pos.x + S / 2; dir = (cx - D.x0) < (D.x1 - cx) ? 1 : -1; e.facing = dir;
      y0 = e.floorAt(e.pos.x); e.setState('fall', 1e9); ev(e, 'squash', { a: 0.6 }); launch(e);
    },
    update(e, dt) {
      pt += dt;
      if (phase === 'air') {
        const k = clamp(pt / T, 0, 1); e.pos.x = x0 + (tx - x0) * k; y0 = e.floorAt(e.pos.x); e.pos.y = y0 - 4 * H * k * (1 - k); e.facing = sign(tx - x0 || dir);
        if (k >= 1) {
          e.pos.y = y0; ev(e, 'land', { vy: 700 + 150 * n }); ev(e, 'squash', { a: 0.6 }); n++;
          if (n >= BOUNCES) { phase = 'end'; pt = 0; e.setState('happy', 1e9); ev(e, 'sparkle', { n: 12 }); ev(e, 'happy'); }
          else { phase = 'crouch'; pt = 0; e.setState('idle', 1e9); }
        }
      } else if (phase === 'crouch') {
        e.pos.y = e.floorAt(e.pos.x);
        if (pt > 0.12) { e.setState('fall', 1e9); phase = 'air'; launch(e); }
      } else if (pt > 1.3) return true;
      e.pos.x = clamp(e.pos.x, D.x0, D.x1 - S);
      return false;
    },
  };
}

// ---------------------------------------------------------------- ghost: wall-phase dash
// Zips to the nearest side, flickers into the wall, then streaks all the way across to the other side and fades back in.
function ghostWallPhase() {
  let D, S, phase, pt, dir, x0, y, xA, xB, t = 0, p2 = false;
  const go = (p) => { phase = p; pt = 0; };
  return {
    name: 'wallphase', maxMs: 12000, allowAir: true,
    init(e) {
      D = e.currentDisplay(); S = e.size; y = clamp(e.pos.y, D.y0 + 8, D.y1 - S - 8); x0 = e.pos.x;
      const cx = x0 + S / 2; dir = (cx - D.x0) < (D.x1 - cx) ? -1 : 1;   // towards the nearer wall
      xA = dir < 0 ? D.x0 : D.x1 - S; xB = dir < 0 ? D.x1 - S : D.x0;
      e.facing = dir; e.setState('idle', 1e9); go('dash1'); ev(e, 'wiggle');
    },
    update(e, dt) {
      pt += dt; t += dt;
      if (phase === 'dash1') {
        const k = clamp(pt / 0.6, 0, 1); e.pos.x = x0 + (xA - x0) * ease(k); e.pos.y = y + Math.sin(t * 8) * S * 0.05;
        if (k >= 1) { go('flicker'); ev(e, 'phase'); }
      } else if (phase === 'flicker') {
        e.pos.x = xA; e.pos.y = y; if (pt > 0.5 && !p2) { p2 = true; ev(e, 'phase'); }
        if (pt > 1.0) { go('dash2'); e.facing = -dir; }
      } else if (phase === 'dash2') {
        const k = clamp(pt / 0.9, 0, 1); e.pos.x = xA + (xB - xA) * ease(k); e.pos.y = y + Math.sin(t * 10) * S * 0.06;
        if (k >= 1) { go('settle'); ev(e, 'phase'); ev(e, 'sparkle', { n: 8 }); }
      } else if (phase === 'settle') { e.pos.x = xB; if (pt > 1.0) return true; }
      e.pos.x = clamp(e.pos.x, D.x0, D.x1 - S); e.pos.y = clamp(e.pos.y, D.y0, D.y1 - S);
      return false;
    },
  };
}

// ---------------------------------------------------------------- ghost: spooky swoop loop
// Rises to the upper part of the screen, swirls round one and a half spooky loops, then glides back down.
function ghostSwoop() {
  let D, S, phase, pt, x0, y0, cx, cy, r, a0;
  const go = (p) => { phase = p; pt = 0; };
  const onCircle = (a) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.7 });
  return {
    name: 'swoop', maxMs: 12000, allowAir: true,
    init(e) {
      D = e.currentDisplay(); S = e.size; x0 = e.pos.x; y0 = e.pos.y;
      r = clamp(Math.min(D.x1 - D.x0, D.y1 - D.y0) * 0.22, S * 0.6, S * 2.4);
      cx = clamp(x0 + S / 2, D.x0 + r + S / 2, D.x1 - r - S / 2); cy = clamp(D.y0 + (D.y1 - D.y0) * 0.35, D.y0 + r * 0.7 + S / 2, D.y1 - r * 0.7 - S / 2);
      a0 = Math.PI / 2;   // start at the bottom of the loop
      e.setState('idle', 1e9); go('rise'); ev(e, 'phase');
    },
    update(e, dt) {
      pt += dt;
      if (phase === 'rise') {
        const k = clamp(pt / 0.8, 0, 1), p = onCircle(a0);
        e.pos.x = x0 + (p.x - S / 2 - x0) * ease(k); e.pos.y = y0 + (p.y - S / 2 - y0) * ease(k);
        if (k >= 1) go('loop');
      } else if (phase === 'loop') {
        const k = clamp(pt / 2.8, 0, 1), a = a0 - k * Math.PI * 3, p = onCircle(a);   // 1.5 turns
        e.pos.x = p.x - S / 2; e.pos.y = p.y - S / 2; e.facing = sign(-Math.sin(a) || 1);
        if (k >= 1) { go('home'); x0 = e.pos.x; y0 = e.pos.y; ev(e, 'wiggle'); }
      } else if (phase === 'home') {
        const k = clamp(pt / 0.9, 0, 1), tx = cx - S / 2, ty = D.y0 + (D.y1 - D.y0) * 0.5;
        e.pos.x = x0 + (tx - x0) * ease(k); e.pos.y = y0 + (ty - y0) * ease(k);
        if (k >= 1) { go('end'); ev(e, 'phase'); }
      } else if (pt > 0.6) return true;
      e.pos.x = clamp(e.pos.x, D.x0, D.x1 - S); e.pos.y = clamp(e.pos.y, D.y0, D.y1 - S);
      return false;
    },
  };
}

const ANTICS = { cat: { chase }, hero: { landing: heroLanding, patrol: heroPatrol, powerup: heroPowerUp },
  blob: { wallscale: blobWallScale, spree: blobSpree }, ghost: { wallphase: ghostWallPhase, swoop: ghostSwoop } };
const ANTIC_NAMES = { cat: ['chase'], hero: ['landing', 'patrol', 'powerup'], blob: ['wallscale', 'spree'], ghost: ['wallphase', 'swoop'] };
// the hero flies a lot: patrol is the favourite
const ANTIC_WEIGHTS = { hero: { patrol: 0.55, landing: 0.28, powerup: 0.17 } };
// name optional (weighted random pick); returns null for characters with no antics
function makeScript(charId, name, R = Math.random) {
  const set = ANTICS[charId]; if (!set) return null;
  const keys = Object.keys(set); let pick = name && set[name] ? name : null;
  if (!pick) {
    const w = ANTIC_WEIGHTS[charId]; let r = R() * keys.reduce((a, k) => a + (w ? w[k] : 1), 0);
    pick = keys[keys.length - 1];
    for (const k of keys) { r -= (w ? w[k] : 1); if (r <= 0) { pick = k; break; } }
  }
  return set[pick](R);
}

module.exports = { nextAnticDelay, anticRange, createAnticPlanner, makeScript, chase, heroLanding, heroPatrol, heroPowerUp, blobWallScale, blobSpree, ghostWallPhase, ghostSwoop, INTERVALS, ANTIC_NAMES, walkSpeed };

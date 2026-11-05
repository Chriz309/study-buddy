// Scripted antics for the engine: the cat's butterfly chase and Captain Cram's three stunts.
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

// minutes between antics per character; the cat's chase is "now and then" (10-25 min)
const INTERVALS = { cat: [10, 25], hero: [6, 15] };
function nextAnticDelay(charId, R = Math.random) {
  const [a, b] = INTERVALS[charId] || INTERVALS.cat;
  return Math.round((a + R() * (b - a)) * 60000);
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

const ANTICS = { cat: { chase }, hero: { landing: heroLanding, patrol: heroPatrol, powerup: heroPowerUp } };
const ANTIC_NAMES = { cat: ['chase'], hero: ['landing', 'patrol', 'powerup'] };
// name optional (random pick); returns null for characters with no antics
function makeScript(charId, name, R = Math.random) {
  const set = ANTICS[charId]; if (!set) return null;
  const keys = Object.keys(set);
  return set[name && set[name] ? name : keys[Math.floor(R() * keys.length)]](R);
}

module.exports = { nextAnticDelay, makeScript, chase, heroLanding, heroPatrol, heroPowerUp, INTERVALS, ANTIC_NAMES, walkSpeed };

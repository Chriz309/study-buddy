/* Study Buddy motion engine.
   One Pet, driven by a small state machine + a weighted, non-repeating
   behaviour scheduler so it never feels looped. World geometry comes from
   the main process. A watchdog guarantees it can never freeze. */
(function () {
  const rnd  = (a, b) => a + Math.random() * (b - a);
  const irnd = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sign = (v) => (v < 0 ? -1 : 1);

  const Engine = {
    pet: null, hooks: {},
    size: 120, baseSpeed: 85, moveType: 'walk',
    pos: { x: 200, y: 200 }, vel: { x: 0, y: 0 }, facing: 1,
    state: 'idle', stateUntil: 0, nextDecision: 0, lastChange: 0, target: null,
    onFloor: false, dragging: false, recent: [], cursor: { x: 0, y: 0 },
    settings: { speed: 1, personality: 'chill', mischief: 25 },
    world: { x0: 0, y0: 0, x1: 1280, y1: 720, floors: [] },
    last: 0, blinkAt: 0, lookAt: 0, raf: 0, _wantClimb: false, _peeking: false,

    init(petEl, hooks) {
      this.pet = petEl; this.hooks = hooks || {};
      this.pos = { x: (this.world.x0 + this.world.x1) * 0.4, y: this.world.y0 + 60 };
      this.last = performance.now(); this.lastChange = this.last;
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
    },

    // payload: { size, displays:[{id,bounds,work}], primaryId }  opts:{ roamAll }
    setWorld(payload, opts) {
      const roamAll = opts && opts.roamAll;
      const ds = payload.displays || [];
      if (roamAll && ds.length) {
        this.world = { x0: 0, y0: 0, x1: payload.size.width, y1: payload.size.height,
          floors: ds.map(d => ({ x0: d.work.x, x1: d.work.x + d.work.width, y: d.work.y + d.work.height })) };
      } else {
        const p = ds.find(d => d.id === payload.primaryId) || ds[0] ||
                  { bounds: { x: 0, y: 0, width: payload.size.width, height: payload.size.height },
                    work: { x: 0, y: 0, width: payload.size.width, height: payload.size.height } };
        this.world = { x0: p.bounds.x, y0: p.bounds.y, x1: p.bounds.x + p.bounds.width, y1: p.bounds.y + p.bounds.height,
          floors: [{ x0: p.work.x, x1: p.work.x + p.work.width, y: p.work.y + p.work.height }] };
      }
      this.pos.x = clamp(this.pos.x, this.world.x0, this.world.x1 - this.size);
    },
    setMoveType(t) { this.moveType = t; this.target = null; this.onFloor = false; this._wantClimb = this._peeking = false; this.setState('idle', 400); },
    setSize(px) { this.size = px; },
    setSettings(s) { this.settings = Object.assign(this.settings, s); },
    setCursor(p) { this.cursor = p; },

    floorAt(x) {
      const cx = x + this.size / 2; let best = null;
      for (const f of this.world.floors) if (cx >= f.x0 && cx <= f.x1) best = best == null ? f.y : Math.max(best, f.y);
      if (best == null) best = this.world.y1;
      return best - this.size;
    },

    /* ----- drag / toss (user) ----- */
    grab() { this.dragging = true; this.setState('drag', 1e9); this.hooks.say && this.hooks.say('drag'); },
    dragTo(x, y) {
      const nx = clamp(x - this.size / 2, this.world.x0 - this.size * 0.3, this.world.x1 - this.size * 0.7);
      const ny = clamp(y - this.size / 2, this.world.y0 - this.size * 0.3, this.world.y1 - this.size * 0.3);
      this.vel.x = (nx - this.pos.x) * 12; this.vel.y = (ny - this.pos.y) * 12;
      this.pos.x = nx; this.pos.y = ny;
    },
    release() {
      this.dragging = false; this.onFloor = false;
      this.vel.x = clamp(this.vel.x, -1400, 1400); this.vel.y = clamp(this.vel.y, -1400, 1400);
      this.setState(this.moveType === 'walk' ? 'fall' : 'idle', 1e9);
    },

    petted() { this.flash('happy', 650); this.expr('smile', 900); this.hooks.say && this.hooks.say('pet'); this.hooks.hearts && this.hooks.hearts(); },
    nap()    { this.setState('sleep', rnd(6000, 14000)); this.hooks.say && this.hooks.say('sleep'); },
    talk(ms) { this.expr('talk', ms || 1400); },

    setState(s, dur) {
      this.state = s; this.stateUntil = performance.now() + (dur || 0); this.lastChange = performance.now();
      const p = this.pet; if (!p) return;
      p.classList.toggle('walking', s === 'walk');
      p.classList.toggle('sleeping', s === 'sleep');
      p.classList.toggle('dragging', s === 'drag');
      p.classList.toggle('swimming', s === 'swim' || s === 'leap');
      this.hooks.onState && this.hooks.onState(s);
    },
    flash(cls, dur) { const p = this.pet; if (!p) return; p.classList.add(cls); setTimeout(() => p && p.classList.remove(cls), dur || 400); },
    expr(cls, dur) { const sp = this.pet && this.pet.querySelector('.sprite'); if (!sp) return; sp.classList.add('e-' + cls); setTimeout(() => sp && sp.classList.remove('e-' + cls), dur || 600); },

    decide() {
      const now = performance.now();
      const per = this.settings.personality, mis = this.settings.mischief / 100;
      const w = { walk: 3, idle: 2.4, sit: 1.4, sleep: 0.8, jump: 1.0, climb: 0.8 * mis + .15, peek: 0.7 * mis + .1, say: 1.0, look: 1.6 };
      if (per === 'hyper')  { w.walk += 2; w.jump += 2; w.sleep = .2; w.sit = .4; }
      if (per === 'sleepy') { w.sleep += 2.5; w.sit += 2; w.walk -= 1.2; }
      if (per === 'naughty'){ w.climb += 1.3; w.peek += 1; w.jump += 1; }
      if (per === 'chill')  { w.idle += 1; w.sit += .6; }
      for (const k of this.recent) if (w[k] != null) w[k] *= 0.35;
      const keys = Object.keys(w); let sum = keys.reduce((a, k) => a + Math.max(0, w[k]), 0);
      let r = Math.random() * sum, chosen = 'idle';
      for (const k of keys) { r -= Math.max(0, w[k]); if (r <= 0) { chosen = k; break; } }
      this.recent.unshift(chosen); this.recent = this.recent.slice(0, 2);
      this.run(chosen);
      this.nextDecision = now + rnd(1500, 3800) / (per === 'hyper' ? 1.8 : per === 'sleepy' ? .7 : 1);
    },

    run(b) {
      const mid = this.size / 2, x0 = this.world.x0, x1 = this.world.x1;
      switch (b) {
        case 'walk':  this.target = rnd(x0 + mid, x1 - mid); this.setState('walk', 1e9); break;
        case 'idle':  this.setState('idle', rnd(1200, 3000)); break;
        case 'sit':   this.setState('sit', rnd(2500, 6000)); break;
        case 'sleep': this.nap(); break;
        case 'jump':  if (this.onFloor) { this.vel.y = -rnd(360, 520); this.onFloor = false; this.setState('fall', 1e9); this.expr('surprise', 500); } break;
        case 'climb': this.climbWall(); break;
        case 'peek':  this.peek(); break;
        case 'look':  this.lookAround(); this.setState('idle', rnd(900, 1600)); break;
        case 'say':   this.hooks.say && this.hooks.say(Math.random() < .4 ? 'study' : 'idle'); this.setState('idle', 1600); break;
      }
    },
    lookAround() { this.expr('look', rnd(700, 1300)); if (Math.random() < .5) { this.facing *= -1; setTimeout(() => { this.facing *= -1; }, rnd(500, 1000)); } },
    climbWall() { const toLeft = this.pos.x < (this.world.x0 + this.world.x1) / 2; this.climbEdge = toLeft ? this.world.x0 : this.world.x1 - this.size; this.target = this.climbEdge; this.setState('walk', 1e9); this._wantClimb = true; },
    peek() { const toLeft = Math.random() < .5; this.target = toLeft ? this.world.x0 - this.size * 0.35 : this.world.x1 - this.size * 0.65; this.setState('walk', 1e9); this._peeking = true; },

    loop(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      if (now > this.blinkAt && this.state !== 'sleep') {
        const sp = this.pet && this.pet.querySelector('.sprite');
        if (sp) { sp.classList.add('blink'); setTimeout(() => sp && sp.classList.remove('blink'), 120); }
        this.blinkAt = now + rnd(2200, 5200);
      }
      if (!this.dragging) this.step(dt, now);
      // watchdog: never allow a frozen pet
      if (!this.dragging && this.state !== 'sleep' && this.state !== 'drag' && now - this.lastChange > 7000) {
        this._wantClimb = this._peeking = false; this.target = null; this.decide();
      }
      this.render();
      this.raf = requestAnimationFrame(this.loop);
    },

    step(dt, now) {
      const spd = this.baseSpeed * (this.settings.speed || 1) *
                  (this.settings.personality === 'hyper' ? 1.5 : this.settings.personality === 'sleepy' ? .6 : 1);
      if (this.moveType === 'float') return this.stepDrift(dt, now, 0.55);
      if (this.moveType === 'fly')   return this.stepDrift(dt, now, 0.28);
      if (this.moveType === 'swim')  return this.stepSwim(dt, now, spd);
      return this.stepWalk(dt, now, spd);
    },

    stepWalk(dt, now, spd) {
      const x0 = this.world.x0, x1 = this.world.x1;
      const climbing = this._wantClimb && Math.abs(this.pos.x - (this.climbEdge ?? -1e9)) < 2;
      if (climbing) {
        this.pos.y -= spd * 1.1 * dt; this.facing = this.climbEdge === x0 ? 1 : -1;
        if (this.pos.y < this.world.y0 + rnd(10, 60)) { this._wantClimb = false; this.onFloor = false; this.vel.y = 0; this.setState('fall', 1e9); }
        return;
      }
      if (this.state === 'walk' && this.target != null) {
        const d = this.target - this.pos.x;
        if (Math.abs(d) < 4) {
          this.pos.x = this.target; this.target = null;
          if (this._peeking) { this._peeking = false; this.expr('look', 1400); this.setState('idle', rnd(900, 1800)); }
          else if (!this._wantClimb) this.setState('idle', rnd(400, 1200));
        } else { this.facing = sign(d); this.pos.x += this.facing * spd * dt; }
      }
      const fy = this.floorAt(this.pos.x);
      if (this.pos.y < fy || this.vel.y < 0) {
        this.vel.y += 2200 * dt; this.pos.y += this.vel.y * dt; this.onFloor = false;
        this.pos.x += this.vel.x * dt; this.vel.x *= (1 - dt * 1.6);
      }
      if (this.pos.y >= fy) {
        if (!this.onFloor && this.vel.y > 120) this.flash('land', 220);
        this.pos.y = fy; this.vel.y = 0; this.onFloor = true;
        if (this.state === 'fall') this.setState('idle', 400);
      }
      this.pos.x = clamp(this.pos.x, x0, x1 - this.size);
      if (now > this.nextDecision && this.onFloor && !this._wantClimb &&
          ['idle', 'sit', 'walk'].includes(this.state) && (this.state !== 'walk' || this.target == null)) this.decide();
      if (this.state === 'sleep' && now > this.stateUntil) this.setState('idle', 300);
    },

    // drifting creatures: band = fraction of height they prefer (0 top .. 1 bottom)
    stepDrift(dt, now, band) {
      const W0 = this.world.x0, W1 = this.world.x1, H0 = this.world.y0, H1 = this.world.y1;
      if (this.state === 'sleep') { if (now > this.stateUntil) this.setState('idle', 300); }
      else {
        if (!this.target) this.target = { x: rnd(W0 + 40, W1 - 40), y: rnd(H0 + (H1 - H0) * (band - .25), H0 + (H1 - H0) * (band + .2)) };
        const tx = this.target.x - this.size / 2, ty = this.target.y - this.size / 2;
        const ease = this.moveType === 'fly' ? 1.8 : 1.2;
        this.pos.x += (tx - this.pos.x) * Math.min(1, dt * ease);
        this.pos.y += (ty - this.pos.y) * Math.min(1, dt * ease);
        this.facing = sign((tx - this.pos.x) || this.facing);
        if (Math.abs(tx - this.pos.x) < 6 && Math.abs(ty - this.pos.y) < 6) this.target = null;
      }
      this.pos.x = clamp(this.pos.x, W0, W1 - this.size);
      this.pos.y = clamp(this.pos.y, H0, H1 - this.size);
      if (now > this.nextDecision) {
        if (Math.random() < .2) this.nap();
        else { this.target = null; if (Math.random() < .45) this.hooks.say && this.hooks.say('idle'); }
        this.setState('idle', 0);
        this.nextDecision = now + rnd(2400, 4800) / (this.moveType === 'fly' ? 1.4 : 1);
      }
    },

    // dolphin: lurks just below the work area, surfaces in parabolic arcs
    stepSwim(dt, now, spd) {
      const W0 = this.world.x0, W1 = this.world.x1;
      const sea = this.floorAt(this.pos.x) + this.size * 0.78; // mostly hidden, fin showing
      if (this.state === 'leap') {
        this.vel.y += 1700 * dt; this.pos.y += this.vel.y * dt; this.pos.x += this.vel.x * dt;
        this.facing = sign(this.vel.x || this.facing);
        if (this.pos.y >= sea && this.vel.y > 0) { this.pos.y = sea; this.setState('swim', 1e9); this.hooks.splash && this.hooks.splash(this.pos.x + this.size/2, this.floorAt(this.pos.x) + this.size*0.9); }
      } else {
        // lurk: drift slowly along the sea line
        if (this.target == null) this.target = rnd(W0 + 40, W1 - 40);
        const d = this.target - this.pos.x;
        if (Math.abs(d) < 6) this.target = null; else { this.facing = sign(d); this.pos.x += this.facing * spd * 0.5 * dt; }
        this.pos.y += (sea - this.pos.y) * Math.min(1, dt * 4);
        if (now > this.nextDecision) {
          if (Math.random() < .6) { // leap!
            this.vel.y = -rnd(520, 820); this.vel.x = (Math.random() < .5 ? -1 : 1) * rnd(60, 180);
            this.setState('leap', 1e9); this.hooks.say && Math.random() < .3 && this.hooks.say('idle');
          } else this.setState('swim', 1e9);
          this.nextDecision = now + rnd(2200, 4200);
        }
      }
      this.pos.x = clamp(this.pos.x, W0, W1 - this.size);
    },

    render() {
      const p = this.pet; if (!p) return;
      p.style.left = this.pos.x + 'px'; p.style.top = this.pos.y + 'px';
      p.style.setProperty('--dir', String(this.facing));
    },

    hitTest(x, y) {
      const pad = 10;
      return x >= this.pos.x - pad && x <= this.pos.x + this.size + pad &&
             y >= this.pos.y - pad && y <= this.pos.y + this.size + pad;
    },
  };

  window.Engine = Engine;
})();

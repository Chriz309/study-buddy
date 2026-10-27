/* Animated vector face that rides on top of the jelly body.
   Eyes blink, glance around and change shape; the mouth morphs between
   expressions and can "talk". The whole face is transformed each frame to
   follow the body's squash/stretch so it feels like one creature. */
(function (global) {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const el = (n, a) => { const e = document.createElementNS(SVGNS, n); for (const k in (a||{})) e.setAttribute(k, a[k]); return e; };

  // face-local layout (100x100), eyes a touch above centre
  const EYE = { lx: 39, rx: 61, y: 49, rxw: 7.2, ryh: 9.2 };
  const MOUTHS = {
    smile:    'M43 62 Q50 69 57 62',
    grin:     'M42 61 Q50 72 58 61 Q50 66 42 61 Z',
    o:        '', // drawn as ellipse instead
    small:    'M46 64 Q50 67 54 64',
    flat:     'M45 64 L55 64',
    sleepy:   'M46 65 Q50 68 54 65',
  };

  class Face {
    constructor(svg) {
      this.svg = svg; svg.setAttribute('viewBox', '0 0 100 100');
      this.look = { x: 0, y: 0 }; this.lookTarget = { x: 0, y: 0 };
      this.blinkT = 0; this.nextBlink = 1 + Math.random()*3;
      this.expr = 'neutral'; this.t = 0; this.talkUntil = 0;
      this._build();
    }
    _build() {
      const mk = (cx) => {
        const g = el('g');
        const ball = el('ellipse', { cx, cy: EYE.y, rx: EYE.rxw, ry: EYE.ryh, fill: '#1b2338' });
        const hi  = el('circle', { cx: cx-2.4, cy: EYE.y-3.2, r: 2.6, fill: '#fff' });
        const hi2 = el('circle', { cx: cx+2.2, cy: EYE.y+2.6, r: 1.25, fill: '#fff', 'fill-opacity': .7 });
        const arc = el('path', { d: `M${cx-6} ${EYE.y+1} Q${cx} ${EYE.y-6} ${cx+6} ${EYE.y+1}`,
          fill: 'none', stroke: '#1b2338', 'stroke-width': 3.2, 'stroke-linecap': 'round', visibility: 'hidden' });
        g.appendChild(ball); g.appendChild(hi); g.appendChild(hi2); g.appendChild(arc);
        g.ball = ball; g.hi = hi; g.hi2 = hi2; g.arc = arc; g.cx = cx;
        return g;
      };
      this.eL = mk(EYE.lx); this.eR = mk(EYE.rx);
      this.pupils = el('g'); this.pupils.appendChild(this.eL); this.pupils.appendChild(this.eR);
      this.mouth = el('path', { d: MOUTHS.smile, fill: 'none', stroke: '#1b2338', 'stroke-width': 2.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      this.mouthO = el('ellipse', { cx: 50, cy: 65, rx: 3.6, ry: 4.4, fill: '#1b2338', visibility: 'hidden' });
      this.svg.appendChild(this.pupils); this.svg.appendChild(this.mouth); this.svg.appendChild(this.mouthO);
    }
    setExpr(name) {
      this.expr = name;
      const happy = name === 'happy', surprised = name === 'surprised', sleepy = name === 'sleepy';
      for (const g of [this.eL, this.eR]) {
        const arcEyes = happy;
        g.ball.setAttribute('visibility', arcEyes ? 'hidden' : 'visible');
        g.hi.setAttribute('visibility', arcEyes ? 'hidden' : 'visible');
        g.hi2.setAttribute('visibility', arcEyes ? 'hidden' : 'visible');
        g.arc.setAttribute('visibility', arcEyes ? 'visible' : 'hidden');
      }
      this._eyeScaleBase = surprised ? 1.22 : sleepy ? 0.42 : 1;
      this.mouthO.setAttribute('visibility', surprised ? 'visible' : 'hidden');
      if (!surprised) this.mouth.setAttribute('d', happy ? MOUTHS.grin : sleepy ? MOUTHS.sleepy : MOUTHS.smile);
      this.mouth.setAttribute('fill', happy ? '#1b2338' : 'none');
      this.mouth.setAttribute('visibility', surprised ? 'hidden' : 'visible');
    }
    blink() { this.blinkT = 0.16; }
    glance() { const a = [-1,0,1][Math.floor(Math.random()*3)], b = [-.6,0,.4][Math.floor(Math.random()*3)];
      this.lookTarget = { x: a*2.6, y: b*2.0 }; this._glanceBack = this.t + 0.6 + Math.random()*1.2; }
    talk(sec) { this.talkUntil = this.t + (sec||1.2); }

    // idle brain: autonomous blinks / glances when nothing else is driving
    idle(dt) {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) { this.blink(); if (Math.random()<.25) setTimeout(()=>this.blink(),160); this.nextBlink = 1.6 + Math.random()*3.6; }
      if (this._glanceBack && this.t > this._glanceBack) { this.lookTarget = {x:0,y:0}; this._glanceBack = 0; }
      if (!this._glanceBack && Math.random() < dt*0.25) this.glance();
    }

    step(dt) {
      this.t += dt;
      // ease look
      this.look.x += (this.lookTarget.x - this.look.x) * Math.min(1, dt*8);
      this.look.y += (this.lookTarget.y - this.look.y) * Math.min(1, dt*8);
      this.pupils.setAttribute('transform', `translate(${this.look.x} ${this.look.y})`);
      // blink
      let sy = this._eyeScaleBase || 1;
      if (this.blinkT > 0) { this.blinkT -= dt; const p = Math.max(0, this.blinkT/0.16); sy *= (0.08 + 0.92*(1-Math.sin(p*Math.PI))); }
      for (const g of [this.eL, this.eR]) g.setAttribute('transform', `translate(${g.cx} ${EYE.y}) scale(1 ${sy}) translate(${-g.cx} ${-EYE.y})`);
      // talk: wobble the mouth open/closed
      if (this.t < this.talkUntil && this.expr !== 'surprised') {
        const open = 1 + Math.sin(this.t*26)*0.5;
        this.mouth.setAttribute('d', open>1.2 ? MOUTHS.grin : MOUTHS.small);
        this.mouth.setAttribute('fill', open>1.2 ? '#1b2338' : 'none');
      }
    }
    // track the body's current bounding box (squash/stretch + position).
    // rest = { w, h, faceW, faceH, cssScale } ; coords are in canvas device px,
    // cssScale converts device px -> css px for the overlay transform.
    follow(b, rest) {
      const s = rest.cssScale || 1;
      const fx = ((b.minx+b.maxx)/2) * s;
      const fy = (b.miny + (b.maxy-b.miny)*0.52) * s;
      const sx = (b.maxx-b.minx)/rest.w, sy = (b.maxy-b.miny)/rest.h;
      const left = fx - 0.5*rest.faceW*sx;
      const top  = fy - 0.49*rest.faceH*sy;
      this.svg.style.transformOrigin = '0 0';
      this.svg.style.transform = `translate(${left}px, ${top}px) scale(${sx}, ${sy})`;
    }
  }
  global.Face = Face;
})(window);

/* Animated parts overlay that rides on top of the jelly body: eyes, mouth and
   two little feet. The whole 100x100 layer is mapped onto the body's current
   (squashing) bounds so everything deforms with it. Feet step while walking;
   the face hides when the blob turns its back (climbing). */
(function (global) {
  const SVGNS='http://www.w3.org/2000/svg';
  const el=(n,a)=>{const e=document.createElementNS(SVGNS,n);for(const k in(a||{}))e.setAttribute(k,a[k]);return e;};
  const EYE={lx:40,rx:60,y:45,rxw:7.4,ryh:9.4};
  const FOOT={ lx:40, rx:60, rxw:7.2, ryh:8.2, base:95 };  // nubs hanging under the body, spaced + a bit bigger
  const M={ smile:'M43 57 Q50 64 57 57', grin:'M42 56 Q50 67 58 56 Q50 61 42 56 Z',
    small:'M46 59 Q50 62 54 59', sleepy:'M46 60 Q50 63 54 60' };

  class Face {
    constructor(svg){ this.svg=svg; svg.setAttribute('viewBox','0 0 100 100');
      this.look={x:0,y:0}; this.lookTarget={x:0,y:0}; this.blinkT=0; this.nextBlink=1+Math.random()*3;
      this.expr='neutral'; this.t=0; this.talkUntil=0; this.walking=false; this.back=false; this.phase=0;
      this.restWdev=200; this.restHdev=220; this.cssScale=1; this._build(); }
    _build(){
      // feet first (behind body visually is impossible on overlay, so draw subtle)
      this.feet=el('g');
      this.footL=el('ellipse',{cx:FOOT.lx,cy:FOOT.base,rx:FOOT.rxw,ry:FOOT.ryh,fill:'#3fa0ea',stroke:'#1d3b5e','stroke-width':2.6});
      this.footR=el('ellipse',{cx:FOOT.rx,cy:FOOT.base,rx:FOOT.rxw,ry:FOOT.ryh,fill:'#3fa0ea',stroke:'#1d3b5e','stroke-width':2.6});
      this.feet.appendChild(this.footL); this.feet.appendChild(this.footR); this.feet.style.display='none'; // feet only while climbing
      const mk=(cx)=>{ const g=el('g');
        const ball=el('ellipse',{cx,cy:EYE.y,rx:EYE.rxw,ry:EYE.ryh,fill:'#1b2338'});
        const hi=el('circle',{cx:cx-2.4,cy:EYE.y-3.3,r:2.7,fill:'#fff'});
        const hi2=el('circle',{cx:cx+2.2,cy:EYE.y+2.8,r:1.3,fill:'#fff','fill-opacity':.7});
        const arc=el('path',{d:`M${cx-6} ${EYE.y+1} Q${cx} ${EYE.y-6} ${cx+6} ${EYE.y+1}`,fill:'none',stroke:'#1b2338','stroke-width':3.3,'stroke-linecap':'round',visibility:'hidden'});
        g.appendChild(ball);g.appendChild(hi);g.appendChild(hi2);g.appendChild(arc); g.ball=ball;g.hi=hi;g.hi2=hi2;g.arc=arc;g.cx=cx; return g; };
      this.eL=mk(EYE.lx); this.eR=mk(EYE.rx);
      this.faceG=el('g');
      this.chL=el('ellipse',{cx:30,cy:60,rx:6.6,ry:4.6,fill:'#ff8fb0','fill-opacity':.6});
      this.chR=el('ellipse',{cx:70,cy:60,rx:6.6,ry:4.6,fill:'#ff8fb0','fill-opacity':.6});
      this.faceG.appendChild(this.chL); this.faceG.appendChild(this.chR);
      this.pupils=el('g'); this.pupils.appendChild(this.eL); this.pupils.appendChild(this.eR);
      this.mouth=el('path',{d:M.smile,fill:'none',stroke:'#1b2338','stroke-width':2.9,'stroke-linecap':'round','stroke-linejoin':'round'});
      this.mouthO=el('ellipse',{cx:50,cy:58,rx:3.6,ry:4.4,fill:'#1b2338',visibility:'hidden'});
      this.faceG.appendChild(this.pupils); this.faceG.appendChild(this.mouth); this.faceG.appendChild(this.mouthO);
      this.svg.appendChild(this.feet); this.svg.appendChild(this.faceG);
    }
    setRest(wDev,hDev,cssScale){ this.restWdev=wDev; this.restHdev=hDev; this.cssScale=cssScale;
      this.svg.style.width=(wDev*cssScale)+'px'; this.svg.style.height=(hDev*cssScale)+'px'; this.svg.style.transformOrigin='0 0'; }
    setExpr(name){ this.expr=name; const happy=name==='happy',surprised=name==='surprised',sleepy=name==='sleepy';
      for(const g of[this.eL,this.eR]){ const arc=happy;
        g.ball.setAttribute('visibility',arc?'hidden':'visible'); g.hi.setAttribute('visibility',arc?'hidden':'visible');
        g.hi2.setAttribute('visibility',arc?'hidden':'visible'); g.arc.setAttribute('visibility',arc?'visible':'hidden'); }
      this._eyeScaleBase=surprised?1.22:sleepy?0.42:1;
      this.mouthO.setAttribute('visibility',surprised?'visible':'hidden');
      if(!surprised) this.mouth.setAttribute('d',happy?M.grin:sleepy?M.sleepy:M.smile);
      this.mouth.setAttribute('fill',happy?'#1b2338':'none'); this.mouth.setAttribute('visibility',surprised?'hidden':'visible'); }
    blink(){ this.blinkT=0.16; }
    glance(){ const a=[-1,0,1][Math.floor(Math.random()*3)],b=[-.6,0,.4][Math.floor(Math.random()*3)];
      this.lookTarget={x:a*2.7,y:b*2.0}; this._glanceBack=this.t+0.6+Math.random()*1.2; }
    lookAt(dx){ this.lookTarget={x:Math.max(-3,Math.min(3,dx)),y:this.lookTarget.y}; this._glanceBack=this.t+1.2; }
    talk(sec){ this.talkUntil=this.t+(sec||1.2); }
    setWalking(on){ this.walking=on; }
    setBack(on){ if(this.back===on)return; this.back=on; this.faceG.style.display=on?'none':''; this.feet.style.display=on?'':'none'; }
    idle(dt){ this.nextBlink-=dt;
      if(this.nextBlink<=0){ this.blink(); if(Math.random()<.25) setTimeout(()=>this.blink(),160); this.nextBlink=1.6+Math.random()*3.6; }
      if(this._glanceBack&&this.t>this._glanceBack){ this.lookTarget={x:0,y:0}; this._glanceBack=0; }
      if(!this._glanceBack&&Math.random()<dt*0.22) this.glance(); }
    step(dt){ this.t+=dt;
      this.look.x+=(this.lookTarget.x-this.look.x)*Math.min(1,dt*8); this.look.y+=(this.lookTarget.y-this.look.y)*Math.min(1,dt*8);
      this.pupils.setAttribute('transform',`translate(${this.look.x} ${this.look.y})`);
      let sy=this._eyeScaleBase||1;
      if(this.blinkT>0){ this.blinkT-=dt; const p=Math.max(0,this.blinkT/0.16); sy*=(0.08+0.92*(1-Math.sin(p*Math.PI))); }
      for(const g of[this.eL,this.eR]) g.setAttribute('transform',`translate(${g.cx} ${EYE.y}) scale(1 ${sy}) translate(${-g.cx} ${-EYE.y})`);
      if(this.t<this.talkUntil&&this.expr!=='surprised'){ const o=1+Math.sin(this.t*26)*0.5;
        this.mouth.setAttribute('d',o>1.2?M.grin:M.small); this.mouth.setAttribute('fill',o>1.2?'#1b2338':'none'); }
      // feet show only while climbing (back turned): gentle alternate grip
      if(this.back){ this.phase+=dt*10;
        const lift=2.6; const l=Math.max(0,Math.sin(this.phase))*lift, r=Math.max(0,Math.sin(this.phase+Math.PI))*lift;
        this.footL.setAttribute('cy',FOOT.base-l); this.footR.setAttribute('cy',FOOT.base-r); }
    }
    follow(b){ const s=this.cssScale; const left=b.minx*s, top=b.miny*s;
      const sx=(b.maxx-b.minx)/this.restWdev, sy=(b.maxy-b.miny)/this.restHdev;
      this.svg.style.transform=`translate(${left}px,${top}px) scale(${sx},${sy})`; }
  }
  global.Face=Face;
})(window);

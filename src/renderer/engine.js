/* Roaming brain (logic only — no rendering). Computes the pet's position and
   behaviour state across the desktop and fires events; app.js turns those into
   the jelly body + animated face. Blob = a walker. Watchdog prevents freezing. */
(function (global) {
  const rnd=(a,b)=>a+Math.random()*(b-a), irnd=(a,b)=>Math.floor(rnd(a,b+1));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), sign=(v)=>v<0?-1:1;

  const Engine = {
    hooks:{}, size:140, baseSpeed:80,
    pos:{x:300,y:200}, vel:{x:0,y:0}, facing:1,
    state:'idle', stateUntil:0, nextDecision:0, lastChange:0, target:null,
    onFloor:false, dragging:false, recent:[], cursor:{x:0,y:0},
    settings:{speed:1,personality:'chill',mischief:25},
    world:{x0:0,y0:0,x1:1280,y1:720,floors:[]},
    last:0, raf:0, _wantClimb:false, _peeking:false,

    init(hooks){ this.hooks=hooks||{}; this.pos={x:(this.world.x0+this.world.x1)*0.4,y:this.world.y0+60};
      this.last=performance.now(); this.lastChange=this.last; this.loop=this.loop.bind(this); this.raf=requestAnimationFrame(this.loop); },
    setWorld(payload,opts){ const roam=opts&&opts.roamAll, ds=payload.displays||[];
      if(roam&&ds.length){ this.world={x0:0,y0:0,x1:payload.size.width,y1:payload.size.height,
        floors:ds.map(d=>({x0:d.work.x,x1:d.work.x+d.work.width,y:d.work.y+d.work.height}))}; }
      else { const p=ds.find(d=>d.id===payload.primaryId)||ds[0]||{bounds:{x:0,y:0,width:payload.size.width,height:payload.size.height},work:{x:0,y:0,width:payload.size.width,height:payload.size.height}};
        this.world={x0:p.bounds.x,y0:p.bounds.y,x1:p.bounds.x+p.bounds.width,y1:p.bounds.y+p.bounds.height,
          floors:[{x0:p.work.x,x1:p.work.x+p.work.width,y:p.work.y+p.work.height}]}; }
      this.pos.x=clamp(this.pos.x,this.world.x0,this.world.x1-this.size); },
    setSize(px){ this.size=px; },
    setSettings(s){ this.settings=Object.assign(this.settings,s); },
    setCursor(p){ this.cursor=p; },
    floorAt(x){ const cx=x+this.size/2; let best=null;
      for(const f of this.world.floors) if(cx>=f.x0&&cx<=f.x1) best=best==null?f.y:Math.max(best,f.y);
      if(best==null) best=this.world.y1; return best-this.size; },

    grab(){ this.dragging=true; this.setState('drag',1e9); this.hooks.onGrab&&this.hooks.onGrab(); },
    dragTo(x,y){ const nx=clamp(x-this.size/2,this.world.x0-this.size*0.3,this.world.x1-this.size*0.7);
      const ny=clamp(y-this.size/2,this.world.y0-this.size*0.3,this.world.y1-this.size*0.3);
      this.vel.x=(nx-this.pos.x)*12; this.vel.y=(ny-this.pos.y)*12; this.pos.x=nx; this.pos.y=ny; },
    release(){ this.dragging=false; this.onFloor=false;
      this.vel.x=clamp(this.vel.x,-1400,1400); this.vel.y=clamp(this.vel.y,-1400,1400); this.setState('fall',1e9); },
    petted(){ this.hooks.onPet&&this.hooks.onPet(); },
    nap(){ this.setState('sleep',rnd(7000,15000)); this.hooks.say&&this.hooks.say('sleep'); },

    setState(s,dur){ this.state=s; this.stateUntil=performance.now()+(dur||0); this.lastChange=performance.now();
      this.hooks.onState&&this.hooks.onState(s); },

    decide(){ const now=performance.now(), per=this.settings.personality, mis=this.settings.mischief/100;
      const w={walk:3,idle:2.4,sit:1.4,sleep:0.8,jump:1.0,climb:0.8*mis+.15,peek:0.7*mis+.1,say:1.0,look:1.6};
      if(per==='hyper'){w.walk+=2;w.jump+=2;w.sleep=.2;w.sit=.4;}
      if(per==='sleepy'){w.sleep+=2.5;w.sit+=2;w.walk-=1.2;}
      if(per==='naughty'){w.climb+=1.3;w.peek+=1;w.jump+=1;}
      if(per==='chill'){w.idle+=1;w.sit+=.6;}
      for(const k of this.recent) if(w[k]!=null) w[k]*=0.35;
      const keys=Object.keys(w); let sum=keys.reduce((a,k)=>a+Math.max(0,w[k]),0), r=Math.random()*sum, ch='idle';
      for(const k of keys){ r-=Math.max(0,w[k]); if(r<=0){ch=k;break;} }
      this.recent.unshift(ch); this.recent=this.recent.slice(0,2); this.run(ch);
      this.nextDecision=now+rnd(1500,3800)/(per==='hyper'?1.8:per==='sleepy'?.7:1); },
    run(b){ const mid=this.size/2,x0=this.world.x0,x1=this.world.x1;
      switch(b){
        case 'walk': this.target=rnd(x0+mid,x1-mid); this.setState('walk',1e9); break;
        case 'idle': this.setState('idle',rnd(1200,3000)); break;
        case 'sit': this.setState('sit',rnd(2500,6000)); break;
        case 'sleep': this.nap(); break;
        case 'jump': if(this.onFloor){ this.vel.y=-rnd(380,560); this.onFloor=false; this.setState('fall',1e9); this.hooks.onJump&&this.hooks.onJump(); } break;
        case 'climb': this.climbWall(); break;
        case 'peek': this.peek(); break;
        case 'look': this.hooks.onLook&&this.hooks.onLook(); this.setState('idle',rnd(900,1600)); break;
        case 'say': this.hooks.say&&this.hooks.say(Math.random()<.4?'study':'idle'); this.setState('idle',1600); break;
      } },
    climbWall(){ const toLeft=this.pos.x<(this.world.x0+this.world.x1)/2; this.climbEdge=toLeft?this.world.x0:this.world.x1-this.size;
      this.target=this.climbEdge; this.setState('walk',1e9); this._wantClimb=true; },
    peek(){ const toLeft=Math.random()<.5; this.target=toLeft?this.world.x0-this.size*0.35:this.world.x1-this.size*0.65;
      this.setState('walk',1e9); this._peeking=true; },

    loop(now){ const dt=Math.min(0.05,(now-this.last)/1000); this.last=now;
      if(!this.dragging) this.step(dt,now);
      if(!this.dragging&&this.state!=='sleep'&&this.state!=='drag'&&now-this.lastChange>7000){ this._wantClimb=this._peeking=false; this.target=null; this.decide(); }
      this.hooks.onFrame&&this.hooks.onFrame(dt,now);
      this.raf=requestAnimationFrame(this.loop); },
    step(dt,now){ const spd=this.baseSpeed*(this.settings.speed||1)*(this.settings.personality==='hyper'?1.5:this.settings.personality==='sleepy'?.6:1);
      const x0=this.world.x0,x1=this.world.x1;
      const climbing=this._wantClimb&&Math.abs(this.pos.x-(this.climbEdge??-1e9))<2;
      if(climbing){ this.pos.y-=spd*1.1*dt; this.facing=this.climbEdge===x0?1:-1;
        if(this.pos.y<this.world.y0+rnd(10,60)){ this._wantClimb=false; this.onFloor=false; this.vel.y=0; this.setState('fall',1e9); } return; }
      if(this.state==='walk'&&this.target!=null){ const d=this.target-this.pos.x;
        if(Math.abs(d)<4){ this.pos.x=this.target; this.target=null;
          if(this._peeking){ this._peeking=false; this.hooks.onLook&&this.hooks.onLook(); this.setState('idle',rnd(900,1800)); }
          else if(!this._wantClimb) this.setState('idle',rnd(400,1200)); }
        else { this.facing=sign(d); this.pos.x+=this.facing*spd*dt; this.hooks.onWalk&&this.hooks.onWalk(dt); } }
      const fy=this.floorAt(this.pos.x);
      if(this.pos.y<fy||this.vel.y<0){ this.vel.y+=2300*dt; this.pos.y+=this.vel.y*dt; this.onFloor=false; this.pos.x+=this.vel.x*dt; this.vel.x*=(1-dt*1.6); }
      if(this.pos.y>=fy){ if(!this.onFloor&&this.vel.y>120){ this.hooks.onLand&&this.hooks.onLand(this.vel.y); }
        this.pos.y=fy; this.vel.y=0; this.onFloor=true; if(this.state==='fall') this.setState('idle',400); }
      this.pos.x=clamp(this.pos.x,x0,x1-this.size);
      if(now>this.nextDecision&&this.onFloor&&!this._wantClimb&&['idle','sit','walk'].includes(this.state)&&(this.state!=='walk'||this.target==null)) this.decide();
      if(this.state==='sleep'&&now>this.stateUntil) this.setState('idle',300); },
    hitTest(x,y){ const pad=14; return x>=this.pos.x-pad&&x<=this.pos.x+this.size+pad&&y>=this.pos.y-pad&&y<=this.pos.y+this.size+pad; },
  };
  global.Engine = Engine;
})(window);

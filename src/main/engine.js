/* Roaming brain, main-process side. Works in GLOBAL virtual-desktop coords
   (DIP) so it can span every monitor. main.js ticks it and routes the pet to
   the overlay window of whichever display currently contains it. Logic only. */
'use strict';
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sign=(v)=>v<0?-1:1;

const Engine = {
  hooks:{}, size:140, baseSpeed:80,
  pos:{x:300,y:200}, vel:{x:0,y:0}, facing:1,
  state:'idle', stateUntil:0, nextDecision:0, lastChange:0, target:null,
  onFloor:false, dragging:false, parachute:false, recent:[], cursor:{x:0,y:0},
  settings:{speed:1,personality:'chill',mischief:25},
  world:{x0:0,y0:0,x1:1280,y1:720,floors:[]}, ledge:null, lastTick:0, _wantClimb:false, _peeking:false,

  init(hooks, now){ this.hooks=hooks||{}; this.lastTick=now; this.lastChange=now; },

  // displays: electron screen.getAllDisplays() (bounds/workArea in DIP). Global coords.
  setWorld(displays){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const d of displays){ const b=d.bounds; minX=Math.min(minX,b.x); minY=Math.min(minY,b.y); maxX=Math.max(maxX,b.x+b.width); maxY=Math.max(maxY,b.y+b.height); }
    this.world={ x0:minX,y0:minY,x1:maxX,y1:maxY,
      floors: displays.map(d=>({x0:d.workArea.x, x1:d.workArea.x+d.workArea.width, y:d.workArea.y+d.workArea.height})) };
    if(!isFinite(this.pos.x)) this.pos.x=(minX+maxX)/2;
    this.pos.x=clamp(this.pos.x,this.world.x0,this.world.x1-this.size);
    this.pos.y=clamp(this.pos.y,this.world.y0,this.world.y1-this.size);
  },
  setSize(px){ this.size=px; },
  setSettings(s){ Object.assign(this.settings,s); },
  setCursor(p){ this.cursor=p; },
  setLedge(seg){ this.ledge=seg||null; },
  onLedge(){ const L=this.ledge; if(!L||!this.onFloor) return false; const cx=this.pos.x+this.size/2; return cx>=L.x0&&cx<=L.x1&&Math.abs(this.pos.y-(L.y-this.size))<3; },
  floorAt(x){ const cx=x+this.size/2; let best=null;
    for(const f of this.world.floors) if(cx>=f.x0&&cx<=f.x1) best=best==null?f.y:Math.max(best,f.y);
    if(best==null) best=this.world.y1; let fy=best-this.size;
    // the active window's top edge is a ledge: land/perch on it only when at or above it
    const L=this.ledge; if(L&&cx>=L.x0&&cx<=L.x1){ const ly=L.y-this.size; if(ly<fy && this.pos.y<=ly+6) fy=ly; }
    return fy; },

  grab(){ this.dragging=true; this.setState('drag',1e9); this.hooks.event&&this.hooks.event('grab'); },
  dragTo(x,y){ const nx=clamp(x-this.size/2,this.world.x0-this.size*0.3,this.world.x1-this.size*0.7);
    const ny=clamp(y-this.size/2,this.world.y0-this.size*0.3,this.world.y1-this.size*0.3);
    this.vel.x=(nx-this.pos.x)*12; this.vel.y=(ny-this.pos.y)*12; this.pos.x=nx; this.pos.y=ny; },
  release(){ this.dragging=false; this.onFloor=false; this.vel.x=clamp(this.vel.x,-1400,1400); this.vel.y=clamp(this.vel.y,-1400,1400); this.setState('fall',1e9);
    if(Math.hypot(this.vel.x,this.vel.y)>950) this.hooks.event&&this.hooks.event('dizzy'); this._maybeParachute(); },
  _maybeParachute(){ const drop=this.floorAt(this.pos.x)-this.pos.y; if(!this.parachute && drop>150 && Math.random()<0.4){ this.parachute=true; if(this.vel.y>120)this.vel.y=120; this.hooks.event&&this.hooks.event('parachuteOpen'); } },
  petted(){ this.hooks.event&&this.hooks.event('pet'); },
  nap(){ this.setState('sleep',rnd(7000,15000)); this.hooks.event&&this.hooks.event('say',{kind:'sleep'}); },

  setState(s,dur){ if(this.state!==s) this.hooks.state&&this.hooks.state(s); this.state=s; this.stateUntil=this._now+(dur||0); this.lastChange=this._now; },

  decide(){ const now=this._now, per=this.settings.personality, mis=this.settings.mischief/100;
    const w={walk:3,idle:2.4,sit:1.4,sleep:0.8,jump:1.0,bounce:1.6,climb:0.8*mis+.15,peek:0.7*mis+.1,say:1.0,look:1.6};
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
      case 'walk': { let a=x0+mid, b=x1-mid; if(this.onLedge()){ a=this.ledge.x0+mid*0.5; b=this.ledge.x1-mid*0.5; } // hop along the window edge when perched
        this.target=rnd(a,b); this.setState('walk',1e9); break; }
      case 'idle': this.setState('idle',rnd(1200,3000)); break;
      case 'sit': this.setState('sit',rnd(2500,6000)); break;
      case 'sleep': this.nap(); break;
      case 'jump': if(this.onFloor){ this.vel.y=-rnd(380,560); this.onFloor=false; this.setState('fall',1e9); this.hooks.event&&this.hooks.event('jump'); } break;
      case 'bounce': if(this.onFloor){ this.vel.y=-rnd(150,240); this.vel.x=0; this.onFloor=false; this.setState('fall',1e9); this.hooks.event&&this.hooks.event('hop'); } break;
      case 'climb': this.climbWall(); break;
      case 'peek': this.peek(); break;
      case 'look': { const dir=(this.cursor&&isFinite(this.cursor.x))?sign(this.cursor.x-(this.pos.x+this.size/2)):0; this.hooks.event&&this.hooks.event('look',{dir}); this.setState('idle',rnd(900,1600)); break; }
      case 'say': this.hooks.event&&this.hooks.event('say',{kind:Math.random()<.4?'study':'idle'}); this.setState('idle',1600); break;
    } },
  climbWall(){ const toLeft=this.pos.x<(this.world.x0+this.world.x1)/2; this.climbEdge=toLeft?this.world.x0:this.world.x1-this.size;
    this.target=this.climbEdge; this.setState('walk',1e9); this._wantClimb=true; },
  peek(){ const toLeft=Math.random()<.5; this.target=toLeft?this.world.x0-this.size*0.35:this.world.x1-this.size*0.65; this.setState('walk',1e9); this._peeking=true; },

  tick(now){ const dt=Math.min(0.05,(now-this.lastTick)/1000); this.lastTick=now; this._now=now;
    if(!this.dragging) this.step(dt,now);
    if(!this.dragging&&this.state!=='sleep'&&this.state!=='drag'&&this.state!=='climb'&&now-this.lastChange>7000){ this._wantClimb=this._peeking=false; this.target=null; this.decide(); }
  },
  step(dt,now){ const spd=this.baseSpeed*(this.settings.speed||1)*(this.settings.personality==='hyper'?1.5:this.settings.personality==='sleepy'?.6:1);
    const x0=this.world.x0,x1=this.world.x1;
    const climbing=this._wantClimb&&Math.abs(this.pos.x-(this.climbEdge==null?-1e9:this.climbEdge))<2;
    if(climbing){ if(this.state!=='climb') this.setState('climb',1e9); this.pos.y-=spd*1.3*dt; this.facing=this.climbEdge===x0?1:-1;
      if(this.pos.y<this.world.y0+rnd(10,60)){ this._wantClimb=false; this.onFloor=false; this.vel.y=0; this.setState('fall',1e9); } return; }
    if(this.state==='walk'&&this.target!=null&&this.onFloor){ const d=this.target-this.pos.x, hp=(this.settings.speed||1);
      if(Math.abs(d)<this.size*0.35){ this.pos.x=this.target; this.target=null;
        if(this._peeking){ this._peeking=false; this.hooks.event&&this.hooks.event('look'); this.setState('idle',rnd(900,1800)); }
        else if(!this._wantClimb) this.setState('idle',rnd(400,1200)); }
      else if(now>=(this._nextHop||0)){ // slimes hop, they don't walk
        this.facing=sign(d); this.vel.y=-rnd(230,320)*(0.9+0.3*hp); this.vel.x=this.facing*rnd(120,185)*(0.7+0.5*hp);
        this.onFloor=false; this.hooks.event&&this.hooks.event('hop'); } }
    const fy=this.floorAt(this.pos.x);
    if(this.pos.y<fy||this.vel.y<0){
      const g=this.parachute?520:2300; this.vel.y+=g*dt;
      if(this.parachute){ if(this.vel.y>150)this.vel.y=150; this.pos.x+=Math.sin(now/480)*22*dt; }
      this.pos.y+=this.vel.y*dt; this.onFloor=false; this.pos.x+=this.vel.x*dt; this.vel.x*=(1-dt*(this.parachute?2.4:1.6));
      if(this.parachute && (fy-this.pos.y)<46){ this.parachute=false; this.hooks.event&&this.hooks.event('parachuteClose'); } }
    if(this.pos.y>=fy){
      if(!this.onFloor){ if(this.parachute){ this.parachute=false; this.hooks.event&&this.hooks.event('parachuteClose'); }
        if(this.vel.y>120) this.hooks.event&&this.hooks.event('land',{vy:this.vel.y}); this._nextHop=now+rnd(90,240); if(this.state==='fall') this.setState('idle',400); }
      this.pos.y=fy; this.vel.y=0; this.onFloor=true; }
    this.pos.x=clamp(this.pos.x,x0,x1-this.size);
    if(now>this.nextDecision&&this.onFloor&&!this._wantClimb&&['idle','sit','walk'].includes(this.state)&&(this.state!=='walk'||this.target==null)) this.decide();
    if(this.state==='sleep'&&now>this.stateUntil) this.setState('idle',300); },
  hitTest(x,y){ const pad=14; return x>=this.pos.x-pad&&x<=this.pos.x+this.size+pad&&y>=this.pos.y-pad&&y<=this.pos.y+this.size+pad; },
};
module.exports = Engine;

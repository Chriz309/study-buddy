/* Renderer: owns the WebGL jelly body + animated face, driven by the roaming
   Engine. Maps behaviour events to squash/stretch, expressions, speech and
   particles. Overlay is click-through except over the pet. Tray = controls. */
(function () {
  const $=(s)=>document.querySelector(s);
  const glc=$('#gl'), faceSvg=$('#face'), fx=$('#fx'), speechEl=$('#speech');
  const IMG=window.BLOB_ART||'art/blob-body.png';
  let dpr=Math.max(1, window.devicePixelRatio||1);
  let jelly, face, state=null, lastDisplays=null, ready=false;
  let overPet=false, dragging=false, speechTimer=0, zzzTimer=0, walkAcc=0, idleAcc=0, aspect=0.86;

  function resizeCanvas(){ dpr=Math.max(1,window.devicePixelRatio||1);
    glc.width=Math.round(innerWidth*dpr); glc.height=Math.round(innerHeight*dpr); }
  window.addEventListener('resize', resizeCanvas); resizeCanvas();

  // ---- build body + face ----
  jelly=new Jelly(glc,{grid:12,squish:1.1,stiffness:135,damp:5.3,coupling:0.3});
  face=new Face(faceSvg); face.setExpr('neutral');
  const img=new Image();
  img.onload=()=>{ aspect=img.width/img.height; jelly.load(img); applySize(); ready=true; };
  img.onerror=()=>{ console.error('blob art failed to load'); };
  img.src=IMG;

  function sizeDevice(){ const s=(state&&state.settings&&state.settings.size)||140; const h=s*dpr, w=h*aspect; return {w,h,cssH:s,cssW:s*aspect}; }
  function applySize(){ const d=sizeDevice(); if(!jelly.restx) jelly.place(d.w,d.h); else jelly.resize(d.w,d.h);
    const faceW=d.cssW*0.72, faceH=d.cssH*0.66; faceSvg.style.width=faceW+'px'; faceSvg.style.height=faceH+'px';
    jelly._rest={w:d.w,h:d.h,faceW,faceH,cssScale:1/dpr}; if(window.Engine) Engine.setSize(d.cssH); }

  // ---- speech ----
  function speak(kind, force){
    const s=state&&state.settings; if(s&&s.speech===false&&!force) return;
    let chatter=(s&&typeof s.chatter==='number')?s.chatter:0.6;
    if(!force&&(kind==='idle'||kind==='study')&&Math.random()>chatter) return;
    const pool=LINES[kind]||LINES.idle; speechEl.textContent=pool[Math.floor(Math.random()*pool.length)];
    speechEl.classList.add('show'); face.talk(Math.min(1.6,0.5+speechEl.textContent.length*0.045));
    clearTimeout(speechTimer); speechTimer=setTimeout(()=>speechEl.classList.remove('show'), 2400+Math.random()*1200);
  }
  const LINES={ greet:["Hi! I'm Blob. I live here now.","Blob, reporting for study duty!"],
    idle:["What are we working on?","You've got this.","Hydrate — that's an order.","*hums quietly*","I counted your tabs. I'm just concerned."],
    pet:["eeee!","again!","boop received ✅","hehe"], drag:["wheee!","I'm flying!","put me down gently~"],
    sleep:["zzz...","5 more minutes..."], study:["Past paper > panic.","A derivative a day keeps the retest away."] };

  // ---- particles ----
  function spawn(txt,cls,x,y){ const el=document.createElement('div'); el.className=cls; el.textContent=txt;
    el.style.left=x+'px'; el.style.top=y+'px'; fx.appendChild(el); setTimeout(()=>el.remove(),1900); }
  function hearts(){ const p=petScreen(); spawn('❤','heart',p.x,p.y-10); setTimeout(()=>spawn('❤','heart',p.x+14,p.y),130); }
  function petScreen(){ return {x:Engine.pos.x+Engine.size/2, y:Engine.pos.y+Engine.size*0.2}; }

  // ---- engine hooks ----
  Engine.init({
    onState:(st)=>{ clearInterval(zzzTimer);
      if(st==='sleep'){ face.setExpr('sleepy'); zzzTimer=setInterval(()=>{const p=petScreen();spawn('z','zzz',p.x,p.y);},950); }
      else if(st==='drag'){ face.setExpr('happy'); }
      else if(st!=='fall'){ face.setExpr('neutral'); } },
    onLand:(vy)=>{ jelly.squash(Math.max(.3,Math.min(.9,vy/900))); face.setExpr('surprised'); setTimeout(()=>face.setExpr('neutral'),260); },
    onJump:()=>{ jelly.stretch(.55); face.setExpr('surprised'); },
    onWalk:(dt)=>{ walkAcc+=dt; if(walkAcc>0.34){ walkAcc=0; jelly.squash(.10); } },
    onGrab:()=>{ jelly.stretch(.35); face.setExpr('happy'); speak('drag'); },
    onPet:()=>{ jelly.squash(.45); face.setExpr('happy'); face.talk(.6); hearts(); speak('pet'); },
    onLook:()=>face.glance(),
    say:(k)=>speak(k),
    onFrame:(dt,now)=>{
      if(!ready) return;
      // idle liveliness: gentle plop + the face's own blink/glance brain
      if(['idle','sit'].includes(Engine.state)){ idleAcc+=dt; if(idleAcc>2.4){ idleAcc=0; if(!(state&&state.settings&&state.settings.reduceMotion)) jelly.squash(.08); } }
      face.idle(dt); face.step(dt); jelly.step(dt);
      // place body at the roaming position (device px)
      const cx=(Engine.pos.x+Engine.size/2)*dpr, gy=(Engine.pos.y+Engine.size)*dpr;
      jelly.setOrigin(cx,gy);
      jelly.draw();
      if(jelly._rest) face.follow(jelly.getBounds(), jelly._rest);
      // speech bubble position
      if(speechEl.classList.contains('show')){ const b=jelly.getBounds();
        speechEl.style.left=((b.minx+b.maxx)/2/dpr)+'px'; speechEl.style.top=(b.miny/dpr-8)+'px'; }
    },
  });

  // ---- IPC ----
  window.buddy.onDisplays((d)=>{ lastDisplays=d; Engine.setWorld(d,{roamAll:!!(state&&state.settings&&state.settings.roamMonitors)}); });
  window.buddy.onCursor((p)=>{ Engine.setCursor(p); const hit=Engine.hitTest(p.x,p.y);
    if(hit!==overPet){ overPet=hit; window.buddy.setInteractive(hit); } });
  window.buddy.onState((s)=>{ const first=!state; state=s;
    if(s.settings){ Engine.setSettings({speed:s.settings.speed,personality:s.settings.personality,mischief:s.settings.mischief}); applySize();
      if(lastDisplays) Engine.setWorld(lastDisplays,{roamAll:!!s.settings.roamMonitors}); }
    if(first) setTimeout(()=>speak('greet',true),600); });

  // ---- input (received only while interactive = cursor over pet) ----
  let dragId=null,lastPt=null,moved=false,downAt=0;
  window.addEventListener('pointerdown',(e)=>{ if(e.button===2) return; if(!Engine.hitTest(e.clientX,e.clientY)) return;
    dragId=e.pointerId; moved=false; downAt=Date.now(); lastPt={x:e.clientX,y:e.clientY};
    try{glc.setPointerCapture(e.pointerId);}catch{} e.preventDefault(); });
  window.addEventListener('pointermove',(e)=>{ if(dragId!==e.pointerId) return;
    if(!moved&&Math.hypot(e.clientX-lastPt.x,e.clientY-lastPt.y)>5){ moved=true; dragging=true; Engine.grab(); }
    if(dragging) Engine.dragTo(e.clientX,e.clientY); lastPt={x:e.clientX,y:e.clientY}; });
  function endDrag(e){ if(dragId!==e.pointerId) return; try{glc.releasePointerCapture(e.pointerId);}catch{}
    if(dragging){ dragging=false; Engine.release(); } else if(Date.now()-downAt<300){ Engine.petted(); window.buddy.earn(1); } dragId=null; }
  window.addEventListener('pointerup',endDrag); window.addEventListener('pointercancel',endDrag);
  window.addEventListener('dblclick',(e)=>{ if(Engine.hitTest(e.clientX,e.clientY)) window.buddy.openSettings(); });

  // boot state
  window.buddy.getState().then((s)=>{ state=s; if(s.settings){ Engine.setSettings({speed:s.settings.speed,personality:s.settings.personality,mischief:s.settings.mischief}); applySize(); } });
})();

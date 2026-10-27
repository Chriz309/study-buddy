/* Renderer (one per monitor): draws the WebGL jelly body + animated face for
   the pet when it's on THIS display. Position/state stream in from the main
   process (which owns the roaming brain); this file only animates + renders. */
(function () {
  const $=(s)=>document.querySelector(s);
  const glc=$('#gl'), faceSvg=$('#face'), fx=$('#fx'), speechEl=$('#speech'), chute=$('#chute');
  if(window.PARACHUTE_ART) chute.src=window.PARACHUTE_ART;
  let chuteOn=false;
  const IMG=window.BLOB_ART||'art/blob-body.png';
  let dpr=Math.max(1,window.devicePixelRatio||1);
  let jelly, face, settings=null, ready=false;
  let pet={show:false,x:0,y:0,size:140,state:'idle',facing:1};
  let disp={x:0,y:0}, lastState='idle', dragging=false, speechTimer=0, zzzTimer=0, idleAcc=0, lastSize=0;

  function resizeCanvas(){ dpr=Math.max(1,window.devicePixelRatio||1); glc.width=Math.round(innerWidth*dpr); glc.height=Math.round(innerHeight*dpr); }
  window.addEventListener('resize', resizeCanvas); resizeCanvas();

  jelly=new Jelly(glc,{grid:12,squish:1.1,stiffness:135,damp:5.3,coupling:0.3});
  face=new Face(faceSvg); face.setExpr('neutral');
  const img=new Image(); img.onload=()=>{ jelly.aspect=img.width/img.height; jelly.load(img); applySize(); ready=true; };
  img.src=IMG;

  function applySize(){ const cssH=pet.size||(settings&&settings.size)||140; const asp=jelly.aspect||0.95;
    const h=cssH*dpr, w=h*asp; if(!jelly.restx) jelly.place(w,h); else jelly.resize(w,h);
    face.setRest(w,h,1/dpr); jelly._placed=true; lastSize=cssH; }

  function jiggle(){ return settings && typeof settings.jiggle==='number' ? settings.jiggle : 1.1; }

  const LINES={ greet:["Hi! I'm Blob. I live here now.","Blob, reporting for study duty!"],
    idle:["What are we working on?","You've got this.","Hydrate — that's an order.","*hums quietly*","I counted your tabs. I'm just concerned."],
    pet:["eeee!","again!","boop received ✅","hehe"], sleep:["zzz...","5 more minutes..."],
    study:["Past paper > panic.","A derivative a day keeps the retest away."], fed:["yum!","tasty ✨","more?"] };
  function speak(kind, force){ if(settings&&settings.speech===false&&!force) return;
    let chatter=(settings&&typeof settings.chatter==='number')?settings.chatter:0.6;
    if(!force&&(kind==='idle'||kind==='study')&&Math.random()>chatter) return;
    const pool=LINES[kind]||LINES.idle; speechEl.textContent=pool[Math.floor(Math.random()*pool.length)];
    speechEl.classList.add('show'); face.talk(Math.min(1.6,0.5+speechEl.textContent.length*0.045));
    clearTimeout(speechTimer); speechTimer=setTimeout(()=>speechEl.classList.remove('show'),2400+Math.random()*1200); }

  function spawn(txt,cls,x,y){ const el=document.createElement('div'); el.className=cls; el.textContent=txt; el.style.left=x+'px'; el.style.top=y+'px'; fx.appendChild(el); setTimeout(()=>el.remove(),1900); }
  function petScreenCss(){ return {x:pet.x+pet.size/2, y:pet.y+pet.size*0.2}; }
  function hearts(){ const p=petScreenCss(); spawn('❤','heart',p.x,p.y-10); setTimeout(()=>spawn('❤','heart',p.x+14,p.y),130); }

  // ---- streams from main ----
  window.buddy.onState((s)=>{ settings=s.settings||settings; if(settings){ jelly.squish=jiggle(); document.body.classList.toggle('rm',!!settings.reduceMotion); applySize(); } });
  window.buddy.getState().then((s)=>{ settings=s.settings; if(settings){ jelly.squish=jiggle(); applySize(); } });

  window.buddy.onPet((p)=>{
    const was=pet.show; pet=p;
    if(p.show){ if(p.size!==lastSize) applySize();
      if(p.state!==lastState){ onStateChange(p.state); lastState=p.state; }
      face.setWalking(p.state==='walk'); face.setBack(p.state==='climb');
      if(!was){ faceSvg.style.display=''; }
    } else if(was){ faceSvg.style.display='none'; clearInterval(zzzTimer); }
  });
  function onStateChange(st){ clearInterval(zzzTimer);
    if(st==='sleep'){ face.setExpr('sleepy'); zzzTimer=setInterval(()=>{const p=petScreenCss();spawn('z','zzz',p.x,p.y);},950); }
    else if(st==='drag'){ face.setExpr('happy'); }
    else if(st==='climb'){ /* back turned */ }
    else if(st!=='fall'){ face.setExpr('neutral'); } }

  window.buddy.onPetEvent((e)=>{ if(!ready) return;
    switch(e.type){
      case 'land': jelly.squash(Math.max(.3,Math.min(.9,(e.vy||400)/900))); face.setExpr('surprised'); setTimeout(()=>{ if(lastState!=='climb'&&lastState!=='sleep') face.setExpr(lastState==='drag'?'happy':'neutral'); },260); break;
      case 'hop': jelly.stretch(.30); break;
      case 'parachuteOpen': chuteOn=true; chute.style.display='block'; jelly.stretch(.2); break;
      case 'parachuteClose': chuteOn=false; chute.style.display='none'; break;
      case 'jump': jelly.stretch(.55); face.setExpr('surprised'); break;
      case 'pet': jelly.squash(.45); face.setExpr('happy'); face.talk(.6); hearts(); speak('pet'); break;
      case 'fed': jelly.squash(.5); face.setExpr('happy'); face.talk(.8); hearts(); speak('fed'); break;
      case 'grab': jelly.stretch(.35); face.setExpr('happy'); break;
      case 'look': face.glance(); break;
      case 'say': speak(e.kind||'idle'); break;
    } });

  // ---- render loop ----
  let last=performance.now();
  function frame(now){ const dt=Math.min(0.05,(now-last)/1000); last=now;
    if(!ready){ requestAnimationFrame(frame); return; }
    if(!pet.show){ jelly.clear(); requestAnimationFrame(frame); return; }
    if(['idle','sit'].includes(pet.state)){ idleAcc+=dt; if(idleAcc>2.4){ idleAcc=0; if(!(settings&&settings.reduceMotion)) jelly.squash(.08); } }
    face.idle(dt); face.step(dt); jelly.step(dt);
    jelly.setOrigin((pet.x+pet.size/2)*dpr, (pet.y+pet.size)*dpr);
    jelly.draw(); if(jelly._placed) face.follow(jelly.getBounds());
    if(speechEl.classList.contains('show')){ const b=jelly.getBounds(); speechEl.style.left=((b.minx+b.maxx)/2/dpr)+'px'; speechEl.style.top=(b.miny/dpr-8)+'px'; }
    if(chuteOn){ const cw=pet.size*1.35, chh=cw*1.081, sway=Math.sin(now/420)*7;
      chute.style.width=cw+'px'; chute.style.left=(pet.x+pet.size/2-cw/2+sway)+'px'; chute.style.top=(pet.y-chh+pet.size*0.18)+'px'; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- input (this window is interactive only when the cursor is over the pet) ----
  let dragId=null,lastPt=null,moved=false,downAt=0;
  function overPet(x,y){ const pad=14; return pet.show && x>=pet.x-pad && x<=pet.x+pet.size+pad && y>=pet.y-pad && y<=pet.y+pet.size+pad; }
  window.addEventListener('pointerdown',(e)=>{ if(e.button===2) return; if(!overPet(e.clientX,e.clientY)) return;
    dragId=e.pointerId; moved=false; downAt=Date.now(); lastPt={x:e.clientX,y:e.clientY};
    try{glc.setPointerCapture(e.pointerId);}catch{} e.preventDefault(); });
  window.addEventListener('pointermove',(e)=>{ if(dragId!==e.pointerId) return;
    if(!moved&&Math.hypot(e.clientX-lastPt.x,e.clientY-lastPt.y)>5){ moved=true; dragging=true; window.buddy.petGrab(); }
    if(dragging) window.buddy.petDrag(e.clientX,e.clientY); lastPt={x:e.clientX,y:e.clientY}; });
  function endDrag(e){ if(dragId!==e.pointerId) return; try{glc.releasePointerCapture(e.pointerId);}catch{}
    if(dragging){ dragging=false; window.buddy.petRelease(); } else if(Date.now()-downAt<300){ window.buddy.petTap(); } dragId=null; }
  window.addEventListener('pointerup',endDrag); window.addEventListener('pointercancel',endDrag);
  window.addEventListener('dblclick',(e)=>{ if(overPet(e.clientX,e.clientY)) window.buddy.openSettings(); });
})();

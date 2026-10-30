/* Renderer (one per monitor): draws the WebGL jelly body + animated face for
   the pet when it's on THIS display. Position/state stream in from the main
   process (which owns the roaming brain); this file only animates + renders. */
(function () {
  const $=(s)=>document.querySelector(s);
  const glc=$('#gl'), faceSvg=$('#face'), fx=$('#fx'), speechEl=$('#speech'), chute=$('#chute'), food=$('#food');
  if(window.PARACHUTE_ART) chute.src=window.PARACHUTE_ART;
  if(window.FOOD_ART) food.src=window.FOOD_ART;
  let chuteOn=false, foodT=0, foodOn=false;
  const CHARS={
    blob:  {art:window.BLOB_ART,  float:false, swirl:false, vectorFace:true},
    ghost: {art:window.GHOST_ART, float:true,  swirl:true,  vectorFace:true},
    cat:   {poses:(window.CAT_ART||{}), float:false, swirl:false, vectorFace:false, directional:true},
  };
  // per-pose height scale so a lying cat doesn't look bigger than a standing one
  // heights chosen so the cat's head is the same size in every pose (all frames share one art scale)
  const POSE_H={ side:1, side2:1, side3:1, side4:1, front:1.052, sit:1.067, lay:0.718 };
  // 4-frame walk cycle: stride → passing → (other) stride → passing
  const WALK=['side','side2','side3','side4'];
  // cat coat colours (the orange art recoloured via filters) — hue-rotate looked broken on it
  const CAT_COLORS={ ginger:'', grey:'grayscale(1) brightness(1.02)', black:'grayscale(1) brightness(.42) contrast(1.15)', white:'grayscale(1) brightness(1.72) contrast(.82)' };
  let dpr=Math.max(1,window.devicePixelRatio||1);
  let jelly, face, settings=null, ready=false, curChar='blob', floatMode=false, images={}, poseImgs={};
  let vectorFace=true, directional=false, curPose=null, heightScale=1;
  let boostUntil=0;   // full-rate drawing until this time (after pats/feeds/etc.)
  let walkDist=0, walkFrame=0, breatheT=0, blinkT=0, blinkWait=3, blinking=false;
  let pet={show:false,x:0,y:0,size:140,state:'idle',facing:1};
  let disp={x:0,y:0}, lastState='idle', dragging=false, speechTimer=0, zzzTimer=0, idleAcc=0, lastSize=0;

  function resizeCanvas(){ dpr=Math.max(1,window.devicePixelRatio||1); glc.width=Math.round(innerWidth*dpr); glc.height=Math.round(innerHeight*dpr); }
  // crossing to a monitor with a different scale fires 'resize' AND changes dpr —
  // re-apply the mesh + face sizing so body and face stay aligned.
  window.addEventListener('resize', ()=>{ resizeCanvas(); if(ready) applySize(); });
  resizeCanvas();

  jelly=new Jelly(glc,{grid:12,squish:1.1,stiffness:135,damp:5.3,coupling:0.3});
  face=new Face(faceSvg); face.setExpr('neutral');
  let colorsMap={};
  function applyColor(){ let f='';
    if(curChar==='cat'){ f = CAT_COLORS[(colorsMap&&colorsMap.cat)||'ginger'] || ''; }
    else { const h=(colorsMap&&colorsMap[curChar])||0; f = h?('hue-rotate('+h+'deg)'):''; }
    glc.style.filter=f; faceSvg.style.filter=f; }
  function applyFacing(){ glc.style.transform = (directional && pet.facing<0) ? 'scaleX(-1)' : ''; }
  function poseFor(st){ switch(st){ case 'walk': case 'climb': case 'fall': return 'side'; case 'sleep': return 'lay'; case 'sit': return 'sit'; default: return 'front'; } }
  function setPose(key){ const cfg=CHARS[curChar]; if(!cfg||!cfg.poses) return;
    const im=poseImgs[curChar+'/'+key]; if(!im || curPose===key) return;
    curPose=key; heightScale=POSE_H[key]||1; jelly.aspect=im.width/im.height; jelly.load(im); jelly.wave=false; applySize(); applyColor(); applyFacing(); ready=true; }
  // lightweight texture swap (same-size walk frames) — keeps the soft-body jiggle
  function swapTex(key){ const im=poseImgs[curChar+'/'+key]; if(!im||curPose===key) return; curPose=key; jelly.aspect=im.width/im.height; jelly.load(im); }
  // quick eye-blink: flick to the closed-eye variant of the current pose, then back
  function doBlink(){ const base=curPose, bk=base+'_blink'; if(!poseImgs[curChar+'/'+bk]) return;
    blinking=true; swapTex(bk); setTimeout(()=>{ blinking=false; if(curPose===bk) swapTex(base); }, 140); }
  function loadChar(id){ const cfg=CHARS[id]||CHARS.blob;
    floatMode=!!cfg.float; directional=!!cfg.directional; vectorFace=cfg.vectorFace!==false; curChar=id; curPose=null;
    faceSvg.style.display = (vectorFace && pet.show) ? '' : 'none';
    if(cfg.poses){ const keys=Object.keys(cfg.poses); let n=0;           // multi-pose character (cat): preload all, show default
      keys.forEach(k=>{ const key=id+'/'+k; const done=()=>{ if(++n===keys.length) setPose(poseFor(pet.state)); };
        if(poseImgs[key]){ done(); return; } const im=new Image(); im.onload=()=>{ poseImgs[key]=im; done(); }; im.src=cfg.poses[k]; });
      return; }
    const apply=(im)=>{ heightScale=1; jelly.aspect=im.width/im.height; jelly.load(im); jelly.wave=!!cfg.swirl; applySize(); applyColor(); applyFacing(); ready=true; };
    if(images[id]){ apply(images[id]); return; }
    const im=new Image(); im.onload=()=>{ images[id]=im; apply(im); };
    im.src=cfg.art||('art/'+(id==='ghost'?'ghost-body.png':'blob-body.png')); }
  loadChar('blob');

  function applySize(){ const cssH=(pet.size||(settings&&settings.size)||140)*heightScale; const asp=jelly.aspect||0.95;
    const h=cssH*dpr, w=h*asp; if(!jelly.restx) jelly.place(w,h); else jelly.resize(w,h);
    face.setRest(w,h,1/dpr); jelly._placed=true; lastSize=cssH; }

  function jiggle(){ return settings && typeof settings.jiggle==='number' ? settings.jiggle : 1.1; }

  const LINES={ greet:["Hi! I'm Blob. I live here now.","Blob, reporting for study duty!","ready when you are 💪"],
    idle:["What are we working on?","You've got this.","Hydrate — that's an order.","*hums quietly*","I counted your tabs. I'm just concerned.",
          "one more section, then a break?","your future self says thanks.","small steps, big marks.","posture check! sit up 🙂","you're doing better than you think."],
    pet:["eeee!","again!","boop received ✅","hehe","best human","♥"], sleep:["zzz...","5 more minutes...","recharging..."],
    study:["Past paper > panic.","A derivative a day keeps the retest away.","do the hard question first.","revise it once more, trust me.",
           "you pass, I pass. deal?","exams fear the prepared."], fed:["yum!","tasty ✨","more?","nom nom","10/10 snack"] };
  function speak(kind, force){ if(settings&&settings.speech===false&&!force) return;
    let chatter=(settings&&typeof settings.chatter==='number')?settings.chatter:0.6;
    if(!force&&(kind==='idle'||kind==='study')&&Math.random()>chatter) return;
    const pool=LINES[kind]||LINES.idle; speechEl.textContent=pool[Math.floor(Math.random()*pool.length)];
    speechEl.classList.add('show'); face.talk(Math.min(1.6,0.5+speechEl.textContent.length*0.045));
    clearTimeout(speechTimer); speechTimer=setTimeout(()=>speechEl.classList.remove('show'),2400+Math.random()*1200); }

  function spawn(txt,cls,x,y){ const el=document.createElement('div'); el.className=cls; el.textContent=txt; el.style.left=x+'px'; el.style.top=y+'px'; fx.appendChild(el); setTimeout(()=>el.remove(),1900); }
  function petScreenCss(){ return {x:pet.x+pet.size/2, y:pet.y+pet.size*0.2}; }
  function hearts(){ const p=petScreenCss(); spawn('❤','heart',p.x,p.y-10); setTimeout(()=>spawn('❤','heart',p.x+14,p.y),130); }
  function phaseFx(){ glc.style.transition=faceSvg.style.transition='opacity .45s ease'; glc.style.opacity=faceSvg.style.opacity='0.12'; setTimeout(()=>{ glc.style.opacity=faceSvg.style.opacity='1'; },650); }

  // ---- streams from main ----
  window.buddy.onState((s)=>{ settings=s.settings||settings; colorsMap=s.colors||colorsMap; if(settings){ jelly.squish=jiggle(); document.body.classList.toggle('rm',!!settings.reduceMotion); applySize(); }
    if(s.active&&s.active!==curChar) loadChar(s.active); else applyColor(); });
  window.buddy.getState().then((s)=>{ settings=s.settings; colorsMap=s.colors||colorsMap; if(settings){ jelly.squish=jiggle(); applySize(); } if(s.active&&s.active!==curChar) loadChar(s.active); else applyColor(); });

  window.buddy.onPet((p)=>{
    const was=pet.show, prevFacing=pet.facing; pet=p;
    if(p.show){ if(p.size!==lastSize) applySize();
      if(p.state!==lastState){ boostUntil=performance.now()+1200; onStateChange(p.state); if(CHARS[curChar]&&CHARS[curChar].poses) setPose(poseFor(p.state)); lastState=p.state; }
      if(p.facing!==prevFacing) applyFacing();
      if(vectorFace){ face.setWalking(p.state==='walk'); face.setBack(p.state==='climb'); }
      if(!was){ faceSvg.style.display = vectorFace ? '' : 'none'; applyFacing(); }
    } else if(was){ faceSvg.style.display='none'; clearInterval(zzzTimer); }
  });
  function onStateChange(st){ clearInterval(zzzTimer);
    if(st==='sleep'){ face.setExpr('sleepy'); zzzTimer=setInterval(()=>{const p=petScreenCss();spawn('z','zzz',p.x,p.y);},950); }
    else if(st==='drag'){ face.setExpr('happy'); }
    else if(st==='climb'){ /* back turned */ }
    else if(st!=='fall'){ face.setExpr('neutral'); } }

  function baseExpr(){ return lastState==='sleep'?'sleepy':lastState==='drag'?'happy':'neutral'; }
  let exprT=0; function transient(e,ms){ face.setExpr(e); clearTimeout(exprT); exprT=setTimeout(()=>{ if(lastState!=='climb') face.setExpr(baseExpr()); }, ms); }
  window.buddy.onPetEvent((e)=>{ boostUntil=performance.now()+1800; if(!ready) return;
    switch(e.type){
      case 'land': jelly.squash(Math.max(.3,Math.min(.9,(e.vy||400)/900))); transient('surprised',260); break;
      case 'hop': jelly.stretch(.30); break;
      case 'parachuteOpen': chuteOn=true; chute.style.display='block'; jelly.stretch(.2); break;
      case 'parachuteClose': chuteOn=false; chute.style.display='none'; break;
      case 'jump': jelly.stretch(.55); transient('surprised',500); break;
      case 'pet': jelly.squash(.45); transient('love',1100); face.talk(.6); hearts(); speak('pet'); break;
      case 'fed': foodOn=true; foodT=0; food.style.display='block'; food.style.opacity='1'; transient('surprised',750); break;
      case 'grab': jelly.stretch(.35); face.setExpr('happy'); break;
      case 'dizzy': transient('dizzy',1700); break;
      case 'phase': phaseFx(); break;
      case 'look': face.glance(e.dir); break;
      case 'say': speak(e.kind||'idle'); break;
    } });

  // ---- render loop ----
  let last=performance.now(), cleared=false, calmAcc=0;
  function frame(now){ let dt=(now-last)/1000; last=now;
    if(!ready){ requestAnimationFrame(frame); return; }
    // hidden: clear once, then do nothing until the pet shows again (was a GPU clear every frame)
    if(!pet.show){ if(!cleared){ jelly.clear(); cleared=true; } requestAnimationFrame(frame); return; }
    cleared=false;
    // GPU/CPU saver: while resting (sleeping / sitting / idle, nothing popping up) draw at
    // ~20fps instead of 60 — the breathing/blink motions are slow, so it looks the same.
    const calm=now>boostUntil && (pet.state==='sleep'||pet.state==='sit'||pet.state==='idle') && !foodOn && !chuteOn && !speechEl.classList.contains('show') && !blinking;
    if(calm){ calmAcc+=dt; if(calmAcc<0.048){ requestAnimationFrame(frame); return; } dt=calmAcc; }
    calmAcc=0; dt=Math.min(0.05,dt);
    if(['idle','sit'].includes(pet.state)){ idleAcc+=dt; if(idleAcc>2.4){ idleAcc=0; if(!(settings&&settings.reduceMotion)) jelly.squash(.08); } }
    if(curChar==='cat'){
      // walk cycle locked to the distance actually travelled, so the paws plant
      // instead of sliding: one frame per ~17% of body size moved.
      if(pet.state==='walk'){
        const v=Math.abs(pet.vx||0);
        walkDist += v>1 ? v*dt : pet.size*dt*1.1;            // fallback cadence if speed unknown
        const step=pet.size*0.17;
        if(walkDist>=step){ walkDist%=step; walkFrame=(walkFrame+1)%WALK.length; swapTex(WALK[walkFrame]); }
      } else { walkDist=0; walkFrame=0; }
      // gentle breathing + the occasional ear-perk so it feels alive at rest
      if(['idle','sit'].includes(pet.state) && !(settings&&settings.reduceMotion)){ breatheT+=dt;
        if(breatheT>2.1){ breatheT=0; jelly.squash(Math.random()<0.25?0.07:0.035); } }
      // blink now and then while facing us / sitting (not mid-walk)
      if(!blinking && pet.state!=='sleep' && (curPose==='front'||curPose==='sit')){ blinkT+=dt;
        if(blinkT>blinkWait){ blinkT=0; blinkWait=2.4+Math.random()*3.6; doBlink(); if(Math.random()<0.3) setTimeout(doBlink,230); } }
    }
    if(vectorFace){ face.idle(dt); face.step(dt); } jelly.step(dt);
    const bob=floatMode?Math.sin(now/650)*pet.size*0.05:0;
    jelly.setOrigin((pet.x+pet.size/2)*dpr, (pet.y+pet.size+bob)*dpr);
    jelly.draw(); if(vectorFace && jelly._placed) face.follow(jelly.getBounds());
    if(speechEl.classList.contains('show')){ const b=jelly.getBounds(); speechEl.style.left=((b.minx+b.maxx)/2/dpr)+'px'; speechEl.style.top=(b.miny/dpr-8)+'px'; }
    if(chuteOn){ const cw=pet.size*1.35, chh=cw*1.081, sway=Math.sin(now/420)*7;
      chute.style.width=cw+'px'; chute.style.left=(pet.x+pet.size/2-cw/2+sway)+'px'; chute.style.top=(pet.y-chh+pet.size*0.18)+'px'; }
    if(foodOn){ foodT+=dt; const dur=0.62, p=Math.min(1,foodT/dur), fw=pet.size*0.5;
      const sy=pet.y-pet.size*1.05, ey=pet.y+pet.size*0.40; // drop from above into the mouth
      food.style.width=fw+'px'; food.style.left=(pet.x+pet.size/2-fw/2)+'px'; food.style.top=(sy+(ey-sy)*(p*p))+'px';
      food.style.opacity=String(p>0.82?Math.max(0,1-(p-0.82)/0.18):1);
      if(p>=1){ foodOn=false; food.style.display='none'; food.style.opacity='1'; jelly.squash(.5); transient('love',900); face.talk(.7);
        const c=petScreenCss(); spawn('✨','heart',c.x,c.y+pet.size*0.2); speak('fed'); } }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- input (this window is interactive only when the cursor is over the pet) ----
  let dragId=null,lastPt=null,moved=false,downAt=0;
  function overPet(x,y){ const pad=Math.max(18, pet.size*0.5); return pet.show && x>=pet.x-pad && x<=pet.x+pet.size+pad && y>=pet.y-pad && y<=pet.y+pet.size+pad; }
  window.addEventListener('pointerdown',(e)=>{ if(e.button===2) return; if(!overPet(e.clientX,e.clientY)) return;
    dragId=e.pointerId; moved=false; downAt=Date.now(); lastPt={x:e.clientX,y:e.clientY};
    try{glc.setPointerCapture(e.pointerId);}catch{} e.preventDefault(); });
  window.addEventListener('pointermove',(e)=>{ if(dragId!==e.pointerId) return;
    if(!moved&&Math.hypot(e.clientX-lastPt.x,e.clientY-lastPt.y)>5){ moved=true; dragging=true; window.buddy.petGrab(); }
    if(dragging) window.buddy.petDrag(e.clientX,e.clientY); lastPt={x:e.clientX,y:e.clientY}; });
  function endDrag(e){ if(dragId!==e.pointerId) return; try{glc.releasePointerCapture(e.pointerId);}catch{}
    if(dragging){ dragging=false; window.buddy.petRelease(); } else if(Date.now()-downAt<300){ window.buddy.petTap(); } dragId=null; }
  window.addEventListener('pointerup',endDrag); window.addEventListener('pointercancel',endDrag);
  // safety: if the pointer is ever lost mid-drag (passthrough flips, focus loss), release
  window.addEventListener('blur',()=>{ if(dragId!==null){ if(dragging){ dragging=false; window.buddy.petRelease(); } dragId=null; moved=false; } });
  window.addEventListener('dblclick',(e)=>{ if(overPet(e.clientX,e.clientY)) window.buddy.openSettings(); });
})();

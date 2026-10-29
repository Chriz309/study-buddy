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
  const POSE_H={ side:1, side2:1, front:1.06, sit:1.06, lay:0.70 };
  // cat coat colours (the orange art recoloured via filters) — hue-rotate looked broken on it
  const CAT_COLORS={ ginger:'', grey:'grayscale(1) brightness(1.02)', black:'grayscale(1) brightness(.42) contrast(1.15)', white:'grayscale(1) brightness(1.72) contrast(.82)' };
  let dpr=Math.max(1,window.devicePixelRatio||1);
  let jelly, face, settings=null, ready=false, curChar='blob', floatMode=false, images={}, poseImgs={};
  let vectorFace=true, directional=false, curPose=null, heightScale=1;
  let walkT=0, walkFrame=0, breatheT=0;
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
  function poseFor(st){ switch(st){ case 'walk': case 'climb': case 'fall': case 'stalk': return 'side'; case 'sleep': return 'lay'; case 'sit': return 'sit'; default: return 'front'; } }
  function setPose(key){ const cfg=CHARS[curChar]; if(!cfg||!cfg.poses) return;
    const im=poseImgs[curChar+'/'+key]; if(!im || curPose===key) return;
    curPose=key; heightScale=POSE_H[key]||1; jelly.aspect=im.width/im.height; jelly.load(im); jelly.wave=false; applySize(); applyColor(); applyFacing(); ready=true; }
  // lightweight texture swap (same-size walk frames) — keeps the soft-body jiggle
  function swapTex(key){ const im=poseImgs[curChar+'/'+key]; if(!im||curPose===key) return; curPose=key; jelly.aspect=im.width/im.height; jelly.load(im); }
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
      if(p.state!==lastState){ onStateChange(p.state); if(CHARS[curChar]&&CHARS[curChar].poses) setPose(poseFor(p.state)); lastState=p.state; }
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
  window.buddy.onPetEvent((e)=>{ if(!ready) return;
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
      case 'stalk': beginStalk(e.dir); break;
    } });

  // ---- cat "stalk a mouse" antic ----
  let mouseEl=null, stalk={on:false,phase:'',t:0,dir:1,mx:0,my:0};
  function ensureMouse(){ if(mouseEl) return mouseEl; mouseEl=document.createElement('div');
    mouseEl.textContent='🐭'; mouseEl.style.cssText='position:absolute;z-index:13;pointer-events:none;transform:translate(-50%,-50%);transition:none;will-change:left,top,transform';
    document.body.appendChild(mouseEl); return mouseEl; }
  function beginStalk(dir){ if(curChar!=='cat') return; stalk.on=true; stalk.phase='creep'; stalk.t=0; stalk.dir=(dir||pet.facing)||1;
    const m=ensureMouse(); m.style.display='block'; m.style.fontSize=Math.max(14,pet.size*0.32)+'px';
    stalk.mx=pet.x+pet.size/2 + stalk.dir*pet.size*0.62; stalk.my=pet.y+pet.size*0.92; }
  function endStalk(){ stalk.on=false; if(mouseEl) mouseEl.style.display='none'; }
  function updateStalk(dt,now){ if(!stalk.on||curChar!=='cat'){ return; } stalk.t+=dt; const m=mouseEl; if(!m) return;
    if(stalk.phase==='creep'){
      // cat hunkers low, tiny tense wiggle; mouse nibbles ahead and twitches
      if(Math.random()<0.04) jelly.squash(.06);
      stalk.mx += Math.sin(now/120)*0.4;
      const jx=Math.sin(now/90)*2, jy=Math.cos(now/70)*1.5;
      m.style.left=(stalk.mx+jx)+'px'; m.style.top=(stalk.my+jy)+'px';
      m.style.transform='translate(-50%,-50%) scaleX('+(stalk.dir<0?1:-1)+')';
      if(stalk.t>1.5){ stalk.phase='pounce'; stalk.t=0; jelly.stretch(.5); transient('surprised',500);
        const c=petScreenCss(); spawn('✨','heart',stalk.mx,stalk.my-6); }
    } else if(stalk.phase==='pounce'){
      // mouse scurries away off the window edge, then vanishes
      stalk.mx += stalk.dir*pet.size*6*dt; m.style.left=stalk.mx+'px'; m.style.top=(stalk.my+Math.sin(now/40)*3)+'px';
      if(stalk.t>0.55){ jelly.squash(.25); endStalk(); }
    } }

  // ---- render loop ----
  let last=performance.now();
  function frame(now){ const dt=Math.min(0.05,(now-last)/1000); last=now;
    if(!ready){ requestAnimationFrame(frame); return; }
    if(!pet.show){ jelly.clear(); requestAnimationFrame(frame); return; }
    if(['idle','sit'].includes(pet.state)){ idleAcc+=dt; if(idleAcc>2.4){ idleAcc=0; if(!(settings&&settings.reduceMotion)) jelly.squash(.08); } }
    if(curChar==='cat'){
      // walk cycle: alternate the two side frames so the legs (and tail) move
      if(pet.state==='walk'){ walkT+=dt; if(walkT>0.17){ walkT=0; walkFrame^=1; swapTex(walkFrame?'side2':'side'); } }
      // gentle breathing + the occasional ear-perk so it feels alive at rest
      if(['idle','sit'].includes(pet.state) && !(settings&&settings.reduceMotion)){ breatheT+=dt;
        if(breatheT>2.1){ breatheT=0; jelly.squash(Math.random()<0.25?0.07:0.035); } }
      updateStalk(dt,now);
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

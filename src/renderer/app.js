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
    cat:   {poses:Object.assign({}, window.CAT_ART||{}, window.CAT_ART_EXTRA||{}), float:false, swirl:false, vectorFace:false, directional:true, walk:['side','side2','side3','side4']},
    // Captain Cram: 16-bit pixel art. nearest-neighbour texture + a stiffer, calmer jelly so the pixels stay crisp
    hero:  {poses:(window.HERO_ART||{}), float:false, swirl:false, vectorFace:false, directional:true, nearest:true, jelly:{k:300,damp:9.5,squish:0.7},
            walk:['walk1','walk2','walk3','walk4']},
    // Merlo: 16-bit wizard, 48px frames, same crisp-pixel treatment as the hero
    wizard:{poses:(window.WIZARD_ART||{}), float:false, swirl:false, vectorFace:false, directional:true, nearest:true, jelly:{k:300,damp:9.5,squish:0.7},
            walk:['walk1','walk2']},
  };
  // per-pose height scale so a lying cat doesn't look bigger than a standing one
  // heights chosen so the cat's head is the same size in every pose (all frames share one art scale)
  const POSE_H={ side:1, side2:1, side3:1, side4:1, front:1.052, sit:1.067, lay:0.718, shock:1.052, frazzled:1.052, pull:1.06, juggle:1.12, peek:1.0 };
  // 4-frame walk cycle: stride → passing → (other) stride → passing
Object.assign(POSE_H, window.CAT_ART_EXTRA_H||{});   // heights of the generated desktop-mischief cat frames
  let WALK=['side','side2','side3','side4'];
  const PIX_H={ hero:1.25, wizard:1.25 };   // pixel-art canvases have margins: draw them 1.25x so the figure is as tall as the size setting (hero: 40px canvas, wizard: 48px)
  const HERO_H=1.25;   // the 40px canvas has margins: draw it 1.25x so the figure is as tall as the size setting
  // cat coat colours (the orange art recoloured via filters), hue-rotate looked broken on it
  const CAT_COLORS={ ginger:'', grey:'grayscale(1) brightness(1.02)', black:'grayscale(1) brightness(.42) contrast(1.15)', white:'grayscale(1) brightness(1.72) contrast(.82)' };
  let studyFocus=false;   // a study focus block is running (main sends it via buddy.onStudy)
  let fxSc=1, fxHue=0, fxA=1;   // spell self effects from main (scale about the feet, hue shift, opacity)
  let lastRot=0, lastClip=null, tintOn=false, xrayT=0, smokeT=0;
  let dpr=Math.max(1,window.devicePixelRatio||1);
  let jelly, face, settings=null, ready=false, curChar='blob', floatMode=false, images={}, poseImgs={};
  let vectorFace=true, directional=false, curPose=null, heightScale=1;
  let boostUntil=0;   // full-rate drawing until this time (after pats/feeds/etc.)
  let jellyScale=1, swayIdx=0, swayT=0; const trail=$('#trail');
  let walkDist=0, walkFrame=0, breatheT=0, blinkT=0, blinkWait=3, blinking=false;
  let pet={show:false,x:0,y:0,size:140,state:'idle',facing:1};
  let disp={x:0,y:0}, lastState='idle', dragging=false, speechTimer=0, zzzTimer=0, idleAcc=0, lastSize=0;

  function resizeCanvas(){ dpr=Math.max(1,window.devicePixelRatio||1); glc.width=Math.round(innerWidth*dpr); glc.height=Math.round(innerHeight*dpr); }
  // crossing to a monitor with a different scale fires 'resize' AND changes dpr,
  // re-apply the mesh + face sizing so body and face stay aligned.
  window.addEventListener('resize', ()=>{ resizeCanvas(); if(ready) applySize(); });
  resizeCanvas();

  jelly=new Jelly(glc,{grid:12,squish:1.1,stiffness:135,damp:5.3,coupling:0.3});
  face=new Face(faceSvg); face.setExpr('neutral');
  let colorsMap={};
  let extraTint='';
  // Pixel buddies recolour only their CLOTHES (exact palette colours from scripts/gen_hero.py / gen_wizard.py) instead of tinting the
  // whole sprite: Merlo's hat + robe, Captain Cram's suit + cape/boots. Skin, beard, gold trim, staff and eyes keep their colours.
  const RECOLOR={ wizard:[[62,46,140],[38,28,96],[104,86,186],[84,58,164],[52,36,112]],
                  hero:[[47,107,216],[31,69,160],[110,168,255],[214,40,57],[142,21,38],[255,90,106]] };
  const tintCache={};
  const userHue=()=>((colorsMap&&colorsMap[curChar])||0);
  function rotHue(r,g,b,deg){ r/=255; g/=255; b/=255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2, d=mx-mn; let h=0, sat=0;
    if(d){ sat=l>0.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4); h*=60; }
    h=((h+deg)%360+360)%360; const q=l<0.5?l*(1+sat):l+sat-l*sat, pp=2*l-q, f=(t)=>{ t=(t%1+1)%1; return t<1/6?pp+(q-pp)*6*t:t<1/2?q:t<2/3?pp+(q-pp)*(2/3-t)*6:pp; };
    const k=h/360; return [Math.round(f(k+1/3)*255),Math.round(f(k)*255),Math.round(f(k-1/3)*255)]; }
  // the Settings colour swatches show hue-rotate(h) of #2fa8ff (hue ~205): turn the clothes so their MAIN colour lands on that swatch colour
  const SW_HUE=205, MAIN_RGB={ wizard:[84,58,164], hero:[47,107,216] };
  const hueOf=(r,g,b)=>{ r/=255; g/=255; b/=255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn; if(!d) return 0; const h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4); return h*60; };
  function texFor(key){ const base=poseImgs[curChar+'/'+key], set=RECOLOR[curChar], h0=userHue(); if(!base||!set||!h0) return base;
    const h=Math.round(SW_HUE+h0-hueOf(...MAIN_RGB[curChar]));
    const ck=curChar+'/'+key+'@'+h0; if(tintCache[ck]) return tintCache[ck];
    try{ const c=document.createElement('canvas'); c.width=base.width; c.height=base.height; const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(base,0,0);
      const id=g.getImageData(0,0,c.width,c.height), px=id.data, map=new Map(set.map(([r,gg,b])=>[(r<<16)|(gg<<8)|b, rotHue(r,gg,b,h)]));
      for(let i=0;i<px.length;i+=4){ if(!px[i+3]) continue; const m=map.get((px[i]<<16)|(px[i+1]<<8)|px[i+2]); if(m){ px[i]=m[0]; px[i+1]=m[1]; px[i+2]=m[2]; } }
      g.putImageData(id,0,0); tintCache[ck]=c; return c; }catch(e){ return base; } }
  let texHue=0;   // the clothes hue the current texture was built with
  function applyColor(tint){ if(typeof tint==='string') extraTint=tint; let f='';
    if(curChar==='cat'){ f = CAT_COLORS[(colorsMap&&colorsMap.cat)||'ginger'] || ''; }
    else { const h=(RECOLOR[curChar]?0:userHue())+fxHue; f = h?('hue-rotate('+h+'deg)'):''; }
    if(RECOLOR[curChar] && userHue()!==texHue && curPose){ const k=curPose; curPose=null; swapTex(k); }   // colour picked: rebuild the clothes texture
    if(curChar==='cat' && fxHue) f=(f+' hue-rotate('+fxHue+'deg)').trim();
    if(extraTint) f=(f+' '+extraTint).trim();
    glc.style.filter=f; faceSvg.style.filter=f; }
  // flip to face travel; the dive pose is the flying pose rotated head-down about the sprite's centre
  function applyFacing(){
    const flip=(directional && pet.facing<0) ? 'scaleX(-1)' : '', lean=(pet.state==='pushing'&&directional)?9:0, spin=(pet.rot||0)+lean, rot=(curChar==='hero' && pet.state==='dive') ? ' rotate(90deg)' : (spin ? ' rotate('+spin+'deg)' : '');
    // sc shrinks the sprite about its feet: scale about the centre plus a shift down so the feet stay put
    const org=(pet.x+pet.size/2)+'px '+(pet.y+pet.size-heightScale*pet.size/2)+'px', scl=fxSc<1 ? ' scale('+fxSc+')' : '', shift=fxSc<1 ? 'translateY('+((1-fxSc)*heightScale*pet.size/2)+'px) ' : '';
    glc.style.transformOrigin=org; glc.style.transform=(shift+rot.trim()+scl+' '+flip).trim();
  }   // the vector face keeps its own '0 0' origin + per-frame follow() transform; the spell shrink is layered on in faceFx()
  // desktop mischief reaction states (cat + hero have their own frames; 'pushing' reuses 'pull', tilted forward)
  const MISCHIEF_POSE={ shocked:'shock', frazzled:'frazzled', pulling:'pull', pushing:'pull', juggling:'juggle', peeking:'peek' };
  // every sprite state -> a WIZARD_ART key (checked against art-wizard.js by test/wizard.test.js)
  const WIZ_POSE={ sit:'idle', land:'idle', crouch:'idle', walk:'walk1', run:'walk1', climb:'walk1', fall:'fly', fly:'fly', dive:'fly', flex:'happy', happy:'happy', drag:'happy', juggling:'happy', cast:'cast', cast2:'cast2', point:'point', stir:'stir', drink:'drink', read:'read', frog:'frog', surprised:'surprised', shocked:'surprised', frazzled:'surprised', sleep:'sleep', pull:'pull', pulling:'pull', pushing:'pull', hang:'hang' };
  function poseFor(st){
    if(curChar==='wizard'){ if(studyFocus&&(st==='idle'||st==='sit'||st==='sleep'||st==='land'||st==='crouch')) return 'read'; return WIZ_POSE[st]||'idle'; }   // Merlo reads while you focus
    if(MISCHIEF_POSE[st] && poseImgs[curChar+'/'+MISCHIEF_POSE[st]]) return MISCHIEF_POSE[st];
    if(curChar==='hero'){ switch(st){ case 'walk': case 'run': case 'climb': return 'walk1'; case 'fly': case 'dive': case 'fall': return 'fly'; case 'flex': return 'flex';
      case 'land': case 'crouch': return 'land'; case 'sleep': return 'sleep'; case 'happy': case 'drag': return 'happy'; default: return 'idle'; } }
    switch(st){ case 'walk': case 'run': case 'pounce': case 'climb': case 'fall': return 'side'; case 'sleep': return 'lay'; case 'sit': return 'sit'; default: return 'front'; } }
  function setPose(key){ const cfg=CHARS[curChar]; if(!cfg||!cfg.poses) return;
    const im=texFor(key); if(!im || curPose===key) return; texHue=userHue();
    curPose=key; heightScale=PIX_H[curChar]||(POSE_H[key]||1); jelly.aspect=im.width/im.height; jelly.load(im); jelly.wave=false; applySize(); applyColor(); applyFacing(); ready=true; }
  // lightweight texture swap (same-size walk frames), keeps the soft-body jiggle
  function swapTex(key){ const im=texFor(key); if(!im||curPose===key) return; curPose=key; texHue=userHue(); jelly.aspect=im.width/im.height; jelly.load(im); }
  // quick eye-blink: flick to the closed-eye variant of the current pose, then back
  const blinkKey=(base)=>curChar==='wizard' ? ((base==='idle'||base==='idle2')?'blink':null) : base+'_blink';   // the wizard has one shared closed-eye frame
  function doBlink(){ const base=curPose, bk=blinkKey(base); if(!bk||!poseImgs[curChar+'/'+bk]) return;
    blinking=true; swapTex(bk); setTimeout(()=>{ blinking=false; if(curPose===bk) swapTex(base); }, 140); }
  // multi-pet satellite window: index.html?char=<id> pins this window to one buddy (ignores the lead) and tags its input messages
  const forcedChar=(()=>{ try{ return new URLSearchParams(location.search).get('char')||null; }catch{ return null; } })();
  const satArg=forcedChar||undefined;
  function loadChar(id){ const cfg=CHARS[id]||CHARS.blob;
    floatMode=!!cfg.float; directional=!!cfg.directional; vectorFace=cfg.vectorFace!==false; curChar=id; curPose=null;
    WALK=cfg.walk||WALK; jelly.nearest=!!cfg.nearest; jellyScale=cfg.jelly?cfg.jelly.squish:1;
    jelly.k=cfg.jelly?cfg.jelly.k:135; jelly.damp=cfg.jelly?cfg.jelly.damp:5.3; jelly.squish=jiggle()*jellyScale;
    trail.style.display='none'; swayIdx=0; swayT=0;
    faceSvg.style.display = (vectorFace && pet.show) ? '' : 'none';
    if(cfg.poses){ const keys=Object.keys(cfg.poses); let n=0;           // multi-pose character (cat): preload all, show default
      keys.forEach(k=>{ const key=id+'/'+k; const done=()=>{ if(++n===keys.length) setPose(poseFor(pet.state)); };
        if(poseImgs[key]){ done(); return; } const im=new Image(); im.onload=()=>{ poseImgs[key]=im; done(); }; im.src=cfg.poses[k]; });
      return; }
    const apply=(im)=>{ heightScale=1; jelly.aspect=im.width/im.height; jelly.load(im); jelly.wave=!!cfg.swirl; applySize(); applyColor(); applyFacing(); ready=true; };
    if(images[id]){ apply(images[id]); return; }
    const im=new Image(); im.onload=()=>{ images[id]=im; apply(im); };
    im.src=cfg.art||('art/'+(id==='ghost'?'ghost-body.png':'blob-body.png')); }
  loadChar(forcedChar||'blob');

  function applySize(){ const cssH=(pet.size||(settings&&settings.size)||140)*heightScale; const asp=jelly.aspect||0.95;
    const h=cssH*dpr, w=h*asp; if(!jelly.restx) jelly.place(w,h); else jelly.resize(w,h);
    face.setRest(w,h,1/dpr); jelly._placed=true; lastSize=cssH; }

  function jiggle(){ return settings && typeof settings.jiggle==='number' ? settings.jiggle : 1.1; }

  // per-character speech lines and the shuffle-bag picker live in lines.js (window.SBLines)
  const linePicker=SBLines.createPicker(Math.random);
  function speak(kind, force){ if(settings&&settings.speech===false&&!force) return;
    let chatter=(settings&&typeof settings.chatter==='number')?settings.chatter:0.6;
    if(!force&&(kind==='idle'||kind==='study')&&Math.random()>chatter) return;
    speechEl.textContent=linePicker.pick(curChar, kind, new Date().getHours());
    speechEl.classList.add('show'); face.talk(Math.min(1.6,0.5+speechEl.textContent.length*0.045));
    const showMs=2400+Math.random()*1200;
    clearTimeout(speechTimer); speechTimer=setTimeout(()=>speechEl.classList.remove('show'),showMs);
    try{ window.buddy.petSpeaking(Math.round(showMs+250),satArg); }catch{} }   // tell main: stand still until the line is gone (the text stays readable)

  function spawn(txt,cls,x,y){ const el=document.createElement('div'); el.className=cls; el.textContent=txt; el.style.left=x+'px'; el.style.top=y+'px'; fx.appendChild(el); setTimeout(()=>el.remove(),1900); }
  function petScreenCss(){ return {x:pet.x+pet.size/2, y:pet.y+pet.size*0.2}; }
  function hearts(){ const p=petScreenCss(); spawn('❤','heart',p.x,p.y-10); setTimeout(()=>spawn('❤','heart',p.x+14,p.y),130); }
  function phaseFx(){ glc.style.transition=faceSvg.style.transition='opacity .45s ease'; glc.style.opacity=faceSvg.style.opacity='0.12'; setTimeout(()=>{ glc.style.opacity=faceSvg.style.opacity='1'; },650); }

  // ---- streams from main ----
  window.buddy.onState((s)=>{ settings=s.settings||settings; colorsMap=s.colors||colorsMap; if(settings){ jelly.squish=jiggle()*jellyScale; document.body.classList.toggle('rm',!!settings.reduceMotion); applySize(); }
    const want=forcedChar||s.active; if(want&&want!==curChar) loadChar(want); else applyColor(); });
  window.buddy.getState().then((s)=>{ settings=s.settings; colorsMap=s.colors||colorsMap; if(settings){ jelly.squish=jiggle()*jellyScale; applySize(); } const want=forcedChar||s.active; if(want&&want!==curChar) loadChar(want); else applyColor(); });

  window.buddy.onPet((p)=>{
    const was=pet.show, prevFacing=pet.facing; pet=p; if(studyShown) placeStudy(); if(studyFocus&&curChar==='wizard'&&p.show) setPose(poseFor(p.state));   // keep reading through blinks / state changes
    if((p.clip==null?null:p.clip)!==lastClip){ lastClip=p.clip==null?null:p.clip; document.body.style.clipPath = lastClip==null ? '' : 'inset(0 0 calc(100% - '+Math.max(0,lastClip)+'px) 0)'; }   // peeking out of the taskbar
    const nsc=p.sc==null?1:p.sc, nhue=p.hue||0, na=p.alpha==null?1:p.alpha;
    if(nsc!==fxSc||nhue!==fxHue||na!==fxA){ const hueCh=nhue!==fxHue, aCh=na!==fxA; fxSc=nsc; fxHue=nhue; fxA=na;
      if(aCh){ glc.style.transition=faceSvg.style.transition='none'; glc.style.opacity=faceSvg.style.opacity=String(fxA); }
      if(hueCh) applyColor(); applyFacing(); }
    if((p.rot||0)!==lastRot){ lastRot=p.rot||0; applyFacing(); }
    if(p.show){ if(p.size!==lastSize) applySize();
      if(p.state!==lastState){ boostUntil=performance.now()+1200; onStateChange(p.state); if(CHARS[curChar]&&CHARS[curChar].poses) setPose(poseFor(p.state)); lastState=p.state; applyFacing(); placeTrail(); }
      if(p.facing!==prevFacing){ applyFacing(); placeTrail(); }
      if(vectorFace){ face.setWalking(p.state==='walk'); face.setBack(p.state==='climb'); }
      if(!was){ faceSvg.style.display = vectorFace ? '' : 'none'; applyFacing(); }
    } else if(was){ faceSvg.style.display='none'; clearInterval(zzzTimer); }
  });
  // blob + ghost have no new frames: expression, squash/stretch and a tint carry the reaction states
  function mischiefLook(st){
    const tint = st==='frazzled' ? 'brightness(.5) saturate(.6) contrast(1.1)' : st==='shocked' ? 'brightness(1.45) saturate(1.5) sepia(.35)' : '';
    if(tintOn!==!!tint || tint){ tintOn=!!tint; applyColor(tint); }
    if(st==='shocked'||st==='peeking'){ face.setExpr('surprised'); } else if(st==='frazzled'){ face.setExpr('dizzy'); } else if(st==='juggling'){ face.setExpr('happy'); }
    else if(st==='pulling'){ face.setExpr('neutral'); jelly.stretch(.3); } else if(st==='pushing'){ face.setExpr('neutral'); jelly.squash(.35); }
    if(st==='shocked'){ jelly.stretch(.7); setTimeout(()=>jelly.squash(.5),120); } }
  function onStateChange(st){ clearInterval(zzzTimer); mischiefLook(st); if(MISCHIEF_POSE[st]) return;
    if(st==='sleep'&&studyFocus){ face.setExpr('neutral'); }   // never look asleep while studying
    else if(st==='sleep'){ face.setExpr('sleepy'); zzzTimer=setInterval(()=>{const p=petScreenCss();spawn('z','zzz',p.x,p.y);},950); }
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
      case 'say': speak(e.kind||'idle', !!e.force); break;
      case 'resetInput': resetInput(); break;
      case 'wiggle': jelly.squash(.3); setTimeout(()=>jelly.stretch(.3),170); setTimeout(()=>jelly.squash(.3),340); setTimeout(()=>jelly.stretch(.25),510); break;
      case 'happy': jelly.squash(.4); hearts(); break;
      case 'squash': jelly.squash(e.a||.4); break;
      case 'launch': jelly.stretch(.6); dust(4,.5); break;
      case 'pulse': jelly.stretch(.22); setTimeout(()=>jelly.squash(.18),120); break;
      case 'dust': dust(10,1); break;
      case 'sparkle': sparkles(e.n||8); break;
      case 'burst': stars(e.n||14); break;
      case 'popup': popup(e.text||'+1 INT!'); break;
      case 'xray': xray(e.ms||500); break;
      case 'smoke': smoke(e.ms||2000); break;
    } });
  // ---- study timer ring: remaining focus time next to the head; shown only while a focus block is running or paused ----
  const studyEl=$('#study'), studyArc=studyEl.querySelector('.arc'), studyTxt=studyEl.querySelector('span'); let studyShown=false;
  function placeStudy(){ if(!studyShown) return; studyEl.style.left=Math.round(pet.x+pet.size*0.5)+'px'; studyEl.style.top=Math.round(pet.y+pet.size-heightScale*pet.size-4)+'px'; }
  window.buddy.onStudy((s)=>{ const on=s.phase==='focus'; studyShown=on&&pet.show!==false;
    const calm=on&&!s.paused; if(calm!==studyFocus){ studyFocus=calm; if(curChar==='wizard'&&CHARS.wizard.poses) setPose(poseFor(lastState)); }
    studyEl.style.display=studyShown?'flex':'none'; studyEl.classList.toggle('paused',!!s.paused); if(!on) return;
    const sec=Math.max(0,Math.ceil(s.remainingMs/1000)); studyTxt.textContent=Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
    studyArc.style.strokeDashoffset=String(50.27*(1-(s.totalMs>0?Math.min(1,Math.max(0,s.remainingMs/s.totalMs)):0))); placeStudy(); });
  // ---- desktop mischief fx: x-ray skeleton flash, smoke puffs ----
  const BONES=['..XXXX..','.XXXXXX.','.X.XX.X.','..XXXX..','...XX...','XXXXXXXX','.X.XX.X.','X..XX..X','.X.XX.X.','..XXXX..','..X..X..','..X..X..','.XX..XX.'];
  const xr=document.createElement('canvas'); xr.id='xray'; xr.width=8; xr.height=13; xr.style.cssText='position:absolute;display:none;image-rendering:pixelated;pointer-events:none;z-index:12;filter:drop-shadow(0 0 3px #7fe7ff)'; document.body.appendChild(xr);
  { const c=xr.getContext('2d'); c.fillStyle='#e9fbff'; BONES.forEach((row,y)=>{ for(let x=0;x<8;x++) if(row[x]==='X') c.fillRect(x,y,1,1); }); }
  function xray(ms){ clearTimeout(xrayT); const S=pet.size, w=S*0.5, h=w*13/8; xr.style.width=w+'px'; xr.style.height=h+'px'; xr.style.left=(pet.x+S/2-w/2)+'px'; xr.style.top=(pet.y+S-heightScale*S*0.5-h*0.42)+'px'; xr.style.display='block';
    extraTint='invert(1) hue-rotate(180deg) brightness(.9)'; applyColor(); xrayT=setTimeout(()=>{ xr.style.display='none'; extraTint=''; applyColor(lastState==='frazzled'?'brightness(.5) saturate(.6) contrast(1.1)':''); },ms); }
  function smoke(ms){ clearInterval(smokeT); const end=performance.now()+ms; smokeT=setInterval(()=>{ if(performance.now()>end||!pet.show){ clearInterval(smokeT); return; }
    const el=document.createElement('div'); el.className='smoke'; const u=Math.max(4,Math.round(pet.size*0.1)); el.style.width=el.style.height=u*(1+Math.floor(Math.random()*2))+'px';
    el.style.left=(pet.x+pet.size*(0.3+Math.random()*0.4))+'px'; el.style.top=(pet.y+pet.size-heightScale*pet.size*0.85)+'px'; el.style.setProperty('--dx',((Math.random()-.5)*pet.size*0.5)+'px'); fx.appendChild(el); setTimeout(()=>el.remove(),1100); },110); }
  // ---- arcade fx (Captain Cram) ----
  function dust(n,k){ const cx=pet.x+pet.size/2, gy=pet.y+pet.size-2, u=Math.max(3,Math.round(pet.size*0.07));
    for(let i=0;i<n;i++){ const el=document.createElement('div'); el.className='dust'; const sz=u*(1+Math.floor(Math.random()*2));
      el.style.width=el.style.height=sz+'px'; el.style.left=(cx+(Math.random()-.5)*pet.size*.5)+'px'; el.style.top=(gy-sz)+'px';
      const dir=i%2?1:-1; el.style.setProperty('--dx',(dir*(pet.size*.2+Math.random()*pet.size*.45*k))+'px'); el.style.setProperty('--dy',(-(Math.random()*pet.size*.3*k+4))+'px');
      fx.appendChild(el); setTimeout(()=>el.remove(),700); } }
  function sparkles(n){ const cx=pet.x+pet.size/2, cy=pet.y+pet.size-heightScale*pet.size*.5, u=Math.max(3,Math.round(pet.size*0.07)); const cols=['#ffffff','#ffe14d','#6be7ff','#ff7ab6'];
    for(let i=0;i<n;i++){ const el=document.createElement('div'); el.className='sparkle'; const sz=u*(1+(i%2)); el.style.width=el.style.height=sz+'px';
      el.style.background=cols[i%cols.length]; el.style.left=(cx-sz/2)+'px'; el.style.top=(cy-sz/2)+'px';
      const a=Math.random()*6.283, r=pet.size*(.45+Math.random()*.5); el.style.setProperty('--dx',Math.cos(a)*r+'px'); el.style.setProperty('--dy',Math.sin(a)*r+'px');
      el.style.animationDelay=(i*0.03)+'s'; fx.appendChild(el); setTimeout(()=>el.remove(),1000); } }
  // firework of coloured stars above the hat (wizard star show)
  function stars(n){ const cx=pet.x+pet.size/2, cy=pet.y+pet.size-heightScale*pet.size*(0.95+Math.random()*0.35), u=Math.max(3,Math.round(pet.size*0.08)); const cols=['#ffffff','#ffe14d','#6be7ff','#ff7ab6','#9dff8a','#c08bff'];
    for(let i=0;i<n;i++){ const el=document.createElement('div'); el.className='sparkle'; const sz=u*(1+(i%3===0?1:0)); el.style.width=el.style.height=sz+'px';
      el.style.background=cols[i%cols.length]; el.style.left=(cx-sz/2)+'px'; el.style.top=(cy-sz/2)+'px';
      const a=(i/n)*6.283+Math.random()*0.4, r=pet.size*(.35+Math.random()*.4); el.style.setProperty('--dx',Math.cos(a)*r+'px'); el.style.setProperty('--dy',Math.sin(a)*r+'px');
      fx.appendChild(el); setTimeout(()=>el.remove(),1000); } }
  function popup(text){ const el=document.createElement('div'); el.className='pop'; el.textContent=text; el.style.fontSize=Math.max(12,Math.round(pet.size*.26))+'px';
    el.style.left=(pet.x+pet.size/2)+'px'; el.style.top=(pet.y+pet.size-heightScale*pet.size-pet.size*.12)+'px'; fx.appendChild(el); setTimeout(()=>el.remove(),1800); }
  // cape / speed trail behind the hero while flying (rebuilt only when the state or facing changes)
  function placeTrail(){
    const st=pet.state; if(curChar!=='hero' || !(st==='fly'||st==='dive') || !pet.show){ trail.style.display='none'; return; }
    const S=pet.size, u=Math.max(2,Math.round(S*0.06)), cols=['#d62839','#ff5a6a','#ffd23f','#d62839'], f=pet.facing<0?-1:1;
    trail.innerHTML=''; trail.style.display='block'; trail.style.width=trail.style.height='0px';
    for(let i=0;i<4;i++){ const b=document.createElement('i'); b.style.background=cols[i]; const len=S*(0.55-0.08*i)+(i%2)*u*2, th=u;
      if(st==='dive'){ b.style.width=th+'px'; b.style.height=len+'px'; b.style.left=(pet.x+S/2+(i-1.5)*th*1.6-th/2)+'px'; b.style.top=(pet.y+S-heightScale*S*0.5-S*0.2-len)+'px'; b.style.transformOrigin='50% 100%'; }
      else { b.style.height=th+'px'; b.style.width=len+'px'; b.style.top=(pet.y+S-heightScale*S*0.5+(i-1.5)*th*1.7-th/2)+'px';
        b.style.left=(f>0?pet.x+S*0.15-len:pet.x+S*0.85)+'px'; b.style.transformOrigin=(f>0?'100%':'0%')+' 50%'; }
      b.style.setProperty('--ts',String(0.55+0.1*i)); b.style.animationDelay=(i*0.04)+'s'; trail.appendChild(b); } }
  // drop any half-finished pointer drag (main asked, e.g. "Bring buddy back" or the watchdog)
  function resetInput(){ try{ if(dragId!==null) glc.releasePointerCapture(dragId); }catch{} dragId=null; dragging=false; moved=false; stopPing(); chuteOn=false; chute.style.display='none'; }

  // ---- Wardrobe: equipped costume items drawn over the sprite (anchors per buddy + pose live in cosmetics.js) ----
  const cosHost=document.createElement('div'); cosHost.id='cos'; cosHost.style.cssText='position:fixed;inset:0;z-index:12;pointer-events:none'; document.body.appendChild(cosHost);
  const cos=window.Cosmetics.createOverlay(cosHost, window.COSMETIC_ART||{});
  const cosEquip=(s)=>cos.setEquipped(s&&s.cosmetics&&s.cosmetics.equipped);
  window.buddy.onState(cosEquip); window.buddy.getState().then(cosEquip);
  // pose key for the anchor table: pixel/painted buddies use the frame on screen, blob + ghost the vector face's front or back (climbing)
  // spell shrink for the vector face: scale about the feet, composed in front of follow()'s own translate+scale (origin stays '0 0')
  function faceFx(){ if(!(fxSc<1)) return; const fx=pet.x+pet.size/2, fy=pet.y+pet.size;
    faceSvg.style.transform='translate('+fx+'px,'+fy+'px) scale('+fxSc+') translate('+(-fx)+'px,'+(-fy)+'px) '+faceSvg.style.transform; }
  function cosFrame(){ cos.frame(curChar, vectorFace?(pet.state==='climb'?'back':'front'):curPose, jelly.getBounds(), face.restWdev, face.restHdev, dpr, glc.style); }
  // ---- render loop ----
  let last=performance.now(), cleared=false, calmAcc=0;
  // The loop must never die: any exception inside a frame used to stop requestAnimationFrame
  // for good (sprite frozen/invisible while its window still blocked clicks). Always re-arm.
  let frameErrs=0;
  function frame(now){ try{ frameBody(now); }catch(err){ if(frameErrs++%300===0) console.error('frame error:', err&&err.stack||err); } requestAnimationFrame(frame); }
  function frameBody(now){ let dt=(now-last)/1000; last=now;
    if(!ready){ return; }
    // hidden: clear once, then do nothing until the pet shows again (was a GPU clear every frame)
    if(!pet.show){ cos.hide(); if(!cleared){ jelly.clear(); cleared=true; } return; }
    cleared=false;
    // GPU/CPU saver: while resting (sleeping / sitting / idle, nothing popping up) draw at
    // ~20fps instead of 60, the breathing/blink motions are slow, so it looks the same.
    // (floaters never rest: the ghost's bob + swirl must run at full rate or it looks choppy)
    const calm=!floatMode && now>boostUntil && (pet.state==='sleep'||pet.state==='sit'||pet.state==='idle') && !foodOn && !chuteOn && !speechEl.classList.contains('show') && !blinking;
    if(calm){ calmAcc+=dt; if(calmAcc<0.048){ return; } dt=calmAcc; }
    calmAcc=0; dt=Math.min(0.05,dt);
    if(['idle','sit'].includes(pet.state)){ idleAcc+=dt; if(idleAcc>2.4){ idleAcc=0; if(!(settings&&settings.reduceMotion)) jelly.squash(.08); } }
    if(CHARS[curChar]&&CHARS[curChar].poses){
      // walk cycle locked to the distance actually travelled, so the paws plant
      // instead of sliding: one frame per ~17% of body size moved.
      if(pet.state==='walk'||pet.state==='run'){
        const v=Math.abs(pet.vx||0);
        walkDist += v>1 ? v*dt : pet.size*dt*1.1;            // fallback cadence if speed unknown
        const step=pet.size*0.17;
        if(walkDist>=step){ walkDist%=step; walkFrame=(walkFrame+1)%WALK.length; swapTex(WALK[walkFrame]); }
      } else { walkDist=0; walkFrame=0; }
      // gentle breathing + the occasional ear-perk so it feels alive at rest
      if(['idle','sit'].includes(pet.state) && !(settings&&settings.reduceMotion)){ breatheT+=dt;
        if(breatheT>2.1){ breatheT=0; jelly.squash(Math.random()<0.25?0.07:0.035); } }
      // blink now and then while facing us / sitting (not mid-walk)
      // hero: gentle cape sway while standing (two idle frames)
      if((curChar==='hero'||curChar==='wizard') && !blinking && (curPose==='idle'||curPose==='idle2') && pet.state!=='sleep'){ swayT+=dt; if(swayT>0.55){ swayT=0; swayIdx^=1; swapTex(swayIdx?'idle2':'idle'); } }
      if(!blinking && pet.state!=='sleep' && blinkKey(curPose) && poseImgs[curChar+'/'+blinkKey(curPose)]){ blinkT+=dt;
        if(blinkT>blinkWait){ blinkT=0; blinkWait=2.4+Math.random()*3.6; doBlink(); if(Math.random()<0.3) setTimeout(doBlink,230); } }
    }
    if(vectorFace){ face.idle(dt); face.step(dt); } jelly.step(dt);
    const bob=floatMode?Math.sin(now/650)*pet.size*0.05:0;
    // main moves the window in whole pixels; it sends the sub-pixel remainder (fx, fy) so the sprite glides instead of stepping
    const sx=pet.fx||0, sy=pet.fy||0;
    jelly.setOrigin((pet.x+sx+pet.size/2)*dpr, (pet.y+sy+pet.size+bob)*dpr);
    jelly.draw(); if(vectorFace && jelly._placed){ face.follow(jelly.getBounds()); faceFx(); } cosFrame();
    // the line sits at a fixed spot over the resting sprite (not tied to the wobbling jelly bounds) so it never shakes
    if(speechEl.classList.contains('show')){ speechEl.style.left=Math.round(pet.x+pet.size/2)+'px'; speechEl.style.top=Math.round(pet.y+pet.size-heightScale*pet.size-12)+'px'; }
    if(chuteOn){ const cw=pet.size*1.35, chh=cw*1.081, sway=Math.sin(now/420)*7;
      chute.style.width=cw+'px'; chute.style.left=(pet.x+pet.size/2-cw/2+sway)+'px'; chute.style.top=(pet.y-chh+pet.size*0.18)+'px'; }
    if(foodOn){ foodT+=dt; const dur=0.62, p=Math.min(1,foodT/dur), fw=pet.size*0.5;
      const sy=pet.y-pet.size*1.05, ey=pet.y+pet.size*0.40; // drop from above into the mouth
      food.style.width=fw+'px'; food.style.left=(pet.x+pet.size/2-fw/2)+'px'; food.style.top=(sy+(ey-sy)*(p*p))+'px';
      food.style.opacity=String(p>0.82?Math.max(0,1-(p-0.82)/0.18):1);
      if(p>=1){ foodOn=false; food.style.display='none'; food.style.opacity='1'; jelly.squash(.5); transient('love',900); face.talk(.7);
        const c=petScreenCss(); spawn('✨','heart',c.x,c.y+pet.size*0.2); speak('fed'); } }
  }
  requestAnimationFrame(frame);

  // ---- input (this window is interactive only when the cursor is over the pet) ----
  const PAD_MIN=14, PAD_K=0.28;   // hit margin round the sprite (keep in step with main.js hitPad)
  let dragId=null,lastPt=null,moved=false,downAt=0;
  function overPet(x,y){ const pad=Math.max(PAD_MIN, pet.size*PAD_K); return pet.show && x>=pet.x-pad && x<=pet.x+pet.size+pad && y>=pet.y-pad && y<=pet.y+pet.size+pad; }
  // tell main the mouse reaches this page (throttled): if the window is meant to capture the mouse and these stop, main heals it
  let seenAt=0; window.addEventListener('mousemove',()=>{ const t=performance.now(); if(t-seenAt>150){ seenAt=t; try{ window.buddy.petSeen(satArg); }catch{} } },{passive:true});
  window.addEventListener('pointerdown',(e)=>{ if(e.button===2) return; if(!overPet(e.clientX,e.clientY)) return;
    dragId=e.pointerId; moved=false; downAt=Date.now(); lastPt={x:e.clientX,y:e.clientY};
    try{glc.setPointerCapture(e.pointerId);}catch{} e.preventDefault(); });
  // heartbeat to main while a drag is live: if it stops (lost pointerup, reload) the watchdog releases the sprite
  let pingT=0; function startPing(){ stopPing(); pingT=setInterval(()=>{ try{ window.buddy.petDragPing(satArg); }catch{} },400); } function stopPing(){ clearInterval(pingT); pingT=0; }
  window.addEventListener('pointermove',(e)=>{ if(dragId!==e.pointerId) return;
    // button already up but we never saw pointerup (released outside the window / over another app): finish the drag now
    if(e.buttons===0 && e.pointerType==='mouse'){ endDrag(e); return; }
    if(!moved&&Math.hypot(e.clientX-lastPt.x,e.clientY-lastPt.y)>5){ moved=true; dragging=true; window.buddy.petGrab(satArg); startPing(); }
    if(dragging) window.buddy.petDrag(e.clientX,e.clientY); lastPt={x:e.clientX,y:e.clientY}; });
  function endDrag(e){ if(dragId!==e.pointerId) return; try{glc.releasePointerCapture(e.pointerId);}catch{}
    if(dragging){ dragging=false; stopPing(); window.buddy.petRelease(satArg); } else if(Date.now()-downAt<300){ window.buddy.petTap(satArg); } dragId=null; moved=false; }
  window.addEventListener('pointerup',endDrag); window.addEventListener('pointercancel',endDrag); glc.addEventListener('lostpointercapture',endDrag);
  // safety: if the pointer is ever lost mid-drag (passthrough flips, focus loss), release
  window.addEventListener('blur',()=>{ if(dragId!==null){ if(dragging){ dragging=false; stopPing(); window.buddy.petRelease(satArg); } dragId=null; moved=false; } });
  // WebGL context lost (GPU reset, driver update, out of memory): the sprite would vanish while its window kept blocking clicks. Reload to rebuild.
  // Reloads back off exponentially and stop after a few tries (a broken GPU must not loop forever; the tray still works).
  function reloadGuarded(){ let n=0, t=0; try{ n=+sessionStorage.getItem('sbReloads')||0; t=+sessionStorage.getItem('sbReloadT')||0; if(Date.now()-t>120000) n=0; }catch{}
    const g=window.Backoff.createGovernor({base:1500,max:30000,cap:4}); let r; for(let i=0;i<=n;i++) r=g.next(Date.now());
    if(r.give) return; try{ sessionStorage.setItem('sbReloads',String(n+1)); sessionStorage.setItem('sbReloadT',String(Date.now())); }catch{}
    setTimeout(()=>location.reload(),r.delay); }
  glc.addEventListener('webglcontextlost',(e)=>{ e.preventDefault(); ready=false; reloadGuarded(); });
  glc.addEventListener('webglcontextrestored',()=>reloadGuarded());
  window.addEventListener('dblclick',(e)=>{ if(overPet(e.clientX,e.clientY)) window.buddy.openSettings(); });
})();

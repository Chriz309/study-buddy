/* Renderer bootstrap: builds the active character, wires the engine to the
   main-process state/cursor/display streams, and handles direct input
   (drag, pat, double-click, right-click menu). Overlay is click-through
   except over the pet (or while the menu is open). */
(function () {
  const $ = (s) => document.querySelector(s);
  const petEl = $('#pet'), sprite = $('#sprite'), speechEl = $('#speech'),
        fx = $('#fx'), menuEl = $('#menu'), backdrop = $('#backdrop');

  let state = null, activeId = 'blob', art = window.CHAR_ART.blob;
  let overPet = false, menuOpen = false, dragging = false;
  let speechTimer = 0, zzzTimer = 0, lastDisplays = null;

  // ---- character assembly ----
  function applyCharacter(id) {
    const a = window.CHAR_ART[id] || window.CHAR_ART.blob;
    activeId = (window.CHAR_ART[id] ? id : 'blob'); art = a;
    sprite.innerHTML = a.svg;
    petEl.className = 'char-' + activeId;
    Engine.setMoveType(a.move);
    speak('greet', true);
  }

  // ---- settings ----
  function applySettings(s) {
    if (!s) return;
    document.documentElement.style.setProperty('--size', (s.size || 120) + 'px');
    Engine.setSize(s.size || 120);
    Engine.setSettings({ speed: s.speed, personality: s.personality, mischief: s.mischief });
    document.body.classList.toggle('rm', !!s.reduceMotion);
    if (lastDisplays) Engine.setWorld(lastDisplays, { roamAll: !!s.roamMonitors });
  }

  // ---- speech (chatter-aware; floaters talk less) ----
  function line(kind) {
    const pool = (art.lines && (art.lines[kind] || art.lines.idle)) || ['...'];
    const name = (state && state.catalog && (state.catalog.find(c => c.id === activeId) || {}).name) || 'Buddy';
    return pool[Math.floor(Math.random() * pool.length)].replace(/\{name\}/g, name);
  }
  function speak(kind, force) {
    const s = state && state.settings;
    if (s && s.speech === false && !force) return;
    if (!force && (kind === 'idle' || kind === 'study')) {
      let chatter = (s && typeof s.chatter === 'number') ? s.chatter : 0.6;
      if (activeId === 'boo') chatter *= 0.4;      // the ghost is quieter now
      if (Math.random() > chatter) return;
    }
    speechEl.textContent = line(kind);
    speechEl.hidden = false;
    requestAnimationFrame(() => speechEl.classList.add('show'));
    Engine.talk(Math.min(1600, 500 + speechEl.textContent.length * 45));
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => {
      speechEl.classList.remove('show');
      setTimeout(() => { if (!speechEl.classList.contains('show')) speechEl.hidden = true; }, 220);
    }, 2400 + Math.random() * 1200);
  }

  // ---- particles ----
  function spawnAt(txt, cls, atX, atY) {
    const el = document.createElement('div'); el.className = cls; el.textContent = txt;
    if (atX == null) { const b = petEl.getBoundingClientRect(); atX = b.left + b.width * (0.3 + Math.random() * 0.4); atY = b.top + b.height * 0.2; }
    el.style.left = atX + 'px'; el.style.top = atY + 'px';
    fx.appendChild(el); setTimeout(() => el.remove(), 1900);
  }
  function hearts() { spawnAt('❤', 'heart'); setTimeout(() => spawnAt('❤', 'heart'), 140); }

  // ---- engine hooks ----
  Engine.init(petEl, {
    say: (k) => speak(k),
    hearts,
    splash: (x, y) => { spawnAt('💦', 'splash', x - 12, y); },
    onState: (st) => { clearInterval(zzzTimer); if (st === 'sleep') zzzTimer = setInterval(() => spawnAt('z', 'zzz'), 900); },
  });

  // ---- IPC ----
  window.buddy.onDisplays((d) => { lastDisplays = d; Engine.setWorld(d, { roamAll: !!(state && state.settings && state.settings.roamMonitors) }); });
  window.buddy.onCursor((p) => {
    Engine.setCursor(p);
    const hit = Engine.hitTest(p.x, p.y) || menuOpen;
    if (hit !== overPet) { overPet = hit; window.buddy.setInteractive(hit); }
  });
  window.buddy.onSparks(() => {});
  window.buddy.onState((s) => {
    const first = !state, prevActive = state && state.active;
    state = s; applySettings(s.settings);
    if (first || s.active !== prevActive) applyCharacter(s.active);
  });

  // ---- direct input ----
  let dragId = null, lastPt = null, moved = false, downAt = 0;
  petEl.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;
    dragId = e.pointerId; moved = false; downAt = Date.now(); lastPt = { x: e.clientX, y: e.clientY };
    try { petEl.setPointerCapture(e.pointerId); } catch {} e.preventDefault();
  });
  petEl.addEventListener('pointermove', (e) => {
    if (dragId !== e.pointerId) return;
    const dx = e.clientX - lastPt.x, dy = e.clientY - lastPt.y;
    if (!moved && Math.hypot(dx, dy) > 5) { moved = true; dragging = true; Engine.grab(); }
    if (dragging) Engine.dragTo(e.clientX, e.clientY);
    lastPt = { x: e.clientX, y: e.clientY };
  });
  function endDrag(e) {
    if (dragId !== e.pointerId) return;
    try { petEl.releasePointerCapture(e.pointerId); } catch {}
    if (dragging) { dragging = false; Engine.release(); }
    else if (Date.now() - downAt < 300) { Engine.petted(); window.buddy.earn(1); }
    dragId = null;
  }
  petEl.addEventListener('pointerup', endDrag);
  petEl.addEventListener('pointercancel', endDrag);
  petEl.addEventListener('dblclick', () => window.buddy.openSettings());

  // ---- mini context menu (secondary to the tray) ----
  petEl.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(e.clientX, e.clientY); });
  function openMenu(x, y) {
    const paused = state && state.settings && state.settings.paused;
    const items = [
      ['🪄  Pat', () => { Engine.petted(); window.buddy.earn(1); }],
      ['💤  Nap', () => Engine.nap()],
      ['📂  Open the Drive', () => window.buddy.openDrive()],
      ['🛒  Shop & Settings', () => window.buddy.openSettings()],
      ['sep'],
      [paused ? '▶  Resume idle points' : '⏸  Pause idle points', () => window.buddy.toggle('paused')],
      ['🙈  Hide (show again from the ⚡ tray icon)', () => window.buddy.hideBuddy()],
      ['sep'],
      ['✖  Quit', () => window.buddy.quit()],
    ];
    menuEl.innerHTML = '';
    for (const it of items) {
      if (it[0] === 'sep') { const d = document.createElement('div'); d.className = 'sep'; menuEl.appendChild(d); continue; }
      const b = document.createElement('button'); b.textContent = it[0];
      b.addEventListener('click', () => { closeMenu(); it[1](); });
      menuEl.appendChild(b);
    }
    menuEl.hidden = false; menuOpen = true; backdrop.classList.add('on');
    window.buddy.setInteractive(true);
    const vw = window.innerWidth, vh = window.innerHeight;
    menuEl.style.left = Math.min(x, vw - menuEl.offsetWidth - 8) + 'px';
    menuEl.style.top  = Math.min(y, vh - menuEl.offsetHeight - 8) + 'px';
  }
  function closeMenu() { menuEl.hidden = true; menuOpen = false; backdrop.classList.remove('on'); }
  backdrop.addEventListener('pointerdown', closeMenu);
  backdrop.addEventListener('contextmenu', (e) => { e.preventDefault(); closeMenu(); });

  // ---- boot ----
  window.buddy.getState().then((s) => { state = s; applySettings(s.settings); applyCharacter(s.active || 'blob'); });
})();

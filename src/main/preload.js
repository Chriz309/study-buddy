const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  // state
  getState:      () => ipcRenderer.invoke('state:get'),
  onState:       (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onSparks:      (cb) => ipcRenderer.on('sparks', (_e, n) => cb(n)),
  onStudy:       (cb) => ipcRenderer.on('study', (_e, s) => cb(s)),   // study timer tick: { phase, paused, remainingMs, totalMs }

  studyCmd:      (action, preset) => ipcRenderer.invoke('study:cmd', action, preset),   // start(preset '25/5'|'50/10') | pause | resume | skip | stop, validated in main

  // pet rendering stream (per-display overlay)
  onPet:         (cb) => ipcRenderer.on('pet', (_e, p) => cb(p)),
  onPetEvent:    (cb) => ipcRenderer.on('petEvent', (_e, e) => cb(e)),

  // pet input (coords local to this window's display)
  // an optional `sat` (character id) addresses a multi-pet satellite window; without it the message is for the lead, as before
  petGrab:       (sat) => ipcRenderer.send('pet:grab', sat ? { sat } : undefined),
  petDrag:       (x, y) => ipcRenderer.send('pet:drag', { x, y }),
  petDragPing:   (sat) => ipcRenderer.send('pet:dragPing', sat ? { sat } : undefined),
  petRelease:    (sat) => ipcRenderer.send('pet:release', sat ? { sat } : undefined),
  petTap:        (sat) => ipcRenderer.send('pet:tap', sat ? { sat } : undefined),
  petSpeaking:   (ms, sat) => ipcRenderer.send('pet:speaking', ms, sat ? { sat } : undefined),
  petSeen:       (sat) => ipcRenderer.send('pet:seen', sat ? { sat } : undefined),

  // mutations (settings window)
  patchSettings: (patch) => ipcRenderer.invoke('settings:patch', patch),
  unlock:        (id) => ipcRenderer.invoke('buddy:unlock', id),
  roll:          () => ipcRenderer.invoke('buddy:roll'),
  setActive:     (id) => ipcRenderer.invoke('buddy:setActive', id),
  rename:        (id, name) => ipcRenderer.invoke('buddy:rename', id, name),
  setColor:      (id, hue) => ipcRenderer.invoke('buddy:setColor', id, hue),
  devAddSparks:  () => ipcRenderer.invoke('dev:addSparks'),
  devSell:       (id) => ipcRenderer.invoke('dev:sell', id),
  hatchDone:     () => ipcRenderer.send('hatch:done'),
  earn:          (n) => ipcRenderer.invoke('buddy:earn', n),
  feed:          (id) => ipcRenderer.invoke('buddy:feed', id),
  buyCosmetic:   (id) => ipcRenderer.invoke('cosmetic:buy', id),
  equipCosmetic: (charId, slot, id) => ipcRenderer.invoke('cosmetic:equip', charId, slot, id),

  // app actions
  openSettings:  () => ipcRenderer.send('app:openSettings'),
  toggle:        (key) => ipcRenderer.send('app:toggle', key),
  hideBuddy:     () => ipcRenderer.send('app:hideBuddy'),
  showBuddy:     () => ipcRenderer.send('app:showBuddy'),
  openEmail:     () => ipcRenderer.send('app:openEmail'),
  openDrive:     () => ipcRenderer.send('app:openDrive'),
  openWhatsApp:  () => ipcRenderer.send('app:openWhatsApp'),
  quit:          () => ipcRenderer.send('app:quit'),

  // updates
  checkUpdate:   () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  dismissUpdate: () => ipcRenderer.send('update:later'),
});

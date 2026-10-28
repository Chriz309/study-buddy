const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  // state
  getState:      () => ipcRenderer.invoke('state:get'),
  onState:       (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onSparks:      (cb) => ipcRenderer.on('sparks', (_e, n) => cb(n)),

  // pet rendering stream (per-display overlay)
  onPet:         (cb) => ipcRenderer.on('pet', (_e, p) => cb(p)),
  onPetEvent:    (cb) => ipcRenderer.on('petEvent', (_e, e) => cb(e)),

  // pet input (coords local to this window's display)
  petGrab:       () => ipcRenderer.send('pet:grab'),
  petDrag:       (x, y) => ipcRenderer.send('pet:drag', { x, y }),
  petRelease:    () => ipcRenderer.send('pet:release'),
  petTap:        () => ipcRenderer.send('pet:tap'),

  // mutations (settings window)
  patchSettings: (patch) => ipcRenderer.invoke('settings:patch', patch),
  unlock:        (id) => ipcRenderer.invoke('buddy:unlock', id),
  roll:          () => ipcRenderer.invoke('buddy:roll'),
  setActive:     (id) => ipcRenderer.invoke('buddy:setActive', id),
  earn:          (n) => ipcRenderer.invoke('buddy:earn', n),
  feed:          (id) => ipcRenderer.invoke('buddy:feed', id),

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

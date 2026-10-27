const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  // state
  getState:       () => ipcRenderer.invoke('state:get'),
  onState:        (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onSparks:       (cb) => ipcRenderer.on('sparks', (_e, n) => cb(n)),
  onCursor:       (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onDisplays:     (cb) => ipcRenderer.on('displays', (_e, d) => cb(d)),

  // mutations
  patchSettings:  (patch) => ipcRenderer.invoke('settings:patch', patch),
  unlock:         (id) => ipcRenderer.invoke('buddy:unlock', id),
  setActive:      (id) => ipcRenderer.invoke('buddy:setActive', id),
  earn:           (n) => ipcRenderer.invoke('buddy:earn', n),
  feed:           (id) => ipcRenderer.invoke('buddy:feed', id),

  // overlay plumbing
  setInteractive: (on) => ipcRenderer.send('overlay:interactive', on),

  // app actions
  openSettings:   () => ipcRenderer.send('app:openSettings'),
  toggle:         (key) => ipcRenderer.send('app:toggle', key),
  hideBuddy:      () => ipcRenderer.send('app:hideBuddy'),
  showBuddy:      () => ipcRenderer.send('app:showBuddy'),
  openEmail:      () => ipcRenderer.send('app:openEmail'),
  openDrive:      () => ipcRenderer.send('app:openDrive'),
  openWhatsApp:   () => ipcRenderer.send('app:openWhatsApp'),
  quit:           () => ipcRenderer.send('app:quit'),

  // updates
  checkUpdate:    () => ipcRenderer.invoke('update:check'),
  installUpdate:  () => ipcRenderer.invoke('update:install'),
});

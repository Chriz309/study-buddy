'use strict';
// The overlay page can only receive a scene, say it is ready and report an error. It has no other access.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mischief', {
  onScene: (cb) => ipcRenderer.on('mischief:scene', (_e, s) => cb(s)),
  onGo: (cb) => ipcRenderer.on('mischief:go', (_e, g) => cb(g)),
  ready: () => ipcRenderer.send('mischief:ready'),
  error: (m) => ipcRenderer.send('mischief:error', String(m).slice(0, 300)),
});

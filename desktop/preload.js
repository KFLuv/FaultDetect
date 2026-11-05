const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('faultDetectDesktop', {
  platform: process.platform,
  restartBackend: () => ipcRenderer.invoke('backend:restart')
})

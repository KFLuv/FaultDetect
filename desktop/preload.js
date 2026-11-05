const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('faultDetectDesktop', {
  platform: process.platform,
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  openCapture: (startUrl) => ipcRenderer.invoke('capture:open', startUrl),
  getCaptureState: () => ipcRenderer.invoke('capture:state'),
  setCaptureRecording: (enabled) => ipcRenderer.invoke('capture:set-recording', enabled),
  closeCapture: () => ipcRenderer.invoke('capture:close'),
  clearCapture: () => ipcRenderer.invoke('capture:clear'),
  onCaptureUpdated: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('capture:updated', listener)
    return () => ipcRenderer.removeListener('capture:updated', listener)
  }
})

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('faultDetectDesktop', {
  platform: process.platform,
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  openCapture: (startUrl) => ipcRenderer.invoke('capture:open', startUrl),
  getCaptureState: () => ipcRenderer.invoke('capture:state'),
  setCaptureBounds: (bounds) => ipcRenderer.invoke('capture:set-bounds', bounds),
  setCaptureRecording: (enabled) => ipcRenderer.invoke('capture:set-recording', enabled),
  captureCommand: (action) => ipcRenderer.invoke('capture:command', action),
  closeCapture: () => ipcRenderer.invoke('capture:close'),
  clearCapture: () => ipcRenderer.invoke('capture:clear'),
  onCaptureUpdated: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('capture:updated', listener)
    return () => ipcRenderer.removeListener('capture:updated', listener)
  }
})

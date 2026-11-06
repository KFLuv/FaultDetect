const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('faultDetectDesktop', {
  platform: process.platform,
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  openCapture: (startUrl) => ipcRenderer.invoke('capture:open', startUrl),
  getCaptureState: () => ipcRenderer.invoke('capture:state'),
  registerCaptureWebview: (webContentsId) => ipcRenderer.invoke('capture:register-webview', webContentsId),
  setCaptureOptions: (options) => ipcRenderer.invoke('capture:set-options', options),
  setCaptureRecording: (enabled) => ipcRenderer.invoke('capture:set-recording', enabled),
  noteCaptureAction: (payload) => ipcRenderer.invoke('capture:note-action', payload),
  closeCapture: () => ipcRenderer.invoke('capture:close'),
  clearCapture: () => ipcRenderer.invoke('capture:clear'),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  onCaptureUpdated: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('capture:updated', listener)
    return () => ipcRenderer.removeListener('capture:updated', listener)
  }
})

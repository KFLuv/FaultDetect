const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('faultDetectDesktop', {
  platform: process.platform
})

const { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { createCaptureService } = require('./capture')

const PORT = 8000
const BASE_URL = `http://127.0.0.1:${PORT}`
let mainWindow = null
let backend = null
let spawnedBackend = false
let captureService = null

function resourcePath(...parts) {
  return path.join(process.resourcesPath, ...parts)
}

function jarPath() {
  return app.isPackaged
    ? resourcePath('backend', 'fault-detect-system.jar')
    : path.join(__dirname, '..', 'java-backend', 'target', 'fault-detect-system.jar')
}

function javaPath() {
  const bundled = app.isPackaged
    ? resourcePath('jre', 'bin', 'javaw.exe')
    : path.join(__dirname, 'build', 'jre', 'bin', 'javaw.exe')
  return fs.existsSync(bundled) ? bundled : 'javaw'
}

function dataDir() {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Local')
  return path.join(localAppData, 'FaultDetectSystem', 'data')
}

function backendArgs(jar) {
  return [
    '-jar',
    jar,
    `--server.port=${PORT}`,
    '--server.address=127.0.0.1'
  ]
}

function startBackend() {
  if (backend) return
  const jar = jarPath()
  const java = javaPath()
  fs.mkdirSync(dataDir(), { recursive: true })
  const env = {
    ...process.env,
    FAULT_DETECT_DATA_DIR: dataDir()
  }
  backend = spawn(java, backendArgs(jar), {
    cwd: path.dirname(jar),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env
  })
  spawnedBackend = true
  backend.stdout.on('data', data => process.stdout.write(`[backend] ${data}`))
  backend.stderr.on('data', data => process.stderr.write(`[backend] ${data}`))
  backend.on('error', error => {
    backend = null
    console.error('[backend] failed to start', error)
  })
  backend.on('exit', code => {
    console.log('[backend] exited', code)
    backend = null
    spawnedBackend = false
  })
}

function stopBackend() {
  if (spawnedBackend && backend && !backend.killed) {
    backend.kill()
  }
  backend = null
  spawnedBackend = false
}

async function restartBackend() {
  stopBackend()
  for (let i = 0; i < 20; i += 1) {
    if (!(await ping())) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!(await ping())) startBackend()
  return waitForBackend(45000)
}

function ping() {
  return new Promise(resolve => {
    const req = http.get(`${BASE_URL}/api/health`, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        try {
          const data = JSON.parse(body)
          resolve(response.statusCode === 200 && data.status === 'ok')
        } catch {
          resolve(false)
        }
      })
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1500, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForBackend(timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await ping()) return true
    await new Promise(resolve => setTimeout(resolve, 700))
  }
  return false
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: 'FaultDetect',
    backgroundColor: '#f3f4f6',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  })

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!/^https?:\/\//i.test(params.src || '')) {
      event.preventDefault()
      return
    }
    webPreferences.preload = path.join(__dirname, 'capture-preload.js')
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.loadURL(BASE_URL)
  mainWindow.on('closed', () => {
    captureService?.close()
    mainWindow = null
  })
}

function publishCaptureState(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('capture:updated', state)
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    captureService = createCaptureService({ onUpdate: publishCaptureState })
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'geolocation')
    })

    app.on('web-contents-created', (_event, contents) => {
      if (captureService.ownsSession(contents.session)) {
        contents.setWindowOpenHandler(({ url }) => {
          if (/^https?:\/\//i.test(url)) contents.loadURL(url).catch(() => {})
          return { action: 'deny' }
        })
        return
      }
      contents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith(BASE_URL)) return { action: 'allow' }
        if (/^https?:\/\//i.test(url)) shell.openExternal(url)
        return { action: 'deny' }
      })
      contents.on('will-navigate', (event, url) => {
        if (!url.startsWith(BASE_URL)) {
          event.preventDefault()
          if (/^https?:\/\//i.test(url)) shell.openExternal(url)
        }
      })
    })

    if (!(await ping())) startBackend()
    const ready = await waitForBackend()
    if (!ready) {
      dialog.showErrorBox(
        'FaultDetect 启动失败',
        '本地服务未能在 2 分钟内启动。请检查 8000 端口、内置 JRE 和运行数据目录。'
      )
      app.quit()
      return
    }
    createWindow()
  })

  ipcMain.handle('backend:restart', () => restartBackend())
  ipcMain.handle('clipboard:write', (_event, text) => {
    clipboard.writeText(String(text || ''))
    return { ok: true }
  })
  ipcMain.handle('capture:open', (_event, startUrl) => captureService.open(startUrl))
  ipcMain.handle('capture:state', () => captureService.state())
  ipcMain.handle('capture:set-recording', (_event, enabled) => captureService.setRecording(enabled))
  ipcMain.handle('capture:close', () => {
    captureService.close()
    return { ok: true }
  })
  ipcMain.handle('capture:clear', () => captureService.clear())
  ipcMain.handle('capture:note-action', (_event, payload) => captureService.noteUiAction(payload))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('window-all-closed', () => {
    stopBackend()
    app.quit()
  })
  app.on('before-quit', stopBackend)
}

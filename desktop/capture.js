const { BrowserWindow, Menu, session } = require('electron')
const path = require('path')

const CAPTURE_PARTITION = 'faultdetect-capture-session'
const MAX_REQUESTS = 80

function normalizeSiteUrl(value) {
  const input = String(value || '').trim()
  if (!input) return ''
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`
  try {
    const parsed = new URL(withScheme)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : ''
  } catch {
    return ''
  }
}

function safeDisplayUrl(raw) {
  try {
    const parsed = new URL(raw)
    const path = parsed.pathname.length > 150 ? parsed.pathname.slice(0, 147) + '...' : parsed.pathname
    return parsed.origin + path
  } catch {
    return '目标地址'
  }
}

function usableHeaders(headers) {
  const result = {}
  for (const [rawName, rawValue] of Object.entries(headers || {})) {
    const name = String(rawName)
    const lower = name.toLowerCase()
    const allowed = lower === 'authorization'
      || lower === 'cookie'
      || (lower.startsWith('x-') && !['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'].includes(lower))
    if (allowed && rawValue != null) result[name] = String(rawValue)
  }
  return result
}

function createCaptureService({ onUpdate }) {
  let captureSession = null
  let sequence = 0
  let requests = []
  let recording = false
  let lastUiAction = null
  const pendingHeaders = new Map()

  function captureWindows() {
    if (!captureSession) return []
    return BrowserWindow.getAllWindows().filter(window => window.webContents.session === captureSession)
  }

  function state() {
    return {
      active: captureWindows().length > 0,
      recording,
      requests
    }
  }

  function publish() {
    onUpdate(state())
  }

  function ownsSession(candidate) {
    return Boolean(captureSession && candidate === captureSession)
  }

  function ownsContents(contents) {
    return Boolean(captureSession && contents?.session === captureSession)
  }

  function noteUiAction(payload) {
    const label = String(payload?.label || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const occurredAt = Number(payload?.occurredAt || 0)
    if (!label || !occurredAt) return
    lastUiAction = { label, occurredAt }
  }

  function allowWindowOpen(url) {
    return /^https?:\/\//i.test(url)
      ? {
          action: 'allow',
          overrideBrowserWindowOptions: {
            minWidth: 720,
            minHeight: 560,
            autoHideMenuBar: true,
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true
            }
          }
        }
      : { action: 'deny' }
  }

  function addRequest(details, errorMessage) {
    const method = String(details.method || 'GET').toUpperCase()
    const resourceType = String(details.resourceType || '')
    const statusCode = Number(details.statusCode || 0)
    const isFailure = Boolean(errorMessage) || statusCode >= 400
    const isApi = resourceType === 'xhr' || resourceType === 'fetch'
    if (!isApi && !(resourceType === 'document' && isFailure)) return
    if (!/^https?:\/\//i.test(details.url || '')) return

    const parsed = (() => {
      try { return new URL(details.url) } catch { return null }
    })()
    const isFaultDetectLocal = parsed
      && ['127.0.0.1', 'localhost'].includes(parsed.hostname)
      && parsed.port === '8000'
    if (isFaultDetectLocal && !parsed.pathname.startsWith('/demo/')) return
    const dedupeKey = `${method} ${details.url}`
    const actionLabel = lastUiAction && Date.now() - lastUiAction.occurredAt <= 30000
      ? lastUiAction.label
      : ''
    const item = {
      id: ++sequence,
      key: dedupeKey,
      method,
      url: details.url,
      displayUrl: safeDisplayUrl(details.url),
      host: parsed?.host || '',
      path: parsed?.pathname || '/',
      statusCode: statusCode || null,
      resourceType,
      error: errorMessage || '',
      actionLabel,
      isFailure,
      replayable: method === 'GET',
      headers: pendingHeaders.get(details.id) || {},
      capturedAt: new Date().toISOString()
    }
    requests = [item, ...requests.filter(existing => existing.key !== dedupeKey)].slice(0, MAX_REQUESTS)
    publish()

    const hasCookie = Object.keys(item.headers).some(name => name.toLowerCase() === 'cookie')
    if (!hasCookie && captureSession) {
      captureSession.cookies.get({ url: details.url })
        .then(cookies => {
          if (!cookies.length) return
          const current = requests.find(candidate => candidate.key === dedupeKey)
          if (!current) return
          current.headers = {
            ...current.headers,
            Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
          }
          requests = [...requests]
          publish()
        })
        .catch(() => {})
    }
  }

  function ensureSession() {
    if (captureSession) return captureSession
    captureSession = session.fromPartition(CAPTURE_PARTITION)
    captureSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    captureSession.webRequest.onBeforeSendHeaders(
      { urls: ['http://*/*', 'https://*/*'] },
      (details, callback) => {
        if (recording) {
          pendingHeaders.set(details.id, usableHeaders(details.requestHeaders))
        }
        callback({ requestHeaders: details.requestHeaders })
      }
    )
    captureSession.webRequest.onCompleted(
      { urls: ['http://*/*', 'https://*/*'] },
      details => {
        if (recording) addRequest(details)
        pendingHeaders.delete(details.id)
      }
    )
    captureSession.webRequest.onErrorOccurred(
      { urls: ['http://*/*', 'https://*/*'] },
      details => {
        if (recording && !['net::ERR_ABORTED', 'net::ERR_BLOCKED_BY_CLIENT'].includes(details.error)) {
          addRequest(details, details.error || '请求失败')
        }
        pendingHeaders.delete(details.id)
      }
    )
    return captureSession
  }

  function buildMenu() {
    const activeWindow = () => BrowserWindow.getFocusedWindow() || captureWindows()[0]
    return Menu.buildFromTemplate([
      {
        label: '采集',
        submenu: [
          {
            label: recording ? '完成本次采集并返回' : '开始记录本次问题',
            accelerator: 'F8',
            click: () => {
              if (recording) {
                setRecording(false)
                close()
              } else {
                setRecording(true)
              }
            }
          },
          { type: 'separator' },
          {
            label: '返回上一页',
            accelerator: 'Alt+Left',
            click: () => activeWindow()?.webContents.canGoBack() && activeWindow().webContents.goBack()
          },
          {
            label: '前进',
            accelerator: 'Alt+Right',
            click: () => activeWindow()?.webContents.canGoForward() && activeWindow().webContents.goForward()
          },
          {
            label: '刷新',
            accelerator: 'F5',
            click: () => activeWindow()?.webContents.reload()
          },
          { type: 'separator' },
          { label: '关闭采集窗口', accelerator: 'Ctrl+W', click: close }
        ]
      }
    ])
  }

  function updateWindowChrome() {
    for (const window of captureWindows()) {
      if (window.isDestroyed()) continue
      window.setTitle(recording ? '● 正在记录本次问题 · FaultDetect' : '待开始记录 · FaultDetect')
      if (window === BrowserWindow.getFocusedWindow()) window.setMenu(buildMenu())
    }
  }

  function setRecording(enabled) {
    const next = Boolean(enabled)
    if (next && !recording) {
      requests = []
      pendingHeaders.clear()
      lastUiAction = null
    }
    recording = next
    updateWindowChrome()
    publish()
    if (recording) captureWindows()[0]?.focus()
    return state()
  }

  function open(rawUrl) {
    const targetUrl = normalizeSiteUrl(rawUrl)
    if (!targetUrl) {
      return { ok: false, error: '请输入有效的业务系统地址，例如 https://oa.example.com' }
    }

    ensureSession()
    const existing = captureWindows()[0]
    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      existing.loadURL(targetUrl).catch(() => {})
      return { ok: true }
    }

    requests = []
    recording = false
    lastUiAction = null
    pendingHeaders.clear()
    const window = new BrowserWindow({
      width: 1280,
      height: 860,
      minWidth: 900,
      minHeight: 640,
      title: 'FaultDetect · 业务系统采集窗口',
      backgroundColor: '#f3f4f6',
      autoHideMenuBar: false,
      webPreferences: {
        preload: path.join(__dirname, 'capture-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: CAPTURE_PARTITION
      }
    })
    window.setMenu(buildMenu())
    window.webContents.on('page-title-updated', event => event.preventDefault())
    window.on('focus', updateWindowChrome)
    window.on('closed', () => {
      recording = false
      pendingHeaders.clear()
      publish()
    })
    window.loadURL(targetUrl).catch(error => {
      if (!window.isDestroyed()) {
        window.setTitle(`无法打开业务系统：${error.message || '加载失败'}`)
      }
    })
    publish()
    return { ok: true }
  }

  function close() {
    for (const window of captureWindows()) {
      if (!window.isDestroyed()) window.close()
    }
  }

  function clear() {
    requests = []
    pendingHeaders.clear()
    publish()
    return { ok: true }
  }

  return {
    open,
    close,
    clear,
    state,
    setRecording,
    ownsSession,
    ownsContents,
    noteUiAction,
    allowWindowOpen
  }
}

module.exports = { createCaptureService }

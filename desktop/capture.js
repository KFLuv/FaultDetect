const { WebContentsView, session } = require('electron')
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

function createCaptureService({ onUpdate, getMainWindow }) {
  let captureSession = null
  let captureView = null
  let sequence = 0
  let requests = []
  let recording = false
  let lastUiAction = null
  let viewBounds = { x: 0, y: 72, width: 1200, height: 800 }
  const pendingHeaders = new Map()

  function active() {
    return Boolean(captureView && !captureView.webContents.isDestroyed())
  }

  function state() {
    return {
      active: active(),
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

  function setBounds(bounds) {
    const next = {
      x: Math.max(0, Math.round(Number(bounds?.x) || 0)),
      y: Math.max(0, Math.round(Number(bounds?.y) || 0)),
      width: Math.max(1, Math.round(Number(bounds?.width) || 1)),
      height: Math.max(1, Math.round(Number(bounds?.height) || 1))
    }
    viewBounds = next
    if (active()) captureView.setBounds(next)
    return { ok: true }
  }

  function attachView(targetUrl) {
    const window = getMainWindow()
    if (!window || window.isDestroyed()) {
      return { ok: false, error: 'FaultDetect 主窗口不可用' }
    }
    captureView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'capture-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: CAPTURE_PARTITION
      }
    })
    captureView.setBackgroundColor('#ffffff')
    captureView.setBounds(viewBounds)
    window.contentView.addChildView(captureView)
    captureView.webContents.loadURL(targetUrl).catch(error => {
      publish()
      console.error('capture view load failed', error)
    })
    return { ok: true }
  }

  function setRecording(enabled) {
    const next = Boolean(enabled)
    if (next && !recording) {
      requests = []
      pendingHeaders.clear()
      lastUiAction = null
    }
    recording = next
    publish()
    if (recording && active()) captureView.webContents.focus()
    return state()
  }

  function open(rawUrl) {
    const targetUrl = normalizeSiteUrl(rawUrl)
    if (!targetUrl) {
      return { ok: false, error: '请输入有效的业务系统地址，例如 https://oa.example.com' }
    }
    ensureSession()
    if (active()) {
      captureView.webContents.loadURL(targetUrl).catch(() => {})
      return { ok: true }
    }

    requests = []
    recording = false
    lastUiAction = null
    pendingHeaders.clear()
    const result = attachView(targetUrl)
    publish()
    return result
  }

  function close() {
    const window = getMainWindow()
    if (captureView && !captureView.webContents.isDestroyed()) {
      if (window && !window.isDestroyed()) window.contentView.removeChildView(captureView)
      captureView.webContents.close()
    }
    captureView = null
    recording = false
    pendingHeaders.clear()
    publish()
    return { ok: true }
  }

  function command(action) {
    if (!active()) return { ok: false }
    if (action === 'back' && captureView.webContents.canGoBack()) captureView.webContents.goBack()
    if (action === 'forward' && captureView.webContents.canGoForward()) captureView.webContents.goForward()
    if (action === 'reload') captureView.webContents.reload()
    return { ok: true }
  }

  function handleWindowOpen(url) {
    if (active() && /^https?:\/\//i.test(url)) {
      captureView.webContents.loadURL(url).catch(() => {})
    }
    return { action: 'deny' }
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
    setBounds,
    setRecording,
    command,
    ownsSession,
    ownsContents,
    noteUiAction,
    handleWindowOpen
  }
}

module.exports = { createCaptureService }

const { session } = require('electron')

const CAPTURE_PARTITION = 'faultdetect-capture-session'
const MAX_REQUESTS = 80
const IGNORED_HOST_PATTERNS = [
  /(^|\.)google-analytics\.com$/i,
  /(^|\.)googletagmanager\.com$/i,
  /(^|\.)doubleclick\.net$/i,
  /(^|\.)optimizely\.com$/i,
  /(^|\.)facebook\.net$/i
]

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

function createCaptureService({ onUpdate }) {
  let captureSession = null
  let active = false
  let targetUrl = ''
  let sequence = 0
  let requests = []
  let recording = false
  let lastUiAction = null
  const pendingHeaders = new Map()

  function state() {
    return {
      active,
      targetUrl,
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

  function noteUiAction(payload) {
    const label = String(payload?.label || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const occurredAt = Number(payload?.occurredAt || 0)
    if (!label || !occurredAt) return { ok: true }
    lastUiAction = { label, occurredAt }
    return { ok: true }
  }

  function addRequest(details, errorMessage) {
    const method = String(details.method || 'GET').toUpperCase()
    const resourceType = String(details.resourceType || '')
    const statusCode = Number(details.statusCode || 0)
    const isFailure = Boolean(errorMessage) || statusCode >= 400
    const isApi = resourceType === 'xhr' || resourceType === 'fetch'
    const isDocument = ['document', 'mainFrame', 'subFrame'].includes(resourceType)
    if (!isApi && !(isDocument && isFailure)) return
    if (!/^https?:\/\//i.test(details.url || '')) return

    const parsed = (() => {
      try { return new URL(details.url) } catch { return null }
    })()
    const isFaultDetectLocal = parsed
      && ['127.0.0.1', 'localhost'].includes(parsed.hostname)
      && parsed.port === '8000'
    if (isFaultDetectLocal && !parsed.pathname.startsWith('/demo/')) return
    if (parsed && IGNORED_HOST_PATTERNS.some(pattern => pattern.test(parsed.hostname))) return

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
    requests = [item, ...requests.filter(existing => existing.key !== dedupeKey)]
      .slice(0, MAX_REQUESTS)
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

  function open(rawUrl) {
    const normalized = normalizeSiteUrl(rawUrl)
    if (!normalized) {
      return { ok: false, error: '请输入有效的业务系统地址，例如 https://oa.example.com' }
    }
    ensureSession()
    active = true
    targetUrl = normalized
    requests = []
    recording = false
    lastUiAction = null
    pendingHeaders.clear()
    publish()
    return { ok: true, targetUrl }
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
    return state()
  }

  function close() {
    active = false
    targetUrl = ''
    recording = false
    pendingHeaders.clear()
    publish()
    return { ok: true }
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
    noteUiAction
  }
}

module.exports = { createCaptureService }

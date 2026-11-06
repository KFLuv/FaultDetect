const { session, webContents } = require('electron')

const CAPTURE_PARTITION = 'faultdetect-capture-session'
const MAX_REQUESTS = 80
const IGNORED_HOST_PATTERNS = [
  /(^|\.)google-analytics\.com$/i,
  /(^|\.)googletagmanager\.com$/i,
  /(^|\.)doubleclick\.net$/i,
  /(^|\.)optimizely\.com$/i,
  /(^|\.)facebook\.net$/i
]
const MAX_RESPONSE_PREVIEW = 12000

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

function sanitizeResponseBody(raw) {
  let text = String(raw || '')
  text = text
    .replace(/((?:"|')?(?:password|passwd|pwd|token|access_token|refresh_token|secret|api[_-]?key)(?:"|')?\s*:\s*)(?:"[^"]*"|'[^']*'|[^,\s}\]]+)/gi, '$1"***"')
    .replace(/(Authorization\s*[:=]\s*Bearer\s+)[^\s,;"']+/gi, '$1***')
    .replace(/([?&](?:token|access_token|api_key|key|password|passwd|secret|session|auth)[^=]*=)[^&#\s]*/gi, '$1***')
  const truncated = text.length > MAX_RESPONSE_PREVIEW
  return {
    text: truncated ? text.slice(0, MAX_RESPONSE_PREVIEW) + '\n…（响应体已截断）' : text,
    truncated
  }
}

function findHeader(headers, names) {
  const entries = Object.entries(headers || {})
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase() === name.toLowerCase())
    if (found && found[1] != null) return String(found[1])
  }
  return ''
}

function extractTraceId(headers, body) {
  const headerTrace = findHeader(headers, [
    'x-request-id',
    'x-trace-id',
    'traceparent',
    'x-b3-traceid',
    'x-correlation-id',
    'request-id'
  ])
  if (headerTrace) return headerTrace
  const match = String(body || '').match(/"(?:traceId|trace_id|requestId|request_id)"\s*:\s*"([^"]+)"/i)
  return match ? match[1] : ''
}

function analyzeSnapshot(statusCode, body, method) {
  const text = String(body || '')
  if (statusCode === 400 || statusCode === 422) {
    return { layer: '请求/业务参数', reason: '参数格式、必填字段或业务校验未通过', next: '核对请求参数、校验规则和字段类型' }
  }
  if (statusCode === 401) {
    return { layer: '鉴权', reason: '登录态、Token 或会话已失效', next: '重新登录并核对 Authorization/Cookie 与认证有效期' }
  }
  if (statusCode === 403) {
    return { layer: '权限', reason: '当前账号没有接口、角色或数据权限', next: '核对角色、菜单权限、数据范围和风控策略' }
  }
  if (statusCode === 404) {
    return { layer: '路由/部署', reason: '接口路径不存在或当前环境未部署对应版本', next: '核对接口前缀、版本、网关转发和目标环境' }
  }
  if (statusCode === 409) {
    return { layer: '业务数据', reason: '重复提交、版本冲突或业务唯一性冲突', next: '核对幂等键、唯一约束和并发更新策略' }
  }
  if (statusCode === 413) {
    return { layer: '请求体', reason: '上传内容或请求体超过服务端限制', next: '核对前端、网关和后端三处的请求体大小限制' }
  }
  if (statusCode === 415) {
    return { layer: '请求格式', reason: 'Content-Type 或请求体格式不受支持', next: '核对表单/JSON/文件上传类型和序列化方式' }
  }
  if (statusCode === 429) {
    return { layer: '限流', reason: '请求频率超过接口或网关限制', next: '检查防抖、重试策略和限流阈值' }
  }
  if (statusCode >= 500 || /exception|error|stacktrace|traceback|业务异常/i.test(text)) {
    return { layer: '后端/上游', reason: '服务端处理异常或依赖服务失败', next: '结合 Trace ID、服务端日志和最新发布记录定位' }
  }
  if (statusCode >= 400) {
    return { layer: 'HTTP 请求', reason: `请求返回 HTTP ${statusCode}`, next: '结合响应内容和接口调用链继续排查' }
  }
  if (/"(?:success|ok)"\s*:\s*false|"(?:code|status)"\s*:\s*(?!0\b)\d+/i.test(text)) {
    return { layer: '业务结果', reason: 'HTTP 成功但业务响应明确失败', next: '核对业务码、提示文案和业务规则' }
  }
  return {
    layer: method === 'POST' ? '业务提交' : '业务响应',
    reason: 'HTTP 状态正常，未从响应体识别到明确服务端错误',
    next: method === 'POST' ? '核对业务受理结果、幂等状态和异步处理记录' : '结合页面表现和业务数据继续判断'
  }
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
  const cdpRequests = new Map()
  const responseSnapshots = new Map()
  let attachedWebContents = null
  let debuggerMessageHandler = null
  let pendingBodyReads = 0

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

  function enrichRequest(key, snapshot) {
    const current = requests.find(item => item.key === key)
    if (!current) return
    current.responseSnapshot = snapshot
    current.failureLayer = snapshot.failureLayer
    current.failureReason = snapshot.failureReason
    current.nextStep = snapshot.nextStep
    current.traceId = snapshot.traceId
    requests = [...requests]
    publish()
  }

  async function captureResponseBody(requestId, request, response) {
    let body = ''
    let bodyBase64 = false
    try {
      const result = await attachedWebContents.debugger.sendCommand(
        'Network.getResponseBody',
        { requestId }
      )
      body = result?.body || ''
      bodyBase64 = Boolean(result?.base64Encoded)
    } catch {
      body = ''
    }
    const rawBody = bodyBase64 ? Buffer.from(body, 'base64').toString('utf8') : body
    const sanitized = sanitizeResponseBody(rawBody)
    const headers = response?.headers || {}
    const method = String(request?.method || 'GET').toUpperCase()
    const key = `${method} ${request?.url || ''}`
    const analysis = analyzeSnapshot(Number(response?.status || 0), sanitized.text, method)
    const snapshot = {
      statusCode: Number(response?.status || 0),
      statusText: response?.statusText || '',
      mimeType: response?.mimeType || '',
      headers,
      responseBody: sanitized.text,
      responseBodyTruncated: sanitized.truncated,
      traceId: extractTraceId(headers, sanitized.text),
      durationMs: response?.durationMs || null,
      failureLayer: analysis.layer,
      failureReason: analysis.reason,
      nextStep: analysis.next,
      capturedAt: new Date().toISOString()
    }
    responseSnapshots.set(key, snapshot)
    enrichRequest(key, snapshot)
    cdpRequests.delete(requestId)
  }

  function handleDebuggerMessage(_event, method, params) {
    if (method === 'Network.requestWillBeSent') {
      if (!recording) return
      cdpRequests.set(params.requestId, {
        url: params.request?.url || '',
        method: String(params.request?.method || 'GET').toUpperCase(),
        startedAt: params.timestamp,
        requestHeaders: params.request?.headers || {}
      })
      return
    }
    if (method === 'Network.responseReceived') {
      const request = cdpRequests.get(params.requestId)
      if (!request) return
      request.response = {
        status: params.response?.status,
        statusText: params.response?.statusText,
        mimeType: params.response?.mimeType,
        headers: params.response?.headers || {},
        durationMs: params.timestamp && request.startedAt
          ? Math.round((params.timestamp - request.startedAt) * 1000)
          : null
      }
      return
    }
    if (method === 'Network.loadingFinished') {
      const request = cdpRequests.get(params.requestId)
      if (!request?.response) return
      pendingBodyReads += 1
      captureResponseBody(params.requestId, request, request.response)
        .finally(() => {
          pendingBodyReads = Math.max(0, pendingBodyReads - 1)
        })
      return
    }
    if (method === 'Network.loadingFailed') {
      const request = cdpRequests.get(params.requestId)
      if (!request) return
      const key = `${request.method} ${request.url}`
      const snapshot = {
        statusCode: 0,
        statusText: '网络失败',
        mimeType: '',
        headers: {},
        responseBody: '',
        responseBodyTruncated: false,
        traceId: '',
        durationMs: params.timestamp && request.startedAt
          ? Math.round((params.timestamp - request.startedAt) * 1000)
          : null,
        failureLayer: '网络',
        failureReason: params.errorText || '请求在网络层失败',
        nextStep: '检查网络、代理、证书、端口和目标服务状态',
        capturedAt: new Date().toISOString()
      }
      responseSnapshots.set(key, snapshot)
      enrichRequest(key, snapshot)
      cdpRequests.delete(params.requestId)
    }
  }

  function detachResponseInspector() {
    if (attachedWebContents && debuggerMessageHandler) {
      try {
        attachedWebContents.debugger.off('message', debuggerMessageHandler)
      } catch {}
    }
    if (attachedWebContents) {
      try {
        if (attachedWebContents.debugger.isAttached()) attachedWebContents.debugger.detach()
      } catch {}
    }
    attachedWebContents = null
    debuggerMessageHandler = null
    cdpRequests.clear()
  }

  async function attachResponseInspector(webContentsId) {
    detachResponseInspector()
    const guest = webContents.fromId(Number(webContentsId))
    if (!guest) return { ok: false, error: '找不到内嵌网页进程' }
    try {
      guest.debugger.attach('1.3')
      debuggerMessageHandler = (event, method, params) =>
        handleDebuggerMessage(event, method, params)
      guest.debugger.on('message', debuggerMessageHandler)
      await guest.debugger.sendCommand('Network.enable')
      attachedWebContents = guest
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error.message || String(error) }
    }
  }

  async function waitForPendingSnapshots(timeoutMs = 2500) {
    const deadline = Date.now() + timeoutMs
    while (pendingBodyReads > 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 80))
    }
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
    const snapshot = responseSnapshots.get(dedupeKey)
    if (snapshot) {
      item.responseSnapshot = snapshot
      item.failureLayer = snapshot.failureLayer
      item.failureReason = snapshot.failureReason
      item.nextStep = snapshot.nextStep
      item.traceId = snapshot.traceId
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
    responseSnapshots.clear()
    cdpRequests.clear()
    publish()
    return { ok: true, targetUrl }
  }

  function setRecording(enabled) {
    const next = Boolean(enabled)
    if (next && !recording) {
      requests = []
      pendingHeaders.clear()
      lastUiAction = null
      responseSnapshots.clear()
      cdpRequests.clear()
    }
    recording = next
    publish()
    return state()
  }

  async function close() {
    await waitForPendingSnapshots()
    detachResponseInspector()
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
    noteUiAction,
    attachResponseInspector
  }
}

module.exports = { createCaptureService }

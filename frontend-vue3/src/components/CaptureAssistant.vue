<template>
    <section class="capture-card" data-testid="capture-assistant">
        <div class="capture-head">
            <div class="capture-title">
                <span class="capture-icon"><MousePointerClick :size="20" /></span>
                <div>
                    <h2>不会找接口？用一键采集</h2>
                    <p>不需要 F12，也不需要手动复制 URL、Cookie 或 Token。</p>
                </div>
            </div>
            <span class="local-pill"><ShieldCheck :size="14" /> 凭证仅在本机内存</span>
        </div>

        <div class="capture-steps" aria-label="一键采集步骤">
            <div>
                <strong>1</strong>
                <span>粘贴业务系统首页</span>
                <small>地址栏里能看到的地址</small>
            </div>
            <ArrowRight :size="17" />
            <div>
                <strong>2</strong>
                <span>在应用内正常操作</span>
                <small>把刚才的问题再触发一次</small>
            </div>
            <ArrowRight :size="17" />
            <div>
                <strong>3</strong>
                <span>选中出错的操作</span>
                <small>请求由系统自动填入</small>
            </div>
        </div>

        <div v-if="supported" class="capture-launch">
            <div class="site-field">
                <AppWindow :size="17" />
                <input
                    v-model="siteUrl"
                    type="text"
                    placeholder="粘贴业务系统地址，例如 https://oa.example.com"
                    @keyup.enter="openBusinessSystem"
                />
            </div>
            <button class="btn btn-primary" :disabled="opening" @click="openBusinessSystem">
                <ExternalLink :size="16" />
                {{ opening ? '正在打开…' : active ? '返回业务系统' : '打开并开始采集' }}
            </button>
        </div>
        <p v-else class="capture-unsupported">
            一键采集仅在 FaultDetect 桌面版可用；网页版仍需技术人员手动填写接口信息。
        </p>

        <p v-if="errorMessage" class="capture-error">{{ errorMessage }}</p>

        <div v-if="sortedRequests.length" class="capture-results" data-testid="capture-results">
            <div class="capture-results-head">
                <div>
                    <strong>最近捕获的请求</strong>
                    <span>优先显示失败请求，不会在页面展示登录凭证</span>
                </div>
                <button type="button" class="plain-action" @click="clearRequests">清空记录</button>
            </div>

            <label class="capture-authorization">
                <input v-model="authorized" type="checkbox" />
                我确认已获得该业务系统的只读诊断授权
            </label>

            <div class="candidate-list">
                <div
                    v-for="item in visibleRequests"
                    :key="item.id"
                    class="candidate-row"
                    :class="{ failed: item.isFailure, disabled: !item.replayable }"
                >
                    <span class="method-pill">{{ item.method }}</span>
                    <span class="status-pill" :class="{ failed: item.isFailure }">{{ statusLabel(item) }}</span>
                    <span class="candidate-copy">
                        <strong>{{ item.actionLabel || item.host }}</strong>
                        <span>{{ item.actionLabel ? item.host + item.path : item.path }}</span>
                    </span>
                    <button
                        v-if="item.failureReason"
                        type="button"
                        class="candidate-snapshot"
                        @click="snapshotItem = item"
                    >
                        失败快照
                    </button>
                    <button
                        v-if="!item.replayable"
                        type="button"
                        class="candidate-copy-action"
                        @click="copyHandoff(item)"
                    >
                        {{ copiedId === item.id ? '已复制' : '复制交接信息' }}
                    </button>
                    <button
                        v-else
                        type="button"
                        class="candidate-action"
                        :disabled="!authorized || loading"
                        data-testid="capture-candidate"
                        @click="$emit('use-request', item)"
                    >
                        {{ loading ? '检测中…' : '使用并检测' }}
                        <ArrowRight :size="15" />
                    </button>
                </div>
            </div>
            <div v-if="snapshotItem" class="snapshot-panel">
                <div class="snapshot-head">
                    <div>
                        <strong>原始失败快照</strong>
                        <span>{{ snapshotItem.method }} {{ snapshotItem.host }}{{ snapshotItem.path }}</span>
                    </div>
                    <button type="button" class="plain-action" @click="snapshotItem = null">关闭</button>
                </div>
                <div class="snapshot-grid">
                    <div><span>状态</span><strong>{{ snapshotItem.responseSnapshot?.statusCode || '网络失败' }}</strong></div>
                    <div><span>问题层</span><strong>{{ snapshotItem.failureLayer || '待判断' }}</strong></div>
                    <div><span>Trace ID</span><strong class="mono-value">{{ snapshotItem.traceId || '未提供' }}</strong></div>
                    <div><span>耗时</span><strong>{{ snapshotItem.responseSnapshot?.durationMs != null ? snapshotItem.responseSnapshot.durationMs + ' ms' : '—' }}</strong></div>
                </div>
                <p><b>初步判断：</b>{{ snapshotItem.failureReason }}</p>
                <p><b>下一步：</b>{{ snapshotItem.nextStep }}</p>
                <div v-if="snapshotItem.responseSnapshot?.requestBody" class="request-evidence">
                    <div class="snapshot-subhead">
                        <strong>脱敏请求体</strong>
                        <span>{{ snapshotItem.responseSnapshot.requestContentType || 'Content-Type 未提供' }}</span>
                    </div>
                    <pre>{{ snapshotItem.responseSnapshot.requestBody }}</pre>
                </div>
                <pre v-if="snapshotItem.responseSnapshot?.responseBody">{{ snapshotItem.responseSnapshot.responseBody }}</pre>
                <p v-else class="snapshot-empty">没有取得响应体，可继续使用 Trace ID 或服务端日志定位。</p>
                <div v-if="snapshotItem.traceId" class="trace-actions">
                    <button type="button" @click="copyTraceId(snapshotItem)">复制 Trace ID</button>
                    <button type="button" @click="traceEditorOpen = !traceEditorOpen">配置日志入口</button>
                    <button v-if="traceTemplateConfigured" type="button" @click="openTraceLog(snapshotItem)">打开日志平台</button>
                </div>
                <div v-if="traceEditorOpen && snapshotItem.traceId" class="trace-template-editor">
                    <label>
                        <span>日志查询 URL 模板</span>
                        <input v-model="traceTemplateInput" placeholder="https://log.example.com/search?traceId={traceId}" />
                    </label>
                    <button type="button" class="btn btn-primary" @click="saveTraceTemplate">保存模板</button>
                    <small>使用 <span class="mono">{traceId}</span> 作为占位符；模板只保存在本机浏览器。</small>
                </div>
            </div>
        </div>

    </section>

    <Teleport to="body">
        <div v-if="active" class="capture-workspace" data-testid="capture-workspace">
            <header class="workspace-toolbar">
                <div class="workspace-brand">
                    <span class="workspace-mark"><AppWindow :size="18" /></span>
                    <div>
                        <strong>FaultDetect 内置业务系统</strong>
                        <span :class="{ recording }">{{ recording ? '正在记录本次问题' : '当前待机，不会捕获请求' }}</span>
                    </div>
                </div>
                <div class="workspace-nav">
                    <button type="button" title="返回上一页" @click="captureCommand('back')">
                        <ChevronLeft :size="17" />
                    </button>
                    <button type="button" title="前进" @click="captureCommand('forward')">
                        <ChevronRight :size="17" />
                    </button>
                    <button type="button" title="刷新页面" @click="captureCommand('reload')">
                        <RefreshCw :size="16" />
                    </button>
                </div>
                <div class="workspace-actions">
                    <button
                        type="button"
                        class="body-evidence-toggle"
                        :class="{ active: captureRequestBody }"
                        data-testid="request-body-toggle"
                        @click="toggleRequestBody"
                    >
                        <FileJson :size="14" />
                        请求体证据 {{ captureRequestBody ? '开' : '关' }}
                    </button>
                    <button v-if="!recording" type="button" class="workspace-record" @click="startRecording">
                        开始记录本次问题
                    </button>
                    <button v-else type="button" class="workspace-record stop" @click="finishRecording">
                        完成采集
                    </button>
                    <button type="button" class="workspace-close" title="关闭内置业务系统" @click="closeBusinessSystem">
                        <X :size="18" />
                    </button>
                </div>
            </header>
            <div v-if="errorMessage" class="workspace-alert">{{ errorMessage }}</div>
            <div class="browser-host">
                <webview
                    ref="captureWebview"
                    :src="captureUrl"
                    partition="faultdetect-capture-session"
                    webpreferences="contextIsolation=yes, sandbox=yes, nodeIntegration=no"
                    class="embedded-webview"
                    @ipc-message="handleWebviewMessage"
                    @dom-ready="handleWebviewReady"
                />
                <div v-if="browserError" class="browser-error" data-testid="browser-error">
                    <strong>{{ browserError.title }}</strong>
                    <p>{{ browserError.detail }}</p>
                    <span>{{ browserError.tip }}</span>
                    <div>
                        <button type="button" class="btn btn-primary" @click="retryBrowser">重新加载</button>
                        <button type="button" class="btn btn-ghost" @click="closeBusinessSystem">返回地址</button>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
    AppWindow,
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    FileJson,
    MousePointerClick,
    RefreshCw,
    ShieldCheck,
    X
} from 'lucide-vue-next'
import { copyText } from '../api'

defineEmits(['use-request'])
defineProps({
    loading: { type: Boolean, default: false }
})

const supported = ref(Boolean(window.faultDetectDesktop?.openCapture))
const siteUrl = ref('')
const active = ref(false)
const recording = ref(false)
const captureRequestBody = ref(false)
const opening = ref(false)
const authorized = ref(false)
const requests = ref([])
const errorMessage = ref('')
const copiedId = ref(0)
const snapshotItem = ref(null)
const captureWebview = ref(null)
const captureUrl = ref('')
const browserError = ref(null)
const traceEditorOpen = ref(false)
const traceTemplateInput = ref(localStorage.getItem('faultdetect-trace-template') || '')
let unsubscribe = null
let inspectorReadyPromise = Promise.resolve(false)
let webviewListenersAttached = false

const traceTemplateConfigured = computed(() =>
    /\{(?:traceId|trace_id)\}/.test(traceTemplateInput.value)
)

const sortedRequests = computed(() => [...requests.value].sort((left, right) => {
    if (left.isFailure !== right.isFailure) return left.isFailure ? -1 : 1
    return new Date(right.capturedAt) - new Date(left.capturedAt)
}))
const visibleRequests = computed(() => sortedRequests.value.slice(0, 12))

function applyState(state) {
    if (!state) return
    active.value = Boolean(state.active)
    recording.value = Boolean(state.recording)
    captureRequestBody.value = Boolean(state.captureRequestBody)
    captureUrl.value = state.targetUrl || ''
    requests.value = Array.isArray(state.requests) ? state.requests : []
    browserError.value = state.loadError ? describeBrowserError(state.loadError) : null
}

function syncWorkspace() {
    document.body.classList.toggle('capture-workspace-open', active.value)
}

function statusLabel(item) {
    if (item.error) return '连接失败'
    if (item.statusCode) return `HTTP ${item.statusCode}`
    return '已完成'
}

async function openBusinessSystem() {
    errorMessage.value = ''
    if (!siteUrl.value.trim()) {
        errorMessage.value = '请先粘贴业务系统地址。'
        return
    }
    opening.value = true
    try {
        const result = await window.faultDetectDesktop.openCapture(siteUrl.value.trim())
        if (!result?.ok) errorMessage.value = result?.error || '业务系统窗口打开失败'
    } catch (error) {
        errorMessage.value = '业务系统窗口打开失败：' + (error.message || String(error))
    } finally {
        opening.value = false
    }
}

async function closeBusinessSystem() {
    await window.faultDetectDesktop.closeCapture()
}

async function captureCommand(action) {
    const view = captureWebview.value
    if (!view) return
    if (action === 'back' && view.canGoBack()) view.goBack()
    if (action === 'forward' && view.canGoForward()) view.goForward()
    if (action === 'reload') view.reload()
}

function handleWebviewMessage(event) {
    if (event.channel !== 'capture-ui-action') return
    const payload = event.args?.[0]
    if (payload) window.faultDetectDesktop.noteCaptureAction(payload)
}

function handleWebviewReady() {
    const view = captureWebview.value
    if (!view) return
    view.focus()
    if (!webviewListenersAttached) {
        view.addEventListener('did-start-loading', () => {
            browserError.value = null
        })
        view.addEventListener('did-fail-load', handleWebviewFail)
        view.addEventListener('did-fail-provisional-load', handleWebviewFail)
        view.addEventListener('did-stop-loading', () => inspectWebviewResult(view))
        view.addEventListener('render-process-gone', handleWebviewGone)
        webviewListenersAttached = true
    }
    try {
        inspectorReadyPromise = window.faultDetectDesktop
            .registerCaptureWebview(view.getWebContentsId())
            .then(result => Boolean(result?.ok))
            .catch(() => false)
    } catch {
        inspectorReadyPromise = Promise.resolve(false)
    }
}

async function inspectWebviewResult(view) {
    if (!view || browserError.value) return
    try {
        const text = await view.executeJavaScript(
            'document.body ? document.body.innerText.slice(0, 1200) : ""',
            true
        )
        if (/ERR_(?:CONNECTION_REFUSED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|TIMED_OUT|CERT_)|无法访问此网站|连接被拒绝|This site can.t be reached/i.test(text)) {
            browserError.value = {
                title: '网页未能正常加载',
                detail: text.replace(/\s+/g, ' ').slice(0, 260),
                tip: '检查 DNS、端口、代理、VPN、防火墙和证书。浏览器错误页内容已保留为兼容性证据。'
            }
        }
    } catch {}
}

function describeBrowserError(event) {
    if (event.errorCode === -3) return null
    const descriptions = {
        '-102': ['连接被拒绝', '检查服务是否启动、端口是否正确，以及 VPN/代理是否生效。'],
        '-105': ['域名解析失败', '检查域名、DNS、VPN 或内网地址是否可从当前机器访问。'],
        '-106': ['网络已断开', '检查本机网络、VPN、代理和防火墙。'],
        '-118': ['连接超时', '检查目标网络、代理、服务负载和防火墙。'],
        '-200': ['证书日期无效', '检查服务器证书有效期和本机系统时间。'],
        '-202': ['证书不受信任', '检查企业 CA、证书链或客户端证书；FaultDetect 不会自动绕过证书错误。']
    }
    const mapped = descriptions[String(event.errorCode)] || [
        '网页加载失败',
        event.errorDescription || '当前内嵌浏览器无法完成页面加载。'
    ]
    return {
        title: mapped[0],
        detail: mapped[1],
        tip: `错误代码 ${event.errorCode || '未知'}。若需要在原浏览器中完成 SSO/MFA/证书流程，请记录该限制；当前不支持时不要继续假设页面已加载。`
    }
}

function handleWebviewFail(event) {
    if (event.isMainFrame === false) return
    browserError.value = describeBrowserError(event)
}

function handleWebviewGone(event) {
    browserError.value = {
        title: '内嵌网页进程异常退出',
        detail: `原因：${event.reason || 'unknown'}`,
        tip: '可以重新加载；重复出现时应检查目标网页兼容性和应用日志。'
    }
}

function retryBrowser() {
    browserError.value = null
    captureWebview.value?.reload()
}

async function toggleRequestBody() {
    const next = !captureRequestBody.value
    if (next && !window.confirm('请求体可能包含表单字段、手机号或业务数据。启用后只在本机内存中脱敏保存，并在展示前再次过滤敏感字段。是否继续？')) {
        return
    }
    try {
        applyState(await window.faultDetectDesktop.setCaptureOptions({ captureRequestBody: next }))
    } catch (error) {
        errorMessage.value = '请求体证据设置失败：' + (error.message || String(error))
    }
}

async function copyTraceId(item) {
    if (!item.traceId) return
    await copyText(item.traceId)
    errorMessage.value = 'Trace ID 已复制'
    setTimeout(() => {
        if (errorMessage.value === 'Trace ID 已复制') errorMessage.value = ''
    }, 1600)
}

function saveTraceTemplate() {
    const value = traceTemplateInput.value.trim()
    if (value && !/\{(?:traceId|trace_id)\}/.test(value)) {
        errorMessage.value = '日志 URL 模板必须包含 {traceId} 占位符'
        return
    }
    traceTemplateInput.value = value
    localStorage.setItem('faultdetect-trace-template', value)
    traceEditorOpen.value = false
}

async function openTraceLog(item) {
    if (!item.traceId || !traceTemplateConfigured.value) return
    const url = traceTemplateInput.value
        .replaceAll('{traceId}', encodeURIComponent(item.traceId))
        .replaceAll('{trace_id}', encodeURIComponent(item.traceId))
    await window.faultDetectDesktop.openExternal(url)
}

async function startRecording() {
    errorMessage.value = ''
    try {
        const inspectorReady = await inspectorReadyPromise
        if (!inspectorReady) {
            errorMessage.value = '网页请求仍可记录，但响应快照通道未就绪；建议刷新页面后重试。'
        }
        applyState(await window.faultDetectDesktop.setCaptureRecording(true))
    } catch (error) {
        errorMessage.value = '开始记录失败：' + (error.message || String(error))
    }
}

async function finishRecording() {
    errorMessage.value = ''
    try {
        applyState(await window.faultDetectDesktop.setCaptureRecording(false))
        await window.faultDetectDesktop.closeCapture()
    } catch (error) {
        errorMessage.value = '完成采集失败：' + (error.message || String(error))
    }
}

async function clearRequests() {
    await window.faultDetectDesktop.clearCapture()
    authorized.value = false
    snapshotItem.value = null
}

async function copyHandoff(item) {
    const observed = item.error || (item.statusCode ? `HTTP ${item.statusCode}` : '请求完成')
    const lines = [
        `操作：${item.actionLabel || '未识别'}`,
        `请求：${item.method} ${item.host}${item.path}`,
        `结果：${observed}`,
        `问题层：${item.failureLayer || '未确定'}`,
        `初步判断：${item.failureReason || '暂无'}`,
        `下一步：${item.nextStep || '请研发结合日志继续定位'}`,
        `Trace ID：${item.traceId || '未提供'}`,
        `时间：${new Date(item.capturedAt).toLocaleString()}`,
        '说明：该请求可能提交业务数据，FaultDetect 未自动重放。'
    ]
    if (item.responseSnapshot?.requestBody) {
        lines.push(`请求体（脱敏）：\n${item.responseSnapshot.requestBody}`)
    }
    const text = lines.join('\n')
    try {
        await copyText(text)
        copiedId.value = item.id
        setTimeout(() => {
            if (copiedId.value === item.id) copiedId.value = 0
        }, 1800)
    } catch {
        errorMessage.value = '复制失败，请检查系统剪贴板权限。'
    }
}

onMounted(async () => {
    if (!supported.value) return
    try {
        applyState(await window.faultDetectDesktop.getCaptureState())
        unsubscribe = window.faultDetectDesktop.onCaptureUpdated(applyState)
    } catch (error) {
        errorMessage.value = '读取采集状态失败：' + (error.message || String(error))
    }
})

onBeforeUnmount(() => {
    if (unsubscribe) unsubscribe()
    document.body.classList.remove('capture-workspace-open')
    webviewListenersAttached = false
})

watch(active, (value) => {
    if (!value) webviewListenersAttached = false
    syncWorkspace(value)
})
</script>

<style scoped>
.capture-card {
    margin-bottom: 16px;
    padding: 20px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--primary);
    border-radius: 8px;
    background: var(--bg-card);
}

.capture-head,
.capture-title,
.capture-launch,
.capture-live,
.capture-results-head,
.candidate-row {
    display: flex;
    align-items: center;
}

.capture-head {
    justify-content: space-between;
    gap: 16px;
}

.capture-title {
    min-width: 0;
    gap: 11px;
}

.capture-title h2 {
    font-size: 17px;
    line-height: 1.35;
}

.capture-title p {
    margin-top: 3px;
    color: var(--text-dim);
    font-size: 12px;
}

.capture-icon {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    flex: 0 0 36px;
    border-radius: 8px;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
}

.local-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    padding: 5px 9px;
    border: 1px solid color-mix(in srgb, var(--success) 24%, var(--border));
    border-radius: 6px;
    color: var(--success);
    background: color-mix(in srgb, var(--success) 6%, transparent);
    font-size: 11px;
    font-weight: 600;
}

.capture-steps {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto 1fr;
    align-items: center;
    gap: 10px;
    margin: 18px 0;
    color: var(--text-dim);
}

.capture-steps > div {
    min-width: 0;
    display: grid;
    grid-template-columns: 26px 1fr;
    align-items: center;
    gap: 1px 8px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg-inset);
}

.capture-steps strong {
    grid-row: 1 / span 2;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    font-size: 12px;
}

.capture-steps span {
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
}

.capture-steps small {
    min-width: 0;
    overflow: hidden;
    color: var(--text-dim);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.capture-launch {
    gap: 10px;
}

.site-field {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 11px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg-inset);
    color: var(--text-dim);
}

.site-field:focus-within {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 10%, transparent);
}

.site-field input {
    min-width: 0;
    flex: 1;
    padding: 10px 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13px;
}

.capture-launch .btn {
    flex: 0 0 auto;
}

.capture-unsupported,
.capture-error {
    margin-top: 12px;
    padding: 9px 11px;
    border-radius: 7px;
    font-size: 12px;
}

.capture-unsupported {
    color: var(--text-dim);
    background: var(--bg-inset);
}

.capture-error {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 7%, transparent);
}

.capture-live {
    gap: 10px;
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--primary) 24%, var(--border));
    border-radius: 7px;
    background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.live-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    border-radius: 50%;
    background: var(--primary);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 12%, transparent);
}

.capture-live.recording .live-dot {
    background: var(--danger);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--danger) 12%, transparent);
}

.capture-live div {
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.capture-live strong {
    font-size: 12px;
}

.capture-live span {
    color: var(--text-dim);
    font-size: 11px;
}

.plain-action {
    margin-left: auto;
    padding: 4px 6px;
    border: 0;
    background: transparent;
    color: var(--primary);
    font: inherit;
    font-size: 11px;
}

.record-action {
    flex: 0 0 auto;
    padding: 6px 10px;
    border: 1px solid var(--primary);
    border-radius: 6px;
    background: var(--primary);
    color: #fff;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
}

.record-action.stop {
    border-color: var(--danger);
    background: var(--danger);
}

.capture-results {
    margin-top: 14px;
    border-top: 1px solid var(--border);
    padding-top: 14px;
}

.capture-results-head {
    justify-content: space-between;
    gap: 12px;
}

.capture-results-head div {
    display: flex;
    flex-direction: column;
}

.capture-results-head strong {
    font-size: 12px;
}

.capture-results-head span {
    color: var(--text-dim);
    font-size: 10px;
}

.capture-authorization {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0;
    color: var(--text-dim);
    font-size: 11px;
}

.candidate-list {
    max-height: 310px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 7px;
}

.candidate-row {
    width: 100%;
    gap: 8px;
    padding: 10px 11px;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.candidate-row:last-child {
    border-bottom: 0;
}

.candidate-row:hover {
    background: var(--bg-card-hover);
}

.candidate-row.failed {
    box-shadow: 3px 0 0 color-mix(in srgb, var(--danger) 70%, transparent) inset;
}

.method-pill,
.status-pill {
    flex: 0 0 auto;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 10px;
    font-weight: 700;
}

.method-pill {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
}

.status-pill {
    color: var(--text-dim);
    background: var(--bg-inset);
}

.status-pill.failed {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 8%, transparent);
}

.candidate-copy {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.candidate-copy strong,
.candidate-copy span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.candidate-copy strong {
    font-size: 11px;
}

.candidate-copy span {
    color: var(--text-dim);
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 10px;
}

.candidate-action,
.candidate-snapshot,
.candidate-copy-action {
    border: 0;
    background: transparent;
    font: inherit;
    cursor: pointer;
}

.candidate-snapshot {
    flex: 0 0 auto;
    color: var(--primary);
    font-size: 10px;
    font-weight: 600;
}

.candidate-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    font-size: 10px;
    color: var(--primary);
    font-weight: 600;
}

.candidate-action:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}

.candidate-copy-action {
    flex: 0 0 auto;
    color: var(--warning);
    font-size: 10px;
}

.snapshot-panel {
    margin-top: 12px;
    padding: 13px;
    border: 1px solid color-mix(in srgb, var(--primary) 24%, var(--border));
    border-radius: 7px;
    background: color-mix(in srgb, var(--primary) 4%, var(--bg-card));
}

.snapshot-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
}

.snapshot-head div {
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.snapshot-head strong {
    font-size: 12px;
}

.snapshot-head span {
    overflow: hidden;
    color: var(--text-dim);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.snapshot-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 7px;
    margin: 10px 0;
}

.snapshot-grid div {
    min-width: 0;
    padding: 7px 8px;
    border-radius: 6px;
    background: var(--bg-card);
}

.snapshot-grid span {
    display: block;
    color: var(--text-dim);
    font-size: 9px;
}

.snapshot-grid strong {
    display: block;
    overflow: hidden;
    margin-top: 2px;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mono-value {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.snapshot-panel p {
    margin: 5px 0;
    color: var(--text-dim);
    font-size: 10px;
    line-height: 1.55;
}

.snapshot-panel b {
    color: var(--text);
}

.snapshot-panel pre {
    max-height: 180px;
    overflow: auto;
    margin: 9px 0 0;
    padding: 9px;
    border-radius: 6px;
    background: var(--bg-inset);
    color: var(--code-text);
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 9px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
}

.capture-empty {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 11px;
    border: 1px dashed var(--border);
    border-radius: 7px;
    color: var(--text-dim);
    font-size: 11px;
}

:global(body.capture-workspace-open) {
    overflow: hidden;
}

.capture-workspace {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    background: #eef2f6;
}

.workspace-toolbar {
    height: 64px;
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 0 0 64px;
    padding: 0 14px;
    border-bottom: 1px solid #dfe4ea;
    background: #fff;
    color: #172033;
}

.workspace-brand {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    flex: 1;
}

.workspace-mark {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    flex: 0 0 32px;
    border-radius: 7px;
    color: #fff;
    background: #1e2838;
}

.workspace-brand div {
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.workspace-brand strong {
    font-size: 13px;
}

.workspace-brand span:last-child {
    color: #667085;
    font-size: 10px;
}

.workspace-brand span:last-child.recording {
    color: #d70015;
}

.workspace-nav,
.workspace-actions {
    display: flex;
    align-items: center;
    gap: 6px;
}

.workspace-nav button,
.workspace-close {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid #dfe4ea;
    border-radius: 6px;
    background: #fff;
    color: #475467;
    cursor: pointer;
}

.workspace-nav button:hover,
.workspace-close:hover {
    border-color: #0071e3;
    color: #0071e3;
}

.workspace-record {
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid #0071e3;
    border-radius: 6px;
    background: #0071e3;
    color: #fff;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
}

.workspace-record.stop {
    border-color: #d70015;
    background: #d70015;
}

.body-evidence-toggle {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    border: 1px solid #dfe4ea;
    border-radius: 6px;
    background: #fff;
    color: #667085;
    font: inherit;
    font-size: 10px;
    cursor: pointer;
}

.body-evidence-toggle.active {
    border-color: #b25000;
    color: #b25000;
    background: #fff8e8;
}

.workspace-close {
    color: #b42318;
}

.workspace-alert {
    flex: 0 0 auto;
    padding: 7px 12px;
    border-bottom: 1px solid #f0c36d;
    background: #fff8e8;
    color: #7a4b00;
    font-size: 11px;
}

.browser-host {
    position: relative;
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    background: #eef2f6;
    color: #667085;
    font-size: 13px;
    overflow: hidden;
}

.embedded-webview {
    width: 100%;
    height: 100%;
    display: flex;
}

.browser-error {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    flex-direction: column;
    justify-content: center;
    padding: 30px;
    background: #eef2f6;
    text-align: center;
}

.browser-error strong {
    color: #b42318;
    font-size: 17px;
}

.browser-error p {
    max-width: 640px;
    margin: 8px 0;
    color: #475467;
    font-size: 12px;
}

.browser-error span {
    max-width: 680px;
    color: #667085;
    font-size: 11px;
    line-height: 1.65;
}

.browser-error div {
    display: flex;
    gap: 8px;
    margin-top: 15px;
}

.snapshot-subhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
}

.snapshot-subhead strong {
    font-size: 11px;
}

.snapshot-subhead span {
    color: var(--text-dim);
    font-size: 9px;
}

.trace-actions {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
    margin-top: 10px;
}

.trace-actions button {
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg-card);
    color: var(--primary);
    font: inherit;
    font-size: 9px;
    cursor: pointer;
}

.trace-template-editor {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 9px;
    padding: 10px;
    border-radius: 6px;
    background: var(--bg-inset);
}

.trace-template-editor label {
    min-width: 260px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.trace-template-editor label span {
    color: var(--text-dim);
    font-size: 9px;
}

.trace-template-editor input {
    width: 100%;
    padding: 7px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg-card);
    color: var(--text);
    font: inherit;
    font-size: 10px;
}

.trace-template-editor small {
    flex-basis: 100%;
    color: var(--text-dim);
    font-size: 9px;
}

@media (max-width: 900px) {
    .capture-head,
    .capture-launch {
        align-items: stretch;
        flex-direction: column;
    }

    .local-pill {
        align-self: flex-start;
    }

    .capture-steps {
        grid-template-columns: 1fr;
    }

    .capture-steps > svg {
        display: none;
    }

    .workspace-toolbar {
        gap: 8px;
        padding: 0 9px;
    }

    .workspace-brand span:last-child {
        display: none;
    }

    .workspace-nav {
        display: none;
    }

    .snapshot-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

}
</style>

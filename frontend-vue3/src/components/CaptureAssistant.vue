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
const opening = ref(false)
const authorized = ref(false)
const requests = ref([])
const errorMessage = ref('')
const copiedId = ref(0)
const captureWebview = ref(null)
const captureUrl = ref('')
let unsubscribe = null

const sortedRequests = computed(() => [...requests.value].sort((left, right) => {
    if (left.isFailure !== right.isFailure) return left.isFailure ? -1 : 1
    return new Date(right.capturedAt) - new Date(left.capturedAt)
}))
const visibleRequests = computed(() => sortedRequests.value.slice(0, 12))

function applyState(state) {
    if (!state) return
    active.value = Boolean(state.active)
    recording.value = Boolean(state.recording)
    captureUrl.value = state.targetUrl || ''
    requests.value = Array.isArray(state.requests) ? state.requests : []
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
    captureWebview.value?.focus()
}

async function startRecording() {
    errorMessage.value = ''
    try {
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
}

async function copyHandoff(item) {
    const observed = item.error || (item.statusCode ? `HTTP ${item.statusCode}` : '请求完成')
    const text = [
        `操作：${item.actionLabel || '未识别'}`,
        `请求：${item.method} ${item.host}${item.path}`,
        `结果：${observed}`,
        `时间：${new Date(item.capturedAt).toLocaleString()}`,
        '说明：该请求可能提交业务数据，FaultDetect 未自动重放，请研发按服务端日志核查。'
    ].join('\n')
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
})

watch(active, syncWorkspace)
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
.candidate-copy-action {
    border: 0;
    background: transparent;
    font: inherit;
    cursor: pointer;
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

.workspace-close {
    color: #b42318;
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
}

.embedded-webview {
    width: 100%;
    height: 100%;
    display: flex;
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

}
</style>

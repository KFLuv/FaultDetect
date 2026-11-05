<template>
    <div class="settings-backdrop" @click.self="$emit('close')">
        <section class="settings-dialog" role="dialog" aria-modal="true" aria-label="模型设置">
            <header class="settings-head">
                <div>
                    <span class="settings-kicker">LOCAL MODEL CONFIG</span>
                    <h2>模型设置</h2>
                </div>
                <button type="button" class="dialog-close" title="关闭" @click="$emit('close')">
                    <X :size="18" />
                </button>
            </header>

            <div class="settings-body">
                <div class="master-row">
                    <div>
                        <strong>LLM 增强模块</strong>
                        <span>关闭后所有检测严格走 7 步规则流程</span>
                    </div>
                    <label class="switch">
                        <input v-model="form.enabled" type="checkbox" />
                        <i></i>
                    </label>
                </div>

                <label class="field">
                    <span>接口预设</span>
                    <select v-model="preset" @change="applyPreset">
                        <option value="deepseek">DeepSeek</option>
                        <option value="openai">OpenAI</option>
                        <option value="custom">自定义 OpenAI 兼容接口</option>
                    </select>
                </label>

                <label class="field">
                    <span>Chat Completions Endpoint</span>
                    <input v-model="form.endpoint" type="url" placeholder="https://api.deepseek.com/chat/completions" />
                </label>

                <div class="field-row">
                    <label class="field">
                        <span>模型名称</span>
                        <input v-model="form.model" type="text" placeholder="deepseek-chat" />
                    </label>
                    <label class="field narrow">
                        <span>超时秒数</span>
                        <input v-model.number="form.timeout_seconds" type="number" min="5" max="120" />
                    </label>
                </div>

                <label class="field">
                    <span>API Key</span>
                    <input
                        v-model="form.api_key"
                        type="password"
                        autocomplete="off"
                        :placeholder="config.has_api_key ? `已保存：${config.masked_api_key}，留空表示不修改` : 'sk-...'"
                    />
                </label>

                <label class="check-row">
                    <input v-model="form.insecure_tls" type="checkbox" />
                    <span>允许自签名证书</span>
                </label>

                <label v-if="config.has_api_key" class="check-row danger-check">
                    <input v-model="form.clear_api_key" type="checkbox" />
                    <span>清除已保存的 API Key</span>
                </label>

                <div class="config-note">
                    <LockKeyhole :size="15" />
                    <span>Key 仅保存在 {{ config.file || '用户目录' }}，不会进入仓库或浏览器响应。</span>
                </div>

                <div v-if="testResult.message" class="test-result" :class="testResult.status">
                    {{ testResult.message }}
                    <span v-if="testResult.latency_ms"> · {{ testResult.latency_ms }}ms</span>
                </div>

                <div v-if="message" class="save-result" :class="messageType">{{ message }}</div>
            </div>

            <footer class="settings-actions">
                <button type="button" class="btn btn-ghost" :disabled="busy" @click="testConnection">
                    {{ testing ? '测试中...' : '测试连接' }}
                </button>
                <button type="button" class="btn btn-ghost" @click="$emit('close')">取消</button>
                <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
                    {{ saving ? '保存中...' : '保存配置' }}
                </button>
            </footer>
        </section>
    </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { LockKeyhole, X } from 'lucide-vue-next'
import { getLlmConfig, saveLlmConfig, testLlmConfig } from '../api'

const emit = defineEmits(['close', 'saved'])
const preset = ref('deepseek')
const config = reactive({
    file: '',
    has_api_key: false,
    masked_api_key: '',
    configured: false
})
const form = reactive({
    enabled: false,
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    api_key: '',
    timeout_seconds: 20,
    insecure_tls: false,
    clear_api_key: false
})
const saving = ref(false)
const testing = ref(false)
const busy = ref(false)
const message = ref('')
const messageType = ref('')
const testResult = reactive({ status: '', message: '', latency_ms: 0 })

onMounted(load)

async function load() {
    try {
        const data = await getLlmConfig()
        Object.assign(config, data)
        form.enabled = Boolean(data.enabled)
        form.endpoint = data.endpoint || form.endpoint
        form.model = data.model || form.model
        form.timeout_seconds = data.timeout_seconds || 20
        form.insecure_tls = Boolean(data.insecure_tls)
        preset.value = inferPreset(form.endpoint)
    } catch (error) {
        showMessage('读取配置失败：' + error.message, 'error')
    }
}

function inferPreset(endpoint) {
    if (endpoint.includes('api.deepseek.com')) return 'deepseek'
    if (endpoint.includes('api.openai.com')) return 'openai'
    return 'custom'
}

function applyPreset() {
    if (preset.value === 'deepseek') {
        form.endpoint = 'https://api.deepseek.com/chat/completions'
        form.model = 'deepseek-chat'
    } else if (preset.value === 'openai') {
        form.endpoint = 'https://api.openai.com/v1/chat/completions'
        form.model = 'gpt-4.1-mini'
    }
}

function payload() {
    return {
        enabled: form.enabled,
        endpoint: form.endpoint,
        model: form.model,
        api_key: form.api_key,
        clear_api_key: form.clear_api_key,
        timeout_seconds: form.timeout_seconds,
        insecure_tls: form.insecure_tls
    }
}

async function save() {
    saving.value = true
    try {
        const result = await saveLlmConfig(payload())
        form.api_key = ''
        form.clear_api_key = false
        config.has_api_key = result.has_api_key
        config.masked_api_key = result.masked_api_key
        config.configured = result.configured
        showMessage(result.message, 'success')
        emit('saved', result)
    } catch (error) {
        showMessage('保存失败：' + error.message, 'error')
    } finally {
        saving.value = false
    }
}

async function testConnection() {
    testing.value = true
    busy.value = true
    testResult.message = ''
    try {
        Object.assign(testResult, await testLlmConfig(payload()))
    } catch (error) {
        Object.assign(testResult, { status: 'error', message: error.message })
    } finally {
        testing.value = false
        busy.value = false
    }
}

function showMessage(text, type) {
    message.value = text
    messageType.value = type
}
</script>

<style scoped>
.settings-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(12, 15, 20, 0.42);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
}
.settings-dialog {
    width: min(620px, 100%);
    max-height: min(760px, calc(100vh - 48px));
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg-card);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
}
.settings-head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg-card) 94%, transparent);
    -webkit-backdrop-filter: blur(18px);
    backdrop-filter: blur(18px);
}
.settings-kicker {
    color: var(--primary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .08em;
}
.settings-head h2 { margin-top: 2px; font-size: 20px; }
.dialog-close {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-card);
    color: var(--text-dim);
    cursor: pointer;
}
.settings-body { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; }
.master-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-inset);
}
.master-row div { display: flex; flex-direction: column; gap: 2px; }
.master-row strong { font-size: 13px; }
.master-row span { color: var(--text-dim); font-size: 11px; }
.switch { position: relative; width: 42px; height: 24px; flex: 0 0 42px; }
.switch input { position: absolute; opacity: 0; pointer-events: none; }
.switch i {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 12px;
    background: color-mix(in srgb, var(--text-dim) 30%, transparent);
    transition: background .18s ease;
}
.switch i::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, .2);
    transition: transform .18s ease;
}
.switch input:checked + i { background: var(--primary); }
.switch input:checked + i::after { transform: translateX(18px); }
.field { display: flex; flex-direction: column; gap: 5px; }
.field > span { color: var(--text-dim); font-size: 11px; font-weight: 600; }
.field-row { display: grid; grid-template-columns: 1fr 130px; gap: 12px; }
.check-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-dim);
    font-size: 12px;
}
.check-row input { width: 15px; height: 15px; accent-color: var(--primary); }
.danger-check { color: var(--danger); }
.config-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-inset);
    color: var(--text-dim);
    font-size: 11px;
    word-break: break-all;
}
.config-note svg { flex: 0 0 auto; margin-top: 1px; color: var(--primary); }
.test-result,
.save-result {
    padding: 9px 11px;
    border-radius: 7px;
    font-size: 12px;
}
.test-result.ok,
.save-result.success { background: color-mix(in srgb, var(--success) 11%, transparent); color: var(--success); }
.test-result.error,
.save-result.error { background: color-mix(in srgb, var(--danger) 10%, transparent); color: var(--danger); }
.settings-actions {
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg-card) 95%, transparent);
    -webkit-backdrop-filter: blur(18px);
    backdrop-filter: blur(18px);
}
@media (max-width: 640px) {
    .settings-backdrop { padding: 10px; }
    .settings-dialog { max-height: calc(100vh - 20px); }
    .field-row { grid-template-columns: 1fr; }
}
</style>

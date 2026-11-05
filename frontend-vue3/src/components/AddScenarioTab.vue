<template>
    <section>
        <div class="card">
            <h2>➕ 新增故障场景</h2>
            <p class="hint">场景会持久化并在下一次检测中参与匹配。建议先做匹配预检；只有带区分特征的场景才会成为主结论。</p>

            <div class="form-group">
                <label>场景名称 *</label>
                <input type="text" v-model="form.name" placeholder="例如：短信服务欠费">
            </div>
            <div class="form-row">
                <div class="form-group grow">
                    <label>状态码（逗号分隔）*</label>
                    <input type="text" v-model="form.codes" placeholder="例如：200, 401">
                </div>
                <div class="form-group">
                    <label>问题归属 *</label>
                    <select v-model="form.root_cause">
                        <option v-for="(v, k) in store.categoryLabels" :key="k" :value="k">{{ v }}</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>响应特征关键词（逗号分隔，命中则加分）</label>
                <input type="text" v-model="form.patterns" placeholder="例如：欠费, balance, insufficient">
            </div>
            <div class="form-group">
                <label>界面症状关键词（逗号分隔）</label>
                <input type="text" v-model="form.symptoms" placeholder="例如：发送失败, 短信发不出">
            </div>
            <div class="form-group">
                <label>结论</label>
                <input type="text" v-model="form.conclusion" placeholder="例如：短信服务欠费导致发送失败">
            </div>
            <div class="form-group">
                <label>解决建议（每行一条）</label>
                <textarea v-model="form.solution" rows="3" placeholder="例如：&#10;联系运营商充值&#10;检查短信余额"></textarea>
            </div>

            <div class="preview-box">
                <div class="preview-head">
                    <div>
                        <h3>保存前验证是否会被识别</h3>
                        <p>用一条样例检查这个场景能否压过已有场景。只填状态码通常无法区分同状态码问题。</p>
                    </div>
                    <button class="btn btn-ghost" :disabled="previewing" @click="runPreview">
                        {{ previewing ? '验证中…' : '验证匹配' }}
                    </button>
                </div>
                <div class="form-row preview-fields">
                    <div class="form-group">
                        <label>测试状态码</label>
                        <input v-model="form.test_status" placeholder="例如：500">
                    </div>
                    <div class="form-group grow">
                        <label>测试响应内容</label>
                        <input v-model="form.test_response" placeholder="例如：短信余额不足">
                    </div>
                    <div class="form-group grow">
                        <label>测试界面症状</label>
                        <input v-model="form.test_symptom" placeholder="例如：发送短信提示失败">
                    </div>
                </div>
                <div v-if="preview" class="preview-result" :class="preview.would_match ? 'good' : 'warn'">
                    <strong>
                        {{ preview.would_match ? '这个场景会命中' : '这个场景不会成为主结论' }}
                        · 置信度 {{ Math.round(preview.confidence * 100) }}%
                    </strong>
                    <ul>
                        <li v-for="item in preview.advice" :key="item">{{ item }}</li>
                    </ul>
                    <p>当前最强对照：{{ preview.best_competitor.name }}（{{ preview.best_competitor.score }} 分）</p>
                </div>
            </div>

            <button class="btn btn-primary" @click="save" :disabled="saving">💾 保存场景</button>
        </div>
    </section>
</template>

<script setup>
import { reactive, ref, onMounted, watch } from 'vue'
import { api, store, loadScenarios } from '../api'

const emit = defineEmits(['saved'])
const saving = ref(false)
const previewing = ref(false)
const preview = ref(null)

const form = reactive({
    name: '', codes: '', patterns: '', symptoms: '',
    root_cause: '', conclusion: '', solution: '',
    test_status: '', test_response: '', test_symptom: '',
})

watch(form, () => {
    preview.value = null
}, { deep: true })

function payload() {
    return {
        name: form.name.trim(),
        http_codes: form.codes.split(/[,，\s]+/).filter(Boolean),
        response_patterns: form.patterns.split(/[,，]+/).map((s) => s.trim()).filter(Boolean),
        ui_symptoms: form.symptoms.split(/[,，]+/).map((s) => s.trim()).filter(Boolean),
        root_cause: form.root_cause,
        conclusion: form.conclusion.trim(),
        solution: form.solution.split('\n').map((s) => s.trim()).filter(Boolean),
        priority: '中',
    }
}

async function runPreview() {
    if (!form.name.trim()) { alert('请先填写场景名称'); return }
    if (!form.codes.trim()) { alert('请先填写状态码'); return }
    const firstCode = form.codes.split(/[,，\s]+/).filter(Boolean)[0] || ''
    if (!form.test_status.trim()) form.test_status = firstCode
    previewing.value = true
    try {
        preview.value = await api('/api/scenario-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...payload(),
                test_status: form.test_status.trim(),
                test_response: form.test_response.trim(),
                test_symptom: form.test_symptom.trim(),
            }),
        })
    } catch (e) {
        alert('验证失败：' + e.message)
    } finally {
        previewing.value = false
    }
}

async function save() {
    const name = form.name.trim()
    const codes = form.codes.trim()
    if (!name) { alert('请填写场景名称'); return }
    if (!codes) { alert('请填写状态码'); return }
    if (!form.root_cause) { alert('请选择问题归属'); return }
    saving.value = true
    try {
        const data = await api('/api/add-scenario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload()),
        })
        const warning = preview.value && !preview.value.would_match
            ? '\n注意：当前预检不会命中，建议补充更具体的响应特征或症状关键词。'
            : ''
        alert('场景已保存！当前共 ' + data.total + ' 个场景。' + warning)
        form.name = ''; form.codes = ''; form.patterns = ''
        form.symptoms = ''; form.conclusion = ''; form.solution = ''
        form.test_status = ''; form.test_response = ''; form.test_symptom = ''
        preview.value = null
        await loadScenarios()
        emit('saved')
    } catch (e) {
        alert('保存失败：' + e.message)
    } finally {
        saving.value = false
    }
}

onMounted(async () => {
    try {
        if (!Object.keys(store.categoryLabels).length) await loadScenarios()
        form.root_cause = Object.keys(store.categoryLabels)[0] || ''
    } catch (e) {
        console.error('加载归属失败', e)
    }
})
</script>

<style scoped>
.preview-box {
    margin: 16px 0;
    padding: 15px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--primary);
    border-radius: 8px;
    background: var(--bg-inset);
}

.preview-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
}

.preview-head h3 {
    font-size: 14px;
}

.preview-head p {
    margin-top: 3px;
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.6;
}

.preview-head .btn {
    flex: 0 0 auto;
}

.preview-fields {
    margin-top: 12px;
}

.preview-result {
    padding: 11px 12px;
    border-radius: 7px;
    font-size: 12px;
}

.preview-result.good {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 7%, transparent);
}

.preview-result.warn {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 7%, transparent);
}

.preview-result ul {
    margin: 7px 0 5px 18px;
}

.preview-result p {
    color: var(--text-dim);
    font-size: 11px;
}

@media (max-width: 720px) {
    .preview-head {
        flex-direction: column;
    }
}
</style>

<template>
    <section v-if="mode && mode.active" class="unknown-panel">
        <div class="unknown-banner">
            <div class="unknown-mark"><SearchCheck :size="21" /></div>
            <div>
                <span class="unknown-kicker">UNKNOWN CASE MODE</span>
                <h2>未进入高置信场景，不强行匹配</h2>
                <p>{{ mode.reason }}</p>
            </div>
        </div>

        <div class="unknown-grid">
            <article class="unknown-card">
                <h3>现场信息采集</h3>
                <ul class="check-list">
                    <li v-for="item in mode.site_checklist" :key="item.id" :class="{ done: item.collected }">
                        <span class="check-icon">{{ item.collected ? '✓' : '○' }}</span>
                        <div>
                            <strong>{{ item.label }}</strong>
                            <small>{{ item.hint }}</small>
                        </div>
                    </li>
                </ul>
            </article>

            <article class="unknown-card">
                <h3>分层判断</h3>
                <div class="layer-list">
                    <div v-for="layer in mode.layers" :key="layer.key" class="layer-row">
                        <span class="layer-name">{{ layer.label }}</span>
                        <span class="layer-state" :class="`state-${layer.status}`">
                            {{ statusLabel(layer.status) }}
                        </span>
                        <p>{{ layer.evidence }}</p>
                        <small>{{ layer.next }}</small>
                    </div>
                </div>
            </article>
        </div>

        <div class="unknown-summary">
            <div><strong>已排除</strong><span>{{ mode.ruled_out.join('、') || '暂无' }}</span></div>
            <div><strong>当前怀疑</strong><span>{{ mode.suspected.join('、') || '暂无' }}</span></div>
            <div><strong>还未确认</strong><span>{{ mode.unconfirmed.join('、') || '暂无' }}</span></div>
        </div>

        <article class="unknown-card">
            <h3>下一项只读验证</h3>
            <div class="experiment-list">
                <div v-for="item in mode.next_experiments" :key="item.title" class="experiment-item">
                    <span class="priority">{{ item.priority }}</span>
                    <div>
                        <strong>{{ item.title }}</strong>
                        <p>{{ item.action }}</p>
                        <small>预期信号：{{ item.expected_signal }} · {{ item.risk }}</small>
                    </div>
                </div>
            </div>
        </article>

        <article class="unknown-card">
            <div class="handoff-head">
                <h3>研发交接包</h3>
                <button class="btn btn-ghost" @click="copyHandoff">复制交接包</button>
            </div>
            <pre class="handoff-text">{{ handoffText }}</pre>
        </article>

        <article v-if="!promoted" class="unknown-card promotion-card">
            <h3>问题已解决，归档为场景</h3>
            <p class="promotion-hint">提交最终根因后自动加入自定义场景库，并生成一份待审核的通用规则候选。</p>
            <div class="promotion-grid">
                <label>
                    <span>场景名称</span>
                    <input v-model="promotion.scenario_name" type="text" />
                </label>
                <label>
                    <span>最终归属</span>
                    <select v-model="promotion.root_cause">
                        <option v-for="(label, key) in categoryLabels" :key="key" :value="key">{{ label }}</option>
                    </select>
                </label>
                <label class="wide">
                    <span>最终根因</span>
                    <textarea v-model="promotion.conclusion" rows="3" placeholder="说明真正根因、触发条件和证据"></textarea>
                </label>
                <label class="wide">
                    <span>解决动作，每行一条</span>
                    <textarea v-model="solutionText" rows="3" placeholder="修复动作&#10;验证动作"></textarea>
                </label>
                <label>
                    <span>负责人</span>
                    <input v-model="promotion.owner" type="text" placeholder="可选" />
                </label>
            </div>
            <div class="btn-row">
                <button class="btn btn-primary" :disabled="saving" @click="promote">
                    {{ saving ? '归档中...' : '归档并加入场景库' }}
                </button>
            </div>
        </article>

        <div v-else class="promotion-done">
            <CheckCircle2 :size="18" />
            {{ promoted.message }} · 场景 {{ promoted.scenario?.id }}
        </div>
    </section>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { CheckCircle2, SearchCheck } from 'lucide-vue-next'
import { promoteUnknownCase, store } from '../api'

const props = defineProps({
    report: { type: Object, required: true }
})
const emit = defineEmits(['promoted'])
const mode = computed(() => props.report?.unknown_mode)
const categoryLabels = computed(() => store.categoryLabels || {})
const defaults = mode.value?.promotion_defaults || {}
const promotion = reactive({
    scenario_name: defaults.scenario_name || '',
    root_cause: defaults.root_cause || 'backend',
    conclusion: '',
    owner: '',
    evidence: defaults.ui_symptoms || [],
    response_patterns: defaults.response_patterns || [],
    ui_symptoms: defaults.ui_symptoms || []
})
const solutionText = ref('')
const saving = ref(false)
const promoted = ref(null)

const handoffText = computed(() => {
    const handoff = mode.value?.handoff || {}
    const lines = [
        handoff.title || 'FaultDetect 未知问题交接包',
        `URL：${handoff.url || '—'}`,
        `症状：${handoff.symptom || '—'}`,
        `观测状态：${handoff.observed_status || '—'}`,
        `已排除：${(handoff.ruled_out || []).join('、') || '暂无'}`,
        `当前怀疑：${(handoff.suspected || []).join('、') || '暂无'}`,
        `还未确认：${(handoff.unconfirmed || []).join('、') || '暂无'}`,
        '',
        '候选假设：'
    ]
    for (const item of handoff.hypotheses || []) {
        lines.push(`- ${item.title}（${Math.round((item.confidence || 0) * 100)}%）`)
    }
    lines.push('', '需要补充：')
    for (const item of handoff.required_evidence || []) {
        lines.push(`- ${item}`)
    }
    return lines.join('\n')
})

function statusLabel(value) {
    return {
        ruled_out: '已排除',
        suspected: '疑似',
        unconfirmed: '待确认',
        observed: '已观测'
    }[value] || value
}

async function copyHandoff() {
    try {
        await navigator.clipboard.writeText(handoffText.value)
        alert('研发交接包已复制')
    } catch {
        alert('复制失败，请手动选择交接包文本')
    }
}

async function promote() {
    if (!String(promotion.conclusion).trim()) {
        alert('请填写最终根因')
        return
    }
    saving.value = true
    try {
        const solutions = solutionText.value
            .split(/\r?\n/)
            .map(item => item.trim())
            .filter(Boolean)
        promoted.value = await promoteUnknownCase(props.report.report_id, {
            scenario_name: promotion.scenario_name,
            root_cause: promotion.root_cause,
            conclusion: promotion.conclusion,
            owner: promotion.owner,
            evidence: promotion.evidence,
            response_patterns: promotion.response_patterns,
            ui_symptoms: promotion.ui_symptoms,
            solution: solutions
        })
        emit('promoted', promoted.value)
    } catch (error) {
        alert('归档失败：' + error.message)
    } finally {
        saving.value = false
    }
}
</script>

<style scoped>
.unknown-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 14px;
}
.unknown-banner {
    display: flex;
    gap: 14px;
    padding: 18px 20px;
    border: 1px solid color-mix(in srgb, var(--warning) 32%, var(--border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--warning) 7%, var(--bg-card));
}
.unknown-mark {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    flex: 0 0 40px;
    border-radius: 8px;
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 12%, transparent);
}
.unknown-kicker { color: var(--warning); font-size: 10px; font-weight: 700; letter-spacing: .08em; }
.unknown-banner h2 { margin-top: 2px; font-size: 18px; }
.unknown-banner p { margin-top: 4px; color: var(--text-dim); font-size: 12px; }
.unknown-grid { display: grid; grid-template-columns: 1fr 1.25fr; gap: 14px; }
.unknown-card {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-card);
}
.unknown-card h3 { margin-bottom: 12px; font-size: 14px; }
.check-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.check-list li { display: flex; align-items: flex-start; gap: 8px; }
.check-icon { color: var(--text-dim); }
.check-list li.done .check-icon { color: var(--success); }
.check-list div { display: flex; flex-direction: column; }
.check-list strong { font-size: 12px; }
.check-list small { color: var(--text-dim); font-size: 10px; }
.layer-list { display: flex; flex-direction: column; gap: 9px; }
.layer-row {
    display: grid;
    grid-template-columns: 44px 64px 1fr;
    gap: 3px 8px;
    align-items: center;
}
.layer-name { font-size: 12px; font-weight: 650; }
.layer-state {
    width: fit-content;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
}
.state-ruled_out { color: var(--success); background: color-mix(in srgb, var(--success) 11%, transparent); }
.state-suspected { color: var(--warning); background: color-mix(in srgb, var(--warning) 12%, transparent); }
.state-unconfirmed { color: var(--text-dim); background: color-mix(in srgb, var(--text-dim) 10%, transparent); }
.state-observed { color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, transparent); }
.layer-row p { grid-column: 3; font-size: 11px; }
.layer-row small { grid-column: 3; color: var(--text-dim); font-size: 10px; }
.unknown-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--border);
}
.unknown-summary div { padding: 12px 14px; background: var(--bg-card); }
.unknown-summary strong { display: block; font-size: 11px; }
.unknown-summary span { color: var(--text-dim); font-size: 11px; }
.experiment-list { display: flex; flex-direction: column; gap: 9px; }
.experiment-item { display: flex; gap: 10px; padding: 10px 12px; border-radius: 7px; background: var(--bg-inset); }
.priority {
    height: 22px;
    padding: 1px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary) 11%, transparent);
    color: var(--primary);
    font-size: 10px;
    font-weight: 700;
}
.experiment-item div { display: flex; flex-direction: column; }
.experiment-item strong { font-size: 12px; }
.experiment-item p { color: var(--text); font-size: 11px; }
.experiment-item small { color: var(--text-dim); font-size: 10px; }
.handoff-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.handoff-text {
    margin-top: 10px;
    max-height: 360px;
    overflow: auto;
    white-space: pre-wrap;
    padding: 13px;
    border-radius: 7px;
    background: var(--bg-inset);
    color: var(--code-text);
    font: 11px/1.7 Consolas, "Courier New", monospace;
}
.promotion-hint { margin: -4px 0 12px; color: var(--text-dim); font-size: 11px; }
.promotion-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.promotion-grid label { display: flex; flex-direction: column; gap: 5px; }
.promotion-grid label > span { color: var(--text-dim); font-size: 11px; font-weight: 600; }
.promotion-grid .wide { grid-column: 1 / -1; }
.promotion-done {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--success) 11%, transparent);
    color: var(--success);
    font-size: 12px;
}
@media (max-width: 980px) {
    .unknown-grid { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
    .unknown-summary { grid-template-columns: 1fr; }
    .promotion-grid { grid-template-columns: 1fr; }
    .promotion-grid .wide { grid-column: auto; }
}
</style>

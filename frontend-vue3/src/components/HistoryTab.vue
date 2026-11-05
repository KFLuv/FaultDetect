<template>
    <section>
        <div class="card">
            <div class="toolbar">
                <h2>诊断任务与跟进</h2>
                <div class="tb-actions">
                    <button class="btn btn-ghost" @click="load">刷新</button>
                    <button v-if="list.length" class="btn btn-ghost danger" @click="clearAll">清空全部</button>
                </div>
            </div>
            <p class="hint">
                检测完成后任务进入“待确认”。可在这里记录负责人、跟进备注、关闭原因，重新检测，或导出单条报告。
            </p>
            <div v-if="!list.length" class="empty-tip">暂无诊断任务</div>
            <div v-else class="case-list">
                <article v-for="item in list" :key="item.report_id" class="case-item">
                    <div class="case-head">
                        <div class="case-status" :style="{ color: catColor(guessCategory(item.root_cause)) }">
                            {{ item.status_code || '—' }}
                        </div>
                        <div class="case-title">
                            <div class="case-url">{{ item.url }}</div>
                            <div class="case-meta">
                                <span class="mono">{{ item.report_id }}</span>
                                <span>{{ item.updated_at || item.ts }}</span>
                                <span>{{ item.root_cause || '未分类' }}</span>
                                <span>{{ item.scenario_name || '未匹配' }}</span>
                            </div>
                        </div>
                        <span class="status-badge" :class="`status-${item.case_status}`">
                            {{ statusLabel(item.case_status) }}
                        </span>
                    </div>

                    <div class="case-grid">
                        <label>
                            <span>任务状态</span>
                            <select v-model="item.case_status">
                                <option v-for="option in statusOptions" :key="option.value" :value="option.value">
                                    {{ option.label }}
                                </option>
                            </select>
                        </label>
                        <label>
                            <span>负责人</span>
                            <input v-model="item.owner" type="text" placeholder="填写负责人" />
                        </label>
                        <label class="wide">
                            <span>跟进备注</span>
                            <input v-model="item.follow_up_note" type="text" placeholder="例如：已联系研发，等待日志" />
                        </label>
                        <label v-if="item.case_status === 'closed'" class="wide">
                            <span>关闭原因</span>
                            <input v-model="item.closed_reason" type="text" placeholder="关闭任务时必须填写" />
                        </label>
                    </div>

                    <div class="case-actions">
                        <button class="btn btn-primary" @click="save(item)">保存跟进</button>
                        <button class="btn btn-ghost" @click="$emit('retry', item)">重新检测</button>
                        <button class="btn btn-ghost" @click="exportReport(item, 'json')">导出 JSON</button>
                        <button class="btn btn-ghost" @click="exportReport(item, 'markdown')">导出 Markdown</button>
                        <button class="btn btn-ghost danger" @click="remove(item)">删除</button>
                    </div>
                </article>
            </div>
        </div>
    </section>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { api, catColor, guessCategory } from '../api'

const emit = defineEmits(['changed', 'retry'])
const props = defineProps({
    active: { type: Boolean, default: false }
})
const list = ref([])
let timer = null

const statusOptions = [
    { value: 'new', label: '新建' },
    { value: 'in_progress', label: '排查中' },
    { value: 'waiting_confirmation', label: '待确认' },
    { value: 'fixed', label: '已修复' },
    { value: 'closed', label: '已关闭' }
]

watch(() => props.active, (value) => {
    if (value) load()
})

async function load() {
    try {
        const data = await api('/api/history?limit=100')
        list.value = data.history || []
    } catch (error) {
        console.error('加载任务失败', error)
    }
}

async function save(item) {
    if (item.case_status === 'closed' && !String(item.closed_reason || '').trim()) {
        alert('关闭任务时必须填写关闭原因')
        return
    }
    try {
        await api(`/api/history/${encodeURIComponent(item.report_id)}/follow-up`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: item.case_status,
                owner: item.owner || '',
                note: item.follow_up_note || '',
                closed_reason: item.closed_reason || ''
            })
        })
        await load()
        emit('changed')
    } catch (error) {
        alert('保存跟进失败：' + error.message)
    }
}

function exportReport(item, format) {
    window.open(
        `/api/history/${encodeURIComponent(item.report_id)}/export?format=${format}`,
        '_blank'
    )
}

async function remove(item) {
    if (!confirm(`确定删除报告 ${item.report_id}？此操作不可恢复。`)) return
    try {
        await api(`/api/history/${encodeURIComponent(item.report_id)}`, { method: 'DELETE' })
        await load()
        emit('changed')
    } catch (error) {
        alert('删除失败：' + error.message)
    }
}

async function clearAll() {
    if (!confirm('确定清空全部诊断任务？此操作不可恢复。')) return
    try {
        await api('/api/history', { method: 'DELETE' })
        list.value = []
        emit('changed')
    } catch (error) {
        alert('清空失败：' + error.message)
    }
}

function statusLabel(value) {
    return statusOptions.find(option => option.value === value)?.label || value || '新建'
}

onMounted(() => {
    load()
    timer = setInterval(load, 30000)
})

onUnmounted(() => {
    if (timer) clearInterval(timer)
})
</script>

<style scoped>
.case-list { display: flex; flex-direction: column; gap: 12px; }
.case-item {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-inset);
}
.case-head { display: flex; align-items: flex-start; gap: 12px; }
.case-status {
    min-width: 62px;
    padding: 8px 10px;
    border: 1px solid currentColor;
    border-radius: 8px;
    background: var(--bg-card);
    text-align: center;
    font-size: 20px;
    font-weight: 800;
}
.case-title { min-width: 0; flex: 1; }
.case-url { color: var(--text); font-size: 14px; font-weight: 650; word-break: break-all; }
.case-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 5px;
    color: var(--text-dim);
    font-size: 11px;
}
.mono { font-family: Consolas, "Courier New", monospace; }
.status-badge {
    flex: 0 0 auto;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
}
.status-new { background: color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary); }
.status-in_progress { background: color-mix(in srgb, var(--warning) 14%, transparent); color: var(--warning); }
.status-waiting_confirmation { background: color-mix(in srgb, #8b5cf6 12%, transparent); color: #7c3aed; }
.status-fixed { background: color-mix(in srgb, var(--success) 13%, transparent); color: var(--success); }
.status-closed { background: color-mix(in srgb, var(--text-dim) 13%, transparent); color: var(--text-dim); }
.case-grid {
    display: grid;
    grid-template-columns: minmax(150px, .7fr) minmax(180px, 1fr) minmax(260px, 1.6fr);
    gap: 10px;
    margin-top: 14px;
}
.case-grid label { display: flex; flex-direction: column; gap: 5px; }
.case-grid label > span { color: var(--text-dim); font-size: 11px; font-weight: 600; }
.case-grid .wide { grid-column: span 2; }
.case-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
@media (max-width: 980px) {
    .case-grid { grid-template-columns: 1fr 1fr; }
    .case-grid .wide { grid-column: 1 / -1; }
}
@media (max-width: 640px) {
    .case-head { flex-wrap: wrap; }
    .status-badge { margin-left: 74px; }
    .case-grid { grid-template-columns: 1fr; }
    .case-grid .wide { grid-column: auto; }
}
</style>

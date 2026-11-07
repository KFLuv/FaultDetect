<template>
    <section>
        <div class="card">
            <h2>🔢 状态码知识库（{{ store.statusCodes.length }} 个）</h2>
            <div class="toolbar">
                <input
                    v-model="keyword"
                    type="text"
                    placeholder="搜索状态码、名称、说明或排查建议..."
                >
                <select v-model="categoryFilter">
                    <option value="">全部类别</option>
                    <option v-for="category in categories" :key="category" :value="category">
                        {{ category }}
                    </option>
                </select>
                <span class="toolbar-hint">共 {{ filtered.length }} / {{ store.statusCodes.length }} 个</span>
            </div>
            <div v-if="!store.statusCodes.length" class="empty-tip">加载中...</div>
            <div v-else-if="!filtered.length" class="empty-tip">没有匹配的状态码</div>
            <div v-else class="code-grid">
                <div v-for="c in filtered" :key="c.code" class="code-card">
                    <div class="code-num">{{ c.code }}</div>
                    <div class="code-name">{{ c.name }}</div>
                    <div class="code-cat">
                        <template v-if="c.problem_category && c.problem_category.length">
                            <span v-for="(x, i) in c.problem_category" :key="i" style="color:var(--text-dim)">{{ i > 0 ? ' · ' : '' }}{{ x }}</span>
                        </template>
                        <template v-else>—</template>
                    </div>
                    <div class="code-desc">{{ c.description || '' }}</div>
                    <div class="code-memory">📌 {{ c.memory || '' }}</div>
                </div>
            </div>
        </div>
    </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { store, loadStatusCodes } from '../api'

const keyword = ref('')
const categoryFilter = ref('')

const categories = computed(() => (
    [...new Set(store.statusCodes.map(item => item.category).filter(Boolean))].sort()
))

const filtered = computed(() => {
    const query = keyword.value.trim().toLowerCase()
    return store.statusCodes.filter(item => {
        if (categoryFilter.value && item.category !== categoryFilter.value) return false
        if (!query) return true
        const haystack = [
            item.code,
            item.name,
            item.category,
            item.description,
            item.memory,
            item.next_step,
            ...(item.problem_category || []),
            ...(item.typical || [])
        ].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(query)
    })
})

onMounted(async () => {
    try {
        await loadStatusCodes()
    } catch (e) {
        console.error('加载状态码失败', e)
    }
})
</script>

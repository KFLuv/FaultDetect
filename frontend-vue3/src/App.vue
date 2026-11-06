<template>
    <div class="app-shell">
        <aside class="sidebar" aria-label="主导航">
            <div class="brand-row">
                <div class="brand-mark">
                    <ShieldCheck :size="21" />
                </div>
                <div class="brand-copy">
                    <strong>FaultDetect</strong>
                    <span>可审计排障工作台</span>
                </div>
            </div>

            <div class="safety-card">
                <span class="status-dot"></span>
                <div>
                    <strong>只读诊断模式</strong>
                    <span>GET / HEAD · 不写入目标系统</span>
                </div>
            </div>

            <div class="nav-label">诊断工作区</div>
            <nav class="side-nav">
                <button
                    v-for="item in navItems"
                    :key="item.key"
                    type="button"
                    class="side-nav-item"
                    :class="{ active: tab === item.key }"
                    :title="item.label"
                    :aria-current="tab === item.key ? 'page' : undefined"
                    @click="tab = item.key"
                >
                    <component :is="item.icon" :size="18" />
                    <span class="nav-text">{{ item.label }}</span>
                    <span v-if="navBadge(item.key)" class="nav-count">{{ navBadge(item.key) }}</span>
                </button>
            </nav>

            <div class="sidebar-spacer"></div>

            <div class="sidebar-actions">
                <button type="button" class="utility-btn" title="模型设置" @click="llmSettingsOpen = true">
                    <Settings2 :size="17" />
                    <span>模型设置</span>
                </button>
                <button type="button" class="utility-btn" :title="theme === 'dark' ? '切换浅色模式' : '切换深色模式'" @click="toggleTheme">
                    <Sun v-if="theme === 'dark'" :size="17" />
                    <Moon v-else :size="17" />
                    <span>{{ theme === 'dark' ? '浅色模式' : '深色模式' }}</span>
                </button>
                <button type="button" class="utility-btn" title="刷新页面数据" @click="refreshPage">
                    <RefreshCw :size="17" />
                    <span>刷新数据</span>
                </button>
            </div>

            <div class="sidebar-foot">
                <div class="foot-metric">
                    <Activity :size="15" />
                    <div>
                        <strong>7/8 观测层</strong>
                        <span>10/10 归因层 · v1.3.4</span>
                    </div>
                </div>
            </div>
        </aside>

        <main class="main-content">
            <header class="topbar">
                <div class="page-heading">
                    <span class="eyebrow">{{ currentNav.kicker }}</span>
                    <h1>{{ currentNav.label }}</h1>
                    <p>{{ currentNav.description }}</p>
                </div>
                <div class="topbar-meta">
                    <span class="meta-pill safe">
                        <LockKeyhole :size="14" />
                        只读安全
                    </span>
                    <span class="meta-pill">
                        <Gauge :size="14" />
                        {{ stats.total_status_codes ?? '—' }} 状态码
                    </span>
                </div>
            </header>

            <section class="overview-strip" aria-label="知识库统计">
                <div class="overview-item">
                    <span>场景库</span>
                    <strong>{{ stats.total_scenarios ?? '—' }}</strong>
                    <small>条匹配规则</small>
                </div>
                <div class="overview-item">
                    <span>状态码</span>
                    <strong>{{ stats.total_status_codes ?? '—' }}</strong>
                    <small>条解释知识</small>
                </div>
                <div class="overview-item">
                    <span>自定义场景</span>
                    <strong>{{ stats.custom_scenarios ?? '—' }}</strong>
                    <small>条本地扩展</small>
                </div>
                <div class="overview-item">
                    <span>检测历史</span>
                    <strong>{{ stats.history_count ?? '—' }}</strong>
                    <small>条跟进记录</small>
                </div>
            </section>

            <section class="workspace-content">
                <DetectTab v-show="tab === 'detect'" :preset="detectPreset" @changed="reloadStats" />
                <TutorialTab v-show="tab === 'tutorial'" @demo-opened="tab = 'detect'" />
                <ScenariosTab v-show="tab === 'scenarios'" />
                <StatusCodesTab v-show="tab === 'status-codes'" />
                <HistoryTab
                    v-show="tab === 'history'"
                    :active="tab === 'history'"
                    @changed="reloadStats"
                    @retry="retryCase"
                />
                <AddScenarioTab v-show="tab === 'add'" @saved="reloadStats" />
                <SelfCheckTab v-show="tab === 'selfcheck'" />
            </section>

            <footer class="app-footer">
                FaultDetect v1.3.4 · 7 步只读排障 Workflow · 观测层与归因层分开验证
            </footer>
        </main>

        <LlmSettings v-if="llmSettingsOpen" @close="llmSettingsOpen = false" />
    </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
    Activity,
    FlaskConical,
    Gauge,
    GraduationCap,
    Hash,
    History,
    LibraryBig,
    LockKeyhole,
    Moon,
    PlusCircle,
    RefreshCw,
    ScanSearch,
    Settings2,
    ShieldCheck,
    Sun
} from 'lucide-vue-next'
import DetectTab from './components/DetectTab.vue'
import TutorialTab from './components/TutorialTab.vue'
import ScenariosTab from './components/ScenariosTab.vue'
import StatusCodesTab from './components/StatusCodesTab.vue'
import HistoryTab from './components/HistoryTab.vue'
import AddScenarioTab from './components/AddScenarioTab.vue'
import SelfCheckTab from './components/SelfCheckTab.vue'
import LlmSettings from './components/LlmSettings.vue'
import { getStats } from './api'

const tab = ref('detect')
const stats = ref({})
const detectPreset = ref(null)
const llmSettingsOpen = ref(false)

const navItems = [
    {
        key: 'detect',
        label: '故障检测',
        kicker: 'DIAGNOSE',
        description: '输入目标 URL 与症状，执行 7 步观测、差分实验和归因推理。',
        icon: ScanSearch
    },
    {
        key: 'tutorial',
        label: '使用教学',
        kicker: 'GUIDE',
        description: '先在内置模拟系统里走一遍采集和诊断，再用于真实 Web 业务系统。',
        icon: GraduationCap
    },
    {
        key: 'scenarios',
        label: '场景库',
        kicker: 'KNOWLEDGE',
        description: '浏览知识库匹配规则，查看触发特征、归属与解决方案。',
        icon: LibraryBig
    },
    {
        key: 'status-codes',
        label: '状态码',
        kicker: 'REFERENCE',
        description: '查询状态码语义、问题归属和下一步排查建议。',
        icon: Hash
    },
    {
        key: 'history',
        label: '历史记录',
        kicker: 'FOLLOW-UP',
        description: '回看已有诊断结果，继续跟进问题处理状态。',
        icon: History
    },
    {
        key: 'add',
        label: '新增场景',
        kicker: 'EXTEND',
        description: '沉淀新的故障现象、响应特征和可复用解决路径。',
        icon: PlusCircle
    },
    {
        key: 'selfcheck',
        label: '系统自检',
        kicker: 'VERIFY',
        description: '分别验证观测层和归因层，保留已知差异而不是掩盖。',
        icon: FlaskConical
    }
]

const currentNav = computed(() => navItems.find((item) => item.key === tab.value) || navItems[0])
const theme = ref(localStorage.getItem('fds-theme') || 'light')

watch(theme, (value) => {
    document.body.dataset.theme = value
    localStorage.setItem('fds-theme', value)
}, { immediate: true })

function navBadge(key) {
    if (key === 'scenarios') return stats.value.total_scenarios
    if (key === 'status-codes') return stats.value.total_status_codes
    if (key === 'history') return stats.value.history_count
    return ''
}

function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

function refreshPage() {
    window.location.reload()
}

function retryCase(item) {
    detectPreset.value = {
        url: item.url || '',
        symptom: item.symptom || '',
        nonce: Date.now()
    }
    tab.value = 'detect'
}

async function reloadStats() {
    try {
        stats.value = await getStats()
    } catch (error) {
        console.error('加载统计失败', error)
    }
}

onMounted(reloadStats)
</script>

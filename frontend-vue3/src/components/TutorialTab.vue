<template>
    <section class="tutorial-page">
        <div class="tutorial-lead">
            <div class="tutorial-mark"><GraduationCap :size="25" /></div>
            <div>
                <span class="tutorial-kicker">GUIDED PRACTICE</span>
                <h2>从问题页面到诊断报告</h2>
                <p>不需要 F12。把业务系统打开在 FaultDetect 内置窗口里，记录一次出错操作，再从候选请求中选择要诊断的接口。</p>
            </div>
        </div>

        <div class="flow-grid" aria-label="一键采集流程">
            <article>
                <span>01</span>
                <AppWindow :size="20" />
                <h3>打开业务系统</h3>
                <p>粘贴系统首页地址。业务系统直接打开在 FaultDetect 主窗口内。</p>
            </article>
            <article>
                <span>02</span>
                <MousePointerClick :size="20" />
                <h3>开始记录</h3>
                <p>登录并进入目标页面后，主动点击“开始记录本次问题”。</p>
            </article>
            <article>
                <span>03</span>
                <MousePointer2 :size="20" />
                <h3>复现一次问题</h3>
                <p>点击出问题的业务按钮，系统关联按钮文字与它触发的请求。</p>
            </article>
            <article>
                <span>04</span>
                <ScanSearch :size="20" />
                <h3>选择并诊断</h3>
                <p>失败请求优先展示，确认授权后自动带入登录态执行检测。</p>
            </article>
        </div>

        <div class="demo-panel">
            <div>
                <span class="demo-label">内置安全练习</span>
                <h3>先用模拟业务系统走一遍</h3>
                <p>不会访问真实公司系统，也不会提交真实数据。演示包含正常查询、失败查询和提交类请求。</p>
            </div>
            <button v-if="desktopAvailable" type="button" class="btn btn-primary" @click="openDemo">
                <PlayCircle :size="17" />
                打开内置教学演示
            </button>
            <span v-else class="desktop-only">
                <Info :size="15" />
                内置教学演示需要在桌面版中打开
            </span>
        </div>

        <section class="demo-urls">
            <div class="panel-heading">
                <Copy :size="18" />
                <div>
                    <h3>可直接打开或复制的演示网站</h3>
                    <p>打开网页后点击里面的业务按钮；也可以复制网址发给别人。</p>
                </div>
            </div>
            <div class="demo-url-list">
                <div v-for="item in demoCases" :key="item.url" class="demo-url-row">
                    <span class="demo-badge">{{ item.tag }}</span>
                    <div>
                        <strong>{{ item.name }}</strong>
                        <code>{{ item.url }}</code>
                        <span class="demo-desc">{{ item.description }}</span>
                    </div>
                    <button v-if="desktopAvailable" type="button" class="open-site" @click="openDemoSite(item)">
                        <ExternalLink :size="14" />
                        打开
                    </button>
                    <button type="button" class="copy-url" @click="copyDemoUrl(item)">
                        <Check v-if="copiedUrl === item.url" :size="14" />
                        <Copy v-else :size="14" />
                        {{ copiedUrl === item.url ? '已复制' : '复制' }}
                    </button>
                </div>
            </div>
        </section>

        <div class="tutorial-columns">
            <section class="lesson-panel">
                <div class="panel-heading">
                    <ListChecks :size="18" />
                    <div>
                        <h3>演示时请检查</h3>
                        <p>每一步都有可以观察的结果</p>
                    </div>
                </div>
                <ol>
                    <li><strong>待机不记录：</strong>打开页面后先不开始记录，正常点击不会进入候选列表。</li>
                    <li><strong>按钮被关联：</strong>点击“查询订单（失败）”后，候选请求会显示这个按钮名称。</li>
                    <li><strong>优先失败：</strong><span class="mono">GET HTTP 500</span> 排在正常请求前面。</li>
                    <li><strong>凭证不展示：</strong>列表和报告不会显示演示 Token 或 Cookie。</li>
                    <li><strong>提交类不重放：</strong><span class="mono">POST</span> 请求只提供“复制交接信息”。</li>
                </ol>
            </section>

            <section class="lesson-panel scope-panel">
                <div class="panel-heading">
                    <ShieldCheck :size="18" />
                    <div>
                        <h3>适用边界</h3>
                        <p>避免把内置采集理解成系统级监控</p>
                    </div>
                </div>
                <div class="scope-row">
                    <CheckCircle2 :size="16" />
                    <span>支持：在 FaultDetect 内置窗口打开的 Web 系统</span>
                </div>
                <div class="scope-row">
                    <CheckCircle2 :size="16" />
                    <span>支持：普通账号、Cookie、Bearer Token 和自定义认证头</span>
                </div>
                <div class="scope-row limited">
                    <MinusCircle :size="16" />
                    <span>不监听：原来 Chrome / Edge 中的页面</span>
                </div>
                <div class="scope-row limited">
                    <MinusCircle :size="16" />
                    <span>不监听：手机 App 或原生桌面客户端</span>
                </div>
                <div class="scope-row">
                    <CheckCircle2 :size="16" />
                    <span>URL 自带 token 查询参数时会按原 URL 发送；内置采集还会自动补 Cookie / Authorization。</span>
                </div>
                <div class="scope-row limited">
                    <MinusCircle :size="16" />
                    <span>手动输入 URL 时，系统不会从你原来的浏览器里自动读取 Cookie。</span>
                </div>
                <div class="scope-row">
                    <CheckCircle2 :size="16" />
                    <span>未知问题先进入未知场景模式；确认最终根因后，才由用户归档到场景库。</span>
                </div>
            </section>
        </div>

        <section class="capability-matrix">
            <div class="panel-heading">
                <ShieldCheck :size="18" />
                <div>
                    <h3>FaultDetect 现在到底能测什么</h3>
                    <p>按现场证据来源拆分。这里写的是能力边界，不是“所有问题都能自动定位”的承诺。</p>
                </div>
            </div>

            <div class="capability-grid">
                <article v-for="group in capabilityGroups" :key="group.title">
                    <h4>{{ group.title }}</h4>
                    <ul>
                        <li v-for="item in group.items" :key="item">{{ item }}</li>
                    </ul>
                </article>
            </div>

            <div class="scope-matrix">
                <article class="scope-column supported">
                    <h4>可直接做</h4>
                    <ul>
                        <li>Web HTTP / HTTPS 接口与页面</li>
                        <li>GET / HEAD 只读自动检测</li>
                        <li>内置窗口采集和按钮请求关联</li>
                        <li>POST 等写请求失败快照</li>
                        <li>Cookie、Token、自定义头和 Trace ID</li>
                    </ul>
                </article>
                <article class="scope-column limited">
                    <h4>有条件可用</h4>
                    <ul>
                        <li v-for="item in limitedCases" :key="item">{{ item }}</li>
                    </ul>
                </article>
                <article class="scope-column unsupported">
                    <h4>明确不覆盖</h4>
                    <ul>
                        <li v-for="item in unsupportedCases" :key="item">{{ item }}</li>
                    </ul>
                </article>
            </div>

            <details class="scenario-catalog">
                <summary>
                    展开全部 {{ store.allScenarios.length }} 个内置可匹配故障场景
                </summary>
                <p class="catalog-note">
                    这些是知识库可识别、可辅助归因的场景，不等于每个现场问题都能一次定位。
                    最终结论仍需结合实测状态码、响应内容、差分结果、Trace 和现场日志复核。
                </p>
                <div class="scenario-groups">
                    <article v-for="group in groupedScenarios" :key="group.key" class="scenario-group">
                        <h4>
                            {{ group.label }}
                            <span>{{ group.items.length }}</span>
                        </h4>
                        <div class="scenario-chips">
                            <span v-for="scenario in group.items" :key="scenario.id">
                                {{ scenario.name }}
                            </span>
                        </div>
                    </article>
                </div>
            </details>
        </section>

        <section class="real-system">
            <div class="panel-heading">
                <BriefcaseBusiness :size="18" />
                <div>
                    <h3>第一次测试真实系统</h3>
                    <p>优先使用测试环境，并先选只读操作</p>
                </div>
            </div>
            <div class="check-grid">
                <div><span>1</span>打开登录页，正常登录</div>
                <div><span>2</span>进入目标页面，不要先记录</div>
                <div><span>3</span>开始记录后点击失败按钮</div>
                <div><span>4</span>只选择 GET 查询请求检测</div>
            </div>
        </section>
    </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import {
    AppWindow,
    BriefcaseBusiness,
    CheckCircle2,
    Check,
    Copy,
    ExternalLink,
    GraduationCap,
    Info,
    ListChecks,
    MinusCircle,
    MousePointer2,
    MousePointerClick,
    PlayCircle,
    ScanSearch,
    ShieldCheck
} from 'lucide-vue-next'
import { catLabel, copyText, loadScenarios, store } from '../api'

const emit = defineEmits(['demo-opened'])
const desktopAvailable = Boolean(window.faultDetectDesktop?.openCapture)
const origin = window.location.origin
const copiedUrl = ref('')
const capabilityGroups = [
    {
        title: '连通性与网络',
        items: [
            'URL、域名、端口与服务存活检查',
            'DNS、连接拒绝、超时、断网和防火墙提示',
            'HTTP / HTTPS、重定向、HTTP 版本与 TLS 错误',
            '代理、VPN 和企业网络入口，前提是当前电脑能访问目标'
        ]
    },
    {
        title: 'HTTP、状态码与响应',
        items: [
            '2xx、3xx、4xx、5xx 与未收录状态码',
            '状态码、响应头、响应体、耗时和错误关键词',
            'GBK / UTF-8 等响应编码与中文乱码',
            '业务码、异常类、堆栈线索和 JSON 解析错误'
        ]
    },
    {
        title: '认证、会话与权限',
        items: [
            'Cookie、Bearer、Basic、Token、JWT 和自定义认证头',
            '未登录、Token 过期、会话失效和 401 / 403',
            'RBAC、数据权限和菜单权限与接口权限不一致',
            'SSO / OAuth / SAML 登录弹窗允许在应用内继续登录'
        ]
    },
    {
        title: '接口契约与前端表现',
        items: [
            '字段缺失、字段名不匹配、类型错误和 Content-Type 错误',
            '请求方法错误、接口不存在、后端未实现和旧接口残留',
            '成功但无提示、列表不刷新、跳转错误和前端误判',
            '缓存、静态资源、分页、下载、断点续传和请求头超限'
        ]
    },
    {
        title: '服务、网关与性能',
        items: [
            '后端未启动、服务崩溃、服务维护和卡死',
            '502、503、504、网关路由、上传限制和代理改写',
            '限流、过载、慢 SQL、第三方超时和连接池耗尽',
            'CORS、预检请求、WAF、请求头和 URI 限制'
        ]
    },
    {
        title: '数据库与业务数据',
        items: [
            '数据库无数据、表不存在、连接拒绝和唯一约束冲突',
            '单行查询返回多行及被映射为 417 / 200 的业务异常',
            '重复提交、乐观锁、资源锁、付费状态和合规拦截',
            '业务码成功但数据为空、权限过滤和前后端字段契约问题'
        ]
    },
    {
        title: '现场采集与证据',
        items: [
            '在主窗口内打开 Web 系统并自动关联按钮与请求',
            '记录期间的 XHR / Fetch、页面导航和失败请求',
            'GET / HEAD 只读重放与差分隔离实验',
            'POST / PUT / PATCH / DELETE 失败快照与脱敏请求体',
            'Trace ID、日志模板、研发交接包和历史跟进'
        ]
    }
]

const limitedCases = [
    'SSO 弹窗能作为应用内认证窗口打开，但极端企业安全策略仍需现场验证',
    'VPN、代理、客户端证书和 MFA 取决于当前桌面环境是否能正常访问目标',
    'CORS 和浏览器安全策略只能结合请求、失败页面与症状辅助判断，不能替代浏览器控制台',
    'POST / PUT / PATCH / DELETE 可生成失败快照和交接信息，但不会自动重放或自动修复',
    '文件上传、多步骤事务和一次性验证码场景只能保留采集快照，不能保证可重复诊断',
    'WAF / CDN 可能对内置窗口和服务端探测返回不同结果，需要结合现场差异复核'
]

const unsupportedCases = [
    '不监听用户原来 Chrome / Edge 中的页面和登录态',
    '不监听手机 App、Windows 原生客户端或系统级全部网络流量',
    '不支持 WebSocket、SSE 消息内容和长连接状态诊断',
    '不做自动登录、自动提交、自动删除、自动修改或任何写操作',
    '不做压测、并发压测、故障注入和性能容量评估',
    '不替代服务端日志、APM、数据库审计、抓包和业务规则复核',
    '不承诺仅凭一次 HTTP 响应定位任何系统的最终根因'
]

const categoryOrder = [
    'network', 'service', 'auth', 'permission', 'frontend',
    'backend', 'database', 'performance', 'config', 'business'
]

const groupedScenarios = computed(() => {
    const groups = new Map()
    for (const scenario of store.allScenarios) {
        const key = scenario.root_cause || 'other'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(scenario)
    }
    const known = categoryOrder
        .filter(key => groups.has(key))
        .map(key => ({ key, label: catLabel(key), items: groups.get(key) }))
    const remaining = [...groups.keys()]
        .filter(key => !categoryOrder.includes(key))
        .sort()
        .map(key => ({ key, label: catLabel(key), items: groups.get(key) }))
    return [...known, ...remaining]
})

const demoCases = [
    {
        name: '订单管理系统',
        url: `${origin}/demo/sites/orders.html`,
        tag: '订单',
        description: '查询正常、500、404 和空数据'
    },
    {
        name: '账号与权限中心',
        url: `${origin}/demo/sites/account.html`,
        tag: '账号',
        description: '个人资料、登录失效和权限菜单'
    },
    {
        name: '审批中心',
        url: `${origin}/demo/sites/approval.html`,
        tag: '审批',
        description: '服务不可用和 POST 提交审批失败'
    }
]

async function copyDemoUrl(item) {
    await copyText(item.url)
    copiedUrl.value = item.url
    setTimeout(() => {
        if (copiedUrl.value === item.url) copiedUrl.value = ''
    }, 1600)
}

async function openDemo() {
    await openDemoSite(demoCases[0])
}

async function openDemoSite(item) {
    await window.faultDetectDesktop.openCapture(item.url)
    emit('demo-opened')
}

onMounted(async () => {
    if (store.allScenarios.length) return
    try {
        await loadScenarios()
    } catch (error) {
        console.error('加载场景覆盖清单失败', error)
    }
})
</script>

<style scoped>
.tutorial-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.tutorial-lead,
.demo-panel,
.lesson-panel,
.real-system,
.demo-urls,
.capability-matrix {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-card);
}

.tutorial-lead {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 22px;
    border-left: 3px solid var(--primary);
}

.tutorial-mark {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    flex: 0 0 48px;
    border-radius: 8px;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
}

.tutorial-kicker,
.demo-label {
    color: var(--primary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
}

.tutorial-lead h2 {
    margin: 3px 0 4px;
    font-size: 21px;
}

.tutorial-lead p,
.demo-panel p,
.panel-heading p {
    color: var(--text-dim);
    font-size: 12px;
}

.tutorial-lead p {
    max-width: 800px;
    line-height: 1.7;
}

.flow-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
}

.flow-grid article {
    position: relative;
    min-height: 158px;
    padding: 15px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-card);
}

.flow-grid article > span {
    position: absolute;
    top: 13px;
    right: 13px;
    color: color-mix(in srgb, var(--text-dim) 50%, transparent);
    font-size: 10px;
    font-weight: 700;
}

.flow-grid svg {
    color: var(--primary);
}

.flow-grid h3 {
    margin: 14px 0 6px;
    font-size: 13px;
}

.flow-grid p {
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.65;
}

.demo-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 17px 19px;
    border-color: color-mix(in srgb, var(--primary) 26%, var(--border));
    background: color-mix(in srgb, var(--primary) 4%, var(--bg-card));
}

.demo-panel h3 {
    margin: 3px 0;
    font-size: 15px;
}

.desktop-only {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    color: var(--text-dim);
    font-size: 11px;
}

.demo-urls {
    padding: 17px;
}

.demo-url-list {
    margin-top: 13px;
    border: 1px solid var(--border);
    border-radius: 7px;
    overflow: hidden;
}

.demo-url-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
}

.demo-url-row:last-child {
    border-bottom: 0;
}

.demo-badge {
    min-width: 86px;
    padding: 3px 7px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    font-size: 9px;
    font-weight: 700;
    text-align: center;
}

.demo-url-row > div {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.demo-url-row strong {
    font-size: 11px;
}

.demo-url-row code {
    overflow: hidden;
    color: var(--text-dim);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.demo-desc {
    color: var(--text-dim);
    font-size: 10px;
}

.open-site,
.copy-url {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg-card);
    color: var(--primary);
    font: inherit;
    font-size: 10px;
    cursor: pointer;
}

.open-site {
    color: var(--success);
}

.tutorial-columns {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr);
    gap: 12px;
}

.lesson-panel,
.real-system {
    padding: 17px;
}

.panel-heading {
    display: flex;
    align-items: flex-start;
    gap: 9px;
}

.panel-heading > svg {
    margin-top: 2px;
    color: var(--primary);
}

.panel-heading h3 {
    font-size: 13px;
}

.panel-heading p {
    margin-top: 1px;
}

.lesson-panel ol {
    margin: 13px 0 0 19px;
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.9;
}

.lesson-panel li {
    padding-left: 3px;
}

.lesson-panel li strong {
    color: var(--text);
}

.scope-panel {
    display: flex;
    flex-direction: column;
    gap: 9px;
}

.scope-row {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    color: var(--success);
    font-size: 11px;
    line-height: 1.55;
}

.scope-row svg {
    flex: 0 0 16px;
    margin-top: 1px;
}

.scope-row.limited {
    color: var(--text-dim);
}

.capability-matrix {
    padding: 19px;
}

.capability-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 15px;
}

.capability-grid article {
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg-inset);
}

.capability-grid h4,
.scope-column h4 {
    font-size: 12px;
}

.capability-grid ul,
.scope-column ul {
    margin: 8px 0 0 17px;
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.7;
}

.scope-matrix {
    display: grid;
    grid-template-columns: minmax(0, .85fr) minmax(0, 1.25fr) minmax(0, 1.25fr);
    gap: 10px;
    margin-top: 12px;
}

.scope-column {
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg-card);
}

.scope-column.supported {
    border-color: color-mix(in srgb, var(--success) 32%, var(--border));
}

.scope-column.limited {
    border-color: color-mix(in srgb, var(--warning) 34%, var(--border));
}

.scope-column.unsupported {
    border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
}

.scope-column.supported h4 {
    color: var(--success);
}

.scope-column.limited h4 {
    color: var(--warning);
}

.scope-column.unsupported h4 {
    color: var(--danger);
}

.scenario-catalog {
    margin-top: 12px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg-inset);
}

.scenario-catalog summary {
    padding: 13px 15px;
    color: var(--primary);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}

.catalog-note {
    padding: 0 15px 12px;
    color: var(--text-dim);
    font-size: 10px;
    line-height: 1.65;
}

.scenario-groups {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 0 15px 15px;
}

.scenario-group {
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-card);
}

.scenario-group h4 {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
    font-size: 11px;
}

.scenario-group h4 span {
    color: var(--text-dim);
}

.scenario-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}

.scenario-chips span {
    padding: 3px 7px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-inset);
    color: var(--text-dim);
    font-size: 10px;
}

.check-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-top: 13px;
}

.check-grid div {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 10px;
    border-radius: 7px;
    background: var(--bg-inset);
    color: var(--text-dim);
    font-size: 11px;
}

.check-grid span {
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    flex: 0 0 20px;
    border-radius: 50%;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    font-size: 9px;
    font-weight: 700;
}

@media (max-width: 980px) {
    .flow-grid,
    .check-grid,
    .capability-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .tutorial-columns {
        grid-template-columns: 1fr;
    }

    .scope-matrix {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 720px) {
    .tutorial-lead,
    .demo-panel {
        align-items: flex-start;
        flex-direction: column;
    }

    .flow-grid,
    .check-grid,
    .capability-grid {
        grid-template-columns: 1fr;
    }

    .demo-url-row {
        align-items: flex-start;
        flex-wrap: wrap;
    }

    .demo-url-row > div {
        flex-basis: calc(100% - 100px);
    }

    .open-site {
        margin-left: auto;
    }

    .copy-url {
        margin-left: 0;
    }
}
</style>

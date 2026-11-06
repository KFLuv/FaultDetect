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
import { ref } from 'vue'
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
import { copyText } from '../api'

const emit = defineEmits(['demo-opened'])
const desktopAvailable = Boolean(window.faultDetectDesktop?.openCapture)
const origin = window.location.origin
const copiedUrl = ref('')
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
.demo-urls {
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
    .check-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .tutorial-columns {
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
    .check-grid {
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

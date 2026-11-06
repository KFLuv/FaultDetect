import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'

const projectRoot = path.resolve(process.cwd(), '..')
const outputDir = path.join(projectRoot, 'docs', 'testing')
fs.mkdirSync(outputDir, { recursive: true })

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const context = browser.contexts()[0]
const mainPage = context.pages().find(page => page.url().startsWith('http://127.0.0.1:8000'))
if (!mainPage) throw new Error('FaultDetect main desktop page not found')

const pageErrors = []
mainPage.on('pageerror', error => pageErrors.push(error.message))
mainPage.on('dialog', async dialog => {
    await dialog.accept()
})

await mainPage.locator('.side-nav-item', { hasText: '使用教学' }).click()
await mainPage.getByRole('heading', { name: '从问题页面到诊断报告' }).waitFor()
assert.match(await mainPage.locator('.tutorial-page').innerText(), /不监听：手机 App/)

const getCapturePromise = context.waitForEvent('page')
await mainPage.getByRole('button', { name: '打开内置教学演示' }).click()
const getCapture = await getCapturePromise
await getCapture.waitForLoadState('domcontentloaded')
assert.match(getCapture.url(), /\/demo\/sites\/orders\.html$/)
await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '开始记录本次问题' }).click()
await getCapture.getByRole('button', { name: /查询订单（失败）/ }).click()
await getCapture.locator('#result', { hasText: 'HTTP 500' }).waitFor()
const getSnapshotState = await mainPage.evaluate(() => window.faultDetectDesktop.getCaptureState())
const getErrorSnapshot = getSnapshotState.requests.find(item => item.path === '/demo/api/error')
assert.ok(getErrorSnapshot?.responseSnapshot)
assert.match(getErrorSnapshot.responseSnapshot.responseBody, /DemoServiceException/)
await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '完成采集' }).click()

const getRow = mainPage.locator('.candidate-row', { hasText: '查询订单（失败）' })
await getRow.waitFor({ timeout: 15000 })
const getCandidate = getRow.getByTestId('capture-candidate')
await mainPage.locator('.capture-authorization input').check()
await getCandidate.click()
await mainPage.locator('.status-banner').waitFor({ timeout: 30000 })
assert.match(await mainPage.locator('.status-banner').innerText(), /500/)

await mainPage.locator('.side-nav-item', { hasText: '使用教学' }).click()
const postCapturePromise = context.waitForEvent('page')
await mainPage.locator('.demo-url-row', { hasText: '审批中心' }).getByRole('button', { name: '打开' }).click()
const postCapture = await postCapturePromise
await postCapture.waitForLoadState('domcontentloaded')
await mainPage.getByTestId('request-body-toggle').click()
await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '开始记录本次问题' }).click()
await postCapture.getByRole('button', { name: /提交审批（失败）/ }).click()
await postCapture.locator('#result', { hasText: 'HTTP 500' }).waitFor()
await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '完成采集' }).click()

const postRow = mainPage.locator('.candidate-row', { hasText: '提交审批（失败）' })
await postRow.waitFor({ timeout: 15000 })
assert.match(await postRow.innerText(), /POST/)
assert.equal(await postRow.locator('[data-testid="capture-candidate"]').count(), 0)
assert.match(await postRow.innerText(), /复制交接信息/)
await postRow.getByRole('button', { name: '失败快照' }).click()
const snapshotText = await mainPage.locator('.snapshot-panel').innerText()
assert.match(snapshotText, /后端\/上游/)
assert.match(snapshotText, /DemoServiceException/)
assert.match(snapshotText, /demo-/)
assert.match(snapshotText, /脱敏请求体/)
assert.ok(!snapshotText.includes('demo-secret'))
assert.ok(!snapshotText.includes('13800138000'))
assert.ok(!snapshotText.includes('440101199001011234'))
await mainPage.getByRole('button', { name: '配置日志入口' }).click()
await mainPage.getByPlaceholder('https://log.example.com/search?traceId={traceId}')
    .fill('https://logs.example.test/search?traceId={traceId}')
await mainPage.getByRole('button', { name: '保存模板' }).click()
assert.equal(
    await mainPage.evaluate(() => localStorage.getItem('faultdetect-trace-template')),
    'https://logs.example.test/search?traceId={traceId}'
)
assert.equal(await mainPage.getByRole('button', { name: '打开日志平台' }).isVisible(), true)
await mainPage.locator('.snapshot-panel').getByRole('button', { name: '关闭' }).click()
await postRow.getByRole('button', { name: '复制交接信息' }).click()
const clipboard = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'], {
    encoding: 'utf8'
})
assert.match(clipboard.stdout, /提交审批/)

await mainPage.getByPlaceholder('粘贴业务系统地址，例如 https://oa.example.com')
    .fill('http://127.0.0.1:1/')
await mainPage.getByRole('button', { name: '打开并开始采集' }).click()
const browserError = mainPage.getByTestId('browser-error')
await browserError.waitFor({ timeout: 20000 })
assert.match(await browserError.innerText(), /连接被拒绝|网页加载失败/)
await browserError.getByRole('button', { name: '返回地址' }).click()

await mainPage.screenshot({
    path: path.join(outputDir, 'FaultDetect-Tutorial-1.3.6.png'),
    fullPage: true
})

const result = {
    ok: true,
    version: '1.3.6',
    tutorial_nav_rendered: true,
    built_in_demo_opened: true,
    get_action_mapped: true,
    get_detected_status: 500,
    get_snapshot_verified: true,
    post_replay_blocked: true,
    native_clipboard_verified: true,
    post_snapshot_verified: true,
    trace_id_verified: true,
    request_body_evidence_verified: true,
    request_body_secrets_masked: true,
    trace_log_template_verified: true,
    browser_error_degraded: true,
    page_errors: pageErrors
}
fs.writeFileSync(
    path.join(outputDir, 'FaultDetect-Tutorial-1.3.6.json'),
    JSON.stringify(result, null, 2),
    'utf8'
)
console.log(JSON.stringify(result, null, 2))

await browser.close()

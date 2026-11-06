import assert from 'node:assert/strict'
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

const dialogs = []
const pageErrors = []
mainPage.on('dialog', async dialog => {
    dialogs.push(dialog.message())
    await dialog.accept()
})
mainPage.on('pageerror', error => pageErrors.push(error.message))

await mainPage.getByTestId('capture-assistant').waitFor()
await mainPage.getByPlaceholder('粘贴业务系统地址，例如 https://oa.example.com')
    .fill('http://127.0.0.1:18080/capture-test')

const capturePagePromise = context.waitForEvent('page')
await mainPage.getByRole('button', { name: '打开并开始采集' }).click()
const capturePage = await capturePagePromise
await capturePage.waitForLoadState('domcontentloaded')
assert.match(capturePage.url(), /\/capture-test$/)

await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '开始记录本次问题' }).click()
await mainPage.waitForTimeout(300)
await capturePage.getByRole('button', { name: '执行订单查询' }).click()
await capturePage.locator('#result', { hasText: 'HTTP 500' }).waitFor()
await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '完成采集' }).click()

const candidate = mainPage.getByTestId('capture-candidate').first()
await candidate.waitFor({ timeout: 15000 })
await mainPage.waitForTimeout(800)

const panelText = await mainPage.getByTestId('capture-assistant').innerText()
assert.match(panelText, /GET/)
assert.match(panelText, /HTTP 500/)
assert.match(panelText, /执行订单查询/)
assert.ok(!panelText.includes('/ok'))
assert.ok(!panelText.includes('capture-test-token'))
assert.ok(!panelText.includes('capture-cookie'))

await mainPage.locator('.capture-authorization input').check()
const detectResponsePromise = mainPage.waitForResponse(response =>
    response.url().includes('/api/detect')
    && String(response.request().postData() || '').includes('/error')
)
await candidate.click()
const detectResponse = await detectResponsePromise
assert.equal(detectResponse.status(), 200)
await mainPage.locator('.status-banner').waitFor({ timeout: 30000 })

const report = await detectResponse.json()
assert.equal(String(report.status_code), '500')
assert.ok(!JSON.stringify(report).includes('capture-test-token'))
assert.ok(!JSON.stringify(report).includes('capture-cookie'))

const observed = await fetch('http://127.0.0.1:18080/debug-last-headers')
    .then(response => response.json())
    .then(data => data.headers)
assert.equal(observed.authorization, 'Bearer capture-test-token')
assert.match(observed.cookie, /fd_session=capture-cookie/)
assert.equal(observed.tenant, 'demo-tenant')

assert.deepEqual(dialogs, [])
assert.deepEqual(pageErrors, [])

const result = {
    ok: true,
    version: '1.3.4',
    capture_url: capturePage.url(),
    captured_method: 'GET',
    captured_status: 500,
    clicked_action_mapped: true,
    recording_switch_verified: true,
    pre_record_request_excluded: true,
    credentials_absent_from_ui: true,
    credentials_absent_from_report: true,
    authorization_forwarded: true,
    cookie_forwarded: true,
    custom_header_forwarded: true,
    report_id: report.report_id,
    dialogs,
    page_errors: pageErrors
}
fs.writeFileSync(
    path.join(outputDir, 'FaultDetect-Capture-Assistant-1.3.4.json'),
    JSON.stringify(result, null, 2),
    'utf8'
)
console.log(JSON.stringify(result, null, 2))

await browser.close()

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

await mainPage.locator('.side-nav-item', { hasText: '使用教学' }).click()
await mainPage.getByRole('heading', { name: '从问题页面到诊断报告' }).waitFor()
assert.match(await mainPage.locator('.tutorial-page').innerText(), /不监听：手机 App/)

const getCapturePromise = context.waitForEvent('page')
await mainPage.getByRole('button', { name: '打开内置教学演示' }).click()
const getCapture = await getCapturePromise
await getCapture.waitForLoadState('domcontentloaded')
assert.match(getCapture.url(), /\/demo\/capture\.html$/)
await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '开始记录本次问题' }).click()
await getCapture.getByRole('button', { name: /查询订单（失败）/ }).click()
await getCapture.locator('#result', { hasText: 'HTTP 500' }).waitFor()
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
await mainPage.getByRole('button', { name: '打开内置教学演示' }).click()
const postCapture = await postCapturePromise
await postCapture.waitForLoadState('domcontentloaded')
await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '开始记录本次问题' }).click()
await postCapture.getByRole('button', { name: /提交审批（失败）/ }).click()
await postCapture.locator('#result', { hasText: 'HTTP 500' }).waitFor()
await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '完成采集' }).click()

const postRow = mainPage.locator('.candidate-row', { hasText: '提交审批（失败）' })
await postRow.waitFor({ timeout: 15000 })
assert.match(await postRow.innerText(), /POST/)
assert.equal(await postRow.locator('[data-testid="capture-candidate"]').count(), 0)
assert.match(await postRow.innerText(), /复制交接信息/)
await postRow.getByRole('button', { name: '复制交接信息' }).click()
const clipboard = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'], {
    encoding: 'utf8'
})
assert.match(clipboard.stdout, /提交审批/)

await mainPage.screenshot({
    path: path.join(outputDir, 'FaultDetect-Tutorial-1.3.3.png'),
    fullPage: true
})

const result = {
    ok: true,
    version: '1.3.3',
    tutorial_nav_rendered: true,
    built_in_demo_opened: true,
    get_action_mapped: true,
    get_detected_status: 500,
    post_replay_blocked: true,
    native_clipboard_verified: true,
    page_errors: pageErrors
}
fs.writeFileSync(
    path.join(outputDir, 'FaultDetect-Tutorial-1.3.3.json'),
    JSON.stringify(result, null, 2),
    'utf8'
)
console.log(JSON.stringify(result, null, 2))

await browser.close()

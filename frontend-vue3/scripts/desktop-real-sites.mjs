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
const mainPage = context.pages().find(page => page.url() === 'http://127.0.0.1:8000/')
if (!mainPage) throw new Error('FaultDetect main page not found')
await mainPage.evaluate(() => window.faultDetectDesktop.closeCapture())

async function openSite(url) {
    const pagePromise = context.waitForEvent('page')
    await mainPage.getByPlaceholder('粘贴业务系统地址，例如 https://oa.example.com').fill(url)
    await mainPage.getByRole('button', { name: '打开并开始采集' }).click()
    const page = await pagePromise
    await page.waitForLoadState('domcontentloaded')
    return page
}

const lting = await openSite('http://127.0.0.1:8078/chat/login.html')
assert.equal(await lting.title(), '用户登录')
assert.ok(await lting.locator('#loginForm').isVisible())

await lting.locator('#guestBtn').click()
await lting.waitForURL(url => !url.pathname.endsWith('/chat/login.html'), { timeout: 30000 })
assert.ok((await lting.locator('body').innerText()).length > 50)
await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '开始记录本次问题' }).click()
await lting.getByRole('link', { name: /AI 管家/ }).first().click()
await lting.waitForURL('**/chat/chat.html', { timeout: 30000 })
await lting.waitForTimeout(2500)
const ltingState = await mainPage.evaluate(() => window.faultDetectDesktop.getCaptureState())
assert.ok(ltingState.requests.length > 0)
await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '完成采集' }).click()

const sauce = await openSite('https://www.saucedemo.com/')
assert.equal(await sauce.title(), 'Swag Labs')
await sauce.locator('[data-test="username"]').fill('standard_user')
await sauce.locator('[data-test="password"]').fill('secret_sauce')
await sauce.locator('[data-test="login-button"]').click()
await sauce.waitForURL('**/inventory.html', { timeout: 30000 })
assert.match(await sauce.locator('body').innerText(), /Products/)
await mainPage.evaluate(() => window.faultDetectDesktop.closeCapture())

const publicErrorSite = await openSite('https://the-internet.herokuapp.com/status_codes')
await publicErrorSite.waitForLoadState('domcontentloaded')
await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '开始记录本次问题' }).click()
await publicErrorSite.getByRole('link', { name: '500' }).click()
await publicErrorSite.waitForURL('**/status_codes/500', { timeout: 30000 })
await publicErrorSite.waitForTimeout(1000)
const publicState = await mainPage.evaluate(() => window.faultDetectDesktop.getCaptureState())
const public500 = publicState.requests.find(item => item.statusCode === 500)
assert.ok(public500)
assert.ok(['mainFrame', 'document'].includes(public500.resourceType))
await mainPage.getByTestId('capture-workspace').getByRole('button', { name: '完成采集' }).click()
const publicRow = mainPage.locator('.candidate-row', { hasText: '/status_codes/500' }).first()
await publicRow.waitFor()
await mainPage.locator('.capture-authorization input').check()
await publicRow.getByTestId('capture-candidate').click()
await mainPage.locator('.status-banner').waitFor({ timeout: 60000 })
const publicDetectionBanner = (await mainPage.locator('.status-banner').innerText()).replace(/\s+/g, ' ')

const result = {
    ok: true,
    version: '1.3.5',
    lting: {
        url: 'http://127.0.0.1:8078/chat/login.html',
        title: '用户登录',
        form_rendered: true,
        guest_login_interaction_worked: true,
        reached: lting.url(),
        request_count_after_ai_butler_click: ltingState.requests.length,
        action_label: 'AI 管家'
    },
    sauce_demo: {
        url: 'https://www.saucedemo.com/',
        title: 'Swag Labs',
        login_interaction_worked: true,
        reached_inventory: true
    },
    public_error_site: {
        url: 'https://the-internet.herokuapp.com/status_codes',
        clicked_link: '500',
        captured_method: public500.method,
        captured_status: public500.statusCode,
        resource_type: public500.resourceType,
        action_label: public500.actionLabel,
        detection_banner: publicDetectionBanner
    }
}
fs.writeFileSync(
    path.join(outputDir, 'FaultDetect-Real-Sites-1.3.5.json'),
    JSON.stringify(result, null, 2),
    'utf8'
)
console.log(JSON.stringify(result, null, 2))
await browser.close()

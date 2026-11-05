import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright-core'

const backendPid = Number(process.argv[2])
if (!Number.isInteger(backendPid) || backendPid <= 0) {
    throw new Error('Usage: node desktop-recovery.mjs <backend-pid>')
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const context = browser.contexts()[0]
const page = context.pages().find(item => item.url().startsWith('http://127.0.0.1:8000'))
if (!page) throw new Error('FaultDetect desktop page not found')

await page.waitForSelector('input[placeholder*="192.0.2.10"]')
let dialogMessage = ''
page.on('dialog', async dialog => {
    dialogMessage = dialog.message()
    await dialog.accept()
})

await page.locator('input[placeholder*="192.0.2.10"]').fill('http://127.0.0.1:18080/error')
await page.locator('input[placeholder*="页面显示空表格"]').fill('后端断线自动恢复验证')
await page.locator('input[type="checkbox"]').first().check()

const killed = spawnSync('taskkill', ['/PID', String(backendPid), '/F'], {
    encoding: 'utf8',
    windowsHide: true
})
if (killed.status !== 0) {
    throw new Error(`Failed to stop backend test process: ${killed.stderr || killed.stdout}`)
}
await page.waitForTimeout(500)

await page.getByRole('button', { name: /开始检测/ }).click()
await page.waitForSelector('.result-section', { timeout: 90000 })

const bodyText = await page.locator('body').innerText()
if (dialogMessage && /fail to fetch/i.test(dialogMessage)) {
    throw new Error(`Unexpected raw fetch error dialog: ${dialogMessage}`)
}
if (!bodyText.includes('500')) {
    throw new Error('Diagnostic report did not include the expected 500 result')
}

const health = await page.evaluate(async () => {
    const response = await fetch('/api/health', { cache: 'no-store' })
    return response.ok ? response.json() : null
})
if (health?.version !== '1.3.1') {
    throw new Error(`Unexpected backend health: ${JSON.stringify(health)}`)
}

console.log(JSON.stringify({
    ok: true,
    killedBackendPid: backendPid,
    dialogMessage,
    recoveredVersion: health.version,
    resultContains500: bodyText.includes('500')
}, null, 2))

await browser.close()

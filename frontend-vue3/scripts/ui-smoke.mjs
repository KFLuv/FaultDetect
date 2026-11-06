import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'

const baseUrl = process.env.FAULTDETECT_BASE_URL || 'http://127.0.0.1:8000'
const edgePath = process.env.FAULTDETECT_EDGE
    || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const projectRoot = path.resolve(process.cwd(), '..')
const outputDir = path.join(projectRoot, 'docs', 'testing')
const mockScript = path.join(projectRoot, 'scripts', 'faultdetect_mock_target.py')
fs.mkdirSync(outputDir, { recursive: true })

async function waitForServer() {
    for (let i = 0; i < 30; i += 1) {
        try {
            const response = await fetch(`${baseUrl}/api/health`)
            if (response.ok) return
        } catch {
        }
        await new Promise(resolve => setTimeout(resolve, 500))
    }
    throw new Error('FaultDetect server is not ready')
}

const mock = spawn('python', [mockScript], {
    cwd: projectRoot,
    windowsHide: true,
    stdio: 'ignore'
})

let browser
try {
    await waitForServer()
    await new Promise(resolve => setTimeout(resolve, 800))
    browser = await chromium.launch({ headless: true, executablePath: edgePath })
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true
    })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl })
    const page = await context.newPage()
    const dialogs = []
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => {
        if (message.type() === 'error') pageErrors.push(message.text())
    })
    page.on('dialog', async dialog => {
        dialogs.push(dialog.message())
        await dialog.accept()
    })

    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    const demoStatuses = {}
    for (const demoPath of [
        '/demo/api/ok',
        '/demo/api/error',
        '/demo/api/not-found',
        '/demo/api/unauthorized',
        '/demo/api/empty',
        '/demo/api/unavailable'
    ]) {
        demoStatuses[demoPath] = (await fetch(baseUrl + demoPath)).status
    }
    demoStatuses['/demo/api/post-error'] = (await fetch(baseUrl + '/demo/api/post-error', { method: 'POST' })).status
    assert.deepEqual(demoStatuses, {
        '/demo/api/ok': 200,
        '/demo/api/error': 500,
        '/demo/api/not-found': 404,
        '/demo/api/unauthorized': 401,
        '/demo/api/empty': 200,
        '/demo/api/unavailable': 503,
        '/demo/api/post-error': 500
    })
    assert.equal(await page.locator('.side-nav-item').count(), 7)
    assert.equal(await page.locator('.tab-nav').count(), 0)
    assert.equal(await page.getByTestId('capture-assistant').count(), 1)
    assert.ok((await page.getByTestId('capture-assistant').innerText()).includes('仅在 FaultDetect 桌面版可用'))
    const desktopLayout = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="capture-assistant"]')
        const rect = card.getBoundingClientRect()
        return {
            noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
            cardVisible: rect.width > 0 && rect.height > 0,
            cardInsideViewport: rect.left >= 0 && rect.right <= window.innerWidth + 1
        }
    })
    assert.equal(desktopLayout.noHorizontalOverflow, true)
    assert.equal(desktopLayout.cardVisible, true)
    assert.equal(desktopLayout.cardInsideViewport, true)

    const navExpectations = [
        ['故障检测', '故障检测'],
        ['使用教学', '使用教学'],
        ['场景库', '场景库'],
        ['状态码', '状态码'],
        ['历史记录', '历史记录'],
        ['新增场景', '新增场景'],
        ['系统自检', '系统自检']
    ]
    for (const [label, heading] of navExpectations) {
        await page.locator('.side-nav-item', { hasText: label }).click()
        await page.locator('.page-heading h1', { hasText: heading }).waitFor()
    }

    await page.locator('.side-nav-item', { hasText: '使用教学' }).click()
    assert.equal(await page.locator('.demo-url-row').count(), 7)
    await page.locator('.demo-url-row').first().getByRole('button', { name: '复制' }).click()
    await page.waitForTimeout(200)
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /\/demo\/api\/ok$/)

    await page.locator('.side-nav-item', { hasText: '故障检测' }).click()
    await page.getByTestId('manual-toggle').click()
    const targetUrl = 'http://127.0.0.1:18080/error?token=UI_SECRET&x=1'
    await page.getByTestId('manual-url').fill(targetUrl)
    await page.locator('input[placeholder*="页面显示空表格"]').fill('UI smoke test')
    await page.locator('label.auth-confirm input').check()
    await page.getByRole('button', { name: /开始检测/ }).click()
    await page.locator('.status-banner').waitFor({ timeout: 30000 })
    assert.equal(await page.locator('.llm-card').count(), 0)
    await page.getByRole('button', { name: '查看完整诊断过程' }).click()
    await page.getByRole('heading', { name: /检测流程/ }).waitFor()
    await page.getByRole('button', { name: '收起完整诊断过程' }).click()

    const banner = await page.locator('.status-banner').innerText()
    const match = banner.match(/RPT_[0-9]+/)
    assert.ok(match, 'report id should be visible')
    const reportId = match[0]

    await page.getByRole('button', { name: /复制汇报文本/ }).click()
    await page.waitForTimeout(300)
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    assert.ok(clipboard.includes('【现象】'))

    await page.locator('.side-nav-item', { hasText: '历史记录' }).click()
    const caseItem = page.locator('.case-item', { hasText: reportId })
    await caseItem.waitFor()
    const caseText = await caseItem.innerText()
    assert.ok(caseText.includes('token=***'))
    await caseItem.locator('select').selectOption('fixed')
    await caseItem.locator('input[placeholder="填写负责人"]').fill('ui-smoke')
    await caseItem.locator('input[placeholder*="已联系研发"]').fill('自动化跟进')
    await caseItem.getByRole('button', { name: '保存跟进' }).click()
    await page.locator('.case-item', { hasText: reportId }).locator('.status-fixed').waitFor()

    await page.locator('.case-item', { hasText: reportId }).getByRole('button', { name: '重新检测' }).click()
    await page.locator('.page-heading h1', { hasText: '故障检测' }).waitFor()
    const redactedTargetUrl = targetUrl.replace('UI_SECRET', '***')
    assert.equal(await page.getByTestId('manual-url').inputValue(), redactedTargetUrl)

    const beforeTheme = await page.locator('body').getAttribute('data-theme')
    await page.locator('.utility-btn', { hasText: /深色模式|浅色模式/ }).click()
    await page.waitForTimeout(200)
    const afterTheme = await page.locator('body').getAttribute('data-theme')
    assert.notEqual(beforeTheme, afterTheme)

    await page.locator('.utility-btn', { hasText: '模型设置' }).click()
    await page.locator('.settings-dialog').waitFor()
    await page.locator('.settings-dialog input[type="url"]').waitFor()
    await page.locator('.settings-dialog .dialog-close').click()

    await page.screenshot({
        path: path.join(outputDir, 'FaultDetect-UI-Smoke-Desktop.png'),
        fullPage: true
    })

    await page.locator('.side-nav-item', { hasText: '历史记录' }).click()
    const deleteCard = page.locator('.case-item', { hasText: reportId })
    await deleteCard.getByRole('button', { name: '删除' }).click()
    await page.waitForTimeout(500)
    assert.equal(await page.locator('.case-item', { hasText: reportId }).count(), 0)

    await page.locator('.side-nav-item', { hasText: '故障检测' }).click()
    if (await page.getByTestId('manual-toggle').getAttribute('aria-expanded') !== 'true') {
        await page.getByTestId('manual-toggle').click()
    }
    await page.getByTestId('manual-url').fill('http://127.0.0.1:18080/unknown-598')
    await page.locator('input[placeholder*="页面显示空表格"]').fill('未登记的第三方组件状态异常')
    await page.locator('label.auth-confirm input').check()
    const unknownResponsePromise = page.waitForResponse(response =>
        response.url().includes('/api/detect')
        && String(response.request().postData() || '').includes('unknown-598')
    )
    await page.getByRole('button', { name: /开始检测/ }).click()
    const unknownResponse = await unknownResponsePromise
    const unknownJson = await unknownResponse.json()
    assert.equal(unknownJson.unknown_mode?.active, true)
    await page.locator('.unknown-panel').waitFor({ timeout: 30000 })
    assert.ok(await page.locator('.unknown-panel .check-list li').count() >= 8)
    assert.equal(await page.locator('.unknown-panel .layer-row').count(), 7)
    assert.ok(await page.locator('.unknown-panel .experiment-item').count() >= 1)
    await page.locator('.unknown-panel').getByRole('button', { name: '复制交接包' }).click()
    await page.locator('.result-toolbar .clear-result').click()
    assert.equal(await page.locator('.status-banner').count(), 0)

    await page.locator('.side-nav-item', { hasText: '新增场景' }).click()
    await page.locator('input[placeholder="例如：短信服务欠费"]').fill('UI 测试自定义场景')
    await page.getByPlaceholder('例如：200, 401').fill('500')
    await page.getByPlaceholder('例如：500').fill('500')
    await page.getByPlaceholder('例如：短信余额不足').fill('普通服务异常')
    await page.getByPlaceholder('例如：发送短信提示失败').fill('页面失败')
    await page.getByRole('button', { name: '验证匹配' }).click()
    await page.locator('.preview-result.warn').waitFor()
    assert.match(await page.locator('.preview-result.warn').innerText(), /不会成为主结论/)

    await page.getByPlaceholder('例如：欠费, balance, insufficient').fill('UI_CUSTOM_MARKER')
    await page.getByPlaceholder('例如：短信余额不足').fill('UI_CUSTOM_MARKER service failed')
    await page.getByRole('button', { name: '验证匹配' }).click()
    await page.locator('.preview-result.good').waitFor()
    assert.match(await page.locator('.preview-result.good').innerText(), /这个场景会命中/)

    assert.deepEqual(pageErrors, [])

    const mobile = await context.newPage()
    await mobile.setViewportSize({ width: 390, height: 844 })
    await mobile.goto(baseUrl, { waitUntil: 'networkidle' })
    const sidebarBox = await mobile.locator('.sidebar').boundingBox()
    assert.ok(sidebarBox && sidebarBox.width < 100)
    assert.equal(await mobile.locator('.side-nav-item').count(), 7)
    const mobileLayout = await mobile.evaluate(() => {
        const card = document.querySelector('[data-testid="capture-assistant"]')
        const rect = card.getBoundingClientRect()
        return {
            noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
            cardVisible: rect.width > 0 && rect.height > 0,
            cardInsideViewport: rect.left >= 0 && rect.right <= window.innerWidth + 1
        }
    })
    assert.equal(mobileLayout.noHorizontalOverflow, true)
    assert.equal(mobileLayout.cardVisible, true)
    assert.equal(mobileLayout.cardInsideViewport, true)
    await mobile.screenshot({
        path: path.join(outputDir, 'FaultDetect-UI-Smoke-Mobile.png'),
        fullPage: true
    })

    const localTimestamp = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(new Date()).replace(' ', 'T') + '+08:00'
    const result = {
        generated_at: localTimestamp,
        base_url: baseUrl,
        report_id: reportId,
        nav_items: 7,
        old_tab_nav: false,
        clipboard_contains_report: true,
        authorization_checked: true,
        follow_up_status: 'fixed',
        retry_prefilled_url: redactedTargetUrl,
        theme_changed: true,
        llm_settings_opened: true,
        llm_disabled_rules_only: true,
        unknown_mode_rendered: true,
        unknown_layers: 7,
        tutorial_demo_urls: 7,
        tutorial_demo_statuses: demoStatuses,
        advanced_diagnostics_collapsed_by_default: true,
        clear_result_verified: true,
        custom_scenario_preflight_warned: true,
        custom_scenario_preflight_matched: true,
        capture_browser_fallback_rendered: true,
        desktop_capture_layout: desktopLayout,
        mobile_capture_layout: mobileLayout,
        page_errors: pageErrors,
        mobile_sidebar_width: sidebarBox.width,
        dialogs
    }
    fs.writeFileSync(
        path.join(outputDir, 'FaultDetect-UI-Smoke-20261106.json'),
        JSON.stringify(result, null, 2),
        'utf8'
    )
    console.log(JSON.stringify(result, null, 2))
} finally {
    if (browser) await browser.close()
    mock.kill()
}

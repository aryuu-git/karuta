// 登录后页面视觉验收（Playwright）：真实登录 → PlayHub / 房间大厅 / 牌组页截图。
// 用法：node e2e/visual-auth.mjs（需前后端服务已启动）
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.QA_BASE_URL ?? 'http://localhost:5173'
const OUT = new URL('../baseline/visual-smoke/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', err => errors.push(String(err).slice(0, 200)))

// 登录
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.getByPlaceholder('输入昵称').fill('visual_qa')
await page.getByPlaceholder('输入密码').fill('qa123456')
await page.getByRole('button', { name: /进入战场/ }).click()
await page.waitForURL('**/', { timeout: 10000 })
await page.waitForTimeout(1200) // 房间列表轮询渲染

// 关闭更新日志弹窗（首次登录会弹 Changelog，遮挡页面验收）
const dismiss = page.getByRole('button', { name: '知道了' })
if (await dismiss.isVisible().catch(() => false)) {
  await dismiss.click()
  await page.waitForTimeout(400)
}
await page.screenshot({ path: `${OUT}playhub-desktop.png` })

// 房间大厅（rematch 新房 2，InvitePanel 应展示）
await page.goto(BASE + '/rooms/2', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const dismiss2 = page.getByRole('button', { name: '知道了' })
if (await dismiss2.isVisible().catch(() => false)) {
  await dismiss2.click()
  await page.waitForTimeout(400)
}
await page.screenshot({ path: `${OUT}room-lobby-desktop.png` })

// 牌组页（PresetPicker 入口所在）
await page.goto(BASE + '/decks', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const dismiss3 = page.getByRole('button', { name: '知道了' })
if (await dismiss3.isVisible().catch(() => false)) {
  await dismiss3.click()
  await page.waitForTimeout(400)
}
await page.screenshot({ path: `${OUT}decks-desktop.png` })

await browser.close()
console.log(JSON.stringify({ ok: true, errors }, null, 2))

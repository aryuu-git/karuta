// 游客链路 E2E 验收：注册 → 深链进房 → 退出 → 同昵称恢复身份 → 昵称占用报错。
// 用法：node e2e/guest-flow.mjs（需前后端服务已启动）
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
const log = []

// 1) 深链进游客页（带房间码 59N35P）
await page.goto(BASE + '/guest?code=59N35P', { waitUntil: 'networkidle' })
await page.getByPlaceholder('取一个昵称').fill('GuestFlowA')
await page.getByRole('button', { name: '确定昵称' }).click()
await page.waitForTimeout(1500)

// 2) 应落步骤 2 且邀请码已预填
const codeValue = await page.getByPlaceholder('输入邀请码').inputValue().catch(() => null)
log.push({ step2_prefill: codeValue })
await page.screenshot({ path: `${OUT}guest-step2-prefilled.png` })

// 3) 加入对局 → 应进房间大厅
await page.getByRole('button', { name: '加入对局' }).click()
await page.waitForTimeout(2000)
log.push({ after_join_url: page.url() })
await page.screenshot({ path: `${OUT}guest-in-room.png` })

// 4) localStorage 恢复码应存在
const recovery = await page.evaluate(() =>
  Object.keys(localStorage).filter(k => k.startsWith('karuta_guest_recovery:')))
log.push({ recovery_keys: recovery })

// 5) 退出 → 回游客页 → 同昵称再登录（应延续同身份，无需恢复码输入）
await page.evaluate(() => localStorage.removeItem('karuta_token'))
await page.goto(BASE + '/guest', { waitUntil: 'networkidle' })
await page.getByPlaceholder('取一个昵称').fill('GuestFlowA')
await page.getByRole('button', { name: '确定昵称' }).click()
await page.waitForTimeout(1500)
const backToStep2 = await page.getByPlaceholder('输入邀请码').isVisible().catch(() => false)
log.push({ relogin_same_identity: backToStep2 })

// 6) 昵称占用：正式用户昵称应报错且留在步骤 1
await page.evaluate(() => localStorage.removeItem('karuta_token'))
await page.goto(BASE + '/guest', { waitUntil: 'networkidle' })
await page.getByPlaceholder('取一个昵称').fill('visual_qa')
await page.getByRole('button', { name: '确定昵称' }).click()
await page.waitForTimeout(1500)
const errText = await page.locator('text=已注册用户').first().isVisible().catch(() => false)
  || await page.locator('.text-crimson').first().isVisible().catch(() => false)
log.push({ occupied_name_error_shown: errText })
await page.screenshot({ path: `${OUT}guest-name-occupied.png` })

await browser.close()
console.log(JSON.stringify({ log, errors }, null, 2))

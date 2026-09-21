// rematch UI 闭环验证（D12-补8）：1 牌快局跑到结算 → 结算页按钮语义 → 房主一键 rematch
// → 新房大厅 + 邀请面板高亮。协议层 rematch 已验证（D10），本轮验证 UI 流。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.QA_BASE_URL ?? 'http://localhost:5173'
const API = 'http://localhost:8080/api'
const OUT = new URL('../baseline/visual-smoke/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(OUT, { recursive: true })
const DECK_ID = parseInt(process.env.QA_DECK_ID ?? '2', 10)

async function apiLogin(u, p) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p }),
  })
  return (await res.json()).token
}

const browser = await chromium.launch()
const out = {}

const hostToken = await apiLogin('visual_qa', 'qa123456')
await fetch(`${API}/admin/users/7/disable`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostToken}` },
  body: JSON.stringify({ disabled: false }),
})

// 建 1 牌快局
const created = await fetch(`${API}/rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostToken}` },
  body: JSON.stringify({ deck_id: DECK_ID, interval_sec: 1, mode: 'auto' }),
}).then(r => r.json())
out.source_room = created.id

async function session(user, pass) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e).slice(0, 120)))
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.getByPlaceholder('输入昵称').fill(user)
  await page.getByPlaceholder('输入密码').fill(pass)
  await page.getByRole('button', { name: /进入战场/ }).click()
  await page.waitForURL('**/', { timeout: 10000 })
  return { ctx, page, errors }
}

// Changelog 懒加载可能晚于交互出现——关键交互前防御性关闭
async function dismissChangelog(page) {
  for (let i = 0; i < 3; i++) {
    const btn = page.getByRole('button', { name: '知道了' })
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {})
      await page.waitForTimeout(300)
    } else {
      await page.waitForTimeout(300)
    }
  }
}

const hostS = await session('visual_qa', 'qa123456')
await hostS.page.goto(`${BASE}/rooms/${created.id}`, { waitUntil: 'networkidle' })
await dismissChangelog(hostS.page)

// victim 入房（非房主视角验证禁用态）
const vicS = await session('victim_admin', 'va123456')
const vicToken = await apiLogin('victim_admin', 'va123456')
await fetch(`${API}/rooms/join`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vicToken}` },
  body: JSON.stringify({ code: created.code }),
})
await vicS.page.goto(`${BASE}/rooms/${created.id}`, { waitUntil: 'networkidle' })
await vicS.page.waitForTimeout(1200)
await dismissChangelog(vicS.page)

// 开局 → 等结算（1 张牌无人抢：音频时长未知兜底 ~60s 后 missed → game_over）
await dismissChangelog(hostS.page)
await hostS.page.getByRole('button', { name: /开始游戏/ }).click()
let gameOver = false
for (let i = 0; i < 170 && !gameOver; i++) {
  gameOver = await hostS.page.locator('text=/本局结算/').first().isVisible().catch(() => false)
  if (!gameOver) await hostS.page.waitForTimeout(1000)
}
out.host_reached_gameover = gameOver
await hostS.page.screenshot({ path: `${OUT}rematch-source-gameover.png` })

// victim（非房主）：再来一局应禁用
out.vic_rematch_disabled = await vicS.page.getByRole('button', { name: /再来一局/ })
  .first().isDisabled().catch(() => null)

// 房主点击「再来一局」→ 新房
await dismissChangelog(hostS.page)
const beforeUrl = hostS.page.url()
await hostS.page.getByRole('button', { name: /再来一局/ }).first().click()
await hostS.page.waitForTimeout(3000)
const afterUrl = hostS.page.url()
out.host_rematch_navigated = afterUrl !== beforeUrl && /\/rooms\//.test(new URL(afterUrl).pathname)
out.new_room_url = new URL(afterUrl).pathname

// 新房大厅：InvitePanel 应展示（focusInvite 高亮）
out.new_room_invite_panel = await hostS.page.locator('text=/邀请战友|复制邀请链接/').first().isVisible().catch(() => false)
await hostS.page.screenshot({ path: `${OUT}rematch-new-room.png` })

out.host_js_errors = hostS.errors.slice(0, 2)
out.vic_js_errors = vicS.errors.slice(0, 2)

await browser.close()
console.log(JSON.stringify(out, null, 2))
const pass = out.host_reached_gameover === true && out.vic_rematch_disabled === true
  && out.host_rematch_navigated === true && out.new_room_invite_panel === true
  && out.host_js_errors.length === 0 && out.vic_js_errors.length === 0
console.log(pass ? 'REMATCH UI VERIFIED ✓' : 'REMATCH UI ✗')
process.exit(pass ? 0 : 1)

// duel 模式浏览器 UI 验证（D12-补9）：席位入座点击 → 开局 → 编排准备点击
// → DuelBoard 牌面点击抢牌 → UI claimed 反馈。duel 的 UI 交互层首验。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.QA_BASE_URL ?? 'http://localhost:5173'
const API = 'http://localhost:8080/api'
const OUT = new URL('../baseline/visual-smoke/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(OUT, { recursive: true })

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

const created = await fetch(`${API}/rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostToken}` },
  body: JSON.stringify({
    deck_id: 1, interval_sec: 1, mode: 'duel',
    duel_total_cards: 6, duel_round_time: 30, duel_arrange_time: 90,
    duel_grab_chances: 3, duel_flip: true, duel_requeue: false, duel_max_rounds: 0,
  }),
}).then(r => r.json())
out.room = created.id

async function dismissChangelog(page) {
  for (let i = 0; i < 3; i++) {
    const btn = page.getByRole('button', { name: '知道了' })
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(300) }
    else await page.waitForTimeout(300)
  }
}
async function session(user, pass) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
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

const hostS = await session('visual_qa', 'qa123456')
await hostS.page.goto(`${BASE}/rooms/${created.id}`, { waitUntil: 'networkidle' })
await dismissChangelog(hostS.page)

const vicS = await session('victim_admin', 'va123456')
const vicToken = await apiLogin('victim_admin', 'va123456')
await fetch(`${API}/rooms/join`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vicToken}` },
  body: JSON.stringify({ code: created.code }),
})
await vicS.page.goto(`${BASE}/rooms/${created.id}`, { waitUntil: 'networkidle' })
await vicS.page.waitForTimeout(1200)
await dismissChangelog(vicS.page)

// 1) 大厅 duel 席位区出现 → 双方点击「入座」
const seatSection = await hostS.page.locator('text=/选手席位/').first().isVisible().catch(() => false)
out.lobby_seat_section = seatSection
await hostS.page.getByRole('button', { name: '入座' }).nth(0).click()
await vicS.page.waitForTimeout(600)
// host 已占 P1：victim 页面只剩 P2 一个入座按钮
await vicS.page.getByRole('button', { name: '入座' }).nth(0).click()
await hostS.page.waitForTimeout(800)
out.host_sees_victim = await hostS.page.locator('text=victim_admin').first().isVisible().catch(() => false)
out.vic_sees_host = await vicS.page.locator('text=visual_qa').first().isVisible().catch(() => false)
await hostS.page.screenshot({ path: `${OUT}duel-lobby-seated.png` })

// 2) 房主开局
await hostS.page.getByRole('button', { name: /开始游戏/ }).click()
let arranging = false
for (let i = 0; i < 30 && !arranging; i++) {
  arranging = await hostS.page.locator('text=/准备完毕/').first().isVisible().catch(() => false)
  if (!arranging) await hostS.page.waitForTimeout(500)
}
out.arrange_ui_shown = arranging
await hostS.page.screenshot({ path: `${OUT}duel-arrange.png` })

// 3) 双方点「准备完毕！」（force：聊天 FAB 常驻右下会遮挡部分底部元素命中区——已记录 UX 观察）
await hostS.page.getByRole('button', { name: /准备完毕/ }).click({ force: true })
// ready 是往返（点击→WS→服务端→广播→渲染），轮询断言而非固定等待
let hostReady = false
for (let i = 0; i < 12 && !hostReady; i++) {
  hostReady = await hostS.page.locator('text=/已准备/').first().isVisible().catch(() => false)
  if (!hostReady) await hostS.page.waitForTimeout(500)
}
out.host_ready_state = hostReady
await vicS.page.getByRole('button', { name: /准备完毕/ }).click({ force: true })

// 4) 等 duel_card_start → victim 点牌抢
await hostS.page.waitForTimeout(600)
let canGrab = false
for (let i = 0; i < 30 && !canGrab; i++) {
  canGrab = await vicS.page.locator('.cursor-pointer').first().isVisible().catch(() => false)
  if (!canGrab) await vicS.page.waitForTimeout(500)
}
out.duel_board_cards = canGrab
if (canGrab) {
  // 逐张点击直到 StatusStrip 显示 claimed
  const cards = vicS.page.locator('.cursor-pointer')
  const n = await cards.count()
  let claimed = false
  for (let i = 0; i < Math.min(n, 9) && !claimed; i++) {
    await cards.nth(i).click({ force: true }).catch(() => {})
    await vicS.page.waitForTimeout(700)
    claimed = await vicS.page.locator('text=/你抢到了|已 .*抢到/').first().isVisible().catch(() => false)
      || await vicS.page.locator('text=/等待下一|本首出局|本轮/').first().isVisible().catch(() => false)
  }
  out.vic_ui_grab_feedback = claimed
}
await vicS.page.screenshot({ path: `${OUT}duel-grabbed.png` })

out.host_js_errors = hostS.errors.slice(0, 2)
out.vic_js_errors = vicS.errors.slice(0, 2)
await browser.close()
console.log(JSON.stringify(out, null, 2))
const pass = out.lobby_seat_section === true && out.host_sees_victim === true && out.vic_sees_host === true
  && out.arrange_ui_shown === true && out.host_ready_state === true
  && out.duel_board_cards === true && out.vic_ui_grab_feedback === true
  && out.host_js_errors.length === 0 && out.vic_js_errors.length === 0
console.log(pass ? 'DUEL UI VERIFIED ✓' : 'DUEL UI ✗')
process.exit(pass ? 0 : 1)

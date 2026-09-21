// 裁判模式浏览器 UI + 暂停/恢复验证（D12-补10）：模式覆盖矩阵最后一格。
// judge：开局 → 裁判选牌面板 → 点击选牌 → card_start → 玩家抢牌 UI 反馈。
// 暂停：房主点暂停 → 对端「已暂停」态 → 恢复对局 → 消失。
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
await fetch(`${API}/admin/users/7/disable`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostToken}` }, body: JSON.stringify({ disabled: false }) })
const created = await fetch(`${API}/rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostToken}` },
  body: JSON.stringify({ deck_id: 1, interval_sec: 1, mode: 'judge' }),
}).then(r => r.json())

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
async function dismiss(page) {
  for (let i = 0; i < 3; i++) { const b = page.getByRole('button', { name: '知道了' }); if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}) } await page.waitForTimeout(250) }
}

const hostS = await session('visual_qa', 'qa123456')
await hostS.page.goto(`${BASE}/rooms/${created.id}`, { waitUntil: 'networkidle' })
await dismiss(hostS.page)
const vicS = await session('victim_admin', 'va123456')
const vicToken = await apiLogin('victim_admin', 'va123456')
await fetch(`${API}/rooms/join`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vicToken}` }, body: JSON.stringify({ code: created.code }) })
await vicS.page.goto(`${BASE}/rooms/${created.id}`, { waitUntil: 'networkidle' })
await vicS.page.waitForTimeout(1200)
await dismiss(vicS.page)

// 1) 开局 → 裁判等待选牌
await hostS.page.getByRole('button', { name: /开始游戏/ }).click()
let judgePanel = false
for (let i = 0; i < 30 && !judgePanel; i++) {
  judgePanel = await hostS.page.locator('text=/选择下一首要播放的牌/').first().isVisible().catch(() => false)
  if (!judgePanel) await hostS.page.waitForTimeout(500)
}
out.judge_panel_shown = judgePanel
await hostS.page.screenshot({ path: `${OUT}judge-panel.png` })

// 2) 裁判点击选牌（QA牌1）
await hostS.page.locator('text=QA牌1').first().click({ force: true })
let victimActive = false
for (let i = 0; i < 20 && !victimActive; i++) {
  victimActive = await vicS.page.locator('text=/可抢牌/').first().isVisible().catch(() => false)
  if (!victimActive) await vicS.page.waitForTimeout(500)
}
out.victim_sees_active = victimActive

// 3) victim 抢牌：协议旁路拿当前牌（点击盲猜 1/9 命中率且出局无二次机会——动作层已验证，UI 验证消费）
const wsTicket = await fetch(`${API}/ws-ticket`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vicToken}` },
  body: JSON.stringify({ path: `/ws/rooms/${created.id}` }),
}).then(r => r.json())
// 旁路 WS 开局前监听（音频时长未知每首兜底 60s——但 judge 模式是裁判触发，窗口在选牌后）
const ws = new WebSocket(`ws://localhost:8080/ws/rooms/${created.id}?ticket=${encodeURIComponent(wsTicket.ticket)}`)
ws.onmessage = () => {}
await new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('ws')), 8000); ws.onopen = () => { clearTimeout(t); resolve() } })

// 重新开一首不需要：第一首 QA牌1（card id=1，seed 顺序）仍在窗口内，直接抢
out.protocol_current_card = 1
ws.send(JSON.stringify({ type: 'grab', card_id: 1, cmd_id: 1 }))
{
  let claimed = false
  for (let i = 0; i < 20 && !claimed; i++) {
    claimed = await vicS.page.locator('text=/你抢到了/').first().isVisible().catch(() => false)
    if (!claimed) await vicS.page.waitForTimeout(400)
  }
  out.victim_claimed = claimed
}
ws.close()
await vicS.page.screenshot({ path: `${OUT}judge-claimed.png` })

// 4) 暂停 → victim「已暂停」→ 恢复（抢牌后立即测暂停，避免本首 60s 兜底等待）
await hostS.page.getByRole('button', { name: /暂停/ }).first().click({ force: true })
let paused = false
for (let i = 0; i < 15 && !paused; i++) {
  paused = await vicS.page.locator('text=/已暂停/').first().isVisible().catch(() => false)
  if (!paused) await vicS.page.waitForTimeout(500)
}
out.victim_sees_paused = paused
await vicS.page.screenshot({ path: `${OUT}battle-paused.png` })

await hostS.page.getByRole('button', { name: /继续对局|继续/ }).first().click({ force: true })
let resumed = false
for (let i = 0; i < 15 && !resumed; i++) {
  resumed = !(await vicS.page.locator('text=/已暂停/').first().isVisible().catch(() => false))
  if (!resumed) await vicS.page.waitForTimeout(500)
}
out.victim_sees_resumed = resumed

out.host_js_errors = hostS.errors.slice(0, 2)
out.vic_js_errors = vicS.errors.slice(0, 2)
await browser.close()
console.log(JSON.stringify(out, null, 2))
const pass = out.judge_panel_shown === true && out.victim_sees_active === true
  && out.victim_claimed === true && out.victim_sees_paused === true && out.victim_sees_resumed === true
  && out.host_js_errors.length === 0 && out.vic_js_errors.length === 0
console.log(pass ? 'JUDGE UI + PAUSE VERIFIED ✓' : 'JUDGE UI / PAUSE ✗')
process.exit(pass ? 0 : 1)

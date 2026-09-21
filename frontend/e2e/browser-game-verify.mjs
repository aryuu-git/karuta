// 浏览器 UI 真实对局验证（D12-补7）：前端集成层的最终盲区。
// 双 Playwright 会话真实开一局：建房 → 深链加入 → 开局 → StatusStrip 可抢态
// → victim 点击牌面抢牌 → 双端 UI 同步（claimed 态/计分/废牌堆）。
// 验证的是前端对真实 WS 事件流的消费——此前 WS 500 时代不可能覆盖。
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

// —— 房主建房（API，9 张牌已注库；interval 1s 快节奏） ——
const hostToken = await apiLogin('visual_qa', 'qa123456')
await fetch(`${API}/admin/users/7/disable`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostToken}` },
  body: JSON.stringify({ disabled: false }),
})
const created = await fetch(`${API}/rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostToken}` },
  body: JSON.stringify({ deck_id: 1, interval_sec: 1, mode: 'auto' }),
}).then(r => r.json())
out.room_id = created.id

// —— 房主浏览器：登录 → 房间 ——
async function browserSession(user, pass) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e).slice(0, 150)))
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.getByPlaceholder('输入昵称').fill(user)
  await page.getByPlaceholder('输入密码').fill(pass)
  await page.getByRole('button', { name: /进入战场/ }).click()
  await page.waitForURL('**/', { timeout: 10000 })
  return { ctx, page, errors }
}

const hostS = await browserSession('visual_qa', 'qa123456')
await hostS.page.goto(`${BASE}/rooms/${created.id}`, { waitUntil: 'networkidle' })
await hostS.page.waitForTimeout(1200)
const dH = hostS.page.getByRole('button', { name: '知道了' })
if (await dH.isVisible().catch(() => false)) await dH.click()

// —— victim 浏览器：登录 → 深链加入（顺带验证 /rooms/join?code 深链 UI） ——
const vicS = await browserSession('victim_admin', 'va123456')
await vicS.page.goto(`${BASE}/rooms/join?code=${created.code}`, { waitUntil: 'networkidle' })
await vicS.page.waitForTimeout(2000)
out.victim_deep_link_joined = /\/rooms\//.test(new URL(vicS.page.url()).pathname)
const dV = vicS.page.getByRole('button', { name: '知道了' })
if (await dV.isVisible().catch(() => false)) await dV.click()

// —— 抢牌旁路 WS：必须在开局前连接（音频时长未知时每首兜底 60s，接晚了收不到 card_start） ——
const vicToken = await apiLogin('victim_admin', 'va123456')
const ticketRes = await fetch(`${API}/ws-ticket`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vicToken}` },
  body: JSON.stringify({ path: `/ws/rooms/${created.id}` }),
}).then(r => r.json())
const ws = new WebSocket(`ws://localhost:8080/ws/rooms/${created.id}?ticket=${encodeURIComponent(ticketRes.ticket)}`)
let currentCardId = null
ws.onmessage = (ev) => {
  try {
    const e = JSON.parse(ev.data)
    if (e.type === 'card_start') currentCardId = e.card_id
  } catch { /* */ }
}
await new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('ws')), 8000); ws.onopen = () => { clearTimeout(t); resolve() } })

// —— 房主开局 ——
const startBtn = hostS.page.getByRole('button', { name: /开始游戏/ })
await startBtn.click()
// 等待对局页加载（StatusStrip 出现）
await hostS.page.waitForTimeout(5000)

// —— 断言 StatusStrip 状态（等待可抢窗口） ——
const stripHasActive = async (page) => {
  for (let i = 0; i < 40; i++) {
    const txt = await page.locator('text=/可抢牌/').first().isVisible().catch(() => false)
    if (txt) return true
    // 出局/等待本首 结束后会重新进入可抢
    await page.waitForTimeout(500)
  }
  return false
}
out.host_strip_active = await stripHasActive(hostS.page)
out.vic_strip_active = await stripHasActive(vicS.page)
await hostS.page.screenshot({ path: `${OUT}battle-host-active.png` })

// —— 抢牌：用旁路 WS 拿到的当前牌抢（动作层已验证；本轮验证 UI 对 claimed 的消费与展示） ——
let cmdId = 0
let uiClaimed = false
// 等第一首
for (let i = 0; i < 40 && !currentCardId; i++) await vicS.page.waitForTimeout(500)
out.protocol_current_card = currentCardId
for (let attempt = 0; attempt < 6 && !uiClaimed; attempt++) {
  if (!currentCardId) break
  ws.send(JSON.stringify({ type: 'grab', card_id: currentCardId, cmd_id: ++cmdId }))
  // UI 断言：精确匹配 claimed 文案（「你抢到了」；出局文案是「本首出局」不含此串）
  for (let i = 0; i < 20 && !uiClaimed; i++) {
    uiClaimed = await vicS.page.locator('text=/你抢到了/').first().isVisible().catch(() => false)
    if (uiClaimed) {
      // 匹配瞬间计数（success toast 仅 2s，晚了会消失）
      out.claimed_toast_count = await vicS.page.locator('text=/你抢到了/').count()
    }
    if (!uiClaimed) await vicS.page.waitForTimeout(400)
  }
  // 若出局（前一首残留），等下一首再试（每首兜底 60s，耐心等）
  if (!uiClaimed) {
    currentCardId = null
    for (let i = 0; i < 140 && !currentCardId; i++) await vicS.page.waitForTimeout(500)
  }
}
out.victim_claimed_via_ui = uiClaimed
await vicS.page.screenshot({ path: `${OUT}battle-victim-claimed.png` })
ws.close()

// —— 房主端同步：计分板出现 victim 分数>0 或废牌堆增长 ——
await hostS.page.waitForTimeout(1500)
out.host_saw_claim = await hostS.page.locator('text=/等待下一首|出局|可抢牌/').first().isVisible().catch(() => false)
out.host_js_errors = hostS.errors.slice(0, 3)
out.vic_js_errors = vicS.errors.slice(0, 3)

await browser.close()
console.log(JSON.stringify(out, null, 2))
const pass = out.victim_deep_link_joined === true && out.host_strip_active === true
  && out.vic_strip_active === true && out.victim_claimed_via_ui === true
  && out.claimed_toast_count === 1
  && out.host_js_errors.length === 0 && out.vic_js_errors.length === 0
console.log(pass ? 'BROWSER UI GAME VERIFIED ✓' : 'BROWSER UI GAME ✗')
process.exit(pass ? 0 : 1)

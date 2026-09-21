// ConnectionBanner 真实断线验证（D12-补8）：P1 交付后首次真实断线链路测试。
// 利用修⑧的禁用踢 WS 制造真实断线：victim 对局中被禁用 → WS 断开 → 重连尝试被拦
// → ConnectionBanner 应显示「连接中断，重连中…(n/10)」；解禁 → 自动重连 → 「已恢复」。
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
async function admin(token, path, body) {
  return fetch(API + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).then(r => r.status)
}

const browser = await chromium.launch()
const out = {}

const hostToken = await apiLogin('visual_qa', 'qa123456')
await admin(hostToken, '/admin/users/7/disable', { disabled: false })

// 建房
const created = await fetch(`${API}/rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostToken}` },
  body: JSON.stringify({ deck_id: 1, interval_sec: 1, mode: 'auto' }),
}).then(r => r.json())

async function session(user, pass) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.getByPlaceholder('输入昵称').fill(user)
  await page.getByPlaceholder('输入密码').fill(pass)
  await page.getByRole('button', { name: /进入战场/ }).click()
  await page.waitForURL('**/', { timeout: 10000 })
  return { ctx, page }
}

const hostS = await session('visual_qa', 'qa123456')
await hostS.page.goto(`${BASE}/rooms/${created.id}`, { waitUntil: 'networkidle' })
const dH = hostS.page.getByRole('button', { name: '知道了' })
if (await dH.isVisible().catch(() => false)) await dH.click()

const vicS = await session('victim_admin', 'va123456')
// victim 先加入房间（非成员直接访问房间页会落 403 错误态——那是另一条已验证路径）
const vicToken2 = await apiLogin('victim_admin', 'va123456')
await fetch(`${API}/rooms/join`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vicToken2}` },
  body: JSON.stringify({ code: created.code }),
})
await vicS.page.goto(`${BASE}/rooms/${created.id}`, { waitUntil: 'networkidle' })
await vicS.page.waitForTimeout(1500)
const dV = vicS.page.getByRole('button', { name: '知道了' })
if (await dV.isVisible().catch(() => false)) await dV.click()

// 开局（对局态才有 battle view 的 ConnectionBanner）
await hostS.page.getByRole('button', { name: /开始游戏/ }).click()
await hostS.page.waitForTimeout(4000)

// 1) 禁用 victim → WS 被踢 → 重连失败 → banner 应显示
out.disable_status = await admin(hostToken, '/admin/users/7/disable', { disabled: true })
let bannerShown = false
for (let i = 0; i < 25 && !bannerShown; i++) {
  bannerShown = await vicS.page.locator('text=/连接中断/').first().isVisible().catch(() => false)
  if (!bannerShown) await vicS.page.waitForTimeout(400)
}
out.banner_shown = bannerShown
await vicS.page.screenshot({ path: `${OUT}banner-reconnecting.png` })

// 2) 解禁 → 下次重连重试成功 → 「已恢复」出现后自动消失
out.enable_status = await admin(hostToken, '/admin/users/7/disable', { disabled: false })
let recovered = false
for (let i = 0; i < 40 && !recovered; i++) {
  recovered = await vicS.page.locator('text=/已恢复/').first().isVisible().catch(() => false)
    || !(await vicS.page.locator('text=/连接中断/').first().isVisible().catch(() => false))
    && i > 5
  if (!recovered) await vicS.page.waitForTimeout(500)
}
out.banner_recovered = recovered
// 恢复后 banner 应最终消失（2s 自动消失）
await vicS.page.waitForTimeout(3000)
out.banner_gone = !(await vicS.page.locator('text=/已恢复|连接中断/').first().isVisible().catch(() => false))

await browser.close()
console.log(JSON.stringify(out, null, 2))
const pass = out.banner_shown === true && out.banner_recovered === true && out.banner_gone === true
console.log(pass ? 'CONNECTION BANNER VERIFIED ✓' : 'CONNECTION BANNER ✗')
process.exit(pass ? 0 : 1)

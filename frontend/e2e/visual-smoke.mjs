// 视觉冒烟脚本（Playwright，不依赖 Chrome relay）。
// 对公开页与双视口做真实渲染截图，存 baseline/visual-smoke/ 供人工/AI 视觉验收。
// 用法：node e2e/visual-smoke.mjs（需 dev server 已启动，默认 http://localhost:5199）
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.QA_BASE_URL ?? 'http://localhost:5199'
const OUT = new URL('../baseline/visual-smoke/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(OUT, { recursive: true })

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 375, height: 812 }

/** [名称, 路径, 视口] */
const PAGES = [
  ['login-desktop', '/login', DESKTOP],
  ['register-desktop', '/register', DESKTOP],
  ['guest-desktop', '/guest', DESKTOP],
  ['join-unauth-desktop', '/rooms/join?code=ABC123', DESKTOP],
  ['notfound-desktop', '/no-such-page', DESKTOP],
  ['login-mobile', '/login', MOBILE],
  ['guest-mobile', '/guest', MOBILE],
  ['join-unauth-mobile', '/rooms/join?code=ABC123', MOBILE],
]

const browser = await chromium.launch()
const results = []

for (const [name, path, viewport] of PAGES) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', err => errors.push(String(err).slice(0, 200)))
  page.on('console', msg => { if (msg.type() === 'error') errors.push('[console] ' + msg.text().slice(0, 200)) })
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(600) // 动画稳定
    await page.screenshot({ path: `${OUT}${name}.png` })
    results.push({ name, ok: true, errors })
  } catch (e) {
    results.push({ name, ok: false, error: String(e).slice(0, 200), errors })
  }
  await ctx.close()
}

await browser.close()
console.log(JSON.stringify(results, null, 2))

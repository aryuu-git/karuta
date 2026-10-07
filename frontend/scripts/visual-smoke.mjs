#!/usr/bin/env node
/**
 * 视觉冒烟（framer 卡死回归守卫）。
 * 在 prefers-reduced-motion 下用系统 Chrome 访问 /、/login、/register，
 * 截图存 data/visual，并断言「页面加载 2 秒后 document 里不存在 inline style 停在 opacity: 0 的元素」。
 *
 * 背景：framer-motion 在后台标签页/低帧率/减动效下会卡在 opacity:0 初始态（2026-09-30 实测回归）。
 * 入场已统一走 <FadeIn />（CSS keyframes，墙钟驱动，见 components/ui/FadeIn.tsx），
 * 本脚本守住该不变量：入场动画结束后不允许残留 inline opacity:0。
 *
 * 用法：npm run test:visual（= node scripts/visual-smoke.mjs）
 *   可选环境变量：VISUAL_BASE_URL（外部已起服务则不再自起 vite）、VISUAL_PORT、VISUAL_OUT_DIR。
 *
 * 依赖说明：playwright 未在 package.json 直接声明，而是经 @playwright/test 传递安装于 node_modules，
 * 这里直接从 node_modules 解析导入，不新增依赖。浏览器用系统 Chrome（channel:'chrome'），不下载。
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from 'playwright'

const ROOT = fileURLToPath(new URL('..', import.meta.url)) // frontend/
const OUT = process.env.VISUAL_OUT_DIR || join(ROOT, 'data', 'visual')
const BASE_URL = process.env.VISUAL_BASE_URL || '' // 外部服务优先
const PORT = Number(process.env.VISUAL_PORT || 5199)
const ROUTES = ['/', '/login', '/register']

/** 起 vite dev 服务（自给自足「node 直跑」）；返回 { url, stop } */
async function startServer() {
  if (BASE_URL) return { url: BASE_URL, stop: () => {} }
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const child = spawn(process.execPath, [vite, '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  })
  const url = `http://localhost:${PORT}`
  const deadline = Date.now() + 30000
  for (;;) {
    try {
      const res = await fetch(url)
      if (res.ok) break // 就绪（含复用已在跑的同端口 vite）
    } catch {
      /* 未就绪，继续轮询 */
    }
    if (Date.now() > deadline) {
      try {
        child.kill()
      } catch {}
      throw new Error(`vite dev 启动超时（${url}）`)
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return {
    url,
    stop: () => {
      try {
        child.kill()
      } catch {}
    },
  }
}

/** 断言：settle 后不存在 inline style 停在 opacity: 0 的元素，返回命中的卡死元素 */
function collectStuck(page) {
  return page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('*')) {
      const op = el.style && el.style.opacity
      if (op !== '' && Number(op) === 0) {
        out.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), opacity: op })
      }
    }
    return out
  })
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const server = await startServer()
  // 系统 Chrome，不下载浏览器
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    // prefers-reduced-motion: reduce
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: { width: 1280, height: 800 },
    })
    const page = await context.newPage()
    for (const route of ROUTES) {
      await page.goto(server.url + route, { waitUntil: 'load', timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(2000) // 墙钟 2s，入场动画应走完
      const name = route === '/' ? 'home' : route.slice(1).replace(/\//g, '-')
      const shot = join(OUT, `${name}.png`)
      await page.screenshot({ path: shot, fullPage: true }) // 先留证据
      const stuck = await collectStuck(page)
      if (stuck.length > 0) {
        const detail = stuck.map((s) => `  <${s.tag} class="${s.cls}" style.opacity="${s.opacity}">`).join('\n')
        throw new Error(`${route} 存在 ${stuck.length} 个 inline opacity:0 卡死元素：\n${detail}`)
      }
      console.log(`OK  ${route}  截图 ${shot}`)
    }
    await context.close()
    console.log('visual:smoke 通过：无 framer opacity:0 卡死')
  } finally {
    await browser.close().catch(() => {})
    server.stop()
  }
}

main().catch((err) => {
  console.error('visual:smoke 失败：', err.message)
  process.exit(1)
})

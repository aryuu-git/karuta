// Self-contained browser UI checks with a mocked server contract; no live accounts/data.
// Run: node e2e/judge-queue-ui-verify.mjs
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, '..', 'data', 'visual', 'judge-queue')
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5211', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let serverLog = ''
server.stdout.on('data', data => { serverLog += data })
server.stderr.on('data', data => { serverLog += data })
const base = 'http://127.0.0.1:5211'
let browser
try {
  for (let i = 0; ; i++) {
    if (i > 100) throw new Error('Vite did not start')
    try { if ((await fetch(base)).ok) break } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const viewport of [{ width: 1440, height: 900 }, { width: 800, height: 900 }, { width: 390, height: 844 }]) {
    const reducedMotion = viewport.width === 800
    const context = await browser.newContext({ viewport, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
    const page = await context.newPage()
    const errors = []
    const loadErrors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('requestfailed', request => loadErrors.push(`${request.url()}: ${request.failure()?.errorText}`))
    page.on('console', message => { if (message.type() === 'error') loadErrors.push(message.text()) })
    const room = { id: 42, code: 'QUEUE1', host_id: 1, mode: 'judge', status: 'reading', interval_sec: 5 }
    const cover = name => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#513449"/><stop offset="1" stop-color="#171225"/></linearGradient></defs><rect width="240" height="320" fill="url(#g)"/><circle cx="120" cy="110" r="65" fill="none" stroke="#be859c"/><path d="M60 110h120M120 50v120" stroke="#be859c"/><text x="120" y="230" text-anchor="middle" fill="#f2d4df" font-size="20">${name}</text><text x="120" y="270" text-anchor="middle" fill="#be859c" font-size="12">KARUTA</text></svg>`)}`
    const cards = [{ id: 7, display_text: '东方红魔乡', cover_url: cover('东方红魔乡'), audio_count: 4, remaining: 4,
      audios: ['上海红茶馆', '月时计', '为逝去的公主而奏的七重奏', '魔法少女们的百年祭'].map((hint_text, index) => ({ id: index + 1, card_id: 7, hint_text, duration_sec: 120, audio_url: '' })) }]
    for (let id = 8; id < 19; id++) cards.push({ id, display_text: `歌牌 ${id - 6}`, cover_url: cover(`歌牌 ${id - 6}`), audio_count: 1, remaining: 1, audios: [{ id: id + 10, card_id: id, hint_text: `曲目 ${id - 6}`, duration_sec: 120, audio_url: '' }] })
    const snapshot = { room, cards, players: [{ room_id: 42, user_id: 2, username: '玩家', score: 0, role: 'player', online: true }], remaining_count: 4, judge_waiting: false }
    let queue = { type: 'judge_queue', items: [], played: [{ card_id: 7, card_audio_id: 1 }] }
    const sockets = new Set()
    let hostView = true
    const sendQueue = () => { for (const ws of sockets) ws.send(JSON.stringify(queue)) }
    await context.addInitScript(() => {
      localStorage.setItem('karuta_token', 'test-only')
      localStorage.setItem('karuta_changelog_seen', '4.0.0')
    })
    await page.route(`${base}/api/**`, async route => {
      const path = new URL(route.request().url()).pathname
      let json = {}
      if (path === '/api/me') json = { id: hostView ? 1 : 2, username: hostView ? '裁判' : '玩家', is_guest: false }
      else if (path === '/api/ws-ticket') json = { ticket: 'mock' }
      else if (path === '/api/rooms/42') json = snapshot
      else if (path === '/api/rooms/42/play-card') {
        const command = route.request().postDataJSON()
        const index = queue.items.findIndex(item => item.card_audio_id === command.card_audio_id)
        if (command.action === 'add') queue.items.push({ card_id: command.card_id, card_audio_id: command.card_audio_id, start_sec: command.start_sec })
        if (command.action === 'remove') queue.items.splice(index, 1)
        if (command.action === 'clear') queue.items = []
        if (command.action === 'move') queue.items.splice(command.position, 0, ...queue.items.splice(index, 1))
        if (command.action === 'update') queue.items[index].start_sec = command.start_sec
        sendQueue()
      }
      await route.fulfill({ json })
    })
    await page.routeWebSocket('**/ws/rooms/42*', ws => {
      sockets.add(ws)
      ws.onClose(() => sockets.delete(ws))
      ws.send(JSON.stringify({ type: 'room_state', data: snapshot }))
      ws.send(JSON.stringify(queue))
    })
    await page.goto(`${base}/rooms/42`)
    try {
      await page.getByRole('button', { name: '展开裁判播放仪表板' }).waitFor({ timeout: 15000 })
    } catch (error) {
      await page.screenshot({ path: join(out, 'failure.png'), fullPage: true })
      console.error({ url: page.url(), text: await page.locator('body').innerText(), errors, loadErrors, serverLog })
      throw error
    }
    const sidebar = page.getByRole('complementary', { name: '裁判播放仪表板' })
    const sidebarShell = page.locator('.judge-sidebar')
    const settleSidebar = () => sidebarShell.evaluate(async element => {
      // Flush styles and await real browser transitions, including a reversed transition.
      getComputedStyle(element).width
      await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
    })
    const openSidebar = async () => {
      await page.getByRole('button', { name: '展开裁判播放仪表板' }).click()
      await settleSidebar()
    }
    await sidebarShell.evaluate(element => {
      element.dataset.transitions = ''
      element.addEventListener('transitionrun', event => {
        if (event.target === element) element.dataset.transitions += `${event.propertyName},`
      })
    })
    await expect(sidebar).toBeHidden()
    const board = page.getByRole('region', { name: '场上牌面' })
    const collapsedBoard = await board.boundingBox()
    assert.ok(collapsedBoard.height > 450, 'collapsed controls should leave full board height')
    await page.screenshot({ path: join(out, `${viewport.width}-collapsed.png`), fullPage: true })
    await openSidebar()
    await expect(sidebar).toBeVisible()
    const songs = page.getByRole('region', { name: '可选歌曲' })
    const songOrder = await songs.getByRole('button', { name: /^加入待播：/ }).allTextContents()
    assert.equal(songOrder.at(-1), '已播放', 'played songs should be at the bottom')
    if (viewport.width >= 768) {
      const boardBounds = await board.boundingBox()
      const sidebarBounds = await sidebar.boundingBox()
      assert.ok(boardBounds.x + boardBounds.width <= sidebarBounds.x, 'desktop sidebar must not cover cards')
      assert.ok(boardBounds.width >= 300, 'desktop board should remain usable')
      assert.equal(boardBounds.height, collapsedBoard.height, 'sidebar must not reduce board height')
    } else {
      await page.mouse.click(10, collapsedBoard.y + 80)
      await settleSidebar()
      await expect(sidebar).toBeHidden()
      await openSidebar()
    }
    await page.getByRole('textbox', { name: '搜索歌曲' }).fill('月时计')
    await page.getByLabel('月时计播放起点（秒）').fill('12')
    await page.getByRole('button', { name: '关闭裁判播放仪表板' }).click()
    await expect(sidebarShell).toHaveAttribute('inert', '')
    await settleSidebar()
    await expect(sidebar).toBeHidden()
    await expect(page.getByRole('button', { name: '展开裁判播放仪表板' })).toBeFocused()
    await openSidebar()
    await expect(page.getByRole('textbox', { name: '搜索歌曲' })).toHaveValue('月时计')
    await expect(page.getByLabel('月时计播放起点（秒）')).toHaveValue('12')
    await page.getByRole('button', { name: '清除搜索' }).click()
    await page.getByLabel('月时计播放起点（秒）').fill('30')
    await page.getByRole('button', { name: '加入待播：月时计' }).click()
    await expect(page.getByRole('button', { name: '加入待播：月时计' })).toBeDisabled()
    await page.getByRole('button', { name: '加入待播：为逝去的公主而奏的七重奏' }).click()
    await expect(page.getByText('待播 2 首', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '待播队列（2）' }).click()
    await page.getByRole('button', { name: '上移：为逝去的公主而奏的七重奏' }).click()
    await expect(page.getByRole('button', { name: '上移：为逝去的公主而奏的七重奏' })).toBeDisabled()
    assert.equal(queue.items[0].card_audio_id, 3)
    await page.keyboard.press('Escape')
    await settleSidebar()
    await expect(sidebar).toBeHidden()
    await expect(page.getByRole('button', { name: '展开裁判播放仪表板' })).toBeFocused()
    await openSidebar()
    await expect(page.getByRole('button', { name: '上移：为逝去的公主而奏的七重奏' })).toBeVisible()
    // Reverse a closing transition before it finishes: it must end fully open.
    await page.getByRole('button', { name: '收起裁判播放仪表板' }).evaluate(async button => {
      button.click()
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      button.click()
    })
    await settleSidebar()
    await expect(sidebar).toBeVisible()
    await expect(sidebarShell).not.toHaveAttribute('inert', '')
    if (reducedMotion) {
      assert.equal(await sidebarShell.evaluate(element => getComputedStyle(element).transitionDuration), '0s')
    } else {
      const properties = (await sidebarShell.getAttribute('data-transitions')).split(',')
      const property = viewport.width >= 768 ? 'width' : 'transform'
      assert.ok(properties.filter(value => value === property).length >= 4, 'opening and closing should both animate')
    }
    await page.reload()
    await openSidebar()
    await expect(page.getByText('待播 2 首', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '待播队列（2）' }).click()
    await expect(page.getByLabel('月时计播放起点（秒）')).toHaveValue('30')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'horizontal overflow')
    await page.screenshot({ path: join(out, `${viewport.width}.png`), fullPage: true })
    await page.getByRole('button', { name: '移除：月时计' }).click()
    await expect(page.getByText('待播 1 首', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '清空待播' }).click()
    await expect(page.getByText('待播 0 首', { exact: true })).toBeVisible()
    hostView = false
    await page.reload()
    await expect(page.getByText('⏳ 本首结束后可参与抢牌')).toBeVisible()
    await expect(page.getByRole('button', { name: '展开裁判播放仪表板' })).toHaveCount(0)
    assert.deepEqual(errors, [])
    await context.close()
    console.log(`Judge queue UI ${viewport.width}px: PASS`)
  }
  console.log(`Screenshots: ${out}`)
} finally {
  await browser?.close()
  server.kill()
}

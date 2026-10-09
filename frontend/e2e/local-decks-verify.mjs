// Verify the real local backend and the list -> detail -> back flow.
// Run after dev-local.ps1: node e2e/local-decks-verify.mjs
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173'
const username = process.env.QA_USERNAME ?? 'localdemo'
const password = process.env.QA_PASSWORD ?? 'localdemo123'
const output = fileURLToPath(new URL('../baseline/local-test/', import.meta.url))
mkdirSync(output, { recursive: true })

const browser = await chromium.launch({ channel: process.env.QA_BROWSER_CHANNEL ?? 'chrome' })
const results = []
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport })
    try {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${base}/decks`)
      await page.getByPlaceholder('输入昵称').fill(username)
      await page.getByPlaceholder('输入密码').fill(password)
      await page.getByRole('button', { name: '进入战场', exact: true }).click()
      await expect(page).toHaveURL(`${base}/decks`)
      await expect(page.getByRole('heading', { name: '本地测试牌组', exact: true })).toBeVisible()
      // The app shows its existing changelog to every fresh browser profile.
      await expect(page.getByText('更新日志', { exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByText('更新日志', { exact: true })).not.toBeVisible()
      await page.getByRole('button', { name: '查看', exact: true }).first().click()
      await expect(page).toHaveURL(/\/decks\/\d+$/)
      const token = await page.evaluate(() => localStorage.getItem('karuta_token'))
      const detail = await page.request.get(`${base}/api${new URL(page.url()).pathname}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(detail.ok()).toBe(true)
      const { cards } = await detail.json()
      expect(cards).toHaveLength(6)
      await expect(page.getByRole('button', { name: '试听', exact: true })).toHaveCount(6)

      const images = page.locator('img[src^="/uploads/covers/"]')
      await expect(images).toHaveCount(6)
      await expect.poll(() => images.evaluateAll(elements => elements.every(img => img.complete && img.naturalWidth > 0))).toBe(true)

      const audio = await page.request.get(`${base}${cards[0].audios[0].audio_url}`, {
        headers: { Range: 'bytes=0-43' },
      })
      expect(audio.status()).toBe(206)
      expect(audio.headers()['content-type']).toBe('audio/wav')
      expect((await audio.body()).subarray(0, 4).toString()).toBe('RIFF')
      await images.first().hover()
      await page.getByRole('button', { name: '试听', exact: true }).first().click()
      await expect(page.getByRole('button', { name: '停止试听', exact: true })).toHaveCount(1)
      await page.getByRole('button', { name: '停止试听', exact: true }).click()

      await page.screenshot({ path: `${output}/${name}-detail.png` })
      await page.getByRole('button', { name: '返回', exact: true }).click()
      await expect(page).toHaveURL(`${base}/decks`)
      await expect(page.getByRole('button', { name: '查看', exact: true })).toHaveCount(2)
      await page.screenshot({ path: `${output}/${name}-decks.png` })
      expect(errors).toEqual([])
      results.push({ viewport: name, login: 'ok', covers: 'ok', audio: 'ok', returnToDecks: 'ok' })
    } finally {
      await context.close()
    }
  }
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}

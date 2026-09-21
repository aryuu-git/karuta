import type { Card } from '../api/types'
import { api } from '../api/client'

/**
 * 卡片牌包导出/导入（P2，jszip 动态加载不进主包）。
 * 导出：manifest.json + 每卡 cover/音频二进制；导入：解析后走现有
 * create/addAudio API（服务端 magic bytes 嗅探格式，无需 mime）。
 * 导入一律 is_shared=false（安全默认，导入后再自行公开）。
 */
interface PackAudio {
  file: string
  hint: string
  duration: number
}
interface PackCard {
  display_text: string
  series: string
  tags: string
  cover?: string
  audios: PackAudio[]
}
interface PackManifest {
  version: 1
  cards: PackCard[]
}

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const resp = await fetch(url)
    return resp.ok ? await resp.blob() : null
  } catch {
    return null
  }
}

/** 1×1 深色占位 PNG（后端封面必填；无封面卡导出后重导入兜底）——cardPack/deckPack 共用 */
export async function placeholderCover(): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 3
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#1a1420'
    ctx.fillRect(0, 0, 2, 3)
  }
  // canvas.toBlob 为回调式 API，且本项目 lib=ES2020 无 Promise.withResolvers——
  // 保留构造器形式（ts-promise-withResolvers 规则的 lib 约束例外）
  return new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b ?? new Blob()), 'image/png'))
}

/** 导出选中卡片为牌包 zip */
export async function exportCardPack(cards: Card[]): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const manifest: PackManifest = { version: 1, cards: [] }

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    const entry: PackCard = { display_text: c.display_text, series: c.series || '', tags: c.tags || '', audios: [] }
    const dir = `c${i}`

    const coverBlob = c.cover_url ? await fetchBlob(c.cover_url) : null
    if (coverBlob) {
      zip.file(`${dir}/cover`, coverBlob)
      entry.cover = `${dir}/cover`
    }

    try {
      const detail = await api.cards.get(c.id)
      for (let j = 0; j < (detail.audios?.length ?? 0); j++) {
        const a = detail.audios[j]
        const blob = await fetchBlob(a.audio_url)
        if (!blob) continue
        zip.file(`${dir}/a${j}`, blob)
        entry.audios.push({ file: `${dir}/a${j}`, hint: a.hint_text || '', duration: a.duration_sec ?? 0 })
      }
    } catch { /* 单卡详情拉取失败跳过其音频，元数据仍保留 */ }

    manifest.cards.push(entry)
  }

  zip.file('manifest.json', JSON.stringify(manifest))
  return zip.generateAsync({ type: 'blob' })
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** 导入牌包：逐卡 create + 追加音频，返回成败计数 */
export async function importCardPack(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<{ created: number; failed: number }> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file)
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('无效的牌包：缺少 manifest.json')
  const manifest = JSON.parse(await manifestFile.async('string')) as PackManifest
  if (!manifest?.cards?.length) throw new Error('无效的牌包：没有卡片数据')

  let created = 0
  let failed = 0
  for (const entry of manifest.cards) {
    try {
      const first = entry.audios[0]
      const audioBlob = first ? await zip.file(first.file)?.async('blob') : null
      if (!audioBlob) {
        failed++
        continue
      }
      const fd = new FormData()
      fd.append('audio', new File([audioBlob], 'a0'))
      fd.append('audio_duration', String(first.duration ?? 0))
      const coverBlob = entry.cover ? await zip.file(entry.cover)?.async('blob') : await placeholderCover()
      if (coverBlob) fd.append('cover', new File([coverBlob], 'cover'))
      fd.append('display_text', entry.display_text || '—')
      fd.append('series', entry.series || '')
      fd.append('tags', entry.tags || '')
      fd.append('is_shared', 'false')
      if (first.hint) fd.append('hint_text', first.hint)

      const card = await api.cards.create(fd)
      for (let j = 1; j < entry.audios.length; j++) {
        const a = entry.audios[j]
        const blob = await zip.file(a.file)?.async('blob')
        if (!blob) continue
        const afd = new FormData()
        afd.append('audio', new File([blob], `a${j}`))
        afd.append('audio_duration', String(a.duration ?? 0))
        if (a.hint) afd.append('hint_text', a.hint)
        await api.cards.addAudio(card.id, afd)
      }
      created++
    } catch {
      failed++
    }
    onProgress?.(created + failed, manifest.cards.length)
  }
  return { created, failed }
}

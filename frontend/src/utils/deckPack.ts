import type { Card } from '../api/types'
import { api } from '../api/client'
import { placeholderCover } from './cardPack'

/**
 * 牌组包导出/导入（v8 增补）：manifest 带牌组元数据 + 全部卡片元数据与媒体，
 * 可跨机器完整重建（旧「封面 zip」升级为可导入的牌组包）。导入创建为私有牌组，
 * 卡片默认私有——安全默认，导入后自行调整共享。
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
interface DeckPackManifest {
  version: 1
  deck: { name: string; description: string }
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

/** 导出牌组包 zip（manifest + 媒体） */
export async function exportDeckPack(deck: { name: string; description?: string }, cards: Card[]): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const manifest: DeckPackManifest = {
    version: 1,
    deck: { name: deck.name, description: deck.description || '' },
    cards: [],
  }

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    const dir = `c${i}`
    const entry: PackCard = { display_text: c.display_text, series: c.series || '', tags: c.tags || '', audios: [] }

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
    } catch { /* 单卡拉取失败跳过音频，元数据保留 */ }
    manifest.cards.push(entry)
  }

  zip.file('manifest.json', JSON.stringify(manifest))
  return zip.generateAsync({ type: 'blob' })
}

/** 导入牌组包：建私有牌组 + 逐卡重建 + 批量入组 */
export async function importDeckPack(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<{ deckId: number; created: number; failed: number }> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file)
  const mf = zip.file('manifest.json')
  if (!mf) throw new Error('无效的牌组包：缺少 manifest.json')
  const manifest = JSON.parse(await mf.async('string')) as DeckPackManifest
  if (!manifest?.deck?.name || !Array.isArray(manifest.cards)) throw new Error('无效的牌组包：数据不完整')

  const deck = await api.decks.create(manifest.deck.name, manifest.deck.description || '', 'private', 'add_only')
  const addedIds: number[] = []
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
      addedIds.push(card.id)
      created++
    } catch {
      failed++
    }
    onProgress?.(created + failed, manifest.cards.length)
  }

  if (addedIds.length > 0) {
    await api.decks.addCards(deck.id, addedIds)
  }
  return { deckId: deck.id, created, failed }
}

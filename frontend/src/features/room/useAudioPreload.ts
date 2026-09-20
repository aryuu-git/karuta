import { useCallback, useEffect, useRef, useState } from 'react'
import type { Card } from '../../api/types'

/**
 * 音频/封面预取。
 * - prefetchAudioUrls：滚动预取入口，card_start 事件携带 next_audio_urls 时调用；
 *   解码完成的 Audio 缓存在 prefetchedAudioRef（LRU，最多保留 3 个）。
 * - 等待大厅阶段加载全部轻量封面，但音频只预取前三首；之后由对局中的
 *   next_audio_urls 滚动补齐。preloadProgress 供 WaitingLobby 展示进度。
 */
export function useAudioPreload(cards: Card[], gameStatus: string) {
  const [preloadProgress, setPreloadProgress] = useState<{ loaded: number; total: number } | null>(null)
  const preloadStartedRef = useRef(false)
  const prefetchedAudioRef = useRef(new Map<string, HTMLAudioElement>())
  const prefetchingAudioRef = useRef(new Set<string>())

  const prefetchAudioUrls = useCallback(async (urls: string[]) => {
    for (const url of urls) {
      if (!url || prefetchedAudioRef.current.has(url) || prefetchingAudioRef.current.has(url)) continue
      prefetchingAudioRef.current.add(url)
      try {
        await new Promise<void>((resolve) => {
          const audio = new Audio()
          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            prefetchedAudioRef.current.set(url, audio)
            while (prefetchedAudioRef.current.size > 3) {
              const oldest = prefetchedAudioRef.current.keys().next().value as string | undefined
              if (!oldest) break
              const oldAudio = prefetchedAudioRef.current.get(oldest)
              oldAudio?.pause()
              prefetchedAudioRef.current.delete(oldest)
            }
            resolve()
          }
          audio.addEventListener('canplaythrough', finish, { once: true })
          audio.addEventListener('error', finish, { once: true })
          audio.preload = 'auto'
          audio.src = url
          audio.load()
          setTimeout(finish, 15000)
        })
      } finally {
        prefetchingAudioRef.current.delete(url)
      }
    }
  }, [])

  // 等待大厅阶段加载全部轻量封面，但音频只预取前三首；之后滚动预取下一批。
  useEffect(() => {
    if (!cards.length || gameStatus !== 'waiting' || preloadStartedRef.current) return
    preloadStartedRef.current = true

    const items: { type: 'image' | 'audio'; url: string }[] = []
    let audioSlots = 3
    cards.forEach(card => {
      if (card.cover_url) items.push({ type: 'image', url: card.cover_url })
      if (audioSlots > 0 && card.audios?.length) {
        for (const audio of card.audios) {
          if (audioSlots <= 0) break
          if (audio.audio_url) {
            items.push({ type: 'audio', url: audio.audio_url })
            audioSlots--
          }
        }
      } else if (audioSlots > 0 && card.audio_url) {
        items.push({ type: 'audio', url: card.audio_url })
        audioSlots--
      }
    })
    if (!items.length) return

    setPreloadProgress({ loaded: 0, total: items.length })

    // 浏览器预加载（确保解码完成）
    let cancelled = false
    ;(async () => {
      let loaded = 0
      const tick = () => {
        loaded++
        if (!cancelled) setPreloadProgress({ loaded, total: items.length })
      }

      for (const item of items) {
        if (cancelled) break
        try {
          if (item.type === 'image') {
            await new Promise<void>((resolve) => {
              const img = new Image()
              img.onload = () => { tick(); resolve() }
              img.onerror = () => { tick(); resolve() }
              img.src = item.url
            })
          } else {
            await prefetchAudioUrls([item.url])
            tick()
          }
        } catch {
          tick()
        }
      }
    })()

    return () => { cancelled = true }
  }, [cards, gameStatus, prefetchAudioUrls])

  return { preloadProgress, prefetchAudioUrls }
}

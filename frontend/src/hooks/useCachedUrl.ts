import { useState, useEffect } from 'react'
import { resolveMediaUrl, cacheMedia } from '../utils/mediaCache'
import { IS_NATIVE } from '../config'

/**
 * 自动缓存并返回本地媒体 URL
 * - Web 环境：直接返回原始 URL
 * - 原生客户端：下载到本地后返回本地路径
 */
export function useCachedUrl(url: string | null | undefined): string | null {
  const [cachedUrl, setCachedUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!url) {
      setCachedUrl(null)
      return
    }

    // Web 环境直接返回
    if (!IS_NATIVE) {
      setCachedUrl(url)
      return
    }

    // 先尝试从内存映射获取（同步，无闪烁）
    const instant = resolveMediaUrl(url)
    if (instant !== url) {
      setCachedUrl(instant)
      return
    }

    // 未缓存，先显示原始 URL，后台下载
    setCachedUrl(url)
    cacheMedia(url).then((localUrl) => {
      if (localUrl !== url) {
        setCachedUrl(localUrl)
      }
    })
  }, [url])

  return cachedUrl
}

/**
 * 批量预缓存媒体（游戏开始前调用）
 */
export function usePrefetchMedia() {
  return async (urls: string[]) => {
    if (!IS_NATIVE) return
    const { prefetchMedia } = await import('../utils/mediaCache')
    await prefetchMedia(urls)
  }
}

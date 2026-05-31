/**
 * COS 资源本地缓存层
 *
 * - Tauri: 通过 Rust 命令下载文件到本地目录
 * - Capacitor: 通过 @capacitor/filesystem 存储到 app data
 * - Web: 不缓存，直接返回原始 URL
 */

import { IS_NATIVE, API_BASE } from '../config'

// 缓存 URL → 本地路径的映射（内存 + localStorage 持久化）
const CACHE_STORE_KEY = 'karuta_media_cache'
const cacheMap: Map<string, string> = new Map()
let initialized = false

function initCacheMap() {
  if (initialized) return
  initialized = true
  try {
    const raw = localStorage.getItem(CACHE_STORE_KEY)
    if (raw) {
      const obj = JSON.parse(raw)
      for (const [k, v] of Object.entries(obj)) {
        cacheMap.set(k, v as string)
      }
    }
  } catch {
    // ignore
  }
}

function persistCacheMap() {
  try {
    const obj: Record<string, string> = {}
    cacheMap.forEach((v, k) => { obj[k] = v })
    localStorage.setItem(CACHE_STORE_KEY, JSON.stringify(obj))
  } catch {
    // ignore
  }
}

/** 从 URL 中提取缓存 key，如 "/uploads/covers/abc.jpg" → "covers/abc.jpg" */
function urlToKey(url: string): string | null {
  const prefix = '/uploads/'
  const idx = url.indexOf(prefix)
  if (idx !== -1) {
    return url.substring(idx + prefix.length)
  }
  // 已经是绝对 URL 的情况
  try {
    const u = new URL(url, 'http://placeholder')
    const idx2 = u.pathname.indexOf(prefix)
    if (idx2 !== -1) {
      return u.pathname.substring(idx2 + prefix.length)
    }
  } catch {
    // ignore
  }
  return null
}

/** 判断是否为音频文件 */
function isAudio(key: string): boolean {
  return /\.(mp3|wav|m4a|flac|ogg|aac)$/i.test(key)
}

// ========== Tauri 平台 ==========

let isTauri = false
try {
  isTauri = !!(window as any).__TAURI_INTERNALS__
} catch {
  isTauri = false
}

async function tauriCacheDownload(url: string, key: string): Promise<string | null> {
  if (!isTauri) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const fullUrl = url.startsWith('http') ? url : `${API_BASE.replace('/api', '')}${url}`
    const localPath: string = await invoke('cache_download', { url: fullUrl, key })
    return localPath
  } catch (e) {
    console.warn('[mediaCache] tauri download failed:', e)
    return null
  }
}

async function tauriCacheHas(key: string): Promise<boolean> {
  if (!isTauri) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke('cache_has', { key })
  } catch {
    return false
  }
}

async function tauriCacheGetPath(key: string): Promise<string | null> {
  if (!isTauri) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke('cache_get_path', { key })
  } catch {
    return null
  }
}

// ========== Capacitor 平台 ==========

let isCapacitor = false
try {
  isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.()
} catch {
  isCapacitor = false
}

async function capacitorCacheDownload(url: string, key: string): Promise<string | null> {
  if (!isCapacitor) return null
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const fullUrl = url.startsWith('http') ? url : `${API_BASE.replace('/api', '')}${url}`

    // 下载文件为 base64
    const response = await fetch(fullUrl)
    const blob = await response.blob()

    // 转 base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // 去掉 data:xxx;base64, 前缀
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

    // 写入文件系统
    await Filesystem.writeFile({
      path: `media_cache/${key}`,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    })

    // 返回 base64 data URL 供 <img> 使用
    const mime = isAudio(key) ? 'audio/mpeg' : 'image/jpeg'
    return `data:${mime};base64,${base64}`
  } catch (e) {
    console.warn('[mediaCache] capacitor download failed:', e)
    return null
  }
}

async function capacitorCacheHas(key: string): Promise<boolean> {
  if (!isCapacitor) return false
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    await Filesystem.stat({
      path: `media_cache/${key}`,
      directory: Directory.Data,
    })
    return true
  } catch {
    return false
  }
}

async function capacitorCacheRead(key: string): Promise<string | null> {
  if (!isCapacitor) return null
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const result = await Filesystem.readFile({
      path: `media_cache/${key}`,
      directory: Directory.Data,
    })
    const mime = isAudio(key) ? 'audio/mpeg' : 'image/jpeg'
    return `data:${mime};base64,${result.data}`
  } catch {
    return null
  }
}

// ========== 统一 API ==========

/**
 * 解析媒体 URL，优先使用本地缓存
 * @param url 原始 URL（如 "/uploads/covers/abc.jpg"）
 * @returns 本地缓存 URL 或原始 URL
 */
export function resolveMediaUrl(url: string): string {
  if (!IS_NATIVE || !url) return url
  initCacheMap()
  return cacheMap.get(url) || url
}

/**
 * 下载并缓存媒体文件，返回本地 URL
 * @param url 原始 URL
 * @returns 本地缓存 URL
 */
export async function cacheMedia(url: string): Promise<string> {
  if (!IS_NATIVE || !url) return url
  initCacheMap()

  // 内存缓存命中
  const cached = cacheMap.get(url)
  if (cached) return cached

  const key = urlToKey(url)
  if (!key) return url

  // 检查本地文件是否存在
  let localUrl: string | null = null

  if (isTauri) {
    // Tauri: 先检查文件是否存在
    const has = await tauriCacheHas(key)
    if (has) {
      const path = await tauriCacheGetPath(key)
      if (path) {
        // 使用 convertFileSrc 将本地路径转为可加载的 URL
        const { convertFileSrc } = await import('@tauri-apps/api/core')
        localUrl = convertFileSrc(path)
      }
    } else {
      // 下载
      const path = await tauriCacheDownload(url, key)
      if (path) {
        const { convertFileSrc } = await import('@tauri-apps/api/core')
        localUrl = convertFileSrc(path)
      }
    }
  } else if (isCapacitor) {
    // Capacitor: 检查文件是否存在
    const has = await capacitorCacheHas(key)
    if (has) {
      localUrl = await capacitorCacheRead(key)
    } else {
      localUrl = await capacitorCacheDownload(url, key)
    }
  }

  if (localUrl) {
    cacheMap.set(url, localUrl)
    persistCacheMap()
    return localUrl
  }

  return url
}

/**
 * 批量预缓存媒体文件
 * @param urls 要缓存的 URL 列表
 * @param onProgress 进度回调
 */
export async function prefetchMedia(
  urls: string[],
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (!IS_NATIVE) return
  const total = urls.length
  let current = 0

  // 串行下载，避免并发过多
  for (const url of urls) {
    await cacheMedia(url)
    current++
    onProgress?.(current, total)
  }
}

/**
 * 获取缓存目录信息（仅 Tauri）
 */
export async function getCacheInfo(): Promise<{ dir: string; fileCount: number; totalSize: number } | null> {
  if (!isTauri) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const info: any = await invoke('cache_info')
    return { dir: info.dir, fileCount: info.file_count, totalSize: info.total_size }
  } catch {
    return null
  }
}

/**
 * 设置缓存目录（仅 Tauri）
 */
export async function setCacheDir(dir: string): Promise<boolean> {
  if (!isTauri) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_cache_dir', { dir })
    // 清空内存缓存映射，因为路径变了
    cacheMap.clear()
    persistCacheMap()
    return true
  } catch {
    return false
  }
}

/**
 * 清空缓存
 */
export async function clearCache(): Promise<boolean> {
  if (!isTauri) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('cache_clear')
    cacheMap.clear()
    persistCacheMap()
    return true
  } catch {
    return false
  }
}

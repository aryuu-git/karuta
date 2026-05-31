import { useCachedUrl } from '../hooks/useCachedUrl'
import type { ImgHTMLAttributes } from 'react'

/**
 * 自动使用本地缓存的图片组件
 * 用法与 <img> 完全一致，自动处理 COS 资源缓存
 */
export function CachedImg({ src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const cachedSrc = useCachedUrl(src || null)
  return <img src={cachedSrc || undefined} {...props} />
}

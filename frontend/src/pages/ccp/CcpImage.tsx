import { useState } from 'react'

interface CcpImageProps {
  src: string
  className?: string
  alt?: string
}

/**
 * 带占位背景和加载失败兜底的图片组件，避免裸 <img> 的闪烁和破图。
 */
export function CcpImage({ src, className = '', alt = '' }: CcpImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)

  if (errored) {
    return (
      <div className={`${className} flex items-center justify-center bg-white/[0.03] text-muted/20 text-xs`}>
        🖼️
      </div>
    )
  }

  return (
    <div className={`${className} relative overflow-hidden bg-white/[0.03]`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}

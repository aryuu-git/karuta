import { Loader2 } from 'lucide-react'

/**
 * 全局唯一加载态。size 单位为像素直径。
 */
export function Spinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <Loader2
      size={size}
      className={`animate-spin text-gold ${className}`}
      role="status"
      aria-label="加载中"
    />
  )
}

/** 页面级加载占位：垂直居中 + 书卷气文案 */
export function PageSpinner({ text = '正在加载…' }: { text?: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
      <Spinner size={32} />
      <p className="text-muted text-caption font-serif">{text}</p>
    </div>
  )
}

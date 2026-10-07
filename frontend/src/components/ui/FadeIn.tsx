import type { CSSProperties, ReactNode } from 'react'

/**
 * 入场原语（设计系统 §1.5）：CSS keyframes 驱动的淡入上移。
 * 时间轴走墙钟而非 rAF——后台标签页/低帧率下动画也会走完，
 * 不会像 framer-motion 那样卡在 opacity:0 初始态（2026-09-30 实测回归）。
 * 业务层入场一律用本组件；禁止手写 motion 初始态（design:lint R12）。
 */
export interface FadeInProps {
  children: ReactNode
  /** 入场延迟（毫秒），用于错峰 */
  delay?: number
  /** 上移起点（像素），默认 16 */
  y?: number
  className?: string
  style?: CSSProperties
}

export function FadeIn({ children, delay = 0, y = 16, className = '', style }: FadeInProps) {
  return (
    <div
      className={`fade-in ${className}`}
      style={{ animationDelay: `${delay}ms`, '--fade-y': `${y}px`, ...style } as CSSProperties}
    >
      {children}
    </div>
  )
}

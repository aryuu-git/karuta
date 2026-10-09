import { type ReactNode } from 'react'

/**
 * 统一吸底批量操作条：收编 CardLibrary / DeckDetail 两处手写批量条。
 * 内容按钮用 Button/IconButton 组合，禁止再自绘小按钮。
 */
export interface ActionBarProps {
  children: ReactNode
  className?: string
}

export function ActionBar({ children, className = '' }: ActionBarProps) {
  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-float flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl border border-gold/30 bg-ink-deep/95 backdrop-blur ${className}`}>
      {children}
    </div>
  )
}

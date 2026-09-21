import type { ReactNode } from 'react'

/**
 * 统一面板容器：和纸卡片底 + 描金顶线（仪式感瞬间限定于页首/标题面板）。
 * 替代散落的手写渐变容器。
 */
export interface PanelProps {
  title?: ReactNode
  /** 标题右侧操作区（按钮等） */
  actions?: ReactNode
  /** 是否展示描金顶线（默认标题面板展示） */
  accent?: boolean
  /** 内边距档位 */
  padding?: 'none' | 'sm' | 'md'
  className?: string
  children: ReactNode
}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
}

export function Panel({ title, actions, accent = !!title, padding = 'md', className = '', children }: PanelProps) {
  return (
    <section className={`relative overflow-hidden rounded-xl card-surface ${className}`}>
      {accent && (
        <div
          className="absolute top-0 left-0 w-full h-0.5 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgb(var(--gold-foil)/ 0.4), rgb(var(--accent-primary)/ 0.4), transparent)',
          }}
        />
      )}
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border/40">
          <h2 className="font-serif text-title text-gold">{title}</h2>
          {actions}
        </header>
      )}
      <div className={paddingClasses[padding]}>{children}</div>
    </section>
  )
}

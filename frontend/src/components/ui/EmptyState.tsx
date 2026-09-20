import type { ReactNode } from 'react'

/**
 * 统一空状态：品牌 emoji 插画（emoji 允许出现的场景之一）+ 标题 + 行动按钮。
 */
export interface EmptyStateProps {
  /** 装饰 emoji（庆祝/空状态/品牌瞬间允许使用） */
  icon?: string
  title: ReactNode
  description?: ReactNode
  /** 行动区（通常一个 Button） */
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon = '🌸', title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-14 px-6 ${className}`}>
      <div className="text-5xl mb-4 opacity-80 animate-float" aria-hidden="true">
        {icon}
      </div>
      <h3 className="font-serif text-title text-gold mb-2">{title}</h3>
      {description && <p className="text-muted text-body max-w-sm mb-5">{description}</p>}
      {action}
    </div>
  )
}

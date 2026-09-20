import type { ReactNode } from 'react'
import { Flower2 } from 'lucide-react'

/**
 * 统一空状态：语义图标（lucide，功能处不使用 emoji）+ 标题 + 行动按钮。
 */
export interface EmptyStateProps {
  /** 语义图标（lucide 节点，默认 Flower2） */
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** 行动区（通常一个 Button） */
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon = <Flower2 size={44} strokeWidth={1.5} />, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-14 px-6 ${className}`}>
      <div className="text-gold/60 mb-4 opacity-80 animate-float" aria-hidden="true">
        {icon}
      </div>
      <h3 className="font-serif text-title text-gold mb-2">{title}</h3>
      {description && <p className="text-muted text-body max-w-sm mb-5">{description}</p>}
      {action}
    </div>
  )
}

import type { ReactNode } from 'react'

/**
 * 统一空状态：品牌 emoji 插画（emoji 允许出现的场景之一）+ 「还没有 XX」标题
 * + 一句副文案 + 单个行动 CTA。
 * 块高收敛到 ~200px（min-h-[200px]，节奏铁律 §1.3：内容定高不撑满）；
 * my-auto 在 flex 容器里自动吃掉剩余空间垂直居中，让高面板/矮面板的空态观感对称。
 */
export interface EmptyStateProps {
  /** 装饰 emoji（庆祝/空状态/品牌瞬间允许使用） */
  icon?: string
  /** 标题（文案约定「还没有 XX」） */
  title: ReactNode
  /** 一句副文案 */
  description?: ReactNode
  /** 行动区（单个 CTA，通常一个 Button） */
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon = '🌸', title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-8 min-h-[200px] my-auto ${className}`}>
      <div className="text-5xl mb-3 opacity-80 animate-float" aria-hidden="true">
        {icon}
      </div>
      <h3 className="font-serif text-title text-gold mb-1.5">{title}</h3>
      {description && <p className="text-muted text-body max-w-sm mb-4">{description}</p>}
      {action}
    </div>
  )
}

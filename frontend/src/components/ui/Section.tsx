import { type ReactNode } from 'react'

/**
 * 内容区块：统一区块标题行（图标 + 标题 + 右侧动作链接）。
 * 收敛自各列表页手写的 h2 + 「全部 →」链接行（重构 R4）。
 */
export interface SectionProps {
  icon?: ReactNode
  title: ReactNode
  /** 右侧动作区（通常是 ghost 按钮或文字链接） */
  action?: ReactNode
  className?: string
  children: ReactNode
}

export function Section({ icon, title, action, className = '', children }: SectionProps) {
  return (
    <section className={`mb-6 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-sm text-gold/80 flex items-center gap-1.5">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

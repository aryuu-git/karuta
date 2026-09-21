import type { ReactNode } from 'react'

/**
 * 纹样分隔（新组件类）：金粉菱形 + 发丝线的和风装饰。
 * - 默认横向满幅：两侧发丝线向中心渐隐，中央金粉菱形；
 * - `compact` 模式用于标题行内点缀（仅菱形，无线条）。
 */
export function Ornament({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  if (compact) {
    return <span aria-hidden="true" className={`inline-block w-1.5 h-1.5 rotate-45 bg-gold-foil/70 shadow-foil ${className}`} />
  }
  return (
    <div className={`flex items-center gap-3 ${className}`} aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-l from-gold-foil/40 to-transparent" />
      <span className="w-1.5 h-1.5 rotate-45 bg-gold-foil/70 shadow-foil shrink-0" />
      <span className="h-px flex-1 bg-gradient-to-r from-gold-foil/40 to-transparent" />
    </div>
  )
}

/**
 * 章节标题：金粉菱形点缀 + 发丝线延伸的和风章节头。
 * 左侧 icon 可选（lucide），右侧 actions 插槽放置跳转/操作。
 */
export function SectionTitle({ icon, children, actions, className = '' }: {
  icon?: ReactNode
  children: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-center gap-3 mb-3 ${className}`}>
      <span className="w-1.5 h-1.5 rotate-45 bg-gold-foil/70 shadow-foil shrink-0" aria-hidden="true" />
      <h2 className="font-serif text-sm text-gold/90 flex items-center gap-1.5 whitespace-nowrap">
        {icon}
        {children}
      </h2>
      <span className="h-px flex-1 bg-gradient-to-r from-gold-foil/25 to-transparent" aria-hidden="true" />
      {actions}
    </div>
  )
}

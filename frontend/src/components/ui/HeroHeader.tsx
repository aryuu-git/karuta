import { type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

/**
 * 页面 Hero 头部：渐变底 + 装饰光斑 + 返回按钮 + 图标标题区。
 * 收敛自全项目 21 处复制粘贴的 linear-gradient(135deg…) 头部块（重构 R4）。
 */
export interface HeroHeaderProps {
  /** 标题左侧 lucide 图标节点 */
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** 传入则显示返回按钮（默认文案「撤退」） */
  onBack?: () => void
  backLabel?: string
  /** 右侧操作区 */
  actions?: ReactNode
  /** 头部下方自定义内容（如统计行） */
  children?: ReactNode
}

export function HeroHeader({ icon, title, subtitle, onBack, backLabel = '撤退', actions, children }: HeroHeaderProps) {
  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl p-5"
      style={{ background: 'linear-gradient(135deg, rgb(var(--accent-bg)/ 0.4) 0%, rgb(var(--accent-bg-mid)/ 0.8) 50%, rgb(var(--accent-bg-end)/ 0.4) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.15)' }}>
      {/* 装饰光斑 */}
      <div className="absolute top-0 right-0 w-24 h-24 opacity-10 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(var(--glow-color)/ 0.8), transparent 70%)' }} aria-hidden="true" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          {onBack && (
            <button onClick={onBack}
              className="text-gold/50 hover:text-gold transition-all duration-200 text-sm hover:scale-110 flex items-center gap-1 mb-2">
              <ArrowLeft size={14} />
              {backLabel}
            </button>
          )}
          <h1 className="font-serif text-title-xl text-gold font-bold tracking-wide flex items-center gap-2">
            {icon}
            {title}
          </h1>
          {subtitle && <p className="text-muted/60 text-caption font-serif italic mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>

      {children && <div className="relative mt-4">{children}</div>}
    </div>
  )
}

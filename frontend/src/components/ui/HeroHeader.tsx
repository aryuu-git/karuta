import { type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

/**
 * 页面 Hero 头部：渐变底 + 返回按钮 + 图标标题区 + 右侧操作区。
 * 收敛自全项目 21 处复制粘贴的 linear-gradient(135deg…) 头部块（重构 R4）。
 * 底纹走 panel-hero token；标题为标题层（gold-light），焦点金只给交互元素。
 * 布局契约（§1.3）：标题居左，actions 插槽贴内容列右缘、与标题同一行。
 */
export interface HeroHeaderProps {
  /** 标题左侧 lucide 图标节点 */
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** 传入则显示返回按钮（默认文案「撤退」） */
  onBack?: () => void
  backLabel?: string
  /** 右侧操作区（贴内容列右缘，与标题同一行） */
  actions?: ReactNode
  /** 头部下方自定义内容（如统计行） */
  children?: ReactNode
  /** compact 档：列表页首（min-h-hero ≈ 120px + 紧凑边距）；默认档保持原样向后兼容 */
  compact?: boolean
}

export function HeroHeader({ icon, title, subtitle, onBack, backLabel = '撤退', actions, children, compact = false }: HeroHeaderProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-panel-hero border border-accent/15 ${compact ? 'min-h-hero px-5 py-4 mb-6 flex flex-col justify-center' : 'p-5 mb-8'}`}>
      <div className={`relative flex flex-wrap justify-between gap-x-4 gap-y-2 ${compact ? 'items-center' : 'items-start'}`}>
        <div className="min-w-0">
          {onBack && (
            <button onClick={onBack}
              className="text-gold/70 hover:text-gold transition-all duration-200 text-sm hover:scale-110 flex items-center gap-1 mb-2">
              <ArrowLeft size={16} />
              {backLabel}
            </button>
          )}
          {/* 图标独立列 + 标题/副标题信息列（2026-09-30）：副标题左缘对齐标题，
              不再吊在图标下方（旧 h1 内联图标使副标题锚到图标左缘） */}
          <div className="flex items-center gap-3">
            {icon && <div className="shrink-0">{icon}</div>}
            <div className="min-w-0">
              <h1 className="font-serif text-title-xl text-gold-light font-bold tracking-wide">{title}</h1>
              {subtitle && <p className="text-muted/70 text-caption mt-1">{subtitle}</p>}
            </div>
          </div>
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>

      {children && <div className="relative mt-4">{children}</div>}
    </div>
  )
}

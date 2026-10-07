import { type HTMLAttributes, type ReactNode } from 'react'

/**
 * 统一深景面板容器：渐变底 + 描金细边 + 可选标题头（吸收已退役 Panel 的 title/actions 能力）。
 * 收敛全站散落的 inline 渐变模板与手写面板头。底纹取自 tailwind.config.js 的
 * panel-* / ink-deep token，禁止再写 inline 渐变。
 */
export type PanelSurfaceVariant = 'ink' | 'abyss' | 'void' | 'void-soft' | 'ink-deep'

export interface PanelSurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 底纹档位：ink=墨色竖向（卡片/面板）；abyss=深景斜向（表单区块）；void/void-soft=深景柔光（统计/空态）；ink-deep=浮层面板 */
  variant?: PanelSurfaceVariant
  /** 圆角档位 */
  radius?: 'lg' | 'xl' | '2xl'
  /** 虚线描边（空态容器） */
  dashed?: boolean
  /** 交互态：hover 描金亮起（抬升/缩放按场景由调用方追加） */
  interactive?: boolean
  /** 标题头（传入则渲染统一头部行 + 描金顶线） */
  title?: ReactNode
  /** 标题右侧操作区 */
  actions?: ReactNode
  children: ReactNode
}

const variantClasses: Record<PanelSurfaceVariant, string> = {
  ink: 'bg-panel-ink',
  abyss: 'bg-panel-abyss',
  void: 'bg-panel-void',
  'void-soft': 'bg-panel-void-soft',
  'ink-deep': 'bg-ink-deep/95 backdrop-blur',
}

/** 浮层档描金更亮一档，其余统一 accent/[0.12] */
const variantBorderClasses: Record<PanelSurfaceVariant, string> = {
  ink: 'border-accent/[0.12]',
  abyss: 'border-accent/[0.12]',
  void: 'border-accent/[0.12]',
  'void-soft': 'border-accent/[0.12]',
  'ink-deep': 'border-gold/30',
}

const radiusClasses: Record<'lg' | 'xl' | '2xl', string> = {
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
}

export function PanelSurface({
  variant = 'ink',
  radius = 'xl',
  dashed = false,
  interactive = false,
  title,
  actions,
  className = '',
  children,
  ...rest
}: PanelSurfaceProps) {
  return (
    <div
      className={[
        'relative overflow-hidden border',
        variantClasses[variant],
        radiusClasses[radius],
        dashed ? 'border-dashed border-accent/20' : variantBorderClasses[variant],
        interactive ? 'transition-all hover:border-accent/30' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {title && (
        <div className="absolute top-0 left-0 w-full h-0.5 pointer-events-none bg-accent-line" />
      )}
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gold/10">
          <h2 className="font-serif text-title text-gold-light">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </div>
  )
}

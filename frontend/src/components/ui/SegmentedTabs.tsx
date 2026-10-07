import { type ReactNode } from 'react'

/**
 * 统一分段选择器：收敛全站三套手写页签（独立胶囊 pill / 容器分段 bar / 选项片 chip）。
 * 选中态恒为焦点金，未选中态低对比——焦点 > 标题 > 数据 的层级约定见 design-system §1.2。
 */
export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
}

export interface SegmentedTabsProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  /** pill=独立胶囊页签；bar=容器内分段器；chip=带边框选项片 */
  variant?: 'pill' | 'bar' | 'chip'
  /** sm=筛选条/内联紧凑档；md=默认 */
  size?: 'sm' | 'md'
  'aria-label'?: string
  className?: string
}

const wrapClasses: Record<'pill' | 'bar' | 'chip', string> = {
  pill: 'flex items-center gap-1',
  bar: 'inline-flex items-center gap-0.5 bg-white/5 rounded-lg p-1',
  chip: 'flex flex-wrap gap-1.5',
}

const itemClasses: Record<'pill' | 'bar' | 'chip', string> = {
  pill: 'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all cursor-pointer',
  bar: 'inline-flex items-center justify-center gap-1.5 rounded-lg transition-all cursor-pointer',
  chip: 'inline-flex items-center justify-center gap-1 rounded-lg border transition-all cursor-pointer',
}

const sizeClasses: Record<'pill' | 'bar' | 'chip', Record<'sm' | 'md', string>> = {
  pill: { sm: 'px-3 py-1.5 text-tiny', md: 'px-5 py-2 text-caption' },
  bar: { sm: 'px-3 py-1 text-tiny', md: 'px-4 py-1.5 text-caption' },
  chip: { sm: 'px-2 py-1 text-tiny', md: 'px-3 py-1.5 text-caption' },
}

/** 选中态：焦点金渐变（pill/chip）或金底（bar）；未选中态：低对比 + hover 提亮 */
function selectedClasses(variant: 'pill' | 'bar' | 'chip'): string {
  return variant === 'bar'
    ? 'bg-gold/20 text-gold'
    : variant === 'chip'
      ? 'bg-gradient-to-r from-gold/25 to-gold-dark/15 text-gold border-gold/40'
      : 'bg-gradient-to-r from-gold/20 to-gold-dark/10 text-gold shadow-sm'
}

function unselectedClasses(variant: 'pill' | 'bar' | 'chip'): string {
  return variant === 'chip'
    ? 'bg-white/5 text-white/40 border-white/5 hover:border-gold/20 hover:text-gold/70'
    : 'text-muted hover:text-white/70'
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  variant = 'bar',
  size = 'md',
  'aria-label': ariaLabel,
  className = '',
}: SegmentedTabsProps<T>) {
  return (
    <div className={`${wrapClasses[variant]} ${className}`} role="tablist" aria-label={ariaLabel}>
      {options.map(opt => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={[
              itemClasses[variant],
              sizeClasses[variant][size],
              selected ? selectedClasses(variant) : unselectedClasses(variant),
            ].join(' ')}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

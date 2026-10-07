import { type MouseEvent, type ReactNode } from 'react'
import { Checkbox } from './Checkbox'
import { Radio } from './Radio'

/**
 * 统一选项卡片：收编建房页模式/难度/多音频选择卡、音频选项卡、克隆方式卡。
 * 选中描金高亮、未选中悬停提示；selection 控制指示器形态（radio/checkbox/无）。
 */
export type OptionCardSelection = 'radio' | 'checkbox' | 'none'

export interface OptionCardProps {
  selected: boolean
  onSelect: () => void
  /** 指示器形态，默认 none（纯描金高亮） */
  selection?: OptionCardSelection
  /** 指示器是否允许取消（checkbox 场景） */
  allowReselect?: boolean
  icon?: ReactNode
  title: ReactNode
  desc?: ReactNode
  /** 标题旁角标（如「内测」） */
  badge?: ReactNode
  /** row=横排（图标左 + 文案右）；column=纵排（图标上 + 文案下） */
  layout?: 'row' | 'column'
  /** 标题下方自定义内容（进度条等） */
  children?: ReactNode
  disabled?: boolean
  className?: string
}

export function OptionCard({
  selected,
  onSelect,
  selection = 'none',
  allowReselect = false,
  icon,
  title,
  desc,
  badge,
  layout = 'row',
  children,
  disabled = false,
  className = '',
}: OptionCardProps) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (disabled) return
    if (selected && !allowReselect && selection !== 'checkbox') return
    onSelect()
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={handleClick}
      className={[
        'rounded-lg border transition-all text-left',
        layout === 'row' ? 'flex items-center gap-3 px-4 py-3' : 'flex flex-col items-center gap-1.5 px-3 py-3',
        selected ? 'border-gold bg-gold/10 text-white' : 'border-border hover:border-gold/40 text-white/70 hover:text-white',
        disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer',
        className,
      ].filter(Boolean).join(' ')}
    >
      {selection !== 'none' && (
        selection === 'radio'
          ? <Radio checked={selected} aria-hidden="true" />
          : <Checkbox checked={selected} aria-hidden="true" />
      )}
      {icon}
      <span className={layout === 'row' ? 'flex-1 min-w-0' : 'flex flex-col items-center gap-0.5'}>
        <span className="text-caption font-medium flex items-center gap-1.5">
          {title}
          {badge}
        </span>
        {desc && <span className="text-tiny text-muted">{desc}</span>}
        {children}
      </span>
    </button>
  )
}

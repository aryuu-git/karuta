import { Check, Minus } from 'lucide-react'

/**
 * 统一复选框：收编 CardTile 选中框等手写勾选控件。
 * 默认展示态（点击行为由外层承担）；传 onChange 时自身可点击。
 */
export interface CheckboxProps {
  checked: boolean
  /** 半选态（批量场景的「部分选中」） */
  indeterminate?: boolean
  onChange?: (checked: boolean) => void
  size?: 'sm' | 'md'
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

export function Checkbox({ checked, indeterminate = false, onChange, size = 'md', disabled = false, 'aria-label': ariaLabel, className = '' }: CheckboxProps) {
  const box = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  const visual = [
    'rounded-lg border flex items-center justify-center transition-all shrink-0',
    box,
    checked || indeterminate
      ? 'bg-gold border-gold text-ink-deep'
      : 'bg-black/40 border-white/40 hover:border-gold/70',
    disabled ? 'opacity-40 pointer-events-none' : onChange ? 'cursor-pointer' : '',
    className,
  ].filter(Boolean).join(' ')

  const mark = indeterminate
    ? <Minus size={size === 'sm' ? 11 : 13} />
    : checked ? <Check size={size === 'sm' ? 11 : 13} /> : null

  if (onChange) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={e => { e.stopPropagation(); onChange(!checked) }}
        className={visual}
      >
        {mark}
      </button>
    )
  }
  return (
    <span role="checkbox" aria-checked={indeterminate ? 'mixed' : checked} aria-label={ariaLabel} className={visual}>
      {mark}
    </span>
  )
}

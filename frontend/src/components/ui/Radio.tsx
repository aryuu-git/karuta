/**
 * 统一单选指示点：OptionCard 的 selection="radio" 指示器，也可独立使用。
 * 纯展示（点击行为由外层承担）。
 */
export interface RadioProps {
  checked: boolean
  size?: 'sm' | 'md'
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

export function Radio({ checked, size = 'md', disabled = false, 'aria-label': ariaLabel, className = '' }: RadioProps) {
  const dot = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  return (
    <span
      role="radio"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={[
        'rounded-full border-2 flex items-center justify-center transition-all shrink-0',
        dot,
        checked ? 'border-gold' : 'border-white/40',
        disabled ? 'opacity-40' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {checked && <span className="w-1.5 h-1.5 rounded-full bg-gold" />}
    </span>
  )
}

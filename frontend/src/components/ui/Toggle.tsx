import { type MouseEvent } from 'react'

/**
 * 统一拨杆开关：收敛 NewRoomPage 手写 ToggleTrack（含手算滑钮位移）。
 * 布局用 flex 主轴对齐切换，无绝对定位魔法值；色调只走 token（warning 替代历史 orange）。
 * 默认展示态（点击行为由外层行承担）；传 onChange 时自身可点击。
 */
export type ToggleTone = 'gold' | 'crimson' | 'warning'

export interface ToggleProps {
  checked: boolean
  /** 传入则开关自身可点击切换 */
  onChange?: (checked: boolean) => void
  tone?: ToggleTone
  size?: 'sm' | 'lg'
  disabled?: boolean
  'aria-label'?: string
}

const toneClasses: Record<ToggleTone, { track: string; knob: string }> = {
  gold: { track: 'bg-gold/50', knob: 'bg-gold' },
  crimson: { track: 'bg-crimson/50', knob: 'bg-crimson' },
  warning: { track: 'bg-warning/50', knob: 'bg-warning' },
}

export function Toggle({ checked, onChange, tone = 'gold', size = 'sm', disabled = false, 'aria-label': ariaLabel }: ToggleProps) {
  const toneCls = toneClasses[tone]
  const isLg = size === 'lg'

  const trackClass = [
    'flex items-center rounded-full p-0.5 shrink-0 transition-colors duration-200',
    isLg ? 'w-9 h-5' : 'w-8 h-4',
    checked ? `${toneCls.track} justify-end` : 'bg-white/10 justify-start',
  ].join(' ')

  const knobClass = [
    'rounded-full transition-colors duration-200',
    isLg ? 'w-4 h-4' : 'w-3 h-3',
    checked ? toneCls.knob : 'bg-white/30',
  ].join(' ')

  if (onChange) {
    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      if (!disabled) onChange(!checked)
    }
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={handleClick}
        className={`${trackClass} ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
      >
        <span className={knobClass} />
      </button>
    )
  }

  return (
    <span role="switch" aria-checked={checked} aria-label={ariaLabel} className={trackClass}>
      <span className={knobClass} />
    </span>
  )
}

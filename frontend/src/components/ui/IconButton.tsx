import { type MouseEvent, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

/**
 * 统一图标按钮：收编全站手写圆形/圆角小按钮（播放、关闭、排序、批量条）。
 * 交互语言绑定 press（微缩放反馈）。
 */
export type IconButtonTone = 'gold' | 'neutral' | 'danger'

export interface IconButtonProps {
  icon: ReactNode
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  tone?: IconButtonTone
  shape?: 'circle' | 'rounded'
  size?: 'sm' | 'md'
  disabled?: boolean
  loading?: boolean
  'aria-label': string
  className?: string
}

const toneClasses: Record<IconButtonTone, string> = {
  gold: 'bg-gold/90 text-ink-deep hover:bg-gold',
  neutral: 'bg-black/55 text-white hover:bg-black/75',
  danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
}

export function IconButton({
  icon,
  onClick,
  tone = 'neutral',
  shape = 'circle',
  size = 'sm',
  disabled = false,
  loading = false,
  'aria-label': ariaLabel,
  className = '',
}: IconButtonProps) {
  const isDisabled = disabled || loading
  const geometry = shape === 'circle'
    ? (size === 'sm' ? 'w-7 h-7' : 'w-9 h-9')
    : (size === 'sm' ? 'h-7 px-2 rounded-lg' : 'h-8 px-2.5 rounded-lg')

  const classes = [
    'inline-flex items-center justify-center shrink-0 transition-all hover:scale-105 active:scale-95',
    shape === 'circle' ? 'rounded-full' : '',
    isDisabled ? 'opacity-30 pointer-events-none' : 'cursor-pointer',
    toneClasses[tone],
    geometry,
    className,
  ].filter(Boolean).join(' ')
  const content = loading ? <Loader2 size={size === 'sm' ? 13 : 16} className="animate-spin" /> : icon

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={isDisabled}
      onClick={onClick}
      className={classes}
    >
      {content}
    </button>
  )
}

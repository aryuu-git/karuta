import { type MouseEvent } from 'react'

/**
 * 统一遮罩：收编全站自绘 fixed inset-0 遮罩（7 种底色方言归三档）。
 * modal=模态（深墨+模糊）；overlay=覆盖（半透明黑）；hint=提示性（更浅，不吃点击）。
 */
export type ScrimTone = 'modal' | 'overlay' | 'hint'

export interface ScrimProps {
  tone?: ScrimTone
  onClick?: () => void
  className?: string
}

const toneClasses: Record<ScrimTone, string> = {
  modal: 'z-modal bg-ink-deep/70 backdrop-blur-sm',
  overlay: 'z-overlay bg-black/50',
  hint: 'z-overlay bg-black/30 pointer-events-none',
}

export function Scrim({ tone = 'modal', onClick, className = '' }: ScrimProps) {
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    onClick?.()
  }
  return (
    <div
      aria-hidden="true"
      onClick={onClick ? handleClick : undefined}
      className={`fixed inset-0 ${toneClasses[tone]} ${className}`}
    />
  )
}

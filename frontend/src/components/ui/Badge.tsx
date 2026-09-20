import type { ReactNode } from 'react'

/**
 * 统一徽章：计数、状态、标签。
 * tone 语义：gold=强调；crimson=对抗/警示；success/warning/info=状态；muted=中性。
 */
export type BadgeTone = 'gold' | 'crimson' | 'success' | 'warning' | 'info' | 'muted'

const toneClasses: Record<BadgeTone, string> = {
  gold: 'bg-gold/15 text-gold border-gold/30',
  crimson: 'bg-crimson/10 text-crimson border-crimson/30',
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  info: 'bg-info/10 text-info border-info/30',
  muted: 'bg-white/5 text-muted border-white/10',
}

export function Badge({
  tone = 'muted',
  className = '',
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-tiny font-medium leading-none ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

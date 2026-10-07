/**
 * 统一进度条：收编 ReadingPanel / WaitingLobby / AudioUploadOptions 三处手写进度条。
 * tone 走语义 token；shimmer 为加载光扫（复用 progress-sweep 动画）。
 */
export type ProgressBarTone = 'gold' | 'success' | 'warning' | 'danger'

export interface ProgressBarProps {
  /** 进度百分比 0–100 */
  value: number
  tone?: ProgressBarTone
  /** 填充段上的光扫效果（读牌进度等仪式时刻） */
  shimmer?: boolean
  className?: string
}

const toneClasses: Record<ProgressBarTone, string> = {
  gold: 'bg-gradient-to-r from-gold-dark to-gold',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export function ProgressBar({ value, tone = 'gold', shimmer = false, className = '' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className={`h-1.5 bg-white/5 rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full relative overflow-hidden transition-all duration-300 ${toneClasses[tone]}`}
        style={{ width: `${Math.max(pct, 2)}%` }}
      >
        {shimmer && (
          <span className="absolute inset-y-0 left-0 w-2/5 bg-white/30 animate-progress-sweep" />
        )}
      </div>
    </div>
  )
}

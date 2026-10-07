import type { LucideIcon } from 'lucide-react'
import { FadeIn } from './FadeIn'
import { PanelSurface } from './PanelSurface'

/**
 * 统计卡：紧凑上下两行——图标+标签一行小字、数值一行大字。
 * 收敛自 ProfilePage / HomePage 两处复制实现；色彩只走 tone token，
 * 数值恒为 body-text（数据层），图标按 tone 点缀（焦点色只给交互/成就瞬间）。
 * 无数据时数值用小圆点「·」占位（不再用大破折号「—」，避免抢数值行视觉重量）。
 */
export type StatCardTone = 'gold' | 'gold-light' | 'foil' | 'success'

export interface StatCardProps {
  icon: LucideIcon
  label: string
  /** 数值；空值（undefined/''/'—'）显示小圆点「·」占位 */
  value?: string | number | null
  /** 数值下补充说明 */
  sub?: string
  /** 图标点缀色 */
  tone?: StatCardTone
  /** 入场动画延迟（秒） */
  delay?: number
  /** 紧凑档：统计横排使用 */
  compact?: boolean
}

const toneClasses: Record<StatCardTone, string> = {
  gold: 'text-gold',
  'gold-light': 'text-gold-light',
  foil: 'text-gold-foil',
  success: 'text-success',
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'gold', delay = 0, compact = false }: StatCardProps) {
  // 空数据占位：小圆点「·」而非大破折号「—」
  const display = value == null || value === '' || value === '—' ? '·' : value

  return (
    // 入场走 FadeIn（设计系统 §1.5）；delay 对外仍是秒，转毫秒进原语
    <FadeIn delay={delay * 1000} y={12} className="h-full">
      <PanelSurface
        variant="void-soft"
        className={`h-full flex flex-col justify-center hover:shadow-lg transition-all ${compact ? 'p-3 gap-1' : 'p-5 gap-1.5'}`}
      >
        {/* 第一行：图标 + 标签小字（次级说明层，深底最低 muted/70） */}
        <div className="flex items-center gap-1.5">
          <Icon size={compact ? 12 : 16} strokeWidth={1.75} className={`shrink-0 ${toneClasses[tone]}`} />
          <span className={`${compact ? 'text-tiny' : 'text-caption'} text-muted/70`}>{label}</span>
        </div>
        {/* 第二行：数值大字（数据层 body-text） */}
        <div>
          <div className={`font-bold tabular-nums font-serif text-body-text ${compact ? 'text-title' : 'text-title-xl'}`}>
            {display}
          </div>
          {sub && <div className="text-tiny text-muted/70 mt-0.5">{sub}</div>}
        </div>
      </PanelSurface>
    </FadeIn>
  )
}

import { type ReactNode } from 'react'

/**
 * 结算成就解锁框：收编 GameOver / DuelGameOver 两处逐字复制的成就展示块。
 * 仪式瞬间视觉原样保留（描金细边 + 成就徽记 chips）。
 */
export interface AchievementItem {
  key: string
  icon: ReactNode
  title: string
}

export interface AchievementUnlockedProps {
  unlocks: AchievementItem[]
  className?: string
}

export function AchievementUnlocked({ unlocks, className = '' }: AchievementUnlockedProps) {
  if (unlocks.length === 0) return null
  return (
    <div className={`rounded-2xl p-4 mt-5 text-center bg-gold/[0.06] border border-gold/30 ${className}`}>
      <p className="text-[10px] tracking-widest text-gold/80 mb-2">本局解锁成就</p>
      <div className="flex flex-wrap justify-center gap-2">
        {unlocks.map(u => (
          <span key={u.key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/20 border border-gold/30 text-xs text-gold">
            <span>{u.icon}</span> {u.title}
          </span>
        ))}
      </div>
    </div>
  )
}

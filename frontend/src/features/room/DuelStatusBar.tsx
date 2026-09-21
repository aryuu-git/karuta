import { motion } from 'framer-motion'
import type { DuelState } from '../../api/types'

interface DuelStatusBarProps {
  duelState: DuelState
  duelRound: number
  duelRoundTimer: number | null
  currentUserId: number
}

/** Duel 轮次/倒计时/双方张数信息条 */
export function DuelStatusBar({ duelState, duelRound, duelRoundTimer, currentUserId }: DuelStatusBarProps) {
  return (
    <div className="flex items-center justify-center gap-4 px-4 py-1.5 bg-ink-deep/80 border-t border-gold/10">
      <span className="text-muted text-tiny">第 {duelRound} 轮</span>
      {duelRoundTimer !== null && (
        <motion.span
          key={duelRoundTimer}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          className={`text-caption font-bold tabular-nums ${duelRoundTimer <= 5 ? 'text-crimson' : 'text-gold/80'}`}
        >
          {duelRoundTimer}s
        </motion.span>
      )}
      <span className="text-muted text-tiny">
        {duelState.player1.id === currentUserId ? duelState.p1_count : duelState.p2_count} 张 vs {duelState.player1.id === currentUserId ? duelState.p2_count : duelState.p1_count} 张
      </span>
    </div>
  )
}

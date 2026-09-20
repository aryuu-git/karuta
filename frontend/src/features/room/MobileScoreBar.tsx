import { motion } from 'framer-motion'
import type { RoomPlayer } from '../../api/types'

interface MobileScoreBarProps {
  players: RoomPlayer[]
  currentUserId: number
  hostId: number
  /** 裁判模式：计分条中隐藏房主（裁判） */
  isJudgeMode: boolean
}

/** 移动端底部计分条（md 以下显示，duel 模式由页面控制不渲染） */
export function MobileScoreBar({ players, currentUserId, hostId, isJudgeMode }: MobileScoreBarProps) {
  return (
    <div className="md:hidden"
      style={{ background: 'rgb(var(--accent-bg-mid)/ 0.9)', borderTop: '1px solid rgb(var(--accent-primary)/ 0.08)' }}>
      <div className="flex overflow-x-auto gap-1 px-3 py-2">
        {[...players]
          .filter(p => !(isJudgeMode && p.user_id === hostId))
          .sort((a, b) => b.score - a.score).map((p, i) => {
          const medals = ['🥇','🥈','🥉']
          const isMe = p.user_id === currentUserId
          return (
            <div key={p.user_id}
              className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg"
              style={{ background: isMe ? 'rgb(var(--accent-primary)/ 0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isMe ? 'rgb(var(--accent-primary)/ 0.2)' : 'rgba(255,255,255,0.04)'}` }}>
              <span className="text-xs">{medals[i] ?? `${i+1}.`}</span>
              <span className={`text-xs ${isMe ? 'text-gold font-medium' : 'text-white/60'} ${!p.online ? 'opacity-40' : ''}`}>
                {p.username}
              </span>
              <motion.span key={`${p.user_id}-${p.score}`}
                initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={{ duration: 0.3 }}
                className="text-xs font-bold tabular-nums"
                style={{ color: isMe ? 'rgb(var(--color-gold))' : 'rgba(255,255,255,0.4)' }}>
                {p.score}
              </motion.span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

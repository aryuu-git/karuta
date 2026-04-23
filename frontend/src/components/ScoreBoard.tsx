import { motion, AnimatePresence } from 'framer-motion'
import type { RoomPlayer } from '../api/types'

interface ScoreBoardProps {
  players: RoomPlayer[]
  currentUserId: number
  remainingCount: number
  totalCount: number
}

const RANK_MEDAL = ['🥇', '🥈', '🥉']
const RANK_GLOW = ['rgba(255,215,0,0.15)', 'rgba(192,192,192,0.1)', 'rgba(205,127,50,0.1)']

export function ScoreBoard({ players, currentUserId, remainingCount, totalCount }: ScoreBoardProps) {
  // 玩家按分数排，旁观者排最后
  const sorted = [...players].sort((a, b) => {
    const aSpec = (a as any).role === 'spectator'
    const bSpec = (b as any).role === 'spectator'
    if (aSpec && !bSpec) return 1
    if (!aSpec && bSpec) return -1
    return b.score - a.score
  })
  const progressPct = totalCount > 0 ? ((totalCount - remainingCount) / totalCount) * 100 : 0

  return (
    <div className="flex flex-col h-full w-52 shrink-0" style={{ background: 'linear-gradient(180deg, rgba(32,8,20,0.98) 0%, rgba(45,10,26,0.95) 100%)', borderLeft: '1px solid rgba(232,164,184,0.1)' }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🏆</span>
          <span className="font-serif text-gold text-sm font-medium tracking-widest">实时战况</span>
        </div>

        {/* 进度环形 */}
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
              <motion.circle cx="18" cy="18" r="15" fill="none"
                stroke="url(#scoreGrad)" strokeWidth="3"
                strokeDasharray="94.2" strokeLinecap="round"
                animate={{ strokeDashoffset: 94.2 * (1 - progressPct / 100) }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{ strokeDashoffset: 94.2 * (1 - progressPct / 100) }} />
              <defs>
                <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#e8a4b8" />
                  <stop offset="100%" stopColor="#f5c6d0" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-gold font-bold text-xs tabular-nums">{remainingCount}</span>
            </div>
          </div>
          <div>
            <p className="text-white/50 text-xs leading-none">剩余牌数</p>
            <p className="text-muted text-xs mt-0.5">{remainingCount} / {totalCount} 张</p>
            {remainingCount <= 5 && remainingCount > 0 && (
              <p className="text-crimson text-[10px] mt-0.5 animate-pulse">最后冲刺！(ﾉ◕ヮ◕)ﾉ</p>
            )}
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        <AnimatePresence>
          {sorted.map((player, idx) => {
            const isMe = player.user_id === currentUserId
            const isSpectator = (player as any).role === 'spectator'
            // 旁观者不占排名序号
            const rankIdx = sorted.slice(0, idx).filter(p => (p as any).role !== 'spectator').length
            const medal = isSpectator ? null : RANK_MEDAL[rankIdx]
            const glow = isSpectator ? undefined : RANK_GLOW[rankIdx]

            return (
              <motion.div key={player.user_id} layout
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: player.online ? 1 : 0.35, x: 0 }}
                transition={{ duration: 0.3, layout: { duration: 0.4, ease: 'easeOut' } }}
                className="relative rounded-lg mb-1.5 overflow-hidden"
                style={{ background: isMe ? 'rgba(232,164,184,0.07)' : glow ?? 'rgba(255,255,255,0.02)', border: `1px solid ${isMe ? 'rgba(232,164,184,0.25)' : 'rgba(255,255,255,0.04)'}` }}>

                {/* 我的高亮条 */}
                {isMe && (
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l"
                    style={{ background: 'linear-gradient(180deg, #e8a4b8, #f5c6d0)' }} />
                )}

                <div className="flex items-center gap-2 px-3 py-2.5">
                  {/* 奖牌/排名/旁观图标 */}
                  <span className="text-sm w-5 text-center shrink-0">
                    {isSpectator ? '👁' : (medal ?? <span className="text-white/30 text-xs font-mono">{rankIdx + 1}</span>)}
                  </span>

                  {/* 用户名 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`text-xs font-sans truncate ${isMe ? 'text-gold font-semibold' : isSpectator ? 'text-white/40' : 'text-white/75'} ${!player.online ? 'line-through' : ''}`}>
                        {player.username}
                      </span>
                      {isMe && <span className="text-[10px] shrink-0">⭐</span>}
                      {isSpectator && <span className="text-[10px] shrink-0" style={{ color: 'rgba(128,90,213,0.7)' }}>旁观中</span>}
                      {!player.online && !isSpectator && <span className="text-muted text-[10px] shrink-0">💤离线</span>}
                    </div>
                  </div>

                  {/* 分数 / 旁观者不显分数 */}
                  {isSpectator ? (
                    <span className="text-xs shrink-0" style={{ color: 'rgba(128,90,213,0.5)' }}>—</span>
                  ) : (
                  <motion.div key={`score-${player.user_id}-${player.score}`}
                    initial={{ scale: 1.6, color: '#f5c6d0' }}
                    animate={{ scale: 1, color: isMe ? '#e8a4b8' : 'rgba(255,255,255,0.5)' }}
                    transition={{ duration: 0.4, ease: 'backOut' }}
                    className="text-sm font-bold tabular-nums shrink-0">
                    {player.score}
                  </motion.div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* 底部装饰 */}
      <div className="px-4 py-3 border-t border-white/5">
        <div className="text-center">
          <span className="text-muted/40 text-xs font-serif">🌸 歌牌 · 拼尽全力！</span>
        </div>
      </div>
    </div>
  )
}

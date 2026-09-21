import { motion, AnimatePresence } from 'framer-motion'
import { Trophy } from 'lucide-react'
import type { RoomPlayer } from '../api/types'
import { Avatar } from './Avatar'
import { Button } from './ui'

interface ScoreBoardProps {
  players: RoomPlayer[]
  currentUserId: number
  hostId?: number
  remainingCount: number
  totalCount: number
  onKick?: (userId: number) => void
}

const RANK_MEDAL = ['🥇', '🥈', '🥉']
const RANK_GLOW = ['rgb(var(--color-gold)/ 0.15)', 'rgb(var(--color-body-text)/ 0.1)', 'rgb(var(--color-warning)/ 0.1)']

export function ScoreBoard({ players, currentUserId, hostId, remainingCount, totalCount, onKick }: ScoreBoardProps) {
  // 玩家按分数排，旁观者排最后
  const sorted = [...players].sort((a, b) => {
    const aSpec = a.role === 'spectator'
    const bSpec = b.role === 'spectator'
    if (aSpec && !bSpec) return 1
    if (!aSpec && bSpec) return -1
    return b.score - a.score
  })
  const progressPct = totalCount > 0 ? ((totalCount - remainingCount) / totalCount) * 100 : 0

  return (
    <div className="flex flex-col h-full w-52 shrink-0 border-l border-gold/10" style={{ background: 'linear-gradient(180deg, rgb(var(--accent-bg-mid)/ 0.98) 0%, rgb(var(--accent-bg-end)/ 0.95) 100%)' }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gold/10">
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={14} className="text-gold-dark" aria-hidden="true" />
          <span className="font-serif text-gold text-caption font-medium tracking-widest">实时战况</span>
        </div>

        {/* 进度环形 */}
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgb(var(--color-body-text)/ 0.05)" strokeWidth="3" />
              <motion.circle cx="18" cy="18" r="15" fill="none"
                stroke="url(#scoreGrad)" strokeWidth="3"
                strokeDasharray="94.2" strokeLinecap="round"
                animate={{ strokeDashoffset: 94.2 * (1 - progressPct / 100) }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{ strokeDashoffset: 94.2 * (1 - progressPct / 100) }} />
              <defs>
                <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgb(var(--color-gold))" />
                  <stop offset="100%" stopColor="rgb(var(--color-gold-light))" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-gold font-bold text-tiny tabular-nums">{remainingCount}</span>
            </div>
          </div>
          <div>
            <p className="text-body-text/50 text-tiny leading-none">剩余牌数</p>
            <p className="text-muted text-tiny mt-0.5">{remainingCount} / {totalCount} 张</p>
            {remainingCount <= 5 && remainingCount > 0 && (
              <p className="text-crimson text-tiny mt-0.5 animate-pulse">最后冲刺</p>
            )}
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        <AnimatePresence>
          {sorted.map((player, idx) => {
            const isMe = player.user_id === currentUserId
            const isSpectator = player.role === 'spectator'
            // 旁观者不占排名序号
            const rankIdx = sorted.slice(0, idx).filter(p => p.role !== 'spectator').length
            const medal = isSpectator ? null : RANK_MEDAL[rankIdx]
            const glow = isSpectator ? undefined : RANK_GLOW[rankIdx]

            return (
              <motion.div key={player.user_id} layout
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: player.online ? 1 : 0.35, x: 0 }}
                transition={{ duration: 0.3, layout: { duration: 0.4, ease: 'easeOut' } }}
                className={`relative rounded-lg mb-1.5 overflow-hidden border ${isMe ? 'bg-gold/10 border-gold/25' : `border-body-text/5 ${glow ? '' : 'bg-body-text/5'}`}`}
                style={isMe || !glow ? undefined : { background: glow }}>

                {/* 我的高亮条 */}
                {isMe && (
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l"
                    style={{ background: 'linear-gradient(180deg, rgb(var(--color-gold)), rgb(var(--color-gold-light)))' }} />
                )}

                <div className="flex items-center gap-2 px-3 py-2.5">
                  {/* 奖牌/排名/旁观图标 */}
                  <span className="text-caption w-5 text-center shrink-0">
                    {isSpectator ? '👁' : (medal ?? <span className="text-body-text/30 text-tiny font-mono">{rankIdx + 1}</span>)}
                  </span>

                  {/* Avatar + 用户名 */}
                  <Avatar username={player.username} avatarUrl={player.avatar_url} size={20} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`text-tiny font-sans truncate ${isMe ? 'text-gold font-semibold' : isSpectator ? 'text-body-text/40' : 'text-body-text/75'} ${!player.online ? 'line-through' : ''}`}>
                        {player.username}
                      </span>
                      {isMe && <span className="text-tiny shrink-0">⭐</span>}
                      {isSpectator && <span className="text-tiny shrink-0 text-info/70">旁观中</span>}
                      {!player.online && !isSpectator && <span className="text-muted text-tiny shrink-0">💤离线</span>}
                    </div>
                  </div>

                  {/* 分数 / 旁观者不显分数 */}
                  {isSpectator ? (
                    <span className="text-tiny shrink-0 text-info/50">—</span>
                  ) : (
                  <motion.div key={`score-${player.user_id}-${player.score}`}
                    initial={{ scale: 1.6, color: 'rgb(var(--color-gold-light))' }}
                    animate={{ scale: 1, color: isMe ? 'rgb(var(--color-gold))' : 'rgba(255,255,255,0.5)' }}
                    transition={{ duration: 0.4, ease: 'backOut' }}
                    className="text-caption font-bold tabular-nums shrink-0">
                    {player.score}
                  </motion.div>
                  )}

                  {/* 踢人按钮 */}
                  {onKick && hostId === currentUserId && !isMe && (
                    <Button onClick={() => onKick(player.user_id)}
                      variant="danger" size="sm"
                      className="shrink-0 ml-1"
                      title="踢出房间">✕</Button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* 底部装饰 */}
      <div className="px-4 py-3 border-t border-gold/10">
        <div className="text-center">
          <span className="text-gold/30 text-tiny font-serif italic">🌸 对局进行中</span>
        </div>
      </div>
    </div>
  )
}

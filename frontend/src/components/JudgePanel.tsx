import { motion, AnimatePresence } from 'framer-motion'
import type { Card } from '../api/types'
import { api } from '../api/client'

interface JudgePanelProps {
  roomId: number
  cards: Card[]
  playedCardIds: Set<number>
  currentCardId: number | null
  isJudgeWaiting: boolean
}

export function JudgePanel({
  roomId,
  cards,
  playedCardIds,
  currentCardId,
  isJudgeWaiting,
}: JudgePanelProps) {
  const handlePlayCard = async (cardId: number) => {
    if (!isJudgeWaiting) return
    if (playedCardIds.has(cardId)) return
    try {
      await api.rooms.playCard(roomId, cardId)
    } catch {
      // 静默失败，服务端会发错误广播
    }
  }

  const playedCount = playedCardIds.size
  const totalCount = cards.length
  const remainingCount = totalCount - playedCount

  return (
    <div className="flex flex-col h-full">
      {/* 裁判状态提示横幅 */}
      <div
        className="shrink-0 px-4 py-3 border-b"
        style={{ borderColor: 'rgba(232,164,184,0.12)', background: 'rgba(232,164,184,0.04)' }}
      >
        <AnimatePresence mode="wait">
          {currentCardId !== null ? (
            <motion.div
              key="playing"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-2"
            >
              <motion.span
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="text-base"
              >
                🎵
              </motion.span>
              <span className="text-sm font-medium" style={{ color: '#e8a4b8' }}>
                正在播放中… 等待玩家们抢牌！(ง •̀_•́)ง
              </span>
              <span className="ml-auto text-xs text-white/30">
                {playedCount}/{totalCount}
              </span>
            </motion.div>
          ) : isJudgeWaiting ? (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-2"
            >
              <motion.span
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="text-base"
              >
                👑
              </motion.span>
              <span className="text-sm font-medium" style={{ color: '#e8a4b8' }}>
                裁判大人，请选择下一首要播放的歌！(≧▽≦)
              </span>
              <span className="ml-auto text-xs" style={{ color: 'rgba(232,164,184,0.5)' }}>
                剩余 {remainingCount} 张
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-2"
            >
              <span className="text-base">(*ﾟОﾟ)</span>
              <span className="text-sm" style={{ color: 'rgba(232,164,184,0.6)' }}>
                玩家们已就位，请选牌开始！
              </span>
              <span className="ml-auto text-xs text-white/30">
                {playedCount}/{totalCount}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 牌组列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="grid grid-cols-1 gap-1.5">
          {cards.map((card) => {
            const isPlayed = playedCardIds.has(card.id)
            const isCurrent = card.id === currentCardId
            const isClickable = isJudgeWaiting && !isPlayed && !isCurrent

            return (
              <motion.button
                key={card.id}
                onClick={() => handlePlayCard(card.id)}
                disabled={!isClickable}
                whileHover={isClickable ? { scale: 1.01, x: 2 } : {}}
                whileTap={isClickable ? { scale: 0.98 } : {}}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 w-full"
                style={{
                  background: isCurrent
                    ? 'rgba(232,164,184,0.15)'
                    : isPlayed
                    ? 'rgba(255,255,255,0.02)'
                    : isClickable
                    ? 'rgba(232,164,184,0.06)'
                    : 'rgba(255,255,255,0.03)',
                  borderColor: isCurrent
                    ? 'rgba(232,164,184,0.5)'
                    : isPlayed
                    ? 'rgba(255,255,255,0.04)'
                    : isClickable
                    ? 'rgba(232,164,184,0.2)'
                    : 'rgba(255,255,255,0.06)',
                  opacity: isPlayed ? 0.4 : 1,
                  cursor: isClickable ? 'pointer' : 'default',
                }}
              >
                {/* 封面 */}
                <div
                  className="shrink-0 w-9 h-9 rounded overflow-hidden flex items-center justify-center"
                  style={{ background: 'rgba(232,164,184,0.08)', border: '1px solid rgba(232,164,184,0.15)' }}
                >
                  {card.cover_url ? (
                    <img
                      src={card.cover_url}
                      alt={card.display_text}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gold/50 font-serif text-sm">歌</span>
                  )}
                </div>

                {/* 文字 */}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: isCurrent ? '#e8a4b8' : isPlayed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)' }}
                  >
                    {card.display_text}
                  </div>
                  {card.hint_text && (
                    <div className="text-xs truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {card.hint_text}
                    </div>
                  )}
                </div>

                {/* 右侧状态标记 */}
                <div className="shrink-0 text-xs">
                  {isCurrent ? (
                    <motion.span
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                      style={{ color: '#e8a4b8' }}
                    >
                      ♪ 播放中
                    </motion.span>
                  ) : isPlayed ? (
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>✓ 已播</span>
                  ) : isClickable ? (
                    <span style={{ color: 'rgba(232,164,184,0.5)' }}>点击播放</span>
                  ) : null}
                </div>
              </motion.button>
            )
          })}
        </div>

        {cards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-white/20">
            <div className="text-3xl mb-2">🎵</div>
            <p className="text-sm">牌组空空如也 (｡•́︿•̀｡)</p>
          </div>
        )}
      </div>
    </div>
  )
}

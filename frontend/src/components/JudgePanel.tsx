import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Card } from '../api/types'
import { api } from '../api/client'

interface PlayableItem {
  cardId: number
  audioId: number
  coverUrl: string
  displayText: string
  hintText: string
}

interface JudgePanelProps {
  roomId: number
  cards: Card[]
  playedCardIds: Set<number>
  currentCardId: number | null
  currentAudioId: number | null
  currentHintText: string | null
  isJudgeWaiting: boolean
}

export function JudgePanel({
  roomId,
  cards,
  playedCardIds,
  currentCardId,
  currentAudioId,
  currentHintText,
  isJudgeWaiting,
}: JudgePanelProps) {
  // 追踪已播放过的条目 key（"cardId-hintText"）
  const [playedItemKeys, setPlayedItemKeys] = useState<Set<string>>(new Set())
  const prevCurrentRef = useRef<string | null>(null)

  // 追踪当前播放，结束时标记为 played（用 audioId 作唯一标识）
  useEffect(() => {
    const newKey = (currentCardId !== null && currentAudioId !== null && currentAudioId > 0)
      ? `${currentCardId}-${currentAudioId}`
      : (currentCardId !== null && currentHintText !== null)
        ? `${currentCardId}-${currentHintText}`
        : null
    if (newKey !== null && prevCurrentRef.current !== null && newKey !== prevCurrentRef.current) {
      setPlayedItemKeys(prev => new Set([...prev, prevCurrentRef.current!]))
    }
    if (newKey === null && prevCurrentRef.current !== null) {
      setPlayedItemKeys(prev => new Set([...prev, prevCurrentRef.current!]))
    }
    prevCurrentRef.current = newKey
  }, [currentCardId, currentAudioId, currentHintText])

  // 展开为每首歌一个条目
  const items: PlayableItem[] = []
  for (const card of cards) {
    if (card.audios && card.audios.length > 0) {
      for (const audio of card.audios) {
        items.push({
          cardId: card.id,
          audioId: audio.id,
          coverUrl: card.cover_url || '',
          displayText: card.display_text,
          hintText: audio.hint_text || '',
        })
      }
    } else {
      items.push({
        cardId: card.id,
        audioId: 0,
        coverUrl: card.cover_url || '',
        displayText: card.display_text,
        hintText: card.hint_text || '',
      })
    }
  }

  const handlePlay = async (item: PlayableItem) => {
    if (!isJudgeWaiting) return
    try {
      await api.rooms.playCard(roomId, item.cardId, item.audioId)
    } catch { /* ignore */ }
  }

  // 统计已播放的 item 数量（被耗尽的 card 的全部 audios 计入）
  const playedItemCount = items.filter(item => {
    const pk = item.audioId > 0 ? `${item.cardId}-${item.audioId}` : `${item.cardId}-${item.hintText}`
    return playedCardIds.has(item.cardId) || playedItemKeys.has(pk)
  }).length
  const totalCount = items.length

  return (
    <div className="flex flex-col h-full">
      {/* 状态横幅 */}
      <div className="shrink-0 px-4 py-3 border-b"
        style={{ borderColor: 'rgba(var(--accent-primary),0.12)', background: 'rgba(var(--accent-primary),0.04)' }}>
        <AnimatePresence mode="wait">
          {currentCardId !== null ? (
            <motion.div key="playing" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-2">
              <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="text-base">🎵</motion.span>
              <span className="text-sm font-medium" style={{ color: 'var(--color-gold)' }}>正在播放中… 等待抢牌！</span>
              <span className="ml-auto text-xs text-white/30">{playedItemCount}/{totalCount}</span>
            </motion.div>
          ) : isJudgeWaiting ? (
            <motion.div key="waiting" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-2">
              <motion.span animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 1.2, repeat: Infinity }} className="text-base">👑</motion.span>
              <span className="text-sm font-medium" style={{ color: 'var(--color-gold)' }}>选择下一首要播放的歌！</span>
              <span className="ml-auto text-xs" style={{ color: 'rgba(var(--accent-primary),0.5)' }}>剩余 {totalCount - playedItemCount}</span>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'rgba(var(--accent-primary),0.6)' }}>等待开始…</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 歌曲列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="grid grid-cols-1 gap-1.5">
          {items.map((item, idx) => {
            const itemKey = `${item.cardId}-${item.audioId}-${idx}`
            const playKey = item.audioId > 0 ? `${item.cardId}-${item.audioId}` : `${item.cardId}-${item.hintText}`
            const isPlayed = playedCardIds.has(item.cardId) || playedItemKeys.has(playKey)
            const isCurrent = item.cardId === currentCardId && (currentAudioId !== null ? item.audioId === currentAudioId : item.hintText === currentHintText)
            const isClickable = isJudgeWaiting && !isPlayed && !isCurrent

            return (
              <motion.button key={itemKey}
                onClick={() => handlePlay(item)}
                disabled={!isClickable}
                whileHover={isClickable ? { scale: 1.01, x: 2 } : {}}
                whileTap={isClickable ? { scale: 0.98 } : {}}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 w-full"
                style={{
                  background: isCurrent ? 'rgba(var(--accent-primary),0.15)' : isClickable ? 'rgba(var(--accent-primary),0.06)' : 'rgba(255,255,255,0.02)',
                  borderColor: isCurrent ? 'rgba(var(--accent-primary),0.5)' : isClickable ? 'rgba(var(--accent-primary),0.2)' : 'rgba(255,255,255,0.06)',
                  opacity: isPlayed ? 0.4 : 1,
                  cursor: isClickable ? 'pointer' : 'default',
                }}>
                {/* 封面 */}
                <div className="shrink-0 w-9 h-9 rounded overflow-hidden flex items-center justify-center"
                  style={{ background: 'rgba(var(--accent-primary),0.08)', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
                  {item.coverUrl ? (
                    <img src={item.coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-gold/50 font-serif text-sm">♪</span>
                  )}
                </div>

                {/* 文字 */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate"
                    style={{ color: isCurrent ? 'var(--color-gold)' : isPlayed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)' }}>
                    {item.displayText}
                  </div>
                  {item.hintText && (
                    <div className="text-xs truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      ♪ {item.hintText}
                    </div>
                  )}
                </div>

                {/* 状态 */}
                <div className="shrink-0 text-xs">
                  {isCurrent ? (
                    <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 0.8, repeat: Infinity }}
                      style={{ color: 'var(--color-gold)' }}>♪ 播放中</motion.span>
                  ) : isPlayed ? (
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>✓</span>
                  ) : isClickable ? (
                    <span style={{ color: 'rgba(var(--accent-primary),0.5)' }}>▶</span>
                  ) : null}
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

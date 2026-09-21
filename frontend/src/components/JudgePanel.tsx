import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Card } from '../api/types'
import { api } from '../api/client'
import { useToast } from './ui'

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
  const toast = useToast()
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
    } catch (err) {
      // 选牌失败必须可见（2026-09-21 修复静默）：如首窗口并发保护/房间状态变化
      toast.show((err as Error).message || '选牌失败，请重试', 'fail')
    }
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
      <div className="shrink-0 px-4 py-3 border-b border-gold/10 bg-gold/5">
        <AnimatePresence mode="wait">
          {currentCardId !== null ? (
            <motion.div key="playing" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-2">
              <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="text-base">🎵</motion.span>
              <span className="text-caption font-medium text-gold">正在播放，等待抢牌</span>
              <span className="ml-auto text-tiny text-body-text/30">{playedItemCount}/{totalCount}</span>
            </motion.div>
          ) : isJudgeWaiting ? (
            <motion.div key="waiting" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-2">
              <motion.span animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 1.2, repeat: Infinity }} className="text-base">👑</motion.span>
              <span className="text-caption font-medium text-gold/50">选择下一首要播放的牌</span>
              <span className="ml-auto text-tiny text-gold/50">剩余 {totalCount - playedItemCount}</span>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-2">
              <span className="text-caption text-gold/60">等待开始…</span>
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 w-full ${isCurrent ? 'bg-gold/15 border-gold/50' : isClickable ? 'bg-gold/5 border-gold/20' : 'bg-body-text/5 border-body-text/10'}`}
                style={{
                  opacity: isPlayed ? 0.4 : 1,
                  cursor: isClickable ? 'pointer' : 'default',
                }}>
                {/* 封面 */}
                <div className="shrink-0 w-9 h-9 rounded overflow-hidden flex items-center justify-center bg-gold/10 border border-gold/15">
                  {item.coverUrl ? (
                    <img src={item.coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-gold/50 font-serif text-caption">♪</span>
                  )}
                </div>

                {/* 文字 */}
                <div className="flex-1 min-w-0">
                  <div className={`text-caption font-medium truncate ${isCurrent ? 'text-gold' : isPlayed ? 'text-body-text/30' : 'text-body-text/85'}`}>
                    {item.displayText}
                  </div>
                  {item.hintText && (
                    <div className="text-tiny truncate mt-0.5 text-body-text/30">
                      ♪ {item.hintText}
                    </div>
                  )}
                </div>

                {/* 状态 */}
                <div className="shrink-0 text-tiny">
                  {isCurrent ? (
                    <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 0.8, repeat: Infinity }}
                      className="text-gold">♪ 播放中</motion.span>
                  ) : isPlayed ? (
                    <span className="text-body-text/20">✓</span>
                  ) : isClickable ? (
                    <span className="text-gold/50">▶</span>
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

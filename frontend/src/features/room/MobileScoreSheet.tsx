import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp } from 'lucide-react'
import type { RoomPlayer } from '../../api/types'

interface MobileScoreSheetProps {
  players: RoomPlayer[]
  currentUserId: number
  hostId: number
  /** 裁判模式：名单中隐藏房主（裁判） */
  isJudgeMode: boolean
}

/** 名次奖牌（前三名），之后回落为数字序号 */
const RANK_MEDAL = ['🥇', '🥈', '🥉']

/**
 * 移动端计分抽屉（设计规格 §5.6）。
 * 把手常驻「N人 · 你第X」；点按上拉全名单（名次徽章/我高亮/分数），再点或下拉收起。
 * md 以下由容器 class 控制显隐，桌面仍用 ScoreBoard。
 */
export function MobileScoreSheet({ players, currentUserId, hostId, isJudgeMode }: MobileScoreSheetProps) {
  const [open, setOpen] = useState(false)

  // 玩家按分数排序；裁判模式下隐藏房主（裁判）；旁观者排在名单之后
  const ranked = [...players]
    .filter(p => p.role !== 'spectator' && !(isJudgeMode && p.user_id === hostId))
    .sort((a, b) => b.score - a.score)
  const spectators = players.filter(p => p.role === 'spectator')
  const myRankIdx = ranked.findIndex(p => p.user_id === currentUserId)
  const handleText = `${ranked.length}人 · ${myRankIdx >= 0 ? `你第${myRankIdx + 1}` : '旁观中'}`

  return (
    <div className="md:hidden shrink-0 bg-ink-deep/95 border-t border-gold/10">
      {/* 把手：点按展开/收起；展开后下拉收起 */}
      <motion.button
        type="button"
        onClick={() => setOpen(v => !v)}
        drag={open ? 'y' : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => { if (info.offset.y > 50) setOpen(false) }}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-2 px-4 py-2 text-tiny text-muted touch-pan-y"
      >
        <span>{handleText}</span>
        <ChevronUp size={13} className={`transition-transform duration-fast ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="max-h-[40vh] overflow-y-auto px-3 pb-1">
              {ranked.map((p, i) => {
                const isMe = p.user_id === currentUserId
                return (
                  <div key={p.user_id}
                    className={`flex items-center gap-2 px-3 py-2 mb-1 rounded-lg border ${
                      isMe ? 'bg-gold/10 border-gold/25' : 'bg-white/5 border-white/5'
                    }`}>
                    <span className="w-5 text-center shrink-0">
                      {RANK_MEDAL[i] ?? <span className="text-body-text/30 text-tiny font-mono">{i + 1}</span>}
                    </span>
                    <span className={`flex-1 min-w-0 truncate text-tiny ${isMe ? 'text-gold font-semibold' : 'text-body-text/75'} ${!p.online ? 'opacity-40' : ''}`}>
                      {p.username}{isMe ? '（你）' : ''}
                    </span>
                    <span className={`text-tiny font-bold tabular-nums shrink-0 ${isMe ? 'text-gold' : 'text-body-text/50'}`}>
                      {p.score}
                    </span>
                  </div>
                )
              })}
              {spectators.map(p => (
                <div key={p.user_id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="w-5 text-center shrink-0 text-tiny">👁</span>
                  <span className={`flex-1 min-w-0 truncate text-tiny ${p.user_id === currentUserId ? 'text-info' : 'text-body-text/40'}`}>
                    {p.username}{p.user_id === currentUserId ? '（你）' : ''}
                  </span>
                  <span className="text-tiny shrink-0 text-info/50">旁观</span>
                </div>
              ))}
            </div>
            <p className="pb-2 text-center text-tiny text-body-text/30">点按或下拉收起</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

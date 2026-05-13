import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { DuelState, DuelCard, CardMask } from '../api/types'

function buildMaskStyle(m: CardMask): React.CSSProperties {
  switch (m.type) {
    case 'clip-edge': {
      const r = m.ratio ?? 0.5
      const dirs: Record<string, string> = { top: `inset(0 0 ${(1-r)*100}% 0)`, bottom: `inset(${(1-r)*100}% 0 0 0)`, left: `inset(0 ${(1-r)*100}% 0 0)`, right: `inset(0 0 0 ${(1-r)*100}%)` }
      return { background: 'rgba(0,0,0,0.92)', clipPath: dirs[m.direction ?? 'top'] ?? dirs.top }
    }
    case 'blur':
      return { backdropFilter: `blur(${m.intensity ?? 2}px)`, WebkitBackdropFilter: `blur(${m.intensity ?? 2}px)` }
    case 'pixelate':
      return { backdropFilter: `blur(${(m.intensity ?? 10)/3}px)`, WebkitBackdropFilter: `blur(${(m.intensity ?? 10)/3}px)`, background: 'rgba(0,0,0,0.15)' }
    case 'stripe': {
      const a = m.angle ?? 45, w = (m.width ?? 0.08) * 100
      return { background: `repeating-linear-gradient(${a}deg, transparent, transparent ${w}%, rgba(0,0,0,0.85) ${w}%, rgba(0,0,0,0.85) ${w*2}%)` }
    }
    case 'spotlight': {
      const cx = (m.cx ?? 0.5)*100, cy = (m.cy ?? 0.5)*100, r = (m.radius ?? 0.2)*100
      return { background: 'rgba(0,0,0,0.92)', maskImage: `radial-gradient(circle at ${cx}% ${cy}%, transparent ${r}%, black ${r+2}%)`, WebkitMaskImage: `radial-gradient(circle at ${cx}% ${cy}%, transparent ${r}%, black ${r+2}%)` }
    }
    default:
      return {}
  }
}

interface DuelBoardProps {
  duelState: DuelState
  currentUserId: number
  currentCardId: number | null
  onGrab: (cardId: number) => void
  arranging?: boolean
  arrangeTimeout?: number | null
  p1Ready?: boolean
  p2Ready?: boolean
  onArrangeSwap?: (posA: number, posB: number) => void
  onArrangeCrossSwap?: (myIdx: number, oppIdx: number) => void
  onArrangeReady?: () => void
}

export function DuelBoard({ duelState, currentUserId, onGrab, arranging, arrangeTimeout, p1Ready, p2Ready, onArrangeSwap, onArrangeCrossSwap, onArrangeReady }: DuelBoardProps) {
  // 判断当前用户是 player1 还是 player2
  const isPlayer1 = duelState.player1.id === currentUserId
  const myState = isPlayer1 ? duelState.player1 : duelState.player2
  const opponentState = isPlayer1 ? duelState.player2 : duelState.player1
  const myCount = isPlayer1 ? duelState.p1_count : duelState.p2_count
  const opponentCount = isPlayer1 ? duelState.p2_count : duelState.p1_count
  const flip = duelState.flip

  const myReady = isPlayer1 ? p1Ready : p2Ready
  const opponentReady = isPlayer1 ? p2Ready : p1Ready

  // 排阵模式：选中的牌 {area, idx}
  const [selected, setSelected] = useState<{ area: 'my' | 'opp'; idx: number } | null>(null)


  const handleArrangeClick = (area: 'my' | 'opp', idx: number) => {
    if (!arranging || !onArrangeSwap) return
    if (selected === null) {
      setSelected({ area, idx })
    } else if (selected.area === area && selected.idx === idx) {
      setSelected(null)
    } else {
      // Send swap
      if (selected.area === area) {
        // Same area swap (only valid for own area)
        if (area === 'my') {
          onArrangeSwap(selected.idx, idx)
        }
      } else {
        // Cross-area swap
        const myIdx = selected.area === 'my' ? selected.idx : idx
        const oppIdx = selected.area === 'opp' ? selected.idx : idx
        onArrangeCrossSwap?.(myIdx, oppIdx)
      }
      setSelected(null)
    }
  }

  const handleMyCardClick = (idx: number, cardId: number) => {
    if (arranging) {
      handleArrangeClick('my', idx)
    } else {
      onGrab(cardId)
    }
  }

  const handleOppCardClick = (idx: number, cardId: number) => {
    if (arranging) {
      handleArrangeClick('opp', idx)
    } else {
      onGrab(cardId)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 顶部状态栏 */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ background: 'rgba(var(--accent-bg-mid),0.7)', borderBottom: '1px solid rgba(var(--accent-primary),0.1)' }}>
        <div className="flex items-center gap-2">
          <span className="text-crimson/80 text-xs font-serif">
            {opponentState.username}
          </span>
          <span className="text-white/50 text-xs tabular-nums">{opponentCount} 张</span>
          {arranging && <span className="text-xs">{opponentReady ? '✓ 准备好了' : '排阵中…'}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          {arranging ? (
            <span className="text-gold">{arrangeTimeout != null ? `排阵 ${arrangeTimeout}s` : '排阵中'}</span>
          ) : (
            <span>队列剩余 {duelState.queue_left}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/50 text-xs tabular-nums">{myCount} 张</span>
          <span className="text-gold text-xs font-serif">
            {myState.username} (我)
          </span>
        </div>
      </div>

      {/* 对方区域 */}
      <div className="flex-1 overflow-y-auto relative"
        style={{ borderBottom: '2px solid rgba(var(--accent-primary),0.15)' }}>
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="text-crimson/40 text-xs bg-black/40 px-2 py-0.5 rounded-full font-serif">
            -- 对方领域 --
          </span>
        </div>
        <DuelCardGrid
          cards={opponentState.cards}
          flipped={flip}

          onGrab={onGrab}
          isOpponent={true}
          onCardClickWithIndex={handleOppCardClick}
          selectedIdx={arranging && selected?.area === 'opp' ? selected.idx : null}
        />
      </div>

      {/* 分隔线 - 中间决斗区标识 */}
      <div className="flex items-center gap-2 px-4 py-1.5 shrink-0"
        style={{ background: 'rgba(var(--accent-primary),0.06)' }}>
        <div className="h-px flex-1 bg-gold/20" />
        <span className="text-gold/60 text-xs font-serif tracking-wider">
          -- 决斗场 --
        </span>
        <div className="h-px flex-1 bg-gold/20" />
      </div>

      {/* 己方区域 */}
      <div className="flex-1 overflow-y-auto relative">
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="text-gold/40 text-xs bg-black/40 px-2 py-0.5 rounded-full font-serif">
            -- 我的领域 --
          </span>
        </div>
        <DuelCardGrid
          cards={myState.cards}
          flipped={false}

          onGrab={onGrab}
          isOpponent={false}
          onCardClickWithIndex={handleMyCardClick}
          selectedIdx={arranging && selected?.area === 'my' ? selected.idx : null}
        />
      </div>

      {/* 排阵确认按钮 */}
      {arranging && (
        <div className="shrink-0 px-4 py-3 flex items-center gap-3"
          style={{ background: 'rgba(var(--accent-bg-mid),0.8)', borderTop: '1px solid rgba(var(--accent-primary),0.1)' }}>
          <div className="flex-1 text-xs text-muted font-serif">
            {selected !== null ? '点击另一张牌交换（可跨区）' : '点击选中一张牌'}
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onArrangeReady}
            disabled={myReady}
            className="px-4 py-2 rounded-lg text-sm font-serif transition-all disabled:opacity-40"
            style={{
              background: myReady ? 'rgba(34,197,94,0.2)' : 'rgba(var(--accent-primary),0.15)',
              border: myReady ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(var(--accent-primary),0.3)',
              color: myReady ? '#22c55e' : 'var(--color-gold)',
            }}
          >
            {myReady ? '已准备 ✓' : '准备完毕！'}
          </motion.button>
        </div>
      )}
    </div>
  )
}

// 内部组件：Duel 牌面网格
interface DuelCardGridProps {
  cards: DuelCard[]
  flipped: boolean
  onGrab: (cardId: number) => void
  isOpponent: boolean
  onCardClickWithIndex?: (idx: number, cardId: number) => void
  selectedIdx?: number | null
}

function DuelCardGrid({ cards, flipped, onGrab, isOpponent, onCardClickWithIndex, selectedIdx }: DuelCardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-full py-8">
        <span className="text-muted text-sm font-serif italic">
          {isOpponent ? '对方场上还没有牌 (o_O)' : '你的场上还没有牌 (>_<)'}
        </span>
      </div>
    )
  }

  return (
    <div className="p-2 pt-5 flex justify-center">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(clamp(72px, 10vw, 120px), 1fr))`,
          gap: 'clamp(5px, 1vw, 10px)',
          width: '100%',
          justifyContent: 'center',
        }}
      >
        <AnimatePresence mode="popLayout">
          {cards.map((card, idx) => {
            const isSelected = selectedIdx === idx
            const isClaimed = !!card.claimed
            return (
              <div
                key={card.id}
                style={{
                  aspectRatio: '3/4',
                  transform: flipped ? 'rotate(180deg)' : undefined,
                }}
              >
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: isClaimed ? 0.4 : 1, scale: isClaimed ? 0.75 : isSelected ? 1.08 : 1 }}
                  exit={{ opacity: 0, scale: 0.3, transition: { duration: 0.3 } }}
                  whileHover={isClaimed ? {} : { y: -3, scale: 1.05, transition: { duration: 0.1 } }}
                  whileTap={isClaimed ? {} : { scale: 0.93 }}
                  onClick={() => { if (isClaimed) return; onCardClickWithIndex ? onCardClickWithIndex(idx, card.id) : onGrab(card.id) }}
                  className={`relative overflow-hidden rounded-lg select-none w-full h-full ${isClaimed ? 'cursor-default grayscale' : 'cursor-pointer'}`}
                  style={{
                    boxShadow: isSelected
                      ? '0 0 16px rgba(34,197,94,0.6), 0 4px 12px rgba(0,0,0,0.5)'
                      : isClaimed
                        ? '0 1px 4px rgba(0,0,0,0.3)'
                        : '0 2px 8px rgba(0,0,0,0.4)',
                    border: isSelected
                      ? '2px solid rgba(34,197,94,0.8)'
                      : isClaimed
                        ? '1px solid rgba(255,255,255,0.05)'
                        : '1px solid rgba(var(--accent-primary),0.1)',
                  }}
                >
                  {card.cover_url ? (
                    <img
                      src={card.cover_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{ background: 'linear-gradient(160deg, var(--color-surface), var(--color-ink))' }}>
                      <span className="text-gold/40 text-xs font-serif">{card.display_text.slice(0, 4)}</span>
                    </div>
                  )}

                  {/* 模糊牌面遮罩 */}
                  {card.mask && !isClaimed && (
                    <div className="absolute inset-0 pointer-events-none" style={buildMaskStyle(card.mask)} />
                  )}

                  {/* 已抢标记 */}
                  {isClaimed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="text-white/60 text-xs font-bold">✓</span>
                    </div>
                  )}
                </motion.div>
              </div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

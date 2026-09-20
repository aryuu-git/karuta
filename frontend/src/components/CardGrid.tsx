import { AnimatePresence, motion } from 'framer-motion'
import { KarutaCard } from './KarutaCard'
import type { Card } from '../api/types'

interface DiscardItem {
  cardId: number
  winner: string
  hintText: string
}

interface CardGridProps {
  cards: Card[]
  cardRemaining: Map<number, number>
  discardPile?: DiscardItem[]
  onGrab?: (cardId: number) => void
}

export function CardGrid({ cards, cardRemaining, discardPile = [], onGrab }: CardGridProps) {
  const remaining = cards.filter(c => (cardRemaining.get(c.id) ?? c.audio_count ?? 1) > 0)

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-6 px-4 sm:px-8">
      {/* 未被抢完的牌 */}
      {remaining.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(clamp(80px, 10vw, 140px), 1fr))`,
            gap: 'clamp(6px, 1vw, 12px)',
            width: '100%',
            justifyContent: 'center',
          }}
        >
          <AnimatePresence mode="popLayout">
            {remaining.map((card) => (
              <KarutaCard
                key={card.id}
                card={card}
                isExhausted={false}
                remaining={cardRemaining.get(card.id) ?? card.audio_count ?? 1}
                audioCount={card.audio_count ?? 1}
                claimedBy={null}
                onGrab={onGrab}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 废牌堆：每一轮抢牌/miss 的记录 */}
      {discardPile.length > 0 && (
        <div className="mt-6 w-full max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-white/20 text-xs">废牌堆 ({discardPile.length})</span>
            <div className="h-px flex-1 bg-white/5" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <AnimatePresence>
              {discardPile.map((item, i) => {
                const card = cards.find(c => c.id === item.cardId)
                if (!card) return null
                return (
                  <motion.div key={`discard-${i}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 0.7, scale: 1 }}
                    className="relative rounded overflow-hidden"
                    style={{ width: 'clamp(40px, 5vw, 56px)', aspectRatio: '3/4' }}>
                    {card.cover_url ? (
                      <img src={card.cover_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-surface flex items-center justify-center">
                        <span className="text-gold/30 text-xs">♪</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30" />
                    <div className="absolute bottom-0 left-0 right-0 px-0.5 py-0.5 text-center"
                      style={{ background: 'rgba(0,0,0,0.6)' }}>
                      <span className="text-white/70 leading-none" style={{ fontSize: '0.5rem' }}>
                        {item.winner === '无人' ? '逃' : item.winner.slice(0, 2)}
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}

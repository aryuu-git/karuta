import { AnimatePresence } from 'framer-motion'
import { KarutaCard } from './KarutaCard'
import type { Card } from '../api/types'

interface CardGridProps {
  cards: Card[]
  claimedCards: Set<number>
  claimedByMap: Map<number, string>
  onGrab?: (cardId: number) => void  // 可选，不传则只读
}

export function CardGrid({ cards, claimedCards, claimedByMap, onGrab }: CardGridProps) {
  const remaining = cards.filter(c => !claimedCards.has(c.id))
  const claimed = cards.filter(c => claimedCards.has(c.id))

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-6 px-4 sm:px-8">
      {/* 未被抢的牌：居中，动态调整列数 */}
      {remaining.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(clamp(110px, 13vw, 155px), 1fr))`,
            gap: 'clamp(8px, 1.2vw, 14px)',
            width: '100%',
            maxWidth: '900px',
            justifyContent: 'center',
          }}
        >
          <AnimatePresence mode="popLayout">
            {remaining.map((card) => (
              <KarutaCard
                key={card.id}
                card={card}
                isClaimed={false}
                claimedBy={null}
                onGrab={onGrab}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 已被抢的牌：小图显示在底部 */}
      {claimed.length > 0 && (
        <div className="mt-6 w-full max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-white/20 text-xs">已抢 {claimed.length} 张</span>
            <div className="h-px flex-1 bg-white/5" />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(clamp(60px, 7vw, 80px), 1fr))`,
              gap: 'clamp(4px, 0.6vw, 8px)',
            }}
          >
            <AnimatePresence mode="popLayout">
              {claimed.map((card) => (
                <KarutaCard
                  key={card.id}
                  card={card}
                  isClaimed={true}
                  claimedBy={claimedByMap.get(card.id) ?? null}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}

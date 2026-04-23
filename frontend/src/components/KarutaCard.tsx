import { motion } from 'framer-motion'
import type { Card } from '../api/types'

interface KarutaCardProps {
  card: Card
  isClaimed?: boolean
  claimedBy?: string | null
  onGrab?: (cardId: number) => void
}

export function KarutaCard({ card, isClaimed, claimedBy, onGrab }: KarutaCardProps) {
  return (
    <motion.div layout
      initial={{ opacity: 0, scale: 0.85, y: 8 }}
      animate={{ opacity: isClaimed ? 0.1 : 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.15, y: -40,
        rotate: Math.random() > 0.5 ? 12 : -12,
        transition: { duration: 0.35, ease: 'backIn' } }}
      whileHover={!isClaimed ? { y: -5, scale: 1.04, transition: { duration: 0.12 } } : undefined}
      whileTap={!isClaimed ? { scale: 0.96 } : undefined}
      onClick={() => onGrab?.(card.id)}
      className="relative overflow-hidden rounded-lg select-none cursor-pointer"
      style={{
        width: '100%', aspectRatio: '3/4',
        background: 'linear-gradient(160deg, #4a1a30 0%, #3d1525 50%, #2d0a1a 100%)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>

      {/* 封面图（全覆盖，不露文字） */}
      {card.cover_url && (
        <img src={card.cover_url} alt=""
          className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      )}

      {/* 内层细框 */}
      <div className="absolute inset-[3px] rounded-md pointer-events-none"
        style={{ border: '1px solid rgba(232,164,184,0.1)' }} />

      {/* 被抢走遮罩 */}
      {isClaimed && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg"
          style={{ background: 'rgba(10,3,8,0.65)' }}>
          {claimedBy && claimedBy !== '无人' && (
            <span className="text-gold/50 font-serif text-center px-2 leading-tight"
              style={{ fontSize: 'clamp(0.5rem, 1.2vw, 0.7rem)' }}>
              {claimedBy}
            </span>
          )}
        </div>
      )}
    </motion.div>
  )
}

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { Card, CardMask } from '../api/types'

interface KarutaCardProps {
  card: Card
  isExhausted?: boolean
  remaining?: number
  audioCount?: number
  claimedBy?: string | null
  onGrab?: (cardId: number) => void
}

function buildMaskCSS(mask: CardMask): React.CSSProperties {
  switch (mask.type) {
    case 'clip-edge': {
      const ratio = mask.ratio ?? 0.5
      let clipPath = ''
      switch (mask.direction) {
        case 'top':
          clipPath = `inset(0 0 ${(1 - ratio) * 100}% 0)`
          break
        case 'bottom':
          clipPath = `inset(${(1 - ratio) * 100}% 0 0 0)`
          break
        case 'left':
          clipPath = `inset(0 ${(1 - ratio) * 100}% 0 0)`
          break
        case 'right':
          clipPath = `inset(0 0 0 ${(1 - ratio) * 100}%)`
          break
        default:
          clipPath = `inset(0 0 ${(1 - ratio) * 100}% 0)`
      }
      return {
        background: 'rgba(0,0,0,0.92)',
        clipPath,
      }
    }
    case 'clip-diagonal': {
      const ratio = mask.ratio ?? 0.5
      let polygon = ''
      switch (mask.direction) {
        case 'top-left':
          polygon = `polygon(0 0, ${ratio * 100}% 0, 0 ${ratio * 100}%)`
          break
        case 'top-right':
          polygon = `polygon(${(1 - ratio) * 100}% 0, 100% 0, 100% ${ratio * 100}%)`
          break
        case 'bottom-left':
          polygon = `polygon(0 ${(1 - ratio) * 100}%, ${ratio * 100}% 100%, 0 100%)`
          break
        case 'bottom-right':
          polygon = `polygon(100% ${(1 - ratio) * 100}%, 100% 100%, ${(1 - ratio) * 100}% 100%)`
          break
        default:
          polygon = `polygon(0 0, ${ratio * 100}% 0, 0 ${ratio * 100}%)`
      }
      return {
        background: 'rgba(0,0,0,0.92)',
        clipPath: polygon,
      }
    }
    case 'blur':
      return {
        backdropFilter: `blur(${mask.intensity ?? 2}px)`,
        WebkitBackdropFilter: `blur(${mask.intensity ?? 2}px)`,
      }
    case 'pixelate':
      // 使用 SVG filter 模拟马赛克效果
      return {
        backdropFilter: `blur(${(mask.intensity ?? 10) / 3}px)`,
        WebkitBackdropFilter: `blur(${(mask.intensity ?? 10) / 3}px)`,
        background: 'rgba(0,0,0,0.15)',
      }
    case 'stripe': {
      const angle = mask.angle ?? 45
      const width = mask.width ?? 0.08
      const pct = width * 100
      return {
        background: `repeating-linear-gradient(${angle}deg, transparent, transparent ${pct}%, rgba(0,0,0,0.85) ${pct}%, rgba(0,0,0,0.85) ${pct * 2}%)`,
      }
    }
    case 'spotlight': {
      const cx = (mask.cx ?? 0.5) * 100
      const cy = (mask.cy ?? 0.5) * 100
      const radius = (mask.radius ?? 0.2) * 100
      return {
        background: 'rgba(0,0,0,0.92)',
        maskImage: `radial-gradient(circle at ${cx}% ${cy}%, transparent ${radius}%, black ${radius + 2}%)`,
        WebkitMaskImage: `radial-gradient(circle at ${cx}% ${cy}%, transparent ${radius}%, black ${radius + 2}%)`,
      }
    }
    default:
      return {}
  }
}

export function KarutaCard({ card, isExhausted, remaining, audioCount, claimedBy, onGrab }: KarutaCardProps) {
  const count = audioCount ?? card.audio_count ?? 1
  const left = remaining ?? count
  const showStack = count > 1 && left > 0

  const maskStyle = useMemo(() => {
    if (!card.mask || isExhausted || left <= 0) return null
    return buildMaskCSS(card.mask)
  }, [card.mask, isExhausted, left])

  return (
    <motion.div layout
      initial={{ opacity: 0, scale: 0.85, y: 8 }}
      animate={{ opacity: isExhausted ? 0.55 : 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.15, y: -40,
        rotate: Math.random() > 0.5 ? 12 : -12,
        transition: { duration: 0.35, ease: 'backIn' } }}
      whileHover={!isExhausted ? { y: -5, scale: 1.04, transition: { duration: 0.12 } } : undefined}
      whileTap={!isExhausted ? { scale: 0.96 } : undefined}
      onClick={() => onGrab?.(card.id)}
      className="relative overflow-visible select-none cursor-pointer"
      style={{ width: '100%', aspectRatio: '3/4' }}>

      {/* 堆叠底层（仅多音频牌显示） */}
      {showStack && left >= 3 && (
        <div className="absolute rounded-lg"
          style={{
            inset: 0,
            transform: 'translate(4px, 4px)',
            background: 'linear-gradient(160deg, var(--color-surface) 0%, var(--color-ink) 100%)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            opacity: 0.5,
          }} />
      )}
      {showStack && left >= 2 && (
        <div className="absolute rounded-lg"
          style={{
            inset: 0,
            transform: 'translate(2px, 2px)',
            background: 'linear-gradient(160deg, var(--color-surface) 0%, var(--color-surface) 100%)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            opacity: 0.7,
          }} />
      )}

      {/* 主卡面 */}
      <div className="absolute inset-0 rounded-lg overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, var(--color-surface) 0%, var(--color-surface) 50%, var(--color-ink) 100%)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}>

        {/* 封面图 */}
        {card.cover_url && (
          <img src={card.cover_url} alt=""
            className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        )}

        {/* 模糊牌面遮罩层 */}
        {maskStyle && (
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-300"
            style={maskStyle}
          />
        )}

        {/* 内层细框 */}
        <div className="absolute inset-[3px] rounded-md pointer-events-none"
          style={{ border: '1px solid rgba(var(--accent-primary),0.1)' }} />

        {/* 堆叠角标 */}
        {showStack && (
          <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-xs font-bold"
            style={{
              background: 'rgba(0,0,0,0.7)',
              color: 'var(--color-gold)',
              border: '1px solid rgba(var(--glow-color),0.4)',
              fontSize: '0.65rem',
            }}>
            ×{left}
          </div>
        )}

        {/* 已抢完遮罩 */}
        {isExhausted && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg"
            style={{ background: 'rgba(10,3,8,0.25)' }}>
            {claimedBy && claimedBy !== '无人' && (
              <span className="text-gold/50 font-serif text-center px-2 leading-tight"
                style={{ fontSize: 'clamp(0.5rem, 1.2vw, 0.7rem)' }}>
                {claimedBy}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

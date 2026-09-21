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

      {/* 堆叠底层（仅多音频牌显示）：纸色暗阶，营造牌摞厚度 */}
      {showStack && left >= 3 && (
        <div className="absolute rounded-xl"
          style={{
            inset: 0,
            transform: 'translate(4px, 4px)',
            background: 'linear-gradient(160deg, rgb(var(--color-card-paper-deep)) 0%, rgb(var(--color-card-paper)) 100%)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            opacity: 0.45,
          }} />
      )}
      {showStack && left >= 2 && (
        <div className="absolute rounded-xl"
          style={{
            inset: 0,
            transform: 'translate(2px, 2px)',
            background: 'linear-gradient(160deg, rgb(var(--color-card-paper-deep)) 0%, rgb(var(--color-card-paper)) 100%)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            opacity: 0.65,
          }} />
      )}

      {/* 主牌面：米白和纸 + 纸纹颗粒 + 轻微浮雕；被夺取时整体退色为残影 */}
      <div className="absolute inset-0 rounded-xl overflow-hidden"
        style={{
          background: `var(--washi-grain), linear-gradient(165deg, rgb(var(--color-card-paper)) 0%, rgb(var(--color-card-paper)) 55%, rgb(var(--color-card-paper-deep)) 100%)`,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(96,74,48,0.12)',
          filter: isExhausted ? 'grayscale(0.65) brightness(0.78)' : undefined,
          transition: 'filter 0.4s cubic-bezier(.4,0,.2,1)',
        }}>

        {/* 内嵌金色细框（真实歌牌的描金缘） */}
        <div className="absolute inset-[4px] rounded-lg pointer-events-none"
          style={{
            border: '1px solid rgb(var(--gold-foil)/ 0.45)',
            boxShadow: 'inset 0 0 12px rgb(var(--gold-foil)/ 0.07)',
          }} />

        {/* 封面图：纸面留白装裱——四周留纸边，下缘留题字区 */}
        <div className="absolute overflow-hidden rounded-[4px]"
          style={{
            left: '6.5%', right: '6.5%', top: '5.5%', bottom: '15%',
            boxShadow: '0 1px 3px rgba(40,20,10,0.35), inset 0 0 0 1px rgba(96,74,48,0.1)',
            background: 'rgb(var(--color-card-paper-deep))',
          }}>
          {card.cover_url && (
            <img src={card.cover_url} alt=""
              className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          )}

          {/* 模糊牌面遮罩层（题面隐藏玩法，位置与图区同步） */}
          {maskStyle && (
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-300"
              style={maskStyle}
            />
          )}
        </div>

        {/* 堆叠角标 */}
        {showStack && (
          <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-xs font-bold"
            style={{
              background: 'rgba(40,20,10,0.55)',
              color: 'rgb(var(--color-card-paper))',
              border: '1px solid rgb(var(--gold-foil)/ 0.4)',
              fontSize: '0.65rem',
            }}>
            ×{left}
          </div>
        )}

        {/* 已抢完：残影态——纸面退色 + 抢得者竖排题字（如落款） */}
        {isExhausted && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl"
            style={{ background: 'rgba(10,3,8,0.22)' }}>
            {claimedBy && claimedBy !== '无人' && (
              <span className="text-gold-foil/70 font-serif text-center px-2 leading-tight"
                style={{
                  fontSize: 'clamp(0.6rem, 1.3vw, 0.8rem)',
                  writingMode: 'vertical-rl',
                  textShadow: '0 0 8px rgb(var(--gold-foil)/ 0.35)',
                  letterSpacing: '0.15em',
                }}>
                {claimedBy}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

import { useEffect, useRef, type RefObject } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

interface GrabbedCard {
  id: number
  display_text: string
  cover_url: string
  hint_text: string
}

interface GameResult {
  user_id: number
  username: string
  score: number
  rank: number
  penalty_count?: number
  grabbed_cards?: GrabbedCard[]
}

interface GameOverProps {
  results: GameResult[]
  currentUserId: number
  lastCardWinnerId?: number | null
}

// 计算称号
function getTitles(results: GameResult[], lastCardWinnerId?: number | null): Map<number, string[]> {
  const titles = new Map<number, string[]>()
  const add = (uid: number, t: string) => {
    if (!titles.has(uid)) titles.set(uid, [])
    titles.get(uid)!.push(t)
  }

  // 世一网：抢到最后一张的人
  if (lastCardWinnerId) {
    add(lastCardWinnerId, '🌐 世一网')
  }

  // 抢错最多：penaltyCount 最高的人
  const maxPenalty = Math.max(...results.map(r => r.penalty_count ?? 0))
  if (maxPenalty > 0) {
    results.filter(r => (r.penalty_count ?? 0) === maxPenalty)
      .forEach(r => add(r.user_id, '🤦 手残选手'))
  }

  // 苦命鸳鸯：第二名和第三名（需要至少3人）
  if (results.length >= 3) {
    const rank2 = results.find(r => r.rank === 2)
    const rank3 = results.find(r => r.rank === 3)
    if (rank2) add(rank2.user_id, '💔 苦命鸳鸯')
    if (rank3) add(rank3.user_id, '💔 苦命鸳鸯')
  }

  return titles
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  color: string
  rotation: number
  rotationSpeed: number
}

const SAKURA_COLORS = ['#ffb7c5', '#ff8fab', '#ffc8d3', '#ff6b88', '#ffe4e8']

function useParticles(canvasRef: RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const particles: Particle[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Spawn initial particles
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight - window.innerHeight,
        vx: (Math.random() - 0.5) * 1.5,
        vy: Math.random() * 1.5 + 0.5,
        size: Math.random() * 8 + 4,
        opacity: Math.random() * 0.7 + 0.3,
        color: SAKURA_COLORS[Math.floor(Math.random() * SAKURA_COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.05,
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach((p) => {
        ctx.save()
        ctx.globalAlpha = p.opacity
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)

        // Draw petal shape
        ctx.beginPath()
        ctx.fillStyle = p.color
        ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2)
        ctx.fill()

        // Petal detail
        ctx.beginPath()
        ctx.strokeStyle = `${p.color}88`
        ctx.lineWidth = 0.5
        ctx.moveTo(-p.size, 0)
        ctx.lineTo(p.size, 0)
        ctx.stroke()

        ctx.restore()

        // Update
        p.x += p.vx
        p.y += p.vy
        p.rotation += p.rotationSpeed
        p.opacity -= 0.001

        // Respawn
        if (p.y > canvas.height + 20 || p.opacity <= 0) {
          p.x = Math.random() * canvas.width
          p.y = -20
          p.opacity = Math.random() * 0.7 + 0.3
          p.vy = Math.random() * 1.5 + 0.5
          p.vx = (Math.random() - 0.5) * 1.5
        }
      })

      animId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [canvasRef])
}

const RANK_STYLES: Record<number, { color: string; size: string; label: string }> = {
  1: { color: '#FFD700', size: 'text-4xl', label: '🥇 冠军！' },
  2: { color: '#C0C0C0', size: 'text-3xl', label: '🥈 亚军' },
  3: { color: '#CD7F32', size: 'text-2xl', label: '🥉 季军' },
}

export function GameOver({ results, currentUserId, lastCardWinnerId }: GameOverProps) {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useParticles(canvasRef)

  const sorted = [...results].sort((a, b) => a.rank - b.rank)
  const titles = getTitles(results, lastCardWinnerId)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 z-50 flex items-center justify-center washi-bg"
    >
      {/* Sakura canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 0 }}
      />

      {/* Content */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
        className="relative z-10 bg-ink-deep/95 border border-gold/30 rounded-2xl p-6 sm:p-8 max-w-lg w-full mx-4 shadow-gold-lg overflow-y-auto"
        style={{
          maxHeight: '90vh',
          boxShadow: '0 0 60px rgba(232,164,184,0.2), 0 20px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Title */}
        <div className="text-center mb-8">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="font-serif text-4xl sm:text-5xl font-bold text-gold-shimmer mb-2"
          >
            🌸 对局结束！精彩绝伦！
          </motion.h1>
          <p className="text-muted text-sm mb-3">大家都拼尽全力了！(*´▽`*) 辛苦啦～</p>
          <div className="h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
        </div>

        {/* Results */}
        <div className="space-y-3 mb-8">
          {sorted.map((r, i) => {
            const style = RANK_STYLES[r.rank] ?? { color: '#8a8fa8', size: 'text-xl', label: `第 ${r.rank}` }
            const isMe = r.user_id === currentUserId

            return (
              <motion.div
                key={r.user_id}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
                className={[
                  'flex items-center gap-4 p-3 rounded-lg border',
                  isMe
                    ? 'border-gold/40 bg-gold/5'
                    : 'border-border bg-surface',
                ].join(' ')}
              >
                <span
                  className={`font-serif font-bold ${style.size} w-12 text-center shrink-0`}
                  style={{ color: style.color, textShadow: `0 0 10px ${style.color}80` }}
                >
                  {style.label}
                </span>
                <div className={`font-sans flex-1 min-w-0 ${isMe ? 'text-gold font-medium' : 'text-white/80'}`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="truncate">{r.username}</span>
                    {isMe && <span className="text-gold/60 text-xs shrink-0">⭐ 就是我！</span>}
                  </div>
                  {/* 称号 */}
                  {titles.get(r.user_id)?.map((title, ti) => (
                    <motion.span key={ti}
                      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.8 + ti * 0.1 }}
                      className="inline-block text-xs mr-1 px-1.5 py-0.5 rounded-full font-sans font-normal mt-0.5"
                      style={{ background: 'rgba(232,164,184,0.12)', border: '1px solid rgba(232,164,184,0.25)', color: '#e8a4b8' }}>
                      {title}
                    </motion.span>
                  ))}
                </div>
                <span
                  className="font-bold font-sans text-xl tabular-nums"
                  style={{ color: style.color }}
                >
                  {r.score}
                  <span className="text-xs ml-1 opacity-60">分 🃏</span>
                </span>
              </motion.div>
            )
          })}
        </div>

        {/* 我抢到的牌 */}
        {(() => {
          const me = sorted.find(r => r.user_id === currentUserId)
          const myCards = me?.grabbed_cards ?? []
          return myCards.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.4 }}
              className="mb-6"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
                <span className="text-gold/70 text-xs font-serif shrink-0">
                  🌸 本局你抢到的 {myCards.length} 张牌
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-gold/20 via-transparent to-transparent" />
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}>
                {myCards.map(card => (
                  <motion.div key={card.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.9 + myCards.indexOf(card) * 0.05, ease: 'backOut' }}
                    className="relative rounded-lg overflow-hidden"
                    style={{ aspectRatio: '3/4', background: '#3d1525', border: '1px solid rgba(232,164,184,0.2)' }}
                    title={card.display_text || card.hint_text || ''}
                  >
                    {card.cover_url ? (
                      <img src={card.cover_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-gold/20 font-serif text-lg">歌</span>
                      </div>
                    )}
                    {(card.display_text || card.hint_text) && (
                      <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-center"
                        style={{ background: 'linear-gradient(to top, rgba(20,5,15,0.95), transparent)' }}>
                        <p className="text-white/70 leading-tight" style={{ fontSize: '0.45rem' }}>
                          {card.display_text !== '—' ? card.display_text : card.hint_text}
                        </p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : null
        })()}

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.4 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <button
            onClick={() => navigate('/rooms/new')}
            className="btn-gold flex-1 text-center transition-all duration-200 hover:scale-[1.03]"
          >
            再战一次！ヽ(°〇°)ﾉ
          </button>
          <button
            onClick={() => navigate('/')}
            className="btn-outline flex-1 text-center transition-all duration-200 hover:scale-[1.03]"
          >
            回家休息一下 (－ω－ ) zzZ
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

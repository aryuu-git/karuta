import { useState, useEffect, useRef, type RefObject } from 'react'
import { motion } from 'framer-motion'
import type { Room, RoomPlayer } from '../api/types'
import { api } from '../api/client'

interface WaitingLobbyProps {
  room: Room
  players: RoomPlayer[]
  currentUserId: number
  onRoleChange?: (isSpectator: boolean) => void
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  opacity: number
  size: number
}

function useAmbientParticles(canvasRef: RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const particles: Particle[] = []

    const resize = () => {
      if (!canvas.parentElement) return
      canvas.width = canvas.parentElement.offsetWidth
      canvas.height = canvas.parentElement.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < 30; i++) {
      particles.push({
        x: Math.random() * (canvas.width || 800),
        y: Math.random() * (canvas.height || 400),
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(Math.random() * 0.5 + 0.1),
        opacity: Math.random() * 0.4 + 0.05,
        size: Math.random() * 3 + 1,
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach((p) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(232,164,184,${p.opacity})`
        ctx.fill()

        p.x += p.vx
        p.y += p.vy
        p.opacity -= 0.001

        if (p.y < -10 || p.opacity <= 0) {
          p.x = Math.random() * canvas.width
          p.y = canvas.height + 10
          p.opacity = Math.random() * 0.4 + 0.05
          p.vy = -(Math.random() * 0.5 + 0.1)
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

export function WaitingLobby({ room, players, currentUserId, onRoleChange }: WaitingLobbyProps) {
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSpectator, setIsSpectator] = useState(false)
  const [togglingRole, setTogglingRole] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useAmbientParticles(canvasRef)

  const isHost = room.host_id === currentUserId

  const toggleSpectate = async () => {
    setTogglingRole(true)
    try {
      const res = await api.rooms.spectate(room.id, !isSpectator)
      const newIsSpectator = res.role === 'spectator'
      setIsSpectator(newIsSpectator)
      onRoleChange?.(newIsSpectator)
    } catch { }
    finally { setTogglingRole(false) }
  }

  const copyCode = async () => {
    await navigator.clipboard.writeText(room.code).catch(() => null)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleStart = async () => {
    setStarting(true)
    setError(null)
    try {
      await api.rooms.start(room.id)
      // 不直接切换 UI，等待 WS room_state 事件（status=reading）触发切换
    } catch (e) {
      setError(e instanceof Error ? e.message : '出错啦 (>_<) 再试试吧～')
      setStarting(false)
    }
  }

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[60vh] p-8 overflow-hidden">
      {/* Ambient particles */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: 0.6 }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 max-w-md w-full">
        {/* Room code */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <p className="text-muted text-sm font-sans mb-2 tracking-widest">🌸 把邀请码发给战友，一起来抢！(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</p>
          <div
            className="font-serif text-5xl sm:text-6xl font-bold tracking-[0.2em] text-gold cursor-pointer select-all"
            style={{ textShadow: '0 0 30px rgba(232,164,184,0.5)' }}
            onClick={copyCode}
          >
            {room.code}
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: copied ? 1 : 0 }}
            className="text-green-400 text-xs mt-2"
          >
            复制成功 ✓ 去分享吧！(◕‿◕)
          </motion.p>
          <button
            onClick={copyCode}
            className="mt-3 text-muted text-xs hover:text-gold transition-all duration-200 underline underline-offset-2 hover:scale-110"
          >
            点击复制邀请码 (｡•̀ᴗ-)✧
          </button>
        </motion.div>

        {/* Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Players */}
        <div className="w-full">
          <p className="text-muted text-xs tracking-widest mb-3 text-center">
            ✦ 集结中的勇士们 · 已到场 {players.length} 人 (ง •̀_•́)ง ✦
          </p>
          <div className="grid grid-cols-2 gap-2">
            {players.map((player, i) => (
              <motion.div
                key={player.user_id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={[
                  'flex items-center gap-2 px-3 py-2 rounded-lg border',
                  player.user_id === currentUserId
                    ? 'border-gold/40 bg-gold/5'
                    : 'border-border bg-surface',
                ].join(' ')}
              >
                {/* Avatar placeholder */}
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                  style={{
                    background: 'linear-gradient(135deg, #4a1a30, #3d1525)',
                    border: '1px solid rgba(232,164,184,0.3)',
                    color: '#e8a4b8',
                  }}
                >
                  {player.username.charAt(0).toUpperCase()}
                </div>
                <span
                  className={`text-sm truncate ${
                    player.user_id === currentUserId ? 'text-gold' : 'text-white/80'
                  }`}
                >
                  {player.username}
                  {player.user_id === room.host_id && (
                    <span className="text-crimson text-xs ml-1">👑</span>
                  )}
                  {(player as any).role === 'spectator' && (
                    <span className="text-xs ml-1" style={{ color: 'rgba(128,90,213,0.7)' }}>👁旁观</span>
                  )}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-crimson text-sm text-center bg-crimson/10 border border-crimson/30 rounded-lg px-4 py-2">
            😣 {error}
          </p>
        )}

        {/* 旁观切换（非房主可切换） */}
        {!isHost && (
          <div className="flex justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={toggleSpectate}
              disabled={togglingRole}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-50"
              style={{
                background: isSpectator ? 'rgba(128,90,213,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isSpectator ? 'rgba(128,90,213,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: isSpectator ? '#a78bfa' : 'rgba(255,255,255,0.5)',
              }}>
              {isSpectator ? '👁 旁观中（点击参与游戏）' : '🎮 参与游戏（点击切换旁观）'}
            </motion.button>
          </div>
        )}

        {/* Start button (host only) */}
        {isHost ? (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleStart}
            disabled={starting || players.length < 1}
            className="btn-gold w-full text-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            style={{ animation: !starting ? 'glowPulse 2s ease-in-out infinite' : 'none' }}
          >
            {starting ? '集结号角吹响中… (｡･ω･｡)' : '「全员集合！开战！」(ง •̀_•́)ง'}
          </motion.button>
        ) : (
          <div className="text-center">
            <p className="text-muted text-sm font-serif tracking-widest animate-pulse mb-1">
              等待大将军的号令… (´。• ω •。`)
            </p>
            <p className="text-muted/50 text-xs">房主正在磨刀霍霍…</p>
          </div>
        )}
      </div>
    </div>
  )
}

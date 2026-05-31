import { useState, useEffect, useRef, type RefObject } from 'react'
import { motion } from 'framer-motion'
import type { Room, RoomPlayer } from '../api/types'
import { api } from '../api/client'
import { Avatar } from './Avatar'

interface DuelSeats {
  seat1: { user_id: number; username: string } | null
  seat2: { user_id: number; username: string } | null
}

interface WaitingLobbyProps {
  room: Room
  players: RoomPlayer[]
  currentUserId: number
  onRoleChange?: (isSpectator: boolean) => void
  onKick?: (userId: number) => void
  preloadProgress?: { loaded: number; total: number } | null
  duelSeats?: DuelSeats
  onClaimSeat?: (seat: 1 | 2) => void
  onLeaveSeat?: () => void
  onKickSeat?: (userId: number) => void
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

    const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || '232,164,184'

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach((p) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${accentRgb},${p.opacity})`
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

export function WaitingLobby({ room, players, currentUserId, onRoleChange, onKick, preloadProgress, duelSeats, onClaimSeat, onLeaveSeat, onKickSeat }: WaitingLobbyProps) {
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSpectator, setIsSpectator] = useState(false)
  const [togglingRole, setTogglingRole] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useAmbientParticles(canvasRef)

  const isHost = room.host_id === currentUserId

  const preloadPercent = preloadProgress
    ? Math.round((preloadProgress.loaded / preloadProgress.total) * 100)
    : 0
  const preloadDone = preloadProgress && preloadProgress.loaded >= preloadProgress.total

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

    // 解锁音频：满足浏览器自动播放策略
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      if (ctx.state === 'suspended') await ctx.resume()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      gain.gain.value = 0.01
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(0)
      osc.stop(0.05)
    } catch { /* ignore */ }

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
          <p className="text-pink-300/50 text-sm font-serif mb-2 tracking-widest italic">🌸 将此令牌传递给战友，共赴命运之战！✧</p>
          <div
            className="font-serif text-5xl sm:text-6xl font-bold tracking-[0.2em] text-gold cursor-pointer select-all"
            style={{ textShadow: '0 0 30px rgba(var(--accent-primary),0.5)' }}
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

        {/* 房间模式信息 */}
        {room.mask_enabled && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gold/20 bg-gold/5">
            <span className="text-gold text-sm">🎭</span>
            <span className="text-sm text-white/80">
              模糊牌面：{room.mask_difficulty === 'easy' ? '简单' : room.mask_difficulty === 'hard' ? '困难' : '普通'}难度
            </span>
          </div>
        )}

        {/* Duel Seats */}
        {room.mode === 'duel' && duelSeats && (
          <div className="w-full">
            <p className="text-pink-300/40 text-xs tracking-widest mb-3 text-center font-serif">
              ⚔ 选手席位 · 点击入座 ⚔
            </p>
            <div className="grid grid-cols-2 gap-3">
              {([1, 2] as const).map((seatNum) => {
                const seat = seatNum === 1 ? duelSeats.seat1 : duelSeats.seat2
                const isMySeat = seat?.user_id === currentUserId
                return (
                  <motion.div
                    key={seatNum}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: seatNum * 0.1 }}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border"
                    style={{
                      background: seat
                        ? 'rgba(var(--accent-primary),0.08)'
                        : 'rgba(255,255,255,0.02)',
                      border: seat
                        ? '1px solid rgba(var(--accent-primary),0.3)'
                        : '1px dashed rgba(255,255,255,0.15)',
                    }}
                  >
                    <span className="text-xs text-muted font-serif">
                      P{seatNum}
                    </span>
                    {seat ? (
                      <>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                          style={{
                            background: 'linear-gradient(135deg, rgba(var(--accent-primary),0.2), rgba(var(--accent-primary),0.05))',
                            border: '2px solid rgba(var(--accent-primary),0.4)',
                            color: 'var(--color-gold)',
                          }}>
                          {seat.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-gold font-serif truncate max-w-full">
                          {seat.username}
                        </span>
                        {isMySeat && (
                          <button onClick={onLeaveSeat}
                            className="text-xs text-muted hover:text-crimson transition-colors">
                            离开席位
                          </button>
                        )}
                        {!isMySeat && isHost && onKickSeat && (
                          <button onClick={() => onKickSeat(seat.user_id)}
                            className="text-xs text-muted hover:text-crimson transition-colors">
                            踢下席位
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center border border-dashed border-white/20">
                          <span className="text-white/20 text-lg">?</span>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onClaimSeat?.(seatNum)}
                          className="text-xs px-3 py-1 rounded-lg transition-all"
                          style={{
                            background: 'rgba(var(--accent-primary),0.1)',
                            border: '1px solid rgba(var(--accent-primary),0.3)',
                            color: 'var(--color-gold)',
                          }}>
                          入座
                        </motion.button>
                      </>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Players */}
        <div className="w-full">
          <p className="text-pink-300/40 text-xs tracking-widest mb-3 text-center font-serif">
            {room.mode === 'duel' ? '✦ 旁观席 ✦' : `✦ 集结中的勇者们 · 已到场 ${players.length} 位英杰 ✦`}
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
                {/* Avatar */}
                <Avatar username={player.username} avatarUrl={(player as any).avatar_url} size={24} />
                <span
                  className={`text-sm truncate flex-1 ${
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
                {onKick && currentUserId === room.host_id && player.user_id !== currentUserId && (
                  <button onClick={() => onKick(player.user_id)}
                    className="text-xs text-muted/40 hover:text-crimson transition-colors shrink-0 px-1"
                    title="踢出房间">
                    ✕
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* 预加载进度条 */}
        {preloadProgress && (
          <div className="w-full">
            <div className="flex items-center justify-between text-xs mb-1.5">
              {preloadDone ? (
                <span className="text-green-400/70 tracking-widest">✓ 全资源加载完成，可以开战了！(ﾉ◕ヮ◕)ﾉ</span>
              ) : (
                <span className="text-muted">🎵 加载牌组资源中…</span>
              )}
              <span className="text-muted">{preloadProgress.loaded} / {preloadProgress.total}</span>
            </div>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, var(--color-gold), var(--color-gold-dark))' }}
                initial={{ width: 0 }}
                animate={{ width: `${preloadPercent}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-crimson text-sm text-center bg-crimson/10 border border-crimson/30 rounded-lg px-4 py-2">
            😣 {error}
          </p>
        )}

        {/* 旁观切换（非房主可切换，duel 模式通过席位管理） */}
        {!isHost && room.mode !== 'duel' && room.status === 'waiting' && (
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
            disabled={starting || players.length < 1 || (room.mode === 'duel' && (!duelSeats?.seat1 || !duelSeats?.seat2))}
            className="btn-gold w-full text-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            style={{ animation: !starting ? 'glowPulse 2s ease-in-out infinite' : 'none' }}
          >
            {starting ? '号角响彻天际… (｡･ω･｡)' : '「全军出击！命运之战，开始！」(ง •̀_•́)ง'}
          </motion.button>
        ) : (
          <div className="text-center">
            <p className="text-pink-300/50 text-sm font-serif tracking-widest animate-pulse mb-1">
              等待大将军的号令… (´。• ω •。`)
            </p>
            <p className="text-pink-300/30 text-xs font-serif italic">将军正在磨刀霍霍 ♪</p>
          </div>
        )}
      </div>
    </div>
  )
}

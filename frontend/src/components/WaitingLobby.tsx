import { useState, useEffect, useRef, type RefObject } from 'react'
import { motion } from 'framer-motion'
import type { Room, RoomPlayer } from '../api/types'
import { api } from '../api/client'
import { Avatar } from './Avatar'
import { useLocation } from 'react-router-dom'
import { Button } from './ui'
import { InvitePanel } from '../features/play/InvitePanel'
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
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSpectator, setIsSpectator] = useState(false)
  const [togglingRole, setTogglingRole] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useAmbientParticles(canvasRef)

  // rematch 落地标记（useRematch 导航时写入）：邀请面板自动高亮房间码
  const location = useLocation()
  const focusInvite = (location.state as { focusInvite?: boolean } | null)?.focusInvite === true

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

  const handleStart = async () => {
    setStarting(true)
    setError(null)

    // 解锁音频：满足浏览器自动播放策略
    try {
      // Safari 旧版仅暴露带前缀的 webkitAudioContext（非标 API）；结构化断言为 AudioContext 同签名构造器
      const legacyWindow = window as unknown as { webkitAudioContext: typeof AudioContext }
      const AudioCtor = window.AudioContext || legacyWindow.webkitAudioContext
      const ctx = new AudioCtor()
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
      setError(e instanceof Error ? e.message : '开局失败，请重试')
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
        {/* 邀请区：复用 InvitePanel（大字房间码 + 复制链接/复制码 + 系统分享）
            rematch 落地时携带 focusInvite state → 码自动高亮便于直接复制 */}
        <InvitePanel code={room.code} autoFocus={focusInvite} className="w-full" />

        {/* 房间模式信息 */}
        {room.mask_enabled && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gold/20 bg-gold/5">
            <span className="text-gold text-caption">🎭</span>
            <span className="text-caption text-body-text/80">
              模糊牌面：{room.mask_difficulty === 'easy' ? '简单' : room.mask_difficulty === 'hard' ? '困难' : '普通'}难度
            </span>
          </div>
        )}

        {/* Duel Seats */}
        {room.mode === 'duel' && duelSeats && (
          <div className="w-full">
            <p className="text-gold/40 text-tiny tracking-widest mb-3 text-center font-serif">
              选手席位 · 点击入座
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
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${seat ? 'bg-gold/10 border-gold/30' : 'bg-body-text/5 border-dashed border-body-text/15'}`}
                  >
                    <span className="text-tiny text-muted font-serif">
                      P{seatNum}
                    </span>
                    {seat ? (
                      <>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold border-2 border-gold/40 text-gold"
                          style={{
                            background: 'linear-gradient(135deg, rgb(var(--accent-primary)/ 0.2), rgb(var(--accent-primary)/ 0.05))',
                          }}>
                          {seat.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-caption text-gold font-serif truncate max-w-full">
                          {seat.username}
                        </span>
                        {isMySeat && (
                          <button onClick={onLeaveSeat}
                            className="text-tiny text-muted hover:text-crimson transition-colors">
                            离开席位
                          </button>
                        )}
                        {!isMySeat && isHost && onKickSeat && (
                          <button onClick={() => onKickSeat(seat.user_id)}
                            className="text-tiny text-muted hover:text-crimson transition-colors">
                            踢下席位
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center border border-dashed border-body-text/20">
                          <span className="text-body-text/20 text-lg">?</span>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onClaimSeat?.(seatNum)}
                          className="text-tiny px-3 py-1 rounded-lg transition-all bg-gold/10 border border-gold/30 text-gold">
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
          <p className="text-gold/40 text-tiny tracking-widest mb-3 text-center font-serif">
            {room.mode === 'duel' ? '旁观席' : `已到场 ${players.length} 位`}
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
                <Avatar username={player.username} avatarUrl={player.avatar_url} size={24} />
                <span
                  className={`text-caption truncate flex-1 ${
                    player.user_id === currentUserId ? 'text-gold' : 'text-body-text/80'
                  }`}
                >
                  {player.username}
                  {player.user_id === room.host_id && (
                    <span className="text-crimson text-tiny ml-1">👑</span>
                  )}
                  {player.role === 'spectator' && (
                    <span className="text-tiny ml-1 text-info/70">👁旁观</span>
                  )}
                </span>
                {onKick && currentUserId === room.host_id && player.user_id !== currentUserId && (
                  <button onClick={() => onKick(player.user_id)}
                    className="text-tiny text-muted/40 hover:text-crimson transition-colors shrink-0 px-1"
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
            <div className="flex items-center justify-between text-tiny mb-1.5">
              {preloadDone ? (
                <span className="text-success/70 tracking-widest">✓ 资源加载完成</span>
              ) : (
                <span className="text-muted">正在加载牌组资源…</span>
              )}
              <span className="text-muted">{preloadProgress.loaded} / {preloadProgress.total}</span>
            </div>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, rgb(var(--color-gold)), rgb(var(--color-gold-dark)))' }}
                initial={{ width: 0 }}
                animate={{ width: `${preloadPercent}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-crimson text-caption text-center bg-crimson/10 border border-crimson/30 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        {/* 旁观切换（非房主可切换，duel 模式通过席位管理） */}
        {!isHost && room.mode !== 'duel' && room.status === 'waiting' && (
          <div className="flex justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={toggleSpectate}
              disabled={togglingRole}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-caption transition-all disabled:opacity-50 border ${isSpectator ? 'bg-info/15 border-info/50 text-info' : 'bg-body-text/5 border-body-text/10 text-body-text/50'}`}>
              {isSpectator ? '旁观中（点击参与游戏）' : '参与游戏（点击切换旁观）'}
            </motion.button>
          </div>
        )}

        {/* Start button (host only) */}
        {isHost ? (
          <Button
            onClick={handleStart}
            loading={starting}
            disabled={players.length < 1 || (room.mode === 'duel' && (!duelSeats?.seat1 || !duelSeats?.seat2))}
            size="lg"
            className="w-full"
            style={{ animation: !starting ? 'glowPulse 2s ease-in-out infinite' : 'none' }}
          >
            开始游戏
          </Button>
        ) : (
          <div className="text-center">
            <p className="text-gold/50 text-caption font-serif tracking-widest animate-pulse mb-1">
              等待房主开始游戏
            </p>
            <p className="text-gold/30 text-tiny font-serif italic">房主正在准备中</p>
          </div>
        )}
      </div>
    </div>
  )
}

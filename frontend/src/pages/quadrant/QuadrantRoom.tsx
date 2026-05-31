import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../../components/Layout'
import { useAuth } from '../../hooks/useAuth'
import { useQuadrantSocket } from '../../hooks/useQuadrantSocket'
import { quadrantApi, type QRoom, type QPlayer, type QWSEvent } from '../../api/quadrant'
import { QuadrantGame } from './QuadrantGame'
import { QuadrantJudge } from './QuadrantJudge'

export function QuadrantRoom() {
  const { id } = useParams<{ id: string }>()
  const roomId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()

  const [room, setRoom] = useState<QRoom | null>(null)
  const [players, setPlayers] = useState<QPlayer[]>([])
  const [gameActive, setGameActive] = useState(false)
  const [gameState, setGameState] = useState<any>(null)

  useEffect(() => {
    quadrantApi.rooms.get(roomId).then(state => {
      setRoom(state.room)
      setPlayers(state.players)
      if (state.room.status === 'playing' || state.room.status === 'preparing') {
        setGameActive(true)
      }
    }).catch(() => navigate('/quadrant'))
  }, [roomId, navigate])

  const handleEvent = useCallback((e: QWSEvent) => {
    switch (e.type) {
      case 'player_joined':
        setPlayers(prev => {
          if (prev.find(p => p.user_id === e.user_id)) return prev
          return [...prev, { room_id: roomId, user_id: e.user_id, username: e.username, role: e.role, score: 0, is_ready: false, joined_at: 0 }]
        })
        break
      case 'player_offline':
        setPlayers(prev => prev.filter(p => p.user_id !== e.user_id))
        break
      case 'player_ready':
        setPlayers(prev => prev.map(p => p.user_id === e.user_id ? { ...p, is_ready: e.ready } : p))
        break
      case 'game_start':
        setGameActive(true)
        setGameState(e)
        setRoom(prev => prev ? { ...prev, status: 'playing' } : prev)
        break
      case 'preparing':
        setGameActive(true)
        setGameState(e)
        setRoom(prev => prev ? { ...prev, status: 'preparing' } : prev)
        break
      case 'game_state':
        setGameActive(true)
        setGameState(e)
        break
      case 'room_closed':
        navigate('/quadrant')
        break
      default:
        setGameState(e)
        break
    }
  }, [roomId, navigate])

  const { send, connected } = useQuadrantSocket(roomId, handleEvent)

  const isHost = user?.id === room?.host_id
  const isJudge = user?.id === room?.judge_id

  const handleStart = async () => {
    try {
      await quadrantApi.rooms.start(roomId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start')
    }
  }

  const handleReady = () => {
    quadrantApi.rooms.ready(roomId, true)
  }

  if (!room) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }}
            className="text-gold/50 font-serif">传送中…</motion.div>
        </div>
      </Layout>
    )
  }

  if (gameActive) {
    if (isJudge && room.status === 'preparing') {
      return <QuadrantJudge room={room} send={send} connected={connected} onEvent={handleEvent} latestEvent={gameState} />
    }
    return <QuadrantGame room={room} players={players} send={send} connected={connected} onEvent={handleEvent} latestEvent={gameState} isJudge={isJudge} />
  }

  // --- Waiting Lobby ---
  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <h1 className="font-serif text-xl text-gold font-bold">{room.name || '猜象限'}</h1>
            <p className="text-muted/40 text-xs font-serif italic mt-0.5">等待勇者集结中…</p>
          </div>
          <div className="flex items-center gap-2">
            <motion.span
              animate={{ scale: connected ? [1, 1.3, 1] : 1 }}
              transition={{ repeat: connected ? Infinity : 0, duration: 2 }}
              className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`}
            />
            <span className="text-xs text-muted/40 font-mono">#{room.code}</span>
          </div>
        </motion.div>

        {/* Room config */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl p-4 mb-5"
          style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3), rgba(var(--accent-bg-mid),0.6))', border: '1px solid rgba(var(--accent-primary),0.1)' }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="text-center">
              <p className="text-muted/40">模式</p>
              <p className="text-white/70 font-serif mt-0.5">{room.judge_id > 0 ? '👑 裁判' : '📚 题库'}</p>
            </div>
            <div className="text-center">
              <p className="text-muted/40">人数</p>
              <p className="text-white/70 font-serif mt-0.5">{players.length}/{room.max_players}</p>
            </div>
            <div className="text-center">
              <p className="text-muted/40">题数</p>
              <p className="text-white/70 font-serif mt-0.5">{room.rounds_total}</p>
            </div>
            <div className="text-center">
              <p className="text-muted/40">候选标签</p>
              <p className="text-white/70 font-serif mt-0.5">{room.candidate_count}个</p>
            </div>
          </div>
        </motion.div>

        {/* Players */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl overflow-hidden mb-6"
          style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}
        >
          <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(var(--accent-primary),0.08)' }}>
            <h2 className="font-serif text-sm text-gold/80">⚔️ 参战者</h2>
          </div>
          <div className="p-3 space-y-1.5">
            <AnimatePresence>
              {players.map(p => (
                <motion.div key={p.user_id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{ background: 'rgba(var(--accent-primary),0.04)', border: '1px solid rgba(var(--accent-primary),0.06)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-white/80 text-sm font-serif">{p.username || `User#${p.user_id}`}</span>
                    {p.user_id === room.host_id && <span className="text-[10px] text-gold/70 font-serif">房主</span>}
                    {p.role === 'judge' && <span className="text-[10px] text-purple-300/70 font-serif">👑</span>}
                    {p.role === 'spectator' && <span className="text-[10px] text-muted/50 font-serif">观战</span>}
                  </div>
                  <motion.span
                    animate={p.is_ready ? { scale: [1, 1.2, 1] } : {}}
                    className={`text-xs font-serif ${p.is_ready ? 'text-green-400' : 'text-muted/30'}`}>
                    {p.is_ready ? '✓ 就绪' : '…'}
                  </motion.span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex gap-3"
        >
          {!isHost && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleReady}
              className="flex-1 py-3 rounded-xl font-serif text-sm transition-all shadow-lg"
              style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: 'rgb(74,222,128)' }}>
              ✓ 准备就绪
            </motion.button>
          )}
          {isHost && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleStart}
              className="btn-gold flex-1 py-3 text-sm shadow-lg shadow-gold/20">
              ⚡ 开始游戏
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/quadrant')}
            className="px-5 py-3 rounded-xl text-muted/50 font-serif text-sm transition-colors hover:text-muted/80"
            style={{ border: '1px solid rgba(var(--accent-primary),0.1)' }}>
            离开
          </motion.button>
        </motion.div>
      </div>
    </Layout>
  )
}

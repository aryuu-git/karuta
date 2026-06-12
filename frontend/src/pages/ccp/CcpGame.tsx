import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../../components/Layout'
import { useAuth } from '../../hooks/useAuth'
import { useCcpSocket, type CcpWSEvent } from '../../hooks/useCcpSocket'
import { ccpApi, type CcpRoom, type CcpPlayer, type CcpGameState, type RoomImageInfo } from '../../api/ccp'
import { useCcpToast } from './useCcpToast'
import { CcpImage } from './CcpImage'

export function CcpGame() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast, ToastView } = useCcpToast()

  const [room, setRoom] = useState<CcpRoom | null>(null)
  const [players, setPlayers] = useState<CcpPlayer[]>([])
  const [images, setImages] = useState<RoomImageInfo[]>([])
  const [gameState, setGameState] = useState<CcpGameState | null>(null)
  const [showGuessModal, setShowGuessModal] = useState(false)
  const [guessWord, setGuessWord] = useState('')
  const [gameError, setGameError] = useState('')
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [loading, setLoading] = useState(true)
  const guessInputRef = useRef<HTMLInputElement>(null)

  // 加载游戏状态
  useEffect(() => {
    if (!code) return
    if (room && gameState) { setLoading(false); return; }
    ccpApi.games.getState(code).then(state => {
      setRoom(state.room)
      setPlayers(state.players)
      setImages(state.images)
      if (state.game_state) setGameState(state.game_state)
    }).catch(() => navigate('/ccp')).finally(() => setLoading(false))
  }, [code, navigate, room, gameState])

  // 轮次结束后跳转结算
  useEffect(() => {
    if (gameState?.status === 'completed') {
      setTimeout(() => navigate(`/ccp/result/${code}`), 2000)
    }
  }, [gameState?.status, code, navigate])

  // WebSocket 事件处理
  const handleEvent = useCallback((e: CcpWSEvent) => {
    switch (e.type) {
      case 'game_state':
        if (e.game_state) setGameState(e.game_state as CcpGameState)
        if (e.room) setRoom(e.room as CcpRoom)
        if (e.images) setImages(e.images as RoomImageInfo[])
        if (e.players) setPlayers(e.players as CcpPlayer[])
        break
      case 'action_result':
        if (e.game_state) setGameState(e.game_state as CcpGameState)
        if (e.room) setRoom(e.room as CcpRoom)
        if (e.images) setImages(e.images as RoomImageInfo[])
        if (e.players) setPlayers(e.players as CcpPlayer[])
        setGameError('')
        break
      case 'room_update':
        if (e.room) setRoom(e.room as CcpRoom)
        if (e.players) setPlayers(e.players as CcpPlayer[])
        if (e.images) setImages(e.images as RoomImageInfo[])
        break
      case 'player_joined':
        setPlayers(prev => {
          if (prev.find(p => p.user_id === (e as any).user_id)) return prev
          return [...prev, {
            room_id: code || '', user_id: (e as any).user_id,
            username: (e as any).username || '', avatar_url: '',
            is_host: false, is_ready: false, score: 0, guess_count: 0, joined_at: 0,
          }]
        })
        break
      case 'player_offline':
        // 不移除，只标记（通过 players 的在线状态在 UI 中处理）
        break
      case 'room_closed':
        navigate('/ccp')
        break
    }
  }, [navigate, code])

  const { send } = useCcpSocket(code || '', handleEvent)

  // 游戏操作
  const handleReveal = (tileIndex: number) => {
    send({ type: 'reveal', data: { tile_index: tileIndex } })
  }

  const handleGuess = () => {
    if (!guessWord.trim()) {
      showToast('请输入答案~', 'info')
      return
    }
    send({ type: 'guess', data: { word: guessWord } })
    setGuessWord('')
    setShowGuessModal(false)
  }

  const handleJudge = (correct: boolean) => {
    send({ type: 'judge', data: { correct, guess_id: gameState?.pending_guess?.id } })
  }

  const handleSkipRound = () => { send({ type: 'skip_round', data: {} }) }
  const handleReduceBlur = () => { send({ type: 'reduce_blur', data: {} }) }
  const handleIncreaseBlur = () => { send({ type: 'increase_blur', data: {} }) }

  const handleEndGame = async () => {
    if (!code) return
    try { await ccpApi.games.endGame(code) } catch {}
    navigate(`/ccp/result/${code}`)
  }

  if (loading || !room || !gameState) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }}
            className="text-gold/50 font-serif">加载中…</motion.div>
        </div>
      </Layout>
    )
  }

  const isHost = user?.id === room.host_user_id
  const curImg = images[gameState.current_image_index]?.image_url || ''
  const curUserId = gameState.player_order[gameState.current_player_index]
  const curPlayer = players.find(p => p.user_id === curUserId)
  const isMyTurn = user?.id === curUserId
  const grid = room.grid_size
  const total = grid * grid
  const pg = gameState.pending_guess
  const locked = !!pg

  // ========== 裁判视图 ==========
  if (isHost && room.judge_mode === 'judge') {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* Top bar */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-3 mb-4 flex items-center justify-between"
            style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3), rgba(var(--accent-bg-mid),0.6))', border: '1px solid rgba(var(--accent-primary),0.1)' }}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-serif text-gold font-bold">✨ 第 {gameState.current_round}/{gameState.max_rounds} 轮</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-serif"
                style={{ background: 'rgba(var(--accent-primary),0.12)', border: '1px solid rgba(var(--accent-primary),0.25)', color: 'rgba(var(--accent-primary),1)' }}>⚖️ 裁判模式</span>
              {locked && <span className="px-2 py-0.5 bg-crimson/10 text-crimson border border-crimson/25 rounded-full text-[10px] font-serif animate-pulse">有待判定</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSkipRound}
                className="px-3 py-1.5 rounded-xl font-serif text-xs transition-colors"
                style={{ background: 'rgba(var(--accent-primary),0.08)', color: 'rgba(var(--accent-primary),0.9)' }}>跳过本轮</button>
              <button onClick={() => setShowLeaveConfirm(true)}
                className="px-3 py-1.5 text-muted/40 text-xs rounded-xl hover:text-crimson transition-colors">退出</button>
            </div>
          </motion.div>

          {gameError && <div className="text-crimson bg-crimson/10 border border-crimson/20 px-4 py-2 rounded-xl text-xs mb-4">{gameError}</div>}

          <div className="grid lg:grid-cols-3 gap-4">
            {/* CG + Player view */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
                <h2 className="font-serif text-sm text-gold/80 mb-3">📷 当前 CG</h2>
                {curImg && <CcpImage src={curImg} className="w-full max-h-[35vh] rounded-xl shadow-md mb-3" alt="CG" />}
                <div className="bg-black/20 rounded-xl p-2">
                  <p className="text-[10px] text-muted/40 font-serif mb-1">👁️ 玩家视角</p>
                  <div className="grid gap-1 mx-auto" style={{ gridTemplateColumns: `repeat(${grid},1fr)`, maxWidth: '300px' }}>
                    {Array.from({ length: total }).map((_, i) => {
                      const rev = gameState.revealed_tiles.includes(i)
                      const row = Math.floor(i / grid), col = i % grid
                      return (
                        <div key={i} className="aspect-square rounded-lg overflow-hidden relative"
                          style={rev ? { backgroundImage: `url(${curImg})`, backgroundSize: `${grid * 100}%`, backgroundPosition: `${col / (grid - 1) * 100}% ${row / (grid - 1) * 100}%` } : { background: 'rgba(255,255,255,0.05)' }}>
                          {rev && room.difficulty === 'blur' && (
                            <div className="absolute inset-0" style={{ backdropFilter: `blur(${gameState.current_blur_level * 8}px)`, WebkitBackdropFilter: `blur(${gameState.current_blur_level * 8}px)` }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {room.difficulty === 'blur' && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[10px] text-muted/40">模糊度</span>
                    <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gold/50 transition-all" style={{ width: `${gameState.current_blur_level / room.blur_level * 100}%` }} />
                    </div>
                    <span className="text-xs font-serif text-gold">{gameState.current_blur_level}/{room.blur_level}</span>
                    <button onClick={handleReduceBlur} className="px-2 py-1 bg-white/5 text-muted/60 rounded-lg text-[10px] hover:bg-white/10">降低</button>
                    <button onClick={handleIncreaseBlur} className="px-2 py-1 bg-white/5 text-muted/60 rounded-lg text-[10px] hover:bg-white/10">增加</button>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar: Players + Rankings + Logs */}
            <div className="space-y-3">
              <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
                <h2 className="font-serif text-sm text-gold/80 mb-3">👥 玩家状态</h2>
                <div className="space-y-1.5">
                  {players.filter(p => !p.is_host).map(p => (
                    <div key={p.user_id} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${p.user_id === curUserId ? 'bg-gold/5 ring-1 ring-gold/20' : ''}`}>
                      <span className="flex-1 font-serif text-xs truncate">{p.username || `User#${p.user_id}`}</span>
                      <span className="text-[10px] text-muted/40">余{room.max_guesses - p.guess_count}</span>
                      <span className="font-serif text-xs text-gold">{p.score}分</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
                <h2 className="font-serif text-sm text-gold/80 mb-3">📜 日志</h2>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {gameState.logs.slice(-15).map(l => (
                    <div key={l.id} className="text-[10px] p-1.5 rounded-lg bg-white/[0.02]">
                      <span className="text-muted/30 mr-1">{new Date(l.timestamp).toLocaleTimeString()}</span>
                      <span className="text-white/50">{l.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Judge modal */}
          <AnimatePresence>
            {locked && pg && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              >
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="rounded-2xl p-6 w-full max-w-sm"
                  style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.9), rgba(var(--accent-bg-mid),0.95))', border: '1px solid rgba(var(--accent-primary),0.2)' }}
                >
                  <div className="text-center mb-4">
                    <div className="text-3xl mb-1">⚖️</div>
                    <h2 className="text-lg font-serif text-gold font-bold">裁判判定</h2>
                    <p className="text-xs text-muted/40 mt-0.5">{pg.username} 的猜想</p>
                  </div>
                  {curImg && (
                    <div className="rounded-xl overflow-hidden mb-3 ring-1 ring-gold/20">
                      <CcpImage src={curImg} className="w-full h-24" alt="" />
                      <div className="bg-gold/5 px-3 py-1 text-center">
                        <p className="text-[10px] text-gold/50">👆 对照图片判定</p>
                      </div>
                    </div>
                  )}
                  <div className="bg-gold/5 rounded-xl p-3 mb-4 text-center">
                    <p className="text-[10px] text-gold/50 mb-0.5">💬 猜想内容</p>
                    <p className="text-xl font-serif font-bold text-gold">{pg.word}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleJudge(false)}
                      className="flex-1 py-3 rounded-xl border border-crimson/30 text-crimson font-serif font-bold hover:bg-crimson/10 transition-colors">
                      ✕ 猜错了
                    </button>
                    <button onClick={() => handleJudge(true)}
                      className="flex-1 py-3 rounded-xl font-serif font-bold border border-green-500/30 text-green-300 hover:bg-green-900/30 transition-colors"
                      style={{ background: 'rgba(74,222,128,0.12)' }}>
                      ✓ 猜对了！
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Leave confirm */}
          <AnimatePresence>
            {showLeaveConfirm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              >
                <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                  className="rounded-2xl p-6 w-full max-w-xs text-center"
                  style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.9), rgba(var(--accent-bg-mid),0.95))', border: '1px solid rgba(var(--accent-primary),0.2)' }}>
                  <h2 className="font-serif text-gold font-bold mb-1">退出裁判？</h2>
                  <p className="text-muted/40 text-sm mb-5">退出后游戏将结束</p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 py-3 bg-white/5 rounded-xl font-serif text-muted/60">继续</button>
                    <button onClick={handleEndGame} className="flex-1 py-3 bg-crimson/15 text-crimson border border-crimson/30 rounded-xl font-serif font-bold hover:bg-crimson/25 transition-colors">退出</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          {ToastView}
        </div>
      </Layout>
    )
  }

  // ========== 玩家视图 ==========
  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Top bar */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-3 mb-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3), rgba(var(--accent-bg-mid),0.6))', border: '1px solid rgba(var(--accent-primary),0.1)' }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-serif text-gold font-bold">✨ 第 {gameState.current_round}/{gameState.max_rounds} 轮</span>
              <span className="px-2 py-0.5 bg-gold/10 text-gold/70 rounded-full text-[10px] font-serif">
                余 {room.max_guesses - (players.find(p => p.user_id === user?.id)?.guess_count || 0)} 次
              </span>
            </div>
            <p className="text-xs text-muted/40 mt-0.5">
              {locked && pg?.user_id === user?.id ? '等待裁判判定中 (。︿。)' :
                locked ? `等待裁判判定 ${pg?.username} 的猜测` :
                  isMyTurn ? '轮到你了！(。ㅂ。)و✧' :
                    `等待 ${curPlayer?.username || ''} 行动中...`}
            </p>
          </div>
          <button onClick={() => setShowLeaveConfirm(true)}
            className="px-3 py-1.5 text-muted/40 text-xs rounded-xl hover:text-crimson transition-colors">退出</button>
        </motion.div>

        {gameError && <div className="text-crimson bg-crimson/10 border border-crimson/20 px-4 py-2 rounded-xl text-xs mb-4">{gameError}</div>}

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Main: Game grid */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
              <div className="grid gap-1.5 mx-auto" style={{ gridTemplateColumns: `repeat(${grid},1fr)`, maxWidth: '500px' }}>
                {Array.from({ length: total }).map((_, i) => {
                  const rev = gameState.revealed_tiles.includes(i)
                  const row = Math.floor(i / grid), col = i % grid
                  return (
                    <motion.div
                      key={i}
                      whileHover={!rev && isMyTurn && !locked ? { scale: 1.05 } : {}}
                      onClick={() => { if (isMyTurn && !rev && !locked) handleReveal(i) }}
                      className={`aspect-square rounded-xl overflow-hidden transition-all duration-300 relative ${
                        rev ? '' : isMyTurn && !locked
                          ? 'bg-gradient-to-br from-gold/20 to-gold/10 cursor-pointer hover:shadow-lg hover:shadow-gold/10'
                          : 'bg-white/[0.03]'
                      }`}
                      style={rev ? { backgroundImage: `url(${curImg})`, backgroundSize: `${grid * 100}%`, backgroundPosition: `${col / (grid - 1) * 100}% ${row / (grid - 1) * 100}%` } : undefined}
                    >
                      {!rev && (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-white/20 text-xs">✦</span>
                        </div>
                      )}
                      {rev && room.difficulty === 'blur' && (
                        <div className="absolute inset-0 transition-all duration-500"
                          style={{ backdropFilter: `blur(${gameState.current_blur_level * 8}px)`, WebkitBackdropFilter: `blur(${gameState.current_blur_level * 8}px)` }} />
                      )}
                    </motion.div>
                  )
                })}
              </div>

              {room.difficulty === 'blur' && (
                <div className="mt-3 flex items-center gap-2 max-w-[500px] mx-auto">
                  <span className="text-xs text-muted/40">模糊度</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gold/50 transition-all" style={{ width: `${gameState.current_blur_level / room.blur_level * 100}%` }} />
                  </div>
                  <span className="text-xs font-serif text-gold">{gameState.current_blur_level}</span>
                </div>
              )}

              {isMyTurn && !locked && (
                <div className="flex mt-4 max-w-[500px] mx-auto">
                  <button onClick={() => { setShowGuessModal(true); setGameError(''); }}
                    className="flex-1 py-3 btn-gold rounded-xl font-serif text-sm shadow-lg shadow-gold/20 flex items-center justify-center gap-1.5">
                    ✨ 我知道答案！
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: Rankings + Logs */}
          <div className="space-y-3">
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
              <h2 className="font-serif text-sm text-gold/80 mb-3">🏆 排行</h2>
              {players.filter(p => !p.is_host).sort((a, b) => b.score - a.score).map((p, i) => (
                <div key={p.user_id} className={`flex items-center gap-2 py-1.5 px-1.5 rounded-lg ${p.user_id === curUserId ? 'bg-gold/5' : ''}`}>
                  <span className={`font-serif text-[10px] w-4 text-center ${i < 3 ? 'text-gold' : 'text-muted/30'}`}>{i + 1}</span>
                  <span className="flex-1 font-serif text-xs truncate">{p.username || `User#${p.user_id}`}</span>
                  <span className="font-serif text-xs text-gold">{p.score}</span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
              <h2 className="font-serif text-sm text-gold/80 mb-3">📜 日志</h2>
              <div className="space-y-1 max-h-52 overflow-auto">
                {gameState.logs.slice(-15).map(l => (
                  <div key={l.id} className="text-[10px] p-1.5 rounded-lg bg-white/[0.02]">
                    <span className="text-muted/30 mr-1">{new Date(l.timestamp).toLocaleTimeString()}</span>
                    <span className="text-white/50">{l.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Guess modal */}
        <AnimatePresence>
          {showGuessModal && !locked && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="rounded-2xl p-6 w-full max-w-sm"
                style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.9), rgba(var(--accent-bg-mid),0.95))', border: '1px solid rgba(var(--accent-primary),0.2)' }}
              >
                <h2 className="text-xl font-serif text-gold font-bold mb-1">🔮 猜想揭秘！</h2>
                <p className="text-muted/40 text-xs mb-4">输入你想到的答案~</p>
                <input ref={guessInputRef} type="text" value={guessWord}
                  onChange={e => setGuessWord(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGuess()}
                  placeholder="输入答案..." autoFocus
                  className="input-dark w-full py-3 text-lg font-serif" />
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setShowGuessModal(false)}
                    className="flex-1 py-3 bg-white/5 rounded-xl font-serif text-muted/60">再想想</button>
                  <button onClick={handleGuess} disabled={!guessWord.trim()}
                    className="flex-1 py-3 btn-gold rounded-xl font-serif font-bold disabled:opacity-50">提交</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Waiting for judge */}
        <AnimatePresence>
          {locked && pg?.user_id === user?.id && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 flex items-center justify-center z-40 p-4 pointer-events-none"
            >
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                className="rounded-2xl p-8 text-center"
                style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.8), rgba(var(--accent-bg-mid),0.9))', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
                <div className="text-4xl mb-3 animate-bounce">(。︿。)</div>
                <p className="font-serif text-gold font-bold text-lg mb-1">等待裁判判定中...</p>
                <p className="text-muted/40 text-sm">你的猜想「{pg.word}」已提交~</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Leave confirm */}
        <AnimatePresence>
          {showLeaveConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                className="rounded-2xl p-6 w-full max-w-xs text-center"
                style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.9), rgba(var(--accent-bg-mid),0.95))', border: '1px solid rgba(var(--accent-primary),0.2)' }}>
                <h2 className="font-serif text-gold font-bold mb-1">退出冒险？</h2>
                <p className="text-muted/40 text-sm mb-5">退出后将无法重新加入</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 py-3 bg-white/5 rounded-xl font-serif text-muted/60">继续</button>
                  <button onClick={() => navigate(`/ccp/result/${code}`)} className="flex-1 py-3 bg-crimson/15 text-crimson border border-crimson/30 rounded-xl font-serif font-bold hover:bg-crimson/25 transition-colors">退出</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {ToastView}
      </div>
    </Layout>
  )
}

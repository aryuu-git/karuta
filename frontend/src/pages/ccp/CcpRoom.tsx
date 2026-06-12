import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../../components/Layout'
import { useAuth } from '../../hooks/useAuth'
import { useCcpSocket, type CcpWSEvent } from '../../hooks/useCcpSocket'
import { ccpApi, type CcpRoom, type CcpPlayer, type CcpBank, type CcpBankImage, type RoomImageInfo } from '../../api/ccp'
import { useCcpToast } from './useCcpToast'
import { CcpImage } from './CcpImage'

export function CcpRoom() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast, ToastView } = useCcpToast()

  const [room, setRoom] = useState<CcpRoom | null>(null)
  const [players, setPlayers] = useState<CcpPlayer[]>([])
  const [images, setImages] = useState<RoomImageInfo[]>([])
  const [offlineUsers, setOfflineUsers] = useState<Set<number>>(new Set())
  const [banks, setBanks] = useState<CcpBank[]>([])
  const [bankImages, setBankImages] = useState<CcpBankImage[]>([])
  const [selectedBank, setSelectedBank] = useState<CcpBank | null>(null)
  const [randomCount, setRandomCount] = useState(5)
  const [loading, setLoading] = useState(true)
  const [readyLoading, setReadyLoading] = useState(false)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLeftRef = useRef(false)

  // 加载房间数据
  useEffect(() => {
    if (!code) return
    let cancelled = false
    const loadRoom = async () => {
      setLoading(true)
      try {
        let state = await ccpApi.rooms.get(code)
        if (state.game_state?.status === 'active') {
          navigate(`/ccp/game/${code}`)
          return
        }

        const currentUserId = user?.id
        const alreadyInRoom = !!currentUserId && state.players.some(p => p.user_id === currentUserId)
        const isCurrentHost = currentUserId === state.room.host_user_id
        if (currentUserId && !alreadyInRoom && !isCurrentHost && state.room.status === 'waiting') {
          await ccpApi.rooms.join(code)
          state = await ccpApi.rooms.get(code)
        }

        if (cancelled) return
        setRoom(state.room)
        setPlayers(state.players)
        setImages(state.images)
      } catch {
        if (!cancelled) navigate('/ccp')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadRoom()
    return () => { cancelled = true }
  }, [code, navigate, user?.id])

  // 加载题库
  useEffect(() => {
    ccpApi.themes.list().then(setBanks).catch(() => {})
  }, [])

  // WebSocket 事件处理
  const handleEvent = useCallback((e: CcpWSEvent) => {
    switch (e.type) {
      case 'room_update':
        if (e.room) setRoom(e.room as CcpRoom)
        if (e.players) setPlayers(e.players as CcpPlayer[])
        if (e.images) setImages(e.images as RoomImageInfo[])
        break
      case 'player_joined':
        setOfflineUsers(prev => { const next = new Set(prev); next.delete((e as any).user_id); return next })
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
        setOfflineUsers(prev => { const next = new Set(prev); next.add((e as any).user_id); return next })
        break
      case 'player_ready':
        setPlayers(prev => prev.map(p => p.user_id === (e as any).user_id ? { ...p, is_ready: (e as any).ready } : p))
        break
      case 'game_started':
        navigate(`/ccp/game/${code}`)
        break
      case 'room_closed':
        navigate('/ccp')
        break
    }
  }, [code, navigate])

  const { connected } = useCcpSocket(code || '', handleEvent)

  const isHost = user?.id === room?.host_user_id
  const allReady = players.every(p => p.is_ready || p.is_host || offlineUsers.has(p.user_id))
  const hasImages = images.length > 0

  const handleStart = async () => {
    if (!code) return
    try {
      await ccpApi.games.start(code)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '开始失败', 'fail')
    }
  }

  const handleReady = async () => {
    if (!code || readyLoading) return
    setReadyLoading(true)
    try {
      await ccpApi.rooms.ready(code)
      setPlayers(prev => prev.map(p => p.user_id === user?.id ? { ...p, is_ready: !p.is_ready } : p))
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失败', 'fail')
    } finally { setReadyLoading(false) }
  }

  const handleLeave = () => {
    hasLeftRef.current = true
    navigate('/ccp')
  }

  const handleSelectBank = async (bank: CcpBank) => {
    setSelectedBank(bank)
    try {
      const imgs = await ccpApi.themes.listImages(bank.id)
      setBankImages(imgs)
    } catch {}
  }

  const handleRandomImages = async () => {
    if (!code) return
    try {
      await ccpApi.rooms.randomImages(code, randomCount, selectedBank?.id)
      const state = await ccpApi.rooms.get(code)
      setImages(state.images)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '随机抽取失败', 'fail')
    }
  }

  const handleAddImage = async (imageUrl: string, answerKeywords?: string) => {
    if (!code) return
    try {
      await ccpApi.rooms.addImage(code, imageUrl, answerKeywords)
      setImages(prev => [...prev, { image_url: imageUrl, answer_keywords: answerKeywords || '' }])
    } catch (err) {
      showToast(err instanceof Error ? err.message : '添加失败', 'fail')
    }
  }

  const handleRemoveImage = async (url: string) => {
    if (!code) return
    try {
      await ccpApi.rooms.removeImage(code, url)
      setImages(prev => prev.filter(img => img.image_url !== url))
    } catch (err) {
      showToast(err instanceof Error ? err.message : '移除失败', 'fail')
    }
  }

  // 防抖同步设置
  const handleSyncSettings = useCallback((updates: Record<string, unknown>) => {
    if (!code || !isHost) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      try { await ccpApi.rooms.update(code, updates) } catch {}
    }, 500)
  }, [code, isHost])

  if (loading || !room) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }}
            className="text-gold/50 font-serif">加载中…</motion.div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <h1 className="font-serif text-xl text-gold font-bold">
              {isHost ? '✨ 你的冒险小屋' : '🏠 冒险小屋'}
            </h1>
            <p className="text-muted/40 text-xs font-serif italic mt-0.5">
              暗号 <span className="font-mono font-bold text-gold/60">{code}</span> · {images.length} 张 CG
            </p>
          </div>
          <div className="flex items-center gap-2">
            <motion.span
              animate={{ scale: connected ? [1, 1.3, 1] : 1 }}
              transition={{ repeat: connected ? Infinity : 0, duration: 2 }}
              className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`}
            />
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Players */}
          <div className="lg:col-span-1 space-y-4">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-2xl p-4"
              style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}
            >
              <h2 className="font-serif text-sm text-gold/80 mb-3">⚔️ 冒险者们</h2>
              <div className="space-y-1.5">
                <AnimatePresence>
                  {players.map(p => (
                    <motion.div key={p.user_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${offlineUsers.has(p.user_id) ? 'opacity-50' : ''}`}
                      style={{ background: 'rgba(var(--accent-primary),0.04)', border: '1px solid rgba(var(--accent-primary),0.06)' }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-white/80 text-sm font-serif">{p.username || `User#${p.user_id}`}</span>
                        {p.is_host && <span className="text-[10px] text-gold/70 font-serif">房主</span>}
                        {offlineUsers.has(p.user_id) && <span className="text-[10px] text-crimson/70 font-serif">离线</span>}
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
              {!isHost && (
                <button onClick={handleReady} disabled={readyLoading}
                  className="w-full mt-4 py-3 rounded-xl font-serif text-sm transition-all shadow-lg disabled:opacity-50"
                  style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: 'rgb(74,222,128)' }}>
                  ✓ 准备就绪
                </button>
              )}
            </motion.div>

            {/* 非房主设置预览 */}
            {!isHost && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl p-4"
                style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.2), rgba(var(--accent-bg-mid),0.4))', border: '1px solid rgba(var(--accent-primary),0.08)' }}
              >
                <h2 className="font-serif text-sm text-gold/60 mb-2">📋 冒险设定</h2>
                <div className="space-y-1 text-xs text-white/50 font-serif">
                  <p>模式: <span className="text-white/70">{room.judge_mode === 'judge' ? '👑 裁判' : '🤖 自动'}</span></p>
                  <p>难度: <span className="text-white/70">{room.difficulty === 'blur' ? '🌫️ 模糊' : '👁️ 普通'}</span></p>
                  <p>网格: <span className="text-white/70">{room.grid_size}x{room.grid_size}</span></p>
                  <p>猜测次数: <span className="text-white/70">{room.max_guesses}</span></p>
                  <p>CG: <span className="text-white/70">{images.length} 张</span></p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right: Settings + Images */}
          <div className="lg:col-span-2 space-y-4">
            {/* Room Settings (host only) */}
            {isHost && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-4"
                style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3), rgba(var(--accent-bg-mid),0.6))', border: '1px solid rgba(var(--accent-primary),0.1)' }}
              >
                <h2 className="font-serif text-sm text-gold/80 mb-3">⚙️ 冒险设定</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted/40 font-serif mb-1 block">模式</label>
                    <select value={room.judge_mode}
                      onChange={e => { const v = e.target.value; setRoom(r => r ? { ...r, judge_mode: v } : r); handleSyncSettings({ judge_mode: v }) }}
                      className="input-dark w-full py-2 text-xs">
                      <option value="judge">👑 裁判模式</option>
                      <option value="auto">🤖 自动判定</option>
                    </select>
                    {room.judge_mode === 'auto' && (
                      <p className="text-[10px] text-gold/50 mt-1">⚠ 自动判定可能存在误判</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] text-muted/40 font-serif mb-1 block">难度</label>
                    <select value={room.difficulty}
                      onChange={e => { const v = e.target.value; setRoom(r => r ? { ...r, difficulty: v } : r); handleSyncSettings({ difficulty: v }) }}
                      className="input-dark w-full py-2 text-xs">
                      <option value="normal">👁️ 普通</option>
                      <option value="blur">🌫️ 模糊</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted/40 font-serif mb-1 block">网格 {room.grid_size}x{room.grid_size}</label>
                    <input type="range" min={2} max={12} value={room.grid_size}
                      onChange={e => { const v = +e.target.value; setRoom(r => r ? { ...r, grid_size: v } : r); handleSyncSettings({ grid_size: v }) }}
                      className="w-full accent-gold" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted/40 font-serif mb-1 block">猜测次数 {room.max_guesses}</label>
                    <input type="range" min={1} max={10} value={room.max_guesses}
                      onChange={e => { const v = +e.target.value; setRoom(r => r ? { ...r, max_guesses: v } : r); handleSyncSettings({ max_guesses: v }) }}
                      className="w-full accent-gold" />
                  </div>
                  {room.difficulty === 'blur' && (
                    <div>
                      <label className="text-[10px] text-muted/40 font-serif mb-1 block">模糊等级 {room.blur_level}</label>
                      <input type="range" min={1} max={10} value={room.blur_level}
                        onChange={e => { const v = +e.target.value; setRoom(r => r ? { ...r, blur_level: v } : r); handleSyncSettings({ blur_level: v }) }}
                        className="w-full accent-gold" />
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* CG Images (host only) */}
            {isHost && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl p-4"
                style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}
              >
                <h2 className="font-serif text-sm text-gold/80 mb-3">🎨 CG 选择 · {images.length} 张</h2>
                {images.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                    {images.map((img, i) => (
                      <div key={i} className="relative group rounded-xl overflow-hidden ring-1 ring-gold/10">
                        <CcpImage src={img.image_url} className="w-full h-20" alt="" />
                        <button onClick={() => handleRemoveImage(img.image_url)}
                          className="absolute top-1 right-1 p-1 bg-crimson/80 text-white rounded-lg opacity-0 group-hover:opacity-100 text-[10px] transition-opacity">✕</button>
                        {img.answer_keywords && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[8px] text-white/60 px-1 py-0.5 truncate">
                            {img.answer_keywords}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2 mb-2">
                  <select value={selectedBank?.id || ''}
                    onChange={e => { const b = banks.find(x => x.id === +e.target.value); if (b) handleSelectBank(b); }}
                    className="input-dark flex-1 py-2 text-xs">
                    <option value="">📚 选择题库</option>
                    {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <input type="number" min={1} max={50} value={randomCount}
                      onChange={e => setRandomCount(+e.target.value)}
                      className="input-dark w-14 py-2 text-center text-xs" />
                    <button onClick={handleRandomImages}
                      className="btn-gold px-4 py-2 text-xs flex-1 sm:flex-none">🎲 随机</button>
                  </div>
                </div>
                {selectedBank && bankImages.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-auto">
                    {bankImages.map(img => (
                      <div key={img.id}
                        onClick={() => handleAddImage(img.image_url, img.answer_keywords)}
                        className="rounded-lg overflow-hidden cursor-pointer hover:ring-1 hover:ring-gold/40 transition-all">
                        <CcpImage src={img.image_url} className="w-full h-12" alt="" />
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex gap-3 mt-6"
        >
          {isHost && (
            <button onClick={handleStart} disabled={!allReady || !hasImages}
              className="flex-1 py-3 btn-gold rounded-xl font-serif text-sm shadow-lg shadow-gold/20 disabled:opacity-40 disabled:cursor-not-allowed">
              {allReady && hasImages ? '🚀 开始冒险！' : '⏳ 等待准备...'}
            </button>
          )}
          <button onClick={handleLeave}
            className="px-5 py-3 rounded-xl text-muted/50 font-serif text-sm transition-colors hover:text-muted/80"
            style={{ border: '1px solid rgba(var(--accent-primary),0.1)' }}>
            离开
          </button>
        </motion.div>
        {ToastView}
      </div>
    </Layout>
  )
}

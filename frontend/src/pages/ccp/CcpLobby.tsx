import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../../components/Layout'
import { ccpApi, type CcpRoomInfo } from '../../api/ccp'

export function CcpLobby() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<CcpRoomInfo[]>([])
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newRoom, setNewRoom] = useState({ judge_mode: 'judge', grid_size: 3, max_guesses: 3, difficulty: 'normal', blur_level: 3 })

  const loadRooms = useCallback(() => {
    ccpApi.rooms.list().then(setRooms).catch(() => setRooms([]))
  }, [])

  useEffect(() => {
    loadRooms()
    const timer = setInterval(loadRooms, 8000)
    return () => clearInterval(timer)
  }, [loadRooms])

  const doJoin = async (code: string) => {
    setJoining(true)
    setJoinError(null)
    try {
      await ccpApi.rooms.join(code)
      navigate(`/ccp/rooms/${code}`)
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : '加入失败了 (>_<)')
    } finally { setJoining(false) }
  }

  const handleJoin = (e: FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (code) doJoin(code)
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const room = await ccpApi.rooms.create(newRoom)
      navigate(`/ccp/rooms/${room.code}`)
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : '创建失败')
    } finally { setCreating(false) }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-4"
        >
          <h1 className="font-serif text-2xl text-gold font-bold">🎨 CG猜谜</h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-serif italic"
            style={{ background: 'rgba(var(--accent-primary),0.1)', border: '1px solid rgba(var(--accent-primary),0.2)', color: 'rgba(var(--accent-primary),1)' }}>
            快闪小游戏 ✧
          </span>
          <button onClick={() => navigate('/')}
            className="ml-auto text-xs text-muted/50 hover:text-gold transition-colors font-serif">
            ← 回到大厅
          </button>
        </motion.div>

        {/* Rules */}
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6 rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.2), rgba(var(--accent-bg-mid),0.4))', border: '1px solid rgba(var(--accent-primary),0.1)' }}
        >
          <button
            onClick={() => setShowRules(!showRules)}
            className="w-full flex items-center justify-between px-5 py-3 transition-colors hover:bg-white/[0.02]"
          >
            <span className="font-serif text-sm text-gold/70">📖 玩法说明</span>
            <motion.span
              animate={{ rotate: showRules ? 180 : 0 }}
              className="text-muted/40 text-xs"
            >
              ▼
            </motion.span>
          </button>
          <AnimatePresence>
            {showRules && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-5 pb-4 space-y-3 text-xs text-white/60 font-serif leading-relaxed"
                  style={{ borderTop: '1px solid rgba(var(--accent-primary),0.06)' }}
                >
                  <div className="pt-3">
                    <p className="text-gold/60 font-bold mb-1">🎮 游戏目标</p>
                    <p>一张 CG 图片被网格遮罩，玩家轮流掀开方块，<span className="text-gold/80">猜出图中内容</span>。</p>
                    <p>越早猜对得分越高！</p>
                  </div>
                  <div>
                    <p className="text-gold/60 font-bold mb-1">⚡ 游戏流程</p>
                    <p>1. 房主选择题库图片 → 设置网格和难度</p>
                    <p>2. 玩家轮流掀开方块（揭示图片的一部分）</p>
                    <p>3. 觉得猜到了？提交猜想！</p>
                    <p>4. 裁判判定对错 / 自动匹配判定</p>
                    <p>5. 多轮图片，全部结束按分数排名</p>
                  </div>
                  <div>
                    <p className="text-gold/60 font-bold mb-1">👑 两种模式</p>
                    <p>• <span className="text-white/70">裁判模式</span>（推荐）：房主当裁判，人工判定对错</p>
                    <p>• <span className="text-white/70">自动判定</span>：系统匹配关键词判定，可能存在误判</p>
                  </div>
                  <p className="text-muted/30 text-[10px] pt-1">✧ 快闪小游戏，开心就好 ✧</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Join + Create cards */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          {/* Join by code */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex-1 rounded-2xl p-5 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3) 0%, rgba(var(--accent-bg-mid),0.7) 50%, rgba(var(--accent-bg-end),0.3) 100%)', border: '1px solid rgba(var(--accent-primary),0.15)' }}
          >
            <div className="absolute top-0 left-0 w-20 h-20 opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(var(--glow-color),0.8), transparent 70%)' }} />
            <h2 className="font-serif text-base text-gold font-bold mb-1 relative">🔑 凭令入阵</h2>
            <p className="text-muted/50 text-xs mb-3 font-serif italic relative">有房间暗号？直接加入！✧</p>
            <form onSubmit={handleJoin} className="flex gap-2 relative">
              <input
                type="text"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(null) }}
                className="input-dark text-center font-serif font-bold tracking-[0.2em] flex-1 py-2.5 text-sm"
                placeholder="输入暗号…"
                maxLength={6}
              />
              <button type="submit" disabled={joining || !joinCode.trim()}
                className="btn-gold px-5 py-2.5 text-sm disabled:opacity-50 shrink-0 shadow-lg shadow-gold/20">
                {joining ? '加入中…' : '加入！'}
              </button>
            </form>
            {joinError && (
              <p className="text-crimson text-xs mt-2 text-center bg-crimson/10 border border-crimson/20 rounded-lg px-2 py-1.5">
                😣 {joinError}
              </p>
            )}
          </motion.div>

          {/* Create */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="sm:w-72 rounded-2xl p-5 flex flex-col relative overflow-hidden"
            style={{ background: 'linear-gradient(160deg, rgba(var(--accent-bg-end),0.5), rgba(var(--accent-bg-mid),0.8))', border: '1px solid rgba(var(--accent-primary),0.12)' }}
          >
            <div className="absolute bottom-0 right-0 w-16 h-16 opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(var(--accent-primary),0.8), transparent 70%)' }} />
            {!showCreate ? (
              <div className="flex flex-col items-center justify-center flex-1 relative">
                <button onClick={() => setShowCreate(true)}
                  className="btn-gold text-sm w-full transition-all duration-200 hover:scale-105 shadow-lg shadow-gold/20">
                  ✨ 创建冒险
                </button>
                <p className="text-muted/40 text-xs mt-2 text-center font-serif italic">开一个 CG 猜谜房间 ♪</p>
              </div>
            ) : (
              <div className="space-y-2 relative">
                <select
                  value={newRoom.judge_mode}
                  onChange={e => setNewRoom({ ...newRoom, judge_mode: e.target.value })}
                  className="input-dark w-full py-2 text-xs"
                >
                  <option value="judge">👑 裁判模式（推荐）</option>
                  <option value="auto">🤖 自动判定（实验性）</option>
                </select>
                {newRoom.judge_mode === 'auto' && (
                  <p className="text-[10px] text-gold/60 font-serif px-1">
                    ⚠ 自动判定依赖关键词匹配，可能存在误判
                  </p>
                )}
                <select
                  value={newRoom.difficulty}
                  onChange={e => setNewRoom({ ...newRoom, difficulty: e.target.value })}
                  className="input-dark w-full py-2 text-xs"
                >
                  <option value="normal">👁️ 普通模式</option>
                  <option value="blur">🌫️ 模糊模式</option>
                </select>
                <button onClick={handleCreate} disabled={creating}
                  className="btn-gold w-full py-2 text-xs disabled:opacity-50 transition-all hover:scale-105">
                  {creating ? '创建中…' : '创建'}
                </button>
              </div>
            )}
          </motion.div>
        </div>

        {/* Room list */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4) 0%, rgba(var(--accent-bg-mid),0.7) 100%)', border: '1px solid rgba(var(--accent-primary),0.12)' }}
        >
          <div className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: '1px solid rgba(var(--accent-primary),0.08)' }}>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-base text-gold font-bold">🏠 冒险小屋</h2>
              <span className="text-muted/30 text-xs font-serif italic">等待勇者加入</span>
            </div>
            <button onClick={() => navigate('/ccp/themes')}
              className="text-xs text-gold/50 hover:text-gold transition-colors font-serif border border-gold/20 rounded-lg px-2.5 py-1 hover:border-gold/40">
              📚 题库管理
            </button>
          </div>

          <div className="p-3">
            {rooms.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-muted/30 text-sm font-serif italic">还没有人创建房间呢…</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <AnimatePresence>
                  {rooms.map((room, i) => (
                    <motion.div key={room.code}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ scale: 1.01, x: 3 }}
                      className="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-colors"
                      style={{ background: 'rgba(var(--accent-primary),0.04)', border: '1px solid rgba(var(--accent-primary),0.08)' }}
                      onClick={() => doJoin(room.code)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-gold/60 text-lg">
                          {room.judge_mode === 'judge' ? '👑' : '🤖'}
                        </span>
                        <div>
                          <span className="text-white/80 text-sm font-medium">{room.host_username || '冒险小屋'}</span>
                          <span className="text-muted/30 text-xs ml-2 font-mono">#{room.code}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted/40 text-xs">{room.player_count} 人</span>
                        <span className={`text-xs font-serif ${room.difficulty === 'blur' ? 'text-pink-300' : 'text-gold/60'}`}>
                          {room.difficulty === 'blur' ? '模糊' : '普通'}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </Layout>
  )
}

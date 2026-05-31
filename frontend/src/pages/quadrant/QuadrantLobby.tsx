import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../../components/Layout'
import { quadrantApi, type QRoom, type QBank } from '../../api/quadrant'

export function QuadrantLobby() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<QRoom[]>([])
  const [banks, setBanks] = useState<QBank[]>([])
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newRoom, setNewRoom] = useState({ name: '', bank_id: 0, reveal_interval: 10 })

  const loadData = useCallback(() => {
    quadrantApi.rooms.list().then(setRooms).catch(() => setRooms([]))
    quadrantApi.banks.list().then(setBanks).catch(() => setBanks([]))
  }, [])

  useEffect(() => {
    loadData()
    const timer = setInterval(loadData, 8000)
    return () => clearInterval(timer)
  }, [loadData])

  const doJoin = async (code: string) => {
    setJoining(true)
    setJoinError(null)
    try {
      const res = await quadrantApi.rooms.join(code)
      navigate(`/quadrant/rooms/${res.room.id}`)
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
      const room = await quadrantApi.rooms.create({
        name: newRoom.name || '猜象限',
        bank_id: newRoom.bank_id,
        reveal_interval: newRoom.bank_id > 0 ? newRoom.reveal_interval : 0,
      } as any)
      navigate(`/quadrant/rooms/${room.id}`)
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : '创建失败')
    } finally { setCreating(false) }
  }

  const STATUS_LABEL: Record<string, { text: string; color: string }> = {
    waiting: { text: '招募中', color: 'text-green-400' },
    preparing: { text: '出题中', color: 'text-yellow-300' },
    playing: { text: '激战中', color: 'text-gold' },
    ended: { text: '已结束', color: 'text-muted' },
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
          <h1 className="font-serif text-2xl text-gold font-bold">🎯 猜象限</h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-serif italic"
            style={{ background: 'rgba(var(--accent-primary),0.1)', border: '1px solid rgba(var(--accent-primary),0.2)', color: 'rgba(var(--accent-primary),1)' }}>
            内测中 ✧
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
                    <p>有两个<span className="text-gold/80">隐藏标签</span>作为坐标轴（X轴和Y轴），多部作品按归属程度被放置在四象限中。</p>
                    <p>你需要通过观察作品的位置，从候选标签池中<span className="text-gold/80">猜出这两个隐藏标签</span>是什么。</p>
                  </div>
                  <div>
                    <p className="text-gold/60 font-bold mb-1">📐 四象限</p>
                    <p>• 作品越靠近某个轴的正方向 → 在该标签上归属程度越高</p>
                    <p>• 作品越靠近负方向 → 归属程度越低或完全无关</p>
                    <p>• 不同标签用不同颜色标记，方便观察</p>
                  </div>
                  <div>
                    <p className="text-gold/60 font-bold mb-1">⚡ 游戏流程</p>
                    <p>1. 所有候选标签会首先展示出来</p>
                    <p>2. 作品一部一部被揭示，放置到坐标系中</p>
                    <p>3. 每揭示一部作品后，你都可以提交猜测（选两个标签）</p>
                    <p>4. 越早猜对得分越高！猜错会扣分并冷却一轮</p>
                    <p>5. 全部作品揭示完毕后揭晓答案</p>
                  </div>
                  <div>
                    <p className="text-gold/60 font-bold mb-1">👑 模式</p>
                    <p>• <span className="text-white/70">题库模式</span>：从预设题库中随机抽题，自动揭示作品</p>
                    <p>• <span className="text-white/70">裁判模式</span>：房主亲自出题，手动控制揭示节奏，可以给提示</p>
                  </div>
                  <div>
                    <p className="text-gold/60 font-bold mb-1">💡 小技巧</p>
                    <p>• 先排除明显不相关的标签，缩小范围</p>
                    <p>• 注意观察作品在两个轴上的分布规律</p>
                    <p>• 不要急着猜——等多揭示几部再判断更稳妥</p>
                  </div>
                  <p className="text-muted/30 text-[10px] pt-1">✧ 内测中，如有问题请反馈 ✧</p>
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
            <p className="text-muted/50 text-xs mb-3 font-serif italic relative">持有象限令牌？直接参战！✧</p>
            <form onSubmit={handleJoin} className="flex gap-2 relative">
              <input
                type="text"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(null) }}
                className="input-dark text-center font-serif font-bold tracking-[0.2em] flex-1 py-2.5 text-sm"
                placeholder="输入令牌…"
                maxLength={6}
              />
              <button type="submit" disabled={joining || !joinCode.trim()}
                className="btn-gold px-5 py-2.5 text-sm disabled:opacity-50 shrink-0 shadow-lg shadow-gold/20 transition-all hover:scale-105">
                {joining ? '传送中…' : '参战！'}
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
            className="sm:w-56 rounded-2xl p-5 flex flex-col relative overflow-hidden"
            style={{ background: 'linear-gradient(160deg, rgba(var(--accent-bg-end),0.5), rgba(var(--accent-bg-mid),0.8))', border: '1px solid rgba(var(--accent-primary),0.12)' }}
          >
            <div className="absolute bottom-0 right-0 w-16 h-16 opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(var(--accent-primary),0.8), transparent 70%)' }} />
            {!showCreate ? (
              <div className="flex flex-col items-center justify-center flex-1 relative">
                <button onClick={() => setShowCreate(true)}
                  className="btn-gold text-sm w-full transition-all duration-200 hover:scale-105 shadow-lg shadow-gold/20">
                  ✨ 开辟象限
                </button>
                <p className="text-muted/40 text-xs mt-2 text-center font-serif italic">创建属于你的推理战场 ♪</p>
              </div>
            ) : (
              <div className="space-y-2 relative">
                <input
                  type="text"
                  value={newRoom.name}
                  onChange={e => setNewRoom({ ...newRoom, name: e.target.value })}
                  placeholder="战场名"
                  className="input-dark w-full py-2 text-xs"
                />
                <select
                  value={newRoom.bank_id}
                  onChange={e => setNewRoom({ ...newRoom, bank_id: Number(e.target.value) })}
                  className="input-dark w-full py-2 text-xs"
                >
                  <option value={0}>👑 裁判模式</option>
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>📚 {b.name} ({b.question_count}题)</option>
                  ))}
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
              <h2 className="font-serif text-base text-gold font-bold">🏯 象限战场</h2>
              <span className="text-muted/30 text-xs font-serif italic">推理交锋之地</span>
            </div>
            <button onClick={() => navigate('/quadrant/banks')}
              className="text-xs text-gold/50 hover:text-gold transition-colors font-serif border border-gold/20 rounded-lg px-2.5 py-1 hover:border-gold/40">
              📚 题库管理
            </button>
          </div>

          <div className="p-3">
            {rooms.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-muted/30 text-sm font-serif italic">静寂的战场，等待第一位勇者…</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <AnimatePresence>
                  {rooms.map((room, i) => {
                    const s = STATUS_LABEL[room.status] || { text: room.status, color: 'text-white' }
                    return (
                      <motion.div key={room.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{ scale: 1.01, x: 3 }}
                        className="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-colors"
                        style={{ background: 'rgba(var(--accent-primary),0.04)', border: '1px solid rgba(var(--accent-primary),0.08)' }}
                        onClick={() => navigate(`/quadrant/rooms/${room.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-gold/60 text-lg">
                            {room.judge_id > 0 ? '👑' : '📚'}
                          </span>
                          <div>
                            <span className="text-white/80 text-sm font-medium">{room.name || '猜象限'}</span>
                            <span className="text-muted/30 text-xs ml-2 font-mono">#{room.code}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-serif ${s.color}`}>{s.text}</span>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </Layout>
  )
}

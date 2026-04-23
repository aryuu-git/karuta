import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../components/Layout'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import type { Deck, RoomListItem } from '../api/types'

function formatDate(d: string) {
  try { return new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) }
  catch { return d }
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  waiting:  { text: '🟢 招募中', color: 'text-green-400' },
  reading:  { text: '⚔️ 激战中（不可加入）', color: 'text-gold' },
  paused:   { text: '⚔️ 激战中（不可加入）', color: 'text-muted' },
  end:      { text: '🔒 已结束', color: 'text-muted' },
}

export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.username === 'aryuu'

  // --- decks ---
  const [decks, setDecks] = useState<Deck[]>([])
  const [decksLoading, setDecksLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // --- public decks ---
  const [publicDecks, setPublicDecks] = useState<Deck[]>([])

  // --- lobby ---
  const [rooms, setRooms] = useState<RoomListItem[]>([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  const loadRooms = useCallback(() => {
    setRoomsLoading(true)
    api.rooms.list()
      .then(setRooms)
      .catch(() => setRooms([]))
      .finally(() => setRoomsLoading(false))
  }, [])

  useEffect(() => {
    api.decks.list()
      .then(setDecks)
      .catch(() => null)
      .finally(() => setDecksLoading(false))
    api.decks.listPublic()
      .then(setPublicDecks)
      .catch(() => null)
    loadRooms()
    // 大厅每 8 秒自动刷新
    const timer = setInterval(loadRooms, 8000)
    return () => clearInterval(timer)
  }, [loadRooms])

  const handleCreateDeck = async (e: FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const deck = await api.decks.create(newName.trim(), newDesc.trim())
      setDecks(prev => [deck, ...prev])
      setShowCreate(false)
      setNewName(''); setNewDesc('')
    } catch { }
    finally { setCreating(false) }
  }

  const handleDeleteDeck = async (id: number) => {
    setDeleting(true)
    try {
      await api.decks.delete(id)
      setDecks(prev => prev.filter(d => d.id !== id))
      setDeleteId(null)
    } catch { }
    finally { setDeleting(false) }
  }

  const handleJoinByCode = async (e: FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    await doJoin(code)
  }

  const doJoin = async (code: string) => {
    setJoining(true)
    setJoinError(null)
    try {
      const res = await api.rooms.join(code)
      navigate(`/rooms/${res.room.id}`)
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : '加入失败啦 (>_<)')
    } finally { setJoining(false) }
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ===== 左：牌组 ===== */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-serif text-xl text-gold font-medium">🃏 我的牌组</h2>
                <p className="text-muted text-xs mt-0.5">收集你的专属歌牌，打造无敌阵容！(ﾉ◕ヮ◕)ﾉ</p>
              </div>
              <button onClick={() => setShowCreate(true)} className="btn-gold text-sm transition-all duration-200 hover:scale-105">✨ 新建牌组</button>
            </div>

            {decksLoading && (
              <div className="text-muted text-sm animate-pulse py-12 text-center">牌组召唤中… (｡･ω･｡)</div>
            )}
            {!decksLoading && decks.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-center py-16 border border-dashed border-border rounded-xl">
                <div className="text-5xl mb-3">🃏</div>
                <p className="text-gold text-base font-serif mb-1">还没有牌组哦～</p>
                <p className="text-muted text-sm mb-5">(｡•́︿•̀｡) 快创建你的第一副战斗牌组吧！</p>
                <button onClick={() => setShowCreate(true)} className="btn-gold text-sm transition-all duration-200 hover:scale-105">✨ 创建第一个牌组</button>
              </motion.div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AnimatePresence>
                {decks.map((deck, i) => (
                  <motion.div key={deck.id}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: i * 0.04 }}
                    className="group relative bg-surface border border-border rounded-xl overflow-hidden
                               cursor-pointer hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-gold transition-all duration-200"
                    style={{ borderTop: '2px solid rgba(232,164,184,0.3)' }}
                    onClick={() => navigate(`/decks/${deck.id}`)}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-sans font-semibold text-white truncate">{deck.name}</h3>
                        <span className="text-gold text-xs shrink-0">🃏 {deck.card_count} 张</span>
                      </div>
                      <p className="text-muted text-xs line-clamp-1 mb-3">{deck.description || '（还没有简介～）'}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-muted text-xs">{formatDate(deck.created_at)}</span>
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/rooms/new?deck_id=${deck.id}`) }}
                          className="text-xs text-gold/70 hover:text-gold transition-all duration-200 px-2 py-1 rounded border border-gold/20 hover:border-gold/50 hover:scale-105">
                          ⚔️ 开房间
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteId(deck.id) }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
                                 w-6 h-6 rounded flex items-center justify-center text-muted hover:text-crimson hover:bg-crimson/10 text-xs">
                      ×
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* ===== 右：大厅 ===== */}
          <div className="flex flex-col gap-4">

            {/* 邀请码快速加入 */}
            <div className="bg-surface border border-border rounded-xl p-5">
              <h2 className="font-serif text-base text-gold font-medium mb-1">🔑 凭码入场</h2>
              <p className="text-muted text-xs mb-3">有朋友的邀请码？直接冲！(◕‿◕)</p>
              <form onSubmit={handleJoinByCode} className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(null) }}
                  className="input-dark text-center font-serif font-bold tracking-[0.2em] flex-1 py-2 text-sm"
                  placeholder="XXXXXX"
                  maxLength={10}
                  autoComplete="off"
                  spellCheck={false}
                />
                <motion.button type="submit"
                  disabled={joining || !joinCode.trim()}
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="btn-gold px-4 py-2 text-sm disabled:opacity-50 shrink-0 transition-all duration-200">
                  {joining ? '冲…' : '冲！'}
                </motion.button>
              </form>
              {joinError && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-crimson text-xs mt-2 text-center bg-crimson/10 border border-crimson/20 rounded px-2 py-1">
                  😣 {joinError}
                </motion.p>
              )}
            </div>

            {/* 房间大厅 */}
            <div className="bg-surface border border-border rounded-xl overflow-hidden flex-1">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <h2 className="font-serif text-base text-gold font-medium">🏯 战场大厅</h2>
                <button onClick={loadRooms}
                  className="text-muted text-xs hover:text-gold transition-all duration-200 hover:scale-110">
                  ↻ 刷新
                </button>
              </div>

              {roomsLoading && (
                <div className="text-muted text-xs animate-pulse py-8 text-center">搜寻战场中… (´。• ω •。`)</div>
              )}

              {!roomsLoading && rooms.length === 0 && (
                <div className="text-center py-10">
                  <div className="text-4xl mb-2">🌸</div>
                  <p className="text-gold text-sm font-serif mb-1">目前无人开战～</p>
                  <p className="text-muted text-xs mb-3">第一个开房间的人最厉害！(ง •̀_•́)ง</p>
                  <button onClick={() => navigate('/rooms/new')}
                    className="mt-1 text-gold text-xs underline underline-offset-2 hover:text-gold-light transition-colors">
                    ✨ 创建房间，打响第一枪 →
                  </button>
                </div>
              )}

              <div className="divide-y divide-border">
                <AnimatePresence>
                  {rooms.map((room, i) => {
                    const s = STATUS_LABEL[room.status] ?? { text: room.status, color: 'text-muted' }
                    return (
                      <motion.div key={room.id}
                        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex items-center gap-3 px-5 py-3 transition-colors group hover:bg-gold/5 cursor-pointer"
                        onClick={() => !isAdmin && doJoin(room.code)}>
                        {/* 状态点 */}
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          room.status === 'waiting' ? 'bg-green-400' :
                          room.status === 'reading' ? 'bg-gold animate-pulse' : 'bg-muted'
                        }`} />
                        {/* 信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-medium truncate">{room.deck_name}</span>
                            <span className={`text-xs shrink-0 ${s.color}`}>{s.text}</span>
                          </div>
                          <div className="text-muted text-xs mt-0.5">
                            👑 {room.host_name} · {room.player_count} 位战士
                          </div>
                        </div>
                        {/* 加入按钮 / 强制结束按钮 */}
                        {!isAdmin && room.status !== 'end' ? (
                          <span className={`text-xs shrink-0 group-hover:text-gold transition-all duration-200 ${room.status === 'waiting' ? 'text-gold/60' : 'text-muted'}`}>
                            {room.status === 'waiting' ? '加入战斗 →' : '以旁观者加入 →'}
                          </span>
                        ) : isAdmin && room.status !== 'end' ? (
                          <button
                            onClick={async e => {
                              e.stopPropagation()
                              if (!confirm(`强制结束「${room.deck_name}」对局？`)) return
                              await api.rooms.forceEnd(room.id).catch(() => null)
                              loadRooms()
                            }}
                            className="text-xs px-2 py-1 rounded shrink-0 transition-all hover:scale-105"
                            style={{ background: 'rgba(255,165,0,0.12)', border: '1px solid rgba(255,165,0,0.35)', color: 'rgba(255,165,0,0.9)' }}>
                            ⚡ 强制结束
                          </button>
                        ) : null}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>

              {!roomsLoading && rooms.length > 0 && (
                <div className="px-5 py-3 border-t border-border">
                  <button onClick={() => navigate('/rooms/new')}
                    className="w-full btn-outline text-sm py-2 transition-all duration-200 hover:scale-[1.02]">
                    ⚔️ 自己开一局！
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ===== 公共牌组区块 ===== */}
        {publicDecks.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
              <h2 className="font-serif text-base text-gold font-medium shrink-0">🌐 公共牌组库</h2>
              <div className="h-px flex-1 bg-gradient-to-r from-gold/20 via-transparent to-transparent" />
            </div>
            <p className="text-muted text-xs text-center mb-4">热心玩家分享的牌组，拿来直接开战！(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <AnimatePresence>
                {publicDecks.map((deck, i) => (
                  <motion.div key={deck.id}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="bg-surface border border-border rounded-xl p-4 hover:border-gold/30 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                    style={{ borderTop: '2px solid rgba(232,164,184,0.2)' }}
                    onClick={() => navigate(`/rooms/new?deck_id=${deck.id}`)}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-sans font-medium text-white text-sm truncate">{deck.name}</h3>
                      <span className="text-gold/60 text-xs shrink-0">🃏 {deck.card_count}</span>
                    </div>
                    <p className="text-muted text-xs line-clamp-1 mb-3">{deck.description || '暂无简介'}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-muted/50 text-xs">by {deck.owner_name || '匿名'}</span>
                      <span className="text-xs text-gold/70 border border-gold/20 px-2 py-0.5 rounded hover:bg-gold/10 transition-colors">
                        ⚔️ 用这个开战
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* 新建牌组弹窗 */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowCreate(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ink-deep border border-border rounded-xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}>
              <h3 className="font-sans font-semibold text-white mb-1">✨ 新建牌组</h3>
              <p className="text-muted text-xs mb-5">给你的专属牌组起个霸气的名字！(≧▽≦)</p>
              <form onSubmit={handleCreateDeck} className="flex flex-col gap-4">
                <div>
                  <label className="text-muted text-xs block mb-1.5">🃏 牌组名称 *</label>
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                    className="input-dark" placeholder="例：百人一首·极" required autoFocus />
                </div>
                <div>
                  <label className="text-muted text-xs block mb-1.5">📝 描述（选填）</label>
                  <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)}
                    className="input-dark resize-none" placeholder="简单介绍一下这副牌吧～" rows={2} />
                </div>
                <div className="flex gap-3 mt-1">
                  <button type="button" onClick={() => setShowCreate(false)} className="btn-outline flex-1 transition-all duration-200 hover:scale-[1.02]">算了算了</button>
                  <button type="submit" disabled={creating || !newName.trim()} className="btn-gold flex-1 disabled:opacity-50 transition-all duration-200 hover:scale-[1.02]">
                    {creating ? '创建中… (｡･ω･｡)' : '✨ 创建！'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除确认弹窗 */}
      <AnimatePresence>
        {deleteId !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setDeleteId(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ink-deep border border-border rounded-xl p-6 w-full max-w-xs text-center"
              onClick={e => e.stopPropagation()}>
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="font-sans font-semibold text-white mb-2">真的要解散这副牌组吗？(；′⌒`)</h3>
              <p className="text-muted text-sm mb-6">删了就找不回来了！三思三思再三思！(｡•́︿•̀｡)</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="btn-outline flex-1 transition-all duration-200 hover:scale-[1.02]">再想想</button>
                <button onClick={() => handleDeleteDeck(deleteId!)} disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded bg-crimson hover:bg-crimson-light transition-all duration-200 text-white font-medium text-sm disabled:opacity-50 hover:scale-[1.02]">
                  {deleting ? '解散中…' : '狠心解散 (╥_╥)'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}

import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../components/Layout'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import type { Deck, RoomListItem } from '../api/types'

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  waiting:  { text: '🟢 招募中', color: 'text-green-400' },
  reading:  { text: '⚔️ 激战中', color: 'text-gold' },
  paused:   { text: '⏸ 暂停中', color: 'text-muted' },
  end:      { text: '🔒 已结束', color: 'text-muted' },
}

export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = !!user?.is_admin

  const [rooms, setRooms] = useState<RoomListItem[]>([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [myDecks, setMyDecks] = useState<Deck[]>([])
  const [publicDecks, setPublicDecks] = useState<Deck[]>([])
  const [deckSearch, setDeckSearch] = useState('')

  const loadRooms = useCallback(() => {
    setRoomsLoading(true)
    api.rooms.list()
      .then(setRooms)
      .catch(() => setRooms([]))
      .finally(() => setRoomsLoading(false))
  }, [])

  useEffect(() => {
    loadRooms()
    api.decks.listMine().then(setMyDecks).catch(() => null)
    api.decks.listPublic().then(setPublicDecks).catch(() => null)
    const timer = setInterval(loadRooms, 8000)
    return () => clearInterval(timer)
  }, [loadRooms])

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

  const handleJoinByCode = async (e: FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    await doJoin(code)
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* 邀请码 + 创建房间 */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex-1 rounded-2xl p-5 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3) 0%, rgba(var(--accent-bg-mid),0.7) 50%, rgba(var(--accent-bg-end),0.3) 100%)', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
            <div className="absolute top-0 left-0 w-20 h-20 opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(var(--glow-color),0.8), transparent 70%)' }} />
            <h2 className="font-serif text-base text-gold font-bold mb-1 relative">🔑 凭令入场</h2>
            <p className="text-pink-300/50 text-xs mb-3 font-serif italic relative">持有战场令牌？直接降临！✧</p>
            <form onSubmit={handleJoinByCode} className="flex gap-2 relative">
              <input
                type="text"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(null) }}
                className="input-dark text-center font-serif font-bold tracking-[0.2em] flex-1 py-2.5 text-sm"
                placeholder="输入令牌…"
                maxLength={10}
              />
              <button type="submit" disabled={joining || !joinCode.trim()}
                className="btn-gold px-5 py-2.5 text-sm disabled:opacity-50 shrink-0 shadow-lg shadow-gold/20 transition-all hover:scale-105">
                {joining ? '降临…' : '降临！'}
              </button>
            </form>
            {joinError && (
              <p className="text-crimson text-xs mt-2 text-center bg-crimson/10 border border-crimson/20 rounded-lg px-2 py-1.5">
                😣 {joinError}
              </p>
            )}
          </div>

          <div className="sm:w-52 rounded-2xl p-5 flex flex-col items-center justify-center relative overflow-hidden"
            style={{ background: 'linear-gradient(160deg, rgba(var(--accent-bg-end),0.5), rgba(var(--accent-bg-mid),0.8))', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
            <div className="absolute bottom-0 right-0 w-16 h-16 opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(var(--accent-primary),0.8), transparent 70%)' }} />
            <button onClick={() => navigate('/rooms/new')}
              className="btn-gold text-sm w-full transition-all duration-200 hover:scale-105 shadow-lg shadow-gold/20 relative">
              ⚔️ 开辟战场
            </button>
            <p className="text-pink-300/40 text-xs mt-2 text-center font-serif italic relative">选定阵容，向命运宣战 ♪</p>
          </div>
        </div>

        {/* 我的牌组（快速入口） */}
        {myDecks.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-sm text-gold/80">🃏 我的战阵</h2>
              <button onClick={() => navigate('/decks')} className="text-pink-300/40 text-xs hover:text-gold transition-colors font-serif">
                全部阵容 →
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {myDecks.slice(0, 4).map(deck => (
                <div key={deck.id}
                  className="rounded-lg p-3 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-pink-500/10 transition-all cursor-pointer group"
                  style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.5), rgba(var(--accent-bg-mid),0.8))', border: '1px solid rgba(var(--accent-primary),0.1)' }}
                  onClick={() => navigate(`/decks/${deck.id}`)}>
                  <h3 className="text-white/80 text-xs font-medium truncate">{deck.name}</h3>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-pink-300/30 text-[10px]">🃏 {deck.card_count} 张</span>
                    <button onClick={e => { e.stopPropagation(); navigate(`/rooms/new?deck_id=${deck.id}`) }}
                      className="text-[10px] text-gold/40 group-hover:text-gold transition-colors">
                      ⚔️ 出阵
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 桌面版下载 */}
        <a href="https://karuta-1321249409.cos-website.ap-shanghai.myqcloud.com/Karuta.exe"
          className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl transition-all hover:scale-[1.01]"
          style={{ background: 'rgba(var(--accent-primary),0.06)', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
          <span className="text-sm">💻</span>
          <span className="text-xs text-white/70">下载桌面版（音频本地缓存，省流量更流畅）</span>
          <span className="ml-auto text-[10px] text-gold/60">Windows</span>
        </a>

        {/* GitHub */}
        <a href="https://github.com/aryuu-git/karuta" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 mb-4 px-4 py-2 rounded-xl transition-all hover:scale-[1.01]"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-sm">⭐</span>
          <span className="text-xs text-white/50">GitHub 开源仓库</span>
          <span className="ml-auto text-[10px] text-muted/40">aryuu-git/karuta</span>
        </a>

        {/* 战场大厅 */}
        <div className="rounded-2xl overflow-hidden mb-8"
          style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4) 0%, rgba(var(--accent-bg-mid),0.7) 100%)', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
          <div className="flex items-center justify-between px-5 py-3.5 relative"
            style={{ borderBottom: '1px solid rgba(var(--accent-primary),0.08)' }}>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-base text-gold font-bold">🏯 战场大厅</h2>
              <span className="text-pink-300/30 text-xs font-serif italic">群雄争霸之地</span>
            </div>
            <button onClick={loadRooms}
              className="text-pink-300/40 text-xs hover:text-gold transition-all duration-200 hover:scale-110">
              ↻ 刷新
            </button>
          </div>

          {roomsLoading && (
            <div className="text-pink-300/50 text-xs animate-pulse py-8 text-center font-serif">～ 探查各方战场中 ～ ♪</div>
          )}

          {!roomsLoading && rooms.length === 0 && (
            <div className="text-center py-10">
              <div className="text-4xl mb-2">🌸</div>
              <p className="text-gold text-sm font-serif mb-1">群雄尚未集结…</p>
              <p className="text-pink-300/40 text-xs font-serif">率先开辟战场者，乃真勇士也！(ง •̀_•́)ง</p>
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
                    onClick={() => doJoin(room.code)}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      room.status === 'waiting' ? 'bg-green-400' :
                      room.status === 'reading' ? 'bg-gold animate-pulse' : 'bg-muted'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium truncate">{room.deck_name}</span>
                        <span className={`text-xs shrink-0 ${s.color}`}>{s.text}</span>
                      </div>
                      <div className="text-muted text-xs mt-0.5">
                        👑 {room.host_name} · {room.player_count} 位战士
                      </div>
                    </div>
                    {room.status !== 'end' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs group-hover:text-gold transition-all ${room.training ? 'text-orange-400/60' : room.status === 'waiting' ? 'text-gold/60' : 'text-muted'}`}>
                          {room.training ? '🏋️ 旁观 →' : room.status === 'waiting' ? '加入 →' : '旁观 →'}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={async e => {
                              e.stopPropagation()
                              if (!confirm(`强制结束「${room.deck_name}」对局？`)) return
                              await api.rooms.forceEnd(room.id).catch(() => null)
                              loadRooms()
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded transition-all hover:scale-105"
                            style={{ background: 'rgba(255,165,0,0.12)', border: '1px solid rgba(255,165,0,0.35)', color: 'rgba(255,165,0,0.9)' }}>
                            ⚡结束
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* 公共牌组快速开战 */}
        {publicDecks.length > 0 && (() => {
          const filtered = deckSearch
            ? publicDecks.filter(d => d.name.toLowerCase().includes(deckSearch.toLowerCase()))
            : publicDecks
          return (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-pink-500/20 to-transparent" />
                <h2 className="font-serif text-sm text-gold shrink-0">🌐 万阵共享 · 即刻出阵</h2>
                <div className="h-px flex-1 bg-gradient-to-r from-pink-500/20 via-transparent to-transparent" />
              </div>
              <div className="relative mb-3">
                <input
                  type="text"
                  value={deckSearch}
                  onChange={e => setDeckSearch(e.target.value)}
                  placeholder="以名索阵…"
                  className="input-dark text-sm w-full pl-9"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/40 text-sm">🔮</span>
              </div>
              {filtered.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {filtered.map((deck) => (
                    <div key={deck.id}
                      className="rounded-lg p-3 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-pink-500/10 transition-all cursor-pointer"
                      style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.5), rgba(var(--accent-bg-mid),0.8))', border: '1px solid rgba(var(--accent-primary),0.1)' }}
                      onClick={() => navigate(`/rooms/new?deck_id=${deck.id}`)}>
                      <h3 className="text-white/90 text-xs font-medium truncate">{deck.name}</h3>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-pink-300/30 text-xs">🃏 {deck.card_count}</span>
                        <span className="text-gold/50 text-xs">⚔️</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-pink-300/40 text-xs text-center py-4 font-serif">未寻得匹配之阵… 换个咒语试试？(◕‿◕✿)</p>
              )}
            </div>
          )
        })()}
      </div>
    </Layout>
  )
}

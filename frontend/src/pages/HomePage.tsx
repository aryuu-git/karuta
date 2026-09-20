import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { KeyRound, Swords, Crown, RefreshCw, Zap, Search, Star, Layers, Globe, Castle } from 'lucide-react'
import { Layout } from '../components/Layout'
import { Button, Input, Badge, EmptyState, type BadgeTone } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import type { Deck, RoomListItem } from '../api/types'

/** 房间状态 → 徽章文案与色调（设计系统状态色 token） */
const STATUS_LABEL: Record<string, { text: string; tone: BadgeTone }> = {
  waiting: { text: '招募中', tone: 'success' },
  reading: { text: '激战中', tone: 'crimson' },
  paused:  { text: '暂停中', tone: 'muted' },
  end:     { text: '已结束', tone: 'muted' },
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
      setJoinError(err instanceof Error ? err.message : '未能入阵——请核对令牌。')
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

        {/* 邀请码入场 + 创建房间 */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex-1 rounded-2xl p-5 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgb(var(--accent-bg)/ 0.3) 0%, rgb(var(--accent-bg-mid)/ 0.7) 50%, rgb(var(--accent-bg-end)/ 0.3) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.15)' }}>
            <div className="absolute top-0 left-0 w-20 h-20 opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgb(var(--glow-color)/ 0.8), transparent 70%)' }} />
            <h2 className="font-serif text-title text-gold font-bold mb-1 relative flex items-center gap-1.5">
              <KeyRound size={16} className="text-gold-dark" />
              凭令入场
            </h2>
            <p className="text-muted/50 text-caption mb-3 font-serif italic relative">持令者，径直入阵。</p>
            <form onSubmit={handleJoinByCode} className="flex gap-2 relative">
              <Input
                type="text"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(null) }}
                className="text-center font-serif font-bold tracking-[0.2em] text-sm"
                placeholder="输入令牌…"
                maxLength={10}
                aria-label="房间邀请码"
              />
              <Button type="submit" loading={joining} disabled={!joinCode.trim()} className="shrink-0">
                降临！
              </Button>
            </form>
            {joinError && (
              <p className="text-crimson text-xs mt-2 text-center bg-crimson/10 border border-crimson/20 rounded-lg px-2 py-1.5">
                {joinError}
              </p>
            )}
          </div>

          <div className="sm:w-52 rounded-2xl p-5 flex flex-col items-center justify-center relative overflow-hidden"
            style={{ background: 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.5), rgb(var(--accent-bg-mid)/ 0.8))', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}>
            <div className="absolute bottom-0 right-0 w-16 h-16 opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgb(var(--accent-primary)/ 0.8), transparent 70%)' }} />
            <Button onClick={() => navigate('/rooms/new')} className="w-full" icon={<Swords size={16} />}>
              开辟战场
            </Button>
            <p className="text-muted/40 text-xs mt-2 text-center font-serif italic relative">选定阵容，向命运宣战。</p>
          </div>
        </div>

        {/* 我的牌组（快速入口） */}
        {myDecks.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-sm text-gold/80 flex items-center gap-1.5">
                <Layers size={14} />
                我的战阵
              </h2>
              <button onClick={() => navigate('/decks')} className="text-muted/40 text-xs hover:text-gold transition-colors font-serif">
                全部阵容 →
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {myDecks.slice(0, 4).map(deck => (
                <div key={deck.id}
                  className="rounded-lg p-3 hover:-translate-y-0.5 hover:shadow-card transition-all cursor-pointer group"
                  style={{ background: 'linear-gradient(180deg, rgb(var(--accent-bg-end)/ 0.5), rgb(var(--accent-bg-mid)/ 0.8))', border: '1px solid rgb(var(--accent-primary)/ 0.1)' }}
                  onClick={() => navigate(`/decks/${deck.id}`)}>
                  <h3 className="text-white/80 text-xs font-medium truncate">{deck.name}</h3>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-muted/30 text-[10px]">{deck.card_count} 张</span>
                    <button onClick={e => { e.stopPropagation(); navigate(`/rooms/new?deck_id=${deck.id}`) }}
                      className="inline-flex items-center gap-0.5 text-[10px] text-gold/40 group-hover:text-gold transition-colors">
                      <Swords size={10} />
                      出阵
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GitHub 开源仓库 */}
        <a href="https://github.com/aryuu-git/karuta" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 mb-4 px-4 py-2 rounded-xl transition-all hover:scale-[1.01]"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Star size={14} className="text-white/60" />
          <span className="text-xs text-white/50">GitHub 开源仓库</span>
          <span className="ml-auto text-[10px] text-muted/40">aryuu-git/karuta</span>
        </a>

        {/* 战场大厅 */}
        <div className="rounded-2xl overflow-hidden mb-8"
          style={{ background: 'linear-gradient(180deg, rgb(var(--accent-bg-end)/ 0.4) 0%, rgb(var(--accent-bg-mid)/ 0.7) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}>
          <div className="flex items-center justify-between px-5 py-3.5 relative"
            style={{ borderBottom: '1px solid rgb(var(--accent-primary)/ 0.08)' }}>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-title text-gold font-bold flex items-center gap-1.5">
                <Castle size={16} className="text-gold-dark" />
                战场大厅
              </h2>
              <span className="text-muted/30 text-xs font-serif italic">群雄争霸之地</span>
            </div>
            <button onClick={loadRooms}
              className="flex items-center gap-1 text-muted/40 text-xs hover:text-gold transition-all duration-fast">
              <RefreshCw size={12} />
              刷新
            </button>
          </div>

          {roomsLoading && (
            <div className="text-muted/50 text-xs animate-pulse py-8 text-center font-serif">～ 探查各方战场中 ～</div>
          )}

          {!roomsLoading && rooms.length === 0 && (
            <EmptyState
              icon={<Castle size={44} strokeWidth={1.5} />}
              title="群雄尚未集结…"
              description="率先开辟战场者，乃真勇士也。"
              className="py-8"
            />
          )}

          <div className="divide-y divide-border">
            <AnimatePresence>
              {rooms.map((room, i) => {
                const s = STATUS_LABEL[room.status] ?? { text: room.status, tone: 'muted' as BadgeTone }
                return (
                  <motion.div key={room.id}
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 px-5 py-3 transition-colors group hover:bg-gold/5 cursor-pointer"
                    onClick={() => doJoin(room.code)}>
                    {/* 状态呼吸点 */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      room.status === 'waiting' ? 'bg-success' :
                      room.status === 'reading' ? 'bg-gold animate-pulse' : 'bg-muted'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium truncate">{room.deck_name}</span>
                        <Badge tone={s.tone}>{s.text}</Badge>
                      </div>
                      <div className="text-muted text-xs mt-0.5 flex items-center gap-1">
                        <Crown size={11} className="text-gold-foil/60" />
                        {room.host_name} · {room.player_count} 位战士
                      </div>
                    </div>
                    {room.status !== 'end' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs group-hover:text-gold transition-all ${room.training ? 'text-warning/60' : room.status === 'waiting' ? 'text-gold/60' : 'text-muted'}`}>
                          {room.training ? '旁观 →' : room.status === 'waiting' ? '加入 →' : '旁观 →'}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={async e => {
                              e.stopPropagation()
                              if (!confirm(`强制结束「${room.deck_name}」对局？`)) return
                              await api.rooms.forceEnd(room.id).catch(() => null)
                              loadRooms()
                            }}
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded text-warning border border-warning/35 bg-warning/10 transition-all hover:scale-105">
                            <Zap size={10} />
                            结束
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
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
                <h2 className="font-serif text-sm text-gold shrink-0 flex items-center gap-1.5">
                  <Globe size={14} />
                  万阵共享 · 即刻出阵
                </h2>
                <div className="h-px flex-1 bg-gradient-to-r from-gold/20 via-transparent to-transparent" />
              </div>
              <div className="relative mb-3">
                <Input
                  type="text"
                  value={deckSearch}
                  onChange={e => setDeckSearch(e.target.value)}
                  placeholder="以名索阵…"
                  className="text-sm pl-9"
                  aria-label="搜索公共牌组"
                />
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/40" />
              </div>
              {filtered.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {filtered.map((deck) => (
                    <div key={deck.id}
                      className="rounded-lg p-3 hover:-translate-y-0.5 hover:shadow-card transition-all cursor-pointer"
                      style={{ background: 'linear-gradient(180deg, rgb(var(--accent-bg-end)/ 0.5), rgb(var(--accent-bg-mid)/ 0.8))', border: '1px solid rgb(var(--accent-primary)/ 0.1)' }}
                      onClick={() => navigate(`/rooms/new?deck_id=${deck.id}`)}>
                      <h3 className="text-white/90 text-xs font-medium truncate">{deck.name}</h3>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-muted/30 text-xs">{deck.card_count}</span>
                        <Swords size={12} className="text-gold/50" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted/40 text-xs text-center py-4 font-serif">未寻得匹配之阵…换个名字试试。</p>
              )}
            </div>
          )
        })()}
      </div>
    </Layout>
  )
}

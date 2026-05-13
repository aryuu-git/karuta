import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../components/Layout'
import { api } from '../api/client'
import type { Deck } from '../api/types'

type Tab = 'mine' | 'editable' | 'public'

const SHARE_BADGE: Record<string, { text: string; style: string }> = {
  private: { text: '🔒 私有', style: 'text-muted/60' },
  playable: { text: '🎮 可使用', style: 'text-green-400/80' },
  editable: { text: '✏️ 可编辑', style: 'text-gold/80' },
}

export function DecksPage() {
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('mine')
  const [myDecks, setMyDecks] = useState<Deck[]>([])
  const [editableDecks, setEditableDecks] = useState<Deck[]>([])
  const [publicDecks, setPublicDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOwner, setFilterOwner] = useState('')

  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newShareLevel, setNewShareLevel] = useState('private')
  const [newEditLevel, setNewEditLevel] = useState('add_only')
  const [creating, setCreating] = useState(false)

  const loadDecks = async (t: Tab) => {
    setLoading(true)
    try {
      if (t === 'mine') {
        const data = await api.decks.listMine()
        setMyDecks(data)
      } else if (t === 'editable') {
        const data = await api.decks.listEditable()
        setEditableDecks(data)
      } else {
        const data = await api.decks.listPublic(filterOwner || undefined)
        setPublicDecks(data)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadDecks(tab)
  }, [tab])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const deck = await api.decks.create(newName.trim(), newDesc.trim(), newShareLevel, newEditLevel)
      setMyDecks(prev => [deck, ...prev])
      setShowCreate(false)
      setNewName(''); setNewDesc('')
      setNewShareLevel('private'); setNewEditLevel('add_only')
    } catch { /* ignore */ }
    finally { setCreating(false) }
  }

  const allDecks = tab === 'mine' ? myDecks : tab === 'editable' ? editableDecks : publicDecks
  const decks = searchQuery
    ? allDecks.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allDecks

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header with decorative gradient */}
        <div className="relative mb-8 overflow-hidden rounded-2xl p-6"
          style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.4) 0%, rgba(var(--accent-bg-mid),0.8) 50%, rgba(var(--accent-bg-end),0.4) 100%)', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
          <div className="absolute top-0 right-0 w-32 h-32 opacity-10 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(var(--glow-color),0.8), transparent 70%)' }} />
          <div className="flex items-center justify-between relative">
            <div>
              <h1 className="font-serif text-2xl text-gold font-bold tracking-wide">
                ⚔️ 战阵编纂所
              </h1>
              <p className="text-pink-300/60 text-sm mt-1 font-serif italic">
                {tab === 'mine' ? '编排你的最强阵容，战无不胜！✧' : tab === 'editable' ? '同盟之力，共铸战阵 ♪' : '天下阵法，尽收眼底 ～ ✦'}
              </p>
            </div>
            <button onClick={() => setShowCreate(true)}
              className="btn-gold text-sm transition-all duration-200 hover:scale-105 shadow-lg shadow-gold/20">
              ✨ 锻造新阵
            </button>
          </div>
        </div>

        {/* Tabs - pill style */}
        <div className="flex gap-0.5 mb-6 bg-white/5 rounded-xl p-1 w-fit">
          <button onClick={() => setTab('mine')}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === 'mine'
                ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
                : 'text-muted hover:text-white/70'
            }`}>
            📦 我的战阵
          </button>
          <button onClick={() => setTab('editable')}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === 'editable'
                ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
                : 'text-muted hover:text-white/70'
            }`}>
            ✏️ 共编之阵
          </button>
          <button onClick={() => setTab('public')}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === 'public'
                ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
                : 'text-muted hover:text-white/70'
            }`}>
            🌐 万阵共享
          </button>
        </div>

        {/* Search */}
        <div className="mb-5">
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="input-dark text-sm w-full pl-9"
                placeholder="以名索阵，寻觅你的命定之编…"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/40 text-sm">🔮</span>
            </div>
            {tab === 'public' && (
              <input
                type="text"
                value={filterOwner}
                onChange={e => { setFilterOwner(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Enter') loadDecks('public') }}
                className="text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/5 text-white/70 w-28 placeholder:text-white/30 focus:border-gold/30 outline-none"
                placeholder="创建人"
              />
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-pink-300/50 text-sm animate-pulse py-16 text-center font-serif">
            ～ 正在检索战阵典籍 ～ ♪
          </div>
        )}

        {/* Empty state */}
        {!loading && decks.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-20 rounded-2xl"
            style={{ background: 'linear-gradient(160deg, rgba(var(--accent-bg-end),0.5), rgba(var(--accent-bg-mid),0.8))', border: '1px dashed rgba(var(--accent-primary),0.2)' }}>
            <div className="text-5xl mb-3">🌸</div>
            {tab === 'mine' ? (
              <>
                <p className="text-gold text-base font-serif mb-1">此处空无一阵…</p>
                <p className="text-pink-300/50 text-sm mb-5 font-serif">战阵尚未铸成，去锻造你的第一副吧！✧</p>
                <button onClick={() => setShowCreate(true)}
                  className="btn-gold text-sm transition-all duration-200 hover:scale-105 shadow-lg shadow-gold/20">
                  ✨ 锻造第一副战阵
                </button>
              </>
            ) : (
              <>
                <p className="text-gold text-base font-serif mb-1">暂无可用之阵…</p>
                <p className="text-pink-300/40 text-sm font-serif">等待同盟之人共享吧 (◕‿◕✿)</p>
              </>
            )}
          </motion.div>
        )}

        {/* Deck grid */}
        {!loading && decks.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {decks.map((deck, i) => (
                <motion.div key={deck.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.04 }}
                  className="group relative rounded-xl overflow-hidden
                             cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-pink-500/10 transition-all duration-250"
                  style={{ background: 'linear-gradient(180deg, var(--color-ink) 0%, var(--color-ink-deep) 100%)', border: '1px solid rgba(var(--accent-primary),0.12)' }}
                  onClick={() => navigate(`/decks/${deck.id}`)}>
                  {/* Top accent gradient */}
                  <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, rgba(var(--glow-color),0.4), rgba(var(--accent-primary),0.4), rgba(var(--glow-color),0.4))' }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-sans font-semibold text-white text-sm truncate">{deck.name}</h3>
                      <span className="text-gold text-xs shrink-0">🃏 {deck.card_count}</span>
                    </div>
                    <p className="text-pink-300/40 text-xs line-clamp-1 mb-3">{deck.description || '尚无铭文…'}</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${SHARE_BADGE[deck.share_level]?.style || 'text-muted'}`}>
                        {SHARE_BADGE[deck.share_level]?.text || deck.share_level}
                      </span>
                      {deck.owner_name && tab !== 'mine' && (
                        <span className="text-muted/50 text-xs">by {deck.owner_name}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid rgba(var(--accent-primary),0.08)' }}>
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/decks/${deck.id}`) }}
                        className="text-xs text-gold/70 hover:text-gold transition-all px-2.5 py-1.5 rounded-lg border border-gold/20 hover:border-gold/50 hover:bg-gold/5">
                        👀 查看
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/rooms/new?deck_id=${deck.id}`) }}
                        className="text-xs text-gold/70 hover:text-gold transition-all px-2.5 py-1.5 rounded-lg border border-gold/20 hover:border-gold/50 hover:bg-gold/5">
                        ⚔️ 出阵
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Create dialog */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setShowCreate(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ink-deep rounded-xl p-6 w-full max-w-sm"
              style={{ border: '1px solid rgba(var(--accent-primary),0.15)', boxShadow: '0 0 60px rgba(var(--accent-primary),0.1)' }}
              onClick={e => e.stopPropagation()}>
              <h3 className="font-serif font-bold text-gold mb-1 text-lg">✨ 铸造新阵</h3>
              <p className="text-pink-300/50 text-xs mb-5 font-serif italic">赐予你的战阵一个响彻天下的名号吧！✧</p>
              <form onSubmit={handleCreate} className="flex flex-col gap-4">
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
                <div>
                  <label className="text-muted text-xs block mb-1.5">🌐 共享级别</label>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { value: 'private', label: '🔒 私有' },
                      { value: 'playable', label: '🎮 可使用' },
                      { value: 'editable', label: '✏️ 可编辑' },
                    ] as const).map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setNewShareLevel(opt.value)}
                        className={`text-xs px-2.5 py-1.5 rounded-md transition-all ${
                          newShareLevel === opt.value
                            ? 'bg-gold/20 text-gold border border-gold/40'
                            : 'bg-white/5 text-white/50 border border-transparent hover:border-white/10'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {newShareLevel === 'editable' && (
                  <div>
                    <label className="text-muted text-xs block mb-1.5">📝 编辑权限</label>
                    <div className="flex gap-2">
                      {([
                        { value: 'add_only', label: '仅添加' },
                        { value: 'full', label: '完全编辑' },
                      ] as const).map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => setNewEditLevel(opt.value)}
                          className={`text-xs px-2.5 py-1.5 rounded-md transition-all ${
                            newEditLevel === opt.value
                              ? 'bg-gold/20 text-gold border border-gold/40'
                              : 'bg-white/5 text-white/50 border border-transparent hover:border-white/10'
                          }`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-3 mt-1">
                  <button type="button" onClick={() => setShowCreate(false)} className="btn-outline flex-1 transition-all duration-200 hover:scale-[1.02]">罢了罢了</button>
                  <button type="submit" disabled={creating || !newName.trim()} className="btn-gold flex-1 disabled:opacity-50 transition-all duration-200 hover:scale-[1.02] shadow-lg shadow-gold/20">
                    {creating ? '铸造中… (｡･ω･｡)' : '✨ 铸成！'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}

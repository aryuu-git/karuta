import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../components/Layout'
import { api } from '../api/client'
import type { Card } from '../api/types'

type Tab = 'mine' | 'public'

export function CardLibraryPage() {
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('mine')
  const [myCards, setMyCards] = useState<Card[]>([])
  const [publicCards, setPublicCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [cloneMsg, setCloneMsg] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [filterTag, setFilterTag] = useState('')
  const [allPublicTags, setAllPublicTags] = useState<string[]>([])

  useEffect(() => {
    api.cards.listTags().then(setAllPublicTags).catch(() => {})
  }, [])
  const PAGE_SIZE = 50

  const loadMyCards = useCallback(async () => {
    setLoading(true)
    try {
      const cards = await api.cards.listMine()
      setMyCards(cards)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  const [filterOwner, setFilterOwner] = useState('')

  const loadPublicCards = useCallback(async (query?: string, tag?: string, pageNum = 1, owner?: string) => {
    setLoading(true)
    try {
      const cards = await api.cards.listPublic({ search: query || undefined, tag: tag || undefined, owner: owner || undefined, size: PAGE_SIZE, page: pageNum })
      setPublicCards(cards)
      setHasMore(cards.length >= PAGE_SIZE)
      setPage(pageNum)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (tab === 'mine') {
      loadMyCards()
    } else {
      loadPublicCards(search, filterTag, 1, filterOwner)
    }
  }, [tab, filterTag])

  const handleSearch = () => {
    if (tab === 'public') {
      loadPublicCards(search, filterTag, 1, filterOwner)
    }
  }


  const handleDelete = async (id: number) => {
    setDeleting(true)
    try {
      await api.cards.delete(id)
      setMyCards(prev => prev.filter(c => c.id !== id))
      setDeleteId(null)
    } catch { /* ignore */ }
    finally { setDeleting(false) }
  }

  const handleBatchDelete = async () => {
    if (selectedCards.size === 0) return
    setBatchDeleting(true)
    try {
      for (const id of selectedCards) {
        await api.cards.delete(id)
      }
      setMyCards(prev => prev.filter(c => !selectedCards.has(c.id)))
      setSelectedCards(new Set())
      setSelectMode(false)
    } catch { /* ignore */ }
    finally { setBatchDeleting(false) }
  }

  const toggleCardSelect = (id: number) => {
    setSelectedCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredMyCards = myCards.filter(c => {
    if (search && !c.display_text?.toLowerCase().includes(search.toLowerCase()) && !c.series?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterTag && !c.tags?.includes(filterTag)) return false
    return true
  })
  const cards = tab === 'mine' ? filteredMyCards : publicCards

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
                ✿ 歌牌殿堂
              </h1>
              <p className="text-pink-300/60 text-sm mt-1 font-serif italic">
                {tab === 'mine' ? '吾之歌牌收藏，皆为珍宝 ♪' : '天下歌牌，尽在此处 ～ ♫'}
              </p>
            </div>
            {tab === 'mine' && !selectMode && (
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectMode(true)}
                  className="text-xs px-3 py-1.5 rounded-full text-muted/60 hover:text-gold transition-all hover:bg-gold/5"
                  style={{ border: '1px solid rgba(var(--accent-primary),0.15)' }}>
                  ☑ 编辑
                </button>
                <button onClick={() => navigate('/cards/new')}
                  className="btn-gold text-sm transition-all duration-200 hover:scale-105 shadow-lg shadow-gold/20">
                  ✨ 召唤新牌
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 mb-6 bg-white/5 rounded-xl p-1 w-fit">
          <button
            onClick={() => { setTab('mine'); setSelectMode(false); setSelectedCards(new Set()) }}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === 'mine'
                ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
                : 'text-muted hover:text-white/70'
            }`}>
            🎵 我的收藏
          </button>
          <button
            onClick={() => { setTab('public'); setSelectMode(false); setSelectedCards(new Set()) }}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === 'public'
                ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
                : 'text-muted hover:text-white/70'
            }`}>
            🌐 万牌共享
          </button>
        </div>

        {/* Search + tag filter (both tabs) */}
        {(
          <div className="mb-5 space-y-2.5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                  className="input-dark w-full text-sm pl-9"
                  placeholder="输入关键词，寻找你的命定之牌…"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/40 text-sm">🔮</span>
              </div>
              <button onClick={handleSearch}
                className="px-4 py-2 text-sm rounded-lg transition-all hover:scale-105 shrink-0"
                style={{ background: 'linear-gradient(135deg, rgba(var(--glow-color),0.2), rgba(var(--accent-primary),0.2))', border: '1px solid rgba(var(--glow-color),0.3)', color: 'var(--color-gold)' }}>
                探索
              </button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(() => {
                const tagCounts = new Map<string, number>()
                const source = tab === 'mine' ? myCards : publicCards
                source.forEach(c => {
                  if (c.tags) c.tags.split(',').forEach(t => { const tag = t.trim(); if (tag) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1) })
                })
                // Use all public tags from API for public tab, local tags for mine tab
                const allTags = tab === 'public'
                  ? [...new Set(['游戏', '动画', ...allPublicTags])]
                  : ['游戏', '动画', ...Array.from(tagCounts.keys()).filter(t => t !== '游戏' && t !== '动画')]
                return ['', ...allTags].map(t => {
                  const count = t ? (tagCounts.get(t) || 0) : source.length
                  return (
                    <button key={t}
                      onClick={() => setFilterTag(t)}
                      className={`text-xs px-3 py-1.5 rounded-full transition-all ${
                        filterTag === t
                          ? 'bg-gradient-to-r from-gold/25 to-pink-500/15 text-gold border border-gold/40'
                          : 'bg-white/5 text-white/40 border border-white/5 hover:border-pink-300/20 hover:text-pink-300/70'
                      }`}>
                      {t || '✦ 全部'}{count > 0 ? ` (${count})` : ''}
                    </button>
                  )
                })
              })()}
            </div>
            {tab === 'public' && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-muted text-xs">创建人:</span>
                <input type="text" value={filterOwner}
                  onChange={e => setFilterOwner(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') loadPublicCards(search, filterTag, 1, filterOwner) }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-white/70 w-28 placeholder:text-white/30 focus:border-gold/30 outline-none"
                  placeholder="输入用户名" />
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-pink-300/50 text-sm animate-pulse py-16 text-center font-serif">
            ～ 正在翻阅歌牌典籍 ～ ♪
          </div>
        )}

        {/* Empty state */}
        {!loading && cards.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-20 rounded-2xl"
            style={{ background: 'linear-gradient(160deg, rgba(var(--accent-bg-end),0.5), rgba(var(--accent-bg-mid),0.8))', border: '1px dashed rgba(var(--accent-primary),0.2)' }}>
            <div className="text-5xl mb-3">🌸</div>
            {tab === 'mine' ? (
              <>
                <p className="text-gold text-base font-serif mb-1">此处空无一物…</p>
                <p className="text-pink-300/50 text-sm mb-5 font-serif">命运之牌尚未觉醒，去召唤你的第一张吧！✧</p>
                <button onClick={() => navigate('/cards/new')}
                  className="btn-gold text-sm transition-all duration-200 hover:scale-105 shadow-lg shadow-gold/20">
                  ✨ 召唤第一张歌牌
                </button>
              </>
            ) : (
              <>
                <p className="text-gold text-base font-serif mb-1">未寻得匹配之牌…</p>
                <p className="text-pink-300/40 text-sm font-serif">换个咒语再试试？(◕‿◕✿)</p>
              </>
            )}
          </motion.div>
        )}

        {/* Card list */}
        {/* 多选工具栏 */}
        {selectMode && tab === 'mine' && (
          <div className="mb-3 flex items-center justify-between px-4 py-2.5 rounded-xl"
            style={{ background: 'rgba(var(--accent-primary),0.08)', border: '1px solid rgba(var(--accent-primary),0.2)' }}>
            <div className="flex items-center gap-3">
              <button onClick={() => {
                if (selectedCards.size === filteredMyCards.length) setSelectedCards(new Set())
                else setSelectedCards(new Set(filteredMyCards.map(c => c.id)))
              }}
                className="text-xs text-gold/80 hover:text-gold transition-colors">
                {selectedCards.size === filteredMyCards.length ? '取消全选' : '全选'}
              </button>
              <span className="text-muted text-xs font-serif">
                已选中 <span className="text-gold font-bold">{selectedCards.size}</span> 张
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(['private', 'playable', 'editable'] as const).map(level => {
                const labels = { private: '🔒 私有', playable: '👁 可使用', editable: '✏️ 可编辑' }
                const colors = { private: 'rgba(150,150,150,', playable: 'rgba(74,144,217,', editable: 'rgba(34,197,94,' }
                return (
                  <button key={level}
                    disabled={selectedCards.size === 0}
                    onClick={async () => {
                      try {
                        await api.cards.batchShare([...selectedCards], level)
                        setMyCards(prev => prev.map(c => selectedCards.has(c.id) ? { ...c, share_level: level, is_shared: level !== 'private' } : c))
                        setCloneMsg(`✓ 已设为${labels[level]}`)
                        setTimeout(() => setCloneMsg(null), 2000)
                      } catch { }
                    }}
                    className="text-[10px] px-2 py-1 rounded-lg font-medium transition-all disabled:opacity-30 hover:scale-105"
                    style={{ background: `${colors[level]}0.12)`, border: `1px solid ${colors[level]}0.35)`, color: `${colors[level]}0.9)` }}>
                    {labels[level]}
                  </button>
                )
              })}
              <button onClick={handleBatchDelete}
                disabled={selectedCards.size === 0 || batchDeleting}
                className="text-[10px] px-2 py-1 rounded-lg font-medium transition-all disabled:opacity-30 hover:scale-105"
                style={{ background: 'rgba(192,57,43,0.15)', border: '1px solid rgba(192,57,43,0.3)', color: 'rgba(192,57,43,0.9)' }}>
                {batchDeleting ? '…' : '🗑️ 删除'}
              </button>
              <button onClick={() => { setSelectMode(false); setSelectedCards(new Set()) }}
                className="text-[10px] px-2 py-1 rounded-lg text-muted hover:text-white transition-colors"
                style={{ border: '1px solid rgba(var(--accent-primary),0.1)' }}>
                完成
              </button>
            </div>
          </div>
        )}

        {!loading && cards.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
            <AnimatePresence>
              {cards.map((card, i) => (
                <motion.div key={card.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.008 }}
                  className={`group relative rounded-lg overflow-hidden cursor-pointer
                             hover:-translate-y-1 hover:shadow-lg hover:shadow-pink-500/10 transition-all duration-250 ${
                               selectMode && selectedCards.has(card.id) ? 'ring-2 ring-gold' : ''
                             }`}
                  style={{ border: `1px solid ${selectMode && selectedCards.has(card.id) ? 'rgba(var(--accent-primary),0.6)' : 'rgba(var(--accent-primary),0.12)'}`, background: 'linear-gradient(180deg, var(--color-ink) 0%, var(--color-ink-deep) 100%)' }}
                  onClick={() => selectMode && tab === 'mine' ? toggleCardSelect(card.id) : navigate(`/cards/${card.id}`)}>
                  {/* Cover with gradient overlay */}
                  <div className="relative w-full overflow-hidden"
                    style={{ aspectRatio: '3/4', background: 'var(--color-ink-deep)' }}>
                    {card.cover_url ? (
                      <img src={card.cover_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"
                        style={{ background: 'linear-gradient(160deg, rgba(var(--accent-bg),0.3), rgba(var(--accent-bg-mid),0.8))' }}>
                        <span className="text-gold/15 font-serif text-2xl">♪</span>
                      </div>
                    )}
                    {/* Hover glow */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                      style={{ background: 'linear-gradient(180deg, transparent 60%, rgba(var(--glow-color),0.1) 100%)' }} />
                    {/* Audio count badge */}
                    {(card.audio_count ?? 1) > 1 && (
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
                        style={{ background: 'rgba(0,0,0,0.7)', color: 'var(--color-gold)', border: '1px solid rgba(var(--glow-color),0.3)' }}>
                        ♪{card.audio_count}
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="px-1.5 py-1.5">
                    <p className="text-white/80 text-[11px] truncate leading-tight font-medium">
                      {card.display_text || '？？？'}
                    </p>
                    <p className="text-pink-300/30 text-[9px] truncate mt-0.5">
                      {card.series || (tab === 'public' && card.owner_name ? card.owner_name : '')}
                    </p>
                  </div>
                  {/* Delete */}
                  {tab === 'mine' && (
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteId(card.id) }}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity
                                 w-5 h-5 rounded-full flex items-center justify-center text-pink-200/60 hover:text-crimson
                                 hover:bg-crimson/20 text-[10px]"
                      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                      ×
                    </button>
                  )}
                  {/* Clone */}
                  {tab === 'public' && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        try {
                          await api.cards.clone(card.id)
                          setCloneMsg('✓ 已复制到我的牌库！')
                          setTimeout(() => setCloneMsg(null), 2000)
                        } catch (err) {
                          setCloneMsg((err as Error).message || '复制失败')
                          setTimeout(() => setCloneMsg(null), 2000)
                        }
                      }}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity
                                 px-1.5 py-0.5 rounded flex items-center justify-center text-[9px] font-medium"
                      style={{ background: 'rgba(0,0,0,0.7)', color: 'var(--color-gold)', border: '1px solid rgba(var(--glow-color),0.3)', backdropFilter: 'blur(4px)' }}>
                      复制
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Pagination */}
        {!loading && tab === 'public' && cards.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button onClick={() => { setPage(1); loadPublicCards(search, filterTag, 1, filterOwner) }}
              disabled={page <= 1}
              className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all hover:bg-gold/10 text-muted hover:text-gold border border-white/5">
              首页
            </button>
            <button onClick={() => { const p = page - 1; setPage(p); loadPublicCards(search, filterTag, p, filterOwner) }}
              disabled={page <= 1}
              className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all hover:bg-gold/10 text-muted hover:text-gold border border-white/5">
              ‹ 上一页
            </button>
            <span className="text-xs px-3 py-1.5 rounded-lg bg-gold/15 text-gold border border-gold/30 font-medium">
              第 {page} 页
            </span>
            <button onClick={() => { const p = page + 1; setPage(p); loadPublicCards(search, filterTag, p, filterOwner) }}
              disabled={!hasMore}
              className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all hover:bg-gold/10 text-muted hover:text-gold border border-white/5">
              下一页 ›
            </button>
          </div>
        )}
      </div>

      {/* Delete confirm dialog */}
      <AnimatePresence>
        {deleteId !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setDeleteId(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ink-deep border border-border rounded-xl p-6 w-full max-w-xs text-center"
              onClick={e => e.stopPropagation()}>
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="font-sans font-semibold text-white mb-2">真的要删除这张牌吗？(；′⌒`)</h3>
              <p className="text-muted text-sm mb-6">删掉后所有引用这张牌的牌组也会受影响！</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="btn-outline flex-1 transition-all duration-200 hover:scale-[1.02]">再想想</button>
                <button onClick={() => handleDelete(deleteId)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded bg-crimson hover:bg-crimson-light transition-all duration-200 text-white font-medium text-sm disabled:opacity-50 hover:scale-[1.02]">
                  {deleting ? '删除中…' : '狠心删掉 (╥_╥)'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clone feedback toast */}
      <AnimatePresence>
        {cloneMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm"
            style={{ background: 'rgba(0,0,0,0.85)', color: 'var(--color-gold)', border: '1px solid rgba(var(--accent-primary),0.3)' }}>
            {cloneMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}

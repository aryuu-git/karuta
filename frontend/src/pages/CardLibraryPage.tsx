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
  const [selectMode, setSelectMode] = useState(false)
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [filterTag, setFilterTag] = useState('')
  const PAGE_SIZE = 50

  const loadMyCards = useCallback(async () => {
    setLoading(true)
    try {
      const cards = await api.cards.listMine()
      setMyCards(cards)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  const loadPublicCards = useCallback(async (query?: string, tag?: string, pageNum = 1) => {
    setLoading(true)
    try {
      const cards = await api.cards.listPublic({ search: query || undefined, tag: tag || undefined, size: PAGE_SIZE, page: pageNum })
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
      loadPublicCards(search, filterTag, 1)
    }
  }, [tab, filterTag])

  const handleSearch = () => {
    if (tab === 'public') {
      loadPublicCards(search, filterTag, 1)
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
                const allTags = new Set<string>(['游戏', '动画'])
                const source = tab === 'mine' ? myCards : publicCards
                source.forEach(c => {
                  if (c.tags) c.tags.split(',').forEach(t => { if (t.trim()) allTags.add(t.trim()) })
                })
                return ['', ...Array.from(allTags)].map(t => (
                  <button key={t}
                    onClick={() => setFilterTag(t)}
                    className={`text-xs px-3 py-1.5 rounded-full transition-all ${
                      filterTag === t
                        ? 'bg-gradient-to-r from-gold/25 to-pink-500/15 text-gold border border-gold/40'
                        : 'bg-white/5 text-white/40 border border-white/5 hover:border-pink-300/20 hover:text-pink-300/70'
                    }`}>
                    {t || '✦ 全部'}
                  </button>
                ))
              })()}
            </div>
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
            <div className="flex items-center gap-2">
              <button onClick={handleBatchDelete}
                disabled={selectedCards.size === 0 || batchDeleting}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-30 hover:scale-105"
                style={{ background: 'rgba(192,57,43,0.15)', border: '1px solid rgba(192,57,43,0.3)', color: 'rgba(192,57,43,0.9)' }}>
                {batchDeleting ? '删除中…' : `🗑️ 删除选中`}
              </button>
              <button onClick={() => { setSelectMode(false); setSelectedCards(new Set()) }}
                className="text-xs px-3 py-1.5 rounded-lg text-muted hover:text-white transition-colors"
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
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Pagination */}
        {!loading && tab === 'public' && cards.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button onClick={() => { setPage(1); loadPublicCards(search, filterTag, 1) }}
              disabled={page <= 1}
              className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all hover:bg-gold/10 text-muted hover:text-gold border border-white/5">
              首页
            </button>
            <button onClick={() => { const p = page - 1; setPage(p); loadPublicCards(search, filterTag, p) }}
              disabled={page <= 1}
              className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all hover:bg-gold/10 text-muted hover:text-gold border border-white/5">
              ‹ 上一页
            </button>
            <span className="text-xs px-3 py-1.5 rounded-lg bg-gold/15 text-gold border border-gold/30 font-medium">
              第 {page} 页
            </span>
            <button onClick={() => { const p = page + 1; setPage(p); loadPublicCards(search, filterTag, p) }}
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
    </Layout>
  )
}

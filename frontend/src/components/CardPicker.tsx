import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../api/client'
import type { Card } from '../api/types'
import { Button, Input } from './ui'

type Tab = 'mine' | 'public'

interface CardPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (cardIds: number[]) => void
  excludeIds?: number[]
}

const PAGE_SIZE = 40

export function CardPicker({ open, onClose, onSelect, excludeIds = [] }: CardPickerProps) {
  const [tab, setTab] = useState<Tab>('mine')
  const [myCards, setMyCards] = useState<Card[]>([])
  const [publicCards, setPublicCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [allTags, setAllTags] = useState<string[]>(['游戏', '动画'])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const loadMyCards = useCallback(async () => {
    setLoading(true)
    try {
      const cards = await api.cards.listMine()
      setMyCards(cards)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  const loadPublicCards = useCallback(async (query?: string, tag?: string, owner?: string, pageNum = 1) => {
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
    if (!open) return
    setSelected(new Set())
    setPage(1)
    if (tab === 'mine') {
      loadMyCards()
    } else {
      loadPublicCards(search, filterTag, filterOwner, 1)
    }
    api.cards.listTags().then(tags => setAllTags(['游戏', '动画', ...tags.filter(t => t !== '游戏' && t !== '动画')])).catch(() => {})
  }, [open, tab, filterTag, filterOwner])

  const handleSearch = () => {
    setPage(1)
    if (tab === 'mine') {
      loadMyCards()
    } else {
      loadPublicCards(search, filterTag, filterOwner, 1)
    }
  }

  const toggleCard = (id: number) => {
    if (excludeIds.includes(id)) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    onSelect(Array.from(selected))
    onClose()
  }

  const filteredMyCards = myCards.filter(c => {
    if (search && !c.display_text.toLowerCase().includes(search.toLowerCase()) && !c.series.toLowerCase().includes(search.toLowerCase())) return false
    if (filterTag && !(c.tags || '').includes(filterTag)) return false
    return true
  })
  const cards = tab === 'mine' ? filteredMyCards : publicCards

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-modal flex items-center justify-center px-4 bg-black/75"
        onClick={onClose}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-ink-deep border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
          onClick={e => e.stopPropagation()}>

          {/* Header with gradient */}
          {/* 渐变背景与径向 glow 保留 inline（无法用类表达） */}
          <div className="p-5 shrink-0 relative overflow-hidden border-b border-gold/10"
            style={{ background: 'linear-gradient(135deg, rgb(var(--accent-bg)/ 0.4) 0%, rgb(var(--accent-bg-mid)/ 0.8) 50%, rgb(var(--accent-bg-end)/ 0.4) 100%)' }}>
            <div className="absolute top-0 right-0 w-20 h-20 opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgb(var(--glow-color)/ 0.8), transparent 70%)' }} />
            <h3 className="font-serif text-gold text-lg font-bold mb-1 relative">🎴 选择歌牌</h3>
            <p className="text-gold/50 text-tiny font-serif italic relative">从牌库中选择要加入的牌</p>
          </div>

          {/* Tabs + Search */}
          <div className="px-5 pt-3 shrink-0">
            <div className="flex gap-0.5 mb-3 bg-white/5 rounded-xl p-1 w-fit">
              <button
                onClick={() => setTab('mine')}
                className={`px-4 py-1.5 text-tiny font-medium rounded-lg transition-all ${
                  tab === 'mine'
                    ? 'bg-gradient-to-r from-gold/20 to-gold-dark/10 text-gold shadow-sm'
                    : 'text-muted hover:text-body-text/70'
                }`}>
                🎵 我的牌库
              </button>
              <button
                onClick={() => setTab('public')}
                className={`px-4 py-1.5 text-tiny font-medium rounded-lg transition-all ${
                  tab === 'public'
                    ? 'bg-gradient-to-r from-gold/20 to-gold-dark/10 text-gold shadow-sm'
                    : 'text-muted hover:text-body-text/70'
                }`}>
                🌐 公共牌库
              </button>
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input type="text" value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                    className="pl-8 text-caption"
                    placeholder={tab === 'mine' ? '搜索我的牌…' : '以名寻牌，探索命运之声…'} />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/40 text-tiny">🔮</span>
                </div>
                {/* 动作语义按钮 → ui Button（outline 金描边） */}
                <Button variant="outline" size="sm" onClick={handleSearch} className="shrink-0">
                  搜索
                </Button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {['', ...allTags].map(t => (
                  <button key={t} onClick={() => setFilterTag(t)}
                    className={`text-tiny px-3 py-1 rounded-full transition-all ${
                      filterTag === t
                        ? 'bg-gradient-to-r from-gold/25 to-gold-dark/15 text-gold border border-gold/40'
                        : 'bg-white/5 text-body-text/40 border border-white/5 hover:border-gold/20'
                    }`}>
                    {t ? t : '全部'}
                  </button>
                ))}
                {tab === 'public' && (
                  <input type="text" value={filterOwner}
                    onChange={e => setFilterOwner(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                    className="text-tiny px-2.5 py-1 rounded-full bg-white/5 border border-white/5 text-body-text/70 w-24 placeholder:text-body-text/30 focus:border-gold/30 outline-none"
                    placeholder="创建人" />
                )}
              </div>
            </div>
          </div>

          {/* Card list */}
          <div className="flex-1 overflow-y-auto px-5 py-2">
            {loading && (
              <div className="text-gold/50 text-tiny animate-pulse text-center py-8 font-serif">加载中…</div>
            )}
            {!loading && cards.length === 0 && (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">🌸</div>
                <p className="text-gold text-caption font-serif mb-1">没有可选的牌</p>
                <p className="text-gold/40 text-tiny font-serif">换个关键词试试</p>
              </div>
            )}
            {!loading && cards.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
                {cards.map(card => {
                  const isExcluded = excludeIds.includes(card.id)
                  const isChecked = selected.has(card.id)
                  return (
                    <div key={card.id}
                      onClick={() => toggleCard(card.id)}
                      className={`relative rounded-lg overflow-hidden cursor-pointer transition-all group ${
                        isExcluded ? 'opacity-40 cursor-not-allowed' : 'hover:scale-105'
                      }`}
                      style={{
                        aspectRatio: '3/4',
                        border: isChecked ? '2px solid rgb(var(--color-gold)/ 0.6)' : isExcluded ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgb(var(--color-gold)/ 0.12)',
                        boxShadow: isChecked ? '0 0 10px rgb(var(--glow-color)/ 0.3)' : 'none',
                      }}
                      title={`${card.display_text}${card.series ? ' · ' + card.series : ''}${card.owner_name ? ' by ' + card.owner_name : ''}`}
                    >
                      {card.cover_url ? (
                        <img src={card.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgb(var(--color-ink-deep))' }}>
                          <span className="text-gold/15 font-serif text-lg">♪</span>
                        </div>
                      )}
                      {/* 选中标记 */}
                      {isChecked && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <span className="text-gold text-lg font-bold">✓</span>
                        </div>
                      )}
                      {isExcluded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <span className="text-muted text-tiny">已有</span>
                        </div>
                      )}
                      {/* 底部名称 */}
                      <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/75">
                        <p className="text-body-text/80 text-[9px] truncate leading-tight">{card.display_text || '?'}</p>
                      </div>
                      {/* 音频数 */}
                      {(card.audio_count ?? 1) > 1 && (
                        <div className="absolute top-0.5 left-0.5 px-1 py-0.5 rounded text-[8px] font-bold bg-black/70 text-gold">
                          ♪{card.audio_count}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pagination (public tab only) */}
          {tab === 'public' && (publicCards.length > 0 || page > 1) && (
            <div className="px-5 py-2 shrink-0 flex items-center justify-center gap-2 border-t border-gold/5">
              <button
                disabled={page <= 1}
                onClick={() => loadPublicCards(search, filterTag, filterOwner, page - 1)}
                className="text-tiny px-2.5 py-1 rounded border border-gold/10 text-muted hover:text-gold disabled:opacity-30 transition-all">
                ← 上页
              </button>
              <span className="text-muted text-tiny tabular-nums">第 {page} 页</span>
              <button
                disabled={!hasMore}
                onClick={() => loadPublicCards(search, filterTag, filterOwner, page + 1)}
                className="text-tiny px-2.5 py-1 rounded border border-gold/10 text-muted hover:text-gold disabled:opacity-30 transition-all">
                下页 →
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="p-4 shrink-0 flex items-center justify-between border-t border-gold/10">
            <span className="text-gold/40 text-tiny font-serif">
              {selected.size > 0 ? `已选 ${selected.size} 张` : `共 ${cards.length} 张`}
            </span>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
              <Button variant="gold" size="sm" disabled={selected.size === 0} onClick={handleConfirm}>
                确认选择 {selected.size} 张
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

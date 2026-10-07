import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Music, Globe } from 'lucide-react'
import { api } from '../api/client'
import type { Card } from '../api/types'
import { Button, Input, SearchInput, SegmentedTabs, Scrim } from './ui'

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
        className="fixed inset-0 z-modal flex items-center justify-center px-4"
      >
        {/* 统一遮罩（tone=modal），点击关闭 */}
        <Scrim tone="modal" onClick={onClose} />
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative z-modal bg-ink-deep border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
          onClick={e => e.stopPropagation()}>

          {/* 头部渐变区：panel-hero token 底纹 */}
          <div className="p-5 shrink-0 relative overflow-hidden border-b border-gold/10 bg-panel-hero">
            <h3 className="font-serif text-gold-light text-lg font-bold mb-1 relative">🎴 选择歌牌</h3>
            <p className="text-gold/70 text-tiny relative">从牌库中选择要加入的牌</p>
          </div>

          {/* Tabs + Search */}
          <div className="px-5 pt-3 shrink-0">
            {/* 来源页签：容器分段器 bar */}
            <SegmentedTabs
              variant="bar"
              size="md"
              className="mb-3"
              aria-label="牌库来源"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'mine' as Tab, label: '我的牌库', icon: <Music size={16} aria-hidden="true" /> },
                { value: 'public' as Tab, label: '公共牌库', icon: <Globe size={16} aria-hidden="true" /> },
              ]}
            />
            <div className="space-y-2 mb-3">
              <SearchInput
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                onClear={() => { setSearch(''); if (tab === 'public') loadPublicCards('', filterTag, filterOwner, 1) }}
                placeholder={tab === 'mine' ? '搜索我的牌…' : '搜索歌牌名或作品名…'} />
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* 标签筛选片：SegmentedTabs chip（label 含当前列表计数，0 不显示） */}
                {(() => {
                  const tagCounts = new Map<string, number>()
                  cards.forEach(c => {
                    if (c.tags) c.tags.split(',').forEach(t => { const tag = t.trim(); if (tag) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1) })
                  })
                  return (
                    <SegmentedTabs
                      variant="chip"
                      size="sm"
                      aria-label="标签筛选"
                      value={filterTag}
                      onChange={setFilterTag}
                      options={['', ...allTags].map(t => {
                        const count = t ? (tagCounts.get(t) || 0) : cards.length
                        return { value: t, label: <>{t ? t : '全部'}{count > 0 ? ` (${count})` : ''}</> }
                      })}
                    />
                  )
                })()}
                {tab === 'public' && (
                  <Input size="sm" fit className="w-24 shrink-0"
                    value={filterOwner}
                    onChange={e => setFilterOwner(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                    placeholder="创建人" />
                )}
              </div>
            </div>
          </div>

          {/* Card list */}
          <div className="flex-1 overflow-y-auto px-5 py-2">
            {loading && (
              <div className="text-gold/70 text-tiny animate-pulse text-center py-8 font-serif">加载中…</div>
            )}
            {!loading && cards.length === 0 && (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">🌸</div>
                <p className="text-gold-light/90 text-caption font-serif mb-1">没有可选的牌</p>
                <p className="text-gold/70 text-tiny font-serif">换个关键词试试</p>
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
                      className={`relative rounded-lg overflow-hidden cursor-pointer transition-all group ${isChecked ? 'border-2 border-gold/60 shadow-gold' : isExcluded ? 'border border-white/5' : 'border border-gold/15'} ${
                        isExcluded ? 'opacity-40 cursor-not-allowed' : 'hover:-translate-y-1 hover:shadow-lg'
                      }`}
                      style={{ aspectRatio: '3/4' }}
                      title={`${card.display_text}${card.series ? ' · ' + card.series : ''}${card.owner_name ? ' by ' + card.owner_name : ''}`}
                    >
                      {card.cover_url ? (
                        <img src={card.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-ink-deep">
                          <span className="text-gold/70 font-serif text-lg">♪</span>
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
                        <p className="text-body-text/80 text-[10px] truncate leading-tight">{card.display_text || '?'}</p>
                      </div>
                      {/* 音频数 */}
                      {(card.audio_count ?? 1) > 1 && (
                        <div className="absolute top-0.5 left-0.5 px-1 py-0.5 rounded text-[10px] font-bold bg-black/70 text-gold">
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
            <span className="text-gold/70 text-tiny font-serif">
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

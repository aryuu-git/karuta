import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../api/client'
import type { Card } from '../api/types'

type Tab = 'mine' | 'public'

interface CardPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (cardIds: number[]) => void
  excludeIds?: number[]
}

export function CardPicker({ open, onClose, onSelect, excludeIds = [] }: CardPickerProps) {
  const [tab, setTab] = useState<Tab>('mine')
  const [myCards, setMyCards] = useState<Card[]>([])
  const [publicCards, setPublicCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const loadMyCards = useCallback(async () => {
    setLoading(true)
    try {
      const cards = await api.cards.listMine()
      setMyCards(cards)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  const loadPublicCards = useCallback(async (query?: string, tag?: string) => {
    setLoading(true)
    try {
      const cards = await api.cards.listPublic({ search: query || undefined, tag: tag || undefined, size: 100 })
      setPublicCards(cards)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    if (tab === 'mine') {
      loadMyCards()
    } else {
      loadPublicCards(search, filterTag)
    }
  }, [open, tab, filterTag])

  const handleSearch = () => {
    if (tab === 'public') {
      loadPublicCards(search, filterTag)
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

  const cards = tab === 'mine' ? myCards : publicCards

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ background: 'rgba(0,0,0,0.75)' }}
        onClick={onClose}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-ink-deep border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
          onClick={e => e.stopPropagation()}>

          {/* Header with gradient */}
          <div className="p-5 shrink-0 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.4) 0%, rgba(var(--accent-bg-mid),0.8) 50%, rgba(var(--accent-bg-end),0.4) 100%)', borderBottom: '1px solid rgba(var(--accent-primary),0.1)' }}>
            <div className="absolute top-0 right-0 w-20 h-20 opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(var(--glow-color),0.8), transparent 70%)' }} />
            <h3 className="font-serif text-gold text-lg font-bold mb-1 relative">🎴 召唤歌牌</h3>
            <p className="text-pink-300/50 text-xs font-serif italic relative">从牌库中召唤命定之牌加入战阵 ✧</p>
          </div>

          {/* Tabs + Search */}
          <div className="px-5 pt-3 shrink-0">
            <div className="flex gap-0.5 mb-3 bg-white/5 rounded-xl p-1 w-fit">
              <button
                onClick={() => setTab('mine')}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  tab === 'mine'
                    ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
                    : 'text-muted hover:text-white/70'
                }`}>
                🎵 我的牌库
              </button>
              <button
                onClick={() => setTab('public')}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  tab === 'public'
                    ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
                    : 'text-muted hover:text-white/70'
                }`}>
                🌐 万牌共享
              </button>
            </div>
            {tab === 'public' && (
              <div className="space-y-2 mb-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input type="text" value={search}
                      onChange={e => setSearch(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                      className="input-dark flex-1 text-sm w-full pl-8"
                      placeholder="以名寻牌，探索命运之声…" />
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/40 text-xs">🔮</span>
                  </div>
                  <button onClick={handleSearch}
                    className="px-3 py-1.5 text-xs rounded-lg transition-all hover:scale-105 shrink-0"
                    style={{ background: 'linear-gradient(135deg, rgba(var(--glow-color),0.2), rgba(var(--accent-primary),0.2))', border: '1px solid rgba(var(--glow-color),0.3)', color: 'var(--color-gold)' }}>
                    探索
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {['', '游戏', '动画'].map(t => (
                    <button key={t} onClick={() => setFilterTag(t)}
                      className={`text-xs px-3 py-1 rounded-full transition-all ${
                        filterTag === t
                          ? 'bg-gradient-to-r from-gold/25 to-pink-500/15 text-gold border border-gold/40'
                          : 'bg-white/5 text-white/40 border border-white/5 hover:border-pink-300/20'
                      }`}>
                      {t ? t : '✦ 全部'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Card list */}
          <div className="flex-1 overflow-y-auto px-5 py-2">
            {loading && (
              <div className="text-pink-300/50 text-xs animate-pulse text-center py-8 font-serif">～ 正在翻阅歌牌典籍 ～ ♪</div>
            )}
            {!loading && cards.length === 0 && (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">🌸</div>
                <p className="text-gold text-sm font-serif mb-1">未寻得可选之牌…</p>
                <p className="text-pink-300/40 text-xs font-serif">换个咒语再试试？(◕‿◕✿)</p>
              </div>
            )}
            {!loading && cards.length > 0 && (
              <div className="space-y-2">
                {cards.map(card => {
                  const isExcluded = excludeIds.includes(card.id)
                  const isChecked = selected.has(card.id)
                  return (
                    <div key={card.id}
                      onClick={() => toggleCard(card.id)}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all border ${
                        isExcluded
                          ? 'border-border opacity-50 cursor-not-allowed'
                          : isChecked
                            ? 'border-gold/50 bg-gold/10'
                            : 'border-border hover:border-gold/20'
                      }`}>
                      {/* Checkbox */}
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                        isExcluded
                          ? 'border-muted bg-muted/20'
                          : isChecked
                            ? 'border-gold bg-gold/30'
                            : 'border-border'
                      }`}>
                        {isExcluded && <span className="text-muted text-xs">✓</span>}
                        {isChecked && <span className="text-gold text-xs">✓</span>}
                      </div>

                      {/* Cover thumbnail */}
                      <div className="w-9 h-12 rounded shrink-0 overflow-hidden flex items-center justify-center"
                        style={{ background: 'var(--color-ink-deep)', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
                        {card.cover_url ? (
                          <img src={card.cover_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-gold/20 font-serif text-xs">歌</span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white/80 text-sm truncate">
                          {card.display_text || '未命名'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {card.series && (
                            <span className="text-muted text-xs truncate">📺 {card.series}</span>
                          )}
                          <span className="text-gold/50 text-xs">♪×{card.audio_count ?? 1}</span>
                        </div>
                      </div>

                      {isExcluded && (
                        <span className="text-muted text-xs shrink-0">已在牌组中</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 shrink-0 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(var(--accent-primary),0.08)' }}>
            <span className="text-pink-300/40 text-xs font-serif">
              {selected.size > 0 ? `已选中 ${selected.size} 张命运之牌 ✧` : '挑选你心仪的歌牌吧 ♪'}
            </span>
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-outline text-sm px-4">罢了</button>
              <button onClick={handleConfirm}
                disabled={selected.size === 0}
                className="btn-gold text-sm px-4 disabled:opacity-50 transition-all duration-200 hover:scale-[1.02] shadow-lg shadow-gold/20">
                ✨ 召唤 {selected.size} 张
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

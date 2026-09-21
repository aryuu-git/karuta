import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle, ChevronLeft, ChevronRight, Download, Eye, Globe, Lock,
  Pencil, Plus, RotateCcw, Search, Tag, Trash2, Upload, UserRound, X, Check,
} from 'lucide-react'
import {
  Button, ConfirmDialog, Dialog, EmptyState, HeroHeader, Input, PageContainer, Skeleton, useToast,
} from '../components/ui'
import { useMyCards, usePublicCards, useCardTags, useMyDecks, queryKeys } from '../api/queries'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { paths } from '../routes/paths'
import { CardTile } from '../components/CardTile'
import { CardDrawer } from '../components/CardDrawer'
import { exportCardPack, importCardPack, downloadBlob } from '../utils/cardPack'
import type { Card } from '../api/types'

type Tab = 'mine' | 'public'
type SortKey = 'latest' | 'name' | 'plays'
const PAGE_SIZE = 60

/** 已提交的查询快照（区别于输入框实时值，避免每敲一键发一请求） */
interface CommittedQuery {
  search: string
  tag: string
  owner?: string
}

const SORT_LABEL: Record<SortKey, string> = {
  latest: '最新',
  name: '名称',
  plays: '使用次数',
}

export function CardLibraryPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()

  const [tab, setTab] = useState<Tab>('mine')
  const [search, setSearch] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [sort, setSort] = useState<SortKey>('latest')

  // 已提交查询（双页签各自快照 + 各自页码）
  const [mineQ, setMineQ] = useState<CommittedQuery>({ search: '', tag: '' })
  const [publicQ, setPublicQ] = useState<CommittedQuery>({ search: '', tag: '', owner: '' })
  const [minePage, setMinePage] = useState(1)
  const [publicPage, setPublicPage] = useState(1)

  // 交互态
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [batchConfirm, setBatchConfirm] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [drawerId, setDrawerId] = useState<number | null>(null)
  const [deckPickerIds, setDeckPickerIds] = useState<number[] | null>(null)
  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [batchTagInput, setBatchTagInput] = useState('')
  // 库内试听（单 audio 元素 + 首音频 URL 缓存）
  const [playingId, setPlayingId] = useState<number | null>(null)
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const previewUrls = useRef<Map<number, string>>(new Map())
  // 牌包导入/导出进行态
  const [packing, setPacking] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  // —— 数据查询（双页签均服务端分页 + 排序 + 筛选）——
  const myQuery = useMyCards({ page: minePage, size: PAGE_SIZE, sort, search: mineQ.search, tag: mineQ.tag })
  const publicQuery = usePublicCards({ search: publicQ.search, tag: publicQ.tag, owner: publicQ.owner, page: publicPage, size: PAGE_SIZE, sort })
  const tagsQuery = useCardTags()
  const decksQuery = useMyDecks()

  const myCards = myQuery.data ?? []
  const publicCards = publicQuery.data ?? []
  const allPublicTags = tagsQuery.data ?? []
  const cards = tab === 'mine' ? myCards : publicCards
  const activeQ = tab === 'mine' ? myQuery : publicQuery
  const loading = activeQ.isPending
  const error = activeQ.isError ? ((activeQ.error as Error)?.message || '加载失败，请重试') : null
  const page = tab === 'mine' ? minePage : publicPage
  const hasMore = cards.length >= PAGE_SIZE

  /** 提交当前输入为已提交快照并重置页码（当前页签） */
  const commit = () => {
    if (tab === 'mine') {
      setMineQ({ search, tag: filterTag })
      setMinePage(1)
    } else {
      setPublicQ({ search, tag: filterTag, owner: filterOwner })
      setPublicPage(1)
    }
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    setSelectMode(false)
    setSelectedCards(new Set())
    setSearch(t === 'mine' ? mineQ.search : publicQ.search)
    setFilterTag(t === 'mine' ? mineQ.tag : publicQ.tag)
  }

  const selectTag = (t: string) => {
    setFilterTag(t)
    if (tab === 'mine') {
      setMineQ(prev => ({ ...prev, tag: t }))
      setMinePage(1)
    } else {
      setPublicQ(prev => ({ ...prev, tag: t }))
      setPublicPage(1)
    }
  }

  const changeSort = (s: SortKey) => {
    setSort(s)
    setMinePage(1)
    setPublicPage(1)
  }

  const clearFilters = () => {
    setSearch('')
    setFilterTag('')
    setFilterOwner('')
    setMineQ({ search: '', tag: '' })
    setPublicQ({ search: '', tag: '', owner: '' })
    setMinePage(1)
    setPublicPage(1)
  }

  // —— 操作 ——
  const invalidateLists = async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.cards.mineRoot })
    await qc.invalidateQueries({ queryKey: ['cards', 'public'] })
  }

  const handleDelete = async (id: number) => {
    setDeleting(true)
    try {
      await api.cards.delete(id)
      setDeleteId(null)
      setDrawerId(null)
      await invalidateLists()
    } catch (err) {
      toast.show((err as Error).message || '删除失败，请重试', 'fail')
    } finally {
      setDeleting(false)
    }
  }

  const handleBatchDelete = async () => {
    if (selectedCards.size === 0) return
    setBatchDeleting(true)
    const failed: number[] = []
    for (const id of selectedCards) {
      try {
        await api.cards.delete(id)
      } catch {
        failed.push(id)
      }
    }
    setSelectedCards(new Set(failed))
    if (failed.length === 0) {
      setSelectMode(false)
      setBatchConfirm(false)
      toast.show('✓ 已全部删除', 'success')
    } else {
      toast.show(`${selectedCards.size - failed.length} 张已删除，${failed.length} 张失败（已保留选中可重试）`, 'fail')
    }
    await invalidateLists()
    setBatchDeleting(false)
  }

  const handleClone = async (cardId: number) => {
    try {
      await api.cards.clone(cardId)
      toast.show('✓ 已复制到我的牌库！', 'success')
      await qc.invalidateQueries({ queryKey: queryKeys.cards.mineRoot })
    } catch (err) {
      toast.show((err as Error).message || '复制失败', 'fail')
    }
  }

  const handleBatchShare = async (level: 'private' | 'playable' | 'editable') => {
    if (selectedCards.size === 0) return
    try {
      await api.cards.batchShare([...selectedCards], level)
      toast.show(`✓ 已设为${shareLabels[level]}`, 'success')
      await invalidateLists()
    } catch {
      toast.show('设置失败，请重试', 'fail')
    }
  }

  const handleAddToDeck = async (deckId: number, cardIds: number[]) => {
    try {
      await api.decks.addCards(deckId, cardIds)
      toast.show(`✓ 已加入牌组（${cardIds.length} 张）`, 'success')
      setDeckPickerIds(null)
      setSelectedCards(new Set())
    } catch (err) {
      toast.show((err as Error).message || '加入失败', 'fail')
    }
  }

  const handleBatchTag = async () => {
    const tag = batchTagInput.trim()
    if (!tag || selectedCards.size === 0) return
    try {
      const res = await api.cards.batchTag([...selectedCards], [tag])
      toast.show(`✓ 已为 ${res.applied} 张牌加上「${tag}」`, 'success')
      setTagDialogOpen(false)
      setBatchTagInput('')
      await invalidateQueriesSafe()
    } catch {
      toast.show('设置失败，请重试', 'fail')
    }
  }
  const invalidateQueriesSafe = () => qc.invalidateQueries({ queryKey: queryKeys.cards.mineRoot })

  /** 点赞切换（双页签通用）：成功后失效列表刷新计数 */
  const handleToggleLike = async (card: Card) => {
    try {
      await api.cards.toggleLike(card.id)
      await invalidateLists()
    } catch {
      toast.show('操作失败，请重试', 'fail')
    }
  }

  /** 导出选中卡片为牌包 zip */
  const handleExport = async (ids: number[]) => {
    if (ids.length === 0 || packing) return
    setPacking(true)
    try {
      const picked = cards.filter(c => ids.includes(c.id))
      const blob = await exportCardPack(picked)
      downloadBlob(blob, `karuta-cards-${new Date().toISOString().slice(0, 10)}.zip`)
      toast.show(`✓ 已导出 ${picked.length} 张牌`, 'success')
    } catch {
      toast.show('导出失败，请重试', 'fail')
    } finally {
      setPacking(false)
    }
  }

  /** 导入牌包：进度 toast，完成后刷新列表 */
  const handleImportFile = async (file: File | null) => {
    if (!file || packing) return
    setPacking(true)
    try {
      const res = await importCardPack(file)
      toast.show(res.failed === 0
        ? `✓ 已导入 ${res.created} 张牌（默认私有）`
        : `导入完成：成功 ${res.created}，失败 ${res.failed}`, res.failed === 0 ? 'success' : 'fail')
      await invalidateQueriesSafe()
    } catch (err) {
      toast.show((err as Error).message || '导入失败：文件格式不正确', 'fail')
    } finally {
      setPacking(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  /** 库内试听：首音频 URL 缓存后直接播/停（单实例元素，全局只响一个） */
  const togglePreview = async (card: Card) => {
    const el = previewRef.current
    if (!el) return
    if (playingId === card.id) {
      el.pause()
      setPlayingId(null)
      return
    }
    let url = previewUrls.current.get(card.id)
    if (!url) {
      try {
        const res = await api.cards.get(card.id)
        url = res.audios?.[0]?.audio_url ?? ''
      } catch {
        url = ''
      }
      if (url) previewUrls.current.set(card.id, url)
    }
    if (!url) {
      toast.show('这张牌没有可播放的音频', 'fail')
      return
    }
    el.src = url
    el.currentTime = 0
    void el.play().then(() => setPlayingId(card.id)).catch(() => setPlayingId(null))
  }

  const toggleCardSelect = (id: number) => {
    setSelectedCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isOwner = (c: Card) => c.owner_id === (user?.id ?? 0)

  // 标签行：服务端全量标签 + 当前页计数徽标
  const tagCounts = new Map<string, number>()
  cards.forEach(c => {
    if (c.tags) c.tags.split(',').forEach(t => { const tag = t.trim(); if (tag) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1) })
  })
  const chipTags = ['', ...new Set(['游戏', '动画', ...allPublicTags])]

  return (
    <PageContainer size="xl">
      <HeroHeader
        title="牌库"
        subtitle={tab === 'mine' ? '我的歌牌收藏' : '所有人共享的歌牌'}
        actions={
          tab === 'mine' ? (
            <>
              <Button variant={selectMode ? 'gold' : 'ghost'} size="sm"
                onClick={() => { setSelectMode(v => !v); setSelectedCards(new Set()) }}
                icon={selectMode ? <Check size={12} /> : <Pencil size={12} />}>
                {selectMode ? '退出多选' : '多选'}
              </Button>
              <Button variant="ghost" size="sm" disabled={packing}
                onClick={() => importInputRef.current?.click()}
                icon={<Upload size={13} />}>导入牌包</Button>
              <Button size="sm" onClick={() => navigate(paths.cardNew())} icon={<Plus size={15} />}>新建歌牌</Button>
              <input ref={importInputRef} type="file" accept=".zip" className="hidden"
                onChange={e => void handleImportFile(e.target.files?.[0] ?? null)} />
            </>
          ) : undefined
        }
      />

      {/* 页签 */}
      <div className="flex gap-0.5 mb-4 bg-white/5 rounded-xl p-1 w-fit">
        {([['mine', '我的收藏', UserRound], ['public', '万牌共享', Globe]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => switchTab(key)}
            className={`inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === key ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm' : 'text-muted hover:text-white/70'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* 吸顶筛选条：搜索 + 排序 + 标签 chips + 公共库创建人 */}
      <div className="sticky top-14 z-sticky mb-5 pt-2 pb-3 space-y-2.5"
        style={{ background: 'linear-gradient(rgb(var(--color-ink) / 0.95) 80%, transparent)' }}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit() }}
              className="text-sm pl-9" placeholder="搜索歌牌名或作品名" />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/40" />
          </div>
          <Button onClick={commit}>搜索</Button>
          <select value={sort} onChange={e => changeSort(e.target.value as SortKey)}
            className="text-xs px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/80 outline-none focus:border-gold/40">
            {(Object.keys(SORT_LABEL) as SortKey[]).map(k => (
              <option key={k} value={k}>{SORT_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {chipTags.map(t => {
            const count = t ? (tagCounts.get(t) || 0) : cards.length
            return (
              <button key={t} onClick={() => selectTag(t)}
                className={`text-xs px-3 py-1.5 rounded-full transition-all ${
                  filterTag === t
                    ? 'bg-gradient-to-r from-gold/25 to-pink-500/15 text-gold border border-gold/40'
                    : 'bg-white/5 text-white/40 border border-white/5 hover:border-pink-300/20 hover:text-pink-300/70'}`}>
                {t || '全部'}{count > 0 ? ` (${count})` : ''}
              </button>
            )
          })}
        </div>
        {tab === 'public' && (
          <div className="flex items-center gap-2">
            <span className="text-muted text-xs">创建人:</span>
            <input type="text" value={filterOwner}
              onChange={e => setFilterOwner(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit() }}
              className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-white/70 w-28 placeholder:text-white/30 focus:border-gold/30 outline-none"
              placeholder="输入用户名" />
          </div>
        )}
      </div>

      {/* 加载：3:4 牌面骨架网格（与 CardTile 同尺寸） */}
      {loading && (
        <Skeleton variant="card" rows={6}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3" />
      )}

      {/* 空态 */}
      {!loading && !error && cards.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl"
          style={{ background: 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.5), rgb(var(--accent-bg-mid)/ 0.8))', border: '1px dashed rgb(var(--accent-primary)/ 0.2)' }}>
          {tab === 'mine' ? (
            <EmptyState icon="🎴" title="牌库空空如也" description="新建第一张歌牌，配上声音"
              action={<Button onClick={() => navigate(paths.cardNew())} icon={<Plus size={15} />}>新建歌牌</Button>} />
          ) : (
            <EmptyState icon="🎴" title="没有找到匹配的歌牌" description="换个关键词或标签试试"
              action={<Button variant="outline" onClick={clearFilters} icon={<X size={15} />}>清除筛选</Button>} />
          )}
        </motion.div>
      )}

      {/* 错误态 */}
      {!loading && error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl text-center py-14 px-6"
          style={{ background: 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.5), rgb(var(--accent-bg-mid)/ 0.8))', border: '1px dashed rgba(192,57,43,0.35)' }}>
          <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.3)' }}>
            <AlertCircle size={22} className="text-crimson" />
          </div>
          <h3 className="font-serif text-title text-gold mb-2">加载失败</h3>
          <p className="text-muted text-body max-w-sm mx-auto mb-5">{error}</p>
          <Button variant="outline" onClick={() => activeQ.refetch()} icon={<RotateCcw size={14} />}>重试</Button>
        </motion.div>
      )}

      {/* 牌面网格 */}
      {!loading && !error && cards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          <AnimatePresence>
            {cards.map((card, i) => (
              <motion.div key={card.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: Math.min(i * 0.01, 0.3) }}>
                <CardTile
                  card={card}
                  showOwner={tab === 'public'}
                  selectable={selectMode && tab === 'mine'}
                  selected={selectedCards.has(card.id)}
                  playing={playingId === card.id}
                  onLike={handleToggleLike}
                  onOpen={() => {
                    // 打开抽屉时停掉库内试听（副作用置于 updater 外——
                    // 回顾修复：原写法把 pause 放进 setState updater，StrictMode
                    // 双调用下不纯）
                    previewRef.current?.pause()
                    setPlayingId(null)
                    setDrawerId(card.id)
                  }}
                  onTogglePlay={tab === 'mine' || tab === 'public' ? togglePreview : undefined}
                  onSelect={toggleCardSelect}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 分页（双页签统一） */}
      {!loading && !error && cards.length > 0 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button variant="ghost" size="sm" disabled={page <= 1}
            onClick={() => tab === 'mine' ? setMinePage(1) : setPublicPage(1)}>首页</Button>
          <Button variant="ghost" size="sm" disabled={page <= 1} icon={<ChevronLeft size={12} />}
            onClick={() => tab === 'mine' ? setMinePage(p => p - 1) : setPublicPage(p => p - 1)}>上一页</Button>
          <span className="text-xs px-3 py-1.5 rounded-lg bg-gold/15 text-gold border border-gold/30 font-medium">第 {page} 页</span>
          <Button variant="ghost" size="sm" disabled={!hasMore}
            onClick={() => tab === 'mine' ? setMinePage(p => p + 1) : setPublicPage(p => p + 1)}>下一页 <ChevronRight size={12} /></Button>
        </div>
      )}

      {/* 底部批量操作浮条（多选态） */}
      <AnimatePresence>
        {selectMode && tab === 'mine' && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-float flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl border border-gold/30 backdrop-blur"
            style={{ background: 'rgb(var(--color-ink-deep) / 0.95)' }}>
            <button onClick={() => {
              if (selectedCards.size === cards.length) setSelectedCards(new Set())
              else setSelectedCards(new Set(cards.map(c => c.id)))
            }} className="text-xs text-gold/80 hover:text-gold transition-colors px-2">
              {selectedCards.size === cards.length ? '取消全选' : '全选'}
            </button>
            <span className="text-muted text-xs font-serif border-l border-white/10 pl-2">
              已选 <span className="text-gold font-bold">{selectedCards.size}</span>
            </span>
            <Button size="sm" variant="gold" disabled={selectedCards.size === 0}
              icon={<Plus size={13} />} onClick={() => setDeckPickerIds([...selectedCards])}>加入牌组</Button>
            <Button size="sm" variant="outline" disabled={selectedCards.size === 0 || packing}
              icon={<Download size={13} />} onClick={() => void handleExport([...selectedCards])}>导出</Button>
            {(['private', 'playable', 'editable'] as const).map(level => {
              const LevelIcon = shareIcons[level]
              return (
                <button key={level} disabled={selectedCards.size === 0}
                  onClick={() => handleBatchShare(level)}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-medium transition-all disabled:opacity-30 hover:scale-105"
                  style={{ background: `${shareColors[level]}0.12)`, border: `1px solid ${shareColors[level]}0.35)`, color: `${shareColors[level]}0.9)` }}>
                  <LevelIcon size={10} />{shareLabels[level]}
                </button>
              )
            })}
            <button disabled={selectedCards.size === 0} onClick={() => setTagDialogOpen(true)}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-medium transition-all disabled:opacity-30 hover:scale-105 bg-gold/10 border border-gold/30 text-gold/90">
              <Tag size={10} /> 加标签
            </button>
            <button onClick={() => setBatchConfirm(true)}
              disabled={selectedCards.size === 0 || batchDeleting}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-medium transition-all disabled:opacity-30 hover:scale-105"
              style={{ background: 'rgba(192,57,43,0.15)', border: '1px solid rgba(192,57,43,0.3)', color: 'rgba(192,57,43,0.9)' }}>
              {batchDeleting ? '…' : (<><Trash2 size={10} /> 删除</>)}
            </button>
            <button onClick={() => { setSelectMode(false); setSelectedCards(new Set()) }}
              className="text-[10px] px-2 py-1 rounded-lg text-muted hover:text-white transition-colors border border-white/10">
              完成
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 详情抽屉 */}
      <CardDrawer
        cardId={drawerId}
        onClose={() => setDrawerId(null)}
        onEdit={c => isOwner(c) && navigate(paths.cardEdit(c.id))}
        onDelete={c => isOwner(c) && setDeleteId(c.id)}
        onClone={c => !isOwner(c) && handleClone(c.id)}
        onAddToDeck={c => setDeckPickerIds([c.id])}
        onExport={c => void handleExport([c.id])}
      />
      {/* 库内试听单实例音频 */}
      <audio ref={previewRef} className="hidden" onEnded={() => setPlayingId(null)} />

      {/* 加入牌组选择 */}
      <Dialog open={deckPickerIds !== null} title="加入牌组"
        onClose={() => setDeckPickerIds(null)}>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {(decksQuery.data ?? []).length === 0 && (
            <p className="text-muted text-xs text-center py-4">还没有牌组，先去创建一副吧</p>
          )}
          {(decksQuery.data ?? []).map(d => (
            <button key={d.id}
              onClick={() => deckPickerIds && handleAddToDeck(d.id, deckPickerIds)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/5 hover:bg-gold/10 border border-white/5 hover:border-gold/30 transition-all text-left">
              <span className="text-sm text-body-text/90 truncate">{d.name}</span>
              <span className="text-[10px] text-muted shrink-0 ml-2">{d.card_count ?? 0} 张</span>
            </button>
          ))}
        </div>
      </Dialog>

      {/* 批量加标签 */}
      <Dialog open={tagDialogOpen} title={`为 ${selectedCards.size} 张牌加标签`}
        onClose={() => setTagDialogOpen(false)}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setTagDialogOpen(false)}>取消</Button>
            <Button size="sm" disabled={!batchTagInput.trim()} onClick={handleBatchTag}>添加</Button>
          </>
        }>
        <Input type="text" value={batchTagInput} onChange={e => setBatchTagInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void handleBatchTag() }}
          placeholder="输入标签名，如：热血" />
      </Dialog>

      {/* 单卡删除确认 */}
      <ConfirmDialog
        open={deleteId !== null}
        title="删除这张歌牌？"
        description="删除后，引用它的牌组将不再包含这张歌牌，无法撤销"
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={() => { if (deleteId !== null) handleDelete(deleteId) }}
        onCancel={() => setDeleteId(null)}
      />

      {/* 批量删除确认 */}
      <ConfirmDialog
        open={batchConfirm}
        title={`删除选中的 ${selectedCards.size} 张歌牌？`}
        description="删除后，引用它们的牌组将不再包含这些歌牌，无法撤销"
        confirmText="删除"
        danger
        loading={batchDeleting}
        onConfirm={handleBatchDelete}
        onCancel={() => setBatchConfirm(false)}
      />
    </PageContainer>
  )
}

/** 批量共享级别的显示文案 */
const shareLabels: Record<'private' | 'playable' | 'editable', string> = {
  private: '私有',
  playable: '可使用',
  editable: '可编辑',
}

/** 批量共享级别的图标 */
const shareIcons: Record<'private' | 'playable' | 'editable', typeof Lock> = {
  private: Lock,
  playable: Eye,
  editable: Pencil,
}

/** 批量共享级别的着色前缀（rgba 前缀，渲染时拼接透明度） */
const shareColors: Record<'private' | 'playable' | 'editable', string> = {
  private: 'rgba(150,150,150,',
  playable: 'rgba(74,144,217,',
  editable: 'rgba(34,197,94,',
}

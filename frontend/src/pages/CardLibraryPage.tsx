import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle, ChevronLeft, ChevronRight, Download, Eye, Globe, Lock,
  Pencil, Plus, RotateCcw, Tag, Trash2, Upload, UserRound, X, Check, Wand2,
} from 'lucide-react'
import {
  ActionBar, Button, ConfirmDialog, Dialog, EmptyState, FadeIn, HeroHeader, Input, ListPageShell, SearchInput, SegmentedTabs, Select, Skeleton, useToast,
  type ButtonVariant,
} from '../components/ui'
import { PackPromptDialog } from '../components/PackPromptDialog'
import { useMyCards, usePublicCards, useCardTags, useMyCardTags, useMyDecks, queryKeys } from '../api/queries'
import { DEFAULT_TAGS } from '../features/card-create/useCardForm'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { paths } from '../routes/paths'
import { CardTile } from '../components/CardTile'
import { CardDrawer } from '../components/CardDrawer'
import { exportCardPack, importCardPack, downloadBlob } from '../utils/cardPack'
import type { Card } from '../api/types'

type Tab = 'mine' | 'public'
type SortKey = 'latest' | 'name' | 'plays'
/** 每页条数（2026-10-05）：取卡片栅格各断点列数 3/4/6/8 的公倍数 24 的整数倍（48），
 *  保证整页的每一排都排满，不再出现半排尾巴。上限受后端 size≤100 约束。 */
const PAGE_SIZE = 48

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
  const [selectionMode, setSelectionMode] = useState<'bulk' | 'category' | null>(null)
  const selectMode = selectionMode !== null
  const categorizing = selectionMode === 'category'
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [drawerId, setDrawerId] = useState<number | null>(null)
  const [deckPickerIds, setDeckPickerIds] = useState<number[] | null>(null)
  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [showPackPrompt, setShowPackPrompt] = useState(false) // AI 制作导入包提示词弹窗
  const [batchTagInput, setBatchTagInput] = useState('')
  const [batchTagSaving, setBatchTagSaving] = useState(false)
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
  const myTagsQuery = useMyCardTags()
  const decksQuery = useMyDecks()

  const myCards = myQuery.data ?? []
  const publicCards = publicQuery.data ?? []
  const allPublicTags = tagsQuery.data ?? []
  const myTags = myTagsQuery.data ?? []
  const cards = tab === 'mine' ? myCards : publicCards
  const activeQ = tab === 'mine' ? myQuery : publicQuery
  const loading = activeQ.isPending
  const error = activeQ.isError ? ((activeQ.error as Error)?.message || '加载失败，请重试') : null
  const page = tab === 'mine' ? minePage : publicPage
  const hasMore = cards.length >= PAGE_SIZE

  /** 提交当前输入为已提交快照并重置页码（当前页签）；overrideSearch 供清除按钮直接传空值 */
  const commit = (overrideSearch?: string) => {
    const q = overrideSearch ?? search
    if (tab === 'mine') {
      setMineQ({ search: q, tag: filterTag })
      setMinePage(1)
    } else {
      setPublicQ({ search: q, tag: filterTag, owner: filterOwner })
      setPublicPage(1)
    }
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    setSelectionMode(null)
    setSelectedCards(new Set())
    setTagDialogOpen(false)
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
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.cards.mineRoot }),
      qc.invalidateQueries({ queryKey: queryKeys.cards.publicRoot }),
      qc.invalidateQueries({ queryKey: queryKeys.cards.tags }),
      qc.invalidateQueries({ queryKey: queryKeys.cards.mineTags }),
    ])
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
      setSelectionMode(null)
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
    if (batchTagSaving || categoryError || !tag || selectedCards.size === 0) return
    const ids = [...selectedCards]
    setBatchTagSaving(true)
    try {
      const res = await api.cards.batchTag(ids, [tag])
      if (res.applied !== ids.length) throw new Error('部分歌牌未完成归类，请刷新后重试')
      toast.show(`已将 ${res.applied} 张歌牌归入「${tag}」`, 'success')
      setTagDialogOpen(false)
      setBatchTagInput('')
      setSelectedCards(new Set())
      if (categorizing) setSelectionMode(null)
      await Promise.all([
        invalidateLists(),
        qc.invalidateQueries({ queryKey: queryKeys.cards.detailRoot }),
        qc.invalidateQueries({ queryKey: queryKeys.decks.detailRoot }),
      ])
    } catch (err) {
      toast.show((err as Error).message || '归类失败，请重试', 'fail')
    } finally {
      setBatchTagSaving(false)
    }
  }

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
      await invalidateLists()
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

  const startSelection = (mode: 'bulk' | 'category' | null) => {
    previewRef.current?.pause()
    setPlayingId(null)
    setSelectionMode(mode)
    setSelectedCards(new Set())
    setBatchTagInput('')
    setTagDialogOpen(false)
  }
  const allCurrentSelected = cards.length > 0 && cards.every(card => selectedCards.has(card.id))
  const toggleCurrentPage = () => {
    setSelectedCards(previous => {
      const next = new Set(previous)
      cards.forEach(card => allCurrentSelected ? next.delete(card.id) : next.add(card.id))
      return next
    })
  }
  const category = batchTagInput.trim()
  const categoryError = /[,，\r\n]/.test(category)
    ? '一次归入一个分类，名称不能包含逗号或换行'
    : [...category].length > 50 ? '分类名称最多 50 个字' : ''
  const categoryOptions = [...new Set([...DEFAULT_TAGS, ...myTags])]

  // 标签行：服务端全量标签 + 当前页计数徽标
  const tagCounts = new Map<string, number>()
  cards.forEach(c => {
    if (c.tags) c.tags.split(',').forEach(t => { const tag = t.trim(); if (tag) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1) })
  })
  const chipTags = ['', ...new Set([...DEFAULT_TAGS, ...(tab === 'mine' ? myTags : allPublicTags), filterTag].filter(Boolean))]

  return (
    <ListPageShell
      className={selectMode ? (categorizing ? 'pb-28' : 'pb-52 sm:pb-28') : undefined}
      hero={<HeroHeader
        compact
        title="牌库"
        subtitle={tab === 'mine' ? '我创建的歌牌' : '所有人共享的歌牌'}
        actions={
          tab === 'mine' ? (
            <>
              <Button variant={selectionMode === 'bulk' ? 'gold' : 'ghost'} size="sm"
                disabled={categorizing}
                onClick={() => startSelection(selectMode ? null : 'bulk')}
                icon={selectionMode === 'bulk' ? <Check size={12} /> : <Pencil size={12} />}>
                {selectionMode === 'bulk' ? '退出多选' : '多选'}
              </Button>
              <Button variant={categorizing ? 'gold' : 'outline'} size="sm"
                onClick={() => startSelection(categorizing ? null : 'category')}
                icon={<Tag size={12} />}>
                {categorizing ? '取消归类' : '批量归类'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowPackPrompt(true)}
                icon={<Wand2 size={16} />}>ai-native</Button>
              <Button variant="ghost" size="sm" disabled={packing}
                onClick={() => importInputRef.current?.click()}
                icon={<Upload size={16} />}>导入牌包</Button>
              <Button size="sm" onClick={() => navigate(paths.cardNew())} icon={<Plus size={16} />}>新建歌牌</Button>
              <input ref={importInputRef} type="file" accept=".zip" className="hidden"
                onChange={e => void handleImportFile(e.target.files?.[0] ?? null)} />
            </>
          ) : undefined
        }
      />}
      stickyToolbar
      toolbar={
        <>
          {/* 左簇：页签 + 标签 chips（+公共库创建人）；右簇：搜索 + 排序——双端对齐 */}
          <div className="flex items-center gap-2 flex-wrap">
            <SegmentedTabs
              variant="pill"
              className="w-fit"
              aria-label="牌库页签"
              value={tab}
              onChange={switchTab}
              options={[
                { value: 'mine' as Tab, label: '我的歌牌', icon: <UserRound size={16} /> },
                { value: 'public' as Tab, label: '万牌共享', icon: <Globe size={16} /> },
              ]}
            />
            <SegmentedTabs
              variant="chip"
              size="sm"
              aria-label="标签筛选"
              value={filterTag}
              onChange={selectTag}
              options={chipTags.map(t => {
                const count = t ? (tagCounts.get(t) || 0) : cards.length
                return { value: t, label: <>{t || '全部'}{count > 0 ? ` (${count})` : ''}</> }
              })}
            />
            {tab === 'public' && (
              <div className="flex items-center gap-2">
                <span className="text-muted/70 text-xs shrink-0">创建人:</span>
                <Input size="sm" fit className="w-32" value={filterOwner}
                  onChange={e => setFilterOwner(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commit() }}
                  placeholder="输入用户名" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SearchInput
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit() }}
              onClear={() => { setSearch(''); commit('') }}
              placeholder="搜索歌牌名或作品名"
              className="w-56 sm:w-64" />
            <Select size="sm" fit className="w-28 shrink-0" value={sort} aria-label="排序方式"
              onChange={v => changeSort(v as SortKey)}
              options={(Object.keys(SORT_LABEL) as SortKey[]).map(k => ({ value: k, label: SORT_LABEL[k] }))} />
          </div>
        </>
      }>
      {categorizing && (
        <p className="text-muted text-sm mb-4" role="status">勾选要归类的歌牌，然后点击「完成」选择分类；可跨页选择。</p>
      )}
      {/* 加载：3:4 牌面骨架网格（与 CardTile 同尺寸） */}
      {loading && (
        <Skeleton variant="card" rows={6}
          className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3" />
      )}
      {!loading && !error && cards.length === 0 && (
        <FadeIn className="rounded-2xl bg-panel-void border border-accent/15">
          {tab === 'mine' ? (
            <EmptyState icon="🌸" title="牌库空空如也" description="新建第一张歌牌，配上声音"
              action={<Button onClick={() => navigate(paths.cardNew())} icon={<Plus size={16} />}>新建歌牌</Button>} />
          ) : (
            <EmptyState icon="🔍" title="没有找到匹配的歌牌" description="换个关键词或标签试试"
              action={<Button variant="outline" onClick={clearFilters} icon={<X size={16} />}>清除筛选</Button>} />
          )}
        </FadeIn>
      )}

      {/* 错误态 */}
      {!loading && error && (
        <FadeIn className="rounded-2xl text-center py-14 px-6 bg-panel-void border border-danger/30">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center bg-danger/10 border border-danger/30">
            <AlertCircle size={20} className="text-crimson" />
          </div>
          <h3 className="font-serif text-title text-gold-light mb-2">加载失败</h3>
          <p className="text-muted text-body mb-5">{error}</p>
          <Button variant="outline" onClick={() => activeQ.refetch()} icon={<RotateCcw size={16} />}>重试</Button>
        </FadeIn>
      )}

      {/* 牌面网格（2026-10-05）：回到 CSS grid。grid 轨道是 minmax(0,1fr)，卡面内长文本
          只会被 truncate，不会把格子撑宽、每排恒为 N 张（flex-wrap + basis 会因
          min-width:auto 使某排少一张、末页出现缺位），页大小 48 已按 3/4/6/8 列取公倍数 */}
      {!loading && !error && cards.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3">
          <AnimatePresence>
            {cards.map((card, i) => (
              <motion.div key={card.id} exit={{ opacity: 0, scale: 0.9 }}>
                {/* 入场走 FadeIn（设计系统 §1.5），motion 仅保留 AnimatePresence 退场 */}
                <FadeIn delay={Math.min(i * 10, 300)} y={8}>
                <CardTile
                  card={card}
                  showOwner={tab === 'public'}
                  selectable={selectMode && tab === 'mine'}
                  selected={selectedCards.has(card.id)}
                  selectionShape={categorizing ? 'circle' : 'square'}
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
                </FadeIn>
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

      {/* 底部批量操作浮条（多选态）：ActionBar 统一吸底批量条，内部按钮走 Button size="xs" */}
      {selectMode && tab === 'mine' && (
        <ActionBar className="w-max flex-wrap justify-center">
          <Button size="xs" variant="ghost" onClick={toggleCurrentPage}>
            {allCurrentSelected ? '取消本页全选' : '全选本页'}
          </Button>
          <span className="text-muted text-xs font-serif border-l border-white/10 pl-2">
            已选 <span className="text-gold font-bold">{selectedCards.size}</span>
          </span>
          {categorizing ? (
            <>
              <Button size="xs" variant="ghost" onClick={() => startSelection(null)}>取消</Button>
              <Button size="xs" disabled={selectedCards.size === 0}
                icon={<Check size={12} />} onClick={() => setTagDialogOpen(true)}>完成</Button>
            </>
          ) : (
            <>
              <Button size="xs" variant="gold" disabled={selectedCards.size === 0}
                icon={<Plus size={16} />} onClick={() => setDeckPickerIds([...selectedCards])}>加入牌组</Button>
              <Button size="xs" variant="outline" disabled={selectedCards.size === 0 || packing}
                icon={<Download size={16} />} onClick={() => void handleExport([...selectedCards])}>导出</Button>
              {(['private', 'playable', 'editable'] as const).map(level => {
                const LevelIcon = shareIcons[level]
                return (
                  <Button key={level} size="xs" variant={shareVariant[level]} disabled={selectedCards.size === 0}
                    icon={<LevelIcon size={12} />} onClick={() => handleBatchShare(level)}>
                    {shareLabels[level]}
                  </Button>
                )
              })}
              <Button size="xs" variant="outline" disabled={selectedCards.size === 0}
                icon={<Tag size={12} />} onClick={() => setTagDialogOpen(true)}>加标签</Button>
              <Button size="xs" variant="danger" disabled={selectedCards.size === 0 || batchDeleting}
                icon={batchDeleting ? undefined : <Trash2 size={12} />} onClick={() => setBatchConfirm(true)}>
                {batchDeleting ? '…' : '删除'}
              </Button>
              <Button size="xs" variant="ghost"
                onClick={() => startSelection(null)}>完成</Button>
            </>
          )}
        </ActionBar>
      )}

      {/* AI 制作导入包提示词（2026-09-30）：格式规格即提示词，交给用户 AI 产出 .zip */}
      <PackPromptDialog open={showPackPrompt} onClose={() => setShowPackPrompt(false)} />

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

      {/* 分类沿用标签，可选择已有分类或创建新分类。 */}
      <Dialog open={tagDialogOpen} title={`将 ${selectedCards.size} 张歌牌归类`}
        closable={!batchTagSaving}
        onClose={() => { if (!batchTagSaving) setTagDialogOpen(false) }}
        actions={
          <>
            <Button variant="ghost" size="sm" disabled={batchTagSaving} onClick={() => setTagDialogOpen(false)}>取消</Button>
            <Button size="sm" loading={batchTagSaving} disabled={!category || !!categoryError || selectedCards.size === 0}
              onClick={handleBatchTag}>确认归类</Button>
          </>
        }>
        <p className="text-muted text-sm mb-4">选择已有分类，或输入新的分类名称。归类会添加标签，保留歌牌原有的标签。</p>
        <div className="flex flex-wrap gap-2 mb-4" aria-label="已有分类">
          {categoryOptions.map(tag => (
            <Button key={tag} type="button" size="xs" variant={category === tag ? 'gold' : 'outline'}
              aria-pressed={category === tag} disabled={batchTagSaving} onClick={() => setBatchTagInput(tag)}>{tag}</Button>
          ))}
        </div>
        <Input id="card-category-name" label="分类名称" type="text" value={batchTagInput} disabled={batchTagSaving}
          onChange={e => setBatchTagInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void handleBatchTag() }}
          placeholder="例如：动画歌曲" />
        {categoryError && <p className="text-crimson text-xs mt-2" role="alert">{categoryError}</p>}
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
    </ListPageShell>
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

/** 批量共享级别的按钮变体（原 rgba 着色收敛到 Button 语义变体：中性=ghost，授权=outline） */
const shareVariant: Record<'private' | 'playable' | 'editable', ButtonVariant> = {
  private: 'ghost',
  playable: 'outline',
  editable: 'outline',
}

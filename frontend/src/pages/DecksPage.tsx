import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
// 图标统一走 lucide-react（映射约定见 A3.1/A3.2）
import {
  Swords, Layers, Globe, Images, Plus, Eye, X,
  Lock, Gamepad2, Pencil, Share2, FileText, AlertCircle, RefreshCw, Heart, Trash2, Upload,
  Check, Wand2,
  type LucideIcon,
} from 'lucide-react'
import {
  ActionBar, Button, ConfirmDialog, Input, SearchInput, Select, Textarea, Badge, Dialog, EmptyState, FadeIn, HeroHeader,
  ListPageShell, PanelSurface, SegmentedTabs, Skeleton, useToast, type BadgeTone,
} from '../components/ui'
import { PackPromptDialog } from '../components/PackPromptDialog'
import { useMyDecks, useEditableDecks, usePublicDecks, queryKeys } from '../api/queries'
import { api } from '../api/client'
import { paths } from '../routes/paths'
import { PresetPicker } from '../features/play/PresetPicker'
import { createRoomFromConfig, writeLastConfig, readLastConfig } from '../features/play/roomCreate'
import { importDeckPack } from '../utils/deckPack'
import { useRef } from 'react'
import type { RoomConfig } from '../features/play/roomConfig'
import type { Deck } from '../api/types'

type Tab = 'mine' | 'editable' | 'public'

/** 分享等级 → 徽章语义映射（tone 约定：私有=muted、可使用=gold、可编辑=info） */
const SHARE_BADGE: Record<string, { icon: LucideIcon; text: string; tone: BadgeTone }> = {
  private: { icon: Lock, text: '私有', tone: 'muted' },
  playable: { icon: Gamepad2, text: '可使用', tone: 'gold' },
  editable: { icon: Pencil, text: '可编辑', tone: 'info' },
}

/** 卡片分享等级徽章：未知等级回退为原文本（中性 tone） */
function ShareBadge({ level }: { level: string }) {
  const meta = SHARE_BADGE[level]
  if (!meta) return <Badge tone="muted">{level}</Badge>
  const Icon = meta.icon
  return (
    <Badge tone={meta.tone}>
      <Icon size={12} />
      {meta.text}
    </Badge>
  )
}

export function DecksPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [tab, setTab] = useState<Tab>('mine')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOwner, setFilterOwner] = useState('') // 创建人输入框实时值
  const [pubOwner, setPubOwner] = useState('')        // 已提交的创建人（回车才刷新）
  const [sort, setSort] = useState<'newest' | 'name' | 'cards'>('newest') // 本地排序

  // 多选（2026-09-30）：批量删除/批量改共享，仅「我的牌组」页签；失败项保留选中可重试
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchConfirm, setBatchConfirm] = useState(false)
  const [batchBusy, setBatchBusy] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [batchShare, setBatchShare] = useState('private')
  const [batchEdit, setBatchEdit] = useState('add_only')

  // 创建弹窗状态
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [showPackPrompt, setShowPackPrompt] = useState(false) // AI 制作导入包提示词弹窗
  const [newShareLevel, setNewShareLevel] = useState('private')
  const [newEditLevel, setNewEditLevel] = useState('add_only')
  const [creating, setCreating] = useState(false)

  // —— 数据查询（TanStack Query）——
  const myQ = useMyDecks()
  const editQ = useEditableDecks()
  const pubQ = usePublicDecks(pubOwner || undefined)

  // 当前页签对应的查询，用于统一三态与重试
  const activeQ = tab === 'mine' ? myQ : tab === 'editable' ? editQ : pubQ
  const loading = activeQ.isPending
  const error = activeQ.isError
    ? ((activeQ.error as Error)?.message || '加载失败，请重试')
    : null

  // 错误态重试：重新拉取当前页签
  const handleRetry = () => activeQ.refetch()

  /** 协作/公共牌组空态「清除筛选」：清空关键词与创建人输入（公共页随 pubOwner 重查） */
  const clearDeckFilters = () => {
    setSearchQuery('')
    setFilterOwner('')
    setPubOwner('')
  }

  /** 创建牌组：成功后关闭弹窗、重置表单并失效「我的/公共」缓存 */
  const handleCreate = async () => {
    setCreating(true)
    try {
      await api.decks.create(newName.trim(), newDesc.trim(), newShareLevel, newEditLevel)
      setShowCreate(false)
      setNewName(''); setNewDesc('')
      setNewShareLevel('private'); setNewEditLevel('add_only')
      await qc.invalidateQueries({ queryKey: queryKeys.decks.mine })
      await qc.invalidateQueries({ queryKey: queryKeys.decks.public(pubOwner) })
    } catch { /* ignore */ }
    finally { setCreating(false) }
  }

  /** 多选切换：进入/退出（退出即清空选择） */
  const toggleSelectMode = () => {
    setSelectMode(v => !v)
    setSelectedIds(new Set())
  }

  const toggleDeckSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** 批量删除：逐个 DELETE，失败项保留在选中集里可重试（与牌库多选同语义） */
  const handleBatchDelete = async () => {
    setBatchBusy(true)
    const failed: number[] = []
    for (const id of selectedIds) {
      try {
        await api.decks.delete(id)
      } catch {
        failed.push(id)
      }
    }
    const okCount = selectedIds.size - failed.length
    setSelectedIds(new Set(failed))
    setBatchBusy(false)
    setBatchConfirm(false)
    if (failed.length === 0) {
      setSelectMode(false)
      toast.show(`✓ 已删除 ${okCount} 个牌组（牌库歌牌不受影响）`, 'success')
    } else {
      toast.show(`${okCount} 个已删除，${failed.length} 个失败（已保留选中可重试）`, 'fail')
    }
    await qc.invalidateQueries({ queryKey: queryKeys.decks.mine })
    await qc.invalidateQueries({ queryKey: queryKeys.decks.public(pubOwner) })
    await qc.invalidateQueries({ queryKey: queryKeys.decks.editable })
  }

  /** 批量改共享/编辑权限：逐个 PATCH，失败项保留选中可重试 */
  const handleBatchShare = async () => {
    setBatchBusy(true)
    const failed: number[] = []
    for (const id of selectedIds) {
      try {
        await api.decks.update(id, { share_level: batchShare, edit_level: batchEdit })
      } catch {
        failed.push(id)
      }
    }
    const okCount = selectedIds.size - failed.length
    setSelectedIds(new Set(failed))
    setBatchBusy(false)
    setShareDialogOpen(false)
    if (failed.length === 0) {
      setSelectMode(false)
      toast.show(`✓ 已更新 ${okCount} 个牌组的共享设置`, 'success')
    } else {
      toast.show(`${okCount} 个已更新，${failed.length} 个失败（已保留选中可重试）`, 'fail')
    }
    await qc.invalidateQueries({ queryKey: queryKeys.decks.mine })
    await qc.invalidateQueries({ queryKey: queryKeys.decks.public(pubOwner) })
    await qc.invalidateQueries({ queryKey: queryKeys.decks.editable })
  }

  const allDecks = activeQ.data ?? []
  // 关键词本地筛选（按牌组名）+ 本地排序（列表已在手，前端排即可）
  const filtered = searchQuery
    ? allDecks.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allDecks
  const decks = [...filtered].sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name, 'zh')
      : sort === 'cards' ? (b.card_count || 0) - (a.card_count || 0)
        : new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())

  // —— 牌组出阵 → 快速开局（§6.2：PresetPicker 锁定该牌组） ——
  const toast = useToast()
  const [pickerDeck, setPickerDeck] = useState<Deck | null>(null)
  const [lastConfig, setLastConfig] = useState<RoomConfig | null>(null)
  const [roomCreating, setRoomCreating] = useState(false)
  // v8：牌组点赞（in-flight 单守卫）与牌组包导入
  const [likeBusyId, setLikeBusyId] = useState(0)
  const [packing, setPacking] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const handleLikeDeck = async (deck: Deck) => {
    if (likeBusyId) return
    setLikeBusyId(deck.id)
    try {
      await api.decks.toggleLike(deck.id)
      await qc.invalidateQueries({ queryKey: queryKeys.decks.mine })
      await qc.invalidateQueries({ queryKey: ['decks', 'public'] })
      await qc.invalidateQueries({ queryKey: queryKeys.decks.editable })
    } catch {
      toast.show('操作失败，请重试', 'fail')
    } finally {
      setLikeBusyId(0)
    }
  }

  const handleImportDeckFile = async (file: File | null) => {
    if (!file || packing) return
    setPacking(true)
    try {
      const res = await importDeckPack(file)
      toast.show(res.failed === 0
        ? `✓ 已导入牌组（${res.created} 张，私有）`
        : `导入完成：成功 ${res.created}，失败 ${res.failed}`, res.failed === 0 ? 'success' : 'fail')
      await qc.invalidateQueries({ queryKey: queryKeys.decks.mine })
      navigate(paths.deck(res.deckId))
    } catch (err) {
      toast.show((err as Error).message || '导入失败：文件格式不正确', 'fail')
    } finally {
      setPacking(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const openPickerFor = (deck: Deck) => {
    setLastConfig(readLastConfig())
    setPickerDeck(deck)
  }

  // 预设直接创建：成功写上次配置并跳新房，失败 toast（弹层保留可重试）
  const handlePresetSelect = async (config: RoomConfig, deckId: number) => {
    if (roomCreating) return
    setRoomCreating(true)
    try {
      const room = await createRoomFromConfig(deckId, config)
      writeLastConfig(config)
      setPickerDeck(null)
      navigate(paths.room(room.id))
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '创建失败，请重试', 'fail', 2500)
    } finally {
      setRoomCreating(false)
    }
  }

  // 预设跳完整表单：携带预设配置，表单页头标注「基于：{label}」
  const handlePresetCustomize = (config: RoomConfig, deckId: number) => {
    setPickerDeck(null)
    navigate(paths.roomNew(deckId), { state: { presetConfig: config } })
  }

  return (
    <>
    {/* 整页骨架归 ListPageShell：hero（compact + 操作按钮簇）+ toolbar（页签）+ 内容区 */}
    <ListPageShell
      hero={
        <HeroHeader
          compact
          icon={<Swords size={20} aria-hidden="true" />}
          title="牌组"
          subtitle={tab === 'mine' ? '管理我的牌组' : tab === 'editable' ? '可协作编辑的牌组' : '公开共享的牌组'}
          actions={
            <>
              {/* 操作按钮簇：贴内容列右缘，与标题同一行（布局契约 §1.3） */}
              {tab === 'mine' && (
                <Button variant={selectMode ? 'gold' : 'ghost'} size="sm"
                  onClick={toggleSelectMode}
                  icon={selectMode ? <Check size={12} /> : <Pencil size={12} />}>
                  {selectMode ? '退出多选' : '多选'}
                </Button>
              )}
              <Button variant="ghost" size="sm" icon={<Wand2 size={16} />} onClick={() => setShowPackPrompt(true)}>ai-native</Button>
              <Button variant="ghost" size="sm" disabled={packing} icon={<Upload size={16} />} onClick={() => importInputRef.current?.click()}>导入牌组</Button>
              <Button size="sm" icon={<Plus size={16} />} onClick={() => setShowCreate(true)}>新建牌组</Button>
              <input ref={importInputRef} type="file" accept=".zip" className="hidden"
                onChange={e => void handleImportDeckFile(e.target.files?.[0] ?? null)} />
            </>
          }
        />
      }
      toolbar={
        <>
          {/* 左簇：页签（+公共库创建人）；右簇：搜索 + 排序——与牌库页同一布局契约 */}
          <div className="flex items-center gap-2 flex-wrap">
            <SegmentedTabs
              variant="pill"
              className="w-fit"
              aria-label="牌组页签"
              value={tab}
              onChange={v => {
                setTab(v)
                if (v === 'public') setPubOwner(filterOwner)
                setSelectMode(false)
                setSelectedIds(new Set())
              }}
              options={[
                { value: 'mine' as Tab, label: '我的牌组', icon: <Layers size={16} aria-hidden="true" /> },
                { value: 'editable' as Tab, label: '协作牌组', icon: <Pencil size={16} aria-hidden="true" /> },
                { value: 'public' as Tab, label: '公共牌组', icon: <Globe size={16} aria-hidden="true" /> },
              ]}
            />
            {tab === 'public' && (
              <div className="flex items-center gap-2">
                <span className="text-muted/70 text-xs shrink-0">创建人:</span>
                <Input size="sm" fit className="w-28" value={filterOwner}
                  onChange={e => setFilterOwner(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') setPubOwner(filterOwner) }}
                  placeholder="输入用户名" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SearchInput
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery('')}
              placeholder="搜索牌组名"
              className="w-56 sm:w-64" />
            <Select size="sm" fit className="w-28 shrink-0" value={sort} aria-label="排序方式"
              onChange={v => setSort(v as 'newest' | 'name' | 'cards')}
              options={[
                { value: 'newest', label: '最新' },
                { value: 'name', label: '名称' },
                { value: 'cards', label: '牌数' },
              ]} />
          </div>
        </>
      }
    >

      {/* 错误态：错误文案 + 重试 */}
      {!loading && error && (
        <FadeIn
          className="text-center py-16 rounded-2xl bg-panel-void border border-danger/30">
          <AlertCircle size={20} className="mx-auto text-crimson mb-3" aria-hidden="true" />
          <p className="text-crimson text-sm font-serif mb-1">{error}</p>
          <p className="text-muted text-xs font-serif mb-5">请稍后重试</p>
          <Button variant="outline" size="sm" icon={<RefreshCw size={16} />} onClick={handleRetry}>重试</Button>
        </FadeIn>
      )}

      {/* 加载态：卡组卡面骨架屏替代 PageSpinner（§7.1），网格与卡组列表一致 */}
      {loading && (
        <Skeleton variant="card" rows={6}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4" />
      )}
      {/* 空态（§7.2：我的牌组 / 协作·公共无结果，均带可用 CTA） */}
      {!loading && !error && decks.length === 0 && (
        <FadeIn
          className="rounded-2xl bg-panel-void border border-accent/15">
          {tab === 'mine' ? (
            <EmptyState
              title="还没有牌组"
              description="从牌库挑几张歌牌组一套阵容"
              action={<Button icon={<Images size={16} />} onClick={() => navigate(paths.cards())}>去牌库</Button>}
            />
          ) : (
            <EmptyState
              title="没有找到匹配的牌组"
              description="换个关键词或创建人试试"
              action={<Button variant="outline" icon={<X size={16} />} onClick={clearDeckFilters}>清除筛选</Button>}
            />
          )}
        </FadeIn>
      )}

      {/* 牌组卡片网格（2026-10-05）：去掉封面后卡片纯信息，列数由 6 降到 4（6 列时卡片
          ~190px，名称全被截断）。用 CSS grid 而非 flex-wrap：grid 轨道是 minmax(0,1fr)，
          长用户名不会把卡片撑宽、每排恒为 N 张；flex-wrap 会因 min-width:auto 使某排少一张
          （列表中间出现缺位，2026-10-05 修正） */}
      {!loading && !error && decks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {decks.map((deck, i) => (
              <motion.div key={deck.id} exit={{ opacity: 0, scale: 0.9 }}>
                {/* 入场走 FadeIn（设计系统 §1.5），motion 仅保留 AnimatePresence 退场 */}
                <FadeIn delay={i * 40} className="h-full">
                {/* 牌组卡面：PanelSurface 墨色渐变底；hover 统一 lift（抬升 + 投影），不再叠描金 glow */}
                <PanelSurface variant="ink" radius="2xl"
                  className={`group h-full cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all duration-250 ${selectMode && selectedIds.has(deck.id) ? 'ring-2 ring-gold/70' : ''}`}
                  onClick={() => (selectMode ? toggleDeckSelect(deck.id) : navigate(paths.deck(deck.id)))}>
                {/* 牌组不用预览封面（2026-10-05 Owner 裁定）：封面拼贴信息量低、
                    无封面时大量黑块，卡面还很占高；改为纯信息卡 */}
                <div className="p-4 flex flex-col h-full">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* 多选勾选圈（2026-09-30）：选中描金描边，点卡或点圈皆可切换 */}
                      {selectMode && (
                        <button
                          onClick={e => { e.stopPropagation(); toggleDeckSelect(deck.id) }}
                          className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center border-2 transition-colors ${selectedIds.has(deck.id) ? 'bg-gold border-gold text-ink-deep' : 'border-white/50 bg-black/40 text-transparent'}`}
                          aria-label="选择牌组">
                          <Check size={12} />
                        </button>
                      )}
                      <h3 className="font-sans font-semibold text-white text-sm truncate">{deck.name}</h3>
                    </div>
                    <span className="shrink-0 text-gold text-xs inline-flex items-center gap-1"><Images size={12} aria-hidden="true" /> {deck.card_count}</span>
                  </div>
                  <p className="text-muted/70 text-xs line-clamp-1">{deck.description || '暂无描述'}</p>
                  {/* 底簇贴底（mt-auto）：牌组名/描述长短不一时卡片底部仍对齐 */}
                  <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ShareBadge level={deck.share_level} />
                      {deck.owner_name && tab !== 'mine' && (
                        <span className="text-muted/70 text-xs truncate">by {deck.owner_name}</span>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); void handleLikeDeck(deck) }}
                      disabled={likeBusyId !== 0}
                      aria-label="收藏牌组"
                      className={`shrink-0 flex items-center gap-0.5 text-tiny transition-colors disabled:opacity-50 ${deck.liked_by_me ? 'text-crimson' : 'text-muted/70 hover:text-crimson'}`}>
                      <Heart size={12} fill={deck.liked_by_me ? 'currentColor' : 'none'} />
                      <span className="tabular-nums">{deck.likes ?? 0}</span>
                    </button>
                  </div>
                  {!selectMode && (
                    <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-accent/[0.08]">
                      <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); navigate(paths.deck(deck.id)) }} icon={<Eye size={12} aria-hidden="true" />}>查看</Button>
                      <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); openPickerFor(deck) }} icon={<Swords size={12} aria-hidden="true" />}>用它开局</Button>
                    </div>
                  )}
                </div>
                </PanelSurface>
                </FadeIn>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 多选吸底批量条（2026-09-30）：批量删除/批量改共享，失败项保留选中可重试 */}
      {selectMode && tab === 'mine' && (
        <ActionBar className="animate-slide-in-up">
          <Button size="xs" variant="ghost" disabled={batchBusy} onClick={() => {
            if (selectedIds.size === decks.length) setSelectedIds(new Set())
            else setSelectedIds(new Set(decks.map(d => d.id)))
          }}>
            {selectedIds.size === decks.length && decks.length > 0 ? '取消全选' : '全选'}
          </Button>
          <Button size="xs" variant="outline" disabled={selectedIds.size === 0 || batchBusy}
            onClick={() => setShareDialogOpen(true)} icon={<Share2 size={12} />}>批量改共享</Button>
          <Button size="xs" variant="danger" disabled={selectedIds.size === 0 || batchBusy}
            onClick={() => setBatchConfirm(true)} icon={<Trash2 size={12} />}>批量删除</Button>
          <Button size="xs" variant="ghost" disabled={batchBusy} onClick={toggleSelectMode}>完成</Button>
        </ActionBar>
      )}

      </ListPageShell>

      {/* AI 制作导入包提示词（2026-09-30）：格式规格即提示词，交给用户 AI 产出 .zip */}
      <PackPromptDialog open={showPackPrompt} onClose={() => setShowPackPrompt(false)} />

      {/* 批量删除确认（2026-09-30）：牌与组解耦——删组不动牌库歌牌 */}
      <ConfirmDialog
        open={batchConfirm}
        title={`删除选中的 ${selectedIds.size} 个牌组？`}
        description="只删除牌组本身，牌库里的歌牌不受影响，无法撤销"
        confirmText="删除"
        danger
        loading={batchBusy}
        onConfirm={handleBatchDelete}
        onCancel={() => setBatchConfirm(false)}
      />

      {/* 批量改共享（2026-09-30）：共享范围 + 编辑权限一次设定，失败项保留可重试 */}
      <Dialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        title={`批量改共享（${selectedIds.size} 个牌组）`}
        size="sm"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShareDialogOpen(false)}>取消</Button>
            <Button size="sm" loading={batchBusy} onClick={handleBatchShare}>确认修改</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-muted text-xs flex items-center gap-1.5 mb-1.5"><Globe size={12} aria-hidden="true" /> 共享范围</label>
            <SegmentedTabs variant="chip" size="sm" aria-label="共享范围"
              value={batchShare}
              onChange={v => { setBatchShare(v); if (v !== 'editable') setBatchEdit('add_only') }}
              options={[
                { value: 'private', label: '私有' },
                { value: 'playable', label: '可使用' },
                { value: 'editable', label: '可编辑' },
              ]} />
          </div>
          {batchShare === 'editable' && (
            <div>
              <label className="text-muted text-xs flex items-center gap-1.5 mb-1.5"><Pencil size={12} aria-hidden="true" /> 编辑权限</label>
              <SegmentedTabs variant="chip" size="sm" aria-label="编辑权限"
                value={batchEdit}
                onChange={v => setBatchEdit(v)}
                options={[
                  { value: 'add_only', label: '仅添加' },
                  { value: 'full', label: '完全编辑' },
                ]} />
            </div>
          )}
          <p className="text-tiny text-muted/70">仅作用于选中的牌组；失败项会保留在选中集里可重试</p>
        </div>
      </Dialog>

      {/* 创建弹窗（统一 Dialog） */}
      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="新建牌组"
        size="sm"
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={handleCreate} loading={creating} disabled={!newName.trim()}>创建</Button>
          </>
        }
      >
        <p className="text-muted/70 text-xs mb-5">给牌组起个名字</p>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleCreate() }} className="flex flex-col gap-4">
          <div>
            <Input label={<span className="inline-flex items-center gap-1.5"><Images size={12} aria-hidden="true" /> 牌组名称 *</span>} type="text" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="例：百人一首·极" required autoFocus />
          </div>
          <div>
            <Textarea label={<span className="inline-flex items-center gap-1.5"><FileText size={12} aria-hidden="true" /> 描述（选填）</span>} value={newDesc} onChange={e => setNewDesc(e.target.value)}
              className="resize-none" placeholder="简单介绍一下这副牌组" rows={2} />
          </div>
          <div>
            <label className="text-muted text-xs flex items-center gap-1.5 mb-1.5"><Share2 size={12} aria-hidden="true" /> 共享级别</label>
            <div className="flex gap-2 flex-wrap">
              {(['private', 'playable', 'editable'] as const).map(value => {
                const meta = SHARE_BADGE[value]
                const OptIcon = meta.icon
                return (
                  <button key={value} type="button"
                    onClick={() => setNewShareLevel(value)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg transition-all inline-flex items-center gap-1 ${
                      newShareLevel === value
                        ? 'bg-gold/20 text-gold border border-gold/40'
                        : 'bg-white/5 text-white/50 border border-transparent hover:border-white/10'
                    }`}>
                    <OptIcon size={12} aria-hidden="true" />
                    {meta.text}
                  </button>
                )
              })}
            </div>
          </div>
          {newShareLevel === 'editable' && (
            <div>
              <label className="text-muted text-xs flex items-center gap-1.5 mb-1.5"><Pencil size={12} aria-hidden="true" /> 编辑权限</label>
              <div className="flex gap-2">
                {([
                  { value: 'add_only', label: '仅添加' },
                  { value: 'full', label: '完全编辑' },
                ] as const).map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setNewEditLevel(opt.value)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg transition-all ${
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
        </form>
      </Dialog>

      {/* 牌组出阵快速开局弹层（锁定牌组） */}
      <PresetPicker
        open={pickerDeck !== null}
        decks={pickerDeck ? [pickerDeck] : []}
        defaultDeckId={pickerDeck?.id}
        lastConfig={lastConfig}
        onSelect={handlePresetSelect}
        loading={roomCreating}
        onCustomize={handlePresetCustomize}
        onClose={() => setPickerDeck(null)}
      />
    </>
  )
}

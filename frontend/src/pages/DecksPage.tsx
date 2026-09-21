import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
// 图标统一走 lucide-react（映射约定见 A3.1/A3.2）
import {
  Swords, Layers, Globe, Images, Plus, Eye, X,
  Lock, Gamepad2, Pencil, Share2, FileText, AlertCircle, RefreshCw, Heart, Upload,
  type LucideIcon,
} from 'lucide-react'
import {
  Button, Input, SearchInput, Textarea, Badge, Dialog, EmptyState, HeroHeader,
  PageContainer, Skeleton, useToast, type BadgeTone,
} from '../components/ui'
import { useMyDecks, useEditableDecks, usePublicDecks, queryKeys } from '../api/queries'
import { api } from '../api/client'
import { paths } from '../routes/paths'
import { PresetPicker } from '../features/play/PresetPicker'
import { createRoomFromConfig, writeLastConfig, readLastConfig } from '../features/play/roomCreate'
import { importDeckPack } from '../utils/deckPack'
import { cardPlaceholderStyle } from '../components/CardTile'
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
      <Icon size={11} />
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

  // 创建弹窗状态
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
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

  const allDecks = activeQ.data ?? []
  // 关键词本地筛选（按牌组名）
  const decks = searchQuery
    ? allDecks.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allDecks

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
    <PageContainer size="xl">
      {/* 顶部 Hero 头部 */}
      <HeroHeader
        icon={<Swords size={22} aria-hidden="true" />}
        title="牌组"
        subtitle={tab === 'mine' ? '管理我的牌组' : tab === 'editable' ? '可协作编辑的牌组' : '公开共享的牌组'}
        actions={
          <>
            <Button variant="ghost" disabled={packing} icon={<Upload size={15} />} onClick={() => importInputRef.current?.click()}>导入牌组</Button>
            <Button icon={<Plus size={16} />} onClick={() => setShowCreate(true)}>新建牌组</Button>
            <input ref={importInputRef} type="file" accept=".zip" className="hidden"
              onChange={e => void handleImportDeckFile(e.target.files?.[0] ?? null)} />
          </>
        }
      />

      {/* 页签（pill 样式，图标 + 文案） */}
      <div className="flex gap-0.5 mb-6 bg-white/5 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('mine')}
          className={`px-5 py-2 text-sm font-medium rounded-lg transition-all inline-flex items-center gap-1.5 ${
            tab === 'mine'
              ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
              : 'text-muted hover:text-white/70'
          }`}>
          <Layers size={14} aria-hidden="true" />
          我的牌组
        </button>
        <button onClick={() => setTab('editable')}
          className={`px-5 py-2 text-sm font-medium rounded-lg transition-all inline-flex items-center gap-1.5 ${
            tab === 'editable'
              ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
              : 'text-muted hover:text-white/70'
          }`}>
          <Pencil size={14} aria-hidden="true" />
          协作牌组
        </button>
        <button onClick={() => { setTab('public'); setPubOwner(filterOwner) }}
          className={`px-5 py-2 text-sm font-medium rounded-lg transition-all inline-flex items-center gap-1.5 ${
            tab === 'public'
              ? 'bg-gradient-to-r from-gold/20 to-pink-500/10 text-gold shadow-sm'
              : 'text-muted hover:text-white/70'
          }`}>
          <Globe size={14} aria-hidden="true" />
          公共牌组
        </button>
      </div>

      {/* 搜索与筛选 */}
      <div className="mb-5">
        <div className="flex gap-2">
          <SearchInput
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
            placeholder="搜索牌组名"
            className="flex-1 max-w-sm" />
          {tab === 'public' && (
            <Input size="sm" fit className="w-28 shrink-0"
              value={filterOwner}
              onChange={e => setFilterOwner(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setPubOwner(filterOwner) }}
              placeholder="创建人" />
          )}
        </div>
      </div>

      {/* 错误态：错误文案 + 重试 */}
      {!loading && error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-center py-16 rounded-2xl"
          style={{ background: 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.5), rgb(var(--accent-bg-mid)/ 0.8))', border: '1px dashed rgb(var(--accent-primary)/ 0.2)' }}>
          <AlertCircle size={28} className="mx-auto text-crimson mb-3" aria-hidden="true" />
          <p className="text-crimson text-sm font-serif mb-1">{error}</p>
          <p className="text-muted text-xs font-serif mb-5">请稍后重试</p>
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={handleRetry}>重试</Button>
        </motion.div>
      )}

      {/* 加载态：卡组卡面骨架屏替代 PageSpinner（§7.1），网格与卡组列表一致 */}
      {loading && (
        <Skeleton variant="card" rows={6}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4" />
      )}
      {/* 空态（§7.2：我的牌组 / 协作·公共无结果，均带可用 CTA） */}
      {!loading && !error && decks.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-2xl"
          style={{ background: 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.5), rgb(var(--accent-bg-mid)/ 0.8))', border: '1px dashed rgb(var(--accent-primary)/ 0.2)' }}>
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
        </motion.div>
      )}

      {/* 牌组卡片网格 */}
      {!loading && !error && decks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <AnimatePresence>
            {decks.map((deck, i) => (
              <motion.div key={deck.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.04 }}
                className="group relative rounded-xl overflow-hidden
                           cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-pink-500/10 transition-all duration-250"
                style={{ background: 'linear-gradient(180deg, rgb(var(--color-ink)) 0%, rgb(var(--color-ink-deep)) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}
                onClick={() => navigate(paths.deck(deck.id))}>
                {/* 封面拼贴（v8）：前 4 张成员卡 2×2；无封面回退确定性渐变 + 首字 */}
                <div className="grid grid-cols-2 grid-rows-2 h-28" style={deck.cover_urls?.length ? undefined : cardPlaceholderStyle(deck.id)}>
                  {deck.cover_urls?.length ? (
                    [0, 1, 2, 3].map(slot => (
                      <div key={slot} className="overflow-hidden bg-ink-deep">
                        {deck.cover_urls![slot]
                          ? <img src={deck.cover_urls![slot]} alt="" loading="lazy" className="w-full h-full object-cover" />
                          : <div className="w-full h-full" style={{ background: 'rgb(var(--color-ink-deep))' }} />}
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 row-span-2 flex items-center justify-center">
                      <span className="text-4xl font-serif font-bold text-white/60">{(deck.name || '牌').trim().charAt(0)}</span>
                    </div>
                  )}
                </div>
                {/* 点赞（右上角悬浮） */}
                <button
                  onClick={e => { e.stopPropagation(); void handleLikeDeck(deck) }}
                  disabled={likeBusyId !== 0}
                  className={`absolute top-2 right-2 h-7 px-2 rounded-full flex items-center gap-1 text-[11px] bg-black/50 backdrop-blur-sm transition-colors disabled:opacity-50 ${deck.liked_by_me ? 'text-crimson' : 'text-white/70 hover:text-crimson'}`}>
                  <Heart size={12} fill={deck.liked_by_me ? 'currentColor' : 'none'} />
                  <span className="tabular-nums">{deck.likes ?? 0}</span>
                </button>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-sans font-semibold text-white text-sm truncate">{deck.name}</h3>
                    <span className="text-gold text-xs shrink-0 inline-flex items-center gap-1"><Images size={12} aria-hidden="true" /> {deck.card_count}</span>
                  </div>
                  <p className="text-muted/40 text-xs line-clamp-1 mb-3">{deck.description || '暂无描述'}</p>
                  <div className="flex items-center justify-between">
                    <ShareBadge level={deck.share_level} />
                    {deck.owner_name && tab !== 'mine' && (
                      <span className="text-muted/50 text-xs">by {deck.owner_name}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid rgb(var(--accent-primary)/ 0.08)' }}>
                    <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); navigate(paths.deck(deck.id)) }} icon={<Eye size={12} aria-hidden="true" />}>查看</Button>
                    <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); openPickerFor(deck) }} icon={<Swords size={12} aria-hidden="true" />}>用它开局</Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

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
        <p className="text-muted/50 text-xs mb-5 font-serif italic">给牌组起个名字</p>
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
                    className={`text-xs px-2.5 py-1.5 rounded-md transition-all inline-flex items-center gap-1 ${
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
    </PageContainer>
  )
}

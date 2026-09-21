import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Swords, Download, Copy, Trash2, Plus, Lock, Play, Music, ListChecks, Check, Image as ImageIcon, Heart, ArrowUp, ArrowDown } from 'lucide-react'
import {
  Button, Input, ConfirmDialog, Dialog, EmptyState, HeroHeader,
  PageContainer, Skeleton, useToast,
} from '../components/ui'
import { useDeckDetail, queryKeys } from '../api/queries'
import { api } from '../api/client'
import { paths } from '../routes/paths'
import type { Card } from '../api/types'
import { CardPicker } from '../components/CardPicker'
import { CardTile } from '../components/CardTile'
import { CardDrawer } from '../components/CardDrawer'
import { exportDeckPack } from '../utils/deckPack'
import { useAuth } from '../hooks/useAuth'
import { PresetPicker } from '../features/play/PresetPicker'
import { createRoomFromConfig, writeLastConfig, readLastConfig } from '../features/play/roomCreate'
import type { RoomConfig } from '../features/play/roomConfig'

export function DeckDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  // —— 出阵 → 快速开局（§6.2：PresetPicker 锁定本牌组） ——
  const [pickerOpen, setPickerOpen] = useState(false)
  const [lastConfig, setLastConfig] = useState<RoomConfig | null>(null)
  const [roomCreating, setRoomCreating] = useState(false)

  const openPicker = () => {
    setLastConfig(readLastConfig())
    setPickerOpen(true)
  }

  // 预设直接创建：成功写上次配置并跳新房，失败 toast（弹层保留可重试）
  const handlePresetSelect = async (config: RoomConfig, pickedDeckId: number) => {
    if (roomCreating) return
    setRoomCreating(true)
    try {
      const room = await createRoomFromConfig(pickedDeckId, config)
      writeLastConfig(config)
      setPickerOpen(false)
      navigate(paths.room(room.id))
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '创建失败，请重试', 'fail', 2500)
    } finally {
      setRoomCreating(false)
    }
  }

  // 预设跳完整表单：携带预设配置
  const handlePresetCustomize = (config: RoomConfig, pickedDeckId: number) => {
    setPickerOpen(false)
    navigate(paths.roomNew(pickedDeckId), { state: { presetConfig: config } })
  }

  // Edit name/desc
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Share settings（本地乐观态，deck 加载后同步）
  const [shareLevel, setShareLevel] = useState('private')
  const [editLevel, setEditLevel] = useState('add_only')
  const [savingShare, setSavingShare] = useState(false)

  // Card picker
  const [showPicker, setShowPicker] = useState(false)

  // Remove card
  const [removeCardId, setRemoveCardId] = useState<number | null>(null)
  const [removing, setRemoving] = useState(false)

  // Delete deck
  const [showDeleteDeck, setShowDeleteDeck] = useState(false)
  const [deletingDeck, setDeletingDeck] = useState(false)

  // Clone
  const [showCloneOptions, setShowCloneOptions] = useState(false)
  const [cloning, setCloning] = useState(false)

  // Export
  const [exporting, setExporting] = useState(false)

  // Multi-select delete
  const [selectMode, setSelectMode] = useState(false)
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [batchRemoving, setBatchRemoving] = useState(false)

  // v8 增补：详情抽屉 / 排序模式 / 点赞
  const [drawerId, setDrawerId] = useState<number | null>(null)
  const [orderMode, setOrderMode] = useState(false)
  const [orderedIds, setOrderedIds] = useState<number[]>([])
  const [savingOrder, setSavingOrder] = useState(false)
  const [likeOverride, setLikeOverride] = useState<{ liked: boolean; likes: number } | null>(null)
  const [likeBusy, setLikeBusy] = useState(false)

  // Audio preview
  const [playingCardId, setPlayingCardId] = useState<number | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  const deckId = parseInt(id ?? '0', 10)

  // —— 数据查询（TanStack Query）——
  const detailQ = useDeckDetail(deckId)
  const deck = detailQ.data?.deck ?? null
  const cards = detailQ.data?.cards ?? []
  const loading = detailQ.isPending
  const error = detailQ.isError
    ? ((detailQ.error as Error)?.message || '加载失败，请重试')
    : null

  // 卸载时停止预览音频
  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
    }
  }, [])

  // deck 变化（首次加载 / 失效重取）时同步共享级别本地态
  useEffect(() => {
    if (deck) {
      setShareLevel(deck.share_level || 'private')
      setEditLevel(deck.edit_level || 'add_only')
    }
  }, [deck])

  // 牌组数据变更后失效详情缓存（名称/描述/共享/牌数都会变）
  const refreshDeck = () => qc.invalidateQueries({ queryKey: queryKeys.decks.detail(deckId) })
  // 牌组列表缓存失效（我的 / 公共）
  const refreshDeckLists = async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.decks.mine })
    await qc.invalidateQueries({ queryKey: queryKeys.decks.public() })
  }

  const startEdit = () => {
    setEditName(deck?.name || '')
    setEditDesc(deck?.description || '')
    setEditingName(true)
  }

  /** 保存名称/描述，成功后关闭弹窗并刷新详情与列表 */
  const saveEdit = async () => {
    if (!editName.trim()) return
    setSavingName(true)
    try {
      await api.decks.update(deckId, { name: editName.trim(), description: editDesc.trim() })
      setEditingName(false)
      await refreshDeck()
      await refreshDeckLists()
    } catch (e) {
      toast.show((e as Error).message || '保存失败，请重试', 'fail')
    } finally {
      setSavingName(false)
    }
  }

  /** 切换共享级别：本地乐观更新 + 失效缓存；失败 toast 并回滚为服务端值（2026-09-21 修复静默失败） */
  const handleShareChange = async (newShareLevel: string) => {
    setShareLevel(newShareLevel)
    setSavingShare(true)
    try {
      await api.decks.update(deckId, { share_level: newShareLevel })
      await refreshDeck()
      await refreshDeckLists()
    } catch (e) {
      toast.show((e as Error).message || '共享设置失败，请重试', 'fail')
      await refreshDeck() // 回滚乐观态为服务端真相
    }
    finally { setSavingShare(false) }
  }

  /** 切换编辑权限：本地乐观更新 + 失效缓存；失败 toast 并回滚（2026-09-21 修复静默失败） */
  const handleEditLevelChange = async (newEditLevel: string) => {
    setEditLevel(newEditLevel)
    setSavingShare(true)
    try {
      await api.decks.update(deckId, { edit_level: newEditLevel })
      await refreshDeck()
      await refreshDeckLists()
    } catch (e) {
      toast.show((e as Error).message || '共享设置失败，请重试', 'fail')
      await refreshDeck()
    }
    finally { setSavingShare(false) }
  }

  /** 从牌库添加歌牌入组，成功后刷新详情（牌数变化同步列表） */
  const handleAddCards = async (cardIds: number[]) => {
    if (cardIds.length === 0) return
    try {
      await api.decks.addCards(deckId, cardIds)
      await refreshDeck()
      await qc.invalidateQueries({ queryKey: queryKeys.decks.mine })
    } catch (e) {
      toast.show((e as Error).message || '添加失败，请重试', 'fail')
    }
  }

  /** 从牌组移除单张牌（不停止其预览音频），成功后刷新详情 */
  const handleRemoveCard = async (cardId: number) => {
    setRemoving(true)
    try {
      if (playingCardId === cardId) {
        previewAudioRef.current?.pause()
        previewAudioRef.current = null
        setPlayingCardId(null)
      }
      await api.decks.removeCard(deckId, cardId)
      setRemoveCardId(null)
      await refreshDeck()
      await qc.invalidateQueries({ queryKey: queryKeys.decks.mine })
    } catch (e) {
      toast.show((e as Error).message || '移除失败，请重试', 'fail')
    }
    finally { setRemoving(false) }
  }

  /** 复制牌组到自己名下，成功后跳回牌组列表 */
  const handleClone = async (mode: 'full' | 'covers_only') => {
    setCloning(true)
    setShowCloneOptions(false)
    try {
      await api.decks.clone(deckId, mode)
      await refreshDeckLists()
      navigate(paths.decks())
    } catch (e) {
      toast.show((e as Error).message || '复制失败，请重试', 'fail')
    }
    finally { setCloning(false) }
  }

  /** 解散牌组，成功后失效列表缓存并跳回首页 */
  const handleDeleteDeck = async () => {
    setDeletingDeck(true)
    try {
      await api.decks.delete(deckId)
      await refreshDeckLists()
      navigate(paths.home())
    } catch (e) {
      toast.show((e as Error).message || '删除失败，请重试', 'fail')
      setShowDeleteDeck(false)
    } finally {
      setDeletingDeck(false)
    }
  }

  /** 导出牌组包（v8 升级：manifest + 全部音频/封面，可跨机导入重建） */
  const handleExport = async () => {
    if (cards.length === 0 || !deck) return
    setExporting(true)
    try {
      const blob = await exportDeckPack({ name: deck.name, description: deck.description }, cards)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${deck.name}_牌组包.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.show(`✓ 已导出牌组包（${cards.length} 张）`, 'success')
    } catch {
      toast.show('导出失败，请重试', 'fail')
    } finally {
      setExporting(false)
    }
  }

  /** 点赞开关（本地即时更新 + in-flight 守卫） */
  const handleToggleLike = async () => {
    if (likeBusy || !deck) return
    setLikeBusy(true)
    try {
      const res = await api.decks.toggleLike(deck.id)
      setLikeOverride(res)
    } catch {
      toast.show('操作失败，请重试', 'fail')
    } finally {
      setLikeBusy(false)
    }
  }

  /** 排序：进入时以当前展示序初始化；上移/下移本地交换 */
  const enterOrderMode = () => {
    setOrderedIds(cards.map(c => c.id))
    setOrderMode(true)
  }
  const moveCard = (idx: number, dir: -1 | 1) => {
    setOrderedIds(prev => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }
  const handleSaveOrder = async () => {
    setSavingOrder(true)
    try {
      await api.decks.reorder(deckId, orderedIds)
      toast.show('✓ 牌序已保存', 'success')
      setOrderMode(false)
      await refreshDeck()
    } catch {
      toast.show('保存失败，请重试', 'fail')
    } finally {
      setSavingOrder(false)
    }
  }

  /** 批量从牌组移除选中牌，成功后刷新详情 */
  const handleBatchRemove = async () => {
    if (selectedCards.size === 0) return
    setBatchRemoving(true)
    try {
      for (const cardId of selectedCards) {
        await api.decks.removeCard(deckId, cardId)
      }
      setSelectedCards(new Set())
      setSelectMode(false)
      await refreshDeck()
      await qc.invalidateQueries({ queryKey: queryKeys.decks.mine })
    } catch {
      toast.show('移除失败，请重试', 'fail')
    }
    finally { setBatchRemoving(false) }
  }

  const toggleSelect = (cardId: number) => {
    setSelectedCards(prev => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  /** 单卡音频试听：同卡再点暂停，换卡则停旧播新 */
  const togglePlay = (card: Card) => {
    if (playingCardId === card.id) {
      previewAudioRef.current?.pause()
      setPlayingCardId(null)
      return
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
    }
    const url = card.audios?.[0]?.audio_url || card.audio_url
    if (!url) return
    const audio = new Audio(url)
    audio.onended = () => setPlayingCardId(null)
    audio.onerror = () => setPlayingCardId(null)
    audio.play()
    previewAudioRef.current = audio
    setPlayingCardId(card.id)
  }

  const isOwner = !!(user && deck && user.id === deck.owner_id)
  const canAdd = isOwner || (deck?.share_level === 'editable')
  const canRemove = isOwner || (deck?.share_level === 'editable' && deck?.edit_level === 'full')

  return (
    <PageContainer size="lg">
      {/* 顶部 Hero 头部 */}
      <HeroHeader
        onBack={() => navigate(paths.home())}
        backLabel="返回"
        title={deck?.name || '牌组详情'}
        subtitle={deck ? `${deck.description || '暂无描述'} · ${deck.card_count} 张歌牌` : undefined}
        actions={
          deck ? (
            <>
              {/* 点赞（v8；任意可见牌组可赞） */}
              <Button variant="ghost" size="sm" disabled={likeBusy} onClick={() => void handleToggleLike()}
                icon={<Heart size={13} fill={(likeOverride?.liked ?? deck?.liked_by_me) ? 'currentColor' : 'none'} />}>
                {likeOverride?.likes ?? deck?.likes ?? 0}
              </Button>
              {isOwner && (
                <Button variant="ghost" size="sm" onClick={startEdit} icon={<Pencil size={12} aria-hidden="true" />}>修改</Button>
              )}
              <Button size="sm" onClick={openPicker} icon={<Swords size={16} />}>用它开局</Button>
              <Button variant="outline" size="sm" onClick={handleExport} loading={exporting} disabled={cards.length === 0}
                title="下载所有牌面封面图的压缩包" icon={<Download size={16} />}>导出封面</Button>
              <Button variant="outline" size="sm" onClick={() => setShowCloneOptions(true)} loading={cloning} icon={<Copy size={16} />}>复制</Button>
              {isOwner && (
                <Button variant="danger" size="sm" onClick={() => setShowDeleteDeck(true)} icon={<Trash2 size={14} aria-hidden="true" />} aria-label="删除牌组" title="删除牌组" />
              )}
            </>
          ) : undefined
        }
      />

      {/* 共享设置（仅 owner） */}
      {deck && isOwner && (
        <div className="flex items-center gap-3 mb-6 flex-wrap rounded-xl px-4 py-3"
          style={{ background: 'rgb(var(--accent-bg-end)/ 0.4)', border: '1px solid rgb(var(--accent-primary)/ 0.08)' }}>
          <span className="text-muted/50 text-xs font-serif">共享范围：</span>
          <div className="flex gap-1.5">
            {Object.entries(SHARE_LABELS).map(([key, { label, icon: Icon }]) => (
              <button key={key}
                onClick={() => handleShareChange(key)}
                disabled={savingShare}
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all ${
                  shareLevel === key
                    ? 'bg-gradient-to-r from-gold/25 to-pink-500/15 text-gold border border-gold/40'
                    : 'bg-white/5 text-white/40 border border-white/5 hover:border-pink-300/20 hover:text-pink-300/70'
                }`}>
                <Icon size={12} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          {shareLevel === 'editable' && (
            <>
              <span className="text-muted/50 text-xs ml-2 font-serif">编辑权限：</span>
              <div className="flex gap-1.5">
                {Object.entries(EDIT_LABELS).map(([key, label]) => (
                  <button key={key}
                    onClick={() => handleEditLevelChange(key)}
                    disabled={savingShare}
                    className={`text-xs px-3 py-1.5 rounded-full transition-all ${
                      editLevel === key
                        ? 'bg-gradient-to-r from-gold/25 to-pink-500/15 text-gold border border-gold/40'
                        : 'bg-white/5 text-white/40 border border-white/5 hover:border-pink-300/20 hover:text-pink-300/70'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 错误态 */}
      {!loading && error && (
        <div className="text-crimson text-center py-12">
          {error}
          <div className="mt-2">
            <Button variant="ghost" size="sm" onClick={() => detailQ.refetch()}>重试</Button>
          </div>
        </div>
      )}

      {/* 加载态：牌面行骨架屏替代 PageSpinner（§7.1），与下方行列表布局一致 */}
      {loading && <Skeleton variant="row" rows={5} />}

      {/* 卡牌列表 */}
      {!loading && !error && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-muted/50 text-xs tracking-widest font-serif flex items-center gap-1.5">
              <Music size={12} aria-hidden="true" />牌组内容 ({cards.length} 张)
            </h2>
            <div className="flex items-center gap-2">
              {canRemove && cards.length > 0 && !selectMode && !orderMode && (
                <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)} icon={<ListChecks size={12} aria-hidden="true" />}>编辑</Button>
              )}
              {canRemove && cards.length > 1 && !selectMode && !orderMode && (
                <Button variant="ghost" size="sm" onClick={enterOrderMode} icon={<ArrowUp size={12} aria-hidden="true" />}>排序</Button>
              )}
              {canAdd && !selectMode && !orderMode && (
                <Button size="sm" onClick={() => setShowPicker(true)} icon={<Plus size={14} />}>从牌库添加</Button>
              )}
            </div>
          </div>

          {/* 多选模式工具栏 */}
          {selectMode && (
            <div className="mb-3 flex items-center justify-between px-4 py-2.5 rounded-xl"
              style={{ background: 'rgb(var(--accent-primary)/ 0.08)', border: '1px solid rgb(var(--accent-primary)/ 0.2)' }}>
              <div className="flex items-center gap-3">
                <button onClick={() => {
                  if (selectedCards.size === cards.length) setSelectedCards(new Set())
                  else setSelectedCards(new Set(cards.map(c => c.id)))
                }}
                  className="text-xs text-gold/80 hover:text-gold transition-colors">
                  {selectedCards.size === cards.length ? '取消全选' : '全选'}
                </button>
                <span className="text-muted text-xs font-serif">
                  已选中 <span className="text-gold font-bold">{selectedCards.size}</span> 张
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleBatchRemove}
                  disabled={selectedCards.size === 0 || batchRemoving}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-30 hover:scale-105"
                  style={{ background: 'rgb(var(--accent-primary)/ 0.15)', border: '1px solid rgb(var(--accent-primary)/ 0.3)', color: 'rgb(var(--color-gold))' }}>
                  {batchRemoving ? '移除中…' : '移除选中'}
                </button>
                <button onClick={() => { setSelectMode(false); setSelectedCards(new Set()) }}
                  className="text-xs px-3 py-1.5 rounded-lg text-muted hover:text-white transition-colors"
                  style={{ border: '1px solid rgb(var(--accent-primary)/ 0.1)' }}>
                  完成
                </button>
              </div>
            </div>
          )}

          {/* 排序模式工具栏 */}
          {orderMode && (
            <div className="mb-3 flex items-center justify-between px-4 py-2.5 rounded-xl"
              style={{ background: 'rgb(var(--color-gold)/ 0.06)', border: '1px solid rgb(var(--color-gold)/ 0.25)' }}>
              <span className="text-muted text-xs font-serif">调整牌序：↑↓ 移动，保存后对局按此顺序入场</span>
              <div className="flex items-center gap-2">
                <Button size="sm" loading={savingOrder} onClick={() => void handleSaveOrder()}>保存顺序</Button>
                <Button size="sm" variant="ghost" onClick={() => setOrderMode(false)}>取消</Button>
              </div>
            </div>
          )}

          {cards.length === 0 ? (
            <div className="rounded-2xl"
              style={{ background: 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.5), rgb(var(--accent-bg-mid)/ 0.8))', border: '1px dashed rgb(var(--accent-primary)/ 0.2)' }}>
              {/* 空态：EmptyState 统一组件（默认樱花插画，空状态插画允许 emoji），保留和纸渐变容器 */}
              <EmptyState
                title="牌组还没有歌牌"
                description={canAdd ? '从牌库添加歌牌' : '牌组还是空的'}
                action={canAdd ? (
                  <Button onClick={() => setShowPicker(true)} icon={<Plus size={14} />}>从牌库添加</Button>
                ) : undefined}
              />
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <AnimatePresence>
                {(orderMode
                  ? orderedIds.map(id => cards.find(c => c.id === id)).filter((c): c is Card => !!c)
                  : cards
                ).map((card, i) => (
                  <motion.div key={card.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: Math.min(i * 0.01, 0.3) }}
                    className="relative group">
                    <CardTile
                      card={card}
                      selectable={selectMode}
                      selected={selectedCards.has(card.id)}
                      playing={playingCardId === card.id}
                      onOpen={() => { previewAudioRef.current?.pause(); setPlayingCardId(null); setDrawerId(card.id) }}
                      onTogglePlay={togglePlay}
                      onSelect={toggleSelect}
                    />
                    {/* 排序模式：序号角标 + 上移/下移 */}
                    {orderMode && (
                      <>
                        <span className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/70 text-gold text-xs flex items-center justify-center font-bold tabular-nums">{i + 1}</span>
                        <div className="absolute bottom-2 right-2 flex gap-1">
                          <button onClick={() => moveCard(i, -1)} disabled={i === 0}
                            className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30 hover:bg-gold/80 hover:text-ink-deep transition-all">
                            <ArrowUp size={13} />
                          </button>
                          <button onClick={() => moveCard(i, 1)} disabled={i === orderedIds.length - 1}
                            className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30 hover:bg-gold/80 hover:text-ink-deep transition-all">
                            <ArrowDown size={13} />
                          </button>
                        </div>
                      </>
                    )}
                    {/* 移除入口（非多选/排序态 hover 显示） */}
                    {canRemove && !selectMode && !orderMode && (
                      <button onClick={() => setRemoveCardId(card.id)}
                        className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full bg-black/60 text-muted hover:text-crimson flex items-center justify-center">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* 复制方式选择弹窗 */}
      <Dialog
        open={showCloneOptions}
        onClose={() => setShowCloneOptions(false)}
        title={<span className="inline-flex items-center gap-1.5"><Copy size={16} aria-hidden="true" />复制牌组</span>}
        size="sm"
        actions={<Button variant="ghost" onClick={() => setShowCloneOptions(false)}>取消</Button>}
      >
        <p className="text-muted/40 text-xs font-serif mb-4">选择复制方式</p>
        <div className="space-y-2">
          <button onClick={() => handleClone('full')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:scale-[1.02]"
            style={{ background: 'rgb(var(--accent-primary)/ 0.08)', border: '1px solid rgb(var(--accent-primary)/ 0.2)' }}>
            <Music size={20} className="text-gold/80 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-white/90 text-sm font-medium">复制牌面 + 歌曲</p>
              <p className="text-muted text-xs">引用相同的牌，完整保留歌曲</p>
            </div>
          </button>
          <button onClick={() => handleClone('covers_only')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:scale-[1.02]"
            style={{ background: 'rgb(var(--accent-primary)/ 0.05)', border: '1px solid rgb(var(--accent-primary)/ 0.1)' }}>
            <ImageIcon size={20} className="text-gold/80 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-white/90 text-sm font-medium">只复制牌面</p>
              <p className="text-muted text-xs">创建新牌只有封面，自行配歌</p>
            </div>
          </button>
        </div>
      </Dialog>

      <CardPicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleAddCards}
        excludeIds={cards.map(c => c.id)}
      />

      {/* 从牌组移除确认 */}
      <ConfirmDialog
        open={removeCardId !== null}
        title="从牌组中移除这张牌？"
        description="牌本身不会被删除，只是不再属于此牌组"
        confirmText="确认移除"
        danger
        loading={removing}
        onConfirm={() => { if (removeCardId !== null) handleRemoveCard(removeCardId) }}
        onCancel={() => setRemoveCardId(null)}
      />

      {/* 解散牌组确认 */}
      <ConfirmDialog
        open={showDeleteDeck}
        title="删除这个牌组？"
        description={`「${deck?.name}」将被删除，无法撤销。牌库中的歌牌不会被删除。`}
        confirmText="删除牌组"
        danger
        loading={deletingDeck}
        onConfirm={handleDeleteDeck}
        onCancel={() => setShowDeleteDeck(false)}
      />

      {/* 修改名称/描述弹窗 */}
      <Dialog
        open={editingName}
        onClose={() => setEditingName(false)}
        title={<span className="inline-flex items-center gap-1.5"><Pencil size={16} aria-hidden="true" />修改牌组</span>}
        size="sm"
        actions={
          <>
            <Button variant="outline" onClick={() => setEditingName(false)}>取消</Button>
            <Button onClick={saveEdit} loading={savingName} disabled={!editName.trim()}
              icon={<Check size={14} strokeWidth={3} />}>保存</Button>
          </>
        }
      >
        <p className="text-muted text-xs mb-5">修改牌组名称和描述</p>
        <div className="flex flex-col gap-4">
          <div>
            <Input label="牌组名称 *" type="text" value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit() }}
              placeholder="牌组名称" autoFocus />
          </div>
          <div>
            <Input label="描述（选填）" type="text" value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit() }}
              placeholder="描述（选填）" />
          </div>
        </div>
      </Dialog>

      {/* 卡片详情抽屉（v8：与牌库共用组件；牌组语境不提供加入牌组） */}
      <CardDrawer
        cardId={drawerId}
        onClose={() => setDrawerId(null)}
        onEdit={c => (user && c.owner_id === user.id) ? navigate(paths.cardEdit(c.id)) : undefined}
      />

      {/* 出阵快速开局弹层（锁定本牌组） */}
      <PresetPicker
        open={pickerOpen}
        decks={deck ? [deck] : []}
        defaultDeckId={deck?.id}
        lastConfig={lastConfig}
        onSelect={handlePresetSelect}
        loading={roomCreating}
        onCustomize={handlePresetCustomize}
        onClose={() => setPickerOpen(false)}
      />
    </PageContainer>
  )
}

// 共享级别标签：文字 + lucide 图标（原功能性 emoji 已全部图标化）
const SHARE_LABELS: Record<string, { label: string; icon: typeof Lock }> = {
  private: { label: '私有', icon: Lock },
  playable: { label: '可使用', icon: Play },
  editable: { label: '可编辑', icon: Pencil },
}

const EDIT_LABELS: Record<string, string> = {
  add_only: '仅添加',
  full: '完全编辑',
}

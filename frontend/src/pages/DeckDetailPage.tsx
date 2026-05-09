import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../components/Layout'
import { api } from '../api/client'
import type { Card, Deck } from '../api/types'
import { CardPicker } from '../components/CardPicker'
import { useAuth } from '../hooks/useAuth'

export function DeckDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [deck, setDeck] = useState<Deck | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit name/desc
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Share settings
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
  const [cloning, setCloning] = useState(false)

  // Export
  const [exporting, setExporting] = useState(false)

  // Multi-select delete
  const [selectMode, setSelectMode] = useState(false)
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [batchRemoving, setBatchRemoving] = useState(false)

  // Audio preview
  const [playingCardId, setPlayingCardId] = useState<number | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  const deckId = parseInt(id ?? '0', 10)

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
    }
  }, [])

  useEffect(() => { if (deckId) loadDeck() }, [deckId])

  const loadDeck = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.decks.get(deckId)
      setDeck(data.deck)
      setCards(data.cards ?? [])
      setShareLevel(data.deck.share_level || 'private')
      setEditLevel(data.deck.edit_level || 'add_only')
    } catch (e) {
      setError(e instanceof Error ? e.message : '牌组加载失败了… (；′⌒`)')
    } finally {
      setLoading(false)
    }
  }

  const startEdit = () => {
    setEditName(deck?.name || '')
    setEditDesc(deck?.description || '')
    setEditingName(true)
  }

  const saveEdit = async () => {
    if (!editName.trim()) return
    setSavingName(true)
    try {
      const updated = await api.decks.update(deckId, { name: editName.trim(), description: editDesc.trim() })
      if (updated) setDeck(updated)
      setEditingName(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败 (；′⌒`)')
    } finally {
      setSavingName(false)
    }
  }

  const handleShareChange = async (newShareLevel: string) => {
    setShareLevel(newShareLevel)
    setSavingShare(true)
    try {
      const updated = await api.decks.update(deckId, { share_level: newShareLevel })
      if (updated) setDeck(updated)
    } catch { /* ignore */ }
    finally { setSavingShare(false) }
  }

  const handleEditLevelChange = async (newEditLevel: string) => {
    setEditLevel(newEditLevel)
    setSavingShare(true)
    try {
      const updated = await api.decks.update(deckId, { edit_level: newEditLevel })
      if (updated) setDeck(updated)
    } catch { /* ignore */ }
    finally { setSavingShare(false) }
  }

  const handleAddCards = async (cardIds: number[]) => {
    if (cardIds.length === 0) return
    try {
      await api.decks.addCards(deckId, cardIds)
      await loadDeck()
    } catch { /* ignore */ }
  }

  const handleRemoveCard = async (cardId: number) => {
    setRemoving(true)
    try {
      if (playingCardId === cardId) {
        previewAudioRef.current?.pause()
        previewAudioRef.current = null
        setPlayingCardId(null)
      }
      await api.decks.removeCard(deckId, cardId)
      setCards(prev => prev.filter(c => c.id !== cardId))
      setRemoveCardId(null)
      if (deck) setDeck({ ...deck, card_count: deck.card_count - 1 })
    } catch { /* ignore */ }
    finally { setRemoving(false) }
  }

  const [showCloneOptions, setShowCloneOptions] = useState(false)

  const handleClone = async (mode: 'full' | 'covers_only') => {
    setCloning(true)
    setShowCloneOptions(false)
    try {
      await api.decks.clone(deckId, mode)
      navigate('/decks')
    } catch { /* ignore */ }
    finally { setCloning(false) }
  }

  const handleDeleteDeck = async () => {
    setDeletingDeck(true)
    try {
      await api.decks.delete(deckId)
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败 (；′⌒`)')
      setShowDeleteDeck(false)
    } finally {
      setDeletingDeck(false)
    }
  }

  const handleExport = async () => {
    if (cards.length === 0) return
    setExporting(true)
    try {
      // 动态导入 JSZip（前端不预加载大库）
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]
        if (!card.cover_url) continue
        try {
          const resp = await fetch(card.cover_url)
          if (!resp.ok) continue
          const blob = await resp.blob()
          const ext = card.cover_url.split('.').pop() || 'jpg'
          const name = `${String(i + 1).padStart(3, '0')}_${card.display_text || 'card'}.${ext}`
          zip.file(name.replace(/[/\\:*?"<>|]/g, '_'), blob)
        } catch { /* skip failed */ }
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `${deck?.name || 'deck'}_牌面.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
    finally { setExporting(false) }
  }

  const handleBatchRemove = async () => {
    if (selectedCards.size === 0) return
    setBatchRemoving(true)
    try {
      for (const cardId of selectedCards) {
        await api.decks.removeCard(deckId, cardId)
      }
      setCards(prev => prev.filter(c => !selectedCards.has(c.id)))
      if (deck) setDeck({ ...deck, card_count: deck.card_count - selectedCards.size })
      setSelectedCards(new Set())
      setSelectMode(false)
    } catch { /* ignore */ }
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

  const SHARE_LABELS: Record<string, string> = {
    private: '🔒 私有',
    playable: '🎮 可使用',
    editable: '✏️ 可编辑',
  }

  const EDIT_LABELS: Record<string, string> = {
    add_only: '仅添加',
    full: '完全编辑',
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* Header with decorative gradient */}
        <div className="relative mb-6 overflow-hidden rounded-2xl p-5"
          style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.4) 0%, rgba(var(--accent-bg-mid),0.8) 50%, rgba(var(--accent-bg-end),0.4) 100%)', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
          <div className="absolute top-0 right-0 w-28 h-28 opacity-10 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(var(--glow-color),0.8), transparent 70%)' }} />
          <div className="flex items-start justify-between gap-4 relative">
            <div className="flex items-start gap-3 min-w-0">
              <button onClick={() => navigate('/')}
                className="text-pink-300/50 hover:text-gold transition-all duration-200 text-sm mt-1 shrink-0 hover:scale-110">
                ← 撤退
              </button>

              {loading ? (
                <div className="text-pink-300/50 animate-pulse font-serif">～ 解封战阵中 ～ ♪</div>
              ) : deck && (
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="font-serif text-xl text-gold font-bold truncate tracking-wide">{deck.name}</h1>
                    {isOwner && (
                      <button onClick={startEdit}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-all shrink-0"
                        style={{ background: 'rgba(var(--accent-primary),0.1)', border: '1px solid rgba(var(--accent-primary),0.3)', color: 'var(--color-gold)' }}>
                        ✏️ 修改
                      </button>
                    )}
                  </div>
                  <p className="text-pink-300/50 text-xs mt-1 truncate font-serif italic">
                    {deck.description || '尚无铭文…'} · {deck.card_count} 张歌牌
                  </p>
                </div>
              )}
            </div>

            {!loading && deck && (
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                <button onClick={() => navigate(`/rooms/new?deck_id=${deckId}`)}
                  className="btn-gold text-sm transition-all duration-200 hover:scale-105 shadow-lg shadow-gold/20">
                  ⚔️ 出阵！
                </button>
                <button onClick={handleExport} disabled={exporting || cards.length === 0}
                  className="btn-outline text-sm px-3 transition-all duration-200 hover:scale-105 disabled:opacity-50"
                  title="下载所有牌面封面图的压缩包">
                  {exporting ? '打包中…' : '🗡️ 线下决斗'}
                </button>
                <button onClick={() => setShowCloneOptions(true)} disabled={cloning}
                  className="btn-outline text-sm px-3 transition-all duration-200 hover:scale-105 disabled:opacity-50">
                  {cloning ? '复制中…' : '📋 复制'}
                </button>
                {isOwner && (
                  <button onClick={() => setShowDeleteDeck(true)}
                    className="text-xs px-3 py-2 rounded-lg transition-all duration-200 hover:scale-105"
                    style={{ background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)', color: 'rgba(192,57,43,0.8)' }}>
                    🗑️
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Share settings (owner only) */}
        {!loading && deck && isOwner && (
          <div className="flex items-center gap-3 mb-6 flex-wrap rounded-xl px-4 py-3"
            style={{ background: 'rgba(var(--accent-bg-end),0.4)', border: '1px solid rgba(var(--accent-primary),0.08)' }}>
            <span className="text-pink-300/50 text-xs font-serif">✦ 共享结界：</span>
            <div className="flex gap-1.5">
              {Object.entries(SHARE_LABELS).map(([key, label]) => (
                <button key={key}
                  onClick={() => handleShareChange(key)}
                  disabled={savingShare}
                  className={`text-xs px-3 py-1.5 rounded-full transition-all ${
                    shareLevel === key
                      ? 'bg-gradient-to-r from-gold/25 to-pink-500/15 text-gold border border-gold/40'
                      : 'bg-white/5 text-white/40 border border-white/5 hover:border-pink-300/20 hover:text-pink-300/70'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            {shareLevel === 'editable' && (
              <>
                <span className="text-pink-300/50 text-xs ml-2 font-serif">编辑权限：</span>
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

        {error && (
          <div className="text-crimson text-center py-12">
            {error}
            <button onClick={loadDeck} className="block mx-auto mt-2 text-sm underline hover:text-gold transition-colors">再试一次！(ง •̀_•́)ง</button>
          </div>
        )}

        {/* Card list */}
        {!loading && !error && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-pink-300/50 text-xs tracking-widest font-serif">🎵 战阵曲目 ({cards.length} 张)</h2>
              <div className="flex items-center gap-2">
                {canRemove && cards.length > 0 && !selectMode && (
                  <button onClick={() => setSelectMode(true)}
                    className="text-xs px-3 py-1.5 rounded-full text-muted/60 hover:text-gold transition-all hover:bg-gold/5"
                    style={{ border: '1px solid rgba(var(--accent-primary),0.15)' }}>
                    ☑ 编辑
                  </button>
                )}
                {canAdd && !selectMode && (
                  <button onClick={() => setShowPicker(true)}
                    className="btn-gold text-xs transition-all duration-200 hover:scale-105 shadow-lg shadow-gold/20">
                    ➕ 召唤歌牌
                  </button>
                )}
              </div>
            </div>

            {/* 多选模式工具栏 */}
            {selectMode && (
              <div className="mb-3 flex items-center justify-between px-4 py-2.5 rounded-xl"
                style={{ background: 'rgba(var(--accent-primary),0.08)', border: '1px solid rgba(var(--accent-primary),0.2)' }}>
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
                    style={{ background: 'rgba(var(--accent-primary),0.15)', border: '1px solid rgba(var(--accent-primary),0.3)', color: 'var(--color-gold)' }}>
                    {batchRemoving ? '移除中…' : `移除选中`}
                  </button>
                  <button onClick={() => { setSelectMode(false); setSelectedCards(new Set()) }}
                    className="text-xs px-3 py-1.5 rounded-lg text-muted hover:text-white transition-colors"
                    style={{ border: '1px solid rgba(var(--accent-primary),0.1)' }}>
                    完成
                  </button>
                </div>
              </div>
            )}

            {cards.length === 0 ? (
              <div className="text-center py-16 rounded-2xl"
                style={{ background: 'linear-gradient(160deg, rgba(var(--accent-bg-end),0.5), rgba(var(--accent-bg-mid),0.8))', border: '1px dashed rgba(var(--accent-primary),0.2)' }}>
                <div className="text-5xl mb-3">🌸</div>
                <p className="text-gold text-sm font-serif mb-1">战阵尚无一牌…</p>
                <p className="text-pink-300/40 text-xs mb-4 font-serif">{canAdd ? '从牌库召唤歌牌，铸就你的最强阵容！✧' : '此阵尚空 (◕‿◕✿)'}</p>
                {canAdd && (
                  <button onClick={() => setShowPicker(true)}
                    className="btn-gold text-sm transition-all duration-200 hover:scale-105 shadow-lg shadow-gold/20">
                    ➕ 召唤歌牌
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence>
                  {cards.map((card, i) => (
                    <motion.div key={card.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ delay: i * 0.02 }}
                      className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3 group hover:border-gold/20 transition-colors">
                      {/* Multi-select checkbox */}
                      {selectMode && (
                        <div onClick={() => toggleSelect(card.id)}
                          className={`w-5 h-5 rounded-full shrink-0 cursor-pointer flex items-center justify-center transition-all ${
                            selectedCards.has(card.id)
                              ? 'bg-gold text-ink scale-110'
                              : 'border-2 border-muted/30 hover:border-gold/50'
                          }`}>
                          {selectedCards.has(card.id) && <span className="text-xs font-bold">✓</span>}
                        </div>
                      )}
                      {/* Cover (clickable → card detail) */}
                      <div onClick={() => !selectMode && navigate(`/cards/${card.id}`)}
                        className="w-10 h-14 rounded shrink-0 overflow-hidden flex items-center justify-center cursor-pointer hover:ring-1 hover:ring-gold/30 transition-all"
                        style={{ background: 'var(--color-ink-deep)', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
                        {card.cover_url ? (
                          <img src={card.cover_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-gold/20 font-serif text-sm">歌</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/cards/${card.id}`)}>
                        <p className="font-sans text-white/80 text-sm truncate hover:text-gold transition-colors">
                          {card.display_text && card.display_text !== '—' ? card.display_text : (
                            <span className="text-muted italic text-xs">未命名</span>
                          )}
                        </p>
                        {card.series && (
                          <p className="text-muted text-xs truncate mt-0.5">📺 {card.series}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-gold/40 text-xs">♪×{card.audio_count ?? 1}</span>
                          {card.tags && (
                            <span className="text-muted/60 text-xs">🏷️ {card.tags}</span>
                          )}
                        </div>
                      </div>

                      {/* Play */}
                      <button onClick={() => togglePlay(card)}
                        className="text-gold/60 hover:text-gold text-sm px-2 py-1 rounded hover:bg-gold/10 transition-all shrink-0"
                        title={playingCardId === card.id ? '暂停' : '播放预览'}>
                        {playingCardId === card.id ? '⏸' : '▶'}
                      </button>

                      {/* Remove from deck */}
                      {canRemove && (
                        <button onClick={() => setRemoveCardId(card.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-crimson text-xs px-2 py-1 rounded hover:bg-crimson/10">
                          移除
                        </button>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Picker */}
      {/* Clone options dialog */}
      <AnimatePresence>
        {showCloneOptions && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowCloneOptions(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-xs rounded-2xl p-5"
              style={{ background: 'linear-gradient(160deg, var(--color-ink), var(--color-ink-deep))', border: '1px solid rgba(var(--accent-primary),0.2)' }}
              onClick={e => e.stopPropagation()}>
              <h3 className="font-serif text-gold text-base mb-1">📋 复制战阵</h3>
              <p className="text-pink-300/40 text-xs font-serif mb-4">选择复制方式 ✧</p>
              <div className="space-y-2">
                <button onClick={() => handleClone('full')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:scale-[1.02]"
                  style={{ background: 'rgba(var(--accent-primary),0.08)', border: '1px solid rgba(var(--accent-primary),0.2)' }}>
                  <span className="text-xl">🎵</span>
                  <div>
                    <p className="text-white/90 text-sm font-medium">复制牌面 + 歌曲</p>
                    <p className="text-muted text-xs">引用相同的牌，完整保留歌曲</p>
                  </div>
                </button>
                <button onClick={() => handleClone('covers_only')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:scale-[1.02]"
                  style={{ background: 'rgba(var(--accent-primary),0.05)', border: '1px solid rgba(var(--accent-primary),0.1)' }}>
                  <span className="text-xl">🖼️</span>
                  <div>
                    <p className="text-white/90 text-sm font-medium">只复制牌面</p>
                    <p className="text-muted text-xs">创建新牌只有封面，自行配歌</p>
                  </div>
                </button>
              </div>
              <button onClick={() => setShowCloneOptions(false)}
                className="w-full text-center text-muted text-xs mt-4 hover:text-white transition-colors">
                取消
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CardPicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleAddCards}
        excludeIds={cards.map(c => c.id)}
      />

      {/* Remove card confirm */}
      <AnimatePresence>
        {removeCardId !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setRemoveCardId(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-ink-deep border border-border rounded-xl p-6 w-full max-w-xs text-center"
              onClick={e => e.stopPropagation()}>
              <div className="text-3xl mb-3">📤</div>
              <p className="text-white font-medium mb-1">从牌组中移除这张牌？</p>
              <p className="text-muted text-sm mb-5">牌本身不会被删除，只是不再属于此牌组 (ᵔ◡ᵔ)</p>
              <div className="flex gap-3">
                <button onClick={() => setRemoveCardId(null)} className="btn-outline flex-1 text-sm">取消</button>
                <button onClick={() => handleRemoveCard(removeCardId)}
                  disabled={removing}
                  className="flex-1 px-4 py-2.5 rounded bg-crimson hover:bg-crimson-light text-white font-medium text-sm transition-all disabled:opacity-50">
                  {removing ? '移除中…' : '确认移除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete deck confirm */}
      <AnimatePresence>
        {showDeleteDeck && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setShowDeleteDeck(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ink-deep border border-border rounded-xl p-6 w-full max-w-xs text-center"
              onClick={e => e.stopPropagation()}>
              <div className="text-4xl mb-3">💣</div>
              <p className="text-white font-medium mb-1">真的要解散这个牌组吗？</p>
              <p className="text-muted text-sm mb-1">「{deck?.name}」将被删除！</p>
              <p className="text-muted/60 text-xs mb-5">（牌库里的牌不会被删除，只是解除绑定）</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteDeck(false)} className="btn-outline flex-1 text-sm">算了算了</button>
                <button onClick={handleDeleteDeck} disabled={deletingDeck}
                  className="flex-1 px-4 py-2.5 rounded bg-crimson hover:bg-crimson-light text-white font-medium text-sm transition-all disabled:opacity-50">
                  {deletingDeck ? '解散中…' : '狠心解散 (╥_╥)'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit name/desc dialog */}
      <AnimatePresence>
        {editingName && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setEditingName(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ink-deep border border-border rounded-xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}>
              <h3 className="font-serif text-gold text-lg font-medium mb-1">✏️ 修改牌组</h3>
              <p className="text-muted text-xs mb-5">改个更霸气的名字吧！(ง •̀_•́)ง</p>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-muted text-xs block mb-1.5">牌组名称 *</label>
                  <input type="text" value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingName(false) }}
                    className="input-dark" placeholder="牌组名称" autoFocus />
                </div>
                <div>
                  <label className="text-muted text-xs block mb-1.5">描述（选填）</label>
                  <input type="text" value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingName(false) }}
                    className="input-dark" placeholder="描述（选填）" />
                </div>
                <div className="flex gap-3 mt-1">
                  <button onClick={() => setEditingName(false)} className="btn-outline flex-1 text-sm">算了</button>
                  <button onClick={saveEdit} disabled={savingName || !editName.trim()}
                    className="btn-gold flex-1 text-sm disabled:opacity-50">
                    {savingName ? '保存中…' : '✓ 搞定！'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}
